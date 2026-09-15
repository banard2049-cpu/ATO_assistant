const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const scriptPath = path.join(__dirname, '..', 'assets', 'update', 'update-check.js');
const { isNewer, validRelease, rateLimitNotice, messageFor, RETRY_DELAY } = require(scriptPath);
const source = fs.readFileSync(scriptPath, 'utf8');

function response(status, { body = {}, headers = {} } = {}) {
  const lowered = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (lowered.has(String(name).toLowerCase()) ? lowered.get(String(name).toLowerCase()) : null) },
    json: async () => body,
  };
}

function setup({ version = '1.2.9', release = { tag_name: 'v1.2.10', body: '<script>bad()</script>\n修复说明' }, storage = new Map(), fail = false, handler = null } = {}) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
    return nodes.get(id);
  }
  let requests = 0;
  const context = {
    window: { ATO_APP_VERSION: version }, document: { querySelector: node },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    AbortController, setTimeout, clearTimeout, setInterval() {},
    async fetch() {
      requests += 1;
      if (handler) return handler(requests);
      if (fail) throw new Error('offline');
      return response(200, { body: release });
    },
  };
  vm.runInNewContext(source, context);
  return { node, storage, requests: () => requests };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
// 失败后会隔 RETRY_DELAY 再试一次，断言最终状态必须等重试跑完。
const settleAfterRetry = () => new Promise(resolve => setTimeout(resolve, RETRY_DELAY + 400));

test('版本比较按数字处理，正式版高于同版本预发布版', () => {
  assert.ok(isNewer('v1.2.10', '1.2.9'));
  assert.ok(!isNewer('v1.2.9', '1.2.10'));
  assert.ok(!isNewer('v1.2.9', '1.2.9'));
  assert.ok(isNewer('v1.2.9', '1.2.9-beta.1'));
  assert.ok(!isNewer('v1.2.10', 'local'));
  assert.ok(!validRelease({ tag_name: 'v2.0.0', draft: true }));
  assert.ok(!validRelease({ tag_name: 'v2.0.0-beta', prerelease: false }));
});
test('新版本显示更新报告和固定仓库链接，跳过可持久化且手动检查可重看', async () => {
  const first = setup(); await settle();
  assert.equal(first.node('#updateNotice').hidden, false);
  assert.equal(first.node('#updateReport').textContent, '<script>bad()</script>\n修复说明');
  assert.equal(first.node('#updateReport').innerHTML, undefined);
  assert.equal(first.node('#updateGithubLink').href, 'https://github.com/banard2049-cpu/ATO_assistant/releases/tag/v1.2.10');
  first.node('#skipUpdateButton').handlers.click();
  const second = setup({ storage: first.storage }); await settle();
  assert.equal(second.requests(), 0);
  assert.equal(second.node('#updateNotice').hidden, true);
  await second.node('#checkUpdateButton').handlers.click();
  assert.equal(second.requests(), 1);
  assert.equal(second.node('#updateNotice').hidden, false);
  first.storage.delete('ato-update-cache-v1');
  const third = setup({ storage: first.storage, release: { tag_name: 'v1.2.11' } }); await settle();
  assert.equal(third.node('#updateNotice').hidden, false);
});
test('最新版本、离线失败和未知本地版本不会误报可更新', async () => {
  const latest = setup({ version: '1.2.10' }); await settle();
  assert.equal(latest.node('#updateNotice').hidden, true);
  assert.match(latest.node('#updateStatus').textContent, /最新/);
  const offline = setup({ fail: true }); await settleAfterRetry();
  assert.match(offline.node('#updateStatus').textContent, /无法检查/);
  assert.equal(offline.requests(), 2);
  assert.equal(offline.node('#checkUpdateButton').disabled, false);
  const local = setup({ version: 'local' }); await settle();
  assert.equal(local.node('#updateNotice').hidden, true);
  assert.match(local.node('#updateStatus').textContent, /开发版/);
});
test('index.html 引用 assets/update 下的脚本，避免移动后静默 404', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const reference of ['update-check.css', 'app-version.js', 'update-check.js']) {
    const relative = `./assets/update/${reference}`;
    assert.ok(html.includes(relative), `index.html 未引用 ${relative}`);
    assert.ok(fs.existsSync(path.join(root, 'assets', 'update', reference)), `缺少 assets/update/${reference}`);
  }
  assert.ok(!html.includes('./update-check.js'), 'index.html 仍引用根目录的 update-check.js');
  assert.ok(!html.includes('./app-version.js'), 'index.html 仍引用根目录的 app-version.js');
  const sectionAt = html.indexOf('class="app-updates"');
  assert.ok(sectionAt > html.indexOf('class="app-credit"'), '版本更新区块应排在页脚之后');
  assert.ok(sectionAt < html.indexOf('</main>'), '版本更新区块应留在 #appShell 内');
});
test('限流提示只在 403/429 且额度为 0 时出现', () => {
  const reset = String(Math.floor(Date.now() / 1000) + 600);
  assert.match(rateLimitNotice(403, '0', reset, Date.now()), /限流/);
  assert.match(rateLimitNotice(429, 0, reset, Date.now()), /限流/);
  assert.equal(rateLimitNotice(403, '12', reset, Date.now()), '');
  assert.equal(rateLimitNotice(403, '0', null, Date.now()), '');
  assert.equal(rateLimitNotice(200, '0', reset, Date.now()), '');
  assert.equal(rateLimitNotice(500, '0', reset, Date.now()), '');
  assert.match(messageFor({ kind: 'timeout' }), /超时/);
  assert.match(messageFor({ kind: 'network' }), /无法检查更新/);
  assert.match(messageFor({ kind: 'empty' }), /暂无正式版发布/);
});
test('限流 403 会重试一次：仍限流则说明原因，重试成功则正常提示', async () => {
  const reset = String(Math.floor((Date.now() + 10 * 60 * 1000) / 1000));
  const limited = () => response(403, { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } });
  const always = setup({ handler: limited });
  await settleAfterRetry();
  assert.equal(always.requests(), 2);
  assert.match(always.node('#updateStatus').textContent, /限流/);
  assert.match(always.node('#updateStatus').textContent, /分钟后/);
  assert.equal(always.node('#updateNotice').hidden, true);
  const recovered = setup({ handler: (attempt) => (attempt === 1 ? limited() : response(200, { body: { tag_name: 'v1.2.10', body: '修复说明' } })) });
  await settleAfterRetry();
  assert.equal(recovered.requests(), 2);
  assert.match(recovered.node('#updateStatus').textContent, /发现新版本 v1\.2\.10/);
  assert.equal(recovered.node('#updateNotice').hidden, false);
});
test('404/无正式版不会重试', async () => {
  const empty = setup({ handler: () => response(404) });
  await settleAfterRetry();
  assert.equal(empty.requests(), 1);
  assert.match(empty.node('#updateStatus').textContent, /暂无正式版发布/);
});
