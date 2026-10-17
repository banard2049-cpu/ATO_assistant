const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../hero/index.html'), 'utf8').replace(/\r\n/g, '\n');
const copy = value => JSON.parse(JSON.stringify(value));
const imported = {
  heroes: [{ id: 'imported', customName: '导入英雄' }], activeHeroId: 'imported', graveyard: [],
  _userId: 'source-account', _lastSyncRevision: 900, _dirty: false,
  _syncBaseline: { heroes: [{ id: 'unrelated' }], graveyard: [] }, unrelated: 'ignore',
};

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function load({ pendingPost, deferredRead = false } = {}) {
  const input = {}, timers = new Map(), posts = [], alerts = [], readers = [];
  let timerId = 0;
  let server = { heroes: [{ id: 'old', customName: '旧英雄' }], activeHeroId: 'old', graveyard: [] };
  let revision = 3;
  const context = vm.createContext({
    state: { ...copy(server), _userId: 'current-account', _lastSyncRevision: revision, _dirty: false },
    heroServerBaseline: copy(server), serverSectionRevision: revision,
    heroSaveInFlight: false, heroSavePending: false, heroLoading: false,
    heroExternalReloadPending: false, heroSessionEpoch: 0, serverStorageAvailable: true,
    saveTimer: null, storageKey: 'heroes', serverStorageUrl: '/campaign', serverStorageSection: 'heroes',
    SKILLS: [], MNEMOS_GROUPS: ['c1', 'c2', 'c3', 'c4', 'c5', 'count'],
    document: { getElementById: () => input },
    window: { confirm: () => true }, localStorage: { setItem() {} },
    alert: text => alerts.push(text), renderAll() {},
    setSaveStatus: text => { context.status = text; },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    FileReader: class {
      constructor() { readers.push(this); }
      readAsText(file) { this.result = file.text; if (!deferredRead) this.onload(); }
    },
    fetch: async (url, options = {}) => {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        posts.push(body);
        if (posts.length === 1 && pendingPost) await pendingPost.promise;
        assert.equal(body.expectedAccountId, 'current-account');
        assert.equal(body.expectedRevision, revision);
        server = copy(body.state);
        revision++;
        return { ok: true, status: 200, json: async () => ({ ok: true, revision }) };
      }
      return { ok: true, json: async () => ({ ok: true, exists: true,
        user: { id: 'current-account' }, state: copy(server), revision }) };
    },
  });
  for (const name of ['normalizeState', 'persistLocal', 'heroSnapshot', 'mergeHeroStates', 'chooseHeroMerge',
    'queueSave', 'saveToServer', 'loadFromServer']) {
    const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
    assert.ok(match, `missing ${name}`);
    vm.runInContext(match[0], context);
  }
  const begin = source.indexOf('document.getElementById("importInput").onchange');
  const end = source.indexOf('document.getElementById("addHeroButton").onclick', begin);
  vm.runInContext(source.slice(begin, end), context);
  return { context, timers, posts, alerts, readers,
    import(data = imported) { input.onchange({ target: { files: [{ text: JSON.stringify(data) }], value: 'file' } }); },
    server: () => copy(server),
  };
}

test('hero import uses the current account and syncs business data that survives reload', async () => {
  const app = load();
  const baseline = copy(app.context.heroServerBaseline);
  app.import();
  assert.equal(app.context.state._userId, 'current-account');
  assert.equal(app.context.state._lastSyncRevision, 3);
  assert.equal(app.context.state._dirty, true);
  assert.equal(app.context.state._syncBaseline, undefined);
  assert.equal(app.context.state.unrelated, undefined);
  assert.deepEqual(copy(app.context.heroServerBaseline), baseline);
  assert.equal(app.timers.size, 1);
  assert.match(app.context.status, /等待同步/);
  await app.context.saveToServer();
  assert.equal(app.posts.length, 1);
  assert.equal(app.server().heroes[0].customName, '导入英雄');
  assert.equal(app.context.state._dirty, false);
  await app.context.loadFromServer();
  assert.equal(app.context.state.heroes[0].id, 'imported');
});

test('an older in-flight save is followed by a save of the imported state', async () => {
  const gate = deferred();
  const app = load({ pendingPost: gate });
  const saving = app.context.saveToServer();
  assert.equal(app.posts.length, 1);
  app.import();
  assert.equal(app.context.heroSavePending, true);
  gate.resolve();
  await saving;
  assert.equal(app.posts.length, 2);
  assert.equal(app.posts[0].state.heroes[0].id, 'old');
  assert.equal(app.posts[1].expectedRevision, 4);
  assert.equal(app.server().heroes[0].id, 'imported');
  assert.equal(app.context.state._dirty, false);
});

test('a file read started before an account switch cannot change the new session', () => {
  const app = load({ deferredRead: true });
  app.import();
  app.context.heroSessionEpoch++;
  app.context.state = { heroes: [{ id: 'new-account' }], _userId: 'another-account' };
  app.readers[0].onload();
  assert.equal(app.context.state.heroes[0].id, 'new-account');
  assert.equal(app.posts.length, 0);
  assert.equal(app.timers.size, 0);
  assert.match(app.alerts[0], /账号已切换/);
});

test('a first server read that discovers another account also invalidates an earlier file read', () => {
  const app = load({ deferredRead: true });
  app.import();
  app.context.state = { heroes: [{ id: 'server-account' }], _userId: 'another-account' };
  app.readers[0].onload();
  assert.equal(app.context.state.heroes[0].id, 'server-account');
  assert.equal(app.timers.size, 0);
  assert.match(app.alerts[0], /账号已切换/);
});

test('an import while the initial load is pending is queued for the established session', async () => {
  const app = load();
  app.context.heroLoading = true;
  app.import({ heroes: [{ id: 'startup-import' }], graveyard: [] });
  await app.context.saveToServer();
  assert.equal(app.posts.length, 0);
  assert.equal(app.context.heroSavePending, true);
  await app.context.loadFromServer();
  // loadFromServer starts the queued asynchronous save in its finally block.
  while (app.context.heroSaveInFlight) await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.server().heroes[0].id, 'startup-import');
  assert.equal(app.context.state._userId, 'current-account');
});
