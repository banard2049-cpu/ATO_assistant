const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const rules = require('../technology/structure-tech-rules.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
function extract(name) {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}
class Element {
  constructor(tag) {
    this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {};
    this.innerHTML = ''; this.textContent = ''; this.open = false; this.hidden = false;
    this.disabled = false; this.attributes = {};
  }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}
function harness(names, extra = {}) {
  const calls = { render: 0, track: 0, queued: 0, saves: 0, alerts: [], panels: [], timeouts: [] };
  const due = new Element('div');
  const automation = { version: 1, events: {} };
  const archive = { activeProfileId: 'A', profiles: { A: { cycles: { c2: { state: { day: 12, techAutomation: automation, notes: 'original' } } } } } };
  const context = vm.createContext({
    window: { ATO_STRUCTURE_TECH_RULES: rules,
      ATO_STRUCTURE_TECH_CLIENT: { profileSection: (section, id) => section?.users?.[id] || section || {} },
      // The due list schedules its automatic settlement on a timer; tests run it
      // explicitly through calls.timeouts.
      setTimeout: (callback, delay) => { calls.timeouts.push({ callback, delay }); return calls.timeouts.length; },
      alert: message => calls.alerts.push(message) },
    document: { createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'),
      querySelector: selector => selector === '#structureTechDue' ? due : null },
    state: archive.profiles.A.cycles.c2.state, archive,
    cycleId: 'c2', currentCycleConfig() { return { id: context.cycleId }; },
    sessionUser: { id: 'owner' }, campaignSessionEpoch: 1,
    campaignSectionBaseline: clone(archive), campaignServerBaseline: clone(archive), campaignSectionRevision: 4,
    campaignSectionExists: true, cachedArgoRecord: {},
    structureTechContext: null, structureTechContextRevision: -1, structureTechContextRequest: null,
    structureTechContextError: '', structureTechActionPanel: null, negotiationTechActionPanel: null, structureTechCompletionBusy: false,
    structureTechAutoMessage: null, structureTechAutomaticAttempts: new Set(),
    structureTechClient: () => context.structureTechConnection,
    structureTechConnection: { complete: async () => { throw new Error('no technology connection in this harness'); } },
    lease: true, ownsDashboardWriteLease() { return context.lease; },
    renderFlow() { calls.render++; }, renderDateTrack() { calls.track++; },
    refreshStructureTechContext: async () => null,
    saveState() { calls.saves++; }, flushCampaignSave: async () => true,
    queueCampaignSave() { calls.queued++; }, setCampaignSaveStatus() {},
    campaignHasUnsavedChanges() { return JSON.stringify(context.archive) !== JSON.stringify(context.campaignSectionBaseline); },
    normalizeArchive: clone, dashboardArchiveFromServer: clone,
    renderDashboardArchive(value) { context.archive = clone(value); context.state = context.archive.profiles[context.archive.activeProfileId].cycles[context.cycleId].state; },
    stopForAccountMismatch() { context.sessionUser = null; context.campaignSessionEpoch++; },
    accountMismatchError() { return Object.assign(new Error('登录账号已切换'), { code: 'ACCOUNT_MISMATCH' }); },
    cloneJson: clone, isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    jsonEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    ...extra,
  });
  vm.runInContext(names.map(extract).join('\n'), context);
  return { context, calls, due };
}
const targeting = ['structureTechTarget', 'assertStructureTechTarget', 'beforeStructureTechSubmit'];
const dueList = ['getStructureTechContext', 'structureTechEvents', 'structureTechTarget', 'structureTechAutoKey', 'structureTechAutoLabel', 'autoCompleteStructureTechEvents', 'renderStructureTechDue'];
const event = (id, values = {}) => ({ id, techKey: 'grand stoa', actionId: 'dreamwalker', cycleId: 'c2',
  label: '巨型柱廊 · 培育梦行者', rewardLabel: '获得 1 架梦行者', createdDay: 1,
  dueDay: 10, cooldownUntilDay: 1, status: 'pending', kind: 'reward', ...values });

test('凝固时光在移动区显示容量与处理结果，重绘只安排一次且只读页面不领取', () => {
  const frozenRules = require('../map/frozen-time-rules.js');
  const dictionary = require('../technology/tech_card_dictionary.min.json');
  const tags = { tiles: { 'c3:007': { tags: ['frozen_time'] } } };
  const engine = frozenRules.createEngine({ technologyRules: rules, tags });
  const { context: c, calls } = harness(['getStructureTechContext', 'structureTechTarget', 'createMapFrozenTimeReminder'], {
    mapFrozenTimeMessage: null, mapFrozenTimeBusy: false, mapFrozenTimeAutomaticAttempts: new Set(),
    settleMapFrozenTime: async () => {},
  });
  c.cycleId = 'c3';
  c.window.ATO_MAP_FROZEN_TIME_RULES = { ...frozenRules, createEngine: () => engine };
  c.cachedArgoRecord = { cycle: 'c3', frozenTime: '2' };
  c.structureTechContext = { epoch: 1, profileId: 'A', cycleId: 'c3', dictionary,
    technology: { unlocked: ['time solutions'] },
    map: { cycles: { c3: { currentTile: '007', latestRevealedTile: '007', explored: { '007': true }, explorationEntries: { '007': true } } } } };
  c.structureTechContextRevision = c.campaignSectionRevision;
  const reminder = c.createMapFrozenTimeReminder();
  assert.equal(reminder.dataset.mapFrozenTimeTile, '007');
  assert.match(reminder.children[1].textContent, /2 \/ 3/);
  c.createMapFrozenTimeReminder();
  assert.equal(calls.timeouts.length, 1);
  c.structureTechContext.technology.unlocked.push('advanced time solutions');
  assert.match(c.createMapFrozenTimeReminder().children[1].textContent, /2 \/ 5/);
  c.mapFrozenTimeAutomaticAttempts.clear(); c.lease = false;
  c.createMapFrozenTimeReminder();
  assert.equal(calls.timeouts.length, 1, 'a read-only dashboard never schedules an award');
  c.lease = true; c.structureTechContextRevision--;
  c.createMapFrozenTimeReminder();
  assert.equal(calls.timeouts.length, 1, 'stale contexts cannot schedule an award');
  c.structureTechContextRevision = c.campaignSectionRevision;
  const record = engine.prepareOperation({ ...c.getStructureTechContext(), techKey: 'map-frozen-time',
    actionId: 'map-collect-frozen-time', operationId: frozenRules.receiptId('007'), selection: { tileId: '007' } }).record;
  c.cachedArgoRecord = record;
  assert.match(c.createMapFrozenTimeReminder().children[0].textContent, /凝固时光 \+1/);
  assert.equal(calls.timeouts.length, 1, 'a receipt prevents another automatic award');
  const moveBlock = source.slice(source.indexOf('if (step.id === "move") {\n          const titanReminder'), source.indexOf('if (nemesisTools) text.appendChild'));
  assert.match(moveBlock, /createMapFrozenTimeReminder/);
});

test('斯巴达要塞只在移动步骤提醒，已探索也显示且不提供扣除按钮', () => {
  const { context: c } = harness(['getMoveMapReminders', 'getStepTrackReminders'], {
    todayTrackIcons: () => [], getStructureTechContext: () => null,
    currentMapTagSet: () => new Set(['spartan_stronghold']), currentMapTileLabel: () => '018',
    getExploreMapReminders: () => [], getSurveyMapReminders: () => [], getDoomMapReminders: () => [],
    getStoryMapReminders: () => [], getExplorationStepTokenReminders: () => [], getNextBattleTerrainReminder: () => [],
  });
  const original = clone(c.state);
  const reminders = c.getStepTrackReminders('move');
  assert.equal(reminders.length, 1);
  assert.match(reminders[0].desc, /1 船体或 1 船员.*已探索.*手动/);
  assert.equal(reminders[0].placements, undefined);
  assert.equal(reminders[0].html, undefined);
  assert.deepEqual(clone(c.state), original);
  for (const step of ['explore', 'survey', 'story', 'doom', 'encounter', 'development']) assert.equal(c.getStepTrackReminders(step).length, 0);
  c.getStructureTechContext = () => ({ map: { cycles: { c2: { currentTile: '020', explored: { '020': true } } } } });
  c.window.ATO_MAP_TILE_TAGS = { tiles: { 'c2:020': { tags: ['spartan_stronghold'] } } };
  assert.match(c.getStepTrackReminders('move')[0].desc, /^020 /, 'the live map overrides a stale snapshot');
  c.window.ATO_MAP_TILE_TAGS.tiles['c2:020'].tags = [];
  assert.equal(c.getStepTrackReminders('move').length, 0);
  c.cycleId = 'c3';
  assert.equal(c.getStepTrackReminders('move').length, 0);
});

test('旧存档默认空科技日程，结构化记录独立于每日事件和日期备注', () => {
  const { context: c } = harness(['normalizeStructureTechAutomation', 'normalizeState'], {
    defaultState: { day: 1, events: [] }, normalizeCampaignDay: value => value ?? 1,
    normalizeExploration: value => value || {}, normalizeCardTracks: value => value || {},
    normalizeNextBattleTerrain: value => value || {}, normalizeSurveyConstants: value => value,
  });
  assert.deepEqual(clone(c.normalizeState({}).techAutomation), { version: 1, events: {} });
  const original = { day: 12, dateNotes: { 10: '玩家备注' }, events: [{ id: 'daily', done: true }],
    techAutomation: { version: 1, events: { reward: event('reward') } } };
  const normalized = c.normalizeState(original);
  normalized.techAutomation.events.reward.status = 'completed';
  assert.equal(original.techAutomation.events.reward.status, 'pending');
  assert.deepEqual(clone(normalized.dateNotes), original.dateNotes);
  assert.deepEqual(clone(normalized.events), original.events);
});

test('科技事项显示来源、目标和完成状态，只在真实冷却日补恢复事项', () => {
  const { context: c } = harness(['getStructureTechContext', 'structureTechEvents', 'structureTechTimelineItems']);
  c.state.techAutomation.events = {
    reward: event('reward', { targetLabel: '伊阿宋' }),
    accelerated: event('accelerated', { dueDay: 6, cooldownUntilDay: 13 }),
    trade: event('trade', { kind: 'cooldown', dueDay: 8, cooldownUntilDay: 8 }),
  };
  assert.equal(c.structureTechTimelineItems(1).length, 0, '普通奖励的创建日期不是额外冷却日期');
  assert.match(c.structureTechTimelineItems(10)[0].text, /巨型柱廊.*目标：伊阿宋.*逾期待办/);
  assert.equal(c.structureTechTimelineItems(13)[0].type, 'cooldown');
  assert.match(c.structureTechTimelineItems(8)[0].text, /恢复可用/);
  c.state.techAutomation.events.reward.status = 'completed';
  assert.match(c.structureTechTimelineItems(10)[0].text, /已完成/);
  c.cycleId = 'c3';
  assert.equal(c.structureTechEvents().length, 0, '其它循环的事项不混入当前时间线');
});

test('日期轨复用同一份科技事件，不按每个日期格重复读取日程', () => {
  const { context: c } = harness(['structureTechTimelineItems']);
  let reads = 0;
  c.structureTechEvents = () => { reads += 1; return [event('due', { dueDay: 3 })]; };
  const events = c.structureTechEvents();
  assert.equal(c.structureTechTimelineItems(3, events).length, 1);
  assert.equal(reads, 1, '传入事件后不再调用 structureTechEvents');
});

test('侦察船重建到期的按钮说明会恢复地图船只', () => {
  const { context: c, due } = harness([...dueList]);
  c.state.techAutomation.events = { scout: event('scout', { techKey: 'canal reconnaissance', actionId: 'rebuild',
    label: '运河勘测 · 重建侦察船', rewardLabel: '恢复 1 艘地图侦察船' }) };
  c.renderStructureTechDue();
  assert.equal(due.hidden, false);
  const button = due.children[0].children[1].children.find(node => node.tag === 'button');
  assert.equal(button.textContent, '完成重建');
  assert.match(button.title, /恢复 1 艘地图侦察船/);
});

test('无冷却的发展交换保留凭据但不生成虚假的冷却事项或额外日期', () => {
  const { context: c, due } = harness(['structureTechTimelineItems', 'trackEntriesForRender', ...dueList]);
  c.state.day = 12;
  c.state.techAutomation.events = { developmentTrade: event('developmentTrade', { techKey: 'temenos project',
    createdDay: 999, dueDay: 999, cooldownUntilDay: 999, kind: 'cooldown', skipTimeline: true, status: 'completed' }) };
  assert.equal(c.structureTechEvents().length, 1, '交易凭据仍可读取');
  assert.equal(c.structureTechTimelineItems(999).length, 0);
  assert.deepEqual(clone(c.trackEntriesForRender({ entries: [{ day: 1 }, { day: 12 }] })).map(row => row.day), [1, 12]);
  c.renderStructureTechDue();
  assert.equal(due.hidden, true);
});

test('超表科技日期稀疏补行，nextDay 仍按官方日期轨推进并保留科技记录', async () => {
  const { context: c } = harness(['trackEntriesForRender', 'nextDay'], {
    dateTrackData: { c2: { entries: [{ day: 1 }, { day: 2 }, { day: 3 }] } },
    structureTechEvents: () => [event('reward', { dueDay: 1000, cooldownUntilDay: 1200 }), event('done', { dueDay: 900, status: 'completed' })],
    syncInputs() {},
    campaignRestoreInFlight: false, elements: { appShell: { inert: false } },
  });
  const track = c.dateTrackData.c2;
  c.state.day = 3;
  c.state.completed = { development: true };
  c.state.events = [{ done: true }, { done: false }];
  c.state.techAutomation.events.keep = event('keep');
  assert.deepEqual(clone(c.trackEntriesForRender(track)).map(row => row.day), [1, 2, 3, 900, 1000, 1200]);
  assert.equal(track.entries.length, 3);
  await c.nextDay();
  assert.equal(c.state.day, 4, '下一天不能跳到未来科技日期');
  assert.deepEqual(clone(c.state.events), [{ done: false }]);
  assert.equal(c.state.techAutomation.events.keep.id, 'keep');
  c.state.day = 5000;
  assert.equal(c.trackEntriesForRender(track).length, 7, '不生成中间的数千个空白日期');
});

test('科技操作默认折叠，重绘保留展开状态，换档案重置折叠状态', () => {
  const { context: c, calls } = harness(['getStructureTechContext', 'structureTechTarget', 'currentArgoFateValue',
    'argoFateChipHtml', 'createStructureTechActionTools']);
  c.structureTechContext = { epoch: 1, profileId: 'A', cycleId: 'c2', technology: { unlocked: ['grand stoa'] }, record: {} };
  c.structureTechClient = () => ({ createActionPanel: options => { calls.panels.push(options); return new Element('panel'); } });
  const first = c.createStructureTechActionTools();
  assert.equal(first.open, false);
  first.open = true;
  assert.equal(c.createStructureTechActionTools(), first, '未变化的数据不丢失选项草稿');
  c.state.day = 13;
  const updated = c.createStructureTechActionTools();
  assert.notEqual(updated, first);
  assert.equal(updated.open, true);
  assert.equal(calls.panels.at(-1).day, 13);
  c.archive.activeProfileId = 'B';
  assert.equal(c.createStructureTechActionTools().open, false);
});

test('谈判窗口只在有效地点显示，城市、绿洲最后到访标记立即隐藏整块模块', () => {
  const { context: c, calls } = harness(['getStructureTechContext', 'structureTechTarget', 'currentArgoFateValue',
    'argoFateChipHtml', 'createStructureTechActionTools']);
  c.structureTechContext = { epoch: 1, profileId: 'A', cycleId: 'c2', technology: { unlocked: [] }, record: {} };
  c.structureTechClient = () => ({ createActionPanel: options => { calls.panels.push(options); return new Element('panel'); } });
  assert.equal(c.createStructureTechActionTools('negotiation'), null);
  c.state.mapSnapshot = { cycleId: 'c2', currentTileId: 'site', currentTileTags: ['city'] };
  const city = c.createStructureTechActionTools('negotiation');
  assert.equal(city.tag, 'div');
  assert.equal(city.children.some(child => child.tag === 'summary'), false);
  assert.equal(calls.panels.at(-1).scope, 'negotiation');
  assert.equal(c.createStructureTechActionTools('negotiation'), city);
  c.state.mapCurrentTileHasLastCityMarker = true;
  assert.equal(c.createStructureTechActionTools('negotiation'), null);
  c.state.mapCurrentTileHasLastCityMarker = false;
  c.state.mapSnapshot.currentTileTags = ['progress'];
  assert.equal(c.createStructureTechActionTools('negotiation'), null);
  c.state.mapSnapshot.currentTileTags = ['oasis'];
  assert.ok(c.createStructureTechActionTools('negotiation'));
  c.state.mapCurrentTileHasLastOasisMarker = true;
  assert.equal(c.createStructureTechActionTools('negotiation'), null);
  c.structureTechContext = null;
  assert.equal(c.createStructureTechActionTools('negotiation'), null, '未读取科技和地图时不闪现入口');
});

test('荒原商人待选牌在探索牌堆规范化时继续保留，不会被当作遗漏牌补回', () => {
  const { context: c } = harness(['ensureExplorationDrawState'], {
    normalizeExploration: value => value,
    getSelectedExplorationIds: () => ['a', 'b', 'c'],
    normalizeExplorationRecord: entry => entry,
    shuffleList: values => values,
  });
  c.state.exploration = { selectedByCycle: {}, drawStateByCycle: { c2: { drawPile: ['a', 'c'], history: [], activePiles: [[], []] } } };
  c.state.techAutomation.events.merchant = { cycleId: 'c2', status: 'pending', negotiationDraw: { cards: ['a', 'b'] } };
  assert.deepEqual(clone(c.ensureExplorationDrawState().drawPile), ['c']);
  assert.deepEqual(clone(c.ensureExplorationDrawState().drawPile), ['c'], '重绘也不能归还待选牌');
  c.state.techAutomation.events.merchant.status = 'completed';
  c.state.exploration.drawStateByCycle.c2.activePiles = [[{ id: 'a' }], []];
  assert.deepEqual(clone(c.ensureExplorationDrawState().drawPile).sort(), ['b', 'c']);
});

test('科技context缓存不跨档案、循环或账号会话', () => {
  const { context: c } = harness(['getStructureTechContext']);
  c.structureTechContext = { epoch: 1, profileId: 'A', cycleId: 'c2', record: { old: true } };
  assert.equal(c.getStructureTechContext().day, 12);
  c.campaignSessionEpoch++;
  assert.equal(c.getStructureTechContext(), null);
  c.campaignSessionEpoch--;
  c.cycleId = 'c3';
  assert.equal(c.getStructureTechContext(), null);
  c.cycleId = 'c2'; c.archive.activeProfileId = 'B';
  assert.equal(c.getStructureTechContext(), null);
});

test('强制读取失败会reject；切换档案后的旧读取不能更新缓存', async () => {
  const { context: c, calls } = harness(['getStructureTechContext', 'refreshStructureTechContext']);
  c.structureTechClient = () => ({ load: async () => { throw new Error('断线'); } });
  await assert.rejects(c.refreshStructureTechContext(), /断线/);
  assert.equal(c.structureTechContextError, '断线');
  let resolve;
  c.structureTechClient = () => ({ load: () => new Promise(done => { resolve = done; }) });
  const pending = c.refreshStructureTechContext();
  c.archive.activeProfileId = 'B';
  resolve({ profileId: 'A', cycleId: 'c2', record: {} });
  await assert.rejects(pending, /已切换/);
  assert.equal(c.structureTechContext, null);
  assert.equal(calls.render, 0);
});

test('科技排期先flush本地修改，并在flush后重新验证日期和编辑权限', async () => {
  const { context: c, calls } = harness(targeting);
  const target = c.structureTechTarget();
  await c.beforeStructureTechSubmit(target);
  assert.equal(calls.saves, 1);
  c.flushCampaignSave = async () => false;
  await assert.rejects(c.beforeStructureTechSubmit(target), /尚未保存/);
  c.flushCampaignSave = async () => { c.state.day = 13; return true; };
  await assert.rejects(c.beforeStructureTechSubmit(target), /日期已变化/);
  c.state.day = 12; c.lease = false;
  await assert.rejects(c.beforeStructureTechSubmit(target), /接管编辑/);
  c.lease = true; c.campaignSessionEpoch++;
  await assert.rejects(c.beforeStructureTechSubmit(target), error => error.code === 'ACCOUNT_MISMATCH');
});

test('逾期科技事项在后续日期持续提示，已完成与纯冷却不进入待办', () => {
  const { context: c, due } = harness([...dueList]);
  c.state.techAutomation.events = { pending: event('pending'), done: event('done', { status: 'completed' }),
    cooldown: event('cooldown', { kind: 'cooldown', cooldownUntilDay: 10 }) };
  c.renderStructureTechDue();
  assert.equal(due.children.length, 1);
  assert.match(due.children[0].children[0].textContent, /逾期.*Day 10/);
  c.state.day = 40;
  c.renderStructureTechDue();
  assert.equal(due.children.length, 1);
  c.state.techAutomation.events.pending.status = 'completed';
  c.renderStructureTechDue();
  assert.equal(due.hidden, true);
});

test('登记完成沿用事件id并传日期和上下文校验，结束后恢复所有待办按钮', async () => {
  const { context: c, due, calls } = harness([...targeting, ...dueList, 'completeStructureTechEvent']);
  c.state.techAutomation.events = { first: event('first'), second: event('second') };
  const requests = [];
  c.structureTechClient = () => ({ complete: async options => {
    requests.push(options); options.assertContext();
    return { campaign: {} };
  } });
  c.applyStructureTechCommit = async () => {
    c.state.techAutomation.events.first.status = 'completed'; c.renderStructureTechDue();
  };
  await c.completeStructureTechEvent('first', new Element('button'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].operationId, 'first');
  assert.equal(requests[0].expectedDay, 12);
  assert.equal(due.children.length, 1);
  assert.equal(due.children[0].children[1].disabled, false);
  assert.equal(c.structureTechCompletionBusy, false);
  assert.equal(calls.track, 1);
});

test('到期泰坦奖励自动结算一次，手动奖励仍等待玩家点击', async () => {
  const { context: c, due, calls } = harness([...targeting, ...dueList]);
  c.structureTechContext = { epoch: c.campaignSessionEpoch, profileId: 'A', cycleId: 'c2', record: {}, technology: {}, heroes: [] };
  c.structureTechContextRevision = c.campaignSectionRevision;
  c.state.techAutomation.events = {
    titan: event('titan'),
    manual: event('manual', { techKey: 'mnestis thesis', actionId: 'reflect', label: '记忆论题 · 反思' }),
  };
  const requests = [];
  c.structureTechClient = () => ({ complete: async options => {
    requests.push(options);
    const operation = c.state.techAutomation.events[options.operationId];
    operation.status = 'completed';
    operation.grant = { type: 'titan', titanId: 'dreamwalker', name: '梦行者', count: 1, applied: true, appliedDay: 12 };
    return { campaign: {}, operation };
  } });
  c.applyStructureTechCommit = async () => { c.renderStructureTechDue(); };
  c.renderStructureTechDue();
  assert.equal(calls.timeouts.length, 1, 'only the named titan reward schedules itself');
  const rowFor = text => due.children.find(row => row.children[0]?.textContent?.includes(text));
  assert.equal(rowFor('培育梦行者').children[1].children[0].textContent, '手动登记', 'the automatic event keeps a fallback button');
  assert.equal(rowFor('记忆论题').children[1].children[0].textContent, '已手动结算', 'a manual reward is untouched');
  await calls.timeouts[0].callback();
  // The dashboard schedules the settlement fire-and-forget, so let its awaits drain.
  for (let tick = 0; tick < 8; tick += 1) await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].operationId, 'titan');
  assert.equal(requests[0].expectedDay, 12);
  assert.match(due.children[0].textContent, /获得 1 架梦行者泰坦/);
  c.renderStructureTechDue();
  assert.equal(calls.timeouts.length, 1, 'the same due event is never settled twice');
});

test('exploration commits update the archive and date track while deferring the intermediate flow render', async () => {
  for (const defer of [false, true]) {
    const { context: c, calls } = harness(['mergeDashboardChanges', 'applyStructureTechCommit', 'renderDashboardArchive'], {
      URLSearchParams, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      cycleConfigs: [{ id: 'c2' }], storedTermLanguage: () => 'fan',
      syncInputs() {}, renderProfiles() {}, renderCycles() {},
    });
    c.window.location = { search: '' };
    c.window.dispatchEvent = () => {};
    c.currentProfile = () => c.archive.profiles.A;
    c.currentCycle = () => c.archive.profiles.A.cycles.c2;
    c.archive.profiles.A.cycles.c2.state.notes = 'note edited while saving';
    const remote = clone(c.campaignSectionBaseline);
    remote.profiles.A.cycles.c2.state.techAutomation.events.settled = event('settled');
    await c.applyStructureTechCommit({ campaign: { sectionRevisions: { dashboard: 5 }, sections: {
      dashboard: remote, record: { users: { A: { fate: '4' } } },
    } } }, { sessionEpoch: 1, accountId: 'owner' }, defer ? { renderFlow: false } : {});
    assert.equal(c.state.notes, 'note edited while saving');
    assert.ok(c.state.techAutomation.events.settled);
    assert.equal(c.cachedArgoRecord.fate, '4');
    assert.equal(c.campaignSectionRevision, 5);
    assert.equal(calls.track, 1, 'the timeline still receives the committed event');
    assert.equal(calls.render, defer ? 0 : 1, 'only exploration defers its intermediate flow');
    if (defer) {
      c.renderFlow();
      assert.equal(calls.render, 1, 'the caller paints its final state once');
    }
  }
});

test('提交返回后合并正在编辑的备注与远端科技日程，更新record缓存', async () => {  const { context: c, calls } = harness(['mergeDashboardChanges', 'applyStructureTechCommit']);
  const remote = clone(c.campaignSectionBaseline);
  remote.profiles.A.cycles.c2.state.techAutomation.events.reward = event('reward');
  c.state.notes = 'local draft';
  await c.applyStructureTechCommit({ campaign: { sectionRevisions: { dashboard: 5 }, sections: {
    dashboard: remote, record: { users: { A: { fate: '2' } } }, technology: { users: { A: { unlocked: ['grand stoa'] } } },
  } } });
  assert.equal(c.state.notes, 'local draft');
  assert.equal(c.state.techAutomation.events.reward.id, 'reward');
  assert.equal(c.cachedArgoRecord.fate, '2');
  assert.equal(c.campaignSectionRevision, 5);
  assert.equal(calls.queued, 1);
});

test('较旧提交响应会重读最新存档，账号会话已切换时禁止应用响应', async () => {
  const { context: c } = harness(['mergeDashboardChanges', 'applyStructureTechCommit']);
  const latest = { sectionRevisions: { dashboard: 7 }, sections: {
    dashboard: clone(c.archive), record: { users: { A: { fate: '4' } } }, technology: {},
  } };
  let loads = 0;
  c.structureTechClient = () => ({ load: async () => { loads++; return { campaign: latest }; } });
  c.campaignSectionRevision = 6;
  await c.applyStructureTechCommit({ campaign: { sectionRevisions: { dashboard: 5 }, sections: { dashboard: clone(c.archive) } } });
  assert.equal(loads, 1);
  assert.equal(c.campaignSectionRevision, 7);
  assert.equal(c.cachedArgoRecord.fate, '4');
  await assert.rejects(c.applyStructureTechCommit({ campaign: latest }, { sessionEpoch: 0, accountId: 'owner' }), error => error.code === 'ACCOUNT_MISMATCH');
  assert.equal(c.campaignSectionRevision, 7);
});

test('日期轨呈现科技事项与独立完成按钮，保留原备注', () => {
  const rows = new Element('rows');
  const { context: c } = harness(['renderDateTrack'], {
    elements: { dateTrackList: rows, dateTrackMeta: new Element('meta') },
    dateTrackData: { c2: { label: '时间表', events: { 12: '原印刷事件' } } },
    trackEntriesForRender: () => [{ day: 12 }], dateNoteKey: String, formatTrackDay: entry => entry.day,
    dateTrackIcons: () => [], renderCurrentDateNote() {}, keepCurrentDateVisible() {}, getAcclimationRule: () => null,
    structureTechTimelineItems: () => [{ type: 'event', text: '巨型柱廊 · 目标：梦行者 · 今日待办', event: event('reward', { due: true }) }],
  });
  c.state.dateNotes = { 12: '玩家备注' };
  c.renderDateTrack();
  const item = rows.children[0].children[0];
  assert.match(item.innerHTML, /原印刷事件/);
  assert.match(item.innerHTML, /玩家备注/);
  assert.match(item.className, /tech-scheduled/);
  assert.match(item.children[0].children[0].children[0].textContent, /巨型柱廊/);
  assert.equal(item.children[0].children[0].children[1].textContent, '已手动结算');
});

test('记忆训练科技战斗提醒不触发探索卡的官方定时战斗清理', async () => {
  const phases = [];
  const { context: c } = harness(['getStructureTechContext', 'structureTechEvents', 'structureTechTimelineItems',
    'isTrackBattleDay', 'dateTrackIcons', 'todayTrackIcons', 'completeTimelineBattle'], {
    dateTrackData: { c2: { entries: [{ day: 1 }, { day: 2 }], battleDays: [] } },
    dateIconTypes: { battle: { className: 'battle' } },
    processExplorationDelays: async phase => { phases.push(phase); return true; },
  });
  c.state.day = 2;
  c.state.nextBattleTerrain = { terrain: '仍待下次定时战斗' };
  c.state.techAutomation.events.simulation = event('simulation', { kind: 'battle', dueDay: 2, cooldownUntilDay: 13 });
  assert.equal(c.structureTechTimelineItems(2).length, 1);
  assert.equal(await c.completeTimelineBattle(), false);
  assert.deepEqual(phases, []);
  assert.equal(c.state.nextBattleTerrain.terrain, '仍待下次定时战斗');
});

test('dashboard inline scripts parse with the shared automation modules', () => {
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
});

test('dashboard references and old timeline/repair labels use dark-side names from the dictionary or synced snapshot', () => {
  const dictionary = require('../technology/tech_card_dictionary.min.json');
  const { context: c } = harness(['getStructureTechContext', 'structureTechEvents', 'structureTechTimelineItems',
    'technologyReferenceName', 'technologyReferenceText']);
  c.structureTechContext = { epoch: 1, profileId: 'A', cycleId: 'c2', dictionary };
  const tech = { key: "argo's mission", displayName: '阿尔戈号的任务', referenceName: '圆桌舰桥' };
  c.state.techAutomation.events.trade = event('trade', { techKey: tech.key, kind: 'cooldown', dueDay: 12,
    label: '阿尔戈号的任务 · 贸易与 7 天冷却' });
  assert.equal(c.technologyReferenceName({ ...tech, referenceName: undefined }), '圆桌舰桥');
  assert.match(c.structureTechTimelineItems(12)[0].text, /^圆桌舰桥 · 贸易与 7 天冷却/);
  assert.equal(c.technologyReferenceText(tech.key, '阿尔戈号的任务 已禁用；D31 发展步骤修复'),
    '圆桌舰桥 已禁用；D31 发展步骤修复');
  assert.equal(c.state.techAutomation.events.trade.label, '阿尔戈号的任务 · 贸易与 7 天冷却');
  c.structureTechContext = null;
  assert.equal(c.technologyReferenceName(tech), '圆桌舰桥');
});

test('conditional technology completion forwards the explicit player confirmation', async () => {
  const { context: c } = harness([...targeting, ...dueList, 'completeStructureTechEvent']);
  let submitted;
  c.structureTechClient = () => ({ complete: async target => { submitted = target; return { campaign: {} }; } });
  c.applyStructureTechCommit = async () => {};
  await c.completeStructureTechEvent('odyssey-follow', new Element('button'), { followedDirection: true });
  assert.equal(submitted.operationId, 'odyssey-follow');
  assert.equal(submitted.selection.followedDirection, true);
});
