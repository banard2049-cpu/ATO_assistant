// Reviewed against the local Boss panels, standalone traits and level workbook.
(function (root) {
  "use strict";
  const removals = {
    HEKATON: [[2, "善意上门"]],
    HERMESIAN_PURSUER: [[2, "玩弄"]],
    THE_NIETZSCJEAN: [[2, "留一手"]],
    DAHAKA: [[2, "悔恨的镣铐"], [2, "恐惧的款待"]],
    DRAGON_OF_PHOBOS: [[4, "以真还真"]],
    UR_FLEECE: [[2, "只是一段回忆"], [3, "凡性柴薪"], [8, "Deeper Depths"]],
    TITAN_X: [[2, "玩弄"]],
    BLACKBEAK: [[1, "玩弄"], [1, "挑逗"]]
  };
  const cards = {
    ALPHA_TEMENOS: { VI_1: "无望之歌" },
    CHIMERA_METASTASIOS: { I_1: "黏糊留痕", I_2: "来势汹汹", II_1: "剧毒", X_1: "吸入" },
    CYCLONUS: { IV_1: "次级威胁感应" },
    DAHAKA: { O_1: "恐惧的款待" },
    DEMIDJINN: { I_1: "以怨还怨", IV_1: "终极愿望" },
    DRAGON_OF_PHOBOS: { I_1: "恐惧的层次", I_2: "以真还真", I_3: "食恐而肥", IV_1: "以假还真" },
    HYPERTIME_ORACLE: { I_1: "命引之死" },
    ICARIAN_HARPY: { I_1: "舔血战士", I_2: "命引之死", I_3: "急速适应", X_1: "舔血行动" },
    MEDUKETOS: { I_1: "超视距作战", I_2: "慢炖", I_3: "隐蔽与热追踪", I_4: "食光而肥" },
    MIDASCORE: { I_1: "疼痛增量", II_1: "累累白骨之间" },
    SUN_DESCENDANT: { I_1: "命引之死", X_1: "无情太阳" },
    THE_BABELIAN_LUNACY: { II_1: "Moon Call", VIII_1: "Total Eclipse", IX_1: "God’s Breath" },
    THE_BURDEN: { II_1: "难以推动的巨石" },
    THE_NIETZSCJEAN: { II_1: "时不我待" },
    TITAN_X: { I_1: "玩弄" },
    UR_FLEECE: { I_1: "凡性柴薪", I_2: "只是一段回忆" }
  };
  const aliases = {
    "Toying": "玩弄", "Shackles of Regret": "悔恨的镣铐", "Just a Memory": "只是一段回忆",
    "Stay Your Hand": "留一手", "A Truth for a Truth": "以真还真", "Mortal Kindling": "凡性柴薪",
    "End of Hope": "希望断绝", "希望终结": "希望断绝", "希望灭绝": "希望断绝",
    "Amongst the Bleached Bones": "累累白骨之间", "难以承担": "难以推动的巨石",
    "Song of Hopelessness": "无望之歌"
  };
  const canonical = title => aliases[title] || title;
  const ruleKey = title => `level-trait:${canonical(title)}`;
  const titleForCard = (apostle, card) => card?.scope === "c45-common" && Number(card.index) === 2
    ? "累累白骨之间" : !card?.scope ? cards[apostle]?.[`${card.level}_${Number(card.index)}`] || "" : "";
  const isRemoved = (apostle, level, card, group = false) => {
    // Retired asset: ignore stale image inventories as well as saved selections.
    if (apostle === "HYPERTIME_ORACLE" && !card?.scope && card?.level === "IV" && Number(card?.index) === 1) return true;
    const title = titleForCard(apostle, card);
    return !!title && (removals[apostle] || []).some(([minimum, removed]) => level >= minimum && title === removed)
      || (apostle === "TITAN_X" && group && title === "玩弄");
  };
  function defaultShown(apostle, level, card, group = false) {
    if (isRemoved(apostle, level, card, group)) return false;
    if (apostle === "DAHAKA" && !card.scope && card.level === "O" && Number(card.index) === 1) return level === 1;
    if (apostle === "THE_BABELIAN_LUNACY" && card.scope === "c45-common" && Number(card.index) === 2) return level >= 2;
    // These are a condition and a True Wish, not unconditional setup traits.
    if (apostle === "CHIMERA_METASTASIOS" && card.level === "X" && Number(card.index) === 1 && !card.scope) return false;
    if (apostle === "DEMIDJINN" && card.level === "IV" && Number(card.index) === 1 && !card.scope) return false;
    return null;
  }
  const effects = [
    { apostle: "UR_FLEECE", title: "只是一段回忆", card: { level: "I", index: 2 }, kind: "urJustAMemory", tokens: [["AT-.png", false]] },
    { apostle: "THE_NIETZSCJEAN", title: "留一手", kind: "nietzscheStayYourHand", tokens: [["DA-.png", false]] },
    { apostle: "HERMESIAN_PURSUER", title: "玩弄", kind: "pursuerToying", tokens: [["ED-.png", false], ["DA-.png", true]] },
    { apostle: "DAHAKA", title: "悔恨的镣铐", kind: "dahakaShackles", tokens: [["ED-.png", false], ["DA-.png", true]] },
    { apostle: "TITAN_X", title: "玩弄", card: { level: "I", index: 1 }, kind: "titanXToying", tokens: [["ED-.png", false], ["DA-.png", true]] }
  ];
  function isHidden(apostle, title, state) {
    const hidden = new Set(state?.hiddenTraits || []);
    if (hidden.has(ruleKey(title))) return true;
    if (apostle === "THE_BABELIAN_LUNACY" && title === "累累白骨之间"
      && hidden.has("c45-common-COMMON-2-jpg")) return true;
    return Object.entries(cards[apostle] || {}).some(([key, value]) => {
      if (value !== title) return false;
      const [level, index] = key.split("_");
      return hidden.has(`apostle-${level}-${index}-jpg`);
    });
  }
  function stateFor(apostle, level, data, state = {}) {
    const boss = data?.bosses?.[apostle];
    if (!boss?.levels?.[String(level)]) return { available: false, active: [], removed: [], changes: [], reminders: [] };
    const active = new Map(), removed = new Set(), changes = [], reminders = [];
    const rows = Object.values(boss.levels).filter(row => row.level <= level).sort((a, b) => a.level - b.level);
    for (const row of rows) {
      const additions = [];
      for (const raw of row.traitChanges.split("；").map(title => title.trim()).filter(Boolean)) {
        if (raw === "无新增" || raw.startsWith("继承")) continue;
        if (raw.startsWith("移除")) { const name = canonical(raw.replace(/^移除\s*/, "")); active.delete(name); removed.add(name); continue; }
        const title = canonical(raw);
        active.set(title, { title, level: row.level, label: row.label }); additions.push(title);
      }
      for (const [minimum, title] of removals[apostle] || []) {
        if (row.level < minimum) continue;
        active.delete(title); removed.add(title);
      }
      if (additions.length) changes.push({ label: row.label, added: additions });
      if (row.level === level && row.notes) reminders.push(`${row.label}：${row.notes}`);
    }
    if (apostle === "DAHAKA" && level === 1) active.set("恐惧的款待", { title: "恐惧的款待", level: 1, label: "I" });
    const group = apostle === "TITAN_X" && !!state.special?.titanX?.group;
    if (group) { active.delete("玩弄"); removed.add("玩弄"); reminders.push("万事皆休：禁用玩弄与关键一击（Deathblow Crit）。"); }
    const enabled = [...active.values()].filter(trait => !isHidden(apostle, trait.title, state));
    if (enabled.some(trait => ["玩弄", "悔恨的镣铐"].includes(trait.title))) {
      active.delete("希望断绝"); removed.add("希望断绝");
      reminders.push("玩弄／悔恨的镣铐生效时：每命中危险减 1，最低为 1；希望断绝禁用。");
    }
    if (apostle === "THE_NIETZSCJEAN" && level >= 2) reminders.push("时不我待禁用留一手：撤掉其危险−1指示物。");
    if (apostle === "DAHAKA" && level >= 2) reminders.push("移除恐惧的款待，加入 Trojan Ire 与 The Oar（循环 IV 故事书第 171 页）。");
    if (apostle === "DAHAKA" && level >= 3) reminders.push("获得 The Oar 后立即翻面。");
    if (apostle === "DRAGON_OF_PHOBOS" && level >= 4) reminders.push("以假还真替换以真还真；计数阈值改为 3。");
    if (apostle === "UR_FLEECE" && level >= 2) reminders.push("加入 Argo’s Parting Gift、All for All：秘密牌堆 15，卡牌 309、322。");
    if (["DRAGON_OF_PHOBOS", "MEDUKETOS", "UR_FLEECE"].includes(apostle) && level >= 6) {
      reminders.push(`开战氧气：每架泰坦少 ${apostle === "UR_FLEECE" && level >= 8 ? 2 : 1} 枚；按当前特性替换，不累计较低等级的减少量。`);
    }
    if (["DRAGON_OF_PHOBOS", "UR_FLEECE"].includes(apostle) && level >= (apostle === "UR_FLEECE" ? 2 : 5)) reminders.push("心因性中毒：开战在状态牌堆上放 1 枚神浆指示物；按特性处理获得状态卡及带状态卡开始回合的效果。");
    if (apostle === "ICARIAN_HARPY") reminders.push(`急速适应：开战准备 ${level === 1 ? 1 : level === 2 ? 2 : level <= 4 ? 3 : level <= 6 ? 4 : 5} 枚适应指示物，放在适应版板旁。`);
    return { available: true, active: [...active.values()].filter(trait => !isHidden(apostle, trait.title, state)),
      removed: [...removed], changes, reminders: [...new Set(reminders)] };
  }
  function tokenEffects(apostle, level, data, state) {
    const active = new Set(stateFor(apostle, level, data, state).active.map(trait => trait.title));
    return effects.flatMap(effect => effect.tokens.map(([file, perHit]) => ({
      kind: `${effect.kind}${file === "ED-.png" ? "Evasion" : file === "DA-.png" && perHit ? "DangerPerHit" : ""}`,
      file, perHit, count: effect.apostle === apostle && active.has(effect.title) ? 1 : 0
    })));
  }
  function additionalCards(apostle, level) {
    return apostle === "THE_BABELIAN_LUNACY" && level >= 2
      ? [{ type: "TR", scope: "c45-common", level: "COMMON", index: 2, ext: "jpg" }] : [];
  }
  function renderSummary(document, apostle, level, data, state) {
    const box = document.getElementById?.("traitLevelSummary");
    if (!box) return;
    const result = stateFor(apostle, level, data, state);
    box.replaceChildren();
    if (!result.available) {
      const empty = document.createElement("p");
      empty.textContent = "当前等级暂无已核查的特性资料。";
      box.append(empty);
      return;
    }
    const summary = document.createElement("h3");
    const boss = data.bosses[apostle];
    summary.textContent = `${boss.name || apostle} · ${boss.levels[String(level)].label} · ${result.active.length} 项生效${result.removed.length ? ` · ${result.removed.length} 项移除／禁用` : ""}`;
    const active = document.createElement("p");
    active.textContent = `生效：${result.active.map(trait => trait.title).join("；") || "无"}`;
    box.append(summary, active);
    if (result.removed.length) { const removed = document.createElement("p"); removed.textContent = `移除／禁用：${result.removed.join("；")}`; box.append(removed); }
    for (const text of result.reminders) { const item = document.createElement("p"); item.textContent = text; box.append(item); }
  }
  function appendOptions(document, grid, apostle, level, data, state) {
    for (const effect of effects.filter(effect => effect.apostle === apostle && !effect.card)) {
      if (!data?.bosses?.[apostle]?.levels?.[String(level)]) continue;
      const removed = level >= 2;
      const option = document.createElement("label"); option.className = "trait-option trait-rule-option";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox";
      checkbox.dataset.levelTraitRule = ruleKey(effect.title);
      checkbox.dataset.defaultShown = removed ? "" : "1";
      checkbox.checked = !removed && !isHidden(apostle, effect.title, state); checkbox.disabled = removed;
      const text = document.createElement("span");
      text.textContent = `${effect.title} · 大卡内置特性${removed ? "（当前等级已禁用）" : ""}`;
      option.append(checkbox, text); grid.appendChild(option);
    }
  }
  const api = { removals, cards, effects, canonical, ruleKey, titleForCard, isRemoved, defaultShown, stateFor,
    tokenEffects, additionalCards, renderSummary, appendOptions };
  root.AIBP_BOSS_TRAIT_RULES = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
