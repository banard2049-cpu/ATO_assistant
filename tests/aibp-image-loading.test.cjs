const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../aibp/index.html'), 'utf8').replace(/\r\n/g, '\n');
function load(context, names) {
  context.window ||= {};
  context.window.AIBP_BOSS_TRAIT_RULES = require('../aibp/boss-trait-rules.js');
  for (const name of names) {
    const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
}

function probes() {
  const images = [];
  const timers = new Map();
  let nextTimer = 0;
  let now = 0;
  class Image {
    constructor() { images.push(this); }
    removeAttribute() { this.src = ''; }
  }
  const context = vm.createContext({
    Image, Date: { now: () => now }, optionalImageChecks: new Map(), optionalImageCheckQueue: [],
    aibpImageIndex: null,
    window: {
      HeliosAssets: { resolve: (src) => src },
      setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
  });
  load(context, ['resolveOptionalImagePresence', 'flushOptionalImageChecks']);
  return { context, images, timers, advance: (ms) => { now += ms; } };
}

test('a missing inventory never starts speculative image requests', async () => {
  const h = probes();
  const jobs = Array.from({ length: 1000 }, (_, i) => h.context.resolveOptionalImagePresence(`trait-${i}.jpg`));
  assert.ok((await Promise.all(jobs)).every((exists) => !exists));
  assert.equal(h.images.length, 0);
  assert.equal(h.timers.size, 0);
  load(h.context, ['indexedAibpCards', 'traitImageCandidates', 'commonTraitImageCandidates']);
  assert.equal(h.context.traitImageCandidates('TITAN_X').length, 0);
  assert.equal(h.context.commonTraitImageCandidates('TITAN_X').length, 0);
});

test('an actual file index skips guessed filenames and does not download images to check existence', async () => {
  const h = probes();
  const front = 'ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_X_002.jpg';
  h.context.aibpImageIndex = new Set([front]);
  assert.equal(await h.context.resolveOptionalImagePresence(front), true);
  const jobs = Array.from({ length: 1000 }, (_, i) =>
    h.context.resolveOptionalImagePresence(`ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_BP_X_${i}.jpg`));
  assert.ok((await Promise.all(jobs)).every((exists) => !exists));
  assert.equal(h.images.length, 0);
});

test('an existing optional image can start while a large fixed card is still loading', async () => {
  const h = probes();
  // No load/error event is emitted for this pending main image.
  h.context.document = { createElement: () => ({}) };
  load(h.context, ['imageOrMessage', 'loadOptionalImage']);
  const panel = h.context.imageOrMessage('large-panel.jpg', 'Panel');
  h.context.aibpImageIndex = new Set(['optional.jpg']);
  const optional = {};
  h.context.loadOptionalImage(optional, 'optional.jpg', () => true);
  await Promise.resolve();
  assert.equal(panel.src, 'large-panel.jpg');
  assert.equal(optional.src, 'optional.jpg');
  assert.equal(panel.fetchPriority, 'high');
  assert.equal(optional.fetchPriority, 'low');
  assert.equal(h.timers.size, 0);
  assert.equal(h.images.length, 0);
});

test('a fixed card reports a load failure and can retry without reloading the page', () => {
  const h = probes();
  h.context.document = { createElement: () => ({
    listeners: new Map(), children: [],
    addEventListener(event, fn) { this.listeners.set(event, fn); },
    removeEventListener(event) { this.listeners.delete(event); },
    replaceWith(next) { this.replacement = next; },
    appendChild(child) { this.children.push(child); },
  }) };
  load(h.context, ['imageOrMessage']);
  const image = h.context.imageOrMessage('ps/TITAN_X/TITAN_X.jpg', 'Titan X', 'panel-image');
  assert.equal(image.fetchPriority, 'high');
  image.onerror();
  const failure = image.replacement;
  assert.match(failure.textContent, /图片加载失败/);
  const retry = failure.children[0];
  assert.equal(retry.textContent, '重试加载');
  retry.listeners.get('click')({ stopPropagation() {} });
  assert.equal(failure.replacement, image);
  assert.match(image.src, /TITAN_X\.jpg\?retry=/);
});

test('queued image requests for a closed or replaced view are discarded', async () => {
  const h = probes();
  h.context.aibpImageIndex = undefined;
  h.context.loadAibpImageIndex = () => Promise.resolve();
  let visible = true;
  const obsolete = h.context.resolveOptionalImagePresence('obsolete.jpg', () => visible);
  visible = false;
  h.context.aibpImageIndex = null;
  h.context.flushOptionalImageChecks();
  assert.equal(await obsolete, false);
  assert.equal(h.images.length, 0);
  h.context.aibpImageIndex = new Set(['obsolete.jpg']);
  const retry = h.context.resolveOptionalImagePresence('obsolete.jpg');
  assert.equal(await retry, true);
});

test('actual traits and extra cards include existing numbers beyond the old guess limit', () => {
  const h = probes();
  h.context.aibpImageIndex = new Set([
    'ps/TITAN_X/TITAN_X_TR_II_025.png',
    'ps/TITAN_X/TITAN_X_AI_X_017.jpg',
    'ps/TITAN_X/TITAN_X_AI_X_017_BACK.jpg',
    'ps/TITAN_X/TITAN_X.jpg',
    'ps/HEKATON/HEKATON_TR_I_001.jpg',
  ]);
  h.context.piles = { TITAN_X: {} };
  load(h.context, ['indexedAibpCards', 'traitImageCandidates', 'traitAreaExtraCards']);
  const cards = h.context.traitImageCandidates('TITAN_X');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].index, 25);
  assert.equal(cards[0].ext, 'png');
  const extra = h.context.traitAreaExtraCards('TITAN_X');
  assert.equal(extra.length, 1);
  assert.match(extra[0].src, /AI_X_017\.jpg$/);
});

test('the file index is requested once and failures leave optional images unrequested', async () => {
  const h = probes();
  h.context.AbortController = AbortController;
  h.context.aibpImageIndex = undefined;
  h.context.aibpImageIndexPromise = null;
  let requests = 0;
  h.context.fetch = async () => { requests++; return { ok: false }; };
  load(h.context, ['loadAibpImageIndex']);
  const first = h.context.loadAibpImageIndex();
  assert.equal(h.context.loadAibpImageIndex(), first);
  await first;
  assert.equal(requests, 1);
  assert.equal(h.context.aibpImageIndex, null);
  assert.equal(await h.context.resolveOptionalImagePresence('missing.jpg'), false);
  assert.equal(h.images.length, 0);
  assert.equal(h.timers.size, 0);
});

test('a stale custom trait image cannot break the second-screen snapshot', () => {
  const active = { id: 'active', scope: 'custom', name: 'Active' };
  const state = { AI: { deck: [] }, BP: { deck: [], damage: [] }, traits: [active], tokens: [] };
  const images = ['removed', 'active'].map((id) => ({
    complete: true, naturalWidth: 100, dataset: { customTraitId: id },
  }));
  const context = vm.createContext({
    currentApostle: 'TITAN_X', piles: { TITAN_X: state },
    ensurePiles() {}, isChimera: () => false, currentBpDamageSummary: () => ({ total: 0 }),
    extraGrid: { querySelectorAll: () => images },
    publicTraitSnapshot: (name, card) => ({ label: card.name }),
    publicCardSnapshot: () => null, levelRoman: {}, currentApostleLevel: () => 1,
    apostlePanelSrc: () => '', apostlePanelIndex: () => 0, deckBackDisplayText: () => '',
    window: { BattleTerrain: { normalizeBattleMap: () => ({}) } },
    battleMapControl: null, isLabyrinthTrackApostle: () => false,
  });
  load(context, ['isTraitRemovedByLevel', 'currentBossWounds', 'buildSecondScreenSnapshot']);
  const snapshot = context.buildSecondScreenSnapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.extraCards)), [{ label: 'Active' }]);
  context.currentApostle = 'UR_FLEECE';
  context.currentApostleLevel = () => 2;
  context.piles.UR_FLEECE = { ...state, traits: [active, { level: 'I', index: 2, name: 'Just a Memory' }] };
  assert.deepEqual(JSON.parse(JSON.stringify(context.buildSecondScreenSnapshot().traits)), [{ label: 'Active' }]);
});

test('inventory retry recovers both views without probing or retaining obsolete jobs', async () => {
  const h = probes();
  let refreshes = 0;
  h.context.AbortController = AbortController;
  h.context.aibpImageIndexPromise = null;
  h.context.renderExtraCards = () => refreshes++;
  h.context.renderTraitCandidates = () => refreshes++;
  h.context.traitDialog = { open: true };
  const src = 'ps/TITAN_X/TITAN_X_AI_X_017.jpg';
  h.context.fetch = async () => ({ ok: true, json: async () => ({ ok: true, images: [src] }) });
  h.context.document = { createElement: () => ({
    listeners: new Map(), children: [],
    addEventListener(event, fn) { this.listeners.set(event, fn); },
    appendChild(child) { this.children.push(child); },
  }) };
  h.context.aibpImageIndex = undefined;
  h.context.loadAibpImageIndex = () => Promise.resolve();
  const obsolete = h.context.resolveOptionalImagePresence('obsolete.jpg');
  load(h.context, ['loadAibpImageIndex', 'showImageIndexFailure']);
  const container = { appendChild(child) { this.notice = child; } };
  h.context.showImageIndexFailure(container);
  const retry = container.notice.children[0];
  retry.listeners.get('click')();
  assert.equal(await obsolete, false);
  await h.context.aibpImageIndexPromise;
  await Promise.resolve();
  assert.equal(refreshes, 2);
  assert.equal(await h.context.resolveOptionalImagePresence(src), true);
  assert.equal(h.images.length, 0);
});

test('Android inventory requests use the native API bridge', async () => {
  const calls = [];
  const sandbox = { URL, Request, Response, document: { addEventListener() {} }, window: {
    location: { href: 'file:///android_asset/web/aibp/index.html' },
    fetch: async () => { throw new Error('Inventory must not use file fetch'); },
    ATOAndroid: { request(url, method, body) {
      calls.push({ url, method, body });
      return JSON.stringify({ status: 200, body: JSON.stringify({ ok: true, images: ['ps/TITAN_X/TITAN_X.jpg'] }) });
    } },
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../tools/packaging/android/fetch-bridge.js'), 'utf8'), sandbox);
  const response = await sandbox.window.fetch('../api/aibp-image-index.php');
  assert.deepEqual((await response.json()).images, ['ps/TITAN_X/TITAN_X.jpg']);
  assert.deepEqual(calls, [{ url: 'file:///android_asset/web/api/aibp-image-index.php', method: 'GET', body: '' }]);
  const server = fs.readFileSync(path.join(__dirname, '../tools/packaging/android/app/src/main/java/com/ato/assistant/LocalSecondScreenServer.java'), 'utf8');
  assert.match(server, /"\/api\/aibp-image-index\.php"\.equals\(uri\.getPath\(\)\)/);
});

test('failed inventory cannot replace saved selections with an incomplete list', () => {
  const h = probes();
  h.context.ensurePiles = () => { throw new Error('Must preserve saved selections'); };
  load(h.context, ['saveTraitSelection']);
  assert.doesNotThrow(() => h.context.saveTraitSelection());
});
