const assert = require('node:assert/strict');
const test = require('node:test');
const data = require('../aibp/boss-levels-data.js');

function bonus(id, level) {
  const row = data.bosses[id].levels[String(level)];
  assert.ok(row, `${id} level ${level} is recorded`);
  const b = row.bonuses;
  return [b.promotions, b.at, b.dangerPerAttack, b.dangerPerHit, b.evasionDice];
}

test('C4/C5 front and TRO levels are present in the shared workbook data', () => {
  for (const id of ['MIDASCORE', 'DEMIDJINN', 'THE_BABELIAN_LUNACY', 'DAHAKA',
    'DRAGON_OF_PHOBOS', 'MEDUKETOS', 'UR_FLEECE', 'TITAN_X']) {
    assert.deepEqual(Object.keys(data.bosses[id].levels), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  }
  assert.deepEqual(bonus('MIDASCORE', 4), [2, 1, 1, 0, 0]);
  assert.deepEqual(bonus('DEMIDJINN', 4), [2, 1, 1, 0, 0]);
  assert.deepEqual(bonus('THE_BABELIAN_LUNACY', 2), [1, 2, 0, 0, 0]);
  assert.deepEqual(bonus('DAHAKA', 3), [2, 2, 1, 0, 0]);
  assert.deepEqual(bonus('DRAGON_OF_PHOBOS', 2), [1, 0, 0, 0, 0]);
  assert.deepEqual(bonus('MEDUKETOS', 2), [1, 0, 0, 0, 0]);
  assert.deepEqual(bonus('UR_FLEECE', 2), [1, 2, 0, 0, 0]);
  assert.deepEqual(bonus('TITAN_X', 2), [2, 1, 0, 0, 0]);
});

test('C4/C5 level IX bonuses retain their distinct promotion, AT and evasion totals', () => {
  assert.deepEqual(bonus('MIDASCORE', 9), [5, 6, 0, 3, 2]);
  assert.deepEqual(bonus('DEMIDJINN', 9), [5, 6, 0, 3, 2]);
  assert.deepEqual(bonus('THE_BABELIAN_LUNACY', 9), [5, 9, 0, 3, 3]);
  assert.deepEqual(bonus('DAHAKA', 9), [5, 8, 0, 3, 2]);
  assert.deepEqual(bonus('DRAGON_OF_PHOBOS', 9), [6, 6, 0, 3, 2]);
  assert.deepEqual(bonus('MEDUKETOS', 9), [6, 6, 0, 3, 2]);
  assert.deepEqual(bonus('UR_FLEECE', 9), [5, 9, 0, 3, 3]);
  assert.deepEqual(bonus('TITAN_X', 9), [6, 8, 0, 3, 2]);
});
