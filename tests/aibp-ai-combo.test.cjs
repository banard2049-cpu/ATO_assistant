const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const specials = fs.readFileSync(path.join(__dirname, '../aibp/c45_specials.js'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
function fn(name) {
  const match = html.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}
function trackConfig(name) {
  return clone(vm.runInNewContext(html.match(new RegExp('^    const ' + name + ' = (\\[[^]*?^    \\]);', 'm'))[1]));
}

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.listeners = {};
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name), remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
      toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  querySelectorAll() { return this.children; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  click(target = this) { this.listeners.click({ target, stopPropagation() {} }); }
}

function harness(name, storage = new Map(), level = 1) {
  const controls = {};
  for (const id of ['confirmAiButton', 'breakAiComboButton', 'continueAiComboButton',
    'drawAiButton', 'drawBpButton', 'discardBpButton', 'defeatBpButton', 'criticalBpButton',
    'aiDrawPreview', 'bpDrawPreview', 'imageZoomAiComboActions', 'imageZoomOverlay',
    'imageZoomImg', 'imageZoomNotice', 'imageZoomCombinedNotice', 'imageZoomAiComboNotice', 'nietzscheStateButton']) {
    controls[id] = new Element();
  }
  controls.imageZoomImg.parentElement = new Element();
  controls.imageZoomNotice.parentElement = new Element();
  for (const action of ['break', 'continue', 'finish']) {
    const button = new Element();
    button.dataset.aiComboAction = action;
    button.closest = () => button;
    controls.imageZoomAiComboActions.append(button);
  }
  const ctx = vm.createContext({
    ...controls, currentApostle: name, apostles: [name], piles: {}, storageKey: 'piles',
    undoStacks: {}, maxUndoSteps: 30, pendingUndoEntry: null, activeScry: null,
    currentAiView: '弃牌', currentBpView: '弃牌', undoAiButton: {}, undoBpButton: {},
    nietzscheName: 'THE_NIETZSCJEAN', cyclonusName: 'CYCLONUS', chimeraName: 'CHIMERA',
    nietzscheStateKey: 'nietzsche', cyclonusStateKey: 'cyclonus', nietzscheDefaultStateIndex: 2,
    nietzscheStateIndex: 2, cyclonusStateIndex: 0,
    nietzscheStates: trackConfig('nietzscheStates'),
    nietzscheAdvancedStates: trackConfig('nietzscheAdvancedStates'),
    cyclonusStates: trackConfig('cyclonusStates'),
    currentApostleLevel: () => level,
    isLabyrinthTrackApostle: () => false, isChimera: () => false,
    shuffleCards: cards => [...cards],
    defaultPile: type => [1, 2, 3].map(index => ({ type, level: 'I', index })),
    supplyPile: () => [], initialFlarePile: () => ({ deck: [], discard: [] }),
    initialTitanFeintPile: () => ({ deck: [], active: [], removed: [] }),
    structuredClone, zoomCloseAction: null, activeAiComboZoom: null, panelZoomState: null,
    localStorage: {
      getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    window: { HeliosAssets: { resolve: src => src } },
    document: { body: { style: {} }, createElement: () => new Element() },
    panelWrap: { querySelector: () => null }, battleMapControl: { render() {} },
    ensurePiles() {}, scheduleSecondScreenSnapshot() {}, updateAiViewTabs() {}, updateBpViewTabs() {},
    renderExtraCards() {}, renderPanelTokens() {}, renderCombinedBpControl() {},
    returnedBpPreviewCard: () => null, combinedBpNotice: () => '',
    setImageZoomBpActions() {}, setImageZoomFlipActions() {}, setImageZoomMoveActions() {},
    setImageZoomTokenActions() {}, setImageZoomCardTokens() {}, updatePanelZoomSwitch() {},
    cardSrc: card => `${card.type}-${card.level}-${card.index}.jpg`,
    currentPanelCardTokens: () => [], currentBpNoticeImages: () => [], currentAiNoticeImages: () => [],
    imageOrMessage: (src, alt) => Object.assign(new Element(), { src, alt }),
    shouldZoomImage: () => true, zoomCardTokenTypeFromImage: () => 'AI',
    flipContextFromImage: () => null, moveContextFromImage: () => null, tokenContextFromImage: () => null,
    titanXGroup: () => null, titanXDrawsFromBottom: () => false,
  });
  for (const name of ['initialState', 'hasAiCombo', 'sameCard', 'isNietzsche', 'isCyclonus',
    'isAdvancedNietzscheTrack', 'nietzscheComboStates',
    'hasPanelState', 'hasManualPanelState', 'currentPanelState', 'panelMarkerStateForArtwork', 'updateNietzscheStateUi', 'cycleNietzscheState',
    'bpDamageValue', 'bpDamageTotalForKey', 'currentBpDamageSummary', 'currentAiComboBreakInfo',
    'isPlainObject', 'clonePileState', 'migrateLegacyHealedPiles', 'loadSavedPiles', 'savePiles',
    'rememberUndo', 'trimUndoStack', 'undoSharedState', 'captureUndoEffects', 'undoEntryIndex',
    'reverseUndoEffects', 'canUndo', 'undoLastAibp', 'updateUndoButtons',
    'drawAi', 'discardAiPending', 'removePendingFromDeck', 'resolveAiCombo', 'confirmAiDiscard',
    'drawPileBackPreviewCard', 'renderPileBackPreview', 'cardBackMappingSrc', 'cardBackImageSrc',
    'renderDrawPreview', 'setImageZoomAiComboActions', 'openImageZoom', 'closeImageZoom', 'openZoomForImage']) {
    vm.runInContext(fn(name), ctx);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../aibp/panel-overlay.js'), 'utf8'), ctx);
  ctx.piles[name] = ctx.initialState();
  ctx.loadSavedPiles();
  ctx.renderAibpCards = () => { ctx.renderDrawPreview(); ctx.updateUndoButtons(); };
  ctx.base = { drawAi: ctx.drawAi };
  // The installed C4/C5 wrapper must forward the second-card flag for C2 bosses too.
  vm.runInContext(specials.match(/^  drawAi = function \([^]*?^  };/m)[0], ctx);
  vm.runInContext(html.match(/^    imageZoomAiComboActions.addEventListener\([^]*?^    \}\);/m)[0], ctx);
  vm.runInContext('imageZoomOverlay.addEventListener("click", closeImageZoom);', ctx);
  ctx.renderAibpCards();
  return {
    ctx, storage, controls, ai: () => ctx.piles[name].AI,
    zoomAction: action => controls.imageZoomAiComboActions.click(
      controls.imageZoomAiComboActions.children.find(button => button.dataset.aiComboAction === action)),
    visibleActions: () => controls.imageZoomAiComboActions.children.filter(button => !button.hidden)
      .map(button => button.dataset.aiComboAction),
    reopen: () => ctx.openZoomForImage(Object.assign(new Element(), {
      src: ctx.cardSrc(ctx.piles[name].AI.pending), alt: '抽取的 AI',
      closest: selector => selector === '#aiDrawPreview' ? controls.aiDrawPreview : null,
    })),
  };
}

for (const [boss, initial, next, label] of [
  ['THE_NIETZSCJEAN', 2, 0, '火焰'], ['CYCLONUS', 0, 2, 'Body'],
]) {
  test(`${boss}: clicking blank space retains AI; reopening allows breaking and advances the track once`, () => {
    const h = harness(boss);
    h.ctx.drawAi();
    assert.deepEqual(h.visibleActions(), ['break', 'continue']);
    assert.equal(h.controls.drawAiButton.disabled, true);
    h.controls.imageZoomOverlay.click();
    assert.equal(h.ai().pending.index, 1);
    assert.equal(h.ai().deck.length, 3);
    assert.equal(h.ai().discard.length, 0);
    assert.equal(h.ai().comboTrackIndex, initial);
    assert.equal(h.controls.aiDrawPreview.children.length, 1);
    h.reopen();
    h.zoomAction('break');
    assert.equal(h.ai().pending, null);
    assert.deepEqual([...h.ai().discard.map(card => card.index)], [1]);
    assert.equal(h.ai().comboTrackIndex, next);
    assert.equal(h.ctx.currentPanelState().label, label);
    assert.equal(h.controls.imageZoomOverlay.classList.contains('show'), false);
    h.ctx.resolveAiCombo('break');
    assert.equal(h.ai().comboTrackIndex, next);
    h.ctx.undoLastAibp('AI');
    assert.equal(h.ai().pending.index, 1);
    assert.equal(h.ai().comboTrackIndex, initial);
  });

  test(`${boss}: continuing draws only one additional AI, survives reload, and undoes cards and track together`, () => {
    let h = harness(boss);
    h.ctx.drawAi();
    h.zoomAction('continue');
    assert.equal(h.ai().pending.index, 2);
    assert.equal(h.ai().comboFollowup, true);
    assert.equal(h.ai().comboTrackIndex, next);
    assert.equal(h.ctx.currentPanelState().label, label);
    assert.deepEqual([...h.ai().discard.map(card => card.index)], [1]);
    assert.equal(h.controls.imageZoomOverlay.classList.contains('show'), true, 'second AI zoom stays open');
    assert.deepEqual(h.visibleActions(), ['finish']);
    assert.equal(h.controls.breakAiComboButton.hidden, true);
    assert.equal(h.controls.continueAiComboButton.hidden, true);
    h.ctx.resolveAiCombo('continue');
    assert.equal(h.ai().pending.index, 2);
    assert.equal(h.ai().deck.length, 2);
    h.controls.imageZoomOverlay.click();
    assert.equal(h.ai().pending.index, 2);
    h = harness(boss, h.storage);
    assert.equal(h.ai().comboFollowup, true);
    assert.equal(h.ctx.currentPanelState().label, label);
    h.reopen();
    assert.deepEqual(h.visibleActions(), ['finish']);
    h.zoomAction('finish');
    assert.equal(h.ai().pending, null);
    assert.deepEqual([...h.ai().discard.map(card => card.index)], [1, 2]);
    assert.equal(h.ai().comboTrackIndex, next, 'second AI does not advance the combo track again');
    h.ctx.undoLastAibp('AI');
    assert.equal(h.ai().pending.index, 2);
    assert.equal(h.ai().comboFollowup, true);
    assert.equal(h.ai().comboTrackIndex, next);
    h.ctx.undoLastAibp('AI');
    assert.equal(h.ai().pending.index, 1);
    assert.equal(h.ai().comboFollowup, false);
    assert.equal(h.ai().comboTrackIndex, initial);
    assert.equal(h.ai().discard.length, 0);
    h.ctx.undoLastAibp('AI');
    assert.equal(h.ai().pending, null);
    assert.equal(h.ai().deck.length, 3);
  });

  test(`${boss}: next normal draw starts a new combo; track wraps after three resolutions`, () => {
    const h = harness(boss);
    for (let i = 0; i < 3; i++) {
      h.ctx.drawAi();
      assert.equal(h.ai().comboFollowup, false);
      h.ctx.resolveAiCombo('continue');
      h.ctx.confirmAiDiscard();
    }
    assert.equal(h.ai().comboTrackIndex, initial);
    h.ctx.drawAi();
    assert.deepEqual(h.visibleActions(), ['break', 'continue']);
  });

  test(`${boss}: continuing at deck exhaustion reshuffles and keeps the second AI pending`, () => {
    const h = harness(boss);
    h.ai().deck = [h.ai().deck[0]];
    h.ai().discard = [{ type: 'AI', level: 'II', index: 4 }];
    h.ctx.drawAi();
    h.ctx.resolveAiCombo('continue');
    assert.equal(h.ai().pending.level, 'II');
    assert.equal(h.ai().comboFollowup, true);
    assert.equal(h.ai().comboTrackIndex, next);
    assert.equal(h.ai().deck.length, 2);
    assert.equal(h.ai().discard.length, 0);
  });
}

test('unrelated Boss AI still discards on closing zoom and has no combo controls', () => {
  const h = harness('HEKATON');
  h.ctx.drawAi();
  assert.equal(h.controls.imageZoomAiComboActions.classList.contains('show'), false);
  assert.equal(h.controls.breakAiComboButton.hidden, true);
  assert.equal(h.controls.confirmAiButton.hidden, false);
  h.controls.imageZoomOverlay.click();
  assert.equal(h.ai().pending, null);
  assert.equal(h.ai().discard.length, 1);
});

test('old combo saves retain their manual track position and cannot retain a stale followup flag', () => {
  const normalization = html.match(/^        if \(\["THE_NIETZSCJEAN", "CYCLONUS"\]\.includes\(name\)\) \{[^]*?^        }/m)[0];
  for (const name of ['THE_NIETZSCJEAN', 'CYCLONUS']) {
    const ai = { pending: null, comboFollowup: true };
    vm.runInNewContext(normalization, {
      name, piles: { [name]: { AI: ai } }, nietzscheName: 'THE_NIETZSCJEAN',
      nietzscheStateIndex: 1, cyclonusStateIndex: 1,
      nietzscheAdvancedStates: trackConfig('nietzscheAdvancedStates'),
      cyclonusStates: trackConfig('cyclonusStates'),
    });
    assert.equal(ai.comboTrackIndex, 1);
    assert.equal(ai.comboFollowup, false);
  }
});

test('Nietzsche IV combo resolution, reload and undo retain the fourth position and its weapons', () => {
  let h = harness('THE_NIETZSCJEAN', new Map(), 4);
  for (const expected of [0, 1, 3]) {
    h.ctx.drawAi();
    h.zoomAction('continue');
    h.zoomAction('finish');
    assert.equal(h.ai().comboTrackIndex, expected);
  }
  h = harness('THE_NIETZSCJEAN', h.storage, 4);
  assert.equal(h.ai().comboTrackIndex, 3);
  assert.equal(h.ctx.currentPanelState().label, '仇恨');
  h.ctx.drawAi();
  assert.deepEqual([...h.ctx.currentAiComboBreakInfo().weapons], ['鞭（Whip）', '弓（Bow）', '板剑（Slabsword）']);
  h.zoomAction('break');
  assert.equal(h.ai().comboTrackIndex, 2);
  h.ctx.undoLastAibp('AI');
  assert.equal(h.ai().comboTrackIndex, 3);
  assert.equal(h.ai().pending != null, true);
});

test('AI zoom controls never act on a different Boss or a stale pending card', () => {
  const h = harness('CYCLONUS');
  h.ctx.drawAi();
  const before = clone(h.ai());
  h.ctx.activeAiComboZoom.apostle = 'THE_NIETZSCJEAN';
  h.zoomAction('continue');
  assert.deepEqual(clone(h.ai()), before);
  h.ctx.activeAiComboZoom.apostle = 'CYCLONUS';
  h.ctx.activeAiComboZoom.card = { type: 'AI', level: 'III', index: 6 };
  h.zoomAction('continue');
  assert.deepEqual(clone(h.ai()), before);
});

for (const [boss, index, label, englishLabel, weapons] of [
  ['THE_NIETZSCJEAN', 2, '巨剑', 'Sword', ['匕首（Knife）', '盾牌（Shield）', '鞭（Whip）', '板剑（Slabsword）']],
  ['THE_NIETZSCJEAN', 0, '火焰', 'Fire', ['矛（Spear）', '剑（Sword）', '拳套（Cestus）']],
  ['THE_NIETZSCJEAN', 1, '神浆', 'Ambrosia', ['棍棒（Club）', '斧（Axe）', '弓（Bow）']],
  ['CYCLONUS', 0, '球锤', 'Mauls', ['匕首（Knife）', '盾牌（Shield）', '板剑（Slabsword）', '鞭（Whip）']],
  ['CYCLONUS', 1, '锁链', 'Chain', ['棍棒（Club）', '斧（Axe）', '弓（Bow）']],
  ['CYCLONUS', 2, '身躯', 'Body', ['矛（Spear）', '剑（Sword）', '拳套（Cestus）']],
]) {
  test(`${boss}/${label}: AI zoom shows the weapons printed beside the selected combo track`, () => {
    const h = harness(boss);
    h.ai().comboTrackIndex = index;
    h.ctx.drawAi();
    const notice = h.controls.imageZoomAiComboNotice;
    assert.equal(notice.hidden, false);
    assert.equal(notice.children[0].textContent, `${label}连招（${englishLabel} Combo）`);
    assert.equal(notice.children[1].textContent, '可打断连招的武器');
    assert.deepEqual(notice.children[2].children.map(chip => chip.textContent), weapons);
    assert.equal(h.controls.breakAiComboButton.disabled, false);
    h.controls.imageZoomOverlay.click();
    assert.equal(notice.hidden, true);
    assert.equal(notice.children.length, 0);
  });
}

for (const [index, threshold] of [[2, 6], [0, 10]]) {
  test(`Nietzsche at ${threshold} wounds: block combo breaks; wound undo restores them while AI remains pending`, () => {
    const h = harness('THE_NIETZSCJEAN');
    h.ai().comboTrackIndex = index;
    h.ctx.piles.THE_NIETZSCJEAN.BP.damage = Array.from({ length: threshold - 2 }, () => ({ special: 'SW' }));
    h.ctx.drawAi();
    assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, true);
    h.ctx.rememberUndo('THE_NIETZSCJEAN', 'BP');
    h.ctx.piles.THE_NIETZSCJEAN.BP.damage.push({ special: 'DW' });
    h.ctx.savePiles();
    h.ctx.renderAibpCards();
    assert.equal(h.ctx.currentBpDamageSummary().total, threshold);
    assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, false);
    assert.equal(h.controls.breakAiComboButton.disabled, true);
    assert.equal(h.controls.continueAiComboButton.disabled, false);
    const notice = h.controls.imageZoomAiComboNotice;
    assert.equal(notice.children[1].textContent, '无法打断连招');
    assert.equal(notice.children[2].textContent, `损伤已达到 ${threshold}+。`);
    assert.equal(notice.classList.contains('unbreakable'), true);
    const before = clone(h.ai());
    h.zoomAction('break');
    h.ctx.resolveAiCombo('break');
    assert.deepEqual(clone(h.ai()), before);
    assert.equal(h.ctx.undoStacks.THE_NIETZSCJEAN.length, 2, 'invalid breaks do not add undo steps');
    h.ctx.undoLastAibp('BP');
    assert.equal(h.controls.breakAiComboButton.disabled, false);
    assert.equal(notice.children[1].textContent, '可打断连招的武器');
    assert.equal(h.ai().pending.index, 1);
    assert.equal(h.ai().comboTrackIndex, index);
    h.ctx.piles.THE_NIETZSCJEAN.BP.damage.push({ special: 'DW' });
    h.ctx.renderAibpCards();
    h.zoomAction('continue');
    assert.equal(h.ai().pending.index, 2);
    assert.equal(h.ai().comboFollowup, true);
    assert.equal(notice.children[1].textContent, '不再触发连招');
    assert.equal(notice.children[2].children.length, 0, 'second AI does not show the next turn weapon list');
  });
}

test('high wounds do not lock Nietzsche Ambrosia or any Cyclonus combo', () => {
  for (const [boss, indexes] of [['THE_NIETZSCJEAN', [1]], ['CYCLONUS', [0, 1, 2]]]) {
    const h = harness(boss);
    h.ctx.piles[boss].BP.damage = Array.from({ length: 12 }, () => ({ special: 'SW' }));
    for (const index of indexes) {
      h.ai().comboTrackIndex = index;
      assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, true);
    }
  }
});
