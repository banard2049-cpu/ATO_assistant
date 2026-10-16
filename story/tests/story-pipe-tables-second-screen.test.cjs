"use strict";

// Exercise the real second-screen adapter with synthetic official-style tables.
// Run: node story/tests/story-pipe-tables-second-screen.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { create } = require("../assets/mixed-media/renderer.js");
const { harness } = require("./helpers/mixed-media-dom.cjs");

const root = path.resolve(__dirname, "../..");
const ssSource = fs.readFileSync(path.join(root, "ss/app.js"), "utf8");
const tableSource = fs.readFileSync(path.join(root, "story/assets/story-tables.js"), "utf8");
const identity = { schema: 1, bookId: "c1", entryKey: "pipe-table-fixture", variant: "official" };
const victoryRows = [["1-2", "3"], ["3", "4"], ["4+", "5"]];
const rewardRows = [
  ["4", "1份测试材料 & 1［进展］"],
  ["5", "2份虚构奖励，查看0123"],
  ["6", "3份虚构奖励"],
  ["7", "4份虚构奖励及'测试卡'"],
  ["8", "5份虚构奖励 <完整保留>"],
  ["9或更多", '6份虚构奖励、"测试装备"与2［灵感］'],
];
const text = [
  "合成战斗说明。", "", "方框数量 | 伤口数量",
  ...victoryRows.map(row => row.join(" | ")),
  "", "特殊奖赏：", "", "伤口数量 | 奖励",
  ...rewardRows.map(row => row.join(" | ")),
  "", "后续正文仍须保留。",
].join("\r\n");
const chars = value => String(value).replace(/\s/g, "");

function ssFunction(name) {
  const start = new RegExp(`^function ${name}\\(`, "m").exec(ssSource);
  assert.ok(start, `missing ss function ${name}`);
  const end = ssSource.indexOf("\n}", start.index);
  assert.ok(end > start.index, `missing end of ${name}`);
  return ssSource.slice(start.index, end + 2);
}

function page(h, runtime) {
  h.env.location.href = "https://qa.invalid/subdir/ato/ss/index.html";
  const context = vm.createContext({
    window: { ATO_MIXED_MEDIA: runtime, location: h.env.location },
    document: h.document, elements: { storyBody: h.container }, activeMode: "story",
    fitStoryTextToViewport() {},
  });
  vm.runInContext(tableSource, context);
  for (const name of ["mixedMediaRuntime", "escapeStoryText", "storyTablesHtml", "renderMixedStoryBody"]) {
    vm.runInContext(ssFunction(name), context);
  }
  return context;
}

// Delegate to the real implementation while recording which adapter branch ran.
function observed(api) {
  const calls = {};
  const runtime = { ...api };
  for (const name of ["renderInto", "enhanceHTML", "mount", "dispose"]) {
    runtime[name] = (...args) => {
      calls[name] = (calls[name] || 0) + 1;
      return api[name](...args);
    };
  }
  return { runtime, calls };
}

function assertTables(h) {
  const tables = h.container.querySelectorAll(".story-table");
  assert.equal(tables.length, 2, "数量条件和六档奖励分别显示成表格");
  assert.deepEqual(tables.map(table => table.querySelectorAll(".story-table-row").length), [4, 7]);
  for (const [table, rows] of [[tables[0], victoryRows], [tables[1], rewardRows]]) {
    const actual = table.querySelectorAll(".story-table-row").slice(1)
      .map(row => row.querySelectorAll(".story-table-cell").map(cell => cell.textContent.trim()));
    assert.deepEqual(actual, rows, "所有数据档及特殊字符均完整保留");
  }
  assert.equal(h.container.querySelectorAll(".story-table-sep-row, .story-table-sep").length, 0,
    "无分隔行的首档奖励不能被当作分隔行隐藏");
  const firstReward = tables[1].querySelectorAll(".story-table-row")[1];
  assert.equal(firstReward.hidden, false);
  assert.equal(firstReward.getAttribute("aria-hidden"), null);
  assert.equal(firstReward.querySelector(".story-table-cell").textContent.trim(), "4");
  assert.equal(chars(h.container.textContent), chars(text), "源文全部非空白字符及顺序保持不变");
  assert.ok(h.container.innerHTML.includes("&lt;完整保留&gt;"), "单元格中的尖括号须按文本转义");
  return tables;
}

function resourceMapping(api) {
  return { schema: 1, resourceSchema: 1, rows: [], resourceRows: ["进展", "灵感"].map(label => {
    const needle = `［${label}］`;
    const start = text.indexOf(needle);
    return {
      book: identity.bookId, key: identity.entryKey, variant: identity.variant,
      kind: "resource-icon", resourceLabel: label, layout: "inline",
      position: "replace", anchor: needle, replaceText: needle, anchorOccurrence: 1, anchorCount: 1,
      contextBefore: text.slice(0, start), contextAfter: text.slice(start + needle.length),
      textLength: text.length, textFingerprint: api.fingerprint(text),
      path: `story/assets/mixed-media/images/c1/pipe-table-${label === "进展" ? "progress" : "inspiration"}.png`,
    };
  }) };
}

const tick = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
async function ready(h, image) {
  image.complete = true;
  image.naturalWidth = 70;
  image.naturalHeight = 70;
  image.dispatch("load");
  await tick();
  image.decodeResolve?.();
  await tick();
  h.frames();
  await tick();
}

test("第二屏没有混排 runtime 时也识别无分隔行的官方数量/奖励表", () => {
  const h = harness();
  const app = page(h);
  h.container.scrollTop = 25;
  h.container.scrollLeft = 30;
  assert.equal(typeof app.storyTablesHtml(text), "string");
  app.renderMixedStoryBody({ mixedMedia: identity }, text);
  assertTables(h);
  assert.equal(h.container.scrollTop, 0);
  assert.equal(h.container.scrollLeft, 0);
});

test("第二屏有真实混排 runtime 时通过 enhanceHTML 和 mount 保留数量/奖励表", () => {
  const h = harness();
  const { runtime, calls } = observed(create(undefined, h.env));
  const app = page(h, runtime);
  app.renderMixedStoryBody({ mixedMedia: identity }, text);
  assertTables(h);
  assert.deepEqual(calls, { dispose: 1, enhanceHTML: 1, mount: 1 });
});

test("真实混排资源图标在首档和末档对应奖励单元格内加载、显示及回退", async () => {
  const h = harness();
  const api = create(resourceMapping(create(undefined, h.env)), h.env);
  const app = page(h, api);
  assert.equal(api.plan(identity, text).count, 2);
  app.renderMixedStoryBody({ mixedMedia: identity }, text);
  const tables = assertTables(h);
  const rewardCells = tables[1].querySelectorAll(".story-table-row").slice(1)
    .map(row => row.querySelectorAll(".story-table-cell")[1]);
  for (const index of [0, 5]) {
    assert.equal(rewardCells[index].querySelectorAll("[data-ato-mm-item]").length, 1,
      `${index === 0 ? "首" : "末"}档资源图标锚点仍在奖励单元格内`);
  }
  assert.equal(h.document.imageRequests.length, 2);
  for (const image of [...h.document.imageRequests]) await ready(h, image);
  assertTables(h);
  assert.equal(rewardCells[0].querySelectorAll(".ato-mm-resource").length, 1);
  assert.equal(rewardCells[5].querySelectorAll(".ato-mm-resource").length, 1);
  assert.equal(h.container.querySelectorAll(".ato-mm-resource").length, 2);
  for (const image of [...h.document.imageRequests]) image.dispatch("error");
  h.frames();
  assertTables(h);
  assert.equal(h.container.querySelectorAll(".ato-mm-resource").length, 0);
  assert.equal(rewardCells[0].textContent.trim(), rewardRows[0][1]);
  assert.equal(rewardCells[5].textContent.trim(), rewardRows[5][1]);
  api.dispose(h.container);
});

test("普通竖线文字在无混排 runtime 时保持原来的纯文本路径", () => {
  const h = harness();
  const app = page(h);
  const plain = "选项甲 | 选项乙只是正文。\n<保留> & '引号'";
  assert.equal(app.storyTablesHtml(plain), null);
  app.renderMixedStoryBody({}, plain);
  assert.equal(h.container.textContent, plain);
  assert.equal(h.container.children.length, 0);
});

test("普通竖线文字在有真实混排 runtime 时保持 renderInto 路径", () => {
  const h = harness();
  const { runtime, calls } = observed(create(undefined, h.env));
  const app = page(h, runtime);
  const plain = "选项 | 说明\n甲 | 普通选择\n乙 | 另一选择 & <正文>";
  assert.equal(app.storyTablesHtml(plain), null);
  app.renderMixedStoryBody({ mixedMedia: identity }, plain);
  assert.equal(h.container.textContent, plain);
  assert.equal(h.container.querySelectorAll(".story-table").length, 0);
  assert.deepEqual(calls, { renderInto: 1 });
});
