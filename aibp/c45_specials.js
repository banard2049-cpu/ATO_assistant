(function () {
  "use strict";

  const C45_APOSTLES = new Set([
    "MIDASCORE",
    "DEMIDJINN",
    "THE_BABELIAN_LUNACY",
    "DAHAKA",
    "DRAGON_OF_PHOBOS",
    "MEDUKETOS",
    "UR_FLEECE",
    "TITAN_X"
  ]);
  const RECORD_STORAGE_KEY = "ato-argo-record-sheet-v1";
  const CAMPAIGN_STATE_URL = "../api/campaign-state.php";
  const FALLBACK_ROSTER_SIZE = 4;
  const MIDASCORE_PAIN_TOKEN = {
    id: "c45-midascore-pain",
    file: "CM.jpg",
    x: 96,
    y: 7.5
  };
  const TRIGGERED_COUNTER_TOKENS = {
    demidjinn: {
      id: "c45-demidjinn-wish-for-wish",
      file: "CM.jpg",
      x: 92,
      y: 10.5
    },
    dragon: {
      id: "c45-dragon-truth",
      file: "CM.jpg",
      x: 93,
      y: 7.5
    },
    meduketos: {
      id: "c45-meduketos-slow-boiling",
      file: "CM.jpg",
      x: 96,
      y: 7.5
    }
  };
  const GLOBAL_WISH_NAMES = {
    I: "Sand to Sea",
    II: "Stones to Sticks",
    III: "Pillars to Pyres",
    IV: "Sand to Silica"
  };
  const GLOBAL_WISH_TEXT = {
    I: {
      original: "Normal (not Terrain) Battle Board spaces are considered Terrain tiles with the Chasm keyword.",
      translated: "普通（非地形）战斗版图格视为具有“裂隙（Chasm）”关键词的地形板块。"
    },
    II: {
      original: "Irem Tower Terrain tiles gain the Destructible keyword. If you move off an Irem Tower, it is destroyed. If you end your turn on an Irem Tower, it is destroyed, then you suffer Crash.",
      translated: "伊瑞姆塔地形板块获得“可破坏（Destructible）”关键词。如果你离开一座伊瑞姆塔，该塔被摧毁。如果你在一座伊瑞姆塔上结束回合，该塔被摧毁，然后你遭受撞击（Crash）。"
    },
    III: {
      original: "When this card is placed on the Active Global Wish space, all Irem Tower Terrain tiles become 'pyres'. [!] All Titans on pyres die. When you end your voluntary movement or end your turn on a pyre, you die. When you end your involuntary movement on a pyre, [!] you die.",
      translated: "当本卡被放到激活的全场愿望位置时，所有伊瑞姆塔地形板块都变为“火葬堆（pyres）”。[!] 火葬堆上的所有泰坦死亡。当你在火葬堆上结束自愿移动或结束回合时，你死亡。当你在火葬堆上结束非自愿移动时，[!] 你死亡。"
    },
    IV: {
      original: "When you attack, you gain -X Precision, where X is the number of Fire tokens in the Kratos Pool.",
      translated: "当你攻击时，获得 -X 精准；X 等于克拉托斯池中的火焰指示物数量。"
    }
  };
  const FEINT_META = {
    1: { kind: "effect" },
    2: { kind: "effect" },
    3: { kind: "status" },
    4: { kind: "status" },
    5: { kind: "effect" },
    6: { kind: "effect" },
    7: { kind: "status" },
    8: { kind: "effect", overstep: "I" },
    9: { kind: "status", bottomDraw: true },
    10: { kind: "effect", overstep: "II" }
  };
  const TITAN_X_STANDARD_BP = {
    I: [2, 3, 4, 5, 6, 7],
    II: [1, 2, 3, 5, 6, 7],
    III: [1, 2, 3, 4, 5, 6]
  };
  const base = {
    ensurePiles,
    renderApostle,
    renderAibpCards,
    renderExtraCards,
    renderDeckInfo,
    renderDrawPreview,
    drawAi,
    drawBp,
    discardAiPending,
    resolveBp,
    promoteSinglePile,
    promoteBpByRemovingLowest,
    performLinkedPromotion,
    promoteAiFromLevel,
    promoteAiForBpIII,
    setImageZoomBpActions,
    undoLastAibp,
    startNewCampaign,
    drawFeint,
    cardSrc
  };

  let titanRoster = [];
  let specialRoot = null;
  const babelianFusionControl = document.getElementById(
    "babelianFusionControl"
  );

  function isC45(name = currentApostle) {
    return C45_APOSTLES.has(name);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Math.floor(Number(value) || 0)));
  }

  function makeCard(type, level, index, options = {}) {
    return { type, level, index, ...options };
  }

  function cardIdentity(card) {
    if (!card) return "";
    return card.fileName || `${card.type}:${card.level}:${card.index}`;
  }

  function containsCard(collection, target) {
    return Array.isArray(collection)
      && collection.some((card) => cardIdentity(card) === cardIdentity(target));
  }

  function pileContainsCard(pile, target) {
    if (!pile) return false;
    return ["deck", "discard", "damage", "damage1", "damage2", "removed"]
      .some((key) => containsCard(pile[key], target))
      || cardIdentity(pile.pending) === cardIdentity(target)
      || ["I", "II", "III"].some((level) => containsCard(pile.supply?.[level], target));
  }

  function fallbackRoster() {
    return Array.from({ length: FALLBACK_ROSTER_SIZE }, (_, index) => ({
      id: `slot-${index + 1}`,
      name: `泰坦 ${index + 1}`
    }));
  }

  function activeRoster() {
    if (titanRoster.length > 0) return titanRoster;
    return fallbackRoster();
  }

  function normalizeRecordTitans(value) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, itemIndex) => {
      if (!item || typeof item !== "object") return [];
      const count = Math.max(1, Math.floor(Number(item.count || 1)));
      const baseName = String(item.name || "泰坦").trim() || "泰坦";
      const baseId = String(item.id || `titan-${itemIndex + 1}`);
      return Array.from({ length: count }, (_, index) => ({
        id: `${baseId}:${index + 1}`,
        name: count > 1 ? `${baseName} ${index + 1}` : baseName
      }));
    });
  }

  function recordFromCampaign(campaign) {
    const dashboard = campaign?.sections?.dashboard;
    const activeProfileId = dashboard?.activeProfileId || "default";
    const recordSection = campaign?.sections?.record;
    return recordSection?.users?.[activeProfileId]
      || (recordSection?.users ? null : recordSection)
      || null;
  }

  async function refreshTitanRoster() {
    let localRecord = null;
    try {
      localRecord = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY) || "null");
    } catch {
      localRecord = null;
    }
    const localTitans = normalizeRecordTitans(localRecord?.titans);
    if (localTitans.length > 0) {
      titanRoster = localTitans;
      renderSpecials();
    }

    try {
      const response = await fetch(CAMPAIGN_STATE_URL, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const remoteTitans = normalizeRecordTitans(
        recordFromCampaign(payload?.campaign)?.titans
      );
      if (remoteTitans.length > 0) {
        titanRoster = remoteTitans;
        renderSpecials();
      }
    } catch {
      // The editable fallback remains available offline and under file://.
    }
  }

  function defaultSpecialState() {
    return {
      version: 8
    };
  }

  function makeDahakaCard(level, index) {
    return makeCard("AI", level, index, {
      bpLevel: level,
      combinedAibp: true,
      fileName: `DAHAKA_AI_${level}_${String(index).padStart(3, "0")}.jpg`
    });
  }

  function normalizeDahakaCard(card) {
    if (!card || card.special) return card;
    const level = card.bpLevel || card.level || "I";
    const index = Math.max(1, Number(card.index || 1));
    return {
      ...card,
      type: "AI",
      level,
      bpLevel: level,
      index,
      combinedAibp: true,
      fileName: card.fileName
        || `DAHAKA_AI_${level}_${String(index).padStart(3, "0")}.jpg`
    };
  }

  function makeDahakaPile() {
    return {
      version: 1,
      deck: shuffleCards(Array.from({ length: 6 }, (_, index) => makeDahakaCard("I", index + 1))),
      discard: [],
      pending: null,
      pendingMode: "",
      supply: {
        I: [],
        II: shuffleCards(Array.from({ length: 6 }, (_, index) => makeDahakaCard("II", index + 1))),
        III: shuffleCards(Array.from({ length: 6 }, (_, index) => makeDahakaCard("III", index + 1)))
      },
      damage: [],
      damage1: [],
      damage2: [],
      removed: []
    };
  }

  function normalizeDahakaPile(pile) {
    const normalized = pile && typeof pile === "object" ? pile : makeDahakaPile();
    ["deck", "discard", "damage", "damage1", "damage2", "removed"].forEach((key) => {
      normalized[key] = Array.isArray(normalized[key])
        ? normalized[key].map(normalizeDahakaCard)
        : [];
    });
    normalized.supply ||= {};
    ["I", "II", "III"].forEach((level) => {
      normalized.supply[level] = Array.isArray(normalized.supply[level])
        ? normalized.supply[level].map(normalizeDahakaCard)
        : [];
    });
    normalized.pending = normalized.pending ? normalizeDahakaCard(normalized.pending) : null;
    normalized.pendingMode = normalized.pending ? (normalized.pendingMode || "AI") : "";
    normalized.version = 1;
    return normalized;
  }

  function migrateDahaka(state) {
    if (!state.aibp) {
      const ai = state.AI;
      const hasLegacy = ai && (
        ai.deck?.length
        || ai.discard?.length
        || ai.pending
        || ai.removed?.length
        || ai.supply?.II?.length
        || ai.supply?.III?.length
      );
      state.aibp = hasLegacy
        ? {
            version: 1,
            deck: ai.deck || [],
            discard: ai.discard || [],
            pending: ai.pending || null,
            pendingMode: ai.pending ? "AI" : "",
            supply: ai.supply || { I: [], II: [], III: [] },
            damage: state.BP?.damage || [],
            damage1: [],
            damage2: [],
            removed: ai.removed || []
          }
        : makeDahakaPile();
    }
    state.aibp = normalizeDahakaPile(state.aibp);
    state.AI = state.aibp;
    state.BP = state.aibp;
  }

  function makeTitanXBp(level, index) {
    return makeCard("BP", level, index);
  }

  function makeTitanXBpPile() {
    return {
      deck: shuffleCards(TITAN_X_STANDARD_BP.I.map((index) => makeTitanXBp("I", index))),
      discard: [],
      damage: [],
      damage1: [],
      damage2: [],
      pending: null,
      supply: {
        I: [],
        II: shuffleCards(TITAN_X_STANDARD_BP.II.map((index) => makeTitanXBp("II", index))),
        III: shuffleCards(TITAN_X_STANDARD_BP.III.map((index) => makeTitanXBp("III", index)))
      },
      removed: []
    };
  }

  function pileIsUnstarted(pile) {
    return Boolean(pile)
      && !pile.pending
      && (pile.discard?.length || 0) === 0
      && (pile.damage?.length || 0) === 0
      && (pile.damage1?.length || 0) === 0
      && (pile.damage2?.length || 0) === 0
      && (pile.removed?.length || 0) === 0;
  }

  function removeCardEverywhere(pile, target, options = {}) {
    if (!pile) return [];
    const removed = [];
    const keys = options.keys || ["deck", "discard", "removed"];
    keys.forEach((key) => {
      pile[key] ||= [];
      pile[key] = pile[key].filter((card) => {
        if (cardIdentity(card) !== cardIdentity(target)) return true;
        removed.push(card);
        return false;
      });
    });
    ["I", "II", "III"].forEach((level) => {
      if (!Array.isArray(pile.supply?.[level])) return;
      pile.supply[level] = pile.supply[level].filter((card) => {
        if (cardIdentity(card) !== cardIdentity(target)) return true;
        removed.push(card);
        return false;
      });
    });
    if (cardIdentity(pile.pending) === cardIdentity(target)) {
      removed.push(pile.pending);
      pile.pending = null;
    }
    return removed;
  }

  function normalizeTitanX(state) {
    const special = state.special.titanX ||= {};
    special.activeStatus ||= null;
    special.pendingEffect = FEINT_META[special.pendingEffect?.index]?.kind === "effect"
      ? special.pendingEffect
      : null;
    delete special.extraRounds;
    special.overstepInserted ||= { I: false, II: false };
    const retiredAiO = findSpecialAi(state.AI, "titan-x-o");
    if (retiredAiO) {
      removeCardEverywhere(state.AI, retiredAiO);
    }

    if (special.setupVersion !== 2) {
      if (pileIsUnstarted(state.BP)) {
        state.BP = makeTitanXBpPile();
      } else {
        removeCardEverywhere(state.BP, makeTitanXBp("I", 1), {
          keys: ["deck", "discard"]
        });
        removeCardEverywhere(state.BP, makeTitanXBp("II", 4), {
          keys: ["deck", "discard"]
        });
      }

      const active = Array.isArray(state.feint?.active) ? state.feint.active.slice() : [];
      const statusCards = active.filter((card) => FEINT_META[card.index]?.kind === "status");
      active.filter((card) => FEINT_META[card.index]?.kind !== "status").forEach((card) => {
        if (FEINT_META[card.index]?.overstep) {
          insertTitanXOverstep(FEINT_META[card.index].overstep, state, false);
          state.feint.removed.push(card);
        } else {
          state.feint.deck.push(card);
        }
      });
      if (statusCards.length > 0) {
        const latest = statusCards.pop();
        state.feint.deck.push(...statusCards);
        state.feint.active = [latest];
        special.activeStatus = latest;
        special.bottomDraw = latest.index === 9;
      } else {
        state.feint.active = [];
      }
      state.feint.deck = shuffleCards(state.feint.deck);
      special.setupVersion = 2;
    }

    const activeStatuses = (state.feint.active || [])
      .filter((card) => FEINT_META[card.index]?.kind === "status");
    if (activeStatuses.length > 1) {
      const current = activeStatuses.pop();
      state.feint.deck.push(...activeStatuses);
      state.feint.deck = shuffleCards(state.feint.deck);
      state.feint.active = [current];
    } else {
      state.feint.active = activeStatuses;
    }
    special.activeStatus = state.feint.active[0] || null;
    special.bottomDraw = special.activeStatus?.index === 9;
  }

  function syncMidascorePainToken(state) {
    state.tokens = Array.isArray(state.tokens) ? state.tokens : [];
    state.tokens = state.tokens.filter((item) => item.midascorePain !== true);
    const pain = clamp(state.special.midascore.pain, 0, 99);
    if (pain <= 0) return;
    state.tokens.push({
      ...MIDASCORE_PAIN_TOKEN,
      count: pain,
      midascorePain: true
    });
  }

  function syncTriggeredCounterToken(state, kind, value) {
    const token = TRIGGERED_COUNTER_TOKENS[kind];
    if (!token) return;
    state.tokens = Array.isArray(state.tokens) ? state.tokens : [];
    state.tokens = state.tokens.filter((item) => item.c45PanelCounter !== kind);
    const count = clamp(value, 0, 99);
    if (count <= 0) return;
    state.tokens.push({
      ...token,
      count,
      c45PanelCounter: kind
    });
  }

  function normalizeApostleSpecial(name, state) {
    const special = state.special;
    if (name === "MIDASCORE") {
      special.midascore = {
        pain: clamp(special.midascore?.pain, 0, 99)
      };
      syncMidascorePainToken(state);
    } else if (name === "DEMIDJINN") {
      special.demidjinn = {
        wishForWish: 0,
        globalWish: null,
        lastWishAiIvAdded: false,
        ...(special.demidjinn || {})
      };
      delete special.demidjinn.wishConditionCount;
      special.demidjinn.lastWishAiIvAdded = special.demidjinn.lastWishAiIvAdded === true;
      special.demidjinn.wishForWish = clamp(special.demidjinn.wishForWish, 0, 99);
      ensureGlobalWishState(state);
      ensureDemidjinnLastWish(state);
      syncTriggeredCounterToken(state, "demidjinn", special.demidjinn.wishForWish);
    } else if (name === "THE_BABELIAN_LUNACY") {
      special.babelian = {
        fusionBonus: 0,
        ...(special.babelian || {})
      };
      delete special.babelian.fusionRoll;
      special.babelian.fusionBonus = clamp(special.babelian.fusionBonus, 0, 99);
    } else if (name === "DAHAKA") {
      delete special.dahaka;
      migrateDahaka(state);
    } else if (name === "DRAGON_OF_PHOBOS") {
      const previous = special.dragon || {};
      special.dragon = {
        truthTokens: clamp(previous.truthTokens, 0, 4)
      };
      syncTriggeredCounterToken(state, "dragon", special.dragon.truthTokens);
    } else if (name === "MEDUKETOS") {
      const previous = special.meduketos || {};
      special.meduketos = {
        slowBoiling: clamp(previous.slowBoiling, 0, 3)
      };
      syncTriggeredCounterToken(state, "meduketos", special.meduketos.slowBoiling);
    } else if (name === "UR_FLEECE") {
      delete special.urFleece;
      const retiredAiO = findSpecialAi(state.AI, "ur-fleece-o");
      if (retiredAiO) {
        removeCardEverywhere(state.AI, retiredAiO);
      }
    } else if (name === "TITAN_X") {
      special.titanX ||= {};
      normalizeTitanX(state);
    }
  }

  function ensureC45State(name) {
    if (!isC45(name) || !piles[name]) return;
    const state = piles[name];
    if (!state.special || typeof state.special !== "object") {
      state.special = defaultSpecialState();
    }
    state.special.version = 8;
    delete state.special.commonStatuses;
    delete state.special.roster;
    normalizeApostleSpecial(name, state);
  }

  function wishCard(level) {
    return makeCard("WISH", level, 1, {
      fileName: `DEMIDJINN_WISH_${level}_001.jpg`,
      globalWish: true,
      wishName: GLOBAL_WISH_NAMES[level]
    });
  }

  function globalWishName(card) {
    if (!card) return "";
    if (card.wishName) return card.wishName;
    const level = String(card.fileName || "").match(/_WISH_(I|II|III|IV)_/)?.[1]
      || card.level;
    return GLOBAL_WISH_NAMES[level] || "Global Wish";
  }

  function globalWishText(card) {
    if (!card) return null;
    const level = String(card.fileName || "").match(/_WISH_(I|II|III|IV)_/)?.[1]
      || card.level;
    return GLOBAL_WISH_TEXT[level] || null;
  }

  function newGlobalWishState() {
    const levelCount = clamp(currentApostleLevel(), 1, 4);
    const levels = ["I", "II", "III", "IV"].slice(0, levelCount);
    return {
      configuredLevel: levelCount,
      round: 1,
      deck: shuffleCards(levels.map(wishCard)),
      discard: [],
      active: null
    };
  }

  function ensureGlobalWishState(state) {
    const holder = state.special.demidjinn;
    const expectedLevel = clamp(currentApostleLevel(), 1, 4);
    const wish = holder.globalWish && typeof holder.globalWish === "object"
      ? holder.globalWish
      : null;
    if (wish) {
      wish.configuredLevel = clamp(wish.configuredLevel || expectedLevel, 1, 4);
      wish.round = Math.max(1, Math.floor(Number(wish.round) || 1));
      wish.deck = Array.isArray(wish.deck) ? wish.deck : [];
      wish.discard = Array.isArray(wish.discard) ? wish.discard : [];
      wish.active ||= null;
    }
    const untouched = wish
      && wish.round === 1
      && !wish.active
      && (wish.discard?.length || 0) === 0;
    const empty = wish
      && !wish.active
      && wish.deck.length === 0
      && wish.discard.length === 0;
    if (!wish || empty || (wish.configuredLevel !== expectedLevel && untouched)) {
      holder.globalWish = newGlobalWishState();
    }
  }

  function specialAiCard(fileName, level, key) {
    return makeCard("AI", level, 1, { fileName, specialAi: key });
  }

  function allPileCards(pile) {
    if (!pile) return [];
    return [
      ...(pile.deck || []),
      ...(pile.discard || []),
      ...(pile.removed || []),
      ...(pile.pending ? [pile.pending] : [])
    ];
  }

  function findSpecialAi(pile, key) {
    return allPileCards(pile).find((card) => card.specialAi === key);
  }

  function removeSpecialAi(pile, key) {
    if (!pile) return;
    ["deck", "discard", "removed"].forEach((collection) => {
      pile[collection] ||= [];
      pile[collection] = pile[collection].filter((card) => card.specialAi !== key);
    });
    if (pile.pending?.specialAi === key) pile.pending = null;
  }

  function ensureDemidjinnLastWish(state) {
    if (currentApostle !== "DEMIDJINN") return;
    const ai = state.AI;
    if (!state.special.demidjinn.lastWishAiIvAdded) {
      removeSpecialAi(ai, "demidjinn-iv");
    }
    normalizeDemidjinnAi(ai);
  }

  function normalizeDemidjinnAi(ai) {
    if (!ai) return;
    const enabled = currentApostle === "DEMIDJINN" && currentApostleLevel() >= 4;
    let lastWish = null;
    ["deck", "discard", "removed"].forEach((key) => {
      ai[key] ||= [];
      ai[key] = ai[key].filter((card) => {
        if (card.specialAi !== "demidjinn-o") return true;
        lastWish ||= card;
        return false;
      });
    });
    if (!enabled) {
      if (ai.pending?.specialAi === "demidjinn-o") ai.pending = null;
      return;
    }
    if (ai.pending?.specialAi === "demidjinn-o") {
      const pendingAiO = ai.pending;
      ai.pending = null;
      reshuffleDemidjinnAfterAiO(ai, pendingAiO);
      return;
    }
    if (!lastWish) {
      lastWish = specialAiCard("DEMIDJINN_TR_O_001.jpg", "O", "demidjinn-o");
    }
    ai.deck.push(lastWish);
  }

  function reshuffleDemidjinnAfterAiO(ai, aiO) {
    ai.deck = ai.deck.filter((card) => card.specialAi !== "demidjinn-o");
    ai.discard = ai.discard.filter((card) => card.specialAi !== "demidjinn-o");
    ai.deck = shuffleCards(ai.deck.concat(ai.discard));
    ai.discard = [];
    ai.deck.push(aiO);
  }

  function activateDemidjinnLastWish() {
    if (currentApostle !== "DEMIDJINN") return false;
    ensureC45State("DEMIDJINN");
    const state = piles.DEMIDJINN;
    const data = state.special.demidjinn;
    if (data.lastWishAiIvAdded) return false;

    const ai = state.AI;
    for (const collection of ["deck", "discard"]) {
      const index = ai[collection].findIndex((card) => (
        card?.type === "AI" && card.level === "III" && !card.specialAi
      ));
      if (index >= 0) {
        ai.removed.push(ai[collection].splice(index, 1)[0]);
        break;
      }
    }

    const aiIv = specialAiCard("DEMIDJINN_TR_IV_001.jpg", "IV", "demidjinn-iv");
    ai.deck = shuffleCards(ai.deck.concat(aiIv));
    data.lastWishAiIvAdded = true;
    normalizeDemidjinnAi(ai);
    return true;
  }

  function discardDemidjinnPromotionTop() {
    if (currentApostle !== "DEMIDJINN" || currentApostleLevel() < 4) return;
    const ai = piles[currentApostle].AI;
    normalizeDemidjinnAi(ai);
    const top = ai.deck[0];
    if (!top || ["demidjinn-iv", "demidjinn-o"].includes(top.specialAi)) return;
    ai.discard.push(ai.deck.shift());
    normalizeDemidjinnAi(ai);
  }

  function promotionFingerprint(type = "AI") {
    const pile = piles[currentApostle]?.[type];
    return JSON.stringify({
      removed: pile?.removed?.length || 0,
      supplyII: pile?.supply?.II?.length || 0,
      supplyIII: pile?.supply?.III?.length || 0
    });
  }

  function currentTitanXStatus() {
    return piles.TITAN_X?.special?.titanX?.activeStatus || null;
  }

  function titanXDrawsFromBottom() {
    return currentApostle === "TITAN_X"
      && currentTitanXStatus()?.index === 9;
  }

  function insertTitanXOverstep(level, state = piles.TITAN_X, remember = true) {
    if (!state) return false;
    const index = level === "I" ? 1 : 4;
    const card = makeTitanXBp(level, index);
    if (pileContainsCard(state.BP, card)) return false;
    if (remember && currentApostle === "TITAN_X") {
      rememberUndo("TITAN_X", "BP");
    }
    insertRandom(state.BP.deck, card);
    state.special.titanX.overstepInserted[level] = true;
    return true;
  }

  function removePendingCard(pile) {
    const pending = pile?.pending;
    if (!pending) return null;
    const identity = cardIdentity(pending);
    const index = pile.deck.findIndex((card) => cardIdentity(card) === identity);
    const card = index >= 0 ? pile.deck.splice(index, 1)[0] : pending;
    pile.pending = null;
    return card;
  }

  function drawDahaka(mode) {
    ensurePiles("DAHAKA");
    const pile = piles.DAHAKA.aibp;
    if (pile.pending) return;
    if (pile.deck.length === 0 && pile.discard.length === 0) return;
    rememberUndo("DAHAKA", "AIBP");
    if (pile.deck.length === 0) {
      pile.deck = shuffleCards(pile.discard);
      pile.discard = [];
    }
    pile.pending = pile.deck[0] || null;
    pile.pendingMode = pile.pending ? mode : "";
    savePiles();
    renderAibpCards();
    if (!pile.pending) return;
    const drawn = pile.pending;
    if (mode === "AI") {
      openImageZoom(cardSrc(drawn), "达哈卡 AI/BP（AI 半区）", () => {
        if (piles.DAHAKA?.aibp?.pendingMode === "AI") discardAiPending(false);
      });
    } else {
      openImageZoom(cardSrc(drawn), "达哈卡 AI/BP（BP 半区）", null, {
        bpActions: true
      });
    }
  }

  function resolveDahakaBp(mode) {
    const state = piles.DAHAKA;
    const pile = state.aibp;
    if (!pile.pending || pile.pendingMode !== "BP") return;
    rememberUndo("DAHAKA", "AIBP");
    const card = removePendingCard(pile);
    pile.pendingMode = "";

    if (mode === "discard") {
      pile.discard.push(card);
    } else if (card.bpLevel === "I" || card.bpLevel === "II") {
      pile.damage.push(card);
      const nextLevel = card.bpLevel === "I" ? "II" : "III";
      const promoted = pile.supply[nextLevel].pop();
      if (promoted) insertRandom(pile.deck, promoted);
    } else if (mode === "critical") {
      pile.damage.push({ ...card, damageValue: 2 });
      if (pile.supply.III.length > 0) {
        const lowest = lowestDahakaCard(pile);
        if (lowest) moveDahakaCardToRemoved(pile, lowest);
        for (let index = 0; index < 2; index += 1) {
          const promoted = pile.supply.III.pop();
          if (promoted) insertRandom(pile.deck, promoted);
        }
      } else {
        pile.deck = shuffleCards(pile.deck.concat(pile.discard));
        pile.discard = [];
      }
    } else {
      pile.damage.push({ special: "DW" });
      if (pile.supply.III.length > 0) {
        const lowest = lowestDahakaCard(pile);
        if (lowest) moveDahakaCardToRemoved(pile, lowest);
        const promoted = pile.supply.III.pop();
        if (promoted) insertRandom(pile.deck, promoted);
        pile.deck.push(card);
      } else {
        pile.deck = shuffleCards(pile.deck.concat(pile.discard));
        pile.discard = [];
        pile.deck.push(card);
      }
    }
    savePiles();
    renderAibpCards();
  }

  function lowestDahakaCard(pile) {
    for (const level of ["I", "II", "III"]) {
      const card = pile.deck.find((item) => item.bpLevel === level)
        || pile.discard.find((item) => item.bpLevel === level);
      if (card) return card;
    }
    return null;
  }

  function moveDahakaCardToRemoved(pile, target) {
    const identity = cardIdentity(target);
    for (const key of ["deck", "discard"]) {
      const index = pile[key].findIndex((card) => cardIdentity(card) === identity);
      if (index >= 0) {
        pile.removed.push(pile[key].splice(index, 1)[0]);
        return true;
      }
    }
    return false;
  }

  function promoteDahaka(options = {}) {
    ensurePiles("DAHAKA");
    const pile = piles.DAHAKA.aibp;
    if (pile.pending) return false;
    const lowest = lowestDahakaCard(pile);
    if (!lowest || lowest.bpLevel === "III") return false;
    if (options.remember !== false) rememberUndo("DAHAKA", "AIBP");
    const nextLevel = lowest.bpLevel === "I" ? "II" : "III";
    moveDahakaCardToRemoved(pile, lowest);
    const promoted = pile.supply[nextLevel].pop();
    if (promoted) insertRandom(pile.deck, promoted);
    if (options.persist !== false) savePiles();
    if (options.render !== false) renderAibpCards();
    return true;
  }

  function drawAiSpecial(options = {}) {
    const ai = piles[currentApostle].AI;
    if (ai.pending) return;
    if (options.demidjinn) {
      normalizeDemidjinnAi(ai);
    }
    if (ai.deck.length === 0 && ai.discard.length === 0) return;
    rememberUndo(currentApostle, "AI");
    if (ai.deck.length === 0) {
      ai.deck = shuffleCards(ai.discard);
      ai.discard = [];
    }
    const drawIndex = options.fromBottom ? ai.deck.length - 1 : 0;
    ai.pending = ai.deck[drawIndex] || null;
    const drawn = ai.pending;
    const locked = drawn?.specialAi === "demidjinn-o";
    if (locked) {
      reshuffleDemidjinnAfterAiO(ai, drawn);
      ai.pending = null;
    }
    savePiles();
    renderAibpCards();
    if (!drawn) return;
    openImageZoom(cardSrc(drawn), "抽取的 AI", locked ? null : () => {
      if (piles[currentApostle]?.AI?.pending
        && cardIdentity(piles[currentApostle].AI.pending) === cardIdentity(drawn)) {
        discardAiPending(false);
      }
    });
  }

  function drawBpFromBottom() {
    const bp = piles.TITAN_X.BP;
    if (bp.pending) return;
    if (bp.deck.length === 0 && bp.discard.length === 0) return;
    rememberUndo("TITAN_X", "BP");
    if (bp.deck.length === 0) {
      bp.deck = shuffleCards(bp.discard);
      bp.discard = [];
    }
    bp.pending = bp.deck.at(-1) || null;
    savePiles();
    renderAibpCards();
    if (bp.pending) {
      openImageZoom(cardSrc(bp.pending), "抽取的 BP（牌堆底部）", null, {
        bpActions: true
      });
    }
  }

  function resolveBabelianVp() {
    const state = piles.THE_BABELIAN_LUNACY;
    const bp = state.BP;
    if (!bp.pending) return;
    rememberUndo("THE_BABELIAN_LUNACY", "AIBP");
    const card = removePendingCard(bp);
    insertRandom(bp.deck, card);
    savePiles();
    renderAibpCards();
  }

  function resolveTitanXFeint(card) {
    const state = piles.TITAN_X;
    const pending = state.special.titanX.pendingEffect;
    if (!pending || cardIdentity(pending) !== cardIdentity(card)) return;
    const meta = FEINT_META[card.index] || { kind: "effect" };
    state.special.titanX.pendingEffect = null;
    if (meta.overstep) {
      insertTitanXOverstep(meta.overstep, state, false);
      state.feint.removed.push(card);
    } else {
      state.feint.deck.push(card);
      state.feint.deck = shuffleCards(state.feint.deck);
    }
    savePiles();
    renderAibpCards();
    renderSpecials();
  }

  function drawTitanXFeint() {
    ensurePiles("TITAN_X");
    const state = piles.TITAN_X;
    const feint = state.feint;
    if (!feint.deck.length || state.special.titanX.pendingEffect) return;
    rememberUndo("TITAN_X", "AI");
    const card = feint.deck.shift();
    const meta = FEINT_META[card.index] || { kind: "effect" };
    if (meta.kind === "status") {
      const previous = feint.active.shift();
      if (previous) feint.deck.push(previous);
      feint.active = [card];
      feint.deck = shuffleCards(feint.deck);
      state.special.titanX.activeStatus = card;
      state.special.titanX.bottomDraw = Boolean(meta.bottomDraw);
      savePiles();
      renderAibpCards();
      renderSpecials();
      openImageZoom(cardSrc(card), "生效中的状态变招");
      return;
    }
    state.special.titanX.pendingEffect = card;
    savePiles();
    renderAibpCards();
    openImageZoom(cardSrc(card), "效果变招", () => resolveTitanXFeint(card));
  }

  function nextGlobalWish() {
    const wish = piles.DEMIDJINN.special.demidjinn.globalWish;
    rememberUndo("DEMIDJINN", "AIBP");
    if (wish.active) wish.discard.push(wish.active);
    if (wish.deck.length === 0) {
      wish.deck = shuffleCards(wish.discard);
      wish.discard = [];
    }
    wish.active = wish.deck.shift() || null;
    wish.round += 1;
    savePiles();
    renderSpecials();
    renderExtraCards();
  }

  function getPath(object, path) {
    return String(path).split(".").reduce((value, key) => value?.[key], object);
  }

  function setPath(object, path, value) {
    const keys = String(path).split(".");
    const last = keys.pop();
    const parent = keys.reduce((target, key) => {
      target[key] ||= {};
      return target[key];
    }, object);
    parent[last] = value;
  }

  function stepper(label, field, value, minimum = 0, maximum = 99) {
    return `
      <div class="c45-counter-row">
        <div class="c45-counter-label">${escapeHtml(label)}</div>
        <div class="c45-stepper">
          <button type="button" data-counter-field="${escapeHtml(field)}" data-delta="-1"
            data-min="${minimum}" data-max="${maximum}" title="减少" aria-label="减少">−</button>
          <div class="c45-stepper-output">${escapeHtml(value)}</div>
          <button type="button" data-counter-field="${escapeHtml(field)}" data-delta="1"
            data-min="${minimum}" data-max="${maximum}" title="增加" aria-label="增加">+</button>
        </div>
      </div>
    `;
  }

  function addMidascorePain(amount) {
    const state = piles.MIDASCORE;
    if (!state) return false;
    ensureC45State("MIDASCORE");
    const increment = Math.max(0, Math.floor(Number(amount) || 0));
    if (increment <= 0) return false;
    const data = state.special.midascore;
    const next = clamp(data.pain + increment, 0, 99);
    if (next === data.pain) return false;
    data.pain = next;
    syncMidascorePainToken(state);
    return true;
  }

  function resolveMidascorePain() {
    const state = piles.MIDASCORE;
    if (!state) return false;
    ensureC45State("MIDASCORE");
    if (state.special.midascore.pain < 5) return false;
    rememberUndo("MIDASCORE", "AIBP");
    state.special.midascore.pain -= 5;
    syncMidascorePainToken(state);
    openImageZoom("ps/MIDASCORE/MIDASCORE_SIGNATURE_X_001.jpg", "米达斯核标志行为");
    saveAndRender();
    return true;
  }

  function handleMidascorePainTokenClick() {
    if (currentApostle !== "MIDASCORE") return false;
    ensureC45State("MIDASCORE");
    if (piles.MIDASCORE.special.midascore.pain >= 5) {
      return resolveMidascorePain();
    }
    rememberUndo("MIDASCORE", "BP");
    if (!addMidascorePain(1)) return false;
    saveAndRender();
    return true;
  }

  function renderDemidjinn(state) {
    const wish = state.special.demidjinn.globalWish;
    const active = wish.active;
    const activeText = globalWishText(active);
    return `
      <div class="c45-control c45-wish-control wide">
        <div class="c45-wish-layout">
          <div class="c45-control-head c45-wish-head">
            <div class="c45-control-title">全场愿望</div>
            <div class="c45-control-note">第 ${wish.round} 个泰坦轮 · 牌堆 ${wish.deck.length} · 弃牌 ${wish.discard.length}</div>
          </div>
          <div class="c45-wish-view">
            ${active
              ? `<div class="c45-wish-name">${escapeHtml(globalWishName(active))}</div>`
              : `<div class="c45-wish-empty">首个泰坦轮不启用全场愿望</div>`}
          </div>
          <div class="c45-action-row c45-wish-actions">
            <button type="button" data-action="next-global-wish">抽取全场愿望</button>
            <button type="button" data-action="reset-global-wish">重置愿望牌堆</button>
          </div>
          ${activeText ? `
            <div class="c45-wish-copy">
              <div class="c45-wish-copy-column" lang="en">
                <div class="c45-wish-copy-label">原文</div>
                <div>${escapeHtml(activeText.original)}</div>
              </div>
              <div class="c45-wish-copy-column" lang="zh-CN">
                <div class="c45-wish-copy-label">中文</div>
                <div>${escapeHtml(activeText.translated)}</div>
              </div>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  function renderSpecificControls(state) {
    switch (currentApostle) {
      case "MIDASCORE": return "";
      case "DEMIDJINN": return renderDemidjinn(state);
      case "THE_BABELIAN_LUNACY": return "";
      case "DAHAKA": return "";
      case "DRAGON_OF_PHOBOS": return "";
      case "MEDUKETOS": return "";
      case "UR_FLEECE": return "";
      case "TITAN_X": return "";
      default: return "";
    }
  }

  function renderSpecials() {
    if (!specialRoot) return;
    const show = isC45() && piles[currentApostle];
    specialRoot.classList.toggle("show", Boolean(show));
    if (!show) {
      specialRoot.replaceChildren();
      return;
    }
    ensureC45State(currentApostle);
    const state = piles[currentApostle];
    const controls = renderSpecificControls(state);
    if (!controls) {
      specialRoot.classList.remove("show");
      specialRoot.replaceChildren();
      return;
    }
    specialRoot.innerHTML = `<div class="c45-specials-grid">${controls}</div>`;
  }

  function renderBabelianBpControl() {
    if (!babelianFusionControl) return;
    const show = currentApostle === "THE_BABELIAN_LUNACY";
    babelianFusionControl.hidden = !show;
    if (!show) {
      babelianFusionControl.replaceChildren();
      return;
    }
    ensureC45State(currentApostle);
    const bonus = piles[currentApostle].special.babelian.fusionBonus;
    babelianFusionControl.innerHTML = `
      ${stepper("合体攻击加成", "babelian.fusionBonus", bonus, 0, 99)}
      <div class="c45-action-row">
        <button type="button" data-action="clear-fusion-bonus"${bonus ? "" : " disabled"}>归零</button>
      </div>
    `;
  }

  function updateSpecialDrawUi() {
    promoteAiSingleButton.textContent = "AI 晋升";
    promoteBpSingleButton.textContent = "BP 晋升";
    if (!isC45()) return;
    if (currentApostle === "DAHAKA") {
      const pile = piles.DAHAKA.aibp;
      const isAi = pile.pendingMode === "AI";
      const isBp = pile.pendingMode === "BP";
      drawAiButton.disabled = Boolean(pile.pending);
      drawBpButton.disabled = Boolean(pile.pending);
      confirmAiButton.disabled = !isAi;
      discardBpButton.disabled = !isBp;
      defeatBpButton.disabled = !isBp;
      criticalBpButton.disabled = !isBp || pile.pending?.bpLevel !== "III";
      promoteAiSingleButton.textContent = "AI/BP 晋升";
      promoteBpSingleButton.textContent = "AI/BP 晋升";
      if (isAi) {
        bpDrawPreview.classList.remove("has-card");
        bpDrawPreview.textContent = "合体牌正在按 AI 结算";
      } else if (isBp) {
        aiDrawPreview.classList.remove("has-card");
        aiDrawPreview.textContent = "合体牌正在按 BP 结算";
      }
    }
    if (currentApostle === "DEMIDJINN") {
      confirmAiButton.disabled = piles.DEMIDJINN.AI.pending?.specialAi === "demidjinn-o"
        || !piles.DEMIDJINN.AI.pending;
    }
    if (currentApostle === "TITAN_X") {
      drawFeintButton.disabled = Boolean(
        piles.TITAN_X.special.titanX.pendingEffect
      ) || piles.TITAN_X.feint.deck.length === 0;
    }
  }

  function cleanMisclassifiedExtras() {
    if (currentApostle === "MIDASCORE") {
      extraGrid.querySelectorAll('img[src*="MIDASCORE_AI_X_001"]').forEach((img) => img.remove());
    }
    if (currentApostle === "DEMIDJINN") {
      extraGrid.querySelectorAll(
        'img[src*="DEMIDJINN_TR_O_001"], img[src*="DEMIDJINN_TR_IV_001"]'
      ).forEach((img) => img.remove());
    }
  }

  function saveAndRender() {
    savePiles();
    renderAibpCards();
    renderSpecials();
  }

  function resolveTriggeredAi(kind) {
    const state = piles[currentApostle];
    if (state.AI.pending) return;
    if (kind === "demidjinn") {
      if (state.special.demidjinn.wishForWish < 3) return;
    } else if (kind === "dragon") {
      const data = state.special.dragon;
      const threshold = currentApostleLevel() >= 4 ? 3 : 4;
      if (data.truthTokens < threshold) return;
    } else if (kind === "meduketos") {
      const data = state.special.meduketos;
      if (data.slowBoiling < 3) return;
    }
    rememberUndo(currentApostle, "AIBP");
    if (kind === "demidjinn") {
      state.special.demidjinn.wishForWish = 0;
      syncTriggeredCounterToken(state, kind, 0);
    } else if (kind === "dragon") {
      const data = state.special.dragon;
      data.truthTokens = 0;
      syncTriggeredCounterToken(state, kind, data.truthTokens);
    } else if (kind === "meduketos") {
      const data = state.special.meduketos;
      data.slowBoiling = 0;
      syncTriggeredCounterToken(state, kind, data.slowBoiling);
    }
    saveAndRender();
    if (kind === "demidjinn") {
      openImageZoom(
        "ps/DEMIDJINN/DEMIDJINN_SIGNATURE_X_001.jpg",
        "半神帝晶标志行为"
      );
      return;
    }
    window.setTimeout(() => drawAi(), 0);
  }

  function handleTriggeredCounterTokenClick(kind) {
    const apostle = kind === "demidjinn"
      ? "DEMIDJINN"
      : kind === "dragon"
        ? "DRAGON_OF_PHOBOS"
        : "MEDUKETOS";
    if (currentApostle !== apostle) return false;
    ensureC45State(currentApostle);
    const state = piles[currentApostle];
    const data = kind === "demidjinn" ? state.special.demidjinn : state.special[kind];
    const field = kind === "demidjinn"
      ? "wishForWish"
      : kind === "dragon"
        ? "truthTokens"
        : "slowBoiling";
    const threshold = kind === "dragon" && currentApostleLevel() < 4 ? 4 : 3;
    if (data[field] >= threshold) {
      resolveTriggeredAi(kind);
      return true;
    }
    rememberUndo(currentApostle, "AIBP");
    const currentState = piles[currentApostle];
    const currentData = kind === "demidjinn"
      ? currentState.special.demidjinn
      : currentState.special[kind];
    currentData[field] = clamp(currentData[field] + 1, 0, threshold);
    syncTriggeredCounterToken(currentState, kind, currentData[field]);
    saveAndRender();
    return true;
  }

  function handlePanelCounterTokenClick() {
    if (currentApostle === "MIDASCORE") return handleMidascorePainTokenClick();
    if (currentApostle === "DEMIDJINN") {
      return handleTriggeredCounterTokenClick("demidjinn");
    }
    if (currentApostle === "DRAGON_OF_PHOBOS") {
      return handleTriggeredCounterTokenClick("dragon");
    }
    if (currentApostle === "MEDUKETOS") {
      return handleTriggeredCounterTokenClick("meduketos");
    }
    return false;
  }

  function handleSpecialClick(event) {
    const zoom = event.target.closest("[data-zoom-src]");
    if (zoom) {
      openImageZoom(zoom.dataset.zoomSrc, zoom.getAttribute("alt") || "状态牌");
      return;
    }

    const counter = event.target.closest("[data-counter-field]");
    if (counter) {
      const data = piles[currentApostle].special;
      const field = counter.dataset.counterField;
      const next = clamp(
        Number(getPath(data, field) || 0) + Number(counter.dataset.delta || 0),
        Number(counter.dataset.min || 0),
        Number(counter.dataset.max || 99)
      );
      if (next === Number(getPath(data, field) || 0)) return;
      rememberUndo(currentApostle, "AIBP");
      setPath(data, field, next);
      saveAndRender();
      return;
    }

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const state = piles[currentApostle];
    const special = state.special;
    if (action === "next-global-wish") {
      nextGlobalWish();
      return;
    } else if (action === "reset-global-wish") {
      rememberUndo("DEMIDJINN", "AIBP");
      special.demidjinn.globalWish = newGlobalWishState();
      renderExtraCards();
    } else if (action === "clear-fusion-bonus") {
      if (!special.babelian.fusionBonus) return;
      rememberUndo(currentApostle, "AIBP");
      special.babelian.fusionBonus = 0;
    }
    saveAndRender();
  }

  ensurePiles = function (name) {
    base.ensurePiles(name);
    ensureC45State(name);
  };

  cardSrc = function (card) {
    const src = base.cardSrc(card);
    if (currentApostle === "DAHAKA" && card?.combinedAibp) {
      return `${src}?v=20260730dahakaccw1`;
    }
    return src;
  };

  function syncDahakaLayout(name = currentApostle) {
    if (name !== "DAHAKA") return;
    aibpLayout.classList.remove("ai-only");
    bpColumn.hidden = false;
  }

  renderApostle = function (name) {
    base.renderApostle(name);
    ensureC45State(name);
    syncDahakaLayout(name);
    renderSpecials();
    renderBabelianBpControl();
    updateSpecialDrawUi();
    renderPanelTokens();
  };

  renderAibpCards = function () {
    if (isC45()) ensureC45State(currentApostle);
    base.renderAibpCards();
    updateSpecialDrawUi();
    renderSpecials();
    renderBabelianBpControl();
    renderPanelTokens();
  };

  renderExtraCards = function () {
    base.renderExtraCards();
    cleanMisclassifiedExtras();
    if (currentApostle === "DEMIDJINN") {
      const activeWish = piles.DEMIDJINN?.special?.demidjinn?.globalWish?.active;
      if (activeWish) {
        const image = document.createElement("img");
        image.src = cardSrc(activeWish);
        image.alt = globalWishName(activeWish);
        image.className = "c45-active-global-wish-trait";
        image.dataset.demidjinnGlobalWish = "active";
        extraGrid.prepend(image);
      }
    }
    window.setTimeout(cleanMisclassifiedExtras, 400);
  };

  drawAi = function (remember = true) {
    ensurePiles(currentApostle);
    if (currentApostle === "DAHAKA") {
      drawDahaka("AI");
      return;
    }
    if (currentApostle === "DEMIDJINN") {
      drawAiSpecial({ demidjinn: true });
      return;
    }
    if (titanXDrawsFromBottom()) {
      drawAiSpecial({ fromBottom: true });
      return;
    }
    base.drawAi(remember);
  };

  drawBp = function () {
    ensurePiles(currentApostle);
    if (currentApostle === "DAHAKA") {
      drawDahaka("BP");
      return;
    }
    if (titanXDrawsFromBottom()) {
      drawBpFromBottom();
      return;
    }
    base.drawBp();
  };

  discardAiPending = function (remember = true) {
    if (currentApostle === "DAHAKA") {
      const pile = piles.DAHAKA.aibp;
      if (!pile.pending || pile.pendingMode !== "AI") return;
      if (remember) rememberUndo("DAHAKA", "AIBP");
      const card = removePendingCard(pile);
      pile.pendingMode = "";
      pile.discard.push(card);
      saveAndRender();
      return;
    }
    if (currentApostle === "DEMIDJINN"
      && piles.DEMIDJINN.AI.pending?.specialAi === "demidjinn-o") {
      return;
    }
    base.discardAiPending(remember);
  };

  resolveBp = function (mode) {
    if (currentApostle === "DAHAKA") {
      resolveDahakaBp(mode);
      return;
    }
    if (currentApostle === "THE_BABELIAN_LUNACY"
      && (mode === "vp-defeat" || mode === "vp-critical")) {
      resolveBabelianVp();
      return;
    }
    const titanBottom = titanXDrawsFromBottom();
    const pendingLevel = currentApostle === "TITAN_X"
      ? piles.TITAN_X.BP.pending?.level
      : "";
    base.resolveBp(mode);
    if (titanBottom && pendingLevel === "III") {
      piles.TITAN_X.BP.deck = shuffleCards(piles.TITAN_X.BP.deck);
      savePiles();
      renderAibpCards();
    }
  };

  promoteSinglePile = function (type) {
    if (currentApostle === "DAHAKA") {
      promoteDahaka();
      return;
    }
    const before = promotionFingerprint(type);
    base.promoteSinglePile(type);
    if (currentApostle === "DEMIDJINN"
      && promotionFingerprint(type) !== before) {
      discardDemidjinnPromotionTop();
      saveAndRender();
    }
  };

  promoteBpByRemovingLowest = function () {
    if (currentApostle === "DAHAKA") {
      return promoteDahaka();
    }
    return base.promoteBpByRemovingLowest();
  };

  performLinkedPromotion = function () {
    if (currentApostle === "DAHAKA") {
      return promoteDahaka({ remember: false, persist: false, render: false });
    }
    return base.performLinkedPromotion();
  };

  promoteAiFromLevel = function (fromLevel, toLevel, damageCount = 1) {
    const before = promotionFingerprint("AI");
    base.promoteAiFromLevel(fromLevel, toLevel, damageCount);
    if (currentApostle === "DEMIDJINN"
      && promotionFingerprint("AI") !== before) {
      discardDemidjinnPromotionTop();
    }
  };

  promoteAiForBpIII = function (damageCount = 2) {
    if (activateDemidjinnLastWish()) return;
    const before = promotionFingerprint("AI");
    base.promoteAiForBpIII(damageCount);
    if (currentApostle === "DEMIDJINN"
      && promotionFingerprint("AI") !== before) {
      discardDemidjinnPromotionTop();
    }
  };

  setImageZoomBpActions = function (show = false) {
    base.setImageZoomBpActions(show);
    if (!show || currentApostle !== "THE_BABELIAN_LUNACY") return;
    const pending = piles[currentApostle]?.BP?.pending;
    imageZoomBpActions.querySelectorAll("[data-bp-zoom-action]").forEach((button) => {
      const action = button.dataset.bpZoomAction;
      if (action !== "vp-defeat" && action !== "vp-critical") return;
      button.hidden = false;
      button.disabled = !pending
        || (action === "vp-critical" && pending.level !== "III");
    });
  };

  undoLastAibp = function (type = "") {
    base.undoLastAibp(type);
    ensureC45State(currentApostle);
    renderSpecials();
    renderExtraCards();
    renderBabelianBpControl();
    renderPanelTokens();
  };

  drawFeint = function () {
    if (currentApostle === "TITAN_X") {
      drawTitanXFeint();
      return;
    }
    base.drawFeint();
  };

  function interceptDirectButton(button, predicate, handler) {
    button.addEventListener("click", (event) => {
      if (!predicate()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handler();
    }, true);
  }

  function interceptDirectListeners() {
    interceptDirectButton(
      drawAiButton,
      () => ["DAHAKA", "DEMIDJINN"].includes(currentApostle) || titanXDrawsFromBottom(),
      () => drawAi()
    );
    interceptDirectButton(
      drawBpButton,
      () => currentApostle === "DAHAKA" || titanXDrawsFromBottom(),
      () => drawBp()
    );
    interceptDirectButton(
      confirmAiButton,
      () => currentApostle === "DAHAKA"
        || (currentApostle === "DEMIDJINN"
          && piles.DEMIDJINN.AI.pending?.specialAi === "demidjinn-o"),
      () => discardAiPending(true)
    );
    interceptDirectButton(
      drawFeintButton,
      () => currentApostle === "TITAN_X",
      () => drawTitanXFeint()
    );
    interceptDirectButton(
      newCampaignButton,
      () => isC45(),
      () => {
        base.startNewCampaign();
        ensureC45State(currentApostle);
        saveAndRender();
        renderExtraCards();
      }
    );
  }

  function mountSpecials() {
    specialRoot = document.createElement("section");
    specialRoot.id = "c45Specials";
    specialRoot.className = "c45-specials";
    specialRoot.setAttribute("aria-label", "C4-C5 特殊规则");
    const cardsPanel = document.querySelector(".cards-panel");
    cardsPanel.parentNode.insertBefore(specialRoot, cardsPanel);
    specialRoot.addEventListener("click", handleSpecialClick);
    babelianFusionControl?.addEventListener("click", handleSpecialClick);
  }

  mountSpecials();
  interceptDirectListeners();
  window.C45SpecialsReady = true;
  ensurePiles(currentApostle);
  syncDahakaLayout();
  applyCurrentApostleLevelBonuses();
  savePiles();
  renderAibpCards();
  renderExtraCards();
  renderSpecials();
  renderBabelianBpControl();
  refreshTitanRoster();

  window.C45Specials = {
    ensureState(name = currentApostle) {
      ensurePiles(name);
      return clonePileState(piles[name]);
    },
    getRoster() {
      return clonePileState(activeRoster());
    },
    recordBpWound(amount) {
      if (currentApostle === "MIDASCORE") return addMidascorePain(amount);
      if (currentApostle !== "DEMIDJINN") return false;
      ensureC45State("DEMIDJINN");
      const increment = Math.max(0, Math.floor(Number(amount) || 0));
      if (increment <= 0) return false;
      const state = piles.DEMIDJINN;
      const data = state.special.demidjinn;
      const next = clamp(data.wishForWish + increment, 0, 99);
      if (next === data.wishForWish) return false;
      data.wishForWish = next;
      syncTriggeredCounterToken(state, "demidjinn", next);
      return true;
    },
    recordBpCardDamage(card) {
      if (currentApostle !== "DEMIDJINN" || card?.level !== "III") return false;
      return activateDemidjinnLastWish();
    },
    handleMidascorePainTokenClick,
    handlePanelCounterTokenClick,
    resetCurrentSpecials() {
      if (!isC45()) return;
      rememberUndo(currentApostle, "AIBP");
      piles[currentApostle].special = defaultSpecialState();
      if (currentApostle === "DAHAKA") {
        piles[currentApostle].aibp = makeDahakaPile();
        piles[currentApostle].AI = piles[currentApostle].aibp;
        piles[currentApostle].BP = piles[currentApostle].aibp;
      }
      ensureC45State(currentApostle);
      saveAndRender();
    }
  };
})();
