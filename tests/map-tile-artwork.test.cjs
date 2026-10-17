const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'map/tile-artwork.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8').replace(/\r\n/g, '\n');
const noop = () => {};

function harness(initial = null, blocked = false) {
  const stored = new Map(initial === null ? [] : [['ato-map-artwork-v1', initial]]);
  const listeners = {};
  const writes = [];
  const window = { localStorage: {
    getItem(key) { if (blocked) throw Error('storage disabled'); return stored.get(key) || null; },
    setItem(key, value) { if (blocked) throw Error('storage disabled'); writes.push(key); stored.set(key, value); },
  }, addEventListener(name, callback) { listeners[name] = callback; } };
  const context = vm.createContext({ window });
  vm.runInContext(fs.readFileSync(path.join(root, 'map/tile-artwork-data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'map/tile-back-data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'map/map-data.js'), 'utf8'), context);
  vm.runInContext(source, context);
  function control() { return { listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } }; }
  const controls = { icons: control(), changes: 0 };
  window.ATO_MAP_ARTWORK.attachControls({ ...controls, onChange() { controls.changes++; } });
  return { context, window, api: window.ATO_MAP_ARTWORK, controls, stored, listeners, writes };
}

test('HD registry covers every legacy playable front, C1 variant and both C5 faces', () => {
  const { window, api } = harness();
  const before = JSON.stringify(window.ATO_MAP_DATA);
  let faces = 0;
  for (const cycle of window.ATO_MAP_DATA.cycles) {
    for (const tile of cycle.tiles) {
      assert.ok(api.resolve(tile.front), `${cycle.id}/${tile.id}`);
      faces++;
      if (cycle.id === 'c5') { assert.ok(api.resolve(tile.back)); faces++; }
      else assert.equal(api.resolve(tile.back), null, 'unrevealed backs retain their printed legacy asset');
    }
  }
  for (const id of ['009', '013', '014', '018', '022', '023', '035']) {
    assert.ok(api.resolve(`./images/c1-tile-${id}-alt-front.jpg`)); faces++;
  }
  assert.equal(faces, 511);
  assert.equal(JSON.stringify(window.ATO_MAP_DATA), before);
  assert.match(api.resolve('./images/c5-tile-040-front.png').base, /c5-tile-040-front\.png$/);
  assert.match(api.resolve('./images/c5-tile-040-back.png').base, /c5-tile-040-back\.png$/);
});

test('combined mask exposes the unmarked base without touching campaign storage', () => {
  const { api, controls, writes } = harness();
  const src = './images/c2-tile-038-front.jpg';
  assert.equal((api.markup(src, '038').match(/<img /g) || []).length, 2);
  controls.icons.checked = false;
  controls.icons.listeners.change();
  const base = api.markup(src, '038');
  assert.equal((base.match(/<img /g) || []).length, 1);
  assert.match(base, /hd1024\/base\//);
  assert.doesNotMatch(base, /hd1024\/overlay\//);
  controls.icons.checked = true; controls.icons.listeners.change();
  assert.match(api.markup(src, '038'), /hd1024\/overlay\//);
  assert.ok(writes.every((key) => key === 'ato-map-artwork-v1'));
});

test('artwork selection is automatic even after saving the old legacy preference', () => {
  const { api, controls, stored } = harness(JSON.stringify({ mode: 'legacy', showIcons: false }));
  assert.match(api.markup('./images/c1-tile-001-front.jpg', '001'), /hd1024\/base\//);
  assert.equal(controls.icons.checked, false);
  const legacySource = './images/unregistered-tile.jpg';
  assert.match(api.markup(legacySource, 'unknown'), /src="\.\/images\/unregistered-tile.jpg"/);
  controls.icons.checked = true;
  controls.icons.listeners.change();
  assert.deepEqual(JSON.parse(stored.get('ato-map-artwork-v1')), { showIcons: true });
});

test('missing optional HD assets fall back to an intact legacy face and stop retrying', () => {
  const { api } = harness();
  let onError;
  api.bind({ addEventListener(name, fn, capture) { assert.equal(name, 'error'); assert.equal(capture, true); onError = fn; } });
  const stack = { dataset: { artworkKey: 'c5-tile-050-front', legacySrc: './images/c5-tile-050-front.png', artworkLabel: '050' } };
  onError({ target: { closest: () => stack } });
  assert.match(stack.innerHTML, /src="\.\/images\/c5-tile-050-front.png"/);
  assert.doesNotMatch(stack.innerHTML, /hd1024/);
  assert.doesNotMatch(api.markup(stack.dataset.legacySrc, '050'), /hd1024/);
  assert.match(api.markup('./images/c5-tile-040-front.png', '040'), /hd1024/);
  onError({ target: { closest: () => stack } }); // legacy error must not recurse
  assert.match(stack.innerHTML, /050/);
});

test('preferences restore safely and synchronize with the second screen', () => {
  const { api, controls, stored, listeners } = harness('broken JSON');
  assert.equal(controls.icons.checked, true);
  stored.set('ato-map-artwork-v1', JSON.stringify({ mode: 'legacy', showIcons: false }));
  listeners.storage({ key: 'ato-map-artwork-v1' });
  assert.equal(controls.icons.checked, false);
  assert.match(api.markup('./images/c1-tile-001-front.jpg', '001'), /hd1024\/base\//);
  assert.doesNotMatch(api.markup('./images/c1-tile-001-front.jpg', '001'), /hd1024\/overlay\//);
  listeners.storage({ key: 'ato-map-state-v2' });
  assert.equal(controls.changes, 1);
  const blocked = harness(null, true);
  blocked.controls.icons.checked = false;
  assert.doesNotThrow(() => blocked.controls.icons.listeners.change());
  assert.match(blocked.api.markup('./images/c1-tile-001-front.jpg', '<&"'), /&lt;&amp;&quot;/);
});

test('previous two-layer display preferences migrate without changing campaign data', () => {
  assert.equal(harness(JSON.stringify({ local: false, neighbors: false })).controls.icons.checked, false);
  assert.equal(harness(JSON.stringify({ local: false, neighbors: true })).controls.icons.checked, true);
});

function renderHarness(cycleId, explored, variant, showBack = false) {
  const h = harness();
  const cycle = h.window.ATO_MAP_DATA.cycles.find((x) => x.id === cycleId);
  const tile = cycle.tiles.find((x) => x.id === (cycleId === 'c1' ? '009' : '040'));
  const cycleState = { explored: explored ? { [tile.id]: true } : {}, tokens: {}, tileVariants: variant ? { [tile.id]: 'alternate' } : {} };
  const grid = { style: { setProperty: noop }, appendChild(fragment) { this.children = fragment.children; } };
  Object.assign(h.context, {
    state: { activeCycleId: cycleId, query: '', mapZoom: 100, showBack },
    activeCycle: () => ({ ...cycle, tiles: [tile] }), activeCycleState: () => cycleState,
    elements: { tileGrid: grid }, pendingAdversarySpawnCandidates: new Set(),
    argoTileId: () => '', displayLayout: () => ({ tileWidth: 1, width: 2, height: 2, position: () => ({ x: 0, y: 0 }) }),
    tilePreviewRevealedByMarker: () => false, tilePreviewRevealLabels: () => [],
    getTileTokens: () => [], getTileEdgeTokens: () => [], tileTooltip: () => '',
    renderVariantToggle: () => '', renderTileNoteMarker: () => '', renderTileTokens: () => '',
    renderTileEdgeTokens: () => '', renderAdjacencyLabels: () => '', renderSummary: noop,
    escapeHtml: (value) => value,
    c1AlternateTileAssets: { '009': { front: './images/c1-tile-009-alt-front.jpg', back: './images/c1-tile-009-alt-back.jpg' } },
    document: {
      createDocumentFragment: () => ({ children: [], appendChild(node) { this.children.push(node); } }),
      createElement: () => ({ dataset: {}, style: {} }),
    },
  });
  for (const name of ['tileAssets', 'renderTiles']) {
    vm.runInContext(app.match(new RegExp('^function ' + name + '\\([^]*?^}', 'm'))[0], h.context);
  }
  h.context.renderTiles();
  return { html: grid.children[0].innerHTML, cycleState };
}

test('C5 unknown/back covers never expose HD artwork; old face selections stay unchanged', () => {
  for (const variant of [false, true]) {
    for (const [explored, showBack] of [[false, false], [true, true]]) {
      const { html } = renderHarness('c5', explored, variant, showBack);
      assert.match(html, /tile-blue-cover/);
      assert.doesNotMatch(html, /hd1024/);
    }
    const { html, cycleState } = renderHarness('c5', true, variant);
    assert.match(html, new RegExp('hd1024/base/c5-tile-040-' + (variant ? 'back' : 'front') + '\\.png'));
    assert.equal(cycleState.explored['040'], true);
    assert.equal(cycleState.tileVariants['040'], variant ? 'alternate' : undefined);
  }
  assert.match(renderHarness('c1', true, true).html, /hd1024\/base\/c1-tile-009-alt-front\.png/);
  assert.match(renderHarness('c1', false, true).html, /card-backs\/numbers\/c1-tile-009-alt-back-instruction\.png/);
});

test('C1-C3 share exactly three backs and keep printed numbers visible with icons on or off', () => {
  const h = harness();
  assert.equal(Object.keys(h.window.ATO_MAP_BACK_DATA.backs).length, 270);
  assert.deepEqual(Object.keys(h.window.ATO_MAP_BACK_DATA.bases).sort(), ['c1', 'c2', 'c3']);
  for (const showIcons of [true, false]) {
    h.controls.icons.checked = showIcons; h.controls.icons.listeners.change();
    const html = h.api.markup('./images/c2-tile-038-back.png', '038');
    assert.match(html, /card-backs\/c2-base\.png/);
    assert.match(html, /card-backs\/numbers\/c2-tile-038-back\.png/);
    assert.doesNotMatch(html, /hd1024/);
  }
  assert.equal(h.api.resolveBack('./images/c4-tile-001-back.png'), null);
  assert.equal(h.api.resolveBack('./images/c5-tile-001-back.png'), null);
  assert.match(h.api.markup('./images/c1-tile-009-alt-back.jpg', '009'), /-instruction\.png/);
  assert.equal(Object.values(h.window.ATO_MAP_BACK_DATA.backs).filter(r=>r.pieces.length===2).length, 7);
});

test('an older asset pack can fall back to its original card back; missing both keeps a readable number', () => {
  const h=harness();let onError;
  h.api.bind({addEventListener(_name,handler){onError=handler;}});
  const stack={dataset:{artworkKey:'c2-tile-038-back',cardBack:'true',legacySrc:'./images/c2-tile-038-back.png',artworkLabel:'038'}};
  onError({target:{closest:()=>stack}});
  assert.match(stack.innerHTML,/src="\.\/images\/c2-tile-038-back.png"/);
  assert.match(h.api.markup(stack.dataset.legacySrc,'038'),/data-artwork-fallback="true"/);
  onError({target:{closest:()=>stack}});
  assert.match(stack.innerHTML,/tile-back-fallback/);
  assert.match(h.api.markup(stack.dataset.legacySrc,'038'),/>038<\/span>/);
  assert.doesNotMatch(h.api.markup(stack.dataset.legacySrc,'038'),/<img/);
});
