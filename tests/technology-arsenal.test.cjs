const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../technology/gear-inventory.js');
const source = fs.readFileSync(path.join(__dirname, '../technology/index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
function context(names, values) {
  const scope = vm.createContext(values);
  for (const name of names) {
    const match = source.match(new RegExp('^(?:async )?function ' + name + '\\([^]*?^}', 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], scope);
  }
  return scope;
}

test('manual stock changes preserve manufacturing totals and zero-stock history', () => {
  const original = { AJ0160: { quantity: 2, manufactured: 2 } };
  const added = inventory.adjust(original, '1xaj0160', 3);
  assert.deepEqual(added.AJ0160, { quantity: 5, manufactured: 2 });
  const empty = inventory.adjust(added, 'AJ0160', -8);
  assert.deepEqual(empty.AJ0160, { quantity: 0, manufactured: 2 });
  assert.deepEqual(inventory.adjust(empty, 'AJ0160', 1, true).AJ0160, { quantity: 1, manufactured: 3 });
  assert.deepEqual(original.AJ0160, { quantity: 2, manufactured: 2 });
  assert.deepEqual(inventory.adjust({}, 'T:tt_earthshaker', 1, true)['T:tt_earthshaker'], { quantity: 1, manufactured: 1 });
});

test('inventory rejects invalid mutations and safely normalizes old or malformed data', () => {
  assert.deepEqual(inventory.normalize(null), {});
  assert.deepEqual(inventory.normalize({ __proto__: {}, invalid: {}, AJ0160: { quantity: -3, manufactured: '2' }, '1xaj0160': { quantity: 4.9, manufactured: Infinity } }), { AJ0160: { quantity: 4, manufactured: 2 } });
  for (const delta of [0, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => inventory.adjust({}, 'AJ0160', delta));
  }
  assert.throws(() => inventory.adjust({}, '__proto__', 1));
  assert.throws(() => inventory.adjust({}, 'AJ0160', -1, true));
});

function craftContext({ conflict = false, fail = false, remoteMissing = false, loseResponse = false, malformedResponse = false, offlineRecovery = false } = {}) {
  let server = { resources: { material: 10 }, arsenal: {} };
  let revision = 1;
  let posts = 0;
  const warnings = [];
  const c = context(['recordStateFromCampaign', 'readLatestRecordState', 'mutateCampaignRecordState', 'resourceAmount', 'evaluateCraftOption', 'gearCraftOperationKey', 'craftGear'], {
    window: { ATO_GEAR_INVENTORY: inventory },
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    normalizeCraftRecordResources: clone,
    activeAccountId: 'A', campaignTechLoaded: true,
    CAMPAIGN_STORAGE_URL: '/api', CAMPAIGN_RECORD_URL: '/api?section=record',
    campaignSession: { accountId: 'login-A', accept: value => value },
    gearRecordState: clone(server), gearRecordError: '', gearRecordRevision: 1,
    gearMutationInFlight: false, gearRecordSyncChannel: { postMessage: noop },
    gearCraftOperations: new Map(),
    gearCraftPlans: new Map([['recipe', { gearId: 'AJ0160', gearName: '装备', options: [{ parts: [{ storageKey: 'material', amount: 3, label: '3×材料', unsupported: false }] }] }]]),
    mainView: { querySelectorAll: () => [] }, CSS: { escape: value => value },
    arsenalMessage: '', arsenalMessageError: false,
    alert: message => warnings.push(message), confirm: () => true,
    loadGearRecordState: noop, renderGearInventoryView: noop,
    fetch: async (_url, options) => {
      if (!options?.method) {
        if (offlineRecovery && posts > 0) throw new Error('offline');
        const state = clone(server);
        if (remoteMissing) state.resources.material = 0;
        return { ok: true, status: 200, json: async () => ({ ok: true, campaign: { sections: { dashboard: { activeProfileId: 'B' }, record: { users: { A: state, B: { resources: { material: 999 } } } } }, sectionRevisions: { record: revision } } }) };
      }
      posts++;
      const payload = JSON.parse(options.body);
      assert.equal(payload.userId, 'A');
      assert.equal(payload.expectedAccountId, 'login-A');
      if (fail) return { ok: false, status: 500, json: async () => ({ ok: false, error: '保存失败' }) };
      if (conflict && posts === 1) {
        server.resources.material = 20;
        server.arsenal = inventory.adjust(server.arsenal, 'AJ0160', 4);
        revision++;
        return { ok: false, status: 409, json: async () => ({ code: 'SAVE_CONFLICT' }) };
      }
      assert.equal(payload.expectedRevision, revision);
      server = payload.state;
      revision++;
      if (loseResponse) { loseResponse = false; throw new Error('response lost after commit'); }
      if (malformedResponse) { malformedResponse = false; return { ok: true, status: 200, json: async () => { throw new Error('truncated JSON'); } }; }
      return { ok: true, status: 200, json: async () => ({ ok: true, revision }) };
    },
  });
  return { c, warnings, server: () => server, posts: () => posts, reconnect: () => { offlineRecovery = false; } };
}

test('manufacturing atomically deducts materials and records one finished item', async () => {
  const { c, server, warnings } = craftContext();
  await c.craftGear('recipe', 0);
  assert.equal(server().resources.material, 7);
  assert.deepEqual(server().arsenal.AJ0160, { quantity: 1, manufactured: 1 });
  assert.equal(c.gearMutationInFlight, false);
  assert.match(c.arsenalMessage, /已存入军械库/);
  assert.deepEqual(warnings, []);
});

test('a save conflict retries against fresh stock without double-counting manufacturing', async () => {
  const { c, server, posts } = craftContext({ conflict: true });
  await c.craftGear('recipe', 0);
  assert.equal(posts(), 2);
  assert.equal(server().resources.material, 17);
  assert.deepEqual(server().arsenal.AJ0160, { quantity: 5, manufactured: 1 });
});

test('failed saves and newly missing materials do not record manufactured gear', async () => {
  for (const options of [{ fail: true }, { remoteMissing: true }]) {
    const { c, server, warnings } = craftContext(options);
    await c.craftGear('recipe', 0);
    assert.equal(server().resources.material, 10);
    assert.deepEqual(server().arsenal, {});
    assert.equal(c.gearMutationInFlight, false);
    assert.match(warnings[0], /未确认/);
  }
});

test('repeated clicks while a manufacture is pending produce only one item', async () => {
  const { c, server, posts } = craftContext();
  const first = c.craftGear('recipe', 0);
  await c.craftGear('recipe', 0);
  await first;
  assert.equal(posts(), 1);
  assert.equal(server().arsenal.AJ0160.quantity, 1);
});

test('switching profile during the read stops the stock write', async () => {
  const { c, posts } = craftContext();
  const fetch = c.fetch;
  c.fetch = async (...args) => { const response = await fetch(...args); c.activeAccountId = 'B'; return response; };
  await assert.rejects(c.mutateCampaignRecordState(state => state), /档案.*已切换/);
  assert.equal(posts(), 0);
});

test('lost or malformed manufacture responses recover the committed receipt without charging twice', async () => {
  for (const options of [{ loseResponse: true }, { malformedResponse: true }]) {
    const { c, server, posts, warnings } = craftContext(options);
    await c.craftGear('recipe', 0);
    assert.equal(posts(), 1);
    assert.equal(server().resources.material, 7);
    assert.equal(server().arsenal.AJ0160.quantity, 1);
    assert.equal(Object.keys(server()._gearCraftReceipts).length, 1);
    assert.equal(c.gearCraftOperations.size, 0);
    assert.deepEqual(warnings, []);
    // A confirmed success permits a genuinely new manufacture.
    await c.craftGear('recipe', 0);
    assert.equal(posts(), 2);
    assert.equal(server().arsenal.AJ0160.quantity, 2);
  }
});

test('offline receipt recovery retains the original operation even after stock is exhausted', async () => {
  const { c, server, posts, reconnect, warnings } = craftContext({ loseResponse: true, offlineRecovery: true });
  c.gearCraftPlans.get('recipe').options[0].parts[0].amount = 10;
  await c.craftGear('recipe', 0);
  assert.equal(c.gearCraftOperations.size, 1);
  assert.equal(server().resources.material, 0);
  assert.match(warnings[0], /确认上次制造结果/);
  reconnect();
  c.gearRecordState = clone(server());
  await c.craftGear('recipe', -1);
  assert.equal(posts(), 1);
  assert.equal(server().arsenal.AJ0160.quantity, 1);
  assert.equal(c.gearCraftOperations.size, 0);
});

test('pending manufacture button remains actionable after the saved stock is depleted', () => {
  const c = context(['gearCraftOperationKey', 'renderCraftPanel'], {
    activeAccountId: 'A', campaignSession: { accountId: 'login-A' }, gearCraftPlans: new Map(),
    gearCraftOperations: new Map([[JSON.stringify(['login-A', 'A', 'recipe']), { optionIndex: 0 }]]),
    craftPlanForGear: () => ({ key: 'recipe', actionableIndex: -1, options: [{ unsupported: [] }] }),
    describeCraftPlan: () => ({ text: '材料不足', className: 'blocked' }), esc: String,
    gearMutationInFlight: false, gearRecordLoadInFlight: false, gearRecordState: {}, gearRecordError: '',
  });
  const html = c.renderCraftPanel({}, {});
  assert.match(html, /确认上次制造结果/);
  assert.match(html, /data-craft-option="0"/);
  assert.doesNotMatch(html, / disabled/);
});

function catalogContext() {
  const production = require('../technology/ato_gear_production.json');
  return context(['normalizeGearId', 'getGearName', 'getTechDisplayName', 'gearPart', 'gearPartMatchesFilter', 'productionRecordCycle', 'arsenalCatalog', 'arsenalItemMatchesFilters'], {
    window: { ATO_GEAR_INVENTORY: inventory }, gearProductionData: production,
    gearPartLabels: require('../technology/gear_part_labels.json').labels,
    treeLanguage: 'zh', TITAN_NAMES_ZH: { tt_earthshaker: '撼地者' },
    PRODUCTION_CYCLE_TO_RECORD_CYCLE: { CYCLE_01: 'c1', CYCLE_02: 'c2', CYCLE_03: 'c3', CYCLE_04: 'c4', CYCLE_05: 'c5' },
    gearRecordState: { arsenal: { AJ0160: { quantity: 0, manufactured: 2 }, BJ0827: { quantity: 3, manufactured: 3 } } },
    arsenalPartFilter: '', arsenalCycleFilter: '',
  });
}

test('catalog includes every manufacture recipe, deduplicates variants and retains zero stock', () => {
  const c = catalogContext();
  const catalog = c.arsenalCatalog();
  const ids = new Set(catalog.map(item => item.gearId));
  for (const entry of c.gearProductionData.techProduction) {
    for (const gear of entry.produces) assert.ok(ids.has(inventory.gearKey(gear.gearId)), gear.gearId);
  }
  assert.equal(catalog.length, ids.size);
  assert.equal(catalog.find(item => item.gearId === 'AJ0160').recorded, true);
  assert.equal(catalog.find(item => item.gearId === 'AJ0160').quantity, 0);
});

test('manual entry includes the complete gear dictionary, including equipment with no recipe', () => {
  const c = catalogContext();
  const catalog = c.arsenalCatalog();
  const recipes = new Set(c.gearProductionData.techProduction.flatMap(entry => entry.produces.map(gear => inventory.gearKey(gear.gearId))));
  const ids = new Set(catalog.map(item => item.gearId));
  for (const gearId of Object.keys(c.gearProductionData.gearCards)) assert.ok(ids.has(gearId), gearId);
  const loot = catalog.find(item => item.gearId === 'AJ0257');
  assert.equal(recipes.has(loot.gearId), false);
  assert.deepEqual(clone(loot.cycles), ['c1']);
  assert.equal(c.arsenalItemMatchesFilters(loot, '护盾之刃'), true);
  assert.equal(c.arsenalItemMatchesFilters(loot, 'shieldblade'), true);
  c.arsenalCycleFilter = 'c1';
  assert.equal(c.arsenalItemMatchesFilters(loot, 'aj0257'), true);
  c.arsenalCycleFilter = 'c2';
  assert.equal(c.arsenalItemMatchesFilters(loot, ''), false);
});

test('non-manufacturable gear can be added, reloaded and adjusted without changing manufacturing totals', async () => {
  const c = catalogContext();
  context(['adjustArsenal'], c);
  Object.assign(c, {
    gearMutationInFlight: false, gearRecordError: '', arsenalMessage: '', arsenalMessageError: false,
    renderGearInventoryView: noop, loadGearRecordState: noop,
    alert: message => assert.fail(message),
    mutateCampaignRecordState: async mutator => { c.gearRecordState = clone(mutator(clone(c.gearRecordState))); },
  });
  const before = clone(c.gearRecordState.arsenal.AJ0160);
  await c.adjustArsenal('AJ0257', 3);
  c.gearRecordState = clone(c.gearRecordState);
  assert.deepEqual(clone(c.arsenalCatalog().find(item => item.gearId === 'AJ0257').quantity), 3);
  await c.adjustArsenal('AJ0257', -1);
  assert.deepEqual(clone(c.gearRecordState.arsenal.AJ0257), { quantity: 2, manufactured: 0 });
  assert.deepEqual(clone(c.gearRecordState.arsenal.AJ0160), before);
});

test('category and cycle filters combine with Chinese, English and ID searches', () => {
  const c = catalogContext();
  const gear = c.arsenalCatalog().find(item => item.gearId === 'AJ0160');
  for (const query of ['帆布', 'sail spolas', 'aj0160']) assert.equal(c.arsenalItemMatchesFilters(gear, query), true);
  c.arsenalPartFilter = 'armor'; c.arsenalCycleFilter = 'c1';
  assert.equal(c.arsenalItemMatchesFilters(gear, '帆布'), true);
  c.arsenalPartFilter = 'arm';
  assert.equal(c.arsenalItemMatchesFilters(gear, ''), false);
  c.arsenalPartFilter = ''; c.arsenalCycleFilter = 'c2';
  assert.equal(c.arsenalItemMatchesFilters(gear, ''), false);
});

test('every equipment card has an explicit icon-verified category in both languages', () => {
  const c = catalogContext();
  const validParts = new Set(['arm_1h', 'arm_2h', 'arm_3h', 'arm_1_2h', 'arm_all_h', 'armor', 'attachment', 'aid']);
  for (const language of ['zh', 'en']) {
    c.treeLanguage = language;
    for (const gearId of Object.keys(c.gearProductionData.gearCards)) {
      const part = c.gearPart(gearId);
      assert.ok(validParts.has(c.gearPartLabels[gearId]), `${gearId} needs an explicit category`);
      assert.equal(part.key, c.gearPartLabels[gearId], `${gearId}/${language}`);
      assert.equal(c.gearPart('1x' + gearId).key, part.key, gearId);
    }
  }
  // One fist, two fists, three fists and the variable-hand starting fists.
  const weapons = {
    arm_1h: ['AJ0163', 'BJ0957', 'CJ1474'],
    arm_2h: ['AJ0177', 'DJ2322', 'CJ1425', 'CJ1472', 'CJ1514', 'DJ2225'],
    arm_3h: ['AJ0230', 'BJ0962', 'DJ2324', 'EJ2930'],
    arm_1_2h: ['AJ0156'], arm_all_h: ['BJ0959', 'BJ0970', 'BJ0971', 'CJ1546'],
  };
  for (const [part, ids] of Object.entries(weapons)) {
    for (const gearId of ids) {
      assert.equal(c.gearPart(gearId).key, part, gearId);
      assert.match(c.gearPart(gearId).label, /武器/, gearId);
    }
  }
});

test('card icons override misleading names and multi-face equipment follows its displayed face', () => {
  const c = catalogContext();
  const catalog = c.arsenalCatalog();
  const examples = {
    armor: ['CJ1521', 'DJ2265', 'DJ2374', 'EJ2829', 'EJ2956', 'BJ0954'],
    arm_1h: ['DJ2253', 'EJ2819', 'EJ2858', 'BJ0957'],
    arm_2h: ['AJ0257', 'DJ2327', 'DJ2225'],
    attachment: ['DJ2245', 'DJ2288', 'EJ2811', 'EJ2959'],
    aid: ['DJ2278', 'DJ2294', 'EJ2854', 'EJ2978'],
  };
  for (const [part, ids] of Object.entries(examples)) {
    c.arsenalPartFilter = part;
    for (const gearId of ids) {
      const item = catalog.find(item => item.gearId === gearId);
      assert.equal(item.part.key, part, gearId);
      assert.equal(c.arsenalItemMatchesFilters(item, ''), true, gearId);
      c.arsenalPartFilter = part.startsWith('arm_') ? 'armor' : 'arm';
      assert.equal(c.arsenalItemMatchesFilters(item, ''), false, gearId);
      c.arsenalPartFilter = part;
    }
  }
});

test('hand-count filters include flexible weapons and the all-weapons filter retains every subtype', () => {
  const c = catalogContext();
  const catalog = c.arsenalCatalog();
  const ids = filter => {
    c.arsenalPartFilter = filter;
    return new Set(catalog.filter(item => c.arsenalItemMatchesFilters(item, '')).map(item => item.gearId));
  };
  const one = ids('arm_1h'), two = ids('arm_2h'), three = ids('arm_3h');
  assert.ok(one.has('AJ0163') && !two.has('AJ0163') && !three.has('AJ0163'));
  assert.ok(!one.has('AJ0257') && two.has('AJ0257') && !three.has('AJ0257'));
  assert.ok(!one.has('AJ0230') && !two.has('AJ0230') && three.has('AJ0230'));
  assert.ok(one.has('AJ0156') && two.has('AJ0156') && !three.has('AJ0156'));
  for (const set of [one, two, three]) assert.ok(set.has('BJ0970'));
  const all = ids('arm');
  assert.equal(all.size, 257);
  for (const set of [one, two, three]) for (const id of set) assert.ok(all.has(id));
  assert.equal(all.has('CJ1521'), false);
  c.arsenalPartFilter = 'arm_2h'; c.arsenalCycleFilter = 'c1';
  assert.equal(c.arsenalItemMatchesFilters(catalog.find(item => item.gearId === 'AJ0257'), '盾'), true);
  assert.equal(c.arsenalItemMatchesFilters(catalog.find(item => item.gearId === 'DJ2327'), ''), false);
  assert.equal(c.gearPartMatchesFilter('arm', 'arm'), true, 'legacy weapon labels remain accessible');
});

test('manufacture grouping uses hand-count categories and renders each recipe once', () => {
  const c = catalogContext();
  context(['renderGearProductionPage'], c);
  Object.assign(c, {
    mainView: { classList: { remove: noop }, querySelectorAll: () => [] },
    gearOnlyCurrentCycle: false, gearOnlyCraftable: false, gearGroupByPart: true,
    renderCycleButton: noop, requestGearRecordState: noop, applyGearSearch: noop,
    currentProductionCycle: () => 'CYCLE_01', esc: String,
    gearFilterBarHtml: () => '', gearResourceSidebarHtml: () => '',
    gearItemHtml: (_entry, gear) => `<span data-item="${gear.gearId}"></span>`,
    getUnlockedProductions: () => [{ techId: 'test', produces: ['AJ0156', 'AJ0230', 'AJ0257', 'AJ0163'].map(gearId => ({ gearId })) }],
  });
  c.renderGearProductionPage();
  for (const label of ['单手武器', '双手武器', '三手武器', '单手 / 双手武器']) {
    assert.ok(c.mainView.innerHTML.includes(`<span class="gear-group-name">${label}</span>`), label);
  }
  const headers = [...c.mainView.innerHTML.matchAll(/class="gear-group-name">([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(headers, ['单手武器', '双手武器', '三手武器', '单手 / 双手武器']);
  for (const id of ['AJ0163', 'AJ0257', 'AJ0230', 'AJ0156']) {
    assert.equal(c.mainView.innerHTML.split(`data-item="${id}"`).length - 1, 1, id);
  }
});

test('gear production list shows the current cycle, later cycles and persistent adversary techs', () => {
  const c = context(['productionCycleRank', 'isAdversaryProduction', 'shouldShowProductionForCycle'], {
    PERSISTENT_ADVERSARY_PRODUCTION_IDS: new Set(['CA1595']),
  });
  const normal = cycle => ({ techId: 'XX0001', cycle });
  const adversary = cycle => ({ techId: 'CA1595', cycle });

  assert.equal(c.shouldShowProductionForCycle(normal('CYCLE_02'), 'CYCLE_02'), true, '本循环必须显示');
  // 提前解锁后续循环的生产科技是本轮修掉的 bug：必须显示，否则拿到的科技卡造不出装备。
  assert.equal(c.shouldShowProductionForCycle(normal('CYCLE_03'), 'CYCLE_02'), true, '后续循环必须显示');
  assert.equal(c.shouldShowProductionForCycle(normal('CYCLE_05'), 'CYCLE_01'), true, '隔几个循环也要显示');
  assert.equal(c.shouldShowProductionForCycle(normal('CYCLE_01'), 'CYCLE_03'), false, '更早的普通生产科技不显示');
  assert.equal(c.shouldShowProductionForCycle(adversary('CYCLE_01'), 'CYCLE_03'), true, '更早的持续宿敌生产科技仍显示');
  assert.equal(c.shouldShowProductionForCycle(adversary('CYCLE_04'), 'CYCLE_02'), true, '后续的宿敌生产科技同样显示');
  assert.equal(c.shouldShowProductionForCycle(normal(''), 'CYCLE_02'), false, '认不出循环的条目不显示');

  // 真实数据：C1 期间提前解锁 C4 的 DA2162 也要出现在装备制造里。
  const production = require('../technology/ato_gear_production.json');
  const c4Entry = production.techProduction.find(item => item.techId === 'DA2162');
  assert.equal(c4Entry.cycle, 'CYCLE_04');
  assert.equal(c.shouldShowProductionForCycle(c4Entry, 'CYCLE_01'), true);

  // 筛选开关必须说明它包含后续循环，否则玩家会以为后面的循环被藏了。
  assert.match(source, /只显示本循环及以后装备/);
});
