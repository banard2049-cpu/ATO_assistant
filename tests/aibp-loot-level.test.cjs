const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
function harness(apostle = 'HEKATON') {
  const element = () => {
    const selectors = new Map();
    return {
      style: {}, dataset: {}, children: [], listeners: {}, innerHTML: '', value: '',
      classList: { contains: () => false },
      appendChild(child) { this.children.push(child); },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      querySelector(selector) {
        if (!selectors.has(selector)) selectors.set(selector, element());
        return selectors.get(selector);
      },
      querySelectorAll: () => [],
      insertAdjacentHTML(position, text) { this.innerHTML += text; },
      showModal() { this.open = true; }, close() { this.open = false; },
    };
  };
  const ctx = vm.createContext({
    console, currentApostle: apostle, apostleLevelOverrides: {}, recordApostleLevels: {},
    fixedLevelOneApostles: new Set(), maxApostleLevel: 9,
    piles: { [apostle]: { BP: {
      deck: [{ type: 'BP', level: 'III', index: 1 }], discard: [],
      damage: [{ type: 'BP', level: 'I', index: 1 }], damage1: [], damage2: [],
    } } },
    document: {
      readyState: 'complete', head: element(), body: element(), createElement: element,
      getElementById: () => null, querySelector: () => element(),
    },
    localStorage: { getItem: () => ctx.localRecord ? JSON.stringify(ctx.localRecord) : null },
    cardSrc: () => '', alerts: [], alert: message => ctx.alerts.push(message),
  });
  ctx.window = ctx;
  for (const name of ['apostleLevelFor', 'currentApostleLevel']) {
    vm.runInContext(html.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'))[0], ctx);
  }
  for (const file of ['aibp/ps/other/resouce/bp_resource_map.js', 'aibp/ps/other/resouce/bp_resource_map_c1_c3.js',
    'aibp/ps/other/resouce/bp_resource_map_c4_c5.js', 'aibp/bp_loot_calculator_addon.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  }
  return ctx;
}

test('record level controls automatic loot despite a different battle level and BP tier', () => {
  const ctx = harness();
  ctx.apostleLevelOverrides.HEKATON = 1;
  ctx.recordApostleLevels.HEKATON = 3;
  const result = ctx.AIBP_calculateBpLoot({ recordMultiplier: 3 });
  assert.equal(result.multiplier, 3);
  assert.equal(result.multiplierSource, 'record');
  assert.equal(result.totals.RA, 6);
  assert.equal(result.details.levelBonus[0].resource.RA, 3);
});

test('loot can use the cached record level without reading the battle override', () => {
  const ctx = harness();
  ctx.apostleLevelOverrides.HEKATON = 1;
  ctx.recordApostleLevels.HEKATON = 4;
  const result = ctx.AIBP_calculateBpLoot();
  assert.equal(result.multiplier, 4);
  assert.equal(result.totals.RA, 16, 'BP resource 1 × level 4, plus the printed 12 ambrosia');
  assert.equal(result.details.levelBonus[0].resource.RA, 12);
  assert.equal(result.multiplierSource, 'record');
});

test('an explicit loot multiplier overrides the record and battle levels', () => {
  const ctx = harness();
  ctx.apostleLevelOverrides.HEKATON = 1;
  const result = ctx.AIBP_calculateBpLoot({ multiplier: 2, recordMultiplier: 3 });
  assert.equal(result.multiplier, 2);
  assert.equal(result.multiplierSource, 'manual');
  assert.equal(result.totals.RA, 2);
});

test('missing record levels default to 1 without inferring from battle levels or BP tiers', () => {
  const ctx = harness();
  ctx.apostleLevelOverrides.HEKATON = 9;
  assert.equal(ctx.AIBP_calculateBpLoot({ recordMultiplier: 2 }).multiplier, 2);
  const result = ctx.AIBP_calculateBpLoot();
  assert.equal(result.multiplier, 1);
  assert.equal(result.multiplierSource, 'default');
  assert.equal(result.totals.RA, 1);
});

// Panel resource columns, independently checked against all ten ordinary Boss
// cards. P55 awards the fixed bonus only at III/IV; V–IX print no such column.
const panelAmbrosia = [
  ['HEKATON', 'RA'], ['LABYRINTHAUROS', 'RA'],
  ['CHIMERA_METASTASIOS', 'UA'], ['CYCLONUS', 'UA'],
  ['HYPERTIME_ORACLE', 'FA'], ['ICARIAN_HARPY', 'FA'],
  ['MIDASCORE', 'mutableAmbrosia'], ['DEMIDJINN', 'mutableAmbrosia'],
  ['DRAGON_OF_PHOBOS', 'oxidizedAmbrosia'], ['MEDUKETOS', 'oxidizedAmbrosia'],
];
for (const [apostle, resource] of panelAmbrosia) {
  test(`${apostle}: the record level adds its printed ambrosia once, without inheriting another level`, () => {
    const ctx = harness(apostle);
    const cardResource = ctx.AIBP_BP_RESOURCE_MAP[apostle][`${apostle}_BP_I_001.jpg`];
    for (let level = 1; level <= 9; level++) {
      ctx.recordApostleLevels[apostle] = level;
      ctx.apostleLevelOverrides[apostle] = level === 1 ? 9 : 1;
      const extra = level === 3 ? 3 : level === 4 ? 12 : 0;
      const result = ctx.AIBP_calculateBpLoot();
      assert.equal(result.multiplier, level);
      assert.equal(result.multiplierSource, 'record');
      assert.equal(result.totals[resource] || 0, (cardResource[resource] || 0) * level + extra, `level ${level}`);
      assert.equal(result.details.levelBonus.length, extra ? 1 : 0, `level ${level}`);
      if (extra) {
        assert.equal(result.details.levelBonus[0].resource[resource], extra);
        assert.equal(result.details.levelBonus[0].multiplier, 1, 'the panel bonus is not multiplied again');
      }
    }
  });
}

function recordResponse(record) {
  return { status: 200, ok: true, json: async () => ({ ok: true, user: { id: 'owner' }, campaign: {
    sections: { dashboard: { activeProfileId: 'A', profiles: { A: { activeCycleId: 'c1' } } },
      record: { users: { A: record } } }, sectionRevisions: { record: 1 },
  } }) };
}
function lootDialog(ctx) {
  return ctx.document.body.children.find(child => child.id === 'bpLootDialog');
}

test('opening and reopening loot fetches the latest record level; manual edits still control recalculation', async () => {
  const ctx = harness();
  ctx.apostleLevelOverrides.HEKATON = 1;
  ctx.recordApostleLevels.HEKATON = 4;
  let reads = 0, stage = '2c';
  ctx.fetch = async () => { reads++; return recordResponse({ cycle: 'c1', enemies: { [`c1:hekaton:${stage}`]: true } }); };
  await ctx.AIBP_showBpLootDialog();
  const dialog = lootDialog(ctx), input = dialog.querySelector('.loot-multiplier-input');
  assert.deepEqual(ctx.alerts, []);
  assert.equal(reads, 1, 'the battle override must not bypass the record read');
  assert.equal(dialog.open, true);
  assert.equal(input.value, '3', 'use the real record stage 2c = III rather than the cached IV');
  assert.match(dialog.querySelector('.loot-summary').innerHTML, /倍率来源：记录表/);
  assert.match(dialog.querySelector('.loot-details').innerHTML, /始徒等级奖励/);

  input.value = '2';
  dialog.querySelector('.loot-toolbar').listeners.change({ target: input });
  assert.equal(input.value, '2');
  assert.match(dialog.querySelector('.loot-summary').innerHTML, /倍率来源：手动输入/);
  assert.doesNotMatch(dialog.querySelector('.loot-details').innerHTML, /始徒等级奖励/);

  stage = '4a';
  ctx.apostleLevelOverrides.HEKATON = 9;
  await ctx.AIBP_showBpLootDialog();
  assert.equal(reads, 2);
  assert.equal(input.value, '4');
  assert.match(dialog.querySelector('.loot-summary').innerHTML, /倍率来源：记录表/);
});

test('offline automatic loot uses the locally saved record level', async () => {
  const ctx = harness();
  ctx.apostleLevelOverrides.HEKATON = 9;
  ctx.recordApostleLevels.HEKATON = 4;
  ctx.localRecord = { cycle: 'c1', enemies: { 'c1:hekaton:2c': true } };
  ctx.fetch = async () => { throw new Error('offline'); };
  await ctx.AIBP_showBpLootDialog();
  assert.deepEqual(ctx.alerts, []);
  assert.equal(lootDialog(ctx).querySelector('.loot-multiplier-input').value, '3');
});

test('an empty current server record does not reuse a stale local or cached level', async () => {
  const ctx = harness();
  ctx.apostleLevelOverrides.HEKATON = 9;
  ctx.recordApostleLevels.HEKATON = 4;
  ctx.localRecord = { enemies: { 'c1:hekaton:2c': true } };
  ctx.fetch = async () => recordResponse({});
  await ctx.AIBP_showBpLootDialog();
  assert.deepEqual(ctx.alerts, []);
  assert.equal(lootDialog(ctx).querySelector('.loot-multiplier-input').value, '1');
  assert.match(lootDialog(ctx).querySelector('.loot-summary').innerHTML, /倍率来源：默认等级 1/);
});

test('changing Boss while its record is loading does not open loot with the previous Boss level', async () => {
  const ctx = harness();
  let finishRead;
  ctx.fetch = () => new Promise(resolve => { finishRead = resolve; });
  const opening = ctx.AIBP_showBpLootDialog();
  ctx.currentApostle = 'LABYRINTHAUROS';
  ctx.piles.LABYRINTHAUROS = ctx.piles.HEKATON;
  if (finishRead) finishRead(recordResponse({ enemies: { 'c1:hekaton:4a': true } }));
  await opening;
  assert.deepEqual(ctx.alerts, []);
  assert.notEqual(lootDialog(ctx)?.open, true);
});
