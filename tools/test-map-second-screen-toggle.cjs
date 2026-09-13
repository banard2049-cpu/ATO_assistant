const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../map/app.js'), 'utf8');
const toggle = { checked: false, disabled: true };
const label = { classList: { toggle() {} } };
let status = { ok: true, enabled: true, displayMode: 'story' };
let fail = false;
const requests = [], alerts = [];
const ctx = vm.createContext({
  elements: { secondScreenMapModeToggle: toggle, secondScreenMapModeLabel: label },
  secondScreenMode: false, campaignStorageUrl: '/api', window: { alert: value => alerts.push(value) },
  fetch: async (url, options) => {
    if (options.method === 'POST') {
      const mode = JSON.parse(options.body).mode;
      requests.push(mode);
      if (fail) throw new Error('offline');
      status.displayMode = mode;
    }
    return { ok: true, json: async () => ({ ...status }) };
  },
});
vm.runInContext(source.slice(source.indexOf('let secondScreenMapModeBusy'), source.indexOf('function delay(')), ctx);
(async () => {
  await vm.runInContext('refreshSecondScreenMapModeToggle()', ctx);
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  toggle.checked = true;
  await vm.runInContext('toggleSecondScreenMapMode()', ctx);
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  await vm.runInContext('toggleSecondScreenMapMode()', ctx);
  assert.deepEqual(requests, ['map', 'blank']);
  assert.equal(toggle.checked, false);
  fail = true;
  toggle.checked = true;
  await vm.runInContext('toggleSecondScreenMapMode()', ctx);
  assert.equal(toggle.checked, false);
  assert.equal(alerts.length, 1);
  status.enabled = false;
  await vm.runInContext('refreshSecondScreenMapModeToggle()', ctx);
  assert.equal(toggle.disabled, true);
  ctx.secondScreenMode = true;
  await vm.runInContext('toggleSecondScreenMapMode()', ctx);
  assert.equal(requests.length, 3);
  console.log('PASS: map/blank switching, failure recovery, disabled service, read-only second screen');
})().catch(error => { console.error(error); process.exitCode = 1; });
