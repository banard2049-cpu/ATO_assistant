const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const functions = ['previousCampaignDay', 'previousDay'].map(name => {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}).join('\n');
const clone = value => JSON.parse(JSON.stringify(value));

function setup(extra = {}) {
  const events = [];
  const restored = {activeProfileId: 'p', profiles: {}, day: 1};
  const ctx = vm.createContext({
    dateTrackData: {c2: {entries: [{day: 0}, {day: 1}, {day: '1a'}, {day: 2}]}},
    currentCycleConfig: () => ({id: 'c2'}), state: {day: 2}, archive: {activeProfileId: 'p'},
    ownsDashboardWriteLease: () => true, campaignRestoreInFlight: false,
    campaignSectionRevision: 5, campaignSavePending: false, campaignSaveTimer: null,
    elements: {previousDayButton: {disabled: false, textContent: '回到前一天'}, appShell: {inert: false}},
    saveState: () => events.push('save'), flushCampaignSave: async () => {events.push('flush'); return true;},
    sessionUser: {id: 'account'}, authUrl: '/api', clearTimeout: () => {}, cloneJson: clone,
    normalizeArchive: x => x, currentCycle: () => ({state: {day: 1}}),
    campaignSyncChannel: {postMessage: data => events.push(['broadcast', data.revision])},
    window: {alert: message => events.push(['alert', message]), location: {reload: () => events.push('reload')}},
    fetch: async (url, options) => {
      events.push(['request', url, JSON.parse(options.body)]);
      return {ok: true, json: async () => ({ok: true, campaign: {
        sections: {dashboard: restored}, sectionRevisions: {dashboard: 6},
      }})};
    }, ...extra,
  });
  vm.runInContext(functions, ctx);
  return {ctx, events};
}

test('previous day follows the date track including named days and first-day boundary', () => {
  const {ctx} = setup();
  assert.equal(ctx.previousCampaignDay(), '1a');
  ctx.state.day = '1a'; assert.equal(ctx.previousCampaignDay(), 1);
  ctx.state.day = 0; assert.equal(ctx.previousCampaignDay(), null);
  ctx.state.day = 7; assert.equal(ctx.previousCampaignDay(), 6);
  ctx.state.day = 'unknown'; assert.equal(ctx.previousCampaignDay(), null);
});

test('restore flushes changes, sends account/date/revision, adopts baseline and reloads', async () => {
  const {ctx, events} = setup();
  await ctx.previousDay();
  assert.deepEqual(events.slice(0, 2), ['save', 'flush']);
  assert.deepEqual(events[2], ['request', '/api?action=restore-previous-day', {
    expectedAccountId: 'account', expectedRevision: 5, profileId: 'p', cycleId: 'c2', currentDay: '2', day: '1a',
  }]);
  assert.equal(ctx.campaignSectionRevision, 6);
  assert.deepEqual(ctx.campaignSectionBaseline, clone(ctx.archive));
  assert.equal(ctx.state.day, 1);
  assert.equal(events.at(-1), 'reload');
});

test('missing backup preserves current state, unlocks controls and reports the reason', async () => {
  const {ctx, events} = setup({fetch: async () => ({ok: false, json: async () => ({error: '没有找到备份'})})});
  await ctx.previousDay();
  assert.equal(ctx.state.day, 2);
  assert.equal(ctx.campaignSectionRevision, 5);
  assert.equal(ctx.elements.appShell.inert, false);
  assert.equal(ctx.elements.previousDayButton.disabled, false);
  assert.match(events.at(-1)[1], /没有找到备份/);
  assert.ok(!events.includes('reload'));
});

test('unsaved offline changes prevent restore', async () => {
  const {ctx, events} = setup({flushCampaignSave: async () => false});
  await ctx.previousDay();
  assert.equal(ctx.state.day, 2);
  assert.match(events.at(-1)[1], /尚未保存/);
  assert.ok(!events.some(event => Array.isArray(event) && event[0] === 'request'));
});

test('read-only page and first day do not request a restore', async () => {
  for (const extra of [{ownsDashboardWriteLease: () => false}, {state: {day: 0}}]) {
    const {ctx, events} = setup(extra);
    await ctx.previousDay();
    assert.ok(!events.some(event => Array.isArray(event) && event[0] === 'request'));
  }
});

test('duplicate clicks are ignored while restore is pending', async () => {
  let finish;
  const {ctx, events} = setup({flushCampaignSave: () => new Promise(resolve => {finish = resolve;})});
  const first = ctx.previousDay();
  await ctx.previousDay();
  assert.equal(ctx.elements.appShell.inert, true);
  finish(true);
  await first;
  assert.equal(events.filter(event => Array.isArray(event) && event[0] === 'request').length, 1);
});

test('a cycle/day change during flush aborts the restore', async () => {
  const {ctx, events} = setup();
  ctx.flushCampaignSave = async () => {ctx.state.day = 8; return true;};
  await ctx.previousDay();
  assert.match(events.at(-1)[1], /已变更/);
  assert.ok(!events.some(event => Array.isArray(event) && event[0] === 'request'));
});

test('all inline dashboard scripts parse', () => {
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
});
