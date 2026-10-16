/* 正文管道表格渲染（assets/story-tables.js）。
 *
 * 盯住四件事：
 *   1. 识别带分隔行的表格及省略分隔行的数量表，普通含竖线的文字不受影响；
 *   2. 生成的 HTML 必须字符保真：去掉标签后，非空白字符序列与源文完全一致
 *      （混排渲染器就是按这个序列对齐并按字符偏移插图的，少一个字符插图就会失败）；
 *   3. 竖线与分隔行只是隐藏（display:none 的 span），没有被删掉；
 *   4. app.js 的正文渲染确实走了这个模块，页面也确实加载了它。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storyRoot = path.join(__dirname, "..");
const modulePath = path.join(storyRoot, "assets", "story-tables.js");
const appSource = fs.readFileSync(path.join(storyRoot, "assets", "app.js"), "utf8");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context);
const tables = context.window.ATO_STORY_TABLES;

const strip = (html) => String(html)
  .replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, "'");
const chars = (value) => String(value).replace(/\s/g, "");

test("模块导出可用", () => {
  assert.equal(tables.schema, 1);
  assert.equal(typeof tables.renderText, "function");
  assert.equal(typeof tables.hasTable, "function");
});

test("识别表头 + 分隔行 + 数据行，并保留全部非空白字符", () => {
  const source = [
    "等级1",
    "",
    "常规伤口堆 | 第二伤口堆 | 核心",
    "--- | --- | ---",
    "6 | 6 | +",
    "7+ | 6 | +",
    "",
    "下一段文字。",
  ].join("\n");
  const html = tables.renderText(source, (value) => value, (value) => value);
  assert.match(html, /class="story-table"/);
  assert.equal((html.match(/story-table-row/g) || []).length, 4, "表头 + 分隔行 + 2 数据行");
  assert.equal((html.match(/story-table-head/g) || []).length, 3, "表头 3 个单元格");
  assert.equal((html.match(/story-table-bar/g) || []).length, 8, "竖线全部保留为隐藏 span");
  assert.equal((html.match(/story-table-sep"/g) || []).length, 3, "分隔行的 3 个 --- 单元格保留为隐藏 span");
  assert.equal(chars(strip(html)), chars(source), "非空白字符一个不少、顺序不变");
  assert.match(html, /下一段文字。/, "表格外的文字照旧输出");
});

test("对齐标记、空单元格、单列表头也能识别", () => {
  const cases = [
    ["A | B | C", ":--- | :---: | ---:", "1 | 2 | 3"],
    ["方框数量 | ", "--- | ---", "1 | 1个泰坦到达山顶"],
    [" | ", "--- | ---", "时间1 | 查看0212"],
  ];
  for (const lines of cases) {
    const source = lines.join("\n");
    const html = tables.renderText(source, (value) => value, (value) => value);
    assert.match(html, /class="story-table"/, source);
    assert.equal(chars(strip(html)), chars(source), source);
  }
});

test("没有分隔行的数量/奖励表保留第一档数据及全部字符", () => {
  const source = [
    "特殊奖赏：",
    "",
    "伤口数量 | 奖励",
    "4 | 1份材料 & 额外资源",
    "5 | 2份材料，查看0123",
    "9或更多 | <稀有奖励>",
    "",
    "后续正文。",
  ].join("\r\n");
  const html = tables.renderText(source);
  assert.equal(tables.hasTable(source), true);
  assert.equal((html.match(/class="story-table"/g) || []).length, 1);
  assert.equal((html.match(/story-table-row/g) || []).length, 4);
  assert.equal((html.match(/story-table-head/g) || []).length, 2);
  assert.doesNotMatch(html, /story-table-sep/, "不存在分隔行时不能隐藏第一行数据");
  assert.match(html, /class="story-table-cell">4\s*</, "4伤口档必须显示");
  assert.match(html, /class="story-table-cell">\s*1份材料 &amp; 额外资源\s*</);
  assert.match(html, /&lt;稀有奖励&gt;/, "单元格仍按正文规则转义");
  assert.equal(chars(strip(html)), chars(source));
});

test("无分隔行的范围、加号与两端竖线仍能识别", () => {
  const source = "| 方框数量 | 伤口数量 |\n| 1 - 2 | 3 |\n| 3+ | 4 |";
  const html = tables.renderText(source);
  assert.equal(tables.hasTable(source), true);
  assert.equal((html.match(/story-table-cell/g) || []).length, 6);
  assert.equal(chars(strip(html)), chars(source));
});

test("普通含竖线的文字不会被误判", () => {
  const cases = [
    "命运潮汐：减少3［阿尔戈号命运］。",
    "选项 a | b 只是文字，没有分隔行。",
    "A | B\n--- 不是分隔行\n1 | 2",
    "A | B\n--- | ---",
    "A | B\n1 | 2",
    "选项 | 说明\n甲 | 第一种选择\n乙 | 第二种选择",
    "伤口数量 | 奖励\n4 | 材料\n5 | 更多材料 | 多余列",
    "伤口数量 | 奖励\n4 | 材料\n5 | ",
    "4 | 材料\n5 | 更多材料\n6 | 额外材料",
    "--- | ---\n4 | 材料\n5 | 更多材料",
  ];
  for (const source of cases) {
    const html = tables.renderText(source, (value) => value, (value) => value);
    assert.doesNotMatch(html, /class="story-table"/, source);
    assert.equal(chars(strip(html)), chars(source), source);
  }
});

test("hasTable 与 renderText 的判断一致", () => {
  assert.equal(tables.hasTable("A | B\n--- | ---\n1 | 2"), true);
  assert.equal(tables.hasTable("A | B\n--- | ---"), false, "只有表头没有数据行不算表格");
  assert.equal(tables.hasTable("普通正文，没有表格。"), false);
});

test("真实 C2 战斗正文里的表格能被识别且字符保真", () => {
  const dataPath = path.join(storyRoot, "data", "storybook-official-data.js");
  if (!fs.existsSync(dataPath)) return; // 干净检出没有本地数据
  const dataContext = { window: {} };
  vm.createContext(dataContext);
  vm.runInContext(fs.readFileSync(dataPath, "utf8"), dataContext);
  const books = dataContext.window.STORYBOOK_OFFICIAL_DATA?.books || [];
  const entry = books.flatMap((book) => book.entries).find((item) => item.key === "c2-731");
  assert.ok(entry, "C2 731 条目缺失");
  const text = entry.officialText || "";
  assert.ok(text.includes("常规伤口堆"), "正文里应有奖赏表");
  const html = tables.renderText(text, (value) => value, (value) => value);
  assert.equal((html.match(/class="story-table"/g) || []).length, 4, "c2-731 有 4 张表");
  assert.equal(chars(strip(html)), chars(text), "整篇正文的非空白字符不变");
});

test("真实吞域兽正文的胜利条件和六档奖励均渲染成表格", {
  skip: !fs.existsSync(path.join(storyRoot, "data", "storybook-official-data.js")),
}, () => {
  const dataContext = { window: {} };
  vm.createContext(dataContext);
  vm.runInContext(fs.readFileSync(path.join(storyRoot, "data", "storybook-official-data.js"), "utf8"), dataContext);
  const entry = dataContext.window.STORYBOOK_OFFICIAL_DATA.books
    .flatMap((book) => book.entries).find((item) => item.key === "c1-15-18");
  assert.ok(entry, "吞域兽条目缺失");
  const text = entry.officialText;
  assert.equal(tables.hasTable(text), true);
  const html = tables.renderText(text);
  assert.equal((html.match(/class="story-table"/g) || []).length, 2, "胜利条件和特殊奖赏两张表");
  assert.equal((html.match(/story-table-row/g) || []).length, 11, "两行表头、三档胜利条件、六档奖励");
  assert.doesNotMatch(html, /story-table-sep/, "原文没有分隔行，所有数据行都必须可见");
  assert.match(html, /class="story-table-cell">9或更多\s*</, "最后一档奖励完整显示");
  assert.equal(chars(strip(html)), chars(text), "正文和混排插图的字符定位保持一致");
});

test("app.js 的正文渲染接入表格模块，页面也加载了该脚本", () => {
  assert.match(appSource, /function storyTablesRender\(text\)/, "app.js 缺少 storyTablesRender");
  assert.match(appSource, /window\.ATO_STORY_TABLES/, "app.js 应读取 window.ATO_STORY_TABLES");
  assert.match(appSource, /storyTablesRender\(mode === "table"/, "分段正文渲染应走表格模块");
  assert.match(appSource, /renderHTML\(\s*\n?\s*mixedMediaContext\(entry\), entry\.text \|\| "", text => storyTablesRender\(text\)/,
    "混排 renderHTML 的格式化回调应走表格模块");
  for (const page of ["index.html", path.join("..", "ss", "index.html")]) {
    const html = fs.readFileSync(path.join(storyRoot, page), "utf8");
    assert.match(html, /story-tables\.js\?v=/, `${page} 应加载 assets/story-tables.js`);
  }
});
