/**
 * 战役简报科技树回放的回归测试。
 *
 * 这里针对的是一个真实踩过的坑：节点存的是「首次点亮的日期名」（"T0"、"5"…），
 * 早期版本按日期字符串是否相等来判断点亮，结果每个节点只在它自己那天亮一次，
 * 其余日子整棵树都是灰的——回放看起来「科技树根本没在长」。
 * 正确的判定是比日期轴上的先后：首次点亮的日期不晚于当前这天，就应当亮着。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

/** 跑 briefing-tech.js 所需的最小 DOM。 */
class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.attributes = new Map();
    this.children = [];
    this._text = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  appendChild(child) { this.children.push(child); return child; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text || this.children.map((child) => child.textContent).join(''); }
  querySelector(selector) {
    if (selector === 'text' || selector === 'title') {
      return this.children.find((child) => child.tagName === selector) || null;
    }
    return null;
  }
  get classes() { return String(this.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
}

function loadBriefing() {
  const sandbox = { console, document: { createElementNS: (ns, tag) => new FakeElement(tag) }, window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // briefing-core.js 是 UMD：同时挂 window 和 module.exports，这里按页面里的顺序先注入它。
  for (const relative of ['technology/tech-page-layout.js', 'technology/tech-tree.js', 'briefing/briefing-core.js', 'briefing/briefing-tech.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), sandbox, { filename: relative });
  }
  assert.ok(sandbox.window.ATO_BRIEFING_CORE, 'briefing-core.js 应当挂到 window 上');
  return sandbox;
}

const sandbox = loadBriefing();
const tech = sandbox.ATO_BRIEFING_TECH;
// 纯逻辑（点亮判定、页面挑选）住在 briefing-core.js，测试直接 require 更直接。
const core = require('../briefing/briefing-core.js');

/** 三个节点的迷你科技页：T0 点亮甲，T2 点亮乙，丙始终没点亮。 */
function miniPage() {
  return {
    page: 'cycle1',
    cycleId: 'c1',
    nodes: [
      { id: 'n1', key: 'alpha', rawKey: 'alpha', name: '甲', nameEn: 'Alpha', box: [10, 10, 100, 40], requires: [], requiresAnyGroups: [], xlsmLeadsTo: [], unlocked: true, firstDay: 'T0' },
      { id: 'n2', key: 'beta', rawKey: 'beta', name: '乙', nameEn: 'Beta', box: [10, 60, 100, 40], requires: [], requiresAnyGroups: [], xlsmLeadsTo: [], unlocked: true, firstDay: 'T2' },
      { id: 'n3', key: 'gamma', rawKey: 'gamma', name: '丙', nameEn: 'Gamma', box: [10, 110, 100, 40], requires: [], requiresAnyGroups: [], xlsmLeadsTo: [], unlocked: false, firstDay: '' },
    ],
    edges: [],
  };
}

function timelineFor(days) {
  return days.map((spec, index) => ({
    index,
    day: spec.day,
    present: true,
    tech: { unlocked: spec.unlocked, new: spec.newKeys },
  }));
}

function render(svg, renderer, day) {
  const result = renderer.render(day);
  const nodes = svg.children.flatMap((group) => group.children).filter((child) => child.tagName === 'g');
  return {
    result,
    nodes,
    unlocked: nodes.filter((node) => node.classes.includes('unlocked')),
    litToday: nodes.filter((node) => node.classes.includes('today')),
  };
}

function newRenderer(pages, timeline) {
  const svg = new FakeElement('svg');
  const canvas = { clientWidth: 800, clientHeight: 500 };
  const renderer = tech.create({ svg, canvas, pages, timeline });
  return { svg, renderer, canvas };
}

test('科技节点从首次点亮那天起一直亮着（跨日期累积，而不是只在当天亮）', () => {
  const days = [
    { day: 'T0', unlocked: ['alpha'], newKeys: ['alpha'] },
    { day: 'T1', unlocked: ['alpha'], newKeys: [] },
    { day: 'T2', unlocked: ['alpha', 'beta'], newKeys: ['beta'] },
    { day: 'T3', unlocked: ['alpha', 'beta'], newKeys: [] },
  ];
  const { svg, renderer } = newRenderer([miniPage()], timelineFor(days));

  const d0 = render(svg, renderer, timelineFor(days)[0]);
  assert.equal(d0.result.unlocked, 1, 'T0 只有 1 项点亮');
  assert.equal(d0.unlocked.length, 1);
  assert.equal(d0.litToday.length, 0, '基线那天不标「本次点亮」');

  const d1 = render(svg, renderer, timelineFor(days)[1]);
  assert.equal(d1.result.unlocked, 1, 'T1 没有新科技，仍是 1 项亮着');
  assert.equal(d1.litToday.length, 0);

  const d2 = render(svg, renderer, timelineFor(days)[2]);
  assert.equal(d2.result.unlocked, 2, 'T2 累计 2 项亮着');
  assert.equal(d2.unlocked.length, 2, 'DOM 里也要有 2 个点亮的节点');
  assert.equal(d2.litToday.length, 1, '只有当天点亮的那一项带「本次点亮」');

  const d3 = render(svg, renderer, timelineFor(days)[3]);
  assert.equal(d3.result.unlocked, 2, 'T3 保持 2 项，不会掉回去');
  assert.equal(d3.litToday.length, 0);

  const summary = render(svg, renderer, timelineFor(days)[3]).result;
  assert.equal(summary.total, 2, '只显示最后一份备份已点亮的两项科技');
  assert.equal(d0.nodes.length, 2, '后续会点亮的科技在早期回放中仍保留');
  assert.ok(d0.nodes.some((node) => node.classes.includes('locked')), '早期尚未点亮的乙保持灰底');
});

test('直到最后一天仍未点亮和日期轴之外的节点全部隐藏', () => {
  const days = [
    { day: 'T0', unlocked: [], newKeys: [] },
    { day: 'T1', unlocked: [], newKeys: [] },
  ];
  const page = miniPage();
  // 两个节点的首次点亮日期都晚于这条日期轴 → 回放到哪天都不该亮。
  page.nodes[0].firstDay = 'T9';
  page.nodes[1].firstDay = 'T8';
  const { svg, renderer } = newRenderer([page], timelineFor(days));
  const rendered = render(svg, renderer, timelineFor(days)[1]);
  assert.equal(rendered.result.unlocked, 0);
  assert.equal(rendered.nodes.length, 0);
  assert.equal(rendered.unlocked.length, 0);
  const titles = rendered.nodes.map((node) => {
    const title = node.querySelector('title');
    return title ? title.textContent : '';
  });
  assert.ok(titles.every((text) => text.includes('这一轮尚未点亮')), titles.join(' | '));
});

test('同一日期轴里找不到的首次点亮日期按未点亮处理', () => {
  const days = [{ day: 'T0', unlocked: [], newKeys: [] }];
  const page = miniPage();
  page.nodes[0].firstDay = '99'; // 日期轴里没有这一天
  const { svg, renderer } = newRenderer([page], timelineFor(days));
  const rendered = render(svg, renderer, timelineFor(days)[0]);
  assert.equal(rendered.result.unlocked, 0, '日期轴上不存在的一天不应被当成「已经点亮」');
});

test('nodeState 的判定规则：不晚于当前这天就算点亮', () => {
  const today = new Set(['beta']);
  const check = (label, actual, unlocked, isToday) => {
    assert.equal(actual.unlocked, unlocked, `${label} unlocked`);
    assert.equal(actual.today, isToday, `${label} today`);
  };
  // 已点亮：首次点亮早于当前这天
  check('早于当天', core.nodeState('T0', 3, 0, today, 'alpha', false), true, false);
  // 当天点亮
  check('当天点亮', core.nodeState('T2', 2, 2, today, 'beta', false), true, true);
  // 未来才点亮
  check('未来点亮', core.nodeState('T3', 2, 3, today, 'gamma', false), false, false);
  // 从未点亮
  check('从未点亮', core.nodeState(null, 5, null, today, 'gamma', false), false, false);
  // 基线那天不标「本次点亮」
  check('基线当天', core.nodeState('T0', 0, 0, new Set(['alpha']), 'alpha', true), true, false);
  // 日期轴里找不到的日期（索引为 Infinity）不点亮
  check('轴外日期', core.nodeState('99', 3, Number.POSITIVE_INFINITY, today, 'gamma', false), false, false);
});

test('只画当前循环那一页科技树，不会把两个循环的图纸叠在一起', () => {
  const pages = [
    { page: 'cycle1', cycleId: 'c1', nodes: [{ id: 'a' }] },
    { page: 'cycle2', cycleId: 'c2', nodes: [{ id: 'b' }, { id: 'c' }] },
  ];
  assert.deepEqual(
    core.selectTechPages(pages, 'c1').map((page) => page.page),
    ['cycle1'],
    '当前循环是 c1 时只画 cycle1'
  );
  assert.deepEqual(
    core.selectTechPages(pages, 'c2').map((page) => page.page),
    ['cycle2'],
    '切到 c2 时只画 cycle2'
  );
  // 当前循环的页面没有节点时退回有节点的页面，而不是整片空白
  const sparse = [
    { page: 'cycle1', cycleId: 'c1', nodes: [] },
    { page: 'cycle2', cycleId: 'c2', nodes: [{ id: 'b' }] },
  ];
  assert.deepEqual(core.selectTechPages(sparse, 'c1').map((page) => page.page), ['cycle2']);
  // 一个节点都没有时原样返回，交给渲染器画空树
  assert.deepEqual(core.selectTechPages([{ page: 'cycle1', cycleId: 'c1', nodes: [] }], 'c1').length, 1);
  assert.deepEqual(core.selectTechPages(undefined, 'c1'), []);
});

test('渲染器只画传进来的页面（页面挑选由调用方负责）', () => {
  const pages = [
    miniPage(),
    { page: 'cycle2', cycleId: 'c2', nodes: [{ id: 'x', key: 'x', rawKey: 'x', name: '别的循环', nameEn: 'Other', box: [10, 10, 100, 40], requires: [], requiresAnyGroups: [], xlsmLeadsTo: [], unlocked: false, firstDay: '' }], edges: [] },
  ];
  const days = [{ day: 'T0', unlocked: ['alpha'], newKeys: ['alpha'] }];
  const timeline = timelineFor(days);

  const both = newRenderer(pages, timeline);
  assert.equal(render(both.svg, both.renderer, timeline[0]).result.pages, 2, '整份传进去就画两页');

  const filtered = newRenderer(core.selectTechPages(pages, 'c1'), timeline);
  assert.equal(render(filtered.svg, filtered.renderer, timeline[0]).result.pages, 1, '过滤后只画一页');
  assert.equal(render(filtered.svg, filtered.renderer, timeline[0]).result.total, 1, '只统计当前循环最终点亮的节点');
});

test('简报渲染器保留带轮回限定名的真实前置连线', () => {
  const page = miniPage();
  page.nodes = page.nodes.slice(0, 2);
  Object.assign(page.nodes[0], { key: 'intelligence gathering@@cycle1', rawKey: 'intelligence gathering@@cycle1', nameEn: 'Intelligence Gathering' });
  Object.assign(page.nodes[1], { requires: ['intelligence gathering@@cycle1'], firstDay: 'T0' });
  const timeline = timelineFor([{ day: 'T0', unlocked: page.nodes.map(node => node.key), newKeys: [] }]);
  const { svg, renderer } = newRenderer([page], timeline);
  renderer.render(timeline[0]);
  const paths = svg.children.flatMap(group => group.children).filter(node => node.tagName === 'path');
  assert.ok(paths.length > 0, '带 @@cycle1 的字典key应解析为连线');
  assert.ok(paths.every(node => node.classes.includes('live')));
});

test('科技树切换日期、缩放和调整窗口后保持最新点亮节点居中', () => {
  const days = timelineFor([{ day: 'T0', unlocked: ['alpha'], newKeys: ['alpha'] }, { day: 'T2', unlocked: ['alpha', 'beta'], newKeys: ['beta'] }]);
  const { svg, renderer, canvas } = newRenderer([miniPage()], days);
  canvas.clientWidth = 120;
  canvas.clientHeight = 80;
  const today = render(svg, renderer, days[1]).litToday[0];
  const [, x, y] = today.getAttribute('transform').match(/translate\(([^,]+),([^\)]+)\)/);
  const rect = today.children.find((child) => child.tagName === 'rect');
  const center = { x: Number(x) + Number(rect.getAttribute('width')) / 2, y: Number(y) + Number(rect.getAttribute('height')) / 2 };
  const check = (scale) => {
    assert.equal(canvas.scrollLeft, center.x * scale);
    assert.equal(canvas.scrollTop, center.y * scale);
  };
  check(1.6);
  renderer.setZoom(2);
  check(2);
  canvas.clientWidth = 240;
  renderer.resize();
  check(2);
  const previousTop = canvas.scrollTop;
  render(svg, renderer, days[0]);
  assert.notEqual(canvas.scrollTop, previousTop, '退回早期日期应聚焦到甲');
});

test('GIF 离屏科技树应用隐藏规则，但不加入屏幕聚焦留白', () => {
  const timeline = timelineFor([{ day: 'T0', unlocked: ['alpha'], newKeys: ['alpha'] }]);
  const svg = new FakeElement('svg');
  const canvas = { clientWidth: 100000, clientHeight: 100000 };
  const renderer = tech.create({ svg, canvas, pages: [miniPage()], timeline, autoFocus: false });
  assert.equal(render(svg, renderer, timeline[0]).nodes.length, 1);
  assert.ok(Number(svg.getAttribute('width')) < 10000, '离屏图不能加入巨大的虚拟视口留白');
  assert.match(svg.getAttribute('viewBox'), /^0 0 /);
  assert.equal(canvas.scrollLeft, undefined, '导出只生成整幅图，不执行屏幕滚动');
});
