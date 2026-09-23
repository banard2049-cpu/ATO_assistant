const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const functions = [
  'isPlainObject', 'clonePileState', 'loadSavedPiles', 'savePiles',
  'rememberUndo', 'trimUndoStack', 'undoSharedState', 'captureUndoEffects',
  'undoEntryIndex', 'reverseUndoEffects', 'canUndo', 'undoLastAibp', 'updateUndoButtons',
  'drawAi', 'drawBp', 'discardAiPending', 'removePendingFromDeck', 'resolveBp', 'sameCard',
  'startNewCampaign', 'startScry', 'cancelScry',
];
const clone = (value) => JSON.parse(JSON.stringify(value));
function initialState() {
  const pile = (type) => ({
    deck: [1, 2, 3].map((index) => ({ type, level: 'I', index })),
    discard: [], pending: null, removed: [], damage: [], supply: { II: [], III: [] },
  });
  return { AI: pile('AI'), BP: pile('BP'), tokens: [], special: { counter: 0 },
    flare: { deck: [], discard: [] }, feint: { deck: [], active: [] },
    aiExhaustedBonusIndex: 0, lastPendingType: '', battleMap: { position: 1 } };
}
function harness(storage = new Map()) {
  const ctx = vm.createContext({
    structuredClone, piles: { TEST: initialState(), OTHER: initialState() },
    apostles: ['TEST', 'OTHER', 'DAHAKA'], undoStacks: {}, maxUndoSteps: 30,
    pendingUndoEntry: null, currentApostle: 'TEST', currentAiView: '弃牌', currentBpView: '弃牌',
    activeScry: null, storageKey: 'piles', undoAiButton: {}, undoBpButton: {},
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    ensurePiles() {}, scheduleSecondScreenSnapshot() {},
    updateAiViewTabs() {}, updateBpViewTabs() {}, updateNietzscheStateUi() {},
    renderExtraCards() {}, renderPanelTokens() {}, panelWrap: { querySelector() {} },
    battleMapControl: { render() {}, reset() {} }, window: { confirm: () => true },
    initialState, applyBurdenInitialLinkedPromotion() {}, applyCurrentApostleLevelBonuses() {}, setSecondScreenMode() {},
    shuffleCards: (cards) => cards.slice().reverse(), cardSrc: () => '',
    currentPanelCardTokens: () => [], currentBpNoticeImages: () => [], chimeraName: 'CHIMERA',
    scryDialog: { dataset: { scryType: 'AI' } }, scryCountInput: { value: '2' },
    scrySetup: {}, scryCards: {}, scryStartButton: {}, scryTopButton: {}, scryBottomButton: {}, scryShuffleButton: {}, scryRemoveButton: {}, renderScryCards() {},
  });
  ctx.renderAibpCards = () => ctx.updateUndoButtons();
  ctx.openImageZoom = (_src, _label, onClose) => { if (onClose) onClose(); };
  for (const name of functions) {
    const match = source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
  ctx.loadSavedPiles();
  return { ctx, storage };
}
function draw(ctx, type) {
  if (type === 'AI') ctx.drawAi();
  else { ctx.drawBp(); ctx.resolveBp('discard'); }
}

test('AI and BP can each repeatedly undo through interleaved draws without changing the other pile', () => {
  const { ctx } = harness();
  const initial = clone(ctx.piles.TEST);
  for (let i = 0; i < 3; i++) { draw(ctx, 'AI'); draw(ctx, 'BP'); }
  const bp = clone(ctx.piles.TEST.BP);
  assert.equal(ctx.canUndo('TEST', 'AI'), true);
  assert.equal(ctx.canUndo('TEST', 'BP'), true);
  for (let i = 0; i < 3; i++) {
    ctx.undoLastAibp('AI');
    assert.deepEqual(clone(ctx.piles.TEST.BP), bp);
  }
  assert.deepEqual(clone(ctx.piles.TEST.AI), initial.AI);
  assert.equal(ctx.undoAiButton.disabled, true);
  for (let i = 0; i < 6; i++) {
    ctx.undoLastAibp('BP');
    assert.deepEqual(clone(ctx.piles.TEST.AI), initial.AI);
  }
  assert.deepEqual(clone(ctx.piles.TEST.BP), initial.BP);
  assert.equal(ctx.undoBpButton.disabled, true);
});

test('each pile retains 30 steps independently, including after reload', () => {
  let { ctx, storage } = harness();
  const states = { AI: [], BP: [] };
  for (let i = 0; i < 40; i++) {
    for (const type of ['AI', 'BP']) {
      states[type].push(clone(ctx.piles.TEST[type]));
      ctx.rememberUndo('TEST', type);
      ctx.piles.TEST[type].deck.push({ type, level: 'II', index: i });
      ctx.savePiles();
    }
  }
  ctx = harness(storage).ctx;
  ctx.updateUndoButtons();
  assert.equal(ctx.undoAiButton.textContent, '撤销 AI（30）');
  assert.equal(ctx.undoBpButton.textContent, '撤销 BP（30）');
  assert.equal(ctx.piles.undoStacks, undefined);
  for (const type of ['BP', 'AI']) {
    for (let i = 39; i >= 10; i--) {
      ctx.undoLastAibp(type);
      assert.deepEqual(clone(ctx.piles.TEST[type]), states[type][i]);
    }
    assert.equal(ctx.canUndo('TEST', type), false);
  }
});

test('shared promotion records can be consumed independently and do not return after reload', () => {
  let { ctx, storage } = harness();
  const initial = clone(ctx.piles.TEST);
  ctx.rememberUndo('TEST', 'BP');
  ctx.piles.TEST.AI.deck.reverse();
  ctx.piles.TEST.BP.damage.push(ctx.piles.TEST.BP.deck.shift());
  ctx.savePiles();
  assert.equal(ctx.canUndo('TEST', 'AI'), true);
  const bp = clone(ctx.piles.TEST.BP);
  ctx.undoLastAibp('AI');
  assert.deepEqual(clone(ctx.piles.TEST.AI), initial.AI);
  assert.deepEqual(clone(ctx.piles.TEST.BP), bp);
  ctx = harness(storage).ctx;
  assert.equal(ctx.canUndo('TEST', 'AI'), false);
  ctx.undoLastAibp('BP');
  assert.deepEqual(clone(ctx.piles.TEST.BP), initial.BP);
  assert.deepEqual(clone(ctx.piles.TEST.AI), initial.AI);
});

test('shared counters preserve later effects and do not resurrect undone changes', () => {
  const { ctx } = harness();
  ctx.rememberUndo('TEST', 'AI');
  ctx.piles.TEST.special.counter = 1;
  ctx.savePiles();
  ctx.rememberUndo('TEST', 'BP');
  ctx.piles.TEST.special.counter = 2;
  ctx.savePiles();
  ctx.piles.TEST.battleMap.position = 9;
  ctx.undoLastAibp('AI');
  assert.equal(ctx.piles.TEST.special.counter, 2);
  ctx.undoLastAibp('BP');
  assert.equal(ctx.piles.TEST.special.counter, 0);
  assert.equal(ctx.piles.TEST.battleMap.position, 9);
});

test('scry cancellation after reload restores the full deck and keeps previous undo history', () => {
  let { ctx, storage } = harness();
  draw(ctx, 'BP');
  const previous = clone(ctx.piles.TEST);
  ctx.startScry();
  ctx = harness(storage).ctx;
  assert.equal(ctx.canUndo('TEST', 'AI'), false);
  ctx.cancelScry();
  assert.deepEqual(clone(ctx.piles.TEST), previous);
  assert.equal(ctx.canUndo('TEST', 'AI'), false);
  assert.equal(ctx.canUndo('TEST', 'BP'), true);
});

test('new campaign clears only the selected apostle history', () => {
  let { ctx, storage } = harness();
  draw(ctx, 'AI');
  ctx.currentApostle = 'OTHER';
  draw(ctx, 'BP');
  ctx.currentApostle = 'TEST';
  ctx.startNewCampaign();
  ctx = harness(storage).ctx;
  assert.equal(ctx.canUndo('TEST', 'AI'), false);
  assert.equal(ctx.canUndo('OTHER', 'BP'), true);
});

test('legacy saves without history still load', () => {
  const state = initialState();
  state.AI.deck.shift();
  const { ctx } = harness(new Map([['piles', JSON.stringify({ TEST: state })]]));
  assert.deepEqual(clone(ctx.piles.TEST), state);
  assert.equal(ctx.canUndo('TEST', 'AI'), false);
});

test('new draws after independent undo form a new history without resurrecting the other pile', () => {
  const { ctx } = harness();
  draw(ctx, 'AI');
  draw(ctx, 'BP');
  ctx.undoLastAibp('AI');
  const ai = clone(ctx.piles.TEST.AI);
  draw(ctx, 'AI');
  ctx.undoLastAibp('BP');
  const bp = clone(ctx.piles.TEST.BP);
  ctx.undoLastAibp('AI');
  assert.deepEqual(clone(ctx.piles.TEST.AI), ai);
  assert.deepEqual(clone(ctx.piles.TEST.BP), bp);
});

test('trimming AI history keeps the BP half of an older shared record', () => {
  const { ctx } = harness();
  const original = clone(ctx.piles.TEST.BP);
  ctx.rememberUndo('TEST', 'AIBP');
  ctx.piles.TEST.BP.deck.reverse();
  ctx.savePiles();
  for (let i = 0; i < 35; i++) draw(ctx, 'AI');
  const ai = clone(ctx.piles.TEST.AI);
  ctx.undoLastAibp('BP');
  assert.deepEqual(clone(ctx.piles.TEST.BP), original);
  assert.deepEqual(clone(ctx.piles.TEST.AI), ai);
  assert.equal(ctx.undoAiButton.textContent, '撤销 AI（30）');
});

test('DAHAKA keeps its single physical AIBP deck synchronized', () => {
  const { ctx } = harness();
  ctx.currentApostle = 'DAHAKA';
  const state = ctx.piles.DAHAKA = initialState();
  state.aibp = state.AI;
  state.BP = state.aibp;
  ctx.rememberUndo('DAHAKA', 'AIBP');
  state.aibp.deck.shift();
  ctx.savePiles();
  ctx.undoLastAibp('BP');
  assert.equal(state.aibp.deck.length, 3);
  assert.equal(state.AI, state.BP);
  assert.equal(state.AI, state.aibp);
  assert.equal(ctx.canUndo('DAHAKA', 'AI'), false);
});
