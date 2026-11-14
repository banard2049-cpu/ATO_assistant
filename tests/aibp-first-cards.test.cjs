const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'aibp/card-images.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const src = 'ps/TITAN_X/TITAN_X.jpg';
const payload = (previews = { [src]: `${src}.preview.jpg` }) => ({ ok: true, images: [src], previews });

function harness(cached, savedAt = Date.now()) {
  const links = [];
  const storage = new Map();
  if (cached) storage.set('aibp-image-inventory-v2', JSON.stringify({ savedAt, payload: cached }));
  const requests = [];
  const timers = new Map();
  const frames = new Map();
  const originals = [];
  const wraps = new Map(['panelWrap', 'routineWrap', 'signatureWrap'].map((id) => [id, {
    children: [], get childElementCount() { return this.children.length; },
    appendChild(img) { this.children.push(img); },
  }]));
  let sequence = 0;
  const window = {
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    location: { search: '', hash: '#TITAN_X' },
    setTimeout: (fn, delay) => { timers.set(++sequence, { fn, delay }); return sequence; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: (id) => frames.delete(id),
    Image: class {
      constructor() { originals.push(this); }
      decode() { return new Promise((resolve, reject) => { this.decoded = resolve; this.decodeFailed = reject; }); }
    },
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  };
  const context = vm.createContext({ window, URLSearchParams, AbortController, document: {
    createElement: (tag) => tag === 'img' ? cardImage() : ({}),
    getElementById: (id) => wraps.get(id),
    querySelectorAll: () => [...wraps.values()].flatMap((wrap) => wrap.children)
      .filter((img) => img.dataset.aibpFirstCard),
    head: { appendChild: (link) => links.push(link) },
  } });
  vm.runInContext(script, context);
  return { context, api: window.AibpCardImages, requests, links, timers, storage, originals, wraps, window,
    paint: () => {
      for (const [id, fn] of frames) { frames.delete(id); fn(); }
      for (const [id, timer] of timers) {
        if (timer.delay === 0) { timers.delete(id); timer.fn(); }
      }
    },
    complete: async (value = payload()) => {
      if (!requests.length) {
        for (const [id, timer] of timers) {
          if (timer.delay === 1500) { timers.delete(id); timer.fn(); }
        }
        for (const [id, fn] of frames) { frames.delete(id); fn(); }
        for (const [id, timer] of timers) {
          if (timer.delay === 0) { timers.delete(id); timer.fn(); }
        }
        await Promise.resolve();
      }
      requests.at(-1).resolve({ ok: true, json: async () => value });
      await window.AibpCardImages.load();
    } };
}

function cardImage() {
  return Object.assign(new EventTarget(), { dataset: {}, isConnected: true });
}

function previewLoaded(image) { image.dispatchEvent(new Event('load')); }

async function finishOriginal(original, decodeError = false) {
  const finished = original.onload();
  if (decodeError) original.decodeFailed(new Error('decode failed'));
  else original.decoded();
  await finished;
}

test('cached first cards are created before the main application or its dependencies run', async () => {
  const routine = 'ps/TITAN_X/TITAN_X_ROUTINE_X_001.jpg';
  const signature = 'ps/TITAN_X/TITAN_X_SIGNATURE_X_001.jpg';
  const h = harness({ ...payload(), images: [src, routine, signature] });
  h.api.showFirstCards();
  assert.equal(h.wraps.get('panelWrap').children[0].src, `${src}.preview.jpg`);
  assert.equal(h.wraps.get('routineWrap').children[0].src, routine);
  assert.equal(h.wraps.get('signatureWrap').children[0].src, signature);
  h.api.showFirstCards();
  assert.equal(h.wraps.get('panelWrap').children.length, 1);
  assert.ok(html.indexOf('window.AibpCardImages?.showFirstCards()') < html.indexOf('src="../assets/campaign-session.js'));
  await h.complete({ ...payload(), images: [src, routine, signature] });
});

test('cold first-card rendering leaves cards already created by the main application intact', async () => {
  const h = harness();
  const existing = cardImage();
  h.wraps.get('panelWrap').appendChild(existing);
  h.api.showFirstCards();
  await h.complete();
  assert.equal(h.wraps.get('panelWrap').children.length, 1);
  assert.equal(h.wraps.get('panelWrap').children[0], existing);
});

test('all three cold first cards start before the scan and release it after a paint', async () => {
  const h = harness();
  h.api.showFirstCards();
  const first = [...h.wraps.values()].map((wrap) => wrap.children[0]);
  assert.deepEqual(first.map((image) => image.src), [
    `${src}.preview.jpg`,
    'ps/TITAN_X/TITAN_X_ROUTINE_X_001.jpg',
    'ps/TITAN_X/TITAN_X_SIGNATURE_X_001.jpg',
  ]);
  assert.equal(h.requests.length, 0);
  h.api.showFirstCards(); // Repeated initialization must keep the same gate.
  previewLoaded(first[0]);
  previewLoaded(first[1]);
  h.paint();
  await Promise.resolve();
  assert.equal(h.requests.length, 0);
  previewLoaded(first[2]);
  assert.equal(h.requests.length, 0);
  h.paint();
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  await h.complete();
});

test('old cached inventories remain usable immediately while their background refresh is pending', async () => {
  const h = harness(payload(), Date.now() - 7 * 86400000);
  h.api.showFirstCards();
  assert.equal(h.wraps.get('panelWrap').children[0].src, `${src}.preview.jpg`);
  assert.equal(h.requests.length, 0);
  await h.complete();
});

test('a stale inventory cannot substitute the wrong Boss for an explicit public Boss link', async () => {
  const old = 'ps/HEKATON/HEKATON.jpg';
  const h = harness({ ok: true, images: [old], previews: { [old]: `${old}.preview.jpg` } });
  h.api.showFirstCards();
  assert.equal(h.wraps.get('panelWrap').children[0].src, `${src}.preview.jpg`);
  assert.equal(h.wraps.get('panelWrap').children[0].dataset.fullSrc, src);
  await h.complete();
});

test('cold packs without a panel preview fall back immediately without waiting for inventory', async () => {
  const h = harness();
  let failures = 0;
  const image = { onerror: () => failures++ };
  h.api.setSource(image, src);
  assert.equal(image.src, `${src}.preview.jpg`);
  image.onerror();
  assert.equal(image.src, src);
  assert.equal(h.requests.length, 0);
  assert.equal(failures, 0);
  image.onerror();
  assert.equal(failures, 1);
  await h.complete(payload({}));
});

test('cold bootstrap does not request hidden boss images', async () => {
  const h = harness();
  h.window.location.hash = '#BLACKBEAK';
  h.api.showFirstCards();
  assert.equal([...h.wraps.values()].flatMap((wrap) => wrap.children).length, 0);
  await h.complete();
});

test('cold bootstrap recognizes every public boss in the main application', async () => {
  const names = [...html.match(/^    const apostles = \[([^]*?)\];/m)[1].matchAll(/"([A-Z_]+)"/g)]
    .map((match) => match[1]).filter((name) => !['HELIOS', 'BLACKBEAK'].includes(name));
  for (const name of names) {
    const h = harness();
    h.window.location.hash = `#${name}`;
    h.api.showFirstCards();
    const panel = h.wraps.get('panelWrap').children[0];
    const face = name === 'UR_FLEECE' ? `${name}_2` : name;
    assert.equal(panel.src, `ps/${name}/${face}.jpg.preview.jpg`);
    await h.complete();
  }
});

test('main renderer adopts the painted first card and keeps its pending original upgrade', async () => {
  const h = harness(payload());
  await h.complete();
  h.api.showFirstCards();
  const first = h.wraps.get('panelWrap').children[0];
  previewLoaded(first);
  h.paint();
  h.window.HeliosAssets = { resolve: (value) => value };
  const fn = html.match(/^    function imageOrMessage\([^]*?^    }/m)[0];
  vm.runInContext(fn, h.context);
  const adopted = h.context.imageOrMessage(src, 'Boss panel', 'panel-image');
  assert.equal(adopted, first);
  assert.equal(adopted.src, `${src}.preview.jpg`);
  assert.equal(adopted.dataset.aibpFirstCard, undefined);
  await finishOriginal(h.originals[0]);
  assert.equal(adopted.src, src);
  assert.equal(h.originals.length, 1);
  assert.equal(typeof adopted._cardImageError, 'function');
});

test('an already failed first card gets its retry UI after the main renderer inserts it', async () => {
  const h = harness();
  h.api.showFirstCards();
  const first = h.wraps.get('panelWrap').children[0];
  first.onerror(); // Missing preview in an older pack.
  first.onerror(); // Missing original as well, before the main renderer ran.
  first.complete = true;
  first.naturalWidth = 0;
  const replaced = [];
  first.replaceWith = (node) => replaced.push(node);
  h.window.HeliosAssets = { resolve: (value) => value };
  h.context.document.createElement = () => ({ appendChild() {}, addEventListener() {} });
  vm.runInContext(html.match(/^    function imageOrMessage\([^]*?^    }/m)[0], h.context);
  assert.equal(h.context.imageOrMessage(src, 'Boss panel', 'panel-image'), first);
  assert.equal(replaced.length, 0, 'The caller must insert the returned image first');
  h.paint();
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].className, 'missing');
  assert.match(replaced[0].textContent, /图片加载失败/);
  await h.complete();
});

test('preview paints first; background original replaces it only after loading and decoding', async () => {
  const h = harness(payload());
  await h.complete();
  const image = cardImage();
  let loads = 0;
  image.addEventListener('load', () => loads++);
  h.api.setSource(image, src);
  assert.equal(h.originals.length, 0);
  previewLoaded(image);
  assert.equal(loads, 1);
  assert.equal(h.originals.length, 0);
  h.paint();
  const original = h.originals[0];
  assert.equal(original.src, src);
  assert.equal(original.fetchPriority, 'low');
  assert.equal(original.decoding, 'async');
  const finished = original.onload();
  assert.equal(image.src, `${src}.preview.jpg`);
  original.decoded();
  await finished;
  assert.equal(image.src, src);
  assert.equal(image.dataset.fullSrc, src);
  previewLoaded(image);
  h.paint();
  assert.equal(h.originals.length, 1);
  assert.equal(loads, 2);
});

test('background transfer and decode failures silently retain the preview', async () => {
  for (const failure of ['network', 'decode']) {
    const h = harness(payload());
    await h.complete();
    let errors = 0;
    const image = cardImage();
    image.onerror = () => errors++;
    h.api.setSource(image, src);
    previewLoaded(image);
    h.paint();
    if (failure === 'network') h.originals[0].onerror();
    else await finishOriginal(h.originals[0], true);
    assert.equal(image.src, `${src}.preview.jpg`);
    assert.equal(errors, 0);
  }
});

test('switching faces cancels scheduled upgrades and rejects an already loading old face', async () => {
  const next = 'ps/TITAN_X/TITAN_X_2.jpg';
  const both = { ok: true, images: [src, next], previews: { [src]: `${src}.preview.jpg`, [next]: `${next}.preview.jpg` } };
  const h = harness(both);
  await h.complete(both);
  const image = cardImage();
  h.api.setSource(image, src);
  previewLoaded(image);
  h.api.setSource(image, next);
  h.paint();
  assert.equal(h.originals.length, 0);
  previewLoaded(image);
  h.paint();
  h.api.setSource(image, src);
  await finishOriginal(h.originals[0]);
  assert.equal(image.src, `${src}.preview.jpg`);
  // Returning to the same face still needs its own preview load event.
  previewLoaded(image);
  h.paint();
  await finishOriginal(h.originals[1]);
  assert.equal(image.src, src);
});

test('returning to the same source cannot apply an earlier assignment before its preview loads', async () => {
  const h = harness(payload());
  await h.complete();
  const image = cardImage();
  h.api.setSource(image, src);
  previewLoaded(image);
  h.paint();
  h.api.setSource(image, 'blob:another-face');
  h.api.setSource(image, src);
  await finishOriginal(h.originals[0]);
  assert.equal(image.src, `${src}.preview.jpg`);
});

test('background loading shares requests, limits concurrency, and drops removed queued cards', async () => {
  const sources = [src, 'ps/TITAN_X/TITAN_X_2.jpg', 'ps/TITAN_X/TITAN_X_3.jpg'];
  const all = { ok: true, images: sources, previews: Object.fromEntries(sources.map((value) => [value, `${value}.preview.jpg`])) };
  const h = harness(all);
  await h.complete(all);
  const images = [src, ...sources].map((value) => {
    const image = cardImage();
    h.api.setSource(image, value);
    previewLoaded(image);
    return image;
  });
  h.paint();
  assert.equal(h.originals.length, 2);
  images[3].isConnected = false;
  await finishOriginal(h.originals[0]);
  assert.equal(images[0].src, src);
  assert.equal(images[1].src, src);
  assert.equal(h.originals.length, 2);
  images[2].isConnected = false;
  await finishOriginal(h.originals[1]);
  assert.equal(images[2].src, `${sources[1]}.preview.jpg`);
});

test('cards without previews and encrypted assets use their existing source without background work', async () => {
  const h = harness(payload({}));
  await h.complete(payload({}));
  for (const value of [src, 'blob:hidden-card', 'data:image/jpeg;base64,abc']) {
    const image = cardImage();
    h.api.setSource(image, value);
    previewLoaded(image);
    h.paint();
    assert.equal(image.src, value);
  }
  assert.equal(h.originals.length, 0);
});

test('cold opening starts the small image before inventory and defers the scan until after first paint', async () => {
  const h = harness();
  assert.equal(h.requests.length, 0);
  const image = {};
  h.api.setSource(image, src);
  assert.equal(image.src, `${src}.preview.jpg`);
  await h.complete();
  assert.equal(image.src, `${src}.preview.jpg`);
  assert.equal(image.dataset.fullSrc, src);
  assert.equal(h.requests.length, 1);
  assert.equal(h.links[0].href, `${src}.preview.jpg`);
  assert.equal(h.timers.size, 0);
});

test('cached inventory displays immediately; an unchanged refresh does not notify or rebuild cards', async () => {
  const h = harness(payload());
  const image = {};
  let notifications = 0;
  h.api.subscribe(() => notifications++);
  h.api.setSource(image, src);
  assert.equal(image.src, `${src}.preview.jpg`);
  await h.complete();
  assert.equal(notifications, 0);
  assert.equal(h.links.length, 1);
});

test('newly imported cards replace the cached inventory and notify the view once', async () => {
  const h = harness(payload());
  let notifications = 0;
  h.api.subscribe(() => notifications++);
  const extra = 'ps/TITAN_X/TITAN_X_TR_II_025.png';
  await h.complete({ ...payload(), images: [src, extra] });
  assert.equal(notifications, 1);
  assert.ok(h.api.inventory.images.includes(extra));
  assert.ok(JSON.parse(h.storage.get('aibp-image-inventory-v2')).payload.images.includes(extra));
});

test('removed or broken preview falls back to the original once, preserving the load failure handler', async () => {
  const h = harness(payload());
  let failures = 0;
  const image = { onerror: () => failures++ };
  h.api.setSource(image, src);
  image.onerror();
  assert.equal(image.src, src);
  assert.equal(image.dataset.fullSrc, src);
  assert.equal(failures, 0);
  image.onerror();
  assert.equal(failures, 1);
  await h.complete(payload({}));
  assert.equal(h.api.sourceFor(src), src);
});

test('a view switched before inventory finishes cannot receive the previous card face', async () => {
  const h = harness();
  const image = {};
  h.api.setSource(image, src);
  const next = 'ps/HEKATON/HEKATON.jpg';
  h.api.setSource(image, next);
  await h.complete({ ok: true, images: [src, next], previews: { [next]: `${next}.preview.jpg` } });
  assert.equal(image.src, `${next}.preview.jpg`);
  assert.equal(image.dataset.fullSrc, next);
});

test('offline refresh retains cached cards, and a later explicit retry recovers without duplicate requests', async () => {
  const h = harness(payload());
  await h.complete();
  const offline = h.api.load(true);
  await Promise.resolve();
  h.requests.at(-1).reject(new Error('offline'));
  await offline;
  assert.equal(h.api.sourceFor(src), `${src}.preview.jpg`);
  const retry = h.api.load(true);
  assert.equal(h.api.load(true), retry);
  await Promise.resolve();
  assert.equal(h.requests.length, 3);
  await h.complete(payload({}));
  assert.equal(h.api.sourceFor(src), src);
});

test('inventory normalizes unordered results and ignores paths that cannot be preview sidecars', async () => {
  const h = harness();
  await h.complete({ ok: true, images: [src, src, `${src}.preview.jpg`, '../data/private.jpg'],
    previews: { [src]: '../data/private.jpg' } });
  assert.deepEqual(Array.from(h.api.inventory.images), [src]);
  assert.equal(h.api.sourceFor(src), src);
});

test('grid rendering keeps existing tiles unless cards, view, or inventory actually change', async () => {
  const h = harness(payload());
  await h.complete();
  const grid = { children: [], clears: 0, replaceChildren() { this.clears++; this.children = []; },
    appendChild(child) { this.children.push(child); } };
  const cards = [{ type: 'AI', level: 'I', index: 1 }];
  Object.assign(h.context, { currentApostle: 'TITAN_X', aibpImageIndexRevision: 0,
    cardSrc: (card) => `${src}:${card.index}`, cardAlt: (card) => `AI ${card.index}`,
    imageOrMessage: () => ({ addEventListener() {} }), enableOptionalCardBack() {},
    document: { createElement: () => ({ dataset: {}, appendChild() {} }) },
  });
  const fn = html.match(/^    function renderCardsIntoGrid\([^]*?^    }/m)[0];
  vm.runInContext(fn, h.context);
  h.context.renderCardsIntoGrid(grid, cards, 'empty', 'AI', '弃牌');
  const tile = grid.children[0];
  h.context.renderCardsIntoGrid(grid, JSON.parse(JSON.stringify(cards)), 'empty', 'AI', '弃牌');
  assert.equal(grid.clears, 1);
  assert.equal(grid.children[0], tile);
  cards[0].damageValue = 2;
  h.context.renderCardsIntoGrid(grid, cards, 'empty', 'AI', '弃牌');
  assert.equal(grid.clears, 2);
  h.context.aibpImageIndexRevision++;
  h.context.renderCardsIntoGrid(grid, cards, 'empty', 'AI', '弃牌');
  assert.equal(grid.clears, 3);
});

test('startup and zoom are wired to early image loading and original image bytes', () => {
  assert.ok(html.indexOf('src="card-images.js') < html.indexOf('<style>'));
  assert.ok(html.includes('openImageZoom(img.dataset.fullSrc || img.currentSrc || img.src'));
  assert.match(html, /requestAnimationFrame\(\(\) => window\.setTimeout\(\(\) => \{\s+initializeBattleMap\(\);/);
  assert.match(html, /english-source-data\.js[^>]+defer/);
});

test('AIBP battle board uses only the thumbnail without fetching the original on failure', () => {
  const board = html.match(/<img class="battle-map-board-image"[^>]*>/)[0];
  assert.ok(board.includes('src="../ss/battle-board/battle-board.jpg.preview.jpg"'));
  assert.ok(board.includes('decoding="async"'));
  assert.ok(board.includes('fetchpriority="low"'));
  assert.ok(board.includes('onerror="this.hidden = true"'));
  assert.ok(!board.includes('data-full-src'));
});
