const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "aibp", "index.html"),
  "utf8"
);

test("AI X control is exclusive to the Hypertime Oracle", () => {
  assert.match(
    source,
    /id="addOracleAiXButton" class="oracle-only-action">添加AI X<\/button>/
  );
  assert.match(
    source,
    /\.oracle-only-action\s*{\s*display: none;\s*}/
  );
  assert.match(
    source,
    /\.oracle-only-action\.show\s*{\s*display: inline-grid;\s*align-items: center;\s*}/
  );
  assert.match(
    source,
    /const visible = currentApostle === "HYPERTIME_ORACLE";\s+addOracleAiXButton\.classList\.toggle\("show", visible\);/
  );
  assert.match(
    source,
    /if \(currentApostle !== "HYPERTIME_ORACLE" \|\| hasOracleAiXCard\(\)\) return;/
  );
});

test("the Hypertime Oracle special AI X is shown as 3 in card-back previews", () => {
  const functionSource = source.match(
    /function cardBackDisplayLevel\(card\) \{[\s\S]*?\r?\n    \}(?=\r?\n\r?\n    function cardBackImageSrc)/
  )?.[0];
  assert.ok(functionSource, "cardBackDisplayLevel should be present");

  const createDisplayLevel = new Function(
    "currentApostle",
    "levelBack",
    `${functionSource}; return cardBackDisplayLevel;`
  );
  const levelBack = { O: "0", I: "1", II: "2", III: "3", X: "X" };
  const oracleDisplayLevel = createDisplayLevel("HYPERTIME_ORACLE", levelBack);
  const otherDisplayLevel = createDisplayLevel("HEKATON", levelBack);

  assert.equal(oracleDisplayLevel({ type: "AI", level: "X", index: 2 }), "3");
  assert.equal(oracleDisplayLevel({ type: "AI", level: "X", index: 1 }), "X");
  assert.equal(oracleDisplayLevel({ type: "AI", level: "III", index: 2 }), "3");
  assert.equal(otherDisplayLevel({ type: "AI", level: "X", index: 2 }), "X");
  assert.match(
    source,
    /aiBacks: deckBackDisplayText\(state\.AI\.deck \|\| \[\]\)/
  );
  assert.match(
    source,
    /aiBackInfo\.textContent = deckBackDisplayText\(piles\[currentApostle\]\.AI\.deck\)/
  );
});
