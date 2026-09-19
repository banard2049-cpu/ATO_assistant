/*
 * 官方翻译的另外两块回归：故事步骤的主线 / 特殊事件定数框，以及英雄记录表的回忆词条徽章。
 *
 * 主线定数框（C2）的标签原本是英文 Hull Depleted / Crew Depleted，C3 是民间译名
 * 船体失败 / 船员失败 / 阿尔戈号命运失败：官方翻译下统一成官方正文里的「船体耗尽」
 * 「船员耗尽」「阿尔戈号命运耗尽」。特殊事件定数框的格子里左边是英文原名、右边是中文
 * 译名，官方翻译下英文原名整格清空，只留一行官方标题。英雄记录表的回忆词条徽章
 * （deed / voyage…）换成该页 MNEMOS_TAGS 的中文名。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const { createEngine } = require('./helpers/term-language.cjs');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const htmlSource = read('index.html');
const heroSource = read('hero/index.html');
const cycles = ['c1', 'c2', 'c3', 'c4', 'c5'];
const stepScope = '[data-term-scope~="step-constants"]';
const tagScope = '[data-term-scope~="mnemos-tag"]';
// 定数框标题旁挂的英文副标题（Main Story / Special Events / Dreams of Pharos…）是刻意的
// 双语注释，不在替换范围内；除此之外这个作用域里不该再有英文。
const englishAllowed = new Set(['Main Story', 'Special Events', 'Dreams of Pharos', 'Ten Thousand Nights and Days', 'Sermons on the Shoals']);

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

function extractHtmlFunction(name, source = htmlSource) {
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `缺少函数 ${name}`);
  return match[0];
}

function loadWindow(file, key) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox, { filename: file });
  return sandbox.window[key];
}

const terms = loadWindow('assets/ato-terms.js', 'ATO_TERMS');
const mainStory = extractLiteral('mainStoryConstants');
const special = extractLiteral('specialEventConstants');

// 用 term-language.js 的真实套用逻辑（从左往右最长命中，译文不再被二次改写）。
const engine = createEngine(terms);
const stepPairs = engine.pairsFor([stepScope]);
const tagPairs = engine.pairsFor([tagScope]);
const translateStep = (value) => engine.translate(value, [stepScope]);
const translateTag = (value) => engine.translate(value, [tagScope]);
const hasLatin = (value) => /[A-Za-z]/.test(value);

test('两个页面都标了各自的作用域', () => {
  const simple = extractHtmlFunction('createSimpleConstantTools');
  assert.match(simple, /setAttribute\("data-term-scope", "step-constants"\)/, '主线/特殊事件定数框没标作用域');
  const badges = heroSource.match(/mnemos-tag-badge" data-term-scope="mnemos-tag"/g) || [];
  assert.equal(badges.length, 2, `英雄记录表的回忆词条徽章应有 2 处（普通回忆 + 宿命回忆），实际 ${badges.length}`);
  assert.ok(stepPairs.length >= 10, `step-constants 条目太少：${stepPairs.length}`);
  assert.ok(tagPairs.some((pair) => pair.scope === tagScope && pair.from === 'deed'), 'mnemos-tag 里没有 deed');
});

test('主线定数框：英文与民间译名都换成官方正文的说法', () => {
  const expected = {
    c2: { 0248: '船体耗尽', 0249: '船员耗尽' },
    c3: { 0271: '船体耗尽', 0272: '船员耗尽', 0273: '阿尔戈号命运耗尽' },
  };
  const wrong = [];
  for (const cycle of cycles) {
    const data = mainStory[cycle];
    assert.ok(data, `index.html 缺少 ${cycle} 的 mainStoryConstants`);
    for (const row of data.boxes) {
      const [, roll, label] = row;
      const zh = translateStep(label);
      if (hasLatin(zh)) wrong.push(`${cycle} ${row[0]} 标签 ${label} -> ${zh} 还有英文`);
      if (hasLatin(translateStep(roll))) wrong.push(`${cycle} ${row[0]} 箱号 ${roll} 还有英文`);
      const want = expected[cycle]?.[row[0]];
      if (want && zh !== want) wrong.push(`${cycle} ${row[0]} 应为 ${want}，实际 ${zh}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('主线定数框的官方说法确实出自官方正文', () => {
  const official = loadWindow('story/data/storybook-official-data.js', 'STORYBOOK_OFFICIAL_DATA');
  const c2 = official.books.find((book) => book.id === 'c2');
  const text = c2.entries.map((entry) => String(entry.officialText || '')).join('\n');
  assert.ok(text.includes('船体耗尽'), '官方正文里找不到「船体耗尽」');
  assert.ok(text.includes('船员耗尽'), '官方正文里找不到「船员耗尽」');
});

test('特殊事件定数框：英文原名清空，中文名换成官方标题', () => {
  const official = loadWindow('story/data/storybook-official-data.js', 'STORYBOOK_OFFICIAL_DATA');
  const wrong = [];
  for (const cycle of cycles) {
    const data = special[cycle];
    assert.ok(data, `index.html 缺少 ${cycle} 的 specialEventConstants`);
    const book = official.books.find((item) => item.id === cycle);
    const titles = (book?.entries || []).map((entry) => String(entry.officialTitle || ''));
    for (const row of data.boxes) {
      const [, roll, label] = row;
      const rollZh = translateStep(roll);
      if (rollZh !== '') wrong.push(`${cycle} ${row[0]} 英文原名 ${roll} -> ${rollZh}，应清空`);
      const labelZh = translateStep(label);
      if (hasLatin(labelZh)) wrong.push(`${cycle} ${row[0]} 中文名 ${label} -> ${labelZh} 还有英文`);
      if (book && !titles.some((title) => title.includes(labelZh))) {
        wrong.push(`${cycle} ${row[0]} 的 ${labelZh} 不是官方标题的一部分`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('特殊事件定数框里除双语副标题外不再有英文', () => {
  const leftovers = [];
  for (const cycle of cycles) {
    const data = special[cycle];
    [data.title, '特殊事件定数框'].forEach((value) => {
      if (!englishAllowed.has(value) && hasLatin(translateStep(value))) {
        leftovers.push(`${cycle} ${value} -> ${translateStep(value)}`);
      }
    });
    data.boxes.forEach(([, roll, label]) => {
      if (!englishAllowed.has(label) && hasLatin(translateStep(label))) {
        leftovers.push(`${cycle} ${label} -> ${translateStep(label)}`);
      }
      assert.equal(translateStep(roll), '', `${cycle} 的 ${roll} 没清掉`);
    });
  }
  assert.deepEqual(leftovers, []);
});

test('定数框里的官方名不会被别的条目二次改写', () => {
  // 引擎只对原文套用一次术语（见 tests/term-engine.test.cjs）：
  // 「阿尔戈号命运失败」写出来的「阿尔戈号命运耗尽」不会被全局「阿尔戈号命运 => 阿尔戈命运」改掉。
  assert.equal(translateStep('Hull Depleted'), '船体耗尽');
  assert.equal(translateStep('阿尔戈号命运失败'), '阿尔戈号命运耗尽');
  assert.equal(translateStep('Rude Awakening'), '');
});

test('英雄记录表的回忆词条徽章换成中文', () => {
  const tags = extractLiteral('MNEMOS_TAGS', heroSource);
  assert.equal(tags.length, 11, `MNEMOS_TAGS 条数变了：${tags.length}`);
  for (const tag of tags) {
    assert.equal(translateTag(tag.id), tag.zh, `词条 ${tag.id} 应显示 ${tag.zh}`);
  }
  // 未被替换的情况下必须原样返回，避免误伤页面里别的英文。
  assert.equal(translateTag('unknown-tag'), 'unknown-tag');
  const heroTagZh = extractHtmlFunction('mnemosTagZh', heroSource);
  assert.match(heroTagZh, /MNEMOS_TAGS\.find/, 'mnemosTagZh 应查 MNEMOS_TAGS');
});
