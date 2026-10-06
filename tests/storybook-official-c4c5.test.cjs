/*
 * 官方故事书正文的覆盖范围回归。
 *
 * 背景：2026-10-06 交付的 storybook-official-data-c1-c5-20261006.js 把官方层从 C1–C3 扩到
 * C1–C5，C1–C3 一字未动。C4/C5 是照民间骨架整体并入的：只带 officialTitle/officialText，
 * 没有 officialSource / officialStatus / officialScan 这类需要原书图像才能成立的校对溯源字段，
 * 条目键与 story/data/storybook-data.js 一一对应，两个循环各 8 条「回忆突破」标题条目没有正文。
 *
 * 这些文件是本地私有数据（.gitignore 排除），所以本条与 tests/ 里其它读数据文件的用例一样
 * 只在本机跑；数据缺失时整条跳过，不让干净检出失败。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const OFFICIAL = 'story/data/storybook-official-data.js';
const FAN = 'story/data/storybook-data.js';
const IMPORT_SHA256 = '90b82db7c23e0f4f881e267cdf8e5b92484a448e69e5a2cd1f6b90b6b8e2bf68';
const local = fs.existsSync(path.join(root, OFFICIAL)) && fs.existsSync(path.join(root, FAN));

function loadWindow(file, key) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  return sandbox.window[key];
}

test('官方正文覆盖 C1–C5，条目数与民间骨架对齐', { skip: !local }, () => {
  const official = loadWindow(OFFICIAL, 'STORYBOOK_OFFICIAL_DATA');
  const fan = loadWindow(FAN, 'STORYBOOK_DATA');
  const counts = Object.fromEntries(official.books.map((book) => [book.id, book.entries.length]));
  assert.deepEqual(counts, { c1: 747, c2: 758, c3: 743, c4: 898, c5: 1077 });

  for (const id of ['c4', 'c5']) {
    const book = official.books.find((item) => item.id === id);
    const fanBook = fan.books.find((item) => item.id === id);
    assert.ok(book && fanBook, `缺少 ${id}`);
    const officialKeys = new Set(book.entries.map((entry) => entry.key));
    const fanKeys = new Set(fanBook.entries.map((entry) => entry.key));
    assert.deepEqual([...officialKeys].sort(), [...fanKeys].sort(), `${id} 条目键与民间数据不一致`);

    const fanByKey = new Map(fanBook.entries.map((entry) => [entry.key, entry]));
    const withoutBody = [];
    for (const entry of book.entries) {
      assert.ok(String(entry.officialTitle || '').trim(), `${id}/${entry.key} 缺 officialTitle`);
      if (!String(entry.officialText || '').trim()) {
        withoutBody.push(entry.key);
        // 只有民间骨架本来就没有正文的标题条目才允许空正文。
        assert.equal(String(fanByKey.get(entry.key)?.text || '').trim(), '', `${id}/${entry.key} 官方正文缺失但民间有正文`);
      }
    }
    assert.equal(withoutBody.length, 8, `${id} 无正文条目数变化：${withoutBody.join(',')}`);
    assert.ok(
      book.entries.every((entry) => entry.chapterKey === 'mnemos-breakthroughs' || String(entry.officialText || '').trim()),
      `${id} 只有回忆突破标题条目允许没有正文`,
    );
  }
});

test('C1–C3 的官方来源元数据与 C4/C5 的导入记录都还在', { skip: !local }, () => {
  const official = loadWindow(OFFICIAL, 'STORYBOOK_OFFICIAL_DATA');
  for (const id of ['c1', 'c2', 'c3']) {
    const book = official.books.find((item) => item.id === id);
    const missing = book.entries.filter((entry) => !entry.officialSource);
    assert.deepEqual([...missing].map((entry) => entry.key), [], `${id} 有条目丢了 officialSource`);
  }
  const imports = official.officialVersion?.officialTextImports || [];
  assert.equal(imports.length, 1);
  assert.equal(imports[0].inputSha256, IMPORT_SHA256);
  assert.deepEqual(Object.keys(imports[0].books).sort(), ['c4', 'c5']);
});
