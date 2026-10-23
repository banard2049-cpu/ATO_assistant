const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("index.html", "utf8");
const start = source.indexOf("    function beginSurveyConstantInteraction(");
const end = source.indexOf("    function createSurveyConstantCard(", start);
assert(start >= 0 && end > start, "Hub checkbox handler was not found");

const events = [];
const state = {
  day: 1,
  surveyConstants: { hubs: {}, rr: {}, activeHub: null, activeRr: null },
};
let saved = null;
let rendered = false;
let resolveHeroPrompt;
const heroPrompt = new Promise((resolve) => { resolveHeroPrompt = resolve; });
const context = {
  state,
  Date,
  Map,
  Promise,
  queueMicrotask,
  surveyConstantInteractionVersions: new Map(),
  surveyConstantMnemosSyncPending: 0,
  surveyConstantExternalSyncDeferred: false,
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
    return heroPrompt;
  },
  saveState: () => { saved = Boolean(state.surveyConstants.hubs.hub?.alpha); events.push("save"); },
  renderFlow: () => { rendered = Boolean(state.surveyConstants.hubs.hub?.alpha); events.push("render"); },
};
vm.createContext(context);
vm.runInContext(`let surveyConstantInteractionVersions = new Map();
let surveyConstantMnemosSyncPending = 0;
let surveyConstantExternalSyncDeferred = false;
${source.slice(start, end)}
setSurveyConstant("hubs", "hub", "alpha", true);`, context);

assert.deepEqual(events, ["save", "render", "record broadcast", "record sync", "hero prompt"]);
assert.equal(state.surveyConstants.hubs.hub.alpha, true);

// Reproduce an external dashboard refresh replacing `state` after the checkbox
// had been rendered but before the user confirmed the hero memory prompt.
state.surveyConstants = { hubs: {}, rr: {}, activeHub: null, activeRr: null };
resolveHeroPrompt();

const finish = async () => {
  await heroPrompt;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(state.surveyConstants.hubs.hub.alpha, true, "Confirmed mnemos flow must not clear the survey checkbox");
  assert.equal(state.surveyConstants.activeHub.itemId, "hub");
  assert.equal(state.surveyConstants.activeHub.boxId, "alpha");
  assert.equal(saved, true);
  assert.equal(rendered, true);

  vm.runInContext('setSurveyConstant("hubs", "hub", "alpha", false);', context);
  assert.equal(saved, false);
  assert.equal(rendered, false);
  assert.equal(state.surveyConstants.hubs.hub, undefined);
  assert.equal(events.filter((event) => event === "hero prompt").length, 1);

  // Also cover a dashboard reread that started before the checkbox flow but
  // returns while the mnemos prompt is active.
  const syncStart = source.indexOf("    async function syncDashboardFromExternalUpdate(");
  const syncEnd = source.indexOf("    function createDefaultCycles(", syncStart);
  assert(syncStart >= 0 && syncEnd > syncStart, "Dashboard external-sync function was not found");
  let resolveRead;
  let reads = 0;
  const syncContext = vm.createContext({
    campaignRestoreInFlight: false,
    campaignStorageAvailable: true,
    campaignConflictReloading: false,
    campaignSaveInFlight: false,
    campaignExternalSyncInFlight: false,
    surveyConstantMnemosSyncPending: 0,
    surveyConstantExternalSyncDeferred: false,
    campaignSessionEpoch: 1,
    campaignSectionRevision: 1,
    campaignExternalSyncPending: false,
    readLatestDashboardSection: () => {
      reads += 1;
      return new Promise((resolve) => { resolveRead = resolve; });
    },
  });
  vm.runInContext(source.slice(syncStart, syncEnd), syncContext);
  const pendingSync = syncContext.syncDashboardFromExternalUpdate();
  assert.equal(reads, 1);
  syncContext.surveyConstantMnemosSyncPending = 1;
  resolveRead({ revision: 2 });
  await pendingSync;
  assert.equal(syncContext.surveyConstantExternalSyncDeferred, true);

  console.log("Hub checkbox survives async hero prompts and external refreshes.");
};

void finish();
