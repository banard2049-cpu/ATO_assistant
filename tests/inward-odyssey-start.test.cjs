const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resolveCampaignProgress } = require('../briefing/briefing-core.js');
const jsaveImport = require('../assets/jsave-import.js');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
function dashboardContext() {
  const context = vm.createContext({ saveState() {}, renderCardTrackDialog() {} });
  const names = ['normalizeCounterValue', 'argoKnowledgeStart', 'normalizeCardTrackEntry',
    'normalizeCardTracks', 'advanceCardTrack', 'retreatCardTrack'];
  for (const name of names) {
    const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return context;
}

const starts = { c1: 0, c2: 20, c3: 40, c4: 60, c5: 80 };
for (const [cycle, start] of Object.entries(starts)) {
  test(`${cycle}: 新轨道与旧零值使用知识起点 ${start}，已记录的进度保留`, () => {
    const dashboard = dashboardContext();
    for (const [tracks, counters] of [
      [{}, {}],
      [{ inwardOdyssey: { position: 0, progress: 1 } }, {}],
      [{}, { inwardOdysseyCount: 0 }],
    ]) {
      const result = dashboard.normalizeCardTracks(tracks, counters, false, cycle);
      assert.equal(result.inwardOdyssey.position, start);
      const briefing = resolveCampaignProgress({ cardTracks: result }, cycle, []);
      assert.equal(briefing.inward.known, true);
      assert.equal(briefing.inward.position, start);
      assert.equal(briefing.inward.progress, result.inwardOdyssey.progress);
    }
    // 旧存档中的 1 也可能是已经获得的知识，不能无条件扣除。
    const progressed = { inwardOdyssey: { position: start + 1, progress: 1 } };
    assert.equal(dashboard.normalizeCardTracks(progressed, {}, false, cycle).inwardOdyssey.position, start + 1);
    assert.equal(resolveCampaignProgress({ cardTracks: progressed }, cycle, []).inward.position, start + 1);
    assert.equal(resolveCampaignProgress({ cardCounters: { inwardOdysseyCount: start + 1 } }, cycle, []).inward.position, start + 1);
  });

  test(`${cycle}: 回退停在 ${start}，再次归一化和推进不会跳过第一等级`, () => {
    const dashboard = dashboardContext();
    let tracks = dashboard.normalizeCardTracks({ inwardOdyssey: { position: start + 1, progress: 1 } }, {}, false, cycle);
    dashboard.ensureCardTracks = () => tracks;
    dashboard.currentCycleConfig = () => ({ id: cycle });
    dashboard.retreatCardTrack('inwardOdyssey');
    assert.equal(tracks.inwardOdyssey.position, start);
    assert.equal(tracks.inwardOdyssey.progress, 0);
    tracks = dashboard.normalizeCardTracks(tracks, {}, false, cycle);
    assert.equal(tracks.inwardOdyssey.position, start);
    dashboard.retreatCardTrack('inwardOdyssey');
    assert.equal(tracks.inwardOdyssey.position, start);
    dashboard.advanceCardTrack('inwardOdyssey');
    assert.equal(tracks.inwardOdyssey.position, start + 1);
  });

  test(`${cycle}: 官方存档导入的知识起点为 ${start}`, () => {
    const result = jsaveImport.convert({
      campaign_cycle: Number(cycle.slice(1)) - 1,
      campaign_stats: { inward: false },
    });
    const state = result.dashboard.profiles.default.cycles[cycle].state;
    assert.equal(state.cardTracks.inwardOdyssey.position, start);
    assert.equal(state.cardTracks.inwardOdyssey.progress, 0);
  });
}
