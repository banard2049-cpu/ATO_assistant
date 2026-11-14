const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../aibp/cycle-theme.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8');

function setup(search = '') {
  const icons = [];
  let onMessage;
  const context = {
    document: { body: { dataset: {} }, querySelector: () => ({}) },
    window: { location: { search }, ATO_CYCLE_SYMBOLS: { prependModuleLogo: (_target, logo) => icons.push(logo) } },
    URLSearchParams,
    BroadcastChannel: class {
      constructor(name) { assert.equal(name, 'ato-dashboard-cycle-v1'); }
      addEventListener(type, handler) { assert.equal(type, 'message'); onMessage = handler; }
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, icons, message: data => onMessage({ data }) };
}

test('direct links use the requested cycle before campaign loading', () => {
  const { context, icons } = setup('?cycle=c5');
  assert.equal(context.document.body.dataset.cycle, 'c5');
  assert.equal(icons.at(-1), 'evolution');
  assert.equal(setup('?cycle=invalid').context.document.body.dataset.cycle, 'c1');
});

test('dashboard notifications update the color theme but keep the fixed module logo', () => {
  const { context, icons, message } = setup();
  for (const cycleId of ['c2', 'c3', 'c4', 'c5']) {
    message({ type: 'active-cycle-changed', cycleId });
    assert.equal(context.document.body.dataset.cycle, cycleId);
    assert.equal(icons.at(-1), 'evolution');
  }
  message({ type: 'other', cycleId: 'c1' });
  message({ type: 'active-cycle-changed', cycleId: 'invalid' });
  assert.equal(context.document.body.dataset.cycle, 'c5');
});

test('campaign refresh uses the active dashboard profile, overriding stale URLs', () => {
  const { context } = setup('?cycle=c1');
  Object.assign(context, {
    syncHeliosAccess() {}, dashboardMapFactions: () => ({}),
    recordStateFromCampaign: () => ({}), renderMapFactionStatus() {},
  });
  const dashboard = html.match(/    function activeDashboardCycleFromCampaign\(campaign\) \{[\s\S]*?\n    \}/)[0];
  const apply = html.match(/    function applyCampaignMapFactionState\(campaign, user\) \{[\s\S]*?\n    \}/)[0];
  vm.runInContext(`let heliosAccountId; let campaignMapFactionState; ${dashboard}\n${apply}`, context);
  context.campaign = { sections: { dashboard: { activeProfileId: 'current', profiles: {
    old: { activeCycleId: 'c2' }, current: { activeCycleId: 'c4', cycles: { c4: { state: {} } } },
  } } } };
  vm.runInContext('applyCampaignMapFactionState(campaign, {});', context);
  assert.equal(context.document.body.dataset.cycle, 'c4');
  vm.runInContext('applyCampaignMapFactionState(null, {});', context);
  assert.equal(context.document.body.dataset.cycle, 'c4');
});
