const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8').replace(/\r\n/g, '\n');

function functionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  return appSource.slice(start, appSource.indexOf('\nfunction ', start + 1));
}

const startTilesSource = appSource.match(/const alwaysVisibleStartTileIds = \{[^}]*\};/)?.[0];
assert.ok(startTilesSource, 'alwaysVisibleStartTileIds must stay a flat object literal');

const filterFunctions = [
  'effectiveTile', 'tilePreviewRevealLabels', 'tilePreviewRevealedByMarker',
  'tileConnectsTo', 'visibleTileIdsForUnknownFilter',
];

function harness(cycleId, cycleState) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of ['map/map-data.js', 'map/nemesis-path.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'), sandbox, { filename: file });
  }
  const cycle = vm.runInContext('window.ATO_MAP_DATA.cycles', sandbox).find(item => item.id === cycleId);
  assert.ok(cycle, `Missing cycle ${cycleId}`);
  sandbox.state = { activeCycleId: cycleId };
  sandbox.activeCycle = () => cycle;
  sandbox.activeCycleState = () => cycleState;
  vm.runInContext(startTilesSource, sandbox);
  for (const name of filterFunctions) vm.runInContext(functionSource(name), sandbox);
  return { visible: sandbox.visibleTileIdsForUnknownFilter(cycle, cycleState) };
}

function savedCycle(overrides = {}) {
  return {
    currentTile: '',
    explored: {},
    previewRevealed: {},
    tileNotes: {},
    tileVariants: {},
    tokens: { AG: '', AD: '', hsCount: 0, markers: {}, edgeMarkers: {} },
    ...overrides,
  };
}

test('a revealed but not yet explored tile displays the tiles you can walk to', () => {
  const { visible } = harness('c2', savedCycle({ previewRevealed: { '002': true } }));
  assert.equal(visible.has('002'), true, 'the revealed tile itself');
  assert.equal(visible.has('001'), true, 'left exit');
  assert.equal(visible.has('003'), true, 'right exit');
});

test('tiles that only touch the revealed tile (no walkable exit) stay hidden', () => {
  // C2 002 and 010 sit next to each other on the board, but neither lists the
  // other as a neighbour: the wall between them is closed, so you cannot walk.
  const { visible } = harness('c2', savedCycle({ previewRevealed: { '002': true } }));
  assert.equal(visible.has('010'), false, 'no path between 002 and 010');
  assert.equal(visible.has('011'), false, 'diagonal only');
  assert.equal(visible.has('084'), false, 'far from the revealed tile and the start tile');
});

test('moving Argo to a tile (current tile + reveal, as the app stores it) expands the walkable neighbours', () => {
  const { visible } = harness('c2', savedCycle({
    currentTile: '002',
    previewRevealed: { '002': true },
    tokens: { AG: '002', AD: '', hsCount: 0, markers: {}, edgeMarkers: {} },
  }));
  assert.equal(visible.has('002'), true);
  assert.equal(visible.has('001'), true);
  assert.equal(visible.has('003'), true);
  assert.equal(visible.has('010'), false, 'still no path through the wall');
});

test('a tile revealed by a token (scout / engine / night nymph) also expands its walkable surroundings', () => {
  const { visible } = harness('c2', savedCycle({ tokens: { AG: '', AD: '', hsCount: 1, markers: { '002': { hs: true } }, edgeMarkers: {} } }));
  assert.equal(visible.has('002'), true);
  assert.equal(visible.has('001'), true);
  assert.equal(visible.has('003'), true);
  assert.equal(visible.has('010'), false);
});

test('the setup start tiles are displayed but are not revealed, so they do not expand', () => {
  const { visible } = harness('c1', savedCycle());
  assert.equal(visible.has('027'), true, 'start tile stays visible');
  assert.equal(visible.has('T00'), true, 'start terrain tile stays visible');
  assert.equal(visible.has('022'), false, 'a start tile has not been revealed yet');
  assert.equal(visible.has('026'), false);
  assert.equal(visible.has('032'), false);
  assert.equal(visible.has('T01'), false);
  assert.equal(visible.has('T04'), false);
  assert.equal(visible.has('T05'), false);
  assert.equal(visible.has('T06'), false);
});

test('a revealed tile also displays walkable special-route endpoints', () => {
  // C3 010 links to 043 through SPECIAL_CYCLE_3.
  const { visible } = harness('c3', savedCycle({ previewRevealed: { '010': true } }));
  assert.equal(visible.has('011'), true, 'normal neighbour');
  assert.equal(visible.has('009'), true, 'normal neighbour');
  assert.equal(visible.has('043'), true, 'special route endpoint');
  assert.equal(visible.has('079'), false, 'unreachable distant tile stays hidden');
});

test('the cloud ship position is displayed without revealing or expanding the tile', () => {
  const { visible } = harness('c4', savedCycle({
    explored: { '029': true },
    tokens: { AG: '029', AD: '', hsCount: 0, markers: { '001': { c4_cloud_ship: true } }, edgeMarkers: {} },
  }));
  assert.equal(visible.has('001'), true, 'cloud ship location');
  assert.equal(visible.has('002'), false, 'the cloud ship does not reveal or expand its tile');
  assert.equal(visible.has('010'), false);
  assert.equal(visible.has('020'), true, 'walkable from the explored start tile');
});
