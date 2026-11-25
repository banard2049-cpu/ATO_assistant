"""应用内一键更新的回归测试（python tests/test_app_update.py）。

需要 PATH 上有 PHP。测试把 api/app-update.php 与 api/app-update-policy.php 复制到
tmp/ 下的临时安装目录，用 127.0.0.1 上的内置服务器发真实 HTTP 请求；安装目录、
data/、用户素材都是合成的，仓库里真实的 data/ 不会被碰。临时副本从独立的 GitHub
响应样本读取发布清单，测试再扮演浏览器把下载内容 POST 给 stage 接口。全程不需要外网。

覆盖：
  1. 排除规则与 tools/packaging/package_common.py 的 excluded() 逐条一致——两边
     不一致会导致更新写进发布包里没有的文件，或漏掉该更新的文件；
  2. 能力探测：非便携版（没有内置运行时）、Docker、未登录；
  3. begin 的路径筛选：tools/、tests/、data/、asset-studio/、*.atopack、BGM 音频
     等既不下载也不删除；
  4. 目录穿越等不安全路径整单拒绝，且不写出安装目录；
  5. stage 的 git blob sha 校验，内容对不上就拒绝且安装目录不动；
  6. commit 只写程序文件：data/、用户自带素材、BGM 音频都不动，删除与改名生效；
  7. rollback 完整还原上一版；
  8. GitHub compare 的 300 文件上限。
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / 'packaging'))

import package_common  # noqa: E402  (路径要先插进 sys.path)


def git_blob_sha(content: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(content)).encode('ascii') + b'\x00' + content).hexdigest()


def fixture_commit(tag: str) -> str:
    return hashlib.sha1(f'test commit {tag}'.encode()).hexdigest()


def github_release_responses(current, tag, files):
    commit = fixture_commit(tag)
    annotation = hashlib.sha1(f'test annotated tag {tag}'.encode()).hexdigest()
    encoded_tag = urllib.parse.quote(tag, safe='')
    encoded_base = urllib.parse.quote('v' + current.removeprefix('v'), safe='')
    return {
        f'releases/tags/{encoded_tag}': {
            'tag_name': tag, 'draft': False, 'prerelease': False,
            'published_at': '2026-01-01T00:00:00Z',
        },
        f'git/ref/tags/{encoded_tag}': {
            'ref': f'refs/tags/{tag}', 'object': {'type': 'tag', 'sha': annotation},
        },
        f'git/tags/{annotation}': {
            'sha': annotation, 'object': {'type': 'commit', 'sha': commit},
        },
        f'compare/{encoded_base}...{commit}': {'status': 'ahead', 'files': files},
    }


def install_fixture_transport(root):
    policy = root / 'api/app-update-policy.php'
    source = policy.read_text(encoding='utf-8')
    signature = 'function ato_update_github_json('
    if source.count(signature) != 1:
        raise AssertionError('Expected one GitHub transport in app-update-policy.php')
    source = source.replace(signature, 'function unused_production_github_json(')
    policy.write_text(source + '''

function ato_update_github_json(string $endpoint): ?array
{
    $fixture = json_decode((string) file_get_contents(dirname(__DIR__) . '/data/github-update-fixture.json'), true);
    $scenario = $_COOKIE['ato_update_fixture_scenario'] ?? 'normal';
    return $fixture[$scenario][$endpoint] ?? null;
}
''', encoding='utf-8')


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


PARITY_PROBE = r'''<?php
require __DIR__ . '/app-update-policy.php';
$input = json_decode((string) file_get_contents($argv[1]), true);
$out = [
    'blockedTop' => ATO_UPDATE_BLOCKED_TOP,
    'blockedLeaves' => ATO_UPDATE_BLOCKED_LEAVES,
    'blockedSuffixes' => ATO_UPDATE_BLOCKED_SUFFIXES,
    'blockedPrefixes' => ATO_UPDATE_BLOCKED_LEAF_PREFIXES,
    'bgmSuffixes' => ATO_UPDATE_BGM_MEDIA_SUFFIXES,
    'loopback' => [],
    'excluded' => [],
];
foreach ($input['loopback'] as $address) {
    $out['loopback'][$address] = ato_update_is_loopback($address);
}
foreach ($input['paths'] as $path) {
    $out['excluded'][$path] = ato_update_path_excluded($path);
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
'''

# 一份能同时踩到各条分支的路径样本：目录级排除、后缀排除、BGM 音频的三段判定规则、
# 结尾点/空格之外的各种写法、大小写、以及不该被误伤的程序文件。
PARITY_PATHS = [
    'api/.ato-update-fixture.php',
    'api/.ato-update-fixture.php.done',
    'index.html',
    'api/app-update.php',
    'assets/update/update-check.js',
    'assets/ato-terms.js',
    'release-notes/v2.1.9.md',
    'aibp/ps/bp_status_map.js',
    'ss/index.html',
    'technology/tech_card_dictionary.min.json',
    'tools/helper.py',
    'tools/x.config.json',
    'tools/packaging/portable/start-ato-portable.bat',
    'tests/x.test.cjs',
    'data/ato-users.json',
    'adata/keep.js',
    'tmp/scratch.txt',
    'logs/run.log',
    'log/run.log',
    '.claude/settings.json',
    'export/pack.atopack',
    'asset-studio/app.py',
    'official-assets/x.jpg',
    'node_modules/x.js',
    'dist/x.js',
    'release/x',
    'releases/x',
    '.git/config',
    '.github/workflows/x.yml',
    '.vscode/settings.json',
    '.agents/x',
    '.codex/x',
    '.idea/x',
    'assets/bgm/song.mp3',
    'assets/bgm/bgm.js',
    'assets/bgm/manifest.js',
    'assets/bgm/nested/deep.mp3',
    'assets/icons/argo.svg',
    'assets/icons/argo-knowledge.svg',
    'assets/icons/manifest.json',
    'icon-extract/svg/argo.svg',
    'icon-extract/png/argo.png',
    'icon-extractor/keep.js',
    'bgm/legacy.mp3',
    'bgm/legacy.js',
    'map/images/user.jpg',
    'map/tokens/token.png',
    'record/assets/hero.png',
    'story/data/storybook-data.js',
    'story/assets/mixed-media/mapping.js',
    'story/assets/mixed-media/images/c4/local.png',
    'Story/Assets/Mixed-Media/Images/C5/Nested/local.png',
    'story/assets/mixed-media/renderer.js',
    'story/assets/mixed-media/styles.css',
    'story/audio-packs/audio/manifest.js',
    'supplements/x.bin',
    'keep.bak',
    'keep.tmp',
    'keep.log',
    'keep.lock',
    'keep.atoback',
    'keep.atoback.partial',
    'keep.atopack',
    'keep.atopack.partial',
    'keep.backup',
    'keep.backup.1',
    'keep.backup.x',
    'start-windows.bat',
    'start-macos.command',
    'php_errors.log',
    'error_log',
    'error_log.txt',
    '.DS_Store',
    '.gitattributes',
    '.gitignore',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    'docker-compose.nas.yml',
    '__pycache__/x.pyc',
    'desktop.ini',
    'Thumbs.db',
]


class ExclusionParityTest(unittest.TestCase):
    """PHP 的排除规则必须和打包器（package_common.excluded）给出同一个答案。"""

    @classmethod
    def setUpClass(cls):
        php = shutil.which('php')
        if not php:
            raise unittest.SkipTest('PHP is not installed')
        cls.php = php
        cls.work = ROOT / 'tmp' / ('update-parity-' + uuid.uuid4().hex)
        cls.work.mkdir(parents=True)
        shutil.copyfile(ROOT / 'api' / 'app-update-policy.php', cls.work / 'app-update-policy.php')
        (cls.work / 'probe.php').write_text(PARITY_PROBE, encoding='utf-8')
        (cls.work / 'input.json').write_text(
            json.dumps({'paths': PARITY_PATHS, 'loopback': [
                '127.0.0.1', '127.7.7.7', '::1', '::ffff:127.0.0.1',
                '192.168.1.7', '10.0.0.5', '::ffff:192.168.1.7', '', 'localhost',
            ]}),
            encoding='utf-8',
        )
        with (cls.work / 'stdout.txt').open('wb') as out:
            completed = subprocess.run(
                [php, '-f', str(cls.work / 'probe.php'), str(cls.work / 'input.json')],
                stdout=out, stderr=subprocess.STDOUT, cwd=str(cls.work),
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            )
        if completed.returncode != 0:
            raise AssertionError((cls.work / 'stdout.txt').read_text(encoding='utf-8', errors='replace'))
        cls.php_result = json.loads((cls.work / 'stdout.txt').read_text(encoding='utf-8'))
        cls.addClassCleanup(lambda: shutil.rmtree(cls.work, ignore_errors=True))

    def test_constants_match_the_packager(self):
        self.assertEqual(set(self.php_result['blockedTop']), set(package_common.BLOCKED_TOP))
        self.assertEqual(set(self.php_result['blockedLeaves']), set(package_common.BLOCKED_LEAVES))
        self.assertEqual(set(self.php_result['blockedSuffixes']), set(package_common.BLOCKED_SUFFIXES))
        self.assertEqual(set(self.php_result['blockedPrefixes']), {'start-windows', 'start-macos', 'php_errors', 'error_log', '.ato-update-'})
        self.assertEqual(set(self.php_result['bgmSuffixes']), set(package_common.BGM_MEDIA_SUFFIXES))

    def test_excluded_agrees_path_by_path(self):
        mismatches = []
        for path in PARITY_PATHS:
            expected = package_common.excluded(Path(path))
            actual = self.php_result['excluded'].get(path)
            if expected != actual:
                mismatches.append(f'{path}: python={expected} php={actual}')
        self.assertEqual(mismatches, [])

    def test_loopback_predicate(self):
        loopback = self.php_result['loopback']
        for address in ('127.0.0.1', '127.7.7.7', '::1', '::ffff:127.0.0.1'):
            self.assertTrue(loopback[address], address)
        for address in ('192.168.1.7', '10.0.0.5', '::ffff:192.168.1.7', '', 'localhost'):
            self.assertFalse(loopback[address], address)


class MixedMediaExportTest(unittest.TestCase):
    def test_materials_are_private_but_runtime_is_shippable(self):
        for path in ('story/assets/mixed-media/mapping.js',
                     'story/assets/mixed-media/images/c4/local.png',
                     'STORY/ASSETS/MIXED-MEDIA/IMAGES/C5/local.png'):
            self.assertTrue(package_common.excluded(Path(path)), path)
        for path in ('story/assets/mixed-media/renderer.js',
                     'story/assets/mixed-media/styles.css'):
            self.assertFalse(package_common.excluded(Path(path)), path)

    def test_export_audit_rejects_materials_even_if_copy_filter_is_bypassed(self):
        stage = (ROOT / 'tmp' / ('mixed-media-audit-' + uuid.uuid4().hex)).resolve()
        self.assertEqual(stage.parent, (ROOT / 'tmp').resolve())
        stage.mkdir(parents=True)
        self.addCleanup(lambda: shutil.rmtree(stage))
        shutil.copyfile(ROOT / 'LICENSE', stage / 'LICENSE')
        runtime = stage / 'story/assets/mixed-media'
        runtime.mkdir(parents=True)
        (runtime / 'renderer.js').write_text('// test runtime', encoding='utf-8')
        package_common.audit_export_tree(stage)
        for path in (runtime / 'mapping.js', runtime / 'images/c4/local.png'):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'private test material')
            with self.assertRaisesRegex(RuntimeError, '本地故事混排素材'):
                package_common.audit_export_tree(stage)
            path.unlink()


class AppUpdateTest(unittest.TestCase):
    """对着真实的 PHP 内置服务器跑 begin / stage / commit / rollback。"""

    @classmethod
    def setUpClass(cls):
        php = shutil.which('php')
        if not php:
            raise unittest.SkipTest('PHP is not installed')
        cls.php = php

    def setUp(self):
        self.plan_id = ''
        self.root = ROOT / 'tmp' / ('app-update-' + uuid.uuid4().hex)
        (self.root / 'api').mkdir(parents=True)
        (self.root / 'data' / 'sessions').mkdir(parents=True)
        (self.root / 'runtime' / 'php').mkdir(parents=True)
        (self.root / 'assets' / 'update').mkdir(parents=True)
        (self.root / 'assets' / 'bgm').mkdir(parents=True)
        (self.root / 'map' / 'images').mkdir(parents=True)
        (self.root / 'release-notes').mkdir(parents=True)
        (self.root / 'story').mkdir(parents=True)

        shutil.copyfile(ROOT / 'api' / 'app-update.php', self.root / 'api' / 'app-update.php')
        shutil.copyfile(ROOT / 'api' / 'app-update-policy.php', self.root / 'api' / 'app-update-policy.php')
        shutil.copyfile(ROOT / 'router.php', self.root / 'router.php')
        install_fixture_transport(self.root)

        # 程序文件（本次会被更新）
        self.write('index.html', b'<!doctype html><title>old</title>\n')
        self.write('assets/update/update-check.js', b'// old updater\n')
        self.write('story/old-module.js', b'// removed upstream\n')
        self.write('assets/renamed/old.js', b'// renamed upstream\n')
        # 版本文件：发布构建写进去的格式
        self.write('assets/update/app-version.js', b'window.ATO_APP_VERSION = "2.1.9";\n')
        # 用户自己的东西：一个字节都不能变
        self.write('data/ato-users.json', b'{"users":["private"]}\n')
        self.write('assets/bgm/song.mp3', b'ID3 user audio\n')
        self.write('map/images/user-photo.jpg', b'user photo\n')

        self.sid = uuid.uuid4().hex
        (self.root / 'data' / 'sessions' / f'sess_{self.sid}').write_text(
            'ato_user_id|s:4:"test";', encoding='utf-8'
        )

        self.port = free_port()
        self.log = (self.root / 'server.log').open('wb')
        self.server = subprocess.Popen(
            [self.php, '-S', f'127.0.0.1:{self.port}', '-t', str(self.root), str(self.root / 'router.php')],
            stdout=self.log, stderr=self.log, cwd=str(self.root),
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        self.addCleanup(self.stop)

    def stop(self):
        try:
            self.server.terminate()
            self.server.wait(timeout=10)
        except Exception:
            self.server.kill()
        finally:
            self.log.close()
        shutil.rmtree(self.root, ignore_errors=True)

    def write(self, relative: str, content: bytes) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def read(self, relative: str) -> bytes:
        return (self.root / relative).read_bytes()

    def exists(self, relative: str) -> bool:
        return (self.root / relative).exists()

    def request(self, path, *, method='GET', body=None, cookie=True):
        endpoint = '/api/app-update.php'
        if method == 'POST' and any('action=' + action in path for action in ('commit', 'rollback')):
            status, prepared = self.request('?action=prepare', method='POST', cookie=cookie)
            if status != 200:
                return status, prepared
            endpoint = '/' + prepared['endpoint'].removeprefix('./')
        if method == 'POST' and 'plan=' not in path and any(
            'action=' + action in path for action in ('stage', 'commit', 'cancel')
        ):
            path += '&plan=' + self.plan_id
        data = None
        headers = {}
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode('utf-8')
            if not isinstance(body, bytes):
                headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(
            f'http://127.0.0.1:{self.port}{endpoint}{path}', data=data, method=method
        )
        for key, value in headers.items():
            request.add_header(key, value)
        if cookie:
            request.add_header('Cookie', f'PHPSESSID={self.sid}')
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode('utf-8'))

    def wait_ready(self):
        for _ in range(60):
            try:
                return self.request('?action=status')
            except OSError:
                continue
        raise AssertionError('built-in PHP server did not start')

    # ------------------------------------------------------------- fixtures ---
    NEW_FILES = {
        'index.html': b'<!doctype html><title>new</title>\n',
        'assets/update/update-check.js': b'// new updater\n',
        'assets/new-module.js': b'// brand new module\n',
        'release-notes/v9.9.9.md': b'## 9.9.9\n',
        'assets/renamed/new.js': b'// renamed upstream\n',
    }
    EXCLUDED_FILES = {
        'tools/helper.py': b'print("no")\n',
        'tests/new.test.cjs': b'// no\n',
        'data/ato-users.json': b'{"users":["hacked"]}\n',
        'assets/bgm/song.mp3': b'bad audio\n',
        'asset-studio/app.py': b'no\n',
        'story/keep.bak': b'no\n',
    }

    def compare_fixture(self, extra=None):
        files = [
            {'filename': 'index.html', 'status': 'modified', 'sha': git_blob_sha(self.NEW_FILES['index.html'])},
            {'filename': 'assets/update/update-check.js', 'status': 'modified',
             'sha': git_blob_sha(self.NEW_FILES['assets/update/update-check.js'])},
            {'filename': 'assets/new-module.js', 'status': 'added',
             'sha': git_blob_sha(self.NEW_FILES['assets/new-module.js'])},
            {'filename': 'release-notes/v9.9.9.md', 'status': 'added',
             'sha': git_blob_sha(self.NEW_FILES['release-notes/v9.9.9.md'])},
            {'filename': 'assets/renamed/new.js', 'status': 'renamed',
             'previous_filename': 'assets/renamed/old.js',
             'sha': git_blob_sha(self.NEW_FILES['assets/renamed/new.js'])},
            # 版本文件由更新器自己写，不该走下载
            {'filename': 'assets/update/app-version.js', 'status': 'modified',
             'sha': git_blob_sha(b'whatever the repo has\n')},
            {'filename': 'story/old-module.js', 'status': 'removed'},
            {'filename': 'assets/renamed/old.js', 'status': 'removed'},
        ]
        for name, content in self.EXCLUDED_FILES.items():
            status = 'modified' if self.exists(name) else 'added'
            files.append({'filename': name, 'status': status, 'sha': git_blob_sha(content)})
        files.append({'filename': 'tools/old-tool.py', 'status': 'removed'})
        if extra:
            files.extend(extra)
        return {'current': '2.1.9', 'target': 'v9.9.9', 'files': files}

    def begin(self, metadata=None, *, client_fields=None, github_available=True):
        metadata = metadata or self.compare_fixture()
        current, target = metadata['current'], metadata['target']
        responses = github_release_responses(current, target, metadata['files']) if github_available else {}
        self.write('data/github-update-fixture.json', json.dumps({'normal': responses}).encode('utf-8'))
        body = {'current': current, 'target': target, **(client_fields or {})}
        status, result = self.request('?action=begin', method='POST', body=body)
        if status == 200:
            self.plan_id = result['planId']
        return status, result

    def stage(self, path, content, sha=None):
        sha = sha or git_blob_sha(content)
        return self.request(
            f'?action=stage&path={urllib.parse.quote(path)}&sha={sha}',
            method='POST', body=content,
        )

    # ---------------------------------------------------------------- tests ---
    def test_status_reports_portable_and_unsupported_modes(self):
        self.wait_ready()
        status, payload = self.request('?action=status')
        self.assertEqual(status, 200)
        self.assertTrue(payload['supported'])
        self.assertEqual(payload['version'], '2.1.9')

        # Docker 容器标记
        (self.root / '.dockerenv').write_text('', encoding='utf-8')
        status, payload = self.request('?action=status')
        self.assertEqual(status, 200)
        self.assertFalse(payload['supported'])
        self.assertEqual(payload['code'], 'NOT_PORTABLE')
        (self.root / '.dockerenv').unlink()

        # 没有内置运行时 → 不是便携版（Apache / NAS 部署）
        shutil.rmtree(self.root / 'runtime' / 'php')
        status, payload = self.request('?action=status')
        self.assertFalse(payload['supported'])
        self.assertEqual(payload['code'], 'NOT_PORTABLE')
        status, payload = self.begin()
        self.assertEqual(status, 409)
        self.assertEqual(payload['code'], 'NOT_PORTABLE')

    def test_requires_login(self):
        self.wait_ready()
        status, payload = self.request('?action=status', cookie=False)
        self.assertEqual(status, 401)
        self.assertEqual(payload['code'], 'AUTH_REQUIRED')
        status, payload = self.request('?action=begin', method='POST',
                                       body={'current': '2.1.9', 'target': 'v9.9.9'}, cookie=False)
        self.assertEqual(status, 401)

    def test_begin_filters_paths_the_package_never_ships(self):
        self.wait_ready()
        status, payload = self.begin()
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload['commit'], fixture_commit('v9.9.9'))
        planned = {entry['path']: entry['sha'] for entry in payload['downloads']}
        self.assertEqual(set(planned), set(self.NEW_FILES))
        self.assertEqual(planned['index.html'], git_blob_sha(self.NEW_FILES['index.html']))
        self.assertEqual(sorted(payload['deletions']), ['assets/renamed/old.js', 'story/old-module.js'])
        self.assertEqual(payload['fileCount'], 5)
        self.assertEqual(payload['deletionCount'], 2)
        # 计划里不能出现发布包不带的路径
        for name in ('tools/helper.py', 'tests/new.test.cjs', 'data/ato-users.json',
                     'assets/bgm/song.mp3', 'asset-studio/app.py', 'assets/update/app-version.js'):
            self.assertNotIn(name, planned, name)

    def test_begin_rejects_unsafe_paths_and_writes_nothing(self):
        self.wait_ready()
        for name in ('../outside.txt', '..\\outside.txt', 'C:/windows/system32/x.dll',
                     'assets/../data/ato-users.json', 'nul.txt', 'assets/x.js.'):
            status, payload = self.begin(self.compare_fixture(extra=[
                {'filename': name, 'status': 'added', 'sha': git_blob_sha(b'x')},
            ]))
            self.assertEqual(status, 409, name)
            self.assertEqual(payload['code'], 'UNSAFE_PATH', name)
        self.assertFalse((self.root.parent / 'outside.txt').exists())
        self.assertEqual(self.read('index.html'), b'<!doctype html><title>old</title>\n')

    def test_begin_rejects_compare_truncation_and_stale_targets(self):
        self.wait_ready()
        many = [{'filename': f'assets/generated-{i}.js', 'status': 'added', 'sha': git_blob_sha(b'x')}
                for i in range(300)]
        status, payload = self.begin({
            'current': '2.1.9', 'target': 'v9.9.9',
            'files': many,
        })
        self.assertEqual(status, 409)
        self.assertEqual(payload['code'], 'TOO_MANY_FILES')

        status, payload = self.begin({'current': '2.1.9', 'target': '2.1.9', 'files': []})
        self.assertEqual(status, 409)
        self.assertEqual(payload['code'], 'ALREADY_LATEST')

        status, payload = self.begin({'current': 'local', 'target': 'v9.9.9', 'files': []})
        self.assertEqual(status, 400)
        self.assertEqual(payload['code'], 'BAD_VERSION')

    def test_browser_file_list_is_ignored(self):
        self.wait_ready()
        client_files = [{'filename': 'assets/client-only.js', 'status': 'added', 'sha': git_blob_sha(b'// client sample\n')}]
        status, plan = self.begin(client_fields={'files': client_files})
        self.assertEqual(status, 200, plan)
        self.assertEqual({entry['path'] for entry in plan['downloads']}, set(self.NEW_FILES))
        self.assertFalse(self.exists('assets/client-only.js'))

    def test_official_release_unavailable_leaves_installation_untouched(self):
        self.wait_ready()
        status, result = self.begin(github_available=False)
        self.assertEqual((status, result['code']), (502, 'RELEASE_UNVERIFIED'))
        self.assertFalse(self.request('?action=status')[1]['canCommit'])
        self.assertEqual(self.read('index.html'), b'<!doctype html><title>old</title>\n')

    def test_legacy_plan_cannot_be_staged_or_committed(self):
        self.wait_ready()
        plan = self.stage_all()
        path = self.root / 'data' / 'update-staging' / plan['planId'] / 'plan.json'
        legacy = json.loads(path.read_bytes())
        legacy['version'] = 1
        del legacy['commit']
        path.write_text(json.dumps(legacy), encoding='utf-8')
        self.assertFalse(self.request('?action=status')[1]['canCommit'])
        self.assertEqual(self.stage('index.html', self.NEW_FILES['index.html'])[0], 409)
        self.assertEqual(self.request('?action=commit', method='POST')[0], 409)
        self.assertEqual(self.read('index.html'), b'<!doctype html><title>old</title>\n')

    def test_legacy_runner_cannot_be_executed(self):
        self.wait_ready()
        runner = self.write('api/.ato-update-' + 'a' * 32 + '.php', b'<?php echo "stale fixture runner";')
        names = [runner.name]
        if os.name == 'nt':
            import ctypes

            short_path = ctypes.create_unicode_buffer(32768)
            size = ctypes.windll.kernel32.GetShortPathNameW(str(runner), short_path, len(short_path))
            if 0 < size < len(short_path) and Path(short_path.value).name != runner.name:
                names.append(Path(short_path.value).name)
        for name in names:
            with self.subTest(name=name):
                path = urllib.parse.quote(f'api/{name}')
                request = urllib.request.Request(f'http://127.0.0.1:{self.port}/{path}')
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    urllib.request.urlopen(request, timeout=3)
                self.assertEqual(denied.exception.code, 403)

    def test_stage_rejects_unplanned_and_mismatched_content(self):
        self.wait_ready()
        status, plan = self.begin()
        self.assertEqual(status, 200, plan)
        planned = {entry['path']: entry['sha'] for entry in plan['downloads']}
        # 计划之外的文件
        status, payload = self.stage('assets/evil.js', b'// not planned\n')
        self.assertEqual(status, 409)
        self.assertEqual(payload['code'], 'NOT_PLANNED')
        # 声明了计划里的摘要，但正文被换过
        status, payload = self.stage(
            'index.html', b'<!doctype html><title>tampered</title>\n', planned['index.html']
        )
        self.assertEqual(status, 502)
        self.assertEqual(payload['code'], 'CHECKSUM_MISMATCH')
        self.assertFalse(self.exists('assets/evil.js'))
        self.assertEqual(self.read('index.html'), b'<!doctype html><title>old</title>\n')

    def test_commit_requires_every_planned_file_to_be_staged(self):
        self.wait_ready()
        self.begin()
        self.stage('index.html', self.NEW_FILES['index.html'])
        status, payload = self.request('?action=commit', method='POST')
        self.assertEqual(status, 409)
        self.assertEqual(payload['code'], 'NOT_STAGED')
        self.assertEqual(self.read('index.html'), b'<!doctype html><title>old</title>\n')

    def test_commit_updates_code_only_then_rollback_restores(self):
        self.wait_ready()
        status, plan = self.begin()
        self.assertEqual(status, 200, plan)
        for entry in plan['downloads']:
            status, payload = self.stage(entry['path'], self.NEW_FILES[entry['path']], entry['sha'])
            self.assertEqual(status, 200, payload)
            self.assertEqual(payload['phase'], 'staged')
        # 下载阶段安装目录必须一个字节都没动
        self.assertEqual(self.read('index.html'), b'<!doctype html><title>old</title>\n')
        self.assertTrue(self.exists('story/old-module.js'))

        status, applied = self.request('?action=commit', method='POST')
        self.assertEqual(status, 200, applied)
        self.assertEqual(applied['applied'], 5)
        self.assertEqual(applied['deleted'], 2)

        for name, content in self.NEW_FILES.items():
            self.assertTrue(self.exists(name), name)
            self.assertEqual(self.read(name), content, name)
        self.assertFalse(self.exists('story/old-module.js'))
        self.assertFalse(self.exists('assets/renamed/old.js'))
        # 发布包不带的路径：一个都不该被创建；用户已有的同类文件也不能被覆盖
        for name, content in self.EXCLUDED_FILES.items():
            if name in ('data/ato-users.json', 'assets/bgm/song.mp3'):
                self.assertNotEqual(self.read(name), content, name)
            else:
                self.assertFalse(self.exists(name), name)
        # 版本文件由更新器按发布包的格式写，且不带前缀 v
        self.assertEqual(self.read('assets/update/app-version.js'), b'window.ATO_APP_VERSION = "9.9.9";\n')
        # 用户的存档与素材原样保留
        self.assertEqual(self.read('data/ato-users.json'), b'{"users":["private"]}\n')
        self.assertEqual(self.read('assets/bgm/song.mp3'), b'ID3 user audio\n')
        self.assertEqual(self.read('map/images/user-photo.jpg'), b'user photo\n')
        # 暂存清空，备份留下
        self.assertEqual(list((self.root / 'data' / 'update-staging').glob('*')), [])
        self.assertEqual(len(list((self.root / 'data' / 'update-backup').glob('*'))), 1)

        status, rolled = self.request('?action=rollback', method='POST')
        self.assertEqual(status, 200, rolled)
        self.assertEqual(rolled['from'], '2.1.9')
        self.assertEqual(self.read('index.html'), b'<!doctype html><title>old</title>\n')
        self.assertEqual(self.read('assets/update/update-check.js'), b'// old updater\n')
        self.assertEqual(self.read('assets/update/app-version.js'), b'window.ATO_APP_VERSION = "2.1.9";\n')
        self.assertTrue(self.exists('story/old-module.js'))
        self.assertTrue(self.exists('assets/renamed/old.js'))
        self.assertFalse(self.exists('assets/new-module.js'))
        self.assertFalse(self.exists('release-notes/v9.9.9.md'))
        self.assertFalse(self.exists('assets/renamed/new.js'))
        self.assertEqual(self.read('data/ato-users.json'), b'{"users":["private"]}\n')

    def test_stage_requires_git_blob_digest(self):
        self.wait_ready()
        content = b'// digest forms\n'
        status, plan = self.begin({
            'current': '2.1.9', 'target': 'v9.9.9',
            'files': [
                {'filename': 'assets/digest-blob.js', 'status': 'added', 'sha': git_blob_sha(content)},
                {'filename': 'assets/digest-plain.js', 'status': 'added',
                 'sha': hashlib.sha1(content).hexdigest()},
            ],
        })
        self.assertEqual(status, 200, plan)
        digests = {entry['path']: entry['sha'] for entry in plan['downloads']}
        status, staged = self.stage('assets/digest-blob.js', content, digests['assets/digest-blob.js'])
        self.assertEqual(status, 200, staged)
        status, result = self.stage('assets/digest-plain.js', content, digests['assets/digest-plain.js'])
        self.assertEqual((status, result['code']), (502, 'CHECKSUM_MISMATCH'))
        self.assertFalse(self.request('?action=status')[1]['canCommit'])

    def test_commit_without_plan_and_cancel(self):
        self.wait_ready()
        status, payload = self.request('?action=commit', method='POST')
        self.assertEqual(status, 409)
        self.assertEqual(payload['code'], 'NO_PLAN')

        self.begin()
        self.stage('index.html', self.NEW_FILES['index.html'])
        status, payload = self.request('?action=cancel', method='POST')
        self.assertEqual(status, 200)
        self.assertEqual(list((self.root / 'data' / 'update-staging').glob('*')), [])
        status, payload = self.request('?action=commit', method='POST')
        self.assertEqual(status, 409)
        self.assertEqual(payload['code'], 'NO_PLAN')

    def test_unknown_action_and_method(self):
        self.wait_ready()
        status, payload = self.request('?action=nope', method='POST')
        self.assertEqual(status, 400)
        self.assertEqual(payload['code'], 'UNKNOWN_ACTION')
        status, payload = self.request('?action=begin', method='GET')
        self.assertEqual(status, 405)

    def stage_all(self, metadata=None, contents=None):
        status, plan = self.begin(metadata)
        self.assertEqual(status, 200, plan)
        for entry in plan['downloads']:
            status, staged = self.stage(entry['path'], (contents or self.NEW_FILES)[entry['path']], entry['sha'])
            self.assertEqual(status, 200, staged)
        return plan

    def test_stale_page_and_version_changed_during_download(self):
        self.wait_ready()
        stale = self.compare_fixture()
        stale['current'] = '2.1.8'
        status, result = self.begin(stale)
        self.assertEqual((status, result['code']), (409, 'VERSION_CHANGED'))
        self.stage_all()
        self.write('assets/update/app-version.js', b'window.ATO_APP_VERSION = "2.2.0";\n')
        status, result = self.request('?action=commit', method='POST')
        self.assertEqual((status, result['code']), (409, 'VERSION_CHANGED'))
        self.assertIn(b'old', self.read('index.html'))

    def test_other_tab_cannot_stage_commit_or_cancel_new_plan(self):
        self.wait_ready()
        old = self.stage_all()['planId']
        new = self.stage_all()['planId']
        self.assertNotEqual(old, new)
        for action in ('stage', 'commit', 'cancel'):
            status, result = self.request('?action=' + action + '&plan=' + old, method='POST')
            self.assertEqual((status, result['code']), (409, 'PLAN_CHANGED'))
        status, result = self.request('?action=commit', method='POST')
        self.assertEqual(status, 200, result)

    def test_deletion_only_and_metadata_only_releases(self):
        self.wait_ready()
        for version, files in [('2.2.0', [{'filename': 'story/old-module.js', 'status': 'removed'}]), ('2.2.1', [])]:
            current = '2.1.9' if version == '2.2.0' else '2.2.0'
            self.stage_all({'current': current, 'target': version, 'files': files})
            self.assertTrue(self.request('?action=status')[1]['canCommit'])
            status, result = self.request('?action=commit', method='POST')
            self.assertEqual(status, 200, result)
            self.assertIn(version.encode(), self.read('assets/update/app-version.js'))
        self.assertFalse(self.exists('story/old-module.js'))

    def test_literal_percent_filename_and_repeated_upload_near_total_limit(self):
        self.wait_ready()
        contents = {'assets/100%20done.js': b'x' * (8 * 1024 * 1024)}
        for i in range(3):
            contents[f'assets/large-{i}.js'] = b'y' * (8 * 1024 * 1024)
        plan = self.stage_all({'current': '2.1.9', 'target': 'v9.9.9', 'files': [
            {'filename': name, 'status': 'added', 'sha': git_blob_sha(data)} for name, data in contents.items()
        ]}, contents)
        for entry in plan['downloads']:
            status, result = self.stage(entry['path'], contents[entry['path']])
            self.assertEqual(status, 200, result)
        self.assertTrue(self.request('?action=status')[1]['canCommit'])

    def test_failed_commit_preserves_original_backup_and_blocks_retry(self):
        self.wait_ready()
        self.stage_all()
        # 文件被目录占用，先写 index 后写此路径时失败。
        self.write('assets/update/update-check.js', b'// old updater\n').unlink()
        (self.root / 'assets/update/update-check.js').mkdir()
        status, result = self.request('?action=commit', method='POST')
        self.assertEqual((status, result['code']), (500, 'APPLY_FAILED'))
        self.assertIn(b'new', self.read('index.html'))
        self.assertTrue(self.request('?action=status')[1]['needsRecovery'])
        for action in ('commit', 'begin'):
            status, result = self.request('?action=' + action, method='POST',
                                          body={'current': '2.1.9', 'target': 'v9.9.9'})
            self.assertEqual((status, result['code']), (409, 'RECOVERY_REQUIRED'))
        (self.root / 'assets/update/update-check.js').rmdir()
        status, result = self.request('?action=rollback', method='POST')
        self.assertEqual(status, 200, result)
        self.assertIn(b'old', self.read('index.html'))
        self.assertFalse(self.request('?action=status')[1]['needsRecovery'])

    def test_version_write_failure_is_not_success(self):
        self.wait_ready()
        self.stage_all()
        # 故障注入只修改临时安装副本，精确模拟版本文件落盘失败。
        endpoint = self.root / 'api/app-update.php'
        source = endpoint.read_text(encoding='utf-8')
        source = source.replace("if (!ato_update_write_atomic($versionFile,", "if (true || !ato_update_write_atomic($versionFile,")
        endpoint.write_text(source, encoding='utf-8')
        status, result = self.request('?action=commit', method='POST')
        self.assertEqual((status, result['code']), (500, 'APPLY_FAILED'))
        self.assertIn(b'2.1.9', self.read('assets/update/app-version.js'))
        self.assertTrue(self.request('?action=status')[1]['canRollback'])
        self.assertEqual(self.request('?action=rollback', method='POST')[0], 200)
        self.assertIn(b'old', self.read('index.html'))

    def test_backup_manifest_write_failure_prevents_any_apply(self):
        self.wait_ready()
        self.stage_all()
        endpoint = self.root / 'api/app-update.php'
        source = endpoint.read_text(encoding='utf-8').replace(
            'if (!ato_update_write_plan($backupDir, $backupPlan))',
            'if (true || !ato_update_write_plan($backupDir, $backupPlan))')
        endpoint.write_text(source, encoding='utf-8')
        status, result = self.request('?action=commit', method='POST')
        self.assertEqual((status, result['code']), (500, 'BACKUP_FAILED'))
        self.assertIn(b'old', self.read('index.html'))
        self.assertFalse(self.request('?action=status')[1]['canRollback'])

    def test_multiple_backups_rollback_newest_then_previous(self):
        self.wait_ready()
        for current, target in [('2.1.9', 'v9.9.9'), ('9.9.9', 'v10.0.0')]:
            self.stage_all({'current': current, 'target': target, 'files': []})
            status, result = self.request('?action=commit', method='POST')
            self.assertEqual(status, 200, result)
        self.assertEqual(len(list((self.root / 'data/update-backup').glob('*'))), 2)
        self.assertEqual(self.request('?action=rollback', method='POST')[1]['from'], '9.9.9')
        self.assertIn(b'9.9.9', self.read('assets/update/app-version.js'))
        self.assertEqual(self.request('?action=rollback', method='POST')[1]['from'], '2.1.9')
        self.assertFalse(self.request('?action=status')[1]['canRollback'])

    def test_damaged_backup_cannot_delete_original_files(self):
        self.wait_ready()
        self.stage_all()
        applied = self.request('?action=commit', method='POST')[1]
        backup = self.root / 'data/update-backup' / applied['backup']
        (backup / 'index.html').unlink()
        status, result = self.request('?action=rollback', method='POST')
        self.assertEqual((status, result['code']), (409, 'BACKUP_DAMAGED'))
        self.assertIn(b'new', self.read('index.html'))

    def test_updater_can_replace_itself_and_restore_itself_on_windows(self):
        self.wait_ready()
        original = {name: self.read(name) for name in ('api/app-update.php', 'api/app-update-policy.php', 'router.php')}
        contents = {name: data + b'\n// updated fixture\n' for name, data in original.items()}
        self.stage_all({'current': '2.1.9', 'target': 'v9.9.9', 'files': [
            {'filename': name, 'status': 'modified', 'sha': git_blob_sha(data)} for name, data in contents.items()
        ]}, contents)
        status, result = self.request('?action=commit', method='POST')
        self.assertEqual(status, 200, result)
        for name, data in contents.items():
            self.assertEqual(self.read(name), data)
        self.assertTrue(self.request('?action=status')[1]['canRollback'])
        status, result = self.request('?action=rollback', method='POST')
        self.assertEqual(status, 200, result)
        for name, data in original.items():
            self.assertEqual(self.read(name), data)
        self.request('?action=status')
        self.assertEqual(list((self.root / 'api').glob('.ato-update-*.php')), [])

    def test_stale_rollback_does_not_restore_an_unexpected_backup(self):
        self.wait_ready()
        self.stage_all({'current': '2.1.9', 'target': 'v2.2.0', 'files': []})
        self.assertEqual(self.request('?action=commit', method='POST')[0], 200)
        old = self.request('?action=status')[1]['backupId']
        self.stage_all({'current': '2.2.0', 'target': 'v2.3.0', 'files': []})
        self.assertEqual(self.request('?action=commit', method='POST')[0], 200)
        status, result = self.request('?action=rollback', method='POST', body={'backupId': old})
        self.assertEqual((status, result['code']), (409, 'BACKUP_CHANGED'))
        self.assertIn(b'2.3.0', self.read('assets/update/app-version.js'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
