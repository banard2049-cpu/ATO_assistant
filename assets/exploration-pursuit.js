(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ATO_EXPLORATION_PURSUIT = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = (code, message) => ({ ok: false, code, message });
  // 阿尔戈号命运轨道上限 9（记录表按「命运 ≥ 10」读失败段落，这里只压可记录的上限）。
  const FATE_MAX = 9;
  // Standalone pursuit symbols, checked against all 223 local card faces.
  // A symbol within an instruction/condition is not a printed pursuit marker.
  const singles = {
    c1: [6407,6410,6411,6414,6415,6418,6420,6422,6425,6426,6427,6428,6430],
    c2: [13600,13601,13602,13604,13607,13608,13609,13614,13615,13617,13620,13624,13627],
    c3: [13500,13501,13502,13504,13507,13508,13510,13513,13517,13520,13521,13524,13525],
    c4: [9300,9303,9304,9305,9306,9309,9314,9315,9318,9319,9322,9331],
    c5: [10311,10318,10321,10325,10326,10327,10328,10329,10336,10337,10340,10341,10344],
  };
  const doubles = { c1: 6436, c2: 13637, c3: 13533, c4: 9336 };
  const manifest = {};
  for (const [cycle, start, end] of [['c1',6400,6440],['c2',13600,13642],['c3',13500,13541],['c4',9300,9346],['c5',10300,10348]]) {
    for (let id = start; id <= end; id++) if (!(cycle === 'c1' && id === 6432)) manifest[`${cycle}:${id}`] = doubles[cycle] === id ? 2 : singles[cycle].includes(id) ? 1 : 0;
  }
  manifest['c1:8201'] = manifest['c1:13400'] = 0;
  const conditional = {
    'c1:6436': { index: 0, fate: 8 }, 'c2:13637': { index: 0, fate: 8 },
    'c3:13533': { index: 0, fate: 8 }, 'c4:9336': { index: 0, fate: 8 },
    'c4:9344': { index: 3, fate: 6, debt: 4 }, 'c4:9346': { index: 1, fate: 8 },
    'c5:10305': { index: 1, fate: 8 }, 'c5:10311': { index: 0, fate: 8 }, 'c5:10318': { index: 0, fate: 8 },
  };
  // These cards retain their printed symbol, but Allied diplomacy ignores it.
  const ignores = { 'c5:10326': { index: 0 }, 'c5:10327': { index: 0 } };
  function manualIndexes(card) {
    const key = card.key || `${card.cycleId}:${card.cardId || card.id}`;
    return conditional[key] ? [conditional[key].index] : ignores[key] ? [ignores[key].index] : key === 'c5:10304' ? [0] : [];
  }
  function alliedState(ctx, card) {
    const cycle = ctx.cycleId || ctx.cycle, exploration = ctx.state?.exploration;
    const key = `${cycle}:${card.id}:${card.day}`;
    const local = exploration?.effectStateByCycle?.[cycle]?.[key];
    const settled = exploration?.settledByCycle?.[cycle]?.[key];
    const receipt = ctx.record?.explorationBatchReceipts?.[`${cycle}:${card.id}:${card.drawnAt || card.day}`];
    const resources = root.ATO_EXPLORATION_RESOURCE_RULES || (typeof require === 'function' ? require('./exploration-card-resource-rules.js') : null);
    // Use the same frozen diplomacy as the card's other settled effects.
    for (const frozen of receipt ? [receipt.context, receipt.resource?.context] : [local?.context, settled?.context]) {
      const items = frozen && resources?.diplomacyItems(frozen);
      if (items?.length) return Number(items[0].bonus) >= 2;
    }
    const negotiation = root.ATO_NEGOTIATION_RULES || (typeof require === 'function' ? require('../technology/negotiation-rules.js') : null);
    if (!negotiation) return null;
    const info = negotiation.mapInfo(ctx), snapshot = ctx.state?.mapSnapshot;
    const metadata = ctx.mapTags || root.ATO_MAP_TILE_TAGS;
    const synced = snapshot?.currentTileId === info.tileId && (!snapshot.cycleId || snapshot.cycleId === cycle);
    const mapped = metadata?.tiles?.[`${cycle}:${info.tileId}`];
    const factions = [...new Set((mapped || info.local.length ? info.local : synced
      ? ctx.state?.mapCurrentTileFactions || snapshot.currentTileFactions || [] : []).filter(id => id && id !== 'none'))];
    const known = Boolean(mapped || synced
      && (Array.isArray(ctx.state?.mapCurrentTileFactions) || Array.isArray(snapshot.currentTileFactions)));
    if (!factions.length) return known ? false : null;
    const selected = local?.choices?.diplomacyFaction;
    const faction = factions.length === 1 ? factions[0] : factions.includes(selected) ? selected : '';
    if (!faction) return null;
    const diplomacy = Object.fromEntries(Object.entries(ctx.record?.diplomacy || {}).map(([id, raw]) =>
      [id, typeof raw === 'number' || typeof raw === 'string' ? raw : null]));
    const value = negotiation.relation({ ...ctx, record: { ...ctx.record, diplomacy } }, faction);
    if (value !== null && value >= -10 && value <= 10) return value >= 8;
    const bonus = local?.choices?.diplomacyBonus;
    return Number.isInteger(bonus) && bonus >= -3 && bonus <= 2 ? bonus >= 2 : null;
  }
  function choiceCards(ctx) {
    return entries(ctx).filter(card => !card.negotiationId && !technologyIgnored(ctx, card) && `${ctx.cycleId || ctx.cycle}:${card.id}` === 'c5:10304');
  }
  function technologyIgnored(ctx, card) {
    const cycle = ctx.cycleId || ctx.cycle;
    return Boolean(card.technologyIgnored || ctx.record?.explorationBatchReceipts?.[`${cycle}:${card.id}:${card.drawnAt || card.day}`]?.technologyIgnored);
  }
  function stat(ctx, key) {
    const cycle = ctx.cycleId || ctx.cycle;
    const value = ctx.record?.cycleStats?.[cycle]?.[key] ?? ((!ctx.record?.cycle || ctx.record.cycle === cycle) ? ctx.record?.[key] : undefined);
    return /^(?:0|[1-9]\d*)$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  }
  function entries(ctx) { return ctx.state?.exploration?.drawStateByCycle?.[ctx.cycleId || ctx.cycle]?.activePiles?.flat() || []; }
  function roundId(ctx) {
    const cards = entries(ctx);
    if (!cards.length || cards.every(card => card.negotiationId)) return '';
    const cycle = ctx.cycleId || ctx.cycle;
    const saved = ctx.state.exploration.drawStateByCycle[cycle].pursuitRoundId;
    if (saved) return saved;
    const text = cards.map(card => `${card.id}/${card.drawnAt || card.day}/${card.pile || 0}`).join('|');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `pursuit-${cycle}-${(hash >>> 0).toString(16)}`;
  }
  function countMarkers(ctx) {
    const cycle = ctx.cycleId || ctx.cycle, cards = entries(ctx).filter(card => !card.negotiationId && !technologyIgnored(ctx, card));
    const unknown = cards.find(card => !Object.prototype.hasOwnProperty.call(manifest, `${cycle}:${card.id}`));
    if (unknown) return fail('UNKNOWN_PURSUIT_CARD', `探索卡 #${unknown.id} 的追踪标记尚未核对，请核对卡组后重试。`);
    const choices = ctx.state?.exploration?.drawStateByCycle?.[cycle]?.pursuitChoices || {};
    const fateChoices = choiceCards(ctx).filter(card => choices[card.id] === 'fate').length;
    const currentFate = stat(ctx, 'fate'), fate = currentFate === null ? null : currentFate + fateChoices, debt = stat(ctx, 'babelianDebt');
    const unresolved = [], values = cards.map(card => {
      const key = `${cycle}:${card.id}`, rule = conditional[key];
      const printed = manifest[key];
      let extra = 0, ignored = 0, condition = '', conditionStatus = '', active = false;
      if (rule) {
        condition = rule.debt ? `命运 ≥${rule.fate} 或巴比伦债务 ≥${rule.debt}` : `命运 ≥${rule.fate}`;
        active = fate !== null && fate >= rule.fate || Boolean(rule.debt && debt !== null && debt >= rule.debt);
        if (!active && (fate === null || rule.debt && debt === null)) unresolved.push(`${card.name || card.id}：请补齐${condition}的记录表数值`);
        extra = active ? 1 : 0;
      }
      if (key === 'c5:10304') {
        condition = '选择命运 +1 或结算 1 个追踪标记';
        const chosen = choices[card.id];
        if (!['fate','pursuit'].includes(chosen)) unresolved.push(`${card.name || card.id}：请选择命运 +1 或追踪标记`);
        extra = chosen === 'pursuit' ? 1 : 0;
      }
      if (ignores[key]) {
        condition = '当地外交为结盟时忽略本卡宿敌标记';
        const allied = alliedState(ctx, card);
        if (allied === null) unresolved.push(`${card.name || card.id}：请先确认本卡适用的本地阵营并填写外交关系，以判定结盟时忽略宿敌标记`);
        ignored = allied === true ? printed : 0;
        conditionStatus = allied === null ? '外交条件待确认' : allied ? '已结盟，忽略' : '未结盟，保留';
        active = allied === true;
      }
      return { cardId: card.id, name: card.name || card.id, printed, extra, ignored, count: printed + extra - ignored, condition, conditionStatus, active, fate, debt };
    });
    return { ok: true, total: values.reduce((sum, card) => sum + card.count, 0), cards: values, unresolved, fateChoices };
  }
  function plan(ctx) {
    const id = roundId(ctx), cycleId = ctx.cycleId || ctx.cycle;
    if (!id) return fail('NO_EXPLORATION_ROUND', '当前没有需要结算追踪的探索抽卡。');
    const existing = ctx.record?.technologyActionReceipts?.[id];
    if (existing && ctx.automation?.events?.[id]) {
      const operation = ctx.automation.events[id];
      return { ok: true, total: operation.pursuit.total, cards: operation.pursuit.cards, roundId: id, settled: true, operation };
    }
    const counted = countMarkers(ctx);
    if (!counted.ok) return counted;
    if (counted.unresolved.length) return { ...fail('PURSUIT_CONDITION_REQUIRED', counted.unresolved.join('；')), ...counted, ok: false, roundId: id };
    if (!counted.total) return { ok: true, ...counted, roundId: id, mode: 'none', steps: 0, candidates: [] };
    const cycle = (ctx.mapData || root.ATO_MAP_DATA)?.cycles?.find(item => item.id === cycleId);
    const map = ctx.mapState || ctx.map, saved = map?.cycles?.[cycleId];
    const pathRules = ctx.pathRules || root.ATO_NEMESIS_PATH;
    if (!cycle || !pathRules || !saved?.currentTile || !cycle.tiles.some(tile => tile.id === saved.currentTile)) return fail('MAP_REQUIRED', '请先在地图中设置当前循环的阿尔戈号位置。');
    const active = Boolean(saved.tokens?.AD || cycleId === 'c5' && saved.titanXTrackPosition != null);
    const mode = active ? 'move' : counted.total >= 2 ? 'spawn' : 'none';
    const candidates = mode === 'spawn' && cycleId !== 'c5' ? pathRules.spawnCandidates(cycle, saved).map(tile => ({ id: tile.id, label: tile.label || tile.id })) : [];
    if (mode === 'spawn' && cycleId !== 'c5' && !candidates.length) return fail('NO_SPAWN_LOCATION', '本轮至少有 2 个追踪标记，但没有距离阿尔戈号正好 4 格的已揭示生成位置，请先核对地图。');
    return { ok: true, ...counted, roundId: id, mode, steps: mode === 'move' ? counted.total : 0, candidates, cycle, saved, pathRules };
  }
  function prepareOperation(ctx, helpers, draft) {
    const preview = plan(ctx);
    if (!preview.ok) return preview;
    if (ctx.operationId !== preview.roundId || ctx.selection?.roundId !== preview.roundId) return fail('EXPLORATION_CHANGED', '探索抽卡已变化，请重新结算当前轮次。');
    if (preview.settled) return fail('ALREADY_SETTLED', '本轮追踪已经结算。');
    const cycleId = ctx.cycleId || ctx.cycle, selection = copy(ctx.selection || {}), record = draft.record, automation = draft.automation;
    let steps = preview.steps, payment = [], mapState, message = '', path = [], battle = false;
    if (preview.fateChoices) {
      const before = stat(ctx, 'fate');
      if (before === null) return fail('UNKNOWN_COST', '请先填写命运，以结算所选的命运 +1 分支。');
      if (before + preview.fateChoices > FATE_MAX) return fail('COST_LIMIT', '所选命运分支超过上限，本次未结算。');
      ((record.cycleStats ||= {})[cycleId] ||= {}).fate = String(before + preview.fateChoices);
      if (!record.cycle || record.cycle === cycleId) record.fate = String(before + preview.fateChoices);
      payment.push({ type: 'fate', amount: preview.fateChoices, before, after: before + preview.fateChoices });
    }
    if (selection.waive === true) {
      if (preview.mode !== 'move' || !steps) return fail('CANNOT_WAIVE_SPAWN', '追踪者对策只能减少已有宿敌的移动，不能阻止生成。');
      const eligible = helpers.eligibility(ctx, 'pursuer problem');
      if (!eligible.ok) return eligible;
      const raw = record.cycleStats?.[cycleId]?.fate ?? ((!record.cycle || record.cycle === cycleId) ? record.fate : undefined);
      if (!/^(?:0|[1-9]\d*)$/.test(String(raw ?? ''))) return fail('UNKNOWN_COST', '请先填写当前循环的命运数值。');
      const fate = Number(raw);
      if (fate + 1 > FATE_MAX) return fail('COST_LIMIT', '命运代价超过上限，本次未扣费或移动。');
      ((record.cycleStats ||= {})[cycleId] ||= {}).fate = String(fate + 1);
      if (!record.cycle || record.cycle === cycleId) record.fate = String(fate + 1);
      payment.push({ type: 'fate', amount: 1, before: fate, after: fate + 1 });
      steps = Math.max(0, steps - 1);
    }
    if (preview.mode === 'none') message = `本轮 ${preview.total} 个追踪标记，${preview.total ? '地图无宿敌且不足 2 个' : '无需激活宿敌'}，无事发生`;
    else {
      mapState = copy(ctx.mapState || ctx.map || {});
      const saved = mapState.cycles[cycleId]; saved.tokens ||= {};
      if (preview.mode === 'spawn') {
        if (cycleId === 'c5') { saved.titanXTrackPosition = 7; saved.tokens.AD = ''; message = '泰坦 X 已生成，追踪指示物放在 7'; }
        else {
          const chosen = selection.spawnTileId || preview.candidates[0]?.id;
          if (!preview.candidates.some(tile => tile.id === chosen)) return fail('INVALID_SPAWN_LOCATION', '所选生成位置已失效，请按最新地图重新选择。');
          saved.tokens.AD = chosen; message = `本轮 ${preview.total} 个追踪标记，宿敌生成在 ${chosen}，本次不再移动`;
        }
      } else if (cycleId === 'c5') {
        let position = saved.titanXTrackPosition;
        if (!Number.isInteger(position) || position < 1 || position > 7) return fail('INVALID_TITAN_X_TRACK', '泰坦 X 追踪位置无效，请先在地图中核对。');
        for (let i = 0; i < steps && position > 1; i++) {
          position--; saved.titanXTrackPosition = position;
          if (position === 6 || position === 3) {
            const argo = preview.cycle.tiles.find(tile => tile.id === saved.currentTile);
            const neighbors = preview.cycle.tiles.filter(tile => tile.id !== argo.id && (Object.values(argo.neighbors || {}).includes(tile.id) || Object.values(tile.neighbors || {}).includes(argo.id)));
            const unrevealed = neighbors.filter(tile => !saved.explored?.[tile.id]);
            const candidates = unrevealed.length ? unrevealed : neighbors;
            if (!candidates.length) return fail('NO_TITAN_X_LOCATION', '找不到泰坦 X 的相邻放置位置，请先核对地图。');
            // Stable per operation: retrying a conflict must not reroll the tile.
            const salt = [...String(ctx.operationId)].reduce((sum, char) => sum + char.charCodeAt(0), position);
            saved.tokens.AD = candidates[salt % candidates.length].id;
          }
        }
        message = `泰坦 X 追踪指示物 ${preview.saved.titanXTrackPosition} → ${position}${saved.tokens.AD ? `；模型位于 ${saved.tokens.AD}` : ''}`;
      } else {
        const start = saved.tokens.AD, target = saved.currentTile;
        if (!preview.cycle.tiles.some(tile => tile.id === start)) return fail('INVALID_ADVERSARY', '宿敌位置无效，请先在地图中核对。');
        path = preview.pathRules.shortestPath(preview.cycle, saved, start, target);
        if (path.length) saved.tokens.AD = path[Math.min(steps, path.length - 1)];
        if (saved.tokens.AD === target) { saved.tokens.AD = ''; battle = true; }
        message = battle ? '宿敌追上阿尔戈号，已移除模型；请在探索结算后进行宿敌战斗'
          : !steps ? '已使用追踪者对策，本轮宿敌移动降至 0'
          : path.length ? `宿敌移动 ${Math.min(steps, path.length - 1)} 格：${start} → ${saved.tokens.AD}` : '没有通往阿尔戈号的已揭示路线，宿敌未移动';
      }
    }
    const state = copy(ctx.state || {}), saved = mapState?.cycles?.[cycleId];
    if (saved) {
      const snapshot = state.mapSnapshot ||= {};
      snapshot.adversaryTileId = snapshot.adversaryTileLabel = saved.tokens.AD || '';
      if (cycleId === 'c5') snapshot.titanXTrackPosition = saved.titanXTrackPosition;
    }
    const day = helpers.dayOf(ctx), event = { id: ctx.operationId, techKey: 'pursuer problem', actionId: 'exploration-pursuit', cycleId, stepId: 'explore',
      label: '探索追踪结算', createdDay: day, dueDay: day, cooldownUntilDay: 0, kind: battle ? 'battle' : 'cooldown', status: battle ? 'pending' : 'completed',
      ...(!battle ? { skipTimeline: true, completedDay: day } : {}), payment, selection, rewardLabel: message,
      pursuit: { mode: preview.mode, total: preview.total, steps, waived: selection.waive === true, cards: preview.cards, path, battle,
        choices: copy(ctx.state?.exploration?.drawStateByCycle?.[cycleId]?.pursuitChoices || {}) } };
    automation.events[ctx.operationId] = event;
    const receipt = { id: ctx.operationId, request: draft.shape, techKey: event.techKey, actionId: event.actionId, cycleId, status: event.status, payment: copy(payment) };
    (record.technologyActionReceipts ||= {})[ctx.operationId] = receipt;
    return { ok: true, operation: event, event, receipt, record, automation, state, readSections: ['map'], ...(mapState ? { mapState } : {}) };
  }
  return { version: 2, markers: copy(manifest), conditional: copy(conditional), ignores: copy(ignores), manualIndexes, choiceCards, roundId, countMarkers, plan, prepareOperation };
});
