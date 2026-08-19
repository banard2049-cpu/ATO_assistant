const BattleTerrain = (() => {
  const columns = 20;
  const rows = 14;
  const assetVersion = "20260819-crop1";
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
    "Blue Anchor": {
      file: "anchor-blue.jpg",
      width: 1,
      height: 1,
      special: "anchor",
      label: "B",
      color: "#3b82f6",
      glow: "rgba(59, 130, 246, 0.62)",
    },
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
    "Green Anchor": {
      file: "anchor-green.jpg",
      width: 1,
      height: 1,
      special: "anchor",
      label: "G",
      color: "#22c55e",
      glow: "rgba(34, 197, 94, 0.58)",
    },
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
    "Red Anchor": {
      file: "anchor-red.jpg",
      width: 1,
      height: 1,
      special: "anchor",
      label: "R",
      color: "#ef4444",
      glow: "rgba(239, 68, 68, 0.62)",
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
    "Yellow Anchor": {
      file: "anchor-yellow.png",
      width: 1,
      height: 1,
      special: "anchor",
      label: "Y",
      color: "#facc15",
      glow: "rgba(250, 204, 21, 0.58)",
    },
  };

  // C5 terrain cards: Arcology and all Lightwall shapes have Light 1 with
  // Omnilight, so each outer edge emits one orthogonal cell of light.
  const terrainLightProfiles = {
    "Arcology": { range: 1 },
    "Lightwall 1x1": { range: 1 },
    "Lightwall 1x4": { range: 1 },
    "Lightwall 1x5": { range: 1 },
  };
  const lightVoidTerrain = new Set([
    "Trench Left 1x1",
    "Trench Right 1x1",
    "Trench 1x4",
    "Trench 1x5",
  ]);

  // ---------------------------------------------------------------------------
  // Line-of-sight (视线 / LoS) occlusion data. See P38 of the rulebook.
  // Only two things block LoS: "Obscuring" (遮蔽) terrain tiles, and the red
  // walls that appear exclusively on the Labyrinth (大迷宫) tiles. Obstacle /
  // Chasm / Cover terrain does NOT block LoS.
  //
  // `redLines` are expressed in LOCAL, unrotated, unflipped tile coordinates:
  //   origin at the bottom-left corner of the tile's (catalog width × height)
  //   footprint, x increasing to the right (0..width), y increasing upward
  //   (0..height). Each entry is a unit-length axis-aligned edge on the integer
  //   lattice: [x0, y0, x1, y1]. battle_los.js applies the placement's rotation
  //   and flip when projecting these onto the board.
  // ---------------------------------------------------------------------------
  const obscuringTerrain = new Set([
    "Abandoned Temple", "Ambrosia Cloud", "Ambrosia Elephant", "Arcology",
    "Black Abyss", "Black Iceberg", "Giant Black Iceberg",
    "Cliff I", "Cliff L", "Cliff O", "Cliff Z", "Column",
    "Krypteia Outpost", "Floating Rocks", "Fortified City", "Giant Shell",
    "Graveyard Of The Frail", "Hyperborean Ruins", "Inkblot", "Irem City",
    "Irem Tower", "Maze Outcrop", "Petrified Vent", "School Of Creatures",
    "Spot of Nothingness", "Staircase Entrance", "Time-Frozen City",
    "Windblighted Fleet", "Wishstorm",
  ]);

  // Elevated 高地 (循环Ⅳ+): read off the terrain description cards' keyword lines.
  // A unit standing on an Elevated tile ignores every other tile's Obscuring /
  // Obstacle keywords (循环Ⅳ 特别规则). Note Trireme Graveyard is Elevated but not
  // Obscuring — it grants high ground without blocking LoS itself.
  const elevatedTerrain = new Set([
    "Floating Rocks",       // 障碍. 遮蔽. 不可摧毁. 高地.
    "Irem City",            // 不可摧毁. 遮蔽. 高地. 掩体.
    "Irem Tower",           // 变位. 遮蔽. 障碍. 高地.
    "Staircase Entrance",   // 遮蔽. 障碍. 高地. 不可摧毁.
    "Trireme Graveyard",    // 可摧毁. 障碍. 高地.
    "Windblighted Fleet",   // 变位. 遮蔽. 高地. 有人居住. 云层.
    "Wishstorm",            // 遮蔽. 云层. 陷阱. 宝藏. 高地.
  ]);

  // Cloud 云层: "此地形板块不受其他高地地形板块影响（即此地形板块不会失去其遮蔽或
  // 障碍关键词）" — a Cloud tile sits at the same altitude as high ground, so an
  // Elevated source still cannot see through it. Ambrosia Cloud / Inkblot print
  // Cloud as a bold rules ability rather than in the keyword line.
  const cloudTerrain = new Set([
    "Ambrosia Cloud",       // 神浆. 遮蔽. + Cloud 云层
    "Inkblot",              // 神浆. 遮蔽. + Cloud 云层
    "Windblighted Fleet",   // 云层 in keyword line
    "Wishstorm",            // 云层 in keyword line
  ]);

  // Red-wall edge lists per Labyrinth tile (local coordinates, see note above).
  const labyrinthRedLines = {
    // I (4×1): walls along the full top (y=1) and bottom (y=0); ends open.
    "Labyrinth I": [
      [0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [3, 0, 4, 0],
      [0, 1, 1, 1], [1, 1, 2, 1], [2, 1, 3, 1], [3, 1, 4, 1],
    ],
    // O (2×2): spiral. Outer wall on top + left; the bottom-right cell (1,0) is
    // fully boxed in. Green openings (no wall): bottom-left [0,0-1,0] and the
    // upper-right edge [2,1-2,2].
    "Labyrinth O": [
      [0, 2, 1, 2], [1, 2, 2, 2],          // top edge
      [0, 0, 0, 1], [0, 1, 0, 2],          // left edge
      [1, 0, 2, 0],                        // bottom of enclosed BR cell (1,0)
      [2, 0, 2, 1],                        // right of BR cell, lower half
      [1, 0, 1, 1],                        // inner wall (left of BR cell)
      [1, 1, 2, 1],                        // inner wall (top of BR cell)
    ],
    // L (3×2): perimeter of cells (0,0)(1,0)(2,0)(2,1), per-edge red/green.
    // Green openings (no wall): left of (0,0) [0,0-0,1] and top of (2,1) [2,2-3,2].
    "Labyrinth L": [
      [0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0],   // bottom
      [0, 1, 1, 1], [1, 1, 2, 1],                  // top over row 0
      [3, 0, 3, 1],                                // right of (2,0)
      [2, 1, 2, 2], [3, 1, 3, 2],                  // left + right of (2,1)
    ],
    // Z (3×2): perimeter of cells (0,0)(1,0)(1,1)(2,1), per-edge red/green.
    // Green openings (no wall): left of (0,0) [0,0-0,1] and right of (2,1) [3,1-3,2].
    "Labyrinth Z": [
      [0, 0, 1, 0], [1, 0, 2, 0],                  // bottom of row 0
      [0, 1, 1, 1],                                // top of (0,0)
      [2, 0, 2, 1],                                // right of (1,0)
      [1, 1, 1, 2], [1, 2, 2, 2],                  // left + top of (1,1)
      [2, 1, 3, 1],                                // bottom of (2,1)
      [2, 2, 3, 2],                                // top of (2,1)
    ],
  };

  // 大迷宫的**实际占格**（局部坐标，原点=footprint 左下，(x,y)=格的左下角）。I/O
  // 填满各自的矩形包围盒，L/Z 是 3×2 盒子里只占 4 格的不规则形。两端都在迷宫外时
  // 整块当遮蔽地形（用户 2026-08-19），必须按真实形状而非包围盒，否则 L/Z 会多挡两格。
  // 板块**实际占格**（局部坐标，原点=footprint 左下，(x,y)=格的左下角）。矩形块
  // (I/O) 填满包围盒；L/Z 是 3×2 盒子里只占 4 格的不规则四联骨牌。凡是有此形状的
  // 遮蔽/高地板块，脚印都必须按真实形状取，否则 L/Z 会多挡包围盒里的两个空格。
  // 形状全部由板块美术 PNG 的 alpha 通道逐格核出（2026-08-19）。
  const shapeCells = {
    "Labyrinth I": [[0, 0], [1, 0], [2, 0], [3, 0]],
    "Labyrinth O": [[0, 0], [1, 0], [0, 1], [1, 1]],
    "Labyrinth L": [[0, 0], [1, 0], [2, 0], [2, 1]],
    "Labyrinth Z": [[0, 0], [1, 0], [1, 1], [2, 1]],
    "Cliff L": [[0, 0], [1, 0], [2, 0], [2, 1]],
    "Cliff Z": [[0, 0], [1, 0], [1, 1], [2, 1]],
    "Maze Fissure L": [[0, 0], [1, 0], [2, 0], [2, 1]],
    "Maze Fissure Z": [[1, 0], [2, 0], [0, 1], [1, 1]],
    "Black Glacier L": [[0, 0], [1, 0], [2, 0], [0, 1]],
    "Black Glacier Z": [[0, 0], [1, 0], [1, 1], [2, 1]],
    "Spartan River Works Z": [[0, 0], [1, 0], [1, 1], [2, 1]],
  };

  Object.keys(catalog).forEach((name) => {
    const entry = catalog[name];
    const los = {};
    if (name === "City") {
      // Front face (city) is Obscuring; back face (ruined-city) is not.
      los.obscuring = { front: true, back: false };
    } else {
      los.obscuring = obscuringTerrain.has(name);
    }
    // 任何有真实形状的板块（L/Z 四联骨牌等）都按脚印取，不当矩形。遮蔽路径、
    // 高地路径、大迷宫路径共用这份形状。用户 2026-08-19：其他 z/l 形板块同此修改。
    if (shapeCells[name]) los.cells = shapeCells[name];
    if (labyrinthRedLines[name]) {
      los.redLines = labyrinthRedLines[name];
      // 大迷宫板块本体。MAZESENSE 迷宫感应（迷宫机牛 / ALPHA_TEMENOS）无视整块大迷宫，
      // 所以引擎需要能把这些板块单独挑出来。注意「迷宫岩层 Maze Outcrop」「迷宫裂隙
      // Maze Fissure」名字里也有迷宫，但不是大迷宫板块，不在此列。
      los.labyrinth = true;
    }
    if (elevatedTerrain.has(name)) los.elevated = true;
    if (cloudTerrain.has(name)) los.cloud = true;
    entry.los = los;
  });

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
  const c3Anchors = ({ red, blue, green, yellow }) => [
    terrain("Red Anchor", [tile(...red)]),
    terrain("Blue Anchor", [tile(...blue)]),
    terrain("Green Anchor", [tile(...green)]),
    terrain("Yellow Anchor", [tile(...yellow)]),
  ];
  const cloneTerrainGroup = (group) => terrain(group.name, group.tiles.map((placement) => ({ ...placement })));

  const setups = {
    HEKATON: [
      { id: "hekaton-battle", label: "Hekaton Battle", levels: [1, 2, 3], terrains: [
        terrain("Column", [tile(13, 9), tile(13, 12), tile(12, 4), tile(12, 17), tile(10, 6), tile(9, 15), tile(8, 3), tile(8, 18), tile(7, 3), tile(7, 18), tile(6, 6), tile(5, 15), tile(3, 4), tile(3, 17), tile(2, 9), tile(2, 12)]),
        terrain("City", [tile(10, 4), tile(5, 17)]),
      ] },
      { id: "hekaton-battle", label: "Hekaton Battle", levels: [4, 5, 6, 7], terrains: [
        terrain("Column", [tile(13, 12), tile(12, 4), tile(12, 17), tile(10, 6), tile(9, 15), tile(8, 18), tile(6, 6), tile(5, 15), tile(3, 4), tile(3, 17), tile(2, 9)]),
        terrain("City", [tile(10, 4), tile(5, 17)]),
        terrain("Maze Fissure O", [tile(12.5, 8.5)]),
        terrain("Maze Fissure I", [tile(6.5, 3, 90), tile(7, 16.5)]),
        // 用户 2026-08-19 在 TTS 版图手动修正：该 Maze Fissure L 需翻面。
        terrain("Maze Fissure L", [tile(8, 9.5, 270, true), tile(2.5, 13)]),
      ] },
      { id: "hekaton-battle", label: "Hekaton Battle", levels: [8], terrains: [
        terrain("Column", [tile(13, 12), tile(12, 3), tile(12, 17), tile(10, 5), tile(9, 15), tile(8, 18), tile(5, 15), tile(3, 4), tile(3, 17), tile(2, 9)]),
        terrain("City", [tile(10, 3), tile(5, 17)]),
        terrain("Labyrinth I", [tile(6.5, 2, 270), tile(7, 16.5, 0)]),
        terrain("Labyrinth L", [tile(8, 9.5, 90), tile(2.5, 13, 0, true)]),
        terrain("Labyrinth O", [tile(12.5, 7.5, 0)]),
        terrain("Labyrinth Z", [tile(11.5, 14, 0), tile(3.5, 7, 0)]),
      ] },
      { id: "ambush", label: "Ambush", levels: [1], terrains: [
        terrain("Column", [tile(13, 9), tile(12, 12), tile(11, 13), tile(10, 11), tile(9, 15), tile(7, 6), tile(6, 4), tile(6, 15)]),
        terrain("City", [tile(11, 4), tile(4, 4)]),
        terrain("Labyrinth I", [tile(4.5, 12, 270)]),
        // 用户 2026-08-19 在当前快照手动修正：百臂巨人伏击战的 Labyrinth L 需转 90° 且不翻面。
        terrain("Labyrinth L", [tile(9, 7.5, 90)]),
      ] },
      { id: "ambush", label: "Ambush", levels: [4, 5, 6, 7], terrains: [
        terrain("Column", [tile(13, 9), tile(12, 12), tile(11, 13), tile(10, 11), tile(9, 15), tile(7, 6), tile(6, 4), tile(6, 15)]),
        terrain("City", [tile(11, 4), tile(4, 4)]),
        // 用户 2026-08-19 修正：4级百臂巨人伏击战用迷宫裂隙替换大迷宫板块。
        terrain("Maze Fissure I", [tile(4.5, 12, 270)]),
        terrain("Maze Fissure L", [tile(9, 7.5, 90)]),
      ] },
    ],
    LABYRINTHAUROS: [
      { id: "labyrinthauros-battle", label: "Labyrinthauros Battle", levels: [1, 2, 3, 4], terrains: [
        terrain("City", [tile(11, 15), tile(4, 3)]),
        // 用户 2026-08-19 在 TTS 版图手动修正：Labyrinth O 转 180°；Labyrinth L 转 0° 并翻面。
        terrain("Labyrinth O", [tile(9.5, 7.5)]),
        terrain("Labyrinth I", [tile(5, 7.5, 0)]),
        terrain("Labyrinth L", [tile(9.5, 12, 0, true)]),
        terrain("Labyrinth Z", [tile(5, 12.5, 90, true)]),
      ] },
      { id: "ambush", label: "Ambush", levels: [1], terrains: [
        terrain("Column", [tile(13, 9), tile(12, 12), tile(11, 13), tile(10, 11), tile(9, 15), tile(7, 6), tile(6, 4), tile(6, 15)]),
        terrain("City", [tile(11, 4), tile(4, 4)]),
        terrain("Labyrinth I", [tile(4.5, 12, 270)]),
        // 用户 2026-08-19 在当前快照手动修正：机牛伏击战同百臂巨人伏击战，Labyrinth L 转 90° 且不翻面。
        terrain("Labyrinth L", [tile(9, 7.5, 90)]),
      ] },
    ],
    HERMESIAN_PURSUER: [
      { id: "pursuer", label: "Pursuer", levels: [1], terrains: [
        terrain("Column", [tile(13, 9), tile(13, 12), tile(12, 4), tile(12, 15), tile(10, 18), tile(9, 6), tile(9, 15), tile(9, 18), tile(6, 3), tile(6, 6), tile(6, 15), tile(5, 3), tile(4, 5), tile(3, 17), tile(2, 9), tile(2, 12)]),
        terrain("Ambrosia Pool", [tile(10.5, 10.5), tile(7.5, 5.5), tile(7.5, 14.5), tile(2.5, 10.5)]),
      ] },
      { id: "pursuits-end", label: "Pursuit's End", levels: [1], terrains: [
        terrain("Column", [tile(13, 12), tile(12, 4), tile(12, 15), tile(10, 18), tile(9, 6), tile(9, 18), tile(6, 6), tile(6, 15), tile(5, 3), tile(4, 5), tile(3, 17), tile(2, 9)]),
        terrain("Ambrosia Pool", [tile(10.5, 10.5), tile(7.5, 8.5), tile(7.5, 12.5), tile(2.5, 10.5)]),
        terrain("Ambrosia Trail", [tile(13, 7), tile(8, 4), tile(4, 15)]),
      ] },
    ],
    ALPHA_TEMENOS: [
      { levels: [1], terrains: [
        terrain("Column", [tile(11, 7), tile(11, 15), tile(10, 5), tile(10, 17), tile(4, 5), tile(4, 17), tile(3, 7), tile(3, 15)]),
        terrain("City", [tile(12, 5), tile(2, 17)]),
        // 用户 2026-08-19 在当前快照手动修正：吞域兽起始大迷宫朝向。
        terrain("Labyrinth O", [tile(12.5, 12.5, 180)]),
        terrain("Labyrinth I", [tile(7, 7.5)]),
        terrain("Labyrinth L", [tile(7.5, 14, 180)]),
        terrain("Labyrinth Z", [tile(2.5, 10, 0, true)]),
      ] },
    ],
    CHIMERA_METASTASIOS: [
      { levels: [1, 2], terrains: [
        terrain("Column", [tile(12, 16), tile(7, 17), tile(5, 9), tile(2, 6)]),
        terrain("Ambrosia Pool", [tile(11.5, 2.5), tile(2.5, 17.5)]),
        terrain("Fortified City", [tile(9, 16), tile(4, 5)]),
      ] },
      { levels: [3, 4], terrains: [
        terrain("Column", [tile(12, 4), tile(12, 16), tile(10, 18), tile(8, 1), tile(7, 17), tile(5, 9), tile(2, 6)]),
        terrain("Ambrosia Pool", [tile(11.5, 2.5), tile(10.5, 8.5), tile(7.5, 2.5), tile(3.5, 13.5), tile(2.5, 17.5)]),
        terrain("Fortified City", [tile(9, 16), tile(4, 5)]),
        terrain("Spartan River Works 1x4", [tile(12.5, 15, 270), tile(2.5, 16, 90)]),
        terrain("Spartan River Works 1x5", [tile(12, 5, 90), tile(3, 7, 270)]),
      ] },
    ],
    CYCLONUS: [
      { levels: [1, 2, 3, 4, 5, 6, 7], terrains: [
        terrain("Fortified City", [tile(13, 14), tile(4, 7)]),
        terrain("Spartan River Works 1x1 End", [tile(2, 10, 90), tile(1, 10, 90)]),
        terrain("Spartan River Works 1x1 Corner", [tile(9, 5, 270), tile(10, 20), tile(9, 20, 90)]),
        terrain("Spartan River Works 1x4", [tile(12.5, 16, 270), tile(9, 2.5, 0), tile(2.5, 16, 270), tile(6.5, 16, 90)]),
        terrain("Spartan River Works 1x5", [tile(12, 10, 270), tile(3, 5, 90), tile(5, 10, 270)]),
      ] },
      { levels: [8], terrains: [
        terrain("Fortified City", [tile(13, 14), tile(4, 7)]),
        terrain("Spartan River Works 1x1 End", [tile(1, 10, 90), tile(1, 16, 270)]),
        terrain("Spartan River Works 1x1 Corner", [tile(10, 20), tile(9, 5, 270), tile(9, 20, 90)]),
        terrain("Spartan River Works Z", [tile(2, 5.5, 90)]),
        terrain("Spartan River Works 1x4", [tile(12.5, 16, 90), tile(3.5, 16, 90), tile(9, 2.5, 0), tile(7.5, 10, 270), tile(3.5, 10, 90)]),
        terrain("Spartan River Works 1x5", [tile(12, 10, 270), tile(6, 5, 90), tile(8, 16, 90)]),
      ] },
    ],
    THE_BURDEN: [
      { id: "burden-battle", label: "Burden Battle", levels: [1, 2, 3, 4], terrains: [
        terrain("Column", [tile(14, 7), tile(11, 8), tile(11, 12), tile(10, 15), tile(9, 1), tile(6, 11), tile(5, 16), tile(4, 10), tile(1, 4)]),
        terrain("Cliff L", [tile(13.5, 9, 0, true), tile(4, 1.5, 270, true), tile(1.5, 10, 180)]),
        terrain("Cliff Z", [tile(12.5, 12, 180, true), tile(11.5, 19, 180, true), tile(11, 3.5, 270), tile(2.5, 12), tile(3.5, 19)]),
        terrain("Cliff I", [tile(12, 15.5), tile(3, 15.5), tile(6.5, 5, 90), tile(2.5, 7, 90)]),
        terrain("Cliff O", [tile(8.5, 8.5), tile(8.5, 14.5), tile(7.5, 17.5)]),
      ] },
      { id: "burden-battle", label: "Burden Battle", levels: [5], terrains: [
        terrain("Column", [tile(14, 7), tile(11, 8), tile(10, 15), tile(9, 1), tile(6, 11), tile(5, 16), tile(4, 10), tile(1, 4)]),
        terrain("Black Glacier 1x5", [tile(11, 15), tile(5, 8), tile(4, 13)]),
        terrain("Black Lake", [tile(10, 6), tile(8, 3)]),
        terrain("Cliff L", [tile(13.5, 9, 0), tile(4, 1.5, 270, true), tile(1.5, 9, 180, true)]),
        terrain("Cliff Z", [tile(12.5, 12, 180, true), tile(11.5, 19, 180, true), tile(11, 3.5, 270), tile(2.5, 12), tile(3.5, 19)]),
        terrain("Cliff I", [tile(12, 15.5, 0), tile(3, 15.5, 0), tile(6.5, 5, 90), tile(2.5, 7, 90)]),
        terrain("Cliff O", [tile(8.5, 8.5, 0), tile(8.5, 14.5, 0), tile(7.5, 17.5, 0)]),
      ] },
      { id: "hardest-to-bear", label: "Hardest to Bear", levels: [1], terrains: [
        terrain("Column", [tile(11, 7), tile(11, 17), tile(10, 3), tile(10, 15), tile(8, 2), tile(8, 3), tile(7, 19), tile(6, 2), tile(6, 9), tile(6, 19), tile(5, 2), tile(4, 7), tile(4, 10), tile(4, 15), tile(4, 17), tile(3, 15)]),
        terrain("Black Iceberg", [tile(2, 4), tile(2, 5)]),
        terrain("Cliff L", [tile(13.5, 5, 180), tile(1.5, 7, 0, true)]),
        terrain("Cliff Z", [tile(12.5, 2), tile(2.5, 19, 0), tile(12.5, 19, 180, true), tile(2.5, 2, 180, true)]),
        terrain("Cliff I", [tile(14, 16.5), tile(1, 16.5), tile(11.5, 9, 90), tile(3.5, 12, 90)]),
        terrain("Cliff O", [tile(12.5, 11.5), tile(7.5, 17.5), tile(4.5, 4.5)]),
      ] },
    ],
    THE_NIETZSCJEAN: [
      { id: "the-cruel-lesson", label: "The Cruel Lesson", levels: [1], terrains: [
        terrain("Fortified City", [tile(13, 18), tile(3, 6)]),
        terrain("Argo Hull 1x4", [tile(12.5, 1, 90)]),
        terrain("Argo Hull 1x5", [tile(8, 1, 90), tile(3, 1, 90)]),
        terrain("Spartan River Works 1x1 End", [tile(1, 10, 0)]),
        terrain("Spartan River Works 1x1 Corner", [tile(1, 16, 90)]),
        terrain("Spartan River Works 1x4", [tile(12.5, 16, 270), tile(3.5, 16, 90)]),
        terrain("Spartan River Works 1x5", [tile(8, 16, 90), tile(1, 7), tile(1, 13)]),
      ] },
      { id: "what-are-you", label: "What Are You?", levels: [1], terrains: [
        terrain("Fortified City", [tile(12, 11), tile(7, 17), tile(3, 13)]),
        terrain("Argo Hull 1x4", [tile(12.5, 1, 90)]),
        terrain("Argo Hull 1x5", [tile(8, 1, 90), tile(3, 1, 90)]),
        terrain("Spartan River Works 1x1 End", [tile(14, 15), tile(1, 15, 0)]),
        terrain("Spartan River Works 1x1 Corner", [tile(14, 16, 270), tile(1, 16, 0)]),
        terrain("Spartan River Works 1x4", [tile(14, 7.5, 0), tile(3.5, 16, 90), tile(1, 3.5), tile(1, 12.5), tile(14, 3.5)]),
        terrain("Spartan River Works 1x5", [tile(14, 12, 0), tile(11, 16, 90), tile(1, 8)]),
      ] },
    ],
    HYPERTIME_ORACLE: [
      { levels: [1, 2], terrains: [
        terrain("Black Iceberg", [tile(12, 8), tile(11, 10), tile(10, 6), tile(10, 14), tile(8, 9), tile(4, 11), tile(2, 13)]),
        terrain("City", [tile(13, 16), tile(2, 18)]),
        terrain("Time-Frozen City", [tile(13, 16), tile(2, 18)]),
        terrain("Timefront 1x4", [tile(12.5, 1, 90)]),
        terrain("Timefront 1x5", [tile(8, 1, 90), tile(3, 1, 90)]),
        ...c3Anchors({ red: [12, 7], blue: [3, 11], green: [12, 10], yellow: [10, 5] }),
      ] },
      { levels: [3, 4, 5], terrains: [
        terrain("Black Iceberg", [tile(12, 8), tile(11, 10), tile(11, 16), tile(10, 14), tile(9, 17), tile(8, 9), tile(7, 18), tile(6, 12), tile(4, 11), tile(2, 13)]),
        terrain("Giant Black Iceberg", [tile(4.5, 16.5)]),
        terrain("City", [tile(13, 19), tile(2, 18)]),
        terrain("Time-Frozen City", [tile(13, 19), tile(2, 18)]),
        terrain("Timefront 1x4", [tile(12.5, 1, 90)]),
        terrain("Timefront 1x5", [tile(8, 1, 90), tile(3, 1, 90)]),
        ...c3Anchors({ red: [12, 7], blue: [3, 11], green: [12, 10], yellow: [11, 14] }),
      ] },
    ],
    ICARIAN_HARPY: [
      { levels: [1, 2, 3, 4, 5], terrains: [
        terrain("Black Iceberg", [tile(13, 12), tile(12, 4), tile(12, 17), tile(10, 6), tile(9, 15), tile(8, 3), tile(6, 6), tile(3, 17), tile(2, 9), tile(2, 12)]),
        terrain("Giant Black Iceberg", [tile(8.5, 13.5), tile(7.5, 18.5), tile(4.5, 6.5)]),
        terrain("City", [tile(12, 6), tile(5, 4)]),
        terrain("Time-Frozen City", [tile(12, 6), tile(5, 4)]),
        terrain("Black Lake", [tile(7, 10), tile(5, 16)]),
        terrain("Black Glacier 1x5", [tile(10, 12, 270), tile(7, 6, 0), tile(5, 12, 0)]),
        ...c3Anchors({ red: [11, 8], blue: [4, 13], green: [8, 7], yellow: [7, 14] }),
      ] },
    ],
    MIDASCORE: [
      { levels: [1], terrains: [
        terrain("Irem Tower", [tile(13, 4), tile(13, 15), tile(12, 16), tile(11, 11), tile(10, 6), tile(10, 13), tile(9, 20), tile(8, 3), tile(8, 15), tile(7, 19), tile(6, 9), tile(5, 2), tile(5, 6), tile(5, 11), tile(3, 13), tile(2, 2), tile(2, 9), tile(2, 20), tile(1, 3), tile(1, 14)]),
        terrain("Irem City", [tile(10, 4), tile(5, 16)]),
      ] },
      { levels: [2, 3, 4], terrains: [
        terrain("Irem Tower", [tile(13, 4), tile(13, 15), tile(12, 16), tile(11, 9), tile(11, 13), tile(10, 6), tile(9, 20), tile(8, 3), tile(8, 15), tile(7, 19), tile(6, 9), tile(5, 2), tile(5, 6), tile(5, 11), tile(3, 9), tile(3, 13), tile(3, 20), tile(2, 2), tile(1, 3), tile(1, 14)]),
        terrain("Irem City", [tile(10, 4), tile(5, 16)]),
      ] },
    ],
    DEMIDJINN: [
      { levels: [1, 2, 3, 4], terrains: [
        terrain("Irem Tower", [tile(13, 4), tile(13, 15), tile(12, 17), tile(11, 11), tile(10, 6), tile(10, 13), tile(9, 20), tile(8, 3), tile(8, 15), tile(7, 19), tile(6, 9), tile(5, 2), tile(5, 6), tile(5, 11), tile(3, 13), tile(2, 2), tile(2, 9), tile(1, 3), tile(1, 14)]),
        terrain("Irem City", [tile(10, 4), tile(5, 16)]),
      ] },
    ],
    THE_BABELIAN_LUNACY: [
      { levels: [1], terrains: [
        terrain("Irem Tower", [tile(14, 11), tile(13, 4), tile(13, 15), tile(12, 10), tile(12, 16), tile(11, 12), tile(10, 6), tile(9, 20), tile(8, 3), tile(8, 15), tile(7, 6), tile(7, 19), tile(6, 9), tile(5, 2), tile(5, 6), tile(5, 10), tile(3, 11), tile(3, 20), tile(2, 2), tile(1, 3)]),
        terrain("Irem City", [tile(10, 4), tile(5, 16)]),
      ] },
    ],
    DAHAKA: [
      { id: "reap-the-whirlwind", label: "Reap the Whirlwind", levels: [1], terrains: [
        terrain("Argo Hull 1x4", [tile(12.5, 1, 90)]),
        terrain("Argo Hull 1x5", [tile(8, 1, 90), tile(3, 1, 90)]),
        terrain("Irem Tower", [tile(13, 4), tile(12, 16), tile(11, 11), tile(10, 7), tile(10, 13), tile(10, 17), tile(9, 20), tile(8, 3), tile(8, 15), tile(7, 19), tile(6, 9), tile(5, 2), tile(5, 6), tile(5, 11), tile(4, 6), tile(3, 13), tile(2, 9), tile(2, 20), tile(1, 3), tile(1, 14)]),
        terrain("Ambrosia Cloud", [tile(12, 14), tile(10, 5), tile(4, 15), tile(2, 5)]),
        terrain("Abandoned Temple", [tile(13.5, 19.5)]),
      ] },
      { id: "the-winnowing", label: "The Winnowing", levels: [1], terrains: [
        terrain("Irem Tower", [tile(13, 4), tile(13, 17), tile(11, 11), tile(10, 1), tile(10, 7), tile(10, 13), tile(10, 17), tile(9, 20), tile(8, 3), tile(8, 15), tile(7, 3), tile(7, 19), tile(5, 2), tile(5, 11), tile(5, 16), tile(3, 13), tile(2, 9), tile(2, 20), tile(1, 3), tile(1, 14)]),
        terrain("Irem City", [tile(12, 15), tile(5, 7)]),
        terrain("Ambrosia Cloud", [tile(13, 10), tile(10, 5), tile(7, 17), tile(2, 5)]),
        terrain("Abandoned Temple", [tile(3.5, 1.5)]),
      ] },
    ],
    DRAGON_OF_PHOBOS: [
      { levels: [1, 2], terrains: [
        terrain("Petrified Vent", [tile(13, 19), tile(12, 16), tile(12, 18), tile(11, 11), tile(10, 7), tile(10, 13), tile(10, 17), tile(9, 15), tile(9, 20), tile(8, 17), tile(7, 19), tile(5, 6), tile(5, 8), tile(3, 8), tile(3, 11), tile(3, 14), tile(2, 9), tile(2, 16), tile(1, 14)]),
        terrain("Arcology", [tile(13, 14), tile(3, 3)]),
        terrain("Black Abyss", [tile(4, 19)]),
        terrain("Lightwall 1x4", [tile(5, 2.5)]),
        terrain("Lightwall 1x5", [tile(1, 11)]),
        terrain("Trench 1x4", [tile(14, 4.5)]),
        terrain("Trench 1x5", [tile(10, 1, 90)]),
      ] },
      { levels: [3, 4], terrains: [
        terrain("Petrified Vent", [tile(13, 19), tile(12, 10), tile(11, 5), tile(10, 13), tile(10, 17), tile(9, 20), tile(7, 5), tile(7, 16), tile(5, 8), tile(5, 19), tile(4, 12), tile(3, 16), tile(2, 9), tile(1, 14)]),
        terrain("Arcology", [tile(13, 15), tile(3, 3)]),
        terrain("Trench 1x4", [tile(14, 4.5)]),
        terrain("Trench 1x5", [tile(10, 1, 90)]),
      ] },
    ],
    MEDUKETOS: [
      { levels: [1, 2, 3, 4], terrains: [
        terrain("Petrified Vent", [tile(13, 2), tile(13, 5), tile(13, 10), tile(13, 17), tile(12, 8), tile(12, 19), tile(11, 6), tile(10, 3), tile(10, 18), tile(9, 5), tile(7, 18), tile(6, 2), tile(6, 14), tile(5, 9), tile(5, 17), tile(4, 12), tile(3, 15), tile(2, 3), tile(2, 11), tile(2, 19)]),
        terrain("Arcology", [tile(10, 12), tile(6, 6)]),
        terrain("Lightwall 1x5", [tile(10, 15)]),
        terrain("Trench 1x4", [tile(3, 5.5)]),
      ] },
    ],
    UR_FLEECE: [
      { levels: [1], terrains: [
        terrain("Black Abyss", [tile(12, 3), tile(9, 11), tile(6, 15), tile(3, 7)]),
        terrain("Trench Left 1x1", [tile(14, 1, 0)]),
        terrain("Trench Right 1x1", [tile(14, 20, 0)]),
        terrain("Trench 1x4", [tile(14, 8.5), tile(14, 17.5)]),
        terrain("Trench 1x5", [tile(14, 4), tile(14, 13)]),
        terrain("Track Tile 1x1", [tile(1, 1), tile(1, 20, 0)]),
        terrain("Track Tile 2 1x4", [tile(1, 12.5)]),
        terrain("Track Tile 3 1x4", [tile(1, 8.5)]),
        terrain("Track Tile 1 1x5", [tile(1, 17)]),
        terrain("Track Tile 4 1x5", [tile(1, 4)]),
      ] },
    ],
    TITAN_X: [
      { id: "the-devil-himself", label: "The Devil Himself", levels: [1, 2, 3, 4], terrains: [] },
      { id: "the-devil-himself", label: "The Devil Himself", levels: [5, 6, 7], terrains: [] },
      { id: "the-devil-himself", label: "The Devil Himself", levels: [8], terrains: [] },
      { id: "thicker-than-water", label: "Thicker Than Water", levels: [1], terrains: [] },
    ],
    SUN_DESCENDANT: [
      { levels: [1, 2], terrains: [
        terrain("Black Iceberg", [tile(11, 4), tile(11, 6), tile(11, 13), tile(9, 9), tile(9, 14), tile(6, 6), tile(6, 12), tile(5, 15), tile(4, 8), tile(4, 13)]),
        terrain("Floating Rocks", [tile(12.5, 8.5), tile(1.5, 12.5)]),
        terrain("Black Glacier 1x5", [tile(8, 6, 0), tile(7, 14, 0), tile(4, 7, 270)]),
        ...c3Anchors({ red: [10, 6], blue: [5, 13], green: [5, 8], yellow: [10, 13] }),
      ] },
    ],
  };
  setups.THE_NIETZSCHEAN = setups.THE_NIETZSCJEAN;
  const initialPositions = {
    HEKATON: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[5, 13], [6, 14], [9, 7], [10, 8]] },
    LABYRINTHAUROS: { apostle: { row: 7.5, column: 3.5, width: 2, height: 2, rotation: 90 }, titans: [[6, 9], [6, 12], [9, 9], [9, 12]] },
    HERMESIAN_PURSUER: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[5, 8], [5, 13], [10, 8], [10, 13]] },
    ALPHA_TEMENOS: { apostle: { row: 7, column: 11, width: 3, height: 3, rotation: 0, facing: "random" }, titans: [[4, 8], [4, 14], [10, 8], [10, 14]] },
    CHIMERA_METASTASIOS: { apostle: { row: 7, column: 11, width: 3, height: 3, rotation: 0, facing: "random" }, titans: [[4, 12], [5, 13], [9, 9], [10, 10]] },
    CYCLONUS: { apostle: { row: 8.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[6, 8], [6, 13], [11, 8], [11, 13]] },
    THE_BURDEN: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 270, facing: 270 }, titans: [[6, 3], [7, 3], [8, 3], [9, 3]] },
    THE_NIETZSCJEAN: { apostle: { row: 7.5, column: 14.5, width: 2, height: 2, rotation: 270, facing: 270 }, titans: [[6, 10], [7, 10], [8, 10], [9, 10]] },
    HYPERTIME_ORACLE: { apostle: { row: 7.5, column: 13.5, width: 2, height: 2, rotation: 270 }, titans: [[5, 9], [6, 9], [9, 9], [10, 9]] },
    ICARIAN_HARPY: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[5, 13], [6, 14], [9, 7], [10, 8]] },
    SUN_DESCENDANT: { apostle: { row: 8, column: 2, width: 3, height: 3, rotation: 90, facing: 90 }, titans: [[7, 10], [7, 11], [8, 10], [8, 11]] },
    // Cycle IV-V positions are read from the storybook diagrams (A at the bottom, N at the top).
    // 迈达狮面板图示是 3x3（后方 3 个 R 格），此前误记为 2x2。
    MIDASCORE: { apostle: { row: 7, column: 11, width: 3, height: 3, rotation: 0, facing: "random" }, titans: [[11, 9], [11, 13], [3, 9], [3, 13]] },
    DEMIDJINN: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[11, 9], [11, 12], [4, 9], [4, 12]] },
    THE_BABELIAN_LUNACY: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[12, 10], [8, 15], [7, 6], [3, 11]] },
    DAHAKA: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[11, 9], [11, 12], [4, 9], [4, 12]] },
    DRAGON_OF_PHOBOS: { apostle: { row: 7.5, column: 10.5, width: 2, height: 2, rotation: 0, facing: "random" }, titans: [[10, 8], [11, 12], [6, 14], [4, 9]] },
    MEDUKETOS: { apostle: null, titans: [[11, 7], [11, 18], [5, 8], [4, 15]] },
    UR_FLEECE: { apostle: { row: 6, column: 15, width: 3, height: 3, rotation: 90 }, titans: [[9, 18], [8, 19], [5, 19], [4, 18]] },
    TITAN_X: { apostle: { row: 7, column: 10, width: 1, height: 1, rotation: 0, facing: "random" }, titans: [[9, 8], [10, 13], [4, 7], [5, 12]] },
  };
  initialPositions.THE_NIETZSCHEAN = initialPositions.THE_NIETZSCJEAN;

  const labyrinthaurosBattleInitialPositions = {
    startOptions: [
      {
        id: "A",
        apostle: { row: 7.5, column: 3.5, width: 2, height: 2, rotation: 90, facing: 90 },
      },
      {
        id: "B",
        apostle: { row: 7.5, column: 17.5, width: 2, height: 2, rotation: 270, facing: 270 },
      },
    ],
    titans: [[6, 9], [6, 12], [9, 9], [9, 12]],
  };

  const ambushInitialPositions = {
    apostle: { row: 7.5, column: 15.5, width: 2, height: 2, rotation: 0 },
    titans: [[8, 10], [8, 11], [7, 9], [7, 11]],
  };

  const setupPositionOverrides = {
    HEKATON: {
      ambush: [{ levels: [1], ...ambushInitialPositions }],
    },
    LABYRINTHAUROS: {
      "labyrinthauros-battle": [{ levels: [1, 2, 3, 4], ...labyrinthaurosBattleInitialPositions }],
      ambush: [{ levels: [1], ...ambushInitialPositions }],
    },
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
    THE_BURDEN: {
      "hardest-to-bear": [{
        levels: [1],
        apostle: { ...initialPositions.THE_BURDEN.apostle },
        titans: [[9, 8], [9, 13], [6, 8], [6, 13]],
      }],
    },
  };

  const setupFacingOverrides = {
    HEKATON: { ambush: 270 },
    LABYRINTHAUROS: { ambush: 270 },
    THE_BURDEN: { "hardest-to-bear": "random" },
  };

  // 使徒基本数据 —— 逐张读自使徒面板 aibp/ps/<APOSTLE>/<APOSTLE>.jpg。
  //   size      始徒图示的脚印边长（1/2/3），与图示后方 R 格的个数一致。
  //   speed     按等级的移速（等级框中间那格，靴子图标）。Infinity = ∞；
  //             0 = 面板留空，即不可移动（巴比伦疯塔）。
  //   blindspot 面板基本特质列里有"盲点"划眼图标时为 true。盲区就是图示中同时带
  //             R 与划眼图标的那排格子 —— 正后方紧贴脚印、宽度等于脚印宽度。
  //             P39：盲点与攀爬点永远都不视作在始徒的视线内。
  //   alwaysLos 特质写明"忽略视线遮挡规则（即总是有视线）"。
  //   mazesense 迷宫感应：大迷宫板块不会遮挡该始徒对泰坦的视线。
  const apostleProfiles = {
    LABYRINTHAUROS: { size: 2, speed: { 1: 6, 2: 6, 3: 7, 4: 7 }, blindspot: false, mazesense: true },
    ALPHA_TEMENOS: { size: 3, speed: { 1: 6 }, blindspot: false, mazesense: true },
    CHIMERA_METASTASIOS: { size: 3, speed: { 1: 5, 2: 5, 3: 5, 4: 5 }, blindspot: false },
    CYCLONUS: { size: 2, speed: { 1: 7, 2: 7, 3: 7, 4: 8 }, blindspot: true },
    HEKATON: { size: 2, speed: { 0: 6, 1: 6, 2: 6, 3: 6, 4: 7 }, blindspot: false },
    // 面板印 6*，展翅的末日 WINGED DOOM: 移速为无穷大。
    HERMESIAN_PURSUER: { size: 2, speed: { 1: Infinity }, blindspot: true },
    HYPERTIME_ORACLE: { size: 2, speed: { 1: Infinity, 2: Infinity, 3: Infinity }, blindspot: false },
    ICARIAN_HARPY: { size: 2, speed: { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity, 5: Infinity }, blindspot: true },
    SUN_DESCENDANT: { size: 3, speed: { 1: Infinity, 2: Infinity, 3: Infinity }, blindspot: false },
    THE_BURDEN: { size: 2, speed: { 1: 9 }, blindspot: false },
    THE_NIETZSCJEAN: { size: 2, speed: { 1: 8 }, blindspot: true },
    // 高空黑影 SHADOW IN THE SKIES: 忽略视线遮挡规则。面板图示为 3x3（后方 3 个 R 格）。
    MIDASCORE: { size: 3, speed: { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity }, blindspot: true, alwaysLos: true },
    // 活体龙卷风 LIVING TORNADO: 移速无穷大，且忽略视线遮挡规则。
    DEMIDJINN: { size: 2, speed: { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity }, blindspot: true, alwaysLos: true },
    THE_BABELIAN_LUNACY: { size: 2, speed: { 1: 0 }, blindspot: false },
    // 大漠的飘渺烟雾 DRIFTER OF WASTES: 忽略视线遮挡规则。
    DAHAKA: { size: 2, speed: { 1: Infinity }, blindspot: true, alwaysLos: true },
    DRAGON_OF_PHOBOS: { size: 2, speed: { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity }, blindspot: true },
    MEDUKETOS: { size: 3, speed: { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity }, blindspot: false },
    UR_FLEECE: { size: 3, speed: { 1: Infinity }, blindspot: true },
    // 无视阻碍 NO OBSTACLES: 忽略视线遮挡规则。
    TITAN_X: { size: 1, speed: { 1: Infinity }, blindspot: true, alwaysLos: true },
  };
  apostleProfiles.THE_NIETZSCHEAN = apostleProfiles.THE_NIETZSCJEAN;

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

  function getInitialPositionChoices(apostle, level, setupId) {
    const positions = getInitialPositionDefinition(apostle, level, setupId);
    return Array.isArray(positions?.startOptions) ? positions.startOptions : [];
  }

  function normalizeStartPositionId(apostle, level, setupId, startPositionId) {
    const choices = getInitialPositionChoices(apostle, level, setupId);
    if (!choices.length) return null;
    const requested = String(startPositionId || "");
    return choices.some((choice) => choice.id === requested) ? requested : choices[0].id;
  }

  function randomStartPositionId(apostle, level, setupId) {
    const choices = getInitialPositionChoices(apostle, level, setupId);
    if (!choices.length) return null;
    return choices[Math.floor(Math.random() * choices.length)]?.id || choices[0].id;
  }

  // Time-Frozen City is an overlay: keep a City tile directly underneath it.
  // Normalize saved maps as well as fresh setup data so older campaign state is upgraded.
  function ensureTimeFrozenCityBases(terrain) {
    const positionKey = (placement) => [
      Number(placement.row),
      Number(placement.column),
      ((Math.round(Number(placement.rotation) / 90) * 90) % 360 + 360) % 360,
    ].join("|");
    const frozenKeys = new Set(
      terrain.filter((placement) => placement.name === "Time-Frozen City").map(positionKey)
    );
    const cityByKey = new Map();
    terrain.forEach((placement) => {
      const key = positionKey(placement);
      if (placement.name === "City" && frozenKeys.has(key) && !cityByKey.has(key)) {
        cityByKey.set(key, placement);
      }
    });

    const result = [];
    const inserted = new Set();
    terrain.forEach((placement) => {
      const key = positionKey(placement);
      if (placement.name === "City" && frozenKeys.has(key)) return;
      if (placement.name === "Time-Frozen City" && !inserted.has(key)) {
        result.push(cityByKey.get(key) || {
          id: `${placement.id}-city-base`,
          name: "City",
          row: placement.row,
          column: placement.column,
          rotation: placement.rotation,
          flipped: false,
        });
        inserted.add(key);
      }
      result.push(placement);
    });
    return result;
  }

  function createBattleMap(apostle, level, setupId) {
    const setup = getSetup(apostle, level, setupId);
    const startLevel = levelNumber(level);
    const startPositionId = randomStartPositionId(apostle, startLevel, setup?.id);
    const apostleFacing = getInitialFacing(apostle, undefined, setup?.id, startLevel, startPositionId);
    const terrain = getTiles(apostle, level, setup?.id).map((placement, index) => ({
      id: `initial-${index + 1}`,
      name: placement.name,
      row: placement.row,
      column: placement.column,
      rotation: placement.rotation,
      flipped: placement.flipped === true,
    }));
    return {
      version: 1,
      setupKey: getSetupKey(apostle, level, setup?.id),
      ...(setup?.id ? { setupId: setup.id } : {}),
      startLevel,
      ...(startPositionId ? { startPositionId } : {}),
      ...(apostleFacing === null ? {} : { apostleFacing }),
      showStarts: true,
      showCoordinates: false,
      terrain: ensureTimeFrozenCityBases(terrain),
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
    const startPositionId = normalizeStartPositionId(apostle, startLevel, setup?.id, value.startPositionId);
    const apostleFacing = getInitialFacing(apostle, value.apostleFacing, setup?.id, startLevel, startPositionId);
    return {
      version: 1,
      setupKey: expectedKey,
      ...(setup?.id ? { setupId: setup.id } : {}),
      startLevel,
      ...(startPositionId ? { startPositionId } : {}),
      ...(apostleFacing === null ? {} : { apostleFacing }),
      showStarts: value.showStarts !== false,
      showCoordinates: value.showCoordinates === true,
      terrain: ensureTimeFrozenCityBases(terrain),
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
    if (!file) return [];
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

  function getInitialPositions(apostle, level, setupId, startPositionId) {
    const positions = getInitialPositionDefinition(apostle, level, setupId);
    if (!positions) return { apostle: null, titans: [] };
    const startOptions = Array.isArray(positions.startOptions) ? positions.startOptions : [];
    const selectedStart = startOptions.length
      ? startOptions.find((choice) => choice.id === startPositionId) || startOptions[0]
      : positions;
    return {
      apostle: selectedStart.apostle ? { ...selectedStart.apostle } : null,
      titans: positions.titans.map(([row, column], index) => ({ id: `titan-${index + 1}`, label: `T${index + 1}`, row, column })),
    };
  }

  function cardinalFacing(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const normalized = ((numeric % 360) + 360) % 360;
    return normalized % 90 === 0 ? normalized : null;
  }

  function screenRotationFromTts(value) {
    const facing = cardinalFacing(value);
    return facing === null ? null : cardinalFacing(facing - 180);
  }

  function getInitialFacing(apostle, savedFacing, setupId, level, startPositionId) {
    const normalizedApostle = String(apostle || "").toUpperCase();
    const position = getInitialPositions(normalizedApostle, level, setupId, startPositionId)?.apostle;
    if (!position) return null;
    const setupFacing = setupFacingOverrides[normalizedApostle]?.[setupId];
    const facing = setupFacing ?? position.facing;
    if (facing === undefined || facing === null) {
      return screenRotationFromTts(position.rotation) ?? 0;
    }
    if (facing !== "random") return cardinalFacing(facing) ?? 0;
    const saved = cardinalFacing(savedFacing);
    if (saved !== null) return saved;
    return [0, 90, 180, 270][Math.floor(Math.random() * 4)];
  }

  function getFacingLabel(value) {
    return ({ 0: "up", 90: "right", 180: "down", 270: "left" })[cardinalFacing(value)] || "up";
  }

  // 取某等级的使徒数据。speed 取该等级；等级缺失时取不超过它的最高等级
  // （例如 5 级的 UR_FLEECE 只印了 I 级，就一直用 I 级）。
  function getApostleProfile(apostle, level) {
    const profile = apostleProfiles[String(apostle || "").toUpperCase()];
    if (!profile) return null;
    const wanted = levelNumber(level);
    const levels = Object.keys(profile.speed).map(Number).sort((a, b) => a - b);
    const match = levels.filter((value) => value <= wanted).pop();
    const key = match !== undefined ? match : levels[0];
    return {
      size: profile.size,
      speed: profile.speed[key],
      speedLevel: key,
      blindspot: !!profile.blindspot,
      alwaysLos: !!profile.alwaysLos,
      mazesense: !!profile.mazesense,
    };
  }

  // 盲区格子：正后方紧贴脚印的一排，宽度等于脚印宽度（见始徒图示中带 R 与划眼
  // 图标的格子）。facing 0/90/180/270 = 上/右/下/左，后方即其反向。
  // placement 只需 {row, column}；使徒脚印都是正方形，所以旋转不改变形状。
  function getBlindspotCells(apostle, level, placement, facing) {
    const profile = getApostleProfile(apostle, level);
    if (!profile || !profile.blindspot || !placement) return [];
    const size = profile.size;
    const half = (size - 1) / 2;
    const column0 = Math.round(Number(placement.column) - half);
    const row0 = Math.round(Number(placement.row) - half);
    const back = { 0: [0, -1], 90: [-1, 0], 180: [0, 1], 270: [1, 0] }[cardinalFacing(facing) ?? 0];
    const [stepColumn, stepRow] = back;
    const cells = [];
    for (let index = 0; index < size; index += 1) {
      const column = stepColumn === 0
        ? column0 + index
        : column0 + (stepColumn > 0 ? size : -1);
      const row = stepRow === 0
        ? row0 + index
        : row0 + (stepRow > 0 ? size : -1);
      if (column >= 1 && column <= columns && row >= 1 && row <= rows) cells.push({ row, column });
    }
    return cells;
  }

  function footprint(placement) {
    const definition = catalog[placement.name] || placement;
    const quarterTurn = Math.abs(Number(placement.rotation || 0)) % 180 === 90;
    return {
      width: quarterTurn ? definition.height : definition.width,
      height: quarterTurn ? definition.width : definition.height,
    };
  }

  function getPlacementCells(placement) {
    const size = footprint(placement);
    const cells = [];
    const firstColumn = Number(placement.column) - (size.width - 1) / 2;
    const firstRow = Number(placement.row) - (size.height - 1) / 2;
    for (let columnOffset = 0; columnOffset < size.width; columnOffset += 1) {
      for (let rowOffset = 0; rowOffset < size.height; rowOffset += 1) {
        cells.push({
          c: Math.round(firstColumn + columnOffset),
          r: Math.round(firstRow + rowOffset),
        });
      }
    }
    return cells;
  }

  function getLightCoverage(map) {
    const coverageByCell = new Map();
    const sources = [];
    const placements = map?.terrain || [];
    const lightVoidCells = new Set(placements
      .filter((placement) => lightVoidTerrain.has(placement?.name))
      .flatMap((placement) => getPlacementCells(placement))
      .map(({ c, r }) => `${c},${r}`));
    placements.forEach((placement, index) => {
      const profile = terrainLightProfiles[placement?.name];
      if (!profile) return;

      const sourceCells = getPlacementCells(placement);
      if (!sourceCells.length) return;
      const sourceColumns = sourceCells.map((cell) => cell.c);
      const sourceRows = sourceCells.map((cell) => cell.r);
      const minColumn = Math.min(...sourceColumns);
      const maxColumn = Math.max(...sourceColumns);
      const minRow = Math.min(...sourceRows);
      const maxRow = Math.max(...sourceRows);
      const source = {
        id: placement.id || `light-source-${index + 1}`,
        name: placement.name,
        range: profile.range,
        cells: sourceCells,
      };
      sources.push(source);

      const edges = [
        { dc: 0, dr: 1, cells: sourceCells.filter((cell) => cell.r === maxRow) },
        { dc: 1, dr: 0, cells: sourceCells.filter((cell) => cell.c === maxColumn) },
        { dc: 0, dr: -1, cells: sourceCells.filter((cell) => cell.r === minRow) },
        { dc: -1, dr: 0, cells: sourceCells.filter((cell) => cell.c === minColumn) },
      ];
      edges.forEach(({ dc, dr, cells }) => {
        cells.forEach((cell) => {
          for (let distance = 1; distance <= profile.range; distance += 1) {
            const c = cell.c + dc * distance;
            const r = cell.r + dr * distance;
            if (c < 1 || c > columns || r < 1 || r > rows) continue;
            const key = `${c},${r}`;
            if (lightVoidCells.has(key)) continue;
            const current = coverageByCell.get(key) || { c, r, sources: new Set() };
            current.sources.add(source.name);
            coverageByCell.set(key, current);
          }
        });
      });
    });
    return {
      sources,
      cells: [...coverageByCell.values()]
        .map((cell) => ({ ...cell, sources: [...cell.sources].sort() }))
        .sort((left, right) => right.r - left.r || left.c - right.c),
    };
  }

  function isTileObscuring(placement) {
    const definition = catalog[placement?.name];
    const los = definition && definition.los;
    if (!los) return false;
    const obscuring = los.obscuring;
    if (typeof obscuring === "object" && obscuring !== null) {
      return placement && placement.flipped ? !!obscuring.back : !!obscuring.front;
    }
    return !!obscuring;
  }

  function getTileLosData(placement) {
    const definition = catalog[placement?.name];
    const los = (definition && definition.los) || {};
    return {
      obscuring: isTileObscuring(placement),
      redLines: los.redLines || null,
      cells: los.cells || null,
      elevated: !!los.elevated,
      cloud: !!los.cloud,
      labyrinth: !!los.labyrinth,
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
      rotation: `${screenRotationFromTts(placement.rotation) ?? 0}deg`,
    };
  }

  function getTileFlipTransform(placement) {
    return placement?.flipped === true ? "scaleX(-1)" : "scaleX(1)";
  }

  return {
    catalog,
    setups,
    apostleProfiles,
    createBattleMap,
    footprint,
    getApostleProfile,
    getAssetSources,
    getBlindspotCells,
    getFacingLabel,
    getInitialFacing,
    getInitialPositions,
    getLightCoverage,
    getMapTiles,
    getSetupKey,
    getSetupOptions,
    getTerrainCards,
    getTiles,
    getTileFlipTransform,
    getTileLosData,
    getTileStyle,
    isTileObscuring,
    levelNumber,
    normalizeBattleMap,
    snapPlacement,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BattleTerrain;
else window.BattleTerrain = BattleTerrain;
