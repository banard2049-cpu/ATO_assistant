const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 规则：带 `city` 标签的格子被离开时会把 `last_city`（最后到访的城市）标记移过去；
// 但 c1 的 027 **虽然属于城市，却不会成为最后到访的城市** —— 离开它时不移标记。
// 这条例外写在 map/app.js 的 `lastCityExcludedTileIds` 里。

const root = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8');

function extractFunction(name) {
  const start = mapSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = mapSource.indexOf('{', mapSource.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < mapSource.length; index += 1) {
    const char = mapSource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return mapSource.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

const exclusionConstStart = mapSource.indexOf('const lastCityExcludedTileIds');
assert.ok(exclusionConstStart >= 0, 'Missing lastCityExcludedTileIds');
const exclusionConstSource = mapSource.slice(
  exclusionConstStart,
  mapSource.indexOf('};', exclusionConstStart) + 2,
);

const tagSource = fs.readFileSync(path.join(root, 'map/map-tile-tags.js'), 'utf8');
const tagData = JSON.parse(tagSource.slice(tagSource.indexOf('{')).replace(/;\s*$/, ''));

// vm 里造出来的对象和测试文件不是同一个 realm，deepEqual 会因为原型不同而失败，
// 所以统一先转成当前 realm 的普通对象再比。
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function harness(cycleId) {
  const context = vm.createContext({
    mapTagData: tagData,
    tokenAssetById: { last_city: {}, last_oasis: {}, last_silver_ruin: {}, c5_last_visited_underwater_city: {} },
  });
  return vm.runInContext(`(function () {
    ${exclusionConstSource}
    const state = { activeCycleId: ${JSON.stringify(cycleId)} };
    const cycleState = { currentTile: '', tokens: { markers: {} } };
    function activeCycleState() { return cycleState; }
    ${extractFunction('tileFaceId')}
    ${extractFunction('tileTagEntry')}
    ${extractFunction('tileTagIds')}
    ${extractFunction('tileHasTag')}
    ${extractFunction('removeMarkerEverywhere')}
    ${extractFunction('moveMarkerToTile')}
    ${extractFunction('isLastVisitedCityTile')}
    ${extractFunction('syncDepartedLandmarkMarkers')}
    return { state, cycleState, isLastVisitedCityTile, syncDepartedLandmarkMarkers };
  })()`, context);
}

test('c1 的 027 确实带 city 标签，但离开它不会落 last_city 标记', () => {
  assert.ok(tagData.tiles['c1:027'].tags.includes('city'), 'c1:027 应当是城市格');
  const game = harness('c1');
  assert.equal(game.isLastVisitedCityTile('c1', '027'), false);
  game.cycleState.currentTile = '027';
  game.syncDepartedLandmarkMarkers(game.cycleState, '026');
  assert.deepEqual(plain(game.cycleState.tokens.markers), {});
});

test('c1 其它城市格照旧把 last_city 标记移过去', () => {
  for (const tileId of ['017', 'T04']) {
    assert.ok(tagData.tiles[`c1:${tileId}`].tags.includes('city'), `c1:${tileId} 应当是城市格`);
    const game = harness('c1');
    game.cycleState.currentTile = tileId;
    game.syncDepartedLandmarkMarkers(game.cycleState, '026');
    assert.deepEqual(Object.keys(game.cycleState.tokens.markers), [tileId]);
    assert.equal(game.cycleState.tokens.markers[tileId].last_city, true);
  }
});

test('例外只关掉 c1 的 027，别的循环不受影响', () => {
  assert.equal(harness('c1').isLastVisitedCityTile('c1', '027'), false);
  assert.equal(harness('c2').isLastVisitedCityTile('c1', '027'), false);
  assert.equal(harness('c2').isLastVisitedCityTile('c2', '001'), true);

  const game = harness('c2');
  game.cycleState.currentTile = '001';
  game.syncDepartedLandmarkMarkers(game.cycleState, '002');
  assert.equal(game.cycleState.tokens.markers['001'].last_city, true);
});

test('非城市格与绿洲 / 白银遗迹的规则不受这条例外影响', () => {
  const notCity = harness('c1');
  notCity.cycleState.currentTile = '026';   // c1:026 不是城市
  notCity.syncDepartedLandmarkMarkers(notCity.cycleState, '027');
  assert.deepEqual(plain(notCity.cycleState.tokens.markers), {});

  const c4 = harness('c4');
  c4.cycleState.currentTile = '006';      // c4:006 是绿洲
  c4.syncDepartedLandmarkMarkers(c4.cycleState, '005');
  assert.equal(c4.cycleState.tokens.markers['006'].last_oasis, true);

  const c5 = harness('c5');
  c5.cycleState.currentTile = '004';      // c5:004 A 面是白银遗迹
  c5.syncDepartedLandmarkMarkers(c5.cycleState, '005');
  assert.equal(c5.cycleState.tokens.markers['004'].last_silver_ruin, true);
});

test('移动标记时旧格上的 last_city 会被清掉', () => {
  const game = harness('c1');
  game.cycleState.tokens.markers['027'] = { last_city: true };
  game.cycleState.currentTile = '017';
  game.syncDepartedLandmarkMarkers(game.cycleState, '016');
  assert.deepEqual(plain(game.cycleState.tokens.markers), { '017': { last_city: true } });
});

test('循环 V 的水下城市与水面城市各自移动最后到访指示物', () => {
  const game = harness('c5');
  game.cycleState.currentTile = '003';
  game.syncDepartedLandmarkMarkers(game.cycleState, '004');
  assert.equal(game.cycleState.tokens.markers['003'].c5_last_visited_underwater_city, true);
  assert.equal(game.cycleState.tokens.markers['003'].last_city, undefined);
  game.cycleState.currentTile = '007';
  game.cycleState.tileVariants = { '007': 'alternate' };
  game.syncDepartedLandmarkMarkers(game.cycleState, '008');
  assert.equal(game.cycleState.tokens.markers['007'].last_city, true);
  assert.equal(game.cycleState.tokens.markers['003'].c5_last_visited_underwater_city, true);
});
