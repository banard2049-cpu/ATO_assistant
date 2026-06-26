const assert = require("node:assert/strict");
const rules = require("../assets/exploration-card-rules.js");

const tags = {
  a: { removal: "remove", draw: "single" },
  b: { removal: "keep", draw: "chain" },
  c: { removal: "keep", draw: "single" },
  d: { removal: "permanent", draw: "single" },
  e: { removal: "keep", draw: "single" },
};

const result = rules.drawTwoPiles(
  ["a", "b", "c", "d", "e"],
  (id) => tags[id],
  (id, tag, pile) => ({ id, ...tag, pile })
);

assert.deepEqual(result.piles.map((pile) => pile.map((card) => card.id)), [
  ["a", "b", "c"],
  ["d", "e"],
]);
assert.equal(result.incompletePiles, 0);
assert.deepEqual(result.drawPile, []);
assert.equal(result.piles[0][0].draw, "chain", "移出牌必须自动连抽");
assert.equal(result.piles[1][0].draw, "chain", "永久移出牌必须自动连抽");

const settled = rules.settlePiles(result.piles);
assert.deepEqual(settled.returnIds, ["b", "c", "e"]);
assert.deepEqual(settled.temporaryRemoved.map((card) => card.id), ["a"]);
assert.deepEqual(settled.permanentIds, ["d"]);

const shortDeck = rules.drawTwoPiles(
  ["b"],
  (id) => tags[id],
  (id, tag, pile) => ({ id, ...tag, pile })
);
assert.equal(shortDeck.incompletePiles, 2);

console.log("exploration-card-rules tests passed");
