const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const special = fs.readFileSync(path.join(__dirname, '../aibp/c45_specials.js'), 'utf8').replace(/\r\n/g, '\n');
const fn = (source, name, indent) => source.match(new RegExp(`^${indent}function ${name}\\([^]*?^${indent}}`, 'm'))[0];

function harness() {
  const card = (type, level, index) => ({ type, level, index });
  const state = {
    AI: { deck: [card('AI', 'I', 1), card('AI', 'III', 2)], discard: [], removed: [] },
    BP: { deck: [], discard: [], damage: [] }, special: { demidjinn: { lastWishAiIvAdded: false } },
  };
  const reserve = [card('AI', 'III', 3)];
  let tokens = 0;
  const c = vm.createContext({
    currentApostle: 'DEMIDJINN', piles: { DEMIDJINN: state }, window: { C45Specials: {} },
    ensurePiles() {}, ensureC45State() {}, normalizeDemidjinnAi() {},
    currentBpDamageKey: () => 'damage', isCyclonus: () => false, bpDamageValue: () => 2,
    shuffleCards: cards => [...cards], reshuffleDiscardIfDeckEmpty() {}, discardDemidjinnPromotionTop() {},
    specialAiCard: (fileName, level, specialAi) => ({ fileName, level, specialAi, type: 'AI' }),
    promotionFingerprint: () => JSON.stringify(state.AI),
    hasSupply: type => type === 'AI' && reserve.length > 0,
    removeLowestCardToRemoved: () => { const card = state.AI.deck.shift(); if (card) state.AI.removed.push(card); return card; },
    insertPromotedCard: () => state.AI.deck.push(reserve.shift()),
    addAiExhaustedBonusTokens: amount => { tokens += amount; },
  });
  for (const name of ['notifyBpWound', 'pushBpDamage', 'resolveBpDefeat', 'resolveBpCritical', 'promoteAiForBpIII']) {
    vm.runInContext(fn(main, name, '    '), c);
  }
  c.base = { promoteAiForBpIII: c.promoteAiForBpIII };
  vm.runInContext(fn(special, 'activateDemidjinnLastWish', '  '), c);
  vm.runInContext(special.match(/^  promoteAiForBpIII = function\s*\([^]*?^  };/m)[0], c);
  const hook = special.match(/^    recordBpCardDamage\(card\) \{[^]*?^    },/m)[0]
    .replace('recordBpCardDamage(card)', 'function recordBpCardDamage(card)').replace(/,$/, '');
  vm.runInContext(hook, c);
  c.window.C45Specials.recordBpCardDamage = c.recordBpCardDamage;
  return { c, state, reserve, tokens: () => tokens, bp: card('BP', 'III', 1) };
}

for (const method of ['resolveBpDefeat', 'resolveBpCritical']) {
  test(`first Demidjinn BP III ${method} replaces promotion with Last Wish exactly once`, () => {
    const h = harness();
    h.c[method](h.bp);
    assert.equal(h.state.special.demidjinn.lastWishAiIvAdded, true);
    assert.deepEqual(h.state.AI.removed.map(card => card.level), ['III']);
    assert.equal(h.reserve.length, 1);
    assert.equal(h.tokens(), 0);
    assert.equal(h.state.AI.deck.filter(card => card.specialAi === 'demidjinn-iv').length, 1);
    h.c[method]({ ...h.bp, index: 2 });
    assert.equal(h.reserve.length, 0, 'subsequent wounds still perform normal promotion');
    assert.deepEqual(h.state.AI.removed.map(card => card.level), ['III', 'I']);
  });
}

test('first Last Wish critical cannot award exhausted-supply tokens', () => {
  const h = harness();
  h.reserve.length = 0;
  h.c.resolveBpCritical(h.bp);
  assert.equal(h.tokens(), 0);
  assert.deepEqual(h.state.AI.removed.map(card => card.level), ['III']);
});
