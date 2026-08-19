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
assert.equal(terrain.getTiles("HEKATON", "IV", "ambush").length, 12);
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
assert.equal(terrain.getTiles("SUN_DESCENDANT", "I").length, 19);

const hasPlacement = (apostle, level, name, row, column, setupId) => terrain
  .getTiles(apostle, level, setupId)
  .some((placement) => placement.name === name && placement.row === row && placement.column === column);
const findPlacement = (apostle, level, name, row, column, setupId) => terrain
  .getTiles(apostle, level, setupId)
  .find((placement) => placement.name === name && placement.row === row && placement.column === column);
const c3AnchorNames = ["Red Anchor", "Blue Anchor", "Green Anchor", "Yellow Anchor"];

assert.equal(
  terrain.getTiles("CHIMERA_METASTASIOS", 3).some((tile) => c3AnchorNames.includes(tile.name)),
  false
);

// Cycle IV-V storybook diagrams label rows A-N from bottom to top.
assert.equal(hasPlacement("MIDASCORE", 1, "Irem City", 10, 4), true);
assert.equal(hasPlacement("MIDASCORE", 1, "Irem City", 5, 4), false);
assert.equal(hasPlacement("DEMIDJINN", 1, "Irem Tower", 13, 4), true);
assert.equal(hasPlacement("THE_BABELIAN_LUNACY", 1, "Irem Tower", 14, 11), true);
assert.equal(hasPlacement("CYCLONUS", 1, "Fortified City", 13, 14), true);
assert.equal(hasPlacement("CYCLONUS", 8, "Spartan River Works Z", 2, 5.5), true);
assert.deepEqual(
  [
    findPlacement("THE_NIETZSCJEAN", 1, "Spartan River Works 1x1 Corner", 1, 16, "the-cruel-lesson"),
    ...terrain.getTiles("THE_NIETZSCJEAN", 1, "the-cruel-lesson")
      .filter((tile) => tile.name === "Spartan River Works 1x4")
      .sort((left, right) => left.row - right.row),
  ].map((tile) => ({ name: tile.name, row: tile.row, column: tile.column, rotation: tile.rotation, flipped: tile.flipped })),
  [
    { name: "Spartan River Works 1x1 Corner", row: 1, column: 16, rotation: 90, flipped: false },
    { name: "Spartan River Works 1x4", row: 3.5, column: 16, rotation: 90, flipped: false },
    { name: "Spartan River Works 1x4", row: 12.5, column: 16, rotation: 270, flipped: false },
  ]
);
assert.equal(hasPlacement("THE_BURDEN", 1, "Column", 14, 7, "burden-battle"), true);
assert.equal(findPlacement("THE_BURDEN", 1, "Cliff L", 13.5, 9, "burden-battle")?.flipped, true);
assert.equal(findPlacement("THE_BURDEN", 1, "Cliff L", 13.5, 5, "hardest-to-bear")?.flipped, false);
assert.deepEqual(
  findPlacement("THE_BURDEN", 1, "Cliff L", 1.5, 7, "hardest-to-bear"),
  { file: "cliff-l.png", width: 3, height: 2, los: terrain.catalog["Cliff L"].los, row: 1.5, column: 7, rotation: 0, flipped: true, name: "Cliff L" }
);
assert.deepEqual(
  findPlacement("THE_BURDEN", 1, "Cliff L", 1.5, 10, "burden-battle"),
  { file: "cliff-l.png", width: 3, height: 2, los: terrain.catalog["Cliff L"].los, row: 1.5, column: 10, rotation: 180, flipped: false, name: "Cliff L" }
);
assert.equal(hasPlacement("DAHAKA", 1, "Ambrosia Cloud", 12, 14, "reap-the-whirlwind"), true);
assert.equal(hasPlacement("DAHAKA", 1, "Irem City", 12, 15, "the-winnowing"), true);
assert.equal(hasPlacement("DRAGON_OF_PHOBOS", 1, "Arcology", 13, 14), true);
assert.equal(hasPlacement("DRAGON_OF_PHOBOS", 3, "Trench 1x4", 14, 4.5), true);
assert.equal(hasPlacement("MEDUKETOS", 1, "Arcology", 10, 12), true);
assert.equal(hasPlacement("UR_FLEECE", 1, "Black Abyss", 12, 3), true);
assert.equal(hasPlacement("UR_FLEECE", 1, "Trench 1x5", 14, 4), true);
assert.equal(hasPlacement("UR_FLEECE", 1, "Track Tile 4 1x5", 1, 4), true);
const anchorPlacements = (apostle, level, setupId) => (
  ["Red Anchor", "Blue Anchor", "Green Anchor", "Yellow Anchor"].map((name) => {
    const placement = terrain.getTiles(apostle, level, setupId).find((tile) => tile.name === name);
    return placement && { name, row: placement.row, column: placement.column, special: terrain.catalog[name].special };
  })
);
assert.deepEqual(
  anchorPlacements("HYPERTIME_ORACLE", 1),
  [
    { name: "Red Anchor", row: 12, column: 7, special: "anchor" },
    { name: "Blue Anchor", row: 3, column: 11, special: "anchor" },
    { name: "Green Anchor", row: 12, column: 10, special: "anchor" },
    { name: "Yellow Anchor", row: 10, column: 5, special: "anchor" },
  ]
);
assert.deepEqual(
  anchorPlacements("HYPERTIME_ORACLE", 3),
  [
    { name: "Red Anchor", row: 12, column: 7, special: "anchor" },
    { name: "Blue Anchor", row: 3, column: 11, special: "anchor" },
    { name: "Green Anchor", row: 12, column: 10, special: "anchor" },
    { name: "Yellow Anchor", row: 11, column: 14, special: "anchor" },
  ]
);
assert.deepEqual(
  anchorPlacements("ICARIAN_HARPY", 1),
  [
    { name: "Red Anchor", row: 11, column: 8, special: "anchor" },
    { name: "Blue Anchor", row: 4, column: 13, special: "anchor" },
    { name: "Green Anchor", row: 8, column: 7, special: "anchor" },
    { name: "Yellow Anchor", row: 7, column: 14, special: "anchor" },
  ]
);
assert.deepEqual(
  anchorPlacements("SUN_DESCENDANT", 1),
  [
    { name: "Red Anchor", row: 10, column: 6, special: "anchor" },
    { name: "Blue Anchor", row: 5, column: 13, special: "anchor" },
    { name: "Green Anchor", row: 5, column: 8, special: "anchor" },
    { name: "Yellow Anchor", row: 10, column: 13, special: "anchor" },
  ]
);
assert.deepEqual(anchorPlacements("THE_BURDEN", 1, "hardest-to-bear"), [undefined, undefined, undefined, undefined]);
assert.deepEqual(
  ["Labyrinth O", "Labyrinth L"].map((name) => {
    const placement = terrain.getTiles("ALPHA_TEMENOS", 1).find((tile) => tile.name === name);
    return { name, row: placement.row, column: placement.column, rotation: placement.rotation, flipped: placement.flipped };
  }),
  [
    { name: "Labyrinth O", row: 12.5, column: 12.5, rotation: 180, flipped: false },
    { name: "Labyrinth L", row: 7.5, column: 14, rotation: 180, flipped: false },
  ]
);

[
  "Irem Tower", "Irem City", "Ambrosia Cloud", "Petrified Vent", "Arcology", "Black Abyss",
  "Lightwall 1x1", "Lightwall 1x4", "Lightwall 1x5", "Track Tile 1x1", "Track Tile 1x2",
  "Track Tile 1x5", "Track Tile 1 1x5", "Track Tile 2 1x4", "Track Tile 3 1x4",
  "Track Tile 4 1x5", "Trench Left 1x1", "Trench Right 1x1", "Trench 1x4", "Trench 1x5",
  "Staircase Entrance", "Endless Staircase Track 1 1x5", "Endless Staircase Track 2 1x4",
  "Endless Staircase Track 3 1x4", "Endless Staircase Track 4 1x5", "Inkblot",
  "Trireme Graveyard", "School Of Creatures", "Windblighted Fleet", "Wishstorm",
  "Red Anchor", "Blue Anchor", "Green Anchor", "Yellow Anchor",
].forEach((name) => assert.ok(terrain.catalog[name], name));

Object.values(terrain.catalog).forEach((definition) => {
  if (!definition.file) return;
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
assert.equal(arcologySources.length, 1);
assert.match(arcologySources[0], /^\.\/terrain\/arcology-back\.jpg\?v=/);

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
assert.equal(argoBack.length, 1);
assert.match(argoBack[0], /^\.\/terrain\/argo-hull-1x5-back\.jpg\?v=/);

const burdenCliff = terrain.getTiles("THE_BURDEN", 1)
  .find((tile) => tile.name === "Cliff L" && tile.row === 1.5 && tile.column === 10);
// 缓存快照中该 Cliff L 移到 C10 且不翻面。
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
assert.deepEqual(
  terrain.getInitialPositions("THE_BURDEN", 1, "hardest-to-bear").titans.map(({ row, column }) => [row, column]),
  [[9, 8], [9, 13], [6, 8], [6, 13]]
);

const originalRandom = Math.random;
Math.random = () => 0.51;
const randomFacingMap = terrain.createBattleMap("HEKATON", 1);
Math.random = originalRandom;
assert.equal(randomFacingMap.apostleFacing, 180);
const promotedRandomFacingMap = terrain.normalizeBattleMap(randomFacingMap, "HEKATON", 4);
assert.equal(promotedRandomFacingMap.apostleFacing, 180);
assert.equal(promotedRandomFacingMap.startLevel, 1);
const sunDescendantMap = terrain.createBattleMap("SUN_DESCENDANT", 1);
assert.equal(sunDescendantMap.startPositionId, undefined);
assert.equal(sunDescendantMap.apostleFacing, 90);
assert.deepEqual(terrain.getInitialPositions("SUN_DESCENDANT", 1).apostle, {
  row: 8,
  column: 2,
  width: 3,
  height: 3,
  rotation: 90,
  facing: 90,
});
assert.equal(terrain.createBattleMap("UR_FLEECE", 1).apostleFacing, 270);
assert.equal(terrain.createBattleMap("THE_NIETZSCJEAN", 1, "the-cruel-lesson").apostleFacing, 270);
assert.equal(terrain.getFacingLabel(0), "up");
assert.equal(terrain.getFacingLabel(90), "right");
assert.equal(terrain.getFacingLabel(180), "down");
assert.equal(terrain.getFacingLabel(270), "left");

const hekatonAmbush = terrain.createBattleMap("HEKATON", 1, "ambush");
assert.equal(hekatonAmbush.apostleFacing, 270);
assert.equal(terrain.normalizeBattleMap({ ...hekatonAmbush, apostleFacing: 90 }, "HEKATON", 1).apostleFacing, 270);
const hekatonAmbushLabyrinthL = hekatonAmbush.terrain.find((tile) => tile.name === "Labyrinth L");
assert.deepEqual(
  {
    row: hekatonAmbushLabyrinthL.row,
    column: hekatonAmbushLabyrinthL.column,
    rotation: hekatonAmbushLabyrinthL.rotation,
    flipped: hekatonAmbushLabyrinthL.flipped,
  },
  { row: 9, column: 7.5, rotation: 90, flipped: false }
);
const hekatonLevelFourAmbush = terrain.createBattleMap("HEKATON", 4, "ambush");
assert.equal(hekatonLevelFourAmbush.setupKey, "HEKATON:ambush");
assert.equal(hekatonLevelFourAmbush.terrain.some((tile) => tile.name.startsWith("Labyrinth")), false);
assert.deepEqual(
  hekatonLevelFourAmbush.terrain
    .filter((tile) => tile.name.startsWith("Maze Fissure"))
    .map((tile) => ({ name: tile.name, row: tile.row, column: tile.column, rotation: tile.rotation, flipped: tile.flipped })),
  [
    { name: "Maze Fissure I", row: 4.5, column: 12, rotation: 270, flipped: false },
    { name: "Maze Fissure L", row: 9, column: 7.5, rotation: 90, flipped: false },
  ]
);
const labyrinthaurosAmbushLabyrinthL = terrain.createBattleMap("LABYRINTHAUROS", 1, "ambush")
  .terrain.find((tile) => tile.name === "Labyrinth L");
assert.deepEqual(
  {
    row: labyrinthaurosAmbushLabyrinthL.row,
    column: labyrinthaurosAmbushLabyrinthL.column,
    rotation: labyrinthaurosAmbushLabyrinthL.rotation,
    flipped: labyrinthaurosAmbushLabyrinthL.flipped,
  },
  { row: 9, column: 7.5, rotation: 90, flipped: false }
);
const expectedAmbushStarts = {
  apostle: { row: 7.5, column: 15.5, width: 2, height: 2, rotation: 0 },
  titans: [
    { id: "titan-1", label: "T1", row: 8, column: 10 },
    { id: "titan-2", label: "T2", row: 8, column: 11 },
    { id: "titan-3", label: "T3", row: 7, column: 9 },
    { id: "titan-4", label: "T4", row: 7, column: 11 },
  ],
};
assert.deepEqual(terrain.getInitialPositions("HEKATON", 5, "ambush"), expectedAmbushStarts);
assert.deepEqual(terrain.getInitialPositions("LABYRINTHAUROS", 1, "ambush"), expectedAmbushStarts);

Math.random = () => 0.24;
const labyrinthaurosA = terrain.createBattleMap("LABYRINTHAUROS", 1, "labyrinthauros-battle");
Math.random = () => 0.76;
const labyrinthaurosB = terrain.createBattleMap("LABYRINTHAUROS", 1, "labyrinthauros-battle");
Math.random = originalRandom;
assert.equal(labyrinthaurosA.startPositionId, "A");
assert.equal(labyrinthaurosA.apostleFacing, 90);
assert.deepEqual(
  terrain.getInitialPositions("LABYRINTHAUROS", 1, "labyrinthauros-battle", labyrinthaurosA.startPositionId).apostle,
  { row: 7.5, column: 3.5, width: 2, height: 2, rotation: 90, facing: 90 }
);
assert.equal(labyrinthaurosB.startPositionId, "B");
assert.equal(labyrinthaurosB.apostleFacing, 270);
assert.deepEqual(
  terrain.getInitialPositions("LABYRINTHAUROS", 1, "labyrinthauros-battle", labyrinthaurosB.startPositionId).apostle,
  { row: 7.5, column: 17.5, width: 2, height: 2, rotation: 270, facing: 270 }
);
assert.equal(
  terrain.normalizeBattleMap({ ...labyrinthaurosB, apostleFacing: 90 }, "LABYRINTHAUROS", 1).apostleFacing,
  270
);

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
