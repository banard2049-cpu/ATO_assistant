"""Disposable manual-browser fixture. Run python -B tests/update_browser_fixture.py.

Copies tracked application files into tmp, supplies synthetic GitHub responses to
both the browser and copied PHP updater, and runs the real local APIs.
Stop with Ctrl+C. Fixture files remain under tmp for inspecting test evidence.
"""
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request
import uuid

from test_app_update import (
    ROOT,
    fixture_commit,
    github_release_responses,
    git_blob_sha,
    install_fixture_transport,
)


def main():
    fixture = ROOT / 'tmp' / ('browser-update-' + uuid.uuid4().hex[:10])
    fixture.mkdir(parents=True)
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    tracked += ['api/app-update.php', 'api/app-update-policy.php']
    for name in tracked:
        if not name or name.split('/')[0] in {'.git', '.github', 'data', 'tests', 'tools', 'official-assets'}:
            continue
        source = ROOT / name
        if not source.is_file():
            continue
        target = fixture / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (fixture / 'runtime/php').mkdir(parents=True)
    (fixture / 'data').mkdir()
    install_fixture_transport(fixture)
    (fixture / 'data/browser-test-sentinel.txt').write_text('synthetic save: preserve me', encoding='utf-8')
    (fixture / 'assets/update-fixture-blocked.js').mkdir()
    (fixture / 'assets/update-fixture-old.js').write_text('// old module\n', encoding='utf-8')
    (fixture / 'tools').mkdir()
    shutil.copyfile(ROOT / 'tools/matrix.html', fixture / 'tools/matrix.html')
    tag = 'v9.9.9'
    commit = fixture_commit(tag)
    shim = '''<script>
    (() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = String(input);
        const scenario = document.querySelector('#fixtureScenario')?.value || 'normal';
        if (url.includes('/api/app-update.php?action=begin')) {
          document.cookie = 'ato_update_fixture_scenario=' + encodeURIComponent(scenario) + '; Path=/; SameSite=Lax';
        }
        if (url.startsWith('https://api.github.com/repos/banard2049-cpu/ATO_assistant/releases')) {
          return originalFetch('/fixture.php?kind=release&scenario=' + encodeURIComponent(scenario), init);
        }
        const rawBase = 'https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/';
        const rawPrefix = rawBase + '__FIXTURE_COMMIT__' + '/';
        if (url.startsWith(rawBase)) {
          if (!url.startsWith(rawPrefix)) return Promise.reject(new Error('Expected the verified release commit'));
          const path = decodeURIComponent(url.slice(rawPrefix.length));
          return originalFetch('/fixture.php?kind=raw&scenario=' + encodeURIComponent(scenario) + '&path=' + encodeURIComponent(path), init);
        }
        return originalFetch(input, init);
      };
    })();
    </script>'''.replace('__FIXTURE_COMMIT__', commit)
    controls = '''<label style="display:block;padding:12px;background:#483e20;color:white" for="fixtureScenario">隔离测试场景</label>
    <select id="fixtureScenario" style="margin:12px">
      <option value="normal">正常更新</option><option value="checksum">下载内容损坏</option>
      <option value="apply-failure">写入文件被占用</option><option value="offline">GitHub 不可用</option>
    </select>'''
    dashboard = (fixture / 'index.html').read_text(encoding='utf-8')
    dashboard = dashboard.replace('<head>', '<head>' + shim, 1).replace('<body>', '<body>' + controls, 1)
    (fixture / 'index.html').write_text(dashboard, encoding='utf-8')
    contents = {'assets/update-fixture-new.js': '// browser fixture updated\n'}
    for name in ['api/app-update.php', 'api/app-update-policy.php', 'assets/update/update-check.js']:
        contents[name] = (fixture / name).read_text(encoding='utf-8') + '\n// browser fixture version\n'
    files = [{'filename': name, 'status': 'modified', 'sha': git_blob_sha(text.encode())} for name, text in contents.items()]
    files.append({'filename': 'assets/update-fixture-old.js', 'status': 'removed'})
    blocked = {
        'filename': 'assets/update-fixture-blocked.js', 'status': 'added',
        'sha': git_blob_sha(b'// blocked\n'),
    }
    current = (fixture / 'assets/update/app-version.js').read_text(encoding='utf-8').split('"')[1]
    normal = github_release_responses(current, tag, files)
    responses = {
        'normal': normal,
        'checksum': normal,
        'apply-failure': github_release_responses(current, tag, [*files, blocked]),
        'offline': {},
    }
    (fixture / 'data/github-update-fixture.json').write_text(json.dumps(responses), encoding='utf-8')
    manifest = {'contents': contents, 'release': {
        **normal[f'releases/tags/{tag}'], 'body': '隔离测试版本：下载、校验、写入、删除、自更新、还原。',
    }}
    (fixture / 'data/fixture.json').write_text(json.dumps(manifest), encoding='utf-8')
    (fixture / 'fixture.php').write_text('''<?php
    $fixture = json_decode(file_get_contents(__DIR__ . '/data/fixture.json'), true);
    $kind = $_GET['kind'] ?? '';
    $scenario = $_GET['scenario'] ?? 'normal';
    header('Cache-Control: no-store');
    if ($scenario === 'offline') { http_response_code(503); echo '{}'; exit; }
    if ($kind === 'raw') {
      $path = $_GET['path'] ?? '';
      if ($scenario === 'checksum') { echo 'broken fixture content'; exit; }
      echo $path === 'assets/update-fixture-blocked.js' ? "// blocked\\n" : ($fixture['contents'][$path] ?? '');
      exit;
    }
    header('Content-Type: application/json');
    if ($kind === 'release') { echo json_encode([$fixture['release']]); exit; }
    http_response_code(404);
    ''', encoding='utf-8')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    log = (fixture / 'server.log').open('wb')
    server = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', '-t', str(fixture), str(fixture / 'router.php')],
        cwd=fixture, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    try:
        for _ in range(50):
            try:
                request = urllib.request.Request(f'http://127.0.0.1:{port}/api/campaign-state.php?action=register',
                    data=json.dumps({'username':'browser_fixture', 'password':'fixture-only'}).encode(),
                    headers={'Content-Type':'application/json'})
                urllib.request.urlopen(request, timeout=3).close()
                break
            except OSError:
                time.sleep(.1)
        print(json.dumps({'root':str(fixture),'url':f'http://127.0.0.1:{port}/', 'pid':server.pid}), flush=True)
        server.wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.terminate()
        server.wait(timeout=10)
        log.close()


if __name__ == '__main__':
    main()
