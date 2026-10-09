// 战役简报的文件导出：地图 GIF + 科技树 GIF + 逐日简报 PDF，打成一个 zip 下载。
//
// 三件事都必须在浏览器里做：便携包的内置 PHP 是精简构建（没有 GD/Imagick），服务器端既画不了
// 图也编不了 GIF；而 PDF 里要写中文，仓库里没有任何可嵌入的字体（*.ttf/otf 一个都没有），
// 所以逐日简报按「每页一张 JPEG」排进 PDF（用 canvas 写字，系统中文字体直接可用）。
//
// 分工：GIF 的帧渲染与编码在 briefing-gif.js；这里只负责 zip 写入、PDF 组装、逐日页面排版
// 与整体编排。
(function () {
  'use strict';

  const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  // PDF 页面：A4 纵向，150dpi 栅格化（1240×1754），落进 PDF 时按 595.28×841.89pt 铺满。
  const PAGE_PX_WIDTH = 1240;
  const PAGE_PX_HEIGHT = 1754;
  const PDF_PAGE_WIDTH = 595.28;
  const PDF_PAGE_HEIGHT = 841.89;
  const MARGIN = 84;

  // ---------- ZIP（只存储、不压缩：图片本身已是压缩格式，deflate 收益极小） ----------

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function utf8(text) {
    return new TextEncoder().encode(String(text));
  }

  function dosStamp(date) {
    const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff;
    const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
    return { time, day };
  }

  /** entries: [{ name, bytes: Uint8Array }] → 一个完整的 ZIP 字节流。 */
  function createZip(entries, now) {
    const stamp = dosStamp(now instanceof Date ? now : new Date());
    const parts = [];
    const central = [];
    let offset = 0;
    (entries || []).forEach((entry) => {
      const nameBytes = utf8(entry.name);
      const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes || []);
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true); // 文件名是 UTF-8
      localView.setUint16(8, 0, true); // 存储
      localView.setUint16(10, stamp.time, true);
      localView.setUint16(12, stamp.day, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, bytes.length, true);
      localView.setUint32(22, bytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      parts.push(local, bytes);

      const header = new Uint8Array(46 + nameBytes.length);
      const headerView = new DataView(header.buffer);
      headerView.setUint32(0, 0x02014b50, true);
      headerView.setUint16(4, 20, true);
      headerView.setUint16(6, 20, true);
      headerView.setUint16(8, 0x0800, true);
      headerView.setUint16(10, 0, true);
      headerView.setUint16(12, stamp.time, true);
      headerView.setUint16(14, stamp.day, true);
      headerView.setUint32(16, crc, true);
      headerView.setUint32(20, bytes.length, true);
      headerView.setUint32(24, bytes.length, true);
      headerView.setUint16(28, nameBytes.length, true);
      headerView.setUint32(42, offset, true);
      header.set(nameBytes, 46);
      central.push(header);

      offset += local.length + bytes.length;
    });

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, central.length, true);
    endView.setUint16(10, central.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);

    const total = parts.reduce((sum, chunk) => sum + chunk.length, 0) + centralSize + end.length;
    const output = new Uint8Array(total);
    let cursor = 0;
    parts.concat(central, [end]).forEach((chunk) => {
      output.set(chunk, cursor);
      cursor += chunk.length;
    });
    return output;
  }

  // ---------- PDF（每页一张 JPEG） ----------

  /** pages: [{ jpeg: Uint8Array, width, height }] → PDF 字节流。 */
  function createPdf(pages) {
    const parts = [];
    let length = 0;
    const offsets = [0];
    function push(data) {
      const bytes = typeof data === 'string' ? utf8(data) : data;
      parts.push(bytes);
      length += bytes.length;
    }
    function beginObject(number) {
      offsets[number] = length;
      push(number + ' 0 obj\n');
    }

    // 文件头 + 二进制标记（第二行是给"这是二进制文件"看的，避免被当纯文本传输时改行尾）。
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    beginObject(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    const kids = [];
    (pages || []).forEach((page, index) => {
      kids.push((3 + index * 3) + ' 0 R');
    });
    beginObject(2);
    push('<< /Type /Pages /Count ' + (pages || []).length + ' /Kids [' + kids.join(' ') + '] >>\nendobj\n');

    (pages || []).forEach((page, index) => {
      const pageId = 3 + index * 3;
      const contentId = pageId + 1;
      const imageId = pageId + 2;
      beginObject(pageId);
      push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PDF_PAGE_WIDTH + ' ' + PDF_PAGE_HEIGHT + ']'
        + ' /Resources << /XObject << /Im0 ' + imageId + ' 0 R >> /ProcSet [/PDF /ImageC] >>'
        + ' /Contents ' + contentId + ' 0 R >>\nendobj\n');

      const stream = 'q ' + PDF_PAGE_WIDTH + ' 0 0 ' + PDF_PAGE_HEIGHT + ' 0 0 cm /Im0 Do Q\n';
      beginObject(contentId);
      push('<< /Length ' + utf8(stream).length + ' >>\nstream\n' + stream + 'endstream\nendobj\n');

      beginObject(imageId);
      push('<< /Type /XObject /Subtype /Image /Width ' + page.width + ' /Height ' + page.height
        + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.jpeg.length
        + ' >>\nstream\n');
      push(page.jpeg);
      push('\nendstream\nendobj\n');
    });

    const xrefOffset = length;
    let xref = 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n';
    for (let id = 1; id < offsets.length; id += 1) {
      xref += String(offsets[id] || 0).padStart(10, '0') + ' 00000 n \n';
    }
    push(xref);
    push('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n');
    return concatBytes(parts);
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let cursor = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, cursor);
      cursor += chunk.length;
    });
    return output;
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('页面转 JPEG 失败'));
          return;
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      }, 'image/jpeg', quality);
    });
  }

  // ---------- 逐日简报页面 ----------

  function wrapText(ctx, text, maxWidth) {
    const output = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach((paragraph) => {
      let line = '';
      Array.from(paragraph).forEach((char) => {
        const next = line + char;
        if (line && ctx.measureText(next).width > maxWidth) {
          output.push(line);
          line = char;
        } else {
          line = next;
        }
      });
      output.push(line);
    });
    return output;
  }

  function createPageWriter(doc) {
    const canvas = doc.createElement('canvas');
    canvas.width = PAGE_PX_WIDTH;
    canvas.height = PAGE_PX_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_PX_WIDTH, PAGE_PX_HEIGHT);
    return { canvas, ctx, y: MARGIN };
  }

  function createDocWriter(doc) {
    const state = { doc, pages: [], page: null, header: null };
    function startPage(headerText) {
      const page = createPageWriter(doc);
      state.page = page;
      state.pages.push(page);
      if (headerText) {
        page.ctx.fillStyle = '#706a60';
        page.ctx.font = '18px ' + FONT;
        page.ctx.textAlign = 'left';
        page.ctx.fillText(headerText, MARGIN, MARGIN - 22);
      }
      return page;
    }
    state.startPage = startPage;
    state.ensure = function ensure(needed) {
      if (!state.page) startPage(state.header);
      if (state.page.y + needed <= PAGE_PX_HEIGHT - MARGIN) return;
      startPage(state.header + '（续）');
    };
    return state;
  }

  function writeBlock(state, options) {
    const ctx = state.page.ctx;
    const size = options.size || 20;
    const lineHeight = Math.round(size * 1.7);
    const color = options.color || '#24211d';
    const indent = options.indent || 0;
    const width = PAGE_PX_WIDTH - MARGIN * 2 - indent;
    ctx.font = (options.bold ? 'bold ' : '') + size + 'px ' + FONT;
    const lines = wrapText(ctx, options.text, width);
    lines.forEach((line) => {
      if (!line) {
        state.page.y += lineHeight / 2;
        return;
      }
      state.ensure(lineHeight);
      const target = state.page.ctx;
      target.fillStyle = color;
      target.font = (options.bold ? 'bold ' : '') + size + 'px ' + FONT;
      target.textAlign = 'left';
      target.fillText(line, MARGIN + indent, state.page.y);
      state.page.y += lineHeight;
    });
    if (options.gap) state.page.y += options.gap;
  }

  function techLabelMap(payload) {
    const map = new Map();
    ((payload.tech && payload.tech.unlocked) || []).forEach((record) => {
      map.set(record.key, record.name || record.key);
    });
    return map;
  }

  function daySectionTexts(entry, techNames) {
    const sections = [];
    const mapInfo = entry.map || null;
    const techInfo = entry.tech || null;
    const newTech = (techInfo && techInfo.new) || [];
    if (entry.objective) sections.push(['目标', entry.objective]);
    const progress = entry.progress;
    if (progress?.inward?.known) sections.push(['内蕴奥德赛', `阿尔戈号知识等级 ${progress.inward.position} · 进展 ${progress.inward.progress}`]);
    if (progress?.hubs?.known) sections.push(['冒险中枢 AHUB', `已勾选 ${progress.hubs.done} / ${progress.hubs.total} 分支\n` + progress.hubs.rows.map((hub) => `${hub.name} ${hub.done}/${hub.boxes.length}${hub.active ? ' · 当前中枢' : ''}`).join('\n')]);
    if (entry.story && (entry.story.section || entry.story.title)) {
      sections.push(['故事', [entry.story.section, entry.story.title].filter(Boolean).join(' · ')]);
    }
    if (mapInfo) {
      sections.push(['地图', (mapInfo.new && mapInfo.new.length)
        ? '本次翻开：' + mapInfo.new.join('、') + '（累计 ' + mapInfo.exploredCount + ' 格）'
        : '没有新翻开的板块（累计 ' + mapInfo.exploredCount + ' 格）']);
    }
    if (techInfo) {
      sections.push(['科技', newTech.length
        ? '本次点亮：' + newTech.map((key) => techNames.get(key) || key).join('、')
        : '没有新点亮的科技']);
    }
    const changes = (entry.changes || []).filter((change) => change.kind !== 'mapsync');
    if (changes.length) {
      sections.push(['变更', changes.map((change) => (change.items && change.items.length)
        ? change.label + '：' + change.items.join('、')
        : change.label).join('\n')]);
    }
    if (entry.heroes && (entry.heroes.names || []).length) {
      sections.push(['英雄', entry.heroes.names.join('、')]);
    }
    const notes = [];
    if (entry.reminder) notes.push(entry.reminder);
    if (entry.notes) notes.push(String(entry.notes));
    (entry.dateNotes || []).forEach((note) => {
      const text = typeof note === 'string' ? note : (note && note.text) || '';
      if (text) notes.push(text);
    });
    if (notes.length) sections.push(['笔记', notes.join('\n')]);
    return sections;
  }

  // 卡面与数量一同进入逐日 PDF；没有安装图片时仍保留文字记录。
  async function writeCardSnapshots(writer, cards, imageCache, options) {
    if (!cards || !['story', 'doom'].some((kind) => cards[kind] && cards[kind].known)) return;
    const gap = 0;
    const width = (PAGE_PX_WIDTH - MARGIN * 2 - gap) / 2;
    const thumbnailHeight = 350;
    const views = await Promise.all(['story', 'doom'].map(async (kind) => {
      const track = cards[kind];
      const path = track && track.card && track.card.image;
      let image = null;
      if (path) {
        const src = '../' + path.replace(/^\.\//, '');
        if (!imageCache.has(src)) {
          const loadImage = options.loadImage || window.ATO_BRIEFING_GIF?.loadImage;
          const promise = loadImage
            ? Promise.resolve().then(() => loadImage(src, writer.doc))
            : new Promise((resolve) => {
              const node = new Image();
              node.onload = () => resolve(node);
              node.onerror = () => resolve(null);
              node.src = src;
            });
          imageCache.set(src, promise.then((original) => {
            if (!original) return null;
            // 原始卡图可达数千万像素，缓存 PDF 实际使用的小图避免保留整副牌的解码内存。
            const iw = original.naturalWidth || original.width || width;
            const ih = original.naturalHeight || original.height || thumbnailHeight;
            const scale = Math.min(1, (width - 16) / iw, (thumbnailHeight - 16) / ih);
            const thumbnail = writer.doc.createElement('canvas');
            thumbnail.width = Math.max(1, Math.round(iw * scale));
            thumbnail.height = Math.max(1, Math.round(ih * scale));
            thumbnail.getContext('2d').drawImage(original, 0, 0, thumbnail.width, thumbnail.height);
            return thumbnail;
          }).catch(() => null));
        }
        image = await imageCache.get(src);
      }
      return { kind, track, image };
    }));
    const ratios = views.map(({ image }) => image ? image.width / image.height : 1.46);
    const fullWidth = PAGE_PX_WIDTH - MARGIN * 2;
    const imageHeight = Math.min(900, fullWidth / (ratios[0] + ratios[1]));
    const joinedWidth = imageHeight * (ratios[0] + ratios[1]);
    const rowHeight = imageHeight + 100;
    writer.ensure(rowHeight);
    const ctx = writer.page.ctx;
    const top = writer.page.y;
    views.forEach(({ kind, track, image }, index) => {
      const columnWidth = imageHeight * ratios[index];
      const x = MARGIN + (fullWidth - joinedWidth) / 2 + (index ? imageHeight * ratios[0] : 0);
      const card = track && track.card;
      ctx.fillStyle = '#5f341b';
      ctx.font = 'bold 21px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText((kind === 'story' ? '故事卡' : '灾祸卡') + (card ? ' · ' + card.label : ''), x, top);
      ctx.font = '18px ' + FONT;
      const counts = track && track.known
        ? (track.preview ? '未开始 · 下张预览 · ' : '') + '进展 ' + track.progress + (kind === 'doom' ? ' · 灾祸 ' + track.doom : '')
        : '这份备份没有卡片记录';
      ctx.fillText(counts, x, top + 32);
      ctx.fillStyle = '#f6f0eb';
      ctx.fillRect(x, top + 48, columnWidth, imageHeight);
      if (image) {
        ctx.drawImage(image, x, top + 48, columnWidth, imageHeight);
      } else {
        ctx.fillStyle = '#706a60';
        ctx.font = '17px ' + FONT;
        ctx.fillText(card ? '本地卡图尚未安装' : '无对应卡面', x + 16, top + 90);
      }
      if (card) {
        ctx.fillStyle = '#706a60';
        ctx.font = '16px ' + FONT;
        ctx.fillText(wrapText(ctx, card.name, columnWidth)[0], x, top + imageHeight + 74);
      }
    });
    writer.page.y += rowHeight;
  }

  /** 逐日简报：封面 + 索引 + 每天一页，返回 [{ jpeg, width, height }]。 */
  async function buildDailyPdf(options) {
    const doc = options.document || document;
    const toJpeg = options.toJpeg || ((canvas) => canvasToJpeg(canvas, 0.92));
    const payload = options.payload || {};
    const days = options.days || [];
    const techNames = techLabelMap(payload);
    const summary = payload.summary || {};
    const cycleLabel = (payload.cycle && payload.cycle.label) || '战役';
    const recorded = days.filter((entry) => entry.present);
    const writer = createDocWriter(doc);
    const cardImageCache = new Map();

    // 封面 / 索引
    writer.startPage('');
    writer.page.y = MARGIN + 40;
    writeBlock(writer, { text: '战役简报 · ' + cycleLabel, size: 40, bold: true, gap: 8 });
    writeBlock(writer, {
      text: [
        '导出时间 ' + new Date().toLocaleString('zh-CN'),
        '已记录 ' + (summary.recordedDays || recorded.length) + ' 天',
        summary.firstDay ? '首次 ' + summary.firstDay : '',
        summary.lastDay ? '最近 ' + summary.lastDay : '',
      ].filter(Boolean).join(' · '),
      size: 18,
      color: '#706a60',
      gap: 22,
    });
    writeBlock(writer, { text: '逐日索引', size: 24, bold: true, gap: 6 });
    recorded.forEach((entry) => {
      const meta = [
        entry.savedAtLocal,
        entry.map ? '翻开 ' + entry.map.exploredCount + ' 格' : '',
        entry.tech ? '点亮 ' + entry.tech.unlocked.length + ' 项' : '',
      ].filter(Boolean).join(' · ');
      writeBlock(writer, { text: entry.title + (meta ? '　' + meta : ''), size: 17, color: '#5f341b' });
    });

    // 每天一页
    for (let index = 0; index < recorded.length; index += 1) {
      const entry = recorded[index];
      writer.header = '战役简报 · ' + cycleLabel + ' · ' + entry.title;
      writer.startPage('战役简报 · ' + cycleLabel);
      writer.page.y = MARGIN + 30;
      writeBlock(writer, { text: entry.title, size: 30, bold: true, gap: 4 });
      const meta = [
        entry.savedAtLocal ? '备份 ' + entry.savedAtLocal : '',
        entry.location ? '位置 ' + entry.location : '',
      ].filter(Boolean).join(' · ');
      if (meta) writeBlock(writer, { text: meta, size: 17, color: '#706a60', gap: 16 });
      await writeCardSnapshots(writer, entry.cards, cardImageCache, options);
      daySectionTexts(entry, techNames).forEach(([title, body]) => {
        writeBlock(writer, { text: title, size: 21, bold: true, color: '#7f4b26', gap: 2 });
        writeBlock(writer, { text: body, size: 18, indent: 18, gap: 14 });
      });
      if (options.onProgress) options.onProgress(index + 1, recorded.length);
    }

    const pages = [];
    for (let index = 0; index < writer.pages.length; index += 1) {
      const page = writer.pages[index];
      const jpeg = await toJpeg(page.canvas);
      pages.push({ jpeg, width: PAGE_PX_WIDTH, height: PAGE_PX_HEIGHT });
    }
    return pages;
  }

  // ---------- 编排 ----------

  function stamp() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  async function download(bytes, filename, type, doc) {
    if (window.ATOAndroid) {
      if (typeof window.ATOAndroid.exportBriefingZip !== 'function') {
        throw new Error('当前安卓版尚不支持简报文件保存，请更新 APK 后重试。');
      }
      if (window.ATOAndroidExportResult) throw new Error('已有导出正在进行');
      // Each block is divisible by three so concatenating its base64 does not
      // introduce padding mid-file. Small blocks also avoid argument limits.
      const encoded = [];
      for (let offset = 0; offset < bytes.length; offset += 24576) {
        encoded.push(window.btoa(String.fromCharCode(...bytes.subarray(offset, offset + 24576))));
      }
      await new Promise((resolve, reject) => {
        window.ATOAndroidExportResult = (result) => {
          delete window.ATOAndroidExportResult;
          if (result && result.ok) resolve();
          else reject(new Error(result && result.error || '文件写入失败'));
        };
        try {
          window.ATOAndroid.exportBriefingZip(filename, encoded.join(''));
        } catch (error) {
          delete window.ATOAndroidExportResult;
          reject(error);
        }
      });
      return;
    }
    const target = doc || document;
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const link = target.createElement('a');
    link.href = url;
    link.download = filename;
    target.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /**
   * 导出三件套并打包下载。
   *
   * options: { payload, days, map, onStatus, document, loadImage, urlApi, mapWidth, techPages }
   */
  async function run(options) {
    const payload = options.payload;
    if (!payload || !payload.cycle) throw new Error('还没有读到简报数据');
    const days = options.days || [];
    const doc = options.document || document;
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    const mapApi = window.ATO_BRIEFING_MAP || {};
    const gifApi = window.ATO_BRIEFING_GIF;
    if (!gifApi) throw new Error('GIF 导出模块没有加载');
    if (window.ATOAndroid && typeof window.ATOAndroid.readExportImageData !== 'function') {
      throw new Error('当前安卓版尚不支持简报图片导出，请更新 APK 后重试。');
    }
    const map = options.map;
    if (!map || typeof map.geometry !== 'function') throw new Error('地图还没准备好，稍后再试');
    const geometry = map.geometry();
    const tiles = typeof map.tiles === 'function' ? map.tiles() : [];
    const cycleId = payload.cycle.cycleId;
    const fileStamp = stamp();
    const entries = [];

    onStatus('正在渲染地图回放 GIF…');
    entries.push({
      name: 'map-replay-' + cycleId + '.gif',
      bytes: await gifApi.encodeMap({
        days,
        cycle: payload.cycle,
        tiles,
        geometry,
        parseMarkers: mapApi.parseMarkers,
        tokenAssets: mapApi.TOKEN_ASSETS,
        assetPath: mapApi.assetPath,
        revealDays: typeof mapApi.collectRevealDays === 'function' ? mapApi.collectRevealDays(days) : null,
        width: options.mapWidth,
        document: doc,
        loadImage: options.loadImage,
        onStatus: (text) => onStatus('地图回放：' + text),
        onProgress: (done, total) => onStatus('正在渲染地图回放 GIF… ' + done + '/' + total + ' 帧'),
      }),
    });

    onStatus('正在渲染科技树回放 GIF…');
    const core = window.ATO_BRIEFING_CORE || {};
    const pages = options.techPages
      || (typeof core.selectTechPages === 'function'
        ? core.selectTechPages((payload.tech && payload.tech.pages) || [], cycleId)
        : (payload.tech && payload.tech.pages) || []);
    entries.push({
      name: 'tech-replay-' + cycleId + '.gif',
      bytes: await gifApi.encodeTech({
        days,
        cycle: payload.cycle,
        pages,
        timeline: days,
        document: doc,
        loadImage: options.loadImage,
        urlApi: options.urlApi,
        onStatus: (text) => onStatus('科技树回放：' + text),
        onProgress: (done, total) => onStatus('正在渲染科技树回放 GIF… ' + done + '/' + total + ' 帧'),
      }),
    });

    onStatus('正在排版逐日简报 PDF…');
    const pdfPages = await buildDailyPdf({
      payload,
      days,
      document: doc,
      toJpeg: options.toJpeg,
      loadImage: options.loadImage,
      onProgress: (done, total) => onStatus('正在排版逐日简报 PDF… ' + done + '/' + total + ' 页'),
    });
    entries.push({
      name: 'daily-briefing-' + cycleId + '.pdf',
      bytes: createPdf(pdfPages),
    });

    onStatus('正在打包 zip…');
    const zip = createZip(entries);
    const filename = 'ATO-简报-' + cycleId + '-' + fileStamp + '.zip';
    onStatus(window.ATOAndroid ? '请选择简报 ZIP 的保存位置…' : '正在下载 ZIP…');
    await download(zip, filename, 'application/zip', doc);
    onStatus('已导出 ' + filename + '（' + Math.round(zip.length / 1024) + ' KB）');
    return { zip, filename, entries };
  }

  window.ATO_BRIEFING_REPORT = {
    run,
    createZip,
    createPdf,
    buildDailyPdf,
    crc32,
    canvasToJpeg,
    download,
  };
})();
