/*
 * 主控台勘察步骤「定数框」的官方翻译回归。
 *
 * 官方翻译下，定数框里的 C1-C3 分支总表 / 分支卡 / R&R 卡不该再有英文：分支名与冒险名
 * 一律是故事书官方版里那一条的标题（story/data/storybook-official-data.js），战斗地形是
 * 官方中文地形卡的卡面名（official-assets/terrain-cards/），标签徽章沿用主控台已有的
 * MNEMOS_TAG_ZH。只剩总表表头（Story I… / Adventure Hub / Battle Terrain）按约定保留英文。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const { createEngine } = require('./helpers/term-language.cjs');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const scopeSelector = '[data-term-scope~="survey-record"]';
const cycles = ['c1', 'c2', 'c3'];
// 定数框里允许保持英文的部分：总表表头（官方故事书与地形卡里都没有对应标题）。
const englishAllowed = new Set(['Adventure Hub', 'Battle Terrain', 'Story I', 'Story II', 'Story III', 'Story IV']);

function extractLiteral(name, source = htmlSource) {
  const start = source.indexOf(`const ${name} = `);
  assert.ok(start >= 0, `index.html 缺少常量 ${name}`);
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

function extractHtmlFunction(name) {
  const match = htmlSource.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `index.html 缺少函数 ${name}`);
  return match[0];
}

function loadWindow(file, key) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  return sandbox.window[key];
}

const terms = loadWindow('assets/ato-terms.js', 'ATO_TERMS');
const survey = extractLiteral('surveyConstantData');
const mnemosTagZh = extractLiteral('MNEMOS_TAG_ZH');

// term-language.js 的真实套用方式（从左往右最长命中，译文不再被二次改写）。
const engine = createEngine(terms);
const scopedPairs = engine.pairsFor([scopeSelector]);
const translate = (value) => engine.translate(value, [scopeSelector]);
const hasLatin = (value) => /[A-Za-z]/.test(value);

test('勘察步骤定数框带上了 survey-record 作用域标记', () => {
  const body = extractHtmlFunction('createSurveyConstantTools');
  assert.match(body, /setAttribute\("data-term-scope", "survey-record"\)/, '定数框没标作用域，术语表不会生效');
  assert.ok(
    scopedPairs.some((pair) => pair.scope === scopeSelector),
    'assets/ato-terms.js 里没有 survey-record 的条目',
  );
});

test('survey-record 条目的译文都是中文，且不含空条目', () => {
  const scoped = terms.filter((pair) => pair.scope === scopeSelector);
  assert.ok(scoped.length > 100, `survey-record 条目太少：${scoped.length}`);
  for (const pair of scoped) {
    assert.ok(pair.from && pair.to, `空条目：${JSON.stringify(pair)}`);
    assert.ok(!hasLatin(pair.to), `译文里还有英文：${pair.from} -> ${pair.to}`);
  }
});

test('C1-C3 定数框的分支名、冒险名、R&R 名、标签都有对应术语', () => {
  const missing = [];
  for (const cycle of cycles) {
    const table = survey[cycle];
    assert.ok(table, `index.html 缺少 ${cycle} 的 surveyConstantData`);
    table.hubs.forEach((hub) => {
      if (!translate(hub.title).match(/[\u4e00-\u9fa5]/)) missing.push(`${cycle} 分支名 ${hub.title}`);
      hub.boxes.forEach(([, , label, tag]) => {
        if (hasLatin(translate(label))) missing.push(`${cycle} ${hub.id} 冒险名 ${label}`);
        if (tag && hasLatin(translate(tag))) missing.push(`${cycle} ${hub.id} 标签 ${tag}`);
      });
    });
    table.rr.forEach(([, title]) => {
      if (hasLatin(translate(title))) missing.push(`${cycle} R&R ${title}`);
    });
  }
  assert.deepEqual(missing, [], '这些定数框条目在官方翻译下仍然是英文');
});

test('译名取自故事书：分支名出现在官方正文，冒险名与 R&R 名是官方标题', () => {
  const official = loadWindow('story/data/storybook-official-data.js', 'STORYBOOK_OFFICIAL_DATA');
  const problems = [];
  for (const cycle of cycles) {
    const book = official.books.find((item) => item.id === cycle);
    assert.ok(book, `官方故事书缺少 ${cycle}`);
    const titles = book.entries.map((entry) => String(entry.officialTitle || ''));
    const corpus = titles.join('\n') + '\n' + book.entries.map((entry) => String(entry.officialText || '')).join('\n');
    const table = survey[cycle];
    table.hubs.forEach((hub) => {
      const zh = translate(hub.title);
      if (!corpus.includes(zh)) problems.push(`${cycle} 分支名 ${hub.title} -> ${zh} 在官方故事书里找不到`);
      hub.boxes.forEach(([, , label]) => {
        const boxZh = translate(label);
        if (!titles.some((title) => title.includes(boxZh))) {
          problems.push(`${cycle} 冒险名 ${label} -> ${boxZh} 不是任何官方标题的一部分`);
        }
      });
    });
    table.rr.forEach(([, title]) => {
      const rrZh = translate(title);
      if (!titles.some((entryTitle) => entryTitle.includes(rrZh))) {
        problems.push(`${cycle} R&R ${title} -> ${rrZh} 不是任何官方标题的一部分`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test('C1-C3 定数框里除总表表头外不再有英文', () => {
  const leftovers = [];
  const check = (cycle, what, value) => {
    if (englishAllowed.has(value)) return;
    if (hasLatin(translate(value))) leftovers.push(`${cycle} ${what}：${value} -> ${translate(value)}`);
  };
  for (const cycle of cycles) {
    const table = survey[cycle];
    ['定数框', '冒险中枢', 'R&R 冒险', '冒险中枢总表'].forEach((label) => check(cycle, '标题', label));
    const headers = table.summaryHeaders?.length
      ? table.summaryHeaders
      : table.summary[0].story.map((_, index) => `Story ${['I', 'II', 'III', 'IV', 'V', 'VI'][index] || index + 1}`);
    headers.forEach((header) => check(cycle, '总表表头', header));
    check(cycle, '总表表头', 'Adventure Hub');
    check(cycle, '总表表头', 'Battle Terrain');
    table.summary.forEach((row) => {
      row.story.forEach((value) => check(cycle, '总表故事列', value || '-'));
      check(cycle, '总表分支名', row.hub);
      check(cycle, '战斗地形', row.terrain);
    });
    table.hubs.forEach((hub) => {
      check(cycle, '分支卡标题', hub.title);
      check(cycle, '分支卡标题', hub.passage ? `(${hub.passage})` : '');
      hub.boxes.forEach(([, roll, label, tag]) => {
        check(cycle, '箱号', String(roll));
        check(cycle, '冒险名', label);
        if (tag) check(cycle, '标签', tag);
      });
    });
    table.rr.forEach(([id, title]) => {
      check(cycle, 'R&R 标题', title);
      check(cycle, 'R&R 编号', String(id));
    });
  }
  assert.deepEqual(leftovers, [], '定数框里还有英文没换掉（总表表头除外）');
});

test('战斗地形用的是官方中文地形卡的卡面名', () => {
  // 逐个读自 official-assets/terrain-cards/<card> 的卡面标题；改名前请先看那张卡。
  const cards = {
    'Maze Outcrop': ['迷阵露头层', 'maze-outcrop.jpg'],
    'Giant Shell': ['巨型贝壳', 'giant-shell.jpg'],
    'Minos Manos Unit': ['米诺斯建筑单元', 'minos-manos-unit.jpg'],
    'Abandoned Temple': ['废弃神庙', 'abandoned-temple.jpg'],
    'Graveyard of the Frail': ['脆弱者坟场', 'graveyard-of-the-frail.jpg'],
    'Krypteia Outpost': ['克里普提前哨', 'krypteia-outpost.jpg'],
    'Cyclops Trap': ['独眼巨人陷阱', 'cyclops-trap.jpg'],
    'Ambrosia Elephant': ['神浆巨象', 'ambrosia-elephant.jpg'],
    'Black Lake': ['黑色湖泊', 'black-lake.jpg'],
    'Hyperborean Ruins': ['北方乐土遗迹', 'hyperborean-ruins.jpg'],
    'Spot of Nothingness': ['虚无场地', 'spot-of-nothingness.jpg'],
  };
  const wrong = [];
  const seen = new Set();
  for (const cycle of cycles) {
    survey[cycle].summary.forEach((row) => {
      const terrain = String(row.terrain);
      const name = terrain.replace(/\s*\(.*$/, '');
      const card = cards[name];
      if (!card) {
        wrong.push(`${cycle} 的地形 ${name} 没有卡面对照`);
        return;
      }
      seen.add(name);
      // 分区写法带上全角括号，并把数据里 "(Inner 3)" 前面的空格去掉。
      const zone = terrain.slice(name.length).trim().replace(/\(Inner (\d)\)/, '（内圈$1）').replace(/\(Outer (\d)\)/, '（外圈$1）');
      const actual = translate(terrain);
      if (actual !== `${card[0]}${zone}`) wrong.push(`${cycle} ${terrain} 应为 ${card[0]}${zone}，实际 ${actual}`);
      assert.ok(
        fs.existsSync(path.join(root, 'official-assets', 'terrain-cards', card[1])),
        `官方地形卡缺失：${card[1]}`,
      );
    });
  }
  assert.equal(wrong.length, 0, wrong.join('；'));
  assert.equal(seen.size, Object.keys(cards).length, 'C1-C3 用到的地形卡数量变了，卡面名清单要一起更新');
});

test('遭遇步骤的「下次战斗特殊板块」跟着一起换', () => {
  // 这条提示直接显示定数框里的地形与分支名，所以渲染时必须带上同一个作用域。
  const body = extractHtmlFunction('getNextBattleTerrainReminder');
  assert.match(body, /scope: "survey-record"/, '提示没有带走 survey-record 作用域');
  const render = extractHtmlFunction('renderStepTrackReminders');
  assert.match(render, /data-term-scope="\$\{reminder\.scope\}"/, '渲染函数没有把作用域写到 DOM 上');
  const terrain = { terrain: 'Cyclops Trap (Outer 3)', hub: 'Consider the Ant', source: '7-8 · Armorers' };
  const source = [terrain.hub, terrain.source].filter(Boolean).join(' · ');
  const desc = translate(`${terrain.terrain}${source ? `，来源：${source}` : ''}。`);
  assert.equal(desc, '独眼巨人陷阱（外圈3），来源：何为蝼蚁 · 7-8 · 兵械工厂。');
});

test('标签徽章用的是主控台自己的中文标签名', () => {
  for (const [tag, zh] of Object.entries(mnemosTagZh)) {
    assert.equal(translate(tag), zh, `标签 ${tag} 的中文名与 MNEMOS_TAG_ZH 不一致`);
  }
});

test('这些英文名只在定数框内替换，不影响页面其它位置', () => {
  // survey-record 条目全部带作用域：任何一条漏了 scope，记录表 / 故事模块里的同名英文
  // 也会被改掉（那些位置该保持英文原文）。钉住用的同名条目（from === to）不算泄漏。
  const unscoped = terms.filter((pair) => !pair.scope).map((pair) => pair.from);
  const leaked = terms
    .filter((pair) => pair.scope === scopeSelector && pair.from !== pair.to && unscoped.includes(pair.from))
    .map((pair) => pair.from);
  assert.equal(leaked.length, 0, `这些英文名也存在全局条目，会污染别处：${leaked.join('、')}`);
  assert.equal(survey.c1.hubs[0].title, 'Fated Conundrum', '定数框数据本身应保持英文原文');
});

test('官方名不会被别的条目二次改写（力量 => 狂怒 / 独眼巨人 => 无眼巨人）', () => {
  // 引擎只对原文套用一次术语（见 tests/term-engine.test.cjs），所以这里不再需要
  // 靠「同名条目」把全局条目顶掉，官方名拿来就是最终显示值。
  assert.equal(translate('Market Forces'), '市场力量');
  assert.equal(translate('Cyclops Trap'), '独眼巨人陷阱');
  assert.equal(translate('True to Weakness'), 'True to Weakness', '没收录的英文应当原样保留');
});
