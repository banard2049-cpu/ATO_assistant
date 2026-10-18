const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const types = require('../technology/structure-card-types.js');
const source = fs.readFileSync(path.join(__dirname, '../technology/index.html'), 'utf8').replace(/\r\n/g, '\n');
const editor = fs.readFileSync(path.join(__dirname, '../technology/tools/tech_card_property_editor.html'), 'utf8').replace(/\r\n/g, '\n');
const plain = value => JSON.parse(JSON.stringify(value));

function functions(text, names) {
  return names.map(name => {
    const match = text.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
    assert.ok(match, `Missing ${name}`);
    return match[0];
  }).join('\n');
}

function context() {
  const c = vm.createContext({
    window: { ATO_STRUCTURE_CARD_TYPES: types, ATO_TECH_PAGE_LAYOUT: [{ key: 'cycle1', label: '循环 I' }] },
    search: { value: '' }, unlockedStructureType: '', unimportant: new Set(),
    accounts: { default: { name: '测试' } }, activeAccountId: 'default', currentCycle: 'cycle1',
    unlocked: new Set(), conditionTicked: new Set(),
    nodeKey: (_page, node) => node.key, techKey: value => value.toLowerCase(),
    displayTechName: node => node.name_zh || node.name,
    backThumb: card => `<span>${card.key}</span>`,
    pageByKey: () => ({ label: '循环 I' }),
  });
  vm.runInContext(functions(source, ['dictionaryToAppData', 'cardsForNode', 'cardForNode', 'tagForNode',
    'isStructureNode', 'isLargeTechCard', 'structureTypesForNode', 'structureTypeBadgesHtml', 'technologyMetaLabel',
    'matchesUnlockedFilters', 'unlockedStructureFilterHtml', 'isNegotiationNode', 'isUnimportantNode',
    'unlockedItemHtml', 'unlockedGroupsHtml', 'categoryLabel', 'esc', 'unlockedTechSnapshot']), c);
  c.data = c.dictionaryToAppData({ cards: [
    { index: 0, key: 'hybrid', names: { en: 'Hybrid', zh: '混合科技' }, category: 'structure',
      type: { structure_card_types: ['save', 'active'], loop_limited: false },
      nodes: [{ page: 'cycle1', id: 'hybrid', key: 'hybrid' }] },
    { index: 1, key: 'reference', names: { en: 'Reference' }, category: 'structure',
      type: { structure_card_types: ['reference'], negotiation: true },
      nodes: [{ page: 'cycle1', id: 'hybrid', key: 'hybrid' }] },
    { index: 2, key: 'unknown', names: { en: 'Unknown' }, category: 'structure',
      type: { loop_limited: false }, nodes: [{ page: 'cycle1', id: 'unknown', key: 'unknown' }] },
    { index: 3, key: 'battle', names: { en: 'Battle' }, category: 'battle',
      type: { battle_card_type: 'skill', structure_card_types: ['save'] },
      nodes: [{ page: 'cycle1', id: 'battle', key: 'battle' }] },
  ] });
  c.records = ['hybrid', 'unknown', 'battle'].map(id => ({ page: c.data.pages[0], node: { ...c.data.pages[0].nodes.find(node => node.id === id), key: id } }));
  c.unlockedRecords = () => c.records;
  c.shouldShowUnlockedNode = () => true;
  return c;
}

test('legacy negotiation flags join multiple validated types without mutating dictionary data', () => {
  const type = { negotiation: true, structure_card_types: ['active', 'save', 'save', 'invalid'] };
  assert.deepEqual(types.forType(type), ['save', 'negotiation', 'active']);
  assert.deepEqual(type.structure_card_types, ['active', 'save', 'save', 'invalid']);
  assert.deepEqual(types.forCard({ category: 'battle', type }), []);
  assert.deepEqual(types.forType({ structure_card_types: 'active' }), []);
});

test('editing multiple types synchronizes negotiation and preserves unrelated card properties', () => {
  const card = { category: 'structure', type: { negotiation: true, loop_limited: false } };
  types.setForCard(card, ['reference', 'one_time']);
  assert.deepEqual(card.type, { loop_limited: false, structure_card_types: ['one_time', 'reference'] });
  types.setForCard(card, ['negotiation', 'active']);
  assert.equal(card.type.negotiation, true);
});

test('merged tree nodes retain types from every card and battle nodes have no structural types', () => {
  const c = context();
  assert.deepEqual(plain(c.structureTypesForNode('cycle1', c.records[0].node)), ['save', 'negotiation', 'active', 'reference']);
  assert.deepEqual(plain(c.structureTypesForNode('cycle1', c.records[2].node)), []);
  assert.equal(c.technologyMetaLabel('cycle1', c.records[0].node), '结构科技 · 豁免 · 谈判 · 主动 · 参考');
});

test('subtype and bilingual text searches combine, with a separate unclassified filter', () => {
  const c = context();
  c.unlockedStructureType = 'save';
  assert.equal(c.records.filter(c.matchesUnlockedFilters).length, 1);
  c.search.value = '混合';
  assert.equal(c.records.filter(c.matchesUnlockedFilters).length, 1);
  c.search.value = '主动';
  assert.equal(c.records.filter(c.matchesUnlockedFilters).length, 1);
  c.search.value = 'missing';
  assert.equal(c.records.filter(c.matchesUnlockedFilters).length, 0);
  c.search.value = '';
  c.unlockedStructureType = 'unclassified';
  assert.equal(c.records.filter(c.matchesUnlockedFilters)[0].node.key, 'unknown');
});

test('multiple types do not duplicate cards and subtype counts include each node once', () => {
  const c = context();
  const html = c.unlockedGroupsHtml(c.records);
  assert.equal((html.match(/class="unlocked-item"/g) || []).length, 3);
  assert.match(html, /豁免/);
  assert.match(html, /未分类/);
  const filters = c.unlockedStructureFilterHtml(c.records);
  assert.match(filters, /谈判（1）/);
  assert.match(filters, /未分类（1）/);
});

test('campaign snapshots carry the structural types and the existing negotiation flag', () => {
  const c = context();
  const snapshot = c.unlockedTechSnapshot();
  assert.deepEqual(plain(snapshot.unlocked[0].structureCardTypes), ['save', 'negotiation', 'active', 'reference']);
  assert.equal(snapshot.unlocked[0].negotiation, true);
  assert.deepEqual(plain(snapshot.unlocked[2].structureCardTypes), []);
});

test('科技页不再暴露编辑分类入口，细分筛选照旧', () => {
  const c = context();
  const html = c.unlockedStructureFilterHtml(c.records);
  // 入口隐藏：既没有编辑链接，也不残留只服务于它的类名（编辑器本身仍在本机 tools/ 下）。
  assert.doesNotMatch(html, /structure-filter-edit/);
  assert.doesNotMatch(html, /tech_card_property_editor\.html/);
  // 筛选本身不能跟着丢；原生 Android 同样不暴露入口。
  assert.match(html, /谈判（1）/);
  c.window.ATOAndroid = {};
  assert.doesNotMatch(c.unlockedStructureFilterHtml(c.records), /structure-filter-edit/);
});

test('the property editor only submits changed cards with all selected types', async () => {
  let sent;
  const elements = { save: {}, search: { value: '' }, cycle: { value: '' }, category: { value: '' },
    coreFilter: { value: '' }, sizeFilter: { value: '' }, structureTypeFilter: { value: 'save' } };
  const c = vm.createContext({ ATO_STRUCTURE_CARD_TYPES: types, dirty: true, SAVE_URL: '/test',
    cards: [
      { key: 'changed', category: 'structure', dirty: true, search: 'changed', cycles: [], type: { structure_card_types: ['save', 'active'] } },
      { key: 'untouched', category: 'structure', dirty: false, search: 'untouched', cycles: [], type: { negotiation: true } },
    ], $: id => elements[id], render() {}, alert: assert.fail,
    fetch: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ ok: true }) }; },
  });
  vm.runInContext(functions(editor, ['currentItems', 'save']), c);
  assert.equal(c.currentItems().length, 1);
  await c.save();
  assert.deepEqual(sent.cardUpdates, [{ key: 'changed', category: 'structure', core: false, structureCardTypes: ['save', 'active'] }]);
  assert.equal(c.dirty, false);
});

test('edited HTML inline scripts still parse', () => {
  for (const html of [source, editor]) {
    for (const script of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
  }
});

test('every structural card is classified and permanent remains independent of cycle scope', () => {
  const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../technology/tech_card_dictionary.min.json'), 'utf8'));
  const structural = dictionary.cards.filter(card => card.category === 'structure');
  assert.ok(structural.length > 0);
  for (const card of structural) {
    assert.ok(types.forCard(card).length, `${card.key} must be classified`);
    assert.deepEqual(card.type.structure_card_types, types.normalize(card.type.structure_card_types));
    assert.equal(Boolean(card.type.negotiation), card.type.structure_card_types.includes('negotiation'));
  }
  const onboarding = structural.find(card => card.key === 'argo onboarding');
  assert.deepEqual(types.forCard(onboarding), ['one_time', 'save', 'permanent']);
  const navigation = structural.find(card => card.key === 'tight-spaces navigation');
  assert.deepEqual(types.forCard(navigation), ['negotiation', 'permanent']);
  const shallows = structural.find(card => card.key === 'shallows navigation');
  assert.ok(types.forCard(shallows).includes('permanent'));
  assert.equal(shallows.type.loop_limited, true);
});

test('printed structural types and cycle scope keep Titan Care and both core projects visible after unlock', () => {
  const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../technology/tech_card_dictionary.min.json'), 'utf8'));
  const c = context();
  c.window.ATO_TECH_PAGE_LAYOUT = [
    { key: 'cycle1', label: '循环 I' },
    { key: 'cycle3', label: '循环 III' },
    { key: 'cycle4', label: '循环 IV' },
  ];
  c.data = c.dictionaryToAppData(dictionary);
  c.pageByKey = key => c.data.pages.find(page => page.key === key);
  vm.runInContext(functions(source, ['shouldShowUnlockedNode']), c);
  for (const [key, pageKey, labels, limited] of [
    ['antikratos project', 'cycle1', ['permanent'], false],
    ['argo works iii', 'cycle3', ['reference'], true],
    ['titan care', 'cycle3', ['save'], false],
  ]) {
    const card = dictionary.cards.find(card => card.key === key);
    assert.equal(card.category, 'structure', key);
    assert.ok(card.nodes.every(node => node.category === 'structure'), key);
    assert.equal(card.type.battle_card_type, undefined, key);
    assert.equal(card.type.loop_limited, limited, key);
    assert.deepEqual(types.forCard(card), labels, key);
    const page = c.pageByKey(pageKey);
    const node = page.nodes.find(node => node.card_indexes.includes(card.index));
    assert.equal(node.tech_category, 'structure', key);
    c.currentCycle = pageKey;
    assert.equal(c.shouldShowUnlockedNode({ page, node }), true, `${key} is visible in its own cycle`);
    c.currentCycle = 'cycle4';
    assert.equal(c.shouldShowUnlockedNode({ page, node }), !limited, `${key} follows its printed cycle scope`);
  }
});

test('standing trade and permanent negotiation support are not listed as negotiation abilities', () => {
  const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../technology/tech_card_dictionary.min.json'), 'utf8'));
  const c = context();
  c.window.ATO_TECH_PAGE_LAYOUT = [
    { key: 'cycle1', label: '循环 I' },
    { key: 'cycle5', label: '循环 V' },
  ];
  c.data = c.dictionaryToAppData(dictionary);
  for (const [index, labels] of [[41, ['active']], [311, ['permanent']], [315, ['permanent']]]) {
    const card = dictionary.cards.find(card => card.index === index);
    assert.equal(card.type.negotiation, undefined, card.key);
    assert.deepEqual(types.forCard(card), labels, card.key);
    const page = c.data.pages.find(page => page.key === card.nodes[0].page);
    const node = page.nodes.find(node => node.card_indexes.includes(index));
    assert.equal(c.isNegotiationNode(page.key, node), false, card.key);
    assert.deepEqual(plain(c.structureTypesForNode(page.key, node)), labels, card.key);
  }
});

test('all 30 structural large cards have labels, while large battle cards remain excluded', () => {
  const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../technology/tech_card_dictionary.min.json'), 'utf8'));
  const large = dictionary.cards.filter(card => card.category === 'structure' && types.isLargeCard(card));
  assert.equal(large.length, 30);
  for (const card of large) assert.ok(types.forCard(card).length, `${card.key} must be classified`);
  const c = context();
  c.data = c.dictionaryToAppData(dictionary);
  for (const card of large) assert.equal(c.isLargeTechCard(c.data.cards[card.index]), true);
  const page = c.data.pages[0];
  const structure = { page, node: page.nodes.find(node => node.card_indexes.includes(44)) };
  const battle = { page, node: { id: 'large-battle', name: 'Battle', tech_category: 'battle', card_indexes: [123] } };
  const html = c.unlockedGroupsHtml([structure]);
  assert.match(html, /<summary>大卡 1<\/summary>/);
  assert.match(html, /主动/);
  assert.deepEqual(plain(c.structureTypesForNode(page.key, battle.node)), []);
  assert.doesNotMatch(c.unlockedItemHtml({ ...battle, card: c.data.cards[123] }), /structure-type-badges/);
  assert.deepEqual(types.forCard(dictionary.cards[123]), []);
  assert.equal(types.canClassify(dictionary.cards[123]), false);
  assert.equal(dictionary.cards[123].type.structure_card_types, undefined);
  c.unlockedStructureType = 'active';
  assert.deepEqual([structure, battle].filter(c.matchesUnlockedFilters), [structure]);
});

test('the structural large-card editor filter combines with effect types and excludes battle cards', () => {
  const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../technology/tech_card_dictionary.min.json'), 'utf8'));
  const elements = { search: { value: '' }, cycle: { value: '' }, category: { value: '' },
    coreFilter: { value: '' }, sizeFilter: { value: 'large' }, structureTypeFilter: { value: '' } };
  const c = vm.createContext({ ATO_STRUCTURE_CARD_TYPES: types, $: id => elements[id],
    cards: dictionary.cards.map(card => ({ ...card, search: card.key, cycles: [] })),
  });
  vm.runInContext(functions(editor, ['currentItems']), c);
  assert.equal(c.currentItems().length, 30);
  assert.ok(c.currentItems().every(card => card.category === 'structure'));
  elements.structureTypeFilter.value = 'permanent';
  assert.ok(c.currentItems().length > 0);
  assert.ok(c.currentItems().every(card => types.forCard(card).includes('permanent')));
  elements.category.value = 'battle';
  assert.equal(c.currentItems().length, 0);
});
