"""PHP API hardening regressions (run with: python tests/test_php_api_hardening.py).

Requires PHP on PATH. Uses a loopback-only server, a copied API and disposable
synthetic accounts/data under tmp/ — the repository's real data/ is never touched.

Covers the defects confirmed by the adversarial review of api/campaign-state.php:
  1. data/ato-users.json had no lock, so concurrent register/login-hash-upgrade
     requests overwrote each other and permanently locked users out;
  2. expectedAccountId had three states (omitted/null/number/"" all meant
     different things) and "" produced a hard 409;
  3. the non-atomic copy() fallback rewrote the live save file in place;
  4. oversized POST bodies were answered with HTTP 200 + HTML + AUTH_REQUIRED;
  5. campaign_backup_component() truncated 71-80 char ids without a hash;
  6. session dirs were created world-accessible (verified by source, see below);
  7. ?action=second-screen handed out campaign content to anonymous callers;
  8. map-tile-tags.php rewrote the whole file from a whitelist of fields (dropping
     the per-tile factions/factionUpdatedAt and the per-definition cycles that the
     map page reads) and had no revision check, so two editor pages overwrote each
     other while both reported success;
  9. a full-campaign import was sent as one request per section, so a single failure
     left the save file mixing sections from two different archives.

It also covers the second-screen appearance that has to travel through the server:
the theme posted with ?action=second-screen-status comes back from
?action=second-screen, and partial settings updates never reset it.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import threading
import time
import unittest
import urllib.error
import urllib.request
import uuid


class HardeningTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        php = shutil.which('php')
        if not php:
            raise unittest.SkipTest('PHP is not installed')
        cls.php = php
        cls.source = Path(__file__).resolve().parents[1]
        cls.temp_parent = cls.source / 'tmp'
        cls.temp_parent.mkdir(exist_ok=True)
        cls.root = cls.temp_parent / ('php-hardening-' + uuid.uuid4().hex)
        (cls.root / 'api').mkdir(parents=True)
        (cls.root / 'data' / 'sessions').mkdir(parents=True)
        shutil.copyfile(cls.source / 'api' / 'campaign-state.php',
                        cls.root / 'api' / 'campaign-state.php')
        shutil.copyfile(cls.source / 'api' / 'map-tile-tags.php',
                        cls.root / 'api' / 'map-tile-tags.php')
        (cls.root / 'map').mkdir(parents=True)
        (cls.root / 'map' / 'map-tile-tags.js').write_text(cls.map_tags_fixture(), encoding='utf-8')
        cls.addClassCleanup(cls.cleanup_files)
        cls.processes = []
        cls.logs = []
        cls.ports = []
        for _ in range(2):
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            log = (cls.root / f'server-{port}.log').open('w')
            cls.logs.append(log)
            cls.processes.append(subprocess.Popen(
                [php, '-S', f'127.0.0.1:{port}', '-t', str(cls.root)],
                stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            ))
            cls.ports.append(port)
        cls.addClassCleanup(cls.stop_servers)
        for port in cls.ports:
            for _ in range(50):
                try:
                    cls.request(port, '?action=me')
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Isolated PHP server did not start')

    @classmethod
    def cleanup_files(cls):
        resolved = cls.root.resolve()
        if resolved.parent != cls.temp_parent.resolve() or not resolved.name.startswith('php-hardening-'):
            raise RuntimeError('Unexpected fixture cleanup target')
        shutil.rmtree(resolved, ignore_errors=True)

    @classmethod
    def stop_servers(cls):
        for process in cls.processes:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        for log in cls.logs:
            log.close()

    @classmethod
    def request(cls, port, query='', payload=None, opener=None, raw=None, timeout=60):
        if raw is None:
            raw = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(
            f'http://127.0.0.1:{port}/api/campaign-state.php' + query,
            data=raw, headers={'Content-Type': 'application/json'})
        client = opener or urllib.request.build_opener()
        try:
            result = client.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            result = error
        with result:
            return result.status, result.read().decode('utf-8', 'replace')

    @classmethod
    def json_request(cls, port, query='', payload=None, opener=None, raw=None):
        status, body = cls.request(port, query, payload, opener, raw)
        return status, json.loads(body)

    @classmethod
    def opener(cls):
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    @classmethod
    def users(cls):
        path = cls.root / 'data' / 'ato-users.json'
        return json.loads(path.read_text(encoding='utf-8'))['users'] if path.is_file() else {}

    def register(self, name, port=None, opener=None):
        return self.json_request(port or self.ports[0], '?action=register',
                                 {'username': name, 'password': 'fixture-only'}, opener=opener)

    # 1 ---------------------------------------------------------------------
    def test_concurrent_registrations_all_persist(self):
        before = set(self.users())
        names = [f'harden{i:02d}' for i in range(24)]
        outcomes = []
        lock = threading.Lock()

        def worker(name, port):
            status, body = self.register(name, port=port)
            with lock:
                outcomes.append((status, body.get('ok')))

        threads = [threading.Thread(target=worker, args=(name, self.ports[index % 2]))
                   for index, name in enumerate(names)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(outcomes, [(200, True)] * len(names))
        persisted = set(self.users())
        self.assertEqual(sorted(persisted - before), sorted(names),
                         'every registered account must survive the users-file write')
        for name in names:
            status, body = self.json_request(self.ports[0], '?action=login',
                                             {'username': name, 'password': 'fixture-only'})
            self.assertEqual((status, body['user']['id']), (200, name))

    def test_login_hash_upgrade_keeps_concurrently_registered_account(self):
        legacy_name = 'legacyplain' + uuid.uuid4().hex[:6]
        new_name = 'raced' + uuid.uuid4().hex[:6]
        users_file = self.root / 'data' / 'ato-users.json'
        store = json.loads(users_file.read_text(encoding='utf-8'))
        store['users'][legacy_name] = {
            'id': legacy_name, 'username': legacy_name,
            'password': 'fixture-only', 'createdAt': '2020-01-01T00:00:00Z',
        }
        users_file.write_text(json.dumps(store), encoding='utf-8')
        outcomes = []

        def upgrade():
            outcomes.append(self.json_request(self.ports[0], '?action=login',
                                              {'username': legacy_name, 'password': 'fixture-only'})[0])

        def register():
            outcomes.append(self.register(new_name, port=self.ports[1])[0])

        threads = [threading.Thread(target=upgrade), threading.Thread(target=register)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(sorted(outcomes), [200, 200])
        users = self.users()
        self.assertIn(new_name, users, 'the hash upgrade must not drop a concurrently registered account')
        self.assertIn(legacy_name, users)
        self.assertTrue(users[legacy_name]['passwordHash'].startswith('$'),
                        'the login must still upgrade the legacy plaintext password')
        self.assertNotIn('password', users[legacy_name])

    # 2 ---------------------------------------------------------------------
    def test_expected_account_id_is_two_valued(self):
        account = 'guarded' + uuid.uuid4().hex[:6]
        other = 'otherguard' + uuid.uuid4().hex[:6]
        client = self.opener()
        self.assertEqual(self.register(account, opener=client)[0], 200)
        self.assertEqual(self.register(other)[0], 200)
        for label, value in [('omitted', '<omit>'), ('null', None), ('number', 7),
                             ('empty string', ''), ('whitespace', '   ')]:
            with self.subTest(label=label):
                _, before = self.json_request(self.ports[0], '?section=map', opener=client)
                payload = {'section': 'map', 'state': {'label': label},
                           'expectedRevision': before['revision'], 'expectedAccountId': account}
                if value == '<omit>':
                    del payload['expectedAccountId']
                else:
                    payload['expectedAccountId'] = value
                status, body = self.json_request(self.ports[0], '', payload, opener=client)
                self.assertEqual(status, 200, body)
                self.assertEqual(body['revision'], before['revision'] + 1)
        _, before = self.json_request(self.ports[0], '?section=map', opener=client)
        status, body = self.json_request(self.ports[0], '', {
            'section': 'map', 'state': {'label': 'other'},
            'expectedRevision': before['revision'], 'expectedAccountId': other,
        }, opener=client)
        self.assertEqual((status, body['code']), (409, 'ACCOUNT_MISMATCH'))
        _, after = self.json_request(self.ports[0], '?section=map', opener=client)
        self.assertEqual(after['revision'], before['revision'])

    # 3 ---------------------------------------------------------------------
    @unittest.skipUnless(os.name == 'nt', 'the rename-over-open-file failure is Windows-only')
    def test_rename_failure_never_rewrites_the_live_save(self):
        account = 'renamelock' + uuid.uuid4().hex[:6]
        client = self.opener()
        self.assertEqual(self.register(account, opener=client)[0], 200)
        status, _ = self.json_request(self.ports[0], '', {
            'section': 'map', 'state': {'v': 1}, 'expectedRevision': 0}, opener=client)
        self.assertEqual(status, 200)
        save_file = self.root / 'data' / f'ato-campaign-{account}.json'
        before = save_file.read_bytes()
        # A plain reader handle blocks rename() on Windows but not copy(): the old
        # fallback rewrote the live file in place while this handle was open.
        holder = subprocess.Popen(
            [self.php, '-r', 'set_time_limit(0); $reader = fopen($argv[1], "r"); echo "held\n"; '
                             'fflush(STDOUT); sleep(4); rewind($reader); '
                             'echo str_contains((string) stream_get_contents($reader), \'"v": 2\') ? "2" : "1";',
             str(save_file)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            self.assertEqual(holder.stdout.readline().strip(), b'held')
            status, body = self.json_request(self.ports[0], '', {
                'section': 'map', 'state': {'v': 2}, 'expectedRevision': 1}, opener=client)
            self.assertEqual(status, 500, body)
            saw = holder.stdout.read().decode()
        finally:
            holder.wait(timeout=10)
        self.assertEqual(saw.strip(), '1', 'the open reader must keep seeing the previous save')
        self.assertEqual(save_file.read_bytes(), before, 'a failed rename must not touch the live file')
        self.assertFalse(list((self.root / 'data').glob('*.tmp')), 'no temp file may be left behind')

    # 4 ---------------------------------------------------------------------
    def test_oversized_body_is_a_413_json_error(self):
        account = 'bigbody' + uuid.uuid4().hex[:6]
        client = self.opener()
        self.assertEqual(self.register(account, opener=client)[0], 200)
        # Between maxBytes (6 MiB) and PHP's default post_max_size (8 MiB), so the
        # body actually reaches the script and the 413 must be a real JSON response.
        blob = b'{"section":"map","state":{"filler":"' + b'x' * (7 * 1024 * 1024) + b'"}}'
        status, body = self.json_request(self.ports[0], '', opener=client, raw=blob)
        self.assertEqual(status, 413, body)
        self.assertEqual(body['code'], 'PAYLOAD_TOO_LARGE')
        _, after = self.json_request(self.ports[0], '?section=map', opener=client)
        self.assertEqual(after['revision'], 0, 'the oversized save must not be stored')

    # 5 ---------------------------------------------------------------------
    def test_backup_component_hashes_every_truncated_value(self):
        source = (self.source / 'api' / 'campaign-state.php').read_text(encoding='utf-8')
        start = source.index('function campaign_backup_component(')
        function = source[start:source.index('\n}', start) + 2]
        script = (function + '\n'
                  '$values = [str_repeat("a", 70), str_repeat("a", 70) . "b", str_repeat("a", 70) . "c", '
                  'str_repeat("a", 128), "bad id!"];\n'
                  'foreach ($values as $value) { echo strlen($value), " ", campaign_backup_component($value), PHP_EOL; }')
        result = subprocess.run([self.php, '-r', script], capture_output=True, text=True,
                                encoding='utf-8', errors='replace')
        self.assertEqual(result.returncode, 0, result.stderr)
        components = {}
        for line in result.stdout.strip().splitlines():
            length, component = line.split(' ', 1)
            components.setdefault(int(length), []).append(component)
        # Two distinct 71 character ids must not share one backup directory.
        self.assertNotEqual(components[71][0], components[71][1])
        self.assertEqual(len({components[71][0], components[71][1], components[128][0]}), 3)
        self.assertLessEqual(len(components[128][0]), 79)
        for component in components[128]:
            self.assertRegex(component, r'^[A-Za-z0-9_-]+-[0-9a-f]{8}$', 'truncated values need a hash suffix')

    # 6 ---------------------------------------------------------------------
    def test_session_directories_are_not_world_writable(self):
        session_apis = ['campaign-state.php', 'bp-resource-map-c45.php', 'exploration-card-tags.php',
                        'gear-parts.php', 'map-tile-tags.php', 'tech-card-dictionary.php']
        for name in session_apis:
            with self.subTest(file=name):
                text = (self.source / 'api' / name).read_text(encoding='utf-8')
                self.assertIn('@mkdir($sessionDir, 0770, true)', text)
                self.assertNotIn('0777', text)
        campaign = (self.source / 'api' / 'campaign-state.php').read_text(encoding='utf-8')
        for pattern in ('mkdir($dataDir, 0770, true)', 'mkdir($dir, 0770, true)'):
            self.assertIn(pattern, campaign)

    # 7 ---------------------------------------------------------------------
    def test_second_screen_requires_the_token_from_its_own_url(self):
        account = 'screen' + uuid.uuid4().hex[:6]
        client = self.opener()
        self.assertEqual(self.register(account, opener=client)[0], 200)
        status, _ = self.json_request(self.ports[0], '', {'section': 'dashboard', 'state': {
            'activeProfileId': 'p', 'profiles': {'p': {
                'name': 'Synthetic Hero', 'activeCycleId': 'c2',
                'cycles': {'c2': {'state': {'day': 9}}}}}}}, opener=client)
        self.assertEqual(status, 200)
        status, status_body = self.json_request(self.ports[0], '?action=second-screen-status',
                                                {'enabled': True}, opener=client)
        self.assertEqual(status, 200)
        urls = status_body['urls']
        self.assertTrue(urls, 'enabling the second screen must return URLs')
        for url in urls:
            self.assertRegex(url, r'/ss/\?token=[0-9a-f]{48}$')
        token = re.search(r'token=([0-9a-f]+)', urls[0]).group(1)
        status, body = self.json_request(self.ports[0], '?action=second-screen')
        self.assertEqual((status, body['code']), (403, 'SCREEN_FORBIDDEN'))
        self.assertNotIn('Synthetic Hero', json.dumps(body))
        status, body = self.json_request(self.ports[0], '?action=second-screen&token=' + '0' * len(token))
        self.assertEqual((status, body['code']), (403, 'SCREEN_FORBIDDEN'))
        status, body = self.json_request(self.ports[0], '?action=second-screen&token=' + token)
        self.assertEqual(status, 200)
        self.assertEqual(body['screen']['profileName'], 'Synthetic Hero')
        # The dashboard logged in from a LAN address shows its own tokenless ./ss/
        # short URL, so the same browser must keep working; anonymous callers must not.
        status, body = self.json_request(self.ports[0], '?action=second-screen', opener=client)
        self.assertEqual(status, 200, body)
        self.assertEqual(body['screen']['profileName'], 'Synthetic Hero')
        outsider = self.opener()
        self.assertEqual(self.register('outsider' + uuid.uuid4().hex[:6], opener=outsider)[0], 200)
        status, body = self.json_request(self.ports[0], '?action=second-screen', opener=outsider)
        self.assertEqual((status, body['code']), (403, 'SCREEN_FORBIDDEN'))
        # The map view inside ss/ polls the bare endpoint; ss/app.js mirrors the
        # token into a cookie so that request is still authorised.
        cookie_client = urllib.request.build_opener()
        cookie_client.addheaders = [('Cookie', 'ato_second_screen_token=' + token)]
        status, body = self.json_request(self.ports[0], '?action=second-screen', opener=cookie_client)
        self.assertEqual(status, 200, body)
        # A screen that was never enabled stays a 404, not a 403.
        status, disabled = self.json_request(self.ports[0], '?action=second-screen-status',
                                             {'enabled': False}, opener=client)
        self.assertEqual(status, 200)
        status, body = self.json_request(self.ports[0], '?action=second-screen&token=' + token)
        self.assertEqual((status, body['code']), (404, 'SCREEN_NOT_FOUND'))

    # 7b --------------------------------------------------------------------
    def test_second_screen_theme_round_trips_with_the_settings(self):
        """第二屏是另一台设备，外观只能跟着设置走服务端：写进去的必须原样读回来。"""
        account = 'theme' + uuid.uuid4().hex[:6]
        client = self.opener()
        self.assertEqual(self.register(account, opener=client)[0], 200)
        status, body = self.json_request(self.ports[0], '?action=second-screen-status', opener=client)
        self.assertEqual(status, 200)
        self.assertEqual(body['theme'], {'mode': 'auto', 'rgb': [127, 75, 38]})
        self.assertFalse(body['enabled'], '读状态不该顺手把第二屏打开')

        status, _ = self.json_request(self.ports[0], '', {'section': 'dashboard', 'state': {
            'activeProfileId': 'p', 'profiles': {'p': {
                'name': 'Theme Hero', 'activeCycleId': 'c4',
                'cycles': {'c4': {'state': {'day': 3}}}}}}}, opener=client)
        self.assertEqual(status, 200)
        # 开启时连同当前外观一起写进去。
        status, status_body = self.json_request(self.ports[0], '?action=second-screen-status',
                                                {'enabled': True, 'theme': {'mode': 'custom', 'rgb': [200, 30, 30]}},
                                                opener=client)
        self.assertEqual(status, 200)
        self.assertEqual(status_body['theme'], {'mode': 'custom', 'rgb': [200, 30, 30]})
        token = re.search(r'token=([0-9a-f]+)', status_body['urls'][0]).group(1)
        status, body = self.json_request(self.ports[0], '?action=second-screen&token=' + token)
        self.assertEqual(status, 200)
        self.assertEqual(body['screen']['theme'], {'mode': 'custom', 'rgb': [200, 30, 30]})
        self.assertEqual(body['screen']['cycleId'], 'c4', 'auto 模式靠战役循环取色')

        # 换档：下一次轮询就该拿到新循环。
        status, _ = self.json_request(self.ports[0], '', {'section': 'dashboard', 'state': {
            'activeProfileId': 'p', 'profiles': {'p': {
                'name': 'Theme Hero', 'activeCycleId': 'c5',
                'cycles': {'c5': {'state': {'day': 3}}}}}}}, opener=client)
        self.assertEqual(status, 200)
        status, body = self.json_request(self.ports[0], '?action=second-screen&token=' + token)
        self.assertEqual(body['screen']['cycleId'], 'c5')

        # 坏值退回默认；颜色夹到 0-255 的整数。
        status, body = self.json_request(self.ports[0], '?action=second-screen-status',
                                         {'enabled': True, 'theme': {'mode': 'nope', 'rgb': [999, -5, 12.6]}},
                                         opener=client)
        self.assertEqual(body['theme'], {'mode': 'auto', 'rgb': [255, 0, 13]})
        status, body = self.json_request(self.ports[0], '?action=second-screen-status',
                                         {'enabled': True, 'theme': {'mode': 'c5', 'rgb': 'not-a-list'}},
                                         opener=client)
        self.assertEqual(body['theme'], {'mode': 'c5', 'rgb': [127, 75, 38]})
        # 不带 theme 的局部更新（改大小、转版图）不能把主题清掉。
        status, body = self.json_request(self.ports[0], '?action=second-screen-status',
                                         {'enabled': True, 'battleRotation': 90}, opener=client)
        self.assertEqual(body['theme'], {'mode': 'c5', 'rgb': [127, 75, 38]})
        self.assertEqual(body['battleRotation'], 90)
        status, body = self.json_request(self.ports[0], '?action=second-screen&token=' + token)
        self.assertEqual(body['screen']['theme'], {'mode': 'c5', 'rgb': [127, 75, 38]})

        # 关掉第二屏以后：设置条目没了，令牌地址与主题一并失效。
        status, body = self.json_request(self.ports[0], '?action=second-screen-status',
                                         {'enabled': False}, opener=client)
        self.assertEqual(status, 200)
        self.assertFalse(body['enabled'])
        status, body = self.json_request(self.ports[0], '?action=second-screen&token=' + token)
        self.assertEqual((status, body['code']), (404, 'SCREEN_NOT_FOUND'))

    # 8 ---------------------------------------------------------------------
    @classmethod
    def map_tags_fixture(cls):
        """Synthetic map-tile-tags.js: the extra fields the editor must not destroy."""
        return (
            'window.ATO_MAP_TILE_TAGS = {\n'
            '    "version": 2,\n'
            '    "source": "map/map-data.js",\n'
            '    "updatedAt": "2026-01-01T00:00:00.000Z",\n'
            '    "tagDefinitions": [\n'
            '        {"id": "progress", "label": "\u8fdb\u5c55", "shortcut": "1", "cycles": ["c1"]}\n'
            '    ],\n'
            '    "tiles": {\n'
            '        "c1:001": {"cycleId": "c1", "tileId": "001", "reviewed": true, "tags": ["progress"],'
            ' "notes": "", "updatedAt": "2026-01-01T00:00:00.000Z", "factions": ["cyclopes"],'
            ' "factionUpdatedAt": "2026-01-02T00:00:00.000Z"},\n'
            '        "c1:002": {"cycleId": "c1", "tileId": "002", "reviewed": false, "tags": [],'
            ' "notes": "", "updatedAt": "2026-01-01T00:00:00.000Z", "factions": []},\n'
            '        "c5:008": {"cycleId": "c5", "tileId": "008", "tags": [], "factions": ["cycladeanProtectorate"]},\n'
            '        "c5:008:A": {"cycleId": "c5", "tileId": "008", "face": "A", "tags": ["progress"], "factions": ["cycladeanProtectorate"]},\n'
            '        "c5:008:B": {"cycleId": "c5", "tileId": "008", "face": "B", "tags": ["calamity"], "factions": ["followersOfArete"]},\n'
            '        "c5:009:B": {"tags": [], "factions": ["outcastVanguard"]}\n'
            '    }\n'
            '};\n'
        )

    @classmethod
    def map_tags_request(cls, port, payload=None, opener=None, timeout=60):
        raw = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(
            f'http://127.0.0.1:{port}/api/map-tile-tags.php',
            data=raw, headers={'Content-Type': 'application/json'})
        client = opener or urllib.request.build_opener()
        try:
            result = client.open(request, timeout=timeout)
        except urllib.error.HTTPError as error:
            result = error
        with result:
            return result.status, json.loads(result.read().decode('utf-8', 'replace'))

    def test_map_tile_tags_keeps_unknown_fields_and_rejects_stale_saves(self):
        account = 'maptags' + uuid.uuid4().hex[:6]
        client = self.opener()
        self.assertEqual(self.register(account, opener=client)[0], 200)

        status, body = self.map_tags_request(self.ports[0], opener=client)
        self.assertEqual(status, 200, body)
        self.assertEqual(body['revision'], 0, 'a file without a revision starts at 0')
        data = body['data']
        self.assertEqual(data['version'], 2)
        self.assertEqual(data['tagDefinitions'][0]['cycles'], ['c1'], 'definition cycles must survive')
        self.assertEqual(data['tiles']['c1:001']['factions'], ['cyclopes'], 'tile factions must survive')
        self.assertEqual(data['tiles']['c1:001']['factionUpdatedAt'], '2026-01-02T00:00:00.000Z')
        self.assertEqual(len(data['tiles']), 6, 'base and face entries must not collapse during GET')
        self.assertEqual(data['tiles']['c5:008']['tags'], [])
        self.assertEqual(data['tiles']['c5:008:A']['tags'], ['progress'])
        self.assertEqual(data['tiles']['c5:008:B']['tags'], ['calamity'])
        self.assertEqual(data['tiles']['c5:008:B']['factions'], ['followersOfArete'])
        self.assertEqual(data['tiles']['c5:009:B']['cycleId'], 'c5')
        self.assertEqual(data['tiles']['c5:009:B']['tileId'], '009')
        self.assertEqual(data['tiles']['c5:009:B']['face'], 'B')
        face_entries = {key: value for key, value in data['tiles'].items() if key.startswith('c5:')}

        # First save based on revision 0 succeeds and bumps the revision.
        data['tiles']['c1:001']['notes'] = 'A'
        status, saved = self.map_tags_request(
            self.ports[0], {'data': data, 'expectedRevision': 0}, opener=client)
        self.assertEqual(status, 200, saved)
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(saved['data']['tiles']['c1:001']['factions'], ['cyclopes'])
        self.assertEqual({key: value for key, value in saved['data']['tiles'].items() if key.startswith('c5:')},
                         face_entries, 'face entries must survive POST without merging')
        self.assertEqual(saved['data']['version'], 2, 'an old client must not downgrade version')

        # A second page that read revision 0 must be refused, and nothing may be written.
        stale = json.loads(json.dumps(saved['data']))
        stale['tiles']['c1:002']['notes'] = 'B'
        status, conflict = self.map_tags_request(
            self.ports[0], {'data': stale, 'expectedRevision': 0}, opener=client)
        self.assertEqual(status, 409, conflict)
        self.assertEqual(conflict['code'], 'SAVE_CONFLICT')
        self.assertEqual(conflict['revision'], 1)
        status, after = self.map_tags_request(self.ports[0], opener=client)
        self.assertEqual(after['revision'], 1, 'a refused save must not bump the revision')
        self.assertEqual(after['data']['tiles']['c1:002'].get('notes', ''), '',
                         'a refused save must not reach the file')

        # Re-reading and retrying with the current revision succeeds without losing
        # the first page's edit.
        retry = json.loads(json.dumps(after['data']))
        retry['tiles']['c1:002']['notes'] = 'B'
        status, body = self.map_tags_request(
            self.ports[0], {'data': retry, 'expectedRevision': after['revision']}, opener=client)
        self.assertEqual(status, 200, body)
        self.assertEqual(body['revision'], 2)
        self.assertEqual(body['data']['tiles']['c1:001']['notes'], 'A', 'the earlier edit must still be there')
        self.assertEqual(body['data']['tiles']['c1:001']['factions'], ['cyclopes'])
        self.assertEqual({key: value for key, value in body['data']['tiles'].items() if key.startswith('c5:')},
                         face_entries, 'face entries must survive repeated saves')
        on_disk = (self.root / 'map' / 'map-tile-tags.js').read_text(encoding='utf-8')
        self.assertIn('"factions"', on_disk)
        self.assertIn('"cyclopes"', on_disk)
        self.assertIn('"cycles"', on_disk)
        self.assertIn('"version": 2', on_disk)

        # Two writers holding the same revision: exactly one may win.
        current = body
        results = []
        lock = threading.Lock()

        def writer(notes):
            payload = json.loads(json.dumps(current['data']))
            payload['tiles']['c1:001']['notes'] = notes
            status, _ = self.map_tags_request(
                self.ports[0], {'data': payload, 'expectedRevision': current['revision']}, opener=client)
            with lock:
                results.append(status)

        threads = [threading.Thread(target=writer, args=(name,)) for name in ('X', 'Y')]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertEqual(sorted(results), [200, 409],
                         f'exactly one concurrent save may win, got {results}')

    # 9 ---------------------------------------------------------------------
    def test_full_import_is_all_or_nothing(self):
        account = 'import' + uuid.uuid4().hex[:6]
        client = self.opener()
        self.assertEqual(self.register(account, opener=client)[0], 200)
        _, me = self.json_request(self.ports[0], '?action=me', opener=client)
        account_id = me['user']['id']
        self.assertEqual(self.json_request(self.ports[0], '',
                         {'section': 'dashboard', 'state': {'v': 'old-dashboard'}, 'expectedRevision': 0},
                         opener=client)[0], 200)
        self.assertEqual(self.json_request(self.ports[0], '',
                         {'section': 'heroes', 'state': {'v': 'old-heroes'}, 'expectedRevision': 0},
                         opener=client)[0], 200)
        _, before = self.json_request(self.ports[0], '', opener=client)
        revisions = before['campaign']['sectionRevisions']

        # One stale expected revision: nothing may be written, not even the valid section.
        status, body = self.json_request(self.ports[0], '?action=import-sections', {
            'sections': {'dashboard': {'v': 'new-dashboard'}, 'heroes': {'v': 'new-heroes'}},
            'expectedRevisions': {'dashboard': revisions['dashboard'], 'heroes': 99},
            'expectedAccountId': account_id,
        }, opener=client)
        self.assertEqual(status, 409, body)
        self.assertEqual(body['code'], 'SAVE_CONFLICT')
        self.assertIn('heroes', body['sections'])
        _, after = self.json_request(self.ports[0], '', opener=client)
        self.assertEqual(after['campaign']['sections']['dashboard']['v'], 'old-dashboard',
                         'a refused import must not write the sections that did match')
        self.assertEqual(after['campaign']['sections']['heroes']['v'], 'old-heroes')
        self.assertEqual(after['campaign']['sectionRevisions'], revisions,
                         'a refused import must not advance any revision')

        # Correct revisions: every section lands, each revision advances once.
        status, body = self.json_request(self.ports[0], '?action=import-sections', {
            'sections': {'dashboard': {'v': 'new-dashboard'}, 'heroes': {'v': 'new-heroes'}},
            'expectedRevisions': {'dashboard': revisions['dashboard'], 'heroes': revisions['heroes']},
            'expectedAccountId': account_id,
        }, opener=client)
        self.assertEqual(status, 200, body)
        self.assertEqual(sorted(body['sections']), ['dashboard', 'heroes'])
        _, after = self.json_request(self.ports[0], '', opener=client)
        self.assertEqual(after['campaign']['sections']['dashboard']['v'], 'new-dashboard')
        self.assertEqual(after['campaign']['sections']['heroes']['v'], 'new-heroes')
        self.assertEqual(after['campaign']['sectionRevisions']['dashboard'], revisions['dashboard'] + 1)
        self.assertEqual(after['campaign']['sectionRevisions']['heroes'], revisions['heroes'] + 1)

        # A page that says it belongs to another account may not import anything.
        status, body = self.json_request(self.ports[0], '?action=import-sections', {
            'sections': {'dashboard': {'v': 'x'}},
            'expectedRevisions': {},
            'expectedAccountId': 'someone-else',
        }, opener=client)
        self.assertEqual((status, body['code']), (409, 'ACCOUNT_MISMATCH'))
        # Unknown section names are rejected before anything is written.
        status, body = self.json_request(self.ports[0], '?action=import-sections', {
            'sections': {'not-a-section': {}},
            'expectedRevisions': {},
        }, opener=client)
        self.assertEqual(status, 400, body)


if __name__ == '__main__':
    unittest.main(verbosity=2)
