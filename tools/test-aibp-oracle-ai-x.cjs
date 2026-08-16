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
