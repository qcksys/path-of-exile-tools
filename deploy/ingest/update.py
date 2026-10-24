#!/usr/bin/env python3
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime
from urllib.request import Request, urlopen

IMAGE = "ghcr.io/qcksys/poe-stash-ingest"
STATUS_URL = "https://dev.poe.boats/api/v1/server/status"
SERVICES = ("pc", "poe2")


def run(args, directory, env=None):
    return subprocess.run(
        args, cwd=directory, env=env, text=True, capture_output=True,
        check=True, timeout=600,
    ).stdout.strip()


def verified_report(report, started_at, now):
    return (
        report.get("startedAt", 0) >= started_at
        and (report.get("lastSuccessAt") or 0) >= report.get("startedAt", 1)
        and now - report.get("reportedAt", 0) < 180_000
        and not report.get("failedStages", [])
        and report.get("state") in ("running", "idle")
    )


def verify_workers(directory, compose, env, image_id):
    started = {}
    for service in SERVICES:
        container = run([*compose, "ps", "--quiet", service], directory, env)
        if not container:
            raise RuntimeError(f"{service}: container is missing")
        actual_image, timestamp = run(
            ["docker", "inspect", "--format", "{{.Image}} {{.State.StartedAt}}", container],
            directory,
        ).split()
        if actual_image != image_id:
            raise RuntimeError(f"{service}: running image does not match the selected digest")
        started[service] = int(datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp() * 1000)

    deadline = time.monotonic() + 600
    reason = "Waiting for successful worker cycles and receiver heartbeats"
    while time.monotonic() < deadline:
        try:
            now = int(time.time() * 1000)
            local = [json.loads((directory / "data" / service / "status.json").read_text()) for service in SERVICES]
            if not all(verified_report(report, started[service], now) for service, report in zip(SERVICES, local)):
                raise ValueError("A worker has not completed a healthy cycle since starting")
            request = Request(STATUS_URL, headers={
                "User-Agent": "poe.boats-ingest-deploy/1.0 (+https://github.com/qcksys/path-of-exile-tools)",
            })
            with urlopen(request, timeout=60) as response:
                remote = {worker["workerId"]: worker for worker in json.load(response)["workers"]}
            for report in local:
                received = remote.get(report["workerId"], {})
                if not verified_report(received, report["startedAt"], now):
                    raise ValueError("The receiver has not confirmed the new worker's successful cycle")
                if received.get("health") not in ("running", "idle") or now - received.get("receivedAt", 0) >= 180_000:
                    raise ValueError("The receiver reports an unhealthy or stale worker")
            return
        except (OSError, ValueError, KeyError) as error:
            reason = str(error)
            time.sleep(15)
    raise RuntimeError(reason)


def update(directory):
    if not (directory / "enabled").is_file():
        print("Automatic deployment is disabled; create enabled after migrating the worker data.")
        return
    for service in SERVICES:
        database = directory / "data" / service / "market.duckdb"
        if not database.is_file() or database.stat().st_size == 0:
            raise RuntimeError(f"{service}: refusing to start without the existing worker database")

    print(f"Checking {IMAGE}:dev", flush=True)
    run(["docker", "pull", f"{IMAGE}:dev"], directory)
    digests = json.loads(run(["docker", "image", "inspect", f"{IMAGE}:dev", "--format", "{{json .RepoDigests}}"], directory))
    digest = next(value for value in digests if value.startswith(f"{IMAGE}@sha256:"))
    state_file = directory / "deployment.json"
    previous = json.loads(state_file.read_text()) if state_file.exists() else {}
    if previous.get("image") == digest:
        print(f"Already deployed {digest}")
        return

    env = {**os.environ, "INGEST_IMAGE": digest}
    compose = ["docker", "compose", "--file", str(directory / "compose.yaml")]
    run([*compose, "config", "--quiet"], directory, env)
    image_id = run(["docker", "image", "inspect", digest, "--format", "{{.Id}}"], directory)
    print(f"Deploying {digest}; existing data and secret files are retained", flush=True)
    run([*compose, "up", "--detach", "--wait", "--wait-timeout", "360", "--pull", "never"], directory, env)
    verify_workers(directory, compose, env, image_id)
    state = {"image": digest, "previousImage": previous.get("image"), "deployedAt": int(time.time())}
    temporary = directory / "deployment.json.tmp"
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    temporary.replace(state_file)
    print(f"Verified deployment {digest}", flush=True)


def main():
    directory = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent).resolve()
    with (directory / ".update.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another deployment is running")
            return
        update(directory)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Deployment failed: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
