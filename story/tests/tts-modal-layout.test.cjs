// 守护朗读引擎配置弹窗的结构：字段齐全、标签配对、隐藏状态正确、类名都有样式。
// 之前样式表被还原过一次，靠这个测试能立刻发现。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..", "..");
const appSource = fs.readFileSync(path.join(rootDir, "story", "assets", "app.js"), "utf8");
const css = fs.readFileSync(path.join(rootDir, "story", "assets", "styles.css"), "utf8");

function extract(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `找不到片段: ${startMarker}`);
  return appSource.slice(start, end);
}

// 只作 JS 选择器钩子用，不需要样式（隐藏交给 button[hidden] 规则）
const STYLE_HOOK_CLASSES = new Set(["mimo-only"]);

const REQUIRED_IDS = [
  "ttsModalClose", "ttsCloudProvider", "ttsMimoFields", "ttsXfyunFields",
  "ttsCloudBase", "ttsCloudKey", "ttsCloudModel", "ttsCloudCloneModel",
  "ttsCloudVoice", "ttsCloudFormat", "ttsCloudTimeout", "ttsCloudPrompt",
  "ttsXfyunAppId", "ttsXfyunKey", "ttsXfyunSecret", "ttsXfyunVoice",
  "ttsXfyunRate", "ttsXfyunVolume", "ttsXfyunPitch", "ttsXfyunSampleRate",
  "ttsXfyunTimeout", "ttsXfyunVoiceList",
  "ttsPreviewVoices", "ttsCloneImport", "ttsCloneClear", "ttsCloudTest",
  "ttsLocalBase", "ttsLocalKey", "ttsLocalModel", "ttsLocalVoice",
  "ttsLocalTimeout", "ttsLocalPrompt", "ttsLocalTest",
  "ttsImportConfig", "ttsExportConfig", "ttsSaveConfig",
];

function renderModal(isXfyun) {
  const helpers = extract("function modalField(", "function openTtsConfigModal(");
  const start = appSource.indexOf("ttsUi.overlay.innerHTML = `");
  const end = appSource.indexOf("`;", start);
  assert.ok(start >= 0 && end > start, "找不到弹窗模板");
  const templateBody = appSource.slice(appSource.indexOf("`", start) + 1, end);

  const context = vm.createContext({
    cloudProvider: () => (isXfyun ? "xfyun" : "mimo"),
    cloudProviders: [
      { id: "mimo", label: "MIMO / OpenAI 兼容" },
      { id: "xfyun", label: "讯飞在线语音合成" },
    ],
    xfyunPresetVoices: [{ vcn: "x4_lingbosong_bad_talk", label: "聆伯松-反派老人" }],
    escapeHtml: (value) => String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;"),
    escapeAttribute: (value) => String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/`/g, "&#096;"),
  });
  vm.runInContext(helpers, context);

  context.cloud = {
    provider: isXfyun ? "xfyun" : "mimo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    apiKey: "k", builtInModel: "mimo-v2.5-tts", voiceCloneModel: "",
    voice: "白桦", userMessage: "", audioFormat: "mp3", timeout: 120000,
    xfyun: {
      appId: "app", apiKey: "key", apiSecret: "secret",
      vcn: "x4_lingbosong_bad_talk", sampleRate: 16000,
      speed: 50, volume: 50, pitch: 50, timeout: 60000,
    },
  };
  context.local = { baseUrl: "", apiKey: "", model: "", voice: "", userMessage: "", timeout: 60000 };
  context.xf = context.cloud.xfyun;
  context.isXfyun = isXfyun;
  return vm.runInContext(`(${'`'}${templateBody}${'`'})`, context);
}

test("弹窗包含全部字段，且没有残留旧类名", () => {
  const html = renderModal(false);
  for (const id of REQUIRED_IDS) {
    assert.ok(html.includes(`id="${id}"`), `缺少元素 #${id}`);
  }
  for (const stale of ["tts-modal-grid", "tts-modal-section", "tts-modal-title", "tts-test-btn"]) {
    assert.ok(!html.includes(stale), `残留旧类名 .${stale}`);
  }
  assert.ok(!html.includes("${"), "有未展开的模板占位符");
});

test("弹窗标签配对", () => {
  const html = renderModal(false);
  const voids = new Set(["input", "br", "hr", "img", "meta", "link", "option"]);
  const stack = [];
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClose] = match;
    const tag = name.toLowerCase();
    if (voids.has(tag) || selfClose === "/") continue;
    if (closing) {
      assert.equal(stack.pop(), tag, `标签未配对: </${tag}>`);
    } else {
      stack.push(tag);
    }
  }
  assert.deepEqual(stack, [], `有未闭合标签: ${stack.join(", ")}`);
});

test("切换服务商时隐藏状态正确", () => {
  const mimoHtml = renderModal(false);
  assert.match(mimoHtml, /id="ttsMimoFields" class="tts-group"/);
  assert.match(mimoHtml, /id="ttsXfyunFields" class="tts-group" hidden/);
  assert.doesNotMatch(mimoHtml, /id="ttsCloneImport"[^>]*hidden/);

  const xfyunHtml = renderModal(true);
  assert.match(xfyunHtml, /id="ttsMimoFields" class="tts-group" hidden/);
  assert.match(xfyunHtml, /id="ttsXfyunFields" class="tts-group"/);
  assert.match(xfyunHtml, /id="ttsCloneImport"[^>]*hidden/);
  assert.match(xfyunHtml, /id="ttsCloneClear"[^>]*hidden/);
});

test("弹窗用到的类名都有样式，关键规则未丢失", () => {
  const classes = new Set(
    [...renderModal(false).matchAll(/class="([^"]+)"/g)]
      .flatMap((match) => match[1].split(/\s+/))
      .filter(Boolean)
  );
  for (const name of classes) {
    if (STYLE_HOOK_CLASSES.has(name)) continue;
    assert.ok(css.includes(`.${name}`), `类名 .${name} 没有样式`);
  }

  // 这几条缺了就会出现「藏不住」或「样式走形」
  for (const rule of [
    ".tts-group[hidden]",
    ".tts-card-actions button[hidden]",
    ".tts-field-grid.cols-2",
    ".tts-field-grid.cols-3",
    ".tts-modal-field select",
    ".tts-modal-field input:focus",
  ]) {
    assert.ok(css.includes(rule), `缺少关键规则 ${rule}`);
  }

  let depth = 0;
  for (const char of css) {
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    assert.ok(depth >= 0, "CSS 出现多余的 }");
  }
  assert.equal(depth, 0, "CSS 括号不配对");
});

test("弹窗内容区可滚动，头尾固定", () => {
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `找不到规则 ${selector}`);
    const end = css.indexOf("}", start);
    return css.slice(start, end);
  };

  const modal = block(".tts-modal");
  assert.match(modal, /display:\s*flex/, ".tts-modal 需要 flex 才能固定头尾");
  assert.match(modal, /flex-direction:\s*column/, ".tts-modal 需要纵向排列");
  assert.match(modal, /max-height/, ".tts-modal 需要限制高度");
  assert.match(modal, /overflow:\s*hidden/, ".tts-modal 需要裁掉溢出");

  // 关键：flex 子项默认 min-height:auto，不设 0 会撑破容器导致无法滚动
  const body = block(".tts-modal-body");
  assert.match(body, /overflow:\s*auto/, ".tts-modal-body 需要可滚动");
  assert.match(body, /min-height:\s*0/, ".tts-modal-body 缺少 min-height:0，会撑破弹窗导致看不到滚动条");
  // 关键：.tts-card 带 overflow:hidden，作为网格项的自动最小尺寸是 0，
  // 不按内容定高就会被压扁，内容被裁掉后容器认为「没溢出」，滚动条同样不出现。
  assert.match(body, /grid-auto-rows:\s*max-content/, ".tts-modal-body 缺少 grid-auto-rows:max-content，卡片会被压扁导致内容看不到");

  assert.match(block(".tts-modal-head"), /flex:\s*none/, "头部不应被压缩");
  assert.match(block(".tts-modal-foot"), /flex:\s*none/, "底部不应被压缩");
});
