// 循环 II 的船员计数上限：轨道数组首项（9）是「锁定上限」挡在外面的那一格，
// 所以未解锁时上限是次高值 8，解锁后才是 9——不是 9 / 10。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8').replace(/\r\n/g, '\n');
function extract(name) {
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}

function harness(state) {
  const c = vm.createContext({
    state: null,
    saves: 0,
    queueSave() { c.saves += 1; },
    renderAll() {},
    document: { querySelector: () => null, createElement: () => ({}) },
    cycleScopedBindKeys: new Set(['counters', 'notes']),
  });
  vm.runInContext(source.slice(source.indexOf('    const cycleData = '), source.indexOf('    const elements = ')), c);
  vm.runInContext([
    'isPlainObject', 'cloneJson', 'jsonEqual', 'currentCycle', 'currentCycleStats', 'getCycleStat', 'setCycleStat',
    'c2CrewMax', 'trimC2CrewCounters', 'c2CrewCounters', 'c2CrewCounterTotal', 'changeC2CrewCounter',
  ].map(extract).join('\n'), c);
  c.state = JSON.parse(JSON.stringify(state));
  return c;
}

function c2State(crew, maxUnlocked = false, extra = {}) {
  return {
    cycle: 'c2',
    maxUnlocked: maxUnlocked ? { 'c2-crew': true } : {},
    cycleStats: { c2: { crewCounters: { crew, refugees: 0, captives: 0, ...extra } } },
  };
}

test('C2 crew cap is the printed max box minus the locked one: 8 locked / 9 unlocked', () => {
  assert.equal(harness(c2State(5)).c2CrewMax(), 8);
  assert.equal(harness(c2State(5, true)).c2CrewMax(), 9);
  // The track itself still carries the printed top box; only the cap changes.
  const track = harness(c2State(5));
  assert.equal(track.currentCycle().crew[0], 9);
});

test('the + button stops at the locked cap and resumes at the unlocked one', () => {
  const locked = harness(c2State(5));
  for (let i = 0; i < 6; i += 1) locked.changeC2CrewCounter('crew', 1);
  assert.equal(locked.c2CrewCounters().crew, 8);
  assert.equal(locked.c2CrewCounterTotal(), 8);

  const unlocked = harness(c2State(5, true));
  for (let i = 0; i < 6; i += 1) unlocked.changeC2CrewCounter('crew', 1);
  assert.equal(unlocked.c2CrewCounters().crew, 9);
  assert.equal(unlocked.c2CrewCounterTotal(), 9);
});

test('the locked cap trims leftovers in captive, refugee, crew order', () => {
  const c = harness(c2State(7, false, { refugees: 2, captives: 1 }));
  const counters = c.c2CrewCounters();
  assert.deepEqual({ ...counters }, { crew: 7, refugees: 1, captives: 0 });
  assert.equal(c.c2CrewCounterTotal(), 8);

  // 9 crew stored while locked (the old 9 / 10 rule) is reduced to the locked cap.
  const locked = harness(c2State(9));
  assert.equal(locked.c2CrewCounters().crew, 8);
  assert.equal(String(locked.state.cycleStats.c2.crew), '8');
});
