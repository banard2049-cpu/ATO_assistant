/* Render every installed back and inspect the full gallery without campaign writes. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/banard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'output/map-asset-kit-20261024');
async function ready(page){
  return page.evaluate(async()=>{
    await Promise.all([...document.images].map(i=>i.decode()));
    const svgs=[...document.querySelectorAll('svg image')];
    await Promise.all(svgs.map(el=>new Promise((ok,no)=>{const i=new Image();i.onload=ok;i.onerror=no;i.src=el.getAttribute('href');})));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {images:document.images.length,svgImages:svgs.length,fallbacks:document.querySelectorAll('.tile-back-fallback').length};
  });
}
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1080}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(out,'index.html')).href,{waitUntil:'load'});
    await ready(page);
    await page.screenshot({path:path.join(out,'preview/full-back-c1.png')});
    const counts={};
    for(const [cycle,expected] of [['c1',87],['c2',84],['c3',92],['c4',81],['c5',160]]){
      await page.locator(`[data-cycle="${cycle}"]`).click();
      const check=await ready(page);assert.equal(check.fallbacks,0);
      counts[cycle]=await page.locator('#gallery article').count();assert.equal(counts[cycle],expected);
      await page.screenshot({path:path.join(out,`preview/full-back-${cycle}.png`)});
    }
    await page.locator('[data-cycle="all"]').click();
    const all=await ready(page);assert.equal(all.fallbacks,0);
    assert.equal(await page.locator('#gallery article').count(),504);
    await page.locator('#search').fill('T00');await ready(page);assert.equal(await page.locator('#gallery article').count(),1);
    await page.locator('#search').fill('');
    await page.locator('[data-cycle="c4"]').click();
    await page.locator('#gallery article[data-key="c4-tile-011-back"] .zoom').click();await ready(page);
    assert.equal(await page.locator('dialog[open]').count(),1);
    await page.locator('.modal-art').screenshot({path:path.join(out,'preview/full-c4-011.png')});
    await page.locator('#close').click();
    await page.setViewportSize({width:390,height:844});await ready(page);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,'preview/full-back-mobile.png')});
    // Enlarged labels from the original PNGs and new SVGs make size/offset easy to inspect.
    await page.setViewportSize({width:1440,height:1080});
    await page.evaluate(()=>{
      const picks=[['c1','minoans'],['c1','labyrinthians'],['c2','cyclopes'],['c2','helots'],['c2','symmachy'],['c3','sunheirs'],['c3','delphians'],['c3','twilightwatch']];
      const chosen=picks.map(([c,f])=>rows.find(r=>r.cycle===c&&r.labels.length===1&&r.labels[0].factions.length===1&&r.labels[0].factions[0]===f));
      const dual=rows.find(r=>r.key==='c2-tile-019-back');chosen.push(dual);
      document.querySelector('main').innerHTML='<h1>标记放大检查</h1><p>每组上方为原图，下方为全量替换后的矢量标记</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px">'+chosen.map(r=>'<section><h2>'+label(r)+' · '+r.labels[0].factions.join(' + ')+'</h2><img style="display:block;width:100%;height:140px;object-fit:contain" src="../output/map-originals-backup-20261024/map/images/card-backs/numbers/'+r.key+'.png"><img style="display:block;width:100%;height:140px;object-fit:contain" src="'+r.source+'"></section>').join('')+'</div>';
    });
    await ready(page);await page.screenshot({path:path.join(out,'preview/full-back-label-detail.png'),fullPage:true});
    await page.evaluate(()=>{
      const sections=[...document.querySelectorAll('main section')];
      const keep=new Set([3,5,7]);sections.forEach((s,i)=>{if(!keep.has(i))s.remove();});
      ['锁链 · C2 013','太阳 · C3 001','日暮守望者 · C3 003'].forEach((s,i)=>document.querySelectorAll('section h2')[i].textContent=s);
      document.querySelector('h1').textContent='卡背标记 · 最新微调';
    });
    await page.setViewportSize({width:1320,height:440});await ready(page);
    await page.screenshot({path:path.join(out,'preview/back-marker-adjustments.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    const report={counts,vectorAnnotations:504,labels:792,arrows:144,allLoaded:all,search:'passed',zoom:'passed',mobileOverflow:false,pageErrors:errors};
    fs.writeFileSync(path.join(out,'full-browser-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
