const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../technology/structure-tech-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const edge = (from, cost, to, gain) => ({ id: `${from}-${to}`, label: `${cost} ${from} → ${gain} ${to}`,
  costs: [{ resource: from, storageKey: from, label: from, amount: cost }],
  gains: [{ resource: to, storageKey: to, label: to, amount: gain }] });

test('planner selects the best funded rate, includes intermediate category costs and breaks ties by quota', () => {
  const action = { maxTrades: 3, tradeRoutes: [edge('a', 4, 'b', 1), edge('a', 2, 'c', 1), edge('c', 1, 'b', 1)] };
  const record = { resources: { a: 8 } }, before = structuredClone(record);
  const best = rules.findTradePath(action, 'a', 'b', record);
  assert.equal(best.ok, true);
  assert.deepEqual(best.steps, [{ routeId: 'a-c', count: 1 }, { routeId: 'c-b', count: 1 }]);
  assert.equal(best.input, 2); assert.equal(best.output, 1); assert.equal(best.extra, 2);
  assert.deepEqual(record, before);
  const limited = rules.findTradePath({ ...action, maxTrades: 1 }, 'a', 'b', record);
  assert.equal(limited.ok, true); assert.equal(limited.path.length, 1); assert.equal(limited.input, 4);
  const tie = rules.findTradePath({ ...action, tradeRoutes: [edge('a', 2, 'b', 1), ...action.tradeRoutes.slice(1)] }, 'a', 'b', record);
  assert.equal(tie.path.length, 1);
});

test('planner scales every leg to exact integer batches without spending existing intermediate stock', () => {
  const action = { maxTrades: 3, tradeRoutes: [edge('a', 2, 'b', 3), edge('b', 4, 'c', 5), edge('c', 6, 'd', 1)] };
  const record = { resources: { a: 16, b: 7, c: 9 } };
  const plan = rules.findTradePath(action, 'a', 'd', record);
  assert.equal(plan.ok, true); assert.equal(plan.input, 16); assert.equal(plan.output, 5);
  assert.deepEqual(plan.steps.map(step => step.count), [8, 6, 5]);
  const preview = rules.previewTrades(action, { tradeSteps: plan.steps }, record);
  const balances = Object.fromEntries(preview.changes.map(item => [item.storageKey, item.after]));
  assert.deepEqual(balances, { a: 0, b: 7, c: 9, d: 5 });
  const poor = rules.findTradePath(action, 'a', 'd', { resources: { a: 15, b: 100, c: 100 } });
  assert.equal(poor.code, 'INSUFFICIENT_RESOURCES');
});

test('planner guards disconnected, same-resource, exhausted-quota and invalid-stock trades', () => {
  const action = { maxTrades: 2, tradeRoutes: [edge('a', 1, 'b', 1), edge('b', 1, 'c', 1), edge('d', 1, 'e', 1)] };
  const record = { resources: { a: 2, d: 2 } };
  assert.equal(rules.findTradePath(action, 'a', 'a', record).ok, false);
  assert.equal(rules.findTradePath(action, 'a', 'e', record).code, 'NO_TRADE_PATH');
  const prior = [{ routeId: 'd-e', count: 1 }];
  assert.equal(rules.findTradePath(action, 'a', 'c', record, prior).code, 'TRADE_LIMIT');
  assert.equal(rules.findTradePath(action, 'a', 'c', { resources: { a: '?' } }).code, 'UNKNOWN_COST');
  assert.equal(rules.findTradePath(action, 'a', 'b', { resources: { a: 2, b: Number.MAX_SAFE_INTEGER } }).code, 'RESOURCE_LIMIT');
});

test('ordered batches preserve dependency order and count repeated categories only once', () => {
  const action = { maxTrades: 2, tradeRoutes: [edge('a', 2, 'b', 1), edge('b', 1, 'c', 1)] };
  const record = { resources: { a: 4 } };
  const plan = rules.findTradePath(action, 'a', 'c', record);
  const steps = [...plan.steps, ...plan.steps];
  const result = rules.previewTrades(action, { tradeSteps: steps }, record);
  assert.equal(result.ok, true); assert.equal(result.total, 2); assert.equal(result.exchanges, 4);
  assert.equal(result.changes.find(item => item.storageKey === 'c').after, 2);
  assert.equal(rules.previewTrades(action, { tradeSteps: [...steps].reverse() }, record).code, 'INSUFFICIENT_RESOURCES');
  for (const tradeSteps of [[], null, [{ routeId: 'fake', count: 1 }], [{ routeId: 'a-b', count: 0 }], [{ routeId: 'a-b', count: 1.5 }]]) {
    assert.equal(rules.previewTrades(action, { tradeSteps }, record).ok, false);
  }
});

test('every technology menu has valid icons and every reachable resource pair executes exactly as previewed', () => {
  for (const card of rules.catalog) for (const action of card.actions.filter(item => item.trade)) {
    const items = [...new Map(action.tradeRoutes.flatMap(route => [...route.costs, ...route.gains]).map(item => [item.storageKey, item])).values()];
    const record = { resources: Object.fromEntries(items.map(item => [item.storageKey, 1000])) };
    for (const item of items) assert.ok(fs.existsSync(path.join(__dirname, '../record/assets/resource-icons', `${item.resource}.png`)), item.resource);
    for (const from of items) for (const to of items) {
      if (from === to) continue;
      const plan = rules.findTradePath(action, from.storageKey, to.storageKey, record);
      if (!plan.ok) { assert.equal(plan.code, 'NO_TRADE_PATH'); continue; }
      const preview = rules.previewTrades(action, { tradeSteps: plan.steps }, record);
      assert.equal(preview.ok, true);
      assert.equal(preview.changes.find(item => item.storageKey === from.storageKey).after, 1000 - plan.input);
      assert.equal(preview.changes.find(item => item.storageKey === to.storageKey).after, 1000 + plan.output);
      for (const item of preview.changes.filter(item => ![from.storageKey, to.storageKey].includes(item.storageKey))) assert.equal(item.after, 1000);
    }
  }
});

test('ordered steps also settle through town negotiation with one fate charge', () => {
  const key = 'trading solutions';
  const ctx = { dictionary, techKey: key, cycle: 'c1', day: 5, operationId: 'town-plan', actionId: 'trade',
    technology: { unlocked: [key] }, automation: { version: 1, events: {} },
    mapState: { cycles: { c1: { currentTile: 'town', tileVariants: { town: 'alternate' }, tokens: { markers: {} } } } },
    mapTags: { tiles: { 'c1:town': { tags: ['city'], factions: ['minoians'] } } },
    record: { cycle: 'c1', cycleStats: { c1: { fate: '2' } }, resources: { 'c1-monument': 3 } } };
  const action = rules.actionsFor(key, ctx).find(item => item.trade);
  assert.ok(action);
  const plan = rules.findTradePath(action, 'c1-monument', 'c1-armament', ctx.record);
  assert.equal(plan.ok, true); assert.equal(plan.input, 3); assert.equal(plan.output, 2);
  const result = rules.prepareOperation({ ...ctx, actionId: action.id,
    selection: { location: action.choices.find(item => item.id === 'location').options[0].value, tradeSteps: plan.steps } });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.record.resources['c1-monument'], 0);
  assert.equal(result.record.resources['c1-armament'], 2);
  assert.equal(result.record.cycleStats.c1.fate, '3');
});
