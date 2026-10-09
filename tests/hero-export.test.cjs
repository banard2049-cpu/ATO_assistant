const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(native) {
  const source = fs.readFileSync(path.join(__dirname, '../hero/index.html'), 'utf8');
  const begin = source.indexOf('document.getElementById("exportButton").onclick =');
  const end = source.indexOf('document.getElementById("importButton").onclick', begin);
  assert.ok(begin >= 0 && end > begin);
  const button = { disabled: false }, alerts = [], downloads = [];
  const state = { heroes: [{ id: 'one', customName: '测试英雄' }], graveyard: [] };
  const sandbox = { state, Blob, document: { getElementById: () => button,
    createElement: () => ({ click() { downloads.push(this.download); } }) },
    window: { ATOAndroid: native, alert: (message) => alerts.push(message) },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} } };
  vm.runInNewContext(source.slice(begin, end), sandbox);
  return { button, alerts, downloads, state, window: sandbox.window };
}

test('Android hero export waits for the real write callback and retains Chinese names', async () => {
  let file;
  const app = load({ exportStateJson: (filename, text) => { file = { filename, text }; } });
  const pending = app.button.onclick();
  assert.equal(app.button.disabled, true);
  assert.equal(file.filename, 'ato-hero-record.json');
  assert.deepEqual(JSON.parse(file.text), app.state);
  assert.equal(app.downloads.length, 0);
  app.window.ATOAndroidExportResult({ ok: true });
  await pending;
  assert.equal(app.button.disabled, false);
  assert.equal(app.window.ATOAndroidExportResult, undefined);
  assert.deepEqual(app.alerts, []);
});

test('Cancellation and bridge failure release the button and allow another export', async () => {
  const app = load({ exportStateJson() {} });
  const pending = app.button.onclick();
  app.window.ATOAndroidExportResult({ ok: false, error: '已取消导出' });
  await pending;
  assert.match(app.alerts[0], /已取消导出/);
  assert.equal(app.button.disabled, false);
  app.window.ATOAndroid.exportStateJson = () => { throw new Error('write failed'); };
  await app.button.onclick();
  assert.match(app.alerts[1], /write failed/);
  assert.equal(app.window.ATOAndroidExportResult, undefined);
  const original = () => {};
  app.window.ATOAndroidExportResult = original;
  await app.button.onclick();
  assert.equal(app.window.ATOAndroidExportResult, original);
});

test('Desktop hero export still downloads JSON', async () => {
  const app = load(undefined);
  await app.button.onclick();
  assert.deepEqual(app.downloads, ['ato-hero-record.json']);
  assert.equal(app.button.disabled, false);
});
