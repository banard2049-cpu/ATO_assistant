// 战役简报的科技树回放。
//
// 布局整份复用科技树页面那一套：technology/tech-page-layout.js 提供图纸尺寸/对齐/战局
// 格位，technology/tech-tree.js 负责构图、布点、走线与共线段拆分，所以简报里的节点位置
// 和连线跟科技树页面完全一致。简报只改「截至第 N 天为止哪些节点已点亮」。
//
// 判定「已点亮」必须按日期轴上的先后比，不能比日期字符串是否相等：
// 节点存的是首次点亮的日期名（"T0"、"5"…），回放到任意一天时，只要该节点首次点亮的
// 日期不晚于当前这一天，它就应当亮着。早期版本用字符串相等判断，结果每个节点只在
// 「它自己点亮的那一天」亮一次、其余日子全是灰的，看起来就像一棵没点亮的树。
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  // 点亮判定放在 briefing-core.js 里（纯逻辑，测试直接 require）。
  const core = window.ATO_BRIEFING_CORE || {};
  const nodeState = core.nodeState;

  function create(options) {
    const svg = options.svg;
    const canvas = options.canvas;
    const autoFocus = options.autoFocus !== false;
    // 日期轴上的先后关系：节点存的是「首次点亮的日期名」，回放时要把名字换算成序号才能比大小。
    const dayIndex = new Map();
    (options.timeline || []).forEach((entry) => {
      const index = Number(entry.index);
      if (Number.isFinite(index)) dayIndex.set(String(entry.day), index);
    });
    const pages = core.replayTechPages(options.pages, options.timeline).map((page) => buildPage(page, dayIndex));
    const rendered = pages.filter((entry) => entry.layout);
    let scale = 1.6;
    let overview = false;
    let focusPoint = null;

    function fit() {
      if (!rendered.length) return;
      const available = canvas.clientWidth - 16;
      if (available <= 40) return;
      // 让最宽的一页正好铺满；纵向超出时容器自己滚动，字号保持可读。
      const widest = Math.max(...rendered.map((entry) => entry.layout.width));
      const tallest = Math.max(...rendered.map((entry) => entry.layout.height));
      if (overview) scale = Math.min(1.6, available / widest);
      // 四周留半个视口，让位于图纸边缘的节点也能真正居中。
      const padWidth = autoFocus && !overview ? canvas.clientWidth : 0;
      const padHeight = autoFocus && !overview ? canvas.clientHeight || 0 : 0;
      svg.setAttribute('width', String(widest * scale + padWidth));
      svg.setAttribute('height', String(tallest * scale + padHeight));
      svg.setAttribute('viewBox', `${-padWidth / (2 * scale)} ${-padHeight / (2 * scale)} ${widest + padWidth / scale} ${tallest + padHeight / scale}`);
      if (autoFocus && !overview) core.focusViewport(canvas, focusPoint, scale, true);
    }

    function render(day) {
      const currentIndex = day && day.present ? Number(day.index) : -1;
      const today = new Set((day && day.tech && day.tech.new) || []);
      // 基线那天（第一份备份）不标「本次点亮」：那天的一切都是既有状态。
      const isBaseline = currentIndex === 0;

      svg.textContent = '';
      let unlockedCount = 0;
      let total = 0;
      let focusCandidate = null;

      pages.forEach((entry) => {
        total += entry.nodes.length;
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'tech-page-group');

        const stateOf = (nodeId) => nodeState(
          entry.firstDay.get(nodeId) ?? null,
          currentIndex,
          entry.firstDayIndex.get(nodeId) ?? null,
          today,
          entry.keyById.get(nodeId),
          isBaseline,
        );

        if (entry.layout) {
          (entry.segments || []).forEach((segment) => {
            // 连线两端都亮着才算「已走通」的线。
            const live = segment.edges.every((edge) => stateOf(edge.source).unlocked && stateOf(edge.target).unlocked);
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('class', `tech-edge${live ? ' live' : ''}`);
            path.setAttribute('d', segment.path);
            group.appendChild(path);
          });

          entry.nodes.forEach((node) => {
            const position = entry.layout.positions.get(node.id);
            if (!position) return;
            const state = stateOf(node.id);
            if (state.unlocked) unlockedCount += 1;
            if (state.unlocked) {
              const rank = entry.firstDayIndex.get(node.id);
              if (!focusCandidate || rank >= focusCandidate.rank) focusCandidate = { rank, x: position.x + position.width / 2, y: position.y + position.height / 2 };
            }
            group.appendChild(renderNode(node, position, state));
          });
        }

        svg.appendChild(group);
      });

      focusPoint = focusCandidate;
      fit();
      return { unlocked: unlockedCount, total, pages: pages.length };
    }

    function resize() { fit(); }
    function setZoom(value) { overview = false; scale = Math.max(0.5, Math.min(3, value)); fit(); }
    function fitView() { overview = true; fit(); }

    return { render, resize, setZoom, fitView, zoom: () => scale };
  }

  function buildPage(page, dayIndex) {
    const api = window.ATO_TECH_TREE;
    const nodes = page.nodes || [];
    const firstDay = new Map();
    const firstDayIndex = new Map();
    const keyById = new Map();
    nodes.forEach((node) => {
      const label = node.firstDay === '' || node.firstDay == null ? null : String(node.firstDay);
      firstDay.set(node.id, label);
      // 日期轴里找不到的日期当作「从未出现」，不参与点亮。
      firstDayIndex.set(node.id, label === null ? null : (dayIndex.has(label) ? dayIndex.get(label) : Number.POSITIVE_INFINITY));
      keyById.set(node.id, node.key);
    });
    const pageMeta = findPageMeta(page.cycleId) || { key: page.page, width: 1190.55, height: 841.89 };
    if (!api || !nodes.length) {
      return { page, nodes, firstDay, firstDayIndex, keyById, layout: null, segments: [] };
    }
    const graphNodes = nodes.map((node) => {
      const box = Array.isArray(node.box) && node.box.length >= 4
        ? { x: boxValue(node.box, 0), y: boxValue(node.box, 1), w: boxValue(node.box, 2), h: boxValue(node.box, 3) }
        : { x: 28, y: 28, w: 113.386, h: 49.606 };
      return {
        id: node.id,
        // Resolve compact dictionary keys first, including cycle-qualified names;
        // English names remain the fallback. Chinese names are only for display.
        name: node.nameEn || node.name,
        key: node.rawKey || node.nameEn || node.key,
        displayName: node.name,
        tree_box: box,
        // 依赖引用原样传给 buildGraph：连线规则与科技树页面完全同源，简报不另写一套。
        requires: node.requires || [],
        requires_any_groups: node.requiresAnyGroups || [],
        xlsm_leads_to: node.xlsmLeadsTo || [],
      };
    });
    const graph = api.buildGraph(graphNodes, (node) => String(node.key).trim().toLowerCase());
    // 节点宽度按实际显示的中文名算（英文名只用于解析依赖）。
    const layout = api.layoutGraph(graph, pageMeta, (node) => moduleSize(displayNameOf(node)));
    // 与科技树页面同样先拆共线段，再把每段画成一条 path。
    const segments = typeof api.linkSegments === 'function' ? api.linkSegments(layout.edges, layout) : [];
    return { page, nodes, firstDay, firstDayIndex, keyById, layout, segments };
  }

  function boxValue(box, index) {
    const value = Number(box[index]);
    return Number.isFinite(value) ? value : 0;
  }

  function findPageMeta(cycleId) {
    const all = window.ATO_TECH_PAGE_LAYOUT || [];
    const key = `cycle${String(cycleId || '').replace(/\D/g, '')}`;
    return all.find((entry) => entry.key === key) || null;
  }

  function moduleSize(name) {
    const text = String(name || '');
    const width = Math.min(150, Math.max(76, text.length * 9 + 22));
    return { width, height: 36, totalHeight: 36 };
  }

  function displayNameOf(node) {
    return node.displayName || node.name || '';
  }

  function renderNode(node, position, state) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', `tech-node${state.unlocked ? ' unlocked' : ' locked'}${state.today ? ' today' : ''}`);
    group.setAttribute('transform', `translate(${position.x},${position.y})`);

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', position.width);
    rect.setAttribute('height', position.height);
    // 直角矩形：与主控台、科技树页面的硬边风格一致（那边节点是 border-radius: 0）。
    rect.setAttribute('rx', 0);
    group.appendChild(rect);

    const title = document.createElementNS(SVG_NS, 'title');
    const seen = state.unlocked ? firstSeenLabel(node.firstDay) : '这一轮尚未点亮';
    title.textContent = `${displayNameOf(node)} · ${seen}`;
    group.appendChild(title);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', position.width / 2);
    label.setAttribute('y', position.height / 2 + 3.5);
    label.setAttribute('text-anchor', 'middle');
    label.textContent = clip(displayNameOf(node), Math.floor((position.width - 12) / 10));
    group.appendChild(label);

    if (state.today) {
      const badge = document.createElementNS(SVG_NS, 'text');
      badge.setAttribute('class', 'node-day');
      badge.setAttribute('x', position.width / 2);
      badge.setAttribute('y', position.height - 3);
      badge.setAttribute('text-anchor', 'middle');
      badge.textContent = '本次点亮';
      group.appendChild(badge);
    }
    return group;
  }

  function firstSeenLabel(day) {
    if (day == null) return '这一轮尚未点亮';
    if (/^T\d/.test(String(day))) return `序章 T${String(day).slice(1)} 点亮`;
    return `第 ${day} 天点亮`;
  }

  function clip(text, max) {
    const value = String(text || '');
    if (max <= 1 || value.length <= max) return value;
    return `${value.slice(0, Math.max(1, max - 1))}…`;
  }

  window.ATO_BRIEFING_TECH = { create, nodeState, firstSeenLabel };
})();
