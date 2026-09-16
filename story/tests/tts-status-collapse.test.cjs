// 守护 TTS 状态面板的收起行为：收起后整块只剩一个按钮。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(rootDir, "story", "assets", "app.js"), "utf8");
const css = fs.readFileSync(path.join(rootDir, "story", "assets", "styles.css"), "utf8");

function cssBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `找不到样式规则 ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

test("收起时 JS 会给状态面板加上 collapsed 类", () => {
  const start = appSource.indexOf("function renderTtsStatus(");
  assert.ok(start >= 0, "找不到 renderTtsStatus");
  const end = appSource.indexOf("\n  }", start);
  const body = appSource.slice(start, end);

  assert.match(body, /classList\.toggle\("collapsed",\s*collapsed\)/, "收起状态没有切到 collapsed 类");
  assert.match(body, /const collapsed = Boolean\(ttsConfig\.statusCollapsed\)/, "没有统一取收起状态");
  assert.match(body, /toggle\.textContent = collapsed \? "展开" : "收起"/, "按钮文案没有跟随状态");
  assert.match(body, /body\.hidden = collapsed/, "收起时没有隐藏明细列表");
});

test("收起后面板缩到只剩按钮：标题和引擎配置都隐藏", () => {
  // 面板本身不再是固定宽度，改为包裹内容
  assert.match(cssBlock(".tts-status.collapsed"), /width:\s*auto/, "收起后面板应改为按内容宽度");

  // 标题与「引擎配置」按钮隐藏，只剩收起/展开按钮
  const hideRule = css.slice(
    css.indexOf(".tts-status.collapsed .tts-status-head strong"),
    css.indexOf("}", css.indexOf(".tts-status.collapsed .tts-status-head strong"))
  );
  assert.match(hideRule, /\.tts-status-head strong/, "收起后应隐藏标题");
  assert.match(hideRule, /\.tts-config-btn/, "收起后应隐藏引擎配置按钮");
  assert.match(hideRule, /display:\s*none/, "标题与引擎配置按钮需要 display:none");

  // 头部去掉内边距和分隔线，不然会留出多余的框
  const headRule = cssBlock(".tts-status.collapsed .tts-status-head");
  assert.match(headRule, /padding:\s*0/, "收起后头部应去掉内边距");
  assert.match(headRule, /border-bottom:\s*0/, "收起后头部应去掉分隔线");
});

test("状态面板头部总共只有两个按钮，收起后可见一个", () => {
  const start = appSource.indexOf("statusBox.innerHTML = `");
  const end = appSource.indexOf("`;", start);
  const template = appSource.slice(start, end);

  // 模板里一个（收起/展开），运行时代码再 prepend 一个「引擎配置」
  const inTemplate = [...template.matchAll(/<button\b/g)].length;
  assert.equal(inTemplate, 1, "模板里应只有一个切换按钮");
  assert.match(appSource, /configButton\.textContent = "引擎配置"/, "引擎配置按钮文案变了");
  assert.match(
    appSource,
    /statusBox\.querySelector\("\.tts-status-actions"\)\.prepend\(configButton\)/,
    "引擎配置按钮应被插到状态面板头部"
  );

  // 两个按钮里恰好有一个在收起时被隐藏 → 可见 1 个
  const hiddenButtons = [".tts-config-btn", "#ttsStatusToggle"]
    .filter((sel) => new RegExp(`\\.tts-status\\.collapsed[^{]*\\${sel}[^{]*\\{[^}]*display:\\s*none`).test(css));
  assert.equal(hiddenButtons.length, 1, `收起后应恰好隐藏一个按钮，实际隐藏 ${hiddenButtons.length} 个`);
  assert.equal(hiddenButtons[0], ".tts-config-btn", "收起后应隐藏引擎配置按钮，保留切换按钮");
});
