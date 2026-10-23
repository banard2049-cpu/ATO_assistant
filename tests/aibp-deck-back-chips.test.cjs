const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
function fn(name) {
  const match = source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}

function harness({ detailed = true } = {}) {
  const context = vm.createContext({
    viewDeckOrderToggle: { checked: detailed },
    cardBackDisplayLevel: (card) => card.level,
    deckBackCompositionText: (cards) => `组成 ${cards.length}`,
  });
  vm.runInContext(fn('renderDeckBackInfo'), context);
  return context;
}

function container() {
  return { textContent: '', innerHTML: '' };
}

test('deck back info renders one chip per card without dash separators', () => {
  const context = harness();
  const target = container();
  context.renderDeckBackInfo(target, [{ level: 'I' }, { level: 'II' }, { level: 'X' }]);

  assert.equal(target.textContent, '');
  assert.match(target.innerHTML, /^<span class="deck-back-chips"/);
  assert.equal((target.innerHTML.match(/class="deck-back-chip"/g) || []).length, 2);
  assert.equal((target.innerHTML.match(/class="deck-back-chip is-top"/g) || []).length, 1);
  assert.equal((target.innerHTML.match(/class="deck-back-chip-text"/g) || []).length, 3);
  assert.match(target.innerHTML, />I<\/span>/);
  assert.match(target.innerHTML, />II<\/span>/);
  assert.match(target.innerHTML, />X<\/span>/);
  assert.doesNotMatch(target.innerHTML, /I-I/);
});

test('deck back info marks only the first card as the top of the pile', () => {
  const context = harness();
  const target = container();
  context.renderDeckBackInfo(target, [{ level: 'I' }, { level: 'I' }]);
  const chips = target.innerHTML.match(/<span class="deck-back-chip(?: is-top)?">/g);
  assert.deepEqual(chips, ['<span class="deck-back-chip is-top">', '<span class="deck-back-chip">']);
});

test('empty deck and composition mode keep the previous wording', () => {
  const context = harness();
  const empty = container();
  context.renderDeckBackInfo(empty, []);
  assert.equal(empty.innerHTML, '');
  assert.equal(empty.textContent, '空');

  const composition = harness({ detailed: false });
  const target = container();
  composition.renderDeckBackInfo(target, [{ level: 'I' }, { level: 'I' }]);
  assert.equal(target.innerHTML, '');
  assert.equal(target.textContent, '组成 2');
});
