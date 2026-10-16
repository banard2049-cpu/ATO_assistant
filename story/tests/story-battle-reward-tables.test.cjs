const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { create } = require("../assets/mixed-media/renderer.js");
const { harness, escape } = require("./helpers/mixed-media-dom.cjs");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
function appFunction(name) {
  const start = new RegExp(`^  function ${name}\\(`, "m").exec(source);
  assert.ok(start, `missing ${name}`);
  const end = source.indexOf("\n  }", start.index);
  assert.ok(end > start.index, `missing end of ${name}`);
  return source.slice(start.index, end + 4);
}
function page(runtime) {
  const context = vm.createContext({
    window: { ATO_MIXED_MEDIA: runtime },
    currentBook: () => ({ id: "c1" }),
    storyVersion: "民间版", supportsOfficialVersion: () => true,
    mixedMediaRender: null, linkify: escape, escapeHtml: escape,
  });
  for (const name of ["mixedMediaRuntime", "mixedMediaContext", "normalizeTableCell",
    "isTableCellCandidate", "parseBattleTable", "renderBattleTable", "isSectionSubheading",
    "storyTablesRender", "prepareSectionedMedia", "renderBattleSectionedStory"]) {
    vm.runInContext(appFunction(name), context);
  }
  return context;
}
const blocksOf = text => text.split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
const chars = text => text.replace(/\s/g, "");
const plain = value => JSON.parse(JSON.stringify(value));
const longReward = "测试奖励 (" + "synthetic reward detail; ".repeat(8).slice(0, 171) + ")";
const victoryRows = [["1-2", "3"], ["3", "4"], ["4", "5"]];
const rewardRows = [
  ["4", "1 份测试材料 & 1［进展］"],
  ["5", longReward],
  ["6", "3 份虚构奖励"],
  ["7", "4 份虚构奖励，以及［测试卡］"],
  ["8", "5 份虚构奖励 <完整保留>"],
  ["9 或更多", "6 份虚构奖励及终档测试装备（第 46 张）。"],
];
const entry = {
  key: "reward-table-fixture", title: "测试战斗", chapterKey: "battle",
  text: ["测试战斗", "胜利条件：", "胜利说明。", "方框", "损伤", ...victoryRows.flat(),
    "继续战斗的说明。", "特殊奖励：", "不可叠加的奖励说明。", "损伤", "奖励",
    ...rewardRows.flat(), "后果", "获得奖励后继续阅读下一段。"].join("\n\n"),
};

test("独立段落中的吞域兽胜利条件、六档奖励和长奖励均识别完整", () => {
  const app = page();
  const blocks = blocksOf(entry.text);
  const victory = app.parseBattleTable(blocks, blocks.indexOf("方框"));
  assert.deepEqual(plain(victory.headers), ["方框", "损伤"]);
  assert.deepEqual(plain(victory.rows), victoryRows);
  assert.equal(blocks[victory.nextIndex], "继续战斗的说明。");
  const rewardStart = blocks.indexOf("奖励") - 1;
  const reward = app.parseBattleTable(blocks, rewardStart);
  assert.equal(longReward.length, 178, "覆盖真实奖励接近 180 字符的情况");
  assert.deepEqual(plain(reward.headers), ["损伤", "奖励"]);
  assert.deepEqual(plain(reward.rows), rewardRows);
  assert.equal(blocks[reward.nextIndex], "后果", "表格不吞掉后续正文");
});

test("现有框数/内容与损伤/所需资源表继续识别，普通段落不误判", () => {
  const app = page();
  for (const fixture of [
    ["框数", "内容", "1", "甲", "3+", "乙", "5+", "丙"],
    ["损伤", "所需资源", "5", "甲", "9", "乙", "11", "丙"],
    ["方框", "损伤", "1", "5", "2", "6", "3", "7", "4", "8", "5", "9"],
    ["方框", "失败", "1", "甲", "2", "乙", "3", "丙"],
  ]) {
    assert.equal(app.parseBattleTable(fixture, 0).rows.length, (fixture.length - 2) / 2);
  }
  for (const fixture of [
    ["损伤", "说明", "4", "甲", "5", "乙", "6", "丙"],
    ["损伤", "奖励", "4", "甲", "5", "乙"],
    ["损伤", "奖励", "4", "", "5", "乙", "6", "丙"],
    ["损伤", "奖励", "4", "甲", "5", "乙", "6", "丙".repeat(181)],
    ["方框", "损伤", "普通正文", "甲", "3", "乙", "4", "丙"],
  ]) {
    assert.equal(app.parseBattleTable(fixture, 0), null, fixture.join(" / "));
  }
});

function assertRenderedTables(app, item, expectedBody, h = harness()) {
  h.container.innerHTML = app.renderBattleSectionedStory(item, "");
  const tables = h.container.querySelectorAll(".battle-table");
  assert.equal(tables.length, 2, "胜利条件和特殊奖励各一张表");
  assert.equal(tables[0].querySelectorAll("tbody tr").length, 3);
  assert.equal(tables[1].querySelectorAll("tbody tr").length, 6);
  assert.equal(tables[1].querySelectorAll("tbody tr").at(-1).querySelector("td").textContent, "9 或更多");
  assert.equal(chars(h.container.textContent), chars(expectedBody), "完整正文的非空白字符及顺序保持不变");
  return { h, tables };
}

test("分段战斗正文实际渲染为两张表，并保留全部正文及特殊字符", () => {
  const { tables } = assertRenderedTables(page(), entry, entry.text.slice(entry.title.length));
  const renderedRows = tables[1].querySelectorAll("tbody tr").map(row => row.querySelectorAll("td").map(cell => cell.textContent));
  assert.deepEqual(renderedRows, rewardRows);
});

test("真实 mixed-media sectionRenderer 路径在奖励单元格内保留字符和插图锚点", async () => {
  const h = harness();
  const needle = "［进展］";
  const start = entry.text.indexOf(needle);
  const fingerprint = create(undefined, h.env).fingerprint(entry.text);
  const api = create({ schema: 1, resourceSchema: 1, rows: [], resourceRows: [{
    book: "c1", key: entry.key, variant: "fan", position: "replace",
    anchor: needle, replaceText: needle, anchorOccurrence: 1, anchorCount: 1,
    contextBefore: entry.text.slice(0, start), contextAfter: entry.text.slice(start + needle.length),
    textLength: entry.text.length, textFingerprint: fingerprint,
    kind: "resource-icon", resourceLabel: "进展", layout: "inline",
    path: "story/assets/mixed-media/images/c1/reward-table-fixture.png",
  }] }, h.env);
  const app = page(api);
  const { tables } = assertRenderedTables(app, entry, entry.text.slice(entry.title.length), h);
  assert.equal(app.mixedMediaRender.count, 1, "混排计划应命中单元格内的资源图标");
  const rewardCell = tables[1].querySelectorAll("tbody tr")[0].querySelectorAll("td")[1];
  assert.ok(rewardCell.querySelector("[data-ato-mm-source]"), "分段渲染在奖励单元格内保留格式化源文区域");
  api.mount(h.container, app.mixedMediaRender);
  assert.ok(rewardCell.querySelector("[data-ato-mm-item]"), "插图仍属于 4 损伤档的奖励单元格");
  assert.equal(h.document.imageRequests.length, 1, "挂载后在正确单元格加载图标");
  assert.equal(rewardCell.textContent, rewardRows[0][1]);
  assert.equal(chars(h.container.textContent), chars(entry.text.slice(entry.title.length)), "挂载混排后正文仍逐字保留");
  const image = h.document.imageRequests[0];
  image.complete = true;
  image.naturalWidth = image.naturalHeight = 70;
  image.dispatch("load");
  image.decodeResolve();
  await Promise.resolve();
  h.frames();
  assert.ok(rewardCell.querySelector(".ato-mm-resource img"), "图标解码成功后仍位于原奖励单元格");
  assert.equal(chars(h.container.textContent), chars(entry.text.slice(entry.title.length)), "图标显示后正文仍逐字保留");
});

const dataPath = path.join(root, "data/storybook-data.js");
test("本地真实民间版吞域兽条目的六档奖励、末档和完整正文均保留", {
  skip: !fs.existsSync(dataPath),
}, () => {
  const dataContext = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(dataPath, "utf8"), dataContext);
  const actual = dataContext.window.STORYBOOK_DATA.books.flatMap(book => book.entries)
    .find(item => item.key === "c1-15-18");
  assert.ok(actual, "吞域兽条目缺失");
  const blocks = blocksOf(actual.text);
  const app = page(create(undefined, harness().env));
  const parsed = app.parseBattleTable(blocks, blocks.indexOf("奖励") - 1);
  assert.equal(parsed.rows.length, 6);
  assert.deepEqual(plain(parsed.rows).map(row => row[0]), ["4", "5", "6", "7", "8", "9 或更多"]);
  assert.match(parsed.rows.at(-1)[1], /Pyramidion/);
  assert.equal(Math.max(...parsed.rows.map(row => row[1].length)), 178);
  // 原渲染器会省略正文开头的条目标题，以及连续重复的「胜利条件：」标题。
  const expectedBody = actual.text.slice(actual.title.length).replace("胜利条件：\n\n胜利条件：", "胜利条件：");
  const { tables } = assertRenderedTables(app, actual, expectedBody);
  const renderedRows = tables[1].querySelectorAll("tbody tr").map(row => row.querySelectorAll("td").map(cell => cell.textContent));
  assert.deepEqual(renderedRows, plain(parsed.rows), "实际长奖励和末档都不能截断");
});

test("本地真实赫尔墨斯追踪者条目的两张方框表和完整正文均保留", {
  skip: !fs.existsSync(dataPath),
}, () => {
  const dataContext = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(dataPath, "utf8"), dataContext);
  const actual = dataContext.window.STORYBOOK_DATA.books.flatMap(book => book.entries)
    .find(item => item.key === "c1-15-45");
  assert.ok(actual, "赫尔墨斯追踪者条目缺失");
  const blocks = blocksOf(actual.text);
  const app = page(create(undefined, harness().env));
  const victory = app.parseBattleTable(blocks, blocks.indexOf("方框"));
  const failure = app.parseBattleTable(blocks, blocks.indexOf("方框", victory.nextIndex));
  assert.deepEqual(plain(victory.rows), [["1", "5"], ["2", "6"], ["3", "7"], ["4", "8"], ["5", "9"]]);
  assert.deepEqual(plain(failure.rows).map(row => row[0]), ["1", "2", "3", "4"]);
  const h = harness();
  h.container.innerHTML = app.renderBattleSectionedStory(actual, "");
  const tables = h.container.querySelectorAll(".battle-table");
  assert.equal(tables.length, 2);
  for (const [index, parsed] of [victory, failure].entries()) {
    const rows = tables[index].querySelectorAll("tbody tr").map(row => row.querySelectorAll("td").map(cell => cell.textContent));
    assert.deepEqual(rows, plain(parsed.rows), "各档条件均应完整保留");
  }
  const expectedBody = actual.text.slice(actual.title.length)
    .replace("胜利条件（戏弄）：\n\n胜利条件（戏弄）：", "胜利条件（戏弄）：")
    .replace("后果：\n\n后果：", "后果：");
  assert.equal(chars(h.container.textContent), chars(expectedBody), "表格之外的全部非空白字符及顺序保持不变");
});
