const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../map/app.js'), 'utf8').replace(/\r\n/g, '\n');
const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const tokenSource = source.slice(source.indexOf('const tokenAssets = ['), source.indexOf('const tokenMenuGroups = ['));
function extract(name) {
  const match = source.match(new RegExp('^function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function harness(cycleId = 'c1') {
  const saved = { currentTile: '001', explored: { '001': true }, previewRevealed: {}, tileVariants: {},
    tokens: { AG: '001', AD: '', hsCount: 0, markers: {}, edgeMarkers: {} } };
  const calls = { undo: 0, saves: 0, renders: 0, focus: 0, encounters: [] };
  const context = vm.createContext({
    state: { activeCycleId: cycleId, selectedToken: 'AG' },
    activeCycleState: () => saved,
    clearPendingAdversarySpawn() {},
    inheritCycleFiveTileFace() {},
    syncDepartedLandmarkMarkers() {},
    pushUndo: () => calls.undo++, saveState: () => calls.saves++, render: () => calls.renders++,
    focusArgoAfterNextRender: () => calls.focus++,
    triggerAdversaryBattle: () => calls.encounters.push({
      argo: saved.currentTile, marker: saved.tokens.AG, explored: saved.explored[saved.currentTile],
    }),
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
  });
  vm.runInContext([tokenSource, ...['normalizeMarkers', 'removeMarkerEverywhere', 'markTileRevealed', 'markTileExplored', 'placeToken'].map(extract)].join('\n'), context);
  return { context, saved, calls };
}

test('AG token entry into a nemesis tile triggers the encounter after moving and revealing in every cycle', () => {
  for (const cycleId of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const { context, saved, calls } = harness(cycleId);
    saved.tokens.AD = '002';
    context.placeToken('002');
    assert.deepEqual(calls.encounters, [{ argo: '002', marker: '002', explored: undefined }], cycleId);
    assert.equal(saved.previewRevealed['002'], true);
    assert.equal(saved.explored['002'], undefined);
    assert.equal(saved.latestRevealedTile, '002');
    assert.equal(calls.undo, 1);
    assert.equal(calls.saves, 0, 'the encounter owns saving before opening its battle');
  }
});

test('AG entry without a collision still saves and renders once', () => {
  const { context, saved, calls } = harness();
  saved.tokens.AD = '003';
  context.placeToken('002');
  assert.deepEqual(calls.encounters, []);
  assert.equal(calls.saves, 1);
  assert.equal(calls.renders, 1);
  assert.equal(calls.focus, 1);
  assert.equal(saved.currentTile, '002');
});

test('each last-visited marker moves independently instead of duplicating on manual placement', () => {
  const { context, saved } = harness();
  const markerIds = ['last_city', 'last_oasis', 'last_silver_ruin', 'c5_last_visited_underwater_city'];
  for (const id of markerIds) {
    context.state.selectedToken = id;
    context.placeToken('001');
    context.placeToken('002');
    assert.equal(saved.tokens.markers['001']?.[id], undefined, id);
    assert.equal(saved.tokens.markers['002'][id], true, id);
  }
  assert.deepEqual(Object.keys(saved.tokens.markers['002']).sort(), markerIds.sort());
  context.placeToken('002');
  assert.equal(saved.tokens.markers['002'].c5_last_visited_underwater_city, undefined);
  assert.equal(saved.tokens.markers['002'].last_city, true);
});

test('loading duplicate last-visited markers retains one placement and preserves other markers', () => {
  const { context } = harness();
  for (const id of ['last_city', 'last_oasis', 'last_silver_ruin', 'c5_last_visited_underwater_city']) {
    const normalized = context.normalizeMarkers({ '001': { [id]: true, c5_ruin: true }, '002': { [id]: true, c5_ruin: true } });
    assert.equal(normalized['001'][id], true, id);
    assert.equal(normalized['002'][id], undefined, id);
    assert.equal(normalized['001'].c5_ruin, true);
    assert.equal(normalized['002'].c5_ruin, true);
  }
});

test('next day settles the tile under Argo from revealed to explored once', async () => {
  const match = dashboardSource.match(/^    async function settleMapExplorationForNextDay\([^]*?^    }/m);
  assert.ok(match, 'index.html must define settleMapExplorationForNextDay');
  const cycleState = {
    currentTile: '030', explored: {}, previewRevealed: { '030': true },
    latestRevealedTile: '030', exploredDays: { '030': 10 },
    tokens: { AG: '030', AD: '', hsCount: 0, markers: {}, edgeMarkers: {} },
  };
  let savedState = null;
  const context = vm.createContext({
    structureTechTarget: () => ({ profileId: 'chosen', cycleId: 'c3', day: 10 }),
    assertStructureTechTarget() {},
    loadMapCommandState: async () => ({ state: { activeCycleId: 'c3', cycles: { c3: cycleState } }, revision: 3, profileId: 'chosen' }),
    cloneJson: value => JSON.parse(JSON.stringify(value)),
    currentMapCommandCycle: () => ({ cycleId: 'c3', cycle: { id: 'c3' }, cycleState }),
    saveMapCommandState: async (commandState) => { savedState = commandState.state; },
    getStructureTechContext: () => null,
    structureTechContext: null,
    syncDashboardMapSnapshot() {},
    mapCycleDefinition: () => ({ id: 'c3' }),
  });
  vm.runInContext(match[0], context);
  assert.equal(await context.settleMapExplorationForNextDay(), true);
  assert.equal(cycleState.explored['030'], true);
  assert.equal(cycleState.previewRevealed['030'], undefined);
  assert.equal(cycleState.latestRevealedTile, '');
  assert.equal(cycleState.exploredDays['030'], 10, 'the reveal day is kept for the rule reminders');
  assert.equal(savedState.cycles.c3, cycleState);
  assert.equal(await context.settleMapExplorationForNextDay(), false, 'an already explored tile is not settled again');
  // A legacy save may keep `latestRevealedTile` on an explored tile; the day
  // transition clears it so the free-progress reminder stops after that day.
  cycleState.latestRevealedTile = '030';
  assert.equal(await context.settleMapExplorationForNextDay(), true);
  assert.equal(cycleState.latestRevealedTile, '');
});

test('a fresh reveal records the dashboard day, while revisits and legacy saves keep their state', () => {
  const { context } = harness('c1');
  vm.runInContext('campaignDays = { c1: 12 }', context);
  const fresh = { explored: {}, previewRevealed: {} };
  context.markTileRevealed(fresh, '002');
  assert.equal(fresh.exploredDays['002'], 12);
  assert.equal(fresh.previewRevealed['002'], true);
  assert.equal(fresh.explored['002'], undefined);
  vm.runInContext('campaignDays = { c1: 13 }', context);
  context.markTileRevealed(fresh, '002');
  assert.equal(fresh.exploredDays['002'], 12, 'a revisit keeps the original reveal day');
  const legacy = { explored: {}, previewRevealed: {} };
  vm.runInContext('campaignDays = {}', context);
  context.markTileRevealed(legacy, '003');
  assert.equal(legacy.exploredDays, undefined, 'no dashboard day means no stamp');
});
