const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
function fn(name) {
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function harness(cycle = 'c1') {
  const calls = { saved: [], records: 0, phases: [] };
  const ctx = vm.createContext({
    state: { day: 7, nextBattleTerrain: null },
    currentCycleConfig: () => ({ id: cycle }), normalizeCampaignDay: String,
    firstCheckedSurveyHubTarget: () => null, firstCheckedSurveyRrTarget: () => null,
    saveState() { calls.saved.push(clone(ctx.state)); }, renderFlow() {},
    recordSyncChannel: null, syncSurveyAdventureToArgoRecord() { calls.records++; },
    applyMnemosTagToHeroes() {}, ownsDashboardWriteLease: () => true,
    todayTrackIcons: () => [{ className: 'battle' }], explorationDayNumber: Number,
    processExplorationDelays: async phase => { calls.phases.push(phase); return true; },
    window: { alert(message) { throw new Error(message); } },
  });
  const data = source.match(/^    const surveyConstantData = \{[^]*?^    };/m);
  assert.ok(data);
  vm.runInContext(data[0], ctx);
  for (const name of ['isPlainObject', 'surveyConstantsDayKey', 'normalizeSurveyConstants',
    'ensureTodaySurveyConstants', 'getCurrentSurveyConstantData', 'findSurveyHub', 'findSurveyHubBox',
    'surveyHubSummaryRow', 'normalizeNextBattleTerrain', 'setNextBattleTerrainFromHub',
    'clearNextBattleTerrainForHub', 'surveyRrBoxKey', 'setSurveyConstant', 'completeTimelineBattle']) vm.runInContext(fn(name), ctx);
  ctx.hubs = ctx.getCurrentSurveyConstantData().hubs;
  return { ctx, calls, select: (index, checked = true, boxId = 'alpha') => ctx.setSurveyConstant('hubs', ctx.hubs[index].id, boxId, checked) };
}

test('every cycle keeps its first pending terrain while recording later story constants normally', () => {
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const { ctx, calls, select } = harness(cycle);
    select(0);
    const original = ctx.state.nextBattleTerrain;
    assert.ok(original.terrain);
    select(1);
    assert.equal(ctx.state.nextBattleTerrain, original, cycle);
    assert.equal(ctx.state.surveyConstants.hubs[ctx.hubs[1].id].alpha, true);
    assert.equal(calls.records, 2, 'only the later terrain effect is skipped');
    assert.equal(calls.saved.at(-1).nextBattleTerrain.hubId, ctx.hubs[0].id);
  }
});

test('a pending terrain survives reloads and repeated selections without changing its original source or day', () => {
  const { ctx, select } = harness();
  select(0);
  const original = clone(ctx.state.nextBattleTerrain);
  ctx.state.nextBattleTerrain = ctx.normalizeNextBattleTerrain(clone(original));
  ctx.state.day = 12;
  select(0);
  select(1);
  assert.deepEqual(clone(ctx.state.nextBattleTerrain), original);
});

test('undoing an ignored terrain choice preserves the pending terrain; its own choice remains undoable', () => {
  const { ctx, select } = harness();
  select(0);
  const original = ctx.state.nextBattleTerrain;
  select(1);
  select(1, false);
  assert.equal(ctx.state.nextBattleTerrain, original);
  select(0, false);
  assert.equal(ctx.state.nextBattleTerrain, null);
});

test('a completed battle clears the old terrain without queuing skipped terrain, and later choices can add a new one', async () => {
  const { ctx, calls, select } = harness('c4');
  select(0);
  select(1);
  ctx.todayTrackIcons = () => [];
  assert.equal(await ctx.completeTimelineBattle(), false);
  assert.equal(ctx.state.nextBattleTerrain.hubId, ctx.hubs[0].id);
  ctx.todayTrackIcons = () => [{ className: 'battle' }];
  assert.equal(await ctx.completeTimelineBattle(), true);
  assert.equal(ctx.state.nextBattleTerrain, null);
  assert.equal(ctx.state.surveyConstants.hubs[ctx.hubs[1].id].alpha, true);
  assert.deepEqual(calls.phases, ['timeline-battle-start', 'timeline-battle-end']);
  select(2);
  assert.equal(ctx.state.nextBattleTerrain.hubId, ctx.hubs[2].id);
});

test('R&R choices preserve pending terrain and malformed legacy terrain does not block a new story reward', () => {
  const { ctx, select } = harness();
  select(0);
  const original = ctx.state.nextBattleTerrain;
  ctx.setSurveyConstant('rr', '1', '1', true);
  ctx.setSurveyConstant('rr', '1', '1', false);
  assert.equal(ctx.state.nextBattleTerrain, original);
  ctx.state.nextBattleTerrain = { terrain: '  ' };
  select(1);
  assert.equal(ctx.state.nextBattleTerrain.hubId, ctx.hubs[1].id);
});
