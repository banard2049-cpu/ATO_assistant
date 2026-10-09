// 「导入状态」的覆盖警告：导入会整份替换 record 分区，目标战役里手写的记录表笔记
// 会被这次导入带进来的内容（官方战役备注 + 矩阵残留 + 未导入项区块）整段取代。
// 合并语义不变，只在写之前问一句 —— 本文件锁的就是那一句的四条分支：
//   ● 两边都有笔记且内容不同 → 必须先弹 confirm；
//   ● 点取消 → 一次写入请求都不发（连导入前的防抖 flush 都不做），并给人话提示；
//   ● 点确定 → 照原流程写入；
//   ● 任一边为空 / 两边内容相同 → 不弹窗，直接导入。
//
// 抽的是 index.html 里的真函数（applyImportedSections / importStateFile），打桩 FileReader、
// window.confirm / alert 与写服务端的 importCampaignSections()。
//
// 跑法：node tests/import-notes-overwrite-warning.test.cjs
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const pageSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extractInlineScript(source) {
  const marker = "const legacyStorageKey";
  const start = source.lastIndexOf("<script>", source.indexOf(marker));
  const end = source.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start, "index.html 的主内联脚本块");
  return source.slice(start + "<script>".length, end);
}

const MAIN_SCRIPT = extractInlineScript(pageSource);

// 按声明切函数：`^` 定位到顶格缩进的声明行，`[^]*?^\1}` 收在同缩进的闭括号上
// （applyImportedSections 里新加的嵌套小函数缩进更深，不会误切断）。
function extractFunction(name) {
  const match = new RegExp(`^( *)(?:async )?function ${name}\\([^]*?^\\1}`, "m").exec(MAIN_SCRIPT);
  assert.ok(match, `index.html 里找不到函数 ${name}`);
  return match[0];
}

const MINE = "第 3 天：拿到 3 号故事卡，阿戈号资源 −2。\n待办：下一天先清事件。";
const OFFICIAL = "官方存档的战役备注\n【未导入项】\n- echo_track=2\n- 未知属性 3 项";

const DASHBOARD = {
  activeProfileId: "default",
  profiles: { default: { id: "default", name: "默认用户", activeCycleId: "c5", cycles: { c5: { id: "c5", state: { day: "11" } } } } },
};

// 把 applyImportedSections()/importStateFile() 拉出来跑：
//   currentRecord —— 服务端存档里 sections.record 的现状（「当前战役已有的笔记」）；
//   confirmAnswer —— 用户在覆盖警告上点的是确定还是取消。
function importHarness({ currentRecord = null, confirmAnswer = true, hasRecordSection = true } = {}) {
  const writes = [];
  const flushes = [];
  const confirms = [];
  const alerts = [];
  const reader = {};
  const context = vm.createContext({
    console,
    window: {},
    Uint8Array,
    ArrayBuffer,
    TextDecoder,
    TextEncoder,
    clearTimeout,
    setTimeout,
    queueMicrotask,
    FileReader: function FileReader() { return reader; },
    campaignSaveTimer: null,
    // importStateFile / applyImportedSections 依赖的东西
    backupSectionIds: ["dashboard", "map", "record", "technology", "heroes", "aibp", "story"],
    normalizeArchive: (value) => ({
      activeProfileId: value?.activeProfileId || "default",
      profiles: value?.profiles || {},
    }),
    cloneJson: (value) => JSON.parse(JSON.stringify(value)),
    currentCycle: () => ({ id: "c5", state: { day: "11" } }),
    flushCampaignSave: async () => { flushes.push("flush"); return true; },
    loadFullCampaign: async () => ({
      sections: hasRecordSection ? { record: currentRecord } : {},
      sectionRevisions: { dashboard: 3, record: 5 },
    }),
    importCampaignSections: async (sections, expectedRevisions) => {
      writes.push({ sections, expectedRevisions });
      return { ok: true, sections: { dashboard: 4 } };
    },
    renderDashboardArchive() {},
    campaignSyncChannel: { postMessage() {} },
    elements: { importInput: { value: "fixture" } },
    // applyImportedSections 成功后会写这几个顶层绑定；vm 里先给它们一个初值。
    archive: { untouched: true },
    state: {},
    campaignSectionRevision: 3,
    campaignSectionExists: true,
    campaignSectionBaseline: { untouched: true },
    campaignServerBaseline: { untouched: true },
  });
  context.window.alert = (message) => alerts.push(String(message));
  context.window.confirm = (message) => {
    confirms.push(String(message));
    return confirmAnswer;
  };
  // 本文件走 ATO 状态包（JSON）分支；官方 .jsave 的转换器在 tests/jsave-import.test.cjs 里测，
  // 但两条来源共用 applyImportedSections，所以下面也直接用它跑一遍 isFullBackup=false 的情形。
  context.window.ATO_JSAVE_IMPORT = {
    isJsave: () => false,
    parseJsave: () => { throw new Error("unexpected jsave"); },
    convert: () => { throw new Error("unexpected jsave"); },
  };
  vm.runInContext([
    extractFunction("isPlainObject"),
    extractFunction("applyImportedSections"),
    extractFunction("importStateFile"),
  ].join("\n"), context);

  reader.result = null;
  reader.readAsArrayBuffer = (file) => {
    const bytes = Buffer.from(typeof file === "string" ? file : JSON.stringify(file), "utf8");
    reader.result = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    queueMicrotask(() => reader.onload());
  };

  return {
    context,
    writes,
    flushes,
    confirms,
    alerts,
    // 走完整的「选文件 → 读字节 → 判定 → 写入」入口。
    async importFile(payload) {
      context.importStateFile(payload);
      // FileReader 的 onload 与它里面的 await 链都排在微任务里。
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
    // 直接调共用入口，模拟官方 .jsave 那条来源（isFullBackup: false）。
    async applySections(sections, isFullBackup = false) {
      await context.applyImportedSections({ sections, dashboardImport: sections.dashboard, isFullBackup });
    },
  };
}

function fullPackage(record) {
  return {
    app: "ATO Campaign Save Package",
    version: 3,
    activeProfileId: "default",
    profiles: DASHBOARD.profiles,
    sections: { dashboard: DASHBOARD, record, map: { users: {} }, technology: {}, heroes: {} },
  };
}

// ---------------------------------------------------------------- 会覆盖：先问一句

test("两边都有笔记且内容不同 → 弹 confirm，点取消则一个写入请求都不发", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: MINE } } },
    confirmAnswer: false,
  });
  await harness.importFile(fullPackage({ users: { default: { notes: OFFICIAL } } }));

  assert.equal(harness.confirms.length, 1, "会覆盖既有笔记时必须先问一次");
  const warning = harness.confirms[0];
  assert.match(warning, /记录表笔记/, "重点必须点名「记录表笔记」");
  assert.match(warning, /覆盖/);
  assert.match(warning, /无法自动恢复/, "必须说明覆盖后无法自动恢复");
  assert.match(warning, /导出(?:状态|存档)/, "必须建议先导出存档备份");
  assert.match(warning, /战役备注/);
  assert.match(warning, /未导入项/, "要让用户知道官方备注与未导入项区块会保留");

  assert.equal(harness.writes.length, 0, "点取消后不得有任何分区写入");
  assert.equal(harness.flushes.length, 0, "点取消后连导入前的防抖保存都不该发生");
  assert.equal(harness.alerts.length, 1, "取消也要给人话提示");
  assert.match(harness.alerts[0], /已取消导入/);
  assert.match(harness.alerts[0], /没有写入/);
  assert.deepEqual(harness.context.campaignSectionBaseline, { untouched: true }, "取消不得推进保存基线");
  assert.deepEqual(harness.context.archive, { untouched: true }, "取消不得切换本页档案");
});

test("两边都有笔记且内容不同 → 点确定后照原流程写入", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: MINE } } },
    confirmAnswer: true,
  });
  await harness.importFile(fullPackage({ users: { default: { notes: OFFICIAL } } }));

  assert.equal(harness.confirms.length, 1);
  assert.equal(harness.writes.length, 1, "确定后只发一次整份导入请求");
  assert.equal(JSON.stringify(harness.writes[0].sections.record),
    JSON.stringify({ users: { default: { notes: OFFICIAL } } }));
  assert.equal(JSON.stringify(harness.writes[0].expectedRevisions),
    JSON.stringify({ dashboard: 3, map: 0, record: 5, technology: 0, heroes: 0 }));
  assert.deepEqual(harness.alerts, ["导入完成。"]);
  assert.equal(harness.context.campaignSectionRevision, 4, "确定后照旧推进 revision");
});

// ---------------------------------------------------------------- 不打扰：空档与重复导入

test("当前战役没有笔记 → 不弹 confirm，直接导入", async () => {
  const harness = importHarness({ currentRecord: null });
  await harness.importFile(fullPackage({ users: { default: { notes: OFFICIAL } } }));

  assert.deepEqual(harness.confirms, [], "空档没什么可丢的，不该打扰用户");
  assert.equal(harness.writes.length, 1);
  assert.deepEqual(harness.alerts, ["导入完成。"]);
});

test("当前战役的笔记是空串 → 不弹 confirm，直接导入", async () => {
  const harness = importHarness({ currentRecord: { users: { default: { notes: "   " } } } });
  await harness.importFile(fullPackage({ users: { default: { notes: OFFICIAL } } }));

  assert.deepEqual(harness.confirms, []);
  assert.equal(harness.writes.length, 1);
});

test("导入内容没有笔记 → 不弹 confirm，直接导入", async () => {
  const harness = importHarness({ currentRecord: { users: { default: { notes: MINE } } } });
  await harness.importFile(fullPackage({ users: { default: { notes: "" } } }));

  assert.deepEqual(harness.confirms, []);
  assert.equal(harness.writes.length, 1);
});

test("导入内容里根本没有 record 分区 → 不弹 confirm，也不提交 record", async () => {
  const harness = importHarness({ currentRecord: { users: { default: { notes: MINE } } } });
  const payload = fullPackage({ users: { default: { notes: MINE } } });
  delete payload.sections.record;
  await harness.importFile(payload);

  assert.deepEqual(harness.confirms, []);
  assert.equal(harness.writes.length, 1);
  assert.equal(Object.keys(harness.writes[0].sections).includes("record"), false);
  assert.equal(harness.writes[0].expectedRevisions.record, undefined);
});

test("两边内容相同（重复导入同一份） → 不弹 confirm，直接导入", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: OFFICIAL } } },
  });
  await harness.importFile(fullPackage({ users: { default: { notes: OFFICIAL } } }));

  assert.deepEqual(harness.confirms, [], "重复导入同一份存档不该重复报警");
  assert.equal(harness.writes.length, 1);
});

// ---------------------------------------------------------------- 记录表分区的各种形状

test("用户 id 不是 default（按账号 id 分桶）也要认得出会覆盖", async () => {
  const harness = importHarness({
    currentRecord: { users: { "acct-42": { notes: MINE } } },
    confirmAnswer: false,
  });
  await harness.importFile(fullPackage({ users: { default: { notes: OFFICIAL } } }));

  assert.equal(harness.confirms.length, 1, "桶的 key 不同也是覆盖，必须问");
  assert.equal(harness.writes.length, 0);
});

test("多个用户桶：只要有一个手写笔记会被取代就问", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: MINE }, "acct-42": { notes: "" } } },
    confirmAnswer: false,
  });
  await harness.importFile(fullPackage({
    users: { default: { notes: OFFICIAL }, "acct-42": { notes: "" } },
  }));

  assert.equal(harness.confirms.length, 1);
  assert.equal(harness.writes.length, 0);
});

test("旧形状 record.notes（没有 users 包装）也要认", async () => {
  const harness = importHarness({ currentRecord: { notes: MINE }, confirmAnswer: false });
  await harness.importFile(fullPackage({ notes: OFFICIAL }));

  assert.equal(harness.confirms.length, 1);
  assert.equal(harness.writes.length, 0);
});

test("旧形状顶层 record.notes 与 users 桶各存一份时都要算上", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: "" } }, notes: MINE },
    confirmAnswer: false,
  });
  await harness.importFile(fullPackage({ users: { default: { notes: OFFICIAL } } }));

  assert.equal(harness.confirms.length, 1, "顶层那份旧笔记同样会被取代");
  assert.equal(harness.writes.length, 0);
});

test("笔记只存在 cycleStats.<循环>.notes（记录表页面的真实写法）也要认", async () => {
  // record/index.html 的 setCycleStat() 会把顶层 notes 删掉，只留 cycleStats[<循环>].notes：
  // 真实存档里用户手写的笔记就是这个形状，漏掉它等于永远不报警。
  const harness = importHarness({
    currentRecord: { users: { default: { cycleStats: { c5: { notes: MINE } } } } },
    confirmAnswer: false,
  });
  await harness.importFile(fullPackage({
    users: { default: { cycleStats: { c5: { notes: OFFICIAL } } } },
  }));

  assert.equal(harness.confirms.length, 1, "只在 cycleStats 里的手写笔记同样会被取代");
  assert.equal(harness.writes.length, 0);
});

test("一段笔记同时出现在顶层与 cycleStats（转换器写出来的形状）不算内容不同", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: OFFICIAL, cycleStats: { c5: { notes: OFFICIAL } } } } },
  });
  await harness.importFile(fullPackage({
    users: { default: { notes: OFFICIAL, cycleStats: { c5: { notes: OFFICIAL } } } },
  }));

  assert.deepEqual(harness.confirms, [], "同一段文字存两份（视图 + 真身）不该被当成内容不同");
  assert.equal(harness.writes.length, 1);
});

test("循环笔记的循环号不同、内容也不同 → 会覆盖，要问", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { cycleStats: { c5: { notes: MINE } } } } },
    confirmAnswer: false,
  });
  await harness.importFile(fullPackage({ users: { default: { cycleStats: { c2: { notes: OFFICIAL } } } } }));

  assert.equal(harness.confirms.length, 1, "整份替换 record 时其它循环的手写笔记一起没");
  assert.equal(harness.writes.length, 0);
});

test("一边只有 cycleStats 里的笔记、另一边没有笔记 → 不弹 confirm", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { cycleStats: { c5: { notes: MINE } } } } },
  });
  await harness.importFile(fullPackage({ users: { default: { notes: "" } } }));

  assert.deepEqual(harness.confirms, []);
  assert.equal(harness.writes.length, 1);
});

// ---------------------------------------------------------------- 两条来源共用同一个判断

test("官方 .jsave 那条来源（isFullBackup=false）走同一个覆盖警告", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: MINE } } },
    confirmAnswer: false,
  });
  await harness.applySections({
    dashboard: DASHBOARD,
    record: { users: { default: { notes: OFFICIAL } } },
    map: { users: { default: {} } },
    technology: { users: { default: {} } },
    heroes: { heroes: [] },
  });

  assert.equal(harness.confirms.length, 1);
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.flushes.length, 0);
  assert.match(harness.alerts[0], /已取消导入/);
});

test("官方 .jsave 那条来源点确定后照旧只提交转换出来的分区", async () => {
  const harness = importHarness({
    currentRecord: { users: { default: { notes: MINE } } },
    confirmAnswer: true,
  });
  await harness.applySections({
    dashboard: DASHBOARD,
    record: { users: { default: { notes: OFFICIAL } } },
    map: { users: { default: {} } },
    technology: { users: { default: {} } },
    heroes: { heroes: [] },
  });

  assert.equal(harness.confirms.length, 1);
  assert.equal(harness.writes.length, 1);
  assert.equal(JSON.stringify(Object.keys(harness.writes[0].sections).sort()),
    JSON.stringify(["dashboard", "heroes", "map", "record", "technology"]));
  assert.deepEqual(harness.alerts, ["导入完成。"]);
});
