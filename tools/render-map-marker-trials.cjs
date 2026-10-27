/* Render original/reference beside clean authored marker components. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-marker-vector-review-20261026');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'tools/map-marker-vector-source/redraw/manifest.json'),'utf8'));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const caption=s=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="35"><text x="10" y="23" fill="white" font-size="19" font-family="Microsoft YaHei,Arial">${esc(s)}</text></svg>`);
(async()=>{
  const inputs=[],category=[],records=[];
  for(let i=0;i<manifest.templates.length;i++){
    const row=manifest.templates[i],id=row.id;
    let raw=fs.readFileSync(path.join(root,row.file),'utf8');
    await sharp(Buffer.from(raw)).resize(300,300).png().toFile(path.join(out,id+'-redraw.png'));
    let sourceFile=path.join(root,'output/map-asset-kit-20261024/native-icons/markers',id.replace('_winged','')+'.png');
    let original=sharp(sourceFile).resize(260,260);
    if(id==='wheel_icon_winged'){
      sourceFile=path.join(root,'official-assets/_backups/map-links-20261025/originals/map/images/hd1024/overlay/c3-tile-062-front.png');
      original=sharp(sourceFile).extract({left:622,top:696,width:82,height:82}).resize(260,260);
    }
    // Preview colours follow each reference. The reusable final component is
    // monochrome; backing colour is always a separate shared geometry layer.
    if(['hourglass_icon','staff_icon'].includes(id))raw=raw.replaceAll('#000000','#f6f3e8');
    if(id==='silver_ruin')raw=raw.replace('data-template=', 'data-template=').replaceAll('#000000','#f6f3e8').replace(/(<title>[^<]*<\/title>)/,'$1<path d="M50 2A48 48 0 1 1 50 98A48 48 0 1 1 50 2Z" fill="#000000"/>');
    let trial=await sharp(Buffer.from(raw)).resize(260,260).png().toBuffer();
    let originalBuffer=await original.png().toBuffer();
    const x=(i%3)*600,y=Math.floor(i/3)*350;
    inputs.push({input:caption(row.label+' | 原图 / 共用几何试稿'),left:x,top:y+2},
      {input:originalBuffer,left:x+15,top:y+45},{input:trial,left:x+310,top:y+45});
    if(i<3)category.push({input:caption(row.label+' | 原图 / 共用几何试稿'),left:i*600,top:2},
      {input:originalBuffer,left:i*600+15,top:45},{input:trial,left:i*600+310,top:45});
    records.push({id,reference:sourceFile,component:row.file,method:row.method,status:'trial-needs-visual-approval'});
  }
  await sharp({create:{width:1800,height:350*Math.ceil(manifest.templates.length/3),channels:3,background:'#627277'}}).composite(inputs).jpeg({quality:96}).toFile(path.join(out,'all-redraw-trials-comparison.jpg'));
  await sharp({create:{width:1800,height:350,channels:3,background:'#627277'}}).composite(category).png().toFile(path.join(out,'category-redraw-comparison.png'));
  fs.writeFileSync(path.join(out,'trial-render-check.json'),JSON.stringify({templates:records.length,engine:'sharp/librsvg',runtimeModified:false,records},null,2)+'\n');
  console.log(JSON.stringify({templates:records.length,engine:'sharp/librsvg',runtimeModified:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
