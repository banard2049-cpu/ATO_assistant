(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_ASCENSION_CORE = api;
})(typeof window === 'object' ? window : this, function () {
  'use strict';

  // 规则书（奥德赛·规则书 pp.71「升华核心」）：升华一张独特装备卡牌要花费一个
  // 「对应的升华核心」，迷宫升华核心把故事集 I 的卡升华到 II，以此类推。
  // 也就是说消耗的是装备当前所在故事集的核心，不是目标故事集的核心。
  // 名称与 theatre/terms.js 的 materials[*].core 玩家版译名保持一致，改一边要同步另一边
  // （tests/ascension-core.test.cjs 会比对）。
  const CYCLES = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const NAMES = {
    c1: '迷纹登升核心',
    c2: '埋藏登升核心',
    c3: '诅咒登升核心',
    c4: '焦黑登升核心',
    c5: '月陨登升核心',
  };

  const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const amount = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  };

  function name(cycle) {
    return NAMES[cycle] || '登升核心';
  }

  function amountIn(theatreState, cycle) {
    return amount(theatreState?.hold?.[cycle]?.core?.count);
  }

  // 返回新的剧场存档；不改动传入对象。余额不足时抛错，调用方据此阻止登升。
  function spend(theatreState, cycle) {
    if (!CYCLES.includes(cycle)) throw new Error('这件装备没有可用的登升核心。');
    const have = amountIn(theatreState, cycle);
    if (have < 1) throw new Error(`缺少${name(cycle)}，请先在幻忆记录表的剧场货舱里登记余额。`);
    const state = JSON.parse(JSON.stringify(theatreState));
    state.hold[cycle].core.count = have - 1;
    return state;
  }

  // 登升没能落库时把核心退回。余额字段缺失时按 0 起算。
  function refund(theatreState, cycle) {
    if (!CYCLES.includes(cycle)) return theatreState;
    const state = JSON.parse(JSON.stringify(isObject(theatreState) ? theatreState : {}));
    state.hold ||= {};
    state.hold[cycle] ||= {};
    state.hold[cycle].core ||= { count: 0, notes: '' };
    if (typeof state.hold[cycle].core.notes !== 'string') state.hold[cycle].core.notes = '';
    state.hold[cycle].core.count = amountIn(state, cycle) + 1;
    return state;
  }

  return { CYCLES, NAMES, name, amount: amountIn, spend, refund };
});
