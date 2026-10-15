const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
function library() {
  const window = { location: { href: 'http://local/record/index.html' } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/campaign-notes.js'), 'utf8'), { window, URL });
  return window.ATO_CAMPAIGN_NOTES;
}
const notes = library();
const description = (...args) => clone(notes.describe(...args));
const text = events => events.map(e => e.text).join('\n');

test('record writes resources, matrix, adventure, diplomacy and per-cycle notes exactly once', () => {
  const before = { cycle: 'c2', resources: { trireme: 1 }, matrix: {}, adventures: {}, diplomacy: {}, notes: '旧笔记', cycleStats: { c2: { notes: '旧笔记' } } };
  const after = { ...clone(before), resources: { trireme: 3, 'c1-core': 2 }, matrix: { 'c2-A1': true }, adventures: { 'c2-0-alpha': true }, diplomacy: { 'c2-minoians': 1 }, notes: '新笔记', cycleStats: { c2: { notes: '新笔记' } } };
  const events = description('record', before, after);
  assert.match(text(events), /船材：1 → 3/);
  for (const label of ['选择矩阵', '冒险', '外交']) assert.ok(text(events).includes(label));
  assert.equal(text(events).match(/新笔记/g).length, 1);
  assert.ok(events.some(e => e.cycleId === 'c1' && e.text.includes('核心')));
});

test('record cycle aliases and automatic sync log do not produce misleading events', () => {
  const before = { cycle: 'c1', notes: '甲', fate: 2, cycleStats: { c1: { notes: '甲', fate: 2 }, c2: { notes: '乙', fate: 3 } } };
  const after = { ...clone(before), cycle: 'c2', notes: '乙', fate: 3, syncLog: '自动同步', matrixLocked: true };
  assert.deepEqual(description('record', before, after), []);
});

test('manufacturing and manual inventory changes retain material and quantity details', () => {
  const events = description('record', { resources: { armament: 4 }, arsenal: { AJ001: { quantity: 1, manufactured: 0 } } },
    { resources: { armament: 2 }, arsenal: { AJ001: { quantity: 2, manufactured: 1 } } }, { cycleId: 'c1', source: '科技' });
  assert.match(text(events), /军备：4 → 2/);
  assert.match(text(events), /持有数量：1 → 2/);
  assert.match(text(events), /制造总数：0 → 1/);
  assert.equal(events[0].source, '科技·记录表');
});

test('technology records unlocks, relocks and conditions while ignoring display settings', () => {
  const before = { unlocked: ['a', 'b'], conditions: [], unimportant: [], treeLanguage: 'en' };
  const after = { ...before, unlocked: ['b', 'c'], conditions: ['condition'], treeLanguage: 'zh', hideUnknownTech: false };
  const events = description('technology', before, after, { label: (_s, key) => ({ a: '旧科技', c: '新科技' })[key] });
  assert.match(text(events), /移除 旧科技/);
  assert.match(text(events), /添加 新科技/);
  assert.match(text(events), /科技条件/);
  assert.doesNotMatch(text(events), /Language|hide/);
  assert.deepEqual(description('technology', after, { ...after, treeLanguage: 'en' }), []);
});

test('hero events cover skills, memories, tags, notes, recruitment and retirement', () => {
  const hero = { id: 'h1', name: '测试英雄', baseSkills: { courage: 1 }, mnemos: { c1: [] }, mnemosTags: {}, notes: '' };
  const updated = { ...hero, baseSkills: { courage: 2 }, mnemos: { c1: ['c1_00'] }, mnemosTags: { voyage: true }, notes: '下次提醒' };
  const events = description('heroes', { heroes: [hero] }, { heroes: [updated] });
  for (const value of ['测试英雄', '勇气：1 → 2', 'c1_00', '回忆标签', '下次提醒']) assert.ok(text(events).includes(value));
  assert.match(text(description('heroes', { heroes: [] }, { heroes: [hero] })), /添加 测试英雄/);
  assert.match(text(description('heroes', { heroes: [hero] }, { heroes: [], graveyard: [{ ...hero, retireReason: '牺牲' }] })), /墓园：添加 测试英雄（牺牲）/);
  assert.deepEqual(description('heroes', { heroes: [hero], activeHeroId: 'h1' }, { heroes: [{ ...hero, skillsExpanded: true }], activeHeroId: '' }), []);
});

test('story records reading without recording body text or image/language toggles', () => {
  const entry = { bookId: 'c1', entryKey: '001', bookTitle: '故事书', id: '001', title: '开端', text: '完整故事不应写进日志' };
  assert.match(text(description('story', null, entry)), /阅读 故事书 · 001 · 开端/);
  assert.doesNotMatch(text(description('story', null, entry)), /完整故事/);
  assert.deepEqual(description('story', entry, { ...entry, bookTitle: 'Storybook', title: 'Start', text: '翻译', imagesOnly: true }), []);
  assert.match(text(description('story', entry, { ...entry, entryKey: '002', id: '002' })), /阅读/);
});

test('AIBP records card draws, wounds and counters, and ignores dragging and refreshed images', () => {
  const before = { apostle: 'HEKATON', title: '百臂巨人', level: 'I', aiPending: null, damageSummary: { wounds: 1 }, damage: [], tokens: [{ file: 'rage.png', count: 1, x: 0 }] };
  const after = { ...before, aiPending: { id: 'AI1', label: '重击' }, damageSummary: { wounds: 2 }, tokens: [{ file: 'rage.png', count: 2, x: 50 }] };
  const events = description('aibp', before, after);
  assert.match(text(events), /AI 抽牌：重击/);
  assert.match(text(events), /伤口：1 → 2/);
  assert.match(text(events), /rage.png：1 → 2/);
  assert.deepEqual(description('aibp', after, { ...after, tokens: [{ file: 'rage.png', count: 2, x: 99 }], updatedAt: 'now', extraCards: ['image'] }), []);
});

function campaign() {
  return { sections: { dashboard: { activeProfileId: 'A', profiles: {
    A: { activeCycleId: 'c2', cycles: { c2: { state: { day: 7, notes: '手写内容' } } } },
    B: { activeCycleId: 'c1', cycles: {} },
  } }, record: { users: { A: { cycle: 'c2', resources: { trireme: 1 } }, B: { cycle: 'c1', resources: { trireme: 4 } } } } }, sectionRevisions: { record: 3, dashboard: 5 } };
}
const response = (status, payload) => ({ ok: status === 200, status, json: async () => clone(payload) });
test('transport attaches notes to the same write and compares against committed state on retry', async () => {
  const current = campaign();
  const posts = [];
  const fetch = notes.createFetch(async (_url, init) => {
    if (!init?.method) return response(200, { ok: true, user: { id: 'login-A' }, campaign: current });
    const payload = JSON.parse(init.body); posts.push(payload);
    current.sections.record.users.A = payload.state;
    return response(200, { ok: true });
  });
  const body = { section: 'record', userId: 'A', state: { cycle: 'c2', resources: { trireme: 2 } }, expectedRevision: 3, expectedAccountId: 'login-A' };
  await fetch('../api/campaign-state.php', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(posts[0].campaignNotes.profileId, 'A');
  assert.match(text(posts[0].campaignNotes.entries), /船材：1 → 2/);
  await fetch('../api/campaign-state.php', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(posts[1].campaignNotes, undefined);
});

test('transport preserves the saved profile and prevents stale-login writes', async () => {
  let posts = 0;
  const fetch = notes.createFetch(async (_url, init) => {
    if (init?.method) { posts++; return response(200, { ok: true }); }
    return response(200, { ok: true, user: { id: 'login-A' }, campaign: campaign() });
  });
  const body = { section: 'record', userId: 'B', state: { cycle: 'c1', resources: { trireme: 5 } }, expectedRevision: 3, expectedAccountId: 'login-B' };
  await assert.rejects(fetch('../api/campaign-state.php', { method: 'POST', body: JSON.stringify(body) }), e => e.code === 'ACCOUNT_MISMATCH');
  assert.equal(posts, 0);
});

test('transport journals the originating profile even after the dashboard changes selection', async () => {
  let sent;
  const fetch = notes.createFetch(async (_url, init) => {
    if (init?.method) { sent = JSON.parse(init.body); return response(200, { ok: true }); }
    return response(200, { ok: true, user: { id: 'login-A' }, campaign: campaign() });
  }, { context: () => ({ cycleId: 'c2' }) });
  await fetch('../api/campaign-state.php', { method: 'POST', body: JSON.stringify({ section: 'record', userId: 'B',
    state: { cycle: 'c1', resources: { trireme: 5 } }, expectedRevision: 3, expectedAccountId: 'login-A' }) });
  assert.equal(sent.campaignNotes.profileId, 'B');
  assert.equal(sent.campaignNotes.entries[0].cycleId, 'c1');
  assert.match(text(sent.campaignNotes.entries), /船材：4 → 5/);
});

test('stale revisions and non-save requests retain existing transport behavior', async () => {
  const posts = [];
  const fetch = notes.createFetch(async (url, init) => {
    if (init?.method) { posts.push(JSON.parse(init.body)); return response(409, { code: 'SAVE_CONFLICT' }); }
    return response(200, { ok: true, user: { id: 'login-A' }, campaign: campaign() });
  });
  await fetch('../api/campaign-state.php', { method: 'POST', body: JSON.stringify({ section: 'record', userId: 'A', state: {}, expectedRevision: 0 }) });
  assert.equal(posts[0].campaignNotes, undefined);
  await fetch('../api/campaign-state.php?action=import-sections', { method: 'POST', body: JSON.stringify({ sections: {} }) });
  assert.deepEqual(posts[1], { sections: {} });
});

test('dashboard merges appended module events with simultaneous manual editing', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const fn = source.match(/^    function mergeDashboardChanges\([^]*?^    }/m)[0];
  const context = vm.createContext({ jsonEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b), cloneJson: value => value,
    isPlainObject: value => value && typeof value === 'object' && !Array.isArray(value) });
  vm.runInContext(fn, context);
  const result = context.mergeDashboardChanges('原文', '手动修改', '原文\n[AIBP] 抽牌', 'profiles.A.cycles.c2.state.notes');
  assert.equal(result.value, '手动修改\n[AIBP] 抽牌');
  assert.equal(result.conflicts.length, 0);
});

test('every module loads the shared library before configuring its saves; inline scripts parse', () => {
  for (const module of ['record', 'technology', 'hero', 'aibp', 'story']) {
    const html = fs.readFileSync(path.join(root, module, 'index.html'), 'utf8');
    assert.ok(html.includes('../assets/campaign-notes.js'), module);
    for (const match of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([^]*?)<\/script>/g)) new vm.Script(match[1], { filename: module });
  }
});
