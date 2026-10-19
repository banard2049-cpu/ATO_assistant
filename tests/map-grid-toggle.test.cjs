const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8').replace(/\r\n/g, '\n');
const mapHtml = fs.readFileSync(path.join(root, 'map/index.html'), 'utf8').replace(/\r\n/g, '\n');
const mapStyles = fs.readFileSync(path.join(root, 'map/styles.css'), 'utf8').replace(/\r\n/g, '\n');
const campaignApi = fs.readFileSync(path.join(root, 'api/campaign-state.php'), 'utf8').replace(/\r\n/g, '\n');

function functionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  return appSource.slice(start, appSource.indexOf('\nfunction ', start + 1));
}

function stateHarness() {
  const sandbox = {
    window: { location: { search: '' } },
    URLSearchParams,
    cycleIds: ['c1', 'c2'],
    edgeDirections: ['up', 'right', 'down', 'left'],
    mapData: { cycles: [{ id: 'c1', tiles: [] }, { id: 'c2', tiles: [] }] },
    tokenAssetById: {},
    argoTileId: () => '',
    normalizeTitanXTrackPosition: () => null,
    normalizeTokens: () => ({ AG: '', AD: '', hsCount: 0, markers: {}, edgeMarkers: {} }),
    tokenAvailableInCycle: () => true,
    normalizeMapZoom: (value) => Number(value) || 100,
  };
  vm.createContext(sandbox);
  for (const name of ['isPlainObject', 'defaultCycleState', 'createDefaultState', 'normalizeState']) {
    vm.runInContext(functionSource(name), sandbox, { filename: 'map/app.js' });
  }
  return sandbox;
}

test('the grid starts hidden and only follows an explicit saved setting', () => {
  const sandbox = stateHarness();
  assert.equal(sandbox.createDefaultState().showGrid, false);
  assert.equal(sandbox.normalizeState({}).showGrid, false);
  assert.equal(sandbox.normalizeState({ showGrid: true }).showGrid, true);
});

test('the map toolbar exposes a 显示网格 checkbox wired to the grid overlay', () => {
  assert.match(mapHtml, /<label class="check-label">\s*<input id="showGridToggle" type="checkbox">\s*显示网格\s*<\/label>/);
  assert.match(appSource, /showGridToggle: document\.querySelector\("#showGridToggle"\)/);
  assert.match(appSource, /if \(state\.showGrid\) \{\n\s+const gridOverlay = document\.createElement\("div"\);[\s\S]*?map-grid-overlay/);
  assert.match(appSource, /setProperty\("--map-cols"/);
  assert.match(appSource, /elements\.showGridToggle\.addEventListener\("change"[\s\S]*?state\.showGrid = elements\.showGridToggle\.checked/);
});

test('the grid overlay draws one line per layout cell and stays out of the way', () => {
  assert.match(mapStyles, /\.map-grid-overlay \{[\s\S]*?pointer-events: none;[\s\S]*?background-size:[\s\S]*?--map-cols[\s\S]*?--map-rows/);
});

test('the second screen receives the grid setting with the other map display options', () => {
  assert.match(campaignApi, /'showGrid' => \(bool\) \(\$mapState\['showGrid'\] \?\? false\)/);
});
