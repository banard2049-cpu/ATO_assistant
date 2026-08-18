const BattleTerrain = (() => {
  const columns = 20;
  const rows = 14;
  const assetVersion = "20260815-tone1";
  const terrainCardVersion = "20260815-zh-pdf1";

  // Names, sizes, and placements are transcribed from the TTS Content module.
  const catalog = {
    "Abandoned Temple": { file: "abandoned-temple.jpg", width: 2, height: 2 },
    "Ambrosia Pool": { file: "ambrosia-pool.jpg", width: 2, height: 2 },
    "Ambrosia Trail": { file: "ambrosia-trail.jpg", width: 3, height: 3 },
    "Ambrosia Elephant": { file: "ambrosia-elephant.jpg", width: 1, height: 1 },
    "Ambrosia Cloud": {
      file: "ambrosia-cloud.jpg",
      width: 3,
      height: 3,
    },
    "Argo Hull 1x4": { file: "argo-hull-1x4.jpg", width: 4, height: 1 },
    "Argo Hull 1x5": { file: "argo-hull-1x5.jpg", backFile: "argo-hull-1x5-back.jpg", width: 5, height: 1 },
    "Black Glacier 1x5": { file: "black-glacier-1x5.jpg", width: 5, height: 1 },
    "Black Glacier L": { file: "black-glacier-l.png", width: 3, height: 2 },
    "Black Glacier Z": { file: "black-glacier-z.png", width: 3, height: 2 },
    "Black Iceberg": { file: "black-iceberg.jpg", width: 1, height: 1 },
    "Black Lake": { file: "black-lake.jpg", width: 3, height: 3 },
    "Black Abyss": {
      file: "black-abyss.jpg",
      width: 3,
      height: 3,
    },
    "Arcology": {
      file: "arcology.jpg",
      backFile: "arcology-back.jpg",
      width: 3,
      height: 3,
    },
    "City": { file: "city.jpg", backFile: "ruined-city.jpg", width: 3, height: 3 },
    "Cliff I": { file: "cliff-i.jpg", width: 4, height: 1 },
    "Cliff L": { file: "cliff-l.png", width: 3, height: 2 },
    "Cliff O": { file: "cliff-o.jpg", width: 2, height: 2 },
    "Cliff Z": { file: "cliff-z.png", width: 3, height: 2 },
    "Column": { file: "column.jpg", width: 1, height: 1 },
    "Cyclops Trap": { file: "cyclops-trap.jpg", width: 1, height: 1 },
    "Endless Staircase Track 1 1x5": {
      file: "endless-staircase-track-1-1x5.jpg",
      width: 5,
      height: 1,
    },
    "Endless Staircase Track 2 1x4": {
      file: "endless-staircase-track-2-1x4.jpg",
      width: 4,
      height: 1,
    },
    "Endless Staircase Track 3 1x4": {
      file: "endless-staircase-track-3-1x4.jpg",
      width: 4,
      height: 1,
    },
    "Endless Staircase Track 4 1x5": {
      file: "endless-staircase-track-4-1x5.jpg",
      width: 5,
      height: 1,
    },
    "Floating Rocks": { file: "floating-rocks.jpg", width: 2, height: 2 },
    "Fortified City": { file: "fortified-city.jpg", backFile: "termophylaed-city.jpg", width: 3, height: 3 },
    "Giant Shell": { file: "giant-shell.jpg", width: 3, height: 3 },
    "Giant Black Iceberg": { file: "giant-black-iceberg.jpg", width: 2, height: 2 },
    "Graveyard Of The Frail": { file: "graveyard-of-the-frail.jpg", width: 2, height: 2 },
    "Hyperborean Ruins": { file: "hyperborean-ruins.jpg", width: 3, height: 3 },
    "Inkblot": {
      file: "inkblot.jpg",
      width: 2,
      height: 2,
    },
    "Irem City": {
      file: "irem-city.jpg",
      width: 3,
      height: 3,
    },
    "Irem Tower": {
      file: "irem-tower.jpg",
      width: 1,
      height: 1,
    },
    "Krypteia Outpost": { file: "krypteia-outpost.jpg", backFile: "damaged-krypteia-outpost.jpg", width: 2, height: 2 },
    "Labyrinth I": { file: "labyrinth-i.jpg", width: 4, height: 1 },
    "Labyrinth L": { file: "labyrinth-l.png", width: 3, height: 2 },
    "Labyrinth O": { file: "labyrinth-o.jpg", width: 2, height: 2 },
    "Labyrinth Z": { file: "labyrinth-z.png", width: 3, height: 2 },
    "Lightwall 1x1": {
      file: "lightwall-1x1.jpg",
      width: 1,
      height: 1,
    },
    "Lightwall 1x4": {
      file: "lightwall-1x4.jpg",
      width: 4,
      height: 1,
    },
    "Lightwall 1x5": {
      file: "lightwall-1x5.jpg",
      width: 5,
      height: 1,
    },
    "Maze Fissure I": { file: "maze-fissure-i.jpg", width: 4, height: 1 },
    "Maze Fissure L": { file: "maze-fissure-l.png", width: 3, height: 2 },
    "Maze Fissure O": { file: "maze-fissure-o.jpg", width: 2, height: 2 },
    "Maze Fissure Z": { file: "maze-fissure-z.png", width: 3, height: 2 },
    "Maze Outcrop": { file: "maze-outcrop.jpg", width: 2, height: 2 },
    "Minos Manos Unit": { file: "minos-manos-unit.jpg", width: 2, height: 2 },
    "Petrified Vent": {
      file: "petrified-vent.jpg",
      width: 1,
      height: 1,
    },
    "School Of Creatures": {
      file: "school-of-creatures.jpg",
      width: 2,
      height: 2,
    },
    "Spartan River Works Z": { file: "spartan-river-works-z.png", width: 3, height: 2 },
    "Spartan River Works 1x1 Corner": { file: "spartan-river-works-corner.jpg", width: 1, height: 1 },
    "Spartan River Works 1x1 End": { file: "spartan-river-works-end.jpg", width: 1, height: 1 },
    "Spartan River Works 1x4": { file: "spartan-river-works-1x4.jpg", width: 4, height: 1 },
    "Spartan River Works 1x5": { file: "spartan-river-works-1x5.jpg", width: 5, height: 1 },
    "Spot of Nothingness": { file: "spot-of-nothingness.jpg", width: 2, height: 2 },
    "Staircase Entrance": {
      file: "staircase-entrance.jpg",
      width: 1,
      height: 1,
    },
    "Time-Frozen City": { file: "time-frozen-city.jpg", width: 3, height: 3 },
    "Timefront 1x4": { file: "timefront-1x4.jpg", backFile: "timefront-1x4-back.jpg", width: 4, height: 1 },
    "Timefront 1x5": { file: "timefront-1x5.jpg", width: 5, height: 1 },
    "Track Tile 1x1": {
      file: "track-tile-1x1.jpg",
      width: 1,
      height: 1,
    },
    "Track Tile 1x2": {
      file: "track-tile-1x2.jpg",
      width: 2,
      height: 1,
    },
    "Track Tile 1x5": {
      file: "track-tile-1x5.jpg",
      width: 5,
      height: 1,
    },
    "Track Tile 1 1x5": {
      file: "track-tile-1-1x5.jpg",
      width: 5,
      height: 1,
    },
    "Track Tile 2 1x4": {
      file: "track-tile-2-1x4.jpg",
      width: 4,
      height: 1,
    },
    "Track Tile 3 1x4": {
      file: "track-tile-3-1x4.jpg",
      width: 4,
      height: 1,
    },
    "Track Tile 4 1x5": {
      file: "track-tile-4-1x5.jpg",
      width: 5,
      height: 1,
    },
    "Trench Left 1x1": {
      file: "trench-left-1x1.jpg",
      width: 1,
      height: 1,
    },
    "Trench Right 1x1": {
      file: "trench-right-1x1.jpg",
      width: 1,
      height: 1,
    },
    "Trench 1x4": {
      file: "trench-1x4.jpg",
      width: 4,
      height: 1,
    },
    "Trench 1x5": {
      file: "trench-1x5.jpg",
      width: 5,
      height: 1,
    },
    "Trireme Graveyard": {
      file: "trireme-graveyard.jpg",
      width: 2,
      height: 2,
    },
    "Windblighted Fleet": {
      file: "windblighted-fleet.jpg",
      width: 2,
      height: 2,
    },
    "Wishstorm": {
      file: "wishstorm.jpg",
      width: 2,
      height: 2,
    },
  };

  const terrainCardCatalog = Object.fromEntries([
    "abandoned-temple", "ambrosia-cloud", "ambrosia-elephant", "ambrosia-pool",
    "ambrosia-trail", "arcology", "argo-hull", "black-abyss", "black-glacier",
    "black-iceberg", "black-lake", "city", "cliff", "column", "cyclops-trap",
    "damaged-krypteia-outpost", "floating-rocks", "fortified-city",
    "giant-black-iceberg", "giant-shell", "graveyard-of-the-frail",
    "hyperborean-ruins", "inkblot", "irem-city", "irem-tower", "krypteia-outpost",
    "labyrinth", "lightwall", "maze-fissure", "maze-outcrop", "minos-manos-unit",
    "petrified-vent", "ruined-arcology", "ruined-city", "school-of-creatures",
    "spartan-river-works", "spot-of-nothingness", "staircase-entrance",
    "termophylaed-city", "time-frozen-city", "timefront", "trench",
    "trireme-graveyard", "windblighted-fleet", "wishstorm",
  ].map((key) => [key, {
    key,
    file: `${key}.jpg`,
    label: key.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
  }]));
  Object.assign(terrainCardCatalog, {
    "irem-city": { key: "irem-city", file: "irem-city.jpg", label: "Irem City" },
    "irem-tower": { key: "irem-tower", file: "irem-tower.jpg", label: "Irem Tower" },
    "time-frozen-city": { key: "time-frozen-city", file: "time-frozen-city.jpg", label: "Time-Frozen City" },
  });

  const terrainCardByTerrain = {};
  const mapTerrainCard = (terrainNames, front, back) => {
    terrainNames.forEach((name) => { terrainCardByTerrain[name] = { front, ...(back ? { back } : {}) }; });
  };
  mapTerrainCard(["Abandoned Temple"], "abandoned-temple");
  mapTerrainCard(["Ambrosia Cloud"], "ambrosia-cloud");
  mapTerrainCard(["Ambrosia Elephant"], "ambrosia-elephant");
  mapTerrainCard(["Ambrosia Pool"], "ambrosia-pool");
  mapTerrainCard(["Ambrosia Trail"], "ambrosia-trail");
  mapTerrainCard(["Arcology"], "arcology", "ruined-arcology");
  mapTerrainCard(["Argo Hull 1x4", "Argo Hull 1x5"], "argo-hull");
  mapTerrainCard(["Black Abyss"], "black-abyss");
  mapTerrainCard(["Black Glacier 1x5", "Black Glacier L", "Black Glacier Z"], "black-glacier");
  mapTerrainCard(["Black Iceberg"], "black-iceberg");
  mapTerrainCard(["Black Lake"], "black-lake");
  mapTerrainCard(["City"], "city", "ruined-city");
  mapTerrainCard(["Cliff I", "Cliff L", "Cliff O", "Cliff Z"], "cliff");
  mapTerrainCard(["Column"], "column");
  mapTerrainCard(["Cyclops Trap"], "cyclops-trap");
  mapTerrainCard(["Floating Rocks"], "floating-rocks");
  mapTerrainCard(["Fortified City"], "fortified-city", "termophylaed-city");
  mapTerrainCard(["Giant Black Iceberg"], "giant-black-iceberg");
  mapTerrainCard(["Giant Shell"], "giant-shell");
  mapTerrainCard(["Graveyard Of The Frail"], "graveyard-of-the-frail");
  mapTerrainCard(["Hyperborean Ruins"], "hyperborean-ruins");
  mapTerrainCard(["Inkblot"], "inkblot");
  mapTerrainCard(["Irem City"], "irem-city");
  mapTerrainCard(["Irem Tower"], "irem-tower");
  mapTerrainCard(["Krypteia Outpost"], "krypteia-outpost", "damaged-krypteia-outpost");
  mapTerrainCard(["Labyrinth I", "Labyrinth L", "Labyrinth O", "Labyrinth Z"], "labyrinth");
  mapTerrainCard(["Lightwall 1x1", "Lightwall 1x4", "Lightwall 1x5"], "lightwall");
  mapTerrainCard(["Maze Fissure I", "Maze Fissure L", "Maze Fissure O", "Maze Fissure Z"], "maze-fissure");
  mapTerrainCard(["Maze Outcrop"], "maze-outcrop");
  mapTerrainCard(["Minos Manos Unit"], "minos-manos-unit");
  mapTerrainCard(["Petrified Vent"], "petrified-vent");
  mapTerrainCard(["School Of Creatures"], "school-of-creatures");
  mapTerrainCard([
    "Spartan River Works Z", "Spartan River Works 1x1 Corner",
    "Spartan River Works 1x1 End", "Spartan River Works 1x4", "Spartan River Works 1x5",
  ], "spartan-river-works");
  mapTerrainCard(["Spot of Nothingness"], "spot-of-nothingness");
  mapTerrainCard(["Staircase Entrance"], "staircase-entrance");
  mapTerrainCard(["Time-Frozen City"], "time-frozen-city");
  mapTerrainCard(["Timefront 1x4", "Timefront 1x5"], "timefront");
  mapTerrainCard(["Trench Left 1x1", "Trench Right 1x1", "Trench 1x4", "Trench 1x5"], "trench");
  mapTerrainCard(["Trireme Graveyard"], "trireme-graveyard");
  mapTerrainCard(["Windblighted Fleet"], "windblighted-fleet");
  mapTerrainCard(["Wishstorm"], "wishstorm");

  const tile = (row, column, rotation = 180, flipped = false) => ({ row, column, rotation, flipped });
  const terrain = (name, tiles) => ({ name, tiles });
  const points = (values) => values.map(([row, column]) => tile(row, column));

  const setups = {
    HEKATON: [
      { id: "hekaton-battle", label: "Hekaton Battle", levels: [1, 2, 3], terrains: [
        terrain("Column", points([[2, 9], [2, 12], [3, 4], [3, 17], [5, 6], [6, 15], [7, 3], [7, 18], [8, 3], [8, 18], [9, 6], [10, 15], [12, 4], [12, 17], [13, 9], [13, 12]])),
        terrain("City", [tile(5, 4), tile(10, 17)]),
      ] },
      { id: "hekaton-battle", label: "Hekaton Battle", levels: [4, 5, 6, 7], terrains: [
        terrain("Column", points([[2, 12], [3, 4], [3, 17], [5, 6], [6, 15], [7, 18], [9, 6], [10, 15], [12, 4], [12, 17], [13, 9]])),
        terrain("City", [tile(5, 4), tile(10, 17)]),
        terrain("Maze Fissure O", [tile(2.5, 8.5)]),
        terrain("Maze Fissure I", [tile(8.5, 3, 90), tile(8, 16.5)]),
        terrain("Maze Fissure L", [tile(7, 9.5, 270), tile(12.5, 13)]),
      ] },
      { id: "hekaton-battle", label: "Hekaton Battle", levels: [8], terrains: [
        terrain("Column", points([[2, 12], [3, 3], [3, 17], [5, 5], [6, 15], [7, 18], [10, 15], [12, 4], [12, 17], [13, 9]])),
        terrain("City", [tile(5, 3), tile(10, 17)]),
        terrain("Labyrinth I", [tile(8.5, 2, 270), tile(8, 16.5, 0)]),
        terrain("Labyrinth L", [tile(7, 9.5, 90), tile(12.5, 13, 0, true)]),
        terrain("Labyrinth O", [tile(2.5, 7.5, 0)]),
        terrain("Labyrinth Z", [tile(3.5, 14, 0), tile(11.5, 7, 0)]),
      ] },
      { id: "ambush", label: "Ambush", levels: [1], terrains: [
        terrain("Column", points([[2, 9], [3, 12], [4, 13], [5, 11], [6, 15], [8, 6], [9, 4], [9, 15]])),
        terrain("City", [tile(4, 4), tile(11, 4)]),
        terrain("Labyrinth I", [tile(10.5, 12, 270)]),
        terrain("Labyrinth L", [tile(6, 7.5, 270, true)]),
      ] },
    ],
    LABYRINTHAUROS: [
      { id: "labyrinthauros-battle", label: "Labyrinthauros Battle", levels: [1, 2, 3, 4], terrains: [
        terrain("Labyrinth I", [tile(10, 7.5, 0)]),
        terrain("Labyrinth Z", [tile(10, 12.5, 90, true)]),
        terrain("Labyrinth O", [tile(5.5, 7.5, 0)]),
        terrain("Labyrinth L", [tile(5.5, 12)]),
        terrain("City", [tile(4, 15), tile(11, 3)]),
      ] },
      { id: "ambush", label: "Ambush", levels: [1], terrains: [
        terrain("Column", points([[2, 9], [3, 12], [4, 13], [5, 11], [6, 15], [8, 6], [9, 4], [9, 15]])),
        terrain("City", [tile(4, 4), tile(11, 4)]),
        terrain("Labyrinth I", [tile(10.5, 12, 270)]),
        terrain("Labyrinth L", [tile(6, 7.5, 270, true)]),
      ] },
    ],
    HERMESIAN_PURSUER: [
      { id: "pursuer", label: "Pursuer", levels: [1], terrains: [
        terrain("Ambrosia Pool", [tile(4.5, 10.5), tile(7.5, 5.5), tile(7.5, 14.5), tile(12.5, 10.5)]),
        terrain("Column", points([[2, 9], [2, 12], [3, 4], [3, 15], [5, 18], [6, 6], [6, 15], [6, 18], [9, 3], [9, 6], [9, 15], [10, 3], [11, 5], [12, 17], [13, 9], [13, 12]])),
      ] },
      { id: "pursuits-end", label: "Pursuit's End", levels: [1], terrains: [
        terrain("Ambrosia Pool", [tile(4.5, 10.5), tile(7.5, 8.5), tile(7.5, 12.5), tile(12.5, 10.5)]),
        terrain("Ambrosia Trail", [tile(2, 7), tile(7, 4), tile(11, 15)]),
        terrain("Column", points([[2, 12], [3, 4], [3, 15], [5, 18], [6, 6], [6, 18], [9, 6], [9, 15], [10, 3], [11, 5], [12, 17], [13, 9]])),
      ] },
    ],
    ALPHA_TEMENOS: [{ levels: [1], terrains: [
      terrain("Labyrinth I", [tile(8, 7.5)]),
      terrain("Labyrinth Z", [tile(12.5, 10, 0, true)]),
      terrain("Labyrinth O", [tile(2.5, 12.5, 0)]),
      terrain("Labyrinth L", [tile(7.5, 14)]),
      terrain("Column", points([[4, 7], [4, 15], [5, 5], [5, 17], [11, 5], [11, 17], [12, 7], [12, 15]])),
      terrain("City", [tile(3, 5), tile(13, 17)]),
    ] }],
    CHIMERA_METASTASIOS: [
      { levels: [1, 2], terrains: [
        terrain("Fortified City", [tile(4, 5), tile(9, 16)]),
        terrain("Column", points([[2, 6], [5, 9], [7, 17], [12, 16]])),
        terrain("Ambrosia Pool", [tile(2.5, 17.5), tile(11.5, 2.5)]),
      ] },
      { levels: [3, 4], terrains: [
        terrain("Fortified City", [tile(4, 5), tile(9, 16)]),
        terrain("Column", points([[2, 6], [5, 9], [7, 17], [8, 1], [10, 18], [12, 4], [12, 16]])),
        terrain("Ambrosia Pool", [tile(2.5, 17.5), tile(3.5, 13.5), tile(7.5, 2.5), tile(10.5, 8.5), tile(11.5, 2.5)]),
        terrain("Spartan River Works 1x4", [tile(2.5, 16, 270), tile(12.5, 15, 90)]),
        terrain("Spartan River Works 1x5", [tile(3, 7, 90), tile(12, 5, 270)]),
      ] },
    ],
    CYCLONUS: [
      { levels: [1, 2, 3, 4, 5, 6, 7], terrains: [
        terrain("Fortified City", [tile(2, 14), tile(11, 7)]),
        terrain("Spartan River Works 1x1 Corner", [tile(6, 5, 270), tile(5, 20), tile(6, 20, 90)]),
        terrain("Spartan River Works 1x1 End", [tile(13, 10, 90), tile(14, 10, 90)]),
        terrain("Spartan River Works 1x4", [tile(2.5, 16, 270), tile(6, 2.5, 0), tile(12.5, 16, 270), tile(8.5, 16, 90)]),
        terrain("Spartan River Works 1x5", [tile(3, 10, 270), tile(12, 5, 90), tile(10, 10, 270)]),
      ] },
      { levels: [8], terrains: [
        terrain("Fortified City", [tile(2, 14), tile(11, 7)]),
        terrain("Spartan River Works 1x1 End", [tile(14, 10, 90), tile(14, 16, 270)]),
        terrain("Spartan River Works 1x1 Corner", [tile(5, 20), tile(6, 5, 270), tile(6, 20, 90)]),
        terrain("Spartan River Works 1x4", [tile(2.5, 16, 90), tile(11.5, 16, 90), tile(6, 2.5, 0), tile(7.5, 10, 270), tile(11.5, 10, 90)]),
        terrain("Spartan River Works 1x5", [tile(3, 10, 270), tile(9, 5, 90), tile(7, 16, 90)]),
        terrain("Spartan River Works Z", [tile(13, 5.5, 90)]),
      ] },
    ],
    THE_BURDEN: [
      { id: "burden-battle", label: "Burden Battle", levels: [1, 2, 3, 4], terrains: [
        terrain("Column", points([[1, 7], [4, 8], [4, 12], [5, 15], [6, 1], [9, 11], [10, 16], [11, 10], [14, 4]])),
        terrain("Cliff I", [tile(3, 15.5), tile(12, 15.5), tile(8.5, 5, 90), tile(12.5, 7, 90)]),
        terrain("Cliff L", [tile(1.5, 9, 0), tile(11, 1.5, 270, true), tile(13.5, 9, 180, true)]),
        terrain("Cliff O", [tile(6.5, 8.5, 0), tile(6.5, 14.5, 0), tile(7.5, 17.5, 0)]),
        terrain("Cliff Z", [tile(2.5, 12, 180, true), tile(3.5, 19, 180, true), tile(4, 3.5, 270), tile(12.5, 12), tile(11.5, 19)]),
      ] },
      { id: "burden-battle", label: "Burden Battle", levels: [5], terrains: [
        terrain("Column", points([[1, 7], [4, 8], [5, 15], [6, 1], [9, 11], [10, 16], [11, 10], [14, 4]])),
        terrain("Black Glacier 1x5", [tile(4, 15), tile(10, 8), tile(11, 13)]),
        terrain("Black Lake", [tile(5, 6), tile(7, 3)]),
        terrain("Cliff I", [tile(3, 15.5, 0), tile(12, 15.5, 0), tile(8.5, 5, 90), tile(12.5, 7, 90)]),
        terrain("Cliff L", [tile(1.5, 9, 0), tile(11, 1.5, 270, true), tile(13.5, 9, 180, true)]),
        terrain("Cliff O", [tile(6.5, 8.5, 0), tile(6.5, 14.5, 0), tile(7.5, 17.5, 0)]),
        terrain("Cliff Z", [tile(2.5, 12, 180, true), tile(3.5, 19, 180, true), tile(4, 3.5, 270), tile(12.5, 12), tile(11.5, 19)]),
      ] },
      { id: "hardest-to-bear", label: "Hardest to Bear", levels: [1], terrains: [
        terrain("Column", points([[4, 7], [4, 17], [5, 3], [5, 15], [7, 2], [7, 3], [8, 19], [9, 2], [9, 9], [9, 19], [10, 2], [11, 7], [11, 10], [11, 15], [11, 17], [12, 15]])),
        terrain("Black Iceberg", points([[13, 4], [13, 5]])),
        terrain("Cliff I", [tile(1, 16.5), tile(14, 16.5), tile(3.5, 9, 90), tile(11.5, 12, 90)]),
        terrain("Cliff L", [tile(1.5, 5, 180, true), tile(13.5, 7, 0)]),
        terrain("Cliff O", [tile(2.5, 11.5, 0), tile(7.5, 17.5, 0), tile(10.5, 4.5, 0)]),
        terrain("Cliff Z", [tile(2.5, 2), tile(12.5, 19, 0), tile(2.5, 19, 180, true), tile(12.5, 2, 180, true)]),
      ] },
    ],
    THE_NIETZSCJEAN: [
      { id: "the-cruel-lesson", label: "The Cruel Lesson", levels: [1], terrains: [
        terrain("Fortified City", [tile(2, 18), tile(12, 6)]),
        terrain("Spartan River Works 1x4", [tile(2.5, 16, 90), tile(11.5, 16, 90)]),
        terrain("Spartan River Works 1x5", [tile(7, 16, 90), tile(14, 7), tile(14, 13)]),
        terrain("Spartan River Works 1x1 Corner", [tile(14, 16, 0)]),
        terrain("Spartan River Works 1x1 End", [tile(14, 10, 0)]),
        terrain("Argo Hull 1x5", [tile(7, 1, 90), tile(12, 1, 90)]),
        terrain("Argo Hull 1x4", [tile(2.5, 1, 90)]),
      ] },
      { id: "what-are-you", label: "What Are You?", levels: [1], terrains: [
        terrain("Fortified City", [tile(3, 11), tile(8, 17), tile(12, 13)]),
        terrain("Spartan River Works 1x4", [tile(1, 7.5, 0), tile(11.5, 16, 90), tile(14, 3.5), tile(14, 12.5), tile(1, 3.5)]),
        terrain("Spartan River Works 1x5", [tile(1, 12, 0), tile(4, 16, 90), tile(14, 8)]),
        terrain("Spartan River Works 1x1 Corner", [tile(1, 16, 270), tile(14, 16, 0)]),
        terrain("Spartan River Works 1x1 End", [tile(1, 15), tile(14, 15, 0)]),
        terrain("Argo Hull 1x5", [tile(7, 1, 90), tile(12, 1, 90)]),
        terrain("Argo Hull 1x4", [tile(2.5, 1, 90)]),
      ] },
    ],
    HYPERTIME_ORACLE: [
      { levels: [1, 2], terrains: [
        terrain("Timefront 1x4", [tile(7.5, 1, -90)]),
        terrain("Timefront 1x5", [tile(3, 1, -90), tile(12, 1, -90)]),
        terrain("Time-Frozen City", [tile(2, 18), tile(13, 16)]),
        terrain("Black Iceberg", points([[2, 13], [4, 11], [8, 9], [10, 6], [10, 14], [11, 10], [12, 8]])),
      ] },
      { levels: [3, 4, 5], terrains: [
        terrain("Timefront 1x4", [tile(7.5, 1, -90)]),
        terrain("Timefront 1x5", [tile(3, 1, -90), tile(12, 1, -90)]),
        terrain("Time-Frozen City", [tile(2, 18), tile(13, 19)]),
        terrain("Black Iceberg", points([[2, 13], [4, 11], [6, 12], [7, 18], [8, 9], [9, 17], [10, 14], [11, 10], [11, 16], [12, 8]])),
        terrain("Giant Black Iceberg", [tile(4.5, 16.5)]),
      ] },
    ],
    ICARIAN_HARPY: [{ levels: [1, 2, 3, 4, 5], terrains: [
      terrain("Time-Frozen City", [tile(5, 4), tile(12, 6)]),
      terrain("Black Lake", [tile(5, 16), tile(7, 10)]),
      terrain("Giant Black Iceberg", [tile(4.5, 6.5), tile(7.5, 18.5), tile(8.5, 13.5)]),
      terrain("Black Glacier 1x5", [tile(5, 12), tile(7, 6, 0), tile(10, 12, -90)]),
      terrain("Black Iceberg", points([[2, 9], [2, 12], [3, 17], [6, 6], [8, 3], [9, 15], [10, 6], [12, 4], [12, 17], [13, 12]])),
    ] }],
    // Cycle IV-V rows are transcribed from the storybook diagrams (A at the bottom, N at the top).
    MIDASCORE: [
      { levels: [1], terrains: [
        terrain("Irem Tower", points([[13, 4], [13, 15], [12, 16], [11, 11], [10, 6], [10, 13], [9, 20], [8, 3], [8, 15], [7, 19], [6, 9], [5, 2], [5, 6], [5, 11], [3, 13], [2, 2], [2, 9], [2, 20], [1, 3], [1, 14]])),
        terrain("Irem City", [tile(10, 4), tile(5, 16)]),
      ] },
      { levels: [2, 3, 4], terrains: [
        terrain("Irem Tower", points([[13, 4], [13, 15], [12, 16], [11, 9], [11, 13], [10, 6], [9, 20], [8, 3], [8, 15], [7, 19], [6, 9], [5, 2], [5, 6], [5, 11], [3, 9], [3, 13], [3, 20], [2, 2], [1, 3], [1, 14]])),
        terrain("Irem City", [tile(10, 4), tile(5, 16)]),
      ] },
    ],
    DEMIDJINN: [{ levels: [1, 2, 3, 4], terrains: [
      terrain("Irem Tower", points([[13, 4], [13, 15], [12, 17], [11, 11], [10, 6], [10, 13], [9, 20], [8, 3], [8, 15], [7, 19], [6, 9], [5, 2], [5, 6], [5, 11], [3, 13], [2, 2], [2, 9], [1, 3], [1, 14]])),
      terrain("Irem City", [tile(10, 4), tile(5, 16)]),
    ] }],
    THE_BABELIAN_LUNACY: [{ levels: [1], terrains: [
      terrain("Irem Tower", points([[14, 11], [13, 4], [13, 15], [12, 10], [12, 16], [11, 12], [10, 6], [9, 20], [8, 3], [8, 15], [7, 6], [7, 19], [6, 9], [5, 2], [5, 6], [5, 10], [3, 11], [3, 20], [2, 2], [1, 3]])),
      terrain("Irem City", [tile(10, 4), tile(5, 16)]),
    ] }],
    DAHAKA: [
      { id: "reap-the-whirlwind", label: "Reap the Whirlwind", levels: [1], terrains: [
        terrain("Argo Hull 1x4", [tile(12.5, 1, 90)]),
        terrain("Argo Hull 1x5", [tile(8, 1, 90), tile(3, 1, 90)]),
        terrain("Ambrosia Cloud", [tile(12, 14), tile(10, 5), tile(4, 15), tile(2, 5)]),
        terrain("Abandoned Temple", [tile(13.5, 19.5)]),
        terrain("Irem Tower", points([[13, 4], [12, 16], [11, 11], [10, 7], [10, 13], [10, 17], [9, 20], [8, 3], [8, 15], [7, 19], [6, 9], [5, 2], [5, 6], [5, 11], [4, 6], [3, 13], [2, 9], [2, 20], [1, 3], [1, 14]])),
      ] },
      { id: "the-winnowing", label: "The Winnowing", levels: [1], terrains: [
        terrain("Ambrosia Cloud", [tile(13, 10), tile(10, 5), tile(7, 17), tile(2, 5)]),
        terrain("Abandoned Temple", [tile(3.5, 1.5)]),
        terrain("Irem City", [tile(12, 15), tile(5, 7)]),
        terrain("Irem Tower", points([[13, 4], [13, 17], [11, 11], [10, 1], [10, 7], [10, 13], [10, 17], [9, 20], [8, 3], [8, 15], [7, 3], [7, 19], [5, 2], [5, 11], [5, 16], [3, 13], [2, 9], [2, 20], [1, 3], [1, 14]])),
      ] },
    ],
    DRAGON_OF_PHOBOS: [
      { levels: [1, 2], terrains: [
        terrain("Petrified Vent", points([[13, 19], [12, 16], [12, 18], [11, 11], [10, 7], [10, 13], [10, 17], [9, 15], [9, 20], [8, 17], [7, 19], [5, 6], [5, 8], [3, 8], [3, 11], [3, 14], [2, 9], [2, 16], [1, 14]])),
        terrain("Arcology", [tile(13, 14), tile(3, 3)]),
        terrain("Black Abyss", [tile(4, 19)]),
        terrain("Lightwall 1x4", [tile(5, 2.5)]),
        terrain("Lightwall 1x5", [tile(1, 11, 180, true)]),
        terrain("Trench 1x4", [tile(14, 4.5)]),
        terrain("Trench 1x5", [tile(10, 1, 90)]),
      ] },
      { levels: [3, 4], terrains: [
        terrain("Petrified Vent", points([[13, 19], [12, 10], [11, 5], [10, 13], [10, 17], [9, 20], [7, 5], [7, 16], [5, 8], [5, 19], [4, 12], [3, 16], [2, 9], [1, 14]])),
        terrain("Arcology", [tile(13, 15), tile(3, 3)]),
        terrain("Trench 1x4", [tile(14, 4.5)]),
        terrain("Trench 1x5", [tile(10, 1, 90)]),
      ] },
    ],
    MEDUKETOS: [{ levels: [1, 2, 3, 4], terrains: [
      terrain("Petrified Vent", points([[13, 2], [13, 5], [13, 10], [13, 17], [12, 8], [12, 19], [11, 6], [10, 3], [10, 18], [9, 5], [7, 18], [6, 2], [6, 14], [5, 9], [5, 17], [4, 12], [3, 15], [2, 3], [2, 11], [2, 19]])),
      terrain("Arcology", [tile(10, 12), tile(6, 6)]),
      terrain("Lightwall 1x5", [tile(10, 15, 270, true)]),
      terrain("Trench 1x4", [tile(3, 5.5)]),
    ] }],
    UR_FLEECE: [{ levels: [1], terrains: [
      terrain("Black Abyss", [tile(12, 3), tile(9, 11), tile(6, 15), tile(3, 7)]),
      terrain("Trench Left 1x1", [tile(14, 1, 0)]),
      terrain("Trench Right 1x1", [tile(14, 20, 0)]),
      terrain("Trench 1x4", [tile(14, 8.5), tile(14, 17.5)]),
      terrain("Trench 1x5", [tile(14, 4), tile(14, 13)]),
      terrain("Track Tile 1x1", [tile(1, 1), tile(1, 20, 0)]),
      terrain("Track Tile 2 1x4", [tile(1, 12.5, 0)]),
      terrain("Track Tile 3 1x4", [tile(1, 8.5, 0)]),
      terrain("Track Tile 1 1x5", [tile(1, 17, 0)]),
      terrain("Track Tile 4 1x5", [tile(1, 4, 0)]),
    ] }],
    TITAN_X: [
      { id: "the-devil-himself", label: "The Devil Himself", levels: [1, 2, 3, 4], terrains: [] },
      { id: "the-devil-himself", label: "The Devil Himself", levels: [5, 6, 7], terrains: [] },
      { id: "the-devil-himself", label: "The Devil Himself", levels: [8], terrains: [] },
      { id: "thicker-than-water", label: "Thicker Than Water", levels: [1], terrains: [] },
    ],
    SUN_DESCENDANT: [{ levels: [1, 2], terrains: [
      terrain("Black Glacier 1x5", [tile(4, 7, 270), tile(7, 14), tile(8, 6, 0)]),
      terrain("Floating Rocks", [tile(1.5, 12.5), tile(12.5, 8.5)]),
      terrain("Black Iceberg", points([[4, 8], [4, 13], [5, 15], [6, 6], [6, 12], [9, 9], [9, 14], [11, 4], [11, 6], [11, 13]])),
    ] }],
  };
  setups.THE_NIETZSCHEAN = setups.THE_NIETZSCJEAN;

  const initialPositions = {
    HEKATON: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[5, 13], [6, 14], [9, 7], [10, 8]] },
    LABYRINTHAUROS: { apostle: { row: 7.5, column: 3.5, width: 2, height: 2, rotation: 90 }, titans: [[6, 9], [6, 12], [9, 9], [9, 12]] },
    HERMESIAN_PURSUER: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[5, 8], [5, 13], [10, 8], [10, 13]] },
    ALPHA_TEMENOS: { apostle: { row: 7, column: 11, width: 3, height: 3, rotation: 0, facing: "random" }, titans: [[4, 8], [4, 14], [10, 8], [10, 14]] },
    CHIMERA_METASTASIOS: { apostle: { row: 7, column: 11, width: 3, height: 3, rotation: 0, facing: "random" }, titans: [[4, 12], [5, 13], [9, 9], [10, 10]] },
    CYCLONUS: { apostle: { row: 8.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[6, 8], [6, 13], [11, 8], [11, 13]] },
    THE_BURDEN: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 270 }, titans: [[6, 3], [7, 3], [8, 3], [9, 3]] },
    THE_NIETZSCJEAN: { apostle: { row: 7.5, column: 14.5, width: 2, height: 2, rotation: 270 }, titans: [[6, 10], [7, 10], [8, 10], [9, 10]] },
    HYPERTIME_ORACLE: { apostle: { row: 7.5, column: 13.5, width: 2, height: 2, rotation: 270 }, titans: [[5, 9], [6, 9], [9, 9], [10, 9]] },
    ICARIAN_HARPY: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[5, 13], [6, 14], [9, 7], [10, 8]] },
    SUN_DESCENDANT: { apostle: { row: 8, column: 2, width: 3, height: 3, rotation: 90 }, titans: [[7, 10], [7, 11], [8, 10], [8, 11]] },
    // Cycle IV-V positions are read from the storybook diagrams (A at the bottom, N at the top).
    MIDASCORE: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[11, 9], [11, 13], [3, 9], [3, 13]] },
    DEMIDJINN: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[11, 9], [11, 12], [4, 9], [4, 12]] },
    THE_BABELIAN_LUNACY: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[12, 10], [8, 15], [7, 6], [3, 11]] },
    DAHAKA: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[11, 9], [11, 12], [4, 9], [4, 12]] },
    DRAGON_OF_PHOBOS: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[10, 8], [11, 12], [6, 14], [4, 9]] },
    MEDUKETOS: { apostle: null, titans: [[11, 7], [11, 18], [5, 8], [4, 15]] },
    UR_FLEECE: { apostle: { row: 6, column: 15, width: 3, height: 3, rotation: 90 }, titans: [[9, 18], [8, 19], [5, 19], [4, 18]] },
    TITAN_X: { apostle: { row: 7, column: 10, width: 1, height: 1, rotation: 0, facing: "random" }, titans: [[9, 8], [10, 13], [4, 7], [5, 12]] },
  };
  initialPositions.THE_NIETZSCHEAN = initialPositions.THE_NIETZSCJEAN;

  const setupPositionOverrides = {
    DAHAKA: {
      "reap-the-whirlwind": [{ levels: [1], ...initialPositions.DAHAKA }],
      "the-winnowing": [{
        levels: [1],
        apostle: { row: 7.5, column: 6.5, width: 2, height: 2, rotation: 0, facing: "random" },
        titans: [[10, 10], [9, 11], [6, 11], [5, 10]],
      }],
    },
    TITAN_X: {
      "the-devil-himself": [
        { levels: [1, 2, 3, 4], ...initialPositions.TITAN_X },
        {
          levels: [5, 6, 7],
          apostle: { row: 7, column: 10, width: 1, height: 1, rotation: 0, facing: "random" },
          titans: [[9, 8], [8, 9], [6, 9], [5, 8]],
        },
        {
          levels: [8],
          apostle: { row: 7, column: 20, width: 1, height: 1, rotation: 0, facing: "random" },
          titans: [[9, 18], [8, 19], [6, 19], [5, 18]],
        },
      ],
      "thicker-than-water": [{ levels: [1], ...initialPositions.TITAN_X }],
    },
  };

  const setupFacingOverrides = {
    HEKATON: { ambush: 270 },
    LABYRINTHAUROS: { ambush: 270 },
    THE_BURDEN: { "hardest-to-bear": "random" },
  };

  function levelNumber(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const roman = String(value || "").trim().toUpperCase();
    const values = { I: 1, V: 5, X: 10 };
    let total = 0;
    for (let index = 0; index < roman.length; index += 1) {
      const current = values[roman[index]] || 0;
      const next = values[roman[index + 1]] || 0;
      total += current < next ? -current : current;
    }
    return total || 1;
  }

  function getSetup(apostle, level, setupId) {
    const choices = setups[String(apostle || "").toUpperCase()] || [];
    if (!choices.length) return null;
    const currentLevel = levelNumber(level);
    const requestedChoices = setupId
      ? choices.filter((choice) => choice.id === setupId)
      : choices;
    const candidates = requestedChoices.length ? requestedChoices : choices;
    const exact = candidates.find((choice) => choice.levels.includes(currentLevel));
    if (exact) return exact;
    return candidates
      .filter((choice) => Math.min(...choice.levels) <= currentLevel)
      .sort((a, b) => Math.min(...b.levels) - Math.min(...a.levels))[0]
      || candidates[0];
  }

  function getSetupKey(apostle, level, setupId) {
    const normalizedApostle = String(apostle || "").toUpperCase();
    const setup = getSetup(normalizedApostle, level, setupId);
    if (!setup) return `${normalizedApostle}:manual`;
    return setup.id
      ? `${normalizedApostle}:${setup.id}`
      : `${normalizedApostle}:${setup.levels.join("-")}`;
  }

  function getTiles(apostle, level, setupId) {
    const setup = getSetup(apostle, level, setupId);
    if (!setup) return [];
    return setup.terrains.flatMap((group) => {
      const definition = catalog[group.name];
      if (!definition) return [];
      return group.tiles.map((placement) => ({ ...definition, ...placement, name: group.name }));
    });
  }

  function createBattleMap(apostle, level, setupId) {
    const setup = getSetup(apostle, level, setupId);
    const startLevel = levelNumber(level);
    const apostleFacing = getInitialFacing(apostle, undefined, setup?.id, startLevel);
    return {
      version: 1,
      setupKey: getSetupKey(apostle, level, setup?.id),
      ...(setup?.id ? { setupId: setup.id } : {}),
      startLevel,
      ...(apostleFacing === null ? {} : { apostleFacing }),
      showStarts: true,
      showCoordinates: false,
      terrain: getTiles(apostle, level, setup?.id).map((placement, index) => ({
        id: `initial-${index + 1}`,
        name: placement.name,
        row: placement.row,
        column: placement.column,
        rotation: placement.rotation,
        flipped: placement.flipped === true,
      })),
    };
  }

  function normalizeBattleMap(value, apostle, level) {
    const setup = getSetup(apostle, level, value?.setupId);
    const expectedKey = getSetupKey(apostle, level, setup?.id);
    if (!value || !Array.isArray(value.terrain)) {
      return createBattleMap(apostle, level);
    }
    const terrain = value.terrain.flatMap((placement, index) => {
      const definition = catalog[placement?.name];
      if (!definition) return [];
      return [{
        id: String(placement.id || `terrain-${index + 1}`),
        name: placement.name,
        row: Number(placement.row) || 1,
        column: Number(placement.column) || 1,
        rotation: ((Math.round(Number(placement.rotation) / 90) * 90) % 360 + 360) % 360,
        flipped: placement.flipped === true,
      }];
    });
    const startLevel = levelNumber(value.startLevel ?? level);
    const apostleFacing = getInitialFacing(apostle, value.apostleFacing, setup?.id, startLevel);
    return {
      version: 1,
      setupKey: expectedKey,
      ...(setup?.id ? { setupId: setup.id } : {}),
      startLevel,
      ...(apostleFacing === null ? {} : { apostleFacing }),
      showStarts: value.showStarts !== false,
      showCoordinates: value.showCoordinates === true,
      terrain,
    };
  }

  function getSetupOptions(apostle) {
    const seen = new Set();
    return (setups[String(apostle || "").toUpperCase()] || []).flatMap((choice) => {
      if (!choice.id || seen.has(choice.id)) return [];
      seen.add(choice.id);
      return [{ id: choice.id, label: choice.label || choice.id }];
    });
  }

  function getMapTiles(map) {
    return (map?.terrain || []).flatMap((placement) => {
      const definition = catalog[placement?.name];
      return definition ? [{ ...definition, ...placement }] : [];
    });
  }

  function getTerrainCards(map, assetBase) {
    const base = String(assetBase || "").replace(/\/$/, "");
    const seen = new Set();
    return (map?.terrain || []).flatMap((placement) => {
      const mapping = terrainCardByTerrain[placement?.name];
      if (!mapping) return [];
      const key = placement.flipped === true && mapping.back ? mapping.back : mapping.front;
      if (seen.has(key) || !terrainCardCatalog[key]) return [];
      seen.add(key);
      const card = terrainCardCatalog[key];
      return [{ ...card, src: `${base}/${card.file}?v=${terrainCardVersion}` }];
    });
  }

  function getAssetSources(placement, assetBase) {
    const definition = catalog[placement?.name] || placement || {};
    const useBack = placement?.flipped === true && Boolean(definition.backFile);
    const file = useBack ? definition.backFile : definition.file;
    const base = String(assetBase || "").replace(/\/$/, "");
    const local = /^https?:\/\//i.test(file || "") ? file : `${base}/${file}?v=${assetVersion}`;
    return [local];
  }

  function getInitialPositionDefinition(apostle, level, setupId) {
    const normalizedApostle = String(apostle || "").toUpperCase();
    const base = initialPositions[normalizedApostle];
    const choices = setupPositionOverrides[normalizedApostle]?.[setupId] || [];
    if (!choices.length) return base;
    const currentLevel = levelNumber(level);
    return choices.find((choice) => choice.levels.includes(currentLevel))
      || choices
        .filter((choice) => Math.min(...choice.levels) <= currentLevel)
        .sort((a, b) => Math.min(...b.levels) - Math.min(...a.levels))[0]
      || choices[0]
      || base;
  }

  function getInitialPositions(apostle, level, setupId) {
    const positions = getInitialPositionDefinition(apostle, level, setupId);
    if (!positions) return { apostle: null, titans: [] };
    return {
      apostle: positions.apostle ? { ...positions.apostle } : null,
      titans: positions.titans.map(([row, column], index) => ({ id: `titan-${index + 1}`, label: `T${index + 1}`, row, column })),
    };
  }

  function cardinalFacing(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const normalized = ((numeric % 360) + 360) % 360;
    return normalized % 90 === 0 ? normalized : null;
  }

  function getInitialFacing(apostle, savedFacing, setupId, level) {
    const normalizedApostle = String(apostle || "").toUpperCase();
    const position = getInitialPositionDefinition(normalizedApostle, level, setupId)?.apostle;
    if (!position) return null;
    const setupFacing = setupFacingOverrides[normalizedApostle]?.[setupId];
    const facing = setupFacing ?? position.facing ?? position.rotation;
    if (facing !== "random") return cardinalFacing(facing) ?? 0;
    const saved = cardinalFacing(savedFacing);
    if (saved !== null) return saved;
    return [0, 90, 180, 270][Math.floor(Math.random() * 4)];
  }

  function getFacingLabel(value) {
    return ({ 0: "up", 90: "right", 180: "down", 270: "left" })[cardinalFacing(value)] || "up";
  }

  function footprint(placement) {
    const definition = catalog[placement.name] || placement;
    const quarterTurn = Math.abs(Number(placement.rotation || 0)) % 180 === 90;
    return {
      width: quarterTurn ? definition.height : definition.width,
      height: quarterTurn ? definition.width : definition.height,
    };
  }

  function snapCoordinate(value, size, maximum) {
    const offset = size % 2 === 0 ? 0.5 : 0;
    const snapped = Math.round(Number(value) - offset) + offset;
    return Math.max((size + 1) / 2, Math.min(maximum - (size - 1) / 2, snapped));
  }

  function snapPlacement(placement, column, row) {
    const size = footprint(placement);
    return {
      ...placement,
      column: snapCoordinate(column, size.width, columns),
      row: snapCoordinate(row, size.height, rows),
    };
  }

  function getTileStyle(placement) {
    return {
      left: `${(placement.column - 0.5) / columns * 100}%`,
      top: `${(rows - placement.row + 0.5) / rows * 100}%`,
      width: `${placement.width / columns * 100}%`,
      height: `${placement.height / rows * 100}%`,
      rotation: `${Number(placement.rotation || 0) - 180}deg`,
    };
  }

  function getTileFlipTransform(placement) {
    return placement?.flipped === true ? "scaleX(-1)" : "scaleX(1)";
  }

  return {
    catalog,
    setups,
    createBattleMap,
    footprint,
    getAssetSources,
    getFacingLabel,
    getInitialFacing,
    getInitialPositions,
    getMapTiles,
    getSetupKey,
    getSetupOptions,
    getTerrainCards,
    getTiles,
    getTileFlipTransform,
    getTileStyle,
    levelNumber,
    normalizeBattleMap,
    snapPlacement,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BattleTerrain;
else window.BattleTerrain = BattleTerrain;
