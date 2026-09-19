const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

function functionSource(name) {
  const start = source.search(new RegExp(`  function ${name}\\(`));
  assert.ok(start >= 0, `missing function ${name}`);
  let depth = 0;
  let opened = false;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
      opened = true;
    } else if (source[index] === "}") {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function setup({ audio = null } = {}) {
  const button = {
    hidden: true,
    textContent: "暂停",
    title: "暂停朗读",
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  const synthesis = {
    paused: false,
    pauseCalls: 0,
    resumeCalls: 0,
    pause() { this.paused = true; this.pauseCalls += 1; },
    resume() { this.paused = false; this.resumeCalls += 1; },
  };
  const context = vm.createContext({
    isSpeaking: false,
    isSpeechPaused: false,
    activeAudio: audio,
    ttsButton: { textContent: "朗读" },
    ttsPauseButton: button,
    window: { speechSynthesis: synthesis },
    pushTtsStatus() {},
    String,
  });
  for (const name of ["updateSpeechControls", "beginSpeech", "applyPendingSpeechPause", "toggleSpeechPause"]) {
    vm.runInContext(functionSource(name), context);
  }
  return { context, button, synthesis };
}

test("朗读开始后显示暂停按钮，停止状态隐藏", () => {
  assert.match(html, /id="ttsPauseButton"[^>]+hidden>暂停<\/button>/);
  const { context, button } = setup();
  context.beginSpeech();
  assert.equal(context.ttsButton.textContent, "停止");
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, "暂停");
  context.isSpeaking = false;
  context.isSpeechPaused = false;
  context.updateSpeechControls();
  assert.equal(context.ttsButton.textContent, "朗读");
  assert.equal(button.hidden, true);
});

test("音频朗读可以暂停并从当前位置继续", async () => {
  const audio = {
    paused: false,
    pauseCalls: 0,
    playCalls: 0,
    pause() { this.paused = true; this.pauseCalls += 1; },
    play() { this.paused = false; this.playCalls += 1; return Promise.resolve(); },
  };
  const { context, button } = setup({ audio });
  context.beginSpeech();
  context.toggleSpeechPause();
  assert.equal(audio.pauseCalls, 1);
  assert.equal(button.textContent, "继续");
  assert.equal(button.attrs["aria-pressed"], "true");
  context.toggleSpeechPause();
  await Promise.resolve();
  assert.equal(audio.playCalls, 1);
  assert.equal(button.textContent, "暂停");
});

test("浏览器原生语音使用 speechSynthesis 暂停和继续", () => {
  const { context, synthesis } = setup();
  context.beginSpeech();
  context.toggleSpeechPause();
  assert.equal(synthesis.pauseCalls, 1);
  context.toggleSpeechPause();
  assert.equal(synthesis.resumeCalls, 1);
  assert.match(source, /if \(!isSpeechPaused\) remainingTimeoutMs -= now - timeoutCheckedAt;/);
});

test("请求期间点击暂停，音频开始播放后立即保持暂停", () => {
  const audio = {
    paused: false,
    pauseCalls: 0,
    pause() { this.paused = true; this.pauseCalls += 1; },
  };
  const { context } = setup({ audio });
  context.beginSpeech();
  context.isSpeechPaused = true;
  context.applyPendingSpeechPause();
  assert.equal(audio.pauseCalls, 1);
});
