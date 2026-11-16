const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const functions = ['heroProgressTarget', 'assertHeroProgressTarget', 'readLatestHeroState',
  'applyMnemosTagToHeroes', 'confirmMnemosTagForHeroes', 'applyHeroProgressChanges', 'saveHeroMnemosToServer'].map(name => {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}).join('\n');
const hero = { id: 'A', mnemos: { c1: ['c1_00'] }, mnemosProgress: { c1_00: 2 },
  fatedMnemos: { c1: ['fm_a'] }, fatedProgress: { fm_a: 1 }, notes: 'original' };
const promptSnapshot = { heroes: [hero], activeHeroId: 'A', graveyard: [] };
const progress = [{ heroId: 'A', type: 'mnemos', cardId: 'c1_00', max: 10 }];

function harness(initial, beforePost = () => {}) {
  let server = clone(initial), revision = 7;
  const posts = [], warnings = [], alerts = [], caches = [], broadcasts = [];
  const scope = vm.createContext({
    cloneJson: clone, isPlainObject: value => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    readServerHeroStateForUpdate: async () => ({ state: clone(server), revision, userId: 'owner' }),
    sessionUser: { id: 'owner' }, campaignSessionEpoch: 1, readLocalHeroState: () => null,
    accountMismatchError: () => Object.assign(new Error('Account changed'), { code: 'ACCOUNT_MISMATCH' }),
    window: { alert: message => alerts.push(message) }, confirm: () => true,
    MNEMOS_TAG_ZH: {}, HERO_CYCLES: ['c1'], HERO_MNEMOS_GROUPS: ['c1'],
    MNEMOS_CARD_TAGS: { c1_00: ['voyage'], c1_01: ['voyage'] }, FATED_CARD_TAGS: { fm_a: ['fate'] },
    MNEMOS_CARD_NAMES: {}, FATED_CARD_NAMES: {}, mnemosTrackLength: () => 10,
    localStorage: { setItem: (key, value) => caches.push(JSON.parse(value)) }, HERO_STORAGE_KEY: 'heroes',
    heroMnemosSyncChannel: { postMessage: value => broadcasts.push(value) },
    console: { warn: error => warnings.push(error) },
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body);
      posts.push(payload);
      assert.equal(payload.expectedAccountId, 'owner');
      const replacement = beforePost(posts.length, clone(server));
      if (replacement) { server = clone(replacement); revision++; }
      if (payload.expectedRevision !== revision) return {
        ok: false, status: 409, json: async () => ({ ok: false, code: 'SAVE_CONFLICT' }),
      };
      server = payload.state;
      revision++;
      return { ok: true, status: 200, json: async () => ({ ok: true, revision, user: { id: 'owner' } }) };
    },
  });
  vm.runInContext('let mnemosTagApplication = Promise.resolve();\n' + functions, scope);
  return { scope, posts, warnings, alerts, caches, broadcasts, saved: () => clone(server) };
}

test('tied regular Mnemos cards let each player choose one, with Fated rewards included', async () => {
  const initial = clone(promptSnapshot);
  const first = initial.heroes[0];
  first.mnemos.c1.push('c1_01');
  first.mnemosProgress.c1_01 = 2;
  initial.heroes.push({ ...clone(first), id: 'B', fatedMnemos: {} });
  const h = harness(initial);
  h.scope.FATED_CARD_TAGS.fm_a.push('voyage');
  h.scope.confirm = () => assert.fail('tied cards must use the card picker');
  h.scope.chooseMnemosProgress = (source, rows) => {
    assert.deepEqual(clone(rows.map(row => row.cards.map(card => card.change.cardId))),
      [['c1_00', 'c1_01'], ['fm_a'], ['c1_00', 'c1_01']]);
    return [rows[0].cards[1].change, rows[1].cards[0].change, rows[2].cards[0].change];
  };
  await h.scope.applyMnemosTagToHeroes('voyage', 'hub', 'box');
  const [a, b] = h.saved().heroes;
  assert.deepEqual(a.mnemosProgress, { c1_00: 2, c1_01: 3 });
  assert.deepEqual(a.fatedProgress, { fm_a: 2 });
  assert.deepEqual(b.mnemosProgress, { c1_00: 3, c1_01: 2 });
  assert.equal(h.posts.length, 1);
});

test('canceling a tied selection skips all rewards, and queued rewards use the latest progress', async () => {
  const initial = clone(promptSnapshot);
  initial.heroes[0].mnemos.c1.push('c1_01');
  initial.heroes[0].mnemosProgress.c1_01 = 2;
  const h = harness(initial);
  h.scope.FATED_CARD_TAGS.fm_a.push('voyage');
  h.scope.chooseMnemosProgress = () => null;
  await h.scope.applyMnemosTagToHeroes('voyage', 'hub', 'box');
  assert.equal(h.posts.length, 0);

  let prompts = 0;
  h.scope.chooseMnemosProgress = (source, rows) => {
    prompts++;
    return [rows[0].cards[1].change, rows[1].cards[0].change];
  };
  const first = h.scope.applyMnemosTagToHeroes('voyage', 'hub', 'box');
  const second = h.scope.applyMnemosTagToHeroes('voyage', 'hub', 'box');
  await Promise.all([first, second]);
  assert.equal(prompts, 1);
  assert.deepEqual(h.saved().heroes[0].mnemosProgress, { c1_00: 2, c1_01: 4 });
  assert.deepEqual(h.saved().heroes[0].fatedProgress, { fm_a: 3 });
});

test('a card removed before confirmation is not written back as stray progress', async () => {
  const latest = clone(promptSnapshot);
  latest.heroes[0].mnemos.c1 = [];
  latest.heroes[0].mnemosProgress = {};
  const h = harness(latest);
  assert.equal(await h.scope.saveHeroMnemosToServer(promptSnapshot, progress), true);
  assert.deepEqual(h.saved(), latest);
});

for (const type of ['mnemos', 'fated']) test(`${type} progress never restores a hero retired after the prompt`, async () => {
  const retired = { ...clone(hero), retireReason: 'dead', retiredAt: '2026-10-18' };
  const initial = { heroes: [], activeHeroId: '', graveyard: [retired] };
  const h = harness(initial);
  const change = type === 'mnemos' ? progress : [{ heroId: 'A', type, cardId: 'fm_a', max: 3 }];
  assert.equal(await h.scope.saveHeroMnemosToServer(clone(promptSnapshot), change), true);
  assert.deepEqual(h.saved(), initial);
  assert.equal(h.warnings.length, 0);
});

test('progress never restores a hero deleted after the prompt', async () => {
  const initial = { heroes: [], activeHeroId: '', graveyard: [] };
  const h = harness(initial);
  assert.equal(await h.scope.saveHeroMnemosToServer(clone(promptSnapshot), progress), true);
  assert.deepEqual(h.saved(), initial);
});

test('a conflict retry respects a concurrent retirement and preserves the replacement hero', async () => {
  const replacement = { heroes: [{ id: 'B', notes: 'new hero' }], activeHeroId: 'B',
    graveyard: [{ ...clone(hero), retireReason: 'retired' }] };
  const h = harness(promptSnapshot, attempt => attempt === 1 ? replacement : null);
  assert.equal(await h.scope.saveHeroMnemosToServer(clone(promptSnapshot), progress), true);
  assert.equal(h.posts.length, 2);
  assert.equal(h.posts[1].expectedRevision, 8);
  assert.deepEqual(h.saved(), replacement);
});

test('surviving heroes advance from the latest progress without overwriting remote edits', async () => {
  const latest = clone(promptSnapshot);
  latest.heroes[0].mnemosProgress.c1_00 = 5;
  latest.heroes[0].notes = 'remote edit';
  latest.heroes.push({ id: 'B', notes: 'keep' });
  latest.activeHeroId = 'B';
  const h = harness(latest);
  const before = clone(promptSnapshot);
  assert.equal(await h.scope.saveHeroMnemosToServer(promptSnapshot, progress), true);
  assert.equal(h.saved().heroes[0].mnemosProgress.c1_00, 6);
  assert.equal(h.saved().heroes[0].notes, 'remote edit');
  assert.deepEqual(h.saved().heroes[1], latest.heroes[1]);
  assert.equal(h.saved().activeHeroId, 'B');
  assert.deepEqual(promptSnapshot, before, 'the earlier prompt snapshot remains unchanged');
});

for (const change of ['logout', 'different account', 'same account new session']) {
  test(`an in-flight progress read cannot save after ${change}`, async () => {
    const h = harness(promptSnapshot);
    let finishRead;
    h.scope.readServerHeroStateForUpdate = () => new Promise(resolve => { finishRead = resolve; });
    const saving = h.scope.saveHeroMnemosToServer(promptSnapshot, progress);
    h.scope.sessionUser = change === 'logout' ? null : { id: change === 'different account' ? 'other' : 'owner' };
    h.scope.campaignSessionEpoch++;
    finishRead({ state: clone(promptSnapshot), revision: 7, userId: 'owner' });
    assert.equal(await saving, false);
    assert.equal(h.posts.length, 0);
    assert.equal(h.caches.length, 0);
    assert.equal(h.broadcasts.length, 0);
  });
}

test('a read belonging to another account is rejected before showing the progress prompt', async () => {
  const h = harness(promptSnapshot);
  let prompts = 0;
  h.scope.confirm = () => { prompts++; return true; };
  h.scope.readServerHeroStateForUpdate = async () => ({ state: clone(promptSnapshot), revision: 7, userId: 'other' });
  await h.scope.applyMnemosTagToHeroes('voyage', 'hub', 'box');
  assert.equal(prompts, 0);
  assert.equal(h.posts.length, 0);
  assert.equal(h.caches.length, 0);
  assert.equal(h.alerts.length, 1);
});

test('a failed automatic increment reports failure without publishing phantom local progress', async () => {
  const h = harness(promptSnapshot);
  let rejectWrite;
  h.scope.fetch = () => new Promise((resolve, reject) => { rejectWrite = reject; });
  const applying = h.scope.applyMnemosTagToHeroes('voyage', 'hub', 'box');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.caches.length, 0);
  assert.equal(h.broadcasts.length, 0);
  rejectWrite(new Error('Network disconnected'));
  await applying;
  assert.equal(h.saved().heroes[0].mnemosProgress.c1_00, 2);
  assert.equal(h.caches.length, 0);
  assert.equal(h.broadcasts.length, 0);
  assert.match(h.alerts[0], /保存未确认/);
});

test('confirmed increments update a clean cache but preserve unrelated unsaved hero edits', async () => {
  for (const dirty of [false, true]) {
    const h = harness(promptSnapshot);
    h.scope.readLocalHeroState = () => ({ ...clone(promptSnapshot), _dirty: dirty });
    await h.scope.applyMnemosTagToHeroes('voyage', 'hub', 'box');
    assert.equal(h.saved().heroes[0].mnemosProgress.c1_00, 3);
    assert.equal(h.caches.length, dirty ? 0 : 1);
    if (!dirty) assert.equal(h.caches[0].heroes[0].mnemosProgress.c1_00, 3);
    assert.equal(h.broadcasts.length, 1);
  }
});

test('late success after switching account never overwrites the new local hero cache', async () => {
  const h = harness(promptSnapshot);
  let finishPost, posted;
  h.scope.fetch = (url, options) => {
    posted = JSON.parse(options.body);
    return new Promise(resolve => { finishPost = resolve; });
  };
  const saving = h.scope.saveHeroMnemosToServer(promptSnapshot, progress);
  await new Promise(resolve => setImmediate(resolve));
  h.scope.sessionUser = { id: 'other' };
  h.scope.campaignSessionEpoch++;
  finishPost({ ok: true, status: 200, json: async () => ({ ok: true, revision: 8, user: { id: 'owner' } }) });
  assert.equal(await saving, false);
  assert.equal(posted.expectedAccountId, 'owner');
  assert.equal(h.caches.length, 0);
  assert.equal(h.broadcasts.length, 0);
});
