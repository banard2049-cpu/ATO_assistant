const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/c45_specials.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function element() {
  return {
    children: [], classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, setAttribute() {}, querySelectorAll: () => [],
    replaceChildren(...children) { this.children = children; },
    parentNode: { insertBefore() {} },
  };
}

function start(boss, state, { levelChange = false, undoHistory = {} } = {}) {
  const calls = { ensures: 0, cards: 0, extras: 0, tokens: 0, saves: [], ruleHooks: [], restrictions: [] };
  const context = vm.createContext({
    window: { setTimeout() {} }, currentApostle: boss,
    piles: { [boss]: state }, undoStacks: undoHistory,
    localStorage: { getItem: () => null }, fetch: async () => ({ ok: false }),
    document: { body: { dataset: {} }, createElement: element, getElementById: element, querySelector: element },
    ensurePiles: () => calls.ensures++,
    renderAibpCards() {
      calls.cards++;
      calls.ruleHooks.push(context.window.C45Specials?.bossWounds());
      calls.restrictions.push(context.window.C45Specials?.deathblowUnavailableReason());
    },
    renderExtraCards: () => calls.extras++, renderPanelTokens: () => calls.tokens++,
    renderEmptyDrawActions() {},
    savePiles: () => calls.saves.push(clone({ ...context.piles, undoStacks: undoHistory })),
    applyCurrentApostleLevelBonuses() {
      if (!levelChange) return false;
      state.tokens.push({ file: 'AT+.png', count: 1, autoLevelBonus: 'at' });
      context.savePiles();
      return true;
    },
    shuffleCards: cards => [...cards],
    bpDamageValue: card => card.special === 'DW' ? 2 : 1,
  });
  for (const name of source.match(/const base = \{([^]*?)\n  \};/)[1].split(',')) {
    const key = name.trim();
    if (!(key in context)) context[key] = () => {};
  }
  for (const name of ['drawAiButton', 'drawBpButton', 'confirmAiButton', 'drawFeintButton',
    'newCampaignButton', 'defeatAiAsBpButton', 'criticalAiAsBpButton', 'promoteBpSingleButton',
    'promoteBpButton', 'promoteAiSingleButton', 'discardBpButton', 'defeatBpButton',
    'criticalBpButton', 'aibpLayout', 'bpColumn', 'aiDrawPreview', 'bpDrawPreview', 'extraGrid']) {
    context[name] = element();
  }
  vm.runInContext(source, context);
  return { context, calls, state };
}

function babelian(special = { version: 8, babelian: { fusionBonus: 0 } }) {
  return { AI: { pending: null }, BP: { pending: null }, tokens: [], special };
}

test('ordinary Boss startup installs special-rule hooks without serializing saves or rebuilding cards', () => {
  const untouched = { toJSON() { throw new Error('The existing large save must not be serialized'); } };
  const h = start('HEKATON', untouched, { undoHistory: untouched });
  assert.equal(h.calls.ensures, 0);
  assert.equal(h.calls.cards, 0);
  assert.equal(h.calls.extras, 0);
  assert.equal(h.calls.tokens, 0);
  assert.equal(h.calls.saves.length, 0);
  assert.equal(h.context.window.C45SpecialsReady, true);
  assert.equal(h.context.window.C45Specials.bossWounds(), null);
  assert.equal(h.context.window.C45Specials.deathblowUnavailableReason(), '');
});

test('unchanged C4/C5 saves keep their existing data and are rendered once without a redundant write', () => {
  const state = babelian();
  const before = clone(state);
  const h = start('THE_BABELIAN_LUNACY', state);
  assert.deepEqual(clone(state), before);
  assert.equal(h.calls.saves.length, 0);
  assert.equal(h.calls.cards, 1);
  assert.equal(h.calls.extras, 1);
  assert.equal(h.calls.tokens, 1);
  assert.deepEqual(h.calls.ruleHooks, [null], 'Special health hooks exist before the first render');
});

test('old special-rule state is migrated and persisted once, preserving undo entries', () => {
  const state = babelian({ version: 1, commonStatuses: [1], roster: [2],
    babelian: { fusionRoll: 9, fusionBonus: 999 } });
  const undoHistory = { THE_BABELIAN_LUNACY: [{ scope: 'BP', state: { marker: 'keep' } }] };
  const h = start('THE_BABELIAN_LUNACY', state, { undoHistory });
  assert.deepEqual(clone(state.special), { version: 8, babelian: { fusionBonus: 99 } });
  assert.equal(h.calls.saves.length, 1);
  assert.deepEqual(h.calls.saves[0].undoStacks, undoHistory);
  assert.deepEqual(h.calls.saves[0].THE_BABELIAN_LUNACY, clone(state));
});

test('level bonus persistence also includes special-state migration without a second save', () => {
  const h = start('THE_BABELIAN_LUNACY', babelian({ version: 1 }), { levelChange: true });
  assert.equal(h.calls.saves.length, 1);
  assert.equal(h.calls.saves[0].THE_BABELIAN_LUNACY.special.version, 8);
  assert.equal(h.calls.saves[0].THE_BABELIAN_LUNACY.tokens[0].file, 'AT+.png');
});

test('Dahaka startup still migrates a legacy pending card and wounds into its shared AI/BP pile', () => {
  const pending = { type: 'AI', level: 'I', index: 1 };
  const state = {
    AI: { deck: [pending], pending, discard: [], removed: [], supply: { I: [], II: [], III: [] } },
    BP: { damage: [{ special: 'SW' }], pending: null }, tokens: [], special: { version: 1, dahaka: {} },
  };
  const h = start('DAHAKA', state);
  assert.equal(state.AI, state.BP);
  assert.equal(state.AI, state.aibp);
  assert.equal(state.aibp.pendingMode, 'AI');
  assert.equal(state.aibp.pending.fileName, 'DAHAKA_AI_I_001.jpg');
  assert.equal(state.aibp.pending.level, 'II');
  assert.deepEqual(clone(state.aibp.damage), [{ special: 'SW' }]);
  assert.equal(h.calls.saves.length, 1);
  assert.equal(h.calls.cards, 1);
});

test('saved Titan X group and awakening restrictions exist on the first render', () => {
  for (const group of [false, true]) {
    const pile = () => ({ deck: [], discard: [], removed: [], damage: [], pending: null,
      supply: { I: [], II: [], III: [] } });
    const state = { AI: pile(), BP: pile(), feint: { deck: [], active: [], removed: [] }, tokens: [],
      special: { version: 8, titanX: { setupVersion: 2, awakened: !group, awakeningWon: false,
        ...(group ? { group: { target: 1, counter: 0, g6: false, queue: [], aiActor: null, won: false } } : {}) } } };
    const h = start('TITAN_X', state);
    assert.equal(h.calls.cards, 1);
    assert.equal(h.calls.ruleHooks[0], group ? 12 : null);
    assert.equal(h.calls.restrictions[0], group ? '万事皆休禁用致死一击' : '觉醒阶段请按觉醒 BP 卡结算胜利');
  }
});
