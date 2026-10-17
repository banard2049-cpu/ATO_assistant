const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rules = require('../map/frozen-time-rules.js');
const technologyRules = require('../technology/structure-tech-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const { create } = require('../technology/structure-tech-client.js');
const clone = value => JSON.parse(JSON.stringify(value));
const globals = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../map/map-tile-tags.js'), 'utf8'), globals);
const tags = globals.window.ATO_MAP_TILE_TAGS;
const engine = rules.createEngine({ technologyRules, tags });

function context() {
  return { cycle: 'c3', cycleId: 'c3', day: 4, dictionary,
    techKey: 'map-frozen-time', actionId: 'map-collect-frozen-time', operationId: rules.receiptId('007'), selection: { tileId: '007' },
    map: { cycles: { c3: { currentTile: '007', latestRevealedTile: '007', explored: { '007': true },
      explorationEntries: { '007': true }, tokens: { AG: '007' } } } },
    technology: { unlocked: ['time solutions'] },
    record: { cycle: 'c3', frozenTime: '1', cycleStats: { c3: { frozenTime: '1', fate: '2' } } },
    automation: { version: 1, events: {} } };
}

test('new exploration gains one frozen time with Time Solutions, preserving its source and unrelated stats', () => {
  const ctx = context(), before = clone(ctx);
  const result = engine.prepareOperation(ctx);
  assert.equal(result.ok, true);
  assert.equal(result.record.cycleStats.c3.frozenTime, '2');
  assert.equal(result.record.frozenTime, '2');
  assert.equal(result.record.cycleStats.c3.fate, '2');
  assert.equal(result.operation.capacity, 3);
  assert.equal(result.operation.skipTimeline, true);
  assert.deepEqual(result.readSections, ['map']);
  assert.deepEqual(ctx, before);
  ctx.record.cycle = 'c1'; ctx.record.frozenTime = '42';
  assert.equal(engine.prepareOperation(ctx).record.frozenTime, '42', 'another cycle keeps its top-level stat');
});

test('silo capacity follows available technology without clamping or overwriting existing resources', () => {
  for (const advanced of [false, true]) for (const value of [2, 3, 4, 5, 6]) {
    const ctx = context();
    if (advanced) ctx.technology.unlocked.push('advanced time solutions');
    ctx.record.cycleStats.c3.frozenTime = String(value);
    const result = engine.prepareOperation(ctx), cap = advanced ? 5 : 3;
    assert.equal(result.ok, true);
    assert.equal(result.operation.capacity, cap);
    assert.equal(result.operation.gained, Number(value < cap));
    assert.equal(result.record.cycleStats.c3.frozenTime, String(value + Number(value < cap)));
  }
  const ctx = context();
  ctx.technology.unlocked.push('advanced time solutions');
  ctx.record.explorationDelays = { disabledTechs: { c3: { 'advanced time solutions': {} } } };
  assert.equal(engine.status(ctx, '007').capacity, 3);
});

test('unavailable technology and a full silo consume the opportunity so later changes cannot backfill it', () => {
  for (const reason of ['locked', 'full', 'disabled']) {
    const ctx = context();
    if (reason === 'locked') ctx.technology.unlocked = ['advanced time solutions'];
    if (reason === 'disabled') ctx.record.explorationDelays = { disabledTechs: { c3: { 'time solutions': {} } } };
    if (reason === 'full') ctx.record.cycleStats.c3.frozenTime = '3';
    const result = engine.prepareOperation(ctx);
    assert.equal(result.ok, true);
    assert.equal(result.operation.gained, 0);
    assert.equal(result.operation.reason, reason === 'disabled' ? 'locked' : reason);
    const retry = { ...ctx, record: result.record, automation: result.automation, technology: { unlocked: ['time solutions', 'advanced time solutions'] } };
    delete retry.record.explorationDelays;
    retry.record.cycleStats.c3.frozenTime = '0';
    assert.equal(engine.prepareOperation(retry).code, 'ALREADY_COLLECTED');
  }
  const hidden = context(); hidden.technology.unimportant = ['time solutions'];
  assert.equal(engine.prepareOperation(hidden).operation.gained, 1, 'a display preference does not disable a permanent ability');
});

test('scouting, revisits, legacy saves, other tiles and invalid input never grant frozen time', () => {
  const attempts = [
    ctx => { ctx.map.cycles.c3.explored = {}; ctx.map.cycles.c3.previewRevealed = { '007': true }; },
    ctx => { ctx.map.cycles.c3.latestRevealedTile = '016'; },
    ctx => { delete ctx.map.cycles.c3.explorationEntries; },
    ctx => { ctx.map.cycles.c3.currentTile = '016'; },
    ctx => { ctx.selection.tileId = '001'; },
  ];
  for (const mutate of attempts) {
    const ctx = context(); mutate(ctx);
    assert.equal(engine.prepareOperation(ctx).code, 'INVALID_LOCATION');
  }
  const invalid = context(); invalid.record.cycleStats.c3.frozenTime = 'unknown';
  assert.equal(engine.prepareOperation(invalid).code, 'INVALID_FROZEN_TIME');
  invalid.record.cycleStats.c3.frozenTime = '-1';
  assert.equal(engine.prepareOperation(invalid).code, 'INVALID_FROZEN_TIME');
  const wrongId = context(); wrongId.operationId = 'map-frozen-time:c3:016';
  assert.equal(engine.prepareOperation(wrongId).code, 'INVALID_OPERATION');
  assert.equal(engine.prepareOperation({ ...context(), cycle: 'c2', cycleId: 'c2' }).code, 'INVALID_CONTEXT');
});

function fixture(options = {}) {
  const ctx = context();
  const campaign = { sections: {
    dashboard: { activeProfileId: 'other', profiles: {
      chosen: { cycles: { c3: { state: { day: 4, notes: 'keep', techAutomation: ctx.automation } } } },
      other: { cycles: { c3: { state: { day: 99 } } } },
    } }, record: { users: { chosen: ctx.record, other: { frozenTime: '42' } } },
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
  const client = create({ fetch, session: { accountId: 'alice', accept: value => value }, rules: engine, apiUrl: '/campaign', dictionaryUrl: '/dictionary' });
  const target = { profileId: 'chosen', cycleId: 'c3', expectedDay: 4,
    techKey: ctx.techKey, actionId: ctx.actionId, operationId: ctx.operationId, selection: ctx.selection };
  return { client, target, campaign, posts };
}

test('concurrent pages, refreshes and lost responses add once to the pinned profile and save a durable log', async () => {
  for (const loseResponse of [false, true]) {
    const f = fixture({ loseResponse });
    await Promise.all([f.client.submit(f.target), f.client.submit(f.target)]);
    assert.equal(f.campaign.sections.record.users.chosen.cycleStats.c3.frozenTime, '2');
    assert.equal(f.campaign.sections.record.users.other.frozenTime, '42');
    assert.equal(f.campaign.sectionRevisions.record, 1);
    assert.equal(f.posts[0].expectedRevisions.map, 0);
    assert.match(f.campaign.sections.dashboard.profiles.chosen.cycles.c3.state.notes, /地图资源.*凝固时光.*2\/3/);
    await f.client.submit(f.target);
    assert.equal(f.campaign.sectionRevisions.record, 1);
  }
});

test('a concurrent move cancels the award, while a technology change recomputes it before committing', async () => {
  const moved = fixture({ beforePost(campaign, attempt) {
    if (attempt !== 1) return;
    campaign.sections.map.users.chosen.cycles.c3.currentTile = '016';
    campaign.sectionRevisions.map++;
  } });
  await assert.rejects(moved.client.submit(moved.target), { code: 'INVALID_LOCATION' });
  assert.equal(moved.campaign.sectionRevisions.record, 0);
  assert.equal(moved.campaign.sections.record.users.chosen.frozenTime, '1');
  const locked = fixture({ beforePost(campaign, attempt) {
    if (attempt !== 1) return;
    campaign.sections.technology.users.chosen.unlocked = [];
    campaign.sectionRevisions.technology++;
  } });
  const result = await locked.client.submit(locked.target);
  assert.equal(result.operation.reason, 'locked');
  assert.equal(locked.campaign.sections.record.users.chosen.frozenTime, '1');
});

test('both map movement entry points mark fresh exploration, while loading old exploration and revisiting do not', async () => {
  const mapSource = fs.readFileSync(require.resolve('../map/app.js'), 'utf8').replace(/\r\n/g, '\n');
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8').replace(/\r\n/g, '\n');
  const extract = (source, name) => source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'))[0];
  const saved = { explored: {}, previewRevealed: { '007': true } };
  const map = vm.createContext({ state: { activeCycleId: 'c3' } });
  vm.runInContext(extract(mapSource, 'markTileExplored'), map);
  map.markTileExplored(saved, '007');
  assert.equal(saved.explorationEntries['007'], true);
  assert.equal(saved.previewRevealed['007'], undefined);
  const legacy = { explored: { '007': true }, latestRevealedTile: '007' };
  map.markTileExplored(legacy, '007');
  assert.equal(legacy.explorationEntries, undefined);

  for (const command of ['move-argo', 'move-special']) {
    const savedCycle = { currentTile: '001', explored: {}, tokens: { AG: '001', AD: '' } };
    const ctx = vm.createContext({ mapCommandBusy: false, document: { querySelectorAll: () => [] },
      structureTechTarget: () => ({ profileId: 'original' }), assertStructureTechTarget() {},
      setMapCommandStatus() {}, loadMapCommandState: async () => ({ state: {} }), cloneJson: clone,
      currentMapCommandCycle: () => ({ cycleId: 'c3', cycle: {}, cycleState: savedCycle }),
      mapDirectionalTarget: () => '007', currentC3SpecialTargets: () => ['007'],
      saveMapCommandState: async () => {}, syncMapCommandLandmarks() {}, syncDashboardMapSnapshot() {}, updateDashboardTitanXTrack() {}, window: {} });
    vm.runInContext(extract(html, 'runMapCommand'), ctx);
    await ctx.runMapCommand(command, '007');
    assert.equal(savedCycle.explorationEntries['007'], true, command);
    delete savedCycle.explorationEntries;
    await ctx.runMapCommand(command, '007');
    assert.equal(savedCycle.explorationEntries, undefined, `${command} does not turn a revisit into a new exploration`);
  }
  const ctx = vm.createContext({ window: { ATO_MAP_DATA: { cycles: [{ id: 'c3' }] } },
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value) });
  vm.runInContext(extract(html, 'normalizeMapCommandState'), ctx);
  const normalized = ctx.normalizeMapCommandState({ cycles: { c3: saved } }, 'c3');
  assert.equal(normalized.cycles.c3.explorationEntries['007'], true, 'a later dashboard command preserves the fresh exploration metadata');
});
