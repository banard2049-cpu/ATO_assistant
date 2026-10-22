const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
function fn(name) {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}
function constant(name) {
  const match = source.match(new RegExp('^    const ' + name + ' = [^]*?^    };', 'm'));
  assert.ok(match, name);
  return match[0];
}

test('Cycle I black 32 and starting selection use Dog Days instead of Untamed Titan', () => {
  const ctx = vm.createContext({});
  vm.runInContext([
    constant('explorationDecks'),
    constant('explorationCornerNumbers'),
    constant('defaultExplorationSelections'),
  ].join('\n'), ctx);
  const result = vm.runInContext(`({
    start: explorationDecks.c1.find(deck => deck.id === 'start').cards.map(card => card.id),
    corner: explorationCornerNumbers.c1,
    selected: defaultExplorationSelections.c1,
  })`, ctx);
  assert.ok(result.start.includes('6400'));
  assert.equal(result.corner['6400'], '32');
  assert.equal(result.corner['6433'], undefined);
  assert.ok(result.selected.includes('6400'));
  assert.ok(!result.selected.includes('6433'));
});

test('hidden exploration is cycle scoped, selectable and absent from starting decks', () => {
  let cycle = 'c1';
  const ctx = vm.createContext({
    currentCycleConfig: () => ({id: cycle}), state: {exploration: {}},
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
  });
  vm.runInContext([
    ...['explorationDecks', 'hiddenExplorationCards', 'defaultExplorationSelections'].map(constant),
    ...['normalizeExploration', 'getExplorationLibrary', 'getSelectedExplorationIds'].map(fn),
  ].join('\n'), ctx);
  const declared = vm.runInContext('hiddenExplorationCards', ctx);
  assert.ok(declared.c1.some(card => card.id === '8201'));
  for (cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const expected = declared[cycle].map(card => card.id);
    const hidden = ctx.getExplorationLibrary().filter(card => card.hidden).map(card => card.id);
    assert.deepEqual(Array.from(hidden), Array.from(expected), `${cycle} must expose all declared hidden cards`);
    for (const id of hidden) {
      assert.ok(!ctx.getSelectedExplorationIds().includes(id), `${cycle}:${id} must not start selected`);
      ctx.state.exploration.selectedByCycle[cycle].push(id);
      assert.ok(ctx.getSelectedExplorationIds().includes(id), `${cycle}:${id} can be selected`);
    }
    const otherIds = Object.entries(declared).filter(([id]) => id !== cycle).flatMap(([, cards]) => cards.map(card => card.id));
    assert.ok(otherIds.every(id => !ctx.getSelectedExplorationIds().includes(id)));
  }
  cycle = 'c1';
  assert.ok(ctx.getSelectedExplorationIds().includes('8201'));
});

test('multiple hidden cards in every cycle keep independent selections across cycle changes', () => {
  let cycle = 'c1';
  const ctx = vm.createContext({
    currentCycleConfig: () => ({id: cycle}), state: {exploration: {}},
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
  });
  vm.runInContext([
    ...['explorationDecks', 'hiddenExplorationCards', 'defaultExplorationSelections'].map(constant),
    ...['normalizeExploration', 'getExplorationLibrary', 'getSelectedExplorationIds'].map(fn),
    `for (let number = 1; number <= 5; number++) {
      hiddenExplorationCards['c' + number] = [0, 1].map(index => ({id: String(90000 + number * 10 + index), name: 'Fixture'}));
    }`,
  ].join('\n'), ctx);
  const selections = {};
  for (cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const hiddenIds = Array.from(ctx.getExplorationLibrary().filter(card => card.hidden).map(card => card.id));
    assert.equal(hiddenIds.length, 2);
    assert.ok(hiddenIds.every(id => !ctx.getSelectedExplorationIds().includes(id)));
    ctx.state.exploration.selectedByCycle[cycle].push(...hiddenIds, 'invalid', '90010');
    selections[cycle] = Array.from(ctx.getSelectedExplorationIds());
    assert.ok(hiddenIds.every(id => selections[cycle].includes(id)));
    assert.ok(!selections[cycle].includes('invalid'));
    if (cycle !== 'c1') assert.ok(!selections[cycle].includes('90010'));
  }
  for (cycle of ['c5', 'c4', 'c3', 'c2', 'c1']) {
    assert.deepEqual(Array.from(ctx.getSelectedExplorationIds()), selections[cycle]);
  }
});

test('secret exploration card follows its printed temporary removal rule', () => {
  const ctx = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/exploration-card-tags.js'), 'utf8'), ctx);
  const tag = ctx.window.ATO_EXPLORATION_CARD_TAGS.cards['c1:8201'];
  assert.equal(tag.removal, 'remove');
  assert.equal(tag.draw, 'single');
  const rules = require('../assets/exploration-card-rules.js');
  const result = rules.drawTwoPiles(['8201', 'ordinary', 'next'], id => id === '8201' ? tag : {},
    (id, tag, pile) => ({ id, ...tag, pile }));
  assert.deepEqual(result.piles.map(pile => pile.map(card => card.id)), [['8201'], ['ordinary']]);
  assert.deepEqual(result.drawPile, ['next']);
  assert.equal(rules.settlePiles(result.piles).temporaryRemoved[0].id, '8201');
});

test('spoiler consent gates names, images stay folded, and selections can be added and removed', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.open = false; this.style = {}; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    setAttribute(name, value) { this[name] = value; }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [
        ...(selector === 'details' && child.tag === 'details' ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector() { return this.children.find(child => child.role === 'img'); }
  }
  let consent = false;
  let prompts = 0;
  let imageLoads = 0;
  const selected = new Set();
  const ctx = vm.createContext({
    document: {createElement: tag => new Element(tag)},
    window: {confirm: () => { prompts++; return consent; }},
    getExplorationCardImageStyle: () => { imageLoads++; return 'background-image:url(card.png)'; },
  });
  vm.runInContext(fn('createHiddenExplorationMenu'), ctx);
  const menu = ctx.createHiddenExplorationMenu([{id: '8201', name: 'Secret card'}], selected);
  const click = () => menu.children[0].listeners.click({preventDefault() {}});
  click();
  assert.equal(menu.open, false);
  assert.equal(menu.children.length, 1, 'cancel must not populate secret names');
  consent = true;
  click();
  assert.equal(menu.open, true);
  const card = menu.children[1].children[1];
  const checkbox = card.children[0].children[0];
  const preview = card.children[1];
  assert.equal(preview.open, false);
  assert.equal(imageLoads, 0, 'opening the menu must not load card faces');
  checkbox.checked = true;
  checkbox.listeners.change();
  assert.ok(selected.has('8201'));
  checkbox.checked = false;
  checkbox.listeners.change();
  assert.ok(!selected.has('8201'));
  preview.open = true;
  preview.listeners.toggle();
  assert.equal(imageLoads, 1);
  click();
  assert.equal(menu.open, false);
  assert.equal(preview.open, false);
  click();
  assert.equal(menu.open, true);
  assert.equal(prompts, 3, 'each reopening requires consent');
  assert.equal(preview.open, false, 'reopening the menu keeps images folded');
});

test('lazy shared library preserves saved hidden selections without opening the spoiler menu', () => {
  const all = node => node.children.flatMap(child => [child, ...all(child)]);
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.style = {}; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    prepend(child) { this.appendChild(child); this.children.unshift(this.children.pop()); }
    appendChild(child) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = this;
      this.children.push(child);
    }
    contains(child) { return all(this).includes(child); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    setAttribute(name, value) { this[name] = value; }
    querySelectorAll(selector) {
      return all(this).filter(child =>
        selector === 'input[type="checkbox"]:checked' && child.tag === 'input' && child.checked);
    }
  }
  const applied = [];
  let hiddenBuilds = 0;
  let hiddenSelected;
  const ctx = vm.createContext({
    document: {createElement: tag => new Element(tag)}, window: {},
    state: {exploration: {lastSettlementByCycle: {}}},
    currentCycleConfig: () => ({id: 'c1'}), defaultExplorationSelections: {c1: []},
    getExplorationLibrary: () => [
      {id: '6404', name: 'Trade Post'}, {id: '8201', name: 'Saved secret', hidden: true},
      {id: '8202', name: 'Another secret', hidden: true},
    ],
    getSelectedExplorationIds: () => ['6404', '8201'],
    ensureExplorationDrawState: () => ({activePiles: [], temporaryRemoved: []}),
    getExplorationSpecialRule: () => null,
    createExplorationFactionStatus: () => new Element('div'),
    createExplorationDestructionTools: () => null,
    createHiddenExplorationMenu(cards, selected) {
      hiddenBuilds++;
      hiddenSelected = selected;
      assert.deepEqual(Array.from(cards, card => card.id), ['8201', '8202']);
      return new Element('details');
    },
    getExplorationCardImageStyle: () => '',
    getExplorationCornerNumber: () => '',
    getExplorationCardTag: () => ({}),
    applyExplorationSelection: ids => applied.push(Array.from(ids)),
    drawExplorationCard() {}, settleExplorationDraw() {}, mutateExplorationRecord() {},
    restoreDefaultExplorationSelection() {}, returnTemporaryExplorationCards() {},
  });
  vm.runInContext(fn('createExplorationTools'), ctx);
  const tools = ctx.createExplorationTools();
  const builder = all(tools).find(node => node.className === 'exploration-builder');
  const pile = all(tools).find(node => node.className === 'exploration-removed-pile');
  assert.equal(hiddenBuilds, 0, 'folded tools should not build the hidden menu');
  builder.open = true;
  builder.listeners.toggle();
  const apply = all(tools).find(node => node.textContent === '应用选择');
  apply.listeners.click();
  assert.deepEqual(applied[0], ['6404', '8201'], 'unopened secret menu must retain saved selections');
  hiddenSelected.delete('8201');
  hiddenSelected.add('8202');
  pile.open = true;
  pile.listeners.toggle();
  builder.listeners.toggle();
  assert.equal(hiddenBuilds, 1, 'moving the shared library must not reset hidden selections');
  assert.ok(pile.contains(apply));
  apply.listeners.click();
  assert.deepEqual(applied[1], ['6404', '8202'], 'new hidden choices must survive pane changes');
});

test('focus after spoiler confirmation preserves the picker when records are unchanged', async () => {
  let renders = 0;
  let record = {crew: 5};
  const ctx = vm.createContext({
    argoRecordRefreshInFlight: false, cachedArgoRecord: {crew: 5},
    state: {exploration: {}}, currentCycleConfig: () => ({id: 'c1'}),
    registerAutomaticExplorationDelays: async () => {},
    settleSingleExplorationEffects: async () => {},
    archive: { activeProfileId: 'test-profile' },
    readLocalArgoRecord: () => ({}), readServerArgoRecord: async () => ({record}),
    mergeArgoRecords: server => server,
    jsonEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    renderFlow: () => { renders++; }, console,
  });
  vm.runInContext(fn('refreshCachedArgoRecord'), ctx);
  await ctx.refreshCachedArgoRecord();
  assert.equal(renders, 0, 'unchanged record must not discard menu state or draft choices');
  assert.equal(ctx.argoRecordRefreshInFlight, false);
  record = {crew: 6};
  await ctx.refreshCachedArgoRecord();
  assert.equal(renders, 1, 'actual record updates must still render');
  assert.equal(ctx.cachedArgoRecord.crew, 6);
});
