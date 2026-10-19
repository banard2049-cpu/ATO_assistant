(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ATO_NEGOTIATION_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = (code, message) => ({ ok: false, code, message });
  const integer = value => /^(?:0|[1-9]\d*)$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const labels = { fate: '命运', strangers: '陌生人', crew: '船员', hull: '船体', progress: '进展', humanity: '人性',
    refugees: '难民', priests: '祭司', paradox: '悖论', babelianDebt: '巴比伦债务', paranoia: '猜忌', titan: '梦行者' };
  // 阿尔戈号命运轨道上限 9；悖论另有自己的上限 12。
  const FATE_MAX = 9;
  const factions = {
    c1: [['minoians', '米诺斯人'], ['labyrinthians', '迷宫徒'], ['hornsworn', '角誓者']],
    c2: [['helots', '希洛人'], ['cyclopes', '独眼巨人'], ['symmachy', '邦联同盟']],
    c3: [['sunheirs', '太阳后裔'], ['delphians', '德尔菲人'], ['twilightWatch', '暮光守望']],
    c4: [['wasters', '浪费者'], ['aristotelians', '亚里士多德远征军'], ['cloudThieves', '云贼']],
    c5: [['followersOfArete', '阿瑞特追随者'], ['cycladeanProtectorate', '保护国'], ['outcastVanguard', '弃民先锋']],
  };
  const mode = (id, label, options = {}) => ({ id: `negotiate-${id}`, label, location: 'city', ...options });
  const catalog = [
    { key: 'rhetoric', actions: [mode('rhetoric', '遣散陌生人', { fate: 1, effects: { strangers: -1 } })] },
    { key: 'diplomatic relations', actions: [mode('diplomacy', '改善当地外交', { fate: 1, mortal: 4, diplomacy: 'local' })] },
    { key: 'crew expansion', actions: [mode('crew', '扩招船员', { fate: 1, effects: { strangers: 1, crew: 1 } })] },
    { key: 'trading solutions', cycle: 'c1', actions: [mode('trade', '港口贸易', { fate: 1, trade: true })] },
    { key: 'refugee relief effort', actions: [mode('refugees', '难民救济', { relief: true, diplomacy: 'local', costEffects: ['refugees'], effects: { refugees: -1, humanity: 1 } })] },
    { key: 'grassroot support', actions: [mode('progress', '同盟情报', { fate: 1, effects: { progress: 1 } })] },
    { key: 'mobile trade fleet hub', cycle: 'c2', actions: [mode('trade', '黑市贸易', { fate: 1, trade: true })] },
    { key: 'alliance contacts', actions: [mode('contacts', '同盟联络', { contacts: true, diplomacy: 'local' })] },
    { key: 'war recruitment', actions: [mode('crew', '战争募员', { fate: 1, effects: { crew: 1 } })] },
    { key: 'argo maintenance', actions: [mode('hull', '修复船体', { fate: 2, effects: { hull: 1 } })] },
    { key: 'delphian diplomatic relations', actions: [mode('diplomacy', '改善当地外交', { fate: 1, mortal: 4, diplomacy: 'local' })] },
    { key: 'moirai operation', actions: [mode('moirai', '摩伊赖克服 · 外交 7+', { sacrifice: true, check: true, effects: { fate: -3 } })] },
    { key: 'temporal aegis', actions: [mode('paradox', '时变庇护', { fate: 1, effects: { paradox: -1 } })] },
    { key: 'ultimate trading solutions', cycle: 'c3', actions: [mode('trade', '终极贸易', { fate: 1, trade: true })] },
    { key: 'curse economy basics', actions: [mode('curse', '诅咒经济', { costEffects: ['babelianDebt'], effects: { babelianDebt: -2 }, manualCost: true, manual: '下次战斗加入 1 张随机诅咒特性卡；请抽取实体卡并处理' })] },
    { key: 'sustainable oasis', actions: [
      mode('oasis-fate', '绿洲休整', { location: 'oasis', effects: { fate: -1 } }),
      mode('oasis-debt', '债务换取休整', { location: 'oasis', effects: { babelianDebt: 1, fate: -2 } }),
      mode('oasis-titan', '绿洲生产梦行者', { location: 'oasis', sow: 6, fate: 1, effects: { titan: 1 } }),
    ] },
    { key: 'curse exchange', actions: [
      mode('debt', '偿还债务', { fate: 1, effects: { babelianDebt: -1 }, oasisAt: 10 }),
      mode('crew', '债务招募船员', { fate: 1, effects: { babelianDebt: 1, crew: 1 }, oasisAt: 10 }),
      mode('hull', '债务修复船体', { fate: 1, effects: { babelianDebt: 1, hull: 1 }, oasisAt: 10 }),
    ] },
    { key: 'plutocratic diplomacy', actions: [
      mode('resources', '资源改善外交', { fate: 1, mortal: 6, diplomacy: 'any' }),
      mode('debt', '债务改善外交', { fate: 1, effects: { babelianDebt: 1 }, diplomacy: 'any' }),
    ] },
    { key: 'plutocratic agents', actions: [mode('agents', '派系间斡旋', { fate: 1, agents: true, diplomacy: 'local', effects: { babelianDebt: -1 } })] },
    { key: 'merchants of the waste', actions: [mode('draw', '荒原商人 · 抽二选一', { effects: { babelianDebt: 1 }, draw: true })] },
    { key: 'the dreamed torus', actions: [
      mode('debt', '绿洲消债', { location: 'oasis', effects: { babelianDebt: -1 } }),
      mode('curse', '梦境环面 · 治疗诅咒', { location: 'oasis', sow: 8, fate: 1, hero: true, manual: '所选英雄失去任意诅咒苦难；请处理实体苦难卡' }),
    ] },
    { key: 'argo crew rebuilding', actions: [mode('crew', '重建船员', { fate: 1, effects: { crew: 1, paranoia: 1 } })] },
    { key: 'scientific debunking', actions: [mode('paranoia', '科学驳斥', { fate: 1, effects: { paranoia: -1 } })] },
    { key: 'spiral theory', actions: [mode('fate', '白银遗迹休整', { location: 'silver_ruin', effects: { fate: -1 } })] },
    { key: 'grassroots diplomacy', actions: [
      mode('local', '改善当地外交', { fate: 1, mortal: 4, diplomacy: 'local' }),
      mode('any', '改善任意派系外交', { fate: 1, mortal: 12, diplomacy: 'any' }),
    ] },
    { key: 'cyclades commerce', cycle: 'c5', actions: [mode('trade', '基克拉泽斯贸易', { fate: 1, trade: true })] },
    { key: 'cyclades information circulation', actions: [mode('progress', '情报流通', { fate: 1, effects: { paranoia: 1, progress: 1 } })] },
    { key: 'tight-spaces navigation', actions: [mode('aether', '翻转以太指示物', { location: 'underwater', fate: 1, manual: '翻转 1 个以太指示物；请处理实体指示物' })] },
    { key: 'moirai rebellion', actions: [mode('fate', '摩伊赖叛乱', { location: 'underwater', effects: { fate: -2 } })] },
    { key: 'phobian psychology', actions: [mode('echo', '祭司换取回忆回响', { costEffects: ['priests'], effects: { priests: -2 }, echo: true })] },
    { key: 'atlantean maintenance procedures', actions: [mode('hull', '亚特兰蒂斯维护', { fate: 1, effects: { hull: 1 } })] },
    { key: 'new oikos', actions: [mode('titan', '生产梦行者', { fate: 1, effects: { titan: 1 } })] },
  ];
  const passiveKeys = ['advanced trading solutions', 'mortal alliance', 'gaia’s stepchildren'];
  const cycleOf = ctx => ctx.cycleId || ctx.cycle;
  function effectsEngine() {
    return root.ATO_EXPLORATION_EFFECT_RULES || (typeof require === 'function' ? require('../assets/exploration-card-effects.js') : null);
  }
  function relation(ctx, faction) {
    const entries = ctx.record?.diplomacy || {}, cycle = cycleOf(ctx);
    const aliases = faction === 'outcastVanguard' ? [faction, 'vanguard', 'f_vanguard'] : [faction];
    const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const keys = Object.keys(entries);
    const stored = aliases.map(id => keys.find(k => normalize(k) === normalize(`${cycle}-${id}`))).find(Boolean)
      || aliases.map(id => keys.find(k => normalize(k) === normalize(id))).find(Boolean);
    const raw = entries[stored];
    return raw !== '' && raw != null && Number.isInteger(Number(raw)) ? Number(raw) : null;
  }
  function mapInfo(ctx) {
    const cycle = cycleOf(ctx), saved = ctx.mapState?.cycles?.[cycle], rawSnapshot = ctx.state?.mapSnapshot;
    const compatibleSnapshot = !rawSnapshot?.cycleId || rawSnapshot.cycleId === cycle;
    const snapshot = compatibleSnapshot ? rawSnapshot : null;
    const tileId = saved?.currentTile || snapshot?.currentTileId || '';
    const metadata = ctx.mapTags || root.ATO_MAP_TILE_TAGS;
    const tile = id => {
      const base = metadata?.tiles?.[`${cycle}:${id}`];
      // Cycle V front (A) is underwater; back (B) is the surface map.
      const face = cycle === 'c5' ? saved ? saved.tileVariants?.[id] === 'alternate' ? 'B' : 'A' : snapshot?.currentTileFace || 'A' : '';
      return { ...base, ...(face ? metadata?.tiles?.[`${cycle}:${id}:${face}`] : {}), underwater: cycle === 'c5' && face === 'A' };
    };
    const current = tile(tileId);
    const fallback = !saved && compatibleSnapshot;
    const tags = current.tags || (fallback ? ctx.state?.mapCurrentTileTags || snapshot?.currentTileTags : []) || [];
    const local = current.factions || (fallback ? ctx.state?.mapCurrentTileFactions || snapshot?.currentTileFactions : []) || [];
    const markers = copy(saved?.tokens?.markers || {});
    if (!saved) for (const marker of snapshot?.markers || []) {
      const [id, tokens] = String(marker).split(':');
      for (const token of (tokens || '').split(',')) if (/^[a-z0-9_]+$/.test(token)) (markers[id] ||= {})[token] = true;
    }
    const used = (id, type) => Boolean(markers[id]?.[type] || id === tileId && fallback && ({ last_city: ctx.state?.mapCurrentTileHasLastCityMarker || snapshot?.currentTileHasLastCityMarker,
      last_oasis: ctx.state?.mapCurrentTileHasLastOasisMarker || snapshot?.currentTileHasLastOasisMarker,
      last_silver_ruin: ctx.state?.mapCurrentTileHasLastSilverRuinMarker || snapshot?.currentTileHasLastSilverRuinMarker })[type]);
    return { saved, tileId, tags, local, markers, tile, used, underwater: current.underwater };
  }
  function locations(ctx, action, helpers) {
    const info = mapInfo(ctx), cycle = cycleOf(ctx), items = [];
    if (!info.tileId) return items;
    if (action.location === 'underwater' && cycle !== 'c5') return items;
    const marker = action.location === 'oasis' ? 'last_oasis' : action.location === 'silver_ruin' ? 'last_silver_ruin' : action.location === 'underwater' ? 'c5_last_visited_underwater_city' : 'last_city';
    const wantedTag = action.location === 'underwater' ? 'city' : action.location;
    const matchingDepth = action.location === 'underwater' ? info.underwater : action.location === 'city' ? !info.underwater : true;
    if (info.tags.includes(wantedTag) && matchingDepth && !info.used(info.tileId, marker)
        && !(action.location === 'underwater' && info.used(info.tileId, 'last_city'))) items.push({ value: `current:${info.tileId}`, label: `当前${({ city: '城市', oasis: '绿洲', silver_ruin: '白银遗迹', underwater: '水下城市' })[action.location]} ${info.tileId}`, tileId: info.tileId, factions: info.local });
    if (action.oasisAt && info.tags.includes('oasis') && !info.used(info.tileId, 'last_oasis')) items.push({ value: `oasis:${info.tileId}`, label: `绿洲 ${info.tileId}（播种 ${action.oasisAt}+）`, tileId: info.tileId, factions: info.local, sow: action.oasisAt });
    if (action.location === 'city' && helpers.eligibility(ctx, 'mortal alliance').ok) {
      const mapCycle = (ctx.mapData || root.ATO_MAP_DATA)?.cycles?.find(item => item.id === cycle);
      const current = mapCycle?.tiles?.find(item => item.id === info.tileId);
      for (const id of new Set(Object.values(current?.neighbors || {}).filter(Boolean))) {
        const target = info.tile(id);
        if (target.tags?.includes('city') && !target.underwater && !info.used(id, 'last_city')) items.push({ value: `adjacent:${id}`, label: `邻接城市 ${id}（凡人同盟 · 仅一次）`, tileId: id, factions: target.factions || [], marker: 'last_city' });
      }
    }
    if (['city', 'underwater'].includes(action.location) && info.markers[info.tileId]?.c5_ruin
        && helpers.eligibility(ctx, 'gaia’s stepchildren').ok && !info.used(info.tileId, marker)) {
      items.push({ value: `ruins:${info.tileId}`, label: `当前板块 ${info.tileId} 的废墟覆盖空间（盖亚的庶子）`, tileId: info.tileId, factions: info.local,
        marker: action.location === 'underwater' ? 'c5_last_visited_underwater_city' : 'last_city', ruins: true });
    }
    return items;
  }
  function townRoutes(cycle, helpers) {
    const resources = helpers.tradeResources[cycle].map(([id, label]) => ({ resource: id, label, storageKey: `${cycle}-${id}` })), routes = [];
    const add = (a, cost, b, gain) => routes.push({ id: `${resources[a].resource}-to-${resources[b].resource}`, label: `${cost} ${resources[a].label} → ${gain} ${resources[b].label}`,
      costs: [{ ...resources[a], amount: cost }], gains: [{ ...resources[b], amount: gain }] });
    add(0, 2, 1, 1); add(0, 3, 2, 1); add(1, 1, 0, 2); add(2, 1, 0, 3);
    for (const index of [4, 5]) { add(index, 1, 3, 3); add(3, 3, index, 1); }
    for (const index of [6, 7]) { add(index, 1, 3, 4); add(3, 4, index, 1); }
    return routes;
  }
  function rawStat(ctx, type) {
    if (type === 'priests') return integer(ctx.record?.resources?.priests ?? 0);
    if (type === 'refugees' && cycleOf(ctx) === 'c2') {
      const counters = ctx.record?.cycleStats?.c2?.crewCounters;
      if (counters) return integer(counters.refugees ?? 0);
      return Object.entries(ctx.record?.crewBoxes || {}).filter(([key, value]) => key.startsWith('c2-crew-') && (value === true || value === 'refugee')).length;
    }
    const scoped = ctx.record?.cycleStats?.[cycleOf(ctx)]?.[type];
    if (type === 'humanity') {
      const value = Number(scoped ?? ctx.record?.humanity ?? 0);
      return Number.isSafeInteger(value) ? value : null;
    }
    return integer(scoped ?? (!ctx.record?.cycle || ctx.record.cycle === cycleOf(ctx) ? ctx.record?.[type] : undefined) ?? 0);
  }
  function resourceFields(ctx, action, helpers) {
    const cycle = cycleOf(ctx), entries = helpers.tradeResources[cycle].slice(0, 4).map(([id, label]) => [`${cycle}-${id}`, label]);
    if (action.contacts) entries.push(['fearEssence', '恐惧精华'], ['mazeFragment', '迷宫碎片']);
    return entries.map(([storageKey, label]) => {
      const stock = integer(ctx.record?.resources?.[storageKey] ?? 0) ?? 0;
      return { id: `pay:${storageKey}`, storageKey, type: 'number', label: `${label}（库存 ${stock}）`,
        // The panel turns these into clickable resource tiles; the hidden input
        // still carries the exact amount the rules validate.
        tile: { resource: storageKey.replace(/^c[1-5]-/, ''), name: label, stock },
        ...(action.mortal ? { tileTotal: action.mortal } : {}),
        ...(action.contacts ? { tileTotalFrom: 'faction' } : {}),
        defaultValue: 0, min: 0 };
    });
  }
  // Split the printed text into the two boxes the timeline tech panel uses:
  // “代价” only carries what the player pays (or must have), while “效果”
  // carries what changes. The old single describe() line put gains such as
  // “船员 +1” in the cost box, which made the negotiation rows look wrong.
  function describeParts(action) {
    const costs = [], effects = [];
    if (action.fate) costs.push(`命运 +${action.fate}`);
    if (action.mortal) costs.push(`任选 ${action.mortal} 个凡人资源`);
    if (action.contacts) costs.push('凡人资源／恐惧精华／迷宫碎片（数量=当地外交）');
    if (action.sacrifice) costs.push('失去 1 泰坦或 1 祭司');
    if (action.sow) costs.push(`需播种标记至少 ${action.sow}`);
    else if (action.oasisAt) costs.push(`绿洲分支需播种标记至少 ${action.oasisAt}`);
    for (const [type, amount] of Object.entries(action.effects || {})) {
      const label = labels[type] || type;
      if (type === 'fate' && action.relief) continue;
      if (type === 'refugees' && amount < 0) { costs.push(`失去 ${-amount} ${label}`); continue; }
      if (type === 'babelianDebt' && amount > 0 && !action.costEffects?.includes(type)) { costs.push(`${label} +${amount}`); continue; }
      if (action.costEffects?.includes(type) && amount < 0) {
        costs.push(`需至少 ${-amount} ${label}`);
        effects.push(`${label} ${amount}`);
        continue;
      }
      effects.push(`${label} ${amount > 0 ? '+' : ''}${amount}`);
    }
    if (action.diplomacy) effects.push(`${action.diplomacy === 'local' ? '当地' : '所选'}派系外交 +1`);
    if (action.agents) effects.push('另一派系外交 -1');
    if (action.echo) effects.push('回忆回响 +1');
    if (action.trade) effects.push('按比例交换资源');
    if (action.draw) effects.push('抽取 2 张探索卡，选择 1 张，仅处理资源或泰坦奖励');
    if (action.check) effects.unshift('外交 7+ 检定');
    if (action.relief) costs.push('命运 +1～2（友善时 +2）');
    if (action.manual && action.manualCost) costs.push(action.manual);
    if (action.manual && !action.manualCost) effects.push(action.manual);
    return { cost: costs.filter(Boolean).join('；'), effect: effects.filter(Boolean).join('；') };
  }
  function listActions(ctx, helpers) {
    const cycle = cycleOf(ctx), actions = [];
    for (const rule of catalog) {
      if (ctx.techKey && !helpers.dictionaryCards(ctx, ctx.techKey).some(card => card.key === rule.key)) continue;
      const eligible = helpers.eligibility(ctx, rule.key);
      if (!ctx.techKey && ['UNKNOWN_TECH', 'LOCKED_TECH', 'CYCLE_SCOPE'].includes(eligible.code)) continue;
      if (rule.cycle && rule.cycle !== cycle) continue;
      const card = eligible.card || helpers.dictionaryCards(ctx, rule.key)[0];
      if (!card) continue;
      for (const printed of rule.actions) {
        const action = { ...copy(printed), negotiation: true, skipTimeline: true, kind: 'cooldown', days: 0,
          ...(printed.trade ? { tradeRoutes: townRoutes(cycle, helpers), maxTrades: 3, resourceCycle: cycle, groupKey: 'negotiation-trade', groupTitle: '谈判贸易' } : {}) };
        const places = locations(ctx, action, helpers);
        if (!ctx.techKey && !places.length) continue;
        const choices = [{ id: 'location', label: '谈判地点', type: 'select', options: places.map(item => ({ value: item.value, label: item.label })), defaultValue: places.length === 1 ? places[0].value : '' }];
        if (action.diplomacy || action.relief || action.agents) {
          const options = factions[cycle].map(([value, label]) => ({ value, label: `${label}（外交 ${relation(ctx, value) ?? '未填写'}）` }));
          choices.push({ id: 'faction', label: action.diplomacy === 'any' ? '目标派系' : '当地派系', type: 'select', options,
            ...(action.diplomacy !== 'any' ? { optionsByLocation: Object.fromEntries(places.map(place =>
              [place.value, options.filter(option => place.factions.includes(option.value))])) } : {}) });
        }
        if (action.agents) choices.push({ id: 'otherFaction', label: '失去外交的另一派系', type: 'select', options: factions[cycle].map(([value, label]) => ({ value, label: `${label}（${relation(ctx, value) ?? '未填写'}）` })) });
        if (action.mortal || action.contacts) choices.push(...resourceFields(ctx, action, helpers));
        if (action.sacrifice) choices.push({ id: 'sacrifice', label: '支付代价', type: 'select', options: [
          { value: 'priest', label: `1 祭司（库存 ${rawStat(ctx, 'priests')}）` },
          ...helpers.titanItems(ctx).map(titan => ({ value: `titan:${titan.id}`, label: `1 ${titan.name}（库存 ${titan.count ?? 1}）` })),
        ] });
        if (action.check) choices.push({ id: 'checkResult', label: '玩家外交检定 7+', type: 'select', options: [{ value: 'success', label: '成功' }, { value: 'failure', label: '失败（仍支付代价）' }] });
        if (action.hero) choices.push({ id: 'targetId', label: '阿尔戈英雄', type: 'select', options: helpers.heroItems(ctx).map(hero => ({ value: hero.id, label: helpers.heroTitle(hero) })) });
        const confirmations = [];
        if (action.sow || action.oasisAt) confirmations.push({ id: 'sowConfirmed', label: action.sow ? `播种标记至少 ${action.sow}` : `使用绿洲分支时，播种标记至少 ${action.oasisAt}（城市不受此限制）`, optional: !action.sow });
        if (helpers.eligibility(ctx, 'advanced trading solutions').ok && (action.fate || action.relief)) confirmations.push({ id: 'waiveFate', label: '高级贸易方案：本次为今天首次交涉，免除命运增加', optional: true });
        let reason = eligible.message || '';
        if (!reason && !places.length) reason = '当前地点不符合本能力的谈判条件，或已有最后到访指示物。';
        const parts = describeParts(action);
        actions.push({ ...action, choices, confirmations, actionId: action.id, techKey: rule.key,
          title: helpers.titleFor(card), image: card.image?.back || '', groupKey: action.groupKey || `negotiation:${rule.key}`, groupTitle: action.groupTitle || helpers.titleFor(card), tier: 1,
          available: !reason, disabled: Boolean(reason), reason, costLabel: parts.cost || '无代价',
          effectLabel: action.label, effectDetail: parts.effect, dueDays: 0, stepId: 'explore' });
      }
    }
    return actions;
  }
  function prepareOperation(ctx, helpers, draft) {
    const cycle = cycleOf(ctx), rule = catalog.find(item => item.key === String(ctx.techKey).toLowerCase().split('@@')[0]);
    const printed = rule?.actions.find(item => item.id === ctx.actionId);
    if (!printed) return fail('UNKNOWN_ACTION', '未知的谈判能力。');
    const eligible = helpers.eligibility(ctx, rule.key);
    if (!eligible.ok) return eligible;
    if (rule.cycle && rule.cycle !== cycle) return fail('CYCLE_SCOPE', '贸易仅能在卡面所属循环使用。');
    const selection = copy(ctx.selection || {}), action = printed, place = locations(ctx, action, helpers).find(item => item.value === selection.location);
    if (!place) return fail('INVALID_LOCATION', '请选择当前有效的谈判地点；不能在最后到访的地点再次谈判。');
    if ((action.sow || place.sow) && selection.sowConfirmed !== true) return fail('CONFIRM_CONDITION', `请确认播种标记至少 ${action.sow || place.sow}。`);
    const day = helpers.dayOf(ctx), id = ctx.operationId;
    let record = draft.record;
    const automation = draft.automation, payment = [], gains = [], deltas = [], summaries = [];
    const stats = { ...action.effects };
    let fate = action.fate || 0, faction = selection.faction;
    if (action.diplomacy || action.relief || action.agents) {
      if (!factions[cycle].some(([key]) => key === faction)) return fail('INVALID_TARGET', '请选择有效派系。');
      if (action.diplomacy !== 'any' && !place.factions.includes(faction)) return fail('INVALID_TARGET', '所选派系不属于当前谈判地点。');
      if (relation(ctx, faction) === null) return fail('UNKNOWN_DIPLOMACY', '请先填写所选派系的当前外交值。');
    }
    if (action.relief) fate = relation(ctx, faction) < 7 ? 1 : 2;
    if (action.contacts && (relation(ctx, faction) < 0 || relation(ctx, faction) >= 7)) return fail('DIPLOMACY_CONDITION', '同盟联络仅可用于隐藏或怀疑关系。');
    if (selection.waiveFate === true) {
      if (!fate || !helpers.eligibility(ctx, 'advanced trading solutions').ok) return fail('INVALID_WAIVER', '当前不能使用高级贸易方案。');
      if (record.technologyNegotiations?.[cycle]?.[day]?.count) return fail('FIRST_NEGOTIATION_USED', '今天已执行过交涉，不能再免除命运代价。');
      summaries.push('高级贸易方案：今日首次交涉免除命运增加'); fate = 0;
    }
    if (action.check && !['success', 'failure'].includes(selection.checkResult)) return fail('CHECK_REQUIRED', '请完成外交检定，并选择成功或失败。');
    if (action.check && selection.checkResult === 'failure') for (const key of Object.keys(stats)) delete stats[key];
    if (fate) deltas.push({ type: 'fate', amount: fate, cost: true });
    if (action.mortal || action.contacts) {
      const fields = resourceFields(ctx, action, helpers), amount = action.contacts ? relation(ctx, faction) : action.mortal;
      let total = 0;
      for (const field of fields) {
        const value = integer(selection[field.id] ?? 0), before = integer(record.resources?.[field.storageKey] ?? 0);
        if (value === null || before === null) return fail('INVALID_PAYMENT', '支付数量和库存必须是非负整数。');
        if (value > before) return fail('INSUFFICIENT_RESOURCES', `${field.label}不足，整次未结算。`);
        total += value;
        if (value) { (record.resources ||= {})[field.storageKey] = before - value; payment.push({ type: 'resource', storageKey: field.storageKey, label: field.label.split('（')[0], amount: -value }); }
      }
      if (total !== amount) return fail('INVALID_PAYMENT', `本次需要恰好支付 ${amount} 个资源，已选择 ${total}。`);
    }
    if (action.sacrifice) {
      if (selection.sacrifice === 'priest') deltas.push({ type: 'priests', amount: -1, cost: true });
      else {
        const titan = record.titans?.find(item => `titan:${item.id}` === selection.sacrifice && integer(item.count ?? 1) > 0);
        if (!titan) return fail('INVALID_PAYMENT', '请选择现有泰坦或祭司支付代价。');
        titan.count = Number(titan.count ?? 1) - 1;
        if (!titan.count) record.titans.splice(record.titans.indexOf(titan), 1);
        payment.push({ type: 'titan', name: titan.name, titanId: titan.id, amount: -1 });
      }
    }
    let targetLabel = place.label;
    if (action.hero) {
      const hero = helpers.heroItems(ctx).find(item => item.id === selection.targetId);
      if (!hero) return fail('INVALID_TARGET', '请选择现有阿尔戈英雄。');
      targetLabel += `；${helpers.heroTitle(hero)}`;
    }
    const changeDiplomacy = (target, delta) => {
      const before = relation(ctx, target), min = cycle === 'c2' ? 0 : -10, max = cycle === 'c2' ? 15 : 10;
      if (before === null || before + delta < min || before + delta > max) return false;
      (record.diplomacy ||= {})[`${cycle}-${target}`] = String(before + delta);
      summaries.push(`${factions[cycle].find(([id]) => id === target)[1]}外交 ${delta > 0 ? '+' : ''}${delta}（${before} → ${before + delta}）`);
      return true;
    };
    if (action.agents && (selection.otherFaction === faction || !factions[cycle].some(([id]) => id === selection.otherFaction)
      || !changeDiplomacy(selection.otherFaction, -1))) return fail('INVALID_PAYMENT', '请选择有外交值可失去的另一派系。');
    if (action.diplomacy && !changeDiplomacy(faction, 1)) return fail('DIPLOMACY_LIMIT', '目标派系外交已到上限或尚未填写。');
    const manualEffects = [];
    for (const [type, amount] of Object.entries(stats)) {
      if (selection[`manual:${type}`] === true) {
        if (!helpers.saveReminders(ctx, [{ type, amount }]).length) return fail('INVALID_MANUAL_EFFECT', '此效果当前没有可用的豁免，请刷新能力后重试。');
        manualEffects.push({ type, amount });
      } else deltas.push({ type, amount, cost: action.costEffects?.includes(type) === true });
    }
    // Validate all costs before applying the exploration engine's normal gain caps.
    for (const delta of deltas) {
      const value = rawStat({ ...ctx, record }, delta.type);
      if (value === null) return fail('UNKNOWN_COST', `请先填写有效的${labels[delta.type]}。`);
      if (!Number.isSafeInteger(value + delta.amount)) return fail('STAT_LIMIT', `${labels[delta.type]}变化超出可记录范围，整次未结算。`);
      if (delta.cost && delta.amount < 0 && value < -delta.amount) return fail('INSUFFICIENT_RESOURCES', `${labels[delta.type]}不足，整次未结算。`);
      if (delta.cost && delta.type === 'fate' && value + delta.amount > FATE_MAX) return fail('COST_LIMIT', '命运代价超过上限，整次未结算。');
    }
    const engine = effectsEngine();
    if (!engine) return fail('RULES_UNAVAILABLE', '探索结算规则未加载，请刷新页面。');
    const seenTracks = ctx.state?.exploration?.trackReceiptsByCycle?.[cycle] || {};
    const currentProgress = Number(ctx.state?.cardTracks?.story?.progress || 0)
      + (record.explorationTrackTransactions || []).filter(item => item.cycleId === cycle && item.type === 'progress' && !seenTracks[item.id])
        .reduce((sum, item) => sum + item.amount, 0);
    const applied = engine.apply(record, cycle, deltas, { stats: { progress: currentProgress } });
    record = applied.record;
    for (const delta of deltas.filter(item => item.cost)) {
      const actual = applied.changes.filter(item => item.type === delta.type).reduce((sum, item) => sum + item.amount, 0);
      if (actual !== delta.amount) return fail('COST_LIMIT', `${labels[delta.type]}代价无法足额支付，整次未结算。`);
    }
    for (const delta of deltas) {
      const actual = applied.changes.filter(item => item.type === delta.type).reduce((sum, item) => sum + item.amount, 0);
      if (actual) (delta.cost ? payment : gains).push({ type: delta.type === 'fate' && delta.cost ? 'fate' : 'stat', label: labels[delta.type], stat: delta.type, amount: actual });
    }
    if (applied.changes.length) summaries.push(applied.summary);
    let trade = null;
    if (action.trade) {
      trade = helpers.prepareTrades({ tradeRoutes: townRoutes(cycle, helpers), maxTrades: 3 }, selection, record);
      if (!trade.ok) return trade;
      for (const change of trade.changes) (record.resources ||= {})[change.storageKey] = change.after;
      payment.push(...trade.payment); gains.push(...trade.gains);
    }
    if (action.echo) {
      const before = integer(record.resources?.echoes ?? 0);
      if (before === null || !Number.isSafeInteger(before + 1)) return fail('INVALID_RESOURCE', '回忆回响库存无效。');
      (record.resources ||= {}).echoes = before + 1; summaries.push('回忆回响 +1');
    }
    const state = copy(ctx.state || {});
    let negotiationDraw;
    if (action.draw) {
      const pile = state.exploration?.drawStateByCycle?.[cycle]?.drawPile;
      if (!Array.isArray(pile) || pile.length < 2) return fail('DECK_REQUIRED', '请先在探索卡库中初始化牌堆，并确保至少有 2 张卡。');
      if (Object.values(automation.events).some(event => event.negotiationDraw && event.status !== 'completed')) return fail('PENDING_DRAW', '请先处理上一次荒原商人的选牌。');
      if (state.exploration.drawStateByCycle[cycle].activePiles?.flat().length) return fail('PENDING_EXPLORATION', '请先结束当前探索抽卡，再使用荒原商人。');
      negotiationDraw = { cards: pile.splice(0, 2), factions: place.factions };
    }
    if (deltas.some(item => item.type === 'progress')) {
      const stats = state.cardTracks ||= {}, track = stats.story ||= { position: 0, progress: 0 };
      track.progress = currentProgress + applied.changes.filter(item => item.type === 'progress').reduce((sum, item) => sum + item.amount, 0);
      const seen = ((state.exploration ||= {}).trackReceiptsByCycle ||= {})[cycle] ||= {};
      for (const transaction of record.explorationTrackTransactions || []) if (transaction.cycleId === cycle && transaction.type === 'progress') seen[transaction.id] = true;
    }
    let mapState;
    if (place.marker) {
      mapState = copy(ctx.mapState || {});
      const mapCycle = mapState.cycles?.[cycle];
      if (!mapCycle) return fail('MAP_REQUIRED', '请先打开地图初始化当前循环，再使用邻接城市或废墟谈判。');
      const markers = (mapCycle.tokens ||= {}).markers ||= {};
      for (const marker of Object.values(markers)) delete marker[place.marker];
      (markers[place.tileId] ||= {})[place.marker] = true;
      const snapshot = state.mapSnapshot ||= {};
      if (place.marker === 'last_city') { snapshot.lastCityTileId = place.tileId; state.mapCurrentTileHasLastCityMarker = snapshot.currentTileHasLastCityMarker = place.tileId === mapInfo(ctx).tileId; }
    }
    const pending = Boolean(action.manual || negotiationDraw || manualEffects.length), event = { id, techKey: rule.key, actionId: action.id, cycleId: cycle, stepId: 'explore',
      label: `${helpers.titleFor(eligible.card)} · ${action.label}`, negotiation: true, createdDay: day, dueDay: day, cooldownUntilDay: 0,
      kind: pending ? 'reward' : 'cooldown', status: pending ? 'pending' : 'completed', ...(!pending ? { skipTimeline: true, completedDay: day } : {}),
      rewardLabel: [...summaries, action.check ? `玩家检定：${selection.checkResult === 'success' ? '成功' : '失败'}` : '', action.manual || '',
        manualEffects.length ? `已改为手动处理：${manualEffects.map(item => `${labels[item.type]} ${item.amount > 0 ? '+' : ''}${item.amount}`).join('、')}；请自行处理豁免检定、代价及最终变化` : '',
        negotiationDraw ? `已抽取 ${negotiationDraw.cards.join('、')}；请选择一张，若能获得资源或泰坦则转入探索区结算，其余弃置` : ''].filter(Boolean).join('；') || '谈判已结算',
      targetLabel, selection, payment, gains, ...(manualEffects.length ? { manualStatEffects: manualEffects } : {}), ...(negotiationDraw ? { negotiationDraw } : {}),
      ...(trade ? { tradeSummary: trade.summary, tradeChanges: copy(trade.changes), tradeSteps: copy(trade.steps), tradeCount: trade.total, tradeExchanges: trade.exchanges } : {}) };
    if (record.titans) record.titan = String(record.titans.reduce((sum, titan) => sum + Number(titan.count ?? 1), 0));
    automation.events[id] = event;
    const receipt = { id, request: draft.shape, techKey: rule.key, actionId: action.id, cycleId: cycle, createdDay: day, status: event.status, payment: copy(payment) };
    (record.technologyActionReceipts ||= {})[id] = receipt;
    const usage = ((record.technologyNegotiations ||= {})[cycle] ||= {})[day] ||= { count: 0 };
    usage.count += 1;
    if (selection.waiveFate) usage.waivedBy = id;
    return { ok: true, operation: event, event, receipt, record, automation, state, ...(mapState ? { mapState } : {}) };
  }
  function completeDraw(ctx, helpers, draft) {
    const { record, automation, event, receipt } = draft, cycle = cycleOf(ctx), selected = ctx.selection?.cardId;
    if (!event.negotiationDraw.cards.includes(selected)) return fail('CARD_CHOICE_REQUIRED', '请在谈判能力中选择荒原商人抽出的探索卡。');
    const state = copy(ctx.state || {}), draw = state.exploration?.drawStateByCycle?.[cycle];
    if (!draw || draw.activePiles?.flat().length) return fail('PENDING_EXPLORATION', '请先结束当前探索抽卡，再处理荒原商人的选牌。');
    const dataset = ctx.explorationDataset || root.ATO_EXPLORATION_CARD_RESOURCES, card = dataset?.cards?.[`${cycle}:${selected}`];
    if (!card) return fail('CARD_DATA_REQUIRED', '探索卡资料尚未加载，请刷新页面。');
    const rewards = root.ATO_EXPLORATION_TECH_RULES || (typeof require === 'function' ? require('./exploration-tech-rules.js') : null);
    if (!rewards) return fail('RULES_UNAVAILABLE', '探索卡奖励条件规则未加载，请刷新页面。');
    const rewardContext = rewards.qualificationContext({ ...ctx, rewardFactions: event.negotiationDraw.factions }, card);
    let qualifies = rewards.qualifies(card, cycle, selected, rewardContext);
    if (qualifies === null) {
      if (ctx.selection?.qualificationConfirmed !== true || !['qualifies', 'none'].includes(ctx.selection?.qualificationResult)) {
        return fail('QUALIFICATION_REQUIRED', '奖励条件尚未明确，请补齐记录，或核对卡面后确认本次是否获得资源或泰坦。');
      }
      qualifies = ctx.selection.qualificationResult === 'qualifies';
    }
    const entries = event.negotiationDraw.cards.map(id => ({ id, name: dataset.cards[`${cycle}:${id}`]?.titleZh || dataset.cards[`${cycle}:${id}`]?.titleEn || id,
      day: ctx.day, drawnAt: new Date().toISOString(), pile: 0, negotiationId: event.id }));
    if (qualifies) {
      const chosen = entries.find(item => item.id === selected);
      const snapshot = rewards.qualificationSnapshot(rewardContext);
      if (snapshot) chosen.technologyDiplomacyContext = snapshot;
      draw.activePiles = [[chosen], []]; draw.history = [chosen]; draw.current = chosen;
      draw.discardPile = entries.filter(item => item.id !== selected);
      // The ordinary exploration tools now own all automatic effects and any
      // printed remainder, including save reminders and pile restrictions.
      state.exploration.settledByCycle ||= {}; state.exploration.settledByCycle[cycle] = {};
      state.exploration.effectStateByCycle ||= {}; state.exploration.effectStateByCycle[cycle] = {};
      if (state.exploration.lastSettlementByCycle) delete state.exploration.lastSettlementByCycle[cycle];
    } else {
      // Discarded exploration cards return to the deck after this negotiation.
      // Put them at the bottom, so the saved deck remains deterministic on retry.
      draw.drawPile.push(...entries.map(item => item.id));
    }
    event.negotiationDraw.selectedCard = selected;
    event.negotiationDraw.qualified = qualifies;
    event.status = receipt.status = event.manualStatEffects?.length ? 'pending' : 'completed';
    if (event.status === 'completed') event.completedDay = receipt.completedDay = helpers.dayOf(ctx);
    event.rewardLabel = `选择探索卡 ${selected}；${qualifies ? '已放入探索结算区，按卡面处理' : '无资源或泰坦奖励，已弃置并放回牌堆'}`
      + (event.manualStatEffects?.length ? '；巴比伦债务变化仍需手动处理（包括豁免），处理后请标记完成' : '');
    return { ok: true, operation: event, event, receipt, record, automation, state };
  }
  function canNegotiate(ctx, helpers) {
    return ['city', 'oasis', 'silver_ruin', 'underwater'].some(location => locations(ctx, { location }, helpers).length > 0);
  }
  return { catalog: copy(catalog), passiveKeys, listActions, prepareOperation, completeDraw, canNegotiate, mapInfo, relation };
});
