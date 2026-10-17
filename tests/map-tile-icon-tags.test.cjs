const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/map-tile-icon-audit.json'), 'utf8'));
const context = vm.createContext({ window: {} });
for (const file of ['map/map-data.js', 'map/map-tile-tags.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const mapData = context.window.ATO_MAP_DATA;
const tagData = context.window.ATO_MAP_TILE_TAGS;
context.mapTagData = tagData;
const source = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('function tileFaceId('), source.indexOf('function tileTagIds(')), context);
const plain = value => JSON.parse(JSON.stringify(value));
const nonCornerTags = entry => plain(entry.tags).filter(tag => !['progress', 'calamity'].includes(tag)).sort();

for (const [variant, groups] of Object.entries(audit.tagGroups)) {
  test(`${variant}: all other printed icons match the visual review`, () => {
    const cycleId = variant.slice(0, 2);
    const cycle = mapData.cycles.find(item => item.id === cycleId);
    const alternate = variant.endsWith('-B') || variant.endsWith('-alt');
    const ids = variant.endsWith('-alt') ? audit.alternateTileIds : plain(cycle.tiles.map(tile => tile.id));
    const knownIds = new Set(ids);
    for (const [tag, taggedIds] of Object.entries(groups)) {
      assert.equal(new Set(taggedIds).size, taggedIds.length, `${tag} must not repeat tiles`);
      taggedIds.forEach(id => assert.ok(knownIds.has(id), `${variant}:${id} must exist`));
    }
    for (const id of ids) {
      const entry = context.tileTagEntry(cycleId, id, { tileVariants: alternate ? { [id]: 'alternate' } : {} });
      const expected = Object.entries(groups).filter(([, taggedIds]) => taggedIds.includes(id)).map(([tag]) => tag).sort();
      assert.deepEqual(nonCornerTags(entry), expected, `${variant}:${id}`);
    }
  });
}

test('all stored tags have definitions and retired adventure mislabels are gone', () => {
  const definitions = new Map(tagData.tagDefinitions.map(item => [item.id, item]));
  for (const [key, entry] of Object.entries(tagData.tiles)) {
    assert.ok(!entry.tags.includes('adventure'), `${key} must classify the actual printed symbol`);
    for (const tag of entry.tags) {
      assert.ok(definitions.has(tag), `${key}: undefined tag ${tag}`);
      const cycles = definitions.get(tag).cycles || [];
      assert.ok(!cycles.length || cycles.includes(entry.cycleId), `${key}: ${tag} is for another cycle`);
    }
  }
});

test('C5 keeps every face explicit and its base non-corner tags agree with A', () => {
  for (const tile of mapData.cycles.find(cycle => cycle.id === 'c5').tiles) {
    const key = `c5:${tile.id}`;
    assert.ok(tagData.tiles[`${key}:A`], `${key}:A`);
    assert.ok(tagData.tiles[`${key}:B`], `${key}:B`);
    assert.deepEqual(nonCornerTags(tagData.tiles[key]), nonCornerTags(tagData.tiles[`${key}:A`]));
  }
});

test('C1 alternate 022 does not inherit attributes from its outgoing neighbor hint', () => {
  const standard = context.tileTagEntry('c1', '022', { tileVariants: {} });
  const alternate = context.tileTagEntry('c1', '022', { tileVariants: { '022': 'alternate' } });
  for (const tag of ['river', 'restricted']) {
    assert.equal(standard.tags.includes(tag), false);
    assert.equal(alternate.tags.includes(tag), false);
  }
  assert.deepEqual(plain(alternate.factions), plain(standard.factions));
  assert.deepEqual(plain(alternate.tags).filter(tag => ['progress', 'calamity'].includes(tag)),
    plain(standard.tags).filter(tag => ['progress', 'calamity'].includes(tag)));
});

test('directional hints keep their target separate from source tile attributes', () => {
  assert.deepEqual(plain(tagData.neighborHints), audit.neighborHints);
  assert.deepEqual(plain(tagData.localRoutes), audit.localRoutes);
  assert.ok(!tagData.tiles['c1:019'].tags.includes('river'));
  assert.ok(tagData.tiles['c1:024'].tags.includes('river'));
  const river = tagData.neighborHints['c1:019'].find(hint => hint.tags.includes('river'));
  assert.equal(river.targetTileId, '024');
  assert.equal(river.direction, 'down');
  assert.ok(tagData.neighborHints['c1:022:alt'].some(hint => hint.targetTileId === '023'));
  assert.ok(!tagData.tiles['c5:062:A'].tags.includes('helmet_icon'));
  assert.ok(!tagData.tiles['c5:062:A'].tags.includes('restricted'));
  assert.ok(tagData.tiles['c2:021'].tags.includes('restricted'), 'An internal alpha/beta connection remains a local route');
});
