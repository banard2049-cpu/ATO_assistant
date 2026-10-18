const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const indexSource = fs.readFileSync(path.join(root, 'aibp/index.html'), 'utf8');
const specialSource = fs.readFileSync(path.join(root, 'aibp/c45_specials.js'), 'utf8');
const calculatorSource = fs.readFileSync(path.join(root, 'aibp/bp_loot_calculator_addon.js'), 'utf8');
const mapFiles = ['bp_resource_map.js', 'bp_resource_map_c1_c3.js', 'bp_resource_map_c4_c5.js'];

function entryFunction(source, name, indent) {
  const start = source.indexOf(`${indent}function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in the application`);
  const end = source.indexOf(`\n${indent}}`, start);
  assert.notEqual(end, -1, `${name} must have its closing brace`);
  return source.slice(start, end + indent.length + 2);
}

// Rendering only needs the controls and HTML sinks; calculation, detail markup,
// clipboard text and record conversion all run their real application code.
class Element {
  constructor() {
    this.style = {};
    this.dataset = {};
    this.innerHTML = '';
    this.children = [];
    this.selectors = new Map();
  }
  appendChild(child) { this.children.push(child); }
  addEventListener() {}
  insertAdjacentHTML(position, html) {
    assert.equal(position, 'beforeend');
    this.innerHTML += html;
  }
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new Element());
    return this.selectors.get(selector);
  }
  querySelectorAll() { return []; }
}

function harness() {
  const ctx = vm.createContext({
    console, currentApostle: '', piles: {},
    localStorage: { getItem: () => null },
    document: {
      readyState: 'complete', head: new Element(), body: new Element(),
      createElement: () => new Element(), getElementById: () => null,
      querySelector: () => new Element(),
    },
    HeliosAssets: { path: source => source },
  });
  ctx.window = ctx;
  for (const file of mapFiles) {
    vm.runInContext(fs.readFileSync(path.join(root, 'aibp/ps/other/resouce', file), 'utf8'), ctx);
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'aibp/5158e31a.js'), 'utf8'), ctx);
  for (const name of ['numberedName', 'cardFileName']) {
    vm.runInContext(entryFunction(indexSource, name, '    '), ctx);
  }
  vm.runInContext(specialSource.match(/  const DAHAKA_AI_LEVELS = \{[^]*?\n  \};/)[0], ctx);
  for (const name of ['makeCard', 'dahakaAiLevel', 'makeDahakaCard']) {
    vm.runInContext(entryFunction(specialSource, name, '  '), ctx);
  }
  vm.runInContext(calculatorSource.replace(
    'window.AIBP_calculateBpLoot = calculateBpLoot;',
    'window.AIBP_calculateBpLoot = calculateBpLoot; window.copyLoot = resultToText; window.applyLoot = applyLootResultToRecord; window.renderLoot = renderLootResult;'
  ), ctx);
  ctx.calculate = (apostle, damage, options = {}, pool = {}) => {
    ctx.currentApostle = apostle;
    ctx.piles[apostle] = {
      BP: { damage, damage1: [], damage2: [], deck: [], discard: [], supply: { I: [], II: [], III: [] }, ...pool },
      special: {},
    };
    return ctx.AIBP_calculateBpLoot({ multiplier: 1, sceneId: 'normal', ...options });
  };
  return ctx;
}

const apostles = [
  'HEKATON', 'LABYRINTHAUROS', 'HERMESIAN_PURSUER', 'ALPHA_TEMENOS',
  'CHIMERA_METASTASIOS', 'CYCLONUS', 'THE_BURDEN', 'THE_NIETZSCJEAN',
  'HYPERTIME_ORACLE', 'ICARIAN_HARPY', 'SUN_DESCENDANT', 'MIDASCORE',
  'DEMIDJINN', 'THE_BABELIAN_LUNACY', 'DAHAKA', 'DRAGON_OF_PHOBOS',
  'MEDUKETOS', 'UR_FLEECE', 'TITAN_X',
];
const bp = (level, index) => ({ type: 'BP', level, index });
const sw = () => ({ special: 'SW' });
const dw = () => ({ special: 'DW' });
const nonzero = value => Object.fromEntries(Object.entries(clone(value)).filter(([, amount]) => amount !== 0));

function recordHarness(cycle, resources = {}) {
  const source = fs.readFileSync(path.join(root, 'record/index.html'), 'utf8').replace(/\r\n/g, '\n');
  const ctx = vm.createContext({ state: { cycle, resources: clone(resources) } });
  vm.runInContext(source.slice(source.indexOf('    const cycleData = '), source.indexOf('    const elements = ')), ctx);
  for (const name of ['isPlainObject', 'cloneJson', 'normalizeResources', 'migrateSharedResourceKey',
    'currentCycle', 'currentNemesis', 'currentResources', 'resourceStorageKey']) {
    vm.runInContext(entryFunction(source, name, '    '), ctx);
  }
  return ctx;
}

function cardForFile(ctx, apostle, fileName) {
  const match = fileName.match(/_(BP|AI)_(I|II|III)_(\d{3})\.jpg$/);
  assert.ok(match, fileName);
  const [, type, level, rawIndex] = match;
  const index = Number(rawIndex);
  if (apostle === 'DAHAKA') return ctx.makeDahakaCard(level, index);
  if (apostle === 'BLACKBEAK') {
    const card = ctx.BlackbeakCardList.BP[level].find(item => item.index === index);
    assert.ok(card, `Blackbeak's real deck must contain ${fileName}`);
    return clone(card);
  }
  return { type, level, index };
}

test('the ordinary-card audit includes every resource-map apostle and Blackbeak\'s real 17-card deck', () => {
  const ctx = harness();
  assert.deepEqual(Object.keys(ctx.AIBP_BP_RESOURCE_MAP).sort(), [...apostles].sort());
  assert.equal(Object.values(ctx.AIBP_BP_RESOURCE_MAP).reduce((sum, map) => sum + Object.keys(map).length, 0), 342);
  assert.equal(['I', 'II', 'III'].reduce((sum, level) => sum + ctx.BlackbeakCardList.BP[level].length, 0), 17);
  assert.ok(!ctx.BlackbeakCardList.BP.III.some(card => card.index === 6), 'Black Blood Cryptex stays excluded');
});

for (const apostle of [...apostles, 'BLACKBEAK']) {
  test(`${apostle}: every ordinary damage card preserves its mapped resources and BP III core`, () => {
    const ctx = harness();
    // Blackbeak intentionally reuses the Pursuer artwork and resource labels,
    // excluding its removed III 006 card. Build the expected map independently.
    const map = apostle === 'BLACKBEAK'
      ? Object.fromEntries(Object.entries(ctx.AIBP_BP_RESOURCE_MAP.HERMESIAN_PURSUER)
        .filter(([fileName]) => fileName !== 'HERMESIAN_PURSUER_BP_III_006.jpg')
        .map(([fileName, resource]) => [fileName.replace('HERMESIAN_PURSUER', 'BLACKBEAK'), resource]))
      : ctx.AIBP_BP_RESOURCE_MAP[apostle];
    for (const [fileName, resource] of Object.entries(map)) {
      const card = cardForFile(ctx, apostle, fileName);
      const result = ctx.calculate(apostle, [card]);
      const core = (card.bpLevel || card.level) === 'III' ? 1 : 0;
      assert.equal(result.battle.resourcePolicy, 'normal', fileName);
      assert.equal(result.resourceMultiplier, 1, fileName);
      assert.deepEqual(nonzero(result.totals), nonzero({ ...resource, core }), fileName);
      assert.equal(result.details.direct.length, 1, fileName);
      assert.equal(result.details.direct[0].fileName, fileName);
      assert.deepEqual(nonzero(result.details.direct[0].resource), nonzero(resource), fileName);
      assert.equal(result.details.direct[0].multiplier, 1, fileName);
      assert.equal(result.woundedBpIIICount, core, fileName);
      assert.deepEqual(clone(result.warnings), apostle === 'CHIMERA_METASTASIOS'
        ? ['Chimera bonus: no reward row matched regular 1 / secondary 0.'] : [], fileName);
      assert.equal(result.validationErrors.length, 0, fileName);
    }
  });
}

for (const [apostle, resource, recordKey] of [
  ['HEKATON', 'RA', 'c1-rawAmbrosia'], ['LABYRINTHAUROS', 'RA', 'c1-rawAmbrosia'],
  ['HYPERTIME_ORACLE', 'FA', 'c3-frozenAmbrosia'], ['ICARIAN_HARPY', 'FA', 'c3-frozenAmbrosia'],
]) {
  test(`${apostle}: III/IV panel ambrosia survives calculation, copy, display and record settlement`, () => {
    const ctx = harness();
    const base = ctx.AIBP_BP_RESOURCE_MAP[apostle][`${apostle}_BP_I_001.jpg`][resource] || 0;
    for (const [level, extra] of [[3, 3], [4, 12]]) {
      const result = ctx.calculate(apostle, [bp('I', 1)], { multiplier: level });
      const expected = base * level + extra;
      assert.equal(result.totals[resource], expected);
      assert.equal(result.details.levelBonus[0].resource[resource], extra);
      assert.ok(ctx.copyLoot(result).includes('始徒等级奖励'));
      const dialog = new Element();
      ctx.renderLoot(dialog, result);
      assert.ok(dialog.querySelector('.loot-details').innerHTML.includes('始徒等级奖励'));
      const record = { resources: { [recordKey]: 7, bone: 2 } };
      const saved = ctx.applyLoot(record, result);
      assert.equal(saved.record.resources[recordKey], 7 + expected);
      assert.equal(saved.record.resources.bone, 2);
      assert.equal(saved.skipped.length, 0);
      assert.equal(record.resources[recordKey], 7, 'settlement preserves the original record');
    }
  });
}

test('Temenos direct, SW and DW loot, a wounded III core and story resources all survive calculation, copy, record and rendering', () => {
  const ctx = harness();
  const damage = [bp('III', 1), sw(), dw()];
  const pool = { deck: [bp('I', 1)], discard: [bp('III', 2)] };
  const before = clone({ damage, ...pool });
  const result = ctx.calculate('ALPHA_TEMENOS', damage, {}, pool);
  assert.equal(result.regularDamageCount, 4);
  assert.equal(result.resourceMultiplier, 1);
  assert.equal(result.battle.resourcePolicy, 'normal');
  assert.deepEqual(nonzero(result.totals), { RA: 4, FE: 2, MF: 2, core: 1 });
  assert.equal(result.storyBonus.choiceCount, 0);
  assert.deepEqual(clone(result.details.direct.map(item => item.fileName)), ['ALPHA_TEMENOS_BP_III_001.jpg']);
  assert.deepEqual(clone(result.details.sw.map(item => item.fileName)), ['ALPHA_TEMENOS_BP_I_001.jpg']);
  assert.deepEqual(clone(result.details.dw.map(item => item.fileName)), ['ALPHA_TEMENOS_BP_III_002.jpg']);
  assert.equal(result.details.coreBonus.length, 1, 'a DW III resource draw does not add another wounded core');
  assert.equal(result.details.storyBonus.length, 1);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.validationErrors.length, 0);
  assert.deepEqual(clone({ damage, ...pool }), before, 'settlement must not mutate the physical card piles');

  const copied = ctx.copyLoot(result);
  for (const text of ['BP 损伤卡：ALPHA_TEMENOS_BP_III_001.jpg', '单重损伤 #1：ALPHA_TEMENOS_BP_I_001.jpg',
    '双重损伤 #1：ALPHA_TEMENOS_BP_III_002.jpg', '暴击 BP III 核心奖励', '神浆原液：4', '迷宫碎片：2']) {
    assert.ok(copied.includes(text), text);
  }
  const originalRecord = { resources: { 'c1-rawAmbrosia': 3, fearEssence: 5, mazeFragment: 7, 'c1-core-temenos': 2 } };
  const saved = ctx.applyLoot(originalRecord, result, 'c1');
  assert.equal(saved.record.resources['c1-rawAmbrosia'], 7);
  assert.equal(saved.record.resources.fearEssence, 7);
  assert.equal(saved.record.resources.mazeFragment, 9);
  assert.equal(saved.record.resources['c1-core-temenos'], 3);
  assert.equal(saved.skipped.length, 0);
  assert.deepEqual(originalRecord.resources, { 'c1-rawAmbrosia': 3, fearEssence: 5, mazeFragment: 7, 'c1-core-temenos': 2 });

  const dialog = new Element();
  ctx.renderLoot(dialog, result);
  const summary = dialog.querySelector('.loot-summary').innerHTML;
  const details = dialog.querySelector('.loot-details').innerHTML;
  assert.ok(summary.includes('BP 资源与特殊奖励'));
  assert.ok(summary.includes('神浆原液'));
  assert.ok(!summary.includes('没有获得资源'));
  for (const text of ['普通 BP 损伤卡', '通用单重损伤结算', '通用双重损伤结算',
    'ALPHA_TEMENOS_BP_III_001.jpg', 'ALPHA_TEMENOS_BP_I_001.jpg', 'ALPHA_TEMENOS_BP_III_002.jpg',
    '暴击 BP III 核心奖励', '故事书额外资源']) assert.ok(details.includes(text), text);
  assert.equal(dialog.querySelector('.loot-record-button').disabled, false);
});

for (const [apostle, bonus, options] of [
  ['ALPHA_TEMENOS', { MF: 2, MC: 1 }, { resourceChoices: { MC: 1 } }],
  ['THE_NIETZSCJEAN', { LS: 2, CT: 1 }, { nietzscheChoices: { CT: 1 } }],
  ['SUN_DESCENDANT', { SK: 1 }, {}],
  ['THE_BABELIAN_LUNACY', { blackTaintedStepfinger: 1 }, {}],
  ['UR_FLEECE', { blackWoolStrand: 2, hydradynamicScales: 1 }, { resourceChoices: { hydradynamicScales: 1 } }],
]) {
  test(`${apostle}: damage-table bonuses add to all five card rewards`, () => {
    const ctx = harness();
    const damage = [1, 2, 3, 4, 5].map(index => bp('I', index));
    const expected = { ...bonus };
    for (const card of damage) {
      const resource = ctx.AIBP_BP_RESOURCE_MAP[apostle][ctx.cardFileName(card, apostle)];
      for (const [key, amount] of Object.entries(resource)) expected[key] = (expected[key] || 0) + amount;
    }
    const result = ctx.calculate(apostle, damage, options);
    assert.deepEqual(nonzero(result.totals), nonzero(expected));
    assert.equal(result.details.direct.length, damage.length);
    assert.equal(result.resourceMultiplier, 1);
    assert.equal(result.validationErrors.length, 0);
    assert.equal(result.warnings.length, 0);
  });
}

test('Dahaka SW and DW use the combined AI/BP deck and discard, ordered by printed BP level', () => {
  const ctx = harness();
  const bpI = ctx.makeDahakaCard('I', 1);
  const bpII = ctx.makeDahakaCard('II', 6);
  const bpIII = ctx.makeDahakaCard('III', 1);
  assert.equal(bpI.type, 'AI');
  assert.equal(bpI.level, 'II');
  assert.equal(bpI.bpLevel, 'I');
  assert.equal(bpII.level, 'I');
  assert.equal(bpII.bpLevel, 'II');
  const pool = { deck: [bpI], discard: [bpII, bpIII] };
  const before = clone(pool);
  const result = ctx.calculate('DAHAKA', [sw(), sw(), dw()], {}, pool);
  assert.deepEqual(clone(result.details.sw.map(item => item.fileName)), ['DAHAKA_AI_I_001.jpg', 'DAHAKA_AI_II_006.jpg']);
  assert.deepEqual(clone(result.details.dw.map(item => item.fileName)), ['DAHAKA_AI_III_001.jpg']);
  assert.deepEqual(nonzero(result.totals), { onyxDust: 3, ireEssence: 2 });
  assert.equal(result.details.coreBonus.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(clone(pool), before);
});

test('ambush and finale encounters keep their explicit exceptions to ordinary card loot', () => {
  const ctx = harness();
  for (const apostle of ['HEKATON', 'LABYRINTHAUROS']) {
    const result = ctx.calculate(apostle, [bp('III', 1), sw(), dw()], { sceneId: 'ambush', multiplier: 4 },
      { deck: [bp('I', 1), bp('III', 2)] });
    assert.equal(result.battle.resourcePolicy, 'coreOnly');
    assert.deepEqual(nonzero(result.totals), { core: 1 });
    assert.equal(result.details.direct.length + result.details.sw.length + result.details.dw.length, 0);
  }
  for (const [apostle, sceneId] of [
    ['ALPHA_TEMENOS', 'temenos-final'], ['THE_NIETZSCJEAN', 'nietzsche-final'],
    ['SUN_DESCENDANT', 'sun-final'], ['THE_BABELIAN_LUNACY', 'babel-final'], ['UR_FLEECE', 'ur-final'],
  ]) {
    const result = ctx.calculate(apostle, [bp('III', 1), sw(), dw()], { sceneId },
      { deck: [bp('I', 1), bp('III', 2)] });
    assert.equal(result.battle.resourcePolicy, 'none');
    assert.deepEqual(nonzero(result.totals), {});
    assert.equal(result.storyBonus, null);
    assert.equal(result.details.direct.length + result.details.sw.length + result.details.dw.length, 0);
  }
});

test('every Boss core writes to a field exposed by the real record resource list', () => {
  const ctx = harness();
  for (const apostle of [...apostles, 'BLACKBEAK']) {
    const card = apostle === 'DAHAKA' ? ctx.makeDahakaCard('III', 1)
      : apostle === 'BLACKBEAK' ? clone(ctx.BlackbeakCardList.BP.III[0]) : bp('III', 1);
    const result = ctx.calculate(apostle, [card]);
    const saved = ctx.applyLoot({}, result);
    assert.equal(saved.skipped.length, 0, apostle);
    const record = recordHarness(saved.cycle, saved.record.resources);
    const visibleKeys = Array.from(record.currentResources(), item => record.resourceStorageKey(item.key));
    const coreKeys = Object.keys(saved.record.resources).filter(key => key.includes('-core-'));
    assert.equal(coreKeys.length, 1, apostle);
    assert.ok(visibleKeys.includes(coreKeys[0]), `${apostle}: ${coreKeys[0]} must be visible`);
    assert.equal(saved.record.resources[coreKeys[0]], 1, apostle);
  }
});

test('old hidden AIBP core awards are recovered once in both record loading and new settlement', () => {
  const ctx = harness();
  for (const [apostle, cycle, legacy, current] of [
    ['ALPHA_TEMENOS', 'c1', 'alpha-temenos', 'temenos'],
    ['HYPERTIME_ORACLE', 'c3', 'hypertime-oracle', 'oracle'],
    ['ICARIAN_HARPY', 'c3', 'icarian-harpy', 'harpy'],
    ['SUN_DESCENDANT', 'c3', 'sun-descendant', 'sunDescendant'],
  ]) {
    const legacyKey = `${cycle}-core-${legacy}`, key = `${cycle}-core-${current}`;
    for (const visibleBalance of [undefined, 0, 3, '4']) {
      const resources = { [legacyKey]: '2', ...(visibleBalance === undefined ? {} : { [key]: visibleBalance }) };
      const before = clone(resources);
      const record = recordHarness(cycle);
      const normalized = record.normalizeResources(resources);
      const oldBalance = Number(visibleBalance || 0) + 2;
      assert.equal(normalized[key], oldBalance);
      assert.equal(normalized[legacyKey], undefined);
      assert.deepEqual(clone(record.normalizeResources(normalized)), clone(normalized), 'migration is idempotent');
      assert.deepEqual(resources, before, 'loading must not mutate its snapshot');
      const saved = ctx.applyLoot({ cycle, resources }, ctx.calculate(apostle, [bp('III', 1)]), cycle).record;
      assert.equal(saved.resources[key], oldBalance + 1);
      assert.equal(saved.resources[legacyKey], undefined);
      assert.deepEqual(clone(record.normalizeResources(saved.resources)), clone(saved.resources));
      assert.deepEqual(resources, before, 'settlement must not mutate its snapshot');
    }
  }
});

test('C4/C5 legacy shared balances are migrated before appending new rewards', () => {
  const ctx = harness();
  for (const [cycle, key] of [['c4', 'blackTaintedStepfinger'], ['c5', 'promisedFuturesCarcass'], ['c5', 'echoes']]) {
    const original = { cycle, resources: { [`${cycle}-${key}`]: 7 } };
    const result = { apostle: cycle === 'c4' ? 'THE_BABELIAN_LUNACY' : 'UR_FLEECE', totals: { [key]: 2 } };
    const saved = ctx.applyLoot(original, result, cycle).record;
    assert.equal(saved.resources[key], 9);
    assert.equal(saved.resources[`${cycle}-${key}`], undefined);
    const record = recordHarness(cycle);
    assert.deepEqual(clone(record.normalizeResources(saved.resources)), clone(saved.resources));
    assert.deepEqual(original.resources, { [`${cycle}-${key}`]: 7 });
  }
});

test('Blackbeak resources and cores remain visible in C5 even without a III wound', () => {
  const ctx = harness();
  for (const level of ['I', 'III']) {
    const result = ctx.calculate('BLACKBEAK', [clone(ctx.BlackbeakCardList.BP[level][0])]);
    const saved = ctx.applyLoot({ cycle: 'c2' }, result, 'c2');
    assert.equal(saved.cycle, 'c5');
    assert.equal(saved.record.resources['c5-core-pursuer'], level === 'III' ? 1 : 0);
    assert.equal(saved.skipped.length, 0);
    const record = recordHarness('c5', saved.record.resources);
    const fields = Array.from(record.currentResources(), item => item.key);
    for (const key of ['core-pursuer', 'grotesqueBeak', 'powderedMatter']) assert.ok(fields.includes(key));
    assert.equal(new Set(fields).size, fields.length);
    record.state.cycle = 'c4';
    assert.ok(!Array.from(record.currentResources(), item => item.key).includes('core-pursuer'));
  }
});

test('Chimera draws its reward cards before converting normal SW and DW resources', () => {
  const ctx = harness();
  const result = ctx.calculate('CHIMERA_METASTASIOS', [], {}, {
    damage1: [bp('I', 6), bp('II', 5), { ...bp('III', 5), damageValue: 2 }, sw(), sw()],
    damage2: Array.from({ length: 6 }, sw),
    deck: [bp('I', 1), bp('II', 1), bp('III', 1)],
    supply: { I: [], II: [bp('II', 2)], III: [bp('III', 2)] },
  });
  assert.equal(result.regularDamageCount, 6);
  assert.equal(result.secondaryDamageCount, 6);
  assert.deepEqual(clone(result.chimeraBonus.requested), { I: 1, II: 2, III: 1 });
  assert.deepEqual(nonzero(result.totals), { UA: 4, URM: 1, CT: 4, core: 2 });
  assert.equal(result.details.chimeraBonus.filter(item => item.card).length, 4);
  assert.equal(result.details.sw.length, 0, 'the bonus cards have already left the draw pool');
  assert.equal(result.details.dw.length, 0);
  assert.equal(result.warnings.filter(text => text.startsWith('SW #')).length, 2);
  const drawn = result.chimeraBonus.cards.map(item => [item.fileName, item.source.includes('promotion supply')]);
  assert.deepEqual(clone(drawn), [
    ['CHIMERA_METASTASIOS_BP_I_001.jpg', false], ['CHIMERA_METASTASIOS_BP_II_001.jpg', false],
    ['CHIMERA_METASTASIOS_BP_II_002.jpg', true], ['CHIMERA_METASTASIOS_BP_III_001.jpg', false],
  ]);
});
