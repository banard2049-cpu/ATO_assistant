const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');

function extract(source, name) {
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
}

function dashboardRouter(calls, { open = true, windowRef } = {}) {
  return {
    moduleFromUrl: () => 'dashboard',
    isSinglePageMode: () => false,
    hasOpenModule: () => open,
    focusModuleWindow(module) {
      calls.push('focus-window:' + module);
      return open ? windowRef : null;
    },
    focusNamedModule() {
      calls.push('focus-named');
      return windowRef;
    },
    openModuleTab() {
      calls.push('open-module');
      return windowRef;
    },
    async focusOrNavigate(url) {
      calls.push('focus-or-navigate:' + url);
      return open;
    },
  };
}

function fakeDashboardWindow(calls) {
  return {
    location: {
      set href(value) {
        calls.push('navigate:' + value);
      },
    },
    focus() {
      calls.push('focus');
    },
  };
}

function fakeSyncChannel(calls) {
  return {
    postMessage(message) {
      calls.push('sync:' + (message?.source || ''));
    },
  };
}

function mapHarness(options = {}) {
  const calls = [];
  const dashboardWindow = fakeDashboardWindow(calls);
  const syncChannel = options.noChannel ? null : fakeSyncChannel(calls);
  let releaseSave;
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  const context = vm.createContext({
    URL,
    console,
    window: {
      location: { href: 'http://localhost/map/index.html' },
      ATO_PAGE_ROUTER: dashboardRouter(calls, { open: options.open !== false, windowRef: dashboardWindow }),
      alert: (message) => calls.push('alert:' + message),
    },
    dashboardSyncChannel: syncChannel,
    clearPendingAdversarySpawn: () => calls.push('clear-adversary'),
    saveState: () => calls.push('save-state'),
    flushCampaignMapSave: async () => {
      calls.push('flush-map');
      if (options.holdSave) await saveGate;
      return options.saveFails !== true;
    },
    currentMapSnapshot: () => ({}),
    buildDashboardArchive: async () => ({}),
    saveCampaignDashboardArchive: async () => {
      calls.push('save-dashboard');
    },
    dashboardSectionRevision: 0,
  });
  vm.runInContext(extract(read('map/app.js'), 'saveAndReturnToDashboard'), context);
  return { calls, context, releaseSave };
}

function technologyHarness(options = {}) {
  const calls = [];
  const dashboardWindow = fakeDashboardWindow(calls);
  const syncChannel = options.noChannel ? null : fakeSyncChannel(calls);
  const returnMain = { textContent: '保存并返回主控台', disabled: false };
  const context = vm.createContext({
    URL,
    console: { log() {}, warn() {}, error() {} },
    window: {
      location: { href: 'http://localhost/technology/index.html' },
      ATO_PAGE_ROUTER: dashboardRouter(calls, { open: options.open !== false, windowRef: dashboardWindow }),
      alert: (message) => calls.push('alert:' + message),
    },
    dashboardSyncChannel: syncChannel,
    returnMain,
    saveAccounts: () => calls.push('save-accounts'),
    alert: (message) => calls.push('alert:' + message),
    flushCampaignTechnologySave: async () => {
      calls.push('flush-tech');
      return options.saveFails !== true;
    },
    unlockedTechSnapshot: () => ({ unlockedTech: {} }),
    writeSnapshotToMainArchive: async () => calls.push('write-snapshot'),
  });
  vm.runInContext(extract(read('technology/index.html'), 'saveAndReturnMain'), context);
  return { calls, context, returnMain };
}

test('map save-and-return focuses the console once and asks it to sync instead of reloading it', async () => {
  const { calls, context } = mapHarness();
  await context.saveAndReturnToDashboard();
  assert.deepEqual(calls, [
    'clear-adversary',
    'save-state',
    'focus-window:dashboard',
    'flush-map',
    'save-dashboard',
    'focus',
    'sync:map-return',
  ]);
  assert.ok(!calls.some((call) => call.startsWith('navigate:')), 'a live console is repainted in place, never navigated');
  assert.ok(!calls.includes('focus-named'), 'openModuleTab() must not reload the console before saving');
  assert.ok(!calls.includes('open-module'), 'openModuleTab() must not reload the console before saving');
});

test('map save-and-return waits for the save before notifying and keeps its failure path', async () => {
  const { calls, context, releaseSave } = mapHarness({ holdSave: true });
  const done = context.saveAndReturnToDashboard();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(!calls.some((call) => call.startsWith('sync:')), 'the console must not be told to read while the map is still saving');
  releaseSave();
  await done;
  assert.deepEqual(calls.filter((call) => call.startsWith('sync:')), ['sync:map-return']);

  const failing = mapHarness({ saveFails: true });
  await failing.context.saveAndReturnToDashboard();
  assert.ok(failing.calls.includes('alert:地图尚未保存，已保留当前修改并等待服务恢复。'));
  assert.ok(!failing.calls.some((call) => call.startsWith('sync:')), 'a failed save must leave the console untouched');
});

test('map save-and-return keeps working when no console tab is live', async () => {
  const { calls, context } = mapHarness({ open: false });
  await context.saveAndReturnToDashboard();
  assert.ok(!calls.some((call) => call.startsWith('focus-window')));
  assert.deepEqual(calls.filter((call) => call.startsWith('focus-or-navigate:')), [
    'focus-or-navigate:http://localhost/index.html',
  ]);
});

test('map save-and-return still navigates when BroadcastChannel is unavailable', async () => {
  const { calls, context } = mapHarness({ noChannel: true });
  await context.saveAndReturnToDashboard();
  assert.deepEqual(calls.filter((call) => call.startsWith('navigate:')), ['navigate:http://localhost/index.html']);
});

test('technology save-and-return notifies the live console instead of reloading it', async () => {
  const { calls, context, returnMain } = technologyHarness();
  await context.saveAndReturnMain();
  assert.deepEqual(calls, [
    'focus-window:dashboard',
    'save-accounts',
    'flush-tech',
    'write-snapshot',
    'focus',
    'sync:technology-return',
  ]);
  assert.ok(!calls.some((call) => call.startsWith('navigate:')));
  assert.equal(returnMain.disabled, false);

  const failing = technologyHarness({ saveFails: true });
  await failing.context.saveAndReturnMain();
  assert.ok(!failing.calls.some((call) => call.startsWith('navigate:')), 'a failed save must stay on the technology page');
  assert.ok(failing.calls.some((call) => call.startsWith('alert:保存科技列表失败')));
});

test('the page router exposes a focus-only helper that never loads a URL into the tab', () => {
  const router = read('assets/page-focus-router.js');
  const helper = extract(router, 'focusModuleWindow');
  assert.match(helper, /window\.open\("", targetWindowName\)/, 'an empty URL only focuses the existing tab');
  assert.doesNotMatch(helper, /window\.open\([^)]*dashboardUrl/, 'the helper must not navigate');
  assert.match(router, /^ {4}focusModuleWindow,$/m, 'the helper is part of window.ATO_PAGE_ROUTER');
  assert.match(router, /^ {4}focusOrSync,$/m, 'focusOrSync is part of window.ATO_PAGE_ROUTER');
});

function routerHarness(options = {}) {
  const calls = [];
  let targetHref = options.targetHref ?? 'http://localhost/record/index.html?cycle=c2';
  let currentHref = options.currentHref ?? 'http://localhost/index.html';
  const target = {
    location: {
      get href() { return targetHref; },
      set href(value) { calls.push('navigate-target:' + value); },
    },
  };
  const context = vm.createContext({
    URL,
    console,
    pageId: 'page-1',
    channel: { postMessage: (message) => calls.push({ type: 'post', message }) },
    currentModule: options.currentModule ?? 'dashboard',
    moduleFromUrl: () => options.module ?? 'record',
    isSingleWindowMode: () => options.single === true,
    hasOpenModule: () => options.state !== 'absent' && options.live !== false,
    moduleOpenState: () => options.state ?? (options.live === false ? 'absent' : 'fresh'),
    focusModuleWindow: () => (options.focusable === false ? null : target),
    openModuleTab: (url) => { calls.push('open-tab:' + url); return options.openWorks !== false; },
    focusOrNavigate: async (url) => { calls.push('focus-or-navigate:' + url); return false; },
    window: {
      location: {
        get href() { return currentHref; },
        set href(value) { currentHref = value; calls.push('navigate-self:' + value); },
      },
    },
  });
  const router = read('assets/page-focus-router.js');
  vm.runInContext(['normalizePagePath', 'samePageUrl', 'focusOrSync']
    .map((name) => extract(router, name)).join('\n'), context);
  return { calls, context };
}

test('router focuses a live module tab and asks it to sync when the URL matches', async () => {
  const { calls, context } = routerHarness({ module: 'record' });
  const handled = await context.focusOrSync('http://localhost/record/index.html?cycle=c2', { insideGesture: true });
  assert.equal(handled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    type: 'post',
    message: { type: 'sync-request', module: 'record', url: 'http://localhost/record/index.html?cycle=c2', sourceId: 'page-1' },
  }]);
});

test('router still navigates a live module tab when the requested cycle differs', async () => {
  const { calls, context } = routerHarness({ module: 'map', targetHref: 'http://localhost/map/index.html?cycle=c2' });
  await context.focusOrSync('http://localhost/map/index.html?cycle=c3', { insideGesture: true });
  assert.deepEqual(calls, ['navigate-target:http://localhost/map/index.html?cycle=c3']);
});

test('router always syncs the singleton dashboard and ignores its query string', async () => {
  const { calls, context } = routerHarness({
    module: 'dashboard',
    currentModule: 'record',
    targetHref: 'http://localhost/index.html?cycle=c3',
  });
  await context.focusOrSync('http://localhost/index.html', { insideGesture: true });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    type: 'post',
    message: { type: 'sync-request', module: 'dashboard', url: 'http://localhost/index.html', sourceId: 'page-1' },
  }]);
});

test('router opens the module when no live tab exists and navigates this tab in single-page mode', async () => {
  const missing = routerHarness({ module: 'hero', live: false });
  await missing.context.focusOrSync('http://localhost/hero/index.html?cycle=c2', { insideGesture: true });
  assert.deepEqual(missing.calls, ['open-tab:http://localhost/hero/index.html?cycle=c2']);

  const single = routerHarness({ module: 'hero', single: true });
  await single.context.focusOrSync('http://localhost/hero/index.html?cycle=c2', { insideGesture: true });
  assert.deepEqual(single.calls, ['navigate-self:http://localhost/hero/index.html?cycle=c2']);
});

test('module pages count /x/ and /x/index.html as one page but keep the query', () => {
  const { context } = routerHarness();
  assert.equal(context.samePageUrl('http://localhost/map/', 'http://localhost/map/index.html'), true);
  assert.equal(context.samePageUrl('http://localhost/', 'http://localhost/index.html'), true);
  assert.equal(context.samePageUrl('http://localhost/map/index.html?cycle=c2', 'http://localhost/map/index.html?cycle=c3'), false);
  assert.equal(context.samePageUrl('http://localhost/map/index.html', 'http://localhost/record/index.html'), false);
});

test('router still focuses a live tab whose background heartbeat is stale', async () => {
  const { calls, context } = routerHarness({ module: 'record', state: 'stale' });
  const handled = await context.focusOrSync('http://localhost/record/index.html?cycle=c2', { insideGesture: true });
  assert.equal(handled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    type: 'post',
    message: { type: 'sync-request', module: 'record', url: 'http://localhost/record/index.html?cycle=c2', sourceId: 'page-1' },
  }]);
});

test('router opens the module when a stale record no longer has a tab', async () => {
  const { calls, context } = routerHarness({ module: 'hero', state: 'stale', focusable: false });
  await context.focusOrSync('http://localhost/hero/index.html?cycle=c2', { insideGesture: true });
  assert.deepEqual(calls, ['open-tab:http://localhost/hero/index.html?cycle=c2']);
});

test('focusModuleWindow closes the blank popup created when no named tab exists', () => {
  const router = read('assets/page-focus-router.js');
  let closed = 0;
  let focused = 0;
  for (const [href, expected] of [['about:blank', null], ['http://localhost/map/index.html', 'window']]) {
    const target = {
      location: { href },
      close() { closed += 1; },
      focus() { focused += 1; },
    };
    const context = vm.createContext({
      moduleWindowName: () => 'ato-module-map',
      window: { open: () => target },
    });
    vm.runInContext(extract(router, 'focusModuleWindow'), context);
    const result = context.focusModuleWindow('map');
    if (expected === null) assert.equal(result, null);
    else assert.equal(result, target);
  }
  assert.equal(closed, 1, 'the probe popup is closed, not left blank');
  assert.equal(focused, 1, 'a real tab is focused');
});

test('module liveness keeps throttled heartbeats as stale instead of closed', () => {
  const router = read('assets/page-focus-router.js');
  const now = 1_800_000_000_000;
  const store = {};
  const context = vm.createContext({
    openModulesKey: 'k',
    openModuleTtl: 15000,
    openModuleGraceTtl: 30 * 60 * 1000,
    currentModule: 'dashboard',
    isSingleWindowMode: () => false,
    Date: { now: () => now },
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = value; },
    },
  });
  vm.runInContext(['readOpenModules', 'writeOpenModules', 'moduleOpenState', 'hasOpenModule', 'isModuleRecentlyOpen']
    .map((name) => extract(router, name)).join('\n'), context);

  context.writeOpenModules({ map: { updatedAt: now - 5000 } });
  assert.equal(context.moduleOpenState('map'), 'fresh');

  context.writeOpenModules({ map: { updatedAt: now - 120000 } });
  assert.equal(context.moduleOpenState('map'), 'stale', 'a 2-minute-old heartbeat is still probed');
  assert.equal(context.hasOpenModule('map'), true);
  assert.equal(context.isModuleRecentlyOpen('map'), false);

  context.writeOpenModules({ map: { updatedAt: now - 60 * 60 * 1000 } });
  assert.equal(context.moduleOpenState('map'), 'absent');
  assert.deepEqual(JSON.parse(store.k), {}, 'an expired record is dropped');

  assert.equal(context.moduleOpenState('dashboard'), 'fresh', 'the current module is always fresh');
});

test('module pages keep ?cycle= in the URL when the shown cycle changes', () => {
  const sources = [
    [read('map/app.js'), 'syncCycleUrl', /function renderCycleTabs\(\) \{\s*syncCycleUrl\(state\.activeCycleId\)/],
    [read('record/index.html'), 'syncCycleUrl', /elements\.cycleSelect\.value = state\.cycle;\s*syncCycleUrl\(state\.cycle\)/],
    [read('hero/index.html'), 'syncTitleCycleUrl', /titleCycle = cycleId;\s*syncTitleCycleUrl\(cycleId\)/],
  ];
  for (const [source, name, wiring] of sources) {
    assert.match(source, wiring, name + ' is wired into the cycle switch');
    const calls = [];
    let currentHref = 'http://localhost/module/index.html?cycle=c1&keep=1';
    const context = vm.createContext({
      URL,
      window: {
        location: { get href() { return currentHref; } },
        history: {
          replaceState: (state, title, url) => {
            calls.push([state, title, url]);
            currentHref = String(url);
          },
        },
      },
    });
    vm.runInContext(extract(source, name), context);
    context[name]('c2');
    assert.equal(calls.length, 1, name + ' rewrites the URL once');
    const url = new URL(calls[0][2]);
    assert.equal(url.searchParams.get('cycle'), 'c2');
    assert.equal(url.searchParams.get('keep'), '1', 'other query params survive');
    context[name]('c2');
    assert.equal(calls.length, 1, name + ' does not rewrite an already matching URL');
  }
});
const nativeRouterSource = extract(read('assets/page-focus-router.js'), 'focusOrNavigate');
function nativeReturnHarness(kind, { saveFails = false, nativeHandles = true } = {}) {
  const harness = kind === 'map' ? mapHarness({ saveFails }) : technologyHarness({ saveFails });
  const { context, calls } = harness;
  context.window.location.href = `file:///android_asset/web/${kind === 'map' ? 'map' : 'technology'}/index.html`;
  context.window.ATO_ANDROID_SINGLE_WINDOW = true;
  context.window.ATOAndroid = { openModuleTab(url) { calls.push('native-tab:' + url); return nativeHandles; } };
  context.isSingleWindowMode = () => true;
  context.moduleFromUrl = () => 'dashboard';
  context.currentModule = kind;
  vm.runInContext(nativeRouterSource, context);
  context.window.ATO_PAGE_ROUTER.isSinglePageMode = () => true;
  context.window.ATO_PAGE_ROUTER.focusOrNavigate = context.focusOrNavigate;
  return harness;
}

test('Android map and technology return to the dashboard tab only after their saves succeed', async () => {
  for (const kind of ['map', 'technology']) {
    const { context, calls } = nativeReturnHarness(kind);
    await (kind === 'map' ? context.saveAndReturnToDashboard() : context.saveAndReturnMain());
    const handoff = calls.indexOf('native-tab:file:///android_asset/web/index.html');
    const save = calls.indexOf(kind === 'map' ? 'save-dashboard' : 'write-snapshot');
    assert.ok(save >= 0 && handoff > save, `${kind} must save before switching tabs`);
    assert.match(context.window.location.href, new RegExp(`/${kind}/index\\.html$`));

    const failed = nativeReturnHarness(kind, { saveFails: true });
    await (kind === 'map' ? failed.context.saveAndReturnToDashboard() : failed.context.saveAndReturnMain());
    assert.ok(!failed.calls.some(call => call.startsWith('native-tab:')), `${kind} must remain open after a failed save`);
  }
});

test('Android falls back to current-page navigation with an older or unavailable tab bridge', async () => {
  const { context, calls } = nativeReturnHarness('technology', { nativeHandles: false });
  await context.saveAndReturnMain();
  assert.ok(calls.includes('native-tab:file:///android_asset/web/index.html'));
  assert.equal(context.window.location.href, 'file:///android_asset/web/index.html');
});
