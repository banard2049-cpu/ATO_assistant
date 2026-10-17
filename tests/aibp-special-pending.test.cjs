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
    levelRoman: { 1: 'I' }, extraGrid: { querySelectorAll: () => [] },
    ensurePiles() {}, rememberUndo() {}, savePiles() {}, renderAibpCards() {},
    openImageZoom() {}, normalizeDemidjinnAi() {},
    shuffleCards: cards => [...cards], cardSrc: card => `${card.type}-${card.index}.jpg`,
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
