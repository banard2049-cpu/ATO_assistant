const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('../theatre/catalog.js');
const rules = require('../theatre/state.js');
const battleTool = require('../aibp/theatre-battle.js');
const terrain = require('../ss/terrain-data.js');
const { createTreeLayout, createRouter, edgePaths, buildConnections, metrics } = require('../theatre/graph.js');
const terms = require('../theatre/terms.js');
const theatreArsenal = require('../theatre/arsenal.js');

test('dashboard lists Theatre last and shows it at knowledge 20 or with the unlocked technology', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /href="\.\/story\/index\.html"[^]*?<a id="theatreLink"[^>]* hidden>[^]*?<\/a>\s*<\/nav>/);
  const link = { hidden: true };
  const context = vm.createContext({ document: { getElementById: () => link }, sessionUser: {},
    state: { cardTracks: { inwardOdyssey: { position: 19 } } }, getStructureTechContext: () => null });
  vm.runInContext(html.match(/^    function renderTheatreLink\([^]*?^    }/m)[0], context);
  context.renderTheatreLink();
  assert.equal(link.hidden, true);
  context.state.cardTracks.inwardOdyssey.position = 20;
  context.renderTheatreLink();
  assert.equal(link.hidden, false);
  context.state.cardTracks.inwardOdyssey.position = 19;
  context.state.unlockedTech = { unlockedKeys: ['mnestis theater'] };
  context.renderTheatreLink();
  assert.equal(link.hidden, false);
  context.getStructureTechContext = () => ({ technology: { unlocked: ['mnestis thesis'] } });
  context.renderTheatreLink();
  assert.equal(link.hidden, true);
  context.getStructureTechContext = () => ({ technology: { unlocked: ['mnestis theater'] } });
  context.renderTheatreLink();
  assert.equal(link.hidden, false);
});

test('Theatre labels use the selected rulebook and match AIBP for expansion bosses', () => {
  assert.equal(terms.ui('theatre', 'fan'), '忆识剧场');
  assert.equal(terms.ui('theatre', 'official'), '幻忆剧场');
  assert.equal(terms.ui('tree', 'fan'), '知识之树');
  assert.equal(terms.ui('loot', 'fan'), '固定掉落');
  assert.equal(terms.ui('loot', 'official'), '保底战利品');
  assert.equal(terms.boss('HEKATON', 'fan', 'Hekaton'), '百臂巨人');
  assert.equal(terms.boss('HEKATON', 'official', 'Hekaton'), '百手巨魔');
  const battleNames = require('../aibp/boss-search.js').entries;
  for (const [id, boss] of Object.entries(catalog.bosses).filter(([id, boss]) => ['c4', 'c5'].includes(boss.cycle) && id !== 'HELIOS')) {
    const { names } = battleNames.find(entry => entry.id === id);
    assert.equal(terms.boss(id, 'fan', boss.name), names.fan);
    assert.equal(terms.boss(id, 'official', boss.name), names.official);
  }
  assert.equal(terms.boss('MIDASCORE', 'en'), 'Midascore');
  assert.equal(terms.boss('HELIOS', 'en'), 'Old Haunt');
  // 剧场只看称号，不写「赫利俄斯」；AIBP 那边仍以赫利俄斯称呼，互不影响。
  assert.equal(terms.boss('HELIOS', 'fan', 'Old Haunt'), '旧日幽魂');
  assert.equal(terms.boss('HELIOS', 'official', 'Old Haunt'), '旧日幽魂');
  assert.equal(battleNames.find(entry => entry.id === 'HELIOS').names.fan, '赫利俄斯');
  const theatreHtml = fs.readFileSync(path.join(__dirname, '../theatre/index.html'), 'utf8');
  const termsTag = theatreHtml.match(/terms\.js\?v=\d+/);
  assert.ok(termsTag && theatreHtml.indexOf('boss-search.js') < theatreHtml.indexOf(termsTag[0]));
  assert.equal(terms.material('c2', 'core', 'fan', ''), '埋藏登升核心');
  assert.equal(terms.material('c2', 'core', 'official', ''), '开掘升华核心');
  // 四、五循环没有官方中文印刷，采用与前三个循环一致的构词（见 terms.js 注释）。
  assert.equal(terms.material('c4', 'tear', 'official', 'Blackburned Tear'), '焦黑之泪');
  assert.equal(terms.material('c4', 'core', 'fan', 'Blackburned Ascended Core'), '焦黑登升核心');
  assert.equal(terms.material('c5', 'tear', 'official', 'Moonfell Tear'), '月陨之泪');
  assert.equal(terms.material('c5', 'core', 'official', 'Moonfell Ascended Core'), '月陨升华核心');
  assert.equal(terms.material('c5', 'core', 'en', 'Moonfell Ascended Core'), 'Moonfell Ascended Core');
  const reward = catalog.loot.LABYRINTHAUROS[1];
  assert.equal(terms.loot(reward, 'fan'), 'Glimmer Shroud');
  assert.equal(terms.loot(reward, 'official'), '幽光裹尸布');
});

test('the one-page layout contains the wide knowledge tree within its scrolling column', () => {
  const css = fs.readFileSync(path.join(__dirname, '../theatre/theatre.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../theatre/index.html'), 'utf8');
  assert.match(html, /<button id="tree-graph"[^>]*>树图<\/button>/);
  assert.match(css, /\.tree-column\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  const board = css.match(/\.tree-board\s*\{([^}]*)\}/)[1];
  assert.match(board, /width:\s*100%/);
  assert.match(board, /overflow:\s*auto/);
  assert.match(board, /contain:\s*inline-size paint/);
});

test('tree nodes render only the icons for their rules and conceal secret card details', () => {
  const html = fs.readFileSync(path.join(__dirname, '../theatre/index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../theatre/app.js'), 'utf8');
  const state = rules.normalize(null);
  const context = vm.createContext({ catalog, rules, state, terms, language: 'fan', term: key => terms.ui(key, 'fan'),
    cycleName: cycle => `循环 ${rules.roman[Number(cycle[1])]}`, escape: String, selected: '',
    availability: () => 'locked', statusText: { locked: '锁定' }, bossName: boss => catalog.bosses[boss].label });
  for (const name of ['nodeButton', 'theatreIcon', 'iconBadge', 'nodeBadges', 'materialBadge', 'materialLabel']) {
    const match = source.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  const badges = id => context.nodeButton(rules.byId.get(id));
  const kinds = output => Array.from(output.matchAll(/node-badge badge-([\w-]+)/g), match => match[1]);
  assert.deepEqual(kinds(badges('HEKATON:5')), ['normal', 'tear']);
  assert.deepEqual(kinds(badges('THE_BABELIAN_LUNACY:4')), ['normal', 'cursed', 'tear', 'core', 'loot']);
  assert.deepEqual(kinds(badges('HERMESIAN_PURSUER:2')), ['normal', 'tear', 'expansion']);
  const secretNode = badges('THE_BABELIAN_LUNACY:8');
  assert.deepEqual(kinds(secretNode), ['normal', 'cursed', 'tear', 'core', 'secret']);
  assert.doesNotMatch(secretNode, /264/);
  // The level sits on the second row, under the boss name.
  assert.match(secretNode, /class="node-heading"><span class="node-name"[^>]*>[^<]*<\/span><\/span>\s*<span class="node-meta"><span class="node-level" title="始徒等级">VIII<\/span>/);
  assert.match(secretNode, /class="node-meta"[^]*?class="node-status">锁定<\/span><\/span>/);
  assert.doesNotMatch(secretNode, /badge-level/);
  assert.match(secretNode, /badge-tear[^>]*data-node-cycle="c4"/);
  rules.setRecordedWin(state, 'THE_BABELIAN_LUNACY:8', 'normal', true);
  rules.setRecordedWin(state, 'THE_BABELIAN_LUNACY:8', 'cursed', true);
  const won = badges('THE_BABELIAN_LUNACY:8');
  assert.equal((won.match(/theatre-won\.svg/g) || []).length, 2);
  assert.match(secretNode, /assets\/icons\/theatre-secret\.svg/);
  assert.doesNotMatch(html, /<symbol id="badge-/);
});

test('the compact tree fits and routes every unlocked cycle combination', () => {
  const cardWidth = 120, cardHeight = 31;
  const layoutTree = createTreeLayout(catalog.nodes, cardWidth, cardHeight);
  const fullMask = (1 << rules.cycles.length) - 1;
  for (let mask = 0; mask <= fullMask; mask++) {
    const cycles = new Set(rules.cycles.filter((_, index) => mask & (1 << index)));
    const visible = new Set(catalog.nodes.filter(node => cycles.has(node.cycle)).map(node => node.id));
    const { width, height, positions, links } = layoutTree(visible);
    assert.deepEqual(new Set(positions.keys()), visible);
    assert.ok(width <= 700 && height < 2000, `${width}x${height}`);
    assert.deepEqual(links, catalog.nodes.filter(node => visible.has(node.id)).flatMap(node =>
      node.prerequisites.filter(id => visible.has(id)).map(id => [id, node.id])));

    const rows = new Map();
    for (const [id, { x, y }] of positions) {
      assert.ok(x >= 5 && y >= metrics.entryLength && x + cardWidth + 5 <= width && y + cardHeight <= height);
      if (!rows.has(y)) rows.set(y, []);
      for (const other of rows.get(y)) assert.ok(Math.abs(x - other) >= cardWidth + 8, `${id} overlaps`);
      rows.get(y).push(x);
    }
    const rowOrder = [...rows.keys()].sort((a, b) => a - b);
    for (let i = 1; i < rowOrder.length; i++) {
      assert.equal(rowOrder[i] - rowOrder[i - 1], cardHeight + 13);
    }

    const router = createRouter(positions, cardWidth, cardHeight);
    const routes = router.routeAll(links);
    for (const [index, [from, to]] of links.entries()) {
      const route = routes[index];
      assert.ok(route, `${from} → ${to}`);
      const start = positions.get(from), target = positions.get(to);
      assert.deepEqual(route[0], [start.x + cardWidth / 2, start.y + cardHeight + metrics.exitLength]);
      assert.deepEqual(route.at(-1), [target.x + cardWidth / 2, target.y - metrics.entryLength]);
    }
    const paths = buildConnections(positions, cardWidth, cardHeight, links);
    assert.equal(new Set(paths.map(path => path.d)).size, paths.length);
    const arrows = paths.filter(path => path.arrow);
    assert.equal(arrows.length, new Set(links.map(([, to]) => to)).size);
    for (const [index, [from, to]] of links.entries()) {
      const start = positions.get(from), target = positions.get(to);
      const exit = paths.find(path => path.d.startsWith(`M ${start.x + cardWidth / 2} ${start.y + cardHeight} V `));
      const entry = arrows.find(path => path.d === `M ${target.x + cardWidth / 2} ${target.y - metrics.entryLength} V ${target.y + metrics.arrowInset}`);
      assert.ok(exit?.links.includes(index) && entry?.links.includes(index));
    }
    if (mask !== fullMask) continue;
    const catalogNode = id => catalog.byId[id];
    const coreBottom = Math.max(...[...positions].filter(([id]) => catalogNode(id).edition === 'core').map(([, point]) => point.y));
    const expansionTop = Math.min(...[...positions].filter(([id]) => catalogNode(id).edition === 'expansion').map(([, point]) => point.y));
    assert.ok(expansionTop > coreBottom);
    assert.equal(links.filter(([from, to]) => catalogNode(from).edition !== catalogNode(to).edition).length, 4);
    let length = 0;
    const traffic = new Map();
    const tracks = new Map();
    for (const route of routes) {
      for (let i = 1; i < route.length - 1; i++) {
        const [x, y] = route[i];
        const [px, py] = route[i - 1], [nx, ny] = route[i + 1];
        const axis = px === x && nx === x ? 1 : py === y && ny === y ? 2 : 0;
        const key = `${x},${y}`;
        traffic.set(key, (traffic.get(key) ?? 0) | axis);
      }
      for (let i = 1; i < route.length; i++) {
        const [x, y] = route[i - 1], [nx, ny] = route[i];
        assert.ok(ny >= y && (x === nx || y === ny));
        const vertical = x === nx;
        const [start, end, lane] = vertical ? [y, ny, x] : [Math.min(x, nx), Math.max(x, nx), y];
        const key = `${vertical}:${start}:${end}`;
        if (!tracks.has(key)) tracks.set(key, { length: end - start, lanes: new Set() });
        tracks.get(key).lanes.add(lane);
        length += end - start;
        for (const [id, point] of positions) {
          const crosses = x === nx
            ? point.x < x && x < point.x + cardWidth && y < point.y + cardHeight && ny > point.y
            : point.y < y && y < point.y + cardHeight && Math.min(x, nx) < point.x + cardWidth && Math.max(x, nx) > point.x;
          assert.ok(!crosses, `route crosses ${id}`);
        }
      }
    }
    const crossings = [...traffic.values()].filter(axes => axes === 3).length;
    assert.ok(crossings <= 27, `${crossings} crossings`);
    assert.ok(length + links.length * (metrics.entryLength + metrics.exitLength) < 22500, `route length ${length}`);
    let crowdedLength = 0;
    for (const { length, lanes } of tracks.values()) {
      const offsets = [...lanes].sort((a, b) => a - b);
      for (const [i, offset] of offsets.entries()) {
        for (const other of offsets.slice(i + 1)) {
          const gap = other - offset;
          assert.ok(gap >= 6, `parallel tracks ${gap}px apart`);
          if (gap <= 10) crowdedLength += length;
        }
      }
    }
    assert.ok(crowdedLength < 1600, `nearby parallel length ${crowdedLength}`);
  }
});

test('a fan-out shares its horizontal run before splitting', () => {
  const positions = new Map([['root', { x: 0, y: 0 }], ['near', { x: 100, y: 45 }], ['far', { x: 200, y: 45 }]]);
  const paths = buildConnections(positions, 80, 31, [['root', 'near'], ['root', 'far']]);
  assert.ok(paths.some(path => path.links.length === 2
    && path.d.includes(`L 140 ${45 - metrics.entryLength}`)));
  assert.equal(paths.filter(path => path.arrow).length, 2);
});

test('arrow crossings have a gap and rounded bends preserve the terminal direction', () => {
  const [horizontal, vertical] = edgePaths([[[0, 10], [20, 10]], [[10, 0], [10, 20]]]);
  assert.equal(horizontal, 'M 0 10 L 7 10 M 13 10 L 20 10');
  assert.equal(vertical, 'M 10 0 L 10 20');
  assert.equal(edgePaths([[[0, 10], [10, 10], [10, 20]], [[15, 0], [15, 10]]])[0], 'M 0 10 L 6 10 Q 10 10 10 14 L 10 20');
});

test('each hold entry uses its material icon, one language, balance, and notes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../theatre/app.js'), 'utf8');
  const state = rules.normalize(null);
  state.hold.c5.tear.count = 7;
  state.hold.c5.tear.notes = '账目';
  const context = vm.createContext({ catalog, state, terms, language: 'official', escape: String });
  for (const name of ['holdCard', 'theatreIcon', 'materialLabel', 'sheetField']) {
    const match = source.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  for (const cycle of rules.cycles) {
    for (const kind of ['tear', 'core']) {
      const card = context.holdCard(cycle, kind);
      assert.ok(card.includes(`assets/icons/theatre-${kind}.svg`));
      // 每张卡只写当前语言的名字，不再并排英文小字。
      assert.ok(card.includes(terms.material(cycle, kind, 'official', catalog.cycleMaterials[cycle][kind])), `${cycle} ${kind}`);
      assert.doesNotMatch(card, /<small|lang="en"/);
      assert.ok(card.includes(`data-field="hold.${cycle}.${kind}.count"`));
      assert.ok(card.includes(`data-field="hold.${cycle}.${kind}.notes"`));
    }
  }
  assert.match(context.holdCard('c5', 'tear'), /value="7"/);
  assert.match(context.holdCard('c5', 'tear'), />账目<\/textarea>/);
  assert.doesNotMatch(source, /skyseerExpansion/);
});

test('progress colors the single-row evolution track without changing its Roman numerals', () => {
  const source = fs.readFileSync(path.join(__dirname, '../theatre/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../theatre/theatre.css'), 'utf8');
  assert.match(css, /\.track-levels\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--levels\)/);
  const state = rules.normalize(null);
  rules.setRecordedWin(state, 'DAHAKA:2', 'normal', true);
  rules.setRecordedWin(state, 'DAHAKA:2', 'cursed', true);
  rules.setRecordedWin(state, 'DAHAKA:3', 'normal', true);
  const sheet = {};
  const context = vm.createContext({ catalog, rules, state, selected: '', sheetOrder: ['DAHAKA'],
    cycleUnlocked: () => true,
    terms, language: 'fan', term: key => terms.ui(key, 'fan'), cycleName: String,
    statusText: { locked: '锁定' }, escape: String, bossName: String, titleFor: node => node.id,
    availability: () => 'locked', $: () => sheet });
  for (const name of ['renderSheet', 'holdCard', 'theatreIcon', 'materialLabel', 'sheetField']) {
    vm.runInContext(source.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'))[0], context);
  }
  context.renderSheet();
  assert.match(sheet.innerHTML, /--levels:8/);
  assert.match(sheet.innerHTML, /data-node="DAHAKA:2"[^>]*cursed-win">\s*II<\/button>/);
  assert.match(sheet.innerHTML, /data-node="DAHAKA:3"[^>]* win">\s*III<\/button>/);
  assert.doesNotMatch(sheet.innerHTML, /✓|✦/);
});

test('cycles stay hidden until their own cycle is ticked complete', () => {
  const source = fs.readFileSync(path.join(__dirname, '../theatre/app.js'), 'utf8');
  const state = rules.normalize(null);
  const context = vm.createContext({ rules, state });
  const fns = vm.runInContext(source.match(/^  function cycleUnlocked\([^]*?^  }/m)[0]
    + '\n' + source.match(/^  const visibleNode = [^\n]+/m)[0]
    + '\n({ cycleUnlocked, visibleNode })', context);
  const cycles = ['c1', 'c2', 'c3', 'c4', 'c5'];
  // Nothing is ticked yet, so no cycle shows its nodes.
  assert.deepEqual(cycles.filter(cycle => fns.cycleUnlocked(cycle)), []);
  assert.equal(fns.visibleNode(null), false);
  assert.equal(fns.visibleNode(rules.byId.get('HEKATON:5')), false);
  state.completed.c4 = true;
  assert.deepEqual(cycles.filter(cycle => fns.cycleUnlocked(cycle)), ['c4']);
  assert.equal(fns.visibleNode(rules.byId.get('DAHAKA:2')), true);
  assert.equal(fns.visibleNode(rules.byId.get('TITAN_X:2')), false);
  // Old Haunt VI–IX belong to cycle V even though the track starts in IV.
  assert.equal(fns.visibleNode(rules.byId.get('HELIOS:9')), false);
  state.completed.c5 = true;
  assert.equal(fns.visibleNode(rules.byId.get('HELIOS:9')), true);
});

test('AIBP shows one right-side Theatre return button in the battle header', () => {
  const html = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '../assets/mobile/play.js'), 'utf8');
  assert.match(html, /<div class="title-actions">[^]*?<a id="theatreBattleReturn"[^>]+hidden>/);
  assert.doesNotMatch(html, /theatreBattleBanner|theatreBattleMode/);
  assert.match(mobile, /ctx\.move\(\$\('#theatreBattleReturn'\), line\)/);
});

test('knowledge tree catalog is complete, connected by valid prerequisites, and acyclic', () => {
  const sizes = { core: 70, expansion: 60 };
  for (const [edition, size] of Object.entries(sizes)) {
    assert.equal(catalog.nodes.filter(node => node.edition === edition).length, size);
  }
  assert.equal(rules.byId.size, 130);
  assert.equal(catalog.nodes.filter(node => node.cursed).length, 26);
  const visited = new Set();
  const chain = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    assert.ok(!chain.has(id), `cyclic prerequisite at ${id}`);
    const node = rules.byId.get(id);
    assert.ok(node, `unknown prerequisite ${id}`);
    chain.add(id);
    node.prerequisites.forEach(visit);
    chain.delete(id);
    visited.add(id);
    if (node.reward?.type === 'loot') assert.ok(catalog.loot[node.boss]?.length, `missing loot for ${id}`);
  }
  catalog.nodes.forEach(node => visit(node.id));
});

test('Theatre Titan X IX uses the regular one-boss board', () => {
  const setup = battleTool.setupId(terrain, 'TITAN_X');
  assert.equal(setup, 'the-devil-himself');
  assert.equal(terrain.createBattleMap('TITAN_X', 9, setup).setupId, setup);
  assert.equal(terrain.createBattleMap('TITAN_X', 9).setupId, 'all-good-things');
  for (const [boss, low, high] of [['HEKATON', 8, 9], ['CYCLONUS', 8, 9], ['THE_BURDEN', 5, 9]]) {
    const fixed = battleTool.setupId(terrain, boss);
    assert.deepEqual(terrain.getTiles(boss, low, fixed), terrain.getTiles(boss, high, fixed));
  }
});

function start(state, id, mode = 'normal', attempt = 'battle-001') {
  const [boss, level] = id.split(':');
  const target = rules.battleTarget(boss, Number(level));
  return rules.start(state, { ...target, id: attempt, mode, trait: mode === 'cursed' ? 4 : null });
}

function finish(state, overrides = {}) {
  return rules.settle(state, { id: state.activeBattle.id, outcome: 'victory', knockouts: 2, roll: .6, ...overrides });
}

test('expansion requires dashboard cycle IV or V, even when its progress exists', () => {
  for (const cycle of [null, undefined, 'unknown', 'c1', 'c2', 'c3', 'c6']) {
    assert.equal(rules.canShowEdition('core', cycle), true);
    assert.equal(rules.canShowEdition('expansion', cycle), false);
  }
  const state = rules.normalize(null);
  state.completed.c4 = true;
  const request = battleTool.parse('?theatreBattle=test-expansion-battle&apostle=MIDASCORE&cycle=c4&level=5&mode=normal');
  rules.start(state, request);
  const payload = { ok: true, state, user: { id: 'fixture' } };
  assert.equal(battleTool.verify(request, { ...payload, dashboardCycle: 'c3' }, ['MIDASCORE']), null);
  for (const cycle of ['c4', 'c5']) {
    assert.equal(rules.canShowEdition('expansion', cycle), true);
    assert.equal(battleTool.verify(request, { ...payload, dashboardCycle: cycle }, ['MIDASCORE']).id, request.id);
  }
  assert.equal(state.activeBattle.id, request.id);
});

test('knowledge tree requires the cycle and every predecessor', () => {
  const state = rules.normalize(null);
  const pursuer = rules.byId.get('HERMESIAN_PURSUER:3');
  assert.deepEqual(rules.blockers(state, pursuer), [{ cycle: 'c1' }, { node: 'ALPHA_TEMENOS:2' }, { node: 'LABYRINTHAUROS:6' }]);
  state.completed.c1 = true;
  rules.setRecordedWin(state, 'ALPHA_TEMENOS:2', 'normal', true);
  assert.throws(() => start(state, pursuer.id), /尚未解锁/);
  rules.setRecordedWin(state, 'LABYRINTHAUROS:6', 'normal', true);
  start(state, pursuer.id);
  finish(state);
  assert.equal(state.hold.c1.tear.count, 1);
  assert.equal(state.wins[pursuer.id].reward.name, 'Vulture Mask');
  assert.equal(state.wins[pursuer.id].reward.carry, true);
});

test('guaranteed loot draws from cards absent from saved first-win rewards', () => {
  const [first, second] = catalog.loot.LABYRINTHAUROS;
  const state = rules.normalize({
    completed: { c1: true },
    wins: { 'LABYRINTHAUROS:6': { normal: true, reward: { type: 'loot', ...first, carry: true } } },
  });
  const node = rules.byId.get('LABYRINTHAUROS:7');
  for (const id of node.prerequisites) rules.setRecordedWin(state, id, 'normal', true);
  start(state, node.id);
  finish(state, { roll: 0 });
  assert.deepEqual(state.wins[node.id].reward, { type: 'loot', ...second, carry: true });
  assert.deepEqual(rules.availableLoot(state, node.boss), []);
  assert.deepEqual(state.wins['LABYRINTHAUROS:6'].reward, { type: 'loot', ...first, carry: true });
});

test('an exhausted guaranteed loot pool still settles the first win and grants materials once', () => {
  const state = rules.normalize({ completed: { c1: true } });
  const earlier = rules.byId.get('ALPHA_TEMENOS:2');
  const later = rules.byId.get('ALPHA_TEMENOS:6');
  for (const id of [...earlier.prerequisites, ...later.prerequisites]) rules.setRecordedWin(state, id, 'normal', true);
  start(state, earlier.id);
  finish(state);
  start(state, later.id, 'normal', 'battle-002');
  finish(state);
  rules.settle(state, { id: 'battle-002', outcome: 'victory', knockouts: 2, roll: .6 });
  assert.equal(state.wins[earlier.id].reward.name, 'Pyramidion');
  assert.equal(state.wins[later.id].reward, null);
  assert.equal(state.wins[later.id].earned, true);
  assert.equal(state.hold.c1.tear.count, 2);
  assert.equal(state.sheet.knockouts, 4);
});

test('gear images cover all loot and appear only after a reward is earned', () => {
  const rewardImages = require('../theatre/reward-images.json');
  for (const reward of Object.values(catalog.loot).flat()) {
    assert.equal(rewardImages[catalog.rewardKey(reward)].length, 1, reward.name);
  }
  for (const { reward } of catalog.nodes.filter(node => [12, 17].includes(node.reward?.deck))) {
    assert.ok(rewardImages[catalog.rewardKey(reward)].length);
  }
  const source = fs.readFileSync(path.join(__dirname, '../theatre/app.js'), 'utf8');
  const state = rules.normalize(null);
  const context = vm.createContext({ catalog, rules, terms, language: 'fan', state, rewardImages,
    term: key => terms.ui(key, 'fan'), escape: String });
  vm.runInContext(source.slice(source.indexOf('  function rewardLabel('), source.indexOf('  function renderDetail(')), context);
  const node = rules.byId.get('THE_BURDEN:9');
  assert.doesNotMatch(context.renderReward(node, undefined), /<img|159/);
  assert.doesNotMatch(context.renderReward(node, { normal: true, reward: null }), /<img|159/);
  const earned = context.renderReward(node, { normal: true, earned: true, reward: node.reward });
  assert.match(earned, /gear_cards\/sd-12-159-1\.jpg/);
  assert.match(earned, /gear_cards\/sd-12-159-2\.jpg/);
});

test('only obtained, carryable gear has an add button, including rewards from older saves', () => {
  const production = require('../technology/ato_gear_production.json');
  const rewardImages = require('../theatre/reward-images.json');
  for (const [boss, rewards] of Object.entries(catalog.loot)) {
    const node = catalog.nodes.find(node => node.boss === boss && node.reward?.type === 'loot');
    for (const reward of rewards) {
      const [gearId] = catalog.rewardGear(node, { normal: true, reward: { ...reward, type: 'loot', carry: true } });
      assert.ok(production.gearCards[gearId], reward.name);
      assert.equal(rewardImages[catalog.rewardKey(reward)][0].split('/').at(-1), `${gearId.toLowerCase()}.jpg`);
    }
  }
  const source = fs.readFileSync(path.join(__dirname, '../theatre/app.js'), 'utf8');
  const state = rules.normalize(null);
  const context = vm.createContext({ catalog, rules, terms, language: 'fan', state, rewardImages: {},
    arsenal: theatreArsenal, arsenalSnapshot: null, arsenalReading: false, arsenalSaving: false, arsenalError: '',
    term: key => terms.ui(key, 'fan'), escape: String });
  vm.runInContext(source.slice(source.indexOf('  function rewardLabel('), source.indexOf('  function renderDetail(')), context);
  const shield = catalog.byId['HEKATON:7'];
  const reward = { ...catalog.loot.HEKATON[0], type: 'loot', carry: true };
  assert.doesNotMatch(context.renderReward(shield, null), /data-add-reward-gear/);
  assert.match(context.renderReward(shield, { normal: true, reward }), /data-add-reward-gear="AJ0257"/);
  assert.doesNotMatch(context.renderReward(shield, { normal: true, reward: { ...reward, carry: false } }), /data-add-reward-gear/);
  const skyseer = catalog.byId['HERMESIAN_PURSUER:2'];
  const html = context.renderReward(skyseer, { normal: true, earned: true, reward: skyseer.reward });
  assert.deepEqual([...html.matchAll(/data-add-reward-gear="([^"]+)"/g)].map(match => match[1]), ['ZJ1240', 'ZJ1239']);
  const nymph = catalog.byId['THE_BURDEN:5'];
  assert.doesNotMatch(context.renderReward(nymph, { normal: true, earned: true, reward: nymph.reward }), /data-add-reward-gear/);
});

test('adding theatre gear preserves concurrent changes and recovers a lost response without crediting the reward twice', async () => {
  const nodeId = 'HEKATON:7';
  const gearId = 'AJ0257';
  const campaign = {
    sections: {
      dashboard: { activeProfileId: 'run-a' },
      record: { users: { 'run-a': { arsenal: { AJ0257: { quantity: 2, manufactured: 1 } }, notes: 'keep' },
        'run-b': { notes: 'other profile' } } },
      theatre: { completed: { c1: true }, wins: {
        [nodeId]: { normal: true, reward: { ...catalog.loot.HEKATON[0], type: 'loot', carry: true } },
      } },
    },
    sectionRevisions: { dashboard: 1, record: 2, theatre: 3 },
  };
  const session = { accountId: 'account', accept: value => value };
  let posts = 0;
  const respond = (status, body) => ({ ok: status === 200, status, json: async () => structuredClone(body) });
  const store = theatreArsenal.create(session, async (_url, options) => {
    if (!options.method) return respond(200, { ok: true, campaign });
    const request = JSON.parse(options.body);
    assert.deepEqual(Object.keys(request.sections), ['record']);
    assert.equal(request.expectedAccountId, 'account');
    assert.equal(request.userId, 'run-a');
    assert.deepEqual(request.expectedRevisions, campaign.sectionRevisions);
    const record = campaign.sections.record.users['run-a'];
    if (++posts === 1) {
      record.notes = 'updated in another tab';
      campaign.sectionRevisions.record++;
      return respond(409, { code: 'SAVE_CONFLICT' });
    }
    campaign.sections.record.users[request.userId] = request.sections.record;
    campaign.sectionRevisions.record++;
    throw new Error('connection closed after saving');
  });
  const { snapshot, revision } = await store.add(nodeId, gearId, 'run-a');
  assert.equal(revision, 4);
  assert.deepEqual(snapshot.record.arsenal.AJ0257, { quantity: 3, manufactured: 1 });
  assert.equal(snapshot.record.notes, 'updated in another tab');
  assert.equal(campaign.sections.record.users['run-b'].notes, 'other profile');
  assert.ok(theatreArsenal.wasAdded(await store.read(), nodeId, gearId));
  assert.equal((await store.add(nodeId, gearId, 'run-a')).revision, undefined);
  assert.equal(posts, 2);
  await assert.rejects(store.add(nodeId, 'BJ0962', 'run-a'), /奖励尚未领取或已变更/);
  campaign.sections.dashboard.activeProfileId = 'run-b';
  await assert.rejects(store.add(nodeId, gearId, 'run-a'), /档案已切换/);
  assert.equal(posts, 2);
});

test('Old Haunt follows its own cycle gate and the gate of each stage', () => {
  const state = rules.normalize(null);
  const low = rules.byId.get('HELIOS:2');
  const high = rules.byId.get('HELIOS:6');
  state.completed.c4 = true;
  for (const id of [...low.prerequisites, ...high.prerequisites]) rules.setRecordedWin(state, id, 'normal', true);
  // Old Haunt IV–V open once cycle IV is complete, with no separate story flag.
  assert.deepEqual(rules.blockers(state, low), []);
  // Old Haunt VI–IX still need cycle V.
  assert.deepEqual(rules.blockers(state, high), [{ cycle: 'c5' }]);
  assert.equal(low.cursed, false);
  assert.equal(high.cursed, false);
});

test('normal and cursed first wins settle independently with reload and retry', () => {
  let state = rules.normalize(null);
  state.completed.c4 = true;
  const node = catalog.nodes.find(item => item.cursed && item.core && item.reward?.type === 'loot');
  for (const id of node.prerequisites) rules.setRecordedWin(state, id, 'normal', true);
  assert.throws(() => start(state, node.id, 'cursed'), /尚未解锁/);
  start(state, node.id);
  finish(state);
  const reward = state.wins[node.id].reward;
  assert.equal(reward.type, 'loot');
  assert.equal(state.hold.c4.tear.count, 1);
  assert.equal(state.hold.c4.core.count, 1);
  assert.equal(state.sheet.knockouts, 2);
  rules.settle(state, { id: 'battle-001', outcome: 'victory', knockouts: 2, roll: .1 });
  assert.equal(state.hold.c4.tear.count, 1);
  assert.throws(() => start(state, node.id, 'normal', 'battle-002'), /首胜已结算/);
  start(state, node.id, 'cursed', 'battle-002');
  state = rules.normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(state.activeBattle.trait, 4);
  finish(state, { roll: .2 });
  assert.deepEqual(state.wins[node.id].reward, reward);
  assert.equal(state.wins[node.id].cursed, true);
  assert.equal(state.hold.c4.tear.count, 2);
  assert.equal(state.hold.c4.core.count, 2);
  assert.equal(state.sheet.knockouts, 4);
  rules.setRecordedWin(state, node.id, 'normal', false);
  rules.setRecordedWin(state, node.id, 'cursed', false);
  assert.equal(state.wins[node.id].cursed, true);
});

test('paper and campaign history allow replay without granting first-win rewards', () => {
  const state = rules.normalize(null);
  state.completed.c1 = true;
  rules.setRecordedWin(state, 'HEKATON:5', 'normal', true);
  state.campaignWins['HEKATON:1'] = true;
  start(state, 'HEKATON:5', 'custom');
  finish(state);
  start(state, 'HEKATON:1', 'custom', 'battle-002');
  finish(state, { outcome: 'defeat', knockouts: 3 });
  assert.equal(state.hold.c1.tear.count, 0);
  assert.equal(state.sheet.knockouts, 5);
  assert.deepEqual(Object.keys(state.wins), ['HEKATON:5']);
  rules.setRecordedWin(state, 'HEKATON:5', 'normal', false);
  assert.equal(state.wins['HEKATON:5'], undefined);
});

test('the merged sheet folds both edition sheets into one record', () => {
  const state = rules.normalize({ sheets: {
    core: { notes: '基础版笔记', knockouts: 3 },
    expansion: { notes: '扩展版笔记', knockouts: 2 },
  } });
  assert.equal(state.sheets, undefined);
  assert.equal(state.sheet.knockouts, 5);
  assert.equal(state.sheet.notes, '基础版笔记\n\n扩展版笔记');
  const reloaded = rules.normalize(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reloaded.sheet, state.sheet);
});

test('unsettled defeats, default Skyseer reward, and balance corrections remain independent', () => {
  const state = rules.normalize(null);
  state.completed.c1 = true;
  start(state, 'HEKATON:5');
  finish(state, { outcome: 'defeat' });
  assert.equal(state.wins['HEKATON:5'], undefined);
  assert.equal(state.hold.c1.tear.count, 0);
  start(state, 'HEKATON:5', 'normal', 'battle-002');
  finish(state);
  state.hold.c1.tear.count = 12;
  start(state, 'HERMESIAN_PURSUER:2', 'normal', 'battle-003');
  finish(state);
  assert.equal(state.hold.c1.tear.count, 13);
  assert.equal(state.wins['HERMESIAN_PURSUER:2'].reward.type, 'skyseer');
});

test('an old settled Skyseer victory gains its reward record without reissuing materials', () => {
  const id = 'HERMESIAN_PURSUER:2';
  const state = rules.normalize({
    skyseerExpansion: false,
    wins: { [id]: { normal: true, earned: true, reward: null } },
    hold: { c1: { tear: { count: 2 } } },
  });
  assert.deepEqual(state.wins[id].reward, { type: 'skyseer', carry: true });
  assert.equal(state.hold.c1.tear.count, 2);
  assert.equal(rules.normalize({ wins: { [id]: { normal: true, reward: null } } }).wins[id].reward, null);
  assert.ok(!Object.hasOwn(state, 'skyseerExpansion'));
});
