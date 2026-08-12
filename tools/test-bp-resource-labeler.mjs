import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestContext = { window: {} };
vm.createContext(manifestContext);
vm.runInContext(
  fs.readFileSync(path.join(root, "tools", "bp-resource-labeler", "card-manifest.js"), "utf8"),
  manifestContext
);

const manifest = manifestContext.window.AIBP_C45_BP_CARD_MANIFEST;
assert.ok(manifest);
assert.equal(manifest.apostles.length, 8);
assert.equal(manifest.cards.length, 144);
assert.equal(manifest.resourcesByCycle.C4.length, 14);
assert.equal(manifest.resourcesByCycle.C5.length, 14);
assert.equal(new Set(manifest.cards.map((card) => card.fileName)).size, 144);
assert.equal(manifest.cards.filter((card) => card.apostle === "DAHAKA").length, 18);
assert.ok(
  manifest.cards
    .filter((card) => card.apostle === "DAHAKA")
    .every((card) => card.fileName.startsWith("DAHAKA_AI_"))
);
assert.equal(manifest.cards.filter((card) => card.apostle === "TITAN_X").length, 18);
assert.ok(
  !manifest.cards.some((card) =>
    card.fileName === "TITAN_X_BP_I_001.jpg"
    || card.fileName === "TITAN_X_BP_II_004.jpg"
  ),
  "Titan X Overstep special cards must not appear in the BP labeler"
);
assert.ok(manifest.cards.every((card) => !card.fileName.includes("_BACK")));

function recordCycleResources(cycle) {
  const source = fs.readFileSync(path.join(root, "record", "index.html"), "utf8");
  const start = source.indexOf(`\n      ${cycle.toLowerCase()}: {`);
  const nextCycle = Number(cycle.slice(1)) + 1;
  const endToken = nextCycle <= 5
    ? `\n      c${nextCycle}: {`
    : "\n    };\n\n    const sharedResourceKeys";
  const end = source.indexOf(endToken, start);
  const block = source.slice(start, end);
  const resourceStart = block.indexOf("\n        resources: [");
  const resourceEnd = block.indexOf("\n        ],\n        events:", resourceStart);
  return [...block.slice(resourceStart, resourceEnd)
    .matchAll(/\["([A-Za-z][A-Za-z0-9]*)",/g)]
    .map((match) => match[1])
    .filter((key) => ![
      "core", "rare", "priests", "echoes", "sisyphusTears", "pygmalionStones"
    ].includes(key));
}

for (const cycle of ["C4", "C5"]) {
  assert.deepEqual(
    Array.from(manifest.resourcesByCycle[cycle], ([key]) => key),
    recordCycleResources(cycle),
    `${cycle} labeler resources must match its record sheet`
  );
}

for (const resourceKey of manifest.resourceKeys) {
  assert.ok(
    fs.existsSync(path.join(
      root,
      "record",
      "assets",
      "resource-icons",
      `${resourceKey}.png`
    )),
    `Missing record resource icon: ${resourceKey}`
  );
}

for (const card of manifest.cards) {
  const imagePath = path.join(root, "aibp", "ps", card.apostle, card.fileName);
  assert.ok(fs.existsSync(imagePath), `Missing card image: ${imagePath}`);
}

const mapContext = { window: {} };
vm.createContext(mapContext);
for (const fileName of [
  "bp_resource_map.js",
  "bp_resource_map_c1_c3.js",
  "bp_resource_map_c4_c5.js"
]) {
  vm.runInContext(
    fs.readFileSync(
      path.join(root, "aibp", "ps", "other", "resouce", fileName),
      "utf8"
    ),
    mapContext
  );
}

for (const apostle of manifest.apostles) {
  assert.ok(
    mapContext.window.AIBP_BP_RESOURCE_MAP[apostle.id],
    `Missing C4-C5 resource map bucket: ${apostle.id}`
  );
  const cards = manifest.cards.filter((card) => card.apostle === apostle.id);
  const mappedCards = mapContext.window.AIBP_BP_RESOURCE_MAP[apostle.id];
  assert.equal(
    Object.keys(mappedCards).length,
    cards.length,
    `${apostle.id} must have a reviewable label for every BP card`
  );
  cards.forEach((card) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(mappedCards, card.fileName),
      `Missing BP resource label: ${card.fileName}`
    );
    const allowedKeys = new Set(
      manifest.resourcesByCycle[card.cycle].map(([key]) => key)
    );
    Object.entries(mappedCards[card.fileName]).forEach(([key, count]) => {
      assert.ok(allowedKeys.has(key), `${card.fileName} uses invalid resource ${key}`);
      assert.ok(Number.isInteger(count) && count > 0, `${card.fileName} has invalid count`);
    });
  });
}
assert.equal(
  mapContext.window.AIBP_C45_BP_RESOURCE_PREFILL,
  true,
  "C4-C5 labels should load as a pending review draft"
);
const dragonMap = mapContext.window.AIBP_BP_RESOURCE_MAP.DRAGON_OF_PHOBOS;
for (let index = 1; index <= 6; index += 1) {
  const suffix = String(index).padStart(3, "0");
  assert.deepEqual(
    { ...dragonMap[`DRAGON_OF_PHOBOS_BP_I_${suffix}.jpg`] },
    { oxidizedAmbrosia: 1 },
    `Dragon of Phobos BP I-${suffix} should use the printed level-I resource`
  );
  assert.equal(
    Object.keys(dragonMap[`DRAGON_OF_PHOBOS_BP_III_${suffix}.jpg`]).length,
    2,
    `Dragon of Phobos BP III-${suffix} should keep both printed resources`
  );
}

const aibpHtml = fs.readFileSync(path.join(root, "aibp", "index.html"), "utf8");
assert.match(aibpHtml, /bp_resource_map_c4_c5\.js/);

const lootSource = fs.readFileSync(
  path.join(root, "aibp", "bp_loot_calculator_addon.js"),
  "utf8"
);

function sourceObject(source, name) {
  const token = `const ${name} = {`;
  const start = source.indexOf(token);
  assert.notEqual(start, -1, `${name} not found`);
  const objectStart = source.indexOf("{", start);
  const end = source.indexOf("\n  };", objectStart);
  assert.notEqual(end, -1, `${name} end not found`);
  return vm.runInNewContext(`(${source.slice(objectStart, end + 4)})`);
}

function sourceSet(source, name) {
  const token = `const ${name} = new Set([`;
  const start = source.indexOf(token);
  assert.notEqual(start, -1, `${name} not found`);
  const arrayStart = source.indexOf("[", start);
  const end = source.indexOf("\n  ]);", arrayStart);
  assert.notEqual(end, -1, `${name} end not found`);
  return new Set(vm.runInNewContext(source.slice(arrayStart, end + 4)));
}

const directRecordKeys = sourceSet(lootSource, "DIRECT_RECORD_RESOURCE_KEYS");
assert.deepEqual(
  new Set(manifest.resourceKeys),
  directRecordKeys,
  "C4-C5 label keys must write directly to record resource fields"
);

const apostleCycles = sourceObject(lootSource, "APOSTLE_RECORD_CYCLE");
for (const apostle of manifest.apostles) {
  assert.equal(apostleCycles[apostle.id], apostle.cycle.toLowerCase());
}

console.log(`Validated ${manifest.cards.length} C4-C5 BP resource-label cards.`);
