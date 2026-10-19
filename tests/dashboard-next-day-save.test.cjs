const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
const nextDay = source.match(/^    async function nextDay\([^]*?^    }/m)[0];
const copy = value => JSON.parse(JSON.stringify(value));

function harness() {
  let server = { day: 1, completed: {}, events: [], notes: '' };
  const backups = [], alerts = [];
  const c = vm.createContext({
    state: copy(server), archive: { activeProfileId: 'p' }, campaignSessionEpoch: 1,
    campaignRestoreInFlight: false, ownsDashboardWriteLease: () => true,
    currentCycleConfig: () => ({ id: 'c1' }), dateTrackData: { c1: { entries: [{ day: 1 }, { day: 2 }, { day: 3 }] } },
    elements: { appShell: { inert: false } }, window: { alert: text => alerts.push(text) },
    saveState() {}, syncInputs() {}, renderFlow() {}, renderDateTrack() {},
    flushCampaignSave: async () => {
      if (server.day !== c.state.day) backups.push(copy(server));
      server = copy(c.state);
      return true;
    },
  });
  vm.runInContext(nextDay, c);
  return { c, backups, alerts, server: () => copy(server) };
}

test('the daily backup contains the last unsaved completion before its flags are cleared', async () => {
  const h = harness();
  h.c.state.completed.explore = true;
  h.c.state.events.push({ id: 'today', done: true });
  h.c.state.notes = 'last edit';
  assert.equal(await h.c.nextDay(), true);
  assert.deepEqual(h.backups, [{ day: 1, completed: { explore: true }, events: [{ id: 'today', done: true }], notes: 'last edit' }]);
  assert.equal(h.server().day, 2);
  assert.deepEqual(h.server().completed, {});
  assert.equal(h.c.elements.appShell.inert, false);
});

test('failed closing-day save preserves the day and completion flags', async () => {
  const h = harness();
  h.c.state.completed.explore = true;
  h.c.flushCampaignSave = async () => false;
  assert.equal(await h.c.nextDay(), false);
  assert.equal(h.c.state.day, 1);
  assert.equal(h.c.state.completed.explore, true);
  assert.equal(h.backups.length, 0);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.c.elements.appShell.inert, false);
});

test('rapid duplicate clicks wait for both saves and cannot skip an unarchived day', async () => {
  const h = harness();
  let release, calls = 0;
  const save = h.c.flushCampaignSave;
  h.c.flushCampaignSave = async () => {
    if (++calls === 1) await new Promise(resolve => { release = resolve; });
    return save();
  };
  const first = h.c.nextDay();
  assert.equal(await h.c.nextDay(), false);
  assert.equal(h.c.elements.appShell.inert, true);
  release();
  assert.equal(await first, true);
  assert.equal(h.server().day, 2);
  await h.c.nextDay();
  assert.deepEqual(h.backups.map(day => day.day), [1, 2]);
  assert.equal(h.server().day, 3);
});

test('account changes during the save abort the date transition', async () => {
  const h = harness();
  h.c.flushCampaignSave = async () => { h.c.campaignSessionEpoch++; return true; };
  assert.equal(await h.c.nextDay(), false);
  assert.equal(h.c.state.day, 1);
  assert.equal(h.backups.length, 0);
});
