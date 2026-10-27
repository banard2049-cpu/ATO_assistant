const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { build } = require('../briefing/briefing-local.js');
const root = path.join(__dirname, '..');
const map = { cycles: [{ id: 'c1', width: 100, height: 100, tileWidth: 10,
  tiles: [{ id: 'A', label: '甲' }, { id: 'B', label: '乙' }] }] };
const dictionary = { cards: [
  { key: 'first', names: { zh: '第一项', en: 'First' }, category: 'structure', nodes: [{ id: 'n1', page: 'cycle1', req: [] }] },
  { key: 'second', names: { zh: '第二项', en: 'Second' }, category: 'structure', nodes: [{ id: 'n2', page: 'cycle1', req: ['first'] }] },
] };
const dashboard = { activeProfileId: 'ship', profiles: { ship: { name: '测试', activeCycleId: 'c1', cycles: {
  c1: { state: { day: '9', notes: '今天不能补进过去' } }, c2: { state: { day: '0' } },
} } } };
function snapshot(day, ids, keys, extra = {}) {
  return { sections: { dashboard: { activeProfileId: 'ship', profiles: { ship: { cycles: { c1: { state: {
    day, mapSnapshot: { exploredIds: ids, currentTileId: ids.at(-1), savedAt: '2026-10-09T00:00:00Z', totalTiles: 2 },
    unlockedTech: { unlockedKeys: keys }, ...extra,
  } } } } } }, heroes: { heroes: [{ argonaut: '英雄一' }] }, story: { section: day, title: '故事' } } };
}
function source(snapshots = []) {
  return { ok: true, source: 'android-daily-backups', user: { id: 'local' }, profileId: 'ship', cycleId: 'c1',
    campaign: { sections: { dashboard } }, snapshots };
}

test('空历史保留循环选项，不将当前存档伪造成每日备份', () => {
  const result = build(source(), map, dictionary);
  assert.equal(result.hasData, false);
  assert.equal(result.cycles.length, 2);
  assert.deepEqual(result.timeline, []);
});

test('日期轴包含序章子日与缺失日；差分跨过缺失记录且不读今天的进展', () => {
  const input = source([
    snapshot('3', ['A', 'B'], ['FIRST', 'second'], { notes: '同步一\n同步二', cardTracksVersion: 2, cardTracks: { story: { position: '1A', progress: 2 } },
      surveyConstants: { hubs: { hub: { box1: true, box2: false } }, activeHub: { itemId: 'hub', boxId: 'box1' } } }),
    snapshot('T1/00', ['A'], ['first'], { notes: '同步一' }),
  ]);
  const original = JSON.stringify(input);
  const result = build(input, map, dictionary);
  assert.deepEqual(result.timeline.map((entry) => entry.day), ['T0', 'T1/00', 'T1', '0', '1', '2', '3']);
  assert.equal(result.summary.recordedDays, 2);
  assert.equal(result.summary.explored, 2);
  assert.equal(result.summary.unlocked, 2);
  const last = result.timeline.at(-1);
  assert.deepEqual(last.map.new, ['B']);
  assert.deepEqual(last.tech.new, ['second']);
  assert.deepEqual(last.mapSync, ['同步二']);
  assert.deepEqual(last.cardTracks, { story: { position: '1A', progress: 2 } });
  assert.equal(result.timeline[1].cardTracks, null);
  assert.deepEqual(last.adventureHubs.checked, { hub: ['box1'] });
  assert.ok(last.changes.some((change) => change.items.includes('乙')));
  assert.equal(result.tech.pages[0].nodes[1].firstDay, '3');
  assert.deepEqual(result.tech.pages[0].edges, [{ source: 'n1', target: 'n2', sourceKey: 'first', targetKey: 'second', optional: false }]);
  assert.equal(JSON.stringify(input), original, 'Conversion must not mutate native data');
});

test('撤销后再次点亮的科技不重复统计首次日期，缺失日不会借用后一天的状态', () => {
  const result = build(source([snapshot('0', ['A'], ['first']), snapshot('2', ['B'], []), snapshot('3', ['A', 'B'], ['first'])]), map, dictionary);
  assert.equal(result.timeline[1].present, false);
  assert.equal(result.timeline[1].map, undefined);
  assert.deepEqual(result.timeline[3].tech.new, []);
  assert.equal(result.tech.unlocked[0].firstDay, '0');
});

test('安卓日期笔记兼容主控台按日期保存的对象和旧数组', () => {
  const notes = ['启航', '抵达城市'];
  for (const dateNotes of [{ T0: notes[0], 'day-1': notes[1] }, notes]) {
    const input = source([snapshot('1', ['A'], ['first'], { dateNotes })]);
    const original = JSON.stringify(input);
    assert.deepEqual(build(input, map, dictionary).timeline.at(-1).dateNotes, notes);
    assert.equal(JSON.stringify(input), original);
  }
});

test('briefing lists use dark-side titles while replay tree nodes keep light-side titles and dependencies', () => {
  const local = JSON.parse(JSON.stringify(dictionary));
  local.cards[0].backNames = { zh: '深色面设施', en: 'Dark Facility' };
  const result = build(source([snapshot('0', ['A'], ['first', 'second'])]), map, local);
  assert.equal(result.tech.unlocked[0].name, '深色面设施');
  assert.equal(result.tech.pages[0].nodes[0].name, '第一项');
  assert.equal(result.tech.pages[0].nodes[0].nameEn, 'First');
  assert.equal(result.tech.pages[0].edges[0].sourceKey, 'first');
  assert.equal(result.tech.unlocked[1].name, '第二项');
});

test('真实熔融装备的二选一前置在安卓简报中保留分组和可选连线', () => {
  const techData = JSON.parse(fs.readFileSync(path.join(root, 'technology/tech_card_dictionary.min.json'), 'utf8'));
  const result = build(source([snapshot('0', ['A'], ['smelted gear'])]), map, techData);
  const page = result.tech.pages.find((entry) => entry.page === 'cycle1');
  const smelted = page.nodes.find((node) => node.key === 'smelted gear');
  assert.deepEqual(smelted.requiresAnyGroups, [['advanced support equipment', 'hekaton autopsy']]);
  assert.deepEqual(page.edges.filter((edge) => edge.target === smelted.id && edge.optional)
    .map((edge) => edge.sourceKey).sort(), ['advanced support equipment', 'hekaton autopsy']);
});

test('二选一前置兼容扁平、嵌套和旧版分组字段', () => {
  for (const requirements of [
    { req_any: ['first'] },
    { req_any: [['first']] },
    { requires_any_groups: [['first']] },
  ]) {
    const local = JSON.parse(JSON.stringify(dictionary));
    local.cards[1].nodes[0] = { id: 'n2', page: 'cycle1', ...requirements };
    const result = build(source([snapshot('0', ['A'], ['first', 'second'])]), map, local);
    assert.deepEqual(result.tech.pages[0].nodes[1].requiresAnyGroups, [['first']]);
    assert.deepEqual(result.tech.pages[0].edges, [
      { source: 'n1', target: 'n2', sourceKey: 'first', targetKey: 'second', optional: true },
    ]);
  }
});

test('安卓 fetch 桥接真实简报路径与内置字典，PHP 路径不落入原生 fetch', async () => {
  const calls = [];
  const sandbox = { URL, Request, Response, document: { addEventListener() {} }, window: {
    location: { href: 'file:///android_asset/web/briefing/index.html' },
    fetch: async (url) => { calls.push(['fetch', url]); return new Response('{}'); },
    ATOAndroid: {
      request(url, method, body) { calls.push(['bridge', url, method, body]); return JSON.stringify({ status: 200, body: JSON.stringify(source()) }); },
      readBundledJson(relative) { calls.push(['json', relative]); return JSON.stringify(dictionary); },
    },
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/packaging/android/fetch-bridge.js'), 'utf8'), sandbox);
  const response = await sandbox.window.fetch('api.php?cycle=c1');
  assert.equal((await response.json()).source, 'android-daily-backups');
  assert.equal(calls[0][0], 'bridge');
  assert.equal(calls[0][1], 'file:///android_asset/web/briefing/api.php?cycle=c1');
  const dict = await sandbox.window.fetch('../technology/tech_card_dictionary.min.json');
  assert.equal((await dict.json()).cards.length, 2);
  assert.deepEqual(calls[1], ['json', 'technology/tech_card_dictionary.min.json']);
  await sandbox.window.fetch('other.php');
  assert.equal(calls[2][0], 'fetch');
});

test('页面 load 将安卓接口响应转换为可回放的简报', async () => {
  const app = fs.readFileSync(path.join(root, 'briefing/briefing-app.js'), 'utf8');
  const state = { exporting: false }, notices = [];
  const sandbox = { API: 'api.php', AbortController, URLSearchParams, state,
    els: { headSub: {}, body: { dataset: {} } },
    window: { ATO_BRIEFING_LOCAL: { build }, ATO_MAP_DATA: map },
    fetch: async (url) => ({ ok: true, json: async () => url.startsWith('../technology/') ? dictionary : source([snapshot('1', ['A'], ['first'])]) }),
    stopPlay() {}, setExportStatus() {}, showNotice(...args) { notices.push(args); }, hideNotice() {},
    renderCycleOptions() {}, buildDays: (entries) => entries, buildRenderers() {}, renderAxis() {}, renderLog() {}, initialIndex: () => 0, selectDay() {},
  };
  vm.runInNewContext(app.slice(app.indexOf('let loadToken = 0;'), app.indexOf('function initialIndex()')) + '\nglobalThis.load = load;', sandbox);
  await sandbox.load('c1');
  assert.deepEqual(notices, []);
  assert.equal(state.payload.hasData, true);
  assert.equal(state.payload.summary.recordedDays, 1);
  assert.equal(state.days.at(-1).map.currentTileId, 'A');
  const html = fs.readFileSync(path.join(root, 'briefing/index.html'), 'utf8');
  assert.ok(html.indexOf('briefing-local.js') < html.indexOf('briefing-app.js'));
});

function pagedLoader(fetch) {
  const app = fs.readFileSync(path.join(root, 'briefing/briefing-app.js'), 'utf8');
  const state = { exporting: false }, notices = [], effects = [];
  const sandbox = { API: 'api.php', AbortController, URLSearchParams, setTimeout, state,
    els: { headSub: {}, body: { dataset: {} } },
    window: { ATO_BRIEFING_LOCAL: { build }, ATO_MAP_DATA: map }, fetch,
    stopPlay() {}, setExportStatus() {}, showNotice(...args) { notices.push(args); }, hideNotice() {},
    renderCycleOptions() {}, buildDays: (entries) => entries, buildRenderers() { effects.push('render'); },
    renderAxis() {}, renderLog() {}, initialIndex: () => 0, selectDay() {},
  };
  vm.runInNewContext(app.slice(app.indexOf('let loadToken = 0;'), app.indexOf('function initialIndex()')) + '\nglobalThis.load = load;', sandbox);
  return { ...sandbox, notices, effects };
}

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const pagedSource = (days, nextCursor) => ({ ...source(days.map((day) => snapshot(day, ['A'], ['first']))), nextCursor });

test('安卓分批读取所有日期后再构建简报，分页固定原账号和循环', async () => {
  const calls = [];
  const h = pagedLoader(async (url) => {
    calls.push(url);
    if (url.startsWith('../technology/')) return response(dictionary);
    if (url === 'api.php?cycle=c1&format=snapshots') return response(pagedSource(['0', '1', '2', '3'], '4'));
    const query = new URLSearchParams(url.split('?')[1]);
    assert.equal(query.get('profile'), 'ship');
    assert.equal(query.get('format'), 'snapshots');
    assert.equal(query.get('cycle'), 'c1');
    assert.equal(query.get('cursor'), '4');
    assert.equal(h.effects.length, 0, 'Partial history must not render');
    return response(pagedSource(['4', '5'], null));
  });
  await h.load('c1');
  assert.deepEqual(h.notices, []);
  assert.equal(calls.length, 3);
  assert.equal(h.state.payload.summary.recordedDays, 6);
  assert.equal(h.state.payload.summary.lastDay, '5');
  assert.deepEqual(h.effects, ['render']);
});

test('安卓后续批次失败不显示残缺历史，失败后可重新完整读取', async () => {
  let fail = true;
  const h = pagedLoader(async (url) => {
    if (url.startsWith('../technology/')) return response(dictionary);
    if (url === 'api.php?cycle=c1&format=snapshots') return response(pagedSource(['0'], '1'));
    return fail ? response({ ok: false, error: '每日备份读取中断' }, 500) : response(pagedSource(['1'], null));
  });
  await h.load('c1');
  assert.equal(h.state.payload, undefined);
  assert.equal(h.effects.length, 0);
  assert.match(h.notices[0][1], /每日备份读取中断/);
  assert.equal(h.els.headSub.textContent, '每日备份读取失败');
  fail = false;
  await h.load('c1');
  assert.equal(h.state.payload.summary.recordedDays, 2);
  assert.deepEqual(h.effects, ['render']);
});

test('安卓重复分页游标停止读取并报错，不无限重试', async () => {
  let calls = 0;
  const h = pagedLoader(async () => { calls++; return response(pagedSource(['0'], '4')); });
  await h.load('c1');
  assert.equal(calls, 2);
  assert.equal(h.effects.length, 0);
  assert.match(h.notices[0][1], /分页位置无效/);
});

test('安卓内存不足的结构化错误显示原因并结束加载提示', async () => {
  const h = pagedLoader(async () => response({ ok: false, code: 'LOCAL_MEMORY_LIMIT', error: '本地存档数据量超出当前可用内存' }, 503));
  await h.load('c1');
  assert.equal(h.effects.length, 0);
  assert.match(h.notices[0][1], /当前可用内存/);
  assert.equal(h.els.headSub.textContent, '每日备份读取失败');
});

test('安卓分页期间切换账号时丢弃已读批次', async () => {
  let calls = 0;
  const h = pagedLoader(async () => {
    const page = pagedSource(['0'], calls++ ? null : '1');
    if (calls > 1) page.user = { id: 'another-account' };
    return response(page);
  });
  await h.load('c1');
  assert.equal(h.effects.length, 0);
  assert.match(h.notices[0][1], /账号或循环已变化/);
});

test('安卓分页中失去登录态时回到登录提示', async () => {
  let calls = 0;
  const h = pagedLoader(async () => response(calls++ ? { ok: false, code: 'AUTH_REQUIRED' } : pagedSource(['0'], '1'), calls > 1 ? 401 : 200));
  await h.load('c1');
  assert.equal(h.effects.length, 0);
  assert.equal(h.notices[0][0], '请先登录');
});

test('旧安卓分页即使忽略取消也不能覆盖重新读取的结果', async () => {
  let releasePage, markStarted;
  const pageStarted = new Promise((resolve) => { markStarted = resolve; });
  let initialReads = 0;
  const h = pagedLoader(async (url) => {
    if (url.startsWith('../technology/')) return response(dictionary);
    if (url.includes('cursor=')) {
      markStarted();
      return new Promise((resolve) => { releasePage = resolve; });
    }
    return response(initialReads++ ? pagedSource(['9'], null) : pagedSource(['0'], '1'));
  });
  const stale = h.load('c1');
  await pageStarted;
  await h.load('c1');
  releasePage(response(pagedSource(['1'], null)));
  await stale;
  assert.deepEqual(h.notices, []);
  assert.deepEqual(h.effects, ['render']);
  assert.equal(h.state.payload.summary.lastDay, '9');
});

if (process.argv[2]) test('真实 Java 本地存档 → 简报数据 → 地图和科技回放契约', () => {
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const result = build(input, map, dictionary);
  assert.equal(result.cycle.profileId, 'ship::one');
  assert.equal(result.summary.recordedDays, 2);
  assert.equal(result.summary.firstDay, 'T6/00');
  assert.equal(result.summary.lastDay, '2');
  assert.equal(result.timeline.at(-1).notes, 'latest tied revision');
  assert.equal(result.timeline.at(-1).heroes.names[0], '赫拉克勒斯');
  assert.equal(result.timeline.at(-1).story.title, '序章');
  assert.deepEqual(result.timeline.at(-1).tech.unlocked, ['test tech']);
  assert.ok(!result.timeline.some((entry) => entry.day === '4'));
});
