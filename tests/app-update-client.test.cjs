'use strict';
// 一键更新的「客户端」集成测试：把真实的前端脚本 assets/update/update-check.js
// 放进一个最小 DOM 环境里跑，fetch 指向真实的本地 PHP 服务，GitHub 那几个请求用
// 桩应答。这样能覆盖浏览器里真正会发生的那条路：检查更新 → 亮出按钮 → 点击 →
// begin / stage / commit → 磁盘上的程序文件被替换。
//
// 服务端自身的校验规则由 tests/test_app_update.py 覆盖。没有 PHP 时跳过。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const REPO_API = 'https://api.github.com/repos/banard2049-cpu/ATO_assistant';
const RAW_BASE = 'https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant';

const phpAvailable = (() => {
  try {
    return spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
})();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const blobSha = (buffer) =>
  crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer])).digest('hex');

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate, timeout = 20000, errorMessage = 'condition not met') {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error(typeof errorMessage === 'function' ? errorMessage() : errorMessage);
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

function binaryResponse(buffer) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

/** 最小 DOM + fetch 桩，把 update-check.js 当成浏览器里的脚本跑起来。 */
function loadUpdater({ base, sessionId, release, compare, raw }) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        selector,
        textContent: '',
        // 和真实 HTML 一致：这些控件默认带 hidden 属性，等脚本判定后才显示。
        hidden: true,
        disabled: false,
        href: '',
        listeners: {},
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener(type, handler) {
          (this.listeners[type] = this.listeners[type] || []).push(handler);
        },
        click() {
          for (const handler of this.listeners.click || []) handler();
        },
      });
    }
    return elements.get(selector);
  };

  const fetchStub = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith(REPO_API)) {
      if (url.includes('/releases')) return jsonResponse(200, [release]);
      if (url.includes('/compare/')) return jsonResponse(200, compare);
      return jsonResponse(404, {});
    }
    if (url.startsWith(RAW_BASE)) {
      const tail = url.slice(RAW_BASE.length + 1);
      const relative = decodeURIComponent(tail.slice(tail.indexOf('/') + 1));
      const content = raw[relative];
      return content === undefined ? jsonResponse(404, {}) : binaryResponse(content);
    }
    // 相对地址 → 真实的本地 PHP 服务。Node 的 fetch 不保存 cookie，这里补上会话。
    const target = new URL(url, base).toString();
    const headers = { ...(init.headers || {}), Cookie: `PHPSESSID=${sessionId}` };
    return fetch(target, { ...init, headers });
  };

  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    // vm 的新上下文只有 ECMAScript 内建对象，浏览器/Node 的宿主全局要显式给全。
    AbortController,
    setInterval: () => 0,
    clearInterval: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { hidden: false, querySelector: element },
    window: { ATO_APP_VERSION: '2.1.9', location: { reload() {} } },
    fetch: fetchStub,
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/update/update-check.js'), 'utf8'), context);
  return element;
}

test('一键更新：从检查更新到落盘的完整客户端流程', { skip: !phpAvailable && 'PHP is not installed' }, async () => {
  const workspace = path.join(root, 'tmp', `update-client-${crypto.randomUUID()}`);
  const sessionId = crypto.randomUUID().replace(/-/g, '');
  let server = null;

  try {
    // 一个「已安装 2.1.9」的便携版目录
    fs.mkdirSync(path.join(workspace, 'api'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'data', 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'runtime', 'php'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'assets', 'update'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'assets', 'bgm'), { recursive: true });
    fs.copyFileSync(path.join(root, 'api', 'app-update.php'), path.join(workspace, 'api', 'app-update.php'));
    fs.copyFileSync(path.join(root, 'api', 'app-update-policy.php'), path.join(workspace, 'api', 'app-update-policy.php'));
    fs.writeFileSync(path.join(workspace, 'data', 'sessions', `sess_${sessionId}`), 'ato_user_id|s:4:"test";');
    fs.writeFileSync(path.join(workspace, 'data', 'ato-users.json'), '{"users":["private"]}\n');
    fs.writeFileSync(path.join(workspace, 'index.html'), '<!doctype html><title>old</title>\n');
    fs.writeFileSync(path.join(workspace, 'assets', 'update', 'app-version.js'), 'window.ATO_APP_VERSION = "2.1.9";\n');
    fs.writeFileSync(path.join(workspace, 'assets', 'bgm', 'song.mp3'), 'ID3 user audio\n');

    const port = await freePort();
    const log = fs.openSync(path.join(workspace, 'server.log'), 'w');
    server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', workspace], {
      cwd: workspace,
      stdio: ['ignore', log, log],
    });
    const base = `http://127.0.0.1:${port}/`;
    await waitFor(() => server.exitCode === null, 5000, 'php server did not stay up');
    // 等内置服务器真的开始接请求：脚本一加载就会做能力探测，探测失败会退回手动更新。
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${base}api/app-update.php?action=status`, {
          headers: { Cookie: `PHPSESSID=${sessionId}` },
        });
        if (response.status === 200) { ready = true; break; }
      } catch {
        // 还没起来
      }
      await sleep(50);
    }
    assert.ok(ready, '本地 PHP 服务没有就绪');

    const newIndex = Buffer.from('<!doctype html><title>new</title>\n');
    const newModule = Buffer.from('// brand new module\n');
    const newJs = Buffer.from('// new updater\n');
    const release = { tag_name: 'v9.9.9', draft: false, prerelease: false, body: '## 9.9.9' };
    const compare = {
      status: 'ahead',
      files: [
        { filename: 'index.html', status: 'modified', sha: blobSha(newIndex) },
        { filename: 'assets/new-module.js', status: 'added', sha: blobSha(newModule) },
        { filename: 'assets/update/update-check.js', status: 'modified', sha: blobSha(newJs) },
        // 发布包里没有的路径：必须被服务端筛掉
        { filename: 'tools/helper.py', status: 'added', sha: blobSha(Buffer.from('no\n')) },
        { filename: 'assets/bgm/song.mp3', status: 'modified', sha: blobSha(Buffer.from('bad\n')) },
      ],
    };
    const raw = {
      'index.html': newIndex,
      'assets/new-module.js': newModule,
      'assets/update/update-check.js': newJs,
    };

    const element = loadUpdater({ base, sessionId, release, compare, raw });

    // 检查更新 → 发现新版本 → 服务端说支持 → 亮出「一键更新」
    await waitFor(
      () => element('#applyUpdateButton').hidden === false,
      20000,
      () => `一键更新按钮没有出现；状态="${element('#updateStatus').textContent}" `
        + `公告hidden=${element('#updateNotice').hidden} 按钮hidden=${element('#applyUpdateButton').hidden}`
    );
    assert.equal(element('#applyUpdateTarget').textContent, 'v9.9.9');
    assert.equal(element('#checkUpdateButton').disabled, false);

    // 点击 → 走完 begin / stage / commit
    element('#applyUpdateButton').click();
    await waitFor(
      () => /已更新到 v9\.9\.9/.test(element('#applyUpdateStatus').textContent),
      30000,
      `更新没有完成，当前状态：${element('#applyUpdateStatus').textContent}`
    );

    assert.equal(fs.readFileSync(path.join(workspace, 'index.html'), 'utf8'), '<!doctype html><title>new</title>\n');
    assert.equal(fs.readFileSync(path.join(workspace, 'assets', 'new-module.js'), 'utf8'), '// brand new module\n');
    assert.equal(fs.readFileSync(path.join(workspace, 'assets', 'update', 'update-check.js'), 'utf8'), '// new updater\n');
    assert.equal(
      fs.readFileSync(path.join(workspace, 'assets', 'update', 'app-version.js'), 'utf8'),
      'window.ATO_APP_VERSION = "9.9.9";\n'
    );
    // 发布包不带的路径：不该被创建，也不该覆盖用户自己的文件
    assert.equal(fs.existsSync(path.join(workspace, 'tools', 'helper.py')), false);
    assert.equal(fs.readFileSync(path.join(workspace, 'assets', 'bgm', 'song.mp3'), 'utf8'), 'ID3 user audio\n');
    assert.equal(fs.readFileSync(path.join(workspace, 'data', 'ato-users.json'), 'utf8'), '{"users":["private"]}\n');
    // 更新完必须提示刷新，并提供还原入口
    assert.equal(element('#reloadUpdateButton').hidden, false);
    assert.equal(element('#rollbackUpdateButton').hidden, false);
    assert.match(element('#updateStatus').textContent, /请刷新页面/);

    // 还原上一版
    element('#rollbackUpdateButton').click();
    await waitFor(
      () => /已还原/.test(element('#applyUpdateStatus').textContent),
      20000,
      `还原没有完成，当前状态：${element('#applyUpdateStatus').textContent}`
    );
    assert.equal(fs.readFileSync(path.join(workspace, 'index.html'), 'utf8'), '<!doctype html><title>old</title>\n');
    assert.equal(fs.existsSync(path.join(workspace, 'assets', 'new-module.js')), false);
  } finally {
    if (server) server.kill();
    await sleep(200);
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
