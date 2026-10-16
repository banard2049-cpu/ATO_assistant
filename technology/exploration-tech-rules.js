(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ATO_EXPLORATION_TECH_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = (code, message) => ({ ok: false, code, message });
  const cycleOf = ctx => ctx.cycleId || ctx.cycle;
  const base = key => String(key || '').toLowerCase().split('@@')[0];
  const count = value => /^(?:0|[1-9]\d*)$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  // 阿尔戈号命运轨道上限 9；悖论另有自己的上限 12。
  const FATE_MAX = 9;
  const catalog = [
    { key: 'ambrosia spill solution', cycle: 'c2', reactive: true, cards: ['13635', '13636'], actions: [
      { id: 'tech-explore-spill', label: '忽略神浆泄漏／黑色淤泥', costLabel: '命运 +1；弃置本卡、不结算效果；获得 3 不稳定神浆', mode: 'ignore' },
    ] },
    { key: 'odyssey training', cycle: 'c4', reactive: true, cards: ['9346'], actions: [
      { id: 'tech-explore-odyssey-ignore', label: '忽略奥德修斯的诅咒', costLabel: '命运 +1；忽略本卡效果', mode: 'ignore' },
      { id: 'tech-explore-odyssey-follow', label: '登记遵循随机方向', costLabel: '先支付命运 +1 忽略本轮诅咒；之后仍实际遵循随机选定的方向，确认巴比伦债务 -1', mode: 'follow' },
    ] },
    { key: 'salvage operations', actions: [
      { id: 'tech-explore-salvage', label: '打捞探索卡', costLabel: '命运 +1；单抽 1 张探索卡；可获得资源或泰坦则结算整张，否则无效果弃置', mode: 'salvage', hiddenOutcome: true },
      { id: 'tech-explore-salvage-resolve', label: '确认打捞卡奖励条件', costLabel: '核实本次打捞卡是否实际获得资源或泰坦；不再支付命运', mode: 'salvage-resolve' },
    ] },
    { key: 'argo initiative', cycle: 'c5', actions: [
      { id: 'tech-explore-argo', label: '启动阿尔戈号计划', costLabel: '支付 8 亚特兰提斯仪器；将 Cyclades Recruitment Drive 加入当前探索牌堆', mode: 'argo' },
    ] },
  ];
  const entries = ctx => ctx.state?.exploration?.drawStateByCycle?.[cycleOf(ctx)]?.activePiles?.flat() || [];
  const roundId = (ctx, entry) => `${cycleOf(ctx)}:${entry.id}:${entry.drawnAt || entry.day}`;
  const localKey = (ctx, entry) => `${cycleOf(ctx)}:${entry.id}:${entry.day}`;
  const effectRules = () => root.ATO_EXPLORATION_EFFECT_RULES || (typeof require === 'function' ? require('../assets/exploration-card-effects.js') : null);
  const resourceRules = () => root.ATO_EXPLORATION_RESOURCE_RULES || (typeof require === 'function' ? require('../assets/exploration-card-resource-rules.js') : null);
  const conditionRules = () => root.ATO_EXPLORATION_CONDITIONS || (typeof require === 'function' ? require('../assets/exploration-card-conditions.js') : null);
  const negotiationRules = () => root.ATO_NEGOTIATION_RULES || (typeof require === 'function' ? require('./negotiation-rules.js') : null);
  const dataset = ctx => ctx.explorationDataset || root.ATO_EXPLORATION_CARD_RESOURCES;
  function cardIgnored(ctx, entry) {
    return Boolean(entry.technologyIgnored || ctx.record?.explorationBatchReceipts?.[roundId(ctx, entry)]?.technologyIgnored);
  }
  function begun(ctx, entry) {
    const cycle = cycleOf(ctx), key = localKey(ctx, entry), ledger = ctx.record?.explorationBatchReceipts?.[roundId(ctx, entry)];
    const local = ctx.state?.exploration?.effectStateByCycle?.[cycle]?.[key];
    const settled = ctx.state?.exploration?.settledByCycle?.[cycle]?.[key];
    return Boolean(cardIgnored(ctx, entry) || ledger?.resource || ledger?.wishReceipt
      || Object.keys(ledger?.applied || {}).length || Object.keys(ledger?.delays || {}).length
      || settled && (!settled.batchRoundId || settled.batchRoundId === roundId(ctx, entry))
      || ['applied', 'manual', 'skipped', 'delays'].some(field => Object.keys(local?.[field] || {}).length));
  }
  function pursuitSettled(ctx) {
    const pursuit = root.ATO_EXPLORATION_PURSUIT || (typeof require === 'function' ? require('../assets/exploration-pursuit.js') : null);
    const id = pursuit?.roundId(ctx) || ctx.state?.exploration?.drawStateByCycle?.[cycleOf(ctx)]?.pursuitRoundId;
    return Boolean(id && (ctx.record?.technologyActionReceipts?.[id] || ctx.automation?.events?.[id]));
  }
  function targetEntries(ctx, rule) {
    return entries(ctx).filter(entry => rule.cards.includes(String(entry.id))
      && (!ctx.explorationEntryRoundId || roundId(ctx, entry) === ctx.explorationEntryRoundId));
  }
  function alreadyChosen(ctx, entry, mode) { return ctx.record?.explorationTechnologyChoices?.[roundId(ctx, entry)]?.[mode]; }
  function paidOdysseyIgnore(record, round, cycle) {
    if (cycle !== 'c4' || typeof round !== 'string' || !round.startsWith('c4:9346:')) return '';
    const ignored = record?.explorationBatchReceipts?.[round]?.technologyIgnored;
    const id = ignored?.operationId, receipt = record?.technologyActionReceipts?.[id];
    if (!id || ignored.techKey !== 'odyssey training' || !receipt || receipt.id !== id
      || receipt.techKey !== 'odyssey training' || receipt.actionId !== 'tech-explore-odyssey-ignore'
      || receipt.cycleId !== cycle || receipt.status !== 'completed' || receipt.request?.selection?.entryRoundId !== round
      || !receipt.payment?.some(item => item.type === 'fate' && item.amount === 1)) return '';
    return id;
  }
  function usableReactiveTarget(ctx, entry, action) {
    return !alreadyChosen(ctx, entry, action.mode) && (action.mode === 'follow'
      ? Boolean(paidOdysseyIgnore(ctx.record, roundId(ctx, entry), cycleOf(ctx))) : !begun(ctx, entry));
  }
  function presentInDeck(ctx, cardId) {
    const exploration = ctx.state?.exploration || {}, cycle = cycleOf(ctx), draw = exploration.drawStateByCycle?.[cycle];
    const idOf = entry => String(typeof entry === 'object' ? entry?.id : entry);
    return ['drawPile', 'temporaryRemoved', 'permanentRemoved', 'discardPile'].some(field => (draw?.[field] || []).some(item => idOf(item) === cardId))
      || (draw?.activePiles?.flat() || []).some(item => idOf(item) === cardId)
      || (exploration.selectedByCycle?.[cycle] || []).some(item => idOf(item) === cardId)
      || Object.values(ctx.automation?.events || {}).some(event => event.cycleId === cycle
        && event.status !== 'completed' && event.negotiationDraw?.cards?.includes(cardId));
  }
  function actionReason(ctx, rule, action) {
    if (rule.reactive) {
      const targets = targetEntries(ctx, rule);
      if (!targets.length) return '当前没有本科技可处理的探索卡。';
      if (action.mode === 'follow' && !targets.some(entry => paidOdysseyIgnore(ctx.record, roundId(ctx, entry), cycleOf(ctx)))) return '请先支付命运 +1，使用奥德赛训练忽略本轮诅咒，再登记遵循随机方向。';
      if (!targets.some(entry => usableReactiveTarget(ctx, entry, action))) return '本轮卡牌已开始结算或本科技效果已经使用。';
      if (action.mode === 'ignore' && pursuitSettled(ctx)) return '本轮追踪已结算，请在探索结算前选择科技分支。';
    }
    if (action.mode === 'salvage') {
      if (entries(ctx).length) return '请先结束当前探索结算，再进行打捞。';
      if (Object.values(ctx.automation?.events || {}).some(event => event.cycleId === cycleOf(ctx) && event.status !== 'completed' && event.negotiationDraw && !event.negotiationDraw.selectedCard)) return '请先处理荒原商人的待选探索卡。';
      if (!ctx.state?.exploration?.drawStateByCycle?.[cycleOf(ctx)]?.drawPile?.length) return '请先在探索卡库中初始化非空牌堆。';
    }
    if (action.mode === 'salvage-resolve' && !entries(ctx).some(entry => entry.salvageQualificationPending)) return '当前没有等待核实奖励条件的打捞卡。';
    if (action.mode === 'argo' && presentInDeck(ctx, '10308')) return 'Cyclades Recruitment Drive 已在当前探索卡组中，不能重复加入。';
    return '';
  }
  function listActions(ctx, helpers) {
    const result = [], cycle = cycleOf(ctx);
    for (const rule of catalog) {
      if (ctx.techKey && base(ctx.techKey) !== rule.key) continue;
      if (rule.cycle && rule.cycle !== cycle) continue;
      if (rule.reactive && !ctx.techKey && ctx.scope !== 'exploration') continue;
      const eligible = helpers.eligibility(ctx, rule.key);
      if (!ctx.techKey && ['UNKNOWN_TECH', 'LOCKED_TECH', 'CYCLE_SCOPE'].includes(eligible.code)) continue;
      const card = eligible.card || helpers.dictionaryCards(ctx, rule.key)[0];
      if (!card) continue;
      for (const action of rule.actions) {
        if (!rule.reactive && ctx.scope === 'exploration' && action.mode !== 'salvage-resolve') continue;
        if (action.mode === 'salvage-resolve' && ctx.scope !== 'exploration' && !ctx.techKey) continue;
        const targets = action.mode === 'salvage-resolve' ? entries(ctx).filter(entry => entry.salvageQualificationPending)
          : rule.reactive ? targetEntries(ctx, rule).filter(entry => usableReactiveTarget(ctx, entry, action)) : [];
        if (action.mode === 'salvage-resolve' && !targets.length) continue;
        if (rule.reactive && !ctx.techKey && !targets.length) continue;
        const reason = eligible.message || actionReason(ctx, rule, action);
        result.push({ ...copy(action), actionId: action.id, techKey: rule.key, title: helpers.titleFor(card), image: card.image?.back || '',
          groupKey: `exploration-tech:${rule.key}`, groupTitle: helpers.titleFor(card), immediate: true, skipTimeline: true,
          kind: 'cooldown', days: 0, dueDays: 0, stepId: 'explore', available: !reason, disabled: Boolean(reason), reason,
          choices: rule.reactive || action.mode === 'salvage-resolve' ? [{ id: 'entryRoundId', type: 'select', label: '本次抽到的探索卡',
            options: targets.map(entry => ({ value: roundId(ctx, entry), label: `${entry.name || entry.id} #${entry.id}` })),
            defaultValue: targets.length === 1 ? roundId(ctx, targets[0]) : '' }, ...(action.mode === 'salvage-resolve' ? [{
              id: 'qualificationResult', type: 'select', label: '奖励条件判定', defaultValue: 'automatic', options: [
                { value: 'automatic', label: '按最新记录重新判断' }, { value: 'qualifies', label: '已按卡面确认实际获得资源或泰坦' },
                { value: 'none', label: '已按卡面确认没有资源或泰坦奖励' },
              ],
            }] : [])] : [], confirmations: action.mode === 'salvage-resolve' ? [
              { id: 'qualificationConfirmed', label: '选择手动结果时，已核对本卡全部资源和泰坦奖励条件', optional: true },
            ] : [] });
      }
    }
    return result;
  }
  function stat(record, cycle, name) {
    return count(record.cycleStats?.[cycle]?.[name] ?? ((!record.cycle || record.cycle === cycle) ? record[name] : undefined));
  }
  function writeStat(record, cycle, name, value) {
    ((record.cycleStats ||= {})[cycle] ||= {})[name] = String(value);
    if (!record.cycle || record.cycle === cycle) record[name] = String(value);
  }
  function qualificationContext(ctx, card) {
    const cycle = cycleOf(ctx), conditions = conditionRules(), negotiation = negotiationRules();
    const local = Array.isArray(ctx.rewardFactions) ? ctx.rewardFactions : negotiation?.mapInfo(ctx).local || [];
    const factions = card.diplomacyFaction ? [card.diplomacyFaction] : local.filter(id => id && id !== 'none');
    const thresholds = cycle === 'c2' ? [[0, -1], [3, 0], [7, 1], [12, 2]] : [[-10, -3], [-9, -2], [-4, -1], [0, 0], [4, 1], [8, 2]];
    const diplomacy = factions.map(id => {
      const value = negotiation?.relation(ctx, id);
      if (value == null || value < thresholds[0][0] || value > (cycle === 'c2' ? 15 : 10)) return null;
      return { id, value, bonus: thresholds.filter(([minimum]) => value >= minimum).at(-1)[1] };
    }).filter(Boolean);
    return { ...conditions.contextForRecord(ctx.record, cycle), conditionRules: conditions, diplomacy, diplomacyFactions: factions,
      diplomacyFaction: card.diplomacyFaction || '', dataset: dataset(ctx) };
  }
  function qualificationSnapshot(context) {
    return context.diplomacy?.length ? { diplomacy: copy(context.diplomacy), diplomacyFaction: context.diplomacyFaction,
      diplomacyFactions: copy(context.diplomacyFactions) } : null;
  }
  function qualifies(card, cycle, cardId, context = {}) {
    const resources = resourceRules(), conditions = [];
    const effective = { ...context, cycleId: cycle, conditionRules: context.conditionRules || conditionRules() };
    for (const grant of card.grants || []) if (Number(grant.amount) > 0) conditions.push(resources.conditionMet(grant.condition, effective));
    for (const item of card.manual || []) {
      if (effectRules()?.parse(item.text, cycle, cardId, item.badge).effects.some(effect => effect.type === 'titan' && effect.amount > 0)) {
        conditions.push(resources.conditionMet(item.condition || (item.badge ? { type: 'icon', badge: item.badge } : null), effective));
      }
    }
    return conditions.includes(true) ? true : conditions.includes(null) ? null : false;
  }
  function previewOperation(ctx, helpers) {
    const eligible = helpers.eligibility(ctx, 'salvage operations');
    if (!eligible.ok) return eligible;
    try { helpers.dayOf(ctx); } catch (error) { return fail('INVALID_DAY', error.message); }
    const reason = actionReason(ctx, catalog.find(item => item.key === 'salvage operations'), { mode: 'salvage' });
    if (reason) return fail('EXPLORATION_UNAVAILABLE', reason);
    const fate = stat(ctx.record || {}, cycleOf(ctx), 'fate');
    if (fate === null) return fail('UNKNOWN_COST', '请先填写当前循环的命运。');
    if (fate >= FATE_MAX) return fail('COST_LIMIT', '命运已到上限，无法支付代价。');
    return { ok: true, event: { payment: [{ type: 'fate', label: '命运', amount: 1 }], skipTimeline: true } };
  }
  function prepareOperation(ctx, helpers, draft) {
    const cycle = cycleOf(ctx), rule = catalog.find(item => item.key === base(ctx.techKey));
    const action = rule?.actions.find(item => item.id === ctx.actionId);
    if (!action) return fail('UNKNOWN_ACTION', '未知的探索科技能力。');
    const eligible = helpers.eligibility(ctx, rule.key);
    if (!eligible.ok) return eligible;
    if (rule.cycle && rule.cycle !== cycle) return fail('CYCLE_SCOPE', '本科技仅适用于卡面所属循环。');
    const reason = actionReason(ctx, rule, action);
    if (reason) return fail('EXPLORATION_UNAVAILABLE', reason);
    const state = copy(ctx.state || {}), record = draft.record, automation = draft.automation, selection = copy(ctx.selection || {});
    const id = ctx.operationId, day = helpers.dayOf(ctx), payment = [], gains = [];
    let target, summary = action.costLabel, pending = false;
    if (rule.reactive) {
      target = targetEntries(ctx, rule).find(entry => roundId(ctx, entry) === selection.entryRoundId);
      if (!target) return fail('EXPLORATION_CHANGED', '探索抽卡轮次已变化，请重新选择当前卡牌。');
      if (alreadyChosen(ctx, target, action.mode) || action.mode === 'ignore' && begun(ctx, target)) return fail('ALREADY_SETTLED', '这张探索卡已经开始结算或本科技效果已经使用。');
      if (action.mode === 'follow' && !paidOdysseyIgnore(record, roundId(ctx, target), cycle)) return fail('ODYSSEY_IGNORE_REQUIRED', '所选探索卡没有本轮奥德赛训练支付命运并忽略诅咒的凭据。');
    }
    if (action.mode === 'ignore' || action.mode === 'salvage') {
      const before = stat(record, cycle, 'fate');
      if (before === null) return fail('UNKNOWN_COST', '请先填写当前循环的命运。');
      if (before >= FATE_MAX) return fail('COST_LIMIT', '命运已到上限，本次未支付代价或结算。');
      writeStat(record, cycle, 'fate', before + 1);
      payment.push({ type: 'fate', label: '命运', amount: 1, before, after: before + 1 });
    }
    if (action.mode === 'ignore') {
      const round = roundId(ctx, target), ignored = { operationId: id, techKey: rule.key, summary: action.costLabel };
      if (rule.key === 'ambrosia spill solution') {
        const before = count(record.resources?.['c2-violentAmbrosia'] ?? 0);
        if (before === null || !Number.isSafeInteger(before + 3)) return fail('INVALID_RESOURCE', '不稳定神浆库存无效。');
        (record.resources ||= {})['c2-violentAmbrosia'] = before + 3;
        gains.push({ type: 'resource', storageKey: 'c2-violentAmbrosia', label: '不稳定神浆', amount: 3, before, after: before + 3 });
      }
      const exploration = state.exploration, draw = exploration.drawStateByCycle[cycle];
      const live = draw.activePiles.flat().find(entry => roundId(ctx, entry) === round);
      live.technologyIgnored = copy(ignored);
      // Ignoring the card also ignores its printed removal instruction.
      live.removal = 'keep'; live.draw = 'single';
      for (const entry of draw.history || []) if (roundId(ctx, entry) === round) Object.assign(entry, copy(live));
      if (draw.current && roundId(ctx, draw.current) === round) Object.assign(draw.current, copy(live));
      const ledger = (record.explorationBatchReceipts ||= {})[round] ||= { version: 1, applied: {}, delays: {} };
      ledger.technologyIgnored = copy(ignored);
      const key = localKey(ctx, target), effects = ((exploration.effectStateByCycle ||= {})[cycle] ||= {})[key] ||= { applied: {}, manual: {}, skipped: {} };
      effects.technologyIgnored = copy(ignored);
      for (const [key, task] of Object.entries(exploration.tokenPlacementQueueByCycle?.[cycle] || {})) {
        if (task.entry && roundId(ctx, task.entry) === round) delete exploration.tokenPlacementQueueByCycle[cycle][key];
      }
      (((record.explorationTechnologyChoices ||= {})[round]) ||= {}).ignore = id;
    } else if (action.mode === 'follow') {
      pending = true;
      (((record.explorationTechnologyChoices ||= {})[roundId(ctx, target)]) ||= {}).follow = id;
      summary = '已支付命运并忽略本轮诅咒；已登记下一次移动仍遵循随机选定方向，实际遵循后确认巴比伦债务 -1。';
    } else if (action.mode === 'salvage') {
      const draw = state.exploration.drawStateByCycle[cycle], cardId = String(draw.drawPile[0]);
      const card = dataset(ctx)?.cards?.[`${cycle}:${cardId}`];
      if (!card) return fail('CARD_DATA_REQUIRED', '打捞卡的效果资料尚未加载，本次未抽卡或支付代价。');
      draw.drawPile.shift();
      const rewardContext = qualificationContext({ ...ctx, record }, card);
      const qualified = qualifies(card, cycle, cardId, rewardContext), snapshot = qualificationSnapshot(rewardContext);
      if (qualified !== false) {
        const tag = ctx.explorationTags?.cards?.[`${cycle}:${cardId}`] || root.ATO_EXPLORATION_CARD_TAGS?.cards?.[`${cycle}:${cardId}`] || {};
        const entry = { id: cardId, name: card.titleZh || card.titleEn || cardId, day, drawnAt: `technology:${id}`,
          pile: 0, removal: ['remove', 'permanent'].includes(tag.removal) ? tag.removal : 'keep', draw: 'single',
          negotiationId: id, salvageId: id, ...(snapshot ? { technologyDiplomacyContext: snapshot } : {}),
          ...(qualified === null ? { salvageQualificationPending: true } : {}) };
        draw.activePiles = [[entry], []]; draw.history = [copy(entry)]; draw.current = copy(entry);
        draw.pursuitRoundId = `salvage-${cycle}-${id}`; draw.pursuitChoices = {};
        ((state.exploration.settledByCycle ||= {})[cycle]) = {};
        ((state.exploration.effectStateByCycle ||= {})[cycle]) = {};
        if (state.exploration.lastSettlementByCycle) delete state.exploration.lastSettlementByCycle[cycle];
        summary = qualified === null ? `单抽 ${entry.name} #${cardId}，奖励条件尚未确认；卡牌已保留，先在探索区确认打捞资格。`
          : `单抽 ${entry.name} #${cardId}，可获得资源或泰坦；已转入探索结算区，按整张卡结算。`;
      } else {
        draw.drawPile.push(cardId);
        summary = `单抽 ${card.titleZh || card.titleEn || cardId} #${cardId}，没有资源或泰坦奖励；已无效果弃置并放回牌堆底。`;
      }
      gains.push({ type: 'salvage', cardId, qualified });
    } else if (action.mode === 'salvage-resolve') {
      const draw = state.exploration.drawStateByCycle[cycle];
      const target = draw.activePiles.flat().find(entry => entry.salvageQualificationPending && roundId(ctx, entry) === selection.entryRoundId);
      if (!target) return fail('EXPLORATION_CHANGED', '待确认打捞卡已变化，请刷新后重新选择。');
      const card = dataset(ctx)?.cards?.[`${cycle}:${target.id}`];
      if (!card) return fail('CARD_DATA_REQUIRED', '探索卡资料尚未加载。');
      const rewardContext = qualificationContext({ ...ctx, record }, card);
      let qualified = qualifies(card, cycle, target.id, rewardContext);
      if (qualified === null) {
        if (!['qualifies', 'none'].includes(selection.qualificationResult) || selection.qualificationConfirmed !== true) return fail('QUALIFICATION_REQUIRED', '条件仍不明确，请先补齐记录，或核对卡面后明确确认本次是否获得资源或泰坦。');
        qualified = selection.qualificationResult === 'qualifies';
      }
      if (qualified) {
        delete target.salvageQualificationPending;
        const snapshot = qualificationSnapshot(rewardContext);
        if (snapshot) target.technologyDiplomacyContext = snapshot;
        for (const entry of draw.history || []) if (roundId(ctx, entry) === roundId(ctx, target)) {
          Object.assign(entry, copy(target)); delete entry.salvageQualificationPending;
        }
        if (draw.current && roundId(ctx, draw.current) === roundId(ctx, target)) {
          Object.assign(draw.current, copy(target)); delete draw.current.salvageQualificationPending;
        }
        summary = `打捞卡 ${target.name} #${target.id} 确认可获得资源或泰坦；现在可按整张卡结算。`;
      } else {
        draw.activePiles = draw.activePiles.map(pile => pile.filter(entry => roundId(ctx, entry) !== roundId(ctx, target)));
        draw.history = (draw.history || []).filter(entry => roundId(ctx, entry) !== roundId(ctx, target));
        draw.current = draw.history.at(-1) || null;
        draw.drawPile.push(target.id);
        summary = `打捞卡 ${target.name} #${target.id} 没有实际资源或泰坦奖励；已无效果弃置并放回牌堆底。`;
      }
      gains.push({ type: 'salvage', cardId: target.id, qualified });
    } else if (action.mode === 'argo') {
      const before = count(record.resources?.['c5-atlanteanTekne'] ?? 0);
      if (before === null || before < 8) return fail('INSUFFICIENT_RESOURCES', '需要 8 亚特兰提斯仪器，本次未扣费或加牌。');
      const exploration = state.exploration ||= {}, draw = exploration.drawStateByCycle?.[cycle];
      if (!draw || !Array.isArray(draw.drawPile)) return fail('DECK_REQUIRED', '请先初始化当前探索牌堆。');
      (record.resources ||= {})['c5-atlanteanTekne'] = before - 8;
      payment.push({ type: 'resource', storageKey: 'c5-atlanteanTekne', label: '亚特兰提斯仪器', amount: -8, before, after: before - 8 });
      exploration.selectedByCycle ||= {};
      const selected = Array.isArray(exploration.selectedByCycle[cycle]) ? exploration.selectedByCycle[cycle]
        : (exploration.selectedByCycle[cycle] = [...new Set([...draw.drawPile, ...(draw.activePiles?.flat() || []).map(entry => entry.id),
          ...(draw.temporaryRemoved || []).map(entry => typeof entry === 'object' ? entry.id : entry)])]);
      selected.push('10308'); draw.drawPile.push('10308');
      gains.push({ type: 'exploration-card', cardId: '10308' });
    }
    const event = { id, techKey: rule.key, actionId: action.id, cycleId: cycle, stepId: 'explore', label: `${helpers.titleFor(eligible.card)} · ${action.label}`,
      createdDay: day, dueDay: day, cooldownUntilDay: 0, kind: pending ? 'reward' : 'cooldown', status: pending ? 'pending' : 'completed',
      skipTimeline: true, immediate: true, selection, payment, gains, rewardLabel: summary,
      ...(pending ? { explorationTechFollow: { roundId: roundId(ctx, target), cardId: target.id,
        ignoreOperationId: paidOdysseyIgnore(record, roundId(ctx, target), cycle) }, completionConfirmations: [
        { id: 'followedDirection', label: '已在下一次移动步骤遵循随机选定的方向' },
      ] } : { completedDay: day }) };
    automation.events[id] = event;
    const receipt = { id, request: draft.shape, techKey: rule.key, actionId: action.id, cycleId: cycle, createdDay: day, status: event.status,
      payment: copy(payment), gains: copy(gains), ...(!pending ? { completedDay: day } : {}) };
    (record.technologyActionReceipts ||= {})[id] = receipt;
    return { ok: true, operation: event, event, receipt, record, automation, state,
      ...(['salvage', 'salvage-resolve'].includes(action.mode) ? { readSections: ['map'] } : {}) };
  }
  function completeOperation(ctx, helpers, draft) {
    const { record, automation, event, receipt } = draft, cycle = cycleOf(ctx);
    if (!event.explorationTechFollow) return fail('UNKNOWN_ACTION', '未知的探索科技待办。');
    const follow = event.explorationTechFollow, source = paidOdysseyIgnore(record, follow.roundId, cycle);
    if (event.techKey !== 'odyssey training' || event.actionId !== 'tech-explore-odyssey-follow' || String(follow.cardId) !== '9346'
      || !source || follow.ignoreOperationId && follow.ignoreOperationId !== source
      || event.selection?.entryRoundId !== follow.roundId || receipt.request?.selection?.entryRoundId !== follow.roundId) {
      return fail('ODYSSEY_IGNORE_REQUIRED', '找不到同一轮已支付命运并忽略诅咒的奥德赛训练凭据，不能结算减债。');
    }
    if (ctx.selection?.followedDirection !== true) return fail('CONFIRM_DIRECTION', '请确认已在下一次移动步骤实际遵循随机方向。');
    const before = stat(record, cycle, 'babelianDebt');
    if (before === null) return fail('UNKNOWN_COST', '请先填写当前循环的巴比伦债务。');
    const after = Math.max(0, before - 1), gain = { type: 'stat', stat: 'babelianDebt', label: '巴比伦债务', amount: after - before, before, after };
    writeStat(record, cycle, 'babelianDebt', after);
    event.status = receipt.status = 'completed'; event.completedDay = receipt.completedDay = helpers.dayOf(ctx);
    event.gains = receipt.gains = [gain]; event.explorationTechFollow.confirmed = true;
    event.rewardLabel = '已确认遵循随机方向；巴比伦债务 -1（最低为 0）。';
    return { ok: true, operation: event, event, receipt, record, automation };
  }
  return { catalog: copy(catalog), listActions, previewOperation, prepareOperation, completeOperation, cardIgnored, roundId, qualifies, qualificationContext, qualificationSnapshot };
});
