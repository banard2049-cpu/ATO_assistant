"""Attachment storage regressions using disposable accounts and an isolated PHP API."""
import base64
import hashlib
import unittest
import test_lan_account_guard as fixtures


PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII='
DATA_URL = 'data:image/png;base64,' + PNG


class AttachmentTest(unittest.TestCase):
    setUpClass = classmethod(fixtures.AccountGuardTest.setUpClass.__func__)
    cleanup_files = classmethod(fixtures.AccountGuardTest.cleanup_files.__func__)
    stop_server = classmethod(fixtures.AccountGuardTest.stop_server.__func__)
    request = classmethod(fixtures.AccountGuardTest.request.__func__)

    def login(self, account='audit_alpha'):
        status, _ = self.request('?action=login', {'username': account, 'password': 'fixture-only'})
        self.assertEqual(status, 200)

    def upload(self, data=DATA_URL, account='audit_alpha'):
        return self.request('?action=record-attachment', {'dataUrl': data, 'expectedAccountId': account})

    def read_image(self, blob_id, account='audit_alpha'):
        return self.request(f'?action=record-attachment&id={blob_id}&expectedAccountId={account}')

    def test_round_trip_and_reference_removal_preserve_backup_images(self):
        self.login()
        status, payload = self.upload()
        self.assertEqual(status, 200)
        item = payload['attachment']
        expected = hashlib.sha256(base64.b64decode(PNG)).hexdigest()
        self.assertEqual(item['blobId'], expected)
        self.assertEqual((item['width'], item['height']), (1, 1))
        self.assertEqual(self.upload()[1]['attachment'], item)
        self.assertEqual(self.read_image(expected)[1]['dataUrl'], DATA_URL)
        state = {'cycle': 'c2', 'cycleStats': {'c2': {'notes': '截图笔记', 'noteAttachments': {'one': item}}}}
        self.assertEqual(self.request(payload={'section': 'record', 'state': state, 'userId': 'default', 'expectedAccountId': 'audit_alpha'})[0], 200)
        saved = self.request('?section=record')[1]['state']['users']['default']
        self.assertEqual(saved, state)
        self.assertNotIn('data:image', str(saved))
        state['cycleStats']['c2']['noteAttachments'] = {}
        self.assertEqual(self.request(payload={'section': 'record', 'state': state, 'userId': 'default', 'expectedAccountId': 'audit_alpha'})[0], 200)
        self.assertEqual(self.read_image(expected)[1]['dataUrl'], DATA_URL)
        blobs = list((self.root / 'data/record-attachments/audit_alpha').glob('*.json'))
        self.assertEqual(len(blobs), 1)

    def test_account_isolation_and_changed_login_guard(self):
        self.login()
        blob_id = self.upload()[1]['attachment']['blobId']
        self.login('audit_bravo')
        self.assertEqual(self.upload()[0], 409)
        self.assertEqual(self.read_image(blob_id)[0], 409)
        self.assertEqual(self.read_image(blob_id, 'audit_bravo')[0], 404)
        self.assertEqual(self.upload(account='audit_bravo')[0], 200)
        self.assertEqual(self.read_image(blob_id, 'audit_bravo')[0], 200)
        self.request('?action=logout', {})
        self.assertEqual(self.read_image(blob_id)[0], 401)

    def test_rejects_non_images_large_images_and_path_traversal(self):
        self.login()
        for data in ['data:image/svg+xml;base64,' + PNG, 'data:image/jpeg;base64,' + PNG,
                     'data:image/png;base64,bm90LWFuLWltYWdl', 'data:image/png;base64,' + 'A' * (1024 * 1024 + 1)]:
            self.assertEqual(self.upload(data)[0], 400)
        self.assertEqual(self.read_image('../ato-users')[0], 400)
        self.assertEqual(self.upload(account='')[0], 409)


if __name__ == '__main__':
    unittest.main(verbosity=2)
