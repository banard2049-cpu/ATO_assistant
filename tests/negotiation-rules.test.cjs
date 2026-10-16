const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rules = require('../technology/structure-tech-rules.js');
const negotiation = require('../technology/negotiation-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const copy = value => JSON.parse(JSON.stringify(value));
const factions = { c1: 'minoians', c2: 'helots', c3: 'sunheirs', c4: 'wasters', c5: 'followersOfArete' };
const other = { c1: 'labyrinthians', c2: 'cyclopes', c3: 'delphians', c4: 'aristotelians', c5: 'cycladeanProtectorate' };
function fixture(key, actionIndex = 0) {
  const card = dictionary.cards.find(card => card.key === key);
  assert.ok(card, key);
  const cycle = card.nodes[0].page.replace('cycle', 'c'), printed = negotiation.catalog.find(card => card.key === key).actions[actionIndex];
  const location = printed.location === 'underwater' ? 'city' : printed.location;
  const dataset = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/exploration-card-resources.js'), 'utf8'), dataset);
  const ctx = { dictionary, cycle, cycleId: cycle, day: 8, techKey: key, operationId: 'negotiation-one',
    technology: { unlocked: dictionary.cards.map(card => card.key) },
    record: { cycle, cycleStats: { [cycle]: { fate: '3', strangers: '3', paradox: '3', paranoia: '3', babelianDebt: '6', humanity: '1', hull: '2', crew: '2',
      ...(cycle === 'c2' ? { crewCounters: { crew: 2, refugees: 2, captives: 0 } } : {}) } },
      resources: { ...Object.fromEntries(rules.catalog.flatMap(item => item.actions.flatMap(action => (action.tradeRoutes || []).flatMap(route => [...route.costs, ...route.gains].map(resource => [resource.storageKey, 30]))))), priests: 3, fearEssence: 30, mazeFragment: 30 },
      diplomacy: { [`${cycle}-${factions[cycle]}`]: '4', [`${cycle}-${other[cycle]}`]: '4' },
      titans: [{ id: 'titan-a', name: '梦行者', count: 2 }] },
    heroes: { heroes: [{ id: 'hero-a', customName: '测试英雄' }] },
    automation: { version: 1, events: {} },
    state: { day: 8, notes: '原备注', cardTracks: { story: { position: 0, progress: 2 } }, exploration: { drawStateByCycle: { [cycle]: { drawPile: ['9300', '9301', '9302'], activePiles: [[], []], discardPile: [] } } } },
    mapState: { cycles: { [cycle]: { currentTile: 'town', tileVariants: printed.location === 'underwater' ? {} : { town: 'alternate', neighbor: 'alternate' }, tokens: { markers: {} } } } },
    mapTags: { tiles: { [`${cycle}:town`]: { tags: [location], factions: [factions[cycle]] } } },
    explorationDataset: dataset.window.ATO_EXPLORATION_CARD_RESOURCES };
  return ctx;
}
function choices(ctx, index = 0) {
  const action = rules.actionsFor(ctx.techKey, ctx).filter(item => item.negotiation)[index];
  assert.ok(action, ctx.techKey);
  const selected = { location: 'current:town', faction: factions[ctx.cycle], otherFaction: other[ctx.cycle], sacrifice: 'priest', checkResult: 'success',
    targetId: 'hero-a', underwaterConfirmed: true, sowConfirmed: true };
  if (action.mortal || action.contacts) selected[action.choices.find(item => item.type === 'number').id] = action.mortal || 4;
  if (action.trade) selected.trades = [{ routeId: action.tradeRoutes[0].id, count: 1 }];
  return { action, selected };
}
function execute(ctx, index = 0, override = {}) {
  const { action, selected } = choices(ctx, index);
  return rules.prepareOperation({ ...ctx, actionId: action.id, selection: { ...selected, ...override } });
}

test('all 32 printed negotiation cards and every branch can execute without mutating their input', () => {
  assert.equal(negotiation.catalog.length, 32);
  for (const card of negotiation.catalog) for (let index = 0; index < card.actions.length; index++) {
    const ctx = fixture(card.key, index), before = copy(ctx), result = execute(ctx, index);
    assert.equal(result.ok, true, `${card.key}/${index}: ${result.message}`);
    assert.equal(result.event.negotiation, true);
    assert.equal(result.record.technologyNegotiations[ctx.cycle][ctx.day].count, 1);
    assert.deepEqual(copy(ctx), before, `${card.key} stays pure`);
  }
});

test('development lists retain voyage abilities while negotiations have their own scope and details', () => {
  const ctx = fixture('trading solutions');
  assert.equal(rules.listActions({ ...ctx, techKey: undefined }).some(item => item.negotiation), false);
  assert.ok(rules.listActions({ ...ctx, techKey: undefined, scope: 'negotiation' }).some(item => item.techKey === 'trading solutions'));
  assert.equal(rules.listActions({ ...ctx, techKey: undefined, scope: 'negotiation' }).some(item => item.techKey === 'superior trading solutions'), false);
  assert.equal(rules.listActions({ ...ctx, scope: 'negotiation', cycle: 'c2', cycleId: 'c2' }).length, 0);
});

test('town trade uses the printed better rates, live stock, one fate and at most three exchanges', () => {
  for (const key of ['trading solutions', 'mobile trade fleet hub', 'ultimate trading solutions', 'cyclades commerce']) {
    const ctx = fixture(key), { action } = choices(ctx);
    assert.equal(action.tradeRoutes.length, 12);
    assert.equal(action.tradeRoutes[0].costs[0].amount, 2);
    assert.equal(action.tradeRoutes[0].gains[0].amount, 1);
    const result = execute(ctx, 0, { trades: [{ routeId: action.tradeRoutes[0].id, count: 3 }] });
    assert.equal(result.record.cycleStats[ctx.cycle].fate, '4');
    assert.equal(result.record.resources[action.tradeRoutes[0].costs[0].storageKey], 24);
    assert.equal(result.event.skipTimeline, true);
    assert.equal(result.event.status, 'completed');
    assert.equal(execute(ctx, 0, { trades: [{ routeId: action.tradeRoutes[0].id, count: 4 }] }).code, 'TRADE_LIMIT');
    ctx.record.resources[action.tradeRoutes[0].costs[0].storageKey] = 0;
    assert.equal(execute(ctx).code, 'INSUFFICIENT_RESOURCES');
  }
});

test('Moirai check result is chosen by the player and the sacrifice is paid on failure', () => {
  const ctx = fixture('moirai operation'), before = copy(ctx);
  const success = execute(ctx), failure = execute(ctx, 0, { checkResult: 'failure' });
  assert.equal(success.record.cycleStats.c3.fate, '0');
  assert.equal(failure.record.cycleStats.c3.fate, '3');
  assert.equal(failure.record.resources.priests, 2);
  assert.equal(execute(ctx, 0, { checkResult: '' }).code, 'CHECK_REQUIRED');
  const titan = execute(ctx, 0, { sacrifice: 'titan:titan-a', checkResult: 'failure' });
  assert.equal(titan.record.titans[0].count, 1);
  assert.equal(titan.record.resources.priests, 3);
  ctx.record.resources.priests = 0;
  assert.equal(execute(ctx).code, 'INSUFFICIENT_RESOURCES');
  assert.equal(before.record.resources.priests, 3);
});

test('daily first-negotiation waiver cannot be reused, including after a paid negotiation', () => {
  const ctx = fixture('crew expansion');
  const free = execute(ctx, 0, { waiveFate: true });
  assert.equal(free.record.cycleStats.c1.fate, '3');
  const next = { ...ctx, record: free.record, automation: free.automation, operationId: 'second' };
  assert.equal(execute(next, 0, { waiveFate: true }).code, 'FIRST_NEGOTIATION_USED');
  const paid = execute(ctx);
  assert.equal(execute({ ...next, record: paid.record }, 0, { waiveFate: true }).code, 'FIRST_NEGOTIATION_USED');
  assert.equal(execute({ ...next, day: 9 }, 0, { waiveFate: true }).ok, true);
  ctx.technology.unlocked = ['crew expansion'];
  assert.equal(execute(ctx, 0, { waiveFate: true }).code, 'INVALID_WAIVER');
});

test('diplomacy requires the correct local faction, exact mixed payment, and respects limits', () => {
  const ctx = fixture('diplomatic relations'), { action } = choices(ctx), fields = action.choices.filter(item => item.type === 'number');
  const result = execute(ctx, 0, { [fields[0].id]: 2, [fields[1].id]: 2 });
  assert.equal(result.record.diplomacy['c1-minoians'], '5');
  assert.equal(execute(ctx, 0, { [fields[0].id]: 3 }).code, 'INVALID_PAYMENT');
  assert.equal(execute(ctx, 0, { faction: 'labyrinthians' }).code, 'INVALID_TARGET');
  ctx.record.diplomacy['c1-minoians'] = '10';
  assert.equal(execute(ctx).code, 'DIPLOMACY_LIMIT');
  const contacts = fixture('alliance contacts');
  contacts.record.diplomacy['c2-helots'] = '7';
  assert.equal(execute(contacts).code, 'DIPLOMACY_CONDITION');
});

test('refugee relief reads the relation tier and C2 counters without spending normal crew', () => {
  const ctx = fixture('refugee relief effort');
  const result = execute(ctx);
  assert.equal(result.record.cycleStats.c2.crewCounters.refugees, 1);
  assert.equal(result.record.cycleStats.c2.crewCounters.crew, 2);
  assert.equal(result.record.cycleStats.c2.fate, '4');
  ctx.record.diplomacy['c2-helots'] = '7';
  assert.equal(execute(ctx).record.cycleStats.c2.fate, '5');
});

test('location visibility follows current tags and Last Visited markers, and validates before charging', () => {
  const ctx = fixture('crew expansion');
  assert.equal(rules.canNegotiate(ctx), true);
  ctx.mapTags.tiles['c1:town'].tags = [];
  assert.equal(rules.canNegotiate(ctx), false);
  assert.equal(execute(ctx).code, 'INVALID_LOCATION');
  ctx.mapTags.tiles['c1:town'].tags = ['city'];
  ctx.mapState.cycles.c1.tokens.markers.town = { last_city: true };
  assert.equal(rules.canNegotiate(ctx), false);
  for (const [key, index] of [['sustainable oasis', 0], ['spiral theory', 0]]) assert.equal(rules.canNegotiate(fixture(key, index)), true);
});

test('negotiation scope only lists abilities matching the location and hides every Last Visited destination', () => {
  const ctx = fixture('sustainable oasis'), list = () => rules.listActions({ ...ctx, techKey: undefined, scope: 'negotiation' });
  assert.ok(list().some(action => action.techKey === 'sustainable oasis'));
  assert.equal(list().some(action => action.techKey === 'plutocratic diplomacy'), false);
  ctx.mapState.cycles.c4.tokens.markers.town = { last_oasis: true };
  assert.equal(list().length, 0);
  assert.equal(rules.canNegotiate(ctx), false);
  const underwater = fixture('moirai rebellion');
  let actions = rules.listActions({ ...underwater, techKey: undefined, scope: 'negotiation' });
  assert.ok(actions.some(action => action.techKey === 'moirai rebellion'));
  assert.equal(actions.some(action => action.techKey === 'new oikos'), false);
  underwater.mapState.cycles.c5.tokens.markers.town = { c5_last_visited_underwater_city: true };
  assert.equal(rules.canNegotiate(underwater), false);
  assert.equal(rules.listActions({ ...underwater, techKey: undefined, scope: 'negotiation' }).length, 0);
  const silver = fixture('spiral theory');
  silver.mapState.cycles.c5.tokens.markers.town = { last_silver_ruin: true };
  assert.equal(rules.canNegotiate(silver), false);
});

test('oasis alternatives enforce sow thresholds and underwater abilities follow the actual map face', () => {
  const ctx = fixture('curse exchange');
  ctx.mapTags.tiles['c4:town'].tags = ['oasis'];
  assert.equal(execute(ctx, 0, { location: 'oasis:town', sowConfirmed: false }).code, 'CONFIRM_CONDITION');
  assert.equal(execute(ctx, 0, { location: 'oasis:town', sowConfirmed: true }).ok, true);
  assert.equal(execute(fixture('sustainable oasis', 2), 2, { sowConfirmed: false }).code, 'CONFIRM_CONDITION');
  const underwater = fixture('moirai rebellion');
  assert.equal(execute(underwater).ok, true);
  underwater.mapState.cycles.c5.tileVariants.town = 'alternate';
  assert.equal(execute(underwater).code, 'INVALID_LOCATION');
});

test('map access passives require a real adjacent town or Ruin marker and atomically move the visit marker', () => {
  const ctx = fixture('new oikos');
  ctx.mapTags.tiles['c5:town'].tags = [];
  ctx.mapTags.tiles['c5:neighbor'] = { tags: ['city'], factions: [factions.c5] };
  ctx.mapData = { cycles: [{ id: 'c5', tiles: [{ id: 'town', neighbors: { right: 'neighbor' } }] }] };
  assert.equal(rules.canNegotiate(ctx), true);
  const result = execute(ctx, 0, { location: 'adjacent:neighbor' });
  assert.equal(result.mapState.cycles.c5.tokens.markers.neighbor.last_city, true);
  assert.equal(rules.canNegotiate({ ...ctx, mapState: result.mapState }), false);
  ctx.mapState.cycles.c5.tokens.markers.town = { c5_ruin: true };
  const ruins = execute(ctx, 0, { location: 'ruins:town' });
  assert.equal(ruins.ok, true);
  assert.equal(ruins.mapState.cycles.c5.tokens.markers.town.last_city, true);
});

test('progress updates the dashboard and records a consumed transaction instead of double applying on sync', () => {
  const ctx = fixture('grassroot support'), result = execute(ctx);
  assert.equal(result.state.cardTracks.story.progress, 3);
  const entry = result.record.explorationTrackTransactions[0];
  assert.equal(result.state.exploration.trackReceiptsByCycle.c2[entry.id], true);
});

test('repeated operation IDs recover exactly once and altered requests cannot reuse their receipt', () => {
  const ctx = fixture('war recruitment'), result = execute(ctx);
  const repeated = execute({ ...ctx, record: result.record, automation: result.automation });
  assert.equal(repeated.duplicate, true);
  assert.deepEqual(repeated.record, result.record);
  assert.equal(execute({ ...ctx, record: result.record, automation: result.automation }, 0, { faction: 'cyclopes' }).code, 'OPERATION_CONFLICT');
  ctx.record.cycleStats.c2.fate = '12';
  const before = copy(ctx);
  assert.equal(execute(ctx).code, 'COST_LIMIT');
  assert.deepEqual(copy(ctx), before);
});

test('adverse negotiation effects show save reminders and may be left as a persistent manual task', () => {
  const ctx = fixture('crew expansion'), result = execute(ctx, 0, { 'manual:strangers': true });
  assert.equal(result.record.cycleStats.c1.strangers, '3');
  assert.equal(result.record.cycleStats.c1.crew, '3');
  assert.equal(result.event.status, 'pending');
  assert.deepEqual(result.event.manualStatEffects, [{ type: 'strangers', amount: 1 }]);
  const completed = rules.completeOperation({ ...ctx, record: result.record, automation: result.automation });
  assert.equal(completed.event.status, 'completed');
  assert.equal(completed.record.cycleStats.c1.strangers, '3');
});

test('merchant draw is durable, chooses only one drawn card and passes qualifying cards to normal exploration', () => {
  const ctx = fixture('merchants of the waste'), result = execute(ctx);
  assert.deepEqual(result.state.exploration.drawStateByCycle.c4.drawPile, ['9302']);
  assert.deepEqual(result.event.negotiationDraw.cards, ['9300', '9301']);
  const next = { ...ctx, state: result.state, record: result.record, automation: result.automation };
  assert.equal(rules.completeOperation({ ...next, day: ctx.day - 1, selection: { cardId: '9300' } }).code, 'NOT_DUE');
  assert.equal(rules.completeOperation({ ...next, selection: { cardId: 'forged' } }).code, 'CARD_CHOICE_REQUIRED');
  const completed = rules.completeOperation({ ...next, selection: { cardId: '9300' } });
  assert.equal(completed.ok, true);
  assert.equal(completed.state.exploration.drawStateByCycle.c4.activePiles[0][0].id, '9300');
  assert.equal(completed.state.exploration.drawStateByCycle.c4.discardPile[0].id, '9301');
  assert.equal(completed.record.cycleStats.c4.babelianDebt, '7');
  assert.equal(execute({ ...next, operationId: 'second-draw' }).code, 'DECK_REQUIRED');
});

test('merchant qualifying rewards obey the actual diplomacy rather than potential card rewards', () => {
  for (const [cardId, faction] of [['9342', 'cloudThieves'], ['9343', 'aristotelians']]) {
    for (const [diplomacy, qualified] of [['0', false], ['4', true]]) {
      const ctx = fixture('merchants of the waste');
      ctx.record.diplomacy[`c4-${faction}`] = diplomacy;
      ctx.state.exploration.drawStateByCycle.c4.drawPile = [cardId, '9300', '9301'];
      const drawn = execute(ctx);
      assert.equal(drawn.ok, true, drawn.message);
      const result = rules.completeOperation({ ...ctx, ...drawn, operationId: ctx.operationId, selection: { cardId } });
      assert.equal(result.ok, true, result.message);
      assert.equal(result.event.negotiationDraw.qualified, qualified);
      assert.equal(result.state.exploration.drawStateByCycle.c4.activePiles.flat().length, qualified ? 1 : 0);
    }
  }
});

test('merchant unknown reward conditions remain unselected until records or player confirmation resolve them', () => {
  const ctx = fixture('merchants of the waste');
  ctx.state.exploration.drawStateByCycle.c4.drawPile = ['9342', '9300', '9301'];
  const drawn = execute(ctx);
  const pending = { ...ctx, ...drawn, operationId: ctx.operationId };
  assert.equal(rules.completeOperation({ ...pending, selection: { cardId: '9342' } }).code, 'QUALIFICATION_REQUIRED');
  assert.equal(drawn.event.negotiationDraw.selectedCard, undefined);
  const result = rules.completeOperation({ ...pending, selection: { cardId: '9342', qualificationResult: 'none', qualificationConfirmed: true } });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.record.cycleStats.c4.babelianDebt, '7');
  assert.equal(result.event.negotiationDraw.qualified, false);
});

test('a pending merchant draw retains its original local factions after the Argo moves', () => {
  const ctx = fixture('merchants of the waste');
  ctx.explorationDataset.cards['c4:local-reward'] = { cardId: 'local-reward', titleEn: 'Local Reward',
    grants: [{ resource: 'imperialScroll', amount: 1, condition: { type: 'diplomacy', mode: 'only', bonus: 1 } }], manual: [] };
  ctx.state.exploration.drawStateByCycle.c4.drawPile = ['local-reward', '9300', '9301'];
  ctx.record.diplomacy['c4-aristotelians'] = '0';
  const drawn = execute(ctx);
  const moved = { ...ctx, ...drawn, operationId: ctx.operationId, selection: { cardId: 'local-reward' },
    mapState: { cycles: { c4: { currentTile: 'other' } } },
    mapTags: { tiles: { 'c4:other': { factions: ['aristotelians'] } } } };
  const selected = rules.completeOperation(moved);
  assert.equal(selected.ok, true, selected.message);
  assert.equal(selected.event.negotiationDraw.qualified, true);
  const kept = selected.state.exploration.drawStateByCycle.c4.activePiles[0][0];
  assert.equal(kept.technologyDiplomacyContext.diplomacy[0].id, 'wasters');
  assert.equal(kept.technologyDiplomacyContext.diplomacy[0].bonus, 1);
});

test('positive negotiation costs cannot be silently clipped while still granting a reward', () => {
  const ctx = fixture('curse exchange', 1);
  ctx.record.cycleStats.c4.babelianDebt = String(Number.MAX_SAFE_INTEGER);
  const before = copy(ctx);
  const result = execute(ctx, 1);
  assert.equal(result.code, 'STAT_LIMIT');
  assert.deepEqual(copy(ctx), before);
});

test('selecting a merchant card retains an outstanding manual debt and save task until explicit completion', () => {
  const ctx = fixture('merchants of the waste'), result = execute(ctx, 0, { 'manual:babelianDebt': true });
  assert.equal(result.record.cycleStats.c4.babelianDebt, '6');
  const selected = rules.completeOperation({ ...ctx, state: result.state, record: result.record, automation: result.automation, selection: { cardId: '9300' } });
  assert.equal(selected.event.status, 'pending');
  assert.match(selected.event.rewardLabel, /巴比伦债务变化仍需手动处理/);
  const afterSelection = { ...ctx, state: selected.state, record: selected.record, automation: selected.automation };
  const replayed = rules.completeOperation({ ...afterSelection, selection: { cardId: '9300' } });
  assert.equal(replayed.duplicate, true, 'retrying the card-selection step is idempotent');
  assert.equal(replayed.event.status, 'pending', 'selecting a card does not finish the separate manual debt task');
  assert.deepEqual(replayed.automation, selected.automation);
  assert.deepEqual(replayed.record, selected.record);
  assert.equal(rules.completeOperation({ ...afterSelection, selection: { cardId: '9301' } }).code, 'OPERATION_CONFLICT');
  const completed = rules.completeOperation({ ...ctx, state: selected.state, record: selected.record, automation: selected.automation });
  assert.equal(completed.event.status, 'completed');
  assert.equal(completed.record.cycleStats.c4.babelianDebt, '6');
  const afterCompletion = { ...afterSelection, record: completed.record, automation: completed.automation };
  assert.equal(rules.completeOperation({ ...afterCompletion, selection: { cardId: '9300' } }).duplicate, true);
  assert.equal(rules.completeOperation({ ...afterCompletion, selection: { cardId: '9301' } }).code, 'OPERATION_CONFLICT');
});
