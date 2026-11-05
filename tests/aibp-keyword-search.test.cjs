const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const model = require('../aibp/keyword-dictionary.js');
const code = fs.readFileSync(path.join(__dirname, '../aibp/keyword-search.js'), 'utf8');
const strip = text => text.replace(/<[^>]*>/g, '');
function parseDefinition(html) {
  return { text: strip(html), headings: [...html.matchAll(/<font size="\+2">(.*?)<\/font>/g)].map(match => strip(match[1])) };
}
const records = [
  { word: 'Attack', definition: '<font size="+2">Attack:</font><br>Deal damage<hr><font size="+2">攻击:</font><br>造成伤害' },
  { word: '攻击', definition: '<font size="+2">攻击:</font><br>造成伤害<hr><font size="+2">Attack:</font><br>Deal damage' },
  { word: 'Move', definition: '<font size="+2">Move:</font><br>移动' },
];
function harness(fetcher) {
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.handlers = {}; this.value = ''; this.textContent = ''; this.dataset = {};
      this.classList = { add: name => { this.className = [this.className, name].filter(Boolean).join(' '); } };
    }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    addEventListener(name, cb) { this.handlers[name] = cb; }
    append(...nodes) { nodes.forEach(node => { node.parentElement = this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.textContent = ''; this.append(...nodes); }
    matches(selector) { return selector[0] === '.' ? (this.className || '').split(' ').includes(selector.slice(1)) : this.tag === selector; }
    querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
    focus() { this.focused = true; }
    scrollIntoView() { this.scrolled = true; }
    click() { this.handlers.click?.({ target: this, preventDefault() {}, stopPropagation() {} }); }
  }
  const ids = Object.fromEntries(['keywordPanel', 'keywordSearchPanel', 'keywordInput', 'keywordResults', 'keywordButton'].map(id => [id, new Element(id)]));
  class DOMParser {
    parseFromString(value) {
      const childNodes = [];
      let cursor = 0;
      for (const match of value.matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>(.*?)<\/a>/gi)) {
        childNodes.push({ nodeType: 3, textContent: strip(value.slice(cursor, match.index)) });
        childNodes.push({ nodeType: 1, tagName: 'A', textContent: strip(match[3]), getAttribute: () => match[2], childNodes: [{ nodeType: 3, textContent: strip(match[3]) }] });
        cursor = match.index + match[0].length;
      }
      childNodes.push({ nodeType: 3, textContent: strip(value.slice(cursor)) });
      return {
        querySelectorAll: selector => selector.startsWith('font') ? parseDefinition(value).headings.map(textContent => ({ textContent })) : [],
        body: { textContent: strip(value), childNodes },
      };
    }
  }
  const window = { AibpKeywordDictionary: model };
  const document = { currentScript: { src: 'https://example.test/aibp/keyword-search.js' }, getElementById: id => ids[id], createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('text'), { textContent: text }) };
  vm.runInNewContext(code, { document, window, DOMParser, URL, fetch: fetcher });
  return { ...ids, api: window.AibpKeywords, createElement: document.createElement };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('both languages resolve to one entry in the dock, retaining bilingual definitions and IME input', async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ entries: records }) }));
  await settle();
  h.keywordButton.click();
  assert.equal(h.keywordPanel.scrolled, true);
  assert.equal(h.keywordSearchPanel.open, true);
  assert.equal(h.keywordInput.focused, true);
  for (const query of ['攻击', 'ATTACK']) {
    h.keywordInput.value = query; h.keywordInput.handlers.input();
    assert.equal(h.keywordResults.children[0].textContent, '找到 1 条结果');
    assert.equal(h.keywordResults.children[1].children[0].textContent, '攻击 / Attack');
    const definition = h.keywordResults.children[1].children[1];
    assert.ok(definition.className.includes('keyword-bilingual'));
    assert.equal(definition.children[0].lang, 'zh');
    assert.equal(definition.children[1].lang, 'en');
    assert.equal(definition.children[0].textContent, '攻击:\n造成伤害');
    assert.equal(definition.children[1].textContent, 'Attack:\nDeal damage');
  }
  h.keywordInput.handlers.compositionstart(); h.keywordInput.value = 'MOVE'; h.keywordInput.handlers.input();
  assert.equal(h.keywordResults.children[1].children[0].textContent, '攻击 / Attack');
  h.keywordInput.handlers.compositionend();
  assert.equal(h.keywordResults.children[1].children[0].textContent, 'Move');
});
test('dictionary references decode targets, open their exact entries and remain usable in card zooms', async () => {
  const reference = { word: 'Reference', definition: '<font size="+2">Reference:</font><br><a href="dic://Advanced%20Jump">Advanced Jump</a><br><a href="dic://%E6%94%BB%E5%87%BB">攻击</a><br><a href="javascript:alert(1)">unsafe</a>' };
  const jump = { word: 'Advanced Jump', definition: '<font size="+2">Advanced Jump:</font><br>Jump<hr><font size="+2">高级跳跃:</font><br>跳跃' };
  const h = harness(async () => ({ ok: true, json: async () => ({ entries: [...records, reference, jump] }) }));
  await settle();
  h.keywordInput.value = 'reference'; h.keywordInput.handlers.input();
  const ref = h.keywordResults.children[1];
  assert.equal(ref.querySelectorAll('a').length, 2, 'only dic:// references become links');
  ref.querySelector('a').click();
  assert.equal(h.keywordInput.value, 'Advanced Jump');
  assert.equal(h.keywordResults.children.length, 1);
  assert.equal(h.keywordResults.children[0].open, true);
  assert.equal(h.keywordResults.children[0].querySelector('summary').textContent, '高级跳跃 / Advanced Jump');
  assert.equal(h.keywordSearchPanel.open, true);
  const dictionary = await h.api.load();
  const notice = h.createElement('div');
  notice.className = 'card-keywords-draw';
  notice.append(h.api.renderEntry(dictionary.entryFor('reference')));
  notice.querySelectorAll('a')[1].click();
  assert.equal(notice.querySelector('.keyword-linked-lookup').querySelector('summary').textContent, '攻击 / Attack');
  assert.equal(notice.children[0].querySelector('summary').textContent, 'Reference');
  assert.equal(h.keywordInput.value, 'Advanced Jump', 'zoom navigation keeps the background search intact');
});
test('a failed initial load can retry using the shortcut', async () => {
  let attempts = 0;
  const h = harness(async () => { if (++attempts === 1) throw Error('network'); return { ok: true, json: async () => ({ entries: records }) }; });
  await settle(); assert.match(h.keywordResults.textContent, /加载失败/);
  h.keywordButton.click(); await settle();
  h.keywordInput.value = 'attack'; h.keywordInput.handlers.input();
  assert.equal(h.keywordResults.children[0].textContent, '找到 1 条结果');
});

test('official definitions and names are searchable and missing text falls back to fan translation', async () => {
  const officialRecords = records.map(record => record.word === 'Attack' ? { ...record, officialName: '进攻', officialDefinition: '官方解释' } : record);
  const h = harness(async () => ({ ok: true, json: async () => ({ entries: officialRecords }) }));
  await settle();
  const dictionary = await h.api.load();
  assert.equal(dictionary.entryFor('进攻'), dictionary.entryFor('Attack'));
  const detail = h.api.renderEntry(dictionary.entryFor('Attack'), { language: 'official' });
  assert.equal(detail.querySelector('summary').textContent, '进攻');
  assert.equal(detail.children[1].textContent, '官方解释');
  const missing = h.api.renderEntry(dictionary.entryFor('Move'), { language: 'official' });
  assert.equal(missing.children[1].textContent, '暂无中文释义');
  const fanFallback = h.api.renderEntry(dictionary.entryFor('攻击'), { language: 'official' });
  assert.equal(fanFallback.children[1].textContent, '官方解释');
  const fanHarness = harness(async () => ({ ok: true, json: async () => ({ entries: records }) }));
  const fanDictionary = await fanHarness.api.load();
  const fallback = fanHarness.api.renderEntry(fanDictionary.entryFor('Attack'), { language: 'official' });
  assert.equal(fallback.querySelector('summary').textContent, '攻击');
  assert.equal(fallback.children[1].textContent, '攻击:\n造成伤害');
});

test('source aliases and the reviewed Kickback addition merge without dropping headwords', () => {
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../aibp/ato-keywords.json'), 'utf8')).entries;
  const dictionary = model.build(source, parseDefinition);
  assert.equal(source.length, 435);
  assert.equal(dictionary.entries.length, 217);
  source.forEach(entry => assert.ok(dictionary.entryFor(entry.word), entry.word));
  assert.equal(dictionary.entryFor('Ambrosia'), dictionary.entryFor('神浆'));
  assert.equal(dictionary.entryFor('Pursuit'), dictionary.entryFor('追逐'));
  assert.equal(dictionary.unique(['Ambrosia', '神浆', 'Pursuit', '追逐']).length, 2);
  assert.notEqual(dictionary.entryFor('Reflex'), dictionary.entryFor('Advanced Reflex'));
  assert.equal(dictionary.entryFor('无边限'), dictionary.entryFor('Boundless'));
  assert.equal(dictionary.entryFor('Boundless').title, '无边限 / Boundless');
  assert.equal(dictionary.unique(['无边限', 'Boundless']).length, 1);
  assert.equal(dictionary.entryFor('Kickback'), dictionary.entryFor('踢飞'));
  assert.notEqual(dictionary.entryFor('Kickback'), dictionary.entryFor('Kickback Reduction'));
});
