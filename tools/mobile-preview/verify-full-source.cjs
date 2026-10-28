/* Complete-source coverage, interaction, mobile layout and isolation acceptance. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),base=process.env.ATO_PREVIEW_URL||'http://127.0.0.1:8793/tools/mobile-preview/';
const identities={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'identity.js'),'utf8'),{window:identities});
const defs=identities.MobilePreviewIdentity,pages=Object.keys(defs),pause=ms=>new Promise(r=>setTimeout(r,ms));
const pending=new Map(),contexts=new Map(),requests=[],exceptions=[],consoleErrors=[];let ws,browser,id=0,current='dashboard';
const report={base,pages:[],checks:[],coverage:{},dialogs:[],errors:[]};
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id,t=setTimeout(()=>{pending.delete(key);reject(Error('Timed out '+method));},25000);pending.set(key,{resolve:x=>{clearTimeout(t);resolve(x);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:key,method,params}));});}
function allFrames(tree){return [tree.frame,...(tree.childFrames||[]).flatMap(allFrames)];}
async function evaluate(expression,page=current){const params={expression,returnByValue:true,awaitPromise:true};if(page){const tree=await send('Page.getFrameTree'),frame=allFrames(tree.frameTree).find(f=>f.name==='ato-source-'+page||f.name==='ato-module-'+page)||allFrames(tree.frameTree).find(f=>{try{return new URL(f.url).pathname===new URL(defs[page].source,new URL('../../',base)).pathname;}catch{return false;}});const ctx=[...contexts.values()].find(c=>c.auxData?.isDefault&&c.auxData.frameId===frame?.id);if(!ctx)throw Error('Source context not ready '+page);params.contextId=ctx.id;}const result=await send('Runtime.evaluate',params);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function until(expression,page=current,timeout=25000){const end=Date.now()+timeout;let error;while(Date.now()<end){try{if(await evaluate(expression,page))return;}catch(e){error=e;}await pause(100);}throw Error('Timeout '+expression+(error?' '+error.message:''));}
async function click(selector,page=current){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.click();})()`,page);await pause(140);}
async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(__dirname,'screenshots',name+'.png'),Buffer.from(result.data,'base64'));}
async function choose(page){current=page;await evaluate(`ATO_PREVIEW_HOST.navigate(${JSON.stringify(page)})`,null);await until(`window.ATO_PREVIEW_PAGE===${JSON.stringify(page)}&&document.readyState==='complete'`);await pause(page==='story'?700:250);}
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
const conditions={dashboard:`document.querySelectorAll('#flowList>.flow-step').length===7&&!document.querySelector('#appShell').hidden`,record:`document.querySelector('#cycleSelect').options.length>=5`,hero:`document.querySelectorAll('.hero-column').length>=4`,aibp:`document.querySelector('#title').textContent.trim().length>0`,technology:`document.querySelectorAll('#tabs button').length>=8`,map:`document.querySelector('#tileGrid').children.length>0`,story:`document.querySelector('#bookSelect').options.length>0`,briefing:`!document.querySelector('#briefingBody').hidden`};
(async()=>{
 await check('LAN HTTP hash fallback matches native SHA-256',async()=>{const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'source-hash.js'),'utf8'),context);for(const size of [0,3,63,64,65,1000,65537]){const bytes=require('node:crypto').randomBytes(size);assert.equal(await context.window.ATO_PREVIEW_SHA256(bytes),require('node:crypto').createHash('sha256').update(bytes).digest('hex'));}});
 const profile=path.join(root,'tmp','full-source-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(path.join(__dirname,'screenshots'),{recursive:true});
 browser=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-site-isolation-trials','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--hide-scrollbars','about:blank'],{stdio:'ignore',windowsHide:true});
 const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await pause(100);assert.ok(fs.existsSync(active));const port=fs.readFileSync(active,'utf8').split(/\r?\n/)[0],targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.executionContextCreated')contexts.set(m.params.context.id,m.params.context);else if(m.method==='Runtime.executionContextDestroyed')contexts.delete(m.params.executionContextId);else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))consoleErrors.push(m.params.args.map(a=>a.description||a.value).join(' '));else if(m.method==='Page.javascriptDialogOpening'){report.dialogs.push({type:m.params.type,message:m.params.message});void send('Page.handleJavaScriptDialog',{accept:true,promptText:m.params.message.includes('段落号')?'0002':m.params.defaultPrompt||'预览书签'}).catch(()=>{});}else if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:base+'screen.html?page=dashboard'});await until('!!window.ATO_PREVIEW_HOST',null);
 const sizes=process.env.ATO_PREVIEW_QUICK?[[390,844]]:[[360,780],[390,844],[430,932],[844,390]];
 if(!process.env.ATO_PREVIEW_ENTRY_ONLY){
 for(const [width,height]of sizes){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  for(const page of pages){
   await choose(page);await until(conditions[page]);
   const raw=fs.readFileSync(path.join(root,defs[page].source),'utf8'),staticHtml=raw.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi,'$1$2');
   const ids=[...staticHtml.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)].filter(m=>['button','input','select','textarea','dialog','form'].includes(m[1].toLowerCase())).map(m=>m[2]);
   const missing=await evaluate(`${JSON.stringify(ids)}.filter(id=>!document.getElementById(id))`);assert.deepEqual(missing,[],page+' missing original controls');
   const scriptSources=[...staticHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>new URL(m[1],new URL(defs[page].source,new URL('../../',base))).href);
   const absentScripts=await evaluate(`${JSON.stringify(scriptSources)}.filter(src=>![...document.scripts].some(s=>s.src===src))`);assert.deepEqual(absentScripts,[],page+' must retain all original scripts');
   report.coverage[page]={controls:ids.length,originalScripts:scriptSources.length};
   const dims=await evaluate(`(()=>{const header=document.querySelector('.preview-dashboard-header,.source-play-header,.source-record-hero-header,.page-heading,.briefing-head'),sheet=document.querySelector('.source-tools-trigger,#dashboardToolsTrigger');return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,header:header?.getBoundingClientRect().height,hasTools:!!sheet,title:document.title,bodyText:document.body.innerText.slice(0,60)};})()`);
   assert.ok(dims.scrollWidth<=width+1,page+' overflow '+JSON.stringify(dims));assert.ok(dims.header<=96,page+' header '+JSON.stringify(dims));assert.ok(dims.hasTools,page+' tools');
   await evaluate('scrollTo(0,0)');if(width===390)await screenshot(page+'-default');await click('.source-tools-trigger,#dashboardToolsTrigger');
   const sheet=await evaluate(`(()=>{const e=document.querySelector('.source-tools[open],#dashboardTools[open]'),b=e?.getBoundingClientRect(),body=e?.querySelector('.source-sheet-body,.preview-sheet-body');return {height:b?.height,scroll:body?.scrollWidth,client:body?.clientWidth};})()`);assert.ok(sheet.height<=height*.85+1,page+' sheet height');assert.ok(sheet.scroll<=sheet.client+1,page+' sheet overflow '+JSON.stringify(sheet));if(width===390)await screenshot(page+'-tools');await evaluate('history.back()');await pause(130);
   report.pages.push({page,width,height,...dims,sheet});console.log('PASS '+page+' '+width+'×'+height+' · '+ids.length+' source controls');
  }
 }
 await check('all pages run original modules with sandboxed storage and no real business requests',async()=>{assert.equal(requests.filter(r=>r.method!=='GET'&&r.method!=='HEAD').length,0);assert.equal(requests.filter(r=>/\/(api\/[^?]+|briefing\/(api|backups))\.php/.test(r.url)&&!r.url.includes('/api/aibp-image-index.php')).length,0);assert.equal(requests.filter(r=>/pages-(dashboard|play|record-hero|technology-briefing)\.js/.test(r.url)).length,0);for(const page of pages)assert.ok(await evaluate(`(()=>{if(localStorage===parent.localStorage||sessionStorage===parent.sessionStorage||indexedDB===parent.indexedDB)return false;const key='ato-preview-isolation-'+Date.now()+'-'+Math.random();localStorage.setItem(key,'memory-only');const isolated=parent.localStorage.getItem(key)===null;localStorage.removeItem(key);return isolated;})()`,page));});
 await check('dashboard keeps all seven steps, exploration draw and original story-card detail',async()=>{
   await choose('dashboard');await until(conditions.dashboard);await until(`document.querySelector('.exploration-buttons button:not(:disabled)')!==null`);await click('.exploration-buttons button:first-child');await until(`document.querySelectorAll('.exploration-active-grid .exploration-drawn-card').length>0`);
   await click('[data-card-track-open="story"]');await until(`document.querySelector('#cardTrackDialog').open`);assert.ok(await evaluate(`document.querySelector('#cardTrackBody').children.length>0`));await click('#cardTrackClose');
 });
 await check('source navigation preserves module URLs and query parameters',async()=>{await choose('dashboard');await evaluate(`document.querySelector('a[href*="hero/index.html"]').click()`);await until(`document.body.dataset.page==='hero'`,null);await until(`location.pathname.endsWith('/hero/index.html')`,'hero');await until(`document.querySelector('.back-to-console')!==null`,'hero');await evaluate(`document.querySelector('.back-to-console').click()`,'hero');await until(`document.body.dataset.page==='dashboard'`,null);});
 await check('record resource changes save and append the original campaign log',async()=>{
   await choose('record');await until(conditions.record);
   const before=await evaluate(`ATO_PREVIEW_STORE.campaign.sections.record.users.default.resources['c1-trireme']`,null);
   await evaluate(`(()=>{const card=[...document.querySelectorAll('#resourceGrid .resource-card')].find(c=>c.querySelector('.resource-name')?.textContent.startsWith('船材'));if(!card)throw Error('Missing original resource card');card.querySelector('.number-field>button:nth-of-type(3)').click();})()`);
   await until(`ATO_PREVIEW_STORE.campaign.sections.record.users.default.resources['c1-trireme']===${before+1}`,null);
   await until(`ATO_PREVIEW_STORE.campaign.sections.dashboard.profiles.default.cycles.c1.state.notes.includes('记录表')`,null);
 });
 await check('record section location closes tools and reveals the original section',async()=>{
   await choose('record');await click('.source-tools-trigger');assert.ok(await evaluate(`document.querySelectorAll('[data-record-section]').length>5`));await click('[data-record-section="3"]');await until(`!document.querySelector('.source-tools').open`);await pause(150);assert.ok(await evaluate(`(()=>{const h=[...document.querySelectorAll('main.app .panel-heading h2')][3];const r=h.getBoundingClientRect();return r.top>=0&&r.top<innerHeight;})()`));
 });
 await check('hero skill and memory use original controls and persist',async()=>{
   await choose('hero');await until(conditions.hero);await click('[data-toggle-skills="preview-odys"]');
   const before=await evaluate(`ATO_PREVIEW_STORE.campaign.sections.heroes.heroes.find(h=>h.id==='preview-odys').baseSkills?.courage||0`,null);
   await click('[data-skill-adj="courage"][data-hero="preview-odys"][data-delta="1"]');
   await until(`ATO_PREVIEW_STORE.campaign.sections.heroes.heroes.find(h=>h.id==='preview-odys').baseSkills.courage===${before+1}`,null);
   await click('[data-open-mnemos="preview-odys"]');await evaluate(`document.querySelector('#pickerOverlay details').open=true`);await pause(100);await click('#pickerOverlay .mnemos-toggle');
   await until(`ATO_PREVIEW_STORE.campaign.sections.heroes.heroes.find(h=>h.id==='preview-odys').mnemos.c1.length>0`,null);
   await click('#pickerOverlay .picker-head button');
 });
 await check('AI and BP draw plus settlement retain original interaction',async()=>{
   await choose('aibp');await until(conditions.aibp);await click('#drawAiButton');await until(`document.querySelector('#aiDrawPreview').classList.contains('has-card')`);await click('#imageZoomClose');await until(`document.querySelector('#confirmAiButton').disabled`);
   await click('#drawBpButton');await until(`document.querySelector('#bpDrawPreview').classList.contains('has-card')`);await click('[data-bp-zoom-action="defeat"]');await until(`document.querySelector('#defeatBpButton').disabled`);await until(`!document.querySelector('#imageZoomOverlay').classList.contains('show')`);
 });
 await check('original Token dialog stays visible above tools and saves',async()=>{
   await choose('aibp');await click('.source-tools-trigger');await click('#tokenButton');await until(`document.querySelector('#tokenDialog').open`);assert.ok(await evaluate(`!document.querySelector('.source-tools').open`));
   await evaluate(`(()=>{const e=document.querySelector('#tokenDialogGrid input[type=number]');if(!e)throw Error('Missing token input');e.value='1';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await click('#tokenSaveButton');await until(`!document.querySelector('#tokenDialog').open`);
 });
 await check('map searches and save-return remain inside the isolated preview',async()=>{
   await choose('map');await until(conditions.map);await click('.source-tools-trigger');await evaluate(`document.querySelector('#searchInput').value='008'`);await click('#searchTileButton');await click('#headerSaveReturnButton');await until(`document.body.dataset.page==='dashboard'`,null);await until(`window.ATO_PREVIEW_PAGE==='dashboard'`,'dashboard');
 });
 await check('original custom BGM import and removal use in-memory IndexedDB',async()=>{
   await choose('dashboard');const value=await evaluate(`ATO_BGM.importTrack(new File([new Uint8Array([82,73,70,70])],'preview-test.wav',{type:'audio/wav'}),'')`);assert.ok(value.ok);const tracks=await evaluate('ATO_BGM.tracks()');assert.equal(tracks.length,1);await evaluate(`ATO_BGM.deleteTrack(${JSON.stringify(tracks[0].id)})`);assert.equal(await evaluate('ATO_BGM.tracks().length'),0);
 });
 await check('hero quick location preserves long original names without page overflow',async()=>{
   await choose('hero');await until(`document.querySelectorAll('[data-hero-location]').length===4`);
   await evaluate(`(()=>{const e=document.querySelector('.hero-title-drag h2');e.dataset.testOriginal=e.textContent;e.textContent='LongHeroNameWithoutSpaces'.repeat(6);})()`);await pause(100);
   assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));
   await click('[data-hero-location="preview-circe"]');assert.ok(await evaluate(`document.querySelector('[data-hero-id="preview-circe"]').getBoundingClientRect().top>=90`));
   await evaluate(`(()=>{const e=document.querySelector('.hero-title-drag h2');e.textContent=e.dataset.testOriginal;scrollTo(0,0);})()`);
 });
 await check('map zoom and location remain beside the canvas; source layer toggles save',async()=>{
   await choose('map');await until(conditions.map);
   assert.ok(await evaluate(`!document.querySelector('.source-tools').contains(document.querySelector('#mapZoomInput'))`));
   await evaluate(`(()=>{const e=document.querySelector('#mapZoomInput');e.value='310';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await until(`document.querySelector('#mapZoomValue').textContent==='310%'`);await click('.source-map-canvas-controls button');
   await click('.source-tools-trigger');await click('#hideUnknownToggle');await until(`ATO_PREVIEW_STORE.campaign.sections.map.users.default.hideUnknown===true`,null);await evaluate('history.back()');await pause(120);
 });
 await check('technology tree detail, original filters and arsenal submission stay usable',async()=>{
   await choose('technology');await until(`document.querySelector('#treeWrap .node:not(:disabled)')!==null`);await click('#treeWrap .node:not(:disabled)');await until(`document.querySelector('.modal-backdrop.open')!==null`);
   await click('#modalClose');
   await click('#tabs [data-page="arsenal"]');await until(`document.querySelector('#arsenalAddGear:not(:disabled)')!==null`);
   const submission=await evaluate(`(()=>{document.querySelector('.source-gear-controls').open=true;document.querySelector('#arsenalAddQuantity').value='2';document.querySelector('#arsenalAddQuantity').dispatchEvent(new Event('input',{bubbles:true}));const form=document.querySelector('.arsenal-add');let submitted=false;form.addEventListener('submit',()=>submitted=true,{once:true});const valid=form.checkValidity(),gear=document.querySelector('#arsenalAddGear').value;form.requestSubmit();return {valid,submitted,gear};})()`);assert.ok(submission.valid,JSON.stringify(submission));assert.ok(submission.submitted,JSON.stringify(submission));
   await until(`document.querySelectorAll('[data-arsenal-delta]').length>0`);assert.ok(await evaluate(`document.querySelector('.arsenal-summary').textContent.includes('2 件')`));
   await evaluate(`(()=>{const e=document.querySelector('[data-arsenal-filter="part"]');e.value='arm';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);
   await evaluate(`(()=>{const e=document.querySelector('[data-arsenal-filter="cycle"]');e.value='c1';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));
 });
 await check('story jump, bookmark, cryptic record and TTS settings use the original controls',async()=>{
   await choose('story');await click('.source-tools-trigger');await evaluate(`document.querySelector('#searchInput').value='0002'`);await click('#goButton');await until(`document.querySelector('#entryBadge').textContent.includes('0002')`);await until(`!document.querySelector('.source-tools').open`);
   await click('.source-tools-trigger');await click('#rememberButton');await until(`document.querySelector('#memoryList .memory-item')!==null`);
   await evaluate(`document.querySelector('#crypticLanguages').open=true`);await until(`!document.querySelector('#centimanesFields').disabled`);await click('.cent-key[data-cent-glyph="0"]');await evaluate(`document.querySelector('[data-cent="title"]').value='预览密语记录'`);await click('[data-cent="save"]');
   await until(`Object.keys(ATO_PREVIEW_STORE.campaign.sections.record.users.default.centimanes.records).length>0`,null);
   await click('#ttsConfigButton');await until(`document.querySelector('#ttsConfigOverlay:not([hidden])')!==null`);assert.ok(await evaluate(`!document.querySelector('.source-tools').open`));await click('#ttsModalClose');
 });
 await check('briefing handles an empty cycle and returns to recorded replay',async()=>{
   await choose('briefing');await evaluate(`document.querySelector('#cycleSelect').value='c2';document.querySelector('#cycleSelect').dispatchEvent(new Event('change',{bubbles:true}))`);await until(`!document.querySelector('#notice').hidden&&document.querySelector('#noticeText').textContent.includes('还没有每日备份')`);
   await evaluate(`document.querySelector('#cycleSelect').value='c1';document.querySelector('#cycleSelect').dispatchEvent(new Event('change',{bubbles:true}))`);await until(conditions.briefing);
 });
 await check('source reload returns through preview memory and retains edits',async()=>{
   await choose('record');const before=await evaluate(`ATO_PREVIEW_STORE.campaign.sections.record.users.default.resources['c1-trireme']`,null);await evaluate('location.reload()');await pause(300);await until(`window.ATO_PREVIEW_PAGE==='record'&&document.readyState==='complete'`);await until(conditions.record);assert.equal(await evaluate(`ATO_PREVIEW_STORE.campaign.sections.record.users.default.resources['c1-trireme']`,null),before);
 });
 await check('tools fit a reduced input viewport and restore the reading position',async()=>{
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:500,deviceScaleFactor:1,mobile:true});
   for(const page of pages){await choose(page);await evaluate('scrollTo(0,160)');const before=await evaluate('scrollY');await click('.source-tools-trigger,#dashboardToolsTrigger');await evaluate(`(()=>{const e=document.querySelector('.source-tools[open] input:not([type=hidden]):not([type=file]),#dashboardTools[open] input:not([type=hidden]):not([type=file])');if(e){e.focus();e.scrollIntoView({block:'center'});}})()`);const dims=await evaluate(`(()=>{const e=document.querySelector('.source-tools[open],#dashboardTools[open]');return {height:e.getBoundingClientRect().height,width:document.documentElement.scrollWidth};})()`);assert.ok(dims.height<=452*.85+1);assert.ok(dims.width<=391);await evaluate('history.back()');await pause(150);assert.ok(Math.abs(await evaluate('scrollY')-before)<=1,page+' reading position');}
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 });
 await check('daily backups export ZIP and import with duplicate detection',async()=>{
   const results=await evaluate(`(async()=>{const root=new URL('../../',document.baseURI),endpoint=new URL('briefing/backups.php?action=prepare-export',root),prepared=await ATO_PREVIEW_STORE.handle(endpoint,'POST',{}),p=JSON.parse(prepared.body);if(!p.ok)throw Error(p.error);const download=await ATO_PREVIEW_STORE.handle(new URL(p.downloadUrl),'GET',{});const imported=await ATO_PREVIEW_STORE.handle(new URL('briefing/backups.php?action=import',root),'PUT',{bytes:download.body});return {prepared:p,signature:[...new Uint8Array(download.body).slice(0,4)],imported:JSON.parse(imported.body)};})()`,null);
   assert.deepEqual(results.signature,[80,75,3,4]);assert.ok(results.imported.ok);assert.ok(results.imported.skipped>0);
 });
 await check('briefing images remain origin-clean for the original GIF/PDF export',async()=>{
   await choose('briefing');await until(conditions.briefing);const clean=await evaluate(`(async()=>{const image=await ATO_BRIEFING_GIF.loadImage('../hero/assets/argonaut_01_odys.png',document);const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,16,16);return ctx.getImageData(0,0,1,1).data.length===4;})()`);assert.ok(clean);
 });
 await check('all tested mutations remain in the shared preview memory',async()=>{assert.equal(requests.filter(r=>r.method!=='GET'&&r.method!=='HEAD').length,0);assert.equal(requests.filter(r=>/\/(api\/[^?]+|briefing\/(api|backups))\.php/.test(r.url)&&!r.url.includes('/api/aibp-image-index.php')).length,0);});
 }
 await check('desktop entry and full-screen phone entry load complete source pages',async()=>{
   await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'index.html#dashboard'});await until(`document.querySelector('#phoneFrame')!==null`,null);await until(conditions.dashboard,'dashboard');await pause(500);await screenshot('workbench');
   assert.equal(await evaluate('innerWidth','dashboard'),390);await click('#pageNav [data-page="map"]',null);await until(conditions.map,'map');
   await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true});await pause(200);assert.equal(await evaluate('innerWidth','map'),360);assert.ok(await evaluate(`getComputedStyle(document.querySelector('.workbench-sidebar')).display==='none'`,null));
   await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await pause(200);assert.equal(await evaluate('innerWidth','map'),844);assert.equal(await evaluate('innerHeight','map'),342);assert.ok(await evaluate(`getComputedStyle(document.querySelector('.workbench-sidebar')).display==='none'`,null));
 });
 report.success=true;report.errors=exceptions;report.consoleErrors=consoleErrors;assert.deepEqual(exceptions,[]);console.log('PASS complete source coverage');
})().catch(async e=>{report.success=false;report.errors=[...exceptions,e.stack||String(e)];report.consoleErrors=consoleErrors;console.error(e);try{report.frameTree=await send('Page.getFrameTree');report.contexts=[...contexts.values()];report.host=await evaluate('({page:document.body.dataset.page,frames:[...ATO_PREVIEW_HOST.frames.values()].map(e=>({id:e.id,url:e.url.href,ready:e.ready})),audit:ATO_PREVIEW_STORE.audit.slice(-30),record:ATO_PREVIEW_STORE.campaign.sections.record})',null);}catch{}try{await screenshot('source-error');report.diagnostics=await evaluate(`({page:window.ATO_PREVIEW_PAGE,body:document.body.innerText.slice(0,3000),url:location.href,extra:window.ATO_PREVIEW_PAGE==='technology'?{gearRecordState,gearRecordError,gearMutationInFlight,arsenalMessage,gearRecordRevision}:null})`);await screenshot('source-error');}catch{}process.exitCode=1;}).finally(async()=>{fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output',process.env.ATO_PREVIEW_REPORT||'mobile-full-source-verification.json'),JSON.stringify(report,null,2));if(ws){try{await send('Browser.close');}catch{}ws.close();}browser?.kill();});
