/*
 * test-second-screen-los-mirror.cjs — 第二屏视线标注镜像的端到端测试。
 *
 *   node tools/test-second-screen-los-mirror.cjs
 *
 * 目的：证明第二屏画出的视线/射程/距离标注与 aibp 主控台**逐格一致**。
 * 做法是把两端真实的代码都跑起来（不是只测共享函数）：
 *   1. 用假 DOM 驱动真的 aibp/battle_map_control.js —— 开启视线、点版图、改参数；
 *   2. 取它的 getLosSnapshot()，过一趟 JSON（模拟走 campaign-state.php）；
 *   3. 用假 DOM + 假 fetch 驱动真的 ss/app.js，把快照喂进去；
 *   4. 比对两边 los 层的 markup（类名 + 位置 + 文字）必须完全相同。
 *
 * 这样能抓到「共享函数没问题但两端接线接错」这类 bug —— 例如第二屏忘了传 apostle、
 * renderKey 漏掉 los 导致标注卡住不更新、或快照少带一个字段。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(repo, ...parts), "utf8");

let checks = 0;
const ok = (label) => { checks++; console.log("  ok  -", label); };

// ---- 假 DOM ---------------------------------------------------------------
class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.parentNode = null;
    this.attributes = new Map();
    this.classList = {
      el: this,
      _set() { return new Set(String(this.el.className).split(" ").filter(Boolean)); },
      _write(set) { this.el.className = [...set].join(" "); },
      add(name) { const s = this._set(); s.add(name); this._write(s); },
      remove(name) { const s = this._set(); s.delete(name); this._write(s); },
      contains(name) { return this._set().has(name); },
      toggle(name, on) {
        const s = this._set();
        const next = on === undefined ? !s.has(name) : !!on;
        if (next) s.add(name); else s.delete(name);
        this._write(s);
      },
    };
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    if (this.tagName === "SELECT" && !this.value) this.value = child.value;
    return child;
  }
  append(...kids) { kids.forEach((k) => this.appendChild(k)); }
  replaceChildren(...kids) {
    this.children.forEach((c) => { c.parentNode = null; });
    this.children = [];
    this.append(...kids);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  dispatch(type, values = {}) {
    const event = {
      clientX: 0, clientY: 0, ...values,
      stopped: false, stopPropagation() { this.stopped = true; },
    };
    (this.listeners.get(type) || []).forEach((fn) => fn(event));
    if (!event.stopped && this.parentNode) this.parentNode.dispatch(type, event);
    return event;
  }
}

// 把一层压成可比较的形状：类名 + 位置 + 文字。位置用百分比字符串，两端算法相同
// 才会逐字符相等，所以这个比对对坐标系错误也敏感。
const snapshotLayer = (layer) => layer.children.map((el) => [
  el.className, el.style.left, el.style.top, el.style.width, el.style.height, el.textContent,
].join("|"));

// ---- 1. 跑真的 aibp 控制器 ------------------------------------------------
const losSelectors = [
  "[data-battle-map-los-layer]", "[data-battle-map-los-control]", "[data-battle-map-los-toggle]",
  "[data-battle-map-los-body]", "[data-battle-map-los-source]", "[data-battle-map-los-hint]",
  "[data-battle-map-los-stats]", "[data-battle-map-los-reach]", "[data-battle-map-los-reach-field]",
  "[data-battle-map-los-facing]", "[data-battle-map-los-facing-field]", "[data-battle-map-los-dim]",
  "[data-battle-map-los-elevated]", "[data-battle-map-los-range]",
  "[data-battle-map-los-path-tools]", "[data-battle-map-los-path-source]",
  "[data-battle-map-los-path-target]", "[data-battle-map-los-path-clear]",
  "[data-battle-map-los-path-summary]",
];
const baseSelectors = [
  "[data-battle-map-board]", "[data-battle-map-terrain-layer]", "[data-battle-map-start-layer]",
  "[data-battle-map-coordinate-layer]", "[data-battle-map-add-select]", "[data-battle-map-add]",
  "[data-battle-map-rotate-left]", "[data-battle-map-rotate-right]", "[data-battle-map-flip]",
  "[data-battle-map-delete]", "[data-battle-map-reset]", "[data-battle-map-starts-toggle]",
  "[data-battle-map-coordinates-toggle]", "[data-battle-map-setup-control]",
  "[data-battle-map-setup-select]", "[data-battle-map-selection]", "[data-battle-map-card-list]",
  "[data-battle-map-card-count]", "[data-battle-map-card-empty]",
];
const el = {};
[...baseSelectors, ...losSelectors].forEach((sel) => {
  const tag = /select/.test(sel) ? "select" : /toggle|dim|elevated|range|reach/.test(sel) ? "input" : "div";
  el[sel] = new FakeElement(tag);
});
// 使徒/泰坦两个选项，标签由控制器动态改写。
["apostle", "titan"].forEach((value) => {
  const option = new FakeElement("option");
  option.value = value;
  el["[data-battle-map-los-source]"].appendChild(option);
});
el["[data-battle-map-los-source]"].querySelector = (sel) =>
  el["[data-battle-map-los-source]"].children.find((o) => sel.includes(`"${o.value}"`)) || null;

const aibpBoard = el["[data-battle-map-board]"];
const aibpLosLayer = el["[data-battle-map-los-layer]"];
aibpBoard.append(el["[data-battle-map-terrain-layer]"], aibpLosLayer, el["[data-battle-map-start-layer]"]);
// 1000×700 = 20×14 格，每格 50×50 px，点击坐标好算。
aibpBoard.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });

global.document = { createElement: (tag) => new FakeElement(tag) };
global.window = { BattleTerrain: require(path.join(repo, "ss", "terrain-data.js")) };
require(path.join(repo, "aibp", "battle_los.js"));
require(path.join(repo, "aibp", "battle_map_control.js"));

let map = null;
let apostle = "CYCLONUS"; // 2×2、有盲区、移速 7（有限）→ 射程框与盲区都画得出来
let losChangeCount = 0;
const control = window.BattleMapControl.create({
  root: { querySelector: (sel) => el[sel] },
  assetBase: "../ss/terrain",
  cardAssetBase: "../ss/terrain-cards",
  openImageZoom: () => {},
  getApostle: () => apostle,
  getLevel: () => 1,
  getMap: () => map,
  setMap: (value) => { map = value; },
  onLosChange: () => { losChangeCount += 1; },
});

control.render();
assert.deepEqual(control.getLosSnapshot(), { active: false });
assert.equal(losChangeCount, 0);
assert.equal(aibpLosLayer.hidden, true);
ok("LoS 关闭时快照只有 active:false，且不画任何东西");

// 开启视线 → 应通知第二屏一次
el["[data-battle-map-los-toggle]"].dispatch("click");
assert.equal(losChangeCount, 1);
assert.equal(control.getLosSnapshot().active, true);
assert.equal(control.getLosSnapshot().anchor, null);
ok("开启视线会通知第二屏，快照转为 active");

// 点版图定锚点：屏幕 (475, 375) → 第 10 列、第 8 行附近
el["[data-battle-map-los-board-click]"] = null;
aibpBoard.dispatch("click", { clientX: 475, clientY: 375 });
assert.equal(losChangeCount, 2);
const anchored = control.getLosSnapshot();
assert.ok(anchored.anchor && Number.isFinite(anchored.anchor.column));
assert.equal(anchored.moveTarget, null);
assert.ok(aibpLosLayer.children.length > 0, "定了锚点就该画出标注");
ok("点版图设置来源锚点并通知第二屏");

// 改攻击距离 / 高地 / 暗化 / 朝向，每次都要通知
el["[data-battle-map-los-reach]"].value = "3";
el["[data-battle-map-los-reach]"].dispatch("input");
assert.equal(control.getLosSnapshot().reach, 3);
el["[data-battle-map-los-facing]"].value = "270";
el["[data-battle-map-los-facing]"].dispatch("change");
assert.equal(control.getLosSnapshot().facing, 270);
el["[data-battle-map-los-dim]"].checked = false;
el["[data-battle-map-los-dim]"].dispatch("change");
assert.equal(control.getLosSnapshot().dim, false);
assert.equal(losChangeCount, 5);
ok("攻击距离 / 朝向 / 暗化的每次改动都会推送第二屏");

// 关掉再打开：anchor 应被清掉，快照回到 active:false
el["[data-battle-map-los-toggle]"].dispatch("click");
assert.deepEqual(control.getLosSnapshot(), { active: false });
assert.equal(aibpLosLayer.hidden, true);
el["[data-battle-map-los-toggle]"].dispatch("click");
assert.equal(control.getLosSnapshot().anchor, null);
ok("关闭视线会清掉锚点并隐藏标注层");

// 恢复到一个信息量大的状态，作为镜像比对的基准
aibpBoard.dispatch("click", { clientX: 475, clientY: 375 });
el["[data-battle-map-los-reach]"].value = "2";
el["[data-battle-map-los-reach]"].dispatch("input");
aibpBoard.dispatch("click", { clientX: 625, clientY: 225 });
const aibpSnapshot = control.getLosSnapshot();
assert.ok(aibpSnapshot.moveTarget && Number.isFinite(aibpSnapshot.moveTarget.column),
  "第二次点击应记录路径目标 moveTarget");
assert.equal(el["[data-battle-map-los-path-summary]"].hidden, false,
  "给出目标后主控台应显示路径摘要");
assert.match(el["[data-battle-map-los-path-summary]"].textContent, /规则停下.*直达指定地点/,
  "路径摘要应同时列出规则停下与直达指定地点");
const aibpMarkup = snapshotLayer(aibpLosLayer);
const aibpLayerClass = aibpLosLayer.className;
assert.ok(aibpMarkup.length > 280, "全图 280 格距离数字 + 视线色块，总数应远超 280");
const kinds = new Set(aibpMarkup.map((row) => row.split("|")[0].split(" ")[0]));
["battle-map-los-source", "battle-map-los-visible", "battle-map-los-blocked",
 "battle-map-los-obscuring", "battle-map-los-in-range", "battle-map-los-blindspot",
 "battle-map-los-distance", "battle-map-los-move-target", "battle-map-los-move-step",
 "battle-map-los-move-final", "battle-map-los-move-facing"].forEach((cls) => assert.ok(kinds.has(cls), `aibp 少画了 ${cls}`));
assert.ok(aibpMarkup.some((row) => row.includes("battle-map-los-move-a")),
  "路线 1 应用红色路线类标记");
assert.ok(aibpMarkup.some((row) => row.includes("battle-map-los-move-b")),
  "路线 2 应用黄色路线类标记");
assert.ok(aibpMarkup.some((row) => row.includes("battle-map-los-move-overlap")),
  "两条路线重叠格应用橙色重叠类标记");
assert.ok(aibpMarkup.some((row) => row.includes("battle-map-los-move-facing-a"))
  || aibpMarkup.some((row) => row.includes("battle-map-los-move-facing-overlap")),
  "路线 1 应显示红色或重叠橙色终点朝向");
assert.ok(aibpMarkup.some((row) => row.includes("battle-map-los-move-facing-b"))
  || aibpMarkup.some((row) => row.includes("battle-map-los-move-facing-overlap")),
  "路线 2 应显示黄色或重叠橙色终点朝向");
assert.ok(!aibpMarkup.some((row) => row.includes("battle-map-los-move-direct")),
  "直达结果不应作为额外路线铺到棋盘上");
ok("aibp 侧画出了来源/可见/被挡/遮蔽/射程/盲区/距离/路径全套标注");

const aibpMapSnapshot = window.BattleTerrain.normalizeBattleMap(map, apostle, 1);

// ---- 2. 跑真的 ss/app.js ------------------------------------------------
// ss/app.js 是顶层脚本（无导出），靠假 document + 假 fetch 把它整个跑一遍。
const ssIds = [
  "mapFrame", "battleView", "battleBoardFrame", "battleTerrainLayer", "battleLosLayer",
  "battleStartLayer", "battleCoordinateLayer", "battleTerrainCards", "battleTerrainCardList",
  "battleTerrainCardCount", "bossPanel", "bossTokens", "bossRoutine", "bossSignature",
  "traitCards", "currentPending", "currentPendingLabel", "aiBacks", "bpBacks",
  "discardCounts", "damageSummary", "damageCards", "unavailableView", "unavailableMessage",
];
const ssClasses = ["map-stage", "battle-sidebar-content", "support-cards"];
const ssEl = {};
ssIds.forEach((id) => { ssEl[`#${id}`] = new FakeElement("div"); });
ssClasses.forEach((cls) => { ssEl[`.${cls}`] = new FakeElement("div"); });
ssEl["#mapFrame"].getAttribute = () => "stub";

const payload = {
  ok: true,
  screen: {
    displayMode: "aibp",
    aibpRevision: 7,
    battleRotation: 0,
    battleSwapped: false,
    battleBoardVisible: true,
    displayScales: { battleBoard: 100 },
    aibp: {
      apostle,
      level: "I",
      // 走一趟 JSON，完全模拟经 campaign-state.php 存取后的形态
      battleMap: JSON.parse(JSON.stringify(aibpMapSnapshot)),
      los: JSON.parse(JSON.stringify(aibpSnapshot)),
      updatedAt: "2026-08-18T12:00:00.000Z",
      tokens: [], traits: [], extraCards: [], damage: [], damageSummary: { total: 0 },
    },
  },
};

let fetchCount = 0;
const timers = [];
global.document = {
  createElement: (tag) => new FakeElement(tag),
  querySelector: (sel) => ssEl[sel] || new FakeElement("div"),
  baseURI: "http://localhost/ss/index.html",
};
global.window = {
  BattleTerrain: require(path.join(repo, "ss", "terrain-data.js")),
  BattleLOS: require(path.join(repo, "aibp", "battle_los.js")),
  innerWidth: 1920,
  innerHeight: 1080,
  location: { origin: "http://localhost" },
  addEventListener: () => {},
  // 不真的排队，避免 checkConnection 无限自轮询
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
};
global.fetch = async () => {
  fetchCount += 1;
  return { ok: true, status: 200, json: async () => payload };
};

const ssSource = read("ss", "app.js");
// app.js 顶层用了裸 document/window/fetch，套一层函数即可在 node 里跑。
new Function("document", "window", "fetch", ssSource)(global.document, global.window, global.fetch);

// checkConnection 是 async 的，.cjs 又不能用顶层 await，所以后半段放进 async main。
async function main() {
await new Promise((resolve) => setImmediate(resolve));

assert.equal(fetchCount, 1, "第二屏应拉取一次快照");
const ssLosLayer = ssEl["#battleLosLayer"];
assert.equal(ssLosLayer.hidden, false, "第二屏应显示视线层");
ok("第二屏跑通一次完整刷新并显示视线层");

// ---- 3. 逐格比对 ---------------------------------------------------------
const ssMarkup = snapshotLayer(ssLosLayer);
assert.equal(ssMarkup.length, aibpMarkup.length,
  `标注数量不一致：aibp ${aibpMarkup.length} vs 第二屏 ${ssMarkup.length}`);
assert.deepEqual(ssMarkup, aibpMarkup, "第二屏与 aibp 的视线标注 markup 必须逐格一致");
assert.equal(ssLosLayer.className, aibpLayerClass, "dim-blocked 等层级类名也要一致");
ok(`第二屏与 aibp 逐格一致（${ssMarkup.length} 个标注元素完全相同）`);

// ---- 4. 静态接线检查 ----------------------------------------------------
const ssHtml = read("ss", "index.html");
assert.match(ssHtml, /id="battleLosLayer"/, "ss/index.html 需要 los 层容器");
assert.match(ssHtml, /battle_los\.js/, "ss/index.html 需要引入 battle_los.js");
// los 层必须在地形层之后、起始位层之前，否则标注会盖住 A/T 标记或被地形盖住
const orderTerrain = ssHtml.indexOf("battleTerrainLayer");
const orderLos = ssHtml.indexOf("battleLosLayer");
const orderStart = ssHtml.indexOf("battleStartLayer");
assert.ok(orderTerrain < orderLos && orderLos < orderStart, "los 层要夹在地形层与起始位层之间");
ok("ss/index.html 接线正确（容器 / 脚本 / 层级顺序）");

const ssCss = read("ss", "styles.css");
// 类名不写死：直接收集 painter 这一轮真正吐到 DOM 上的 class，凡是 aibp 样式表
// 里有规则的，第二屏样式表也必须有，否则那层标注在第二屏上是透明/错位的。
// 匹配用 \.name(?![-\w]) —— 不能用 includes()，否则把 .foo 改名成 .fooXX 也算命中。
const styled = (css, cls) =>
  new RegExp(`\\.${cls.replace(/[-]/g, "\\-")}(?![-\\w])`).test(css);
const aibpCss = read("aibp", "battle_map_control.css");
const emitted = new Set(["battle-map-los-layer", "dim-blocked"]);
ssLosLayer.children.forEach((el) => {
  String(el.className || "").split(/\s+/).forEach((t) => { if (t) emitted.add(t); });
});
// 只靠这一个场景采样会漏：本场景没有红墙，wall 类就永远进不了集合。所以再把
// painter 源码里出现的 battle-map-los-* 全部并进来，覆盖"这次没画到"的分支。
const painterSrc = read("aibp", "battle_los.js");
const painter = painterSrc.slice(painterSrc.indexOf("function renderLosOverlay"));
assert.ok(painter.length > 500, "没定位到 renderLosOverlay，类名采集会失效");
for (const m of painter.matchAll(/battle-map-los-[a-z-]+/g)) emitted.add(m[0]);
assert.ok(emitted.size >= 14, `采集到的类名太少（${emitted.size}），取样不足`);
// 光看"类名出现过"不够：把 .foo 改名后 .foo.bar 还在，照样命中。所以逐条比选择器——
// aibp 样式表里凡是涉及这些类名的选择器，第二屏必须有同一条（.foo 和 .foo.bar 各算一条）。
const losSelectorsOf = (css) => new Set(
  [...css.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/(^|\})\s*([^{}@]+?)\s*\{/g)]
    .flatMap((m) => m[2].split(","))
    .map((s) => s.trim())
    .filter((s) => [...emitted].some((c) => styled(s, c)))
);
const aibpSel = losSelectorsOf(aibpCss);
const ssSel = losSelectorsOf(ssCss);
assert.ok(aibpSel.size >= 12, `aibp 侧取到的选择器太少（${aibpSel.size}）`);
const missing = [...aibpSel].filter((s) => !ssSel.has(s));
assert.deepEqual(missing, [], `ss/styles.css 缺少这些规则: ${missing.join(" / ")}`);
// 朝向箭头靠内联 left/top 定位，没有 position:absolute 会掉到布局流里，单独盯一下。
assert.match(ssCss, /\.battle-map-los-facing\s*\{[^}]*position:\s*absolute/,
  "ss 的 .battle-map-los-facing 必须 position:absolute");
assert.match(aibpCss, /\.battle-map-los-source\s*\{[^}]*scale\(0\.48\)/,
  "aibp 的 1 格单位圆点比例应为 0.48");
assert.match(aibpCss, /\.battle-map-los-move-target\s*\{[^}]*scale\(0\.48\)/,
  "aibp 的目标泰坦圆点应与 1 格单位圆点一样大");
assert.match(aibpCss, /\.battle-map-los-move-final\s*\{[^}]*scale\(0\.48\)/,
  "aibp 的终点使徒圆点应与当前使徒圆点缩放一致");
assert.match(ssCss, /\.battle-map-los-source\s*\{[^}]*scale\(\.48\)/,
  "ss 的 1 格单位圆点比例应为 .48");
assert.match(ssCss, /\.battle-map-los-move-target\s*\{[^}]*scale\(\.48\)/,
  "ss 的目标泰坦圆点应与 1 格单位圆点一样大");
assert.match(ssCss, /\.battle-map-los-move-final\s*\{[^}]*scale\(\.48\)/,
  "ss 的终点使徒圆点应与当前使徒圆点缩放一致");
ok(`ss/styles.css 与 aibp 选择器逐条对齐（${emitted.size} 个类名 / ${aibpSel.size} 条规则）`);

const aibpHtml = read("aibp", "index.html");
assert.match(aibpHtml, /los: battleMapControl\?\.getLosSnapshot\(\)/, "快照要带 los 字段");
assert.match(aibpHtml, /onLosChange: \(\) => scheduleSecondScreenSnapshot\(\)/, "los 改动要推送第二屏");
ok("aibp 快照带上了 los，且 los 改动会触发推送");

// ---- 5. 只改视线参数时第二屏必须重画 ------------------------------------
// 这是最容易漏的失效模式：移动锚点不动牌堆，如果 renderKey 没把 los 算进去，
// 第二屏会一直卡在旧标注上（画面看着像"没反应"）。这里用行为验证，不靠字符串匹配。
const beforeMove = snapshotLayer(ssLosLayer);
// 上一轮 checkConnection 在 finally 里排了下一次轮询，拿它来触发第二次刷新。
const ssCheckConnection = timers.at(-1);
assert.equal(typeof ssCheckConnection, "function", "app.js 应排入下一次轮询");
el["[data-battle-map-los-path-source]"].dispatch("click");
aibpBoard.dispatch("click", { clientX: 175, clientY: 175 }); // 换个使徒位置
aibpBoard.dispatch("click", { clientX: 625, clientY: 225 }); // 重新给出路径目标
payload.screen.aibp.los = JSON.parse(JSON.stringify(control.getLosSnapshot()));
// updatedAt / aibpRevision 故意保持不变 —— 只有 los 变了
await ssCheckConnection();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(fetchCount, 2, "第二屏应完成第二次拉取");

const afterMove = snapshotLayer(ssLosLayer);
assert.notDeepEqual(afterMove, beforeMove,
  "只改视线锚点时第二屏也必须重画（renderKey 需包含 los）");
assert.deepEqual(afterMove, snapshotLayer(aibpLosLayer),
  "重画后仍要与 aibp 逐格一致");
ok("只改视线参数（不动牌堆）时第二屏照样跟着变，且仍逐格一致");

console.log(`\n${checks}/${checks} passed`);
}

main().catch((error) => {
  console.error("FAIL -", error.message);
  process.exit(1);
});
