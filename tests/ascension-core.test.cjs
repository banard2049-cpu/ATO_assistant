const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../technology/ascension-core.js');
const terms = require('../theatre/terms.js');

const sheet = (counts = {}) => ({
  hold: Object.fromEntries(core.CYCLES.map(cycle => [cycle, {
    tear: { count: 0, notes: '' },
    core: { count: counts[cycle] || 0, notes: '' },
  }])),
});

test('登升核心名称与幻忆记录表的货舱用词一致', () => {
  for (const cycle of core.CYCLES) {
    assert.equal(core.name(cycle), terms.material(cycle, 'core', 'fan'));
  }
  assert.equal(core.name('c9'), '登升核心');
});

test('余额从剧场记录表的 hold.<cycle>.core.count 读取，缺字段按 0 处理', () => {
  assert.equal(core.amount(sheet({ c2: 3 }), 'c2'), 3);
  assert.equal(core.amount(sheet(), 'c1'), 0);
  assert.equal(core.amount({}, 'c1'), 0);
  assert.equal(core.amount(null, 'c1'), 0);
  assert.equal(core.amount({ hold: { c1: { core: { count: -2 } } } }, 'c1'), 0);
  assert.equal(core.amount({ hold: { c1: { core: { count: 2.7 } } } }, 'c1'), 2);
});

test('登升消耗一件对应循环的核心，并且不改动传入的存档', () => {
  const state = sheet({ c1: 2 });
  const next = core.spend(state, 'c1');
  assert.equal(core.amount(next, 'c1'), 1);
  assert.equal(core.amount(state, 'c1'), 2);
  assert.notEqual(next.hold.c1, state.hold.c1);
  // 其它循环与同循环的泪珠不受影响
  assert.equal(core.amount(next, 'c2'), 0);
  assert.equal(next.hold.c1.tear.count, 0);
});

test('余额不足或循环无效时拒绝登升', () => {
  assert.throws(() => core.spend(sheet(), 'c1'), /缺少迷纹登升核心/);
  assert.throws(() => core.spend(sheet({ c3: 0 }), 'c3'), /缺少诅咒登升核心/);
  assert.throws(() => core.spend({}, 'c2'), /缺少埋藏登升核心/);
  assert.throws(() => core.spend(sheet({ c1: 1 }), 'c9'), /没有可用的登升核心/);
  assert.throws(() => core.spend(sheet({ c1: 1 }), ''), /没有可用的登升核心/);
});

test('退回核心时补齐缺失的字段', () => {
  const state = sheet({ c4: 1 });
  assert.equal(core.amount(core.refund(state, 'c4'), 'c4'), 2);
  const empty = core.refund({}, 'c5');
  assert.equal(core.amount(empty, 'c5'), 1);
  assert.equal(typeof empty.hold.c5.core.notes, 'string');
  assert.equal(core.amount(state, 'c4'), 1);
  const untouched = {};
  assert.equal(core.refund(untouched, 'c9'), untouched);
});
