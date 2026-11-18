// 主控制台：探索步骤后的「扎根」提醒，使用科技到期提醒条的样式。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  const match = source.match(new RegExp('^    function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, `missing ${name}`);
  return match[0];
}

function classList() {
  const values = new Set();
  return {
    contains: (name) => values.has(name),
    toggle(name, force) {
      if (force === undefined ? !values.has(name) : force) values.add(name);
      else values.delete(name);
    },
  };
}

function setup({ day = 18, applied = false } = {}) {
  const elements = {
    acclimationReminder: { hidden: true, classList: classList() },
    acclimationReminderText: { textContent: '' },
    acclimationReminderButton: { textContent: '', disabled: false },
  };
  const rule = { id: 'a1', day: 18, label: 'Acclimation 1', from: ['4', '5', '6', '8', '19'], to: ['10', '11', '12', '14', '22'] };
  const ctx = vm.createContext({
    state: { day, exploration: { acclimationsByCycle: { c1: applied ? { a1: true } : {} } } },
    elements,
    currentCycleConfig: () => ({ id: 'c1' }),
    getAcclimationRule: (value, cycleId) => Number(value) === 18 && cycleId === 'c1' ? rule : null,
    isAcclimationApplied: (value, cycleId) => Boolean(ctx.state.exploration.acclimationsByCycle[cycleId]?.[value.id]),
  });
  vm.runInContext(extractFunction('renderAcclimationReminder'), ctx);
  return { ctx, elements, rule };
}

test('扎根提醒紧接探索步骤，复用科技到期提醒的样式', () => {
  const renderFlow = extractFunction('renderFlow');
  assert.match(renderFlow, /fragment\.appendChild\(item\);\s+if \(step\.id === "explore"\) fragment\.appendChild\(elements\.acclimationReminder\);/);
  const markup = source.match(/<section id="acclimationReminder"[\s\S]*?<\/section>/)?.[0];
  assert.ok(markup);
  assert.match(markup, /class="structure-tech-due acclimation-reminder"/);
  assert.match(markup, /class="structure-tech-due-item acclimation-reminder-item"/);
  assert.match(markup, /id="acclimationReminderText"/);
  assert.match(markup, /class="structure-tech-due-actions"/);
});

test('非扎根日隐藏提醒', () => {
  const { ctx, elements } = setup({ day: 17 });
  ctx.renderAcclimationReminder();
  assert.equal(elements.acclimationReminder.hidden, true);
});

test('扎根日显示与科技到期提醒一致的一行说明', () => {
  const { ctx, elements } = setup({ day: 18 });
  ctx.renderAcclimationReminder();
  assert.equal(elements.acclimationReminder.hidden, false);
  assert.equal(elements.acclimationReminder.classList.contains('applied'), false);
  assert.equal(elements.acclimationReminderText.textContent,
    '今日 · Day 18 · 扎根 · Acclimation 1：将探索卡 4、5、6、8、19 替换为 10、11、12、14、22。');
  assert.equal(elements.acclimationReminderButton.textContent, '扎根');
  assert.equal(elements.acclimationReminderButton.disabled, false);
});

test('已扎根后当天仍显示确认状态，按钮不可再点', () => {
  const { ctx, elements } = setup({ day: 18, applied: true });
  ctx.renderAcclimationReminder();
  assert.equal(elements.acclimationReminder.hidden, false);
  assert.equal(elements.acclimationReminder.classList.contains('applied'), true);
  assert.equal(elements.acclimationReminderText.textContent,
    '今日 · Day 18 · 已扎根 · Acclimation 1：探索牌堆已替换。');
  assert.equal(elements.acclimationReminderButton.textContent, '已扎根');
  assert.equal(elements.acclimationReminderButton.disabled, true);
});
