const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'map/map-data.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'map/nemesis-path.js'), 'utf8'), context);
const rules = context.window.ATO_NEMESIS_PATH;

function fixture(cycleId, currentTile) {
  const cycle = context.window.ATO_MAP_DATA.cycles.find((item) => item.id === cycleId);
  const cycleState = {
    currentTile,
    explored: Object.fromEntries(cycle.tiles.map((tile) => [tile.id, true])),
    previewRevealed: {},
    tileVariants: {},
    tokens: { AD: '', markers: {} },
  };
  return { cycle, cycleState };
}

test('Cycle 2 pursuit chooses the map module vertical route on equal paths', () => {
  const { cycle, cycleState } = fixture('c2', '011');
  assert.equal(rules.shortestPath(cycle, cycleState, '001', '011')[1], '009');
});

test('spawn uses exactly four placed steps and returns every eligible tile for player choice', () => {
  const { cycle, cycleState } = fixture('c2', '001');
  assert.deepEqual(Array.from(rules.spawnCandidates(cycle, cycleState), (tile) => tile.id),
    ['005', '012', '018', '024', '030']);
  const chosen = rules.spawnCandidates(cycle, cycleState)[0].id;
  cycleState.explored = { '001': true, [chosen]: true };
  assert.deepEqual(Array.from(rules.spawnCandidates(cycle, cycleState)), []);
});

test('pursuit can cross a tile revealed by a scout marker', () => {
  const { cycle, cycleState } = fixture('c2', '003');
  cycleState.explored = { '001': true, '003': true };
  assert.deepEqual(Array.from(rules.shortestPath(cycle, cycleState, '001', '003')), []);
  cycleState.tokens.markers['002'] = { hs: true };
  assert.deepEqual(Array.from(rules.shortestPath(cycle, cycleState, '001', '003')),
    ['001', '002', '003']);
});

test('the map and dashboard both load and call the shared nemesis rules', () => {
  const dashboard = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mapPage = fs.readFileSync(path.join(root, 'map/index.html'), 'utf8');
  const mapApp = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8');
  assert.match(dashboard, /<script src="\.\/map\/nemesis-path\.js/);
  assert.match(mapPage, /<script src="\.\/nemesis-path\.js/);
  for (const code of [dashboard, mapApp]) {
    assert.match(code, /ATO_NEMESIS_PATH\.shortestPath/);
    assert.match(code, /ATO_NEMESIS_PATH\.spawnCandidates/);
  }
});
