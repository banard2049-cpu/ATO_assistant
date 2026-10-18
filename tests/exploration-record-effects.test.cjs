const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const rules = require('../assets/exploration-card-effects.js');
const resourceRules = require('../assets/exploration-card-resource-rules.js');
const conditionRules = require('../assets/exploration-card-conditions.js');

function manual(text, badge = '', condition = null) {
  return { text, badge, condition };
}

function describe(items, context = {}) {
  return rules.describe({ manual: items }, context, resourceRules);
}

function titan(id, count = 1, extra = {}) {
  return { id, name: id, count, limit: count, crippled: false, ...extra };
}

test('the same module is available to browser scripts and Node', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/exploration-card-effects.js'), 'utf8'), context);
  assert.equal(typeof context.window.ATO_EXPLORATION_EFFECT_RULES.describe, 'function');
  assert.equal(typeof rules.apply, 'function');
});

test('complete instructions and explicit and lists retain unidentified remainders', () => {
  const entries = describe([
    manual('Gain +1 Crew.'),
    manual('Lose -2 Titans.'),
    manual('Gain +1 Crew and +1 ICON(cloaked-figure glyph).'),
    manual('Gain +1 Crew and Lose -1 Argo Fate.'),
    manual('Gain +1 ICON(cup) and +2 Crew.'),
  ]);
  assert.deepEqual(entries[0].effects, [{ type: 'crew', amount: 1 }]);
  assert.deepEqual(entries[1].effects, [{ type: 'titan', amount: -2 }]);
  assert.equal(entries[2].remainder, 'Gain +1 ICON(cloaked-figure glyph)');
  assert.deepEqual(entries[2].effects, [{ type: 'crew', amount: 1 }]);
  assert.deepEqual(entries[3].effects, [{ type: 'crew', amount: 1 }, { type: 'fate', amount: -1 }]);
  assert.equal(entries[3].remainder, '');
  assert.deepEqual(entries[4].effects, [{ type: 'crew', amount: 2 }]);
  assert.equal(entries[4].remainder, 'Gain +1 ICON(cup)');
});

test('conditions and alternative prose are never inferred from an effect sentence', () => {
  const texts = [
    'If you have 3+ Fear, lose -1 Crew.',
    'Lose -1 Crew or -1 Titan.',
    'Unless submerged, lose -1 Crew.',
    'Gain +1 Crew and +1 Titan if Allied.',
    'You may gain +1 Crew.',
    'Gain +1 Crew. Draw a card.',
    'Lose +1 Titan.',
    'Gain -1 Crew.',
  ];
  describe(texts.map((text) => manual(text))).forEach((entry, index) => {
    assert.deepEqual(entry.effects, [], texts[index]);
    assert.equal(entry.remainder, texts[index]);
  });
});

test('an explicit additional Titan loss is recognized while its badge still requires confirmation', () => {
  const entry = describe([manual('Lose -1 additional Titan.', 'Aligned with Nemesis')])[0];
  assert.deepEqual(entry.effects, [{ type: 'titan', amount: -1 }]);
  assert.equal(entry.remainder, '');
  assert.equal(entry.conditionState, null);
});

test('a missing structured condition with a badge remains unknown until explicitly confirmed', () => {
  const item = manual('Lose -1 Titan.', 'ICON(figure)/4+');
  assert.equal(describe([item])[0].conditionState, null);
  assert.equal(describe([item], { confirmedConditions: { 'manual:0': true } })[0].conditionState, true);
  assert.equal(describe([item], { confirmedConditions: { 'manual:0': false } })[0].conditionState, false);
  const diplomatic = manual('Lose -1 Crew.', 'At War', { type: 'diplomacy', mode: 'atMost', bonus: -3 });
  assert.equal(describe([diplomatic], { diplomacy: [{ id: 'a', bonus: 0 }], confirmedConditions: { 'manual:0': true } })[0].conditionState, false);
});

test('named faction conditions use that faction and blocked stacks suppress only Titan gains', () => {
  const card = {
    diplomacyFaction: 'minoians',
    manual: [
      manual('Lose -1 Crew.', 'At War', { type: 'diplomacy', mode: 'atMost', bonus: -3 }),
      manual('Gain +1 Crew and +1 Titan.'),
    ],
  };
  const entries = rules.describe(card, { diplomacy: [{ id: 'minoians', bonus: -3 }, { id: 'other', bonus: 2 }], diplomacyFactions: ['minoians', 'other'], blockGains: true }, resourceRules);
  assert.equal(entries[0].conditionState, true);
  assert.equal(entries[1].blocked, true);
  assert.equal(entries[1].text, 'Gain +1 Crew and +1 Titan.');
  assert.deepEqual(entries[1].effects, [{ type: 'crew', amount: 1 }]);
});

test('crew gains honor printed and unlocked maxima in every cycle', () => {
  for (const [cycle, max] of Object.entries({ c1: 6, c2: 8, c3: 9, c4: 6, c5: 6 })) {
    const record = { cycle, crew: '5', cycleStats: { [cycle]: { crew: '5' } } };
    const result = rules.apply(record, cycle, [{ type: 'crew', amount: 20 }]);
    assert.equal(result.record.cycleStats[cycle].crew, String(max), cycle);
    assert.equal(result.record.crew, String(max), cycle);
    assert.equal(result.changes[0].amount, max - 5);
    assert.equal(record.crew, '5', 'input must remain unchanged');
    if (cycle === 'c2' || cycle === 'c3') {
      const unlocked = rules.apply({ ...record, maxUnlocked: { [`${cycle}-crew`]: true } }, cycle, [{ type: 'crew', amount: 20 }]);
      assert.equal(unlocked.record.cycleStats[cycle].crew, String(max + 1));
    }
  }
});

test('an unsaved active crew track starts at the record sheet default and explicit zeros stay zero', () => {
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const initialCrew = { c1: 5, c2: 5, c3: 5, c4: 6, c5: 4 }[cycle];
    const result = rules.apply({ cycle }, cycle, [{ type: 'crew', amount: -1 }]);
    assert.equal(result.record.cycleStats[cycle].crew, String(initialCrew - 1), cycle);
    assert.equal(result.changes[0].amount, -1);
    assert.equal(rules.revert(result.record, result.changes).cycleStats[cycle].crew, String(initialCrew));
    const hull = rules.apply({ cycle }, cycle, [{ type: 'hull', amount: -1 }]);
    assert.equal(hull.record.cycleStats[cycle].hull, String({ c1: 4, c2: 5, c3: 5, c4: 5, c5: 6 }[cycle] - 1));
    const zero = rules.apply({ cycle, crew: '0' }, cycle, [{ type: 'crew', amount: -1 }]);
    assert.deepEqual(zero.changes, [], cycle);
    assert.equal(zero.record.crew, '0');
  }
  const inactive = rules.apply({ cycle: 'c5', crew: '5' }, 'c1', [{ type: 'crew', amount: -1 }]);
  assert.deepEqual(inactive.changes, [], 'an inactive uninitialized cycle cannot consume another cycle alias');
  assert.equal(inactive.record.crew, '5');
});

test('C2 crew capacity includes refugees and captives and losses affect actual crew only', () => {
  const record = { cycle: 'c2', crew: '5', cycleStats: { c2: { crew: '5', crewCounters: { crew: 5, refugees: 2, captives: 1 } } } };
  const atCapacity = rules.apply(record, 'c2', [{ type: 'crew', amount: 1 }]);
  assert.deepEqual(atCapacity.changes, []);
  assert.deepEqual(atCapacity.record, record);
  const unlocked = rules.apply({ ...record, maxUnlocked: { 'c2-crew': true } }, 'c2', [{ type: 'crew', amount: 3 }]);
  assert.equal(unlocked.record.crew, '6');
  assert.equal(unlocked.changes[0].amount, 1);
  const loss = rules.apply(record, 'c2', [{ type: 'crew', amount: -9 }]);
  assert.deepEqual(loss.record.cycleStats.c2.crewCounters, { crew: 0, refugees: 2, captives: 1 });
  assert.equal(loss.changes[0].amount, -5);
  assert.deepEqual(rules.revert(loss.record, loss.changes).cycleStats.c2.crewCounters, record.cycleStats.c2.crewCounters);
});

test('legacy C2 combined crew boxes migrate without converting refugees into crew', () => {
  const record = { cycle: 'c2', crew: '7', crewBoxes: { 'c2-crew-1': true, 'c2-crew-2': 'refugee', 'c2-crew-3': 'captive', 'c3-crew-1': true } };
  const result = rules.apply(record, 'c2', [{ type: 'crew', amount: 1 }]);
  assert.deepEqual(result.record.cycleStats.c2.crewCounters, { crew: 5, refugees: 2, captives: 1 });
  assert.equal(result.record.crew, '5');
  assert.equal(result.changes[0].amount, 1);
});

test('crew and fate writes are scoped to the selected cycle without changing another cycle alias', () => {
  const record = { cycle: 'c5', crew: '2', fate: '7', cycleStats: { c1: { crew: '5', fate: '3' }, c5: { crew: '2', fate: '7' } } };
  const result = rules.apply(record, 'c1', [{ type: 'crew', amount: 1 }, { type: 'fate', amount: -1 }]);
  assert.deepEqual(result.record.cycleStats.c1, { crew: '6', fate: '2' });
  assert.equal(result.record.crew, '2');
  assert.equal(result.record.fate, '7');
  assert.equal(result.record.cycle, 'c5');
  assert.deepEqual(rules.revert(result.record, result.changes), record);
});

test('fate clamps at 0–9 and undo removes only the actual delta from a newer record', () => {
  const result = rules.apply({ cycle: 'c1', fate: '8', resources: { trireme: 3 } }, 'c1', [{ type: 'fate', amount: 5 }]);
  assert.equal(result.record.fate, '9');
  assert.equal(result.changes[0].amount, 1);
  result.record.fate = '6';
  result.record.cycleStats.c1.fate = '6';
  result.record.resources.trireme = 5;
  result.record.notes = 'changed elsewhere';
  const undo = rules.revert(result.record, result.changes);
  assert.equal(undo.fate, '5');
  assert.equal(undo.resources.trireme, 5);
  assert.equal(undo.notes, 'changed elsewhere');
  const loss = rules.apply({ cycle: 'c1', fate: '1' }, 'c1', [{ type: 'fate', amount: -3 }]);
  assert.equal(loss.record.fate, '0');
  assert.equal(loss.changes[0].amount, -1);
  assert.equal(rules.revert(loss.record, loss.changes).fate, '1');
});

test('Titan gains form one grouped dreamwalker row even when the displayed limit is full', () => {
  const record = { titans: [titan('old', 1, { crippled: true })], titanLimit: '1', deadTitans: '4' };
  const result = rules.apply(record, 'c1', [{ type: 'titan', amount: 2 }]);
  assert.equal(result.record.titans.length, 2);
  assert.equal(new Set(result.record.titans.map((item) => item.id)).size, 2);
  result.record.titans.slice(1).forEach((item) => {
    assert.equal(item.name, '梦行者');
    assert.equal(item.count, 2);
    assert.equal(item.limit, 1);
    assert.equal(item.crippled, false);
  });
  assert.equal(result.record.deadTitans, '4');
  assert.deepEqual(rules.revert(result.record, result.changes), record);
  assert.deepEqual(rules.apply(record, 'c1', [{ type: 'titan', amount: 1 }], { blockGains: true }).record, record);
});

test('gained dreamwalkers stay healthy when a crippled dreamwalker row already exists', () => {
  for (const healthyCount of [0, 2]) {
    const crippled = titan('crippled', 1, { name: '梦行者', crippled: true });
    const healthy = titan('healthy', healthyCount, { name: '梦行者' });
    const record = { titans: [crippled, ...(healthyCount ? [healthy] : [])] };
    const before = JSON.parse(JSON.stringify(record));
    const result = rules.apply(record, 'c5', [{ type: 'titan', amount: 2 }]);
    assert.deepEqual(result.record.titans.find(item => item.id === crippled.id), crippled);
    assert.equal(result.record.titans.length, 2);
    const gained = result.record.titans.find(item => !item.crippled);
    assert.equal(gained.name, '梦行者');
    assert.equal(gained.count, healthyCount + 2);
    if (healthyCount) assert.equal(gained.id, healthy.id);
    assert.deepEqual(record, before, 'applying gains preserves the caller record');
    assert.deepEqual(rules.revert(result.record, result.changes), record);
  }
});

test('Titan losses require selected objects and decrement a grouped row without recording death', () => {
  const record = { titans: [titan('group', 3, { name: 'named group', crippled: true }), titan('other', 1)], deadTitans: '7', resources: { foo: 2 } };
  assert.throws(() => rules.apply(record, 'c1', [{ type: 'titan', amount: -1 }]), /请选择/);
  assert.throws(() => rules.apply(record, 'c1', [{ type: 'titan', amount: -1 }], { titanLosses: [{ id: 'missing', count: 1 }] }), /重新选择/);
  assert.throws(() => rules.apply(record, 'c1', [{ type: 'titan', amount: -1 }], { titanLosses: [{ id: 'group', count: 2 }] }), /请选择 1/);
  const result = rules.apply(record, 'c1', [{ type: 'titan', amount: -1 }], { titanLosses: [{ id: 'group', count: 1 }] });
  assert.equal(result.record.titans[0].count, 2);
  assert.equal(result.record.titans[0].crippled, true);
  assert.equal(result.record.deadTitans, '7');
  result.record.titans[0].name = 'renamed elsewhere';
  result.record.resources.foo = 5;
  const undo = rules.revert(result.record, result.changes);
  assert.equal(undo.titans[0].count, 3);
  assert.equal(undo.titans[0].name, 'renamed elsewhere');
  assert.equal(undo.resources.foo, 5);
});

test('removing whole rows restores only their lost quantity and handles a scarce Titan supply', () => {
  const record = { titans: [titan('one', 2), titan('two', 1)] };
  const result = rules.apply(record, 'c3', [{ type: 'titan', amount: -5 }], { titanLosses: [{ id: 'one', count: 2 }, { id: 'two', count: 1 }] });
  assert.deepEqual(result.record.titans, []);
  assert.equal(result.changes.reduce((sum, item) => sum + item.amount, 0), -3);
  assert.deepEqual(rules.revert(result.record, result.changes), record);
  const none = rules.apply({ titans: [] }, 'c1', [{ type: 'titan', amount: -1 }]);
  assert.deepEqual(none.changes, []);
});

test('undo of a gained Titan does not delete quantities subsequently added to the same row', () => {
  const result = rules.apply({ titans: [] }, 'c1', [{ type: 'titan', amount: 1 }]);
  result.record.titans[0].count = 3;
  result.record.titans[0].name = 'renamed';
  const undo = rules.revert(result.record, result.changes);
  assert.equal(undo.titans[0].count, 2);
  assert.equal(undo.titans[0].name, 'renamed');
});

test('only verified Cycle I glyphs become Strangers or Argo Fate instructions', () => {
  assert.deepEqual(rules.parse('Gain +2 ICON(cloaked-figure glyph).', 'c1'), { effects: [{ type: 'strangers', amount: 2 }], remainder: '' });
  assert.deepEqual(rules.parse('Gain 1 additional ICON(hooded figure).', 'c1'), { effects: [{ type: 'strangers', amount: 1 }], remainder: '' });
  assert.deepEqual(rules.parse('Gain +1 ICON(cup/urn glyph).', 'c1'), { effects: [{ type: 'fate', amount: 1 }], remainder: '' });
  assert.deepEqual(rules.parse('Gain +1 Crew and +1 ICON(cloaked-figure glyph).', 'c1'), { effects: [{ type: 'crew', amount: 1 }, { type: 'strangers', amount: 1 }], remainder: '' });
  for (const cycle of ['c2', 'c3', 'c4', 'c5', undefined]) {
    for (const text of ['Gain +2 ICON(cloaked-figure glyph).', 'Gain 1 additional ICON(hooded figure).']) {
      assert.deepEqual(rules.parse(text, cycle), { effects: [], remainder: text });
    }
  }
});

test('Maze Pilgrim applies its additional Stranger only when its verified Fate badge holds', () => {
  const datasetContext = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/exploration-card-resources.js'), 'utf8'), datasetContext);
  const card = JSON.parse(JSON.stringify(datasetContext.window.ATO_EXPLORATION_CARD_RESOURCES.cards['c1:6437']));
  for (const [fate, expected] of [[5, true], [4, false], ['', null]]) {
    const record = { cycle: 'c1', fate, strangers: '2', cycleStats: { c1: { fate, strangers: '2' } } };
    const context = { ...conditionRules.contextForRecord(record, 'c1'), conditionRules };
    const entries = rules.describe(card, context, resourceRules);
    const additional = entries.find((entry) => entry.id === 'manual:2');
    assert.equal(additional.conditionState, expected);
    assert.deepEqual(additional.effects, [{ type: 'strangers', amount: 1 }]);
    assert.equal(additional.remainder, '');
    const automatic = entries.filter((entry) => entry.conditionState === true).flatMap((entry) => entry.effects);
    const result = rules.apply(record, 'c1', automatic);
    assert.equal(result.record.strangers, expected === true ? '3' : '2');
    assert.deepEqual(rules.revert(result.record, result.changes), record);
    assert.deepEqual(entries[0].effects, [], 'the map-dependent replacement remains manual');
    assert.equal(entries[0].remainder, card.manual[0].text);
    assert.deepEqual(entries[1].effects, [], 'the following story condition remains manual');
  }
});

test('a verified Fate badge gates a C1 glyph effect using the recorded track', () => {
  const card = { cycleId: 'c1', cardId: '6400', manual: [manual('Gain +2 ICON(cloaked-figure glyph).', 'ICON(black lozenge with white vessel glyph) 7+')] };
  for (const [fate, expected] of [[7, true], [6, false], ['', null]]) {
    const context = { ...conditionRules.contextForRecord({ cycle: 'c1', fate }, 'c1'), conditionRules };
    const entry = rules.describe(card, context, resourceRules)[0];
    assert.equal(entry.conditionState, expected);
    assert.deepEqual(entry.effects, [{ type: 'strangers', amount: 2 }]);
    assert.equal(entry.remainder, '');
  }
  const unknown = { ...card, manual: [manual('Gain +1 Crew.', 'ICON(figure)/4+')] };
  assert.equal(rules.describe(unknown, { ...conditionRules.contextForRecord({ fate: 12 }, 'c1'), conditionRules }, resourceRules)[0].conditionState, null);
});

test('C1 diplomacy glyph effects remain controlled by the named faction', () => {
  const card = { cycleId: 'c1', diplomacyFaction: 'hornsworn', manual: [
    manual('Gain +1 ICON(cup/urn glyph).', 'Allied', { type: 'diplomacy', mode: 'atLeast', bonus: 2 }),
    manual('Gain +2 ICON(cloaked-figure glyph).', 'Denounced', { type: 'diplomacy', mode: 'only', bonus: -2 }),
  ] };
  const context = { conditionRules, diplomacy: [{ id: 'hornsworn', bonus: -2 }, { id: 'minoians', bonus: 2 }], diplomacyFactions: ['hornsworn', 'minoians'] };
  const entries = rules.describe(card, context, resourceRules);
  assert.equal(entries[0].conditionState, false);
  assert.equal(entries[1].conditionState, true);
  assert.deepEqual(entries[0].effects, [{ type: 'fate', amount: 1 }]);
  assert.deepEqual(entries[1].effects, [{ type: 'strangers', amount: 2 }]);
});

test('Strangers have no game-track maximum, preserve actual losses, and write the selected cycle', () => {
  const record = { cycle: 'c1', strangers: '20', crew: '5', cycleStats: { c1: { strangers: '20', crew: '5' }, c3: { strangers: '8' } } };
  const gain = rules.apply(record, 'c1', [{ type: 'strangers', amount: 50 }], { blockGains: true });
  assert.equal(gain.record.strangers, '70', 'a resource/Titan pile ban does not block Strangers');
  assert.equal(gain.record.cycleStats.c1.strangers, '70');
  assert.equal(gain.changes[0].amount, 50);
  assert.match(gain.summary, /陌生人 \+50/);
  assert.deepEqual(rules.revert(gain.record, gain.changes), record);
  const loss = rules.apply(record, 'c1', [{ type: 'strangers', amount: -99 }]);
  assert.equal(loss.record.strangers, '0');
  assert.equal(loss.changes[0].amount, -20);
  assert.deepEqual(rules.revert(loss.record, loss.changes), record);
  const inactive = rules.apply({ cycle: 'c3', strangers: '8', cycleStats: { c1: { strangers: '2' }, c3: { strangers: '8' } } }, 'c1', [{ type: 'strangers', amount: 1 }]);
  assert.equal(inactive.record.strangers, '8');
  assert.equal(inactive.record.cycleStats.c1.strangers, '3');
});

test('compound C1 glyph changes and dynamic Dog Days plans apply and undo the actual deltas', () => {
  const initial = { cycle: 'c1', crew: '5', strangers: '7', fate: '7', cycleStats: { c1: { crew: '5', strangers: '7', fate: '7' } } };
  const compound = rules.apply(initial, 'c1', rules.parse('Gain +1 Crew and +1 ICON(cloaked-figure glyph).', 'c1').effects);
  assert.equal(compound.record.crew, '6');
  assert.equal(compound.record.strangers, '8');
  assert.deepEqual(rules.revert(compound.record, compound.changes), initial);
  const wish = rules.apply(initial, 'c1', rules.parse('Gain +1 ICON(cup/urn glyph).', 'c1').effects);
  assert.equal(wish.record.fate, '8');
  assert.deepEqual(rules.revert(wish.record, wish.changes), initial);
  const plan = conditionRules.planStrangers(initial, 'c1', { cycleId: 'c1', cardId: '6400' });
  const resolved = rules.apply(initial, 'c1', plan.effects);
  assert.equal(resolved.record.crew, '3');
  assert.equal(resolved.record.strangers, '3');
  assert.deepEqual(rules.revert(resolved.record, resolved.changes), initial);
  resolved.record.cycleStats.c1.strangers = '5';
  resolved.record.strangers = '5';
  assert.equal(rules.revert(resolved.record, resolved.changes).strangers, '9', 'undo preserves a later +2 edit');
});
