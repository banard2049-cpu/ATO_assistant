/* 第二屏故事：官方版没有对应扫描图时必须退回正文
 *
 * 运行：node story/tests/second-screen-story.test.cjs
 *
 * 覆盖：
 *   1. story 页发给第二屏的快照：官方版有扫描图才走「只看扫描图」，
 *      该条目没有扫描图时改发正文（官方版正文缺失时就是阅读器里那句占位提示）；
 *   2. 第二屏收到 imagesOnly 但拿不到本站扫描图时，同样退回正文而不是留白；
 *   3. 快照没写进存档时（空 section）第二屏保留上一屏内容，不再显示阅读器视角的提示；
 *   4. 故事页写快照失败会重试，并把原因留在第二屏开关的提示里；
 *   5. 切换第二屏显示失败（PHP 409）时把服务端原因带回来，别只把勾选弹回去。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const STORY_SOURCE = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
const SS_SOURCE = fs.readFileSync(path.join(__dirname, '../../ss/app.js'), 'utf8');
const STORY_STYLES = fs.readFileSync(path.join(__dirname, '../assets/styles.css'), 'utf8');
const SCAN = './data/ato-storybook-key-scans/c1-0-0.jpg';

function sourceConst(name) {
  const match = new RegExp(`const ${name} = "([^"]+)"`).exec(STORY_SOURCE);
  assert.ok(match, `找不到常量 ${name}`);
  return match[1];
}

// 本机没有原书页时阅读器用的那句话，直接取源码里的值，避免测试自己造一份文案。
const MISSING_SCAN_HINT = sourceConst('MISSING_OFFICIAL_SCAN_HINT');
assert.match(MISSING_SCAN_HINT, /本地未提供原书页/);

function slice(source, name, indent) {
  // 有的函数是 async 声明的，两种写法都要能找到
  const start = Math.max(
    source.indexOf(`${indent}function ${name}(`),
    source.indexOf(`${indent}async function ${name}(`),
  );
  assert.ok(start >= 0, `找不到函数 ${name}`);
  const end = source.indexOf(`\n${indent}}`, start) + indent.length + 2;
  return source.slice(start, end);
}

function storyContext(overrides = {}) {
  const context = vm.createContext({
    storyVersion: '民间版',
    activeEntry: { key: 'entry', id: '0001', title: '民间标题', text: '民间正文', chapter: '主线' },
    currentBook: () => ({ id: 'c1', title: '故事书' }),
    officialEntries: new Map(),
    // 官方数据声明了扫描图但本机没有这张图时，失败过的条目登记在这里。
    missingOfficialScans: new Set(),
    sectionLabel: { textContent: '主线' },
    storyText: { textContent: '阅读器里的文本' },
    window: { location: { href: 'http://localhost:8080/story/index.html' } },
    URL,
    ...overrides,
  });
  ['supportsOfficialVersion', 'getDisplayEntry', 'officialScanMissingLocally', 'buildSecondScreenStorySnapshot']
    .forEach(name => vm.runInContext(slice(STORY_SOURCE, name, '  '), context));
  return context;
}

function ssContext() {
  const makeElement = () => ({
    hidden: true,
    textContent: '',
    children: [],
    scrollTop: 0,
    style: {},
    classList: {
      names: new Set(),
      toggle(name, on) { if (on) this.names.add(name); else this.names.delete(name); },
      add(name) { this.names.add(name); },
      remove(name) { this.names.delete(name); },
      contains(name) { return this.names.has(name); },
    },
    replaceChildren() { this.children = []; },
    append(child) { this.children.push(child); },
  });
  const elements = {
    unavailableView: makeElement(),
    mapStage: makeElement(),
    storyView: makeElement(),
    storyBookTitle: makeElement(),
    storySection: makeElement(),
    storyTitle: makeElement(),
    storyEntryId: makeElement(),
    storyBody: makeElement(),
    battleView: makeElement(),
  };
  const context = vm.createContext({
    elements,
    activeMode: 'map',
    storyRenderKey: '',
    storyRendered: false,
    document: { createElement: tag => ({ tag, src: '', alt: '' }) },
    window: { location: { href: 'http://localhost:8080/ss/index.html', origin: 'http://localhost:8080' } },
    URL,
    fitStoryTextToViewport() { context.fitCalls = (context.fitCalls || 0) + 1; },
  });
  ['storyScanImages', 'hasStorySnapshot', 'openStory']
    .forEach(name => vm.runInContext(slice(SS_SOURCE, name, ''), context));
  return context;
}

test('官方版有扫描图时第二屏只看扫描图', () => {
  const ctx = storyContext({
    storyVersion: '官方版',
    officialEntries: new Map([['c1:entry', {
      officialTitle: '官方标题',
      officialText: '官方正文',
      officialStatus: 'ready',
      officialScan: { src: SCAN, status: 'exact' },
    }]]),
  });
  const snapshot = ctx.buildSecondScreenStorySnapshot();
  assert.equal(snapshot.imagesOnly, true);
  assert.deepEqual([...snapshot.images], ['/story/data/ato-storybook-key-scans/c1-0-0.jpg']);
  assert.equal(snapshot.text, '');
  assert.equal(snapshot.title, '官方标题');
});

test('官方版没有对应扫描图时第二屏显示正文', () => {
  const ctx = storyContext({
    storyVersion: '官方版',
    officialEntries: new Map([['c1:entry', {
      officialTitle: '官方标题',
      officialText: '官方正文',
      officialStatus: 'ready',
      officialScan: { src: null, status: 'missing' },
    }]]),
  });
  const snapshot = ctx.buildSecondScreenStorySnapshot();
  assert.equal(snapshot.imagesOnly, false);
  assert.deepEqual([...snapshot.images], []);
  assert.equal(snapshot.text, '官方正文');
  assert.equal(snapshot.title, '官方标题');
});

test('官方版正文与扫描图都没有时第二屏显示占位提示', () => {
  const ctx = storyContext({
    storyVersion: '官方版',
    officialEntries: new Map([['c1:entry', {
      officialText: null,
      officialScan: { src: null, status: 'missing' },
      officialSource: { pdf: '奥得赛·无情烈日.pdf', pages: [] },
    }]]),
  });
  const snapshot = ctx.buildSecondScreenStorySnapshot();
  assert.equal(snapshot.imagesOnly, false);
  assert.match(snapshot.text, /官方版暂无正文/);
  assert.equal(snapshot.title, '民间标题');
});

test('民间版仍然发民间正文，不受扫描图影响', () => {
  const ctx = storyContext({
    officialEntries: new Map([['c1:entry', {
      officialText: '官方正文',
      officialScan: { src: SCAN, status: 'exact' },
    }]]),
  });
  const snapshot = ctx.buildSecondScreenStorySnapshot();
  assert.equal(snapshot.imagesOnly, false);
  assert.equal(snapshot.text, '民间正文');
  assert.equal(snapshot.title, '民间标题');
});

test('民间版隐藏第二屏显示图片复选框，官方版才显示', () => {
  const label = {
    hidden: false,
    title: '旧提示',
    classList: { remove() {}, toggle() {} },
  };
  const toggle = { checked: true, disabled: false };
  const ctx = vm.createContext({
    storyVersion: '民间版',
    activeEntry: { key: 'entry' },
    currentBook: () => ({ id: 'c1' }),
    officialEntries: new Map(),
    missingOfficialScans: new Set(),
    secondScreenStoryImagesPreference: true,
    SECOND_SCREEN_STORY_CONTENT_TITLE: '官方版有扫描图时，勾选后第二屏显示原书扫描图，取消勾选后显示官方正文',
    secondScreenStoryContentLabel: label,
    secondScreenStoryContentToggle: toggle,
  });
  ['supportsOfficialVersion', 'activeOfficialScan', 'officialScanMissingLocally', 'refreshSecondScreenStoryContentToggle']
    .forEach(name => vm.runInContext(slice(STORY_SOURCE, name, '  '), ctx));

  ctx.refreshSecondScreenStoryContentToggle(true);
  assert.equal(label.hidden, true);
  assert.equal(toggle.disabled, true);

  ctx.storyVersion = '官方版';
  ctx.officialEntries = new Map([['c1:entry', { officialScan: { src: SCAN } }]]);
  ctx.refreshSecondScreenStoryContentToggle(true);
  assert.equal(label.hidden, false);
  assert.equal(toggle.disabled, false);
  assert.match(STORY_STYLES, /\.second-screen-mode-toggle\[hidden\]\s*\{\s*display:\s*none;/);
});

test('第二屏只有拿到本站扫描图才走只看扫描图的分支', () => {
  const ctx = ssContext();
  ctx.openStory({ story: { imagesOnly: true, images: ['/story/data/ato-storybook-key-scans/c1-0-0.jpg'] } });
  assert.equal(ctx.elements.storyView.classList.contains('images-only'), true);
  assert.equal(ctx.elements.storyBody.children.length, 1);
  assert.equal(ctx.elements.storyBody.children[0].src, 'http://localhost:8080/story/data/ato-storybook-key-scans/c1-0-0.jpg');
});

test('第二屏拿不到扫描图时显示正文', () => {
  const ctx = ssContext();
  ctx.openStory({
    story: {
      imagesOnly: true,
      images: ['https://other.example/story/data/ato-storybook-key-scans/c1-0-0.jpg'],
      text: '官方正文',
    },
  });
  assert.equal(ctx.elements.storyView.classList.contains('images-only'), false);
  assert.equal(ctx.elements.storyBody.children.length, 0);
  assert.equal(ctx.elements.storyBody.textContent, '官方正文');
  assert.ok(ctx.fitCalls > 0);

  ctx.storyRenderKey = '';
  ctx.openStory({ story: { imagesOnly: true, images: [], id: '0001', title: 't', text: '' } });
  assert.match(ctx.elements.storyBody.textContent, /暂无对应的官方扫描图与正文/);
});

test('第二屏没有快照时保留上一屏内容，不再显示阅读器视角的提示', () => {
  const ctx = ssContext();
  ctx.openStory({ storyRevision: 1, story: { id: '0001', title: '测试', text: '正文' } });
  assert.equal(ctx.elements.storyBody.textContent, '正文');
  // 存档里没有 story 快照时，PHP 会返回空数组或空对象；第二屏不该把已显示的正文顶掉。
  for (const empty of [[], {}]) {
    ctx.openStory({ storyRevision: 2, story: empty });
    assert.equal(ctx.elements.storyBody.textContent, '正文', `空快照 ${JSON.stringify(empty)} 不应清屏`);
  }
});

test('第二屏对没有正文的条目说自己的话，不用阅读器的提示', () => {
  const ctx = ssContext();
  ctx.openStory({ storyRevision: 9, story: { id: '0001', title: '只有图片的条目' } });
  assert.equal(ctx.elements.storyBody.textContent, '该条目暂无正文文本。');
  assert.equal(ctx.elements.storyTitle.textContent, '只有图片的条目');
});

test('第二屏从未收到过快照时给出等待提示', () => {
  const ctx = ssContext();
  ctx.openStory({ storyRevision: 7, story: [] });
  assert.equal(ctx.elements.storyView.classList.contains('images-only'), false);
  assert.equal(ctx.elements.storyTitle.textContent, '等待故事文本');
  assert.match(ctx.elements.storyBody.textContent, /还没有收到故事书阅读文本/);
  assert.match(ctx.elements.storyBody.textContent, /同一个账号/);
});

test('第二屏内容没变时不重复渲染', () => {
  const ctx = ssContext();
  const screen = { storyRevision: 3, story: { id: '0001', text: '官方正文' } };
  ctx.openStory(screen);
  assert.equal(ctx.elements.storyBody.textContent, '官方正文');
  ctx.elements.storyBody.textContent = '保持不变';
  ctx.openStory(screen);
  assert.equal(ctx.elements.storyBody.textContent, '保持不变');
});

function storyPageContext() {
  const timers = [];
  const label = {
    title: '',
    classList: {
      names: new Set(),
      add(name) { this.names.add(name); },
      remove(name) { this.names.delete(name); },
      contains(name) { return this.names.has(name); },
    },
  };
  const context = vm.createContext({
    __timers: timers,
    secondScreenSnapshotUrl: '../api/campaign-state.php?section=story',
    SECOND_SCREEN_SNAPSHOT_ATTEMPTS: 3,
    SECOND_SCREEN_STORY_MODE_TITLE: '勾选后第二屏显示当前故事文本，取消勾选后显示地图',
    secondScreenSnapshotFailure: '',
    secondScreenModeFailure: '',
    secondScreenSnapshotTimer: null,
    secondScreenStoryModeLabel: label,
    secondScreenStoryModeToggle: { disabled: false },
    console: { warn() {} },
    campaignSession: null,
    storySectionRevision: 0,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, revision: 1 }) }),
    buildSecondScreenStorySnapshot: () => ({ id: '0001', title: '标题', text: '正文' }),
    window: {
      clearTimeout() {},
      // 120ms 的那次调度留给测试自己驱动；重试等待（400/800ms）直接放行，
      // 否则 await 会卡在没人触发的定时器上。
      setTimeout(fn, ms) { if (Number(ms) < 200) { timers.push(fn); return timers.length; } fn(); return 0; },
    },
  });
  ['currentCampaignAccountId', 'postSecondScreenStorySnapshot', 'reportSecondScreenSnapshotFailure',
    'clearSecondScreenSnapshotFailure', 'secondScreenStoryModeTitle', 'scheduleSecondScreenStorySnapshot']
    .forEach(name => vm.runInContext(slice(STORY_SOURCE, name, '  '), context));
  return context;
}

test('快照写失败会重试并把原因留在第二屏开关提示里', async () => {
  const ctx = storyPageContext();
  let calls = 0;
  ctx.fetch = async () => { calls += 1; return { ok: false, status: 401, json: async () => ({ ok: false, error: 'HTTP 401' }) }; };
  ctx.scheduleSecondScreenStorySnapshot();
  assert.equal(ctx.__timers.length, 1, '快照是先排一次定时器再发');
  await ctx.__timers.shift()();
  assert.equal(calls, 3, '失败要重试到上限');
  assert.match(ctx.secondScreenStoryModeLabel.title, /401/);
  assert.ok(ctx.secondScreenStoryModeLabel.classList.contains('sync-error'));
  // 状态刷新重写提示时，失败原因不能被刷掉
  assert.match(ctx.secondScreenStoryModeTitle(ctx.SECOND_SCREEN_STORY_MODE_TITLE), /401/);

  ctx.fetch = async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ ok: true, revision: 2 }) }; };
  ctx.scheduleSecondScreenStorySnapshot();
  await ctx.__timers.shift()();
  assert.equal(ctx.secondScreenSnapshotFailure, '');
  assert.ok(!ctx.secondScreenStoryModeLabel.classList.contains('sync-error'));
  assert.equal(ctx.secondScreenStoryModeTitle(ctx.SECOND_SCREEN_STORY_MODE_TITLE), ctx.SECOND_SCREEN_STORY_MODE_TITLE);

  // 模式切换失败（PHP 回 409：第二屏没有为当前账号开启）也要留在提示里
  ctx.secondScreenModeFailure = '切换第二屏显示失败：Second screen is not enabled for this account.';
  assert.match(ctx.secondScreenStoryModeTitle(ctx.SECOND_SCREEN_STORY_MODE_TITLE), /not enabled/);
});

test('模式切换失败时把服务端原因交回调用方（以前只回 true/false）', async () => {
  function modeContext(payload, status) {
    const context = vm.createContext({
      secondScreenModeUrl: '../api/campaign-state.php?action=second-screen-mode',
      fetch: async () => ({ ok: status < 400, status, json: async () => payload }),
    });
    vm.runInContext(slice(STORY_SOURCE, 'setSecondScreenMode', '  '), context);
    return context;
  }

  const denied = await vm.runInContext('setSecondScreenMode("story")',
    modeContext({ ok: false, code: 'SCREEN_NOT_ENABLED', error: 'Second screen is not enabled for this account.' }, 409));
  assert.deepEqual(JSON.parse(JSON.stringify(denied)),
    { ok: false, error: 'Second screen is not enabled for this account.' });

  const saved = await vm.runInContext('setSecondScreenMode("story")', modeContext({}, 200));
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { ok: true, error: '' });
});

test('阅读器渲染的扫描图带兜底钩子，图取不到时换成同一句说明', () => {
  // 民间版资源包不带官方版故事书截图：官方数据里仍然声明着扫描图，本地却没有这张
  // 原书页。这时阅读器不能只留一个加载失败的方框。
  const calls = { refresh: 0, schedule: 0 };
  const ctx = vm.createContext({
    storyVersion: '官方版',
    currentBook: () => ({ id: 'c1' }),
    officialEntries: new Map([['c1:entry', { officialScan: { src: SCAN, status: 'exact' } }]]),
    missingOfficialScans: new Set(),
    MISSING_OFFICIAL_SCAN_HINT: MISSING_SCAN_HINT,
    secondScreenStoryModeToggle: { checked: true },
    refreshSecondScreenStoryContentToggle: () => { calls.refresh += 1; },
    scheduleSecondScreenStorySnapshot: () => { calls.schedule += 1; },
  });
  ['supportsOfficialVersion', 'escapeHtml', 'officialScanHintHtml', 'renderOfficialScan', 'handleStoryImageError']
    .forEach(name => vm.runInContext(slice(STORY_SOURCE, name, '  '), ctx));

  const html = ctx.renderOfficialScan({ key: 'entry', title: '民间标题' });
  assert.match(html, /data-supplement-scan="c1:entry"/);
  assert.match(html, /data-supplement-scan-hint/);
  assert.match(html, /data-page-viewer/);

  // 模拟这块 DOM：加载失败的是块里的 img，块自己带着登记键。
  const block = {
    replaced: '',
    getAttribute: name => (name === 'data-supplement-scan' ? 'c1:entry' : null),
    set outerHTML(value) { this.replaced = value; },
  };
  const image = { closest: selector => (selector === '[data-supplement-scan]' ? block : null) };
  assert.equal(ctx.handleStoryImageError({ target: image }), true);
  assert.ok(block.replaced.includes(MISSING_SCAN_HINT), '整块应换成「本地未提供原书页」的说明');
  assert.equal([...ctx.missingOfficialScans].join(), 'c1:entry');
  // 提示语换了口径，勾选框和第二屏快照都要跟着重算、重发
  assert.equal(calls.refresh, 1);
  assert.equal(calls.schedule, 1);

  // 再渲染同一个条目时不再发那个必然失败的图片请求
  const again = ctx.renderOfficialScan({ key: 'entry', title: '民间标题' });
  assert.doesNotMatch(again, /<img/);
  assert.ok(again.includes(MISSING_SCAN_HINT));

  // 别的图（战斗插图等）加载失败不归这里管，它们各自有 onerror 处理。
  assert.equal(ctx.handleStoryImageError({ target: { closest: () => null } }), false);
  assert.equal(ctx.handleStoryImageError({ target: null }), false);

  // 没声明扫描图时仍然只给一句提示，不产生会加载失败的 img。
  ctx.missingOfficialScans.clear();
  ctx.officialEntries = new Map([['c1:entry', { officialScan: null }]]);
  const emptyHtml = ctx.renderOfficialScan({ key: 'entry', title: '民间标题' });
  assert.match(emptyHtml, /该条目暂无对应的官方扫描图。/);
  assert.doesNotMatch(emptyHtml, /<img/);
});

test('扫描图本机缺失时勾选框只说没有这张图', () => {
  const label = {
    hidden: false,
    title: '',
    classList: { remove() {}, toggle() {} },
  };
  const toggle = { checked: true, disabled: false };
  const ctx = vm.createContext({
    storyVersion: '官方版',
    activeEntry: { key: 'entry' },
    currentBook: () => ({ id: 'c1' }),
    officialEntries: new Map([['c1:entry', { officialScan: { src: SCAN } }]]),
    missingOfficialScans: new Set(['c1:entry']),
    secondScreenStoryImagesPreference: true,
    SECOND_SCREEN_STORY_CONTENT_TITLE: '官方版有扫描图时，勾选后第二屏显示原书扫描图，取消勾选后显示官方正文',
    secondScreenStoryContentLabel: label,
    secondScreenStoryContentToggle: toggle,
  });
  ['supportsOfficialVersion', 'activeOfficialScan', 'officialScanMissingLocally', 'refreshSecondScreenStoryContentToggle']
    .forEach(name => vm.runInContext(slice(STORY_SOURCE, name, '  '), ctx));

  ctx.refreshSecondScreenStoryContentToggle(true);
  assert.equal(label.hidden, false);
  // 数据里有图、本机没有：勾选要弹回去并禁用，提示语也要说实话
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, true);
  assert.match(label.title, /本机没有这张原书扫描图/);
});

test('扫描图本机缺失时快照改发官方正文', () => {
  const ctx = storyContext({
    storyVersion: '官方版',
    officialEntries: new Map([['c1:entry', {
      officialTitle: '官方标题',
      officialText: '官方正文',
      officialStatus: 'ready',
      officialScan: { src: SCAN, status: 'exact' },
    }]]),
    missingOfficialScans: new Set(['c1:entry']),
  });
  const snapshot = ctx.buildSecondScreenStorySnapshot();
  assert.equal(snapshot.imagesOnly, false);
  assert.deepEqual([...snapshot.images], []);
  assert.equal(snapshot.text, '官方正文');
  assert.equal(snapshot.title, '官方标题');
});

test('阅读器在捕获阶段接管扫描图加载失败', () => {
  // error 事件不冒泡：漏了捕获阶段，兜底函数就永远不会被调用。
  assert.match(STORY_SOURCE, /storyText\.addEventListener\("error", handleStoryImageError, true\)/);
});
