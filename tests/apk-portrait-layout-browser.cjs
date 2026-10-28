/* Real DOM regression for APK gating, reversible moves and keyboard resizing. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..'), pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, sequence = 0;
const checks = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timed out')), 20000);
    pending.set(id, {resolve: value => {clearTimeout(timer); resolve(value);}, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function check(name, callback) { await callback(); checks.push(name); console.log('PASS ' + name); }
const source = fs.readFileSync(path.join(root, 'assets/mobile/layout.js'), 'utf8');
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<section id="original"><input id="draft" value="unsaved draft"><button id="action">原按钮</button></section><div style="height:2200px"></div>
<script>window.originalInput=document.getElementById('draft');window.sourceClicks=0;window.layoutClicks=0;window.mounts=0;document.getElementById('action').addEventListener('click',()=>sourceClicks++);window.ATO_ANDROID_SINGLE_WINDOW=true;</script>
<script>${source}</script><script>
ATO_MOBILE_LAYOUT.register(ATO_MOBILE_LAYOUT.page,ctx=>{mounts++;const shell=ctx.add(document.createElement('section'),document.body);shell.id='generated';ctx.move(originalInput,shell);ctx.on(document.getElementById('action'),'click',()=>layoutClicks++);window.testSheet=ctx.tools({title:'工具',triggerParent:shell,nodes:[]});});
</script></body></html>`;
(async () => {
  const profile = path.join(root, 'tmp', 'apk-layout-browser-' + Date.now());
  fs.mkdirSync(profile, {recursive: true});
  browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', 'about:blank'], {stdio: 'ignore', windowsHide: true});
  const active = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(active); i++) await pause(100);
  const port = fs.readFileSync(active, 'utf8').split(/\r?\n/)[0];
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once: true}));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), item = pending.get(message.id);
    if (!item) return; pending.delete(message.id);
    if (message.error) item.reject(Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setUserAgentOverride', {userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  const tree = await send('Page.getFrameTree');
  await send('Page.setDocumentContent', {frameId: tree.frameTree.frame.id, html: fixture}); await pause(100);
  await check('a portrait mobile browser and single-window flag cannot enable APK layout', async () => {
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'), false);
    assert.equal(await evaluate('originalInput.parentNode.id'), 'original');
  });
  await check('only native APK portrait geometry enables the layout without replacing source nodes', async () => {
    await evaluate(`window.testEnvironment={apk:true,portrait:true,width:390,height:796};window.ATOAndroid={mobileLayoutEnvironment:()=>JSON.stringify(testEnvironment)};window.dispatchEvent(new Event('ato-android-layout-change'))`);
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'), true);
    assert.equal(await evaluate(`document.querySelector('#draft')===originalInput&&originalInput.value==='unsaved draft'&&originalInput.parentNode.id==='generated'`), true);
  });
  await check('keyboard-sized viewport does not change the stable native portrait decision', async () => {
    await send('Emulation.setDeviceMetricsOverride', {width:390,height:300,deviceScaleFactor:1,mobile:true}); await pause(100);
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active&&mounts===1'), true);
    await evaluate(`originalInput.value='edited while keyboard is open'`);
  });
  await check('native Back closes tools first without adding page history', async () => {
    const before = await evaluate('history.length');
    await evaluate('testSheet.trigger.click()');
    assert.equal(await evaluate('testSheet.dialog.open&&ATO_MOBILE_LAYOUT.back()'), true); await pause(100);
    assert.equal(await evaluate('testSheet.dialog.open||ATO_MOBILE_LAYOUT.back()'), false);
    assert.equal(await evaluate('history.length'), before);
  });
  await check('landscape and square windows restore source parents, values and original handlers', async () => {
    await evaluate(`testEnvironment={apk:true,portrait:false,width:844,height:300};window.dispatchEvent(new Event('ato-android-layout-change'));document.getElementById('action').click()`);
    assert.equal(await evaluate(`!ATO_MOBILE_LAYOUT.active&&originalInput.parentNode.id==='original'&&originalInput.value==='edited while keyboard is open'&&sourceClicks===1&&layoutClicks===0&&document.querySelector('#generated')===null`), true);
    await evaluate(`testEnvironment={apk:true,portrait:true,width:390,height:390};window.dispatchEvent(new Event('ato-android-layout-change'))`);
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'), false);
  });
  await check('repeated rotations do not duplicate listeners or discard editing state', async () => {
    for (let i=0;i<3;i++) {
      await evaluate(`testEnvironment={apk:true,portrait:true,width:390,height:796};window.dispatchEvent(new Event('ato-android-layout-change'));document.getElementById('action').click();testEnvironment={apk:true,portrait:false,width:844,height:300};window.dispatchEvent(new Event('ato-android-layout-change'))`);
    }
    assert.deepEqual(await evaluate('[sourceClicks,layoutClicks]'), [4,3]);
    assert.equal(await evaluate(`document.getElementById('draft')===originalInput&&originalInput.parentNode.id==='original'`), true);
  });
  await check('print temporarily uses original composition and restores APK composition afterwards', async () => {
    await evaluate(`testEnvironment={apk:true,portrait:true,width:390,height:796};window.dispatchEvent(new Event('ato-android-layout-change'));window.dispatchEvent(new Event('beforeprint'))`);
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'), false);
    await evaluate(`window.dispatchEvent(new Event('afterprint'))`);
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'), true);
  });
  await check('event details and Android user-agent cannot substitute for the native method', async () => {
    await evaluate(`delete ATOAndroid.mobileLayoutEnvironment;window.dispatchEvent(new CustomEvent('ato-android-layout-change',{detail:{apk:true,portrait:true,width:390,height:796}}))`);
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'), false);
  });
  fs.mkdirSync(path.join(root,'output'),{recursive:true});
  fs.writeFileSync(path.join(root,'output','apk-portrait-browser-verification.json'),JSON.stringify({success:true,checks},null,2));
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {
  if (socket) {try {await send('Browser.close');} catch {} socket.close();}
  browser?.kill();
});
