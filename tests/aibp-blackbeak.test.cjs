// 守护黑喙（Blackbeak）这条独立隐藏 BOSS 链路：
// 它是自成一体的 boss（不是赫利俄斯的模式），卡组沿用赫尔墨斯追踪者的明文卡图，
// 自己的 3 张卡加密存放。改动碰到任何一环都会在这里报出来。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const assets = require(path.join(root, "aibp", "b4d7e218.js"));
const bossSearch = require(path.join(root, "aibp", "boss-search.js"));
const binDir = path.join(root, "aibp", "ps", "other", "3b6e9d20");
const aibpDir = path.join(root, "aibp");
const indexSource = fs.readFileSync(path.join(root, "aibp", "index.html"), "utf8");

// 依次加载两个配置脚本（它们都挂在 window 上）
const windowStub = { HeliosAssets: { path: (source) => assets.path(source) } };
vm.runInNewContext(fs.readFileSync(path.join(root, "aibp", "c9f0a6d3.js"), "utf8"), { window: windowStub });
vm.runInNewContext(fs.readFileSync(path.join(root, "aibp", "5158e31a.js"), "utf8"), { window: windowStub });
const helios = windowStub.HeliosConfig;
const blackbeak = windowStub.BlackbeakCardList;

function entryFunction(name) {
  let start = indexSource.indexOf(`    function ${name}(`);
  if (start === -1) start = indexSource.indexOf(`    async function ${name}(`);
  assert.notEqual(start, -1, `${name} 缺失`);
  const end = indexSource.indexOf("\n    function ", start + 1);
  return indexSource.slice(start, end);
}

test("首次选择黑喙能建立 AI 和 BP 卡组", () => {
  const state = vm.runInNewContext(`(${entryFunction("initialState")})()`, {
    currentApostle: "BLACKBEAK",
    window: windowStub,
    shuffleCards: (cards) => [...cards],
    defaultPile: () => [],
    supplyPile: () => [],
    initialFlarePile: () => ({ deck: [], discard: [] }),
    initialTitanFeintPile: () => ({ deck: [], active: [], removed: [] }),
  });
  for (const type of ["AI", "BP"]) {
    assert.equal(state[type].deck.length, 6);
    assert.equal(state[type].supply.II.length, 6);
    assert.equal(state[type].supply.III.length, type === "BP" ? 5 : 6);
    assert.ok(state[type].deck.every((card) => sealed(card.src)));
  }
  assert.equal(state.flare.deck.length, 5);
  assert.equal(state.flare.deck[4].index, 5);
});

test("黑喙随命与标志卡正反面沿用追踪者卡图", () => {
  for (const kind of ["ROUTINE", "SIGNATURE"]) {
    let rendered;
    const context = {
      window: { ...windowStub, HeliosAssets: { resolve: (src) => src } },
      imageOrMessage: (src) => ({ src, dataset: {} }),
      wrap: { replaceChildren: (img) => { rendered = img; } },
    };
    vm.runInNewContext(`${entryFunction("renderFlipCard")}\nrenderFlipCard(wrap, "ps/BLACKBEAK", "BLACKBEAK", "${kind}");`, context);
    assert.equal(rendered.src, blackbeak[kind.toLowerCase()].src);
    assert.equal(rendered.dataset.backSrc, blackbeak[kind.toLowerCase()].backSrc);
    assert.ok(sealed(rendered.src));
    assert.ok(sealed(rendered.dataset.backSrc));
  }
});

function sealed(source) {
  if (typeof source !== "string" || !source) return false;
  if (source.startsWith("ps/other/3b6e9d20/")) {
    return fs.existsSync(path.join(binDir, path.basename(source)));
  }
  if (source.startsWith("ps/")) return fs.existsSync(path.join(aibpDir, source));
  return false;
}

test("黑喙是独立配置，不是赫利俄斯的模式", () => {
  assert.ok(blackbeak, "BlackbeakCardList 缺失");
  assert.deepEqual(Object.keys(helios.modes).sort(), ["c4", "normal"], "黑喙不该出现在 HeliosConfig.modes");
  assert.equal(helios.modes.blackbeak, undefined);
  // 入口层把黑喙当独立 apostle
  assert.match(indexSource, /"BLACKBEAK"\s*\n?\s*\]/, "apostles 里没有 BLACKBEAK");
  assert.match(indexSource, /name === "HELIOS" \|\| name === "BLACKBEAK"/, "黑喙导航按钮没有默认隐藏");
});

test("黑喙卡组：18 张 AI + 17 张 BP，永久排除黑血密码筒", () => {
  for (const type of ["AI", "BP"]) {
    for (const level of ["I", "II", "III"]) {
      assert.equal(blackbeak[type][level].length, type === "BP" && level === "III" ? 5 : 6);
    }
  }
  const problems = [];
  const check = (label, src) => {
    if (typeof src !== "string" || !src.startsWith("ps/HERMESIAN_PURSUER/")) {
      problems.push(`${label} 不是追踪者明文引用 -> ${src}`);
    } else if (!sealed(src)) {
      problems.push(`${label} 文件不存在 -> ${src}`);
    }
  };
  for (const type of ["AI", "BP"]) {
    for (const level of ["I", "II", "III"]) {
      for (const card of blackbeak[type][level]) {
        check(`${type} ${level} #${card.index} F`, card.src);
        check(`${type} ${level} #${card.index} B`, card.backSrc);
      }
    }
  }
  for (const key of ["routine", "signature"]) {
    check(`${key} F`, blackbeak[key].src);
    check(`${key} B`, blackbeak[key].backSrc);
  }
  assert.deepEqual(problems, [], `追踪者卡图引用有问题：\n${problems.join("\n")}`);
});

test("黑喙沿用追踪者大卡，自己的面板作为 Trait 加密存放", () => {
  assert.equal(blackbeak.panel, "ps/HERMESIAN_PURSUER/HERMESIAN_PURSUER.jpg");
  assert.ok(sealed(blackbeak.panel), "追踪者面板缺失");
  assert.ok(sealed(blackbeak.panelBack), "面板背面加密产物缺失");
  assert.equal(blackbeak.extraCards.length, 2, "Trait 区仅包含面板修改特性和专属特性");
  const labels = blackbeak.extraCards.map((card) => card.label).join(" | ");
  assert.match(labels, /拟态黑暗|血腥同盟/, "缺少黑喙特性卡");
  assert.doesNotMatch(labels, /以太吸取/, "闪粉不应出现在 Trait 区");
  for (const card of blackbeak.extraCards) {
    assert.ok(card.src.startsWith("ps/other/3b6e9d20/"), `${card.label} 应加密`);
    assert.ok(sealed(card.src), `${card.label} 加密产物缺失`);
  }
});

function makeState() {
  return vm.runInNewContext(`(${entryFunction("initialState")})()`, {
    currentApostle: "BLACKBEAK", window: windowStub,
    shuffleCards: (cards) => [...cards], defaultPile: () => [], supplyPile: () => [],
    initialFlarePile: () => ({ deck: [], discard: [] }),
    initialTitanFeintPile: () => ({ deck: [], active: [], removed: [] }),
  });
}

test("黑喙第五张闪粉可抽取、弃置并参与重洗", () => {
  const state = makeState();
  const drawn = [];
  const context = {
    currentApostle: "BLACKBEAK", hermesianName: "HERMESIAN_PURSUER",
    piles: { BLACKBEAK: state }, ensurePiles() {}, rememberUndo() {},
    savePiles() {}, renderAibpCards() {}, shuffleCards: (cards) => [...cards],
    cardSrc: (card) => card.src, openImageZoom: (src) => drawn.push(src),
  };
  vm.runInNewContext(`${entryFunction("isHermesian")}\n${entryFunction("drawFlare")}\nfor (let i = 0; i < 5; i++) drawFlare();`, context);
  assert.equal(state.flare.deck.length, 0);
  assert.equal(state.flare.discard.length, 5);
  assert.equal(drawn[4], blackbeak.flares[4].src);
  vm.runInNewContext("drawFlare();", context);
  assert.equal(state.flare.deck.length, 4);
  assert.equal(state.flare.discard.length, 1);
  assert.equal(state.flare.deck.some((card) => card.index === 5), true);
});

test("旧存档迁移不重置进度：补第五张闪粉并清理所有位置的黑血密码筒", () => {
  const state = makeState();
  const forbidden = { type: "BP", level: "III", index: 6 };
  delete state.blackbeak;
  state.flare = { deck: [{ type: "FL", level: "X", index: 1 }], discard: [{ type: "FL", level: "X", index: 2 }] };
  state.AI.pending = state.AI.deck.at(-1);
  const pendingIndex = state.AI.pending.index;
  for (const key of ["deck", "discard", "damage", "damage1", "damage2"]) state.BP[key].push({ ...forbidden });
  state.BP.supply.III.push({ ...forbidden });
  state.BP.pending = { ...forbidden };
  const normalize = windowStub.BlackbeakConfig.normalize;
  assert.equal(normalize(state, (cards) => [...cards]), true);
  assert.equal(state.AI.pending.index, pendingIndex);
  assert.equal(state.BP.pending, null);
  assert.equal(state.BP.removed.filter((card) => card.index === 6 && card.level === "III").length, 1);
  assert.equal(state.flare.discard[0].index, 2);
  assert.equal(state.flare.deck.filter((card) => card.index === 5).length, 1);
  assert.equal(normalize(state, (cards) => [...cards]), false);
});

test("牌底 AI 抽取与刷新后的弃置不会留下重复卡", () => {
  const state = makeState();
  const bottomIndex = state.AI.deck.at(-1).index;
  const context = {
    currentApostle: "BLACKBEAK", piles: { BLACKBEAK: state },
    ensurePiles() {}, rememberUndo() {}, savePiles() {}, renderAibpCards() {},
    cardSrc: (card) => card.src, openImageZoom() {},
    currentPanelCardTokens: () => [], chimeraName: "CHIMERA_METASTASIOS",
    sameCard: (a, b) => a?.type === b?.type && a?.level === b?.level && a?.index === b?.index,
  };
  vm.runInNewContext(`${entryFunction("drawAi")}\n${entryFunction("removePendingFromDeck")}\n${entryFunction("discardAiPending")}\ndrawAi();`, context);
  assert.equal(state.AI.pending.index, bottomIndex);
  state.AI.pending = JSON.parse(JSON.stringify(state.AI.pending));
  vm.runInNewContext("discardAiPending();", context);
  assert.equal(state.AI.deck.length, 5);
  assert.equal(state.AI.discard[0].index, bottomIndex);
  assert.equal(state.AI.deck.some((card) => card.index === bottomIndex), false);
});

test("旧存档退出自动治疗流程，不改动损伤和晋升进度", () => {
  const state = makeState();
  state.BP.damage.push({ ...blackbeak.BP.III[0], damageValue: 2 });
  Object.assign(state.blackbeak, { pendingAttack: { mode: "critical" }, defeated: true, notice: "旧治疗提示" });
  const before = JSON.stringify(state.BP);
  assert.equal(windowStub.BlackbeakConfig.normalize(state, (cards) => [...cards]), true);
  assert.equal(JSON.stringify(state.BP), before);
  for (const key of ["pendingAttack", "defeated", "notice"]) assert.equal(key in state.blackbeak, false);
  assert.equal(windowStub.BlackbeakConfig.settleAttack, undefined);
  assert.doesNotMatch(indexSource, /blackbeakRules|settleBlackbeakAttack|data-blackbeak-power/);
  assert.equal(windowStub.BlackbeakConfig.normalize(state, (cards) => [...cards]), false);
});

test("追踪者的卡图不加密：不留 .bin，也不进 catalog", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(binDir, "catalog.json"), "utf8"));
  const pursuerDir = path.join(aibpDir, "ps", "HERMESIAN_PURSUER");
  const plain = fs.readdirSync(pursuerDir).filter((name) => /\.jpe?g$/i.test(name));
  assert.equal(plain.length, 82, "追踪者明文卡图应为 82 张");
  const leftovers = [];
  for (const name of plain) {
    const target = path.posix.join("3b6e9d20", path.basename(assets.path(`HERMESIAN_PURSUER/${name}`)));
    if (catalog.targets.includes(target)) leftovers.push(`catalog: ${target}`);
    if (fs.existsSync(path.join(binDir, path.basename(target)))) leftovers.push(`bin: ${target}`);
  }
  assert.deepEqual(leftovers, [], `追踪者仍有加密残留：\n${leftovers.slice(0, 6).join("\n")}`);
});

test("搜索黑喙命中独立入口，且不出现在普通搜索结果里", () => {
  assert.equal(bossSearch.isSecretQuery("黑喙"), true);
  assert.equal(bossSearch.secretMode("黑喙"), "blackbeak");
  assert.equal(bossSearch.secretMode("Blackbeak"), "blackbeak");
  assert.equal(bossSearch.secretMode("赫利俄斯"), "normal");
  assert.equal(bossSearch.secretMode("泰坦X"), null);
  assert.equal(bossSearch.find("黑喙").length, 0, "隐藏 BOSS 不该出现在普通搜索里");
});

test("刷新后 Trait 等待解密，切换隐藏 Boss 不会误用其他资源的就绪状态", async () => {
  const assetWindow = {};
  vm.runInNewContext(fs.readFileSync(path.join(aibpDir, "b4d7e218.js"), "utf8"), {
    window: assetWindow, Uint8Array, Int32Array, Blob, URL, setTimeout, clearTimeout,
    fetch: async (url) => ({ ok: true, arrayBuffer: async () => {
      const bytes = fs.readFileSync(path.join(aibpDir, url));
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } }),
  });
  const api = assetWindow.HeliosAssets;
  const context = {
    currentApostle: "BLACKBEAK", window: assetWindow,
    HIDDEN_BOSS: { BLACKBEAK: { granted: () => true, config: () => windowStub.BlackbeakConfig,
      extraConfigs: () => [blackbeak] } },
    ensurePiles: () => { throw new Error("不应在解密前渲染 Trait"); },
  };
  vm.runInNewContext(`${entryFunction("hiddenBossImagesReady")}\n${entryFunction("renderExtraCards")}\nrenderExtraCards();`, context);
  const first = { panel: blackbeak.extraCards[0].src };
  await api.ready(first);
  assert.equal(api.isReady(first), true);
  assert.equal(api.isReady(windowStub.BlackbeakConfig, [blackbeak]), false);
  await api.ready(windowStub.BlackbeakConfig, [blackbeak]);
  assert.equal(api.isReady(windowStub.BlackbeakConfig, [blackbeak]), true);
  for (const card of blackbeak.extraCards) assert.match(api.resolve(card.src), /^blob:/);
  assert.equal(vm.runInNewContext("hiddenBossImagesReady()", context), true);
  for (const source of blackbeak.sealedSources) URL.revokeObjectURL(api.resolve(api.path(source)));
});

test("AIBP 入口接线：解锁后直接进黑喙自己的入口", () => {
  assert.match(indexSource, /blackbeak:\s*\{[\s\S]{0,200}apostle:\s*"BLACKBEAK"/, "缺少黑喙入口配置");
  assert.match(indexSource, /blackbeakUnlockKey/, "缺少黑喙解锁键");
  assert.match(indexSource, /localStorage\.setItem\(unlockKey, "1"\)/, "解锁没有落盘");
  assert.match(indexSource, /renderApostle\("BLACKBEAK"\)/, "解锁后没有进黑喙入口");
  assert.match(indexSource, /C5 · Blackbeak|BLACKBEAK · 黑喙/, "缺少黑喙标题");
  // 黑喙不该再走 HELIOS 的模式覆盖
  assert.doesNotMatch(indexSource, /apostleLevelOverrides\.HELIOS\s*=\s*mode === "blackbeak"/,
    "黑喙不该写进 HELIOS 的模式覆盖");
  assert.doesNotMatch(indexSource, /\["c4", "blackbeak"\]\.includes/,
    "HELIOS 的模式表里不该再出现 blackbeak");
});

test("万事皆休通过 Boss 搜索开启，不显示普通入口按钮", async () => {
  for (const query of ["万事皆休", "好事成三", "All Good Things", "7539", "三台泰坦 X"]) {
    assert.equal(bossSearch.secretMode(query), "titan-x-group");
    assert.equal(bossSearch.find(query).length, 0);
  }
  const calls = [];
  const context = {
    bossSearchInput: { value: "万事皆休" }, bossSearchResults: { replaceChildren() {} },
    renderApostle: (name) => calls.push(name),
    window: { C45Specials: { startTitanXGroup: () => calls.push("group") } },
  };
  await vm.runInNewContext(`${entryFunction("searchSecret")}\nsearchSecret("titan-x-group");`, context);
  assert.deepEqual(calls, ["TITAN_X", "group"]);
  assert.equal(context.bossSearchInput.value, "");
  assert.doesNotMatch(fs.readFileSync(path.join(aibpDir, "c45_specials.js"), "utf8"), /data-action="start-titan-x-group"/);
});
