/* One source/current comparison at the user-reviewed C2 007 location. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-marker-hd-review-20261026/land-layers');
const staged=process.argv.includes('--staged'),key='c2-tile-007-front';
const inventory=JSON.parse(fs.readFileSync(path.join(root,'tools/map-marker-vector-source/inventory.json'),'utf8')).faces.find(r=>r.key===key);
const geometry=JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/cells.json'),'utf8')).faces.find(r=>r.key===key);
const box=geometry.panels.find(r=>r.id==='right-1').cells[0].bbox;
const[l,t,r,b]=box,pad=9,crop={left:Math.floor(l-pad),top:Math.floor(t-pad),width:Math.ceil(r-l+2*pad),height:Math.ceil(b-t+2*pad)};
const title=s=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="440" height="48"><text x="220" y="32" text-anchor="middle" font-family="Microsoft YaHei,Arial" font-size="25" fill="#f4f1e5">${s}</text></svg>`);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const base=await sharp(path.join(root,`map/images/hd1024/base/${key}.png`)).resize(1024,1024).png().toBuffer(),inputs=[];
 const files=[path.join(root,inventory.source),path.join(root,staged?'output/map-marker-hd-review-20261026/composition/staged':'map/images/hd1024/overlay',key+'-corners.svg')];
 for(let i=0;i<2;i++){
  const composite=await sharp(base).composite([{input:files[i]}]).png().toBuffer();
  const zoom=await sharp(composite).extract(crop).resize({width:400,height:350,fit:'contain',background:'#23363f',kernel:'lanczos3'}).png().toBuffer();
  inputs.push({input:title(i?'修正后':'原版'),left:i*450+5,top:4},{input:zoom,left:i*450+25,top:60});
 }
 const footer=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="30"><text x="450" y="22" text-anchor="middle" font-family="Microsoft YaHei,Arial" font-size="17" fill="#b8cad0">C2 007 · 三横杠特殊路线 · 同一底图与相同取景</text></svg>');inputs.push({input:footer,left:0,top:415});
 const target=path.join(out,'c2-007-original-corrected.png');await sharp({create:{width:900,height:450,channels:3,background:'#23363f'}}).composite(inputs).png().toFile(target);console.log(target);
})().catch(e=>{console.error(e);process.exitCode=1});
