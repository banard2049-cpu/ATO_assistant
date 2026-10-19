/* 大迷宫轨道红圈（迷宫机牛 / 吞域兽）回归（run: node --test tests/aibp-labyrinth-track.test.cjs）：
 *
 * 1. 两张 boss 大卡右下/右上那 4 格大迷宫轨道从最上方起顺时针是 O → L → Z → I，坐标必须
 *    落在卡图里对应角落（量错了圈就会跑到插画上）。
 * 2. 圈点一下顺时针走一格并写进 localStorage，走到头回到第 1 格；刷新后按存的格子恢复。
 * 3. 控制台的圈、写进第二屏快照的字段、第二屏画圈的层三处必须同时存在，否则第二屏会
 *    停在旧格子上。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
// 仓库里的 HTML/CSS 是 CRLF，切源码之前先统一成 LF，否则按 \n 写的标记找不到。
const readText = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const indexSource = readText(path.join("aibp", "index.html"));
const secondSource = readText(path.join("ss", "app.js"));
const secondHtml = readText(path.join("ss", "index.html"));
const secondCss = readText(path.join("ss", "styles.css"));

// 按大括号配对切出一个函数，避免把后面的声明一起拖进来（和 aibp-panel-cards.test.cjs 同一套）。
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

function sliceBetween(startMarker, endMarker) {
  const start = indexSource.indexOf(startMarker);
  assert.notEqual(start, -1, `找不到起点：${startMarker}`);
  const end = indexSource.indexOf(endMarker, start);
  assert.notEqual(end, -1, `找不到终点：${endMarker}`);
  return indexSource.slice(start, end + endMarker.length);
}

// 轨道配置 + 初始化 + 和它相关的那几个函数，一起丢进 vm 里跑。
const trackBlock = sliceBetween(
  "    const labyrinthTrackApostles = new Set(",
  "    labyrinthTrackApostles.forEach((name) => {\n      labyrinthTrackIndexes[name] = loadLabyrinthTrackIndex(name);\n    });"
);

function trackScope({ currentApostle = "LABYRINTHAUROS", stored = {} } = {}) {
  const storage = new Map(Object.entries(stored));
  const toggles = {};
  const values = {};
  const marker = {
    classList: { toggle(name, value) { toggles[name] = Boolean(value); } },
    style: { setProperty(name, value) { values[name] = value; } },
    dataset: {},
    title: "",
    textContent: "",
  };
  const button = { textContent: "", classList: { toggle() {} } };
  let snapshots = 0;
  const script = [
    "let currentApostle = " + JSON.stringify(currentApostle) + ";",
    "const piles = {};",
    "const __storage = __storageRef;",
    "const localStorage = { getItem: (key) => (__storage.has(key) ? __storage.get(key) : null), setItem: (key, value) => { __storage.set(key, String(value)); } };",
    "const nietzscheName = \"THE_NIETZSCJEAN\";",
    "const cyclonusName = \"CYCLONUS\";",
    "const labyrinthaurosName = \"LABYRINTHAUROS\";",
    "const nietzscheStateKey = \"k-nietzsche\";",
    "const cyclonusStateKey = \"k-cyclonus\";",
    "let nietzscheStateIndex = 0;",
    "let cyclonusStateIndex = 0;",
    "const nietzscheStates = [{ label: \"火\" }, { label: \"浆\" }, { label: \"剑\" }];",
    "const cyclonusStates = [{ label: \"M\" }, { label: \"C\" }, { label: \"B\" }];",
    "const chimeraPhaseStates = {};",
    "const isChimera = () => false;",
    "const nietzscheStateButton = __button;",
    "const panelWrap = { querySelector: () => __marker };",
    "const scheduleSecondScreenSnapshot = () => { __snapshots += 1; };",
    trackBlock,
    functionSource("isNietzsche"),
    functionSource("isCyclonus"),
    functionSource("isAdvancedNietzscheTrack"),
    functionSource("hasPanelState"),
    functionSource("hasManualPanelState"),
    functionSource("currentPanelState"),
    functionSource("panelMarkerStateForArtwork"),
    functionSource("updateNietzscheStateUi"),
    functionSource("cycleNietzscheState"),
    `globalThis.__api = {
      labyrinthTrackFor, isLabyrinthTrackApostle, labyrinthTrackStorageKey,
      loadLabyrinthTrackIndex, labyrinthTrackState, cycleNietzscheState,
      currentPanelState, hasManualPanelState, updateNietzscheStateUi,
      labyrinthTrackIndexes,
      snapshots: () => __snapshots,
      storage: __storage,
    };`
  ].join("\n");
  const context = { window: {}, __storage: storage, __marker: marker, __button: button, __storageRef: storage, __snapshots: 0 };
  vm.createContext(context);
  vm.runInContext(readText("aibp/panel-overlay.js"), context);
  vm.runInContext(script, context);
  return { api: context.__api, marker, button, toggles, values, storage };
}

const EXPECTED_TYPES = ["Labyrinth O", "Labyrinth L", "Labyrinth Z", "Labyrinth I"];

test("两张 boss 大卡的大迷宫轨道都是 4 格，顺时针 O → L → Z → I", () => {
  const { api } = trackScope();
  for (const apostle of ["LABYRINTHAUROS", "ALPHA_TEMENOS"]) {
    const track = api.labyrinthTrackFor(apostle);
    assert.ok(track, `${apostle} 缺少大迷宫轨道配置`);
    assert.equal(track.cells.length, 4, `${apostle} 轨道应是 4 格`);
    assert.deepEqual([...track.cells.map((cell) => cell.type)], EXPECTED_TYPES, `${apostle} 顺时针顺序不对`);
    assert.deepEqual([...track.cells.map((cell) => cell.short)], ["O", "L", "Z", "I"]);
    assert.ok(api.isLabyrinthTrackApostle(apostle), `${apostle} 应被认成有大迷宫轨道的始徒`);
  }
  assert.equal(api.isLabyrinthTrackApostle("HEKATON"), false);
  assert.equal(api.isLabyrinthTrackApostle("CYCLONUS"), false);
});

test("轨道坐标落在卡图对应角落，别跑到插画上", () => {
  const { api } = trackScope();
  const lab = api.labyrinthTrackFor("LABYRINTHAUROS");
  const tem = api.labyrinthTrackFor("ALPHA_TEMENOS");
  lab.cells.forEach((cell, index) => {
    const left = parseFloat(cell.left);
    const top = parseFloat(cell.top);
    assert.ok(left > 80 && left < 100, `迷宫机牛第 ${index + 1} 格横向越界：${cell.left}`);
    assert.ok(top > 0 && top < 25, `迷宫机牛第 ${index + 1} 格纵向越界：${cell.top}`);
  });
  tem.cells.forEach((cell, index) => {
    const left = parseFloat(cell.left);
    const top = parseFloat(cell.top);
    assert.ok(left > 70 && left < 100, `吞域兽第 ${index + 1} 格横向越界：${cell.left}`);
    assert.ok(top > 70 && top < 100, `吞域兽第 ${index + 1} 格纵向越界：${cell.top}`);
  });
  // 四格互不重叠：把纵向百分比按卡图宽高比折成「宽度百分比」后，任意两格中心要够远。
  const aspect = 1649 / 2405;
  const points = lab.cells.map((cell) => [parseFloat(cell.left), parseFloat(cell.top) * aspect]);
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const distance = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      assert.ok(distance > 4.5, `第 ${i + 1} 格与第 ${j + 1} 格太近（${distance.toFixed(1)}% 宽），圈会重叠`);
    }
  }
});

test("点一下顺时针走一格、走到头回到第一格，并写进 localStorage", () => {
  const { api, storage, toggles } = trackScope();
  assert.equal(api.labyrinthTrackState("LABYRINTHAUROS").short, "O", "开局应停在第 1 格 O");
  const seen = [];
  for (let step = 0; step < 4; step += 1) {
    api.cycleNietzscheState();
    seen.push(api.labyrinthTrackState("LABYRINTHAUROS").short);
  }
  assert.deepEqual(seen, ["L", "Z", "I", "O"], "顺时针顺序应走成 L → Z → I → O");
  assert.equal(storage.get("aibp-labyrinth-track-v1-LABYRINTHAUROS"), "0", "回到第 1 格要写回 0");
  assert.equal(api.snapshots(), 4, "每走一格都要推一次第二屏快照");
  assert.equal(toggles.show, true, "圈要处于显示状态");
  assert.equal(toggles["labyrinth-track-marker"], true, "圈要带上大迷宫轨道的类");
  assert.equal(toggles["chimera-state-marker"], false, "大迷宫轨道不是奇美拉那种方框");
});

test("刷新后按存下来的格子恢复，坏值退回第一格", () => {
  const restored = trackScope({ currentApostle: "ALPHA_TEMENOS", stored: { "aibp-labyrinth-track-v1-ALPHA_TEMENOS": "2" } });
  const restoredState = restored.api.labyrinthTrackState("ALPHA_TEMENOS");
  assert.equal(restoredState.short, "Z");
  assert.equal(restoredState.index, 2);
  assert.equal(restoredState.buttonLabel, "大迷宫指示物：Z（3/4）");

  const broken = trackScope({ currentApostle: "ALPHA_TEMENOS", stored: { "aibp-labyrinth-track-v1-ALPHA_TEMENOS": "9" } });
  assert.equal(broken.api.labyrinthTrackState("ALPHA_TEMENOS").short, "O", "越界的存档值要退回第一格");
  const negative = trackScope({ currentApostle: "ALPHA_TEMENOS", stored: { "aibp-labyrinth-track-v1-ALPHA_TEMENOS": "-1" } });
  assert.equal(negative.api.labyrinthTrackState("ALPHA_TEMENOS").short, "O");
});

test("控制台把轨道格画在面板上并写进第二屏快照", () => {
  const { api, values, marker } = trackScope();
  api.updateNietzscheStateUi(marker);
  assert.equal(values["--marker-left"], "92.4%", "第 1 格 O 的横向位置");
  assert.equal(values["--marker-top"], "6.1%", "第 1 格 O 的纵向位置");
  assert.equal(values["--marker-width"], "5.6%", "圈宽按面板宽度的百分比");
  assert.match(marker.title, /Labyrinth O/);
  assert.match(marker.title, /顺时针/);

  const panelRender = functionSource("renderPanelImage");
  assert.match(panelRender, /isLabyrinthTrackApostle\(name\)/, "renderPanelImage 要为这两个始徒建圈");
  assert.match(panelRender, /className = "panel-state-marker"/);
  const snapshot = functionSource("buildSecondScreenSnapshot");
  assert.match(snapshot, /labyrinthTrack: isLabyrinthTrackApostle\(\) \? currentPanelState\(\) : null/);
  const ui = functionSource("updateNietzscheStateUi");
  assert.match(ui, /classList\.toggle\("labyrinth-track-marker", isLabyrinthTrackApostle\(\)\)/);
  assert.match(ui, /state\.buttonLabel \|\| `切换状态：\$\{state\.label\}`/);
  // 圈的外观：透明底 + 红描边 + 圆形（aspect-ratio 顶高度）。
  assert.match(indexSource, /\.panel-state-marker\.labyrinth-track-marker \{[\s\S]*?aspect-ratio: 1 \/ 1;/);
  assert.match(indexSource, /\.panel-state-marker\.labyrinth-track-marker \{[\s\S]*?var\(--marker-width, 5\.6%\)/);
});

test("第二屏照同一份坐标画只读的圈", () => {
  assert.match(secondHtml, /id="bossLabyrinthTrack"/);
  assert.match(secondCss, /\.boss-labyrinth-track span \{[\s\S]*?var\(--track-left, 50%\)/);
  assert.match(secondCss, /\.boss-labyrinth-track span \{[\s\S]*?var\(--track-width, 5\.6%\)/);
  assert.match(secondSource, /bossLabyrinthTrack: document\.querySelector\("#bossLabyrinthTrack"\)/);
  assert.match(secondSource, /function renderLabyrinthTrack\(track\)/);
  assert.match(secondSource, /renderLabyrinthTrack\(state\.labyrinthTrack\)/);
  assert.match(secondSource, /state\.labyrinthTrack \|\| null/, "轨道格要进第二屏的重绘 key");
});
