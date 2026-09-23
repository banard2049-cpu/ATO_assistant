const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
const recordSource = read('record/index.html');
const dashboardSource = read('index.html');
const extractFunction = (source, name) => {
  const match = source.match(new RegExp('^( *)function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, name);
  return match[0];
};
const cycleLiteral = recordSource.slice(recordSource.indexOf('    const cycleData = '), recordSource.indexOf('    const sharedResourceKeys = '));

// 冒险轨从左到右、从上到下，含 α/Ω。来源：A8 V1.2、A9/A10 V1.1、A10.5/A10.75 V1.0 第 1 页。
const expectedCounts = {
  c1: [5, 5, 5, 5, 4, 4, 5, 3],
  c2: [4, 4, 4, 4, 4, 4, 4, 4],
  c3: [5, 5, 5, 4, 4, 4, 5],
  c4: [5, 5, 5, 5, 5, 4, 4, 10],
  c5: [4, 5, 5, 5, 4, 4, 4, 10],
};

function element() {
  return {
    children: [], style: {},
    set innerHTML(value) { this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); },
    setAttribute() {}, addEventListener() {},
  };
}

function setup(cycle) {
  const context = vm.createContext({
    state: { cycle, adventures: {} },
    elements: { adventureMeta: element(), adventureList: element() },
    document: { createElement: element },
    escapeHtml: (text) => text,
    normalizeAdventureTitle: (text) => text.toLowerCase(),
  });
  vm.runInContext(cycleLiteral + '\nfunction currentCycle() { return cycleData[state.cycle]; }\n'
    + ['renderAdventures', 'markAdventureFromSurvey'].map((name) => extractFunction(recordSource, name)).join('\n')
    + '\n' + extractFunction(dashboardSource, 'recordAdventureMiddleSlots'), context);
  return context;
}

for (const [cycle, counts] of Object.entries(expectedCounts)) {
  test(`${cycle}: rendered adventure boxes match the Chinese PDF`, () => {
    const ctx = setup(cycle);
    vm.runInContext('renderAdventures()', ctx);
    const cards = ctx.elements.adventureList.children;
    assert.deepEqual(cards.map((card) => card.children[1].children.length), counts);
    for (const card of cards) {
      const buttons = card.children[1].children;
      assert.equal(buttons[0].textContent, 'α');
      assert.equal(buttons.at(-1).textContent, 'Ω');
    }
  });

  test(`${cycle}: dashboard and record sync fill every available blank, without overflow`, () => {
    const ctx = setup(cycle);
    counts.forEach((count, index) => {
      if (count === 10) return; // 十个具名希腊字母格没有空白格。
      ctx.index = index;
      for (let slot = 1; slot <= count - 2; slot++) {
        assert.equal(vm.runInContext('markAdventureFromSurvey(state.cycle, currentCycle().adventures[index][1], "blank")', ctx), `mid${slot}`);
      }
      assert.equal(vm.runInContext('markAdventureFromSurvey(state.cycle, currentCycle().adventures[index][1], "blank")', ctx), false);
      assert.equal(vm.runInContext('recordAdventureMiddleSlots(state.cycle, index).length', ctx), count - 2);
      // 已有完成标记和中间格不会因增减框数被重新编号。
      ctx.state.adventures[`${cycle}-${index}-omega`] = true;
      vm.runInContext('renderAdventures()', ctx);
      assert.ok(ctx.elements.adventureList.children[index].children[1].children.at(-1).className.includes('active'));
    });
  });
}

for (const cycle of ['c4', 'c5']) {
  test(`${cycle}: all ten named boxes can be recorded and rendered`, () => {
    const ctx = setup(cycle);
    const ids = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'lambda', 'omicron', 'sigma', 'psi', 'omega'];
    for (const id of ids) {
      ctx.boxId = id;
      assert.equal(vm.runInContext('markAdventureFromSurvey(state.cycle, currentCycle().adventures[7][1], boxId)', ctx), id);
    }
    vm.runInContext('renderAdventures()', ctx);
    const buttons = ctx.elements.adventureList.children[7].children[1].children;
    assert.deepEqual(buttons.map((button) => button.textContent), ['α', 'β', 'γ', 'δ', 'ε', 'λ', 'ο', 'σ', 'ψ', 'Ω']);
    assert.ok(buttons.every((button) => button.className.includes('active')));
  });
}
