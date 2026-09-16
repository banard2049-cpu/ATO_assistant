const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "aibp", "index.html"), "utf8");
// aibp/index.html 是 CRLF 换行，正则里的换行必须写成 \r?\n：早先的 \n 版本永远匹配
// 不上（源文件里是 "];\r\n    const tokenBasePath"），assert 直接抛错把整个文件掐死，
// 下面四个用例一个都没跑过 —— 于是这条回归测试长期是「哑巴测试」。
// 收尾锚在数组自己的 "\n    ];  + const tokenBasePath" 上，不会误抓到别的数组。
const match = source.match(/const cycleTraitCards = (\[[\s\S]*?\r?\n    \]);\r?\n    const tokenBasePath/);

assert.ok(match, "cycleTraitCards should be present in aibp/index.html");
const cards = JSON.parse(JSON.stringify(vm.runInNewContext(match[1])));

function availableFor(cycle) {
  return cards.filter((card) => card.cycle === cycle || card.cycles?.includes(cycle));
}

test("C4 receives six cursed traits and two shared traits", () => {
  const c4Cards = availableFor("c4");
  assert.equal(c4Cards.length, 8);
  assert.equal(c4Cards.filter((card) => card.scope === "c4-cursed").length, 6);
  assert.equal(c4Cards.filter((card) => card.scope === "c45-common").length, 2);
});

test("C5 receives two exclusive traits and two C4-C5 shared traits", () => {
  const c5Cards = availableFor("c5");
  assert.equal(c5Cards.length, 4);
  assert.equal(c5Cards.filter((card) => card.scope === "c5-exclusive").length, 2);
  assert.equal(c5Cards.filter((card) => card.scope === "c45-common").length, 2);
});

test("earlier cycles do not receive the C4-C5 trait set", () => {
  assert.equal(availableFor("c1").length, 0);
  assert.equal(availableFor("c2").length, 0);
  assert.equal(availableFor("c3").length, 0);
});

test("all cycle trait card images exist", () => {
  cards.forEach((card) => {
    assert.ok(
      fs.existsSync(path.join(root, "aibp", "ps", "other", "trait", card.fileName)),
      `missing ${card.fileName}`
    );
  });
});
