const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8');
const php = fs.readFileSync(path.join(root, 'api/campaign-state.php'), 'utf8');
const payloadFunction = php.slice(php.indexOf('function public_second_screen_payload('), php.indexOf('function current_user('));
function extract(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, name);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end + 2);
}
function payload(display, legacy = false) {
  const mapState = { ...display, cycles: { c1: { explored: { '001': true } } } };
  const campaign = { sections: {
    dashboard: { activeProfileId: 'p1', profiles: { p1: { activeCycleId: 'c1' } } },
    map: legacy ? mapState : { users: { p1: mapState, p2: { onlyExplored: false } } },
  } };
  const encoded = Buffer.from(JSON.stringify(campaign)).toString('base64');
  const result = spawnSync('php', ['-r', `${payloadFunction}\necho json_encode(public_second_screen_payload(json_decode(base64_decode('${encoded}'), true)));`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const context = vm.createContext({
  URLSearchParams, console,
  window: { location: { search: '?second=1', origin: 'http://localhost' }, parent: { postMessage() {} } },
  fetch: async () => ({ ok: true, json: async () => ({ ok: true, screen: context.screen }) }),
});
vm.runInContext(`
  const cycleIds = ['c1'];
  const tokenAssetById = { AG: {} };
  const edgeDirections = ['up'];
  const campaignStorageUrl = '/api/campaign-state.php';
  let secondScreenFingerprint = '', secondScreenLoadInFlight = false, state, renders = 0;
  function normalizeTokens(value) { return value?.tokens || {}; }
  function focusArgoAfterNextRender() {}
  function render() { renders++; }
  ${['isPlainObject', 'defaultCycleState', 'createDefaultState', 'normalizeState', 'normalizeMapZoom', 'loadSecondScreenMapState'].map(extract).join('\n')}
`, context);

(async () => {
  for (const legacy of [false, true]) {
    for (let mask = 0; mask < 16; mask++) {
      const display = { showBack: Boolean(mask & 1), onlyExplored: Boolean(mask & 2), hideUnknown: Boolean(mask & 4), showAdjacency: Boolean(mask & 8), query: mask % 2 ? '001' : '' };
      context.screen = { ...payload(display, legacy), displayScales: { map: 150 } };
      await vm.runInContext('loadSecondScreenMapState()', context);
      const state = JSON.parse(vm.runInContext('JSON.stringify(state)', context));
      for (const key of Object.keys(display)) assert.equal(state[key], display[key], key);
      assert.equal(state.mapZoom, 150);
      assert.equal(state.cycles.c1.explored['001'], true);
    }
  }
  context.screen = payload({});
  delete context.screen.mapDisplay;
  await vm.runInContext('loadSecondScreenMapState()', context);
  assert.equal(vm.runInContext('state.hideUnknown', context), true);
  assert.equal(vm.runInContext('state.onlyExplored', context), false);
  const count = vm.runInContext('renders', context);
  await vm.runInContext('loadSecondScreenMapState()', context);
  assert.equal(vm.runInContext('renders', context), count);
  console.log('PASS: display combinations, profile/legacy payloads, live changes, scale, defaults and unchanged polling');
})().catch(error => { console.error(error); process.exitCode = 1; });
