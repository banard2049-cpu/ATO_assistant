const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const frames = new Map();
  const listeners = new Map();
  const observers = [];
  let frameId = 0;
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const window = {
    getComputedStyle: image => image.computedStyle,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
    ResizeObserver: Observer, MutationObserver: Observer,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../aibp/panel-overlay.js'), 'utf8'), { window });
  const style = () => ({ setProperty(name, value) { this[name] = value; } });
  const host = { style: style() };
  const imageListeners = new Map();
  const image = {
    complete: true, naturalWidth: 2000, naturalHeight: 1000, src: 'first.jpg',
    clientWidth: 400, clientHeight: 400, clientLeft: 0, clientTop: 0,
    offsetLeft: 0, offsetTop: 0, offsetParent: host,
    computedStyle: { width: '400px', height: '400px', boxSizing: 'border-box', objectFit: 'contain' },
    addEventListener: (type, callback) => imageListeners.set(type, callback),
    removeEventListener: type => imageListeners.delete(type),
    // Geometry must remain in local coordinates even when the host is rotated.
    getBoundingClientRect() { throw new Error('viewport geometry must not be used'); },
  };
  const layer = { hidden: true, style: style() };
  const updates = [];
  const cleanup = window.AibpPanelOverlay.observe(image, host, [layer], bounds => updates.push(bounds));
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  return { api: window.AibpPanelOverlay, host, image, layer, updates, cleanup, flush, frames, listeners, imageListeners, observers };
}

test('contain letterboxing anchors overlays to card pixels and preserves business visibility', () => {
  const h = harness();
  assert.equal(h.layer.style.left, '0px');
  assert.equal(h.layer.style.top, '100px');
  assert.equal(h.layer.style.width, '400px');
  assert.equal(h.layer.style.height, '200px');
  assert.equal(h.host.style['--panel-overlay-unit'], '0.4px');
  assert.equal(h.layer.hidden, true);
  h.image.computedStyle.objectPosition = 'right bottom';
  h.imageListeners.get('load')();
  assert.equal(h.layer.style.top, '200px');
  h.cleanup();
});

test('resize follows fractional card dimensions and source changes recalibrate even at identical aspect', () => {
  const h = harness();
  h.image.computedStyle.width = '200.5px';
  h.image.computedStyle.height = '200.5px';
  h.listeners.get('resize')();
  h.flush();
  assert.equal(h.layer.style.width, '200.5px');
  assert.equal(h.layer.style.height, '100.25px');
  assert.equal(h.layer.style.top, '50.125px');
  assert.equal(h.host.style['--panel-overlay-unit'], '0.2005px');
  const before = h.updates.length;
  h.image.src = 'second.jpg';
  h.image.naturalWidth = 1000;
  h.image.naturalHeight = 500;
  h.imageListeners.get('load')();
  assert.equal(h.updates.length, before + 1);
  h.cleanup();
});

test('loading hides stale annotations; teardown removes listeners, observers and queued resize', () => {
  const h = harness();
  h.image.complete = false;
  h.observers[1].callback();
  assert.equal(h.layer.style.visibility, 'hidden');
  h.image.complete = true;
  h.imageListeners.get('load')();
  assert.equal(h.layer.style.visibility, '');
  h.listeners.get('resize')();
  h.cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.imageListeners.size, 0);
  assert.ok(h.observers.every(observer => observer.disconnected));
});

test('official print layout uses its own positions at original and preview sizes and restores fan coordinates', () => {
  const h = harness();
  const state = { type: 'Labyrinth O', left: '92.4%', top: '6.1%', width: '5.6%', index: 0 };
  for (const [naturalWidth, naturalHeight] of [[2384, 1632], [1600, 1095]]) {
    const result = h.api.stateForArtwork('LABYRINTHAUROS', state, { naturalWidth, naturalHeight });
    assert.equal(result.left, '89.7%');
    assert.equal(result.top, '7.2%');
    assert.equal(result.index, 0);
    const restored = h.api.stateForArtwork('LABYRINTHAUROS', result, { naturalWidth: 2405, naturalHeight: 1649 });
    assert.equal(restored.left, '92.4%');
    assert.equal(restored.top, '6.1%');
    assert.equal(state.left, '92.4%', 'calibration must not mutate persisted track data');
  }
  // The two preview ratios are very close; do not infer the edition from viewport size.
  assert.equal(h.api.stateForArtwork('LABYRINTHAUROS', state, { naturalWidth: 1600, naturalHeight: 1097 }), state);
  const tem = h.api.stateForArtwork('ALPHA_TEMENOS', { type: 'Labyrinth L', left: '90.7%', top: '86.9%', width: '5.0%' }, { naturalWidth: 2372, naturalHeight: 1628 });
  assert.equal(tem.left, '91.2%');
  assert.equal(tem.top, '87.6%');
  assert.equal(tem.width, '5.7%');
  const fire = h.api.stateForArtwork('THE_NIETZSCJEAN', { comboEnglish: 'Fire', left: '54.3%', top: '54.2%' }, { naturalWidth: 2384, naturalHeight: 1604 });
  assert.equal(fire.left, '54.6%');
  assert.equal(fire.top, '55.4%');
  const mauls = h.api.stateForArtwork('CYCLONUS', { comboEnglish: 'Mauls', left: '86.4%', top: '8.7%' }, { naturalWidth: 2372, naturalHeight: 1628 });
  assert.equal(mauls.top, '7.8%');
  const chimera = h.api.stateForArtwork('CHIMERA_METASTASIOS', { label: '凝胶态', left: '79.5%', top: '28.8%', width: '14.2%', height: '6.1%' }, { naturalWidth: 2368, naturalHeight: 1636 });
  assert.equal(chimera.left, '79.8%');
  assert.equal(chimera.top, '29.2%');
  assert.equal(chimera.width, '6.4%');
  assert.equal(chimera.height, '3.6%');
  h.cleanup();
});
