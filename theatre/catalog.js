(function (root, factory) {
  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  else root.ATO_THEATRE_CATALOG = catalog;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  // Positions are percentages of each redrawn spread. The chapter pages are
  // joined vertically for Core p. 74–75 and horizontally for Cycle IV p. 172–173.
  // A row is [level, x, y, immediate predecessors, extra reward, ascended core].
  const lootReward = { type: "loot", carry: true };
  const skyseer = { type: "skyseer", carry: true };
  const secret = (deck, card, carry = false) => ({ type: "secret", deck, card, carry });
  const coreSecret = (card) => secret(12, card);
  const expansionSecret = (card) => secret(17, card);
  const coreRows = {
    HEKATON: [
      [5, 21, 7],
      [6, 27, 15, ["LABYRINTHAUROS:5"]],
      [7, 16, 29, ["ALPHA_TEMENOS:3"], lootReward],
      [8, 10, 44, ["HERMESIAN_PURSUER:5"], coreSecret(147)],
      [9, 10, 48, ["HEKATON:8"], coreSecret(150)],
    ],
    LABYRINTHAUROS: [
      [5, 27, 11, ["HEKATON:5"]],
      [6, 27, 19, ["HEKATON:6"], lootReward],
      [7, 27, 33, ["HEKATON:7", "CHIMERA_METASTASIOS:6"], lootReward],
      [8, 21, 44, ["HERMESIAN_PURSUER:5"], coreSecret(148)],
      [9, 21, 48, ["LABYRINTHAUROS:8", "THE_NIETZSCJEAN:2"], coreSecret(165)],
    ],
    ALPHA_TEMENOS: [
      [2, 16, 15, ["HERMESIAN_PURSUER:2"], lootReward],
      [3, 16, 25, ["HERMESIAN_PURSUER:3"], null, true],
      [4, 16, 33, ["HEKATON:7"], secret(5, 44), true],
      [5, 32, 44, ["HERMESIAN_PURSUER:5"], null, true],
      [6, 32, 48, ["ALPHA_TEMENOS:5"], lootReward],
      [7, 37, 68, ["ALPHA_TEMENOS:6", "HERMESIAN_PURSUER:7"], null, true],
      [8, 37, 72, ["ALPHA_TEMENOS:7"], coreSecret(170)],
      [9, 37, 84, ["HERMESIAN_PURSUER:9", "THE_NIETZSCJEAN:4"], coreSecret(153)],
    ],
    HERMESIAN_PURSUER: [
      [2, 16, 11, ["HEKATON:5"], skyseer],
      [3, 16, 21, ["ALPHA_TEMENOS:2", "LABYRINTHAUROS:6"], lootReward],
      [4, 21, 37, ["ALPHA_TEMENOS:4", "LABYRINTHAUROS:7"], coreSecret(162)],
      [5, 21, 40, ["HERMESIAN_PURSUER:4"], lootReward],
      [6, 48, 52, ["CHIMERA_METASTASIOS:7", "THE_BURDEN:3", "ALPHA_TEMENOS:6"], secret(3, 30, true)],
      [7, 48, 56, ["HERMESIAN_PURSUER:6"], coreSecret(163)],
      [8, 37, 76, ["ALPHA_TEMENOS:8", "THE_BURDEN:5"], coreSecret(158)],
      [9, 37, 80, ["HERMESIAN_PURSUER:8"], coreSecret(169)],
    ],
    CYCLONUS: [
      [5, 42, 25],
      [6, 54, 29, ["CHIMERA_METASTASIOS:5"], lootReward],
      [7, 42, 33, ["CHIMERA_METASTASIOS:6", "HEKATON:7"], lootReward],
      [8, 54, 44, ["CHIMERA_METASTASIOS:7", "THE_BURDEN:3"], coreSecret(154)],
      [9, 59, 76, ["CHIMERA_METASTASIOS:9"], coreSecret(152)],
    ],
    CHIMERA_METASTASIOS: [
      [5, 54, 25],
      [6, 42, 29, ["CYCLONUS:5"], lootReward],
      [7, 48, 40, ["THE_NIETZSCJEAN:2"], lootReward],
      [8, 59, 68, ["THE_NIETZSCJEAN:3", "ICARIAN_HARPY:7"], coreSecret(151)],
      [9, 59, 72, ["CHIMERA_METASTASIOS:8"], coreSecret(157)],
    ],
    THE_NIETZSCJEAN: [
      [2, 48, 37, ["CYCLONUS:7", "THE_BURDEN:2"], lootReward],
      [3, 67, 56, ["THE_BURDEN:4", "HYPERTIME_ORACLE:7"], null, true],
      [4, 59, 80, ["CYCLONUS:9", "THE_BURDEN:6"], lootReward],
      [5, 59, 84, ["THE_NIETZSCJEAN:4", "HERMESIAN_PURSUER:9"], null, true],
      [6, 59, 88, ["THE_NIETZSCJEAN:5", "ALPHA_TEMENOS:9"], lootReward],
      [7, 59, 92, ["THE_NIETZSCJEAN:6", "SUN_DESCENDANT:4"], lootReward, true],
      [8, 59, 96, ["THE_NIETZSCJEAN:7", "THE_BURDEN:9"], coreSecret(155)],
      [9, 59, 100, ["THE_NIETZSCJEAN:8"], coreSecret(168)],
    ],
    THE_BURDEN: [
      [2, 54, 33, ["CYCLONUS:6"], coreSecret(171)],
      [3, 59, 40, ["THE_NIETZSCJEAN:2"], lootReward],
      [4, 59, 52, ["CHIMERA_METASTASIOS:7", "THE_BURDEN:3", "HYPERTIME_ORACLE:7"], coreSecret(167)],
      [5, 48, 68, ["HERMESIAN_PURSUER:7"], secret(6, 75, true)],
      [6, 48, 76, ["THE_BURDEN:5", "ALPHA_TEMENOS:8"], lootReward],
      [7, 48, 84, ["THE_BURDEN:6", "CYCLONUS:9"], secret(6, 78, true)],
      [8, 48, 88, ["THE_BURDEN:7"], coreSecret(156)],
      [9, 48, 92, ["THE_BURDEN:8"], coreSecret(159)],
    ],
    HYPERTIME_ORACLE: [
      [5, 86, 37],
      [6, 86, 44, ["SUN_DESCENDANT:2"], lootReward],
      [7, 75, 48, ["ICARIAN_HARPY:6"], lootReward],
      [8, 80, 72, ["SUN_DESCENDANT:3"], coreSecret(172)],
      [9, 80, 76, ["HYPERTIME_ORACLE:8"], coreSecret(160)],
    ],
    ICARIAN_HARPY: [
      [5, 75, 37],
      [6, 75, 44, ["SUN_DESCENDANT:2"], lootReward],
      [7, 86, 48, ["HYPERTIME_ORACLE:6"], lootReward],
      [8, 92, 72, ["SUN_DESCENDANT:3"], coreSecret(149)],
      [9, 92, 76, ["ICARIAN_HARPY:8"], coreSecret(164)],
    ],
    SUN_DESCENDANT: [
      [2, 80, 40, ["ICARIAN_HARPY:5", "HYPERTIME_ORACLE:5"], null, true],
      [3, 86, 68, ["ICARIAN_HARPY:7", "THE_NIETZSCJEAN:3"], null, true],
      [4, 86, 80, ["HYPERTIME_ORACLE:9", "ICARIAN_HARPY:9"], lootReward],
      [5, 86, 84, ["SUN_DESCENDANT:4"], null, true],
      [6, 86, 88, ["SUN_DESCENDANT:5"], lootReward],
      [7, 86, 92, ["SUN_DESCENDANT:6", "THE_NIETZSCJEAN:5"], null, true],
      [8, 86, 96, ["SUN_DESCENDANT:7"], coreSecret(166)],
      [9, 86, 100, ["SUN_DESCENDANT:8"], coreSecret(161)],
    ],
  };

  const expansionRows = {
    MIDASCORE: [
      [5, 20, 5, [], lootReward],
      [6, 28, 11, ["DEMIDJINN:5"], lootReward],
      [7, 28, 26, ["THE_BABELIAN_LUNACY:2"], lootReward],
      [8, 28, 38, ["THE_BABELIAN_LUNACY:3"], expansionSecret(262)],
      [9, 20, 57, ["DAHAKA:4"], expansionSecret(263)],
    ],
    DEMIDJINN: [
      [5, 28, 5, [], lootReward],
      [6, 20, 11, ["MIDASCORE:5"], lootReward],
      [7, 20, 26, ["THE_BABELIAN_LUNACY:2"], lootReward],
      [8, 20, 38, ["THE_BABELIAN_LUNACY:3"], expansionSecret(260)],
      [9, 28, 57, ["DAHAKA:4"], expansionSecret(261)],
    ],
    THE_BABELIAN_LUNACY: [
      [2, 28, 21, ["DEMIDJINN:6", "MIDASCORE:6"]],
      [3, 24, 32, ["DEMIDJINN:7", "MIDASCORE:7", "HYPERTIME_ORACLE:9", "ICARIAN_HARPY:9"], null, true],
      [4, 24, 47, ["DEMIDJINN:8", "MIDASCORE:8", "DAHAKA:3"], lootReward, true],
      [5, 20, 62, ["MIDASCORE:9", "SUN_DESCENDANT:6"], lootReward],
      [6, 28, 68, ["DAHAKA:5"], null, true],
      [7, 20, 74, ["DAHAKA:6"], lootReward],
      [8, 24, 86, ["DAHAKA:8"], expansionSecret(264), true],
      [9, 20, 91, ["THE_BABELIAN_LUNACY:8"], expansionSecret(265)],
    ],
    DAHAKA: [
      [2, 39, 18, ["DEMIDJINN:6", "MIDASCORE:6"]],
      [3, 39, 23, ["DAHAKA:2"], lootReward],
      [4, 24, 52, ["THE_BABELIAN_LUNACY:4"], lootReward],
      [5, 28, 62, ["DEMIDJINN:9"], lootReward],
      [6, 20, 68, ["THE_BABELIAN_LUNACY:5"]],
      [7, 28, 74, ["THE_BABELIAN_LUNACY:6"]],
      [8, 24, 81, ["THE_BABELIAN_LUNACY:7", "DAHAKA:7"], expansionSecret(266)],
      [9, 28, 91, ["THE_BABELIAN_LUNACY:8"], expansionSecret(267)],
    ],
    DRAGON_OF_PHOBOS: [
      [5, 73, 20, [], lootReward],
      [6, 73, 25, ["DRAGON_OF_PHOBOS:5"], lootReward],
      [7, 81, 30, ["MEDUKETOS:6"], lootReward],
      [8, 81, 50, ["UR_FLEECE:3"], expansionSecret(270)],
      [9, 73, 65, ["TITAN_X:3"], expansionSecret(271)],
    ],
    MEDUKETOS: [
      [5, 81, 20, [], lootReward],
      [6, 81, 25, ["MEDUKETOS:5"], lootReward],
      [7, 73, 30, ["DRAGON_OF_PHOBOS:6"], lootReward],
      [8, 73, 50, ["UR_FLEECE:3"], expansionSecret(272)],
      [9, 81, 65, ["TITAN_X:3"], expansionSecret(273)],
    ],
    UR_FLEECE: [
      [2, 77, 36, ["MEDUKETOS:7", "DRAGON_OF_PHOBOS:7"], null, true],
      [3, 73, 42, ["UR_FLEECE:2"], lootReward],
      [4, 77, 55, ["MEDUKETOS:8", "DRAGON_OF_PHOBOS:8", "THE_BABELIAN_LUNACY:7", "DAHAKA:7"], null, true],
      [5, 72, 76, ["DRAGON_OF_PHOBOS:9", "MEDUKETOS:9", "DAHAKA:7"], lootReward],
      [6, 72, 81, ["UR_FLEECE:5"], null, true],
      [7, 72, 86, ["UR_FLEECE:6"], lootReward],
      [8, 72, 96, ["UR_FLEECE:7", "HELIOS:7"], expansionSecret(276), true],
      [9, 72, 106, ["UR_FLEECE:8", "HELIOS:9"], expansionSecret(277)],
    ],
    TITAN_X: [
      [2, 81, 42, ["UR_FLEECE:2"]],
      [3, 77, 60, ["UR_FLEECE:4"], lootReward],
      [4, 83, 76, ["DRAGON_OF_PHOBOS:9", "MEDUKETOS:9"]],
      [5, 83, 81, ["TITAN_X:4"], lootReward],
      [6, 83, 86, ["TITAN_X:5"]],
      [7, 83, 96, ["TITAN_X:6", "HELIOS:7"], lootReward],
      [8, 83, 101, ["TITAN_X:7"], expansionSecret(274)],
      [9, 83, 106, ["TITAN_X:8", "UR_FLEECE:8"], expansionSecret(275)],
    ],
    HELIOS: [
      [2, 56, 44, ["DAHAKA:3", "SUN_DESCENDANT:5"]],
      [3, 56, 55, ["HELIOS:2"], lootReward],
      [4, 56, 62, ["HELIOS:3", "DAHAKA:4"]],
      [5, 56, 70, ["HELIOS:4", "DAHAKA:5"], lootReward],
      [6, 56, 81, ["HELIOS:5"]],
      [7, 56, 87, ["HELIOS:6", "TITAN_X:3"], lootReward],
      [8, 56, 96, ["HELIOS:7", "THE_BABELIAN_LUNACY:9", "DAHAKA:9"], expansionSecret(268)],
      [9, 56, 101, ["HELIOS:8"], expansionSecret(269)],
    ],
  };

  const bosses = Object.fromEntries([
    ["HEKATON", "Hekaton", "百臂巨人", "c1", 5],
    ["LABYRINTHAUROS", "Labyrinthauros", "迷宫机牛", "c1", 5],
    ["ALPHA_TEMENOS", "Alpha Temenos", "吞域兽", "c1", 2],
    ["CYCLONUS", "Cyclonus", "独眼巨人", "c2", 5],
    ["CHIMERA_METASTASIOS", "Chimera Metastasios", "蠕变奇美拉", "c2", 5],
    ["THE_NIETZSCJEAN", "The Nietzschean", "尼采超人", "c2", 2],
    ["HYPERTIME_ORACLE", "Hypertime Oracle", "超时光先知", "c3", 5],
    ["ICARIAN_HARPY", "Icarian Harpy", "伊卡洛斯哈尔皮", "c3", 5],
    ["SUN_DESCENDANT", "Sun Descendant", "坠落太阳", "c3", 2],
    ["HERMESIAN_PURSUER", "Hermesian Pursuer", "赫尔墨斯追击者", "c1", 2],
    ["THE_BURDEN", "The Burden", "重担", "c2", 2],
    ["MIDASCORE", "Midascore", "迈达狮", "c4", 5],
    ["DEMIDJINN", "Demidjinn", "半神迪精", "c4", 5],
    ["THE_BABELIAN_LUNACY", "Babelian Lunacy", "巴比伦疯塔", "c4", 2],
    ["DRAGON_OF_PHOBOS", "Dragon of Phobos", "深海惧龙", "c5", 5],
    ["MEDUKETOS", "Meduketos", "须目刻托斯", "c5", 5],
    ["UR_FLEECE", "Ur-Fleece", "乌尔-弗里斯", "c5", 2],
    ["DAHAKA", "Dahaka", "达哈卡", "c4", 2],
    ["TITAN_X", "Titan X", "泰坦 X", "c5", 2],
    ["HELIOS", "Old Haunt", "旧日幽魂", "c4", 2],
  ].map(([id, name, label, cycle, minLevel]) => [id, { name, label, cycle, minLevel }]));

  const nodes = Object.entries({ ...coreRows, ...expansionRows }).flatMap(([boss, rows]) =>
    rows.map(([level, x, y, prerequisites = [], reward = null, core = false]) => {
      const cycle = boss === "HELIOS" && level >= 6 ? "c5" : bosses[boss].cycle;
      return {
        id: `${boss}:${level}`, boss, level, cycle, prerequisites, reward, core,
        edition: Object.hasOwn(coreRows, boss) ? "core" : "expansion",
        cursed: cycle === "c4" && boss !== "HELIOS",
        position: { x, y: Object.hasOwn(coreRows, boss) ? y * 0.95 : y * 0.90 },
      };
    })
  );
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const expansionRepeats = {
    "SUN_DESCENDANT:4": { x: 10, y: 28 * 0.90 },
    "SUN_DESCENDANT:5": { x: 10, y: 37 * 0.90 },
    "SUN_DESCENDANT:7": { x: 10, y: 62 * 0.90 },
  };
  // In the expansion spread, these branches depart from the incoming lines
  // immediately above Sun Descendant IV and VII. The aliases are visual only.
  const expansionBranchAnchors = {
    "THE_BABELIAN_LUNACY:3": { from: "SUN_DESCENDANT:4", direction: "incoming" },
    "THE_BABELIAN_LUNACY:5": { from: "SUN_DESCENDANT:7", direction: "incoming" },
  };

  // Core Rulebook p. 71 and Cycle IV Storybook p. 16.
  const loot = Object.fromEntries(Object.entries({
    HEKATON: [[2, 10, "Shieldblade"]],
    LABYRINTHAUROS: [[2, 12, "Mazemace"], [2, 13, "Glimmer Shroud"]],
    ALPHA_TEMENOS: [[5, 46, "Pyramidion"]],
    HERMESIAN_PURSUER: [[2, 17, "Nail Spear"], [2, 18, "Vulture Mask"]],
    CYCLONUS: [[5, 47, "Right Maulfist"], [5, 48, "Left Maulfist"]],
    CHIMERA_METASTASIOS: [[5, 50, "Muck Virus"], [5, 49, "Remembrance"], [5, 51, "Jaws of the Lion"]],
    THE_NIETZSCJEAN: [
      [5, 175, "Umbral Virus"], [5, 178, "Fumeblade"], [5, 177, "Necroxiphos"],
      [5, 176, "Elephantine Armor"], [5, 53, "Cowl of Char"], [5, 54, "The End"],
    ],
    THE_BURDEN: [[5, 52, "Leg Khopesh"], [5, 60, "Sisyphus’s Burden"]],
    HYPERTIME_ORACLE: [[8, 84, "Eye of the Watcher"], [8, 85, "Paradox"]],
    ICARIAN_HARPY: [[8, 86, "Right Talon of Doom"], [8, 87, "Spherecast"]],
    SUN_DESCENDANT: [[8, 88, "Icarus Lot"], [8, 89, "Icarus’s Fall"]],
    MIDASCORE: [[11, 189, "Auric Cloak"], [11, 190, "Golden Harp"], [11, 191, "Bihorn Lance"]],
    DEMIDJINN: [[11, 194, "Pocket Wishlamp"], [11, 193, "Djinn Cloak"], [11, 192, "Wishblade"]],
    DAHAKA: [[11, 197, "Shadowcleaver"], [11, 196, "Dahaka Mask"], [11, 195, "Dahaka Blade"]],
    THE_BABELIAN_LUNACY: [[11, 198, "Molten Gold Kalasiris"], [11, 199, "Outrigger Bodysuit"], [11, 200, "Bailout"]],
    HELIOS: [[11, 203, "Godhand"], [11, 204, "Luminous Beacon"], [11, 205, "Divine Lure"]],
    DRAGON_OF_PHOBOS: [[18, 283, "Phobos Whip"], [18, 284, "Grin Mask"], [18, 282, "Claw Cracker"]],
    MEDUKETOS: [[18, 286, "Veilwrappings"], [18, 287, "Microwave Shieldscale"], [18, 285, "Oculus Headlamp"]],
    TITAN_X: [[18, 290, "Japetus Helm"], [18, 289, "Synergic Armor"], [18, 288, "Pilfered Blade"]],
    UR_FLEECE: [[18, 291, "Flame-Hardened Plate"], [18, 293, "Headdress of the Deep"], [18, 292, "Strungstring"]],
  }).map(([boss, cards]) => [boss, cards.map(([deck, card, name]) => ({ deck, card, name }))]));

  const cycleMaterials = Object.fromEntries([
    ["c1", "Labyrinthized"], ["c2", "Excavated"], ["c3", "Accursed"],
    ["c4", "Blackburned"], ["c5", "Moonfell"],
  ].map(([cycle, name]) => [cycle, {
    tear: `${name} Tear`, core: `${name} Ascended Core`,
  }]));
  const cursedTraits = [
    "Bleak Outlook", "Abundance Has Impoverished You", "You Will Never Win",
    "Reap the Ashes", "Inverted Battle", "Years to Rust",
  ];

  return { nodes, byId, bosses, loot, expansionRepeats, expansionBranchAnchors, cycleMaterials, cursedTraits };
});
