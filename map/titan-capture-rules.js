(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_MAP_TITAN_RULES = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = (code, message) => ({ ok: false, code, message });
  const number = value => /^(?:0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const baseId = (cycleId, tileId) => `map-titan:${cycleId}:${tileId}`;
  const huntId = (cycleId, day) => `map-titan-hunt:${cycleId}:${day}`;
  function marker(cycleId, tileId, saved = {}, data = root.ATO_MAP_TITANS) {
    const face = cycleId === 'c5' ? (saved.tileVariants?.[tileId] === 'alternate' ? ':B' : ':A') : '';
    return data?.markers?.[`${cycleId}:${tileId}${face}`] || null;
  }
  function createEngine(options = {}) {
    const technology = options.technologyRules || root.ATO_STRUCTURE_TECH_RULES;
    function status(ctx, tileId) {
      const saved = ctx.map?.cycles?.[ctx.cycleId] || {};
      const current = saved.currentTile || saved.tokens?.AG;
      const receipts = ctx.record?.technologyActionReceipts || {};
      const available = technology?.getAvailability({ ...ctx, techKey: 'titan hunting' });
      // 当天翻开的板块尚未“已探索”（进入下一天才结算），但捕获发生在本日，
      // 所以这里按“已揭示”判断，与已探索板块一视同仁。
      const revealed = Boolean(saved.explored?.[tileId] || saved.previewRevealed?.[tileId]
        || saved.latestRevealedTile === tileId);
      return { marker: marker(ctx.cycleId, tileId, saved, options.data),
        current: current === tileId, explored: revealed, revealed,
        newlyExplored: saved.latestRevealedTile === tileId,
        collected: Boolean(receipts[baseId(ctx.cycleId, tileId)]),
        hunted: receipts[huntId(ctx.cycleId, ctx.day)] || null,
        canHunt: Boolean(available?.ok), huntReason: available?.message || '' };
    }
    function prepareOperation(ctx) {
      if (!/^c[1-5]$/.test(ctx.cycleId || '') || number(ctx.day) === null) return fail('INVALID_CONTEXT', '请先在主控台设置航行日期。');
      const tileId = ctx.selection?.tileId;
      const info = status(ctx, tileId);
      if (!info.marker || !info.current || !info.explored) return fail('INVALID_LOCATION', '阿尔戈号必须进入带泰坦图标的已探索板块。');
      const base = ctx.actionId === 'map-collect';
      const hunt = ctx.actionId === 'map-hunt';
      if (!base && !hunt) return fail('UNKNOWN_ACTION', '未知的地图捕获操作。');
      const expectedId = base ? baseId(ctx.cycleId, tileId) : huntId(ctx.cycleId, ctx.day);
      if (ctx.operationId !== expectedId || ctx.techKey !== (base ? 'map-titan' : 'titan hunting')) return fail('INVALID_OPERATION', '地图捕获编号与当前位置或日期不符。');
      if (base && info.collected || hunt && info.hunted) return fail('ALREADY_COLLECTED', base ? '这个板块的梦行者已经领取。' : '本日的额外捕获已经处理。');
      if (hunt && !info.canHunt) return fail('LOCKED_TECH', info.huntReason || '请先解锁「泰坦捕获」。');
      if (hunt && !['success', 'failure'].includes(ctx.selection.checkResult)) return fail('CHECK_REQUIRED', '请先进行外交检定（7+），再选择结果。');
      const record = copy(ctx.record || {}), automation = copy(ctx.automation || { version: 1, events: {} });
      const gained = base || ctx.selection.checkResult === 'success' ? 1 : 0;
      if (hunt) {
        const raw = record.cycleStats?.[ctx.cycleId]?.fate ?? ((!record.cycle || record.cycle === ctx.cycleId) ? record.fate : undefined) ?? 0;
        const fate = number(raw === '' ? 0 : raw);
        if (fate === null || !Number.isSafeInteger(fate + 1)) return fail('INVALID_FATE', '记录表中的命运数值无效，请先核对。');
        record.cycleStats ||= {};
        record.cycleStats[ctx.cycleId] ||= {};
        record.cycleStats[ctx.cycleId].fate = String(fate + 1);
        if (!record.cycle || record.cycle === ctx.cycleId) record.fate = String(fate + 1);
      }
      if (gained) {
        record.titans ||= [];
        if (!Array.isArray(record.titans) || record.titans.some(titan => number(titan?.count ?? 1) === null)) return fail('INVALID_TITANS', '泰坦数量无效，请先在记录表核对。');
        let titan = record.titans.find(titan => !titan.crippled && /^(?:梦行者|dream\s*walker)$/i.test(String(titan.name || '').trim()));
        if (titan) {
          const count = number(titan.count ?? 1) + 1;
          if (!Number.isSafeInteger(count)) return fail('INVALID_TITANS', '泰坦数量超出可记录范围。');
          titan.count = count;
          titan.limit = Math.max(Number(titan.limit) || 1, count);
        } else {
          let id = `titan-${ctx.operationId}`;
          while (record.titans.some(item => item.id === id)) id += '-new';
          record.titans.push({ id, name: '梦行者', count: 1, limit: 1, crippled: false });
        }
      }
      const operation = { id: expectedId, techKey: ctx.techKey, actionId: ctx.actionId, cycleId: ctx.cycleId,
        label: base ? `地图 ${tileId}：领取梦行者` : `地图 ${tileId}：泰坦捕获（外交 7+）`, noteCategory: '地图捕获',
        kind: 'cooldown', status: 'completed', skipTimeline: true, createdDay: Number(ctx.day), dueDay: Number(ctx.day),
        cooldownUntilDay: Number(ctx.day), selection: copy(ctx.selection), gained,
        payment: hunt ? [{ type: 'fate', amount: 1 }] : [],
        rewardLabel: gained ? '已获得 1 架梦行者' : '检定失败，未获得额外泰坦',
      };
      record.technologyActionReceipts ||= {};
      record.technologyActionReceipts[expectedId] = { ...copy(operation), request: { selection: copy(ctx.selection) } };
      automation.events ||= {};
      automation.events[expectedId] = copy(operation);
      return { ok: true, operation, receipt: record.technologyActionReceipts[expectedId], record, automation, readSections: ['map'] };
    }
    return { status, prepareOperation, completeOperation: () => fail('ALREADY_COMPLETED', '地图捕获已即时完成。') };
  }
  return { marker, baseId, huntId, createEngine };
});
