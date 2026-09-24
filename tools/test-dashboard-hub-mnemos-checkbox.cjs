const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("index.html", "utf8");
const start = source.indexOf("    function setSurveyConstant(");
const end = source.indexOf("    function createSurveyConstantCard(", start);
assert(start >= 0 && end > start, "Hub checkbox handler was not found");

const events = [];
const state = {
  day: 1,
  surveyConstants: { hubs: {}, rr: {}, activeHub: null, activeRr: null },
};
let saved = null;
let rendered = false;
const context = {
  state,
  Date,
  ensureTodaySurveyConstants() {},
  surveyConstantsDayKey: () => "c1:1",
  currentCycleConfig: () => ({ id: "c1" }),
  normalizeCampaignDay: (day) => day,
  setNextBattleTerrainFromHub() {},
  clearNextBattleTerrainForHub() {},
  getCurrentSurveyConstantData: () => ({ hubs: [{ id: "hub", title: "Hub", boxes: [["alpha", "α", "Entry", "fate"]] }] }),
  findSurveyHub: (data, id) => data.hubs.find((hub) => hub.id === id),
  firstCheckedSurveyHubTarget: () => null,
  firstCheckedSurveyRrTarget: () => null,
  recordSyncChannel: { postMessage: () => events.push("record broadcast") },
  syncSurveyAdventureToArgoRecord: () => { events.push("record sync"); },
  applyMnemosTagToHeroes: () => {
    events.push("hero prompt");
    assert.equal(saved, true, "Hub checkbox was not saved before the hero prompt");
    assert.equal(rendered, true, "Hub checkbox was not redrawn before the hero prompt");
  },
  saveState: () => { saved = Boolean(state.surveyConstants.hubs.hub?.alpha); events.push("save"); },
  renderFlow: () => { rendered = Boolean(state.surveyConstants.hubs.hub?.alpha); events.push("render"); },
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}\nsetSurveyConstant("hubs", "hub", "alpha", true);`, context);

assert.deepEqual(events, ["save", "render", "record broadcast", "record sync", "hero prompt"]);
assert.equal(state.surveyConstants.hubs.hub.alpha, true);

vm.runInContext('setSurveyConstant("hubs", "hub", "alpha", false);', context);
assert.equal(saved, false);
assert.equal(rendered, false);
assert.equal(state.surveyConstants.hubs.hub, undefined);
assert.equal(events.filter((event) => event === "hero prompt").length, 1);

console.log("Hub checkbox is saved and redrawn before hero memory prompts.");
