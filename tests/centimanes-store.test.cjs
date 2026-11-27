// Run: node tests/centimanes-store.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cent = require('../story/assets/centimanes.js');
const {create, workspace} = require('../story/assets/centimanes-store.js');
const manual = require('../story/assets/cryptic-manual.js');
const copy = value => structuredClone(value);
function fixture(options = {}) {
  let account = 'account-A', revision = 1, posts = [], beforePost;
  let record = {cycle: 'c1', notes: 'original notes', resources: {iron: 7}, centimanes: cent.normalize()};
  let profiles = {A: {activeCycleId: 'c1'}, B: {activeCycleId: 'c2'}}, active = 'A';
  const scope = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/campaign-session.js'), 'utf8'), scope);
  const session = scope.window.ATO_CAMPAIGN_SESSION.create();
  const response = (status, payload) => ({status, ok: status === 200, json: async () => copy(payload)});
  const store = create({...options, session, request: async options => {
    if (!options?.method) {
      const stored = copy(record);
      const mapping = stored.centimanes.mapping;
      // PHP encodes consecutive zero-based keys as a JSON array.
      if (Object.keys(mapping).every((key, index) => key === String(index))) stored.centimanes.mapping = Object.values(mapping);
      return response(200, {ok: true, user: {id: account}, campaign: {
        sections: {dashboard: {activeProfileId: active, profiles}, record: {users: {A: stored, B: {notes: 'other campaign'}}}},
        sectionRevisions: {record: revision},
      }});
    }
    const body = JSON.parse(options.body); posts.push(body);
    if (beforePost) await beforePost(body);
    if (body.expectedAccountId !== account) return response(409, {code: 'ACCOUNT_MISMATCH'});
    if (body.expectedRevision !== revision) return response(409, {code: 'SAVE_CONFLICT'});
    assert.equal(body.userId, 'A', 'An active-profile switch must not redirect this page\'s edits');
    record = copy(body.state);
    return response(200, {ok: true, revision: ++revision, user: {id: account}});
  }});
  return {store, posts, get record() {return record;}, editRemote(fn) {fn(record); revision++;},
    setAccount(value) {account = value;}, setActive(value) {active = value;},
    setBeforePost(fn) {beforePost = fn;}, deleteProfile() {delete profiles.A;}};
}
(async () => {
  let f = fixture(workspace); await f.store.sync();
  let local = f.store.snapshot().state;
  local.centimanes.draft = [0, 1, 3, 15];
  local.centimanes = cent.saveReading(local.centimanes, {id: 'cent-unsolved'});
  f.store.change(local); await f.store.sync();
  for (const [index, digit] of [[0, '0'], [1, '4'], [3, '7']]) {
    local = f.store.snapshot().state;
    local.centimanes.mapping[index] = digit;
    f.store.change(local); await f.store.sync();
  }
  await f.store.sync();
  const learned = f.store.snapshot().state.centimanes;
  assert.deepEqual(learned.mapping, {0: '0', 1: '4', 3: '7'}, 'Saving a later glyph keeps the earlier mappings');
  assert.deepEqual(cent.recordView(learned.records['cent-unsolved'], learned.mapping).digits, ['0', '4', '7', '']);

  f = fixture(); await f.store.sync();
  assert.equal(f.posts.length, 0, 'Reading an empty module must not create or rewrite the record');
  local = f.store.snapshot().state; local.mapping[0] = '0'; local.draft = [0, 0]; f.store.change(local);
  f.editRemote(record => {record.notes = 'new story note'; record.resources.iron = 8; record.centimanes.mapping[1] = '4';});
  f.setActive('B'); await f.store.sync();
  assert.equal(f.record.notes, 'new story note'); assert.equal(f.record.resources.iron, 8);
  assert.deepEqual(f.record.centimanes.mapping, {0: '0', 1: '4'});
  assert.deepEqual(f.record.centimanes.draft, [0, 0]);

  // A 409 retry re-reads the whole record; edits made while POST is pending survive.
  f = fixture(); await f.store.sync(); local = f.store.snapshot().state; local.mapping[0] = '0'; f.store.change(local);
  let first = true;
  f.setBeforePost(() => {
    if (!first) return; first = false;
    f.editRemote(record => {record.notes = 'concurrent note';});
    const next = f.store.snapshot().state; next.draft = [0, 0, 0]; f.store.change(next);
  });
  await f.store.sync(); assert.equal(f.posts.length, 2);
  assert.equal(f.record.notes, 'concurrent note'); assert.deepEqual(f.record.centimanes.draft, [0, 0, 0]);

  f = fixture(); await f.store.sync(); local = f.store.snapshot().state; local.mapping[0] = '0'; f.store.change(local);
  f.editRemote(record => {record.centimanes.mapping[0] = '9';});
  await f.store.sync(); assert.equal(f.store.snapshot().conflict, true); assert.equal(f.posts.length, 0);
  local = f.store.snapshot().state; local.mapping[1] = '4'; f.store.change(local); await f.store.sync();
  assert.equal(f.posts.length, 0, 'A new unrelated edit must not silently resolve the conflict');
  f.store.resolve(true); await f.store.sync(); assert.deepEqual(f.record.centimanes.mapping, {0: '0', 1: '4'});

  f = fixture(); await f.store.sync(); local = f.store.snapshot().state; local.mapping[0] = '0'; f.store.change(local);
  f.editRemote(record => {record.centimanes.mapping[0] = '9';}); await f.store.sync();
  f.store.resolve(false); await f.store.sync(); assert.equal(f.store.snapshot().state.mapping[0], '9'); assert.equal(f.posts.length, 0);

  for (const action of ['account', 'profile']) {
    f = fixture(); await f.store.sync(); local = f.store.snapshot().state; local.mapping[0] = '0'; f.store.change(local);
    if (action === 'account') f.setAccount('account-B'); else f.deleteProfile();
    await f.store.sync(); assert.equal(f.posts.length, 0); assert.equal(f.store.snapshot().failed, true);
  }
  f = fixture(workspace); await f.store.sync();
  local = f.store.snapshot().state;
  local.centimanes.mapping[0] = '0'; local.centimanes.draft = [0, 0];
  local.babelian.mapping[7] = 'H'; local.babelian.draft = [7, 7];
  f.store.change(local);
  f.editRemote(record => {record.crypticLanguages = {version: 1, retainedFutureField: 'keep', siren: manual.normalize({}, 'siren')}; record.crypticLanguages.siren.mapping[0] = 'A';});
  await f.store.sync();
  assert.deepEqual(f.record.centimanes.draft, [0, 0]);
  assert.deepEqual(f.record.crypticLanguages.babelian.draft, [7, 7]);
  assert.equal(f.record.crypticLanguages.siren.mapping[0], 'A');
  assert.equal(f.record.crypticLanguages.retainedFutureField, 'keep');
  local = f.store.snapshot().state; local.siren.draft = [0, 0]; f.store.change(local); await f.store.sync();
  assert.deepEqual(f.record.crypticLanguages.babelian.draft, [7, 7], 'Switching language must preserve other drafts');
  console.log('PASS story sidebar persistence: unrelated record fields, separate mappings, concurrent edits, 409 retry, conflict decisions and account/profile guards.');
})().catch(error => {console.error(error); process.exitCode = 1;});
