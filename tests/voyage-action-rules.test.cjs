const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../technology/structure-tech-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const copy = value => JSON.parse(JSON.stringify(value));
function context(techKey, overrides = {}) {
  const cycle = dictionary.cards.find(card => card.key === techKey)?.nodes[0].page.replace('cycle', 'c') || 'c3';
  const stats = { fate: '5', doom: '2', crew: '3', hull: '3', frozenTime: '2', loopLength: '5', paradox: '2', babelianDebt: '3',
    ...(cycle === 'c2' ? { crewCounters: { crew: 3, refugees: 2, captives: 1 } } : {}) };
  return { dictionary, techKey, cycle, day: 5, operationId: 'one',
    technology: { unlocked: dictionary.cards.map(card => card.key) },
    record: { cycle, cycleStats: { [cycle]: stats }, resources: { priests: 4 }, nymphCharges: '1', nymphLimit: '3',
      nymphCards: ['nymph-a', 'nymph-b'], nymphUsedCards: ['nymph-a'], godforms: ['god-a', 'god-b'], godformUsedCards: ['god-a'], notes: 'preserve' },
    state: { cardTracks: { doom: { position: 1, doom: 4 } }, exploration: {} },
    automation: { version: 1, events: {} }, ...overrides };
}
function run(ctx, actionId, selection = {}) { return rules.prepareOperation({ ...ctx, actionId: `voyage-${actionId}`, selection }); }
function next(ctx, result, overrides = {}) { return { ...ctx, record: result.record, automation: result.automation, state: result.state || ctx.state, ...overrides }; }
function stat(result, type, cycle = result.event.cycleId) { return result.record.cycleStats[cycle][type]; }

test('voyage catalogs expose only the requested technology branches with ordinary grouped choices', () => {
  assert.equal(rules.voyageCatalog.length, 8);
  const excluded = ['anti-indoctrination philosophy', 'awakening studies', 'adyton completion', 'old transportation system',
    'political protection', 'up-stream navigation', 'quantum propylon', 'stasis theory', 'time wounds', 'imperial contact',
    'sandstorm navigation', 'sandstorm sailing', 'kiss of mnemosyne', 'underwater scouting', 'superior submergence'];
  for (const key of excluded) assert.equal(rules.voyageCatalog.some(rule => rule.key === key), false);
  assert.doesNotMatch(JSON.stringify(rules.voyageCatalog), /despair|affliction|苦痛|绝望/i);
  const ctx = context('divine deals');
  const actions = rules.actionsFor(ctx.techKey, ctx);
  assert.equal(actions.length, 3);
  for (const action of actions) {
    assert.ok(action.id.startsWith('voyage-'));
    assert.equal(action.immediate, true);
    assert.equal(action.dueDays, 0);
    for (const field of ['groupKey', 'groupTitle', 'title', 'image', 'costLabel']) assert.ok(action[field], field);
  }
  assert.deepEqual(actions.find(action => action.restore === 'summon').choices[0].options, [{ value: 'nymph-a', label: '宁芙（nymph-a）' }]);
  const dashboard = rules.listActions({ ...ctx, techKey: undefined });
  assert.ok(dashboard.some(action => action.id === 'voyage-divine-charge'));
  assert.equal(rules.listActions({ ...ctx, techKey: undefined, scope: 'negotiation' }).some(action => action.id.startsWith('voyage-')), false);
});

test('spark and both contingency payments apply atomically, clamp fate at zero, and preserve input', () => {
  const ctx = context('spark of the dead gods'), original = copy(ctx);
  const result = run(ctx, 'spark');
  assert.equal(result.ok, true, result.message);
  assert.equal(result.record.resources.priests, 3);
  assert.equal(stat(result, 'fate'), '4');
  assert.equal(result.event.skipTimeline, true);
  assert.equal(result.event.status, 'completed');
  assert.equal(result.record.notes, 'preserve');
  assert.deepEqual(ctx, original);
  const poor = copy(ctx); poor.record.resources.priests = 0;
  assert.equal(run(poor, 'spark').code, 'INSUFFICIENT_RESOURCES');
  for (const payment of ['crew', 'hull']) {
    const local = context('extinction contingency'); local.record.cycleStats.c3.fate = '1';
    const applied = run(local, `contingency-${payment}`);
    assert.equal(applied.ok, true, applied.message);
    assert.equal(stat(applied, payment), '2');
    assert.equal(stat(applied, 'fate'), '0');
    local.record.cycleStats.c3[payment] = '0';
    assert.equal(run(local, `contingency-${payment}`).code, 'INSUFFICIENT_RESOURCES');
  }
});

test('strange alliance pays either full cost and synchronizes doom transactions exactly once', () => {
  for (const route of ['priests', 'fate']) {
    const ctx = context('strange alliance');
    ctx.record.explorationTrackTransactions = [{ id: 'old', cycleId: 'c1', type: 'doom', amount: 2 }];
    const result = run(ctx, `alliance-${route}`);
    assert.equal(result.ok, true, result.message);
    assert.equal(result.record.nymphCharges, '2');
    assert.equal(result.state.cardTracks.doom.doom, route === 'priests' ? 7 : 8);
    assert.equal(result.state.exploration.trackReceiptsByCycle.c1.old, true);
    assert.equal(result.record.resources.priests, route === 'priests' ? 2 : 4);
    assert.equal(stat(result, 'fate'), route === 'fate' ? '7' : '5');
    assert.deepEqual(result.record.nymphUsedCards, ['nymph-a']);
    const duplicate = run(next(ctx, result), `alliance-${route}`);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.record.nymphCharges, '2');
    assert.equal(run(next(ctx, result), route === 'priests' ? 'alliance-fate' : 'alliance-priests').code, 'OPERATION_CONFLICT');
  }
  const capped = context('strange alliance'); capped.record.cycleStats.c1.fate = '11';
  assert.equal(run(capped, 'alliance-fate').code, 'COST_LIMIT');
  const empty = context('strange alliance'); empty.record.resources.priests = 1;
  assert.equal(run(empty, 'alliance-priests').code, 'INSUFFICIENT_RESOURCES');
});

test('recruitment always pays fate, converts only a successful opted-in check, and keeps the combined track consistent', () => {
  const ctx = context('recruitment programs');
  for (const [checkResult, convertRefugee, converted] of [['failure', 'yes', false], ['success', 'no', false], ['success', 'yes', true]]) {
    const result = run(ctx, 'recruitment', { checkResult, convertRefugee });
    assert.equal(result.ok, true, result.message);
    assert.equal(stat(result, 'fate'), '6');
    assert.deepEqual(result.record.cycleStats.c2.crewCounters, { crew: converted ? 4 : 3, refugees: converted ? 1 : 2, captives: 1 });
  }
  assert.equal(run(ctx, 'recruitment', { convertRefugee: 'yes' }).code, 'CHECK_REQUIRED');
  const empty = copy(ctx); empty.record.cycleStats.c2.crewCounters.refugees = 0;
  assert.equal(run(empty, 'recruitment', { checkResult: 'success', convertRefugee: 'yes' }).code, 'INSUFFICIENT_RESOURCES');
  assert.equal(run(empty, 'recruitment', { checkResult: 'failure', convertRefugee: 'yes' }).ok, true);
  const full = copy(ctx); full.record.cycleStats.c2.crewCounters = { crew: 6, refugees: 1, captives: 1 };
  const converted = run(full, 'recruitment', { checkResult: 'success', convertRefugee: 'yes' });
  assert.equal(converted.ok, true, converted.message);
  assert.deepEqual(converted.record.cycleStats.c2.crewCounters, { crew: 7, refugees: 0, captives: 1 });
  const overfull = copy(ctx); overfull.record.cycleStats.c2.crewCounters = { crew: 7, refugees: 1, captives: 1 };
  assert.equal(run(overfull, 'recruitment', { checkResult: 'success', convertRefugee: 'yes' }).code, 'CREW_LIMIT');
});

test('time solutions extend the recorded loop and enforce silo and payment caps without auto-granting abilities', () => {
  const ctx = context('time solutions');
  const result = run(ctx, 'time');
  assert.equal(result.ok, true, result.message);
  assert.equal(stat(result, 'frozenTime'), '1');
  assert.equal(stat(result, 'loopLength'), '6');
  assert.equal(result.record.frozenTimeLimit, undefined);
  for (const route of ['fate', 'paradox']) {
    const advanced = context('advanced time solutions');
    const used = run(advanced, `advanced-time-${route}`);
    assert.equal(used.ok, true, used.message);
    assert.equal(stat(used, 'loopLength'), '6');
    assert.equal(stat(used, route), route === 'fate' ? '7' : '3');
    advanced.record.cycleStats.c3[route] = '12';
    assert.equal(run(advanced, `advanced-time-${route}`).code, 'COST_LIMIT');
  }
  const tooMany = copy(ctx); tooMany.record.cycleStats.c3.frozenTime = '4'; tooMany.technology.unlocked = ['time solutions'];
  assert.equal(run(tooMany, 'time').code, 'FROZEN_TIME_LIMIT');
  tooMany.technology.unlocked.push('advanced time solutions');
  assert.equal(run(tooMany, 'time').ok, true);
  tooMany.record.cycleStats.c3.frozenTime = '6';
  assert.equal(run(tooMany, 'time').code, 'FROZEN_TIME_LIMIT');
  const noTime = copy(ctx); noTime.record.cycleStats.c3.frozenTime = '0';
  assert.equal(run(noTime, 'time').code, 'INSUFFICIENT_RESOURCES');
});

test('chronosail records an immediate manual task, can complete it, and cannot auto-settle it', () => {
  const ctx = context('chronosail'), result = run(ctx, 'chronosail');
  assert.equal(result.ok, true, result.message);
  assert.equal(stat(result, 'fate'), '6');
  assert.equal(result.event.status, 'pending');
  assert.equal(result.event.dueDay, ctx.day);
  assert.equal(result.event.immediate, true);
  assert.match(result.event.rewardLabel, /没有自动结算轮回效果/);
  assert.equal(rules.autoSettleEvent(result.event), false);
  const busy = run(next(ctx, result, { operationId: 'two' }), 'chronosail');
  assert.equal(busy.code, 'ABILITY_BUSY');
  const completed = rules.completeOperation(next(ctx, result));
  assert.equal(completed.ok, true);
  assert.equal(completed.event.status, 'completed');
  assert.equal(stat(completed, 'fate'), '6');
});

test('divine deals restore charge, summon and godform independently and reject stale or full targets', () => {
  const ctx = context('divine deals');
  for (const [kind, selected] of [['charge', undefined], ['summon', 'nymph-a'], ['godform', 'god-a']]) {
    const result = run(ctx, `divine-${kind}`, selected ? { restoreId: selected } : {});
    assert.equal(result.ok, true, result.message);
    assert.equal(stat(result, 'babelianDebt'), '4');
    assert.equal(result.state.cardTracks.doom.doom, 5);
    assert.equal(result.record.nymphCharges, kind === 'charge' ? '2' : '1');
    assert.deepEqual(result.record.nymphUsedCards, kind === 'summon' ? [] : ['nymph-a']);
    assert.deepEqual(result.record.godformUsedCards, kind === 'godform' ? [] : ['god-a']);
  }
  assert.equal(run(ctx, 'divine-summon', { restoreId: 'nymph-b' }).code, 'INVALID_TARGET');
  const full = copy(ctx); full.record.nymphCharges = '3';
  assert.equal(run(full, 'divine-charge').code, 'INVALID_RESTORE');
  assert.equal(rules.actionsFor(full.techKey, full).find(action => action.restore === 'charge').disabled, true);
  const unknown = copy(ctx); unknown.record.nymphLimit = '';
  assert.equal(run(unknown, 'divine-charge').code, 'INVALID_RESTORE');
  const noUsed = copy(ctx); noUsed.record.godformUsedCards = [];
  assert.equal(run(noUsed, 'divine-godform', { restoreId: 'god-a' }).code, 'INVALID_RESTORE');
});

test('recovery options and saved rewards use the exact Chinese names from the record gallery', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const recordSource = fs.readFileSync(require.resolve('../record/index.html'), 'utf8');
  const block = recordSource.match(/const summonCards = (\{[^]*?\n    \});/)[1];
  const cards = vm.runInNewContext(`(${block})`);
  for (const [type, list, owned, used] of [['summon', cards.nymphs, 'nymphCards', 'nymphUsedCards'], ['godform', cards.godforms, 'godforms', 'godformUsedCards']]) {
    const ctx = context('divine deals');
    ctx.record[owned] = Array.from(list, card => card.id); ctx.record[used] = [...ctx.record[owned]];
    const action = rules.actionsFor(ctx.techKey, ctx).find(action => action.restore === type);
    assert.deepEqual(action.choices[0].options, Array.from(list, card => ({ value: card.id, label: card.zh })));
    for (const card of list) {
      const result = run(ctx, `divine-${type}`, { restoreId: card.id });
      assert.equal(result.ok, true, result.message);
      assert.ok(result.event.rewardLabel.includes(card.zh));
      assert.equal(result.event.rewardLabel.includes(`：${card.id}`), false);
    }
  }
  const collision = context('divine deals');
  collision.record.nymphCards = collision.record.nymphUsedCards = ['poseidon'];
  collision.record.godforms = collision.record.godformUsedCards = ['poseidon'];
  const actions = rules.actionsFor(collision.techKey, collision);
  assert.equal(actions.find(action => action.restore === 'godform').choices[0].options[0].label, '波塞冬');
  assert.equal(actions.find(action => action.restore === 'summon').choices[0].options[0].label, '宁芙（poseidon）');
});

function panelDocument() {
  class Element {
    constructor(tagName) { this.tagName = tagName; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ''; this.checked = false; }
    get textContent() { return this.children.map(child => child.textContent || '').join(''); }
    set textContent(value) { this.children = [{ textContent: String(value ?? '') }]; }
    setAttribute() {}
    appendChild(node) { this.children.push(node); return node; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
  }
  return { createElement: name => new Element(name), createTextNode: text => ({ textContent: text }) };
}
function findElement(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) { const result = findElement(child, predicate); if (result) return result; }
}
function panelControl(panel, name) { return findElement(panel, node => node.name === name); }
function choose(node, value) { node.value = value; node.listeners.change(); }
function panelFixture(techKey) {
  let current = { ...context(techKey), profileId: 'test', cycleId: context(techKey).cycle, campaign: {} };
  const submissions = [];
  const client = { load: async () => current, submit: async target => {
    const result = rules.prepareOperation({ ...current, ...target });
    if (!result.ok) throw Object.assign(new Error(result.message), { code: result.code });
    submissions.push(result);
    current = { ...current, record: result.record, automation: result.automation, state: result.state || current.state };
    return result;
  } };
  return { client, submissions, current: () => current };
}

test('the shared panel collects recruitment success/failure and optional conversion before submitting the real rule', async () => {
  const originalDocument = global.document; global.document = panelDocument();
  const { createActionPanel } = require('../technology/structure-tech-client.js');
  try {
    for (const [checkResult, convertRefugee, converted] of [['failure', 'yes', false], ['success', 'yes', true], ['success', 'no', false]]) {
      const f = panelFixture('recruitment programs');
      const panel = createActionPanel({ client: f.client, rules, profileId: 'test', cycleId: 'c2', techKey: 'recruitment programs' });
      await panel.ready;
      const use = findElement(panel, node => node.className === 'structure-tech-action-use');
      assert.equal(use.textContent, '使用科技能力');
      assert.equal(use.disabled, true);
      choose(panelControl(panel, 'checkResult'), checkResult);
      assert.equal(use.disabled, true);
      choose(panelControl(panel, 'convertRefugee'), convertRefugee);
      assert.equal(use.disabled, false);
      assert.match(findElement(panel, node => node.className === 'structure-tech-action-preview').textContent, checkResult === 'failure' ? /失败.*本次未转换难民/ : converted ? /1 难民已转为 1 船员/ : /本次未转换难民/);
      await use.listeners.click();
      assert.equal(f.submissions.length, 1);
      assert.equal(f.current().record.cycleStats.c2.fate, '6');
      assert.deepEqual(f.current().record.cycleStats.c2.crewCounters, { crew: converted ? 4 : 3, refugees: converted ? 1 : 2, captives: 1 });
      assert.equal(findElement(panel, node => node.className === 'structure-tech-action-status').textContent, '科技能力已结算并保存');
    }
  } finally { global.document = originalDocument; }
});

test('the shared panel switches all recovery branches, renders Chinese target names and saves the selected effect', async () => {
  const originalDocument = global.document; global.document = panelDocument();
  const { createActionPanel } = require('../technology/structure-tech-client.js');
  try {
    for (const [type, selected, name] of [['charge', null, null], ['summon', 'depths', '深海宁芙'], ['godform', 'zeus', '宙斯']]) {
      const f = panelFixture('divine deals'), current = f.current();
      current.record.nymphCards = current.record.nymphUsedCards = ['depths'];
      current.record.godforms = current.record.godformUsedCards = ['zeus'];
      const panel = createActionPanel({ client: f.client, rules, profileId: 'test', cycleId: 'c4', techKey: 'divine deals' });
      await panel.ready;
      choose(panelControl(panel, 'actionMode'), `voyage-divine-${type}`);
      const use = findElement(panel, node => node.className === 'structure-tech-action-use');
      if (selected) {
        const target = panelControl(panel, 'restoreId');
        assert.equal(use.disabled, true);
        assert.equal(target.children.find(option => option.value === selected).textContent, name);
        choose(target, selected);
        assert.ok(findElement(panel, node => node.className === 'structure-tech-action-preview').textContent.includes(name));
      }
      assert.equal(use.disabled, false);
      await use.listeners.click();
      assert.equal(f.submissions.length, 1);
      assert.equal(f.current().record.nymphCharges, type === 'charge' ? '2' : '1');
      assert.deepEqual(f.current().record.nymphUsedCards, type === 'summon' ? [] : ['depths']);
      assert.deepEqual(f.current().record.godformUsedCards, type === 'godform' ? [] : ['zeus']);
      if (name) assert.ok(f.submissions[0].event.rewardLabel.includes(name));
    }
  } finally { global.document = originalDocument; }
});

test('locked, disabled, out-of-cycle and malformed submissions never spend any costs', () => {
  const ctx = context('recruitment programs'), selection = { checkResult: 'success', convertRefugee: 'yes' };
  for (const [changes, code] of [
    [{ technology: { unlocked: [] } }, 'LOCKED_TECH'],
    [{ cycle: 'c3' }, 'CYCLE_SCOPE'],
    [{ day: 'bad' }, 'INVALID_DAY'],
  ]) assert.equal(run({ ...ctx, ...changes }, 'recruitment', selection).code, code);
  const invalid = copy(ctx); invalid.record.cycleStats.c2.fate = 'bad';
  assert.equal(run(invalid, 'recruitment', selection).code, 'UNKNOWN_STAT');
  const broken = copy(ctx); broken.record.cycleStats.c2.crewCounters.captives = 'bad';
  assert.equal(run(broken, 'recruitment', selection).code, 'UNKNOWN_STAT');
  const disabled = copy(ctx); disabled.record.explorationDelays = { disabledTechs: { c2: { 'recruitment programs': {} } } };
  assert.equal(run(disabled, 'recruitment', selection).code, 'DISABLED_TECH');
});

test('the last wish adds only unlimited development trades after story 2A and no other abilities', () => {
  const ctx = context('the last wish'), actions = rules.actionsFor(ctx.techKey, ctx), action = actions[0];
  assert.equal(actions.length, 1);
  assert.equal(action.maxTrades, null);
  assert.equal(action.tradeRoutes.length, 4);
  for (const route of action.tradeRoutes) {
    const local = copy(ctx);
    for (const entry of [...route.costs, ...route.gains]) local.record.resources[entry.storageKey] = 50;
    const selection = { story2aConfirmed: true, trades: [{ routeId: route.id, count: 20 }] };
    const result = rules.prepareOperation({ ...local, actionId: 'trade', selection });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.record.resources[route.costs[0].storageKey], 30);
    assert.equal(result.record.resources[route.gains[0].storageKey], 70);
    assert.equal(stat(result, 'fate'), '5');
    assert.equal(result.event.skipTimeline, true);
    assert.equal(action.confirmations.some(item => item.id === 'developmentConfirmed'), false);
    assert.equal(rules.prepareOperation({ ...local, actionId: 'trade', selection: { ...selection, story2aConfirmed: false } }).code, 'CONFIRM_CONDITION');
    local.record.resources[route.costs[0].storageKey] = 19;
    assert.equal(rules.prepareOperation({ ...local, actionId: 'trade', selection }).code, 'INSUFFICIENT_RESOURCES');
  }
});
