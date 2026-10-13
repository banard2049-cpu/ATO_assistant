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
  test(`${page} ${cycle}: negative diplomacy respects the cycle-specific boundaries`, () => {
    for (const [value, bonus] of [
      [-15, -3], [-11, -3], [-10, -3], [-9, -2],
      [-6, -2], [-5, -2], [-4, -1], [-3, -1],
      [-2, -1], [-1, -1], [0, 0],
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
  const nonnegative = JSON.parse(JSON.stringify(vm.runInNewContext(markerArrays[2])));
  const configured = JSON.parse(JSON.stringify(vm.runInNewContext(
    source.slice(markersStart, markersEnd) + '\ndiplomacyMarkersByCycle'
  )));
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const signed = JSON.parse(JSON.stringify(vm.runInNewContext(markerArrays[1], { state: { cycle } })));
    assert.deepEqual(configured[cycle].map(({ value, label }) => ({ value, label })),
      cycle === 'c2' ? nonnegative : signed.map(marker => ({ ...marker,
        label: cycle === 'c5' && marker.value === -10 ? '归顺' : marker.label })), cycle);
  }
});

test(`${page}: every legal integer matches the independently verified PDF ranges`, () => {
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    for (let value = cycle === 'c2' ? 0 : -10; value <= (cycle === 'c2' ? 15 : 10); value++) {
      const bonus = cycle === 'c2' ? (value < 3 ? -1 : value < 7 ? 0 : value < 12 ? 1 : 2)
        : value === -10 ? -3 : value <= -5 ? -2 : value < 0 ? -1 : value < 4 ? 0 : value < 8 ? 1 : 2;
      const labels = cycle === 'c2' ? { '-1': '隐藏', 0: '怀疑', 1: '友善', 2: '结盟' }
        : { '-3': cycle === 'c5' ? '归顺' : '开战', '-2': '恶劣', '-1': '交恶', 0: '中立', 1: '友善', 2: '结盟' };
      assert.equal(diplomacyStatus(cycle, value).bonus, bonus, `${cycle} ${value}`);
      assert.equal(diplomacyStatus(cycle, value).label, labels[bonus], `${cycle} ${value}`);
    }
  }
});
}

test('exploration reads the actual corrected diplomacy relation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const extract = name => source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'))[0];
  const start = source.indexOf('    const diplomacyMarkersByCycle =');
  const end = source.indexOf('    function formatSignedNumber(', start);
  const context = vm.createContext({
    cachedArgoRecord: {}, isPlainObject: x => !!x && typeof x === 'object' && !Array.isArray(x),
    currentCycleConfig: () => ({ id: 'c4' }), currentMapFactions: () => ['wasters'], mapFactionLabel: () => '浪费者',
  });
  vm.runInContext(source.slice(start, end) + ['diplomacyStatus', 'diplomacyValue', 'currentExplorationDiplomacy'].map(extract).join('\n'), context);
  for (const [value, bonus] of [[-10, -3], [-5, -2], [-2, -1]]) {
    const result = context.currentExplorationDiplomacy({}, { diplomacy: { 'c4-wasters': String(value) } });
    assert.equal(result[0].bonus, bonus);
  }
});
