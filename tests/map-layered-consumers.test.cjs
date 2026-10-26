const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function context() {
  const c = vm.createContext({ window: {} });
  for (const file of ['map/tile-artwork-data.js', 'map/tile-artwork.js', 'briefing/briefing-map.js', 'briefing/briefing-gif.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c);
  }
  return c;
}
test('briefing displays both HD layers using its own page-relative paths', () => {
  const c = context();
  const images = [...c.window.ATO_BRIEFING_MAP.artworkLayers('../map/images/c2-tile-038-front.png')];
  const version = encodeURIComponent(c.window.ATO_MAP_ARTWORK_DATA.cornerVectorVersion);
  assert.deepEqual(images, ['../map/images/hd1024/base/c2-tile-038-front.png', `../map/images/hd1024/overlay/c2-tile-038-front-corners.svg?v=${version}`]);
  assert.deepEqual([...c.window.ATO_BRIEFING_MAP.artworkLayers('../map/images/custom.png')], ['../map/images/custom.png']);
});
test('GIF/PDF loader composes base then mask in memory without requesting the retired scan', async () => {
  const c = context(); const loaded = []; const drawn = [];
  const doc = { createElement(type) {
    if (type === 'canvas') return { getContext() { return { drawImage(image) { drawn.push(image.src); } }; } };
    return { naturalWidth: 1024, naturalHeight: 1024, set src(value) { this._src = value; loaded.push(value); this.onload(); }, get src() { return this._src; } };
  } };
  const result = await c.window.ATO_BRIEFING_GIF.loadImage('../map/images/c5-tile-040-back.png', doc);
  assert.equal(result.width, 1024); assert.equal(result.height, 1024);
  const version = encodeURIComponent(c.window.ATO_MAP_ARTWORK_DATA.cornerVectorVersion);
  assert.deepEqual(loaded, ['../map/images/hd1024/base/c5-tile-040-back.png', `../map/images/hd1024/overlay/c5-tile-040-back-corners.svg?v=${version}`]);
  assert.deepEqual(drawn, loaded);
});
test('GIF/PDF export composes an old PNG mask when the SVG is unavailable', async () => {
  const c = context(); const loaded = []; const drawn = [];
  const doc = { createElement(type) {
    if (type === 'canvas') return { getContext() { return { drawImage(image) { drawn.push(image.src); } }; } };
    return { naturalWidth: 1024, naturalHeight: 1024, set src(value) {
      this._src = value; loaded.push(value);
      if (value.includes('-corners.svg')) this.onerror(); else this.onload();
    }, get src() { return this._src; } };
  } };
  await c.window.ATO_BRIEFING_GIF.loadImage('../map/images/c1-tile-009-alt-front.jpg', doc);
  assert.equal(loaded.length, 3);
  assert.match(loaded[1], /c1-tile-009-alt-front-corners\.svg/);
  assert.match(loaded[2], /hd1024\/overlay\/c1-tile-009-alt-front\.png/);
  assert.deepEqual(drawn, [loaded[0], loaded[2]]);
  assert.ok(loaded.every(path => path.includes('hd1024')));
});
test('background previews try the alternate mask and discard loads from a previously selected tile', async () => {
  const c = context(); const images = [];
  const doc = { createElement() { const image = {}; images.push(image); return image; } };
  const node = { style: {} };
  const api = c.window.ATO_MAP_ARTWORK;
  const toUrl = path => `../map/${path.replace(/^\.\//, '')}`;
  const old = api.paintBackground(node, './images/c1-tile-001-front.jpg', toUrl, doc);
  await Promise.resolve();
  images[0].onerror();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(images[1].src, /hd1024\/overlay\/c1-tile-001-front\.png/);
  images[1].onload();
  await old;
  assert.match(node.style.backgroundImage, /hd1024\/overlay\/c1-tile-001-front\.png/);
  assert.match(node.style.backgroundImage, /hd1024\/base\/c1-tile-001-front\.png/);
  const pending = api.paintBackground(node, './images/c1-tile-001-front.jpg', toUrl, doc);
  await Promise.resolve();
  const selected = api.paintBackground(node, './images/c1-tile-002-front.jpg', toUrl, doc);
  await Promise.resolve();
  images[3].onload(); await selected;
  images[2].onload(); await pending;
  assert.match(node.style.backgroundImage, /c1-tile-002-front-corners\.svg/);
  assert.doesNotMatch(node.style.backgroundImage, /c1-tile-001/);
});
test('Android GIF/PDF export decodes native SVG and old PNG mask data URLs', async () => {
  for (const mime of ['image/svg+xml', 'image/png']) {
    const c = context(); const decoded = [];
    c.URL = URL;
    c.window.location = { href: 'file:///android_asset/web/briefing/index.html' };
    c.window.ATOAndroid = { readExportImageData(path) { return `data:${path.includes('/base/') ? 'image/png' : mime};base64,AAAA`; } };
    const doc = { baseURI: c.window.location.href, createElement(type) {
      if (type === 'canvas') return { getContext() { return { drawImage() {} }; } };
      return { naturalWidth: 1024, naturalHeight: 1024, set src(value) { decoded.push(value); this.onload(); } };
    } };
    const result = await c.window.ATO_BRIEFING_GIF.loadImage('../map/images/c1-tile-001-front.jpg', doc);
    assert.equal(result.width, 1024);
    assert.deepEqual(decoded, ['data:image/png;base64,AAAA', `data:${mime};base64,AAAA`]);
  }
});
test('tag editor loads the shared registry and previews overlay above base', () => {
  const html = fs.readFileSync(path.join(root, 'tools/tag-editor.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'tools/tag-editor.js'), 'utf8');
  assert.match(html, /src="\.\.\/map\/map-data\.js/);
  assert.match(html, /src="\.\.\/map\/tile-artwork-data\.js/);
  assert.match(source, /\[artwork\.overlay, artwork\.base\]/);
  assert.doesNotMatch(source, /tileImage\.src\s*=/);
});
