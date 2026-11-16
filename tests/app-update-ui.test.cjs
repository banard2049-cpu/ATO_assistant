'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/update/update-check.js'), 'utf8');
const response = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data });
const tick = () => new Promise(resolve => setImmediate(resolve));

function ui({ local, remote, timer = setTimeout }) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: true, disabled: false, textContent: '', handlers: {},
      classList: { toggle() {} },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      click() { if (!this.disabled) this.handlers.click?.(); },
    });
    return nodes.get(id);
  };
  const requests = [];
  vm.runInNewContext(source, {
    console, AbortController, setTimeout: timer, clearTimeout, setInterval() {},
    window: { ATO_APP_VERSION: '2.1.9', location: { reload() {} } },
    document: { hidden: false, querySelector: node },
    localStorage: { getItem() { return null; }, setItem() {} },
    fetch: async (url, options = {}) => {
      requests.push(url);
      if (url.startsWith('./')) {
        const params = new URL(url, 'http://fixture/').searchParams;
        if (params.get('action') === 'prepare') return response({ ok: true, endpoint: './api/fixture-runner.php' });
        return local(params, options);
      }
      if (remote) return remote(url, options);
      return response(url.includes('/compare/')
        ? { status: 'ahead', files: [] } : [{ tag_name: 'v2.2.0' }]);
    },
  });
  return { node, requests };
}
async function settle(check) {
  for (let i = 0; i < 30; i++) { if (check()) return; await tick(); }
  assert.ok(check(), 'UI did not settle');
}

test('还原入口不依赖 GitHub 发布提示，当前已最新也可还原', async () => {
  const { node } = ui({ local: () => response({ supported: true, canRollback: true }),
    remote: () => response([{ tag_name: 'v2.1.9' }]) });
  await settle(() => !node('#rollbackUpdateButton').hidden);
  assert.equal(node('#updateNotice').hidden, true);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.indexOf('id="rollbackUpdateButton"') > html.indexOf('id="closeUpdateButton"'));
  assert.match(html, /id="closeUpdateButton"[\s\S]*?<\/div>\s*<\/div>\s*<div class="update-actions">/);
});

test('仅删除或版本信息更新也提交，提交携带计划编号', async () => {
  const { node } = ui({ local: params => {
    if (params.get('action') === 'status') return response({ supported: true });
    if (params.get('action') === 'begin') return response({ ok: true, planId: 'plan-a', fileCount: 0, downloads: [] });
    assert.equal(params.get('action'), 'commit');
    assert.equal(params.get('plan'), 'plan-a');
    return response({ ok: true, target: 'v2.2.0', applied: 0, deleted: 1 });
  } });
  await settle(() => !node('#applyUpdateButton').hidden);
  node('#applyUpdateButton').click();
  await settle(() => !node('#reloadUpdateButton').hidden);
  assert.match(node('#applyUpdateStatus').textContent, /已更新到 v2.2.0/);
  assert.equal(node('#checkUpdateButton').disabled, true);
});

test('提交失败保留暂存并显示恢复按钮，不能误报没有执行', async () => {
  let committed = false;
  const { node, requests } = ui({ local: params => {
    const action = params.get('action');
    if (action === 'status') return response({ supported: true, canRollback: committed, needsRecovery: committed });
    if (action === 'begin') return response({ ok: true, planId: 'a', fileCount: 0, downloads: [] });
    committed = true;
    return response({ ok: false, error: '写入被占用' }, 500);
  } });
  await settle(() => !node('#applyUpdateButton').hidden);
  node('#applyUpdateButton').click();
  await settle(() => /写入被占用/.test(node('#applyUpdateStatus').textContent));
  assert.equal(node('#rollbackUpdateButton').hidden, false);
  assert.equal(node('#applyUpdateButton').disabled, true);
  assert.equal(requests.some(url => url.includes('action=cancel')), false);
});

test('提交成功但响应丢失，从服务端版本确认结果', async () => {
  let committed = false;
  const { node } = ui({ local: params => {
    if (params.get('action') === 'status') return response({ supported: true, canRollback: committed,
      version: committed ? '2.2.0' : '2.1.9' });
    if (params.get('action') === 'begin') return response({ ok: true, planId: 'a', fileCount: 0, downloads: [] });
    committed = true;
    throw new TypeError('connection reset');
  } });
  await settle(() => !node('#applyUpdateButton').hidden);
  node('#applyUpdateButton').click();
  await settle(() => !node('#reloadUpdateButton').hidden);
  assert.match(node('#applyUpdateStatus').textContent, /已确认安装版本为 2.2.0/);
  assert.equal(node('#rollbackUpdateButton').hidden, false);
});

test('下载失败的取消请求完成前不能再次更新，取消绑定自己的计划', async () => {
  let finishCancel;
  const { node } = ui({ local: params => {
    const action = params.get('action');
    if (action === 'status') return response({ supported: true });
    if (action === 'begin') return response({ ok: true, planId: 'owned', fileCount: 1, downloads: [{ path: 'x.js', sha: 'sha' }] });
    assert.equal(action, 'cancel');
    assert.equal(params.get('plan'), 'owned');
    return new Promise(resolve => { finishCancel = () => resolve(response({ ok: true })); });
  }, remote: url => response(url.includes('/compare/') ? { status: 'ahead', files: [] }
      : url.includes('raw.githubusercontent') ? {} : [{ tag_name: 'v2.2.0' }], url.includes('raw.githubusercontent') ? 404 : 200) });
  await settle(() => !node('#applyUpdateButton').hidden);
  node('#applyUpdateButton').click();
  await settle(() => finishCancel);
  assert.equal(node('#applyUpdateButton').disabled, true);
  finishCancel();
  await settle(() => !node('#applyUpdateButton').disabled);
  assert.match(node('#applyUpdateStatus').textContent, /HTTP 404/);
});

test('更新锁定目标版本，按服务端计划上传文件并支持还原', async () => {
  let finishCompare;
  let releases = 0;
  const bytes = Uint8Array.of(1, 2, 3).buffer;
  const actions = [];
  let installed = false;
  const { node, requests } = ui({ local: (params, options) => {
    const action = params.get('action');
    if (action === 'status') return response({ supported: true, canRollback: installed, backupId: 'backup-a' });
    actions.push(action);
    if (action === 'begin') {
      const body = JSON.parse(options.body);
      assert.equal(body.target, 'v2.2.0');
      assert.deepEqual(body.files.map(file => file.filename), ['x.js', 'data/local.json']);
      return response({ ok: true, planId: 'a', fileCount: 1, downloads: [{ path: 'x.js', sha: 'sha' }] });
    }
    if (action === 'stage') {
      assert.equal(params.get('plan'), 'a');
      assert.equal(params.get('path'), 'x.js');
      assert.equal(params.get('sha'), 'sha');
      assert.equal(options.method, 'POST');
      assert.equal(options.body, bytes);
      return response({ ok: true });
    }
    if (action === 'commit') {
      assert.equal(params.get('plan'), 'a');
      installed = true;
      return response({ ok: true, target: 'v2.2.0', applied: 1 });
    }
    assert.equal(action, 'rollback');
    assert.equal(JSON.parse(options.body).backupId, 'backup-a');
    return response({ ok: true, from: 'v2.1.9' });
  }, remote: url => {
    if (url.includes('/compare/')) return new Promise(resolve => {
      finishCompare = () => resolve(response({ status: 'ahead', files: [
        { filename: 'x.js', status: 'added', sha: 'sha' },
        { filename: 'data/local.json', status: 'modified', sha: 'other' },
      ] }));
    });
    if (url.includes('raw.githubusercontent')) return { ...response({}), arrayBuffer: async () => bytes };
    return response([{ tag_name: ++releases === 1 ? 'v2.2.0' : 'v2.3.0' }]);
  } });
  await settle(() => !node('#applyUpdateButton').hidden);
  node('#applyUpdateButton').click();
  await settle(() => finishCompare);
  node('#checkUpdateButton').click();
  finishCompare();
  await settle(() => !node('#reloadUpdateButton').hidden);
  assert.deepEqual(actions, ['begin', 'stage', 'commit']);
  assert.match(node('#applyUpdateStatus').textContent, /已更新到 v2.2.0/);
  assert.equal(releases, 1);
  assert.ok(requests.some(url => url.includes('/v2.2.0/x.js')));
  assert.ok(requests.every(url => !url.includes('/data/local.json')));
  node('#rollbackUpdateButton').click();
  await settle(() => /已还原到 v2.1.9/.test(node('#applyUpdateStatus').textContent));
  assert.deepEqual(actions, ['begin', 'stage', 'commit', 'rollback']);
});

test('比较接口超时恢复按钮，允许重试', async () => {
  const { node } = ui({ local: () => response({ supported: true }),
    timer: (fn, ms) => setTimeout(fn, ms === 30000 ? 5 : ms),
    remote: (url, options) => url.includes('/compare/') ? new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }) : response([{ tag_name: 'v2.2.0' }]) });
  await settle(() => !node('#applyUpdateButton').hidden);
  node('#applyUpdateButton').click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(node('#applyUpdateButton').disabled, false);
  assert.match(node('#applyUpdateStatus').textContent, /无法访问/);
});

test('还原响应丢失时确认实际版本，避免继续还原更早的备份', async () => {
  let rolledBack = false;
  const { node } = ui({ local: (params, options) => {
    if (params.get('action') === 'status') return response({ supported: true, canRollback: !rolledBack,
      backupId: rolledBack ? null : 'backup-a', rollbackVersion: '2.1.8', version: rolledBack ? '2.1.8' : '2.1.9' });
    assert.equal(params.get('action'), 'rollback');
    assert.equal(JSON.parse(options.body).backupId, 'backup-a');
    rolledBack = true;
    throw new TypeError('response lost');
  } });
  await settle(() => !node('#rollbackUpdateButton').hidden);
  node('#rollbackUpdateButton').click();
  await settle(() => !node('#reloadUpdateButton').hidden);
  assert.match(node('#applyUpdateStatus').textContent, /已确认还原到 2.1.8/);
  assert.match(node('#updateStatus').textContent, /已还原到 2.1.8/);
  assert.equal(node('#rollbackUpdateButton').hidden, true);
});
