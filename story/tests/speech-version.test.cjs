const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
function setup(overrides = {}) {
  const context = vm.createContext({
    storyVersion: "民间版", activeSpeechToken: 0,
    currentBook: () => ({ id: "c1" }),
    officialEntries: new Map([["c1:entry", { officialText: "官方正文" }]]),
    storyAudioManifest: { entries: { entry: { chunks: [{ path: "fan.mp3" }] } } },
    prepareSpeechText: text => text.trim(),
    ensureStoryAudioManifest: async () => {},
    speakCachedEntryAudio: async () => false,
    ttsConfig: { activeEngine: "browser" },
    speakText: text => { context.spoken = text; },
    pushTtsStatus: text => { context.status = text; },
    ...overrides,
  });
  for (const name of ["supportsOfficialVersion", "getSpeechEntryText", "cachedAudioForEntry", "speakEntry"]) {
    const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
    assert.ok(start >= 0);
    const end = source.indexOf("\n  }", start) + 4;
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
}
const entry = { key: "entry", text: "民间正文" };

test("朗读跟随官方和民间切换，官方版不复用民间离线音频", async () => {
  const context = setup();
  assert.ok(context.cachedAudioForEntry(entry));
  await context.speakEntry(entry);
  assert.equal(context.spoken, "民间正文");
  context.storyVersion = "官方版";
  assert.equal(context.cachedAudioForEntry(entry), null);
  await context.speakEntry(entry);
  assert.equal(context.spoken, "官方正文");
  context.storyVersion = "民间版";
  await context.speakEntry(entry);
  assert.equal(context.spoken, "民间正文");
});

test("官方正文缺失时不回退到民间；不支持官方版的书保留原文", async () => {
  const context = setup({ storyVersion: "官方版", officialEntries: new Map() });
  await context.speakEntry(entry);
  assert.equal(context.spoken, undefined);
  assert.match(context.status, /暂无可朗读正文/);
  context.currentBook = () => ({ id: "c4" });
  assert.equal(context.getSpeechEntryText(entry), "民间正文");
});

test("切换版本取消等待中的旧朗读请求", async () => {
  let resolve;
  const context = setup({ ensureStoryAudioManifest: () => new Promise(done => { resolve = done; }) });
  const pending = context.speakEntry(entry);
  context.activeSpeechToken += 1;
  context.storyVersion = "官方版";
  resolve();
  await pending;
  assert.equal(context.spoken, undefined);
  assert.match(source, /if \(storyVersion === nextVersion\) return;\s+stopSpeech\(\);/);
});
