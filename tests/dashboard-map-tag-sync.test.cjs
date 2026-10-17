const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const mapSource = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const data = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'map/map-tile-tags.js'), 'utf8'), data);
vm.runInNewContext(fs.readFileSync(path.join(root, 'map/map-data.js'), 'utf8'), data);
const tags = clone(data.window.ATO_MAP_TILE_TAGS);
const cycles = clone(data.window.ATO_MAP_DATA.cycles);

function fn(source, name) {
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}

function savedCycle(tileId) {
  return { currentTile: tileId, latestRevealedTile: tileId, explored: { [tileId]: true }, tileVariants: {},
    tokens: { AG: tileId, AD: '', hsCount: 0, markers: {}, edgeMarkers: {} } };
}

function harness() {
  const calls = { save: 0, render: 0 };
  const ctx = vm.createContext({ window: { ATO_MAP_TILE_TAGS: tags }, state: {
    mapCurrentTileTags: ['calamity'], mapCurrentTileFactions: ['obsolete'],
    mapCurrentTileHasLastCityMarker: true, mapCurrentTileIsLatestRevealed: false,
    mapSnapshot: { currentTileTags: ['calamity'], currentTileFactions: ['obsolete'] },
  }, isPlainObject: value => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  saveState() { calls.save++; }, renderFlow() { calls.render++; } });
  const labels = html.match(/^    const mapFactionLabelsByCycle = \{[^]*?^    };/m);
  vm.runInContext(labels[0], ctx);
  for (const name of ['mapCommandTileEntry', 'syncMapCommandLandmarks', 'syncDashboardMapSnapshot']) {
    if (html.includes(`function ${name}(`)) vm.runInContext(fn(html, name), ctx);
  }
  return { ctx, calls };
}

test('dashboard movement replaces the previous tile tags, faction and reveal status', () => {
  const { ctx, calls } = harness();
  const cycle = cycles.find(item => item.id === 'c4');
  const saved = savedCycle('005');
  ctx.syncDashboardMapSnapshot('c4', cycle, saved);
  assert.deepEqual(clone(ctx.state.mapCurrentTileTags), ['progress']);
  assert.deepEqual(clone(ctx.state.mapCurrentTileFactions), ['aristotelians']);
  assert.deepEqual(clone(ctx.state.mapLatestRevealedTileTags), ['progress']);
  assert.equal(ctx.state.mapSnapshot.latestRevealedTileId, '005');
  assert.equal(ctx.state.mapCurrentTileIsLatestRevealed, true);
  assert.equal(ctx.state.mapCurrentTileHasLastCityMarker, false);
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
});

test('every dashboard tile and Cycle V face uses its own tags and inherits only missing faction data', () => {
  const { ctx } = harness();
  for (const cycle of cycles) for (const tile of cycle.tiles) {
    for (const face of cycle.id === 'c5' ? ['A', 'B'] : ['']) {
      const saved = savedCycle(tile.id);
      if (face === 'B') saved.tileVariants[tile.id] = 'alternate';
      ctx.syncDashboardMapSnapshot(cycle.id, cycle, saved);
      const base = tags.tiles[`${cycle.id}:${tile.id}`] || {};
      const specific = tags.tiles[`${cycle.id}:${tile.id}:${face}`] || {};
      const expected = { ...base, ...specific };
      assert.deepEqual(clone(ctx.state.mapCurrentTileTags), expected.tags || [], `${cycle.id}:${tile.id}:${face}`);
      assert.deepEqual(clone(ctx.state.mapCurrentTileFactions), specific.factions || base.factions || []);
      assert.equal(ctx.state.mapSnapshot.currentTileFace, face);
    }
  }
});

test('revisits retain the latest revealed tile and marker locations follow saved map state', () => {
  const { ctx } = harness();
  const cycle = cycles.find(item => item.id === 'c5');
  const saved = savedCycle('004');
  saved.latestRevealedTile = '005';
  saved.tokens.markers = { '004': { last_silver_ruin: true }, '005': { last_city: true } };
  ctx.syncDashboardMapSnapshot('c5', cycle, saved);
  assert.equal(ctx.state.mapCurrentTileIsLatestRevealed, false);
  assert.equal(ctx.state.mapSnapshot.lastCityTileId, '005');
  assert.equal(ctx.state.mapCurrentTileHasLastCityMarker, false);
  assert.equal(ctx.state.mapCurrentTileHasLastSilverRuinMarker, true);
  assert.deepEqual(clone(ctx.state.mapLatestRevealedTileTags), tags.tiles['c5:005:A'].tags);
  saved.currentTile = '';
  saved.latestRevealedTile = '';
  ctx.syncDashboardMapSnapshot('c5', cycle, saved);
  assert.deepEqual(clone(ctx.state.mapCurrentTileTags), []);
  assert.deepEqual(clone(ctx.state.mapCurrentTileFactions), []);
  assert.equal(ctx.state.mapCurrentTileIsLatestRevealed, false);
});

test('a saved map snapshot refreshes scout placement and notes alongside its marker list', () => {
  const { ctx } = harness();
  const cycle = cycles.find(item => item.id === 'c2');
  ctx.state.mapSnapshot = { scoutCount: 0, scoutTileId: 'OLD', scoutTileLabel: 'Old scout',
    tileNotes: [{ tileId: '001', tileLabel: '001', note: 'old note' }] };
  const saved = savedCycle('002');
  saved.tokens.hsCount = 1;
  saved.tokens.markers = { '001': { hs: true }, '002': { last_city: true } };
  saved.tileNotes = { '001': '  updated note  ', '002': '   ', CUSTOM: 'off-grid note' };
  ctx.syncDashboardMapSnapshot('c2', cycle, saved);
  assert.equal(ctx.state.mapSnapshot.scoutCount, 1);
  assert.equal(ctx.state.mapSnapshot.scoutTileId, '001');
  assert.equal(ctx.state.mapSnapshot.scoutTileLabel, cycle.tiles.find(tile => tile.id === '001').label);
  assert.deepEqual(clone(ctx.state.mapSnapshot.tileNotes), [
    { tileId: '001', tileLabel: cycle.tiles.find(tile => tile.id === '001').label, note: 'updated note' },
    { tileId: 'CUSTOM', tileLabel: 'CUSTOM', note: 'off-grid note' },
  ]);
  assert.ok(ctx.state.mapSnapshot.markers.includes('001:hs'));

  saved.tokens.hsCount = 0;
  delete saved.tokens.markers['001'];
  saved.tileNotes = {};
  ctx.syncDashboardMapSnapshot('c2', cycle, saved);
  assert.equal(ctx.state.mapSnapshot.scoutCount, 0);
  assert.equal(ctx.state.mapSnapshot.scoutTileId, '');
  assert.equal(ctx.state.mapSnapshot.scoutTileLabel, '');
  assert.deepEqual(clone(ctx.state.mapSnapshot.tileNotes), []);
  assert.ok(!ctx.state.mapSnapshot.markers.some(marker => marker.includes(':hs')));
});

test('dashboard departure markers match the map page on every tile and face', () => {
  const { ctx } = harness();
  const exclusion = mapSource.match(/^const lastCityExcludedTileIds = \{[^]*?^};/m)[0];
  const mapCtx = vm.createContext({ mapTagData: tags, tokenAssetById: Object.fromEntries(
    ['last_city', 'last_oasis', 'last_silver_ruin', 'c5_last_visited_underwater_city'].map(id => [id, {}])),
  state: {}, activeCycleState: () => mapCtx.saved });
  vm.runInContext(exclusion, mapCtx);
  for (const name of ['tileFaceId', 'tileTagEntry', 'tileTagIds', 'tileHasTag', 'isLastVisitedCityTile',
    'removeMarkerEverywhere', 'moveMarkerToTile', 'syncDepartedLandmarkMarkers']) {
    vm.runInContext(fn(mapSource, name), mapCtx);
  }
  assert.equal(typeof ctx.syncMapCommandLandmarks, 'function');
  for (const cycle of cycles) for (const tile of cycle.tiles) {
    for (const face of cycle.id === 'c5' ? ['A', 'B'] : ['']) {
      const saved = savedCycle(tile.id);
      if (face === 'B') saved.tileVariants[tile.id] = 'alternate';
      saved.tokens.markers.OLD = { last_city: true, last_oasis: true, last_silver_ruin: true,
        c5_last_visited_underwater_city: true, unrelated: true };
      mapCtx.state.activeCycleId = cycle.id;
      mapCtx.saved = clone(saved);
      mapCtx.syncDepartedLandmarkMarkers(mapCtx.saved, 'NEXT');
      ctx.syncMapCommandLandmarks(cycle.id, saved, 'NEXT');
      assert.deepEqual(clone(saved.tokens.markers), clone(mapCtx.saved.tokens.markers), `${cycle.id}:${tile.id}:${face}`);
    }
  }
});

test('legacy single edge directions remain readable in command snapshots', () => {
  const { ctx } = harness();
  const saved = savedCycle('006');
  saved.tokens.edgeMarkers = { '001': { sandstorm: 'up' }, '002': { sandstorm: ['left', 'invalid'] } };
  ctx.syncDashboardMapSnapshot('c4', cycles.find(cycle => cycle.id === 'c4'), saved);
  assert.deepEqual(clone(ctx.state.mapSnapshot.markers), ['001:sandstorm(上)', '002:sandstorm(左)']);
});

for (const command of ['move-argo', 'move-special']) test(`${command} saves the departed city's marker with the move`, async () => {
  const { ctx } = harness();
  const saved = savedCycle('001');
  const cycle = cycles.find(item => item.id === 'c2');
  const writes = [];
  Object.assign(ctx, { mapCommandBusy: false, cloneJson: clone,
    structureTechTarget: () => ({ profileId: 'original' }), assertStructureTechTarget() {},
    document: { querySelectorAll: () => [] },
    setMapCommandStatus(message, error) { if (error) throw new Error(message); },
    loadMapCommandState: async () => ({ state: saved, profileId: 'original' }),
    currentMapCommandCycle: () => ({ cycleId: 'c2', cycle, cycleState: saved }),
    mapDirectionalTarget: () => '002', currentC3SpecialTargets: () => ['002'],
    saveMapCommandState: async () => writes.push(clone(saved)), updateDashboardTitanXTrack() {},
  });
  vm.runInContext(fn(html, 'runMapCommand'), ctx);
  await ctx.runMapCommand(command, '002');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].currentTile, '002');
  assert.equal(writes[0].tokens.markers['001'].last_city, true);
  assert.equal(ctx.state.mapSnapshot.lastCityTileId, '001');
});

test('map commands update the technology map before rendering and refresh it in every cycle', async () => {
  for (const cycle of cycles) {
    const { ctx } = harness();
    const saved = savedCycle(cycle.tiles[0].id);
    const commandState = { state: { cycles: { [cycle.id]: saved } }, profileId: 'original' };
    let refreshed = 0;
    let renderedMap;
    Object.assign(ctx, { mapCommandBusy: false, cloneJson: clone,
      structureTechTarget: () => ({ profileId: 'original' }), assertStructureTechTarget() {},
      structureTechContext: { profileId: 'original', map: { cycles: {} } },
      getStructureTechContext: () => ctx.structureTechContext,
      refreshStructureTechContext: async () => { refreshed++; },
      document: { querySelectorAll: () => [] },
      setMapCommandStatus(message, error) { if (error) throw new Error(message); },
      loadMapCommandState: async () => commandState,
      currentMapCommandCycle: () => ({ cycleId: cycle.id, cycle, cycleState: saved }),
      saveMapCommandState: async () => {}, updateDashboardTitanXTrack() {},
      renderFlow: () => { renderedMap = clone(ctx.structureTechContext.map); },
    });
    vm.runInContext(fn(html, 'runMapCommand'), ctx);
    Object.assign(ctx, { mapDirectionalTarget: () => cycle.tiles[1].id });
    await ctx.runMapCommand(cycle.id === 'c5' ? 'spawn-nemesis' : 'move-argo');
    assert.ok(refreshed > 0, cycle.id);
    assert.deepEqual(renderedMap, clone(commandState.state), cycle.id);
    assert.deepEqual(clone(ctx.structureTechContext.mapState), clone(commandState.state), `${cycle.id}: negotiation context`);
  }
});

test('changing profile, cycle or session during a map request never writes its snapshot into the new target', async () => {
  for (const stage of ['read', 'save']) for (const change of ['profile', 'cycle', 'session']) {
    const { ctx } = harness();
    const saved = savedCycle('006');
    let activeCycle = 'c4';
    let writes = 0;
    let snapshots = 0;
    const errors = [];
    const switchTarget = () => {
      if (change === 'profile') ctx.archive.activeProfileId = 'other';
      if (change === 'cycle') activeCycle = 'c5';
      if (change === 'session') ctx.campaignSessionEpoch++;
    };
    Object.assign(ctx, { mapCommandBusy: false, cloneJson: clone,
      archive: { activeProfileId: 'original' }, campaignSessionEpoch: 1, sessionUser: { id: 'alice' },
      currentCycleConfig: () => ({ id: activeCycle }), ownsDashboardWriteLease: () => true,
      accountMismatchError: () => new Error('session changed'),
      document: { querySelectorAll: () => [] },
      setMapCommandStatus(message, error) { if (error) errors.push(message); },
      loadMapCommandState: async () => {
        if (stage === 'read') switchTarget();
        return { state: { cycles: { c4: saved } }, profileId: 'original' };
      },
      currentMapCommandCycle: () => ({ cycleId: 'c4', cycle: cycles.find(item => item.id === 'c4'), cycleState: saved }),
      mapDirectionalTarget: () => '005',
      saveMapCommandState: async () => { writes++; if (stage === 'save') switchTarget(); },
      syncDashboardMapSnapshot: () => snapshots++, updateDashboardTitanXTrack() {},
    });
    for (const name of ['structureTechTarget', 'assertStructureTechTarget', 'runMapCommand']) vm.runInContext(fn(html, name), ctx);
    await ctx.runMapCommand('move-argo');
    assert.equal(writes, stage === 'read' ? 0 : 1, `${stage}:${change}`);
    assert.equal(snapshots, 0, `${stage}:${change}`);
    assert.equal(errors.length, 1, `${stage}:${change}`);
    assert.equal(ctx.mapCommandBusy, false);
  }
});
