import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import update


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        (self.directory / "enabled").touch()
        for service in update.SERVICES:
            data = self.directory / "data" / service
            data.mkdir(parents=True)
            (data / "market.duckdb").write_bytes(b"saved cursor and observations")
        self.old = f"{update.IMAGE}@sha256:old"
        self.new = f"{update.IMAGE}@sha256:new"
        self.state = self.directory / "deployment.json"
        self.state.write_text(json.dumps({"image": self.old}))
        self.commands = []

    def docker(self, args, directory, env=None):
        self.commands.append((args, env))
        if "{{json .RepoDigests}}" in args:
            return json.dumps(["unrelated/image@sha256:other", self.new])
        if "{{.Id}}" in args:
            return "sha256:config"
        return ""

    def test_disabled_deployment_never_contacts_docker(self):
        (self.directory / "enabled").unlink()
        with patch.object(update, "run") as run:
            update.update(self.directory)
        run.assert_not_called()

    def test_missing_database_cannot_start_a_fresh_worker(self):
        (self.directory / "data" / "pc" / "market.duckdb").unlink()
        with patch.object(update, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "existing worker database"):
                update.update(self.directory)
        run.assert_not_called()

    def test_pull_failure_preserves_running_deployment(self):
        with patch.object(update, "run", side_effect=subprocess.CalledProcessError(1, "docker pull")) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                update.update(self.directory)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(json.loads(self.state.read_text())["image"], self.old)

    def test_same_digest_does_not_restart_workers(self):
        self.new = self.old
        with patch.object(update, "run", side_effect=self.docker):
            update.update(self.directory)
        self.assertFalse(any("compose" in args for args, _ in self.commands))

    def test_new_image_is_pinned_and_data_is_preserved(self):
        with patch.object(update, "run", side_effect=self.docker):
            with patch.object(update, "verify_workers") as verify:
                update.update(self.directory)
        up = [(args, env) for args, env in self.commands if "up" in args]
        self.assertEqual(len(up), 1)
        self.assertEqual(up[0][1]["INGEST_IMAGE"], self.new)
        self.assertIn("--wait", up[0][0])
        verify.assert_called_once()
        state = json.loads(self.state.read_text())
        self.assertEqual(state["image"], self.new)
        self.assertEqual(state["previousImage"], self.old)
        for service in update.SERVICES:
            self.assertEqual((self.directory / "data" / service / "market.duckdb").read_bytes(), b"saved cursor and observations")
        self.assertFalse(any("down" in args or "prune" in args for args, _ in self.commands))

    def test_unhealthy_rollout_does_not_replace_last_successful_digest(self):
        with patch.object(update, "run", side_effect=self.docker):
            with patch.object(update, "verify_workers", side_effect=RuntimeError("receiver missing")):
                with self.assertRaisesRegex(RuntimeError, "receiver missing"):
                    update.update(self.directory)
        self.assertEqual(json.loads(self.state.read_text())["image"], self.old)

    def test_stale_status_and_previous_process_cannot_pass_verification(self):
        report = {"startedAt": 200_000, "lastSuccessAt": 250_000, "reportedAt": 290_000, "state": "idle", "failedStages": []}
        self.assertTrue(update.verified_report(report, 200_000, 300_000))
        self.assertFalse(update.verified_report(report, 210_000, 300_000))
        self.assertFalse(update.verified_report(report, 200_000, 500_000))
        self.assertFalse(update.verified_report({**report, "lastSuccessAt": None}, 200_000, 300_000))
        self.assertFalse(update.verified_report({**report, "failedStages": ["delivery"]}, 200_000, 300_000))

    def test_concurrent_invocation_does_not_deploy(self):
        with patch.object(update.sys, "argv", ["update.py", str(self.directory)]):
            with patch.object(update.fcntl, "flock", side_effect=BlockingIOError):
                with patch.object(update, "update") as deploy:
                    update.main()
        deploy.assert_not_called()

    def verify_fixture(self, remote_success=True, image="sha256:config", require_client_identity=False):
        reports = []
        for service in update.SERVICES:
            report = {"workerId": service, "startedAt": 200_000, "lastSuccessAt": 250_000, "reportedAt": 290_000, "state": "idle", "failedStages": []}
            (self.directory / "data" / service / "status.json").write_text(json.dumps(report))
            reports.append({**report, "lastSuccessAt": 250_000 if remote_success else None, "receivedAt": 290_000, "health": "idle"})
        response = io.BytesIO(json.dumps({"workers": reports}).encode())

        def inspect(args, *unused):
            if "inspect" in args:
                return f"{image} 1970-01-01T00:03:20.000000000Z"
            return "container-id"

        def receiver(request, **unused):
            if require_client_identity:
                agent = request.get_header("User-agent", "") if not isinstance(request, str) else ""
                if not agent.startswith("poe.boats-ingest-deploy/"):
                    raise HTTPError(update.STATUS_URL, 403, "Forbidden", {}, None)
            return response

        with patch.object(update, "run", side_effect=inspect):
            with patch.object(update, "urlopen", side_effect=receiver):
                with patch.object(update.time, "time", return_value=300):
                    with patch.object(update.time, "monotonic", side_effect=[0, 1, 601]):
                        with patch.object(update.time, "sleep"):
                            update.verify_workers(self.directory, ["docker", "compose"], {}, "sha256:config")

    def test_verification_requires_success_seen_by_the_receiver(self):
        with self.assertRaisesRegex(RuntimeError, "receiver has not confirmed"):
            self.verify_fixture(remote_success=False)
        self.verify_fixture()

    def test_wrong_running_image_cannot_pass_verification(self):
        with self.assertRaisesRegex(RuntimeError, "selected digest"):
            self.verify_fixture(image="sha256:old")

    def test_receiver_request_identifies_the_deployment_monitor(self):
        self.verify_fixture(require_client_identity=True)


if __name__ == "__main__":
    unittest.main()
