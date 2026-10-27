/**
 * 战役简报的布局回归测试。
 *
 * 简报不自己实现地图/科技树的排布，而是复用仓库里现成的两份代码：
 *   - map/nemesis-path.js         → 板块坐标（c1 编号区在上、地形区在下，c3 物理排布）
 *   - technology/tech-tree.js     → 科技树构图、布点、走线与共线段拆分
 * 所以这里用真实的字典数据跑一遍这些函数，确认简报这条路能算出可用结果；一旦上游改了
 * 数据形状或函数签名，这个测试先失败，而不是等用户打开简报发现图是空的。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('vm');
const { build } = require('../briefing/briefing-local.js');

const root = path.join(__dirname, '..');

function loadSandbox() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const relative of ['technology/tech-page-layout.js', 'technology/tech-tree.js', 'map/nemesis-path.js', 'map/map-data.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), sandbox, { filename: relative });
  }
  return sandbox.window;
}

const win = loadSandbox();
const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'technology/tech_card_dictionary.min.json'), 'utf8'));

// Use the production converter so this test cannot silently drop compact OR fields.
const replay = build({ user: { id: 'test' }, profileId: 'test', cycleId: 'c1', snapshotFormat: 'briefing',
  snapshots: [{ day: '0', map: { explored: [] }, techKeys: dictionary.cards.map(card => card.key),
    draws: [], notes: '', story: {}, heroes: { names: [] } }] }, {}, dictionary);
function pageNodes(pageKey) {
  return replay.tech.pages.find(page => page.page === pageKey).nodes;
}

/** 复刻 briefing/briefing-tech.js 的构图方式。 */
function buildBriefingPage(pageKey) {
  const nodes = pageNodes(pageKey);
  const cycleId = `c${pageKey.replace(/\D/g, '')}`;
  const pageMeta = win.ATO_TECH_PAGE_LAYOUT.find((entry) => entry.key === pageKey);
  const graphNodes = nodes.map((node) => {
    const box = Array.isArray(node.box) && node.box.length >= 4
      ? { x: node.box[0], y: node.box[1], w: node.box[2], h: node.box[3] }
      : { x: 28, y: 28, w: 113.386, h: 49.606 };
    return {
      id: node.id,
      // 与 briefing-tech.js 一致：buildGraph 按 name 解析依赖，所以 name 用英文卡名，
      // 中文显示名走 displayName。
      name: node.nameEn,
      key: node.rawKey || node.nameEn || node.key,
      displayName: node.name,
      tree_box: box,
      requires: node.requires,
      requires_any_groups: node.requiresAnyGroups,
      xlsm_leads_to: node.xlsmLeadsTo,
    };
  });
  const graph = win.ATO_TECH_TREE.buildGraph(graphNodes, (node) => node.key);
  const layout = win.ATO_TECH_TREE.layoutGraph(graph, pageMeta, (node) => ({
    width: Math.min(150, Math.max(76, String(node.displayName || node.name || '').length * 9 + 22)),
    height: 36,
    totalHeight: 36,
  }));
  const segments = win.ATO_TECH_TREE.linkSegments(layout.edges, layout);
  return { cycleId, nodes, graph, layout, segments };
}

test('每个循环的科技树都能布点并画出连线', () => {
  const expected = {
    cycle1: { nodes: 53, edges: 63 },
    cycle2: { nodes: 68, edges: 67 },
    cycle3: { nodes: 68, edges: 78 },
    cycle4: { nodes: 65, edges: 74 },
    cycle5: { nodes: 69, edges: 92 },
  };
  for (const [pageKey, want] of Object.entries(expected)) {
    const built = buildBriefingPage(pageKey);
    assert.equal(built.nodes.length, want.nodes, `${pageKey} 节点数`);
    assert.equal(built.graph.edges.length, want.edges, `${pageKey} 依赖边数`);
    assert.ok(built.segments.length > 0, `${pageKey} 应当能拆出可绘制的线段`);
    for (const segment of built.segments) {
      assert.match(segment.path, /^M -?[\d.]+ -?[\d.]+ L -?[\d.]+ -?[\d.]+$/, `${pageKey} 线段路径格式`);
    }
    for (const node of built.nodes) {
      const position = built.layout.positions.get(node.id);
      assert.ok(position, `${pageKey}/${node.id} 缺少坐标`);
      assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y), `${pageKey}/${node.id} 坐标不是有限数`);
    }
  }
});

test('简报的连线与科技树页面的构图结果一致', () => {
  // 科技树页面用 nodeKey()（卡名@@节点 id）当标识，简报用节点 id；两者边数必须相同，
  // 否则简报画出来的树会和科技树页面不一样。
  for (const pageKey of ['cycle1', 'cycle2', 'cycle3', 'cycle4', 'cycle5']) {
    const nodes = pageNodes(pageKey);
    const pageGraph = win.ATO_TECH_TREE.buildGraph(
      nodes.map((node) => ({
        id: node.id,
        name: node.nameEn,
        key: node.key,
        displayName: node.name,
        requires: node.requires,
        requires_any_groups: node.requiresAnyGroups,
        xlsm_leads_to: node.xlsmLeadsTo,
      })),
      (node) => node.key
    );
    const built = buildBriefingPage(pageKey);
    assert.ok(built.graph.edges.length > 0, `${pageKey} 简报应当能解析出依赖边`);
    assert.equal(built.graph.edges.length, pageGraph.edges.length, `${pageKey} 边数与科技树页面不一致`);
  }
});

test('科技节点的坐标用于简报画布时都在图纸范围内', () => {
  for (const pageKey of ['cycle1', 'cycle4']) {
    const built = buildBriefingPage(pageKey);
    for (const [id, position] of built.layout.positions) {
      assert.ok(position.x > -20 && position.y > -20, `${pageKey}/${id} 坐标落到图纸外`);
      assert.ok(position.x + position.width <= built.layout.width + 60, `${pageKey}/${id} 超出图纸宽度`);
    }
  }
});

test('地图板块坐标来自 nemesis-path 的布局，序章地形区排在编号区下方', () => {
  const cycles = win.ATO_MAP_DATA.cycles;
  const byId = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  for (const cycleId of ['c1', 'c3']) {
    const cycle = byId.get(cycleId);
    const layout = win.ATO_NEMESIS_PATH.displayLayout(cycle);
    assert.ok(layout.width > 1 && layout.height > 1, `${cycleId} 画布尺寸`);
    for (const tile of cycle.tiles) {
      const position = layout.position(tile);
      assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y), `${cycleId}/${tile.id} 板块坐标`);
      assert.ok(position.x >= 0 && position.y >= 0, `${cycleId}/${tile.id} 板块坐标不应为负`);
      assert.ok(position.x < layout.width && position.y < layout.height, `${cycleId}/${tile.id} 板块应落在画布内`);
    }
  }
  // c1 的地形板块（T00…）必须排在编号板块下面，否则简报会把两块地图叠在一起。
  const c1 = byId.get('c1');
  const layout = win.ATO_NEMESIS_PATH.displayLayout(c1);
  const terrainY = c1.tiles.filter((tile) => /^T\d{2}$/.test(tile.id)).map((tile) => layout.position(tile).y);
  const numberedY = c1.tiles.filter((tile) => /^\d{3}$/.test(tile.id)).map((tile) => layout.position(tile).y);
  assert.ok(Math.min(...terrainY) > Math.max(...numberedY), 'c1 地形板块应当整体排在编号板块下方');
});

test('其余循环按 nx/ny 摆放，坐标都在画布内', () => {
  for (const cycle of win.ATO_MAP_DATA.cycles) {
    if (cycle.id === 'c1' || cycle.id === 'c3') continue;
    const layout = win.ATO_NEMESIS_PATH.displayLayout(cycle);
    for (const tile of cycle.tiles) {
      const position = layout.position(tile);
      assert.ok(position.x >= 0 && position.y >= 0, `${cycle.id}/${tile.id} 坐标`);
      assert.ok(position.x < layout.width && position.y < layout.height, `${cycle.id}/${tile.id} 应落在画布内`);
    }
  }
});
