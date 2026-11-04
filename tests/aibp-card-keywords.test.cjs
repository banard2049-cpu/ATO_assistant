const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const model = require('../aibp/keyword-dictionary.js');
const code = fs.readFileSync(path.join(__dirname, '../aibp/card-keywords.js'), 'utf8');

test('recovered card rules resolve to real bilingual entries, including manually corrected short effects', () => {
  const records = JSON.parse(fs.readFileSync(path.join(__dirname, '../aibp/ato-keywords.json'), 'utf8')).entries;
  const dictionary = model.build(records, html => ({ text: html, headings: [...html.matchAll(/<font size="\+2">(.*?)<\/font>/g)].map(match => match[1].replace(/<[^>]*>/g, '')) }));
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, '../aibp/card-keywords.json'), 'utf8'));
  for (const words of Object.values(index.cards)) words.forEach(word => assert.ok(dictionary.entryFor(word), word));
  for (const [src, keyword] of [
    ['ps/ALPHA_TEMENOS/ALPHA_TEMENOS_AI_I_003.jpg', 'Knockdown'],
    ['ps/CYCLONUS/CYCLONUS_AI_I_001.jpg', 'Pushback'],
    ['ps/HEKATON/HEKATON_BP_I_005.jpg', 'Knockdown'],
    ['ps/HERMESIAN_PURSUER/HERMESIAN_PURSUER_BP_I_003.jpg', 'Knockdown'],
    ['ps/LABYRINTHAUROS/LABYRINTHAUROS_BP_II_001.jpg', 'Trample'],
    ['ps/CYCLONUS/CYCLONUS_BP_II_006.jpg', 'Escalate'],
  ]) {
    const found = dictionary.unique(index.cards[src]);
    assert.ok(found.includes(dictionary.entryFor(keyword)), `${src}: ${keyword}`);
  }
  assert.equal(index.coverage.aibpFrontOcrPasses, 3);
  assert.equal(index.coverage.noMatchRuleRegionsVisuallyReviewed, 106);
});

test('reopening AI/BP cards uses the full image path and retains keyword lookup', () => {
  const html = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8');
  const fn = html.match(/^    function openZoomForImage\([^]*?^    }/m)[0];
  const calls = [];
  const context = {
    currentApostle: 'HEKATON', chimeraName: 'CHIMERA_METASTASIOS',
    window: { AibpCardKeywords: { showDraw: src => calls.push(['keywords', src]) } },
    shouldZoomImage: () => true, hasAiCombo: () => false, currentPanelCardTokens: () => [],
    zoomCardTokenTypeFromImage: () => 'AI', openImageZoom: src => calls.push(['zoom', src]),
    flipContextFromImage() {}, moveContextFromImage() {}, tokenContextFromImage() {},
    currentAiNoticeImages: () => [], currentBpNoticeImages: () => [],
  };
  vm.runInNewContext(fn, context);
  const image = {
    dataset: { fullSrc: 'ps/CYCLONUS/CYCLONUS_AI_I_001.jpg' }, src: 'preview.jpg',
    classList: { contains: () => false },
    closest: selector => selector.includes('#aiGrid') ? {} : null,
  };
  context.openZoomForImage(image);
  assert.deepEqual(calls, [['zoom', image.dataset.fullSrc], ['keywords', image.dataset.fullSrc]]);
  calls.length = 0;
  image.dataset.drawBackPreview = '1';
  context.openZoomForImage(image);
  assert.deepEqual(calls, [['zoom', image.dataset.fullSrc]], 'drawing-back previews keep their existing behavior');
});

test('both-language OCR hits share one persistent and drawn entry, with missing scans explicit', async () => {
  class Element {
    constructor() { this.children = []; this.textContent = ''; this.dataset = {}; this.attributes = {}; this.handlers = {}; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => true }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren() { this.children = []; this.textContent = ''; }
    addEventListener(name, cb) { this.handlers[name] = cb; }
    getAttribute(name) { return this.attributes[name]; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector() { return null; }
  }
  const dictionary = model.build([{ word: 'Ambrosia', definition: '' }, { word: '神浆', definition: '' }], () => ({ headings: ['Ambrosia:', '神浆:'], text: 'Bilingual definition' }));
  const ids = Object.fromEntries(['cardKeywordsSummary', 'panelWrap', 'extraGrid', 'imageZoomKeywords', 'imageZoomOverlay', 'imageZoomImg'].map(id => [id, new Element()]));
  ids.panelWrap.querySelectorAll = () => [{ dataset: { fullSrc: 'ps/BOSS/PANEL.jpg' } }];
  ids.extraGrid.querySelectorAll = () => [{ dataset: { fullSrc: 'ps/BOSS/MISSING.jpg' } }];
  ids.imageZoomImg.attributes.src = 'ps/HERMESIAN/AI.jpg';
  ids.imageZoomKeywords.parentElement = new Element();
  const doc = { currentScript: { src: 'https://example.test/aibp/card-keywords.js' }, getElementById: id => ids[id], createElement: () => new Element() };
  const window = { AibpKeywords: { load: async () => dictionary, renderEntry(entry) { const node = new Element(); node.textContent = entry.title; return node; } } };
  vm.runInNewContext(code, { document: doc, window, URL, MutationObserver: class { observe() {} }, fetch: async () => ({ ok: true, json: async () => ({ cards: { 'ps/BOSS/PANEL.jpg': ['Ambrosia', '神浆'], 'ps/HERMESIAN/AI.jpg': ['神浆', 'Ambrosia'] } }) }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ids.cardKeywordsSummary.children[0].children.length, 1);
  assert.equal(ids.cardKeywordsSummary.children[0].children[0].textContent, '神浆 / Ambrosia');
  assert.match(ids.cardKeywordsSummary.children[1].textContent, /1 张当前卡面未扫描/);
  window.AibpCardKeywords.showDraw('ps/HERMESIAN/AI.jpg');
  await new Promise(resolve => setImmediate(resolve));
  const drawn = ids.imageZoomKeywords.children[0].children[1].children[0];
  assert.equal(ids.imageZoomKeywords.hidden, false);
  assert.equal(drawn.children.length, 1);
  assert.equal(drawn.children[0].textContent, '神浆 / Ambrosia');
  ids.imageZoomImg.attributes.src = 'ps/BOSS/MISSING.jpg';
  window.AibpCardKeywords.showDraw('ps/BOSS/MISSING.jpg');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ids.imageZoomKeywords.children.at(-1).children[1].textContent, /尚未扫描/);
  let stopped = false;
  ids.imageZoomKeywords.handlers.click({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'expanding keywords must not close the card zoom');
  window.AibpCardKeywords.resetDraw();
  assert.equal(ids.imageZoomKeywords.hidden, true);
  assert.equal(ids.imageZoomKeywords.children.length, 0);
});
