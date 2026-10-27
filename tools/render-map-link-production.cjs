/* Independent all-face raster and pixel-preservation audit of staged SVGs. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-link-template-review-20261026');
const inventory=JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/inventory.json'),'utf8'));
const production=JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/production.json'),'utf8'));
const build=JSON.parse(fs.readFileSync(path.join(out,'build-report.json'),'utf8'));
const byKey=new Map(build.faces.map(r=>[r.key,r]));
const staged=process.argv.includes('--installed')?path.join(root,'map/images/hd1024/overlay'):path.join(out,'staged');
const dest=path.join(out,process.argv.includes('--installed')?'installed-renders':'renders');fs.mkdirSync(dest,{recursive:true});
function escape(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}
function textSvg(s,w,h){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="5" y="17" fill="#f5f4e9" font-size="15" font-family="Arial">${escape(s)}</text></svg>`)}
(async()=>{
  const records=[],panels=[];let outside=0;
  for(const row of inventory.faces){
    const key=row.key,meta=byKey.get(key);
    const before=await sharp(path.join(root,meta.before)).ensureAlpha().raw().toBuffer();
    const file=path.join(staged,`${key}-corners.svg`);
    const after=await sharp(file).ensureAlpha().raw().toBuffer();
    if(after.length!==1024*1024*4)throw Error(key+' incorrect dimensions');
    const allowed=new Uint8Array(1024*1024);
    const boxes=[...row.panels.map(p=>p.bbox),...row.panels.flatMap(p=>p.attachedExtras.map(e=>e.bbox)),...row.arrows.map(a=>a.bbox),...meta.panels.map(p=>p.bbox)];
    for(const [l,t,r,b]of boxes)for(let y=Math.max(0,Math.floor(t-5));y<Math.min(1024,Math.ceil(b+5));y++)allowed.fill(1,y*1024+Math.max(0,Math.floor(l-5)),y*1024+Math.min(1024,Math.ceil(r+5)));
    let changed=0,bad=0;
    for(let p=0;p<1024*1024;p++)if(before[p*4]!==after[p*4]||before[p*4+1]!==after[p*4+1]||before[p*4+2]!==after[p*4+2]||before[p*4+3]!==after[p*4+3]){changed++;if(!allowed[p])bad++}
    outside+=bad;
    await sharp(after,{raw:{width:1024,height:1024,channels:4}}).png().toFile(path.join(dest,key+'.png'));
    records.push({key,changedPixels:changed,changedOutsideLinkAreas:bad,bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
    for(const panel of row.panels){
      const areas=[panel.bbox,meta.panels.find(p=>p.id===panel.id).bbox,...panel.attachedExtras.map(e=>e.bbox),...row.arrows.filter(a=>a.panelId===panel.id).map(a=>a.bbox)];
      let l=Math.max(0,Math.min(...areas.map(a=>a[0]))-5),t=Math.max(0,Math.min(...areas.map(a=>a[1]))-5);
      let r=Math.min(1024,Math.max(...areas.map(a=>a[2]))+5),b=Math.min(1024,Math.max(...areas.map(a=>a[3]))+5);
      l=Math.floor(l);t=Math.floor(t);r=Math.ceil(r);b=Math.ceil(b);
      const width=r-l,height=b-t;
      const pair=[];
      for(const data of [before,after])pair.push(await sharp(data,{raw:{width:1024,height:1024,channels:4}}).extract({left:l,top:t,width,height}).resize({width:450,height:105,fit:'contain',background:'#697476'}).flatten({background:'#697476'}).png().toBuffer());
      panels.push({key,cycle:row.cycle,id:panel.id,pair});
    }
    if(records.length%100===0)console.log(`Rendered ${records.length} / 511`);
  }
  const sheets=[];const sheetDir=path.join(out,'comparison-sheets');fs.mkdirSync(sheetDir,{recursive:true});
  for(const cycle of ['c1','c2','c3','c4','c5']){
    const list=panels.filter(p=>p.cycle===cycle);
    for(let start=0;start<list.length;start+=32){
      const page=list.slice(start,start+32),inputs=[];
      for(let i=0;i<page.length;i++){
        const x=(i%2)*930,y=Math.floor(i/2)*138;
        inputs.push({input:textSvg(page[i].key+' '+page[i].id+' | Original / Vector',910,24),left:x+5,top:y+1});
        inputs.push({input:page[i].pair[0],left:x+5,top:y+26},{input:page[i].pair[1],left:x+465,top:y+26});
      }
      const name=`${cycle}-${String(start/32+1).padStart(2,'0')}.jpg`;
      await sharp({create:{width:1860,height:Math.ceil(page.length/2)*138,channels:3,background:'#26383f'}}).composite(inputs).jpeg({quality:92}).toFile(path.join(sheetDir,name));
      sheets.push({cycle,file:'comparison-sheets/'+name,panels:page.length});
    }
  }
  const report={status:outside?'failed':'passed',version:production.version,faces:records.length,panels:panels.length,
    changedOutsideLinkAreas:outside,renderEngine:'sharp/librsvg',mode:process.argv.includes('--installed')?'installed':'staged',records,sheets};
  fs.writeFileSync(path.join(out,process.argv.includes('--installed')?'installed-render-check.json':'render-check.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>全部地图链接 · 固定元素组合对比</title><style>body{font:16px/1.6 system-ui;background:#17262d;color:#f0f0e8;margin:24px}img{width:100%;height:auto}a{color:#b1dfef}h2{font-size:18px}section{max-width:1860px;margin:24px auto}</style><h1>全部 511 张地图面 · 固定元素组合</h1><p>1575 处链接牌。每项左为原版、右为固定矢量元素组合；相同布局共用完全相同的几何，数字、派系和符号按原图语义置换。可见图形不使用逐图描摹。原版位于官方素材备份。共 ${sheets.length} 张对比表。</p>${sheets.map(r=>`<section><h2>${r.cycle.toUpperCase()} · ${r.file}</h2><a href="${r.file}"><img loading="lazy" src="${r.file}"></a></section>`).join('')}`);
  console.log(JSON.stringify({status:report.status,faces:records.length,panels:panels.length,changedOutsideLinkAreas:outside,sheets:sheets.length}));
  if(outside)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
