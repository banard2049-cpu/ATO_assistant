(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ATO_STRUCTURE_TECH_RULES = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  // Only executable metadata is transcribed here. The dictionary owns names,
  // unlocks, cycle scope and card images; the printed cards remain the rules reference.
  // 阿尔戈号命运轨道上限 9；悖论另有自己的上限 12。
  const FATE_MAX = 9;
  const CYCLES = ["c1", "c2", "c3", "c4", "c5"];
  const TITANS = {
    tt_earthshaker: "撼地者", tt_mazerunner: "迷宫行者", tt_plogicbreaker: "逻辑破坏者",
    tt_warkeeper: "历战者", tt_firestarter: "纵火者", tt_pabysswatcher: "深渊凝望者",
    tt_returner: "归来者", tt_ascender: "升腾者", tt_pdawnburner: "黎明燃烧者",
    tt_cloudsoarer: "翔云者", tt_wishender: "终愿者", tt_plunarlander: "登月者", tt_shadowdancer: "影舞者",
  };
  const HERO_NAMES = {
    odys: "奥德修斯·零", circe: "喀耳刻卫", phenelope: "珀涅罗珀", telebac: "忒勒巴科斯",
    herakleides: "赫拉克莱德斯", olympia: "奥林匹亚", leocules: "莱奥库勒斯", raz: "拉兹",
    fisher: "费舍尔", hypatia: "希帕提亚", anakreon: "阿纳克里翁", anathea: "安纳忒亚",
    orphan: "DMT的孤儿", aster: "阿斯特", dastan: "达斯坦", aktisaeos: "阿克提赛俄斯",
    oleander: "欧利安德", omorfos: "欧莫弗斯",
  };
  // These are the printed structural-technology menus, using the same record
  // storage keys as exploration-card trades. Each alternative is its own route.
  const tradeResources = {
    c1: [["trireme", "船材"], ["monument", "石筑"], ["armament", "军备"], ["rawAmbrosia", "神浆原液"], ["muscleCluster", "肌肉簇"], ["infusedMechanism", "浸液机件"], ["calcifiedKnuckle", "钙化指节骨"], ["fleshyMantle", "血肉块"]],
    c2: [["warTrireme", "舰材"], ["relief", "岩雕"], ["warMachine", "战械"], ["violentAmbrosia", "不稳定神浆"], ["cyclopeanMetal", "独眼巨人甲胄"], ["chimericTar", "奇美拉焦油"], ["blackChain", "黑色锁链"], ["supersolidRelief", "超固体块"]],
    c3: [["hyperboreanAlloy", "冻土合金"], ["sirenshell", "塞壬壳"], ["daedalusMakina", "代达罗斯器械"], ["frozenAmbrosia", "凝固神浆"], ["clothflesh", "肉布"], ["razorclaw", "利爪"], ["eyesCluster", "眼球簇"], ["icarianFeather", "伊卡洛斯之羽"]],
    c4: [["cursedDerelict", "诅咒船骇"], ["imperialScroll", "帝国卷轴"], ["babylonianContraption", "巴比伦装置"], ["mutableAmbrosia", "易变神浆"], ["cursedBloatsack", "诅咒胀囊"], ["wishEmbryo", "愿望胚胎"], ["livingGold", "活化黄金"], ["oldIremFragment", "旧伊雷姆碎片"]],
    c5: [["atlanteanTekne", "亚特兰提斯仪器"], ["orichalcumChunk", "山铜块"], ["liquidAether", "液态以太"], ["oxidizedAmbrosia", "氧化神浆"], ["hydradynamicScales", "流线鳞片"], ["photophobicFlesh", "畏光怪肉"], ["amygdalanExtract", "杏仁体提取物"], ["microwaveCell", "微波细胞"]],
  };
  function tradeRoutes(cycle) {
    const resource = tradeResources[cycle].map(([id, label]) => ({ resource: id, storageKey: `${cycle}-${id}`, label }));
    const routes = [];
    const add = (from, cost, to, gain) => routes.push({ id: `${resource[from].resource}-to-${resource[to].resource}`,
      label: `${cost} ${resource[from].label} → ${gain} ${resource[to].label}`,
      costs: [{ ...resource[from], amount: cost }], gains: [{ ...resource[to], amount: gain }] });
    add(0, 3, 1, 1); add(0, 4, 2, 1);
    add(1, 1, 0, 1); add(2, 1, 0, 2);
    for (const index of [4, 5]) add(index, 1, 3, cycle === "c1" ? 1 : 2);
    for (const index of [6, 7]) add(index, 1, 3, cycle === "c1" ? 2 : 3);
    for (const index of [4, 5]) add(3, cycle === "c1" ? 3 : 4, index, 1);
    for (const index of [6, 7]) add(3, cycle === "c1" ? 4 : 5, index, 1);
    return routes;
  }
  const trade = (key, cycle) => ({ key, actions: [{ id: "trade", label: "贸易与 7 天冷却", kind: "cooldown", days: 7,
    fate: 1, trade: true, resourceCycle: cycle, tradeRoutes: tradeRoutes(cycle), maxTrades: 3 }] });
  function developmentTrade(key, cycle, base, alternatives, label) {
    const routes = [];
    for (const alternative of alternatives) for (const [from, to] of [[base, alternative], [alternative, base]]) {
      routes.push({ id: `${from[0]}-to-${to[0]}`, label: `1 ${from[1]} → 1 ${to[1]}`,
        costs: [{ resource: from[0].replace(/^c[1-5]-/, ""), storageKey: from[0], label: from[1], amount: 1 }],
        gains: [{ resource: to[0].replace(/^c[1-5]-/, ""), storageKey: to[0], label: to[1], amount: 1 }] });
    }
    return { key, actions: [{ id: "trade", label, kind: "cooldown", days: 0, fate: 0, trade: true,
      resourceCycle: cycle, tradeRoutes: routes, maxTrades: null, requiresDevelopment: true, skipTimeline: true }] };
  }
  // `effectLabel` is a permanent half-sentence shown right behind the price in
  // the picker, so the printed effect stays readable before a target is chosen.
  // `titan: true` marks a printed reward whose result is already chosen when the
  // event is scheduled, so the due titan can enter the record without a prompt.
  const breed = (key, models) => ({ key, actions: [
    { id: "breed", label: "普通培育", kind: "reward", days: 10, models, sacrifice: true, titan: true },
    { id: "breed-accelerated", label: "加速培育", kind: "reward", days: 5, cooldownDays: 12, fate: 1, models, sacrifice: true, titan: true },
  ] });
  const catalog = [
    developmentTrade("temenos project", "c2", ["c2-warTrireme", "舰材"], [["mazeFragment", "迷宫碎片"], ["fearEssence", "恐惧精华"]], "迷宫矿井资源交换"),
    developmentTrade("abyss expedition", "c3", ["c3-hyperboreanAlloy", "冻土合金"], [["livingAbyss", "活体深渊"], ["skinOfMalice", "怨恨之皮"]], "深渊灯塔资源交换"),
    developmentTrade("mortal mapmakers", "c4", ["c4-cursedDerelict", "诅咒船骇"], [["c4-blackenedHalo", "黑化光环"], ["c4-burnedOutGrace", "燃尽恩典"]], "愚行之塔资源交换"),
    developmentTrade("the last wish", "c5", ["c5-atlanteanTekne", "亚特兰提斯仪器"], [["promisedFuturesCarcass", "未来承诺残躯"], ["blackTaintedStepfinger", "染黑阶梯指"]], "涅瑞伊得贝壳资源交换"),
    trade("superior trading solutions", "c1"),
    { key: "mnestis thesis", actions: [{ id: "reflect", label: "", kind: "reward", days: 7, fate: 1, target: "hero", effectLabel: "使其获得一个回忆节点", rewardLabel: "所选英雄任选一张回忆卡获得 +1 回忆节点" }] },
    trade("argo's destiny", "c3"),
    { key: "grand stoa", actions: [{ id: "dreamwalker", label: "培育梦行者", kind: "reward", days: 9, grant: { type: "titan", titanId: "dreamwalker", name: "梦行者", count: 1 }, rewardLabel: "获得 1 架梦行者泰坦" }] },
    { key: "titan training", actions: [{ id: "train", label: "泰坦训练", kind: "reward", days: 7, fate: 1, target: "titan", rewardLabel: "所选泰坦从练兵场获得一张带 Training 或 Conditioning 特性的式样卡" }] },
    { key: "trauma growth", actions: [{ id: "rehabilitate", label: "修复残废泰坦", kind: "reward", days: 7, target: "crippled-titan", repair: true, rewardLabel: "所选泰坦不再残废" }] },
    { key: "canal reconnaissance", actions: [{ id: "rebuild", label: "重建赫米奥拉侦察船", kind: "reward", days: 4, fate: 1, rebuild: true, rewardLabel: "完成重建后恢复 1 艘地图侦察船，在船上待命" }] },
    breed("titan breeding", ["tt_earthshaker", "tt_mazerunner", "tt_plogicbreaker"]),
    trade("argo's mission", "c2"),
    breed("advanced titan breeding", ["tt_warkeeper", "tt_firestarter", "tt_pabysswatcher"]),
    { key: "titan genetic memory", actions: [{ id: "genesium", label: "泰坦遗传记忆：移植", kind: "reward", days: 7, fate: 1, target: "titan", rewardLabel: "所选泰坦从练兵场获得一张带 Strain 特性的式样卡" }] },
    trade("argo’s curse", "c4"),
    breed("superior titan breeding", ["tt_returner", "tt_ascender", "tt_pdawnburner"]),
    { key: "the work is never done", actions: [{ id: "final-tear", label: "最后之泪", kind: "reward", days: 30, tear: true, rewardLabel: "可代替 1 个西西弗斯之泪使用；结算时取回本卡" }] },
    trade("voyage home", "c5"),
    breed("ultimate titan breeding", ["tt_cloudsoarer", "tt_wishender", "tt_plunarlander", "tt_shadowdancer"]),
    { key: "mnestis training", actions: [{ id: "simulation", label: "记忆模拟战斗", kind: "battle", days: 1, cooldownDays: 12, fate: 1, rewardLabel: "进行 Mnestis Simulation Battle（循环 V 故事书第 11 页）" }] },
  ];
  const actionFamilies = {
    "titan breeding": { groupKey: "titan-breeding", groupTitle: "泰坦培育", sourceLabel: "泰坦生产（克里特型号）", tier: 1 },
    "advanced titan breeding": { groupKey: "titan-breeding", groupTitle: "泰坦培育", sourceLabel: "高级泰坦培育（斯巴达型号）", tier: 2 },
    "superior titan breeding": { groupKey: "titan-breeding", groupTitle: "泰坦培育", sourceLabel: "高级泰坦培育（德尔菲型号）", tier: 3 },
    "ultimate titan breeding": { groupKey: "titan-breeding", groupTitle: "泰坦培育", sourceLabel: "终极泰坦培育（波斯型号）", tier: 4 },
    "titan training": { groupKey: "titan-enhancement", groupTitle: "泰坦强化", tier: 1 },
    "titan genetic memory": { groupKey: "titan-enhancement", groupTitle: "泰坦强化", tier: 2 },
  };
  const mapProgressAbilities = [
    { key: "deeply embedded spies", fate: 2 },
    { key: "grassroot support", fate: 1 },
    { key: "delphi peoples' support", fate: 1 },
    { key: "archeohistorians", fate: 2, inwardOdyssey: true },
    { key: "pattern deciphering", fate: 1 },
  ];
  const saves = [
    { key: "rhetoric", triggers: { strangers: 1 }, condition: "即将获得陌生人", check: "外交 7+" },
    { key: "hope logic", triggers: { doom: 1 }, condition: "航行或冒险阶段即将获得灾祸", check: "检定 X+；X = 9 − 当前灾祸卡编号" },
    { key: "argo onboarding", triggers: { hull: -1 }, condition: "航行或冒险阶段即将失去船体", check: "检定 X+；X = 3 + 当前船体" },
    { key: "advanced crew expansion", triggers: { crew: -1 }, condition: "航行或冒险阶段即将失去船员", check: "外交 7+" },
    { key: "refugee integration", triggers: { hull: -1 }, condition: "航行或冒险阶段即将失去船体", check: "检定 X+；X = 9 − 难民数；掷出 1 时另失去 1 难民" },
    { key: "argo security", triggers: { crew: -1 }, condition: "航行或冒险阶段即将失去船员", check: "外交 7+" },
    { key: "argo timeline security", triggers: { crew: -1 }, condition: "航行或冒险阶段即将失去船员", check: "外交 7+" },
    { key: "sun shielding", triggers: { hull: -1, crew: -1, doom: 1 }, condition: "即将失去船体、船员，或获得灾祸", check: "掷 1d10；4+ 忽略本次失去或获得", frozenTime: true },
    { key: "temporal aegis", triggers: { paradox: 1 }, condition: "航行或冒险阶段即将获得悖论", check: "外交 7+" },
    { key: "law mora", triggers: { babelianDebt: 1 }, condition: "航行或冒险阶段即将获得巴比伦债务", check: "外交 7+" },
    { key: "bankers of the waste", triggers: { crew: -1 }, condition: "航行或冒险阶段即将失去船员", check: "外交 7+", debt: true },
    { key: "argo philosophy", triggers: { crew: -1 }, condition: "航行或冒险阶段即将失去船员", check: "外交 7+" },
    { key: "scientific debunking", triggers: { paranoia: 1 }, condition: "即将获得猜忌", check: "外交 7+" },
  ];

  function object(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function key(value) { return String(value || "").trim().toLowerCase(); }
  function baseKey(value) { return key(value).split("@@")[0]; }
  function safeId(value) { const id = String(value || "").trim(); return id && !["__proto__", "prototype", "constructor"].includes(id) ? id : ""; }
  function cycleOf(ctx) { return ctx.cycle || ctx.cycleId || ""; }
  function dayOf(ctx) {
    const value = ctx.day;
    const text = String(value ?? "").trim().toUpperCase();
    if (cycleOf(ctx) === "c1" && text === "T6/00") return 0;
    if (cycleOf(ctx) === "c1" && /^T[0-5]$/.test(text)) throw new Error("教程尚无正式航行日，请在 T6/00 或之后安排科技事件。");
    const day = count(value);
    if (day === null) throw new Error("请提供有效的战役天数。");
    return day;
  }
  function count(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) return null;
    return Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  }
  function failure(code, message) { return { ok: false, code, message }; }
  function validEvent(id, event) {
    return Boolean(safeId(id)) && object(event) && CYCLES.includes(event.cycleId) && safeId(event.techKey)
      && ["reward", "battle", "cooldown"].includes(event.kind) && count(event.dueDay) !== null;
  }
  function normalizeAutomation(value) {
    const events = {};
    if (object(value?.events)) Object.entries(value.events).forEach(([id, event]) => {
      if (!validEvent(id, event)) return;
      events[id] = clone({ ...event, id, dueDay: count(event.dueDay),
        cooldownUntilDay: count(event.cooldownUntilDay) ?? 0, status: event.status === "completed" ? "completed" : "pending" });
    });
    return { version: 1, events };
  }
  function getEvents(ctx = {}) {
    if (!object(ctx.automation)) return [];
    let day;
    try { day = dayOf(ctx); } catch { day = null; }
    const cycle = cycleOf(ctx);
    return Object.values(normalizeAutomation(ctx.automation).events)
      .filter(event => !cycle || event.cycleId === cycle)
      .map(event => {
        const due = day !== null && day >= event.dueDay;
        const cooldownActive = day === null || day < (event.cooldownUntilDay || 0);
        const completed = event.status === "completed" || (event.kind === "cooldown" && due);
        const grant = eventGrant(event);
        return { ...event, label: referenceText(ctx, event.techKey, event.label),
          rewardLabel: referenceText(ctx, event.techKey, event.rewardLabel),
          ...(grant ? { grant } : {}), auto: Boolean(grant) && !completed && event.kind === "reward",
          status: completed ? "completed" : "pending", due, overdue: due && day > event.dueDay && !completed,
          cooldownActive, locked: !completed || cooldownActive };
      }).sort((a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id));
  }
  // The dictionary is a static 319-card file, but getEvents/getAvailability ask
  // for it dozens of times per render (once per date cell and per action).
  // Rebuild the index once per dictionary object instead of once per lookup.
  const dictionaryIndexCache = new WeakMap();
  function dictionaryIndex(ctx) {
    const dictionary = object(ctx.dictionary) ? ctx.dictionary : null;
    if (!dictionary) return { cards: [], groups: [], cardsByKey: new Map(), byKey: new Map() };
    const cached = dictionaryIndexCache.get(dictionary);
    if (cached) return cached;
    const raw = dictionary.cards;
    const cards = (Array.isArray(raw) ? raw : object(raw) ? Object.values(raw) : []).filter(object)
      .slice().sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
    const groups = new Map();
    cards.forEach((card, index) => (card.tree_nodes || card.nodes || []).forEach((node, nodeIndex) => {
      const id = `${node.page}::${node.node_id || node.id || `${index}-${nodeIndex}`}`;
      if (!groups.has(id)) groups.set(id, { page: node.page, name: key(node.name || card.names?.en || card.en || card.key), cards: [] });
      groups.get(id).cards.push(card);
    }));
    const names = new Map();
    groups.forEach(group => {
      if (!names.has(group.name)) names.set(group.name, new Set());
      names.get(group.name).add(group.cards.map(card => card.index ?? card.key).join(","));
    });
    groups.forEach(group => { group.key = `${group.name}${names.get(group.name).size > 1 ? `@@${group.page}` : ""}`; });
    const index = { cards, groups: [...groups.values()], cardsByKey: new Map(), byKey: new Map() };
    for (const card of cards) {
      const cardKey = key(card.key);
      if (!cardKey) continue;
      if (!index.cardsByKey.has(cardKey)) index.cardsByKey.set(cardKey, []);
      index.cardsByKey.get(cardKey).push(card);
    }
    for (const group of index.groups) {
      if (!index.byKey.has(group.key)) index.byKey.set(group.key, []);
      index.byKey.get(group.key).push(...group.cards);
    }
    dictionaryIndexCache.set(dictionary, index);
    return index;
  }
  function dictionaryCards(ctx, techKey) {
    const wanted = key(techKey);
    if (!wanted) return [];
    const index = dictionaryIndex(ctx);
    // Stored events normally carry a canonical card key; do not rebuild the
    // entire tree for every event label on every availability check.
    const direct = index.cardsByKey.get(wanted) || [];
    if (direct.length) return direct.filter(card => card.category === "structure");
    return [...new Set(index.byKey.get(wanted) || [])].filter(card => card.category === "structure");
  }
  function unlockedKeys(technology) {
    const values = Array.isArray(technology?.unlocked) ? technology.unlocked : technology?.unlockedKeys;
    return new Set((Array.isArray(values) ? values : []).map(value => key(object(value) ? value.key : value)));
  }
  function eligibility(ctx, techKey) {
    const cycle = cycleOf(ctx);
    if (!CYCLES.includes(cycle)) return failure("INVALID_CYCLE", "未知战役循环。");
    const cards = dictionaryCards(ctx, techKey);
    if (!cards.length) return failure("UNKNOWN_TECH", "科技字典中没有此项结构科技。");
    const unlocked = unlockedKeys(ctx.technology);
    const groups = dictionaryIndex(ctx).groups;
    const owned = cards.filter(card => groups.some(group => group.cards.includes(card) && unlocked.has(group.key)) || unlocked.has(key(card.key)));
    if (!owned.length) return failure("LOCKED_TECH", "请先解锁这项科技。");
    const page = `cycle${cycle.slice(1)}`;
    const scoped = owned.filter(card => card.type?.loop_limited === false || (card.tree_nodes || card.nodes || []).some(node => node.page === page));
    if (!scoped.length) return failure("CYCLE_SCOPE", "这项科技不适用于当前循环。");
    const disabled = ctx.record?.explorationDelays?.disabledTechs || {};
    const available = scoped.find(card => !groups.filter(group => group.cards.includes(card)).some(group => {
      const nodeCycle = group.page?.replace("cycle", "c");
      return [cycle, nodeCycle].some(id => object(disabled[id]?.[group.key]) || object(disabled[id]?.[card.key]));
    }));
    if (!available) return failure("DISABLED_TECH", "这项科技暂时被禁用，等待修复。");
    // Unimportant is a display preference. It never changes ownership or rules.
    return { ok: true, card: available };
  }
  function getAvailability(ctx = {}) {
    const ruleKey = ctx.techKey || ctx.action?.techKey;
    const eligible = eligibility(ctx, ruleKey);
    if (!eligible.ok) return eligible;
    const rule = catalog.find(item => item.key === baseKey(eligible.card.key));
    if (rule?.actions.some(action => action.trade && action.resourceCycle !== cycleOf(ctx))) {
      return failure("CYCLE_SCOPE", "此贸易仅能交换卡面所属循环的资源，请在对应循环使用。");
    }
    try { dayOf(ctx); } catch (error) { return failure("INVALID_DAY", error.message); }
    const canonicalKey = key(eligible.card.key);
    const pending = getEvents(ctx).find(event => key(event.techKey) === canonicalKey && event.locked);
    if (pending) return failure("ABILITY_BUSY", pending.status === "completed"
      ? `冷却至 D${pending.cooldownUntilDay}。` : `已有待结算事件（D${pending.dueDay}）。`);
    const olderPending = Object.entries(object(ctx.automationsByCycle) ? ctx.automationsByCycle : {})
      .filter(([cycle]) => cycle !== cycleOf(ctx))
      // Read the saved events as-is. Normalizing every cycle here cloned every
      // event once per action availability check, which is the hot path of the
      // technology panel; validEvent() keeps the same shape while staying read-only.
      .flatMap(([, automation]) => Object.entries(object(automation?.events) ? automation.events : {})
        .filter(([id, event]) => validEvent(id, event))
        .map(([, event]) => event))
      .find(event => key(event.techKey) === canonicalKey && event.kind !== "cooldown" && event.status !== "completed");
    if (olderPending) return failure("ABILITY_BUSY", `${olderPending.cycleId.toUpperCase()} 循环仍有待结算事件（D${olderPending.dueDay}）。请先在原循环标记已手动处理。`);
    if (baseKey(eligible.card.key) === "canal reconnaissance") {
      const scout = scoutStatus(ctx);
      if (!scout.valid) return failure("UNKNOWN_SCOUT", "地图侦察船数量无效，请先在地图中核对。");
      if (scout.count > 0) return failure("SCOUT_AVAILABLE", `${scout.label}，无需重建。`);
    }
    return { ok: true, available: true, card: eligible.card };
  }
  function scoutStatus(ctx = {}) {
    const saved = ctx.map?.cycles?.[cycleOf(ctx)] || {};
    const tokens = saved.tokens || {};
    const tileId = Object.keys(object(tokens.markers) ? tokens.markers : {}).find(id => tokens.markers[id]?.hs) || "";
    const raw = count(tokens.hsCount ?? saved.hsCount ?? (tileId ? 1 : 0));
    const amount = raw === null ? null : Math.max(raw, tileId ? 1 : 0);
    const pending = getEvents(ctx).find(event => baseKey(event.techKey) === "canal reconnaissance" && event.actionId === "rebuild" && event.status !== "completed");
    const label = amount === null ? "侦察船数量待核对" : amount > 0
      ? `地图侦察船 ${amount} 艘${tileId ? `，已派出至 ${tileId}` : "，在船上待命"}`
      : pending ? `侦察船重建中，D${pending.dueDay} 完成` : "地图上没有侦察船，可重建";
    return { valid: raw !== null, count: amount, tileId, label };
  }
  function readStat(record, cycle, name) {
    const scoped = record?.cycleStats?.[cycle]?.[name];
    return count(scoped !== undefined ? scoped : !record?.cycle || record.cycle === cycle ? record?.[name] : undefined);
  }
  function heroItems(ctx) {
    return (Array.isArray(ctx.heroes) ? ctx.heroes : Array.isArray(ctx.heroes?.heroes) ? ctx.heroes.heroes : [])
      .filter(hero => object(hero) && safeId(hero.id));
  }
  function heroTitle(hero) { return hero.customName || hero.name || hero.nameZh || HERO_NAMES[hero.argonaut]
    || (/^blank\d+$/.test(hero.argonaut || "") ? `未命名 ${hero.argonaut.slice(5)}` : hero.playerName || "新英雄"); }
  function titanItems(ctx, crippled = false) {
    return (Array.isArray(ctx.record?.titans) ? ctx.record.titans : []).filter(titan => safeId(titan.id) && count(titan.count ?? 1) > 0 && (!crippled || titan.crippled === true));
  }
  function dreamwalkers(ctx) { return titanItems(ctx).filter(titan => /^(?:梦行者|dream\s*walker)$/i.test(String(titan.name || "").trim())); }
  // References use the printed rules (dark) side. Tree nodes keep card.names.
  // Equal titles need no override; legacy/custom dictionaries also use names.
  function titleFor(card) { return card.backNames?.zh || card.backNames?.en || card.names?.zh || card.names?.en || card.key; }
  function referenceTitle(ctx, techKey) {
    return [...new Set(dictionaryCards(ctx, techKey).map(titleFor))].join(" / ");
  }
  function referenceText(ctx, techKey, text) {
    if (typeof text !== "string" || !ctx.dictionary) return text;
    // Upgrade displayed legacy labels without rewriting saved events/receipts.
    const cards = dictionaryCards(ctx, techKey);
    if (!cards.length) return text;
    for (const card of cards) {
      const title = titleFor(card);
      for (const name of [card.names?.zh, card.names?.en]) {
        if (name && name !== title) text = text.split(name).join(title);
      }
    }
    return text;
  }
  function actionChoices(action, ctx) {
    const choices = [], confirmations = [];
    if (action.target === "hero") {
      choices.push({ id: "targetId", label: "阿尔戈英雄", type: "select", required: true,
        options: heroItems(ctx).map(hero => ({ value: String(hero.id), label: heroTitle(hero) })) });
    }
    if (action.target?.includes("titan") || action.sacrifice) {
      choices.push({ id: "titanId", label: action.sacrifice ? "支付 1 架梦行者" : "目标泰坦", type: "select", required: true,
        options: (action.sacrifice ? dreamwalkers(ctx) : titanItems(ctx, action.target === "crippled-titan"))
          .map(titan => ({ value: String(titan.id), label: `${titan.name || "泰坦"}（${titan.count || 1}）${titan.crippled ? " · 残废" : ""}` })) });
    }
    if (action.sacrifice) {
      choices.push({ id: "resultTitan", label: "培育型号", type: "select", required: true,
        options: action.models.map(id => ({ value: id, label: TITANS[id] })) });
    }
    if (action.rebuild) {
      choices.push({ id: "payment", label: "资源代价", type: "select", required: true,
        options: [{ value: "c1-trireme", label: "5 船材" }, { value: "c2-warTrireme", label: "2 舰材" }] });
    }
    if (action.requiresDevelopment) {
      confirmations.push({ id: "story2aConfirmed", label: "当前循环已到故事 2A 或之后" });
    }
    return { choices, confirmations };
  }
  // A printed reward whose outcome is fixed when the event is scheduled can be
  // settled on its due date. Reading the titans and the manual style-card
  // rewards still need the player.
  function rewardGrant(action, selection = {}, targetLabel = "") {
    if (!object(action)) return null;
    if (action.titan === true) {
      const titanId = String(selection.resultTitan || "");
      return TITANS[titanId] ? { type: "titan", titanId, name: TITANS[titanId], count: 1 } : null;
    }
    if (object(action.grant)) return clone(action.grant);
    if (action.repair && safeId(selection.titanId)) {
      return { type: "repair", titanId: String(selection.titanId), name: targetLabel || "" };
    }
    return null;
  }
  function actionOfEvent(event) {
    return catalog.find(item => item.key === baseKey(event?.techKey))?.actions.find(action => action.id === event?.actionId) || null;
  }
  function eventGrant(event) {
    if (!object(event) || event.kind !== "reward") return null;
    if (object(event.grant)) return clone(event.grant);
    // Events scheduled before this rule existed still carry their selection.
    return rewardGrant(actionOfEvent(event), object(event.selection) ? event.selection : {}, event.targetLabel);
  }
  function autoSettleEvent(event) {
    return Boolean(object(event) && event.status !== "completed" && eventGrant(event));
  }
  function titanTotal(titans) {
    return String(titans.reduce((sum, item) => sum + (count(item.count ?? 1) || 0), 0));
  }
  function validTitans(record) {
    if (record.titans === undefined || record.titans === null) record.titans = [];
    if (!Array.isArray(record.titans)) return failure("INVALID_TITANS", "泰坦列表无效，请先在记录表核对。");
    if (record.titans.some(titan => !object(titan) || count(titan.count ?? 1) === null)) {
      return failure("INVALID_TITANS", "泰坦数量无效，请先在记录表核对。");
    }
    return { ok: true };
  }
  function grantTitan(record, grant, operationId) {
    const valid = validTitans(record);
    if (!valid.ok) return valid;
    const amount = Math.max(1, count(grant.count) ?? 1);
    // The record keeps one row per model, so a new model joins the matching
    // healthy row instead of creating a duplicate line.
    const existing = record.titans.find(titan => !titan.crippled && key(titan.name) === key(grant.name));
    if (existing) {
      const total = count(existing.count ?? 1) + amount;
      if (!Number.isSafeInteger(total)) return failure("INVALID_TITANS", "泰坦数量超出可记录范围。");
      existing.count = total;
      existing.limit = Math.max(Number(existing.limit) || 1, total);
    } else {
      let titanId = `titan-${safeId(operationId) || Date.now()}`;
      while (record.titans.some(item => safeId(item.id) === titanId)) titanId += "-new";
      record.titans.push({ id: titanId, name: grant.name || "泰坦", count: amount, limit: amount, crippled: false });
    }
    record.titan = titanTotal(record.titans);
    return { ok: true };
  }
  function grantRepair(record, grant) {
    const valid = validTitans(record);
    if (!valid.ok) return valid;
    let targetId = safeId(grant.titanId);
    const visited = new Set();
    while (!record.titans.some(titan => safeId(titan.id) === targetId)
        && record.titanMergedIds?.[targetId] && !visited.has(targetId)) {
      visited.add(targetId);
      targetId = safeId(record.titanMergedIds[targetId]);
    }
    const index = record.titans.findIndex(titan => safeId(titan.id) === targetId);
    // A row the player already removed is reported instead of blocking the
    // completion forever; the printed reward stays visible in the log.
    if (index < 0) return { ok: true, skipped: "记录表中已找不到原目标泰坦" };
    const target = record.titans[index];
    if (target.crippled !== true) return { ok: true, skipped: `${target.name || "目标泰坦"}已不再残废` };
    const amount = count(target.count ?? 1);
    if (amount > 1) {
      target.count = amount - 1;
      const healthy = record.titans.find(item => item !== target && !item.crippled && key(item.name) === key(target.name));
      if (healthy) {
        const total = count(healthy.count ?? 1) + 1;
        if (!Number.isSafeInteger(total)) return failure("INVALID_TITANS", "泰坦数量超出可记录范围。");
        healthy.count = total;
        healthy.limit = Math.max(Number(healthy.limit) || 1, total);
      } else {
        let titanId = `${safeId(target.id) || "titan"}-healed`;
        while (record.titans.some(item => safeId(item.id) === titanId)) titanId += "-new";
        record.titans.splice(index + 1, 0, { ...clone(target), id: titanId, count: 1, limit: 1, crippled: false });
      }
    } else target.crippled = false;
    record.titan = titanTotal(record.titans);
    return { ok: true, titanId: target.id };
  }
  function applyGrant(record, grant, operationId, day) {
    const result = grant.type === "repair" ? grantRepair(record, grant) : grantTitan(record, grant, operationId);
    if (!result.ok) return result;
    const applied = { ...clone(grant), applied: true, appliedDay: day };
    if (result.skipped) applied.skipped = result.skipped;
    return { ok: true, grant: applied };
  }
  function listActions(ctx = {}) {
    const negotiations = negotiationRules();
    if (ctx.scope === "negotiation") return negotiations?.listActions(ctx, negotiationHelpers()) || [];
    if (ctx.scope === "exploration") return explorationTechRules()?.listActions(ctx, negotiationHelpers()) || [];
    const cards = ctx.techKey ? dictionaryCards(ctx, ctx.techKey) : dictionaryIndex(ctx).cards.filter(card => card.category === "structure");
    const voyage = cards.flatMap(card => {
      const rule = catalog.find(item => item.key === baseKey(card.key));
      if (!rule) return [];
      if (rule.actions.some(action => action.trade && action.resourceCycle !== cycleOf(ctx))) return [];
      const check = getAvailability({ ...ctx, techKey: card.key });
      if (!ctx.techKey && ["UNKNOWN_TECH", "LOCKED_TECH", "CYCLE_SCOPE"].includes(check.code)) return [];
      return rule.actions.map(action => ({ ...clone(action), ...actionChoices(action, ctx), actionId: action.id, techKey: key(card.key),
        ...(actionFamilies[card.key] || (action.trade ? { groupKey: "trade", groupTitle: "贸易", tier: 1 }
          : { groupKey: card.key, groupTitle: titleFor(card), tier: 1 })),
        title: titleFor(card), image: card.image?.back || "", stepId: "timeline",
        ...(action.trade ? { sourceLabel: titleFor(card) } : {}),
        ...(action.rebuild ? { scoutLabel: scoutStatus(ctx).label } : {}),
        available: check.ok, disabled: !check.ok, reason: check.message || "", dueDays: action.days,
        costLabel: [action.fate ? "+1 命运" : "", action.sacrifice ? "失去 1 架梦行者" : "", action.rebuild ? "失去 5 船材或 2 舰材" : "", action.tear ? "暂时弃置本卡" : ""].filter(Boolean).join("；") || "无代价" }));
    });
    const immediate = [...(voyageRules()?.listActions(ctx, negotiationHelpers()) || []),
      ...(explorationTechRules()?.listActions(ctx, negotiationHelpers()) || [])];
    return ctx.techKey ? [...voyage, ...immediate, ...(negotiations?.listActions(ctx, negotiationHelpers()) || [])] : [...voyage, ...immediate];
  }
  function actionsFor(techKey, ctx = {}) { return listActions({ ...ctx, techKey }); }
  // Presentation groups do not change ownership, model pools or per-card locks.
  function listActionGroups(ctx = {}) {
    const groups = new Map();
    for (const action of listActions(ctx)) {
      const id = action.groupKey;
      if (!groups.has(id)) groups.set(id, { id, title: action.groupTitle, actions: [] });
      groups.get(id).actions.push(action);
    }
    for (const group of groups.values()) group.actions.sort((a, b) =>
      Number(b.available) - Number(a.available) || b.tier - a.tier
      || a.techKey.localeCompare(b.techKey) || Number(a.id === "breed-accelerated") - Number(b.id === "breed-accelerated"));
    return [...groups.values()];
  }
  function requestShape(ctx) { return { techKey: key(ctx.techKey), actionId: ctx.actionId, cycleId: cycleOf(ctx), selection: clone(object(ctx.selection) ? ctx.selection : {}) }; }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  function prepareTrades(action, selection, record) {
    const ordered = selection.tradeSteps !== undefined;
    const trades = ordered ? selection.tradeSteps : selection.trades;
    if (!Array.isArray(trades) || !trades.length) {
      return failure("INVALID_TRADE", "请选择至少 1 类资源交换。");
    }
    // 贸易次数按“类”计算：同一种置换可以填入任意倍率数量，仍只消耗 1 类额度。
    const amounts = new Map(), lines = [], steps = [], chosen = new Set(action.tradeUsedRoutes || []);
    let categories = chosen.size, exchanges = 0;
    for (const selected of trades) {
      const route = object(selected) && action.tradeRoutes.find(item => item.id === selected.routeId);
      const times = count(selected?.count);
      if (!route || times === null || times < 1) return failure("INVALID_TRADE", "请选择卡面中的交换项目和有效的整数次数。");
      if (!ordered && chosen.has(route.id)) {
        return failure("DUPLICATE_TRADE", "同一种资源置换只需填写一行，请直接调高该行的次数倍率。");
      }
      if (!chosen.has(route.id)) categories += 1;
      chosen.add(route.id);
      exchanges += times;
      if (!Number.isSafeInteger(exchanges)) return failure("TRADE_LIMIT", "交换数量过大，无法完成交换。");
      if (action.maxTrades !== null && categories > action.maxTrades) {
        return failure("TRADE_LIMIT", `每次使用最多选择 ${action.maxTrades} 类资源置换；同一类可以填写任意次数。`);
      }
      lines.push(`${route.label} ×${times}`);
      const step = { routeId: route.id, count: times, changes: [] };
      // Match exploration trades: settle each selected line in order, checking
      // its cost before its gain. Later lines may spend earlier lines' gains.
      for (const [entries, field] of [[route.costs, "costAmount"], [route.gains, "gainAmount"]]) {
        for (const entry of entries) {
          const item = amounts.get(entry.storageKey) || { type: "resource", resource: entry.resource,
            storageKey: entry.storageKey, label: entry.label, costAmount: 0, gainAmount: 0 };
          if (item.before === undefined) {
            const raw = record.resources?.[item.storageKey];
            item.before = raw === undefined ? 0 : count(raw);
            if (item.before === null) return failure("UNKNOWN_COST", `${item.label}库存无效，请先填写非负整数。`);
            item.after = item.before;
          }
          const quantity = entry.amount * times;
          item[field] += quantity;
          if (!Number.isSafeInteger(item[field])) return failure("TRADE_LIMIT", "交换数量过大，无法完成交换。");
          const before = item.after, amount = field === "costAmount" ? -quantity : quantity;
          if (amount < 0 && before < quantity) return failure("INSUFFICIENT_RESOURCES", `${item.label}不足，需要 ${quantity}；本次未交换资源或增加命运。`);
          item.after += amount;
          if (!Number.isSafeInteger(item.after)) return failure("RESOURCE_LIMIT", `${item.label}数量过大，无法完成交换。`);
          step.changes.push({ storageKey: item.storageKey, label: item.label, before, after: item.after, amount });
          amounts.set(entry.storageKey, item);
        }
      }
      steps.push(step);
    }
    const changes = [...amounts.values()].map(item => ({ ...item, amount: item.gainAmount - item.costAmount }));
    return { ok: true, changes, steps, total: categories, exchanges, summary: lines.join("；"),
      payment: changes.filter(item => item.costAmount > 0).map(item => ({ type: "resource", storageKey: item.storageKey,
        label: item.label, amount: -item.costAmount })),
      gains: changes.filter(item => item.gainAmount > 0).map(item => ({ type: "resource", storageKey: item.storageKey,
        label: item.label, amount: item.gainAmount })) };
  }
  // Find a simple resource path. Scale all legs to the smallest whole batch so
  // intermediate goods are fully funded by this exchange, without rounding.
  function findTradePath(action, from, to, record = {}, previous = []) {
    if (!from || !to || from === to) return failure('INVALID_TRADE', '请选择两种不同的资源。');
    const edges = (action.tradeRoutes || []).filter(route => route.costs?.length === 1 && route.gains?.length === 1
      && [...route.costs, ...route.gains].every(item => Number.isSafeInteger(item.amount) && item.amount > 0));
    const candidates = [], seen = new Set([from]);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    function visit(key, path) {
      if (key === to) {
        let input = BigInt(path[0].costs[0].amount), output = BigInt(path[0].gains[0].amount), counts = [1n];
        for (const route of path.slice(1)) {
          const cost = BigInt(route.costs[0].amount), scale = cost / gcd(output, cost);
          input *= scale; counts = counts.map(value => value * scale);
          const count = output * scale / cost;
          counts.push(count); output = count * BigInt(route.gains[0].amount);
        }
        if ([input, output, ...counts].some(value => value > BigInt(Number.MAX_SAFE_INTEGER))) return;
        const steps = path.map((route, index) => ({ routeId: route.id, count: Number(counts[index]) }));
        const used = new Set([...(action.tradeUsedRoutes || []), ...previous.map(step => step.routeId)]);
        const total = new Set([...used, ...steps.map(step => step.routeId)]).size;
        const result = prepareTrades(action, { tradeSteps: [...previous, ...steps] }, record);
        candidates.push({ ...result, steps, path, input: Number(input), output: Number(output), total, extra: total - used.size });
        return;
      }
      for (const route of edges) {
        const next = route.gains[0].storageKey;
        if (route.costs[0].storageKey !== key || seen.has(next)) continue;
        seen.add(next); visit(next, [...path, route]); seen.delete(next);
      }
    }
    visit(from, []);
    // Prefer executable paths, then the best rate; ties spend fewer categories.
    candidates.sort((a, b) => Number(b.ok) - Number(a.ok)
      || Number(BigInt(b.output) * BigInt(a.input) - BigInt(a.output) * BigInt(b.input))
      || a.extra - b.extra || a.steps.length - b.steps.length || a.input - b.input);
    return candidates[0] || failure('NO_TRADE_PATH', '这两种资源之间没有可用的兑换路径。');
  }
  function prepareOperation(ctx = {}) {
    const id = safeId(ctx.operationId);
    if (!id) return failure("INVALID_OPERATION", "缺少有效的操作编号。");
    const automation = normalizeAutomation(ctx.automation);
    const record = clone(object(ctx.record) ? ctx.record : {});
    const shape = requestShape(ctx);
    const existing = record.technologyActionReceipts?.[id];
    if (object(existing)) {
      if (stable(existing.request) !== stable(shape)) return failure("OPERATION_CONFLICT", "此操作编号已用于另一项安排。");
      const event = automation.events[id];
      if (!event) return failure("INCONSISTENT_OPERATION", "科技安排记录不完整，请刷新存档。");
      return { ok: true, operation: clone(event), event: clone(event), record, automation, receipt: clone(existing), duplicate: true };
    }
    if (automation.events[id]) return failure("INCONSISTENT_OPERATION", "此操作编号已有事件，请刷新存档。");
    if (String(ctx.actionId).startsWith("voyage-")) {
      try { return voyageRules()?.prepareOperation(ctx, negotiationHelpers(), { record, automation, shape })
        || failure("RULES_UNAVAILABLE", "航行科技规则未加载，请刷新页面。"); }
      catch (error) { return failure("INVALID_VOYAGE_ACTION", error.message); }
    }
    if (ctx.actionId === "exploration-pursuit") {
      const pursuit = root.ATO_EXPLORATION_PURSUIT || (typeof require === "function" ? require("../assets/exploration-pursuit.js") : null);
      try { return pursuit?.prepareOperation(ctx, negotiationHelpers(), { record, automation, shape }) || failure("RULES_UNAVAILABLE", "追踪结算规则未加载。"); }
      catch (error) { return failure("INVALID_PURSUIT", error.message); }
    }
    if (String(ctx.actionId).startsWith("negotiate-")) {
      try { return negotiationRules()?.prepareOperation(ctx, negotiationHelpers(), { record, automation, shape })
        || failure("RULES_UNAVAILABLE", "谈判规则未加载，请刷新页面。"); }
      catch (error) { return failure("INVALID_NEGOTIATION", error.message); }
    }
    if (String(ctx.actionId).startsWith("tech-explore-")) {
      try { return explorationTechRules()?.prepareOperation(ctx, negotiationHelpers(), { record, automation, shape })
        || failure("RULES_UNAVAILABLE", "探索科技规则未加载，请刷新页面。"); }
      catch (error) { return failure("INVALID_EXPLORATION_TECH", error.message); }
    }
    const rule = catalog.find(item => item.key === baseKey(ctx.techKey));
    const action = rule?.actions.find(item => item.id === ctx.actionId);
    if (!action) return failure("UNKNOWN_ACTION", "未知的科技能力。");
    const check = getAvailability(ctx);
    if (!check.ok) return check;
    const selection = clone(object(ctx.selection) ? ctx.selection : {});
    const { confirmations } = actionChoices(action, ctx);
    const missing = confirmations.find(item => selection[item.id] !== true);
    if (missing) return failure("CONFIRM_CONDITION", missing.label);
    let targetLabel = "", target = null;
    if (action.target === "hero") {
      target = heroItems(ctx).find(hero => String(hero.id) === String(selection.targetId));
      // An empty record is the only case that needs the "add a hero first"
      // reminder. With heroes on file the picker already names the missing
      // choice, so the silent failure just keeps the button disabled.
      if (!target) return failure("INVALID_TARGET", heroItems(ctx).length
        ? "" : "请先在英雄记录表添加英雄，再选择当前在役的阿尔戈英雄。");
      targetLabel = heroTitle(target);
    }
    if (action.target?.includes("titan") || action.sacrifice) {
      target = (action.sacrifice ? dreamwalkers(ctx) : titanItems(ctx, action.target === "crippled-titan"))
        .find(item => String(item.id) === String(selection.titanId));
      if (!target) return failure("INVALID_TARGET", action.sacrifice ? "请选择现有梦行者泰坦支付代价。"
        : action.target === "crippled-titan" ? "请选择仍然残废的泰坦。" : "请选择现有泰坦。");
      targetLabel = target.name || String(target.id);
    }
    if (action.models && !action.models.includes(selection.resultTitan)) return failure("INVALID_TARGET", "请选择此能力可以培育的型号。");
    const cycle = cycleOf(ctx), payment = [];
    const tradeResult = action.trade ? prepareTrades(action, selection, record) : null;
    if (tradeResult && !tradeResult.ok) return tradeResult;
    if (action.fate) {
      const before = readStat(record, cycle, "fate");
      if (before === null) return failure("UNKNOWN_COST", "请先填写当前循环的命运数值。");
      if (before + action.fate > FATE_MAX) return failure("COST_LIMIT", "请先处理命运上限，再使用此能力。");
      if (!object(record.cycleStats)) record.cycleStats = {};
      if (!object(record.cycleStats[cycle])) record.cycleStats[cycle] = {};
      record.cycleStats[cycle].fate = String(before + action.fate);
      if (!record.cycle || record.cycle === cycle) record.fate = String(before + action.fate);
      payment.push({ type: "fate", label: "命运", before, after: before + action.fate, amount: action.fate });
    }
    if (tradeResult) {
      if (!object(record.resources)) record.resources = {};
      tradeResult.changes.forEach(change => { record.resources[change.storageKey] = change.after; });
      payment.push(...tradeResult.payment);
    }
    if (action.rebuild) {
      const storageKey = selection.payment;
      const amount = storageKey === "c1-trireme" ? 5 : storageKey === "c2-warTrireme" ? 2 : null;
      if (amount === null) return failure("INVALID_PAYMENT", "请选择 5 船材或 2 舰材。");
      const before = count(record.resources?.[storageKey]);
      if (before === null || before < amount) return failure("INSUFFICIENT_RESOURCES", "所选资源不足，未扣费或添加事件。");
      record.resources[storageKey] = before - amount;
      payment.push({ type: "resource", storageKey, before, after: before - amount, amount: -amount });
    }
    if (action.sacrifice) {
      const index = record.titans.findIndex(item => String(item.id) === String(selection.titanId));
      const before = count(record.titans[index].count ?? 1);
      if (before === 1) record.titans.splice(index, 1);
      else record.titans[index].count = before - 1;
      record.titan = String(record.titans.reduce((sum, item) => sum + (count(item.count ?? 1) || 0), 0));
      payment.push({ type: "titan", titanId: target.id, name: targetLabel, before, after: before - 1, amount: -1 });
    }
    const day = dayOf(ctx);
    const days = action.id === "breed" && selection.resultTitan === "tt_shadowdancer" ? 14 : action.days;
    const rewardLabel = action.models ? `获得 1 架${TITANS[selection.resultTitan]}泰坦` : action.rewardLabel || (action.skipTimeline ? "资源交换已完成" : "冷却结束，可再次使用此能力");
    const grant = action.skipTimeline ? null : rewardGrant(action, selection, targetLabel);
    if (!Number.isSafeInteger(day + Math.max(days, action.cooldownDays || 0))) return failure("INVALID_DAY", "战役天数过大，无法安排事件。");
    const event = { id, techKey: key(check.card.key), actionId: action.id, cycleId: cycle, stepId: "timeline",
      label: [titleFor(check.card), action.label].filter(Boolean).join(" · "), createdDay: day, dueDay: day + days,
      cooldownUntilDay: action.cooldownDays || action.kind === "cooldown" ? day + (action.cooldownDays || days) : 0,
      kind: action.kind, rewardLabel, selection, targetLabel, status: action.skipTimeline ? "completed" : "pending", payment,
      ...(grant ? { grant } : {}),
      ...(action.skipTimeline ? { skipTimeline: true, completedDay: day } : {}),
      ...(tradeResult ? { tradeSummary: tradeResult.summary, tradeCount: tradeResult.total, tradeExchanges: tradeResult.exchanges, tradeChanges: clone(tradeResult.changes), tradeSteps: clone(tradeResult.steps), gains: clone(tradeResult.gains) } : {}),
      ...(action.tear ? { temporarilyDiscarded: true } : {}) };
    // A reward's completion releases its event lock; a separate date lock may
    // still remain (accelerated breeding and Mnestis Simulation).
    automation.events[id] = event;
    const receipt = { id, request: shape, techKey: event.techKey, actionId: action.id, cycleId: cycle,
      createdDay: day, status: event.status, payment: clone(payment),
      ...(grant ? { grant } : {}),
      ...(action.skipTimeline ? { completedDay: day } : {}),
      ...(tradeResult ? { tradeSummary: tradeResult.summary, tradeCount: tradeResult.total, tradeExchanges: tradeResult.exchanges, tradeChanges: clone(tradeResult.changes), tradeSteps: clone(tradeResult.steps), gains: clone(tradeResult.gains) } : {}) };
    if (!object(record.technologyActionReceipts)) record.technologyActionReceipts = {};
    record.technologyActionReceipts[id] = receipt;
    return { ok: true, operation: clone(event), event: clone(event), automation, record, receipt: clone(receipt), duplicate: false };
  }
  function previewOperation(ctx = {}) {
    if (ctx.actionId === "tech-explore-salvage") return explorationTechRules()?.previewOperation(ctx, negotiationHelpers())
      || failure("RULES_UNAVAILABLE", "探索科技规则未加载，请刷新页面。");
    return prepareOperation(ctx);
  }
  function completeOperation(ctx = {}) {
    const id = safeId(ctx.operationId), cycle = cycleOf(ctx);
    const automation = normalizeAutomation(ctx.automation), record = clone(object(ctx.record) ? ctx.record : {});
    const event = automation.events[id], receipt = record.technologyActionReceipts?.[id];
    if (!event || !object(receipt)) return failure("UNKNOWN_OPERATION", "找不到这项科技安排，请刷新存档。");
    if (event.cycleId !== cycle || receipt.cycleId !== cycle) return failure("CYCLE_SCOPE", "此事件不属于当前循环。");
    let day;
    try { day = dayOf(ctx); } catch (error) { return failure("INVALID_DAY", error.message); }
    if (event.negotiationDraw?.selectedCard && Object.prototype.hasOwnProperty.call(ctx.selection || {}, "cardId")) {
      if (ctx.selection.cardId !== event.negotiationDraw.selectedCard) return failure("OPERATION_CONFLICT", "此荒原商人已选择了另一张探索卡，请刷新存档确认。");
      // Choosing the card and acknowledging a remaining manual debt are two
      // separate transitions. A retried choice must never finish that debt.
      return { ok: true, operation: clone(event), event: clone(event), automation, record, receipt: clone(receipt), duplicate: true };
    }
    if (event.status === "completed") return { ok: true, operation: clone(event), event: clone(event), automation, record, receipt: clone(receipt), duplicate: true };
    if (day < event.dueDay) return failure("NOT_DUE", "此事件尚未到期。");
    if (event.explorationTechFollow) {
      try { return explorationTechRules()?.completeOperation(ctx, negotiationHelpers(), { record, automation, event, receipt })
        || failure("RULES_UNAVAILABLE", "探索科技规则未加载，请刷新页面。"); }
      catch (error) { return failure("INVALID_EXPLORATION_TECH", error.message); }
    }
    if (event.negotiationDraw && !event.negotiationDraw.selectedCard) return negotiationRules().completeDraw(ctx, negotiationHelpers(), { record, automation, event, receipt });
    let map, grant;
    if (baseKey(event.techKey) === "canal reconnaissance" && event.actionId === "rebuild") {
      const scout = scoutStatus(ctx);
      if (!scout.valid) return failure("UNKNOWN_SCOUT", "地图侦察船数量无效，请先在地图中核对。");
      map = clone(object(ctx.map) ? ctx.map : {});
      if (!object(map.cycles)) map.cycles = {};
      if (!object(map.cycles[cycle])) map.cycles[cycle] = {};
      if (!object(map.cycles[cycle].tokens)) map.cycles[cycle].tokens = {};
      map.cycles[cycle].tokens.hsCount = Math.max(1, scout.count);
      map.activeCycleId ||= cycle;
      event.scoutRestored = true;
      receipt.scoutRestored = true;
    }
    const pending = eventGrant(event);
    if (pending) {
      // The reward is applied exactly once, on the completing transition. A
      // replayed completion returns the stored duplicate above.
      const applied = applyGrant(record, pending, id, day);
      if (!applied.ok) return applied;
      grant = applied.grant;
      event.grant = clone(grant);
      receipt.grant = clone(grant);
    }
    event.status = "completed";
    if (event.temporarilyDiscarded) event.temporarilyDiscarded = false;
    event.completedDay = day;
    receipt.status = "completed";
    receipt.completedDay = day;
    return { ok: true, operation: clone(event), event: clone(event), automation, record, receipt: clone(receipt), duplicate: false,
      ...(grant ? { grant: clone(grant) } : {}),
      ...(map ? { map } : {}) };
  }
  function mapProgressReminders(ctx = {}) {
    if (ctx.map?.explored !== true || !Array.isArray(ctx.map?.tags) || !ctx.map.tags.includes("progress")) return [];
    const unimportant = new Set((ctx.technology?.unimportant || ctx.technology?.unimportantKeys || []).map(value => key(object(value) ? value.key : value)));
    const groups = dictionaryIndex(ctx).groups;
    return mapProgressAbilities.flatMap(rule => {
      const eligible = eligibility(ctx, rule.key);
      if (!eligible.ok || unimportant.has(key(eligible.card.key))
        || groups.some(group => group.cards.includes(eligible.card) && unimportant.has(group.key))) return [];
      return [{ techKey: rule.key, title: titleFor(eligible.card), fate: rule.fate,
        condition: "阿尔戈号位于带进展图标的已探索地图板块上", check: "外交 7+",
        effect: rule.inwardOdyssey ? "成功时获得 1 进展，或在内蕴奥德赛上放置 1 个进展指示物" : "成功时获得 1 进展" }];
    });
  }
  function saveReminders(ctx = {}, effects) {
    if (!Array.isArray(effects) || !effects.length) return [];
    const unimportant = new Set((ctx.technology?.unimportant || ctx.technology?.unimportantKeys || []).map(value => key(object(value) ? value.key : value)));
    const groups = dictionaryIndex(ctx).groups;
    const reminders = saves.filter(rule => {
      if (!effects.some(effect => object(effect) && rule.triggers[effect.type] && Number.isFinite(Number(effect.amount))
        && Math.sign(Number(effect.amount)) === rule.triggers[effect.type])) return false;
      const eligible = eligibility(ctx, rule.key);
      if (!eligible.ok) return false;
      return !unimportant.has(key(eligible.card.key)) && !groups.some(group => group.cards.includes(eligible.card) && unimportant.has(group.key));
    }).map(rule => {
      const card = eligibility(ctx, rule.key).card;
      const costLabel = rule.frozenTime ? "失去 1 凝固时光" : rule.debt ? "+1 命运，+1 巴比伦债务" : "+1 命运";
      const doomCardNumber = count(ctx.doomCardNumber);
      const check = rule.key === "hope logic" ? doomCardNumber !== null && doomCardNumber > 0
        ? `检定 ${9 - doomCardNumber}+` : "请先在灾祸步骤选择当前灾祸卡以确定检定门槛" : rule.check;
      return { techKey: rule.key, title: titleFor(card), condition: rule.condition, costLabel, image: card.image?.back || "",
        triggerTypes: Object.keys(rule.triggers), triggers: clone(rule.triggers), check,
        effect: rule.frozenTime ? "4+ 时忽略本次失去或获得" : "成功时本次增减量降低 1（最低 0）",
        text: `${rule.condition}：${costLabel}；${check}${rule.frozenTime ? "" : "，成功时本次增减量降低 1（最低 0）"}` };
    });
    const merged = new Map();
    for (const reminder of reminders) {
      const signature = stable([reminder.condition, reminder.costLabel, reminder.check, reminder.effect, reminder.triggers]);
      const source = { techKey: reminder.techKey, title: reminder.title, image: reminder.image };
      if (!merged.has(signature)) merged.set(signature, { ...reminder, sources: [] });
      merged.get(signature).sources.push(source);
    }
    return [...merged.values()].map(reminder => ({ ...reminder,
      title: reminder.sources.map(source => source.title).join(" / "),
    }));
  }

  function negotiationRules() {
    return root.ATO_NEGOTIATION_RULES || (typeof require === "function" ? require("./negotiation-rules.js") : null);
  }
  function voyageRules() {
    return root.ATO_VOYAGE_ACTION_RULES || (typeof require === "function" ? require("./voyage-action-rules.js") : null);
  }
  function explorationTechRules() {
    return root.ATO_EXPLORATION_TECH_RULES || (typeof require === "function" ? require("./exploration-tech-rules.js") : null);
  }
  function negotiationHelpers() {
    return { eligibility, getAvailability, dictionaryCards, dayOf, tradeResources, prepareTrades, heroItems, heroTitle, titanItems, titleFor, saveReminders };
  }
  function canNegotiate(ctx = {}) { return Boolean(negotiationRules()?.canNegotiate(ctx, negotiationHelpers())); }
  // Alliance Contacts pays one resource per point of the chosen faction's
  // diplomacy, so the client needs the same relation lookup the rules use.
  function factionRelation(ctx = {}, faction) {
    if (!faction) return null;
    const value = negotiationRules()?.relation?.(ctx, faction);
    return Number.isInteger(value) ? value : null;
  }
  function canUsePursuerProblem(ctx = {}) { return eligibility(ctx, "pursuer problem"); }
  return { version: 1, catalog: clone(catalog), voyageCatalog: voyageRules()?.catalog || [], explorationCatalog: explorationTechRules()?.catalog || [], negotiationCatalog: negotiationRules()?.catalog || [], saveCatalog: clone(saves), listActions, listActionGroups, actionsFor, getAvailability,
    eligibility, titleFor, referenceTitle, referenceText, getHelpers: negotiationHelpers,
    factionRelation,
    normalizeAutomation, getEvents, prepareOperation, previewOperation, completeOperation, saveReminders, mapProgressReminders, scoutStatus, canNegotiate, canUsePursuerProblem,
    eventGrant, autoSettleEvent, previewTrades: prepareTrades, findTradePath };
});
