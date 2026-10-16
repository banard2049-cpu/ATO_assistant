(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ATO_VOYAGE_ACTION_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const integer = value => /^(?:0|[1-9]\d*)$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const fail = (code, message) => ({ ok: false, code, message });
  const cycleOf = ctx => ctx.cycle || ctx.cycleId;
  const labels = { fate: '命运', doom: '灾祸', priests: '祭司', crew: '船员', hull: '船体', refugees: '难民',
    frozenTime: '凝固时光', paradox: '悖论', loopLength: '轮回长度', babelianDebt: '巴比伦债务', nymphCharges: '召唤充能' };
  // 可作为代价支付的轨道上限：阿尔戈号命运 9，悖论 12。
  const COST_MAX = { fate: 9, paradox: 12 };
  // Match record/index.html's summonCards, keeping the two ID namespaces separate.
  const summonNames = {
    godform: {
      zeus: '宙斯', poseidon: '波塞冬', demeter: '德墨忒尔', hephaestus: '赫菲斯托斯', hermes: '赫尔墨斯',
      ares: '阿瑞斯', artemis: '阿尔忒弥斯', athena: '雅典娜', hades: '哈迪斯', dionysus: '狄俄尼索斯',
      aphrodite: '阿佛洛狄忒', 'helios-apollonis-exalted': '赫利俄斯·阿波罗尼斯（至高）', hera: '赫拉',
      'poseidon-exalted': '波塞冬（至高）', 'zeus-exalted': '宙斯（至高）', 'hermes-exalted': '赫尔墨斯（至高）',
    },
    summon: {
      engine: '引擎宁芙', solitude: '孤独宁芙', amalthean: '阿玛尔忒娅宁芙', labyrinth: '迷宫宁芙', depths: '深海宁芙',
      sweets: '甜食宁芙', nietzschean: '尼采宁芙', forge: '锻炉宁芙', blade: '刀刃宁芙', knowledge: '知识宁芙',
      mask: '面具宁芙', curiosity: '好奇宁芙', night: '夜之宁芙', age: '年岁宁芙', hope: '希望宁芙', machina: '机械宁芙',
      silica: '硅石宁芙', midas: '迈达斯宁芙', natron: '泡碱宁芙', ambrosia: '神浆宁芙', aether: '以太宁芙',
    },
  };
  const mode = (id, label, options) => ({ id: `voyage-${id}`, label, ...options });
  const catalog = [
    { key: 'spark of the dead gods', group: 'fate', groupTitle: '调整命运', actions: [
      mode('spark', '祭司换取命运降低', { cost: { priests: -1 }, effects: { fate: -1 }, description: '祭司 −1；命运 −1' }),
    ] },
    { key: 'strange alliance', group: 'replenish', groupTitle: '恢复力量', actions: [
      mode('alliance-priests', '祭司与灾祸恢复充能', { cost: { priests: -2, doom: 1 }, restore: 'charge', description: '祭司 −2、灾祸 +1；恢复 1 个已消耗的召唤充能' }),
      mode('alliance-fate', '命运与灾祸恢复充能', { cost: { fate: 2, doom: 2 }, restore: 'charge', description: '命运 +2、灾祸 +2；恢复 1 个已消耗的召唤充能' }),
    ] },
    { key: 'recruitment programs', group: 'recruitment', groupTitle: '招聘项目', actions: [
      mode('recruitment', '外交 7+ · 难民转为船员', { cost: { fate: 1 }, check: true, recruitment: true,
        description: '命运 +1；外交 7+ 成功后，可将 1 难民转为 1 船员；失败仍支付命运' }),
    ] },
    { key: 'time solutions', group: 'loop-length', groupTitle: '延长轮回', actions: [
      mode('time', '凝固时光延长轮回', { cost: { frozenTime: -1 }, effects: { loopLength: 1 }, time: true,
        description: '凝固时光 −1；当前轮回延长 1 天（凝固时光上限 3／高级时间对策解锁后 5）' }),
    ] },
    { key: 'advanced time solutions', group: 'loop-length', groupTitle: '延长轮回', actions: [
      mode('advanced-time-fate', '命运延长轮回', { cost: { fate: 2 }, effects: { loopLength: 1 }, time: true, description: '命运 +2；当前轮回延长 1 天；凝固时光上限 5' }),
      mode('advanced-time-paradox', '悖论延长轮回', { cost: { paradox: 1 }, effects: { loopLength: 1 }, time: true, description: '悖论 +1；当前轮回延长 1 天；凝固时光上限 5' }),
    ] },
    { key: 'chronosail', group: 'loop-effect', groupTitle: '轮回效果', actions: [
      mode('chronosail', '立即结算轮回效果', { cost: { fate: 1 }, manual: '立即手动结算当前轮回效果；系统仅已支付命运，没有自动结算轮回效果', description: '命运 +1；立即手动结算当前轮回效果' }),
    ] },
    { key: 'extinction contingency', group: 'fate', groupTitle: '调整命运', actions: [
      mode('contingency-crew', '船员换取命运降低', { cost: { crew: -1 }, effects: { fate: -2 }, description: '船员 −1；命运 −2' }),
      mode('contingency-hull', '船体换取命运降低', { cost: { hull: -1 }, effects: { fate: -2 }, description: '船体 −1；命运 −2' }),
    ] },
    { key: 'divine deals', group: 'replenish', groupTitle: '恢复力量', actions: [
      mode('divine-charge', '恢复召唤充能', { cost: { babelianDebt: 1, doom: 1 }, restore: 'charge', description: '巴比伦债务 +1、灾祸 +1；恢复 1 个已消耗的召唤充能' }),
      mode('divine-summon', '恢复一次召唤', { cost: { babelianDebt: 1, doom: 1 }, restore: 'summon', description: '巴比伦债务 +1、灾祸 +1；恢复 1 次已用召唤（不会增加充能）' }),
      mode('divine-godform', '恢复神之形态', { cost: { babelianDebt: 1, doom: 1 }, restore: 'godform', description: '巴比伦债务 +1、灾祸 +1；恢复 1 个已用神之形态' }),
    ] },
  ];
  function engine() {
    return root.ATO_EXPLORATION_EFFECT_RULES || (typeof require === 'function' ? require('../assets/exploration-card-effects.js') : null);
  }
  function counters(record) {
    const saved = record.cycleStats?.c2?.crewCounters;
    if (object(saved)) return { crew: integer(saved.crew ?? 0), refugees: integer(saved.refugees ?? 0), captives: integer(saved.captives ?? 0) };
    let refugees = 0, captives = 0;
    for (const [key, value] of Object.entries(record.crewBoxes || {})) if (key.startsWith('c2-crew-')) {
      if (value === true || value === 'refugee') refugees++;
      else if (value === 'captive') captives++;
    }
    const crew = integer(record.cycleStats?.c2?.crew ?? (!record.cycle || record.cycle === 'c2' ? record.crew : undefined));
    return { crew: crew === null ? null : Math.max(0, crew - refugees - captives), refugees, captives };
  }
  function rawStat(ctx, type) {
    const record = ctx.record || {}, cycle = cycleOf(ctx);
    if (type === 'priests') return integer(record.resources?.priests ?? 0);
    if (type === 'nymphCharges') return integer(record.nymphCharges);
    if (['crew', 'refugees'].includes(type) && cycle === 'c2') return counters(record)[type];
    return integer(record.cycleStats?.[cycle]?.[type] ?? (!record.cycle || record.cycle === cycle ? record[type] : undefined));
  }
  function usedCards(ctx, type) {
    const record = ctx.record || {}, own = type === 'summon' ? 'nymphCards' : 'godforms', used = type === 'summon' ? 'nymphUsedCards' : 'godformUsedCards';
    return Array.isArray(record[own]) && Array.isArray(record[used])
      ? [...new Set(record[used])].filter(id => typeof id === 'string' && record[own].includes(id)) : [];
  }
  function restoreReason(ctx, type) {
    if (type !== 'charge') return usedCards(ctx, type).length ? '' : `没有可恢复的已用${type === 'summon' ? '召唤' : '神之形态'}。`;
    const current = rawStat(ctx, 'nymphCharges'), limit = integer(ctx.record?.nymphLimit);
    if (current === null || limit === null) return '请先在记录表填写有效的召唤充能与充能上限。';
    return current >= limit ? '召唤充能已满，没有已消耗的充能可恢复。' : '';
  }
  function cardLabel(type, id) {
    const names = summonNames[type] || {};
    return Object.prototype.hasOwnProperty.call(names, id) ? names[id] : `${type === 'summon' ? '宁芙' : '神之形态'}（${id}）`;
  }
  function choicesFor(action, ctx, helpers) {
    const choices = [];
    if (action.check) choices.push({ id: 'checkResult', label: '玩家外交检定 7+', type: 'select', required: true,
      options: [{ value: 'success', label: '成功（7+）' }, { value: 'failure', label: '失败（仍支付命运）' }] });
    if (action.recruitment) choices.push({ id: 'convertRefugee', label: '检定成功后的选择', type: 'select', required: true,
      options: [{ value: 'yes', label: '将 1 难民转为 1 船员' }, { value: 'no', label: '不转换难民' }] });
    if (['summon', 'godform'].includes(action.restore)) choices.push({ id: 'restoreId', label: `恢复的${action.restore === 'summon' ? '召唤' : '神之形态'}`, type: 'select', required: true,
      options: usedCards(ctx, action.restore).map(id => ({ value: id, label: cardLabel(action.restore, id) })) });
    return choices;
  }
  function listActions(ctx = {}, helpers) {
    const result = [];
    for (const rule of catalog) {
      if (ctx.techKey && !helpers.dictionaryCards(ctx, ctx.techKey).some(card => card.key === rule.key)) continue;
      const eligible = helpers.getAvailability({ ...ctx, techKey: rule.key });
      if (!ctx.techKey && ['UNKNOWN_TECH', 'LOCKED_TECH', 'CYCLE_SCOPE'].includes(eligible.code)) continue;
      const card = eligible.card || helpers.dictionaryCards(ctx, rule.key)[0];
      if (!card) continue;
      for (const action of rule.actions) {
        const reason = eligible.message || (action.restore ? restoreReason(ctx, action.restore) : '');
        result.push({ ...copy(action), actionId: action.id, techKey: rule.key, title: helpers.titleFor(card), image: card.image?.back || '',
          groupKey: `voyage:${rule.group}`, groupTitle: rule.groupTitle, tier: rule.key === 'advanced time solutions' ? 2 : 1,
          choices: choicesFor(action, ctx, helpers), confirmations: [], available: !reason, disabled: Boolean(reason), reason,
          immediate: true, kind: 'cooldown', days: 0, dueDays: 0, stepId: 'timeline', costLabel: action.description });
      }
    }
    return result;
  }
  function doomValue(ctx) {
    if (!object(ctx.state)) {
      const raw = ctx.record?.cycleStats?.[cycleOf(ctx)]?.doom ?? (!ctx.record?.cycle || ctx.record.cycle === cycleOf(ctx) ? ctx.record?.doom : undefined);
      return integer(raw ?? 0);
    }
    let value = integer(ctx.state.cardTracks?.doom?.doom ?? 0);
    if (value === null) return null;
    const seen = ctx.state.exploration?.trackReceiptsByCycle?.[cycleOf(ctx)] || {};
    for (const item of ctx.record?.explorationTrackTransactions || []) {
      if (item.cycleId !== cycleOf(ctx) || item.type !== 'doom' || seen[item.id]) continue;
      if (!Number.isSafeInteger(item.amount) || !Number.isSafeInteger(value + item.amount)) return null;
      value = Math.max(0, value + item.amount);
    }
    return value;
  }
  function prepareOperation(ctx, helpers, draft) {
    const rule = catalog.find(item => item.key === String(ctx.techKey).toLowerCase().split('@@')[0]);
    const action = rule?.actions.find(item => item.id === ctx.actionId);
    if (!action) return fail('UNKNOWN_ACTION', '未知的航行科技能力。');
    const eligible = helpers.getAvailability({ ...ctx, techKey: rule.key });
    if (!eligible.ok) return eligible;
    const cycle = cycleOf(ctx), day = helpers.dayOf(ctx), id = ctx.operationId, selection = copy(ctx.selection || {});
    let record = draft.record;
    const automation = draft.automation, effects = [], payment = [], gains = [];
    if (action.check && !['success', 'failure'].includes(selection.checkResult)) return fail('CHECK_REQUIRED', '请选择玩家外交检定 7+ 的成功或失败结果。');
    let targetLabel = '', manual = action.manual || '';
    if (action.recruitment && !['yes', 'no'].includes(selection.convertRefugee)) return fail('CHOICE_REQUIRED', '请选择检定成功后是否转换难民。');
    if (action.time) {
      const cap = helpers.eligibility(ctx, 'advanced time solutions').ok ? 5 : 3;
      const frozen = rawStat(ctx, 'frozenTime');
      if (frozen === null || frozen > cap) return fail('FROZEN_TIME_LIMIT', `请先核对凝固时光，当前时光筒仓上限为 ${cap}。`);
      if (rawStat(ctx, 'loopLength') === null) return fail('UNKNOWN_STAT', '请先在记录表填写当前轮回长度。');
    }
    const restorationError = action.restore && restoreReason(ctx, action.restore);
    if (restorationError) return fail('INVALID_RESTORE', restorationError);
    if (['summon', 'godform'].includes(action.restore) && !usedCards(ctx, action.restore).includes(selection.restoreId)) return fail('INVALID_TARGET', '请选择当前仍然已用的召唤或神之形态。');
    for (const [type, amount] of Object.entries(action.cost || {})) effects.push({ type, amount, cost: true });
    for (const [type, amount] of Object.entries(action.effects || {})) effects.push({ type, amount });
    if (action.recruitment && selection.checkResult === 'success' && selection.convertRefugee === 'yes') {
      // Free the refugee's place on the combined C2 crew track before adding the crew member.
      effects.push({ type: 'refugees', amount: -1, cost: true }, { type: 'crew', amount: 1 });
    }
    if (action.restore === 'charge') effects.push({ type: 'nymphCharges', amount: 1 });
    const currentDoom = effects.some(effect => effect.type === 'doom') ? doomValue(ctx) : null;
    for (const effect of effects) {
      const before = effect.type === 'doom' ? currentDoom : rawStat({ ...ctx, record }, effect.type);
      if (before === null) return fail('UNKNOWN_STAT', `请先填写有效的${labels[effect.type]}数值。`);
      if (!Number.isSafeInteger(before + effect.amount)) return fail('STAT_LIMIT', `${labels[effect.type]}超出可记录范围。`);
      if (effect.cost && effect.amount < 0 && before < -effect.amount) return fail('INSUFFICIENT_RESOURCES', `${labels[effect.type]}不足，整次未结算。`);
      if (effect.cost && COST_MAX[effect.type] !== undefined && before + effect.amount > COST_MAX[effect.type]) return fail('COST_LIMIT', `${labels[effect.type]}代价超过上限，整次未结算。`);
    }
    if (cycle === 'c2' && effects.some(effect => ['crew', 'refugees'].includes(effect.type))
        && Object.values(counters(record)).some(value => value === null)) return fail('UNKNOWN_STAT', '船员、难民或俘虏计数无效，请先核对记录表。');
    if (!engine()) return fail('RULES_UNAVAILABLE', '探索数值规则未加载，请刷新页面。');
    const result = engine().apply(record, cycle, effects, currentDoom === null ? {} : { stats: { doom: currentDoom } });
    record = result.record;
    // Never silently discount a printed payment when the shared effect engine clamps a track.
    for (const effect of effects.filter(item => item.cost)) {
      const actual = result.changes.filter(item => item.type === effect.type).reduce((sum, item) => sum + item.amount, 0);
      if (actual !== effect.amount) return fail('COST_LIMIT', `${labels[effect.type]}代价无法足额支付，整次未结算。`);
    }
    if (action.recruitment && selection.checkResult === 'success' && selection.convertRefugee === 'yes'
        && result.changes.filter(item => item.type === 'crew').reduce((sum, item) => sum + item.amount, 0) !== 1) {
      return fail('CREW_LIMIT', '当前船员、难民与俘虏超出轨道上限，请先核对记录表；整次未结算。');
    }
    for (const change of result.changes) {
      const item = { type: 'stat', stat: change.type, label: labels[change.type], amount: change.amount };
      (effects.some(effect => effect.type === change.type && effect.cost) ? payment : gains).push(item);
    }
    if (['summon', 'godform'].includes(action.restore)) {
      const field = action.restore === 'summon' ? 'nymphUsedCards' : 'godformUsedCards';
      record[field] = record[field].filter(value => value !== selection.restoreId);
      record[action.restore === 'summon' ? 'nymphUsed' : 'godformUsed'] = String(record[field].length);
      gains.push({ type: action.restore, id: selection.restoreId, amount: 1 });
    }
    let state;
    if (currentDoom !== null && object(ctx.state)) {
      state = copy(ctx.state);
      ((state.cardTracks ||= {}).doom ||= { position: 0, progress: 0, doom: 0 }).doom = currentDoom + result.changes.filter(item => item.type === 'doom').reduce((sum, item) => sum + item.amount, 0);
      const seen = (((state.exploration ||= {}).trackReceiptsByCycle ||= {})[cycle] ||= {});
      for (const item of record.explorationTrackTransactions || []) if (item.cycleId === cycle && item.type === 'doom') seen[item.id] = true;
    }
    const pending = Boolean(manual), restored = action.restore === 'summon' ? `已恢复召唤：${cardLabel('summon', selection.restoreId)}；充能没有变化`
      : action.restore === 'godform' ? `已恢复神之形态：${cardLabel('godform', selection.restoreId)}` : '';
    const rewardLabel = [result.summary, action.check ? `玩家外交检定 7+：${selection.checkResult === 'success' ? '成功' : '失败'}` : '',
      action.recruitment ? selection.checkResult === 'success' && selection.convertRefugee === 'yes' ? '1 难民已转为 1 船员' : '本次未转换难民' : '', restored, manual].filter(Boolean).join('；');
    const event = { id, techKey: rule.key, actionId: action.id, cycleId: cycle, stepId: 'timeline', immediate: true,
      label: `${helpers.titleFor(eligible.card)} · ${action.label}`, createdDay: day, dueDay: day, cooldownUntilDay: 0,
      kind: pending ? 'reward' : 'cooldown', status: pending ? 'pending' : 'completed',
      ...(!pending ? { skipTimeline: true, completedDay: day } : {}), rewardLabel, selection, targetLabel, payment, gains,
      ...(manual ? { manual: true, manualInstructions: manual } : {}) };
    automation.events[id] = event;
    const receipt = { id, request: draft.shape, techKey: rule.key, actionId: action.id, cycleId: cycle, createdDay: day,
      status: event.status, payment: copy(payment), gains: copy(gains), ...(!pending ? { completedDay: day } : {}),
      ...(manual ? { manualInstructions: manual, targetLabel } : {}) };
    (record.technologyActionReceipts ||= {})[id] = receipt;
    return { ok: true, operation: event, event, receipt, record, automation, duplicate: false, ...(state ? { state } : {}) };
  }
  return { catalog: copy(catalog), listActions, prepareOperation };
});
