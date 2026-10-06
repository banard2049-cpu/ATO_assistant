/* C1-C3 fan-variant placements.
 *
 * The C1-C3 mapping was originally audited on the official Chinese text, so 民间版
 * showed plain text where 官方版 showed the original book graphics. On 2026-10-05 the
 * same graphics were re-anchored on the fan translation (story/data/storybook-data.js):
 * the fan rows carry the identical image files, only the text range moves. These tests
 * freeze that relationship and the app-level switch that activates it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { create } = require('../assets/mixed-media/renderer.js');
const root = path.resolve(__dirname, '../..');
const files = ['story/data/storybook-data.js', 'story/data/storybook-official-data.js',
  'story/assets/mixed-media/mapping.js'];
const local = files.every(file => fs.existsSync(path.join(root, file)));
const parse = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')
  .split('=').slice(1).join('=').trim().replace(/;\s*$/, ''));
const [fan, official, mapping] = local ? files.map(parse) : [null, null, null];
const ledgers = ['rows', 'resourceRows', 'battleRows', 'requestedRows'];
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const BOOKS = new Set(['c1', 'c2', 'c3']);

function fanRows() {
  return ledgers.flatMap(name => mapping[name]).filter(row => BOOKS.has(row.book) && row.variant === 'fan');
}
function officialRowsFor(book, key) {
  return ledgers.flatMap(name => mapping[name])
    .filter(row => row.book === book && row.variant === 'official' && row.key === key);
}
function fanText(book, key) {
  return fan.books.find(b => b.id === book)?.entries.find(e => e.key === key)?.text ?? null;
}
function fanEntry(book, key) {
  return fan.books.find(b => b.id === book)?.entries.find(e => e.key === key) ?? {};
}

test('C1-C3 fan rows exist only for real fan entries and reuse the official graphics', { skip: !local }, () => {
  const rows = fanRows();
  assert.deepEqual(mapping.fanAnchorRevision?.counts, {
    resourceRows: 2808, battleRows: 108, narrativeRows: 40, total: 2956,
  });
  assert.equal(rows.length, 2956);
  const seen = new Map();
  for (const row of rows) {
    assert.ok(BOOKS.has(row.book), row.key);
    assert.equal(row.variant, 'fan');
    const text = fanText(row.book, row.key);
    assert.equal(typeof text, 'string', `${row.key} has no fan text`);
    assert.ok(text.length > 0, `${row.key} fan text is empty`);
    // every fan placement must point at a graphic the official audit already verified
    const officialPaths = new Set(officialRowsFor(row.book, row.key).map(r => r.path));
    assert.ok(officialPaths.has(row.path), `${row.key}: ${row.path} has no official counterpart`);
    // the recorded source text hash must be the current fan text
    assert.equal(sha(text), row.sourceTextSha256, row.key);
    assert.equal(text.length, row.textLength, row.key);
    assert.equal(text.indexOf(row.anchor) >= 0, true, `${row.key}: anchor missing`);
    seen.set(row.path, true);
  }
  // no fan row may have been placed twice on the same character range
  const perEntry = new Map();
  for (const row of rows) {
    const key = `${row.book}|${row.key}`;
    if (!perEntry.has(key)) perEntry.set(key, []);
    perEntry.get(key).push(row);
  }
  for (const [key, list] of perEntry) {
    const text = fanText(...key.split('|'));
    const nth = (needle, occurrence) => {
      let at = -1;
      for (let i = 0; i < occurrence; i++) at = text.indexOf(needle, at + 1);
      return at;
    };
    const spans = list.map(row => {
      const at = nth(row.anchor, row.anchorOccurrence);
      // before/after rows insert at a point (zero width); replace consumes its anchor
      const start = row.position === 'after' ? at + row.anchor.length : at;
      const end = row.position === 'replace' ? at + row.anchor.length : start;
      return { start, end, anchor: row.anchor };
    }).sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < spans.length; i++) {
      assert.ok(spans[i].start >= spans[i - 1].end, `${key}: overlapping fan anchors`);
    }
  }
});

test('C1-C3 fan placements resolve on the current fan text without issues', { skip: !local }, () => {
  const api = create(mapping, { location: { href: 'https://qa.invalid/story/index.html' } });
  const expected = new Map();
  for (const row of fanRows()) {
    const key = `${row.book}|${row.key}`;
    expected.set(key, (expected.get(key) || 0) + 1);
  }
  let entries = 0, placed = 0;
  for (const [key, count] of expected) {
    const [book, entryKey] = key.split('|');
    const text = fanText(book, entryKey);
    const result = api.plan({ schema: 1, bookId: book, entryKey, variant: 'fan' }, text);
    assert.deepEqual(result.issues, [], key);
    assert.equal(result.count, count, key);
    assert.equal(result.tokens.map(t => t.type === 'text' ? t.text : t.original).join(''), text, key);
    entries++; placed += result.count;
  }
  assert.equal(entries, 1410);
  assert.equal(placed, 2956);
  // the official variant keeps working on the official text
  let officialPlaced = 0;
  for (const book of official.books) {
    for (const entry of book.entries) {
      const result = api.plan({ schema: 1, bookId: book.id, entryKey: entry.key, variant: 'official' }, entry.officialText || '');
      assert.deepEqual(result.issues, [], `${book.id}|${entry.key}`);
      officialPlaced += result.count;
    }
  }
  assert.equal(officialPlaced, 5432); // 3008（C1–C3）+ 2424 条 2026-10-06 新增的 C4/C5 official 行
});

/* The five C2 battles had no fan text at all (the fan data only had the entry skeletons),
 * so 民间版 used to show an empty battle page. Their text is now the official battle text
 * reworded into the fan terminology (boss names included). These checks freeze that. */
test('C2 battles carry fan text that follows the fan wording, not the official one', { skip: !local }, () => {
  const keys = ['c2-730', 'c2-731', 'c2-732', 'c2-733', 'c2-734'];
  const bossNames = { 'c2-730': '独眼巨人 (Cyclonus)', 'c2-731': '蠕变奇美拉 (Chimera Metastasios)',
    'c2-732': '重担 (Burden)', 'c2-733': '残酷教训 (Cruel Lesson)', 'c2-734': '你是什么' };
  const officialOnly = ['骇物', '末日］', '凶险', '陌路人', '三曲盘', '命运潮汐', '战前简介', '余波', '落败',
    '板图', '部位卡牌', '伤口堆', '船育泰坦', '旧忆', '航标梦境', '无眼巨人', '扩散嵌合体'];
  for (const key of keys) {
    const text = fanText('c2', key);
    assert.ok(text.length > 500, `${key} fan text is too short`);
    assert.ok(text.startsWith(fan.books.find(b => b.id === 'c2').entries.find(e => e.key === key).title.split(' ')[0]),
      `${key} should start with its fan title`);
    assert.ok(text.includes('所需板块：') && text.includes('介绍：') && text.includes('战斗设置：'),
      `${key} is missing a battle section`);
    assert.ok(text.includes(bossNames[key]), `${key} should use the fan boss name`);
    for (const term of officialOnly) assert.ok(!text.includes(term), `${key} kept official wording ${term}`);
    // the fan data records where the text came from
    assert.ok((fan.adaptedBattleTexts?.keys || []).includes(key), `${key} is not marked as adapted`);
    // the legacy page-scan base path is gone: with real text the scans are not referenced
    assert.equal(fanEntry('c2', key).images, undefined, `${key} still points at page scans`);
    assert.equal(fanEntry('c2', key).imagePages, undefined, `${key} still declares page counts`);
    assert.equal(fanEntry('c2', key).imageList, undefined, `${key} still declares page lists`);
    // and the mapping can place graphics in it
    assert.ok(officialRowsFor('c2', key).length > 0, `${key} should have official rows`);
  }
  const c2Rows = fanRows().filter(row => row.book === 'c2' && keys.includes(row.key));
  assert.equal(c2Rows.length, 49, 'C2 battle placements');
  assert.equal(c2Rows.filter(row => row.kind === 'terrain-diagram').length, 6, 'C2 setup diagrams');
  for (const row of c2Rows) {
    assert.ok((fanText('c2', row.key) || '').includes(row.anchor), `${row.key} anchor missing`);
  }
});

test('the story page asks for the fan mapping on C1-C3 as well', { skip: !local }, () => {
  const mainSource = fs.readFileSync(path.join(root, 'story/assets/app.js'), 'utf8');
  const match = /^ {2}function mixedMediaContext\(/m.exec(mainSource);
  assert.ok(match, 'missing mixedMediaContext');
  const end = mainSource.indexOf('\n  }', match.index);
  const page = vm.createContext({
    currentBook: () => ({ id: 'c1' }),
    storyVersion: '民间版',
    supportsOfficialVersion: () => true,
  });
  vm.runInContext(`${mainSource.slice(match.index, end + 4)}\n;({ mixedMediaContext })`, page);
  const asJSON = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(asJSON(page.mixedMediaContext({ key: 'c1-15-0', chapterKey: 'battle' })),
    { schema: 1, bookId: 'c1', entryKey: 'c1-15-0', variant: 'fan' });
  page.storyVersion = '官方版';
  assert.deepEqual(asJSON(page.mixedMediaContext({ key: 'c1-15-0', chapterKey: 'battle' })),
    { schema: 1, bookId: 'c1', entryKey: 'c1-15-0', variant: 'official' });
  assert.equal(page.mixedMediaContext({ key: 'c1-1-0', chapterKey: 'story-card' }), null);
  page.currentBook = () => ({ id: 'c9' });
  assert.equal(page.mixedMediaContext({ key: 'x', chapterKey: 'main' }), null);
  page.currentBook = () => ({ id: 'c4' });
  page.storyVersion = '民间版';
  assert.deepEqual(asJSON(page.mixedMediaContext({ key: 'c4-13-0', chapterKey: 'battle' })),
    { schema: 1, bookId: 'c4', entryKey: 'c4-13-0', variant: 'fan' });
});
