#!/usr/bin/env python3
"""Dumps the receiver's MySQL database to the backup disk and copies the dump to B2."""
import fcntl
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

NETWORK = "poe-ingest-dev_default"
MYSQL_IMAGE = "mysql:8.4"
RCLONE_IMAGE = "rclone/rclone:1.76.0"
NAME_FORMAT = "%Y%m%dT%H%M%SZ"
DONE_FILE = "@.done.json"
KEEP_LOCAL = 7
KEEP_REMOTE_DAYS = 30
REMOTE_FOLDER = "mysql"


def run(args, directory, stdin=None):
    result = subprocess.run(
        args, cwd=directory, input=stdin, text=True, capture_output=True,
        check=True, timeout=7200,
    )
    return result.stdout.strip(), result.stderr.strip()


def read_env(path):
    values = {}
    for line in path.read_text().splitlines():
        name, separator, value = line.partition("=")
        if separator and not name.lstrip().startswith("#"):
            values[name.strip()] = value.strip()
    return values


def dump(directory, target, name):
    script = f'util.dumpSchemas(["poeboats"], "/dump/{name}", {{threads: 4, compression: "zstd"}})'
    password = (directory / "secrets" / "mysql_root_password").read_text().strip()
    try:
        _, progress = run([
            "docker", "run", "--rm", "-i", "--network", NETWORK, "--user", "1000:1000",
            "--env", "HOME=/tmp", "--volume", f"{target}:/dump", MYSQL_IMAGE,
            "mysqlsh", "--uri", "mysql://root@mysql:3306", "--passwords-from-stdin", "--js",
            "--execute", script,
        ], directory, stdin=password + "\n")
        if not (target / name / DONE_FILE).is_file():
            raise RuntimeError(f"{name}: MySQL Shell finished without writing {DONE_FILE}")
        # MySQL Shell ends its progress output with a summary: duration, sizes and rows written.
        for line in progress.splitlines()[-8:]:
            print(line, flush=True)
    except BaseException:
        shutil.rmtree(target / name, ignore_errors=True)
        raise


def expired_local(target, keep):
    """Dumps beyond the newest `keep` complete ones, and any dump that never completed."""
    dumps = sorted((path for path in target.iterdir() if path.is_dir()), key=lambda path: path.name)
    complete = [path for path in dumps if (path / DONE_FILE).is_file()]
    return [path for path in dumps if path not in complete] + complete[:-keep]


def expired_remote(names, now, days):
    cutoff = now - timedelta(days=days)
    expired = []
    for name in names:
        try:
            taken = datetime.strptime(name, NAME_FORMAT).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if taken < cutoff:
            expired.append(name)
    return expired


def rclone(directory, target, credentials, *args):
    with tempfile.NamedTemporaryFile("w", dir=directory / "secrets", suffix=".env") as env_file:
        env_file.write(credentials)
        env_file.flush()
        output, _ = run([
            "docker", "run", "--rm", "--user", "1000:1000", "--env", "HOME=/tmp",
            "--env-file", env_file.name, "--volume", f"{target}:/dump:ro", RCLONE_IMAGE, *args,
        ], directory)
        return output


def backup(directory, now):
    target = directory / "backups" / "mysql"
    target.mkdir(parents=True, exist_ok=True)
    name = now.strftime(NAME_FORMAT)
    dump(directory, target, name)
    size = sum(path.stat().st_size for path in (target / name).rglob("*") if path.is_file())
    print(f"Dumped {name}: {size / 1e9:.2f} GB", flush=True)

    env = read_env(directory / "config" / "pc.env")
    key = (directory / "secrets" / "pc_b2_application_key").read_text().strip()
    credentials = "\n".join([
        "RCLONE_CONFIG_B2_TYPE=b2",
        f"RCLONE_CONFIG_B2_ACCOUNT={env['B2_KEY_ID']}",
        f"RCLONE_CONFIG_B2_KEY={key}",
        "RCLONE_CONFIG_B2_HARD_DELETE=true",
    ]) + "\n"
    remote = f"b2:{env['B2_BUCKET']}/{REMOTE_FOLDER}"
    rclone(directory, target, credentials, "copy", f"/dump/{name}", f"{remote}/{name}")
    print(f"Uploaded {name} to B2", flush=True)

    for path in expired_local(target, KEEP_LOCAL):
        shutil.rmtree(path)
        print(f"Removed local dump {path.name}", flush=True)
    listed = rclone(directory, target, credentials, "lsf", "--dirs-only", f"{remote}/")
    for old in expired_remote([line.rstrip("/") for line in listed.splitlines()], now, KEEP_REMOTE_DAYS):
        rclone(directory, target, credentials, "purge", f"{remote}/{old}")
        print(f"Removed B2 dump {old}", flush=True)


def main():
    directory = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent).resolve()
    with (directory / ".backup-mysql.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another backup is running")
            return
        backup(directory, datetime.now(timezone.utc))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Backup failed: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
