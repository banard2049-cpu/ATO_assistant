const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tree = require('../technology/tech-tree.js');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'technology/index.html'), 'utf8').replace(/\r\n/g, '\n');
// 布局元数据（PAGE_METADATA）已抽到 technology/tech-page-layout.js：战役简报要用同一份
// 坐标重放科技树，两份页面共用一套布局。那个文件仍然保留 `const PAGE_METADATA = [...]`
// 这个声明形式，所以下面按声明名读源码的逻辑不用改。
const layoutSource = fs.readFileSync(path.join(root, 'technology/tech-page-layout.js'), 'utf8').replace(/\r\n/g, '\n');

function context() {
  const scope = vm.createContext({
    currentCycle: 'cycle1', treeLanguage: 'zh', hideUnknownTech: true, selectedNodeId: null,
    unlocked: new Set(), conditionTicked: new Set(),
    TECH_KEY_ALIASES: { 'upstream navigation': 'up-stream navigation' },
    // 页面通过 window.ATO_TECH_PAGE_LAYOUT 读布局文件，这里照浏览器那样把它挂上。
    window: {},
  });
  const names = ['dictionaryToAppData', 'computeDisambiguatedTechNames', 'techKey', 'nodeKey', 'isAutoUnlockedNode',
    'isUnlockedNode', 'isRequirementUnlocked', 'nodeRecordByName', 'areRequirementsMet', 'isDiscoveredNode', 'isConditionDiscoveryPending',
    'isUnlockableNode', 'isConditionSatisfied', 'hasPrintedConditionBox', 'conditionCells', 'isConditionTicked',
    'isConditionCellTicked', 'conditionCellKey', 'cardsForNode', 'isCoreNode', 'displayTechName', 'displayTechReferenceName', 'esc',
    'renderTechRefList', 'renderRequirementUnlockColumns', 'renderRequirementAnyGroups', 'renderConditionNotes', 'renderConditionToggle',
    'treeTextUnits', 'treeTextRows', 'treeModuleSize', 'treeModuleHtml', 'treeNodeStatus', 'conditionCellCaption', 'conditionCellDisplayText'];
  const declarations = ['PAGE_METADATA', 'PRINTED_CONDITION_BOXES', 'PRINTED_CONDITION_TEXT', 'CONDITION_TEXT_ZH'];
  const declarationSource = (name) => (name === 'PAGE_METADATA' ? layoutSource : source);
  vm.runInContext(declarations.map(name => {
    const text = declarationSource(name);
    const start = text.indexOf(`const ${name} =`);
    assert.ok(start >= 0, `缺少 ${name} 的声明`);
    return name === 'PAGE_METADATA'
      ? text.slice(start, text.indexOf('\n];', start) + 3)
      : text.slice(start, text.indexOf('\n};', start) + 3);
  }).join('\n') + '\n' + names.map(name => {
    const endIndent = ['dictionaryToAppData', 'computeDisambiguatedTechNames'].includes(name) ? '  ' : '';
    const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^' + endIndent + '}', 'm'));
    assert.ok(match, `Missing ${name}`);
    return match[0];
  }).join('\n'), scope);
  vm.runInContext('window.ATO_TECH_PAGE_LAYOUT = PAGE_METADATA;', scope);
  scope.data = scope.dictionaryToAppData(JSON.parse(fs.readFileSync(path.join(root, 'technology/tech_card_dictionary.min.json'), 'utf8')));
  scope.PAGE_INDEX = new Map(scope.data.pages.map((page, index) => [page.key, index]));
  scope.DISAMBIGUATED_TECH_NAMES = scope.computeDisambiguatedTechNames(scope.data.pages);
  return scope;
}

test('unlocking a real technology discovers just the next reachable nodes and arrows', () => {
  const c = context(), page = c.data.pages[0];
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  const visible = () => tree.visibleGraph(graph, node => c.isDiscoveredNode(page.key, node), true,
    node => c.isConditionDiscoveryPending(page.key, node));
  const before = visible();
  assert.equal(before.nodes.length, 13);
  const trade = page.nodes.find(node => node.name === 'Trading Solutions');
  const advanced = page.nodes.find(node => node.name === 'Advanced Trading Solutions');
  const superior = page.nodes.find(node => node.name === 'Superior Trading Solutions');
  assert.ok(!before.nodes.includes(advanced));
  c.unlocked.add(c.nodeKey(page.key, trade));
  const after = visible();
  assert.equal(after.nodes.length, 17);
  assert.ok(after.nodes.includes(advanced));
  assert.ok(!after.nodes.includes(superior));
  assert.ok(after.edges.some(edge => edge.source === trade.id && edge.target === advanced.id));
  assert.ok(after.edges.every(edge => after.nodes.some(node => node.id === edge.source) && after.nodes.some(node => node.id === edge.target)));
});

test('dictionary conversion keeps light-side names in the tree and dark-side names for external snapshots', () => {
  const c = context();
  const page = c.data.pages.find(page => page.key === 'cycle2');
  const node = page.nodes.find(node => node.name === "Argo's Mission");
  assert.equal(c.displayTechName(node), '阿尔戈号的任务');
  const card = c.cardsForNode(node)[0];
  assert.equal(card.name_zh, '阿尔戈号的任务');
  assert.equal(card.reference_name, '圆桌舰桥');
  assert.equal(c.displayTechReferenceName(node), '圆桌舰桥');
  c.treeLanguage = 'en';
  assert.equal(c.displayTechName(node), "Argo's Mission");
  assert.equal(c.displayTechReferenceName(node), 'Bridge Tholos');
});

test('condition roots reveal only after all conditions while connected nodes keep their existing discovery rules', () => {
  const c = context(), page = c.data.pages[0];
  const node = page.nodes.find(node => node.name === 'Spark of the Dead Gods');
  assert.equal(c.isDiscoveredNode(page.key, node), false);
  assert.equal(c.isUnlockableNode(page.key, node), false);
  c.conditionTicked.add(c.conditionCellKey(page.key, node, 0));
  assert.equal(c.isDiscoveredNode(page.key, node), true);
  assert.equal(c.isUnlockableNode(page.key, node), true);
  const multi = page.nodes.find(node => (c.conditionCells(page.key, node)?.length || 0) > 1);
  for (const ref of multi.requires) c.unlocked.add(ref);
  for (const group of multi.requires_any_groups) c.unlocked.add(group[0]);
  c.conditionTicked.add(c.conditionCellKey(page.key, multi, 0));
  assert.equal(c.isUnlockableNode(page.key, multi), false);
  for (let i = 1; i < c.conditionCells(page.key, multi).length; i++) c.conditionTicked.add(c.conditionCellKey(page.key, multi, i));
  assert.equal(c.isUnlockableNode(page.key, multi), true);
  const connected = page.nodes.find(item => item.requires.length && c.hasPrintedConditionBox(page.key, item));
  for (const ref of connected.requires) c.unlocked.add(ref);
  for (const group of connected.requires_any_groups) c.unlocked.add(group[0]);
  assert.equal(c.isDiscoveredNode(page.key, connected), true);
  assert.equal(c.isUnlockableNode(page.key, connected), false);
  const multiRoot = c.data.pages.flatMap(otherPage => otherPage.nodes.map(item => ({ page: otherPage, node: item })))
    .find(({ page: otherPage, node: item }) => (c.conditionCells(otherPage.key, item)?.length || 0) > 1
      && !(item.requires.length || item.requires_any_groups.length) && !c.isUnlockedNode(otherPage.key, item));
  assert.ok(multiRoot);
  for (let index = 0; index < c.conditionCells(multiRoot.page.key, multiRoot.node).length; index++) {
    assert.equal(c.isDiscoveredNode(multiRoot.page.key, multiRoot.node), false);
    c.conditionTicked.add(c.conditionCellKey(multiRoot.page.key, multiRoot.node, index));
  }
  assert.equal(c.isDiscoveredNode(multiRoot.page.key, multiRoot.node), true);
});

test('knowledge roots keep editable condition placeholders without disclosing names in any language or view', () => {
  const c = context(), page = c.data.pages[0];
  const node = page.nodes.find(item => item.id === 'cycle1_48');
  const graph = tree.buildGraph(page.nodes, item => c.nodeKey(page.key, item));
  const layout = tree.layoutGraph(graph, page, item => c.treeModuleSize(page.key, item));
  for (const language of ['zh', 'en']) for (const hideUnknown of [true, false]) {
    c.treeLanguage = language; c.hideUnknownTech = hideUnknown;
    const visible = tree.visibleGraph(graph, item => c.isDiscoveredNode(page.key, item), hideUnknown,
      item => c.isConditionDiscoveryPending(page.key, item));
    assert.ok(visible.nodes.includes(node));
    assert.ok(!visible.edges.some(edge => edge.source === node.id || edge.target === node.id));
    const html = c.treeModuleHtml(page, node, layout.positions.get(node.id), false);
    assert.doesNotMatch(html, new RegExp(node.name + '|' + node.name_zh));
    assert.match(html, /data-name=""/);
    assert.match(html, / disabled/);
    assert.match(html, /type="checkbox"/);
    assert.doesNotMatch(c.renderTechRefList([node.name], ''), new RegExp(node.name + '|' + node.name_zh));
  }
  c.conditionTicked.add(c.conditionCellKey(page.key, node, 0));
  assert.equal(c.isConditionDiscoveryPending(page.key, node), false);
  assert.equal(c.isDiscoveredNode(page.key, node), true);
  assert.match(c.treeModuleHtml(page, node, layout.positions.get(node.id), true), new RegExp(node.name));
  c.conditionTicked.clear(); c.unlocked.add(c.nodeKey(page.key, node));
  assert.equal(c.isConditionDiscoveryPending(page.key, node), false);
});

test('AND prerequisites, OR groups and manual unlocks preserve discovery semantics', () => {
  const c = context();
  const and = { name: 'AND', requires: ['first', 'second'] };
  const or = { name: 'OR', requires_any_groups: [['first', 'second'], ['third', 'fourth']] };
  c.unlocked.add('first');
  assert.equal(c.isDiscoveredNode('cycle1', and), false);
  assert.equal(c.isDiscoveredNode('cycle1', or), false);
  c.unlocked.add('second');
  assert.equal(c.isDiscoveredNode('cycle1', and), true);
  c.unlocked.add('third');
  assert.equal(c.isDiscoveredNode('cycle1', or), true);
  c.unlocked.delete('first'); c.unlocked.delete('second');
  assert.equal(c.isDiscoveredNode('cycle1', and), false);
  c.unlocked.add('and');
  assert.equal(c.isDiscoveredNode('cycle1', and), true);
});

test('prerequisite references conceal undiscovered nodes while successor previews show their names', () => {
  const c = context();
  const html = c.renderTechRefList(['advanced trading solutions'], '无直接解锁');
  assert.match(html, /尚未发现/);
  assert.doesNotMatch(html, /高级贸易方案|data-node/);
  const preview = c.renderTechRefList(['advanced trading solutions'], '无直接解锁', null, true);
  assert.match(preview, /高级贸易方案/);
  assert.doesNotMatch(preview, /尚未发现|data-node/);
  c.hideUnknownTech = false;
  assert.match(c.renderTechRefList(['advanced trading solutions'], ''), /高级贸易方案/);
});

test('a node description shows its direct successors without revealing their own successors or changing tree discovery', () => {
  const c = context(), page = c.data.pages[0];
  const trade = page.nodes.find(node => node.name === 'Trading Solutions');
  const advanced = page.nodes.find(node => node.name === 'Advanced Trading Solutions');
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  const before = tree.visibleGraph(graph, node => c.isDiscoveredNode(page.key, node), true);
  const html = c.renderRequirementUnlockColumns(page.key, trade);
  assert.match(html, /能解锁的科技/);
  for (const target of ['船员扩招', '外交关系', '高级贸易方案', '浅水航行']) assert.ok(html.includes(target));
  assert.doesNotMatch(html, /超级贸易方案/);
  assert.ok(!before.nodes.includes(advanced));
  assert.deepEqual(tree.visibleGraph(graph, node => c.isDiscoveredNode(page.key, node), true), before);
  assert.doesNotMatch(html, new RegExp(`data-node="${advanced.id}"`));
  c.unlocked.add(c.nodeKey(page.key, trade));
  assert.match(c.renderRequirementUnlockColumns(page.key, trade), new RegExp(`data-node="${advanced.id}"`));
  const unknownRoot = page.nodes.find(node => node.id === 'cycle1_48');
  assert.doesNotMatch(c.renderTechRefList([unknownRoot.name], '', null, true), new RegExp(unknownRoot.name_zh));
});

test('cycle-qualified references and OR edges remain distinct', () => {
  const nodes = [
    { id: 'a', name: 'Shared', key: 'shared@@cycle3' },
    { id: 'b', name: 'Other', key: 'other' },
    { id: 'c', name: 'Child', key: 'child', requires: ['shared@@cycle3'], requires_any_groups: [['shared@@cycle3', 'other', 'shared@@cycle2']] },
  ];
  const graph = tree.buildGraph(nodes, node => node.key);
  assert.deepEqual(graph.edges, [
    { source: 'a', target: 'c', optional: false },
    { source: 'b', target: 'c', optional: true },
  ]);
  assert.equal(tree.visibleGraph(graph, () => false, true).edges.length, 0);
  assert.equal(tree.visibleGraph(graph, () => false, false).nodes.length, 3);
});

test('shared trunks are drawn once while preserving their connections and arrowheads in both directions', () => {
  const first = { source: 'root', target: 'upper', optional: false };
  const second = { source: 'root', target: 'lower', optional: true };
  const reverse = { source: 'other', target: 'left', optional: true };
  const segments = tree.linkSegments([first, second, reverse], { routesReady: true, routes: new Map([
    ['root>upper', [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -50 }]],
    ['root>lower', [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }]],
    ['other>left', [{ x: 30, y: 0 }, { x: 10, y: 0 }]],
  ]) });
  const shared = segments.find(segment => segment.start.x === 10 && segment.end.x === 30 && segment.start.y === 0 && segment.end.y === 0);
  assert.deepEqual(shared.edges, [first, second, reverse]);
  assert.equal(shared.arrowStart, true);
  assert.ok(segments.some(segment => segment.start.x === 50 && segment.start.y === -50 && segment.arrowStart));
  assert.ok(segments.some(segment => segment.end.x === 80 && segment.end.y === 50 && segment.arrowEnd));
  for (const segment of segments) for (const other of segments) {
    if (segment === other) continue;
    const vertical = segment.start.x === segment.end.x;
    if (vertical && other.start.x === other.end.x && segment.start.x === other.start.x) {
      assert.ok(Math.min(segment.end.y, other.end.y) <= Math.max(segment.start.y, other.start.y));
    } else if (!vertical && other.start.y === other.end.y && segment.start.y === other.start.y) {
      assert.ok(Math.min(segment.end.x, other.end.x) <= Math.max(segment.start.x, other.start.x));
    }
  }
});

test('a returning branch departs from a different side than its entry, independently of route request order', () => {
  const graph = { nodes: [
    { id: 'a', tree_box: { x: 40, y: 160, w: 90, h: 40 } },
    { id: 'b', tree_box: { x: 240, y: 160, w: 90, h: 40 } },
    { id: 'c', tree_box: { x: 40, y: 40, w: 90, h: 40 } },
  ], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] };
  const layout = tree.layoutGraph(graph);
  const departure = tree.edgePath(graph.edges[1], layout);
  const incoming = layout.routes.get('a>b').at(-1), outgoing = layout.routes.get('b>c')[0];
  const b = layout.positions.get('b');
  assert.equal(incoming.x, b.x - 5);
  assert.ok(outgoing.x > b.x, 'departure must use the top, right or bottom side');
  const again = tree.layoutGraph(graph);
  tree.edgePath(graph.edges[0], again);
  assert.equal(tree.edgePath(graph.edges[1], again), departure);
});

test('all five cycles keep their chosen layouts with space for arrowheads and condition captions', () => {
  const c = context();
  let count = 0;
  for (const language of ['en', 'zh']) {
    c.treeLanguage = language;
    for (const page of c.data.pages) {
      const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
      const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
      assert.equal(layout.positions.size, page.nodes.length);
      assert.equal(layout.width, page.battle_grid
        ? Math.max(page.width * layout.spacingX, ...[...layout.positions.values()].map(pos => pos.x + pos.width + 16))
        : page.width * layout.spacingX);
      assert.equal(layout.height, page.height * layout.spacingY);
      for (const node of page.nodes) {
        const position = layout.positions.get(node.id), box = node.tree_box;
        const column = page.nodes.find(item => item.id === page.node_align_x?.[node.id])?.tree_box || box;
        const row = page.nodes.find(item => item.id === page.node_align_y?.[node.id])?.tree_box || box;
        const group = page.node_shift_groups?.find(item => item.nodes.includes(node.id));
        const from = page.nodes.find(item => item.id === group?.from)?.tree_box;
        const to = page.nodes.find(item => item.id === group?.to)?.tree_box;
        const shift = group ? to.y + to.h / 2 - from.y - from.h / 2 : 0;
        const grid = page.battle_grid, slot = grid?.slots[node.id];
        const centerX = slot ? grid.x + slot[0] * grid.column_gap : (column.x + column.w / 2) * layout.spacingX;
        const centerY = slot ? grid.y + slot[1] * grid.row_gap : (row.y + row.h / 2 + shift) * layout.spacingY;
        assert.ok(Math.abs(position.x + position.width / 2 - centerX) < .001);
        assert.ok(Math.abs(position.y + position.height / 2 - centerY) < .001);
        assert.ok(position.width <= 104 && position.height >= 34 && position.height <= Math.max(34, box.h));
      }
      const positions = [...layout.positions.values()];
      for (const position of positions) {
        assert.ok(position.x >= 0 && position.y >= 0);
        assert.ok(position.x + position.width <= layout.width);
        assert.ok(position.y + position.totalHeight <= layout.height);
        for (const other of positions) {
          if (other === position) continue;
          assert.ok(position.x + position.width <= other.x || other.x + other.width <= position.x || position.y + position.totalHeight <= other.y || other.y + other.totalHeight <= position.y);
        }
      }
      graph.edges.forEach(edge => {
        const path = tree.edgePath(edge, layout);
        assert.match(path, /^M /);
        assert.doesNotMatch(path, /NaN|Infinity/);
        const route = layout.routes.get(edge.source + '>' + edge.target);
        for (let index = 1; index < route.length; index++) {
          const a = route[index - 1], b = route[index];
          for (let obstacleIndex = 0; obstacleIndex < layout.obstacles.length; obstacleIndex++) {
            const original = layout.obstacles[obstacleIndex];
            const endpoint = original === layout.obstacles[[...layout.positions.keys()].indexOf(edge.source)]
              || original === layout.obstacles[[...layout.positions.keys()].indexOf(edge.target)];
            const rect = endpoint ? original : layout.routingObstacles[obstacleIndex];
            if (Math.abs(a.x - b.x) < .001) {
              assert.ok(!(a.x > rect.x + .01 && a.x < rect.x + rect.width - .01 && Math.max(a.y, b.y) > rect.y + .01 && Math.min(a.y, b.y) < rect.y + rect.height - .01), `${page.key}: ${edge.source} -> ${edge.target} crosses a module`);
            } else {
              assert.ok(!(a.y > rect.y + .01 && a.y < rect.y + rect.height - .01 && Math.max(a.x, b.x) > rect.x + .01 && Math.min(a.x, b.x) < rect.x + rect.width - .01), `${page.key}: ${edge.source} -> ${edge.target} crosses a module`);
            }
          }
        }
      });
      for (const node of page.nodes) {
        const rect = layout.positions.get(node.id);
        const entries = graph.edges.filter(edge => edge.target === node.id).map(edge => {
          const endpoint = layout.routes.get(edge.source + '>' + edge.target).at(-1);
          return { x: endpoint.x + (endpoint.x < rect.x ? 5 : endpoint.x > rect.x + rect.width ? -5 : 0),
            y: endpoint.y + (endpoint.y < rect.y ? 5 : endpoint.y > rect.y + rect.height ? -5 : 0) };
        });
        for (const edge of graph.edges.filter(edge => edge.source === node.id)) {
          const exit = layout.routes.get(edge.source + '>' + edge.target)[0];
          assert.ok(entries.every(entry => Math.hypot(entry.x - exit.x, entry.y - exit.y) > 1), `${page.key}: ${node.name} shares its entry and exit`);
        }
      }
      const segments = tree.linkSegments(graph.edges, layout);
      for (const segment of segments) {
        for (const other of segments) {
          if (segment === other) continue;
          const vertical = segment.start.x === segment.end.x;
          if (vertical && other.start.x === other.end.x && segment.start.x === other.start.x) {
            assert.ok(Math.min(segment.end.y, other.end.y) <= Math.max(segment.start.y, other.start.y));
          } else if (!vertical && other.start.y === other.end.y && segment.start.y === other.start.y) {
            assert.ok(Math.min(segment.end.x, other.end.x) <= Math.max(segment.start.x, other.start.x));
          }
        }
      }
      count += page.nodes.length;
    }
  }
  assert.equal(count, 646);
});

test('cycle II security sits above recruitment level with the works and recruitment enters the propylon from above', () => {
  const c = context(), page = c.data.pages[1];
  const recruit = page.nodes.find(node => node.name === 'War Recruitment');
  const security = page.nodes.find(node => node.name === 'Argo Security');
  const works = page.nodes.find(node => node.name === 'Argo Works II');
  const gate = page.nodes.find(node => node.name === 'War Propylon');
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  const originalRecruit = { ...recruit.tree_box }, originalSecurity = { ...security.tree_box };
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
    const r = layout.positions.get(recruit.id), s = layout.positions.get(security.id), g = layout.positions.get(gate.id);
    assert.equal(r.y + r.height / 2, (originalSecurity.y + originalSecurity.h / 2) * layout.spacingY);
    const w = layout.positions.get(works.id);
    assert.equal(s.y + s.height / 2, w.y + w.height / 2);
    assert.equal(s.x + s.width / 2, r.x + r.width / 2);
    assert.equal(s.width, r.width);
    assert.equal(s.height, r.height);
    assert.ok(s.y + s.totalHeight < r.y);
    const edge = graph.edges.find(item => item.source === recruit.id && item.target === gate.id);
    tree.edgePath(edge, layout);
    const route = layout.routes.get(edge.source + '>' + edge.target);
    assert.equal(route[0].x, r.x);
    assert.ok(route[1].x < route[0].x, 'arrow departs to the left');
    assert.equal(route.at(-1).x, g.x + g.width / 2);
    assert.equal(route.at(-1).y, g.y - 5);
    assert.ok(route.at(-2).y < route.at(-1).y, 'arrow enters the top of the gate');
  }
  assert.deepEqual({ ...recruit.tree_box }, originalRecruit);
  assert.deepEqual({ ...security.tree_box }, originalSecurity);
});

test('adjusted related nodes form straight horizontal branches in both languages', () => {
  const c = context();
  const branches = [
    [['cycle1_22', 'cycle1_30'], ['cycle1_30', 'cycle1_51'], ['cycle1_51', 'cycle1_29'], ['cycle1_29', 'cycle1_2'], ['cycle1_5', 'cycle1_7']],
    [['cycle2_30', 'cycle2_29'], ['cycle2_43', 'cycle2_14'], ['cycle2_31', 'cycle2_11'], ['cycle2_54', 'cycle2_17'],
      ['cycle2_47', 'cycle2_28'], ['cycle2_28', 'cycle2_46'],
      ['cycle2_35', 'cycle2_33'], ['cycle2_33', 'cycle2_10'], ['cycle2_10', 'cycle2_14'],
      ['cycle2_49', 'cycle2_9'], ['cycle2_9', 'cycle2_25']],
    [['cycle3_20', 'cycle3_57'], ['cycle3_57', 'cycle3_1'], ['cycle3_22', 'cycle3_58'], ['cycle3_58', 'cycle3_2'],
      ['cycle3_5', 'cycle3_65'], ['cycle3_25', 'cycle3_4'], ['cycle3_43', 'cycle3_40']],
    [['cycle4_da2185', 'cycle4_da2193'], ['cycle4_da2205', 'cycle4_da2211'], ['cycle4_da2211', 'cycle4_da2216'],
      ['cycle4_da2203', 'cycle4_da2220'], ['cycle4_da2200', 'cycle4_da2204']],
    [['cycle5_ea2777', 'cycle5_ea2778'], ['cycle5_ea2778', 'cycle5_ea2779'], ['cycle5_ea2776', 'cycle5_ea2777'],
      ['cycle5_ea2749', 'cycle5_ea2776'], ['cycle5_ea2766', 'cycle5_ea2767'], ['cycle5_ea2772', 'cycle5_ea2782'],
      ['cycle5_ea2729', 'cycle5_ea2747'], ['cycle5_ea2747', 'cycle5_ea2757']],
  ];
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    for (const [index, pairs] of branches.entries()) {
      const page = c.data.pages[index];
      const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
      const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
      for (const [source, target] of pairs) {
        const edge = graph.edges.find(item => item.source === source && item.target === target);
        assert.ok(edge, `${source} -> ${target} is a real dependency`);
        const a = layout.positions.get(source), b = layout.positions.get(target);
        assert.ok(Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < .001);
        tree.edgePath(edge, layout);
        const route = layout.routes.get(source + '>' + target);
        assert.equal(route.length, 2, `${language}: ${source} -> ${target} is straight`);
        assert.ok(Math.abs(route[0].y - route[1].y) < .001);
      }
      for (const id of Object.keys(page.node_align_y)) {
        if (!pairs.flat().includes(id)) continue;
        const node = page.nodes.find(item => item.id === id), rect = layout.positions.get(id);
        const originalY = (node.tree_box.y + node.tree_box.h / 2) * layout.spacingY;
        if (index === 0) assert.ok(rect.y + rect.height / 2 > originalY, `${id} moves down`);
        if (index === 2 && ['cycle3_57', 'cycle3_58', 'cycle3_4'].includes(id)) assert.ok(rect.y + rect.height / 2 < originalY, `${id} moves up`);
      }
    }
  }
});

test('the upward arrow into relief gear has clear space around its head', () => {
  const c = context(), page = c.data.pages[1];
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
    const edge = graph.edges.find(item => item.source === 'cycle2_25' && item.target === 'cycle2_51');
    tree.edgePath(edge, layout);
    const route = layout.routes.get('cycle2_25>cycle2_51'), head = route.at(-1);
    assert.ok(route.at(-2).y > head.y, 'arrow points up');
    const segments = tree.linkSegments(graph.edges, layout);
    for (const segment of segments) {
      if (segment.edges.includes(edge)) continue;
      const { start: a, end: b } = segment;
      const touchesHead = a.y === b.y
        ? a.y >= head.y - 1 && a.y <= head.y + 7 && b.x > head.x - 4 && a.x < head.x + 4
        : a.x >= head.x - 4 && a.x <= head.x + 4 && b.y > head.y - 1 && a.y < head.y + 7;
      assert.equal(touchesHead, false, `${language}: another line crosses the upward arrowhead`);
    }
  }
});

test('cycle IV cloud support fleet receives from above and departs to the right', () => {
  const c = context(), page = c.data.pages[3];
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  const fleet = page.nodes.find(node => node.name === 'Cloud Support Fleet');
  const incoming = graph.edges.filter(edge => edge.target === fleet.id);
  const outgoing = graph.edges.filter(edge => edge.source === fleet.id);
  assert.equal(incoming.length, 2);
  assert.equal(outgoing.length, 2);
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
    const rect = layout.positions.get(fleet.id);
    for (const edge of incoming) {
      tree.edgePath(edge, layout);
      const route = layout.routes.get(edge.source + '>' + edge.target);
      assert.equal(route.at(-1).y, rect.y - 5);
      assert.equal(route.at(-1).x, rect.x + rect.width / 2);
      assert.ok(route.at(-2).y < route.at(-1).y, `${language}: arrow enters from above`);
    }
    for (const edge of outgoing) {
      const route = layout.routes.get(edge.source + '>' + edge.target);
      assert.equal(route[0].x, rect.x + rect.width);
      assert.ok(route[1].x > route[0].x, `${language}: arrow leaves to the right`);
    }
  }
});

test('cycle IV structural and cycle V adjustments move nodes in the specified direction', () => {
  const c = context();
  const changes = [
    [3, 'Sandstorm Navigation', 1],
    [3, 'Sustainable Oasis', -1], [3, 'Curse Economy Basics', -1],
    [4, 'Tight-spaces Navigation', -1],
  ];
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    for (const [index, name, direction] of changes) {
      const page = c.data.pages[index], node = page.nodes.find(item => item.name === name);
      const graph = tree.buildGraph(page.nodes, item => c.nodeKey(page.key, item));
      const layout = tree.layoutGraph(graph, page, item => c.treeModuleSize(page.key, item));
      const rect = layout.positions.get(node.id), box = node.tree_box;
      const difference = rect.y + rect.height / 2 - (box.y + box.h / 2) * layout.spacingY;
      assert.ok(direction * difference > 1, `${language}: ${name} moves ${direction > 0 ? 'down' : 'up'}`);
    }
  }
});

test('cycle IV battle branches have clear routing gutters, fewer crossings and preserve the structural layout', () => {
  const c = context(), page = c.data.pages[3];
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  const battle = new Set(page.nodes.filter(node => node.tree_box.y > page.split_y).map(node => node.id));
  const edges = graph.edges.filter(edge => battle.has(edge.source) || battle.has(edge.target));
  function crossings(layout) {
    const segments = tree.linkSegments(edges, layout);
    const horizontal = segments.filter(segment => segment.start.y === segment.end.y);
    const vertical = segments.filter(segment => segment.start.x === segment.end.x);
    return horizontal.reduce((count, a) => count + vertical.filter(b =>
      b.start.x > a.start.x + 1 && b.start.x < a.end.x - 1
      && a.start.y > b.start.y + 1 && a.start.y < b.end.y - 1).length, 0);
  }
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
    const original = tree.layoutGraph(graph, {
      ...page, battle_grid: undefined,
      node_align_y: { ...page.node_align_y, cycle4_da2185: 'cycle4_da2193' },
    }, node => c.treeModuleSize(page.key, node));
    for (const node of page.nodes.filter(node => !battle.has(node.id))) {
      assert.deepEqual(layout.positions.get(node.id), original.positions.get(node.id));
    }
    for (const edge of edges.filter(edge => battle.has(edge.source))) {
      const from = layout.positions.get(edge.source), to = layout.positions.get(edge.target);
      assert.ok(from.x + from.width < to.x, `${language}: ${edge.source} -> ${edge.target} progresses right`);
    }
    assert.ok(crossings(layout) < crossings(original), `${language}: fewer battle branch crossings`);
    const segments = tree.linkSegments(edges, layout);
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i], b = segments[j], vertical = a.start.x === a.end.x;
      if (vertical !== (b.start.x === b.end.x)) continue;
      const axis = vertical ? 'y' : 'x', fixed = vertical ? 'x' : 'y';
      const gap = Math.abs(a.start[fixed] - b.start[fixed]);
      const overlap = Math.min(a.end[axis], b.end[axis]) - Math.max(a.start[axis], b.start[axis]);
      assert.ok(overlap <= 30 || gap < .01 || gap >= 16,
        `${language}: parallel runs need at least 16px of space, received ${gap.toFixed(2)}px`);
    }
  }
});

test('cycle V abyss weapons and atlantean armor use separated horizontal lanes without moving nodes', () => {
  const c = context(), page = c.data.pages[4];
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  const edge = graph.edges.find(item => item.source === 'cycle5_ea2729' && item.target === 'cycle5_ea2735');
  const trunks = graph.edges.filter(item => item.source === 'cycle5_ea2734');
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
    const before = tree.layoutGraph(graph, { ...page, edge_channels: {} }, node => c.treeModuleSize(page.key, node));
    assert.deepEqual([...layout.positions], [...before.positions]);
    tree.edgePath(edge, layout);
    const horizontals = route => route.slice(1).map((end, index) => ({ start: route[index], end }))
      .filter(segment => segment.start.y === segment.end.y && Math.abs(segment.end.x - segment.start.x) > 50);
    const lane = horizontals(layout.routes.get(edge.source + '>' + edge.target));
    let compared = 0;
    for (const trunk of trunks) for (const a of lane) {
      for (const b of horizontals(layout.routes.get(trunk.source + '>' + trunk.target))) {
        const overlap = Math.min(Math.max(a.start.x, a.end.x), Math.max(b.start.x, b.end.x))
          - Math.max(Math.min(a.start.x, a.end.x), Math.min(b.start.x, b.end.x));
        if (overlap <= 50) continue;
        compared++;
        assert.ok(Math.abs(a.start.y - b.start.y) >= 18, `${language}: parallel lanes have visible separation`);
      }
    }
    assert.ok(compared > 0, 'the two branches overlap horizontally');
    const armor = layout.positions.get('cycle5_ea2734'), sighting = layout.positions.get('cycle5_ea2747');
    assert.ok(lane.some(segment => segment.start.y > armor.y + armor.totalHeight + 8
      && segment.start.y < sighting.y - 8), 'the moved lane stays in the clear gap between modules');
  }
});

test('empty and cyclic imported graphs have finite fixed layouts', () => {
  assert.equal(tree.layoutGraph({ nodes: [], edges: [] }).positions.size, 0);
  const graph = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [
    { source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'b', target: 'c' },
  ] };
  const layout = tree.layoutGraph(graph);
  assert.equal(layout.positions.size, 3);
  for (const edge of graph.edges) assert.match(tree.edgePath(edge, layout), /^M /);
  assert.ok(Number.isFinite(layout.width));
});

test('revealing a branch preserves the coordinates and paths of already discovered nodes', () => {
  const c = context(), page = c.data.pages[0];
  const graph = tree.buildGraph(page.nodes, node => c.nodeKey(page.key, node));
  const layout = tree.layoutGraph(graph, page, node => c.treeModuleSize(page.key, node));
  const before = tree.visibleGraph(graph, node => c.isDiscoveredNode(page.key, node), true);
  const snapshot = JSON.stringify([...layout.positions]);
  const paths = before.edges.map(edge => tree.edgePath(edge, layout));
  c.unlocked.add('trading solutions');
  const after = tree.visibleGraph(graph, node => c.isDiscoveredNode(page.key, node), true);
  assert.ok(after.nodes.length > before.nodes.length);
  assert.equal(JSON.stringify([...layout.positions]), snapshot);
  assert.deepEqual(before.edges.map(edge => tree.edgePath(edge, layout)), paths);
});


test('科技页不会再声明布局文件已经声明过的脚本级名字', () => {
  // 布局元数据搬到 technology/tech-page-layout.js 之后，两个文件是同一个文档里的两个经典脚本：
  // 全局词法作用域共享，页面里再写一次 const PAGE_METADATA 会让整段内联脚本以 SyntaxError
  // 结束（页面停在「正在连接...」），所以这里按声明名交叉核对。
  const declared = [...layoutSource.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/gm)].map(match => match[1]);
  assert.ok(declared.includes('PAGE_METADATA'), '布局文件应当保留 const PAGE_METADATA 声明');
  const inlineScripts = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.ok(inlineScripts.length > 0, '科技页应当有内联脚本');
  const clashes = [];
  for (const body of inlineScripts) {
    for (const match of body.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (declared.includes(match[1])) clashes.push(match[1]);
    }
  }
  assert.deepEqual(clashes, [], '内联脚本重复声明了布局文件的脚本级名字：' + clashes.join(', '));
});
