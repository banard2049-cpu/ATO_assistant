// 步骤内操作按钮的行为约束：
// 1) 宿敌控制按钮固定在「探索」步骤、紧跟在 Map 按钮后面（同一行 .step-actions），
//    且不跟随第二屏幕开关，默认就显示；
// 2) 第七步（灾祸 / 末日）在特殊事件后面给出「进入下一天」；
// 3) 步骤内的按钮共用同一套紧凑尺寸；
// 4) 进入下一天一律把页面带回最顶端，但不做可见性判断；
// 5) 日期轨的定位只滚动自己的列表，不碰页面滚动。
// 「移动」步骤的方向键盘仍然保持原样：只有开启第二屏幕才出现。
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
    dataset: {},
    children: [],
    listeners: {},
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    querySelector() { return null; },
  };
}

function buildContext(cycleConfig, spies = {}, options = {}) {
  const context = vm.createContext({
    console,
    document: { createElement },
    window: {
      setTimeout() {},
      scrollTo() {},
      innerHeight: 800,
      requestAnimationFrame: (fn) => fn(),
      ...(options.window || {}),
    },
    escapeHtml: (value) => String(value),
    renderC3SpecialButtons() {},
    nextDay: () => { spies.nextDay = (spies.nextDay || 0) + 1; },
    currentCycleConfig: () => cycleConfig,
  });
  vm.runInContext(
    `let secondScreenEnabled = false;\n${[
      "createNemesisStepTools", "createMapStepStatus", "createMapStepTools",
      "createNextDayStepButton", "scrollPageToTopAfterNextDay",
    ]
      .map((name) => extractFunction(source, name))
      .join("\n")}`,
    context,
  );
  return context;
}

// 按钮可能由 innerHTML 生成，也可能是 createElement 后 append 的，两种都要能扫到。
function markupOf(node) {
  const own = String(node.innerHTML || "");
  const nested = (node.children || []).map(markupOf).join("");
  return own + nested;
}

function commandsOf(node) {
  return Array.from(markupOf(node).matchAll(/data-map-command="([^"]+)"/g)).map((m) => m[1]);
}

const mapCycle = { id: "c1", map: true };
const noMapCycle = { id: "c1", map: false };

// 1) 第二屏幕关闭时，探索步骤照样出宿敌按钮。
for (const secondScreen of [false, true]) {
  const context = buildContext(mapCycle);
  vm.runInContext(`secondScreenEnabled = ${secondScreen};`, context);
  const tools = vm.runInContext('createNemesisStepTools("explore")', context);
  assert.ok(tools, `探索步骤缺少宿敌按钮（secondScreenEnabled=${secondScreen}）`);
  assert.deepEqual(
    commandsOf(tools),
    ["spawn-nemesis", "chase-nemesis"],
    `宿敌按钮命令不对（secondScreenEnabled=${secondScreen}）`,
  );
  assert.equal(tools.className, "nemesis-step-buttons", "宿敌按钮容器 class 不对");
}

// 2) 只有探索步骤有宿敌按钮，移动步骤不该重复出现。
{
  const context = buildContext(mapCycle);
  vm.runInContext("secondScreenEnabled = true;", context);
  assert.equal(vm.runInContext('createNemesisStepTools("move")', context), null, "移动步骤不该有宿敌按钮");
  assert.equal(vm.runInContext('createNemesisStepTools("survey")', context), null, "非地图步骤不该有宿敌按钮");
}

// 3) 没有地图的 Cycle 依然不显示宿敌按钮。
{
  const context = buildContext(noMapCycle);
  assert.equal(vm.runInContext('createNemesisStepTools("explore")', context), null, "无地图 Cycle 不该有宿敌按钮");
}

// 4) 移动步骤的方向键盘保持原样：仍然只在第二屏幕开启时出现。
{
  const context = buildContext(mapCycle);
  assert.equal(
    vm.runInContext('createMapStepTools("move")', context),
    null,
    "第二屏幕关闭时移动步骤不该出现方向键盘",
  );
  vm.runInContext("secondScreenEnabled = true;", context);
  const moveTools = vm.runInContext('createMapStepTools("move")', context);
  assert.ok(moveTools, "第二屏幕开启时移动步骤应有方向键盘");
  assert.deepEqual(commandsOf(moveTools), [], "移动步骤的工具块里不该混入宿敌按钮");
  assert.ok(
    markupOf(moveTools).includes("data-map-direction="),
    "移动步骤缺少方向按钮",
  );
  // 宿敌已从 createMapStepTools 拆走，探索步骤不再走这条路。
  assert.equal(vm.runInContext('createMapStepTools("explore")', context), null, "探索步骤不该再走地图工具块");
}

// 5) 探索步骤不再有静态提示文字，但反馈区仍在——宿敌命令的结果要靠它显示。
{
  const context = buildContext(mapCycle);
  const status = vm.runInContext('createMapStepStatus("explore")', context);
  assert.ok(status.className.includes("map-command-status"), "宿敌反馈区缺少 map-command-status");
  assert.ok(status.className.includes("nemesis-step-status"), "宿敌反馈区缺少 nemesis-step-status");
  assert.equal(status.textContent, "", "探索步骤不该再有静态提示文字");
  // 移动步骤的提示不属于本次改动，保持原样。
  const moveStatus = vm.runInContext('createMapStepStatus("move")', context);
  assert.ok(moveStatus.textContent.length > 0, "移动步骤的提示不该被一起删掉");
  // 删掉的那行字不能以任何形式留在页面里。
  assert.ok(
    !source.includes("生成在距离阿尔戈号 4 格处"),
    "旧的宿敌提示文字仍然留在 index.html 里",
  );
}

// 6) 位置约束：宿敌按钮挂进 actions（Map 按钮所在行），且在 actions 入标题之前完成。
{
  const wiring = 'const nemesisTools = createNemesisStepTools(step.id);';
  const attach = "if (nemesisTools) actions.appendChild(nemesisTools);";
  const mount = 'text.querySelector(".step-title")?.appendChild(actions);';
  const attachIndex = source.indexOf(attach);
  const mountIndex = source.indexOf(mount);
  assert.ok(source.includes(wiring), "renderFlow 没有调用 createNemesisStepTools");
  assert.ok(attachIndex >= 0, "renderFlow 没有把宿敌按钮挂进 Map 按钮所在行");
  assert.ok(mountIndex >= 0, "renderFlow 没有把操作行挂进步骤标题");
  assert.ok(attachIndex < mountIndex, "宿敌按钮必须在操作行入标题之前挂进去，否则不会出现在 Map 右边");
  assert.ok(
    source.includes("if (nemesisTools) text.appendChild(createMapStepStatus(step.id));"),
    "探索步骤缺少宿敌状态行",
  );
}

// 7) 第七步（灾祸 / 末日）在特殊事件后面给出进入下一天按钮。
{
  const spies = {};
  const context = buildContext(mapCycle, spies);
  const button = vm.runInContext('createNextDayStepButton("doom")', context);
  assert.ok(button, "灾祸步骤缺少进入下一天按钮");
  assert.equal(button.textContent, "进入下一天", "进入下一天按钮文案不对");
  assert.ok(button.className.includes("step-action-button"), "进入下一天按钮缺少行内按钮样式类");
  assert.equal(typeof button.listeners.click, "function", "进入下一天按钮没有绑定点击事件");
  button.listeners.click();
  assert.equal(spies.nextDay, 1, "点进入下一天没有调用 nextDay()");

  // 只有第七步有，别把按钮撒到其它步骤上。
  for (const stepId of ["move", "explore", "survey", "encounter", "development", "story"]) {
    assert.equal(
      vm.runInContext(`createNextDayStepButton(${JSON.stringify(stepId)})`, context),
      null,
      `${stepId} 步骤不该有进入下一天按钮`,
    );
  }

  // 位置约束：排在特殊事件（links）后面，且在操作行入标题之前挂进去。
  const attach = "if (stepNextDayButton) actions.appendChild(stepNextDayButton);";
  const attachIndex = source.indexOf(attach);
  const mountIndex = source.indexOf('text.querySelector(".step-title")?.appendChild(actions);');
  const linkLoopIndex = source.indexOf("actions.appendChild(anchor);");
  assert.ok(attachIndex >= 0, "renderFlow 没有把进入下一天挂进行操作行");
  assert.ok(linkLoopIndex >= 0 && linkLoopIndex < attachIndex, "进入下一天必须排在特殊事件链接之后");
  assert.ok(attachIndex < mountIndex, "进入下一天必须在操作行入标题之前挂进去，否则不会出现在特殊事件右边");

  // 点下去要既推进日期、又把页面带回最顶端。
  const scrollCalls = [];
  const wired = buildContext(mapCycle, {}, {
    window: { scrollTo: (options) => scrollCalls.push(options) },
  });
  const wiredButton = vm.runInContext('createNextDayStepButton("doom")', wired);
  wiredButton.listeners.click();
  assert.equal(scrollCalls.length, 1, "点进入下一天后没有把页面带回顶端");
  assert.equal(scrollCalls[0].top, 0, "点进入下一天后没有滚到最顶端");
}

// 8) 宿敌按钮与进入下一天都走同一套行内按钮样式，避免两个按钮尺寸不一致。
{
  const context = buildContext(mapCycle);
  const nemesis = vm.runInContext('createNemesisStepTools("explore")', context);
  assert.ok(
    String(nemesis.innerHTML).includes("step-action-button"),
    "宿敌按钮没有用行内按钮样式类",
  );
  assert.ok(
    !source.includes(".nemesis-step-buttons button {"),
    "旧的宿敌专属按钮样式没清掉，会和行内按钮样式重复",
  );
}

// 9) 步骤标题行和整个探索卡工具区共用同一套紧凑按钮尺寸（.step-action-button）。
{
  const rule = ".step-action-button {";
  const firstIndex = source.indexOf(rule);
  assert.ok(firstIndex >= 0, "缺少 .step-action-button 尺寸规则");
  assert.equal(
    source.indexOf(rule, firstIndex + 1),
    -1,
    ".step-action-button 规则重复定义，容易改一处漏一处",
  );
  const block = source.slice(firstIndex, source.indexOf("}", firstIndex));
  for (const decl of ["min-height: 30px;", "padding: 0 10px;", "font-size: 12px;"]) {
    assert.ok(block.includes(decl), `.step-action-button 缺少 ${decl}`);
  }

  // 探索卡工具区里偏大的按钮都必须挂上这个类，否则会退回 38px 的默认尺寸。
  const compact = [
    ['drawButton.className = "step-action-button";', "抽探索卡"],
    ['returnButton.className = "secondary step-action-button";', "放回暂时移出"],
    ['applyButton.className = "step-action-button";', "应用选择"],
    ['restoreDefaultButton.className = "secondary step-action-button";', "恢复初始"],
    ['addButton.className = "danger step-action-button";', "随机加入破坏卡"],
  ];
  for (const [needle, label] of compact) {
    assert.ok(source.includes(needle), `${label} 按钮没有用紧凑按钮样式`);
  }

  // 旧的放大规则必须清掉，否则会和紧凑尺寸打架。
  assert.ok(
    !source.includes(".exploration-buttons button {"),
    ".exploration-buttons button 的旧尺寸规则还在，会盖掉紧凑尺寸",
  );

  // 破坏卡组的「移回」和探索卡库的「加入破坏」是更小的内联控件，
  // 要保留各自尺寸，不能被顺手「统一」上去（前者会被撑破 28px 的胶囊）。
  assert.ok(
    source.includes(".exploration-destruction-card button {"),
    "破坏卡组「移回」的内联小尺寸被删掉了",
  );
  assert.ok(
    source.includes(".exploration-library button {"),
    "探索卡库「加入破坏」的内联小尺寸被删掉了",
  );
  assert.ok(
    source.includes('returnButton.className = "secondary";'),
    "破坏卡组的「移回」不该挂紧凑按钮样式，会撑破 22px 的胶囊",
  );
}

// 10) 日期轨的定位不能把整个页面滚走。
// keepCurrentDateVisible 以前用 scrollIntoView 兜底，而日期轨在顶部 header 里，
// 于是从第七步点「进入下一天」会把页面拽回顶部。现在它只允许滚动日期轨自身的列表。
{
  let scrollIntoViewCalls = 0;
  // 故意让当天条目落在窗口可视区之外（负坐标）：旧实现必然在这里调 scrollIntoView。
  const listRect = { top: -500, bottom: -200, height: 300 };
  const currentRect = { top: -100, bottom: -60, height: 40 };
  const current = {
    getBoundingClientRect: () => currentRect,
    scrollIntoView: () => { scrollIntoViewCalls += 1; },
  };
  const list = {
    scrollTop: 0,
    clientHeight: 300,
    scrollHeight: 3000,
    getBoundingClientRect: () => listRect,
    querySelector: () => current,
  };
  const context = vm.createContext({
    console,
    elements: { dateTrackList: list },
    state: { day: 5 },
    currentCycleConfig: () => ({ id: "c1" }),
    window: { innerHeight: 800, requestAnimationFrame: (fn) => fn() },
  });
  vm.runInContext(extractFunction(source, "keepCurrentDateVisible"), context);
  vm.runInContext("keepCurrentDateVisible()", context);

  assert.equal(scrollIntoViewCalls, 0, "日期轨定位不该调用 scrollIntoView，那会把整页滚回顶部");
  assert.ok(list.scrollTop > 0, "日期轨自身没有滚动到当天，定位功能被一起删掉了");
}

// 11) 进入下一天一律把页面带回最顶端（不再有可见性判断），
//     并且页面级滚动只允许出现在这一个函数里。
{
  const body = extractFunction(source, "scrollPageToTopAfterNextDay");
  const sourceWithoutBody = source.replace(body, "");
  assert.ok(
    !/\.scrollIntoView\s*\(/.test(sourceWithoutBody),
    "scrollPageToTopAfterNextDay 之外又出现了 scrollIntoView，可能又把页面滚到别处",
  );
  assert.ok(
    !/\.scrollIntoView\s*\(/.test(source),
    "index.html 里还有 scrollIntoView 调用，滚到顶端应该只走 window.scrollTo",
  );
  // 一律滚到顶端，所以不该再测量元素位置或判断可见性。
  for (const forbidden of ["getBoundingClientRect", "innerHeight", "querySelector"]) {
    assert.ok(!body.includes(forbidden), `滚到顶端不该再依赖 ${forbidden}`);
  }
  assert.ok(body.includes("window.scrollTo("), "没有调用 window.scrollTo");

  // 真的跑一遍，确认传的是顶端坐标。
  const calls = [];
  const context = vm.createContext({
    console,
    window: { requestAnimationFrame: (fn) => fn(), scrollTo: (options) => calls.push(options) },
  });
  vm.runInContext(body, context);
  vm.runInContext("scrollPageToTopAfterNextDay()", context);
  assert.equal(calls.length, 1, "没有滚动页面");
  assert.equal(calls[0].top, 0, "没有滚到最顶端");
  assert.equal(calls[0].left, 0, "横向滚动没有归零");
}

console.log("OK: 步骤内操作按钮、日期轨与进入下一天的滚动约束全部通过");
