const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const noop = () => {};
function extract(file, name) {
  const match = read(file).match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function context(file, names, extra = {}) {
  const c = vm.createContext({ console: { warn: noop }, ...extra });
  vm.runInContext(names.map(name => extract(file, name)).join('\n'), c);
  return c;
}
function recordContext() {
  const source = read('record/index.html');
  const inputs = [...source.slice(0, source.indexOf('    const storageKey = ')).matchAll(/data-cycle-bind="([^"]+)"/g)]
    .map(match => ({ dataset: { cycleBind: match[1] }, value: '' }));
  const c = context('record/index.html', [
    'isPlainObject', 'cloneJson', 'jsonEqual', 'migrateEnemyStages', 'normalizeState', 'normalizeCycleStats', 'normalizeCrewCounters',
    'normalizeNemesisSelections', 'migrateNemesisProgress', 'normalizeNemesisResourceHistory', 'evolutionStages', 'getEvolutionStage',
    'normalizeResources', 'migrateSharedResourceKey', 'normalizeCount', 'normalizeSummonSelection',
    'normalizeTitanList', 'normalizeTitanLimit', 'normalizeDeadTitans', 'migrateTitanLimit', 'normalizeMatrix', 'normalizeMatrixKey',
    'defaultDayForCycle', 'normalizeCycleDay', 'renderCycleFields', 'currentCycle', 'currentCycleStats',
    'getCycleStat', 'setCycleStat', 'syncSummonUsedCounts', 'getNymphCharges', 'hasNymphLimit', 'getNymphLimit',
    'mergeRecordChanges', 'mergeLogText',
  ], {
    state: null, elements: { cycleTitle: {}, cycleWarning: {} },
    document: { querySelectorAll: selector => selector === '[data-cycle-bind]' ? inputs : [], querySelector: () => ({}) },
    atomicMergePaths: new Set(['crewBoxes', 'maxUnlocked']),
    cycleScopedBindKeys: new Set(['boons', 'afflictions', 'counters', 'notes', 'syncLog']),
  });
  vm.runInContext(source.slice(source.indexOf('    const cycleData = '), source.indexOf('    const elements = ')), c);
  return c;
}
test('printed initial tracks only fill missing data, including first cycle visits', () => {
  const initial = { c1: ['4', '5'], c2: ['5', '5'], c3: ['5', '5'], c4: ['5', '6'], c5: ['6', '4'] };
  for (const [cycle, values] of Object.entries(initial)) {
    const c = recordContext();
    const normalized = c.normalizeState({ cycle });
    assert.deepEqual([normalized.hull, normalized.crew], values);
    assert.deepEqual(clone(c.normalizeState(normalized)), clone(normalized));
    c.state = c.normalizeState({ cycle: 'c2', hull: '3', crew: '2' });
    c.state.cycle = cycle;
    if (cycle !== 'c2') assert.deepEqual([c.getCycleStat('hull'), c.getCycleStat('crew')], values);
    c.state.cycle = 'c2';
    assert.deepEqual([c.getCycleStat('hull'), c.getCycleStat('crew')], ['3', '2']);
    for (const value of ['0', 0, '', '5']) {
      const old = { cycle, cycleStats: { [cycle]: { hull: value, crew: value } } };
      c.state = c.normalizeState(old);
      assert.equal(c.state.hull, String(value));
      assert.equal(c.state.crew, String(value));
      c.renderCycleFields();
      assert.equal(c.state.crew, String(value));
      assert.deepEqual(old.cycleStats[cycle], { hull: value, crew: value });
    }
    const legacy = c.normalizeState({ cycle, hull: '2', crew: '3' });
    assert.deepEqual([legacy.hull, legacy.crew], ['2', '3']);
    const scoped = c.normalizeState({ cycle, hull: '1', crew: '1', cycleStats: { [cycle]: { hull: '0' } } });
    assert.equal(scoped.hull, '0');
  }
});

test('C5 supply migration, cycle isolation and official import keep the same value', () => {
  const c = recordContext();
  c.state = c.normalizeState({ cycle: 'c4', supply: '7' });
  assert.equal(c.state.supply, '');
  assert.equal(c.state.cycleStats.c5.supply, '7');
  for (const saved of ['0', 0, '', '9']) {
    const normalized = c.normalizeState({ cycle: 'c4', supply: '7', cycleStats: { c5: { supply: saved } } });
    assert.equal(normalized.cycleStats.c5.supply, String(saved));
    assert.deepEqual(clone(c.normalizeState(normalized)), clone(normalized));
  }
  c.state.cycle = 'c5'; c.renderCycleFields();
  assert.equal(c.state.supply, '7');
  c.setCycleStat('supply', '8');
  c.state.cycle = 'c1'; c.renderCycleFields();
  c.state = c.normalizeState(clone(c.state));
  c.state.cycle = 'c5'; c.renderCycleFields();
  assert.equal(c.state.supply, '8');
  const stats = Array(21).fill(0); stats[20] = 11;
  const imported = require('../assets/jsave-import.js').convert({ campaign_cycle: 4, argo_stats_vals: stats }).record.users.default;
  assert.equal(c.normalizeState(imported).cycleStats.c5.supply, '11');
});

test('supply controls preserve blank and clamp counts to nonnegative integers', () => {
  const c = recordContext(); c.state = c.normalizeState({ cycle: 'c5' });
  const node = () => ({ dataset: {}, children: [], handlers: {}, append(...items) { this.children.push(...items); },
    addEventListener(type, handler) { this.handlers[type] = handler; }, removeAttribute() {} });
  const input = node(); input.value = ''; const label = node();
  input.closest = () => label; input.replaceWith = wrapper => { label.wrapper = wrapper; };
  c.document = { querySelector: selector => selector.includes('"supply"') ? input : null, createElement: node };
  c.queueSave = () => {};
  vm.runInContext(extract('record/index.html', 'setupIdentityNumberFields'), c);
  c.setupIdentityNumberFields();
  for (const [raw, expected] of [['3.8', '3'], ['-2', '0'], ['', '']]) {
    input.value = raw; input.handlers.input(); assert.equal(c.getCycleStat('supply'), expected);
  }
  label.wrapper.children[2].handlers.click(); assert.equal(c.getCycleStat('supply'), '1');
  label.wrapper.children[0].handlers.click(); assert.equal(c.getCycleStat('supply'), '0');
});
for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) test(`record ${cycle}: displaying a server snapshot does not change its merge values`, () => {
  const c = recordContext();
  const saved = {
    cycle, cycleDays: { [cycle]: cycle === 'c1' ? 'T0' : '9' },
    cycleStats: { [cycle]: { fate: '6', strangers: '4' } },
    godforms: ['hermes'], godformUsedCards: ['hermes'], godformUsed: '0',
    nymphCards: ['engine'], nymphUsedCards: ['engine', 'solitude'], nymphUsed: '0',
    nymphLimit: '3', nymphCharges: '7',
  };
  c.state = c.normalizeState(clone(saved));
  const baseline = clone(c.state);
  c.renderCycleFields();
  c.syncSummonUsedCounts();
  assert.deepEqual(clone(c.state), baseline);
  assert.deepEqual(clone(c.normalizeState(c.state)), baseline, 'normalization is idempotent');
});
test('record legacy aliases cannot cause a conflict with an independent resource write', () => {
  const c = recordContext();
  const saved = { cycle: 'c1', strangers: '1', cycleStats: { c1: { strangers: '4' } }, resources: { bone: 0 } };
  const base = c.normalizeState(clone(saved));
  c.state = c.normalizeState(clone(saved));
  c.renderCycleFields();
  c.state.cycleStats.c1.strangers = '5';
  c.state.strangers = '5';
  const remote = c.normalizeState({ ...clone(saved), resources: { bone: 7 } });
  const result = c.mergeRecordChanges(base, c.state, remote);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.value.strangers, '5');
  assert.equal(result.value.resources.bone, 7);
});
function mapContext() {
  return context('map/app.js', ['isPlainObject', 'defaultCycleState', 'createDefaultState', 'normalizeState',
    'normalizeTitanXTrackPosition', 'normalizeTokens', 'normalizeMarkers', 'normalizeEdgeMarkers',
    'normalizeMapZoom', 'tokenAvailableInCycle', 'argoTileId', 'deepEqualValue', 'cloneValue', 'mergeValues', 'mergeMapStates'], {
    URLSearchParams, window: { location: { search: '' } }, cycleIds: ['c1', 'c2'], edgeDirections: ['up', 'right', 'down', 'left'],
    mapData: { cycles: [{ id: 'c1', tiles: [{ id: 'A' }, { id: 'B' }] }, { id: 'c2', tiles: [{ id: 'C' }] }] },
    tokenAssetById: { AG: { id: 'AG' }, c2: { id: 'c2', cycles: ['c2'] } },
  });
}
test('map ship location and selected marker are canonical before conflict comparisons', () => {
  const c = mapContext();
  const saved = { activeCycleId: 'c1', selectedToken: 'c2', cycles: { c1: { tokens: { AG: 'A' } } } };
  const normalized = c.normalizeState(saved);
  assert.equal(normalized.cycles.c1.currentTile, 'A');
  assert.equal(normalized.selectedToken, 'AG');
  assert.equal(saved.cycles.c1.currentTile, undefined, 'reading must not mutate the supplied save');
  const local = clone(normalized);
  local.cycles.c1.currentTile = 'B';
  local.cycles.c1.tokens.AG = 'B';
  const remote = c.normalizeState({ ...clone(saved), query: 'remote filter' });
  const result = c.mergeMapStates(normalized, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.merged.cycles.c1.currentTile, 'B');
  assert.equal(result.merged.query, 'remote filter');
});
test('hero legacy default fields merge with remote memories without a false prompt', () => {
  let prompts = 0;
  const c = context('hero/index.html', ['heroSnapshot', 'normalizeState', 'mergeHeroStates', 'chooseHeroMerge'], {
    state: null, heroServerBaseline: { heroes: [{ id: 'h1', notes: '' }], activeHeroId: 'h1', graveyard: [] },
    SKILLS: ['courage', 'wisdom', 'will', 'endurance', 'cunning', 'fury'].map(id => ({ id })),
    CYCLES: ['c1', 'c2', 'c3', 'c4', 'c5'], window: { confirm: () => { prompts++; return true; } },
    // hero 页遍历卡组用的是 CYCLES + EXTRA_CYCLES（例外组里是 CF1269 被播种）。
    MNEMOS_GROUPS: ['c1', 'c2', 'c3', 'c4', 'c5', 'count'],
  });
  c.state = clone(c.heroServerBaseline);
  c.normalizeState();
  c.state.heroes[0].notes = 'local note';
  const remote = { heroes: [{ id: 'h1', notes: '', mnemos: { c1: ['new-memory'] } }], activeHeroId: 'h1', graveyard: [] };
  const result = c.chooseHeroMerge(remote);
  assert.equal(prompts, 0);
  assert.equal(result.heroes[0].notes, 'local note');
  assert.deepEqual(clone(result.heroes[0].mnemos.c1), ['new-memory']);
  assert.deepEqual(remote.heroes[0].mnemos, { c1: ['new-memory'] }, 'remote data remains untouched');
});
test('technology snapshot generation is a read and unchanged snapshots do not write the dashboard', async () => {
  let saves = 0, writes = 0;
  const c = context('technology/index.html', ['unlockedTechSnapshot', 'displayTechReferenceName', 'writeSnapshotToMainArchive', 'technologyStateValuesEqual'], {
    saveAccounts: () => saves++, accounts: { A: { name: 'profile A' } }, activeAccountId: 'A', currentCycle: 'cycle1',
    unlocked: new Set(), unimportant: new Set(), conditionTicked: new Set(), unlockedRecords: () => [],
    pageByKey: () => ({ label: 'cycle 1' }), requestedMainCycleId: () => 'c1',
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    mutateCampaignDashboardArchive: async mutator => { if (mutator(archive) != null) writes++; },
  });
  const first = c.unlockedTechSnapshot();
  assert.equal(saves, 0, 'reading a snapshot must not queue a technology save');
  const archive = { profiles: { A: { cycles: { c1: { id: 'c1', state: { unlockedTech: clone(first), notes: 'saved note' } } } } } };
  first.savedAt = '2099-01-01T00:00:00.000Z';
  await c.writeSnapshotToMainArchive(first);
  assert.equal(writes, 0, 'a timestamp alone must not bump the dashboard revision');
  first.unlockedKeys = ['new-tech'];
  await c.writeSnapshotToMainArchive(first);
  assert.equal(writes, 1);
  assert.equal(archive.profiles.A.cycles.c1.state.notes, 'saved note');
});

function technologyMergeContext() {
  const c = context('technology/index.html', ['normalizeTechnologyMergeState', 'mergeTechnologyAccountState',
    'technologyStateValuesEqual', 'unlockAutomaticCyclesThrough', 'validPageKey'], {
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    data: { pages: [{ key: 'cycle1', nodes: [{ name: 'core', core: true }] }] },
    PAGE_INDEX: new Map([['cycle1', 0]]), nodeKey: (page, node) => node.name,
    isCoreNode: node => node.core, unlocked: new Set(),
    TECH_STATE_FIELD_LABELS: Object.fromEntries(['currentCycle', 'unlocked', 'unimportant', 'conditions',
      'treeLanguage', 'hideUnknownTech', 'hideTreeImage'].map(key => [key, key])),
  });
  return c;
}

test('technology legacy automatic unlocks and omitted preferences stay neutral after reconnect', () => {
  const c = technologyMergeContext();
  const raw = { unlocked: [], conditions: [] };
  const base = c.normalizeTechnologyMergeState(raw);
  const local = { ...clone(base), conditions: ['local'] };
  const remote = { unlocked: ['core', 'remote'], conditions: [], hideTreeImage: true };
  const merged = c.mergeTechnologyAccountState(raw, local, remote);
  assert.deepEqual(clone(merged.conflicts), []);
  assert.deepEqual(clone(merged.state.unlocked), ['core', 'remote']);
  assert.deepEqual(clone(merged.state.conditions), ['local']);
  assert.equal(merged.state.hideTreeImage, true);
  assert.deepEqual(raw, { unlocked: [], conditions: [] });
});

test('technology normalization still blocks genuine concurrent technology choices', () => {
  const c = technologyMergeContext();
  const merged = c.mergeTechnologyAccountState({ unlocked: [] },
    { unlocked: ['core', 'local'] }, { unlocked: ['core', 'remote'] });
  assert.deepEqual(clone(merged.conflicts), ['unlocked']);
});
