const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const storageKey = 'ato.aibp.c45BpResourceLabels.v5';
const first = 'MIDASCORE_BP_I_001.jpg';
const second = 'MIDASCORE_BP_I_002.jpg';

function harness({ project = '', saved = null } = {}) {
  const elements = new Map();
  const downloads = [];
  const requests = [];
  const storage = new Map(saved ? [[storageKey, JSON.stringify(saved)]] : []);
  const element = () => ({
    value: '', style: {}, dataset: {}, listeners: {},
    classList: { toggle() {}, remove() {} },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    appendChild() {}, removeAttribute() {}, click() {}, remove() {},
    querySelector() { return null; },
  });
  const ctx = vm.createContext({
    document: {
      body: element(), createElement: element,
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
    },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    Blob: class { constructor(parts) { this.content = parts.join(''); } },
    URL: { createObjectURL(blob) { downloads.push(blob.content); return 'blob:fixture'; }, revokeObjectURL() {} },
    setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    async fetch(url, options) {
      const payload = JSON.parse(options.body);
      requests.push(payload);
      return { ok: true, async json() { return { ok: true, data: payload.data, reviewed: payload.reviewed, cardCount: 144 }; } };
    },
  });
  ctx.window = ctx;
  for (const file of ['tools/bp-resource-labeler/card-manifest.js', 'aibp/ps/other/resouce/bp_resource_map_c4_c5.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  }
  if (project) vm.runInContext(project, ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'tools/bp-resource-labeler/app.js'), 'utf8'), ctx);
  return {
    ctx, elements, downloads, requests, storage,
    click: id => elements.get(id).listeners.click(),
    markReviewed(value) {
      elements.get('reviewedInput').checked = value;
      elements.get('reviewedInput').listeners.change();
    },
    async importJson(payload) {
      elements.get('importInput').files = [{ name: 'labels.json', async text() { return JSON.stringify(payload); } }];
      await elements.get('importInput').listeners.change();
    },
    async importJs(content) {
      elements.get('importInput').files = [{ name: 'labels.js', async text() { return content; } }];
      await elements.get('importInput').listeners.change();
    },
  };
}

test('saving and exporting a partial BP audit preserve the exact reviewed cards', async () => {
  const app = harness();
  assert.equal(app.elements.get('progressText').textContent, '0 / 144');
  app.markReviewed(true);
  await app.click('saveServerButton');
  assert.deepEqual(app.requests[0].reviewed, [first]);

  app.click('exportJsButton');
  const reopened = harness({ project: app.downloads.at(-1) });
  assert.equal(reopened.elements.get('progressText').textContent, '1 / 144');
  const importedJs = harness();
  await importedJs.importJs(app.downloads.at(-1));
  assert.equal(importedJs.elements.get('progressText').textContent, '1 / 144');

  app.click('exportJsonButton');
  const exported = JSON.parse(app.downloads.at(-1));
  assert.deepEqual(exported.reviewed, [first]);
  const imported = harness();
  await imported.importJson(exported);
  assert.equal(imported.elements.get('progressText').textContent, '1 / 144');
});

test('draft BP resources loaded or imported from another cycle never become hidden labels', async () => {
  const app = harness({ saved: { labels: { [first]: { mutableAmbrosia: 2, oxidizedAmbrosia: 9 } }, reviewed: [] } });
  app.click('exportJsonButton');
  assert.deepEqual(JSON.parse(app.downloads.at(-1)).apostles.MIDASCORE[first], { mutableAmbrosia: 2 });
  await app.importJson({ apostles: { MIDASCORE: { [second]: { mutableAmbrosia: 3, oxidizedAmbrosia: 7 } } } });
  app.click('exportJsonButton');
  assert.deepEqual(JSON.parse(app.downloads.at(-1)).apostles.MIDASCORE[second], { mutableAmbrosia: 3 });
});

test('review metadata does not certify missing or unknown BP cards', () => {
  const project = `window.AIBP_C45_BP_RESOURCE_PREFILL = true;
    window.AIBP_C45_BP_RESOURCE_REVIEWED = [${JSON.stringify(first)}, 'unknown.jpg'];`;
  const app = harness({ project });
  assert.equal(app.elements.get('progressText').textContent, '1 / 144');
  app.click('exportJsonButton');
  assert.deepEqual(clone(JSON.parse(app.downloads.at(-1)).reviewed), [first]);
});

test('legacy prefill JS imports keep draft cards pending', async () => {
  const app = harness();
  await app.importJs(`window.AIBP_C45_BP_RESOURCE_PREFILL = true;
    const data = {"MIDASCORE": {"${first}": {"mutableAmbrosia": 4}}};`);
  assert.equal(app.elements.get('progressText').textContent, '0 / 144');
  app.click('exportJsonButton');
  assert.equal(JSON.parse(app.downloads.at(-1)).apostles.MIDASCORE[first].mutableAmbrosia, 4);
});

test('procedural and empty imports report a failure without replacing local labels', async () => {
  const app = harness();
  await app.importJs(fs.readFileSync(path.join(root, 'aibp/ps/other/resouce/bp_resource_map_c4_c5.js'), 'utf8'));
  assert.match(app.elements.get('toast').textContent, /导入失败.*构造格式不支持/);
  assert.equal(app.storage.size, 0);
  await app.importJson({ apostles: {} });
  assert.match(app.elements.get('toast').textContent, /导入失败.*没有可识别/);
  assert.equal(app.storage.size, 0);
});
