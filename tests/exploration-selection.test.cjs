const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
const rules = require('../assets/exploration-card-rules.js');
const clone = value => JSON.parse(JSON.stringify(value));

function harness(cycleId = 'c1', { active = false, confirm = true, destruction = false } = {}) {
  const cards = ['ordinary', 'temporary', 'removed', 'added'].map(id => ({ id, name: id }));
  const drawState = {
    drawPile: active ? [] : ['ordinary'],
    activePiles: [active ? [{ id: 'ordinary', day: 7 }] : [], []],
    temporaryRemoved: [{ id: 'temporary', day: 6, removal: 'remove', receipt: { settled: true } }],
    permanentRemoved: [], discardPile: [], history: [], current: null,
  };
  const confirmations = [];
  const saved = [];
  let renders = 0;
  const ctx = vm.createContext({
    state: { exploration: {
      selectedByCycle: { [cycleId]: ['ordinary', 'temporary', 'removed'] },
      drawStateByCycle: { [cycleId]: drawState },
      destructionByCycle: { [cycleId]: ['added'] },
    } },
    currentCycleConfig: () => ({ id: cycleId }),
    getExplorationLibrary: () => cards,
    getExplorationCardTag: () => ({ removal: 'keep', draw: 'single' }),
    getExplorationSpecialRule: () => destruction ? { destructionIds: ['added'] } : null,
    explorationRules: () => rules,
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    shuffleList: ids => [...ids].reverse(),
    window: { confirm: message => { confirmations.push(message); return confirm; } },
    saveState: () => saved.push(clone(ctx.state)),
    renderFlow: () => { renders++; },
  });
  for (const name of [
    'normalizeExploration', 'getSelectedExplorationIds', 'getExplorationCard',
    'getDestructionCardIds', 'createExplorationDrawState', 'normalizeExplorationRecord',
    'ensureExplorationDrawState', 'applyExplorationSelection', 'returnTemporaryExplorationCards',
  ]) {
    const match = source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, confirmations, saved, get renders() { return renders; } };
}

test('applying exploration selections keeps temporary cards out of the deck across saves in every cycle', () => {
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const { ctx, confirmations, saved } = harness(cycle);
    const before = clone(ctx.ensureExplorationDrawState().temporaryRemoved);
    ctx.applyExplorationSelection(['ordinary', 'temporary', 'added', 'added', 'invalid']);
    const next = ctx.ensureExplorationDrawState();
    assert.deepEqual(clone(next.drawPile).sort(), ['added', 'ordinary'], cycle);
    assert.deepEqual(clone(next.temporaryRemoved), before, 'preserve the removal record and its metadata');
    assert.deepEqual(clone(ctx.getSelectedExplorationIds()), ['ordinary', 'temporary', 'added']);
    assert.equal(confirmations.length, 0, 'temporary cards alone no longer require clearing confirmation');
    assert.equal(saved.length, 1);

    ctx.state = clone(saved[0]);
    const loaded = ctx.ensureExplorationDrawState();
    assert.ok(!loaded.drawPile.includes('temporary'), 'normalization must not add it back after reload');
    assert.deepEqual(clone(loaded.temporaryRemoved), before);

    ctx.returnTemporaryExplorationCards();
    const returned = ctx.ensureExplorationDrawState();
    assert.equal(returned.drawPile.filter(id => id === 'temporary').length, 1);
    assert.equal(returned.temporaryRemoved.length, 0);
  }
});

test('deselecting a temporary card removes it from both piles', () => {
  const { ctx } = harness();
  ctx.applyExplorationSelection(['ordinary', 'added']);
  ctx.returnTemporaryExplorationCards();
  const next = ctx.ensureExplorationDrawState();
  assert.deepEqual(clone(next.drawPile).sort(), ['added', 'ordinary']);
  assert.equal(next.temporaryRemoved.length, 0);
  assert.ok(!ctx.getSelectedExplorationIds().includes('temporary'));
});

test('applying selections with an active draw clears the result while retaining temporary cards', () => {
  const { ctx, confirmations } = harness('c1', { active: true });
  ctx.applyExplorationSelection(['ordinary', 'temporary', 'added']);
  const next = ctx.ensureExplorationDrawState();
  assert.equal(confirmations.length, 1);
  assert.ok(!confirmations[0].includes('清空当前抽牌结果和暂时移出区'));
  assert.deepEqual(clone(next.activePiles), [[], []]);
  assert.deepEqual(clone(next.drawPile).sort(), ['added', 'ordinary']);
  assert.deepEqual(Array.from(next.temporaryRemoved, entry => entry.id), ['temporary']);
});

test('cancelling selection changes preserves the current deck and removal records', () => {
  const fixture = harness('c1', { active: true, confirm: false });
  const { ctx, confirmations, saved } = fixture;
  ctx.ensureExplorationDrawState();
  const before = clone(ctx.state);
  ctx.applyExplorationSelection(['ordinary', 'temporary', 'added']);
  assert.deepEqual(clone(ctx.state), before);
  assert.equal(confirmations.length, 1);
  assert.equal(saved.length, 0);
  assert.equal(fixture.renders, 0);
});

test('adding a destruction card still removes it from the destruction pile without returning temporary cards', () => {
  const { ctx } = harness('c4', { destruction: true });
  ctx.applyExplorationSelection(['ordinary', 'temporary', 'added']);
  assert.deepEqual(clone(ctx.state.exploration.destructionByCycle.c4), []);
  const next = ctx.ensureExplorationDrawState();
  assert.ok(next.drawPile.includes('added'));
  assert.ok(!next.drawPile.includes('temporary'));
  assert.deepEqual(Array.from(next.temporaryRemoved, entry => entry.id), ['temporary']);
});
