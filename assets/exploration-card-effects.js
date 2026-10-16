(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ATO_EXPLORATION_EFFECT_RULES = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CREW_MAX = { c1: 6, c2: 9, c3: 10, c4: 6, c5: 6 };
  const HULL_MAX = { c1: 5, c2: 6, c3: 7, c4: 5, c5: 6 };
  // 阿尔戈号命运轨道上限 9；悖论另有自己的上限 12（记录表的失败提示按「命运 ≥ 10」读段落）。
  const FATE_MAX = 9;
  const PARADOX_MAX = 12;
  const INITIAL_TRACKS = {
    c1: { hull: 4, crew: 5 }, c2: { hull: 5, crew: 5 }, c3: { hull: 5, crew: 5 },
    c4: { hull: 5, crew: 6 }, c5: { hull: 6, crew: 4 },
  };
  const LABELS = { crew: "船员", hull: "船体", fate: "阿尔戈号命运", strangers: "陌生人", titan: "泰坦",
    humanity: "人性", renegade: "变节者", paradox: "悖论", frozenTime: "凝固时光", babelianDebt: "巴比伦债务",
    paranoia: "猜忌", priests: "祭司", progress: "进展", doom: "灾祸", knowledge: "阿尔戈号知识", refugees: "难民", nymphCharges: "宁芙召唤充能", loopLength: "轮回长度" };
  const DASHBOARD_TYPES = new Set(["progress", "doom", "knowledge"]);
  const ICON_KEYS = {
    c1: { "cloaked-figure glyph": "strangers", "hooded figure": "strangers", "cup/urn glyph": "fate",
      "disc-with-emblem glyph": "titan", "robed figure - Priest": "priests", "book with flame": "knowledge",
      "open book with a flame above it": "knowledge", "black lozenge with white vessel glyph": "fate",
      "black hexagon with triangle-hook glyph": "fate", "Titan symbol": "fate",
      "black emblem: two triangles flanking a central downward teardrop": "fate", "inverted triangle - Despair token": "fate" },
    c2: { "solid dark inverted triangle with white Ψ glyph": "fate", "large dark inverted-triangle glyph with pale inner marks": "fate",
      "dark crossed-blades glyph": "crew", "black disc with white beast-head emblem": "titan", "book-with-flame glyph": "knowledge",
      "dark banner-shaped glyph": "progress", "dark structure-with-cross glyph": "knowledge", "small dark human figure": "refugees",
      "white human figure in dark pentagon": "refugees", "pale figure in dark pentagon": "refugees", "figure": "refugees",
      "black hexagon with white glyph": "refugees", "white Ψ-shaped glyph in dark pentagon": "fate", "pale Ψ-glyph in dark pentagon": "fate",
      "solid black disc": "hull", "黑色交叉状图标": "crew", "深色团块状图标": "hull", "深色五边形内白色Ψ状符号": "fate",
      "深色五边形内白色动物剪影": "refugees", "三角形轮廓内的小符号": "doom", "outlined triangle with small inner glyph": "doom" },
    c3: { "solid dark inverted triangle with a white inner glyph": "fate", "white glyph in dark lozenge": "fate",
      "black droplet/shield glyph with a white inverted triangle inside": "fate", "small dark vessel glyph with pale interior": "progress",
      "outlined slanted angular glyph with white bars": "paradox", "white outlined angular glyph, like a slanted bracket": "paradox",
      "outlined triangle glyph": "paradox", "white triangle glyph in dark hexagon": "paradox",
      "white Ω glyph in dark hexagon": "paradox", "white Ψ glyph in dark hexagon": "fate",
      "black disc with white emblem": "titan", "black disc with white beast-head emblem": "titan", "black disc-with-emblem glyph": "titan",
      "dark banner-shaped glyph": "progress", "dark structure-with-cross glyph": "knowledge",
      "open book with a flame above it": "knowledge", "dark disc with a white emblem": "hull", "white Α glyph in dark hexagon": "paradox",
      "pale outlined inverted-triangle glyph with a small inner emblem": "nymphCharges" },
    c4: { "dark crossed-blade glyph": "crew", "dark round coin-like glyph with short rays": "babelianDebt",
      "dark round glyph with a white inner curve": "titan", "black disc with a white beast-head emblem": "titan",
      "solid black disc with a pale beast-head emblem": "titan", "dark glyph with a white V-notch": "fate",
      "dark upended-V resource glyph": "fate", "white trident-like glyph on dark lozenge": "fate",
      "white α-like glyph on dark lozenge": "babelianDebt", "small dark round resource glyph": "babelianDebt",
      "dark droplet/shield glyph with a pale inner mark": "babelianDebt", "white glyph on dark lozenge": "babelianDebt",
      "white rounded glyph on dark lozenge": "babelianDebt", "pale outlined triangle glyph": "doom", "book-with-flame resource glyph": "knowledge" },
    c5: { "small dark hand-like glyph": "paranoia", "white hand-like glyph in dark lozenge": "paranoia",
      "white vessel-like glyph in dark lozenge": "fate", "dark glyph with a white V-notch": "fate", "dark crossed glyph": "crew",
      "black disc with a white beast-head emblem": "titan" },
  };
  // Some visual transcriptions reused one vague label for unrelated symbols.
  // These identities were checked on each card face; never apply them globally.
  const CARD_ICONS = {
    "c1:6401": { "disc-with-emblem glyph": "hull" },
    "c1:6421": { "robed figure - priest": "strangers" },
    "c1:6425": { "robed figure - priest": "strangers" },
    "c1:6429": { "disc-with-emblem glyph": "hull" },
    "c2:13623": { "large dark inverted-triangle glyph with pale inner marks": "progress" },
    "c3:13514": { "black disc-with-emblem glyph": "hull" },
    "c3:13515": { "black emblem glyph": "progress" },
    "c3:13532": { "pale outlined inverted-triangle glyph with a small inner emblem": "doom", "black disc with white emblem": "hull",
      "outlined slanted angular glyph with white bars": { "Friendly": "progress" } },
    "c3:13534": { "black disc with white emblem": "hull" },
    "c4:9329": { "small dark round resource glyph": { "ICON(white trident-like glyph on dark lozenge)/7+": "hull" } },
    "c3:13517": { "black emblem glyph": "doom" },
    "c3:13519": { "black emblem glyph": "fate" },
    "c3:13520": { "black emblem glyph": "progress" },
    "c3:13530": { "black disc with white emblem": "hull" },
    "c4:9300": { "dark round glyph with a pale inner mark": "hull" },
    "c4:9335": { "small dark resource glyph": "progress" },
    "c4:9337": { "small dark resource glyph": "babelianDebt" },
    "c4:9338": { "small dark resource glyph": "progress" },
    "c4:9340": { "small dark resource glyph": "babelianDebt" },
    "c4:9343": { "dark round glyph with a white inner curve": "hull" },
    "c5:10301": { "dark glyph with a white v-notch": { Allied: "progress" } },
    "c5:10302": { "small dark hand-like glyph": { Friendly: "hull", "Aligned with Nemesis": "hull" } },
    "c5:10308": { "small dark hand-like glyph": "fate" },
    "c5:10312": { "small dark hand-like glyph": "doom" },
    "c5:10315": { "small dark hand-like glyph": "hull" },
    "c5:10317": { "dark glyph with a white v-notch": "progress" },
    "c5:10322": { "dark round glyph with a pale inner emblem": "fate" },
    "c5:10323": { "dark round glyph with a pale inner emblem": "hull" },
    "c5:10324": { "dark round glyph with a pale inner emblem": "fate" },
    "c5:10325": { "dark round glyph with a pale inner emblem": "paranoia" },
    "c5:10326": { "dark round glyph with a pale inner emblem": { "Denounced-": "paranoia" } },
    "c5:10327": { "dark round glyph with a pale inner emblem": { "Denounced-": "paranoia" } },
    "c5:10331": { "dark round glyph with a pale inner emblem": "hull", "dark pointed glyph with a tapering tail": "doom" },
    "c5:10332": { "dark round glyph with a pale inner emblem": "hull" },
    "c5:10333": { "dark round glyph with a pale inner emblem": "hull" },
    "c5:10334": { "dark glyph with two bars above a tapering body": "fate", "dark rounded glyph tapering to a point": "paranoia" },
  };
  const TYPE_NAMES = { crew: "Crew", hull: "Hull", fate: "Argo Fate", strangers: "Strangers", titan: "Titan", humanity: "Humanity",
    renegade: "Defectors", paradox: "Paradox", frozenTime: "Frozen Time", babelianDebt: "Babelian Debt", paranoia: "Paranoia",
    priests: "Priests", progress: "Progress Token", doom: "Doom Token", knowledge: "Argo Knowledge", refugees: "Refugees", nymphCharges: "Nymph Charges", loopLength: "Loop Length" };
  const OTHER_ICONS = {
    c1: { "labyrinth diamond": { kind: "faction", label: "迷宫徒派系标记" } },
    c2: { "small dark emblem": { kind: "equipment", label: "装备" }, "深色淤泥状指示物": { kind: "map-token", label: "神浆标记" } },
    c3: { "sun with rays": { kind: "faction", label: "太阳后裔派系标记" } },
    c4: { "small black splatter-like card-type icon": { kind: "equipment", label: "装备" } },
    c5: { "dark irregular sludge-like token glyph": { kind: "map-token", label: "神浆标记" },
      "dark round glyph with a pale inner emblem": { kind: "nemesis", label: "宿敌标记", badge: "Allied" } },
  };
  // The beast-head disc in these Resolve instructions is the Nemesis symbol.
  // Gain/Lose transcriptions can use the same vague glyph name for real Titans.
  const RESOLVE_NEMESIS_CARDS = new Set([
    "c2:13637", "c3:13533", "c4:9336", "c4:9344", "c4:9346",
    "c5:10304", "c5:10305", "c5:10311", "c5:10318",
  ]);
  // Printed paragraphs split into sentence-level OCR rows. Only manual rows
  // are combined; structured choices, delays and numeric operations retain
  // their existing settlement handlers.
  const MANUAL_PARAGRAPHS = {
    "c1:6435": [[1, 2]], "c2:13641": [[1, 2]], "c3:13539": [[1, 2]], "c4:9335": [[1, 2]],
    "c2:13634": [[0, 1, 2, 3, 4]], "c2:13636": [[0, 1, 2]],
    "c3:13506": [[0, 1]], "c3:13534": [[2, 3]], "c3:13535": [[0, 1]],
    "c4:9331": [[0, 1, 2, 3]], "c4:9344": [[0, 1, 2]], "c5:10313": [[0, 1, 2]],
  };
  function combineManualReminders(card, items, context = {}) {
    const key = card?.key || `${card?.cycleId}:${card?.cardId}`;
    let result = [...items];
    if (key === "c4:9332") {
      const base = result.find(item => item.id === "manual:1");
      const replacement = result.find(item => item.id === "manual:3");
      if (base && replacement) {
        const ids = [base.id, replacement.id];
        const id = "manual-group:1-3";
        const chosen = replacement.conditionState === true ? replacement
          : replacement.conditionState === false ? base : null;
        const text = chosen === replacement ? "Every Argonaut without a Curse Affliction gains a Curse Affliction."
          : chosen === base ? base.text
          : "A random Argonaut without a Curse Affliction gains a Curse Affliction; at War, every Argonaut without one gains it instead.";
        const merged = { ...base, id, text, displayText: text, remainder: text, effects: [],
          badge: chosen === replacement ? replacement.badge : "", conditionState: chosen ? true : null,
          groupedManualIds: ids, manualIndexes: [1, 3],
          manualComplete: Boolean(context.manualEffects?.[id] || (chosen && context.manualEffects?.[chosen.id])),
          skippedComplete: Boolean(context.skippedEffects?.[id]),
        };
        result = result.flatMap(item => item.id === base.id ? [merged] : item.id === replacement.id ? [] : [item]);
      }
    }
    // Ambush prose accompanies the registered battle, rather than another task.
    if (["c1:6440", "c4:9327"].includes(key) && context.excludedIndexes?.includes(1)) {
      result = result.filter(item => item.id !== "manual:0");
    }
    for (const indexes of MANUAL_PARAGRAPHS[key] || []) {
      const ids = indexes.map(index => `manual:${index}`);
      const members = ids.map(id => result.find(item => item.id === id));
      if (members.some(item => !item || item.effects?.length || item.resourceChanges?.length || item.removal
        || item.manualPlacements?.length || context.appliedEffects?.[item.id])) continue;
      const qualified = members.filter(item => item.badge?.trim());
      if (new Set(qualified.map(item => item.badge)).size > 1) continue;
      const conditions = qualified.length ? qualified : members;
      const id = `manual-group:${indexes.join("-")}`;
      const text = members.map(item => item.text).join(" ");
      const displayText = members.map(item => item.displayText || item.text).join(" ");
      const merged = { ...members[0], id, text, displayText, remainder: displayText, effects: [],
        badge: qualified[0]?.badge || "", groupedManualIds: ids, manualIndexes: indexes,
        conditionState: conditions.some(item => item.conditionState === false) ? false
          : conditions.some(item => item.conditionState === null) ? null : true,
        manualComplete: Boolean(context.manualEffects?.[id] || ids.every(source => context.manualEffects?.[source])),
        skippedComplete: Boolean(context.skippedEffects?.[id] || ids.every(source => context.skippedEffects?.[source])),
      };
      result = result.flatMap(item => item.id === ids[0] ? [merged] : ids.includes(item.id) ? [] : [item]);
    }
    return result;
  }
  function iconIdentity(name, cycleId, cardId = "", badge = "") {
    const type = iconType(name, cycleId, cardId, badge);
    if (type) return { kind: "stat", type, label: LABELS[type] };
    const key = String(name).trim().toLowerCase().replace(/\s+/g, " ");
    const other = OTHER_ICONS[cycleId]?.[key];
    return other && (!other.badge || other.badge === badge) ? { ...other } : null;
  }
  function displayIcons(text, cycleId, cardId = "", badge = "") {
    const original = String(text || "");
    const key = `${cycleId}:${String(cardId).split(":").pop()}`;
    return original.replace(/ICON\(([^)]*)\)/gi, (raw, name, offset) =>
      RESOLVE_NEMESIS_CARDS.has(key) && /\bresolve\s+(?:an?\s+additional\s+)?$/i.test(original.slice(0, offset))
        && iconType(name, cycleId, cardId, badge) === "titan" ? "宿敌标记" : iconIdentity(name, cycleId, cardId, badge)?.label || raw);
  }
  function iconType(name, cycleId, cardId = "", badge = "") {
    const normalized = String(name).trim().toLowerCase().replace(/\s+/g, " ");
    const specific = CARD_ICONS[`${cycleId}:${String(cardId).split(":").pop()}`]?.[normalized];
    if (typeof specific === "string") return specific;
    if (specific?.[badge]) return specific[badge];
    const entry = Object.entries(ICON_KEYS[cycleId] || {}).find(([label]) => label.toLowerCase() === normalized);
    return entry?.[1] || null;
  }
  let titanSequence = 0;

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function count(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }

  function amount(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : 0;
  }

  // Only a complete English track instruction or an explicit "and" list is
  // actionable. Conditional prose and choices remain intact for the player.
  function parse(text, cycleId, cardId = "", badge = "") {
    const original = String(text || "").trim();
    if (!original || /\b(?:if|or|unless)\b/i.test(original)) {
      return { effects: [], remainder: original };
    }
    // These C1 pictograms have been checked against the card faces and record
    // sheet. Reusing a vague glyph transcription in another cycle is unsafe.
    const mapped = original.replace(/ICON\(([^)]*)\)/gi, (glyph, name) => {
      // This transcription used the same vague label for four different rows.
      // Match this verified card and its badge before the general icon aliases.
      const specific = cycleId === "c4" && String(cardId).replace(/^c4:/, "") === "9341"
        ? ({ Allied: "progress", Neutral: "fate", Unfriendly: "babelianDebt", Denounced: "babelianDebt", "At War": "doom" })[badge] : null;
      const type = specific || (cycleId === "c5" && String(cardId).replace(/^c5:/, "") === "10301" && badge === "Aligned with Nemesis" ? "doom" : iconType(name, cycleId, cardId, badge));
      return type ? TYPE_NAMES[type] : glyph;
    });
    const instruction = mapped.replace(/\s*\(once until the next Timeline Battle\)\./i, ".")
      .replace(/^Place (\d+) Progress Token on Inward Odyssey\.?$/i, "Gain +$1 Progress Token.")
      .replace(/[.。]$/, "").replace(/\s+instead$/i, "").trim();
    if (!/^(?:Gain|Lose)\s+/i.test(instruction)) {
      return { effects: [], remainder: original };
    }
    const parts = instruction.split(/\s+and\s+/i);
    const effects = [];
    const remainder = [];
    let action = "";
    parts.forEach((part) => {
      const explicit = part.match(/^(Gain|Lose)\s+/i);
      if (explicit) action = explicit[1].toLowerCase();
      const body = explicit ? part.slice(explicit[0].length) : part;
      const match = body.match(/^([+-]?\d+)\s+(?:additional\s+)?(Titans?|Crew|Hull|Argo\s+Fate|Strangers?|Humanity|Defectors?|Renegades?|Refugees?|Nymph\s+Charges|Loop\s+Length|Paradox|Frozen\s+Time|Babelian\s+Debt|Paranoia|Priests?|Progress\s+Tokens?|Doom\s+Tokens?|Argo\s+Knowledge)$/i);
      const value = match ? amount(match[1]) : 0;
      const validSign = match && (action === "gain" ? value > 0 : value !== 0 && !match[1].startsWith("+"));
      if (action && validSign) {
        const type = /^titans?$/i.test(match[2]) ? "titan" : /^strangers?$/i.test(match[2]) ? "strangers"
          : /^(?:defectors?|renegades?)$/i.test(match[2]) ? "renegade" : /^priests?$/i.test(match[2]) ? "priests"
          : /^progress/i.test(match[2]) ? "progress" : /^doom/i.test(match[2]) ? "doom"
          : /^refugees?$/i.test(match[2]) ? "refugees" : /^nymph\s+charges$/i.test(match[2]) ? "nymphCharges" : /^loop\s+length$/i.test(match[2]) ? "loopLength"
          : /^argo\s+knowledge$/i.test(match[2]) ? "knowledge" : /^argo\s+fate$/i.test(match[2]) ? "fate"
          : /^frozen\s+time$/i.test(match[2]) ? "frozenTime" : /^babelian\s+debt$/i.test(match[2]) ? "babelianDebt" : match[2].toLowerCase();
        effects.push({ type, amount: action === "lose" ? -Math.abs(value) : value });
      } else {
        remainder.push(explicit ? part : `${action === "lose" ? "Lose" : "Gain"} ${part}`);
      }
    });
    // When nothing was recognized, keep the exact source rather than rewriting
    // an unidentified glyph or a rule we do not understand.
    return { effects, remainder: effects.length ? remainder.join(" and ") : original };
  }

  function describe(card, context = {}, resourceRules) {
    const items = Array.isArray(card?.manual) ? card.manual : [];
    const effectiveContext = card?.diplomacyFaction
      ? { ...context, diplomacyFaction: card.diplomacyFaction } : context;
    const described = items.map((item, index) => {
      const id = `manual:${index}`;
      const text = String(item?.text || "");
      const badge = String(item?.badge || "");
      let conditionState = !item?.condition && !badge.trim() ? true : null;
      const conditionRules = effectiveContext.conditionRules;
      if (item?.condition) {
        const evaluator = item.condition.type === "diplomacy" ? resourceRules : conditionRules || resourceRules;
        const result = typeof evaluator?.conditionMet === "function" ? evaluator.conditionMet(item.condition, effectiveContext) : null;
        conditionState = result === true || result === false ? result : null;
      } else if (badge.trim() && typeof conditionRules?.conditionFromBadge === "function") {
        const condition = conditionRules.conditionFromBadge(badge, card?.cycleId || context.cycleId);
        const result = condition && typeof conditionRules.conditionMet === "function" ? conditionRules.conditionMet(condition, effectiveContext) : null;
        conditionState = result === true || result === false ? result : null;
      }
      const confirmed = context.confirmedConditions?.[id];
      if (conditionState === null && typeof confirmed === "boolean") conditionState = confirmed;
      const parsed = parse(text, card?.cycleId || context.cycleId, card?.cardId || card?.key, badge);
      const oldReceipt = context.appliedEffects?.[id];
      const wrongType = oldReceipt?.changes?.some(change => !parsed.effects.some(effect => effect.type === change.type));
      const blocked = Boolean(context.blockGains && parsed.effects.some((effect) => ["titan", "priests"].includes(effect.type) && effect.amount > 0));
      return {
        id, text, badge, conditionState, displayText: displayIcons(text, card?.cycleId || context.cycleId, card?.cardId, badge),
        ...(item.requiresResource ? { requiresResource: true } : {}),
        effects: blocked ? parsed.effects.filter((effect) => !["titan", "priests"].includes(effect.type) || effect.amount < 0) : parsed.effects,
        remainder: parsed.remainder,
        ...(parsed.effects.length && !parsed.remainder
          ? { displayText: parsed.effects.map(effect=>`${LABELS[effect.type]} ${effect.amount >= 0 ? "+" : ""}${effect.amount}`).join("，") } : {}),
        ...(blocked ? { blocked: true } : {}), replacement: /\binstead[.。]?$/i.test(text),
        ...(oldReceipt && (wrongType || (oldReceipt.ruleVersion !== 2 && (item.correctedFrom ||
          (card?.cycleId !== "c1" && /ICON\(/.test(text) && parsed.effects.length && !parsed.remainder && !context.manualEffects?.[id]))
          )) ? { receiptMismatch: true } : {}),
      };
    }).filter((entry) => entry.text.trim());
    const removed = new Set();
    for (const [index, item] of described.entries()) {
      if (!item.replacement || !item.effects.length) continue;
      const base = described.slice(0,index).reverse().find((candidate) => !candidate.badge && candidate.effects.length
        && candidate.effects.map(e=>e.type).join(',') === item.effects.map(e=>e.type).join(','));
      if (!base) continue;
      const applied = context.appliedEffects || {};
      if (applied[base.id]) { removed.add(item.id); base.conditionState = true; }
      else if (applied[item.id] || item.conditionState === true) { removed.add(base.id); if(applied[item.id]) item.conditionState = true; }
      else if (item.conditionState === null) base.conditionState = null;
    }
    return described.filter(item=>!removed.has(item.id));
  }

  function activeCycle(record, cycleId) {
    return !record.cycle || record.cycle === cycleId;
  }

  function cycleStats(record, cycleId) {
    if (!isObject(record.cycleStats)) record.cycleStats = {};
    if (!isObject(record.cycleStats[cycleId])) record.cycleStats[cycleId] = {};
    return record.cycleStats[cycleId];
  }

  function readStat(record, cycleId, key) {
    if (key === "priests") return count(record.resources?.priests);
    if (key === "refugees" && cycleId === "c2") return c2Counters(record).refugees;
    if (key === "nymphCharges") return count(record.nymphCharges);
    const scoped = record.cycleStats?.[cycleId]?.[key];
    if (scoped !== undefined) return key === "humanity" ? Math.trunc(Number(scoped) || 0) : count(scoped);
    if (!activeCycle(record, cycleId)) return 0;
    // Use the printed initial value only for a missing active-cycle track.
    // Explicit zero/blank and other cycles' aliases keep their existing semantics.
    const legacy = record[key];
    return ["crew", "hull"].includes(key) && (legacy === undefined || legacy === null) ? INITIAL_TRACKS[cycleId][key] : key === "humanity" ? Math.trunc(Number(legacy) || 0) : count(legacy);
  }

  function crewMax(record, cycleId) {
    const max = CREW_MAX[cycleId];
    return ["c2", "c3"].includes(cycleId) && !record.maxUnlocked?.[`${cycleId}-crew`] ? max - 1 : max;
  }

  function c2Counters(record) {
    const existing = record.cycleStats?.c2?.crewCounters;
    if (isObject(existing)) return { ...existing, crew: count(existing.crew), refugees: count(existing.refugees), captives: count(existing.captives) };
    // Older C2 records used suffix boxes on the combined crew track.
    let refugees = 0;
    let captives = 0;
    Object.entries(isObject(record.crewBoxes) ? record.crewBoxes : {}).forEach(([key, value]) => {
      if (!key.startsWith("c2-crew-")) return;
      if (value === true || value === "refugee") refugees += 1;
      else if (value === "captive") captives += 1;
    });
    return { crew: Math.max(0, readStat(record, "c2", "crew") - refugees - captives), refugees, captives };
  }

  function writeStat(record, cycleId, key, value, counters) {
    if (key === "priests") { (record.resources ||= {}).priests = value; return; }
    if (key === "nymphCharges") { record.nymphCharges = String(value); return; }
    const stats = cycleStats(record, cycleId);
    if (key === "refugees" && cycleId === "c2") {
      stats.crewCounters = { ...(counters || c2Counters(record)), refugees: value };
      stats.crew = String(stats.crewCounters.crew);
      if (activeCycle(record, cycleId)) record.crew = stats.crew;
      return;
    }
    stats[key] = String(value);
    if (key === "crew" && cycleId === "c2") stats.crewCounters = { ...(counters || c2Counters(record)), crew: value };
    if (activeCycle(record, cycleId)) record[key] = String(value);
  }

  function changeStat(record, cycleId, type, delta, minimums = {}) {
    const counters = ["crew", "refugees"].includes(type) && cycleId === "c2" ? c2Counters(record) : null;
    const before = counters ? counters[type] : readStat(record, cycleId, type);
    const maximum = type === "fate" ? FATE_MAX : type === "paradox" ? PARADOX_MAX : type === "crew"
      ? Math.max(0, crewMax(record, cycleId) - (counters ? counters.refugees + counters.captives : 0))
      : type === "refugees" && counters ? Math.max(0, crewMax(record, cycleId) - counters.crew - counters.captives)
      : type === "nymphCharges" && record.nymphLimit !== undefined && record.nymphLimit !== null && record.nymphLimit !== "" ? count(record.nymphLimit)
      : type === "hull" ? HULL_MAX[cycleId] - (["c2", "c3"].includes(cycleId) && !record.maxUnlocked?.[`${cycleId}-hull`] ? 1 : 0) : Number.MAX_SAFE_INTEGER;
    const minimum = type === "humanity" ? -Number.MAX_SAFE_INTEGER : Number.isSafeInteger(minimums[type]) ? minimums[type] : 0;
    const after = Math.max(minimum, Math.min(maximum, before + delta));
    if (after !== before) writeStat(record, cycleId, type, after, counters);
    return after - before;
  }

  function dashboardTransaction(record, cycleId, type, delta) {
    if (!DASHBOARD_TYPES.has(type) || !delta) return;
    const id = `exploration-track-${Date.now()}-${++titanSequence}-${Math.random().toString(16).slice(2)}`;
    (record.explorationTrackTransactions ||= []).push({ id, cycleId, type, amount: delta });
  }

  function seedDashboardStats(record, cycleId, effects, options) {
    for (const type of new Set(effects.map(effect=>effect.type))) {
      if (DASHBOARD_TYPES.has(type) && Number.isSafeInteger(options.stats?.[type]) && options.stats[type] >= 0) {
        writeStat(record, cycleId, type, options.stats[type]);
      }
    }
  }

  function newTitanId(titans) {
    let id;
    do {
      const uuid = typeof globalThis?.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${++titanSequence}-${Math.random().toString(16).slice(2)}`;
      id = `titan-exploration-${uuid}`;
    } while (titans.some((titan) => titan.id === id));
    return id;
  }

  function isDreamwalker(titan) {
    return /^(?:梦行者|dream\s*walker)$/i.test(String(titan?.name || "").trim());
  }

  function dreamwalkerLosses(record, requested) {
    let remaining = count(requested);
    return (Array.isArray(record.titans) ? record.titans : []).flatMap(titan => {
      if (!isDreamwalker(titan)) return [];
      const loss = Math.min(remaining, count(titan.count));
      remaining -= loss;
      return loss ? [{ id: titan.id, count: loss }] : [];
    });
  }

  function automaticTitanLosses(record, requested) {
    const preferred = dreamwalkerLosses(record, requested);
    let remaining = count(requested) - preferred.reduce((sum, choice) => sum + choice.count, 0);
    const others = (Array.isArray(record.titans) ? record.titans : []).filter(titan => !isDreamwalker(titan) && count(titan.count));
    const available = others.reduce((sum, titan) => sum + count(titan.count), 0);
    if (remaining > 0 && others.length > 1 && remaining < available) return null;
    return [...preferred, ...others.flatMap(titan => {
      const loss = Math.min(remaining, count(titan.count));
      remaining -= loss;
      return loss ? [{ id: titan.id, count: loss }] : [];
    })];
  }

  function titanSelections(record, effects, options) {
    const requested = effects.reduce((total, effect) => total + (effect.type === "titan" && effect.amount < 0 ? -effect.amount : 0), 0);
    if (!requested) return [];
    const automatic = automaticTitanLosses(record, requested);
    if (automatic !== null) return automatic;
    const titans = Array.isArray(record.titans) ? record.titans : [];
    const available = titans.reduce((total, titan) => total + count(titan?.count), 0);
    const target = Math.min(requested, available);
    const preferred = dreamwalkerLosses(record, requested);
    const selected = new Map(preferred.map(choice => [choice.id, choice.count]));
    (Array.isArray(options.titanLosses) ? options.titanLosses : []).forEach((choice) => {
      if (!choice || typeof choice.id !== "string" || !Number.isSafeInteger(Number(choice.count)) || Number(choice.count) <= 0) {
        throw new Error("请选择要失去的泰坦及数量。");
      }
      if (!preferred.some(item => item.id === choice.id)) selected.set(choice.id, (selected.get(choice.id) || 0) + Number(choice.count));
    });
    let total = 0;
    selected.forEach((number, id) => {
      const titan = titans.find((item) => item?.id === id);
      if (!titan || number > count(titan.count)) throw new Error("所选泰坦数量已改变，请重新选择。");
      total += number;
    });
    if (total !== target) throw new Error(`请选择 ${target} 只要失去的泰坦。`);
    return [...selected].map(([id, number]) => ({ id, count: number }));
  }

  /** Apply chosen track effects without mutating the caller's record. */
  function apply(record, cycleId, effects, options = {}) {
    if (!Object.prototype.hasOwnProperty.call(CREW_MAX, cycleId)) throw new Error("未知战役循环。");
    const next = clone(isObject(record) ? record : {});
    const entries = (Array.isArray(effects) ? effects : [])
      .filter((effect) => effect && Object.prototype.hasOwnProperty.call(LABELS, effect.type) && amount(effect.amount)
        && !(options.blockGains && effect.type === "priests" && effect.amount > 0))
      .map((effect) => ({ type: effect.type, amount: amount(effect.amount) }));
    const choices = titanSelections(next, entries, options);
    seedDashboardStats(next, cycleId, entries, options);
    const changes = [];
    entries.forEach((effect) => {
      if (effect.type !== "titan") {
        const delta = changeStat(next, cycleId, effect.type, effect.amount, options.minimums);
        if (delta) { changes.push({ type: effect.type, cycleId, amount: delta }); dashboardTransaction(next, cycleId, effect.type, delta); }
      } else if (effect.amount > 0 && !options.blockGains) {
        if (!Array.isArray(next.titans)) next.titans = [];
        for (let index = 0; index < effect.amount; index += 1) {
          let position = next.titans.findIndex(isDreamwalker);
          let titan = next.titans[position];
          if (titan) titan.count = count(titan.count) + 1;
          else {
            titan = { id: newTitanId(next.titans), name: "梦行者", count: 1, limit: 1, crippled: false };
            position = next.titans.length;
            next.titans.push(titan);
          }
          changes.push({ type: "titan", id: titan.id, amount: 1, titan: { ...titan }, index: position });
        }
      } else if (effect.amount < 0) {
        let remaining = -effect.amount;
        choices.forEach((choice) => {
          if (!remaining || !choice.count) return;
          const index = next.titans.findIndex((titan) => titan.id === choice.id);
          const titan = next.titans[index];
          const loss = Math.min(remaining, choice.count);
          changes.push({ type: "titan", id: titan.id, amount: -loss, titan: { ...titan }, index });
          titan.count = count(titan.count) - loss;
          if (!titan.count) next.titans.splice(index, 1);
          choice.count -= loss;
          remaining -= loss;
        });
      }
    });
    const totals = {};
    changes.forEach((change) => { totals[change.type] = (totals[change.type] || 0) + change.amount; });
    const summary = Object.entries(totals).map(([type, delta]) => `${LABELS[type]} ${delta >= 0 ? "+" : ""}${delta}`).join("，") || "无数值变化";
    return { record: next, changes, summary };
  }

  /** Undo the actual deltas against current values, preserving unrelated edits. */
  function revert(record, changes, options = {}) {
    const next = clone(isObject(record) ? record : {});
    for (const cycleId of new Set((changes || []).map(change=>change.cycleId).filter(Boolean))) {
      seedDashboardStats(next, cycleId, changes.filter(change=>change.cycleId===cycleId), options);
    }
    [...(Array.isArray(changes) ? changes : [])].reverse().forEach((change) => {
      if (!change || !amount(change.amount)) return;
      if (change.type !== "titan" && Object.prototype.hasOwnProperty.call(LABELS, change.type) && Object.prototype.hasOwnProperty.call(CREW_MAX, change.cycleId)) {
        const delta = changeStat(next, change.cycleId, change.type, -change.amount, options.minimums);
        dashboardTransaction(next, change.cycleId, change.type, delta);
      } else if (change.type === "titan" && typeof change.id === "string") {
        if (!Array.isArray(next.titans)) next.titans = [];
        const index = next.titans.findIndex((titan) => titan.id === change.id);
        if (index >= 0) {
          const titan = next.titans[index];
          titan.count = Math.max(0, count(titan.count) - change.amount);
          if (!titan.count) next.titans.splice(index, 1);
        } else if (change.amount < 0 && isObject(change.titan)) {
          const restored = { ...clone(change.titan), id: change.id, count: -change.amount };
          next.titans.splice(Math.min(next.titans.length, count(change.index)), 0, restored);
        }
      }
    });
    return next;
  }

  return { parse, describe, combineManualReminders, apply, revert, iconType, iconIdentity, displayIcons, dreamwalkerLosses, automaticTitanLosses, version: 2 };
});
