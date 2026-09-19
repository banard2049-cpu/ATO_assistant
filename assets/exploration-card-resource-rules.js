(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ATO_EXPLORATION_RESOURCE_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Exploration cards whose whole effect is "gain resources" can be settled with
  // one click.  The dataset produced by tools/scan_exploration_resource_cards.py
  // already decided which cards those are; this module evaluates the printed
  // condition badges against the live game state and turns a card into a list of
  // resource changes for the record sheet.

  const KIND_RESOURCE_ONLY = "resource-only";
  const KIND_RESOURCE_PLUS = "resource-plus";
  const KIND_NONE = "none";

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function getDataset(dataset) {
    return isPlainObject(dataset) ? dataset : (typeof window !== "undefined" ? window.ATO_EXPLORATION_CARD_RESOURCES : null);
  }

  function getCard(dataset, cycleId, cardId) {
    const data = getDataset(dataset);
    if (!isPlainObject(data?.cards)) return null;
    return data.cards[`${cycleId}:${cardId}`] || null;
  }

  function cardsForCycle(dataset, cycleId) {
    const data = getDataset(dataset);
    if (!isPlainObject(data?.cards)) return [];
    return Object.values(data.cards).filter((card) => card?.cycleId === cycleId);
  }

  function kindOf(card) {
    return card?.kind || KIND_NONE;
  }

  function isResourceCard(card) {
    return kindOf(card) === KIND_RESOURCE_ONLY;
  }

  function hasResourceEffect(card) {
    return kindOf(card) !== KIND_NONE && Array.isArray(card?.grants) && card.grants.length > 0;
  }

  // ----------------------------------------------------------------------- //
  // conditions
  // ----------------------------------------------------------------------- //

  function diplomacyItems(context) {
    return Array.isArray(context?.diplomacy) ? context.diplomacy.filter((item) => Number.isFinite(Number(item?.bonus))) : [];
  }

  // Returns true (condition holds), false (it does not) or null (the app cannot
  // tell: no faction status recorded, or the card prints a picture badge).
  function conditionMet(condition, context) {
    if (!condition) return true;
    if (condition.type !== "diplomacy") return null;
    const items = diplomacyItems(context);
    if (!items.length) return null;
    const bonus = Number(condition.bonus);
    return items.some((item) => {
      const value = Number(item.bonus);
      if (condition.mode === "atMost") return value <= bonus;
      if (condition.mode === "only") return value === bonus;
      return value >= bonus;
    });
  }

  function conditionLabel(condition) {
    if (!condition) return "";
    return condition.label || condition.badge || "条件";
  }

  function matchingFaction(condition, context) {
    if (!condition || condition.type !== "diplomacy") return null;
    const bonus = Number(condition.bonus);
    return diplomacyItems(context).find((item) => {
      const value = Number(item.bonus);
      if (condition.mode === "atMost") return value <= bonus;
      if (condition.mode === "only") return value === bonus;
      return value >= bonus;
    }) || null;
  }

  // ----------------------------------------------------------------------- //
  // planning
  // ----------------------------------------------------------------------- //

  function grantEntry(grant, condition, context) {
    const faction = matchingFaction(condition, context);
    return {
      resource: grant.resource,
      amount: Number(grant.amount) || 0,
      rareName: grant.rareName || "",
      badge: condition?.badge || "",
      reason: condition
        ? `${conditionLabel(condition)}${faction ? `（${faction.label || faction.id} ${formatBonus(faction.bonus)}）` : ""}`
        : "基础收益",
    };
  }

  function formatBonus(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number > 0 ? `+${number}` : String(number);
  }

  function resolveActiveGrants(card, activeIndexes, context) {
    const grants = Array.isArray(card?.grants) ? card.grants : [];
    const replaced = new Set();
    activeIndexes.forEach((index) => {
      const target = grants[index]?.replaces;
      if (target !== null && target !== undefined) replaced.add(Number(target));
    });
    const result = [];
    activeIndexes.forEach((index) => {
      if (replaced.has(index)) return;
      const grant = grants[index];
      if (!grant || !grant.resource) return;
      result.push(grantEntry(grant, grant.condition, context));
    });
    return result;
  }

  function manualEntries(card, context, variantBadge) {
    const items = Array.isArray(card?.manual) ? card.manual : [];
    return items
      .map((item) => {
        const state = conditionMet(item.condition, context);
        return {
          text: item.text || "",
          badge: item.badge || "",
          applies: state === true,
          unknown: state === null,
          condition: item.condition || null,
          active: state === true || (state === null && (!variantBadge || item.badge === variantBadge)),
        };
      })
      .filter((item) => item.text);
  }

  function variantManual(card, context, variantBadge) {
    return manualEntries(card, context, variantBadge).filter((item) => item.active);
  }

  /**
   * Turn a card into a settlement plan.
   *
   * Returns:
   *   status   "empty" | "auto" | "choice"
   *   grants   resource changes for the automatic plan
   *   manual   effects nobody can apply automatically
   *   variants [{ id, label, badge, grants, manual }] when a printed condition
   *            cannot be resolved from the live state
   */
  function plan(card, context = {}) {
    const grants = Array.isArray(card?.grants) ? card.grants : [];
    const manual = manualEntries(card, context, null);
    if (!grants.length) {
      return {
        status: "empty",
        grants: [],
        manual: manual.filter((item) => item.active),
        variants: [],
        unresolved: [],
        summary: "",
      };
    }

    const activeIndexes = [];
    const unknownIndexes = [];
    grants.forEach((grant, index) => {
      const state = conditionMet(grant.condition, context);
      if (state === true) activeIndexes.push(index);
      else if (state === null && grant.condition) unknownIndexes.push(index);
    });

    const baseGrants = resolveActiveGrants(card, activeIndexes, context);
    if (!unknownIndexes.length) {
      return {
        status: "auto",
        grants: baseGrants,
        manual: manual.filter((item) => item.active),
        variants: [],
        unresolved: [],
        summary: summarize(baseGrants, context),
      };
    }

    const variants = [];
    if (baseGrants.length) {
      variants.push({
        id: "base",
        label: `按基础值结算${baseGrants.length ? `（${summarize(baseGrants, context)}）` : ""}`,
        badge: "",
        grants: baseGrants,
        manual: variantManual(card, context, ""),
      });
    }
    unknownIndexes.forEach((index) => {
      const grant = grants[index];
      const extra = grantEntry(grant, grant.condition, context);
      const variantGrants = resolveActiveGrants(card, [...activeIndexes, index], context);
      // A picture badge has no name to print, so the button only says "卡面图标
      // 条件"; the full description stays in the variant's unresolved entry.
      const shortLabel = grant.condition?.type === "icon"
        ? "卡面图标条件"
        : conditionLabel(grant.condition);
      variants.push({
        id: `grant:${index}`,
        label: `若 ${shortLabel}：${summarize([extra], context)}`,
        badge: grant.condition?.badge || "",
        grants: variantGrants,
        manual: variantManual(card, context, grant.condition?.badge || ""),
      });
    });
    // Every mutually exclusive branch of a diplomacy card is a separate option.
    const seen = new Set();
    const uniqueVariants = variants.filter((variant) => {
      const key = variant.grants.map((grant) => `${grant.resource}x${grant.amount}`).join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      status: "choice",
      grants: baseGrants,
      manual: manual.filter((item) => item.active),
      variants: uniqueVariants,
      unresolved: unknownIndexes.map((index) => ({
        badge: grants[index].condition?.badge || "",
        label: conditionLabel(grants[index].condition),
      })),
      summary: summarize(baseGrants, context),
    };
  }

  function summarize(grants, context) {
    if (!Array.isArray(grants) || !grants.length) return "无资源变化";
    return grants
      .map((grant) => `${grantName(grant, context)} ×${grant.amount}${grant.badge ? `（${grant.badge}）` : ""}`)
      .join("，");
  }

  // Resource names are shown in the record sheet's own wording (zh) whenever the
  // dataset carries it; the raw key is only a last resort.
  function grantName(grant, context) {
    if (grant.rareName) return grant.rareName;
    const dataset = getDataset(context?.dataset);
    const cycleId = context?.cycleId || "";
    const entry = dataset?.cycles?.[cycleId]?.resources?.[grant.resource];
    if (!entry) return grant.resource;
    return entry.zh || entry.en || grant.resource;
  }

  // ----------------------------------------------------------------------- //
  // writing to the record sheet
  // ----------------------------------------------------------------------- //

  function cycleResources(dataset, cycleId) {
    const data = getDataset(dataset);
    return isPlainObject(data?.cycles?.[cycleId]?.resources) ? data.cycles[cycleId].resources : {};
  }

  function storageKeyFor(dataset, cycleId, resourceKey) {
    const entry = cycleResources(dataset, cycleId)[resourceKey];
    if (entry?.storageKey) return entry.storageKey;
    return resourceKey;
  }

  function resourceLabel(dataset, cycleId, resourceKey) {
    const entry = cycleResources(dataset, cycleId)[resourceKey];
    return entry?.zh ? `${entry.zh}（${entry.en}）` : resourceKey;
  }

  // Rare resources are a free-text field on the record sheet, so a second copy
  // is recorded as an appended "×N" instead of a second line.
  function appendRareName(text, name) {
    const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const index = lines.findIndex((line) => line.replace(/\s*×\d+$/, "").trim() === name);
    if (index < 0) {
      lines.push(name);
      return lines.join("\n");
    }
    const current = Number((lines[index].match(/×(\d+)$/) || [])[1] || 1);
    lines[index] = `${name} ×${current + 1}`;
    return lines.join("\n");
  }

  function removeRareName(text, name) {
    const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const index = lines.findIndex((line) => line.replace(/\s*×\d+$/, "").trim() === name);
    if (index < 0) return lines.join("\n");
    const current = Number((lines[index].match(/×(\d+)$/) || [])[1] || 1);
    const next = current - 1;
    if (next <= 0) lines.splice(index, 1);
    else lines[index] = next === 1 ? name : `${name} ×${next}`;
    return lines.join("\n");
  }

  /**
   * Compute the record-sheet changes for a plan without mutating anything.
   * The returned changes are the input of applyChanges()/revertChanges().
   */
  function planChanges(dataset, cycleId, grants) {
    return (Array.isArray(grants) ? grants : []).flatMap((grant) => {
      if (!grant || !grant.resource) return [];
      const storageKey = storageKeyFor(dataset, cycleId, grant.resource);
      const label = resourceLabel(dataset, cycleId, grant.resource);
      if (grant.rareName) {
        return [{
          type: "rare",
          storageKey,
          resource: grant.resource,
          rareName: grant.rareName,
          amount: Math.max(1, Number(grant.amount) || 1),
          label: `${grant.rareName}（稀有资源）`,
        }];
      }
      return [{
        type: "add",
        storageKey,
        resource: grant.resource,
        amount: Number(grant.amount) || 0,
        label,
      }];
    });
  }

  function applyChanges(resources, changes) {
    const next = isPlainObject(resources) ? { ...resources } : {};
    (Array.isArray(changes) ? changes : []).forEach((change) => {
      if (!change) return;
      if (change.type === "rare") {
        next[change.storageKey] = appendRareName(next[change.storageKey], change.rareName);
        return;
      }
      const current = Number(next[change.storageKey] || 0);
      next[change.storageKey] = Math.max(0, current + change.amount);
    });
    return next;
  }

  function revertChanges(resources, changes) {
    const next = isPlainObject(resources) ? { ...resources } : {};
    [...(Array.isArray(changes) ? changes : [])].reverse().forEach((change) => {
      if (!change) return;
      if (change.type === "rare") {
        next[change.storageKey] = removeRareName(next[change.storageKey], change.rareName);
        return;
      }
      const current = Number(next[change.storageKey] || 0);
      next[change.storageKey] = Math.max(0, current - change.amount);
    });
    return next;
  }

  function describeChanges(changes) {
    return (Array.isArray(changes) ? changes : [])
      .map((change) => {
        if (change.type === "rare") return `${change.label} +1`;
        const sign = change.amount >= 0 ? "+" : "";
        return `${change.label}${sign}${change.amount}`;
      })
      .join("，");
  }

  return {
    KIND_RESOURCE_ONLY,
    KIND_RESOURCE_PLUS,
    KIND_NONE,
    getCard,
    cardsForCycle,
    kindOf,
    isResourceCard,
    hasResourceEffect,
    conditionMet,
    conditionLabel,
    plan,
    summarize,
    storageKeyFor,
    resourceLabel,
    planChanges,
    applyChanges,
    revertChanges,
    describeChanges,
    appendRareName,
    removeRareName,
    formatBonus,
  };
});
