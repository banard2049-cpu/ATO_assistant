const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
function extract(name) {
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function element() {
  return {
    children: [], listeners: {}, attributes: {}, value: '',
    set textContent(value) { this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    focus() {},
  };
}
function harness(saved) {
  const c = vm.createContext({
    state: null, saves: 0, queueSave() { c.saves++; },
    document: { createElement: element },
    elements: Object.fromEntries(['counterList', 'counterEmpty', 'counterName', 'counterCount'].map(key => [key, element()])),
    cycleScopedBindKeys: new Set(['counters', 'notes']), atomicMergePaths: new Set(),
    recordProfileLoaded: false, campaignUserId: 'default',
  });
  vm.runInContext(source.slice(source.indexOf('    const cycleData = '), source.indexOf('    const elements = ')), c);
  vm.runInContext([
    'isPlainObject', 'cloneJson', 'jsonEqual', 'normalizeState', 'normalizeCycleStats', 'normalizeCrewCounters',
    'migrateEnemyStages', 'normalizeNemesisSelections', 'migrateNemesisProgress', 'normalizeNemesisResourceHistory',
    'normalizeResources', 'migrateSharedResourceKey', 'normalizeCount', 'normalizeSummonSelection',
    'normalizeTitanList', 'normalizeTitanLimit', 'normalizeDeadTitans', 'migrateTitanLimit', 'normalizeMatrix', 'normalizeMatrixKey',
    'defaultDayForCycle', 'normalizeCycleDay', 'evolutionStages', 'getEvolutionStage',
    'currentCycleStats', 'getCycleStat', 'setCycleStat', 'renderNamedCounters', 'addNamedCounter',
    'mergeRecordChanges', 'mergeLogText', 'recordStateFromCampaign', 'loadServerState',
  ].map(extract).join('\n'), c);
  c.state = c.normalizeState(saved || { cycle: 'c1' });
  return c;
}

test('old text moves into each cycle note, keeping existing notes and migrating only once', () => {
  const saved = {
    cycle: 'c1', counters: '门卫 3\n倒计时 8', notes: '旧版根笔记',
    cycleStats: {
      c1: { counters: '门卫 3\n倒计时 8', notes: '循环一笔记' },
      c2: { counters: '未完成的故事选择', notes: '循环二笔记' },
    },
  };
  const original = clone(saved);
  const c = harness(saved);
  assert.equal(c.state.cycleStats.c1.notes, '【原计数标记】\n门卫 3\n倒计时 8\n\n循环一笔记');
  assert.equal(c.state.cycleStats.c2.notes, '【原计数标记】\n未完成的故事选择\n\n循环二笔记');
  assert.deepEqual(clone(c.state.cycleStats.c1.counters), {});
  assert.equal(c.state.counters, undefined);
  assert.deepEqual(saved, original, 'migration does not modify the loaded snapshot');
  assert.deepEqual(clone(c.normalizeState(c.state)), clone(c.state));
  c.state.cycle = 'c3';
  assert.equal(c.normalizeState(c.state).cycleStats.c3.notes.includes('门卫'), false);
});

test('root-only and divergent legacy text are retained, while blank counters leave notes unchanged', () => {
  const c = harness({ cycle: 'c5', counters: '根级文字', notes: '原笔记' });
  assert.equal(c.state.cycleStats.c5.notes, '【原计数标记】\n根级文字\n\n原笔记');
  const separate = c.normalizeState({ cycle: 'c1', counters: '根级文字', cycleStats: { c1: { counters: '循环文字', notes: '原笔记' } } });
  assert.ok(separate.cycleStats.c1.notes.includes('根级文字'));
  assert.ok(separate.cycleStats.c1.notes.includes('循环文字'));
  const blank = c.normalizeState({ cycle: 'c2', counters: ' \n ', notes: '原笔记' });
  assert.equal(blank.cycleStats.c2.notes, '原笔记');
});

test('named counters support adding, renaming, direct edits, plus/minus, deletion and cycle isolation', () => {
  const c = harness();
  c.elements.counterName.value = '  过客  ';
  c.elements.counterCount.value = '2';
  c.addNamedCounter({ preventDefault() {} });
  const id = Object.keys(c.state.cycleStats.c1.counters)[0];
  const entry = c.state.cycleStats.c1.counters[id];
  assert.deepEqual(clone(entry), { name: '过客', count: 2 });
  const [name, controls, remove] = c.elements.counterList.children[0].children;
  const [minus, count, plus] = controls.children;
  plus.listeners.click();
  assert.equal(entry.count, 3);
  minus.listeners.click();
  assert.equal(entry.count, 2);
  count.value = '12';
  count.listeners.input();
  assert.equal(entry.count, 12, 'typing saves before leaving the input');
  count.value = '-3';
  count.listeners.change();
  assert.equal(entry.count, 0);
  assert.equal(count.value, '0');
  assert.equal(minus.disabled, true);
  name.value = '联络员';
  name.listeners.input();
  assert.equal(entry.name, '联络员');
  assert.equal(plus.attributes['aria-label'], '联络员 增加 1');
  c.state.cycle = 'c2';
  c.renderNamedCounters();
  assert.equal(c.elements.counterList.children.length, 0);
  assert.equal(c.elements.counterEmpty.hidden, false);
  c.state.cycle = 'c1';
  c.state = c.normalizeState(clone(c.state));
  c.renderNamedCounters();
  assert.deepEqual(clone(c.state.cycleStats.c1.counters[id]), { name: '联络员', count: 0 });
  c.elements.counterList.children[0].children[2].listeners.click();
  assert.deepEqual(clone(c.state.cycleStats.c1.counters), {});
  assert.equal(c.elements.counterEmpty.hidden, false);
  assert.ok(c.saves > 0);
});

test('independent counter edits merge and a deleted counter stays deleted after reload', () => {
  const c = harness();
  const base = { cycle: 'c1', cycleStats: { c1: { counters: { a: { name: '过客', count: 2 }, b: { name: '消耗', count: 3 } } } } };
  const local = clone(base);
  delete local.cycleStats.c1.counters.a;
  local.cycleStats.c1.counters.local = { name: '联络员', count: 1 };
  const remote = clone(base);
  remote.cycleStats.c1.counters.b.count = 4;
  remote.cycleStats.c1.counters.remote = { name: '必要性', count: 5 };
  const merged = c.mergeRecordChanges(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  const reloaded = c.normalizeState(merged.value).cycleStats.c1.counters;
  assert.deepEqual(Object.keys(reloaded).sort(), ['b', 'local', 'remote']);
  assert.equal(reloaded.b.count, 4);
});

test('loading legacy text automatically saves the migrated state using the existing revision', async () => {
  const c = harness();
  const writes = [];
  Object.assign(c, {
    serverLoadInFlight: false, campaignSession: { changed: false, accept: value => value },
    serverSaveQueuedBeforeReady: false, serverStateBaseline: clone(c.state), serverStorageUrl: '/api',
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, campaign: {
      sections: { record: { users: { default: { cycle: 'c1', counters: '旧文字', notes: '现有笔记' } } } },
      sectionRevisions: { record: 7 },
    } }) }),
    queueServerSave: () => writes.push(clone(c.state)),
    applyRequestedCycleFromUrl() {}, consumeDashboardSurveyNote: () => false,
    renderAll() {}, setSaveStatus() {}, clearDashboardSurveyNoteFromUrl() {},
  });
  await c.loadServerState();
  assert.equal(c.serverSectionRevision, 7);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].cycleStats.c1.notes, '【原计数标记】\n旧文字\n\n现有笔记');
  assert.deepEqual(writes[0].cycleStats.c1.counters, {});
  assert.equal(c.recordStateFromCampaign({ sections: { record: { users: { default: writes[0] } } } }).countersMigrated, false);
});

test('empty PHP cycle arrays become objects so new counters and notes survive JSON saves', () => {
  const c = harness({ cycle: 'c1', cycleStats: { c1: [], c2: [] }, counters: '旧计数文字', notes: '原笔记' });
  assert.equal(Array.isArray(c.state.cycleStats.c1), false);
  assert.equal(c.state.cycleStats.c1.notes, '【原计数标记】\n旧计数文字\n\n原笔记');
  c.elements.counterName.value = '过客';
  c.elements.counterCount.value = '3';
  c.addNamedCounter({ preventDefault() {} });
  c.state = c.normalizeState(clone(c.state));
  assert.deepEqual(clone(Object.values(c.state.cycleStats.c1.counters)), [{ name: '过客', count: 3 }]);
  c.state.cycleStats.c2 = [];
  c.state.cycle = 'c2';
  c.setCycleStat('notes', '循环二新增文字');
  c.state = c.normalizeState(clone(c.state));
  assert.equal(c.state.cycleStats.c2.notes, '循环二新增文字');
});
