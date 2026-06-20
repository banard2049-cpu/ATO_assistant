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
    SUN_DESCENDANT: "太阳后裔"
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
  const RECORD_SHARED_RESOURCE_KEYS = new Set([
    "fearEssence",
    "grotesqueBeak",
    "livingAbyss",
    "mazeFragment",
    "powderedMatter",
    "priests",
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
    HERMESIAN_PURSUER: "core-hermesian-pursuer",
    ALPHA_TEMENOS: "core-alpha-temenos",
    CHIMERA_METASTASIOS: "core-chimera",
    CYCLONUS: "core-cyclonus",
    THE_BURDEN: "core-adversary",
    THE_NIETZSCJEAN: "core-nietzschean",
    HYPERTIME_ORACLE: "core-hypertime-oracle",
    ICARIAN_HARPY: "core-icarian-harpy",
    SUN_DESCENDANT: "core-sun-descendant"
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
    SUN_DESCENDANT: "c3"
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
    SUN_DESCENDANT: { cycle: "c3", key: "sunDescendant" }
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
  const APOSTLE_LEVEL_UA_BONUS = {
    CHIMERA_METASTASIOS: { 3: 3, 4: 12 },
    CYCLONUS: { 3: 3, 4: 12 }
  };
  const NO_LEVEL_RESOURCE_MULTIPLIER_APOSTLES = new Set([
    "HERMESIAN_PURSUER",
    "THE_BURDEN",
    "ALPHA_TEMENOS",
    "THE_NIETZSCJEAN",
    "SUN_DESCENDANT"
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

    const name = fileName || safeCardFileName(card, apostle);
    return `ps/${encodePathPart(apostle)}/${encodePathFileName(name)}`;
  }

  function resourceIconSrc(key) {
    return `${RESOURCE_ICON_BASE}/${encodePathFileName(key)}.png`;
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
    return window[RESOURCE_MAP_NAME] || {};
  }

  function getCurrentApostleData() {
    const apostle = safeGetCurrentApostle();
    const allPiles = safeGetPiles();

    if (!apostle || !allPiles || !allPiles[apostle]) {
      throw new Error("没有找到当前使徒存档。请先打开一个使徒页面。");
    }

    if (!allPiles[apostle].BP) {
      throw new Error("当前使徒没有 BP 存档。");
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

  function woundedBpIIIInStacks(...stacks) {
    return stacks
      .flatMap((cards) => cloneCards(cards))
      .filter((card) => card && !card.special && card.type === "BP" && card.level === "III")
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

  function inferApostleMultiplier(bp, damageCards) {
    const cards = []
      .concat(cloneCards(bp.deck))
      .concat(cloneCards(bp.discard))
      .concat(cloneCards(damageCards))
      .filter((card) => card && !card.special && card.type === "BP");

    let max = 1;
    cards.forEach((card) => {
      max = Math.max(max, cardLevelValue(card));
    });

    return Math.max(1, max);
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

    Object.entries(record.enemies).forEach(([key, value]) => {
      if (!value || !key.startsWith(`${cycle}:`)) return;
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
    if (legacyValue !== undefined && legacyValue !== true && legacyValue !== false) {
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

  function getApostleLevelUaBonus(apostle, multiplier) {
    const level = Math.floor(Number(multiplier) || 0);
    return Number(APOSTLE_LEVEL_UA_BONUS[apostle]?.[level] || 0);
  }

  function resourceMultiplierForApostle(apostle, multiplier) {
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
    const { apostle, bp } = getCurrentApostleData();
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
    const inferredMultiplier = inferApostleMultiplier(bp, damageCards);
    const recordMultiplier = Number(options.recordMultiplier || 0);
    const manualMultiplier = Number(options.multiplier || 0);
    const multiplier = Math.max(1, Math.floor(manualMultiplier || recordMultiplier || inferredMultiplier || 1));
    const resourceMultiplier = resourceMultiplierForApostle(apostle, multiplier);
    const multiplierSource = manualMultiplier > 0
      ? "manual"
      : recordMultiplier > 0
        ? "record"
        : "aibp";
    const regularDamageCount = damageStackCount(damageCards);
    const secondaryDamageCount = damageStackCount(secondaryDamageCards);

    const totals = emptyTotals(resourceKeys);
    const directDetails = [];
    const swDetails = [];
    const dwDetails = [];
    const bonusDetails = [];
    const coreDetails = [];
    const warnings = [];
    const levelUaBonus = getApostleLevelUaBonus(apostle, multiplier);
    const burdenBonusDetails = [];
    const nietzscheBonusDetails = [];

    if (levelUaBonus > 0) {
      if (!("UA" in totals)) totals.UA = 0;
      totals.UA += levelUaBonus;
    }

    const swCount = damageCards.filter((card) => card && card.special === "SW").length;
    const dwCount = damageCards.filter((card) => card && card.special === "DW").length;
    const normalDamageCards = damageCards.filter((card) => card && !card.special);
    const woundedBpIIICount = woundedBpIIIInStacks(damageCards);

    addBpIIICoreBonus(totals, coreDetails, woundedBpIIICount, "暴击 BP III 核心奖励");

    normalDamageCards.forEach((card) => {
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

    for (let i = 0; i < swCount; i++) {
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

    for (let i = 0; i < dwCount; i++) {
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

    const chimeraBonus = isChimera
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
    const burdenBonus = isBurden
      ? applyBurdenSummitBonus(totals, options.summitTitanCount, burdenBonusDetails)
      : null;
    const nietzscheBonus = isNietzsche
      ? applyNietzscheDamageBonus(totals, regularDamageCount, options.nietzscheChoices, nietzscheBonusDetails, warnings)
      : null;

    return {
      apostle,
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
        direct: directDetails,
        sw: swDetails,
        dw: dwDetails,
        chimeraBonus: bonusDetails,
        burdenBonus: burdenBonusDetails,
        nietzscheBonus: nietzscheBonusDetails,
        coreBonus: coreDetails,
        levelBonus: levelUaBonus > 0
          ? [{ source: "使徒等级奖励", resource: { UA: levelUaBonus }, multiplier: 1 }]
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
    dialog.className = "loot-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="loot-dialog-inner">
        <div class="loot-dialog-head">
          <div class="loot-dialog-title">BP 战利品计算</div>
          <button type="button" class="loot-dialog-close">×</button>
        </div>

        <div class="loot-dialog-body">
          <div class="loot-toolbar">
            <label class="loot-multiplier-label">
              使徒等级倍率
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
    return RECORD_RESOURCE_KEY_MAP[key] || "";
  }

  function recordCycleForLoot(apostle, record, activeCycleOverride = "") {
    const activeCycle = activeCycleOverride === "c1" || activeCycleOverride === "c2" || activeCycleOverride === "c3"
      ? activeCycleOverride
      : record?.cycle === "c1" || record?.cycle === "c2" || record?.cycle === "c3"
        ? record.cycle
        : "";
    if (apostle === BURDEN_APOSTLE && activeCycle === "c3") return "c3";
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

  async function readServerRecordState() {
    const response = await fetch(CAMPAIGN_STATE_URL, { cache: "no-store" });
    if (response.status === 401) return { available: false, state: null, error: "需要先登录，NAS 未同步。" };
    if (!response.ok) throw new Error(`NAS 读取失败：HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "NAS 读取失败");
    const campaign = isPlainObject(payload.campaign) ? payload.campaign : {};
    const sections = isPlainObject(campaign.sections) ? campaign.sections : {};
    const userId = sections.dashboard?.activeProfileId || "default";
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
      activeCycle,
      revision: Math.max(0, Number(campaign.sectionRevisions?.record || 0)),
    };
  }

  async function writeServerRecordState(record, userId, expectedRevision) {
    const response = await fetch(RECORD_SECTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "record",
        userId: userId || "default",
        state: record,
        expectedRevision,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 409 && payload?.code === "SAVE_CONFLICT") return { conflict: true };
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `NAS 写入失败：HTTP ${response.status}`);
    return { conflict: false, revision: Math.max(0, Number(payload.revision || 0)) };
  }

  function mergeRecordStates(serverRecord, localRecord) {
    if (!isPlainObject(serverRecord)) return isPlainObject(localRecord) ? { ...localRecord } : {};
    if (!isPlainObject(localRecord)) return { ...serverRecord };

    const merged = { ...localRecord, ...serverRecord };
    [
      "crewBoxes",
      "enemies",
      "adventures",
      "diplomacy",
      "resources",
      "map",
      "matrix",
      "maxUnlocked",
      "pygmalion",
      "rooting",
    ].forEach((key) => {
      merged[key] = {
        ...(isPlainObject(localRecord[key]) ? localRecord[key] : {}),
        ...(isPlainObject(serverRecord[key]) ? serverRecord[key] : {}),
      };
    });

    ["godforms", "nymphCards", "godformUsedCards", "nymphUsedCards", "titans"].forEach((key) => {
      const serverList = Array.isArray(serverRecord[key]) ? serverRecord[key] : [];
      const localList = Array.isArray(localRecord[key]) ? localRecord[key] : [];
      merged[key] = serverList.length ? serverList : localList;
    });

    return merged;
  }

  function applyLootResultToRecord(record, result, activeCycleOverride = "") {
    if (!result) throw new Error("没有可添加的战利品结果。");

    const updatedRecord = isPlainObject(record) ? { ...record } : {};
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

    appendRecordSyncLog(updatedRecord, `AIBP ${result.apostle} 战利品写入：${added.join("，")}${skipped.length ? `；未映射：${skipped.join(", ")}` : ""}`);

    return { record: updatedRecord, added, skipped, cycle };
  }

  async function addLootResultToRecord(result) {
    const localRecord = readLocalRecordState();
    let serverAvailable = false;
    let serverRecord = null;
    let serverUserId = "default";
    let serverRevision = 0;
    let serverActiveCycle = "";
    let syncWarning = "";

    try {
      const server = await readServerRecordState();
      serverAvailable = server.available;
      serverRecord = server.state;
      serverUserId = server.userId || serverUserId;
      serverRevision = server.revision || serverRevision;
      serverActiveCycle = server.activeCycle || serverActiveCycle;
      if (server.error) syncWarning = server.error;
    } catch (error) {
      syncWarning = error.message || String(error);
    }

    let resultWithRecord = applyLootResultToRecord(
      serverRecord ? mergeRecordStates(serverRecord, localRecord) : localRecord,
      result,
      serverActiveCycle
    );

    let syncedToServer = false;
    if (serverAvailable) {
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const writeResult = await writeServerRecordState(resultWithRecord.record, serverUserId, serverRevision);
          if (!writeResult.conflict) {
            syncedToServer = true;
            RECORD_SYNC_CHANNEL?.postMessage({ revision: writeResult.revision });
            break;
          }
          const latest = await readServerRecordState();
          serverUserId = latest.userId || serverUserId;
          serverRevision = latest.revision || serverRevision;
          serverActiveCycle = latest.activeCycle || serverActiveCycle;
          resultWithRecord = applyLootResultToRecord(latest.state || {}, result, serverActiveCycle);
        }
        if (!syncedToServer) syncWarning = "记录表持续被其他页面修改，请稍后重试。";
      } catch (error) {
        syncWarning = error.message || String(error);
      }
    }

    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(resultWithRecord.record));
    return { ...resultWithRecord, syncedToServer, syncWarning };
  }

  function renderLootResult(dialog, result) {
    lastLootResult = result;

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

    const summary = dialog.querySelector(".loot-summary");
    const warning = dialog.querySelector(".loot-warning");
    const details = dialog.querySelector(".loot-details");
    const recordButton = dialog.querySelector(".loot-record-button");
    if (recordButton) {
      recordButton.disabled = false;
      recordButton.textContent = "添加到记录表";
    }

    const totalRows = Object.entries(result.totals)
      .filter(([, value]) => Number(value || 0) !== 0)
      .map(([key, value]) => `
        <div class="loot-total-row">
          <img class="loot-resource-icon" src="${escapeAttr(resourceIconSrc(key))}" alt="${escapeAttr(resourceZhName(key))}" title="${escapeAttr(resourceZhName(key))}">
          <span>${escapeHtml(resourceZhName(key))}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </div>
      `)
      .join("");

    summary.innerHTML = `
      <div class="loot-meta">
        <div>当前使徒：<strong>${escapeHtml(apostleZhName(result.apostle))}</strong></div>
        <div>损伤堆卡数：${result.damageCount}</div>
        <div>普通BP损伤：${result.normalDamageCount}</div>
        <div>单重损伤：${result.swCount}</div>
        <div>双重损伤：${result.dwCount}</div>
        <div>暴击 BP III：${result.woundedBpIIICount}（核心 +${result.woundedBpIIICount}）</div>
        <div>倍率：×${result.multiplier}</div>
        ${result.ignoresLevelResourceMultiplier ? `<div>资源倍率：×${result.resourceMultiplier}（该使徒不按等级乘资源）</div>` : ""}
        <div>倍率来源：${result.multiplierSource === "record" ? "记录表" : result.multiplierSource === "manual" ? "手动输入" : "AIBP牌堆推断"}</div>
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

    warning.innerHTML = result.warnings.length
      ? `<div class="loot-warning-box">${result.warnings.map(escapeHtml).join("<br>")}</div>`
      : "";

    const directRows = result.details.direct.map((item) => detailRow(item)).join("");
    const swRows = result.details.sw.map((item, idx) => detailRow(item, `SW #${idx + 1}`)).join("");
    const dwRows = result.details.dw.map((item, idx) => detailRow(item, `DW #${idx + 1}`)).join("");
    const chimeraBonusRows = (result.details.chimeraBonus || []).map((item) => item.card ? detailRow(item) : levelBonusRow(item)).join("");
    const burdenBonusRows = (result.details.burdenBonus || []).map((item) => levelBonusRow(item)).join("");
    const nietzscheBonusRows = (result.details.nietzscheBonus || []).map((item) => levelBonusRow(item)).join("");
    const coreBonusRows = (result.details.coreBonus || []).map((item) => levelBonusRow(item)).join("");
    const levelBonusRows = (result.details.levelBonus || []).map((item) => levelBonusRow(item)).join("");

    details.innerHTML = `
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
    `;

    if (levelBonusRows) {
      details.insertAdjacentHTML("beforeend", `
        <section>
          <h4>使徒等级奖励</h4>
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
            <div class="loot-detail-source">${escapeHtml(item.source || "使徒等级奖励")}</div>
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
          <img class="loot-resource-icon small" src="${escapeAttr(resourceIconSrc(key))}" alt="${escapeAttr(resourceZhName(key))}">
          <span class="loot-resource-key">${escapeHtml(resourceZhName(key))}</span>
          <strong>${escapeHtml(String(total))}</strong>
          ${multiplier !== 1 ? `<em>${escapeHtml(String(base))}×${escapeHtml(String(multiplier))}</em>` : ""}
        </span>
      `;
    }).join("");
  }

  function resultToText(result) {
    const lines = [];
    lines.push(`使徒：${apostleZhName(result.apostle)}`);
    lines.push(`倍率：×${result.multiplier}`);
    if (result.ignoresLevelResourceMultiplier) {
      lines.push(`资源倍率：×${result.resourceMultiplier}（该使徒不按等级乘资源）`);
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
    (result.details.levelBonus || []).forEach((item) => lines.push(`  使徒等级奖励：${formatResource(item.resource)}`));

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

        lootDialog.querySelector(".loot-recalc-button").addEventListener("click", () => {
          const multiplier = Number(lootDialog.querySelector(".loot-multiplier-input").value || 1);
          const summitTitanCount = Number(lootDialog.querySelector(".loot-burden-summit-input").value || 0);
          const nietzscheChoices = {};
          lootDialog.querySelectorAll("[data-nietzsche-choice]").forEach((input) => {
            nietzscheChoices[input.dataset.nietzscheChoice] = Number(input.value || 0);
          });
          const result = calculateBpLoot({ multiplier, summitTitanCount, nietzscheChoices });
          renderLootResult(lootDialog, result);
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
          button.disabled = true;
          button.textContent = "写入中...";
          try {
            const { added, skipped, cycle, syncedToServer, syncWarning } = await addLootResultToRecord(lastLootResult);
            button.textContent = syncedToServer ? `已同步到 NAS (${cycle})` : `已添加到本机 (${cycle})`;
            window.alert([
              "已添加到阿尔戈号记录表：",
              added.join("\n"),
              skipped.length ? `\n未映射：${skipped.join(", ")}` : "",
              syncedToServer ? "\n已同步到 NAS 存档。" : `\n已写入本机记录表，但 NAS 未同步：${syncWarning || "接口不可用"}`,
            ].filter(Boolean).join("\n"));
          } catch (err) {
            button.disabled = false;
            button.textContent = "添加到记录表";
            window.alert(`写入记录表失败：\n${err.message || err}`);
          }
        });
      }

      const { apostle } = getCurrentApostleData();
      const recordMultiplier = await recordMultiplierForApostle(apostle);
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
