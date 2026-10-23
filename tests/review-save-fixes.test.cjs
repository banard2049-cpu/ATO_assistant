const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const noop = () => {};
const response = (status, payload) => ({ ok: status === 200, status, json: async () => clone(payload) });
function extract(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function context(file, names, values = {}) {
  const scope = vm.createContext({ console: { warn: noop, error: noop }, ...values });
  vm.runInContext(names.map(name => extract(file, name)).join('\n'), scope);
  return scope;
}
const lootFile = 'aibp/bp_loot_calculator_addon.js';
test('dashboard placeholder is not editable before the first server snapshot', () => {
  const c = context('index.html', ['setCampaignSaveStatus'], {
    elements: { appShell: {}, campaignSaveStatus: { dataset: {} } }, sessionUser: { id: 'owner' },
    campaignSectionBaseline: null, ownsDashboardWriteLease: () => true,
  });
  c.setCampaignSaveStatus('connecting', 'saving');
  assert.equal(c.elements.appShell.inert, true);
  c.campaignSectionBaseline = {};
  c.setCampaignSaveStatus('saved');
  assert.equal(c.elements.appShell.inert, false);
});
const heroMerge = () => context('hero/index.html', ['mergeHeroStates']);
const heroes = ids => ({ heroes: [...ids].map(id => ({ id, notes: '' })), graveyard: [] });
test('hero remote reorder survives an unrelated local field edit', () => {
  const base = heroes('ABC'), local = clone(base), remote = heroes('CAB');
  local.heroes[0].notes = 'local note';
  const result = heroMerge().mergeHeroStates(base, local, remote);
  assert.equal(result.state.heroes.map(h => h.id).join(''), 'CAB');
  assert.equal(result.state.heroes.find(h => h.id === 'A').notes, 'local note');
  assert.equal(result.conflicts.length, 0);
});
test('hero local reorder survives remote edits and independent deletion', () => {
  const remote = heroes('AB'); remote.heroes[0].notes = 'remote';
  const result = heroMerge().mergeHeroStates(heroes('ABC'), heroes('BAC'), remote);
  assert.equal(result.state.heroes.map(h => h.id).join(''), 'BA');
  assert.equal(result.state.heroes[1].notes, 'remote');
  assert.equal(result.conflicts.length, 0);
});
test('hero incompatible reorders require a conflict decision', () => {
  const result = heroMerge().mergeHeroStates(heroes('ABC'), heroes('BAC'), heroes('ACB'));
  assert.deepEqual(clone(result.conflicts), ['heroes.order']);
  assert.equal(result.state.heroes.map(h => h.id).join(''), 'BAC');
});
test('hero reorder keeps independent additions and deletions', () => {
  const result = heroMerge().mergeHeroStates(heroes('ABC'), heroes('ABD'), heroes('BACE'));
  assert.equal(result.state.heroes.map(h => h.id).join(''), 'BDAE');
  assert.equal(result.conflicts.length, 0);
});
test('technology refuses offline profile switches without losing the pending profile', async () => {
  let mutations = 0, renders = 0, warning = '';
  const c = context('technology/index.html', ['switchAccount', 'saveAccounts', 'technologySectionState'], {
    accounts: { A: {}, B: {} }, activeAccountId: 'A', currentCycle: 'c1',
    unlocked: new Set(['new-tech']), unimportant: new Set(), conditionTicked: new Set(['new-condition']),
    campaignTechBaseState: { unlocked: [] }, treeLanguage: 'zh', hideUnknownTech: true, hideTreeImage: false,
    queueCampaignTechnologySave: noop, flushCampaignTechnologySave: async () => false,
    renderAccountSelect: () => renders++, alert: message => { warning = message; },
    mutateCampaignDashboardArchive: async () => mutations++,
  });
  await c.switchAccount('B');
  assert.equal(c.activeAccountId, 'A');
  assert.deepEqual(clone(c.accounts.A.unlocked), ['new-tech']);
  assert.deepEqual(clone(c.technologySectionState().conditions), ['new-condition']);
  assert.deepEqual(clone(c.campaignTechBaseState.unlocked), []);
  assert.equal(mutations, 0);
  assert.equal(renders, 1, 'reset dropdown to the actual active profile');
  assert.match(warning, /尚未同步/);
});
const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function recordContext(extra = {}) {
  return context('record/index.html', ['loadServerState', 'recordStateFromCampaign', 'mergeRecordChanges', 'mergeLogText', 'syncRecordFromExternalUpdate'], {
    campaignSession: { changed: false, accept: x => x }, serverStorageUrl: '/api',
    serverStorageAvailable: false, serverLoadInFlight: false, serverSaveQueuedBeforeReady: false,
    serverExternalSyncInFlight: false, serverConflictMerging: false, serverSaveInFlight: false,
    serverStateBaseline: { resources: { bone: 0, meat: 0 } }, state: { resources: { bone: 0, meat: 0 } },
    defaultState: { resources: { bone: 0, meat: 0 } }, recordProfileLoaded: false, campaignUserId: 'default',
    cloneJson: clone, jsonEqual: equal, isPlainObject, normalizeState: clone, atomicMergePaths: new Set(),
    applyRequestedCycleFromUrl: noop, consumeDashboardSurveyNote: () => false, renderAll: noop,
    setSaveStatus: noop, clearDashboardSurveyNoteFromUrl: noop, queueServerSave: noop,
    requestedDashboardSurveyNote: null, window: { confirm: () => true }, ...extra,
  });
}
function recordStartupContext({ remote, fetch, keepLocal = true, cycle = 'c1', surveyNote = null } = {}) {
  const source = fs.readFileSync(path.join(root, 'record/index.html'), 'utf8').replace(/\r\n/g, '\n');
  const inputs = [...source.slice(0, source.indexOf('    const storageKey = '))
    .matchAll(/\bdata-cycle-bind="([^"]+)"/g)]
    .map(match => ({ dataset: { cycleBind: match[1] }, value: '' }));
  const initialState = {
    cycle: 'c2', day: 0, cycleDays: { c2: '0' }, cycleStats: { c2: {} },
    resources: { bone: 0, meat: 0 },
  };
  const activity = { prompts: 0, saves: 0 };
  const c = recordContext({
    state: clone(initialState), defaultState: clone(initialState), serverStateBaseline: clone(initialState),
    normalizeState: value => ({ ...clone(initialState), ...clone(value) }),
    elements: { cycleTitle: {}, cycleWarning: {} },
    document: { querySelectorAll: selector => selector === '[data-cycle-bind]' ? inputs : [] },
    currentCycle: () => ({ label: 'cycle', fateWarning: '' }),
    applyRequestedCycleFromUrl: () => { c.state.cycle = cycle; }, bindInputs: noop,
    renderAll: () => c.renderCycleFields(),
    queueServerSave: () => activity.saves++,
    requestedDashboardSurveyNote: surveyNote,
    cycleData: { c1: { initialHull: '4', initialCrew: '5' }, c2: { initialHull: '5', initialCrew: '5' },
      c3: { initialHull: '5', initialCrew: '5' }, c4: { initialHull: '5', initialCrew: '6' }, c5: { initialHull: '6', initialCrew: '4' } },
    markAdventureFromSurvey: (cycleId, adventure, box) => {
      c.state.adventures ||= {};
      c.state.adventures[`${cycleId}-0-${box}`] = true;
      return box;
    },
    appendSyncLog: message => c.setCycleStat('syncLog', message), adventureSlotLabel: slot => slot,
    window: { confirm: () => { activity.prompts++; return keepLocal; } },
    fetch: fetch || (async () => response(200, { ok: true, campaign: {
      sections: { record: remote }, sectionRevisions: { record: 3 },
    } })),
  });
  vm.runInContext(['renderCycleFields', 'currentCycleStats', 'getCycleStat', 'setCycleStat', 'defaultDayForCycle',
    'normalizeCycleDay', 'consumeDashboardSurveyNote', 'jsonEqual']
    .map(name => extract('record/index.html', name)).join('\n'), c);
  c.cycleScopedBindKeys = new Set();
  c.initialRead = null;
  const load = c.loadServerState;
  c.loadServerState = () => (c.initialRead = load());
  const startup = source.match(/^    applyRequestedCycleFromUrl\(\);\n[^]*?^    loadServerState\(\);/m);
  assert.ok(startup, 'record startup sequence');
  vm.runInContext(startup[0], c);
  return { c, activity, inputs };
}
const strangerRecord = {
  cycle: 'c1', day: '0', cycleDays: { c1: '0', c2: '0' },
  cycleStats: { c1: { strangers: '4' }, c2: {} }, strangers: '4',
  resources: { bone: 0, meat: 7 },
};
test('record reopening with saved strangers does not treat its initial render as an edit', async () => {
  for (let opening = 0; opening < 3; opening++) {
    const { c, activity, inputs } = recordStartupContext({ remote: strangerRecord });
    await c.initialRead;
    assert.equal(activity.prompts, 0, 'opening the record must not ask to replace saved strangers');
    assert.equal(activity.saves, 0, 'opening the record must not queue a placeholder save');
    assert.equal(c.state.strangers, '4');
    assert.equal(inputs.find(input => input.dataset.cycleBind === 'strangers').value, '4');
    assert.deepEqual(clone(c.state.resources), { bone: 0, meat: 7 });
  }
});
for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) test(`record ${cycle} startup preserves every saved cycle field without a false conflict`, async () => {
  const source = fs.readFileSync(path.join(root, 'record/index.html'), 'utf8');
  const stats = Object.fromEntries([...source.slice(0, source.indexOf('    const storageKey = '))
    .matchAll(/\bdata-cycle-bind="([^"]+)"/g)].map((match, index) => [match[1], String(index + 1)]));
  const remote = {
    cycle, day: '9', cycleDays: { [cycle]: '9' }, cycleStats: { [cycle]: stats }, ...stats,
    resources: { bone: 8, meat: 7 },
  };
  const { c, activity, inputs } = recordStartupContext({ cycle, remote });
  await c.initialRead;
  assert.equal(activity.prompts, 0);
  assert.equal(activity.saves, 0);
  assert.equal(c.state.day, '9');
  for (const input of inputs) {
    assert.equal(input.value, stats[input.dataset.cycleBind]);
    assert.equal(c.state.cycleStats[cycle][input.dataset.cycleBind], stats[input.dataset.cycleBind]);
  }
  assert.deepEqual(clone(c.state.resources), { bone: 8, meat: 7 });
});
for (const keepLocal of [true, false]) test(`record startup still asks about a real overlapping stranger edit (${keepLocal})`, async () => {
  let resolveRead;
  const { c, activity } = recordStartupContext({ keepLocal, fetch: () => new Promise(resolve => { resolveRead = resolve; }) });
  c.setCycleStat('strangers', '2');
  resolveRead(response(200, { ok: true, campaign: {
    sections: { record: strangerRecord }, sectionRevisions: { record: 3 },
  } }));
  await c.initialRead;
  assert.equal(activity.prompts, 1);
  assert.equal(c.state.strangers, keepLocal ? '2' : '4');
  assert.equal(c.serverStateBaseline.strangers, '4');
  assert.deepEqual(clone(c.state.resources), { bone: 0, meat: 7 });
  assert.equal(activity.saves, 1);
});
for (const remote of [null, strangerRecord]) test(`record startup preserves dashboard survey notes (${remote ? 'existing' : 'first'} record)`, async () => {
  const { c, activity } = recordStartupContext({ remote, surveyNote: {
    cycle: 'c1', day: '9', adventure: 'survey adventure', box: 'alpha',
  } });
  await c.initialRead;
  assert.equal(activity.prompts, 0);
  assert.equal(activity.saves, 1);
  assert.equal(c.state.cycle, 'c1');
  assert.equal(c.state.day, '9');
  assert.equal(c.state.adventures['c1-0-alpha'], true);
  assert.match(c.state.cycleStats.c1.syncLog, /survey adventure/);
  if (remote) assert.equal(c.state.strangers, '4');
});
test('record first read preserves edits even before debounce fires', async () => {
  let resolveRead, queued = 0;
  const c = recordContext({ fetch: () => new Promise(r => { resolveRead = r; }), queueServerSave: () => queued++ });
  const loading = c.loadServerState();
  c.state.resources.bone = 5;
  resolveRead(response(200, { ok: true, campaign: { sections: {
    dashboard: { activeProfileId: 'A' }, record: { users: { A: { resources: { bone: 0, meat: 7 } } } },
  }, sectionRevisions: { record: 3 } } }));
  await loading;
  assert.deepEqual(clone(c.state.resources), { bone: 5, meat: 7 });
  assert.deepEqual(clone(c.serverStateBaseline.resources), { bone: 0, meat: 7 });
  assert.equal(queued, 1);
  assert.equal(c.campaignUserId, 'A');
});
test('record retries its failed first connection and merges offline edits', async () => {
  let available = false, reads = 0, queued = 0;
  const c = recordContext({ queueServerSave: () => queued++, fetch: async () => {
    reads++;
    return available ? response(200, { ok: true, campaign: { sections: {
      record: { resources: { bone: 0, meat: 9 } },
    }, sectionRevisions: { record: 2 } } }) : response(503, {});
  } });
  await c.loadServerState();
  c.state.resources.bone = 3;
  c.serverSaveQueuedBeforeReady = true;
  available = true;
  await c.syncRecordFromExternalUpdate();
  assert.equal(reads, 2);
  assert.equal(c.serverStorageAvailable, true);
  assert.deepEqual(clone(c.state.resources), { bone: 3, meat: 9 });
  assert.equal(queued, 1);
});
test('record reconnect polling does not overlap its pending initial read', async () => {
  let resolveRead, reads = 0;
  const c = recordContext({ fetch: () => { reads++; return new Promise(r => { resolveRead = r; }); } });
  const pending = c.loadServerState();
  await c.syncRecordFromExternalUpdate();
  await c.syncRecordFromExternalUpdate();
  assert.equal(reads, 1);
  resolveRead(response(503, {}));
  await pending;
  assert.equal(c.serverLoadInFlight, false);
});
for (const race of ['save in flight', 'save finished', 'account changed']) test(`record ignores a stale polling read: ${race}`, async () => {
  let finishRead, prompts = 0, renders = 0;
  const c = recordContext({
    serverStorageAvailable: true, serverSectionRevision: 3,
    readLatestRecordState: () => new Promise(resolve => { finishRead = resolve; }),
    renderAll: () => renders++, window: { confirm: () => { prompts++; return true; } },
  });
  const syncing = c.syncRecordFromExternalUpdate();
  c.state.resources.bone = 5;
  if (race === 'save in flight') c.serverSaveInFlight = true;
  if (race === 'save finished') c.serverSectionRevision = 5;
  if (race === 'account changed') c.campaignSession.changed = true;
  finishRead({ revision: 4, userId: 'default', state: { resources: { bone: 7, meat: 0 } } });
  await syncing;
  assert.equal(c.state.resources.bone, 5);
  assert.equal(prompts, 0);
  assert.equal(renders, 0);
});
function dashboardStartupContext({ fetch, keepLocal = true, sparse = false } = {}) {
  const initial = { activeProfileId: 'default', profiles: { default: {
    id: 'default', name: 'default', activeCycleId: 'c1',
    cycles: { c1: { id: 'c1', state: { day: 'T0', notes: '', exploration: null } } },
  } } };
  const remote = clone(initial);
  const saved = remote.profiles.default.cycles.c1.state;
  saved.day = 9;
  saved.notes = 'saved note';
  saved.exploration = { selectedByCycle: { c1: ['card-b'] }, drawStateByCycle: { c1: {
    drawPile: ['card-b'], activePiles: [[], []], temporaryRemoved: [], permanentRemoved: [],
    history: [], discardPile: [], current: null,
  } } };
  if (sparse) saved.exploration = null;
  const activity = { prompts: 0, saves: 0 };
  const c = context('index.html', ['startAuthenticatedApp', 'renderDashboardArchive', 'setCampaignSaveStatus',
    'loadCampaignSection', 'mergeDashboardChanges', 'currentProfile', 'currentCycle', 'currentCycleConfig',
    'normalizeExploration', 'getSelectedExplorationIds', 'ensureExplorationDrawState', 'createExplorationDrawState',
    'probeCampaignReconnect', 'syncDashboardFromExternalUpdate', 'dashboardArchiveFromServer', 'jsonEqual',
    'ensureTodaySurveyConstants', 'normalizeSurveyConstants', 'surveyConstantsDayKey', 'ensureTodaySimpleConstants', 'pharosDreamsDayKey'], {
    URL, URLSearchParams, CustomEvent: function () {},
    archive: clone(initial), defaultArchive: clone(initial), normalizeArchive: clone,
    cloneJson: clone, isPlainObject, state: null,
    cycleConfigs: [{ id: 'c1' }], defaultExplorationSelections: { c1: ['card-a', 'card-b'] },
    getExplorationLibrary: () => [{ id: 'card-a' }, { id: 'card-b' }], shuffleList: clone,
    campaignSessionEpoch: 0, sessionUser: null, campaignSaveTimer: null,
    campaignSectionBaseline: null, campaignServerBaseline: null, campaignInitialBaseline: null, campaignSaveQueuedBeforeReady: false,
    campaignRestoreInFlight: false, campaignExternalSyncInFlight: false, campaignExternalSyncPending: false, campaignConflictReloading: false,
    surveyConstantMnemosSyncPending: 0, surveyConstantExternalSyncDeferred: false,
    campaignSaveInFlight: false, campaignSectionRevision: 0,
    campaignStorageAvailable: false, campaignReconnectInFlight: false, campaignStorageUrl: '/api',
    clearCampaignReconnect: noop, clearTimeout: noop, beginDashboardWriteLease: noop,
    ownsDashboardWriteLease: () => true, setDashboardWriteLeaseState: noop,
    elements: { sessionAccountName: {}, authGate: {}, appShell: {}, campaignSaveStatus: { dataset: {} } },
    window: {
      location: { href: 'https://ato.test/index.html', search: '' }, dispatchEvent: noop,
      confirm: () => { activity.prompts++; return keepLocal; },
    },
    syncInputs: noop, renderProfiles: noop, renderCycles: noop, renderDateTrack: noop,
    renderFlow: () => {
      c.ensureExplorationDrawState();
      c.ensureTodaySurveyConstants();
      for (const key of ['pharosDreams', 'mainStoryConstants', 'mnemosBreakthroughConstants', 'specialEventConstants']) {
        c.ensureTodaySimpleConstants(key, `${key}Day`, `${key}Active`);
      }
    }, storedTermLanguage: () => 'fan',
    refreshCachedArgoRecord: noop, loadSecondScreenStatus: noop,
    loadNegotiationCards: async () => {}, queueCampaignSave: () => activity.saves++,
    scheduleCampaignReconnect: noop,
    fetch: fetch || (async () => response(200, { ok: true, exists: true, revision: 3,
      user: { id: 'owner' }, state: remote })),
    readLatestDashboardSection: async () => ({ archive: c.dashboardArchiveFromServer(remote), serverArchive: clone(remote), exists: true, revision: 3 }),
  });
  const load = c.loadCampaignSection;
  c.loadCampaignSection = epoch => (c.initialRead = load(epoch));
  c.startAuthenticatedApp({ id: 'owner' });
  return { c, activity, remote };
}
test('dashboard startup preserves saved exploration data without treating placeholder initialization as edits', async () => {
  for (let opening = 0; opening < 3; opening++) {
    const { c, activity } = dashboardStartupContext();
    assert.equal(c.elements.appShell.inert, true, 'keep the placeholder locked until the server read finishes');
    await c.initialRead;
    assert.equal(activity.prompts, 0);
    assert.equal(activity.saves, 0);
    assert.equal(c.state.day, 9);
    assert.equal(c.state.notes, 'saved note');
    assert.deepEqual(clone(c.state.exploration.selectedByCycle.c1), ['card-b']);
    assert.deepEqual(clone(c.state.exploration.drawStateByCycle.c1.drawPile), ['card-b']);
    assert.equal(c.elements.appShell.inert, false);
  }
});

test('dashboard keeps initialized legacy decks stable across later server updates', async () => {
  const { c, activity, remote } = dashboardStartupContext({ sparse: true });
  await c.initialRead;
  const deck = clone(c.state.exploration.drawStateByCycle.c1);
  assert.deepEqual(clone(c.archive), clone(c.campaignSectionBaseline));
  for (let revision = 4; revision < 7; revision++) {
    remote.profiles.default.cycles.c1.state.notes = `remote note ${revision}`;
    c.readLatestDashboardSection = async () => ({
      archive: c.dashboardArchiveFromServer(remote), serverArchive: clone(remote), revision, exists: true,
    });
    await c.syncDashboardFromExternalUpdate();
    assert.deepEqual(clone(c.state.exploration.drawStateByCycle.c1), deck);
    assert.deepEqual(clone(c.archive), clone(c.campaignSectionBaseline));
    assert.equal(c.state.notes, `remote note ${revision}`);
  }
  assert.equal(activity.prompts, 0);
  assert.equal(activity.saves, 0);
});

for (const keepLocal of [true, false]) test(`dashboard still detects genuine concurrent deck edits (${keepLocal})`, async () => {
  const { c, activity, remote } = dashboardStartupContext({ sparse: true, keepLocal });
  await c.initialRead;
  c.state.exploration.drawStateByCycle.c1.drawPile = ['card-a'];
  remote.profiles.default.cycles.c1.state.exploration = clone(c.campaignSectionBaseline.profiles.default.cycles.c1.state.exploration);
  remote.profiles.default.cycles.c1.state.exploration.drawStateByCycle.c1.drawPile = ['card-b', 'card-a'];
  c.readLatestDashboardSection = async () => ({
    archive: c.dashboardArchiveFromServer(remote), serverArchive: clone(remote), revision: 4, exists: true,
  });
  await c.syncDashboardFromExternalUpdate();
  assert.equal(activity.prompts, 1);
  assert.equal(activity.saves, keepLocal ? 1 : 0);
  assert.equal(c.state.exploration.drawStateByCycle.c1.drawPile[0], keepLocal ? 'card-a' : 'card-b');
});

for (const race of ['save in flight', 'save finished', 'account changed', 'older read-only response']) test(`dashboard ignores a stale polling read: ${race}`, async () => {
  const { c, activity, remote } = dashboardStartupContext();
  await c.initialRead;
  let finishRead;
  c.readLatestDashboardSection = () => new Promise(resolve => { finishRead = resolve; });
  const syncing = c.syncDashboardFromExternalUpdate();
  c.state.notes = 'latest local edit';
  if (race === 'save in flight') c.campaignSaveInFlight = true;
  if (race === 'save finished') c.campaignSectionRevision = 5;
  if (race === 'account changed') c.campaignSessionEpoch++;
  if (race === 'older read-only response') c.ownsDashboardWriteLease = () => false;
  finishRead({ archive: clone(remote), revision: race === 'older read-only response' ? 2 : 4, exists: true });
  await syncing;
  assert.equal(c.state.notes, 'latest local edit');
  assert.equal(activity.prompts, 0);
  assert.equal(activity.saves, 0);
});
for (const keepLocal of [true, false]) test(`dashboard startup protects real edits made during its initial read (${keepLocal})`, async () => {
  let resolveRead;
  const { c, activity, remote } = dashboardStartupContext({ keepLocal, fetch: () => new Promise(resolve => { resolveRead = resolve; }) });
  c.state.notes = 'local note';
  resolveRead(response(200, { ok: true, exists: true, revision: 3, user: { id: 'owner' }, state: remote }));
  await c.initialRead;
  assert.equal(activity.prompts, 1);
  assert.equal(c.state.notes, keepLocal ? 'local note' : 'saved note');
  assert.deepEqual(clone(c.state.exploration.selectedByCycle.c1), ['card-b']);
});
test('dashboard initial reconnect merges pending edits against the rendered placeholder', async () => {
  const { c, activity, remote } = dashboardStartupContext({ fetch: async () => response(503, {}) });
  await c.initialRead;
  c.state.day = 2;
  c.state.notes = 'offline note';
  c.campaignSaveQueuedBeforeReady = true;
  remote.profiles.default.cycles.c1.state.day = 'T0';
  remote.profiles.default.cycles.c1.state.notes = '';
  await c.probeCampaignReconnect();
  assert.equal(activity.prompts, 0);
  assert.equal(c.state.day, 2);
  assert.equal(c.state.notes, 'offline note');
  assert.deepEqual(clone(c.state.exploration.selectedByCycle.c1), ['card-b']);
  assert.equal(activity.saves, 1);
});
for (const keepLocal of [true, false]) test(`dashboard first read resolves overlapping edits explicitly (${keepLocal})`, async () => {
  let resolveRead, asked = 0;
  const c = context('index.html', ['loadCampaignSection', 'dashboardArchiveFromServer', 'mergeDashboardChanges'], {
    campaignSessionEpoch: 1, campaignStorageUrl: '/api', sessionUser: { id: 'owner' },
    campaignSectionBaseline: null, campaignServerBaseline: null, campaignInitialBaseline: null, campaignSaveQueuedBeforeReady: false,
    archive: { day: 1, note: '' }, defaultArchive: { day: 1, note: '' },
    normalizeArchive: clone, cloneJson: clone, jsonEqual: equal, isPlainObject,
    clearCampaignReconnect: noop, ownsDashboardWriteLease: () => true, queueCampaignSave: noop,
    setCampaignSaveStatus: noop, loadNegotiationCards: async () => {}, renderFlow: noop,
    refreshCachedArgoRecord: noop, renderDashboardArchive: a => { c.archive = a; },
    window: { confirm: () => { asked++; return keepLocal; } },
    fetch: () => new Promise(r => { resolveRead = r; }),
  });
  const loading = c.loadCampaignSection();
  c.archive.day = 2;
  resolveRead(response(200, { ok: true, exists: true, revision: 4, user: { id: 'owner' }, state: { day: 3, note: 'remote' } }));
  await loading;
  assert.equal(asked, 1);
  assert.equal(c.archive.day, keepLocal ? 2 : 3);
  assert.equal(c.archive.note, 'remote');
  assert.equal(c.campaignSectionBaseline.day, 3);
});
function lootContext(extra = {}) {
  return context(lootFile, ['readServerRecordState', 'writeServerRecordState', 'addLootResultToRecord',
    'readLocalRecordState', 'mergeRecordStates', 'normalizeRecordCrewCounters', 'isPlainObject'], {
    CAMPAIGN_STATE_URL: '/api', RECORD_SECTION_URL: '/api?section=record', RECORD_STORAGE_KEY: 'record',
    RECORD_SYNC_CHANNEL: null, localStorage: { getItem: () => null, setItem: noop },
    applyLootResultToRecord: (record, result, cycle) => ({
      record: { ...record, resources: { bone: (record.resources?.bone || 0) + result.amount } },
      added: ['bone'], skipped: [], cycle,
    }), ...extra,
  });
}
test('loot conflict retry retains original profile, account and cycle', async () => {
  let reads = 0;
  const posts = [];
  const c = lootContext({ fetch: async (url, options) => {
    if (!options?.method) {
      const later = ++reads > 1;
      return response(200, { ok: true, user: { id: 'owner' }, campaign: {
        sectionRevisions: { record: later ? 2 : 1 }, sections: {
          dashboard: { activeProfileId: later ? 'B' : 'A', profiles: { A: { activeCycleId: later ? 'c2' : 'c1' }, B: {} } },
          record: { users: { A: { resources: { bone: later ? 20 : 10 } }, B: { resources: { bone: 99 } } } },
        },
      } });
    }
    posts.push(JSON.parse(options.body));
    return posts.length === 1 ? response(409, { code: 'SAVE_CONFLICT' }) : response(200, { ok: true, revision: 3 });
  } });
  const result = await c.addLootResultToRecord({ amount: 2 });
  assert.equal(result.syncedToServer, true);
  assert.equal(result.cycle, 'c1');
  assert.equal(posts[1].userId, 'A');
  assert.equal(posts[1].expectedAccountId, 'owner');
  assert.equal(posts[1].state.resources.bone, 22);
});
test('loot pinned reads refuse a changed login or removed profile', async () => {
  for (const payload of [
    { user: { id: 'other' }, campaign: {} },
    { user: { id: 'owner' }, campaign: { sections: { dashboard: { profiles: { B: {} } } } } },
  ]) {
    const c = lootContext({ fetch: async () => response(200, { ok: true, ...payload }) });
    await assert.rejects(c.readServerRecordState({ userId: 'A', accountId: 'owner' }));
  }
});
test('offline loot never reports a local-only result as recorded', async () => {
  let cached = false, applied = false;
  const c = lootContext({
    fetch: async () => { throw new Error('offline'); },
    localStorage: { getItem: () => null, setItem: () => { cached = true; } },
    applyLootResultToRecord: () => { applied = true; },
  });
  await assert.rejects(c.addLootResultToRecord({ amount: 2 }), /offline/);
  assert.equal(cached, false);
  assert.equal(applied, false);
});
test('loot retry after a lost success response does not double-add resources', async () => {
  let record = { resources: { bone: 10 } }, posts = 0;
  const c = lootContext({ fetch: async (url, options) => {
    if (!options?.method) return response(200, { ok: true, user: { id: 'owner' }, campaign: {
      sectionRevisions: { record: 1 + posts }, sections: {
        dashboard: { activeProfileId: 'A', profiles: { A: { activeCycleId: 'c1' } } },
        record: { users: { A: record } },
      },
    } });
    posts++;
    record = JSON.parse(options.body).state;
    throw new Error('response lost after commit');
  } });
  const result = { amount: 2 };
  await assert.rejects(c.addLootResultToRecord(result), /response lost/);
  assert.equal(record.resources.bone, 12);
  const retry = await c.addLootResultToRecord(result);
  assert.equal(retry.syncedToServer, true);
  assert.equal(posts, 1);
  assert.equal(record.resources.bone, 12);
});
for (const [file, fn] of [[lootFile, 'mergeRecordStates'], ['index.html', 'mergeArgoRecords']]) {
  test(`${fn}: server deletions survive stale browser caches`, () => {
    const c = context(file, [fn, 'isPlainObject', 'normalizeRecordCrewCounters']);
    const server = { titans: [], nymphCards: [], godforms: [], nymphUsedCards: [], godformUsedCards: [], resources: {} };
    const local = { titans: [{ id: 'old' }], nymphCards: ['old'], resources: { bone: 9 }, adventures: { old: true } };
    const merged = c[fn](server, local);
    assert.deepEqual(clone(merged.titans), []);
    assert.deepEqual(clone(merged.nymphCards), []);
    assert.deepEqual(clone(merged.resources), {});
    assert.equal(merged.adventures, undefined);
    assert.equal(server.cycleStats, undefined, 'normalization must not mutate the input');
  });
}
