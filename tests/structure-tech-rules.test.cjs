const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../technology/structure-tech-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const copy = value => JSON.parse(JSON.stringify(value));

function context(techKey = 'grand stoa', overrides = {}) {
  const card = dictionary.cards.find(card => card.key === techKey);
  const cycle = card?.nodes?.[0]?.page.replace('cycle', 'c') || 'c2';
  return {
    dictionary, cycle, day: 5, techKey, operationId: 'one',
    technology: { unlocked: dictionary.cards.map(card => card.key), unimportant: [] },
    record: { cycle, fate: '2', cycleStats: { [cycle]: { fate: '2' } },
      resources: { ...Object.fromEntries(rules.catalog.flatMap(rule => rule.actions.flatMap(action =>
        (action.tradeRoutes || []).flatMap(route => [...route.costs, ...route.gains].map(item => [item.storageKey, 100]))))),
        'c1-trireme': 10, 'c2-warTrireme': 4 },
      titans: [{ id: 'dream', name: '梦行者', count: 2, crippled: false },
        { id: 'crippled', name: '历战者', count: 1, crippled: true },
        { id: 'healthy', name: '归来者', count: 1, crippled: false }], notes: 'keep me' },
    heroes: { heroes: [{ id: 'odys', argonaut: 'odys' }, { id: 'custom', argonaut: 'circe', customName: '自定英雄' }],
      graveyard: [{ id: 'retired', argonaut: 'raz' }] },
    automation: { version: 1, events: {} }, ...overrides,
  };
}
function selectionFor(action) {
  return {
    ...(action.target === 'hero' ? { targetId: 'odys' } : {}),
    ...(action.target?.includes('titan') ? { titanId: 'crippled' } : {}),
    ...(action.sacrifice ? { titanId: 'dream', resultTitan: action.models[0] } : {}),
    ...(action.rebuild ? { payment: 'c1-trireme' } : {}),
    ...(action.trade ? { trades: [{ routeId: action.tradeRoutes.at(-1).id, count: 1 }] } : {}),
    ...(action.requiresDevelopment ? { story2aConfirmed: true } : {}),
  };
}
function apply(ctx, actionId) {
  const action = rules.actionsFor(ctx.techKey, ctx).find(action => action.actionId === actionId);
  assert.ok(action, `${ctx.techKey}/${actionId} exists in the real dictionary`);
  return rules.prepareOperation({ ...ctx, actionId, selection: selectionFor(action) });
}
function withResult(ctx, result, day = ctx.day) { return { ...ctx, day, record: result.record, automation: result.automation }; }

test('card references use dark-side titles while dictionary keys and tree titles stay intact', () => {
  const titles = {
    "argo's mission": '圆桌舰桥', "argo's destiny": '圆桌舰桥', 'argo’s curse': '圆桌舰桥',
    'voyage home': '损坏的圆桌舰桥', 'mnestis thesis': '阿尔戈英雄寝园',
    'temenos project': '迷宫矿井', 'the work is never done': '最后的泪水',
    'the last wish': '涅瑞伊得贝壳', 'last tome': '最后的学院',
  };
  const before = copy(dictionary);
  for (const [techKey, title] of Object.entries(titles)) {
    const ctx = context(techKey);
    assert.equal(rules.referenceTitle(ctx, techKey), title);
    const actions = rules.actionsFor(techKey, ctx);
    for (const action of actions) {
      assert.equal(action.title, title);
      assert.equal(action.techKey, techKey);
      if (action.trade) assert.equal(action.sourceLabel, title);
    }
    if (actions.length) {
      const result = apply(ctx, actions[0].actionId);
      assert.equal(result.ok, true, result.message);
      assert.ok(result.operation.label.startsWith(title), result.operation.label);
      assert.equal(result.operation.techKey, techKey);
    }
  }
  assert.equal(dictionary.cards.find(card => card.key === "argo's mission").names.zh, '阿尔戈号的任务');
  assert.equal(rules.titleFor({ key: 'custom', names: { zh: '自定义科技' } }), '自定义科技');
  assert.equal(rules.titleFor({ key: 'custom', names: { zh: '浅色面' }, backNames: { en: 'Dark Side' } }), 'Dark Side');
  assert.equal(rules.referenceTitle({ dictionary }, 'unknown'), '');
  assert.deepEqual(dictionary, before);
});

test('saves, map progress, negotiations and investigation reminders share the dark-side title policy', () => {
  const keys = ['hope logic', 'deeply embedded spies', 'rhetoric', 'minoan investigations'];
  const local = { cards: copy(dictionary.cards.filter(card => keys.includes(card.key))) };
  local.cards.forEach(card => { card.backNames = { zh: `深色面：${card.key}`, en: `Dark: ${card.key}` }; });
  const ctx = context('rhetoric', { dictionary: local, cycle: 'c1', map: { explored: true, tags: ['progress'] } });
  assert.equal(rules.saveReminders(ctx, [{ type: 'doom', amount: 1 }])[0].title, '深色面：hope logic');
  assert.equal(rules.mapProgressReminders(ctx)[0].title, '深色面：deeply embedded spies');
  const actions = rules.listActions({ ...ctx, scope: 'negotiation' });
  assert.ok(actions.length);
  assert.ok(actions.every(action => action.title === '深色面：rhetoric'));
  const investigation = require('../technology/investigation-rules.js');
  assert.equal(investigation.reminders(ctx, rules.getHelpers())[0].title, '深色面：minoan investigations');
});

test('legacy timeline labels and return instructions display dark-side titles without changing saved events', () => {
  const ctx = context('the work is never done');
  const result = apply(ctx, 'final-tear');
  const saved = result.automation.events.one;
  saved.label = '工作永无止境 · 最后之泪';
  saved.rewardLabel = '取回「工作永无止境」科技卡';
  const before = copy(result.automation);
  const shown = rules.getEvents(withResult(ctx, result, 36))[0];
  assert.equal(shown.label, '最后的泪水 · 最后之泪');
  assert.equal(shown.rewardLabel, '取回「最后的泪水」科技卡');
  assert.equal(shown.techKey, ctx.techKey);
  assert.equal(shown.overdue, true);
  assert.deepEqual(result.automation, before);
  assert.equal(rules.referenceText(ctx, ctx.techKey, shown.label), shown.label);
  assert.equal(rules.referenceText(ctx, 'unknown', '手写内容'), '手写内容');
});

test('automation families merge forms and prefer available higher-tier sources without merging their rules', () => {
  const ctx = context('ultimate titan breeding', { techKey: undefined, cycle: 'c5' });
  const groups = rules.listActionGroups(ctx);
  const breeding = groups.find(group => group.id === 'titan-breeding');
  assert.equal(breeding.actions.length, 8, 'four sources retain both printed modes');
  assert.equal(breeding.actions[0].techKey, 'ultimate titan breeding');
  assert.equal(breeding.actions[0].id, 'breed');
  const cretan = breeding.actions.find(action => action.techKey === 'titan breeding' && action.id === 'breed');
  const persian = breeding.actions.find(action => action.techKey === 'ultimate titan breeding' && action.id === 'breed');
  assert.ok(cretan.choices.find(choice => choice.id === 'resultTitan').options.some(option => option.value === 'tt_earthshaker'));
  assert.equal(persian.choices.find(choice => choice.id === 'resultTitan').options.some(option => option.value === 'tt_earthshaker'), false);
  const enhancement = groups.find(group => group.id === 'titan-enhancement');
  assert.equal(enhancement.actions.length, 2);
  assert.equal(enhancement.actions[0].techKey, 'titan genetic memory');
  const explicit = rules.listActionGroups(context('titan breeding'));
  assert.equal(explicit.length, 1);
  assert.deepEqual(explicit[0].actions.map(action => action.techKey), ['titan breeding','titan breeding']);
  assert.equal(rules.listActions(ctx).length, groups.reduce((sum, group) => sum + group.actions.length, 0), 'presentation preserves all atomic modes');
});

test('a cooling highest tier falls back to a usable lower source and keeps the old event intact', () => {
  const ctx=context('ultimate titan breeding');
  const result=apply(ctx,'breed-accelerated');
  const current={...withResult(ctx,result),techKey:undefined};
  const group=rules.listActionGroups(current).find(group=>group.id==='titan-breeding');
  assert.equal(group.actions[0].techKey,'superior titan breeding');
  assert.equal(group.actions[0].available,true);
  assert.equal(group.actions.find(action=>action.techKey==='ultimate titan breeding').available,false);
  const lower=rules.prepareOperation({...current,techKey:'titan breeding',actionId:'breed',operationId:'lower',selection:{titanId:'dream',resultTitan:'tt_earthshaker'}});
  assert.equal(lower.ok,true);
  assert.equal(lower.operation.techKey,'titan breeding');
  assert.deepEqual(lower.automation.events.one,result.automation.events.one,'the high-tier pending event is not rewritten or completed');
});

test('identical Save reminders merge their available sources while costs and checks remain distinct', () => {
  const keys=['advanced crew expansion','argo security','argo timeline security','argo philosophy','bankers of the waste','sun shielding'];
  const local={cards:copy(dictionary.cards.filter(card=>keys.includes(card.key)))};
  local.cards.forEach(card=>{card.type.loop_limited=false;});
  const ctx=context('argo philosophy',{cycle:'c5',dictionary:local,technology:{unlocked:keys,unimportant:[]}});
  const before=copy(ctx);
  const reminders=rules.saveReminders(ctx,[{type:'crew',amount:-2}]);
  assert.equal(reminders.length,3,'matching common Save, debt-cost Save and solar Save remain separate');
  const common=reminders.find(item=>item.costLabel==='+1 命运');
  assert.equal(common.sources.length,4);
  assert.deepEqual(common.sources.map(source=>source.techKey),keys.slice(0,4));
  common.sources.forEach(source=>{assert.ok(source.title);assert.ok(source.image);assert.ok(common.title.includes(source.title));});
  assert.deepEqual(ctx,before,'merging does not change unlocks or record any usage');
  ctx.technology.unimportant=['argo security'];
  ctx.record.explorationDelays={disabledTechs:{c5:{'argo philosophy':{}}}};
  const filtered=rules.saveReminders(ctx,[{type:'crew',amount:-1}]).find(item=>item.costLabel==='+1 命运');
  assert.deepEqual(filtered.sources.map(source=>source.techKey),['advanced crew expansion','argo timeline security']);
  const hullKeys=['argo onboarding','refugee integration'];
  const hullDict={cards:copy(dictionary.cards.filter(card=>hullKeys.includes(card.key)))};
  hullDict.cards.forEach(card=>{card.type.loop_limited=false;});
  const hull=rules.saveReminders({...ctx,dictionary:hullDict,technology:{unlocked:hullKeys}},[{type:'hull',amount:-1}]);
  assert.equal(hull.length,2,'different variable checks cannot replace one another');
});

test('all 21 real cards expose their 25 executable modes and preserve source, payment and targets', () => {
  assert.equal(rules.catalog.length, 21);
  assert.equal(rules.catalog.reduce((sum, card) => sum + card.actions.length, 0), 25);
  let modes = 0;
  for (const card of rules.catalog) for (const action of card.actions) {
    const ctx = context(card.key), before = copy(ctx);
    const result = apply(ctx, action.id);
    assert.equal(result.ok, true, `${card.key}/${action.id}: ${result.message}`);
    assert.equal(result.event.techKey, card.key);
    assert.equal(result.event.cycleId, ctx.cycle);
    assert.equal(result.event.dueDay, ctx.day + action.days);
    assert.equal(result.event.kind, action.kind);
    assert.equal(result.event.stepId, 'timeline');
    assert.equal(result.receipt.request.actionId, action.id);
    assert.equal(result.record.notes, 'keep me');
    assert.equal(result.record.cycleStats[ctx.cycle].fate, action.fate ? '3' : '2');
    assert.equal(result.record.resources['c1-trireme'], action.rebuild ? 5 : 10);
    assert.equal(result.record.titans.find(titan => titan.id === 'dream').count, action.sacrifice ? 1 : 2);
    if (action.target === 'hero') assert.equal(result.event.targetLabel, '奥德修斯·零');
    if (action.target?.includes('titan')) assert.equal(result.event.targetLabel, '历战者');
    assert.deepEqual(ctx, before, 'the pure planner never mutates its input');
    modes++;
  }
  assert.equal(modes, 25);
});

test('all five technology trade menus execute every printed resource alternative with one fate cost', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/exploration-card-resources.js'), 'utf8'), sandbox);
  const resources = sandbox.window.ATO_EXPLORATION_CARD_RESOURCES.cycles;
  const trading = rules.catalog.filter(card => card.actions.some(action => action.trade && !action.requiresDevelopment));
  assert.equal(trading.length, 5);
  let routes = 0;
  for (const card of trading) {
    const ctx = context(card.key), action = rules.actionsFor(card.key, ctx)[0];
    assert.equal(action.maxTrades, 3);
    assert.equal(action.tradeRoutes.length, 12, card.key);
    assert.equal(new Set(action.tradeRoutes.map(route => route.id)).size, 12);
    assert.equal(action.confirmations.some(item => item.id === 'tradeManualConfirmed'), false);
    for (const route of action.tradeRoutes) {
      const local = copy(ctx), before = copy(ctx);
      for (const item of [...route.costs, ...route.gains]) {
        assert.equal(item.storageKey, resources[ctx.cycle].resources[item.resource].storageKey, `${card.key}/${item.resource}`);
        local.record.resources[item.storageKey] = 20;
      }
      const selection = { trades: [{ routeId: route.id, count: 3 }] };
      const result = rules.prepareOperation({ ...local, actionId: 'trade', selection });
      assert.equal(result.ok, true, `${card.key}/${route.id}: ${result.message}`);
      assert.equal(result.record.resources[route.costs[0].storageKey], 20 - route.costs[0].amount * 3);
      assert.equal(result.record.resources[route.gains[0].storageKey], 20 + route.gains[0].amount * 3);
      assert.equal(result.record.cycleStats[ctx.cycle].fate, '3', 'one fate per activation, not per exchange');
      assert.equal(result.event.tradeCount, 3);
      assert.equal(result.event.tradeSummary, `${route.label} ×3`);
      assert.deepEqual(result.receipt.tradeChanges, result.event.tradeChanges);
      assert.equal(result.event.gains[0].label, route.gains[0].label);
      assert.deepEqual(ctx, before);
      assert.equal(result.event.dueDay, ctx.day + 7);
      assert.equal(result.event.cooldownUntilDay, ctx.day + 7);
      routes++;
    }
  }
  assert.equal(routes, 60);
});

test('trade rates distinguish the first-cycle cooldown menu and later-cycle cooldown menus', () => {
  const menu = key => rules.actionsFor(key, context(key))[0].tradeRoutes;
  const exchange = (key, routeId) => {
    const route = menu(key).find(route => route.id === routeId);
    return [route.costs[0].amount, route.gains[0].amount];
  };
  assert.deepEqual(exchange('superior trading solutions', 'trireme-to-armament'), [4, 1]);
  assert.deepEqual(exchange('superior trading solutions', 'muscleCluster-to-rawAmbrosia'), [1, 1]);
  assert.deepEqual(exchange("argo's mission", 'cyclopeanMetal-to-violentAmbrosia'), [1, 2]);
  assert.deepEqual(exchange("argo's destiny", 'eyesCluster-to-frozenAmbrosia'), [1, 3]);
  assert.deepEqual(exchange('voyage home', 'oxidizedAmbrosia-to-microwaveCell'), [5, 1]);
});

test('three development-stage trade cards exchange either direction without fate, cooldown or a three-trade limit', () => {
  const expected = {
    'temenos project': { base: 'c2-warTrireme', alternatives: ['mazeFragment', 'fearEssence'], label: '迷宫矿井' },
    'abyss expedition': { base: 'c3-hyperboreanAlloy', alternatives: ['livingAbyss', 'skinOfMalice'], label: '深渊灯塔' },
    'mortal mapmakers': { base: 'c4-cursedDerelict', alternatives: ['c4-blackenedHalo', 'c4-burnedOutGrace'], label: '愚行之塔' },
  };
  assert.equal(rules.catalog.filter(card => card.actions.some(action => action.trade)).length, 9);
  for (const [techKey, spec] of Object.entries(expected)) {
    const ctx = context(techKey), action = rules.actionsFor(techKey, ctx)[0];
    assert.equal(action.maxTrades, null);
    assert.equal(action.tradeRoutes.length, 4);
    assert.match(action.label, new RegExp(spec.label));
    assert.equal(action.sourceLabel, dictionary.cards.find(card => card.key === techKey).backNames.zh);
    for (const route of action.tradeRoutes) {
      const local = copy(ctx);
      for (const item of [...route.costs, ...route.gains]) local.record.resources[item.storageKey] = 100;
      assert.ok(route.costs[0].storageKey === spec.base || route.gains[0].storageKey === spec.base);
      assert.ok(spec.alternatives.includes(route.costs[0].storageKey) || spec.alternatives.includes(route.gains[0].storageKey));
      const selection = { trades: [{ routeId: route.id, count: 17 }], story2aConfirmed: true };
      const result = rules.prepareOperation({ ...local, actionId: 'trade', selection });
      assert.equal(result.ok, true, `${techKey}: ${result.message}`);
      assert.equal(result.record.resources[route.costs[0].storageKey], 83);
      assert.equal(result.record.resources[route.gains[0].storageKey], 117);
      assert.equal(result.record.cycleStats[ctx.cycle].fate, '2');
      assert.equal(result.event.payment.some(item => item.type === 'fate'), false);
      assert.equal(result.event.skipTimeline, true);
      assert.equal(result.event.status, 'completed');
      assert.equal(rules.getAvailability(withResult(local, result)).ok, true);
      assert.equal(action.confirmations.some(item => item.id === 'developmentConfirmed'), false);
      assert.equal(rules.prepareOperation({ ...local, actionId: 'trade', selection: { ...selection, story2aConfirmed: false } }).code, 'CONFIRM_CONDITION');
    }
    const before = copy(ctx);
    assert.equal(rules.actionsFor(techKey, { ...ctx, cycle: 'c5' }).length, 0);
    assert.equal(rules.prepareOperation({ ...ctx, cycle: 'c5', actionId: 'trade', selection: selectionFor(action) }).code, 'CYCLE_SCOPE');
    assert.deepEqual(ctx, before);
  }
});

test('mixed trade routes execute in order and never leave partial payment if a later line fails', () => {
  const ctx = context('superior trading solutions');
  const selection = { trades: [{ routeId: 'trireme-to-monument', count: 2 }, { routeId: 'monument-to-trireme', count: 1 }] };
  ctx.record.resources['c1-trireme'] = 6;
  ctx.record.resources['c1-monument'] = 1;
  const result = rules.prepareOperation({ ...ctx, actionId: 'trade', selection });
  assert.equal(result.ok, true);
  assert.equal(result.record.resources['c1-trireme'], 1);
  assert.equal(result.record.resources['c1-monument'], 2);
  assert.equal(result.event.tradeCount, 3);
  assert.equal(result.event.payment.find(item => item.storageKey === 'c1-monument').amount, -1);
  assert.equal(result.event.gains.find(item => item.storageKey === 'c1-monument').amount, 2);
  for (const change of [ { 'c1-trireme': 5 }, { 'c1-trireme': '' } ]) {
    const local = copy(ctx); Object.assign(local.record.resources, change);
    const before = copy(local);
    assert.equal(rules.prepareOperation({ ...local, actionId: 'trade', selection }).ok, false);
    assert.deepEqual(local, before, 'neither fate, resource nor event is committed on failure');
  }
  const initial = copy(ctx); initial.record.resources['c1-monument'] = 0;
  const chain = rules.prepareOperation({ ...initial, actionId: 'trade', selection });
  assert.equal(chain.ok, true, 'newly gained stone can fund a later reverse trade');
  assert.equal(chain.record.resources['c1-trireme'], 1);
  assert.equal(chain.record.resources['c1-monument'], 1);
  chain.event.tradeChanges.forEach(item => { assert.ok(item.before >= 0); assert.ok(item.after >= 0); });
  chain.event.tradeSteps.flatMap(step => step.changes).forEach(item => { assert.ok(item.before >= 0); assert.ok(item.after >= 0); });
  assert.equal(rules.prepareOperation({ ...initial, actionId: 'trade', selection: { trades: [...selection.trades].reverse() } }).code, 'INSUFFICIENT_RESOURCES', 'the same reverse trade cannot spend a gain from a later row');
  const laterFailure = { trades: [{ routeId: 'trireme-to-monument', count: 1 }, { routeId: 'trireme-to-armament', count: 1 }] };
  const limited = copy(initial); limited.record.resources['c1-trireme'] = 3;
  const before = copy(limited);
  assert.equal(rules.prepareOperation({ ...limited, actionId: 'trade', selection: laterFailure }).code, 'INSUFFICIENT_RESOURCES');
  assert.deepEqual(limited, before, 'a successful first row is rolled back if a later row cannot pay');
  const repeated = rules.prepareOperation({ ...withResult(ctx, result), actionId: 'trade', selection });
  assert.equal(repeated.duplicate, true);
  assert.deepEqual(repeated.record, result.record);
  assert.deepEqual(repeated.automation, result.automation);
});

test('invalid, empty, excessive and forged trade selections cannot charge fate or start cooldown', () => {
  const ctx = context('superior trading solutions'), before = copy(ctx);
  for (const trades of [undefined, [], [{ routeId: 'trireme-to-monument', count: 0 }],
    [{ routeId: 'trireme-to-monument', count: -1 }], [{ routeId: 'trireme-to-monument', count: 1.5 }],
    [{ routeId: '__proto__', count: 1 }], [{ routeId: 'trireme-to-monument', count: true }],
    [{ routeId: 'trireme-to-monument', count: 4 }], [{ routeId: 'trireme-to-monument', count: 2 }, { routeId: 'trireme-to-armament', count: 2 }]]) {
    const result = rules.prepareOperation({ ...ctx, actionId: 'trade', selection: { trades, tradeManualConfirmed: true } });
    assert.equal(result.ok, false, JSON.stringify(trades));
    assert.deepEqual(ctx, before);
  }
  const missingGain = copy(ctx);
  delete missingGain.record.resources['c1-monument'];
  const result = rules.prepareOperation({ ...missingGain, actionId: 'trade', selection: { trades: [{ routeId: 'trireme-to-monument', count: 1 }] } });
  assert.equal(result.record.resources['c1-monument'], 1, 'an unfilled gained resource starts at zero');
  const large = copy(ctx); large.record.resources['c1-monument'] = Number.MAX_SAFE_INTEGER;
  assert.equal(rules.prepareOperation({ ...large, actionId: 'trade', selection: { trades: [{ routeId: 'trireme-to-monument', count: 1 }] } }).code, 'RESOURCE_LIMIT');
});

test('town Negotiation cards stay out of development and expose separate negotiation actions in details', () => {
  const removed = ['trading solutions', 'mobile trade fleet hub', 'ultimate trading solutions', 'cyclades commerce'];
  for (const techKey of removed) {
    const ctx = context(techKey), before = copy(ctx);
    assert.equal(rules.catalog.some(card => card.key === techKey), false);
    assert.ok(rules.actionsFor(techKey, ctx).every(action => action.negotiation && action.id.startsWith('negotiate-')));
    assert.equal(rules.listActions({ ...ctx, techKey: undefined }).some(action => action.techKey === techKey), false);
    assert.equal(rules.prepareOperation({ ...ctx, actionId: 'trade', selection: { trades: [{ routeId: 'trireme-to-monument', count: 1 }] } }).code, 'UNKNOWN_ACTION');
    assert.deepEqual(ctx, before, 'removed Negotiation automation cannot mutate record or schedule events');
  }
});

test('legacy manually confirmed trade receipts remain replayable without enabling new manual-only trades', () => {
  const ctx = context('superior trading solutions');
  const request = { techKey: ctx.techKey, actionId: 'trade', cycleId: ctx.cycle, selection: { tradeManualConfirmed: true } };
  ctx.automation.events.one = { id: 'one', techKey: ctx.techKey, actionId: 'trade', cycleId: ctx.cycle, kind: 'cooldown', dueDay: 12, cooldownUntilDay: 12, status: 'pending' };
  ctx.record.technologyActionReceipts = { one: { id: 'one', request, payment: [{ type: 'fate', amount: 1 }] } };
  assert.equal(rules.prepareOperation({ ...ctx, actionId: 'trade', selection: request.selection }).duplicate, true);
  assert.equal(rules.getAvailability({ ...ctx, day: 11 }).code, 'ABILITY_BUSY');
  assert.equal(rules.getAvailability({ ...ctx, day: 12 }).ok, true);
  assert.equal(rules.prepareOperation({ ...ctx, day: 12, operationId: 'new', actionId: 'trade', selection: request.selection }).code, 'INVALID_TRADE');
});

test('trade menus and backend execution stay in their printed resource cycle even for permanent legacy cards', () => {
  const localDictionary = copy(dictionary);
  const keys = ['superior trading solutions'];
  localDictionary.cards.filter(card => keys.includes(card.key)).forEach(card => { card.type.loop_limited = false; });
  for (const techKey of keys) {
    const source = context(techKey, { dictionary: localDictionary });
    const action = rules.actionsFor(techKey, source)[0];
    assert.equal(action.resourceCycle, 'c1');
    assert.equal(action.tradeRoutes.every(route => [...route.costs, ...route.gains].every(item => item.storageKey.startsWith('c1-'))), true);
    for (const cycle of ['c2', 'c5']) {
      const ctx = { ...source, cycle, record: { ...source.record, cycle, fate: '2', cycleStats: { [cycle]: { fate: '2' } } } };
      const before = copy(ctx);
      assert.deepEqual(rules.actionsFor(techKey, ctx), [], 'explicit details hide foreign trade menus');
      assert.equal(rules.listActions({ ...ctx, techKey: undefined }).some(item => item.techKey === techKey), false);
      assert.equal(rules.getAvailability(ctx).code, 'CYCLE_SCOPE');
      assert.equal(rules.prepareOperation({ ...ctx, actionId: 'trade', selection: selectionFor(action) }).code, 'CYCLE_SCOPE');
      assert.deepEqual(ctx, before, 'stale-page submissions do not debit old-cycle inventories or current fate');
    }
  }
});

test('the dashboard hides locked and out-of-cycle cards while explicit card details explain restrictions', () => {
  const ctx = context('grand stoa');
  ctx.technology.unlocked = ['grand stoa', 'titan training', "argo's destiny"];
  assert.deepEqual(rules.listActions({ ...ctx, techKey: undefined }).map(action => action.techKey), ['grand stoa', 'titan training']);
  ctx.technology.unlocked = [];
  assert.equal(rules.listActions({ ...ctx, techKey: undefined }).length, 0);
  const [detail] = rules.actionsFor('grand stoa', ctx);
  assert.equal(detail.disabled, true);
  assert.match(detail.reason, /解锁/);
  ctx.technology.unlocked = ['grand stoa'];
  ctx.record.explorationDelays = { disabledTechs: { c2: { 'grand stoa': { untilDay: 10 } } } };
  assert.equal(rules.listActions({ ...ctx, techKey: undefined })[0].available, false);
});

test('dictionary node ownership supports merged cards and refuses a different disambiguated node', () => {
  const grand = copy(dictionary.cards.find(card => card.key === 'grand stoa'));
  const train = copy(dictionary.cards.find(card => card.key === 'titan training'));
  grand.nodes = [{ page: 'cycle2', id: 'merged', name: 'Combined Research' }];
  train.nodes = [{ page: 'cycle2', id: 'merged', name: 'Combined Research' }];
  const ctx = context('grand stoa', { dictionary: { cards: [grand, train] }, technology: { unlocked: ['combined research'] } });
  assert.equal(rules.getAvailability(ctx).ok, true);
  assert.deepEqual(rules.actionsFor('combined research', ctx).map(action => action.techKey), ['grand stoa', 'titan training']);
  ctx.record.explorationDelays = { disabledTechs: { c2: { 'combined research': {} } } };
  assert.equal(rules.getAvailability(ctx).code, 'DISABLED_TECH');

  const first = copy(dictionary.cards.find(card => card.key === 'mnestis thesis'));
  const second = copy(first);
  first.key = 'mnestis thesis@@cycle1'; first.index = 10;
  second.key = 'mnestis thesis@@cycle3'; second.index = 20;
  second.nodes = [{ page: 'cycle3', id: 'other', name: 'Mnestis Thesis' }];
  const distinct = context(first.key, { dictionary: { cards: [first, second] }, cycle: 'c3', technology: { unlocked: ['mnestis thesis@@cycle1'] } });
  distinct.record.cycleStats.c3 = { fate: '2' };
  assert.equal(rules.getAvailability(distinct).ok, true);
  assert.equal(rules.getAvailability({ ...distinct, techKey: second.key }).code, 'LOCKED_TECH');
  const ready = rules.prepareOperation({ ...distinct, actionId: 'reflect', selection: { targetId: 'custom' } });
  assert.equal(ready.ok, true);
  assert.equal(ready.event.techKey, first.key);
  assert.equal(ready.event.targetLabel, '自定英雄');
  assert.equal(rules.getAvailability({ ...withResult(distinct, ready), technology: { unlocked: [second.key] }, techKey: second.key }).ok, true);
});

test('only formal voyage days can schedule; T6/00 is day zero and invalid counts cannot silently coerce', () => {
  const ctx = context('mnestis thesis', { cycle: 'c1' });
  for (const day of ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', '', null, undefined, -1, 1.5, true, [], {}, '1e2']) {
    assert.equal(apply({ ...ctx, day }, 'reflect').code, 'INVALID_DAY', String(day));
  }
  const ready = apply({ ...ctx, day: 'T6/00' }, 'reflect');
  assert.equal(ready.event.createdDay, 0);
  assert.equal(ready.event.dueDay, 7);
  assert.equal(apply({ ...ctx, day: '09' }, 'reflect').event.dueDay, 16);
  assert.equal(apply({ ...ctx, cycle: 'c2', day: 'T6/00' }, 'reflect').code, 'INVALID_DAY');
});

test('unknown, retired and non-dreamwalker targets fail atomically and real target labels are retained', () => {
  const ctx = context('mnestis thesis');
  const heroes = rules.actionsFor(ctx.techKey, ctx)[0].choices[0].options;
  assert.deepEqual(heroes.map(item => item.label), ['奥德修斯·零', '自定英雄']);
  assert.equal(rules.prepareOperation({ ...ctx, actionId: 'reflect', selection: { targetId: 'retired' } }).code, 'INVALID_TARGET');
  assert.equal(rules.prepareOperation({ ...ctx, heroes: undefined, actionId: 'reflect', selection: { heroName: 'free text' } }).code, 'INVALID_TARGET');
  const breed = context('titan breeding');
  assert.deepEqual(rules.actionsFor(breed.techKey, breed)[0].choices[0].options.map(item => item.value), ['dream']);
  for (const selection of [{ titanId: 'healthy', resultTitan: 'tt_earthshaker', dreamwalkerConfirmed: true },
    { titanId: 'dream', resultTitan: 'tt_returner' }]) {
    const before = copy(breed);
    assert.equal(rules.prepareOperation({ ...breed, actionId: 'breed', selection }).code, 'INVALID_TARGET');
    assert.deepEqual(breed, before);
  }
  const healing = context('trauma growth');
  assert.deepEqual(rules.actionsFor(healing.techKey, healing)[0].choices[0].options.map(item => item.value), ['crippled']);
  assert.equal(rules.prepareOperation({ ...healing, actionId: 'rehabilitate', selection: { titanId: 'healthy' } }).code, 'INVALID_TARGET');
});

test('Mnestis Thesis advertises its effect beside the price and only nags when no hero is on file', () => {
  const ctx = context('mnestis thesis');
  const action = rules.actionsFor(ctx.techKey, ctx)[0];
  assert.equal(action.effectLabel, '使其获得一个回忆节点');
  assert.equal(action.costLabel, '+1 命运');
  assert.equal(action.rewardLabel, '所选英雄任选一张回忆卡获得 +1 回忆节点');
  // Heroes exist but none is selected: the picker itself is the prompt, so the
  // planner stays silent and only keeps the caller from executing.
  const silent = rules.prepareOperation({ ...ctx, actionId: 'reflect', selection: {} });
  assert.equal(silent.code, 'INVALID_TARGET');
  assert.equal(silent.message, '');
  // With an empty record the full reminder is still the only useful message.
  const empty = rules.prepareOperation({ ...ctx, heroes: { heroes: [], graveyard: [] }, actionId: 'reflect', selection: {} });
  assert.equal(empty.code, 'INVALID_TARGET');
  assert.equal(empty.message, '请先在英雄记录表添加英雄，再选择当前在役的阿尔戈英雄。');
  assert.equal(rules.prepareOperation({ ...ctx, actionId: 'reflect', selection: { targetId: 'odys' } }).ok, true);
});

test('both rebuild payment branches read the missing scout from the map and require sufficient resources', () => {
  const ctx = context('canal reconnaissance');
  let result = rules.prepareOperation({ ...ctx, actionId: 'rebuild', selection: { payment: 'c2-warTrireme' } });
  assert.equal(result.ok, true);
  assert.equal(result.record.resources['c2-warTrireme'], 2);
  assert.equal(result.record.resources['c1-trireme'], 10);
  assert.equal(result.record.cycleStats.c2.fate, '3');
  assert.equal(result.event.dueDay, 9);
  result = rules.prepareOperation({ ...ctx, actionId: 'rebuild', selection: { payment: 'c1-trireme' } });
  assert.equal(result.ok, true);
  assert.equal(result.record.resources['c1-trireme'], 5);
  assert.equal(result.record.resources['c2-warTrireme'], 4);
  for (const value of [0, 4, '', undefined, 'unknown']) {
    const limited = copy(ctx); limited.record.resources['c1-trireme'] = value;
    const before = structuredClone(limited);
    result = apply(limited, 'rebuild');
    assert.equal(result.code, 'INSUFFICIENT_RESOURCES');
    assert.deepEqual(limited, before);
  }
  assert.equal(rules.prepareOperation({ ...ctx, actionId: 'rebuild', selection: { payment: 'other' } }).code, 'INVALID_PAYMENT');
});

test('fate increases by one, uses the requested cycle and never clamps a partial cost at the limit', () => {
  const ctx = context('mnestis thesis', { cycle: 'c3' });
  ctx.record = { cycle: 'c2', fate: '11', cycleStats: { c2: { fate: '11' }, c3: { fate: '4' } } };
  let result = apply(ctx, 'reflect');
  assert.equal(result.record.cycleStats.c3.fate, '5');
  assert.equal(result.record.fate, '11');
  assert.equal(result.record.cycleStats.c2.fate, '11');
  ctx.record.cycleStats.c3.fate = '12';
  assert.equal(apply(ctx, 'reflect').code, 'COST_LIMIT');
  delete ctx.record.cycleStats.c3.fate;
  assert.equal(apply(ctx, 'reflect').code, 'UNKNOWN_COST');
});

test('replayed operation IDs never charge twice and mismatched requests are rejected', () => {
  const ctx = context('titan breeding');
  const result = apply(ctx, 'breed-accelerated');
  const next = withResult(ctx, result);
  const duplicate = apply(next, 'breed-accelerated');
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.record, result.record);
  assert.deepEqual(duplicate.automation, result.automation);
  assert.equal(apply(next, 'breed').code, 'OPERATION_CONFLICT');
  assert.equal(rules.prepareOperation({ ...next, operationId: '__proto__', actionId: 'breed' }).code, 'INVALID_OPERATION');
  assert.equal(rules.prepareOperation({ ...next, automation: {}, actionId: 'breed-accelerated', selection: selectionFor(rules.catalog.find(card => card.key === ctx.techKey).actions[1]) }).code, 'INCONSISTENT_OPERATION');
  assert.equal(apply({ ...next, record: { ...next.record, technologyActionReceipts: {} } }, 'breed-accelerated').code, 'INCONSISTENT_OPERATION');
});

test('a due titan reward enters the record on completion while the event lock still waits for it', () => {
  const ctx = context('grand stoa'), result = apply(ctx, 'dreamwalker');
  assert.equal(rules.completeOperation({ ...withResult(ctx, result, 13) }).code, 'NOT_DUE');
  const next = withResult(ctx, result, 20);
  const [event] = rules.getEvents(next);
  assert.equal(event.due, true); assert.equal(event.overdue, true); assert.equal(event.locked, true);
  assert.equal(event.auto, true, 'a named titan reward settles without asking the player');
  assert.deepEqual(event.grant, { type: 'titan', titanId: 'dreamwalker', name: '梦行者', count: 1 });
  assert.equal(rules.getAvailability(next).code, 'ABILITY_BUSY');
  assert.deepEqual(next.record.titans, ctx.record.titans, 'reading the timeline never awards content');
  const done = rules.completeOperation(next);
  assert.equal(done.ok, true);
  assert.equal(done.event.completedDay, 20);
  assert.deepEqual(done.record.titans.find(titan => titan.id === 'dream'), { id: 'dream', name: '梦行者', count: 3, crippled: false, limit: 3 });
  assert.deepEqual(done.event.grant, { type: 'titan', titanId: 'dreamwalker', name: '梦行者', count: 1, applied: true, appliedDay: 20 });
  assert.equal(done.receipt.grant.applied, true);
  assert.equal(done.record.titan, '5');
  assert.equal(rules.getAvailability(withResult(ctx, done, 20)).ok, true);
  assert.equal(rules.getEvents(withResult(ctx, done, 20))[0].overdue, false);
  const repeat = rules.completeOperation(withResult(ctx, done, 20));
  assert.equal(repeat.duplicate, true);
  assert.equal(repeat.record.titans.find(titan => titan.id === 'dream').count, 3, 'a replayed completion never grants a second titan');
});

test('every breeding model enters the record with its printed name and delay', () => {
  const ctx = context('titan breeding'), result = apply(ctx, 'breed');
  assert.deepEqual(result.event.grant, { type: 'titan', titanId: 'tt_earthshaker', name: '撼地者', count: 1 });
  const done = rules.completeOperation(withResult(ctx, result, 15));
  assert.deepEqual(done.record.titans.map(titan => titan.name), ['梦行者', '历战者', '归来者', '撼地者']);
  const added = done.record.titans.at(-1);
  assert.deepEqual(added, { id: 'titan-one', name: '撼地者', count: 1, limit: 1, crippled: false });
  assert.equal(done.record.titan, '4');
  const twice = rules.prepareOperation({ ...withResult({ ...ctx, operationId: 'two' }, done, 15), actionId: 'breed',
    selection: { titanId: 'dream', resultTitan: 'tt_earthshaker' } });
  const merged = rules.completeOperation(withResult({ ...ctx, operationId: 'two' }, twice, 30));
  assert.equal(merged.record.titans.find(titan => titan.name === '撼地者').count, 2);
  assert.deepEqual(merged.record.titans.map(titan => titan.name), ['历战者', '归来者', '撼地者'], 'the same model keeps one healthy row and the spent dreamwalkers are gone');
});

test('titan repair clears one maimed model and reports a vanished target instead of blocking', () => {
  const ctx = context('trauma growth'), result = apply(ctx, 'rehabilitate');
  assert.deepEqual(result.event.grant, { type: 'repair', titanId: 'crippled', name: '历战者' });
  assert.equal(rules.getEvents(withResult(ctx, result, 12))[0].auto, true);
  const done = rules.completeOperation(withResult(ctx, result, 12));
  assert.equal(done.record.titans.find(titan => titan.id === 'crippled').crippled, false);
  assert.equal(done.event.grant.skipped, undefined);
  const multi = context('trauma growth');
  multi.record.titans = [{ id: 'two', name: '历战者', count: 2, crippled: true }];
  const planned = rules.prepareOperation({ ...multi, actionId: 'rehabilitate', selection: { titanId: 'two' } });
  const healed = rules.completeOperation(withResult(multi, planned, 12));
  assert.deepEqual(healed.record.titans.map(titan => ({ id: titan.id, count: titan.count, crippled: titan.crippled })),
    [{ id: 'two', count: 1, crippled: true }, { id: 'two-healed', count: 1, crippled: false }]);
  const missing = rules.completeOperation({ ...withResult(ctx, result, 12), record: { ...result.record, titans: [] } });
  assert.equal(missing.ok, true, 'a removed row cannot block the completion forever');
  assert.equal(missing.event.grant.skipped, '记录表中已找不到原目标泰坦');
});

test('only rewards whose result is already chosen settle automatically', () => {
  for (const [techKey, actionId] of [['mnestis thesis', 'reflect'], ['titan training', 'train'],
    ['titan genetic memory', 'genesium'], ['the work is never done', 'final-tear'], ["argo's mission", 'trade']]) {
    const ctx = context(techKey), result = apply(ctx, actionId);
    const [event] = rules.getEvents(withResult(ctx, result, result.event.dueDay));
    assert.equal(event.auto, false, `${techKey} keeps its manual step`);
    assert.equal(rules.eventGrant(event), null);
    const done = rules.completeOperation(withResult(ctx, result, result.event.dueDay));
    assert.equal(done.ok, true);
    assert.equal(done.event.grant, undefined);
    assert.deepEqual(done.record.titans, ctx.record.titans, `${techKey} awards nothing by itself`);
  }
});

test('invalid titan counts refuse the reward instead of guessing', () => {
  const ctx = context('grand stoa'), result = apply(ctx, 'dreamwalker');
  const next = withResult(ctx, result, 20);
  const broken = rules.completeOperation({ ...next, record: { ...next.record, titans: [{ id: 'x', name: '梦行者', count: '二' }] } });
  assert.equal(broken.code, 'INVALID_TITANS');
  assert.equal(rules.getEvents(next)[0].status, 'pending', 'the event stays open for a corrected record');
  const empty = rules.completeOperation({ ...next, record: { ...next.record, titans: [] } });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.record.titans, [{ id: 'titan-one', name: '梦行者', count: 1, limit: 1, crippled: false }]);
});

test('pure cooldowns unlock automatically on their date while accelerated breeding requires both locks to clear', () => {
  const trade = context("argo's mission"), cooling = apply(trade, 'trade');
  assert.equal(rules.getAvailability(withResult(trade, cooling, 11)).code, 'ABILITY_BUSY');
  assert.equal(rules.getAvailability(withResult(trade, cooling, 12)).ok, true);
  assert.equal(rules.getEvents(withResult(trade, cooling, 12))[0].status, 'completed');
  const ctx = context('titan breeding'), result = apply(ctx, 'breed-accelerated');
  assert.equal(result.event.dueDay, 10); assert.equal(result.event.cooldownUntilDay, 17);
  const done = rules.completeOperation(withResult(ctx, result, 10));
  assert.equal(rules.getAvailability(withResult(ctx, done, 16)).code, 'ABILITY_BUSY');
  assert.equal(rules.getAvailability(withResult(ctx, done, 17)).ok, true);
  assert.equal(rules.getAvailability(withResult(ctx, result, 18)).code, 'ABILITY_BUSY', 'elapsed cooldown alone does not resolve a reward');
  assert.equal(rules.getEvents(withResult(ctx, done, 16))[0].locked, true);
});

test('all breeding models have the correct delay and consuming the final dreamwalker removes only that row', () => {
  const ctx = context('ultimate titan breeding');
  ctx.record.titans[0].count = 1;
  for (const actionId of ['breed', 'breed-accelerated']) for (const resultTitan of ['tt_cloudsoarer', 'tt_wishender', 'tt_plunarlander', 'tt_shadowdancer']) {
    const result = rules.prepareOperation({ ...ctx, actionId, selection: { titanId: 'dream', resultTitan } });
    assert.equal(result.ok, true);
    assert.equal(result.event.dueDay, 5 + (actionId === 'breed-accelerated' ? 5 : resultTitan === 'tt_shadowdancer' ? 14 : 10));
    assert.deepEqual(result.record.titans.map(titan => titan.id), ['crippled', 'healthy']);
  }
});

test('unfinished old-cycle rewards lock the same card without transferring independent day cooldowns', () => {
  const ctx = context('grand stoa'), result = apply(ctx, 'dreamwalker');
  const c3 = { ...ctx, cycle: 'c3', day: 0, automation: { version: 1, events: {} }, automationsByCycle: { c2: result.automation } };
  assert.equal(rules.getAvailability(c3).code, 'ABILITY_BUSY');
  assert.match(rules.getAvailability(c3).message, /C2.*D14/);
  assert.deepEqual(rules.getEvents(c3), [], 'timeline stays scoped to the selected cycle');
  assert.equal(rules.completeOperation({ ...withResult(ctx, result, 20), cycle: 'c3' }).code, 'CYCLE_SCOPE');
  const done = rules.completeOperation(withResult(ctx, result, 14));
  assert.equal(rules.getAvailability({ ...c3, automationsByCycle: { c2: done.automation } }).ok, true);
  const cooled = copy(result.automation); cooled.events.one.kind = 'cooldown'; cooled.events.one.cooldownUntilDay = 100;
  assert.equal(rules.getAvailability({ ...c3, automationsByCycle: { c2: cooled } }).ok, true);
  const rewarded = copy(result.automation); rewarded.events.one.status = 'completed'; rewarded.events.one.cooldownUntilDay = 100;
  assert.equal(rules.getAvailability({ ...c3, automationsByCycle: { c2: rewarded } }).ok, true);
});

test('the discarded tear and simulation battle remain distinct persistent technology events', () => {
  const tear = context('the work is never done'), discarded = apply(tear, 'final-tear');
  assert.equal(discarded.event.temporarilyDiscarded, true);
  assert.equal(discarded.event.dueDay, 35);
  assert.equal(rules.getAvailability(withResult(tear, discarded, 36)).code, 'ABILITY_BUSY');
  const returned = rules.completeOperation(withResult(tear, discarded, 36));
  assert.equal(returned.event.temporarilyDiscarded, false);
  assert.equal(rules.getAvailability(withResult(tear, returned, 36)).ok, true);
  const battle = context('mnestis training'), planned = apply(battle, 'simulation');
  assert.equal(planned.event.kind, 'battle'); assert.equal(planned.event.dueDay, 6); assert.equal(planned.event.cooldownUntilDay, 17);
  assert.equal(planned.event.receiptId, undefined, 'technology battle events do not masquerade as exploration delays');
  assert.equal(rules.getAvailability(withResult(battle, rules.completeOperation(withResult(battle, planned, 6)), 7)).code, 'ABILITY_BUSY');
});

test('all 13 saving abilities are emitted only for their adverse direction with complete manual instructions', () => {
  assert.equal(rules.saveCatalog.length, 13);
  for (const rule of rules.saveCatalog) {
    const ctx = context(rule.key), before = copy(ctx);
    const effects = Object.entries(rule.triggers).map(([type, amount]) => ({ type, amount: amount * 2 }));
    const reminder = rules.saveReminders(ctx, effects).find(item => item.techKey === rule.key);
    assert.ok(reminder, rule.key);
    assert.ok(reminder.title); assert.ok(reminder.image); assert.ok(reminder.condition); assert.ok(reminder.check); assert.ok(reminder.costLabel);
    assert.ok(reminder.effect);
    const reversed = effects.map(effect => ({ ...effect, amount: -effect.amount }));
    assert.equal(rules.saveReminders(ctx, reversed).some(item => item.techKey === rule.key), false);
    assert.equal(rules.saveReminders(ctx, effects.map(effect => ({ ...effect, amount: 0 }))).some(item => item.techKey === rule.key), false);
    assert.deepEqual(ctx, before, 'reminders do not roll dice, pay costs or record a usage');
  }
  const solar = rules.saveReminders(context('sun shielding'), [{ type: 'crew', amount: -4 }]).find(item => item.techKey === 'sun shielding');
  assert.equal(solar.costLabel, '失去 1 凝固时光');
  assert.match(solar.effect, /忽略本次失去或获得/);
  const banker = rules.saveReminders(context('bankers of the waste'), [{ type: 'crew', amount: -1 }]).find(item => item.techKey === 'bankers of the waste');
  assert.equal(banker.costLabel, '+1 命运，+1 巴比伦债务');
});

test('save reminders ignore unimportant, locked, wrong-cycle and disabled cards, including merged-node preferences', () => {
  const ctx = context('rhetoric'), effects = [{ type: 'strangers', amount: 2 }];
  assert.equal(rules.saveReminders(ctx, effects).length, 1);
  assert.deepEqual(rules.saveReminders(ctx), []);
  assert.deepEqual(rules.saveReminders(ctx, []), []);
  assert.deepEqual(rules.saveReminders(ctx, [{ type: 'strangers', amount: Infinity }]), []);
  assert.deepEqual(rules.saveReminders({ ...ctx, technology: { unlocked: [] } }, effects), []);
  assert.deepEqual(rules.saveReminders({ ...ctx, cycle: 'c2' }, effects), []);
  assert.deepEqual(rules.saveReminders({ ...ctx, technology: { unlocked: ['rhetoric'], unimportant: ['rhetoric'] } }, effects), []);
  ctx.record.explorationDelays = { disabledTechs: { c1: { rhetoric: {} } } };
  assert.deepEqual(rules.saveReminders(ctx, effects), []);
  const saved = copy(dictionary.cards.find(card => card.key === 'rhetoric'));
  saved.nodes[0].name = 'Merged Structure';
  const merged = { ...context('rhetoric'), dictionary: { cards: [saved] },
    technology: { unlocked: ['merged structure'], unimportant: ['merged structure'] } };
  assert.deepEqual(rules.saveReminders(merged, effects), []);
  const scheduling = context('grand stoa'); scheduling.technology.unimportant = ['grand stoa'];
  assert.equal(rules.getAvailability(scheduling).ok, true, 'unimportant only suppresses passive reminders');
});

test('legacy empty state normalizes safely and malformed event records cannot poison timeline sorting or locks', () => {
  assert.deepEqual(rules.normalizeAutomation(undefined), { version: 1, events: {} });
  assert.deepEqual(rules.normalizeAutomation({ events: { missing: {}, wrong: { cycleId: 'c1', kind: 'reward', techKey: 'grand stoa', dueDay: -1 } } }), { version: 1, events: {} });
  const ctx = context('grand stoa'), result = apply(ctx, 'dreamwalker');
  const normalized = rules.normalizeAutomation(result.automation);
  assert.deepEqual(normalized, result.automation);
  normalized.events.one.label = 'changed';
  assert.notEqual(result.automation.events.one.label, 'changed');
});
