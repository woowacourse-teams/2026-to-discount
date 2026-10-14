import json
from pathlib import Path
import tempfile
import unittest

from sync_offers import sync


class OfferSyncTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.target = Path(self.directory.name) / 'export.json'
        self.before = b'[{"brand":"sample","platform":"baemin","rawText":"[sample]"}]'
        self.target.write_bytes(self.before)
        self.target.chmod(0o640)
        self.snapshot = json.dumps([{'brand': 'real', 'platform': 'baemin', 'amount': 4000}]).encode()

    def test_success_reloads_and_preserves_backup_and_permissions(self):
        calls = []

        def api(path, method='GET'):
            calls.append((path, method))
            return {'reloaded': 1, 'pushImmediateSent': 0} if method == 'POST' else [{'name': 'real'}]

        result = sync(self.snapshot, self.target, api)
        self.assertEqual(result['offers'], 1)
        self.assertEqual(self.target.read_bytes(), self.snapshot)
        self.assertEqual(self.target.with_name('export.before-sync.json').read_bytes(), self.before)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o640)
        self.assertEqual(calls, [('/api/reload', 'POST'), ('/api/brands', 'GET')])

    def test_invalid_source_never_changes_existing_file_or_calls_api(self):
        for content in [b'{', b'[]', b'{}', b'[{"name":"processed brands"}]',
                        b'[{"brand":"x","platform":"y","rawText":"[\uC0D8\uD50C]"}]']:
            with self.subTest(content=content), self.assertRaises(ValueError):
                sync(content, self.target, lambda *args: self.fail('Unexpected API request'))
            self.assertEqual(self.target.read_bytes(), self.before)

    def test_reload_or_response_failure_restores_file_and_reloads_previous_data(self):
        for failure in ['reload', 'brands']:
            reloads = []

            def api(path, method='GET'):
                if method == 'POST':
                    reloads.append(self.target.read_bytes())
                    if len(reloads) == 1 and failure == 'reload':
                        raise RuntimeError('reload failed')
                    return {'reloaded': 1}
                if len(reloads) == 1:
                    return []
                return [{'name': 'sample'}]

            with self.subTest(failure=failure), self.assertRaisesRegex(RuntimeError, 'previous development snapshot restored'):
                sync(self.snapshot, self.target, api)
            self.assertEqual(self.target.read_bytes(), self.before)
            self.assertEqual(reloads, [self.snapshot, self.before])

    def test_rollback_reload_failure_is_reported_separately(self):
        def api(*args):
            raise RuntimeError('API unavailable')

        with self.assertRaisesRegex(RuntimeError, 'rollback reload failed'):
            sync(self.snapshot, self.target, api)
        self.assertEqual(self.target.read_bytes(), self.before)

    def test_symlink_cannot_redirect_development_target(self):
        other = self.target.with_name('other.json')
        other.write_bytes(self.before)
        self.target.unlink()
        self.target.symlink_to(other)
        with self.assertRaisesRegex(ValueError, 'regular file'):
            sync(self.snapshot, self.target)
        self.assertEqual(other.read_bytes(), self.before)


if __name__ == '__main__':
    unittest.main()
