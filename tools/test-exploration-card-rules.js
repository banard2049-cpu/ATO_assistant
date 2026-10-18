const assert = require("node:assert/strict");
const rules = require("../assets/exploration-card-rules.js");

const tags = {
  a: { removal: "remove" },
  b: { removal: "keep", draw: "chain" },
  c: { removal: "keep", draw: "single" },
  d: { removal: "permanent" },
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
assert.equal(result.piles[0][0].draw, "chain", "旧移出标签未指定抽取类型时默认连抽");
assert.equal(result.piles[1][0].draw, "chain", "旧永久移出标签未指定抽取类型时默认连抽");
assert.deepEqual(rules.normalizeTag({ removal: "remove", draw: "single" }), { removal: "remove", draw: "single" });

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
