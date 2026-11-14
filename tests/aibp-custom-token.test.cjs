const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const secondScreenSource = fs.readFileSync(path.join(__dirname, '../ss/app.js'), 'utf8').replace(/\r\n/g, '\n');
function loadFunctions(context, names) {
  for (const name of names) {
    const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
}

function harness() {
  let sequence = 0;
  let saved;
  let rendered = 0;
  let synchronized = 0;
  const input = {
    value: '', validity: '',
    setCustomValidity(value) { this.validity = value; },
    reportValidity() {}, focus() {},
  };
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const context = vm.createContext({
    theatreRequest: null, theatreBattle: null,
    currentApostle: 'HEKATON', piles: { HEKATON: { tokens: [] } },
    nonStackingTokenFiles: new Set(), storageKey: 'test-piles', undoStacks: {}, activeScry: null,
    ensurePiles() {}, createTokenStackId: () => `custom-${++sequence}`,
    customTokenText: input, customTokenDialog: dialog,
    localStorage: { setItem(_key, value) { saved = value; } },
    captureUndoEffects() {}, scheduleSecondScreenSnapshot() { synchronized++; },
    renderPanelTokens() { rendered++; },
  });
  loadFunctions(context, ['addCustomPanelToken', 'customTokenSrc', 'openCustomTokenDialog',
    'saveCustomToken', 'savePiles', 'clampTokenCount', 'isPlainObject', 'isCriticalMassStack',
    'isPerHitTokenStack', 'tokenMergeKey', 'tokenMergeKeyForItem', 'normalizeTokenStacks']);
  return { context, input, dialog, saved: () => JSON.parse(saved), rendered: () => rendered, synchronized: () => synchronized };
}

test('wish-condition AT reminder stays separate from ordinary AT token stacks', () => {
  const { context } = harness();
  const tokens = context.normalizeTokenStacks([
    { id: 'wish-at', file: 'AT+.png', count: 1, demidjinnWishArmor: true, label: '愿望状态数' },
    { id: 'normal-at', file: 'AT+.png', count: 2 },
    { id: 'level-at', file: 'AT+.png', count: 3 },
  ]);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].label, '愿望状态数');
  assert.equal(tokens[0].count, 1);
  assert.equal(tokens[1].count, 5);
});

test('custom tokens trim whitespace, reject empty input, and keep separate identities', () => {
  const { context } = harness();
  assert.equal(context.addCustomPanelToken(' \n '), null);
  const first = context.addCustomPanelToken('  中毒  ');
  const second = context.addCustomPanelToken('中毒');
  assert.equal(first.text, '中毒');
  assert.equal(first.count, 1);
  assert.equal(first.file, '');
  assert.notEqual(first.id, second.id);
  assert.equal(context.piles.HEKATON.tokens.length, 2);
});

test('submitting saves custom token text and triggers panel rendering and second-screen sync', () => {
  const h = harness();
  h.context.openCustomTokenDialog();
  assert.equal(h.dialog.open, true);
  h.input.value = '  蓄力\n下回合 +1  ';
  let prevented = false;
  h.context.saveCustomToken({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.dialog.open, false);
  assert.equal(h.saved().HEKATON.tokens[0].text, '蓄力\n下回合 +1');
  assert.equal(h.rendered(), 1);
  assert.equal(h.synchronized(), 1);
});

test('blank submission leaves the dialog open and adds no token', () => {
  const h = harness();
  h.context.openCustomTokenDialog();
  h.input.value = '   ';
  h.context.saveCustomToken({ preventDefault() {} });
  assert.equal(h.dialog.open, true);
  assert.equal(h.context.piles.HEKATON.tokens.length, 0);
  assert.equal(h.rendered(), 0);
  assert.ok(h.input.validity);
});

test('reload normalization preserves each custom token, count, and dragged position', () => {
  const { context } = harness();
  const first = context.addCustomPanelToken('中毒');
  first.count = 3;
  first.x = 72;
  first.y = 48;
  context.addCustomPanelToken('蓄力');
  context.piles.HEKATON.tokens.push({ id: 'image', file: 'DA+.png', count: 2 });
  const reloaded = JSON.parse(JSON.stringify(context.piles.HEKATON.tokens));
  const normalized = JSON.parse(JSON.stringify(context.normalizeTokenStacks(reloaded)));
  assert.deepEqual(normalized, reloaded);
});

test('custom SVG displays Unicode and special characters as text, with no injected elements', () => {
  const { context } = harness();
  const svg = decodeURIComponent(context.customTokenSrc('中毒 🔥\n<>&"\'').split(',')[1]);
  assert.match(svg, /中毒 🔥/);
  for (const escaped of ['&lt;', '&gt;', '&amp;', '&quot;', '&apos;']) assert.ok(svg.includes(escaped));
  assert.equal((svg.match(/<svg /g) || []).length, 1);
  assert.doesNotMatch(decodeURIComponent(context.customTokenSrc('<script>alert(1)</script>').split(',')[1]), /<script/);
});

test('second screen renders both custom and image tokens, including quantity badges', () => {
  function element() {
    return {
      children: [], style: {}, classes: new Set(),
      classList: { toggle() {} },
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
    };
  }
  const layer = element();
  const context = vm.createContext({
    elements: { bossTokens: layer }, document: { createElement: element },
    aibpImageUrl: (value) => `/aibp/${value}`,
  });
  const match = secondScreenSource.match(/^function renderBossTokens\([^]*?^}/m);
  assert.ok(match);
  vm.runInContext(match[0], context);
  const src = harness().context.customTokenSrc('中毒');
  context.renderBossTokens([
    { file: '', text: '中毒', src, count: 3, x: 40, y: 60 },
    { file: 'DA+.png', count: 1, x: 50, y: 50 },
    { file: 'AT+.png', count: 1, label: '愿望状态数', x: 24, y: 8 },
  ]);
  assert.equal(layer.children.length, 3);
  assert.equal(layer.children[0].children[0].src, src);
  assert.equal(layer.children[0].children[0].alt, '中毒');
  assert.equal(layer.children[0].children[1].textContent, '×3');
  assert.equal(layer.children[1].children[0].src, '/aibp/ps/other/token/DA+.png');
  assert.equal(layer.children[2].children[1].className, 'token-condition-label');
  assert.equal(layer.children[2].children[1].textContent, '愿望状态数');
});
