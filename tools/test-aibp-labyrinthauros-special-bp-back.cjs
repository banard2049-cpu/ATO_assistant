// 迷宫机牛特殊 BP 卡背显示回归：洗入后必须按普通 BP3 显示，不能暴露为 X。
//
// 运行：node tools/test-aibp-labyrinthauros-special-bp-back.cjs
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "aibp", "index.html"), "utf8");

function extract(name) {
  const start = source.search(new RegExp(`function ${name}\\(`));
  assert.ok(start >= 0, `找不到函数 ${name}`);
  const end = source.indexOf("\n    }", start);
  assert.ok(end > start, `无法截取函数 ${name}`);
  return source.slice(start, end + 6);
}

const ctx = vm.createContext({
  levelBack: { O: "0", I: "1", II: "2", III: "3", X: "X" },
  currentApostle: "LABYRINTHAUROS",
  viewDeckOrderToggle: { checked: true },
});

for (const name of [
  "cardBackDisplayLevel",
  "cardBackImageSrc",
  "deckBackText",
  "deckBackCompositionText",
  "deckBackDisplayText",
]) {
  vm.runInContext(extract(name), ctx);
}

const special = {
  type: "TP",
  level: "X",
  index: 1,
  fileName: "LABYRINTHAUROS_TP_X_001.jpg",
  specialBp: true,
  backLevel: "III",
};
const oldSaved = {
  type: "TP",
  level: "X",
  index: 1,
  fileName: "LABYRINTHAUROS_TP_X_001.jpg",
  specialBp: true,
};
const bp1 = { type: "BP", level: "I", index: 1 };
const bp2 = { type: "BP", level: "II", index: 1 };
const bp3 = { type: "BP", level: "III", index: 1 };

assert.equal(ctx.cardBackDisplayLevel(special), "3");
assert.equal(ctx.cardBackDisplayLevel(oldSaved), "3");
assert.equal(ctx.cardBackDisplayLevel(bp3), "3");
assert.equal(ctx.cardBackDisplayLevel(bp1), "1");
assert.equal(ctx.deckBackText([bp1, special, bp3, bp2]), "1-3-3-2");
assert.equal(ctx.deckBackText([special, bp1]), "3-1");
assert.doesNotMatch(ctx.deckBackText([bp1, special, bp3]), /X/);
assert.equal(ctx.deckBackCompositionText([bp1, special, bp3, bp3]), "1（1×1，3×3）");
assert.doesNotMatch(ctx.deckBackCompositionText([bp1, special, bp3]), /X/);
assert.equal(
  ctx.cardBackImageSrc(special, "ps/LABYRINTHAUROS/LABYRINTHAUROS_TP_X_001.jpg"),
  "ps/LABYRINTHAUROS/LABYRINTHAUROS_BP_III_001_BACK.jpg"
);
assert.equal(
  ctx.cardBackImageSrc(oldSaved, "ps/LABYRINTHAUROS/LABYRINTHAUROS_TP_X_001.jpg"),
  "ps/LABYRINTHAUROS/LABYRINTHAUROS_BP_III_001_BACK.jpg"
);

ctx.viewDeckOrderToggle.checked = false;
assert.match(ctx.deckBackDisplayText([special, bp1, bp3]), /^3（/);
assert.doesNotMatch(ctx.deckBackDisplayText([special, bp1, bp3]), /X/);

console.log("迷宫机牛特殊 BP 卡背显示测试通过：洗入后按 BP3 显示，不暴露为 X");
