const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const terrain = require("../ss/terrain-data.js");
const toolsDir = path.join(__dirname, "../tools");
const source = fs.readFileSync(path.join(toolsDir, "parse-tts-lua.cjs"), "utf8");
const parseFunction = vm.runInNewContext(source.slice(0, source.indexOf("const result = {}")) + "\nparseFunction;", { require, __dirname: toolsDir });

test("indexed loops without key branches preserve literal and variable rotations", () => {
  const lua = fs.readFileSync(path.join(toolsDir, "lua/Battle_Setup_Cycle_V.lua"), "utf8");
  const body = lua.match(/function meduketosBattle\(\)([\s\S]*?)\nend/)[1];
  const groups = parseFunction(body);
  assert.deepEqual(Array.from(groups.find((g) => g.ttsName === "Lightwall").entries[0].rot), [0, 270, 180]);
  assert.deepEqual(Array.from(groups.find((g) => g.ttsName === "Trench").entries[0].rot), [0, 180, 0]);
});

test("corrected terrain placements match regenerated references", () => {
  const reference = require("../tools/tts-converted.json");
  for (const [fn, apostle, levels, setupId, name] of [
    ["meduketosBattle", "MEDUKETOS", [1, 2, 3, 4], undefined, "Lightwall 1x5"],
    ["dragonOfPhobos_1_2_levels_positions", "DRAGON_OF_PHOBOS", [1, 2], undefined, "Lightwall 1x5"],
    ["burdenBattle", "THE_BURDEN", [1, 2, 3, 4], "burden-battle", "Cliff O"],
    ["burdenHardestToBearBattle", "THE_BURDEN", [1], "hardest-to-bear", "Cliff O"],
  ]) for (const level of levels) {
    const actual = terrain.getTiles(apostle, level, setupId).filter((p) => p.name === name)
      .map(({ name, row, column, rotation, flipped }) => ({ name, row, column, rotation, flipped }));
    assert.deepEqual(actual, reference[fn].filter((p) => p.name === name));
    const corrected = terrain.createBattleMap(apostle, level, setupId);
    const legacy = structuredClone(corrected);
    legacy.terrain.filter((p) => p.name === name).forEach((p) => { p.rotation = 180; p.flipped = false; });
    assert.deepEqual(terrain.normalizeBattleMap(legacy, apostle, level), corrected);
    legacy.terrain[0].column += 1;
    assert.deepEqual(terrain.normalizeBattleMap(legacy, apostle, level), legacy);
  }
});

test("Meduketos lightwall occupies five vertical cells without overlapping either city", () => {
  const map = terrain.createBattleMap("MEDUKETOS", 1);
  const wall = map.terrain.find((p) => p.name === "Lightwall 1x5");
  assert.deepEqual(terrain.footprint(wall), { width: 1, height: 5 });
  assert.equal(terrain.getTileStyle({ ...terrain.catalog[wall.name], ...wall }).rotation, "90deg");
  const source = terrain.getLightCoverage(map).sources.find((p) => p.name === wall.name);
  assert.deepEqual(source.cells, [8, 9, 10, 11, 12].map((r) => ({ c: 15, r })));
  for (const city of map.terrain.filter((p) => p.name === "Arcology")) {
    const size = terrain.footprint(city);
    assert.ok(source.cells.every(({ c, r }) => Math.abs(c - city.column) > (size.width - 1) / 2
      || Math.abs(r - city.row) > (size.height - 1) / 2));
  }
});
