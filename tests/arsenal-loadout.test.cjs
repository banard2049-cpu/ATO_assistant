const test = require('node:test');
const assert = require('node:assert/strict');
const loadout = require('../technology/arsenal-loadout.js');

const names = new Map([
  ['AJ0163', 'Club'], ['AJ0257', 'Shieldblade'], ['AJ0160', 'Sail Spolas'],
  ['DJ2372', 'Curseblade'], ['DJ2379', 'Curseblade'], ['EJ2930', 'Tornado'],
]);

function record() {
  return {
    titans: [{ id: 'dream', name: '梦行者', count: 2 }, { id: 'earth', name: '撼地者', count: 1, crippled: true }],
    arsenal: {
      AJ0163: { quantity: 2, manufactured: 3 }, AJ0257: { quantity: 1, manufactured: 1 },
      DJ2372: { quantity: 1, manufactured: 0 }, DJ2379: { quantity: 1, manufactured: 0 },
      AJ0160: { quantity: 0, manufactured: 2 }, 'T:tt_earthshaker': { quantity: 1, manufactured: 1 },
    },
    resources: { 'c1-trireme': 7 },
  };
}

function deployment() {
  const draft = loadout.normalize(null);
  draft.slots[0].titanId = 'dream';
  draft.slots[1].titanId = 'dream';
  return draft;
}

test('save all moves a single owned card between slots atomically and preserves newly saved presets', () => {
  const state = record();
  const baseline = deployment();
  baseline.slots[0].equipment = ['AJ0257'];
  state.arsenalLoadouts = structuredClone(baseline);
  state.arsenalLoadouts.presets.push({ id: 'remote', name: '并发方案', owner: 2, titanId: '', equipment: [] });
  const next = structuredClone(baseline);
  next.slots[0].equipment = [];
  next.slots[1].equipment = ['AJ0257'];
  const saved = loadout.saveAllSlots(state, baseline, next, names);
  assert.deepEqual(saved.arsenalLoadouts.slots, next.slots);
  assert.deepEqual(saved.arsenalLoadouts.presets, state.arsenalLoadouts.presets);
  assert.equal(loadout.saveAllSlots(saved, baseline, next, names), null);
  state.arsenalLoadouts.slots[0].equipment.push('AJ0163');
  assert.throws(() => loadout.saveAllSlots(state, baseline, next, names), /其他页面/);
});

test('saving one player preserves concurrent slots and keeps named presets scoped to their owner', () => {
  const state = record();
  const baseline = deployment();
  state.arsenalLoadouts = structuredClone(baseline);
  state.arsenalLoadouts.slots[1].equipment = ['AJ0257'];
  const first = { titanId: 'dream', equipment: ['AJ0163'] };
  const saved = loadout.saveSlot(state, baseline, 0, first, null, names);
  assert.deepEqual(saved.arsenalLoadouts.slots[1].equipment, ['AJ0257']);
  assert.throws(() => loadout.saveSlot(saved, baseline, 0, { titanId: 'dream', equipment: [] }, null, names), /其他页面/);
  const withPreset = loadout.saveSlot(saved, baseline, 0, null, { id: 'one', preset: { ...first, name: '守卫' } }, names);
  const withBoth = loadout.saveSlot(withPreset, baseline, 1, null, { id: 'two', preset: { ...first, name: '守卫' } }, names);
  assert.deepEqual(withBoth.arsenalLoadouts.presets.map(preset => preset.owner), [0, 1]);
  assert.throws(() => loadout.saveSlot(withBoth, withBoth.arsenalLoadouts, 1, null, { id: 'one' }, names), /其他页面/);
});

test('an old profile starts with four empty loadout slots', () => {
  const state = record();
  assert.deepEqual(loadout.normalize(state.arsenalLoadouts), {
    slots: Array.from({ length: 4 }, () => ({ titanId: '', equipment: [] })),
    presets: [],
  });
});

test('legacy aliases and duplicate IDs in saved equipment normalize without mutating the source', () => {
  const stored = { slots: [{ titanId: ' dream ', equipment: ['1xaj0163', 'AJ0163', 'T:tt_earthshaker', 'invalid'] }],
    presets: [{ id: 'one', name: '备用', titanId: 'earth', equipment: ['aj0257'] }, { id: 'one', name: 'duplicate' }] };
  const before = structuredClone(stored);
  const normalized = loadout.normalize(stored);
  assert.deepEqual(normalized.slots[0], { titanId: 'dream', equipment: ['AJ0163'] });
  assert.deepEqual(normalized.presets, [{ id: 'one', name: '备用', titanId: 'earth', equipment: ['AJ0257'] }]);
  assert.deepEqual(stored, before);
});

test('equipment editing adds, orders, transfers and returns individual cards without adjusting stock', () => {
  const state = record();
  const initial = deployment().slots;
  const before = structuredClone(state);
  const move = (slots, gearId, from, to, beforeGearId) => loadout.editEquipment(slots, { gearId, from, to, beforeGearId }, state, names);

  const armed = move(initial, 'AJ0163', null, 0);
  const shielded = move(armed, 'AJ0257', null, 0);
  const reordered = move(shielded, 'AJ0257', 0, 0, 'AJ0163');
  assert.deepEqual(reordered[0].equipment, ['AJ0257', 'AJ0163']);
  const transferred = move(reordered, 'AJ0257', 0, 1);
  assert.deepEqual(transferred.map(slot => slot.equipment), [['AJ0163'], ['AJ0257'], [], []]);
  const returned = move(transferred, 'AJ0257', 1, null);
  assert.deepEqual(returned.map(slot => slot.equipment), [['AJ0163'], [], [], []]);
  assert.deepEqual(loadout.equipmentCounts(returned), new Map([['AJ0163', 1]]));
  assert.deepEqual(initial.map(slot => slot.equipment), [[], [], [], []]);
  assert.deepEqual(shielded[0].equipment, ['AJ0163', 'AJ0257']);
  assert.deepEqual(state, before);
});

test('shared stock and duplicate card names are checked when placing a card', () => {
  const state = record();
  const add = (slots, gearId, to) => loadout.editEquipment(slots, { gearId, to }, state, names);
  const shielded = add(deployment().slots, 'AJ0257', 0);
  assert.throws(() => add(shielded, 'AJ0257', 1), Error);
  assert.throws(() => add(shielded, 'AJ0160', 1), Error);
  assert.throws(() => add(shielded, 'T:tt_earthshaker', 1), Error);
  const cursed = add(shielded, 'DJ2372', 0);
  assert.throws(() => add(cursed, 'DJ2379', 0), Error);
  const twin = add(cursed, 'DJ2379', 1);
  assert.deepEqual(twin[1].equipment, ['DJ2379']);
  const armed = add(add(twin, 'AJ0163', 0), 'AJ0163', 1);
  assert.equal(loadout.equipmentCounts(armed).get('AJ0163'), 2);
  assert.equal(loadout.validate({ slots: armed, presets: [] }, state, names), '');
});

test('slots accept gear without a Titan selection', () => {
  const state = record();
  const draft = deployment();
  const equipClub = to => loadout.editEquipment(draft.slots, { gearId: 'AJ0163', to }, state, names);
  assert.equal(loadout.validate(draft, state, names), '');
  assert.deepEqual(equipClub(2)[2].equipment, ['AJ0163']);
  assert.deepEqual(equipClub(1)[1].equipment, ['AJ0163']);
});

test('multiple sides accept unowned and already assigned cards without reserving stock', () => {
  const state = record();
  const draft = deployment();
  draft.slots[0].equipment = ['AJ0257'];
  draft.slots[0].sides = [{ id: 'first', name: '快速', equipment: [] }, { id: 'second', name: '防御', equipment: [] }];
  const edit = operation => { draft.slots = loadout.editEquipment(draft.slots, operation, state, names); };
  edit({ gearId: 'EJ2930', to: 0, toSide: 'first' });
  edit({ gearId: 'AJ0257', to: 0, toSide: 'first' });
  edit({ gearId: 'AJ0257', to: 0, toSide: 'second' });
  assert.throws(() => edit({ gearId: 'EJ2930', from: 0, fromSide: 'first', to: 1 }), /库存/);
  assert.throws(() => edit({ gearId: 'AJ0257', from: 0, fromSide: 'second', to: 1 }), /库存/);
  draft.presets.push({ id: 'plan', name: '方案', ...draft.slots[0] });
  const saved = loadout.save(state, null, draft, names);
  assert.deepEqual(saved.arsenal, state.arsenal);
  assert.deepEqual(saved.arsenalLoadouts.presets[0].sides, draft.slots[0].sides);
  assert.deepEqual(saved.arsenalLoadouts.slots[0].sides.map(side => side.equipment), [['EJ2930', 'AJ0257'], ['AJ0257']]);
  assert.deepEqual(loadout.equipmentCounts(saved.arsenalLoadouts.slots), new Map([['AJ0257', 1]]));
});

test('validation uses current Titan quantities and stock while saved presets reserve no copies', () => {
  const state = record();
  const draft = deployment();
  draft.slots[0].equipment = ['AJ0257'];
  draft.presets = [
    { id: 'one', name: '重装', titanId: 'dream', equipment: ['AJ0257'] },
    { id: 'two', name: '备选', titanId: 'dream', equipment: ['AJ0257'] },
  ];
  assert.equal(loadout.validate(draft, state, names), '');

  const withoutStock = structuredClone(state);
  withoutStock.arsenal.AJ0257.quantity = 0;
  assert.notEqual(loadout.validate(draft, withoutStock, names), '');
  const fewerTitans = structuredClone(state);
  fewerTitans.titans[0].count = 1;
  assert.equal(loadout.validate(draft, fewerTitans, names), '');
  const removedTitan = structuredClone(state);
  removedTitan.titans.shift();
  assert.equal(loadout.validate(draft, removedTitan, names), '');
  const withoutTitan = structuredClone(draft);
  withoutTitan.slots[0].titanId = '';
  assert.equal(loadout.validate(withoutTitan, state, names), '');
});

test('saving checks the latest profile, preserves other record data, and rejects competing edits', () => {
  const base = loadout.normalize(undefined);
  const draft = deployment();
  draft.slots[0].equipment = ['AJ0257'];
  const latest = record();
  const before = structuredClone(latest);
  const next = loadout.save(latest, base, draft, names);
  assert.deepEqual(next, { ...before, arsenalLoadouts: draft });
  assert.deepEqual(latest, before);
  const reloaded = loadout.normalize(JSON.parse(JSON.stringify(next)).arsenalLoadouts);
  assert.deepEqual(reloaded, draft);
  assert.doesNotThrow(() => loadout.save(next, base, draft, names), 'repeating a committed save is safe');

  const concurrent = loadout.save(latest, base, deployment(), names);
  const concurrentBefore = structuredClone(concurrent);
  assert.throws(() => loadout.save(concurrent, base, draft, names), Error);
  assert.deepEqual(concurrent, concurrentBefore);
  latest.arsenal.AJ0257.quantity = 0;
  assert.throws(() => loadout.save(latest, base, draft, names), Error);
});
