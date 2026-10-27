const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../briefing/briefing-backups.js'), 'utf8');

function harness({ native, fetch = async () => { throw new Error('Unexpected request'); } } = {}) {
  const elements = {};
  for (const id of ['exportBackupsButton', 'importBackupsButton', 'backupZipInput', 'backupStatus']) {
    elements[id] = { dataset: {}, value: '', events: {}, attrs: {}, files: [],
      addEventListener(name, handler) { this.events[name] = handler; },
      setAttribute(name, value) { this.attrs[name] = value; },
      click() { this.clicked = true; return this.events.click?.(); },
    };
  }
  const downloads = [], busy = [], imported = [], requests = [];
  const sandbox = { URL, fetch: async (...args) => { requests.push(args); return fetch(...args); },
    window: { location: { href: 'http://localhost/briefing/index.html', origin: 'http://localhost' }, ATOAndroid: native },
    document: { getElementById: (id) => elements[id], body: { appendChild(anchor) { downloads.push(anchor); } },
      createElement() { return { click() { this.clicked = true; }, remove() { this.removed = true; } }; } },
  };
  vm.runInNewContext(script, sandbox);
  sandbox.window.ATO_BRIEFING_BACKUPS.bind({ onBusyChange(value) { busy.push(value); }, onImported(value) { imported.push(value); } });
  return { ...sandbox, elements, requests, downloads, busy, imported };
}
const response = (result, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => result });
const finish = () => new Promise((resolve) => setImmediate(resolve));

test('浏览器准备导出后由下载链接保存 ZIP，页面不读取压缩包字节', async () => {
  const h = harness({ fetch: async (url, options) => {
    assert.equal(url, 'backups.php?action=prepare-export');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-ATO-Backup'], '1');
    return response({ ok: true, total: 80, filename: 'all-backups.zip', downloadUrl: 'backups.php?action=download&token=test' });
  } });
  await h.elements.exportBackupsButton.click();
  assert.equal(h.downloads.length, 1);
  assert.equal(h.downloads[0].download, 'all-backups.zip');
  assert.equal(h.downloads[0].clicked, true);
  assert.equal(h.downloads[0].removed, true);
  assert.match(h.elements.backupStatus.textContent, /80 份/);
  assert.deepEqual(h.busy, [true, false]);
});

test('浏览器上传 ZIP 直接发送文件，并在成功合并后重读简报', async () => {
  const zip = { name: 'all.zip', size: 120, arrayBuffer() { throw new Error('Do not buffer file'); } };
  const h = harness({ fetch: async (url, options) => {
    assert.equal(url, 'backups.php?action=import');
    assert.equal(options.method, 'PUT');
    assert.equal(options.body, zip);
    assert.equal(options.headers['Content-Type'], 'application/zip');
    return response({ ok: true, imported: 5, skipped: 2, cycles: [{ profileId: 'ship', cycleId: 'c1' }] });
  } });
  h.elements.importBackupsButton.click();
  assert.equal(h.elements.backupZipInput.clicked, true);
  h.elements.backupZipInput.files = [zip];
  await h.elements.backupZipInput.events.change();
  await finish();
  assert.equal(h.imported.length, 1);
  assert.equal(h.busy.at(-1), false);
  assert.match(h.elements.backupStatus.textContent, /导入 5 份.*跳过 2 份/);
  assert.equal(h.elements.backupZipInput.value, '');
});

test('不接受超大或非 ZIP 文件，失败后能重新选择', async () => {
  const h = harness();
  for (const file of [{ name: 'save.json', size: 12 }, { name: 'large.zip', size: 513 * 1024 * 1024 }]) {
    h.elements.backupZipInput.files = [file];
    h.elements.backupZipInput.events.change();
    await finish();
    assert.equal(h.elements.backupStatus.dataset.state, 'error');
    assert.equal(h.elements.importBackupsButton.disabled, false);
  }
  assert.equal(h.requests.length, 0);
});

test('导出失败和导入服务限制明确显示，不报成功', async () => {
  const h = harness({ fetch: async () => response({ ok: false, error: '没有每日备份' }, 404) });
  await h.elements.exportBackupsButton.click();
  assert.equal(h.downloads.length, 0);
  assert.match(h.elements.backupStatus.textContent, /没有每日备份/);
  const invalid = harness({ fetch: async () => ({ ok: false, status: 413, json: async () => { throw new SyntaxError(); } }) });
  invalid.elements.backupZipInput.files = [{ name: 'all.zip', size: 10 }];
  invalid.elements.backupZipInput.events.change();
  await finish();
  assert.match(invalid.elements.backupStatus.textContent, /HTTP 413/);
  assert.equal(invalid.imported.length, 0);
});

test('安卓保存和导入等待独立原生回调，取消不重读，成功导入才重读', async () => {
  const calls = [];
  const h = harness({ native: { exportDailyBackups() { calls.push('export'); return true; }, importDailyBackups() { calls.push('import'); return true; } } });
  const exporting = h.elements.exportBackupsButton.click();
  assert.deepEqual(calls, ['export']);
  assert.equal(h.elements.exportBackupsButton.disabled, true);
  h.window.ATOAndroidBackupsResult({ ok: false, action: 'export', cancelled: true });
  await exporting;
  assert.match(h.elements.backupStatus.textContent, /已取消导出/);
  assert.equal(h.window.ATOAndroidBackupsResult, undefined);
  h.elements.importBackupsButton.click();
  h.window.ATOAndroidBackupsResult({ ok: true, action: 'import', imported: 10, skipped: 0 });
  await finish();
  assert.equal(h.imported.length, 1);
  assert.match(h.elements.backupStatus.textContent, /导入 10 份/);
  assert.equal(h.requests.length, 0);
});

test('旧 APK 明确要求更新，启动失败清理回调且允许重试', async () => {
  const old = harness({ native: {} });
  await old.elements.exportBackupsButton.click();
  assert.match(old.elements.backupStatus.textContent, /新版 APK/);
  const h = harness({ native: { exportDailyBackups() { return false; } } });
  await h.elements.exportBackupsButton.click();
  assert.equal(h.window.ATOAndroidBackupsResult, undefined);
  assert.equal(h.elements.exportBackupsButton.disabled, false);
  assert.match(h.elements.backupStatus.textContent, /无法开始/);
});

test('已有备份操作运行时不并发开始第二次', async () => {
  let release;
  const h = harness({ fetch: () => new Promise((resolve) => { release = resolve; }) });
  const pending = h.elements.exportBackupsButton.click();
  h.elements.importBackupsButton.click();
  assert.equal(h.elements.backupZipInput.clicked, undefined);
  assert.equal(h.requests.length, 1);
  release(response({ ok: false, error: 'empty' }, 404));
  await pending;
  assert.deepEqual(h.busy, [true, false]);
});

test('导出下载只接受本站简报地址', async () => {
  const h = harness({ fetch: async () => response({ ok: true, total: 1, downloadUrl: 'https://elsewhere.invalid/backups.zip' }) });
  await h.elements.exportBackupsButton.click();
  assert.equal(h.downloads.length, 0);
  assert.match(h.elements.backupStatus.textContent, /下载地址无效/);
});
