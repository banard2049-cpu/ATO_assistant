// 抽出卡片的显示与「放回暂时移出」按钮的行为约束：
// 1) 抽出的牌只显示牌面：天数/卡名/黑底编号、移出·连抽标签、以及「本次探索结果（N 张）」
//    标题都不再显示（卡面自己印着这些信息，张数由上方状态行说明）；
// 2) 悬停/聚焦不再弹出「暂时移出牌堆」预览浮层 —— 鼠标扫过按钮就弹窗会挡住牌面；
//    暂时移出的牌在下方的「暂时移出牌堆」折叠区里本来就能看到；
// 3) 按钮本身照旧只做放回，牌数照旧写在按钮文字里；
// 4) 「已选 N / M 张」跟在「选择探索卡库」入口后面，不再显示在工具条上；
// 5) 自动结算按钮仍然只出现在「本次探索结果」的牌上，不出现在暂时移出的牌上。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extractBalanced(text, start, openChar, closeChar) {
  const open = text.indexOf(openChar, start);
  if (open < 0) throw new Error(`Missing ${openChar} after offset ${start}.`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) depth -= 1;
    if (depth === 0) return text.slice(open, index + 1);
  }
  throw new Error(`Unclosed ${openChar} after offset ${start}.`);
}

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${name}.`);
  const body = extractBalanced(text, start, "{", "}");
  return text.slice(start, text.indexOf("{", start)) + body;
}

// index.html 的内联脚本必须还能编译。
const inlineScripts = Array.from(source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((match) => match[1])
  .filter((script) => script.trim());
assert.ok(inlineScripts.length > 0, "index.html has no inline script.");
inlineScripts.forEach((script, index) => {
  new vm.Script(script, { filename: `index.html:inline-${index + 1}` });
});

function createElement(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    className: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    checked: false,
    value: "",
    type: "",
    style: { cssText: "", setProperty() {} },
    children: [],
    listeners: {},
    attributes: {},
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getBoundingClientRect() { return { left: 10, right: 120, top: 40, bottom: 70, width: 110, height: 30 }; },
    matches() { return false; },
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function descendants(node) {
  return (node.children || []).flatMap((child) => [child, ...descendants(child)]);
}

function collectClass(node, className) {
  return descendants(node).filter((child) => String(child.className || "").split(/\s+/).includes(className));
}

const settleCalls = [];
const searcher = { library: [], selected: [], drawState: null, specialRule: null };

const context = vm.createContext({
  console,
  document: { createElement },
  window: {},
  escapeHtml: (value) => String(value),
  currentCycleConfig: () => ({ id: "c1" }),
  defaultExplorationSelections: { c1: [] },
  getExplorationLibrary: () => searcher.library,
  getSelectedExplorationIds: () => searcher.selected,
  ensureExplorationDrawState: () => searcher.drawState,
  getExplorationSpecialRule: () => searcher.specialRule,
  getDestructionPileIds: () => [],
  getDestructionCardIds: () => [],
  addCardToDestructionPile() {},
  applyExplorationSelection() {},
  restoreDefaultExplorationSelection() {},
  createExplorationFactionStatus: () => createElement("div"),
  createExplorationDestructionTools: () => null,
  createHiddenExplorationMenu: () => createElement("details"),
  createExplorationSettleBlock: (entry) => {
    settleCalls.push(entry.id);
    const block = createElement("div");
    block.className = "exploration-settle";
    return block;
  },
  getExplorationCardImageStyle: () => "background-image:url(card.png)",
  getExplorationCornerNumber: () => "",
  getExplorationCardTag: () => ({ removal: "remove", draw: "single" }),
  drawExplorationCard() {},
  endExplorationDraw() {},
  returnTemporaryExplorationCards() {},
});
vm.runInContext(extractFunction(source, "createExplorationTools"), context);

searcher.library = [
  { id: "6404", name: "Trade Post" },
  { id: "6411", name: "Weapons Cache" },
];
searcher.selected = ["6404", "6411"];
searcher.drawState = {
  drawPile: [],
  activePiles: [[{ id: "6404", name: "Trade Post", day: 12, removal: "remove", draw: "single", pile: 0 }]],
  temporaryRemoved: [
    { id: "6411", name: "Weapons Cache", day: 12, removal: "remove", draw: "single" },
    { id: "6404", name: "Trade Post", day: 12, removal: "remove", draw: "single" },
  ],
  permanentRemoved: [],
  history: [],
};

const wrapper = context.createExplorationTools();

// 1) 抽出的牌只显示牌面：卡下面的文字与「本次探索结果」标题都不再生成。
assert.deepEqual(collectClass(wrapper, "exploration-drawn-meta"), [], "卡下面的天数/卡名/黑底编号不该再显示");
assert.deepEqual(collectClass(wrapper, "exploration-card-tag"), [], "移出·连抽标签不该再显示");
assert.deepEqual(collectClass(wrapper, "exploration-drawn-title"), [], "「本次探索结果」标题不该再显示");
assert.ok(!descendants(wrapper).some((node) => String(node.textContent || "").includes("本次探索结果")),
  "页面上不该再出现「本次探索结果」字样");
const cardFaces = collectClass(wrapper, "exploration-drawn-face");
assert.equal(cardFaces.length, 3, "三张牌面（本次结果 1 张 + 暂时移出 2 张）都要显示");
assert.deepEqual(cardFaces.map((face) => face.attributes["aria-label"]),
  ["Trade Post #6404", "Weapons Cache #6411", "Trade Post #6404"],
  "牌面仍要保留可读的卡名与编号");

// 2) 悬停预览浮层已经移除。
assert.deepEqual(collectClass(wrapper, "exploration-return-preview"), [], "暂时移出预览浮层不该再出现");
assert.deepEqual(collectClass(wrapper, "exploration-return-preview-title"), []);

const returnButton = descendants(wrapper)
  .find((node) => node.tagName === "BUTTON" && String(node.textContent).startsWith("放回暂时移出"));
assert.ok(returnButton, "找不到「放回暂时移出」按钮");
assert.equal(returnButton.textContent, "放回暂时移出（2）", "按钮仍要写明暂时移出的牌数");
assert.deepEqual(Object.keys(returnButton.listeners), ["click"], "按钮只该保留放回这一个点击行为");
assert.equal(returnButton.attributes["aria-haspopup"], undefined, "按钮不该再声明弹出层");

// 3) 暂时移出的牌仍然能在折叠区里看到。
const pileHeads = descendants(wrapper).filter((node) => String(node.textContent || "").startsWith("暂时移出牌堆（"));
assert.equal(pileHeads.length, 1, "暂时移出牌堆折叠区要保留");
const pileSection = descendants(wrapper).find((node) => node.tagName === "DETAILS" && node.className === "exploration-removed-pile");
assert.ok(pileSection, "暂时移出牌堆的折叠区没了");
assert.equal(collectClass(pileSection, "exploration-drawn-card").length, 2, "折叠区里要列出两张暂时移出的牌");

// 4) 「已选 N / M 张」跟在「选择探索卡库」入口后面，不再占用工具条。
const counts = collectClass(wrapper, "exploration-count");
assert.equal(counts.length, 1, "已选张数只该出现一次");
assert.equal(counts[0].textContent, "已选 2 / 2 张");
const toolbar = collectClass(wrapper, "exploration-toolbar")[0];
assert.ok(toolbar, "工具条没了");
assert.equal(collectClass(toolbar, "exploration-count").length, 0, "工具条上不该再显示已选张数");
const builder = collectClass(wrapper, "exploration-builder")[0];
assert.ok(builder, "「选择探索卡库」入口没了");
assert.equal(wrapper.children[wrapper.children.indexOf(builder) + 1], counts[0],
  "已选张数要紧跟在「选择探索卡库」后面");

// 5) 自动结算只挂在本次探索结果上。
assert.deepEqual(settleCalls, ["6404"], "只有本次探索结果的牌才生成结算区块");
const activeGrid = collectClass(wrapper, "exploration-active-grid")[0];
assert.ok(activeGrid, "本次探索结果的网格没了");
assert.equal(collectClass(activeGrid, "exploration-settle").length, 1, "本次探索结果的牌要带结算区块");
assert.equal(collectClass(pileSection, "exploration-settle").length, 0, "暂时移出的牌不该带结算区块");

console.log("exploration drawn card tests passed");
