const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const match = html.match(/const apostleLevelBonusConfig = (\{[\s\S]*?\n    \});/);

assert.ok(match, "apostleLevelBonusConfig should be present in index.html");
const config = JSON.parse(JSON.stringify(vm.runInNewContext(`(${match[1]})`)));

test("C4-C5 apostle level bonuses match the campaign panels", () => {
  assert.deepEqual(config.MIDASCORE, {
    3: { promotions: 1, danger: 1, at: 0 },
    4: { promotions: 2, danger: 1, at: 1 }
  });
  assert.deepEqual(config.DEMIDJINN, {
    3: { promotions: 1, danger: 1, at: 0 },
    4: { promotions: 2, danger: 1, at: 1 }
  });
  assert.deepEqual(config.THE_BABELIAN_LUNACY, {
    1: { promotions: 1, danger: 0, at: 0 }
  });
  assert.deepEqual(config.DAHAKA, {
    1: { promotions: 1, danger: 0, at: 0 }
  });
  assert.deepEqual(config.DRAGON_OF_PHOBOS, {
    2: { promotions: 1, danger: 0, at: 0 },
    3: { promotions: 1, danger: 1, at: 0 },
    4: { promotions: 2, danger: 1, at: 1 }
  });
  assert.deepEqual(config.MEDUKETOS, {
    2: { promotions: 1, danger: 0, at: 0 },
    3: { promotions: 1, danger: 1, at: 0 },
    4: { promotions: 2, danger: 1, at: 1 }
  });
  assert.deepEqual(config.UR_FLEECE, {});
  assert.deepEqual(config.TITAN_X, {
    1: { promotions: 1, danger: 0, at: 0 }
  });
});
