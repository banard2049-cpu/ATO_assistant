const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const functions = ['applyHeroProgressChanges', 'saveHeroMnemosToServer'].map(name => {
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
  const posts = [], warnings = [];
  const scope = vm.createContext({
    cloneJson: clone, isPlainObject: value => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    readServerHeroStateForUpdate: async () => ({ state: clone(server), revision, userId: 'owner' }),
    sessionUser: { id: 'owner' }, readLocalHeroState: () => null,
    localStorage: { setItem() {} }, HERO_STORAGE_KEY: 'heroes', heroMnemosSyncChannel: null,
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
  vm.runInContext(functions, scope);
  return { scope, posts, warnings, saved: () => clone(server) };
}

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
