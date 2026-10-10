const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const data = require('../aibp/boss-levels-data.js');
const clone = value => JSON.parse(JSON.stringify(value));
const card = (level, index = 1) => ({ type: 'BP', level, index });
function fn(name) {
  const match = source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}
function harness(wounds = 3) {
  const pile = () => ({ deck: [], discard: [], damage: [], damage1: [], damage2: [], removed: [], pending: null,
    supply: { I: [], II: [], III: [] } });
  const state = { AI: pile(), BP: pile(), tokens: [], aiExhaustedBonusIndex: 0, lastPendingType: '' };
  const shared = clone(data);
  shared.bosses.HEKATON.levels['1'].stats.wounds = wounds;
  let level = 1;
  const saves = [];
  const ctx = vm.createContext({
    structuredClone, Math: Object.assign(Object.create(Math), { random: () => 0 }),
    window: { AIBP_BOSS_LEVEL_DATA: shared }, currentApostle: 'HEKATON', piles: { HEKATON: state },
    currentApostleLevel: () => level, currentAiView: '弃牌', currentBpView: '损伤',
    undoStacks: {}, pendingUndoEntry: null, maxUndoSteps: 30, activeScry: null,
    isChimera: () => ctx.currentApostle === 'CHIMERA_METASTASIOS', bpDamageTargetSelect: { value: 'damage1' },
    ensurePiles() {}, updateAiViewTabs() {}, updateBpViewTabs() {}, updateNietzscheStateUi() {},
    panelWrap: { querySelector() {} }, battleMapControl: { render() {} }, renderPanelTokens() {}, renderExtraCards() {},
    undoAiButton: {}, undoBpButton: {}, aiBackInfo: {}, bpBackInfo: {}, bpDamageSummary: {}, healBpButton: {},
    deathblowBpButton: {}, deathblowBpStatus: {},
    deckBackDisplayText: cards => String(cards.length), renderNietzscheBreakLocks() {},
    savePiles: () => { ctx.captureUndoEffects(); saves.push(clone(ctx.piles[ctx.currentApostle])); },
    renderAibpCards: () => ctx.renderDeckInfo(),
  });
  for (const name of ['isPlainObject', 'clonePileState', 'rememberUndo', 'trimUndoStack', 'undoSharedState',
    'captureUndoEffects', 'undoEntryIndex', 'reverseUndoEffects', 'canUndo', 'undoLastAibp', 'updateUndoButtons',
    'shuffleCards', 'insertRandom', 'drawFromSupply', 'insertPromotedCard', 'hasSupply',
    'reshuffleDiscardIfDeckEmpty', 'removeFirstMatching', 'putIntoRemovedPile',
    'removeFirstMatchingToRemoved', 'lowestLevelCard', 'removeLowestCardToRemoved', 'promoteBpDeckForDefeatedLevel',
    'currentBpDamageKey', 'currentBpDamageView', 'bpDamageValue', 'currentBpHealIndex', 'healBp',
    'bpDamageTotalForKey', 'currentBpDamageSummary', 'currentBossWounds', 'bpDamageSummaryText',
    'deathblowUnavailableReason', 'renderDeathblowControl', 'resolveBossDeathblow', 'renderDeckInfo']) {
    vm.runInContext(fn(name), ctx);
  }
  return { ctx, state, saves, setLevel(value) { level = value; } };
}

test('total wounds reads the exact selected Boss/level and updates the damage display', () => {
  const { ctx, state, setLevel } = harness();
  state.BP.damage.push({ special: 'DW' });
  ctx.renderDeckInfo();
  assert.equal(ctx.bpDamageSummary.textContent, '损伤：2 / 3');
  setLevel(0);
  assert.equal(ctx.currentBossWounds(), 6);
  ctx.renderDeckInfo();
  assert.equal(ctx.bpDamageSummary.textContent, '损伤：2 / 6');
  setLevel(9);
  assert.equal(ctx.currentBossWounds(), data.bosses.HEKATON.levels['9'].stats.wounds);
  ctx.window.AIBP_BOSS_LEVEL_DATA.bosses.HEKATON.levels['9'].stats.wounds = 23;
  assert.equal(ctx.currentBossWounds(), 23);
  ctx.currentApostle = 'BLACKBEAK';
  assert.equal(ctx.currentBossWounds(), null);
  setLevel(1);
  assert.equal(ctx.currentBossWounds(), 12);
});

test('a terminal BP I adds a resource card without any promotion or combat effects', () => {
  const { ctx, state, saves } = harness(1);
  state.BP.deck = [card('I')];
  state.BP.supply.II = [card('II', 20)];
  state.AI.deck = [{ type: 'AI', level: 'I', index: 1 }];
  const ai = clone(state.AI);
  state.tokens = [{ file: 'DA+.png', count: 4 }];
  ctx.window.C45Specials = { recordBpWound() { throw Error('battle counters must not run'); } };
  assert.equal(ctx.resolveBossDeathblow(), true);
  assert.deepEqual(clone(state.BP.damage), [card('I')]);
  assert.equal(state.BP.supply.II.length, 1);
  assert.deepEqual(clone(state.AI), ai);
  assert.deepEqual(clone(state.tokens), [{ file: 'DA+.png', count: 4 }]);
  assert.equal(ctx.undoStacks.HEKATON.length, 1);
  assert.equal(saves.length, 1);
  assert.equal(ctx.resolveBossDeathblow(), false);
  assert.equal(saves.length, 1);
});

test('intermediate I and II escalate BP, then a terminal III contributes DW and stops', () => {
  const { ctx, state } = harness(3);
  state.BP.deck = [card('I')];
  state.BP.supply.II = [card('II', 20)];
  state.BP.supply.III = [card('III', 30), card('III', 31)];
  assert.equal(ctx.resolveBossDeathblow(), true);
  assert.deepEqual(clone(state.BP.damage), [card('I'), card('II', 20), { special: 'DW' }]);
  assert.equal(ctx.currentBpDamageSummary().total, 4);
  assert.equal(state.BP.supply.II.length, 0);
  assert.equal(state.BP.supply.III.length, 1, 'the final BP III must not escalate');
  assert.deepEqual(clone(state.BP.deck), [card('III', 31)]);
  assert.equal(state.BP.removed.length, 0);
  assert.deepEqual(clone(state.BP.deathblowResult), { cards: 3, wounds: 4, complete: true });
});

test('nonterminal III removes the lowest BP and adds one III, retaining drawn III at the bottom', () => {
  const { ctx, state } = harness(3);
  state.BP.deck = [card('III', 1), card('I', 2)];
  state.BP.supply.III = [card('III', 30)];
  ctx.resolveBossDeathblow();
  assert.deepEqual(clone(state.BP.damage), [{ special: 'DW' }, { special: 'DW' }]);
  assert.deepEqual(clone(state.BP.removed), [card('I', 2)]);
  assert.equal(state.BP.supply.III.length, 0);
  assert.deepEqual(clone(state.BP.deck), [card('III', 1), card('III', 30)]);
});

test('exhausted III supply reuses the physical card and reaches high wound totals', () => {
  const { ctx, state } = harness(99);
  state.BP.deck = [card('III')];
  ctx.resolveBossDeathblow();
  assert.equal(state.BP.damage.length, 50);
  assert.ok(state.BP.damage.every(value => value.special === 'DW'));
  assert.equal(ctx.currentBpDamageSummary().total, 100);
  assert.deepEqual(clone(state.BP.deck), [card('III')]);
  assert.equal(ctx.undoStacks.HEKATON.length, 1);
});

test('existing wounds count toward the target and a discard-only deck is reshuffled', () => {
  const { ctx, state } = harness(4);
  state.BP.damage = [{ special: 'DW' }, { special: 'SW' }];
  state.BP.discard = [card('I')];
  ctx.resolveBossDeathblow();
  assert.equal(ctx.currentBpDamageSummary().total, 4);
  assert.equal(state.BP.discard.length, 0);
  assert.deepEqual(clone(state.BP.deathblowResult), { cards: 1, wounds: 1, complete: true });
});

test('an exhausted BP deck stops without inventing wounds and reports the shortfall', () => {
  const { ctx, state } = harness(3);
  state.BP.deck = [card('I')];
  ctx.resolveBossDeathblow();
  assert.equal(ctx.currentBpDamageSummary().total, 1);
  assert.equal(state.BP.deathblowResult.complete, false);
  assert.match(ctx.deathblowBpStatus.textContent, /BP 牌堆已空/);
  assert.equal(ctx.deathblowBpButton.disabled, true);
  assert.equal(ctx.resolveBossDeathblow(), false);
  assert.equal(ctx.undoStacks.HEKATON.length, 1);
});

test('pending cards, unknown health, active scry and special restrictions prevent mutation', () => {
  for (const setup of [
    h => { h.state.BP.pending = h.state.BP.deck[0]; },
    h => { delete h.ctx.window.AIBP_BOSS_LEVEL_DATA.bosses.HEKATON.levels['1']; },
    h => { h.ctx.activeScry = {}; },
    h => { h.ctx.window.C45Specials = { deathblowUnavailableReason: () => 'restricted' }; },
  ]) {
    const h = harness();
    h.state.BP.deck = [card('I')];
    setup(h);
    const before = JSON.stringify(h.state);
    assert.equal(h.ctx.resolveBossDeathblow(), false);
    assert.equal(JSON.stringify(h.state), before);
    assert.equal(h.saves.length, 0);
    assert.equal(Object.keys(h.ctx.undoStacks).length, 0);
  }
});

test('Chimera counts both piles and adds to the chosen damage pile', () => {
  const { ctx, state } = harness();
  ctx.currentApostle = 'CHIMERA_METASTASIOS';
  ctx.piles.CHIMERA_METASTASIOS = state;
  ctx.window.AIBP_BOSS_LEVEL_DATA.bosses.CHIMERA_METASTASIOS.levels['1'].stats.wounds = 3;
  ctx.bpDamageTargetSelect.value = 'damage2';
  state.BP.damage1 = [{ special: 'SW' }];
  state.BP.damage2 = [{ special: 'SW' }];
  state.BP.deck = [card('I')];
  ctx.resolveBossDeathblow();
  assert.equal(state.BP.damage1.length, 1);
  assert.equal(state.BP.damage2.length, 2);
  assert.equal(ctx.bpDamageSummary.textContent, '损伤：3 / 3（1+2）');
  assert.equal(ctx.currentBpView, '第二损伤堆');
});

test('one BP undo restores the complete supplementation including its supplies and status', () => {
  const { ctx, state } = harness(3);
  state.BP.deck = [card('I')];
  state.BP.supply.II = [card('II', 20)];
  state.BP.supply.III = [card('III', 30)];
  const before = clone(state);
  ctx.resolveBossDeathblow();
  ctx.undoLastAibp('BP');
  assert.deepEqual(clone(ctx.piles.HEKATON), before);
  assert.equal(ctx.deathblowBpStatus.hidden, true);
  assert.equal(ctx.undoStacks.HEKATON.length, 0);
});

test('the second screen shows the same health and supports older snapshots without it', () => {
  const ss = fs.readFileSync(path.join(__dirname, '../ss/app.js'), 'utf8').replace(/\r\n/g, '\n');
  const match = ss.match(/^function aibpDamageSummaryText\([^]*?^}/m);
  assert.ok(match);
  const ctx = vm.createContext({});
  vm.runInContext(match[0], ctx);
  assert.equal(ctx.aibpDamageSummaryText({ total: 5, wounds: 12 }), '5 / 12');
  assert.equal(ctx.aibpDamageSummaryText({ total: 5, wounds: 12, damage1: 2, damage2: 3 }), '5 / 12（2 + 3）');
  assert.equal(ctx.aibpDamageSummaryText({ total: 5 }), '5');
  assert.match(source, /damageSummary: \{ \.\.\.damageSummary, wounds: currentBossWounds\(\) \}/);
});
