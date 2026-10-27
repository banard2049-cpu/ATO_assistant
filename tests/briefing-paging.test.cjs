const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { build } = require('../briefing/briefing-local.js');

const app = fs.readFileSync(path.join(__dirname, '../briefing/briefing-app.js'), 'utf8');
const map = { cycles: [{ id: 'c1', tiles: [{ id: 'A', label: '甲' }, { id: 'B', label: '乙' }] }] };
const dictionary = { cards: [{ key: 'tech', names: { zh: '科技', en: 'Tech' }, nodes: [{ id: 'n1', page: 'cycle1' }] }] };
const cycles = [{ profileId: 'ship', profileName: '测试船', cycleId: 'c1', label: '循环 I', day: '99' },
  { profileId: 'ship', profileName: '测试船', cycleId: 'c2', label: '循环 II', day: '0' }];

function snapshot(day, explored = ['A']) {
  return { day, savedAt: '2026-10-26T00:00:00Z', location: 'A', objective: '', reminder: '', notes: `日志 ${day}`,
    dateNotes: ['历史日期笔记'], surveyActive: '', pharosActive: '', mainStoryActive: '',
    cardTracks: { story: { position: '1A', progress: 2 } }, cardTracksVersion: 2, cardCounters: null, adventureHubs: null,
    map: { explored, currentTileId: 'A', latestRevealedTileId: '', adversaryTileId: '', scoutTileId: '', scoutCount: 0,
      lastCityTileId: '', lastOasisTileId: '', lastSilverRuinTileId: '', markers: [], currentTileTagLabels: [],
      currentTileFactionLabels: [], totalTiles: 2, tileNotes: [] },
    techKeys: ['tech'], heroes: { names: ['历史英雄'], graveyard: [] },
    story: { bookTitle: '故事书', section: '1', title: '历史故事', id: 'story1' },
    draws: [{ day, name: '当天冒险牌' }] };
}

function page(snapshots, nextCursor = null) {
  return { ok: true, source: 'daily-backups', snapshotFormat: 'briefing', user: { id: 'local' },
    profileId: 'ship', cycleId: 'c1', cycle: { profileId: 'ship', cycleId: 'c1', label: '循环 I', backupDir: 'backups/local/daily/ship/c1' },
    cycles, snapshots, nextCursor };
}

function loader(fetch) {
  const state = { exporting: false }, notices = [], effects = [], selections = [];
  const sandbox = { API: 'api.php', AbortController, URLSearchParams, setTimeout, state,
    els: { headSub: {}, body: { dataset: {} } },
    window: { ATO_BRIEFING_LOCAL: { build }, ATO_MAP_DATA: map }, fetch,
    stopPlay() {}, setExportStatus() {}, showNotice(...args) { notices.push(args); }, hideNotice() {},
    renderCycleOptions() {}, buildDays: (days) => days, buildRenderers() { effects.push('render'); },
    renderAxis() {}, renderLog() {}, initialIndex: () => 0, selectDay(index) { selections.push(index); },
  };
  vm.runInNewContext(app.slice(app.indexOf('let loadToken = 0;'), app.indexOf('function initialIndex()')) + '\nglobalThis.load = load;', sandbox);
  return { ...sandbox, notices, effects, selections };
}
const response = (body) => ({ ok: true, status: 200, json: async () => body });

test('PHP 精简备份保留循环选择、日期笔记、卡牌、英雄、故事和备份路径', () => {
  const input = page([snapshot('1')]);
  const original = JSON.stringify(input);
  const result = build(input, map, dictionary);
  assert.deepEqual(result.cycles, cycles);
  assert.equal(result.cycle.backupDir, input.cycle.backupDir);
  const day = result.timeline.at(-1);
  assert.deepEqual(day.dateNotes, ['历史日期笔记']);
  assert.deepEqual(day.cardTracks, { story: { position: '1A', progress: 2 } });
  assert.deepEqual(day.heroes.names, ['历史英雄']);
  assert.equal(day.story.title, '历史故事');
  assert.equal(day.changes.find((entry) => entry.kind === 'exploration').items[0], '当天冒险牌');
  assert.equal(JSON.stringify(input), original);
  assert.ok(!result.timeline.some((entry) => entry.day === '99'), 'Current selector day must not become history');
});

test('PHP 空历史保留完整循环列表，损坏日期不会建立无限日期轴', () => {
  const empty = build(page([]), map, dictionary);
  assert.equal(empty.hasData, false);
  assert.deepEqual(empty.cycles, cycles);
  assert.deepEqual(empty.timeline, []);
  assert.throws(() => build(page([snapshot('1000000000')]), map, dictionary), /存档天数超出/);
});

test('PHP 页面逐批取精简快照，全部成功后统一排序并计算跨批次差分', async () => {
  const calls = [];
  const h = loader(async (url) => {
    calls.push(url);
    if (url.startsWith('../technology/')) return response(dictionary);
    const query = new URLSearchParams(url.split('?')[1]);
    assert.equal(query.get('format'), 'snapshots');
    if (!query.has('cursor')) return response(page([snapshot('10'), snapshot('1'), snapshot('2'), snapshot('3')], '4'));
    assert.equal(query.get('profile'), 'ship');
    assert.equal(query.get('cycle'), 'c1');
    assert.equal(query.get('cursor'), '4');
    assert.equal(h.effects.length, 0);
    return response(page([snapshot('4', ['A', 'B'])]));
  });
  await h.load('c1');
  assert.deepEqual(h.notices, []);
  assert.equal(calls.length, 3);
  assert.deepEqual(h.effects, ['render']);
  assert.equal(h.state.payload.summary.recordedDays, 5);
  assert.equal(h.state.payload.summary.lastDay, '10');
  assert.deepEqual(h.state.days.find((entry) => entry.day === '4').map.new, ['B']);
  assert.deepEqual(h.state.days.find((entry) => entry.day === '10').map.new, []);
  assert.equal(h.state.days.find((entry) => entry.day === '5').present, false);
});

test('PHP 仍兼容忽略 format 参数的旧服务端完整简报', async () => {
  const expected = build(page([snapshot('1')]), map, dictionary);
  const h = loader(async (url) => {
    assert.match(url, /format=snapshots/);
    return response(expected);
  });
  await h.load('c1');
  assert.deepEqual(h.notices, []);
  assert.deepEqual(h.effects, ['render']);
  assert.equal(h.state.payload, expected);
});

test('PHP 分页响应格式中途变化时停止，不混合两种快照', async () => {
  let requests = 0;
  const h = loader(async () => {
    const body = page([snapshot('1')], requests++ ? null : '4');
    if (requests > 1) delete body.snapshotFormat;
    return response(body);
  });
  await h.load('c1');
  assert.equal(h.effects.length, 0);
  assert.equal(h.notices[0][0], '读不到简报数据');
});

test('日期回放地址保留导入战役的 profile，刷新不会切回当前存档', () => {
  const start = app.indexOf('function syncUrl(entry)');
  const end = app.indexOf('\n  function ', start + 1);
  assert.ok(start > 0 && end > start);
  let saved;
  const sandbox = { URL, state: { cycleId: 'c2', payload: { cycle: { profileId: '中文::船' } } },
    window: { location: { href: 'http://localhost/briefing/?cycle=c1&profile=default' },
      history: { replaceState(_a, _b, url) { saved = new URL(url); } } },
  };
  vm.runInNewContext(app.slice(start, end) + '\nglobalThis.syncUrl = syncUrl;', sandbox);
  sandbox.syncUrl({ day: 'T6/00' });
  assert.equal(saved.searchParams.get('cycle'), 'c2');
  assert.equal(saved.searchParams.get('profile'), '中文::船');
  assert.equal(saved.searchParams.get('day'), 'T6/00');
});

test('切换导入战役时停在最后一份真实备份，不沿用旧战役日期或停在无记录日', async () => {
  const h = loader(async (url) => {
    if (url.startsWith('../technology/')) return response(dictionary);
    const query = new URLSearchParams(url.split('?')[1]);
    if (query.get('profile') !== 'other') return response(page([snapshot('1')]));
    const imported = page([snapshot('T6/00')]);
    imported.profileId = imported.cycle.profileId = 'other';
    imported.cycleId = imported.cycle.cycleId = 'c2';
    return response(imported);
  });
  await h.load('c1');
  await h.load('c2', 'other');
  assert.deepEqual(h.notices, []);
  const selected = h.state.days[h.selections.at(-1)];
  assert.equal(selected.day, 'T6/00');
  assert.equal(selected.present, true);
});

test('导入战役首次读取中断时，重新读取仍请求原战役', async () => {
  let reads = 0;
  const h = loader(async (url) => {
    if (url.startsWith('../technology/')) return response(dictionary);
    const query = new URLSearchParams(url.split('?')[1]);
    assert.equal(query.get('profile'), 'other');
    assert.equal(query.get('cycle'), 'c2');
    if (reads++ === 0) throw new Error('network interrupted');
    const imported = page([snapshot('2')]);
    imported.profileId = imported.cycle.profileId = 'other';
    imported.cycleId = imported.cycle.cycleId = 'c2';
    return response(imported);
  });
  await h.load('c2', 'other');
  await h.notices[0][2][0].onClick();
  assert.equal(h.state.payload.cycle.profileId, 'other');
  assert.equal(h.state.payload.cycle.cycleId, 'c2');
});
