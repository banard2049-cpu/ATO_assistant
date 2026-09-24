const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
function setup() {
  const window = {};
  for (const file of ['storybook-data.js', 'storybook-official-data.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data', file), 'utf8'), { window });
  }
  const context = vm.createContext({
    window,
    document: { getElementById: () => null },
    fanData: window.STORYBOOK_DATA, officialData: window.STORYBOOK_OFFICIAL_DATA,
    activeEntry: null, selectedChapterKey: () => 'all', selectedEncounterKey: () => 'all',
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pharos-codes.js'), 'utf8'), context);
  for (const name of ['buildVersionData', 'entriesById', 'hasEntryContent', 'preferEntriesWithContent', 'preferredEntry', 'entryFromDeepLink', 'normalizeQuery', 'sortForCurrentContext', 'searchEntries', 'pharosTitleAnswer', 'storyTitleText', 'renderEntryTitle', 'syncStoryLanguage']) {
    const start = source.indexOf(`  function ${name}(`);
    const end = source.indexOf('\n  }', start) + 4;
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
}

test('官方独有段落进入对应模块，按编号和唯一键均可跳转，民间索引不受污染', () => {
  const ctx = setup();
  const official = ctx.buildVersionData(true);
  const cases = [
    ['c1', 'c1-7-official-0002', '0002', 'hub-05-uneasy-rests-the-head', '0013'],
    ['c2', 'c2-3-official-0038', '0038', 'hub-02-the-other-thermopylae'],
    ['c3', 'c3-7-official-0027', '0027', 'hub-05-cant-go-back', '0028'],
  ];
  for (const [bookId, key, id, chapterKey, nextId] of cases) {
    const book = official.books.find(item => item.id === bookId);
    const fan = ctx.buildVersionData(false).books.find(item => item.id === bookId);
    const entry = ctx.preferredEntry(book, id, { chapterKey });
    assert.equal(entry.key, key);
    assert.equal(ctx.preferredEntry(book, id, { entryKey: key }).key, key);
    assert.equal(ctx.entryFromDeepLink(book, { entryKey: key }).key, key);
    ctx.selectedChapterKey = () => chapterKey;
    assert.equal(ctx.entryFromDeepLink(book, { entryId: id }).key, key);
    ctx.currentBook = () => book;
    ctx.currentScopedEntries = () => book.entries.filter(item => item.chapterKey === chapterKey);
    assert.equal(ctx.searchEntries(id)[0].key, key);
    assert.equal(book.entryCount, fan.entryCount + 1);
    assert.ok(entry.text && entry.chapter && Number.isFinite(entry.order));
    assert.ok(!fan.entries.some(item => item.key === key));
    assert.equal(ctx.preferredEntry(fan, id, { entryKey: key }), null);
    assert.equal(ctx.entryFromDeepLink(fan, { entryKey: key, entryId: id }), null);
    if (nextId) {
      assert.ok(entry.links.includes(nextId));
      ctx.activeEntry = entry;
      assert.equal(ctx.preferredEntry(book, nextId).chapterKey, chapterKey);
      ctx.activeEntry = null;
    }
  }
  assert.equal(ctx.buildVersionData(true).books[0].entryCount, official.books[0].entryCount);
});

test('切换版本重建索引和目录，并清除民间版不存在的当前条目', () => {
  const ctx = setup();
  Object.assign(ctx, {
    storyVersion: '民间版', data: ctx.fanData,
    stopSpeech() {}, populateChapters() {}, populateEncounters() {},
    refreshSecondScreenStoryContentToggle() {},
    secondScreenStoryModeToggle: { checked: false },
    renderResults() {}, searchInput: { value: '' }, bookSelect: { options: [] },
    entryTitle: {}, entryBadge: {}, storyText: {}, linkPanel: {},
    pharosTitleDecodeButton: { hidden: true },
    currentBook: () => ctx.data.books.find(book => book.id === 'c3'),
    currentScopedEntries: () => ctx.currentBook().entries,
  });
  ctx.syncStoryLanguage(true);
  ctx.activeEntry = ctx.currentBook().entries.find(entry => entry.key === 'c3-7-official-0027');
  assert.ok(ctx.activeEntry);
  ctx.syncStoryLanguage(false);
  assert.equal(ctx.activeEntry, null);
  assert.match(ctx.storyText.textContent, /官方版独有/);
  assert.ok(!ctx.currentBook().entries.some(entry => entry.key === 'c3-7-official-0027'));
  ctx.syncStoryLanguage(true);
  assert.equal(ctx.currentBook().entries.filter(entry => entry.key === 'c3-7-official-0027').length, 1);
});

test('法洛斯标题解密按当前故事版本替换数字标题', () => {
  const ctx = setup();
  const key = 'c1-12-0';
  const entry = ctx.fanData.books[0].entries.find(item => item.key === key);
  Object.assign(ctx, {
    storyVersion: '民间版',
    decodedPharosTitleKeys: new Set(),
    pharosTitleDecodeButton: { hidden: true },
    entryTitle: {},
    supportsOfficialVersion: () => true,
    getDisplayEntry: () => ({ title: '1 卷轴 (Scroll) 13914152012118' }),
  });
  ctx.renderEntryTitle(entry);
  assert.equal(ctx.entryTitle.textContent, '1 卷轴 (Scroll) · 13914152012118');
  assert.equal(ctx.pharosTitleDecodeButton.hidden, false);
  ctx.decodedPharosTitleKeys.add(key);
  ctx.renderEntryTitle(entry);
  assert.equal(ctx.entryTitle.textContent, '1 卷轴 (Scroll) · Minotaur');
  assert.equal(ctx.pharosTitleDecodeButton.hidden, true);
  ctx.storyVersion = '官方版';
  ctx.getDisplayEntry = () => ({ title: '1 卷轴', text: '1 卷轴\n\n13914211520115122115199' });
  ctx.renderEntryTitle(entry);
  assert.equal(ctx.entryTitle.textContent, '1 卷轴 · 米诺陶洛斯');
  ctx.decodedPharosTitleKeys.delete(key);
  ctx.renderEntryTitle(entry);
  assert.equal(ctx.entryTitle.textContent, '1 卷轴 · 13914211520115122115199');
  const correctedFan = ctx.fanData.books[0].entries.find(item => item.key === 'c1-12-7');
  ctx.storyVersion = '民间版';
  ctx.getDisplayEntry = item => item;
  ctx.renderEntryTitle(correctedFan);
  assert.equal(ctx.entryTitle.textContent, '8 平板 (Tablet) · 201892519156208521815142651651516125');
  const c2Fan = ctx.fanData.books.find(book => book.id === 'c2').entries.find(item => item.key === 'c2-12-0');
  ctx.renderEntryTitle(c2Fan);
  assert.equal(ctx.entryTitle.textContent, '1 卷轴 · 154251919521199');
  const scanCorrected = ctx.fanData.books[0].entries.find(item => item.key === 'c1-12-6');
  ctx.storyVersion = '官方版';
  ctx.getDisplayEntry = () => ({ title: '7 卷轴', text: '7 卷轴\n\n49411221151995385772115' });
  ctx.renderEntryTitle(scanCorrected);
  assert.equal(ctx.entryTitle.textContent, '7 卷轴 · 49411221151994538514772115');
  ctx.renderEntryTitle({ ...entry, chapterKey: 'main' });
  assert.equal(ctx.pharosTitleDecodeButton.hidden, true);
});
