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
const THUMB_RE = /[（(]\s*拇指\s*[)）]\s*(\*?\d{3,5}|M\d{3})(?=$|[\s:：|·\-–—])/g;

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

test('带编号的拇指段落独立成段，且能按编号跳转', () => {
  const context = storyContext();
  const beforeByEntry = new Map([
    ['c4 0010', '0009'], ['c4 1095', '0403'], ['c4 1355', '1354'],
    ['c4 1359', '1356'], ['c4 4172', '4155'],
  ]);
  for (const book of context.data.books) {
    if (book.id === 'c4') {
      assert.equal(new Set(book.entries.map(entry => entry.key)).size, book.entries.length, 'C4 的段落键必须唯一');
    }
    for (const entry of book.entries) {
      for (const match of String(entry.text || '').matchAll(THUMB_RE)) {
        const label = `${book.id} ${entry.id}`;
        assert.equal(match.index, 0, `${label} 的拇指标记还在上一段正文里`);
        assert.equal(String(entry.id), match[1], `${label} 的编号和标记不一致`);
        assert.equal(entry.entryType, 'number', `${label} 不是编号段落`);
        const linked = context.entryFromDeepLink(book, { entryId: entry.id, chapterKey: entry.chapterKey });
        assert.equal(linked?.key, entry.key, `${label} 的编号跳转指向其它段落`);
        const beforeId = beforeByEntry.get(label);
        if (!beforeId) continue;
        assert.equal(entry.chapterKey, 'main', label);
        const preceding = book.entries.find(item => item.chapterKey === 'main' && item.id === beforeId);
        assert.ok(preceding && preceding.order < entry.order, label);
        const body = entry.text.split('\n').slice(1).join('\n').trim();
        assert.ok(body && !preceding.text.includes(body), `${label} 的正文应保留在独立段落`);
        beforeByEntry.delete(label);
      }
    }
  }
  assert.deepEqual([...beforeByEntry.keys()], [], '已知的拇指段落缺失');
});
