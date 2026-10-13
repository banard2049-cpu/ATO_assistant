const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/map-tile-corner-audit.json'), 'utf8'));
const context = vm.createContext({ window: {} });
for (const file of ['map/map-data.js', 'map/map-tile-tags.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const mapData = context.window.ATO_MAP_DATA;
const tagData = context.window.ATO_MAP_TILE_TAGS;
context.mapTagData = tagData;
const mapSource = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8');
vm.runInContext(mapSource.slice(mapSource.indexOf('function tileFaceId('), mapSource.indexOf('function tileTagIds(')), context);

const plain = value => JSON.parse(JSON.stringify(value));
const pdTags = entry => ['progress', 'calamity'].filter(tag => entry.tags.includes(tag));

for (const [variant, rows] of Object.entries(audit.marks)) {
  test(`${variant}: corner tags match every visually reviewed tile`, () => {
    const cycleId = variant.slice(0, 2);
    const cycle = mapData.cycles.find(item => item.id === cycleId);
    const alternate = variant.endsWith('-B') || variant.endsWith('-alt');
    const reviewedIds = [];
    for (const row of rows) {
      const [tileId, mark] = row.split(':');
      const match = /^(PD|P|D|-)([A-Z-]+)$/.exec(mark);
      assert.ok(match, row);
      const [, left, right] = match;
      const expectedTags = ['progress', 'calamity'].filter(tag => left.includes(audit.legend[tag]));
      const expectedFactions = [...right].map(code => audit.legend.factions[cycleId][code]);
      assert.ok(expectedFactions.every(Boolean), row);
      assert.ok(cycle.tiles.some(tile => tile.id === tileId), row);
      const entry = context.tileTagEntry(cycleId, tileId, { tileVariants: alternate ? { [tileId]: 'alternate' } : {} });
      assert.ok(entry, `${variant}:${tileId} must have tags`);
      assert.deepEqual(plain(pdTags(entry)), expectedTags, `${variant}:${tileId} progress/calamity`);
      assert.deepEqual(plain(entry.factions).sort(), expectedFactions.sort(), `${variant}:${tileId} factions`);
      reviewedIds.push(tileId);
    }
    assert.equal(new Set(reviewedIds).size, rows.length, 'No tile may be counted twice');
    if (variant.endsWith('-alt')) {
      assert.deepEqual(reviewedIds, ['009', '013', '014', '018', '022', '023', '035']);
    } else {
      assert.deepEqual(reviewedIds.sort(), plain(cycle.tiles.map(tile => tile.id)).sort(), 'Audit must cover the whole cycle');
    }
  });
}

test('tag editor keeps all audited base and face entries when normalizing a save', () => {
  const source = fs.readFileSync(path.join(root, 'tools/tag-editor.js'), 'utf8');
  const editor = vm.createContext({ tagDefinitionDefaults: [] });
  vm.runInContext(source.slice(source.indexOf('function clone('), source.indexOf('async function loadTagData(')), editor);
  const normalized = editor.normalizeData(tagData);
  assert.deepEqual(plain(normalized.tiles), plain(tagData.tiles));
  assert.deepEqual(plain(normalized.tagDefinitions), plain(tagData.tagDefinitions));
});

test('changing C5 faces reads independent progress/calamity and faction marks', () => {
  const saved = { tileVariants: {} };
  assert.deepEqual(plain(context.tileTagEntry('c5', '008', saved).factions), ['cycladeanProtectorate']);
  saved.tileVariants['008'] = 'alternate';
  assert.deepEqual(plain(context.tileTagEntry('c5', '008', saved).factions), ['followersOfArete']);
  assert.deepEqual(plain(pdTags(context.tileTagEntry('c5', '035', saved))), ['progress', 'calamity']);
  saved.tileVariants['035'] = 'alternate';
  assert.deepEqual(plain(pdTags(context.tileTagEntry('c5', '035', saved))), ['progress']);
  delete saved.tileVariants['008'];
  assert.deepEqual(plain(context.tileTagEntry('c5', '008', saved).factions), ['cycladeanProtectorate']);
});
