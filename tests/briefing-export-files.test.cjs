/**
 * 战役简报「GIF / PDF 导出」的回归测试。
 *
 * 三件事都只能在浏览器里做（内置 PHP 没有 GD/Imagick，仓库里也没有可嵌入的中文字体），
 * 所以这里用最小的 canvas / DOM 替身把整条链路跑起来，验证的是"我们自己写的部分"：
 *   - ZIP：结构是否正确（中央目录、偏移、CRC）——用 node:zlib.crc32 独立核对；
 *   - GIF：地图逐日帧是否真的按天数出帧、帧延时与循环扩展是否写对（自己走一遍 GIF 块结构）；
 *   - PDF：对象、交叉引用表偏移、JPEG（DCTDecode）流是否齐备；
 *   - 逐日简报排版：封面/索引 + 每天一页的页数是否正确。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const gifencSource = fs.readFileSync(path.join(root, 'assets', 'vendor', 'gifenc.js'), 'utf8');
const mapSource = fs.readFileSync(path.join(root, 'briefing', 'briefing-map.js'), 'utf8');
const gifSource = fs.readFileSync(path.join(root, 'briefing', 'briefing-gif.js'), 'utf8');
const reportSource = fs.readFileSync(path.join(root, 'briefing', 'briefing-report.js'), 'utf8');

// ---------- 最小 canvas / DOM 替身 ----------

/** 一个能跑通绘制调用、并给出确定性像素的 2D 上下文替身。 */
function createContext2d(canvas) {
  let seed = 0;
  const ctx = {
    canvas,
    // 记录文字与图片绘制，测试靠它们核对"标签写了什么""板块是不是紧密贴合"。
    texts: [],
    draws: [],
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect() { seed += 1; },
    strokeRect() {},
    fillText(text) { ctx.texts.push(String(text)); },
    measureText(text) { return { width: String(text).length * 9 }; },
    drawImage(image, x, y, w, h) { ctx.draws.push({ x, y, w, h }); },
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    clip() {},
    getImageData(x, y, w, h) {
      // 帧号（seed）参与像素值，保证不同帧的像素真的不同，能验证"每帧都写进去了"。
      const data = new Uint8ClampedArray(w * h * 4);
      for (let index = 0; index < w * h; index += 1) {
        data[index * 4] = (seed * 37 + index) % 251;
        data[index * 4 + 1] = (seed * 11 + index * 3) % 253;
        data[index * 4 + 2] = (seed * 7 + index * 5) % 247;
        data[index * 4 + 3] = 255;
      }
      return { data, width: w, height: h };
    },
  };
  return ctx;
}

function createCanvas(width, height) {
  const canvas = { width: width || 300, height: height || 150 };
  canvas.getContext = () => (canvas._ctx ||= createContext2d(canvas));
  return canvas;
}

function createStubDocument() {
  const doc = {
    canvases: [],
    styleSheets: [{
      cssRules: [
        { selectorText: '.tech-node rect', cssText: '.tech-node rect { fill: #eee; }' },
        { selectorText: '.log-day', cssText: '.log-day { border: 1px solid #000; }' },
        { selectorText: '.tech-edge', cssText: '.tech-edge { stroke: #ccc; }' },
      ],
    }],
    createElement(tag) {
      if (String(tag).toLowerCase() === 'canvas') {
        const canvas = createCanvas();
        doc.canvases.push(canvas);
        return canvas;
      }
      return { tagName: String(tag).toUpperCase(), style: {}, dataset: {}, appendChild() {}, addEventListener() {} };
    },
  };
  doc.body = { appendChild() {}, removeChild() {} };
  return doc;
}

function createSandbox(doc) {
  const sandbox = {
    console,
    document: doc,
    window: {},
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
    Blob: class { constructor(parts) { this.parts = parts; } },
    TextEncoder,
    XMLSerializer: class { serializeToString() { return '<svg></svg>'; } },
    Math, Error, Number, Boolean, Array, Infinity, Date, Set, Map, Promise, JSON, String, Object,
    Uint8Array, Uint8ClampedArray, Uint32Array, Int32Array, DataView, ArrayBuffer,
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = doc;
  sandbox.window.setTimeout = setTimeout;
  return sandbox;
}

/** 在替身环境里加载 gifenc + briefing-map + briefing-gif + briefing-report。 */
function loadModules(options = {}) {
  const doc = createStubDocument();
  const sandbox = createSandbox(doc);
  // 有布局数据时板块走正规坐标（简报页里由 map/nemesis-path.js 提供），否则会落到
  // 「排在地图下方」的兜底行——两条路都要紧密贴合，但测的是前者。
  sandbox.window.ATO_NEMESIS_PATH = options.nemesis || null;
  vm.runInNewContext(gifencSource, sandbox, { filename: 'gifenc.js' });
  vm.runInNewContext(mapSource, sandbox, { filename: 'briefing-map.js' });
  vm.runInNewContext(gifSource, sandbox, { filename: 'briefing-gif.js' });
  vm.runInNewContext(reportSource, sandbox, { filename: 'briefing-report.js' });
  return {
    sandbox,
    doc,
    gifenc: sandbox.window.ATO_GIFENC,
    mapApi: sandbox.window.ATO_BRIEFING_MAP,
    gifApi: sandbox.window.ATO_BRIEFING_GIF,
    reportApi: sandbox.window.ATO_BRIEFING_REPORT,
  };
}

// ---------- 解析工具：独立走一遍 ZIP / GIF / PDF 的结构 ----------

function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = bytes.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50, 'EOCD 签名');
  const count = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  assert.equal(centralOffset + centralSize, eocdOffset, '中央目录应当紧邻 EOCD');
  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50, '中央目录条目签名');
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, '本地文件头签名');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    entries.push({ name, crc, size, data: bytes.subarray(dataStart, dataStart + size) });
    cursor += 46 + nameLength;
  }
  return entries;
}

/** 按 GIF 块结构走一遍：返回帧信息（含延时）与循环次数。 */
function readGif(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = new TextDecoder().decode(bytes.subarray(0, 6));
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const packed = bytes[10];
  let cursor = 13;
  if (packed & 0x80) cursor += 3 * (1 << ((packed & 0x07) + 1));
  const frames = [];
  let loop = null;
  let delay = null;
  let trailer = false;
  while (cursor < bytes.length) {
    const marker = bytes[cursor];
    if (marker === 0x3b) {
      trailer = true;
      break;
    }
    if (marker === 0x21) {
      const label = bytes[cursor + 1];
      cursor += 2;
      const blocks = [];
      while (cursor < bytes.length && bytes[cursor] !== 0) {
        const size = bytes[cursor];
        blocks.push(bytes.subarray(cursor + 1, cursor + 1 + size));
        cursor += 1 + size;
      }
      cursor += 1;
      if (label === 0xf9 && blocks.length) delay = new DataView(blocks[0].buffer, blocks[0].byteOffset, blocks[0].byteLength).getUint16(1, true);
      if (label === 0xff) loop = blocks.length > 1 ? new DataView(blocks[1].buffer, blocks[1].byteOffset, blocks[1].byteLength).getUint16(1, true) : 0;
      continue;
    }
    if (marker === 0x2c) {
      const framePacked = bytes[cursor + 9];
      cursor += 10;
      if (framePacked & 0x80) cursor += 3 * (1 << ((framePacked & 0x07) + 1));
      cursor += 1; // LZW 最小码长
      while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1 + bytes[cursor];
      cursor += 1;
      frames.push({ delay });
      continue;
    }
    throw new Error('无法识别的 GIF 块 0x' + marker.toString(16) + ' @' + cursor);
  }
  return { signature, width, height, frames, loop, trailer };
}

// ---------- ZIP ----------

test('导出的 zip 结构正确、CRC 与内容一致', () => {
  const { reportApi } = loadModules();
  const first = new TextEncoder().encode('hello 简报');
  const second = new Uint8Array([0, 1, 2, 250, 251, 252]);
  const zip = reportApi.createZip([
    { name: 'map-replay-c1.gif', bytes: first },
    { name: 'daily-briefing-c1.pdf', bytes: second },
  ], new Date(2026, 9, 2, 22, 30, 0));

  const entries = readZip(zip);
  assert.deepEqual(entries.map((entry) => entry.name), ['map-replay-c1.gif', 'daily-briefing-c1.pdf']);
  assert.deepEqual(Array.from(entries[0].data), Array.from(first));
  assert.deepEqual(Array.from(entries[1].data), Array.from(second));
  if (typeof zlib.crc32 === 'function') {
    assert.equal(entries[0].crc, zlib.crc32(first), 'zip 里的 CRC 必须与独立实现一致');
    assert.equal(entries[1].crc, zlib.crc32(second));
  }
});

// ---------- GIF ----------

test('地图回放 GIF 按天数出帧、板块紧密贴合、标签标游戏日', async () => {
  const nemesis = {
    displayLayout: () => ({
      position: (tile) => ({ x: tile.id === 'T01' ? 1 : 0, y: 0 }),
    }),
  };
  const { doc, mapApi, gifApi } = loadModules({ nemesis });
  const tiles = [
    { id: 'T00', label: 'T00', front: './images/c1-tile-T00-front.jpg' },
    { id: 'T01', label: 'T01', front: './images/c1-tile-T01-front.jpg' },
  ];
  const canvas = createCanvas();
  canvas.clientWidth = 900;
  canvas.clientHeight = 600;
  const stage = doc.createElement('div');
  const renderer = mapApi.create({
    canvas,
    stage,
    cycle: { id: 'c1' },
    canvasSize: { width: 2, height: 1, tileWidth: 1 },
    tiles,
    order: ['T00', 'T01'],
  });
  const days = [
    { index: 0, day: 'T0', title: '序章 T0', present: true, savedAtLocal: '2026-09-20 10:00', location: '起点', map: { explored: ['T00'], new: ['T00'], currentTileId: 'T00', markers: ['T00:last_city,hs'], exploredCount: 1 }, tech: null },
    { index: 1, day: '1', title: '第 1 天', present: false, map: null },
    { index: 2, day: '2', title: '第 2 天', present: true, savedAtLocal: '2026-09-22 10:00', location: '', map: { explored: ['T00', 'T01'], new: ['T01'], currentTileId: 'T01', markers: ['T01:sandstorm(上)'], exploredCount: 2 }, tech: null },
  ];
  const bytes = await gifApi.encodeMap({
    days,
    cycle: { label: '循环 I' },
    tiles: renderer.tiles(),
    geometry: renderer.geometry(),
    parseMarkers: mapApi.parseMarkers,
    tokenAssets: mapApi.TOKEN_ASSETS,
    assetPath: mapApi.assetPath,
    revealDays: mapApi.collectRevealDays(days),
    document: doc,
    loadImage: async () => ({ width: 72, height: 72 }),
    onProgress: () => {},
  });

  const gif = readGif(bytes);
  assert.equal(gif.signature, 'GIF89a');
  assert.ok(gif.width > 500 && gif.height > 300, `画布尺寸应当由地图几何推出，实际 ${gif.width}x${gif.height}`);
  // 没有备份的那天不出帧：3 天里只有 2 天有记录。
  assert.equal(gif.frames.length, 2, '缺口日不应出帧');
  assert.equal(gif.frames[0].delay, gifApi.FRAME_DELAY_MS / 10);
  assert.equal(gif.loop, 0, '应当无限循环');
  assert.ok(gif.trailer, 'GIF 应当有 trailer');

  // 板块画在同一行：相邻板块的步长必须正好等于板块边长（紧密贴合，没有缝）。
  // 图标也走 drawImage，所以只取最大的那档方块尺寸（= 板块边长）。
  const ctx = doc.canvases[0]._ctx;
  const squares = ctx.draws.filter((draw) => draw.w === draw.h);
  const tileSize = Math.max(...squares.map((draw) => draw.w));
  const rows = new Map();
  squares.filter((draw) => draw.w === tileSize).forEach((draw) => {
    if (!rows.has(draw.y)) rows.set(draw.y, []);
    rows.get(draw.y).push(draw);
  });
  let pairs = 0;
  rows.forEach((row) => {
    // 每一帧都会重画同一批板块，所以按 x 去重后再看步长。
    const columns = [...new Set(row.map((draw) => Math.round(draw.x)))].sort((a, b) => a - b);
    for (let index = 1; index < columns.length; index += 1) {
      assert.equal(columns[index] - columns[index - 1], Math.round(row[0].w), '相邻板块之间不能有缝');
      pairs += 1;
    }
  });
  assert.ok(pairs >= 1, '至少要检查一对相邻板块');

  // 左上角标签是「第一次翻开的游戏日」，不是板块号，也不是现实日期。
  assert.ok(ctx.texts.includes('T0'), `板块标签应当标游戏日，实际文字：${ctx.texts.join(' | ')}`);
  assert.ok(ctx.texts.includes('D2'));
  assert.ok(!ctx.texts.includes('T00'), '板块标签不应再是板块号');
  assert.ok(!ctx.texts.includes('T01'));
  const realDates = ctx.texts.filter((text) => /\d{4}-\d{2}-\d{2}|\d+月\d+日|\d+\s*\/\s*\d+/.test(text));
  assert.deepEqual(realDates, [], `地图帧上不应用现实日期/比例：${realDates.join(' | ')}`);
});

test('科技树的样式会被抄进离屏 SVG', () => {
  const { doc, gifApi } = loadModules();
  const css = gifApi.collectTechCss(doc);
  assert.match(css, /\.tech-node rect/);
  assert.match(css, /\.tech-edge/);
  assert.doesNotMatch(css, /\.log-day/, '无关样式不该抄进去');
  assert.match(css, /font-family/, '必须给 SVG 指定字体，否则栅格化时中文会掉字体');
});

// ---------- PDF ----------

test('PDF 的对象、交叉引用表偏移与 JPEG 流都正确', () => {
  const { reportApi } = loadModules();
  const jpegA = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const jpegB = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 9, 8, 7, 0xff, 0xd9]);
  const pdf = reportApi.createPdf([
    { jpeg: jpegA, width: 1240, height: 1754 },
    { jpeg: jpegB, width: 1240, height: 1754 },
  ]);
  const text = new TextDecoder('latin1').decode(pdf);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/Count 2/);
  assert.equal((text.match(/\/Filter \/DCTDecode/g) || []).length, 2);
  assert.match(text, /%%EOF\s*$/);

  // 交叉引用表里的每个偏移都必须真的指向 "<编号> 0 obj"。
  // 行序：xref / "0 9" / 空闲条目（对象 0）/ 对象 1… → 跳过前三行。
  const startxref = Number(text.match(/startxref\s+(\d+)/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const xrefBody = text.slice(startxref).split('\n').slice(3);
  for (let id = 1; id <= 8; id += 1) {
    const offset = Number(xrefBody[id - 1].slice(0, 10));
    assert.equal(text.slice(offset, offset + String(id).length + 6), id + ' 0 obj', `对象 ${id} 的偏移不对`);
  }
  // JPEG 字节必须原样落进流里。
  const index = pdf.indexOf(jpegA[0]);
  assert.ok(index > 0);
  assert.deepEqual(Array.from(pdf.subarray(index, index + jpegA.length)), Array.from(jpegA));
});

test('逐日简报按「封面+索引」加每天一页排版', async () => {
  const { doc, reportApi } = loadModules();
  const payload = {
    cycle: { cycleId: 'c1', label: '循环 I' },
    summary: { recordedDays: 2, firstDay: 'T0', lastDay: '2' },
    tech: { unlocked: [{ key: 'k1', name: '方舟导航' }] },
  };
  const days = [
    { index: 0, day: 'T0', title: 'T0', present: true, savedAtLocal: '2026-09-20 10:00', location: '起点', objective: '抵达迷宫入口', story: { section: '序章', title: '一切由此开始' }, notes: '记得带水', dateNotes: [], heroes: { names: ['阿戈'] }, map: { explored: ['T00'], new: ['T00'], exploredCount: 1 }, tech: { unlocked: ['k1'], new: ['k1'] }, changes: [{ kind: 'map', label: '探索', items: ['T00'] }] },
    { index: 1, day: '1', title: '第 1 天', present: false },
    { index: 2, day: '2', title: '第 2 天', present: true, savedAtLocal: '2026-09-22 10:00', location: '', objective: '', story: null, notes: '', dateNotes: [], heroes: null, map: { explored: ['T00', 'T01'], new: ['T01'], exploredCount: 2 }, tech: { unlocked: ['k1'], new: [] }, changes: [] },
  ];
  const pages = [];
  const result = await reportApi.buildDailyPdf({
    payload,
    days,
    document: doc,
    toJpeg: async (canvas) => new Uint8Array([0xff, 0xd8, canvas.width & 0xff, canvas.height & 0xff, 0xff, 0xd9]),
    onProgress: (done, total) => pages.push(done + '/' + total),
  });
  // 封面（索引占 1 页）+ 2 个有记录的日子 = 3 页。
  assert.equal(result.length, 3, `页数不对：${result.length}`);
  assert.deepEqual(pages, ['1/2', '2/2']);
  assert.equal(result[0].width, 1240);
  assert.equal(result[0].height, 1754);
  for (const page of result) assert.equal(page.jpeg[0], 0xff);
});

// ---------- 导出面与入口 ----------

test('安卓保存 ZIP 传递完整二进制，等待系统写入确认后才完成', async () => {
  const { reportApi, sandbox } = loadModules();
  const bytes = Uint8Array.from({ length: 65539 }, (_, index) => index % 256);
  let captured, complete = false;
  sandbox.window.btoa = (value) => Buffer.from(value, 'latin1').toString('base64');
  sandbox.window.ATOAndroid = { exportBriefingZip(filename, base64) { captured = { filename, base64 }; } };
  sandbox.URL.createObjectURL = () => { throw new Error('Android must use the system picker'); };
  const saving = reportApi.download(bytes, 'ATO-简报-c1.zip', 'application/zip').then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false, 'Opening the picker is not a successful save');
  assert.equal(captured.filename, 'ATO-简报-c1.zip');
  assert.deepEqual(Buffer.from(captured.base64, 'base64'), Buffer.from(bytes), 'No padding or UTF-8 corruption between blocks');
  sandbox.window.ATOAndroidExportResult({ ok: true });
  await saving;
  assert.equal(complete, true);
  assert.equal(sandbox.window.ATOAndroidExportResult, undefined);
});

test('整套简报 ZIP 包含两个 GIF 和 PDF，系统保存完成前不显示已导出', async () => {
  const { reportApi, sandbox } = loadModules();
  const statuses = [];
  let captured, signalPicker;
  const atPicker = new Promise((resolve) => { signalPicker = resolve; });
  sandbox.window.btoa = (value) => Buffer.from(value, 'latin1').toString('base64');
  sandbox.window.ATO_BRIEFING_GIF = {
    encodeMap: async () => new Uint8Array([71, 73, 70, 56, 57, 97]),
    encodeTech: async () => new Uint8Array([71, 73, 70, 56, 57, 97]),
  };
  sandbox.window.ATOAndroid = { readExportImageData() { return ''; }, exportBriefingZip(filename, base64) { captured = { filename, base64 }; signalPicker(); } };
  const exporting = reportApi.run({
    payload: { cycle: { cycleId: 'c1', label: '循环 I' }, tech: { pages: [], unlocked: [] }, summary: { recordedDays: 1 } },
    days: [{ present: true, day: '1', title: '第 1 天' }],
    map: { geometry: () => ({}), tiles: () => [] },
    toJpeg: async () => new Uint8Array([255, 216, 255, 217]),
    onStatus: (message) => statuses.push(message),
  });
  await atPicker;
  assert.match(captured.filename, /^ATO-简报-c1-\d{8}\.zip$/);
  const entries = readZip(Buffer.from(captured.base64, 'base64'));
  assert.deepEqual(entries.map((entry) => entry.name), ['map-replay-c1.gif', 'tech-replay-c1.gif', 'daily-briefing-c1.pdf']);
  assert.match(new TextDecoder().decode(entries[2].data), /^%PDF-1\.4/);
  assert.ok(statuses.at(-1).includes('保存位置'));
  assert.ok(!statuses.some((message) => message.startsWith('已导出')));
  sandbox.window.ATOAndroidExportResult({ ok: true });
  const result = await exporting;
  assert.equal(result.filename, captured.filename);
  assert.match(statuses.at(-1), /^已导出/);
});

test('安卓取消和写入失败向页面报告，清理回调后可重试', async () => {
  const { reportApi, sandbox } = loadModules();
  sandbox.window.btoa = (value) => Buffer.from(value, 'latin1').toString('base64');
  sandbox.window.ATOAndroid = { exportBriefingZip() {} };
  for (const error of ['已取消导出', '磁盘空间不足']) {
    const saving = reportApi.download(new Uint8Array([1, 2, 3]), 'test.zip', 'application/zip');
    sandbox.window.ATOAndroidExportResult({ ok: false, error });
    await assert.rejects(saving, new RegExp(error));
    assert.equal(sandbox.window.ATOAndroidExportResult, undefined);
  }
  sandbox.window.ATOAndroid.exportBriefingZip = () => { throw new Error('bridge failed'); };
  await assert.rejects(reportApi.download(new Uint8Array([1]), 'test.zip', 'application/zip'), /bridge failed/);
  assert.equal(sandbox.window.ATOAndroidExportResult, undefined);
});

test('安卓导出图片从原生读取为 data URL；本地 file 图片不会直接进入 Canvas', async () => {
  const { gifApi, sandbox, doc } = loadModules();
  const calls = [], images = [];
  sandbox.URL = URL;
  sandbox.window.location = { href: 'file:///android_asset/web/briefing/index.html' };
  sandbox.window.ATOAndroid = { readExportImageData(path) { calls.push(path); return 'data:image/jpeg;base64,/9j/2Q=='; } };
  doc.createElement = () => {
    const image = { set src(value) { image.url = value; queueMicrotask(() => image.onload()); } };
    images.push(image);
    return image;
  };
  await gifApi.loadImage('../assets/故事图.jpg?v=1', doc);
  assert.deepEqual(calls, ['assets/故事图.jpg']);
  assert.equal(images[0].url, 'data:image/jpeg;base64,/9j/2Q==');
  await assert.rejects(gifApi.loadImage('file:///data/private.png', doc), /应用外/);
  sandbox.window.ATOAndroid.readExportImageData = () => '';
  await assert.rejects(gifApi.loadImage('../assets/missing.jpg', doc), /不可用/);
});

test('逐日 PDF 卡图与缩略图保持可导出，复现 file 图片污染时的 toBlob 检查', async () => {
  const { reportApi, sandbox, doc } = loadModules();
  const calls = [];
  sandbox.URL = URL;
  sandbox.window.location = { href: 'file:///android_asset/web/briefing/index.html' };
  sandbox.window.ATOAndroid = { readExportImageData(path) { calls.push(path); return 'data:image/jpeg;base64,/9j/2Q=='; } };
  const createElement = doc.createElement;
  doc.createElement = (tag) => {
    if (tag === 'img') {
      const image = { naturalWidth: 4807, naturalHeight: 3296,
        set src(value) { image.tainted = value.startsWith('file:') || value.startsWith('../'); queueMicrotask(() => image.onload()); } };
      return image;
    }
    const canvas = createElement(tag);
    const ctx = canvas.getContext('2d'), drawImage = ctx.drawImage;
    ctx.drawImage = (...args) => { canvas.tainted ||= Boolean(args[0].tainted); drawImage(...args); };
    canvas.toBlob = (callback) => {
      if (canvas.tainted) throw new Error("Tainted canvases may not be exported.");
      callback(new Blob([new Uint8Array([255, 216, 255, 217])]));
    };
    return canvas;
  };
  const track = (name) => ({ known: true, progress: 1, doom: 0, card: { name, label: '1A', image: './assets/' + name + '.jpg' } });
  const pages = await reportApi.buildDailyPdf({ document: doc,
    days: [{ present: true, title: '第 1 天', cards: { story: track('故事图'), doom: track('灾祸图') } }] });
  assert.equal(pages.length, 2);
  assert.deepEqual(calls.sort(), ['assets/故事图.jpg', 'assets/灾祸图.jpg'].sort());
  assert.equal(doc.canvases[1]._ctx.draws.length, 2, '卡图必须保留，不能靠省略图片来绕过错误');
  assert.ok(doc.canvases.every((canvas) => !canvas.tainted));
});

test('安卓科技树 SVG 以独立 data URL 栅格化，避免 file 页面 blob 来源', async () => {
  const { gifApi, sandbox, doc } = loadModules();
  const attributes = new Map();
  doc.createElementNS = () => ({ setAttribute(key, value) { attributes.set(key, value); }, getAttribute(key) { return attributes.get(key); } });
  sandbox.window.ATOAndroid = {};
  sandbox.window.ATO_BRIEFING_TECH = { create({ svg }) {
    svg.setAttribute('width', '1000'); svg.setAttribute('height', '20');
    return { render: () => ({ unlocked: 1, total: 1 }) };
  } };
  const urls = [];
  const bytes = await gifApi.encodeTech({ days: [{ present: true, day: '1', tech: { unlocked: ['x'], new: ['x'] } }], document: doc,
    urlApi: { createObjectURL() { throw new Error('Android should not create an opaque blob'); }, revokeObjectURL() { throw new Error('Data URL should not be revoked'); } },
    loadImage: async (src) => { urls.push(src); return { width: 1000, height: 20 }; } });
  assert.match(urls[0], /^data:image\/svg\+xml;charset=utf-8,/);
  assert.match(new TextDecoder().decode(bytes.subarray(0, 6)), /^GIF89a$/);
});

test('旧 APK 明确提示更新；已有导出时保留原回调', async () => {
  const { reportApi, sandbox } = loadModules();
  sandbox.window.ATOAndroid = { exportStateJson() {} };
  await assert.rejects(reportApi.download(new Uint8Array([1]), 'test.zip', 'application/zip'), /更新 APK/);
  const previous = () => {};
  sandbox.window.ATOAndroid.exportBriefingZip = () => { throw new Error('should not start'); };
  sandbox.window.ATOAndroidExportResult = previous;
  await assert.rejects(reportApi.download(new Uint8Array([1]), 'test.zip', 'application/zip'), /已有导出/);
  assert.equal(sandbox.window.ATOAndroidExportResult, previous);
});

test('桌面浏览器仍通过带 download 属性的 ZIP 链接下载', async () => {
  const { reportApi, sandbox, doc } = loadModules();
  let clicked = false, removed = false, revoked = false;
  const anchor = { click() { clicked = true; }, remove() { removed = true; } };
  doc.createElement = () => anchor;
  sandbox.window.setTimeout = (fn) => fn();
  sandbox.URL.revokeObjectURL = () => { revoked = true; };
  await reportApi.download(new Uint8Array([1, 2, 3]), 'test.zip', 'application/zip', doc);
  assert.equal(anchor.download, 'test.zip');
  assert.equal(anchor.href, 'blob:stub');
  assert.ok(clicked && removed && revoked);
});

test('逐日 PDF 包含两张卡面及其数量，并容忍图片缺失', async () => {
  const makeTrack = (name, progress, doom) => ({ known: true, progress, doom, preview: false, card: { label: '1B', name, image: './assets/' + name + '.jpg' } });
  const days = [{ present: true, title: '第 1 天', cards: { story: makeTrack('故事图', 3, 0), doom: makeTrack('灾祸图', 2, 5) } }];
  days[0].progress = { inward: { known: true, position: 7, progress: 2 }, hubs: { known: true, done: 1, total: 7, rows: [{ name: '宿命的谜题', done: 1, boxes: Array(7), active: true }] } };
  const { doc, reportApi } = loadModules();
  const loaded = [];
  await reportApi.buildDailyPdf({ days, document: doc,
    loadImage: async (src) => { loaded.push(src); return { width: 4807, height: 3296 }; },
    toJpeg: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  });
  assert.deepEqual(loaded.sort(), ['../assets/故事图.jpg', '../assets/灾祸图.jpg'].sort());
  assert.equal(doc.canvases[1]._ctx.draws.length, 2);
  const [left, right] = doc.canvases[1]._ctx.draws;
  assert.equal(left.x + left.w, right.x, '故事和灾祸卡应无缝拼接');
  assert.equal(left.h, right.h, '两张卡图应按相同比例高度拼接');
  assert.ok(doc.canvases[1]._ctx.texts.includes('进展 3'));
  assert.ok(doc.canvases[1]._ctx.texts.includes('进展 2 · 灾祸 5'));
  assert.ok(doc.canvases[1]._ctx.texts.includes('阿尔戈号知识等级 7 · 进展 2'));
  assert.ok(doc.canvases[1]._ctx.texts.includes('宿命的谜题 1/7 · 当前中枢'));
  assert.equal(doc.canvases.length, 4, '封面、日页和两张缩略图');
  assert.ok(doc.canvases.slice(2).every((canvas) => canvas.width <= 508 && canvas.height <= 334), '缓存缩略图应按 PDF 显示尺寸缩小');
  const missing = loadModules();
  const pages = await missing.reportApi.buildDailyPdf({ days, document: missing.doc,
    loadImage: async () => { throw new Error('missing asset'); },
    toJpeg: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  });
  assert.equal(pages.length, 2);
  assert.ok(missing.doc.canvases[1]._ctx.texts.includes('本地卡图尚未安装'));
  assert.ok(missing.doc.canvases[1]._ctx.texts.includes('进展 2 · 灾祸 5'));
});

test('简报页只保留 GIF / PDF 导出，离线 HTML 导出与模块都已移除', () => {
  const html = fs.readFileSync(path.join(root, 'briefing', 'index.html'), 'utf8');
  assert.match(html, /id="exportFilesButton"/, 'GIF / PDF 导出按钮要留着');
  assert.ok(!html.includes('id="exportButton"'), '「导出离线简报」按钮应当删除');
  assert.ok(!html.includes('briefing-export.js'), '不应再加载离线导出模块');
  assert.ok(
    !fs.existsSync(path.join(root, 'briefing', 'briefing-export.js')),
    'briefing-export.js 应当已经删除（功能被 GIF / PDF 导出取代）'
  );
  const app = fs.readFileSync(path.join(root, 'briefing', 'briefing-app.js'), 'utf8');
  assert.ok(!app.includes('ATO_BRIEFING_EXPORT'), '简报主逻辑里不应再引用离线导出');
});

test('主控台把战役简报入口放在右侧「用户与存档」的存档操作里', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const navStart = html.indexOf('class="record-links"');
  const navEnd = html.indexOf('</nav>', navStart);
  assert.ok(navStart > 0 && navEnd > navStart, '找不到顶部工具条');
  assert.ok(
    !html.slice(navStart, navEnd).includes('briefing'),
    '顶部工具条里不应再留简报入口'
  );

  const archiveStart = html.indexOf('class="archive-actions"');
  const archiveEnd = html.indexOf('</div>', archiveStart);
  assert.ok(archiveStart > 0 && archiveEnd > archiveStart, '找不到存档操作区');
  const archive = html.slice(archiveStart, archiveEnd);
  assert.match(archive, /class="secondary briefing-card-link" href="\.\/briefing\/index\.html"/, '简报入口应当在存档操作里，并沿用 secondary 按钮样式');
  // 主控台按 cycle 重写入口链接的那段逻辑靠 class 选中它。
  assert.match(html, /querySelectorAll\('a\[href\^="\.\/briefing\/index\.html"\], \.briefing-card-link'\)/);
});

// ---------- 仓库护栏 ----------

test('vendored GIF 编码器在发布审计与 .gitignore 白名单里', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^!\/assets\/vendor\/gifenc\.js$/m, '.gitignore 必须放行 vendored 编码器');
  const auditPs1 = fs.readFileSync(path.join(root, 'tools', 'audit-public-release.ps1'), 'utf8');
  assert.match(auditPs1, /'assets\/vendor\/gifenc\.js'/, '发布审计白名单（ps1）必须放行它');
  const auditLite = fs.readFileSync(path.join(root, 'tools', 'guide-capture', 'audit-lite.mjs'), 'utf8');
  assert.match(auditLite, /'assets\/vendor\/gifenc\.js'/, '发布审计白名单（audit-lite）必须放行它');
});

test('官方存档导入的两个脚本在发布审计的两份白名单里，且 .gitignore 放行', () => {
  // `assets/*` 在发布审计里是**默认拦截**，只靠白名单放行；两份白名单（ps1 与
  // audit-lite.mjs）必须同步，否则 CI 的 audit 检查会因为 "Blocked copyrighted/private
  // resources" 直接红掉（v3.5.0 就踩过一次：.gitignore 加了、白名单没加）。
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  const gitignoreLines = gitignore.split(/\r?\n/).map((line) => line.trim());
  const auditPs1 = fs.readFileSync(path.join(root, 'tools', 'audit-public-release.ps1'), 'utf8');
  const auditLite = fs.readFileSync(path.join(root, 'tools', 'guide-capture', 'audit-lite.mjs'), 'utf8');
  ['assets/jsave-import.js', 'assets/jsave-tables.js'].forEach((file) => {
    assert.ok(gitignoreLines.includes(`!/${file}`), `.gitignore 必须放行 ${file}`);
    assert.ok(auditPs1.includes(`'${file}'`), `发布审计白名单（ps1）必须放行 ${file}`);
    assert.ok(auditLite.includes(`'${file}'`), `发布审计白名单（audit-lite）必须放行 ${file}`);
  });
});
