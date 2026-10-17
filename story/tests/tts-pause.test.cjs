const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

function functionSource(name) {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
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
    activeNativeTts: false,
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

function speechToggleSetup() {
  const h = setup();
  const calls = { starts: 0, stops: 0, plays: 0 };
  Object.assign(h.context, {
    activeEntry: { key: 'story-entry' }, currentUtterance: null, activeSpeechToken: 10,
    stopActiveAudio() { calls.stops += 1; },
    speakEntry() { calls.starts += 1; h.context.beginSpeech(); },
    ttsConfig: { activeEngine: 'cloud' },
    createSpeechChunks: () => ['第一句', '第二句'],
    console,
  });
  h.synthesis.cancel = () => {};
  for (const name of ['stopSpeech', 'toggleSpeech', 'finishSpeech', 'speakText']) {
    vm.runInContext(functionSource(name), h.context);
  }
  return { ...h, calls };
}

test('停止按钮在没有当前音频的合成等待与暂停状态下结束整次朗读', () => {
  for (const paused of [false, true]) {
    const { context, button, calls } = speechToggleSetup();
    context.beginSpeech();
    context.isSpeechPaused = paused;
    context.toggleSpeech();
    assert.equal(calls.stops, 1);
    assert.equal(calls.starts, 0);
    assert.equal(context.activeSpeechToken, 11);
    assert.equal(context.isSpeaking, false);
    assert.equal(context.isSpeechPaused, false);
    assert.equal(button.hidden, true);
    assert.equal(context.ttsButton.textContent, '朗读');
  }
});

test('朗读按钮在空闲时开始，在音频播放时停止', () => {
  const { context, calls } = speechToggleSetup();
  context.toggleSpeech();
  assert.equal(calls.starts, 1);
  assert.equal(calls.stops, 0);
  context.currentUtterance = { audio: true };
  context.toggleSpeech();
  assert.equal(calls.starts, 1);
  assert.equal(calls.stops, 1);
  assert.equal(context.currentUtterance, null);
});

test('在首句合成或句间等待时停止，迟到的合成结果不会继续播放', async () => {
  for (const stoppedAfterFirst of [false, true]) {
    const { context, calls } = speechToggleSetup();
    const pending = [];
    context.getExternalAudioJob = () => new Promise(resolve => pending.push(resolve));
    let firstPlayed;
    const firstPlayback = new Promise(resolve => { firstPlayed = resolve; });
    context.playAudioBlob = async (_blob, token, keepActive) => {
      calls.plays += 1;
      context.finishSpeech(token, keepActive);
      firstPlayed();
    };
    const speaking = context.speakText('需要合成的故事正文');
    assert.equal(context.isSpeaking, true);
    if (stoppedAfterFirst) {
      pending[0]({ ok: 'first audio' });
      await firstPlayback;
      assert.equal(context.currentUtterance, null);
      assert.equal(context.isSpeaking, true);
    }
    context.toggleSpeech();
    pending.forEach(resolve => resolve({ ok: 'late audio' }));
    await speaking;
    assert.equal(calls.starts, 0);
    assert.equal(calls.plays, stoppedAfterFirst ? 1 : 0);
    assert.equal(context.isSpeaking, false);
  }
});
