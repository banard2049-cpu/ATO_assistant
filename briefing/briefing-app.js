// 战役简报主逻辑：取数、日期轴、回放、逐日清单。
(function () {
  'use strict';

  const API = 'api.php';
  const els = {
    body: document.body,
    headSub: document.getElementById('headSub'),
    title: document.getElementById('briefingTitle'),
    recordedCount: document.getElementById('recordedCount'),
    exploredCount: document.getElementById('exploredCount'),
    unlockedCount: document.getElementById('unlockedCount'),
    storyProgressCount: document.getElementById('storyProgressCount'),
    doomProgressCount: document.getElementById('doomProgressCount'),
    cycleSelect: document.getElementById('cycleSelect'),
    refreshButton: document.getElementById('refreshButton'),
    exportFilesButton: document.getElementById('exportFilesButton'),
    exportButtonLabel: document.getElementById('exportButtonLabel'),
    briefingBody: document.getElementById('briefingBody'),
    dayIndex: document.getElementById('dayIndex'),
    dayTitle: document.getElementById('dayTitle'),
    dayMeta: document.getElementById('dayMeta'),
    prevButton: document.getElementById('prevButton'),
    playButton: document.getElementById('playButton'),
    nextButton: document.getElementById('nextButton'),
    speedSelect: document.getElementById('speedSelect'),
    dayRange: document.getElementById('dayRange'),
    axisTicks: document.getElementById('axisTicks'),
    mapCanvas: document.getElementById('mapCanvas'),
    mapStage: document.getElementById('mapStage'),
    mapSummary: document.getElementById('mapSummary'),
    mapNewList: document.getElementById('mapNewList'),
    techCanvas: document.getElementById('techCanvas'),
    techSvg: document.getElementById('techSvg'),
    techSummary: document.getElementById('techSummary'),
    techNewList: document.getElementById('techNewList'),
    logList: document.getElementById('logList'),
    notice: document.getElementById('notice'),
    noticeTitle: document.getElementById('noticeTitle'),
    noticeText: document.getElementById('noticeText'),
    noticeActions: document.getElementById('noticeActions'),
  };

  const state = {
    payload: null,
    cycleId: '',
    days: [],
    index: 0,
    timer: 0,
    map: null,
    tech: null,
    exporting: false,
  };
  const cardEls = Object.fromEntries(['story', 'doom'].map((kind) => [kind, Object.fromEntries(
    ['Button', 'Image', 'Side', 'Progress', 'Summary', 'Empty', 'Name', 'Note'].map((part) => [part.toLowerCase(), document.getElementById(`${kind}Card${part}`)])
  )]));
  const cardPreview = document.getElementById('cardPreviewDialog');

  function showNotice(title, text, actions) {
    els.notice.hidden = false;
    els.briefingBody.hidden = true;
    els.noticeTitle.textContent = title;
    els.noticeText.textContent = text || '';
    els.noticeActions.textContent = '';
    (actions || []).forEach((action) => {
      const node = action.href ? document.createElement('a') : document.createElement('button');
      node.textContent = action.label;
      node.className = action.href ? 'ghost-button link-button' : 'primary-button';
      if (action.href) {
        node.href = action.href;
      } else {
        node.type = 'button';
        node.addEventListener('click', action.onClick);
      }
      els.noticeActions.appendChild(node);
    });
  }

  function hideNotice() {
    els.notice.hidden = true;
    els.briefingBody.hidden = false;
  }

  // 每次 load 都领一个递增的 token；慢的旧请求回来时发现 token 已经不是最新的，
  // 就整个丢掉，保证「最后一次选择」赢（否则界面会被旧循环覆盖）。
  let loadToken = 0;
  let loadAbort = null;

  async function load(cycleId) {
    if (state.exporting) return;
    const token = ++loadToken;
    if (loadAbort) loadAbort.abort();
    const controller = new AbortController();
    loadAbort = controller;
    stopPlay();
    if (els.exportFilesButton) els.exportFilesButton.disabled = true;
    setExportStatus('');
    els.headSub.textContent = '正在读取每日备份…';
    const query = new URLSearchParams();
    if (cycleId) query.set('cycle', cycleId);
    let payload;
    try {
      const response = await fetch(`${API}${query.toString() ? `?${query}` : ''}`, { cache: 'no-store', signal: controller.signal });
      payload = await response.json();
      if (!response.ok && !payload.code) throw new Error(`HTTP ${response.status}`);
      if (payload.ok && payload.source === 'android-daily-backups') {
        const dictionaryResponse = await fetch('../technology/tech_card_dictionary.min.json', { cache: 'no-store', signal: controller.signal });
        if (!dictionaryResponse.ok) throw new Error(`科技字典 HTTP ${dictionaryResponse.status}`);
        payload = window.ATO_BRIEFING_LOCAL.build(payload, window.ATO_MAP_DATA, await dictionaryResponse.json());
      }
    } catch (error) {
      // 被更新的请求取代（含 abort）时，连错误提示也不要弹。
      if (token !== loadToken) return;
      showNotice('读不到简报数据', `请求 ${API} 失败：${String(error && error.message ? error.message : error)}\n请确认程序仍在运行，然后重新读取。`, [
        { label: '重新读取', onClick: () => load(state.cycleId) },
        { label: '回主控台', href: '../' },
      ]);
      return;
    }

    // 到这里说明请求成功返回，但期间可能已经有更新的请求出发了：那就什么都不碰。
    if (token !== loadToken) return;

    if (payload.code === 'AUTH_REQUIRED') {
      showNotice('请先登录', '战役简报读取的是当前账号的每日存档备份，需要先登录主控台。', [
        { label: '去登录', href: '../' },
        { label: '已登录，重新读取', onClick: () => load(state.cycleId) },
      ]);
      return;
    }
    if (!payload.ok) {
      showNotice('读不到简报数据', String(payload.error || '接口返回了异常结果。'), [
        { label: '重新读取', onClick: () => load(state.cycleId) },
      ]);
      return;
    }

    state.payload = payload;
    state.cycleId = payload.cycle.cycleId;
    els.body.dataset.cycle = payload.cycle.cycleId;
    renderCycleOptions(payload);

    if (!payload.hasData) {
      showNotice('这个循环还没有每日备份', payload.message || '推进一天后再回来看看。', [
        { label: '换个循环', onClick: () => els.cycleSelect.focus() },
        { label: '回主控台', href: '../' },
      ]);
      if (els.exportFilesButton) els.exportFilesButton.disabled = true;
      return;
    }

    hideNotice();
    state.days = buildDays(payload.timeline);
    buildRenderers(payload);
    renderAxis();
    renderLog();
    if (els.exportFilesButton) els.exportFilesButton.disabled = !window.ATO_BRIEFING_REPORT;
    selectDay(initialIndex());
  }

  function initialIndex() {
    const requested = new URLSearchParams(window.location.search).get('day');
    if (requested != null && requested !== '') {
      const byDay = state.days.findIndex((entry) => entry.day === requested);
      if (byDay >= 0) return byDay;
      const byIndex = Number(requested);
      if (Number.isInteger(byIndex) && byIndex >= 0 && byIndex < state.days.length) return byIndex;
    }
    // 默认停在最后一天：打开简报先看到「现在」，再拖回过去。
    return Math.max(0, state.days.length - 1);
  }

  function buildDays(timeline) {
    return (timeline || []).map((entry) => ({
      index: entry.index,
      day: entry.day,
      title: entry.title,
      present: Boolean(entry.present),
      savedAtLocal: entry.savedAtLocal || '',
      location: entry.location || '',
      objective: entry.objective || '',
      reminder: entry.reminder || '',
      notes: entry.notes || '',
      dateNotes: entry.dateNotes || [],
      mapSync: entry.mapSync || [],
      story: entry.story || null,
      heroes: entry.heroes || null,
      surveyActive: entry.surveyActive || '',
      pharosActive: entry.pharosActive || '',
      mainStoryActive: entry.mainStoryActive || '',
      cards: window.ATO_BRIEFING_CORE.resolveCardTracks(entry, window.ATO_STORY_DOOM_DATA?.cycles?.[state.cycleId]),
      progress: window.ATO_BRIEFING_CORE.resolveCampaignProgress(entry, state.cycleId, window.ATO_BRIEFING_HUBS?.[state.cycleId]),
      map: entry.map || null,
      tech: entry.tech || null,
      changes: entry.changes || [],
    }));
  }

  function renderCycleOptions(payload) {
    const options = (payload.cycles || []).filter((entry) => entry.profileId === payload.cycle.profileId);
    els.cycleSelect.textContent = '';
    options.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.cycleId;
      option.textContent = `${entry.label}（当前第 ${entry.day === '' ? '?' : entry.day} 天）`;
      option.selected = entry.cycleId === payload.cycle.cycleId;
      els.cycleSelect.appendChild(option);
    });
    if (!options.length) {
      const option = document.createElement('option');
      option.value = payload.cycle.cycleId;
      option.textContent = payload.cycle.label;
      option.selected = true;
      els.cycleSelect.appendChild(option);
    }
    const summary = payload.summary || {};
    const latest = (payload.timeline || []).slice().reverse().find((entry) => entry.present);
    els.recordedCount.textContent = String(summary.recordedDays || 0);
    els.exploredCount.textContent = String(latest && latest.map ? latest.map.exploredCount : 0);
    els.unlockedCount.textContent = String(latest && latest.tech ? latest.tech.unlocked.length : 0);
    const cards = window.ATO_BRIEFING_CORE.resolveCardTracks(latest, window.ATO_STORY_DOOM_DATA?.cycles?.[payload.cycle.cycleId]);
    els.storyProgressCount.textContent = cards.story.known ? String(cards.story.progress) : '—';
    els.doomProgressCount.textContent = cards.doom.known ? String(cards.doom.progress) : '—';
    const first = summary.firstDay == null || summary.firstDay === '' ? '—' : shortDay(summary.firstDay);
    const last = summary.lastDay == null || summary.lastDay === '' ? '—' : shortDay(summary.lastDay);
    els.headSub.textContent = summary.recordedDays
      ? `${payload.cycle.label} · 记录范围 ${first} — ${last} · 以每日备份为准`
      : `${payload.cycle.label} · 等待第一份每日备份`;
    window.ATO_CYCLE_SYMBOLS && window.ATO_CYCLE_SYMBOLS.prependTitleIcon(els.title, payload.cycle.cycleId, '../');
  }

  function normalizeAssetPath(path) {
    if (!path) return '';
    if (/^(?:https?:)?\/\//.test(path) || path.startsWith('/')) return path;
    return `../map/${String(path).replace(/^\.\//, '')}`;
  }

  function buildRenderers(payload) {
    const mapTiles = (payload.map.tiles || []).map((tile) => ({
      ...tile,
      front: normalizeAssetPath(tile.front),
      back: normalizeAssetPath(tile.back),
    }));
    const order = state.days.filter((entry) => entry.map).flatMap((entry) => entry.map.new);
    const orderedIds = [];
    mapTiles.forEach((tile) => {
      if (!orderedIds.includes(tile.id)) orderedIds.push(tile.id);
    });
    order.forEach((id) => {
      if (!orderedIds.includes(id)) orderedIds.push(id);
    });

    state.map = window.ATO_BRIEFING_MAP.create({
      canvas: els.mapCanvas,
      stage: els.mapStage,
      cycle: payload.map.cycle,
      canvasSize: payload.map.canvas,
      tiles: mapTiles,
      order: orderedIds,
      // 板块左上角标「第一次翻开的日期」，日期从日期轴上来。
      days: state.days,
    });

    state.tech = window.ATO_BRIEFING_TECH.create({
      svg: els.techSvg,
      canvas: els.techCanvas,
      // 只画当前循环那一页科技树。接口会把「存档里有点亮记录的所有循环页面」都回传，
      // 直接整份画出来会把两个循环的图纸叠在同一个坐标系里（看起来像两张图重叠）。
      pages: window.ATO_BRIEFING_CORE.selectTechPages(payload.tech.pages, payload.cycle.cycleId),
      // 回放要按日期轴上的先后比大小，所以把时间轴一并交给科技树渲染器。
      timeline: state.days,
    });
    updateZoomLabels();
  }

  function renderAxis() {
    els.dayRange.min = '0';
    els.dayRange.max = String(Math.max(0, state.days.length - 1));
    els.axisTicks.textContent = '';
    const step = Math.max(1, Math.ceil(state.days.length / 26));
    state.days.forEach((entry, index) => {
      if (index % step !== 0 && index !== state.days.length - 1) return;
      const tick = document.createElement('span');
      tick.textContent = shortDay(entry.day);
      tick.dataset.index = String(index);
      if (!entry.present) tick.classList.add('gap');
      els.axisTicks.appendChild(tick);
    });
  }

  function shortDay(day) {
    return String(day).startsWith('T') ? String(day) : `D${day}`;
  }

  function selectDay(index) {
    if (!state.days.length) return;
    const clamped = Math.min(Math.max(0, index), state.days.length - 1);
    state.index = clamped;
    const entry = state.days[clamped];
    els.dayRange.value = String(clamped);

    els.dayIndex.textContent = `${clamped + 1} / ${state.days.length}`;
    els.prevButton.disabled = clamped === 0;
    els.nextButton.disabled = clamped === state.days.length - 1;
    els.playButton.disabled = state.days.length < 2 || state.exporting;
    els.dayTitle.textContent = entry.title;
    const meta = [];
    if (!entry.present) meta.push('无记录');
    if (entry.savedAtLocal) meta.push(`备份 ${entry.savedAtLocal}`);
    if (entry.location) meta.push(`位置 ${entry.location}`);
    els.dayMeta.textContent = meta.join(' · ');

    Array.from(els.axisTicks.children).forEach((tick) => {
      tick.classList.toggle('current', Number(tick.dataset.index) === clamped);
    });

    const mapResult = state.map ? state.map.render(entry.present ? entry : null) : null;
    const techResult = state.tech ? state.tech.render(entry.present ? entry : null) : null;

    // 地图标的是游戏里的第几天（与日期轴同一套写法 T3 / D3），不写带总数的「N / M 格」，
    // 具体格数放进悬停提示。
    const mapSummaryDay = window.ATO_BRIEFING_MAP && typeof window.ATO_BRIEFING_MAP.dayLabel === 'function'
      ? window.ATO_BRIEFING_MAP.dayLabel(entry.day)
      : '';
    if (mapResult) {
      els.mapSummary.textContent = mapSummaryDay || '—';
      els.mapSummary.title = `已翻开 ${mapResult.visible} 格`;
    } else {
      els.mapSummary.textContent = '—';
      els.mapSummary.title = '';
    }
    const newlyFound = entry.present && entry.map ? entry.map.new : [];
    els.mapNewList.textContent = '';
    if (!entry.present) {
      els.mapNewList.textContent = '这一天没有备份，地图停在上一份记录的状态。';
    } else if (newlyFound.length) {
      els.mapNewList.innerHTML = `本次翻开：<strong>${escapeHtml(newlyFound.join('、'))}</strong>`;
    } else if (clamped === 0) {
      els.mapNewList.textContent = '基线：这是这一轮最早的一份备份。';
    } else {
      els.mapNewList.textContent = '这一天没有新翻开的板块。';
    }

    if (techResult) {
      els.techSummary.textContent = `${techResult.unlocked} / ${techResult.total} 项 · 仅显示本轮已点亮`;
    } else {
      els.techSummary.textContent = '—';
    }
    const newTech = entry.present && entry.tech ? entry.tech.new : [];
    els.techNewList.textContent = '';
    if (!entry.present) {
      els.techNewList.textContent = '这一天没有备份，科技树停在上一份记录的状态。';
    } else if (newTech.length) {
      els.techNewList.innerHTML = `本次点亮：<strong>${escapeHtml(newTech.map(techLabel).join('、'))}</strong>`;
    } else if (clamped === 0) {
      els.techNewList.textContent = '基线：这是这一轮最早的一份备份。';
    } else {
      els.techNewList.textContent = '这一天没有新点亮的科技。';
    }

    renderCards(clamped);
    renderCampaignProgress(clamped);
    highlightLog(clamped);
    syncUrl(entry);
  }

  function cardCounts(kind, track) {
    return `进展 ${track.progress}${kind === 'doom' ? ` · 灾祸 ${track.doom}` : ''}`;
  }

  function renderCampaignProgress(index) {
    const view = window.ATO_BRIEFING_CORE.cardStateAt(state.days, index);
    const progress = view.progress;
    const inward = progress?.inward;
    document.getElementById('inwardPosition').textContent = inward?.known ? String(inward.position) : '—';
    document.getElementById('inwardProgress').textContent = inward?.known ? `知识等级 · 进展 ${inward.progress}` : '这份备份没有知识记录';
    const hubs = progress?.hubs;
    document.getElementById('hubProgressSummary').textContent = hubs?.known ? `${hubs.done} / ${hubs.total} 分支` : '无记录';
    const list = document.getElementById('hubProgressList');
    list.textContent = '';
    if (!hubs?.known) {
      list.textContent = '这份备份没有冒险中枢记录。';
    } else {
      hubs.rows.forEach((hub) => {
        const row = document.createElement('div');
        row.className = `hub-progress-row${hub.active ? ' active' : ''}`;
        const name = document.createElement('span');
        name.className = 'hub-name';
        name.textContent = hub.name;
        const boxes = document.createElement('span');
        boxes.className = 'hub-boxes';
        boxes.setAttribute('aria-label', `${hub.name}：已勾选 ${hub.done} / ${hub.boxes.length} 分支`);
        hub.boxes.forEach((box) => {
          const marker = document.createElement('span');
          marker.className = `hub-box${box.checked ? ' checked' : ''}${box.active ? ' current' : ''}`;
          marker.title = `${box.label} · ${box.checked ? '已勾选' : '未勾选'}${box.active ? ' · 当前分支' : ''}`;
          marker.textContent = box.label === 'α' || box.label === 'Ω' ? box.label : '';
          boxes.appendChild(marker);
        });
        const count = document.createElement('span');
        count.className = 'hub-count';
        count.textContent = `${hub.done}/${hub.boxes.length}`;
        row.append(name, boxes, count);
        list.appendChild(row);
      });
    }
    document.getElementById('progressSource').textContent = view.gap ? (view.sourceDay ? `无当日备份 · 沿用${view.sourceDay}` : '此前没有备份') : '实心：已勾选 · 外框：当前分支';
  }

  function updateZoomLabels() {
    ['map', 'tech'].forEach((kind) => {
      if (state[kind]) document.getElementById(`${kind}Zoom`).textContent = `${Math.round(state[kind].zoom() * 100)}%`;
    });
  }

  function fitCardSpread() {
    const story = cardEls.story.image;
    const doom = cardEls.doom.image;
    if (cardEls.story.button.hidden || cardEls.doom.button.hidden || !story.naturalHeight || !doom.naturalHeight) return;
    // 不同循环卡图比例略有不同，按比例分配宽度，让两张完整图片等高、无缝相接。
    document.querySelector('.card-spread').style.gridTemplateColumns = `minmax(0, ${story.naturalWidth / story.naturalHeight}fr) minmax(0, ${doom.naturalWidth / doom.naturalHeight}fr)`;
  }

  function renderCards(index) {
    const view = window.ATO_BRIEFING_CORE.cardStateAt(state.days, index);
    ['story', 'doom'].forEach((kind) => {
      const nodes = cardEls[kind];
      const track = view.cards && view.cards[kind];
      const label = kind === 'story' ? '故事卡' : '灾祸卡';
      const card = track && track.card;
      nodes.summary.textContent = track && track.known
        ? `${track.preview ? '未开始 · 下张 ' : ''}${card ? card.label : '—'} / ${track.total || '—'}` : '无卡片记录';
      nodes.name.textContent = card ? card.name : '';
      nodes.note.textContent = track && track.known ? cardCounts(kind, track) : '';
      if (view.gap) nodes.note.textContent += `${nodes.note.textContent ? ' · ' : ''}${view.sourceDay ? `沿用${view.sourceDay}备份` : '此前没有备份'}`;
      nodes.button.hidden = true;
      nodes.empty.hidden = false;
      nodes.empty.textContent = track && track.known ? '没有对应卡面。' : `这份备份没有${label}记录。`;
      if (!card || !card.image) return;
      nodes.side.textContent = `${track.preview ? '下张预览 · ' : ''}${card.label}`;
      nodes.progress.textContent = cardCounts(kind, track);
      nodes.image.alt = `${label} ${card.label} · ${card.name}`;
      nodes.image.onload = () => {
        nodes.button.hidden = false;
        nodes.empty.hidden = true;
        fitCardSpread();
      };
      nodes.image.onerror = () => {
        nodes.button.hidden = true;
        nodes.empty.hidden = false;
        nodes.empty.textContent = `${card.label} · ${card.name}\n本地卡图尚未安装。`;
      };
      nodes.empty.textContent = '正在读取卡图…';
      nodes.image.src = `../${card.image.replace(/^\.\//, '')}`;
      if (nodes.image.complete && nodes.image.naturalWidth) {
        nodes.button.hidden = false;
        nodes.empty.hidden = true;
        fitCardSpread();
      }
    });
  }

  ['story', 'doom'].forEach((kind) => {
    cardEls[kind].button.addEventListener('click', () => {
      stopPlay();
      const nodes = cardEls[kind];
      document.getElementById('cardPreviewTitle').textContent = `${kind === 'story' ? '故事卡' : '灾祸卡'} · ${nodes.side.textContent}`;
      document.getElementById('cardPreviewProgress').textContent = nodes.note.textContent;
      const image = document.getElementById('cardPreviewImage');
      image.src = nodes.image.src;
      image.alt = nodes.image.alt;
      cardPreview.showModal();
    });
  });
  document.getElementById('cardPreviewClose').addEventListener('click', () => cardPreview.close());
  cardPreview.addEventListener('click', (event) => {
    if (event.target !== cardPreview) return;
    const bounds = cardPreview.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) cardPreview.close();
  });

  function techLabel(key) {
    const records = (state.payload.tech.unlocked || []).filter((record) => record.key === key);
    return records.length ? records[0].name : key;
  }

  function syncUrl(entry) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('cycle', state.cycleId);
      url.searchParams.set('day', entry.day);
      window.history.replaceState(null, '', url.toString());
    } catch { /* 隐私模式下改地址栏失败无所谓 */ }
  }

  function renderLog() {
    els.logList.textContent = '';
    state.days.forEach((entry) => {
      const item = document.createElement('li');
      item.className = `log-day${entry.present ? '' : ' gap'}`;
      item.dataset.index = String(entry.index);

      const marker = document.createElement('span');
      marker.className = 'log-day-marker';
      marker.textContent = shortDay(entry.day);
      marker.setAttribute('aria-hidden', 'true');
      item.appendChild(marker);
      const content = document.createElement('div');
      content.className = 'log-day-content';
      item.appendChild(content);

      const head = document.createElement('div');
      head.className = 'log-day-head';
      const title = document.createElement('span');
      title.className = 'log-day-title';
      title.textContent = entry.title;
      head.appendChild(title);

      const meta = document.createElement('span');
      meta.className = 'log-day-meta';
      const metaParts = [];
      if (!entry.present) metaParts.push('无记录');
      if (entry.savedAtLocal) metaParts.push(entry.savedAtLocal);
      if (entry.present && entry.map) metaParts.push(`已翻开 ${entry.map.exploredCount} 格`);
      if (entry.present && entry.tech) metaParts.push(`已点亮 ${entry.tech.unlocked.length} 项`);
      meta.textContent = metaParts.join(' · ');
      head.appendChild(meta);
      content.appendChild(head);

      if (entry.present) {
        const detail = summarize(entry);
        if (detail) {
          const detailNode = document.createElement('p');
          detailNode.className = 'log-detail';
          detailNode.textContent = detail;
          content.appendChild(detailNode);
        }
        const tags = document.createElement('div');
        tags.className = 'log-tags';
        entry.changes.filter((change) => change.kind !== 'mapsync').forEach((change) => {
          const tag = document.createElement('span');
          tag.className = `log-tag ${change.kind}`;
          tag.textContent = change.items && change.items.length
            ? `${change.label}：${truncate(change.items.join('、'), 60)}`
            : change.label;
          tag.title = tag.textContent;
          tags.appendChild(tag);
        });
        if (tags.children.length) content.appendChild(tags);
      } else {
        const empty = document.createElement('p');
        empty.className = 'log-empty';
        empty.textContent = '这天没有留下备份：差分从上一份记录直接跳到下一份。';
        content.appendChild(empty);
      }

      if (entry.present) {
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.addEventListener('click', () => {
          stopPlay();
          selectDay(entry.index);
        });
        item.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          stopPlay();
          selectDay(entry.index);
        });
      }
      els.logList.appendChild(item);
    });
  }

  function summarize(entry) {
    const parts = [];
    if (entry.objective) parts.push(`目标：${entry.objective}`);
    if (entry.reminder) parts.push(`提醒：${entry.reminder}`);
    if (entry.story && entry.story.section) parts.push(`故事：${entry.story.section}`);
    if (entry.dateNotes && entry.dateNotes.length) parts.push(`日期笔记 ${entry.dateNotes.length} 条`);
    if (entry.notes && entry.notes.trim() && entry.mapSync.length === 0) parts.push('附有备注');
    return truncate(parts.join('；'), 200);
  }

  function highlightLog(index) {
    // 只滚动清单自己，不用 scrollIntoView：那会把整页一起滚下去，正在看的科技树就被
    // 顶出视野了。这里直接调整清单容器的 scrollTop。
    const list = els.logList;
    const active = Array.from(list.children).find((node) => Number(node.dataset.index) === index) || null;
    Array.from(list.children).forEach((node) => {
      node.classList.toggle('active', node === active);
      if (node === active) node.setAttribute('aria-current', 'true');
      else node.removeAttribute('aria-current');
    });
    if (!active) return;
    const listTop = list.scrollTop;
    const listBottom = listTop + list.clientHeight;
    const itemTop = active.offsetTop;
    const itemBottom = itemTop + active.offsetHeight;
    if (itemBottom > listBottom) {
      list.scrollTop = itemBottom - list.clientHeight;
    } else if (itemTop < listTop) {
      list.scrollTop = itemTop;
    }
  }

  function startPlay() {
    if (state.days.length < 2 || state.exporting) return;
    if (state.index >= state.days.length - 1) selectDay(0);
    stopPlay();
    els.playButton.textContent = '暂停';
    els.playButton.setAttribute('aria-pressed', 'true');
    els.playButton.classList.remove('primary-button');
    const tick = () => {
      if (state.index >= state.days.length - 1) {
        stopPlay();
        return;
      }
      selectDay(state.index + 1);
      state.timer = window.setTimeout(tick, Number(els.speedSelect.value) || 900);
    };
    state.timer = window.setTimeout(tick, Number(els.speedSelect.value) || 900);
  }

  function stopPlay() {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = 0;
    els.playButton.textContent = '播放';
    els.playButton.setAttribute('aria-pressed', 'false');
    els.playButton.classList.add('primary-button');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function truncate(value, max) {
    const text = String(value || '');
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }

  // ---------- 事件 ----------
  document.querySelectorAll('[data-zoom]').forEach((button) => button.addEventListener('click', () => {
    const renderer = state[button.dataset.zoom];
    if (!renderer) return;
    if (button.dataset.fit) renderer.fitView();
    else renderer.setZoom(renderer.zoom() + Number(button.dataset.step));
    updateZoomLabels();
  }));

  els.cycleSelect.addEventListener('change', () => {
    load(els.cycleSelect.value);
  });
  els.refreshButton.addEventListener('click', () => load(state.cycleId));
  els.prevButton.addEventListener('click', () => { stopPlay(); selectDay(state.index - 1); });
  els.nextButton.addEventListener('click', () => { stopPlay(); selectDay(state.index + 1); });
  els.playButton.addEventListener('click', () => {
    if (state.timer) stopPlay();
    else startPlay();
  });
  els.speedSelect.addEventListener('change', () => {
    if (state.timer) startPlay();
  });
  els.dayRange.addEventListener('input', () => {
    stopPlay();
    selectDay(Number(els.dayRange.value));
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target.closest('button, a, [role="button"]')) return;
    if (event.key === 'ArrowLeft') { stopPlay(); selectDay(state.index - 1); }
    else if (event.key === 'ArrowRight') { stopPlay(); selectDay(state.index + 1); }
    else if (event.key === ' ') { event.preventDefault(); els.playButton.click(); }
  });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => {
      state.map && state.map.resize();
      state.tech && state.tech.resize();
      updateZoomLabels();
      if (state.days.length && !els.briefingBody.hidden) highlightLog(state.index);
    });
    observer.observe(els.mapCanvas);
    observer.observe(els.techCanvas);
  } else {
    window.addEventListener('resize', () => {
      state.map && state.map.resize();
      state.tech && state.tech.resize();
      updateZoomLabels();
      if (state.days.length && !els.briefingBody.hidden) highlightLog(state.index);
    });
  }
  // 地图/科技树回放 GIF + 逐日简报 PDF（打成一个 zip）。渲染是逐帧的，几十帧要跑一会儿，
  // 所以按钮禁用 + 状态行显示进度，避免重复点击。
  const exportStatus = document.getElementById('exportStatus');
  function setExportStatus(text, status) {
    if (!exportStatus) return;
    exportStatus.hidden = !text;
    exportStatus.textContent = text || '';
    exportStatus.dataset.state = status || 'progress';
  }
  if (els.exportFilesButton) {
    els.exportFilesButton.addEventListener('click', async () => {
      if (!window.ATO_BRIEFING_REPORT || !state.payload || !state.payload.hasData || !state.map || state.exporting) return;
      stopPlay();
      state.exporting = true;
      els.exportFilesButton.disabled = true;
      els.exportFilesButton.setAttribute('aria-busy', 'true');
      els.exportButtonLabel.textContent = '正在导出…';
      els.cycleSelect.disabled = true;
      els.refreshButton.disabled = true;
      els.playButton.disabled = true;
      setExportStatus('准备导出…');
      try {
        await window.ATO_BRIEFING_REPORT.run({
          payload: state.payload,
          days: state.days,
          map: state.map,
          onStatus: setExportStatus,
        });
      } catch (error) {
        setExportStatus(`导出失败：${String(error && error.message ? error.message : error)}`, 'error');
      } finally {
        state.exporting = false;
        els.exportFilesButton.disabled = false;
        els.exportFilesButton.setAttribute('aria-busy', 'false');
        els.exportButtonLabel.textContent = '导出 GIF / PDF';
        els.cycleSelect.disabled = false;
        els.refreshButton.disabled = false;
        els.playButton.disabled = state.days.length < 2;
      }
    });
  }

  load(new URLSearchParams(window.location.search).get('cycle') || '');
})();
