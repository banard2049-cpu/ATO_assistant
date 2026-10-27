const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['map-data.js', 'map-tile-tags.js', 'tile-back-data.js', 'c5-heading-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'map', file), 'utf8'), context);
}
const { ATO_MAP_DATA: map, ATO_MAP_TILE_TAGS: tags, ATO_MAP_BACK_DATA: backs, ATO_C5_HEADING_DATA: covers } = context.window;
const norm = f => f === 'minoians' ? 'minoans' : f.toLowerCase();
const expected = (cycle, id, face) => [...(tags.tiles[`${cycle}:${id}:${face}`]?.factions || tags.tiles[`${cycle}:${id}`].factions)].filter(f => f !== 'none').map(norm);
const values = (svg, attr) => [...svg.matchAll(new RegExp(` ${attr}="([^"]+)"`, 'g'))].map(m => m[1]);
function load(src) {
  assert.match(src, /^\.\/images\/card-backs\/vectors\/[\w-]+\.svg$/);
  const svg = fs.readFileSync(path.resolve(root, 'map', src), 'utf8');
  assert.doesNotMatch(svg, /<(?:\w+:)?(?:image|text|foreignObject)\b|data:image|@font-face|href=/i);
  assert.match(svg, /<path\b/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  return svg;
}

test('all 344 regular backs use complete vector annotations; seven special backs retain their images', () => {
  let regular = 0, special = 0;
  for (const [key, entry] of Object.entries(backs.backs)) {
    if (key.includes('-alt-')) {
      special++;
      assert.match(entry.image, /-alt-back-instruction\.png$/);
      assert.ok(entry.pieces.every(p => p.src.endsWith('.png')));
      continue;
    }
    regular++;
    assert.equal(entry.pieces.length, 1);
    assert.equal(entry.image, undefined);
    const svg = load(entry.pieces[0].src);
    const id = key.split('-')[2];
    if (entry.cycle !== 'c4') {
      assert.deepEqual(values(svg, 'data-number'), [id]);
      assert.deepEqual(values(svg, 'data-faction'), expected(entry.cycle, id));
    }
  }
  assert.equal(regular, 344);
  assert.equal(special, 7);
});

test('C4 annotations match every neighbor, faction and direction, including edge and corner cards', () => {
  const cycle = map.cycles.find(c => c.id === 'c4');
  const dirs = { north: 'up', east: 'right', south: 'down', west: 'left' };
  let arrows = 0, labels = 0;
  for (const tile of cycle.tiles) {
    const svg = load(backs.backs[`c4-tile-${tile.id}-back`].pieces[0].src);
    const kinds = ['number', ...Object.keys(dirs).filter(d => tile.neighbors[dirs[d]])];
    const numbers = kinds.map(d => d === 'number' ? tile.id : tile.neighbors[dirs[d]]);
    assert.deepEqual(values(svg, 'data-direction'), kinds, tile.id);
    assert.deepEqual(values(svg, 'data-number'), numbers, tile.id);
    assert.deepEqual(values(svg, 'data-faction'), numbers.flatMap(n => expected('c4', n)), tile.id);
    assert.deepEqual(values(svg, 'data-arrow'), kinds.filter(d => ['north', 'south'].includes(d)), tile.id);
    arrows += values(svg, 'data-arrow').length;
    labels += numbers.length;
  }
  assert.equal(labels, 369);
  assert.equal(arrows, 144);
});

test('160 C5 vector covers keep face-specific factions, including the 27 A/B differences', () => {
  assert.equal(Object.keys(covers).length, 160);
  let different = 0;
  for (let n = 1; n <= 80; n++) {
    const id = String(n).padStart(3, '0');
    const factions = [];
    for (const [suffix, face] of [['front', 'A'], ['back', 'B']]) {
      const key = `c5-tile-${id}-${suffix}`;
      const svg = load(covers[key].cover);
      assert.deepEqual(values(svg, 'data-number'), [id]);
      assert.deepEqual(values(svg, 'data-faction'), expected('c5', id, face), key);
      factions.push(values(svg, 'data-faction').join(','));
    }
    if (factions[0] !== factions[1]) different++;
  }
  assert.equal(different, 27);
});
