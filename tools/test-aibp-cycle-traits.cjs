const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "aibp", "index.html"), "utf8");
// aibp/index.html 是 CRLF 换行，正则里的换行必须写成 \r?\n：早先的 \n 版本永远匹配
// 不上（源文件里是 "];\r\n    const tokenBasePath"），assert 直接抛错把整个文件掐死，
// 下面四个用例一个都没跑过 —— 于是这条回归测试长期是「哑巴测试」。
// 收尾锚在数组自己的 "\n    ];  + const tokenBasePath" 上，不会误抓到别的数组。
const match = source.match(/const cycleTraitCards = (\[[\s\S]*?\r?\n    \]);\r?\n    const tokenBasePath/);

assert.ok(match, "cycleTraitCards should be present in aibp/index.html");
const cards = JSON.parse(JSON.stringify(vm.runInNewContext(match[1])));

function availableFor(cycle) {
  return cards.filter((card) => card.cycle === cycle || card.cycles?.includes(cycle));
}

test("C4 receives six cursed traits and two shared traits", () => {
  const c4Cards = availableFor("c4");
  assert.equal(c4Cards.length, 8);
  assert.equal(c4Cards.filter((card) => card.scope === "c4-cursed").length, 6);
  assert.equal(c4Cards.filter((card) => card.scope === "c45-common").length, 2);
});

test("C5 receives two exclusive traits and two C4-C5 shared traits", () => {
  const c5Cards = availableFor("c5");
  assert.equal(c5Cards.length, 4);
  assert.equal(c5Cards.filter((card) => card.scope === "c5-exclusive").length, 2);
  assert.equal(c5Cards.filter((card) => card.scope === "c45-common").length, 2);
});

test("earlier cycles do not receive the C4-C5 trait set", () => {
  assert.equal(availableFor("c1").length, 0);
  assert.equal(availableFor("c2").length, 0);
  assert.equal(availableFor("c3").length, 0);
});

test("all cycle trait card images exist", () => {
  cards.forEach((card) => {
    assert.ok(
      fs.existsSync(path.join(root, "aibp", "ps", "other", "trait", card.fileName)),
      `missing ${card.fileName}`
    );
  });
});

function loadFunctions(context, names) {
  for (const name of names) {
    const match = source.replace(/\r\n/g, "\n").match(new RegExp(`^    function ${name}\\([^]*?^    }`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
}

test("hidden bosses receive their own cycle traits independently of the open campaign", () => {
  for (const cycleId of ["c1", "c4", "c5"]) {
    const context = vm.createContext({
      currentApostle: "HELIOS", cycleTraitCards: cards,
      campaignMapFactionState: { cycleId },
      apostleRecordTracks: { MIDASCORE: { cycle: "c4" }, TITAN_X: { cycle: "c5" }, HEKATON: { cycle: "c1" } },
    });
    loadFunctions(context, ["availableCycleTraitCards"]);
    for (const [name, cycle] of [["HELIOS", "c4"], ["BLACKBEAK", "c5"], ["MIDASCORE", "c4"], ["TITAN_X", "c5"], ["HEKATON", "c1"]]) {
      assert.deepEqual(JSON.parse(JSON.stringify(context.availableCycleTraitCards(name))), availableFor(cycle));
    }
  }
});

class Element {
  constructor() { this.children = []; this.dataset = {}; this.isConnected = true; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  addEventListener() {}
  remove() { this.isConnected = false; }
  querySelectorAll() { return this.children.flatMap(child => child.children.filter(item => item.type === "checkbox")); }
}

function hiddenBossHarness(name, mode = "c4") {
  const state = { traits: [], customTraits: [], hiddenTraits: [], hiddenExtraCards: [] };
  const fixed = { src: `sealed/${name}-${mode}.bin`, backSrc: `sealed/${name}-${mode}-back.bin`, label: "专属特性" };
  const context = vm.createContext({
    currentApostle: name, cycleTraitCards: cards, apostleRecordTracks: {}, currentApostleLevel: () => 1,
    aibpImageIndex: new Set(),
    piles: { [name]: state }, traitLevels: [],
    traitLoadToken: 0, nietzscheName: "THE_NIETZSCJEAN",
    traitSaveButton: {}, traitDialogTitle: {}, traitDialogGrid: new Element(), extraGrid: new Element(),
    traitDialog: { close() {} }, document: { createElement: () => new Element() }, Image: Element,
    ensurePiles() {}, hiddenBossImagesReady: () => true, savePiles() {}, applyCurrentApostleLevelBonuses() {}, renderPanelTokens() {},
    reorderExtraGridForLargeCards() {}, scheduleSecondScreenSnapshot() {},
    heliosMode: () => mode,
    imageOrMessage(src, alt) { return Object.assign(new Element(), { src, alt }); },
    loadOptionalImage(image, src, isNeeded) {
      if (!isNeeded()) return;
      image.src = src;
      image.onload?.();
    },
    window: {
      AIBP_BOSS_TRAIT_RULES: require('../aibp/boss-trait-rules.js'),
      setTimeout() {}, HeliosAssets: { resolve: src => src },
      HeliosConfig: { extras: () => [fixed] }, BlackbeakCardList: { extraCards: [fixed] },
    },
  });
  loadFunctions(context, ["availableCycleTraitCards", "cycleTraitDefinition", "cycleTraitSrc", "traitCardLabel",
    "traitCardSrc", "traitKey", "selectedTraitKeySet", "hiddenTraitKeySet", "hiddenExtraCardKeySet",
    "traitAreaExtraCards", "indexedAibpCards", "traitImageCandidates", "commonTraitImageCandidates",
    "isTraitRemovedByLevel", "isDefaultShownTrait", "automaticTraitLevels",
    "renderTraitCandidates", "saveTraitSelection", "renderExtraCards", "isLargeTraitCard"]);
  return { context, state, fixed };
}

for (const [name, mode, count] of [["HELIOS", "c4", 8], ["HELIOS", "normal", 8], ["BLACKBEAK", "normal", 4]]) {
  test(`${name}/${mode}: cycle traits can be selected, saved, rendered and removed alongside fixed cards`, () => {
    const { context, state, fixed } = hiddenBossHarness(name, mode);
    context.renderTraitCandidates();
    let inputs = context.traitDialogGrid.querySelectorAll();
    const cycleInputs = inputs.filter(input => input.dataset.scope);
    assert.equal(cycleInputs.length, count);
    const shared = cycleInputs.find(input => input.dataset.scope === "c45-common");
    const exclusive = cycleInputs.find(input => input.dataset.scope !== "c45-common");
    shared.checked = exclusive.checked = true;
    context.saveTraitSelection();
    assert.equal(state.traits.length, 2);
    assert.equal(context.extraGrid.children.length, 3);
    assert.equal(context.extraGrid.children[0].src, fixed.src);
    assert.equal(context.extraGrid.children[0].dataset.backSrc, fixed.backSrc);
    assert.ok(context.extraGrid.children.some(image => image.src.includes("C45_COMMON_TR_")));
    assert.ok(context.extraGrid.children.some(image => image.src.includes(name === "BLACKBEAK" ? "C5_TR_" : "C4_CURSED_TR_")));

    // Opening again must retain the saved choices; rerendering must not duplicate cards.
    context.renderTraitCandidates();
    inputs = context.traitDialogGrid.querySelectorAll();
    assert.equal(inputs.filter(input => input.dataset.scope && input.checked).length, 2);
    context.renderExtraCards();
    assert.equal(context.extraGrid.children.length, 3);
    inputs.forEach(input => input.checked = false);
    context.saveTraitSelection();
    assert.equal(state.traits.length, 0);
    assert.equal(context.extraGrid.children.length, 0);
    assert.deepEqual(Array.from(state.hiddenExtraCards), [fixed.src]);
  });
}
