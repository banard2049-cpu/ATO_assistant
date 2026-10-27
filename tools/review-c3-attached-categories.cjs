const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-marker-hd-review-20261026/c3-category-fix');fs.mkdirSync(out,{recursive:true});
const marker=JSON.parse(fs.readFileSync(path.join(root,'tools/map-marker-vector-source/inventory.json'),'utf8'));
const sources=new Map(marker.faces.map(r=>[r.key,r.source]));
const schema=JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/contents-c3-c4.json'),'utf8')).faces;
const geometry=new Map(JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/cells.json'),'utf8')).faces.map(r=>[r.key,r]));
const args=process.argv.slice(2);const dir=args.includes('--staged')?'output/map-marker-hd-review-20261026/composition/staged':'map/images/hd1024/overlay';
const title=s=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="28"><text x="8" y="21" fill="white" font-family="Arial" font-size="17">${s}</text></svg>`);
(async()=>{
 const rows=[],inputs=[];
 for(const[key,row]of Object.entries(schema))for(const[pid,p]of Object.entries(row.panels)){
  const extras=(p.attachedExtras||[]).filter(e=>e.type==='icon');if(!extras.length)continue;
  const panel=geometry.get(key).panels.find(x=>x.id===pid),boxes=[panel.bbox,...(p.attachedExtras||[]).map((e,i)=>e.sourceBBox||e.bbox||panel.attachedExtras[i].bbox)];
  const l=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b[0]))-16)),t=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b[1]))-14));
  const r=Math.min(1024,Math.ceil(Math.max(...boxes.map(b=>b[2]))+16)),b=Math.min(1024,Math.ceil(Math.max(...boxes.map(b=>b[3]))+14));
  const source=path.join(root,sources.get(key)),current=path.join(root,dir,key+'-corners.svg'),crop={left:l,top:t,width:r-l,height:b-t};
  const pair=[];for(const file of[source,current])pair.push(await sharp(file).extract(crop).resize({width:630,height:180,fit:'contain',background:'#697476'}).flatten({background:'#697476'}).png().toBuffer());
  const i=rows.length,y=i*220;
  inputs.push({input:title(key+' '+pid+' '+extras.map(e=>e.value).join(',')+' | Original / Current'),left:0,top:y},
   {input:pair[0],left:4,top:y+31},{input:pair[1],left:660,top:y+31});
  rows.push({key,pid,extras,source,crop});
  if(key==='c3-tile-003-front'&&pid==='special-1'){
   await sharp({create:{width:1300,height:220,channels:3,background:'#22353b'}}).composite([{input:title('C3 003 | Original / Current'),left:0,top:0},{input:pair[0],left:4,top:31},{input:pair[1],left:660,top:31}]).png().toFile(path.join(out,args.includes('--staged')?'c3-003-corrected.png':'c3-003-before.png'));
  }
 }
 for(let start=0;start<rows.length;start+=8){
  const page=inputs.filter(p=>p.top>=start*220&&p.top<(start+8)*220).map(p=>({...p,top:p.top-start*220}));
  await sharp({create:{width:1300,height:Math.min(8,rows.length-start)*220,channels:3,background:'#22353b'}}).composite(page).jpeg({quality:97}).toFile(path.join(out,`all-${args.includes('--staged')?'corrected':'before'}-${start/8+1}.jpg`));
 }
 fs.writeFileSync(path.join(out,'contexts.json'),JSON.stringify(rows,null,2)+'\n');console.log(rows.length);
})().catch(e=>{console.error(e);process.exitCode=1});
