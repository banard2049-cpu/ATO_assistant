/*
AIBP BP Loot Calculator Addon
Version: image cards + image resources

Place:
  D:\desktop\aibp\bp_loot_calculator_addon.js

Require before this addon:
  ps/other/resouce/bp_resource_map.js

Add these script tags after the main viewer script:
  <script src="ps/other/resouce/bp_resource_map.js"></script>
  <script src="bp_loot_calculator_addon.js"></script>
*/

(function () {
  "use strict";

  const RESOURCE_MAP_NAME = "AIBP_BP_RESOURCE_MAP";
  const RESOURCE_ICON_BASE = "ps/other/resouce";
  const RECORD_STORAGE_KEY = "ato-argo-record-sheet-v1";
  const CAMPAIGN_STATE_URL = "../api/campaign-state.php";
  const RECORD_SECTION_URL = `${CAMPAIGN_STATE_URL}?section=record`;
  const RECORD_DEFAULT_CYCLE = "c2";
  const RECORD_SYNC_CHANNEL = typeof BroadcastChannel === "function" ? new BroadcastChannel("ato-record-sync-v1") : null;
  const CHIMERA_APOSTLE = "CHIMERA_METASTASIOS";
  const BURDEN_APOSTLE = "THE_BURDEN";
  const NIETZSCHE_APOSTLE = "THE_NIETZSCJEAN";
  const CORE_RESOURCE = "core";
  const RESOURCE_ZH_NAME = {
    BC: "黑色锁链",
    CKB: "钙化指节骨",
    CL: "肉布",
    CM: "独眼巨人甲胄",
    CT: "奇美拉焦油",
    EC: "眼球簇",
    EF: "岩壳碎片",
    FA: "凝固神浆",
    FE: "恐惧精华",
    FM: "血肉块",
    GB: "怪异喙片",
    IF: "伊卡洛斯之羽",
    IM: "浸液机件",
    LS: "活体深渊",
    MC: "肌肉簇",
    MF: "迷宫碎片",
    PW: "粉化奇物",
    RA: "神浆原液",
    RC: "利爪",
    RT: "伸缩机构",
    SK: "日炙头骨",
    SM: "怨恨之皮",
    UA: "不稳定神浆",
    URM: "超固体块",
    WT: "扭动触手",
    cursedDerelict: "诅咒船骸",
    blackenedHalo: "黑化光环",
    burnedOutGrace: "燃尽恩典",
    cursedBloatsack: "诅咒胀囊",
    livingGold: "活化黄金",
    imperialScroll: "帝国卷轴",
    wishEmbryo: "愿望胚胎",
    oldIremFragment: "旧伊雷姆碎片",
    blackTaintedStepfinger: "染黑阶梯指",
    promisedFuturesCarcass: "未来承诺残骸",
    babylonianContraption: "巴比伦装置",
    onyxDust: "缟玛瑙粉尘",
    ireEssence: "愤怒精华",
    mutableAmbrosia: "易变神浆",
    atlanteanTekne: "亚特兰蒂斯技艺",
    orichalcumChunk: "山铜块",
    liquidAether: "液态以太",
    hydradynamicScales: "流体力学鳞片",
    amygdalanExtract: "杏仁体萃取物",
    photophobicFlesh: "畏光血肉",
    microwaveCell: "微波细胞",
    blackWoolStrand: "黑羊毛丝",
    fadingLightConstruct: "消逝之光构造体",
    orichalcumAlloy: "山铜合金",
    slaveMetal: "奴隶金属",
    oxidizedAmbrosia: "氧化神浆",
    sisyphusTears: "西西弗斯之泪",
    pygmalionStones: "皮格马利翁之石",
    echoes: "记忆之回响",
    core: "核心"
  };
  const APOSTLE_ZH_NAME = {
    HEKATON: "百臂巨人",
    LABYRINTHAUROS: "迷宫机牛",
    HERMESIAN_PURSUER: "赫尔墨斯追踪者",
    ALPHA_TEMENOS: "阿尔法圣域",
    CHIMERA_METASTASIOS: "蠕变奇美拉",
    CYCLONUS: "独眼巨人",
    THE_BURDEN: "重担",
    THE_NIETZSCJEAN: "尼采超人",
    HYPERTIME_ORACLE: "超时神谕",
    ICARIAN_HARPY: "伊卡洛斯鹰身女妖",
    SUN_DESCENDANT: "坠落太阳",
    MIDASCORE: "迈达狮",
    DEMIDJINN: "半神迪精",
    THE_BABELIAN_LUNACY: "巴比伦疯塔",
    DAHAKA: "达哈卡",
    DRAGON_OF_PHOBOS: "深海惧龙",
    MEDUKETOS: "须目塞特斯",
    UR_FLEECE: "乌尔-弗里斯",
    TITAN_X: "泰坦 X"
  };
  const RECORD_RESOURCE_KEY_MAP = {
    BC: "blackChain",
    CKB: "calcifiedKnuckle",
    CL: "clothflesh",
    CM: "cyclopeanMetal",
    CT: "chimericTar",
    EC: "eyesCluster",
    EF: "reliefshellFragment",
    FA: "frozenAmbrosia",
    FE: "fearEssence",
    FM: "fleshyMantle",
    GB: "grotesqueBeak",
    IF: "icarianFeather",
    IM: "infusedMechanism",
    LS: "livingAbyss",
    MC: "muscleCluster",
    MF: "mazeFragment",
    PW: "powderedMatter",
    RA: "rawAmbrosia",
    RC: "razorclaw",
    RT: "retractableMechanism",
    SK: "sunburnedSkull",
    SM: "skinOfMalice",
    UA: "violentAmbrosia",
    URM: "supersolidRelief",
    WT: "writhingTentacle"
  };
  const DIRECT_RECORD_RESOURCE_KEYS = new Set([
    "cursedDerelict", "blackenedHalo", "burnedOutGrace", "cursedBloatsack",
    "livingGold", "imperialScroll", "wishEmbryo", "oldIremFragment",
    "blackTaintedStepfinger", "promisedFuturesCarcass",
    "babylonianContraption", "onyxDust", "ireEssence", "mutableAmbrosia",
    "atlanteanTekne", "orichalcumChunk", "liquidAether",
    "hydradynamicScales", "amygdalanExtract", "photophobicFlesh",
    "microwaveCell", "blackWoolStrand", "fadingLightConstruct",
    "orichalcumAlloy", "slaveMetal", "oxidizedAmbrosia",
    "sisyphusTears", "pygmalionStones", "echoes"
  ]);
  const RESOURCE_ICON_KEYS = new Set([
    ...Object.keys(RECORD_RESOURCE_KEY_MAP),
    ...DIRECT_RECORD_RESOURCE_KEYS,
    CORE_RESOURCE
  ]);
  const RECORD_SHARED_RESOURCE_KEYS = new Set([
    "blackTaintedStepfinger",
    "fearEssence",
    "echoes",
    "grotesqueBeak",
    "livingAbyss",
    "mazeFragment",
    "powderedMatter",
    "priests",
    "promisedFuturesCarcass",
    "pygmalionStones",
    "rare",
    "reliefshellFragment",
    "retractableMechanism",
    "sisyphusTears",
    "skinOfMalice"
  ]);
  const APOSTLE_RECORD_CORE_KEY = {
    HEKATON: "core-hekaton",
    LABYRINTHAUROS: "core-labyrinthauros",
    HERMESIAN_PURSUER: "core-pursuer",
    ALPHA_TEMENOS: "core-alpha-temenos",
    CHIMERA_METASTASIOS: "core-chimera",
    CYCLONUS: "core-cyclonus",
    THE_BURDEN: "core-adversary",
    THE_NIETZSCJEAN: "core-nietzschean",
    HYPERTIME_ORACLE: "core-hypertime-oracle",
    ICARIAN_HARPY: "core-icarian-harpy",
    SUN_DESCENDANT: "core-sun-descendant",
    MIDASCORE: "core-midascore",
    DEMIDJINN: "core-demidjinn",
    THE_BABELIAN_LUNACY: "core-babelianLunacy",
    DAHAKA: "core-dahaka",
    DRAGON_OF_PHOBOS: "core-dragonOfPhobos",
    MEDUKETOS: "core-meduketos",
    UR_FLEECE: "core-urFleece",
    TITAN_X: "core-titanX"
  };
  const APOSTLE_RECORD_CYCLE = {
    HEKATON: "c1",
    LABYRINTHAUROS: "c1",
    HERMESIAN_PURSUER: "c1",
    ALPHA_TEMENOS: "c1",
    CHIMERA_METASTASIOS: "c2",
    CYCLONUS: "c2",
    THE_BURDEN: "c2",
    THE_NIETZSCJEAN: "c2",
    HYPERTIME_ORACLE: "c3",
    ICARIAN_HARPY: "c3",
    SUN_DESCENDANT: "c3",
    MIDASCORE: "c4",
    DEMIDJINN: "c4",
    THE_BABELIAN_LUNACY: "c4",
    DAHAKA: "c4",
    DRAGON_OF_PHOBOS: "c5",
    MEDUKETOS: "c5",
    UR_FLEECE: "c5",
    TITAN_X: "c5"
  };
  const APOSTLE_RECORD_ENEMY = {
    HEKATON: { cycle: "c1", key: "hekaton" },
    LABYRINTHAUROS: { cycle: "c1", key: "labyrinthauros" },
    HERMESIAN_PURSUER: { cycle: "c1", key: "pursuer" },
    ALPHA_TEMENOS: { cycle: "c1", key: "temenos" },
    CHIMERA_METASTASIOS: { cycle: "c2", key: "chimera" },
    CYCLONUS: { cycle: "c2", key: "cyclonus" },
    THE_BURDEN: { cycle: "c2", key: "adversary" },
    THE_NIETZSCJEAN: { cycle: "c2", key: "nietzschean" },
    HYPERTIME_ORACLE: { cycle: "c3", key: "oracle" },
    ICARIAN_HARPY: { cycle: "c3", key: "harpy" },
    SUN_DESCENDANT: { cycle: "c3", key: "sunDescendant" },
    MIDASCORE: { cycle: "c4", key: "midascore" },
    DEMIDJINN: { cycle: "c4", key: "demidjinn" },
    THE_BABELIAN_LUNACY: { cycle: "c4", key: "babelianLunacy" },
    DAHAKA: { cycle: "c4", key: "dahaka" },
    DRAGON_OF_PHOBOS: { cycle: "c5", key: "dragonOfPhobos" },
    MEDUKETOS: { cycle: "c5", key: "meduketos" },
    UR_FLEECE: { cycle: "c5", key: "urFleece" },
    TITAN_X: { cycle: "c5", key: "titanX" }
  };
  const RECORD_NEMESIS_CYCLES = {
    HERMESIAN_PURSUER: ["c1", "c2"],
    THE_BURDEN: ["c2", "c3"],
    DAHAKA: ["c2", "c3", "c4"],
    TITAN_X: ["c5"],
  };
  const RECORD_STAGE_LEVELS = {
    hekaton: { "0": 0, "1a": 1, "1b": 1, "2a": 2, "2b": 2, "2c": 3, "3": 3, "4a": 4, "4b": 4, "4c": 4 },
    labyrinthauros: { "1a": 1, "1b": 1, "2a": 2, "2b": 2, "2c": 3, "3": 3, "4a": 4, "4b": 4, "4c": 4 },
    cyclonus: { "1a": 1, "1b": 1, "2a": 2, "2b": 2, "3a": 3, "3b": 3, "4a": 4, "4b": 4, "4c": 4 },
    chimera: { "1a": 1, "1b": 1, "2a": 2, "2b": 2, "3a": 3, "3b": 3, "4a": 4, "4b": 4, "4c": 4 },
    oracle: { "1a": 1, "1b": 1, "2a": 2, "2b": 2, "2c": 3, "3": 3, "4a": 4, "4b": 4, "4c": 4, "5": 5 },
    harpy: { "1a": 1, "1b": 1, "2a": 2, "2b": 2, "2c": 3, "3": 3, "4a": 4, "4b": 4, "4c": 4, "5": 5 }
  };
  const LEVEL_ORDER = ["O", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const BP_LEVEL_ORDER = ["I", "II", "III"];
  const LEVEL_VALUE = {
    O: 0,
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10
  };
  const APOSTLE_LEVEL_RESOURCE_BONUS = {
    CHIMERA_METASTASIOS: { 3: { UA: 3 }, 4: { UA: 12 } },
    CYCLONUS: { 3: { UA: 3 }, 4: { UA: 12 } },
    MIDASCORE: {
      3: { mutableAmbrosia: 3 },
      4: { mutableAmbrosia: 12 }
    },
    DEMIDJINN: {
      3: { mutableAmbrosia: 3 },
      4: { mutableAmbrosia: 12 }
    },
    DRAGON_OF_PHOBOS: {
      3: { oxidizedAmbrosia: 3 },
      4: { oxidizedAmbrosia: 12 }
    },
    MEDUKETOS: {
      3: { oxidizedAmbrosia: 3 },
      4: { oxidizedAmbrosia: 12 }
    }
  };
  const NO_LEVEL_RESOURCE_MULTIPLIER_APOSTLES = new Set([
    "HERMESIAN_PURSUER",
    "THE_BURDEN",
    "ALPHA_TEMENOS",
    "THE_NIETZSCJEAN",
    "SUN_DESCENDANT",
    "THE_BABELIAN_LUNACY",
    "DAHAKA",
    "UR_FLEECE",
    "TITAN_X"
  ]);
  const BURDEN_SUMMIT_BONUS = {
    1: { RT: 4, EF: 2 },
    2: { RT: 6, EF: 5 },
    3: { RT: 10, EF: 7 },
    4: { RT: 13, EF: 10 }
  };
  const NIETZSCHE_DAMAGE_BONUS = [
    { min: 10, livingAbyss: 7, choiceCount: 3, specialReward: "终结（装备）卡（秘密牌组 5，牌 54）" },
    { min: 9, livingAbyss: 6, choiceCount: 3 },
    { min: 8, livingAbyss: 5, choiceCount: 2 },
    { min: 7, livingAbyss: 4, choiceCount: 2, specialReward: "尼采宁芙召唤卡（秘密牌组 6，牌 75）" },
    { min: 6, livingAbyss: 3, choiceCount: 1 },
    { min: 5, livingAbyss: 2, choiceCount: 1 },
    { min: 4, livingAbyss: 1, choiceCount: 0 }
  ];
  const NIETZSCHE_CHOICE_KEYS = ["CT", "URM", "BC", "CM"];
  const CHIMERA_BONUS_TABLE = {
    1: [
      { regular: (n) => n === 6, secondary: (n) => n === 6, bp: { I: 1, II: 2, III: 1 }, core: 1, label: "6 / 6" },
      { regular: (n) => n >= 7, secondary: (n) => n === 6, bp: { I: 1, II: 1, III: 1 }, core: 1, label: "7+ / 6" },
      { regular: (n) => n === 7, secondary: (n) => n === 5, bp: { I: 0, II: 1, III: 1 }, core: 0, label: "7 / 5" },
      { regular: (n) => n === 8, secondary: (n) => n <= 5, bp: { I: 0, II: 0, III: 1 }, core: 0, label: "8 / 5-" },
      { regular: (n) => n === 9, secondary: (n) => n <= 5, bp: { I: 0, II: 1, III: 0 }, core: 0, label: "9 / 5-" },
      { regular: (n) => n === 10, secondary: (n) => n <= 4, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "10 / 4-" },
      { regular: (n) => n >= 11, secondary: (n) => n <= 3, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "11+ / 3-" }
    ],
    2: [
      { regular: (n) => n === 7, secondary: (n) => n === 7, bp: { I: 0, II: 2, III: 1 }, core: 1, label: "7 / 7" },
      { regular: (n) => n >= 8, secondary: (n) => n === 7, bp: { I: 0, II: 1, III: 1 }, core: 1, label: "8+ / 7" },
      { regular: (n) => n === 8, secondary: (n) => n === 6, bp: { I: 0, II: 0, III: 1 }, core: 0, label: "8 / 6" },
      { regular: (n) => n === 9, secondary: (n) => n <= 6, bp: { I: 0, II: 1, III: 0 }, core: 0, label: "9 / 6-" },
      { regular: (n) => n === 10, secondary: (n) => n <= 6, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "10 / 6-" },
      { regular: (n) => n >= 11, secondary: (n) => n <= 5, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "11+ / 5-" }
    ],
    3: [
      { regular: (n) => n === 8, secondary: (n) => n === 8, bp: { I: 0, II: 1, III: 1 }, core: 1, label: "8 / 8" },
      { regular: (n) => n >= 9, secondary: (n) => n === 8, bp: { I: 0, II: 0, III: 1 }, core: 1, label: "9+ / 8" },
      { regular: (n) => n === 9, secondary: (n) => n === 7, bp: { I: 0, II: 1, III: 0 }, core: 0, label: "9 / 7" },
      { regular: (n) => n === 10, secondary: (n) => n <= 7, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "10 / 7-" },
      { regular: (n) => n === 11, secondary: (n) => n <= 7, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "11 / 7-" }
    ],
    4: [
      { regular: (n) => n === 8, secondary: (n) => n === 8, bp: { I: 0, II: 1, III: 1 }, core: 1, label: "8 / 8" },
      { regular: (n) => n >= 9, secondary: (n) => n === 8, bp: { I: 0, II: 0, III: 1 }, core: 1, label: "9+ / 8" },
      { regular: (n) => n === 9, secondary: (n) => n === 7, bp: { I: 0, II: 1, III: 0 }, core: 0, label: "9 / 7" },
      { regular: (n) => n === 10, secondary: (n) => n <= 7, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "10 / 7-" },
      { regular: (n) => n === 11, secondary: (n) => n <= 7, bp: { I: 0, II: 0, III: 0 }, core: 0, label: "11 / 7-" }
    ]
  };

  // Storybook rewards are selected by encounter, not just by the enemy's name.
  // Each row replaces the preceding row; card rewards are not cumulative.
  const STORY_DAMAGE_REWARDS = {
    ALPHA_TEMENOS: {
      resource: "MF", choices: ["MC", "CKB", "IM", "FM"],
      rows: [[4, 1, 0], [5, 2, 1], [6, 3, 1], [7, 4, 2, "迷宫宁芙召唤卡（秘密牌库 3，卡牌 30）"],
        [8, 5, 2], [9, 6, 3, "金字塔尖装备卡（秘密牌库 5，卡牌 46）"]]
    },
    SUN_DESCENDANT: {
      resource: "SK", choices: ["RC", "IF", "EC", "CL"],
      rows: [[5, 1, 0], [6, 2, 1], [7, 3, 1], [8, 4, 2, "亚特兰提斯振荡器装备卡（秘密牌库 8，卡牌 91）"],
        [9, 5, 2, "希望宁芙召唤卡（秘密牌库 9，卡牌 107）"], [10, 6, 3], [11, 7, 3, "代达罗斯之翼装备卡"]]
    },
    THE_BABELIAN_LUNACY: {
      resource: "blackTaintedStepfinger", choices: ["burnedOutGrace", "livingGold", "oldIremFragment", "wishEmbryo"],
      rows: [[5, 1, 0], [6, 2, 1], [7, 3, 1], [8, 4, 2, "硅宁芙召唤卡（秘密牌库 14，卡牌 249）"],
        [9, 5, 2], [10, 6, 3], [11, 7, 3, "都城装备卡（秘密牌库 11，卡牌 202）"]]
    },
    UR_FLEECE: {
      resource: "blackWoolStrand", choices: ["hydradynamicScales", "amygdalanExtract", "microwaveCell", "photophobicFlesh"],
      rows: [[4, 1, 0], [5, 2, 1], [6, 3, 1], [7, 4, 2, "剧场生成装备卡 1 张"],
        [8, 5, 2], [9, 6, 3], [10, 7, 3, "Strungstring 装备卡（秘密牌库 18，卡牌 292）"]]
    }
  };
  const STORY_BATTLE_SCENES = {
    HEKATON: [["normal", "百臂巨人之战"], ["ambush", "伏击战"]],
    LABYRINTHAUROS: [["normal", "迷宫机牛之战"], ["ambush", "伏击战"]],
    ALPHA_TEMENOS: [["normal", "吞域兽之战"], ["temenos-final", "没有迷宫之战"]],
    HERMESIAN_PURSUER: [["normal", "追踪者战斗"], ["pursuers-end", "追踪的终结（0299）"]],
    THE_BURDEN: [["normal", "重担之战"], ["burden-end", "最难承受的重担（0289）"]],
    THE_NIETZSCJEAN: [["normal", "残酷说教之战"], ["nietzsche-final", "你是什么？之战"]],
    SUN_DESCENDANT: [["normal", "忍受烈日之战"], ["sun-final", "与日竞赛之战"]],
    THE_BABELIAN_LUNACY: [["normal", "潘多拉视界之战"], ["babel-final", "撞击之战"]],
    DAHAKA: [["normal", "收割旋风之战"], ["dahaka-end", "扬谷之战（3278）"]],
    TITAN_X: [["normal", "魔鬼本人之战"], ["titan-end", "血浓于水（5289）"], ["titan-group", "万事皆休（9299）"]],
    UR_FLEECE: [["normal", "严酷真相之战"], ["ur-final", "善意谎言之战"]]
  };
  const STORY_KILL_APOSTLES = new Set(["ALPHA_TEMENOS", "HERMESIAN_PURSUER", "THE_BURDEN",
    "THE_NIETZSCJEAN", "SUN_DESCENDANT", "THE_BABELIAN_LUNACY", "DAHAKA", "TITAN_X", "UR_FLEECE"]);
  const STORY_END_SCENES = new Set(["pursuers-end", "burden-end", "dahaka-end", "titan-end"]);
  const STORY_FINAL_SCENES = new Set(["temenos-final", "nietzsche-final", "sun-final", "babel-final", "ur-final"]);

  function storySceneOptions(apostle) {
    return STORY_BATTLE_SCENES[apostle] || [["normal", `${apostleZhName(apostle)}之战`]];
  }

  function storyOutcomeOptions(apostle, sceneId) {
    const options = [["victory", "胜利"], ["defeat", "失败"]];
    if (sceneId === "normal" && STORY_KILL_APOSTLES.has(apostle)) {
      options[0][1] = apostle === "THE_BURDEN" ? "胜利：到达山顶" : "胜利：普通胜利";
      options.splice(1, 0, ["kill", apostle === "TITAN_X" ? "胜利：伤及泰坦 X" : "胜利：击杀 Boss"]);
    }
    if ((sceneId === "normal" && !STORY_KILL_APOSTLES.has(apostle)) || sceneId === "ambush") {
      if (sceneId !== "ambush") options.push(["retreat", "撤退"]);
    }
    return options;
  }

  function storyBattleContext(apostle, state, options) {
    const automatic = apostle === "TITAN_X" && state.special?.titanX?.group ? "titan-group"
      : apostle === "TITAN_X" && state.special?.titanX?.awakeningWon ? "titan-end" : "normal";
    const scenes = storySceneOptions(apostle);
    const sceneId = scenes.some(([id]) => id === options.sceneId) ? options.sceneId : automatic;
    const outcomes = storyOutcomeOptions(apostle, sceneId);
    const outcome = outcomes.some(([id]) => id === options.outcome) ? options.outcome : "victory";
    const won = outcome === "victory" || outcome === "kill";
    const ending = STORY_END_SCENES.has(sceneId) && won;
    const firstVictoryEligible = sceneId === "normal" && outcome === "kill"
      && ["HERMESIAN_PURSUER", "DAHAKA", "TITAN_X"].includes(apostle);
    return {
      sceneId, sceneLabel: scenes.find(([id]) => id === sceneId)[1], outcome, won, ending,
      firstVictoryEligible, firstVictory: firstVictoryEligible && options.firstVictory === true,
      firstReward: options.firstReward === "echoes" ? "echoes" : "sisyphusTears",
      resourcePolicy: STORY_FINAL_SCENES.has(sceneId) ? "none"
        : sceneId === "ambush" ? "coreOnly"
        : apostle === "ALPHA_TEMENOS" && sceneId === "normal" ? "tableOnly" : "normal"
    };
  }

  function applyStoryDamageBonus(apostle, damage, choices, totals, details, errors, reminders) {
    const config = STORY_DAMAGE_REWARDS[apostle];
    const row = config.rows.filter(([min]) => damage >= min).at(-1);
    const count = row?.[2] || 0;
    const selected = {};
    let valid = true;
    config.choices.forEach((key) => {
      const amount = Number(choices?.[key] ?? 0);
      if (!Number.isInteger(amount) || amount < 0) valid = false;
      selected[key] = Number.isInteger(amount) && amount >= 0 ? amount : 0;
    });
    if (Object.keys(choices || {}).some((key) => !config.choices.includes(key) && Number(choices[key]) !== 0)) valid = false;
    const selectedCount = Object.values(selected).reduce((sum, n) => sum + n, 0);
    if (!valid || selectedCount !== count) {
      errors.push(`伤害奖励需要选择 ${count} 个指定资源，当前选择 ${selectedCount} 个；数量须为非负整数。`);
    }
    const resource = row ? { [config.resource]: row[1] } : {};
    if (valid && selectedCount === count) {
      Object.entries(selected).forEach(([key, amount]) => { if (amount) resource[key] = amount; });
    }
    addResourceTotals(totals, resource, 1);
    if (row) addDetailResource(details, `${apostleZhName(apostle)}：${damage} 损伤（${row[0]} 档）`, resource, 1);
    if (row?.[3]) reminders.push(`额外获得：${row[3]}，请手动处理。`);
    return { damage, threshold: row?.[0] || 0, choiceCount: count, choiceKeys: config.choices, selected };
  }

  function applyStoryBattleRewards(apostle, battle, totals, details, rareResources, reminders) {
    const { sceneId, outcome, won, ending } = battle;
    const c1 = APOSTLE_RECORD_CYCLE[apostle] === "c1";
    if (battle.resourcePolicy !== "none") {
      const fate = ending ? (sceneId === "pursuers-end" ? 3 : 4) : c1 ? 2 : 3;
      // The normal Temenos encounter has only its special reward table.
      if (battle.resourcePolicy !== "tableOnly") reminders.push(`战后：重置三曲盘；阿尔戈号命运减少 ${fate}；清点死亡泰坦并弃除状态和指示物（C5 普通战保留恐怖与大恐怖）。`);
    }
    const add = (source, resource) => {
      addResourceTotals(totals, resource, 1);
      addDetailResource(details, source, resource, 1);
    };
    if (battle.firstVictory) {
      add("首次击杀奖励", { [apostle === "TITAN_X" ? battle.firstReward : "sisyphusTears"]: 1 });
      reminders.push("首次击杀：阿尔戈号知识 +1，请手动记录。首次奖励仅领取一次，请确认以往未领取。");
    }
    if (sceneId === "titan-group" && won) {
      add("万事皆休 9299 额外资源", { sisyphusTears: 1, pygmalionStones: 1, echoes: 1 });
      reminders.push("阅读 C5 9299：阿尔戈号知识 +1；若 G6 已标记，获得解放者之钉忆识装备卡（一旦可用），请手动处理。");
    }
    if (ending) {
      const endReminders = {
        "pursuers-end": "阅读 C1 0299：标记 P8，阿尔戈号知识 +1，获得循环 II 青铜巢穴科技和回天者泰坦；按循环处理邪恶的觉醒事件。划掉追踪者名字及战斗轨标记。",
        "burden-end": "阅读 C3 0289：阿尔戈号知识 +1，获得重担解剖科技、真相背负者泰坦和仇敌装药卡（秘密牌库 5，卡牌 45）；按条件添加 5 天后的破碎循环事件，处理内蕴奥德赛 60。划掉重担名字及战斗轨标记。",
        "dahaka-end": "阅读 C4 3278：获得达哈卡解剖科技和不朽真相背负者泰坦，处理内蕴奥德赛 80：返乡。",
        "titan-end": "阅读 C5 5289：解锁泰坦 X 调查科技，获得行刑者泰坦；5 天后添加万事皆休事件（7539），处理内蕴奥德赛 101，然后阅读 5424。"
      };
      reminders.push(endReminders[sceneId]);
      if (sceneId === "pursuers-end") rareResources.push("损坏的密码筒");
    }
    if (STORY_FINAL_SCENES.has(sceneId)) {
      const finalReminders = {
        "temenos-final": "没有迷宫：胜利阅读 C1 0129；失败时游戏结束，按深不可测的万世特殊事件标记命运方框。",
        "nietzsche-final": "你是什么？：按最终战故事结算；失败时游戏结束，阅读 C2 0246。",
        "sun-final": "与日竞赛：胜利阅读 C3 0196；失败时游戏结束，阅读 0259。",
        "babel-final": "撞击：胜利阅读 C4 3328并处理信封 R；失败时游戏结束，按贫瘠万世特殊事件标记定数框。",
        "ur-final": "善意谎言：胜利按故事结局处理；失败时游戏结束，阅读 C5 4214。"
      };
      reminders.push(finalReminders[sceneId]);
      return;
    }
    if (apostle === "TITAN_X" && !ending) reminders.push("从相应牌库移除 3 张标有 Titan X 的循环 V 特殊创伤卡；若首次与泰坦 X 战斗，加入泰坦 X 观察科技并获得阿尔戈号知识 +1。");
    if (sceneId !== "normal") {
      if (!won && STORY_END_SCENES.has(sceneId)) reminders.push("按对应普通战失败的后果结算，重新生成仇敌；特殊卡牌弃置与其他后果请查本场战斗介绍。");
      return;
    }
    if (apostle === "ALPHA_TEMENOS") reminders.push(outcome === "kill" ? "击杀吞域兽：立即阅读 C1 0169。" : "获得特殊奖励后，阅读战前备注的特殊后果段落；若未备注，查看发起战斗的故事段落。");
    if (["HERMESIAN_PURSUER", "THE_BURDEN", "DAHAKA", "TITAN_X"].includes(apostle)) {
      const sighting = { HERMESIAN_PURSUER: "追踪者目击", THE_BURDEN: "重担观察", DAHAKA: "达哈卡目击", TITAN_X: "泰坦 X 观察" }[apostle];
      reminders.push(`若首次与该 Boss 战斗：加入${sighting}科技并获得阿尔戈号知识 +1，请手动处理。`);
    }
    if (apostle === "THE_NIETZSCJEAN") reminders.push("首次战斗获得尼采观察科技；本场被消灭的泰坦记为伤残，按故事书处理。");
    if (["THE_BABELIAN_LUNACY", "UR_FLEECE"].includes(apostle)) reminders.push("若首次与该 Boss 战斗：将对应观察／目击科技加入项目牌库。");
    if (won && ["HERMESIAN_PURSUER", "THE_BURDEN", "DAHAKA", "TITAN_X"].includes(apostle)) {
      const event = ["HERMESIAN_PURSUER", "THE_BURDEN"].includes(apostle) ? "法洛斯之梦"
        : apostle === "DAHAKA" ? "一万个日夜" : "浅滩布道";
      reminders.push(`在时间线上添加 2 天后的${event}事件／冒险。`);
    } else if (apostle === "THE_BURDEN") reminders.push("在时间线上添加 2 天后的法洛斯之梦事件。");
    if (outcome === "victory" && ["THE_NIETZSCJEAN", "SUN_DESCENDANT", "THE_BABELIAN_LUNACY", "UR_FLEECE"].includes(apostle)) {
      reminders.push("意料之外的阿尔戈英雄获得 1 个回忆节点，请手动记录。");
      if (apostle === "THE_BABELIAN_LUNACY") reminders.push("在时间线上添加 2 天后的一万个日夜冒险。");
    }
    if (outcome === "kill") {
      const kills = {
        HERMESIAN_PURSUER: "若 E1 已标记且阿尔戈号知识 15+，处理内蕴奥德赛 19；禁用玩弄特性并备注战斗轨。结算后阅读 C1 0201。",
        THE_BURDEN: "若首次击杀，阿尔戈号知识 +1；忽略山顶资源，备注并启用后续特殊特性。阅读 C2 0259。",
        THE_NIETZSCJEAN: "阅读 C2 0270：进展 +2、阿尔戈号知识 +1，后续尼采战斗改为等级 2，然后继续正常奖励与惩罚。",
        SUN_DESCENDANT: "阅读 C3 0256：进展 +2、阿尔戈号知识 +1，后续坠落太阳战斗改为等级 2。",
        THE_BABELIAN_LUNACY: "阅读 C4 4142：进展 +2、阿尔戈号知识 +1，后续战斗提高 Boss 等级，然后继续正常后果。",
        DAHAKA: "禁用悔恨枷锁特性并备注战斗轨；结算后阅读 C4 0035。",
        TITAN_X: "禁用戏弄特性并备注战斗轨；结算后阅读 C5 0946。",
        UR_FLEECE: "阅读 C5 1316：进展 +2，后续战斗提高 Boss 等级，然后继续正常后果。"
      };
      if (kills[apostle]) reminders.push(kills[apostle]);
      if (apostle === "UR_FLEECE") add("特殊击杀 1316", { echoes: 1 });
    }
    if (outcome === "defeat" || outcome === "retreat") reminders.push("请按本场战斗介绍处理灾祸、伤亡、未参战泰坦损失及特殊状态；这些后果需手动结算。");
  }

  function safeGetCurrentApostle() {
    try {
      return currentApostle;
    } catch {
      return "";
    }
  }

  function safeGetPiles() {
    try {
      return piles;
    } catch {
      return null;
    }
  }

  function safeCardFileName(card, apostle) {
    if (!card || card.special) return "";
    try {
      if (typeof cardFileName === "function") {
        return cardFileName(card, apostle);
      }
    } catch {}

    const type = card.type || "BP";
    const level = card.level || "I";
    const index = String(card.index || 1).padStart(3, "0");
    return `${apostle}_${type}_${level}_${index}.jpg`;
  }

  function safeCardSrc(card, apostle, fileName = "") {
    if (card && card.special) {
      return `ps/other/${encodePathPart(card.special)}.jpg`;
    }
    if (card?.src) {
      return window.HeliosAssets?.resolve ? window.HeliosAssets.resolve(card.src) : card.src;
    }

    const name = fileName || safeCardFileName(card, apostle);
    return `ps/${encodePathPart(apostle)}/${encodePathFileName(name)}`;
  }

  function resourceIconSrc(key) {
    if (DIRECT_RECORD_RESOURCE_KEYS.has(key)) {
      const version = key === "orichalcumAlloy" || key === "slaveMetal" ? "?v=20260926-c5-pdf1" : "";
      return `../record/assets/resource-icons/${encodePathFileName(key)}.png${version}`;
    }
    return `${RESOURCE_ICON_BASE}/${encodePathFileName(key)}.png`;
  }

  function resourceCode(key) {
    return String(key || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 3);
  }

  function resourceIconMarkup(key, small = false) {
    const classes = [
      "loot-resource-icon",
      small ? "small" : "",
      DIRECT_RECORD_RESOURCE_KEYS.has(key) ? "record-resource-icon" : ""
    ].filter(Boolean).join(" ");
    if (RESOURCE_ICON_KEYS.has(key)) {
      return `<img class="${classes}" src="${escapeAttr(resourceIconSrc(key))}" alt="${escapeAttr(resourceZhName(key))}" title="${escapeAttr(resourceZhName(key))}">`;
    }
    return `<span class="${classes} text" title="${escapeAttr(resourceZhName(key))}">${escapeHtml(resourceCode(key))}</span>`;
  }

  function resourceZhName(key) {
    return RESOURCE_ZH_NAME[key] || key;
  }

  function apostleZhName(apostle) {
    return APOSTLE_ZH_NAME[apostle] || apostle;
  }

  function encodePathPart(value) {
    return encodeURIComponent(String(value)).replaceAll("%2F", "/");
  }

  function encodePathFileName(value) {
    // encodeURIComponent preserves + as %2B, spaces as %20; browsers also support raw,
    // but encoded paths are safer for names like AT+.png.
    return String(value).split("/").map(encodePathPart).join("/");
  }

  function getResourceMap() {
    const map = window[RESOURCE_MAP_NAME] || {};
    if (map.BLACKBEAK || !map.HERMESIAN_PURSUER) return map;
    return {
      ...map,
      BLACKBEAK: Object.fromEntries(Object.entries(map.HERMESIAN_PURSUER)
        .filter(([file]) => file !== "HERMESIAN_PURSUER_BP_III_006.jpg")
        .map(([file, resources]) => [file.replace("HERMESIAN_PURSUER", "BLACKBEAK"), resources])),
    };
  }

  function getCurrentApostleData() {
    const apostle = safeGetCurrentApostle();
    const allPiles = safeGetPiles();

    if (!apostle || !allPiles || !allPiles[apostle]) {
      throw new Error("没有找到当前始徒存档。请先打开一个始徒页面。");
    }

    if (!allPiles[apostle].BP) {
      throw new Error("当前始徒没有 BP 存档。");
    }

    return {
      apostle,
      state: allPiles[apostle],
      bp: allPiles[apostle].BP
    };
  }

  function cloneCard(card) {
    return JSON.parse(JSON.stringify(card));
  }

  function cloneCards(cards) {
    return Array.isArray(cards) ? cards.map(cloneCard) : [];
  }

  function shuffle(cards) {
    const arr = cloneCards(cards);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function cardLevelValue(card) {
    if (!card || !card.level) return 0;
    return LEVEL_VALUE[String(card.level).toUpperCase()] ?? 0;
  }

  function getAllDamageCards(bp) {
    const result = [];

    ["damage", "damage1", "damage2"].forEach((key) => {
      if (Array.isArray(bp[key])) {
        bp[key].forEach((card) => result.push(cloneCard(card)));
      }
    });

    return result;
  }

  function getRegularDamageCards(apostle, bp) {
    if (apostle === CHIMERA_APOSTLE) {
      return cloneCards([].concat(bp.damage || [], bp.damage1 || []));
    }
    return getAllDamageCards(bp);
  }

  function getSecondaryDamageCards(apostle, bp) {
    if (apostle !== CHIMERA_APOSTLE) return [];
    return cloneCards(bp.damage2 || []);
  }

  function damageStackCount(cards) {
    return cloneCards(cards).reduce((sum, card) => {
      if (!card) return sum;
      if (card.special === "DW") return sum + 2;
      if (card.special === "SW") return sum + 1;
      return sum + Math.max(1, Math.floor(Number(card.damageValue) || 1));
    }, 0);
  }

  function isBpResourceCard(apostle, card) {
    return Boolean(card)
      && !card.special
      && (
        card.type === "BP"
        || (
          apostle === "DAHAKA"
          && card.type === "AI"
          && (card.combinedAibp || card.bpLevel)
        )
      );
  }

  function woundedBpIIIInStacks(apostle, ...stacks) {
    return stacks
      .flatMap((cards) => cloneCards(cards))
      .filter((card) =>
        isBpResourceCard(apostle, card)
        && (card.bpLevel || card.level) === "III"
      )
      .length;
  }

  function getBpDeckAndDiscardPool(bp) {
    const pool = [];
    if (Array.isArray(bp.deck)) {
      bp.deck.forEach((card) => {
        if (card && !card.special && card.type === "BP") pool.push(cloneCard(card));
      });
    }
    if (Array.isArray(bp.discard)) {
      bp.discard.forEach((card) => {
        if (card && !card.special && card.type === "BP") pool.push(cloneCard(card));
      });
    }
    return shuffle(pool);
  }

  function getBpSupplyPool(bp) {
    const pool = [];
    Object.values(bp.supply || {}).forEach((cards) => {
      if (!Array.isArray(cards)) return;
      cards.forEach((card) => {
        if (card && !card.special && card.type === "BP") pool.push(cloneCard(card));
      });
    });
    return shuffle(pool);
  }

  function groupPoolByLevel(pool) {
    const grouped = {};
    LEVEL_ORDER.forEach((level) => {
      grouped[level] = [];
    });

    pool.forEach((card) => {
      const level = String(card.level || "").toUpperCase();
      if (!grouped[level]) grouped[level] = [];
      grouped[level].push(card);
    });

    return grouped;
  }

  function drawLowestBpCard(grouped) {
    for (const level of LEVEL_ORDER) {
      const pile = grouped[level];
      if (pile && pile.length > 0) {
        return pile.pop();
      }
    }
    return null;
  }

  function drawBpIII(grouped) {
    const pile = grouped.III || [];
    if (pile.length > 0) return pile.pop();
    return null;
  }

  function drawSpecificBpLevel(grouped, level) {
    const pile = grouped[level] || [];
    if (pile.length > 0) return pile.pop();
    return null;
  }

  function emptyTotals(resourceKeys) {
    const totals = {};
    resourceKeys.forEach((key) => {
      totals[key] = 0;
    });
    return totals;
  }

  function collectResourceKeys(apostle, map) {
    const keys = new Set();

    if (map && map[apostle]) {
      Object.values(map[apostle]).forEach((entry) => {
        if (entry && typeof entry === "object") {
          Object.keys(entry).forEach((key) => keys.add(key));
        }
      });
    }

    if (keys.size === 0 && map) {
      Object.values(map).forEach((apostleEntry) => {
        if (!apostleEntry || typeof apostleEntry !== "object") return;
        Object.values(apostleEntry).forEach((entry) => {
          if (entry && typeof entry === "object") {
            Object.keys(entry).forEach((key) => keys.add(key));
          }
        });
      });
    }

    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }

  function getCardResource(apostle, fileName) {
    const map = getResourceMap();
    return map?.[apostle]?.[fileName] || null;
  }

  function addResourceTotals(totals, resource, multiplier) {
    if (!resource) return;
    Object.keys(resource).forEach((key) => {
      const value = Number(resource[key] || 0);
      if (!Number.isFinite(value)) return;
      if (!(key in totals)) totals[key] = 0;
      totals[key] += value * multiplier;
    });
  }

  function selectedApostleLevel() {
    try {
      const level = typeof currentApostleLevel === "function" ? Number(currentApostleLevel()) : 0;
      return Number.isFinite(level) && level >= 1 ? Math.floor(level) : 0;
    } catch {
      return 0;
    }
  }

  function recordStageLevel(trackKey, stageId) {
    const specific = RECORD_STAGE_LEVELS[trackKey]?.[stageId];
    if (specific !== undefined) return Number(specific);
    const numeric = String(stageId || "").match(/\d+/)?.[0];
    return numeric ? Number(numeric) : 0;
  }

  function recordEnemyLevel(record, apostle, activeCycle = "") {
    if (!isPlainObject(record?.enemies)) return 0;
    const config = APOSTLE_RECORD_ENEMY[apostle];
    if (!config) return 0;

    const currentCycle = activeCycle || record.cycle || "";
    const cycle = apostle === BURDEN_APOSTLE && currentCycle === "c3" ? "c3" : config.cycle;
    const trackKey = config.key;
    const levels = [];
    const nemesis = Boolean(RECORD_NEMESIS_CYCLES[apostle]);
    const nemesisPrefix = `nemesis:${trackKey}:`;
    const hasSharedNemesis = nemesis && Object.keys(record.enemies).some((key) => key.startsWith(nemesisPrefix));

    Object.entries(record.enemies).forEach(([key, value]) => {
      if (!value) return;
      if (hasSharedNemesis) {
        if (key.startsWith(nemesisPrefix)) levels.push(recordStageLevel(trackKey, key.slice(nemesisPrefix.length)));
        return;
      }
      if (!key.startsWith(`${cycle}:`) && !(nemesis && /^c[1-5]:/.test(key))) return;
      const parts = key.split(":");
      if (parts[1] === trackKey) {
        levels.push(recordStageLevel(trackKey, parts[2]));
        return;
      }
      if (parts[1] === "shared" && String(parts[2] || "").split("+").includes(trackKey)) {
        levels.push(recordStageLevel(trackKey, parts[3]));
      }
    });

    const legacyValue = record.enemies[trackKey];
    if (!hasSharedNemesis && legacyValue !== undefined && legacyValue !== true && legacyValue !== false) {
      levels.push(recordStageLevel(trackKey, legacyValue));
    }

    return Math.max(0, ...levels.filter((level) => Number.isFinite(level)));
  }

  async function recordMultiplierForApostle(apostle) {
    try {
      const server = await readServerRecordState();
      const level = recordEnemyLevel(server.state || {}, apostle, server.activeCycle);
      if (level > 0) return level;
    } catch {}

    const localLevel = recordEnemyLevel(readLocalRecordState(), apostle);
    return localLevel > 0 ? localLevel : 0;
  }

  function getApostleLevelResourceBonus(apostle, multiplier) {
    const level = Math.floor(Number(multiplier) || 0);
    const table = APOSTLE_LEVEL_RESOURCE_BONUS[apostle];
    if (!table) return null;
    const threshold = Object.keys(table)
      .map(Number)
      .filter((candidate) => Number.isFinite(candidate) && level >= candidate)
      .sort((a, b) => b - a)[0];
    return threshold === undefined ? null : { ...table[threshold] };
  }

  function resourceMultiplierForApostle(apostle, multiplier) {
    if (apostle === "BLACKBEAK") return 1;
    if (NO_LEVEL_RESOURCE_MULTIPLIER_APOSTLES.has(apostle)) return 1;
    return Math.max(1, Math.floor(Number(multiplier) || 1));
  }

  function findChimeraBonusRow(level, regularCount, secondaryCount) {
    const table = CHIMERA_BONUS_TABLE[Math.max(1, Math.min(4, Math.floor(Number(level) || 1)))] || [];
    return table.find((row) => row.regular(regularCount) && row.secondary(secondaryCount)) || null;
  }

  function addFlatResource(totals, key, value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount === 0) return;
    if (!(key in totals)) totals[key] = 0;
    totals[key] += amount;
  }

  function addDetailResource(detailList, source, resource, multiplier = 1) {
    if (!resource) return;
    detailList.push({ source, resource, multiplier });
  }

  function addBpIIICoreBonus(totals, coreDetails, amount, source = "Wounded BP III core") {
    const count = Math.max(0, Math.floor(Number(amount) || 0));
    if (count <= 0) return;
    addFlatResource(totals, CORE_RESOURCE, count);
    addDetailResource(coreDetails, source, { [CORE_RESOURCE]: count }, 1);
  }

  function applyBurdenSummitBonus(totals, summitTitanCount, details) {
    const count = Math.max(0, Math.min(4, Math.floor(Number(summitTitanCount) || 0)));
    const resource = BURDEN_SUMMIT_BONUS[count] || null;
    if (!resource) return { summitTitanCount: count, resource: null };

    addResourceTotals(totals, resource, 1);
    addDetailResource(details, `到达山顶泰坦：${count}`, resource, 1);
    return { summitTitanCount: count, resource };
  }

  function applyNietzscheDamageBonus(totals, damage, choices, details, warnings) {
    const damageCount = Math.max(0, Math.floor(Number(damage) || 0));
    const row = NIETZSCHE_DAMAGE_BONUS.find((candidate) => damageCount >= candidate.min) || null;
    const selected = {};
    NIETZSCHE_CHOICE_KEYS.forEach((key) => {
      selected[key] = Math.max(0, Math.floor(Number(choices?.[key]) || 0));
    });

    if (!row) return { damage: damageCount, choiceCount: 0, selected, resource: null, specialReward: "" };

    const selectedCount = Object.values(selected).reduce((sum, value) => sum + value, 0);
    if (selectedCount !== row.choiceCount) {
      warnings.push(`尼采超人伤害奖励：需要选择 ${row.choiceCount} 个任选资源，当前已选择 ${selectedCount} 个。`);
    }

    const resource = { LS: row.livingAbyss };
    let remainingChoices = row.choiceCount;
    NIETZSCHE_CHOICE_KEYS.forEach((key) => {
      const applied = Math.min(selected[key], remainingChoices);
      if (applied > 0) resource[key] = applied;
      remainingChoices -= applied;
    });
    addResourceTotals(totals, resource, 1);
    addDetailResource(details, `造成伤害：${damageCount}`, resource, 1);
    return {
      damage: damageCount,
      choiceCount: row.choiceCount,
      selected,
      resource,
      specialReward: row.specialReward || ""
    };
  }

  function drawChimeraBonusBp(requestedLevel, deckGrouped, supplyGrouped) {
    const start = BP_LEVEL_ORDER.indexOf(requestedLevel);
    for (let index = Math.max(0, start); index < BP_LEVEL_ORDER.length; index++) {
      const level = BP_LEVEL_ORDER[index];
      const drawnFromDeck = drawSpecificBpLevel(deckGrouped, level);
      if (drawnFromDeck) {
        return { card: drawnFromDeck, requestedLevel, finalLevel: level, from: "BP deck/discard" };
      }

      const drawnFromSupply = drawSpecificBpLevel(supplyGrouped, level);
      if (drawnFromSupply) {
        return { card: drawnFromSupply, requestedLevel, finalLevel: level, from: "promotion supply" };
      }
    }
    return null;
  }

  function applyChimeraBonusLoot({
    apostle,
    bp,
    battleLevel,
    regularCount,
    secondaryCount,
    deckGrouped,
    totals,
    details,
    warnings,
    multiplier
  }) {
    const row = findChimeraBonusRow(battleLevel, regularCount, secondaryCount);
    const result = {
      battleLevel: Math.max(1, Math.min(4, Math.floor(Number(battleLevel) || 1))),
      regularCount,
      secondaryCount,
      rowLabel: row?.label || "",
      requested: row ? { ...row.bp } : { I: 0, II: 0, III: 0 },
      core: row?.core || 0,
      cards: []
    };

    if (!row) {
      warnings.push(`Chimera bonus: no reward row matched regular ${regularCount} / secondary ${secondaryCount}.`);
      return result;
    }

    if (row.core > 0) {
      addFlatResource(totals, CORE_RESOURCE, row.core);
      addDetailResource(details.chimeraBonus, `Chimera bonus core (${row.label})`, { [CORE_RESOURCE]: row.core }, 1);
    }

    const supplyGrouped = groupPoolByLevel(getBpSupplyPool(bp));
    BP_LEVEL_ORDER.forEach((level) => {
      const count = Number(row.bp[level] || 0);
      for (let i = 0; i < count; i++) {
        const bonus = drawChimeraBonusBp(level, deckGrouped, supplyGrouped);
        if (!bonus) {
          warnings.push(`Chimera bonus: cannot draw requested BP ${level} or any higher BP.`);
          continue;
        }

        const fileName = safeCardFileName(bonus.card, apostle);
        const res = getCardResource(apostle, fileName);
        if (!res) {
          warnings.push(`Chimera bonus drew ${fileName}, but it has no resource annotation.`);
          continue;
        }

        addResourceTotals(totals, res, multiplier);
        const item = {
          source: `Chimera bonus BP ${bonus.requestedLevel}${bonus.finalLevel !== bonus.requestedLevel ? ` -> ${bonus.finalLevel}` : ""} (${bonus.from})`,
          card: bonus.card,
          fileName,
          cardSrc: safeCardSrc(bonus.card, apostle, fileName),
          resource: res,
          multiplier
        };
        details.chimeraBonus.push(item);
        result.cards.push(item);
      }
    });

    return result;
  }

  function calculateBpLoot(options = {}) {
    const { apostle, bp, state } = getCurrentApostleData();
    const battle = storyBattleContext(apostle, state, options);
    const ordinary = battle.sceneId === "normal";
    const grantBpResources = battle.resourcePolicy === "normal";
    const map = getResourceMap();

    if (!map || !map[apostle]) {
      throw new Error(`没有找到 ${apostle} 的资源标注。请确认已加载 ps/other/resouce/bp_resource_map.js。`);
    }

    const isChimera = apostle === CHIMERA_APOSTLE;
    const isBurden = apostle === BURDEN_APOSTLE;
    const isNietzsche = apostle === NIETZSCHE_APOSTLE;
    const damageCards = isChimera ? getRegularDamageCards(apostle, bp) : getAllDamageCards(bp);
    const secondaryDamageCards = getSecondaryDamageCards(apostle, bp);
    const resourceKeys = collectResourceKeys(apostle, map);
    const selectedLevel = selectedApostleLevel();
    const recordMultiplier = Number(options.recordMultiplier || 0);
    const manualMultiplier = Number(options.multiplier || 0);
    const multiplier = Math.max(1, Math.floor(manualMultiplier || selectedLevel || recordMultiplier || 1));
    const resourceMultiplier = battle.ending ? multiplier : resourceMultiplierForApostle(apostle, multiplier);
    const multiplierSource = manualMultiplier > 0
      ? "manual"
      : selectedLevel > 0
        ? "aibp"
        : recordMultiplier > 0
          ? "record"
          : "default";
    const regularDamageCount = damageStackCount(damageCards);
    const secondaryDamageCount = damageStackCount(secondaryDamageCards);

    const totals = emptyTotals(resourceKeys);
    const directDetails = [];
    const swDetails = [];
    const dwDetails = [];
    const bonusDetails = [];
    const coreDetails = [];
    const warnings = [];
    const levelResourceBonus = grantBpResources ? getApostleLevelResourceBonus(apostle, multiplier) : null;
    const burdenBonusDetails = [];
    const nietzscheBonusDetails = [];
    const storyBonusDetails = [];
    const validationErrors = [];
    const reminders = [];
    const rareResources = [];

    if (levelResourceBonus) {
      addResourceTotals(totals, levelResourceBonus, 1);
    }

    const swCount = damageCards.filter((card) => card && card.special === "SW").length;
    const dwCount = damageCards.filter((card) => card && card.special === "DW").length;
    const normalDamageCards = damageCards.filter((card) => card && !card.special);
    const woundedBpIIICount = woundedBpIIIInStacks(apostle, damageCards);

    if (grantBpResources || battle.resourcePolicy === "coreOnly") {
      addBpIIICoreBonus(totals, coreDetails, woundedBpIIICount, "暴击 BP III 核心奖励");
    }

    normalDamageCards.forEach((card) => {
      if (!grantBpResources) return;
      const fileName = safeCardFileName(card, apostle);
      const res = getCardResource(apostle, fileName);
      if (!res) {
        warnings.push(`没有资源标注：${fileName}`);
        return;
      }

      addResourceTotals(totals, res, resourceMultiplier);
      directDetails.push({
        source: "BP损伤卡",
        card,
        fileName,
        cardSrc: safeCardSrc(card, apostle, fileName),
        resource: res,
        multiplier: resourceMultiplier
      });
    });

    const mixedPool = getBpDeckAndDiscardPool(bp);
    const grouped = groupPoolByLevel(mixedPool);

    for (let i = 0; grantBpResources && i < swCount; i++) {
      const drawn = drawLowestBpCard(grouped);
      if (!drawn) {
        warnings.push(`SW #${i + 1} 无法结算：BP卡组+弃牌堆中没有可抽取的BP卡。`);
        continue;
      }

      const fileName = safeCardFileName(drawn, apostle);
      const res = getCardResource(apostle, fileName);
      if (!res) {
        warnings.push(`SW #${i + 1} 抽到 ${fileName}，但没有资源标注。`);
        continue;
      }

      addResourceTotals(totals, res, resourceMultiplier);
      swDetails.push({
        source: "SW",
        card: drawn,
        fileName,
        cardSrc: safeCardSrc(drawn, apostle, fileName),
        resource: res,
        multiplier: resourceMultiplier
      });
    }

    for (let i = 0; grantBpResources && i < dwCount; i++) {
      const drawn = drawBpIII(grouped);
      if (!drawn) {
        warnings.push(`DW #${i + 1} 无法结算：BP卡组+弃牌堆中没有BP III。`);
        continue;
      }

      const fileName = safeCardFileName(drawn, apostle);
      const res = getCardResource(apostle, fileName);
      if (!res) {
        warnings.push(`DW #${i + 1} 抽到 ${fileName}，但没有资源标注。`);
        continue;
      }

      addResourceTotals(totals, res, resourceMultiplier);
      dwDetails.push({
        source: "DW",
        card: drawn,
        fileName,
        cardSrc: safeCardSrc(drawn, apostle, fileName),
        resource: res,
        multiplier: resourceMultiplier
      });
    }

    const chimeraBonus = isChimera && grantBpResources
      ? applyChimeraBonusLoot({
          apostle,
          bp,
          battleLevel: multiplier,
          regularCount: regularDamageCount,
          secondaryCount: secondaryDamageCount,
          deckGrouped: grouped,
          totals,
          details: { chimeraBonus: bonusDetails },
          warnings,
          multiplier
        })
      : null;
    const burdenBonus = isBurden && ordinary && battle.outcome !== "kill"
      ? applyBurdenSummitBonus(totals, options.summitTitanCount, burdenBonusDetails)
      : null;
    const nietzscheBonus = isNietzsche && ordinary
      ? applyNietzscheDamageBonus(totals, regularDamageCount, options.nietzscheChoices, nietzscheBonusDetails, warnings)
      : null;

    const storyBonus = ordinary && STORY_DAMAGE_REWARDS[apostle]
      ? applyStoryDamageBonus(apostle, regularDamageCount, options.resourceChoices, totals,
        storyBonusDetails, validationErrors, reminders) : null;
    if (nietzscheBonus) {
      const raw = options.nietzscheChoices || {};
      if (Object.values(nietzscheBonus.selected).reduce((sum, n) => sum + n, 0) !== nietzscheBonus.choiceCount
        || Object.entries(raw).some(([key, n]) => !NIETZSCHE_CHOICE_KEYS.includes(key) && Number(n) !== 0
          || !Number.isInteger(Number(n)) || Number(n) < 0)) {
        validationErrors.push(`尼采超人伤害奖励：请选择恰好 ${nietzscheBonus.choiceCount} 个指定资源，数量须为非负整数。`);
      }
      if (nietzscheBonus.specialReward) reminders.push(`额外获得：${nietzscheBonus.specialReward}${nietzscheBonus.specialReward.includes("尼采宁芙") ? "（随资源入账）" : "，请手动处理"}。`);
    }
    applyStoryBattleRewards(apostle, battle, totals, storyBonusDetails, rareResources, reminders);

    return {
      apostle,
      battle,
      storyBonus,
      validationErrors,
      reminders,
      rareResources,
      multiplier,
      resourceMultiplier,
      ignoresLevelResourceMultiplier: resourceMultiplier === 1 && multiplier !== 1,
      multiplierSource,
      swCount,
      dwCount,
      damageCount: damageCards.length,
      normalDamageCount: normalDamageCards.length,
      woundedBpIIICount,
      regularDamageCount,
      secondaryDamageCount,
      chimeraBonus,
      burdenBonus,
      nietzscheBonus,
      totals,
      details: {
        storyBonus: storyBonusDetails,
        direct: directDetails,
        sw: swDetails,
        dw: dwDetails,
        chimeraBonus: bonusDetails,
        burdenBonus: burdenBonusDetails,
        nietzscheBonus: nietzscheBonusDetails,
        coreBonus: coreDetails,
        levelBonus: levelResourceBonus
          ? [{ source: "始徒等级奖励", resource: levelResourceBonus, multiplier: 1 }]
          : []
      },
      warnings
    };
  }

  function formatResource(resource) {
    return Object.entries(resource || {})
      .filter(([, value]) => Number(value || 0) !== 0)
      .map(([key, value]) => `${resourceZhName(key)}：${value}`)
      .join("  ") || "无";
  }

  function buildLootDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "bpLootDialog";
    dialog.className = "loot-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="loot-dialog-inner">
        <div class="loot-dialog-head">
          <div class="loot-dialog-title">BP 战利品计算</div>
          <button type="button" class="loot-dialog-close">×</button>
        </div>

        <div class="loot-dialog-body">
          <div class="loot-toolbar">
            <label class="loot-multiplier-label">战斗场景 <select class="loot-scene-input"></select></label>
            <label class="loot-multiplier-label">战斗结果 <select class="loot-outcome-input"></select></label>
            <label class="loot-first-victory-label" hidden><input type="checkbox" class="loot-first-victory-input">首次击杀，领取首次资源奖励</label>
            <label class="loot-multiplier-label loot-first-reward-label" hidden>首次资源 <select class="loot-first-reward-input">
              <option value="sisyphusTears">西西弗斯之泪</option><option value="echoes">记忆之回响</option>
            </select></label>
            <label class="loot-multiplier-label">
              始徒等级倍率
              <input type="number" min="1" max="10" step="1" class="loot-multiplier-input">
            </label>
            <label class="loot-multiplier-label loot-burden-summit-label" hidden>
              到达山顶泰坦数量
              <input type="number" min="0" max="4" step="1" value="0" class="loot-burden-summit-input">
            </label>
            <div class="loot-nietzsche-choices" hidden>
              <span>任选资源数量：</span>
              <label>奇美拉焦油 <input type="number" min="0" max="3" step="1" value="0" data-nietzsche-choice="CT"></label>
              <label>超固体块 <input type="number" min="0" max="3" step="1" value="0" data-nietzsche-choice="URM"></label>
              <label>黑色锁链 <input type="number" min="0" max="3" step="1" value="0" data-nietzsche-choice="BC"></label>
              <label>独眼巨人甲胄 <input type="number" min="0" max="3" step="1" value="0" data-nietzsche-choice="CM"></label>
            </div>
            <div class="loot-story-choices" hidden></div>
            <button type="button" class="loot-recalc-button">重新随机计算</button>
          </div>

          <div class="loot-summary"></div>
          <div class="loot-warning"></div>
          <div class="loot-details"></div>
        </div>

        <div class="loot-dialog-actions">
          <button type="button" class="loot-copy-button">复制结果</button>
          <button type="button" class="loot-record-button">添加到记录表</button>
          <button value="close">关闭</button>
        </div>
      </form>
    `;

    document.body.appendChild(dialog);

    const closeButton = dialog.querySelector(".loot-dialog-close");
    closeButton.addEventListener("click", () => dialog.close());

    return dialog;
  }

  let lootDialog = null;
  let lastLootResult = null;

  function recordResourceKeyForLoot(apostle, key) {
    if (key === CORE_RESOURCE) return APOSTLE_RECORD_CORE_KEY[apostle] || "";
    if (DIRECT_RECORD_RESOURCE_KEYS.has(key)) return key;
    return RECORD_RESOURCE_KEY_MAP[key] || "";
  }

  function recordCycleForLoot(apostle, record, activeCycleOverride = "") {
    const activeCycle = ["c1", "c2", "c3", "c4", "c5"].includes(activeCycleOverride)
      ? activeCycleOverride
      : ["c1", "c2", "c3", "c4", "c5"].includes(record?.cycle)
        ? record.cycle
        : "";
    if (RECORD_NEMESIS_CYCLES[apostle]?.includes(activeCycle)) return activeCycle;
    return APOSTLE_RECORD_CYCLE[apostle] || activeCycle || RECORD_DEFAULT_CYCLE;
  }

  function recordResourceStorageKey(cycle, key) {
    return RECORD_SHARED_RESOURCE_KEYS.has(key) ? key : `${cycle}-${key}`;
  }

  function migrateSharedRecordResources(resources) {
    RECORD_SHARED_RESOURCE_KEYS.forEach((key) => {
      const values = ["c1", "c2", "c3"]
        .map((cycleId) => resources[`${cycleId}-${key}`])
        .filter((value) => value !== undefined && value !== null && value !== "");
      if (resources[key] !== undefined && resources[key] !== null && resources[key] !== "") {
        values.unshift(resources[key]);
      }
      if (!values.length) return;
      const numericValues = values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      resources[key] = numericValues.length === values.length
        ? Math.max(...numericValues)
        : values.map(String).filter(Boolean).join("\n");
      ["c1", "c2", "c3"].forEach((cycleId) => {
        delete resources[`${cycleId}-${key}`];
      });
    });
  }

  function appendRecordSyncLog(record, message) {
    const stamp = new Date().toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    const line = `${stamp} ${message}`;
    record.syncLog = [line, record.syncLog].filter(Boolean).join("\n").slice(0, 6000);
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function readLocalRecordState() {
    let record = {};
    try {
      record = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY) || "{}") || {};
    } catch {
      record = {};
    }
    return isPlainObject(record) ? record : {};
  }

  async function readServerRecordState(target = null) {
    if (typeof campaignSession !== "undefined") campaignSession?.assertCurrent?.();
    const response = await fetch(CAMPAIGN_STATE_URL, { cache: "no-store" });
    if (response.status === 401) return { available: false, state: null, error: "需要先登录，NAS 未同步。" };
    if (!response.ok) throw new Error(`NAS 读取失败：HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "NAS 读取失败");
    const accountId = payload.user?.id || "";
    const expectedAccountId = target?.accountId
      || (typeof currentCampaignAccountId === "function" ? currentCampaignAccountId() : "");
    if (!accountId || (expectedAccountId && accountId !== expectedAccountId)) {
      throw new Error("登录账号已切换或无法确认，请刷新 AIBP 后重试。");
    }
    const campaign = isPlainObject(payload.campaign) ? payload.campaign : {};
    const sections = isPlainObject(campaign.sections) ? campaign.sections : {};
    const userId = target?.userId || sections.dashboard?.activeProfileId || "default";
    if (target && sections.dashboard?.profiles && !sections.dashboard.profiles[userId]) {
      throw new Error("原战利品档案已不存在，未写入记录表。");
    }
    const activeProfile = sections.dashboard?.profiles?.[userId] || null;
    const activeCycle = activeProfile?.activeCycleId || sections.dashboard?.activeCycleId || "";
    const recordSection = sections.record;
    const state = recordSection?.users
      ? recordSection.users[userId] || null
      : recordSection;
    return {
      available: true,
      state: isPlainObject(state) ? state : null,
      userId,
      accountId,
      activeCycle,
      revision: Math.max(0, Number(campaign.sectionRevisions?.record || 0)),
    };
  }

  async function writeServerRecordState(record, userId, expectedRevision, accountId) {
    const response = await fetch(RECORD_SECTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "record",
        userId: userId || "default",
        state: record,
        expectedRevision,
        expectedAccountId: accountId,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 409 && payload?.code === "SAVE_CONFLICT") return { conflict: true };
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `NAS 写入失败：HTTP ${response.status}`);
    return { conflict: false, revision: Math.max(0, Number(payload.revision || 0)) };
  }

  function normalizeRecordCrewCounters(record) {
    if (!isPlainObject(record)) return record;
    record.cycleStats = isPlainObject(record.cycleStats) ? record.cycleStats : {};
    const c2 = record.cycleStats.c2 = isPlainObject(record.cycleStats.c2) ? record.cycleStats.c2 : {};
    if (isPlainObject(c2.crewCounters)) return record;
    const legacyBoxes = isPlainObject(record.crewBoxes) ? record.crewBoxes : {};
    let refugees = 0;
    let captives = 0;
    Object.entries(legacyBoxes).forEach(([key, value]) => {
      if (!key.startsWith("c2-crew-")) return;
      const normalized = value === true ? "refugee" : value;
      if (normalized === "refugee") refugees += 1;
      if (normalized === "captive") captives += 1;
    });
    const legacyTotal = Math.max(0, Math.floor(Number(c2.crew ?? record.crew ?? 5) || 0));
    c2.crewCounters = {
      crew: Math.max(0, legacyTotal - refugees - captives),
      refugees,
      captives,
    };
    c2.crew = String(c2.crewCounters.crew);
    return record;
  }

  function mergeRecordStates(serverRecord, localRecord) {
    // An existing server record is authoritative, including empty lists and
    // deleted fields. Old browser caches must not resurrect removed entries.
    const source = isPlainObject(serverRecord) ? serverRecord : (isPlainObject(localRecord) ? localRecord : {});
    return normalizeRecordCrewCounters(JSON.parse(JSON.stringify(source)));
  }

  function applyLootResultToRecord(record, result, activeCycleOverride = "") {
    if (!result) throw new Error("没有可添加的战利品结果。");
    if (result.validationErrors?.length) throw new Error(result.validationErrors.join("\n"));

    const updatedRecord = normalizeRecordCrewCounters(isPlainObject(record) ? { ...record } : {});
    updatedRecord.resources = isPlainObject(updatedRecord.resources) ? { ...updatedRecord.resources } : {};

    migrateSharedRecordResources(updatedRecord.resources);

    const cycle = recordCycleForLoot(result.apostle, updatedRecord, activeCycleOverride);
    updatedRecord.profileName ||= "阿尔戈号记录";
    updatedRecord.cycle ||= cycle;

    const added = [];
    const skipped = [];
    Object.entries(result.totals || {}).forEach(([key, value]) => {
      const amount = Number(value || 0);
      if (!amount) return;

      const recordKey = recordResourceKeyForLoot(result.apostle, key);
      if (!recordKey) {
        skipped.push(resourceZhName(key));
        return;
      }

      const fullKey = recordResourceStorageKey(cycle, recordKey);
      const current = Number(updatedRecord.resources[fullKey] || 0);
      updatedRecord.resources[fullKey] = Math.max(0, current + amount);
      added.push(`${resourceZhName(key)} +${amount}`);
    });

    const rareKey = recordResourceStorageKey(cycle, "rare");
    let rareText = String(updatedRecord.resources[rareKey] || "");
    (result.rareResources || []).forEach((name) => {
      if (rareText.includes(name) || name === "损坏的密码筒" && /damaged cryptex/i.test(rareText)) return;
      rareText = [rareText, name].filter(Boolean).join("\n");
      added.push(`稀有资源：${name}`);
    });
    if (result.rareResources?.length) updatedRecord.resources[rareKey] = rareText;

    if (result.nietzscheBonus?.specialReward?.includes("尼采宁芙召唤卡")) {
      updatedRecord.nymphCards = Array.isArray(updatedRecord.nymphCards) ? [...updatedRecord.nymphCards] : [];
      if (!updatedRecord.nymphCards.includes("nietzschean")) {
        updatedRecord.nymphCards.push("nietzschean");
        updatedRecord.nymph = String(updatedRecord.nymphCards.length);
        added.push("尼采宁芙召唤卡");
      }
    }

    if (!added.length) {
      throw new Error(`没有可写入记录表的资源。${skipped.length ? `未映射：${skipped.join(", ")}` : ""}`);
    }

    appendRecordSyncLog(updatedRecord, `AIBP ${result.apostle}${result.battle ? ` · ${result.battle.sceneLabel}` : ""} 战利品写入：${added.join("，")}${skipped.length ? `；未映射：${skipped.join(", ")}` : ""}`);

    return { record: updatedRecord, added, skipped, cycle };
  }

  async function addLootResultToRecord(result) {
    if (!result) throw new Error("没有可添加的战利品结果。");
    // Keep one operation identity across button retries. A lost success response
    // must not make the same result add resources twice.
    let operation = result.recordOperation || null;
    let server = await readServerRecordState(operation);
    if (!server.available) throw new Error(server.error || "连接不可用，战利品尚未入账，请恢复连接后重试。");
    if (!operation) {
      operation = result.recordOperation = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        userId: server.userId,
        accountId: server.accountId,
        activeCycle: server.activeCycle,
      };
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = mergeRecordStates(server.state || {}, {});
      const receipt = record.lootSettlements?.[operation.id];
      if (receipt) return { record, ...receipt, syncedToServer: true };
      const applied = applyLootResultToRecord(record, result, operation.activeCycle);
      applied.record.lootSettlements = {
        ...(isPlainObject(record.lootSettlements) ? record.lootSettlements : {}),
        [operation.id]: { added: applied.added, skipped: applied.skipped, cycle: applied.cycle },
      };
      const saved = await writeServerRecordState(applied.record, operation.userId, server.revision, operation.accountId);
      if (!saved.conflict) {
        RECORD_SYNC_CHANNEL?.postMessage({ revision: saved.revision });
        return { ...applied, syncedToServer: true };
      }
      server = await readServerRecordState(operation);
      if (!server.available) throw new Error(server.error || "读取不到原战利品档案，请恢复连接后重试。");
    }
    throw new Error("记录表持续被其他页面修改，本次尚未入账，请稍后重试。");
  }

  function renderStoryLootControls(dialog, result) {
    const battle = result.battle;
    const scene = dialog.querySelector(".loot-scene-input");
    scene.innerHTML = storySceneOptions(result.apostle).map(([id, label]) => `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`).join("");
    scene.value = battle.sceneId;
    const outcome = dialog.querySelector(".loot-outcome-input");
    outcome.innerHTML = storyOutcomeOptions(result.apostle, battle.sceneId).map(([id, label]) => `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`).join("");
    outcome.value = battle.outcome;
    dialog.querySelector(".loot-first-victory-label").hidden = !battle.firstVictoryEligible;
    dialog.querySelector(".loot-first-victory-input").checked = battle.firstVictory;
    dialog.querySelector(".loot-first-reward-label").hidden = !battle.firstVictory || result.apostle !== "TITAN_X";
    dialog.querySelector(".loot-first-reward-input").value = battle.firstReward;
    const choices = dialog.querySelector(".loot-story-choices");
    choices.hidden = !result.storyBonus?.choiceCount;
    choices.innerHTML = result.storyBonus ? `<span>额外任选资源：请选择 ${result.storyBonus.choiceCount} 个</span>`
      + result.storyBonus.choiceKeys.map((key) => `<label>${escapeHtml(resourceZhName(key))} <input type="number" min="0" max="${result.storyBonus.choiceCount}" step="1" value="${result.storyBonus.selected[key] || 0}" data-story-choice="${escapeAttr(key)}"></label>`).join("") : "";
  }

  function syncLootNumberControls(dialog) {
    dialog.querySelectorAll('.loot-toolbar input[type="number"]').forEach((input) => {
      if (!input.parentElement.classList.contains("loot-number-control")) {
        const label = input.closest("label")?.textContent.trim() || "数量";
        input.setAttribute("aria-label", label);
        const control = document.createElement("span");
        control.className = "loot-number-control";
        input.before(control);
        const buttons = [-1, 1].map((direction) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "loot-number-step";
          button.dataset.step = String(direction);
          button.textContent = direction < 0 ? "−" : "+";
          button.setAttribute("aria-label", `${direction < 0 ? "减少" : "增加"}${label}`);
          return button;
        });
        control.append(buttons[0], input, buttons[1]);
      }
      const value = input.valueAsNumber;
      input.parentElement.querySelector('[data-step="-1"]').disabled = input.disabled
        || (input.min !== "" && value <= Number(input.min));
      input.parentElement.querySelector('[data-step="1"]').disabled = input.disabled
        || (input.max !== "" && value >= Number(input.max));
    });
  }

  function readLootDialogOptions(dialog, resetScene = false) {
    const readChoices = (attribute) => Object.fromEntries([...dialog.querySelectorAll(`[${attribute}]`)]
      .map((input) => [input.getAttribute(attribute), Number(input.value)]));
    return {
      multiplier: Number(dialog.querySelector(".loot-multiplier-input").value || 1),
      sceneId: dialog.querySelector(".loot-scene-input").value,
      outcome: resetScene ? "victory" : dialog.querySelector(".loot-outcome-input").value,
      firstVictory: !resetScene && dialog.querySelector(".loot-first-victory-input").checked,
      firstReward: dialog.querySelector(".loot-first-reward-input").value,
      summitTitanCount: Number(dialog.querySelector(".loot-burden-summit-input").value || 0),
      nietzscheChoices: resetScene ? {} : readChoices("data-nietzsche-choice"),
      resourceChoices: resetScene ? {} : readChoices("data-story-choice")
    };
  }

  function renderLootResult(dialog, result) {
    lastLootResult = result;
    renderStoryLootControls(dialog, result);

    const multiplierInput = dialog.querySelector(".loot-multiplier-input");
    multiplierInput.value = String(result.multiplier);
    const burdenSummitLabel = dialog.querySelector(".loot-burden-summit-label");
    const burdenSummitInput = dialog.querySelector(".loot-burden-summit-input");
    if (burdenSummitLabel && burdenSummitInput) {
      burdenSummitLabel.hidden = !result.burdenBonus;
      burdenSummitInput.value = String(result.burdenBonus?.summitTitanCount || 0);
    }
    const nietzscheChoices = dialog.querySelector(".loot-nietzsche-choices");
    if (nietzscheChoices) {
      nietzscheChoices.hidden = !result.nietzscheBonus;
      nietzscheChoices.querySelectorAll("[data-nietzsche-choice]").forEach((input) => {
        input.value = String(result.nietzscheBonus?.selected?.[input.dataset.nietzscheChoice] || 0);
      });
    }

    syncLootNumberControls(dialog);

    const summary = dialog.querySelector(".loot-summary");
    const warning = dialog.querySelector(".loot-warning");
    const details = dialog.querySelector(".loot-details");
    const recordButton = dialog.querySelector(".loot-record-button");
    if (recordButton) {
      const hasResources = Object.values(result.totals || {}).some((amount) => Number(amount) > 0)
        || result.rareResources?.length || result.nietzscheBonus?.specialReward?.includes("尼采宁芙召唤卡");
      recordButton.disabled = !!result.validationErrors?.length || !hasResources;
      recordButton.textContent = result.validationErrors?.length ? "请完成资源选择" : hasResources ? "添加到记录表" : "仅有提醒，无需入账";
    }

    const totalRows = Object.entries(result.totals)
      .filter(([, value]) => Number(value || 0) !== 0)
      .map(([key, value]) => `
        <div class="loot-total-row">
          ${resourceIconMarkup(key)}
          <span>${escapeHtml(resourceZhName(key))}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </div>
      `)
      .join("");

    summary.innerHTML = `
      <div class="loot-meta">
        <div>当前始徒：<strong>${escapeHtml(apostleZhName(result.apostle))}</strong></div>
        <div>战斗场景：${escapeHtml(result.battle.sceneLabel)}</div>
        <div>结算规则：${escapeHtml({ normal: "BP 资源与特殊奖励", coreOnly: "仅暴击 BP III 核心", tableOnly: "仅伤害档位奖励", none: "按故事结局处理" }[result.battle.resourcePolicy])}</div>
        <div>损伤堆卡数：${result.damageCount}</div>
        <div>普通BP损伤：${result.normalDamageCount}</div>
        <div>单重损伤：${result.swCount}</div>
        <div>双重损伤：${result.dwCount}</div>
        <div>暴击 BP III：${result.woundedBpIIICount}（核心 +${result.details.coreBonus.reduce((sum, item) => sum + Number(item.resource.core || 0), 0)}）</div>
        <div>倍率：×${result.multiplier}</div>
        ${result.ignoresLevelResourceMultiplier ? `<div>资源倍率：×${result.resourceMultiplier}（该始徒不按等级乘资源）</div>` : ""}
        <div>倍率来源：${result.multiplierSource === "record" ? "记录表" : result.multiplierSource === "manual" ? "手动输入" : result.multiplierSource === "aibp" ? "AIBP当前始徒等级" : "默认等级 1"}</div>
        ${result.chimeraBonus ? `<div>奇美拉常规损伤：${escapeHtml(String(result.regularDamageCount))}</div>` : ""}
        ${result.chimeraBonus ? `<div>奇美拉第二损伤堆：${escapeHtml(String(result.secondaryDamageCount))}</div>` : ""}
        ${result.chimeraBonus ? `<div>奇美拉奖励条件：${escapeHtml(result.chimeraBonus.rowLabel || "无")}</div>` : ""}
        ${result.burdenBonus ? `<div>到达山顶泰坦：${escapeHtml(String(result.burdenBonus.summitTitanCount))}</div>` : ""}
        ${result.nietzscheBonus ? `<div>造成伤害：${escapeHtml(String(result.nietzscheBonus.damage))}</div>` : ""}
        ${result.nietzscheBonus ? `<div>任选资源：${escapeHtml(String(result.nietzscheBonus.choiceCount))} 个</div>` : ""}
      </div>
      <div class="loot-total-grid">
        ${totalRows || `<div class="loot-empty">没有获得资源</div>`}
      </div>
    `;

    const notices = [...(result.validationErrors || []), ...result.warnings];
    warning.innerHTML = notices.length
      ? `<div class="loot-warning-box">${notices.map(escapeHtml).join("<br>")}</div>`
      : "";

    const directRows = result.details.direct.map((item) => detailRow(item)).join("");
    const swRows = result.details.sw.map((item, idx) => detailRow(item, `SW #${idx + 1}`)).join("");
    const dwRows = result.details.dw.map((item, idx) => detailRow(item, `DW #${idx + 1}`)).join("");
    const chimeraBonusRows = (result.details.chimeraBonus || []).map((item) => item.card ? detailRow(item) : levelBonusRow(item)).join("");
    const burdenBonusRows = (result.details.burdenBonus || []).map((item) => levelBonusRow(item)).join("");
    const nietzscheBonusRows = (result.details.nietzscheBonus || []).map((item) => levelBonusRow(item)).join("");
    const coreBonusRows = (result.details.coreBonus || []).map((item) => levelBonusRow(item)).join("");
    const levelBonusRows = (result.details.levelBonus || []).map((item) => levelBonusRow(item)).join("");

    details.innerHTML = result.battle.resourcePolicy === "normal" ? `
      <section>
        <h4>普通 BP 损伤卡</h4>
        ${directRows || `<div class="loot-empty">无</div>`}
      </section>
      <section>
        <h4>通用单重损伤结算</h4>
        ${swRows || `<div class="loot-empty">无</div>`}
      </section>
      <section>
        <h4>通用双重损伤结算</h4>
        ${dwRows || `<div class="loot-empty">无</div>`}
      </section>
    ` : "";

    if (levelBonusRows) {
      details.insertAdjacentHTML("beforeend", `
        <section>
          <h4>始徒等级奖励</h4>
          ${levelBonusRows}
        </section>
      `);
    }

    if (coreBonusRows) {
      details.insertAdjacentHTML("beforeend", `
        <section>
          <h4>暴击 BP III 核心奖励</h4>
          ${coreBonusRows}
        </section>
      `);
    }

    if (result.chimeraBonus) {
      details.insertAdjacentHTML("beforeend", `
        <section>
          <h4>奇美拉第二损伤堆奖励</h4>
          <div class="loot-empty">
            Level ${escapeHtml(String(result.chimeraBonus.battleLevel))};
            regular ${escapeHtml(String(result.chimeraBonus.regularCount))};
            secondary ${escapeHtml(String(result.chimeraBonus.secondaryCount))};
            row ${escapeHtml(result.chimeraBonus.rowLabel || "none")};
            requested BP I/II/III =
            ${escapeHtml(String(result.chimeraBonus.requested.I || 0))}/
            ${escapeHtml(String(result.chimeraBonus.requested.II || 0))}/
            ${escapeHtml(String(result.chimeraBonus.requested.III || 0))};
            bonus core ${escapeHtml(String(result.chimeraBonus.core || 0))}
          </div>
          ${chimeraBonusRows || `<div class="loot-empty">No Chimera bonus resources</div>`}
        </section>
      `);
    }

    if (result.burdenBonus) {
      details.insertAdjacentHTML("beforeend", `
        <section>
          <h4>重担山顶额外资源</h4>
          ${burdenBonusRows || `<div class="loot-empty">没有泰坦到达山顶，不获得额外资源</div>`}
        </section>
      `);
    }

    if (result.nietzscheBonus) {
      details.insertAdjacentHTML("beforeend", `
        <section>
          <h4>尼采超人伤害额外奖励</h4>
          ${nietzscheBonusRows || `<div class="loot-empty">伤害低于 4，不获得额外资源</div>`}
          ${result.nietzscheBonus.specialReward ? `<div class="loot-empty">额外获得：${escapeHtml(result.nietzscheBonus.specialReward)}</div>` : ""}
        </section>
      `);
    }

    const storyRows = (result.details.storyBonus || []).map(levelBonusRow).join("");
    if (storyRows || result.rareResources?.length) {
      details.insertAdjacentHTML("beforeend", `<section><h4>故事书额外资源</h4>${storyRows}
        ${(result.rareResources || []).map((name) => `<div class="loot-empty">稀有资源：${escapeHtml(name)}</div>`).join("")}</section>`);
    }
    if (result.reminders?.length) {
      details.insertAdjacentHTML("beforeend", `<section><h4>其他奖励与后续处理（文字提醒）</h4>
        ${result.reminders.map((text) => `<p class="loot-story-reminder">${escapeHtml(text)}</p>`).join("")}</section>`);
    }

    details.querySelectorAll("[data-loot-zoom-src]").forEach((img) => {
      img.addEventListener("click", () => openLootImageZoom(img.dataset.lootZoomSrc || img.src));
    });
  }

  function detailRow(item, sourceText = "") {
    return `
      <div class="loot-detail-row">
        <div class="loot-detail-cardbox">
          <img class="loot-card-thumb" src="${escapeAttr(item.cardSrc)}" alt="${escapeAttr(sourceText || item.source)}" title="点击查看大图" data-loot-zoom-src="${escapeAttr(item.cardSrc)}">
          <div class="loot-detail-cardtext">
            <div class="loot-detail-source">${escapeHtml(sourceText || item.source)}</div>
          </div>
        </div>
        <div class="loot-detail-res">
          ${resourcePills(item.resource, item.multiplier)}
        </div>
      </div>
    `;
  }

  function levelBonusRow(item) {
    return `
      <div class="loot-detail-row">
        <div class="loot-detail-cardbox">
          <div class="loot-detail-cardtext">
            <div class="loot-detail-source">${escapeHtml(item.source || "始徒等级奖励")}</div>
          </div>
        </div>
        <div class="loot-detail-res">
          ${resourcePills(item.resource, item.multiplier)}
        </div>
      </div>
    `;
  }

  function resourcePills(resource, multiplier = 1) {
    const entries = Object.entries(resource || {}).filter(([, value]) => Number(value || 0) !== 0);
    if (entries.length === 0) return `<span class="loot-no-resource">无</span>`;

    return entries.map(([key, value]) => {
      const base = Number(value || 0);
      const total = base * multiplier;
      return `
        <span class="loot-resource-pill" title="${escapeAttr(resourceZhName(key))}">
          ${resourceIconMarkup(key, true)}
          <span class="loot-resource-key">${escapeHtml(resourceZhName(key))}</span>
          <strong>${escapeHtml(String(total))}</strong>
          ${multiplier !== 1 ? `<em>${escapeHtml(String(base))}×${escapeHtml(String(multiplier))}</em>` : ""}
        </span>
      `;
    }).join("");
  }

  function resultToText(result) {
    const lines = [];
    lines.push(`始徒：${apostleZhName(result.apostle)}`);
    if (result.battle) {
      lines.push(`战斗：${result.battle.sceneLabel} · ${storyOutcomeOptions(result.apostle, result.battle.sceneId).find(([id]) => id === result.battle.outcome)?.[1] || result.battle.outcome}`);
    }
    lines.push(`倍率：×${result.multiplier}`);
    if (result.ignoresLevelResourceMultiplier) {
      lines.push(`资源倍率：×${result.resourceMultiplier}（该始徒不按等级乘资源）`);
    }
    lines.push(`损伤堆卡数：${result.damageCount}`);
    lines.push(`普通 BP 损伤：${result.normalDamageCount}`);
    lines.push(`单重损伤：${result.swCount}`);
    lines.push(`双重损伤：${result.dwCount}`);
    lines.push("");
    lines.push("资源总计：");
    Object.entries(result.totals).forEach(([key, value]) => {
      if (Number(value || 0) !== 0) {
        lines.push(`  ${resourceZhName(key)}：${value}`);
      }
    });

    lines.push("");
    lines.push("结算详情：");
    result.details.direct.forEach((item) => lines.push(`  BP 损伤卡：${item.fileName} | ${formatResource(item.resource)} ×${item.multiplier}`));
    result.details.sw.forEach((item, idx) => lines.push(`  单重损伤 #${idx + 1}：${item.fileName} | ${formatResource(item.resource)} ×${item.multiplier}`));
    result.details.dw.forEach((item, idx) => lines.push(`  双重损伤 #${idx + 1}：${item.fileName} | ${formatResource(item.resource)} ×${item.multiplier}`));
    (result.details.coreBonus || []).forEach((item) => lines.push(`  暴击 BP III 核心奖励：${formatResource(item.resource)}`));
    if (result.chimeraBonus) {
      lines.push(`  Chimera bonus row: L${result.chimeraBonus.battleLevel} ${result.chimeraBonus.rowLabel || "none"} (regular ${result.chimeraBonus.regularCount}, secondary ${result.chimeraBonus.secondaryCount})`);
      (result.details.chimeraBonus || []).forEach((item) => {
        if (item.fileName) {
          lines.push(`  ${item.source}: ${item.fileName} | ${formatResource(item.resource)} x${item.multiplier}`);
        } else {
          lines.push(`  ${item.source}: ${formatResource(item.resource)}`);
        }
      });
    }
    if (result.burdenBonus) {
      lines.push(`  到达山顶泰坦：${result.burdenBonus.summitTitanCount}`);
      (result.details.burdenBonus || []).forEach((item) => lines.push(`  重担山顶额外资源：${formatResource(item.resource)}`));
    }
    if (result.nietzscheBonus) {
      lines.push(`  尼采超人造成伤害：${result.nietzscheBonus.damage}`);
      (result.details.nietzscheBonus || []).forEach((item) => lines.push(`  尼采超人伤害额外奖励：${formatResource(item.resource)}`));
      if (result.nietzscheBonus.specialReward) lines.push(`  尼采超人特殊奖励：${result.nietzscheBonus.specialReward}`);
    }
    (result.details.levelBonus || []).forEach((item) => lines.push(`  始徒等级奖励：${formatResource(item.resource)}`));
    (result.details.storyBonus || []).forEach((item) => lines.push(`  ${item.source}：${formatResource(item.resource)}`));
    (result.rareResources || []).forEach((name) => lines.push(`  稀有资源：${name}`));
    if (result.reminders?.length) {
      lines.push("", "其他奖励与后续处理（文字提醒）：", ...result.reminders.map((text) => `  ${text}`));
    }
    if (result.validationErrors?.length) lines.push("", "尚不能入账：", ...result.validationErrors.map((text) => `  ${text}`));

    if (result.warnings.length) {
      lines.push("");
      lines.push("提醒：");
      result.warnings.forEach((w) => lines.push(`  ${w}`));
    }

    return lines.join("\n");
  }

  async function showLootDialog() {
    try {
      if (!lootDialog) {
        lootDialog = buildLootDialog();

        const recalculate = (resetScene = false) => {
          try {
            renderLootResult(lootDialog, calculateBpLoot(readLootDialogOptions(lootDialog, resetScene)));
          } catch (error) {
            lootDialog.querySelector(".loot-record-button").disabled = true;
            window.alert(`战利品计算失败：${error.message || error}`);
          }
        };
        lootDialog.querySelector(".loot-recalc-button").addEventListener("click", () => recalculate());
        lootDialog.querySelector(".loot-toolbar").addEventListener("change", (event) => {
          recalculate(event.target.classList.contains("loot-scene-input"));
        });
        lootDialog.querySelector(".loot-toolbar").addEventListener("click", (event) => {
          const button = event.target.closest(".loot-number-step");
          if (!button || button.disabled) return;
          event.preventDefault();
          const input = button.parentElement.querySelector('input[type="number"]');
          if (input.disabled) return;
          const direction = Number(button.dataset.step);
          const selector = input.hasAttribute("data-story-choice")
            ? `[data-story-choice="${input.dataset.storyChoice}"]`
            : input.hasAttribute("data-nietzsche-choice")
              ? `[data-nietzsche-choice="${input.dataset.nietzscheChoice}"]`
              : `.${input.classList[0]}`;
          if (direction < 0) input.stepDown();
          else input.stepUp();
          input.dispatchEvent(new Event("change", { bubbles: true }));
          // Story choices are rebuilt when the result changes; retain keyboard focus.
          const control = lootDialog.querySelector(selector)?.parentElement;
          const nextButton = control?.querySelector(`[data-step="${direction}"]`);
          if (nextButton && !nextButton.disabled) nextButton.focus();
          else control?.querySelector("input")?.focus();
        });

        lootDialog.querySelector(".loot-copy-button").addEventListener("click", async () => {
          if (!lastLootResult) return;
          const text = resultToText(lastLootResult);
          try {
            await navigator.clipboard.writeText(text);
            window.alert("已复制战利品结果。");
          } catch {
            window.prompt("复制下面的结果：", text);
          }
        });

        lootDialog.querySelector(".loot-record-button").addEventListener("click", async () => {
          if (!lastLootResult) return;
          const button = lootDialog.querySelector(".loot-record-button");
          const result = lastLootResult;
          const controls = lootDialog.querySelectorAll(".loot-toolbar input, .loot-toolbar select, .loot-toolbar button");
          controls.forEach((control) => { control.disabled = true; });
          button.disabled = true;
          button.textContent = "写入中...";
          try {
            const { added, skipped, cycle } = await addLootResultToRecord(result);
            button.textContent = `已同步到 NAS (${cycle})`;
            window.alert([
              "已添加到阿尔戈号记录表：",
              added.join("\n"),
              skipped.length ? `\n未映射：${skipped.join(", ")}` : "",
              "\n已同步到 NAS 存档。",
            ].filter(Boolean).join("\n"));
          } catch (err) {
            button.disabled = false;
            button.textContent = "添加到记录表";
            window.alert(`未确认入账：\n${err.message || err}\n\n当前战利品结果仍保留，可恢复连接后在本弹窗重试；同一结果重试不会重复加资源。`);
          } finally {
            controls.forEach((control) => { control.disabled = false; });
            syncLootNumberControls(lootDialog);
          }
        });
      }

      const { apostle } = getCurrentApostleData();
      const recordMultiplier = selectedApostleLevel() ? 0 : await recordMultiplierForApostle(apostle);
      const result = calculateBpLoot({ recordMultiplier });
      renderLootResult(lootDialog, result);
      lootDialog.showModal();
    } catch (err) {
      window.alert(`战利品计算失败：\n${err.message || err}`);
    }
  }

  function openLootImageZoom(src) {
    if (!src) return;

    // Use a native dialog for zoom so it is placed in the browser top layer.
    // This prevents the loot calculation dialog from covering the zoom image.
    let zoomDialog = document.getElementById("lootImageZoomDialog");
    if (!zoomDialog) {
      zoomDialog = document.createElement("dialog");
      zoomDialog.id = "lootImageZoomDialog";
      zoomDialog.className = "loot-image-zoom-dialog";
      zoomDialog.innerHTML = `
        <button type="button" class="loot-image-zoom-close">×</button>
        <img class="loot-image-zoom-img" alt="zoom">
      `;
      document.body.appendChild(zoomDialog);

      zoomDialog.addEventListener("click", (event) => {
        if (event.target === zoomDialog || event.target.classList.contains("loot-image-zoom-close")) {
          zoomDialog.close();
        }
      });
    }

    zoomDialog.querySelector(".loot-image-zoom-img").src = src;

    if (zoomDialog.open) {
      zoomDialog.close();
    }
    zoomDialog.showModal();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function injectStyles() {
    if (document.getElementById("bpLootCalculatorStyles")) return;

    const style = document.createElement("style");
    style.id = "bpLootCalculatorStyles";
    style.textContent = `
      .loot-button {
        border-color: rgba(199, 173, 114, 0.46);
        color: var(--gold, #c7ad72);
        font-weight: 800;
      }

      .loot-dialog {
        width: min(1040px, calc(100vw - 28px));
        max-height: min(860px, calc(100vh - 28px));
        padding: 0;
        border: 1px solid rgba(199, 173, 114, 0.28);
        border-radius: var(--radius, 14px);
        background: #141311;
        color: var(--text, #f0ede4);
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
      }

      .loot-dialog::backdrop {
        background: rgba(0, 0, 0, 0.72);
      }

      .loot-dialog-inner {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        max-height: inherit;
      }

      .loot-dialog-head,
      .loot-dialog-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--line, #3a3832);
        background: linear-gradient(180deg, rgba(42, 40, 36, 0.98), rgba(28, 27, 24, 0.98));
      }

      .loot-dialog-actions {
        justify-content: flex-end;
        border-top: 1px solid var(--line, #3a3832);
        border-bottom: 0;
      }

      .loot-dialog-title {
        color: var(--gold, #c7ad72);
        font-size: 16px;
        font-weight: 800;
      }

      .loot-dialog-close {
        min-width: 34px;
        min-height: 30px;
        border-radius: 8px;
        font-size: 18px;
      }

      .loot-dialog-body {
        overflow: auto;
        padding: 14px;
        background: #0b0b0a;
      }

      .loot-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-bottom: 12px;
      }

      .loot-toolbar [hidden] {
        display: none;
      }

      .loot-multiplier-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--muted, #aaa396);
        font-size: 14px;
      }

      .loot-multiplier-input {
        width: 74px;
        min-height: 32px;
        border: 1px solid var(--line, #3a3832);
        border-radius: 8px;
        background: #151411;
        color: var(--text, #f0ede4);
        padding: 4px 8px;
        font: inherit;
      }

      .loot-nietzsche-choices {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        color: var(--muted, #aaa396);
        font-size: 12px;
        font-weight: 800;
      }

      .loot-nietzsche-choices[hidden] {
        display: none;
      }

      .loot-nietzsche-choices label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .loot-nietzsche-choices input {
        width: 48px;
        min-height: 32px;
        border: 1px solid var(--line, #3a3832);
        border-radius: 8px;
        background: #151411;
        color: var(--text, #f0ede4);
        padding: 4px 6px;
        font: inherit;
      }

      .loot-recalc-button,
      .loot-copy-button,
      .loot-dialog-actions button {
        min-height: 34px;
        padding: 6px 12px;
        border-radius: 8px;
      }

      .loot-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 8px;
        margin-bottom: 12px;
        color: var(--muted, #aaa396);
        font-size: 13px;
      }

      .loot-total-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }

      .loot-total-row {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border: 1px solid rgba(199, 173, 114, 0.22);
        border-radius: 10px;
        background: #171613;
      }

      .loot-total-row strong {
        color: var(--gold, #c7ad72);
        font-size: 20px;
      }

      .loot-resource-icon {
        width: 32px;
        height: 32px;
        object-fit: contain;
        border-radius: 6px;
        background: #080807;
      }

      .loot-resource-icon.small {
        width: 26px;
        height: 26px;
      }

      .loot-resource-icon.record-resource-icon {
        padding: 2px;
        background: #eee7d3;
        box-shadow: inset 0 0 0 1px rgba(23, 22, 19, 0.16);
      }

      .loot-resource-icon.text {
        display: inline-grid;
        place-items: center;
        color: #171613;
        background: #eee7d3;
        font-size: 10px;
        font-weight: 900;
        line-height: 1;
      }

      .loot-warning-box {
        margin: 10px 0 12px;
        padding: 10px 12px;
        border: 1px solid rgba(180, 52, 44, 0.55);
        border-radius: 10px;
        background: rgba(180, 52, 44, 0.12);
        color: #ffd5d1;
        font-size: 13px;
        line-height: 1.5;
      }

      .loot-details section {
        margin-top: 14px;
      }

      .loot-details h4 {
        margin: 0 0 8px;
        color: var(--gold, #c7ad72);
        font-size: 14px;
      }

      .loot-detail-row {
        display: grid;
        grid-template-columns: 190px minmax(280px, 1fr);
        gap: 10px;
        padding: 9px 10px;
        border: 1px solid rgba(199, 173, 114, 0.14);
        border-radius: 10px;
        background: #141311;
        margin-bottom: 8px;
        font-size: 12px;
      }

      .loot-detail-cardbox {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
        justify-items: center;
        align-items: center;
        min-width: 0;
      }

      .loot-card-thumb {
        width: 150px;
        height: 212px;
        object-fit: contain;
        border: 1px solid rgba(199, 173, 114, 0.2);
        border-radius: 8px;
        background: #080807;
        cursor: zoom-in;
      }

      .loot-detail-cardtext {
        min-width: 0;
        text-align: center;
      }

      .loot-detail-source {
        color: var(--gold, #c7ad72);
        font-weight: 800;
        margin-bottom: 5px;
      }

      .loot-detail-card {
        display: none;
      }

      .loot-detail-res {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        align-content: center;
        align-items: center;
        min-width: 0;
      }

      .loot-resource-pill {
        display: inline-grid;
        grid-template-columns: 26px auto auto;
        align-items: center;
        gap: 5px;
        min-height: 34px;
        padding: 4px 7px;
        border: 1px solid rgba(199, 173, 114, 0.18);
        border-radius: 999px;
        background: #0f0f0d;
        color: var(--text, #f0ede4);
      }

      .loot-resource-pill strong {
        color: var(--gold, #c7ad72);
        font-size: 15px;
      }

      .loot-resource-pill em {
        grid-column: 1 / -1;
        color: var(--muted, #aaa396);
        font-style: normal;
        font-size: 10px;
        text-align: center;
        line-height: 1;
      }

      .loot-resource-key {
        color: var(--muted, #aaa396);
        font-size: 12px;
      }

      .loot-no-resource {
        color: var(--muted, #aaa396);
      }

      .loot-empty {
        padding: 9px 10px;
        color: var(--muted, #aaa396);
        border: 1px dashed rgba(199, 173, 114, 0.2);
        border-radius: 8px;
      }

      .loot-image-zoom-dialog {
        width: 100vw;
        height: 100vh;
        max-width: none;
        max-height: none;
        margin: 0;
        padding: 24px;
        border: 0;
        background: rgba(0, 0, 0, 0.86);
        place-items: center;
      }

      .loot-image-zoom-dialog[open] {
        display: grid;
      }

      .loot-image-zoom-dialog::backdrop {
        background: rgba(0, 0, 0, 0.72);
      }

      .loot-image-zoom-img {
        max-width: min(92vw, 760px);
        max-height: 92vh;
        object-fit: contain;
        border-radius: 12px;
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.72);
      }

      .loot-image-zoom-close {
        position: fixed;
        top: 18px;
        right: 22px;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        border: 1px solid rgba(199, 173, 114, 0.45);
        background: rgba(20, 19, 17, 0.94);
        color: var(--gold, #c7ad72);
        font-size: 28px;
        line-height: 1;
        cursor: pointer;
        z-index: 10001;
      }

      @media (max-width: 760px) {
        .loot-detail-row {
          grid-template-columns: 1fr;
        }
        .loot-card-thumb {
          width: 170px;
          height: 240px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installButton() {
    if (document.getElementById("bpLootButton")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "bpLootButton";
    button.className = "loot-button";
    button.textContent = "计算战利品";
    button.addEventListener("click", showLootDialog);

    const titleActions = document.querySelector(".title-actions");
    if (titleActions) {
      titleActions.appendChild(button);
    } else {
      button.style.position = "fixed";
      button.style.right = "14px";
      button.style.top = "14px";
      button.style.zIndex = "80";
      document.body.appendChild(button);
    }
  }

  function init() {
    injectStyles();
    installButton();

    window.AIBP_calculateBpLoot = calculateBpLoot;
    window.AIBP_showBpLootDialog = showLootDialog;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
