// AI BP III 击败规则回归测试（永久化自 tmp/code-review/frontend/verify-bp3-rule.cjs）。
//
// 运行：node tools/test-aibp-bp3-defeat.cjs
//
// 依据规则书 P52（损伤堆叠）/ P53（晋升表）锁定 aibp/index.html 的真实晋升函数
// （lowestLevelCard / removeLowestCard / insertPromotedCard / resolveBpDefeat /
// resolveBpCritical ...），只对界面副作用打桩。任何一条断言失败都说明实现偏离规则书：
//   1. 普通击败 BP III：移除最低阶 BP（它才进「从游戏中移除」区）+ 随机洗入 1 张 BP3 +
//      被击伤的这张 BP3 放到 BP 卡组底部，且不得同时留在移除堆；
//   2. 最低阶 BP 只在弃牌堆时：按规则把弃牌堆洗回卡组，被击伤的 BP3 仍在卡组底部；
//   3. 晋升供应堆 BP III 耗尽：洗弃牌堆入卡组 + 被击伤的 BP3 置底，不洗入新 BP3；
//   4. 关键一击：被击伤的 BP3 本体进损伤堆、视作 2 个损伤，并洗入 2 张 BP3。
//
// 只跑源码里的真实函数，路径按本文件位置解析。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'aibp', 'index.html'), 'utf8');
const noop = () => {};

function extract(name, indent) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const end = source.indexOf(`\n${indent}}`, start);
  assert.ok(start >= 0 && end >= 0, `找不到函数 ${name}`);
  return source.slice(start, end + indent.length + 2);
}

const PILE_HELPERS = [
  'hasSupply',
  'reshuffleDiscardIfDeckEmpty',
  'shuffleCards',
  'insertRandom',
  'drawFromSupply',
  'insertPromotedCard',
  'lowestLevelCard',
  'removeFirstMatching',
  'removeLowestCard',
  'resolveBpDefeat',
];

function context(piles) {
  const ctx = vm.createContext({
    currentApostle: 'HEKATON',
    piles: { HEKATON: { BP: piles.BP, AI: piles.AI } },
    pushBpDamage(card) { piles.BP.damage.push(card); },
    promoteAiForBpIII: noop,
    promoteAiFromLevel: noop,
  });
  PILE_HELPERS.forEach((name) => vm.runInContext(extract(name, '    '), ctx));
  return ctx;
}

function countRefs(piles, card) {
  const seen = [];
  for (const [pileName, cards] of Object.entries(piles.BP)) {
    if (!Array.isArray(cards)) continue;
    cards.forEach((entry, index) => {
      if (entry === card) seen.push(`${pileName}[${index}]`);
    });
  }
  return seen;
}

const bp3 = { type: 'BP', level: 'III', index: 7 };
const bp1 = { type: 'BP', level: 'I', index: 1 };
const bp2 = { type: 'BP', level: 'II', index: 2 };

const failures = [];
function check(label, body) {
  try {
    body();
  } catch (error) {
    failures.push(`${label}：${error.message}`);
  }
}

// 1. 普通击败：最低阶 BP 进移除区 → 洗入 1 张 BP3 → 被击伤的 BP3 置底。
check('普通击败 BP III', () => {
  const piles = {
    BP: { deck: [{ ...bp1 }, { ...bp2 }], discard: [], removed: [], damage: [], supply: { III: [{ type: 'BP', level: 'III', index: 99 }] } },
    AI: { deck: [], discard: [], removed: [], damage: [], supply: { III: [] } },
  };
  const ctx = context(piles);
  ctx.resolveBpDefeat(bp3);
  assert.equal(piles.BP.deck.at(-1), bp3, '被击伤的 BP3 必须在 BP 卡组底部');
  assert.deepEqual(countRefs(piles, bp3), [`deck[${piles.BP.deck.length - 1}]`], '同一张 BP3 只能存在于一个牌堆');
  assert.equal(piles.BP.deck.length, 3, '卡组应当是：留下的高阶 BP + 洗入的 BP3 + 置底的被击伤 BP3');
  assert.equal(piles.BP.removed.length, 1, '晋升移除的最低阶 BP 才进入「从游戏中移除」区');
  assert.equal(piles.BP.removed[0].level, 'I');
  assert.equal(piles.BP.removed[0].index, bp1.index, '进入移除区的必须是那张最低阶 BP 本体');
  assert.equal(piles.BP.damage.length, 1);
  assert.equal(piles.BP.damage[0].special, 'DW', '普通击伤 BP III 只向损伤堆加入通用双重损伤');
  assert.equal(piles.BP.deck.some((card) => card.index === 99), true, '晋升供应堆的 BP3 必须洗入卡组');
});

// 2. 最低阶 BP 只在弃牌堆：按规则把弃牌堆洗回卡组。
check('最低阶 BP 来自弃牌堆', () => {
  const discardPiles = {
    BP: { deck: [{ ...bp2 }], discard: [{ ...bp1 }], removed: [], damage: [], supply: { III: [{ type: 'BP', level: 'III', index: 98 }] } },
    AI: { deck: [], discard: [], removed: [], damage: [], supply: { III: [] } },
  };
  const discardCtx = context(discardPiles);
  discardCtx.resolveBpDefeat(bp3);
  assert.equal(discardPiles.BP.removed.length, 1);
  assert.equal(discardPiles.BP.removed[0].level, 'I', '从弃牌堆移除的仍是「最低阶 BP」');
  assert.equal(discardPiles.BP.discard.length, 0, '移除来自弃牌堆后必须把弃牌堆洗回卡组');
  assert.equal(discardPiles.BP.deck.at(-1), bp3, '被击伤的 BP3 仍必须在卡组底部');
  assert.equal(discardPiles.BP.deck.length, 3, '洗回的低阶 BP 不得凭空消失');
  assert.deepEqual(countRefs(discardPiles, bp3), [`deck[${discardPiles.BP.deck.length - 1}]`], '同一张 BP3 只能存在于一个牌堆');
});

// 3. 供应堆耗尽：只洗弃牌堆入卡组 + 被击伤的 BP3 置底。
check('供应堆耗尽', () => {
  const exhaustedPiles = {
    BP: { deck: [], discard: [{ ...bp1 }, { ...bp2 }], removed: [], damage: [], supply: { III: [] } },
    AI: { deck: [], discard: [], removed: [], damage: [], supply: { III: [] } },
  };
  const exhaustedCtx = context(exhaustedPiles);
  exhaustedCtx.resolveBpDefeat(bp3);
  assert.equal(exhaustedPiles.BP.discard.length, 0, '供应堆耗尽时必须把弃牌堆洗入卡组');
  assert.equal(exhaustedPiles.BP.deck.length, 3);
  assert.equal(exhaustedPiles.BP.deck.at(-1), bp3, '被击伤的 BP3 必须放在卡组底部');
  assert.equal(exhaustedPiles.BP.removed.length, 0, '供应堆耗尽时没有任何 BP 被「从游戏中移除」');
  assert.equal(exhaustedPiles.BP.damage.length, 1);
  assert.equal(exhaustedPiles.BP.damage[0].special, 'DW', '供应堆耗尽不影响普通击伤只加通用双重损伤');
});

// 4. 关键一击：BP3 本体进损伤堆视作 2 损伤 + 洗入 2 张 BP3。
check('关键一击', () => {
  const criticalPiles = {
    BP: { deck: [{ ...bp1 }], discard: [], removed: [], damage: [], supply: { III: [{ type: 'BP', level: 'III', index: 90 }, { type: 'BP', level: 'III', index: 91 }] } },
    AI: { deck: [], discard: [], removed: [], damage: [], supply: { III: [] } },
  };
  const criticalCtx = context(criticalPiles);
  const criticalCard = { type: 'BP', level: 'III', index: 5 };
  vm.runInContext(extract('resolveBpCritical', '    '), criticalCtx);
  criticalCtx.resolveBpCritical(criticalCard);
  assert.equal(criticalPiles.BP.damage.length, 1);
  assert.equal(criticalPiles.BP.damage[0].index, 5);
  assert.equal(criticalPiles.BP.damage[0].level, 'III');
  assert.equal(criticalPiles.BP.damage[0].type, 'BP');
  assert.equal(criticalPiles.BP.damage[0].damageValue, 2, '关键一击的 BP3 本体视作 2 个损伤');
  // 实现以 { ...card, damageValue: 2 } 的副本入损伤堆，所以这里按身份字段核对
  // 「不得同时留在其它牌堆」。
  const leftover = ['deck', 'discard', 'removed']
    .flatMap((pileName) => (criticalPiles.BP[pileName] || []).filter((card) => card.level === 'III' && card.index === 5));
  assert.deepEqual(leftover, [], '关键一击的 BP3 不应同时留在其它牌堆');
  assert.equal(criticalPiles.BP.deck.filter((card) => card.level === 'III').length, 2, '关键一击要洗入 2 张 BP3');
  assert.deepEqual(
    criticalPiles.BP.deck.filter((card) => card.level === 'III').map((card) => card.index).sort(),
    [90, 91],
    '洗入的两张 BP3 必须来自晋升供应堆，而不是凭空造牌',
  );
  assert.equal(criticalPiles.BP.removed.length, 1, '晋升只移除那张最低阶 BP');
  assert.equal(criticalPiles.BP.removed[0].index, bp1.index);
});

if (failures.length) {
  console.error('AI BP III 击败规则回归测试失败：');
  failures.forEach((item) => console.error('  ' + item));
  process.exitCode = 1;
} else {
  console.log('AI BP III 击败规则回归测试通过：普通击败移除最低阶 BP + 洗入 BP3 + 被击伤 BP3 置底（含弃牌堆与供应堆耗尽变体），关键一击记 2 损伤并洗入 2 张供应堆 BP3');
}
