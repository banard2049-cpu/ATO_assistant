const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/record-attachments.js'), 'utf8');
const id = 'a'.repeat(64);
const other = 'b'.repeat(64);
const dataUrl = 'data:image/png;base64,aGVsbG8=';
function setup(fetch) {
  const context = vm.createContext({ window: {}, fetch, URLSearchParams, console });
  vm.runInContext(source, context);
  return context.window.ATO_RECORD_ATTACHMENTS;
}
function reply(body, status = 200) {
  return { ok: status === 200, status, json: async () => body };
}
test('backup collects all cycles and account buckets, deduplicating image content', async () => {
  const requests = [];
  const api = setup(async (url) => { requests.push(url); return reply({ ok: true, user: { id: 'owner' }, dataUrl }); });
  const record = { users: { default: { cycleStats: { c1: { noteAttachments: { first: { blobId: id } } }, c2: { noteAttachments: { second: { blobId: id }, third: { blobId: other } } } } } } };
  const blobs = await api.createClient('/api', () => 'owner').exportBlobs(record);
  assert.deepEqual(Object.keys(blobs), [id, other]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url.includes('expectedAccountId=owner')));
});
test('restore uploads images separately before the state import, and verifies the content hash', async () => {
  const requests = [];
  const api = setup(async (url, init) => {
    requests.push(JSON.parse(init.body));
    return reply({ ok: true, user: { id: 'target' }, attachment: { blobId: requests.length === 1 ? id : other } });
  });
  const record = { cycleStats: { c2: { noteAttachments: { one: { blobId: id }, two: { blobId: other } } } } };
  await api.createClient('/api', () => 'target').restoreBlobs(record, { [id]: dataUrl, [other]: dataUrl });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((body) => body.dataUrl === dataUrl && body.expectedAccountId === 'target' && !body.sections));
  const broken = setup(async () => reply({ ok: true, user: { id: 'target' }, attachment: { blobId: other } }));
  await assert.rejects(broken.createClient('/api', () => 'target').restoreBlobs(record, { [id]: dataUrl, [other]: dataUrl }), /校验失败/);
});
test('missing backup image aborts before any uploads', async () => {
  let calls = 0;
  const api = setup(async () => { calls++; });
  const record = { noteAttachments: { one: { blobId: id }, two: { blobId: other } } };
  await assert.rejects(api.createClient('/api', () => 'owner').restoreBlobs(record, { [id]: dataUrl }), /缺失或无效/);
  assert.equal(calls, 0);
  await api.createClient('/api', () => 'owner').restoreBlobs({ notes: '旧存档' });
  assert.equal(calls, 0);
});
test('read preserves missing-image errors and refuses an account changed during upload', async () => {
  const missing = setup(async () => reply({ ok: false, error: '图片附件不存在' }, 404));
  await assert.rejects(missing.createClient('/api', () => 'owner').read(id), /附件不存在/);
  let account = 'owner';
  const changed = setup(async () => { account = 'other'; return reply({ ok: true, user: { id: 'other' }, attachment: { blobId: id } }); });
  await assert.rejects(changed.createClient('/api', () => account).upload(dataUrl), /账号已切换/);
});
test('concurrent image additions and deletions merge without reviving a removed attachment', () => {
  const page = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8');
  const extract = (name) => page.match(new RegExp('^( *)function ' + name + '\\([^]*?^\\1}', 'm'))[0];
  const ctx = vm.createContext({ atomicMergePaths: new Set(), console });
  vm.runInContext(['isPlainObject', 'cloneJson', 'jsonEqual', 'mergeLogText', 'mergeRecordChanges'].map(extract).join('\n'), ctx);
  const base = { cycleStats: { c1: { noteAttachments: { original: { blobId: id } } } } };
  const local = { cycleStats: { c1: { noteAttachments: { local: { blobId: other } } } } };
  const remote = { cycleStats: { c1: { noteAttachments: { original: { blobId: id }, remote: { blobId: id } } } } };
  ctx.base = base; ctx.local = local; ctx.remote = remote;
  const result = vm.runInContext('mergeRecordChanges(base, local, remote)', ctx);
  assert.deepEqual(Object.keys(result.value.cycleStats.c1.noteAttachments).sort(), ['local', 'remote']);
  assert.equal(result.conflicts.length, 0);
});

function recordBackupHarness({ failRestore = false } = {}) {
  const page = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8');
  const extract = (name) => page.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'))[0];
  const events = [], alerts = [];
  const button = { disabled: false };
  let downloaded, reader;
  const ctx = vm.createContext({
    console, Blob,
    state: { profileName: '我的记录', noteAttachments: { image: { blobId: id } } },
    cloneJson: (value) => JSON.parse(JSON.stringify(value)),
    isPlainObject: (value) => !!value && !Array.isArray(value) && typeof value === 'object',
    normalizeState: (value) => value,
    saveState: () => events.push('save'), renderAll: () => events.push('render'),
    alert: (message) => alerts.push(message), serverStorageUrl: '/api',
    campaignSession: { accountId: 'owner', accept() {}, assertCurrent: () => events.push('account-check') },
    window: { ATO_RECORD_ATTACHMENTS: { createClient: () => ({
      exportBlobs: async () => ({ [id]: dataUrl }),
      restoreBlobs: async (state, blobs) => {
        events.push('restore');
        assert.equal(blobs[id], dataUrl);
        assert.equal('recordAttachmentBlobs' in state, false);
        if (failRestore) throw new Error('图片恢复失败');
      },
    }) } },
    document: { querySelector: () => button, body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) },
    URL: { createObjectURL: (blob) => { downloaded = blob; return 'blob:test'; }, revokeObjectURL() {} },
    FileReader: function () {
      reader = { addEventListener: (name, handler) => { reader.onload = handler; }, readAsText() {} };
      return reader;
    },
  });
  vm.runInContext(['exportState', 'importState'].map(extract).join('\n'), ctx);
  return { ctx, events, alerts, button, download: () => downloaded, reader: () => reader };
}

test('record-only export embeds image content without polluting live state', async () => {
  const h = recordBackupHarness();
  await vm.runInContext('exportState()', h.ctx);
  const backup = JSON.parse(await h.download().text());
  assert.equal(backup.recordAttachmentBlobs[id], dataUrl);
  assert.equal('recordAttachmentBlobs' in h.ctx.state, false);
  assert.equal(h.button.disabled, false);
  assert.deepEqual(h.alerts, []);
});

test('record-only import restores blobs before saving references, and keeps old state on failure', async () => {
  for (const failRestore of [false, true]) {
    const h = recordBackupHarness({ failRestore });
    vm.runInContext('importState({})', h.ctx);
    h.reader().result = JSON.stringify({ profileName: '导入记录', noteAttachments: { image: { blobId: id } }, recordAttachmentBlobs: { [id]: dataUrl } });
    await h.reader().onload();
    assert.deepEqual(h.events, failRestore ? ['restore'] : ['restore', 'account-check', 'render', 'save']);
    assert.equal(h.ctx.state.profileName, failRestore ? '我的记录' : '导入记录');
    assert.equal('recordAttachmentBlobs' in h.ctx.state, false);
    assert.equal(h.alerts.length, failRestore ? 1 : 0);
  }
});
