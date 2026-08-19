/* 用 TTS 转换数据生成新的 setups 段，替换 ss/terrain-data.js */
const fs = require("node:fs");
const path = require("node:path");
const converted = require("./tts-converted.json");

// 战役 → [apostle, setupId|null, levels[]]，用于定位 app setup
const battleMap = {
  hekatonBattle_1_3_levels: ["HEKATON", "hekaton-battle", [1, 2, 3]],
  hekatonBattle_4_level: ["HEKATON", "hekaton-battle", [4, 5, 6, 7]],
  hekaton_level_8_battle: ["HEKATON", "hekaton-battle", [8]],
  ambushBattle: ["HEKATON", "ambush", [1]],
  labyrinthaurosBattle: ["LABYRINTHAUROS", "labyrinthauros-battle", [1, 2, 3, 4]],
  temenosBattle: ["ALPHA_TEMENOS", null, [1]],
  pursuerBattle: ["HERMESIAN_PURSUER", "pursuer", [1]],
  pursuerEndBattle: ["HERMESIAN_PURSUER", "pursuits-end", [1]],
  cyclonusBattle: ["CYCLONUS", null, [1, 2, 3, 4, 5, 6, 7]],
  cyclonus_8_level_Battle: ["CYCLONUS", null, [8]],
  chimeraMetastasiosBattle_1_2_level: ["CHIMERA_METASTASIOS", null, [1, 2]],
  chimeraMetastasiosBattle_3_level: ["CHIMERA_METASTASIOS", null, [3, 4]],
  burdenBattle: ["THE_BURDEN", "burden-battle", [1, 2, 3, 4]],
  burden_5_level_Battle: ["THE_BURDEN", "burden-battle", [5]],
  burdenHardestToBearBattle: ["THE_BURDEN", "hardest-to-bear", [1]],
  theCruelLessonBattle: ["THE_NIETZSCJEAN", "the-cruel-lesson", [1]],
  whatAreYouBattle: ["THE_NIETZSCJEAN", "what-are-you", [1]],
  hypertimeOracleBattle_1_2_level: ["HYPERTIME_ORACLE", null, [1, 2]],
  hypertimeOracleBattle_3_level: ["HYPERTIME_ORACLE", null, [3, 4, 5]],
  icarianHarpyBattle: ["ICARIAN_HARPY", null, [1, 2, 3, 4, 5]],
  sunDescendantBattle: ["SUN_DESCENDANT", null, [1, 2]],
  midascore_level_1: ["MIDASCORE", null, [1]],
  midascore_level_2: ["MIDASCORE", null, [2, 3, 4]],
  demidjinnBattle: ["DEMIDJINN", null, [1, 2, 3, 4]],
  babelianLunacyBattle: ["THE_BABELIAN_LUNACY", null, [1]],
  reapTheWhirlwindBattle: ["DAHAKA", "reap-the-whirlwind", [1]],
  theWinnowingBattle: ["DAHAKA", "the-winnowing", [1]],
  dragonOfPhobos_1_2_levels_positions: ["DRAGON_OF_PHOBOS", null, [1, 2]],
  dragonOfPhobos_3_level_positions: ["DRAGON_OF_PHOBOS", null, [3, 4]],
  meduketosBattle: ["MEDUKETOS", null, [1, 2, 3, 4]],
  urFleeceBattle: ["UR_FLEECE", null, [1]],
};

// 从 terrain-data.js 读取当前 setups（保持 id/label/levels）
const src = fs.readFileSync(path.join(__dirname, "..", "ss", "terrain-data.js"), "utf8");
// 临时加载获取 setups
const dataObj = require(path.join(__dirname, "..", "ss", "terrain-data.js"));
const setups = dataObj.setups;

// 按地形名分组成 terrain(name, [...]) 并生成 tile() 字符串
function tilesToText(tiles) {
  const groups = new Map();
  for (const t of tiles) {
    if (!groups.has(t.name)) groups.set(t.name, []);
    groups.get(t.name).push(t);
  }
  const lines = [];
  for (const [name, list] of groups) {
    const tileStrs = list.map((t) => {
      const args = [t.row, t.column];
      if (t.rotation !== 180 || t.flipped) args.push(t.rotation);
      if (t.flipped) args.push(true);
      return `tile(${args.join(", ")})`;
    });
    lines.push(`terrain("${name}", [${tileStrs.join(", ")}]),`);
  }
  return lines.join("\n        ");
}

// ambush 地形对 HEKATON 与 LABYRINTHAUROS 相同
const ambushTiles = converted.ambushBattle;

// TTS 里 UR_FLEECE 的轨道块只按尺寸命名（4x1 全叫 Track Tile 2，5x1 全叫 Track Tile 1），
// 但 app 按图片细分为 Track Tile 2/3（1x4）与 Track Tile 1/4（1x5）。按列位置恢复细分名。
function fixUrFleeceTracks(tiles) {
  return tiles.map((t) => {
    if (t.name === "Track Tile 2 1x4") {
      if (t.column === 8.5) return { ...t, name: "Track Tile 3 1x4" };
    }
    if (t.name === "Track Tile 1 1x5") {
      if (t.column === 4) return { ...t, name: "Track Tile 4 1x5" };
    }
    return t;
  });
}

// 构建新 setups 文本（THE_NIETZSCHEAN 由别名保留，不单独生成）
const parts = [];
for (const [apostle, choices] of Object.entries(setups)) {
  if (apostle === "THE_NIETZSCHEAN") continue;
  const choiceParts = [];
  choices.forEach((choice, idx) => {
    // 找到匹配的战役（按 apostle + levels 精确匹配）
    let newTiles = null;
    // LABYRINTHAUROS 的 ambush 与 HEKATON ambush 相同布局
    if (apostle === "LABYRINTHAUROS" && choice.id === "ambush") newTiles = ambushTiles;
    if (!newTiles) {
      for (const [fn, [a, setupId, levels]] of Object.entries(battleMap)) {
        if (a !== apostle) continue;
        const key = levels.join(",");
        const choiceKey = choice.levels.join(",");
        const matches = key === choiceKey
          && (!setupId || choice.id === setupId)
          && (!choice.id || setupId === choice.id || !setupId);
        if (matches) { newTiles = converted[fn]; break; }
      }
    }
    const idPart = choice.id ? `id: "${choice.id}", ` : "";
    const labelPart = choice.label ? `label: "${choice.label}", ` : "";
    const levelsPart = `levels: [${choice.levels.join(", ")}]`;
    if (newTiles && newTiles.length) {
      let tiles = newTiles;
      if (apostle === "UR_FLEECE") tiles = fixUrFleeceTracks(tiles);
      // DRAGON_OF_PHOBOS 的 Trench 1x5 在 TTS 里横向贴 col1（部分伸出版图左缘），
      // app 有边界约束，转竖向（rot 90）让长边沿边界方向，视觉等效。
      if (apostle === "DRAGON_OF_PHOBOS") {
        tiles = tiles.map((t) =>
          (t.name === "Trench 1x5" && t.column === 1 && t.rotation === 180)
            ? { ...t, rotation: 90 }
            : t);
      }
      choiceParts.push(`{ ${idPart}${labelPart}${levelsPart}, terrains: [
        ${tilesToText(tiles)}
      ] }`);
    } else {
      choiceParts.push(`{ ${idPart}${labelPart}${levelsPart}, terrains: [] }`);
    }
  });
  parts.push(`${apostle}: [\n      ${choiceParts.join(",\n      ")},\n    ]`);
}

const newSetups = `  const setups = {
    ${parts.join(",\n    ")},
  };
  setups.THE_NIETZSCHEAN = setups.THE_NIETZSCJEAN;`;

fs.writeFileSync(path.join(__dirname, "setups-block.txt"), newSetups, "utf8");
console.log("generated setups-block.txt, length:", newSetups.length);

// 备份并替换文件中的 setups 段
const target = path.join(__dirname, "..", "ss", "terrain-data.js");
fs.copyFileSync(target, path.join(__dirname, "terrain-data.js.bak"));
const startMarker = "  const setups = {";
const endMarker = "  setups.THE_NIETZSCHEAN = setups.THE_NIETZSCJEAN;";
const s = src.indexOf(startMarker);
const e = src.indexOf(endMarker);
if (s < 0 || e < 0) { console.error("markers not found"); process.exit(1); }
const endOfLine = src.indexOf("\n", e);
const newSrc = src.slice(0, s) + newSetups + "\n" + src.slice(endOfLine + 1);
fs.writeFileSync(target, newSrc, "utf8");
console.log("terrain-data.js updated");
