const assert = require('node:assert/strict');
const test = require('node:test');
const { create } = require('../technology/structure-tech-client.js');

const clone = value => JSON.parse(JSON.stringify(value));
const response = (status, payload) => ({ status, ok: status >= 200 && status < 300, json: async () => clone(payload) });
function session() {
  let accountId = '', changed = false;
  return { get accountId() { return accountId; }, get changed() { return changed; },
    assertCurrent() { if (changed) throw Object.assign(new Error('changed account'), { code: 'ACCOUNT_MISMATCH' }); },
    accept(payload) {
      if (payload?.code === 'ACCOUNT_MISMATCH' || (payload?.user?.id && accountId && payload.user.id !== accountId)) changed = true;
      this.assertCurrent();
      accountId ||= payload?.user?.id || '';
      return payload;
    } };
}
const rules = {
  prepareOperation(ctx) {
    if (!ctx.technology.unlocked?.includes(ctx.techKey)) return { ok: false, code: 'LOCKED', message: '科技未解锁' };
    if (Number(ctx.record.resources?.ore || 0) < 2) return { ok: false, code: 'INSUFFICIENT_RESOURCES', message: '资源不足' };
    const record = clone(ctx.record), automation = clone(ctx.automation);
    record.resources.ore -= 2;
    const operation = { id: ctx.operationId, techKey: ctx.techKey, actionId: ctx.actionId, cycleId: ctx.cycle,
      dueDay: Number(ctx.day) + 3, status: 'pending', kind: 'reward', payment: [{ storageKey: 'ore', amount: 2 }] };
    record.technologyActionReceipts ||= {};
    record.technologyActionReceipts[ctx.operationId] = clone(operation);
    automation.events[ctx.operationId] = operation;
    return { ok: true, operation, record, automation, receipt: record.technologyActionReceipts[ctx.operationId] };
  },
  completeOperation(ctx) {
    const record = clone(ctx.record), automation = clone(ctx.automation);
    const operation = automation.events[ctx.operationId];
    if (!operation || Number(ctx.day) < operation.dueDay) return { ok: false, code: 'NOT_DUE', message: '尚未到期' };
    operation.status = 'completed';
    record.technologyActionReceipts[ctx.operationId].status = 'completed';
    return { ok: true, operation, record, automation, receipt: record.technologyActionReceipts[ctx.operationId] };
  },
  listActions() { return []; },
};
function fixture(options = {}) {
  const state = { campaign: { sections: {
    dashboard: { activeProfileId: 'other', profiles: {
      chosen: { cycles: { c2: { state: { day: 4, notes: 'keep', techAutomation: { version: 1, events: {} } } } } },
      other: { cycles: { c2: { state: { day: 99 } } } },
    } },
    technology: { users: { chosen: { unlocked: ['laboratory'] }, other: { unlocked: [] } } },
    record: { users: { chosen: { resources: { ore: 8 } }, other: { resources: { ore: 77 } } } },
    map: { users: { chosen: { activeCycleId: 'c2', cycles: { c2: { tokens: { hsCount: 0, markers: {} }, tileNotes: {} } } },
      other: { activeCycleId: 'c2', cycles: { c2: { tokens: { hsCount: 1, markers: { OTHER: { hs: true } } } } } } } },
  }, sectionRevisions: { dashboard: 0, record: 0, technology: 0, heroes: 0, map: 0 }, updatedAt: null },
  posts: [], reads: 0, dictionaries: 0, accountId: 'alice' };
  const transport = async (url, init = {}) => {
    if (String(url).includes('dictionary')) { state.dictionaries++; return response(200, options.dictionary || {}); }
    if (init.method !== 'POST') { state.reads++; return response(200, { ok: true, user: { id: state.accountId }, campaign: state.campaign }); }
    const payload = JSON.parse(init.body);
    state.posts.push(payload);
    await options.beforePost?.(state, payload);
    if (options.failBeforeWrite) throw new Error('offline');
    if (payload.expectedAccountId !== state.accountId) return response(409, { ok: false, code: 'ACCOUNT_MISMATCH' });
    if (Object.entries(payload.expectedRevisions).some(([key, value]) => value !== state.campaign.sectionRevisions[key])) {
      return response(409, { ok: false, code: 'SAVE_CONFLICT' });
    }
    state.campaign.sections.dashboard = payload.sections.dashboard;
    state.campaign.sections.record.users[payload.userId] = payload.sections.record;
    if (payload.sections.map) state.campaign.sections.map.users[payload.userId] = payload.sections.map;
    const applied = {};
    for (const key of Object.keys(payload.sections)) applied[key] = ++state.campaign.sectionRevisions[key];
    if (options.loseResponse) throw new Error('lost response after commit');
    if (options.malformedResponse) return response(200, null);
    return response(200, { ok: true, sections: applied, user: { id: state.accountId } });
  };
  const accountSession = session();
  const client = create({ session: accountSession, expectedAccountId: 'alice', fetch: transport,
    rules: options.rules || rules, apiUrl: '/campaign', dictionaryUrl: '/dictionary' });
  const target = { profileId: 'chosen', cycleId: 'c2', techKey: 'laboratory', actionId: 'study', operationId: 'one' };
  return { state, client, target, accountSession };
}

test('atomic submission guards written and read-only revisions and preserves explicit profile plus other records', async () => {
  const f = fixture();
  const result = await f.client.submit(f.target);
  assert.equal(result.operation.id, 'one');
  assert.equal(f.state.posts.length, 1);
  assert.deepEqual(f.state.posts[0].expectedRevisions, { dashboard: 0, record: 0, technology: 0, heroes: 0 });
  assert.equal(f.state.posts[0].userId, 'chosen');
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 6);
  assert.equal(f.state.campaign.sections.record.users.other.resources.ore, 77);
  assert.match(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.notes, /^keep\n\[.*C2 第4天 · 结构科技\].*laboratory · study.*D7/);
  assert.equal(f.state.campaign.sections.dashboard.profiles.other.cycles.c2.state.day, 99);
  assert.equal(f.state.campaign.sectionRevisions.technology, 0);
  await f.client.submit(f.target);
  assert.equal(f.state.posts.length, 1, 'the persisted receipt resolves a repeated request');
  assert.equal(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.notes.split('\n').length, 2, 'one use log only');
  assert.equal(f.state.dictionaries, 1);
});

test('record conflicts rebase the charge onto the newest balance', async () => {
  let once = false;
  const f = fixture({ beforePost(state) {
    if (once) return; once = true;
    state.campaign.sections.record.users.chosen.resources.ore += 5;
    state.campaign.sectionRevisions.record++;
  } });
  await f.client.submit(f.target);
  assert.equal(f.state.posts.length, 2);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 11);
});

test('concurrent submissions of one operation settle once', async () => {
  const f = fixture();
  const results = await Promise.all([f.client.submit(f.target), f.client.submit(f.target)]);
  assert.equal(results.length, 2);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 6);
  assert.equal(f.state.campaign.sectionRevisions.dashboard, 1);
  assert.equal(f.state.campaign.sectionRevisions.record, 1);
  assert.equal(Object.keys(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.techAutomation.events).length, 1);
});

test('missing profile or insufficient resources refuses the whole operation before posting', async () => {
  const f = fixture();
  f.state.campaign.sections.record.users.chosen.resources.ore = 1;
  await assert.rejects(f.client.submit(f.target), { code: 'INSUFFICIENT_RESOURCES' });
  assert.equal(f.state.posts.length, 0);
  delete f.state.campaign.sections.dashboard.profiles.chosen;
  await assert.rejects(f.client.submit(f.target), { code: 'CAMPAIGN_CONTEXT_CHANGED' });
  assert.equal(f.state.posts.length, 0);
});

test('a technology read dependency conflict rechecks unlocks and leaves payment plus schedule untouched', async () => {
  const f = fixture({ beforePost(state) {
    state.campaign.sections.technology.users.chosen.unlocked = [];
    state.campaign.sectionRevisions.technology++;
  } });
  await assert.rejects(f.client.submit(f.target), { code: 'LOCKED' });
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 8);
  assert.deepEqual(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.techAutomation.events, {});
});

for (const option of ['loseResponse', 'malformedResponse']) test(`${option} after commit recovers by receipt without charging twice`, async () => {
  const f = fixture({ [option]: true });
  const result = await f.client.submit(f.target);
  assert.equal(result.duplicate, true);
  assert.equal(f.state.posts.length, 1);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 6);
});

test('offline submission never reports success or changes the saved campaign', async () => {
  const f = fixture({ failBeforeWrite: true });
  await assert.rejects(f.client.submit(f.target), { code: 'NETWORK_ERROR' });
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 8);
  assert.equal(f.state.campaign.sectionRevisions.dashboard, 0);
});

test('account switch stops the shared session and cannot write to the new account', async () => {
  const f = fixture({ beforePost(state) { state.accountId = 'bob'; } });
  await assert.rejects(f.client.submit(f.target), { code: 'ACCOUNT_MISMATCH' });
  assert.equal(f.accountSession.changed, true);
  assert.equal(f.state.campaign.sectionRevisions.dashboard, 0);
  await assert.rejects(f.client.submit(f.target), { code: 'ACCOUNT_MISMATCH' });
});

test('expected account binds the first read instead of adopting another login', async () => {
  const f = fixture();
  f.state.accountId = 'bob';
  await assert.rejects(f.client.load(f.target), { code: 'ACCOUNT_MISMATCH' });
  assert.equal(f.accountSession.changed, true);
  assert.equal(f.state.posts.length, 0);
});

test('completion only marks an overdue operation and repeated completion does not write', async () => {
  const f = fixture();
  await f.client.submit(f.target);
  await assert.rejects(f.client.complete(f.target), { code: 'NOT_DUE' });
  f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.day = 8;
  f.state.campaign.sectionRevisions.dashboard++;
  await f.client.complete(f.target);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 6, 'no reward is granted automatically');
  assert.equal(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.techAutomation.events.one.status, 'completed');
  const posts = f.state.posts.length;
  await f.client.complete(f.target);
  assert.equal(f.state.posts.length, posts);
});

test('conflicts are bounded and mismatched duplicate operation identities are refused', async () => {
  const f = fixture({ beforePost(state) { state.campaign.sectionRevisions.record++; } });
  await assert.rejects(f.client.submit(f.target), { code: 'SAVE_CONFLICT' });
  assert.equal(f.state.posts.length, 3);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 8);
  const other = fixture();
  await other.client.submit(other.target);
  await assert.rejects(other.client.submit({ ...other.target, techKey: 'other-tech' }), { code: 'OPERATION_MISMATCH' });
});

function fakeDocument() {
  class Node {
    constructor(tagName) { this.tagName = tagName; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ''; this.checked = false; }
    get textContent() { return this.children.map(child => child.textContent || '').join(''); }
    set textContent(value) { this.children = [{ textContent: String(value ?? '') }]; }
    setAttribute() {}
    appendChild(node) { this.children.push(node); return node; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    querySelectorAll(selector) { return findNodes(this, node => node.tagName === selector); }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  return { createElement: name => new Node(name), createTextNode: text => ({ textContent: text }) };
}
function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) { const result = findNode(child, predicate); if (result) return result; }
}
function findNodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => findNodes(child, predicate))];
}
function control(node, name) { return findNode(node, item => item.name === name); }
function change(node, value) { node.value = value; node.listeners.change(); }

test('shared panel uses cached context and executes a plain action with one click', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const f = fixture({ rules: { ...rules, listActions: () => [{ id: 'study', techKey: 'laboratory', label: '实验室',
      available: true, costLabel: '矿石 2', choices: [], confirmations: [] }] } });
    const context = await f.client.load(f.target);
    let loaded, committed, before = 0;
    const reads = f.state.reads;
    const panel = f.client.createActionPanel({ ...f.target, context, onLoaded: value => { loaded = value; },
      beforeSubmit: () => { before++; }, onCommitted: value => { committed = value; } });
    await panel.ready;
    assert.equal(f.state.reads, reads, 'cached panel rendering must not reread the network');
    assert.equal(panel.context, context);
    assert.equal(loaded, context);
    const button = findNode(panel, node => node.className === 'structure-tech-action-use');
    const preview = findNode(panel, node => node.className === 'structure-tech-action-preview');
    assert.match(preview.textContent, /矿石 2.*Day 7/);
    assert.equal(button.disabled, false);
    await button.listeners.click();
    assert.equal(before, 1);
    assert.equal(f.state.posts.length, 1);
    assert.ok(committed.campaign);
    assert.equal(findNode(panel, node => node.className === 'structure-tech-action-status').textContent, '已添加到时间线');
  } finally { global.document = previous; }
});

test('random draw previews never reveal the card name or outcome before committing', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    let previewCalls = 0;
    const engine = { ...rules,
      listActions: () => [{ id: 'study', techKey: 'laboratory', label: '打捞探索卡', available: true,
        immediate: true, hiddenOutcome: true, costLabel: '命运 +1；单抽 1 张探索卡' }],
      previewOperation(ctx) {
        previewCalls++;
        return { ok: true, event: { payment: [{ type: 'fate', amount: 1 }], skipTimeline: true,
          targetLabel: '铁匠铺 #6410', rewardLabel: '单抽 铁匠铺 #6410，可获得资源或泰坦' } };
      },
    };
    const f = fixture({ rules: engine });
    const panel = f.client.createActionPanel(f.target);
    await panel.ready;
    assert.ok(previewCalls > 0);
    const preview = findNode(panel, node => node.className === 'structure-tech-action-preview');
    assert.match(preview.textContent, /打捞探索卡.*命运 \+1/);
    assert.doesNotMatch(preview.textContent, /铁匠铺|6410|可获得资源或泰坦/);
    assert.equal(f.state.posts.length, 0);
    assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').textContent, '使用科技能力');
  } finally { global.document = previous; }
});

test('merchant card selection can explicitly resolve unknown reward conditions', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const f = fixture();
    const saved = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state;
    saved.techAutomation.events.one = { id: 'one', techKey: 'laboratory', cycleId: 'c2', status: 'pending',
      negotiationDraw: { cards: ['unknown-card', 'other'] } };
    const panel = f.client.createActionPanel({ ...f.target, scope: 'negotiation' });
    await panel.ready;
    const chosen = control(panel, 'merchant-one'); chosen.checked = true;
    control(panel, 'merchantQualification').value = 'none';
    control(panel, 'merchantQualificationConfirmed').checked = true;
    let request;
    f.client.complete = async target => { request = target; throw new Error('test stops before writing'); };
    await findNode(panel, node => node.className === 'structure-tech-action-use').listeners.click();
    assert.deepEqual(request.selection, { cardId: 'unknown-card', qualificationResult: 'none', qualificationConfirmed: true });
  } finally { global.document = previous; }
});

test('trade lines collect mixed exchange routes and quantities without a manual exchange confirmation', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const engine = { ...rules,
      listActions: () => [{ id: 'study', techKey: 'laboratory', label: '贸易', available: true, trade: true, days: 7,
        maxTrades: 3, tradeRoutes: [{ id: 'ore-wood', label: '矿石 2 → 木材 1' }, { id: 'ore-gold', label: '矿石 2 → 黄金 1' }] }],
      prepareOperation(ctx) { return ctx.selection.trades?.length ? rules.prepareOperation(ctx)
        : { ok: false, code: 'INVALID_TRADE', message: '请选择交易' }; },
    };
    const f = fixture({ rules: engine });
    const panel = f.client.createActionPanel(f.target);
    await panel.ready;
    const button = findNode(panel, node => node.className === 'structure-tech-action-use');
    assert.equal(findNode(panel, node => node.type === 'checkbox'), undefined);
    assert.equal(findNodes(panel, node => node.className === 'structure-tech-trade-line').length, 3);
    assert.equal(button.disabled, true);
    assert.equal(f.state.posts.length, 0);
    change(control(panel, 'tradeRoute0'), 'ore-wood');
    assert.equal(control(panel, 'tradeCount0').value, '1');
    change(control(panel, 'tradeCount0'), '2');
    change(control(panel, 'tradeRoute1'), 'ore-gold');
    assert.equal(button.disabled, false);
    let submitted;
    const submit = f.client.submit; f.client.submit = target => { submitted = target; return submit(target); };
    await button.listeners.click();
    assert.deepEqual(submitted.selection.trades, [{ routeId: 'ore-wood', count: 2 }, { routeId: 'ore-gold', count: 1 }]);
    assert.equal(f.state.posts.length, 1);
  } finally { global.document = previous; }
});

const realRules = require('../technology/structure-tech-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
function negotiationFixture(key = 'crew expansion', options = {}) {
  const f = fixture({ ...options, rules: realRules, dictionary });
  const card = dictionary.cards.find(card => card.key === key), cycleId = card.nodes[0].page.replace('cycle', 'c');
  const localFaction = { c1: 'minoians', c2: 'helots', c3: 'sunheirs', c4: 'wasters', c5: 'followersOfArete' }[cycleId];
  const action = realRules.negotiationCatalog.find(rule => rule.key === key).actions[0];
  const saved = f.state.campaign.sections.dashboard.profiles.chosen.cycles;
  saved[cycleId] = { state: { day: 4, notes: '谈判之前的笔记', techAutomation: { version: 1, events: {} },
    mapSnapshot: { cycleId, currentTileId: 'site', currentTileTags: ['city'], currentTileFactions: [localFaction] } } };
  f.state.campaign.sections.technology.users.chosen = { unlocked: [key, 'advanced trading solutions'] };
  f.state.campaign.sections.record.users.chosen = { cycle: cycleId, cycleStats: { [cycleId]: { fate: '2', crew: '2', strangers: '2' } },
    resources: { 'c1-trireme': 8, 'c1-monument': 0, priests: 2 } };
  f.state.campaign.sectionRevisions.map = 0;
  f.target = { ...f.target, cycleId, techKey: key, actionId: action.id, selection: { location: 'current:site' } };
  return f;
}

test('a negotiation panel executes immediately, retains receipts and guards the map read revision', async () => {
  const previous = global.document; global.document = fakeDocument();
  try {
    const f = negotiationFixture(), panel = f.client.createActionPanel({ ...f.target, scope: 'negotiation' });
    await panel.ready;
    const use = findNode(panel, node => node.className === 'structure-tech-action-use');
    assert.equal(control(panel, 'location'), undefined, 'the only valid location is selected without a dropdown');
    assert.equal(use.textContent, '执行谈判');
    assert.equal(use.disabled, false);
    await use.listeners.click();
    assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c1.fate, '3');
    assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c1.crew, '3');
    assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c1.strangers, '3');
    assert.equal(f.state.posts[0].expectedRevisions.map, 0);
    const event = Object.values(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c1.state.techAutomation.events)[0];
    assert.equal(event.skipTimeline, true);
    assert.equal(event.selection.location, 'current:site');
  } finally { global.document = previous; }
});

test('Plutocratic Agents derives its local faction and only asks which other faction loses diplomacy', async () => {
  const previous = global.document; global.document = fakeDocument();
  try {
    const f = negotiationFixture('plutocratic agents');
    const record = f.state.campaign.sections.record.users.chosen;
    record.cycleStats.c4.babelianDebt = '2';
    record.diplomacy = { 'c4-wasters': '4', 'c4-aristotelians': '4', 'c4-cloudThieves': '4' };
    const panel = f.client.createActionPanel({ ...f.target, scope: 'negotiation' });
    await panel.ready;
    assert.equal(control(panel, 'faction'), undefined);
    assert.match(panel.textContent, /当地派系：浪费者（外交 4）/);
    const other = control(panel, 'otherFaction');
    assert.deepEqual(other.children.filter(node => node.tagName === 'option' && node.value).map(node => node.value), ['aristotelians', 'cloudThieves']);
    const use = findNode(panel, node => node.className === 'structure-tech-action-use');
    assert.equal(use.disabled, true);
    change(other, 'aristotelians');
    assert.equal(use.disabled, false);
    await use.listeners.click();
    const saved = f.state.campaign.sections.record.users.chosen;
    assert.equal(saved.diplomacy['c4-wasters'], '5');
    assert.equal(saved.diplomacy['c4-aristotelians'], '3');
    assert.equal(saved.diplomacy['c4-cloudThieves'], '4');
    assert.equal(saved.cycleStats.c4.babelianDebt, '1');
    assert.equal(saved.cycleStats.c4.fate, '3');
    const event = Object.values(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4.state.techAutomation.events)[0];
    assert.equal(event.selection.faction, 'wasters');
    assert.equal(f.state.posts.length, 1);
  } finally { global.document = previous; }
});

test('local faction choices require map evidence while any-faction abilities retain their player choice', async () => {
  const previous = global.document; global.document = fakeDocument();
  try {
    for (const locals of [[], ['wasters', 'aristotelians']]) {
      const f = negotiationFixture('plutocratic agents');
      f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4.state.mapSnapshot.currentTileFactions = locals;
      const record = f.state.campaign.sections.record.users.chosen;
      record.cycleStats.c4.babelianDebt = '2';
      record.diplomacy = { 'c4-wasters': '4', 'c4-aristotelians': '4', 'c4-cloudThieves': '4' };
      const panel = f.client.createActionPanel({ ...f.target, scope: 'negotiation' });
      await panel.ready;
      const use = findNode(panel, node => node.className === 'structure-tech-action-use');
      assert.equal(use.disabled, true);
      if (!locals.length) {
        assert.equal(control(panel, 'faction'), undefined);
        assert.match(panel.textContent, /当地派系未标注/);
        assert.equal(f.state.posts.length, 0);
        continue;
      }
      assert.deepEqual(control(panel, 'faction').children.filter(node => node.value).map(node => node.value), locals);
      change(control(panel, 'faction'), 'aristotelians');
      assert.equal(control(panel, 'otherFaction').children.some(node => node.value === 'aristotelians'), false);
      change(control(panel, 'otherFaction'), 'wasters');
      assert.equal(use.disabled, false);
      await use.listeners.click();
      assert.equal(f.state.campaign.sections.record.users.chosen.diplomacy['c4-aristotelians'], '5');
      assert.equal(f.state.campaign.sections.record.users.chosen.diplomacy['c4-wasters'], '3');
    }
    const f = negotiationFixture('plutocratic diplomacy');
    const panel = f.client.createActionPanel({ ...f.target, scope: 'negotiation' });
    await panel.ready;
    assert.deepEqual(control(panel, 'faction').children.filter(node => node.value).map(node => node.value), ['wasters', 'aristotelians', 'cloudThieves']);
  } finally { global.document = previous; }
});

test('Mortal Alliance follows the chosen adjacent city for its automatic local faction and visit marker', async () => {
  const previous = { document: global.document, tags: global.ATO_MAP_TILE_TAGS, data: global.ATO_MAP_DATA };
  global.document = fakeDocument();
  global.ATO_MAP_TILE_TAGS = { tiles: {
    'c5:sea': { tags: [] },
    'c5:town': { tags: ['city'], factions: ['followersOfArete'] },
    'c5:other-town': { tags: ['city'], factions: ['cycladeanProtectorate'] },
  } };
  try {
    for (const multiple of [false, true]) {
      const f = negotiationFixture('grassroots diplomacy');
      const record = f.state.campaign.sections.record.users.chosen;
      record.resources['c5-atlanteanTekne'] = 4;
      record.diplomacy = { 'c5-followersOfArete': '4', 'c5-cycladeanProtectorate': '4' };
      global.ATO_MAP_DATA = { cycles: [{ id: 'c5', tiles: [{ id: 'sea',
        neighbors: { right: 'town', ...(multiple ? { left: 'other-town' } : {}) } }] }] };
      f.state.campaign.sections.map.users.chosen.cycles.c5 = { currentTile: 'sea',
        tileVariants: { town: 'alternate', 'other-town': 'alternate' },
        tokens: { markers: { old: { last_city: true, hs: true } } } };
      const unlocked = f.state.campaign.sections.technology.users.chosen.unlocked;
      assert.equal(realRules.canNegotiate(await f.client.load(f.target)), false, 'an ordinary sea tile cannot negotiate without the passive');
      unlocked.push('mortal alliance');
      assert.equal(realRules.canNegotiate(await f.client.load(f.target)), true);
      const panel = f.client.createActionPanel({ ...f.target, scope: 'negotiation' });
      await panel.ready;
      const use = findNode(panel, node => node.className === 'structure-tech-action-use');
      const location = control(panel, 'location');
      const target = multiple ? 'other-town' : 'town';
      change(control(panel, 'pay:c5-atlanteanTekne'), '4');
      if (multiple) {
        assert.equal(use.disabled, true, 'multiple valid targets require a choice');
        change(location, 'adjacent:town');
        assert.match(panel.textContent, /当地派系：阿瑞特追随者/);
        change(control(panel, 'location'), `adjacent:${target}`);
        assert.match(panel.textContent, /当地派系：保护国/);
      } else assert.equal(location, undefined);
      assert.equal(control(panel, 'faction'), undefined);
      assert.equal(control(panel, 'pay:c5-atlanteanTekne').value, '4', 'changing location retains the chosen payment');
      assert.equal(use.disabled, false);
      await use.listeners.click();
      assert.equal(f.state.posts.length, 1);
      assert.equal(f.state.posts[0].expectedRevisions.map, 0);
      const saved = f.state.campaign.sections.map.users.chosen.cycles.c5;
      assert.equal(saved.currentTile, 'sea', 'remote negotiation keeps the Argo in place');
      assert.equal(saved.tokens.markers[target].last_city, true);
      assert.deepEqual(saved.tokens.markers.old, { hs: true });
      assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c5.fate, '3');
      const event = Object.values(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c5.state.techAutomation.events)[0];
      assert.equal(event.selection.location, `adjacent:${target}`);
      const faction = multiple ? 'cycladeanProtectorate' : 'followersOfArete';
      assert.equal(event.selection.faction, faction);
      assert.equal(f.state.campaign.sections.record.users.chosen.diplomacy[`c5-${faction}`], '5');
    }
  } finally {
    global.document = previous.document;
    global.ATO_MAP_TILE_TAGS = previous.tags;
    global.ATO_MAP_DATA = previous.data;
  }
});

test('negotiation response loss and simultaneous duplicate clicks settle fate and result exactly once', async () => {
  const f = negotiationFixture('crew expansion', { loseResponse: true });
  const result = await f.client.submit(f.target);
  assert.equal(result.duplicate, true);
  await f.client.submit(f.target);
  assert.equal(f.state.posts.length, 1);
  assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c1.fate, '3');
  const concurrent = negotiationFixture();
  await Promise.all([concurrent.client.submit(concurrent.target), concurrent.client.submit(concurrent.target)]);
  assert.equal(concurrent.state.campaign.sections.record.users.chosen.cycleStats.c1.crew, '3');
});

function merchantFixture(options = {}) {
  const f = negotiationFixture('merchants of the waste', options);
  f.state.campaign.sections.technology.users.chosen.unlocked.push('law mora');
  f.state.campaign.sections.record.users.chosen.cycleStats.c4.babelianDebt = '6';
  const state = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4.state;
  state.exploration = { drawStateByCycle: { c4: { drawPile: ['reward', 'other', 'tail'], activePiles: [[], []], discardPile: [] } } };
  f.target.selection['manual:babelianDebt'] = true;
  return f;
}

async function withMerchantDataset(callback) {
  const previous = global.ATO_EXPLORATION_CARD_RESOURCES;
  global.ATO_EXPLORATION_CARD_RESOURCES = { cards: {
    'c4:reward': { cardId: 'reward', titleEn: 'Reward', grants: [{ resource: 'imperialScroll', amount: 1 }], manual: [] },
    'c4:other': { cardId: 'other', titleEn: 'Other', grants: [], manual: [] },
  } };
  try { await callback(); }
  finally { global.ATO_EXPLORATION_CARD_RESOURCES = previous; }
}

test('merchant choice retries preserve a separate manual debt task and reject a changed card', () => withMerchantDataset(async () => {
  const f = merchantFixture();
  await f.client.submit(f.target);
  const selectionTarget = { ...f.target, selection: { cardId: 'reward' } };
  const selected = await f.client.complete(selectionTarget);
  assert.equal(selected.operation.status, 'pending');
  const saved = () => f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4.state;
  const afterSelection = clone(f.state.campaign);
  const replayed = await f.client.complete(selectionTarget);
  assert.equal(replayed.duplicate, true);
  assert.equal(replayed.operation.status, 'pending');
  assert.deepEqual(f.state.campaign, afterSelection, 'the same choice neither writes again nor completes the manual task');
  await assert.rejects(f.client.complete({ ...selectionTarget, selection: { cardId: 'other' } }), { code: 'OPERATION_MISMATCH' });
  assert.equal(f.state.posts.length, 2);
  assert.deepEqual(saved().exploration.drawStateByCycle.c4.activePiles.flat().map(entry => entry.id), ['reward']);
  const completed = await f.client.complete({ ...f.target, selection: {} });
  assert.equal(completed.operation.status, 'completed', 'explicit completion without a card choice acknowledges the remaining manual task');
  assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c4.babelianDebt, '6');
  assert.equal(saved().notes.split('\n').length, 4);
  await assert.rejects(f.client.complete({ ...selectionTarget, selection: { cardId: 'other' } }), { code: 'OPERATION_MISMATCH' });
  assert.equal((await f.client.complete(selectionTarget)).duplicate, true);
  assert.equal(f.state.posts.length, 3);
}));

for (const option of ['loseResponse', 'malformedResponse']) test(`merchant selection ${option} recovers while its manual debt remains pending`, () => withMerchantDataset(async () => {
  const f = merchantFixture({ [option]: true });
  await f.client.submit(f.target);
  const cardId = option === 'loseResponse' ? 'reward' : 'other';
  const selected = await f.client.complete({ ...f.target, selection: { cardId } });
  assert.equal(selected.duplicate, true, 'the selected card identifies a committed substep even while the full event is pending');
  assert.equal(selected.operation.status, 'pending');
  assert.equal(selected.operation.negotiationDraw.selectedCard, cardId);
  assert.equal(f.state.posts.length, 2);
  const saved = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4.state;
  assert.equal(saved.notes.split('\n').length, 3);
  assert.deepEqual(saved.exploration.drawStateByCycle.c4.activePiles.flat().map(entry => entry.id), cardId === 'reward' ? ['reward'] : []);
  assert.deepEqual(saved.exploration.drawStateByCycle.c4.drawPile, cardId === 'reward' ? ['tail'] : ['tail', 'reward', 'other']);
  assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c4.babelianDebt, '6');
}));

test('concurrent merchant choices settle once without acknowledging the remaining manual debt', () => withMerchantDataset(async () => {
  const f = merchantFixture();
  await f.client.submit(f.target);
  const selectionTarget = { ...f.target, selection: { cardId: 'reward' } };
  const selected = await Promise.all([f.client.complete(selectionTarget), f.client.complete(selectionTarget)]);
  assert.ok(selected.every(result => result.operation.status === 'pending'));
  assert.ok(selected.some(result => result.duplicate));
  const saved = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4.state;
  assert.equal(saved.notes.split('\n').length, 3, 'only one card-selection log is stored');
  assert.equal(f.state.campaign.sectionRevisions.dashboard, 2, 'the operation and the selected card each commit once');
  assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c4.babelianDebt, '6');
}));

test('moving off a valid negotiation location during a save conflict cancels the full transaction', async () => {
  let moved = false;
  const f = negotiationFixture('crew expansion', { beforePost(state) {
    if (moved) return; moved = true;
    state.campaign.sections.map = { users: { chosen: { cycles: { c1: { currentTile: 'ordinary', tokens: { markers: {} } } } } } };
    state.campaign.sectionRevisions.map++;
  } });
  await assert.rejects(f.client.submit(f.target), error => error.code === 'INVALID_LOCATION');
  assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c1.fate, '2');
  assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c1.crew, '2');
  assert.equal(Object.keys(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c1.state.techAutomation.events).length, 0);
});

test('a concurrent resource change cancels a town trade without charging fate or granting its reward', async () => {
  let changed = false;
  const f = negotiationFixture('trading solutions', { beforePost(state) {
    if (changed) return; changed = true;
    state.campaign.sections.record.users.chosen.resources['c1-trireme'] = 0;
    state.campaign.sectionRevisions.record++;
  } });
  f.target.selection.trades = [{ routeId: 'trireme-to-monument', count: 1 }];
  await assert.rejects(f.client.submit(f.target), error => error.code === 'INSUFFICIENT_RESOURCES');
  assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c1.fate, '2');
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c1-monument'], 0);
});

test('salvage retries a concurrent map move before deciding a local conditional reward', async () => {
  const previous = { dataset: global.ATO_EXPLORATION_CARD_RESOURCES, tags: global.ATO_MAP_TILE_TAGS };
  global.ATO_EXPLORATION_CARD_RESOURCES = { cards: { 'c4:hidden': { cardId: 'hidden', titleEn: 'Hidden',
    grants: [{ resource: 'imperialScroll', amount: 1, condition: { type: 'diplomacy', mode: 'only', bonus: 1 } }], manual: [] } } };
  global.ATO_MAP_TILE_TAGS = { tiles: { 'c4:town': { factions: ['wasters'] }, 'c4:other': { factions: ['aristotelians'] } } };
  let moved = false;
  try {
    const f = fixture({ rules: realRules, dictionary, beforePost(state) {
      if (moved) return; moved = true;
      state.campaign.sections.map.users.chosen.cycles.c4.currentTile = 'other';
      state.campaign.sectionRevisions.map++;
    } });
    f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4 = { state: { day: 4, techAutomation: { version: 1, events: {} },
      exploration: { drawStateByCycle: { c4: { drawPile: ['hidden'], activePiles: [[], []], history: [] } } } } };
    f.state.campaign.sections.record.users.chosen = { cycle: 'c4', fate: '2', diplomacy: { 'c4-wasters': '4', 'c4-aristotelians': '0' } };
    f.state.campaign.sections.technology.users.chosen.unlocked = ['salvage operations'];
    f.state.campaign.sections.map.users.chosen.cycles.c4 = { currentTile: 'town' };
    const result = await f.client.submit({ ...f.target, cycleId: 'c4', techKey: 'salvage operations', actionId: 'tech-explore-salvage' });
    assert.equal(f.state.posts.length, 2);
    assert.equal(f.state.posts[0].expectedRevisions.map, 0);
    assert.equal(result.operation.gains[0].qualified, false);
    assert.equal(f.state.campaign.sections.record.users.chosen.fate, '3');
    assert.equal(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c4.state.exploration.drawStateByCycle.c4.activePiles.flat().length, 0);
  } finally { global.ATO_EXPLORATION_CARD_RESOURCES = previous.dataset; global.ATO_MAP_TILE_TAGS = previous.tags; }
});

test('diplomacy checks require the player result in the interactive panel and pay the priest on failure', async () => {
  const previous = global.document; global.document = fakeDocument();
  try {
    const f = negotiationFixture('moirai operation'), panel = f.client.createActionPanel({ ...f.target, scope: 'negotiation' });
    await panel.ready;
    const use = findNode(panel, node => node.className === 'structure-tech-action-use');
    assert.equal(use.disabled, true);
    change(control(panel, 'sacrifice'), 'priest');
    assert.equal(use.disabled, true);
    change(control(panel, 'checkResult'), 'failure');
    assert.equal(use.disabled, false);
    await use.listeners.click();
    assert.equal(f.state.campaign.sections.record.users.chosen.resources.priests, 1);
    assert.equal(f.state.campaign.sections.record.users.chosen.cycleStats.c3.fate, '2');
  } finally { global.document = previous; }
});

function realFixture(key, action, extra = {}) {
  const card = dictionary.cards.find(card => card.category === 'structure' && card.key.split('@@')[0] === key);
  assert.ok(card, `dictionary card for ${key}`);
  const cycleId = card.nodes[0].page.replace('cycle', 'c');
  const f = fixture({ ...extra, rules: realRules, dictionary });
  f.state.campaign.sections.dashboard.profiles.chosen.cycles = {
    [cycleId]: { state: { day: 4, notes: '手写日志', techAutomation: { version: 1, events: {} } } },
  };
  f.state.campaign.sections.record.users.chosen = { cycle: cycleId, fate: '2',
    cycleStats: { [cycleId]: { fate: '2' } }, resources: { 'c1-trireme': 8, 'c2-warTrireme': 4 },
    titans: [{ id: 'dream', name: '梦行者', count: 2, crippled: true }] };
  f.state.campaign.sections.technology.users.chosen = { unlocked: [card.key] };
  f.state.campaign.sections.heroes = { users: { chosen: { heroes: [{ id: 'h', name: '奥德修斯' }], graveyard: [] } } };
  const selection = {};
  if (action.target === 'hero') selection.targetId = 'h';
  if (action.target?.includes('titan') || action.sacrifice) selection.titanId = 'dream';
  if (action.sacrifice) Object.assign(selection, { dreamwalkerConfirmed: true, resultTitan: action.models[0] });
  if (action.trade) {
    const route = action.tradeRoutes[0];
    selection.trades = [{ routeId: route.id, count: 1 }];
    for (const cost of route.costs) f.state.campaign.sections.record.users.chosen.resources[cost.storageKey] ??= 8;
    if (action.requiresDevelopment) Object.assign(selection, { story2aConfirmed: true });
  }
  if (action.rebuild) Object.assign(selection, { payment: 'c2-warTrireme' });
  f.target = { ...f.target, cycleId, techKey: card.key, actionId: action.id, selection };
  return f;
}
for (const rule of realRules.catalog) for (const action of rule.actions) {
  test(`actual rules and dictionary atomically settle ${rule.key}/${action.id}`, async () => {
    const f = realFixture(rule.key, action);
    const originalC2 = f.state.campaign.sections.record.users.chosen.resources['c2-warTrireme'];
    const route = action.tradeRoutes?.[0];
    const expectedC2 = originalC2 - (action.rebuild ? 2 : 0)
      - (route?.costs.find(item => item.storageKey === 'c2-warTrireme')?.amount || 0)
      + (route?.gains.find(item => item.storageKey === 'c2-warTrireme')?.amount || 0);
    const loaded = await f.client.load(f.target);
    assert.equal(loaded.heroes.heroes[0].id, 'h');
    assert.deepEqual(loaded.automationsByCycle[f.target.cycleId], { version: 1, events: {} });
    const result = await f.client.submit(f.target);
    assert.equal(result.operation.dueDay, 4 + action.days);
    const record = f.state.campaign.sections.record.users.chosen;
    const state = f.state.campaign.sections.dashboard.profiles.chosen.cycles[f.target.cycleId].state;
    assert.equal(record.cycleStats[f.target.cycleId].fate, String(2 + (action.fate || 0)));
    assert.equal(record.resources['c2-warTrireme'], expectedC2);
    assert.equal(record.titans[0].count, action.sacrifice ? 1 : 2);
    assert.equal(state.notes.split('\n').length, 2);
    assert.match(state.notes, /手写日志\n\[.*结构科技\].*使用.*代价：/);
    if (!action.skipTimeline) assert.match(state.notes, /到期：D/);
    else assert.doesNotMatch(state.notes, /到期：D/);
    if (action.trade) assert.match(state.notes, /兑换：.*→/);
    assert.ok(state.notes.includes(result.operation.label));
    if (action.fate) assert.match(state.notes, /命运 \+1/);
    if (action.rebuild) assert.match(state.notes, /舰材 -2/);
    if (action.tear) assert.match(state.notes, /暂时弃置本卡/);
    if (action.target === 'hero') assert.match(state.notes, /目标：奥德修斯/);
    await f.client.submit(f.target);
    assert.equal(f.state.posts.length, 1);
    state.day = result.operation.dueDay;
    f.state.campaign.sectionRevisions.dashboard++;
    if (action.kind === 'cooldown') {
      const current = await f.client.load(f.target);
      assert.equal(realRules.getAvailability({ ...current, techKey: f.target.techKey }).ok, true, 'pure cooldown unlocks without a completion write');
    } else {
      const healthyBefore = new Map(f.state.campaign.sections.record.users.chosen.titans
        .filter(titan => !titan.crippled).map(titan => [titan.name, titan.count]));
      const maimedBefore = f.state.campaign.sections.record.users.chosen.titans
        .filter(titan => titan.crippled).reduce((total, titan) => total + titan.count, 0);
      await f.client.complete(f.target);
      const completed = f.state.campaign.sections.dashboard.profiles.chosen.cycles[f.target.cycleId].state;
      assert.equal(completed.notes.split('\n').length, 3);
      const grant = result.operation.grant;
      assert.match(completed.notes, action.rebuild ? /重建完成.*地图侦察船已可用/
        : grant ? /已自动结算/ : /已手动处理/);
      const titans = f.state.campaign.sections.record.users.chosen.titans;
      const maimed = () => titans.filter(titan => titan.crippled).reduce((total, titan) => total + titan.count, 0);
      if (grant?.type === 'titan') {
        const stored = titans.find(titan => titan.name === grant.name && !titan.crippled);
        assert.equal(stored.count, (healthyBefore.get(grant.name) || 0) + 1, 'the due titan joins its healthy row');
        assert.equal(maimed(), maimedBefore, 'a new titan never heals a maimed model');
      }
      if (grant?.type === 'repair') assert.equal(maimed(), maimedBefore - 1, 'exactly one model is repaired');
      if (!grant) assert.deepEqual(titans.map(titan => titan.count), [action.sacrifice ? 1 : 2], 'manual rewards store nothing');
      assert.equal(f.state.campaign.sections.record.users.chosen.resources['c2-warTrireme'], expectedC2, 'completing never charges again');
      const stored = f.state.campaign.sections.record.users.chosen.titans;
      await f.client.complete(f.target);
      assert.equal(f.state.posts.length, 2, 'completion is idempotent');
      assert.deepEqual(f.state.campaign.sections.record.users.chosen.titans, stored, 'a replayed completion never grants twice');
    }
  });
}

test('read-only heroes conflicts revalidate the selected current hero', async () => {
  const action = realRules.catalog.find(rule => rule.key === 'mnestis thesis').actions[0];
  let changed = false;
  const f = realFixture('mnestis thesis', action, { beforePost(state) {
    if (changed) return; changed = true;
    state.campaign.sections.heroes.users.chosen.heroes = [];
    state.campaign.sectionRevisions.heroes++;
  } });
  await assert.rejects(f.client.submit(f.target), { code: 'INVALID_TARGET' });
  assert.equal(f.state.posts.length, 1);
  assert.equal(f.state.campaign.sections.record.users.chosen.fate, '2');
});

test('stale dates are refused initially and after a conflict without a payment or log', async () => {
  const stale = fixture();
  await assert.rejects(stale.client.submit({ ...stale.target, expectedDay: 3 }), { code: 'CAMPAIGN_CONTEXT_CHANGED' });
  assert.equal(stale.state.posts.length, 0);
  const f = fixture({ beforePost(state) {
    state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.day++;
    state.campaign.sectionRevisions.dashboard++;
  } });
  await assert.rejects(f.client.submit({ ...f.target, expectedDay: 4 }), { code: 'CAMPAIGN_CONTEXT_CHANGED' });
  assert.equal(f.state.posts.length, 1);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources.ore, 8);
  assert.equal(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.notes, 'keep');
});

test('caller context changes during the campaign read stop before a mutation', async () => {
  const f = fixture();
  let current = true;
  const promise = f.client.submit({ ...f.target, assertContext() {
    if (!current) throw Object.assign(new Error('profile switched'), { code: 'CAMPAIGN_CONTEXT_CHANGED' });
  } });
  current = false;
  await assert.rejects(promise, { code: 'CAMPAIGN_CONTEXT_CHANGED' });
  assert.equal(f.state.posts.length, 0);
});

test('caller inputs are captured before asynchronous reads, and reserved operation ids are invalid', async () => {
  const f = fixture();
  const target = { ...f.target, selection: { heroName: 'first' } };
  const promise = f.client.submit(target);
  target.profileId = 'other'; target.selection.heroName = 'second';
  await promise;
  assert.equal(f.state.posts[0].userId, 'chosen');
  for (const operationId of ['__proto__', 'constructor', 'prototype']) {
    await assert.rejects(f.client.submit({ ...f.target, operationId }), { code: 'INVALID_OPERATION' });
  }
});

test('actual receipts reject changed options and incomplete receipt/event pairs', async () => {
  const rule = realRules.catalog.find(rule => rule.key === 'canal reconnaissance');
  const f = realFixture(rule.key, rule.actions[0], { loseResponse: true });
  await f.client.submit(f.target);
  await assert.rejects(f.client.submit({ ...f.target, selection: { ...f.target.selection, payment: 'c1-trireme' } }), { code: 'OPERATION_MISMATCH' });
  const state = f.state.campaign.sections.dashboard.profiles.chosen.cycles[f.target.cycleId].state;
  assert.equal(state.notes.split('\n').length, 2, 'lost response does not duplicate the success log');
  delete state.techAutomation.events.one;
  await assert.rejects(f.client.submit(f.target), { code: 'INCONSISTENT_OPERATION' });
});

test('the actual rebuild panel previews the chosen resource cost and due day before one-click settlement', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const rule = realRules.catalog.find(rule => rule.key === 'canal reconnaissance');
    const f = realFixture(rule.key, rule.actions[0]);
    const panel = f.client.createActionPanel(f.target);
    await panel.ready;
    const select = findNode(panel, node => node.tagName === 'select');
    const button = findNode(panel, node => node.className === 'structure-tech-action-use');
    const preview = findNode(panel, node => node.className === 'structure-tech-action-preview');
    assert.equal(button.disabled, true);
    assert.equal(findNode(panel, node => node.type === 'checkbox'), undefined, 'map state replaces the discarded-ship confirmation');
    assert.match(preview.textContent, /地图上没有侦察船/);
    select.value = 'c2-warTrireme'; select.listeners.change();
    assert.equal(button.disabled, false);
    assert.match(preview.textContent, /命运 \+1.*舰材 -2.*Day 8/);
    assert.doesNotMatch(preview.textContent, /5 船材|恢复：/);
    select.value = 'c1-trireme'; select.listeners.change();
    assert.match(preview.textContent, /船材 -5.*Day 8/);
    await Promise.all([button.listeners.click(), button.listeners.click()]);
    assert.equal(f.state.posts.length, 1);
    assert.equal(f.state.campaign.sections.record.users.chosen.resources['c1-trireme'], 3);
  } finally { global.document = previous; }
});

test('scout rebuild reads the selected profile and cycle, refusing an available or deployed ship before payment', async () => {
  const action = realRules.catalog.find(rule => rule.key === 'canal reconnaissance').actions[0];
  for (const tokens of [{ hsCount: 1, markers: {} }, { hsCount: 0, markers: { C2_3: { hs: true } } },
    { markers: { C2_3: { hs: true } } }, { hsCount: 'unknown', markers: {} }]) {
    const f = realFixture('canal reconnaissance', action);
    f.state.campaign.sections.map.users.chosen.cycles.c2.tokens = tokens;
    const before = clone(f.state.campaign);
    const loaded = await f.client.load(f.target);
    const scout = realRules.scoutStatus(loaded);
    if (tokens.markers.C2_3) assert.match(scout.label, /已派出至 C2_3/);
    await assert.rejects(f.client.submit(f.target), { code: tokens.hsCount === 'unknown' ? 'UNKNOWN_SCOUT' : 'SCOUT_AVAILABLE' });
    assert.equal(f.state.posts.length, 0);
    assert.deepEqual(f.state.campaign, before);
  }
  const f = realFixture('canal reconnaissance', action);
  const loaded = await f.client.load(f.target);
  assert.equal(realRules.scoutStatus(loaded).count, 0, 'another profile with a ship cannot block this profile');
  await f.client.submit(f.target);
  assert.deepEqual(f.state.posts[0].expectedRevisions, { dashboard: 0, record: 0, technology: 0, heroes: 0, map: 0 });
  assert.equal(f.state.posts[0].sections.map, undefined, 'scheduling does not prematurely produce the ship');
});

test('a concurrently restored scout invalidates a stale rebuild without charging resources or fate', async () => {
  const action = realRules.catalog.find(rule => rule.key === 'canal reconnaissance').actions[0];
  const f = realFixture('canal reconnaissance', action, { beforePost(state) {
    state.campaign.sections.map.users.chosen.cycles.c2.tokens.hsCount = 1;
    state.campaign.sectionRevisions.map++;
  } });
  await assert.rejects(f.client.submit(f.target), { code: 'SCOUT_AVAILABLE' });
  assert.equal(f.state.posts.length, 1);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c2-warTrireme'], 4);
  assert.equal(f.state.campaign.sections.record.users.chosen.fate, '2');
  assert.deepEqual(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.techAutomation.events, {});
});

test('due scout completion atomically restores one ship and rebases onto unrelated map edits', async () => {
  const action = realRules.catalog.find(rule => rule.key === 'canal reconnaissance').actions[0];
  let conflict = true;
  const f = realFixture('canal reconnaissance', action, { beforePost(state, payload) {
    if (!conflict || !payload.sections.map) return;
    conflict = false;
    state.campaign.sections.map.users.chosen.cycles.c2.tileNotes.REMOTE = 'another map tab';
    state.campaign.sectionRevisions.map++;
  } });
  const map = f.state.campaign.sections.map.users.chosen;
  map.cycles.c2.tokens = { hsCount: 0, AG: 'ARGO', AD: 'NEMESIS', markers: { LOCAL: { calamity: true } } };
  map.cycles.c2.tileNotes.LOCAL = 'keep this note';
  map.cycles.c3 = { tokens: { hsCount: 1, markers: {} }, explored: { OLD: true } };
  const otherProfile = clone(f.state.campaign.sections.map.users.other);
  const otherCycle = clone(map.cycles.c3);
  await f.client.submit(f.target);
  await assert.rejects(f.client.complete(f.target), { code: 'NOT_DUE' });
  assert.equal(f.state.campaign.sections.map.users.chosen.cycles.c2.tokens.hsCount, 0);
  f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.day = 8;
  f.state.campaign.sectionRevisions.dashboard++;
  await Promise.all([f.client.complete(f.target), f.client.complete(f.target)]);
  const saved = f.state.campaign.sections.map.users.chosen;
  assert.deepEqual(saved.cycles.c2.tokens, { hsCount: 1, AG: 'ARGO', AD: 'NEMESIS', markers: { LOCAL: { calamity: true } } });
  assert.deepEqual(saved.cycles.c2.tileNotes, { LOCAL: 'keep this note', REMOTE: 'another map tab' });
  assert.deepEqual(saved.cycles.c3, otherCycle);
  assert.deepEqual(f.state.campaign.sections.map.users.other, otherProfile);
  const dashboard = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state;
  assert.equal(dashboard.techAutomation.events.one.status, 'completed');
  assert.equal(dashboard.techAutomation.events.one.scoutRestored, true);
  assert.equal(dashboard.mapSnapshot.scoutCount, 1);
  assert.equal(dashboard.mapSnapshot.scoutTileId, '');
  assert.equal(dashboard.notes.split('\n').length, 3);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c2-warTrireme'], 2);
  const posts = f.state.posts.length;
  await f.client.complete(f.target);
  assert.equal(f.state.posts.length, posts);
});

test('the actual trade panel previews all resource payments and performs mixed exchanges atomically', () => withPanelDocument(async () => {
  const rule = realRules.catalog.find(item => item.key === 'superior trading solutions');
  const f = realFixture(rule.key, rule.actions[0], { loseResponse: true });
  f.state.campaign.sections.record.users.chosen.resources['c1-monument'] = 2;
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  assert.equal(control(panel, 'tradeManualConfirmed'), undefined);
  assert.equal(control(panel, 'tradeRoute0').children.find(option => option.value === 'trireme-to-monument').textContent,
    '3 船材（库存 8） → 1 石筑（库存 2）');
  change(control(panel, 'tradeRoute0'), 'trireme-to-monument');
  change(control(panel, 'tradeRoute1'), 'monument-to-trireme');
  const preview = findNode(panel, node => node.className === 'structure-tech-action-preview');
  assert.match(preview.textContent, /命运 \+1.*船材 -3.*石筑 -1.*3 船材（库存 8） → 1 石筑（库存 2） ×1.*1 石筑（库存 2） → 1 船材（库存 8） ×1.*Day 11/);
  const button = findNode(panel, node => node.className === 'structure-tech-action-use');
  assert.equal(button.disabled, false);
  await Promise.all([button.listeners.click(), button.listeners.click()]);
  assert.equal(f.state.posts.length, 1);
  const record = f.state.campaign.sections.record.users.chosen;
  assert.equal(record.resources['c1-trireme'], 6);
  assert.equal(record.resources['c1-monument'], 2);
  assert.equal(record.fate, '3');
  assert.equal(control(panel, 'tradeRoute0').children.find(option => option.value === 'trireme-to-monument').textContent,
    '3 船材（库存 6） → 1 石筑（库存 2）');
  assert.match(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c1.state.notes, /兑换：3 船材 → 1 石筑 ×1；1 石筑 → 1 船材 ×1/);
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-status').textContent, /交易已完成.*冷却/);
}));

test('trade quantities multiply beyond three while stock still guards execution', () => withPanelDocument(async () => {
  const rule = realRules.catalog.find(item => item.key === 'superior trading solutions');
  const f = realFixture(rule.key, rule.actions[0]);
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  assert.equal(control(panel, 'tradeCount0').max, undefined, 'the quantity multiplier is not capped by the three-category limit');
  assert.match(findNode(panel, node => node.className === 'structure-tech-trade-hint').textContent, /任意倍率.*最多选择 3 类/);
  change(control(panel, 'tradeRoute0'), 'trireme-to-monument');
  change(control(panel, 'tradeCount0'), '4');
  const button = findNode(panel, node => node.className === 'structure-tech-action-use');
  const preview = findNode(panel, node => node.className === 'structure-tech-action-preview');
  assert.equal(button.disabled, true);
  assert.match(preview.textContent, /船材不足/);
  assert.doesNotMatch(preview.textContent, /最多选择 3 类/, 'four of the same exchange are one category, not four');
  change(control(panel, 'tradeCount0'), '2');
  change(control(panel, 'tradeRoute1'), 'trireme-to-armament');
  change(control(panel, 'tradeCount1'), '2');
  assert.equal(button.disabled, true);
  assert.match(preview.textContent, /船材不足/);
  await button.listeners.click();
  assert.equal(f.state.posts.length, 0);
  assert.equal(f.state.campaign.sections.record.users.chosen.fate, '2');
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c1-trireme'], 8);
}));

test('development exchanges allow quantities above three without fate or cooldown', () => withPanelDocument(async () => {
  const rule = realRules.catalog.find(item => item.key === 'temenos project');
  const action = rule.actions[0], route = action.tradeRoutes[0];
  const f = realFixture(rule.key, action);
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  const count = control(panel, 'tradeCount0');
  assert.equal(count.max, undefined, 'the quantity input must not impose a three-exchange limit');
  assert.match(findNode(panel, node => node.className === 'structure-tech-trade-lines').children[0].textContent, /按下列顺序兑换/);
  change(control(panel, 'tradeRoute0'), route.id); change(count, '4');
  assert.equal(control(panel, 'developmentConfirmed'), undefined);
  assert.doesNotMatch(panel.textContent, /当前正在发展阶段/);
  control(panel, 'story2aConfirmed').checked = true;
  control(panel, 'story2aConfirmed').listeners.change();
  const preview = findNode(panel, node => node.className === 'structure-tech-action-preview');
  assert.match(preview.textContent, /舰材 -4.*×4/);
  assert.doesNotMatch(preview.textContent, /命运 \+1|到期：|恢复：|至多 3/);
  const button = findNode(panel, node => node.className === 'structure-tech-action-use');
  assert.equal(button.disabled, false); assert.equal(button.textContent, '执行交易');
  await button.listeners.click();
  const record = f.state.campaign.sections.record.users.chosen;
  assert.equal(record.resources['c2-warTrireme'], 0);
  assert.equal(record.resources[route.gains[0].storageKey], 4);
  assert.equal(record.fate, '2');
  assert.equal(f.state.posts.length, 1);
  const event = Object.values(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state.techAutomation.events)[0];
  assert.equal(event.skipTimeline, true);
}));

test('ordered trade rows may spend the preceding exchange gain and still commit only once', () => withPanelDocument(async () => {
  const rule = realRules.catalog.find(item => item.key === 'superior trading solutions');
  const f = realFixture(rule.key, rule.actions[0]);
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  change(control(panel, 'tradeRoute0'), 'trireme-to-monument');
  change(control(panel, 'tradeRoute1'), 'monument-to-trireme');
  // The same category cannot occupy two rows: choosing it again moves it.
  change(control(panel, 'tradeRoute2'), 'monument-to-trireme');
  assert.equal(control(panel, 'tradeRoute1').value, '');
  assert.equal(control(panel, 'tradeCount1').value, '0');
  assert.equal(control(panel, 'tradeCount2').value, '1');
  const button = findNode(panel, node => node.className === 'structure-tech-action-use');
  assert.equal(button.disabled, false);
  await button.listeners.click();
  assert.equal(f.state.posts.length, 1);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c1-trireme'], 6);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c1-monument'], 0);
}));

test('the panel retains an operation id for retry after a lost connection', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const engine = { ...rules, listActions: () => [{ id: 'study', techKey: 'laboratory', label: '实验室', available: true }] };
    const f = fixture({ rules: engine });
    const panel = f.client.createActionPanel(f.target);
    await panel.ready;
    const clientSubmit = f.client.submit;
    const ids = [];
    f.client.submit = async target => {
      ids.push(target.operationId);
      if (ids.length === 1) throw new Error('offline');
      return clientSubmit(target);
    };
    const button = findNode(panel, node => node.className === 'structure-tech-action-use');
    await button.listeners.click();
    await button.listeners.click();
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1]);
    assert.equal(f.state.posts.length, 1);
  } finally { global.document = previous; }
});

test('out-of-order panel refreshes cannot replace the newest preview context', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const engine = { ...rules, listActions: () => [{ id: 'study', techKey: 'laboratory', label: '实验室', available: true }] };
    const f = fixture({ rules: engine });
    const context = await f.client.load(f.target);
    const panel = f.client.createActionPanel({ ...f.target, context });
    await panel.ready;
    let resolveOld;
    f.client.load = () => new Promise(resolve => { resolveOld = resolve; });
    const oldRefresh = panel.refresh();
    await panel.refresh({ ...context, day: 10 });
    resolveOld(context);
    await oldRefresh;
    assert.equal(panel.context.day, 10);
    assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /Day 13/);
    let submitted;
    f.client.submit = async target => { submitted = target; throw new Error('stop after capture'); };
    await findNode(panel, node => node.className === 'structure-tech-action-use').listeners.click();
    assert.equal(submitted.expectedDay, 10, 'the click uses the visible preview context');
  } finally { global.document = previous; }
});

test('actual accelerated breeding retains its date lock after the due titan is stored', async () => {
  const rule = realRules.catalog.find(rule => rule.key === 'titan breeding');
  const f = realFixture(rule.key, rule.actions.find(action => action.id === 'breed-accelerated'));
  const submitted = await f.client.submit(f.target);
  const currentState = () => f.state.campaign.sections.dashboard.profiles.chosen.cycles[f.target.cycleId].state;
  currentState().day = 9;
  f.state.campaign.sectionRevisions.dashboard++;
  const completed = await f.client.complete(f.target);
  assert.equal(completed.operation.grant.applied, true);
  assert.match(currentState().notes, /已自动结算；.*自动结算：\+1 撼地者/);
  assert.deepEqual(f.state.campaign.sections.record.users.chosen.titans.map(titan => [titan.name, titan.count]),
    [['梦行者', 1], ['撼地者', 1]], 'the accelerated model is stored on its due date');
  await assert.rejects(f.client.submit({ ...f.target, operationId: 'second' }), { code: 'ABILITY_BUSY' });
  currentState().day = 16;
  f.state.campaign.sectionRevisions.dashboard++;
  await f.client.submit({ ...f.target, operationId: 'second' });
  assert.deepEqual(f.state.campaign.sections.record.users.chosen.titans.map(titan => titan.name), ['撼地者'], 'the final dreamwalker is spent');
  assert.equal(f.state.campaign.sections.record.users.chosen.fate, '4');
  assert.equal(submitted.operation.grant.name, '撼地者');
});

test('actual concurrent distinct operations cannot both pay for the same available ability', async () => {
  const rule = realRules.catalog.find(rule => rule.key === 'canal reconnaissance');
  const f = realFixture(rule.key, rule.actions[0]);
  const outcomes = await Promise.allSettled([
    f.client.submit(f.target), f.client.submit({ ...f.target, operationId: 'second' }),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.code, 'ABILITY_BUSY');
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c2-warTrireme'], 2);
  assert.equal(f.state.campaign.sections.record.users.chosen.fate, '3');
});

test('lost completion responses leave one completion log and never repay the original cost', async () => {
  const rule = realRules.catalog.find(rule => rule.key === 'canal reconnaissance');
  const f = realFixture(rule.key, rule.actions[0], { loseResponse: true });
  await f.client.submit(f.target);
  const state = f.state.campaign.sections.dashboard.profiles.chosen.cycles[f.target.cycleId].state;
  state.day = 8;
  f.state.campaign.sectionRevisions.dashboard++;
  const result = await f.client.complete(f.target);
  assert.equal(result.duplicate, true);
  await f.client.complete(f.target);
  assert.equal(f.state.posts.length, 2);
  assert.equal(f.state.campaign.sections.dashboard.profiles.chosen.cycles[f.target.cycleId].state.notes.split('\n').length, 3);
  assert.equal(f.state.campaign.sections.record.users.chosen.resources['c2-warTrireme'], 2);
  assert.equal(f.state.campaign.sections.map.users.chosen.cycles.c2.tokens.hsCount, 1);
  f.state.campaign.sections.map.users.chosen.cycles.c2.tokens.hsCount = 0;
  f.state.campaign.sectionRevisions.map++;
  await f.client.complete(f.target);
  assert.equal(f.state.campaign.sections.map.users.chosen.cycles.c2.tokens.hsCount, 0, 'replaying an old completed rebuild cannot resurrect a later lost ship');
});

test('the actual breeding panel previews the shadowdancer fourteen-day branch', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const rule = realRules.catalog.find(rule => rule.key === 'ultimate titan breeding');
    const f = realFixture(rule.key, rule.actions.find(action => action.id === 'breed'));
    const panel = f.client.createActionPanel(f.target);
    await panel.ready;
    const row = findNode(panel, node => node.className === 'structure-tech-action');
    assert.match(findNode(row, node => node.tagName === 'strong').textContent, /泰坦培育.*终极泰坦培育/);
    assert.equal(control(row, 'actionMode').value, 'breed');
    control(row, 'titanId').value = 'dream'; control(row, 'resultTitan').value = 'tt_shadowdancer';
    const confirmation = findNode(row, node => node.type === 'checkbox');
    if (confirmation) confirmation.checked = true;
    control(row, 'resultTitan').listeners.change();
    assert.match(findNode(row, node => node.className === 'structure-tech-action-preview').textContent, /影舞者.*Day 18/);
    await findNode(row, node => node.className === 'structure-tech-action-use').listeners.click();
    assert.equal(f.state.campaign.sections.dashboard.profiles.chosen.cycles[f.target.cycleId].state.techAutomation.events[Object.keys(f.state.campaign.sections.record.users.chosen.technologyActionReceipts)[0]].dueDay, 18);
  } finally { global.document = previous; }
});

test('permanent technology cannot bypass an unhandled older-cycle reward', async () => {
  const rule = realRules.catalog.find(rule => rule.key === 'grand stoa');
  const f = realFixture(rule.key, rule.actions[0]);
  await f.client.submit(f.target);
  const cycles = f.state.campaign.sections.dashboard.profiles.chosen.cycles;
  cycles.c3 = { state: { day: 1, notes: '', techAutomation: { version: 1, events: {} } } };
  f.state.campaign.sectionRevisions.dashboard++;
  const next = { ...f.target, cycleId: 'c3', operationId: 'new-cycle' };
  await assert.rejects(f.client.submit(next), { code: 'ABILITY_BUSY' });
  cycles.c2.state.day = 13;
  f.state.campaign.sectionRevisions.dashboard++;
  await f.client.complete(f.target);
  await f.client.submit(next);
  assert.equal(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c3.state.techAutomation.events['new-cycle'].dueDay, 10);
});

test('a panel rejects a cached context belonging to another profile', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const f = fixture();
    const context = await f.client.load(f.target);
    const panel = f.client.createActionPanel({ ...f.target, context: { ...context, profileId: 'other' } });
    await panel.ready;
    assert.match(findNode(panel, node => node.className === 'structure-tech-action-status').textContent, /不一致/);
    assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use'), undefined);
    assert.equal(f.state.posts.length, 0);
  } finally { global.document = previous; }
});

test('a successful write followed by refresh failure remains clearly saved and disables the stale button', async () => {
  const previous = global.document;
  global.document = fakeDocument();
  try {
    const engine = { ...rules, listActions: () => [{ id: 'study', techKey: 'laboratory', label: '实验室', available: true }] };
    const f = fixture({ rules: engine });
    const context = await f.client.load(f.target);
    const panel = f.client.createActionPanel({ ...f.target, context });
    await panel.ready;
    f.client.load = async () => { throw new Error('读取失败'); };
    const button = findNode(panel, node => node.className === 'structure-tech-action-use');
    await button.listeners.click();
    assert.equal(f.state.posts.length, 1);
    assert.equal(button.disabled, true);
    assert.match(findNode(panel, node => node.className === 'structure-tech-action-status').textContent, /安排已保存.*读取失败/);
  } finally { global.document = previous; }
});

function breedingFixture(extra = {}) {
  const rule = realRules.catalog.find(item => item.key === 'ultimate titan breeding');
  const f = realFixture(rule.key, rule.actions[0], extra);
  f.state.campaign.sections.technology.users.chosen.unlocked = [
    'titan breeding', 'advanced titan breeding', 'superior titan breeding', 'ultimate titan breeding',
  ];
  f.state.campaign.sections.record.users.chosen.titans[0].count = 4;
  return f;
}
async function withPanelDocument(run) {
  const previous = global.document;
  global.document = fakeDocument();
  try { await run(); } finally { global.document = previous; }
}

test('the Mnestis Thesis row reads its effect after the price and only reminds when no hero exists', () => withPanelDocument(async () => {
  const rule = realRules.catalog.find(item => item.key === 'mnestis thesis');
  const action = rule.actions[0];
  const f = realFixture(rule.key, action);
  f.target = { ...f.target, selection: {} };
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  const preview = () => findNode(panel, node => node.className === 'structure-tech-action-preview').textContent;
  assert.match(preview(), /\+1 命运 · 使其获得一个回忆节点/);
  assert.doesNotMatch(preview(), /请先在英雄记录表添加英雄|请完成选项/);
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, true);
  // Once a legal target is chosen the price comes from the recorded payment,
  // which reads "命运 +1"; the effect summary still follows it directly.
  change(control(panel, 'targetId'), 'h');
  assert.match(preview(), /命运 \+1 · 使其获得一个回忆节点 · 目标：奥德修斯 · 所选英雄任选一张回忆卡获得 \+1 回忆节点/);
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, false);

  const none = realFixture(rule.key, action);
  none.target = { ...none.target, selection: {} };
  none.state.campaign.sections.heroes.users.chosen.heroes = [];
  const emptyPanel = none.client.createActionPanel(none.target);
  await emptyPanel.ready;
  const emptyPreview = findNode(emptyPanel, node => node.className === 'structure-tech-action-preview').textContent;
  assert.match(emptyPreview, /\+1 命运 · 使其获得一个回忆节点 · 请先在英雄记录表添加英雄，再选择当前在役的阿尔戈英雄。/);
}));

test('ability titles open and close the real source card in a modal without using the ability', () => withPanelDocument(async () => {
  const rule = realRules.catalog.find(rule => rule.key === 'grand stoa');
  const f = realFixture(rule.key, rule.actions[0]);
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  const before = clone(f.state.campaign), reads = f.state.reads;
  assert.equal(findNode(panel, node => node.tagName === 'dialog'), undefined);
  const title = findNode(panel, node => node.className?.split(' ').includes('structure-tech-action-title'));
  assert.ok(title.className.split(' ').includes('flow-title-button'));
  assert.equal(title.type, 'button');
  title.listeners.click();
  const dialog = findNode(panel, node => node.tagName === 'dialog');
  assert.equal(dialog.open, true);
  assert.match(findNode(dialog, node => node.tagName === 'h3').textContent, /巨型柱廊.*科技卡图/);
  const card = dictionary.cards.find(card => card.key === rule.key);
  assert.equal(findNode(dialog, node => node.tagName === 'img').src, `/technology/${card.image.back}`);
  findNode(dialog, node => node.className === 'structure-tech-card-close').listeners.click();
  assert.equal(dialog.open, false);
  title.listeners.click();
  dialog.listeners.click({ target: dialog });
  assert.equal(dialog.open, false);
  assert.equal(findNodes(panel, node => node.tagName === 'dialog').length, 1);
  assert.deepEqual(f.state.campaign, before);
  assert.equal(f.state.posts.length, 0);
  assert.equal(f.state.reads, reads, 'viewing a card uses the cached source metadata');
}));

test('Argo Mission trade panel, source-card caption and saved use log all say Bridge Tholos', () => withPanelDocument(async () => {
  const rule = realRules.catalog.find(rule => rule.key === "argo's mission");
  const f = realFixture(rule.key, rule.actions[0]);
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  assert.match(panel.textContent, /圆桌舰桥/);
  assert.doesNotMatch(panel.textContent, /阿尔戈号的任务/);
  findNode(panel, node => node.className?.split(' ').includes('structure-tech-action-title')).listeners.click();
  const dialog = findNode(panel, node => node.tagName === 'dialog');
  assert.equal(findNode(dialog, node => node.tagName === 'figcaption').textContent, '圆桌舰桥');
  assert.equal(findNode(dialog, node => node.tagName === 'img').src,
    `/technology/${dictionary.cards.find(card => card.key === rule.key).image.back}`);
  const result = await f.client.submit(f.target);
  assert.equal(result.operation.techKey, "argo's mission");
  const saved = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c2.state;
  assert.match(saved.notes, /圆桌舰桥 · 贸易与 7 天冷却/);
  assert.doesNotMatch(saved.notes, /阿尔戈号的任务/);
}));

test('completing an old event uses its dark-side title in the new log while preserving hand-written notes', async () => {
  const rule = realRules.catalog.find(rule => rule.key === 'mnestis thesis');
  const f = realFixture(rule.key, rule.actions[0]);
  const scheduled = await f.client.submit(f.target);
  const saved = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c1.state;
  saved.notes = '玩家手写：记忆论题';
  saved.techAutomation.events.one.label = '记忆论题';
  saved.day = scheduled.operation.dueDay;
  await f.client.complete(f.target);
  assert.match(f.state.campaign.sections.dashboard.profiles.chosen.cycles.c1.state.notes,
    /^玩家手写：记忆论题\n.*已手动处理；阿尔戈英雄寝园/);
});

test('the breeding title modal shows all sources before selection and the matching source after a model change', () => withPanelDocument(async () => {
  const f = breedingFixture();
  const panel = f.client.createActionPanel({ ...f.target, techKey: undefined });
  await panel.ready;
  const before = clone(f.state.campaign);
  const title = findNode(panel, node => node.className?.split(' ').includes('structure-tech-action-title'));
  title.listeners.click();
  const dialog = findNode(panel, node => node.tagName === 'dialog');
  assert.equal(findNodes(dialog, node => node.tagName === 'img').length, 4);
  for (const [model, key] of [['tt_shadowdancer', 'ultimate titan breeding'], ['tt_earthshaker', 'titan breeding']]) {
    dialog.close();
    change(control(panel, 'resultTitan'), model);
    title.listeners.click();
    const images = findNodes(dialog, node => node.tagName === 'img');
    assert.equal(images.length, 1);
    assert.equal(images[0].src, `/technology/${dictionary.cards.find(card => card.key === key).image.back}`);
    assert.equal(dialog.open, true);
  }
  assert.deepEqual(f.state.campaign, before);
  assert.equal(f.state.posts.length, 0);
}));

test('the breeding family selects a titan from every unlocked model before showing its cost and speed', () => withPanelDocument(async () => {
  const f = breedingFixture();
  const panel = f.client.createActionPanel({ ...f.target, techKey: undefined });
  await panel.ready;
  const rows = findNodes(panel, node => node.className === 'structure-tech-action');
  assert.equal(rows.length, 1, 'eight atomic actions share a single family form');
  assert.equal(rows[0].dataset.groupId, 'titan-breeding');
  assert.equal(control(panel, 'techSource'), undefined);
  const model = control(panel, 'resultTitan');
  assert.equal(model.value, '');
  assert.equal(model.children.length, 14, 'all thirteen unlocked models share one selector');
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /请选择要生产的泰坦/);
  assert.equal(control(panel, 'actionMode').value, 'breed');
  assert.equal(control(panel, 'actionMode').children.length, 2);
  assert.ok(model.children.some(node => node.value === 'tt_shadowdancer'));
  assert.ok(model.children.some(node => node.value === 'tt_earthshaker'));
  change(model, 'tt_shadowdancer');
  change(control(panel, 'titanId'), 'dream');
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /终极泰坦培育.*梦行者.*Day 18/);
}));

test('models from a disabled source explain their condition and cannot charge the usable source instead', () => withPanelDocument(async () => {
  const f = breedingFixture();
  f.state.campaign.sections.record.users.chosen.explorationDelays = { disabledTechs: { c5: { 'ultimate titan breeding': {} } } };
  const panel = f.client.createActionPanel({ ...f.target, techKey: undefined });
  await panel.ready;
  const model = control(panel, 'resultTitan');
  assert.match(model.children.find(node => node.value === 'tt_shadowdancer').textContent, /禁用/);
  change(model, 'tt_shadowdancer');
  change(control(panel, 'titanId'), 'dream');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, true);
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /禁用/);
  change(model, 'tt_returner');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, false);
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /德尔菲/);
}));

test('changing the produced titan selects its real source and preserves the sacrifice and selected speed', () => withPanelDocument(async () => {
  const f = breedingFixture();
  const panel = f.client.createActionPanel({ ...f.target, techKey: undefined });
  await panel.ready;
  change(control(panel, 'titanId'), 'dream'); change(control(panel, 'resultTitan'), 'tt_shadowdancer');
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /Day 18/);
  change(control(panel, 'actionMode'), 'breed-accelerated');
  change(control(panel, 'resultTitan'), 'tt_earthshaker');
  assert.equal(control(panel, 'titanId').value, 'dream');
  assert.equal(control(panel, 'resultTitan').value, 'tt_earthshaker');
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /命运 \+1.*撼地者.*Day 9.*Day 16/);
  await findNode(panel, node => node.className === 'structure-tech-action-use').listeners.click();
  const state = f.state.campaign.sections.dashboard.profiles.chosen.cycles.c5.state;
  const [event] = Object.values(state.techAutomation.events);
  assert.equal(event.techKey, 'titan breeding');
  assert.equal(event.actionId, 'breed-accelerated');
  assert.equal(event.selection.resultTitan, 'tt_earthshaker');
  assert.equal(event.dueDay, 9);
  assert.equal(event.cooldownUntilDay, 16);
  assert.equal(f.state.campaign.sections.record.users.chosen.fate, '3');
  change(control(panel, 'resultTitan'), 'tt_shadowdancer');
  change(control(panel, 'titanId'), 'dream');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, false, 'using a lower source does not lock other cards');
}));

test('merged source forms preserve separate reward and cooldown locks for each card', () => withPanelDocument(async () => {
  const f = breedingFixture();
  const target = { ...f.target, actionId: 'breed-accelerated' };
  await f.client.submit({ ...target, techKey: 'titan breeding', operationId: 'lower', selection: { titanId: 'dream', resultTitan: 'tt_earthshaker' } });
  await f.client.submit({ ...target, operationId: 'higher', selection: { titanId: 'dream', resultTitan: 'tt_shadowdancer' } });
  const state = () => f.state.campaign.sections.dashboard.profiles.chosen.cycles.c5.state;
  state().day = 9; f.state.campaign.sectionRevisions.dashboard++;
  await f.client.complete({ ...target, techKey: 'titan breeding', operationId: 'lower' });
  const panel = f.client.createActionPanel({ ...f.target, techKey: undefined });
  await panel.ready;
  change(control(panel, 'resultTitan'), 'tt_earthshaker');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, true, 'completed reward keeps its cooldown lock');
  state().day = 16; f.state.campaign.sectionRevisions.dashboard++;
  await panel.refresh();
  change(control(panel, 'resultTitan'), 'tt_shadowdancer');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, true, 'expired cooldown keeps the unhandled reward lock');
  change(control(panel, 'resultTitan'), 'tt_earthshaker');
  change(control(panel, 'titanId'), 'dream');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, false, 'both lower-card locks have cleared independently');
}));

function groupedEngine() {
  const actions = [
    { id: 'study', techKey: 'lower', title: '初阶', label: '研究', tier: 1, available: true },
    { id: 'study', techKey: 'higher', title: '高阶', label: '研究', tier: 2, available: true },
  ];
  return { ...rules, listActionGroups: () => [{ id: 'research', title: '研究', actions }] };
}

test('an offline retry keeps its identity only for the same source, action and selections', () => withPanelDocument(async () => {
  const f = fixture({ rules: groupedEngine() });
  f.state.campaign.sections.technology.users.chosen.unlocked = ['lower', 'higher'];
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  const requests = [];
  f.client.submit = async target => { requests.push(target); throw new Error('offline'); };
  const button = findNode(panel, node => node.className === 'structure-tech-action-use');
  await button.listeners.click(); await button.listeners.click();
  assert.equal(requests[0].operationId, requests[1].operationId, 'same source retries reuse the id');
  change(control(panel, 'techSource'), 'lower');
  await button.listeners.click();
  assert.equal(requests[2].techKey, 'lower');
  assert.notEqual(requests[1].operationId, requests[2].operationId, 'changing source starts a different operation');
  change(control(panel, 'techSource'), 'higher');
  await button.listeners.click();
  assert.notEqual(requests[2].operationId, requests[3].operationId, 'returning to a source cannot reuse the other source id');
}));

test('produced titan and speed controls are disabled while a grouped request is saving', () => withPanelDocument(async () => {
  const f = breedingFixture();
  const panel = f.client.createActionPanel({ ...f.target, techKey: undefined });
  await panel.ready;
  change(control(panel, 'titanId'), 'dream'); change(control(panel, 'resultTitan'), 'tt_shadowdancer');
  let rejectSubmit, submitted;
  f.client.submit = target => { submitted = target; return new Promise((resolve, reject) => { rejectSubmit = reject; }); };
  const model = control(panel, 'resultTitan'), mode = control(panel, 'actionMode');
  const button = findNode(panel, node => node.className === 'structure-tech-action-use');
  const pending = button.listeners.click();
  await Promise.resolve();
  assert.equal(model.disabled, true);
  assert.equal(mode.disabled, true);
  assert.equal(control(panel, 'titanId').disabled, true);
  change(model, 'tt_earthshaker'); change(mode, 'breed-accelerated');
  assert.equal(model.value, 'tt_shadowdancer');
  assert.equal(mode.value, 'breed');
  assert.equal(submitted.techKey, 'ultimate titan breeding');
  assert.equal(submitted.actionId, 'breed');
  assert.equal(control(panel, 'resultTitan').value, 'tt_shadowdancer');
  rejectSubmit(new Error('offline'));
  await pending;
  assert.equal(model.disabled, false);
  assert.equal(mode.disabled, false);
}));

test('a mode-specific default selects the available mode when ordinary use is unavailable', () => withPanelDocument(async () => {
  const engine = groupedEngine();
  engine.listActionGroups = () => [{ id: 'research', title: '研究', actions: [
    { id: 'breed', techKey: 'laboratory', title: '实验室', label: '普通', tier: 1, available: false, reason: '普通不可用' },
    { id: 'breed-accelerated', techKey: 'laboratory', title: '实验室', label: '加速', tier: 1, available: true },
  ] }];
  const f = fixture({ rules: engine });
  const panel = f.client.createActionPanel(f.target);
  await panel.ready;
  assert.equal(control(panel, 'actionMode').value, 'breed-accelerated');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, false);
  change(control(panel, 'actionMode'), 'breed');
  assert.equal(findNode(panel, node => node.className === 'structure-tech-action-use').disabled, true);
  assert.match(findNode(panel, node => node.className === 'structure-tech-action-preview').textContent, /普通不可用/);
}));
