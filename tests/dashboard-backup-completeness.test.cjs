const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const attachmentSource = fs.readFileSync(path.join(__dirname, '../assets/record-attachments.js'), 'utf8');
const sections = ['dashboard', 'map', 'record', 'technology', 'heroes', 'aibp', 'story'];
const copy = value => JSON.parse(JSON.stringify(value));
const dashboard = {
  activeProfileId: 'default',
  profiles: { default: { id: 'default', activeCycleId: 'c2', cycles: { c2: { id: 'c2', state: { day: 5 } } } } },
};

function harness({ offline = false, flushed = true, invalidCampaign } = {}) {
  const downloads = [], alerts = [], reads = [], writes = [];
  let server = {
    updatedAt: '2026-12-31T18:04:05.123Z',
    sections: Object.fromEntries(sections.map(name => [name, name === 'dashboard' ? copy(dashboard) : { saved: name }])),
    sectionRevisions: Object.fromEntries(sections.map(name => [name, 3])),
  };
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    window: { setTimeout() {}, alert: message => alerts.push(message), confirm: () => true },
    TextDecoder, Uint8Array, ArrayBuffer, clearTimeout,
    authUrl: '/campaign', sessionUser: { id: 'account' },
    archive: copy(dashboard), state: {}, backupSectionIds: sections,
    campaignSaveTimer: null, campaignSectionRevision: 3, campaignSectionExists: true,
    campaignSectionBaseline: copy(dashboard), campaignServerBaseline: copy(dashboard),
    campaignSyncChannel: null,
    elements: { exportButton: { textContent: '导出存档', disabled: false }, importInput: { value: 'file' } },
    saveState() {}, flushCampaignSave: async () => flushed,
    normalizeArchive: copy,
    currentCycle: () => context.archive.profiles.default.cycles.c2,
    renderDashboardArchive() {},
    stopForAccountMismatch() {}, accountMismatchError: () => new Error('ACCOUNT_MISMATCH'),
    downloadJsonPayload: async payload => downloads.push(copy(payload)),
    fetch: async () => {
      if (offline) throw new Error('network disconnected');
      return { ok: true, json: async () => ({ ok: true, user: { id: 'account' },
        campaign: invalidCampaign === undefined ? copy(server) : invalidCampaign }) };
    },
    importCampaignSections: async (incoming, revisions) => {
      for (const name of Object.keys(incoming)) assert.equal(revisions[name], server.sectionRevisions[name]);
      writes.push(copy(incoming));
      Object.assign(server.sections, copy(incoming));
      for (const name of Object.keys(incoming)) server.sectionRevisions[name]++;
      return { sections: copy(server.sectionRevisions) };
    },
    FileReader: class {
      readAsArrayBuffer(payload) {
        const bytes = Buffer.from(JSON.stringify(payload));
        this.result = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        reads.push(this.onload());
      }
    },
  });
  vm.runInContext(attachmentSource, context);
  for (const name of ['isPlainObject', 'cloneJson', 'loadFullCampaign', 'beijingTimestamp', 'exportState', 'applyImportedSections', 'importStateFile']) {
    const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
    assert.ok(match, `missing ${name}`);
    vm.runInContext(match[0], context);
  }
  return { context, downloads, alerts, writes, server: () => copy(server),
    async import(payload) { context.importStateFile(payload); await reads.at(-1); },
  };
}

for (const flushed of [true, false]) {
  test(`a failed full read never downloads a destructive backup (flushed=${flushed})`, async () => {
    const app = harness({ offline: true, flushed });
    await app.context.exportState();
    assert.equal(app.downloads.length, 0);
    assert.equal(app.alerts.length, 1);
    assert.match(app.alerts[0], /无法读取完整战役存档/);
    assert.equal(app.context.elements.exportButton.textContent, '导出存档');
    assert.equal(app.context.elements.exportButton.disabled, false);
  });
}

test('a malformed server campaign cannot become a successful full backup', async () => {
  for (const invalidCampaign of [null, {}, { sections: [] }]) {
    const app = harness({ invalidCampaign });
    await app.context.exportState();
    assert.equal(app.downloads.length, 0);
    assert.match(app.alerts[0], /导出存档失败/);
  }
});

test('a successful full export preserves all server sections', async () => {
  const app = harness();
  await app.context.exportState();
  assert.equal(app.downloads.length, 1);
  assert.deepEqual(app.downloads[0].sections, app.server().sections);
  assert.equal(app.downloads[0].source.serverIncluded, true);
  assert.match(app.downloads[0].exportedAt, /\+08:00$/);
  assert.equal(app.downloads[0].source.serverUpdatedAt, '2027-01-01T02:04:05.123+08:00');
  assert.equal(app.context.elements.exportButton.textContent, '已下载');
  assert.equal(app.alerts.length, 0);
});

test('legacy offline full packages restore available state without clearing unread modules', async () => {
  const app = harness(), before = app.server();
  const restoredDashboard = copy(dashboard);
  restoredDashboard.profiles.default.cycles.c2.state.day = 9;
  await app.import({
    app: 'ATO Campaign Save Package', version: 3, source: { serverIncluded: false },
    sections: Object.fromEntries(sections.map(name => [name, name === 'dashboard' ? restoredDashboard : null])),
  });
  assert.deepEqual(Object.keys(app.writes[0]), ['dashboard']);
  assert.equal(app.server().sections.dashboard.profiles.default.cycles.c2.state.day, 9);
  for (const name of sections.filter(name => name !== 'dashboard')) {
    assert.deepEqual(app.server().sections[name], before.sections[name], name);
  }
  assert.match(app.alerts[0], /未包含的模块已保留当前数据/);
});

test('genuine full backups still restore explicitly empty modules', async () => {
  for (const sourceMetadata of [undefined, { serverIncluded: true }]) {
    const app = harness();
    await app.import({
      app: 'ATO Campaign Save Package', version: 3, source: sourceMetadata,
      sections: { dashboard, record: null, map: { restored: true } },
    });
    assert.equal(app.server().sections.record, null);
    assert.deepEqual(app.server().sections.map, { restored: true });
    assert.deepEqual(app.alerts, ['导入完成。']);
  }
});
