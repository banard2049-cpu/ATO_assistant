// 战役简报的地图回放。
//
// 板块坐标不自己算：直接复用地图页的 window.ATO_NEMESIS_PATH.displayLayout(cycle)，
// 那边的 c1「编号区在上、地形区在下」和 c3 的物理排布都是特意调过的，简报跟着走才不会
// 和地图页对不上。简报只负责「截至第 N 天为止，哪些格子已经翻开」。
(function () {
  'use strict';

  const STATE_CLASSES = ['new', 'current'];
  // 简报自己的板块显示尺寸（像素）。map-data.js 里 tileWidth 是 1，那是 TTS 的坐标单位，
  // 直接拿来当 CSS 尺寸会得到 1px 的板块；先按固定尺寸画，再由缩放按钮调节。
  const TILE_PX = 72;
  const EMPTY_MARKERS = { tokens: [], edges: [] };

  // 图标与地图页对齐：token id → 图标文件（路径相对 map/，与 map/app.js 的 tokenAssets 同一套
  // 资源），square 是方形图标，edge 是画在板块边上的图标。公开包里 map/tokens/ 不随包发布，
  // 取不到图时会退化成原来的文字标记，不会留下破图。
  const TOKEN_ASSETS = {
    AG: { label: 'AG进入', path: './tokens/argo.png' },
    AD: { label: 'AD', path: './tokens/adversary.png' },
    c11: { label: 'C11', path: './tokens/c11.jpg', square: true },
    c12: { label: 'C12', path: './tokens/c12.jpg', square: true },
    c13: { label: 'C13', path: './tokens/c13.jpg', square: true },
    ENGIN: { label: 'ENGIN', path: './tokens/engine_nymph.png' },
    hs: { label: 'HS', path: './tokens/hemolia_scout.png' },
    last_city: { label: 'Last City', path: './tokens/last_visited_city.png' },
    night_nymph: { label: 'Night Nymph', path: './tokens/night_nymph.png' },
    last_oasis: { label: '最后到访的绿洲', path: './tokens/last_visited_oasis.png' },
    c4_city_of_squalor: { label: 'City of Squalor', path: './tokens/c4_city_of_squalor.png', square: true },
    c4_cloud_ship: { label: '埃米尔云船 (Emir’s Cloud Ship)', path: './tokens/c4_cloud_ship.png', square: true },
    sandstorm: { label: '沙尘暴', path: './tokens/sandstorm.jpg', edge: true },
    last_silver_ruin: { label: '最后到访的白银遗迹', path: './tokens/silver_remnant.png' },
    c5_atlantean_capital: { label: 'Atlantean Capital', path: './tokens/c5_atlantean_capital.png', square: true },
    c5_black_beak: { label: 'Black Beak', path: './tokens/c5_black_beak.png' },
    c5_last_visited_underwater_city: { label: '最后到访的水下城市', path: './tokens/c5_last_visited_underwater_city.png' },
    c5_nemesis: { label: 'Nemesis', path: './tokens/c5_nemesis.png' },
    c5_ae_siren: { label: 'Ae-Siren', path: './tokens/c5_ae_siren.png' },
    c5_ruin: { label: 'Ruin', path: './tokens/c5_ruin.png', square: true },
    taitan: { label: 'Taitan', path: './tokens/reward_token_3.png' },
    staff: { label: 'Staff', path: './tokens/reward_token_2.png' },
    body: { label: 'Body', path: './tokens/reward_token_1.png' },
    knowledge: { label: 'Knowledge', path: './tokens/reward_token_4.png' },
    rr: { label: 'RR', path: './tokens/reward_token_6.png' },
    dof: { label: 'DOF', path: './tokens/reward_token_5.png' },
    end: { label: 'End', path: './tokens/end.png' },
    token_2: { label: 'AA', path: './tokens/adrianes_anchor.png', square: true },
  };

  const EDGE_DIRECTIONS = {
    上: 'up', 右: 'right', 下: 'down', 左: 'left',
    up: 'up', right: 'right', down: 'down', left: 'left',
  };
  const EDGE_DIRECTION_LABELS = { up: '上', right: '右', down: '下', left: '左' };

  // 简报页面在 briefing/ 下，图标在 map/tokens/ 下；绝对地址与已经是 ../ 的路径原样返回。
  function assetPath(path) {
    if (!path) return '';
    if (/^(?:https?:)?\/\//.test(path) || path.startsWith('/') || path.startsWith('../')) return path;
    return `../map/${String(path).replace(/^\.\//, '')}`;
  }

  // 存档里一天的地图标记形如 "027:last_city,hs" 与 "027:sandstorm(上)"（见 map/app.js 的
  // mapSnapshot）：同一个格子上可能同时有多个图标，画在板块边上的图标还带方向。
  function artworkLayers(source) {
    const artwork = window.ATO_MAP_ARTWORK?.resolve(source);
    return artwork ? [assetPath(artwork.base), assetPath(artwork.overlay)] : [assetPath(source)];
  }

  function parseMarkers(entries) {
    const byTile = new Map();
    (entries || []).forEach((entry) => {
      const text = String(entry || '');
      const split = text.indexOf(':');
      if (split <= 0) return;
      const tileId = text.slice(0, split);
      const record = byTile.get(tileId) || { tokens: [], edges: [] };
      text.slice(split + 1).split(',').forEach((item) => {
        const match = String(item).match(/^([^()]+?)(?:\((.+)\))?$/);
        if (!match) return;
        const tokenId = match[1].trim();
        if (!tokenId) return;
        const direction = EDGE_DIRECTIONS[String(match[2] || '').trim()];
        if (direction) record.edges.push({ tokenId, direction });
        else if (record.tokens.indexOf(tokenId) < 0) record.tokens.push(tokenId);
      });
      byTile.set(tileId, record);
    });
    return byTile;
  }

  function create(options) {
    const canvas = options.canvas;
    const stage = options.stage;
    const cycle = options.cycle;
    const canvasSize = options.canvasSize;
    const tileIds = options.order || [];
    // 板块左上角标的是「这块第一次被翻开时的游戏日」而不是板块号：回放时想看的是
    // "第几天走到这里"，板块号在 title 里留着（GIF 也照同一套规则画）。
    const revealDays = collectRevealDays(options.days);

    const layoutProvider = window.ATO_NEMESIS_PATH && typeof window.ATO_NEMESIS_PATH.displayLayout === 'function'
      ? window.ATO_NEMESIS_PATH.displayLayout(cycle)
      : null;

    const tilesById = new Map();
    (options.tiles || []).forEach((tile) => tilesById.set(String(tile.id), tile));

    // 没有布局数据的板块（截断的 map-data.js 之类）按发现顺序排在画布下方，
    // 至少不会全部叠在左上角。
    const unplaced = [];
    const positions = new Map();
    const mapWidth = Math.max(1, Number(canvasSize.width) || 1);
    const mapHeight = Math.max(1, Number(canvasSize.height) || 1);
    const tileWidth = TILE_PX;

    tileIds.forEach((id, index) => {
      const tile = tilesById.get(String(id));
      const position = layoutProvider && tile ? layoutProvider.position(tile) : null;
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        // 布局给的是「第几格」，换算成简报的像素坐标。
        positions.set(String(id), { x: position.x * tileWidth, y: position.y * tileWidth });
      } else {
        // 没有布局数据的板块（截断的 map-data.js 之类）按发现顺序排在画布下方；
        // 同样按 1 格步长紧密排，不留缝。
        const column = index % 6;
        const row = Math.floor(index / 6);
        unplaced.push(String(id));
        positions.set(String(id), { x: column * tileWidth, y: mapHeight * tileWidth + 0.6 * tileWidth + row * tileWidth });
      }
    });

    const totalWidth = Math.max(mapWidth * tileWidth, ...Array.from(positions.values()).map((p) => p.x + tileWidth));
    const totalHeight = Math.max(mapHeight * tileWidth, ...Array.from(positions.values()).map((p) => p.y + tileWidth));

    // 板块按固定像素尺寸画，不过度缩放：缩得太多会把板块文字和图糊掉。画布装不下时
    // 由外层滚动（与科技树面板一致），只在明显超出时才等比缩一点。
    let scale = 1.2;
    let overview = false;
    let focusPoint = null;
    function fit() {
      const availableWidth = canvas.clientWidth - 16;
      const availableHeight = canvas.clientHeight - 16;
      if (availableWidth <= 40 || availableHeight <= 40) return;
      if (overview) scale = Math.min(1.2, availableWidth / totalWidth, availableHeight / totalHeight);
      stage.style.left = `${overview ? 0 : canvas.clientWidth / 2}px`;
      stage.style.top = `${overview ? 0 : canvas.clientHeight / 2}px`;
      stage.style.width = `${totalWidth + (overview ? 0 : canvas.clientWidth / (2 * scale))}px`;
      stage.style.height = `${totalHeight + (overview ? 0 : canvas.clientHeight / (2 * scale))}px`;
      stage.style.transform = `scale(${scale})`;
      if (!overview) window.ATO_BRIEFING_CORE?.focusViewport(canvas, focusPoint, scale, true);
    }

    const nodes = new Map();
    function tileNode(id) {
      let node = nodes.get(id);
      if (node) return node;
      const tile = tilesById.get(id) || { id, label: id };
      node = document.createElement('article');
      node.className = 'map-tile';
      node.dataset.tileId = id;
      // 用背景图而不是 <img>：板块是绝对定位 + aspect-ratio 的方块，放 <img> 时
      // 图片高度拿不到已解析的包含块高度，会塌成 0×0（实测 rect 为 0），只剩背景色。
      const face = tile.front
        ? `<span class="tile-face" style="background-image:${artworkLayers(tile.front).reverse().map(src => `url('${escapeAttribute(src)}')`).join(',')}"></span>`
        : `<span class="tile-fallback">${escapeText(tile.label || id)}</span>`;
      const revealDay = revealDays.get(id) || '';
      const badge = revealDay || tile.label || id;
      const badgeTitle = revealDay ? `${tile.label || id} · ${revealDay}` : String(tile.label || id);
      node.title = badgeTitle;
      node.innerHTML = `${face}<span class="tile-badge">${escapeText(badge)}</span>`
        + '<span class="tile-tokens"></span><span class="tile-edge-tokens"></span><span class="tile-pin"></span>';
      node.style.left = `${positions.get(id).x}px`;
      node.style.top = `${positions.get(id).y}px`;
      // 宽高都写成像素：绝对定位元素靠 aspect-ratio 推高度时，这里实测会算成高度 0
      // （stage 的 height 只是 inline 样式），所以直接给出两个方向的像素尺寸。
      node.style.width = `${tileWidth}px`;
      node.style.height = `${tileWidth}px`;
      stage.appendChild(node);
      nodes.set(id, node);
      return node;
    }

    function render(day) {
      const visible = new Set((day && day.map && day.map.explored) || []);
      const fresh = new Set((day && day.map && day.map.new) || []);
      const current = day && day.map ? String(day.map.currentTileId || '') : '';
      const markers = parseMarkers(day && day.map ? day.map.markers : []);

      // 移除这一天之前的渲染结果，重新按当天的可见集合挂载：回放时地图「长出来」。
      Array.from(nodes.keys()).forEach((id) => {
        if (!visible.has(id)) {
          nodes.get(id).remove();
          nodes.delete(id);
        }
      });

      tileIds.forEach((rawId) => {
        const id = String(rawId);
        if (!visible.has(id)) return;
        const node = tileNode(id);
        node.classList.remove(...STATE_CLASSES);
        if (fresh.has(id)) node.classList.add('new');
        if (current === id) node.classList.add('current');
        const info = markers.get(id) || EMPTY_MARKERS;
        const tokens = info.tokens.slice();
        // 与地图页一致：AG（方舟）画在当前格上，存档里的 markers 里没有它。
        if (current === id && tokens.indexOf('AG') < 0) tokens.unshift('AG');
        const tokenBox = node.querySelector('.tile-tokens');
        tokenBox.textContent = '';
        tokens.filter((tokenId) => TOKEN_ASSETS[tokenId])
          .forEach((tokenId) => tokenBox.appendChild(iconElement(tokenId)));
        const edgeBox = node.querySelector('.tile-edge-tokens');
        edgeBox.textContent = '';
        info.edges.forEach((edge) => edgeBox.appendChild(iconElement(edge.tokenId, edge.direction)));
        // 认不出的 token（例如以后新加的）继续用文字标记，信息不会丢。
        const pin = node.querySelector('.tile-pin');
        pin.innerHTML = tokens.filter((tokenId) => !TOKEN_ASSETS[tokenId])
          .map((tokenId) => `<span>${escapeText(markerLabel(tokenId))}</span>`).join('');
      });

      const latest = String(day.map?.latestRevealedTileId || '');
      const target = (fresh.has(latest) && latest) || [...fresh].reverse().find((id) => visible.has(id)) || (visible.has(current) && current) || [...visible].pop();
      const position = positions.get(target);
      focusPoint = position ? { x: position.x + tileWidth / 2, y: position.y + tileWidth / 2 } : null;
      fit();
      return { visible: visible.size };
    }

    function resize() { fit(); }
    function setZoom(value) { overview = false; scale = Math.max(0.4, Math.min(3, value)); fit(); }
    function fitView() { overview = true; fit(); }

    // 导出（GIF/PDF）要按屏幕上同一套坐标重画一遍，所以把几何与板块表一起交出去：
    // 导出模块自己再算一遍位置，迟早会和页面上的地图对不上。
    function geometry() {
      return {
        positions: new Map(positions),
        tileWidth,
        totalWidth,
        totalHeight,
      };
    }

    function tiles() {
      return tileIds.map((id) => tilesById.get(String(id)) || { id: String(id), label: String(id), front: '' });
    }

    return { render, resize, unplaced, geometry, tiles, setZoom, fitView, zoom: () => scale };
  }

  // 图标节点：与地图页同样的类名（.map-token / .map-edge-token），位置交给 CSS。
  function iconElement(tokenId, direction) {
    const token = TOKEN_ASSETS[tokenId];
    const img = document.createElement('img');
    if (direction) {
      img.className = `map-edge-token edge-${direction}`;
    } else {
      img.className = `map-token token-${String(tokenId).toLowerCase()}${token && token.square ? ' token-square' : ''}`;
    }
    const label = (token && token.label) || tokenId;
    img.src = assetPath((token && token.path) || '');
    img.alt = direction ? `${label}（${EDGE_DIRECTION_LABELS[direction] || direction}）` : label;
    img.title = img.alt;
    // 公开包里 map/tokens/ 不随包发布，取不到图就退回原来的文字标记，避免留下破图。
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'token-fallback';
      fallback.textContent = markerLabel(tokenId);
      fallback.title = label;
      img.replaceWith(fallback);
    });
    return img;
  }

  /** 游戏里的天数名，与日期轴刻度同一套写法：序章 T3、正片 D3。 */
  function dayLabel(day) {
    const text = String(day == null ? '' : day).trim();
    if (!text) return '';
    return text.startsWith('T') ? text : 'D' + text;
  }

  /**
   * 板块 id → 第一次被翻开时的游戏日。
   *
   * 按日期轴顺序扫 explored（它是累加的），所以缺口日（那天没留备份）也自然跨过去：
   * 板块在哪一天第一次出现在「已翻开」里，就用那天的天数名（T3 / D3），
   * 不是备份的现实日期——地图上讲的是战役里的第几天。
   */
  function collectRevealDays(days) {
    const labels = new Map();
    (days || []).forEach((entry) => {
      if (!entry || !entry.present || !entry.map) return;
      const label = dayLabel(entry.day);
      if (!label) return;
      (entry.map.explored || []).forEach((rawId) => {
        const id = String(rawId);
        if (!labels.has(id)) labels.set(id, label);
      });
    });
    return labels;
  }

  function markerLabel(markerId) {
    const labels = {
      last_city: '城',
      last_oasis: '绿洲',
      last_silver_ruin: '银墟',
      hs: '侦',
      AG: '船',
      AD: '敌',
    };
    return labels[markerId] || (TOKEN_ASSETS[markerId] && TOKEN_ASSETS[markerId].label) || markerId;
  }

  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttribute(value) {
    return escapeText(value).replace(/"/g, '&quot;');
  }

  window.ATO_BRIEFING_MAP = {
    create,
    // 导出模块复用同一份图标表、标记解析与路径换算，避免第三份拷贝各说各话。
    TOKEN_ASSETS,
    EDGE_DIRECTION_LABELS,
    parseMarkers,
    assetPath,
    artworkLayers,
    markerLabel,
    dayLabel,
    collectRevealDays,
  };
})();
