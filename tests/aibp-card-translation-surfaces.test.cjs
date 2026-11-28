// 守护「切换中文后整页卡面都变中文」：大图、Trait 区之外的当前/弃牌/损伤牌堆、
// 抽牌预览、第二屏都是同一套 img 换图逻辑，不能只认原来的三个容器。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../aibp/card-translations.js'), 'utf8');
const cards = require('../aibp/card-translations.json');

function classes() {
  const set = new Set();
  return {
    add: name => set.add(name),
    remove: name => set.delete(name),
    contains: name => set.has(name),
  };
}

function styles() {
  const values = new Map();
  return {
    setProperty: (name, value) => values.set(name, value),
    removeProperty: name => values.delete(name),
    getPropertyValue: name => values.get(name) ?? '',
  };
}

function cardImage(key, { rotate = '', src = `https://ato.test/aibp/${key}` } = {}) {
  return {
    src,
    complete: true,
    naturalWidth: 750,
    naturalHeight: 1050,
    currentSrc: src,
    isConnected: true,
    dataset: rotate ? { rotate } : {},
    classList: classes(),
    style: styles(),
    getAttribute: name => (name === 'src' ? key : null),
    closest: () => null,
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    parentElement: { classList: classes() },
  };
}

function canvasContext() {
  const canvas = { width: 750, height: 1050 };
  const data = () => ({ width: canvas.width, height: canvas.height,
    data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(235) });
  const context = {
    canvas,
    font: '',
    measureText(text) {
      const size = Number(this.font.match(/(\d+)px/)[1]);
      return { width: text.length * size, actualBoundingBoxAscent: size - 3, actualBoundingBoxDescent: 2 };
    },
    drawImage() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    translate() {}, scale() {}, rotate() {}, resetTransform() {},
    fillText() {}, strokeText() {},
    createImageData: data,
    getImageData: data,
    putImageData() {},
  };
  return context;
}

function harness(images, { zoomImage, sealed = {} } = {}) {
  const frames = [];
  const stored = new Map();
  const state = { exports: 0 };
  const languageNode = { dataset: {} };
  const languageObservers = [];
  const zoom = zoomImage ? {
    imageZoomOverlay: { classList: classes() },
    imageZoomImg: zoomImage,
    imageZoomTranslationToggle: { addEventListener() {}, setAttribute() {} },
    imageZoomTranslationFace: { getContext: canvasContext, setAttribute() {} },
  } : {};
  zoom.imageZoomOverlay?.classList.add('show');
  const sandbox = vm.createContext({
    URL,
    fetch: () => Promise.resolve({ ok: true, json: async () => cards }),
    window: {
      addEventListener() {},
      dispatchEvent() {},
      HeliosAssets: { resolve: path => sealed[path] || path },
      localStorage: {
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
      },
      requestAnimationFrame: callback => frames.push(callback),
    },
    CustomEvent: class {},
    document: {
      body: {},
      documentElement: languageNode,
      currentScript: { src: 'https://ato.test/aibp/card-translations.js' },
      getElementById: id => zoom[id] || null,
      querySelectorAll: selector => selector === 'img' ? images
        : images.filter(image => image.classList.contains(selector.split('.')[1])),
      addEventListener() {},
      createElement: () => {
        const context = canvasContext();
        return {
          getContext: () => context,
          setAttribute() {},
          get width() { return context.canvas.width; },
          set width(value) { context.canvas.width = value; },
          get height() { return context.canvas.height; },
          set height(value) { context.canvas.height = value; },
          toDataURL: () => {
            state.exports += 1;
            return 'data:image/webp;base64,CHINESE';
          },
        };
      },
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { if (target === languageNode) languageObservers.push(this.callback); }
    },
    HTMLImageElement: class {},
  });
  vm.runInContext(script, sandbox);
  return {
    api: sandbox.window.AibpCardTranslations, frames, stored, state, zoom,
    setLanguage(language) {
      languageNode.dataset.atoLanguage = language;
      for (const callback of languageObservers) callback();
    },
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

async function flush(harness) {
  await settle();
  while (harness.frames.length) {
    harness.frames.shift()();
    await settle();
  }
}

test('中文开关会给整页的卡图换图，而不只是大图和 Trait 区', async () => {
  const keys = ['ps/MIDASCORE/MIDASCORE_AI_III_001.jpg', 'ps/MIDASCORE/MIDASCORE_AI_II_001.jpg'];
  const pile = cardImage(keys[0]);
  const preview = cardImage(keys[1]);
  const foreign = cardImage('ps/HELIOS/HELIOS_AI_I_001.jpg');
  const h = harness([pile, preview, foreign]);
  h.api.setEnabled(true);
  await flush(h);
  for (const image of [pile, preview]) {
    assert.equal(image.classList.contains('card-translation-painted'), true);
    assert.match(image.style.getPropertyValue('--card-translation-image'), /^url\("data:image\/webp/);
  }
  assert.equal(foreign.classList.contains('card-translation-painted'), false);
  assert.equal(foreign.style.getPropertyValue('--card-translation-image'), '');
});

test('关掉中文把换上去的卡图擦掉，开关同时记在本地偏好里', async () => {
  const pile = cardImage('ps/MIDASCORE/MIDASCORE_AI_III_001.jpg');
  const h = harness([pile]);
  h.api.setEnabled(true);
  await flush(h);
  assert.equal(h.stored.get('aibp-card-translation-v1'), '1');
  h.api.setEnabled(false);
  await flush(h);
  assert.equal(pile.classList.contains('card-translation-painted'), false);
  assert.equal(pile.style.getPropertyValue('--card-translation-image'), '');
  assert.equal(h.stored.get('aibp-card-translation-v1'), '0');
});

test('第二屏按快照设置开关时不能改掉本机偏好', async () => {
  const pile = cardImage('ps/MIDASCORE/MIDASCORE_AI_III_001.jpg');
  const h = harness([pile]);
  h.api.setEnabled(true, { persist: false, announce: false });
  await flush(h);
  assert.equal(h.api.enabled(), true);
  assert.equal(h.stored.has('aibp-card-translation-v1'), false);
});

test('同一张卡只画一次，重复扫描不会反复导出画布', async () => {
  const pile = cardImage('ps/MIDASCORE/MIDASCORE_AI_III_001.jpg');
  const h = harness([pile]);
  h.api.setEnabled(true);
  await flush(h);
  assert.equal(h.state.exports, 1, '启用时画一次');
  const painted = pile.style.getPropertyValue('--card-translation-image');
  h.api.refresh();
  await flush(h);
  assert.equal(h.state.exports, 1, '同一张卡再看一次不该重画');
  assert.equal(pile.style.getPropertyValue('--card-translation-image'), painted);
});

test('旋转的 Trait 缩略图按自己的方向导出', async () => {
  const trait = cardImage('ps/MIDASCORE/MIDASCORE_AI_III_001.jpg', { rotate: '-90' });
  const h = harness([trait]);
  h.api.setEnabled(true);
  await flush(h);
  assert.equal(trait.classList.contains('card-translation-painted'), true);
});

test('民间术语跟随界面版本，在缩略图和放大图上独立于英文卡面的中文开关', async () => {
  const path = 'ps/ALPHA_TEMENOS/ALPHA_TEMENOS_TR_II_001.jpg';
  const back = cardImage(`${path}.preview.jpg`);
  const zoomImage = cardImage(path);
  const english = cardImage('ps/MIDASCORE/MIDASCORE_AI_III_001.jpg');
  const h = harness([back, english], { zoomImage });
  const painted = image => image.classList.contains('card-translation-painted');
  const face = h.zoom.imageZoomTranslationFace;
  const toggle = h.zoom.imageZoomTranslationToggle;
  await flush(h);
  assert.equal(h.api.keyFor(back), path);
  assert.equal(painted(back), true);
  assert.equal(painted(english), false);
  assert.equal(face.hidden, false);
  assert.equal(toggle.hidden, true);

  h.api.setEnabled(true);
  h.setLanguage('official');
  await flush(h);
  assert.equal(painted(back), false);
  assert.equal(painted(english), true);
  assert.equal(face.hidden, true);

  h.setLanguage('en');
  await flush(h);
  assert.equal(painted(back), false);
  assert.equal(face.hidden, true);

  h.setLanguage('fan');
  h.api.setEnabled(false);
  await flush(h);
  assert.equal(painted(back), true);
  assert.equal(painted(english), false);
  assert.equal(face.hidden, false);
});

test('旧日幽魂的实际卡图 blob 地址以原卡路径查找译文', async () => {
  const path = 'ps/other/3b6e9d20/e2cc96fa.bin';
  const src = 'blob:https://ato.test/old-haunt';
  const card = cardImage(path, { src });
  const h = harness([card], { zoomImage: cardImage(path, { src }), sealed: { [path]: src } });
  await flush(h);
  assert.equal(h.zoom.imageZoomTranslationToggle.hidden, false);
  assert.equal(h.zoom.imageZoomTranslationFace.hidden, true);
  h.api.setEnabled(true);
  await flush(h);
  assert.equal(card.src, src);
  assert.equal(card.classList.contains('card-translation-painted'), true);
  assert.equal(h.zoom.imageZoomTranslationFace.hidden, false);
});
