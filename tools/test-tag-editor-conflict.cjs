// 地图打标编辑器的「保存冲突」回归（运行：node tools/test-tag-editor-conflict.cjs）。
//
// 背景：api/map-tile-tags.php 现在按 revision 做「读取—比较—写入」，别人的改动会让保存
// 返回 409 SAVE_CONFLICT。前端必须做到：不覆盖、不丢本页改动、把冲突摆给用户选，
// 并且在用户明确选择「用本页覆盖」之前不再自动重试。
//
// 直接从 tools/tag-editor.js 里抽真实函数跑，不做任何 DOM 渲染。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools', 'tag-editor.js'), 'utf8');

function extractFunction(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, name);
  const start = match.index;
  // 先跳过参数表再找函数体的 {：参数默认值里可能有对象字面量（options = {}），
  // 直接找第一个 { 会把它当成函数体，抽出来的片段就断在参数表里。
  const paramsOpen = source.indexOf('(', start);
  let paramsClose = -1;
  let paramsDepth = 0;
  for (let index = paramsOpen; index < source.length; index += 1) {
    if (source[index] === '(') paramsDepth += 1;
    else if (source[index] === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) { paramsClose = index; break; }
    }
  }
  assert.ok(paramsClose > paramsOpen, `${name} 的参数表没有闭合`);
  const bodyStart = source.indexOf('{', paramsClose);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced function ${name}`);
}

const failures = [];
async function check(label, body) {
  try {
    await body();
  } catch (error) {
    failures.push(`${label}：${error.message}`);
  }
}

function harness(responder) {
  const requests = [];
  const state = {
    tagData: null, revision: 0, conflict: null, saving: false, dirty: false,
    error: '', loading: false, saveTimer: null,
  };
  const elements = {
    conflictBar: { hidden: true },
    conflictText: { textContent: '' },
  };
  const ctx = vm.createContext({
    state,
    elements,
    // 真实的 renderStatus 会连带重画整页；这里只保留它对冲突条的调用，
    // 这样断言可以覆盖「冲突条是否被显示/隐藏」这条真实行为。
    renderStatus() { ctx.renderConflict(); },
    render() {},
    console: { warn() {} },
    tagDefinitionDefaults: [{ id: 'progress', label: '进展', shortcut: '1' }],
    Date,
    fetch: async (url, options = {}) => {
      requests.push({ url, body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET' });
      return responder(requests.length, options);
    },
    window: { alert() {} },
    setTimeout,
    clearTimeout,
    Object,
    Set,
    JSON,
    Number,
    String,
    Boolean,
    Array,
  });
  const names = ['clone', 'isPlainObject', 'entryKeyParts', 'tileKey', 'normalizeData',
    'loadTagData', 'saveTagData', 'resolveConflict', 'queueSave', 'renderConflict'];
  vm.runInContext(names.map(extractFunction).join('\n'), ctx);
  return { ctx, state, elements, requests };
}

function conflictResponse(revision = 7) {
  return {
    status: 409,
    ok: false,
    json: async () => ({ ok: false, code: 'SAVE_CONFLICT', revision, updatedAt: '2026-10-03T00:00:00Z' }),
  };
}

function okResponse(revision, data) {
  return { status: 200, ok: true, json: async () => ({ ok: true, revision, data, updatedAt: '2026-10-03T00:00:00Z' }) };
}

function sampleData() {
  return {
    version: 2,
    source: 'map/map-data.js',
    updatedAt: '2026-01-01T00:00:00Z',
    tagDefinitions: [{ id: 'progress', label: '进展', shortcut: '1', cycles: ['c1'] }],
    tiles: { 'c1:001': { cycleId: 'c1', tileId: '001', reviewed: true, tags: [], notes: '', factions: ['cyclopes'] } },
  };
}

async function main() {
  await check('保存冲突不写入、不丢本页改动，并给出冲突版本', async () => {
    const h = harness(() => conflictResponse());
    h.state.tagData = h.ctx.normalizeData(sampleData());
    h.state.revision = 3;
    h.state.dirty = true;
    const saved = await h.ctx.saveTagData();
    assert.equal(saved, false, '冲突时不能当成保存成功');
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].body.expectedRevision, 3, '必须带上本页基于的版本');
    assert.ok(h.state.conflict, '必须记录冲突供界面提示');
    assert.equal(h.state.conflict.revision, 7);
    assert.equal(h.state.dirty, true, '本页改动必须仍然标记为未保存');
    assert.equal(h.state.saving, false);
    assert.equal(h.elements.conflictBar.hidden, false, '冲突条必须显示出来');
    assert.match(h.elements.conflictText.textContent, /7/, '提示里要写清服务器版本');
  });

  await check('冲突后不再自动重试，避免每 260ms 被拒一次', async () => {
    const h = harness(() => conflictResponse());
    h.state.tagData = h.ctx.normalizeData(sampleData());
    h.state.conflict = { revision: 7, updatedAt: '' };
    h.state.tagData.tiles['c1:001'].notes = 'local edit';
    h.ctx.queueSave();
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(h.requests.length, 0, '冲突未解决时 queueSave 不应发出保存请求');
    assert.equal(h.state.dirty, true, '改动仍然标记为未保存');
  });

  await check('用户选择「用本页覆盖」时提交不带 expectedRevision', async () => {
    const h = harness((count) => (count === 1 ? conflictResponse() : okResponse(8, sampleData())));
    h.state.tagData = h.ctx.normalizeData(sampleData());
    h.state.revision = 3;
    await h.ctx.saveTagData();
    assert.ok(h.state.conflict);
    await h.ctx.resolveConflict('overwrite');
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].body.expectedRevision, undefined, '覆盖时必须显式放弃版本校验');
    assert.equal(h.state.conflict, null, '覆盖成功后冲突必须清除');
    assert.equal(h.state.revision, 8, '覆盖成功后要采用服务器返回的新版本');
    assert.equal(h.state.dirty, false);
    assert.equal(h.elements.conflictBar.hidden, true);
  });

  await check('用户选择「载入服务器版本」时重新读取，并放弃本页改动', async () => {
    const server = sampleData();
    server.tiles['c1:001'].notes = 'from other page';
    const h = harness((count) => (count === 1 ? conflictResponse() : { status: 200, ok: true, json: async () => ({ ok: true, revision: 9, data: server }) }));
    h.state.tagData = h.ctx.normalizeData(sampleData());
    h.state.tagData.tiles['c1:001'].notes = 'my local edit';
    h.state.revision = 3;
    await h.ctx.saveTagData();
    h.state.dirty = true;
    await h.ctx.resolveConflict('reload');
    assert.equal(h.requests.length, 2, '重新载入要发一次 GET');
    assert.equal(h.requests[1].method, 'GET');
    assert.equal(h.state.conflict, null);
    assert.equal(h.state.revision, 9);
    assert.equal(h.state.dirty, false, '载入服务器版本意味着本页没有未保存改动');
    assert.equal(h.state.tagData.tiles['c1:001'].notes, 'from other page');
  });

  await check('普通保存（无冲突）仍然带版本并推进版本号', async () => {
    const h = harness(() => okResponse(4, sampleData()));
    h.state.tagData = h.ctx.normalizeData(sampleData());
    h.state.revision = 3;
    const saved = await h.ctx.saveTagData();
    assert.equal(saved, true);
    assert.equal(h.requests[0].body.expectedRevision, 3);
    assert.equal(h.state.revision, 4);
    assert.equal(h.state.conflict, null);
    assert.equal(h.elements.conflictBar.hidden, true);
  });

  await check('未知字段不会在客户端归一化时丢失', async () => {
    const h = harness(() => okResponse(1, sampleData()));
    const data = h.ctx.normalizeData(sampleData());
    assert.deepEqual(data.tiles['c1:001'].factions, ['cyclopes'], 'factions 必须原样保留');
    assert.deepEqual(data.tagDefinitions[0].cycles, ['c1'], '标签定义的 cycles 必须原样保留');
    assert.equal(data.version, 2, 'version 不能被降级成 1');
    assert.equal(data.revision, undefined, 'revision 单独放在 state，不混进提交数据');
  });

  await check('C5 双面标签在载入和保存后保持独立', async () => {
    const fixture = sampleData();
    fixture.tiles['c5:008'] = { cycleId: 'c5', tileId: '008', reviewed: true, tags: [], factions: ['cycladeanProtectorate'] };
    fixture.tiles['c5:008:A'] = { cycleId: 'c5', tileId: '008', face: 'A', reviewed: true, tags: ['progress'], factions: ['cycladeanProtectorate'] };
    fixture.tiles['c5:008:B'] = { cycleId: 'c5', tileId: '008', face: 'B', reviewed: true, tags: ['calamity'], factions: ['followersOfArete'] };
    fixture.tiles['c5:009:B'] = { tags: [], factions: ['outcastVanguard'] };
    const h = harness(() => okResponse(1, fixture));
    h.state.tagData = h.ctx.normalizeData(fixture);
    await h.ctx.saveTagData();
    for (const rawData of [h.requests[0].body.data, h.state.tagData]) {
      const data = JSON.parse(JSON.stringify(rawData));
      assert.equal(Object.keys(data.tiles).length, 5, '基础记录和两面记录不能合并');
      assert.deepEqual(data.tiles['c5:008'].tags, []);
      assert.deepEqual(data.tiles['c5:008:A'].tags, ['progress']);
      assert.deepEqual(data.tiles['c5:008:B'].tags, ['calamity']);
      assert.deepEqual(data.tiles['c5:008:B'].factions, ['followersOfArete']);
      assert.equal(data.tiles['c5:009:B'].cycleId, 'c5');
      assert.equal(data.tiles['c5:009:B'].tileId, '009');
      assert.equal(data.tiles['c5:009:B'].face, 'B');
    }
  });

  if (failures.length) {
    console.error('地图打标编辑器冲突回归失败：');
    failures.forEach((item) => console.error('  ' + item));
    process.exitCode = 1;
    return;
  }
  console.log('地图打标编辑器冲突回归通过：冲突不写入且保留本页改动、冲突期间不自动重试、覆盖时显式不带版本、载入服务器版本放弃本页改动、普通保存推进版本、未知字段不丢失');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
