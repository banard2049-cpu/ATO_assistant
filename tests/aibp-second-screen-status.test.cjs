// 守护第二屏同步状态提示：同步成功不再显示「已同步（时间）」，
// 只保留同步中 / 同步失败，空闲时整块由 CSS 的 :empty 隐藏。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');

function entryFunction(name) {
  let start = source.indexOf(`    function ${name}(`);
  if (start === -1) start = source.indexOf(`    async function ${name}(`);
  assert.notEqual(start, -1, `${name} 缺失`);
  return source.slice(start, source.indexOf('\n    function ', start + 1));
}

function harness(post) {
  const log = [];
  const status = {
    dataset: {},
    get textContent() { return log.length ? log[log.length - 1] : ''; },
    set textContent(value) { log.push(value); },
  };
  const context = vm.createContext({
    document: { getElementById: (id) => (id === "secondScreenSyncStatus" ? status : null) },
    campaignSession: { changed: false },
    secondScreenSnapshotInFlight: false,
    secondScreenSnapshotQueued: false,
    secondScreenSnapshotTimer: 0,
    aibpSectionRevision: 0,
    buildSecondScreenSnapshot: () => ({}),
    postSecondScreenSnapshot: post,
    readAibpSection: async () => ({}),
    scheduleSecondScreenSnapshot() {},
    window: { setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {} },
  });
  vm.runInContext(entryFunction('sendSecondScreenSnapshot'), context);
  return { context, log, status };
}

test('同步成功后不再留下「已同步（时间）」', async () => {
  const h = harness(async () => ({ ok: true }));
  await h.context.sendSecondScreenSnapshot();
  assert.equal(h.status.dataset.state, 'synced');
  assert.equal(h.status.textContent, '', '成功时不该留提示文字');
  assert.deepEqual(h.log, ['同步中', ''], '只闪过「同步中」，随后清空');
});

test('同步失败仍然提示原因，不会被一起删掉', async () => {
  const h = harness(async () => { throw new Error('Failed to fetch'); });
  await h.context.sendSecondScreenSnapshot();
  assert.equal(h.status.dataset.state, 'failed');
  assert.match(h.status.textContent, /^同步失败（Failed to fetch/);
});

test('登录失效只提示刷新页面，不重试', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls += 1;
    const error = new Error('账号对不上');
    error.code = 'ACCOUNT_MISMATCH';
    throw error;
  });
  await h.context.sendSecondScreenSnapshot();
  assert.equal(calls, 1, '登录失效不应重试');
  assert.equal(h.status.textContent, '同步失败（登录已失效，请刷新页面）');
});

test('本地数据错误保留完整字段名，且不反复重试生成快照', async () => {
  let builds = 0;
  let posts = 0;
  const reason = "Cannot read properties of undefined (reading 'customTraitSnapshotScope')";
  const h = harness(async () => { posts++; });
  h.context.buildSecondScreenSnapshot = () => { builds++; throw new TypeError(reason); };
  await h.context.sendSecondScreenSnapshot();
  assert.equal(builds, 1);
  assert.equal(posts, 0);
  assert.equal(h.status.textContent, `同步失败（${reason}）`);
  assert.equal(h.status.title, reason);
});
