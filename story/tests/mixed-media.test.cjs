const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { create } = require('../assets/mixed-media/renderer.js');
const { harness, escape } = require('./helpers/mixed-media-dom.cjs');
const root = path.resolve(__dirname, '../..');
const mainSource = fs.readFileSync(path.join(root, 'story/assets/app.js'), 'utf8');
const ssSource = fs.readFileSync(path.join(root, 'ss/app.js'), 'utf8');
const ledgers = ['rows', 'resourceRows', 'battleRows', 'requestedRows'];
const files = ['story/data/storybook-data.js', 'story/data/storybook-official-data.js',
  'story/assets/mixed-media/mapping.js'];
const local = files.every(file => fs.existsSync(path.join(root, file)));
const parse = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')
  .split('=').slice(1).join('=').trim().replace(/;\s*$/, ''));
const [fan, official, mapping] = local ? files.map(parse) : [null, null, null];
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const context = (book, key, variant = 'fan') => ({ schema: 1, bookId: book, entryKey: key, variant });
function fn(source, name, indent = '  ') {
  const match = new RegExp(`^${indent}(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `missing ${name}`);
  const end = source.indexOf(`\n${indent}}`, match.index);
  assert.ok(end > match.index, `missing end ${name}`);
  return source.slice(match.index, end + indent.length + 2);
}
function mainPage(h, api, book, variant = 'fan') {
  const page = vm.createContext({
    window: { ATO_MIXED_MEDIA: api }, storyVersion: variant === 'official' ? '官方版' : '民间版',
    currentBook: () => book, storyText: h.container, mixedMediaRender: null,
    supportsOfficialVersion: () => /^c[1-5]$/.test(book.id),
    linkify: escape, escapeHtml: escape, getDisplayEntry: entry => entry,
    renderBattleImages: () => '', envelopeAibpLink: () => '', renderOfficialScan: () => '',
    entryBookId: () => book.id, annotateEntityTextNodes() {},
    refreshSecondScreenStoryContentToggle() {}, secondScreenStoryModeToggle: { checked: false },
    battleAibpLink: () => '',
  });
  for (const name of ['mixedMediaRuntime', 'mixedMediaContext', 'renderMixedStoryText', 'storyTablesRender',
    'normalizeTableCell', 'isTableCellCandidate', 'parseBattleTable', 'renderBattleTable',
    'isSectionSubheading', 'prepareSectionedMedia', 'renderSectionedStory',
    'renderBattleSectionedStory', 'renderHtmlStory', 'renderAiTranslatedSupplement',
    'translatedSupplementUsesPlainLayout', 'renderStory']) {
    vm.runInContext(fn(mainSource, name), page);
  }
  return page;
}
function secondPage(h, api) {
  const elements = Object.fromEntries(['unavailableView', 'mapStage', 'battleView', 'storyView',
    'storyBookTitle', 'storySection', 'storyTitle', 'storyEntryId'].map(k => [k, h.document.createElement('div')]));
  elements.storyBody = h.container;
  const page = vm.createContext({
    window: { ATO_MIXED_MEDIA: api, location: h.env.location }, URL,
    document: h.document, elements, activeMode: 'map', storyRenderKey: '', storyRendered: false,
    mixedStoryGeneration: 0, latestStoryScreen: null, fitStoryTextToViewport() {},
  });
  for (const name of ['mixedMediaRuntime', 'renderMixedStoryBody', 'storyTablesHtml', 'escapeStoryText', 'storyScanImages', 'hasStorySnapshot', 'openStory']) {
    vm.runInContext(fn(ssSource, name, ''), page);
  }
  return page;
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function ready(h, image) {
  image.complete = true; image.naturalWidth = 70; image.naturalHeight = 70;
  image.dispatch('load'); await tick(); image.decodeResolve?.(); await tick(); h.frames(); await tick();
}
function transparent(container) {
  const clone = container.cloneNode(true);
  for (const node of clone.querySelectorAll('span').reverse()) {
    const keys = Object.keys(node.attrs);
    if (keys.length === 1 && /^data-ato-mm-(source|item)$/.test(keys[0])) node.replaceWith(...node.childNodes);
  }
  return clone.innerHTML;
}
function copy(h) {
  const fragment = h.document.createDocumentFragment();
  for (const node of h.container.childNodes) fragment.append(node.cloneNode(true));
  h.env.selection = { isCollapsed: false, rangeCount: 1,
    getRangeAt: () => ({ startContainer: h.container, endContainer: h.container, cloneContents: () => fragment }) };
  let value;
  h.container.dispatch('copy', { clipboardData: { setData(_type, text) { value = text; } } });
  return value ?? h.container.textContent;
}
const syntheticText = '前言。\n\n获得 +2［进展］。\n\n密文［查阅故事书］。\n\n前往0123。';
const syntheticContext = context('c4', 'test');
function fixtureMap() {
  const api = create(undefined, harness().env);
  const row = (needle, extra) => {
    const start = syntheticText.indexOf(needle);
    return { book: 'c4', key: 'test', variant: 'fan', position: 'replace', anchor: needle,
      replaceText: needle, anchorOccurrence: 1, anchorCount: 1,
      contextBefore: syntheticText.slice(0, start), contextAfter: syntheticText.slice(start + needle.length),
      textLength: syntheticText.length, textFingerprint: api.fingerprint(syntheticText), layout: 'inline',
      path: 'story/assets/mixed-media/images/c4/test.png', ...extra };
  };
  return { schema: 1, resourceSchema: 1, rows: [row('［查阅故事书］', { layout: 'block', alt: '密文' })],
    resourceRows: [row('［进展］', { kind: 'resource-icon', resourceLabel: '进展' })] };
}

test('mixed media rejects source drift, wrong identity, schemas and nonlocal paths', () => {
  const map = fixtureMap();
  for (const invalid of [undefined, { ...map, schema: 2 },
    { ...map, rows: [], resourceRows: map.resourceRows.map(r => ({ ...r, path: 'https://outside.invalid/x.png' })) },
    { ...map, rows: [], resourceRows: map.resourceRows.map(r => ({ ...r, path: 'story/assets/mixed-media/images/c4/../x.png' })) }]) {
    assert.equal(create(invalid, harness().env).plan(syntheticContext, syntheticText).count, 0);
  }
  const api = create(map, harness().env);
  for (const ctx of [context('c5', 'test'), context('c4', 'wrong'), context('c4', 'test', 'official')]) {
    assert.equal(api.plan(ctx, syntheticText).count, 0);
  }
  const drift = syntheticText + '修改';
  assert.equal(api.plan(syntheticContext, drift).count, 0);
  assert.equal(api.speechText(syntheticContext, drift), drift);
});

test('failed, slow, aborted and undecodable images keep exact source, copy and speech', async () => {
  for (const failure of ['error', 'abort', 'timeout', 'decode']) {
    const h = harness(), api = create(fixtureMap(), h.env);
    api.renderInto(h.container, syntheticContext, syntheticText);
    assert.equal(h.container.textContent, syntheticText);
    const images = [...h.document.imageRequests];
    if (failure === 'timeout') h.advance(2001);
    else if (failure === 'decode') {
      for (const im of images) { im.naturalWidth = 70; im.naturalHeight = 70; im.dispatch('load'); }
      await tick(); for (const im of images) im.decodeReject?.(Error('bad image'));
    } else for (const im of images) im.dispatch(failure);
    await tick(); h.frames();
    assert.equal(h.container.textContent, syntheticText);
    assert.equal(copy(h), syntheticText);
    assert.equal(api.speechText(syntheticContext, syntheticText, h.container), syntheticText);
    assert.equal(h.container.classList.contains('ato-mm-layout'), false);
    for (const im of images) await ready(h, im);
    assert.equal(h.container.querySelectorAll('.ato-mm-item').length, 0, 'late success after failure is ignored');
  }
});

test('successful images preserve adjacent numbers and copy, while navigation ignores old decoding', async () => {
  const h = harness(), api = create(fixtureMap(), h.env);
  api.renderInto(h.container, syntheticContext, syntheticText);
  for (const im of [...h.document.imageRequests]) await ready(h, im);
  assert.equal(h.container.querySelectorAll('.ato-mm-item').length, 2);
  assert.equal(copy(h), syntheticText);
  assert.ok(h.container.textContent.includes('+2'));
  assert.ok(api.speechText(syntheticContext, syntheticText, h.container).includes('+2进展'));
  assert.equal(h.container.classList.contains('ato-mm-layout'), true);
  api.renderInto(h.container, syntheticContext, syntheticText);
  const stale = [...h.document.imageRequests].slice(-2);
  api.renderInto(h.container, null, '下一条正文');
  for (const im of stale) await ready(h, im);
  assert.equal(h.container.textContent, '下一条正文');
  assert.equal(h.container.querySelectorAll('.ato-mm-item').length, 0);
});

test('the real second-screen adapter accepts old snapshots and preserves mounted images on identical polls', async () => {
  const h = harness(), api = create(fixtureMap(), h.env), page = secondPage(h, api);
  page.openStory({ story: { id: '0123', title: '测试', text: syntheticText } });
  assert.equal(h.container.textContent, syntheticText);
  assert.equal(h.document.imageRequests.length, 0, 'old snapshot has no identity, keeps source');
  const screen = { story: { id: '0123', title: '测试', text: syntheticText, mixedMedia: syntheticContext } };
  page.openStory(screen);
  for (const im of [...h.document.imageRequests]) await ready(h, im);
  const image = h.container.querySelector('.ato-mm-item');
  const requests = h.document.imageRequests.length;
  page.openStory({ ...screen, storyRevision: 2 });
  assert.equal(h.container.querySelector('.ato-mm-item'), image);
  assert.equal(h.document.imageRequests.length, requests);
});

test('C5 cleanup preserves exactly the three real-image placeholders', { skip: !local }, () => {
  const c5 = fan.books.find(b => b.id === 'c5');
  const marked = c5.entries.filter(e => e.text.includes('[图标]'));
  assert.deepEqual(marked.map(e => e.key).sort(), ['c5-0-353', 'c5-0-415', 'c5-4-50']);
  assert.equal(marked.reduce((n, e) => n + e.text.split('[图标]').length - 1, 0), 3);
  const removed = ['c5-1-9','c5-2-17','c5-2-60','c5-4-44','c5-4-49','c5-4-53','c5-5-55',
    'c5-7-2','c5-7-36','c5-0-86','c5-0-331','c5-0-351','c5-0-359','c5-0-361'];
  for (const key of removed) {
    const text = c5.entries.find(e => e.key === key).text;
    assert.ok(!text.includes('[图标]'), key);
    assert.ok(text.includes('此处包含密文，请查阅故事书'), key);
  }
});

test('all local mappings match exact source and immutable asset hashes', { skip: !local }, () => {
  const ix = new Map(fan.books.flatMap(b => b.entries.map(e => [`${b.id}|fan|${e.key}`, e.text])));
  for (const b of official.books) for (const e of b.entries) ix.set(`${b.id}|official|${e.key}`, e.officialText);
  const rows = ledgers.flatMap(k => mapping[k]), groups = new Map(), checked = new Set();
  for (const row of rows) {
    const identity = `${row.book}|${row.variant}|${row.key}`;
    assert.equal(sha(ix.get(identity)), row.sourceTextSha256, identity);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(row);
    if (!checked.has(row.path)) {
      assert.equal(sha(fs.readFileSync(path.join(root, row.path))), row.assetSha256, row.path);
      checked.add(row.path);
    }
  }
  const api = create(mapping, harness().env);
  for (const [identity, group] of groups) {
    const [book, variant, key] = identity.split('|'), text = ix.get(identity), p = api.plan(context(book, key, variant), text);
    assert.equal(p.count, group.length, identity);
    assert.deepEqual(p.issues, [], identity);
    assert.equal(p.tokens.map(t => t.type === 'text' ? t.text : t.original).join(''), text);
  }
  assert.equal(rows.length, 10814); // 8390 + 2026-10-06 的 2424 条 C4/C5 official 行
  assert.equal(checked.size, 434);
});

test('all mapped entries use real main and second-screen branches without dropping planned graphics', { skip: !local }, async () => {
  const rows = ledgers.flatMap(k => mapping[k]), groups = new Map();
  for (const row of rows) {
    const identity = `${row.book}|${row.variant}|${row.key}`;
    groups.set(identity, (groups.get(identity) || 0) + 1);
  }
  let tested = 0, mainCount = 0, secondCount = 0;
  for (const [identity, expected] of groups) {
    const [bookId, variant, key] = identity.split('|'), book = fan.books.find(b => b.id === bookId);
    const source = book.entries.find(e => e.key === key);
    const off = official.books.find(b => b.id === bookId)?.entries.find(e => e.key === key);
    const entry = variant === 'official' ? { ...source, ...off, key, text: off.officialText,
      title: off.officialTitle || source?.title || off.id,
      chapterKey: source?.chapterKey || off.chapterKey || 'main' } : source;
    for (const screen of ['main', 'second']) {
      const h = harness(); h.env.location.href = `https://qa.invalid/ato/${screen === 'main' ? 'story' : 'ss'}/index.html`;
      const api = create(mapping, h.env);
      const page = screen === 'main' ? mainPage(h, api, book, variant) : secondPage(h, api);
      if (screen === 'main') page.renderStory(entry);
      else page.openStory({ story: { id: entry.id, title: entry.title, text: entry.text,
        mixedMedia: context(bookId, key, variant) } });
      const before = transparent(h.container), images = [...h.document.imageRequests];
      assert.equal(images.length, expected, `${screen}/${identity}: actual image requests`);
      for (const image of images) await ready(h, image);
      assert.equal(h.container.querySelectorAll('.ato-mm-item').length, expected, `${screen}/${identity}: ready`);
      for (const image of images) image.dispatch('error');
      h.frames();
      assert.equal(transparent(h.container), before, `${screen}/${identity}: restores exact original structure`);
      api.dispose(h.container);
      if (screen === 'main') mainCount += images.length; else secondCount += images.length;
    }
    tested++;
  }
  assert.equal(mainCount, 10814); assert.equal(secondCount, 10814);
  console.log(`Mixed-media branch audit: ${tested} entry variants, main ${mainCount}, second ${secondCount}`);
});
