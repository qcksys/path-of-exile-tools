from datetime import datetime, timezone
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import backup_mysql

NOW = datetime(2026, 11, 25, 18, 30, tzinfo=timezone.utc)
NAME = "20261125T183000Z"


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        (self.directory / "secrets").mkdir()
        (self.directory / "config").mkdir()
        (self.directory / "secrets" / "mysql_root_password").write_text("root-password\n")
        (self.directory / "secrets" / "pc_b2_application_key").write_text("b2-key\n")
        (self.directory / "config" / "pc.env").write_text(
            "# PC worker\nB2_KEY_ID=key-id\nB2_BUCKET=bucket\nB2_PREFIX=psapi/pc/\n"
        )
        self.target = self.directory / "backups" / "mysql"
        self.commands = []
        self.env_files = []
        self.remote = ""

    def docker(self, args, directory, stdin=None):
        self.commands.append((args, stdin))
        if "--env-file" in args:
            self.env_files.append(Path(args[args.index("--env-file") + 1]).read_text())
        if "mysqlsh" in args:
            dump = self.target / NAME
            (dump / "poeboats").mkdir(parents=True)
            (dump / "poeboats" / "chunk.zst").write_bytes(b"rows")
            (dump / backup_mysql.DONE_FILE).write_text("{}")
            return "", "Rows written: 3"
        if "lsf" in args:
            return self.remote, ""
        return "", ""

    def complete(self, name):
        (self.target / name).mkdir(parents=True)
        (self.target / name / backup_mysql.DONE_FILE).write_text("{}")

    def test_dumps_uploads_and_keeps_the_newest_week(self):
        for day in range(15, 25):
            self.complete(f"202611{day}T183000Z")
        (self.target / "20261124T190000Z").mkdir()
        self.remote = "20261020T183000Z/\n20261030T183000Z/\nnotes/\n"
        with patch.object(backup_mysql, "run", side_effect=self.docker):
            backup_mysql.backup(self.directory, NOW)

        dump_args, password = self.commands[0]
        self.assertIn("mysqlsh", dump_args)
        self.assertEqual(password, "root-password\n")
        self.assertIn(f"{self.target}:/dump", dump_args)
        self.assertIn(f'"/dump/{NAME}"', dump_args[-1])
        copy = self.commands[1][0]
        self.assertEqual(copy[-3:], ["copy", f"/dump/{NAME}", f"b2:bucket/mysql/{NAME}"])
        self.assertEqual(self.commands[3][0][-2:], ["purge", "b2:bucket/mysql/20261020T183000Z"])
        self.assertEqual(len(self.commands), 4)
        self.assertEqual(
            sorted(path.name for path in self.target.iterdir()),
            [f"202611{day}T183000Z" for day in range(19, 26)],
        )
        self.assertIn("RCLONE_CONFIG_B2_KEY=b2-key", self.env_files[0])
        self.assertIn("RCLONE_CONFIG_B2_ACCOUNT=key-id", self.env_files[0])
        self.assertEqual(list((self.directory / "secrets").glob("*.env")), [])

    def test_credentials_never_appear_in_commands(self):
        with patch.object(backup_mysql, "run", side_effect=self.docker):
            backup_mysql.backup(self.directory, NOW)
        for args, _ in self.commands:
            self.assertFalse(any("root-password" in arg or "b2-key" in arg for arg in args))

    def test_a_failed_dump_is_removed_and_nothing_is_uploaded(self):
        def fail(args, directory, stdin=None):
            self.commands.append((args, stdin))
            (self.target / NAME).mkdir(parents=True)
            raise subprocess.CalledProcessError(1, args, stderr="access denied")

        with patch.object(backup_mysql, "run", side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError):
                backup_mysql.backup(self.directory, NOW)
        self.assertEqual(len(self.commands), 1)
        self.assertFalse((self.target / NAME).exists())

    def test_a_dump_without_its_done_file_fails(self):
        def unfinished(args, directory, stdin=None):
            (self.target / NAME).mkdir(parents=True)
            return "", ""

        with patch.object(backup_mysql, "run", side_effect=unfinished):
            with self.assertRaisesRegex(RuntimeError, "without writing"):
                backup_mysql.backup(self.directory, NOW)
        self.assertFalse((self.target / NAME).exists())

    def test_remote_expiry_ignores_names_that_are_not_dumps(self):
        names = ["20261025T183000Z", "20261026T183000Z", "notes", "20261124T183000Z"]
        self.assertEqual(backup_mysql.expired_remote(names, NOW, 30), ["20261025T183000Z"])


if __name__ == "__main__":
    unittest.main()
