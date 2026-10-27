// 简报 load() 竞态回归：用户最后选中的循环必须赢。
//
// 运行：node tests/briefing-load-race.test.cjs
//
// 背景：load(cycleId) 每次独立发请求，响应到达后直接改 state.payload / state.cycleId /
// body.dataset.cycle 并重画循环下拉。快速切换循环时（方向键、刷新按钮、初始加载都可能在
// 同一条链上并发），较慢的旧请求后到就会把界面切回旧循环，导出也会导出旧循环的数据。
// 现在每次请求领一个递增 token，并用 AbortController 取消被取代的请求；这里把真实的
// load() 从 briefing-app.js 里抽出来，在可手动触发响应的 fetch 桩上复现乱序。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'briefing', 'briefing-app.js'), 'utf8');

// 抽取真实的 load()：从 token 声明（若存在）到下一个函数开头，保持源码原样。
const fnStart = appSource.indexOf('async function load(cycleId');
assert.ok(fnStart > 0, '找不到 briefing-app.js 里的 load()');
const tokenDecl = appSource.indexOf('let loadToken = 0;');
const loadStart = tokenDecl > 0 && tokenDecl < fnStart ? tokenDecl : fnStart;
const loadEnd = appSource.indexOf('function initialIndex()');
assert.ok(loadEnd > loadStart, '找不到 load() 的结尾');
const loadSource = `${appSource.slice(loadStart, loadEnd)}\nglobalThis.__load = load;`;

// 这条断言就是「修复还在」的钉子：错误路径与成功路径各要有一道过期判定。
assert.equal(
  (loadSource.match(/if \(token !== loadToken\) return;/g) || []).length,
  2,
  'load() 的失败路径与成功路径都必须丢弃过期响应'
);

/** fetch 桩：响应由测试手动 resolve / reject。 */
function makeFetch({ honorAbort }) {
  const calls = [];
  const impl = (url, options) => new Promise((resolve, reject) => {
    const call = { url, options, resolve, reject, aborted: false };
    calls.push(call);
    const signal = options && options.signal;
    if (!signal) return;
    const onAbort = () => {
      call.aborted = true;
      if (honorAbort) {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      }
    };
    if (signal.aborted) onAbort();
    else if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort);
  });
  return { calls, impl };
}

function payloadFor(cycleId) {
  return {
    ok: true,
    cycle: { cycleId, profileId: 'p1', label: cycleId },
    cycles: [{ cycleId, profileId: 'p1', label: cycleId, day: 1 }],
    summary: { recordedDays: 1, firstDay: '1', lastDay: '1' },
    timeline: [],
    hasData: true,
  };
}

function makeHarness({ honorAbort = false } = {}) {
  const effects = [];
  const state = { payload: null, cycleId: '', days: [], index: 0, timer: 0, map: null, tech: null, exporting: false };
  const els = {
    body: { dataset: {} },
    headSub: { textContent: '' },
    exportFilesButton: null,
    cycleSelect: { focus() {} },
  };
  const notices = [];
  const { calls, impl } = makeFetch({ honorAbort });
  const sandbox = {
    state,
    els,
    API: 'api.php',
    URLSearchParams,
    AbortController,
    fetch: impl,
    window: {},
    stopPlay: () => effects.push('stopPlay'),
    setExportStatus: (text) => effects.push(`setExportStatus:${text}`),
    showNotice: (title, text) => { notices.push({ title, text }); effects.push(`showNotice:${title}`); },
    hideNotice: () => effects.push('hideNotice'),
    renderCycleOptions: (payload) => effects.push(`renderCycleOptions:${payload.cycle.cycleId}`),
    buildDays: () => [],
    buildRenderers: () => effects.push('buildRenderers'),
    renderAxis: () => effects.push('renderAxis'),
    renderLog: () => effects.push('renderLog'),
    selectDay: (index) => effects.push(`selectDay:${index}`),
    initialIndex: () => 0,
  };
  vm.createContext(sandbox);
  vm.runInContext(loadSource, sandbox, { filename: 'briefing-app.js#load' });
  return { load: sandbox.__load, state, els, body: els.body, notices, effects, calls };
}

function respond(call, cycleId) {
  call.resolve({ ok: true, status: 200, json: async () => payloadFor(cycleId) });
}

test('慢的旧请求后到时不覆盖用户最后选中的循环', async () => {
  const h = makeHarness();
  const older = h.load('c1');   // 先发、慢
  const newest = h.load('c2');  // 后发、先回
  respond(h.calls[1], 'c2');
  await newest;
  assert.equal(h.state.cycleId, 'c2');
  respond(h.calls[0], 'c1');    // 旧响应最后才到
  await older;
  assert.equal(h.state.cycleId, 'c2', '旧响应不能把循环切回去');
  assert.equal(h.state.payload.cycle.cycleId, 'c2', '旧 payload 必须被丢弃');
  assert.equal(h.body.dataset.cycle, 'c2', '旧响应不能改 body.dataset.cycle');
  assert.deepEqual(h.notices, [], '正常路径不应出现错误提示');
  assert.ok(!h.effects.includes('renderCycleOptions:c1'), '下拉框不能被旧 payload 重画');
});

test('镜像情形：最后选中的是 c1，慢的 c2 后到同样不能生效', async () => {
  const h = makeHarness();
  const older = h.load('c2');
  const newest = h.load('c1');
  respond(h.calls[1], 'c1');
  await newest;
  respond(h.calls[0], 'c2');
  await older;
  assert.equal(h.state.cycleId, 'c1', '最后一次选择必须生效');
});

test('被取代的请求会被 abort，且不会弹出错误提示', async () => {
  const h = makeHarness({ honorAbort: true });
  const older = h.load('c1');
  assert.equal(h.calls[0].aborted, false, '第一个请求开始时不该是已取消状态');
  const newest = h.load('c2');
  assert.equal(h.calls[0].aborted, true, '被取代的请求必须被取消');
  respond(h.calls[1], 'c2');
  await newest;
  await older; // 内部以 AbortError 结束，被过期判定吞掉
  assert.equal(h.state.cycleId, 'c2');
  assert.deepEqual(h.notices, [], '被取消的旧请求不能弹错误提示');
});

test('旧的失败不能覆盖新的成功', async () => {
  const h = makeHarness();
  const failing = h.load('c1');
  const good = h.load('c2');
  respond(h.calls[1], 'c2');
  await good;
  h.calls[0].reject(new Error('network down'));
  await failing;
  assert.equal(h.state.cycleId, 'c2', '较新的成功必须保留');
  assert.deepEqual(h.notices, [], '旧请求的失败不能改写界面');
});

test('最新的失败仍要报出来，旧的成功不能顶掉它', async () => {
  const h = makeHarness();
  const stale = h.load('c1');
  const newest = h.load('c2');
  h.calls[1].reject(new Error('boom'));
  await newest;
  assert.equal(h.notices.length, 1, '最新请求的错误必须提示');
  assert.match(h.notices[0].text, /boom/);
  respond(h.calls[0], 'c1');
  await stale;
  assert.equal(h.state.payload, null, '旧的成功不能在新的失败之后渲染');
  assert.equal(h.state.cycleId, '', '旧的成功不能设置 cycleId');
  assert.equal(h.body.dataset.cycle, undefined, '旧的成功不能改 body.dataset.cycle');
  assert.equal(h.notices.length, 1, '旧的响应不能替换掉错误提示');
});
