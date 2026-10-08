const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalize, palette, luminance } = require('../assets/theme.js');
const source = fs.readFileSync(path.join(__dirname, '../assets/theme.js'), 'utf8');

function page(cycle = 'c1', saved = null, storageFails = false) {
  const properties = new Map(), listeners = {}, channels = {}, writes = new Map();
  let observer;
  const body = {
    dataset: { cycle }, hasAttribute: () => false,
    style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
  };
  const context = {
    document: { body, querySelector: () => null, querySelectorAll: () => [] },
    window: { location: { search: '' }, dispatchEvent() {}, addEventListener: (name, handler) => { listeners[name] = handler; } },
    localStorage: {
      getItem: key => { if (storageFails) throw Error('blocked'); return writes.get(key) || (key === 'ato-theme-v1' ? saved : null); },
      setItem: (key, value) => { if (storageFails) throw Error('blocked'); writes.set(key, value); },
    },
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
    BroadcastChannel: class {
      constructor(name) { channels[name] = this; }
      addEventListener(_name, callback) { this.receive = callback; }
      postMessage(message) { this.sent = message; }
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    URLSearchParams,
  };
  vm.runInNewContext(source, context);
  return { api: context.window.ATO_THEME, body, properties, writes, channels, listeners, refresh: () => observer() };
}

test('automatic mode follows content cycle; fixed mode never changes campaign cycle', () => {
  const p = page('c2');
  assert.equal(p.properties.get('--accent'), '#a52206');
  p.api.set({ mode: 'c4' });
  p.body.dataset.cycle = 'c5';
  p.refresh();
  assert.equal(p.properties.get('--accent'), '#a0843d');
  assert.equal(p.body.dataset.cycle, 'c5');
  p.api.set({ mode: 'auto' });
  assert.equal(p.properties.get('--accent'), '#06243d');
  assert.equal(p.properties.has('--cycle-sidebar'), false);
});

test('a new module restores preferences and open modules accept live updates', () => {
  const dashboard = page();
  dashboard.api.set({ mode: 'custom', rgb: [35, 120, 160] });
  const saved = dashboard.writes.get('ato-theme-v1');
  const map = page('c5', saved);
  assert.equal(map.properties.get('--accent'), dashboard.properties.get('--accent'));
  const hero = page('c3');
  hero.channels['ato-theme-v1'].receive({ data: dashboard.channels['ato-theme-v1'].sent });
  assert.equal(hero.properties.get('--bg'), map.properties.get('--bg'));
  assert.equal(hero.body.dataset.cycle, 'c3');
  hero.listeners.storage({ key: null });
  assert.equal(hero.body.dataset.atoTheme, 'auto');
});

test('malformed stored settings and unavailable storage do not prevent rendering', () => {
  assert.equal(page('c3', '{broken').properties.get('--accent'), '#752a7f');
  const p = page('c1', null, true);
  p.api.set({ mode: 'c5' });
  assert.equal(p.properties.get('--accent'), '#06243d');
  assert.deepEqual(normalize({ mode: 'bad', rgb: [-10, 100.2, 300] }), { mode: 'auto', rgb: [0, 100, 255] });
});

test('custom themes produce readable text and distinct paper, borders and selection colors', () => {
  for (const rgb of [[255, 255, 255], [255, 255, 0], [0, 0, 0], [30, 110, 180]]) {
    const colors = palette(normalize({ mode: 'custom', rgb }));
    const accent = [1, 3, 5].map(i => parseInt(colors['--accent'].slice(i, i + 2), 16));
    assert.ok(1.05 / (luminance(accent) + .05) >= 4.5);
    assert.notEqual(colors['--panel'], colors['--line']);
    assert.notEqual(colors['--panel'], colors['--accent']);
  }
});

test('fixed cycle colors match the shared stylesheet and every main module loads the theme', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'api/cycle-theme.css'), 'utf8');
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const block = css.match(new RegExp(`body\\[data-cycle="${cycle}"\\] \\{([^}]+)`))[1];
    const colors = palette({ mode: cycle, rgb: [] });
    for (const name of ['bg', 'panel', 'line', 'accent', 'accent-strong', 'accent-soft', 'gold']) {
      assert.equal(colors['--' + name], block.match(new RegExp(`--${name}: (#[a-f0-9]+)`))[1]);
    }
  }
  for (const file of ['index.html', 'record/index.html', 'hero/index.html', 'map/index.html', 'aibp/index.html', 'story/index.html', 'technology/index.html', 'ss/index.html']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<script[^>]+assets\/theme\.js/);
  }
});
