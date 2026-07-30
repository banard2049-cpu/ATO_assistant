import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function element() {
  return {
    style: {},
    dataset: {},
    appendChild() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

const titleActions = element();
const document = {
  readyState: "complete",
  head: element(),
  body: element(),
  createElement: element,
  getElementById() { return null; },
  querySelector(selector) {
    return selector === ".title-actions" ? titleActions : null;
  },
};

const context = {
  console,
  document,
  localStorage: {
    getItem() { return null; },
    setItem() {},
  },
  currentApostle: "",
  piles: {},
  cardFileName(card, apostle) {
    if (card.fileName) return card.fileName;
    const index = String(card.index || 1).padStart(3, "0");
    return `${apostle}_${card.type}_${card.level}_${index}.jpg`;
  },
  cardSrc() { return ""; },
};
context.window = context;
vm.createContext(context);

for (const fileName of [
  "bp_resource_map.js",
  "bp_resource_map_c1_c3.js",
  "bp_resource_map_c4_c5.js",
]) {
  vm.runInContext(
    fs.readFileSync(
      path.join(root, "aibp", "ps", "other", "resouce", fileName),
      "utf8"
    ),
    context
  );
}
vm.runInContext(
  fs.readFileSync(path.join(root, "aibp", "bp_loot_calculator_addon.js"), "utf8"),
  context
);

function calculate(apostle, card, level) {
  context.currentApostle = apostle;
  context.piles[apostle] = {
    BP: {
      deck: [],
      discard: [],
      damage: [card],
      damage1: [],
      damage2: [],
      supply: { I: [], II: [], III: [] },
    },
  };
  return context.AIBP_calculateBpLoot({ recordMultiplier: level });
}

let result = calculate(
  "MIDASCORE",
  { type: "BP", level: "I", index: 1 },
  3
);
assert.equal(result.resourceMultiplier, 3);
assert.equal(result.totals.mutableAmbrosia, 6);
assert.deepEqual(
  { ...result.details.levelBonus[0].resource },
  { mutableAmbrosia: 3 }
);

result = calculate(
  "DEMIDJINN",
  { type: "BP", level: "I", index: 1 },
  3
);
assert.equal(result.resourceMultiplier, 3);
assert.equal(result.totals.mutableAmbrosia, 6);

result = calculate(
  "MIDASCORE",
  { type: "BP", level: "I", index: 1 },
  6
);
assert.equal(result.resourceMultiplier, 6);
assert.equal(result.totals.mutableAmbrosia, 18);

result = calculate(
  "THE_BABELIAN_LUNACY",
  { type: "BP", level: "I", index: 2 },
  6
);
assert.equal(result.resourceMultiplier, 1);
assert.equal(result.totals.mutableAmbrosia, 2);
assert.equal(result.details.levelBonus.length, 0);

result = calculate(
  "DRAGON_OF_PHOBOS",
  { type: "BP", level: "I", index: 1 },
  4
);
assert.equal(result.resourceMultiplier, 4);
assert.equal(result.totals.oxidizedAmbrosia, 16);

result = calculate(
  "MEDUKETOS",
  { type: "BP", level: "I", index: 1 },
  4
);
assert.equal(result.resourceMultiplier, 4);
assert.equal(result.totals.oxidizedAmbrosia, 16);

result = calculate(
  "UR_FLEECE",
  { type: "BP", level: "I", index: 3 },
  5
);
assert.equal(result.resourceMultiplier, 1);
assert.equal(result.totals.oxidizedAmbrosia, 2);
assert.equal(result.totals.fadingLightConstruct, 1);

result = calculate(
  "TITAN_X",
  { type: "BP", level: "I", index: 2 },
  9
);
assert.equal(result.resourceMultiplier, 1);
assert.equal(result.totals.orichalcumAlloy, 1);

result = calculate(
  "DAHAKA",
  {
    type: "AI",
    level: "III",
    bpLevel: "III",
    index: 4,
    combinedAibp: true,
    fileName: "DAHAKA_AI_III_004.jpg",
  },
  8
);
assert.equal(result.resourceMultiplier, 1);
assert.equal(result.totals.ireEssence, 3);
assert.equal(result.totals.core, 1);

console.log("C4-C5 BP loot multipliers and level bonuses verified.");
