/**
 * 简报地图的 token 图标回归测试。
 *
 * 需求来自真实使用：回放时地图上要能看到各个图标（城、绿洲、侦察船、仇敌、AG、沙尘暴…）
 * 以及它们各自的位置。存档里的标记格式并不直白：
 *   "027:last_city,hs"      —— 同一格上多个图标，用逗号连接
 *   "027:sandstorm(上)"     —— 画在板块边上的图标，带方向
 *   AG 不在 markers 里      —— 地图页把它画在当前格上，简报必须跟着同样的规则
 * 地图 GIF 导出复用这里的标记解析与日期表（见 briefing-gif.js），所以这份实现同时被
 * 简报页和导出物依赖；离线 HTML 播放器已随「导出离线简报」功能移除。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'briefing', 'briefing-map.js'), 'utf8');

/** 只够 briefing-map.js 用的极简 DOM：innerHTML 不解析，按类名惰性给出子节点。 */
function makeNode(tag) {
  const classes = new Set();
  const node = {
    tagName: String(tag).toUpperCase(),
    dataset: {},
    style: {},
    children: [],
    listeners: {},
    removed: false,
    _byClass: new Map(),
    _html: '',
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    },
    get className() { return [...classes].join(' '); },
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
    get innerHTML() { return node._html; },
    set innerHTML(value) { node._html = String(value); },
    querySelector(selector) {
      const key = String(selector).replace(/^\./, '');
      if (!node._byClass.has(key)) node._byClass.set(key, makeNode('span'));
      return node._byClass.get(key);
    },
    appendChild(child) { node.children.push(child); return child; },
    append(...items) { node.children.push(...items); },
    addEventListener(type, handler) { (node.listeners[type] ||= []).push(handler); },
    replaceWith(replacement) { node.replacedBy = replacement; node.removed = true; },
    remove() { node.removed = true; },
  };
  return node;
}

function loadMapModule() {
  const sandbox = {
    console,
    document: { createElement: (tag) => makeNode(tag) },
    window: {},
  };
  sandbox.window.ATO_BRIEFING_CORE = require('../briefing/briefing-core.js');
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(mapSource, sandbox, { filename: 'briefing-map.js' });
  return sandbox.window.ATO_BRIEFING_MAP;
}

function renderDay(day, tiles, days) {
  const mapApi = loadMapModule();
  const canvas = makeNode('div');
  canvas.clientWidth = 900;
  canvas.clientHeight = 600;
  const stage = makeNode('div');
  const renderer = mapApi.create({
    canvas,
    stage,
    cycle: { id: 'c1' },
    canvasSize: { width: 8, height: 8, tileWidth: 1 },
    tiles: tiles || [
      { id: 'T00', label: 'T00', front: './images/c1-tile-T00-front.jpg' },
      { id: 'T01', label: 'T01', front: './images/c1-tile-T01-front.jpg' },
      { id: 'T02', label: 'T02', front: '' },
    ],
    order: ['T00', 'T01', 'T02'],
    days: days || [],
  });
  renderer.render(day);
  const byId = new Map(stage.children.map((node) => [node.dataset.tileId, node]));
  return { byId, stage };
}

function iconsOf(tileNode, selector) {
  return (tileNode.querySelector(selector).children || []);
}

test('简报地图按存档标记把 token 图标画在各自的位置上', () => {
  const day = {
    map: {
      explored: ['T00', 'T01', 'T02'],
      new: ['T01'],
      currentTileId: 'T00',
      markers: ['T00:last_city,hs', 'T01:sandstorm(上)', 'T02:mystery_token'],
    },
  };
  const { byId } = renderDay(day);

  const current = byId.get('T00');
  assert.ok(current.classList.contains('current'), '当前格要带 current 标记');
  // 当前格：AG（方舟）按地图页的规则补在当前格上，再加上存档里的 last_city 与 hs。
  assert.deepEqual(
    iconsOf(current, '.tile-tokens').map((img) => img.className),
    ['map-token token-ag', 'map-token token-last_city', 'map-token token-hs']
  );
  assert.equal(iconsOf(current, '.tile-tokens')[1].src, '../map/tokens/last_visited_city.png');
  assert.equal(iconsOf(current, '.tile-edge-tokens').length, 0);
  assert.equal(current.querySelector('.tile-pin').innerHTML, '');
  assert.ok(current.classList.contains('new') === false, 'T00 不是新翻开的格子');

  const edgeTile = byId.get('T01');
  assert.ok(edgeTile.classList.contains('new'), 'T01 是新翻开的格子');
  assert.deepEqual(
    iconsOf(edgeTile, '.tile-edge-tokens').map((img) => img.className),
    ['map-edge-token edge-up']
  );
  assert.equal(iconsOf(edgeTile, '.tile-edge-tokens')[0].src, '../map/tokens/sandstorm.jpg');

  // 认不出的 token 继续用文字标记，信息不丢。
  const unknown = byId.get('T02');
  assert.equal(iconsOf(unknown, '.tile-tokens').length, 0);
  assert.match(unknown.querySelector('.tile-pin').innerHTML, /mystery_token/);

  // 方形图标（square）保留方角类名。
  const square = renderDay({
    map: { explored: ['T00'], new: [], currentTileId: '', markers: ['T00:c5_ruin'] },
  });
  assert.deepEqual(
    iconsOf(square.byId.get('T00'), '.tile-tokens').map((img) => img.className),
    ['map-token token-c5_ruin token-square']
  );
});

test('地图日期和缩放切换后聚焦最新翻开的板块，没有新板块时聚焦当前位置', () => {
  const mapApi = loadMapModule();
  const canvas = { clientWidth: 200, clientHeight: 150 };
  const stage = makeNode('div');
  const renderer = mapApi.create({ canvas, stage, cycle: { id: 'c1' }, canvasSize: { width: 6, height: 6 }, tiles: [{ id: 'A' }, { id: 'B' }], order: ['A', 'B'] });
  const positions = renderer.geometry().positions;
  const check = (id, scale) => {
    const p = positions.get(id);
    assert.equal(canvas.scrollLeft, (p.x + 36) * scale);
    assert.equal(canvas.scrollTop, (p.y + 36) * scale);
  };
  renderer.render({ map: { explored: ['A', 'B'], new: ['B'], latestRevealedTileId: 'B', currentTileId: 'A' } });
  check('B', 1.2);
  renderer.setZoom(2);
  check('B', 2);
  renderer.render({ map: { explored: ['A', 'B'], new: [], currentTileId: 'A' } });
  check('A', 2);
});

test('板块左上角标的是第一次翻开的游戏日，不是板块号也不是现实日期', () => {
  const days = [
    { index: 0, day: 'T0', title: '序章 T0', present: true, savedAtLocal: '2026-09-20 10:00', map: { explored: ['T00'], new: ['T00'] } },
    { index: 1, day: '1', title: '第 1 天', present: false, map: null },
    { index: 2, day: '2', title: '第 2 天', present: true, savedAtLocal: '2026-09-22 20:30', map: { explored: ['T00', 'T01'], new: ['T01'] } },
  ];
  const { byId } = renderDay({
    map: { explored: ['T00', 'T01'], new: ['T01'], currentTileId: '', markers: [] },
  }, undefined, days);

  // 板块号让位给天数；编号仍在 title 里，鼠标悬停还能看到。
  // 天数用日期轴那一套写法（序章 T0 / 正片 D2），不是备份的现实日期。
  assert.match(byId.get('T00').innerHTML, /class="tile-badge">T0</);
  assert.match(byId.get('T01').innerHTML, /class="tile-badge">D2</);
  assert.equal(byId.get('T00').title, 'T00 · T0');
  assert.equal(byId.get('T01').title, 'T01 · D2');

  // 天数表由日期轴算出（缺口日不参与，跨过去用下一份记录的天数）。
  const mapApi = loadMapModule();
  const labels = JSON.parse(JSON.stringify([...mapApi.collectRevealDays(days).entries()]));
  assert.deepEqual(labels, [['T00', 'T0'], ['T01', 'D2']]);
  assert.equal(mapApi.dayLabel('T6/00'), 'T6/00');
  assert.equal(mapApi.dayLabel('12'), 'D12');
  assert.equal(mapApi.dayLabel(''), '');
  // 没有天数名时不显示空标签。
  const fallback = JSON.parse(JSON.stringify([...mapApi.collectRevealDays([
    { index: 0, day: '', present: true, savedAtLocal: '2026-09-20 10:00', map: { explored: ['X'] } },
  ]).entries()]));
  assert.deepEqual(fallback, []);
});

test('取不到图标时退化成文字标记，不留破图', () => {
  const { byId } = renderDay({
    map: { explored: ['T00'], new: [], currentTileId: '', markers: ['T00:last_city'] },
  });
  const tile = byId.get('T00');
  const icon = iconsOf(tile, '.tile-tokens')[0];
  assert.equal(icon.tagName, 'IMG');
  const [onError] = icon.listeners.error || [];
  assert.equal(typeof onError, 'function', '图标必须挂 error 兜底');
  onError();
  assert.equal(icon.replacedBy.className, 'token-fallback');
  assert.equal(icon.replacedBy.textContent, '城');
});

test('导入历史的缺口日可传入空快照，不中断整个日期回放', () => {
  assert.doesNotThrow(() => renderDay(null));
});
