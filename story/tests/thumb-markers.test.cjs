/* 拇指标记：原书用「圆形点赞手势」标出另起一段的入口，图标印在编号标题前面。
 *
 * C4 的五条（0010 / 1095 / 1355 / 1359 / 4172）由来源页带来，标记留在正文首行；
 * C1 主线里的十处按故事书截图逐条核对后补上（截图里图标印在编号左侧）；
 * C5 的 27 处拇指 + 2 处星芒圆圈按五循环故事书 PDF（200dpi 渲染 + 模板匹配）核对后补上。
 * 这些条目正文开头必须是 "(拇指) " 或 "(圈) "，且混排映射的长度与指纹要跟着正文走。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const files = {
  fan: path.join(root, 'story/data/storybook-data.js'),
  official: path.join(root, 'story/data/storybook-official-data.js'),
  mapping: path.join(root, 'story/assets/mixed-media/mapping.js'),
};
const local = Object.values(files).every(file => fs.existsSync(file));

const MARK = '(拇指) ';
const CIRCLE = '(圈) ';
const MARK_RE = /^[（(]\s*拇指\s*[)）]/;
const CIRCLE_RE = /^[（(]\s*圈\s*[)）]/;
const C1_THUMBS = ['c1-0-149', 'c1-0-160', 'c1-0-161', 'c1-0-165', 'c1-0-167',
  'c1-0-174', 'c1-0-181', 'c1-0-185', 'c1-0-187', 'c1-0-188'];
const C4_THUMBS = ['c4-0-thumb-0010', 'c4-0-thumb-1095', 'c4-0-thumb-1355',
  'c4-0-thumb-1359', 'c4-0-thumb-4172'];
// C5 拇指：编号 0345/1082/1183/1337/1441/2318/2345/2753/3129/3401/3407/3671/3708/
// 4013/4014/6137/7487/7499/7613/7965/7915/8357/8783/9922/9999/47145/9441
const C5_THUMBS = ['c5-0-101', 'c5-0-132', 'c5-0-149', 'c5-0-176', 'c5-0-179',
  'c5-0-189', 'c5-0-190', 'c5-0-214', 'c5-0-220', 'c5-0-233', 'c5-0-234',
  'c5-0-238', 'c5-0-240', 'c5-0-244', 'c5-0-245', 'c5-0-331', 'c5-0-351',
  'c5-0-352', 'c5-0-355', 'c5-0-359', 'c5-0-358', 'c5-0-367', 'c5-0-459',
  'c5-0-471', 'c5-0-472', 'c5-0-473', 'c5-0-467'];
// C5 圆圈（星芒圆）：2043 / 8019
const C5_CIRCLES = ['c5-0-182', 'c5-0-363'];

function load(file, name) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return context.window[name];
}

function fingerprint(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

const fan = local ? load(files.fan, 'STORYBOOK_DATA') : null;
const official = local ? load(files.official, 'STORYBOOK_OFFICIAL_DATA') : null;
const mapping = local ? load(files.mapping, 'ATO_MIXED_MEDIA_MAP') : null;

const fanEntry = (book, key) => fan.books.find(b => b.id === book)?.entries.find(e => e.key === key);
const officialEntry = (book, key) => official.books.find(b => b.id === book)?.entries.find(e => e.key === key);

test('C1 主线十处拇指标记写在正文开头（民间版 / 官方版）', { skip: !local }, () => {
  for (const key of C1_THUMBS) {
    const entry = fanEntry('c1', key);
    const mirror = officialEntry('c1', key);
    assert.ok(entry, `民间版缺少 ${key}`);
    assert.ok(mirror, `官方版缺少 ${key}`);
    assert.ok(entry.text.startsWith(MARK), `${key} 民间版没有拇指标记`);
    assert.ok(String(mirror.officialText).startsWith(MARK), `${key} 官方版没有拇指标记`);
    assert.equal(entry.text.split(MARK).length - 1, 1, `${key} 只应有一个标记`);
  }
});

test('C1-C3 其他条目没有被误加拇指标记', { skip: !local }, () => {
  const allowed = new Set(C1_THUMBS);
  for (const book of fan.books.filter(b => b.id === 'c1' || b.id === 'c2' || b.id === 'c3')) {
    for (const entry of book.entries) {
      if (allowed.has(entry.key)) continue;
      assert.ok(!String(entry.text).includes(MARK), `${entry.key} 多出了拇指标记`);
    }
  }
  for (const book of official.books.filter(b => b.id === 'c1' || b.id === 'c2' || b.id === 'c3')) {
    for (const entry of book.entries) {
      if (allowed.has(entry.key)) continue;
      assert.ok(!String(entry.officialText || '').includes(MARK), `${entry.key} 官方版多出了拇指标记`);
    }
  }
});

test('C4 五处拇指标记仍在', { skip: !local }, () => {
  for (const key of C4_THUMBS) {
    const entry = fanEntry('c4', key);
    assert.ok(entry && MARK_RE.test(entry.text), `${key} 标记丢失`);
  }
});

test('C5 27 处拇指 + 2 处圆圈（民间版 / 官方版）', { skip: !local }, () => {
  for (const key of C5_THUMBS) {
    const entry = fanEntry('c5', key);
    const mirror = officialEntry('c5', key);
    assert.ok(entry, `民间版缺少 ${key}`);
    assert.ok(mirror, `官方版缺少 ${key}`);
    assert.ok(entry.text.startsWith(MARK), `${key} 民间版没有拇指标记`);
    assert.ok(String(mirror.officialText).startsWith(MARK), `${key} 官方版没有拇指标记`);
    assert.equal(entry.text.split(MARK).length - 1, 1, `${key} 只应有一个标记`);
  }
  for (const key of C5_CIRCLES) {
    const entry = fanEntry('c5', key);
    const mirror = officialEntry('c5', key);
    assert.ok(entry, `民间版缺少 ${key}`);
    assert.ok(mirror, `官方版缺少 ${key}`);
    assert.ok(entry.text.startsWith(CIRCLE), `${key} 民间版没有圆圈标记`);
    assert.ok(String(mirror.officialText).startsWith(CIRCLE), `${key} 官方版没有圆圈标记`);
    assert.ok(!entry.text.startsWith(MARK), `${key} 不应是拇指`);
  }
});

test('C5 其他条目没有被误加标记', { skip: !local }, () => {
  const allowed = new Set([...C5_THUMBS, ...C5_CIRCLES]);
  for (const book of fan.books.filter(b => b.id === 'c5')) {
    for (const entry of book.entries) {
      if (allowed.has(entry.key)) continue;
      assert.ok(!String(entry.text).includes(MARK), `${entry.key} 多出了拇指标记`);
      assert.ok(!String(entry.text).includes(CIRCLE), `${entry.key} 多出了圆圈标记`);
    }
  }
  for (const book of official.books.filter(b => b.id === 'c5')) {
    for (const entry of book.entries) {
      if (allowed.has(entry.key)) continue;
      const text = String(entry.officialText || '');
      assert.ok(!text.includes(MARK), `${entry.key} 官方版多出了拇指标记`);
      assert.ok(!text.includes(CIRCLE), `${entry.key} 官方版多出了圆圈标记`);
    }
  }
});

test('带标记条目的混排映射与正文长度、指纹一致', { skip: !local }, () => {
  const keys = new Set([...C1_THUMBS, ...C4_THUMBS, ...C5_THUMBS, ...C5_CIRCLES]);
  const ledgers = ['rows', 'resourceRows', 'battleRows', 'requestedRows'];
  let checked = 0;
  for (const name of ledgers) {
    for (const row of mapping[name] || []) {
      if (!keys.has(row.key)) continue;
      const entry = row.variant === 'fan' ? fanEntry(row.book, row.key) : officialEntry(row.book, row.key);
      const text = row.variant === 'fan' ? entry?.text : entry?.officialText;
      if (typeof text !== 'string' || !text) continue;
      assert.equal(text.length, row.textLength, `${row.book} ${row.key} ${row.variant} 长度`);
      assert.equal(fingerprint(text), row.textFingerprint, `${row.book} ${row.key} ${row.variant} 指纹`);
      assert.ok(text.includes(row.anchor), `${row.book} ${row.key} ${row.variant} 锚点`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, '没有核对到任何映射行');
});
