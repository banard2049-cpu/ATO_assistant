const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const structureRules = require('../technology/structure-tech-rules.js');
const rules = require('../technology/investigation-rules.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const clone = value => JSON.parse(JSON.stringify(value));
const keys = ['minoan investigations', 'spartan investigations', 'delphian investigations', 'persian investigations', 'atlantean investigations'];

function context(cycle = 'c1', extra = {}) {
  return { dictionary, cycle, technology: { unlocked: keys, unimportant: [] }, record: {}, ...extra };
}
function reminders(ctx) {
  return rules.reminders(ctx, { eligibility: structureRules.eligibility });
}

test('all five real investigation cards appear only when unlocked and in their current cycle', () => {
  assert.equal(typeof structureRules.eligibility, 'function', 'the shared read-only ownership check must be exposed');
  keys.forEach((key, index) => {
    const ctx = context(`c${index + 1}`);
    const result = reminders(ctx);
    assert.equal(result.length, 1);
    assert.equal(result[0].techKey, key);
    assert.equal(result[0].title, dictionary.cards.find(card => card.key === key).names.zh);
    assert.deepEqual(reminders({ ...ctx, technology: { unlocked: [] } }), []);
  });
  assert.deepEqual(reminders(context('unknown')), []);
  assert.deepEqual(reminders({}), []);
});

test('each printed table modifier retains its direction, costs, choice and once limit', () => {
  assert.match(reminders(context('c1'))[0].text, /重掷.*一次/);
  assert.match(reminders(context('c2'))[0].text, /上一行/);
  assert.match(reminders(context('c3'))[0].text, /下一行/);
  const persian = reminders(context('c4'))[0];
  assert.equal(persian.costLabel, '命运 +1 / 巴比伦债务 +1');
  assert.match(persian.text, /命运 \+1：重掷.*或巴比伦债务 \+1：直接选择/);
  const atlantean = reminders(context('c5'))[0];
  assert.equal(atlantean.costLabel, '命运 +1');
  assert.match(atlantean.text, /掷两次.*选择一个结果（一次）.*相同.*任选/);
});

test('disabled investigation cards are hidden; unimportant remains a reminder display preference', () => {
  const ctx = context('c2');
  ctx.record.explorationDelays = { disabledTechs: { c2: { 'spartan investigations': { dueDay: 8 } } } };
  assert.deepEqual(reminders(ctx), []);
  ctx.record.explorationDelays = {};
  ctx.technology.unimportant = ['spartan investigations'];
  assert.equal(structureRules.eligibility(ctx, 'spartan investigations').ok, true);
  assert.deepEqual(reminders(ctx), []);
  ctx.technology.unimportant = [{ key: 'Spartan Investigations@@cycle2' }];
  assert.deepEqual(reminders(ctx), []);
  ctx.technology = { unlockedKeys: [{ key: 'spartan investigations' }], unimportantKeys: [] };
  assert.equal(reminders(ctx).length, 1);
});

test('generating and editing reminder results never spends or changes saved technology state', () => {
  const ctx = context('c4', { record: { fate: 3, babelianDebt: 2, notes: 'keep' } });
  const before = clone(ctx);
  const result = reminders(ctx);
  result[0].text = 'changed result';
  assert.deepEqual(ctx, before);
  assert.match(reminders(ctx)[0].text, /重掷/);
  assert.deepEqual(rules.reminders(ctx), reminders(ctx), 'the loaded browser/global rules use the same shared ownership check');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
function extract(name) {
  const match = html.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}
// 单行常量按第一个分号截断（SURVEY_STORY_ROMANS 供总表表头兜底用）。
function constantLine(name) {
  const start = html.indexOf(`    const ${name} = `);
  assert.ok(start >= 0, `index.html 缺少常量 ${name}`);
  return html.slice(start, html.indexOf(';', start) + 1);
}
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = { setProperty() {} }; this.textContent = ''; }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
}
function viewHarness(ctx) {
  const c = vm.createContext({
    window: { ATO_INVESTIGATION_RULES: { reminders: ctx => reminders(ctx) } },
    document: { createElement: tag => new Element(tag) },
    getStructureTechContext: () => c.ctx,
    getActiveSurveyHubTarget: () => null,
    ctx,
  });
  vm.runInContext(constantLine('SURVEY_STORY_ROMANS') + '\n'
    + ['surveyStoryColumnHeaders', 'createSurveyHubSummary', 'createSurveyInvestigationReminders'].map(extract).join('\n'), c);
  return c;
}

test('the main-console constant box places investigation text directly above its hub table', () => {
  const c = viewHarness(context('c4'));
  const summary = c.createSurveyHubSummary({ summaryHeaders: ['Story I'], summary: [{ story: ['1-10'], hub: 'Hub', terrain: 'Terrain' }] });
  assert.equal(summary.children[0].textContent, '冒险中枢总表');
  assert.equal(summary.children[1].className, 'survey-investigation-reminders');
  assert.equal(summary.children[1].children[0].children[0].textContent, '波斯调查：');
  assert.match(summary.children[1].children[0].children[1].textContent, /巴比伦债务 \+1/);
  assert.equal(summary.children[2].className, 'survey-hub-summary');
  assert.equal(summary.children[1].children.every(row => row.tag === 'p'), true, 'the table hint has no action controls');
  c.ctx = null;
  const unloaded = c.createSurveyHubSummary({ summary: [{ story: ['1-10'], hub: 'Hub', terrain: 'Terrain' }] });
  assert.equal(unloaded.children.length, 2, 'an absent context must not show unowned card effects');
  c.ctx = context('c2');
  assert.equal(c.createSurveyInvestigationReminders().children[0].children[0].textContent, '斯巴达调查：', 'a refreshed context updates the hint');
});
