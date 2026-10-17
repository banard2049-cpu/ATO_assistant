const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const nonzero = value => Object.fromEntries(Object.entries(clone(value)).filter(([, amount]) => amount));

function harness(apostle, level, index) {
  const element = () => ({ style: {}, appendChild() {}, addEventListener() {} });
  const ctx = vm.createContext({
    console, currentApostle: apostle,
    piles: { [apostle]: { BP: { damage: [{ type: 'BP', level, index }], deck: [], discard: [] }, special: {} } },
    localStorage: { getItem: () => null },
    document: { readyState: 'complete', head: element(), body: element(),
      createElement: element, getElementById: () => null, querySelector: () => null },
    cardFileName: card => `${apostle}_BP_${card.level}_${String(card.index).padStart(3, '0')}.jpg`,
  });
  ctx.window = ctx;
  for (const file of ['bp_resource_map.js', 'bp_resource_map_c1_c3.js', 'bp_resource_map_c4_c5.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'aibp/ps/other/resouce', file), 'utf8'), ctx);
  }
  const source = fs.readFileSync(path.join(root, 'aibp/bp_loot_calculator_addon.js'), 'utf8');
  vm.runInContext(source.replace('window.AIBP_calculateBpLoot = calculateBpLoot;',
    'window.AIBP_calculateBpLoot = calculateBpLoot; window.applyLoot = applyLootResultToRecord;'), ctx);
  return ctx;
}

// Counts transcribed from the local original artwork, independently of the maps.
// This checks actual rewards too: reading the expected values back out of a map
// would fail to detect a mislabeled printed icon.
const correctedCards = [
  ...[1, 3, 5].map(index => ['MIDASCORE', 'II', index, { cursedBloatsack: 1 }]),
  ...[1, 2, 3].map(index => ['MIDASCORE', 'III', index, { mutableAmbrosia: 1, cursedBloatsack: 1 }]),
  ['HERMESIAN_PURSUER', 'III', 6, { PW: 2, GB: 4 }],
  ['SUN_DESCENDANT', 'I', 1, { SK: 1 }],
  ['SUN_DESCENDANT', 'I', 3, { WT: 1, SK: 1 }],
  ['SUN_DESCENDANT', 'I', 5, { FA: 1, SK: 1 }],
  ...[1, 6].map(index => ['SUN_DESCENDANT', 'II', index, { FA: 2, SK: 1 }]),
  ...[3, 5].map(index => ['SUN_DESCENDANT', 'II', index, { WT: 1, SK: 1, FA: 1 }]),
  ...[3, 4, 6].map(index => ['SUN_DESCENDANT', 'III', index, { SK: 2, FA: 4 }]),
  ...[2, 3].map(index => ['CHIMERA_METASTASIOS', 'II', index, { CT: 1 }]),
  ['THE_BURDEN', 'III', 3, { RT: 2, EF: 4 }],
];

for (const [apostle, level, index, resources] of correctedCards) {
  test(`${apostle} BP ${level}-${index}: printed icons reach loot totals and record fields`, () => {
    const ctx = harness(apostle, level, index);
    const file = `${apostle}_BP_${level}_${String(index).padStart(3, '0')}.jpg`;
    assert.deepEqual(nonzero(ctx.AIBP_BP_RESOURCE_MAP[apostle][file]), resources);
    const result = ctx.AIBP_calculateBpLoot({ multiplier: 1 });
    assert.deepEqual(nonzero(result.totals), { ...resources, ...(level === 'III' ? { core: 1 } : {}) });
    const saved = ctx.applyLoot({}, result).record.resources;
    if (apostle === 'MIDASCORE') {
      assert.equal(saved['c4-cursedBloatsack'], 1);
      assert.equal(saved['c4-burnedOutGrace'], undefined);
    }
    if (apostle === 'SUN_DESCENDANT') {
      assert.equal(saved['c3-sunburnedSkull'], resources.SK);
      assert.equal(saved.skinOfMalice, undefined);
    }
    if (apostle === 'HERMESIAN_PURSUER') {
      assert.equal(saved.powderedMatter, 2);
      assert.equal(saved.grotesqueBeak, 4);
    }
  });
}
