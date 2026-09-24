const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'map', 'app.js'), 'utf8');
for (const id of ['c5_nemesis', 'c5_black_beak', 'c5_ae_siren']) {
  assert.match(source, new RegExp(`\\{ id: "${id}"[^\\n]*unique: true \\}`));
}

function extractFunction(name) {
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
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

function createHarness() {
  return new Function(`
    const tokenAssetById = {
      c5_nemesis: { unique: true },
      c5_black_beak: { unique: true },
      c5_last_visited_underwater_city: { unique: true },
      c5_ae_siren: { unique: true },
      c5_ruin: { unique: false },
    };
    const state = { selectedToken: 'c5_nemesis', activeCycleId: 'c5' };
    const cycleState = { currentTile: '', tokens: { AG: '', AD: '', hsCount: 0, markers: {}, edgeMarkers: {} } };
    let undoCount = 0;
    function isPlainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
    function clearPendingAdversarySpawn() {}
    function activeCycleState() { return cycleState; }
    function pushUndo() { undoCount += 1; }
    function saveState() {}
    function render() {}
    ${extractFunction('normalizeMarkers')}
    ${extractFunction('removeMarkerEverywhere')}
    ${extractFunction('placeToken')}
    return { state, cycleState, placeToken, normalizeMarkers, undoCount: () => undoCount };
  `)();
}

test('Cycle V Nemesis and Black Beak each move to their new tile independently', () => {
  const game = createHarness();
  game.placeToken('A');
  game.placeToken('B');
  assert.equal(game.cycleState.tokens.markers.A, undefined);
  assert.equal(game.cycleState.tokens.markers.B.c5_nemesis, true);

  game.state.selectedToken = 'c5_black_beak';
  game.placeToken('A');
  game.placeToken('C');
  assert.equal(game.cycleState.tokens.markers.A, undefined);
  assert.equal(game.cycleState.tokens.markers.B.c5_nemesis, true);
  assert.equal(game.cycleState.tokens.markers.C.c5_black_beak, true);

  game.state.selectedToken = 'c5_nemesis';
  game.placeToken('B');
  assert.equal(game.cycleState.tokens.markers.B, undefined);
  assert.equal(game.cycleState.tokens.markers.C.c5_black_beak, true);
  assert.equal(game.undoCount(), 5);
});

test('Cycle V Ae-Siren keeps a single placement and dedupes on load', () => {
  const game = createHarness();
  game.state.selectedToken = 'c5_ae_siren';
  game.placeToken('A');
  assert.equal(game.cycleState.tokens.markers.A.c5_ae_siren, true);

  game.placeToken('D');
  assert.equal(game.cycleState.tokens.markers.A, undefined);
  assert.equal(game.cycleState.tokens.markers.D.c5_ae_siren, true);

  game.placeToken('D');
  assert.equal(game.cycleState.tokens.markers.D, undefined);

  const normalized = game.normalizeMarkers({
    A: { c5_ae_siren: true, c5_ruin: true },
    B: { c5_ae_siren: true, c5_ruin: true },
  });
  assert.equal(normalized.A.c5_ae_siren, true);
  assert.equal(normalized.B.c5_ae_siren, undefined);
  assert.equal(normalized.B.c5_ruin, true);
});

test('old duplicate unique markers collapse on load while stackable markers remain', () => {
  const game = createHarness();
  const normalized = game.normalizeMarkers({
    A: { c5_nemesis: true, c5_ruin: true },
    B: { c5_nemesis: true, c5_black_beak: true, c5_ruin: true },
    C: { c5_black_beak: true, c5_ruin: true },
  });
  assert.equal(normalized.A.c5_nemesis, true);
  assert.equal(normalized.B.c5_nemesis, undefined);
  assert.equal(normalized.B.c5_black_beak, true);
  assert.equal(normalized.C.c5_black_beak, undefined);
  assert.equal(normalized.C.c5_ruin, true);
});
