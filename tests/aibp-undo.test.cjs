const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const functions = [
  'isPlainObject', 'clonePileState', 'migrateLegacyHealedPiles', 'loadSavedPiles', 'savePiles',
  'rememberUndo', 'trimUndoStack', 'undoSharedState', 'captureUndoEffects',
  'undoEntryIndex', 'reverseUndoEffects', 'canUndo', 'undoLastAibp', 'updateUndoButtons',
  'hasAiCombo', 'drawAi', 'drawBp', 'discardAiPending', 'removePendingFromDeck', 'resolveBp', 'sameCard',
  'startNewCampaign', 'startScry', 'cancelScry',
  'currentBpDamageKey', 'currentBpDamageView', 'currentBpHealIndex', 'healBp',
  'bpDamageValue', 'bpDamageTotalForKey', 'currentBpDamageSummary',
  'supportsCombinedBp', 'returnedBpPreviewCard', 'combinedBpNotice', 'updateCombinedBpTotal',
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
    theatreRequest: null, theatreBattle: null,
    structuredClone, piles: { TEST: initialState(), OTHER: initialState() },
    apostles: ['TEST', 'OTHER', 'DAHAKA'], undoStacks: {}, maxUndoSteps: 30,
    pendingUndoEntry: null, currentApostle: 'TEST', currentAiView: '弃牌', currentBpView: '弃牌',
    activeScry: null, storageKey: 'piles', undoAiButton: {}, undoBpButton: {},
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    ensurePiles() {}, scheduleSecondScreenSnapshot() {}, renderCombinedBpControl() {},
    updateAiViewTabs() {}, updateBpViewTabs() {}, updateNietzscheStateUi() {},
    renderExtraCards() {}, renderPanelTokens() {}, panelWrap: { querySelector() {} },
    battleMapControl: { render() {}, reset() {} }, window: { confirm: () => true },
    initialState, applyBurdenInitialLinkedPromotion() {}, applyCurrentApostleLevelBonuses() {}, setSecondScreenMode() {},
    isChimera: () => ctx.currentApostle === 'CHIMERA',
    shuffleCards: (cards) => cards.slice().reverse(), cardSrc: () => '',
    currentPanelCardTokens: () => [], currentBpNoticeImages: () => [], currentAiNoticeImages: () => [], chimeraName: 'CHIMERA',
    scryDialog: { dataset: { scryType: 'AI' } }, scryCountInput: { value: '2' },
    scrySetup: {}, scryCards: {}, scryStartButton: {}, scryTopButton: {}, scryBottomButton: {}, scryShuffleButton: {}, scryDiscardButton: {}, scryRemoveButton: {}, renderScryCards() {},
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

test('heal removes the whole top damage card, persists and supports BP undo', () => {
  let { ctx, storage } = harness();
  const bottom = { type: 'BP', level: 'I', index: 1 };
  const top = { type: 'BP', level: 'III', index: 2, damageValue: 2 };
  ctx.piles.TEST.BP.damage = [bottom, top];
  ctx.piles.TEST.tokens.push({ file: 'CM.jpg', count: 3 });
  const before = clone(ctx.piles.TEST);
  assert.equal(ctx.currentBpDamageSummary().total, 3);
  ctx.healBp();
  assert.deepEqual(clone(ctx.piles.TEST.BP.damage), [bottom]);
  assert.deepEqual(clone(ctx.piles.TEST.BP.removed), [top]);
  assert.equal(ctx.currentBpDamageSummary().total, 1);
  assert.deepEqual(clone(ctx.piles.TEST.tokens), before.tokens);
  assert.equal(ctx.currentBpView, '移除');
  ctx = harness(storage).ctx;
  assert.deepEqual(clone(ctx.piles.TEST.BP.removed), [top]);
  ctx.undoLastAibp('BP');
  assert.deepEqual(clone(ctx.piles.TEST), before);
});

test('heal on an empty damage stack does not add undo history', () => {
  const { ctx, storage } = harness();
  ctx.healBp();
  assert.equal(ctx.currentBpHealIndex(), -1);
  assert.equal(ctx.canUndo('TEST', 'BP'), false);
  assert.equal(storage.size, 0);
});

test('legacy heal saves and undo snapshots merge into the existing removed pile', () => {
  const before = initialState();
  const existing = { type: 'BP', level: 'I', index: 1 };
  const healed = { type: 'BP', level: 'II', index: 2 };
  before.BP.removed = [existing];
  before.BP.damage = [healed];
  before.BP.healed = [];
  const state = clone(before);
  state.BP.damage = [];
  state.BP.healed = [healed];
  const storage = new Map([['piles', JSON.stringify({ TEST: state, undoStacks: {
    TEST: [{ scope: 'BP', state: before, aiView: '弃牌', bpView: '回生移除' }],
  } })]]);
  const { ctx } = harness(storage);
  assert.deepEqual(clone(ctx.piles.TEST.BP.removed), [existing, healed]);
  assert.equal(ctx.piles.TEST.BP.healed, undefined);
  ctx.undoLastAibp('BP');
  assert.deepEqual(clone(ctx.piles.TEST.BP.removed), [existing]);
  assert.deepEqual(clone(ctx.piles.TEST.BP.damage), [healed]);
  assert.equal(ctx.piles.TEST.BP.healed, undefined);
  assert.equal(ctx.currentBpView, '移除');
});

test('Chimera heal uses the regular damage stack and preserves second damage', () => {
  const { ctx } = harness();
  ctx.currentApostle = 'CHIMERA';
  ctx.piles.CHIMERA = initialState();
  ctx.piles.CHIMERA.BP.damage1 = [{ special: 'SW' }];
  ctx.piles.CHIMERA.BP.damage2 = [{ special: 'DW' }];
  ctx.currentBpView = '第二损伤堆';
  ctx.healBp();
  assert.equal(ctx.piles.CHIMERA.BP.damage1.length, 0);
  assert.equal(ctx.piles.CHIMERA.BP.damage2.length, 1);
  assert.equal(ctx.currentBpView, '移除');
  assert.equal(ctx.currentBpDamageSummary().total, 2);
  ctx.healBp();
  assert.equal(ctx.undoStacks.CHIMERA.length, 1);
  assert.equal(ctx.piles.CHIMERA.BP.removed.length, 1);
  ctx.undoLastAibp('BP');
  assert.equal(ctx.piles.CHIMERA.BP.damage1.length, 1);
  assert.equal(ctx.piles.CHIMERA.BP.damage2.length, 1);
});

test('Titan X group heal removes the current target top wound and leaves other enemies intact', () => {
  const { ctx } = harness();
  ctx.currentApostle = 'TITAN_X';
  ctx.piles.TITAN_X = initialState();
  ctx.piles.TITAN_X.special.titanX = { group: { target: 1 } };
  const wounds = [
    { special: 'SW', titanXOwner: 1 },
    { special: 'DW', titanXOwner: 1 },
    { special: 'DW', titanXOwner: 2 },
  ];
  ctx.piles.TITAN_X.BP.damage = wounds.slice();
  ctx.healBp();
  assert.deepEqual(clone(ctx.piles.TITAN_X.BP.damage), [wounds[0], wounds[2]]);
  assert.deepEqual(clone(ctx.piles.TITAN_X.BP.removed), [wounds[1]]);
  assert.equal(ctx.currentBpDamageSummary().total, 1);
  ctx.healBp();
  assert.equal(ctx.currentBpHealIndex(), -1);
  assert.equal(ctx.piles.TITAN_X.BP.damage[0].titanXOwner, 2);
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

for (const boss of ['SUN_DESCENDANT', 'THE_BABELIAN_LUNACY', 'UR_FLEECE']) {
  test(`${boss}: returned BP stays on top, preserves its counter, and supports undo`, () => {
    const { ctx } = harness();
    ctx.currentApostle = boss;
    ctx.apostles.push(boss);
    ctx.piles[boss] = initialState();
    const original = clone(ctx.piles[boss]);
    ctx.drawBp();
    const card = clone(ctx.piles[boss].BP.pending);
    assert.equal(ctx.currentBpView, '损伤');
    ctx.resolveBp('return-top');
    assert.equal(ctx.currentBpView, '损伤');
    let bp = ctx.piles[boss].BP;
    assert.equal(bp.pending, null);
    assert.deepEqual(clone(bp.deck[0]), card);
    assert.deepEqual(clone(ctx.returnedBpPreviewCard()), card);
    assert.deepEqual(clone(ctx.piles[boss].AI), original.AI);
    assert.equal(bp.damage.length, 0);
    assert.equal(bp.discard.length, 0);
    assert.equal(bp.deck.length, original.BP.deck.length);
    ctx.updateCombinedBpTotal(7);
    ctx.drawBp();
    assert.equal(ctx.currentBpView, '损伤');
    assert.deepEqual(clone(bp.pending), card);
    assert.equal(ctx.returnedBpPreviewCard(), null);
    assert.match(ctx.combinedBpNotice(), /7/);
    ctx.resolveBp('return-top');
    assert.equal(bp.combinedAttack.total, 7);
    ctx.updateCombinedBpTotal(12);
    ctx.undoLastAibp('BP');
    bp = ctx.piles[boss].BP;
    assert.equal(bp.combinedAttack.total, 7);
    // The counter lives in the saved BP state and survives serialization.
    ctx.piles[boss] = clone(ctx.piles[boss]);
    ctx.drawBp();
    assert.match(ctx.combinedBpNotice(), /7/);
    ctx.resolveBp('discard');
    assert.equal(ctx.piles[boss].BP.combinedAttack, undefined);
    ctx.undoLastAibp('BP');
    assert.equal(ctx.piles[boss].BP.combinedAttack.total, 7);
    assert.deepEqual(clone(ctx.piles[boss].BP.pending), card);
  });
}

test('drawing BP selects the damage view, including Chimera regular damage', () => {
  const { ctx } = harness();
  ctx.currentBpView = '当前';
  ctx.drawBp();
  assert.equal(ctx.currentBpView, '损伤');

  ctx.currentApostle = 'CHIMERA';
  ctx.piles.CHIMERA = initialState();
  ctx.currentBpView = '第二损伤堆';
  ctx.drawBp();
  assert.equal(ctx.currentBpView, '常规损伤堆');
});

test('combined BP counter is cleared when a different BP is drawn', () => {
  const { ctx } = harness();
  ctx.currentApostle = 'SUN_DESCENDANT';
  ctx.piles.SUN_DESCENDANT = initialState();
  ctx.drawBp(); ctx.resolveBp('return-top'); ctx.updateCombinedBpTotal(8);
  ctx.piles.SUN_DESCENDANT.BP.deck.reverse();
  assert.equal(ctx.returnedBpPreviewCard(), null);
  ctx.drawBp();
  assert.equal(ctx.piles.SUN_DESCENDANT.BP.combinedAttack, undefined);
  assert.equal(ctx.combinedBpNotice(), '');
});

test('returning BP is unavailable to unrelated bosses', () => {
  const { ctx } = harness();
  ctx.drawBp();
  const before = clone(ctx.piles.TEST);
  ctx.resolveBp('return-top');
  assert.deepEqual(clone(ctx.piles.TEST), before);
});

test('Nietzschean All For One does not enable BP return or a combined BP reminder', () => {
  const { ctx } = harness();
  ctx.currentApostle = 'THE_NIETZSCJEAN';
  const state = ctx.piles.THE_NIETZSCJEAN = initialState();
  ctx.drawBp();
  // A counter left by the earlier implementation must not show a reminder.
  state.BP.combinedAttack = { card: clone(state.BP.pending), total: 7 };
  const before = clone(state);
  assert.equal(ctx.supportsCombinedBp(), false);
  assert.equal(ctx.combinedBpNotice(), '');
  ctx.resolveBp('return-top');
  ctx.updateCombinedBpTotal(9);
  assert.deepEqual(clone(state), before);
});
