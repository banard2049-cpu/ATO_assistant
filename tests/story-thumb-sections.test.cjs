/*
 * 拇指图标标记的段落回归：实体书用拇指图标标出「另起一段」的入口，
 * 这一段的编号印在标记后面，来源页没把它做成标题时整段会并进上一段，
 * 症状就是「（拇指）导致新的章节没有分出来」。
 * 这里检查故事书数据里每个拇指标记都自己成段（标记留在正文开头），
 * 并且阅读器用编号能解析到它们。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'story/assets/app.js'), 'utf8').replace(/\r\n/g, '\n');
const THUMB_RE = /[（(]\s*拇指\s*[)）]\s*(\*?\d{3,5}|M\d{3})(?=$|[\s:：|·\-–—])/;

function extractFunction(name) {
  const match = appSource.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `story/assets/app.js 缺少函数 ${name}`);
  return match[0];
}

function storyContext() {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'story/data/storybook-data.js'), 'utf8'), scope);
  const context = vm.createContext({
    data: scope.window.STORYBOOK_DATA,
    activeEntry: null,
    selectedChapterKey: () => 'all',
    selectedEncounterKey: () => 'all',
    currentScopedEntries: () => [],
    currentChapterEntries: (book) => book.entries,
  });
  const names = [
    'normalizeDeepLinkValue',
    'resolveChapterKey',
    'resolveEncounterKey',
    'normalizeShortIdValue',
    'normalizeShortIdTitle',
    'entriesById',
    'hasEntryContent',
    'preferEntriesWithContent',
    'preferredEntry',
    'entryFromDeepLink',
  ];
  vm.runInContext(names.map(extractFunction).join('\n'), context);
  return context;
}

test('书里用拇指图标标出的段落都自己成段，标记留在正文开头', () => {
  const context = storyContext();
  const split = [];
  for (const book of context.data.books) {
    for (const entry of book.entries) {
      const text = String(entry.text || '');
      const match = THUMB_RE.exec(text);
      if (!match) continue;
      assert.equal(match.index, 0, `${book.id} ${entry.key} 的拇指标记还在上一段正文里`);
      assert.equal(String(entry.id), match[1], `${book.id} ${entry.key} 的编号和标记不一致`);
      assert.equal(entry.entryType, 'number', `${book.id} ${entry.key} 不是编号段落`);
      split.push(`${book.id} ${entry.id}`);
    }
  }
  assert.deepEqual(split, ['c4 0010', 'c4 1095', 'c4 1355', 'c4 1359', 'c4 4172']);
});

test('拇指段落的正文不会在别的段落里再出现一份', () => {
  const context = storyContext();
  const entries = context.data.books.flatMap((book) => book.entries.map((entry) => ({ book, entry })));
  const thumbs = entries.filter(({ entry }) => /^[（(]\s*拇指\s*[)）]/.test(String(entry.text || '')));
  assert.equal(thumbs.length, 5);

  // 「获得 +N (…资源…)」这类通用奖励句在全书本来就是复用的模板（例如
  // 「获得 +1 (进展指示物 (ProgressToken))。」出现在 80 个其它条目里），
  // 它出现在拇指段落里并不说明这段正文被并回了上一段。这里只把叙述句当作重复证据。
  const SHARED_REWARD_LINE = /^获得\s*[+＋]\s*\d/;
  const duplicates = [];
  for (const { book, entry } of thumbs) {
    const lines = new Set(
      String(entry.text || '').split('\n').map((line) => line.trim())
        .filter((line) => line.length >= 12 && !SHARED_REWARD_LINE.test(line)),
    );
    for (const other of entries) {
      if (other.entry === entry) continue;
      for (const line of lines) {
        if (String(other.entry.text || '').includes(line)) {
          duplicates.push(`${book.id} ${entry.id} 的「${line.slice(0, 20)}…」也出现在 ${other.book.id} ${other.entry.id}`);
        }
      }
    }
  }
  assert.deepEqual(duplicates, []);
});

test('阅读器能按编号跳到拇指段落，相邻段号也还在', () => {
  const context = storyContext();
  const book = context.data.books.find((item) => item.id === 'c4');
  assert.ok(book, '故事书缺少 c4');

  for (const [id, neighborBefore, neighborAfter] of [
    ['0010', '0009', '0011'],
    ['1095', '0403', '1112'],
    ['1355', '1354', '1356'],
    ['1359', '1356', '1360'],
    ['4172', '4155', '4456'],
  ]) {
    const entry = context.preferredEntry(book, id, { chapterKey: 'main' });
    assert.ok(entry, `c4 主线解析不到 ${id}`);
    assert.equal(entry.id, id);
    assert.equal(entry.chapterKey, 'main');
    assert.equal(context.entryFromDeepLink(book, { entryId: id, chapterKey: 'main' }).key, entry.key);

    const chapter = book.entries.filter((item) => item.chapterKey === 'main');
    const order = chapter.slice().sort((a, b) => a.order - b.order).map((item) => item.id);
    assert.ok(order.indexOf(neighborBefore) < order.indexOf(id), `${neighborBefore} 应该排在 ${id} 前面`);
    assert.ok(order.indexOf(id) < order.indexOf(neighborAfter), `${id} 应该排在 ${neighborAfter} 前面`);
  }
});
