// 主控台导入/导出回归测试（永久化自 tmp/code-review/verify-dashboard-fixes.cjs）。
//
// 运行：node tools/test-dashboard-import-export.cjs
//
// 锁定 index.html 里的存档修复：
//   1. 导出前先 flush，并且 dashboard / 顶层 profiles / legacyDashboard 三份必须
//      来自同一份快照；
//   2. flush 失败时改用内存快照，但三份仍必须一致，并标出 pendingLocalChanges；
//   3. 导入必须一次请求交全部模块（服务端整份校验、整份写入），失败时绝不提示
//      「导入完成」、不推进保存基线与 revision、也不切换本页档案；
//   4. 导入全部成功仍然提示成功，并推进 revision 与保存基线；
//   5. 备份必须带全 7 个 section（含 aibp / story），导出与导入两侧都如此；
//   6. 主控台地图命令遇到 409 必须读回最新状态再重放本次改动，同字段冲突则拒绝写入。
//
// 直接从 index.html 的内联脚本里抽真实函数跑，路径按本文件位置解析。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const attachmentsSource = fs.readFileSync(path.join(ROOT, 'assets/record-attachments.js'), 'utf8');

function between(start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `${start} .. ${end}`);
  return src.slice(a, b);
}

function extractFunction(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(src);
  assert.ok(match, name);
  const start = match.index;
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced function ${name}`);
}

// 按**声明**（而不是按名字）切一个顶层 async 函数：注释里先出现过函数名，
// 用名字搜索会从注释开始切，切出来是残片。
// 另外参数表是解构（`{ sections, dashboardImport, ... }`），必须从参数表的 `)` 之后
// 开始数花括号，否则第一个 `}` 就把函数切断了。
function extractAsyncDeclaration(name) {
  const needle = `async function ${name}(`;
  const start = src.indexOf(needle);
  assert.ok(start >= 0, needle);
  const paren = src.indexOf('(', start);
  let parens = 0;
  let bodyStart = -1;
  for (let i = paren; i < src.length; i += 1) {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') {
      parens -= 1;
      if (parens === 0) { bodyStart = i; break; }
    }
  }
  assert.ok(bodyStart >= 0, `参数表不闭合：${name}`);
  let depth = 0;
  for (let i = src.indexOf('{', bodyStart); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced function ${name}`);
}

const jsonHelpers = ['isPlainObject', 'cloneJson', 'jsonEqual', 'mergeCampaignValues', 'mergeCampaignSections'];
// 导出与导入共用的备份 section 清单就放在 exportState 上方，两侧都要用。
const backupPrelude = between('const backupSectionIds', 'async function exportState()');

const failures = [];
async function check(label, body) {
  try {
    await body();
  } catch (error) {
    failures.push(`${label}：${error.message}`);
  }
}

// FileReader 打桩：读取同步完成（按字节，因为「导入状态」要按内容判定 .jsave），
// onload 的 promise 存进 Reader.last.done。
class Reader {
  readAsArrayBuffer(file) {
    const text = JSON.stringify(file);
    const bytes = Buffer.from(text, 'utf8');
    this.result = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this.done = this.onload();
  }
  constructor() { Reader.last = this; }
}

async function main() {
  await check('北京时间跨日、跨年并保留真实时间点', () => {
    const ctx = vm.createContext({});
    vm.runInContext(extractFunction('beijingTimestamp'), ctx);
    const instant = '2026-12-31T18:04:05.123Z';
    const result = ctx.beijingTimestamp(instant);
    assert.equal(result, '2027-01-01T02:04:05.123+08:00');
    assert.equal(Date.parse(result), Date.parse(instant));
    assert.equal(ctx.beijingTimestamp(Date.parse(instant)), result);
  });
  await check('Android 导出等待文件实际写入结果', async () => {
    let filename;
    let contents;
    const androidWindow = { ATOAndroid: { exportStateJson(name, text) { filename = name; contents = text; } } };
    const ctx = vm.createContext({ window: androidWindow });
    vm.runInContext(extractFunction('beijingTimestamp') + '\n' + extractFunction('downloadJsonPayload'), ctx);
    let settled = false;
    const saved = ctx.downloadJsonPayload({ app: 'test', exportedAt: '2027-01-01T02:04:05.123+08:00' }).then(() => { settled = true; });
    assert.equal(filename, 'ato-full-save-2027-01-01T02-04-05-123+08-00.json');
    assert.equal(JSON.parse(contents).app, 'test');
    assert.equal(settled, false, '选择文件和写入完成前不能显示已下载');
    androidWindow.ATOAndroidExportResult({ ok: true });
    await saved;
    assert.equal(settled, true);
    const failed = ctx.downloadJsonPayload({ app: 'test' });
    androidWindow.ATOAndroidExportResult({ ok: false, error: '写入失败' });
    await assert.rejects(failed, /写入失败/);
  });

  // --- 导出：先 flush，三份 dashboard 拷件来自同一快照 ---
  await check('导出先 flush 且快照一致', async () => {
    const flushedFirst = [];
    let captured;
    const serverSections = {
      dashboard: { activeProfileId: 'p', profiles: { p: { note: 'server-new' } } },
      map: { users: {} }, record: {}, technology: {}, heroes: {},
      aibp: { mirror: 'synthetic battle' }, story: { bookId: 'synthetic story' },
    };
    const ctx = vm.createContext({
      saveState() { flushedFirst.push('saveState'); },
      flushCampaignSave: async () => { flushedFirst.push('flush'); return true; },
      elements: { exportButton: { textContent: 'export' } },
      loadFullCampaign: async () => { flushedFirst.push('loadFullCampaign'); return { sections: serverSections }; },
      archive: { activeProfileId: 'p', profiles: { p: { note: 'memory-new' } } },
      downloadJsonPayload: (payload) => { captured = payload; },
      // 导出失败路径会调 window.alert 报错；不桩掉的话这里抛 TypeError，把真正的失败原因盖掉。
      window: { setTimeout() {}, alert: (message) => { flushedFirst.push(`alert:${message}`); } },
    });
    vm.runInContext(attachmentsSource, ctx);
    vm.runInContext(jsonHelpers.map(extractFunction).join('\n'), ctx);
    vm.runInContext(backupPrelude + between('async function exportState()', 'function importStateFile('), ctx);
    await ctx.exportState();
    assert.deepEqual(flushedFirst, ['saveState', 'flush', 'loadFullCampaign'], '导出前必须先等待保存完成');
    assert.equal(captured.sections.dashboard.profiles.p.note, captured.profiles.p.note, '同一份快照');
    assert.equal(captured.legacyDashboard.profiles.p.note, captured.profiles.p.note, 'legacyDashboard 也必须是同一份快照');
    assert.equal(captured.sections.dashboard.profiles.p.note, 'server-new');
    assert.equal(captured.source.pendingLocalChanges, false);
    // 备份必须带全服务端支持的 section（含 aibp / story）
    assert.deepEqual(
      Object.keys(captured.sections).sort(),
      ['aibp', 'dashboard', 'heroes', 'map', 'record', 'story', 'technology'],
      '完整存档必须包含服务端支持的全部 section'
    );
    assert.equal(captured.sections.aibp.mirror, 'synthetic battle');
    assert.equal(captured.sections.story.bookId, 'synthetic story');
  });

  // --- 保存没能完成时导出：改用内存快照，但三份仍然一致并标出未同步 ---
  await check('flush 失败时导出内存快照且保持一致', async () => {
    let captured;
    const ctx = vm.createContext({
      saveState() {},
      flushCampaignSave: async () => false,
      elements: { exportButton: { textContent: 'export' } },
      loadFullCampaign: async () => ({ sections: { dashboard: { activeProfileId: 'p', profiles: { p: { note: 'server-stale' } } } } }),
      archive: { activeProfileId: 'p', profiles: { p: { note: 'memory-newest' } } },
      downloadJsonPayload: (payload) => { captured = payload; },
      // 导出失败路径会调 window.alert 报错；不桩掉的话这里抛 TypeError，把真正的失败原因盖掉。
      window: { setTimeout() {}, alert: () => {} },
    });
    vm.runInContext(attachmentsSource, ctx);
    vm.runInContext(jsonHelpers.map(extractFunction).join('\n'), ctx);
    vm.runInContext(backupPrelude + between('async function exportState()', 'function importStateFile('), ctx);
    await ctx.exportState();
    assert.equal(captured.sections.dashboard.profiles.p.note, 'memory-newest');
    assert.equal(captured.profiles.p.note, 'memory-newest');
    assert.equal(captured.legacyDashboard.profiles.p.note, 'memory-newest');
    assert.equal(captured.source.pendingLocalChanges, true);
  });

  const sections = { dashboard: { activeProfileId: 'p', profiles: { p: { id: 'p', state: { day: 1 }, note: 'imported' } } }, map: {}, record: {}, technology: {}, heroes: {} };
  let alertText = '';
  let postCount = 0;

  function importContext(extra = {}) {
    alertText = '';
    postCount = 0;
    const currentRevisions = extra.currentRevisions || {
      dashboard: 4, map: 1, record: 2, technology: 3, heroes: 0, aibp: 0, story: 0,
    };
    const write = extra.fetch;
    const ctx = vm.createContext({
      FileReader: Reader,
      authUrl: '/api/campaign-state.php',
      console: { warn() {} },
      normalizeArchive: (value) => value,
      currentCycle: () => ({ state: {} }),
      archive: {},
      state: {},
      campaignSaveTimer: null,
      clearTimeout() {},
      flushCampaignSave: async () => true,
      campaignSectionRevision: 4,
      campaignSectionExists: true,
      campaignSectionBaseline: {},
      campaignServerBaseline: {},
      cloneJson: (value) => JSON.parse(JSON.stringify(value)),
      campaignSyncChannel: null,
      syncInputs() {}, renderProfiles() {}, renderCycles() {}, renderFlow() {}, renderDateTrack() {},
      renderDashboardArchive() {},
      elements: { importInput: { value: 'fixture' } },
      // 「导入状态」现在按字节读文件（要按内容判定官方 .jsave），所以这几个全局必须有。
      TextDecoder, TextEncoder, Uint8Array, ArrayBuffer,
      window: {
        alert: (message) => { alertText = message; },
        // 「导入状态」现在会先判断两边的记录表笔记是否会被覆盖，确认框走 window.confirm。
        // 下面这些夹具的 loadFullCampaign() 都不带 sections.record，当前战役没有笔记 →
        // 不该弹窗；这里给一个「确定」的桩，避免缺桩把导入打死。
        // 覆盖警告本身的四条分支（含点取消不写服务端）在 tests/import-notes-overwrite-warning.test.cjs。
        confirm: () => true,
        // 本文件测的是 ATO 状态包（.json）路径；官方 .jsave 转换器在
        // tests/jsave-import.test.cjs 里单测，这里给一个「不是 jsave」的桩。
        ATO_JSAVE_IMPORT: {
          isJsave: () => false,
          parseJsave: () => { throw new Error('unexpected jsave'); },
          convert: () => { throw new Error('unexpected jsave'); },
        },
      },
      loadFullCampaign: async () => ({ sectionRevisions: currentRevisions }),
      sessionUser: { id: 'account' },
      ...extra,
      fetch: write
        ? async (url, options) => {
            if (!options?.method) return { ok: true, json: async () => ({ ok: true, campaign: { sectionRevisions: currentRevisions } }) };
            return write(url, options);
          }
        : extra.fetch,
    });
    vm.runInContext(backupPrelude
      // applyImportedSections 的「覆盖笔记」判断用页面自己的 isPlainObject 读记录表分区，
      // 这个函数不在 backupPrelude 里，得单独注进去。
      + extractFunction('isPlainObject')
      + between('async function importCampaignSections(', 'async function downloadJsonPayload(')
      // applyImportedSections 是 importStateFile 抽出来的共用函数（导入状态包与官方 .jsave
      // 走同一条合并路径），在 importStateFile 上方，要单独抽；它用到 backupSectionIds，
      // 所以必须排在 backupPrelude 后面。
      + extractAsyncDeclaration('applyImportedSections')
      + between('function importStateFile(', 'function clearState('), ctx);
    return ctx;
  }

  // --- 导入失败：不得报成功，不得推进基线，也不得切换本页档案 ---
  await check('导入失败不报成功且不推进基线', async () => {
    const ctxImport = importContext({
      campaignSectionBaseline: { untouched: true },
      fetch: async () => { postCount += 1; return { ok: false, status: 500, json: async () => ({ ok: false, error: 'fixture failure' }) }; },
    });
    ctxImport.importStateFile({ sections });
    await Reader.last.done;
    assert.equal(postCount, 1, '整份导入只能发一次请求');
    assert.match(alertText, /没有写入/, `导入失败必须说清服务器没有被改动，实际提示：${alertText}`);
    assert.doesNotMatch(alertText, /导入完成/);
    assert.deepEqual(ctxImport.campaignSectionBaseline, { untouched: true }, '失败时不得推进保存基线');
    assert.equal(ctxImport.campaignSectionRevision, 4, '失败时不得推进 revision');
    assert.deepEqual(ctxImport.archive, {}, '失败时本页档案不得切换成导入内容');
  });

  // --- 导入版本冲突：服务端整份拒绝，界面必须说明哪些模块被别处改过 ---
  await check('导入版本冲突整份拒绝并列出冲突模块', async () => {
    const ctxImport = importContext({
      fetch: async () => ({
        ok: false, status: 409,
        json: async () => ({
          ok: false, code: 'SAVE_CONFLICT',
          error: 'Some sections were changed in another page. Nothing was written.',
          sections: { heroes: { expected: 0, revision: 2 } },
        }),
      }),
    });
    ctxImport.importStateFile({ sections });
    await Reader.last.done;
    assert.match(alertText, /heroes/, `冲突提示必须点名模块，实际提示：${alertText}`);
    assert.match(alertText, /没有写入/);
    assert.doesNotMatch(alertText, /导入完成/);
    assert.equal(ctxImport.campaignSectionRevision, 4, '冲突时不得推进 revision');
  });

  // --- 导入全部成功：仍然提示成功，并推进 revision 与保存基线 ---
  await check('导入成功提示成功并推进基线', async () => {
    const ctxImport = importContext({
      fetch: async () => { postCount += 1; return { ok: true, status: 200, json: async () => ({ ok: true, sections: { dashboard: 9 } }) }; },
    });
    ctxImport.importStateFile({ sections });
    await Reader.last.done;
    assert.equal(alertText, '导入完成。');
    assert.equal(ctxImport.campaignSectionRevision, 9);
    assert.deepEqual(ctxImport.campaignSectionBaseline, sections.dashboard, '成功导入必须把保存基线推进到导入后的档案');
  });

  // --- 带 aibp / story 的备份必须一并写回（7 个 section，一次请求） ---
  await check('导入一次写回含 aibp/story 的 7 个 section', async () => {
    const posted = [];
    const ctxImport = importContext({
      fetch: async (url, options) => {
        postCount += 1;
        const body = JSON.parse(options.body);
        posted.push(body);
        assert.match(url, /action=import-sections/, '导入必须走整份导入接口');
        assert.equal(body.expectedAccountId, 'account');
        Object.entries(body.expectedRevisions).forEach(([section, revision]) => {
          assert.equal(typeof revision, 'number', `${section} 必须带数字 expectedRevision`);
        });
        assert.equal(body.expectedRevisions.dashboard, 4);
        assert.equal(body.expectedRevisions.heroes, 0);
        return { ok: true, status: 200, json: async () => ({ ok: true, sections: { dashboard: 11 } }) };
      },
    });
    ctxImport.importStateFile({ sections: { ...sections, aibp: { mirror: 'imported battle' }, story: { bookId: 'imported story' } } });
    await Reader.last.done;
    assert.equal(alertText, '导入完成。');
    assert.equal(postCount, 1, '七个模块必须在同一次请求里提交');
    assert.equal(posted.length, 1);
    assert.deepEqual(
      Object.keys(posted[0].sections).sort(),
      ['aibp', 'dashboard', 'heroes', 'map', 'record', 'story', 'technology']
    );
    assert.equal(posted[0].sections.aibp.mirror, 'imported battle');
    assert.equal(ctxImport.campaignSectionRevision, 11);
  });

  await check('完整备份显式空模块恢复为空，旧格式缺失模块不清空', async () => {
    const posted = [];
    const ctxImport = importContext({ fetch: async (url, options) => {
      posted.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({ ok: true, sections: { dashboard: 12 } }) };
    } });
    ctxImport.importStateFile({ app: 'ATO Campaign Save Package', version: 3,
      sections: { dashboard: sections.dashboard, heroes: null, map: null } });
    await Reader.last.done;
    assert.equal(alertText, '导入完成。');
    assert.deepEqual(Object.entries(posted[0].sections), [
      ['dashboard', sections.dashboard], ['map', null], ['heroes', null],
    ]);
    posted.length = 0;
    ctxImport.importStateFile({ sections: { dashboard: sections.dashboard, heroes: null } });
    await Reader.last.done;
    assert.deepEqual(Object.keys(posted[0].sections), ['dashboard']);
  });

  // --- 主控台地图命令：409 必须读回最新状态再重放本次改动 ---
  await check('地图命令 409 变基重放', async () => {
    const posts = [];
    let remote = { notes: 'old remote value', command: 'untouched' };
    const commandCtx = vm.createContext({
      authUrl: '/api/campaign-state.php',
      archive: { activeProfileId: 'p' },
      sessionUser: { id: 'account' },
      currentCycleConfig: () => ({ id: 'c1' }),
      normalizeMapCommandState: (value) => value,
      console: { warn() {} },
      fetch: async (url, options) => {
        if (!options?.method) return { ok: true, json: async () => ({ ok: true, state: remote, revision: 2 }) };
        const body = JSON.parse(options.body);
        posts.push(body);
        if (posts.length === 1) return { status: 409, ok: false, json: async () => ({ code: 'SAVE_CONFLICT', revision: 2 }) };
        return { status: 200, ok: true, json: async () => ({ ok: true, revision: 3 }) };
      },
    });
    vm.runInContext(jsonHelpers.map(extractFunction).join('\n'), commandCtx);
    vm.runInContext(extractFunction('loadMapCommandState'), commandCtx);
    vm.runInContext(extractFunction('saveMapCommandState'), commandCtx);
    const base = { notes: 'old remote value', command: 'untouched' };
    const commandState = { profileId: 'p', revision: 1, state: { notes: 'old remote value', command: 'new local action' } };
    await commandCtx.saveMapCommandState(commandState, base);
    assert.deepEqual(posts.map((p) => p.expectedRevision), [1, 2]);
    assert.equal(posts[1].state.command, 'new local action', '本地命令结果必须保留');
    assert.equal(posts[1].state.notes, 'old remote value');
  });

  // --- 同字段冲突：拒绝写入并提示用户，不再提交覆盖 ---
  await check('地图命令同字段冲突拒绝写入', async () => {
    const conflictPosts = [];
    const commandCtx = vm.createContext({
      authUrl: '/api/campaign-state.php',
      archive: { activeProfileId: 'p' },
      sessionUser: { id: 'account' },
      currentCycleConfig: () => ({ id: 'c1' }),
      normalizeMapCommandState: (value) => value,
      console: { warn() {} },
      fetch: async (url, options) => {
        if (!options?.method) return { ok: true, json: async () => ({ ok: true, state: { notes: 'their value' }, revision: 2 }) };
        conflictPosts.push(JSON.parse(options.body));
        return { status: 409, ok: false, json: async () => ({ code: 'SAVE_CONFLICT', revision: 2 }) };
      },
    });
    vm.runInContext(jsonHelpers.map(extractFunction).join('\n'), commandCtx);
    vm.runInContext(extractFunction('loadMapCommandState'), commandCtx);
    vm.runInContext(extractFunction('saveMapCommandState'), commandCtx);
    await assert.rejects(
      () => commandCtx.saveMapCommandState(
        { profileId: 'p', revision: 1, state: { notes: 'my value' } },
        { notes: 'base value' }
      ),
      /同时改动/
    );
    assert.equal(conflictPosts.length, 1, '同字段冲突后不得再次提交覆盖');
  });

  if (failures.length) {
    console.error('主控台导入/导出回归测试失败：');
    failures.forEach((item) => console.error('  ' + item));
    process.exitCode = 1;
    return;
  }
  console.log('主控台导入/导出回归测试通过：导出先 flush 且三份快照一致、flush 失败仍一致、导入整份提交且失败不报成功也不推进基线、冲突点名模块、成功导入推进基线、7 个 section 一次往返、地图命令 409 变基且同字段冲突拒绝覆盖');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
