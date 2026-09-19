/* 背景音乐播放器测试
 *
 * 运行：node tools/test-bgm-player.cjs
 * （不要用 node --test 的 runner：它需要为每个文件派生带管道的子进程。）
 *
 * 用 tools/bgm-test-harness.cjs 的最小 DOM / Web Audio 替身加载 assets/bgm/manifest.js 与
 * assets/bgm/bgm.js，断言：
 *   - 主控台今日流程每一步都有对应阶段，且每个阶段都给出 .mp3 / .ogg 两种候选；
 *   - 默认关闭，开启后跟随步骤切换主曲 / 氛围层 / 转场音；
 *   - 缺 .mp3 时自动改用 .ogg；文件全缺时只提示，不抛错；
 *   - 手动锁定阶段优先于自动跟随；
 *   - 音量、duck、开关写入偏好并作用于总线增益。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { ROOT, createHarness, createFakeIndexedDb, makeAudioFile, playerSource, waitFor } = require("./bgm-test-harness.cjs");

// vm 里造出来的对象/数组与宿主 realm 的原型不同，deepStrictEqual 会因此报错，
// 比较前先过一遍 JSON，只比结构。
const plain = (value) => JSON.parse(JSON.stringify(value));

const consoleSource = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* ---------- 清单 ---------- */

test("清单：今日流程每一步都有阶段，且阶段曲目可解析", () => {
  const manifest = createHarness().sandbox.ATO_BGM_MANIFEST;
  ["move", "explore", "survey", "encounter", "development", "story", "doom"].forEach((stepId) => {
    const key = manifest.flowStageMap[stepId];
    assert.ok(key, `缺少步骤映射：${stepId}`);
    assert.ok(manifest.stages[key], `映射的阶段不存在：${stepId} → ${key}`);
  });
  assert.ok(manifest.stages[manifest.defaultStage], "defaultStage 必须是有效阶段");
  assert.equal(manifest.baseDir, "./", "baseDir 应按 manifest.js 自身目录解析，不能是页面相对路径");
  assert.equal(manifest.audioDir, "./audio/", "audioDir 应指向 assets/bgm/audio/（Docker 只挂载这一个子目录）");
  Object.keys(manifest.stages).forEach((key) => {
    const stage = manifest.stages[key];
    assert.ok(stage.label, `${key} 缺少 label`);
    assert.ok(Array.isArray(stage.files) && stage.files.length, `${key} 缺少 files`);
    assert.match(stage.files[0], /\.mp3$/, `${key} 首选文件应为 .mp3（各平台通用）`);
    assert.ok(stage.files.some((file) => /\.ogg$/.test(file)), `${key} 应保留 .ogg 候选`);
  });
  assert.match(manifest.stages.explore.files[0], /LB_Exploration_Step/);
  assert.match(manifest.stages.explore.bed.files[0], /Expedition_Step_Ambience/);
  assert.match(manifest.stages.explore.stinger.files[0], /Expedition_Step_Anchor/);
});

test("主控台：引入播放器、提供容器并按步骤同步", () => {
  assert.match(consoleSource, /<script src="\.\/assets\/bgm\/manifest\.js/);
  assert.match(consoleSource, /<script src="\.\/assets\/bgm\/bgm\.js/);
  assert.match(consoleSource, /id="bgmControls"/);
  assert.match(consoleSource, /function syncBgmStage\(\)/);
  assert.match(consoleSource, /syncBgmStage\(\);\s*\n\s*\}/);

  // 控制条是主控台里独立的一块，位于「用户与存档」下方，不再挤在顶栏日期卡里
  assert.match(consoleSource, /<h2>背景音乐<\/h2>/);
  assert.equal((consoleSource.match(/id="bgmControls"/g) || []).length, 1, "控制条容器只应出现一次");
  const bgmPos = consoleSource.indexOf('id="bgmControls"');
  assert.ok(bgmPos > consoleSource.indexOf("<h2>用户与存档</h2>"), "背景音乐控制条应排在「用户与存档」之后");
  const dayCardStart = consoleSource.indexOf('class="day-card"');
  const dayCardEnd = consoleSource.indexOf("</section>", dayCardStart);
  assert.ok(!consoleSource.slice(dayCardStart, dayCardEnd).includes("bgmControls"), "控制条不应再放在顶栏日期卡里");
  assert.ok(bgmPos < consoleSource.indexOf('class="app-updates"'), "背景音乐面板应在页面主区之内");

  const stepIds = Array.from(consoleSource.matchAll(/id: "([a-zA-Z]+)",\s*\n\s*title: "/g)).map((match) => match[1]);
  assert.ok(stepIds.length >= 7, `未解析到今日流程步骤：${stepIds.join(",")}`);
  const manifest = createHarness().sandbox.ATO_BGM_MANIFEST;
  stepIds.forEach((stepId) => {
    assert.ok(manifest.flowStageMap[stepId], `assets/bgm/manifest.js 缺少步骤映射：${stepId}`);
  });
});

/* ---------- 播放 ---------- */

test("默认关闭；开启后跟随步骤切换主曲与氛围层", async () => {
  const harness = createHarness();
  const api = harness.api;
  assert.equal(harness.prefsStore.size, 0, "未操作前不应写偏好");

  await api.setFlowStage("explore");
  assert.deepEqual(harness.playing(), [], "关闭状态下不应播放");

  api.setEnabled(true);
  assert.equal(harness.prefsStore.get("ato-bgm-prefs-v1").includes('"enabled":true'), true);
  await waitFor(() => harness.loudest() === "LB_Exploration_Step.mp3", "探索主曲");
  await waitFor(() => harness.playing().includes("XX_LB_Expedition_Step_Ambience.mp3"), "探索氛围层");
  // 转场音排在主曲和氛围层之后才开始，需要等它启动
  await waitFor(() => harness.playing().includes("XX_LB_Expedition_Step_Anchor.mp3"), "进入探索的转场音");

  await api.setFlowStage("encounter");
  assert.equal(api.state().stage, "encounter");
  assert.match(api.state().url, /LB_Primordial_Encounter_Theme\.mp3$/);
  await waitFor(() => harness.loudest() === "LB_Primordial_Encounter_Theme.mp3", "战斗曲");
  await waitFor(() => !harness.playing().includes("XX_LB_Expedition_Step_Ambience.mp3"), "探索氛围层应淡出");
});

test("刷新后开启偏好不会在初始空阶段崩溃，并恢复播放", async () => {
  const localStorage = new Map();
  const first = createHarness({ localStorage });
  first.api.setEnabled(true);
  await first.api.setFlowStage("explore");
  await waitFor(() => first.loudest() === "LB_Exploration_Step.mp3", "首次打开的探索曲");
  first.close();

  const reloaded = createHarness({ localStorage });
  await waitFor(() => reloaded.loudest() === "LB_Bridge_Tholos_2.mp3", "刷新后的默认曲");
  assert.equal(reloaded.api.state().enabled, true);
  assert.equal(reloaded.api.state().needGesture, false);
  reloaded.close();
});

test("刷新后恢复手动锁定阶段", async () => {
  const localStorage = new Map();
  const first = createHarness({ localStorage });
  first.api.setEnabled(true);
  await first.api.setStage("mnemos");
  await waitFor(() => first.loudest() === "LB_Last_Academy_2.mp3", "首次打开的回忆突破曲");
  first.close();

  const reloaded = createHarness({ localStorage });
  await waitFor(() => reloaded.loudest() === "LB_Last_Academy_2.mp3", "刷新后的回忆突破曲");
  assert.equal(reloaded.api.state().forcedStage, "mnemos");
  reloaded.close();
});

test("缺少 .mp3 时自动改用 .ogg 候选", async () => {
  const harness = createHarness({ exists: (url) => !url.endsWith(".mp3") });
  const api = harness.api;
  api.setEnabled(true);
  assert.equal(await api.setFlowStage("story"), "story");
  await waitFor(() => harness.loudest() === "LB_Old_Priest_Theme.ogg", "ogg 候选");
  assert.equal(api.state().url.endsWith("LB_Old_Priest_Theme.ogg"), true);
});

test("曲目全缺时只提示缺少文件，不抛错", async () => {
  const harness = createHarness({ exists: () => false });
  const api = harness.api;
  api.setEnabled(true);
  await api.setFlowStage("development");
  await waitFor(() => /缺少音频文件/.test(harness.panel().querySelector("#atoBgmStatus").textContent), "缺少文件提示");
  assert.deepEqual(harness.playing(), []);
  assert.equal(api.state().stage, "development");
  assert.ok(api.state().missing.length >= 2, "两个候选都应记为缺失");
  assert.match(harness.panel().querySelector("#atoBgmStatus").textContent, /assets\/bgm\/ 或 assets\/bgm\/audio\//, "提示里要写清两个可选目录");
});

test("音频放在 assets/bgm/audio/ 时也能播（Docker 只挂载这一个子目录）", async () => {
  // 容器里的真实情形：播放器代码来自镜像，宿主机只把音频挂进 audio/，
  // 所以本目录的候选全都 404，必须继续往 audio/ 找。
  const harness = createHarness({
    exists: (url) => url.includes("/assets/bgm/audio/") && url.endsWith(".mp3"),
  });
  const api = harness.api;
  api.setEnabled(true);
  await api.setStage("hub");
  await waitFor(() => harness.loudest() === "LB_Grand_Agora.mp3", "audio/ 里的冒险中枢曲");
  assert.equal(api.state().url, "http://ato.local/assets/bgm/audio/LB_Grand_Agora.mp3");
});

test("本目录优先于 audio/；清单把 audioDir 写成空字符串后只认本目录", async () => {
  // 两处都有文件时用本目录：便携版 / Android / 桌面的既有行为不变
  const both = createHarness();
  both.api.setEnabled(true);
  await both.api.setStage("hub");
  await waitFor(() => both.loudest() === "LB_Grand_Agora.mp3", "本目录优先");
  assert.equal(both.api.state().url, "http://ato.local/assets/bgm/LB_Grand_Agora.mp3");

  // audioDir: "" → 关掉回退，audio/ 里有文件也当缺失
  const off = createHarness({
    exists: (url) => url.includes("/assets/bgm/audio/"),
    manifest: { audioDir: "" },
  });
  off.api.setEnabled(true);
  await off.api.setStage("hub");
  await waitFor(() => /缺少音频文件/.test(off.panel().querySelector("#atoBgmStatus").textContent), "关掉回退后的缺失提示");
  assert.deepEqual(off.playing(), []);
});

test("音频按脚本目录解析，不受页面深浅影响", async () => {
  // 主控台在根目录、story 深一层：两边都应指向 assets/bgm/ 这一处
  const harness = createHarness({ scriptDir: "http://ato.local/assets/bgm/" });
  harness.api.setEnabled(true);
  await harness.api.setStage("hub");
  await waitFor(() => harness.loudest() === "LB_Grand_Agora.mp3", "冒险中枢曲");
  assert.equal(harness.api.state().url, "http://ato.local/assets/bgm/LB_Grand_Agora.mp3");
  assert.ok(!harness.api.state().url.includes("/story/"), "不应把页面路径拼进音频地址");

  // 取不到脚本目录（老浏览器/内联引入）时退化为页面相对路径
  const legacy = createHarness({ scriptDir: "" });
  legacy.api.setEnabled(true);
  await legacy.api.setStage("hub");
  await waitFor(() => legacy.loudest() === "LB_Grand_Agora.mp3", "退化路径也能播");
  assert.ok(!legacy.api.state().url.startsWith("http"), "退化时用页面相对路径");
  assert.ok(legacy.api.state().url.endsWith("/LB_Grand_Agora.mp3"));
});

test("手动锁定阶段优先于今日流程，选回自动后恢复", async () => {
  const harness = createHarness();
  const api = harness.api;
  api.setEnabled(true);
  await api.setStage("mausoleum");
  await waitFor(() => harness.loudest() === "LB_Argonaut_Mausoleum.mp3", "锁定终局曲");
  assert.match(harness.panel().querySelector("#atoBgmStatus").textContent, /手动锁定/, "锁定时状态里要说明");
  await api.setFlowStage("doom");
  assert.equal(api.state().stage, "mausoleum", "锁定期间不跟随步骤");
  await api.setScene("mnemos");
  assert.equal(api.state().stage, "mausoleum", "锁定期间也不跟随入口场景");
  assert.equal(api.state().sceneStage, "", "锁定期间不积压临时场景");
  await api.setAuto();
  await waitFor(() => harness.loudest() === "LB_Foreboding_Theme.mp3", "解除锁定后直接跟随流程");
  assert.ok(!/手动锁定/.test(harness.panel().querySelector("#atoBgmStatus").textContent), "解除锁定后不再提示");
  await api.setScene("");
  await waitFor(() => harness.loudest() === "LB_Foreboding_Theme.mp3", "清空场景后跟随流程（灾祸）");
  assert.equal(api.state().stage, "doom");
});

test("临时切换（按钮/入口走的就是它）：控制台阶段一变就自动切回来", async () => {
  const harness = createHarness();
  const api = harness.api;
  const status = () => harness.panel().querySelector("#atoBgmStatus").textContent;
  api.setEnabled(true);
  await api.setFlowStage("voyage");
  await waitFor(() => harness.loudest() === "LB_Bridge_Tholos_2.mp3", "航行曲");

  await api.setScene("mnemos");
  await waitFor(() => harness.loudest() === "LB_Last_Academy_2.mp3", "临时切到回忆突破");
  assert.equal(api.state().stage, "mnemos");
  assert.equal(api.state().forcedStage, "", "临时切换不写锁定");
  assert.match(status(), /临时切换/);

  // 同一步骤重复同步（renderFlow 会反复调用）不该撤销临时切换
  await api.setFlowStage("voyage");
  assert.equal(api.state().stage, "mnemos", "步骤没变时不撤销");
  assert.equal(api.state().sceneStage, "mnemos");

  // 控制台阶段真的变了 → 撤销临时切换，回到跟随流程
  await api.setFlowStage("doom");
  await waitFor(() => harness.loudest() === "LB_Foreboding_Theme.mp3", "阶段变化后切回跟随流程");
  assert.equal(api.state().sceneStage, "", "临时切换已撤销");
  assert.equal(api.state().stage, "doom");
  assert.ok(!/临时切换/.test(status()), "状态提示也应撤掉");

  // 下拉锁定不受阶段变化影响
  await api.setStage("mausoleum");
  await waitFor(() => harness.loudest() === "LB_Argonaut_Mausoleum.mp3", "锁定终局曲");
  await api.setFlowStage("voyage");
  assert.equal(api.state().stage, "mausoleum", "锁定不会被阶段变化撤销");
  await api.setAuto();
  await waitFor(() => harness.loudest() === "LB_Bridge_Tholos_2.mp3", "解锁后跟随流程");
});

/* ---------- 自选 BGM ---------- */

test("临时场景在下拉中可见，点跟随流程立即退出临时切换", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("survey");
  await api.setScene("hub");
  const panel = harness.panel();
  assert.equal(panel.querySelector("#atoBgmStage").value, "scene:hub");
  assert.match(panel.querySelector("#atoBgmStage").innerHTML, /临时：冒险中枢/);
  assert.equal(panel.querySelector("#atoBgmAuto").hidden, false);
  panel.querySelector("#atoBgmAuto").dispatch("click");
  await waitFor(() => harness.loudest() === "LB_Excursion_Propylon.mp3", "返回考察流程");
  assert.equal(api.state().sceneStage, "");
  assert.equal(api.state().mode, "auto");
  assert.equal(panel.querySelector("#atoBgmStage").value, "");
  assert.equal(panel.querySelector("#atoBgmAuto").hidden, true);
});

test("普通同步保留临时曲；流程上下文变化即使步骤相同也会撤销临时曲", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("move", "profile:c1:1");
  await api.setScene("hub");
  await api.setFlowStage("move", "profile:c1:1");
  assert.equal(api.state().mode, "scene");
  await api.setFlowStage("move", "profile:c1:2");
  assert.equal(api.state().stage, "voyage");
  assert.equal(api.state().sceneStage, "");
  await api.setStage("mnemos");
  await api.setFlowStage("move", "other:c2:1");
  assert.equal(api.state().stage, "mnemos", "跨存档/日期不解除手动锁定");
});

test("同曲切换模式、临时场景与无关自选指派不重播", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("move");
  const active = harness.audios.find((audio) => !audio.paused);
  active.currentTime = 42;
  const calls = () => harness.audios.reduce((sum, audio) => sum + audio.playCalls, 0);
  const before = calls();
  await api.setStage("voyage");
  await api.setAuto();
  await api.setScene("rest");
  await api.setAuto();
  await api.importTrack(makeAudioFile("unrelated.mp3"), "doom");
  await waitFor(() => !api.state().loading, "指派完成");
  assert.equal(calls(), before);
  assert.equal(active.currentTime, 42);
});

test("旧的文件探测最后返回，也不能抢回新场景或暂停新曲", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("move");
  let release;
  harness.sandbox.fetch = (url) => url.includes("LB_Last_Academy")
    ? new Promise((resolve) => { release = () => resolve({ ok: true }); })
    : Promise.resolve({ ok: true });
  const old = api.setScene("mnemos");
  await waitFor(() => release, "旧文件探测等待中");
  await api.setScene("hub");
  release();
  await old;
  await waitFor(() => harness.playing().length === 1, "旧曲淡出");
  assert.deepEqual(harness.playing(), ["LB_Grand_Agora.mp3"]);
  assert.equal(api.state().stage, "hub");
  assert.equal(api.state().missing.length, 0);
});

test("连续切换取消未完成的 play，旧的失败回调不能污染新曲", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("move");
  let rejectOld;
  harness.audios.forEach((audio) => {
    const normalPlay = audio.play;
    audio.play = function () {
      if (!this.src.includes("LB_Last_Academy")) return normalPlay.call(this);
      this.paused = false;
      return new Promise((resolve, reject) => { rejectOld = reject; });
    };
  });
  const old = api.setScene("mnemos");
  await waitFor(() => rejectOld, "旧播放等待中");
  await api.setScene("hub");
  rejectOld(Object.assign(new Error("cancelled"), { name: "AbortError" }));
  await old;
  await waitFor(() => harness.playing().length === 1, "只剩最新曲目");
  assert.deepEqual(harness.playing(), ["LB_Grand_Agora.mp3"]);
  assert.equal(api.state().needGesture, false);
  assert.equal(api.state().missing.length, 0);
});

test("加载期间关音乐，迟到的请求不会继续播放", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("move");
  let release;
  harness.sandbox.fetch = () => new Promise((resolve) => { release = () => resolve({ ok: true }); });
  const pending = api.setScene("hub");
  await waitFor(() => release, "新曲加载中");
  api.setEnabled(false);
  release();
  await pending;
  await waitFor(() => harness.playing().length === 0, "关闭所有音频");
  assert.equal(api.state().url, "");
  assert.equal(api.state().loading, false);
});

test("离开探索时同时结束氛围层与转场音", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("explore");
  assert.ok(harness.playing().includes("XX_LB_Expedition_Step_Anchor.mp3"));
  await api.setFlowStage("survey");
  await waitFor(() => harness.playing().length === 1, "探索所有音轨都已淡出");
  assert.deepEqual(harness.playing(), ["LB_Excursion_Propylon.mp3"]);
});

test("快速复用淡出中的槽位时，原来的定时清理不会截断新曲", async (t) => {
  const harness = createHarness();
  t.after(() => harness.close());
  const { api } = harness;
  api.setEnabled(true);
  await api.setFlowStage("move");
  await api.setScene("hub");
  await api.setScene("mnemos");
  await api.setScene("pharos");
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(harness.playing(), ["LB_Dreams_of_Pharos.mp3"]);
  assert.equal(api.state().stage, "pharos");
});

test("导入自选 BGM：指派到阶段后该阶段播自选曲，内置曲目作为兜底", async () => {
  const harness = createHarness();
  const api = harness.api;
  const file = makeAudioFile("custom-battle.mp3");

  const imported = await api.importTrack(file, "encounter");
  assert.equal(imported.ok, true, imported.error);
  assert.equal(imported.stage, "encounter");
  assert.deepEqual(plain(api.state().assignments), { encounter: imported.track.id });
  assert.deepEqual(plain(api.tracks().map((track) => track.name)), ["custom-battle"]);

  api.setEnabled(true);
  const key = await api.setFlowStage("encounter");
  assert.equal(key, "encounter");
  await waitFor(() => harness.loudest().startsWith("blob:ato-bgm/"), "自选曲目");
  assert.equal(api.state().name, "custom-battle", "状态里应显示自选曲目名");
  assert.deepEqual(harness.playing(), [harness.loudest()], "同一时间只放自选曲目");

  // 没指派自选曲目的阶段仍然放内置曲目
  await api.setFlowStage("story");
  await waitFor(() => harness.loudest() === "LB_Old_Priest_Theme.mp3", "内置故事曲");
  assert.equal(api.state().name, "");
});

test("自选 BGM 支持改派阶段与删除", async () => {
  const harness = createHarness();
  const api = harness.api;
  const imported = await api.importTrack(makeAudioFile("custom-story.mp3"), "story");
  api.setEnabled(true);
  await api.setFlowStage("story");
  await waitFor(() => harness.loudest().startsWith("blob:ato-bgm/"), "自选故事曲");

  assert.equal(await api.assignTrack(imported.track.id, "doom"), "doom");
  assert.deepEqual(plain(api.state().assignments), { doom: imported.track.id });
  await api.setFlowStage("story");
  await waitFor(() => harness.loudest() === "LB_Old_Priest_Theme.mp3", "改派后原阶段回到内置曲");
  await api.setFlowStage("doom");
  await waitFor(() => harness.loudest().startsWith("blob:ato-bgm/"), "改派后的阶段播自选曲");

  assert.equal(await api.deleteTrack(imported.track.id), true);
  assert.deepEqual(plain(api.tracks()), []);
  assert.deepEqual(plain(api.state().assignments), {});
  await waitFor(() => harness.loudest() === "LB_Foreboding_Theme.mp3", "删除后回到内置灾祸曲");
});

test("指派表存在 localStorage，重新打开页面仍生效", async () => {
  const sharedIndexedDb = createFakeIndexedDb();
  const sharedStorage = new Map();

  const first = createHarness({ indexedDb: sharedIndexedDb, localStorage: sharedStorage });
  const imported = await first.api.importTrack(makeAudioFile("persist.mp3"), "voyage");
  assert.equal(imported.ok, true, imported.error);

  const second = createHarness({ indexedDb: sharedIndexedDb, localStorage: sharedStorage });
  await waitFor(() => second.api.state().customTracks === 1, "重新加载后读回自选曲目");
  assert.deepEqual(plain(second.api.state().assignments), { voyage: imported.track.id });
  assert.equal(second.api.tracks()[0].name, "persist");
  second.api.setEnabled(true);
  await waitFor(() => second.loudest().startsWith("blob:ato-bgm/"), "重载后播放自选曲");
  assert.equal(second.api.state().name, "persist");
});

test("控制条里有导入入口、自选标记与曲目列表", async () => {
  const harness = createHarness();
  const panel = harness.panel();
  assert.match(panel.innerHTML, /id="atoBgmFile"/);
  assert.match(panel.innerHTML, /id="atoBgmTarget"/);
  assert.match(panel.innerHTML, /id="atoBgmTracks"/);
  assert.match(panel.innerHTML, /导入自选 BGM/);
  // 三行结构：开关+阶段+音量 / 导入(仅开启时显示) / 状态
  assert.match(panel.innerHTML, /<div class="ato-bgm-row"><button[^>]*id="atoBgmToggle"/, "开关在第一行");
  assert.match(panel.innerHTML, /class="ato-bgm-row ato-bgm-only-on">[\s\S]{0,600}?id="atoBgmFile"/, "导入控件在第二行且关闭时隐藏");
  assert.match(panel.innerHTML, /ato-bgm-volume ato-bgm-only-on/, "音量也在关闭时隐藏");
  assert.match(panel.innerHTML, /<div class="ato-bgm-row"><span class="ato-bgm-status"/, "状态文字单独一行");
  assert.match(panel.innerHTML, /ato-bgm-tracks ato-bgm-only-on/, "曲目列表在关闭时隐藏");
  assert.match(harness.sandbox.document.head.children.map((node) => node.textContent).join("\n"), /\.ato-bgm-status\{[^}]*white-space:normal/);

  await harness.api.importTrack(makeAudioFile("ui-track.mp3"), "armory");
  const list = panel.querySelector("#atoBgmTracks").innerHTML;
  assert.match(list, /ui-track/);
  assert.match(list, /data-role="delete"/);
  assert.match(list, /data-role="stage"/);
  assert.match(panel.querySelector("#atoBgmStage").innerHTML, /（自选）/);
});

test("浏览器不支持 IndexedDB 时明确报错，不抛异常", async () => {
  const harness = createHarness({ indexedDb: null });
  const api = harness.api;
  assert.equal(api.state().customSupported, false);
  const result = await api.importTrack(makeAudioFile("x.mp3"), "story");
  assert.equal(result.ok, false);
  assert.match(result.error, /不支持/);
  assert.deepEqual(plain(api.tracks()), []);
  assert.match(harness.panel().querySelector("#atoBgmExtra").textContent, /不支持/);
});

test("音乐关闭时只留开关：其余操作项与曲目列表都收起", async () => {
  const harness = createHarness();
  const panel = harness.panel();
  const api = harness.api;

  // 关闭状态（默认）：面板带 off 类，状态行隐藏
  assert.equal(panel.classList.contains("off"), true, "关闭时应带 off 类");
  assert.equal(panel.querySelector("#atoBgmStatus").hidden, true, "关闭时状态行不占位");
  assert.match(harness.sandbox.document.head.children.map((n) => n.textContent).join("\n"), /\.ato-bgm-bar\.off \.ato-bgm-only-on\{display:none\}/);
  assert.ok(panel.innerHTML.includes('class="ato-bgm-row ato-bgm-only-on"'), "导入行标了 only-on");
  assert.ok(panel.innerHTML.includes('ato-bgm-tracks ato-bgm-only-on'), "曲目列表标了 only-on");

  // 开启后：off 类去掉，状态行显示
  api.setEnabled(true);
  await waitFor(() => panel.classList.contains("off") === false, "开启后不再带 off 类");
  await waitFor(() => panel.querySelector("#atoBgmStatus").hidden === false, "开启后状态行可见");

  // 关闭后回到精简状态
  api.setEnabled(false);
  await waitFor(() => panel.classList.contains("off") === true, "再关掉又回到精简状态");
});

test("控制条里不再有阶段按钮那一排", async () => {
  const harness = createHarness();
  const panel = harness.panel();
  assert.ok(!panel.innerHTML.includes("atoBgmStages"), "阶段按钮行应已移除");
  assert.ok(!/data-bgm-stage=/.test(panel.innerHTML), "不该再有阶段按钮");
  assert.ok(!/ato-bgm-scene/.test(panel.innerHTML), "不该再有阶段按钮样式");
  // 「自动」仍然在阶段下拉里，作为解除锁定的入口
  assert.match(panel.querySelector("#atoBgmStage").innerHTML, /自动（跟随今日流程）/);
});

test("只有主控台引入播放器，story 页不再挂播放器/广播", async () => {
  const build = playerSource.match(/const BUILD = "([^"]+)"/);
  assert.ok(build, "bgm.js 里应有 BUILD 常量");
  const tag = build[1];

  const consoleHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tags = Array.from(consoleHtml.matchAll(/assets\/bgm\/(?:manifest|bgm)\.js\?v=([^"']+)/g)).map((m) => m[1]);
  assert.equal(tags.length, 2, "主控台应引入 manifest.js 与 bgm.js");
  tags.forEach((value) => assert.ok(
    value === tag || value.endsWith("-" + tag),
    `主控台 ?v=${value} 应以 ${tag} 结尾（改完播放器要一起 bump）`,
  ));
  assert.match(consoleHtml, new RegExp(`expect: "${tag}"`), `主控台的 ATO_BGM_CONFIG 应带 expect: "${tag}"`);
  assert.ok(!/remoteScene|publishScene/.test(consoleHtml), "主控台不再使用跨页广播");

  const storyHtml = fs.readFileSync(path.join(ROOT, "story/index.html"), "utf8");
  assert.ok(!/assets\/bgm\//.test(storyHtml), "story 页不再引入播放器");
  assert.ok(!/ATO_BGM_CONFIG/.test(storyHtml), "story 页不再配置播放器角色");

  // 页面期望的版本与脚本不一致时，状态栏直接报旧版
  const stale = createHarness({ config: { expect: "bgm-old" } });
  stale.api.setEnabled(true);
  await waitFor(() => /旧版本/.test(stale.panel().querySelector("#atoBgmStatus").textContent), "旧版提示");
});

test("音量、duck 与开关都能写入偏好并作用于总线增益", async () => {
  const harness = createHarness();
  const api = harness.api;
  api.setEnabled(true);
  await api.setFlowStage("voyage");
  await waitFor(() => harness.loudest() === "LB_Bridge_Tholos_2.mp3", "航行曲");

  api.setVolume(0.2);
  assert.equal(api.state().volume, 0.2);
  assert.equal(Math.round(harness.master.value * 1000) / 1000, 0.2);

  api.duck(true);
  assert.ok(Math.abs(harness.master.value - 0.2 * Math.pow(10, -14 / 20)) < 1e-6, "duck 应压低 14dB");
  api.duck(false);
  assert.equal(Math.round(harness.master.value * 1000) / 1000, 0.2);

  api.setEnabled(false);
  await waitFor(() => harness.playing().length === 0, "关闭后应停止播放");
  const saved = JSON.parse(harness.prefsStore.get("ato-bgm-prefs-v1"));
  assert.deepEqual({ enabled: saved.enabled, volume: saved.volume }, { enabled: false, volume: 0.2 });
  assert.deepEqual(api.stages().includes("mnemos"), true);
});
