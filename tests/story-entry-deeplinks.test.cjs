/*
 * 主控台「故事 / 考察」入口的深链回归：
 * 每个循环都要能把箱号 / 编号（12、1-2、α、Ω…）解析成对应循环故事书里的那一条。
 * 之前只有 C2 / C4 的条目 id 恰好是纯数字，C1 / C3 的 id 带 slug
 * （12-the-argonites、1-2-turf-laws…），深链查不到就静默落回该章第一条，
 * 表现为「内蕴奥德赛按钮不跟着进度跳」。这个测试把 5 个循环 × 每个按钮
 * 的每个目标都跑一遍，防止再退回去。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'story/assets/app.js'), 'utf8').replace(/\r\n/g, '\n');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

// 故事书数据里确实还不存在的段号：主控台表里填了，但故事书没有这条。
// 修好数据（或改正段号）以后这个清单必须清空，测试会提醒。
const knownMissingStoryEntries = ['c5 主线 4104', 'c5 主线 6118'];

function extractFunction(name) {
  const match = appSource.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `story/assets/app.js 缺少函数 ${name}`);
  return match[0];
}

function extractLiteral(name, source = htmlSource) {
  const start = source.indexOf(`const ${name} = `);
  assert.ok(start >= 0, `缺少常量 ${name}`);
  const open = source.slice(start).search(/[[{]/);
  const from = start + open;
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (!depth) return vm.runInNewContext(`(${source.slice(from, index + 1)})`, {});
    }
  }
  throw new Error(`常量 ${name} 没有闭合`);
}

function storyContext() {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'story/data/storybook-data.js'), 'utf8'), scope);
  const context = vm.createContext({
    data: scope.window.STORYBOOK_DATA,
    activeEntry: null,
    selectedChapterKey: () => 'all',
    selectedEncounterKey: () => 'all',
    // entryFromDeepLink 只在没有 entryId 时才用当前范围，测试里始终带 entryId。
    currentScopedEntries: () => [],
    currentChapterEntries: (book) => book.entries,
  });
  const names = [
    'normalizeDeepLinkValue',
    'resolveChapterKey',
    'resolveEncounterKey',
    'normalizeShortIdValue',
    'normalizeShortIdTitle',
    'entriesById',
    'entriesByShortId',
    'hasEntryContent',
    'preferEntriesWithContent',
    'preferredEntry',
    'entryFromDeepLink',
  ];
  vm.runInContext(names.map(extractFunction).join('\n'), context);
  return context;
}

function storyBook(context, cycle) {
  const book = context.data.books.find((item) => item.id === cycle);
  assert.ok(book, `故事书缺少 ${cycle}`);
  return book;
}

// 深链命中的那一条，必须自己就带着这个箱号 / 编号：id 精确、id 前缀，
// 或者标题以「箱号 + 空格」开头（α / Ω 这类箱子只写在标题里）。
function matchesMarker(context, entry, marker) {
  const value = context.normalizeShortIdValue(marker);
  const id = context.normalizeShortIdValue(entry.id);
  if (id === value || id.startsWith(`${value}-`)) return true;
  const title = context.normalizeShortIdTitle(entry.title);
  return title === value || title.startsWith(`${value} `);
}

function pushTarget(targets, button, chapterValue, entry, marker = entry, bookId = '') {
  if (entry === undefined || entry === null || entry === '') return;
  targets.push({ button, chapterValue, entry: String(entry), marker: String(marker), bookId });
}

function hubChapterKey(hub, index) {
  return `hub-${String(index + 1).padStart(2, '0')}-${hub.chapterId || hub.id}`;
}

// 主控台每个入口交给 getStoryHref 的原始参数（chapter / module + entry），
// 与 index.html 里的 getStepLinks + getStoryHref 一致。
function consoleStoryTargets(cycle, tables) {
  const targets = [];
  const range = tables.ranges[cycle];
  const knowledgeStart = { c1: 1, c2: 20, c3: 40, c4: 60, c5: 80 }[cycle];

  for (const raw of [knowledgeStart, range ? range.min : knowledgeStart, range ? Math.min(range.max, range.min + 4) : knowledgeStart + 4, range ? range.max : knowledgeStart + 20]) {
    const entry = range ? Math.min(range.max, Math.max(range.min, raw || range.min)) : raw;
    pushTarget(targets, `内蕴奥德赛(知识${raw})`, 'inward-odyssey', entry);
  }

  const pharos = tables.pharos[cycle];
  assert.ok(pharos, `index.html 缺少 ${cycle} 的 pharosDreamConstants`);
  for (const row of pharos.boxes) pushTarget(targets, '法洛斯之梦', pharos.module, row[3]?.entry || row[0]);

  const mainStory = tables.mainStory[cycle];
  assert.ok(mainStory, `index.html 缺少 ${cycle} 的 mainStoryConstants`);
  for (const row of mainStory.boxes) pushTarget(targets, '主线', mainStory.chapter, row[3]?.entry || row[0]);

  const special = tables.special[cycle];
  assert.ok(special, `index.html 缺少 ${cycle} 的 specialEventConstants`);
  for (const row of special.boxes) pushTarget(targets, '特殊事件', special.chapter, row[3]?.entry || row[0]);

  // 回忆突破没有定数框，但每个循环都必须有能解析到的章节。
  const mnemos = tables.mnemos[cycle];
  assert.ok(mnemos, `index.html 缺少 ${cycle} 的 mnemosBreakthroughConstants`);
  targets.push({ button: '回忆突破', chapterValue: mnemos.chapter, entry: '', marker: '', chapterOnly: true });
  // 存档里还没有这张表时的旧兜底写法也必须能解析到章节（c2 是单数键）。
  targets.push({ button: '回忆突破(旧兜底)', chapterValue: 'mnemos-breakthroughs', entry: '', marker: '', chapterOnly: true });

  const survey = tables.survey[cycle];
  assert.ok(survey, `index.html 缺少 ${cycle} 的 surveyConstantData`);
  survey.hubs.forEach((hub, index) => {
    for (const [boxId] of hub.boxes) {
      const marker = boxId === 'alpha' ? 'α' : boxId === 'omega' ? 'Ω' : boxId;
      pushTarget(targets, `冒险中枢 ${hub.id}`, hubChapterKey(hub, index), marker);
    }
  });
  for (const [id] of survey.rr) pushTarget(targets, 'R&R', 'rr-adventures', id);

  // 宿敌战斗：目标书由表自己指定——循环 3 读的仍是 C2 故事书里的重担之战。
  const battle = tables.battle[cycle];
  assert.ok(battle, `index.html 缺少 ${cycle} 的 adversaryBattleByCycle`);
  pushTarget(targets, '宿敌战斗', battle.chapter, battle.entry, battle.entry, battle.book);
  // encounter 参数是入口层筛选（不是条目 id），由 resolveEncounterKey 解析。
  targets.push({
    button: '宿敌战斗(encounter)',
    chapterValue: battle.chapter,
    entry: '',
    marker: '',
    encounter: battle.encounter,
    bookId: battle.book,
  });

  return targets;
}

function tables() {
  return {
    cycles: extractLiteral('cycleConfigs').map((config) => config.id),
    ranges: extractLiteral('inwardOdysseyStoryRanges'),
    pharos: extractLiteral('pharosDreamConstants'),
    mainStory: extractLiteral('mainStoryConstants'),
    special: extractLiteral('specialEventConstants'),
    mnemos: extractLiteral('mnemosBreakthroughConstants'),
    survey: extractLiteral('surveyConstantData'),
    battle: extractLiteral('adversaryBattleByCycle'),
  };
}

test('内蕴奥德赛的知识区间覆盖每个循环，且互不重叠', () => {
  const { cycles, ranges } = tables();
  for (const cycle of cycles) {
    assert.ok(ranges[cycle], `${cycle} 缺少内蕴奥德赛知识区间`);
    assert.ok(ranges[cycle].min <= ranges[cycle].max, `${cycle} 的知识区间上下限反了`);
  }
  const covered = cycles.map((cycle) => ranges[cycle]);
  for (const range of covered) {
    const overlaps = covered.filter((other) => other !== range && other.min <= range.max && range.min <= other.max);
    assert.equal(overlaps.length, 0, `内蕴奥德赛区间重叠：${JSON.stringify(range)}`);
  }
});

test('每个循环的每个入口都有能解析到的章节和条目', () => {
  const context = storyContext();
  const data = tables();
  const misses = [];

  for (const cycle of data.cycles) {
    const book = storyBook(context, cycle);
    for (const target of consoleStoryTargets(cycle, data)) {
      const label = `${cycle} ${target.button} ${target.entry}`;
      // 目标书由入口自己决定（宿敌战斗可能是别的循环的书），章节名也要在那本书里解析。
      const targetBook = target.bookId ? storyBook(context, target.bookId) : book;
      const chapterKey = context.resolveChapterKey(targetBook, target.chapterValue);
      assert.ok(chapterKey, `${label} 的章节 ${target.chapterValue} 在 ${targetBook.id} 里解析不到`);
      assert.ok(
        targetBook.chapters.some((chapter) => chapter.key === chapterKey),
        `${label} 的章节 ${target.chapterValue} 解析成不存在的 ${chapterKey}`,
      );
      if (target.chapterOnly) continue;

      if (target.encounter) {
        const encounterKey = context.resolveEncounterKey(targetBook, target.encounter);
        assert.ok(encounterKey, `${label} 的 encounter ${target.encounter} 在 ${chapterKey} 里解析不到`);
        assert.ok(
          targetBook.entries.some((item) => item.chapterKey === chapterKey && item.encounterKey === encounterKey),
          `${label} 的 encounter ${target.encounter} 解析成 ${encounterKey}，但战斗章节里没有对应条目`,
        );
        continue;
      }

      const entry = context.preferredEntry(targetBook, target.entry, { chapterKey });
      if (!entry) {
        misses.push(label);
        continue;
      }
      assert.equal(entry.chapterKey, chapterKey, `${label} 跳到了别的模块：${entry.id} @ ${entry.chapterKey}`);
      assert.ok(
        matchesMarker(context, entry, target.marker),
        `${label} 跳到了同章节里不相干的条目：${entry.id}（${entry.title}）`,
      );
    }
  }

  assert.deepEqual(misses.sort(), [...knownMissingStoryEntries].sort(), '故事书里缺失的段号清单变了');
});

test('短号只在指定章节里兜底，找不到时不会落回章节第一条', () => {
  const context = storyContext();
  const c1 = storyBook(context, 'c1');

  const inward = context.preferredEntry(c1, '12', { chapterKey: 'inward-odyssey' });
  assert.equal(inward.id, '12-the-argonites');

  const pharos = context.preferredEntry(c1, '5', { chapterKey: 'dreams-of-pharos' });
  assert.ok(pharos.id.startsWith('5-'));

  const hub = context.preferredEntry(c1, 'α', { chapterKey: 'hub-04-man-of-purpose' });
  assert.ok(context.normalizeShortIdTitle(hub.title).startsWith('α '));

  // 「12」在主线模块里没有对应段：必须返回 null（由调用方回落到模块首页），
  // 不能把该章第一条当成结果。
  assert.equal(context.preferredEntry(c1, '12', { chapterKey: 'main' }), null);
  assert.equal(context.preferredEntry(c1, '9999', { chapterKey: 'inward-odyssey' }), null);

  // 没有章节提示时不做兜底，避免「12」命中别的模块。
  assert.equal(context.preferredEntry(c1, '12', { chapterKey: null }), null);

  // 真实的深链路径：init 先把章节选到 URL 上的 chapter，再交给 entryFromDeepLink。
  context.selectedChapterKey = () => 'inward-odyssey';
  const viaDeepLink = context.entryFromDeepLink(c1, { entryId: '12', chapterKey: 'inward-odyssey' });
  assert.equal(viaDeepLink.id, '12-the-argonites');
});

function extractHtmlFunction(name) {
  const match = htmlSource.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `index.html 缺少函数 ${name}`);
  return match[0];
}

test('主控台内蕴奥德赛入口把知识值夹到当循环可用段落', () => {
  const ranges = extractLiteral('inwardOdysseyStoryRanges');
  const cases = [
    ['c1', 1, 'inward-odyssey', '1', false],
    ['c1', 12, 'inward-odyssey', '12', false],
    ['c2', 25, 'inward-odyssey', '25', false],
    ['c3', 40, 'inward-odyssey', '41', true],
    ['c4', 90, 'inward-odyssey', '80', true],
    ['c5', 80, 'inward-odyssey', '81', true],
  ];

  for (const [cycle, position, chapter, entry, clamped] of cases) {
    const context = vm.createContext({
      URLSearchParams,
      currentCycleConfig: () => ({ id: cycle, storyBook: cycle }),
      ensureCardTracks: () => ({ inwardOdyssey: { position, progress: 0 } }),
    });
    vm.runInContext([
      `const inwardOdysseyStoryRanges = ${JSON.stringify(ranges)};`,
      extractHtmlFunction('normalizeCounterValue'),
      extractHtmlFunction('getStoryHref'),
      extractHtmlFunction('getInwardOdysseyStoryLink'),
    ].join('\n'), context);

    const link = context.getInwardOdysseyStoryLink();
    const url = new URL(link.href, 'http://localhost/story/');
    assert.equal(url.searchParams.get('book'), cycle);
    assert.equal(url.searchParams.get('chapter'), chapter);
    assert.equal(url.searchParams.get('entry'), entry, `${cycle} 知识 ${position} 应跳到 ${entry}`);
    assert.match(link.title, new RegExp(`当前内蕴奥德赛 ${position}`));
    assert.equal(
      link.title.includes('跳转到可用段落'),
      clamped,
      `${cycle} 知识 ${position} 的夹取提示不对：${link.title}`,
    );
  }
});

test('主控台回忆突破入口用各循环自己的章节', () => {
  const mnemos = extractLiteral('mnemosBreakthroughConstants');
  for (const cycle of Object.keys(mnemos)) {
    const context = vm.createContext({
      URLSearchParams,
      currentCycleConfig: () => ({ id: cycle, storyBook: cycle }),
      currentMnemosBreakthroughConstants: () => mnemos[cycle],
      getActiveMnemosBreakthroughTarget: () => null,
    });
    vm.runInContext([
      extractHtmlFunction('getStoryHref'),
      extractHtmlFunction('getMnemosBreakthroughLink'),
    ].join('\n'), context);

    const url = new URL(context.getMnemosBreakthroughLink().href, 'http://localhost/story/');
    assert.equal(url.searchParams.get('book'), cycle);
    assert.equal(url.searchParams.get('chapter'), mnemos[cycle].chapter, `${cycle} 的回忆突破章节不对`);
  }
});

test('地图模块的宿敌战斗表和主控台保持一致', () => {
  const mapSource = fs.readFileSync(path.join(root, 'map/app.js'), 'utf8').replace(/\r\n/g, '\n');
  // 两个常量来自不同的 vm realm，比较序列化结果而不是对象原型。
  assert.equal(
    JSON.stringify(extractLiteral('adversaryBattleByCycle', mapSource)),
    JSON.stringify(extractLiteral('adversaryBattleByCycle')),
    'map/app.js 与 index.html 的宿敌战斗目标不一致（曾出现 c3 抄成 c2）',
  );
});

test('精确 id 仍然优先，官方版条目不受短号兜底影响', () => {
  const context = storyContext();
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    const book = storyBook(context, cycle);
    for (const entry of book.entries) {
      if (!context.hasEntryContent(entry)) continue;
      const resolved = context.preferredEntry(book, entry.id, { chapterKey: entry.chapterKey });
      assert.ok(resolved, `${cycle} ${entry.id} 精确 id 反而不命中`);
      assert.equal(resolved.id, entry.id, `${cycle} ${entry.id} 被短号兜底顶掉了：${resolved.id}`);
    }
  }
});
