const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizePath, coordinates, match } = require('../assets/fan-card-trims.js');

const path = 'assets/exploration-cards/c1/6400.png';
const values = Array.from({ length: 108 }, (_, index) => 70 + index % 90);
const entry = { size: [470, 740], samples: values, trim: [2, 3, 4, 5] };
const metadata = () => ({ version: 1, sampleGrid: 6, tolerance: 3, images: { [path]: [entry] } });
const base = 'https://example.test/ato/aibp/index.html';
const expected = { top: 2 / 740, right: 3 / 470, bottom: 4 / 740, left: 5 / 470, naturalWidth: 470, naturalHeight: 740 };

test('source paths normalize at the project root, across subpages and encoded URLs', () => {
  assert.equal(normalizePath('../assets/exploration-cards/c1/6400.png?v=1#card', base), path);
  assert.equal(normalizePath('/ato/assets/exploration-cards/c1/%36%34%30%30.png', base), path);
  assert.equal(normalizePath('ps/HEKATON/HEKATON_AI_I_001.jpg.preview.jpg?v=2', base), 'aibp/ps/HEKATON/HEKATON_AI_I_001.jpg.preview.jpg');
  assert.equal(normalizePath('https://example.test/ato/' + path, base), path);
});

test('uncontrolled, malformed and foreign sources cannot qualify for fan trimming', () => {
  for (const source of ['https://foreign.test/' + path, 'blob:https://example.test/123', 'data:image/png;base64,AA',
    '/ato/aibp/ps/other/token/hero.png', '/ato/custom/hero.png', '/ato/assets/exploration-cards/c1/%ZZ.png']) {
    assert.equal(normalizePath(source, base), null, source);
  }
  assert.equal(normalizePath('file:///tmp/' + path, base), null);
});

test('matching dimensions and all 108 channels qualify only the measured fan revision', () => {
  assert.deepEqual(match(metadata(), path, 470, 740, values), expected);
  assert.deepEqual(match(metadata(), path, 470, 740, values.map(value => value + 3)), expected);
  const changed = [...values]; changed[107] += 4;
  assert.equal(match(metadata(), path, 470, 740, changed), null);
  assert.equal(match(metadata(), path, 1005, 1559, values), null, 'official artwork at the same URL has different dimensions');
  assert.equal(match(metadata(), path, 470, 740, values.map(value => value + 20)), null, 'same-size official artwork has different pixels');
});

test('missing or malformed metadata, samples and edge amounts fail closed', () => {
  for (const data of [null, {}, { ...metadata(), version: 2 }, { ...metadata(), sampleGrid: 4 },
    { ...metadata(), tolerance: 20 }, { ...metadata(), images: {} }]) assert.equal(match(data, path, 470, 740, values), null);
  assert.equal(match(metadata(), path, 470, 740, values.slice(1)), null);
  assert.equal(match(metadata(), path, 470, 740, values.map(() => NaN)), null);
  assert.equal(match({ ...metadata(), images: { [path]: [{ ...entry, trim: [2, 3, 740, 5] }] } }, path, 470, 740, values), null);
  assert.equal(match(metadata(), 'aibp/ps/HEKATON/HEKATON_AI_I_001.jpg', 470, 740, values), null);
});

test('sampling locations address natural pixels with the generator rounding rule', () => {
  const points = coordinates(470, 740);
  assert.equal(points.length, 36);
  assert.deepEqual(points[0], [67, 106]);
  assert.deepEqual(points[35], [402, 633]);
});

function harness() {
  const listeners = new Map(), images = [], reads = [];
  const rgba = () => values.flatMap((value, index) => index % 3 ? [] : [value, values[index + 1], values[index + 2], 255]);
  const context = {
    drawImage(image, x, y, sw, sh, dx, dy, dw, dh) { reads.push({ x, y, sw, sh, dx, dy, dw, dh }); },
    getImageData: () => ({ data: rgba() }),
  };
  const document = { baseURI: base, addEventListener: (type, callback) => listeners.set(type, callback),
    createElement: () => ({ getContext: () => context }) };
  const global = { URL, document, ATO_FAN_CARD_TRIMS: metadata(), Image: class {
    constructor() { images.push(this); this.complete = false; this.naturalWidth = 470; this.naturalHeight = 740; }
  } };
  document.defaultView = global;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/fan-card-trims.js'), 'utf8'), global);
  const image = { tagName: 'IMG', src: '../' + path, currentSrc: '', ownerDocument: document,
    complete: true, naturalWidth: 470, naturalHeight: 740 };
  return { global, api: global.FanCardTrims, image, document, listeners, images, reads, context };
}

test('loaded img sampling is cached and revalidated on same-URL load without changing src', () => {
  const h = harness(), originalSrc = h.image.src;
  assert.deepEqual({ ...h.api.lookup(h.image, {}) }, expected);
  assert.equal(h.reads.length, 36);
  h.api.lookup(h.image, {});
  assert.equal(h.reads.length, 36);
  h.context.getImageData = () => ({ data: Array.from({ length: 144 }, (_, index) => index % 4 === 3 ? 255 : 220) });
  h.listeners.get('load')({ target: h.image });
  assert.equal(h.api.lookup(h.image, {}), null);
  assert.equal(h.reads.length, 72);
  assert.equal(h.image.src, originalSrc);
  assert.ok(h.reads.every(read => read.sw === 1 && read.sh === 1 && read.dw === 1 && read.dh === 1));
});

test('loading images, unreadable canvas, custom tokens and late data stay untouched', () => {
  const h = harness();
  h.image.complete = false;
  assert.equal(h.api.lookup(h.image, {}), null);
  h.image.complete = true;
  h.context.getImageData = () => { throw new Error('tainted canvas'); };
  assert.equal(h.api.lookup(h.image, {}), null);
  h.image.classList = { contains: value => value === 'custom-token' };
  assert.equal(h.api.lookup(h.image, {}), null);
  h.global.ATO_FAN_CARD_TRIMS = null;
  assert.equal(h.api.lookup(h.image, {}), null);
});

test('unknown previews never inherit the original image fingerprint and new metadata invalidates cache', () => {
  const h = harness();
  assert.deepEqual({ ...h.api.lookup(h.image, {}) }, expected);
  h.image.src += '.preview.jpg';
  assert.equal(h.api.lookup(h.image, {}), null);
  assert.equal(h.reads.length, 36);
  h.image.src = '../' + path;
  h.global.ATO_FAN_CARD_TRIMS = { ...metadata(), images: { [path]: [{ ...entry, samples: values.map(() => 210) }] } };
  assert.equal(h.api.lookup(h.image, {}), null);
  assert.equal(h.reads.length, 72);
});

test('background sampling decodes once, notifies listeners and caches confirmed results', () => {
  const h = harness(), element = { ownerDocument: h.document }, style = { backgroundImage: 'url("../' + path + '?v=2")' };
  let ready = 0;
  const callback = () => ready++;
  assert.equal(h.api.lookup(element, style, callback), null);
  assert.equal(h.api.lookup(element, style, callback), null);
  assert.equal(h.images.length, 1);
  h.images[0].complete = true;
  h.images[0].onload();
  assert.equal(ready, 1);
  assert.deepEqual({ ...h.api.lookup(element, style, callback) }, expected);
  assert.equal(h.images.length, 1);
  assert.equal(h.reads.length, 36);
  assert.equal(h.api.lookup(element, { backgroundImage: 'url("https://foreign.test/' + path + '")' }, callback), null);
  assert.equal(h.images.length, 1);
});
