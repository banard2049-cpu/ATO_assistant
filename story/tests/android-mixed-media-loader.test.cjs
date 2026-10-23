const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { create: renderer } = require('../assets/mixed-media/renderer.js');
const appSource = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
const create = vm.runInThisContext('(' + appSource.match(/  function createAndroidMixedMediaLoader\(env\) \{[\s\S]*?^  \}/m)[0] + ')');

const context = (key = 'one', variant = 'fan', bookId = 'c1') => ({ schema: 1, bookId, variant, entryKey: key });
function harness(native = true) {
  const timers = new Map(), requests = [], events = [], cancellations = [];
  let sequence = 0;
  const env = {
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    dispatchEvent(event) { events.push(event.type); },
    CustomEvent: class { constructor(type) { this.type = type; } },
    location: { href: 'file:///android_asset/web/story/index.html' },
    ...(native ? { ATOAndroid: {
      requestMixedMediaMap(...args) { requests.push(args); return true; },
      cancelMixedMediaMap() { cancellations.push(requests.length); },
    } } : {}),
  };
  const loader = create(env);
  return { env, loader, requests, events, cancellations, flush() { for (const [id, fn] of timers) { timers.delete(id); fn(); } },
    reply(index, value) { env.ATOAndroidMixedMediaMapResult(requests[index][3], JSON.stringify(value)); } };
}

test('Android renders text before requesting only the current entry and deduplicates its ready redraw', () => {
  const h = harness();
  h.loader.load(context());
  assert.equal(h.requests.length, 0);
  h.flush();
  assert.deepEqual(h.requests[0].slice(0, 3), ['c1', 'fan', 'one']);
  h.reply(0, { schema: 1, rows: [] });
  h.loader.load(context());
  h.flush();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.events, ['ato-mixed-media-map-ready']);
});

test('rapid navigation coalesces pending requests and never accepts a stale response or variant', () => {
  const h = harness();
  h.loader.load(context('one')); h.loader.load(context('two')); h.flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0][2], 'two');
  h.loader.load(context('two', 'official')); h.flush();
  h.reply(0, { schema: 1, marker: 'old' });
  assert.equal(h.env.ATO_MIXED_MEDIA_MAP.marker, undefined);
  h.reply(1, { schema: 1, marker: 'official' });
  h.reply(1, { schema: 1, marker: 'duplicate' });
  assert.equal(h.env.ATO_MIXED_MEDIA_MAP.marker, 'official');
  assert.equal(h.events.length, 1);
  h.loader.load(context('two', 'official', 'c2')); h.flush();
  assert.equal(h.env.ATO_MIXED_MEDIA_MAP.marker, undefined);
  assert.deepEqual(h.requests[2].slice(0, 3), ['c2', 'official', 'two']);
});

test('unmapped contexts cancel pending enhancement and release the previous map', () => {
  const h = harness();
  h.loader.load(context()); h.flush(); h.reply(0, { schema: 1, rows: [{ path: 'old' }] });
  h.loader.load(context('two')); h.loader.load(null); h.flush();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.env.ATO_MIXED_MEDIA_MAP, { schema: 1 });
  h.env.ATOAndroidMixedMediaMapResult('', '{"schema":1,"rows":[{}]}');
  assert.equal(h.events.length, 1);
});

test('leaving an entry stops its native scan and rejects a late result without another request', () => {
  const h = harness();
  h.loader.load(context()); h.flush();
  const before = h.cancellations.length;
  h.loader.load(context());
  assert.equal(h.cancellations.length, before);
  h.loader.load(null); h.flush();
  assert.equal(h.cancellations.length, before + 1);
  assert.equal(h.requests.length, 1);
  h.reply(0, { schema: 1, rows: [{ path: 'stale' }] });
  assert.deepEqual(h.env.ATO_MIXED_MEDIA_MAP, { schema: 1 });
  assert.deepEqual(h.events, []);
});

test('a native loader without the cancellation bridge still supports entry changes', () => {
  const h = harness();
  delete h.env.ATOAndroid.cancelMixedMediaMap;
  h.loader.load(context()); h.flush();
  h.loader.load(context('two')); h.flush();
  h.reply(1, { schema: 1, marker: 'two' });
  assert.equal(h.env.ATO_MIXED_MEDIA_MAP.marker, 'two');
});

test('missing/corrupt/schema-incompatible maps and rejected native calls leave readable text', () => {
  for (const response of ['', '{', '{"schema":2}', 'null']) {
    const h = harness(); h.loader.load(context()); h.flush();
    h.env.ATOAndroidMixedMediaMapResult(h.requests[0][3], response);
    assert.deepEqual(h.env.ATO_MIXED_MEDIA_MAP, { schema: 1 });
    assert.equal(h.events.length, 0);
  }
  const h = harness();
  h.env.ATOAndroid.requestMixedMediaMap = () => { throw new Error('bridge unavailable'); };
  h.loader.load(context()); assert.doesNotThrow(h.flush);
});

test('the scoped response uses the unchanged source drift guard and media planner', () => {
  const h = harness(), text = 'before □ after', runtime = renderer(() => h.env.ATO_MIXED_MEDIA_MAP, h.env);
  h.loader.load(context()); h.flush();
  h.reply(0, { schema: 1, rows: [{ book: 'c1', variant: 'fan', key: 'one', anchor: text,
    anchorOccurrence: 1, anchorCount: 1, position: 'replace', replaceText: '□',
    contextBefore: 'before ', contextAfter: ' after', textLength: text.length,
    textFingerprint: runtime.fingerprint(text), path: 'story/assets/mixed-media/images/c1/test.png', layout: 'block' }] });
  assert.equal(runtime.plan(context(), text).count, 1);
  assert.equal(runtime.plan(context(), text + 'changed').count, 0);
  h.loader.load(context('two'));
  assert.equal(runtime.plan(context(), text).count, 0);
});

test('desktop and older Android shells keep the existing script loading and crash protection', () => {
  const h = harness(false);
  h.env.ATO_MIXED_MEDIA_MAP = { schema: 1, desktop: true };
  h.loader.load(context()); h.flush();
  assert.equal(h.loader.native, false);
  assert.equal(h.env.ATO_MIXED_MEDIA_MAP.desktop, true);
  const source = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
  const load = source.match(/  function loadMixedMediaMap\(\) \{[\s\S]*?^  \}/m)[0];
  const degraded = source.slice(source.indexOf('  let mixedMediaDegraded = false;'), source.indexOf('  function showMixedMediaDegradedNotice'));
  for (const native of [true, false]) {
    let appended = 0;
    const env = { ATO_MIXED_MEDIA_LOADER: { native }, ATOAndroid: { rendererCrashedThisProcess: () => true } };
    const scope = vm.createContext({ window: env, document: { querySelector: () => null,
      createElement: () => ({ dataset: {} }), head: { appendChild() { appended++; } } } });
    assert.equal(vm.runInContext(degraded + '\nmixedMediaDegraded', scope), !native);
    vm.runInContext(load + '\nloadMixedMediaMap()', scope);
    assert.equal(appended, 0);
  }
  const scope = vm.createContext({ window: {}, mixedMediaDegraded: false, document: { querySelector: () => null,
    createElement: () => ({ dataset: {} }), head: { appendChild(script) { assert.match(script.src, /mapping\.js/); } } } });
  vm.runInContext(load + '\nloadMixedMediaMap()', scope);
});
