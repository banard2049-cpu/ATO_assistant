const assert = require('node:assert/strict');
const test = require('node:test');
const { localBox, objectPosition, imageGeometry, observe } = require('../assets/card-art.js');

const box = (width, height) => localBox({ width: String(width), height: String(height) });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);

test('contain clips actual artwork corners inside letterboxing', () => {
  const geometry = imageGeometry(box(300, 400), 200, 300, 'contain');
  near(geometry.width, 800 / 3);
  assert.equal(geometry.height, 400);
  assert.ok(Math.abs(geometry.left - 50 / 3) < 1e-10);
  near(geometry.radius, 16);
  assert.equal(geometry.clip, 'inset(0px 16.6667px 0px 16.6667px round 16px)');
});

test('fill and cover round the visible content rectangle', () => {
  for (const fit of ['fill', 'cover']) {
    const geometry = imageGeometry(box(300, 400), 200, 300, fit);
    assert.deepEqual(geometry.insets, [0, 0, 0, 0]);
    assert.equal(geometry.width, 300);
    assert.equal(geometry.height, 400);
    assert.equal(geometry.radius, 18);
  }
});

test('measured fan scan lines clip each edge in local image coordinates', () => {
  const trim = { top: 6 / 1000, right: 1 / 700, bottom: 0, left: 2 / 700 };
  const geometry = imageGeometry(box(350, 500), 700, 1000, 'contain', 'center', .06, trim);
  assert.equal(geometry.clip, 'inset(3px 0.5px 0px 1px round 20.91px)');
  const landscape = imageGeometry(box(600, 400), 1000, 700, 'contain', 'center', .06, { bottom: 1 / 700 });
  near(landscape.insets[2], 1 / 700 * 400);
});

test('downscaled scan lines include one screen-pixel fringe only on affected edges', () => {
  const geometry = imageGeometry(box(134.8, 134.8 * 1040 / 730), 730, 1040, 'contain', 'center', .06, { top: 1 / 1040 }, .8);
  near(geometry.insets[0], 134.8 / 730 + .8);
  near(geometry.insets[2], 0);
  near(geometry.insets[1], 0);
  const background = imageGeometry(box(190, 190 * 740 / 470), 470, 740, 'contain', 'center', .06, { bottom: 1 / 740 }, 2 / 3);
  near(background.insets[0], 0);
  near(background.insets[2], 190 / 470 + 2 / 3);
});

test('scale-down uses natural pixels only when they fit, and none preserves intrinsic size', () => {
  assert.equal(imageGeometry(box(300, 400), 100, 200, 'scale-down').clip,
    'inset(100px 100px 100px 100px round 6px)');
  assert.equal(imageGeometry(box(300, 400), 200, 600, 'scale-down').height, 400);
  assert.equal(imageGeometry(box(300, 400), 100, 200, 'none').height, 200);
  assert.equal(imageGeometry(box(300, 400), 600, 800, 'none').clip,
    'inset(0px 0px 0px 0px round 18px)');
});

test('object-position preserves percentage, pixel, and keyword alignment', () => {
  assert.equal(imageGeometry(box(300, 400), 100, 200, 'none', 'right bottom').clip,
    'inset(200px 0px 0px 200px round 6px)');
  assert.equal(imageGeometry(box(300, 400), 100, 200, 'none', '25% 20px').clip,
    'inset(20px 150px 180px 50px round 6px)');
  assert.deepEqual(objectPosition('bottom left'), [{ fraction: 0, offset: 0 }, { fraction: 1, offset: 0 }]);
  assert.deepEqual(objectPosition('top'), [{ fraction: .5, offset: 0 }, { fraction: 0, offset: 0 }]);
});

test('content-box and border-box subtract padding and borders without rounding local sizes', () => {
  const style = { width: '300.5px', height: '400.25px', paddingTop: '10.5px', paddingRight: '8px', paddingBottom: '9.5px', paddingLeft: '7px',
    borderTopWidth: '1.25px', borderRightWidth: '2px', borderBottomWidth: '2.25px', borderLeftWidth: '1px' };
  const content = localBox(style);
  assert.deepEqual(content, { x: 8, y: 11.75, width: 300.5, height: 400.25, outerWidth: 318.5, outerHeight: 423.75 });
  assert.deepEqual(localBox({ ...style, boxSizing: 'border-box', width: '318.5px', height: '423.75px' }), content);
  const geometry = imageGeometry(content, 100, 200, 'none', 'left top');
  assert.deepEqual(geometry.insets, [11.75, 210.5, 212, 8]);
});

test('geometry recomputes after a resize or HD replacement and ignores visual transforms', () => {
  const style = { width: '240.5px', height: '320.75px', transform: 'rotate(90deg) scale(1.5)' };
  const original = imageGeometry(localBox(style), 200, 300, 'contain');
  assert.deepEqual(original, imageGeometry(localBox({ ...style, transform: 'none' }), 200, 300, 'contain'));
  assert.deepEqual(original, imageGeometry(localBox(style), 2000, 3000, 'contain'));
  assert.equal(imageGeometry(localBox({ ...style, width: '120.25px', height: '160.375px' }), 200, 300, 'contain').radius, original.radius / 2);
  near(imageGeometry(box(300, 400), 200, 300, 'contain', 'center', .015).radius, 4);
  assert.equal(imageGeometry(box(0, 0), 200, 300, 'contain'), null);
});

function fixture() {
  const frames = [], attributes = new Map(), properties = new Map();
  const element = {
    nodeType: 1, isConnected: true, naturalWidth: 200, naturalHeight: 300,
    offsetWidth: 300, offsetHeight: 400, token: false,
    classList: { contains: () => element.token },
    matches: selector => selector.includes('img') && !selector.startsWith('.card-track-face, '),
    getAttribute: key => key === 'style' ? JSON.stringify([...properties]) : attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    querySelectorAll: () => [],
    style: { getPropertyValue: key => properties.get(key) || '', setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
    getBoundingClientRect() { throw new Error('transformed bounds must not be read'); },
  };
  const events = new Map(), observed = new Set();
  let mutations, resizes;
  const computed = { width: '300px', height: '400px', objectFit: 'contain', objectPosition: '50% 50%', getPropertyValue: () => '' };
  const document = { documentElement: {}, querySelectorAll: () => [element], addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
  const view = {
    getComputedStyle: () => computed,
    requestAnimationFrame: fn => frames.push(fn),
    MutationObserver: class { constructor(fn) { mutations = fn; } observe() {} disconnect() {} },
    ResizeObserver: class { constructor(fn) { resizes = fn; } observe(node) { observed.add(node); } unobserve(node) { observed.delete(node); } disconnect() { observed.clear(); } },
  };
  const controller = observe(document, view);
  return { element, computed, properties, events, observed, controller, view,
    flush: () => { while (frames.length) frames.shift()(); },
    mutate: records => mutations(records), resize: () => resizes([{ target: element }]), frames };
}

test('only a confirmed fan match suppresses the frame and adds the device-pixel guard', () => {
  const h = fixture();
  h.flush();
  h.view.devicePixelRatio = 1.5;
  h.view.FanCardTrims = { lookup: () => ({ top: 1 / 300, right: 0, bottom: 0, left: 0 }) };
  h.resize(); h.flush();
  assert.equal(h.element.getAttribute('data-fan-card-trim'), '');
  assert.equal(h.properties.get('--card-art-clip'), 'inset(2px 16.6667px 0px 16.6667px round 16px)');
  h.view.FanCardTrims.lookup = () => null;
  h.resize(); h.flush();
  assert.equal(h.element.getAttribute('data-fan-card-trim'), null);
  assert.equal(h.properties.get('--card-art-clip'), 'inset(0px 16.6667px 0px 16.6667px round 16px)');
  h.controller.disconnect();
});

test('one observer handles load, resize, dynamic custom tokens, and removed nodes', () => {
  const h = fixture();
  h.flush();
  assert.equal(h.properties.get('--card-art-clip'), 'inset(0px 16.6667px 0px 16.6667px round 16px)');
  h.mutate([{ type: 'attributes', attributeName: 'style', target: h.element }]);
  assert.equal(h.frames.length, 0, 'writing clip variables must not trigger a mutation loop');
  h.computed.width = '150px'; h.computed.height = '200px';
  h.resize(); h.flush();
  assert.equal(h.properties.get('--card-art-clip'), 'inset(0px 8.3333px 0px 8.3333px round 8px)');
  h.element.naturalWidth = 400; h.element.naturalHeight = 400;
  h.events.get('load')({ target: h.element }); h.flush();
  assert.equal(h.properties.get('--card-art-clip'), 'inset(25px 0px 25px 0px round 9px)');
  h.element.token = true;
  h.mutate([{ type: 'attributes', attributeName: 'class', target: h.element }]); h.flush();
  assert.equal(h.element.getAttribute('data-card-art'), null);
  assert.equal(h.properties.has('--card-art-clip'), false);
  assert.equal(h.observed.size, 0);
  h.element.token = false;
  h.mutate([{ type: 'attributes', attributeName: 'class', target: h.element }]); h.flush();
  assert.equal(h.observed.size, 1);
  h.element.isConnected = false;
  h.mutate([{ type: 'childList', removedNodes: [h.element], addedNodes: [] }]);
  assert.equal(h.observed.size, 0);
  assert.equal(h.properties.has('--card-art-clip'), false);
  h.controller.disconnect();
});
