/**
 * 探索卡规则模块缺失时的兜底回归测试。
 *
 * 真实踩过的坑（macOS x64 便携包）：assets/exploration-card-rules.js 由普通 <script>
 * 加载，便携包用的是 php -S —— 它不读 .htaccess，静态响应里既没有 Cache-Control 也没有
 * ETag/Last-Modified，浏览器（Safari 尤其明显）会把同一个 URL 的旧响应长期复用；而这两个
 * 探索卡脚本是 index.html 里唯一没有 ?v= 的资源，一旦某次拿到空/半截响应就再也刷不掉。
 * 规则模块没执行 → window.ATO_EXPLORATION_RULES 不存在 → 登录后的整页渲染（探索卡库要
 * 逐张取标签）整体抛错，异常还被登录表单的 catch 显示在登录框里。
 *
 * 这里锁住三件事：
 *   1. index.html 里所有 ./assets/*.js 的 <script> 都必须带 ?v=（不给坏缓存留钉子）；
 *   2. 不允许再出现无保护的 window.ATO_EXPLORATION_RULES.xxx 调用；
 *   3. 内联兜底实现必须与 assets/exploration-card-rules.js 行为完全一致，防止两边漂移。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rules = require('../assets/exploration-card-rules.js');

/** 取出内联兜底实现，并在当前 realm 里求值（跨 realm 的 Map/Set 没法直接 deepEqual）。 */
function loadFallback() {
  const start = html.indexOf('// #region exploration-rules-fallback');
  const end = html.indexOf('// #endregion exploration-rules-fallback');
  assert.ok(start >= 0 && end > start, 'index.html 里找不到 exploration-rules-fallback 区间');
  const region = html.slice(start, end);
  const match = region.match(/const\s+explorationRulesFallback\s*=\s*([\s\S]+?);\s*$/);
  assert.ok(match, '兜底区间里找不到 explorationRulesFallback 的定义');
  return new Function(`return (${match[1]});`)();
}

const fallback = loadFallback();

test('index.html 里 ./assets/*.js 的脚本都带版本号', () => {
  const tags = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  const assetTags = tags.filter((src) => {
    const file = src.split('?')[0];
    return file.startsWith('./assets/') && file.endsWith('.js');
  });
  assert.ok(assetTags.length >= 8, `index.html 里的 assets 脚本太少（${assetTags.length}）`);
  const unversioned = assetTags.filter((src) => !src.includes('?v='));
  assert.deepEqual(unversioned, [], '这些资源没有版本号，浏览器会一直复用旧/坏响应');
});

test('探索卡规则只经过带兜底的访问器调用', () => {
  assert.equal(
    /window\.ATO_EXPLORATION_RULES\./.test(html),
    false,
    'index.html 里还有无保护的 window.ATO_EXPLORATION_RULES.xxx 调用'
  );
  assert.match(html, /function explorationRules\(\)\s*\{\s*return window\.ATO_EXPLORATION_RULES \|\| explorationRulesFallback;/);
});

test('兜底实现与 assets/exploration-card-rules.js 行为一致', () => {
  const tagCases = [
    {},
    { removal: 'permanent' },
    { removal: 'remove' },
    { removal: 'keep' },
    { removal: 'keep', draw: 'chain' },
    { removal: 'remove', draw: 'single' },
    { removal: 'permanent', draw: 'chain' },
    { removal: 'other', draw: 'other' },
  ];
  for (const entry of tagCases) {
    assert.deepEqual(fallback.normalizeTag(entry), rules.normalizeTag(entry), `normalizeTag(${JSON.stringify(entry)})`);
  }
  assert.deepEqual(fallback.normalizeTag(), rules.normalizeTag(), 'normalizeTag() 的默认参数行为');

  const tags = {
    a: { removal: 'remove', draw: 'single' },
    b: { removal: 'keep', draw: 'chain' },
    c: { removal: 'keep', draw: 'single' },
    d: { removal: 'permanent', draw: 'single' },
    e: { removal: 'keep', draw: 'single' },
    f: { removal: 'keep', draw: 'chain' },
  };
  const getTag = (id) => tags[id];
  const makeRecord = (id, tag, pile) => ({ id, ...tag, pile });

  for (const deck of [['a', 'b', 'c', 'd', 'e'], ['b'], ['c', 'a', 'f'], [], ['f', 'f', 'c']]) {
    const mine = fallback.drawTwoPiles(deck, getTag, makeRecord);
    const theirs = rules.drawTwoPiles(deck, getTag, makeRecord);
    assert.deepEqual(mine, theirs, `drawTwoPiles(${JSON.stringify(deck)})`);
    assert.deepEqual(fallback.settlePiles(mine.piles), rules.settlePiles(theirs.piles), `settlePiles(${JSON.stringify(deck)})`);
  }

  for (const [fromIds, toIds] of [
    [['a', 'b'], ['x', 'y']],
    [['a', 'b', 'c'], ['x']],
    [['a'], ['x', 'y', 'z']],
    [[], ['x']],
    [['a'], []],
  ]) {
    const mine = fallback.createReplacementPlan(fromIds, toIds);
    const theirs = rules.createReplacementPlan(fromIds, toIds);
    assert.deepEqual(mine, theirs, `createReplacementPlan(${JSON.stringify(fromIds)}, ${JSON.stringify(toIds)})`);
    for (const ids of [['a', 'b', 'c', 'd'], [], ['z']]) {
      for (const includeAdded of [false, true]) {
        assert.deepEqual(
          fallback.applyReplacementPlan(ids, mine, includeAdded),
          rules.applyReplacementPlan(ids, theirs, includeAdded),
          `applyReplacementPlan(${JSON.stringify(ids)}, ${JSON.stringify(fromIds)}->${JSON.stringify(toIds)}, ${includeAdded})`
        );
      }
    }
  }
});

test('printed chain symbols draw another card, while Theseus Cache stops its stack despite temporary removal', () => {
  const vm = require('node:vm');
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/exploration-card-tags.js'), 'utf8'), ctx);
  const tags = ctx.window.ATO_EXPLORATION_CARD_TAGS.cards;
  for (const implementation of [rules, fallback]) {
    assert.equal(implementation.normalizeTag(tags['c1:8201']).draw, 'single');
    assert.equal(implementation.normalizeTag({ removal: 'remove' }).draw, 'chain', 'legacy tags retain their default');
    for (const id of ['10305', '10310']) {
      const result = implementation.drawTwoPiles([id, 'end', 'second', 'left'],
        card => tags[`c5:${card}`] || {}, (id, tag, pile) => ({ id, ...tag, pile }));
      assert.deepEqual(result.piles.map(pile => pile.map(card => card.id)), [[id, 'end'], ['second']]);
      assert.equal(result.piles[0][0].removal, 'keep');
      assert.deepEqual(result.drawPile, ['left']);
    }
  }
});

test('the tag editor preserves all five cycles, independent tags and sparse imports without restoring old drafts', async () => {
  const vm = require('node:vm');
  const editor = fs.readFileSync(path.join(root, 'tools/exploration-card-tag-editor.html'), 'utf8');
  const stored = new Map();
  const c = vm.createContext({ window: {}, saveDraft() {}, render() {}, dirty: false,
    localStorage: { getItem: key => stored.get(key) || null, removeItem: key => stored.delete(key) } });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/exploration-card-tags.js'), 'utf8'), c);
  const start = editor.indexOf('    const cycleLabels = ');
  const end = editor.indexOf('    let data = ', start);
  vm.runInContext(editor.slice(start, end), c);
  vm.runInContext(editor.match(/^    const STORAGE_KEY = .+;$/m)[0], c);
  const extract = name => {
    const match = editor.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
    assert.ok(match, name);
    return match[0];
  };
  vm.runInContext(['normalizeData', 'entryFor', 'updateEntry', 'loadDraft', 'importJson'].map(extract).join('\n'), c);
  c.keyFor = card => `${card.cycleId}:${card.cardId}`;
  c.data = c.normalizeData(c.window.ATO_EXPLORATION_CARD_TAGS);
  assert.equal(Object.keys(c.data.cards).length, 223);
  assert.deepEqual(Array.from(vm.runInContext('catalog.map(card => `${card.cycleId}:${card.cardId}`).sort()', c)),
    Object.keys(c.data.cards).sort());
  const card = { cycleId: 'c1', cardId: '8201' };
  c.updateEntry(card, 'notes', 'checked against the printed footer');
  assert.equal(c.data.cards['c1:8201'].removal, 'remove');
  assert.equal(c.data.cards['c1:8201'].draw, 'single');
  const reloaded = c.normalizeData(JSON.parse(JSON.stringify(c.data)));
  assert.equal(reloaded.cards['c1:8201'].draw, 'single');
  assert.equal(Object.keys(reloaded.cards).length, 223);

  const legacyKey = 'ato-exploration-card-tags-draft-v1';
  const legacyDraft = JSON.stringify({ cards: { 'c1:8201': { removal: 'remove', draw: 'chain' } } });
  stored.set(legacyKey, legacyDraft);
  c.loadDraft();
  assert.equal(c.data.cards['c1:8201'].draw, 'single', 'an old draft must not silently restore the incorrect draw tag');
  assert.equal(stored.get(legacyKey), legacyDraft, 'the old draft remains available for manual recovery');

  await c.importJson({ text: async () => JSON.stringify({ cards: {
    'c1:6400': { removal: 'permanent', draw: 'single', reviewed: true, notes: 'explicit partial import' },
  } }) });
  assert.equal(Object.keys(c.data.cards).length, 223);
  assert.equal(c.data.cards['c1:6400'].removal, 'permanent', 'an explicit imported value takes precedence');
  assert.equal(c.data.cards['c1:6400'].draw, 'single');
  assert.equal(c.data.cards['c1:6400'].notes, 'explicit partial import');
  for (const key of ['c4:9300', 'c5:10305', 'c5:10310']) {
    assert.deepEqual(JSON.parse(JSON.stringify(c.data.cards[key])), JSON.parse(JSON.stringify(c.window.ATO_EXPLORATION_CARD_TAGS.cards[key])));
  }
});
