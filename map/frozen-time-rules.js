(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_MAP_FROZEN_TIME_RULES = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = (code, message) => ({ ok: false, code, message });
  const number = value => /^(?:0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const receiptId = tileId => `map-frozen-time:c3:${tileId}`;

  function createEngine(options = {}) {
    const technology = options.technologyRules || root.ATO_STRUCTURE_TECH_RULES;
    function status(ctx, tileId) {
      const cycle = ctx.cycleId || ctx.cycle;
      const saved = (ctx.mapState || ctx.map)?.cycles?.[cycle] || {};
      const tags = options.tags || root.ATO_MAP_TILE_TAGS;
      const available = technology?.eligibility(ctx, 'time solutions');
      const advanced = technology?.eligibility(ctx, 'advanced time solutions');
      const raw = ctx.record?.cycleStats?.c3?.frozenTime
        ?? ((!ctx.record?.cycle || ctx.record.cycle === 'c3') ? ctx.record?.frozenTime : undefined) ?? 0;
      return {
        marker: cycle === 'c3' && Boolean(tags?.tiles?.[`c3:${tileId}`]?.tags?.includes('frozen_time')),
        current: (saved.currentTile || saved.tokens?.AG) === tileId,
        // 翻开的当天还只是“已揭示”，凝固时光按揭示结算；已探索状态要到下一天。
        explored: Boolean(saved.explored?.[tileId] || saved.previewRevealed?.[tileId]
          || saved.latestRevealedTile === tileId),
        // New entries distinguish a fresh exploration from an old save's last revealed tile.
        newlyExplored: saved.latestRevealedTile === tileId && saved.explorationEntries?.[tileId] === true,
        receipt: ctx.record?.technologyActionReceipts?.[receiptId(tileId)] || null,
        available, capacity: advanced?.ok ? 5 : 3,
        value: number(raw === '' ? 0 : raw),
      };
    }

    function prepareOperation(ctx) {
      if ((ctx.cycleId || ctx.cycle) !== 'c3' || number(ctx.day) === null) return fail('INVALID_CONTEXT', '请先设置循环 III 的航行日期。');
      const tileId = ctx.selection?.tileId;
      const info = status(ctx, tileId);
      if (!info.marker || !info.current || !info.explored || !info.newlyExplored) return fail('INVALID_LOCATION', '凝固时光只在新探索的当前板块获得，已探索板块不会补领。');
      if (ctx.techKey !== 'map-frozen-time' || ctx.actionId !== 'map-collect-frozen-time'
          || ctx.operationId !== receiptId(tileId)) return fail('INVALID_OPERATION', '凝固时光领取编号与当前板块不符。');
      if (info.receipt) return fail('ALREADY_COLLECTED', '这个板块的凝固时光已处理。');
      if (!info.available || info.available.code === 'UNKNOWN_TECH') return fail('RULES_UNAVAILABLE', '时间对策科技资料未加载，请刷新后重试。');
      if (info.available.ok && info.value === null) return fail('INVALID_FROZEN_TIME', '凝固时光数值无效，请先在记录表核对。');

      const record = copy(ctx.record || {}), automation = copy(ctx.automation || { version: 1, events: {} });
      const reason = !info.available.ok ? 'locked' : info.value >= info.capacity ? 'full' : 'gained';
      const gained = reason === 'gained' ? 1 : 0;
      if (gained) {
        record.cycleStats ||= {};
        record.cycleStats.c3 ||= {};
        record.cycleStats.c3.frozenTime = String(info.value + 1);
        if (!record.cycle || record.cycle === 'c3') record.frozenTime = String(info.value + 1);
      }
      const rewardLabel = gained ? `凝固时光 +1（${info.value + 1}/${info.capacity}）`
        : reason === 'full' ? `本次探索未获得凝固时光：时光筒仓已满（上限 ${info.capacity}）`
          : '本次探索未获得凝固时光：时间对策尚未解锁或暂时禁用';
      const operation = { id: ctx.operationId, techKey: ctx.techKey, actionId: ctx.actionId, cycleId: 'c3',
        label: `地图 ${tileId}：凝固时光`, noteCategory: '地图资源',
        kind: 'cooldown', status: 'completed', skipTimeline: true,
        createdDay: Number(ctx.day), dueDay: Number(ctx.day), cooldownUntilDay: Number(ctx.day),
        selection: copy(ctx.selection), gained, reason, capacity: info.capacity, payment: [], rewardLabel };
      // A full silo or missing technology also consumes this exploration opportunity.
      // Spending time or unlocking technology later must not retroactively grant it.
      record.technologyActionReceipts ||= {};
      record.technologyActionReceipts[ctx.operationId] = { ...copy(operation), request: { selection: copy(ctx.selection) } };
      automation.events ||= {};
      automation.events[ctx.operationId] = copy(operation);
      return { ok: true, operation, receipt: record.technologyActionReceipts[ctx.operationId], record, automation, readSections: ['map'] };
    }
    return { status, prepareOperation, completeOperation: () => fail('ALREADY_COMPLETED', '凝固时光已即时处理。') };
  }
  return { receiptId, createEngine };
});
