const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../aibp/index.html"), "utf8");
function entryFunction(name) {
  const match = source.match(new RegExp(`    (?:async )?function ${name}\\([^]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}

test("Helios defaults to C4 while explicit numeric levels keep the regular panel", () => {
  for (const [override, expected] of [[undefined, "c4"], ["normal", "c4"], ["c4", "c4"], [1, "normal"], [5, "normal"], ["10", "normal"]]) {
    const mode = vm.runInNewContext(`${entryFunction("heliosMode")}\nheliosMode();`, {
      theatreBattle: null,
      apostleLevelOverrides: { HELIOS: override },
    });
    assert.equal(mode, expected);
  }
});

test("Helios level selector shows the default C4 and preserves explicit numeric choices", () => {
  for (const [override, expected] of [[undefined, "c4"], ["normal", "c4"], ["c4", "c4"], [5, "5"]]) {
    const select = { options: [{ value: "", textContent: "" }, { value: "5" }, { value: "c4" }] };
    vm.runInNewContext(`${entryFunction("heliosMode")}\n${entryFunction("renderApostleLevelSelectOptions")}\nrenderApostleLevelSelectOptions();`, {
      theatreBattle: null,
      apostleLevelSelect: select, currentApostle: "HELIOS", heliosAccessGranted: true,
      apostleLevelOverrides: { HELIOS: override }, recordApostleLevels: {}, fixedLevelOneApostles: new Set(),
    });
    assert.equal(select.value, expected);
    assert.equal(select.options[0].textContent, "默认 C4 · Old Haunt");
    assert.equal(select.options[2].hidden, false);
  }
});

test("Searching Helios opens C4 and persists it for the next visit", async () => {
  const overrides = {};
  const calls = [];
  const context = {
    theatreRequest: null,
    SECRET_ENTRIES: { normal: { unlockKey: () => "unlocked", granted: () => true } },
    heliosSearchInFlight: false,
    readCurrentHeliosCampaign: async () => ({}),
    activeDashboardCycleFromCampaign: () => ({ cycleId: "c4" }), syncHeliosAccess() {},
    window: { AIBP_BOSS_SEARCH: { canUnlockCycle: () => true } },
    bossSearchInput: { value: "赫利俄斯" }, bossSearchResults: { replaceChildren() {} },
    apostleLevelOverrides: overrides,
    storeHeliosMode: (mode) => calls.push(mode), saveApostleLevelOverrides() {}, ensureHeliosModeOptions() {},
    renderApostle: (name) => calls.push(name),
  };
  await vm.runInNewContext(`${entryFunction("searchSecret")}\nsearchSecret("normal");`, context);
  assert.equal(overrides.HELIOS, "c4");
  assert.deepEqual(calls, ["c4", "HELIOS"]);
  assert.equal(context.heliosSearchInFlight, false);
});
