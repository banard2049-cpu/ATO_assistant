const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
function harness() {
  const element = () => ({ style: {}, appendChild() {}, addEventListener() {} });
  const ctx = vm.createContext({
    console, currentApostle: '', piles: {}, localStorage: { getItem: () => null },
    cardSrc: () => '', document: {
      readyState: 'complete', head: element(), body: element(), createElement: element,
      getElementById: () => null, querySelector: element,
    },
  });
  ctx.window = ctx;
  for (const file of ['bp_resource_map.js', 'bp_resource_map_c1_c3.js', 'bp_resource_map_c4_c5.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'aibp/ps/other/resouce', file), 'utf8'), ctx);
  }
  let source = fs.readFileSync(path.join(root, 'aibp/bp_loot_calculator_addon.js'), 'utf8');
  source = source.replace('window.AIBP_calculateBpLoot = calculateBpLoot;',
    'window.AIBP_calculateBpLoot = calculateBpLoot; window.applyLoot = applyLootResultToRecord; window.copyLoot = resultToText; window.renderLoot = renderLootResult; window.addLoot = addLootResultToRecord;');
  vm.runInContext(source, ctx);
  ctx.calculate = (apostle, damage = [], options = {}, special = {}) => {
    ctx.currentApostle = apostle;
    ctx.piles[apostle] = { BP: { damage, deck: [], discard: [], supply: { I: [], II: [], III: [] } }, special };
    return ctx.AIBP_calculateBpLoot(options);
  };
  return ctx;
}
const sw = count => Array.from({ length: count }, () => ({ special: 'SW' }));
const bp = (level = 'I', index = 1) => ({ type: 'BP', level, index });

// Expected amounts from the four storybook reward tables, independent of the
// calculator's configuration. Empty BP pools isolate the additional resources.
const tables = [
  ['ALPHA_TEMENOS', 'MF', 'MC', 4, [[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3]], { 7: '秘密牌库 3，卡牌 30', 9: '秘密牌库 5，卡牌 46' }],
  ['SUN_DESCENDANT', 'SK', 'IF', 5, [[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3]], { 8: '秘密牌库 8，卡牌 91', 9: '秘密牌库 9，卡牌 107', 11: '代达罗斯之翼' }],
  ['THE_BABELIAN_LUNACY', 'blackTaintedStepfinger', 'livingGold', 5, [[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3]], { 8: '秘密牌库 14，卡牌 249', 11: '秘密牌库 11，卡牌 202' }],
  ['UR_FLEECE', 'blackWoolStrand', 'amygdalanExtract', 4, [[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3]], { 7: '剧场生成装备', 10: '秘密牌库 18，卡牌 292' }],
];
for (const [apostle, resource, choice, start, rows, cards] of tables) {
  test(`${apostle}: all damage tiers, current-tier cards, threshold and cap`, () => {
    const ctx = harness();
    const below = ctx.calculate(apostle, sw(start - 1));
    assert.equal(below.totals[resource] || 0, 0);
    assert.equal(below.storyBonus.choiceCount, 0);
    rows.forEach(([amount, count], index) => {
      const damage = start + index;
      const r = ctx.calculate(apostle, sw(damage), { resourceChoices: { [choice]: count } });
      assert.equal(r.totals[resource], amount);
      assert.equal(r.totals[choice] || 0, count);
      assert.equal(r.validationErrors.length, 0);
      const reminders = r.reminders.filter(text => text.startsWith('额外获得'));
      assert.equal(reminders.length, cards[damage] ? 1 : 0, 'lower tier card rewards must not accumulate');
      if (cards[damage]) {
        assert.ok(ctx.copyLoot(r).includes(cards[damage]));
        const saved = ctx.applyLoot({}, r).record;
        assert.equal(saved.nymphCards, undefined, 'new cards remain reminders');
        assert.equal(saved.gear, undefined);
      }
    });
    const [amount, count] = rows.at(-1);
    const cap = ctx.calculate(apostle, sw(20), { resourceChoices: { [choice]: count } });
    assert.equal(cap.totals[resource], amount);
    assert.equal(cap.storyBonus.choiceCount, count);
  });
}

test('single and double wounds count toward thresholds; Temenos grants no ordinary BP resources or cores', () => {
  const ctx = harness();
  const r = ctx.calculate('ALPHA_TEMENOS', [bp('III'), { special: 'DW' }, ...sw(2)] , { resourceChoices: { MC: 1 } });
  assert.equal(r.regularDamageCount, 5);
  assert.equal(r.totals.MF, 2);
  assert.equal(r.totals.MC, 1);
  assert.equal(r.totals.core || 0, 0);
  assert.equal(r.details.direct.length + r.details.sw.length + r.details.dw.length, 0);
});

test('choice counts reject missing, excess, fractional, negative and ineligible resources before writing', () => {
  const ctx = harness();
  for (const resourceChoices of [{}, { MC: 3 }, { MC: 1.5 }, { MC: -1 }, { RA: 2 }, { core: 2 }, { MC: NaN }]) {
    const r = ctx.calculate('ALPHA_TEMENOS', sw(7), { resourceChoices });
    assert.ok(r.validationErrors.length);
    assert.throws(() => ctx.applyLoot({ resources: { mazeFragment: 5 } }, r), /选择/);
  }
  const split = ctx.calculate('ALPHA_TEMENOS', sw(7), { resourceChoices: { MC: 1, CKB: 1 } });
  assert.equal(split.validationErrors.length, 0);
  assert.equal(split.totals.MC, 1);
  assert.equal(split.totals.CKB, 1);
});

test('ambush grants cores only; Burden kill and terminal encounters exclude summit resources', () => {
  const ctx = harness();
  for (const apostle of ['HEKATON', 'LABYRINTHAUROS']) {
    const r = ctx.calculate(apostle, [bp('I'), bp('III')], { sceneId: 'ambush', multiplier: 4 });
    assert.equal(r.totals.core, 1);
    assert.equal(Object.values(r.totals).reduce((a, b) => a + b, 0), 1);
  }
  const summit = ctx.calculate('THE_BURDEN', [], { summitTitanCount: 4 });
  assert.equal(summit.totals.RT, 13);
  assert.equal(summit.totals.EF, 10);
  for (const options of [{ outcome: 'kill' }, { sceneId: 'burden-end' }]) {
    const r = ctx.calculate('THE_BURDEN', [], { ...options, summitTitanCount: 4 });
    assert.equal(r.totals.RT || 0, 0);
    assert.equal(r.burdenBonus, null);
  }
});

test('the four terminal victories multiply BP resources; defeats retain ordinary multipliers', () => {
  const ctx = harness();
  for (const [apostle, sceneId, card] of [
    ['HERMESIAN_PURSUER', 'pursuers-end', bp()], ['THE_BURDEN', 'burden-end', bp()],
    ['DAHAKA', 'dahaka-end', { type: 'AI', level: 'I', bpLevel: 'I', combinedAibp: true, index: 1 }],
    ['TITAN_X', 'titan-end', bp()],
  ]) {
    const normal = ctx.calculate(apostle, [card], { multiplier: 3 });
    const end = ctx.calculate(apostle, [card], { sceneId, multiplier: 3 });
    assert.equal(end.resourceMultiplier, 3);
    for (const [key, amount] of Object.entries(normal.totals)) if (amount && key !== 'core') assert.equal(end.totals[key], amount * 3);
    const defeat = ctx.calculate(apostle, [card], { sceneId, multiplier: 3, outcome: 'defeat' });
    assert.equal(defeat.resourceMultiplier, 1);
    assert.equal(defeat.rareResources.length, 0);
  }
});

test('finale encounters do not receive ordinary damage, BP or core rewards', () => {
  const ctx = harness();
  for (const [apostle, sceneId] of [
    ['ALPHA_TEMENOS', 'temenos-final'], ['THE_NIETZSCJEAN', 'nietzsche-final'],
    ['SUN_DESCENDANT', 'sun-final'], ['THE_BABELIAN_LUNACY', 'babel-final'], ['UR_FLEECE', 'ur-final'],
  ]) {
    const r = ctx.calculate(apostle, [bp('III'), ...sw(10)], { sceneId });
    assert.ok(Object.values(r.totals).every(n => n === 0));
    assert.equal(r.storyBonus, null);
    assert.equal(r.nietzscheBonus, null);
    assert.equal(r.validationErrors.length, 0);
    assert.ok(r.reminders.length > 0);
    assert.ok(ctx.copyLoot(r).includes(r.battle.sceneLabel));
    assert.throws(() => ctx.applyLoot({}, r), /没有可写入/);
  }
});

test('first kill resources are opt-in; Titan X selects exactly one first reward', () => {
  const ctx = harness();
  for (const apostle of ['HERMESIAN_PURSUER', 'DAHAKA', 'TITAN_X']) {
    assert.equal(ctx.calculate(apostle, [], { outcome: 'kill' }).totals.sisyphusTears || 0, 0);
    assert.equal(ctx.calculate(apostle, [], { firstVictory: true }).totals.sisyphusTears || 0, 0);
    const r = ctx.calculate(apostle, [], { outcome: 'kill', firstVictory: true });
    assert.equal(r.totals.sisyphusTears, 1);
    assert.equal(ctx.applyLoot({}, r).record.resources.sisyphusTears, 1);
  }
  const echo = ctx.calculate('TITAN_X', [], { outcome: 'kill', firstVictory: true, firstReward: 'echoes' });
  assert.equal(echo.totals.echoes, 1);
  assert.equal(echo.totals.sisyphusTears || 0, 0);
});

test('Titan X state selects group and awakening finale; group and Ur kill special resources write correctly', () => {
  const ctx = harness();
  const group = ctx.calculate('TITAN_X', [], {}, { titanX: { group: { won: true } } });
  assert.equal(group.battle.sceneId, 'titan-group');
  const record = ctx.applyLoot({ resources: { echoes: 2, pygmalionStones: 3, sisyphusTears: 4 } }, group, 'c5').record;
  assert.deepEqual(clone(record.resources), { echoes: 3, pygmalionStones: 4, sisyphusTears: 5 });
  assert.ok(ctx.copyLoot(group).includes('9299'));
  assert.equal(ctx.calculate('TITAN_X', [], {}, { titanX: { awakeningWon: true } }).battle.sceneId, 'titan-end');
  assert.equal(ctx.calculate('TITAN_X', [], { sceneId: 'normal' }, { titanX: { awakeningWon: true } }).battle.sceneId, 'normal');
  const ur = ctx.calculate('UR_FLEECE', [], { outcome: 'kill' });
  assert.equal(ctx.applyLoot({}, ur).record.resources.echoes, 1);
  assert.ok(ctx.copyLoot(ur).includes('1316'));
});

test('rare resource text is preserved and deduplicated; numeric rewards use existing storage keys', () => {
  const ctx = harness();
  const r = ctx.calculate('HERMESIAN_PURSUER', [], { sceneId: 'pursuers-end' });
  const saved = ctx.applyLoot({ resources: { rare: '旧遗物' } }, r).record;
  assert.equal(saved.resources.rare, '旧遗物\n损坏的密码筒');
  const withBp = ctx.calculate('HERMESIAN_PURSUER', [bp('III')], { sceneId: 'pursuers-end' });
  const second = ctx.applyLoot(saved, withBp, 'c2').record;
  assert.equal(second.resources.rare, saved.resources.rare);
  assert.equal(second.resources['c2-core-pursuer'], 1);
  const sun = ctx.calculate('SUN_DESCENDANT', sw(5));
  const sunRecord = ctx.applyLoot({}, sun).record;
  assert.equal(sunRecord.resources['c3-sunburnedSkull'], 1);
  assert.equal(sunRecord.resources.sunburnedSkull, undefined);
});

test('Nietzsche nymph stays automatic; choice validation and equipment reminders remain separate', () => {
  const ctx = harness();
  const nymph = ctx.calculate('THE_NIETZSCJEAN', sw(7), { nietzscheChoices: { CT: 2 } });
  const saved = ctx.applyLoot({}, nymph).record;
  assert.deepEqual(clone(saved.nymphCards), ['nietzschean']);
  assert.equal(saved.resources.livingAbyss, 4);
  assert.equal(saved.resources['c2-chimericTar'], 2);
  const equipment = ctx.calculate('THE_NIETZSCJEAN', sw(10), { nietzscheChoices: { CT: 3 } });
  assert.ok(ctx.copyLoot(equipment).includes('秘密牌组 5，牌 54'));
  assert.equal(ctx.applyLoot({}, equipment).record.nymphCards, undefined);
  const invalid = ctx.calculate('THE_NIETZSCJEAN', sw(7));
  assert.throws(() => ctx.applyLoot({}, invalid), /请选择/);
});

test('new bonus resources keep the existing receipt after a lost successful response', async () => {
  const ctx = harness();
  let record = { resources: { mazeFragment: 2 } }, posts = 0;
  ctx.fetch = async (url, options) => {
    if (!options?.method) return { status: 200, ok: true, json: async () => ({ ok: true, user: { id: 'owner' }, campaign: {
      sectionRevisions: { record: posts + 1 }, sections: {
        dashboard: { activeProfileId: 'A', profiles: { A: { activeCycleId: 'c1' } } }, record: { users: { A: record } },
      },
    } }) };
    posts++;
    record = JSON.parse(options.body).state;
    throw new Error('response lost');
  };
  const result = ctx.calculate('ALPHA_TEMENOS', sw(4));
  await assert.rejects(ctx.addLoot(result), /response lost/);
  assert.equal(record.resources.mazeFragment, 3);
  const retry = await ctx.addLoot(result);
  assert.equal(retry.syncedToServer, true);
  assert.equal(posts, 1);
  assert.equal(record.resources.mazeFragment, 3);
});
