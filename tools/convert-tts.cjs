/* 把解析的 TTS Lua 摆放转成 app 格式，并对比 app 现有 setups 数据 */
const fs = require("node:fs");
const path = require("node:path");
const tts = require("./tts-parse.json");
const terrain = require("../ss/terrain-data.js");

// TTS 坐标 → app 行列（保留 .5）
const col = (x) => Math.round(((x + 44.07) / 2) * 2) / 2;
const row = (z) => Math.round(((z - 1.3) / 2) * 2) / 2;
// TTS 旋转 → app rotation/flipped
// flipped 对应 TTS 的 rotX/rotZ 为 ±180（翻面）；rotY 取模 90 转成 app rotation。
const is180 = (v) => {
  const n = Math.round(v / 180);
  return n !== 0 && Math.abs(v - n * 180) < 0.5;
};
const convertRot = ([rx, ry, rz]) => ({
  rotation: ((Math.round(ry / 90) * 90) % 360 + 360) % 360,
  flipped: is180(rx) || is180(rz),
});

// TTS 地形名 + box → app catalog 名
function mapName(ttsName, box) {
  // box 变量来自 Lua：box_I/boxI/box_4x1=4x1(I)、box_L/boxL、box_Z/boxZ、
  // box_O/boxO/box_2x2(O)、box_5x1、box_1x1
  const shape = /_L|boxL/.test(box) ? "L"
    : /_Z|boxZ/.test(box) ? "Z"
    : /_I|boxI|_4x1/.test(box) ? "I"
    : /_O|boxO|_2x2/.test(box) ? "O"
    : "";
  if (/^Track Tile \d$/.test(ttsName)) {
    const n = ttsName.split(" ")[2];
    return `Track Tile ${n} ${box.includes("_4x1") ? "1x4" : "1x5"}`;
  }
  switch (ttsName) {
    case "Labyrinth": return `Labyrinth ${shape}`;
    case "Maze Fissure": return `Maze Fissure ${shape}`;
    case "Cliff": return `Cliff ${shape}`;
    case "Column": return "Column";
    case "City": return "City";
    case "Fortified City": return "Fortified City";
    case "Ambrosia Pool": return "Ambrosia Pool";
    case "Ambrosia Trail": return "Ambrosia Trail";
    case "Ambrosia Cloud": return "Ambrosia Cloud";
    case "Ambrosia Elephant": return "Ambrosia Elephant";
    case "Argo Hull": return box.includes("_4x1") ? "Argo Hull 1x4" : "Argo Hull 1x5";
    case "Black Iceberg": return "Black Iceberg";
    case "Giant Black Iceberg": return "Giant Black Iceberg";
    case "Black Abyss": return "Black Abyss";
    case "Black Lake": return "Black Lake";
    case "Black Glacier": return box.includes("_5x1") ? "Black Glacier 1x5" : "Black Glacier 1x5";
    case "Floating Rocks": return "Floating Rocks";
    case "Giant Shell": return "Giant Shell";
    case "Graveyard Of The Frail": return "Graveyard Of The Frail";
    case "Hyperborean Ruins": return "Hyperborean Ruins";
    case "Inkblot": return "Inkblot";
    case "Irem City": return "Irem City";
    case "Irem Tower": return "Irem Tower";
    case "Krypteia Outpost": return "Krypteia Outpost";
    case "Lightwall": return box.includes("_1x1") ? "Lightwall 1x1" : box.includes("_4x1") ? "Lightwall 1x4" : "Lightwall 1x5";
    case "Maze Outcrop": return "Maze Outcrop";
    case "Minos Manos Unit": return "Minos Manos Unit";
    case "Petrified Vent": return "Petrified Vent";
    case "School Of Creatures": return "School Of Creatures";
    case "Staircase Entrance": return "Staircase Entrance";
    case "Spartan River Works": return box.includes("_4x1") ? "Spartan River Works 1x4" : box.includes("_5x1") ? "Spartan River Works 1x5" : "Spartan River Works Z";
    case "Spartan River Works (corner)": return "Spartan River Works 1x1 Corner";
    case "Spartan River Works (left)":
    case "Spartan River Works (right)":
      return box.includes("_4x1") ? "Spartan River Works 1x4" : "Spartan River Works 1x1 End";
    case "Timefront": return box.includes("_4x1") ? "Timefront 1x4" : "Timefront 1x5";
    case "Time-Frozen City": return "Time-Frozen City";
    case "Track Tile": return box.includes("_1x1") ? "Track Tile 1x1" : box.includes("_1x2") ? "Track Tile 1x2" : box.includes("_4x1") ? "Track Tile 2 1x4" : "Track Tile 1 1x5";
    case "Trench": return box.includes("_4x1") ? "Trench 1x4" : "Trench 1x5";
    case "Trench (left)": return "Trench Left 1x1";
    case "Trench (right)": return "Trench Right 1x1";
    case "Trireme Graveyard": return "Trireme Graveyard";
    case "Windblighted Fleet": return "Windblighted Fleet";
    case "Wishstorm": return "Wishstorm";
    case "Abandoned Temple": return "Abandoned Temple";
    case "Arcology": return "Arcology";
    case "Ambrosia": return "Ambrosia Pool";
    default: return ttsName;
  }
}

// 汇总每个战役的 app 格式摆放
const report = {};
for (const [fn, groups] of Object.entries(tts)) {
  report[fn] = [];
  for (const g of groups) {
    const name = mapName(g.ttsName, g.box);
    for (const e of g.entries) {
      const { rotation, flipped } = convertRot(e.rot);
      report[fn].push({
        name,
        row: row(e.pos[2]),
        column: col(e.pos[0]),
        rotation,
        flipped,
      });
    }
  }
}
fs.writeFileSync(path.join(__dirname, "tts-converted.json"), JSON.stringify(report, null, 1), "utf8");

// 对比 app setups：遍历 app 每个 apostle 的 setup，用 getTiles 与转换结果比对
// 输出哪些战役在 app 中对应、差异大小
const compareWith = {
  hekatonBattle_1_3_levels: ["HEKATON", 1, "hekaton-battle"],
  hekatonBattle_4_level: ["HEKATON", 4, "hekaton-battle"],
  hekaton_level_8_battle: ["HEKATON", 8, "hekaton-battle"],
  labyrinthaurosBattle: ["LABYRINTHAUROS", 1, undefined],
  ambushBattle: ["HEKATON", 1, "ambush"],
  temenosBattle: ["ALPHA_TEMENOS", 1, undefined],
  pursuerBattle: ["HERMESIAN_PURSUER", 1, "pursuer"],
  pursuerEndBattle: ["HERMESIAN_PURSUER", 1, "pursuits-end"],
  cyclonusBattle: ["CYCLONUS", 1, undefined],
  cyclonus_8_level_Battle: ["CYCLONUS", 8, undefined],
  chimeraMetastasiosBattle_1_2_level: ["CHIMERA_METASTASIOS", 1, undefined],
  chimeraMetastasiosBattle_3_level: ["CHIMERA_METASTASIOS", 3, undefined],
  burdenBattle: ["THE_BURDEN", 1, "burden-battle"],
  burden_5_level_Battle: ["THE_BURDEN", 5, "burden-battle"],
  burdenHardestToBearBattle: ["THE_BURDEN", 1, "hardest-to-bear"],
  theCruelLessonBattle: ["THE_NIETZSCJEAN", 1, "the-cruel-lesson"],
  whatAreYouBattle: ["THE_NIETZSCJEAN", 1, "what-are-you"],
  hypertimeOracleBattle_1_2_level: ["HYPERTIME_ORACLE", 1, undefined],
  hypertimeOracleBattle_3_level: ["HYPERTIME_ORACLE", 3, undefined],
  icarianHarpyBattle: ["ICARIAN_HARPY", 1, undefined],
  sunDescendantBattle: ["SUN_DESCENDANT", 1, undefined],
  midascore_level_1: ["MIDASCORE", 1, undefined],
  midascore_level_2: ["MIDASCORE", 2, undefined],
  demidjinnBattle: ["DEMIDJINN", 1, undefined],
  babelianLunacyBattle: ["THE_BABELIAN_LUNACY", 1, undefined],
  reapTheWhirlwindBattle: ["DAHAKA", 1, "reap-the-whirlwind"],
  theWinnowingBattle: ["DAHAKA", 1, "the-winnowing"],
  dragonOfPhobos_1_2_levels_positions: ["DRAGON_OF_PHOBOS", 1, undefined],
  dragonOfPhobos_3_level_positions: ["DRAGON_OF_PHOBOS", 3, undefined],
  meduketosBattle: ["MEDUKETOS", 1, undefined],
  urFleeceBattle: ["UR_FLEECE", 1, undefined],
};

function key(t) { return `${t.name}|${t.row}|${t.column}|${t.rotation}|${t.flipped}`; }

for (const [fn, [apostle, level, setupId]] of Object.entries(compareWith)) {
  const ttsTiles = report[fn] || [];
  let appTiles;
  try {
    appTiles = terrain.getTiles(apostle, level, setupId).map((t) => ({
      name: t.name, row: t.row, column: t.column, rotation: t.rotation, flipped: !!t.flipped,
    }));
  } catch { appTiles = []; }
  const ttsKeys = new Set(ttsTiles.map(key));
  const appKeys = new Set(appTiles.map(key));
  const ttsOnly = ttsTiles.filter((t) => !appKeys.has(key(t)));
  const appOnly = appTiles.filter((t) => !ttsKeys.has(key(t)));
  const same = ttsTiles.length === appTiles.length && ttsOnly.length === 0;
  console.log(`${same ? "OK " : "DIFF"} ${fn} (${apostle} L${level}${setupId ? " " + setupId : ""}): tts=${ttsTiles.length} app=${appTiles.length} ttsOnly=${ttsOnly.length} appOnly=${appOnly.length}`);
  if (!same) {
    const rowFlip = ttsOnly.every((t) => appOnly.some((a) => a.name === t.name && a.column === t.column && (15 - t.row) === a.row && a.rotation === t.rotation && a.flipped === t.flipped));
    console.log(`   rowFlipOnly=${rowFlip}`);
    if (!rowFlip) {
      console.log("   ttsOnly sample:", ttsOnly.slice(0, 3).map((t) => `${t.name}@R${t.row}C${t.column}rot${t.rotation}f${t.flipped}`).join(" | "));
      console.log("   appOnly sample:", appOnly.slice(0, 3).map((t) => `${t.name}@R${t.row}C${t.column}rot${t.rotation}f${t.flipped}`).join(" | "));
    }
  }
}
