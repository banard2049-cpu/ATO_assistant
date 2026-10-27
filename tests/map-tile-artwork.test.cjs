const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
// Private images arrive through .atopack and are absent from CI checkouts.
const hasPrivateMaps = fs.existsSync(path.join(root, 'map/images'));
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
  vm.runInContext(fs.readFileSync(path.join(root, 'map/c5-heading-data.js'), 'utf8'), context);
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

test('all overlays including special alternatives resolve directly to SVG', () => {
  const { api } = harness();
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const artwork = api.resolve(`./images/${cycle}-tile-001-front.png`);
    assert.equal(artwork.base, `./images/hd1024/base/${cycle}-tile-001-front.png`);
    assert.ok(artwork.overlay.startsWith(`./images/hd1024/overlay/${cycle}-tile-001-front-corners.svg?v=`));
    assert.equal(artwork.overlay, artwork.displayOverlay);
  }
  assert.ok(api.resolve('./images/c1-tile-009-alt-front.jpg').overlay.includes('c1-tile-009-alt-front-corners.svg'));
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

test('all 511 map faces including seven C1 alternatives use vector corners', () => {
  const { api, window } = harness();
  const data = window.ATO_MAP_ARTWORK_DATA;
  assert.equal(data.cornerVectorFiles.length, 511);
  assert.equal(new Set(data.cornerVectorFiles).size, 511);
  for (const key of data.files) {
    const source = `./images/${key}.png`;
    const art = api.resolve(source);
    assert.match(art.displayOverlay, new RegExp(`${key}-corners\\.svg\\?v=`));
    if (hasPrivateMaps) assert.ok(fs.existsSync(path.join(root, 'map', art.displayOverlay.split('?')[0])));
    assert.ok(api.markup(source, key).includes(art.displayOverlay));
  }
  assert.equal(data.files.filter(key => key.includes('-alt-')).length, 7);
  assert.match(api.headingMarkup('./images/c5-tile-040-front.png', '040'), /c5-tile-040-front-cover\.svg/);
  assert.doesNotMatch(api.headingMarkup('./images/c5-tile-040-front.png', '040'), /-corners\.svg/);
});

test('missing SVG mask tries the old PNG before falling back to the complete legacy map', () => {
  const { api } = harness();
  let onError;
  api.bind({ addEventListener(name, callback) { if (name === 'error') onError = callback; } });
  const source = './images/c3-tile-042-front.jpg';
  const stack = { dataset: { artworkKey: 'c3-tile-042-front', legacySrc: source, artworkLabel: '042' } };
  const target = { closest: () => stack, classList: { contains: name => name === 'tile-artwork-overlay' } };
  onError({ target });
  assert.equal(target.src, api.resolve(source).overlayFallback);
  assert.match(target.src, /hd1024\/overlay\/c3-tile-042-front\.png/);
  assert.equal(stack.innerHTML, undefined);
  assert.match(api.markup(source, '042'), /-corners\.svg/);
  onError({ target });
  assert.ok(stack.innerHTML.includes(source));
  assert.doesNotMatch(stack.innerHTML, /-corners\.svg|hd1024/);
  assert.doesNotMatch(api.markup(source, '042'), /-corners\.svg|hd1024/);
});

test('each fresh map stack retries current SVG after an older PNG pack was displayed', () => {
  const { api } = harness();
  let onError;
  api.bind({ addEventListener(_name, callback) { onError = callback; } });
  const source = './images/c1-tile-001-front.jpg';
  const oldStack = { dataset: { artworkKey: 'c1-tile-001-front', legacySrc: source } };
  const oldImage = { closest: () => oldStack, classList: { contains: () => true } };
  onError({ target: oldImage });
  assert.match(oldImage.src, /c1-tile-001-front\.png/);
  assert.match(api.markup(source, '001'), /src="[^\"]+-corners\.svg/);
  const newStack = { dataset: { artworkKey: 'c1-tile-001-front', legacySrc: source } };
  const newImage = { closest: () => newStack, classList: { contains: () => true } };
  onError({ target: newImage });
  assert.equal(newImage.src, oldImage.src);
});

test('an older registry can use a current SVG when its PNG mask is missing', async () => {
  const c = vm.createContext({ window: { ATO_MAP_ARTWORK_DATA: { files: ['c1-tile-001-front'] } } });
  vm.runInContext(source, c);
  const api = c.window.ATO_MAP_ARTWORK;
  const artwork = api.resolve('./images/c1-tile-001-front.jpg');
  const attempts = [];
  const loaded = await api.loadOverlay(artwork, path => {
    attempts.push(path);
    if (path.endsWith('.png')) throw Error('missing old mask');
    return path;
  });
  assert.deepEqual(attempts, [artwork.overlay, artwork.overlayFallback]);
  assert.match(loaded, /-corners\.svg/);
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

function renderHarness(cycleId, explored, variant, showBack = false, argoVariant = variant) {
  const h = harness();
  const cycle = h.window.ATO_MAP_DATA.cycles.find((x) => x.id === cycleId);
  const tile = cycle.tiles.find((x) => x.id === (cycleId === 'c1' ? '009' : '040'));
  const cycleState = { explored: explored ? { [tile.id]: true } : {}, tokens: {}, tileVariants: variant ? { [tile.id]: 'alternate' } : {} };
  cycleState.currentTile = argoVariant === null ? '' : '001';
  if (argoVariant) cycleState.tileVariants['001'] = 'alternate';
  const grid = { style: { setProperty: noop }, appendChild(fragment) { this.children = fragment.children; } };
  Object.assign(h.context, {
    state: { activeCycleId: cycleId, query: '', mapZoom: 100, showBack },
    activeCycle: () => ({ ...cycle, tiles: [tile] }), activeCycleState: () => cycleState,
    elements: { tileGrid: grid }, pendingAdversarySpawnCandidates: new Set(),
    argoTileId: () => cycleState.currentTile, displayLayout: () => ({ tileWidth: 1, width: 2, height: 2, position: () => ({ x: 0, y: 0 }) }),
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
  return { get html() { return grid.children[0].innerHTML; }, cycleState, render: h.context.renderTiles };
}

test('C5 covers show the shared texture and vector label for Argo depth', () => {
  for (const variant of [false, true]) {
    for (const [explored, showBack] of [[false, false], [true, true]]) {
      const { html } = renderHarness('c5', explored, variant, showBack);
      assert.match(html, /tile-c5-cover/);
      assert.match(html, /card-backs\/c1-base\.png/);
      assert.match(html, /tile-c5-cover-heading/);
      assert.doesNotMatch(html, /hd1024\/base\//);
      assert.match(html, new RegExp('card-backs/vectors/c5-tile-040-' + (variant ? 'back' : 'front') + '-cover\\.svg'));
      assert.doesNotMatch(html, /hd1024\/overlay\//);
    }
    const { html, cycleState } = renderHarness('c5', true, variant);
    assert.match(html, new RegExp('hd1024/base/c5-tile-040-' + (variant ? 'back' : 'front') + '\\.png'));
    assert.equal(cycleState.explored['040'], true);
    assert.equal(cycleState.tileVariants['040'], variant ? 'alternate' : undefined);
  }
  assert.match(renderHarness('c1', true, true).html, /hd1024\/base\/c1-tile-009-alt-front\.png/);
  assert.match(renderHarness('c1', false, true).html, /card-backs\/numbers\/c1-tile-009-alt-back-instruction\.png/);
});

test('C5 covered factions and color follow Argo, without changing destination faces', () => {
  for (const argoSurface of [false, true]) {
    for (const destinationSurface of [false, true]) {
      for (const [explored, showBack] of [[false, false], [true, true]]) {
        const h = renderHarness('c5', explored, destinationSurface, showBack, argoSurface);
        assert.match(h.html, new RegExp(`data-c5-face="${argoSurface ? 'B' : 'A'}"`));
        assert.match(h.html, new RegExp(`c5-tile-040-${argoSurface ? 'back' : 'front'}-cover\\.svg`));
        assert.equal(h.cycleState.tileVariants['040'], destinationSurface ? 'alternate' : undefined);
      }
      const revealed = renderHarness('c5', true, destinationSurface, false, argoSurface);
      assert.match(revealed.html, new RegExp(`hd1024/base/c5-tile-040-${destinationSurface ? 'back' : 'front'}\\.png`));
      assert.doesNotMatch(revealed.html, /tile-c5-cover/);
    }
  }
  const h = renderHarness('c5', false, true, false, false);
  h.cycleState.tileVariants['001'] = 'alternate';
  h.render();
  assert.match(h.html, /data-c5-face="B"/);
  delete h.cycleState.tileVariants['001'];
  h.render();
  assert.match(h.html, /data-c5-face="A"/);
  assert.equal(h.cycleState.tileVariants['040'], 'alternate');
  assert.match(renderHarness('c5', false, true, false, null).html, /data-c5-face="A"/);
});

test('all 160 C5 covers reuse their own number and faction; revealed masks stay intact', () => {
  const h = harness();
  const geometry = h.window.ATO_C5_HEADING_DATA;
  assert.equal(Object.keys(geometry).length, 160);
  for (const [key, regions] of Object.entries(geometry)) {
    const source = `./images/${key}.png`;
    const heading = h.api.headingMarkup(source, key.slice(8, 11));
    assert.ok(heading.includes(regions.cover));
    assert.doesNotMatch(heading, /hd1024\/overlay/);
    assert.doesNotMatch(heading, /c5-face-[ab]\.png/);
    assert.doesNotMatch(h.api.markup(source, 'label'), /clip-path|tile-c5-heading/);
    assert.ok(regions.header[2] - regions.header[0] >= 260);
  }
  assert.ok(geometry['c5-tile-040-front'].header[0] < 100);
  assert.ok(geometry['c5-tile-050-front'].header[0] < 100);
  h.controls.icons.checked = false; h.controls.icons.listeners.change();
  assert.match(h.api.coverMarkup('./images/c5-tile-080-front.png', '080'), /tile-c5-heading/);
});

test('missing C5 cover assets fall back to a number and never to a revealed map', () => {
  const h = harness(); let onError;
  h.api.bind({ addEventListener(_name, callback) { onError = callback; } });
  const key = 'c5-tile-008-front-cover';
  const stack = { dataset: { artworkKey: key, cardCover: 'true', artworkLabel: '008' } };
  onError({ target: { closest: () => stack } });
  assert.match(stack.innerHTML, /tile-back-fallback/);
  assert.match(h.api.coverMarkup('./images/c5-tile-008-front.png', '008'), />008<\/span>/);
  assert.doesNotMatch(stack.innerHTML, /<img|<image|hd1024/);
});

test('C1-C3 recolor one base and C4 retains its own base with printed masks visible', () => {
  const h = harness();
  assert.equal(Object.keys(h.window.ATO_MAP_BACK_DATA.backs).length, 351);
  assert.deepEqual(Object.keys(h.window.ATO_MAP_BACK_DATA.bases).sort(), ['c1', 'c2', 'c3', 'c4']);
  assert.equal(new Set(Object.values(h.window.ATO_MAP_BACK_DATA.bases)).size, 2);
  for (const showIcons of [true, false]) {
    h.controls.icons.checked = showIcons; h.controls.icons.listeners.change();
    const html = h.api.markup('./images/c2-tile-038-back.png', '038');
    assert.match(html, /card-backs\/c1-base\.png/);
    assert.match(html, /class="tile-back-base"[^>]*style="filter:/);
    assert.doesNotMatch(html, /class="tile-back-piece"[^>]*filter:/);
    assert.match(html, /card-backs\/vectors\/c2-tile-038-back\.svg/);
    assert.doesNotMatch(html, /hd1024/);
  }
  assert.ok(h.api.resolveBack('./images/c4-tile-001-back.png'));
  assert.equal(h.api.resolveBack('./images/c5-tile-001-back.png'), null);
  assert.match(h.api.markup('./images/c1-tile-009-alt-back.jpg', '009'), /-instruction\.png/);
  assert.equal(Object.values(h.window.ATO_MAP_BACK_DATA.backs).filter(r=>r.image).length, 7);
  for (const id of ['009', '013', '014', '018', '022', '023', '035']) {
    const entry = h.window.ATO_MAP_BACK_DATA.backs[`c1-tile-${id}-alt-back`];
    assert.equal(entry.pieces.length, 1);
    assert.equal(entry.pieces[0].src, entry.image);
    if (hasPrivateMaps) assert.ok(fs.existsSync(path.join(root, 'map', entry.image)));
    const html = h.api.markup(`./images/c1-tile-${id}-alt-back.jpg`, id);
    assert.equal((html.match(/<img /g) || []).length, 1, `special back ${id} uses one complete image`);
    assert.match(html, new RegExp(`c1-tile-${id}-alt-back-instruction\\.png`));
    assert.doesNotMatch(html, /tile-back-piece|card-backs\/c1-base/);
  }
});

test('all C4 backs use the common scroll and their complete marker mask even with icons hidden', () => {
  const h = harness();
  for (const showIcons of [true, false]) {
    h.controls.icons.checked = showIcons; h.controls.icons.listeners.change();
    for (let number = 1; number <= 81; number++) {
      const id = String(number).padStart(3, '0');
      const source = `./images/c4-tile-${id}-back.png`;
      const back = h.api.resolveBack(source);
      assert.equal(back.pieces.length, 1);
      assert.equal(back.pieces[0].kind, 'markers');
      const html = h.api.markup(source, id);
      assert.equal((html.match(/<img /g) || []).length, 2);
      assert.match(html, /card-backs\/c4-base\.png\?v=/);
      assert.match(html, new RegExp(`card-backs/vectors/c4-tile-${id}-back\\.svg\\?v=`));
      assert.doesNotMatch(html, /hd1024|tile-artwork-fallback/);
    }
  }
  assert.match(renderHarness('c4', false, false).html, /card-backs\/c4-base/);
  assert.match(renderHarness('c4', true, false, true).html, /card-backs\/c4-base/);
  assert.match(renderHarness('c4', true, false).html, /hd1024\/base\/c4-tile-040-front/);
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
