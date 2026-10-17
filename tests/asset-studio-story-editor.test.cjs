const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../asset-studio/static/app.js'), 'utf8');
const begin = source.indexOf('const storySegmentSaves =');
const end = source.indexOf('async function waitJob(', begin);
assert.ok(begin >= 0 && end > begin, 'story editor implementation must be available');
const clone = value => JSON.parse(JSON.stringify(value));
const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g,
  (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]);
const row = (id, body) => ({ id, entry_number: String(id), title: `段落 ${id}`, body, reviewed: false });
const tick = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createCard(id, html) {
  const fields = {
    '.seg-number': { value: decode(html.match(/class="seg-number" value="([^"]*)"/)[1]) },
    '.seg-title': { value: decode(html.match(/class="seg-title" value="([^"]*)"/)[1]) },
    '.seg-body': { value: decode(html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1]), selectionStart: 0 },
    '.seg-reviewed': { checked: /class="seg-reviewed"[^>]*\bchecked\b/.test(html) },
    '.split-seg': {}, '.merge-seg': {},
  };
  const listeners = new Map();
  return { dataset: { segment: id }, querySelector: selector => fields[selector],
    addEventListener: (name, listener) => listeners.set(name, listener),
    input: () => listeners.get('input')(),
  };
}

function load({ beforeRequest } = {}) {
  const books = { alpha: [row(1, '原文一'), row(2, '原文二')], beta: [row(3, '另一本书')] };
  const requests = [], events = [], messages = [], timers = new Map();
  let cards = [], timerId = 0, nextSegmentId = 10, failPut = false;
  const editor = { dataset: {}, inert: false, hidden: true };
  const nodes = { '#storyEditor': editor, '#storyEditorTitle': {}, '#closeStoryEditor': {},
    '#segmentList': { set innerHTML(html) {
      cards = [...html.matchAll(/<article[^>]*data-segment="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
        .map(match => createCard(match[1], match[2]));
    } },
  };
  const context = vm.createContext({
    $: selector => nodes[selector],
    $$: selector => { assert.equal(selector, '[data-segment]'); return cards; },
    esc: value => String(value ?? '').replace(/[&<>"']/g,
      char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    show: selector => { nodes[selector].hidden = false; },
    hide: selector => { nodes[selector].hidden = true; },
    toast: (message, error = false) => messages.push({ message, error }),
    confirm: () => true, location: { hash: '' },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    api: async (url, options = {}) => {
      const request = { url, method: options.method || 'GET',
        payload: options.body ? JSON.parse(options.body) : null };
      requests.push(request);
      events.push(`start ${request.method} ${url}`);
      await beforeRequest?.(request);
      if (request.method === 'PUT' && failPut) throw new Error('保存连接失败');
      const segment = url.match(/^\/api\/stories\/segments\/(\d+)(?:\/(.*))?$/);
      let result;
      if (!segment) {
        result = clone(books[decodeURIComponent(url.slice('/api/stories/'.length))]);
      } else {
        const id = Number(segment[1]);
        const rows = Object.values(books).find(items => items.some(item => item.id === id));
        assert.ok(rows, `segment ${id} must still exist`);
        const index = rows.findIndex(item => item.id === id);
        if (request.method === 'PUT') Object.assign(rows[index], request.payload);
        else if (segment[2] === 'merge-next') {
          assert.ok(rows[index + 1], 'merge needs the following segment');
          rows[index].body = `${rows[index].body}\n\n${rows[index + 1].body}`;
          rows[index].reviewed = false;
          rows.splice(index + 1, 1);
        } else if (segment[2] === 'split') {
          const { offset } = request.payload;
          assert.ok(offset > 0 && offset < rows[index].body.length, 'split uses the saved body');
          const body = rows[index].body;
          rows[index].body = body.slice(0, offset).trimEnd();
          rows[index].reviewed = false;
          rows.splice(index + 1, 0, row(nextSegmentId++, body.slice(offset).trimStart()));
        } else assert.fail(`unexpected request ${request.method} ${url}`);
        result = {};
      }
      events.push(`done ${request.method} ${url}`);
      return result;
    },
  });
  vm.runInContext(source.slice(begin, end), context, { filename: 'asset-studio/static/app.js#story-editor' });
  return { context, books, requests, events, messages, timers, editor,
    card: id => cards.find(card => Number(card.dataset.segment) === id),
    edit(id, body) { const card = this.card(id); card.querySelector('.seg-body').value = body; card.input(); },
    async fireTimers() {
      const pending = [...timers.entries()];
      pending.forEach(([id]) => timers.delete(id));
      await Promise.all(pending.map(([, callback]) => callback()));
    },
    failSaves: value => { failPut = value; },
  };
}

test('quick edits to both segments are saved before merging and survive the editor reload', async () => {
  const app = load();
  await app.context.openStory('alpha');
  app.edit(1, '第一段已修改 & <正文>');
  app.edit(2, '第二段已修改');
  app.card(1).querySelector('.seg-title').value = '校对标题';
  await app.card(1).querySelector('.merge-seg').onclick();
  assert.equal(app.books.alpha.length, 1);
  assert.equal(app.books.alpha[0].body, '第一段已修改 & <正文>\n\n第二段已修改');
  assert.equal(app.card(1).querySelector('.seg-body').value, app.books.alpha[0].body);
  assert.equal(app.books.alpha[0].title, '校对标题');
  const mergeStart = app.events.indexOf('start POST /api/stories/segments/1/merge-next');
  assert.ok(mergeStart > app.events.indexOf('done PUT /api/stories/segments/1'));
  assert.ok(mergeStart > app.events.indexOf('done PUT /api/stories/segments/2'));
  assert.equal(app.timers.size, 0);
});

test('split applies its cursor offset to the latest edited body', async () => {
  const app = load();
  await app.context.openStory('alpha');
  app.edit(1, '修改后的第一部分第二部分');
  app.card(1).querySelector('.seg-body').selectionStart = 8;
  await app.card(1).querySelector('.split-seg').onclick();
  assert.deepEqual(app.books.alpha.map(item => item.body), ['修改后的第一部分', '第二部分', '原文二']);
  assert.ok(app.events.indexOf('start POST /api/stories/segments/1/split')
    > app.events.indexOf('done PUT /api/stories/segments/1'));
});

test('edits made during autosave are serialized after the pending PUT', async () => {
  const gate = deferred();
  let puts = 0;
  const app = load({ beforeRequest: request => request.method === 'PUT' && ++puts === 1 ? gate.promise : undefined });
  await app.context.openStory('alpha');
  app.edit(1, '自动保存第一版');
  const autosave = app.fireTimers();
  await tick();
  app.edit(1, '上传期间继续编辑的最终版');
  const flush = app.context.flushStoryEdits();
  await tick();
  assert.equal(app.requests.filter(request => request.method === 'PUT').length, 1);
  gate.resolve();
  await Promise.all([autosave, flush]);
  assert.deepEqual(app.requests.filter(request => request.method === 'PUT').map(request => request.payload.body),
    ['自动保存第一版', '上传期间继续编辑的最终版']);
  assert.equal(app.books.alpha[0].body, '上传期间继续编辑的最终版');
  const firstDone = app.events.indexOf('done PUT /api/stories/segments/1');
  assert.ok(app.events.lastIndexOf('start PUT /api/stories/segments/1') > firstDone);
  assert.equal(app.timers.size, 0);
});

for (const action of ['merge', 'split', 'switch', 'close']) {
  test(`failed flush preserves edits and blocks ${action}`, async () => {
    const app = load();
    await app.context.openStory('alpha');
    app.edit(1, '未保存的修改');
    app.card(1).querySelector('.seg-body').selectionStart = 3;
    app.failSaves(true);
    if (action === 'merge') await app.context.mergeSegment(app.card(1));
    if (action === 'split') await app.context.splitSegment(app.card(1));
    if (action === 'switch') await app.context.openStory('beta');
    if (action === 'close') await app.context.$('#closeStoryEditor').onclick();
    assert.equal(app.requests.filter(request => request.method === 'POST').length, 0);
    assert.equal(app.requests.some(request => request.url === '/api/stories/beta'), false);
    assert.equal(app.editor.dataset.book, 'alpha');
    assert.equal(app.editor.hidden, false);
    assert.equal(app.editor.inert, false);
    assert.equal(app.card(1).querySelector('.seg-body').value, '未保存的修改');
    assert.equal(app.books.alpha[0].body, '原文一');
    assert.ok(app.messages.some(message => message.error && /保存连接失败/.test(message.message)));
    app.failSaves(false);
    await app.context.flushStoryEdits();
    assert.equal(app.books.alpha[0].body, '未保存的修改', 'failed edits remain retryable');
  });
}

for (const action of ['switch', 'close']) {
  test(`${action} flushes the old editor and leaves no old autosave timer`, async () => {
    const app = load();
    await app.context.openStory('alpha');
    app.edit(1, '离开前的正文');
    if (action === 'switch') await app.context.openStory('beta');
    else await app.context.$('#closeStoryEditor').onclick();
    assert.equal(app.books.alpha[0].body, '离开前的正文');
    assert.equal(app.timers.size, 0);
    assert.equal(app.editor.dataset.book, action === 'switch' ? 'beta' : 'alpha');
    assert.equal(app.editor.hidden, action === 'close');
    const requestCount = app.requests.length;
    await app.fireTimers();
    assert.equal(app.requests.length, requestCount, 'no stale PUT may run after leaving');
  });
}

for (const action of ['merge', 'split']) {
  test(`${action} cannot save stale cards after a committed operation whose reload failed`, async () => {
    let reads = 0;
    const app = load({ beforeRequest: request => {
      if (request.url === '/api/stories/alpha' && request.method === 'GET' && ++reads === 2) {
        throw new Error('重新读取故事失败');
      }
    } });
    await app.context.openStory('alpha');
    app.edit(1, '第一部分第二部分');
    const staleCard = app.card(1);
    staleCard.querySelector('.seg-body').selectionStart = 4;
    const staleTimers = [...app.timers.values()];
    if (action === 'merge') await app.context.mergeSegment(staleCard);
    else await app.context.splitSegment(staleCard);
    assert.equal(app.editor.hidden, true, 'a failed reload must not expose obsolete segment inputs');
    assert.equal(app.timers.size, 0);
    assert.ok(app.messages.some(message => message.error && /重新读取故事失败/.test(message.message)));
    const committed = clone(app.books.alpha);
    assert.deepEqual(committed.map(item => item.body), action === 'merge'
      ? ['第一部分第二部分\n\n原文二'] : ['第一部分', '第二部分', '原文二']);
    const requestCount = app.requests.length;
    // Exercise both an already queued callback and the old input listener.
    await Promise.all(staleTimers.map(callback => callback()));
    staleCard.querySelector('.seg-body').value = '过期卡片中的正文';
    staleCard.input();
    await app.fireTimers();
    await app.context.saveSegment(staleCard);
    assert.equal(app.requests.length, requestCount, 'stale callbacks and cards must not send a PUT');
    assert.deepEqual(app.books.alpha, committed);
    await app.context.openStory('alpha');
    assert.equal(app.editor.hidden, false);
    assert.notEqual(app.card(1), staleCard);
    assert.equal(app.card(1).querySelector('.seg-body').value, committed[0].body);
    app.edit(1, '重开后继续校对');
    await app.fireTimers();
    assert.equal(app.books.alpha[0].body, '重开后继续校对');
  });
}
