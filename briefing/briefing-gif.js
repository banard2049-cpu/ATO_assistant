// 战役简报的 GIF 导出：把地图与科技树的逐日回放各渲染成一张动图。
//
// 为什么在浏览器里做：便携包的内置 PHP 是精简构建（本机实测没有 GD/Imagick），服务器端
// 画不了图；浏览器又不能用 canvas.toBlob('image/gif') 出 GIF，所以编码交给
// assets/vendor/gifenc.js（MIT，见该文件头部说明）。
//
// 渲染坐标不自己算：地图直接用 briefing-map.js 交出来的 geometry()（屏幕上那份），
// 科技树直接复用 briefing-tech.js 的渲染器画进一个离屏 <svg> 再栅格化，所以导出物和
// 页面上看到的完全对得上。
//
// 调色板只用一次 quantize()：GIF 的全局色表只写第一帧，之后每帧复用同一张色表
// （applyPalette 逐帧索引化），这样既有跨帧一致的配色，也省掉每帧量化的时间。
(function () {
  'use strict';

  const FRAME_DELAY_MS = 900;
  const TARGET_WIDTH = 1000;
  const MIN_WIDTH = 560;
  const MAX_TECH_HEIGHT = 900;
  const PAD = 16;
  const HEADER_H = 58;
  const FOOTER_H = 40;
  const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

  function encoder() {
    const api = window.ATO_GIFENC;
    if (!api || typeof api.GIFEncoder !== 'function') {
      throw new Error('GIF 编码器没有加载（assets/vendor/gifenc.js）');
    }
    return api;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createCanvas(doc, width, height) {
    const canvas = doc.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function defaultLoadImage(src, doc) {
    return new Promise((resolve, reject) => {
      const image = doc.createElement('img');
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片加载失败：' + src));
      // file:// images can taint an Android WebView canvas even though they
      // display normally. Read installed/bundled raster bytes through the native
      // resource store, then decode a self-contained data URL for export only.
      if (window.ATOAndroid) {
        const url = new URL(src, doc.baseURI || window.location.href);
        const prefix = '/android_asset/web/';
        if (url.protocol === 'file:') {
          if (!url.pathname.startsWith(prefix)) throw new Error('无法导出应用外的本地图片。');
          if (typeof window.ATOAndroid.readExportImageData !== 'function') throw new Error('请更新 APK 后再导出简报图片。');
          src = window.ATOAndroid.readExportImageData(decodeURIComponent(url.pathname.slice(prefix.length)));
          if (!/^data:image\/(?:png|jpeg|webp|gif|bmp);base64,/.test(src)) throw new Error('本地导出图片不可用。');
        }
      }
      image.src = src;
    });
  }

  /** 可回放的天：有记录、且当天的地图/科技字段齐备。缺口日（没有备份）跳过，避免重复帧。 */
  function framePlan(days, pick) {
    return (days || []).filter((day) => day && day.present && pick(day));
  }

  /** 先按取样帧算出一张全局色表，再由调用方逐帧 applyPalette。
   *
   *  取样时按 stride 抽像素：quantize 的开销与输入像素数成正比，整帧喂进去（1000×800 三帧
   *  实测 12.7 秒）会让导出卡到没法用；抽到 6 万像素量级后只剩几百毫秒，而颜色分布几乎不变。
   */
  function buildPalette(api, ctx, samples, draw, width, height) {
    const maxPixels = 60000;
    const framePixels = width * height;
    const stride = Math.max(1, Math.ceil((framePixels * samples.length) / maxPixels));
    const picked = Math.ceil(framePixels / stride) * samples.length;
    const sample = new Uint8ClampedArray(picked * 4);
    let cursor = 0;
    samples.forEach((day) => {
      draw(day);
      const data = ctx.getImageData(0, 0, width, height).data;
      for (let pixel = 0; pixel < framePixels; pixel += stride) {
        const source = pixel * 4;
        sample[cursor] = data[source];
        sample[cursor + 1] = data[source + 1];
        sample[cursor + 2] = data[source + 2];
        sample[cursor + 3] = 255;
        cursor += 4;
      }
    });
    // 注意：gifenc 内部用 new Uint32Array(data.buffer) 视图，会忽略 byteOffset/长度，
    // 所以这里必须传整块正好填满的数组（picked 就是按 stride 反算出来的精确像素数）。
    const palette = api.quantize(sample, 256);
    return palette && palette.length ? palette : [[0, 0, 0]];
  }

  /** 逐帧编码：第一帧写全局色表与循环次数，其余帧只写图形控制扩展。 */
  function writeFrames(api, ctx, days, draw, width, height, palette, onProgress) {
    const gif = api.GIFEncoder();
    days.forEach((day, index) => {
      draw(day);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const indexed = api.applyPalette(rgba, palette);
      const frameOptions = { delay: FRAME_DELAY_MS };
      if (index === 0) {
        frameOptions.palette = palette;
        frameOptions.repeat = 0;
      }
      gif.writeFrame(indexed, width, height, frameOptions);
      if (typeof onProgress === 'function') onProgress(index + 1, days.length);
    });
    gif.finish();
    return gif.bytes();
  }

  function sampleDays(days) {
    if (days.length <= 3) return days.slice();
    return [days[0], days[Math.floor(days.length / 2)], days[days.length - 1]];
  }

  function stageOrigin(contentWidth, geometry, scale) {
    return {
      x: PAD + Math.max(0, Math.round((contentWidth - geometry.totalWidth * scale) / 2)),
      y: PAD + HEADER_H,
    };
  }

  // ---------- 地图 ----------

  async function encodeMap(options) {
    const api = encoder();
    const doc = options.document || document;
    const loadImage = options.loadImage || defaultLoadImage;
    const geometry = options.geometry;
    if (!geometry || !geometry.positions) throw new Error('缺少地图几何数据（geometry）');
    const days = framePlan(options.days, (day) => day.map);
    if (!days.length) throw new Error('这个循环还没有可回放的地图记录');
    const parseMarkers = options.parseMarkers;
    if (typeof parseMarkers !== 'function') throw new Error('缺少标记解析函数（parseMarkers）');
    const resolveAsset = options.assetPath || ((path) => path);
    const tokenAssets = options.tokenAssets || {};
    const tiles = options.tiles || [];
    const tilesById = new Map(tiles.map((tile) => [String(tile.id), tile]));
    const cycleLabel = (options.cycle && options.cycle.label) || '战役';
    // 板块 id → 第一次翻开时的游戏日（由 briefing-map.js 的 collectRevealDays 算好传进来）。
    const revealDays = options.revealDays instanceof Map ? options.revealDays : new Map();

    const scale = clamp((Number(options.width) || TARGET_WIDTH) / Math.max(1, geometry.totalWidth), 0.3, 3);
    const tile = geometry.tileWidth * scale;
    const contentWidth = Math.max(MIN_WIDTH, Math.round(geometry.totalWidth * scale));
    const contentHeight = Math.round(geometry.totalHeight * scale);
    const width = contentWidth + PAD * 2;
    const height = contentHeight + PAD * 2 + HEADER_H + FOOTER_H;
    const canvas = createCanvas(doc, width, height);
    const ctx = canvas.getContext('2d');

    // 预载所有用得到的图：板块正面 + 各 token 图标；取不到就记 null，画的时候退化成色块/跳过。
    const wanted = new Set();
    tiles.forEach((tileInfo) => { if (tileInfo.front) wanted.add(resolveAsset(tileInfo.front)); });
    days.forEach((day) => {
      parseMarkers(day.map.markers || []).forEach((info) => {
        info.tokens.forEach((id) => {
          const token = tokenAssets[id];
          if (token && token.path) wanted.add(resolveAsset(token.path));
        });
        info.edges.forEach((edge) => {
          const token = tokenAssets[edge.tokenId];
          if (token && token.path) wanted.add(resolveAsset(token.path));
        });
      });
    });
    const images = new Map();
    await Promise.all(Array.from(wanted).map(async (src) => {
      try {
        images.set(src, await loadImage(src, doc));
      } catch {
        images.set(src, null);
      }
    }));

    const dayLabel = options.dayLabel || ((day) => String(day.title || day.day));

    function drawHeader(day, footerText) {
      ctx.fillStyle = '#f3ece3';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fffdfb';
      ctx.fillRect(PAD / 2, PAD / 2, width - PAD, height - PAD);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#5f341b';
      ctx.font = 'bold 23px ' + FONT;
      ctx.fillText(cycleLabel + ' · ' + dayLabel(day), PAD + 4, PAD / 2 + 32);
      ctx.fillStyle = '#706a60';
      ctx.font = '14px ' + FONT;
      // 表头只给游戏日（标题行）与位置：地图上讲的是战役里的第几天，不出现现实日期，
      // 也不写「N / M 格」这种带板块总数上限的计数。
      const meta = day.location ? '位置 ' + day.location : '';
      ctx.fillText(meta, PAD + 4, PAD / 2 + 50);
      ctx.fillStyle = '#5f341b';
      ctx.font = '14px ' + FONT;
      ctx.fillText(footerText, PAD + 4, height - PAD / 2 - 16);
    }

    function strokeTile(x, y, size, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, 3 * scale);
      ctx.strokeRect(x - 1, y - 1, size + 2, size + 2);
      ctx.restore();
    }

    function drawBadge(label, x, y, size) {
      const text = String(label || '');
      if (!text || size < 34) return;
      ctx.save();
      // 与页面上 .tile-badge 一致：贴在板块左上角，深底白字（内容现在是"第一次翻开的日期"）。
      const fontSize = Math.max(10, Math.round(11 * Math.max(0.6, scale)));
      ctx.font = fontSize + 'px ' + FONT;
      const textWidth = ctx.measureText(text).width;
      const boxW = Math.min(size - 4, textWidth + 8);
      const boxH = fontSize + 6;
      const offset = Math.max(2, 2 * scale);
      ctx.fillStyle = 'rgba(36, 33, 29, 0.72)';
      ctx.fillRect(x + offset, y + offset, boxW, boxH);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + offset + 4, y + offset + boxH / 2);
      ctx.restore();
    }

    function drawToken(tokenId, x, y, size, square) {
      const token = tokenAssets[tokenId];
      const src = token && token.path ? resolveAsset(token.path) : '';
      const image = src ? images.get(src) : null;
      if (!image) return;
      ctx.save();
      if (!square) {
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(image, x, y, size, size);
      ctx.restore();
    }

    function drawTokens(tileId, x, y, markers) {
      const info = markers.get(String(tileId));
      if (!info) return;
      const iconSize = Math.max(18 * scale, Math.min(tile * 0.22, 34 * scale));
      const argoSize = Math.max(24 * scale, Math.min(tile * 0.3, 44 * scale));
      const edgeSize = Math.max(20 * scale, Math.min(tile * 0.24, 38 * scale));
      const gap = 3 * scale;
      // 与页面 CSS 对齐：日期标签占左上角，图标行从它下面开始（padding: 20px 5px 5px）。
      const insetX = 5 * scale;
      const insetY = 20 * scale;
      let cursor = x + insetX;
      info.tokens.forEach((tokenId) => {
        if (!tokenAssets[tokenId]) return;
        const size = tokenId === 'AG' ? argoSize : iconSize;
        drawToken(tokenId, cursor, y + insetY, size, Boolean(tokenAssets[tokenId].square));
        cursor += size + gap;
      });
      const edgeOffset = 3 * scale;
      info.edges.forEach((edge) => {
        if (!tokenAssets[edge.tokenId]) return;
        const offset = (tile - edgeSize) / 2;
        const places = {
          up: [x + offset, y + edgeOffset],
          down: [x + offset, y + tile - edgeSize - edgeOffset],
          left: [x + edgeOffset, y + offset],
          right: [x + tile - edgeSize - edgeOffset, y + offset],
        };
        const place = places[edge.direction] || places.up;
        drawToken(edge.tokenId, place[0], place[1], edgeSize, true);
      });
    }

    function draw(day) {
      const explored = new Set((day.map && day.map.explored) || []);
      const fresh = new Set((day.map && day.map.new) || []);
      const current = String((day.map && day.map.currentTileId) || '');
      const markers = parseMarkers((day.map && day.map.markers) || []);
      const freshList = Array.from(fresh);
      drawHeader(
        day,
        freshList.length ? '本次翻开：' + freshList.join('、') : '这一天没有新翻开的板块'
      );
      const origin = stageOrigin(contentWidth, geometry, scale);
      ctx.save();
      ctx.strokeStyle = 'rgba(36, 33, 29, 0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(origin.x, origin.y, geometry.totalWidth * scale, geometry.totalHeight * scale);
      ctx.restore();
      geometry.positions.forEach((position, rawId) => {
        const id = String(rawId);
        if (!explored.has(id)) return;
        const tileInfo = tilesById.get(id) || { id, label: id, front: '' };
        const x = origin.x + position.x * scale;
        const y = origin.y + position.y * scale;
        const src = tileInfo.front ? resolveAsset(tileInfo.front) : '';
        const image = src ? images.get(src) : null;
        if (image) {
          ctx.drawImage(image, x, y, tile, tile);
        } else {
          ctx.fillStyle = '#efe4d8';
          ctx.fillRect(x, y, tile, tile);
        }
        drawTokens(id, x, y, markers);
        drawBadge(revealDays.get(id) || tileInfo.label || id, x, y, tile);
        if (fresh.has(id)) strokeTile(x, y, tile, '#7f4b26');
        if (current === id) strokeTile(x, y, tile, '#346447');
      });
    }

    const palette = (function () {
      if (typeof options.onStatus === 'function') options.onStatus('正在分析配色…');
      return buildPalette(api, ctx, sampleDays(days), draw, width, height);
    })();
    return writeFrames(api, ctx, days, draw, width, height, palette, options.onProgress);
  }

  // ---------- 科技树 ----------

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** 把页面里 .tech-* 的样式抄进离屏 SVG：SVG 被当成图片栅格化时不会加载外部样式表。 */
  function collectTechCss(doc) {
    const parts = [
      'text { font-family: ' + FONT + '; font-size: 9px; }',
      '.tech-node text { font-size: 9px; }',
    ];
    const sheets = (doc || document).styleSheets || [];
    for (let index = 0; index < sheets.length; index += 1) {
      let rules = null;
      try {
        rules = sheets[index].cssRules;
      } catch {
        continue;
      }
      for (let ruleIndex = 0; rules && ruleIndex < rules.length; ruleIndex += 1) {
        const rule = rules[ruleIndex];
        const selector = rule && rule.selectorText ? String(rule.selectorText) : '';
        if (selector.indexOf('.tech-') < 0 && selector.indexOf('.node-day') < 0) continue;
        parts.push(rule.cssText);
      }
    }
    return parts.join('\n');
  }

  function serializeSvg(svg, css, width, height) {
    const text = new XMLSerializer().serializeToString(svg);
    const injected = '<style>' + css + '</style>'
      + '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="#fffdfb"/>';
    return text.replace(/(<svg[^>]*>)/, '$1' + injected);
  }

  async function encodeTech(options) {
    const api = encoder();
    const doc = options.document || document;
    const loadImage = options.loadImage || defaultLoadImage;
    const techApi = window.ATO_BRIEFING_TECH;
    if (!techApi || typeof techApi.create !== 'function') throw new Error('科技树渲染器没有加载');
    const days = framePlan(options.days, (day) => day.tech);
    if (!days.length) throw new Error('这个循环还没有可回放的科技记录');

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    // 离屏渲染器：fakeCanvas 只用来决定 fit() 的缩放（clientWidth 给大值 → 满倍率出图）。
    const offscreen = techApi.create({
      svg,
      canvas: { clientWidth: 100000, clientHeight: 100000 },
      autoFocus: false,
      pages: options.pages || [],
      timeline: options.timeline || options.days || [],
    });
    const css = collectTechCss(doc);
    const cycleLabel = (options.cycle && options.cycle.label) || '战役';
    const dayLabel = options.dayLabel || ((day) => String(day.title || day.day));
    const urlApi = options.urlApi || (typeof URL !== 'undefined' ? URL : null);

    // 先把每一天的离屏 SVG 栅格化成图片（SVG 图加载是异步的，没法在同步的 draw 里现取）。
    const frames = [];
    for (let index = 0; index < days.length; index += 1) {
      const day = days[index];
      const stats = offscreen.render(day) || {};
      const svgWidth = Number(svg.getAttribute('width')) || 1000;
      const svgHeight = Number(svg.getAttribute('height')) || 700;
      const text = serializeSvg(svg, css, svgWidth, svgHeight);
      // The generated SVG contains only inline shapes/text. A data URL avoids
      // carrying the file page's opaque origin into the offscreen canvas.
      const local = Boolean(window.ATOAndroid);
      const url = local ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
        : urlApi.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
      let image = null;
      try {
        image = await loadImage(url, doc);
      } finally {
        if (!local) urlApi.revokeObjectURL(url);
      }
      frames.push({
        day,
        image,
        unlocked: Number(stats.unlocked) || 0,
        total: Number(stats.total) || 0,
        svgWidth,
        svgHeight,
      });
    }

    const naturalWidth = frames[0].svgWidth || 1000;
    const naturalHeight = frames[0].svgHeight || 700;
    const scale = clamp(TARGET_WIDTH / naturalWidth, 0.2, 2);
    const contentWidth = Math.round(naturalWidth * scale);
    const contentHeight = Math.min(MAX_TECH_HEIGHT, Math.round(naturalHeight * scale));
    const width = contentWidth + PAD * 2;
    const height = contentHeight + PAD * 2 + HEADER_H + FOOTER_H;
    const canvas = createCanvas(doc, width, height);
    const ctx = canvas.getContext('2d');

    function draw(frame) {
      const day = frame.day;
      const newList = (day.tech && day.tech.new) || [];
      ctx.fillStyle = '#f3ece3';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fffdfb';
      ctx.fillRect(PAD / 2, PAD / 2, width - PAD, height - PAD);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#5f341b';
      ctx.font = 'bold 23px ' + FONT;
      ctx.fillText(cycleLabel + ' · ' + dayLabel(day), PAD + 4, PAD / 2 + 32);
      ctx.fillStyle = '#706a60';
      ctx.font = '14px ' + FONT;
      ctx.fillText('已点亮 ' + frame.unlocked + ' / ' + frame.total + ' 项', PAD + 4, PAD / 2 + 50);
      ctx.fillStyle = '#5f341b';
      ctx.font = '14px ' + FONT;
      ctx.fillText(
        newList.length ? '本次点亮 ' + newList.length + ' 项' : '这一天没有新点亮的科技',
        PAD + 4,
        height - PAD / 2 - 16
      );
      if (frame.image) {
        ctx.drawImage(frame.image, PAD, PAD + HEADER_H, contentWidth, contentHeight);
      }
    }

    const palette = (function () {
      if (typeof options.onStatus === 'function') options.onStatus('正在分析配色…');
      return buildPalette(api, ctx, sampleDays(frames), draw, width, height);
    })();
    return writeFrames(api, ctx, frames, draw, width, height, palette, options.onProgress);
  }

  window.ATO_BRIEFING_GIF = {
    encodeMap,
    encodeTech,
    collectTechCss,
    framePlan,
    FRAME_DELAY_MS,
    loadImage: defaultLoadImage,
  };
})();
