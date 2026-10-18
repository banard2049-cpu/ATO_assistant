(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ATO_EXPLORATION_OPTION_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MERCHANTS = { c1: "13400", c2: "13640", c3: "13537", c4: "9328", c5: "10309" };
  const RESOURCE_NAMES = {
    "trireme": "trireme", "monument": "monument", "armament": "armament", "raw ambrosia": "rawAmbrosia",
    "muscle cluster": "muscleCluster", "infused mechanism": "infusedMechanism", "calcified knuckle bone": "calcifiedKnuckle", "fleshy mantle": "fleshyMantle",
    "war trireme": "warTrireme", "relief": "relief", "war machine": "warMachine", "violent ambrosia": "violentAmbrosia",
    "cyclopean metal": "cyclopeanMetal", "chimeric tar": "chimericTar", "black chain": "blackChain", "supersolid relief mass": "supersolidRelief",
    "hyperborean alloy": "hyperboreanAlloy", "sirenshell": "sirenshell", "daedalus makina": "daedalusMakina", "frozen ambrosia": "frozenAmbrosia",
    "clothflesh": "clothflesh", "razorclaw": "razorclaw", "eyecluster": "eyesCluster", "eyes cluster": "eyesCluster", "icarian feather": "icarianFeather",
    "cursed derelict": "cursedDerelict", "imperial scroll": "imperialScroll", "babylonian contraption": "babylonianContraption", "mutable ambrosia": "mutableAmbrosia",
    "cursed bloatsack": "cursedBloatsack", "wish embryo": "wishEmbryo", "living gold": "livingGold", "old irem fragment": "oldIremFragment",
    "atlantean tekne": "atlanteanTekne", "orichalcum chunk": "orichalcumChunk", "liquid aether": "liquidAether", "oxidized ambrosia": "oxidizedAmbrosia",
    "hydradynamic scales": "hydradynamicScales", "photophobic flesh": "photophobicFlesh", "amygdalan extract": "amygdalanExtract", "microwave cell": "microwaveCell",
  };
  let serial = 0;
  const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const datasetOf = (dataset) => dataset || root.ATO_EXPLORATION_CARD_RESOURCES;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  function safeKey(key) {
    if (!key || ["__proto__", "prototype", "constructor"].includes(String(key))) throw new Error("结算标识无效");
    return String(key);
  }
  function integer(value, label) {
    const number = Number(value == null || value === "" ? 0 : value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label}不是有效的非负整数`);
    return number;
  }
  function receiptId() {
    return root.crypto?.randomUUID ? root.crypto.randomUUID() : `option:${Date.now()}:${++serial}:${Math.random().toString(36).slice(2)}`;
  }
  function alternatives(text) {
    let inheritedAmount;
    const result = [];
    for (const piece of text.trim().split(/\s+or\s+/i)) {
      const match = piece.trim().match(/^(?:(\d+)\s+)?(.+?)\.?$/);
      if (!match) return null;
      if (match[1]) inheritedAmount = Number(match[1]);
      const name = match[2].trim();
      const resource = RESOURCE_NAMES[name.toLowerCase().replace(/\s+/g, " ")];
      if (!resource || !Number.isSafeInteger(inheritedAmount) || inheritedAmount < 1) return null;
      result.push({ resource, amount: inheritedAmount, name });
    }
    return result;
  }

  function merchant(card) {
    if (!card || MERCHANTS[card.cycleId] !== String(card.cardId || card.id)) return null;
    const trades = [];
    const manualIndexes = [];
    (card.manual || []).forEach((item, index) => {
      if (item.badge) return;
      const parts = String(item.text || "").split(/\s*[»→]\s*/);
      if (parts.length !== 2) return;
      const costs = alternatives(parts[0]);
      const gains = alternatives(parts[1]);
      if (!costs || !gains) return;
      costs.forEach((cost, costIndex) => gains.forEach((gain, gainIndex) => {
        trades.push({
          id: `trade:${index}:${costIndex}:${gainIndex}`,
          label: `${cost.amount} ${cost.name} → ${gain.amount} ${gain.name}`,
          costs: [{ resource: cost.resource, amount: cost.amount }],
          gains: [{ resource: gain.resource, amount: gain.amount }],
        });
      }));
      manualIndexes.push(index);
    });
    if (!trades.length) return null;
    (card.manual || []).forEach((item, index) => {
      if (!item.badge && /^Trading:\s*You may exchange \(up to 5 times\):\s*$/i.test(item.text || "")) manualIndexes.push(index);
    });
    const offered = [...new Set(trades.flatMap(trade => [...trade.costs, ...trade.gains].map(item => item.resource)))];
    const rewards = (card.manual || []).flatMap((item, index) => {
      const match = String(item.text || "").match(/^选择并获得(\d+)个商人提供的凡间或始祖资源[。.]?$/)
        || String(item.text || "").match(/^Gain (\d+) Mortal or Primordial resource chosen from the ones offered by the Trader[.]?$/i);
      return match ? [{ id: `manual:${index}`, manualIndex: index, text: item.text, badge: item.badge || "", condition: item.condition || null,
        amount: Number(match[1]), choices: offered }] : [];
    });
    return { cardId: String(card.cardId || card.id), cycleId: card.cycleId, trades, rewards, limit: 5, manualIndexes: manualIndexes.sort((a, b) => a - b) };
  }

  // 商人兑换的次数上限按“类”计算：同一种兑换填任意倍率，仍只占 1 类额度。
  function tradeIdOf(receipt, menu) {
    if (!receipt) return null;
    if (typeof receipt.tradeId === "string" && (!menu || menu.trades.some((trade) => trade.id === receipt.tradeId))) return receipt.tradeId;
    if (!menu) return null;
    // Receipts created before category accounting only saved the printed label.
    const match = String(receipt.summary || "").match(/^(.*?) ×\d+/);
    return match ? menu.trades.find((trade) => trade.label === match[1].trim())?.id || null : null;
  }
  function usedTrades(previous, menu, history) {
    const used = {};
    if (previous && previous.used !== undefined) {
      if (!object(previous.used)) throw new Error("商人兑换类别记录无效");
      for (const [id, value] of Object.entries(previous.used)) {
        const count = integer(value, "兑换类别");
        if (count > 0) used[id] = count;
      }
      return used;
    }
    if (!menu) return used;
    // Rounds saved before this rule only stored a total quantity; the entry's
    // receipts still name each printed exchange, so rebuild the categories.
    for (const receipt of Array.isArray(history) ? history : []) {
      const id = tradeIdOf(receipt, menu);
      if (id) used[id] = (used[id] || 0) + 1;
    }
    return used;
  }
  function tradeUsage(record, cycleId, merchantId, roundId, history, dataset) {
    try {
      const cardId = String(merchantId).replace(`${cycleId}:`, "");
      const menu = merchant(datasetOf(dataset)?.cards?.[`${cycleId}:${cardId}`]);
      if (!menu) return null;
      const rounds = object(record?.explorationTradeRounds) ? record.explorationTradeRounds : {};
      const previous = rounds[safeKey(roundId)];
      if (previous && (!object(previous) || previous.cycleId !== cycleId || previous.merchantId !== cardId)) return null;
      const used = usedTrades(previous, menu, history);
      return { limit: menu.limit, count: Object.keys(used).length, used: Object.keys(used), menu };
    } catch {
      return null;
    }
  }

  function resourceEntry(dataset, cycleId, resource) {
    const entry = datasetOf(dataset)?.cycles?.[cycleId]?.resources?.[resource];
    if (!entry || entry.named) throw new Error(`找不到可计数的资源：${resource}`);
    return { storageKey: safeKey(entry.storageKey || resource), label: entry.zh || entry.en || resource };
  }
  function resourceChanges(record, cycleId, costs, gains, times, dataset) {
    const amounts = new Map();
    for (const [entries, sign] of [[costs, -1], [gains, 1]]) {
      for (const entry of entries) {
        const info = resourceEntry(dataset, cycleId, entry.resource);
        const amount = integer(entry.amount, info.label) * times;
        if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("兑换数量无效");
        // Check the full cost before considering gains; a trade cannot fund itself.
        if (sign < 0 && integer(record.resources?.[info.storageKey], info.label) < amount) throw new Error(`${info.label}不足，需要 ${amount}`);
        const existing = amounts.get(info.storageKey) || { type: "add", resource: entry.resource, ...info, amount: 0 };
        existing.amount += sign * amount;
        amounts.set(info.storageKey, existing);
      }
    }
    return [...amounts.values()].map((change) => {
      const before = integer(record.resources?.[change.storageKey], change.label);
      const after = before + change.amount;
      if (!Number.isSafeInteger(after) || after < 0) throw new Error(`${change.label}数量无效`);
      return { ...change, before, after, hadValue: own(record.resources, change.storageKey), beforeValue: record.resources?.[change.storageKey] ?? null };
    });
  }
  function applyResourceChanges(record, changes, reverse = false) {
    record.resources = object(record.resources) ? { ...record.resources } : {};
    for (const change of changes.filter((item) => item.type === "add")) {
      const current = integer(record.resources[change.storageKey], change.label);
      const next = current + (reverse ? -change.amount : change.amount);
      if (!Number.isSafeInteger(next) || next < 0) throw new Error(`${change.label}不足，无法${reverse ? "撤销" : "结算"}`);
      if (reverse && current === change.after) {
        if (change.hadValue) record.resources[change.storageKey] = change.beforeValue;
        else delete record.resources[change.storageKey];
      } else record.resources[change.storageKey] = next;
    }
  }
  function describe(changes) {
    return changes.map((change) => `${change.label} ${change.amount >= 0 ? "+" : ""}${change.amount}`).join("，");
  }

  function resourceStock(record, cycleId, resource, dataset) {
    const info = resourceEntry(dataset, cycleId, resource);
    try { return integer(record.resources?.[info.storageKey], info.label); }
    catch { return null; }
  }
  function tradeLabel(trade, cycleId, record, dataset) {
    const format = entries => entries.map(item => `${item.amount} ${resourceEntry(dataset, cycleId, item.resource).label}（库存 ${resourceStock(record, cycleId, item.resource, dataset) ?? "?"}）`).join(" + ");
    return `${format(trade.costs)} → ${format(trade.gains)}`;
  }
  function claimMerchantReward(record, cycleId, merchantId, rewardId, resource, dataset) {
    const cardId = String(merchantId).replace(`${cycleId}:`, "");
    const reward = merchant(datasetOf(dataset)?.cards?.[`${cycleId}:${cardId}`])?.rewards.find(item => item.id === rewardId);
    if (!reward || !reward.choices.includes(resource)) throw new Error("请选择该商人提供的奖励资源");
    const changes = resourceChanges(record, cycleId, [], [{ resource, amount: reward.amount }], 1, dataset);
    const next = clone(record);
    applyResourceChanges(next, changes);
    const summary = describe(changes);
    return { record: next, changes, summary, receipt: { kind: "merchant-reward", id: receiptId(), cycleId, merchantId: cardId,
      rewardId, resource, changes: clone(changes), summary } };
  }
  function undoMerchantReward(record, receipt) {
    if (receipt?.kind !== "merchant-reward") throw new Error("商人奖励记录无效");
    const next = clone(record);
    applyResourceChanges(next, receipt.changes, true);
    return next;
  }

  function executeTrade(record, cycleId, merchantId, trade, times, roundId, dataset, history = []) {
    if (!object(record)) throw new Error("记录表数据无效");
    const cardId = String(merchantId).replace(`${cycleId}:`, "");
    const menu = merchant(datasetOf(dataset)?.cards?.[`${cycleId}:${cardId}`]);
    const selected = menu?.trades.find((entry) => entry.id === trade?.id);
    if (!selected || JSON.stringify(selected.costs) !== JSON.stringify(trade.costs) || JSON.stringify(selected.gains) !== JSON.stringify(trade.gains)) throw new Error("该商人的兑换项目无效");
    const count = integer(times, "兑换次数");
    if (!count) throw new Error("兑换次数至少为 1");
    const roundKey = safeKey(roundId);
    const rounds = object(record.explorationTradeRounds) ? record.explorationTradeRounds : {};
    const previous = rounds[roundKey];
    if (previous && (!object(previous) || previous.cycleId !== cycleId || previous.merchantId !== cardId)) throw new Error("兑换轮次不属于当前商人");
    const used = usedTrades(previous, menu, history);
    const existing = Boolean(used[selected.id]);
    if (!existing && Object.keys(used).length >= menu.limit) throw new Error(`本次商人最多兑换 ${menu.limit} 类`);
    const changes = resourceChanges(record, cycleId, selected.costs, selected.gains, count, dataset);
    const next = clone(record);
    applyResourceChanges(next, changes);
    const id = receiptId();
    const nextUsed = { ...used, [selected.id]: (used[selected.id] || 0) + 1 };
    const categories = Object.keys(nextUsed).length;
    next.explorationTradeRounds = { ...(object(next.explorationTradeRounds) ? next.explorationTradeRounds : {}),
      [roundKey]: { cycleId, merchantId: cardId, count: categories, used: nextUsed, receiptIds: [...(previous?.receiptIds || []), id] } };
    const summary = `${selected.label} ×${count}（已用 ${categories}/${menu.limit} 类${existing ? "，同类加量" : ""}）`;
    return { record: next, changes, summary, receipt: { kind: "trade", id, cycleId, merchantId: cardId, roundId: roundKey, tradeId: selected.id,
      times: count, changes: clone(changes), summary } };
  }
  function undoTrade(record, receipt, history = [], dataset) {
    const round = record.explorationTradeRounds?.[receipt?.roundId];
    if (receipt?.kind !== "trade" || !round?.receiptIds?.includes(receipt.id) || round.cycleId !== receipt.cycleId || round.merchantId !== receipt.merchantId) throw new Error("这笔兑换已撤销或轮次发生变化");
    const menu = merchant(datasetOf(dataset)?.cards?.[`${receipt.cycleId}:${receipt.merchantId}`]);
    const tradeId = tradeIdOf(receipt, menu);
    if (!tradeId) throw new Error("找不到这笔兑换的类别，无法撤销");
    const used = usedTrades(round, menu, history);
    if (used[tradeId] > 1) used[tradeId] -= 1;
    else delete used[tradeId];
    const count = Object.keys(used).length;
    const next = clone(record);
    applyResourceChanges(next, receipt.changes, true);
    const receiptIds = round.receiptIds.filter((id) => id !== receipt.id);
    next.explorationTradeRounds[receipt.roundId] = { ...round, count, used, receiptIds };
    if (!count && !receiptIds.length) delete next.explorationTradeRounds[receipt.roundId];
    return next;
  }

  function duesStat(record, key, label) {
    const scoped = record.cycleStats?.c4?.[key];
    const value = scoped !== undefined ? scoped : !record.cycle || record.cycle === "c4" ? record[key] : undefined;
    if (value == null || !["string", "number"].includes(typeof value)
      || typeof value === "string" && !value.trim()) {
      throw new Error(`${label}未填写有效的非负整数，请先补齐记录表`);
    }
    return integer(value, label);
  }
  /** DB2156: choose an affordable payment, or apply the printed failure effect. */
  function duesPlan(record, cycleId, dataset) {
    const base = { cycleId, cardId: "9329", manualIndexes: [0, 1, 2, 3, 4], choices: [], requirements: [], effects: [], removePermanent: false, summary: "" };
    if (cycleId !== "c4") return { ...base, status: "manual", manualFallback: "Diminishing Returns 只适用于循环 IV" };
    try {
      if (!object(record)) throw new Error("记录表数据无效");
      const debt = duesStat(record, "babelianDebt", "巴比伦债务");
      const fate = duesStat(record, "fate", "阿尔戈号命运");
      const penalty = debt >= 3;
      const resources = ["cursedDerelict", "imperialScroll", "babylonianContraption"];
      const costs = penalty ? [5, 3, 2] : [3, 2, 1];
      const requirements = resources.map((resource, index) => {
        const info = resourceEntry(dataset, cycleId, resource);
        const stock = integer(record.resources?.[info.storageKey], info.label);
        return { resource, amount: costs[index], storageKey: info.storageKey, stock,
          label: `${costs[index]} ${info.label}（库存 ${stock}）` };
      });
      const choices = requirements.filter(item => item.stock >= item.amount);
      const fallback = !choices.length;
      const effects = [];
      if (fallback) effects.push({ type: "doom", amount: 1 });
      if (fate >= 7) effects.push({ type: "hull", amount: -1 });
      const removePermanent = debt === 0;
      const suffix = [fate >= 7 ? "船体 -1" : "", removePermanent ? "永久移出此卡" : ""].filter(Boolean);
      const summary = [fallback ? "三种资源均不足，灾祸指示物 +1" : "请选择代缴资源", ...suffix].join("；");
      const signature = JSON.stringify({ debt, fate, requirements: requirements.map(item => [item.resource, item.amount, item.storageKey, item.stock]) });
      return { ...base, status: fallback ? "ready" : "choice", debt, fate, penalty, requirements, choices, fallback, effects, removePermanent,
        signature, summary, manualFallback: "" };
    } catch (error) {
      return { ...base, status: "manual", manualFallback: error.message };
    }
  }
  /** Resource and numeric parts are returned separately for one record transaction. */
  function applyDues(record, plan, chosenResource, dataset) {
    if (!plan || !["ready", "choice"].includes(plan.status) || plan.cycleId !== "c4" || plan.cardId !== "9329") {
      throw new Error(plan?.manualFallback || "代缴资源结算记录无效");
    }
    const current = duesPlan(record, "c4", dataset);
    if (current.status === "manual") throw new Error(current.manualFallback);
    if (current.signature !== plan.signature) throw new Error("代缴资源库存、债务或命运已变化，请重新选择并结算");
    const selected = current.choices.find(item => item.resource === chosenResource);
    if (current.status === "choice" && !selected) throw new Error("请选择库存足够的代缴资源");
    if (current.fallback && chosenResource) throw new Error("三种资源均不足，无法支付该资源");
    const changes = selected ? resourceChanges(record, "c4", [{ resource: selected.resource, amount: selected.amount }], [], 1, dataset) : [];
    const next = clone(record);
    applyResourceChanges(next, changes);
    const summary = [selected ? describe(changes) : "三种资源均不足，灾祸指示物 +1",
      current.fate >= 7 ? "船体 -1" : "", current.removePermanent ? "永久移出此卡" : ""].filter(Boolean).join("；");
    const receipt = { kind: "dues", id: receiptId(), cycleId: "c4", cardId: "9329", resource: selected?.resource || null,
      fallback: current.fallback, changes: clone(changes), effects: clone(current.effects), removePermanent: current.removePermanent, summary };
    return { record: next, changes, effects: clone(current.effects), removePermanent: current.removePermanent, summary, receipt };
  }
  function undoDues(record, receipt) {
    if (receipt?.kind !== "dues" || receipt.cycleId !== "c4" || receipt.cardId !== "9329" || !Array.isArray(receipt.changes)) throw new Error("代缴资源结算记录无效");
    const next = clone(record);
    applyResourceChanges(next, receipt.changes, true);
    return next;
  }

  function wishState(record) {
    const state = record.explorationPersistentEffects?.c4?.stringWish;
    if (state == null) return null;
    if (!object(state) || !["cursedDerelict", "imperialScroll"].includes(state.resource) || integer(state.remaining, "String Wish 标记") > 5) throw new Error("String Wish 标记数据无效，请先核对记录");
    return clone(state);
  }
  function sameWish(a, b) {
    if (a == null || b == null) return a == null && b == null;
    return a.resource === b.resource && Number(a.remaining) === Number(b.remaining) && a.lastReceiptId === b.lastReceiptId;
  }
  function currentDebt(record) {
    return record.cycleStats?.c4?.babelianDebt ?? (record.cycle === "c4" ? record.babelianDebt : undefined);
  }
  function wishPlan(record, cycleId, chosenResource, penalty = false, dataset, options = {}) {
    if (cycleId !== "c4") return { status: "manual", changes: [], manualFallback: "String Wish 只适用于循环 IV", summary: "" };
    let beforeState;
    try { beforeState = wishState(record); }
    catch (error) { return { status: "manual", changes: [], manualFallback: error.message, summary: "" }; }
    const repaying = Number(beforeState?.remaining || 0) > 0;
    const resource = repaying ? beforeState.resource : chosenResource;
    if (!["cursedDerelict", "imperialScroll"].includes(resource)) {
      return { status: "choice", mode: "gain", changes: [], choices: [{ resource: "cursedDerelict", amount: 10 }, { resource: "imperialScroll", amount: 5 }], manualFallback: "请选择首次获得的资源", summary: "" };
    }
    const remainingBefore = Number(beforeState?.remaining || 0);
    const remainingAfter = repaying ? remainingBefore - 1 : 5;
    const mode = repaying ? "repay" : "gain";
    let changes;
    let debtFallback = false;
    let balanceBefore;
    let resourceStorageKey;
    try {
      const amount = repaying ? (resource === "cursedDerelict" ? (penalty ? 5 : 3) : (penalty ? 3 : 2)) : (resource === "cursedDerelict" ? 10 : 5);
      const info = resourceEntry(dataset, cycleId, resource);
      const balance = integer(record.resources?.[info.storageKey], info.label);
      balanceBefore = balance;
      resourceStorageKey = info.storageKey;
      if (!repaying && options.blockGains) {
        changes = [];
      } else if (repaying && balance < amount) {
        // DB2152 prints the same money-bag icon as assets/icons/babelian-debt.svg;
        // the record sheet's corresponding Cycle IV stat is babelianDebt.
        const beforeValue = currentDebt(record);
        const before = integer(beforeValue, "巴比伦债务");
        if (!Number.isSafeInteger(before + 1)) throw new Error("巴比伦债务数量无效");
        changes = [{ type: "stat", cycleId: "c4", key: "babelianDebt", label: "巴比伦债务", amount: 1, before, after: before + 1, beforeValue: beforeValue ?? null, hadValue: own(record.cycleStats?.c4, "babelianDebt"), hadAlias: own(record, "babelianDebt"), beforeAlias: record.babelianDebt ?? null }];
        debtFallback = true;
      } else changes = resourceChanges(record, cycleId, repaying ? [{ resource, amount }] : [], repaying ? [] : [{ resource, amount }], 1, dataset);
    } catch (error) {
      return { status: "manual", mode, resource, remainingBefore, remainingAfter, changes: [], manualFallback: error.message, summary: "" };
    }
    const afterState = { resource, remaining: remainingAfter, lastReceiptId: receiptId() };
    const summary = `${!repaying && options.blockGains ? "本次卡堆禁止资源收益" : `${debtFallback ? "资源不足，" : ""}${describe(changes)}`}；String Wish 标记 ${remainingBefore} → ${remainingAfter}`;
    return { status: "ready", mode, cycleId, resource, resourceStorageKey, balanceBefore, penalty: Boolean(penalty), blockGains: Boolean(options.blockGains), debtFallback, remainingBefore, remainingAfter, beforeState, afterState, changes, summary, manualFallback: "" };
  }
  function setWish(record, state) {
    record.explorationPersistentEffects = object(record.explorationPersistentEffects) ? record.explorationPersistentEffects : {};
    record.explorationPersistentEffects.c4 = object(record.explorationPersistentEffects.c4) ? record.explorationPersistentEffects.c4 : {};
    if (state == null) delete record.explorationPersistentEffects.c4.stringWish;
    else record.explorationPersistentEffects.c4.stringWish = clone(state);
  }
  function applyWish(record, plan) {
    if (plan?.status !== "ready" || plan.cycleId !== "c4") throw new Error(plan?.manualFallback || "请先选择 String Wish 资源");
    if (!sameWish(wishState(record), plan.beforeState)) throw new Error("String Wish 标记已变化，请重新结算");
    if (!(plan.mode === "gain" && plan.blockGains) && integer(record.resources?.[plan.resourceStorageKey], "String Wish 资源") !== plan.balanceBefore) throw new Error("String Wish 资源已变化，请重新结算");
    for (const change of plan.changes) {
      const current = change.type === "add" ? record.resources?.[change.storageKey] : currentDebt(record);
      if (integer(current, change.label) !== change.before) throw new Error(`${change.label}已变化，请重新结算`);
    }
    const next = clone(record);
    applyResourceChanges(next, plan.changes);
    for (const change of plan.changes.filter((item) => item.type === "stat")) {
      next.cycleStats = object(next.cycleStats) ? next.cycleStats : {};
      next.cycleStats.c4 = object(next.cycleStats.c4) ? next.cycleStats.c4 : {};
      next.cycleStats.c4.babelianDebt = String(change.after);
      if (next.cycle === "c4") next.babelianDebt = String(change.after);
    }
    setWish(next, plan.afterState);
    const receipt = { kind: "wish", cycleId: "c4", id: plan.afterState.lastReceiptId, beforeState: clone(plan.beforeState), afterState: clone(plan.afterState), changes: clone(plan.changes), summary: plan.summary };
    return { record: next, changes: clone(plan.changes), summary: plan.summary, receipt };
  }
  function undoWish(record, receipt) {
    if (receipt?.kind !== "wish" || !sameWish(wishState(record), receipt.afterState)) throw new Error("String Wish 已有后续结算，请先撤销后续操作");
    const next = clone(record);
    applyResourceChanges(next, receipt.changes, true);
    for (const change of receipt.changes.filter((item) => item.type === "stat")) {
      const current = integer(currentDebt(next), change.label);
      if (current < change.amount) throw new Error("巴比伦债务已变化，无法撤销");
      next.cycleStats = object(next.cycleStats) ? next.cycleStats : {};
      next.cycleStats.c4 = object(next.cycleStats.c4) ? next.cycleStats.c4 : {};
      const after = current - change.amount;
      if (current === change.after && !change.hadValue) delete next.cycleStats.c4.babelianDebt;
      else next.cycleStats.c4.babelianDebt = current === change.after ? change.beforeValue : String(after);
      if (next.cycle === "c4") {
        if (current === change.after && !change.hadAlias) delete next.babelianDebt;
        else next.babelianDebt = current === change.after ? change.beforeAlias : String(after);
      }
    }
    setWish(next, receipt.beforeState);
    return next;
  }

  return { merchant, resourceStock, tradeLabel, tradeUsage, claimMerchantReward, undoMerchantReward, executeTrade, undoTrade, duesPlan, applyDues, undoDues, wishPlan, applyWish, undoWish };
});
