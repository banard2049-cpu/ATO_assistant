const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
function fn(name) {
  const match = source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const card = (type, level, index) => ({ type, level, index });
function pile(type, deck = [], discard = [], supply = {}) {
  return { deck, discard, removed: [], damage: [], supply: { II: [card(type, 'II', 20)], III: [card(type, 'III', 30), card(type, 'III', 31)], ...supply } };
}
class Element {
  constructor() {
    this.children = [];
    this.classes = new Set();
    this.style = { setProperty() {} };
    this.dataset = {};
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  get childElementCount() { return this.children.length; }
}
function harness(BP = pile('BP'), AI = pile('AI')) {
  const state = { BP, AI, tokens: [], aiExhaustedBonusIndex: 0 };
  const layer = new Element();
  const zoom = new Element();
  let tokenId = 0;
  const ctx = vm.createContext({
    currentApostle: 'HEKATON', piles: { HEKATON: state },
    aiExhaustedBonusTokens: ['DA+.png', 'HT+.png', 'ED+.png', 'AT+.png'],
    nonStackingTokenFiles: new Set(),
    ensurePiles() {}, renderPanelTokens() {}, rememberUndo() {}, savePiles() {}, renderAibpCards() {},
    pushBpDamage: (value) => state.BP.damage.push(value),
    clampTokenCount: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    createTokenStackId: () => `token-${++tokenId}`,
    currentApostleLevel: () => 1,
    document: { createElement: () => new Element() },
    panelWrap: { querySelector: () => layer }, imageZoomCardTokens: zoom,
    c45PanelCounterKind: () => '', criticalMassThreshold: () => 99,
    makePanelTokenDraggable() {}, renderCriticalMassSlot() {}, tokenSrc: (file) => file,
  });
  for (const name of [
    'shuffleCards', 'insertRandom', 'drawFromSupply', 'insertPromotedCard', 'hasSupply',
    'reshuffleDiscardIfDeckEmpty', 'removeFirstMatching', 'putIntoRemovedPile',
    'removeFirstMatchingToRemoved', 'lowestLevelCard', 'removeLowestCard', 'removeLowestCardToRemoved',
    'higherLevel', 'isPlainObject', 'isCriticalMassStack', 'isPerHitTokenStack',
    'tokenMergeKey', 'tokenMergeKeyForItem', 'findMergeableToken', 'normalizeTokenStacks',
    'addPanelToken', 'addAiExhaustedBonusTokens', 'promoteAiFromLevel', 'promoteAiForBpIII',
    'resolveBpDefeat', 'resolveBpCritical', 'performLinkedPromotion', 'promoteBpByRemovingLowest',
    'automaticTokenContribution', 'syncAutomaticLevelBonusToken',
    'currentPanelCardTokens', 'setImageZoomCardTokens',
  ]) vm.runInContext(fn(name), ctx);
  return { ctx, state, layer, zoom };
}

test('BP III critical wounds escalate AI as well as BP (P53)', () => {
  const { ctx, state } = harness(pile('BP', [card('BP', 'I', 1)]), pile('AI', [card('AI', 'I', 1)]));
  ctx.resolveBpCritical(card('BP', 'III', 99));
  assert.equal(state.BP.damage[0].damageValue, 2);
  assert.equal(state.BP.deck.length, 2);
  assert.deepEqual(clone(state.AI.removed), [card('AI', 'I', 1)]);
  assert.equal(state.AI.deck[0].level, 'III');
  assert.equal(state.AI.supply.III.length, 1);
});

test('matching AI tier is preferred over a higher tier, deck before discard (P52)', () => {
  const { ctx, state } = harness(pile('BP'), pile('AI', [card('AI', 'II', 2), card('AI', 'I', 1)], [card('AI', 'I', 3)]));
  ctx.promoteAiFromLevel('I', 'II');
  assert.equal(state.AI.removed[0].index, 1);
  assert.equal(state.AI.discard.length, 1);
  assert.equal(state.AI.supply.II.length, 0);
});

test('missing AI I falls forward to AI II, including a matching discard card (P52)', () => {
  const { ctx, state } = harness(pile('BP'), pile('AI', [card('AI', 'III', 3)], [card('AI', 'II', 2), card('AI', 'III', 4)]));
  ctx.promoteAiFromLevel('I', 'II');
  assert.deepEqual(clone(state.AI.removed), [card('AI', 'II', 2)]);
  assert.equal(state.AI.discard.length, 0);
  assert.equal(state.AI.deck.length, 3);
  assert.ok(state.AI.deck.every((value) => value.level === 'III'));
  assert.equal(state.AI.supply.III.length, 1);
  assert.equal(state.AI.supply.II.length, 1);
});

test('missing AI I and II falls forward to AI III (P52)', () => {
  const { ctx, state } = harness(pile('BP'), pile('AI', [card('AI', 'III', 3)]));
  ctx.promoteAiFromLevel('I', 'II');
  assert.equal(state.AI.removed[0].index, 3);
  assert.equal(state.AI.deck.length, 1);
  assert.equal(state.AI.supply.III.length, 1);
});

test('BP III with no AI to remove grants bonuses instead of adding an AI', () => {
  const { ctx, state } = harness(pile('BP'), pile('AI'));
  ctx.promoteAiForBpIII();
  assert.equal(state.AI.deck.length, 0);
  assert.equal(state.AI.supply.III.length, 2);
  assert.equal(state.tokens.length, 2);
});

test('no current or higher AI gives bonuses without inventing a new AI (P52)', () => {
  const { ctx, state } = harness(pile('BP'), pile('AI', [card('AI', 'I', 1)]));
  ctx.promoteAiFromLevel('II', 'III');
  assert.deepEqual(clone(state.AI.deck), [card('AI', 'I', 1)]);
  assert.equal(state.AI.removed.length, 0);
  assert.equal(state.AI.supply.III.length, 2);
  assert.equal(state.tokens[0].file, 'DA+.png');
  assert.equal(state.tokens[0].perHit, true);
});

test('Escalate promotes each pile own lowest tier in either direction (P63)', () => {
  for (const [bpLevel, aiLevel, expectedBp, expectedAi] of [['II', 'I', 'III', 'II'], ['I', 'II', 'II', 'III']]) {
    const { ctx, state } = harness(pile('BP', [card('BP', bpLevel, 1)]), pile('AI', [card('AI', aiLevel, 1)]));
    ctx.promoteBpByRemovingLowest();
    assert.equal(state.BP.deck[0].level, expectedBp);
    assert.equal(state.AI.deck[0].level, expectedAi);
    assert.equal(state.BP.removed.length, 1);
    assert.equal(state.AI.removed.length, 1);
    assert.equal(state.BP.damage.length, 0);
  }
});

test('Escalate removes one BP only and grants no wound bonuses when exhausted', () => {
  const { ctx, state } = harness(
    pile('BP', [card('BP', 'III', 1), card('BP', 'III', 2)]),
    pile('AI', [card('AI', 'III', 1), card('AI', 'III', 2)], [], { III: [] })
  );
  ctx.performLinkedPromotion();
  assert.equal(state.BP.removed.length, 1);
  assert.equal(state.BP.deck.length, 2);
  assert.equal(state.AI.removed.length, 1);
  assert.equal(state.tokens.length, 0);
});

test('exhausted III supplies still remove lowest AI and grant one bonus per wound (P53)', () => {
  for (const critical of [false, true]) {
    const { ctx, state } = harness(
      pile('BP', [card('BP', 'III', 1)], [], { III: [] }),
      pile('AI', [card('AI', 'III', 3)], [card('AI', 'I', 1), card('AI', 'II', 2)], { III: [] })
    );
    ctx[critical ? 'resolveBpCritical' : 'resolveBpDefeat'](card('BP', 'III', 99));
    assert.deepEqual(clone(state.AI.removed), [card('AI', 'I', 1)]);
    assert.equal(state.AI.discard.length, 0);
    assert.equal(state.AI.deck.length, 2);
    assert.deepEqual(state.tokens.map((value) => value.file), ['DA+.png', 'HT+.png']);
    assert.equal(state.tokens[0].perHit, true);
  }
});

test('AI II escalation removes its old card before granting an exhausted bonus', () => {
  const { ctx, state } = harness(pile('BP'), pile('AI', [card('AI', 'II', 1)], [], { III: [] }));
  ctx.promoteAiFromLevel('II', 'III');
  assert.equal(state.AI.removed.length, 1);
  assert.equal(state.AI.deck.length, 0);
  assert.equal(state.tokens.length, 1);
});

test('per-hit exhausted danger stays separate from normal danger after normalization', () => {
  const { ctx, state } = harness();
  ctx.addPanelToken('DA+.png', 2);
  ctx.addAiExhaustedBonusTokens(5);
  state.tokens = ctx.normalizeTokenStacks(clone(state.tokens));
  const danger = state.tokens.filter((value) => value.file === 'DA+.png');
  assert.equal(danger.length, 2);
  assert.equal(danger.find((value) => !value.perHit).count, 2);
  assert.equal(danger.find((value) => value.perHit).count, 2);
});

test('level changes preserve exhausted per-hit bonuses even when they share a stack', () => {
  const { ctx, state } = harness();
  ctx.addAiExhaustedBonusTokens(1);
  ctx.currentApostleLevel = () => 5;
  ctx.syncAutomaticLevelBonusToken('dangerPerHit', 'DA+.png', 2, { perHit: true });
  ctx.syncAutomaticLevelBonusToken('dangerPerHit', 'DA+.png', 2, { perHit: true });
  assert.equal(state.tokens.length, 1);
  assert.equal(state.tokens[0].count, 3);
  ctx.currentApostleLevel = () => 4;
  ctx.syncAutomaticLevelBonusToken('dangerPerHit', 'DA+.png', 0, { perHit: true });
  ctx.syncAutomaticLevelBonusToken('dangerPerAttack', 'DA+.png', 1);
  assert.equal(state.tokens.find((value) => value.perHit).count, 1);
  assert.equal(state.tokens.find((value) => !value.perHit).count, 1);
});

test('exhausted per-hit danger is labelled on both panel and AI zoom at level 1', () => {
  const { ctx, state, layer, zoom } = harness();
  ctx.addAiExhaustedBonusTokens(1);
  vm.runInContext(fn('renderPanelTokens'), ctx);
  ctx.renderPanelTokens();
  assert.ok(layer.children[0].classes.has('auto-level-danger-per-hit'));
  assert.match(layer.children[0].title, /每命中/);
  ctx.setImageZoomCardTokens(ctx.currentPanelCardTokens('AI'));
  const token = zoom.children[0].children[0];
  assert.ok(token.classes.has('auto-level-danger-per-hit'));
  assert.match(token.title, /每命中/);
  assert.equal(state.tokens[0].perHit, true);
});
