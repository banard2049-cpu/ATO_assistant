(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_STRUCTURE_TECH_CLIENT = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const scriptUrl = root.document?.currentScript?.src;
  const baseUrl = scriptUrl ? new URL('../', scriptUrl).href : null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]`
    : object(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
      : JSON.stringify(value);
  function paymentLabel(operation, fallback = '') {
    const labels = (operation?.payment || []).map(payment => {
      if (payment.type === 'fate') return `命运 +${payment.amount}`;
      if (payment.type === 'resource') return `${payment.label || ({ 'c1-trireme': '船材', 'c2-warTrireme': '舰材' })[payment.storageKey] || payment.storageKey} ${Number(payment.amount) > 0 ? '+' : ''}${payment.amount}`;
      if (payment.type === 'titan') return `${payment.name || '梦行者'} ${payment.amount}`;
      if (payment.type === 'stat') return `${payment.label || payment.stat} ${payment.amount > 0 ? '+' : ''}${payment.amount}`;
      return '';
    }).filter(Boolean);
    // Temporary discard is a condition, rather than a numeric record payment.
    if (operation?.temporarilyDiscarded || operation?.selection?.tearConfirmed) labels.push('暂时弃置本卡');
    return labels.join('；') || fallback || '无代价';
  }
  function tradeRouteLabel(route, record) {
    if (!route.costs?.length || !route.gains?.length) return route.label || '';
    const format = entries => entries.map(entry => {
      const value = record?.resources?.[entry.storageKey];
      const stock = value === undefined ? 0 : (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value.trim()))
        && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : '?';
      return `${entry.amount} ${entry.label || entry.resource}（库存 ${stock}）`;
    }).join(' + ');
    return `${format(route.costs)} → ${format(route.gains)}`;
  }
  function grantLabel(grant) {
    if (!grant) return '';
    if (grant.skipped) return `未能自动结算：${grant.skipped}`;
    const name = grant.name || '所选泰坦';
    return grant.type === 'repair' ? `${name} 解除残废` : `+${Math.max(1, Number(grant.count) || 1)} ${name}`;
  }
  function appendOperationNote(state, operation, completing, context, referenceText) {
    const day = context.day;
    const label = text => referenceText?.(context, operation.techKey, text) ?? text;
    const applied = completing && Boolean(operation.grant?.applied);
    const parts = [completing ? (operation.scoutRestored ? '重建完成' : applied ? '已自动结算' : '已手动处理') : '使用', label(operation.label) || `${operation.techKey} · ${operation.actionId}`];
    if (completing && operation.scoutRestored) parts.push('地图侦察船已可用');
    if (operation.grant && !operation.skipTimeline) parts.push(`${applied ? '自动结算' : '到期自动结算'}：${grantLabel(operation.grant)}`);
    if (!completing) parts.push(`代价：${paymentLabel(operation)}`);
    if (!completing && operation.tradeSummary) parts.push(`兑换：${operation.tradeSummary}`);
    if (operation.targetLabel) parts.push(`目标：${operation.targetLabel}`);
    if (operation.rewardLabel) parts.push(label(operation.rewardLabel));
    if (operation.dueDay != null && !operation.skipTimeline) parts.push(`到期：D${operation.dueDay}`);
    if (Number(operation.cooldownUntilDay) > Number(operation.createdDay ?? day)) parts.push(`恢复：D${operation.cooldownUntilDay}`);
    const line = `[${new Date().toISOString()} ${context.cycleId.toUpperCase()} 第${day}天 · ${operation.noteCategory || '结构科技'}] ${parts.join('；').replace(/[\r\n]+/g, ' ')}`;
    const notes = typeof state.notes === 'string' ? state.notes : '';
    state.notes = notes + (notes && !notes.endsWith('\n') ? '\n' : '') + line;
  }
  function fail(message, code) { const error = new Error(message); error.code = code; return error; }
  function profileSection(section, profileId) {
    if (object(section) && ('users' in section || 'accounts' in section)) {
      return section.users?.[profileId] || section.accounts?.[profileId] || {};
    }
    return object(section) ? section : {};
  }
  function id() { return root.crypto?.randomUUID?.() || `tech-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function contextTarget(target) {
    if (!target || typeof target.profileId !== 'string' || !target.profileId.trim() || !/^c[1-5]$/.test(target.cycleId || '')) {
      throw fail('请先选择有效的战役档案和循环。', 'INVALID_CONTEXT');
    }
    return { profileId: target.profileId, cycleId: target.cycleId };
  }
  function create(options = {}) {
    const transport = options.fetch || root.fetch?.bind(root);
    const session = options.session || root.ATO_CAMPAIGN_SESSION?.create();
    if (!transport || !session) throw fail('科技自动化连接模块未加载，请刷新页面。', 'CLIENT_UNAVAILABLE');
    const rules = () => options.rules || root.ATO_STRUCTURE_TECH_RULES;
    const apiUrl = options.apiUrl || (baseUrl ? new URL('api/campaign-state.php', baseUrl).href : '/api/campaign-state.php');
    const dictionaryUrl = options.dictionaryUrl || (baseUrl ? new URL('technology/tech_card_dictionary.min.json', baseUrl).href : '/technology/tech_card_dictionary.min.json');
    let accountId = options.expectedAccountId || session.accountId || '';
    if (accountId && !session.accountId) session.accept?.({ user: { id: accountId } });
    let dictionaryPromise = null;
    function assertSession() {
      session.assertCurrent?.();
      if (session.changed) throw fail('登录账号已切换，请刷新页面后重试。', 'ACCOUNT_MISMATCH');
      if (accountId && session.accountId && accountId !== session.accountId) throw fail('登录账号已切换，请刷新页面后重试。', 'ACCOUNT_MISMATCH');
    }
    function accept(payload) {
      assertSession();
      if (payload?.code === 'ACCOUNT_MISMATCH') {
        session.accept?.(payload);
        throw fail('登录账号已切换，请刷新页面后重试。', 'ACCOUNT_MISMATCH');
      }
      const received = payload?.user?.id;
      if (received && accountId && received !== accountId) {
        // Let the shared page session also stop every other save path.
        try { session.accept?.(payload); } catch (error) { throw error; }
        throw fail('登录账号已切换，请刷新页面后重试。', 'ACCOUNT_MISMATCH');
      }
      session.accept?.(payload);
      if (received) accountId = received;
      assertSession();
      return payload;
    }
    async function readCampaign() {
      assertSession();
      const response = await transport(apiUrl, { cache: 'no-store' });
      const payload = accept(await response.json().catch(() => null));
      if (!response.ok || !payload?.ok || !object(payload.campaign)) {
        throw fail(payload?.error || '读取不到战役存档，操作尚未登记。', payload?.code || 'READ_FAILED');
      }
      if (!payload.user?.id || !accountId) throw fail('无法确认当前登录账号，请刷新页面。', 'AUTH_REQUIRED');
      return payload.campaign;
    }
    async function readDictionary() {
      if (!dictionaryPromise) dictionaryPromise = (async () => {
        const response = await transport(dictionaryUrl, { cache: 'no-store' });
        if (!response.ok) throw fail('科技卡字典读取失败，请恢复连接后重试。', 'DICTIONARY_UNAVAILABLE');
        const dictionary = await response.json();
        if (!object(dictionary)) throw fail('科技卡字典格式有误。', 'DICTIONARY_UNAVAILABLE');
        return dictionary;
      })().catch(error => { dictionaryPromise = null; throw error; });
      return dictionaryPromise;
    }
    function fromCampaign(campaign, dictionary, target) {
      const { profileId, cycleId } = contextTarget(target);
      const profile = campaign.sections?.dashboard?.profiles?.[profileId];
      if (!object(profile)) throw fail('原战役档案已不存在，请返回主控台后重试。', 'CAMPAIGN_CONTEXT_CHANGED');
      const cycleState = profile.cycles?.[cycleId]?.state;
      if (!object(cycleState)) throw fail('原循环档案已不存在，请返回主控台后重试。', 'CAMPAIGN_CONTEXT_CHANGED');
      return { campaign, dictionary, profileId, cycleId, cycle: cycleId, day: cycleState.day,
        state: copy(cycleState), mapState: profileSection(campaign.sections?.map, profileId),
        technology: profileSection(campaign.sections?.technology, profileId),
        record: profileSection(campaign.sections?.record, profileId),
        heroes: profileSection(campaign.sections?.heroes, profileId),
        map: profileSection(campaign.sections?.map, profileId),
        automationsByCycle: Object.fromEntries(Object.entries(profile.cycles || {}).map(([cycle, saved]) => [cycle, saved?.state?.techAutomation])),
        automation: cycleState.techAutomation || { version: 1, events: {} } };
    }
    async function load(target) {
      target = contextTarget(target);
      const [campaign, dictionary] = await Promise.all([readCampaign(), readDictionary()]);
      assertSession();
      return fromCampaign(campaign, dictionary, target);
    }
    function broadcast(campaign) {
      for (const [name, section] of [['ato-dashboard-sync-v1', 'dashboard'], ['ato-record-sync-v1', 'record'], ['ato-map-sync-v1', 'map']]) {
        let channel;
        try {
          channel = typeof root.BroadcastChannel === 'function' ? new root.BroadcastChannel(name) : null;
          channel?.postMessage({ revision: campaign.sectionRevisions?.[section] || 0, source: 'structure-tech' });
        } catch { /* Polling/focus sync also observes the new revisions. */ }
        finally { channel?.close(); }
      }
    }
    function existing(context, operationId, completing, target = {}) {
      const operation = context.automation?.events?.[operationId];
      const receipt = context.record.technologyActionReceipts?.[operationId];
      if (!operation && !receipt) return null;
      if (!operation || !receipt) throw fail('科技安排记录不完整，请刷新存档。', 'INCONSISTENT_OPERATION');
      const saved = operation || receipt;
      if ((saved.cycleId && saved.cycleId !== context.cycleId)
          || (target.techKey && saved.techKey && target.techKey !== saved.techKey)
          || (target.actionId && saved.actionId && target.actionId !== saved.actionId)) {
        throw fail('这个操作编号已属于另一项科技安排。', 'OPERATION_MISMATCH');
      }
      const savedSelection = receipt.request?.selection || operation.selection;
      if (!completing && savedSelection && stable(savedSelection) !== stable(target.selection || {})) {
        throw fail('这个操作编号已使用了不同的选项，请刷新存档确认原安排。', 'OPERATION_MISMATCH');
      }
      const selectedDraw = completing && operation.negotiationDraw?.selectedCard
        && Object.prototype.hasOwnProperty.call(target.selection || {}, 'cardId');
      if (selectedDraw && target.selection.cardId !== operation.negotiationDraw.selectedCard) {
        throw fail('此荒原商人已选择了另一张探索卡，请刷新存档确认。', 'OPERATION_MISMATCH');
      }
      if (completing && !selectedDraw && operation?.status !== 'completed' && receipt?.status !== 'completed') return null;
      return { campaign: context.campaign, operation: operation || receipt?.operation || receipt,
        receipt: receipt || operation, operationId, duplicate: true };
    }
    async function transact(target, completing) {
      // Bind mutable caller inputs before the first asynchronous read.
      target = { ...target, selection: copy(target.selection || {}) };
      contextTarget(target);
      const operationId = target.operationId || id();
      if (typeof operationId !== 'string' || !operationId.trim() || ['__proto__', 'prototype', 'constructor'].includes(operationId.trim())) {
        throw fail('操作编号无效。', 'INVALID_OPERATION');
      }
      const engine = rules();
      if (!engine?.prepareOperation || !engine?.completeOperation) throw fail('科技自动化规则未加载，请刷新页面。', 'RULES_UNAVAILABLE');
      let current = await load(target);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        assertSession();
        const previous = existing(current, operationId, completing, target);
        if (previous) { broadcast(current.campaign); return previous; }
        target.assertContext?.();
        if (target.expectedDay !== undefined && String(target.expectedDay) !== String(current.day)) {
          throw fail('当前航行日期已变化，请刷新科技能力后重试。', 'CAMPAIGN_CONTEXT_CHANGED');
        }
        const inputs = { ...current, techKey: target.techKey, actionId: target.actionId,
          selection: target.selection || {}, operationId };
        const result = (completing ? engine.completeOperation : engine.prepareOperation)(inputs);
        if (!result?.ok) throw fail(result?.message || '当前无法使用这项科技能力。', result?.code || 'ACTION_UNAVAILABLE');
        const dashboard = copy(current.campaign.sections.dashboard);
        const cycleState = dashboard.profiles[current.profileId].cycles[current.cycleId].state;
        if (result.state) Object.assign(cycleState, result.state);
        cycleState.techAutomation = result.automation;
        if (result.map) {
          const scout = engine.scoutStatus({ ...inputs, map: result.map });
          cycleState.mapSnapshot = { ...(cycleState.mapSnapshot || {}), scoutCount: scout.count, scoutTileId: scout.tileId,
            scoutTileLabel: scout.tileId ? cycleState.mapSnapshot?.scoutTileLabel || scout.tileId : "" };
        }
        appendOperationNote(cycleState, result.operation || result.event, completing, current, engine.referenceText);
        const revisions = current.campaign.sectionRevisions || {};
        const request = { userId: current.profileId, expectedAccountId: accountId,
          sections: { dashboard, record: result.record },
          expectedRevisions: Object.fromEntries(['dashboard', 'record', 'technology', 'heroes'].map(name => [name, Number(revisions[name] || 0)])) };
        for (const name of result.readSections || []) request.expectedRevisions[name] = Number(revisions[name] || 0);
        if ((result.operation || result.event)?.techKey?.split('@@')[0] === 'canal reconnaissance') {
          request.expectedRevisions.map = Number(revisions.map || 0);
        }
        if (result.map) request.sections.map = result.map;
        if (String(target.actionId).startsWith('negotiate-') || current.automation?.events?.[operationId]?.negotiation) request.expectedRevisions.map = Number(revisions.map || 0);
        if (result.mapState) request.sections.map = result.mapState;
        let response, payload;
        assertSession();
        target.assertContext?.();
        try {
          const separator = apiUrl.includes('?') ? '&' : '?';
          response = await transport(`${apiUrl}${separator}action=import-sections`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
          });
          payload = accept(await response.json().catch(() => null));
        } catch (error) {
          if (error.code === 'ACCOUNT_MISMATCH') throw error;
          // A request may have committed before its response was lost. Resolve
          // its identity before allowing any retry to charge resources again.
          try {
            const latest = await load(target);
            const committed = existing(latest, operationId, completing, target);
            if (committed) { broadcast(latest.campaign); return committed; }
          } catch (recovery) { if (recovery.code === 'ACCOUNT_MISMATCH') throw recovery; }
          throw fail(error.message || '连接中断，请恢复连接后重试。', error.code || 'NETWORK_ERROR');
        }
        if (response.status === 409 && payload?.code === 'SAVE_CONFLICT') {
          current = await load(target);
          continue;
        }
        if (!response.ok || !payload?.ok) {
          // Invalid/truncated success JSON is also an uncertain write outcome.
          const latest = await load(target);
          const committed = existing(latest, operationId, completing, target);
          if (committed) { broadcast(latest.campaign); return committed; }
          throw fail(payload?.error || '写入失败，操作尚未登记。', payload?.code || 'WRITE_FAILED');
        }
        const committed = copy(current.campaign);
        committed.sections.dashboard = dashboard;
        // API userId writes only the target record bucket, preserving others.
        const section = committed.sections.record;
        const bucket = object(section) && ('users' in section || 'accounts' in section)
          ? { ...section, users: { ...(section.accounts || {}), ...(section.users || {}), [current.profileId]: result.record } }
          : { users: { [current.profileId]: result.record } };
        delete bucket.accounts;
        committed.sections.record = bucket;
        if (result.map || result.mapState) {
          const mapSection = committed.sections.map;
          committed.sections.map = { ...(object(mapSection) && ('users' in mapSection || 'accounts' in mapSection) ? mapSection : {}),
            users: { ...(mapSection?.accounts || {}), ...(mapSection?.users || {}), [current.profileId]: result.map || result.mapState } };
          delete committed.sections.map.accounts;
        }
        committed.sectionRevisions = { ...revisions, ...payload.sections };
        committed.updatedAt = payload.updatedAt || committed.updatedAt;
        let latest = committed;
        try { latest = await readCampaign(); } catch (error) { if (error.code === 'ACCOUNT_MISMATCH') throw error; }
        broadcast(latest);
        return { campaign: latest, operation: result.operation || result.event, receipt: result.receipt, operationId };
      }
      const committed = existing(current, operationId, completing, target);
      if (committed) return committed;
      throw fail('其他页面持续修改存档，请稍后重试。', 'SAVE_CONFLICT');
    }
    const client = { load, submit: target => transact(target, false), complete: target => transact(target, true),
      createActionPanel: panelOptions => createActionPanel({ rules: rules(), ...panelOptions, client }),
      getActionPanel: panelOptions => createActionPanel({ rules: rules(), ...panelOptions, client }) };
    return client;
  }
  function createActionPanel(options) {
    const doc = root.document;
    if (!doc?.createElement) throw fail('当前环境不支持科技操作面板。', 'UI_UNAVAILABLE');
    const client = options.client;
    if (!client) throw fail('科技操作面板缺少连接。', 'CLIENT_UNAVAILABLE');
    const panel = doc.createElement('div');
    panel.className = 'structure-tech-actions';
    const previewLayouts = new WeakMap();
    const previewObserver = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(entries => {
      for (const { target } of entries) root.requestAnimationFrame(() => previewLayouts.get(target)?.());
    }) : null;
    panel.setAttribute('data-structure-tech-actions', '');
    const status = doc.createElement('p');
    status.className = 'structure-tech-action-status';
    status.setAttribute('role', 'status');
    status.textContent = '正在读取可用科技能力…';
    panel.appendChild(status);
    const body = doc.createElement('div');
    panel.appendChild(body);
    let context = null;
    let generation = 0;
    let cardDialog = null, cardDialogTitle = null, cardDialogImages = null;
    function showCardImages(sources, title) {
      if (!cardDialog) {
        cardDialog = doc.createElement('dialog');
        cardDialog.className = 'structure-tech-card-dialog';
        const header = doc.createElement('div');
        header.className = 'structure-tech-card-header';
        cardDialogTitle = doc.createElement('h3');
        const close = doc.createElement('button');
        close.type = 'button';
        close.className = 'structure-tech-card-close';
        close.textContent = '关闭';
        close.addEventListener('click', () => cardDialog.close());
        header.append(cardDialogTitle, close);
        cardDialogImages = doc.createElement('div');
        cardDialogImages.className = 'structure-tech-card-images';
        cardDialog.append(header, cardDialogImages);
        cardDialog.addEventListener('click', event => {
          if (event.target === cardDialog) cardDialog.close();
        });
        panel.appendChild(cardDialog);
      }
      cardDialogTitle.textContent = `${title} · 科技卡图`;
      cardDialog.setAttribute('aria-label', cardDialogTitle.textContent);
      cardDialogImages.replaceChildren();
      for (const source of sources) {
        const label = source.sourceLabel || source.title || source.techKey;
        const figure = doc.createElement('figure');
        const caption = doc.createElement('figcaption');
        caption.textContent = label;
        figure.appendChild(caption);
        const image = source.actions.find(action => action.image)?.image;
        if (image) {
          const img = doc.createElement('img');
          img.src = baseUrl ? new URL(`technology/${image}`, baseUrl).href : `/technology/${image}`;
          img.alt = `${label}科技卡`;
          figure.appendChild(img);
        } else {
          const note = doc.createElement('p');
          note.textContent = '暂无科技卡图。';
          figure.appendChild(note);
        }
        cardDialogImages.appendChild(figure);
      }
      if (!cardDialog.open) cardDialog.showModal();
    }
    function message(error) {
      status.textContent = String(error?.message || error);
      status.dataset.state = 'error';
      options.onError?.(error);
    }
    async function refresh(initialContext) {
      const token = ++generation;
      try {
        const loaded = initialContext?.campaign ? initialContext : await client.load(options);
        if (token !== generation) return;
        options.assertContext?.();
        if (loaded.profileId !== options.profileId || loaded.cycleId !== options.cycleId) {
          throw fail('科技能力与当前档案或循环不一致，请刷新页面。', 'CAMPAIGN_CONTEXT_CHANGED');
        }
        context = loaded;
        panel.context = context;
        options.onLoaded?.(context);
        const engine = options.rules || root.ATO_STRUCTURE_TECH_RULES;
        if (!engine?.listActionGroups && !engine?.listActions) throw fail('科技自动化规则未加载。', 'RULES_UNAVAILABLE');
        const inputs = { ...context, techKey: options.techKey, scope: options.scope };
        const groups = engine.listActionGroups ? engine.listActionGroups(inputs)
          : engine.listActions(inputs).map(action => ({ id: `${action.techKey}/${action.id || action.actionId}`, actions: [action] }));
        previewObserver?.disconnect();
        body.replaceChildren();
        status.textContent = groups.length ? '' : options.scope === 'negotiation' ? '当前循环没有已解锁的谈判能力。' : options.scope === 'exploration' ? '当前探索没有可用的科技能力。' : '当前没有可用的科技能力。';
        status.dataset.state = '';
        for (const group of groups) renderActionGroup(group, engine);
        renderNegotiationDraws(engine);
        return true;
      } catch (error) { if (token === generation) message(error); return false; }
    }
    function renderNegotiationDraws(engine) {
      if (options.scope !== 'negotiation' && !options.techKey) return;
      for (const event of Object.values(context.automation?.events || {})) {
        if (!event.negotiationDraw || event.negotiationDraw.selectedCard || event.status === 'completed' || event.cycleId !== context.cycleId
            || options.techKey && options.techKey !== event.techKey) continue;
        const row = doc.createElement('div'); row.className = 'structure-tech-action structure-tech-negotiation-draw';
        const title = doc.createElement('strong'); title.textContent = '荒原商人 · 选择一张探索卡'; row.appendChild(title);
        const choices = doc.createElement('div'); choices.className = 'structure-tech-negotiation-cards';
        for (const cardId of event.negotiationDraw.cards) {
          const label = doc.createElement('label'); label.className = 'structure-tech-negotiation-card';
          const input = doc.createElement('input'); input.type = 'radio'; input.name = `merchant-${event.id}`; input.value = cardId;
          const dataset = root.ATO_EXPLORATION_CARD_RESOURCES;
          const card = dataset?.cards?.[`${context.cycleId}:${cardId}`];
          label.append(input, doc.createTextNode(`${card?.titleZh || card?.titleEn || '探索卡'} #${cardId}`));
          const preview = options.explorationCardPreview?.(cardId);
          if (preview) label.appendChild(preview);
          choices.appendChild(label);
        }
        row.appendChild(choices);
        const note = doc.createElement('p'); note.textContent = '可获得资源或泰坦的卡会转入上方探索结算区；请使用已有的结算按钮处理整张卡。'; row.appendChild(note);
        const qualification = doc.createElement('select'); qualification.name = 'merchantQualification';
        for (const [value, text] of [['automatic', '按记录判断奖励条件'], ['qualifies', '已核对：实际获得资源或泰坦'], ['none', '已核对：没有资源或泰坦奖励']]) {
          const option = doc.createElement('option'); option.value = value; option.textContent = text; qualification.appendChild(option);
        }
        qualification.value = 'automatic';
        const confirmed = doc.createElement('input'); confirmed.type = 'checkbox'; confirmed.name = 'merchantQualificationConfirmed';
        const confirmLabel = doc.createElement('label'); confirmLabel.append(confirmed, doc.createTextNode('手动判断时，已核对所选卡全部奖励条件'));
        row.append(qualification, confirmLabel);
        const button = doc.createElement('button'); button.type = 'button'; button.className = 'structure-tech-action-use'; button.textContent = '确认选牌';
        let busy = false;
        button.addEventListener('click', async () => {
          if (busy) return;
          const selected = [...choices.querySelectorAll('input')].find(input => input.checked)?.value;
          if (!selected) { message('请先选择一张探索卡。'); return; }
          busy = true; button.disabled = true;
          try {
            options.assertContext?.(); await options.beforeSubmit?.();
            const result = await client.complete({ ...options, operationId: event.id, selection: { cardId: selected,
              qualificationResult: qualification.value, qualificationConfirmed: confirmed.checked }, expectedDay: context.day });
            await options.onCommitted?.(result); await refresh();
          } catch (error) { message(error); }
          finally { busy = false; button.disabled = false; }
        });
        row.appendChild(button); body.appendChild(row);
      }
    }
    function renderActionGroup(group, engine) {
      const actions = group.actions || [];
      if (!actions.length) return;
      const actionContext = context;
      const renderGeneration = generation;
      function assertContext() {
        if (renderGeneration !== generation) throw fail('科技面板已更新，请重新选择能力。', 'CAMPAIGN_CONTEXT_CHANGED');
        options.assertContext?.();
      }
      const row = doc.createElement('div');
      row.className = 'structure-tech-action';
      row.dataset.groupId = group.id || '';
      const cardTitle = doc.createElement('button');
      cardTitle.type = 'button';
      cardTitle.className = 'structure-tech-action-title flow-title-button';
      cardTitle.title = '查看科技卡图';
      cardTitle.setAttribute('aria-haspopup', 'dialog');
      const title = doc.createElement('strong');
      cardTitle.appendChild(title);
      row.appendChild(cardTitle);
      const sources = [];
      for (const action of actions) {
        let source = sources.find(item => item.techKey === action.techKey);
        if (!source) { source = { techKey: action.techKey, title: action.title, sourceLabel: action.sourceLabel, tier: 0, actions: [] }; sources.push(source); }
        source.actions.push(action);
        source.tier = Math.max(source.tier, Number(action.tier) || 0);
      }
      const available = action => !action.disabled && action.available !== false;
      sources.sort((a, b) => Number(b.actions.some(available)) - Number(a.actions.some(available)) || b.tier - a.tier);
      const sourceLabel = item => item.sourceLabel || item.title || item.techKey;
      const breeding = actions.every(item => item.sacrifice && item.models?.length);
      let source = sources[0], action = null;
      let sourceNode = null, modeNode = null, modelNode = null, selectedModel = '';
      let controls = [], tradeControls = [], automaticSelection = {};
      let pendingId = null, pendingSignature = null, busy = false;
      cardTitle.addEventListener('click', () => showCardImages(breeding && !selectedModel ? sources : [source], title.textContent));
      const selection = () => {
        const selected = { ...automaticSelection,
          ...Object.fromEntries(controls.map(({ key, node }) => [key, node.type === 'checkbox' ? node.checked : node.value])) };
        if (modelNode) selected.resultTitan = modelNode.value;
        if (action?.trade) selected.trades = tradeControls.map(({ route, count }) => ({ routeId: route.value, count: Number(count.value) }))
          .filter(item => item.routeId || item.count > 0);
        return selected;
      };
      const allControls = () => [sourceNode, modeNode, modelNode, ...controls.map(({ node }) => node), ...tradeControls.flatMap(({ route, count }) => [route, count])].filter(Boolean);
      function selector(labelText, name) {
        const label = doc.createElement('label');
        label.className = 'structure-tech-action-choice';
        const node = doc.createElement('select'); node.name = name;
        label.append(doc.createTextNode(`${labelText} `), node);
        row.appendChild(label);
        return node;
      }
      if (breeding) {
        modelNode = selector('生产泰坦', 'resultTitan');
        const placeholder = doc.createElement('option'); placeholder.value = ''; placeholder.textContent = '请选择要生产的泰坦…'; modelNode.appendChild(placeholder);
        const models = new Map();
        for (const item of sources) for (const option of item.actions[0].choices?.find(choice => choice.id === 'resultTitan')?.options || []) {
          if (!models.has(option.value)) models.set(option.value, { ...option, source: item });
        }
        for (const item of models.values()) {
          const option = doc.createElement('option'); option.value = item.value;
          const reason = item.source.actions.find(value => value.reason)?.reason;
          option.textContent = `${item.label}${item.source.actions.some(available) ? '' : `（${reason || '当前不可用'}）`}`;
          modelNode.appendChild(option);
        }
        modelNode.addEventListener('change', () => {
          if (busy) { modelNode.value = selectedModel; return; }
          const previous = selection(), previousMode = action?.id || action?.actionId;
          selectedModel = modelNode.value;
          source = sources.find(item => item.actions.some(value => value.models?.includes(selectedModel))) || sources[0];
          configureSource(previous, previousMode);
        });
      } else if (sources.length > 1) {
        sourceNode = selector('科技来源', 'techSource');
        for (const item of sources) {
          const option = doc.createElement('option'); option.value = item.techKey;
          const reason = item.actions.find(value => value.reason)?.reason;
          option.textContent = `${sourceLabel(item)}${item.actions.some(available) ? '' : `（${reason || '当前不可用'}）`}`;
          sourceNode.appendChild(option);
        }
        sourceNode.value = source.techKey;
        sourceNode.addEventListener('change', () => {
          if (busy) { sourceNode.value = source.techKey; return; }
          source = sources.find(item => item.techKey === sourceNode.value) || sources[0];
          configureSource();
        });
      }
      const modeContainer = doc.createElement('div');
      modeContainer.className = 'structure-tech-action-mode';
      row.appendChild(modeContainer);
      const fields = doc.createElement('div');
      fields.className = 'structure-tech-action-fields';
      row.appendChild(fields);
      function field(spec, confirmation, previous) {
        const label = doc.createElement('label');
        label.className = 'structure-tech-action-choice';
        let node;
        if (confirmation) { node = doc.createElement('input'); node.type = 'checkbox'; }
        else if (spec.type === 'text') { node = doc.createElement('input'); node.type = 'text'; node.maxLength = 160; }
        else if (spec.type === 'number') { node = doc.createElement('input'); node.type = 'number'; node.min = String(spec.min ?? 0); node.step = '1'; }
        else {
          node = doc.createElement('select');
          const placeholder = doc.createElement('option'); placeholder.value = ''; placeholder.textContent = '请选择…'; node.appendChild(placeholder);
          for (const value of spec.options || []) {
            const option = doc.createElement('option'); option.value = String(value.value); option.textContent = value.label; node.appendChild(option);
          }
        }
        node.name = spec.id;
        if (confirmation) node.checked = previous[spec.id] === true;
        else if (['text', 'number'].includes(spec.type) || (spec.options || []).some(value => String(value.value) === String(previous[spec.id] ?? spec.defaultValue))) {
          node.value = previous[spec.id] ?? spec.defaultValue ?? '';
        }
        if (confirmation) label.append(node, doc.createTextNode(spec.label));
        else label.append(doc.createTextNode(`${spec.label} `), node);
        controls.push({ key: spec.id, node });
        node.addEventListener('input', preview);
        node.addEventListener('change', () => {
          if (action.negotiation && (spec.id === 'location' || action.agents && spec.id === 'faction')) configureFields(selection());
          else preview();
        });
        fields.appendChild(label);
      }
      const description = doc.createElement('p');
      description.className = 'structure-tech-action-preview';
      row.appendChild(description);
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'structure-tech-action-use';
      button.textContent = '使用并添加到时间线';
      row.appendChild(button);
      function updatePreviewLayout() {
        if (!row.isConnected || typeof root.getComputedStyle !== 'function') return;
        delete description.dataset.wrap;
        if (root.getComputedStyle(row).display !== 'flex') return;
        const previewBounds = description.getBoundingClientRect();
        const buttonBounds = button.getBoundingClientRect();
        if (previewBounds.height && buttonBounds.top >= previewBounds.bottom) description.dataset.wrap = 'true';
      }
      previewLayouts.set(row, updatePreviewLayout);
      function configureFields(previous = {}) {
        controls = []; tradeControls = []; automaticSelection = {}; fields.replaceChildren();
        title.textContent = group.title
          ? [group.title, sources.length === 1 && sourceLabel(source) !== group.title ? sourceLabel(source) : ''].filter(Boolean).join(' · ')
          : [action.title, action.label].filter(Boolean).join(' · ');
        for (const choice of action.choices || []) {
          let spec = choice;
          if (choice.optionsByLocation) {
            const location = selection().location;
            if (!location) continue;
            spec = { ...choice, options: choice.optionsByLocation[location] || [] };
            if (!spec.options.length) {
              const note = doc.createElement('span'); note.className = 'structure-tech-action-choice';
              note.textContent = '当地派系未标注，请先在地图中补充。'; fields.appendChild(note);
              continue;
            }
          }
          if (action.agents && choice.id === 'otherFaction') spec = { ...choice,
            options: choice.options.filter(option => option.value !== selection().faction) };
          if ((action.negotiation && choice.id === 'location' || choice.optionsByLocation) && spec.options?.length === 1) {
            automaticSelection[choice.id] = spec.options[0].value;
            if (choice.optionsByLocation) {
              const note = doc.createElement('span'); note.className = 'structure-tech-action-choice';
              note.textContent = `${choice.label}：${spec.options[0].label}`; fields.appendChild(note);
            }
          } else if (!(breeding && choice.id === 'resultTitan')) field(spec, false, previous);
        }
        for (const confirmation of action.confirmations || []) field(confirmation, true, previous);
        if (action.trade) {
          const lines = doc.createElement('div'); lines.className = 'structure-tech-trade-lines';
          const maxTrades = action.maxTrades === null ? null : action.maxTrades || 3;
          const hint = doc.createElement('p');
          hint.className = 'structure-tech-trade-hint';
          hint.textContent = `${maxTrades === null ? '选择兑换项目和次数。' : `选择兑换项目和次数，本次合计至多 ${maxTrades} 次。`}按下列顺序兑换，任一笔不足则整次不生效。`;
          lines.appendChild(hint);
          for (let index = 0; index < 3; index += 1) {
            const line = doc.createElement('div'); line.className = 'structure-tech-trade-line';
            const routeLabel = doc.createElement('label'); routeLabel.className = 'structure-tech-action-choice';
            const route = doc.createElement('select'); route.name = `tradeRoute${index}`;
            const empty = doc.createElement('option'); empty.value = ''; empty.textContent = index ? '不兑换' : '请选择兑换项目…'; route.appendChild(empty);
            for (const item of action.tradeRoutes || []) {
              const option = doc.createElement('option'); option.value = item.id;
              option.textContent = tradeRouteLabel(item, actionContext.record); route.appendChild(option);
            }
            const countLabel = doc.createElement('label'); countLabel.className = 'structure-tech-action-choice';
            const count = doc.createElement('input'); count.type = 'number'; count.name = `tradeCount${index}`;
            count.min = '0'; if (maxTrades !== null) count.max = String(maxTrades); count.step = '1';
            const prior = previous.trades?.[index]; route.value = prior?.routeId || ''; count.value = String(prior?.count ?? 0);
            route.addEventListener('change', () => { if (route.value && Number(count.value) <= 0) count.value = '1'; if (!route.value) count.value = '0'; preview(); });
            count.addEventListener('input', preview); count.addEventListener('change', preview);
            routeLabel.append(doc.createTextNode(`兑换 ${index + 1} `), route); countLabel.append(doc.createTextNode('次数 '), count);
            line.append(routeLabel, countLabel); lines.appendChild(line); tradeControls.push({ route, count });
          }
          fields.appendChild(lines);
        }
        if (action.negotiation && engine.saveReminders) {
          const effects = Object.entries(action.effects || {}).map(([type, amount]) => ({ type, amount }));
          const reminders = engine.saveReminders(actionContext, effects);
          if (reminders.length) {
            const box = doc.createElement('div'); box.className = 'structure-save-reminder';
            for (const reminder of reminders) {
              const details = doc.createElement('details'), summary = doc.createElement('summary'), note = doc.createElement('p');
              summary.textContent = `可用豁免：${reminder.title}`;
              note.textContent = reminder.text || [reminder.condition, reminder.costLabel, reminder.check, reminder.effect].join('；');
              details.append(summary, note);
              for (const source of reminder.sources?.length ? reminder.sources : [reminder]) {
                if (!source.image) continue;
                const image = doc.createElement('img'); image.src = baseUrl ? new URL(`technology/${source.image}`, baseUrl).href : `/technology/${source.image}`;
                image.alt = source.title; image.style.cssText = 'max-width:240px;width:100%;height:auto'; details.appendChild(image);
              }
              box.appendChild(details);
            }
            fields.appendChild(box);
            for (const effect of effects) if (reminders.some(reminder => reminder.triggers?.[effect.type] === Math.sign(effect.amount))) {
              field({ id: `manual:${effect.type}`, label: `${({ strangers: '陌生人', babelianDebt: '巴比伦债务', paranoia: '猜忌', hull: '船体', crew: '船员', paradox: '悖论' })[effect.type] || effect.type}变化改为手动处理（豁免也由玩家处理）` }, true, previous);
            }
          }
        }
        button.textContent = action.negotiation ? '执行谈判' : action.trade ? (Number(action.days) > 0 ? '执行交易并记录冷却' : '执行交易') : action.immediate ? '使用科技能力' : '使用并添加到时间线';
        preview();
      }
      function configureSource(previous = {}, preferredMode) {
        modeContainer.replaceChildren(); modeNode = null;
        action = source.actions.find(item => (item.id || item.actionId) === preferredMode)
          || source.actions.find(item => (item.id || item.actionId) === 'breed' && available(item))
          || source.actions.find(available) || source.actions[0];
        if (source.actions.length > 1) {
          const label = doc.createElement('label'); label.className = 'structure-tech-action-choice';
          modeNode = doc.createElement('select'); modeNode.name = 'actionMode';
          for (const item of source.actions) {
            const option = doc.createElement('option'); option.value = item.id || item.actionId;
            const label = breeding ? ((item.id || item.actionId) === 'breed' ? '普通速度' : '快速速度') : item.label;
            option.textContent = `${label}${available(item) ? '' : `（${item.reason || '当前不可用'}）`}`;
            modeNode.appendChild(option);
          }
          modeNode.value = action.id || action.actionId;
          modeNode.addEventListener('change', () => {
            if (busy) { modeNode.value = action.id || action.actionId; return; }
            const previous = selection();
            action = source.actions.find(item => (item.id || item.actionId) === modeNode.value) || source.actions[0];
            configureFields(previous);
          });
          label.append(doc.createTextNode(breeding ? '生产速度 ' : '使用方式 '), modeNode); modeContainer.appendChild(label);
        }
        configureFields(previous);
      }
      function preview() {
        if (busy) return;
        if (breeding && !modelNode.value) {
          description.textContent = '请选择要生产的泰坦，查看代价和完成日期。'; button.disabled = true; updatePreviewLayout(); return;
        }
        const chosen = selection();
        const result = action.disabled || action.available === false ? { ok: false, message: action.reason || '当前不可用' }
          : (engine.previewOperation || engine.prepareOperation)({ ...actionContext, techKey: action.techKey, actionId: action.id || action.actionId,
            selection: chosen, operationId: 'preview-structure-tech-action' });
        const preparedEvent = result?.operation || result?.event;
        // Random draws reveal their result only after a committed operation.
        const event = action.hiddenOutcome || action.draw ? preparedEvent && { ...preparedEvent, rewardLabel: '', targetLabel: '' } : preparedEvent;
        const cost = event && !action.hiddenOutcome ? paymentLabel(event, action.costLabel) : action.costLabel;
        const costNode = doc.createElement('strong');
        costNode.className = 'structure-tech-action-cost';
        costNode.textContent = cost || '';
        const parts = [breeding ? `来源：${sourceLabel(source)}` : '', action.label, cost ? costNode : ''];
        // A printed effect summary sits right behind the price, so the row stays
        // readable before the target is chosen.
        if (action.effectLabel) parts.push(action.effectLabel);
        if (action.scoutLabel) parts.push(action.scoutLabel);
        const tradeSummary = (chosen.trades || []).map(trade => {
          const route = action.tradeRoutes?.find(item => item.id === trade.routeId);
          return route ? `${tradeRouteLabel(route, actionContext.record)} ×${trade.count}` : '';
        }).filter(Boolean).join('；') || event?.tradeSummary;
        if (tradeSummary) parts.push(`兑换：${tradeSummary}`);
        if (event?.targetLabel) parts.push(`目标：${event.targetLabel}`);
        if (event?.rewardLabel) parts.push(event.rewardLabel);
        if (event?.dueDay != null && !event.skipTimeline) parts.push(`到期：Day ${event.dueDay}`);
        if (Number(event?.cooldownUntilDay) > Number(event?.createdDay ?? actionContext.day)) parts.push(`恢复：Day ${event.cooldownUntilDay}`);
        if (!event && breeding) {
          const days = action.id === 'breed' && modelNode.value === 'tt_shadowdancer' ? 14 : action.days;
          if (Number.isFinite(Number(actionContext.day))) parts.push(`到期：Day ${Number(actionContext.day) + Number(days)}`);
          if (action.cooldownDays) parts.push(`恢复：Day ${Number(actionContext.day) + Number(action.cooldownDays)}`);
        }
        // An empty message means the picker itself already shows what is missing
        // (for example an unselected hero), so the preview stays quiet.
        if (!result?.ok && result?.message !== '') parts.push(result?.message || '请完成选项');
        description.replaceChildren();
        parts.filter(Boolean).forEach((part, index) => {
          if (index) description.appendChild(doc.createTextNode(' · '));
          description.appendChild(typeof part === 'string' ? doc.createTextNode(part) : part);
        });
        button.disabled = !result?.ok;
        updatePreviewLayout();
      }
      button.addEventListener('click', async () => {
        if (busy || button.disabled) return;
        busy = true; button.disabled = true;
        status.textContent = action.negotiation ? '正在结算谈判…' : action.trade ? '正在执行科技交易…' : action.immediate ? '正在执行科技能力…' : '正在写入科技安排…'; status.dataset.state = 'saving';
        const selected = selection();
        const selectedAction = action;
        const signature = stable({ techKey: selectedAction.techKey, actionId: selectedAction.id || selectedAction.actionId, selection: selected });
        if (!pendingId || signature !== pendingSignature) { pendingId = id(); pendingSignature = signature; }
        allControls().forEach(node => { node.disabled = true; });
        let committed = false;
        try {
          assertContext();
          await options.beforeSubmit?.();
          assertContext();
          const result = await client.submit({ profileId: options.profileId, cycleId: options.cycleId,
            techKey: selectedAction.techKey, actionId: selectedAction.id || selectedAction.actionId, selection: selected, operationId: pendingId,
            expectedDay: actionContext.day, assertContext });
          committed = true;
          pendingId = null;
          let displayError = null;
          try { assertContext(); await options.onCommitted?.(result); }
          catch (error) {
            displayError = fail(`安排已保存，页面刷新失败：${error.message || error}`, 'DISPLAY_REFRESH_FAILED');
            options.onError?.(displayError);
          }
          assertContext();
          if (await refresh()) {
            status.textContent = displayError?.message || (selectedAction.negotiation ? '谈判已结算并保存' : selectedAction.trade
              ? `交易已完成${Number(selectedAction.days) > 0 ? '，已记录冷却' : ''}` : selectedAction.immediate
                ? result.operation?.status === 'completed' ? '科技能力已结算并保存' : '代价已记录，请处理待办' : '已添加到时间线');
            status.dataset.state = displayError ? 'error' : 'saved';
          } else if (renderGeneration + 1 === generation) {
            status.textContent = `安排已保存；${status.textContent}`;
          }
        } catch (error) { message(error); }
        finally {
          busy = false;
          allControls().forEach(node => { node.disabled = committed; });
          if (committed) button.disabled = true;
          else preview();
        }
      });
      configureSource();
      body.appendChild(row);
      previewObserver?.observe(row);
    }
    panel.refresh = refresh;
    panel.ready = refresh(options.context);
    return panel;
  }
  return { create, createActionPanel, getActionPanel: createActionPanel, profileSection };
});
