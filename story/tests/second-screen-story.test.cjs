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
const SCAN = './data/ato-storybook-key-scans/c1-0-0.jpg';

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
    sectionLabel: { textContent: '主线' },
    storyText: { textContent: '阅读器里的文本' },
    window: { location: { href: 'http://localhost:8080/story/index.html' } },
    URL,
    ...overrides,
  });
  ['supportsOfficialVersion', 'getDisplayEntry', 'buildSecondScreenStorySnapshot']
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
    fetch: async () => ({ ok: true, status: 200 }),
    buildSecondScreenStorySnapshot: () => ({ id: '0001', title: '标题', text: '正文' }),
    window: {
      clearTimeout() {},
      // 120ms 的那次调度留给测试自己驱动；重试等待（400/800ms）直接放行，
      // 否则 await 会卡在没人触发的定时器上。
      setTimeout(fn, ms) { if (Number(ms) < 200) { timers.push(fn); return timers.length; } fn(); return 0; },
    },
  });
  ['postSecondScreenStorySnapshot', 'reportSecondScreenSnapshotFailure',
    'clearSecondScreenSnapshotFailure', 'secondScreenStoryModeTitle', 'scheduleSecondScreenStorySnapshot']
    .forEach(name => vm.runInContext(slice(STORY_SOURCE, name, '  '), context));
  return context;
}

test('快照写失败会重试并把原因留在第二屏开关提示里', async () => {
  const ctx = storyPageContext();
  let calls = 0;
  ctx.fetch = async () => { calls += 1; return { ok: false, status: 401 }; };
  ctx.scheduleSecondScreenStorySnapshot();
  assert.equal(ctx.__timers.length, 1, '快照是先排一次定时器再发');
  await ctx.__timers.shift()();
  assert.equal(calls, 3, '失败要重试到上限');
  assert.match(ctx.secondScreenStoryModeLabel.title, /401/);
  assert.ok(ctx.secondScreenStoryModeLabel.classList.contains('sync-error'));
  // 状态刷新重写提示时，失败原因不能被刷掉
  assert.match(ctx.secondScreenStoryModeTitle(ctx.SECOND_SCREEN_STORY_MODE_TITLE), /401/);

  ctx.fetch = async () => { calls += 1; return { ok: true, status: 200 }; };
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
