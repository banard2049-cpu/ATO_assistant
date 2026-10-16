const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { create } = require("../assets/mixed-media/renderer.js");
const { harness } = require("./helpers/mixed-media-dom.cjs");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, "assets/story-tables.js"), "utf8"), context);
const tables = context.window.ATO_STORY_TABLES;
const rows = Array.from({ length: 10 }, (_, index) => [String(index + 1), `测试效果 ${index + 1} & 保留［测试资源］`]);
const chars = value => value.replace(/\s/g, "");
const fixtures = [
  ["掷骰 | 效果", ...rows.map(row => row.join(" | "))].join("\n\n"),
  ["掷骰结果", "效果", ...rows.flat()].join("\n\n"),
  ["投掷结果：效果", ...rows.map(row => row.join("："))].join("\n\n"),
  ["投掷结果 | 效果", ...rows.map(row => row.join(""))].join("\n\n"),
];

test("四种掷骰表提取格式均保留完整十档和正文字符", () => {
  for (const fixture of fixtures) {
    const source = `前言。\n\n${fixture}\n\n后续正文。`;
    const h = harness();
    h.container.innerHTML = tables.renderText(source);
    assert.equal(tables.hasTable(source), true);
    assert.equal(h.container.querySelectorAll(".story-table").length, 1);
    assert.equal(h.container.querySelectorAll(".story-table-row").length, 11);
    assert.equal(h.container.querySelectorAll(".story-table-head").length, 2);
    assert.equal(h.container.querySelectorAll(".story-table-sep-row").length, 0);
    const body = h.container.querySelectorAll(".story-table-row").slice(1);
    assert.deepEqual(body.map(row => row.querySelectorAll(".story-table-cell").map(cell => cell.textContent)), rows);
    assert.equal(chars(h.container.textContent), chars(source));
    assert.ok(h.container.textContent.includes("后续正文。"));
  }
});

test("不完整、乱序或没有明确掷骰表头的编号正文保持原样", () => {
  const cases = [
    fixtures[2].replace("投掷结果：效果", "编号：说明"),
    fixtures[2].replace(/\n\n10：[\s\S]*$/, ""),
    fixtures[2].replace("2：", "3："),
    ["掷骰结果", "效果", "1", "2", ...rows.slice(1).flat()].join("\n\n"),
  ];
  for (const source of cases) {
    const h = harness();
    h.container.innerHTML = tables.renderText(source);
    assert.equal(tables.hasTable(source), false);
    assert.equal(h.container.querySelectorAll(".story-table").length, 0);
    assert.equal(h.container.textContent, source);
  }
});

test("掷骰表与真实混排渲染器兼容，资源锚点仍位于对应效果格", () => {
  const h = harness();
  const source = fixtures[2];
  const needle = "［测试资源］";
  const start = source.indexOf(needle);
  const identity = { schema: 1, bookId: "c3", entryKey: "dice-fixture", variant: "fan" };
  const fingerprint = create(undefined, h.env).fingerprint(source);
  const runtime = create({ schema: 1, resourceSchema: 1, rows: [], resourceRows: [{
    book: "c3", key: identity.entryKey, variant: "fan", position: "replace",
    anchor: needle, replaceText: needle, anchorOccurrence: 1, anchorCount: 10,
    contextBefore: source.slice(0, start), contextAfter: source.slice(start + needle.length),
    textLength: source.length, textFingerprint: fingerprint,
    kind: "resource-icon", resourceLabel: "测试资源", layout: "inline",
    path: "story/assets/mixed-media/images/c3/dice-fixture.png",
  }] }, h.env);
  const result = runtime.renderHTML(identity, source, value => tables.renderText(value));
  assert.equal(result.count, 1);
  h.container.innerHTML = result.html;
  runtime.mount(h.container, result);
  const first = h.container.querySelectorAll(".story-table-row")[1].querySelectorAll(".story-table-cell")[1];
  assert.ok(h.container.querySelector("[data-ato-mm-source]"));
  assert.ok(first.querySelector("[data-ato-mm-item]"));
  assert.equal(chars(h.container.textContent), chars(source));
});

for (const [file, property, textField] of [
  ["storybook-data.js", "STORYBOOK_DATA", "text"],
  ["storybook-official-data.js", "STORYBOOK_OFFICIAL_DATA", "officialText"],
]) {
  const dataPath = path.join(root, "data", file);
  test(`${file} 的 C1/C3 事件均显示十档结果表`, { skip: !fs.existsSync(dataPath) }, () => {
    const data = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(dataPath, "utf8"), data);
    for (const key of ["c1-10-3", "c3-10-1"]) {
      const entry = data.window[property].books.flatMap(book => book.entries).find(item => item.key === key);
      assert.ok(entry, key);
      const source = entry[textField];
      const h = harness();
      h.container.innerHTML = tables.renderText(source);
      assert.equal(h.container.querySelectorAll(".story-table").length, 1, key);
      assert.equal(h.container.querySelectorAll(".story-table-row").length, 11, key);
      assert.equal(chars(h.container.textContent), chars(source), key);
    }
  });
}
