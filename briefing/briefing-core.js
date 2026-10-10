// 战役简报的纯逻辑（不碰 DOM）。
//
// 抽出来是给测试直接 require 的：日期轴上的点亮判定、以及「画哪几页科技树」这两条规则
// 都曾经出过错（节点只在当天亮一次、两个循环的图纸叠在一起），单独成文件才好写回归。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_BRIEFING_CORE = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  /**
   * 某一天里某个科技节点的状态。
   *
   * @param {string|null} firstDay      节点首次点亮的日期名（"T0"、"5"…），从未点亮为 null
   * @param {number} currentIndex       当前回放到的日期轴序号
   * @param {number|null} firstDayIndex 首次点亮日期在日期轴上的序号（轴外为 Infinity）
   * @param {Set<string>} todayKeys     当天新点亮的科技 key
   * @param {string} nodeKey            当前节点的科技 key
   * @param {boolean} isBaseline        当前是不是日期轴的第一天
   */
  function nodeState(firstDay, currentIndex, firstDayIndex, todayKeys, nodeKey, isBaseline) {
    // 按日期轴上的先后比，而不是比日期字符串是否相等：只要首次点亮不晚于当前这天，
    // 节点就该一直亮着。
    const unlocked = firstDayIndex !== null && firstDayIndex !== undefined && firstDayIndex <= currentIndex;
    const today = Boolean(
      !isBaseline
      && firstDay !== null
      && firstDayIndex === currentIndex
      && todayKeys
      && todayKeys.has(nodeKey)
    );
    return { unlocked, today };
  }

  /**
   * 选出要画的科技树页面。
   *
   * 接口会把「存档里有点亮记录的所有循环」的页面都回传，而简报一次只看一个循环；
   * 把多页画进同一个画布会让两张图纸在同一个坐标系里重叠。这里只取当前循环那一页，
   * 它没有节点时再退回有节点的页面（例如备份数据本身不完整）。
   */
  function selectTechPages(pages, cycleId) {
    const all = Array.isArray(pages) ? pages : [];
    const wanted = all.filter((page) => page && page.cycleId === cycleId && (page.nodes || []).length);
    if (wanted.length) return wanted;
    const withNodes = all.filter((page) => page && (page.nodes || []).length);
    return withNodes.length ? withNodes : all;
  }

  /** 回放只保留最后一份备份仍已点亮、且能定位到首次点亮日期的节点。 */
  function replayTechPages(pages, timeline) {
    const days = (timeline || []).filter((day) => day.present);
    const last = days[days.length - 1];
    const unlocked = new Set(last?.tech?.unlocked || []);
    const dates = new Set(days.map((day) => String(day.day)));
    return (pages || []).map((page) => ({ ...page, nodes: (page.nodes || []).filter((node) => unlocked.has(node.key) && node.firstDay != null && node.firstDay !== '' && dates.has(String(node.firstDay))) }));
  }

  /** 只滚动图面自身，避免回放把整页带走。 */
  function focusViewport(canvas, point, scale, centeredPadding = false) {
    if (!point || !canvas.clientWidth || !canvas.clientHeight) return;
    canvas.scrollLeft = Math.max(0, point.x * scale - (centeredPadding ? 0 : canvas.clientWidth / 2));
    canvas.scrollTop = Math.max(0, point.y * scale - (centeredPadding ? 0 : canvas.clientHeight / 2));
  }

  /** 与主控台一致：v1 的实体卡位置换成 A 面步骤，v2 直接使用 A/B 步骤。 */
  function resolveCardTracks(snapshot, cycleData) {
    const source = snapshot || {};
    const tracks = source.cardTracks || {};
    const counters = source.cardCounters || {};
    const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const result = {};
    ['story', 'doom'].forEach((kind) => {
      const raw = tracks[kind] || {};
      const known = own(tracks, kind) || own(counters, kind) || own(counters, `${kind}Count`);
      const deck = (cycleData && cycleData[`${kind}Steps`]) || [];
      let position = count(raw.position ?? counters[kind] ?? counters[`${kind}Count`]);
      let progress = count(raw.progress);
      if (source.cardTracks && Number(source.cardTracksVersion) !== 2 && position > 0) position = (position - 1) * 2 + 1;
      if (deck.length && position > deck.length) { position = deck.length; progress = 0; }
      const card = known ? deck[position > 0 ? position - 1 : 0] || null : null;
      result[kind] = { known, position, progress, doom: count(raw.doom), card, total: deck.length, preview: known && position === 0 };
    });
    return result;
  }

  /** 缺口日沿用前一份已知状态，明确指出来自哪一天，避免凭空补记录。 */
  function cardStateAt(days, index) {
    const selected = days[index];
    if (!selected) return { cards: null, sourceDay: '', gap: false };
    let entry = selected;
    if (!selected.present) {
      entry = days.slice(0, index).reverse().find((day) => day.present) || null;
    }
    return { cards: entry && entry.cards || null, progress: entry && entry.progress || null, sourceDay: entry && entry.title || '', gap: !selected.present };
  }

  function resolveCampaignProgress(snapshot, cycleId, hubs) {
    const source = snapshot || {};
    const raw = source.cardTracks?.inwardOdyssey;
    const legacy = source.cardCounters || {};
    const known = raw != null || legacy.inwardOdyssey != null || legacy.inwardOdysseyCount != null;
    const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    const start = { c1: 0, c2: 20, c3: 40, c4: 60, c5: 80 }[cycleId] || 0;
    const inward = { known, position: known ? count(raw?.position ?? legacy.inwardOdyssey ?? legacy.inwardOdysseyCount) || start : 0, progress: count(raw?.progress) };
    const data = source.adventureHubs;
    const rows = (hubs || []).map((hub) => {
      const checked = new Set(data?.checked?.[hub.id] || []);
      const boxes = hub.boxes.map(([id, label]) => ({ id, label, checked: checked.has(id), active: data?.activeHub === hub.id && data?.activeBox === id }));
      return { ...hub, boxes, done: boxes.filter((box) => box.checked).length, active: data?.activeHub === hub.id };
    });
    return { inward, hubs: { known: data != null, rows, done: rows.reduce((sum, row) => sum + row.done, 0), total: rows.reduce((sum, row) => sum + row.boxes.length, 0) } };
  }

  return { nodeState, selectTechPages, replayTechPages, focusViewport, resolveCardTracks, cardStateAt, resolveCampaignProgress };
});
