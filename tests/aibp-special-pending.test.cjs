const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const entry = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const specials = fs.readFileSync(path.join(__dirname, '../aibp/c45_specials.js'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));

function fn(source, name, indent) {
  const match = source.match(new RegExp(`^${indent}function ${name}\\([^]*?^${indent}}`, 'm'));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

function harness(boss) {
  const card = type => ({ type, level: 'I', index: 1 });
  const pile = type => ({ deck: [card(type)], discard: [], pending: null, damage: [], removed: [] });
  const state = { AI: pile('AI'), BP: pile('BP'), traits: [], tokens: [], lastPendingType: 'BP' };
  if (boss === 'DAHAKA') state.AI = state.BP = state.aibp = pile('AI');
  const context = vm.createContext({
    window: { BattleTerrain: { normalizeBattleMap: () => ({}) } },
    currentApostle: boss, piles: { [boss]: state }, currentBpView: '', battleMapControl: null,
    secondScreenCardBacksReady: false,
    levelRoman: { 1: 'I' }, extraGrid: { querySelectorAll: () => [] },
    ensurePiles() {}, rememberUndo() {}, savePiles() {}, renderAibpCards() {},
    openImageZoom() {}, normalizeDemidjinnAi() {},
    shuffleCards: cards => [...cards], cardSrc: card => `${card.type}-${card.index}.jpg`,
    cardBackMappingSrc: () => null,
    cardBackImageSrc: (card, src) => src.replace('.jpg', '_BACK.jpg'),
    bpDamageValue: () => 1, currentApostleLevel: () => 1, currentBpDamageView: () => '损伤',
    currentBpDamageSummary: () => ({ total: 0 }), currentBossWounds: () => 12,
    currentPanelCardTokens: () => [], currentBpNoticeImages: () => [],
    apostlePanelSrc: () => 'panel.jpg', apostlePanelIndex: () => 0,
    isChimera: () => false, isLabyrinthTrackApostle: () => false,
    deckBackDisplayText: () => '1',
  });
  for (const name of ['publicCardSnapshot', 'buildSecondScreenSnapshot', 'drawBp']) {
    vm.runInContext(fn(entry, name, '    '), context);
  }
  for (const name of ['drawDahaka', 'drawAiSpecial', 'drawBpFromBottom', 'reshuffleDemidjinnAfterAiO']) {
    vm.runInContext(fn(specials, name, '  '), context);
  }
  return { context, state, snapshot: () => clone(context.buildSecondScreenSnapshot()) };
}

test('Demidjinn special AI replaces the previous BP on the second screen, then BP replaces AI', () => {
  const { context, state, snapshot } = harness('DEMIDJINN');
  context.drawAiSpecial({ demidjinn: true });
  assert.equal(snapshot().pendingType, 'AI');
  assert.deepEqual(snapshot().pendingCard, snapshot().aiPending);
  assert.ok(snapshot().pendingCard);
  state.AI.pending = null;
  context.drawBp();
  assert.equal(snapshot().pendingType, 'BP');
  assert.deepEqual(snapshot().pendingCard, snapshot().bpPending);
  assert.ok(snapshot().pendingCard);
});

test('Titan X bottom draws switch the second screen between AI and BP even when both are pending', () => {
  const { context, snapshot } = harness('TITAN_X');
  context.drawAiSpecial({ fromBottom: true });
  assert.equal(snapshot().pendingType, 'AI');
  assert.deepEqual(snapshot().pendingCard, snapshot().aiPending);
  context.drawBpFromBottom();
  assert.equal(snapshot().pendingType, 'BP');
  assert.deepEqual(snapshot().pendingCard, snapshot().bpPending);
  assert.ok(snapshot().aiPending);
});

test('Dahaka shared cards use the chosen AI or BP half in second-screen snapshots', () => {
  const { context, state, snapshot } = harness('DAHAKA');
  for (const mode of ['AI', 'BP', 'AI']) {
    state.aibp.pending = null;
    context.drawDahaka(mode);
    assert.equal(state.aibp.pendingMode, mode);
    assert.equal(snapshot().pendingType, mode);
    assert.ok(snapshot().pendingCard);
    assert.deepEqual(snapshot().pendingCard, snapshot()[mode === 'AI' ? 'aiPending' : 'bpPending']);
  }
});

test('automatically resolved Demidjinn AI O preserves a still-pending BP as the current card', () => {
  const { context, state, snapshot } = harness('DEMIDJINN');
  state.AI.deck = [{ type: 'AI', level: 'O', index: 1, specialAi: 'demidjinn-o' }];
  state.BP.pending = state.BP.deck[0];
  context.drawAiSpecial({ demidjinn: true });
  assert.equal(state.AI.pending, null);
  assert.equal(snapshot().pendingType, 'BP');
  assert.deepEqual(snapshot().pendingCard, snapshot().bpPending);
});

test('second-screen snapshot includes the current AI deck top back and clears it when empty', () => {
  const { state, snapshot } = harness('DEMIDJINN');
  assert.equal(snapshot().aiDeckBack.src, 'AI-1_BACK.jpg');
  state.AI.deck = [{ type: 'AI', level: 'II', index: 2 }];
  assert.equal(snapshot().aiDeckBack.src, 'AI-2_BACK.jpg');
  state.AI.deck = [];
  assert.equal(snapshot().aiDeckBack, null);
});

test('second screen displays pending cards first, then the AI top back or empty state', () => {
  const source = fs.readFileSync(path.join(__dirname, '../ss/app.js'), 'utf8').replace(/\r\n/g, '\n');
  const elements = { currentPendingLabel: {}, currentPending: {} };
  let displayed;
  const context = vm.createContext({ elements, setCardImage: (target, card, emptyText) => { displayed = { card, emptyText }; } });
  vm.runInContext(fn(source, 'renderCurrentPending', ''), context);
  const back = { src: 'back.jpg' };
  const pending = { src: 'bp.jpg' };
  context.renderCurrentPending({ pendingType: 'BP', pendingCard: pending, aiDeckBack: back });
  assert.equal(displayed.card, pending);
  assert.equal(elements.currentPendingLabel.textContent, '当前 BP');
  context.renderCurrentPending({ aiDeckBack: back });
  assert.equal(displayed.card, back);
  assert.equal(elements.currentPendingLabel.textContent, 'AI 牌堆顶部');
  context.renderCurrentPending({});
  assert.equal(displayed.card, undefined);
  assert.equal(displayed.emptyText, 'AI 牌堆为空');
});
