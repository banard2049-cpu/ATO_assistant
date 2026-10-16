const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pursuit = require('../assets/exploration-pursuit.js');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(ids, factions = ['outcastVanguard']) {
  const cards = ids.map(id => ({ id, name: id, day: 8, drawnAt: 'audit-draw' }));
  return { cycleId: 'c5', day: 8, operationId: 'audit-round', selection: { roundId: 'audit-round' },
    record: { cycle: 'c5', cycleStats: { c5: { fate: '3' } }, diplomacy: { 'c5-outcastVanguard': '8' } },
    state: { exploration: { drawStateByCycle: { c5: { pursuitRoundId: 'audit-round', activePiles: [cards, []] } } } },
    mapTags: { tiles: { 'c5:001': { factions } } },
    mapState: { cycles: { c5: { currentTile: '001', tokens: { AD: '' }, titanXTrackPosition: 7 } } },
    mapData: { cycles: [{ id: 'c5', tiles: [{ id: '001', neighbors: { right: '002' } }, { id: '002' }] }] },
    pathRules: {}, automation: { version: 1, events: {} } };
}
function localState(ctx, id, value) {
  const store = ctx.state.exploration.effectStateByCycle ||= {};
  (store.c5 ||= {})[`c5:${id}:8`] = value;
}
function prepare(ctx) {
  return pursuit.prepareOperation(ctx, { dayOf: () => 8 }, {
    record: clone(ctx.record), automation: clone(ctx.automation), shape: {},
  });
}

test('Spatial Distortion EB2686 has no symbol; Spatial Anomaly EB2685 has one', () => {
  // Independently read from the original 10343/10344 card faces, including
  // their different printed card codes and black corner numbers (35 vs 34).
  const distortion = prepare(fixture(['10343']));
  assert.equal(distortion.ok, true);
  assert.equal(distortion.event.pursuit.total, 0);
  assert.equal(distortion.mapState, undefined);
  const anomaly = prepare(fixture(['10344']));
  assert.equal(anomaly.ok, true);
  assert.equal(anomaly.event.pursuit.total, 1);
  assert.equal(anomaly.mapState.cycles.c5.titanXTrackPosition, 6);
});

test('both Allied Ignore rows suppress only their own printed symbol, starting at diplomacy eight', () => {
  for (const id of ['10326', '10327']) {
    for (const [value, expected] of [[-10, 1], [-5, 1], [0, 1], [4, 1], [7, 1], [8, 0], [10, 0]]) {
      const ctx = fixture([id]);
      ctx.record.diplomacy['c5-outcastVanguard'] = String(value);
      const counted = pursuit.countMarkers(ctx);
      assert.equal(counted.total, expected, `${id} diplomacy ${value}`);
      assert.equal(counted.cards[0].printed, 1, 'the inventory records the physical symbol even when ignored');
      assert.equal(counted.cards[0].ignored, 1 - expected);
      assert.equal(counted.unresolved.length, 0);
    }
  }
  const ctx = fixture(['10326', '10327', '10344']);
  const result = prepare(ctx);
  assert.equal(result.event.pursuit.total, 1, 'two ignores do not cancel another card');
  assert.equal(result.mapState.cycles.c5.titanXTrackPosition, 6);
  ctx.mapState.cycles.c5.titanXTrackPosition = null;
  assert.equal(prepare(ctx).event.pursuit.mode, 'none', 'ignored symbols cannot cause a spawn');
});

test('missing diplomacy blocks settlement; an unrelated Allied faction never grants an ignore', () => {
  for (const value of [undefined, null, '', true, 'bad', '11']) {
    const ctx = fixture(['10326']);
    ctx.record.diplomacy['c5-outcastVanguard'] = value;
    ctx.record.diplomacy['c5-cycladeanProtectorate'] = '10';
    assert.equal(pursuit.plan(ctx).code, 'PURSUIT_CONDITION_REQUIRED', String(value));
  }
  const ctx = fixture(['10326']);
  ctx.record.diplomacy['c5-outcastVanguard'] = '7';
  ctx.record.diplomacy['c5-cycladeanProtectorate'] = '10';
  assert.equal(pursuit.countMarkers(ctx).total, 1);
});

test('overlapping factions require the same per-card choice as ordinary exploration settlement', () => {
  const ctx = fixture(['10326', '10327'], ['outcastVanguard', 'cycladeanProtectorate']);
  ctx.record.diplomacy['c5-cycladeanProtectorate'] = '0';
  assert.equal(pursuit.plan(ctx).code, 'PURSUIT_CONDITION_REQUIRED');
  localState(ctx, '10326', { choices: { diplomacyFaction: 'outcastVanguard' } });
  localState(ctx, '10327', { choices: { diplomacyFaction: 'cycladeanProtectorate' } });
  const counted = pursuit.countMarkers(ctx);
  assert.equal(counted.unresolved.length, 0);
  assert.equal(counted.total, 1);
  localState(ctx, '10327', { choices: { diplomacyFaction: 'followersOfArete' } });
  assert.equal(pursuit.plan(ctx).code, 'PURSUIT_CONDITION_REQUIRED');
});

test('frozen card diplomacy and authoritative record receipts agree with the other card effects', () => {
  const frozen = { diplomacyFaction: 'outcastVanguard', diplomacy: [{ id: 'outcastVanguard', bonus: 2 }] };
  const ctx = fixture(['10326']);
  ctx.record.diplomacy['c5-outcastVanguard'] = '0';
  localState(ctx, '10326', { context: frozen });
  assert.equal(pursuit.countMarkers(ctx).total, 0);
  ctx.record.explorationBatchReceipts = { 'c5:10326:audit-draw': {
    context: { ...frozen, diplomacy: [{ id: 'outcastVanguard', bonus: 0 }] },
  } };
  assert.equal(pursuit.countMarkers(ctx).total, 1, 'the current receipt wins over stale local context');
  delete ctx.record.explorationBatchReceipts;
  delete ctx.state.exploration.effectStateByCycle;
  ctx.state.exploration.settledByCycle = { c5: { 'c5:10326:8': { context: frozen } } };
  assert.equal(pursuit.countMarkers(ctx).total, 0, 'legacy saved resource context remains usable');
});

test('known unaffiliated tiles retain the symbol; unknown map factions remain unresolved', () => {
  const ctx = fixture(['10326'], ['none']);
  assert.equal(pursuit.countMarkers(ctx).total, 1);
  assert.equal(pursuit.countMarkers(ctx).unresolved.length, 0);
  delete ctx.mapTags;
  assert.equal(pursuit.plan(ctx).code, 'PURSUIT_CONDITION_REQUIRED');
  ctx.state.mapSnapshot = { cycleId: 'c5', currentTileId: '001', currentTileFactions: ['outcastVanguard'] };
  assert.equal(pursuit.countMarkers(ctx).total, 0, 'matching map snapshots support standalone contexts');
  ctx.state.mapSnapshot.currentTileId = '002';
  assert.equal(pursuit.plan(ctx).code, 'PURSUIT_CONDITION_REQUIRED', 'a stale snapshot cannot select another tile faction');
});

test('all twelve Resolve/Ignore pursuit instructions are managed, without swallowing Paranoia effects', () => {
  const source = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/exploration-card-resources.js'), 'utf8'), source);
  const rows = Object.values(source.window.ATO_EXPLORATION_CARD_RESOURCES.cards).flatMap(card =>
    (card.manual || []).flatMap((row, index) => /resolve.*(?:Cackle|beast.head)|ignore\s+ICON\(/i.test(row.text)
      ? [{ key: card.key, index }] : []));
  assert.equal(rows.length, 12);
  for (const row of rows) assert.ok(pursuit.manualIndexes(row).includes(row.index), `${row.key}/${row.index}`);
  for (const id of ['10326', '10327']) assert.deepEqual(pursuit.manualIndexes({ key: `c5:${id}` }), [0]);
});

test('conditional marker totals match the independently transcribed badges, including both sides of Debt OR Fate', () => {
  const conditions = require('../assets/exploration-card-conditions.js');
  const source = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/exploration-card-resources.js'), 'utf8'), source);
  const cards = Object.values(source.window.ATO_EXPLORATION_CARD_RESOURCES.cards).filter(card =>
    card.manual.some(row => /resolve.*(?:Cackle|beast.head)/i.test(row.text) && row.badge));
  assert.equal(cards.length, 9);
  for (const card of cards) {
    const row = card.manual.find(row => /resolve.*(?:Cackle|beast.head)/i.test(row.text));
    const condition = conditions.conditionFromBadge(row.badge, card.cycleId);
    assert.ok(condition, card.key);
    for (const fate of [0, 5, 6, 7, 8, 12, null]) for (const babelianDebt of [0, 3, 4, null]) {
      const ctx = { cycleId: card.cycleId,
        record: { cycle: card.cycleId, cycleStats: { [card.cycleId]: { fate, babelianDebt } } },
        state: { exploration: { drawStateByCycle: { [card.cycleId]: { activePiles: [[{ id: card.cardId }], []] } } } } };
      const expected = conditions.conditionMet(condition, { cycleId: card.cycleId, stats: { fate, babelianDebt } });
      const counted = pursuit.countMarkers(ctx);
      assert.equal(counted.cards[0].extra, expected === true ? 1 : 0, `${card.key} fate ${fate}, debt ${babelianDebt}`);
      assert.equal(counted.unresolved.length, expected === null ? 1 : 0, card.key);
    }
  }
});
