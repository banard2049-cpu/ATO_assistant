const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../technology/gear-inventory.js');
const loadout = require('../technology/arsenal-loadout.js');
const ascensionCore = require('../technology/ascension-core.js');
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

test('ascension transfers one copy per cycle and keeps manufacturing history on the original card', () => {
  const start = { AJ0160: { quantity: 2, manufactured: 5 } };
  const c2 = inventory.ascend(start, 'AJ0160', 'c1');
  assert.deepEqual(c2, {
    AJ0160: { quantity: 1, manufactured: 5 },
    'AJ0160@c2': { quantity: 1, manufactured: 0 },
  });
  assert.equal(start.AJ0160.quantity, 2);
  assert.deepEqual(inventory.normalize(c2), c2);
  const c3 = inventory.ascend(c2, '1xaj0160@C2', 'c1');
  assert.equal(c3['AJ0160@c2'].quantity, 0);
  assert.equal(c3['AJ0160@c3'].quantity, 1);
  assert.throws(() => inventory.ascend(c3, 'AJ0160', 'c1', 1), /主要配装/);
  assert.throws(() => inventory.ascend(c3, 'AJ0160@c2', 'c1'), /没有库存/);
  assert.throws(() => inventory.ascend(c3, 'AJ0160@c5', 'c1'), /无法再登升/);
});

function craftContext({ conflict = false, fail = false, remoteMissing = false, loseResponse = false, malformedResponse = false,
  offlineRecovery = false, initialRecord = { resources: { material: 10 }, arsenal: {} }, initialTheatre = null,
  failTheatre = false } = {}) {
  let server = clone(initialRecord);
  let theatre = clone(initialTheatre);
  let theatreRevision = 1;
  let revision = 1;
  let posts = 0;
  const warnings = [];
  const c = context(['recordStateFromCampaign', 'readLatestRecordState', 'mutateCampaignRecordState', 'resourceAmount', 'evaluateCraftOption', 'gearCraftOperationKey', 'craftGear',
    'readTheatreRecord', 'writeTheatreRecord', 'changeAscensionCore', 'ascensionCoreBalance', 'ascendArsenalGear'], {
    window: { ATO_GEAR_INVENTORY: inventory, ATO_ASCENSION_CORE: ascensionCore },
    isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
    normalizeCraftRecordResources: clone,
    activeAccountId: 'A', campaignTechLoaded: true,
    CAMPAIGN_STORAGE_URL: '/api', CAMPAIGN_RECORD_URL: '/api?section=record', CAMPAIGN_THEATRE_URL: '/api?section=theatre',
    campaignSession: { accountId: 'login-A', changed: false, accept: value => value },
    gearRecordState: clone(server), gearRecordError: '', gearRecordRevision: 1,
    gearMutationInFlight: false, gearRecordSyncChannel: { postMessage: noop },
    gearCraftOperations: new Map(),
    gearCraftPlans: new Map([['recipe', { gearId: 'AJ0160', gearName: '装备', options: [{ parts: [{ storageKey: 'material', amount: 3, label: '3×材料', unsupported: false }] }] }]]),
    mainView: { querySelectorAll: () => [] }, CSS: { escape: value => value },
    arsenalMessage: '', arsenalMessageError: false,
    alert: message => warnings.push(message), confirm: () => true,
    loadGearRecordState: noop, renderGearInventoryView: noop,
    fetch: async (url, options) => {
      if (String(url).includes('section=theatre')) {
        if (!options?.method) {
          return { ok: true, status: 200, json: async () => ({ ok: true, state: clone(theatre), revision: theatreRevision }) };
        }
        const payload = JSON.parse(options.body);
        assert.equal(payload.section, 'theatre');
        assert.equal(payload.expectedAccountId, 'login-A');
        if (failTheatre) return { ok: false, status: 500, json: async () => ({ ok: false, error: '剧场保存失败' }) };
        if (payload.expectedRevision !== theatreRevision) return { ok: false, status: 409, json: async () => ({ code: 'SAVE_CONFLICT' }) };
        theatre = payload.state;
        theatreRevision++;
        return { ok: true, status: 200, json: async () => ({ ok: true, revision: theatreRevision }) };
      }
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
  return { c, warnings, server: () => server, theatre: () => theatre, posts: () => posts, reconnect: () => { offlineRecovery = false; } };
}

test('retrying an ascension with a lost response transfers only one copy', async () => {
  const { c, server, theatre, posts, reconnect } = craftContext({
    initialRecord: { resources: { material: 10 }, arsenal: { AJ0160: { quantity: 2 } } },
    initialTheatre: { hold: { c1: { core: { count: 2, notes: '' } } } },
    loseResponse: true, offlineRecovery: true,
  });
  context(['ascendArsenalGear'], c);
  c.window.ATO_ARSENAL_LOADOUT = loadout;
  c.gearAscensionOperations = new Map();
  const item = { gearId: 'AJ0160', originCycle: 'c1', name: '装备' };
  const key = c.gearCraftOperationKey('ascension:AJ0160');
  await assert.rejects(c.ascendArsenalGear(item, 'c2', key), /response lost/);
  reconnect();
  await c.ascendArsenalGear(item, 'c2', key);
  assert.equal(posts(), 1);
  assert.deepEqual(server().arsenal, {
    AJ0160: { quantity: 1, manufactured: 0 },
    'AJ0160@c2': { quantity: 1, manufactured: 0 },
  });
  assert.deepEqual(server().resources, { material: 10 });
  // 两次调用只消耗一件对应故事集的升华核心（重试读到收据就不再扣）。
  assert.equal(theatre().hold.c1.core.count, 1);
  assert.match(c.arsenalMessage, /消耗迷纹登升核心 ×1/);
});

test('登升会消耗装备当前故事集的升华核心，余额不足时拒绝登升', async () => {
  const { c, server, theatre, posts } = craftContext({
    initialRecord: { resources: { material: 10 }, arsenal: { AJ0160: { quantity: 2 } } },
    initialTheatre: { hold: { c1: { core: { count: 1, notes: '' } } } },
  });
  context(['ascendArsenalGear'], c);
  c.window.ATO_ARSENAL_LOADOUT = loadout;
  c.gearAscensionOperations = new Map();
  const item = { gearId: 'AJ0160', originCycle: 'c1', name: '装备' };

  await c.ascendArsenalGear(item, 'c2', c.gearCraftOperationKey('ascension:AJ0160'));
  assert.equal(theatre().hold.c1.core.count, 0);
  assert.equal(server().arsenal['AJ0160@c2'].quantity, 1);

  // 核心用完了：第二件拒绝登升，军械库不动，也不再弹一次保存。
  c.gearAscensionOperations = new Map();
  const before = posts();
  await assert.rejects(c.ascendArsenalGear({ ...item, gearId: 'AJ0160' }, 'c2', c.gearCraftOperationKey('ascension:AJ0160-2')), /缺少迷纹登升核心/);
  assert.equal(posts(), before);
  assert.equal(server().arsenal.AJ0160.quantity, 1);
  assert.equal(theatre().hold.c1.core.count, 0);
});

test('装备没能保存时把扣掉的升华核心退回', async () => {
  const { c, theatre } = craftContext({
    initialRecord: { resources: { material: 10 }, arsenal: { AJ0160: { quantity: 1 } } },
    initialTheatre: { hold: { c2: { core: { count: 1, notes: '备注' } } } },
    fail: true,
  });
  context(['ascendArsenalGear'], c);
  c.window.ATO_ARSENAL_LOADOUT = loadout;
  c.gearAscensionOperations = new Map();
  await assert.rejects(c.ascendArsenalGear({ gearId: 'AJ0160', originCycle: 'c2', name: '装备' }, 'c3',
    c.gearCraftOperationKey('ascension:AJ0160@c2')), /保存失败/);
  assert.equal(theatre().hold.c2.core.count, 1);
  assert.equal(theatre().hold.c2.core.notes, '备注');
});

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

test('a lost loadout save response is recovered from the record without writing twice', async () => {
  const initialRecord = {
    resources: { material: 10 },
    arsenal: { AJ0163: { quantity: 1, manufactured: 3 } },
    titans: [{ id: 'dream', name: '梦行者', count: 1 }],
  };
  const { c, server, posts } = craftContext({ loseResponse: true, initialRecord });
  context(['arsenalLoadoutDraft', 'loadGearRecordState', 'saveArsenalLoadout'], c);
  c.window.ATO_ARSENAL_LOADOUT = loadout;
  Object.assign(c, { arsenalLoadoutEditor: null, gearRecordLoadInFlight: false, campaignStorageAvailable: false,
    refreshExplorationTechLockDisplay: noop });
  const editor = c.arsenalLoadoutDraft();
  assert.deepEqual(clone(editor.baseline), loadout.normalize(null));
  editor.draft.slots[0] = { titanId: 'dream', equipment: ['AJ0163'] };
  const names = new Map([['AJ0163', 'Club']]);
  await c.saveArsenalLoadout(editor, names);
  assert.equal(posts(), 1);
  assert.deepEqual(server(), { ...initialRecord, arsenalLoadouts: clone(editor.draft) });
  assert.deepEqual(clone(editor.baseline), clone(editor.draft));
  assert.match(editor.notice, /配装已保存/);
  assert.equal(editor.error, '');
  assert.equal(c.gearMutationInFlight, false);
  await c.saveArsenalLoadout(editor, names);
  assert.equal(posts(), 1);
});

function catalogContext() {
  const production = require('../technology/ato_gear_production.json');
  return context(['normalizeGearId', 'getGearName', 'getTechDisplayName', 'gearPart', 'gearPartMatchesFilter', 'productionRecordCycle', 'arsenalCatalog', 'arsenalItemMatchesFilters'], {
    window: { ATO_GEAR_INVENTORY: inventory }, gearProductionData: production,
    gearCardDetails: require('../technology/gear_card_images.json').cards,
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

test('all campaign-eligible Theatre gear uses the same card image in the arsenal', () => {
  const c = catalogContext();
  const { loot, rewardKey } = require('../theatre/catalog.js');
  const terms = require('../theatre/terms.js');
  const rewardImages = require('../theatre/reward-images.json');
  const { images } = require('../technology/gear_card_images.json');
  const lookup = context(['gearImageSrc'], { gearCardImages: images });
  const arsenal = new Map(c.arsenalCatalog().map(item => [item.gearId, item]));
  const rewards = Object.values(loot).flat();
  const paths = [...rewards.flatMap(reward => rewardImages[rewardKey(reward)]), ...rewardImages.skyseer];
  for (const imagePath of paths) {
    const id = path.basename(imagePath, '.jpg').toUpperCase();
    assert.ok(arsenal.has(id), id);
    assert.equal('technology/' + lookup.gearImageSrc(id), imagePath);
  }
  assert.deepEqual(clone(arsenal.get('ZJ1239').cycles), ['c1']);
  assert.deepEqual(clone(arsenal.get('ZJ1240').cycles), ['c1']);
  assert.equal(inventory.adjust({}, 'ZJ1240', 1).ZJ1240.quantity, 1);
  for (const reward of rewards) {
    const id = path.basename(rewardImages[rewardKey(reward)][0], '.jpg').toUpperCase();
    for (const language of ['fan', 'official', 'en']) {
      const name = terms.loot(reward, language).toLowerCase();
      assert.ok(c.arsenalItemMatchesFilters(arsenal.get(id), name), name);
    }
  }
  for (const name of ['揽月', '摘天之盔', 'skyreach']) assert.ok(c.arsenalItemMatchesFilters(arsenal.get('ZJ1240'), name), name);
});

test('campaign reward variants can be found under their own cycles and names', () => {
  const c = catalogContext();
  const arsenal = new Map(c.arsenalCatalog().map(item => [item.gearId, item]));
  c.arsenalCycleFilter = 'c4';
  assert.ok(c.arsenalItemMatchesFilters(arsenal.get('ZJ2573'), '盖亚神盾'));
  assert.ok(c.arsenalItemMatchesFilters(arsenal.get('ZJ2574'), 'blades of rage'));
  assert.equal(c.arsenalItemMatchesFilters(arsenal.get('ZJ3000'), 'pantheon'), false);
  c.arsenalCycleFilter = 'c5';
  assert.ok(c.arsenalItemMatchesFilters(arsenal.get('ZJ3000'), 'pantheon'));
  assert.equal(arsenal.get('ZJ3000').part.key, 'arm_all_h');
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

test('the arsenal opens a draft from the active profile and renders retained gear and available stock', () => {
  const c = catalogContext();
  context(['arsenalItemIsAvailable', 'arsenalEntryOptions', 'arsenalMessageHtml', 'arsenalThumbnailHtml', 'arsenalGearNames', 'arsenalLoadoutDraft', 'arsenalLoadoutCards',
    'renderArsenalLoadout', 'arsenalItemHtml', 'bindArsenalLoadout', 'renderArsenalPage'], c);
  c.window.ATO_ARSENAL_LOADOUT = loadout;
  const control = { addEventListener: noop };
  const panel = { querySelectorAll: () => [], querySelector: () => control };
  Object.assign(c, {
    ARSENAL_SIDE_LIMIT: 4,
    activeAccountId: 'A', campaignSession: { accountId: 'login-A' }, arsenalLoadoutEditor: null,
    mainView: { classList: { remove: noop }, querySelectorAll: () => [],
      querySelector: selector => selector === '.arsenal-loadout' ? panel : control },
    data: { pages: [] }, search: { value: '' }, count: {}, currentTab: 'arsenal',
    arsenalOnlyAvailable: false, arsenalSelectedGear: '', arsenalAddQuantity: 1, arsenalMessage: '',
    arsenalEntryQuery: '', arsenalShowEntryNames: false,
    gearMutationInFlight: false, gearRecordLoadInFlight: false, gearRecordError: '', gearImageSrc: id => `cards/${id}.jpg`,
    renderCycleButton: noop, requestGearRecordState: noop, esc: String,
  });
  c.gearRecordState = {
    titans: [{ id: 'dream', name: '梦行者', count: 2 }],
    arsenal: { AJ0160: { quantity: 0, manufactured: 2 }, AJ0163: { quantity: 1, manufactured: 1 },
      AJ0257: { quantity: 1 }, 'T:tt_earthshaker': { quantity: 1 } },
    arsenalLoadouts: { slots: [{ titanId: 'dream', equipment: ['AJ0163'] }], presets: [] },
  };
  assert.equal(c.arsenalLoadoutDraft().open, false);
  c.renderArsenalPage();
  assert.match(c.mainView.innerHTML, /class="gear-page arsenal-page"/);
  assert.doesNotMatch(c.mainView.innerHTML, /data-gear-id="AJ0160"/);
  assert.match(c.mainView.innerHTML, /<option value="AJ0160"/);
  assert.equal(c.count.textContent, '军械库 3 种 / 3 件');
  c.arsenalLoadoutDraft().open = true;
  c.renderArsenalPage();
  const html = c.mainView.innerHTML;
  assert.match(html, /class="gear-page arsenal-page is-loadout-open"/);
  assert.deepEqual([...html.matchAll(/data-loadout-main="(\d+)"/g)].map(match => match[1]), ['0', '1', '2', '3']);
  assert.doesNotMatch(html, />主要装备<\/button>/);
  assert.equal((html.match(/class="arsenal-loadout-player"/g) || []).length, 4);
  assert.equal((html.match(/data-loadout-titan=/g) || []).length, 4);
  assert.match(html, /<option value="dream"\s+selected>梦行者/);
  assert.match(html, /data-loadout-save\s+disabled/);
  assert.match(html, /data-loadout-remove="AJ0163"/);
  assert.match(html, /aria-label="手数 1" title="手数 1"><svg viewBox="10 34 78 78"[^>]*><image href="cards\/AJ0163.jpg"[^]*?<\/svg><b>×1<\/b>/);
  assert.doesNotMatch(html, /arsenal-loadout-card-name/);
  assert.match(html, /data-loadout-add="AJ0163"\s+disabled/);
  assert.match(html, /data-loadout-add="AJ0257"\s*>/);
  assert.doesNotMatch(html, /data-loadout-add="T:tt_earthshaker"/);

  c.activeAccountId = 'B';
  c.gearRecordState = { titans: [{ id: 'own', name: '守战者', count: 1 }], arsenal: {} };
  c.renderArsenalPage();
  assert.match(c.mainView.innerHTML, /<option value="own"\s*>守战者/);
  assert.doesNotMatch(c.mainView.innerHTML, /value="dream"|data-loadout-remove="AJ0163"/);
});

test('manual entry shows only IDs by default and searches names and aliases after opt-in', () => {
  const c = catalogContext();
  context(['arsenalItemIsAvailable', 'arsenalEntryOptions'], c);
  Object.assign(c, { arsenalOnlyAvailable: false, arsenalEntryQuery: '  aj0257  ', arsenalShowEntryNames: false, arsenalSelectedGear: 'AJ0160' });
  const catalog = c.arsenalCatalog();
  const options = () => c.arsenalEntryOptions(catalog, (id, label) => `${id}:${label}`);
  assert.equal(options().html, 'AJ0257:AJ0257');
  assert.equal(c.arsenalSelectedGear, 'AJ0257');
  c.arsenalEntryQuery = 'shieldblade';
  assert.equal(options().empty, true);
  assert.equal(c.arsenalSelectedGear, '');
  c.arsenalShowEntryNames = true;
  assert.match(options().html, /AJ0257:护盾之刃 · AJ0257/);
  c.arsenalEntryQuery = '护盾之刃';
  assert.match(options().html, /AJ0257:护盾之刃 · AJ0257/);
  c.arsenalCycleFilter = 'c2';
  assert.equal(options().empty, true);
});

test('usable gear includes current and future tiers plus the previous cycle’s printed Ascended gear', () => {
  const c = catalogContext();
  context(['arsenalItemIsAvailable', 'arsenalEntryOptions', 'arsenalCoreBadge', 'arsenalThumbnailHtml'], c);
  Object.assign(c, {
    arsenalOnlyAvailable: true, arsenalEntryQuery: '', arsenalShowEntryNames: false, arsenalSelectedGear: '',
    currentRecordCycleForGear: () => 'c2', gearImageSrc: id => `cards/${id}.jpg`, esc: String,
  });
  Object.assign(c.gearRecordState.arsenal, {
    'AJ0160@c2': { quantity: 1 }, 'AJ0160@c3': { quantity: 1 },
  });
  const catalog = c.arsenalCatalog();
  const mothlame = catalog.find(item => item.gearId === 'AJ0262');
  assert.equal(mothlame.originCycle, 'c1');
  assert.deepEqual(clone(mothlame.cycles), ['c1']);
  assert.equal(mothlame.ascendedCycle, '');
  assert.ok(inventory.isAvailable(mothlame, 'c1'));
  const usable = new Set(catalog.filter(c.arsenalItemIsAvailable).map(item => item.gearId));
  for (const id of ['BJ0827', 'AJ0262', 'AJ0273', 'ZJ1239', 'ZJ1240', 'CJ1477', 'EJ2995', 'AJ0160@c2', 'AJ0160@c3']) {
    assert.ok(usable.has(id), id);
  }
  assert.ok(!usable.has('AJ0160'));
  const options = c.arsenalEntryOptions(catalog, (id, label) => `${id}:${label}\n`).html;
  assert.match(options, /AJ0160@c2:AJ0160 · 登升至循环 2/);
  assert.match(options, /CJ1477:CJ1477/);
  assert.match(options, /AJ0160@c3:AJ0160 · 登升至循环 3/);
  assert.match(options, /AJ0160:AJ0160/);
  assert.match(c.arsenalThumbnailHtml('AJ0160@c2', '装备'), /cards\/AJ0160.jpg.*theatre-core.svg/);
  assert.match(c.arsenalThumbnailHtml('AJ0262', '蛾锦'), /arsenal-thumbnail-card.*theatre-core.svg/);
  c.currentRecordCycleForGear = () => 'c3';
  const shownInC3 = new Set(catalog.filter(c.arsenalItemIsAvailable).map(item => item.gearId));
  assert.ok(shownInC3.has('AJ0160@c3'));
  assert.ok(shownInC3.has('BJ0948'));
  assert.ok(!shownInC3.has('AJ0160@c2'));
  assert.ok(!shownInC3.has('AJ0262'));
  assert.ok(!shownInC3.has('AJ0273'));
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
  assert.equal(all.size, 267);
  assert.ok(two.has('ZJ1239') && !all.has('ZJ1240'));
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
