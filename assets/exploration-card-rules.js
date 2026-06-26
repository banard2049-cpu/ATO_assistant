(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ATO_EXPLORATION_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeTag(entry = {}) {
    const removal = entry.removal === "permanent"
      ? "permanent"
      : (entry.removal === "remove" ? "remove" : "keep");
    return {
      removal,
      draw: removal !== "keep" || entry.draw === "chain" ? "chain" : "single",
    };
  }

  function drawTwoPiles(drawPile, getTag, makeRecord) {
    const remaining = [...drawPile];
    const piles = [[], []];
    for (let pileIndex = 0; pileIndex < 2; pileIndex += 1) {
      while (remaining.length) {
        const cardId = remaining.shift();
        const tag = normalizeTag(getTag(cardId));
        piles[pileIndex].push(makeRecord(cardId, tag, pileIndex));
        if (tag.draw === "single") break;
      }
    }
    return {
      drawPile: remaining,
      piles,
      incompletePiles: piles.filter((pile) => !pile.length || pile[pile.length - 1]?.draw !== "single").length,
    };
  }

  function settlePiles(piles) {
    const returnIds = [];
    const temporaryRemoved = [];
    const permanentIds = [];
    piles.flat().forEach((entry) => {
      const tag = normalizeTag(entry);
      if (tag.removal === "permanent") permanentIds.push(entry.id);
      else if (tag.removal === "remove") temporaryRemoved.push(entry);
      else returnIds.push(entry.id);
    });
    return { returnIds, temporaryRemoved, permanentIds };
  }

  return { normalizeTag, drawTwoPiles, settlePiles };
});
