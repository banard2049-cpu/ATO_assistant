// 追踪栏的界面回归：宿敌还没被本循环的特殊事件引入时，探索步骤只显示标记数量和
// “忽略”说明，不出现生成/移动按钮；特殊事件把宿敌放进地图后才恢复结算。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const pursuit = require('../assets/exploration-pursuit.js');

function fn(name) {
  const match = source.match(new RegExp('^    (?:async )?function ' + name + '\\([^]*?^    }', 'm'));
  assert.ok(match, name);
  return match[0];
}

function element(tag) {
  return {
    tagName: tag, children: [], attrs: {}, dataset: {}, disabled: false,
    appendChild(child) { this.children.push(child); return child; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener() {},
    classList: { add() {}, toggle() {} },
    set textContent(value) { this._text = value; },
    get textContent() {
      if (this._text !== undefined) return this._text;
      return this.children.map(child => (typeof child === 'string' ? child : child.textContent ?? '')).join('');
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function harness({ adversary = '', introduced = false, manual = false, ids = ['6436'] } = {}) {
  const mapState = { cycles: { c1: { currentTile: '001', tokens: { AD: adversary }, explored: { '001': true } } } };
  if (introduced) mapState.cycles.c1.adversaryIntroduced = true;
  const state = { exploration: { drawStateByCycle: { c1: { pursuitRoundId: 'round-1',
    activePiles: [ids.map(id => ({ id, name: id, day: 8 })), []], pursuitChoices: {} } } } };
  const context = { cycleId: 'c1', cycle: 'c1', day: 8, record: { cycle: 'c1', cycleStats: { c1: { fate: '3' } } },
    state, automation: { version: 1, events: {} }, selection: { roundId: 'round-1' }, mapState,
    mapData: { cycles: [{ id: 'c1', tiles: Array.from({ length: 7 }, (_, index) => ({ id: String(index + 1).padStart(3, '0'),
      nx: index, ny: 0, neighbors: { left: index ? String(index).padStart(3, '0') : '',
        right: index < 6 ? String(index + 2).padStart(3, '0') : '' } })) }] },
    pathRules: loadPathRules() };
  const sandbox = {
    window: { ATO_EXPLORATION_PURSUIT: pursuit, ATO_NEMESIS_BATTLE: { targetFor: () => null },
      ATO_STRUCTURE_TECH_RULES: { canUsePursuerProblem: () => ({ ok: false, message: '' }), prepareOperation: () => ({ ok: false }) } },
    document: { createElement: element, createTextNode: text => ({ textContent: String(text) }) },
    getStructureTechContext: () => context,
    currentCycleConfig: () => ({ id: 'c1', map: true }),
    state, cachedArgoRecord: context.record,
    ensureExplorationDrawState: () => state.exploration.drawStateByCycle.c1,
    saveState() {}, renderFlow() {}, adversaryBattleByCycle: {},
    pursuitSettlementMode: () => (manual ? 'manual' : 'auto'),
    settleExplorationPursuit: { busy: false }, settleExplorationDraw: { busy: false },
    mutateExplorationRecord: { busy: false }, mapCommandBusy: false,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fn('createExplorationPursuitTools')}\nthis.render = createExplorationPursuitTools;`, sandbox);
  return sandbox.render();
}

function loadPathRules() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'map', 'nemesis-path.js'), 'utf8'), sandbox);
  return sandbox.window.ATO_NEMESIS_PATH;
}

const textOf = box => box.children.map(child => child.textContent ?? '').join(' | ');
const buttons = box => box.children.filter(child => child.tagName === 'button');

test('追踪栏在宿敌未引入时只提示一句', () => {
  const box = harness();
  assert.match(textOf(box), /^2 \| /, '标记数量照常显示，方便核对抽到的卡');
  assert.match(textOf(box), /宿敌未引入，追踪标记忽略。/);
  assert.equal(box.children.filter(child => child.textContent === '宿敌未引入，追踪标记忽略。').length, 1);
  assert.equal(buttons(box).length, 0, '未引入时不应出现生成或移动按钮');
});

test('特殊事件把宿敌放进地图后追踪栏恢复移动与结算按钮', () => {
  const box = harness({ adversary: '006' });
  assert.match(textOf(box), /宿敌将移动 2 格/);
  assert.ok(buttons(box).some(button => /结算追踪/.test(button.textContent)));
  assert.doesNotMatch(textOf(box), /宿敌未引入/);
});

test('手动结算模式下同样只有一句未引入提示，且没有结算按钮', () => {
  const box = harness({ manual: true });
  assert.match(textOf(box), /宿敌未引入，追踪标记忽略。/);
  assert.equal(buttons(box).length, 0);
});
