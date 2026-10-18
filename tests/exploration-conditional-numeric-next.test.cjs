const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const rules = require('../assets/exploration-card-conditions.js');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/exploration-card-resources.js'), 'utf8'), ctx);
const cards = ctx.window.ATO_EXPLORATION_CARD_RESOURCES.cards;

function record(cycleId, tracks = {}, stock = 0) {
  return { cycle: cycleId, resources: { 'c2-violentAmbrosia': stock }, cycleStats: {
    [cycleId]: { fate: 0, hull: 4, crew: 3, doom: 0, paradox: 0, loopLength: 10,
      babelianDebt: 0, ...tracks, ...(cycleId === 'c2' ? {
        crewCounters: { crew: 3, refugees: 0, captives: 0, ...tracks.crewCounters },
      } : {}) },
  } };
}
function plan(key, value) {
  return rules.simpleConditionalEffects(cards[key], rules.contextForRecord(value, key.split(':')[0]))[0];
}

test('Sabotage resolves Refugee branches and the printed return/remove thresholds', () => {
  for (const [key, threshold, loss, fateThreshold, refugeeThreshold] of [
    ['c2:13630', 2, 'hull', 8, 4], ['c2:13632', 1, 'titan', 6, 3],
  ]) {
    const value = record('c2');
    assert.deepEqual(plan(key, value).effects, [{ type: 'refugees', amount: 1 }]);
    assert.equal(plan(key, value).removal, 'keep');
    value.cycleStats.c2.crewCounters.refugees = threshold;
    assert.deepEqual(plan(key, value).effects, [{ type: loss, amount: -1 }]);
    assert.equal(plan(key, value).removal, 'keep');
    value.cycleStats.c2.fate = fateThreshold;
    assert.equal(plan(key, value).removal, 'remove');
    value.cycleStats.c2.fate = 0;
    value.cycleStats.c2.crewCounters.refugees = refugeeThreshold;
    assert.equal(plan(key, value).removal, 'remove');
    assert.deepEqual(plan(key, value).manualIndexes, [0, 1]);
  }
});

test('Sabotage manual cards resolve only their independent removal footer', () => {
  for (const [key, fateThreshold, refugeeThreshold, id] of [
    ['c2:13631', 5, 2, 'conditional:propylon-removal'],
    ['c2:13633', 7, 4, 'conditional:titan-armory-removal'],
  ]) {
    const value = record('c2', { fate: fateThreshold - 1, crewCounters: { refugees: refugeeThreshold - 1 } });
    const before = JSON.stringify(value);
    const keep = plan(key, value);
    assert.equal(keep.id, id);
    assert.equal(keep.removal, 'keep');
    assert.equal(keep.automaticOperation, true);
    assert.deepEqual(keep.effects, [], 'the AA-disable and Armory-card loss stay manual');
    assert.deepEqual(keep.manualIndexes, [], 'the footer must not consume the upper manual reminders');
    assert.match(keep.summary, /洗回破坏卡组/);
    assert.equal(JSON.stringify(value), before, 'planning never changes the upper ability or its tracks');
    value.cycleStats.c2.fate = fateThreshold;
    assert.equal(plan(key, value).removal, 'remove', 'Fate alone activates the printed OR footer');
    value.cycleStats.c2.fate = fateThreshold - 1;
    value.cycleStats.c2.crewCounters.refugees = refugeeThreshold;
    assert.equal(plan(key, value).removal, 'remove', 'Refugees alone activate the printed OR footer');
    value.cycleStats.c2.fate = '';
    assert.equal(plan(key, value).removal, 'remove', 'a known true Refugee branch needs no guessed Fate value');
    value.cycleStats.c2.crewCounters.refugees = refugeeThreshold - 1;
    assert.equal(plan(key, value).conditionState, null, 'an unknown OR branch cannot be treated as false');
    assert.equal(plan(key, value).removal, undefined);
  }
});

test('Time Shift removal uses the selected branch and the Paradox after its loss', () => {
  for (const [key, loss, fateThreshold, paradoxThreshold] of [
    ['c3:13536', 2, 6, 4], ['c3:13538', 1, 5, 5],
  ]) {
    const fallback = plan(key, record('c3', { paradox: 2, fate: '' }));
    assert.equal(fallback.removal, 'remove');
    assert.deepEqual(fallback.effects, [{ type: 'paradox', amount: 1 }]);
    const low = plan(key, record('c3', { paradox: 3, fate: 0 }));
    assert.equal(low.removal, 'permanent');
    assert.deepEqual(low.effects, [{ type: 'paradox', amount: -loss }, ...(key === 'c3:13536' ? [{ type: 'doom', amount: 1 }] : [])]);
    if (key === 'c3:13538') assert.ok(low.remainder, 'the physical map movement stays visible');
    assert.equal(plan(key, record('c3', { paradox: paradoxThreshold + loss - 1, fate: 0 })).removal, 'permanent');
    assert.equal(plan(key, record('c3', { paradox: paradoxThreshold + loss, fate: '' })).removal, 'remove');
    assert.equal(plan(key, record('c3', { paradox: 3, fate: fateThreshold })).removal, 'remove');
    assert.equal(plan(key, record('c3', { paradox: 3, fate: '' })).conditionState, null);
    assert.deepEqual(low.manualIndexes, [0, 1, 2], 'fallback and footer do not become separate delayed return tasks');
  }
});

test('Ambrosia Spill keeps the tier boundaries, independent Doom and rounded remaining stock', () => {
  for (const [stock, effect, remaining] of [
    [0, [], 0], [15, [], 15], [16, [{ type: 'crew', amount: -1 }], 16],
    [25, [{ type: 'crew', amount: -1 }], 25],
    [26, [{ type: 'hull', amount: -1 }], 13], [27, [{ type: 'hull', amount: -1 }], 14],
  ]) {
    const value = record('c2', {}, stock);
    const before = JSON.stringify(value);
    const result = plan('c2:13635', value);
    assert.deepEqual(result.effects, effect);
    assert.equal(result.conditionState, true);
    assert.equal(result.automaticOperation, true, 'a known no-op tier still resolves the card');
    assert.equal(result.removal, 'remove');
    assert.deepEqual(result.resourceChanges, stock < 26 ? [] : [{
      resource: 'violentAmbrosia', storageKey: 'c2-violentAmbrosia', amount: remaining - stock,
    }]);
    assert.equal(JSON.stringify(value), before, 'planning is read-only');
  }
  for (const tracks of [{ fate: 8 }, { crewCounters: { refugees: 6 } }]) {
    assert.deepEqual(plan('c2:13635', record('c2', tracks, 0)).effects, [{ type: 'doom', amount: 1 }]);
  }
  assert.deepEqual(plan('c2:13635', record('c2', { fate: 8 }, 27)).effects,
    [{ type: 'hull', amount: -1 }, { type: 'doom', amount: 1 }]);
  assert.deepEqual(plan('c2:13635', record('c2')).manualIndexes, [0, 1, 2, 3, 4, 5, 6]);
});

test('Loop and Imperial Dues use one branch and decide removal from the resulting tracks', () => {
  for (const [paradox, fate, removal] of [[2, 0, 'remove'], [3, 6, 'permanent'],
    [8, 6, 'permanent'], [9, 6, 'remove'], [3, 7, 'remove']]) {
    const result = plan('c3:13540', record('c3', { paradox, fate }));
    assert.deepEqual(result.effects, paradox < 3 ? [{ type: 'paradox', amount: 1 }]
      : [{ type: 'paradox', amount: -2 }, { type: 'loopLength', amount: -1 }]);
    assert.equal(result.removal, removal);
    assert.deepEqual(result.manualIndexes, [0, 1, 2]);
  }
  for (const debt of [0, 2, 3, 9]) {
    const result = plan('c4:9330', record('c4', { babelianDebt: debt }));
    assert.deepEqual(result.effects, debt >= 3
      ? [{ type: 'babelianDebt', amount: -2 }, { type: 'doom', amount: 1 }]
      : [{ type: 'babelianDebt', amount: 1 }]);
    assert.equal(result.removal, 'remove');
    assert.deepEqual(result.manualIndexes, [0, 1, 2]);
  }
});

test('Required missing values keep whole groups manual and another cycle or Defectors never supplies them', () => {
  const missingRefugees = { cycle: 'c2', renegade: 8, fate: 8, hull: 4, resources: {}, cycleStats: { c2: {} } };
  assert.equal(rules.contextForRecord(missingRefugees, 'c2').stats.refugees, null);
  const cases = [
    ['c2:13630', missingRefugees], ['c2:13632', missingRefugees],
    ['c2:13635', record('c2', {}, '')],
    ['c2:13635', record('c2', { hull: '' }, 26)],
    ['c3:13540', record('c3', { paradox: 3, loopLength: '' })],
    ['c4:9330', record('c4', { babelianDebt: 3, doom: '' })],
  ];
  for (const [key, value] of cases) {
    const result = plan(key, value);
    assert.equal(result.conditionState, null, key);
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.resourceChanges, []);
    assert.equal(result.removal, undefined);
    assert.ok(result.remainder.includes('手动处理完整效果'));
  }
  assert.equal(plan('c3:13540', { cycle: 'c2', paradox: 9, fate: 9, loopLength: 10,
    cycleStats: { c3: {} } }).conditionState, null);
  const fallback = record('c3', { paradox: 2, loopLength: '', fate: '' });
  assert.equal(plan('c3:13540', fallback).conditionState, true, 'unused tracks do not block a fully known fallback');
});

test('Panic Spreads never changes removal while the other two Paranoia cards still leave the deck', () => {
  for (const paranoia of [0, 2, 3, 6]) {
    const panic = plan('c5:10310', record('c5', { paranoia }));
    assert.equal(panic.removal, undefined);
    assert.deepEqual(panic.effects, paranoia >= 3
      ? [{ type: 'titan', amount: -1 }, { type: 'paranoia', amount: -1 }] : []);
    for (const key of ['c5:10306', 'c5:10314']) {
      assert.equal(plan(key, record('c5', { paranoia })).removal, 'remove', key);
    }
  }
});

test('Map clauses use confirmed factions, keep post-event bonuses behind the core, and never apply the gain twice while planning', () => {
  function mapPlan(key, value, factions, mapKnown = true) {
    return rules.simpleConditionalEffects(cards[key], { ...rules.contextForRecord(value, key.split(':')[0]),
      mapKnown, mapFactions: factions })[0];
  }
  const strangerRecord = record('c1', { strangers: 1, fate: 5 });
  const plainMaze = mapPlan('c1:6437', strangerRecord, ['minoians']);
  assert.deepEqual(plainMaze.effects, [{ type: 'strangers', amount: 1 }]);
  assert.equal(plainMaze.remainder, undefined, 'the later Fate gain must not activate the earlier event');
  const maze = mapPlan('c1:6437', strangerRecord, ['labyrinthians']);
  assert.deepEqual(maze.effects, [{ type: 'strangers', amount: 2 }]);
  assert.ok(maze.remainder.includes('0014'));
  assert.deepEqual(maze.manualIndexes, [0, 1]);
  assert.deepEqual(maze.blockedManualIndexes, [2]);
  const plainLenders = mapPlan('c4:9334', record('c4', { babelianDebt: 1 }), ['aristotelians']);
  assert.deepEqual(plainLenders.effects, [{ type: 'babelianDebt', amount: 1 }, { type: 'babelianDebt', amount: 1 }]);
  assert.equal(plainLenders.remainder, undefined, 'fallback is chosen before the later At War gain');
  const lenders = mapPlan('c4:9334', record('c4', { babelianDebt: 1 }), ['cloudThieves']);
  assert.deepEqual(lenders.effects, [{ type: 'babelianDebt', amount: 2 }]);
  assert.ok(lenders.remainder.includes('Shortages'));
  assert.deepEqual(lenders.manualIndexes, [0, 1, 2]);
  assert.deepEqual(lenders.blockedManualIndexes, [3]);
  const tomorrow = mapPlan('c3:13541', record('c3'), ['sunheirs']);
  assert.deepEqual(tomorrow.effects, [{ type: 'paradox', amount: 1 }]);
  assert.deepEqual(tomorrow.manualIndexes, [0, 1]);
  assert.equal(tomorrow.removal, undefined, 'uncertain fallback and post-event removal remain outside the map operation');
  assert.deepEqual(mapPlan('c3:13541', record('c3'), ['delphians']).effects, []);
  const highFateTomorrow = mapPlan('c3:13541', record('c3', { fate: 7 }), ['sunheirs']);
  assert.equal(highFateTomorrow.removal, 'remove', 'the explicit Fate footer does not depend on the ambiguous fallback');
  assert.deepEqual(highFateTomorrow.manualIndexes, [0, 1, 3]);
  const unknownFateTomorrow = mapPlan('c3:13541', record('c3', { fate: '' }), ['sunheirs']);
  assert.equal(unknownFateTomorrow.removal, undefined);
  assert.deepEqual(unknownFateTomorrow.manualIndexes, [0, 1]);
  for (const [key, value] of [['c1:6437', strangerRecord], ['c3:13541', record('c3')], ['c4:9334', record('c4')]]) {
    const unknown = mapPlan(key, value, [], false);
    assert.equal(unknown.conditionState, null, 'a missing map sync is not a confirmed non-faction tile');
    assert.deepEqual(unknown.effects, []);
  }
});
