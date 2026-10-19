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
  // Payment-first choices in merged voyage groups: one box per cost resource.
  const resourceChoices = {
    priests: { label: '祭司', icon: 'record/assets/resource-icons/priests.png' },
    crew: { label: '船员', icon: 'assets/icons/crew.svg' },
    hull: { label: '船体', icon: 'assets/icons/hull.svg' },
    fate: { label: '命运', icon: 'assets/icons/argo-fate.svg' },
    babelianDebt: { label: '巴比伦债务', icon: 'assets/icons/babelian-debt.svg' },
    frozenTime: { label: '凝固时光', icon: 'assets/icons/frozen-time.svg' },
    paradox: { label: '悖论', icon: 'assets/icons/paradox.svg' },
    refugees: { label: '难民', icon: 'assets/icons/refugees.svg' },
    captives: { label: '俘虏', icon: 'assets/icons/captives.svg' },
  };
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
    // Resolve fetch at call time: the dashboard may wrap window.fetch after this
    // client is created (request logging, offline detection, tests).
    const transport = options.fetch || (typeof root.fetch === 'function' ? ((url, init) => root.fetch(url, init)) : null);
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
          channel?.postMessage({ revision: campaign.sectionRevisions?.[section] || 0, source: 'structure-tech', pageId: options.pageId });
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
    async function transact(target, completing, options = {}) {
      // Bind mutable caller inputs before the first asynchronous read.
      target = { ...target, selection: copy(target.selection || {}) };
      contextTarget(target);
      const operationId = target.operationId || id();
      if (typeof operationId !== 'string' || !operationId.trim() || ['__proto__', 'prototype', 'constructor'].includes(operationId.trim())) {
        throw fail('操作编号无效。', 'INVALID_OPERATION');
      }
      const engine = rules();
      if (!engine?.prepareOperation || !engine?.completeOperation) throw fail('科技自动化规则未加载，请刷新页面。', 'RULES_UNAVAILABLE');
      // Callers that already hold a fresh context can pass it in: the transaction
      // then reuses it instead of re-reading the whole campaign. Such a caller
      // supplies its own local dashboard/record draft, so a conflict must be
      // surfaced instead of retrying with a possibly stale draft.
      let current = options.current || await load(target);
      const maxAttempts = options.current ? 1 : 3;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
          if (options.current) throw fail('其他页面同时修改了存档，请重试。', 'SAVE_CONFLICT');
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
        // The revision-checked POST already confirms this exact draft. A caller
        // that immediately finishes a round can use it without downloading the
        // whole campaign again. Uncertain responses still take the recovery
        // path above, regardless of this option.
        if (options.refreshAfterCommit !== false) {
          try { latest = await readCampaign(); } catch (error) { if (error.code === 'ACCOUNT_MISMATCH') throw error; }
        }
        broadcast(latest);
        return { campaign: latest, operation: result.operation || result.event, receipt: result.receipt, operationId };
      }
      const committed = existing(current, operationId, completing, target);
      if (committed) return committed;
      throw fail('其他页面持续修改存档，请稍后重试。', 'SAVE_CONFLICT');
    }
    const client = { load, submit: (target, options) => transact(target, false, options),
      complete: (target, options) => transact(target, true, options),
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
    // Negotiation uses the same collapsible rows as the voyage technology list:
    // the reminder itself stays a summary, and every ability becomes a details row.
    const compactGroups = (options.scope === 'voyage' || options.scope === 'negotiation') && !options.techKey;
    const disclosures = new Map();
    const initiallyExpanded = new Set(options.expandedGroups || []);
    if (compactGroups) panel.dataset.layout = 'grouped';
    panel.expandedGroups = () => [...disclosures].filter(([, node]) => node.open).map(([key]) => key);
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
        const expanded = new Set(disclosures.size ? panel.expandedGroups() : initiallyExpanded);
        disclosures.clear();
        body.replaceChildren();
        status.textContent = groups.length ? '' : options.scope === 'negotiation' ? '当前循环没有已解锁的谈判能力。' : options.scope === 'exploration' ? '当前探索没有可用的科技能力。' : '当前没有可用的科技能力。';
        status.dataset.state = '';
        if (compactGroups && options.scope === 'negotiation') {
          for (const group of groups) renderActionGroup(group, engine, body, expanded);
        } else if (compactGroups) {
          const categories = [
            { title: '泰坦与英雄', groups: [] },
            { title: '贸易与航行', groups: [] },
            { title: '命运与恢复', groups: [] },
          ];
          for (const group of groups) {
            const actions = group.actions || [];
            if (!actions.length) continue;
            const people = actions.some(action => action.sacrifice || action.target || action.repair
              || action.grant?.type === 'titan' || ['titan-enhancement', 'mnestis training'].includes(action.groupKey));
            const voyage = actions.some(action => action.trade || action.rebuild || action.draw || action.groupKey?.startsWith('exploration-tech:'));
            categories[people ? 0 : voyage ? 1 : 2].groups.push(group);
          }
          for (const category of categories) {
            if (!category.groups.length) continue;
            const section = doc.createElement('section');
            section.className = 'structure-tech-category';
            section.setAttribute('aria-label', category.title);
            const heading = doc.createElement('h4');
            heading.className = 'structure-tech-category-title';
            heading.textContent = category.title;
            const count = doc.createElement('span'); count.textContent = String(category.groups.length);
            heading.appendChild(count); section.appendChild(heading); body.appendChild(section);
            for (const group of category.groups) renderActionGroup(group, engine, section, expanded);
          }
        } else for (const group of groups) renderActionGroup(group, engine);
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
    function renderActionGroup(group, engine, container = body, expanded = new Set()) {
      const actions = group.actions || [];
      if (!actions.length) return;
      // Describe the group's purpose, independently of the selected payment or date.
      const purpose = actions.every(action => action.trade) ? '按比例交换资源'
        : actions.every(action => action.sacrifice) ? '培育新的泰坦'
        : group.id === 'voyage:replenish' ? (actions.every(action => action.restore === 'charge')
          ? '恢复已消耗的召唤充能' : '恢复召唤或神之形态')
        : ({
          'mnestis thesis': '为英雄增加回忆节点',
          'grand stoa': '培育梦行者泰坦',
          'titan-enhancement': '训练或移植泰坦式样卡',
          'trauma growth': '修复残废泰坦',
          'canal reconnaissance': '重建赫米奥拉侦察船',
          'the work is never done': '到期取回本科技卡',
          'mnestis training': '进行记忆模拟战斗',
          'voyage:fate': '降低阿尔戈号命运',
          'voyage:recruitment': '将难民转为船员',
          'voyage:loop-length': '延长当前轮回',
          'voyage:loop-effect': '立即结算轮回效果',
          'exploration-tech:salvage operations': '抽探索卡，按奖励条件结算',
          'exploration-tech:argo initiative': '将招募行动加入探索牌堆',
          'negotiation:sustainable oasis': '绿洲休整、消债或生产梦行者',
          'negotiation:curse exchange': '用命运与债务换取休整、船员或船体',
          'negotiation:plutocratic diplomacy': '用资源或债务改善外交',
          'negotiation:the dreamed torus': '绿洲消债或治疗诅咒',
          'negotiation:grassroots diplomacy': '改善当地或任意派系外交',
          'negotiation:curse economy basics': '用诅咒卡减少巴比伦债务',
          'negotiation:temporal aegis': '降低悖论',
          'negotiation:alliance contacts': '改善当地外交',
          'negotiation:grassroot support': '获得进展',
          'negotiation:scientific debunking': '降低猜忌',
          'negotiation:cyclades information circulation': '获得进展与猜忌',
          'negotiation:moirai rebellion': '降低阿尔戈号命运',
          'negotiation:atlantean maintenance procedures': '修复船体',
        })[group.id] || actions[0].effectLabel || actions[0].rewardLabel || actions[0].label || '查看科技能力';
      const actionContext = context;
      const renderGeneration = generation;
      function assertContext() {
        if (renderGeneration !== generation) throw fail('科技面板已更新，请重新选择能力。', 'CAMPAIGN_CONTEXT_CHANGED');
        options.assertContext?.();
      }
      const row = doc.createElement('div');
      row.className = 'structure-tech-action';
      row.dataset.groupId = group.id || '';
      let disclosure, summaryTitle, summaryMeta, summaryState;
      if (compactGroups) {
        const groupId = group.id || `${actions[0].techKey}/${actions[0].id || actions[0].actionId}`;
        disclosure = doc.createElement('details');
        disclosure.className = 'structure-tech-entry';
        disclosure.dataset.groupId = groupId;
        disclosure.open = expanded.has(groupId);
        const summary = doc.createElement('summary');
        summaryTitle = doc.createElement('span'); summaryTitle.className = 'structure-tech-entry-title';
        summaryMeta = doc.createElement('span'); summaryMeta.className = 'structure-tech-entry-meta';
        summaryMeta.textContent = purpose;
        summaryMeta.title = purpose;
        summaryState = doc.createElement('span'); summaryState.className = 'structure-tech-entry-state';
        summary.append(summaryTitle, summaryMeta, summaryState);
        disclosure.append(summary, row);
        disclosures.set(groupId, disclosure);
        disclosure.addEventListener('toggle', () => { if (disclosure.open) updatePreviewLayout(); });
      }
      const cardTitle = doc.createElement('button');
      cardTitle.type = 'button';
      cardTitle.className = `structure-tech-action-title${compactGroups ? '' : ' flow-title-button'}`;
      cardTitle.title = '查看科技卡图';
      cardTitle.setAttribute('aria-haspopup', 'dialog');
      const title = doc.createElement('strong');
      cardTitle.appendChild(title);
      const sourceCaption = compactGroups ? doc.createElement('span') : null;
      if (compactGroups) {
        const header = doc.createElement('div'); header.className = 'structure-tech-action-header';
        sourceCaption.className = 'structure-tech-action-source';
        header.append(sourceCaption, cardTitle); row.appendChild(header);
      } else row.appendChild(cardTitle);
      const form = compactGroups ? doc.createElement('div') : row;
      if (compactGroups) { form.className = 'structure-tech-action-form'; row.appendChild(form); }
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
      const recruitment = compactGroups && group.id === 'voyage:recruitment';
      let source = sources[0], action = null;
      let sourceNode = null, sourceSummary = null, modeNode = null, modelNode = null, selectedModel = '';
      let controls = [], tradeControls = [], automaticSelection = {}, tradeDraft = [], updateTrade = null, choiceCards = [];
      let pendingId = null, pendingSignature = null, busy = false, actionTiles = false;
      const modelCards = [], actionCards = [], sourcePicks = [], recruitmentChoices = [];
      let modeCards = [];
      // Resource payments (Alliance Contacts and friends) render as clickable
      // tiles, but keep their hidden number inputs as the validated value.
      let resourcePayment = null, resourceTiles = [], resourceHistory = [];
      cardTitle.addEventListener('click', () => showCardImages(breeding && !selectedModel ? sources : [source],
        compactGroups ? group.title || sourceLabel(source) : title.textContent));
      const selection = () => {
        const selected = { ...automaticSelection,
          ...Object.fromEntries(controls.map(({ key, node }) => [key, node.type === 'checkbox' ? node.checked : node.value])) };
        if (modelNode) selected.resultTitan = modelNode.value;
        if (action?.trade) selected.tradeSteps = tradeDraft.flatMap(batch => batch.steps.map(step => ({ ...step })));
        return selected;
      };
      const allControls = () => [sourceNode, modeNode, modelNode, ...controls.map(({ node }) => node), ...tradeControls, ...choiceCards.map(item => item.button), ...modelCards.map(item => item.button), ...modeCards.map(item => item.button), ...actionCards.map(item => item.button), ...sourcePicks.map(item => item.button), ...recruitmentChoices.map(item => item.button)].filter(Boolean);
      function selector(labelText, name, container = form) {
        const label = doc.createElement('label');
        label.className = container === sourceCaption ? 'structure-tech-action-source-choice' : 'structure-tech-action-choice';
        const node = doc.createElement('select'); node.name = name;
        label.append(doc.createTextNode(`${labelText} `), node);
        container.appendChild(label);
        node.choiceLabel = label;
        return node;
      }
      if (breeding) {
        modelNode = selector('生产泰坦', 'resultTitan');
        modelNode.hidden = true;
        const modelLabel = form.children[form.children.length - 1]; modelLabel.hidden = true;
        const gallery = doc.createElement('div'); gallery.className = 'structure-tech-visual-choice structure-tech-titan-models';
        const heading = doc.createElement('strong'); heading.textContent = '生产泰坦';
        const tiles = doc.createElement('div'); tiles.className = 'structure-tech-visual-options';
        tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-label', '生产泰坦');
        gallery.append(heading, tiles); form.appendChild(gallery);
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
          const pick = doc.createElement('button'); pick.type = 'button'; pick.className = 'structure-tech-visual-option';
          pick.name = `choice:resultTitan:${item.value}`;
          pick.title = option.textContent;
          pick.dataset.available = String(item.source.actions.some(available));
          const portrait = doc.createElement('img'); portrait.alt = ''; portrait.className = 'structure-tech-titan-portrait';
          const path = `technology/images/titans/${encodeURIComponent(item.value)}.png?v=20261019-tts-portrait1`;
          portrait.src = baseUrl ? new URL(path, baseUrl).href : `/${path}`;
          const caption = doc.createElement('span'); caption.textContent = item.label;
          const note = doc.createElement('small'); note.textContent = item.source.actions.some(available) ? sourceLabel(item.source) : reason || '当前不可用';
          portrait.addEventListener('error', () => { portrait.hidden = true; });
          pick.append(portrait, caption, note); tiles.appendChild(pick);
          modelCards.push({ button: pick, value: String(item.value) });
          pick.addEventListener('click', () => {
            if (busy || pick.disabled) return;
            modelNode.value = String(item.value); selectModel();
          });
        }
        function selectModel() {
          if (busy) { modelNode.value = selectedModel; return; }
          const previous = selection(), previousMode = action?.id || action?.actionId;
          selectedModel = modelNode.value;
          source = sources.find(item => item.actions.some(value => value.models?.includes(selectedModel))) || sources[0];
          configureSource(previous, previousMode);
        }
        modelNode.addEventListener('change', selectModel);
      } else if (sources.length > 1) {
        sourceNode = compactGroups ? selector('来源：', 'techSource', sourceCaption) : selector('科技来源', 'techSource');
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
        if (compactGroups && group.id === 'voyage:fate') {
          // Only 调整命运 shows one box per printed payment (the source card
          // and its fate change sit underneath). Every other merged group,
          // including 泰坦强化 and 贸易, keeps its normal source dropdown.
          const primary = value => Object.keys(value.cost || {})[0] || '';
          const flattened = sources.flatMap(item => item.actions.map(next => ({ source: item, action: next, resource: primary(next) })));
          const resources = flattened.map(item => item.resource);
          if (resources.every(Boolean) && new Set(resources).size === resources.length) {
            actionTiles = true;
            if (sourceNode.choiceLabel) sourceNode.choiceLabel.hidden = true;
            sourceNode.hidden = true;
            sourceSummary = doc.createElement('span');
            sourceCaption.appendChild(sourceSummary);
            const gallery = doc.createElement('div');
            gallery.className = 'structure-tech-visual-choice structure-tech-source-choice';
            const heading = doc.createElement('strong'); heading.textContent = '选择代价';
            const tiles = doc.createElement('div'); tiles.className = 'structure-tech-visual-options';
            tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-label', heading.textContent);
            for (const item of flattened) {
              const sourceItem = item.source;
              const usable = available(item.action);
              const pick = doc.createElement('button'); pick.type = 'button'; pick.className = 'structure-tech-visual-option';
              pick.name = `choice:voyageAction:${item.action.id || item.action.actionId}`;
              pick.dataset.available = String(usable);
              pick.title = [item.action.label, item.action.description, usable ? '' : item.action.reason || '当前不可用',
                sourceLabel(sourceItem)].filter(Boolean).join('；');
              const meta = resourceChoices[item.resource] || { label: item.action.label || item.resource, icon: 'assets/icons/technology.svg' };
              const image = doc.createElement('img'); image.alt = ''; image.className = 'structure-tech-source-icon';
              image.src = baseUrl ? new URL(meta.icon, baseUrl).href : `/${meta.icon}`;
              const fallback = doc.createElement('span'); fallback.className = 'structure-tech-choice-fallback';
              fallback.textContent = meta.label.slice(0, 1); fallback.hidden = true;
              image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
              const text = doc.createElement('span'); text.className = 'structure-tech-source-text';
              const caption = doc.createElement('span'); caption.textContent = meta.label;
              // The printed effect matters as much as the card: 消除偶然性 pays
              // 1 crew/hull for −2 fate, while 被遗弃的方舟 pays 1 priest for −1.
              const effect = Object.entries(item.action.effects || {})
                .map(([type, amount]) => `${resourceChoices[type]?.label || type} ${amount > 0 ? '+' : ''}${amount}`).join('；');
              const note = doc.createElement('small');
              note.textContent = [`来源：${sourceLabel(sourceItem)}`, effect].filter(Boolean).join(' · ');
              text.append(caption, note); pick.append(image, fallback, text);
              pick.addEventListener('click', () => {
                if (busy || pick.disabled) return;
                sourceNode.value = sourceItem.techKey; source = sourceItem;
                configureSource({}, item.action.id || item.action.actionId);
              });
              actionCards.push({ button: pick, sourceKey: sourceItem.techKey, actionId: item.action.id || item.action.actionId });
              tiles.appendChild(pick);
            }
            gallery.append(heading, tiles); form.appendChild(gallery);
          }
        }
        if (compactGroups && group.id !== 'voyage:fate') {
          // Every compact merged group keeps the “来源：” row and replaces its
          // dropdown with side-by-side buttons for the usable source cards
          // (泰坦强化、贸易、恢复力量…). 调整命运 has its own payment boxes.
          sourceNode.hidden = true;
          const chooser = doc.createElement('span');
          chooser.className = 'structure-tech-source-toggle';
          chooser.setAttribute('role', 'group');
          chooser.setAttribute('aria-label', '来源科技');
          for (const item of sources) {
            const usable = item.actions.some(available);
            const reason = item.actions.find(value => value.reason)?.reason;
            const pick = doc.createElement('button'); pick.type = 'button';
            pick.className = 'structure-tech-source-pick';
            pick.name = `choice:techSource:${item.techKey}`;
            pick.textContent = sourceLabel(item);
            pick.dataset.available = String(usable);
            pick.title = [sourceLabel(item), usable ? '' : reason || '当前不可用'].filter(Boolean).join('；');
            pick.addEventListener('click', () => {
              if (busy || pick.disabled || sourceNode.value === item.techKey) return;
              sourceNode.value = item.techKey; source = item; configureSource();
            });
            sourcePicks.push({ button: pick, value: item.techKey });
            chooser.appendChild(pick);
          }
          sourceCaption.appendChild(chooser);
        }
      }
      const modeContainer = doc.createElement('div');
      modeContainer.className = 'structure-tech-action-mode';
      form.appendChild(modeContainer);
      const fields = doc.createElement('div');
      fields.className = 'structure-tech-action-fields';
      form.appendChild(fields);
      const breedingSettings = breeding ? doc.createElement('div') : null;
      if (breedingSettings) {
        breedingSettings.className = 'structure-tech-breeding-settings';
        breedingSettings.append(modeContainer, fields);
        row.appendChild(breedingSettings);
      }
      // Alliance Contacts and the other resource payments read better as
      // clickable tiles: one click invests one point, and the hidden number
      // input remains the single value the rules validate.
      function resourcePaymentBox(spec) {
        if (resourcePayment) return resourcePayment;
        const box = doc.createElement('div');
        box.className = 'structure-tech-resource-payment';
        const head = doc.createElement('div');
        head.className = 'structure-tech-resource-payment-head';
        const heading = doc.createElement('strong');
        heading.textContent = '投入资源';
        const state = doc.createElement('span');
        state.className = 'structure-tech-resource-payment-total';
        head.append(heading, state);
        const list = doc.createElement('div');
        list.className = 'structure-tech-resource-tiles';
        list.setAttribute('role', 'group');
        list.setAttribute('aria-label', '投入资源');
        const footer = doc.createElement('div');
        footer.className = 'structure-tech-resource-payment-actions';
        const undo = doc.createElement('button');
        undo.type = 'button'; undo.name = 'payUndo'; undo.textContent = '撤销投入';
        const clear = doc.createElement('button');
        clear.type = 'button'; clear.name = 'payClear'; clear.textContent = '清空投入';
        const hint = doc.createElement('span');
        hint.className = 'structure-tech-resource-payment-hint';
        hint.textContent = '点击资源图标投入 1 个';
        footer.append(undo, clear, hint);
        box.append(head, list, footer);
        fields.appendChild(box);
        resourcePayment = { box, list, state, undo, clear,
          required: Number.isInteger(spec.tileTotal) ? spec.tileTotal : null,
          fromFaction: spec.tileTotalFrom === 'faction' };
        undo.addEventListener('click', () => {
          if (busy || undo.disabled) return;
          const item = resourceHistory.pop();
          if (item) item.node.value = String(Math.max(0, (Number(item.node.value) || 0) - 1));
          preview();
        });
        clear.addEventListener('click', () => {
          if (busy || clear.disabled) return;
          for (const item of resourceTiles) item.node.value = '0';
          resourceHistory = [];
          preview();
        });
        return resourcePayment;
      }
      function payTotal() {
        return resourceTiles.reduce((sum, item) => sum + (Number(item.node.value) || 0), 0);
      }
      function payRequired() {
        if (!resourcePayment) return null;
        if (!resourcePayment.fromFaction) return resourcePayment.required;
        const faction = selection().faction;
        const value = faction ? engine.factionRelation?.(actionContext, faction) : null;
        return Number.isInteger(value) && value >= 0 ? value : null;
      }
      function updateResourcePayment() {
        if (!resourcePayment) return;
        const required = payRequired(), total = payTotal();
        resourcePayment.state.textContent = required === null ? `已投入 ${total}` : `已投入 ${total} / ${required}`;
        resourcePayment.state.dataset.complete = String(required !== null && total === required);
        for (const item of resourceTiles) {
          const count = Number(item.node.value) || 0, stock = item.spec.tile.stock;
          item.count.textContent = String(count);
          item.button.dataset.count = String(count);
          item.button.dataset.available = String(stock > 0);
          item.button.setAttribute('aria-pressed', String(count > 0));
          item.button.setAttribute('aria-label', `${item.spec.tile.name}，库存 ${stock}，已投入 ${count}`);
          item.button.disabled = busy || stock <= 0;
        }
        resourcePayment.undo.disabled = busy || !resourceHistory.length;
        resourcePayment.clear.disabled = busy || !total;
      }
      function resourceTile(spec, node) {
        const box = resourcePaymentBox(spec);
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'structure-tech-resource-tile';
        button.name = `choice:${spec.id}`;
        button.dataset.count = '0';
        const image = doc.createElement('img');
        image.className = 'structure-tech-resource-icon';
        image.alt = '';
        const path = `record/assets/resource-icons/${encodeURIComponent(spec.tile.resource)}.png`;
        image.src = baseUrl ? new URL(path, baseUrl).href : `/${path}`;
        image.addEventListener('error', () => { image.hidden = true; });
        const name = doc.createElement('span');
        name.className = 'structure-tech-resource-name';
        name.textContent = spec.tile.name;
        const stock = doc.createElement('span');
        stock.className = 'structure-tech-resource-stock';
        stock.textContent = `库存 ${spec.tile.stock}`;
        const count = doc.createElement('span');
        count.className = 'structure-tech-resource-count';
        count.textContent = '0';
        button.append(image, name, stock, count);
        button.addEventListener('click', () => {
          if (busy || button.disabled) return;
          const current = Number(node.value) || 0, required = payRequired();
          if (current >= spec.tile.stock) return;
          if (required !== null && payTotal() >= required) return;
          node.value = String(current + 1);
          resourceHistory.push({ node });
          preview();
        });
        node.hidden = true;
        box.list.appendChild(button);
        box.box.appendChild(node);
        resourceTiles.push({ spec, node, button, count });
      }
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
        node.choiceLabel = label;
        if (!confirmation && spec.tile) {
          node.addEventListener('input', preview);
          node.addEventListener('change', preview);
          resourceTile(spec, node);
          return;
        }
        if (recruitment && (spec.id === 'checkResult' || spec.id === 'convertRefugee')) { label.hidden = true; node.hidden = true; }
        if (!confirmation && spec.type === 'select' && (action.choices || []).length === 1
          && (action.target === 'hero' && spec.id === 'targetId' || spec.id === 'titanId' || action.rebuild && spec.id === 'payment')) {
          const group = doc.createElement('div'); group.className = 'structure-tech-visual-choice';
          const heading = doc.createElement('strong'); heading.textContent = spec.label;
          const list = doc.createElement('div'); list.className = 'structure-tech-visual-options';
          list.setAttribute('role', 'group'); list.setAttribute('aria-label', spec.label);
          label.hidden = true; node.hidden = true;
          for (const option of spec.options || []) {
            const pick = doc.createElement('button'); pick.type = 'button'; pick.className = 'structure-tech-visual-option';
            pick.name = `choice:${spec.id}:${option.value}`;
            const heroes = Array.isArray(actionContext.heroes) ? actionContext.heroes : actionContext.heroes?.heroes || [];
            const hero = spec.id === 'targetId' && action.target === 'hero' ? heroes.find(item => String(item.id) === String(option.value)) : null;
            const portraits = { odys: '01', circe: '02', phenelope: '03', telebac: '04', herakleides: '05', olympia: '06', leocules: '07', raz: '08', fisher: '09', hypatia: '17', anakreon: '18', anathea: '19', orphan: '20', aster: '21', dastan: '22', aktisaeos: '23', oleander: '24', omorfos: '25' };
            const argonaut = hero?.argonaut;
            const portrait = portraits[argonaut] ? `argonaut_${portraits[argonaut]}_${argonaut}.png`
              : /^blank1[0-6]$/.test(argonaut || '') ? `argonaut_${argonaut.slice(5)}_blank.png` : null;
            const resource = /^c[1-5]-/.test(String(option.value)) ? String(option.value).replace(/^c[1-5]-/, '') : null;
            const path = hero ? portrait ? `hero/assets/${portrait}` : 'assets/icons/argonauts.svg'
              : resource ? `record/assets/resource-icons/${encodeURIComponent(resource)}.png` : 'assets/icons/titans.svg';
            const image = doc.createElement('img'); image.alt = ''; image.className = hero ? 'structure-tech-choice-portrait' : 'structure-tech-choice-icon';
            image.src = baseUrl ? new URL(path, baseUrl).href : `/${path}`;
            const fallback = doc.createElement('span'); fallback.className = 'structure-tech-choice-fallback'; fallback.textContent = option.label.slice(0, 1); fallback.hidden = true;
            image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
            const text = doc.createElement('span'); text.textContent = option.label;
            pick.append(image, fallback, text);
            pick.addEventListener('click', () => { if (!busy && !pick.disabled) { node.value = String(option.value); preview(); } });
            choiceCards.push({ button: pick, node, value: String(option.value) }); list.appendChild(pick);
          }
          if (!spec.options?.length) { const empty = doc.createElement('p'); empty.textContent = `暂无可选${spec.label}`; list.appendChild(empty); }
          group.append(heading, list); fields.appendChild(group);
        }
        node.addEventListener('input', preview);
        node.addEventListener('change', () => {
          if (action.negotiation && (spec.id === 'location' || action.agents && spec.id === 'faction')) configureFields(selection());
          else preview();
        });
        fields.appendChild(label);
      }
      const description = doc.createElement(compactGroups ? 'div' : 'p');
      description.className = 'structure-tech-action-preview';
      row.appendChild(description);
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'structure-tech-action-use';
      button.textContent = '使用并添加到时间线';
      const timelineNote = compactGroups ? doc.createElement('span') : null;
      if (timelineNote) {
        timelineNote.className = 'structure-tech-action-timeline-note';
        row.appendChild(timelineNote);
      }
      row.appendChild(button);
      const recruitmentBox = recruitment ? doc.createElement('div') : null;
      if (recruitmentBox) {
        // 招聘项目: the effect is introduced on the left, and the two printed
        // outcomes are direct action buttons on the right. Success converts one
        // refugee; failure still pays the fate cost.
        recruitmentBox.className = 'structure-tech-recruitment-actions';
        button.hidden = true;
        const outcomeButtons = doc.createElement('div');
        outcomeButtons.className = 'structure-tech-recruitment-buttons';
        recruitmentBox.appendChild(outcomeButtons);
        for (const [result, text] of [['success', '转换成功'], ['failure', '转换失败']]) {
          const pick = doc.createElement('button');
          pick.type = 'button';
          pick.className = 'structure-tech-recruitment-choice';
          pick.dataset.result = result;
          pick.name = `recruit:${result}`;
          pick.textContent = text;
          pick.addEventListener('click', () => {
            if (busy || pick.disabled) return;
            const check = controls.find(item => item.key === 'checkResult');
            const conversion = controls.find(item => item.key === 'convertRefugee');
            if (check) check.node.value = result;
            if (conversion) conversion.node.value = result === 'success' ? 'yes' : 'no';
            return execute();
          });
          outcomeButtons.appendChild(pick);
          recruitmentChoices.push({ button: pick, result, convert: result === 'success' ? 'yes' : 'no' });
        }
        row.appendChild(recruitmentBox);
      }
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
        // Trade results live beside the picker. Restore the shared nodes before
        // rebuilding fields so switching to another action keeps its controls.
        (breedingSettings || row).appendChild(description);
        if (timelineNote) row.appendChild(timelineNote);
        row.appendChild(button);
        controls = []; tradeControls = []; choiceCards = []; automaticSelection = {}; updateTrade = null; tradeDraft = []; fields.replaceChildren();
        resourcePayment = null; resourceTiles = []; resourceHistory = [];
        title.textContent = group.title
          ? [group.title, sources.length === 1 && sourceLabel(source) !== group.title ? sourceLabel(source) : ''].filter(Boolean).join(' · ')
          : [action.title, action.label].filter(Boolean).join(' · ');
        if (compactGroups) {
          if (sourceNode) {
            sourceNode.title = sourceLabel(source);
            if (sourceSummary) sourceSummary.textContent = `来源：${sourceLabel(source)}`;
          } else sourceCaption.textContent = breeding && !selectedModel ? '选择泰坦型号后显示来源科技' : `来源：${sourceLabel(source)}`;
          title.textContent = '查看卡图';
        }
        if (summaryTitle) {
          summaryTitle.textContent = group.title || action.title || action.label;
          summaryTitle.title = summaryTitle.textContent;
        }
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
          configureTrade();
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
        if (compactGroups) button.textContent = action.trade ? '执行交易'
          : action.negotiation ? '执行谈判' : breeding || action.grant?.type === 'titan' ? '开始培育'
            : action.repair ? '开始修复' : '使用能力';
        if (action.trade) button.textContent = '确认贸易';
        if (timelineNote) timelineNote.textContent = action.immediate || action.skipTimeline ? '执行后自动保存'
          : action.trade ? '自动记录冷却' : '自动加入时间线';
        if (disclosure) disclosure.dataset.simple = String(allControls().length === 0);
        preview();
      }
      function configureTrade() {
        const box = doc.createElement('div'); box.className = 'structure-tech-trade-planner';
        const hint = doc.createElement('p'); hint.className = 'structure-tech-trade-hint';
        hint.textContent = '选择卖出与买入资源，点击箭头加入预览，确认后统一结算。灰色资源当前无法兑换；再次点击已选资源可取消选择。同类重复兑换不额外占额度，中转按沿途种类占额度。';
        const exchange = doc.createElement('div'); exchange.className = 'structure-tech-trade-exchange';
        const resources = [...new Map((action.tradeRoutes || []).flatMap(route => [...(route.costs || []), ...(route.gains || [])])
          .map(item => [item.storageKey, item])).values()];
        let sell = '', buy = '', proposal = null;
        const stock = key => actionContext.record?.resources?.[key] ?? 0;
        function icon(item) {
          const image = doc.createElement('img'); image.className = 'structure-tech-resource-icon'; image.alt = '';
          const path = `record/assets/resource-icons/${encodeURIComponent(item.resource || item.storageKey.replace(/^c[1-5]-/, ''))}.png`;
          image.src = baseUrl ? new URL(path, baseUrl).href : `/${path}`;
          return image;
        }
        const pickers = [];
        function picker(side, title) {
          const column = doc.createElement('div'); column.className = 'structure-tech-trade-picker';
          const heading = doc.createElement('strong'); heading.textContent = title; column.appendChild(heading);
          const list = doc.createElement('div'); list.className = 'structure-tech-trade-resources';
          list.setAttribute('role', 'group'); list.setAttribute('aria-label', title);
          for (const item of resources) {
            const choice = doc.createElement('button'); choice.type = 'button'; choice.className = 'structure-tech-trade-resource';
            choice.name = `${side}:${item.storageKey}`;
            const label = doc.createElement('span'); label.textContent = item.label || item.resource;
            const balance = doc.createElement('small');
            choice.append(icon(item), label, balance);
            choice.addEventListener('click', () => {
              if (busy || choice.disabled) return;
              if (side === 'sell') sell = sell === item.storageKey ? '' : item.storageKey;
              else buy = buy === item.storageKey ? '' : item.storageKey;
              preview();
            });
            list.appendChild(choice); tradeControls.push(choice); pickers.push({ choice, balance, item, side });
          }
          column.appendChild(list); return column;
        }
        const arrow = doc.createElement('button'); arrow.type = 'button'; arrow.name = 'tradeAdd';
        arrow.className = 'structure-tech-trade-arrow'; arrow.textContent = '→'; arrow.setAttribute('aria-label', '预览兑换一次');
        arrow.addEventListener('click', () => {
          if (busy || arrow.disabled || !proposal?.ok) return;
          tradeDraft.push({ steps: proposal.steps.map(step => ({ ...step })) }); preview();
        });
        exchange.append(picker('sell', '卖出资源'), arrow, picker('buy', '买入资源'));
        const rate = doc.createElement('p'); rate.className = 'structure-tech-trade-rate'; rate.setAttribute('aria-live', 'polite');
        const quota = doc.createElement('p'); quota.className = 'structure-tech-trade-quota';
        const distribution = doc.createElement('div'); distribution.className = 'structure-tech-trade-distribution';
        distribution.setAttribute('aria-live', 'polite');
        const history = doc.createElement('ol'); history.className = 'structure-tech-trade-history';
        const actions = doc.createElement('div'); actions.className = 'structure-tech-trade-draft-actions';
        const undo = doc.createElement('button'); undo.type = 'button'; undo.name = 'tradeUndo'; undo.textContent = '撤销上一步';
        const clear = doc.createElement('button'); clear.type = 'button'; clear.name = 'tradeClear'; clear.textContent = '撤销全部';
        undo.addEventListener('click', () => { if (!busy) { tradeDraft.pop(); preview(); } });
        clear.addEventListener('click', () => { if (!busy) { tradeDraft = []; preview(); } });
        actions.append(undo, clear); tradeControls.push(arrow, undo, clear);
        const columns = doc.createElement('div'); columns.className = 'structure-tech-trade-columns';
        const workbench = doc.createElement('div'); workbench.className = 'structure-tech-trade-workbench';
        const results = doc.createElement('div'); results.className = 'structure-tech-trade-results';
        const footer = doc.createElement('div'); footer.className = 'structure-tech-trade-footer';
        if (timelineNote) footer.appendChild(timelineNote);
        footer.append(actions, button);
        results.append(distribution, description, footer);
        workbench.append(exchange, rate, quota, history);
        columns.append(workbench, results); box.append(hint, columns); fields.appendChild(box);
        updateTrade = () => {
          const steps = selection().tradeSteps;
          const result = steps.length ? engine.previewTrades(action, { tradeSteps: steps }, actionContext.record) : null;
          const changes = new Map((result?.changes || []).map(item => [item.storageKey, item]));
          proposal = sell && buy ? engine.findTradePath(action, sell, buy, actionContext.record, steps) : null;
          const current = new Set([...(action.tradeUsedRoutes || []), ...steps.map(step => step.routeId)]).size;
          quota.textContent = `预览 ${tradeDraft.length} 笔 · 贸易额度 ${current} / ${action.maxTrades === null ? '不限' : action.maxTrades || 3} 类`;
          const path = proposal?.path;
          rate.textContent = path ? `${proposal.ok ? '最优可用比率' : '兑换比率'} ${proposal.input} : ${proposal.output} · 每次卖出 ${proposal.input} ${path[0].costs[0].label}，买入 ${proposal.output} ${path.at(-1).gains[0].label}。`
            + `路径：${[path[0].costs[0].label, ...path.map(route => route.gains[0].label)].join(' → ')}；新增 ${proposal.extra} 类贸易额度。`
            + (proposal.ok ? '' : ` ${proposal.message}`) : proposal?.message || '请选择卖出和买入资源，自动计算比率与中转路径。';
          arrow.disabled = !proposal?.ok || action.disabled || action.available === false;
          undo.disabled = clear.disabled = !tradeDraft.length;
          for (const { choice, balance, item, side } of pickers) {
            const selected = (side === 'sell' ? sell : buy) === item.storageKey;
            const opposite = side === 'sell' ? buy : sell;
            const possible = opposite ? engine.findTradePath(action, side === 'sell' ? item.storageKey : sell,
              side === 'sell' ? buy : item.storageKey, actionContext.record, steps) : null;
            const unavailable = action.disabled || action.available === false || possible && !possible.ok;
            choice.setAttribute('aria-pressed', String(selected));
            choice.dataset.available = String(!unavailable);
            // A selected resource remains clickable so a blocked pair can
            // always be cleared without discarding the staged transactions.
            choice.disabled = Boolean(unavailable && !selected);
            choice.title = [unavailable ? action.reason || possible?.message || '当前不可用' : '',
              selected ? '再次点击取消选择' : ''].filter(Boolean).join('；');
            balance.textContent = `${steps.length ? '预览' : '库存'} ${changes.get(item.storageKey)?.after ?? stock(item.storageKey)}`;
          }
          distribution.replaceChildren();
          const heading = doc.createElement('strong'); heading.textContent = '交易后资源预览'; distribution.appendChild(heading);
          for (const item of resources) {
            const change = changes.get(item.storageKey), before = stock(item.storageKey), after = change?.after ?? before;
            const line = doc.createElement('div'); line.className = 'structure-tech-trade-balance'; line.dataset.resource = item.storageKey;
            line.dataset.direction = after > before ? 'gain' : after < before ? 'cost' : 'same';
            const label = doc.createElement('span'); label.textContent = item.label || item.resource;
            const value = doc.createElement('strong'); value.textContent = `${before} → ${after}${after !== before ? ` (${after > before ? '+' : ''}${after - before})` : ''}`;
            line.append(icon(item), label, value); distribution.appendChild(line);
          }
          history.replaceChildren();
          for (const batch of tradeDraft) {
            const line = doc.createElement('li');
            line.textContent = batch.steps.map(step => `${action.tradeRoutes.find(route => route.id === step.routeId)?.label} ×${step.count}`).join('；');
            history.appendChild(line);
          }
        };
      }
      function configureSource(previous = {}, preferredMode) {
        modeContainer.replaceChildren(); modeNode = null; modeCards = [];
        action = source.actions.find(item => (item.id || item.actionId) === preferredMode)
          || source.actions.find(item => (item.id || item.actionId) === 'breed' && available(item))
          || source.actions.find(available) || source.actions[0];
        if (source.actions.length > 1 && !actionTiles) {
          const label = doc.createElement('label'); label.className = 'structure-tech-action-choice';
          modeNode = doc.createElement('select'); modeNode.name = 'actionMode';
          for (const item of source.actions) {
            const option = doc.createElement('option'); option.value = item.id || item.actionId;
            const label = breeding ? ((item.id || item.actionId) === 'breed' ? '普通速度' : '快速速度') : item.label;
            option.textContent = `${label}${available(item) ? '' : `（${item.reason || '当前不可用'}）`}`;
            modeNode.appendChild(option);
          }
          modeNode.value = action.id || action.actionId;
          function changeMode() {
            if (busy) { modeNode.value = action.id || action.actionId; return; }
            const previous = selection();
            action = source.actions.find(item => (item.id || item.actionId) === modeNode.value) || source.actions[0];
            configureFields(previous);
          }
          modeNode.addEventListener('change', changeMode);
          label.append(doc.createTextNode(breeding ? '生产速度 ' : '使用方式 '), modeNode); modeContainer.appendChild(label);
          if (source.actions.every(item => item.restore)) {
            label.hidden = true; modeNode.hidden = true;
            const gallery = doc.createElement('div'); gallery.className = 'structure-tech-visual-choice structure-tech-action-modes';
            const heading = doc.createElement('strong'); heading.textContent = '使用方式';
            const tiles = doc.createElement('div'); tiles.className = 'structure-tech-visual-options';
            tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-label', '使用方式');
            const icons = { priests: 'record/assets/resource-icons/priests.png', fate: 'assets/icons/argo-fate.svg', babelianDebt: 'assets/icons/babelian-debt.svg' };
            for (const item of source.actions) {
              const value = item.id || item.actionId;
              const pick = doc.createElement('button'); pick.type = 'button'; pick.className = 'structure-tech-visual-option';
              pick.name = `choice:actionMode:${value}`;
              pick.dataset.available = String(available(item));
              pick.title = [item.label, item.description, available(item) ? '' : item.reason || '当前不可用'].filter(Boolean).join('；');
              const image = doc.createElement('img'); image.alt = ''; image.className = 'structure-tech-choice-icon';
              const path = icons[Object.keys(item.cost || {})[0]] || 'assets/icons/godforms-summons.svg';
              image.src = baseUrl ? new URL(path, baseUrl).href : `/${path}`;
              const fallback = doc.createElement('span'); fallback.className = 'structure-tech-choice-fallback'; fallback.textContent = item.label.slice(0, 1); fallback.hidden = true;
              image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; });
              const caption = doc.createElement('span'); caption.textContent = item.label;
              pick.append(image, fallback, caption);
              if (!available(item)) {
                const note = doc.createElement('small'); note.textContent = item.reason || '当前不可用'; pick.appendChild(note);
              }
              pick.addEventListener('click', () => {
                if (busy || pick.disabled) return;
                modeNode.value = value; changeMode();
              });
              modeCards.push({ button: pick, value }); tiles.appendChild(pick);
            }
            gallery.append(heading, tiles); modeContainer.appendChild(gallery);
          }
        }
        configureFields(previous);
      }
      function preview() {
        if (busy) return;
        for (const item of modeCards) item.button.setAttribute('aria-pressed', String(modeNode.value === item.value));
        for (const item of modelCards) item.button.setAttribute('aria-pressed', String(modelNode.value === item.value));
        for (const item of choiceCards) item.button.setAttribute('aria-pressed', String(item.node.value === item.value));
        for (const item of actionCards) item.button.setAttribute('aria-pressed', String(sourceNode.value === item.sourceKey
          && (action?.id || action?.actionId) === item.actionId));
        for (const item of sourcePicks) item.button.setAttribute('aria-pressed', String(sourceNode.value === item.value));
        updateTrade?.();
        if (recruitment) {
          description.replaceChildren();
          const facts = doc.createElement('dl'); facts.className = 'structure-tech-action-facts';
          const effectRow = doc.createElement('div'); effectRow.dataset.kind = 'effect';
          const effectTerm = doc.createElement('dt'); effectTerm.textContent = '效果';
          const effectDetail = doc.createElement('dd'); effectDetail.textContent = action.label || group.title || '';
          effectRow.append(effectTerm, effectDetail);
          const costParts = String(action.costLabel || action.description || '命运 +1')
            .split('；').map(part => part.trim()).filter(Boolean);
          const costRow = doc.createElement('div');
          const costTerm = doc.createElement('dt'); costTerm.textContent = '代价';
          const costDetail = doc.createElement('dd'); costDetail.textContent = costParts.shift() || '命运 +1';
          costRow.append(costTerm, costDetail);
          facts.append(effectRow, costRow); description.appendChild(facts);
          if (costParts.length) {
            const note = doc.createElement('p'); note.className = 'structure-tech-recruitment-note';
            note.textContent = `${costParts.join('；').replace(/^外交 7\+\s*成功后，/, '')}。`;
            description.appendChild(note);
          }
          let usable = false;
          for (const item of recruitmentChoices) {
            const chosen = { ...selection(), checkResult: item.result, convertRefugee: item.convert };
            const outcome = (engine.previewOperation || engine.prepareOperation)({ ...actionContext, techKey: action.techKey,
              actionId: action.id || action.actionId, selection: chosen, operationId: 'preview-recruitment-outcome' });
            item.button.disabled = !outcome?.ok;
            item.button.title = outcome?.ok
              ? item.result === 'success' ? '外交 7+ 成功：将 1 难民转为 1 船员' : '外交 7+ 失败：仍支付命运'
              : outcome?.message || '当前不可用';
            if (outcome?.ok) usable = true;
          }
          button.disabled = true;
          updateSummary(usable, usable ? '' : recruitmentChoices[0]?.button.title || '当前不可用');
          updatePreviewLayout();
          return;
        }
        if (breeding && !modelNode.value) {
          description.textContent = '请选择要生产的泰坦，查看代价和完成日期。'; button.disabled = true;
          updateSummary(false, sources.some(item => item.actions.some(available)) ? '请选择型号' : action.reason || '当前不可用');
          updatePreviewLayout(); return;
        }
        const chosen = selection();
        const result = action.disabled || action.available === false ? { ok: false, message: action.reason || '当前不可用' }
          : (engine.previewOperation || engine.prepareOperation)({ ...actionContext, techKey: action.techKey, actionId: action.id || action.actionId,
            selection: chosen, operationId: 'preview-structure-tech-action' });
        const preparedEvent = result?.operation || result?.event;
        // Random draws reveal their result only after a committed operation.
        const event = action.hiddenOutcome || action.draw ? preparedEvent && { ...preparedEvent, rewardLabel: '', targetLabel: '' } : preparedEvent;
        // Show net resource costs: intermediate goods are already accounted for
        // in the path, and must not appear as an additional inventory payment.
        const costEvent = action.trade && event?.tradeChanges ? { ...event, payment: [
          ...(event.payment || []).filter(item => item.type !== 'resource'),
          ...event.tradeChanges.filter(item => item.amount < 0).map(item => ({ ...item, type: 'resource' })),
        ] } : event;
        const cost = action.negotiation && action.manualCost ? action.costLabel
          : action.negotiation && costEvent ? paymentLabel(costEvent) || '无代价'
            : costEvent && !action.hiddenOutcome ? paymentLabel(costEvent, action.costLabel) : action.costLabel;
        const costNode = doc.createElement('strong');
        costNode.className = 'structure-tech-action-cost';
        costNode.textContent = cost || '';
        const parts = [breeding ? `来源：${sourceLabel(source)}` : '', action.label, cost ? costNode : ''];
        // A printed effect summary sits right behind the price, so the row stays
        // readable before the target is chosen. Negotiation rules expose the
        // mechanical part separately, keeping the card title from repeating.
        if (action.effectDetail) parts.push(action.effectDetail);
        else if (action.effectLabel && action.effectLabel !== action.label) parts.push(action.effectLabel);
        if (action.scoutLabel) parts.push(action.scoutLabel);
        const tradeSummary = action.trade && event?.tradeChanges ? event.tradeChanges.filter(item => item.amount)
          .map(item => `${item.label} ${item.amount > 0 ? '+' : ''}${item.amount}`).join('；') : (chosen.tradeSteps || chosen.trades || []).map(trade => {
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
        if (compactGroups) {
          description.replaceChildren();
          const facts = doc.createElement('dl'); facts.className = 'structure-tech-action-facts';
          function fact(label, value) {
            if (!value) return;
            const item = doc.createElement('div');
            item.dataset.kind = label === '效果' ? 'effect' : 'detail';
            const term = doc.createElement('dt'); term.textContent = label;
            const detail = doc.createElement('dd'); detail.textContent = value;
            item.append(term, detail); facts.appendChild(item);
          }
          fact('代价', cost || '无代价');
          // Negotiation uses the printed effect wording (“扩招船员 · 陌生人 +1”),
          // not the applied fate summary that also repeats the cost. Trade keeps
          // its net exchange preview because that is the actual result.
          const effect = tradeSummary
            || (action.negotiation ? [action.effectLabel || action.label, action.effectDetail].filter(Boolean).join(' · ') : '')
            || event?.rewardLabel || action.effectLabel || action.rewardLabel || (action.trade ? purpose : action.label) || purpose;
          const target = action.negotiation ? '' : event?.targetLabel && !breeding ? event.targetLabel : '';
          fact('效果', [target, effect].filter(Boolean).join(' · '));
          const dueDay = event?.dueDay ?? (breeding && Number.isFinite(Number(actionContext.day))
            ? Number(actionContext.day) + Number(action.id === 'breed' && modelNode.value === 'tt_shadowdancer' ? 14 : action.days) : null);
          if (dueDay != null && action.kind !== 'cooldown' && !action.skipTimeline && !event?.skipTimeline) fact('到期', `Day ${dueDay}`);
          const cooldown = event?.cooldownUntilDay ?? (breeding && action.cooldownDays ? Number(actionContext.day) + Number(action.cooldownDays) : null);
          if (Number(cooldown) > Number(event?.createdDay ?? actionContext.day)) fact('冷却恢复', `Day ${cooldown}`);
          description.appendChild(facts);
          const note = [action.scoutLabel, !result?.ok ? result?.message : ''].filter(Boolean).join(' · ');
          if (note) {
            const feedback = doc.createElement('p'); feedback.className = 'structure-tech-action-feedback';
            feedback.textContent = note; description.appendChild(feedback);
          }
        }
        button.disabled = !result?.ok;
        updateResourcePayment();
        updateSummary(result?.ok, result?.message);
        updatePreviewLayout();
      }
      // Preview possible completions without choosing controls or committing.
      // A missing picker alone should not make an otherwise usable ability look locked.
      function readinessAfterChoices() {
        const chosen = selection();
        const candidates = breeding && !modelNode.value ? sources.flatMap(item => item.actions).filter(available)
          : available(action) ? [action] : [];
        let blocked = null;
        for (const candidate of candidates) {
          const missing = (candidate.choices || []).filter(spec => spec.required && !chosen[spec.id]);
          const empty = missing.find(spec => spec.type === 'select' && !spec.options?.length);
          if (empty) {
            blocked ||= { ok: false, message: candidate.sacrifice ? '没有可用梦行者' : candidate.target === 'crippled-titan'
              ? '没有残废泰坦' : candidate.target === 'hero' ? '没有可选英雄' : `没有可选的${empty.label}` };
            continue;
          }
          const choices = missing.filter(spec => spec.type === 'select').map(spec => ({
            key: spec.id, values: spec.options.map(option => option.value),
          }));
          for (const confirmation of candidate.confirmations || []) {
            if (!chosen[confirmation.id]) choices.push({ key: confirmation.id, values: [true] });
          }
          if (candidate.trade && !chosen.tradeSteps?.length) choices.push({ key: 'tradeSteps',
            values: (candidate.tradeRoutes || []).map(route => [{ routeId: route.id, count: 1 }]),
          });
          if (!choices.length) continue;
          function check(index, proposal) {
            if (index < choices.length) {
              const { key, values } = choices[index];
              for (const value of values) {
                const ready = check(index + 1, { ...proposal, [key]: value });
                if (ready) return ready;
              }
              return null;
            }
            const result = (engine.previewOperation || engine.prepareOperation)({ ...actionContext,
              techKey: candidate.techKey, actionId: candidate.id || candidate.actionId, selection: proposal,
              operationId: 'preview-structure-tech-action' });
            if (result?.ok) return result;
            blocked ||= result;
            return null;
          }
          const ready = check(0, chosen);
          if (ready) return ready;
        }
        return blocked;
      }
      function updateSummary(ok, reason) {
        if (!summaryState) return;
        const potential = !ok ? readinessAfterChoices() : null;
        const requiresSelection = !ok && potential?.ok;
        if (potential) { ok = potential.ok; reason = potential.message; }
        const message = String(reason || '');
        const date = message.match(/D(?:ay\s*)?(\d+)/i)?.[1];
        let label = ok ? '可使用' : '待配置';
        if (!ok) {
          if (/待结算/.test(message)) label = `待结算${date ? ` · D${date}` : ''}`;
          else if (/冷却/.test(message)) label = `冷却中${date ? ` · D${date}` : ''}`;
          else if (/不足/.test(message)) label = message.match(/[^，。；：·]*不足/)?.[0]?.trim() || '资源不足';
          else if (/^没有/.test(message)) label = message;
          else if (/请选择型号/.test(message)) label = '待选型号';
          else if (action.negotiation && /请先处理上一次荒原商人的选牌/.test(message)) label = '待选牌';
          else if (action.negotiation && /请先结束当前探索抽卡/.test(message)) label = '待结束抽卡';
          else if (action.negotiation && /初始化牌堆/.test(message)) label = '待初始化牌堆';
          else if (action.negotiation && /请选择有效派系/.test(message)) label = '待选派系';
          else if (action.negotiation && /不属于当前谈判地点/.test(message)) label = '派系不符';
          else if (action.negotiation && /请完成外交检定/.test(message)) label = '待检定';
          else if (action.negotiation && /请确认播种/.test(message)) label = '待确认条件';
          else if (action.negotiation && /请先填写所选派系的当前外交值/.test(message)) label = '外交未填写';
          else if (action.negotiation && /仅可用于隐藏或怀疑关系/.test(message)) label = '关系不符';
          else if (action.negotiation && /已到上限/.test(message)) label = '外交已满';
          else if (action.negotiation && /当前有效的谈判地点/.test(message)) label = '待选地点';
          else if (action.negotiation && /请选择现有泰坦或祭司/.test(message)) label = '待选代价';
          else if (action.negotiation && /至少 1 类资源交换/.test(message)) label = '待选兑换';
          else if (action.negotiation && /本次需要恰好支付/.test(message)) label = '待支付';
          else if (action.target === 'hero' && !controls.find(item => item.key === 'targetId')?.node.value && !message) label = '待选英雄';
          else if (/请选择/.test(message)) label = action.target === 'hero' ? '待选英雄' : '待配置';
          else if (message) label = '暂不可用';
        }
        summaryState.textContent = label;
        summaryState.dataset.state = ok ? 'ready' : 'blocked';
        summaryState.title = requiresSelection ? '可使用：展开并完成选项后执行' : message || label;
      }
      async function execute() {
        if (busy || action.disabled || action.available === false) return;
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
      }
      button.addEventListener('click', () => { if (!button.disabled) return execute(); });
      configureSource();
      container.appendChild(disclosure || row);
      previewObserver?.observe(row);
    }
    panel.refresh = refresh;
    panel.ready = refresh(options.context);
    return panel;
  }
  return { create, createActionPanel, getActionPanel: createActionPanel, profileSection };
});
