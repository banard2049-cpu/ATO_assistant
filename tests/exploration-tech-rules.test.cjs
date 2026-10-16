const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const rules = require('../technology/exploration-tech-rules.js');
const pursuit = require('../assets/exploration-pursuit.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const copy = value => JSON.parse(JSON.stringify(value));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/exploration-card-resources.js'), 'utf8'), sandbox);
const dataset = sandbox.window.ATO_EXPLORATION_CARD_RESOURCES;
const helpers = {
  dayOf: ctx => Number(ctx.day),
  dictionaryCards: (_ctx, key) => dictionary.cards.filter(card => card.key === key),
  titleFor: card => card.names.zh || card.names.en,
  eligibility(ctx, key) {
    const card = dictionary.cards.find(card => card.key === key);
    return !ctx.technology.unlocked.includes(key) ? { ok: false, code: 'LOCKED_TECH', message: '未解锁' }
      : { ok: true, card };
  },
};
function entry(id, drawnAt = `draw-${id}`) { return { id, name: id, day: 8, drawnAt, pile: 0, removal: 'remove', draw: 'chain' }; }
function context(key, cycle = 'c4', cards = []) {
  return { cycle, day: 8, techKey: key, operationId: 'one', explorationDataset: dataset,
    technology: { unlocked: rules.catalog.map(item => item.key) },
    record: { cycle, fate: '3', babelianDebt: '4', notes: '保留原备注', cycleStats: { [cycle]: { fate: '3', babelianDebt: '4' } },
      resources: { 'c2-violentAmbrosia': 16, 'c5-atlanteanTekne': 10 } }, automation: { version: 1, events: {} },
    state: { exploration: { selectedByCycle: { [cycle]: [...cards.map(card => card.id), '9300', '9346'] },
      drawStateByCycle: { [cycle]: { drawPile: ['9300', '9346'], activePiles: [copy(cards), []], temporaryRemoved: [],
        discardPile: [], history: copy(cards), current: cards.length ? copy(cards.at(-1)) : null, pursuitRoundId: `round-${cycle}` } },
      settledByCycle: {}, effectStateByCycle: {}, tokenPlacementQueueByCycle: {} } } };
}
function prepare(ctx, actionId, selection = {}) {
  const before = copy(ctx);
  const result = rules.prepareOperation({ ...ctx, actionId, selection }, helpers,
    { record: copy(ctx.record), automation: copy(ctx.automation), shape: { actionId, selection } });
  assert.deepEqual(copy(ctx), before, 'preparation never mutates the caller');
  return result;
}
function next(ctx, result, changes = {}) { return { ...ctx, record: result.record, state: result.state || ctx.state, automation: result.automation, ...changes }; }

test('reactive abilities appear only in the exploration scope or their own card and require an actual drawn target', () => {
  const ctx = context('ambrosia spill solution', 'c2', [entry('13635')]);
  assert.equal(rules.listActions({ ...ctx, techKey: undefined, scope: 'voyage' }, helpers).some(action => action.actionId === 'tech-explore-spill'), false);
  const actual = rules.listActions({ ...ctx, techKey: undefined, scope: 'exploration' }, helpers);
  assert.deepEqual(actual.map(action => action.actionId), ['tech-explore-spill']);
  assert.equal(actual[0].choices[0].defaultValue, 'c2:13635:draw-13635');
  assert.ok(actual[0].immediate);
  assert.equal(rules.listActions(context('ambrosia spill solution', 'c2'), helpers)[0].available, false);
  assert.equal(rules.listActions({ ...ctx, cycle: 'c4' }, helpers).length, 0);
  const locked = { ...ctx, technology: { unlocked: [] } };
  assert.equal(prepare(locked, 'tech-explore-spill', { entryRoundId: 'c2:13635:draw-13635' }).code, 'LOCKED_TECH');
});

for (const id of ['13635', '13636']) test(`spill replacement ${id} atomically pays, grants and suppresses only the actual card round`, () => {
  const chosen = entry(id), other = entry('13637'), ctx = context('ambrosia spill solution', 'c2', [chosen, other]);
  const round = rules.roundId(ctx, chosen);
  ctx.state.exploration.tokenPlacementQueueByCycle.c2 = { target: { entry: chosen }, other: { entry: other } };
  const result = prepare(ctx, 'tech-explore-spill', { entryRoundId: round });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.record.fate, '4');
  assert.equal(result.record.resources['c2-violentAmbrosia'], 19);
  assert.equal(result.record.notes, '保留原备注');
  assert.ok(result.record.explorationBatchReceipts[round].technologyIgnored);
  const active = result.state.exploration.drawStateByCycle.c2.activePiles[0];
  assert.ok(active[0].technologyIgnored);
  assert.equal(active[0].removal, 'keep');
  assert.equal(active[1].technologyIgnored, undefined);
  assert.deepEqual(Object.keys(result.state.exploration.tokenPlacementQueueByCycle.c2), ['other']);
  assert.equal(result.state.exploration.drawStateByCycle.c2.history[0].technologyIgnored.operationId, 'one');
  assert.equal(prepare(next(ctx, result, { operationId: 'two' }), 'tech-explore-spill', { entryRoundId: round }).ok, false);
  const later = context('ambrosia spill solution', 'c2', [entry(id, 'later-round')]);
  later.record = result.record;
  assert.equal(prepare(later, 'tech-explore-spill', { entryRoundId: `c2:${id}:later-round` }).ok, true, 'same card on a later draw may be used again');
});

test('stale targets, partial settlement, pursuit receipts and fate caps prevent replacement without payment', () => {
  const target = entry('13635'), ctx = context('ambrosia spill solution', 'c2', [target]), round = rules.roundId(ctx, target);
  assert.equal(prepare(ctx, 'tech-explore-spill', { entryRoundId: 'c2:13635:old-round' }).code, 'EXPLORATION_CHANGED');
  for (const marked of [
    local => { local.record.explorationBatchReceipts = { [round]: { applied: { x: {} } } }; },
    local => { local.record.explorationBatchReceipts = { [round]: { resource: {} } }; },
    local => { local.state.exploration.effectStateByCycle.c2 = { 'c2:13635:8': { manual: { x: true } } }; },
    local => { local.state.exploration.effectStateByCycle.c2 = { 'c2:13635:8': { delays: { x: 'delay' } } }; },
    local => { local.record.technologyActionReceipts = { 'round-c2': {} }; },
  ]) {
    const current = copy(ctx); marked(current);
    assert.equal(prepare(current, 'tech-explore-spill', { entryRoundId: round }).ok, false);
  }
  ctx.record.cycleStats.c2.fate = '12';
  assert.equal(prepare(ctx, 'tech-explore-spill', { entryRoundId: round }).code, 'COST_LIMIT');
});

test('Odyssey requires a paid ignore before registering its separately confirmed direction benefit', () => {
  const target = entry('9346'), ctx = context('odyssey training', 'c4', [target]), round = rules.roundId(ctx, target);
  ctx.record.fate = ctx.record.cycleStats.c4.fate = '8';
  assert.equal(pursuit.countMarkers(ctx).total, 1);
  const ignored = prepare(ctx, 'tech-explore-odyssey-ignore', { entryRoundId: round });
  assert.equal(ignored.record.fate, '9');
  assert.equal(pursuit.countMarkers(next(ctx, ignored)).total, 0);
  const staleDashboard = next(ctx, ignored, { state: ctx.state });
  assert.equal(pursuit.countMarkers(staleDashboard).total, 0, 'server ledger also suppresses stale local flags');
  const followed = prepare(next(ctx, ignored, { operationId: 'follow' }), 'tech-explore-odyssey-follow', { entryRoundId: round });
  assert.equal(followed.ok, true, followed.message);
  assert.equal(followed.event.status, 'pending');
  const core = require('../technology/structure-tech-rules.js');
  assert.equal(core.completeOperation({ ...next(ctx, followed), operationId: followed.event.id,
    day: ctx.day - 1, selection: { followedDirection: true } }).code, 'NOT_DUE');
  assert.equal(followed.record.babelianDebt, '4', 'registering a future direction does not claim the benefit');
  assert.deepEqual(followed.event.completionConfirmations.map(item => item.id), ['followedDirection']);
  assert.equal(prepare(next(ctx, followed, { operationId: 'follow-again' }), 'tech-explore-odyssey-follow', { entryRoundId: round }).ok, false);
  const complete = selection => rules.completeOperation({ ...next(ctx, followed), selection }, helpers, {
    record: copy(followed.record), automation: copy(followed.automation), event: copy(followed.event), receipt: copy(followed.receipt),
  });
  assert.equal(complete({}).code, 'CONFIRM_DIRECTION');
  const confirmed = complete({ followedDirection: true });
  assert.equal(confirmed.record.babelianDebt, '3');
  assert.equal(confirmed.event.status, 'completed');
});

test('Odyssey follow targets and preparation require this exact card round to have a paid ignore receipt', () => {
  const target = entry('9346'), ctx = context('odyssey training', 'c4', [target]), round = rules.roundId(ctx, target);
  const before = copy(ctx);
  const direct = prepare(ctx, 'tech-explore-odyssey-follow', { entryRoundId: round });
  assert.equal(direct.ok, false);
  assert.match(direct.message, /先支付命运/);
  const unavailable = rules.listActions(ctx, helpers).find(action => action.mode === 'follow');
  assert.equal(unavailable.disabled, true);
  assert.deepEqual(unavailable.choices[0].options, []);
  assert.match(unavailable.reason, /先支付命运/);
  assert.equal(rules.listActions({ ...ctx, techKey: undefined, scope: 'exploration' }, helpers).some(action => action.mode === 'follow'), false);
  assert.deepEqual(copy(ctx), before);
  const ignored = prepare(ctx, 'tech-explore-odyssey-ignore', { entryRoundId: round });
  const paid = next(ctx, ignored, { operationId: 'follow' });
  assert.equal(rules.listActions(paid, helpers).find(action => action.mode === 'follow').available, true);
  for (const corrupt of [
    local => { delete local.record.technologyActionReceipts.one; },
    local => { local.record.technologyActionReceipts.one.payment = []; },
    local => { local.record.technologyActionReceipts.one.actionId = 'tech-explore-spill'; },
    local => { local.record.technologyActionReceipts.one.request.selection.entryRoundId = 'c4:9346:another-round'; },
    local => { local.record.technologyActionReceipts.one.cycleId = 'c2'; },
  ]) {
    const invalid = copy(paid); corrupt(invalid);
    assert.equal(prepare(invalid, 'tech-explore-odyssey-follow', { entryRoundId: round }).ok, false);
  }
  // A valid source for one target cannot authorize a different target in the same UI.
  paid.state.exploration.drawStateByCycle.c4.activePiles[0].push(entry('9346', 'another-round'));
  const options = rules.listActions(paid, helpers).find(action => action.mode === 'follow').choices[0].options;
  assert.deepEqual(options.map(option => option.value), [round]);
  const wrongTarget = prepare(paid, 'tech-explore-odyssey-follow', { entryRoundId: 'c4:9346:another-round' });
  assert.equal(wrongTarget.code, 'ODYSSEY_IGNORE_REQUIRED');
});

test('Odyssey completes legal and legacy paid follow tasks after exploration ends, but rejects unpaid or mismatched legacy tasks', () => {
  const core = require('../technology/structure-tech-rules.js');
  const target = entry('9346'), ctx = context('odyssey training', 'c4', [target]), round = rules.roundId(ctx, target);
  const ignored = prepare(ctx, 'tech-explore-odyssey-ignore', { entryRoundId: round });
  const followed = prepare(next(ctx, ignored, { operationId: 'follow' }), 'tech-explore-odyssey-follow', { entryRoundId: round });
  assert.equal(followed.ok, true, followed.message);
  const ended = next(ctx, followed, { operationId: 'follow', day: 9, selection: { followedDirection: true } });
  const draw = ended.state.exploration.drawStateByCycle.c4;
  draw.activePiles = [[], []]; draw.history = []; draw.current = null;
  ended.state.exploration.effectStateByCycle.c4 = {};
  const complete = local => core.completeOperation(local);
  const legal = complete(ended);
  assert.equal(legal.ok, true, legal.message);
  assert.equal(legal.record.babelianDebt, '3');
  assert.equal(legal.record.fate, '4', 'completion does not pay fate a second time');
  assert.equal(complete({ ...ended, record: legal.record, automation: legal.automation }).duplicate, true);
  const legacy = copy(ended);
  delete legacy.automation.events.follow.explorationTechFollow.ignoreOperationId;
  const compatible = complete(legacy);
  assert.equal(compatible.ok, true, compatible.message);
  assert.equal(compatible.record.babelianDebt, '3');
  for (const corrupt of [
    local => { delete local.record.explorationBatchReceipts[round]; },
    local => { delete local.record.technologyActionReceipts.one; },
    local => { local.record.technologyActionReceipts.one.payment = []; },
    local => { local.record.technologyActionReceipts.one.request.selection.entryRoundId = 'c4:9346:another-round'; },
    local => { local.automation.events.follow.explorationTechFollow.roundId = 'c4:9346:another-round'; },
    local => { local.automation.events.follow.selection.entryRoundId = 'c4:9346:another-round'; },
    local => { local.automation.events.follow.explorationTechFollow.ignoreOperationId = 'unrelated-operation'; },
  ]) {
    const invalid = copy(legacy); corrupt(invalid);
    const result = complete(invalid);
    assert.equal(result.code, 'ODYSSEY_IGNORE_REQUIRED');
    assert.equal(invalid.record.babelianDebt, '4', 'invalid task never reduces debt');
  }
});

test('salvage gives exactly one qualifying card to the ordinary exploration flow without pursuit or chain draws', () => {
  const ctx = context('salvage operations'), draw = ctx.state.exploration.drawStateByCycle.c4;
  ctx.explorationTags = { cards: { 'c4:9300': { removal: 'remove', draw: 'chain' } } };
  const result = prepare(ctx, 'tech-explore-salvage');
  assert.equal(result.ok, true, result.message);
  assert.equal(result.record.fate, '4');
  const saved = result.state.exploration.drawStateByCycle.c4;
  assert.deepEqual(saved.drawPile, ['9346']);
  assert.equal(saved.activePiles.flat().length, 1);
  const card = saved.activePiles[0][0];
  assert.equal(card.id, '9300');
  assert.equal(card.removal, 'remove');
  assert.equal(card.draw, 'single');
  assert.equal(card.salvageId, 'one');
  assert.equal(result.record.resources['c4-babylonianContraption'], undefined, 'the existing settlement owns the entire card');
  assert.equal(pursuit.countMarkers(next(ctx, result)).total, 0);
  assert.equal(pursuit.roundId(next(ctx, result)), '');
  assert.equal(prepare(next(ctx, result, { operationId: 'two' }), 'tech-explore-salvage').ok, false);
  assert.deepEqual(draw.activePiles, [[], []]);
});

test('nonqualifying salvage returns the single card to the bottom, while pending merchant choices or missing data refuse the whole operation', () => {
  const ctx = context('salvage operations');
  ctx.state.exploration.drawStateByCycle.c4.drawPile = ['9346', '9300'];
  const discarded = prepare(ctx, 'tech-explore-salvage');
  assert.equal(discarded.ok, true);
  assert.deepEqual(discarded.state.exploration.drawStateByCycle.c4.drawPile, ['9300', '9346']);
  assert.deepEqual(discarded.state.exploration.drawStateByCycle.c4.activePiles, [[], []]);
  assert.equal(discarded.event.gains[0].qualified, false);
  ctx.automation.events.merchant = { cycleId: 'c4', status: 'pending', negotiationDraw: { cards: ['9313', '9319'] } };
  assert.equal(prepare(ctx, 'tech-explore-salvage').ok, false);
  delete ctx.automation.events.merchant;
  assert.equal(prepare({ ...ctx, explorationDataset: { cards: {} } }, 'tech-explore-salvage').code, 'CARD_DATA_REQUIRED');
});

test('salvage preview checks the cost without reading or revealing the top card', () => {
  const core = require('../technology/structure-tech-rules.js');
  const ctx = context('salvage operations');
  ctx.dictionary = dictionary;
  ctx.actionId = 'tech-explore-salvage';
  ctx.state.exploration.drawStateByCycle.c4.drawPile = new Proxy(['secret-card'], {
    get(target, key) { if (key === '0') throw new Error('preview read the hidden top card'); return Reflect.get(target, key); },
  });
  const result = core.previewOperation(ctx);
  assert.equal(result.ok, true, result.message);
  assert.doesNotMatch(JSON.stringify(result), /secret-card|6410|铁匠铺/);
  assert.equal(ctx.record.fate, '3');
  assert.equal(rules.listActions(ctx, helpers).find(action => action.id === 'tech-explore-salvage').hiddenOutcome, true);
});

test('blind salvage preview and submission agree at the current fate limit', () => {
  const core = require('../technology/structure-tech-rules.js');
  const ctx = { ...context('salvage operations'), dictionary, actionId: 'tech-explore-salvage' };
  ctx.record.fate = ctx.record.cycleStats.c4.fate = '9';
  assert.equal(core.previewOperation(ctx).code, 'COST_LIMIT');
  assert.equal(core.prepareOperation(ctx).code, 'COST_LIMIT');
  ctx.record.fate = ctx.record.cycleStats.c4.fate = '8';
  assert.equal(core.previewOperation(ctx).ok, true);
  assert.equal(core.prepareOperation(ctx).ok, true);
});

test('conditional salvage resolves the actual diplomacy before admitting an entire card', () => {
  for (const [id, faction] of [['9342', 'cloudThieves'], ['9343', 'aristotelians']]) {
    for (const [value, qualified] of [['0', false], ['-9', false], ['4', true]]) {
      const ctx = context('salvage operations');
      ctx.record.diplomacy = { [`c4-${faction}`]: value };
      ctx.state.exploration.drawStateByCycle.c4.drawPile = [id, '9300'];
      const result = prepare(ctx, 'tech-explore-salvage');
      assert.equal(result.ok, true, result.message);
      assert.equal(result.event.gains[0].qualified, qualified, `${id}/${value}`);
      assert.equal(result.state.exploration.drawStateByCycle.c4.activePiles.flat().length, qualified ? 1 : 0);
    }
  }
});

test('second-cycle salvage recognizes the full allied diplomacy track through fifteen', () => {
  const ctx = context('salvage operations', 'c2');
  ctx.record.diplomacy = { 'c2-helots': '15' };
  const card = { diplomacyFaction: 'helots', grants: [{ amount: 1,
    condition: { type: 'diplomacy', mode: 'atLeast', bonus: 2 } }] };
  assert.equal(rules.qualifies(card, 'c2', 'test', rules.qualificationContext(ctx, card)), true);
});

test('unknown salvage conditions hold the revealed card until a separate confirmation without charging again', () => {
  const ctx = context('salvage operations');
  ctx.state.exploration.drawStateByCycle.c4.drawPile = ['9342', '9300'];
  const result = prepare(ctx, 'tech-explore-salvage');
  assert.equal(result.ok, true, result.message);
  const pending = result.state.exploration.drawStateByCycle.c4.activePiles[0][0];
  assert.equal(pending.salvageQualificationPending, true);
  const follow = next(ctx, result, { operationId: 'resolve' });
  const selection = { entryRoundId: rules.roundId(follow, pending), qualificationResult: 'none', qualificationConfirmed: true };
  const resolved = prepare(follow, 'tech-explore-salvage-resolve', selection);
  assert.equal(resolved.ok, true, resolved.message);
  assert.equal(resolved.record.fate, '4');
  assert.deepEqual(resolved.state.exploration.drawStateByCycle.c4.activePiles, [[], []]);
  assert.deepEqual(resolved.state.exploration.drawStateByCycle.c4.drawPile, ['9300', '9342']);
});

test('Argo Initiative preserves hand-selected cards, charges eight instruments and prevents every duplicate location', () => {
  const ctx = context('argo initiative', 'c5');
  ctx.state.exploration.selectedByCycle.c5 = ['10300', '10345'];
  ctx.state.exploration.drawStateByCycle.c5.drawPile = ['10345', '10300'];
  const result = prepare(ctx, 'tech-explore-argo');
  assert.equal(result.ok, true, result.message);
  assert.equal(result.record.resources['c5-atlanteanTekne'], 2);
  assert.deepEqual(result.state.exploration.selectedByCycle.c5, ['10300', '10345', '10308']);
  assert.deepEqual(result.state.exploration.drawStateByCycle.c5.drawPile, ['10345', '10300', '10308']);
  assert.equal(prepare(next(ctx, result, { operationId: 'again' }), 'tech-explore-argo').ok, false);
  for (const field of ['drawPile', 'temporaryRemoved', 'permanentRemoved', 'discardPile', 'activePiles']) {
    const blocked = copy(ctx), draw = blocked.state.exploration.drawStateByCycle.c5;
    draw[field] = field === 'activePiles' ? [[entry('10308')], []] : field === 'drawPile' ? ['10308'] : [entry('10308')];
    assert.equal(prepare(blocked, 'tech-explore-argo').ok, false, field);
  }
  const short = copy(ctx); short.record.resources['c5-atlanteanTekne'] = 7;
  assert.equal(prepare(short, 'tech-explore-argo').code, 'INSUFFICIENT_RESOURCES');
});

test('the real dashboard suppresses ignored-card buttons, automatic effects, pending work and stale ledger writes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const ignored = { operationId: 'paid', summary: '已经支付科技代价' };
  const target = entry('9346'), round = 'c4:9346:draw-9346';
  const ctx = vm.createContext({ state: { exploration: { drawStateByCycle: { c4: { activePiles: [[target], []] } } } },
    cachedArgoRecord: { explorationBatchReceipts: { [round]: { version: 1, applied: {}, delays: {}, technologyIgnored: ignored } } },
    currentCycleConfig: () => ({ id: 'c4' }), isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value),
    explorationResourceRules: () => ({}), explorationEffectRules: () => ({}), document: { createElement: () => ({}) },
  });
  for (const name of ['explorationRoundId', 'explorationBatchReceipt', 'applyAutomaticExploration', 'pendingExplorationEffects',
    'pendingExplorationTokenReminders', 'createExplorationSettleBlock']) {
    const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
    assert.ok(match, name); vm.runInContext(match[0], ctx);
  }
  assert.equal(ctx.applyAutomaticExploration(ctx.cachedArgoRecord, [target]).completed.length, 0);
  assert.equal(ctx.pendingExplorationEffects().length, 0);
  assert.equal(ctx.pendingExplorationTokenReminders().length, 0);
  assert.match(ctx.createExplorationSettleBlock(target).textContent, /已使用科技忽略本卡/);
  assert.throws(() => ctx.explorationBatchReceipt(ctx.cachedArgoRecord, target), /不能再次结算/);
  delete ctx.cachedArgoRecord.explorationBatchReceipts[round];
  target.salvageQualificationPending = true;
  assert.equal(ctx.applyAutomaticExploration(ctx.cachedArgoRecord, [target]).completed.length, 0);
  assert.equal(ctx.pendingExplorationEffects().length, 1);
  assert.equal(ctx.pendingExplorationTokenReminders().length, 0);
  assert.match(ctx.createExplorationSettleBlock(target).textContent, /奖励条件尚未确认/);
  assert.throws(() => ctx.explorationBatchReceipt(ctx.cachedArgoRecord, target), /先确认/);
});
