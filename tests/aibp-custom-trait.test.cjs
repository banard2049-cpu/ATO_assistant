const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const CustomTraits = require('../aibp/custom_traits.js');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
function loadFunctions(context, names) {
  for (const name of names) {
    const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
}

function harness() {
  const field = () => ({ value: '', validity: '', setCustomValidity(value) { this.validity = value; } });
  const name = field();
  const content = field();
  const state = { traits: [], hiddenTraits: [], hiddenExtraCards: [], customTraits: [] };
  let inputs = [];
  let options = [];
  let saved;
  let sequence = 0;
  let rendered = 0;
  let closed = 0;
  const context = vm.createContext({
    aibpImageIndex: new Set(),
    currentApostle: 'HEKATON', customTraitEditorApostle: 'HEKATON', customTraitEditingId: '',
    piles: { HEKATON: state, ICARIAN_HARPY: { traits: [], customTraits: [] } },
    traitLevels: ['O', 'I', 'II', 'III', 'X'],
    window: { CustomTraits, crypto: { randomUUID: () => `id-${++sequence}` } },
    customTraitName: name, customTraitContent: content,
    customTraitPreview: {}, customTraitHint: {},
    customTraitForm: { reportValidity: () => !name.validity && !content.validity },
    customTraitDialog: { close() { closed++; } }, traitDialog: { close() { closed++; } },
    traitDialogGrid: { querySelectorAll(selector) {
      return selector.includes('.custom-trait-option') ? options
        : selector.includes(':checked') ? inputs.filter((input) => input.checked) : inputs;
    } },
    appendCustomTraitCandidate(card, checked) {
      const input = { checked, dataset: { customTraitId: card.id } };
      const option = { dataset: { customTraitId: card.id }, querySelector() { return input; },
        replaceWith(next) { options = options.filter((item) => item !== this); } };
      options.push(option);
      return option;
    },
    ensurePiles() {}, renderExtraCards() { rendered++; },
    savePiles() { saved = JSON.parse(JSON.stringify(context.piles)); },
    nietzscheName: 'THE_NIETZSCJEAN', cycleTraitDefinition() { return null; },
    traitSrc: (apostle, level, index, ext) => `ps/${apostle}/${apostle}_TR_${level}_${index}.${ext}`,
  });
  loadFunctions(context, ['traitKey', 'hiddenTraitKeySet', 'hiddenExtraCardKeySet',
    'updateCustomTraitPreview', 'saveCustomTrait', 'saveTraitSelection', 'restoreDefaultTraits',
    'traitCardLabel', 'traitCardSrc', 'isLargeTraitCard', 'publicTraitSnapshot']);
  return { context, name, content, state,
    submit() { context.saveCustomTrait({ preventDefault() {} }); },
    select(values) { inputs = values.map((dataset) => ({ dataset, checked: true })); },
    get saved() { return saved; }, get rendered() { return rendered; }, get closed() { return closed; },
    get options() { return options; } };
}

test('card text safely preserves Chinese, emoji and XML special characters', () => {
  const svg = CustomTraits.svg({ name: '狂怒 🔥 <&"\'>', content: '<script>alert(1)</script>\n下一次攻击 +1' });
  assert.match(svg, /狂怒 🔥/);
  for (const escaped of ['&lt;', '&gt;', '&amp;', '&quot;', '&apos;']) assert.ok(svg.includes(escaped));
  assert.doesNotMatch(svg, /<script/);
  assert.match(svg, /下一次攻击/);
  assert.equal((svg.match(/<svg /g) || []).length, 1);
});

test('wrapping keeps every character, explicit paragraphs and long Latin words', () => {
  const text = '第一段：标记 🔥\n\nSuperLongWeaponName1234567890\n结尾。';
  const lines = CustomTraits.wrap(text, 32, 160);
  assert.ok(lines.includes(''));
  assert.equal(lines.join(''), text.replace(/\n/g, ''));
  assert.equal(lines.filter((line) => line.includes('🔥')).length, 1);
});

test('long rules shrink to fit; excessive paragraph breaks cannot be silently saved', () => {
  const short = CustomTraits.layout({ name: '敏捷', content: '获得1枚标记。' });
  const long = CustomTraits.layout({ name: '敏捷', content: '战斗开始时获得1枚标记，每轮结束时移除该标记。'.repeat(12) });
  assert.ok(long.body.fits);
  assert.ok(long.body.size < short.body.size);
  assert.ok(long.body.lines.length * long.body.lineHeight <= 260);
  const h = harness();
  h.name.value = '过长'; h.content.value = '规则\n'.repeat(100);
  h.submit();
  assert.match(h.content.validity, /卡面放不下/);
  assert.equal(h.state.customTraits.length, 0);
  assert.equal(h.closed, 0);
});

test('Chinese punctuation stays with text instead of starting a wrapped line', () => {
  const text = '一二三四五。下一次攻击（命中）。';
  const lines = CustomTraits.wrap(text, 32, 160);
  assert.equal(lines.join(''), text);
  assert.ok(lines.every((line) => !/^[。）（]/.test(line) && !/[（]$/.test(line)));
});

test('adding trims input, persists editable text and auto-checks a new candidate', () => {
  const h = harness();
  h.name.value = '  敏捷  '; h.content.value = '  每轮开始时：获得+1命中。\n第二段。  ';
  h.submit();
  assert.equal(h.state.customTraits.length, 1);
  assert.equal(h.state.customTraits[0].name, '敏捷');
  assert.equal(h.state.customTraits[0].content, '每轮开始时：获得+1命中。\n第二段。');
  assert.equal(h.options[0].querySelector('input').checked, true);
  assert.equal(h.saved.HEKATON.customTraits[0].name, '敏捷');
  assert.doesNotMatch(JSON.stringify(h.saved), /data:image/);
  assert.equal(h.closed, 1);
});

test('blank input does not create a trait', () => {
  const h = harness();
  h.name.value = '   '; h.content.value = '   ';
  h.submit();
  assert.equal(h.state.customTraits.length, 0);
  assert.equal(h.closed, 0);
  assert.match(h.name.validity, /请输入/);
});

test('saving selection keeps both custom traits with the same name and ordinary cards', () => {
  const h = harness();
  h.name.value = '同名'; h.content.value = '第一张'; h.submit();
  h.content.value = '第二张'; h.submit();
  const [a, b] = h.state.customTraits;
  assert.notEqual(a.id, b.id);
  h.select([{ customTraitId: a.id }, { customTraitId: b.id }, { level: 'I', index: '3', ext: 'jpg', scope: '' }]);
  h.context.saveTraitSelection();
  assert.equal(h.state.traits.length, 3);
  assert.equal(h.state.traits.filter((card) => card.scope === 'custom').length, 2);
  assert.equal(h.state.traits.find((card) => card.level === 'I').index, 3);
  assert.equal(h.context.isLargeTraitCard('HEKATON', a), false);
  const reloaded = JSON.parse(JSON.stringify(h.saved.HEKATON));
  assert.equal(reloaded.traits.find((card) => card.id === b.id).content, '第二张');
});

test('editing preserves identity and unsaved checkbox choice and updates an active card', () => {
  const h = harness();
  h.name.value = '敏捷'; h.content.value = '原规则'; h.submit();
  const original = h.state.customTraits[0];
  h.state.traits = [{ ...original }];
  h.options[0].querySelector('input').checked = false;
  h.context.customTraitEditingId = original.id;
  h.name.value = '迅捷'; h.content.value = '修改后的规则'; h.submit();
  assert.equal(h.state.customTraits.length, 1);
  assert.equal(h.state.traits[0].id, original.id);
  assert.equal(h.state.traits[0].name, '迅捷');
  assert.equal(h.state.traits[0].content, '修改后的规则');
  assert.equal(h.options[0].querySelector('input').checked, false);
  assert.equal(h.options.length, 1);
});

test('restoring defaults removes displayed selections while keeping reusable custom traits', () => {
  const h = harness();
  h.name.value = '敏捷'; h.content.value = '规则'; h.submit();
  h.select([{ customTraitId: h.state.customTraits[0].id }]);
  h.context.saveTraitSelection();
  assert.equal(h.state.traits.length, 1);
  h.context.restoreDefaultTraits();
  h.context.saveTraitSelection();
  assert.equal(h.state.traits.length, 0);
  assert.equal(h.state.customTraits.length, 1);
});

test('custom trait edits cannot leak into another apostle', () => {
  const h = harness();
  h.name.value = '敏捷'; h.content.value = '规则';
  h.context.currentApostle = 'ICARIAN_HARPY';
  h.submit();
  assert.equal(h.state.customTraits.length, 0);
  assert.equal(h.context.piles.ICARIAN_HARPY.customTraits.length, 0);
});

test('LAN HTTP clients can add cards without crypto.randomUUID', () => {
  const h = harness();
  h.context.window.crypto = {};
  h.name.value = '敏捷'; h.content.value = '规则'; h.submit();
  assert.match(h.state.customTraits[0].id, /^custom-trait-.+-.+$/);
});

test('second-screen snapshots carry text without duplicating background bytes', () => {
  const h = harness();
  const card = { type: 'TR', scope: 'custom', id: 'card-1', name: '敏捷', content: '每轮+1。' };
  const snapshot = h.context.publicTraitSnapshot('HEKATON', card);
  assert.equal(snapshot.customTrait.name, '敏捷');
  assert.equal(snapshot.customTrait.content, '每轮+1。');
  assert.ok(snapshot.src.startsWith('data:image/svg+xml'));
  assert.ok(JSON.stringify(snapshot).length < 10000);
  assert.equal(snapshot.large, false);
  assert.match(h.context.traitCardSrc('HEKATON', card), /^data:image\/svg\+xml/);
});

test('the second screen renders custom text on the template alongside ordinary card images', () => {
  const ssSource = fs.readFileSync(path.join(__dirname, '../ss/app.js'), 'utf8').replace(/\r\n/g, '\n');
  const match = ssSource.match(/^function renderImageList\([^]*?^}/m);
  assert.ok(match);
  const children = [];
  const context = vm.createContext({
    window: { CustomTraits }, document: { createElement() { return {}; } },
    aibpImageUrl: (src) => `/aibp/${src}`,
  });
  vm.runInContext(match[0], context);
  context.renderImageList({ replaceChildren() { children.length = 0; }, appendChild(child) { children.push(child); } }, [
    { label: '自定义特性 · 敏捷', src: '', customTrait: { name: '敏捷', content: '下一次攻击 +1。' } },
    { label: 'TR I 1', src: 'ps/HEKATON/HEKATON_TR_I_001.jpg' },
  ], '暂无特性');
  assert.equal(children.length, 2);
  const svg = decodeURIComponent(children[0].src.split(',')[1]);
  assert.match(svg, /敏捷/);
  assert.match(svg, /下一次攻击/);
  assert.equal(children[1].src, '/aibp/ps/HEKATON/HEKATON_TR_I_001.jpg');
});
