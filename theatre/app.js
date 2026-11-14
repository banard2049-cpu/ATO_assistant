(() => {
  'use strict';

  const catalog = window.ATO_THEATRE_CATALOG;
  const terms = window.ATO_THEATRE_TERMS;
  const rules = window.ATO_THEATRE_STATE;
  const $ = id => document.getElementById(id);
  const api = '../api/campaign-state.php?section=theatre';
  const session = window.ATO_CAMPAIGN_SESSION.create();
  const returnId = new URLSearchParams(location.search).get('battle');
  const mobile = matchMedia('(max-width: 760px)');
  let language = 'fan';
  try { language = localStorage.getItem('ato-term-language-v1') || language; } catch { /* Use the default. */ }
  const term = key => terms.ui(key, language);
  const cycleName = cycle => `${term('cycle')} ${rules.roman[Number(cycle.slice(1))]}`;
  const modeName = mode => ({ normal: `${term('tree')} · 普通`, cursed: `${term('tree')} · 诅咒`, custom: '自定义重打' })[mode];
  const sheetOrder = ['HEKATON', 'LABYRINTHAUROS', 'ALPHA_TEMENOS', 'CYCLONUS', 'CHIMERA_METASTASIOS', 'THE_NIETZSCJEAN',
    'HYPERTIME_ORACLE', 'ICARIAN_HARPY', 'SUN_DESCENDANT', 'HERMESIAN_PURSUER', 'THE_BURDEN',
    'MIDASCORE', 'DEMIDJINN', 'THE_BABELIAN_LUNACY', 'DRAGON_OF_PHOBOS', 'MEDUKETOS', 'UR_FLEECE',
    'DAHAKA', 'TITAN_X', 'HELIOS'];
  const statusText = { locked: '锁定', ready: '可挑战', won: '已胜利', cursed: '可打诅咒', both: '双模式已胜' };
  const cardWidth = 120;
  const cardHeight = 31;
  const routesByEdition = {};
  const graphLayouts = { all: combinedLayout() };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  let state = rules.normalize(null);
  let revision = 0;
  let dashboardCycle = '';
  let loaded = false;
  let revealed = false;
  let display = mobile.matches ? 'list' : 'graph';
  let manualDisplay = false;
  let selected = '';
  let zoom = 1;
  let zoomFit = false;
  let zoomInitialised = false;
  let positionGraphAtStart = true;
  let pending = Promise.resolve();
  let reading = false;
  let refreshPending = false;
  let busy = false;
  let returnHandled = false;
  let channel;
  let dashboardChannel;
  let cycleChannel;
  let languageChannel;
  try {
    channel = new BroadcastChannel('ato-theatre-v1');
    dashboardChannel = new BroadcastChannel('ato-dashboard-sync-v1');
    cycleChannel = new BroadcastChannel('ato-dashboard-cycle-v1');
    languageChannel = new BroadcastChannel('ato-term-language');
  } catch { /* Recheck on focus. */ }
  // A cycle's own nodes only appear once that cycle itself is ticked complete:
  // finishing c1 unlocks c1's bosses (not c2's), and so on. Until then its
  // nodes, its evolution tracks and every follow-up link that would name them
  // stay hidden.
  function cycleUnlocked(cycle) {
    return state.completed[cycle] === true;
  }
  const visibleNode = node => Boolean(node) && cycleUnlocked(node.cycle);

  function status(message, retry) {
    const target = $('save-status');
    target.textContent = message;
    target.dataset.error = String(Boolean(retry));
    if (retry) {
      const button = document.createElement('button');
      button.textContent = '重试';
      button.onclick = retry;
      target.append(button);
    }
  }

  function spoilerKey() { return `ato-theatre-spoilers-v1:${session.accountId}`; }

  async function read() {
    session.assertCurrent();
    const response = await fetch(api, { cache: 'no-store' });
    const result = session.accept(await response.json());
    if (!response.ok || !result?.ok || !session.accountId) throw new Error(result?.error || '无法读取剧场存档。');
    return { state: rules.normalize(result.state), revision: Number(result.revision) || 0, dashboardCycle: result.dashboardCycle };
  }

  async function refresh() {
    if (session.changed) { freeze(); return; }
    if (reading || busy) { refreshPending = true; return; }
    reading = true;
    try {
      const next = await read();
      if (busy) { refreshPending = true; return; }
      if (next.revision < revision) return;
      const changed = !loaded || revision !== next.revision || dashboardCycle !== next.dashboardCycle;
      ({ state, revision, dashboardCycle } = next);
      if (!loaded) {
        try { revealed = localStorage.getItem(spoilerKey()) === '1'; } catch { /* Keep the prompt available. */ }
      }
      loaded = true;
      if (changed) render();
      status('剧场记录已同步');
    } catch (error) {
      if (session.changed) freeze();
      else status('剧场存档暂时无法读取。', refresh);
    } finally { reading = false; refreshIfPending(); }
  }

  function refreshIfPending() {
    if (refreshPending && !reading && !busy) {
      refreshPending = false;
      void refresh();
    }
  }

  function freeze() {
    $('workspace').hidden = true;
    $('spoilers').hidden = true;
    status('登录账号已切换，请重新载入。', () => location.reload());
  }

  function mutate(change) {
    async function save() {
      if (!loaded) return;
      busy = true;
      status('正在保存剧场记录…');
      try {
        for (let attempts = 0; attempts < 4; attempts++) {
          session.assertCurrent();
          const next = rules.normalize(state);
          if (change(next) === false) { render(); status('已保留另一页面的修改'); return; }
          const response = await fetch(api, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'theatre', state: next, expectedRevision: revision, expectedAccountId: session.accountId }),
          });
          const result = session.accept(await response.json());
          if (response.status === 409 && result?.code === 'SAVE_CONFLICT') {
            ({ state, revision, dashboardCycle } = await read());
            continue;
          }
          if (!response.ok || !result?.ok) throw new Error(result?.error || '无法保存剧场记录。');
          state = next;
          revision = Number(result.revision);
          channel?.postMessage({ type: 'saved', accountId: session.accountId, revision });
          render();
          status('剧场记录已保存');
          return;
        }
        throw new Error('剧场记录正在另一页面更新。');
      } catch (error) {
        if (session.changed) freeze();
        else status(error.message || '剧场记录保存失败。', () => mutate(change));
      } finally { busy = false; refreshIfPending(); }
    }
    pending = pending.then(save, save);
    return pending;
  }

  function bossName(boss) {
    return terms.boss(boss, language, catalog.bosses[boss]?.name || boss.replaceAll('_', ' '));
  }

  function titleFor(target) { return `${bossName(target.boss)} ${rules.roman[target.level]}`; }

  function availability(node) {
    const win = state.wins[node.id];
    if (win?.cursed) return 'both';
    if (win?.normal) return node.cursed && !rules.blockers(state, node).length ? 'cursed' : 'won';
    return rules.blockers(state, node).length ? 'locked' : 'ready';
  }

  function nodeButton(node, className = '', style = '') {
    const current = selected === node.id;
    const status = availability(node);
    const name = bossName(node.boss);
    const level = rules.roman[node.level];
    return `<button class="node-button ${className}" data-node="${node.id}" data-node-cycle="${node.cycle}"
      data-status="${status}" title="${escape(`${name} ${level} · ${statusText[status]}`)}"
      ${current ? 'aria-current="true"' : ''} ${style ? `style="${style}"` : ''}>
      <span class="node-heading"><span class="node-name" title="${escape(name)}">${escape(name)}</span></span>
      <span class="node-meta"><span class="node-level" title="${escape(term('level'))}">${level}</span>
        <span class="node-badges">${nodeBadges(node)}</span><span class="node-status">${statusText[status]}</span></span></button>`;
  }

  function theatreIcon(kind) {
    return `<img src="../assets/icons/theatre-${kind}.svg?v=apk117" alt="" draggable="false">`;
  }

  function iconBadge(kind, label, { symbol = kind, cycle = '' } = {}) {
    const image = theatreIcon(symbol);
    return `<span class="node-badge badge-${kind}${symbol === 'won' ? ' badge-won' : ''}" role="img" aria-label="${escape(label)}" title="${escape(label)}"${cycle ? ` data-node-cycle="${cycle}"` : ''}>${image}</span>`;
  }

  function materialBadge(cycle, kind) {
    return iconBadge(kind, `${cycleName(cycle)} · ${materialLabel(cycle, kind)} ×1`, { cycle });
  }

  function nodeBadges(node) {
    const win = state.wins[node.id];
    const items = [iconBadge('normal', win?.normal ? '普通战已胜利' : term('normal'), { symbol: win?.normal ? 'won' : 'normal' })];
    if (node.cursed) items.push(iconBadge('cursed', win?.cursed ? '诅咒战已胜利' : '有诅咒模式', { symbol: win?.cursed ? 'won' : 'cursed' }));
    items.push(materialBadge(node.cycle, 'tear'));
    if (node.core) items.push(materialBadge(node.cycle, 'core'));
    if (node.reward?.type === 'loot') items.push(iconBadge('loot', term('loot')));
    if (node.reward?.type === 'secret') items.push(iconBadge('secret', `秘密牌库${term('reward')}`));
    if (node.reward?.type === 'skyseer') items.push(iconBadge('expansion', '扩展奖励'));
    return items.join('');
  }

  function renderLegend() {
    const example = (icon, label) => `<span class="legend-item">${icon}<span>${label}</span></span>`;
    const entries = [
      ['normal', term('normal')], ['cursed', '诅咒战'], ['won', '已胜利'],
      ['loot', term('loot')], ['secret', `秘密牌库${term('reward')}`], ['expansion', '扩展奖励'],
    ];
    const cycles = rules.cycles;
    $('node-legend-items').innerHTML = entries.map(([icon, label]) => example(iconBadge(icon, label), label)).join('') + cycles.map(cycle =>
      example(materialBadge(cycle, 'tear') + materialBadge(cycle, 'core'), `${cycleName(cycle)}的${term('material')}与${term('core')}`)).join('')
      + `<span class="legend-item"><i class="legend-branch" aria-hidden="true"></i>跨版本依赖</span>`;
  }

  // --- theatre layout: begin ---
  function compactLayout(key) {
    const nodes = catalog.nodes.filter(node => node.edition === key).map(node => [node.id, node.position]);
    if (key === 'expansion') nodes.push(...Object.entries(catalog.expansionRepeats));
    nodes.sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x);
    const left = Math.min(...nodes.map(([, point]) => point.x));
    const prerequisites = new Map(catalog.nodes.map(node => [node.id, node.prerequisites]));
    const remaining = new Map(nodes);
    const positions = new Map();
    const gutter = 18;
    const rowStep = cardHeight + 14;
    const nearby = (a, b) => Math.abs(a - b) < cardWidth + 16;
    while (remaining.size) {
      const [id, point] = [...remaining].find(([id]) => prerequisites.get(id).every(from => !remaining.has(from)));
      const x = gutter + (point.x - left) * (key === 'core' ? 15 : 20);
      const occupied = new Set([...positions.values()].filter(point => nearby(point.x, x)).map(point => point.row));
      let row = 1 + Math.max(-1, ...prerequisites.get(id).map(from => positions.get(from)?.row ?? -1));
      while (occupied.has(row)) row++;
      positions.set(id, { x, row });
      remaining.delete(id);
    }

    // Keep shorter branches close to their join instead of leaving gaps mid-branch.
    const ordered = [...positions].sort((a, b) => b[1].row - a[1].row);
    for (const [index, [id, point]] of ordered.entries()) {
      const children = ordered.slice(0, index).filter(([other]) => prerequisites.get(other).includes(id));
      if (!children.length) continue;
      const below = ordered.slice(0, index).filter(([, other]) => nearby(point.x, other.x));
      point.row = Math.min(...children.concat(below).map(([, other]) => other.row)) - 1;
    }
    for (const point of positions.values()) point.y = gutter + point.row * rowStep;
    const values = [...positions.values()];
    const width = Math.ceil(Math.max(...values.map(point => point.x)) + cardWidth + gutter);
    const height = Math.ceil(Math.max(...values.map(point => point.y)) + cardHeight + gutter);
    return { width, height, positions };
  }

  function middle(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const half = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
  }

  // The combined I–V sheet keeps the vertical rhythm each spread already had, then
  // re-slots the columns: every card is pulled towards the middle of its
  // prerequisites and successors, so a boss stays a readable ladder and the long
  // cross-edition detours disappear.
  function combinedLayout() {
    const core = compactLayout('core');
    const expansion = compactLayout('expansion');
    const gutter = 18;
    const columnStep = cardWidth + 16;
    const rowStep = cardHeight + 14;
    // How hard a card is dragged back onto its own boss's column.
    const ladderPull = 1.1;
    const orderingPasses = 8;
    const straightenPasses = 20;
    const prerequisites = new Map(catalog.nodes.map(node => [node.id, node.prerequisites]));
    const successors = new Map(catalog.nodes.map(node => [node.id, []]));
    for (const node of catalog.nodes) for (const from of node.prerequisites) successors.get(from).push(node.id);
    const ladders = new Map();
    for (const node of catalog.nodes) {
      if (!ladders.has(node.boss)) ladders.set(node.boss, []);
      ladders.get(node.boss).push(node.id);
    }

    // Vertical slot of each card: the two spreads are one long climb, so core
    // (cycles I–III) keeps the top of the sheet and expansion (IV–V) starts below
    // it. Sharing a single row grid would drag the late cycles up beside the
    // opening ones.
    const seed = core.width + 96;
    const spreadGap = 2;
    const coreRows = Math.max(...[...core.positions.values()].map(point => point.row)) + spreadGap + 1;
    const rows = new Map();
    const reading = new Map();
    for (const [id, point] of core.positions) { rows.set(id, point.row); reading.set(id, point.x); }
    for (const [id, point] of expansion.positions) {
      if (catalog.byId[id].edition !== 'expansion') continue;
      rows.set(id, point.row + coreRows);
      reading.set(id, point.x + seed);
    }
    const lifted = Math.min(...rows.values());
    if (lifted < 0) for (const [id, value] of rows) rows.set(id, value - lifted);
    const lastRow = Math.max(...rows.values());
    const lines = Array.from({ length: lastRow + 1 }, () => []);
    for (const node of catalog.nodes) lines[rows.get(node.id)].push(node.id);
    for (const line of lines) line.sort((a, b) => reading.get(a) - reading.get(b));

    const column = new Map();
    for (const line of lines) line.forEach((id, index) => column.set(id, index * columnStep));
    const ladderColumn = new Map();
    const refreshLadders = () => {
      for (const [boss, ids] of ladders) ladderColumn.set(boss, middle(ids.map(id => column.get(id))));
    };
    refreshLadders();

    const separate = line => {
      let cursor = -Infinity;
      for (const id of line) {
        const next = Math.max(column.get(id), cursor);
        column.set(id, next);
        cursor = next + columnStep;
      }
    };
    for (const line of lines) separate(line);

    const sortLine = (line, weight) => line.map((id, index) => ({ id, index, score: weight(id) }))
      .sort((a, b) => a.score - b.score || a.index - b.index).map(entry => entry.id);
    const pull = (id, values) => middle(values) ?? column.get(id);

    for (let pass = 0; pass < orderingPasses; pass++) {
      for (let row = 1; row <= lastRow; row++) {
        lines[row] = sortLine(lines[row], id => pull(id, prerequisites.get(id).map(from => column.get(from))));
      }
      for (let row = lastRow - 1; row >= 0; row--) {
        lines[row] = sortLine(lines[row], id => pull(id, successors.get(id).map(to => column.get(to))));
      }
      refreshLadders();
    }

    for (let pass = 0; pass < straightenPasses; pass++) {
      for (let row = 0; row <= lastRow; row++) {
        const line = lines[row];
        for (let index = 0; index < line.length; index++) {
          const id = line[index];
          const near = [...prerequisites.get(id), ...successors.get(id)].map(other => column.get(other));
          const aim = pull(id, near) + (ladderColumn.get(catalog.byId[id].boss) - column.get(id)) * ladderPull;
          const low = index > 0 ? column.get(line[index - 1]) + columnStep : -Infinity;
          const high = index + 1 < line.length ? column.get(line[index + 1]) - columnStep : Infinity;
          const clamped = Math.min(Math.max(aim, low), high);
          column.set(id, column.get(id) + (clamped - column.get(id)) * .6);
        }
        separate(line);
      }
      refreshLadders();
    }

    // Land on the card grid and re-space so nothing can overlap.
    for (const id of column.keys()) column.set(id, Math.round(column.get(id) / columnStep) * columnStep);
    for (const line of lines) separate(line);

    // Then lift cards onto their boss's own column whenever the row has a free
    // slot, so each ladder reads as one vertical run instead of a staircase.
    const occupied = new Set(catalog.nodes.map(node => `${rows.get(node.id)}:${Math.round(column.get(node.id) / columnStep)}`));
    for (let pass = 0; pass < 3; pass++) {
      for (const ids of ladders.values()) {
        const aim = Math.round(middle(ids.map(id => column.get(id))) / columnStep) * columnStep;
        for (const id of ids) {
          const row = rows.get(id);
          const from = `${row}:${Math.round(column.get(id) / columnStep)}`;
          const to = `${row}:${aim / columnStep}`;
          if (column.get(id) === aim || occupied.has(to)) continue;
          occupied.delete(from);
          occupied.add(to);
          column.set(id, aim);
        }
      }
    }

    const left = Math.min(...column.values());
    const positions = new Map();
    for (const node of catalog.nodes) {
      positions.set(node.id, {
        x: Math.round(column.get(node.id) - left) + gutter,
        y: gutter + rows.get(node.id) * rowStep,
      });
    }
    // A child whose only prerequisite is a single node should sit directly above
    // it, not be dragged across the sheet by its own boss's ladder column.
    // CYCLONUS:9 depends solely on CHIMERA_METASTASIOS:9, so keep them stacked.
    const parent = positions.get('CHIMERA_METASTASIOS:9');
    const child = positions.get('CYCLONUS:9');
    if (parent && child) parent.x = child.x;
    const values = [...positions.values()];
    return {
      width: Math.ceil(Math.max(...values.map(point => point.x)) + cardWidth + gutter),
      height: Math.ceil(Math.max(...values.map(point => point.y)) + cardHeight + gutter),
      positions,
    };
  }
  // --- theatre layout: end ---

  // The route cache is keyed by which cycles are open, so unlocking one rebuilds
  // the wiring instead of reusing paths into hidden cards.
  function visibleKey() {
    return rules.cycles.map(cycle => cycleUnlocked(cycle) ? 1 : 0).join('');
  }

  function graphConnections(positions) {
    const key = visibleKey();
    if (!routesByEdition[key]) {
      const links = catalog.nodes.filter(visibleNode).flatMap(target => target.prerequisites
        .filter(id => visibleNode(rules.byId.get(id)) && (positions.has(id) || positions.has(target.id)))
        .map(id => [id, target.id]));
      // Cross-edition runs (core → expansion) should drop down their own column
      // and only cross at the target's row, instead of shooting sideways to the
      // nearest left corridor.
      const verticalFirst = new Set(links.map(([from, to], index) => {
        const a = catalog.byId[from], b = catalog.byId[to];
        return a && b && a.edition !== b.edition ? index : -1;
      }).filter(index => index >= 0));
      const paths = window.ATO_THEATRE_GRAPH.buildConnections(positions, cardWidth, cardHeight, links,
        { allowUp: true, verticalFirst });
      routesByEdition[key] = { links, paths };
    }
    const { links, paths } = routesByEdition[key];
    return paths.map(({ d, links: indexes, arrow }) => {
      const dependencies = indexes.map(index => links[index]);
      const marked = dependencies.some(([from, to]) => selected === from || selected === to);
      const met = dependencies.every(([from]) => state.wins[from]?.normal);
      const className = `edge${met ? ' met' : ''}${marked ? ' highlight' : ''}`;
      const marker = `tree-arrow${marked ? '-selected' : met ? '-met' : ''}`;
      const head = arrow ? ` marker-end="url(#${marker})"` : '';
      return { marked, html: `<path class="${className}" d="${d}"${head}/>` };
    }).sort((a, b) => Number(a.marked) - Number(b.marked)).map(path => path.html).join('');
  }

  // The base layout is built for all five cycles. Drawing it whole while only the
  // first cycle is open would leave the board mostly blank, so trim the canvas to
  // the cards that are actually on show and keep the corner margin intact.
  let trimmed = null;
  function graphLayout() {
    const key = visibleKey();
    if (trimmed?.key === key) return trimmed.layout;
    const all = graphLayouts.all;
    const ids = [...all.positions.keys()].filter(id => visibleNode(rules.byId.get(id)));
    // Nothing unlocked yet (no cycle ticked complete): keep a small valid
    // layout instead of feeding Infinity into the canvas size, so the empty
    // hint inside the (overflow-clipped) graph still has room to show.
    if (!ids.length) {
      trimmed = { key, layout: { width: 460, height: 48, positions: new Map() } };
      return trimmed.layout;
    }
    const points = ids.map(id => all.positions.get(id));
    const left = Math.min(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y));
    const edge = 18;
    const positions = new Map(ids.map(id => {
      const point = all.positions.get(id);
      return [id, { x: point.x - left + edge, y: point.y - top + edge }];
    }));
    const values = [...positions.values()];
    const layout = {
      width: Math.ceil(Math.max(...values.map(point => point.x)) + cardWidth + edge),
      height: Math.ceil(Math.max(...values.map(point => point.y)) + cardHeight + edge),
      positions,
    };
    trimmed = { key, layout };
    return layout;
  }

  function renderTree() {
    const nodes = catalog.nodes.filter(visibleNode);
    const won = nodes.filter(node => state.wins[node.id]?.normal).length;
    $('progress').textContent = `普通胜利 ${won} / ${nodes.length} · 可挑战 ${nodes.filter(node => availability(node) === 'ready').length}`;
    renderLegend();
    $('tree-list').setAttribute('aria-pressed', display === 'list');
    $('tree-graph').setAttribute('aria-pressed', display === 'graph');
    $('zoom-tools').hidden = display !== 'graph';
    $('tree-board').hidden = display !== 'graph';
    $('node-list').hidden = display !== 'list';
    if (display !== 'list') $('node-list').replaceChildren();
    if (display === 'list') {
      $('graph').replaceChildren();
      $('node-list').innerHTML = nodes.length ? rules.cycles.filter(cycle => nodes.some(node => node.cycle === cycle))
        .map(cycle => `<section><h2>${cycleName(cycle)}</h2>
        <div class="node-list-grid">${nodes.filter(node => node.cycle === cycle).map(node => nodeButton(node)).join('')}</div></section>`).join('')
        : `<p class="muted">在右侧勾选某个循环的「已完成」，即可解锁该循环的始徒节点。</p>`;
      return;
    }
    const { width, height, positions } = graphLayout();
    $('graph').style.width = `${width}px`;
    $('graph').style.height = `${height}px`;
    // The 9px head sits on the 7px wire and its tip stops half a pixel inside the
    // card, so the point stays sharp but never leaves a hairline gap above it.
    const arrowHeads = [['', '--edge-ink'], ['-met', '--done'], ['-selected', '--accent-strong']].map(([suffix, color]) =>
      `<marker id="tree-arrow${suffix}" markerUnits="userSpaceOnUse" markerWidth="6" markerHeight="9" refX="6" refY="4.5" orient="auto"><path fill="var(${color})" d="M0 0 L6 4.5 L0 9 Z"/></marker>`).join('');
    $('graph').innerHTML = `<svg class="connectors" width="${width}" height="${height}" aria-hidden="true">
      <defs>${arrowHeads}</defs>${graphConnections(positions)}</svg>`
      + (nodes.length ? [...positions].sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x)
        .map(([id, { x, y }]) => nodeButton(rules.byId.get(id), 'graph-node', `left:${x}px;top:${y}px;width:${cardWidth}px;height:${cardHeight}px`)).join('')
        : `<p class="muted tree-empty">在右侧勾选某个循环的「已完成」，即可解锁该循环的始徒节点。</p>`);
    $('graph').classList.toggle('has-selection', positions.has(selected));
    // Cards are narrow: once level and badges have filled the meta row the status
    // word would be squeezed into an ellipsis, so drop it instead.
    for (const card of $('graph').querySelectorAll('.node-button')) {
      const status = card.querySelector('.node-status');
      card.classList.toggle('is-tight', status.scrollWidth > status.clientWidth + 1);
    }
    if (zoomFit) fitGraph();
    else {
      // First paint settles a little above the card's natural size so the tree
      // reads clearly even when the right-hand sheet is wide; later renders
      // keep whatever scale the reader chose.
      if (!zoomInitialised) {
        zoom = 1.15;
        zoomInitialised = true;
      }
      applyZoom(zoom);
    }
    if (positionGraphAtStart && !zoomFit) {
      const first = positions.get('HEKATON:5');
      if (first) {
        $('tree-board').scrollTo(Math.max(0, first.x * zoom - 95), Math.max(0, first.y * zoom - 22));
        positionGraphAtStart = false;
      }
    }
  }

  function applyZoom(scale) {
    zoom = scale;
    const { width, height } = graphLayout();
    $('graph-size').style.width = `${width * scale}px`;
    $('graph-size').style.height = `${height * scale}px`;
    $('graph').style.transform = `scale(${scale})`;
  }

  function fitGraph() {
    zoomFit = true;
    const board = $('tree-board');
    const { width, height } = graphLayout();
    applyZoom(Math.max(.08, Math.min(1, board.clientWidth / width, board.clientHeight / height)));
  }

  function changeZoom(factor) {
    const board = $('tree-board');
    const centerX = (board.scrollLeft + board.clientWidth / 2) / zoom;
    const centerY = (board.scrollTop + board.clientHeight / 2) / zoom;
    zoomFit = false;
    applyZoom(Math.max(.08, Math.min(2.25, zoom * factor)));
    board.scrollTo(centerX * zoom - board.clientWidth / 2, centerY * zoom - board.clientHeight / 2);
  }

  function materialLabel(cycle, kind) { return terms.material(cycle, kind, language, catalog.cycleMaterials[cycle][kind]); }

  function sheetField(path, type, label, value, extra = '') {
    const attr = `data-field="${path}" aria-label="${escape(label)}" ${extra}`;
    if (type === 'textarea') return `<textarea ${attr} maxlength="6000">${escape(value)}</textarea>`;
    if (type === 'checkbox') return `<input ${attr} type="checkbox" ${value ? 'checked' : ''}>`;
    return `<input ${attr} type="number" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" value="${value}" inputmode="numeric" required>`;
  }

  function holdCard(cycle, kind) {
    const label = materialLabel(cycle, kind);
    const item = state.hold[cycle][kind];
    return `<article class="hold-item" data-node-cycle="${cycle}">
      <label class="hold-heading">
        <span class="hold-face" aria-hidden="true">${theatreIcon(kind)}</span>
        <span class="hold-name">${escape(label)}</span>
        ${sheetField(`hold.${cycle}.${kind}.count`, 'number', `${label}余额`, item.count)}
      </label>
      ${sheetField(`hold.${cycle}.${kind}.notes`, 'textarea', `${label}备注`, item.notes, 'rows="2" placeholder="备注"')}
    </article>`;
  }

  function renderSheet() {
    const cycles = rules.cycles;
    const record = state.sheet;
    const tracks = sheetOrder.map(boss => {
      const nodes = catalog.nodes.filter(node => node.boss === boss && cycleUnlocked(node.cycle))
        .sort((a, b) => a.level - b.level);
      if (!nodes.length) return '';
      return `<article class="track" data-node-cycle="${nodes[0].cycle}"><h4>${escape(bossName(boss))}</h4><div class="track-levels" style="--levels:${nodes.length}">`
        + nodes.map(node => {
          const win = state.wins[node.id];
          return `<button data-node="${node.id}" aria-label="${escape(titleFor(node))} ${statusText[availability(node)]}"
            ${selected === node.id ? 'aria-current="true"' : ''} class="node-button ${win?.cursed ? 'cursed-win' : win?.normal ? 'win' : ''}">
            ${rules.roman[node.level]}</button>`;
        }).join('') + '</div></article>';
    }).join('');
    const hold = ['tear', 'core'].flatMap(kind => cycles.map(cycle => holdCard(cycle, kind))).join('');
    const track = Array.from({ length: 4 }, (_, band) => `<div class="knockout-band">`
      + Array.from({ length: 5 }, (_, group) => {
        const start = band * 25 + group * 5;
        const marks = Array.from({ length: 5 }, (_, mark) => `<span class="knockout-mark${start + mark < record.knockouts ? ' checked' : ''}">${theatreIcon('knockout')}</span>`);
        return `<div class="knockout-group">${marks.join('')}<span class="knockout-milestone">${start + 5}</span></div>`;
      }).join('') + '</div>').join('');
    const cycleChecks = cycles.map(cycle => `<label>${sheetField(`completed.${cycle}`, 'checkbox', `${cycleName(cycle)}已完成`, state.completed[cycle])}${cycleName(cycle)}</label>`).join('');
    const hiddenNote = cycles.some(cycle => !cycleUnlocked(cycle))
      ? `<p class="muted">勾选某个循环的「已完成」，就会出现该循环的节点与${term('evolution')}。</p>` : '';
    $('sheet').innerHTML = `<div class="section-heading"><h2 id="sheet-title">${term('sheet')}</h2><button id="open-manual">补录战绩</button></div>
      <section class="sheet-header"><div><h3>笔记</h3>${sheetField('sheet.notes', 'textarea', '剧场笔记', record.notes, 'class="ruled"')}</div>
        <div class="cycle-checks"><h3>已完成的${term('cycle')}</h3>${cycleChecks}</div></section>
    <section><h3>${term('evolution')}</h3><div class="tracks">${tracks}</div>${hiddenNote}</section>
      <section><h3>剧场货舱</h3><div class="hold">${hold}</div></section>
      <section><div class="section-heading"><h3>泰坦阵亡轨</h3><label>累计阵亡 ${sheetField('sheet.knockouts', 'number', '累计阵亡', record.knockouts)}</label></div>
        <div class="knockout-track" aria-hidden="true">${track}</div></section>`;
  }

  function rewardLabel(reward) {
    if (reward.name) return `${terms.loot(reward, language)}${reward.card ? `（秘密牌库 ${reward.deck} · ${reward.card}）` : ''}`;
    if (reward.type === 'skyseer') return term('skyseer');
    return `秘密牌库 ${reward.deck} · ${reward.card}`;
  }

  function renderDetail() {
    const node = rules.byId.get(selected);
    const target = $('node-detail');
    if (!visibleNode(node)) {
      const hasReplay = Object.keys({ ...state.campaignWins, ...state.wins }).some(id => {
        const [boss, level] = id.split(':');
        return visibleNode(rules.battleTarget(boss, Number(level))) && rules.canReplay(state, boss, Number(level));
      });
      target.hidden = true;
      target.innerHTML = '';
      return;
    }
    const win = state.wins[node.id];
    const missing = rules.blockers(state, node);
    const status = availability(node);
    const prereqs = node.prerequisites.filter(id => visibleNode(rules.byId.get(id))).map(id => {
      const prerequisite = rules.byId.get(id);
      return `<li>${state.wins[id]?.normal ? '✓' : '◇'} <button data-node="${id}" data-follow>${escape(titleFor(prerequisite))}</button></li>`;
    }).join('') + (node.prerequisites.some(id => !visibleNode(rules.byId.get(id)))
      ? '<li class="muted">还有需要在后续循环查看的前置战斗。</li>' : '');
    const nextNodes = catalog.nodes.filter(candidate => visibleNode(candidate) && candidate.prerequisites.includes(node.id));
    const nextLinks = nextNodes.map(candidate => `<li><button data-node="${candidate.id}" data-follow>${escape(titleFor(candidate))}</button></li>`).join('');
    const secret = node.reward?.type === 'secret' || node.reward?.type === 'skyseer';
    const reward = win?.reward ? `<p>已获得 ${escape(rewardLabel(win.reward))}${win.reward.carry ? ' · 可带回战役，请手动登记' : ''}</p>`
      : win?.normal ? '<p class="muted">首胜已记录</p>' : node.reward?.type === 'loot' ? `<p>${term('loot')} · 可带回战役</p>`
        : secret ? `<details><summary>查看秘密${term('reward')}</summary><p>普通首胜后揭示。</p></details>` : '';
    const normal = !win?.normal && !missing.length;
    const cursed = node.cursed && win?.normal && !win.cursed && !missing.length;
    const actions = `<div class="detail-actions">
      ${normal ? `<button class="primary" data-start="normal" ${state.activeBattle ? 'disabled' : ''}>准备普通挑战</button>` : ''}
      ${cursed ? `<button class="primary" data-start="cursed" ${state.activeBattle ? 'disabled' : ''}>准备诅咒挑战</button>` : ''}
      ${rules.canReplay(state, node.boss, node.level) ? `<button data-start="custom" ${state.activeBattle ? 'disabled' : ''}>准备重打此战</button>` : ''}
      <button data-open-replay>选择自定义重打</button></div>`;
    target.hidden = false;
    target.innerHTML = `<div class="detail-head"><h2 id="detail-title" tabindex="-1">${escape(titleFor(node))}</h2>
      <span class="detail-cycle">${cycleName(node.cycle)}</span>
      <button class="detail-close" data-close-detail aria-label="收起详情">×</button></div>
      <div class="detail-grid">
        <section class="detail-col"><h3>前置</h3>
          <ul><li>${state.completed[node.cycle] ? '✓' : '◇'} ${cycleName(node.cycle)}已完成</li>${prereqs}</ul>
          ${nextLinks ? `<h4>后续节点</h4><ul>${nextLinks}</ul>` : ''}
        </section>
        <section class="detail-col"><h3>解锁</h3>
          <p class="status status-${status}">${statusText[status]}</p>
          ${actions}
        </section>
        <section class="detail-col"><h3>${term('reward')}</h3>
          <p>${materialLabel(node.cycle, 'tear')} ×1${node.core ? ` · ${materialLabel(node.cycle, 'core')} ×1` : ''}</p>
          ${reward}${node.cursed ? `<p class="muted">诅咒首胜仅获得本节点标注的${term('material')}。</p>` : ''}
        </section>
      </div>`;
  }

  function battleHref(battle) {
    const params = new URLSearchParams({ theatreBattle: battle.id, apostle: battle.boss,
      level: String(battle.level), cycle: battle.cycle, mode: battle.mode });
    if (battle.trait != null) params.set('trait', String(battle.trait));
    return `../aibp/index.html?${params}`;
  }

  function renderActive() {
    const target = $('active');
    const battle = state.activeBattle;
    target.hidden = !battle;
    if (!battle) return;
    if (!visibleNode(battle)) {
      target.removeAttribute('data-battle-id');
      target.innerHTML = '<p>当前循环无法继续已保存的战斗。</p>';
      return;
    }
    if (target.dataset.battleId === battle.id && target.childElementCount) {
      target.querySelector('h2').textContent = titleFor(battle);
      target.querySelector('p').textContent = `${modeName(battle.mode)}${battle.trait ? ` · ${catalog.cursedTraits[battle.trait - 1]}` : ''}`;
      $('open-battle').textContent = `打开${term('boss')}战斗工具`;
      return;
    }
    target.dataset.battleId = battle.id;
    target.innerHTML = `<div><h2>${escape(titleFor(battle))}</h2><p>${modeName(battle.mode)}${battle.trait ? ` · ${escape(catalog.cursedTraits[battle.trait - 1])}` : ''}</p>
      <a id="open-battle" class="control primary" href="${escape(battleHref(battle))}">打开${term('boss')}战斗工具</a></div>
      <form id="settlement"><label>泰坦阵亡<input id="losses" type="number" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" value="0" required></label>
        <button value="victory" class="primary">确认胜利</button><button value="defeat">确认落败</button><button value="abandoned">放弃战斗</button></form>`;
    if (!returnHandled && returnId === battle.id) {
      returnHandled = true;
      requestAnimationFrame(() => $('losses')?.focus());
    }
  }

  function render() {
    document.title = `${term('theatre')} · ATO 助手`;
    for (const node of document.querySelectorAll('[data-theatre-term]')) node.textContent = term(node.dataset.theatreTerm);
    $('spoiler-text').textContent = `${term('tree')}会揭示各${term('cycle')}的${term('boss')}与挑战。建议在战役取得${term('theatre')}科技后查看。`;
    $('spoilers').hidden = !loaded || revealed;
    $('workspace').hidden = !loaded || !revealed;
    if (!loaded || !revealed) return;
    const previousFocus = document.activeElement;
    const field = previousFocus?.dataset?.field;
    const node = previousFocus?.dataset?.node;
    const fieldDraft = field ? { value: previousFocus.value, checked: previousFocus.checked } : null;
    if (!visibleNode(rules.byId.get(selected))) selected = '';
    if ($('manual').open) { renderManualText($('manual-form').dataset.replay === 'true'); updateManualBosses(); }
    document.body.dataset.cycle = rules.cycles.includes(dashboardCycle) ? dashboardCycle : 'c1';
    window.ATO_THEME?.setCycle(document.body.dataset.cycle);
    renderTree();
    renderSheet();
    renderDetail();
    renderActive();
    if (field) {
      const replacement = document.querySelector(`[data-field="${CSS.escape(field)}"]`);
      if (replacement && previousFocus.dataset.dirty === 'true') {
        replacement.value = fieldDraft.value;
        replacement.checked = fieldDraft.checked;
        replacement.dataset.dirty = 'true';
      }
      replacement?.focus({ preventScroll: true });
    } else if (node) {
      const container = previousFocus.closest('#node-detail, #sheet, #node-list, #graph');
      container?.querySelector(`[data-node="${CSS.escape(node)}"]`)?.focus({ preventScroll: true });
    }
  }

  function selectNode(id, follow) {
    const node = rules.byId.get(id);
    if (!visibleNode(node)) return;
    selected = id;
    render();
    if (mobile.matches || document.activeElement === document.body) $('detail-title')?.focus();
    if (follow && display === 'graph') {
      const position = graphLayout().positions.get(node.id);
      if (position) $('tree-board').scrollTo(Math.max(0, position.x * zoom - 100), Math.max(0, position.y * zoom - 80));
    }
  }

  function startBattle(target, mode) {
    if (!visibleNode(target)) return;
    const id = globalThis.crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    const trait = mode === 'cursed' ? Math.floor(Math.random() * 6) + 1 : null;
    void mutate(next => {
      if (!visibleNode(target)) throw new Error('该循环尚未解锁。');
      rules.start(next, { id, boss: target.boss, level: target.level, cycle: target.cycle, mode, trait });
    })
      .then(() => { if (state.activeBattle?.id === id) $('open-battle')?.focus(); });
  }

  function renderManualText(replay) {
    $('manual-title').textContent = replay ? '自定义重打' : '补录战绩';
    $('manual-form').querySelector('p').textContent = replay
      ? `选择已击败的${term('boss')}和等级。重打只累计剧场阵亡数。`
      : `按纸表录入剧场胜利。${term('material')}、${term('core')}和阵亡数请按现有余额在记录表中填写。`;
    $('manual-source').closest('label').hidden = replay;
    $('manual-action').closest('label').hidden = replay;
    $('manual-submit').textContent = replay ? '准备重打' : '保存战绩';
  }

  function configureManual(replay = false) {
    $('manual-form').dataset.replay = String(replay);
    renderManualText(replay);
    updateManualBosses();
    $('manual').showModal();
  }

  function manualLevels(boss) {
    const source = $('manual-source').value;
    const replay = $('manual-form').dataset.replay === 'true';
    return rules.roman.slice(1, 10).map((_, index) => index + 1).filter(level => {
      const id = rules.keyFor(boss, level);
      const node = rules.byId.get(id);
      const target = rules.battleTarget(boss, level);
      if (!target || !cycleUnlocked(target.cycle)) return false;
      if (replay) return rules.canReplay(state, boss, level);
      if (source === 'campaign') return Boolean(target);
      return source === 'cursed' ? node?.cursed && state.wins[id]?.normal : Boolean(node);
    });
  }

  function updateManualBosses() {
    const replay = $('manual-form').dataset.replay === 'true';
    const source = $('manual-source').value;
    const bossSelect = $('manual-boss');
    const previous = bossSelect.value;
    const bossIds = source === 'cursed'
      ? sheetOrder.filter(boss => catalog.nodes.some(node => node.boss === boss && node.cursed))
      : sheetOrder;
    bossSelect.replaceChildren(...bossIds.filter(boss => manualLevels(boss).length).map(boss => new Option(bossName(boss), boss)));
    if (Array.from(bossSelect.options).some(option => option.value === previous)) bossSelect.value = previous;
    updateManualLevels();
  }

  function updateManualLevels() {
    const select = $('manual-level');
    const previous = select.value;
    select.replaceChildren(...manualLevels($('manual-boss').value).map(level => new Option(rules.roman[level], level)));
    if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
    $('manual-submit').disabled = !select.options.length;
  }

  $('workspace').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (Object.hasOwn(button.dataset, 'closeDetail')) { selected = ''; renderDetail(); return; }
    if (button.dataset.node) selectNode(button.dataset.node, Object.hasOwn(button.dataset, 'follow'));
    else if (button.dataset.start) startBattle(rules.byId.get(selected), button.dataset.start);
    else if (button.id === 'open-manual') configureManual();
    else if (Object.hasOwn(button.dataset, 'openReplay')) configureManual(true);
  });
  $('tree-list').onclick = () => { display = 'list'; manualDisplay = true; renderTree(); };
  // Switching back to the tree keeps the size the reader last chose; 总览 is
  // there when they actually want the whole sheet at once.
  $('tree-graph').onclick = () => { display = 'graph'; manualDisplay = true; positionGraphAtStart = true; render(); };
  $('zoom-out').onclick = () => changeZoom(.8);
  $('zoom-in').onclick = () => changeZoom(1.25);
  $('fit').onclick = () => { fitGraph(); $('tree-board').scrollTo(0, 0); };
  mobile.addEventListener('change', () => {
    if (!manualDisplay) display = mobile.matches ? 'list' : 'graph';
    if (loaded && revealed) render();
  });
  new ResizeObserver(() => { if (zoomFit && !$('tree-board').hidden) fitGraph(); }).observe($('tree-board'));

  const board = $('tree-board');
  let drag = null;
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.pointerType === 'touch' || event.target.closest('button')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: board.scrollLeft, top: board.scrollTop };
    board.setPointerCapture(event.pointerId);
    board.classList.add('dragging');
  });
  board.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) board.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    board.addEventListener(type, () => { drag = null; board.classList.remove('dragging'); });
  }

  $('sheet').addEventListener('input', event => { if (event.target.dataset.field) event.target.dataset.dirty = 'true'; });
  $('sheet').addEventListener('change', event => {
    const input = event.target;
    if (!input.dataset.field || !input.reportValidity()) return;
    const path = input.dataset.field.split('.');
    const getParent = target => path.slice(0, -1).reduce((object, key) => object[key], target);
    const key = path.at(-1);
    const before = getParent(state)[key];
    const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    delete input.dataset.dirty;
    if (value === before) return;
    // 剧透保护：勾选超过当前战役进度的循环为「已完成」，会提前解锁该循环的
    // 始徒与挑战。先确认玩家确实完成了，避免误勾导致剧透。
    if (input.type === 'checkbox' && path[0] === 'completed' && value === true) {
      const targetIndex = rules.cycles.indexOf(path[1]);
      const currentIndex = rules.cycles.indexOf(dashboardCycle);
      if (targetIndex >= 0 && currentIndex >= 0 && targetIndex > currentIndex) {
        if (!confirm(`当前战役进度在${cycleName(dashboardCycle)}，勾选「${cycleName(path[1])}已完成」会提前解锁该循环的始徒与挑战，可能造成严重剧透。确认确实已完成这个循环吗？`)) {
          input.checked = before;
          return;
        }
      }
    }
    void mutate(next => {
      const parent = getParent(next);
      if (parent[key] !== before && parent[key] !== value) {
        if (!confirm('另一页面已经更改这一栏。要保留这里输入的值吗？')) return false;
      }
      parent[key] = value;
    });
  });
  $('manual-source').onchange = updateManualBosses;
  $('manual-boss').onchange = updateManualLevels;
  $('manual-form').addEventListener('submit', event => {
    if (event.submitter?.value !== 'save') return;
    event.preventDefault();
    const boss = $('manual-boss').value;
    const level = Number($('manual-level').value);
    const target = rules.battleTarget(boss, level);
    if (!visibleNode(target)) return;
    $('manual').close();
    if ($('manual-form').dataset.replay === 'true') { startBattle(target, 'custom'); return; }
    const mode = $('manual-source').value;
    const won = $('manual-action').value === 'add';
    const id = rules.keyFor(boss, level);
    void mutate(next => {
      if (mode === 'campaign') {
        if (won) next.campaignWins[id] = true;
        else delete next.campaignWins[id];
      } else {
        if (!won && (mode === 'normal' ? next.wins[id]?.earned || next.wins[id]?.cursedEarned : next.wins[id]?.cursedEarned)) {
          throw new Error('这场首胜已在剧场结算，无法通过补录撤销。');
        }
        rules.setRecordedWin(next, id, mode, won);
      }
    });
  });
  $('active').addEventListener('submit', event => {
    event.preventDefault();
    const outcome = event.submitter?.value;
    const battle = state.activeBattle;
    const id = battle?.id;
    if (!visibleNode(battle) || !outcome || !confirm(`确认${outcome === 'victory' ? '胜利' : outcome === 'defeat' ? '落败' : '放弃这场战斗'}？`)) return;
    const knockouts = Number($('losses').value);
    const roll = Math.random();
    selected = rules.byId.has(rules.keyFor(battle.boss, battle.level)) ? rules.keyFor(battle.boss, battle.level) : '';
    void mutate(next => rules.settle(next, { id, outcome, knockouts, roll })).then(() => {
      if (state.settled[id]) $('detail-title')?.focus({ preventScroll: !mobile.matches });
    });
  });

  $('reveal').onclick = () => {
    revealed = true;
    try { localStorage.setItem(spoilerKey(), '1'); } catch { /* This visit still works. */ }
    render();
  };
  channel?.addEventListener('message', event => {
    if (!session.changed && event.data?.accountId === session.accountId && event.data?.revision > revision) void refresh();
  });
  dashboardChannel?.addEventListener('message', () => void refresh());
  cycleChannel?.addEventListener('message', event => {
    if (event.data?.type === 'active-cycle-changed') void refresh();
  });
  function setTermLanguage(value) {
    if (!['fan', 'official', 'en'].includes(value) || language === value) return;
    language = value;
    render();
  }
  window.addEventListener('storage', event => {
    if (event.key === 'ato-term-language-v1') setTermLanguage(event.newValue || 'fan');
  });
  languageChannel?.addEventListener('message', event => setTermLanguage(event.data?.language));
  render();
  window.addEventListener('focus', () => void refresh());
  window.addEventListener('ato-module-sync-request', () => void refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  void refresh();
})();
