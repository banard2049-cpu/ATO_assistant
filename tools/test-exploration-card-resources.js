const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rules = require("../assets/exploration-card-resource-rules.js");

function loadDataset() {
  const file = path.join(__dirname, "..", "assets", "exploration-card-resources.js");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  return sandbox.window.ATO_EXPLORATION_CARD_RESOURCES;
}

const dataset = loadDataset();
const friendly = { cycleId: "c1", diplomacy: [{ id: "minoians", label: "米诺斯人", bonus: 1 }] };
const allied = { cycleId: "c1", diplomacy: [{ id: "minoians", label: "米诺斯人", bonus: 2 }] };
const neutral = { cycleId: "c1", diplomacy: [{ id: "minoians", label: "米诺斯人", bonus: 0 }] };
const denounced = { cycleId: "c1", diplomacy: [{ id: "minoians", label: "米诺斯人", bonus: -2 }] };
const noDiplomacy = { cycleId: "c1", diplomacy: [] };

// --- card classification -------------------------------------------------- //
const tradePost = rules.getCard(dataset, "c1", "6404");
assert.equal(tradePost.kind, "resource-only", "贸易站是纯资源卡");
assert.equal(rules.isResourceCard(tradePost), true);

const shipyard = rules.getCard(dataset, "c1", "6422");
assert.equal(shipyard.kind, "resource-plus", "造船厂带其它效果，只做部分结算");
assert.equal(rules.isResourceCard(shipyard), false);

const cackle = rules.getCard(dataset, "c1", "6436");
assert.equal(cackle.kind, "none", "咯咯笑不是资源卡");

// --- an unconditional card settles in one click ---------------------------- //
const fleet = rules.plan(rules.getCard(dataset, "c1", "6417"), noDiplomacy);
assert.equal(fleet.status, "auto");
assert.deepEqual(fleet.grants.map((grant) => [grant.resource, grant.amount]), [["trireme", 3]]);

// --- "Friendly+" replaces the base amount --------------------------------- //
const friendlyTrade = rules.plan(tradePost, friendly);
assert.equal(friendlyTrade.status, "auto", "有外交状态时可直接结算");
assert.deepEqual(friendlyTrade.grants.map((grant) => [grant.resource, grant.amount]), [["trireme", 2]]);

const denouncedTrade = rules.plan(tradePost, denounced);
assert.deepEqual(denouncedTrade.grants.map((grant) => grant.amount), [1], "Denounced 时回到基础值");

const unknownTrade = rules.plan(tradePost, noDiplomacy);
assert.equal(unknownTrade.status, "choice", "没有外交记录时必须让玩家选分支");
assert.equal(unknownTrade.variants.length, 2);
assert.deepEqual(unknownTrade.variants[0].grants.map((grant) => grant.amount), [1]);
assert.deepEqual(unknownTrade.variants[1].grants.map((grant) => grant.amount), [2]);

// --- "Denounced-" reduces the base amount --------------------------------- //
const weaponsCache = rules.getCard(dataset, "c1", "6411");
assert.deepEqual(rules.plan(weaponsCache, friendly).grants.map((grant) => grant.amount), [2]);
assert.deepEqual(rules.plan(weaponsCache, denounced).grants.map((grant) => grant.amount), [1]);
// "Friendly" does not satisfy "Allied".
const oldArmory = rules.getCard(dataset, "c1", "6418");
assert.deepEqual(rules.plan(oldArmory, friendly).grants.map((grant) => grant.amount), [3]);
assert.deepEqual(rules.plan(oldArmory, allied).grants.map((grant) => grant.amount), [4]);

// --- manual effects follow their badge ------------------------------------ //
const fishingPier = rules.getCard(dataset, "c1", "6406");
const pierFriendly = rules.plan(fishingPier, friendly);
assert.equal(pierFriendly.status, "auto");
assert.deepEqual(pierFriendly.grants.map((grant) => grant.amount), [2]);
assert.equal(pierFriendly.manual.length, 0, "友善时 Denounced- 的额外效果不生效");

const pierDenounced = rules.plan(fishingPier, denounced);
assert.equal(pierDenounced.manual.length, 1, "Denounced 时需要人工处理额外效果");
assert.match(pierDenounced.manual[0].text, /Chosen Argonaut/);

// --- diplomacy menu cards pick the matching branch ------------------------ //
const mingoanFleet = rules.getCard(dataset, "c1", "6401");
assert.equal(mingoanFleet.diplomacyMenu, true);
const fleetFriendly = rules.plan(mingoanFleet, friendly);
assert.deepEqual(fleetFriendly.grants.map((grant) => [grant.resource, grant.amount]), [["trireme", 4]]);
assert.ok(!fleetFriendly.manual.some((item) => item.badge === "Denounced"), "未命中的分支不该出现在待办里");

const fleetNeutral = rules.plan(mingoanFleet, neutral);
assert.equal(fleetNeutral.grants.length, 0, "中立分支没有资源收益");
assert.ok(fleetNeutral.manual.some((item) => item.badge === "Neutral"));

// --- rare resources ------------------------------------------------------- //
const sirenTemple = rules.getCard(dataset, "c3", "13511");
const sirenAllied = rules.plan(sirenTemple, { cycleId: "c3", diplomacy: [{ id: "sunheirs", label: "太阳后裔", bonus: 2 }] });
assert.equal(sirenAllied.status, "auto");
assert.deepEqual(sirenAllied.grants.map((grant) => [grant.resource, grant.amount]), [["sirenshell", 3], ["rare", 1]]);

const changes = rules.planChanges(dataset, "c3", sirenAllied.grants);
assert.deepEqual(changes.map((change) => change.type), ["add", "rare"]);
assert.equal(changes[1].rareName, "Antedeluvian Sirenshell");
assert.equal(changes[1].storageKey, "rare", "稀有资源在所有循环共用同一个字段");

const withRare = rules.applyChanges({ "c3-sirenshell": 2 }, changes);
assert.equal(withRare["c3-sirenshell"], 5);
assert.equal(withRare.rare, "Antedeluvian Sirenshell");
const twice = rules.applyChanges(withRare, changes);
assert.equal(twice.rare, "Antedeluvian Sirenshell ×2");
assert.deepEqual(rules.revertChanges(twice, changes), withRare, "撤销要完全还原");

// --- a picture badge cannot be judged, so both branches stay available ------ //
const mineshaft = rules.getCard(dataset, "c2", "13603");
const mineshaftPlan = rules.plan(mineshaft, { cycleId: "c2", diplomacy: [] });
assert.equal(mineshaftPlan.status, "choice");
assert.deepEqual(mineshaftPlan.grants.map((grant) => grant.amount), [1], "基础值仍然可以一键结算");
assert.equal(mineshaftPlan.variants.length, 2);
assert.match(mineshaftPlan.variants[1].label, /卡面图标条件/, "图标条件的按钮标题要短");
assert.deepEqual(mineshaftPlan.variants[1].grants.map((grant) => grant.amount), [2]);

// --- record write path ---------------------------------------------------- //
const triremeChanges = rules.planChanges(dataset, "c1", rules.plan(tradePost, friendly).grants);
assert.equal(triremeChanges[0].storageKey, "c1-trireme", "c1 专属资源带循环前缀");
const fearChanges = rules.planChanges(dataset, "c2", [{ resource: "fearEssence", amount: 2 }]);
assert.equal(fearChanges[0].storageKey, "fearEssence", "跨循环共用资源不带前缀");

const record = rules.applyChanges({ "c1-trireme": 3 }, triremeChanges);
assert.equal(record["c1-trireme"], 5);
assert.equal(rules.revertChanges(record, triremeChanges)["c1-trireme"], 3);
assert.equal(rules.describeChanges(triremeChanges), "船材（Trireme）+2");

// --- dataset integrity ----------------------------------------------------- //
const cards = Object.values(dataset.cards);
assert.equal(cards.length, 222, "五个循环的探索卡全部扫过");
for (const card of cards) {
  const catalog = dataset.cycles[card.cycleId].resources;
  for (const grant of card.grants) {
    assert.ok(catalog[grant.resource], `${card.key} 的资源 ${grant.resource} 必须在记录表 ${card.cycleId} 资源表里`);
    if (grant.replaces !== null && grant.replaces !== undefined) {
      assert.ok(Number.isInteger(grant.replaces) && grant.replaces >= 0 && grant.replaces < card.grants.length,
        `${card.key} 的 replaces 下标必须指向本卡的收益`);
      assert.notEqual(grant.replaces, card.grants.indexOf(grant), `${card.key} 不能替换自己`);
    }
  }
  if (card.kind === "resource-only") {
    assert.equal(card.manual.length, 0, `${card.key} 标为纯资源卡就不能有待办效果`);
    assert.equal(card.unresolved.length, 0);
  }
  if (card.kind === "none") assert.equal(card.grants.length, 0);
}

const counts = cards.reduce((acc, card) => {
  acc[card.kind] = (acc[card.kind] || 0) + 1;
  return acc;
}, {});
assert.deepEqual(counts, { "resource-only": 38, "resource-plus": 102, none: 82 });

console.log("exploration-card-resource-rules tests passed");
