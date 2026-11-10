const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { profileSection } = require('../technology/structure-tech-client.js');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rulesScripts = Array.from(source.matchAll(/<script src="\.\/((?:assets\/exploration-card-(?:resource-rules|effects)|technology\/voyage-action-rules)\.js)\?[^"]+"/g),
  ([, file]) => new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }));
const copy = value => JSON.parse(JSON.stringify(value));
function loadFunctions(names) {
  return names.map(name => source.match(new RegExp(`^    (?:async )?function ${name}\\([^]*?^    }`, 'm'))[0]).join('\n');
}
const functions = loadFunctions([
  'markCurrentMapTileExplored', 'c3LoopLength', 'c3LoopEndDay', 'explorationDashboardTracks', 'syncExplorationDashboardTracks',
  'explorationRecordSection', 'syncDashboardMapSnapshot', 'explorationResourceRules', 'explorationEffectRules',
  'createC3TimeLoopTools', 'commitC3TimeLoop', 'adjustC3TimeLoop', 'settleC3TimeLoop', 'nextDay', 'refreshCachedArgoRecord',
]);

const node = tagName => {
  let text = '';
  return {
    tagName, children: [], dataset: {}, listeners: {},
    appendChild(child) { this.children.push(child); },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setAttribute() {},
    get textContent() { return text + this.children.map(child => child.textContent).join(''); },
    set textContent(value) { text = String(value); this.children.length = 0; },
  };
};
const loopControls = panel => panel.children[1].children;

function harness() {
  const departure = '014', anchor = '010';
  const campaign = {
    sectionRevisions: { dashboard: 2, record: 3, map: 4 },
    sections: {
      dashboard: { profiles: { p: { cycles: { c3: { state: {
        day: 10, completed: {}, events: [], cardTracks: { doom: { doom: 4 } },
      } } } } } },
      record: { users: { p: { cycle: 'c3', loopLength: '2', explorationTrackTransactions: [
        { id: 'pending', cycleId: 'c3', type: 'doom', amount: 1 },
      ] }, other: { name: 'other record' } } },
      map: { users: { p: { cycles: { c3: {
        currentTile: departure, explored: {}, previewRevealed: { [departure]: true, [anchor]: true },
        latestRevealedTile: departure,
        tokens: { AG: departure, AD: anchor, markers: { [anchor]: { token_2: true } } },
      } } }, other: { name: 'other map' } } },
    },
  };
  const savedState = () => campaign.sections.dashboard.profiles.p.cycles.c3.state;
  const map = () => campaign.sections.map.users.p.cycles.c3;
  const record = () => campaign.sections.record.users.p;
  const writes = [], alerts = [], saveMessages = [];
  const channel = { postMessage() {} };
  const ctx = vm.createContext({
    state: copy(savedState()), cachedArgoRecord: copy(record()),
    mapCommandBusy: false, settleExplorationPursuit: {}, settleExplorationDraw: {},
    archive: { activeProfileId: 'p' }, campaignSessionEpoch: 1, campaignRestoreInFlight: false,
    argoRecordRefreshInFlight: false,
    readLocalArgoRecord: () => ({}), readServerArgoRecord: async () => ({ record: copy(record()) }),
    mergeArgoRecords: value => value, jsonEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    currentCycleConfig: () => ({ id: 'c3' }), ownsDashboardWriteLease: () => true,
    dateTrackData: { c3: { entries: [] } },
    elements: { appShell: { inert: false } },
    document: { createElement: node, createTextNode: textContent => ({ textContent }) },
    ATO_STRUCTURE_TECH_CLIENT: { profileSection }, alert: message => alerts.push(message),
    campaignSyncChannel: channel, recordSyncChannel: channel, structureTechMapSyncChannel: channel,
    isPlainObject: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    mapFactionLabelsByCycle: {}, mapCommandTileEntry: () => ({}),
    structureTechTarget: () => ({ profileId: 'p', cycleId: 'c3', day: ctx.state.day }),
    assertStructureTechTarget(target) { assert.equal(ctx.state.day, target.day); },
    beforeStructureTechSubmit: async () => {},
    loadFullCampaign: async () => copy(campaign),
    mapCycleDefinition: () => ({ id: 'c3', label: 'Cycle III', tiles: [departure, anchor].map(id => ({ id })) }),
    importCampaignSections: async (sections, expectedRevisions) => {
      assert.deepEqual(copy(expectedRevisions), Object.fromEntries(Object.keys(sections)
        .map(name => [name, campaign.sectionRevisions[name]])));
      writes.push(copy(sections));
      Object.assign(campaign.sections, copy(sections));
      for (const name of Object.keys(sections)) campaign.sectionRevisions[name] += 1;
      if (ctx.loseResponse) throw new Error('response lost');
      return { sections: copy(campaign.sectionRevisions) };
    },
    applyStructureTechCommit: async ({ campaign: latest }, _target, { saveMessage }) => {
      saveMessages.push(saveMessage);
      ctx.state = copy(latest.sections.dashboard.profiles.p.cycles.c3.state);
      ctx.cachedArgoRecord = copy(latest.sections.record.users.p);
    },
    saveState() {}, renderFlow() {}, renderDateTrack() {}, syncInputs() {},
    flushCampaignSave: async () => {
      campaign.sections.dashboard.profiles.p.cycles.c3.state = copy(ctx.state);
      return true;
    },
    settleCurrentMapExploration: async () => ctx.markCurrentMapTileExplored(map()),
  });
  vm.runInContext('window = globalThis;', ctx);
  for (const script of rulesScripts) script.runInContext(ctx);
  vm.runInContext(functions, ctx);
  const setDay = day => { ctx.state.day = day; savedState().day = day; };
  return { ctx, map, record, savedState, setDay, campaign, writes, alerts, saveMessages, departure, anchor };
}

test('activation sets six days and immediately moves Argo to AA with one unavoidable doom', async () => {
  const h = harness();
  const panel = h.ctx.createC3TimeLoopTools();
  assert.equal(panel.tagName, 'div');
  assert.equal(panel.className, 'survey-constants time-loop-row');
  assert.match(panel.children[0].textContent, /^轮回/);
  assert.match(panel.children[1].className, /time-loop-actions/);
  const activate = loopControls(panel).find(child => child.textContent === '启用轮回');
  await activate.listeners.click();
  assert.deepEqual(h.alerts, []);
  assert.deepEqual(h.saveMessages, ['已保存']);
  assert.equal(h.ctx.createC3TimeLoopTools().children[0].children.at(-1).textContent, '轮回已结算 · 无可避免灾祸 +1');
  assert.equal(h.record().cycleStats.c3.loopLength, '6');
  assert.equal(h.record().loopLength, '6');
  assert.deepEqual(h.savedState().timeLoop, { endDay: 16, baseLength: 6, startDay: 10, settledDays: [], settledEndDays: [] });
  assert.equal(h.savedState().cardTracks.doom.doom, 6, 'includes pending +1 and new +1');
  assert.equal(h.savedState().exploration.trackReceiptsByCycle.c3.pending, true);
  assert.equal(h.map().currentTile, h.anchor);
  assert.equal(h.map().tokens.AG, h.anchor);
  assert.equal(h.map().tokens.AD, h.anchor, 'direct placement does not resolve a nemesis encounter');
  assert.equal(h.map().previewRevealed[h.departure], true, 'activation is not round end');
  assert.equal(h.savedState().mapSnapshot.currentTileId, h.anchor);
  assert.equal(h.campaign.sections.record.users.other.name, 'other record');
  assert.equal(h.campaign.sections.map.users.other.name, 'other map');
});

test('advancing on an endpoint explores the departure before returning and uses the latest loop length', async () => {
  const h = harness();
  await h.ctx.settleC3TimeLoop(true);
  h.setDay(15);
  assert.equal(await h.ctx.settleC3TimeLoop(), false);
  h.setDay(16);
  h.map().currentTile = h.map().tokens.AG = h.departure;
  h.record().cycleStats.c3.loopLength = '4';
  assert.equal(await h.ctx.nextDay(), true);
  assert.equal(h.savedState().day, 17);
  assert.equal(h.saveMessages.at(-1), '已保存');
  const info = h.ctx.createC3TimeLoopTools().children[0];
  assert.match(info.textContent, /本次轮回长度 4 天 · 下次轮回在第 20 天/);
  assert.equal(info.children.length, 1, 'the previous day’s settlement reminder is gone');
  const [timing] = info.children;
  assert.equal(timing.className, 'time-loop-timing');
  const [duration, , date] = timing.children;
  assert.equal(duration.className, 'time-loop-length');
  assert.equal(duration.textContent.trim(), '4 天');
  assert.equal(date.className, 'time-loop-date');
  assert.equal(date.textContent, '第 20 天');
  assert.deepEqual(h.savedState().timeLoop, { endDay: 20, baseLength: 4, startDay: 16, settledDays: [16], settledEndDays: [14] });
  assert.equal(h.savedState().cardTracks.doom.doom, 7);
  assert.equal(h.map().explored[h.departure], true);
  assert.equal(h.map().explored[h.anchor], undefined);
  assert.equal(h.map().currentTile, h.anchor);
});

test('temporary adjustment moves only the circled endpoint and an overdue endpoint settles at round end', async () => {
  const h = harness();
  await h.ctx.settleC3TimeLoop(true);
  h.setDay(15);
  const panel = h.ctx.createC3TimeLoopTools();
  assert.match(panel.children[0].textContent, /本次轮回长度 6 天/);
  async function clickAdjustment(label) {
    const tools = loopControls(h.ctx.createC3TimeLoopTools());
    assert.equal(tools.some(child => child.tagName === 'input'), false);
    await tools.find(child => child.textContent === label).listeners.click();
    assert.deepEqual(h.alerts, []);
  }
  await clickAdjustment('延长 1 天');
  assert.equal(h.savedState().timeLoop.endDay, 17);
  const extended = h.ctx.createC3TimeLoopTools();
  assert.match(extended.children[0].textContent, /本次轮回长度 7 天 · 下次轮回在第 17 天/);
  await clickAdjustment('缩短 1 天');
  await clickAdjustment('缩短 1 天');
  await clickAdjustment('缩短 1 天');
  assert.equal(h.savedState().timeLoop.endDay, 14);
  assert.deepEqual(Object.keys(h.writes[2]), ['dashboard']);
  assert.equal(h.record().cycleStats.c3.loopLength, '6');
  assert.equal(h.savedState().cardTracks.doom.doom, 6);
  const overdue = h.ctx.createC3TimeLoopTools();
  assert.match(overdue.children[0].textContent, /本次轮回长度 4 天 · 下次轮回在第 15 天/);
  assert.match(overdue.children[0].textContent, /今日轮末结算/);
  assert.equal(await h.ctx.nextDay(), true);
  assert.deepEqual(h.savedState().timeLoop, { endDay: 21, baseLength: 6, startDay: 15, settledDays: [15], settledEndDays: [14] });
  assert.equal(h.savedState().cardTracks.doom.doom, 7);
});

test('a legacy first loop keeps its estimated start when its endpoint moves', async () => {
  const h = harness();
  h.savedState().timeLoop = { endDay: 16, settledDays: [] };
  h.ctx.state.timeLoop = copy(h.savedState().timeLoop);
  assert.match(h.ctx.createC3TimeLoopTools().children[0].textContent, /本次轮回长度 约 2 天/);
  await h.ctx.adjustC3TimeLoop(16, 1);
  assert.match(h.ctx.createC3TimeLoopTools().children[0].textContent, /本次轮回长度 约 3 天/);
});

test('a saved permanent length moves the current endpoint while retaining temporary adjustments', async () => {
  const h = harness();
  await h.ctx.settleC3TimeLoop(true);
  await h.ctx.adjustC3TimeLoop(16, 1);
  h.record().cycleStats.c3.loopLength = '4';
  await h.ctx.refreshCachedArgoRecord();
  assert.match(h.ctx.createC3TimeLoopTools().children[0].textContent, /本次轮回长度 5 天 · 下次轮回在第 15 天/);
  h.setDay(14);
  h.record().cycleStats.c3.loopLength = '3';
  assert.equal(await h.ctx.nextDay(), true, 'round end uses the latest record even before the record sync arrives');
  assert.deepEqual(h.savedState().timeLoop, {
    endDay: 17, baseLength: 3, startDay: 14, settledDays: [14], settledEndDays: [14],
  });
});

test('a permanent extension prevents settlement on the old date even before the record sync arrives', async () => {
  const h = harness();
  await h.ctx.settleC3TimeLoop(true);
  h.setDay(16);
  h.record().cycleStats.c3.loopLength = '8';
  assert.equal(await h.ctx.nextDay(), true);
  assert.equal(h.savedState().day, 17);
  assert.deepEqual(h.savedState().timeLoop.settledDays, []);
  assert.equal(h.savedState().cardTracks.doom.doom, 6);
  assert.equal(h.writes.length, 1);
});

test('an older loop uses the record sheet’s pre-edit base when no dashboard base was saved', async () => {
  const h = harness();
  h.savedState().timeLoop = { endDay: 16, startDay: 9, settledDays: [9], settledEndDays: [9] };
  h.ctx.state.timeLoop = copy(h.savedState().timeLoop);
  h.record().cycleStats = { c3: { loopLength: '8', _legacyLoopBaseLength: 6 } };
  await h.ctx.refreshCachedArgoRecord();
  assert.equal(h.ctx.state.timeLoop.baseLength, 6);
  assert.match(h.ctx.createC3TimeLoopTools().children[0].textContent, /本次轮回长度 9 天 · 下次轮回在第 18 天/);
});

test('retrying a temporary adjustment against a stale endpoint never moves the circle twice', async () => {
  const h = harness();
  await h.ctx.settleC3TimeLoop(true);
  h.ctx.loseResponse = true;
  await assert.rejects(h.ctx.adjustC3TimeLoop(16, 2), /response lost/);
  h.ctx.loseResponse = false;
  await assert.rejects(h.ctx.adjustC3TimeLoop(16, 2), /轮回端点已变更/);
  assert.equal(h.savedState().timeLoop.endDay, 18);
  assert.equal(h.writes.length, 2);
});

test('a committed endpoint with a lost response can be retried and then advanced without a duplicate', async () => {
  const h = harness();
  await h.ctx.settleC3TimeLoop(true);
  h.setDay(16);
  h.map().currentTile = h.map().tokens.AG = h.departure;
  h.ctx.loseResponse = true;
  await assert.rejects(h.ctx.settleC3TimeLoop(), /response lost/);
  h.ctx.loseResponse = false;
  await h.ctx.settleC3TimeLoop();
  assert.equal(await h.ctx.nextDay(), true);
  assert.equal(h.writes.length, 2);
  assert.equal(h.savedState().cardTracks.doom.doom, 7);
  assert.equal(h.map().previewRevealed[h.anchor], true, 'advancing after manual settlement does not explore AA');
});

test('a missing AA stops all parts of the transaction and keeps the endpoint day', async () => {
  const h = harness();
  h.ctx.state.timeLoop = { endDay: 10, settledDays: [] };
  delete h.map().tokens.markers[h.anchor];
  assert.equal(await h.ctx.nextDay(), false);
  assert.match(h.alerts[0], /阿里阿德涅之锚/);
  assert.equal(h.writes.length, 0);
  assert.equal(h.ctx.state.day, 10);
  assert.equal(h.map().explored[h.departure], undefined);
  assert.equal(h.savedState().cardTracks.doom.doom, 4);
});

test('the date track circles scheduled and completed endpoints, including beyond the printed track', () => {
  const h = harness();
  h.ctx.state.timeLoop = { endDay: 97, baseLength: 4, settledDays: [11, 95], settledEndDays: [10, 94] };
  h.ctx.dateTrackData.c3 = { label: 'Cycle III', entries: [{ day: 10 }, { day: 90 }], events: {} };
  h.ctx.elements.dateTrackList = node();
  h.ctx.elements.dateTrackMeta = node();
  Object.assign(h.ctx, {
    document: { createDocumentFragment: node, createElement: node },
    dateTrackIcons: () => [],
    escapeHtml: String, getAcclimationRule: () => null, renderCurrentDateNote() {},
  });
  vm.runInContext(loadFunctions(['formatTrackDay', 'dateNoteKey', 'trackEntriesForRender', 'renderDateTrack']), h.ctx);
  h.ctx.renderDateTrack();
  const rows = h.ctx.elements.dateTrackList.children[0].children;
  assert.deepEqual(rows.filter(row => row.innerHTML.includes('轮回端点')).map(row =>
    Number(row.innerHTML.match(/class="date-track-day loop-end">(\d+)/)[1])), [10, 94, 95]);
});
