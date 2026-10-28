/* Actual eight-page DOM acceptance for the APK-only reversible portrait composition.
 * Business traffic is replaced with an in-memory fixture before source clients run.
 * A new Chrome profile prevents access to any existing browser storage.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..'), base = process.env.ATO_APP_URL || 'http://127.0.0.1:8793/';
const pages = {dashboard:'index.html',record:'record/index.html',hero:'hero/index.html',aibp:'aibp/index.html',technology:'technology/index.html',map:'map/index.html',story:'story/index.html',briefing:'briefing/index.html'};
const conditions = {dashboard:`document.querySelectorAll('#flowList>.flow-step').length===7&&!document.querySelector('#appShell').hidden`,record:`document.querySelector('#cycleSelect').options.length>=5`,hero:`document.querySelectorAll('.hero-column').length>=4`,aibp:`document.querySelector('#title').textContent.trim().length>0`,technology:`document.querySelectorAll('#tabs button').length>=8`,map:`document.querySelector('#tileGrid').children.length>0`,story:`document.querySelector('#bookSelect').options.length>0`,briefing:`!document.querySelector('#briefingBody').hidden`};
const pause=ms=>new Promise(r=>setTimeout(r,ms)), pending=new Map();let socket,browser,sequence=0,current='';
const report={success:false,pages:[],checks:[],blockedRequests:[],exceptions:[]};
function send(method,params={}) {return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expression,timeout=30000){const end=Date.now()+timeout;let error;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(e){error=e;}await pause(100);}throw Error(current+' timeout '+expression+(error?' '+error.message:''));}
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
async function metrics(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});}
async function environment(width,height,enabled=true){await evaluate(`testEnvironment=${JSON.stringify({apk:enabled,portrait:height>width,width,height})};window.dispatchEvent(new Event('ato-android-layout-change'))`);await pause(130);}
const fixture=['source-hash.js','source-backups.js','source-store.js'].map(f=>fs.readFileSync(path.join(root,'tools/mobile-preview',f),'utf8')).join('\n');
const bootstrap = `(()=>{
const memory=()=>{const map=new Map();return {getItem:k=>map.get(String(k))??null,setItem:(k,v)=>map.set(String(k),String(v)),removeItem:k=>map.delete(String(k)),clear:()=>map.clear(),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};};
Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});
window.testEnvironment={apk:false,portrait:false,width:844,height:342};window.ATOAndroid={mobileLayoutEnvironment:()=>JSON.stringify(testEnvironment)};
window.ATO_ANDROID_SINGLE_WINDOW=true;
${fixture}
const originalFetch=window.fetch.bind(window);window.__testRequests=[];
window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href),method=(init.method||input?.method||'GET').toUpperCase();
if(url.pathname.endsWith('.php')||url.hostname==='api.github.com'){
let body={};if(typeof init.body==='string')try{body=JSON.parse(init.body);}catch{}else if(input instanceof Request&&method!=='GET')try{body=await input.clone().json();}catch{}
window.__testRequests.push({url:url.href,method});
if(url.pathname.endsWith('/aibp-image-index.php')&&method==='GET')return originalFetch(url,{credentials:'omit'});
if(url.pathname.endsWith('/map-tile-tags.php')){const text=await(await originalFetch(new URL('/map/map-tile-tags.js',location.href))).text(),match=text.match(/window\\.ATO_MAP_TILE_TAGS\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;?\\s*$/);const data=JSON.parse(match[1]);return Response.json({ok:true,data,revision:data.revision||0});}
const response=await ATO_PREVIEW_STORE.handle(url,method,body);if(response)return new Response(response.body,{status:response.status,headers:response.headers});throw Error('Unadapted business endpoint '+url.pathname);
}
return originalFetch(input,init);
};navigator.sendBeacon=()=>false;
})();`;
(async()=>{
 const profile=path.join(root,'tmp','apk-pages-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 browser=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',windowsHide:true});
 const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await pause(100);assert.ok(fs.existsSync(active),'Chrome must start');
 const port=fs.readFileSync(active,'utf8').split(/\r?\n/)[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')report.exceptions.push({page:current,error:m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text});else if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true,promptText:m.params.defaultPrompt||'0002'});else if(m.method==='Fetch.requestPaused'){
 const {requestId,request}=m.params,url=new URL(request.url);
 if(url.pathname.endsWith('/aibp-image-index.php')&&request.method==='GET')void send('Fetch.continueRequest',{requestId});
 else{report.blockedRequests.push({page:current,url:request.url,method:request.method});void send('Fetch.fulfillRequest',{requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{"ok":false,"error":"Business network blocked by test"}').toString('base64')});}
 }});
 await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*.php*'},{urlPattern:'https://api.github.com/*'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap});
 await send('Network.setUserAgentOverride',{userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
 for(const [page,file]of Object.entries(pages)){
  current=page;await metrics(390,796);await send('Page.navigate',{url:new URL(file,base).href});await until(`!!window.ATO_MOBILE_LAYOUT&&document.readyState==='complete'&&(${conditions[page]})`);await pause(350);
  await check(page+' browser leaves original composition intact',async()=>assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'),false));
  const source=fs.readFileSync(path.join(root,file),'utf8').replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi,'$1$2');
  const ids=[...source.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)].filter(m=>['button','input','select','textarea','dialog','form'].includes(m[1].toLowerCase())).map(m=>m[2]);
  await evaluate(`window.originalControls=${JSON.stringify(ids)}.map(id=>document.getElementById(id)).filter(Boolean);window.originalParents=originalControls.map(e=>[e,e.parentNode]);window.originalIcons=[...document.querySelectorAll('img[src]')].map(e=>[e,e.getAttribute('src')]);window.rotationDraft=originalControls.find(e=>e.matches('input[type=text],input[type=search],input:not([type]),textarea'));if(rotationDraft)rotationDraft.value='portrait rotation draft';`);
  for(const [width,fullHeight]of [[360,780],[390,844],[430,932],[844,390]]){
   const height=fullHeight-48;await metrics(width,height);await environment(width,height);
   const expected=height>width;
   assert.equal(await evaluate('ATO_MOBILE_LAYOUT.active'),expected,page+' correct gate');
   const missing=await evaluate(`${JSON.stringify(ids)}.filter(id=>!document.getElementById(id))`);assert.deepEqual(missing,[],page+' missing original controls');
   assert.equal(await evaluate(`originalIcons.filter(([e])=>e.isConnected).every(([e,src])=>e.getAttribute('src')===src)`),true,page+' icon changed');
   if(expected){
    const dims=await evaluate(`(()=>{const h=document.querySelector('.mobile-dashboard-header,.source-record-hero-header,.source-play-header,.page-heading,.briefing-head');return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,headerHeight:h?.getBoundingClientRect().height};})()`);
    assert.ok(dims.scrollWidth<=width+1,page+' page overflow '+JSON.stringify(dims));assert.ok(dims.headerHeight<=96,page+' header too tall '+JSON.stringify(dims));
    const before=await evaluate('history.length');await evaluate(`document.querySelector('.source-tools-trigger').click()`);await pause(100);
    const sheet=await evaluate(`(()=>{const e=document.querySelector('.source-tools[open]'),b=e?.getBoundingClientRect(),body=e?.querySelector('.source-sheet-body');return {height:b?.height,width:b?.width,scrollWidth:body?.scrollWidth,clientWidth:body?.clientWidth};})()`);
    assert.ok(sheet.height<=height*.85+1,page+' tool height '+JSON.stringify(sheet));assert.ok(sheet.scrollWidth<=sheet.clientWidth+1,page+' tool overflow '+JSON.stringify(sheet));
    assert.equal(await evaluate('ATO_MOBILE_LAYOUT.back()'),true,page+' Back');await until(`!document.querySelector('.source-tools').open`);assert.equal(await evaluate('history.length'),before,page+' changed history');
    await environment(844,342);
    const wrong=await evaluate(`originalParents.filter(([e,p])=>e.isConnected&&p.isConnected&&e.parentNode!==p).map(([e,p])=>({id:e.id,parent:e.parentNode.id||e.parentNode.className,expected:p.id||p.className}))`);
    assert.deepEqual(wrong,[],page+' source parents not restored');
    assert.equal(await evaluate(`!rotationDraft||!rotationDraft.isConnected||rotationDraft.value==='portrait rotation draft'`),true,page+' lost draft');
    assert.equal(await evaluate(`document.querySelectorAll('.source-tools,.mobile-dashboard-header,.source-play-header,.source-rh-title-line').length`),0,page+' leftover generated layout');
    await environment(width,height);
    report.pages.push({page,width,fullHeight,sourceControls:ids.length,...dims,sheet});
   }else report.pages.push({page,width,fullHeight,sourceControls:ids.length,originalLandscape:true});
   console.log('PASS '+page+' '+width+'x'+fullHeight);
  }
  if(page==='technology')await check('technology dynamic redraw restores only the current render',async()=>{
   await metrics(390,796);await environment(390,796);await evaluate(`if(rotationDraft)rotationDraft.value='';document.querySelector('#tabs [data-page="arsenal"]').click()`);await until(`!!document.querySelector('#arsenalAddGear:not(:disabled)')`);await pause(150);
   assert.equal(await evaluate(`!!document.querySelector('#mainView .source-gear-controls')`),true);
   await evaluate(`document.querySelector('.source-gear-controls').open=true;document.querySelector('#arsenalAddQuantity').value='2';document.querySelector('.arsenal-add').requestSubmit()`);await until(`document.querySelector('.arsenal-summary').textContent.includes('2 件')`);
   await environment(844,342);assert.equal(await evaluate(`document.querySelectorAll('.source-gear-controls').length`),0);assert.equal(await evaluate(`document.querySelectorAll('.gear-resource-sidebar').length`),0);assert.equal(await evaluate(`!!document.querySelector('#mainView .gear-filter-bar')`),true);
   await environment(390,796);await evaluate(`document.querySelector('#tabs button')?.click()`);await pause(150);await environment(844,342);assert.ok(await evaluate(`document.querySelectorAll('.tech-progress').length<=1`));
  });
 }
 await check('no business request escaped fixture isolation',async()=>assert.deepEqual(report.blockedRequests,[]));
 assert.deepEqual(report.exceptions,[],'uncaught source/layout errors');report.success=true;
})().catch(error=>{report.error=error.stack||String(error);console.error(error);process.exitCode=1;}).finally(async()=>{
 fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output/apk-mobile-pages-verification.json'),JSON.stringify(report,null,2));
 if(socket){try{await send('Browser.close');}catch{}socket.close();}browser?.kill();
});
