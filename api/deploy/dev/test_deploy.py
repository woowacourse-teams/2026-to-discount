import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / 'app'
        (self.root / 'releases').mkdir(parents=True)
        self.source = Path(self.temp.name).resolve() / 'runner' / 'artifact'
        self.source.mkdir(parents=True)
        self.sha = 'a' * 40
        (self.source / 'app.jar').write_bytes(b'test jar')
        digest = hashlib.sha256(b'test jar').hexdigest()
        self.manifest = dict(commit=self.sha, run_id='1', run_attempt='1', ref='refs/heads/dev',
                             repository='woowacourse-teams/2026-to-discount', sha256=digest)
        (self.source / 'manifest.json').write_text(json.dumps(self.manifest))
        (self.source / 'app.jar.sha256').write_text(f'{digest}  app.jar\n')
        self.addCleanup(patch.stopall)
        patch.object(deploy, 'ROOT', self.root).start()
        patch.object(deploy, 'ARTIFACT_ROOT', self.source.parent).start()
        patch.object(deploy.sys, 'argv', ['deploy', str(self.source), self.sha, '1', '1']).start()
        self.run = patch.object(deploy.subprocess, 'run').start()

    def test_success_publishes_version_after_readiness(self):
        with patch.object(deploy, 'wait_ready', return_value=True):
            deploy.main()
        self.assertTrue((self.root / 'current.jar').is_file())
        self.assertEqual(json.loads((self.root / 'deployment.json').read_text())['commit'], self.sha)

    def test_corrupt_jar_never_restarts_service(self):
        (self.source / 'app.jar').write_bytes(b'corrupted')
        with self.assertRaises(SystemExit):
            deploy.main()
        self.run.assert_not_called()

    def test_wrong_build_identity_never_restarts_service(self):
        self.manifest['run_id'] = '2'
        (self.source / 'manifest.json').write_text(json.dumps(self.manifest))
        with self.assertRaises(SystemExit):
            deploy.main()
        self.run.assert_not_called()

    def test_failure_restores_previous_release_and_status(self):
        old = self.root / 'releases' / 'old.jar'
        old.write_bytes(b'old')
        (self.root / 'current.jar').symlink_to(old)
        (self.root / 'deployment.json').write_text('old status')
        with patch.object(deploy, 'wait_ready', side_effect=[False, True]):
            with self.assertRaises(SystemExit):
                deploy.main()
        self.assertEqual((self.root / 'current.jar').resolve(), old)
        self.assertEqual((self.root / 'deployment.json').read_text(), 'old status')

    def test_first_failure_stops_service_and_removes_pointer(self):
        with patch.object(deploy, 'wait_ready', return_value=False):
            with self.assertRaises(SystemExit):
                deploy.main()
        self.assertFalse((self.root / 'current.jar').exists())
        self.run.assert_called_with(['systemctl', 'stop', deploy.SERVICE], check=True)


if __name__ == '__main__':
    unittest.main()
