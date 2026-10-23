/*
 * R&R 定数框的「第二个框」回归。
 *
 * 循环 I 的追踪标（Cycle_1_tracking_v1.3.pdf 第 2 页）里，1 / 2 / 9 号 R&R 除主框外还有一个
 * 带 * 的框，框里写着跳转段号（11 / 22 / 99），页脚注明「若已标记，标记第二个框，然后前往
 * 框内段号」；循环 IV 的 4 号 R&R 同理（44）。主控台把这一格补成第二个勾选框，它和第一格
 * 共用 surveyConstants.rr 表、以 `<编号>-goto` 作键，所以「已勾 R&R 数量」「当前 R&R 目标」
 * 这些按 id 统计的逻辑不受影响；取消第一格时第二格一并清掉。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
// 跨 vm 边界的对象原型不同，比较前先转成当前 realm 的普通值。
const plain = (value) => JSON.parse(JSON.stringify(value));

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

// 单行常量（如 SURVEY_STORY_ROMANS）按第一个分号截断即可。
function constantLine(name) {
  const start = source.indexOf(`    const ${name} = `);
  assert.ok(start >= 0, `index.html 缺少常量 ${name}`);
  return source.slice(start, source.indexOf(';', start) + 1);
}

const surveyConstantData = vm.runInNewContext(
  `(${declaration('surveyConstantData').replace(/^ {4}const surveyConstantData = /, '').replace(/;$/, '')})`,
);

test('追踪标上的第二个框只挂在循环 I 的 1/2/9 与循环 IV 的 4 号 R&R 上', () => {
  const expected = {
    c1: { 1: '11', 2: '22', 9: '99' },
    c2: {},
    c3: {},
    c4: { 4: '44' },
    c5: {},
  };
  for (const [cycle, want] of Object.entries(expected)) {
    const actual = {};
    for (const [id, , extra] of surveyConstantData[cycle].rr) {
      if (extra?.goTo) actual[id] = extra.goTo;
    }
    assert.deepEqual(actual, want, `${cycle} 的 R&R 第二框与追踪标不一致`);
  }
});

function element() {
  return {
    children: [], style: {}, textContent: '', className: '',
    set innerHTML(value) { this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); },
    setAttribute() {}, addEventListener() {},
  };
}

function harness(cycle) {
  const activity = { saves: 0 };
  const c = vm.createContext({
    state: { day: '1', surveyConstants: null, surveyConstantsDay: null, surveyConstantsTouchedDay: null },
    document: { createElement: element },
    escapeHtml: (value) => String(value ?? ''),
    isPlainObject: (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    currentCycleConfig: () => ({ id: cycle }),
    saveState: () => { activity.saves += 1; },
    renderFlow: () => {},
    normalizeCampaignDay: String,
    recordSyncChannel: { postMessage() {} },
  });
  const names = ['normalizeSurveyConstants', 'surveyConstantsDayKey', 'ensureTodaySurveyConstants',
    'getCurrentSurveyConstantData', 'firstCheckedSurveyHubTarget', 'firstCheckedSurveyRrTarget',
    'surveyRrBoxKey', 'surveyConstantChecked',
    'beginSurveyConstantInteraction', 'surveyConstantInteractionIsCurrent',
    'beginSurveyConstantMnemosSync', 'finishSurveyConstantMnemosSync',
    'restoreSurveyConstantHubSelection', 'setSurveyConstant', 'createSurveyConstantCard',
    'createSurveyConstantTools',
    // 分支卡标题后的点数（当前故事卡 + 分支总表）——这里没有故事卡追踪条，取不到就退回空括号。
    'surveyStoryColumnHeaders', 'currentStoryCardLabel', 'surveyStoryColumnIndex', 'surveyHubPointsText'];
  c.rememberConstantDetailsOpen = () => {};
  c.createSurveyHubSummary = () => null;
  vm.runInContext(declaration('surveyConstantData') + '\n' + constantLine('SURVEY_STORY_ROMANS') + '\n'
    + 'let surveyConstantInteractionVersions = new Map();'
    + '\nlet surveyConstantMnemosSyncPending = 0;'
    + '\nlet surveyConstantExternalSyncDeferred = false;\n'
    + names.map((name) => extract(source, name)).join('\n'), c);
  return { c, activity };
}

test('第二个框只在第一格已勾时可用，且取消第一格会一并清掉第二格', () => {
  const { c } = harness('c1');
  c.ensureTodaySurveyConstants();
  const rr = c.state.surveyConstants.rr;
  c.setSurveyConstant('rr', '1', '1', true);
  assert.equal(rr['1'], true, '第一格没记进 rr 表');
  assert.deepEqual(plain(c.state.surveyConstants.activeRr), { itemId: '1' });
  assert.equal(c.surveyConstantChecked('rr', '1', '1-goto'), false);
  c.setSurveyConstant('rr', '1', '1-goto', true);
  assert.equal(rr['1-goto'], true, '第二个框没记进 rr 表');
  assert.equal(rr['1'], true, '标第二格不该影响第一格');
  assert.equal(c.surveyConstantChecked('rr', '1', '1-goto'), true);
  assert.equal(c.surveyConstantChecked('rr', '1', '1'), true);
  c.setSurveyConstant('rr', '1', '1', false);
  assert.equal(rr['1'], undefined);
  assert.equal(rr['1-goto'], undefined, '取消第一格后第二个框应当清掉');
  assert.equal(c.state.surveyConstants.activeRr, null);
});

test('按 id 统计已勾 R&R 时，第二格的键不会被算成多勾了一条', () => {
  const { c } = harness('c1');
  c.setSurveyConstant('rr', '1', '1', true);
  c.setSurveyConstant('rr', '1', '1-goto', true);
  const data = c.getCurrentSurveyConstantData();
  const checked = data.rr.filter(([id]) => c.state.surveyConstants.rr?.[id]);
  assert.deepEqual(plain(checked.map(([id]) => id)), ['1']);
  assert.deepEqual(plain(c.firstCheckedSurveyRrTarget(data)), { itemId: '1' });
});

test('渲染：第一格没勾时第二格整行不出现（段号不提前剧透）', () => {
  const { c } = harness('c1');
  c.ensureTodaySurveyConstants();
  const card = (rrState) => {
    c.state.surveyConstants.rr = rrState;
    c.state.surveyConstants.hubs = {};
    return c.createSurveyConstantCard({
      id: '1',
      title: 'Catch of the Day',
      boxes: [['1', '1', 'Catch of the Day'], ['1-goto', '*', '前往 11', null, { requiresFirst: true }]],
    }, 'rr');
  };
  const rows = (node) => node.children[1].children;
  assert.equal(rows(card({})).length, 1, '未勾第一格时第二格不该渲染');
  const revealed = rows(card({ 1: true }));
  assert.equal(revealed.length, 2, '勾上第一格后第二格才出现');
  assert.equal(revealed[1].children[1].textContent, '*');
  assert.equal(revealed[1].children[2].textContent, '前往 11');
  assert.equal(revealed[1].children[0].disabled, undefined, '出现后应当可以点');
  const both = rows(card({ 1: true, '1-goto': true }));
  assert.equal(both[1].children[0].checked, true);
  // 存档里只剩第二格勾着（旧数据/手改）时仍要显示，否则没法取消。
  assert.equal(rows(card({ '1-goto': true })).length, 2);
});

test('没有第二框的 R&R 与其它循环照旧只有一格', () => {
  const { c } = harness('c2');
  const data = c.getCurrentSurveyConstantData();
  assert.equal(data.rr.length, 10);
  assert.deepEqual(plain(data.rr.map(([, , extra]) => extra ?? null)), Array(10).fill(null));
});

test('定数框面板：默认一个「前往 xx」都不渲染，勾上循环 I 的 1/2/9 后才各多一格', () => {
  const { c } = harness('c1');
  const rrCards = () => {
    const wrapper = c.createSurveyConstantTools();
    const body = wrapper.children[1];
    const rrGroup = body.children.at(-1);
    return rrGroup.children[0].children;
  };
  const textOf = (node) => [node.textContent, ...(node.children || []).map(textOf)].join('\n');
  const collect = (nodes) => nodes.map((card) => card.children[1].children).flat();

  const cards = rrCards();
  assert.equal(cards.length, 10);
  assert.deepEqual(plain(cards.map((card) => card.children[1].children.length)), Array(10).fill(1),
    '没勾任何 R&R 时不该出现第二个框');
  assert.ok(!collect(cards).some((row) => textOf(row).includes('前往')), '第二格的段号不该提前出现在面板里');

  for (const id of ['1', '2', '9']) {
    c.setSurveyConstant('rr', id, id, true);
  }
  const checkedCards = rrCards();
  assert.deepEqual(plain(checkedCards.map((card) => card.children[1].children.length)), [2, 2, 1, 1, 1, 1, 1, 1, 2, 1]);
  const labels = checkedCards.map((card) => card.children[1].children.map((row) => row.children[2]?.textContent));
  assert.equal(labels[0][1], '前往 11');
  assert.equal(labels[1][1], '前往 22');
  assert.equal(labels[8][1], '前往 99');
});
