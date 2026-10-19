(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_EXPLORATION_TRADE_DIALOG = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  function actionFor(card, record, roundId, history, dataset, options) {
    const menu = options.merchant(card);
    const usage = options.tradeUsage(record, card.cycleId, card.key, roundId, history, dataset);
    if (!menu || !usage) throw new Error('商人交易记录无效，请重新读取存档。');
    const entry = item => {
      const resource = dataset.cycles[card.cycleId].resources[item.resource];
      return { ...item, storageKey: resource.storageKey || item.resource, label: resource.zh || resource.en || item.resource };
    };
    return { id: 'trade', techKey: card.key, title: '商人交易', label: '商人交易', trade: true,
      available: true, days: 0, skipTimeline: true, costLabel: '无额外代价', maxTrades: menu.limit,
      tradeUsedRoutes: usage.used, tradeRoutes: menu.trades.map(trade => {
        const costs = trade.costs.map(entry), gains = trade.gains.map(entry);
        const label = items => items.map(item => `${item.amount} ${item.label}`).join(' + ');
        return { ...trade, costs, gains, label: `${label(costs)} → ${label(gains)}` };
      }) };
  }
  function open(config) {
    const doc = root.document, planner = root.ATO_STRUCTURE_TECH_RULES, options = root.ATO_EXPLORATION_OPTION_RULES;
    if (!planner || !root.ATO_STRUCTURE_TECH_CLIENT || !options) throw new Error('交易窗口模块未加载，请刷新页面。');
    config.assertContext?.();
    const dialog = doc.createElement('dialog'); dialog.className = 'exploration-trade-dialog';
    dialog.setAttribute('aria-label', `${config.title} · 商人交易`);
    const header = doc.createElement('div'); header.className = 'exploration-trade-dialog-header';
    const title = doc.createElement('h3'); title.textContent = `${config.title} · 商人交易`;
    const close = doc.createElement('button'); close.type = 'button'; close.textContent = '关闭';
    let busy = false;
    close.addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove());
    header.append(title, close); dialog.appendChild(header);
    const engine = {
      listActions(ctx) { return [actionFor(config.card, ctx.record, config.roundId, config.history(), config.dataset, options)]; },
      findTradePath: planner.findTradePath, previewTrades: planner.previewTrades,
    };
    engine.previewOperation = ctx => {
      const result = planner.previewTrades(engine.listActions(ctx)[0], ctx.selection, ctx.record);
      return result.ok ? { ok: true, operation: { label: '商人交易', skipTimeline: true,
        payment: result.payment, tradeChanges: result.changes, tradeSummary: result.summary, gains: result.gains } } : result;
    };
    const client = {
      async load() {
        config.assertContext?.();
        const record = await config.load();
        config.assertContext?.();
        return { campaign: {}, profileId: config.profileId, cycleId: config.card.cycleId, cycle: config.card.cycleId,
          day: config.day, record, automation: { events: {} } };
      },
      async submit(request) {
        if (busy) throw new Error('正在结算交易，请稍候。');
        busy = true; close.disabled = true; finish.disabled = true; undo.disabled = true;
        try {
          config.assertContext?.();
          return await config.submit(request.selection.tradeSteps, request.operationId);
        } finally { busy = false; close.disabled = false; finish.disabled = false; undo.disabled = !config.history().length; }
      },
    };
    const panel = root.ATO_STRUCTURE_TECH_CLIENT.createActionPanel({ profileId: config.profileId,
      cycleId: config.card.cycleId, techKey: config.card.key, client, rules: engine,
      assertContext: config.assertContext, onCommitted: result => { config.onCommitted(result); dialog.close(); } });
    dialog.appendChild(panel);
    const saved = doc.createElement('div'); saved.className = 'exploration-trade-saved-actions';
    const undo = doc.createElement('button'); undo.type = 'button'; undo.textContent = '撤销上次已结算兑换'; undo.disabled = !config.history().length;
    const finish = doc.createElement('button'); finish.type = 'button'; finish.textContent = '结束本次商人交易';
    undo.addEventListener('click', async () => {
      if (busy || undo.disabled) return;
      busy = true; close.disabled = true;
      try { await config.undo(); dialog.close(); }
      catch (error) { root.alert(error.message || String(error)); }
      finally { busy = false; close.disabled = false; }
    });
    finish.addEventListener('click', () => { if (!busy) { config.assertContext?.(); config.finish(); dialog.close(); } });
    saved.append(undo, finish); dialog.appendChild(saved);
    config.parent.appendChild(dialog); dialog.showModal();
    dialog.ready = panel.ready;
    return dialog;
  }
  return { open, actionFor };
});
