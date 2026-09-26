const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const [page, nextFunction] of [
  ['index.html', 'currentMapFactionStatusItems'],
  ['aibp/index.html', 'factionStatusText'],
]) {
const source = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
const markersStart = source.indexOf('    const diplomacyMarkersByCycle =');
const markersEnd = source.indexOf('    function formatSignedNumber(', markersStart);
const statusStart = source.indexOf('    function diplomacyStatus(');
const statusEnd = source.indexOf(`    function ${nextFunction}(`, statusStart);
assert.ok(markersStart >= 0 && markersEnd > markersStart && statusStart >= 0 && statusEnd > statusStart);
const diplomacyStatus = vm.runInNewContext(
  source.slice(markersStart, markersEnd) + source.slice(statusStart, statusEnd) + '\ndiplomacyStatus'
);

for (const cycle of ['c1', 'c3', 'c4', 'c5']) {
  test(`${page} ${cycle}: negative diplomacy changes only below each threshold`, () => {
    for (const [value, bonus] of [
      [-15, -3], [-11, -3], [-10, -2], [-9, -2],
      [-6, -2], [-5, -1], [-4, -1], [-3, -1],
      [-2, 0], [-1, 0], [0, 0],
    ]) {
      assert.equal(diplomacyStatus(cycle, value).bonus, bonus, `${cycle} at ${value}`);
    }
  });
  test(`${page} ${cycle}: positive diplomacy still changes at its thresholds`, () => {
    for (const [value, bonus] of [[1, 0], [3, 0], [4, 1], [7, 1], [8, 2], [15, 2]]) {
      assert.equal(diplomacyStatus(cycle, value).bonus, bonus, `${cycle} at ${value}`);
    }
  });
}

test(`${page} c2: nonnegative diplomacy track retains its original boundaries`, () => {
  for (const [value, bonus] of [[0, -1], [2, -1], [3, 0], [6, 0], [7, 1], [11, 1], [12, 2]]) {
    assert.equal(diplomacyStatus('c2', value).bonus, bonus, `c2 at ${value}`);
  }
});

test(`${page}: all cycle thresholds match the record sheet markers`, () => {
  const recordSource = fs.readFileSync(path.join(__dirname, '..', 'record', 'index.html'), 'utf8');
  const renderStart = recordSource.indexOf('    function renderDiplomacy(');
  const markerArrays = recordSource.slice(renderStart).match(/const markers = min < 0\s*\? (\[[\s\S]*?\])\s*: (\[[\s\S]*?\]);/);
  assert.ok(markerArrays, 'Record sheet diplomacy markers must exist');
  const signed = JSON.parse(JSON.stringify(vm.runInNewContext(markerArrays[1])));
  const nonnegative = JSON.parse(JSON.stringify(vm.runInNewContext(markerArrays[2])));
  const configured = JSON.parse(JSON.stringify(vm.runInNewContext(
    source.slice(markersStart, markersEnd) + '\ndiplomacyMarkersByCycle'
  )));
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    assert.deepEqual(configured[cycle].map(({ value, label }) => ({ value, label })),
      cycle === 'c2' ? nonnegative : signed, cycle);
  }
});
}
