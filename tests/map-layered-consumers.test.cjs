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
  assert.deepEqual(images, ['../map/images/hd1024/base/c2-tile-038-front.png', '../map/images/hd1024/overlay/c2-tile-038-front.png']);
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
  assert.deepEqual(loaded, ['../map/images/hd1024/base/c5-tile-040-back.png', '../map/images/hd1024/overlay/c5-tile-040-back.png']);
  assert.deepEqual(drawn, loaded);
});
test('tag editor loads the shared registry and previews overlay above base', () => {
  const html = fs.readFileSync(path.join(root, 'tools/tag-editor.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'tools/tag-editor.js'), 'utf8');
  assert.match(html, /src="\.\.\/map\/map-data\.js/);
  assert.match(html, /src="\.\.\/map\/tile-artwork-data\.js/);
  assert.match(source, /\[artwork\.overlay, artwork\.base\]/);
  assert.doesNotMatch(source, /tileImage\.src\s*=/);
});
