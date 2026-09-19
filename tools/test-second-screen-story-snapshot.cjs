/* 第二屏故事快照回归测试（永久化自 tmp/code-review/frontend/verify-story-second-screen-fixes.cjs）。
 *
 * 运行：node tools/test-second-screen-story-snapshot.cjs
 *
 * 只跑源码里的真实函数：
 *   - story/assets/app.js: buildSecondScreenStorySnapshot / scheduleSecondScreenStorySnapshot
 *     （外加 supportsOfficialVersion、getDisplayEntry、postSecondScreenStorySnapshot ...）
 *   - ss/app.js: storyScanImages / hasStorySnapshot / openStory
 * 断言：
 *   1. Android 的 file:///android_asset/web/... 与 HTTP 两种基准下，快照里存的是同一个
 *      应用相对资源路径；
 *   2. 第二屏按自己的 HTTP 根解析后，得到的 URL 正好对应 Android 本机服务器能取到的
 *      资源键 story/data/ato-storybook-key-scans/c1-0-0.jpg（已存的老快照也治得好）；
 *   3. 跨站绝对地址一律忽略；
 *   4. 扫描图一张都加载失败时第二屏不留白，退回快照另存的正文（正文也缺时给一句说明）；
 *   5. 官方扫描图开关关闭时，快照改发官方正文而不带图片路径；
 *   6. 被取代的旧条目 400ms 重试不能再 POST，不能覆盖新条目（另附旧逻辑对照组）。
 *
 * 路径按本文件位置解析。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const STORY_SOURCE = fs.readFileSync(path.join(ROOT, 'story', 'assets', 'app.js'), 'utf8');
const SS_SOURCE = fs.readFileSync(path.join(ROOT, 'ss', 'app.js'), 'utf8');

function extract(source, name, indent) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const end = source.indexOf(`\n${indent}}`, start);
  assert.ok(start >= 0 && end >= 0, `找不到函数 ${name}`);
  return source.slice(start, end + indent.length + 2);
}

const failures = [];
async function check(label, body) {
  try {
    await body();
  } catch (error) {
    failures.push(`${label}：${error.message}`);
  }
}

// ---- 1. 故事页：快照存的是应用相对路径 --------------------------------------
const SCAN = './data/ato-storybook-key-scans/c1-0-0.jpg';

function storySnapshotContext(locationHref) {
  const context = vm.createContext({
    storyVersion: '官方版',
    activeEntry: { key: 'entry', id: '0001', title: '民间标题', text: '民间正文', chapter: '主线' },
    currentBook: () => ({ id: 'c1', title: '故事书' }),
    officialEntries: new Map([['c1:entry', {
      officialTitle: '官方标题',
      officialText: '官方正文',
      officialStatus: 'ready',
      officialScan: { src: SCAN, status: 'exact' },
    }]]),
    sectionLabel: { textContent: '主线' },
    storyText: { textContent: '阅读器里的文本' },
    secondScreenStoryContentToggle: { checked: true },
    // 官方数据声明了扫描图但本机没有这张图时，加载失败过的条目登记在这里。
    missingOfficialScans: new Set(),
    window: { location: { href: locationHref } },
    URL,
  });
  ['supportsOfficialVersion', 'getDisplayEntry', 'officialScanMissingLocally', 'buildSecondScreenStorySnapshot']
    .forEach((name) => vm.runInContext(extract(STORY_SOURCE, name, '  '), context));
  return context;
}

const androidSnapshot = storySnapshotContext('file:///android_asset/web/story/index.html').buildSecondScreenStorySnapshot();
const httpSnapshot = storySnapshotContext('http://192.168.1.5/story/index.html').buildSecondScreenStorySnapshot();
const textSnapshotContext = storySnapshotContext('http://192.168.1.5/story/index.html');
textSnapshotContext.secondScreenStoryContentToggle.checked = false;
const textSnapshot = textSnapshotContext.buildSecondScreenStorySnapshot();

// ---- 2. 第二屏：按自己的 HTTP 根解析，并核对服务器真能取到这张图 ----------------
function ssStoryContext(href, origin) {
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
  const createdImages = [];
  const context = vm.createContext({
    elements,
    activeMode: 'map',
    storyRenderKey: '',
    storyRendered: false,
    document: {
      createElement: (tag) => {
        const handlers = {};
        const image = { tag, src: '', alt: '', addEventListener: (type, fn) => { handlers[type] = fn; } };
        image.fireError = () => handlers.error?.();
        createdImages.push(image);
        return image;
      },
    },
    window: { location: { href, origin } },
    URL,
    fitStoryTextToViewport() { context.fitCalls = (context.fitCalls || 0) + 1; },
  });
  ['storyScanImages', 'hasStorySnapshot', 'openStory']
    .forEach((name) => vm.runInContext(extract(SS_SOURCE, name, ''), context));
  context.createdImages = createdImages;
  return context;
}

// LocalSecondScreenServer.serveStatic 的映射：pathname 去掉开头的 "/" 就是资源键，
// 先查 AtopackStore，再退回 APK 的 assets "web/" + relative。
function serverAssetCandidates(pathname) {
  const relative = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return { atopackKey: relative, apkAsset: `web/${relative}` };
}
// AtopackStore.java:165 允许收进资料包的官方扫描图键（后缀 .jpg/.jpeg/.png/.webp，大小写不敏感）
const SCAN_KEY_RE = /^story\/data\/ato-storybook-key-scans\/c[123]-[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i;

const ss = ssStoryContext('http://192.168.1.5/ss/index.html', 'http://192.168.1.5');
const resolved = [...ss.storyScanImages(androidSnapshot)];

// ---- 4. 旧条目的重试不能覆盖新条目 ------------------------------------------
// 假 window：定时器像浏览器那样发唯一递增 id，clearTimeout 只删得掉还没执行的。
function storyPageContext() {
  const timers = new Map();
  let nextId = 0;
  const attempts = [];
  let server = null;
  const context = vm.createContext({
    secondScreenSnapshotUrl: '../api/campaign-state.php?section=story',
    SECOND_SCREEN_SNAPSHOT_ATTEMPTS: 3,
    SECOND_SCREEN_STORY_MODE_TITLE: '勾选后第二屏显示当前故事文本，取消勾选后显示地图',
    secondScreenSnapshotFailure: '',
    secondScreenModeFailure: '',
    secondScreenSnapshotTimer: null,
    secondScreenStoryModeLabel: {
      title: '',
      classList: { names: new Set(), add(n) { this.names.add(n); }, remove(n) { this.names.delete(n); }, contains(n) { return this.names.has(n); } },
    },
    secondScreenStoryModeToggle: { disabled: false },
    console: { warn() {} },
    campaignSession: null,
    storySectionRevision: 0,
    activeStory: { id: 'A', title: 'A', text: '正文 A' },
    failingIds: ['A'],
    buildSecondScreenStorySnapshot: () => ({ ...context.activeStory }),
    fetch: async (url, options) => {
      const snapshot = JSON.parse(options.body).state;
      attempts.push(snapshot.id);
      if (context.failingIds.includes(snapshot.id)) throw new Error('temporary network failure');
      server = snapshot;
      return { ok: true, status: 200, json: async () => ({ ok: true, revision: attempts.length }) };
    },
    window: {
      clearTimeout(id) { timers.delete(id); },
      setTimeout(callback, ms) { timers.set(++nextId, { callback, ms }); return nextId; },
    },
  });
  ['currentCampaignAccountId', 'postSecondScreenStorySnapshot', 'reportSecondScreenSnapshotFailure', 'clearSecondScreenSnapshotFailure',
    'secondScreenStoryModeTitle', 'scheduleSecondScreenStorySnapshot']
    .forEach((name) => vm.runInContext(extract(STORY_SOURCE, name, '  '), context));
  context.__timers = timers;
  context.__attempts = attempts;
  context.__server = () => server;
  context.__fire = (id) => {
    const timer = timers.get(id);
    timers.delete(id);
    return timer.callback();
  };
  return context;
}

const retryTimerIds = (page) => [...page.__timers.entries()].filter(([, timer]) => timer.ms === 400).map(([id]) => id);

async function main() {
  await check('Android(file://) 与 HTTP 两侧的快照存同一个应用相对资源路径', () => {
    assert.deepEqual([...androidSnapshot.images], ['/story/data/ato-storybook-key-scans/c1-0-0.jpg']);
    assert.deepEqual([...httpSnapshot.images], [...androidSnapshot.images]);
    // 旧实现存的是 pathname：Android 上是 /android_asset/web/story/data/...
    assert.equal(new URL(SCAN, 'file:///android_asset/web/story/index.html').pathname,
      '/android_asset/web/story/data/ato-storybook-key-scans/c1-0-0.jpg');
  });

  await check('imagesOnly 快照另存一份正文供回退，text 仍为空', () => {
    assert.equal(androidSnapshot.imagesOnly, true);
    assert.equal(androidSnapshot.text, '');
    assert.equal(androidSnapshot.fallbackText, '官方正文');
    assert.equal(httpSnapshot.fallbackText, '官方正文');
  });

  await check('官方扫描图开关关闭时，第二屏快照改发官方正文', () => {
    assert.equal(textSnapshot.imagesOnly, false);
    assert.deepEqual([...textSnapshot.images], []);
    assert.equal(textSnapshot.text, '官方正文');
    assert.equal(textSnapshot.fallbackText, '');
  });

  await check('第二屏解析到自己的 HTTP 根，且服务器拿得到这张图', () => {
    assert.deepEqual(resolved, ['http://192.168.1.5/story/data/ato-storybook-key-scans/c1-0-0.jpg']);
    const mapped = serverAssetCandidates(new URL(resolved[0]).pathname);
    assert.equal(mapped.atopackKey, 'story/data/ato-storybook-key-scans/c1-0-0.jpg');
    assert.match(mapped.atopackKey, SCAN_KEY_RE);
    assert.equal(mapped.apkAsset, 'web/story/data/ato-storybook-key-scans/c1-0-0.jpg');
    // 旧行为：Android 内部路径会让服务器去查 web/android_asset/web/story/...（取不到）
    const legacy = serverAssetCandidates('/android_asset/web/story/data/ato-storybook-key-scans/c1-0-0.jpg');
    assert.equal(legacy.apkAsset, 'web/android_asset/web/story/data/ato-storybook-key-scans/c1-0-0.jpg');
    assert.doesNotMatch(legacy.atopackKey, SCAN_KEY_RE);
  });

  await check('已存进存档的老 Android 快照（带 APK 前缀）也能被治好', () => {
    assert.deepEqual([...ss.storyScanImages({ images: ['/android_asset/web/story/data/ato-storybook-key-scans/c1-0-0.jpg'] })], resolved);
  });

  await check('跨站绝对地址仍然一律忽略', () => {
    assert.deepEqual([...ss.storyScanImages({ images: ['https://other.example/story/data/ato-storybook-key-scans/c1-0-0.jpg'] })], []);
  });

  await check('扫描图路径大小写不同也照样认（.JPG / 大写目录）', () => {
    assert.deepEqual(
      [...ss.storyScanImages({ images: ['/story/data/ato-storybook-key-scans/C1-0-0.JPG'] })],
      ['http://192.168.1.5/story/data/ato-storybook-key-scans/C1-0-0.JPG']);
    assert.deepEqual(
      [...ss.storyScanImages({ images: ['/STORY/DATA/ATO-STORYBOOK-KEY-SCANS/c2-15-3.PNG'] })],
      ['http://192.168.1.5/STORY/DATA/ATO-STORYBOOK-KEY-SCANS/c2-15-3.PNG']);
    assert.match('story/data/ato-storybook-key-scans/C1-0-0.JPG', SCAN_KEY_RE);
  });

  await check('扫描图加载失败时退回快照带的正文', () => {
    const page = ssStoryContext('http://192.168.1.5/ss/index.html', 'http://192.168.1.5');
    page.openStory({ storyRevision: 1, story: androidSnapshot });
    assert.equal(page.elements.storyView.classList.contains('images-only'), true);
    assert.equal(page.createdImages.length, 1);
    assert.equal(page.createdImages[0].src, resolved[0]);
    page.createdImages[0].fireError();
    assert.equal(page.elements.storyView.classList.contains('images-only'), false);
    assert.equal(page.elements.storyBody.textContent, '官方正文');
    assert.ok(page.fitCalls > 0, '退回正文后要重新适配字号');
  });

  await check('正文也缺时给出一句说明，而不是留白', () => {
    const page = ssStoryContext('http://192.168.1.5/ss/index.html', 'http://192.168.1.5');
    page.openStory({ storyRevision: 1, story: { imagesOnly: true, images: [...androidSnapshot.images], id: '0001', title: 't', text: '' } });
    page.createdImages[0].fireError();
    assert.match(page.elements.storyBody.textContent, /官方扫描图加载失败/);
  });

  await check('被取代的旧条目重试不再 POST，存档保持新条目 B（含旧逻辑对照组）', async () => {
    const page = storyPageContext();
    page.scheduleSecondScreenStorySnapshot();
    const pendingA = page.__fire(1); // A 第一次 POST 失败，进入 400ms 重试等待
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(retryTimerIds(page), [2], 'A 应该正在等 400ms 重试');
    page.activeStory = { id: 'B', title: 'B', text: '正文 B' };
    page.scheduleSecondScreenStorySnapshot();
    await page.__fire(3); // 用户切到 B 之后 B 的快照成功写入
    assert.equal(page.__server().id, 'B');
    page.__fire(2); // A 的 400ms 重试醒来
    await pendingA;
    assert.equal(page.__server().id, 'B');
    assert.deepEqual([...page.__attempts], ['A', 'B'], '只应有 A 的首次失败和 B 的成功');
    assert.deepEqual(retryTimerIds(page), [], '重试定时器已消耗，不会再有第三次尝试');

    // 对照组：照抄旧的调度逻辑（没有代次比对），确认上面这套断言抓得住原来那个缺陷
    await legacyControlGroup();
  });

  if (failures.length) {
    console.error('第二屏故事快照回归测试失败：');
    failures.forEach((item) => console.error('  ' + item));
    process.exitCode = 1;
    return;
  }
  console.log('第二屏故事快照回归测试通过：快照存应用相对路径、老 Android 前缀被修复、跨站地址忽略、图片失败回退正文、被取代的重试不覆盖新快照（含旧逻辑对照组）');
}

// 对照组：旧的调度逻辑没有代次比对，被取代的条目重试会把旧快照覆盖回去。
async function legacyControlGroup() {
  const legacyTimers = new Map();
  let legacyNextId = 0;
  const legacyAttempts = [];
  let legacyServer = null;
  const legacy = vm.createContext({
    SECOND_SCREEN_SNAPSHOT_ATTEMPTS: 3,
    secondScreenSnapshotTimer: null,
    console: { warn() {} },
    activeStory: { id: 'A' },
    buildSecondScreenStorySnapshot: () => ({ ...legacy.activeStory }),
    fetch: async (url, options) => {
      const snapshot = JSON.parse(options.body).state;
      legacyAttempts.push(snapshot.id);
      if (snapshot.id === 'A' && legacyAttempts.length === 1) throw new Error('temporary network failure');
      legacyServer = snapshot;
      return { ok: true, status: 200, json: async () => ({ ok: true, revision: legacyAttempts.length }) };
    },
    window: {
      clearTimeout(id) { legacyTimers.delete(id); },
      setTimeout(callback, ms) { legacyTimers.set(++legacyNextId, { callback, ms }); return legacyNextId; },
    },
  });
  vm.runInContext(`async function postSecondScreenStorySnapshot(snapshot) {
    return fetch(null, { body: JSON.stringify({ section: "story", state: snapshot }) });
  }
  async function legacySchedule() {
    window.clearTimeout(secondScreenSnapshotTimer);
    secondScreenSnapshotTimer = window.setTimeout(async () => {
      const snapshot = buildSecondScreenStorySnapshot();
      if (!snapshot) return;
      for (let attempt = 0; attempt < SECOND_SCREEN_SNAPSHOT_ATTEMPTS; attempt += 1) {
        try {
          await postSecondScreenStorySnapshot(snapshot);
          return;
        } catch (error) {
          if (attempt < SECOND_SCREEN_SNAPSHOT_ATTEMPTS - 1) await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }, 120);
  }`, legacy, { filename: 'legacy-pre-fix-schedule.js' });
  const fireLegacy = (id) => {
    const timer = legacyTimers.get(id);
    legacyTimers.delete(id);
    return timer.callback();
  };
  legacy.legacySchedule();
  const legacyPending = fireLegacy(1);
  await new Promise((resolve) => setImmediate(resolve));
  legacy.activeStory = { id: 'B' };
  legacy.legacySchedule();
  await fireLegacy(3);
  assert.equal(legacyServer.id, 'B');
  fireLegacy(2);
  await legacyPending;
  // 没有代次比对的旧逻辑：A 的重试把已经写好的 B 覆盖回去了。
  assert.equal(legacyServer.id, 'A', '对照组应当复现旧缺陷（否则上面的断言抓不住回归）');
  assert.deepEqual([...legacyAttempts], ['A', 'B', 'A']);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
