// 地图存档冲突回归测试（永久化自 tmp/code-review/frontend/verify-map-fixes.cjs）。
//
// 运行：node tools/test-map-save-conflicts.cjs
//
// 锁定 map/app.js 里的存档修复，任何一条回退都会让这个测试失败：
//   1. 首次加载必须把服务端状态与「加载期间的本地编辑」合并，而不是把编辑丢掉；
//   2. 保存必须写回状态加载时所属的档案，而不是主控台当前切换到的档案；
//   3. 409 冲突必须重新读取最新状态并做三方合并（保留别人写入的字段 + 本地编辑）；
//   4. 同字段冲突必须停下来报错，绝不静默覆盖服务端；
//   5. 主控台读取失败必须中止，不得构造一个默认档案把服务端数据覆盖掉；
//   6. 服务端明确回答「尚无存档」时仍要按首次使用初始化。
//
// 直接从源码里抽真实函数跑（打桩界面副作用），路径按本文件位置解析。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'map', 'app.js'), 'utf8');

function extract(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end >= 0, `找不到函数 ${name}`);
  return source.slice(start, end + 2);
}

// map/app.js 里 campaignSession（:182 的 window.ATO_CAMPAIGN_SESSION.create()）和
// mapSaveConflict（:199）都是文件作用域绑定，只抽函数体会让它们缺失。这里照
// tests/lan-save-regressions.test.cjs 的做法，把真实的 assets/campaign-session.js
// 在 vm 作用域里跑一遍，用真的登录守卫注入，而不是塞一个假对象。
function session() {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets', 'campaign-session.js'), 'utf8'), scope);
  return scope.window.ATO_CAMPAIGN_SESSION.create();
}

const mergeHelpers = ['isPlainObject', 'cloneValue', 'deepEqualValue', 'mergeValues', 'mergeMapStates', 'noteMapMergeConflict'];
function context(extra = {}) {
  const ctx = vm.createContext({ console, campaignSession: session(), mapSaveConflict: false, ...extra });
  vm.runInContext(mergeHelpers.map(extract).join('\n'), ctx);
  return ctx;
}

const DEFAULT_STATE = () => ({ currentTile: '', explored: {}, tileNotes: {} });

const failures = [];
async function check(label, body) {
  try {
    await body();
  } catch (error) {
    failures.push(`${label}：${error.message}`);
  }
}

async function main() {
  // --- 首次加载：加载期间的编辑必须活下来 ---
  await check('首载合并在途编辑', async () => {
    const localDefault = DEFAULT_STATE();
    const load = context({
      secondScreenMode: false,
      campaignStorageAvailable: false,
      campaignSaveQueuedBeforeReady: true,
      campaignStorageUrl: '/api',
      state: { ...structuredClone(localDefault) },
      mapStateProfileId: 'default',
      mapStateLoadedFromServer: false,
      mapStateBaseline: structuredClone(localDefault),
      normalizeState: (value) => structuredClone(value),
      focusArgoAfterNextRender() {},
      render() {},
      scheduleReconnectAttempt() {},
      queueCampaignSave() { load.queuedState = structuredClone(load.state); },
      setCampaignSaveStatus() {},
      fetch: async () => ({
        ok: true,
        json: async () => ({ ok: true, campaign: { sections: {
          dashboard: { activeProfileId: 'A' },
          map: { users: { A: { currentTile: 'A-current', explored: { serverOnly: true }, tileNotes: { serverOnly: 'note' } } } },
        } } }),
      }),
    });
    load.state.explored.localEdit = true; // 与首次 GET 赛跑的本地编辑
    vm.runInContext(extract('pickServerMapState'), load);
    vm.runInContext(extract('applyServerMapState'), load);
    vm.runInContext(extract('loadCampaignMapSection'), load);
    await load.loadCampaignMapSection();
    assert.equal(load.queuedState.explored.localEdit, true, '本地编辑必须保留');
    assert.equal(load.queuedState.currentTile, 'A-current', '服务端字段必须保留');
    assert.equal(load.queuedState.tileNotes.serverOnly, 'note', '服务端字段必须保留');
    assert.equal(load.mapStateProfileId, 'A');
    assert.equal(load.mapStateLoadedFromServer, true);
  });

  // --- 保存始终写回状态所属的档案；409 改为读取最新状态后三方合并 ---
  await check('保存绑定加载档案并做 409 三方合并', async () => {
    let serverState = { explored: { old: true, newlyRevealedElsewhere: true }, tileNotes: { old: 'base' } };
    const requests = [];
    const conflict = context({
      campaignStorageAvailable: true,
      campaignSaveInFlight: false,
      campaignSavePending: false,
      campaignSaveQueuedBeforeReady: false,
      campaignUserId: 'B',
      mapStateProfileId: 'A',
      mapStateBaseline: { explored: { old: true }, tileNotes: { old: 'base' } },
      mapSectionRevision: 1,
      campaignStorageUrl: '/api',
      state: { explored: { old: true, localEdit: true }, tileNotes: { old: 'base' } },
      setCampaignSaveStatus() {},
      scheduleReconnectAttempt() {},
      normalizeState: (value) => structuredClone(value),
      fetch: async (url, options) => {
        const method = options?.method || 'GET';
        if (method === 'GET') return { ok: true, json: async () => ({ ok: true, state: { users: { A: structuredClone(serverState) } }, revision: 2 }) };
        const body = JSON.parse(options.body);
        requests.push(body);
        if (requests.length === 1) return { status: 409, ok: false, json: async () => ({ revision: 2 }) };
        serverState = body.state;
        return { status: 200, ok: true, json: async () => ({ ok: true, revision: 3 }) };
      },
    });
    vm.runInContext(extract('pickServerMapState'), conflict);
    vm.runInContext(extract('loadCampaignMapSectionState'), conflict);
    vm.runInContext(extract('saveCampaignMapSection'), conflict);
    assert.equal(await conflict.saveCampaignMapSection(), true);
    assert.equal(requests[0].userId, 'A', '保存必须写回加载时的档案 A，而不是主控台当前档案 B');
    assert.equal(serverState.explored.newlyRevealedElsewhere, true, '409 后不得丢掉其他页面写入的字段');
    assert.equal(serverState.explored.localEdit, true, '本地编辑必须保留');
    assert.equal(serverState.tileNotes.old, 'base');
    assert.deepEqual(requests.map((r) => r.expectedRevision), [1, 2]);
  });

  // --- 同字段冲突：必须停止，不得再次提交覆盖 ---
  await check('同字段冲突拒绝覆盖', async () => {
    const conflicting = [];
    const blocked = context({
      campaignStorageAvailable: true,
      campaignSaveInFlight: false,
      campaignSavePending: false,
      campaignSaveQueuedBeforeReady: true,
      mapStateProfileId: 'A',
      mapStateBaseline: { explored: {}, tileNotes: { shared: 'base' } },
      mapSectionRevision: 1,
      campaignStorageUrl: '/api',
      state: { explored: {}, tileNotes: { shared: 'local value' } },
      setCampaignSaveStatus() {},
      scheduleReconnectAttempt() {},
      normalizeState: (value) => structuredClone(value),
      fetch: async (url, options) => {
        if (!options?.method) {
          return { ok: true, json: async () => ({ ok: true, state: { users: { A: { tileNotes: { shared: 'server value' } } } } }) };
        }
        conflicting.push(JSON.parse(options.body));
        return { status: 409, ok: false, json: async () => ({ revision: 2 }) };
      },
    });
    vm.runInContext(extract('pickServerMapState'), blocked);
    vm.runInContext(extract('loadCampaignMapSectionState'), blocked);
    vm.runInContext(extract('saveCampaignMapSection'), blocked);
    assert.equal(await blocked.saveCampaignMapSection(), false, '无法自动合并时必须停止保存');
    assert.equal(conflicting.length, 1, '冲突后不得再次提交覆盖');
    assert.equal(blocked.campaignSaveQueuedBeforeReady, false, '冲突后不得无限重试');
  });

  // --- 主控台快照写回地图自己所属的档案 ---
  await check('主控台快照写回地图所属档案', async () => {
    const archive = {
      activeProfileId: 'B',
      profiles: { A: { id: 'A', cycles: {} }, B: { id: 'B', cycles: { c1: { state: { location: 'B-original-location' } } } } },
    };
    const profile = context({
      mapStateProfileId: 'A',
      loadCampaignDashboardArchive: async () => structuredClone(archive),
      mapSnapshotNote: () => 'A snapshot note',
    });
    vm.runInContext(extract('buildDashboardArchive'), profile);
    const built = await profile.buildDashboardArchive({ cycleId: 'c1', currentTileLabel: 'A-map-location' });
    assert.equal(built.profiles.A.cycles.c1.state.location, 'A-map-location');
    assert.equal(built.profiles.B.cycles.c1.state.location, 'B-original-location');
    assert.equal(built.activeProfileId, 'B');
  });

  // --- 读取失败必须中止写入 ---
  await check('主控台读取失败中止写入', async () => {
    const failedRead = context({
      campaignDashboardUrl: '/api?section=dashboard',
      mapStateProfileId: 'default',
      fetch: async () => { throw new Error('one transient GET failure'); },
      mapSnapshotNote: () => 'map note',
    });
    vm.runInContext(extract('loadCampaignDashboardArchive'), failedRead);
    vm.runInContext(extract('buildDashboardArchive'), failedRead);
    await assert.rejects(() => failedRead.loadCampaignDashboardArchive(), /one transient GET failure/);
    await assert.rejects(() => failedRead.buildDashboardArchive({ cycleId: 'c1' }), /one transient GET failure/);
  });

  // --- 明确「尚无存档」时仍按首次使用初始化（这条路径没有被上面的保护误伤） ---
  await check('明确无存档仍初始化', async () => {
    const emptyRead = context({
      campaignDashboardUrl: '/api?section=dashboard',
      mapStateProfileId: 'default',
      fetch: async () => ({ ok: true, json: async () => ({ ok: true, exists: false }) }),
      mapSnapshotNote: () => 'map note',
    });
    vm.runInContext(extract('loadCampaignDashboardArchive'), emptyRead);
    vm.runInContext(extract('buildDashboardArchive'), emptyRead);
    assert.equal(await emptyRead.loadCampaignDashboardArchive(), null);
    const fresh = await emptyRead.buildDashboardArchive({ cycleId: 'c1' });
    assert.deepEqual(Object.keys(fresh.profiles), ['default']);
  });

  if (failures.length) {
    console.error('地图存档冲突回归测试失败：');
    failures.forEach((item) => console.error('  ' + item));
    process.exitCode = 1;
    return;
  }
  console.log('地图存档冲突回归测试通过：首载合并在途编辑、保存绑定加载档案、409 三方合并、同字段冲突拒绝覆盖、读取失败中止写入、明确无存档仍初始化');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
