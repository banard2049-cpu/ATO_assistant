const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const effects = require('../assets/exploration-card-effects.js');
const conditions = require('../assets/exploration-card-conditions.js');
const resources = require('../assets/exploration-card-resource-rules.js');
const delays = require('../assets/exploration-card-delays.js');
const dataContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/exploration-card-resources.js'), 'utf8'), dataContext);
const cards = dataContext.window.ATO_EXPLORATION_CARD_RESOURCES.cards;

test('card-face audit uses the verified counters instead of the reused OCR glyph names', () => {
  // Ground truth checked on the original card faces, including both Hull and
  // Titan variants of Ancient Repository and the mixed Vanguard glyph rows.
  for (const [key, index, type, amount] of [
    ['c1:6401', 1, 'hull', 1], ['c1:6401', 5, 'hull', -1],
    ['c1:6402', 1, 'progress', 1], ['c1:6402', 4, 'fate', 1],
    ['c1:6421', 0, 'strangers', 1], ['c1:6425', 0, 'strangers', 1],
    ['c1:6429', 0, 'hull', -1], ['c1:6431', 0, 'progress', 1],
    ['c2:13623', 0, 'progress', 1],
    ['c3:13514', 0, 'hull', -1], ['c3:13520', 0, 'progress', 1], ['c3:13530', 6, 'hull', -1],
    ['c4:9310', 0, 'doom', 1], ['c4:9312', 0, 'fate', 1],
    ['c4:9335', 0, 'progress', 1], ['c4:9338', 0, 'progress', 1],
    ['c4:9343', 1, 'hull', 1], ['c4:9343', 5, 'hull', -1],
    ['c5:10301', 1, 'progress', 1], ['c5:10302', 2, 'hull', 1], ['c5:10302', 6, 'hull', -1],
    ['c5:10308', 1, 'fate', -1], ['c5:10312', 0, 'doom', 1], ['c5:10317', 0, 'progress', 1],
  ]) {
    const card = cards[key], row = card.manual[index];
    assert.deepEqual(effects.parse(row.text, card.cycleId, card.cardId, row.badge).effects, [{ type, amount }], `${key} row ${index}`);
  }
  assert.deepEqual(effects.parse(cards['c3:13513'].manual[0].text, 'c3', '13513').effects, [{ type: 'titan', amount: -1 }]);
  assert.deepEqual(effects.parse(cards['c5:10302'].manual[5].text, 'c5', '10302', 'Denounced').effects, [{ type: 'paranoia', amount: 1 }]);
  assert.match(effects.displayIcons(cards['c5:10315'].manual[0].text, 'c5', '10315'), /Hull/);
  for (const key of ['c4:9323', 'c5:10342', 'c5:10345']) assert.match(cards[key].manual[0].text, /\+3 Λ as a group/);
  assert.match(cards['c1:6434'].manual[0].text, /p\. 112/);
});

test('Hornsworn Allied progress differs from Unfriendly Fate and exposes a prior wrong Fate receipt', () => {
  const card = cards['c1:6402'];
  const parsed = effects.parse('Gain +1 ICON(cup/urn glyph).', 'c1', '6402', 'Allied');
  assert.deepEqual(parsed.effects, [{ type: 'progress', amount: 1 }]);
  assert.deepEqual(effects.parse('Gain +1 ICON(cup/urn glyph).', 'c1', '6402', 'Unfriendly').effects,
    [{ type: 'fate', amount: 1 }]);
  const context = { cycleId: 'c1', conditionRules: conditions,
    diplomacy: [{ id: 'hornsworn', bonus: 2 }],
    appliedEffects: { 'manual:1': { ruleVersion: 2, changes: [{ type: 'fate', amount: 1 }] } } };
  const row = effects.describe(card, context, resources).find(row => row.id === 'manual:1');
  assert.equal(row.conditionState, true);
  assert.equal(row.receiptMismatch, true, 'old settlements must remain available to undo before recalculating');
  const applied = effects.apply({ cycle: 'c1', cycleStats: { c1: { progress: '0', fate: '3' } } }, 'c1', row.effects);
  assert.equal(applied.record.cycleStats.c1.progress, '1');
  assert.equal(applied.record.cycleStats.c1.fate, '3');
});

test('Curselenders distinguishes the Cloud Thieves map symbol from its Babelian Debt gains', () => {
  const text = cards['c4:9334'].manual[0].text;
  assert.match(text, /on a ICON\(Cloud Thieves faction symbol\) Map Tile/);
  assert.equal(effects.iconIdentity('Cloud Thieves faction symbol', 'c4', '9334').kind, 'faction');
  const displayed = effects.displayIcons(text, 'c4', '9334');
  assert.match(displayed, /云贼派系标记.*Map Tile/);
  assert.match(displayed, /巴比伦债务/);
});

test('card-face audit conditions use Cyclopes status and Babelian Escalate starts at Fate eight', () => {
  for (const key of ['c2:13615', 'c2:13623']) {
    const card = cards[key];
    assert.equal(card.diplomacyFaction, 'cyclopes');
    for (const [local, cyclopes, expected] of [[2, 0, false], [0, 2, true]]) {
      const context = { cycleId: 'c2', conditionRules: conditions,
        diplomacy: [{ id: 'silenoi', bonus: local }, { id: 'cyclopes', bonus: cyclopes }] };
      assert.equal(effects.describe(card, context, resources)[0].conditionState, expected, 'a different Allied faction cannot activate the Cyclopean temple');
    }
  }
  for (const fate of [3, 7, 8]) {
    const row = delays.delayed(cards['c4:9327'], { cycleId: 'c4', conditionRules: conditions, stats: { fate } })
      .find(item => item.modifier === 'escalate');
    assert.equal(row.conditionState, fate >= 8);
  }
});

test('card-face audit manual Curse replacement and Abyss sequence produce one complete reminder', () => {
  const card = cards['c4:9332'];
  for (const bonus of [0, -3]) {
    const context = { cycleId: 'c4', conditionRules: conditions, stats: { fate: 0, babelianDebt: 0 },
      diplomacy: [{ id: 'test', bonus }] };
    const result = effects.combineManualReminders(card, effects.describe(card, context, resources), context);
    const curse = result.filter(row => row.id === 'manual-group:1-3');
    assert.equal(curse.length, 1);
    assert.match(curse[0].text, bonus === -3 ? /^Every Argonaut/ : /a random Argonaut/);
    assert.ok(!result.some(row => ['manual:1', 'manual:3'].includes(row.id)));
  }
  const abyss = cards['c3:13506'];
  const context = { cycleId: 'c3', diplomacy: [{ id: 'test', bonus: -2 }] };
  const sequence = effects.combineManualReminders(abyss, effects.describe(abyss, context, resources), context);
  assert.equal(sequence.length, 1);
  assert.match(sequence[0].text, /Gain \+1 Ω.*Gain as many Λ/);
});
