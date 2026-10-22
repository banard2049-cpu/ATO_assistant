// 抽出卡片的显示与「放回暂时移出」按钮的行为约束：
// 1) 抽出的牌只显示牌面：天数/卡名/黑底编号、移出·连抽标签、以及「本次探索结果（N 张）」
//    标题都不再显示（卡面自己印着这些信息，张数由上方状态行说明）；
// 2) 悬停/聚焦不再弹出「暂时移出牌堆」预览浮层 —— 鼠标扫过按钮就弹窗会挡住牌面；
//    暂时移出的牌在下方的「暂时移出牌堆」折叠区里本来就能看到；
// 3) 按钮本身照旧只做放回，牌数照旧写在按钮文字里；
// 4) 「已选 N / M 张」放在折叠的卡库内容开头，不再显示在工具条上；
// 5) 自动结算按钮仍然只出现在「本次探索结果」的牌上，不出现在暂时移出的牌上。
// 6) 工具条的一键结算执行自动效果，不直接结束仍有待办的探索。
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
    // 这几个插入方法要像真 DOM 一样"搬移"节点：否则"把卡库内容在两个折叠区之间搬来搬去"
    // 的代码在测试里会同时出现在两边，断言就失去意义了。
    _detach(node) {
      if (node && node.parentNode) {
        const at = node.parentNode.children.indexOf(node);
        if (at >= 0) node.parentNode.children.splice(at, 1);
      }
    },
    append(...nodes) {
      nodes.forEach((node) => this.appendChild(node));
    },
    prepend(...nodes) {
      nodes.reverse().forEach((node) => {
        this._detach(node);
        node.parentNode = this;
        this.children.unshift(node);
      });
    },
    appendChild(node) {
      this._detach(node);
      node.parentNode = this;
      this.children.push(node);
      return node;
    },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getBoundingClientRect() { return { left: 10, right: 120, top: 40, bottom: 70, width: 110, height: 30 }; },
    matches() { return false; },
    contains(child) { return descendants(this).includes(child); },
    querySelector() { return null; },
    querySelectorAll(selector) {
      return descendants(this).filter((node) =>
        selector === 'input[type="checkbox"]:checked' && node.tagName === "INPUT" && node.type === "checkbox" && node.checked);
    },
  };
}

function descendants(node) {
  return (node.children || []).flatMap((child) => [child, ...descendants(child)]);
}

function collectClass(node, className) {
  return descendants(node).filter((child) => String(child.className || "").split(/\s+/).includes(className));
}

const settleCalls = [];
const toolbarCalls = [];
const selectionCalls = [];
const imageCalls = [];
const searcher = { library: [], selected: [], drawState: null, specialRule: null, settlePrepared: false };

const context = vm.createContext({
  console,
  document: { createElement },
  window: {},
  state: { exploration: { lastSettlementByCycle: {} } },
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
  applyExplorationSelection(ids) { selectionCalls.push(Array.from(ids)); },
  restoreDefaultExplorationSelection() {},
  createExplorationFactionStatus: () => createElement("div"),
  // 「一键结算 → 结算完毕」两段式：准备好时主控台会把按钮文本换掉。
  get explorationSettlePrepared() { return searcher.settlePrepared === true; },
  completeExplorationDraw() { toolbarCalls.push('complete'); },
  pendingExplorationEffects: () => ['Trade Post：请选择首次获得的资源'],
  pendingExplorationTokenReminders: () => [],
  createExplorationDestructionTools: () => null,
  createHiddenExplorationMenu: () => createElement("details"),
  createExplorationSettleBlock: (entry) => {
    settleCalls.push(entry.id);
    const block = createElement("div");
    block.className = "exploration-settle";
    return block;
  },
  getExplorationCardImageStyle: (id) => { imageCalls.push(id); return "background-image:url(card.png)"; },
  getExplorationCornerNumber: () => "",
  getExplorationCardTag: () => ({ removal: "remove", draw: "single" }),
  drawExplorationCard() { toolbarCalls.push('draw'); },
  settleExplorationDraw() { toolbarCalls.push('settle'); },
  mutateExplorationRecord() {},
  endExplorationDraw() { toolbarCalls.push('end'); },
  returnTemporaryExplorationCards() {},
  yieldToPaint: async () => {},
});
vm.runInContext(extractFunction(source, "createExplorationTools"), context);

async function main() {
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
assert.equal(cardFaces.length, 1, "折叠时只创建本次结果牌面，不创建暂时移出牌面");
assert.deepEqual(cardFaces.map((face) => face.attributes["aria-label"]),
  ["Trade Post #6404"],
  "牌面仍要保留可读的卡名与编号");
assert.deepEqual(imageCalls, ["6404"], "折叠时不能为卡库或暂时移出牌堆创建图片预览");
assert.equal(collectClass(wrapper, "exploration-builder-body").length, 0, "折叠时不能构建卡库内容");

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
assert.equal(collectClass(pileSection, "exploration-drawn-card").length, 0, "暂时移出的牌等展开再创建");
pileSection.open = true;
pileSection.listeners.toggle[0]();
assert.equal(collectClass(pileSection, "exploration-drawn-card").length, 2, "折叠区里要列出两张暂时移出的牌");
assert.deepEqual(collectClass(pileSection, "exploration-drawn-face").map((face) => face.attributes["aria-label"]),
  ["Weapons Cache #6411", "Trade Post #6404"]);
assert.equal(collectClass(pileSection, "exploration-library-preview").length, 2, "首次展开暂时移出牌堆也提供卡库");
pileSection.open = false;
pileSection.listeners.toggle[0]();

// 4) 「已选 N / M 张」跟随卡库一起折叠，不再占用工具条。
const counts = collectClass(wrapper, "exploration-count");
assert.equal(counts.length, 1, "已选张数只该出现一次");
assert.equal(counts[0].textContent, "已选 2 / 2 张");
const toolbar = collectClass(wrapper, "exploration-toolbar")[0];
assert.ok(toolbar, "工具条没了");
assert.equal(collectClass(toolbar, "exploration-count").length, 0, "工具条上不该再显示已选张数");
const builder = collectClass(wrapper, "exploration-builder")[0];
assert.ok(builder, "「选择探索卡库」入口没了");
assert.equal(collectClass(builder, "exploration-count")[0], counts[0],
  "已选张数要放在折叠的卡库内容内");
assert.equal(builder.children[1].children[0], counts[0],
  "已选张数要位于卡库内容开头");

// 4b) 「暂时移出牌堆」与「选择探索卡库」并排两栏，且同时只会打开一个。
const has = (node, child) => descendants(node).includes(child);
const paneRow = collectClass(wrapper, "exploration-removed-piles")[0];
const pilePane = collectClass(wrapper, "exploration-removed-pile")[0];
const libraryBody = collectClass(wrapper, "exploration-builder-body")[0];
const firstCheckbox = descendants(libraryBody).find((node) => node.tagName === "INPUT");
firstCheckbox.checked = false;
const imageCountAfterOpen = imageCalls.length;
assert.ok(paneRow && pilePane, "两个折叠区都要挂在并排的包裹层里");
assert.equal(paneRow.children.length, 2, "包裹层里正好是两个折叠区");
assert.equal(paneRow.children[0], pilePane);
assert.equal(paneRow.children[1], builder);
builder.open = true;
builder.listeners.toggle[0]();
assert.equal(pilePane.open, false, "打开卡库要收起暂时移出牌堆");
assert.ok(!has(pilePane, counts[0]), "卡库收起后内容搬回自己的折叠区");
builder.open = false;
builder.listeners.toggle[0]();
pilePane.open = true;
pilePane.listeners.toggle[0]();
assert.equal(builder.open, false, "打开暂时移出牌堆要收起卡库");
assert.ok(has(pilePane, counts[0]), "卡库内容跟着搬到打开的那个折叠区里");
pilePane.open = false;
pilePane.listeners.toggle[0]();
assert.ok(has(builder, counts[0]), "收起后卡库内容搬回卡库折叠区");
assert.ok(!has(pilePane, counts[0]));
assert.equal(collectClass(wrapper, "exploration-builder-body")[0], libraryBody, "两个入口必须复用同一个卡库");
assert.equal(imageCalls.length, imageCountAfterOpen, "反复开合不能重建卡库或暂时移出牌面");
assert.equal(firstCheckbox.checked, false, "切换折叠区不能丢失未应用的勾选");
descendants(libraryBody).find((node) => node.textContent === "应用选择").listeners.click[0]();
assert.deepEqual(selectionCalls, [["6411"]], "应用选择应读取搬动后仍保留的草稿");

// 折叠事件可能延迟到另一个入口已打开后才送达，不能把卡库搬回刚收起的一侧。
pilePane.open = true;
pilePane.listeners.toggle[0]();
builder.open = true;
builder.listeners.toggle[0]();
pilePane.listeners.toggle[0]();
assert.ok(has(builder, libraryBody));
assert.equal(pilePane.open, false);
assert.equal(imageCalls.length, imageCountAfterOpen);

// 5) 自动结算只挂在本次探索结果上。
assert.deepEqual(settleCalls, ["6404"], "只有本次探索结果的牌才生成结算区块");
const activeGrid = collectClass(wrapper, "exploration-active-grid")[0];
assert.ok(activeGrid, "本次探索结果的网格没了");
assert.equal(collectClass(activeGrid, "exploration-settle").length, 1, "本次探索结果的牌要带结算区块");
assert.equal(collectClass(pileSection, "exploration-settle").length, 0, "暂时移出的牌不该带结算区块");

// 6) 一键结算入口与手动结束入口保持独立，当前有牌时不重新抽牌。
const settleButton = descendants(toolbar).find((node) => node.tagName === "BUTTON" && node.textContent === "一键结算");
assert.ok(settleButton, "工具条应将结算完毕改为一键结算");
assert.equal(settleButton.disabled, false);
assert.ok(!descendants(toolbar).some((node) => node.textContent === "结算完毕"));
await settleButton.listeners.click[0]();
assert.deepEqual(toolbarCalls, ['settle'], "一键结算应调用自动结算，不能直接结束探索");

// 6b) 自动结算后仍有手工项：按钮变成「结算完毕」，再点一次走 completeExplorationDraw。
searcher.settlePrepared = true;
const finishTools = context.createExplorationTools();
const finishButton = descendants(finishTools).find((node) => node.tagName === "BUTTON" && node.textContent === "结算完毕");
assert.ok(finishButton, "自动结算后仍有待办时，按钮文本要变成「结算完毕」");
await finishButton.listeners.click[0]();
assert.deepEqual(toolbarCalls, ['settle', 'complete'], "「结算完毕」应结束本轮探索而不是再跑一次自动结算");
searcher.settlePrepared = false;

searcher.drawState.activePiles = [[], []];
const idleTools = context.createExplorationTools();
const drawButton = descendants(idleTools).find((node) => node.tagName === "BUTTON" && node.textContent === "抽探索卡");
assert.ok(drawButton, "没有待结算卡时仍显示抽探索卡");
drawButton.listeners.click[0]();
assert.deepEqual(toolbarCalls, ['settle', 'complete', 'draw']);
assert.ok(!descendants(idleTools).some((node) => node.textContent === "一键结算"));

searcher.drawState.activePiles = [[{ id: '6404', name: 'Trade Post', day: 12 }], []];
context.settleExplorationDraw.busy = true;
const busyTools = context.createExplorationTools();
assert.equal(descendants(busyTools).find((node) => node.textContent === "一键结算").disabled, true,
  "结算期间应禁用一键结算，防止重复写入");
context.settleExplorationDraw.busy = false;
context.state.exploration.lastSettlementByCycle.c1 = {
  completed: ['Trade Post：船材 +2'], pending: ['a stale pending item'],
};
const reportedTools = context.createExplorationTools();
const report = collectClass(reportedTools, 'exploration-batch-report')[0];
assert.ok(report, '结算后应显示自动处理结果和剩余待办');
assert.equal(report.attributes['aria-live'], 'polite');
// 「查看自动结算明细」已整块删除：报告里只有概括行 + 待手动处理的清单，
// 逐条自动处理结果（'Trade Post：船材 +2'）不再渲染。
assert.match(collectClass(report, 'exploration-batch-result')[0].textContent, /自动处理 1 项.*还有 1 项/);
assert.equal(collectClass(report, 'exploration-settle-details').length, 0, '结算明细折叠区应该已经删掉');
assert.ok(descendants(report).some((node) => node.textContent === 'Trade Post：请选择首次获得的资源'),
  '当前待办应从当前卡牌重新读取');
assert.ok(!descendants(report).some((node) => node.textContent === 'a stale pending item'));
assert.ok(!descendants(report).some((node) => node.textContent === 'Trade Post：船材 +2'),
  '自动处理明细不再逐条列出');

// 卡库先展开时，不创建暂时移出的牌；空牌堆入口也应可展开并复用同一卡库。
searcher.drawState.activePiles = [];
searcher.drawState.temporaryRemoved = [];
delete context.state.exploration.lastSettlementByCycle.c1;
const emptyTools = context.createExplorationTools();
const emptyBuilder = collectClass(emptyTools, "exploration-builder")[0];
const emptyPile = collectClass(emptyTools, "exploration-removed-pile")[0];
emptyBuilder.listeners.toggle[0]();
assert.equal(collectClass(emptyTools, "exploration-builder-body").length, 0, "关闭事件不应触发懒构建");
emptyBuilder.open = true;
emptyBuilder.listeners.toggle[0]();
assert.equal(emptyPile.children.length, 1, "只打开卡库时暂时移出牌堆仍只有标题");
const emptyLibrary = collectClass(emptyBuilder, "exploration-builder-body")[0];
emptyPile.open = true;
emptyPile.listeners.toggle[0]();
assert.equal(emptyBuilder.open, false);
assert.ok(descendants(emptyPile).some((node) => node.textContent === "暂无暂时移出的卡牌"));
assert.equal(collectClass(emptyPile, "exploration-builder-body")[0], emptyLibrary);

console.log("exploration drawn card tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
