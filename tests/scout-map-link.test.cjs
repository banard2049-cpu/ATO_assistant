const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'map', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
function extract(name) {
  const match = source.match(new RegExp('^(?:async )?function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function harness(names, extra = {}) {
  const elements = Object.fromEntries(['scoutCount', 'hsProduceButton', 'hsRecallButton', 'hsDestroyButton'].map(id => [id, {}]));
  const state = { activeCycleId: 'c2', cycles: { c2: { tokens: { hsCount: 0, markers: {} }, tileNotes: {} } } };
  const context = vm.createContext({ elements, state, scoutRebuildByCycle: {},
    mapStateProfileId: 'A', campaignUserId: 'B', mapStateLoadedFromServer: true,
    clearPendingAdversarySpawn: noop, pushUndo: noop, saveState: noop, render: noop,
    activeCycleState: () => context.state.cycles[context.state.activeCycleId],
    removeMarkerEverywhere(cycle, id) { for (const markers of Object.values(cycle.tokens.markers)) delete markers[id]; },
    secondScreenMode: false, campaignSession: { changed: false }, mapSaveConflict: false,
    campaignStorageAvailable: true, campaignReconnectInFlight: false,
    scoutMapRefreshBusy: false, scoutMapRefreshPending: false,
    campaignSaveTimer: null, campaignSaveInFlight: false, campaignSaveQueuedBeforeReady: false,
    mapStateBaseline: clone(state), deepEqualValue: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    ...extra,
  });
  vm.runInContext(names.map(extract).join('\n'), context);
  return context;
}
const controls = ['scoutPlacedTileId', 'renderScoutControls', 'updateScoutRebuildStatus', 'produceScout', 'recallScout', 'destroyScout'];

test('map controls follow rebuild events in the pinned profile and cycle', () => {
  const c = harness(controls);
  const event = { techKey: 'canal reconnaissance', actionId: 'rebuild', status: 'pending', dueDay: 12 };
  const campaign = { sections: { dashboard: { activeProfileId: 'B', profiles: {
    A: { cycles: { c2: { state: { techAutomation: { events: { rebuild: event } } } } } },
    B: { cycles: {} },
  } } } };
  c.updateScoutRebuildStatus(campaign);
  assert.match(c.elements.scoutCount.textContent, /0.*重建中.*D12/);
  assert.equal(c.elements.hsProduceButton.disabled, true);
  c.produceScout();
  assert.equal(c.activeCycleState().tokens.hsCount, 0, 'manual production cannot bypass the pending rebuild');
  event.status = 'completed';
  c.activeCycleState().tokens.hsCount = 1;
  c.updateScoutRebuildStatus(campaign);
  assert.equal(c.elements.scoutCount.textContent, '1');
  assert.equal(c.elements.hsProduceButton.disabled, true, 'an existing ship cannot be produced again');
  c.produceScout();
  assert.equal(c.activeCycleState().tokens.hsCount, 1);
  c.destroyScout();
  c.renderScoutControls();
  assert.equal(c.elements.hsProduceButton.disabled, false);
});

test('recalling preserves a ship while destruction removes its position and quantity', () => {
  const c = harness(controls);
  const cycle = c.activeCycleState();
  cycle.tokens = { hsCount: 1, markers: { C2_4: { hs: true, calamity: true } } };
  c.renderScoutControls();
  assert.equal(c.elements.hsRecallButton.disabled, false);
  c.recallScout();
  assert.equal(cycle.tokens.hsCount, 1);
  assert.deepEqual(clone(cycle.tokens.markers), { C2_4: { calamity: true } });
  cycle.tokens.markers.C2_4.hs = true;
  c.destroyScout();
  assert.equal(cycle.tokens.hsCount, 0);
  assert.deepEqual(clone(cycle.tokens.markers), { C2_4: { calamity: true } });
  c.renderScoutControls();
  assert.equal(c.elements.hsRecallButton.disabled, true);
  assert.equal(c.elements.hsDestroyButton.disabled, true);
});

test('technology map refresh flushes unsaved map edits before reading the restored scout', async () => {
  const calls = [];
  const c = harness(['refreshMapAfterTechnology'], {
    async flushCampaignMapSave() { calls.push('save'); c.mapStateBaseline = clone(c.state); return true; },
    async loadCampaignMapSection() { calls.push('load'); c.state.cycles.c2.tokens.hsCount = 1; },
  });
  c.state.cycles.c2.tileNotes.LOCAL = 'unsaved map note';
  await c.refreshMapAfterTechnology();
  assert.deepEqual(calls, ['save', 'load']);
  assert.equal(c.state.cycles.c2.tileNotes.LOCAL, 'unsaved map note');
  assert.equal(c.state.cycles.c2.tokens.hsCount, 1);
  assert.equal(c.scoutMapRefreshBusy, false);
});

test('failed map saves and account conflicts stop an external refresh from replacing local work', async () => {
  let loads = 0;
  const c = harness(['refreshMapAfterTechnology'], {
    async flushCampaignMapSave() { return false; },
    async loadCampaignMapSection() { loads++; },
  });
  c.state.cycles.c2.tileNotes.LOCAL = 'keep';
  await c.refreshMapAfterTechnology();
  assert.equal(loads, 0);
  assert.equal(c.state.cycles.c2.tileNotes.LOCAL, 'keep');
  assert.equal(c.scoutMapRefreshBusy, false);
  c.mapSaveConflict = true;
  await c.refreshMapAfterTechnology();
  c.mapSaveConflict = false;
  c.campaignSession.changed = true;
  await c.refreshMapAfterTechnology();
  assert.equal(loads, 0);
});

test('a map edit made during the refresh read survives alongside the newly rebuilt ship', async () => {
  let queued = false;
  const c = harness(['deepEqualValue', 'mergeValues', 'mergeMapStates', 'pickServerMapState', 'applyServerMapState', 'loadCampaignMapSection'], {
    campaignSession: { changed: false, accept: value => value }, campaignStorageUrl: '/campaign',
    mapSectionRevision: 1, dashboardSectionRevision: 1,
    cloneValue: clone, normalizeState: clone, isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    setCampaignSaveStatus: noop, focusArgoAfterNextRender: noop, noteMapMergeConflict: noop,
    updateScoutRebuildStatus: noop, scheduleReconnectAttempt: noop,
    queueCampaignSave() { queued = true; },
    async fetch() {
      const remote = clone(c.state);
      remote.cycles.c2.tokens.hsCount = 1;
      c.state.cycles.c2.tileNotes.LOCAL = 'edited while reading';
      return { ok: true, json: async () => ({ ok: true, campaign: { sections: {
        dashboard: { activeProfileId: 'B' }, map: { users: { A: remote } },
      }, sectionRevisions: { map: 2, dashboard: 2 } } }) };
    },
  });
  await c.loadCampaignMapSection();
  assert.equal(c.state.cycles.c2.tileNotes.LOCAL, 'edited while reading');
  assert.equal(c.state.cycles.c2.tokens.hsCount, 1);
  assert.equal(c.mapStateProfileId, 'A');
  assert.equal(queued, true);
});

test('an older map read cannot overwrite a save that finished while the read was in flight', async () => {
  let applied = false;
  const c = harness(['loadCampaignMapSection'], {
    campaignSession: { changed: false, accept: value => value }, campaignStorageUrl: '/campaign',
    mapSectionRevision: 1, dashboardSectionRevision: 1,
    applyServerMapState() { applied = true; }, updateScoutRebuildStatus: noop,
    scheduleReconnectAttempt: noop, setCampaignSaveStatus: noop,
    async fetch() {
      c.mapSectionRevision = 3;
      c.state.cycles.c2.tileNotes.LOCAL = 'already saved';
      return { ok: true, json: async () => ({ ok: true, campaign: { sections: { map: {} }, sectionRevisions: { map: 2 } } }) };
    },
  });
  await c.loadCampaignMapSection();
  assert.equal(applied, false);
  assert.equal(c.mapSectionRevision, 3);
  assert.equal(c.state.cycles.c2.tileNotes.LOCAL, 'already saved');
});
