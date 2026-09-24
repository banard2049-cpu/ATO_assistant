const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

function mapHarness(cycleId = 'c5') {
  return new Function(`
    const state = { activeCycleId: '${cycleId}', selectedToken: 'AG' };
    const cycleState = {
      currentTile: 'A', latestRevealedTile: '', explored: { A: true },
      previewRevealed: {}, tileVariants: {},
      tokens: { AG: 'A', AD: '', hsCount: 0, markers: {}, edgeMarkers: {} },
    };
    const tokenAssetById = {};
    let undoCount = 0;
    function activeCycleState() { return cycleState; }
    function argoTileId(saved) { return saved.currentTile || saved.tokens.AG || ''; }
    function clearPendingAdversarySpawn() {}
    function pushUndo() { undoCount += 1; }
    function syncDepartedLandmarkMarkers() {}
    function triggerAdversaryBattle() { throw new Error('Unexpected battle'); }
    function saveState() {}
    function focusArgoAfterNextRender() {}
    function render() {}
    ${extractFunction(mapSource, 'markTileExplored')}
    ${extractFunction(mapSource, 'inheritCycleFiveTileFace')}
    ${extractFunction(mapSource, 'setCurrentTile')}
    ${extractFunction(mapSource, 'placeToken')}
    return { state, cycleState, setCurrentTile, placeToken, undoCount: () => undoCount };
  `)();
}

test('map movement reveals a new Cycle V tile on the departing tile face', () => {
  const game = mapHarness();
  game.cycleState.tileVariants.A = 'alternate';
  game.setCurrentTile('B');
  assert.equal(game.cycleState.tileVariants.B, 'alternate');
  assert.equal(game.cycleState.explored.B, true);
  assert.equal(game.cycleState.latestRevealedTile, 'B');
  assert.equal(game.undoCount(), 1);

  game.cycleState.tileVariants.C = 'alternate';
  delete game.cycleState.tileVariants.B;
  game.setCurrentTile('C');
  assert.equal(game.cycleState.tileVariants.C, undefined);
});

test('AG icon movement applies the same rule and revisiting keeps the destination face', () => {
  const game = mapHarness();
  game.cycleState.tileVariants.A = 'alternate';
  game.placeToken('B');
  assert.equal(game.cycleState.tileVariants.B, 'alternate');
  delete game.cycleState.tileVariants.B;
  game.placeToken('A');
  assert.equal(game.cycleState.tileVariants.A, 'alternate');
  game.placeToken('B');
  assert.equal(game.cycleState.tileVariants.B, undefined);
});

test('other cycles do not inherit Cycle V tile faces', () => {
  const game = mapHarness('c4');
  game.cycleState.tileVariants.A = 'alternate';
  game.setCurrentTile('B');
  assert.equal(game.cycleState.tileVariants.B, undefined);
});

test('dashboard direction command inherits before changing the current tile', () => {
  const helper = new Function(`return (${extractFunction(dashboardSource, 'inheritCycleFiveMapCommandFace')});`)();
  const saved = { currentTile: 'A', explored: { A: true }, tileVariants: { A: 'alternate' }, tokens: { AG: 'A' } };
  helper(saved, 'B');
  assert.equal(saved.tileVariants.B, 'alternate');
  saved.explored.B = true;
  delete saved.tileVariants.A;
  helper(saved, 'B');
  assert.equal(saved.tileVariants.B, 'alternate');
  assert.match(dashboardSource, /if \(cycleId === "c5"\) inheritCycleFiveMapCommandFace\(cycleState, targetId\);\s*cycleState\.currentTile = targetId;/);
});
