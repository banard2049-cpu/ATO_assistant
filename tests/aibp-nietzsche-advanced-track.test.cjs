const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));

function functionSource(name) {
  const match = html.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, `${name} must be available to the combo controls`);
  return match[0];
}

function element() {
  const classes = new Set();
  return {
    children: [], dataset: {}, style: { setProperty() {} },
    classList: {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
    },
    appendChild(child) { this.children.push(child); child.parent = this; },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    },
    querySelector() { return null; },
    querySelectorAll(selector) {
      return selector === '.nietzsche-break-lock'
        ? this.children.filter(child => child.className === 'nietzsche-break-lock') : [];
    },
  };
}

function harness(level, damage = 0) {
  const frame = element(), marker = element(), button = element();
  const ctx = vm.createContext({
    currentApostle: 'THE_NIETZSCJEAN', level, damage,
    piles: { THE_NIETZSCJEAN: { AI: { comboTrackIndex: 2 } } },
    nietzscheStateIndex: 2, cyclonusStateIndex: 0,
    nietzscheStateButton: button,
    currentApostleLevel: () => ctx.level,
    currentBpDamageSummary: () => ({ total: ctx.damage }),
    isChimera: () => false, isCyclonus: () => false, isLabyrinthTrackApostle: () => false,
    panelMarkerStateForArtwork: state => state,
    panelWrap: { querySelector: selector => selector === '.panel-frame' ? frame : marker },
    localStorage: { setItem() {} }, savePiles() {}, scheduleSecondScreenSnapshot() {},
    document: { createElement: element },
  });
  const start = html.indexOf('    const nietzscheName = ');
  const end = html.indexOf('    const normalBpViews = ', start);
  assert.ok(start >= 0 && end > start, 'Nietzsche track configuration exists');
  vm.runInContext(html.slice(start, end), ctx);
  for (const name of [
    'isNietzsche', 'hasAiCombo', 'isAdvancedNietzscheTrack', 'nietzscheComboStates',
    'currentPanelState', 'hasPanelState', 'hasManualPanelState', 'currentAiComboBreakInfo',
    'updateNietzscheStateUi', 'appendNietzscheBreakLock', 'renderNietzscheBreakLocks',
    'cycleNietzscheState',
  ]) vm.runInContext(functionSource(name), ctx);
  return { ctx, frame, marker, button, ai: ctx.piles.THE_NIETZSCJEAN.AI };
}

const advancedPositions = [
  [2, '刀剑', ['匕首（Knife）', '盾牌（Shield）']],
  [0, '火焰', ['矛（Spear）', '剑（Sword）', '拳套（Cestus）']],
  [1, '神浆', ['棍棒（Club）', '斧（Axe）']],
  [3, '仇恨', ['鞭（Whip）', '弓（Bow）', '板剑（Slabsword）']],
];

for (const level of [4, 5, 6, 7, 8, 9]) {
  test(`Nietzsche ${level}: the button follows the four printed combo positions and weapons`, () => {
    const h = harness(level);
    for (const [index, label, weapons] of [...advancedPositions, advancedPositions[0]]) {
      assert.equal(h.ai.comboTrackIndex, index);
      assert.equal(h.ctx.currentPanelState().label, label);
      h.ctx.updateNietzscheStateUi(h.marker);
      assert.match(h.button.textContent, new RegExp(label));
      assert.equal(h.button.classList.contains('hidden'), false, 'the manual state button remains available');
      const info = h.ctx.currentAiComboBreakInfo();
      assert.equal(info.label, label);
      assert.deepEqual(clone(info.weapons), weapons);
      assert.equal(info.canBreak, true);
      h.ctx.cycleNietzscheState();
    }
  });

  test(`Nietzsche ${level}: inherited damage thresholds remain while card overlays stay hidden`, () => {
    const h = harness(level, 12);
    const oldLock = element(); oldLock.className = 'nietzsche-break-lock';
    h.frame.appendChild(oldLock);
    h.marker.classList.add('show');
    for (const [index] of advancedPositions) {
      h.ai.comboTrackIndex = index;
      assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, index === 1 || index === 3,
        'the Weapon Master Sword and Fire thresholds survive the track replacement');
      h.ctx.updateNietzscheStateUi(h.marker);
      assert.equal(h.marker.classList.contains('show'), false, 'no state marker is drawn on the Boss card');
      h.ctx.renderNietzscheBreakLocks();
      assert.equal(h.frame.querySelectorAll('.nietzsche-break-lock').length, 0, 'stale locks are removed');
    }
    for (const [index, threshold] of [[2, 6], [0, 10]]) {
      h.ai.comboTrackIndex = index;
      h.ctx.damage = threshold - 1;
      assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, true);
      h.ctx.damage = threshold;
      assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, false);
      assert.deepEqual(clone(h.ctx.currentAiComboBreakInfo().weapons), []);
    }
  });
}

for (const level of [1, 2, 3]) {
  test(`Nietzsche ${level}: the original three-position button, weapons and card marker remain`, () => {
    const h = harness(level);
    for (const [index, label, weapons] of [
      [2, '巨剑', ['匕首（Knife）', '盾牌（Shield）', '鞭（Whip）', '板剑（Slabsword）']],
      [0, '火焰', ['矛（Spear）', '剑（Sword）', '拳套（Cestus）']],
      [1, '神浆', ['棍棒（Club）', '斧（Axe）', '弓（Bow）']],
      [2, '巨剑', ['匕首（Knife）', '盾牌（Shield）', '鞭（Whip）', '板剑（Slabsword）']],
    ]) {
      assert.equal(h.ai.comboTrackIndex, index);
      const info = h.ctx.currentAiComboBreakInfo();
      assert.equal(info.label, label);
      assert.deepEqual(clone(info.weapons), weapons);
      h.ctx.updateNietzscheStateUi(h.marker);
      assert.match(h.button.textContent, new RegExp(label));
      assert.equal(h.marker.classList.contains('show'), true);
      h.ctx.cycleNietzscheState();
    }
  });

  test(`Nietzsche ${level}: the original Sword and Fire damage thresholds remain`, () => {
    const h = harness(level);
    for (const [index, threshold] of [[2, 6], [0, 10]]) {
      h.ai.comboTrackIndex = index;
      h.ctx.damage = threshold - 1;
      assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, true);
      h.ctx.damage = threshold;
      assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, false);
    }
    h.ctx.damage = 12;
    h.ai.comboTrackIndex = 1;
    assert.equal(h.ctx.currentAiComboBreakInfo().canBreak, true);
    h.ctx.renderNietzscheBreakLocks();
    assert.equal(h.frame.querySelectorAll('.nietzsche-break-lock').length, 2);
  });
}

test('the saved fourth position survives reload and a temporary downgrade uses the old Sword position', () => {
  const normalization = html.match(/^        if \(\["THE_NIETZSCJEAN", "CYCLONUS"\]\.includes\(name\)\) \{[^]*?^        }/m);
  assert.ok(normalization, 'combo save normalization remains available');
  const h = harness(4);
  Object.assign(h.ai, { comboTrackIndex: 3, pending: null, comboFollowup: true });
  h.ctx.name = 'THE_NIETZSCJEAN';
  vm.runInContext(normalization[0], h.ctx);
  assert.equal(h.ai.comboTrackIndex, 3);
  assert.equal(h.ai.comboFollowup, false);
  assert.equal(h.ctx.currentPanelState().label, '仇恨');
  h.ctx.level = 3;
  assert.equal(h.ctx.currentPanelState().label, '巨剑');
  h.ctx.updateNietzscheStateUi(h.marker);
  assert.equal(h.marker.classList.contains('show'), true);
  assert.equal(h.ai.comboTrackIndex, 3, 'viewing a lower level does not destroy the advanced position');
  h.ctx.level = 4;
  assert.equal(h.ctx.currentPanelState().label, '仇恨');
});
