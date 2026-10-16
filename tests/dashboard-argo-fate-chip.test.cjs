/*
 * 主控台两个标题行最右侧的「当前阿尔戈号命运」（图标 + 数字）回归：
 *   - 发展步骤的「科技航行能力 · 使用与时间线」折叠标题（<summary>）；
 *   - 探索步骤的「当前地点可谈判」提醒标题行。
 *
 * 数字口径与结构科技规则的 readStat() 一致：cycleStats[当前循环].fate 优先，顶层 fate
 * 只在记录表停在当前循环时兜底；没填或不是整数时显示「—」，不猜数值（和
 * addMapProgressTechFate() 的校验口径相同）。图标固定取 assets/icons/argo-fate.svg。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function dashboardFunction(name) {
  const match = html.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `index.html 缺少函数 ${name}`);
  return match[0];
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function element(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(), className: '', textContent: '', innerHTML: '', title: '',
    dataset: {}, style: {}, children: [], listeners: {},
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    setAttribute() {}, addEventListener(type, callback) { this.listeners[type] = callback; },
    replaceChildren(...nodes) { this.children = nodes; },
  };
}

function harness({ cycle = 'c1', record = {} } = {}) {
  const sandbox = {
    window: {}, document: { createElement: element },
    escapeHtml, currentCycleConfig: () => ({ id: cycle }),
    state: { day: 4 }, archive: { activeProfileId: 'p1' }, sessionUser: { id: 'u1' },
    campaignSessionEpoch: 1, campaignSectionBaseline: null,
    structureTechContext: null, structureTechContextError: '',
    structureTechActionPanel: null, negotiationTechActionPanel: null, explorationTechActionPanel: null,
    getStructureTechContext: () => null,
    structureTechTarget: () => ({ profileId: 'p1', cycleId: cycle, day: 4, sessionEpoch: 1, accountId: 'u1' }),
  };
  sandbox.cachedArgoRecord = record;
  const context = vm.createContext(sandbox);
  for (const name of ['currentArgoFateValue', 'argoFateChipHtml', 'renderStepTrackReminders',
    'createStructureTechActionTools']) {
    vm.runInContext(dashboardFunction(name), context);
  }
  return context;
}

const negotiationReminder = {
  title: '当前地点可谈判',
  tag: { label: '谈判', className: 'structure-tech negotiation' },
  desc: '测试板块 可谈判。',
  className: 'negotiation',
  collapsible: true,
  argoFate: true,
};

test('命运数字取当前循环的记录值，缺省或坏值显示「—」', () => {
  assert.equal(harness({ cycle: 'c2', record: { cycle: 'c2', fate: '7' } }).currentArgoFateValue(), '7');
  assert.equal(harness({ cycle: 'c1', record: { cycle: 'c1', fate: 0 } }).currentArgoFateValue(), '0',
    '命运 0 是合法数值，不能当成没填');
  assert.equal(harness({ cycle: 'c2', record: { cycle: 'c2', cycleStats: { c2: { fate: '5' }, c1: { fate: '9' } }, fate: '7' } })
    .currentArgoFateValue(), '5', 'cycleStats 里的当前循环值优先于顶层 fate');
  assert.equal(harness({ cycle: 'c2', record: { cycle: 'c1', fate: '7' } }).currentArgoFateValue(), '—',
    '记录表停在别的循环时，顶层 fate 不算当前循环的');
  assert.equal(harness({ cycle: 'c1', record: {} }).currentArgoFateValue(), '—');
  assert.equal(harness({ cycle: 'c1', record: { cycle: 'c1', fate: '' } }).currentArgoFateValue(), '—');
  assert.equal(harness({ cycle: 'c1', record: { cycle: 'c1', fate: 'T0' } }).currentArgoFateValue(), '—');
});

test('徽章是「图标 + 数字」，图标用 assets/icons/argo-fate.svg', () => {
  const chip = harness({ cycle: 'c1', record: { cycle: 'c1', fate: '3' } }).argoFateChipHtml();
  assert.match(chip, /<span class="argo-fate-chip" title="当前阿尔戈号命运：3">/);
  assert.match(chip, /class="argo-fate-chip-icon" aria-hidden="true" style="--icon-src:url\(\.\/assets\/icons\/argo-fate\.svg\)"/);
  assert.match(chip, /<span>3<\/span>/);
  assert.ok(!chip.includes('\n'), '徽章是单行标记，拼进标题行时不引入换行');
});

test('「当前地点可谈判」标题行最右侧带命运徽章，其他提醒行不带', () => {
  const c = harness({ cycle: 'c1', record: { cycle: 'c1', fate: '4' } });
  const markup = c.renderStepTrackReminders([negotiationReminder]);
  assert.match(markup, /当前地点可谈判<\/span>[\s\S]{0,60}<span class="argo-fate-chip" title="当前阿尔戈号命运：4">/,
    '徽章要排在标题文字之后（标题行靠 auto 外边距把它顶到最右）');
  const plain = c.renderStepTrackReminders([{
    title: '当前板块有泰坦标记', tag: { label: '泰坦', className: 'structure-tech' }, desc: '请处理。',
  }]);
  assert.doesNotMatch(plain, /argo-fate-chip/);
});

test('「科技航行能力 · 使用与时间线」折叠标题也带徽章，探索科技能力不带', () => {
  const voyage = harness({ cycle: 'c1', record: { cycle: 'c1', fate: '6' } });
  const tools = voyage.createStructureTechActionTools('voyage');
  const summary = tools.children[0];
  assert.equal(summary.tagName, 'SUMMARY');
  assert.match(summary.innerHTML, /科技航行能力 · 使用与时间线/);
  assert.match(summary.innerHTML, /<span class="argo-fate-chip" title="当前阿尔戈号命运：6">/);

  const exploration = harness({ cycle: 'c1', record: { cycle: 'c1', fate: '6' } });
  exploration.getStructureTechContext = () => ({ profileId: 'p1', cycleId: 'c1', day: 4,
    state: { mapSnapshot: {}, exploration: null } });
  exploration.window.ATO_STRUCTURE_TECH_RULES = { listActions: () => [{ id: 'tech-explore-salvage' }] };
  exploration.structureTechClient = () => ({ createActionPanel: () => element() });
  const explorationSummary = exploration.createStructureTechActionTools('exploration').children[0];
  assert.equal(explorationSummary.tagName, 'SUMMARY');
  assert.match(explorationSummary.innerHTML, /探索科技能力/);
  assert.doesNotMatch(explorationSummary.innerHTML, /argo-fate-chip/);
});

test('科技面板的展开三角与标题同一行：summary 自己是 flex 行 + 自绘三角', () => {
  // 标题行里的 head 是块级 flex，如果 summary 保持 list-item，Chrome 会把原生三角丢到单独
  // 一行（标题落到第二行）。所以 summary 必须自己成为 flex 行，并自绘那枚三角。
  const css = fs.readFileSync(path.join(root, 'api/dashboard.css'), 'utf8');
  // 这个选择器有两条规则（底色内边距一条、flex 行一条），两条都要看。
  const summaryBlocks = [...css.matchAll(/\.app \.structure-tech-tools > summary \{([^}]*)\}/g)].map(match => match[1]);
  assert.ok(summaryBlocks.length, '缺少 .app .structure-tech-tools > summary 规则');
  const flexBlock = summaryBlocks.find(block => /display:\s*flex/.test(block));
  assert.ok(flexBlock, 'summary 不是 flex 行时原生三角会被块级 head 挤到上一行');
  assert.match(flexBlock, /align-items:\s*center/);
  assert.match(flexBlock, /list-style:\s*none/);
  assert.match(css, /\.app \.structure-tech-tools > summary::-webkit-details-marker \{ display: none; \}/);
  assert.match(css, /\.app \.structure-tech-tools > summary::before \{[^}]*border-left: 5px solid currentColor/);
  assert.match(css, /\.app \.structure-tech-tools\[open\] > summary::before \{ transform: rotate\(90deg\); \}/);

  const head = html.match(/\.structure-tech-tools-head \{([^}]*)\}/)?.[1] || '';
  assert.match(head, /display:\s*flex/);
  assert.match(head, /flex:\s*1/, '标题行要占满剩余宽度，命运徽章才贴得住右端');
  assert.match(head, /min-width:\s*0/);
});
