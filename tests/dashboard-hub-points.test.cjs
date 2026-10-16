/*
 * 主控台定数框：分支卡标题后的括号从「故事书页码」改成「点数」回归。
 *
 * 规则来源：分支总表（冒险中枢总表）的每一列都是一张故事卡——循环 I–III 一张卡一列
 * （Story I–IV），循环 IV/V 拆到 A/B 面（IA / IB / IIA/IIB / IIIA / IIIB / IVA/IVB）；
 * 每列里各中枢的数字区间合起来正好是 1-10。所以卡片后面的括号该显示
 * 「当前故事卡所在列里这一格的点数」，而不是 hub.passage（那本是故事书页码）。
 * 故事卡追踪条还没开始时没有当前卡，括号留空。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function extract(sourceText, name) {
  const match = sourceText.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `index.html 缺少函数 ${name}`);
  return match[0];
}

function declaration(name) {
  const start = source.indexOf(`    const ${name} = `);
  assert.ok(start >= 0, `index.html 缺少常量 ${name}`);
  const end = source.indexOf('\n    };', start) + 7;
  assert.ok(end > start, `index.html 的常量 ${name} 没有闭合`);
  return source.slice(start, end);
}

function constantLine(name) {
  const start = source.indexOf(`    const ${name} = `);
  assert.ok(start >= 0, `index.html 缺少常量 ${name}`);
  return source.slice(start, source.indexOf(';', start) + 1);
}

const surveyConstantData = vm.runInNewContext(
  `(${declaration('surveyConstantData').replace(/^ {4}const surveyConstantData = /, '').replace(/;$/, '')})`,
);

function element() {
  return {
    children: [], style: {}, textContent: '', className: '', innerHTML: '',
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    setAttribute() {}, addEventListener() {},
  };
}

// label 是故事卡追踪条的当前卡（1A…4B）；空串表示还没推进（未开始）。
function harness(cycle, label) {
  const card = label ? { label } : null;
  const c = vm.createContext({
    state: { surveyConstants: null, surveyConstantsDay: null, surveyConstantsTouchedDay: null },
    document: { createElement: element },
    escapeHtml: (value) => String(value ?? ''),
    currentCycleConfig: () => ({ id: cycle }),
    cardTrackGroups: { story: { tracks: [{ key: 'story', label: '故事卡', source: 'storySteps', fixed: false }] } },
    ensureCardTracks: () => ({ story: { position: card ? 1 : 0, progress: 0, doom: 0 } }),
    cardTrackCard: (def, track) => (track.position > 0 ? card : null),
    activeStoryDoomData: () => ({}),
    getCurrentSurveyConstantData: () => surveyConstantData[cycle],
    saveState() {},
    renderFlow() {},
  });
  vm.runInContext(constantLine('SURVEY_STORY_ROMANS') + '\n'
    + ['surveyStoryColumnHeaders', 'currentStoryCardLabel', 'surveyStoryColumnIndex', 'surveyHubPointsText',
      'createSurveyConstantCard'].map((name) => extract(source, name)).join('\n'), c);
  return c;
}

// 分支卡标题里括号的内容；没有括号时返回空串。
function badgeOf(cycle, label, hubIndex) {
  const c = harness(cycle, label);
  const hub = surveyConstantData[cycle].hubs[hubIndex];
  const card = c.createSurveyConstantCard({ id: hub.id, title: hub.title, passage: hub.passage, boxes: [] }, 'hubs');
  return (card.children[0].innerHTML.match(/<span>\(([^)]*)\)<\/span>/) || [])[1] || '';
}

function rangeValues(cell) {
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(String(cell).trim());
  assert.ok(match, `总表里的点数写法无法解析：${cell}`);
  const from = Number(match[1]);
  const to = Number(match[2] || match[1]);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

test('循环 I–III：按当前故事卡的序号取对应列的点数', () => {
  // C1 宿命的谜题：Story I = 1-3，Story II = 1-2，Story III/IV 走不到这个中枢。
  assert.equal(badgeOf('c1', '1A', 0), '1-3');
  assert.equal(badgeOf('c1', '1B', 0), '1-3', '循环 I–III 的 A/B 面共用一张卡一列');
  assert.equal(badgeOf('c1', '2B', 0), '1-2');
  assert.equal(badgeOf('c1', '3A', 0), '', '这一格在这张故事卡上是空的');
  // C3 鲜为人知的路同理，换列后跟着变。
  assert.equal(badgeOf('c3', '1A', 0), '1-3');
  assert.equal(badgeOf('c3', '4A', 3), '1-2');
});

test('循环 IV/V：A/B 面各占一列时按面取点数', () => {
  // C4 盐路：IA = 1-4，IB = 1-3，IIA/IIB = 1-2。
  assert.equal(badgeOf('c4', '1A', 0), '1-4');
  assert.equal(badgeOf('c4', '1B', 0), '1-3');
  assert.equal(badgeOf('c4', '2B', 0), '1-2');
  // IIIA 与 IIIB 是两列：公正惠众 3-4 / 1-2。
  assert.equal(badgeOf('c5', '3A', 3), '3-4');
  assert.equal(badgeOf('c5', '3B', 3), '1-2');
});

test('故事卡未开始、或这一格在总表里是空的，就不写括号', () => {
  assert.equal(badgeOf('c1', '', 0), '', '故事卡追踪条还没推进时没有点数可算');
  assert.equal(badgeOf('c4', '1A', 6), '', '新月与满月不在 IA 列上');
});

test('R&R 卡不套总表点数，也不因为取不到故事卡而报错', () => {
  const c = harness('c1', '1A');
  const card = c.createSurveyConstantCard({ id: '1', title: 'Catch of the Day', boxes: [] }, 'rr');
  assert.equal(card.children[0].innerHTML, 'Catch of the Day');
});

test('总表每一列都是完整的 1-10 点数表', () => {
  for (const [cycle, data] of Object.entries(surveyConstantData)) {
    const width = data.summary[0].story.length;
    for (let column = 0; column < width; column += 1) {
      const values = data.summary.flatMap((row) => (row.story[column] ? rangeValues(row.story[column]) : []));
      assert.deepEqual([...values].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        `${cycle} 第 ${column + 1} 列（${data.summaryHeaders?.[column]}）不是完整的 1-10`);
    }
  }
});

test('分支卡标题后面写的是点数，故事书页码不再出现在标题里', () => {
  const c = harness('c1', '1A');
  const hub = surveyConstantData.c1.hubs[0];
  const card = c.createSurveyConstantCard({ id: hub.id, title: hub.title, passage: hub.passage, boxes: [] }, 'hubs');
  assert.match(card.children[0].innerHTML, /<span>\(1-3\)<\/span>/);
  assert.ok(!card.children[0].innerHTML.includes(`(${hub.passage})`),
    `括号里不该还是故事书页码 ${hub.passage}`);
});
