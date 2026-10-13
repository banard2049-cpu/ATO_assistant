/* Real Chrome regression for boss-card overlays. No browser package or PHP needed.
 * Run: node tools/test-aibp-panel-overlays.cjs
 * Focused probe: node tools/test-aibp-panel-overlays.cjs --second-screen --smoke
 * Optional: CHROME_PATH=/path/to/chrome. Node 22+ supplies fetch and WebSocket.
 * A loopback static server supplies canned API responses; screenshots and the
 * report are written only to tmp/panel-overlays. No campaign files are read.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'panel-overlays');
const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(file => fs.existsSync(file));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const SMOKE = process.argv.includes('--smoke');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const DEVICES = [
  { name: 'desktop', width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false, resize: [1440, 900] },
  { name: 'small-desktop', width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, resize: [1024, 768] },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, mobile: true, resize: [844, 390] },
  { name: 'tablet', width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, resize: [1024, 768] },
].filter((_device, index) => !SMOKE || index === 0);
// Independent coordinates measured from the printed card art. Do not derive
// expectations from AibpPanelOverlay.resolveState or the runtime track config.
const CARDS = [
  { apostle: 'LABYRINTHAUROS', variants: {
    original: { size: [2405, 1649], width: 5.6, cells: [[92.4, 6.1], [96.2, 10.9], [92.6, 16.3], [88.1, 10.9]] },
    official: { size: [2384, 1632], width: 5.6, cells: [[89.7, 7.2], [94.8, 14.0], [89.8, 20.8], [84.4, 13.5]] },
  } },
  { apostle: 'ALPHA_TEMENOS', variants: {
    original: { size: [6411, 4397], width: 5.0, cells: [[85.8, 80.9], [90.7, 86.9], [86.0, 94.2], [80.3, 87.5]] },
    official: { size: [2372, 1628], width: 5.7, cells: [[86.1, 80.9], [91.2, 87.6], [86.3, 94.4], [80.8, 87.6]] },
  } },
].filter((_card, index) => !SMOKE || index === 0);

async function startServer() {
  let snapshot = null;
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname.endsWith('.php')) {
      const payload = pathname.endsWith('/campaign-state.php') && snapshot
        ? snapshot : { ok: false, error: 'Isolated browser regression server' };
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      return;
    }
    const relative = pathname.replace(/^\/+/, '');
    let file = path.resolve(ROOT, relative);
    const inside = path.relative(ROOT, file);
    if (inside.startsWith('..') || path.isAbsolute(inside)
      || /^(?:data|\.git|export)(?:[\\/]|$)/i.test(inside)) {
      response.writeHead(403).end(); return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, setSnapshot(value) { snapshot = value; } };
}

async function connectChrome(profile) {
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  child.on('error', error => { child.startError = error; });
  let target;
  for (let attempt = 0; attempt < 100 && !target; attempt++) {
    if (child.startError) throw child.startError;
    if (child.exitCode !== null) throw new Error(`Chrome exited with ${child.exitCode}`);
    try {
      const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0];
      const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      target = tabs.find(tab => tab.type === 'page' && tab.webSocketDebuggerUrl);
    } catch { /* Chrome has not published its debugger yet. */ }
    if (!target) await delay(100);
  }
  assert.ok(target, 'Chrome debugger unavailable');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id); clearTimeout(job.timer);
    if (message.error) job.reject(new Error(JSON.stringify(message.error)));
    else job.resolve(message.result);
  };
  const send = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return { child, socket, send, evaluate };
}

async function waitFor(browser, expression, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await browser.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function settle(browser, imageSelector) {
  await waitFor(browser, `(() => { const img = document.querySelector(${JSON.stringify(imageSelector)});
    return img && img.complete && img.naturalWidth > 0; })()`, imageSelector);
  await browser.evaluate(`(async () => { await document.querySelector(${JSON.stringify(imageSelector)}).decode();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
}

async function loadConsoleArt(browser, source) {
  await browser.evaluate(`(() => { const img = document.querySelector('#panelWrap img.panel-image');
    img._cardImageCleanup?.(); img._cardImageRequest = null;
    img.src = ${JSON.stringify(source)}; })()`);
  await settle(browser, '#panelWrap img.panel-image');
}

async function boxQuad(browser, selector) {
  const { root } = await browser.send('DOM.getDocument');
  const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `Missing ${selector}`);
  const { model } = await browser.send('DOM.getBoxModel', { nodeId });
  return model.border;
}

async function measure(browser, imageSelector, ringSelector) {
  const hostSelector = imageSelector === '#bossPanel' ? '.boss-panel' : '#panelWrap .panel-frame';
  const metrics = await browser.evaluate(`(() => {
    const img = document.querySelector(${JSON.stringify(imageSelector)});
    const ring = document.querySelector(${JSON.stringify(ringSelector)});
    const style = getComputedStyle(ring), imageStyle = getComputedStyle(img);
    const hostStyle = getComputedStyle(document.querySelector(${JSON.stringify(hostSelector)}));
    return { natural: [img.naturalWidth, img.naturalHeight], width: parseFloat(imageStyle.width),
      height: parseFloat(imageStyle.height), border: parseFloat(style.borderTopWidth),
      unit: parseFloat(style.getPropertyValue('--panel-overlay-unit')), visible: style.display !== 'none',
      hostWidth: parseFloat(hostStyle.width), hostHeight: parseFloat(hostStyle.height) };
  })()`);
  const image = await boxQuad(browser, imageSelector);
  const ring = await boxQuad(browser, ringSelector);
  const host = await boxQuad(browser, hostSelector);
  // Quads retain the element's edge directions under rotation and scaling.
  // This measures the painted object-fit content, rather than its outer slot.
  const scale = Math.min(metrics.width / metrics.natural[0], metrics.height / metrics.natural[1]);
  const drawnWidth = metrics.natural[0] * scale;
  const drawnHeight = metrics.natural[1] * scale;
  const offsetX = (metrics.width - drawnWidth) / 2;
  const offsetY = (metrics.height - drawnHeight) / 2;
  const vx = [(image[2] - image[0]) / metrics.width, (image[3] - image[1]) / metrics.width];
  const vy = [(image[6] - image[0]) / metrics.height, (image[7] - image[1]) / metrics.height];
  const origin = [image[0] + vx[0] * offsetX + vy[0] * offsetY,
    image[1] + vx[1] * offsetX + vy[1] * offsetY];
  const center = [(ring[0] + ring[2] + ring[4] + ring[6]) / 4,
    (ring[1] + ring[3] + ring[5] + ring[7]) / 4];
  const dx = center[0] - origin[0], dy = center[1] - origin[1];
  const determinant = vx[0] * vy[1] - vx[1] * vy[0];
  const hx = [(host[2] - host[0]) / metrics.hostWidth, (host[3] - host[1]) / metrics.hostWidth];
  const hy = [(host[6] - host[0]) / metrics.hostHeight, (host[7] - host[1]) / metrics.hostHeight];
  const hd = hx[0] * hy[1] - hx[1] * hy[0];
  const hostPoints = [[0, 0], [drawnWidth, 0], [drawnWidth, drawnHeight], [0, drawnHeight]].map(([x, y]) => {
    const px = origin[0] + vx[0] * x + vy[0] * y - host[0];
    const py = origin[1] + vx[1] * x + vy[1] * y - host[1];
    return [(px * hy[1] - py * hy[0]) / hd, (py * hx[0] - px * hx[1]) / hd];
  });
  return { ...metrics, drawnWidth, drawnHeight,
    paintedBounds: { left: Math.min(...hostPoints.map(point => point[0])),
      top: Math.min(...hostPoints.map(point => point[1])),
      right: Math.max(...hostPoints.map(point => point[0])),
      bottom: Math.max(...hostPoints.map(point => point[1])) },
    left: ((dx * vy[1] - dy * vy[0]) / determinant) / drawnWidth * 100,
    top: ((dy * vx[0] - dx * vx[1]) / determinant) / drawnHeight * 100,
    ringWidth: Math.hypot(ring[2] - ring[0], ring[3] - ring[1]) / Math.hypot(...vx),
    ringHeight: Math.hypot(ring[6] - ring[0], ring[7] - ring[1]) / Math.hypot(...vy),
  };
}

function verify(probe, expected, index, device, label) {
  const near = (actual, wanted, tolerance, subject) => assert.ok(Math.abs(actual - wanted) <= tolerance,
    `${label}: ${subject} ${actual.toFixed(4)}; expected ${wanted.toFixed(4)} ± ${tolerance}`);
  assert.ok(probe.visible, `${label}: ring hidden`);
  const painted = probe.paintedBounds;
  assert.ok(painted.left >= -0.6 && painted.top >= -0.6
    && painted.right <= probe.hostWidth + 0.6 && painted.bottom <= probe.hostHeight + 0.6,
  `${label}: painted card ${JSON.stringify(painted)} exceeds host ${probe.hostWidth} x ${probe.hostHeight}`);
  assert.deepEqual(probe.natural, expected.size, `${label}: wrong art loaded`);
  // Layout boxes and CSS percentage calculations round at subpixel boundaries.
  // Allow at most 0.6 CSS px, rather than a viewport-dependent percent margin.
  near(probe.left, expected.cells[index][0], 60 / probe.drawnWidth, 'center X %');
  near(probe.top, expected.cells[index][1], 60 / probe.drawnHeight, 'center Y %');
  near(probe.ringWidth / probe.drawnWidth * 100, expected.width, 60 / probe.drawnWidth, 'diameter %');
  near(probe.ringWidth, probe.ringHeight, 0.1, 'circular diameter');
  near(probe.unit * 1000, probe.drawnWidth, 1, 'overlay scale CSS px');
  // Headless Chrome may snap computed borders to whole CSS pixels even when
  // Emulation reports DPR 2 or 3. The inherited unit independently checks scale.
  near(probe.border, probe.drawnWidth / 1000 * 3, 1.05, 'border CSS px');
}

async function viewport(browser, device, resized = false) {
  const [width, height] = resized ? device.resize : [device.width, device.height];
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height,
    deviceScaleFactor: device.deviceScaleFactor, mobile: device.mobile });
  await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

async function screenshot(browser, label) {
  const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${label}.png`), Buffer.from(shot.data, 'base64'));
}

async function verifySidebarRotation(browser, rotation, label, report) {
  const transform = await browser.evaluate(`(() => {
    const content = document.querySelector('.battle-sidebar-content');
    const view = document.querySelector('#battleView');
    const matrix = new DOMMatrix(getComputedStyle(content).transform);
    return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d,
      scale: parseFloat(getComputedStyle(view).getPropertyValue('--sidebar-fit-scale')) || 1,
      boardHidden: view.classList.contains('board-hidden') };
  })()`);
  const radians = -rotation * Math.PI / 180;
  const expected = { a: Math.cos(radians), b: Math.sin(radians),
    c: -Math.sin(radians), d: Math.cos(radians) };
  assert.ok(transform.scale > 0, `${label}: sidebar scale must be positive`);
  for (const key of ['a', 'b', 'c', 'd']) {
    assert.ok(Math.abs(transform[key] / transform.scale - expected[key]) < 0.00001,
      `${label}: actual transform ${JSON.stringify(transform)} does not rotate by ${-rotation} degrees`);
  }
  if (rotation) assert.equal(transform.boardHidden, false, `${label}: rotation requires a visible board`);
  report.actualRotations[rotation] = (report.actualRotations[rotation] || 0) + 1;
}

async function forceLetterboxing(browser, rotation) {
  await browser.evaluate(`(() => {
    const style = getComputedStyle(document.querySelector('#battleView'));
    const width = Math.min(320, parseFloat(style.getPropertyValue('--boss-panel-width')));
    const height = parseFloat(style.getPropertyValue('--boss-panel-height'));
    const slot = document.querySelector('#bossPanel').parentElement;
    slot.style.setProperty('width', String(width * ${rotation ? 1 : .72}) + 'px', 'important');
    slot.style.setProperty('height', String(height * ${rotation ? .6 : 1}) + 'px', 'important');
  })()`);
}

function artSource(card, variant, secondScreen = false) {
  const file = `${card.apostle}/${card.apostle}.jpg`;
  if (variant === 'official') return secondScreen ? `../official-assets/ps/${file}` : `/official-assets/ps/${file}`;
  return secondScreen ? `ps/${file}` : `/aibp/ps/${file}`;
}

async function testConsole(browser, server, report) {
  server.setSnapshot(null);
  const setup = await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
  for (const device of DEVICES) {
    for (const card of CARDS) {
      await viewport(browser, device);
      await browser.send('Page.navigate', { url: `${server.origin}/aibp/index.html?apostle=${card.apostle}` });
      await waitFor(browser, 'Boolean(document.querySelector("#panelWrap .panel-state-marker.show"))', 'console ring');
      for (const [variant, expected] of Object.entries(card.variants)) {
        if (!fs.existsSync(path.join(ROOT, artSource(card, variant).slice(1)))) {
          report.skipped.push(`${card.apostle}/${variant}: optional card art unavailable`); continue;
        }
        await loadConsoleArt(browser, server.origin + artSource(card, variant));
        for (const resized of [false, true]) {
          await viewport(browser, device, resized);
          await settle(browser, '#panelWrap img.panel-image');
          for (let index = 0; index < 4; index++) {
            const label = `console-${device.name}-${card.apostle}-${variant}-${resized ? 'resized' : 'initial'}-${index}`;
            verify(await measure(browser, '#panelWrap img.panel-image', '#panelWrap .panel-state-marker'), expected, index, device, label);
            report.checks++;
            if (index === 0) await screenshot(browser, label);
            await browser.evaluate('document.querySelector("#panelWrap .panel-state-marker").click()');
            await settle(browser, '#panelWrap img.panel-image');
            const stored = await browser.evaluate(`localStorage.getItem('aibp-labyrinth-track-v1-${card.apostle}')`);
            assert.equal(stored, String((index + 1) % 4), `${label}: clockwise storage index`);
          }
        }
      }
      // Keep a selected space while the pixels change from the quick preview
      // to the original. This also checks the profile refresh after official art.
      const original = artSource(card, 'original');
      if (fs.existsSync(path.join(ROOT, `${original.slice(1)}.preview.jpg`))) {
        await browser.evaluate('document.querySelector("#panelWrap .panel-state-marker").click(); document.querySelector("#panelWrap .panel-state-marker").click();');
        await loadConsoleArt(browser, `${server.origin}${original}.preview.jpg`);
        const expectedPreview = { ...card.variants.original, size: [1600, 1097] };
        const label = `console-${device.name}-${card.apostle}-preview-upgrade`;
        verify(await measure(browser, '#panelWrap img.panel-image', '#panelWrap .panel-state-marker'), expectedPreview, 2, device, `${label}-preview`);
        await loadConsoleArt(browser, server.origin + original);
        verify(await measure(browser, '#panelWrap img.panel-image', '#panelWrap .panel-state-marker'), card.variants.original, 2, device, `${label}-original`);
        assert.equal(await browser.evaluate(`localStorage.getItem('aibp-labyrinth-track-v1-${card.apostle}')`), '2', `${label}: selected space survives image upgrade`);
        report.checks += 2;
      }
    }
  }
  await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.identifier });
}

async function testSecondScreen(browser, server, report) {
  for (const device of DEVICES) {
    for (const card of CARDS) {
      for (const [variant, expected] of Object.entries(card.variants)) {
        if (!fs.existsSync(path.join(ROOT, artSource(card, variant).slice(1)))) continue;
        const legacy = card.variants.original;
        const payload = { ok: true, screen: { displayMode: 'aibp', aibpRevision: 1,
          battleBoardVisible: true, battleRotation: 0, displayScales: { battleBoard: 100 },
          aibp: { version: 1, apostle: card.apostle, level: 'I', panelSrc: artSource(card, variant, true),
            routineSrc: '', signatureSrc: '', tokens: [], traits: [], extraCards: [], damage: [],
            damageSummary: { total: 0 }, battleMap: null, los: { active: false },
            updatedAt: '2026-10-13T00:00:00.000Z',
            labyrinthTrack: { left: `${legacy.cells[0][0]}%`, top: `${legacy.cells[0][1]}%`,
              width: `${legacy.width}%`, index: 0, short: 'O', type: 'Labyrinth O' } } } };
        server.setSnapshot(payload);
        await viewport(browser, device);
        await browser.send('Page.navigate', { url: `${server.origin}/ss/index.html` });
        await waitFor(browser, 'Boolean(document.querySelector("#bossLabyrinthTrack span"))', 'second-screen ring');
        await settle(browser, '#bossPanel');
        for (const resized of [false, true]) {
          await viewport(browser, device, resized);
          for (const rotation of [0, 90, 270]) {
            payload.screen.battleRotation = rotation;
            payload.screen.aibpRevision++;
            await browser.evaluate('checkConnection()');
            // Shrink one axis within the allocated grid budget: different
            // object-fit bars without pushing the card beyond the sidebar.
            await forceLetterboxing(browser, rotation);
            await settle(browser, '#bossPanel');
            const label = `second-screen-${device.name}-${card.apostle}-${variant}-${resized ? 'resized' : 'initial'}-rotate${rotation}`;
            await verifySidebarRotation(browser, rotation, label, report);
            verify(await measure(browser, '#bossPanel', '#bossLabyrinthTrack span'), expected, 0, device, label);
            report.checks++;
            await screenshot(browser, label);
          }
        }
        // Hidden-board mode intentionally ignores a saved rotation preference.
        // Keep it as a separate case so a rotation label cannot mask that rule.
        payload.screen.battleBoardVisible = false;
        payload.screen.battleRotation = 270;
        payload.screen.aibpRevision++;
        await browser.evaluate('checkConnection()');
        await forceLetterboxing(browser, 0);
        await settle(browser, '#bossPanel');
        const label = `second-screen-${device.name}-${card.apostle}-${variant}-board-hidden`;
        await verifySidebarRotation(browser, 0, label, report);
        verify(await measure(browser, '#bossPanel', '#bossLabyrinthTrack span'), expected, 0, device, label);
        report.checks++;
      }
    }
  }
}

async function main() {
  assert.ok(CHROME, 'Chrome not found; set CHROME_PATH');
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ato-panel-overlay-'));
  const report = { checks: 0, actualRotations: {}, skipped: [] };
  let browser;
  try {
    browser = await connectChrome(profile);
    if (!process.argv.includes('--second-screen')) await testConsole(browser, server, report);
    await testSecondScreen(browser, server, report);
    console.log(`PASS ${report.checks} browser geometry checks across ${DEVICES.length} device profiles.`);
    if (report.skipped.length) console.log(`SKIP ${[...new Set(report.skipped)].join('; ')}`);
  } catch (error) {
    report.error = error.stack;
    if (browser) await screenshot(browser, 'failure').catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    if (browser?.child.exitCode === null) {
      const exited = new Promise(resolve => browser.child.once('exit', resolve));
      await browser.send('Browser.close', {}, 1000).catch(() => browser.child.kill());
      await Promise.race([exited, delay(2000)]);
      if (browser.child.exitCode === null) browser.child.kill();
    }
    browser?.socket.close();
    await new Promise(resolve => server.server.close(resolve));
    // Only remove the exact temporary Chrome profile created by this run.
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(profile));
    assert.ok(relative.startsWith('ato-panel-overlay-') && !relative.includes(path.sep), 'Unsafe profile cleanup path');
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
