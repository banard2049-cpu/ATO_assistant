(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ATO_INVESTIGATION_RULES = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  // Transcribed from each card's rules side. These are reminders beside the
  // Adventure Hubs Table; showing them never pays a cost or records a use.
  const catalog = [
    { key: "minoan investigations", costLabel: "免费", text: "可重掷冒险中枢总表一次。" },
    { key: "spartan investigations", costLabel: "免费", text: "冒险中枢总表掷骰后，可改为结算所掷冒险上一行的冒险。" },
    { key: "delphian investigations", costLabel: "免费", text: "冒险中枢总表掷骰后，可改为结算所掷冒险下一行的冒险。" },
    { key: "persian investigations", costLabel: "命运 +1 / 巴比伦债务 +1", text: "命运 +1：重掷冒险中枢总表；或巴比伦债务 +1：直接选择冒险中枢。" },
    { key: "atlantean investigations", costLabel: "命运 +1", text: "命运 +1：为冒险中枢总表掷两次并选择一个结果（一次）；若两次结果相同，改为任选一个冒险中枢。" },
  ];
  const key = value => String(value || "").trim().toLowerCase();
  function reminders(ctx = {}, helpers = {}) {
    const eligibility = helpers.eligibility || root.ATO_STRUCTURE_TECH_RULES?.eligibility;
    if (typeof eligibility !== "function") return [];
    const hidden = new Set((ctx.technology?.unimportant || ctx.technology?.unimportantKeys || [])
      .map(value => key(value && typeof value === "object" ? value.key : value)));
    return catalog.flatMap(rule => {
      const eligible = eligibility(ctx, rule.key);
      if (!eligible?.ok) return [];
      const card = eligible.card;
      // As with Save and map-progress reminders, "unimportant" hides the hint
      // without changing whether the technology is owned or usable.
      if (hidden.has(rule.key) || hidden.has(key(card.key))
        || (card.tree_nodes || card.nodes || []).some(node => hidden.has(`${rule.key}@@${node.page}`))) return [];
      return [{ techKey: rule.key, title: card.names?.zh || card.names?.en || rule.key,
        costLabel: rule.costLabel, text: rule.text }];
    });
  }
  return { version: 1, catalog: catalog.map(rule => ({ ...rule })), reminders };
});
