/* Actual browser rendering of the shared T06 texture and its cycle colors. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/map-t06-shared-20261023');
const { chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const html = `<!doctype html><meta charset="utf-8"><base href="/map/"><link rel="stylesheet" href="/map/styles.css">
<style>body{margin:0;padding:22px;background:#171c23;color:#edf1f2;font:16px sans-serif}h1{font-size:23px;margin:0 0 16px}.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.caption{padding:0 0 10px}.tile-card{position:relative;width:100%;border:0;border-radius:0}.tile-image{position:relative}</style>
<h1>C1 / C2 / C3 / C5 共用新底图</h1><div class="gallery" id="gallery"></div>
${['tile-artwork-data.js','tile-back-data.js','c5-heading-data.js','tile-artwork.js'].map(f=>'<script src="/map/'+f+'"></script>').join('')}
<script>const api=ATO_MAP_ARTWORK;
const rows=[['C1 · 棕金',api.markup('./images/c1-tile-001-back.png','001')],['C2 · 红色',api.markup('./images/c2-tile-001-back.png','001')],['C3 · 暗紫',api.markup('./images/c3-tile-001-back.png','001')],['C5 · 蓝黑',api.coverMarkup('./images/c5-tile-080-front.png','080')]];
gallery.innerHTML=rows.map(([label,markup],i)=>'<section data-sample="'+i+'"><div class="caption">'+label+'</div><article class="tile-card"><div class="tile-image">'+markup+'</div></article></section>').join('');api.bind(gallery);</script>`;
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page=await browser.newPage({viewport:{width:1600,height:520}});
    const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/preview.html')return route.fulfill({contentType:'text/html',body:html});
      if(url.pathname.includes('card-backs/'))requests.push(url.pathname);
      const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404});
      return route.fulfill({contentType:({'.png':'image/png','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
    });
    await page.goto('http://map.test/preview.html',{waitUntil:'networkidle'});
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator('.tile-back-fallback').count(),0);
    assert.ok(requests.every(p=>! /c[23]-base\.png/.test(p)));
    assert.equal(new Set(requests.filter(p=>p.endsWith('-base.png'))).size,1);
    assert.equal(await page.locator('.tile-back-piece[style*="filter"]').count(),0);
    const filters=await page.locator('.tile-back-base,.tile-c5-cover-base').evaluateAll(imgs=>imgs.map(i=>getComputedStyle(i).filter));
    assert.equal(filters[0],'none');
    assert.equal(new Set(filters).size,4);
    assert.ok(await page.locator('.tile-back-base,.tile-c5-cover-base').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
    await page.screenshot({path:path.join(output,'c1-c2-c3-c5-preview.png'),fullPage:true});
    console.log(JSON.stringify({filters,errors,sharedBaseRequests:[...new Set(requests.filter(p=>p.endsWith('-base.png')))]},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
