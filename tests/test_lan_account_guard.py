"""Run with: python tests/test_lan_account_guard.py (requires PHP on PATH).

Uses a loopback-only server, copied API, and disposable synthetic accounts.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import unittest
import urllib.error
import urllib.request
import uuid


class AccountGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        php = shutil.which('php')
        if not php:
            raise unittest.SkipTest('PHP is not installed')
        source = Path(__file__).resolve().parents[1]
        cls.temp_parent = source / 'tmp'
        cls.temp_parent.mkdir(exist_ok=True)
        cls.root = cls.temp_parent / ('lan-account-test-' + uuid.uuid4().hex)
        cls.root.mkdir()
        (cls.root / 'api').mkdir()
        (cls.root / 'data' / 'sessions').mkdir(parents=True)
        shutil.copyfile(source / 'api' / 'campaign-state.php', cls.root / 'api' / 'campaign-state.php')
        cls.addClassCleanup(cls.cleanup_files)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.log = (cls.root / 'server.log').open('w')
        cls.addClassCleanup(cls.log.close)
        cls.process = subprocess.Popen(
            [php, '-S', f'127.0.0.1:{port}', '-t', str(cls.root)],
            stdout=cls.log, stderr=cls.log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        cls.addClassCleanup(cls.stop_server)
        cls.client = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        cls.url = f'http://127.0.0.1:{port}/api/campaign-state.php'
        for _ in range(50):
            try:
                cls.request('?action=me')
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Isolated PHP server did not start')
        for account in ['audit_alpha', 'audit_bravo']:
            cls.request('?action=register', {'username': account, 'password': 'fixture-only'})
            for section in ['map', 'record', 'technology', 'dashboard']:
                status, _ = cls.request(payload={
                    'section': section, 'userId': 'default', 'state': {'owner': account},
                    'expectedRevision': 0, 'expectedAccountId': account,
                })
                assert status == 200

    @classmethod
    def cleanup_files(cls):
        # Only the unique fixture immediately under this workspace's tmp/.
        resolved = cls.root.resolve()
        if resolved.parent != cls.temp_parent.resolve() or not resolved.name.startswith('lan-account-test-'):
            raise RuntimeError('Unexpected fixture cleanup target')
        shutil.rmtree(resolved)

    @classmethod
    def stop_server(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)

    @classmethod
    def request(cls, query='', payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(cls.url + query, data=data, headers={'Content-Type': 'application/json'})
        try:
            result = cls.client.open(request, timeout=4)
        except urllib.error.HTTPError as error:
            result = error
        with result:
            return result.status, json.load(result)

    def test_old_login_cannot_overwrite_current_login_with_equal_revision(self):
        for section in ['map', 'record', 'technology', 'dashboard']:
            with self.subTest(section=section):
                status, before = self.request('?section=' + section)
                self.assertEqual(status, 200)
                status, rejected = self.request(payload={
                    'section': section, 'userId': 'default', 'state': {'owner': 'audit_alpha'},
                    'expectedRevision': before['revision'], 'expectedAccountId': 'audit_alpha',
                })
                self.assertEqual(status, 409)
                self.assertEqual(rejected['code'], 'ACCOUNT_MISMATCH')
                _, after = self.request('?section=' + section)
                self.assertEqual(after['state'], before['state'])
                self.assertEqual(after['revision'], before['revision'])

    def test_matching_login_can_save(self):
        _, before = self.request('?section=map')
        status, saved = self.request(payload={
            'section': 'map', 'userId': 'default', 'state': {'owner': 'audit_bravo', 'position': 3},
            'expectedRevision': before['revision'], 'expectedAccountId': 'audit_bravo',
        })
        self.assertEqual(status, 200)
        self.assertEqual(saved['revision'], before['revision'] + 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
