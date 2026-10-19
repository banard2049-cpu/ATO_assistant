const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const rules = require('../assets/exploration-card-resource-rules.js');
const effectRules = require('../assets/exploration-card-effects.js');
const deckRules = require('../assets/exploration-card-rules.js');
const optionRules = require('../assets/exploration-card-options.js');
const delayRules = require('../assets/exploration-card-delays.js');
const choiceRules = require('../assets/exploration-card-choices.js');
const conditions = require('../assets/exploration-card-conditions.js');

function fn(name) {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}

function constant(name) {
  const match = source.match(new RegExp('^    const ' + name + ' = [^]*?^    };', 'm'));
  assert.ok(match, name);
  return match[0];
}

function loadDataset() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/exploration-card-resources.js'), 'utf8'), ctx);
  return ctx.window.ATO_EXPLORATION_CARD_RESOURCES;
}

const dataset = loadDataset();

test('pursuit waits for the priest choice and uses the resulting Fate threshold', async () => {
  const pursuit = require('../assets/exploration-pursuit.js');
  const priest = drawnEntry('6426', 'Hidden Temple');
  const cackle = drawnEntry('6436', 'Cackle', 1);
  const h = settleHarness({ cycle: 'c1', activePiles: [[priest], [cackle]],
    fullRecord: nextRecord('c1', { fate: '7' }) });
  const totals = [];
  h.ctx.window.ATO_EXPLORATION_PURSUIT = pursuit;
  h.ctx.document.querySelector = () => null;
  h.ctx.settleExplorationPursuit = async () => {
    totals.push(pursuit.countMarkers({ cycleId: 'c1', state: h.ctx.state, record: h.record }).total);
  };
  await h.ctx.settleExplorationDraw();
  assert.deepEqual(totals, [], 'the unresolved choice must not freeze a pursuit receipt');
  await h.ctx.completeExplorationDraw();
  assert.equal(h.drawState.activePiles.flat().length, 2, 'completion cannot bypass unresolved choices');
  assert.deepEqual(totals, []);
  await h.ctx.writeExplorationChoice(priest, 'choice:priest-offer', 'accept');
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c1.fate, '9');
  assert.deepEqual(totals, [4], 'Fate 8+ adds the fourth marker');
  assert.equal(h.drawState.activePiles.flat().length, 0);
});

test('the standalone pursuit action refuses unresolved exploration effects before writing', async () => {
  const h = settleHarness();
  let writes = 0;
  h.ctx.mapCommandBusy = false;
  h.ctx.pendingExplorationEffects = () => ['unresolved Fate choice'];
  h.ctx.beforeStructureTechSubmit = async () => { writes++; };
  vm.runInContext(fn('settleExplorationPursuit'), h.ctx);
  await assert.rejects(h.ctx.settleExplorationPursuit(), /先完成探索卡/);
  assert.equal(writes, 0);
});

function drawnEntry(id, name, pile = 0) {
  return { id, name, day: 12, removal: 'keep', draw: 'single', pile };
}

function textOf(node) {
  return [node.textContent, node.innerHTML, ...node.children.map(textOf)].filter(Boolean).join(' ');
}

function buttonNamed(block, label) {
  const button = block.buttons.find((item) => typeof label === 'string'
    ? item.textContent === label : label.test(item.textContent));
  assert.ok(button, `button ${label} exists in ${textOf(block)}`);
  return button;
}

function resourceButtons(block) {
  return block.children.find((node) => node.className === 'exploration-settle-actions').buttons;
}

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
    this.value = '';
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.parentNode = null;
  }
  // 真 DOM 的插入是"搬移"：同一个节点不会同时挂在两个父节点下。
  _detach(node) {
    if (node && node.parentNode) {
      const at = node.parentNode.children.indexOf(node);
      if (at >= 0) node.parentNode.children.splice(at, 1);
    }
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { this._detach(child); child.parentNode = this; this.children.push(child); return child; }
  prepend(...children) {
    [...children].reverse().forEach((child) => {
      this._detach(child);
      child.parentNode = this;
      this.children.unshift(child);
    });
  }
  replaceWith(replacement) { this.replacement = replacement; }
  // 旧测试直接调 `listeners.change()`／`listeners.click()`：这里把注册的监听器
  // 直接暴露成函数（同一个事件只留最后一个，和之前的桩一致）。
  addEventListener(type, listener) {
    this.listeners[type] = (...args) => { listener(...args); return undefined; };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      node.children.forEach((child) => {
        if (selector === 'button' && child.tag === 'button') found.push(child);
        walk(child);
      });
    };
    walk(this);
    return found;
  }
  get buttons() { return this.querySelectorAll('button'); }
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

function settleHarness(options = {}) {
  const written = [];
  const alerts = [];
  const confirmations = [];
  let diplomacyBonus = options.diplomacyBonus === undefined ? 1 : options.diplomacyBonus;
  const labels = { minoians: '米诺斯人', sunheirs: '太阳后裔' };
  // A stand-in for the record section of the save file: writes land here so a
  // second action (the undo) sees the value the first one produced.
  const cycle = options.cycle || 'c1';
  const server = { record: options.fullRecord || { cycle, resources: { ...(options.record || {}) } }, revision: 1 };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const drawState = {
    drawPile: [], activePiles: options.activePiles || [[], []], temporaryRemoved: [], permanentRemoved: [],
    history: [], discardPile: [], current: null,
  };
  const ctx = vm.createContext({
    window: {
      ATO_EXPLORATION_CARD_RESOURCES: dataset,
      ATO_EXPLORATION_RESOURCE_RULES: rules,
      ATO_EXPLORATION_EFFECT_RULES: effectRules,
      ATO_EXPLORATION_OPTION_RULES: optionRules,
      ATO_EXPLORATION_DELAY_RULES: delayRules,
      ATO_EXPLORATION_CHOICE_RULES: choiceRules,
      ATO_EXPLORATION_CONDITIONS: conditions,
      alert: (message) => { alerts.push(message); },
      confirm: (message) => {
        confirmations.push(message);
        return typeof options.confirm === 'function' ? options.confirm(message) : options.confirm !== false;
      },
    },
    document: {
      createElement: (tag) => new Element(tag),
      createDocumentFragment: () => new Element('#fragment'),
      createTextNode: (text) => { const node = new Element('#text'); node.textContent = text; return node; },
    },
    console,
    state: {
      exploration: { drawStateByCycle: { [cycle]: drawState } },
      day: options.day || 12,
      unlockedTech: options.unlockedTech || null,
      // currentMapFactions() 读这里（真实实现，不打桩）：AG 当前格所在的派系列表。
      mapCurrentTileFactions: options.factions === undefined ? ['minoians'] : options.factions,
      mapSnapshot: { currentTileId: '', currentTileFactions: [] },
      mapCurrentTileFactionLabels: [],
    },
    archive: { activeProfileId: 'test-campaign' },
    sessionUser: { id: 'test-account' },
    currentCycleConfig: () => ({ id: cycle }),
    mapFactionLabel: (cycleId, factionId) => labels[factionId] || factionId,
    diplomacyValue: (_cycleId, factionId, record) => typeof options.diplomacyFromRecord === 'function'
      ? options.diplomacyFromRecord(factionId, record)
      : Object.hasOwn(options.diplomacyByFaction || {}, factionId)
        ? options.diplomacyByFaction[factionId] : diplomacyBonus,
    diplomacyStatus: (_cycleId, value) => ({ label: '外交状态', bonus: value }),
    normalizeCampaignDay: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    isPlainObject: (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    escapeHtml: (value) => String(value ?? ''),
    readLocalArgoRecord: () => ({}),
    readServerArgoRecord: async () => ({ available: true, record: clone(server.record), revision: server.revision }),
    mergeArgoRecords: (base) => clone(base || {}),
    writeServerArgoRecord: async (record) => {
      server.record = record;
      server.revision += 1;
      written.push(clone(record));
      return { conflict: false, revision: server.revision };
    },
    appendRecordSyncLog: () => {},
    updateRecordLinks: () => {},
    recordSyncChannel: null,
    saveState: () => {},
    renderFlow: () => {},
    renderCardTrackDialog: () => {},
    ownsDashboardWriteLease: () => true,
    ensureExplorationDrawState: () => drawState,
    explorationRules: () => deckRules,
    getSelectedExplorationIds: () => [...drawState.drawPile, ...drawState.activePiles.flat().map((entry) => entry.id)],
    shuffleList: (entries) => [...entries],
    getStoryHref: ({ battle }) => `./story/index.html?book=${cycle}&module=battle&battle=${encodeURIComponent(battle || '')}`,
    refreshCachedArgoRecord: async () => { ctx.cachedArgoRecord = clone(server.record); },
    todayTrackIcons: () => [],
    // 探索步骤整体渲染：卡面/标签/特殊规则与折叠菜单都用最简桩，够跑通结构断言。
    getExplorationCornerNumber: () => '',
    getExplorationCardImageStyle: () => '',
    getExplorationCardTag: () => ({ removal: 'keep', draw: 'single' }),
    getExplorationSpecialRule: () => null,
    getDestructionPileIds: () => [],
    getDestructionCardIds: () => [],
    addCardToDestructionPile: () => {},
    createHiddenExplorationMenu: () => new Element('details'),
    createExplorationDestructionTools: () => null,
    applyExplorationSelection: () => {},
    restoreDefaultExplorationSelection: () => {},
    drawExplorationCard: () => {},
    settleExplorationDraw: () => {},
    completeExplorationDraw: () => {},
  });
  // Placement reminders use the actual card-face rules and dashboard helpers.
  // Dialog rendering stays outside this resource-settlement DOM harness.
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/story-doom-card-data.js'), 'utf8'), ctx);
  vm.runInContext([
    'const storyDoomData = window.ATO_STORY_DOOM_DATA;',
    constant('cardTrackGroups'),
    ...[
      'normalizeCounterValue', 'argoKnowledgeStart', 'normalizeCardTrackEntry', 'normalizeCardTracks',
      'activeStoryDoomData', 'ensureCardTracks', 'cardTrackCard', 'cardTrackPreviewCard',
      'cardTokenLimitText', 'cardTrackTokenState', 'cardTokenPlacementTargets',
      'renderCardTokenPlacementTools', 'refreshCardTokenViews', 'placeCardTrackToken',
      'remainingExplorationTokenPlacements', 'explorationTokenPlacementBlocked',
      'placeExplorationCardToken', 'createExplorationTokenPlacementTools',
      'explorationTokenPlacementQueue', 'queuedExplorationTokenTask', 'explorationTokenPlacementState',
      'pendingExplorationTokenReminders', 'syncExplorationTokenPlacementQueue', 'getExplorationStepTokenReminders',
      'updateExplorationTokenTask',
    ].map(fn),
    fn('explorationResourceRules'),
    fn('explorationResourceDataset'),
    fn('explorationCardResources'),
    fn('currentExplorationDiplomacy'),
    fn('explorationSettlementContext'),
    fn('normalizeExploration'),
    fn('explorationSettlementStore'),
    fn('getExplorationSettlement'),
    fn('clearExplorationSettlements'),
    fn('explorationEffectRules'),
    fn('explorationOptionRules'),
    fn('explorationChoiceRules'),
    fn('explorationDelayRules'),
    fn('explorationDayNumber'),
    fn('explorationRoundId'),
    fn('scheduleExplorationDelay'),
    fn('registerAutomaticExplorationDelays'),
    fn('processExplorationDelays'),
    fn('completeTimelineBattle'),
    'let explorationSettlePrepared = false;',
    fn('markExplorationSettlePrepared'),
    fn('completeExplorationDraw'),
    fn('createExplorationDelayCardTools'),
    fn('createDelayedExplorationStepTools'),
    fn('technologyReferenceName'),
    fn('technologyReferenceText'),
    fn('createExplorationOptionTools'),
    ...[...source.matchAll(/^    (?:async )?function (explorationCondition\w*)\(/gm)].map((match) => fn(match[1])),
    fn('explorationEffectState'),
    fn('explorationDashboardTracks'),
    fn('syncExplorationDashboardTracks'),
    fn('explorationBatchReceipt'),
    ...(source.includes('function syncExplorationBatchReceipt(') ? [fn('syncExplorationBatchReceipt')] : []),
    fn('explorationContextSnapshot'),
    fn('explorationCardContext'),
    fn('explorationBatchContext'),
    fn('structureSaveReminders'),
    fn('structureSaveHandledManually'),
    fn('prepareStructureSaveSettlement'),
    fn('createStructureSaveTools'),
    fn('structureWishSaveItem'),
    fn('explorationAutomaticTitanLosses'),
    fn('explorationSingleAutomaticEffect'),
    fn('settleSingleExplorationEffects'),
    fn('settleExplorationCard'),
    fn('explorationHasRecordOperation'),
    fn('explorationNeedsPlacement'),
    fn('explorationPlacementText'),
    fn('explorationManualPlacement'),
    fn('explorationNumericOnce'),
    fn('explorationLegacyGroupIds'),
    fn('explorationManagedChoices'),
    fn('explorationDelayManaged'),
    fn('applyExplorationOperation'),
    fn('revertExplorationOperation'),
    fn('writeExplorationChoice'),
    fn('applyAutomaticExploration'),
    fn('settleExplorationDraw'),
    fn('explorationEffectDescriptors'),
    fn('pendingExplorationEffects'),
    fn('mutateExplorationRecord'),
    fn('writeExplorationRecordEffects'),
    fn('writeExplorationResourceChanges'),
    ...(source.includes('function createExplorationEffectList(') ? [fn('createExplorationEffectList')] : []),
    fn('createExplorationSettleBlock'),
    fn('createExplorationChoiceTools'),
    fn('endExplorationDraw'),
    fn('returnTemporaryExplorationCards'),
    // 探索步骤整体渲染（归纳行放哪、派系行何时显示、两个折叠区怎么并排）
    constant('explorationSpecialRules'),
    constant('defaultExplorationSelections'),
    fn('getExplorationLibrary'),
    fn('getExplorationSpecialRule'),
    fn('getDestructionCardIds'),
    fn('getDestructionPileIds'),
    fn('applyExplorationSelection'),
    fn('restoreDefaultExplorationSelection'),
    fn('drawExplorationCard'),
    fn('getExplorationCard'),
    fn('createExplorationDestructionTools'),
    fn('createHiddenExplorationMenu'),
    fn('createExplorationTools'),
    fn('formatSignedNumber'),
    fn('currentMapFactions'),
    fn('currentMapFactionStatusItems'),
    fn('createExplorationFactionStatus'),
    constant('mapFactionLabelsByCycle'),
    constant('hiddenExplorationCards'),
    constant('explorationDecks'),
  ].join('\n'), ctx);
  // 测试要能直接改「AG 当前格所在派系」。
  ctx.setCurrentFactions = (ids) => { ctx.state.mapCurrentTileFactions = ids; };
  // Standalone card UI fixtures still represent an active draw, just as the real app does.
  if (options.activePiles === undefined) {
    const renderCard = ctx.createExplorationSettleBlock;
    ctx.createExplorationSettleBlock = (entry, ...args) => {
      if (!drawState.activePiles.flat().some(value => value.id === entry.id && value.day === entry.day)) drawState.activePiles[0].push(entry);
      return renderCard(entry, ...args);
    };
  }
  // index.html 里的代码会**重新赋值** cachedArgoRecord（写入成功后），所以它必须是
  // 上下文对象上的活属性，不能只是一次性的初始值。
  let cachedArgoRecord = clone(server.record);
  Object.defineProperty(ctx, 'cachedArgoRecord', {
    get: () => cachedArgoRecord,
    set: (value) => { cachedArgoRecord = value; },
    configurable: true,
    enumerable: true,
  });
  return {
    ctx,
    written,
    alerts,
    confirmations,
    drawState,
    get record() { return server.record; },
    get cachedRecord() { return cachedArgoRecord; },
    setDiplomacy: (bonus) => { diplomacyBonus = bonus; },
    updateServerRecord: (record) => { server.record = clone(record); server.revision += 1; },
  };
}

async function clickAndWait(button) {
  const listener = button.listeners.click;
  if (typeof listener === 'function') listener();
  else if (Array.isArray(listener)) listener.forEach((item) => item());
  await flushAsync();
}

async function flushAsync() {
  for (let tick = 0; tick < 20; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function nextRecord(cycle, stats = {}, resources = {}) {
  return { cycle, resources, cycleStats: { [cycle]: {
    fate: '0', hull: '4', crew: '3', strangers: '0', humanity: '4', paradox: '0', frozenTime: '2',
    loopLength: '10', babelianDebt: '0', ...stats,
    ...(cycle === 'c2' ? { crewCounters: { crew: 3, refugees: 0, captives: 0, ...stats.crewCounters } } : {}),
  } } };
}

test('four requested Hidden Truth preserves the final Crew and settles the threshold before the Fate bonus', async () => {
  for (const [paranoia, crew, fate, afterParanoia, afterCrew] of [
    [2, 3, 7, 3, 3], [3, 3, 7, 1, 2], [3, 1, 7, 1, 1], [6, 1, 0, 3, 1], [3, 0, 0, 0, 0],
  ]) {
    const entry = drawnEntry('10306', 'Hidden Truth');
    const h = settleHarness({ cycle: 'c5', activePiles: [[entry], []], fullRecord:
      nextRecord('c5', { paranoia: String(paranoia), crew: String(crew), fate: String(fate) }) });
    const block = h.ctx.createExplorationSettleBlock(entry);
    assert.equal(h.written.length, 0, 'rendering never applies the operation');
    await clickAndWait(buttonNamed(block, '自动结算'));
    assert.deepEqual(h.alerts, []);
    assert.equal(h.record.cycleStats.c5.crew, String(afterCrew));
    assert.equal(h.record.cycleStats.c5.paranoia, String(afterParanoia));
    assert.equal(h.ctx.pendingExplorationEffects().length, 0);
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.record.cycleStats.c5.paranoia, String(afterParanoia));
    const card = dataset.cards['c5:10306'];
    const context = h.ctx.explorationCardContext(entry, card);
    const core = h.ctx.explorationEffectDescriptors(entry, card, context).find(item => item.id === 'conditional:hidden-truth');
    await h.ctx.writeExplorationRecordEffects(entry, [core], context, [], true);
    assert.equal(h.record.cycleStats.c5.paranoia, String(paranoia));
    assert.equal(h.record.cycleStats.c5.crew, String(crew));
    assert.equal(entry.removal, 'keep');
  }
});

test('four requested Panic Spreads prefers Dreamwalkers and never triggers from its later Fate gain', async () => {
  for (const paranoia of [2, 3]) {
    const entry = drawnEntry('10310', 'Panic Spreads');
    const record = nextRecord('c5', { paranoia: String(paranoia), fate: '5' });
    record.titans = [{ id: 'dream', name: '梦行者', count: 2 }, { id: 'other', name: 'Other', count: 1 }];
    const h = settleHarness({ cycle: 'c5', activePiles: [[entry], []], fullRecord: record });
    await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '自动结算'));
    assert.deepEqual(h.alerts, []);
    assert.equal(h.record.titans[0].count, paranoia === 3 ? 1 : 2);
    assert.equal(h.record.titans[1].count, 1);
    assert.equal(h.record.cycleStats.c5.paranoia, '3');
    assert.equal(entry.removal, 'keep', 'Panic Spreads has a chain icon but no removal instruction');
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.record.titans[0].count, paranoia === 3 ? 1 : 2);
    assert.equal(h.ctx.pendingExplorationEffects().length, 0);
    const card = dataset.cards['c5:10310'];
    const context = h.ctx.explorationCardContext(entry, card);
    const core = h.ctx.explorationEffectDescriptors(entry, card, context).find(item => item.id === 'conditional:panic-spreads');
    await h.ctx.writeExplorationRecordEffects(entry, [core], context, [], true);
    assert.equal(h.record.titans[0].count, 2);
    assert.equal(h.record.cycleStats.c5.paranoia, String(paranoia));
  }
  const entry = drawnEntry('10310', 'Panic Spreads');
  const record = nextRecord('c5', { paranoia: '3', fate: '5' });
  record.titans = [{ id: 'a', name: 'A', count: 1 }, { id: 'b', name: 'B', count: 1 }];
  const h = settleHarness({ cycle: 'c5', activePiles: [[entry], []], fullRecord: record });
  const block = h.ctx.createExplorationSettleBlock(entry);
  assert.equal(block.descendants().filter(node => node.tag === 'select').length, 1);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.cycleStats.c5.paranoia, '3', 'the dependent bonus waits for a required Titan choice');
  const select = block.descendants().find(node => node.tag === 'select'); select.value = 'b';
  await clickAndWait(buttonNamed(block, '应用到记录表'));
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.titans.length, 1);
  assert.equal(h.record.titans[0].id, 'a');
  assert.equal(h.record.cycleStats.c5.paranoia, '3');
});

test('four requested Drown in Fear freezes its event check before the later bonus and clears it on undo', async () => {
  for (const before of [1, 2]) {
    const entry = drawnEntry('10314', 'Drown in Fear');
    const h = settleHarness({ cycle: 'c5', activePiles: [[entry], []], fullRecord: nextRecord('c5', { paranoia: String(before), fate: '5' }) });
    await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '自动结算'));
    assert.deepEqual(h.alerts, []);
    assert.equal(h.record.cycleStats.c5.paranoia, '3');
    if (before === 2) {
      assert.match(textOf(h.ctx.createExplorationSettleBlock(entry)), /Fractures/);
      assert.equal(h.ctx.pendingExplorationEffects().length, 2);
      await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '已处理其余效果'));
      await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '自动结算'));
      assert.equal(h.record.cycleStats.c5.paranoia, '4');
    }
    assert.equal(h.ctx.pendingExplorationEffects().length, 0);
    const card = dataset.cards['c5:10314'];
    const context = h.ctx.explorationCardContext(entry, card);
    const core = h.ctx.explorationEffectDescriptors(entry, card, context).find(item => item.id === 'conditional:drown-in-fear');
    assert.equal(Boolean(core.remainder), before === 2, 'a later bonus must not invent an earlier event');
    await h.ctx.writeExplorationRecordEffects(entry, [core], context, [], true);
    assert.equal(h.record.cycleStats.c5.paranoia, String(before));
    assert.equal(h.ctx.explorationEffectState(entry).manual[core.id], undefined);
  }
});

test('four requested Black Sludge uses Fate OR real Refugees and requires manual Doom placement', async () => {
  for (const [fate, refugees, expected] of [[7, 0, true], [6, 6, true], [7, 6, true], [6, 5, false], ['', 6, true], [7, '', true], ['', 5, null]]) {
    const entry = drawnEntry('13636', 'Black Sludge');
    const h = settleHarness({ cycle: 'c2', activePiles: [[entry], []], fullRecord:
      nextRecord('c2', { fate: String(fate), renegade: '9', crewCounters: { refugees } }) });
    const block = h.ctx.createExplorationSettleBlock(entry);
    const delayButtons = block.descendants().find(node => node.className === 'exploration-delay-tools')?.buttons || [];
    const green = block.buttons.find(button => button.textContent === '自动结算' && !delayButtons.includes(button));
    assert.equal(Boolean(green), false);
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
    assert.ok(h.ctx.pendingExplorationEffects().some(text => /方向|地图|水路/.test(text)), 'physical map tasks remain pending');
    if (expected === true) {
      assert.match(textOf(block), /灾祸模块选择位置并放置.*灾祸 \+1/);
      await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '已手动处理完整效果'));
      assert.ok(!h.ctx.pendingExplorationEffects().some(text => /灾祸/.test(text)));
      assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
    }
    assert.deepEqual(h.alerts, []);
  }
  const entry = drawnEntry('10314', 'Drown in Fear');
  const h = settleHarness({ cycle: 'c5', activePiles: [[entry], []], fullRecord: nextRecord('c5', { paranoia: '', fate: '5' }) });
  const block = h.ctx.createExplorationSettleBlock(entry);
  assert.ok(!block.buttons.some(button => button.textContent === '自动结算'));
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.cycleStats.c5.paranoia, '', 'unknown core stats also block later bonuses');
});

test('manual placement Progress once-only gains register their limit before story placement without writing the track', async () => {
  const entry = { ...drawnEntry('13515', 'Once-only Progress'), drawnAt: 'first' };
  const h = settleHarness({ cycle: 'c3', diplomacyBonus: 2, activePiles: [[entry], []], fullRecord: nextRecord('c3') });
  h.ctx.state.cardTracks = { story: { progress: 2 }, doom: { doom: 3 }, inwardOdyssey: { position: 4 } };
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.ctx.explorationDashboardTracks(h.record).progress, 2);
  assert.ok(h.ctx.pendingExplorationEffects().some(text => /收益.*限制/.test(text)));
  const block = h.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(block), /登记收益后，在故事或灾祸模块放置指示物/);
  await clickAndWait(buttonNamed(block, '确认收益，登记次数限制'));
  assert.deepEqual(h.alerts, []);
  assert.equal(h.ctx.explorationDashboardTracks(h.record).progress, 2);
  assert.equal(h.record.explorationDelays.queue.filter(item => item.onceKey && item.status === 'waiting').length, 1);
  assert.equal(h.ctx.pendingExplorationEffects(false).length, 0);
  const reminders = h.ctx.getExplorationStepTokenReminders('story');
  assert.equal(reminders.length, 1);
  assert.match(reminders[0].title, /进展 \+1/);
  const queued = reminders[0].explorationToken;
  assert.equal(queued.item.manualPlacements[0].target, 'inwardOdyssey');
  assert.equal(h.ctx.explorationTokenPlacementBlocked(queued.entry, queued.item), '');
  const repeated = { ...drawnEntry('13515', 'Once-only Progress'), drawnAt: 'second', day: 13 };
  h.drawState.activePiles = [[repeated], []];
  assert.ok(!h.ctx.createExplorationSettleBlock(repeated).buttons.some(button => button.textContent === '确认收益，登记次数限制'));
  await h.ctx.settleExplorationCard(repeated);
  assert.equal(h.ctx.explorationDashboardTracks(h.record).progress, 2);
  assert.equal(h.ctx.pendingExplorationEffects().length, 0);
  assert.equal(h.ctx.getExplorationStepTokenReminders('story').length, 1, 'the repeated draw must not add another once-only reward');
  assert.equal(h.ctx.placeExplorationCardToken(queued.entry, queued.item, 'inwardOdyssey', 'progress'), true);
  assert.equal(h.ctx.state.cardTracks.inwardOdyssey.progress, 1);
  assert.equal(h.ctx.getExplorationStepTokenReminders('story').length, 0);
});

test('manual placement a chosen Doom branch records the decision but still waits for a placement location', async () => {
  const entry = drawnEntry('13639', 'Moral Erosion');
  const h = settleHarness({ cycle: 'c2', activePiles: [[entry], []], fullRecord: nextRecord('c2') });
  h.ctx.createExplorationSettleBlock(entry);
  await h.ctx.writeExplorationChoice(entry, 'choice:moral-erosion', 'doom');
  assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
  assert.match(h.ctx.pendingExplorationEffects().join(' '), /灾祸模块选择位置并放置.*灾祸 \+1/);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '已手动放置'));
  assert.equal(h.ctx.pendingExplorationEffects().length, 0);
  assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '撤销选择结算'));
  await h.ctx.writeExplorationChoice(entry, 'choice:moral-erosion', 'humanity');
  assert.equal(h.record.cycleStats.c2.humanity, '3');
  assert.equal(h.ctx.pendingExplorationEffects().length, 0);
});

test('manual placement old Progress receipts remain undoable and are never granted again automatically', async () => {
  const entry = drawnEntry('9341', 'Waster Caravan');
  const old = effectRules.apply(nextRecord('c4'), 'c4', [{ type: 'progress', amount: 1 }], { stats: { progress: 2 } });
  const h = settleHarness({ cycle: 'c4', diplomacyBonus: 2, activePiles: [[entry], []], fullRecord: old.record });
  h.ctx.state.cardTracks = { story: { progress: 3 }, doom: { doom: 0 }, inwardOdyssey: { position: 0 } };
  h.ctx.state.exploration.trackReceiptsByCycle = { c4: Object.fromEntries(old.record.explorationTrackTransactions.map(item => [item.id, true])) };
  h.ctx.explorationEffectState(entry).applied['manual:1'] = { changes: old.changes, summary: old.summary, ruleVersion: 2 };
  const block = h.ctx.createExplorationSettleBlock(entry);
  assert.ok(!h.ctx.pendingExplorationEffects().some(text => /放置/.test(text)), 'old written gains must not be placed twice');
  await clickAndWait(buttonNamed(block, '撤销记录表效果'));
  assert.equal(h.ctx.explorationDashboardTracks(h.record).progress, 2);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.ctx.explorationDashboardTracks(h.record).progress, 2);
  assert.match(h.ctx.pendingExplorationEffects().join(' '), /故事模块选择位置并放置.*进展 \+1/);
});

test('next exploration numeric branches write once and undo both tracks and removal', async () => {
  for (const [cycle, id, stats, field, after, removal] of [
    ['c2', '13630', { fate: '8', crewCounters: { refugees: 2 } }, 'hull', '3', 'remove'],
    ['c3', '13540', { paradox: '3' }, 'loopLength', '9', 'permanent'],
    ['c4', '9330', { babelianDebt: '3' }, 'babelianDebt', '1', 'remove'],
  ]) {
    const entry = drawnEntry(id, 'Numeric branch');
    const h = settleHarness({ cycle, activePiles: [[entry], []], fullRecord: nextRecord(cycle, stats) });
    const before = h.record.cycleStats[cycle][field];
    assert.equal(h.written.length, 0);
    await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '自动结算'));
    assert.deepEqual(h.alerts, []);
    assert.equal(h.record.cycleStats[cycle][field], after);
    assert.equal(entry.removal, removal);
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.record.cycleStats[cycle][field], after, 'repeated clicks must not apply the branch twice');
    await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '撤销记录表效果'));
    assert.equal(h.record.cycleStats[cycle][field], before);
    assert.equal(entry.removal, 'keep');
  }
  const titan = drawnEntry('13632', 'Triskelion System');
  const record = nextRecord('c2', { fate: '6', crewCounters: { refugees: 1 } });
  record.titans = [{ id: 'dream', name: '梦行者', count: 2 }, { id: 'other', name: 'Other', count: 1 }];
  const h = settleHarness({ cycle: 'c2', activePiles: [[titan], []], fullRecord: record });
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(titan), '自动结算'));
  assert.equal(h.record.titans[0].count, 1);
  assert.equal(h.record.titans[1].count, 1);
  assert.equal(titan.removal, 'remove');
});

test('next exploration Ambrosia uses latest stock rounded up and delta undo preserves later edits', async () => {
  const entry = drawnEntry('13635', 'Ambrosia Spill');
  const h = settleHarness({ cycle: 'c2', activePiles: [[entry], []], fullRecord:
    nextRecord('c2', { fate: '8' }, { 'c2-violentAmbrosia': 33 }) });
  const button = buttonNamed(h.ctx.createExplorationSettleBlock(entry), '自动结算');
  h.updateServerRecord(nextRecord('c2', { fate: '8' }, { 'c2-violentAmbrosia': 35 }));
  await clickAndWait(button);
  assert.deepEqual(h.alerts, []);
  assert.equal(h.record.resources['c2-violentAmbrosia'], 18);
  assert.equal(h.record.cycleStats.c2.hull, '3');
  assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
  assert.match(textOf(h.ctx.createExplorationSettleBlock(entry)), /灾祸模块选择位置并放置.*灾祸 \+1/);
  assert.equal(entry.removal, 'remove');
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.resources['c2-violentAmbrosia'], 18);
  const later = structuredClone(h.record);
  later.resources['c2-violentAmbrosia'] += 3;
  h.updateServerRecord(later);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '撤销记录表效果'));
  assert.equal(h.record.resources['c2-violentAmbrosia'], 38);
  assert.equal(h.record.cycleStats.c2.hull, '4');
  assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0);
  assert.equal(entry.removal, 'keep');
  const quiet = drawnEntry('13635', 'Ambrosia Spill');
  const noOp = settleHarness({ cycle: 'c2', activePiles: [[quiet], []], fullRecord: nextRecord('c2', {}, { 'c2-violentAmbrosia': 15 }) });
  await clickAndWait(buttonNamed(noOp.ctx.createExplorationSettleBlock(quiet), '自动结算'));
  assert.equal(noOp.ctx.pendingExplorationEffects().length, 0, 'the 0–15 tier is a completed no-op');
  assert.equal(quiet.removal, 'remove');
});

test('next exploration choices stay pending until selected and freeze a resolved branch', async () => {
  const moral = drawnEntry('13639', 'Moral Erosion');
  const h = settleHarness({ cycle: 'c2', activePiles: [[moral], []], fullRecord: nextRecord('c2') });
  const block = h.ctx.createExplorationSettleBlock(moral);
  const select = block.descendants().find(node => node.tag === 'select');
  const button = buttonNamed(block, '选择后结算');
  assert.equal(button.disabled, true);
  await h.ctx.settleExplorationCard(moral);
  assert.equal(h.record.cycleStats.c2.humanity, '4');
  assert.equal(h.ctx.pendingExplorationEffects().length, 1);
  select.value = 'humanity'; select.listeners.change();
  assert.equal(button.disabled, false);
  await clickAndWait(button);
  assert.deepEqual(h.alerts, []);
  assert.equal(h.record.cycleStats.c2.humanity, '3');
  await h.ctx.writeExplorationChoice(moral, 'choice:moral-erosion', 'doom');
  assert.equal(h.ctx.explorationDashboardTracks(h.record).doom, 0, 'a second choice cannot replace an applied choice');
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(moral), '撤销选择结算'));
  assert.equal(h.record.cycleStats.c2.humanity, '4');
  const chekhov = drawnEntry('13534', 'Chekhov');
  const low = settleHarness({ cycle: 'c3', activePiles: [[chekhov], []], fullRecord: nextRecord('c3', { paradox: '2' }) });
  await clickAndWait(buttonNamed(low.ctx.createExplorationSettleBlock(chekhov), '自动结算'));
  assert.equal(low.record.cycleStats.c3.paradox, '3');
  assert.equal(low.ctx.createExplorationSettleBlock(chekhov).descendants().filter(node => node.tag === 'select').length, 0);
  await low.ctx.settleExplorationCard(chekhov);
  assert.equal(low.record.cycleStats.c3.frozenTime, '2', 'the newly reached threshold cannot grant a second branch');
  await clickAndWait(buttonNamed(low.ctx.createExplorationSettleBlock(chekhov), '撤销记录表效果'));
  assert.equal(low.record.cycleStats.c3.paradox, '2');
  const highEntry = drawnEntry('13534', 'Chekhov');
  const high = settleHarness({ cycle: 'c3', activePiles: [[highEntry], []], fullRecord: nextRecord('c3', { paradox: '3' }) });
  high.ctx.createExplorationSettleBlock(highEntry);
  await high.ctx.writeExplorationChoice(highEntry, 'choice:chekhov-loss', 'hull');
  assert.equal(high.record.cycleStats.c3.frozenTime, '1');
  assert.equal(high.record.cycleStats.c3.hull, '3');
});

test('next exploration optional Priest offers do not accept on draw or one-click settlement', async () => {
  const entry = drawnEntry('6426', 'Priest');
  const h = settleHarness({ activePiles: [[entry], []], fullRecord: nextRecord('c1', {}, { priests: 1 }) });
  h.ctx.createExplorationSettleBlock(entry);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.resources.priests, 1);
  assert.equal(h.record.cycleStats.c1.fate, '0');
  await h.ctx.writeExplorationChoice(entry, 'choice:priest-offer', 'decline');
  assert.equal(h.ctx.pendingExplorationEffects().length, 0);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '撤销选择结算'));
  await h.ctx.writeExplorationChoice(entry, 'choice:priest-offer', 'accept');
  assert.equal(h.record.resources.priests, 2);
  assert.equal(h.record.cycleStats.c1.fate, '3');
});

test('next exploration Dues shows affordable stocks and pays inventory plus tracks atomically', async () => {
  const key = resource => dataset.cycles.c4.resources[resource].storageKey;
  const entry = drawnEntry('9329', 'Diminishing Returns');
  const initial = nextRecord('c4', { fate: '7' }, { [key('cursedDerelict')]: 3, [key('imperialScroll')]: 1, [key('babylonianContraption')]: 1 });
  const h = settleHarness({ cycle: 'c4', activePiles: [[entry], []], fullRecord: initial });
  const block = h.ctx.createExplorationSettleBlock(entry);
  const select = block.descendants().find(node => node.tag === 'select');
  assert.deepEqual(select.children.map(node => node.value), ['', 'cursedDerelict', 'babylonianContraption']);
  assert.match(select.children[1].textContent, /（库存 3）/);
  const expected = optionRules.duesPlan(h.record, 'c4', dataset);
  const changed = structuredClone(initial); changed.resources[key('cursedDerelict')] = 4;
  h.updateServerRecord(changed);
  await assert.rejects(h.ctx.writeExplorationChoice(entry, 'choice:dues', 'babylonianContraption', expected), /已变化/);
  assert.equal(h.record.cycleStats.c4.hull, '4');
  assert.equal(h.record.resources[key('babylonianContraption')], 1);
  await h.ctx.writeExplorationChoice(entry, 'choice:dues', 'babylonianContraption', optionRules.duesPlan(h.record, 'c4', dataset));
  assert.equal(h.record.resources[key('babylonianContraption')], 0);
  assert.equal(h.record.cycleStats.c4.hull, '3');
  assert.equal(entry.removal, 'permanent');
  const later = structuredClone(h.record); later.resources[key('babylonianContraption')] = 2;
  h.updateServerRecord(later);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '撤销选择结算'));
  assert.equal(h.record.resources[key('babylonianContraption')], 3);
  assert.equal(h.record.cycleStats.c4.hull, '4');
  assert.equal(entry.removal, 'keep');
  const fallback = drawnEntry('9329', 'Diminishing Returns');
  const poor = settleHarness({ cycle: 'c4', activePiles: [[fallback], []], fullRecord: nextRecord('c4', { fate: '7', babelianDebt: '3' }) });
  await clickAndWait(buttonNamed(poor.ctx.createExplorationSettleBlock(fallback), '自动结算'));
  assert.deepEqual(poor.alerts, []);
  assert.equal(poor.record.cycleStats.c4.hull, '3');
  assert.equal(poor.ctx.explorationDashboardTracks(poor.record).doom, 0);
  assert.match(textOf(poor.ctx.createExplorationSettleBlock(fallback)), /灾祸模块选择位置并放置.*灾祸 \+1/);
  await clickAndWait(buttonNamed(poor.ctx.createExplorationSettleBlock(fallback), '已处理其余效果'));
  assert.equal(poor.ctx.pendingExplorationEffects().length, 0);
});

test('next exploration map event snapshots gate later rewards without inventing a new event', async () => {
  for (const before of [0, 1]) {
    const entry = drawnEntry('6437', 'Maze Pilgrim');
    const h = settleHarness({ factions: ['labyrinthians'], activePiles: [[entry], []],
      fullRecord: nextRecord('c1', { strangers: String(before), fate: '5' }) });
    await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '自动结算'));
    assert.deepEqual(h.alerts, []);
    assert.equal(h.record.cycleStats.c1.strangers, '3');
    const core = h.ctx.explorationEffectDescriptors(entry, dataset.cards['c1:6437'], h.ctx.explorationCardContext(entry, dataset.cards['c1:6437']))
      .find(item => item.id === 'conditional:maze-pilgrim');
    assert.equal(Boolean(core.remainder), before === 1, 'later Fate bonus must not retroactively enable the preceding event');
    if (before === 1) {
      assert.equal(h.ctx.pendingExplorationEffects().length, 2);
      await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '已处理其余效果'));
      await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '自动结算'));
      assert.equal(h.record.cycleStats.c1.strangers, '4');
    }
    assert.equal(h.ctx.pendingExplorationEffects().length, 0);
    const context = h.ctx.explorationCardContext(entry, dataset.cards['c1:6437']);
    await h.ctx.writeExplorationRecordEffects(entry, [core], context, [], true);
    assert.equal(h.record.cycleStats.c1.strangers, String(before), 'undoing the core also reverses the later dependent bonus');
    assert.equal(h.ctx.explorationEffectState(entry).manual[core.id], undefined, 'undo clears the event completion');
    await h.ctx.settleExplorationCard(entry);
    const repeated = h.ctx.explorationEffectDescriptors(entry, dataset.cards['c1:6437'], h.ctx.explorationCardContext(entry, dataset.cards['c1:6437']))
      .find(item => item.id === core.id);
    assert.equal(Boolean(repeated.remainder), before === 1, 'undo and reapply preserve the original event order');
  }
  const lenders = drawnEntry('9334', 'Curselenders');
  const h = settleHarness({ cycle: 'c4', factions: ['cloudThieves'], diplomacyBonus: -3, activePiles: [[lenders], []],
    fullRecord: nextRecord('c4', { babelianDebt: '1' }) });
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(lenders), '自动结算'));
  assert.equal(h.record.cycleStats.c4.babelianDebt, '3');
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(lenders), '已处理其余效果'));
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(lenders), '自动结算'));
  assert.equal(h.record.cycleStats.c4.babelianDebt, '4');
});

test('next exploration Tomorrow waits for its event and restores the original removal through cascade undo', async () => {
  for (const fate of ['0', '7']) {
    const entry = drawnEntry('13541', 'Tomorrow’s Edge');
    const h = settleHarness({ cycle: 'c3', factions: ['sunheirs'], activePiles: [[entry], []], fullRecord: nextRecord('c3', { paradox: '2', fate }) });
    const first = h.ctx.createExplorationSettleBlock(entry);
    assert.equal(first.descendants().filter(node => node.tag === 'select').length, 0);
    await clickAndWait(buttonNamed(first, '自动结算'));
    assert.equal(h.record.cycleStats.c3.paradox, '3');
    const waiting = h.ctx.createExplorationSettleBlock(entry);
    assert.equal(waiting.descendants().filter(node => node.tag === 'select').length, 0);
    await assert.rejects(h.ctx.writeExplorationChoice(entry, 'choice:tomorrows-edge-fallback', 'decline'), /特殊事件/);
    await clickAndWait(buttonNamed(waiting, '已处理其余效果'));
    await h.ctx.writeExplorationChoice(entry, 'choice:tomorrows-edge-fallback', 'decline');
    assert.equal(h.record.cycleStats.c3.paradox, '3');
    assert.equal(entry.removal, fate === '7' ? 'remove' : 'permanent');
    const card = dataset.cards['c3:13541'];
    const context = h.ctx.explorationCardContext(entry, card);
    const core = h.ctx.explorationEffectDescriptors(entry, card, context).find(item => item.id === 'conditional:tomorrows-edge-map');
    await h.ctx.writeExplorationRecordEffects(entry, [core], context, [], true);
    assert.equal(h.record.cycleStats.c3.paradox, '2');
    assert.equal(entry.removal, 'keep');
    assert.deepEqual(Object.keys(h.ctx.explorationEffectState(entry).applied), []);
    assert.equal(h.ctx.explorationEffectState(entry).manual[core.id], undefined);
  }
});

test('next exploration legacy partial receipts block a new whole-group settlement until undone', async () => {
  const entry = drawnEntry('13630', 'Argo Engines');
  const h = settleHarness({ cycle: 'c2', activePiles: [[entry], []], fullRecord: nextRecord('c2', { crewCounters: { refugees: 2 } }) });
  const local = h.ctx.explorationEffectState(entry);
  local.applied['manual:0'] = { changes: [{ type: 'hull', amount: -1, cycleId: 'c2' }], summary: '船体 -1' };
  const block = h.ctx.createExplorationSettleBlock(entry);
  assert.ok(!block.buttons.some(node => node.textContent === '自动结算'));
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.cycleStats.c2.hull, '4', 'new grouping cannot repeat an existing partial effect');
  assert.match(textOf(block), /旧版分项/);
  assert.ok(block.buttons.some(node => node.textContent === '撤销记录表效果'));
});

test('Dreamwalker gains stay healthy and automatic Titan losses still prefer existing Dreamwalkers',async()=>{
  const titans=[{id:'dream',name:'梦行者',count:2,limit:1,crippled:true},
    {id:'other',name:'Other',count:2},{id:'last',name:'Last',count:1}];
  const original={cycle:'c4',resources:{},titans};
  const gained=effectRules.apply(original,'c4',[{type:'titan',amount:2}]);
  assert.equal(gained.record.titans.length,4);
  assert.deepEqual(gained.record.titans.slice(0,3),titans,'existing states and quantities stay unchanged');
  const healthy=gained.record.titans.find(item=>item.name==='梦行者'&&!item.crippled);
  assert.equal(healthy.count,2);assert.equal(healthy.crippled,false);
  assert.deepEqual(effectRules.revert(gained.record,gained.changes),original);
  for (const amount of [1,2]) {
    const lost=effectRules.apply(original,'c4',[{type:'titan',amount:-amount}]);
    assert.deepEqual(lost.record.titans.filter(item=>item.id!=='dream'),titans.slice(1));
    assert.equal(lost.record.titans.find(item=>item.id==='dream')?.count || 0,2-amount);
    assert.deepEqual(effectRules.revert(lost.record,lost.changes),original);
  }
  assert.equal(effectRules.automaticTitanLosses(original,3),null,'remaining ambiguous losses need a choice');
  const chosen=effectRules.apply(original,'c4',[{type:'titan',amount:-3}],{titanLosses:[{id:'last',count:1}]});
  assert.deepEqual(chosen.record.titans,[titans[1]]);
  assert.deepEqual(effectRules.revert(chosen.record,chosen.changes),original);
  const gainEntry=drawnEntry('9313','Titan');
  const gain=settleHarness({cycle:'c4',diplomacyBonus:0,activePiles:[[gainEntry],[]],fullRecord:{...original,fate:'0'}});
  await clickAndWait(buttonNamed(gain.ctx.createExplorationSettleBlock(gainEntry),'自动结算'));
  assert.equal(gain.record.titans.length,4);
  assert.deepEqual(gain.record.titans.slice(0,3),titans);
  const awarded=gain.record.titans.find(item=>item.name==='梦行者'&&!item.crippled);
  assert.equal(awarded.count,1);assert.equal(awarded.crippled,false);
  const lossEntry=drawnEntry('13624','Cyclopean Shrine');
  const loss=settleHarness({cycle:'c2',activePiles:[[lossEntry],[]],fullRecord:{cycle:'c2',resources:{},renegade:'0',cycleStats:{c2:{crewCounters:{crew:3,refugees:4,captives:0}}},titans}});
  const block=loss.ctx.createExplorationSettleBlock(lossEntry);
  assert.equal(block.descendants().filter(node=>node.tag==='select').length,0);
  await clickAndWait(buttonNamed(block,'自动结算'));
  assert.deepEqual(loss.alerts,[]);assert.equal(loss.record.titans[0].count,1);
  assert.deepEqual(loss.record.titans.slice(1),titans.slice(1));
});

test('confirmed icon cards use real fields and once-only gains share the numeric settlement and undo',async()=>{
  const fateEntry=drawnEntry('13617','Shrine of Aristaeus');
  const fate=settleHarness({cycle:'c2',activePiles:[[fateEntry],[]],fullRecord:{cycle:'c2',resources:{},fate:'8',cycleStats:{c2:{fate:'8',crewCounters:{crew:5,refugees:0,captives:0}}}}});
  fate.ctx.window.ATO_EXPLORATION_CARD_RESOURCES={...dataset,cards:{...dataset.cards,'c2:13617':{
    ...dataset.cards['c2:13617'],manual:[{text:'Lose -3 Argo Fate.',badge:'Argo Fate/7+'}],
  }}};
  await clickAndWait(buttonNamed(fate.ctx.createExplorationSettleBlock(fateEntry),'自动结算'));
  assert.equal(fate.record.fate,'5');
  await clickAndWait(buttonNamed(fate.ctx.createExplorationSettleBlock(fateEntry),'撤销记录表效果'));
  assert.equal(fate.record.fate,'8','a now-false threshold does not hide an applied effect or its undo');
  const nymph=drawnEntry('13530','Delphian Fleet');
  const h=settleHarness({cycle:'c3',diplomacyBonus:2,activePiles:[[nymph],[]],fullRecord:{cycle:'c3',resources:{},nymphCharges:'1',nymphLimit:'3',fate:'0'}});
  const card=h.ctx.createExplorationSettleBlock(nymph);
  assert.match(textOf(card),/宁芙召唤充能 \+1/);
  await clickAndWait(buttonNamed(card,'自动结算'));
  assert.equal(h.record.nymphCharges,'2');assert.equal(h.record.titans,undefined);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(nymph),'撤销记录表效果'));
  assert.equal(h.record.nymphCharges,'1');
  for(const [cycle,id,type] of [['c4','9339','knowledge']]) {
    const entry={...drawnEntry(id,'Once-only icon'),drawnAt:'first'};
    const once=settleHarness({cycle,diplomacyBonus:2,activePiles:[[entry],[]],fullRecord:{cycle,resources:{},fate:'0'}});
    const initialKnowledge=once.ctx.argoKnowledgeStart(cycle)+3;
    once.ctx.state.cardTracks={story:{progress:2},inwardOdyssey:{position:initialKnowledge}};
    const initial=type==='progress'?2:initialKnowledge;
    await clickAndWait(buttonNamed(once.ctx.createExplorationSettleBlock(entry),'自动结算'));
    assert.deepEqual(once.alerts,[]);
    assert.equal(once.ctx.explorationDashboardTracks(once.record)[type],initial+1);
    assert.equal(once.record.explorationDelays.queue.filter(item=>item.onceKey && item.status==='waiting').length,1);
    const second={...drawnEntry(id,'Once-only icon'),day:13,drawnAt:'second'};
    once.drawState.activePiles=[[second],[]];
    const blocked=once.ctx.createExplorationSettleBlock(second);
    assert.match(textOf(blocked),/已经触发/);
    await once.ctx.settleExplorationCard(second);
    assert.equal(once.ctx.explorationDashboardTracks(once.record)[type],initial+1);
    await once.ctx.processExplorationDelays('timeline-battle-end',{timelineBattle:true,eventId:'verified-battle'});
    const third={...drawnEntry(id,'Once-only icon'),day:14,drawnAt:'third'};
    once.drawState.activePiles=[[third],[]];
    await clickAndWait(buttonNamed(once.ctx.createExplorationSettleBlock(third),'自动结算'));
    assert.equal(once.ctx.explorationDashboardTracks(once.record)[type],initial+2);
    await clickAndWait(buttonNamed(once.ctx.createExplorationSettleBlock(third),'撤销记录表效果'));
    assert.equal(once.ctx.explorationDashboardTracks(once.record)[type],initial+1);
    assert.equal(once.record.explorationDelays.queue.filter(item=>item.onceKey && item.status==='waiting').length,0);
  }
});

test('Weight of Obligations uses one green button and sequential Debt losses with the one-Crew exception',async()=>{
  for (const [debt,crew,fate,expectedDebt,expectedCrew] of [
    [6,5,6,3,4], [3,5,7,2,4], [3,1,7,3,1], [2,5,6,1,5], [0,1,7,3,1], [2,0,6,1,0],
  ]) {
    const entry=drawnEntry('9340','Weight of Obligations');
    const initial={cycle:'c4',resources:{},cycleStats:{c4:{babelianDebt:String(debt),crew:String(crew),fate:String(fate)}}};
    const h=settleHarness({cycle:'c4',activePiles:[[entry],[]],fullRecord:initial});
    const block=h.ctx.createExplorationSettleBlock(entry);
    assert.ok(!block.descendants().some(node=>node.className==='exploration-settle-manual'));
    assert.equal(h.written.length,0);
    await clickAndWait(buttonNamed(block,'自动结算'));
    assert.deepEqual(h.alerts,[]);assert.equal(h.written.length,1);
    assert.equal(h.record.cycleStats.c4.babelianDebt,String(expectedDebt));
    assert.equal(h.record.cycleStats.c4.crew,String(expectedCrew));
    assert.equal(h.ctx.pendingExplorationEffects().length,0);
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.record.cycleStats.c4.babelianDebt,String(expectedDebt));
    await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry),'撤销记录表效果'));
    assert.equal(h.record.cycleStats.c4.babelianDebt,String(debt));
    assert.equal(h.record.cycleStats.c4.crew,String(crew));
  }
  const entry=drawnEntry('9340','Weight of Obligations');
  const h=settleHarness({cycle:'c4',activePiles:[[entry],[]],fullRecord:{cycle:'c4',resources:{},cycleStats:{c4:{babelianDebt:'6',crew:'5',fate:'6'}}}});
  const before=h.ctx.createExplorationSettleBlock(entry);
  h.updateServerRecord({cycle:'c4',resources:{},cycleStats:{c4:{babelianDebt:'3',crew:'1',fate:'7'}}});
  await clickAndWait(buttonNamed(before,'自动结算'));
  assert.equal(h.record.cycleStats.c4.babelianDebt,'3');assert.equal(h.record.cycleStats.c4.crew,'1');
  const missing=settleHarness({cycle:'c4',activePiles:[[entry],[]],fullRecord:{cycle:'c4',resources:{},cycleStats:{c4:{babelianDebt:'3',fate:'7'}}}});
  const manual=missing.ctx.createExplorationSettleBlock(entry);
  assert.ok(!manual.buttons.some(button=>button.textContent==='自动结算'));
  assert.ok(manual.descendants().some(node=>node.className==='exploration-settle-manual'));
});

test('Fate Hull and Babelian Debt pictured cards resolve resources and their real counters together',async()=>{
  for(const [cycle,id,bonus,type,before,after] of [['c3','13519',2,'fate','4','3'],['c4','9300',-3,'hull','4','3'],['c4','9337',-2,'babelianDebt','2','4']]){
    const entry=drawnEntry(id,'Pictured card'),card=dataset.cards[`${cycle}:${id}`];
    const h=settleHarness({cycle,diplomacyBonus:bonus,activePiles:[[entry],[]],fullRecord:{cycle,resources:{},[type]:before,cycleStats:{[cycle]:{[type]:before}}}});
    await h.ctx.settleExplorationDraw();
    assert.equal(h.alerts.length,0);assert.equal(h.record.cycleStats[cycle][type],after);
    assert.equal(h.record[type],after);
    const grant=card.grants[0],key=dataset.cycles[cycle].resources[grant.resource].storageKey;
    assert.equal(h.record.resources[key],grant.amount);
    const context=h.ctx.explorationCardContext(entry,card);
    const item=h.ctx.explorationEffectDescriptors(entry,card,context)[0];
    assert.equal(item.remainder,'');
    await h.ctx.writeExplorationRecordEffects(entry,[item],context,[]);
    assert.equal(h.record[type],after,'an existing receipt prevents a repeat');
    await h.ctx.writeExplorationRecordEffects(entry,[item],context,[],true);
    assert.equal(h.record[type],before);assert.equal(h.record.resources[key],grant.amount);
  }
  const locked=effectRules.apply({cycle:'c2',hull:'4'},'c2',[{type:'hull',amount:3}]);
  assert.equal(locked.record.hull,'5');assert.equal(locked.changes[0].amount,1);
  assert.equal(effectRules.revert(locked.record,locked.changes).hull,'4');
  assert.deepEqual(effectRules.parse('Gain +1 ICON(black emblem glyph).','c3','13517','Denounced-').effects,[{type:'doom',amount:1}]);
  assert.deepEqual(effectRules.parse('Lose -1 ICON(dark round glyph with a pale inner emblem).','c5','10323','Aligned with Nemesis').effects,[{type:'hull',amount:-1}]);
});

test('all cycles retain card selection and temporary pile entrances even when both piles are empty',()=>{
  for(const cycle of ['c1','c2','c3','c4','c5']){
    const h=settleHarness({cycle});
    h.ctx.createExplorationDestructionTools=()=>null;
    const ui=h.ctx.createExplorationTools();
    const panes=ui.children.find(node=>node.className==='exploration-removed-piles');
    assert.ok(panes,cycle+' has attached card library and removed-pile controls');
    const builder=panes.children.find(node=>node.className==='exploration-builder');
    const removed=panes.children.find(node=>node.className==='exploration-removed-pile');
    assert.ok(builder,cycle+' has its card library');
    assert.ok(removed && !removed.hidden,cycle+' has its empty temporary pile entrance');
    assert.match(textOf(removed),/暂无暂时移出的卡牌/);
    h.drawState.temporaryRemoved.push(drawnEntry(cycle==='c2'?'13601':cycle==='c3'?'13501':cycle==='c4'?'9301':cycle==='c5'?'10301':'6401','Removed'));
    const withCard=h.ctx.createExplorationTools();
    const grid=withCard.descendants().find(node=>node.className==='exploration-drawn-grid');
    assert.ok(grid?.children.length,cycle+' shows its temporary card');
  }
});

test('drawing Titans and Debt waits for green settlement buttons and retains an undoable result',async()=>{
  const h=settleHarness({cycle:'c4',diplomacyBonus:-1,fullRecord:{cycle:'c4',fate:'0',babelianDebt:'2',cycleStats:{c4:{fate:'0',babelianDebt:'2'}},resources:{},titans:[{id:'existing',name:'Existing',count:1}]}});
  h.drawState.drawPile=['9313','9341'];
  h.ctx.drawExplorationCard();await flushAsync();
  assert.equal(h.alerts.length,0);
  assert.equal(h.record.titans.length,1);
  assert.equal(h.record.cycleStats.c4.babelianDebt,'2');
  assert.equal(h.written.length,0,'drawing does not write effects');
  const entries=[...h.drawState.activePiles.flat()];
  assert.equal(entries.length,2,'the results remain visible for review and undo');
  for (const entry of entries) {
    const block=h.ctx.createExplorationSettleBlock(entry);
    assert.ok(!block.descendants().some(node=>node.className==='exploration-settle-manual'));
    assert.equal(buttonNamed(block,'自动结算').parentNode.className,'exploration-settle-actions');
    await clickAndWait(buttonNamed(block,'自动结算'));
  }
  assert.equal(h.written.length,2);assert.equal(h.record.titans.length,2);
  assert.equal(h.record.titans[1].name,'梦行者');
  assert.equal(h.record.cycleStats.c4.babelianDebt,'3');
  assert.match(textOf(h.ctx.createExplorationTools()),/已结算：泰坦 \+1/);
  await h.ctx.settleExplorationCard(entries[0]);
  assert.equal(h.record.titans.length,2,'a repeated click does not duplicate the Titan');
  const picturedResources=Object.values(dataset.cards).filter(card=>card.cycleId==='c4' && card.kind===rules.KIND_RESOURCE_ONLY && /^(BABYLONIAN COMPLEX|CHARRED STEPS)$/i.test(card.titleEn));
  assert.equal(picturedResources.length,2);
  for (const id of ['9345', ...picturedResources.map(card=>card.cardId)]) {
    const block=h.ctx.createExplorationSettleBlock(drawnEntry(id,'Pictured card'));
    assert.equal(buttonNamed(block,'自动结算').parentNode.className,'exploration-settle-actions');
    assert.ok(!block.descendants().some(node=>node.className==='exploration-settle-manual'));
  }
  h.setDiplomacy(1);
  const mixed=h.ctx.createExplorationSettleBlock(drawnEntry('9345','Untamed Titan'));
  assert.ok(buttonNamed(mixed,'自动结算'));
  const manual=mixed.descendants().find(node=>node.className==='exploration-settle-manual');
  assert.ok(manual);assert.doesNotMatch(textOf(manual),/Gain \+1 Titan/);
  const titanEntry=entries.find(entry=>entry.id==='9313'),card=dataset.cards['c4:9313'];
  const context=h.ctx.explorationCardContext(titanEntry,card);
  const item=h.ctx.explorationEffectDescriptors(titanEntry,card,context)[0];
  await h.ctx.writeExplorationRecordEffects(titanEntry,[item],context,[],true);
  assert.deepEqual(h.record.titans,[{id:'existing',name:'Existing',count:1}]);
  assert.equal(h.record.cycleStats.c4.babelianDebt,'3');
});

test('single-effect auto resolution leaves choices, unknown conditions and cards with another effect pending',async()=>{
  for(const [id,bonus,fate] of [['9341',1,0],['9341',null,0],['9341',-1,8],['9313',1,0]]){
    const entry=drawnEntry(id,'Pending');
    const h=settleHarness({cycle:'c4',diplomacyBonus:bonus,activePiles:[[entry],[]],fullRecord:{cycle:'c4',fate:String(fate),babelianDebt:'2',cycleStats:{c4:{fate:String(fate),babelianDebt:'2'}},resources:{},titans:[]}});
    await h.ctx.settleSingleExplorationEffects([entry]);
    assert.equal(h.written.length,0,`${id} relation ${bonus} Fate ${fate}`);
    assert.equal(h.record.titans.length,0);assert.equal(h.record.cycleStats.c4.babelianDebt,'2');
  }
});

test('single-effect auto resolution respects the pile prohibition without blocking Debt',async()=>{
  const titan=drawnEntry('9313','Titan',0),ban=drawnEntry('9326','Ban',0),debt=drawnEntry('9341','Debt',1);
  const h=settleHarness({cycle:'c4',diplomacyBonus:-1,activePiles:[[ban,titan],[debt]],fullRecord:{cycle:'c4',fate:'0',babelianDebt:'0',cycleStats:{c4:{fate:'0',babelianDebt:'0'}},resources:{},titans:[]}});
  await h.ctx.settleSingleExplorationEffects([ban,titan,debt]);
  assert.equal(h.record.titans.length,0);assert.equal(h.record.cycleStats.c4.babelianDebt,'1');
});

test('single-effect auto resolution rechecks the latest record and preserves newly enabled independent effects',async()=>{
  const entry=drawnEntry('9341','Waster Caravan');
  const h=settleHarness({cycle:'c4',diplomacyBonus:-1,activePiles:[[entry],[]],fullRecord:{cycle:'c4',fate:'0',babelianDebt:'2',cycleStats:{c4:{fate:'0',babelianDebt:'2'}},resources:{}}});
  h.updateServerRecord({cycle:'c4',fate:'8',babelianDebt:'2',cycleStats:{c4:{fate:'8',babelianDebt:'2'}},resources:{}});
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.record.cycleStats.c4.babelianDebt,'2','a now multi-effect card is not resolved in single-effect mode');
  const neutral=settleHarness({cycle:'c4',diplomacyBonus:0,activePiles:[[entry],[]],fullRecord:{cycle:'c4',fate:'7',cycleStats:{c4:{fate:'7'}},resources:{}}});
  await neutral.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(neutral.record.cycleStats.c4.fate,'8');
  assert.equal(neutral.ctx.pendingExplorationEffects().length,1);
  assert.match(neutral.ctx.pendingExplorationEffects()[0],/Curse/);
});

test('a lost single-effect save response retries through the shared receipt without a second Titan',async()=>{
  const entry=drawnEntry('9313','Titan');
  const h=settleHarness({cycle:'c4',diplomacyBonus:0,activePiles:[[entry],[]],fullRecord:{cycle:'c4',fate:'0',cycleStats:{c4:{fate:'0'}},resources:{},titans:[]}});
  const write=h.ctx.writeServerArgoRecord;let lost=true;
  h.ctx.writeServerArgoRecord=async(...args)=>{const result=await write(...args);if(lost){lost=false;throw new Error('response lost');}return result;};
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.alerts.length,1);assert.equal(h.record.titans.length,1);
  h.ctx.cachedArgoRecord=JSON.parse(JSON.stringify(h.record));
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.record.titans.length,1);
  assert.match(textOf(h.ctx.createExplorationTools()),/已结算：泰坦 \+1/);
  assert.equal(h.ctx.state.exploration.lastSettlementByCycle.c4.completed.length,1);
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.titans.length,1);
  assert.equal(h.ctx.state.exploration.lastSettlementByCycle.c4.completed.length,1);
});

test('refresh only reads existing cards and waits for an explicit green button after undo',async()=>{
  const entry=drawnEntry('9341','Waster Caravan');
  const h=settleHarness({cycle:'c4',diplomacyBonus:-1,activePiles:[[entry],[]],fullRecord:{cycle:'c4',fate:'0',babelianDebt:'2',cycleStats:{c4:{fate:'0',babelianDebt:'2'}},resources:{}}});
  h.ctx.jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  vm.runInContext('let argoRecordRefreshInFlight = false;\n'+fn('refreshCachedArgoRecord'),h.ctx);
  await h.ctx.refreshCachedArgoRecord();
  assert.equal(h.record.cycleStats.c4.babelianDebt,'2');
  assert.equal(h.written.length,0);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry),'自动结算'));
  assert.equal(h.record.cycleStats.c4.babelianDebt,'3');
  const card=dataset.cards['c4:9341'],context=h.ctx.explorationCardContext(entry,card);
  const item=h.ctx.explorationEffectDescriptors(entry,card,context)[0];
  await h.ctx.writeExplorationRecordEffects(entry,[item],context,[],true);
  assert.equal(h.record.cycleStats.c4.babelianDebt,'2');
  const writes=h.written.length;
  await h.ctx.refreshCachedArgoRecord();
  assert.equal(h.record.cycleStats.c4.babelianDebt,'2');assert.equal(h.written.length,writes);
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c4.babelianDebt,'3','an explicit one-click settlement can apply the undone effect again');
});

test('single-effect auto resolution does not write from a read-only window',async()=>{
  const entry=drawnEntry('9313','Titan');
  const h=settleHarness({cycle:'c4',diplomacyBonus:0,activePiles:[[entry],[]],fullRecord:{cycle:'c4',fate:'0',cycleStats:{c4:{fate:'0'}},resources:{},titans:[]}});
  h.ctx.ownsDashboardWriteLease=()=>false;
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.written.length,0);assert.equal(h.record.titans.length,0);
});

test('all named diplomacy tables show only the current relation and exclude their preamble', () => {
  const cards=Object.values(dataset.cards).filter(card=>card.diplomacyFaction && card.diplomacyMenu);
  assert.equal(cards.length,12);
  const badges={2:'Allied',1:'Friendly',0:'Neutral','-1':'Unfriendly','-2':'Denounced','-3':'At War'};
  for(const card of cards) for(const bonus of [2,1,0,-1,-2,-3]) {
    const entry=drawnEntry(card.cardId,card.titleEn);
    const h=settleHarness({cycle:card.cycleId,diplomacyBonus:bonus,fullRecord:{cycle:card.cycleId,fate:'0',cycleStats:{[card.cycleId]:{fate:'0'}},resources:{}},activePiles:[[entry],[]]});
    assert.equal(card.diplomacyMenu,true,card.key);
    const context=h.ctx.explorationCardContext(entry,card);
    const desc=h.ctx.explorationEffectDescriptors(entry,card,context);
    const active=desc.filter(row=>row.badge && /Allied|Friendly|Neutral|Unfriendly|Denounced|War|Nemesis/.test(row.badge));
    const expected=bonus===-3 && card.cycleId==='c5' ? 'Aligned with Nemesis' : badges[bonus];
    assert.ok(active.every(row=>row.badge===expected),`${card.key} ${bonus}: ${active.map(row=>row.badge)}`);
    assert.ok(active.length<=1,`${card.key} ${bonus}: multiple diplomacy instructions`);
    assert.ok(desc.every(row=>!/Resolve an effect based|外交关系结算一项效果/.test(row.text)),card.key);
    assert.ok(desc.every(row=>!row.id.startsWith('unresolved:')),card.key);
  }
});

test('Waster Caravan applies its active relation but keeps Progress and Doom for manual placement', async()=>{
  const expected={2:['progress',1],0:['fate',1],'-1':['babelianDebt',1],'-2':['babelianDebt',2],'-3':['doom',1]};
  for(const [bonus,[type,amount]] of Object.entries(expected)) {
    const entry=drawnEntry('9341','Waster Caravan');
    const h=settleHarness({cycle:'c4',diplomacyBonus:Number(bonus),activePiles:[[entry],[]],fullRecord:{cycle:'c4',resources:{},fate:'0',babelianDebt:'0',crew:5,cycleStats:{c4:{fate:'0',babelianDebt:'0',crew:5}}}});
    h.ctx.state.cardTracks={story:{progress:3},doom:{doom:4},inwardOdyssey:{position:2}};
    await h.ctx.settleExplorationDraw();
    assert.equal(h.alerts.length,0,bonus);
    const applied=Object.values(h.record.explorationBatchReceipts[h.ctx.explorationRoundId(entry)].applied);
    const placement=['progress','doom'].includes(type);
    assert.equal(applied.length,placement?0:1,bonus);
    if(!placement)assert.deepEqual(applied[0].changes.map(x=>[x.type,x.amount]),[[type,amount]],bonus);
    else assert.match(textOf(h.ctx.createExplorationSettleBlock(entry)),/(?:故事|灾祸)模块选择位置并放置/);
    assert.equal(h.ctx.state.cardTracks.story.progress,3);
    assert.equal(h.ctx.state.cardTracks.doom.doom,4);
    const changed=type==='progress'||type==='doom'?h.ctx.state.cardTracks: h.record.cycleStats.c4;
    assert.ok(changed);
  }
});

test('Knowledge receipts recover lost responses, undo and repeat without replacing manual edits',async()=>{
  const entry=drawnEntry('9339','True Light');
  const h=settleHarness({cycle:'c4',diplomacyBonus:2,activePiles:[[entry],[]],fullRecord:{cycle:'c4',fate:'8',cycleStats:{c4:{fate:'8'}},resources:{}}});
  const initialKnowledge=h.ctx.argoKnowledgeStart('c4')+4;
  h.ctx.state.cardTracks={story:{progress:3},doom:{doom:2},inwardOdyssey:{position:initialKnowledge}};
  const write=h.ctx.writeServerArgoRecord;
  let lost=true;
  h.ctx.writeServerArgoRecord=async(...args)=>{const result=await write(...args);if(lost){lost=false;throw new Error('response lost');}return result;};
  await assert.rejects(()=>h.ctx.settleExplorationCard(entry),/response lost/);
  assert.equal(h.ctx.state.cardTracks.inwardOdyssey.position,initialKnowledge);
  assert.equal(h.record.explorationTrackTransactions.length,1);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.ctx.state.cardTracks.inwardOdyssey.position,initialKnowledge+1);
  assert.equal(h.record.explorationTrackTransactions.length,1);
  h.ctx.state.cardTracks.inwardOdyssey.position+=2;
  const card=dataset.cards['c4:9339'];
  const context=h.ctx.explorationCardContext(entry,card);
  const item=h.ctx.explorationEffectDescriptors(entry,card,context).find(row=>row.effects.some(effect=>effect.type==='knowledge'));
  lost=true;
  await assert.rejects(()=>h.ctx.writeExplorationRecordEffects(entry,[item],context,[],true),/response lost/);
  assert.equal(h.ctx.state.cardTracks.inwardOdyssey.position,initialKnowledge+3);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.ctx.state.cardTracks.inwardOdyssey.position,initialKnowledge+3,'undo and reapply should cancel, preserving the independent +2');
  assert.deepEqual(h.record.explorationTrackTransactions.map(tx=>tx.amount),[1,-1,1]);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.ctx.state.cardTracks.inwardOdyssey.position,initialKnowledge+3);
});

test('conditional Doom replacements show only the applicable manual placement quantity',async()=>{
  for(const fate of [6,7]){
    const entry=drawnEntry('6438','Maze Storm');
    const h=settleHarness({cycle:'c1',activePiles:[[entry],[]],fullRecord:{cycle:'c1',resources:{},fate:String(fate),cycleStats:{c1:{fate:String(fate)}}}});
    h.ctx.state.cardTracks={story:{progress:0},doom:{doom:2},inwardOdyssey:{position:0}};
    await h.ctx.settleExplorationDraw();
    assert.equal(h.alerts.length,0);
    assert.equal(h.ctx.state.cardTracks.doom.doom,2);
    assert.equal((h.record.explorationTrackTransactions||[]).length,0);
    const pending=h.ctx.getExplorationStepTokenReminders('doom').map(reminder=>reminder.title).join(' ');
    assert.match(pending,new RegExp(`灾祸 \\+${fate>=7?2:1}`));
  }
});

test('unresolved resource notices retain their diplomacy condition instead of leaking every branch',()=>{
  const key='c4:99998';
  dataset.cards[key]={key,cycleId:'c4',cardId:'99998',titleEn:'Fixture',diplomacyMenu:true,diplomacyFaction:'wasters',kind:'none',grants:[],manual:[],unresolved:['old unscoped notice'],unresolvedEffects:[
    {text:'allied unknown',badge:'Allied',condition:{type:'diplomacy',mode:'only',bonus:2}},
    {text:'neutral unknown',badge:'Neutral',condition:{type:'diplomacy',mode:'only',bonus:0}},
  ]};
  try{
    const h=settleHarness({cycle:'c4',diplomacyBonus:0});const entry=drawnEntry('99998','Fixture');const card=dataset.cards[key];
    const desc=h.ctx.explorationEffectDescriptors(entry,card,h.ctx.explorationCardContext(entry,card));
    assert.equal(desc.length,1);assert.match(desc[0].text,/neutral unknown/);
  }finally{delete dataset.cards[key];}
});

test('a current draw with a corrected legacy Titan receipt requires undo and then applies Fate only',async()=>{
  const entry=drawnEntry('6427','Egyptian War Fleet');
  const original={cycle:'c1',fate:'4',cycleStats:{c1:{fate:'4'}},resources:{},titans:[{id:'t',name:'Existing Titan',count:1}]};
  const old=effectRules.apply(original,'c1',[{type:'titan',amount:-1}],{titanLosses:[{id:'t',count:1}]});
  const h=settleHarness({cycle:'c1',diplomacyBonus:2,fullRecord:old.record,activePiles:[[entry],[]]});
  h.ctx.explorationEffectState(entry).applied['manual:0']={changes:old.changes,summary:old.summary};
  await h.ctx.settleExplorationDraw();
  assert.match(h.ctx.pendingExplorationEffects().join(' '),/旧版图标转录已更正/);
  assert.equal(h.record.fate,'4');assert.equal(h.record.titans.length,0);
  const card=dataset.cards['c1:6427'],context=h.ctx.explorationCardContext(entry,card);
  const item=h.ctx.explorationEffectDescriptors(entry,card,context).find(row=>row.receiptMismatch);
  assert.ok(item);
  await h.ctx.writeExplorationRecordEffects(entry,[item],context,[],true);
  assert.equal(h.record.titans[0].count,1);
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.fate,'3');assert.equal(h.record.titans[0].count,1);
  assert.equal(h.record.resources['c1-trireme'],5,'the already settled resource gain must not repeat');
});

test('a newly recognized glyph respects a whole-line manual completion until restored',async()=>{
  const entry=drawnEntry('9341','Waster Caravan');
  const h=settleHarness({cycle:'c4',diplomacyBonus:-1,activePiles:[[entry],[]],fullRecord:{cycle:'c4',resources:{},fate:'8',babelianDebt:'2',cycleStats:{c4:{fate:'8',babelianDebt:'2'}}}});
  h.ctx.explorationEffectState(entry).manual['manual:4']=true;
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c4.babelianDebt,'2');
  const block=h.ctx.createExplorationSettleBlock(entry);
  await clickAndWait(buttonNamed(block,'恢复待办'));
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c4.babelianDebt,'3');
});

test('every exploration card in the app decks has a scanned resource entry', () => {
  const ctx = vm.createContext({});
  vm.runInContext([
    constant('explorationDecks'),
    constant('hiddenExplorationCards'),
    // `const` at script top level is not a property of the vm global, so export
    // the two tables explicitly.
    'this.__decks = explorationDecks;\nthis.__hidden = hiddenExplorationCards;',
  ].join('\n'), ctx);
  for (const [cycleId, decks] of Object.entries(ctx.__decks)) {
    const ids = new Set(decks.flatMap((deck) => deck.cards.map((card) => card.id)));
    (ctx.__hidden[cycleId] || []).forEach((card) => ids.add(card.id));
    const scanned = new Set(rules.cardsForCycle(dataset, cycleId).map((card) => card.cardId));
    for (const id of ids) {
      assert.ok(scanned.has(id), `${cycleId}:${id} 在卡组里但没有扫描数据`);
    }
  }
});

test('a pure resource card settles its resources into the record sheet in one click', async () => {
  const harness = settleHarness({ diplomacyBonus: 1 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6404', name: 'Trade Post', day: 12 });
  assert.ok(block, '贸易站要显示结算区块');
  assert.match(textOf(block), /纯资源卡/);
  const button = buttonNamed(block, '自动结算');

  await clickAndWait(button);

  assert.equal(harness.written.length, 1, '结算要写一次记录表');
  assert.equal(harness.written[0].resources['c1-trireme'], 2, 'Friendly+ 分支要写 ×2');
  const receipt = harness.record.explorationBatchReceipts[harness.ctx.explorationRoundId({ id: '6404', day: 12 })];
  assert.ok(receipt?.resource, '结算后要记住这张卡已结算');
});

test('an unsettled card offers both branches when no faction status is known', () => {
  const harness = settleHarness({ factions: [] });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6404', name: 'Trade Post', day: 12 });
  const labels = block.buttons.map((button) => button.textContent);
  assert.ok(labels.some((label) => label === '基础值结算'), `要给出基础值选项：${labels.join(' | ')}`);
  assert.ok(labels.some((label) => /Friendly\+/.test(label)), `要给出 Friendly+ 选项：${labels.join(' | ')}`);
});

test('a card with extra effects settles only the resources and lists the rest', async () => {
  const harness = settleHarness({ diplomacyBonus: -2 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6406', name: 'Fishing Pier', day: 12 });
  assert.match(textOf(block), /含其它效果/);
  await clickAndWait(buttonNamed(block, '自动结算'));
  assert.equal(harness.written[0].resources['c1-trireme'], 2);
  const manual = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  assert.ok(manual, 'Denounced 时要把额外效果列出来');
  assert.match(textOf(manual), /Chosen Argonaut/);
});

test('a card without resource effects still lists its manual effects', () => {
  const harness = settleHarness();
  // "Cackle" 没有可写资源，但有待手动处理的效果，所以区块仍在、只是没有资源按钮。
  const block = harness.ctx.createExplorationSettleBlock({ id: '6436', name: 'Cackle', day: 12 });
  assert.ok(block, '有待办的卡仍要给出结算区块');
  assert.equal(resourceButtons(block).length, 0, '没有资源收益就不给资源按钮');
  assert.ok(block.descendants().some((node) => node.textContent?.includes('已手动处理')));
  // 完全不在数据集里的卡：给出兜底提示，不抛错。
  const unknown = harness.ctx.createExplorationSettleBlock({ id: '9999', name: 'Unknown', day: 12 });
  assert.ok(unknown);
  assert.match(textOf(unknown), /暂无效果数据/);
});

test('a settled card can be undone and the record goes back to its old value', async () => {
  const harness = settleHarness({ diplomacyBonus: 1, record: { 'c1-trireme': 3 } });
  const entry = { id: '6404', name: 'Trade Post', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  await clickAndWait(buttonNamed(block, '自动结算'));
  assert.equal(harness.written[0].resources['c1-trireme'], 5);

  const settledBlock = harness.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(settledBlock), /已结算|记录表已结算/);
  await clickAndWait(buttonNamed(settledBlock, /撤销/));

  assert.equal(harness.written[1].resources['c1-trireme'], 3, '撤销要把资源减回去');
});

test('a new draw clears last round settlement marks', () => {
  const harness = settleHarness();
  const entry = { id: '6404', name: 'Trade Post', day: 12 };
  harness.ctx.explorationBatchReceipt(harness.record, entry).resource = { summary: '船材 +2' };
  harness.ctx.clearExplorationSettlements('c1');
  assert.equal(harness.ctx.getExplorationSettlement(entry), null);
});

test('a diplomacy menu card settles its named faction branch', async () => {
  const harness = settleHarness({ diplomacyBonus: 1 });
  const entry = { id: '6401', name: 'Minoan Fleet', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(block), /船材|Trireme/, '状态行要写明命中的分支收益');
  const manual = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  const texts = manual ? textOf(manual) : '';
  assert.ok(!texts.includes('[Denounced]') && !texts.includes('[Allied]'), '未命中的分支不该出现在待办里');

  await clickAndWait(buttonNamed(block, '自动结算'));
  assert.equal(harness.written[0].resources['c1-trireme'], 4, 'Friendly 分支给 4 船材');
});

test('a diplomacy branch that only loses something lists it and never writes', () => {
  const harness = settleHarness({ diplomacyBonus: -2 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6401', name: 'Minoan Fleet', day: 12 });
  assert.equal(resourceButtons(block).length, 0, '该分支没有资源收益，不该给出资源按钮');
  const texts = textOf(block.descendants()
    .find((node) => node.className === 'exploration-settle-manual'));
  assert.match(textOf(block), /泰坦 -1/, '命中的分支效果在绿色结算区显示');
  assert.ok(!texts.includes('[Friendly]'));
});

test('a diplomacy branch with no scannable resource shows no dead button', () => {
  // Minoan Fleet "Allied" grants a resource printed as a picture, so there is
  // nothing to write: the card must still list what the player has to handle.
  const harness = settleHarness({ diplomacyBonus: 2 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6401', name: 'Minoan Fleet', day: 12 });
  assert.equal(resourceButtons(block).length, 0, '没有可写资源时不要给出无效资源按钮');
  const manual = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  assert.ok(manual && manual.children.length > 0, '仍要列出待办效果');
});

test('a rare resource is appended to the record sheet text field', async () => {
  const harness = settleHarness({ cycle: 'c3', diplomacyBonus: 2, factions: ['sunheirs'] });
  const entry = { id: '13511', name: 'Siren Temple of Hyperion', day: 30 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  assert.ok(block);
  await clickAndWait(buttonNamed(block, '自动结算'));
  assert.equal(harness.written[0].resources['c3-sirenshell'], 3);
  assert.equal(harness.written[0].resources.rare, 'Antedeluvian Sirenshell');
});

test('Minoan Fleet reads Minoan diplomacy even on another faction tile', () => {
  const harness = settleHarness({ factions: ['hornsworn'], diplomacyByFaction: { minoians: -2, hornsworn: 1 } });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6401', name: 'Minoan Fleet', day: 12 });
  assert.equal(resourceButtons(block).length, 0, '友善的本地角誓者不能触发米诺斯人舰队的资源奖励');
  const manual = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  assert.match(textOf(block), /泰坦 -1/);
});

test('named faction resources are granted even when that faction is not local', async () => {
  const harness = settleHarness({ factions: ['hornsworn'], diplomacyByFaction: { minoians: 1, hornsworn: -2 } });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6401', name: 'Minoan Fleet', day: 12 });
  await clickAndWait(buttonNamed(block, '自动结算'));
  assert.equal(harness.written[0].resources['c1-trireme'], 4);
  const texts = textOf(block.descendants().find((node) => node.className === 'exploration-settle-manual'));
  assert.ok(!texts.includes('[Denounced]'), '不能同时应用本地角誓者的惩罚分支');
});

test('unknown named diplomacy is not replaced by a known local faction', () => {
  const harness = settleHarness({ factions: ['hornsworn'], diplomacyByFaction: { minoians: null, hornsworn: 1 } });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6401', name: 'Minoan Fleet', day: 12 });
  // 米诺斯人外交没记录时：不拿本地角誓者顶上，只提供读取记录的入口，不给结算按钮。
  assert.match(textOf(block), /未记录外交关系|请先选择/);
  assert.deepEqual(block.buttons.map(button => button.textContent), ['重新读取记录表']);
  assert.equal(harness.written.length, 0);
});

test('multiple local factions require a player choice before resource settlement', async () => {
  const harness = settleHarness({ factions: ['minoians', 'hornsworn'], diplomacyByFaction: { minoians: 1, hornsworn: -2 } });
  const entry = { id: '6404', name: 'Trade Post', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  assert.equal(resourceButtons(block).length, 0);
  assert.match(textOf(block), /本地阵营|适用阵营/);
  const select = block.descendants().find((node) => node.tag === 'select');
  assert.ok(select, '要给出阵营选择');
  select.value = 'hornsworn';
  select.listeners.change();
  const selected = block.replacement.descendants().find((node) => node.tag === 'select');
  assert.equal(selected.value, 'hornsworn', '选择后仍应保留阵营控件，允许结算前更改');
  await clickAndWait(buttonNamed(block.replacement, /基础值结算|自动结算|结算资源部分/));
  assert.equal(harness.written[0].resources['c1-trireme'], 1, '选择敌对角誓者应按基础收益结算');
});

test('selected local faction also controls manual effects, with no mixed branches', () => {
  const harness = settleHarness({ factions: ['minoians', 'hornsworn'], diplomacyByFaction: { minoians: 1, hornsworn: -2 } });
  const entry = { id: '6406', name: 'Fishing Pier', day: 12 };
  const friendly = harness.ctx.createExplorationSettleBlock(entry, 'minoians');
  assert.ok(!friendly.descendants().some((node) => node.className === 'exploration-settle-manual'));
  const denounced = harness.ctx.createExplorationSettleBlock(entry, 'hornsworn');
  assert.ok(denounced.descendants().some((node) => node.className === 'exploration-settle-manual'));
});

test('rules module never combines multiple faction statuses without a selection', () => {
  const card = rules.getCard(dataset, 'c1', '6404');
  const context = { cycleId: 'c1', diplomacy: [{ id: 'minoians', bonus: 1 }, { id: 'hornsworn', bonus: -2 }] };
  assert.equal(rules.plan(card, context).status, 'choice');
  const selected = rules.plan(card, { ...context, diplomacyFaction: 'hornsworn' });
  assert.equal(selected.status, 'auto');
  assert.equal(selected.grants[0].amount, 1);
  const named = rules.plan(rules.getCard(dataset, 'c1', '6401'), context);
  assert.equal(named.grants[0].amount, 4);
  assert.ok(!named.manual.some((item) => item.badge === 'Denounced'));
});

test('every card that names a faction carries that faction in settlement data', () => {
  const expected = {
    'c1:6401': 'minoians', 'c1:6402': 'hornsworn', 'c1:6403': 'labyrinthians',
    'c3:13530': 'delphians', 'c3:13531': 'twilightWatch', 'c3:13532': 'sunheirs',
    'c4:9341': 'wasters', 'c4:9342': 'cloudThieves', 'c4:9343': 'aristotelians',
    'c5:10300': 'followersOfArete', 'c5:10301': 'cycladeanProtectorate', 'c5:10302': 'outcastVanguard',
  };
  for (const [key, faction] of Object.entries(expected)) {
    assert.equal(dataset.cards[key].diplomacyFaction, faction, key);
  }
});

// ---- 坏日子（c1:6400）：陌生人 +1 属于自动结算的一部分 --------------------------
test('Dog Days settles its stranger gain automatically once the numbers are recorded', async () => {
  const entry = drawnEntry('6400', 'Dog Days');
  const harness = settleHarness({
    activePiles: [[entry], []],
    fullRecord: {
      cycle: 'c1', resources: {}, crew: '5', fate: '7', strangers: '0',
      cycleStats: { c1: { crew: '5', fate: '7', strangers: '0' } },
    },
  });
  await harness.ctx.settleExplorationDraw();
  await flushAsync();
  // 「如果没有失去船员，获得 +1 陌生人」＋ 命运 ≥7 的 +2：一次写 3。
  assert.equal(harness.record.strangers, '3');
  assert.equal(harness.record.cycleStats.c1.strangers, '3');
  assert.equal(harness.record.crew, '5');
  const receipt = harness.record.explorationBatchReceipts[harness.ctx.explorationRoundId(entry)];
  assert.ok(receipt.applied['conditional:dog-days'], '坏日子整体作为一条自动效果结算');
  assert.equal(harness.drawState.activePiles.flat().length, 0, '全部处理后本轮结束');
});

test('Dog Days without a recorded stranger count stays pending instead of guessing', async () => {
  const entry = drawnEntry('6400', 'Dog Days');
  const harness = settleHarness({
    activePiles: [[entry], []],
    fullRecord: { cycle: 'c1', resources: {}, crew: '5', fate: '7', cycleStats: { c1: { crew: '5', fate: '7' } } },
  });
  await harness.ctx.settleExplorationDraw();
  assert.equal(harness.record.strangers, undefined, '没记录陌生人数量时不猜');
  assert.match(harness.ctx.pendingExplorationEffects().join(' '), /补齐陌生人|手动处理完整效果/);
  assert.equal(harness.drawState.activePiles.flat().length, 1);
});

// ---- 「Gain 1 A or B resource」：玩家二选一 -------------------------------------
// 卡面写 "Gain 1 Calcified Knuckle Bone or Fleshy Mantle resource"：两个候选都在记录表
// 里，是可以结算的收益，只是要玩家选一个。以前整串名字被当成单个资源名，报"未找到"。
test('an "A or B" resource gain becomes a player choice between the two resources', () => {
  const card = rules.getCard(dataset, 'c1', '6403');
  const grant = card.grants.find((item) => item.alternatives);
  assert.ok(grant, '二选一的收益要带 alternatives');
  // dataset 来自另一个 vm realm，深比较前先过一趟 JSON。
  assert.deepEqual(JSON.parse(JSON.stringify(grant.alternatives)).map((item) => item.key),
    ['calcifiedKnuckle', 'fleshyMantle']);
  assert.equal(card.unresolved.length, 0, '认出来之后就不该再报未识别');

  // 直接结算它（Denounced 下该行不成立）：给玩家两个候选，而不是替他选。
  const harness = settleHarness({ diplomacyBonus: 1 });
  const block = harness.ctx.createExplorationSettleBlock({ id: '6403', name: 'Labyrinthian Vessel', day: 12 });
  const labels = block.buttons.map((button) => button.textContent);
  assert.equal(labels.filter(label=>label.startsWith('获得 ')).length,2,'two independently selectable resource buttons');
  assert.ok(labels.some((label) => /钙化指节骨/.test(label)), `要能选钙化指节骨：${labels.join(' | ')}`);
  assert.ok(labels.some((label) => /血肉块/.test(label)), `要能选血肉块：${labels.join(' | ')}`);
  assert.ok(!labels.some((label) => label === '自动结算'), '还没选之前不能直接自动结算');
});

test('each Labyrinthian choice writes its selected resource and one Stranger in the same save',async()=>{
  for(const [label,key,other] of [['钙化指节骨','c1-calcifiedKnuckle','c1-fleshyMantle'],['血肉块','c1-fleshyMantle','c1-calcifiedKnuckle']]){
    const entry=drawnEntry('6403','Labyrinthian Vessel');
    const h=settleHarness({diplomacyBonus:1,activePiles:[[entry],[]],fullRecord:{cycle:'c1',resources:{},fate:'0',strangers:'2',cycleStats:{c1:{fate:'0',strangers:'2'}}}});
    const block=h.ctx.createExplorationSettleBlock(entry);
    assert.match(textOf(block),/选择资源时一并结算/);
    assert.ok(!block.buttons.some(button=>button.textContent==='结算记录表效果'),'the attached Stranger cannot bypass the resource choice');
    const choice=buttonNamed(block,new RegExp('^获得 '+label));
    await clickAndWait(choice);
    assert.equal(h.alerts.length,0);assert.equal(h.written.length,1);
    assert.equal(h.record.resources[key],1);assert.equal(h.record.resources[other]||0,0);
    assert.equal(h.record.cycleStats.c1.strangers,'3');
    assert.equal(h.record.strangers,'3');
    assert.match(textOf(h.ctx.createExplorationSettleBlock(entry)),/陌生人 \+1/);
    await clickAndWait(choice);await h.ctx.settleExplorationDraw();
    assert.equal(h.record.resources[key],1);assert.equal(h.record.cycleStats.c1.strangers,'3');
  }
});

test('one-click waits for a Labyrinthian resource choice, and undo refunds both parts without replacing later edits',async()=>{
  const entry=drawnEntry('6403','Labyrinthian Vessel');
  const h=settleHarness({diplomacyBonus:1,activePiles:[[entry],[]],fullRecord:{cycle:'c1',resources:{},fate:'0',strangers:'2',cycleStats:{c1:{fate:'0',strangers:'2'}}}});
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c1.strangers,'2');
  assert.equal(h.record.resources['c1-fleshyMantle']||0,0);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry),/^获得 血肉块/));
  const later=JSON.parse(JSON.stringify(h.record));later.strangers='5';later.cycleStats.c1.strangers='5';later.resources['c1-trireme']=4;
  h.updateServerRecord(later);h.ctx.cachedArgoRecord=later;
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry),'撤销结算'));
  assert.equal(h.record.resources['c1-fleshyMantle'],0);assert.equal(h.record.resources['c1-trireme'],4);
  assert.equal(h.record.cycleStats.c1.strangers,'4');
  assert.equal(h.ctx.createExplorationSettleBlock(entry).buttons.filter(button=>button.textContent.startsWith('获得 ')).length,2);
  await h.ctx.settleSingleExplorationEffects([entry]);assert.equal(h.record.cycleStats.c1.strangers,'4');
});

test('an old selected Labyrinthian resource gets its missing Stranger once, including an independently pending affliction',async()=>{
  const entry=drawnEntry('6403','Labyrinthian Vessel');
  const h=settleHarness({diplomacyBonus:1,activePiles:[[entry],[]],fullRecord:{cycle:'c1',resources:{'c1-calcifiedKnuckle':1},fate:'7',strangers:'2',cycleStats:{c1:{fate:'7',strangers:'2'}}}});
  const context=h.ctx.explorationCardContext(entry,dataset.cards['c1:6403']);
  const changes=rules.planChanges(dataset,'c1',[{resource:'calcifiedKnuckle',amount:1}]);
  const receipt=h.ctx.explorationBatchReceipt(h.record,entry);
  receipt.resource={changes,variant:'choice:0:calcifiedKnuckle',summary:'钙化指节骨 +1',context:h.ctx.explorationContextSnapshot(context)};
  h.ctx.cachedArgoRecord=JSON.parse(JSON.stringify(h.record));
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.record.cycleStats.c1.strangers,'3');assert.equal(h.record.resources['c1-calcifiedKnuckle'],1);
  assert.equal(h.ctx.pendingExplorationEffects().length,1);
  assert.match(h.ctx.pendingExplorationEffects()[0],/绝望/);
  await h.ctx.settleSingleExplorationEffects([entry]);await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c1.strangers,'3');assert.equal(h.record.resources['c1-calcifiedKnuckle'],1);
});

test('a lost Labyrinthian choice response never adds either selected resource or Stranger twice',async()=>{
  const entry=drawnEntry('6403','Labyrinthian Vessel');
  const h=settleHarness({diplomacyBonus:1,activePiles:[[entry],[]],fullRecord:{cycle:'c1',resources:{},fate:'0',strangers:'0',cycleStats:{c1:{fate:'0',strangers:'0'}}}});
  h.ctx.console={...console,warn:()=>{}};
  const write=h.ctx.writeServerArgoRecord;let lost=true;
  h.ctx.writeServerArgoRecord=async(...args)=>{const result=await write(...args);if(lost){lost=false;throw new Error('response lost');}return result;};
  const choice=buttonNamed(h.ctx.createExplorationSettleBlock(entry),/^获得 血肉块/);
  await clickAndWait(choice);
  assert.equal(h.alerts.length,1);assert.equal(h.record.resources['c1-fleshyMantle'],1);assert.equal(h.record.strangers,'1');
  await clickAndWait(choice);await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.record.resources['c1-fleshyMantle'],1);assert.equal(h.record.strangers,'1');
});

test('saved resource receipts recover missing dashboard marks without paying the same draw twice', async () => {
  for (const [id, name, resource, amount] of [
    ['13601', 'Pre-Eschaton Armory', 'c2-warMachine', 3],
    ['13600', 'Temenos Fear Aquifer', 'fearEssence', 2],
    ['13612', 'Temenos Fear Aquifer', 'fearEssence', 2],
  ]) {
    const entry = { ...drawnEntry(id, name), drawnAt: 'resource-recovery-round' };
    const h = settleHarness({ cycle: 'c2', diplomacyBonus: 1, activePiles: [[entry], []], fullRecord: nextRecord('c2') });
    await h.ctx.settleExplorationDraw();
    assert.equal(h.record.resources[resource], amount);
    h.drawState.activePiles = [[entry], []];
    h.ctx.state.exploration.settledByCycle.c2 = {};
    assert.ok(h.ctx.getExplorationSettlement(entry), 'the saved record receipt remains authoritative when the dashboard mark is missing');
    assert.ok(!h.ctx.pendingExplorationEffects().some(text => /资源未结算|资源分支需选择/.test(text)));
    await h.ctx.settleExplorationDraw();
    assert.equal(h.record.resources[resource], amount, 'retry must not issue the resources again');
    const next = { ...entry, drawnAt: 'another-draw-on-the-same-day' };
    assert.equal(h.ctx.getExplorationSettlement(next), null, 'a previous draw cannot settle a different draw today');
  }
});

test('an undone server resource receipt overrides stale dashboard settlement marks', async () => {
  const entry = { ...drawnEntry('13601', 'Pre-Eschaton Armory'), drawnAt: 'undone-resource-round' };
  const h = settleHarness({ cycle: 'c2', diplomacyBonus: 1, activePiles: [[entry], []], fullRecord: nextRecord('c2') });
  await h.ctx.settleExplorationDraw();
  const updated = JSON.parse(JSON.stringify(h.record));
  delete updated.explorationBatchReceipts[h.ctx.explorationRoundId(entry)].resource;
  updated.resources['c2-warMachine'] = 0;
  h.ctx.cachedArgoRecord = updated;
  assert.equal(h.ctx.getExplorationSettlement(entry), null, 'undo in another page must not keep a stale settled badge');
});

test('a legacy local resource settlement also migrates and recovers its missing attached Stranger',async()=>{
  const entry=drawnEntry('6403','Labyrinthian Vessel');
  const h=settleHarness({diplomacyBonus:1,activePiles:[[entry],[]],fullRecord:{cycle:'c1',resources:{'c1-calcifiedKnuckle':1},fate:'0',strangers:'2',cycleStats:{c1:{fate:'0',strangers:'2'}}}});
  const context=h.ctx.explorationCardContext(entry,dataset.cards['c1:6403']);
  const settlement=h.ctx.explorationSettlementStore(entry);
  settlement.store[settlement.key]={changes:rules.planChanges(dataset,'c1',[{resource:'calcifiedKnuckle',amount:1}]),
    variant:'choice:0:calcifiedKnuckle',summary:'钙化指节骨 +1',context:h.ctx.explorationContextSnapshot(context)};
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.record.strangers,'3');assert.equal(h.record.resources['c1-calcifiedKnuckle'],1);
  await h.ctx.settleSingleExplorationEffects([entry]);assert.equal(h.record.strangers,'3');
});

// ---- 一键结算：记录表效果 -------------------------------------------------------
test('record-sheet effects settle in one click, and only Titan choices stay per-row', async () => {
  const titanEntry = { id: '6433', name: 'Untamed Titan', day: 12 };
  const batch = settleHarness({ diplomacyBonus: 2, fullRecord: { cycle: 'c1', resources: {}, fate: '0' } });
  const block = batch.ctx.createExplorationSettleBlock(titanEntry);
  const list = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  assert.ok(list, '效果列表还在');
  const buttons = block.buttons.map((button) => button.textContent);
  assert.equal(buttons.filter((label) => label === '自动结算').length, 1, '只留一个绿色结算按钮');
  assert.equal(buttons.filter((label) => label === '应用到记录表').length, 0, '行内不再各给一个按钮');
  assert.equal(buttons.filter((label) => label === '确认条件成立并结算').length, 0, '条件类也收进一键');

  await clickAndWait(buttonNamed(block, '自动结算'));
  assert.equal(batch.written.length, 1, '多条效果共用一次写表');
  assert.deepEqual(batch.alerts, []);
  const after = batch.ctx.createExplorationSettleBlock(titanEntry);
  assert.equal(after.buttons.filter((button) => button.textContent === '自动结算').length, 0, '结算后按钮消失');
});

test('a Titan-loss row keeps its own controls instead of joining the one-click batch', () => {
  const titans = [
    { id: 'dream', name: 'Dream', count: 2, limit: 2, crippled: false },
    { id: 'second', name: 'Other Titan', count: 1, limit: 1, crippled: false },
  ];
  const harness = settleHarness({
    cycle: 'c2', factions: ['cyclopes'], fullRecord: { cycle: 'c2', resources: {}, cycleStats:{c2:{crewCounters:{crew:3,refugees:4,captives:0}}}, titans },
  });
  const block = harness.ctx.createExplorationSettleBlock({ id: '13624', name: 'Cyclopean Shrine of Iapetus', day: 12 });
  const list = block.descendants().find((node) => node.className === 'exploration-settle-manual');
  assert.equal(list.buttons.filter((button) => button.textContent === '结算记录表效果').length, 0,
    '要挑泰坦的条目不能混进一键结算');
  assert.equal(list.buttons.filter((button) => button.textContent === '应用到记录表').length, 1);
  assert.ok(block.descendants().some((node) => node.tag === 'select'), '仍要给挑泰坦的下拉');
});

// ---- 延迟效果与定时战斗 ---------------------------------------------------------
test('checking encounter without a scheduled battle preserves terrain and temporary cards', async () => {
  const harness = settleHarness();
  harness.ctx.state.completed = {};
  harness.ctx.state.nextBattleTerrain = { terrain: '特殊地形' };
  harness.drawState.drawPile.push('6401');
  harness.drawState.temporaryRemoved.push(drawnEntry('6403', 'Labyrinthian Vessel'));
  harness.ctx.step = { id: 'encounter' };
  harness.ctx.checkbox = { checked: true };
  const listener = source.match(/checkbox\.addEventListener\("change", (\(\) => \{[^]*?)\n        \}\);/);
  assert.ok(listener, 'the encounter checkbox handler exists');
  vm.runInContext(`(${listener[1]}\n})()`, harness.ctx);
  assert.equal(harness.ctx.state.completed.encounter, true);
  await flushAsync();
  assert.equal(harness.ctx.state.nextBattleTerrain.terrain, '特殊地形');
  assert.equal(harness.drawState.temporaryRemoved.length, 1);
  assert.deepEqual([...harness.drawState.drawPile], ['6401']);
  assert.equal(harness.written.length, 0, 'checking a non-battle day never resets the battle period');
});

test('terrain-only encounter on a non-battle day retains its reminder', async () => {
  const harness = settleHarness();
  harness.ctx.state.nextBattleTerrain = { terrain: '特殊地形' };
  await harness.ctx.completeTimelineBattle();
  assert.equal(harness.ctx.state.nextBattleTerrain.terrain, '特殊地形');
  assert.equal(harness.written.length, 0, 'an empty encounter does not create a battle record');
});

test('the encounter step completes the Timeline Battle instead of showing buttons', async () => {
  const entry = drawnEntry('6403', 'Labyrinthian Vessel');
  const harness = settleHarness({
    diplomacyBonus: -2, activePiles: [[entry], []],
    fullRecord: { cycle: 'c1', resources: {}, fate: '0' },
  });
  await harness.ctx.registerAutomaticExplorationDelays([entry]);
  await flushAsync();
  const queued = harness.record.explorationDelays.queue.find((item) => item.trigger === 'timeline-battle-start');
  assert.equal(queued.status, 'waiting');

  // 遭遇步骤的折叠条里不再有「开始定时战斗 / 定时战斗已完成」两个按钮。
  const tools = harness.ctx.createDelayedExplorationStepTools('encounter');
  assert.ok(tools);
  assert.deepEqual(tools.buttons, []);
  assert.ok(tools.descendants().some(node => node.className === 'step-track-tag exploration-card' && node.textContent === '探索卡'));

  await harness.ctx.completeTimelineBattle();
  assert.equal(harness.record.explorationDelays.queue[0].status, 'waiting', 'pending effects alone do not imply a battle');
  assert.equal(harness.record.explorationDelays.timelineEpochs.c1 || 0, 0);
  harness.ctx.todayTrackIcons = () => [{ className: 'battle' }];
  harness.ctx.state.nextBattleTerrain = { terrain: '特殊地形' };
  harness.drawState.temporaryRemoved.push(drawnEntry('6401', 'Temporary card'));
  await harness.ctx.processExplorationDelays('timeline-battle-start', { timelineBattle: true, eventId: 'c1:D12:timeline' });
  assert.equal(harness.record.explorationDelays.queue[0].status, 'ready');
  assert.deepEqual(harness.ctx.createDelayedExplorationStepTools('encounter').buttons, [], '已到期的提醒也没有单独确认按钮');
  harness.ctx.state.completed = {};
  harness.ctx.step = { id: 'encounter' };
  harness.ctx.checkbox = { checked: true };
  const checkboxListener = source.match(/checkbox\.addEventListener\("change", (\(\) => \{[^]*?)\n        \}\);/);
  assert.ok(checkboxListener);
  vm.runInContext(`(${checkboxListener[1]}\n})()`, harness.ctx);
  await flushAsync();
  assert.equal(harness.ctx.state.completed.encounter, true);
  assert.equal(harness.ctx.state.nextBattleTerrain, null);
  assert.equal(harness.drawState.temporaryRemoved.length, 0);
  assert.ok(harness.drawState.drawPile.includes('6401'));
  assert.equal(harness.record.explorationDelays.timelineEpochs.c1, 1, '战斗结束推进纪元');
  assert.equal(harness.record.explorationDelays.queue[0].status, 'done', '勾选遭遇后确认提醒已处理');
  assert.equal(harness.ctx.createDelayedExplorationStepTools('encounter'), null, '提醒和特殊板块一起消失');
  // 同一天重复结算不会把纪元推上去（事件编号按循环+日期去重）。
  await harness.ctx.completeTimelineBattle();
  await flushAsync();
  assert.equal(harness.record.explorationDelays.timelineEpochs.c1, 1);
  harness.ctx.cachedArgoRecord = JSON.parse(JSON.stringify(harness.record));
  assert.equal(harness.ctx.createDelayedExplorationStepTools('encounter'), null, '重新载入已保存记录不恢复提醒');
});

test('a Timeline battle day no longer renders duplicate battle buttons in the encounter step', () => {
  const harness = settleHarness();
  assert.equal(harness.ctx.createDelayedExplorationStepTools('encounter'), null);
  harness.ctx.todayTrackIcons = () => [{ className: 'battle' }];
  assert.equal(harness.ctx.createDelayedExplorationStepTools('encounter'), null,
    '战斗当天没有延迟效果要展示时，遭遇步骤不再多出一块按钮');
  assert.match(source, /title: "今日战斗"/);
  assert.match(source, /if \(step\.id === "encounter" && checkbox\.checked\) void completeTimelineBattle\(\);/);
});

// ---- 派系关系行 -----------------------------------------------------------------
test('the faction row lists all three factions and marks only the one the AG tile is on', () => {
  const plain = (values) => JSON.parse(JSON.stringify(values));
  const harness = settleHarness({
    factions: ['labyrinthians'],
    diplomacyByFaction: { minoians: 1, labyrinthians: 5, hornsworn: -3 },
  });
  const items = plain(harness.ctx.currentMapFactionStatusItems());
  assert.deepEqual(items.map((item) => item.text), [
    '米诺斯人：外交状态 (+1)',
    '迷宫徒：外交状态 (+5)',
    '角誓者：外交状态 (-3)',
  ], '三个派系都要列出，各自的关系按记录读');
  assert.deepEqual(items.map((item) => item.current), [false, true, false],
    '只有 AG 当前格所在的那个派系标 current');

  const offTile = settleHarness({ factions: ['none'] });
  assert.deepEqual(plain(offTile.ctx.currentMapFactionStatusItems()).map((item) => item.current),
    [false, false, false], '「无阵营」不加粗任何一行');
});

test('the faction row is always rendered, and the report keeps only its summary line', () => {
  const harness = settleHarness();
  harness.ctx.state.exploration.lastSettlementByCycle = {
    c1: { completed: ['自动发放了 1 点资源'], pending: [] },
  };
  const tools = harness.ctx.createExplorationTools();
  const report = tools.descendants().find((node) => node.className === 'exploration-settle exploration-batch-report');
  assert.ok(report, '结算报告还在');
  assert.equal(report.descendants().some((node) => node.className === 'exploration-settle-details'), false,
    '「查看自动结算明细」已经删掉');
  const result = report.children.find((node) => node.className === 'exploration-batch-result');
  assert.ok(result, '概括行直接留在报告里');
  assert.match(result.textContent, /本次自动处理 1 项。全部效果已处理。/);
  const status = tools.descendants().find((node) => node.className === 'exploration-status');
  assert.ok(status.children.some((node) => node.className === 'exploration-faction-status'),
    '派系关系常驻显示');
});

test('a settlement with nothing auto-resolved still shows its summary line', () => {
  const harness = settleHarness();
  harness.ctx.state.exploration.lastSettlementByCycle = { c1: { completed: [], pending: ['需要手动确认一项'] } };
  const tools = harness.ctx.createExplorationTools();
  const report = tools.descendants().find((node) => node.className === 'exploration-settle exploration-batch-report');
  const result = report.children.find((node) => node.className === 'exploration-batch-result');
  assert.ok(result, '概括行要直接可见');
  assert.match(result.textContent, /本次自动处理 0 项。/);
  assert.match(result.textContent, /还有 1 项需要选择、确认或手动处理/);
  assert.ok(report.descendants().some((node) => node.className === 'exploration-settle-manual'),
    '待手动处理的清单仍然直接列出');
});

test('every cycle prints its faction names in Chinese in the faction row', () => {
  const plain = (values) => JSON.parse(JSON.stringify(values));
  const expected = {
    c1: ['米诺斯人', '迷宫徒', '角誓者'],
    c2: ['希洛人', '独眼巨人', '邦联同盟'],
    c3: ['太阳后裔', '德尔菲人', '暮光守望'],
    c4: ['浪费者', '亚里士多德远征军', '云贼'],
    c5: ['阿瑞特追随者', '保护国', '弃民先锋'],
  };
  for (const [cycle, names] of Object.entries(expected)) {
    const harness = settleHarness({ cycle });
    const texts = plain(harness.ctx.currentMapFactionStatusItems()).map((item) => item.text);
    assert.equal(texts.length, 3, `${cycle} 要列出三个派系`);
    names.forEach((name, index) => {
      assert.ok(texts[index].startsWith(`${name}：`),
        `${cycle} 第 ${index + 1} 个派系要用中文名 ${name}，实际：${texts[index]}`);
    });
    // 不能漏出英文名（"Wasters"/"Cloud Thieves"/"Followers of Areté" 之类）。
    texts.forEach((text) => {
      assert.ok(!/[A-Za-z]{4,}/.test(text.replace(/\([^)]*\)/g, '')),
        `${cycle} 的派系行不该出现英文名：${text}`);
    });
  }
});

// ---- 延迟效果：登记 / 撤销 -------------------------------------------------------
test('a card with a delayed effect can register and withdraw it', async () => {
  const harness = settleHarness({ diplomacyBonus: -2 });
  const entry = { id: '6403', name: 'Labyrinthian Vessel', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  const automatic = buttonNamed(block, '自动结算');
  assert.equal(automatic.parentNode.className, 'exploration-settle-actions');
  assert.ok(automatic.parentNode.parentNode.children.some(node => node.tag === 'strong'));
  assert.ok(!block.buttons.some(button => button.textContent === '登记延迟效果'));
  await clickAndWait(automatic);
  assert.equal(harness.record.explorationDelays.queue.length, 1);
  assert.equal(harness.record.explorationDelays.queue[0].trigger, 'timeline-battle-start');
  assert.equal(harness.record.explorationDelays.queue[0].modifier, 'escalate');
  assert.equal(harness.ctx.explorationEffectState(entry).delays['manual:4'],
    harness.record.explorationDelays.queue[0].receiptId);

  const registered = harness.ctx.createExplorationSettleBlock(entry);
  await clickAndWait(buttonNamed(registered, '撤销延迟安排'));
  assert.equal(harness.record.explorationDelays.queue[0].status, 'cancelled');
  assert.equal(harness.ctx.explorationEffectState(entry).delays['manual:4'], undefined);
});

test('the development step exposes the due-tech repair button', () => {
  const harness = settleHarness({ cycle: 'c2' });
  assert.ok(harness.ctx.createDelayedExplorationStepTools('development') === null,
    '没有到期修复时开发步骤不多出按钮');
  const tools = harness.ctx.createDelayedExplorationStepTools('explore');
  assert.equal(tools, null, '其它步骤没有这套工具');
});

// ---- 记录表效果：一键结算 / 撤销 -------------------------------------------------
test('record-sheet effects can be settled in one click and undone', async () => {
  const harness = settleHarness({
    diplomacyBonus: 2, fullRecord: { cycle: 'c1', resources: {}, fate: '0' },
  });
  const entry = { id: '6433', name: 'Untamed Titan', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  await clickAndWait(buttonNamed(block, '自动结算'));
  assert.equal(harness.written.length, 1);
  const applied = harness.ctx.createExplorationSettleBlock(entry);
  await clickAndWait(buttonNamed(applied, '撤销记录表效果'));
  assert.equal(harness.written.length, 2, '撤销也要写一次');
  assert.deepEqual(harness.alerts, []);
});

test('a Titan loss needs an explicit choice before it can write', async () => {
  const titans = [
    { id: 'dream', name: 'Dream', count: 2, limit: 2, crippled: false },
    { id: 'second', name: 'Other Titan', count: 1, limit: 1, crippled: false },
    { id: 'keep', name: 'Retained Titan', count: 1, limit: 1, crippled: false },
  ];
  const harness = settleHarness({
    cycle: 'c4', diplomacyBonus: -2, factions: ['aristotelians'], fullRecord: { cycle: 'c4', resources: {}, fate: '0', titans },
  });
  const entry = { id: '9343', name: 'Aristotelian Army', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  const selectors = block.descendants().filter((node) => node.tag === 'select');
  assert.equal(selectors.length, 2, '要按失去数量给出选择框');
  await clickAndWait(buttonNamed(block, '应用到记录表'));
  assert.equal(harness.written.length, 0, '没选泰坦就不能改记录表');
  assert.match(harness.alerts[0], /选择要失去的泰坦/);

  selectors[0].value = 'dream';
  selectors[1].value = 'second';
  await clickAndWait(buttonNamed(block, '应用到记录表'));
  assert.equal(harness.written.length, 1);
  assert.deepEqual(harness.record.titans, [{ ...titans[0], count: 1 }, titans[2]]);
  const applied = harness.ctx.createExplorationSettleBlock(entry);
  await clickAndWait(buttonNamed(applied, '撤销记录表效果'));
  assert.deepEqual(harness.record.titans, titans, '撤销要还原数量、身份、顺序与残废状态');
});

// ---- 商人兑换 -------------------------------------------------------------------
test('the merchant UI exchanges, counts up to the limit, and can be undone', async () => {
  const harness = settleHarness({
    diplomacyBonus: 2,
    fullRecord: {
      cycle: 'c1', resources: { 'c1-trireme': 9, 'c1-monument': 0 }, fate: '0',
      cycleStats: { c1: { trireme: '9', monument: '0', fate: '0' } },
    },
  });
  const entry = { id: '13400', name: 'Theban Trader', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  const select = block.descendants().find((node) => node.tag === 'select');
  const times = block.descendants().find((node) => node.tag === 'input');
  assert.ok(select && times, '商人要给出兑换项目与次数两个控件');
  assert.equal(select.children[0].textContent,'3 船材（库存 9） → 1 石筑（库存 0）');
  // 第一项兑换是「3 船材 → 1 石筑」，给够船材。
  const tradeId = select.children[0].value;
  select.value = tradeId;
  times.value = '1';
  await clickAndWait(buttonNamed(block, '执行兑换'));
  assert.equal(harness.written.length, 1, '兑换要写一次记录表');
  assert.equal(harness.alerts.length, 0, `兑换不该报错：${harness.alerts.join(' | ')}`);
  const roundId = harness.ctx.explorationRoundId(entry);
  assert.equal(harness.record.explorationTradeRounds[roundId].count, 1, '兑换次数要累加');

  const after = harness.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(after), /商人交易 1\/5/);
  assert.match(textOf(after),/3 船材（库存 6） → 1 石筑（库存 1）/);
  await clickAndWait(buttonNamed(after, '撤销上次兑换'));
  // 撤销掉最后一次兑换后，本回合的交易记录整条消失（而不是留个 0）。
  assert.equal(harness.record.explorationTradeRounds[roundId], undefined, '撤销要把交易记录清掉');
  const reverted=harness.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(reverted),/3 船材（库存 9） → 1 石筑（库存 0）/);
  const reward=reverted.descendants().find(node=>node.tag==='select' && node.getAttribute('aria-label')==='商人奖励资源');
  assert.ok(reward,'Friendly+ reward provides a manual resource choice');
  assert.equal(reward.value,'','the player must select the reward explicitly');
  reward.value='muscleCluster';
  const claim=buttonNamed(reverted,'领取奖励资源');
  await clickAndWait(claim);await clickAndWait(claim);
  assert.equal(harness.record.resources['c1-muscleCluster'],1,'the selected reward is written once');
  assert.equal(harness.record.explorationTradeRounds[roundId],undefined,'reward does not spend a trade');
  await clickAndWait(buttonNamed(harness.ctx.createExplorationSettleBlock(entry),'撤销奖励资源'));
  assert.equal(harness.record.resources['c1-muscleCluster'],undefined);
  const neutral=settleHarness({diplomacyBonus:0});
  assert.ok(!neutral.ctx.createExplorationSettleBlock(entry).descendants().some(node=>node.tag==='select' && node.getAttribute('aria-label')==='商人奖励资源'));
  assert.deepEqual(harness.alerts, []);
});

test('merchant trade multiplies one category and still allows repeats after five categories', async () => {
  const resources = Object.fromEntries(Object.keys(dataset.cycles.c1.resources).map((resource) => [dataset.cycles.c1.resources[resource].storageKey, 1000]));
  const harness = settleHarness({ fullRecord: { cycle: 'c1', resources, fate: '0', cycleStats: { c1: { fate: '0' } } } });
  const entry = { id: '13400', name: 'Theban Trader', day: 12 };
  const roundId = harness.ctx.explorationRoundId(entry);
  const optionApi = harness.ctx.window.ATO_EXPLORATION_OPTION_RULES;
  const menu = optionApi.merchant(dataset.cards['c1:13400']);
  let block = harness.ctx.createExplorationSettleBlock(entry);
  let select = block.descendants().find((node) => node.tag === 'select');
  let times = block.descendants().find((node) => node.tag === 'input');
  select.value = menu.trades[0].id;
  times.value = '10';
  await clickAndWait(buttonNamed(block, '执行兑换'));
  assert.equal(harness.alerts.length, 0, `兑换不该报错：${harness.alerts.join(' | ')}`);
  assert.equal(harness.record.explorationTradeRounds[roundId].count, 1);
  block = harness.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(block), /商人交易 1\/5 类/);
  select = block.descendants().find((node) => node.tag === 'select');
  times = block.descendants().find((node) => node.tag === 'input');
  assert.equal(times.max, undefined, 'the quantity input must not cap one category at five');
  select.value = menu.trades[0].id;
  times.value = '12';
  await clickAndWait(buttonNamed(block, '执行兑换'));
  assert.equal(harness.record.explorationTradeRounds[roundId].count, 1, 'the same category adds no slot');
  let record = harness.record;
  for (const trade of menu.trades.slice(1, 5)) record = optionApi.executeTrade(record, 'c1', '13400', trade, 1, roundId, dataset).record;
  harness.updateServerRecord(record);
  harness.ctx.cachedArgoRecord = record;
  block = harness.ctx.createExplorationSettleBlock(entry);
  select = block.descendants().find((node) => node.tag === 'select');
  times = block.descendants().find((node) => node.tag === 'input');
  const exchange = buttonNamed(block, '执行兑换');
  select.value = menu.trades[5].id;
  select.listeners.change();
  assert.equal(exchange.disabled, true, 'a sixth distinct category stays blocked');
  select.value = menu.trades[0].id;
  select.listeners.change();
  assert.equal(exchange.disabled, false, 'an already-used category remains available');
  times.value = '20';
  await clickAndWait(exchange);
  assert.equal(harness.alerts.length, 0, `加量兑换不该报错：${harness.alerts.join(' | ')}`);
  assert.equal(harness.record.explorationTradeRounds[roundId].count, 5);
  assert.equal(harness.record.resources['c1-monument'] > 0, true);
});

// ---- String Wish（c4:9333）-------------------------------------------------------
test('String Wish registers its five marks and can be settled and undone', async () => {
  const harness = settleHarness({
    cycle: 'c4',
    fullRecord: { cycle: 'c4', resources: {}, fate: '0' },
  });
  const entry = { id: '9333', name: 'String Wish', day: 12 };
  const block = harness.ctx.createExplorationSettleBlock(entry);
  assert.ok(block);
  const labels = block.buttons.map((button) => button.textContent);
  assert.ok(labels.some((label) => /获得资源并登记|还款|持续标记/.test(label)),
    `Wish 要给出结算入口：${labels.join(' | ')}`);
  const settle = block.buttons.find((button) => /获得资源并登记/.test(button.textContent))
    || block.buttons[0];
  await clickAndWait(settle);
  assert.equal(harness.written.length >= 1, true, 'Wish 结算要写记录表');
  assert.ok(harness.record.explorationPersistentEffects?.c4?.stringWish, '要登记持续标记');
  const settled = harness.ctx.createExplorationSettleBlock(entry);
  const undo = settled.buttons.find((button) => /撤销持续标记结算/.test(button.textContent));
  assert.ok(undo, `结算后要能撤销：${settled.buttons.map((b) => b.textContent).join(' | ')}`);
  await clickAndWait(undo);
  assert.equal(harness.record.explorationPersistentEffects?.c4?.stringWish, undefined,
    '撤销要清掉持续标记');
});

// ---- 整堆禁止获得资源 -----------------------------------------------------------
test('a stack prohibition blocks positive grants but keeps the rest', () => {
  const entry = { id: '9328', name: 'Persian Trader', day: 12 };
  // 同一堆里有 c4:9326（整堆禁止获得资源）时，正收益被拦下并单独列出。
  const blocked = settleHarness({
    cycle: 'c4',
    activePiles: [[{ id: '9326', name: 'Prohibition', day: 12 }, entry], []],
  });
  const blockedBlock = blocked.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(blockedBlock), /禁止资源收益|禁止获得资源/);
  // 没有那条限制时，同一张卡正常显示自己的收益。
  const plain = settleHarness({ cycle: 'c4' });
  const plainBlock = plain.ctx.createExplorationSettleBlock(entry);
  assert.ok(!/禁止资源收益/.test(textOf(plainBlock)));
});

test('paragraph reminders combine manual tasks, preserve partial saves and restore every original row', async () => {
  const entry = drawnEntry('9344', 'Wrath of the Anemoi');
  const h = settleHarness({ cycle: 'c4', activePiles: [[entry], []],
    fullRecord: nextRecord('c4', { fate: '6' }) });
  const local = h.ctx.explorationEffectState(entry);
  local.manual['manual:2'] = true;
  const card = dataset.cards['c4:9344'];
  const rows = () => h.ctx.explorationEffectDescriptors(entry, card, h.ctx.explorationCardContext(entry, card));
  assert.equal(rows().length, 2, 'direction, marker and blockage form one reminder plus the independent Nemesis condition');
  assert.equal(local.manual['manual-group:0-1-2'], undefined, 'one completed old sentence does not complete the whole paragraph');
  assert.match(rows()[1].displayText, /宿敌标记/);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '已手动处理'));
  for (const id of ['manual-group:0-1-2', 'manual:0', 'manual:1', 'manual:2']) assert.equal(local.manual[id], true);
  assert.equal(h.ctx.pendingExplorationEffects().length, 1);
  await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '恢复手动待办'));
  for (const id of ['manual-group:0-1-2', 'manual:0', 'manual:1', 'manual:2']) assert.equal(local.manual[id], undefined);
  assert.equal(h.ctx.pendingExplorationEffects().length, 2);
  Object.assign(local.manual, { 'manual:0': true, 'manual:1': true, 'manual:2': true });
  rows();
  assert.equal(local.manual['manual-group:0-1-2'], true, 'fully completed legacy paragraphs stay completed');
});

test('Sabotage destinations follow all four removal footers and temporary cards return after the Timeline Battle', async () => {
  for (const [id, fateThreshold] of [['13630', 8], ['13631', 5], ['13632', 6], ['13633', 7]]) {
    for (const removed of [false, true]) {
      const entry = drawnEntry(id, 'Sabotage');
      const h = settleHarness({ cycle: 'c2', activePiles: [[entry], []],
        fullRecord: nextRecord('c2', { fate: String(removed ? fateThreshold : 0) }) });
      h.ctx.state.exploration.selectedByCycle = { c2: [id] };
      h.ctx.getSelectedExplorationIds = () => h.ctx.state.exploration.selectedByCycle.c2;
      await h.ctx.settleExplorationCard(entry);
      assert.equal(entry.removal, removed ? 'remove' : 'keep', id);
      h.ctx.endExplorationDraw({ skipPendingConfirm: true });
      if (removed) {
        assert.equal(h.drawState.temporaryRemoved[0].id, id);
        assert.ok(!h.ctx.getDestructionPileIds().includes(id));
        await h.ctx.processExplorationDelays('timeline-battle-end', { eventId: 'test-battle' });
        assert.ok(h.drawState.drawPile.includes(id), 'after the temporary period the card returns to Exploration');
        assert.equal(h.drawState.temporaryRemoved.length, 0);
      } else {
        assert.ok(h.ctx.getDestructionPileIds().includes(id), 'the untriggered footer returns the card to Sabotage');
        assert.ok(!h.drawState.drawPile.includes(id));
        assert.ok(!h.ctx.getSelectedExplorationIds().includes(id));
      }
      assert.deepEqual(h.alerts, []);
    }
  }
});

test('conditional return-card delays change removal and cancelling them restores the original destination', async () => {
  const entry = drawnEntry('9344', 'Conditional delay');
  const h = settleHarness({ cycle: 'c4', activePiles: [[entry], []], fullRecord: nextRecord('c4') });
  const card = { key: 'c4:9344', cycleId: 'c4', cardId: '9344', grants: [], manual: [
    { text: 'If the condition holds, remove this card until the next Timeline Battle.', badge: '' },
  ] };
  const context = h.ctx.explorationCardContext(entry, card);
  const items = delayRules.delayed(card, { ...context, resourceRules: rules });
  const pending = h.ctx.createExplorationDelayCardTools(entry, card, context);
  assert.ok(buttonNamed(pending, '确认条件成立并登记'));
  assert.ok(!pending.buttons.some(button => button.textContent === '自动结算'), '未知条件保留手动确认');
  assert.equal(entry.removal, 'keep');
  await h.ctx.scheduleExplorationDelay(entry, card, items, context, { confirmed: true });
  assert.equal(entry.removal, 'remove');
  await clickAndWait(buttonNamed(h.ctx.createExplorationDelayCardTools(entry, card, context), '撤销延迟安排'));
  assert.equal(entry.removal, 'keep');
  assert.deepEqual(h.alerts, []);
});

test('Storm Worsens resolves the Debt branch before its final removal check', async () => {
  for (const debt of ['0', '3']) {
    const entry = drawnEntry('9331', 'The Storm Worsens');
    const h = settleHarness({ cycle: 'c4', activePiles: [[entry], []], fullRecord: nextRecord('c4', { babelianDebt: debt }) });
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.record.cycleStats.c4.babelianDebt, debt === '0' ? '1' : '2');
    const local = h.ctx.explorationEffectState(entry);
    if (debt === '0') assert.equal(local.applied['conditional:storm-removal'].removal.after, 'remove', 'initial zero is no longer zero after the fallback');
    else {
      assert.equal(local.applied['conditional:storm-removal'], undefined, 'the footer waits for the combined map actions');
      await clickAndWait(buttonNamed(h.ctx.createExplorationSettleBlock(entry), '已处理其余效果'));
      const modified = JSON.parse(JSON.stringify(h.record));
      modified.cycleStats.c4.babelianDebt = '0';
      h.updateServerRecord(modified);
      await h.ctx.settleExplorationCard(entry);
      assert.equal(entry.removal, 'permanent', 'the final footer uses the record after manual resolution');
    }
    assert.deepEqual(h.alerts, []);
  }
});

test('Time Shift destinations stay resolved after tracks change and are restored on undo', async () => {
  for (const id of ['13536', '13538']) {
    for (const fate of ['0', '6']) {
      const entry = drawnEntry(id, 'Time Shift');
      const h = settleHarness({ cycle: 'c3', activePiles: [[entry], []],
        fullRecord: nextRecord('c3', { paradox: '3', fate }) });
      await h.ctx.settleExplorationCard(entry);
      const idCore = id === '13536' ? 'conditional:fast-forwarded' : 'conditional:rewound';
      assert.equal(entry.removal, fate === '0' ? 'permanent' : 'remove');
      const after = h.record.cycleStats.c3.paradox;
      await h.ctx.settleExplorationCard(entry);
      assert.equal(h.record.cycleStats.c3.paradox, after, 'the lower live Paradox does not start the fallback branch');
      assert.equal(h.ctx.createExplorationDelayCardTools(entry, dataset.cards[`c3:${id}`],
        h.ctx.explorationCardContext(entry, dataset.cards[`c3:${id}`])), null, 'managed conditional returns do not offer a second delay');
      const card = dataset.cards[`c3:${id}`], context = h.ctx.explorationCardContext(entry, card);
      const core = h.ctx.explorationEffectDescriptors(entry, card, context).find(item => item.id === idCore);
      await h.ctx.writeExplorationRecordEffects(entry, [core], context, [], true);
      assert.equal(entry.removal, 'keep');
      assert.equal(h.record.cycleStats.c3.paradox, '3');
      assert.deepEqual(h.alerts, []);
    }
  }
});

test('card-face audit writes Strangers and Hull while corrected Progress remains a placement task', async () => {
  for (const [cycle, id, bonus, field, before, after] of [
    ['c1', '6421', -2, 'strangers', '0', '1'],
    ['c1', '6401', 2, 'hull', '3', '4'],
    ['c3', '13514', -3, 'hull', '3', '2'],
    ['c5', '10302', 1, 'hull', '3', '4'],
    ['c5', '10308', 2, 'fate', '3', '2'],
  ]) {
    const entry = drawnEntry(id, 'Corrected icon');
    const value = nextRecord(cycle, { [field]: before });
    value.resources.priests = 2;
    value.titans = [{ id: 'keep', name: 'Existing Titan', count: 1 }];
    const h = settleHarness({ cycle, diplomacyBonus: bonus, activePiles: [[entry], []], fullRecord: value });
    await h.ctx.settleExplorationCard(entry);
    assert.equal(h.record.cycleStats[cycle][field], after, `${cycle}:${id}`);
    assert.equal(h.record.resources.priests, 2);
    assert.deepEqual(h.record.titans, value.titans);
    assert.deepEqual(h.alerts, []);
  }
  const entry = drawnEntry('6431', 'Grand Temple Ruins');
  const value = nextRecord('c1');
  value.titans = [{ id: 'keep', name: 'Existing Titan', count: 1 }];
  const h = settleHarness({ cycle: 'c1', diplomacyBonus: 2, activePiles: [[entry], []], fullRecord: value });
  await h.ctx.settleExplorationCard(entry);
  assert.deepEqual(h.record.titans, value.titans, 'a misread Progress symbol must not create a Titan');
  assert.equal(h.ctx.pendingExplorationTokenReminders()[0].item.manualPlacements[0].type, 'progress');
});

test('card-face audit Fast Forward Doom uses the Doom module and exposes old missed glyph receipts', async () => {
  const entry = drawnEntry('13536', 'Fast-Forwarded');
  const h = settleHarness({ cycle: 'c3', activePiles: [[entry], []], fullRecord: nextRecord('c3', { paradox: '3', fate: '6' }) });
  h.ctx.state.cardTracksVersion = 2;
  h.ctx.state.cardTracks = { doom: { started: true, position: 1, doom: 0 }, story: { started: true, position: 1, progress: 0 } };
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.cycleStats.c3.paradox, '1');
  const reminders = h.ctx.getExplorationStepTokenReminders('doom');
  assert.equal(reminders.length, 1);
  assert.ok(!h.ctx.getExplorationStepTokenReminders('story').length);
  assert.equal(h.ctx.placeExplorationCardToken(entry, reminders[0].explorationToken.item, 'doom', 'doom'), true);
  assert.equal(h.ctx.state.cardTracks.doom.doom, 1);

  const oldEntry = drawnEntry('13536', 'Old Fast-Forwarded');
  const old = settleHarness({ cycle: 'c3', activePiles: [[oldEntry], []], fullRecord: nextRecord('c3', { paradox: '1', fate: '6' }) });
  const receipt = { applied: { 'conditional:fast-forwarded': { ruleVersion: 2, changes: [{ type: 'paradox', cycleId: 'c3', amount: -2 }],
    removal: { before: 'keep', after: 'remove' }, summary: '悖论 -2', descriptor: {
      id: 'conditional:fast-forwarded', text: '快进', effects: [{ type: 'paradox', amount: -2 }],
      dynamic: true, manualIndexes: [0, 1, 2], removal: 'remove', remainder: '按卡面处理其余增益：gain +1 Α。',
    } } } };
  const value = JSON.parse(JSON.stringify(old.record));
  value.explorationBatchReceipts = { [old.ctx.explorationRoundId(oldEntry)]: receipt };
  old.updateServerRecord(value);
  old.ctx.cachedArgoRecord = value;
  old.ctx.syncExplorationBatchReceipt(oldEntry, receipt);
  const card = dataset.cards['c3:13536'];
  const context = old.ctx.explorationCardContext(oldEntry, card);
  const descriptor = old.ctx.explorationEffectDescriptors(oldEntry, card, context)[0];
  assert.equal(descriptor.receiptMismatch, true);
  assert.match(textOf(old.ctx.createExplorationSettleBlock(oldEntry)), /旧版漏识别灾祸/);
  await old.ctx.writeExplorationRecordEffects(oldEntry, [descriptor], context, [], true);
  assert.equal(old.record.cycleStats.c3.paradox, '3');
  await old.ctx.settleExplorationCard(oldEntry);
  assert.equal(old.ctx.getExplorationStepTokenReminders('doom').length, 1);
  assert.deepEqual(old.alerts, []);
});

test('card-face audit old Escalate arrangements remain visible for cancellation below the corrected threshold', async () => {
  const entry = drawnEntry('9327', 'Babelian Fata Morgana');
  const h = settleHarness({ cycle: 'c4', activePiles: [[entry], []], fullRecord: nextRecord('c4', { fate: '3' }) });
  const card = JSON.parse(JSON.stringify(dataset.cards['c4:9327']));
  card.manual[2].badge = 'ICON(white trident-like glyph on dark lozenge)/3+';
  const context = h.ctx.explorationCardContext(entry, card);
  const items = delayRules.delayed(card, { ...context, resourceRules: rules }).filter(item => item.modifier === 'escalate');
  await h.ctx.scheduleExplorationDelay(entry, card, items, context);
  const active = h.ctx.createExplorationDelayCardTools(entry, dataset.cards['c4:9327'], context);
  assert.match(textOf(active), /已更正为命运 ≥8/);
  assert.ok(buttonNamed(active, '撤销延迟安排'));
  const step = h.ctx.createDelayedExplorationStepTools('encounter');
  assert.match(textOf(step), /旧登记条件已更正/);
  assert.deepEqual(step.buttons, [], '遭遇提醒只展示来源与内容');
  await clickAndWait(buttonNamed(active, '撤销延迟安排'));
  assert.equal(h.record.explorationDelays.queue[0].status, 'cancelled');
  assert.deepEqual(h.alerts, []);
});

function enableStructureSaves(h, cycle, techKeys) {
  const engine = require('../technology/structure-tech-rules.js');
  const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'technology/tech_card_dictionary.min.json'), 'utf8'));
  h.ctx.window.ATO_STRUCTURE_TECH_RULES = engine;
  h.ctx.getStructureTechContext = () => ({ dictionary, technology: { unlocked: techKeys },
    cycleId: cycle, day: h.ctx.state.day, record: h.cachedRecord, automation: { events: {} } });
  h.ctx.refreshStructureTechContext = async () => h.ctx.getStructureTechContext();
}

test('an unselected structural Save does not block automatic settlement or pay its cost', async () => {
  const entry = drawnEntry('6402', 'Hornsworn Fleet');
  const h = settleHarness({ cycle: 'c1', diplomacyBonus: -3, activePiles: [[entry], []], fullRecord: nextRecord('c1') });
  enableStructureSaves(h, 'c1', ['advanced crew expansion']);
  const card = dataset.cards['c1:6402'];
  const context = h.ctx.explorationCardContext(entry, card);
  const item = h.ctx.explorationEffectDescriptors(entry, card, context).find(value => value.effects?.some(effect => effect.type === 'crew'));
  const tools = h.ctx.createStructureSaveTools(entry, item);
  assert.match(textOf(tools), /外交 7\+/);
  assert.match(textOf(tools), /命运/);
  assert.match(textOf(tools), /默认不豁免/);
  assert.equal(tools.buttons.filter(button => button.textContent === '继续原效果').length, 0);
  await h.ctx.settleSingleExplorationEffects([entry]);
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c1.crew, '2');
  assert.equal(h.record.cycleStats.c1.fate, '0', 'a reminder does not pay for or execute a Save');
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c1.crew, '2', 'the original effect remains receipt-idempotent');
});

test('draw-time single-effect settlement applies Debt without selecting an available Save', async () => {
  const entry = drawnEntry('9341', 'Waster Caravan');
  const h = settleHarness({ cycle: 'c4', diplomacyBonus: -1, activePiles: [[entry], []],
    fullRecord: nextRecord('c4', { babelianDebt: '2', fate: '0' }) });
  enableStructureSaves(h, 'c4', ['law mora']);
  h.ctx.refreshStructureTechContext = async () => { throw new Error('optional lookup must not block settlement'); };
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.record.cycleStats.c4.babelianDebt, '3');
  assert.equal(h.record.cycleStats.c4.fate, '0');
  await h.ctx.settleSingleExplorationEffects([entry]);
  assert.equal(h.record.cycleStats.c4.babelianDebt, '3');
  assert.deepEqual(h.alerts, []);
});

test('manual Save handling skips the entire effect and can restore its original pending state', async () => {
  const entry = drawnEntry('6421', 'Desecrated Temple');
  const h = settleHarness({ cycle: 'c1', diplomacyBonus: -2, activePiles: [[entry], []], fullRecord: nextRecord('c1') });
  enableStructureSaves(h, 'c1', ['rhetoric']);
  const item = h.ctx.explorationEffectDescriptors(entry, dataset.cards['c1:6421'],
    h.ctx.explorationCardContext(entry, dataset.cards['c1:6421']))[0];
  const tools = h.ctx.createStructureSaveTools(entry, item);
  await clickAndWait(buttonNamed(tools, '豁免'));
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.cycleStats.c1.strangers, '0');
  assert.equal(h.record.resources['c1-monument'], 2, 'independent resource gains still settle');
  assert.equal(h.record.cycleStats.c1.fate, '0');
  const restored = h.ctx.createStructureSaveTools(entry, item);
  await clickAndWait(buttonNamed(restored, '恢复本项待办'));
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.cycleStats.c1.strangers, '1');
});

test('missing optional Save context does not block an explicit batch or resource gains', async () => {
  const entry = drawnEntry('6421', 'Desecrated Temple');
  const value = nextRecord('c1');
  const h = settleHarness({ cycle: 'c1', diplomacyBonus: -2, activePiles: [[entry], []], fullRecord: value });
  enableStructureSaves(h, 'c1', ['rhetoric']);
  h.ctx.getStructureTechContext = () => null;
  h.ctx.refreshStructureTechContext = async () => { throw new Error('offline Save context'); };
  await h.ctx.settleExplorationDraw();
  assert.ok(h.written.length > 0);
  assert.equal(h.record.cycleStats.c1.strangers, '1');
  assert.equal(h.record.resources['c1-monument'], 2);
  assert.deepEqual(h.alerts, []);
});

test('explicit manual Save completion suppresses both parts of a compound Doom effect', async () => {
  const entry = drawnEntry('13536', 'Fast-Forwarded');
  const h = settleHarness({ cycle: 'c3', activePiles: [[entry], []], fullRecord: nextRecord('c3', { paradox: '3', fate: '6' }) });
  enableStructureSaves(h, 'c3', ['sun shielding']);
  h.ctx.state.cardTracksVersion = 2;
  h.ctx.state.cardTracks = { doom: { started: true, position: 1, doom: 0 }, story: { started: true, position: 1, progress: 0 } };
  const card = dataset.cards['c3:13536'];
  const item = h.ctx.explorationEffectDescriptors(entry, card, h.ctx.explorationCardContext(entry, card))[0];
  assert.match(textOf(h.ctx.createStructureSaveTools(entry, item)), /凝固时光/);
  await clickAndWait(buttonNamed(h.ctx.createStructureSaveTools(entry, item), '豁免'));
  await h.ctx.settleExplorationDraw();
  assert.equal(h.record.cycleStats.c3.paradox, '3', 'manual completion skips the compound row');
  assert.equal(h.ctx.state.cardTracks.doom.doom, 0);
  assert.equal(h.ctx.pendingExplorationTokenReminders().length, 0);
});

test('an existing Doom placement defaults to the original gain while optional Save context is missing', () => {
  const entry = drawnEntry('13536', 'Fast-Forwarded');
  const h = settleHarness({ cycle:'c3', activePiles:[[entry],[]], fullRecord:nextRecord('c3') });
  h.ctx.window.ATO_STRUCTURE_TECH_RULES = require('../technology/structure-tech-rules.js');
  h.ctx.getStructureTechContext = () => null;
  const item = {id:'pending-doom', effects:[], conditionState:true, manualPlacements:[{type:'doom',amount:1}], placementOnly:true};
  h.ctx.state.cardTracksVersion = 2;
  h.ctx.state.cardTracks = { doom: { started: true, position: 1, doom: 0 } };
  assert.equal(h.ctx.explorationTokenPlacementBlocked(entry,item),'');
  assert.ok(buttonNamed(h.ctx.createExplorationTokenPlacementTools(entry,item),'读取豁免提醒'));
  assert.equal(h.ctx.placeExplorationCardToken(entry,item,'doom','doom'),true);
  assert.equal(h.ctx.state.cardTracks.doom.doom,1);
});

test('manual Dues Save skips the whole choice and restoring it permits the original cost and Hull loss', async () => {
  const key=resource=>dataset.cycles.c4.resources[resource].storageKey;
  const entry=drawnEntry('9329','Diminishing Returns');
  const initial=nextRecord('c4',{fate:'7'},{[key('cursedDerelict')]:3,[key('imperialScroll')]:1,[key('babylonianContraption')]:1});
  const h=settleHarness({cycle:'c4',activePiles:[[entry],[]],fullRecord:initial});
  enableStructureSaves(h,'c4',['argo onboarding']);
  const plan=optionRules.duesPlan(h.record,'c4',dataset);
  assert.equal(h.record.resources[key('babylonianContraption')],1);
  assert.equal(h.record.cycleStats.c4.hull,'4');
  const card=dataset.cards['c4:9329'];
  let tools=h.ctx.createExplorationChoiceTools(entry,card,h.ctx.explorationCardContext(entry,card));
  assert.match(textOf(tools),/船体/);
  await clickAndWait(buttonNamed(tools,'豁免'));
  await assert.rejects(h.ctx.writeExplorationChoice(entry,'choice:dues','babylonianContraption',plan),/手动处理/);
  tools=h.ctx.createExplorationChoiceTools(entry,card,h.ctx.explorationCardContext(entry,card));
  assert.equal(tools.buttons.filter(button=>button.textContent==='恢复待办').length,0,'only the complete Save restore is exposed');
  await clickAndWait(buttonNamed(tools,'恢复本项待办'));
  await h.ctx.writeExplorationChoice(entry,'choice:dues','babylonianContraption',plan);
  assert.equal(h.record.resources[key('babylonianContraption')],0);
  assert.equal(h.record.cycleStats.c4.hull,'3');
});

test('unselected String Wish Save defaults to the original debt in both batch and direct repayment', async () => {
  const entry=drawnEntry('9333','String Wish');
  const value=nextRecord('c4',{babelianDebt:'0',fate:'0'},{[dataset.cycles.c4.resources.cursedDerelict.storageKey]:0});
  value.explorationPersistentEffects={c4:{stringWish:{resource:'cursedDerelict',remaining:2}}};
  const h=settleHarness({cycle:'c4',activePiles:[[entry],[]],fullRecord:value});
  enableStructureSaves(h,'c4',['law mora']);
  const block=h.ctx.createExplorationSettleBlock(entry);
  assert.match(textOf(block),/巴比伦债务/);
  await clickAndWait(buttonNamed(block,'自动还款'));
  assert.equal(h.record.cycleStats.c4.babelianDebt,'1');
  assert.deepEqual(h.alerts,[]);
  await h.ctx.settleExplorationCard(entry);
  assert.equal(h.record.cycleStats.c4.babelianDebt,'1');
  assert.equal(h.record.explorationPersistentEffects.c4.stringWish.remaining,1);
  const automatic=settleHarness({cycle:'c4',activePiles:[[entry],[]],fullRecord:value});
  enableStructureSaves(automatic,'c4',['law mora']);
  await automatic.ctx.settleExplorationCard(entry);
  assert.equal(automatic.record.cycleStats.c4.babelianDebt,'1');
  assert.equal(automatic.record.explorationPersistentEffects.c4.stringWish.remaining,1);
});

test('identical Save abilities render one reminder while retaining every source card', () => {
  const entry=drawnEntry('10301','Save sources');
  const h=settleHarness({cycle:'c5',activePiles:[[entry],[]],fullRecord:nextRecord('c5')});
  const keys=['advanced crew expansion','argo security','argo timeline security','argo philosophy'];
  enableStructureSaves(h,'c5',keys);
  const context=h.ctx.getStructureTechContext();
  context.dictionary={cards:copySaveCards()};
  function copySaveCards() {
    const dictionary=JSON.parse(fs.readFileSync(path.join(root,'technology/tech_card_dictionary.min.json'),'utf8'));
    return dictionary.cards.filter(card=>keys.includes(card.key)).map(card=>({...card,type:{...card.type,loop_limited:false}}));
  }
  h.ctx.getStructureTechContext=()=>context;
  const tools=h.ctx.createStructureSaveTools(entry,{id:'crew-loss',effects:[{type:'crew',amount:-1}]});
  assert.equal(tools.children.filter(node=>node.tag==='details').length,1,'same effect has one outer reminder');
  const images=tools.descendants().filter(node=>node.tag==='img');
  assert.equal(images.length,4);
  assert.equal(new Set(images.map(node=>node.src)).size,4);
  assert.equal(tools.buttons.filter(node=>node.textContent==='豁免').length,1);
  for (const name of ['高级船员扩招','阿尔戈号安保','阿尔戈号时光安保','阿尔戈号哲学']) assert.ok(textOf(tools).includes(name));
});
