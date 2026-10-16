const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../map/titan-capture-rules.js');
const data = require('../map/titan-markers.js');
const technologyRules = require('../technology/structure-tech-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const { create } = require('../technology/structure-tech-client.js');
const clone = value => JSON.parse(JSON.stringify(value));
const engine = rules.createEngine({ technologyRules, data });
function context(overrides = {}) {
  return { cycleId: 'c1', cycle: 'c1', day: 4, state: { day: 4 }, dictionary,
    techKey: 'map-titan', actionId: 'map-collect', operationId: rules.baseId('c1', '002'), selection: { tileId: '002' },
    map: { cycles: { c1: { currentTile: '002', explored: { '002': true }, tokens: { AG: '002' } } } },
    technology: { unlocked: ['titan hunting'], unimportant: ['titan hunting'] },
    record: { cycle: 'c1', fate: '2', cycleStats: { c1: { fate: '2' } }, titans: [
      { id: 'hurt', name: '梦行者', count: 3, crippled: true },
      { id: 'healthy', name: 'Dreamwalker', count: 2, limit: 2, crippled: false },
    ] }, automation: { version: 1, events: {} }, ...overrides };
}
const hunt = (overrides = {}) => context({ techKey: 'titan hunting', actionId: 'map-hunt',
  operationId: rules.huntId('c1', 4), selection: { tileId: '002', checkResult: 'success' }, ...overrides });

test('reviewed Titan icons cover all cycles and both C5 faces without confusing city or faction symbols', () => {
  assert.deepEqual(['c1','c2','c3','c4','c5'].map(cycle => Object.keys(data.markers).filter(id => id.startsWith(`${cycle}:`)).length), [19,22,22,19,40]);
  assert.equal(rules.marker('c1', '001', {}, data), null);
  assert.equal(rules.marker('c1', '041', {}, data), null, 'the battle icon is not a Titan reward');
  assert.ok(rules.marker('c4', '036', {}, data));
  assert.ok(rules.marker('c5', '003', {}, data));
  assert.ok(rules.marker('c5', '003', { tileVariants: { '003': 'alternate' } }, data));
  assert.ok(rules.marker('c1', '023', { tileVariants: { '023': 'alternate' } }, data));
});

test('base reward adds one healthy dreamwalker, preserves crippled rows and does not require a technology', () => {
  const ctx = context({ technology: { unlocked: [] } }), original = clone(ctx);
  const result = engine.prepareOperation(ctx);
  assert.equal(result.ok, true);
  assert.deepEqual(ctx, original, 'previewing or preparing cannot mutate the source');
  assert.equal(result.record.titans[0].count, 3);
  assert.equal(result.record.titans[1].count, 3);
  assert.equal(result.record.titans[1].limit, 3);
  assert.equal(result.record.fate, '2');
  assert.deepEqual(result.readSections, ['map']);
  const onlyHurt = context(); onlyHurt.record.titans.pop();
  const added = engine.prepareOperation(onlyHurt).record.titans;
  assert.equal(added[1].name, '梦行者');
  assert.equal(added[1].crippled, false);
});

test('scouting, another current location and tiles without a Titan cannot grant a reward', () => {
  for (const saved of [
    { currentTile: '002', explored: {}, previewRevealed: { '002': true } },
    { currentTile: '001', explored: { '002': true } },
    { currentTile: '001', explored: { '001': true } },
  ]) {
    const result = engine.prepareOperation(context({ map: { cycles: { c1: saved } } }));
    assert.equal(result.code, 'INVALID_LOCATION');
  }
});

test('extra capture validates ownership and a player result, charging fate even on failure', () => {
  const success = engine.prepareOperation(hunt());
  assert.equal(success.ok, true, 'marking technology unimportant does not disable it');
  assert.equal(success.record.fate, '3');
  assert.equal(success.record.cycleStats.c1.fate, '3');
  assert.equal(success.record.titans[1].count, 3);
  const failure = engine.prepareOperation(hunt({ selection: { tileId: '002', checkResult: 'failure' } }));
  assert.equal(failure.record.fate, '3');
  assert.equal(failure.record.titans[1].count, 2);
  assert.equal(failure.operation.gained, 0);
  assert.equal(engine.prepareOperation(hunt({ technology: { unlocked: [] } })).code, 'LOCKED_TECH');
  assert.equal(engine.prepareOperation(hunt({ selection: { tileId: '002' } })).code, 'CHECK_REQUIRED');
  const disabled = hunt(); disabled.record.explorationDelays = { disabledTechs: { c1: { 'titan hunting': {} } } };
  assert.equal(engine.prepareOperation(disabled).code, 'LOCKED_TECH');
});

test('capture keeps its cycle fate separate and validates counts before saving', () => {
  const ctx = hunt(); ctx.record.cycle = 'c3'; ctx.record.fate = '19';
  const result = engine.prepareOperation(ctx);
  assert.equal(result.record.fate, '19');
  assert.equal(result.record.cycleStats.c1.fate, '3');
  ctx.record.cycleStats.c1.fate = 'unknown';
  assert.equal(engine.prepareOperation(ctx).code, 'INVALID_FATE');
  const bad = context(); bad.record.titans[0].count = -1;
  assert.equal(engine.prepareOperation(bad).code, 'INVALID_TITANS');
});

function fixture(options = {}) {
  const ctx = context();
  const campaign = { sections: {
    dashboard: { activeProfileId: 'other', profiles: {
      chosen: { cycles: { c1: { state: { day: 4, notes: 'keep', techAutomation: ctx.automation } } } },
      other: { cycles: { c1: { state: { day: 99 } } } },
    } }, record: { users: { chosen: ctx.record, other: { fate: '42', titans: [] } } },
    map: { users: { chosen: ctx.map } }, technology: { users: { chosen: ctx.technology } },
  }, sectionRevisions: { dashboard: 0, record: 0, map: 0, technology: 0, heroes: 0 } };
  const posts = [];
  const response = (status, payload) => ({ status, ok: status === 200, json: async () => clone(payload) });
  const fetch = async (url, init = {}) => {
    if (url === '/dictionary') return response(200, dictionary);
    if (init.method !== 'POST') return response(200, { ok: true, user: { id: 'alice' }, campaign });
    const payload = JSON.parse(init.body); posts.push(payload);
    options.beforePost?.(campaign, posts.length);
    if (Object.entries(payload.expectedRevisions).some(([name, revision]) => campaign.sectionRevisions[name] !== revision)) return response(409, { ok: false, code: 'SAVE_CONFLICT' });
    campaign.sections.dashboard = payload.sections.dashboard;
    campaign.sections.record.users[payload.userId] = payload.sections.record;
    const sections = {};
    for (const name of Object.keys(payload.sections)) sections[name] = ++campaign.sectionRevisions[name];
    if (options.loseResponse) throw new Error('lost after commit');
    return response(200, { ok: true, user: { id: 'alice' }, sections });
  };
  const session = { accountId: 'alice', accept: value => value };
  const client = create({ fetch, session, rules: engine, apiUrl: '/campaign', dictionaryUrl: '/dictionary' });
  const target = { profileId: 'chosen', cycleId: 'c1', techKey: ctx.techKey, actionId: ctx.actionId,
    operationId: ctx.operationId, selection: ctx.selection };
  return { client, target, campaign, posts };
}

test('concurrent automatic reward requests and lost responses grant one Titan in the pinned profile', async () => {
  for (const loseResponse of [false, true]) {
    const f = fixture({ loseResponse });
    await Promise.all([f.client.submit(f.target), f.client.submit(f.target)]);
    assert.equal(f.campaign.sections.record.users.chosen.titans[1].count, 3);
    assert.equal(f.campaign.sections.record.users.other.fate, '42');
    assert.equal(f.campaign.sectionRevisions.dashboard, 1);
    assert.equal(f.posts[0].expectedRevisions.map, 0);
    assert.match(f.campaign.sections.dashboard.profiles.chosen.cycles.c1.state.notes, /地图捕获.*梦行者/);
    await f.client.submit(f.target);
    assert.equal(f.campaign.sectionRevisions.dashboard, 1);
  }
});

test('moving during capture rejects the entire transaction after re-reading the map', async () => {
  const f = fixture({ beforePost(campaign, attempt) {
    if (attempt !== 1) return;
    campaign.sections.map.users.chosen.cycles.c1.currentTile = '001';
    campaign.sectionRevisions.map++;
  } });
  await assert.rejects(f.client.submit(f.target), { code: 'INVALID_LOCATION' });
  assert.equal(f.campaign.sections.record.users.chosen.titans[1].count, 2);
  assert.equal(f.campaign.sectionRevisions.record, 0);
});

test('the daily extra capture receipt also protects against a later failure or another tile on the same day', async () => {
  const f = fixture();
  f.target = { ...f.target, techKey: 'titan hunting', actionId: 'map-hunt', operationId: rules.huntId('c1', 4), selection: { tileId: '002', checkResult: 'failure' } };
  await Promise.all([f.client.submit(f.target), f.client.submit(f.target)]);
  assert.equal(f.campaign.sections.record.users.chosen.fate, '3');
  await assert.rejects(f.client.submit({ ...f.target, selection: { tileId: '002', checkResult: 'success' } }), { code: 'OPERATION_MISMATCH' });
  assert.equal(f.campaign.sections.record.users.chosen.titans[1].count, 2);
  assert.equal(f.campaign.sectionRevisions.record, 1);
});
