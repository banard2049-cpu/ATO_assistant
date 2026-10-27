/* Full-library render, preservation audit and unclipped comparison gallery. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-marker-hd-review-20261026/composition');
const layouts=JSON.parse(fs.readFileSync(path.join(out,'backing-layouts.json'),'utf8'));
const production=JSON.parse(fs.readFileSync(path.join(root,'tools/map-marker-vector-source/production.json'),'utf8'));
const report=JSON.parse(fs.readFileSync(path.join(out,'composition-report.json'),'utf8'));
const linkInventory=new Map(JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/inventory.json'),'utf8')).faces.map(r=>[r.key,r]));
const cornerInventory=new Map(JSON.parse(fs.readFileSync(path.join(root,'tools/map-corner-vector-source/inventory.json'),'utf8')).faces.map(r=>[r.key,r]));
const headingSource=fs.readFileSync(path.join(root,'map/c5-heading-data.js'),'utf8');
const headings=JSON.parse(headingSource.slice(headingSource.indexOf('{'),headingSource.lastIndexOf('}')+1));
const installed=process.argv.includes('--installed');
const staged=installed?path.join(root,'map/images/hd1024/overlay'):path.join(out,'staged');
const renders=path.join(out,installed?'installed-renders':'renders');fs.mkdirSync(renders,{recursive:true});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const title=(s,w,h=24)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="6" y="18" fill="#f5f1e6" font-family="Arial,Microsoft YaHei" font-size="15">${esc(s)}</text></svg>`);
const allBounds=row=>[
  ...(headings[row.key]?[headings[row.key].header.map((v,i)=>v+(i<2?-8:8))]:[]),
  ...['left','right'].filter(s=>cornerInventory.get(row.key).corners[s]?.bbox).map(s=>{const b=cornerInventory.get(row.key).corners[s].bbox;return[b[0]-8,b[1]-8,b[2]+8,b[3]+8]}),
  ...[...linkInventory.get(row.key).panels.map(p=>p.bbox),...linkInventory.get(row.key).panels.flatMap(p=>p.attachedExtras.map(e=>e.bbox)),...linkInventory.get(row.key).arrows.map(a=>a.bbox)].map(b=>[b[0]-8,b[1]-8,b[2]+8,b[3]+8]),
  ...(row.speckles||[]).map(m=>[m.bbox[0]-5,m.bbox[1]-5,m.bbox[2]+5,m.bbox[3]+5]),
  ...row.markers.flatMap(m=>{const [l,t,r,b]=m.sourceBBox;const rad=m.type==='city_nameplate'?170:m.type==='secret_number_banner'?84:48;return [[l-6,t-6,r+6,b+6],[m.center[0]-rad,m.center[1]-rad,m.center[0]+rad,m.center[1]+rad]]}),
  ...row.hiddenNumbers.map(m=>{const [l,t,r,b]=m.bounds,cx=(l+r)/2,cy=(t+b)/2;const a=Number(m.angle||0)*Math.PI/180,w=Math.abs((r-l)*Math.cos(a))+Math.abs((b-t)*Math.sin(a)),h=Math.abs((r-l)*Math.sin(a))+Math.abs((b-t)*Math.cos(a));return[cx-w/2-8,cy-h/2-8,cx+w/2+8,cy+h/2+8]})
];
if(process.argv.includes('--diff-face')){
  const key=process.argv[process.argv.indexOf('--diff-face')+1];
  (async()=>{
    const row=layouts.faces.find(r=>r.key===key),allowed=new Uint8Array(1024*1024);
    for(const[l,t,r,b]of allBounds(row))for(let y=Math.max(0,Math.floor(t));y<Math.min(1024,Math.ceil(b));y++)allowed.fill(1,y*1024+Math.max(0,Math.floor(l)),y*1024+Math.min(1024,Math.ceil(r)));
    const before=await sharp(path.resolve(root,report.baseOverlays,`${key}-corners.svg`)).ensureAlpha().raw().toBuffer();
    const after=await sharp(path.join(staged,`${key}-corners.svg`)).ensureAlpha().raw().toBuffer();
    const points=[];
    for(let p=0;p<allowed.length;p++)if(!allowed[p]&&!before.subarray(p*4,p*4+4).equals(after.subarray(p*4,p*4+4)))points.push({x:p%1024,y:Math.floor(p/1024),before:[...before.subarray(p*4,p*4+4)],after:[...after.subarray(p*4,p*4+4)]});
    console.log(JSON.stringify({key,points}));
  })().catch(e=>{console.error(e);process.exitCode=1});
}else(async()=>{
  const records=[],items=[],examples=[];let outside=0,residual=0;
  for(const row of layouts.faces){
    const beforeFile=path.resolve(root,report.baseOverlays||'output/map-link-template-review-20261026/staged',`${row.key}-corners.svg`);
    const afterFile=path.join(staged,`${row.key}-corners.svg`);
    const before=await sharp(beforeFile).ensureAlpha().raw().toBuffer(),after=await sharp(afterFile).ensureAlpha().raw().toBuffer();
    const xml=fs.readFileSync(afterFile,'utf8');
    const keep=xml.match(/<mask\b(?=[^>]* id="keep")[^>]*>[\s\S]*?<\/mask>/)[0];
    const retained=xml.match(/<g mask="url\(#keep\)">[\s\S]*?<\/g>/)[0];
    const legacy=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs>${keep}</defs>${retained}</svg>`)).ensureAlpha().raw().toBuffer();
    let legacyPixels=0,legacyMaxAlpha=0;
    for(let p=3;p<legacy.length;p+=4){if(legacy[p]>1)legacyPixels++;legacyMaxAlpha=Math.max(legacyMaxAlpha,legacy[p])}
    residual+=legacyPixels;
    if(after.length!==1024*1024*4)throw Error(row.key+' dimensions');
    const allowed=new Uint8Array(1024*1024);
    for(const[l,t,r,b]of allBounds(row))for(let y=Math.max(0,Math.floor(t));y<Math.min(1024,Math.ceil(b));y++)allowed.fill(1,y*1024+Math.max(0,Math.floor(l)),y*1024+Math.min(1024,Math.ceil(r)));
    let changed=0,bad=0;
    for(let p=0;p<allowed.length;p++)if(before[p*4]!==after[p*4]||before[p*4+1]!==after[p*4+1]||before[p*4+2]!==after[p*4+2]||before[p*4+3]!==after[p*4+3]){changed++;if(!allowed[p])bad++}
    outside+=bad;
    await sharp(after,{raw:{width:1024,height:1024,channels:4}}).png().toFile(path.join(renders,row.key+'.png'));
    const original=await sharp(path.join(root,row.source)).ensureAlpha().raw().toBuffer();
    const sourceItems=[...row.markers.map(m=>({id:m.id,type:m.variantId||m.type,bounds:m.sourceBBox})),...row.hiddenNumbers.map((m,i)=>{
      const[l,t,r,b]=m.bounds,cx=(l+r)/2,cy=(t+b)/2,a=Number(m.angle||0)*Math.PI/180,w=Math.abs((r-l)*Math.cos(a))+Math.abs((b-t)*Math.sin(a)),h=Math.abs((r-l)*Math.sin(a))+Math.abs((b-t)*Math.cos(a));
      return{id:row.key+'-hidden-'+i,type:'hidden_number',bounds:[cx-w/2-8,cy-h/2-8,cx+w/2+8,cy+h/2+8]}
    })];
    for(const item of sourceItems){
      // The rectangle follows each complete object, with extra padding; it is
      // then contained in the display slot, never forced into a square crop.
      const[l,t,r,b]=item.bounds,pad=item.type==='city_nameplate'?16:12;
      const left=Math.max(0,Math.floor(l-pad)),top=Math.max(0,Math.floor(t-pad));
      const right=Math.min(1024,Math.ceil(r+pad)),bottom=Math.min(1024,Math.ceil(b+pad));
      const crop={left,top,width:right-left,height:bottom-top};
      const pair=[];
      for(const data of[original,after])pair.push(await sharp(data,{raw:{width:1024,height:1024,channels:4}}).extract(crop).resize({width:276,height:162,fit:'contain',background:'#697476'}).flatten({background:'#697476'}).png().toBuffer());
      items.push({key:row.key,cycle:row.cycle,...item,pair});
    }
    if(!row.key.includes('-alt-')&&row.markers.length>=2&&examples.filter(x=>x.cycle===row.cycle).length<3)examples.push({key:row.key,cycle:row.cycle,original:row.source});
    records.push({key:row.key,sha256:crypto.createHash('sha256').update(fs.readFileSync(afterFile)).digest('hex'),changedPixels:changed,changedOutsideMarkerAreas:bad,visibleLegacyPixels:legacyPixels,maximumLegacyAlpha:legacyMaxAlpha,markers:row.markers.length,hiddenNumberGroups:row.hiddenNumbers.length});
    if(records.length%100===0)console.log(`Rendered markers ${records.length}/511`);
  }
  const sheets=[],dir=path.join(out,'comparison-sheets');fs.mkdirSync(dir,{recursive:true});
  for(const cycle of['c1','c2','c3','c4','c5']){
    const list=items.filter(x=>x.cycle===cycle);
    for(let start=0;start<list.length;start+=24){
      const page=list.slice(start,start+24),inputs=[];
      for(let i=0;i<page.length;i++){const x=i%3*570,y=Math.floor(i/3)*194;inputs.push({input:title(page[i].key+' '+page[i].type,568),left:x,top:y},{input:page[i].pair[0],left:x+4,top:y+26},{input:page[i].pair[1],left:x+288,top:y+26})}
      const file=`${cycle}-${String(start/24+1).padStart(2,'0')}.jpg`;
      await sharp({create:{width:1710,height:Math.ceil(page.length/3)*194,channels:3,background:'#26383f'}}).composite(inputs).jpeg({quality:95}).toFile(path.join(dir,file));sheets.push({cycle,file:'comparison-sheets/'+file,objects:page.length});
    }
  }
  // One overview shows every distinct emblem and other backing/text family.
  const distinct=[];for(const item of items)if(!distinct.some(x=>x.type===item.type))distinct.push(item);
  const inputs=[];for(let i=0;i<distinct.length;i++){const x=i%3*570,y=Math.floor(i/3)*194;inputs.push({input:title(distinct[i].type+' | Original / Components',568),left:x,top:y},{input:distinct[i].pair[0],left:x+4,top:y+26},{input:distinct[i].pair[1],left:x+288,top:y+26})}
  await sharp({create:{width:1710,height:Math.ceil(distinct.length/3)*194,channels:3,background:'#26383f'}}).composite(inputs).jpeg({quality:96}).toFile(path.join(out,'all-families-comparison.jpg'));
  const maps=[];
  for(const cycle of['c1','c2','c3','c4','c5']){
    const page=examples.filter(x=>x.cycle===cycle),composites=[];
    for(let i=0;i<page.length;i++){
      const base=path.join(root,'map/images/hd1024/base',page[i].key+'.png');
      const baseBuffer=await sharp(base).resize(1024,1024).png().toBuffer();
      composites.push({input:title(page[i].key+' | Original / Components',1000),left:0,top:i*514});
      const overlays=[path.join(root,page[i].original),path.join(renders,page[i].key+'.png')];
      for(let side=0;side<2;side++){
        const composed=await sharp(baseBuffer).composite([{input:overlays[side]}]).png().toBuffer();
        const buffer=await sharp(composed).resize(480,480).png().toBuffer();
        composites.push({input:buffer,left:side*500,top:i*514+28});
      }
    }
    const file=`full-map-${cycle}.jpg`;
    await sharp({create:{width:1000,height:page.length*514,channels:3,background:'#26383f'}}).composite(composites).jpeg({quality:95}).toFile(path.join(out,file));maps.push({cycle,file,faces:page.length});
  }
  const result={status:outside||residual?'failed':'passed',version:production.version,faces:records.length,objects:items.length,changedOutsideMarkerAreas:outside,
    allowedAreas:'Complete audited corner, header, link and remaining-marker component areas, including original antialias padding.',
    visibleLegacyPixels:residual,renderEngine:'sharp/librsvg',mode:installed?'installed':'staged',records,sheets,maps};
  fs.writeFileSync(path.join(out,installed?'installed-render-check.json':'render-check.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>全部地图标记原版对比</title><style>body{font:16px system-ui;background:#17262d;color:#f5f1e6;margin:24px}img{width:100%;height:auto}section{max-width:1710px;margin:24px auto}a{color:#b1dfef}</style><h1>511 张地图面：原版 / 固定元素组合</h1><p>所有 ${items.length} 处独立标记与暗号。左原版、右组合。各图按完整内容边界加留白，再等比例放入对比框，不裁成方形。现成 SVG 与原版透明图案共用固定底座和字体，逐地图仅记录类型、颜色和位置。</p><section><h2>全部类型总览</h2><a href="all-families-comparison.jpg"><img src="all-families-comparison.jpg"></a></section>${maps.map(s=>`<section><h2>${s.cycle.toUpperCase()} 完整地图位置对比</h2><a href="${s.file}"><img loading="lazy" src="${s.file}"></a></section>`).join('')}${sheets.map(s=>`<section><h2>${s.cycle} ${s.file}</h2><a href="${s.file}"><img loading="lazy" src="${s.file}"></a></section>`).join('')}`);
  const pageFile=path.join(out,'index.html');
  const shortcuts='<section><p><a href="../minimum-card-review/index.html">最少卡牌覆盖全部类型（含密码）</a> · <a href="../password-audit/index.html">全部密码与 C1 014 两面的专项对比</a> · <a href="../c2-special-route-audit/index.html">C2 全部 48 处特殊路线对比</a></p><p>隐藏密码使用原图字色。专项页面可切换叠加底图和浅色棋盘蒙版，并查看完整密码的放大图。</p></section>';
  fs.writeFileSync(pageFile,fs.readFileSync(pageFile,'utf8').replace('<section><h2>全部类型总览</h2>',shortcuts+'<section><h2>全部类型总览</h2>'));
  console.log(JSON.stringify({status:result.status,faces:records.length,objects:items.length,changedOutsideMarkerAreas:outside,visibleLegacyPixels:residual,sheets:sheets.length}));if(outside||residual)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
