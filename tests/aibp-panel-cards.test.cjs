/* 守护两件容易再次走样的接线（run: node tests/aibp-panel-cards.test.cjs）：
 *
 * 1. 超时光先知的全幅特性卡印的是 V 级。应用按文件名 `<敌人>_TR_<等级>_<编号>.<后缀>` 判断等级，
 *    所以卡图、老存档迁移（O/1、IV/1 → V/1）、大卡判定必须同时站在 V 上。另有一条把所有
 *    使徒的 V/1 通用特性迁成 COMMON 的老规则，不能把先知自己的 V/1 一起吞掉。
 * 2. 乌尔-弗里斯有两张完整面板（大卡）。控制台与第二屏默认显示 UR_FLEECE_2.jpg，
 *    点开面板时先给「原来的大卡」UR_FLEECE.jpg，放大图里的按钮在两张之间来回切。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const indexSource = fs.readFileSync(path.join(root, "aibp", "index.html"), "utf8");
const keepSource = fs.readFileSync(path.join(root, "asset-studio", "pack-shrink-keep.txt"), "utf8");

// 按大括号配对切出一个函数，避免把后面的常量声明一起拖进来。
// 起点取参数表结束的「) {」，这样形参默认值里的 {} 不会被当成函数体。
function functionSource(name) {
  const start = indexSource.indexOf(`    function ${name}(`);
  assert.notEqual(start, -1, `${name} 缺失`);
  const signatureEnd = indexSource.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} 参数表缺失`);
  let depth = 0;
  let index = signatureEnd + 2;
  for (; index < indexSource.length; index += 1) {
    if (indexSource[index] === "{") depth += 1;
    else if (indexSource[index] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return indexSource.slice(start, index + 1);
}

function configObjectSource(name) {
  const start = indexSource.indexOf(`    const ${name} = {`);
  assert.notEqual(start, -1, `${name} 缺失`);
  const end = indexSource.indexOf("\n    };", start);
  assert.notEqual(end, -1, `${name} 结尾缺失`);
  return indexSource.slice(start, end + "\n    };".length);
}

function panelScope(currentApostle) {
  const button = {
    textContent: "",
    title: "",
    classList: { show: false, toggle(_name, value) { this.show = Boolean(value); } },
  };
  const panelImage = { src: "" };
  const script = [
    configObjectSource("apostlePanelCards"),
    functionSource("apostlePanelCardList"),
    functionSource("apostlePanelFile"),
    functionSource("apostlePanelSrc"),
    "const piles = {};",
    "const ensurePiles = (name) => { piles[name] ||= {}; };",
    "const savePiles = () => {};",
    functionSource("apostlePanelIndex"),
    functionSource("setApostlePanelIndex"),
    functionSource("panelZoomCardsFor"),
    "let panelZoomState = null;",
    functionSource("updatePanelZoomSwitch"),
    functionSource("updatePanelCardSwitchButton"),
    functionSource("applyPanelCardIndex"),
    functionSource("switchPanelCard"),
    functionSource("showPanelZoomCard"),
    functionSource("openPanelZoom"),
    `globalThis.__api = {
      apostlePanelSrc, apostlePanelCardList, apostlePanelIndex, setApostlePanelIndex,
      panelZoomCardsFor, openPanelZoom, showPanelZoomCard, switchPanelCard,
      updatePanelCardSwitchButton,
      panelZoomIndex: () => panelZoomState && panelZoomState.index,
      piles,
    };`
  ].join("\n");
  const opened = [];
  const context = {
    currentApostle,
    window: { HeliosAssets: { resolve: (src) => src } },
    panelWrap: {
      querySelector: (selector) => (selector.includes("panel-card-switch") ? button : panelImage),
    },
    scheduleSecondScreenSnapshot: () => {},
    renderPanelImage: () => {},
    imageZoomImg: { src: "", alt: "" },
    imageZoomPanelActions: { classList: { show: false, toggle(_name, value) { this.show = Boolean(value); } } },
    imageZoomPanelSwitch: { textContent: "" },
    openImageZoom: (src, alt, onClose, options) => opened.push({ src, alt, onClose, options }),
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  return { api: context.__api, context, opened, button, panelImage };
}

test("超时光先知保留 V 级大卡，新增 IV 补充卡图不替代它", () => {
  const dir = path.join(root, "aibp", "ps", "HYPERTIME_ORACLE");
  const levelV = path.join(dir, "HYPERTIME_ORACLE_TR_V_001.jpg");
  const levelIV = path.join(dir, "HYPERTIME_ORACLE_TR_IV_001.jpg");
  assert.ok(fs.existsSync(levelV), "缺少 TR_V 卡图");
  assert.ok(fs.existsSync(levelIV), "缺少从新版素材补充的 TR_IV 卡图");
  assert.equal(fs.readFileSync(levelV).equals(fs.readFileSync(levelIV)), false, "补充卡图不能覆盖 V 级大卡");
});

test("官中覆盖图跟着改名，否则覆盖不上改名后的目标", () => {
  const dir = path.join(root, "official-assets", "ps", "HYPERTIME_ORACLE");
  if (!fs.existsSync(dir)) return; // 公开版不带 official-assets
  assert.ok(fs.existsSync(path.join(dir, "HYPERTIME_ORACLE_TR_V_001.jpg")), "官中 TR_V 覆盖图缺失");
  assert.ok(!fs.existsSync(path.join(dir, "HYPERTIME_ORACLE_TR_IV_001.jpg")), "官中 TR_IV 覆盖图应已改名");
});

test("打包豁免名单跟着改名，并盖住两张 UR 大卡", () => {
  assert.match(keepSource, /^aibp\/ps\/HYPERTIME_ORACLE\/HYPERTIME_ORACLE_TR_V_001\.jpg$/m);
  assert.doesNotMatch(keepSource, /HYPERTIME_ORACLE_TR_IV/);
  assert.match(keepSource, /^aibp\/ps\/UR_FLEECE\/UR_FLEECE\.jpg$/m);
  assert.match(keepSource, /^aibp\/ps\/UR_FLEECE\/UR_FLEECE_2\.jpg$/m);
});

test("老存档里的 O/1、IV/1 迁到 V/1，且先知自己的 V/1 不再被当成通用特性", () => {
  const anchor = indexSource.indexOf("piles[name].traits = piles[name].traits.map((card) => {");
  assert.notEqual(anchor, -1, "找不到 traits 迁移");
  const start = indexSource.indexOf("(card) => {", anchor);
  let depth = 0;
  let index = indexSource.indexOf("{", start);
  for (; index < indexSource.length; index += 1) {
    if (indexSource[index] === "{") depth += 1;
    else if (indexSource[index] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const callback = indexSource.slice(start, index + 1);
  const migrate = (name) => vm.runInNewContext(`(name) => (${callback})`, {})(name);

  assert.equal(migrate("HYPERTIME_ORACLE")({ type: "TR", level: "O", index: 1 }).level, "V");
  assert.equal(migrate("HYPERTIME_ORACLE")({ type: "TR", level: "IV", index: 1 }).level, "V");
  const oracleV = migrate("HYPERTIME_ORACLE")({ type: "TR", level: "V", index: 1 });
  assert.equal(oracleV.level, "V", "先知的 V/1 不能被通用特性规则吞掉");
  assert.equal(oracleV.scope || "", "");
  // 别的使徒那条「V/1 = 通用特性」的老规则还要照旧生效。
  const hekatonV = migrate("HEKATON")({ type: "TR", level: "V", index: 1 });
  assert.equal(hekatonV.level, "COMMON");
  assert.equal(hekatonV.scope, "common");
  assert.equal(migrate("HEKATON")({ type: "TR", level: "V", index: 2 }).level, "V");
});

test("先知 V 级特性卡按大卡渲染，IV 级不再是大卡", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${functionSource("isDahakaFearfulHospitality")}\n${functionSource("isLargeTraitCard")}\n`
    + "globalThis.__isLarge = isLargeTraitCard;",
    context
  );
  assert.equal(context.__isLarge("HYPERTIME_ORACLE", { level: "V", index: 1 }), true);
  assert.equal(context.__isLarge("HYPERTIME_ORACLE", { level: "IV", index: 1 }), false);
  assert.equal(context.__isLarge("HEKATON", { level: "V", index: 1 }), false);
  assert.equal(context.__isLarge("DAHAKA", { level: "O", index: 1 }), false);
  assert.equal(context.__isLarge("HEKATON", { level: "O", index: 1 }), true);
});

test("UR 面板默认显示大卡 2，候补表按「默认在前」排列", () => {
  const { api } = panelScope("UR_FLEECE");
  assert.equal(api.apostlePanelSrc("UR_FLEECE"), "ps/UR_FLEECE/UR_FLEECE_2.jpg");
  assert.equal(api.apostlePanelSrc("UR_FLEECE", 1), "ps/UR_FLEECE/UR_FLEECE.jpg");
  assert.equal(api.apostlePanelSrc("UR_FLEECE", 9), "ps/UR_FLEECE/UR_FLEECE_2.jpg", "越界回落到默认那张");
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 0, "普通状态默认是大卡 2");
  const cards = api.panelZoomCardsFor("UR_FLEECE");
  assert.deepEqual([...cards.map((card) => card.src)],
    ["ps/UR_FLEECE/UR_FLEECE_2.jpg", "ps/UR_FLEECE/UR_FLEECE.jpg"]);
  // 只有一张大卡的使徒保持原样，也不该出现切换按钮。
  assert.equal(api.apostlePanelSrc("HEKATON"), "ps/HEKATON/HEKATON.jpg");
  assert.equal(api.panelZoomCardsFor("HEKATON").length, 0);
});

test("普通状态下点面板角上的按钮就能换大卡，第二屏跟着变", () => {
  const { api, button, panelImage } = panelScope("UR_FLEECE");
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 0);
  api.updatePanelCardSwitchButton();
  assert.equal(button.classList.show, true);
  assert.equal(button.textContent, "切到原大卡");
  assert.match(button.title, /当前：大卡 2/);

  api.switchPanelCard();
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 1, "普通状态要真的切过去并记下来");
  assert.equal(api.piles.UR_FLEECE.panelCardIndex, 1);
  assert.equal(panelImage.src, "ps/UR_FLEECE/UR_FLEECE.jpg", "面板图要立刻换");
  assert.equal(button.textContent, "切到大卡2");

  api.switchPanelCard();
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 0, "再点一次切回来");
  assert.equal(panelImage.src, "ps/UR_FLEECE/UR_FLEECE_2.jpg");
  assert.equal(button.textContent, "切到原大卡");

  // 越界/坏存档要回落到默认那张，不能让面板变空。
  api.setApostlePanelIndex("UR_FLEECE", 7);
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 1, "按张数取模");
  api.piles.UR_FLEECE.panelCardIndex = "坏值";
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 0);
});

test("只有一张大卡的使徒不会出现普通状态切换按钮", () => {
  const { api, button } = panelScope("HEKATON");
  api.updatePanelCardSwitchButton();
  assert.equal(button.classList.show, false);
  api.switchPanelCard();
  assert.equal(api.apostlePanelIndex("HEKATON"), 0);
});

test("点开面板先给原来的大卡，放大图里的按钮能来回切，并同步回普通状态", () => {
  const { api, context, opened, panelImage } = panelScope("UR_FLEECE");
  assert.equal(api.openPanelZoom(), true);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].src, "ps/UR_FLEECE/UR_FLEECE.jpg", "点开后先显示原来的大卡");
  assert.equal(opened[0].options.panelSwitch, true);
  assert.equal(context.imageZoomPanelActions.classList.show, true);
  assert.equal(context.imageZoomPanelSwitch.textContent, "切换为大卡 2");
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 0, "只是看，不该改掉普通状态");

  api.showPanelZoomCard(api.panelZoomIndex() + 1);
  assert.equal(context.imageZoomImg.src, "ps/UR_FLEECE/UR_FLEECE_2.jpg");
  assert.equal(context.imageZoomPanelSwitch.textContent, "切换为原大卡");
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 0, "放大图切到大卡 2 == 普通状态的大卡 2");
  assert.equal(panelImage.src, "ps/UR_FLEECE/UR_FLEECE_2.jpg");

  api.showPanelZoomCard(api.panelZoomIndex() + 1);
  assert.equal(context.imageZoomImg.src, "ps/UR_FLEECE/UR_FLEECE.jpg", "再切一次要回到原来那张");
  assert.equal(context.imageZoomPanelSwitch.textContent, "切换为大卡 2");
  assert.equal(api.apostlePanelIndex("UR_FLEECE"), 1, "普通状态也跟着换成了原大卡");
  assert.equal(panelImage.src, "ps/UR_FLEECE/UR_FLEECE.jpg");
});

test("没有候补大卡的使徒不打开面板切换", () => {
  const { api, opened, context } = panelScope("HEKATON");
  assert.equal(api.openPanelZoom(), false);
  assert.equal(opened.length, 0);
  assert.equal(context.imageZoomPanelActions.classList.show, false);
});

test("控制台、第二屏与放大图都接到了大卡表上", () => {
  const panelRender = functionSource("renderPanelImage");
  assert.match(panelRender, /panelSrc = apostlePanelSrc\(name, apostlePanelIndex\(name\)\)/);
  assert.match(panelRender, /className = "panel-card-switch"/);
  const snapshot = functionSource("buildSecondScreenSnapshot");
  assert.match(snapshot, /apostlePanelSrc\(currentApostle, apostlePanelIndex\(currentApostle\)\)/);
  assert.doesNotMatch(snapshot, /ps\/\$\{currentApostle\}\/\$\{currentApostle\}\.jpg/);
  const zoom = functionSource("openZoomForImage");
  assert.match(zoom, /img\.classList\.contains\("panel-image"\) && img\.closest\("#panelWrap"\) && openPanelZoom\(\)/);
  assert.match(indexSource, /imageZoomPanelActions\.addEventListener\("click"/);
  assert.match(indexSource, /id="imageZoomPanelActions"/);
  assert.match(indexSource, /id="imageZoomPanelSwitch"/);
  // 放大图里的切换要落到普通状态（同一份选择）。
  assert.match(functionSource("showPanelZoomCard"), /setApostlePanelIndex\(currentApostle, next\)/);
  // 上一次的面板切换状态不能在别的放大图里留下来。
  assert.match(functionSource("openImageZoom"), /panelZoomState = null;/);
  assert.match(functionSource("closeImageZoom"), /panelZoomState = null;/);
});

/* 面板上的浮层控件（尼采/独眼巨人/奇美拉的状态框、暴击槽、换大卡按钮）和决战版图上的
 * 地形板块都画在卡图或版图上，自带透明底与描边。editorial.css 那条全局「所有
 * button/select/input 都换成纸面色」的规则比 .panel-state-marker / .battle-map-terrain
 * 之类的单类选择器更具体，一旦不带 :not() 排除，标记框就会盖住面板上的连击 / 状态图案，
 * 地形板块也会变成一块白底方块。 */
test("主题的全局控件外观不再覆盖面板浮层与地形板块", () => {
  const editorial = fs.readFileSync(path.join(root, "aibp", "editorial.css"), "utf8");
  const globalRule = editorial.match(/^body :is\(button[^\n]*$/m);
  assert.ok(globalRule, "找不到主题里的全局控件外观规则");
  const hoverRule = editorial.match(/^body button:not\([^\n]*$/m);
  assert.ok(hoverRule, "找不到主题里的按钮悬停规则");
  for (const selector of [".panel-state-marker", ".critical-mass-slot", ".panel-card-switch", ".battle-map-terrain"]) {
    assert.ok(globalRule[0].includes(`:not(${selector})`), `全局控件规则必须排除 ${selector}`);
    assert.ok(hoverRule[0].includes(`:not(${selector})`), `悬停规则必须排除 ${selector}`);
  }
  // 浮层自己的外观仍在 index.html 里，且是透明底 + 描边。
  assert.match(indexSource, /\.panel-state-marker \{[\s\S]*?background: rgba\(255, 88, 82, 0\.04\);/);
  assert.match(indexSource, /\.panel-state-marker \{[\s\S]*?border: 3px solid rgba\(255, 88, 82, 0\.88\);/);
  assert.match(indexSource, /\.critical-mass-slot \{[\s\S]*?background: rgba\(18, 80, 126, 0\.2\);/);
  assert.match(indexSource, /\.critical-mass-slot \{[\s\S]*?border: 2px dashed rgba\(51, 150, 225, 0\.78\);/);
  // 地形板块保持透明底（版图纹理要透出来），别被主题改成纸色。
  const mapCss = fs.readFileSync(path.join(root, "aibp", "battle_map_control.css"), "utf8");
  assert.match(mapCss, /\.battle-map-terrain \{[\s\S]*?background: transparent;/);
  assert.match(mapCss, /\.battle-map-terrain \{[\s\S]*?border: 2px solid transparent;/);
  // 三个浮层都挂在 #panelWrap 的面板框架里，别改到别处去。
  assert.match(functionSource("renderPanelImage"), /className = "panel-state-marker"/);
  assert.match(functionSource("renderPanelImage"), /className = "critical-mass-slot"/);
  // 版图板块是 battle_map_control.js 里那个带 .battle-map-terrain 的按钮。
  const mapJs = fs.readFileSync(path.join(root, "aibp", "battle_map_control.js"), "utf8");
  assert.match(mapJs, /button\.className = `battle-map-terrain\$\{placement\.id === selectedId \? " selected" : ""\}`/);
});
