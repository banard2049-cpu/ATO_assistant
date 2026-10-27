/* Render both review libraries with independent librsvg. No runtime writes. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-link-vector-review-20261025');
(async()=>{
  const glyphs=JSON.parse(fs.readFileSync(path.join(root,'tools/map-link-vector-source/glyphs/manifest.json'),'utf8')).glyphs;
  for(const row of glyphs){
    await sharp(path.join(root,row.file)).resize(256,256).png().toFile(path.join(out,'glyphs',row.id+'-vector.png'));
    if(row.source)await sharp(path.join(root,row.source)).resize(256,256).png().toFile(path.join(out,'glyphs',row.id+'-source.png'));
  }
  const dir=path.join(out,'native-samples'),records=JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8')).records;
  for(const row of records){
    await sharp(path.join(dir,row.vector)).resize((row.bbox[2]-row.bbox[0])*3,(row.bbox[3]-row.bbox[1])*3).png().toFile(path.join(dir,row.render));
  }
  console.log(JSON.stringify({glyphs:glyphs.length,nativeSamples:records.length,engine:'sharp/librsvg',installation:'none'}));
})().catch(e=>{console.error(e);process.exitCode=1});
