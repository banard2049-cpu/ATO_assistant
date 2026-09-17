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
  const hidden = ctx.getExplorationLibrary().filter(card => card.hidden);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].id, '8201');
  assert.ok(!ctx.getSelectedExplorationIds().includes('8201'));
  ctx.state.exploration.selectedByCycle.c1.push('8201');
  assert.ok(ctx.getSelectedExplorationIds().includes('8201'));
  for (cycle of ['c2', 'c3', 'c4', 'c5']) {
    assert.equal(ctx.getExplorationLibrary().filter(card => card.hidden).length, 0);
    assert.ok(!ctx.getSelectedExplorationIds().includes('8201'));
  }
  cycle = 'c1';
  assert.ok(ctx.getSelectedExplorationIds().includes('8201'));
});

test('secret exploration card follows its printed temporary removal rule', () => {
  const ctx = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/exploration-card-tags.js'), 'utf8'), ctx);
  const tag = ctx.window.ATO_EXPLORATION_CARD_TAGS.cards['c1:8201'];
  assert.equal(tag.removal, 'remove');
  assert.equal(tag.draw, 'chain');
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

test('focus after spoiler confirmation preserves the picker when records are unchanged', async () => {
  let renders = 0;
  let record = {crew: 5};
  const ctx = vm.createContext({
    argoRecordRefreshInFlight: false, cachedArgoRecord: {crew: 5},
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
