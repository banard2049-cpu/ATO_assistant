(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ATO_EXPLORATION_CONDITIONS = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LABELS = {
    fate: "阿尔戈号命运", hull: "船体", strangers: "陌生人", crew: "船员", progress: "进展指示物", doom: "灾祸指示物",
    humanity: "人性", paradox: "悖论", babelianDebt: "巴比伦债务", frozenTime: "冻结时间", renegade: "叛逃者",
    oxygenCurrent: "氧气", oxygenLimit: "氧气上限",
    paranoia: "猜忌", knowledge: "阿尔戈号知识", refugees: "难民", nymphCharges: "宁芙召唤充能", loopLength: "轮回长度",
  };
  const TEXT_KEYS = {
    "argo fate": "fate", "fate": "fate", "阿尔戈号命运": "fate",
    "stranger": "strangers", "strangers": "strangers", "陌生人": "strangers",
    "crew": "crew", "船员": "crew",
    "hull": "hull", "船体": "hull",
    "progress": "progress", "progress token": "progress", "progress tokens": "progress", "进展指示物": "progress", "进展标记": "progress",
    "doom": "doom", "doom token": "doom", "doom tokens": "doom", "灾祸指示物": "doom", "灾祸标记": "doom",
    "humanity": "humanity", "人性": "humanity", "paradox": "paradox", "悖论": "paradox",
    "babelian debt": "babelianDebt", "巴比伦债务": "babelianDebt", "frozen time": "frozenTime", "冻结时间": "frozenTime",
    "defectors": "renegade", "renegade": "renegade", "变节者": "renegade", "paranoia": "paranoia", "猜忌": "paranoia",
    "refugees": "refugees", "refugee": "refugees", "难民": "refugees", "宁芙召唤充能": "nymphCharges", "loop length": "loopLength", "轮回长度": "loopLength",
  };
  // Exact transcription labels whose identity has been checked against the card
  // face and record-sheet icon. Generic descriptions from other cycles stay
  // unresolved: "figure", "Ψ" or "triangle" alone are not identities.
  const ICON_KEYS = {
    c1: {
      "black lozenge with white vessel glyph": "fate", // AB0075/AB0077; transcription records player confirmation.
      "black hexagon with triangle-hook glyph": "fate", // AB0113 and AB0116 card faces.
      "titan symbol": "fate", // AB0109 card face: the same Fate icon, not the Titan count.
      "cloaked-figure glyph": "strangers", // AB0075/AB0077 and assets/icons/strangers.svg.
      "hooded figure": "strangers",
    },
    c4: {
      "white trident-like glyph on dark lozenge": "fate", // DB2152 left threshold badge.
      "white α-like glyph on dark lozenge": "babelianDebt", // DB2152 right badge has the record-sheet money-bag icon.
    },
  };
  const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  function recordedNumber(value, signed = false) {
    if (value == null || (typeof value === "string" && !value.trim()) || typeof value === "boolean" || typeof value === "object") return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && (signed || number >= 0) ? number : null;
  }
  function namedCounter(stats, key) {
    const matches = Object.values(object(stats.counters) ? stats.counters : {})
      .filter((entry) => object(entry) && TEXT_KEYS[normalize(entry.name)] === key);
    return matches.length === 1 ? recordedNumber(matches[0].count) : null;
  }
  function contextForRecord(record, cycleId) {
    const scoped = object(record?.cycleStats?.[cycleId]) ? record.cycleStats[cycleId] : {};
    const active = !record?.cycle || record.cycle === cycleId;
    const stats = {};
    Object.keys(LABELS).forEach((key) => {
      const aliases = key === "progress" ? ["progress", "progressTokens"] : key === "doom" ? ["doom", "doomTokens"] : [key];
      let value;
      const scopedKey = aliases.find((alias) => Object.prototype.hasOwnProperty.call(scoped, alias));
      const legacyKey = active ? aliases.find((alias) => Object.prototype.hasOwnProperty.call(record || {}, alias)) : undefined;
      if (scopedKey) value = scoped[scopedKey];
      else if (legacyKey) value = record[legacyKey];
      stats[key] = value !== undefined ? recordedNumber(value, key === "humanity") : (key === "progress" || key === "doom" ? namedCounter(scoped, key) : null);
    });
    if (cycleId === "c2") {
      if (object(scoped.crewCounters)) {
        stats.refugees = recordedNumber(scoped.crewCounters.refugees);
        stats.crew = recordedNumber(scoped.crewCounters.crew);
      } else if (active && object(record?.crewBoxes)) {
        stats.refugees = Object.entries(record.crewBoxes)
          .filter(([key, value]) => key.startsWith("c2-crew-") && (value === true || value === "refugee")).length;
      }
    }
    stats.nymphCharges = recordedNumber(record?.nymphCharges);
    return { cycleId, record, stats };
  }
  function splitOr(badge) {
    let depth = 0;
    let start = 0;
    const parts = [];
    for (let index = 0; index < badge.length; index += 1) {
      if (badge[index] === "(") depth += 1;
      else if (badge[index] === ")") depth -= 1;
      if (depth < 0) return null;
      if (!depth) {
        const match = badge.slice(index).match(/^(?:\s+or\s+|\s*或\s*)/i);
        if (match) {
          parts.push(badge.slice(start, index).trim());
          index += match[0].length - 1;
          start = index + 1;
        }
      }
    }
    if (depth) return null;
    parts.push(badge.slice(start).trim());
    return parts;
  }
  function conditionFromBadge(badge, cycleId) {
    const original = String(badge || "").trim();
    if (!original) return null;
    const parts = splitOr(original);
    if (!parts || parts.some((part) => !part)) return null;
    if (parts.length > 1) {
      const conditions = parts.map((part) => conditionFromBadge(part, cycleId));
      if (conditions.some((condition) => !condition)) return null;
      return { type: "or", conditions, badge: original, cycleId, label: conditions.map((condition) => condition.label).join(" 或 ") };
    }
    const match = original.match(/^(.+?)\s*\/?\s*(\d+)\s*([+−-]?)$/);
    if (!match) return null;
    const name = match[1].trim();
    const icon = name.match(/^ICON\((.+)\)$/i);
    const effectRules = typeof module === "object" && module.exports ? require("./exploration-card-effects.js")
      : (typeof window !== "undefined" ? window.ATO_EXPLORATION_EFFECT_RULES : globalThis.ATO_EXPLORATION_EFFECT_RULES);
    const key = icon ? ICON_KEYS[cycleId]?.[normalize(icon[1])] || effectRules?.iconType(icon[1], cycleId) : TEXT_KEYS[normalize(name)];
    const threshold = Number(match[2]);
    if (!key || !LABELS[key] || !Number.isSafeInteger(threshold)) return null;
    const mode = match[3] === "+" ? "atLeast" : match[3] ? "atMost" : "only";
    const label = `${LABELS[key]} ${mode === "atLeast" ? "≥" : mode === "atMost" ? "≤" : "="} ${threshold}`;
    return { type: "track", key, threshold, mode, cycleId, badge: original, label };
  }
  function conditionMet(condition, context = {}) {
    if (!condition) return true;
    if (condition.type === "icon") {
      const parsed = conditionFromBadge(condition.badge, context.cycleId || condition.cycleId);
      return parsed ? conditionMet(parsed, context) : null;
    }
    if (condition.type === "or") {
      if (!Array.isArray(condition.conditions) || !condition.conditions.length) return null;
      const results = condition.conditions.map((entry) => conditionMet(entry, context));
      return results.some((result) => result === true) ? true : results.every((result) => result === false) ? false : null;
    }
    if (condition.type !== "track" || !Object.prototype.hasOwnProperty.call(LABELS, condition.key)) return null;
    const cycleId = context.cycleId || condition.cycleId;
    if (condition.cycleId && cycleId !== condition.cycleId) return null;
    const stats = context.stats || (context.record ? contextForRecord(context.record, cycleId).stats : {});
    const value = recordedNumber(stats[condition.key], condition.key === "humanity");
    const threshold = recordedNumber(condition.threshold);
    if (value === null || threshold === null) return null;
    if (condition.mode === "atLeast") return value >= threshold;
    if (condition.mode === "atMost") return value <= threshold;
    if (condition.mode === "only") return value === threshold;
    return null;
  }

  function dogDays(card, context) {
    if (card?.cycleId !== "c1" || String(card.cardId || card.id) !== "6400") return null;
    if (context.cycleId && context.cycleId !== "c1") return null;
    const stats = context.stats || {};
    const strangers = recordedNumber(stats.strangers);
    const crew = recordedNumber(stats.crew);
    const fate = recordedNumber(stats.fate);
    if (strangers === null || crew === null || fate === null) return null;
    const groups = Math.floor(strangers / 3);
    const crewLoss = Math.min(crew, groups);
    const strangerLoss = groups * 3;
    const effects = [];
    if (crewLoss) effects.push({ type: "crew", amount: -crewLoss });
    if (strangerLoss) effects.push({ type: "strangers", amount: -strangerLoss });
    if (!crewLoss) effects.push({ type: "strangers", amount: 1 });
    if (fate >= 7) effects.push({ type: "strangers", amount: 2 });
    const totals = effects.reduce((values, effect) => ({ ...values, [effect.type]: (values[effect.type] || 0) + effect.amount }), {});
    const summary = Object.entries(totals).map(([key, amount]) => `${LABELS[key]} ${amount >= 0 ? "+" : ""}${amount}`).join("，") || "无数值变化";
    return { id: "conditional:dog-days", text: "坏日子：按陌生人数量结算", effects, manualIndexes: [0, 1, 2], dynamic: true, conditionState: true, summary };
  }
  function simpleConditionalEffects(card, context = {}) {
    const effective = context.stats ? context : { ...context, ...contextForRecord(context.record || {}, card?.cycleId || context.cycleId) };
    if (isCard(card, effective, "c4", "9331")) return stormWorsens(card, effective);
    const descriptor = dogDays(card, effective) || weightOfObligations(card, effective)
      || sabotageTrackEffect(card, effective) || sabotageManualFooter(card, effective) || ambrosiaSpill(card, effective)
      || timeShift(card, effective) || tighteningTheLoop(card, effective) || imperialDues(card, effective)
      || mapBranchEffect(card, effective) || paranoiaCardEffect(card, effective)
      || blackSludgeDoom(card, effective);
    return descriptor ? [descriptor] : [];
  }
  function weightOfObligations(card, context) {
    if (card?.cycleId !== "c4" || String(card.cardId || card.id) !== "9340") return null;
    if (context.cycleId && context.cycleId !== "c4") return null;
    const stats = context.stats || {};
    const debt = recordedNumber(stats.babelianDebt);
    const crew = recordedNumber(stats.crew);
    const fate = recordedNumber(stats.fate);
    const base = { id: "conditional:weight-of-obligations", text: "义务之重：按债务、船员和命运依次结算",
      manualIndexes: [0, 1, 2, 3, 4], dynamic: true };
    if (debt === null || crew === null || fate === null) {
      const hint = "请先补齐记录表中的巴比伦债务、船员和阿尔戈号命运，或手动处理完整效果";
      return { ...base, effects: [], conditionState: null, summary: hint, remainder: hint };
    }
    const crewLost = debt >= 3 && crew > 1;
    const effects = [];
    if (crewLost) effects.push({ type: "crew", amount: -1 });
    // Keep these separate: removing Debt stops at zero before the fallback and Fate bonus are added.
    effects.push({ type: "babelianDebt", amount: -3 });
    if (!crewLost) effects.push({ type: "babelianDebt", amount: 1 });
    if (fate >= 7) effects.push({ type: "babelianDebt", amount: 2 });
    const delta = Math.max(0, debt - 3) + (crewLost ? 0 : 1) + (fate >= 7 ? 2 : 0) - debt;
    const summary = `${crewLost ? "船员 -1，" : ""}巴比伦债务 ${delta >= 0 ? "+" : ""}${delta}`;
    return { ...base, effects, conditionState: true, summary };
  }
  function isCard(card, context, cycleId, cardId) {
    return card?.cycleId === cycleId && String(card.cardId || card.id) === cardId
      && (!context.cycleId || context.cycleId === cycleId);
  }
  function conditionalBase(id, text, manualIndexes) {
    return { id: `conditional:${id}`, text, manualIndexes, dynamic: true };
  }
  function paranoiaCardEffect(card, context) {
    const hidden = isCard(card, context, "c5", "10306");
    const panic = isCard(card, context, "c5", "10310");
    const drown = isCard(card, context, "c5", "10314");
    if (!hidden && !panic && !drown) return null;
    const base = conditionalBase(hidden ? "hidden-truth" : panic ? "panic-spreads" : "drown-in-fear",
      hidden ? "隐藏真相：按猜忌结算，保留最后一名船员" : panic ? "恐慌蔓延：按猜忌结算泰坦损失" : "淹没于恐惧：先增加猜忌，再判断 Fractures 事件",
      hidden || drown ? [0, 1] : [0]);
    base.blockedManualIndexes = [hidden || drown ? 2 : 1];
    const paranoia = recordedNumber(context.stats?.paranoia);
    if (paranoia === null) return manualConditional(base, ["paranoia"]);
    const effects = [];
    if (drown) effects.push({ type: "paranoia", amount: 1 });
    else if (paranoia >= 3) {
      if (hidden) {
        const crew = recordedNumber(context.stats?.crew);
        if (crew === null) return manualConditional(base, ["crew"]);
        if (crew > 1) effects.push({ type: "crew", amount: -1 });
        effects.push({ type: "paranoia", amount: -3 });
      } else effects.push({ type: "titan", amount: -1 }, { type: "paranoia", amount: -1 });
    }
    const result = resolvedConditional(base, effects, panic ? undefined : "remove");
    if (drown && paranoia + 1 >= 3) result.remainder = "基础猜忌结算后已达到 3：请处理 Fractures（裂痕）特殊事件，标记完成后再结算命运 5+ 的额外猜忌。";
    return result;
  }
  function blackSludgeDoom(card, context) {
    if (!isCard(card, context, "c2", "13636")) return null;
    const base = conditionalBase("black-sludge-doom", "黑色淤泥：命运 ≥7 或难民 ≥6 时，灾祸 +1", [4]);
    const state = conditionMet({ type: "or", conditions: [
      { type: "track", key: "fate", threshold: 7, mode: "atLeast", cycleId: "c2" },
      { type: "track", key: "refugees", threshold: 6, mode: "atLeast", cycleId: "c2" },
    ] }, context);
    if (state === null) return manualConditional(base, ["fate", "refugees"]);
    if (!state) return { ...base, effects: [], conditionState: false };
    if (recordedNumber(context.stats?.doom) === null) return manualConditional(base, ["doom"]);
    return resolvedConditional(base, [{ type: "doom", amount: 1 }]);
  }
  function manualConditional(base, keys) {
    const names = keys.map((key) => LABELS[key] || key).join("、");
    const hint = `请先补齐记录表中的${names}，或手动处理完整效果`;
    return { ...base, effects: [], resourceChanges: [], conditionState: null, summary: hint, remainder: hint };
  }
  function resolvedConditional(base, effects, removal, resourceChanges = [], extraSummary = "") {
    const summary = effects.map((effect) => `${LABELS[effect.type] || effect.type} ${effect.amount >= 0 ? "+" : ""}${effect.amount}`);
    if (extraSummary) summary.push(extraSummary);
    return { ...base, effects, resourceChanges, removal, automaticOperation: true, conditionState: true,
      summary: summary.join("，") || "无数值变化" };
  }
  function sabotageTrackEffect(card, context) {
    const engines = isCard(card, context, "c2", "13630");
    const triskelion = isCard(card, context, "c2", "13632");
    if (!engines && !triskelion) return null;
    const base = conditionalBase(engines ? "argo-engines" : "triskelion-system",
      engines ? "阿尔戈号引擎：按难民数量结算" : "三幅节系统：按难民数量结算", [0, 1]);
    const refugees = recordedNumber(context.stats?.refugees);
    const fate = recordedNumber(context.stats?.fate);
    if (refugees === null || fate === null) return manualConditional(base, ["refugees", "fate"]);
    const triggered = refugees >= (engines ? 2 : 1);
    if (engines && triggered && recordedNumber(context.stats?.hull) === null) return manualConditional(base, ["hull"]);
    const effects = [{ type: triggered ? engines ? "hull" : "titan" : "refugees", amount: triggered ? -1 : 1 }];
    const afterRefugees = refugees + (triggered ? 0 : 1);
    // The footer is checked after the upper effect; otherwise return to Sabotage.
    const removal = fate >= (engines ? 8 : 6) || afterRefugees >= (engines ? 4 : 3) ? "remove" : "keep";
    return resolvedConditional(base, effects, removal);
  }
  function sabotageManualFooter(card, context) {
    const propylon = isCard(card, context, "c2", "13631");
    const armory = isCard(card, context, "c2", "13633");
    if (!propylon && !armory) return null;
    // Keep the AA-disable and random Armory loss as their existing manual tasks.
    // The footer alone decides the destination, with its own receipt so a later
    // track change cannot rewrite this draw's resolved removal branch.
    const base = conditionalBase(propylon ? "propylon-removal" : "titan-armory-removal",
      propylon ? "山门：判断洗回破坏卡组或暂时移出" : "泰坦兵工厂：判断洗回破坏卡组或暂时移出", []);
    const state = conditionMet({ type: "or", conditions: [
      { type: "track", key: "fate", threshold: propylon ? 5 : 7, mode: "atLeast", cycleId: "c2" },
      { type: "track", key: "refugees", threshold: propylon ? 2 : 4, mode: "atLeast", cycleId: "c2" },
    ] }, context);
    if (state === null) return manualConditional(base, ["fate", "refugees"]);
    // A non-triggered upper ability only gains one Refugee: 0→1 on Propylon,
    // or at most 1→2 on Titan Armory. Neither can cross its footer threshold.
    return resolvedConditional(base, [], state ? "remove" : "keep", [],
      state ? "暂时移出直到下次定时战斗" : "洗回破坏卡组");
  }
  function ambrosiaSpill(card, context) {
    if (!isCard(card, context, "c2", "13635")) return null;
    const base = conditionalBase("ambrosia-spill", "神浆泄漏：按不稳定神浆库存分档结算", [0, 1, 2, 3, 4, 5, 6]);
    const storageKey = "c2-violentAmbrosia";
    const stock = recordedNumber(context.record?.resources?.[storageKey]);
    const fate = recordedNumber(context.stats?.fate);
    const refugees = recordedNumber(context.stats?.refugees);
    if (stock === null) return manualConditional(base, ["不稳定神浆库存"]);
    // Neither OR branch may be guessed from a missing track. A known true branch suffices.
    const doomGain = fate !== null && fate >= 8 || refugees !== null && refugees >= 6;
    if (!doomGain && (fate === null || refugees === null)) return manualConditional(base, ["fate", "refugees"]);
    const effects = [];
    const resourceChanges = [];
    if (stock >= 26) {
      if (recordedNumber(context.stats?.hull) === null) return manualConditional(base, ["hull"]);
      effects.push({ type: "hull", amount: -1 });
      resourceChanges.push({ resource: "violentAmbrosia", storageKey, amount: Math.ceil(stock / 2) - stock });
    } else if (stock >= 16) {
      if (recordedNumber(context.stats?.crew) === null) return manualConditional(base, ["crew"]);
      effects.push({ type: "crew", amount: -1 });
    }
    if (doomGain) {
      if (recordedNumber(context.stats?.doom) === null) return manualConditional(base, ["doom"]);
      effects.push({ type: "doom", amount: 1 });
    }
    return resolvedConditional(base, effects, "remove", resourceChanges,
      resourceChanges.length ? `不稳定神浆 ${stock}→${Math.ceil(stock / 2)}（减半向上取整）` : "");
  }
  function tighteningTheLoop(card, context) {
    if (!isCard(card, context, "c3", "13540")) return null;
    const base = conditionalBase("tightening-the-loop", "轮回收紧：按悖论结算并判断卡牌移出", [0, 1, 2]);
    const paradox = recordedNumber(context.stats?.paradox);
    if (paradox === null) return manualConditional(base, ["paradox"]);
    if (paradox < 3) return resolvedConditional(base, [{ type: "paradox", amount: 1 }], "remove");
    const loopLength = recordedNumber(context.stats?.loopLength);
    const fate = recordedNumber(context.stats?.fate);
    if (loopLength === null) return manualConditional(base, ["loopLength"]);
    const afterParadox = paradox - 2;
    if (afterParadox < 7 && fate === null) return manualConditional(base, ["fate"]);
    return resolvedConditional(base, [{ type: "paradox", amount: -2 }, { type: "loopLength", amount: -1 }],
      fate !== null && fate >= 7 || afterParadox >= 7 ? "remove" : "permanent");
  }
  function timeShift(card, context) {
    const forward = isCard(card, context, "c3", "13536");
    const rewound = isCard(card, context, "c3", "13538");
    if (!forward && !rewound) return null;
    const base = conditionalBase(forward ? "fast-forwarded" : "rewound",
      forward ? "快进：按悖论结算并判断移出类型" : "倒带：按悖论结算并判断移出类型", [0, 1, 2]);
    const paradox = recordedNumber(context.stats?.paradox);
    if (paradox === null) return manualConditional(base, ["paradox"]);
    if (paradox < 3) return resolvedConditional(base, [{ type: "paradox", amount: 1 }], "remove");
    const afterParadox = paradox - (forward ? 2 : 1);
    const fate = recordedNumber(context.stats?.fate);
    if (afterParadox < (forward ? 4 : 5) && fate === null) return manualConditional(base, ["fate"]);
    const result = resolvedConditional(base, [{ type: "paradox", amount: forward ? -2 : -1 },
      ...(forward ? [{ type: "doom", amount: 1 }] : [])],
      fate !== null && fate >= (forward ? 6 : 5) || afterParadox >= (forward ? 4 : 5) ? "remove" : "permanent");
    if (!forward) result.remainder = "返回上一个地图板块，并视该板块为已探索。";
    return result;
  }
  function stormWorsens(card, context) {
    const core = conditionalBase("storm-worsens", "风暴加剧：按债务处理沙暴或未触发分支", [0, 1, 2, 3, 4]);
    const footer = conditionalBase("storm-removal", "风暴加剧：结算后债务为 0 则永久移出，否则暂时移出", [5]);
    footer.requiresEffect = core.id;
    const saved = context.appliedEffects?.[core.id]?.descriptor;
    const debt = recordedNumber(context.stats?.babelianDebt);
    const main = debt === null ? manualConditional(core, ["babelianDebt"])
      : resolvedConditional(core, [{ type: "babelianDebt", amount: debt >= 3 ? -1 : 1 }]);
    if (debt !== null && debt >= 3) main.remainder = "随机确定可航行方向，在当前地图板块对应侧放置沙暴并封锁该方向；下次移动步骤让阿尔戈号向随机方向移动。";
    if (saved?.remainder || (!saved && main.remainder)) footer.requiresManual = core.id;
    // This footer is evaluated only after the core (including its manual map
    // actions), against the current record; an initial zero first gains Debt.
    const removal = debt === null ? manualConditional(footer, ["babelianDebt"])
      : resolvedConditional(footer, [], debt === 0 ? "permanent" : "remove");
    return [main, removal];
  }
  function imperialDues(card, context) {
    if (!isCard(card, context, "c4", "9330")) return null;
    const base = conditionalBase("imperial-dues", "Imperial Dues：按巴比伦债务结算", [0, 1, 2]);
    const debt = recordedNumber(context.stats?.babelianDebt);
    if (debt === null) return manualConditional(base, ["babelianDebt"]);
    const triggered = debt >= 3;
    if (triggered && recordedNumber(context.stats?.doom) === null) return manualConditional(base, ["doom"]);
    const effects = [{ type: "babelianDebt", amount: triggered ? -2 : 1 }];
    if (triggered) effects.push({ type: "doom", amount: 1 });
    const afterDebt = Math.max(0, debt + (triggered ? -2 : 1));
    // The printed footer removes the card temporarily in either branch.
    return resolvedConditional(base, effects, afterDebt === 0 ? "permanent" : "remove");
  }
  function mapBranchEffect(card, context) {
    const maze = isCard(card, context, "c1", "6437");
    const tomorrow = isCard(card, context, "c3", "13541");
    const lenders = isCard(card, context, "c4", "9334");
    if (!maze && !tomorrow && !lenders) return null;
    const base = conditionalBase(maze ? "maze-pilgrim" : tomorrow ? "tomorrows-edge-map" : "curselenders",
      maze ? "迷宫朝圣者：按地图派系获得陌生人并判断事件" : tomorrow ? "明日边缘：判断太阳后裔地图板块" : "Curselenders：按云贼地图板块结算债务并判断事件",
      maze ? [0, 1] : tomorrow ? [0, 1] : [0, 1, 2]);
    // Later printed bonuses cannot run before the map/base operation or its story event.
    base.blockedManualIndexes = maze ? [2] : lenders ? [3] : [];
    if (context.mapKnown !== true || !Array.isArray(context.mapFactions)) return manualConditional(base, ["当前地图派系"]);
    if (tomorrow) {
      const paradox = recordedNumber(context.stats?.paradox);
      if (paradox === null) return manualConditional(base, ["paradox"]);
      const effects = context.mapFactions.includes("sunheirs") ? [{ type: "paradox", amount: 1 }] : [];
      // Only the explicit map clause is handled here. The following "ability"
      // fallback and event may depend on one another and remain player-confirmed.
      const fate = recordedNumber(context.stats?.fate);
      const footerApplies = fate !== null && fate >= 7;
      const result = resolvedConditional(base, effects, footerApplies ? "remove" : undefined);
      if (footerApplies) result.manualIndexes = [0, 1, 3];
      else delete result.removal;
      if (paradox + (effects.length ? 1 : 0) >= 3) result.remainder = "地图效果后悖论已达到 3：请先处理 Tomorrow’s Edge（明日边缘）特殊事件，再确认未触发分支。";
      return result;
    }
    const type = maze ? "strangers" : "babelianDebt";
    const before = recordedNumber(context.stats?.[type]);
    if (before === null) return manualConditional(base, [type]);
    const amount = context.mapFactions.includes(maze ? "labyrinthians" : "cloudThieves") ? 2 : 1;
    const effects = [{ type, amount }];
    const eventTriggered = before + amount >= 3;
    if (lenders && !eventTriggered) effects.push({ type, amount: 1 });
    const result = resolvedConditional(base, effects, "remove");
    if (eventTriggered) result.remainder = maze
      ? "获得基础陌生人后已达到 3：请处理 Fated Conundrum（命运难题）0014，然后继续处理命运 5+ 的额外陌生人。"
      : "获得基础债务后已达到 3：请处理 Shortages（短缺）特殊事件，然后继续处理 At War 的额外债务。";
    return result;
  }
  function planStrangers(record, cycleId, card) {
    const descriptors = simpleConditionalEffects(card, contextForRecord(record, cycleId));
    return descriptors.length ? { status: "ready", ...descriptors[0] } : { status: "manual", effects: [], manualIndexes: [], dynamic: true, manualFallback: "请先记录本循环的陌生人、船员和阿尔戈号命运" };
  }

  return { contextForRecord, conditionFromBadge, conditionMet, simpleConditionalEffects, planStrangers };
});
