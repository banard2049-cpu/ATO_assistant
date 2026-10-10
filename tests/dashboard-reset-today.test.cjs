const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const reset = source.match(/^    function resetToday\(\) \{[^]*?^    }/m)?.[0];
assert.ok(reset, 'missing resetToday');

function setup(confirmed) {
  const calls = [];
  const context = vm.createContext({
    state: { day: 12, notes: '保留笔记', completed: { move: true }, events: [{ id: 'a', done: true }, { id: 'b', done: false }] },
    bgmResetRevision: 3,
    window: { confirm(message) { calls.push(['confirm', message]); return confirmed; } },
    saveState() { calls.push(['save']); },
    renderFlow() { calls.push(['flow']); },
    renderDateTrack() { calls.push(['track']); },
  });
  vm.runInContext(reset, context);
  return { context, calls };
}

test('取消重置时保留所有状态，不保存或重绘', () => {
  const { context, calls } = setup(false);
  const before = JSON.stringify(context.state);
  context.resetToday();
  assert.equal(JSON.stringify(context.state), before);
  assert.equal(context.bgmResetRevision, 3);
  assert.deepEqual(calls.map(call => call[0]), ['confirm']);
  assert.match(calls[0][1], /完成标记/);
});

test('确认后清除完成标记，保留日期、笔记和事件并保存', () => {
  const { context, calls } = setup(true);
  context.resetToday();
  assert.equal(JSON.stringify(context.state.completed), '{}');
  assert.equal(JSON.stringify(context.state.events), '[{"id":"a","done":false},{"id":"b","done":false}]');
  assert.equal(context.state.day, 12);
  assert.equal(context.state.notes, '保留笔记');
  assert.equal(context.bgmResetRevision, 4);
  assert.deepEqual(calls.map(call => call[0]), ['confirm', 'save', 'flow', 'track']);
});
