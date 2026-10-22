const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
function extract(name) {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}

test('dashboard, record and map subscriptions ignore their own commit but still refresh external and legacy updates', () => {
  const calls = { dashboard: 0, record: 0, map: 0 };
  const listeners = {};
  const channel = name => ({ addEventListener(type, callback) {
    assert.equal(type, 'message'); listeners[name] = callback;
  } });
  const context = vm.createContext({
    dashboardPageId: 'this-console',
    campaignSyncChannel: channel('dashboard'), recordSyncChannel: channel('record'),
    structureTechMapSyncChannel: channel('map'),
    syncDashboardFromExternalUpdate: () => { calls.dashboard++; },
    refreshCachedArgoRecord: () => { calls.record++; },
    refreshStructureTechContext: async () => { calls.map++; },
  });
  const subscriptions = source.match(/^    listenForExternalCampaignSync\([^\n]+/gm);
  assert.equal(subscriptions.length, 3);
  vm.runInContext(extract('listenForExternalCampaignSync') + '\n' + subscriptions.join('\n'), context);
  for (const listener of Object.values(listeners)) listener({ data: { source: 'structure-tech', pageId: 'this-console', revision: 5 } });
  assert.deepEqual(calls, { dashboard: 0, record: 0, map: 0 }, 'the committed response already updates this console');
  for (const listener of Object.values(listeners)) {
    listener({ data: { source: 'structure-tech', pageId: 'other-console', revision: 6 } });
    listener({ data: { revision: 7 } });
    listener({ data: null });
  }
  assert.deepEqual(calls, { dashboard: 3, record: 3, map: 3 }, 'external and older senders must remain observable');
  context.listenForExternalCampaignSync(null, () => assert.fail('absent channels do not refresh'));
});

test('all dashboard transaction clients attach the same page identity and rebind after a session change', () => {
  const options = [];
  const context = vm.createContext({
    dashboardPageId: 'origin-console', campaignSessionEpoch: 1, sessionUser: { id: 'owner' },
    structureTechSession: () => ({ accountId: 'owner' }),
    structureTechConnection: null, structureTechConnectionEpoch: -1,
    structureTechContext: {}, structureTechContextRevision: 2, structureTechActionPanel: {},
    negotiationTechActionPanel: {}, explorationTechActionPanel: {},
    mapTitanConnection: null, mapTitanConnectionEpoch: -1,
    mapFrozenTimeConnection: null, mapFrozenTimeConnectionEpoch: -1,
    window: {
      ATO_STRUCTURE_TECH_CLIENT: { create(value) { options.push(value); return {}; } },
      ATO_MAP_TITAN_RULES: { createEngine: () => ({}) },
      ATO_MAP_FROZEN_TIME_RULES: { createEngine: () => ({}) },
    },
  });
  const names = ['structureTechClient', 'mapTitanClient', 'mapFrozenTimeClient'];
  vm.runInContext(names.map(extract).join('\n'), context);
  names.forEach(name => { const client = context[name](); assert.equal(context[name](), client); });
  assert.equal(options.length, 3);
  context.campaignSessionEpoch++;
  names.forEach(name => context[name]());
  assert.equal(options.length, 6);
  assert.ok(options.every(value => value.pageId === 'origin-console'));
});
