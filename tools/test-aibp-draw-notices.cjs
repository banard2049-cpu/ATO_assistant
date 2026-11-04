/* Real Chrome regression for Chimera AI reminder sizing.
 * Run: node tools/test-aibp-draw-notices.cjs (Node 22+, Chrome).
 * Uses isolated local API stubs; never reads or writes campaign saves.
 * Covers screenshot-sized windows, display scaling, reopening and live resizing.
 * Screenshots and browser profiles go to tmp/draw-notices.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'draw-notices');
fs.mkdirSync(OUT, {recursive:true});
const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(file => fs.existsSync(file));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
async function startServer() {
  let snapshot = null;
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname.endsWith('/aibp-image-index.php')) {response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true,version:2,images:Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT,'aibp/card-keywords.json'))).cards),previews:{}}));return;}
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

(async () => {
 const s=await startServer();let b;const profile=fs.mkdtempSync(path.join(OUT,'profile-'));
 try {
  b=await connectChrome(profile);
  for(const [width,height,deviceScaleFactor=1] of [[2520,1794],[1680,1196,1.5],[2016,1435,1.25],[1920,1080],[1280,900],[1024,768],[1600,2000],[3840,2160]]) {
   await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor,mobile:false});
   await b.send('Page.navigate',{url:s.origin+'/aibp/index.html'});
   await waitFor(b,'window.ATO_LANGUAGE && document.querySelector("#cardKeywordsSummary .keyword-entry")','ready');
   await b.evaluate('localStorage.clear()');await b.send('Page.reload');
   await waitFor(b,'window.ATO_LANGUAGE && document.querySelector("#cardKeywordsSummary .keyword-entry")','fresh state');
   await b.evaluate(`renderApostle('CHIMERA_METASTASIOS');piles.CHIMERA_METASTASIOS.AI.deck=[{type:'AI',level:'I',index:1}];piles.CHIMERA_METASTASIOS.AI.pending=null;renderAibpCards();drawAiButton.click()`);
   for(const action of ['draw','reopen']) {
    await waitFor(b,'!document.getElementById("imageZoomKeywords").hidden && [...document.querySelectorAll("#imageZoomImg,#imageZoomNotice img")].every(n=>n.complete&&n.naturalWidth>0)','artwork');
    await waitFor(b,`(()=>{const main=imageZoomImg.getBoundingClientRect();const imgs=[...imageZoomNotice.querySelectorAll('img')];return imgs.length===2&&Math.abs(imgs[1].getBoundingClientRect().bottom-imgs[0].getBoundingClientRect().top-main.height)<1})()`,'exact half-height reminders');
    const result=await b.evaluate(`(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {card:rect(imageZoomImg),notices:[...imageZoomNotice.querySelectorAll('img')].map(rect),actions:rect(document.querySelector('.image-zoom-action-stack')),keyword:rect(document.getElementById('imageZoomKeywords'))}})()`);
    assert.equal(result.notices.length,2);
    if(width>760) {
     assert.ok(result.notices.every(r=>r.x>=result.card.right),'both notices must be to the right');
     assert.ok(result.notices.every(r=>r.x-result.card.right<30),'notices must stay beside the main card');
     assert.ok(result.notices[1].y>=result.notices[0].bottom,'notices must stack vertically');
     result.notices.forEach(r=>assert.ok(Math.abs(r.height-(result.card.height-12)/2)<1,'each notice must be exactly half the main card height after the gap'));
     assert.ok(Math.abs(result.notices[0].y-result.card.y)<1,'top edges must align');
     assert.ok(Math.abs(result.notices[1].bottom-result.card.bottom)<1,'bottom edges must align');
     if(result.actions.width) assert.ok(result.notices.every(r=>result.actions.x>=r.right),'controls must not overlap notices');
     for(const r of result.notices) assert.ok(r.bottom<=height+1 && r.y>=0 && r.right<=width,'notice stays in viewport');
    }
    console.log(JSON.stringify({width,action,...result}));
    const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,`chimera-${width}-${action}.png`),Buffer.from(shot.data,'base64'));
    if(action==='reopen' && width===2520) {
     await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
     await waitFor(b,`(()=>{const main=imageZoomImg.getBoundingClientRect();const imgs=[...imageZoomNotice.querySelectorAll('img')];return main.height<900&&Math.abs(imgs[1].getBoundingClientRect().bottom-imgs[0].getBoundingClientRect().top-main.height)<1})()`,'half-height after resizing an open modal');
     await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor,mobile:false});
     await waitFor(b,`(()=>{const main=imageZoomImg.getBoundingClientRect();const imgs=[...imageZoomNotice.querySelectorAll('img')];return main.height>1000&&Math.abs(imgs[1].getBoundingClientRect().bottom-imgs[0].getBoundingClientRect().top-main.height)<1})()`,'half-height after restoring the large viewport');
    }
    if(action==='draw') {
     await b.evaluate(`closeImageZoom();currentAiView='弃牌';renderAibpCards();const img=[...document.querySelectorAll('#aiGrid img,#aiDrawPreview img')].find(n=>(n.dataset.fullSrc||n.src).includes('CHIMERA_METASTASIOS_AI_I_001'));if(!img)throw Error('drawn AI not found');openZoomForImage(img)`);
    }
   }
   await b.evaluate(`document.querySelectorAll('#imageZoomKeywords .keyword-entry').forEach(n=>n.open=true);ATO_LANGUAGE.set('en')`);
   await delay(300);
   console.log(JSON.stringify({width,language:await b.evaluate(`({selected:ATO_LANGUAGE.get(),src:imageZoomImg.getAttribute('src'),entries:[...document.querySelectorAll('#imageZoomKeywords .keyword-entry')].map(n=>({open:n.open,lang:n.dataset.keywordLanguage}))})`)}));
  }
 } finally {if(b){await b.send('Browser.close',{},1000).catch(()=>b.child.kill());b.socket.close();}await new Promise(resolve=>s.server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
