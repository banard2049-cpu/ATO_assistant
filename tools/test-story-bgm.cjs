/* 主控台「点按钮切 BGM」的接线测试
 *
 * 运行：node tools/test-story-bgm.cjs
 * （不要用 node --test 的 runner：它需要为每个文件派生带管道的子进程。）
 *
 * 覆盖：
 *   1. story 页不再挂播放器、不再广播；
 *   2. 主控台「故事」步骤的入口链接（回忆突破 / 内蕴奥德赛 / 法洛斯之梦 / 主线 / 特殊事件）
 *      与「考察」步骤的 冒险中枢 / R&R 都带上了对应阶段；
 *   3. renderFlow 渲染链接时接上了点一下切阶段的动作。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const CONSOLE_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const STORY_HTML = fs.readFileSync(path.join(ROOT, "story/index.html"), "utf8");
const STORY_APP = fs.readFileSync(path.join(ROOT, "story/assets/app.js"), "utf8");

function stageOfLink(source, label) {
  // 同一个 label 可能在别处也出现（如流程步骤描述），取所有出现位置里带 bgm 的那个
  const needle = `label: "${label}"`;
  const found = [];
  let index = source.indexOf(needle);
  while (index >= 0) {
    const block = source.slice(index, index + 400);
    const match = block.match(/bgm: "([^"]+)"/);
    if (match) found.push(match[1]);
    index = source.indexOf(needle, index + 1);
  }
  assert.ok(found.length, `链接「${label}」没有带 bgm 阶段`);
  assert.equal(new Set(found).size, 1, `链接「${label}」的 bgm 阶段不一致：${found.join(",")}`);
  return found[0];
}

test("story 页不再引入播放器，也不再广播", () => {
  assert.ok(!/assets\/bgm\//.test(STORY_HTML), "story 页不该再引 assets/bgm/");
  assert.ok(!/ATO_BGM_CONFIG/.test(STORY_HTML), "story 页不该再有播放器角色配置");
  assert.ok(!STORY_HTML.includes('id="bgmControls"'), "story 页不该再有控制条容器");
  ["syncStoryBgmStage", "beginSpeechDucking", "endSpeechDucking", "bgmChapterStages", "ATO_BGM"].forEach((token) => {
    assert.ok(!STORY_APP.includes(token), `story 的 app.js 不该再有：${token}`);
  });
});

test("主控台的故事 / 考察入口各自带对应阶段", () => {
  const expected = {
    "回忆突破": "mnemos",
    "内蕴奥德赛": "inward",
    "法洛斯之梦": "pharos",
    "主线": "story",
    "特殊事件": "tension",
    "冒险中枢": "hub",
    "R&R": "rest",
  };
  Object.keys(expected).forEach((label) => {
    assert.equal(stageOfLink(CONSOLE_HTML, label), expected[label], `链接「${label}」阶段不对`);
  });
  assert.match(CONSOLE_HTML, /\{ label: "战斗模块", bgm: "encounter"/);
});

test("渲染链接时接上「点一下临时切阶段」，并且新开标签避免主控台被导航走", () => {
  const start = CONSOLE_HTML.indexOf("getStepLinks(step).forEach");
  assert.ok(start > 0, "找不到链接渲染代码");
  const block = CONSOLE_HTML.slice(start, start + 900);
  assert.match(block, /if \(link\.bgm\)/);
  assert.match(block, /api\.setScene\(link\.bgm\)/, "入口链接走临时切换，控制台阶段一变就切回");
  assert.match(block, /anchor\.target = "_blank"/);
  assert.match(block, /anchor\.dataset\.bgmStage = link\.bgm/);
});

test("跟随流程只由勾选推进，不因缺少提醒提前跳到打造与训练", () => {
  const source = CONSOLE_HTML.match(/    function bgmFlowStepId\([^]*?\n    }/)[0];

  const steps = [
    { id: "move", kind: "总是执行" },
    { id: "explore", kind: "总是执行" },
    { id: "survey", kind: "条件执行" },
    { id: "encounter", kind: "条件执行" },
    { id: "development", kind: "可选执行" },
    { id: "story", kind: "条件执行" },
    { id: "doom", kind: "条件执行" },
  ];
  const run = (completed) => {
    const context = vm.createContext({ list: steps });
    vm.runInContext(`this.bgmFlowStepId = ${source}`, context);
    return context.bgmFlowStepId(steps, completed);
  };

  // 什么都没勾 → 第一个步骤
  assert.equal(run({}), "move");
  // 勾了移动 → 探索
  assert.equal(run({ move: true }), "explore");
  assert.equal(run({ move: true, explore: true }), "survey");
  assert.equal(run({ move: true, explore: true, survey: true }), "encounter");
  assert.equal(run({ move: true, explore: true, survey: true, encounter: true }), "development");
  // 跳着勾（跳过考察/遭遇/发展 直接勾故事）→ 灾祸
  assert.equal(run({ move: true, explore: true, story: true }), "doom");
  // 全勾完 → 休整；撤销最后一步又回到灾祸。
  assert.equal(run({ move: true, explore: true, survey: true, encounter: true, development: true, story: true, doom: true }), "rest");
  assert.equal(run({ story: true, doom: false }), "doom");
});

test("控制条不再有阶段按钮那一排，story 那套广播配置也已清干净", () => {
  const bgm = fs.readFileSync(path.join(ROOT, "assets/bgm/bgm.js"), "utf8");
  ["readRemote", "publishRemote", "applyRemote", "remoteScene", "publishScene", "REMOTE_KEY"].forEach((token) => {
    assert.ok(!bgm.includes(token), `bgm.js 里残留了广播代码：${token}`);
  });
  ["atoBgmStages", "data-bgm-stage", "ato-bgm-scene", "refreshStageButtons"].forEach((token) => {
    assert.ok(!bgm.includes(token), `bgm.js 里残留了阶段按钮：${token}`);
  });
  // 阶段切换时间改成 1 秒
  const manifest = fs.readFileSync(path.join(ROOT, "assets/bgm/manifest.js"), "utf8");
  assert.match(manifest, /crossfadeMs: 1000/);
});

test("同步包含用户、存档、Cycle、日期、勾选与重置，普通重绘保持同一上下文", () => {
  const source = CONSOLE_HTML.match(/    function syncBgmStage\([^]*?\n    }/)[0];
  const calls = [];
  const context = vm.createContext({
    sessionUser: { id: "account" }, archive: { activeProfileId: "campaign" },
    cycle: "c1", currentCycleConfig() { return { id: context.cycle }; },
    state: { day: 1, completed: {} }, flowSteps: [{ id: "move" }, { id: "explore" }],
    bgmResetRevision: 0, bgmFlowStepId: () => "move",
    window: { ATO_BGM: { setFlowStage: (...args) => calls.push(args) } },
  });
  vm.runInContext(source, context);
  context.syncBgmStage();
  context.syncBgmStage();
  assert.equal(calls[0][1], calls[1][1], "相同状态的重绘不打断临时曲");
  [
    () => { context.state.day = 2; },
    () => { context.cycle = "c2"; },
    () => { context.archive.activeProfileId = "other"; },
    () => { context.sessionUser.id = "other-account"; },
    () => { context.state.completed.move = true; },
    () => { context.bgmResetRevision += 1; },
  ].forEach((change) => {
    const previous = calls.at(-1)[1];
    change();
    context.syncBgmStage();
    assert.notEqual(calls.at(-1)[1], previous, "实际流程变化会产生新的上下文");
  });
  const resetSource = CONSOLE_HTML.match(/    function resetToday\([^]*?\n    }/)[0];
  assert.match(resetSource, /bgmResetRevision \+= 1/);
});

if (require.main === module) {
  // 直接 `node tools/test-story-bgm.cjs` 时交给 node:test 输出
}
