const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const source = read('index.html');
const recordSource = read('record/index.html');
const clone = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
function extract(text, name) {
  const match = text.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}
function declaration(name) {
  const start = source.indexOf(`    const ${name} = `);
  const end = source.indexOf('\n    };', start) + 7;
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}
function harness(cycle, adventures = []) {
  const activity = { heroReads: 0, broadcasts: [], writes: [] };
  let server = { cycle, adventures, syncLog: '' }, revision = 1;
  const c = vm.createContext({
    console: { warn: error => { throw error; } },
    state: { day: '3', surveyConstants: null }, archive: { activeProfileId: 'A' },
    authUrl: '/api', sessionUser: { id: 'owner' }, campaignSessionEpoch: 1,
    currentCycleConfig: () => ({ id: cycle }), normalizeCampaignDay: String,
    readLocalArgoRecord: () => ({}), isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    setNextBattleTerrainFromHub: noop, clearNextBattleTerrainForHub: noop,
    saveState: noop, renderFlow: noop, updateRecordLinks: noop,
    recordSyncChannel: { postMessage: value => activity.broadcasts.push(value) },
    readLatestHeroState: async () => { activity.heroReads++; return { heroes: [] }; },
    fetch: async (url, options) => {
      if (!options?.method) return { ok: true, status: 200, json: async () => ({
        ok: true, exists: true, revision, user: { id: 'owner' }, state: { users: { A: clone(server) } },
      }) };
      const payload = JSON.parse(options.body);
      assert.equal(payload.userId, 'A');
      assert.equal(payload.expectedAccountId, 'owner');
      assert.equal(payload.expectedRevision, revision);
      server = payload.state;
      activity.writes.push(payload);
      return { ok: true, status: 200, json: async () => ({ ok: true, revision: ++revision }) };
    },
  });
  const names = ['cloneJson', 'getCurrentSurveyConstantData', 'findSurveyHub', 'findSurveyHubBox',
    'ensureTodaySurveyConstants', 'normalizeSurveyConstants', 'surveyConstantsDayKey',
    'latestSurveyAdventureRecordAction', 'readServerArgoRecord', 'writeServerArgoRecord',
    'mergeArgoRecords', 'normalizeRecordCrewCounters', 'syncAdventureActionToArgoRecord',
    'syncSurveyAdventureToArgoRecord', 'normalizeAdventureTitle', 'recordAdventureIndex',
    'markRecordAdventure', 'recordAdventureMiddleSlots', 'appendRecordSyncLog', 'adventureSlotLabel',
    'setSurveyConstant', 'heroProgressTarget', 'assertHeroProgressTarget', 'applyMnemosTagToHeroes', 'currentPharosDreamConstants', 'findSimpleConstantRow',
    'simpleConstantSlotIds', 'ensureTodaySimpleConstants', 'pharosDreamsDayKey', 'ensureTodayPharosDreams',
    'setSimpleConstant', 'setPharosDreamConstant', 'latestSimpleAdventureRecordAction'];
  vm.runInContext(['surveyConstantData', 'pharosDreamConstants'].map(declaration).join('\n')
    + '\n' + names.map(name => extract(source, name)).join('\n'), c);
  const sync = c.syncSurveyAdventureToArgoRecord;
  c.syncSurveyAdventureToArgoRecord = () => (activity.pending = sync());
  const syncAction = c.syncAdventureActionToArgoRecord;
  c.syncAdventureActionToArgoRecord = action => (activity.pending = syncAction(action));
  return { c, activity, record: () => clone(server) };
}
function renderedRecord(cycle, record) {
  const element = () => ({
    children: [], style: {}, set innerHTML(value) { this.children = []; },
    append(...values) { this.children.push(...values); }, appendChild(value) { this.children.push(value); },
    setAttribute: noop, addEventListener: noop,
  });
  const c = vm.createContext({ state: clone(record), elements: { adventureMeta: element(), adventureList: element() },
    document: { createElement: element }, escapeHtml: String,
    cycleScopedBindKeys: new Set(['boons', 'afflictions', 'counters', 'notes', 'syncLog']),
  });
  const names = ['currentCycle', 'renderAdventures', 'normalizeState', 'normalizeCycleStats', 'normalizeCrewCounters',
    'normalizeResources', 'migrateSharedResourceKey', 'normalizeCount', 'normalizeSummonSelection',
    'normalizeTitanList', 'normalizeTitanLimit', 'normalizeDeadTitans', 'migrateTitanLimit', 'normalizeMatrix', 'normalizeMatrixKey',
    'defaultDayForCycle', 'normalizeCycleDay', 'isPlainObject', 'cloneJson', 'migrateEnemyStages', 'getBindValue', 'getCycleStat', 'currentCycleStats',
    // normalizeState() 还依赖这些（记录表加入按循环选择宿敌、进化阶段之后）：漏掉就会
    // ReferenceError，让整组用例在 record 侧加字段时莫名其妙地红掉。
    'normalizeNemesisSelections', 'migrateNemesisProgress', 'normalizeNemesisResourceHistory',
    'evolutionStages', 'getEvolutionStage'];
  vm.runInContext(recordSource.slice(recordSource.indexOf('    const cycleData = '), recordSource.indexOf('    const elements = '))
    + '\n' + names.map(name => extract(recordSource, name)).join('\n'), c);
  c.state = c.normalizeState(c.state);
  c.state.cycle = cycle;
  c.renderAdventures();
  return { cards: c.elements.adventureList.children, state: c.state, log: c.getBindValue('syncLog') };
}
for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
  test(`${cycle}: no heroes, empty PHP adventure map still saves and displays the constant mark`, async () => {
    const { c, activity, record } = harness(cycle);
    vm.runInContext('this.hub = surveyConstantData[currentCycleConfig().id].hubs[0]', c);
    c.setSurveyConstant('hubs', c.hub.id, 'alpha', true);
    await activity.pending;
    await Promise.resolve();
    const saved = record();
    assert.equal(saved.adventures[`${cycle}-0-alpha`], true, 'the actual serialized POST must include the mark');
    assert.match(saved.syncLog, /定数写入/);
    assert.equal(activity.writes.length, 1);
    const { cards, log } = renderedRecord(cycle, saved);
    assert.match(log, /定数写入/);
    assert.ok(cards[0].children[1].children[0].className.includes('active'), 'the record sheet displays the saved mark');
  });
}

test('a constant updates the existing cycle day and the visible cycle-scoped log', async () => {
  const { c, activity, record } = harness('c1', {});
  let saved = { cycle: 'c1', day: '1', cycleDays: { c1: '1' }, adventures: {}, cycleStats: { c1: { syncLog: 'previous entry' } } };
  c.readServerArgoRecord = async () => ({ available: true, record: clone(saved), revision: 1 });
  c.writeServerArgoRecord = async value => { saved = clone(value); return { conflict: false, revision: 2 }; };
  vm.runInContext('this.hub = surveyConstantData.c1.hubs[0]', c);
  c.setSurveyConstant('hubs', c.hub.id, 'alpha', true);
  await activity.pending;
  const displayed = renderedRecord('c1', saved);
  assert.equal(displayed.state.day, '3');
  assert.match(displayed.log, /定数写入/);
  assert.match(displayed.log, /previous entry/);
  assert.equal(saved.adventures['c1-0-alpha'], true);
});

for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) test(`${cycle}: blank and omega marks survive repeated record saves`, async () => {
  const { c, activity, record } = harness(cycle, { [`${cycle}-0-alpha`]: true, 'c2-1-omega': true });
  vm.runInContext('this.hub = surveyConstantData[currentCycleConfig().id].hubs[0]', c);
  const middleBox = c.hub.boxes.find(box => !['alpha', 'omega'].includes(box[0]));
  c.setSurveyConstant('hubs', c.hub.id, middleBox[0], true);
  await activity.pending;
  c.setSurveyConstant('hubs', c.hub.id, 'omega', true);
  await activity.pending;
  const saved = record();
  assert.equal(saved.adventures[`${cycle}-0-mid1`], true);
  assert.equal(saved.adventures[`${cycle}-0-alpha`], true);
  assert.equal(saved.adventures[`${cycle}-0-omega`], true);
  assert.equal(saved.adventures['c2-1-omega'], true);
  const { cards } = renderedRecord(cycle, saved);
  const buttons = cards[0].children[1].children;
  assert.ok(buttons[1].className.includes('active'));
  assert.ok(buttons.at(-1).className.includes('active'));
});

for (const cycle of ['c4', 'c5']) test(`${cycle}: Pharos named constants also save from an empty PHP map`, async () => {
  const { c, activity, record } = harness(cycle);
  c.setPharosDreamConstant('beta', true);
  await activity.pending;
  const saved = record();
  assert.equal(saved.adventures[`${cycle}-7-beta`], true);
  const { cards, log } = renderedRecord(cycle, saved);
  assert.ok(cards[7].children[1].children[1].className.includes('active'));
  assert.match(log, /定数写入/);
});

test('a conflict retry preserves remote resources while normalizing the newest empty PHP map', async () => {
  const { c, activity } = harness('c1');
  let reads = 0, writes = 0, saved;
  c.readServerArgoRecord = async () => ({ available: true, revision: ++reads,
    record: { adventures: [], resources: { bone: reads === 1 ? 0 : 7 } },
  });
  c.writeServerArgoRecord = async value => {
    if (++writes === 1) return { conflict: true };
    saved = clone(value);
    return { conflict: false, revision: 3 };
  };
  vm.runInContext('this.hub = surveyConstantData.c1.hubs[0]', c);
  c.setSurveyConstant('hubs', c.hub.id, 'alpha', true);
  await activity.pending;
  assert.equal(writes, 2);
  assert.equal(saved.adventures['c1-0-alpha'], true);
  assert.equal(saved.resources.bone, 7);
});
