const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const terrain = require("../ss/terrain-data.js");

assert.equal(terrain.levelNumber("IV"), 4);
assert.equal(terrain.levelNumber("5"), 5);
assert.equal(terrain.getTiles("HEKATON", "I").length, 18);
assert.equal(terrain.getTiles("HEKATON", "IV").length, 18);
assert.equal(terrain.getTiles("HEKATON", "VIII").length, 19);
assert.equal(terrain.getTiles("HEKATON", "I", "ambush").length, 12);
assert.equal(terrain.getTiles("LABYRINTHAUROS", "I", "ambush").length, 12);
assert.equal(terrain.getTiles("HERMESIAN_PURSUER", "I", "pursuer").length, 20);
assert.equal(terrain.getTiles("HERMESIAN_PURSUER", "I", "pursuits-end").length, 19);
assert.equal(terrain.getTiles("CHIMERA_METASTASIOS", "III").length, 18);
assert.equal(terrain.getTiles("CYCLONUS", "VIII").length, 16);
assert.equal(terrain.getTiles("MIDASCORE", "I").length, 22);
assert.equal(terrain.getTiles("MIDASCORE", "II").length, 22);
assert.equal(terrain.getTiles("DEMIDJINN", "IV").length, 21);
assert.equal(terrain.getTiles("THE_BABELIAN_LUNACY", "I").length, 22);
assert.equal(terrain.getTiles("DRAGON_OF_PHOBOS", "II").length, 26);
assert.equal(terrain.getTiles("DRAGON_OF_PHOBOS", "III").length, 18);
assert.equal(terrain.getTiles("MEDUKETOS", "IV").length, 24);
assert.equal(terrain.getTiles("UR_FLEECE", "I").length, 16);
assert.equal(terrain.getTiles("DAHAKA", "I").length, 28);
assert.equal(terrain.getTiles("DAHAKA", "I", "the-winnowing").length, 27);
assert.equal(terrain.getTiles("TITAN_X", "I").length, 0);
assert.equal(terrain.getTiles("THE_NIETZSCHEAN", "I").length, 12);
assert.equal(terrain.getTiles("THE_NIETZSCJEAN", "I", "what-are-you").length, 18);
assert.equal(terrain.getTiles("THE_BURDEN", "I", "burden-battle").length, 24);
assert.equal(terrain.getTiles("THE_BURDEN", "V", "burden-battle").length, 28);
assert.equal(terrain.getTiles("THE_BURDEN", "I", "hardest-to-bear").length, 31);

const hasPlacement = (apostle, level, name, row, column, setupId) => terrain
  .getTiles(apostle, level, setupId)
  .some((placement) => placement.name === name && placement.row === row && placement.column === column);

// Cycle IV-V storybook diagrams label rows A-N from bottom to top.
assert.equal(hasPlacement("MIDASCORE", 1, "Irem City", 10, 4), true);
assert.equal(hasPlacement("MIDASCORE", 1, "Irem City", 5, 4), false);
assert.equal(hasPlacement("DEMIDJINN", 1, "Irem Tower", 13, 4), true);
assert.equal(hasPlacement("THE_BABELIAN_LUNACY", 1, "Irem Tower", 14, 11), true);
assert.equal(hasPlacement("DAHAKA", 1, "Ambrosia Cloud", 12, 14, "reap-the-whirlwind"), true);
assert.equal(hasPlacement("DAHAKA", 1, "Irem City", 12, 15, "the-winnowing"), true);
assert.equal(hasPlacement("DRAGON_OF_PHOBOS", 1, "Arcology", 13, 14), true);
assert.equal(hasPlacement("DRAGON_OF_PHOBOS", 3, "Trench 1x4", 14, 4.5), true);
assert.equal(hasPlacement("MEDUKETOS", 1, "Arcology", 10, 12), true);
assert.equal(hasPlacement("UR_FLEECE", 1, "Black Abyss", 12, 3), true);
assert.equal(hasPlacement("UR_FLEECE", 1, "Trench 1x5", 14, 4), true);
assert.equal(hasPlacement("UR_FLEECE", 1, "Track Tile 4 1x5", 1, 4), true);

[
  "Irem Tower", "Irem City", "Ambrosia Cloud", "Petrified Vent", "Arcology", "Black Abyss",
  "Lightwall 1x1", "Lightwall 1x4", "Lightwall 1x5", "Track Tile 1x1", "Track Tile 1x2",
  "Track Tile 1x5", "Track Tile 1 1x5", "Track Tile 2 1x4", "Track Tile 3 1x4",
  "Track Tile 4 1x5", "Trench Left 1x1", "Trench Right 1x1", "Trench 1x4", "Trench 1x5",
  "Staircase Entrance", "Endless Staircase Track 1 1x5", "Endless Staircase Track 2 1x4",
  "Endless Staircase Track 3 1x4", "Endless Staircase Track 4 1x5", "Inkblot",
  "Trireme Graveyard", "School Of Creatures", "Windblighted Fleet", "Wishstorm",
].forEach((name) => assert.ok(terrain.catalog[name], name));

Object.values(terrain.catalog).forEach((definition) => {
  assert.equal(fs.existsSync(path.join(__dirname, "..", "ss", "terrain", definition.file)), true, definition.file);
  if (definition.backFile) {
    assert.equal(fs.existsSync(path.join(__dirname, "..", "ss", "terrain", definition.backFile)), true, definition.backFile);
  }
});

Object.entries(terrain.setups).forEach(([apostle, choices]) => {
  choices.forEach((choice) => {
    terrain.getTiles(apostle, choice.levels[0], choice.id).forEach((placement) => {
      const size = terrain.footprint(placement);
      assert.ok(placement.column >= (size.width + 1) / 2, `${apostle}: ${placement.name} left edge`);
      assert.ok(placement.column <= 20 - (size.width - 1) / 2, `${apostle}: ${placement.name} right edge`);
      assert.ok(placement.row >= (size.height + 1) / 2, `${apostle}: ${placement.name} top edge`);
      assert.ok(placement.row <= 14 - (size.height - 1) / 2, `${apostle}: ${placement.name} bottom edge`);
    });
  });
});

const arcologySources = terrain.getAssetSources({ name: "Arcology", flipped: true }, "./terrain");
assert.deepEqual(arcologySources, ["./terrain/arcology-back.jpg?v=20260815-tone1"]);

const rotated = terrain.getTileStyle({ row: 5, column: 7.5, width: 4, height: 1, rotation: 270 });
assert.equal(rotated.left, `${7 / 20 * 100}%`);
assert.equal(rotated.top, `${9.5 / 14 * 100}%`);
assert.equal(rotated.width, `${4 / 20 * 100}%`);
assert.equal(rotated.height, `${1 / 14 * 100}%`);
assert.equal(rotated.rotation, "90deg");
assert.equal(terrain.getTileStyle({ row: 1, column: 1, width: 1, height: 1 }).top, `${13.5 / 14 * 100}%`);
assert.equal(terrain.getTileStyle({ row: 14, column: 1, width: 1, height: 1 }).top, `${0.5 / 14 * 100}%`);
assert.equal(terrain.getTileFlipTransform({ flipped: false }), "scaleX(1)");
assert.equal(terrain.getTileFlipTransform({ flipped: true }), "scaleX(-1)");

const argoBack = terrain.getAssetSources({ name: "Argo Hull 1x5", flipped: true }, "./terrain");
assert.deepEqual(argoBack, ["./terrain/argo-hull-1x5-back.jpg?v=20260815-tone1"]);

const burdenCliff = terrain.getTiles("THE_BURDEN", 1)
  .find((tile) => tile.name === "Cliff L" && tile.row === 1.5 && tile.column === 9);
assert.equal(burdenCliff.flipped, false);

const hekatonLevelOne = terrain.createBattleMap("HEKATON", 1);
assert.equal(hekatonLevelOne.setupKey, "HEKATON:hekaton-battle");
assert.equal(hekatonLevelOne.setupId, "hekaton-battle");
assert.equal(hekatonLevelOne.showStarts, true);
assert.equal(hekatonLevelOne.terrain.length, 18);

const editedHekaton = structuredClone(hekatonLevelOne);
editedHekaton.terrain[0].column = 1;
editedHekaton.showStarts = false;
const normalizedHekatonLevelThree = terrain.normalizeBattleMap(editedHekaton, "HEKATON", 3);
assert.equal(normalizedHekatonLevelThree.terrain[0].column, 1);
assert.equal(normalizedHekatonLevelThree.showStarts, false);
const hekatonLevelFour = terrain.normalizeBattleMap(editedHekaton, "HEKATON", 4);
assert.equal(hekatonLevelFour.setupKey, "HEKATON:hekaton-battle");
assert.equal(hekatonLevelFour.terrain.length, 18);
assert.equal(hekatonLevelFour.terrain[0].column, 1);
assert.equal(hekatonLevelFour.showStarts, false);

const resetHekatonLevelFour = terrain.createBattleMap("HEKATON", 4);
assert.equal(resetHekatonLevelFour.setupKey, "HEKATON:hekaton-battle");
assert.equal(resetHekatonLevelFour.terrain.length, 18);
assert.equal(resetHekatonLevelFour.showStarts, true);

const hekatonLevelEight = terrain.normalizeBattleMap(editedHekaton, "HEKATON", 8);
assert.equal(hekatonLevelEight.terrain[0].column, 1);
assert.equal(hekatonLevelEight.terrain.length, 18);
const resetHekatonLevelEight = terrain.createBattleMap("HEKATON", 8);
assert.equal(resetHekatonLevelEight.terrain.length, 19);

const hekatonCards = terrain.getTerrainCards(resetHekatonLevelEight, "../ss/terrain-cards");
assert.deepEqual(hekatonCards.map((card) => card.label), [
  "Column", "City", "Labyrinth",
]);
assert.match(hekatonCards[2].src, /terrain-cards\/labyrinth\.jpg\?v=/);

const doubleSidedCards = terrain.getTerrainCards({ terrain: [
  { name: "City", flipped: false },
  { name: "City", flipped: true },
  { name: "Maze Fissure I", flipped: false },
  { name: "Maze Fissure Z", flipped: true },
] }, "cards");
assert.deepEqual(doubleSidedCards.map((card) => card.label), ["City", "Ruined City", "Maze Fissure"]);

const horizontalAtEdge = terrain.snapPlacement({
  name: "Argo Hull 1x4",
  rotation: 180,
}, -10, 99);
assert.deepEqual(horizontalAtEdge, {
  name: "Argo Hull 1x4",
  rotation: 180,
  column: 2.5,
  row: 14,
});

const verticalAtEdge = terrain.snapPlacement({
  name: "Argo Hull 1x4",
  rotation: 270,
}, 99, -10);
assert.deepEqual(verticalAtEdge, {
  name: "Argo Hull 1x4",
  rotation: 270,
  column: 20,
  row: 2.5,
});
assert.deepEqual(terrain.footprint(verticalAtEdge), { width: 1, height: 4 });

const hekatonStarts = terrain.getInitialPositions("HEKATON");
assert.deepEqual(hekatonStarts.apostle, { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" });
assert.deepEqual(hekatonStarts.titans.map(({ row, column }) => [row, column]), [[5, 13], [6, 14], [9, 7], [10, 8]]);

assert.deepEqual(
  terrain.getInitialPositions("MIDASCORE", 1).titans.map(({ row, column }) => [row, column]),
  [[11, 9], [11, 13], [3, 9], [3, 13]]
);
assert.deepEqual(
  terrain.getInitialPositions("DAHAKA", 1, "the-winnowing"),
  {
    apostle: { row: 7.5, column: 6.5, width: 2, height: 2, rotation: 0, facing: "random" },
    titans: [
      { id: "titan-1", label: "T1", row: 10, column: 10 },
      { id: "titan-2", label: "T2", row: 9, column: 11 },
      { id: "titan-3", label: "T3", row: 6, column: 11 },
      { id: "titan-4", label: "T4", row: 5, column: 10 },
    ],
  }
);
assert.deepEqual(terrain.getInitialPositions("MEDUKETOS", 1).apostle, null);
assert.deepEqual(
  terrain.getInitialPositions("TITAN_X", 6, "the-devil-himself").titans.map(({ row, column }) => [row, column]),
  [[9, 8], [8, 9], [6, 9], [5, 8]]
);
assert.deepEqual(
  terrain.getInitialPositions("TITAN_X", 8, "the-devil-himself"),
  {
    apostle: { row: 7, column: 20, width: 1, height: 1, rotation: 0, facing: "random" },
    titans: [
      { id: "titan-1", label: "T1", row: 9, column: 18 },
      { id: "titan-2", label: "T2", row: 8, column: 19 },
      { id: "titan-3", label: "T3", row: 6, column: 19 },
      { id: "titan-4", label: "T4", row: 5, column: 18 },
    ],
  }
);

const originalRandom = Math.random;
Math.random = () => 0.51;
const randomFacingMap = terrain.createBattleMap("HEKATON", 1);
Math.random = originalRandom;
assert.equal(randomFacingMap.apostleFacing, 180);
const promotedRandomFacingMap = terrain.normalizeBattleMap(randomFacingMap, "HEKATON", 4);
assert.equal(promotedRandomFacingMap.apostleFacing, 180);
assert.equal(promotedRandomFacingMap.startLevel, 1);
assert.equal(terrain.createBattleMap("SUN_DESCENDANT", 1).apostleFacing, 90);
assert.equal(terrain.createBattleMap("UR_FLEECE", 1).apostleFacing, 90);
assert.equal(terrain.getFacingLabel(0), "up");
assert.equal(terrain.getFacingLabel(90), "right");
assert.equal(terrain.getFacingLabel(180), "down");
assert.equal(terrain.getFacingLabel(270), "left");

const hekatonAmbush = terrain.createBattleMap("HEKATON", 1, "ambush");
assert.equal(hekatonAmbush.apostleFacing, 270);
assert.equal(terrain.normalizeBattleMap({ ...hekatonAmbush, apostleFacing: 90 }, "HEKATON", 1).apostleFacing, 270);

Math.random = () => 0.76;
const hardestToBearFacing = terrain.createBattleMap("THE_BURDEN", 1, "hardest-to-bear");
Math.random = originalRandom;
assert.equal(hardestToBearFacing.apostleFacing, 270);
assert.equal(terrain.createBattleMap("THE_BURDEN", 1, "burden-battle").apostleFacing, 270);

const midascoreLevelOne = terrain.createBattleMap("MIDASCORE", 1);
assert.equal(midascoreLevelOne.setupKey, "MIDASCORE:1");
assert.equal(midascoreLevelOne.startLevel, 1);
assert.equal(midascoreLevelOne.terrain.length, 22);
assert.equal(midascoreLevelOne.terrain.filter((tile) => tile.name === "Irem Tower").length, 20);

const dahakaWinnowing = terrain.createBattleMap("DAHAKA", 1, "the-winnowing");
assert.equal(dahakaWinnowing.setupKey, "DAHAKA:the-winnowing");
assert.equal(dahakaWinnowing.setupId, "the-winnowing");
assert.equal(dahakaWinnowing.terrain.length, 27);
assert.deepEqual(terrain.getSetupOptions("DAHAKA"), [
  { id: "reap-the-whirlwind", label: "Reap the Whirlwind" },
  { id: "the-winnowing", label: "The Winnowing" },
]);

assert.deepEqual(terrain.getSetupOptions("HEKATON"), [
  { id: "hekaton-battle", label: "Hekaton Battle" },
  { id: "ambush", label: "Ambush" },
]);
assert.deepEqual(terrain.getSetupOptions("HERMESIAN_PURSUER"), [
  { id: "pursuer", label: "Pursuer" },
  { id: "pursuits-end", label: "Pursuit's End" },
]);
assert.deepEqual(terrain.getSetupOptions("THE_NIETZSCJEAN"), [
  { id: "the-cruel-lesson", label: "The Cruel Lesson" },
  { id: "what-are-you", label: "What Are You?" },
]);
assert.deepEqual(terrain.getSetupOptions("THE_BURDEN"), [
  { id: "burden-battle", label: "Burden Battle" },
  { id: "hardest-to-bear", label: "Hardest to Bear" },
]);

const titanX = terrain.createBattleMap("TITAN_X", 1, "thicker-than-water");
assert.equal(titanX.setupKey, "TITAN_X:thicker-than-water");
assert.equal(titanX.terrain.length, 0);

const manualMap = terrain.createBattleMap("UNKNOWN_APOSTLE", 1);
assert.equal(manualMap.setupKey, "UNKNOWN_APOSTLE:manual");
assert.deepEqual(manualMap.terrain, []);
assert.deepEqual(terrain.getInitialPositions("UNKNOWN_APOSTLE"), { apostle: null, titans: [] });

console.log("terrain-data tests passed");
