(function (root) {
  "use strict";

  let backs = null;
  let pending = null;

  function normalize(payload) {
    if (payload?.version !== 1 || !payload.backs || typeof payload.backs !== "object"
      || Array.isArray(payload.backs)) throw new Error("Invalid card backs");
    const result = Object.create(null);
    for (const [front, back] of Object.entries(payload.backs)) {
      const card = /^ps\/([A-Z][A-Z0-9_]+)\/\1_(AI|BP)_(I|II|III)_(\d{3})\.jpg$/.exec(front);
      const oracleExtra = front === "ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_X_002.jpg";
      let valid = false;
      if (typeof back === "string") {
        if (oracleExtra) valid = back === "ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_III_SPECIAL_BACK.jpg";
        else if (card) {
          const base = `ps/${card[1]}/${card[1]}_${card[2]}_${card[3]}`;
          valid = card[1] === "DRAGON_OF_PHOBOS" && card[2] === "BP"
            ? back === `${base}_${card[4]}_BACK.jpg`
            : back === `${base}_BACK.jpg`
              || (card[2] === "AI" && card[3] === "III" && back === `${base}_SPECIAL_BACK.jpg`);
        }
      }
      if (!valid) throw new Error("Invalid card back path");
      result[front] = back;
    }
    if (!Object.keys(result).length) throw new Error("Empty card backs");
    return Object.freeze(result);
  }

  function ready() {
    if (backs) return Promise.resolve(backs);
    if (pending) return pending;
    const controller = new root.AbortController();
    const timer = root.setTimeout(() => controller.abort(), 10000);
    pending = Promise.resolve().then(() => root.fetch("card-backs.json", {
      signal: controller.signal, cache: "no-cache"
    })).then(async (response) => {
      if (!response.ok) throw new Error("Card backs unavailable");
      backs = normalize(await response.json());
      return backs;
    }).finally(() => {
      root.clearTimeout(timer);
      // Failed loads can be retried the next time a card needs its back.
      pending = null;
    });
    return pending;
  }

  root.AibpCardBacks = {
    ready,
    backFor: (front) => typeof front === "string" ? backs?.[front.replace(/[?#].*$/, "")] || null : null,
  };
})(window);
