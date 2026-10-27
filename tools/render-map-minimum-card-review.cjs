/* Exact minimum-card review: complete cards and padded, complete-object details. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-marker-hd-review-20261026/minimum-card-review');
const selection=JSON.parse(fs.readFileSync(path.join(out,'selection.json'),'utf8'));
const geometry=new Map(JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/cells.json'),'utf8')).faces.map(r=>[r.key,r]));
const staged=process.argv.includes('--staged'),overlayDir=path.join(root,staged?'output/map-marker-hd-review-20261026/composition/staged':'map/images/hd1024/overlay');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const bg='#22343d',light='#f4f1e5';
function textSvg(lines,w,h=54,font=20){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines.map((s,i)=>`<text x="12" y="${font+5+i*(font+7)}" fill="${light}" font-family="Microsoft YaHei,Arial,sans-serif" font-size="${font}">${esc(s)}</text>`).join('')}</svg>`)}
const cardLabel=k=>k.replace('-tile-',' ').replace('-alt-front',' 异版 A').replace('-front',' A').replace('-back',' B').toUpperCase();
function union(boxes){return[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))]}
function completeBox(row,occ){
 let box=occ.bbox;
 if(occ.panelId){const p=geometry.get(row.key).panels.find(p=>p.id===occ.panelId);if(p)box=union([occ.bbox,p.bbox,...p.attachedExtras.map(e=>e.bbox),...(p.embeddedArrows||[]).map(a=>a.bbox)]);}
 if(occ.role==='hidden-number'){
  const[l,t,r,b]=box,cx=(l+r)/2,cy=(t+b)/2,a=Number(occ.angle||0)*Math.PI/180,w=Math.abs((r-l)*Math.cos(a))+Math.abs((b-t)*Math.sin(a)),h=Math.abs((r-l)*Math.sin(a))+Math.abs((b-t)*Math.cos(a));box=[cx-w/2,cy-h/2,cx+w/2,cy+h/2];
 }
 const pad=occ.role==='banner'?24:18,[l,t,r,b]=box;
 const left=Math.max(0,Math.floor(l-pad)),top=Math.max(0,Math.floor(t-pad)),right=Math.min(1024,Math.ceil(r+pad)),bottom=Math.min(1024,Math.ceil(b+pad));
 return{left,top,width:right-left,height:bottom-top};
}
function score(o){return(o.role==='link-attached'?30:o.role==='link-cell'?20:o.role.startsWith('corner')?0:25)+(o.role==='hidden-number'?20:0)}
(async()=>{
 for(const d of['cards','overviews','details'])fs.mkdirSync(path.join(out,d),{recursive:true});
 const keys=[...new Set([...selection.expanded.selectedFaceKeys,...selection.core.selectedFaceKeys])],cards=new Map(),records=[];
 for(const key of keys){
  const row=selection.candidates[key],source=fs.readFileSync(path.join(root,row.source)),current=fs.readFileSync(path.join(overlayDir,key+'-corners.svg'));
  if(sha(source)!==row.sourceSha256)throw Error('Changed original '+key);
  if(!staged&&sha(current)!==selection.expanded.runtimeCoverageCheck.installedFaceSha256[key]&&sha(current)!==selection.core.runtimeCoverageCheck.installedFaceSha256[key])throw Error('Changed selected runtime '+key);
  const base=await sharp(path.join(root,row.base)).resize(1024,1024).png().toBuffer(),pair=[];
  for(const overlay of[source,current])pair.push(await sharp(base).composite([{input:overlay}]).png().toBuffer());
  const items=[{input:textSvg([cardLabel(key)+'  |  原版 / 当前版'],2080,48,24),left:0,top:0},{input:pair[0],left:8,top:54},{input:pair[1],left:1048,top:54}];
  const pairFile='cards/'+key+'-comparison.png';
  await sharp({create:{width:2080,height:1088,channels:3,background:bg}}).composite(items).png({compressionLevel:6}).toFile(path.join(out,pairFile));
  const thumbs=[];for(const image of pair)thumbs.push(await sharp(image).resize(512,512).png().toBuffer());
  cards.set(key,{row,pair,thumbs,file:pairFile});records.push({key,sourceSha256:sha(source),currentSha256:sha(current),pair:pairFile});
 }
 const pages={};
 for(const name of['expanded','core']){
  const list=selection[name].selectedFaceKeys;pages[name]=[];
  for(let start=0;start<list.length;start+=3){
   const page=list.slice(start,start+3),items=[];
   items.push({input:textSvg([`${name==='expanded'?'全部类型（含密码）':'独立图形与密码参考'} · 最少 ${selection[name].minimumPhysicalCards} 张卡 · ${selection[name].featureCount} 类`,`左：原版　右：当前版　｜　第 ${start/3+1} / ${Math.ceil(list.length/3)} 页`],1080,82,22),left:0,top:0});
   for(let i=0;i<page.length;i++){const card=cards.get(page[i]),y=90+i*558;items.push({input:textSvg([cardLabel(page[i])],1060,36,20),left:10,top:y},{input:card.thumbs[0],left:16,top:y+36},{input:card.thumbs[1],left:552,top:y+36});}
   const file=`overviews/${name}-${start/3+1}.jpg`;
   await sharp({create:{width:1080,height:page.length*558+96,channels:3,background:bg}}).composite(items).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toFile(path.join(out,file));pages[name].push({file,keys:page});
  }
 }
 const details=[];
 for(const feature of selection.expanded.coveredFeatures){
  const choices=selection.expanded.coverageWitness[feature].flatMap(key=>selection.candidates[key].occurrences.filter(o=>o.feature===feature).map(occ=>({key,occ}))).sort((a,b)=>score(b.occ)-score(a.occ));
  const choice=choices[0],card=cards.get(choice.key),crop=completeBox(card.row,choice.occ),pair=[];
  for(const image of card.pair)pair.push(await sharp(image).extract(crop).resize({width:382,height:184,fit:'contain',background:bg}).png().toBuffer());
  const file='details/'+feature.replaceAll(':','-').replaceAll('+','-')+'.png';
  await sharp({create:{width:800,height:258,channels:3,background:bg}}).composite([{input:textSvg([selection.featureLabels[feature],cardLabel(choice.key)+' · 原版 / 当前版'],798,68,19),left:0,top:0},{input:pair[0],left:8,top:70},{input:pair[1],left:410,top:70}]).png().toFile(path.join(out,file));
  details.push({feature,label:selection.featureLabels[feature],key:choice.key,role:choice.occ.role,crop,file});
 }
 const atlas=[];
 for(let start=0;start<details.length;start+=14){
  const page=details.slice(start,start+14),items=[{input:textSvg([`全部 ${details.length} 类图标与密码 · 细节对比 ${start/14+1} / ${Math.ceil(details.length/14)}`,'每组左原版、右当前版；按完整对象及周围留白取景'],1620,82,22),left:0,top:0}];
  for(let i=0;i<page.length;i++)items.push({input:path.join(out,page[i].file),left:8+(i%2)*806,top:88+Math.floor(i/2)*266});
  const file=`details/all-types-${start/14+1}.jpg`;
  await sharp({create:{width:1620,height:96+Math.ceil(page.length/2)*266,channels:3,background:bg}}).composite(items).jpeg({quality:97,chromaSubsampling:'4:4:4'}).toFile(path.join(out,file));atlas.push({file,features:page.map(r=>r.feature)});
 }
 const result={status:'passed',mode:staged?'staged':'installed',selectionSha256:sha(fs.readFileSync(path.join(out,'selection.json'))),primaryCase:'expanded',physicalCards:selection.expanded.minimumPhysicalCards,displayedFaces:selection.expanded.minimumDisplayedFaces,featureCount:details.length,passwordTypesIncluded:['style:secret-banner','style:hidden-number'],cards:records,overviews:pages,atlas,details};
 fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(result,null,2)+'\n');
 const gallery=name=>{const s=selection[name];return`<section id="${name}" class="case ${name==='expanded'?'active':''}"><h2>${name==='expanded'?'全部图标与密码':'独立图形与密码'}：最少 ${s.minimumPhysicalCards} 张卡 / ${s.minimumDisplayedFaces} 个面</h2><p>${name==='expanded'?`覆盖 ${s.featureCount} 类：包括密码横幅、地图内四位密码、上下左右箭头、所有派系与地点图标，以及不同组件样式。`:`覆盖 ${s.featureCount} 类独立图形与密码；未额外要求复合图、名牌、水下底座样式。` }已对 511 个地图面做精确最小覆盖计算。</p>${pages[name].map(p=>`<article><a href="${p.file}"><img loading="lazy" src="${p.file}"></a><div class="links">${p.keys.map(k=>`<a href="${cards.get(k).file}" target="_blank">${cardLabel(k)} 原尺寸对比 ↗</a>`).join('')}</div></article>`).join('')}</section>`};
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>最少卡牌 · 原版与当前版对比（含密码）</title><style>html{color-scheme:dark}body{margin:24px;font:16px/1.6 system-ui,"Microsoft YaHei",sans-serif;background:#17262d;color:${light}}main{max-width:1620px;margin:auto}a{color:#a5dcea}button{font:inherit;background:#314650;color:${light};padding:9px 16px;border:1px solid #66828e;border-radius:4px;cursor:pointer}nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.case{display:none}.case.active{display:block}article{max-width:1080px;margin:28px auto;background:${bg};padding:12px}img{display:block;max-width:100%;height:auto;margin:auto}.links{display:flex;gap:14px;flex-wrap:wrap}.atlas{max-width:1620px}.index{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px}h1{font-size:28px}h2{font-size:24px}.note{color:#b8cad0}</style></head><body><main><h1>原版 / 当前版：最少卡牌完整对比</h1><p>主对比包含地图密码。左侧为官方原图叠加底图，右侧为当前蒙版叠加同一底图。所有整卡保留 1024 × 1024 全部内容；点击卡号可查看两列原尺寸 PNG。</p><p class="note">${staged?'此页比较待安装版本。':'此页比较已安装蒙版。'}相同字形在不同位置不重复计数，数字取值与颜色变化不重复计为一种图标。C5 A/B 计同一张实体卡，C1 异版印刷分别计数。</p><nav><button onclick="showCase('expanded')">全部 ${selection.expanded.featureCount} 类（含密码） · ${selection.expanded.minimumPhysicalCards} 张</button><button onclick="showCase('core')">独立图形与密码参考 · ${selection.core.minimumPhysicalCards} 张</button><a href="#atlas">全部类型放大对比 ↓</a></nav>${gallery('expanded')}${gallery('core')}<section id="atlas"><h2>全部类型放大对比</h2><p>以下 ${details.length} 类全部取自上面主对比所选的 ${selection.expanded.minimumPhysicalCards} 张卡，没有额外增加卡牌。取景按完整对象及关联链接牌外缘加留白，保持原比例。</p>${atlas.map(p=>`<article class="atlas"><a href="${p.file}" target="_blank"><img loading="lazy" src="${p.file}"></a></article>`).join('')}<h2>类型索引</h2><div class="index">${details.map(d=>`<a href="${d.file}" target="_blank">${esc(d.label)} · ${cardLabel(d.key)}</a>`).join('')}</div></section><p><a href="selection.json">最少卡牌计算与覆盖证据</a> · <a href="render-report.json">渲染与文件校验记录</a></p></main><script>function showCase(name){document.querySelectorAll('.case').forEach(e=>e.classList.toggle('active',e.id===name))}</script></body></html>`);
 const pageFile=path.join(out,'index.html');
 fs.writeFileSync(pageFile,fs.readFileSync(pageFile,'utf8').replace('<nav>', '<p><a href="../password-audit/index.html">C1 014 两面与全部密码专项对比 ↗</a> · <a href="../c2-special-route-audit/index.html">C2 全部特殊路线对比 ↗</a></p><nav>'));
 console.log(JSON.stringify({status:'passed',mode:result.mode,physicalCards:result.physicalCards,faces:result.displayedFaces,types:details.length,overviewPages:pages.expanded.length,atlasPages:atlas.length,allCardPairs:records.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
