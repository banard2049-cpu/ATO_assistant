const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'map/index.html'), 'utf8');

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

function harness() {
  return new Function(`
    const state = { activeCycleId: 'c5' };
    const cycleState = {
      currentTile: 'A', explored: { A: true, E: true },
      titanXTrackPosition: null, tokens: { AG: 'A', AD: '' },
    };
    const cycle = { tiles: [
      { id: 'A', label: 'A', neighbors: { left: 'U', right: 'E' } },
      { id: 'U', label: 'U', neighbors: { right: 'A' } },
      { id: 'E', label: 'E', neighbors: { left: 'A' } },
    ] };
    const alerts = [];
    const window = { alert: (message) => alerts.push(message) };
    let undoCount = 0;
    let saveCount = 0;
    function activeCycleState() { return cycleState; }
    function activeCycle() { return cycle; }
    function argoTileId(saved) { return saved.currentTile || saved.tokens.AG; }
    function effectiveTile(tile) { return tile; }
    function clearPendingAdversarySpawn() {}
    function pushUndo() { undoCount += 1; }
    function saveState() { saveCount += 1; }
    function render() {}
    ${extractFunction('normalizeTitanXTrackPosition')}
    ${extractFunction('titanXAdjacentTileCandidates')}
    ${extractFunction('setTitanXTrackPosition')}
    ${extractFunction('spawnAdversary')}
    ${extractFunction('moveAdversary')}
    return {
      state, cycleState, alerts, spawnAdversary, moveAdversary,
      setTitanXTrackPosition, normalizeTitanXTrackPosition,
      undoCount: () => undoCount, saveCount: () => saveCount,
    };
  `)();
}

test('Cycle V map exposes a separate seven-space Titan X track', () => {
  assert.match(page, /id="titanXTrack"/);
  assert.match(page, /id="titanXRetreatButton"/);
  assert.match(source, /for \(let space = 1; space <= 7; space \+= 1\)/);
});

test('spawn starts at seven; crossing six and three places the model; retreat never places it', () => {
  const game = harness();
  game.spawnAdversary();
  assert.equal(game.cycleState.titanXTrackPosition, 7);
  assert.equal(game.cycleState.tokens.AD, '');
  game.moveAdversary();
  assert.equal(game.cycleState.titanXTrackPosition, 6);
  assert.equal(game.cycleState.tokens.AD, 'U');
  assert.match(game.alerts[0], /经过 6/);

  game.cycleState.tokens.AD = 'E';
  game.setTitanXTrackPosition(7);
  assert.equal(game.cycleState.tokens.AD, 'E');
  assert.equal(game.alerts.length, 1);
  game.setTitanXTrackPosition(3);
  assert.equal(game.cycleState.tokens.AD, 'U');
  assert.match(game.alerts[1], /经过 6/);
  assert.match(game.alerts[1], /经过 3/);
  assert.equal(game.undoCount(), 4);
  assert.equal(game.saveCount(), 4);
});

test('track positions normalize safely, including a legacy saved adversary', () => {
  const game = harness();
  assert.equal(game.normalizeTitanXTrackPosition(undefined, true), 7);
  assert.equal(game.normalizeTitanXTrackPosition(undefined), null);
  assert.equal(game.normalizeTitanXTrackPosition(0), null);
  assert.equal(game.normalizeTitanXTrackPosition(8), null);
  assert.equal(game.normalizeTitanXTrackPosition('3'), 3);
});
