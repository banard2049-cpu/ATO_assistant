const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../map/app.js'), 'utf8');
const lookupSource = source.slice(source.indexOf('function tileMatchesQuery('), source.indexOf('function clearCycleExplored()'));

function harness() {
  const cycleState = { explored: { '001': true }, previewRevealed: {} };
  const calls = { saves: 0, renders: 0, undo: 0, alerts: [], scrolled: [] };
  const tiles = [{ id: '001', label: '001', source: 'T03' }, { id: 'T03', label: 'T03' }];
  const context = vm.createContext({
    state: { query: '' },
    elements: {
      searchInput: { value: '' },
      tileGrid: {
        querySelectorAll: () => tiles.map(({ id }) => ({ dataset: { id }, scrollIntoView: () => calls.scrolled.push(id) })),
      },
    },
    activeCycle: () => ({ tiles }),
    activeCycleState: () => cycleState,
    shouldFocusArgoAfterRender: true,
    focusArgoAttempts: 0,
    argoFocusGeneration: 0,
    clearPendingAdversarySpawn() {},
    pushUndo: () => { calls.undo += 1; },
    saveState: () => { calls.saves += 1; },
    renderTiles: () => { calls.renders += 1; },
    render: () => { calls.renders += 1; },
    window: { alert: message => calls.alerts.push(message) },
  });
  vm.runInContext(lookupSource, context);
  return { context, cycleState, calls };
}

test('search applies and clears a filter without revealing tiles', () => {
  const { context, cycleState, calls } = harness();
  context.elements.searchInput.value = 'T03';
  context.searchTilesById();
  assert.equal(context.state.query, 'T03');
  assert.deepEqual(cycleState.previewRevealed, {});
  assert.deepEqual(calls.scrolled, ['T03']);
  context.elements.searchInput.value = '';
  context.searchTilesById();
  assert.equal(context.state.query, '');
  assert.equal(calls.undo, 0);
  assert.equal(calls.renders, 2);
});

test('emptying the search box exits the active search state', () => {
  const { context, calls } = harness();
  context.state.query = 'T03';
  context.elements.searchInput.value = 'T03';
  context.clearSearchWhenInputEmpty();
  assert.equal(context.state.query, 'T03');
  assert.equal(calls.saves, 0);
  assert.equal(calls.renders, 0);

  context.elements.searchInput.value = '';
  context.clearSearchWhenInputEmpty();
  assert.equal(context.state.query, '');
  assert.equal(context.elements.searchInput.value, '');
  assert.equal(calls.saves, 1);
  assert.equal(calls.renders, 1);
});

test('reveal uses the shared input and clears a previous search without marking explored', () => {
  const { context, cycleState, calls } = harness();
  context.state.query = '001';
  context.elements.searchInput.value = ' t03 ';
  context.revealTilePreviewById();
  assert.equal(cycleState.previewRevealed.T03, true);
  assert.equal(cycleState.explored.T03, undefined);
  assert.equal(context.state.query, '');
  assert.equal(context.elements.searchInput.value, '');
  assert.equal(calls.undo, 1);
  assert.equal(calls.saves, 1);
  assert.equal(calls.renders, 1);
  assert.deepEqual(calls.scrolled, ['T03']);
});

test('invalid IDs preserve the input and existing search', () => {
  for (const value of ['', '999']) {
    const { context, cycleState, calls } = harness();
    context.state.query = 'T03';
    context.elements.searchInput.value = value;
    context.revealTilePreviewById();
    assert.equal(context.state.query, 'T03');
    assert.equal(context.elements.searchInput.value, value);
    assert.deepEqual(cycleState.previewRevealed, {});
    assert.equal(calls.saves, 0);
    assert.equal(calls.undo, 0);
    assert.equal(calls.alerts.length, 1);
    assert.deepEqual(calls.scrolled, []);
  }
});

test('revealing an explored ID locates it without changing exploration state', () => {
  const { context, cycleState, calls } = harness();
  context.state.query = 'T03';
  context.elements.searchInput.value = '001';
  context.revealTilePreviewById();
  assert.equal(context.state.query, '');
  assert.deepEqual(cycleState.previewRevealed, {});
  assert.deepEqual(cycleState.explored, { '001': true });
  assert.equal(calls.undo, 0);
  assert.deepEqual(calls.scrolled, ['001']);
});

test('Cycle V reveal buttons choose underwater or surface and preserve exploration state', () => {
  const { context, cycleState, calls } = harness();
  context.state.activeCycleId = 'c5';
  for (const face of ['surface', 'underwater']) {
    context.elements.searchInput.value = 'T03';
    context.revealTilePreviewById(face);
    assert.equal(cycleState.tileVariants.T03, face === 'surface' ? 'alternate' : undefined);
    assert.equal(cycleState.previewRevealed.T03, true);
    assert.equal(cycleState.explored.T03, undefined);
    assert.equal(context.elements.searchInput.value, '');
  }
  assert.equal(calls.undo, 2);
  assert.equal(calls.saves, 2);

  context.elements.searchInput.value = '001';
  context.revealTilePreviewById('surface');
  assert.equal(cycleState.tileVariants['001'], undefined);
  assert.equal(calls.undo, 2);
});

test('explicit reveal face leaves other cycles unchanged', () => {
  const { context, cycleState } = harness();
  context.state.activeCycleId = 'c4';
  context.elements.searchInput.value = 'T03';
  context.revealTilePreviewById('surface');
  assert.equal(cycleState.tileVariants, undefined);
  assert.equal(cycleState.previewRevealed.T03, true);
});
