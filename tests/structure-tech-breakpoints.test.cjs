const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dashboardCss = fs.readFileSync(path.join(root, 'api/dashboard.css'), 'utf8');
const tradeCss = fs.readFileSync(path.join(root, 'technology/trade-planner.css'), 'utf8');

// 「科技航行能力 · 使用与时间线」的两条换栏规则都挂在 tech-abilities 容器上：
// min-width 控制分组列表排两栏，max-width 控制展开后的“使用／时间线”卡片堆叠。
function techAbilityQueries(css) {
  const queries = [];
  const header = /@container tech-abilities \((min|max)-width: ([\d.]+)px\) \{/g;
  let match;
  while ((match = header.exec(css))) {
    let depth = 1, index = header.lastIndex;
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1;
      else if (css[index] === '}') depth -= 1;
      index += 1;
    }
    queries.push({ kind: match[1], width: Number(match[2]), body: css.slice(header.lastIndex, index - 1) });
    header.lastIndex = index;
  }
  return queries;
}

test('发展步骤的能力列表在 1280px 主控台仍排两栏，只有真的排不下才改单栏', () => {
  const queries = techAbilityQueries(dashboardCss);
  const twoColumn = queries.find(query => query.kind === 'min' && /\.structure-tech-category \{[^}]*grid-template-columns: repeat\(2,/.test(query.body));
  assert.ok(twoColumn, '缺少把分组能力排成两栏的容器查询');
  // 主控台带侧栏时这块可用宽度：1440px 屏约 906px，1280px 屏约 746px，1152px 屏约 618px。
  // 原来的 760px 让 1280px 屏永远进不了两栏，而 1280 是常见窗口。
  assert.ok(twoColumn.width <= 600, `两栏阈值 ${twoColumn.width}px 太高，1152–1280px 的主控台会一直是单栏`);
  assert.ok(twoColumn.width >= 520, `两栏阈值 ${twoColumn.width}px 太低，每列不足 250px 时能力标题会被挤没`);

  const collapse = queries.find(query => query.kind === 'max' && /\.structure-tech-action-preview \{ grid-column: 1 \/ -1;/.test(query.body));
  assert.ok(collapse, '缺少“使用／时间线”卡片改单栏的容器查询');
  assert.ok(collapse.width < twoColumn.width,
    `卡片单栏阈值 ${collapse.width}px 必须低于列表两栏阈值 ${twoColumn.width}px，否则会出现列表两栏、展开卡片单栏的半换栏状态`);
  // 展开卡片左右两栏至少需要 230px 的预览列加上能放两列控件的操作列。
  assert.ok(collapse.width >= 480, `卡片单栏阈值 ${collapse.width}px 太低，操作列会窄到放不下两列控件`);
});

test('交易规划的相关宽度规则跟随同一换栏阈值', () => {
  const queries = techAbilityQueries(tradeCss).filter(query => /trade|visual-choice|breeding/.test(query.body));
  const threshold = techAbilityQueries(dashboardCss)
    .find(query => query.kind === 'min' && /\.structure-tech-category \{[^}]*grid-template-columns: repeat\(2,/.test(query.body)).width;
  assert.ok(queries.length, '缺少交易规划在 tech-abilities 容器上的宽度规则');
  for (const query of queries) {
    if (query.kind === 'min') assert.equal(query.width, threshold, '交易规划的两栏阈值要与能力列表一致');
    else assert.ok(query.width < threshold, '交易规划的单栏阈值要低于能力列表的两栏阈值');
  }
});

test('谈判列表沿用时间线科技的两栏阈值，展开行横跨两栏且资源支付占满整行', () => {
  const queries = techAbilityQueries(dashboardCss);
  const threshold = queries.find(query => query.kind === 'min'
    && /\.structure-tech-category \{[^}]*grid-template-columns: repeat\(2,/.test(query.body)).width;
  const negotiation = queries.find(query => query.kind === 'min'
    && /negotiation[^}]*grid-template-columns: repeat\(2,/.test(query.body));
  assert.ok(negotiation, '缺少谈判列表的两栏规则');
  assert.equal(negotiation.width, threshold, '谈判列表要与时间线科技在同一宽度换栏');
  assert.match(negotiation.body, /negotiation[\s\S]*structure-tech-entry\[open\][\s\S]*grid-column: 1 \/ -1/,
    '展开的谈判行必须横跨两栏');
  assert.match(tradeCss, /\.structure-tech-resource-payment \{[^}]*grid-column: 1 \/ -1/,
    '资源支付瓦片必须占满展开卡的操作列，避免挤在左栏');
});
