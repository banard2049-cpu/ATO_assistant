const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../technology/index.html'), 'utf8').replace(/\r\n/g, '\n');
function fn(name) {
  const match = source.match(new RegExp('^async function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function harness(extra = {}) {
  const node = { id: 'merged', card_indexes: [0, 1] }, page = { key: 'cycle1' };
  const panelOptions = [], snapshots = [];
  const container = { children: [], textContent: '', replaceChildren() { this.children = []; }, appendChild(p) { this.children.push(p); } };
  const ctx = vm.createContext({
    window: { ATO_STRUCTURE_TECH_RULES: { catalog: [{ key: 'mnestis thesis' }] } },
    document: { getElementById: () => container },
    structureTechPanelGeneration: 0, activeAccountId: 'profile-a', currentCycle: 'cycle3',
    activeUnlockedRecord: { page, node }, MAIN_CYCLE_BY_TECH_CYCLE: { cycle1:'c1', cycle3:'c3' },
    campaignSaveTimer:null, campaignSaveInFlight:false, campaignSavePending:false, campaignSaveQueuedBeforeReady:false,
    isStructureNode: () => true,
    cardsForNode: () => [{ key:'unrelated-first-card' }, { key:'mnestis thesis' }],
    technologyActionClient: () => ({ createActionPanel: options => { panelOptions.push(options); return { options }; } }),
    flushCampaignTechnologySave: async () => true,
    unlockedTechSnapshot: () => ({ accountId:'profile-a' }),
    writeSnapshotToMainArchive: async (snapshot, cycleId) => snapshots.push({ snapshot, cycleId }),
    recordStateFromCampaign: campaign => campaign.record,
    refreshExplorationTechLockDisplay() {}, gearRecordState:null, gearRecordUserId:null, gearRecordRevision:0,
    ...extra,
  });
  vm.runInContext(fn('renderStructureTechActions'), ctx);
  return {ctx, node, page, container, panelOptions, snapshots};
}
test('the second card of a merged node exposes its action in the selected campaign cycle', async () => {
  const h=harness();
  await h.ctx.renderStructureTechActions(h.page,h.node);
  assert.equal(h.container.children.length,1);
  const options=h.panelOptions[0];
  assert.equal(options.techKey,'mnestis thesis');
  assert.equal(options.profileId,'profile-a');
  assert.equal(options.cycleId,'c3','viewing a C1 card does not schedule into C1');
  await options.beforeSubmit();
  assert.equal(h.snapshots[0].cycleId,'c3');
  h.ctx.activeAccountId='profile-b';
  assert.throws(options.assertContext,/已切换/);
  await assert.rejects(options.beforeSubmit,/已切换/);
});
test('unsaved technology failure prevents a usable panel and reports the save state', async () => {
  const h=harness({campaignSavePending:true,flushCampaignTechnologySave:async()=>false});
  await h.ctx.renderStructureTechActions(h.page,h.node);
  assert.equal(h.panelOptions.length,0);
  assert.match(h.container.textContent,/尚未保存/);
});
test('a delayed flush cannot populate a detail panel after its profile changes', async () => {
  let release;
  const h=harness({campaignSaveInFlight:true,flushCampaignTechnologySave:()=>new Promise(resolve=>{release=resolve;})});
  const pending=h.ctx.renderStructureTechActions(h.page,h.node);
  h.ctx.activeAccountId='profile-b';release(true);await pending;
  assert.equal(h.panelOptions.length,0);
});
test('normal technology cards do not show an empty automation panel', async () => {
  const h=harness({cardsForNode:()=>[{key:'unrelated-first-card'}]});
  await h.ctx.renderStructureTechActions(h.page,h.node);
  assert.equal(h.container.children.length,0);
});
