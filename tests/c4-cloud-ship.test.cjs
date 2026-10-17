const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../map/app.js'), 'utf8').replace(/\r\n/g, '\n');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
}

function harness() {
  const cycleState = {
    currentTile: '029', explored: { '029': true }, previewRevealed: {},
    tokens: { AG: '029', AD: '', markers: {}, edgeMarkers: {} },
  };
  const context = vm.createContext({
    state: { activeCycleId: 'c4', selectedToken: 'c4_cloud_ship' },
    cycleState, alwaysVisibleStartTileIds: { c4: ['029'] },
    activeCycleState: () => cycleState,
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    clearPendingAdversarySpawn() {}, pushUndo() {}, saveState() {}, render() {},
    effectiveTile: tile => tile,
  });
  vm.runInContext(source.slice(source.indexOf('const tokenAssets = ['), source.indexOf('const tokenMenuGroups = [')), context);
  for (const name of ['placeToken', 'removeMarkerEverywhere', 'normalizeMarkers',
    'tilePreviewRevealLabels', 'tileConnectsTo', 'visibleTileIdsForUnknownFilter']) {
    vm.runInContext(functionSource(name), context);
  }
  return { context, cycleState };
}

test('Emir cloud ship moves as a single C4 marker without revealing or exploring either destination', () => {
  const { context, cycleState } = harness();
  const token = vm.runInContext('tokenAssetById.c4_cloud_ship', context);
  assert.equal(token.group, 'c4');
  assert.deepEqual(Array.from(token.cycles), ['c4']);

  context.placeToken('030');
  context.placeToken('031');
  assert.equal(cycleState.tokens.markers['030'], undefined);
  assert.equal(cycleState.tokens.markers['031'].c4_cloud_ship, true);
  assert.equal(cycleState.currentTile, '029');
  assert.equal(cycleState.tokens.AG, '029');
  assert.deepEqual(cycleState.explored, { '029': true });
  assert.deepEqual(cycleState.previewRevealed, {});
  assert.equal(context.tilePreviewRevealLabels('031', cycleState).length, 0);

  context.placeToken('031');
  assert.deepEqual(cycleState.tokens.markers, {});
});

test('hiding unknown tiles preserves the cloud ship location while keeping its face hidden', () => {
  const { context, cycleState } = harness();
  const cycle = { id: 'c4', tiles: [{ id: '029' }, { id: '030' }, { id: '031' }] };
  context.placeToken('031');
  const visible = context.visibleTileIdsForUnknownFilter(cycle, cycleState);
  assert.equal(visible.has('031'), true);
  assert.equal(visible.has('030'), false);
  assert.equal(context.tilePreviewRevealLabels('031', cycleState).length, 0);
  assert.equal(cycleState.explored['031'], undefined);
});

test('saved cloud ship marker keeps its existing ID and collapses duplicate placements', () => {
  const { context } = harness();
  const normalized = context.normalizeMarkers({
    '030': { c4_cloud_ship: true, c4_city_of_squalor: true },
    '031': { c4_cloud_ship: true, c4_city_of_squalor: true },
  });
  assert.equal(normalized['030'].c4_cloud_ship, true);
  assert.equal(normalized['031'].c4_cloud_ship, undefined);
  assert.equal(normalized['031'].c4_city_of_squalor, true);
});
