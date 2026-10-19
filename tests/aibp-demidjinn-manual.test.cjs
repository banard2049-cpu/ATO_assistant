const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../aibp/c45_specials.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const card = (level, specialAi) => ({ type: 'AI', level, specialAi });
function harness() {
  const state = { AI: { deck: [card('III'), card('I'), card('II'), card('O', 'demidjinn-o')],
    discard: [], removed: [], pending: null }, special: { demidjinn: { lastWishAiIvAdded: false } } };
  const saved = [], undo = [];
  const c = vm.createContext({ currentApostle: 'DEMIDJINN', piles: { DEMIDJINN: state }, activeScry: null,
    demidjinnDiscardLowestAiButton: {}, demidjinnLastWishButton: {},
    ensureC45State() {}, currentApostleLevel: () => 4,
    specialAiCard: (fileName, level, specialAi) => ({ fileName, level, specialAi, type: 'AI' }),
    shuffleCards: cards => [...cards].reverse(),
    rememberUndo: (boss, scope) => { assert.equal(boss, 'DEMIDJINN'); assert.equal(scope, 'AI'); undo.push(clone(state)); },
    saveAndRender: () => { saved.push(clone(state)); c.updateDemidjinnManualAiUi(); },
  });
  for (const name of ['allPileCards', 'findSpecialAi', 'removeSpecialAi', 'normalizeDemidjinnAi',
    'reshuffleDemidjinnAfterAiO', 'demidjinnLowestAiIndex', 'manuallyDiscardDemidjinnAi',
    'manuallyPlaceDemidjinnAiIv', 'updateDemidjinnManualAiUi', 'ensureDemidjinnLastWish']) {
    const match = source.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], c);
  }
  return { c, state, saved, undo };
}

test('discard lowest AI moves only the lowest deck card to discard, preserving AI 0', () => {
  const { c, state, saved, undo } = harness();
  c.manuallyDiscardDemidjinnAi();
  assert.deepEqual(state.AI.discard.map(c => c.level), ['I']);
  assert.equal(state.AI.removed.length, 0);
  assert.equal(state.AI.deck.at(-1).specialAi, 'demidjinn-o');
  assert.equal(undo.length, 1);
  assert.equal(saved.length, 1);
  assert.equal(undo[0].AI.deck.length, 4);
});

test('AI IV switches from shuffle to top without duplicates or another discard', () => {
  const { c, state, saved, undo } = harness();
  c.updateDemidjinnManualAiUi();
  assert.equal(c.demidjinnLastWishButton.textContent, '洗入AI IV');
  c.manuallyPlaceDemidjinnAiIv();
  assert.equal(c.demidjinnLastWishButton.textContent, '置顶AI IV');
  c.manuallyPlaceDemidjinnAiIv();
  c.manuallyPlaceDemidjinnAiIv();
  assert.equal(state.AI.deck[0].specialAi, 'demidjinn-iv');
  assert.equal(state.AI.deck.at(-1).specialAi, 'demidjinn-o');
  assert.equal(c.allPileCards(state.AI).filter(c => c.specialAi === 'demidjinn-iv').length, 1);
  assert.equal(state.AI.discard.length, 0);
  assert.equal(state.AI.removed.length, 0);
  assert.equal(saved.length, 3);
  assert.equal(undo[0].special.demidjinn.lastWishAiIvAdded, false);
  Object.assign(state, clone(saved[0]));
  c.ensureDemidjinnLastWish(state);
  assert.equal(state.AI.deck.filter(c => c.specialAi === 'demidjinn-iv').length, 1, 'survives reload normalization');
  Object.assign(state, clone(undo[0]));
  c.updateDemidjinnManualAiUi();
  assert.equal(c.demidjinnLastWishButton.textContent, '洗入AI IV');
});

for (const location of ['discard', 'removed', 'pending']) {
  test(`AI IV is moved from ${location}, never copied`, () => {
    const { c, state } = harness();
    const iv = card('IV', 'demidjinn-iv');
    if (location === 'pending') state.AI.pending = iv;
    else state.AI[location].push(iv);
    state.special.demidjinn.lastWishAiIvAdded = true;
    c.manuallyPlaceDemidjinnAiIv();
    assert.equal(c.allPileCards(state.AI).filter(c => c.specialAi === 'demidjinn-iv').length, 1);
    assert.ok(state.AI.deck.includes(iv));
    assert.equal(c.demidjinnLastWishButton.textContent, '置顶AI IV');
  });
}

test('empty deck or AI 0 alone cannot be discarded; other bosses and scry are protected', () => {
  const { c, state, saved } = harness();
  state.AI.deck = [card('O', 'demidjinn-o')];
  c.updateDemidjinnManualAiUi();
  assert.equal(c.demidjinnDiscardLowestAiButton.disabled, true);
  c.manuallyDiscardDemidjinnAi();
  c.activeScry = { type: 'AI' };
  c.manuallyPlaceDemidjinnAiIv();
  c.activeScry = null;
  c.currentApostle = 'HEKATON';
  c.updateDemidjinnManualAiUi();
  assert.equal(c.demidjinnLastWishButton.hidden, true);
  c.manuallyPlaceDemidjinnAiIv();
  c.manuallyDiscardDemidjinnAi();
  assert.equal(saved.length, 0);
});
