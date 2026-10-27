/* Independent SVG rendering and pixel preservation for preview composites. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-link-vector-review-20261025/placement-review');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'placement-manifest.json'),'utf8'));
(async()=>{
  let next=0,done=0;
  async function worker(){while(next<manifest.assets.length){const item=manifest.assets[next++];await sharp(path.join(out,item.svg),{density:72*item.width/1024}).png().toFile(path.join(out,item.png));done++;if(done%10===0)console.log(`Rendered ${done}/${manifest.assets.length}`)}}
  await Promise.all([worker(),worker()]);
  const checks=[];
  for(const face of manifest.faces){
    const [before,after,mask]=await Promise.all([
      sharp(path.join(out,`renders/${face.key}-current.png`)).resize(1024,1024).ensureAlpha().raw().toBuffer({resolveWithObject:true}),
      sharp(path.join(out,`renders/${face.key}-preview.png`)).resize(1024,1024).ensureAlpha().raw().toBuffer({resolveWithObject:true}),
      sharp(path.join(out,`qa-masks/${face.key}.png`)).greyscale().raw().toBuffer(),
    ]);
    let changed=0,protectedChanged=0,maxProtectedChannelError=0;
    for(let p=0;p<1024*1024;p++){
      let difference=0;for(let c=0;c<4;c++)difference=Math.max(difference,Math.abs(before.data[p*4+c]-after.data[p*4+c]));
      if(difference>2)changed++;
      if(!mask[p]){maxProtectedChannelError=Math.max(maxProtectedChannelError,difference);if(difference>2)protectedChanged++}
    }
    assert(changed>100,face.key+': expected visible native-link edits');
    assert.equal(protectedChanged,0,face.key+': artwork outside audited edit areas changed');
    checks.push({key:face.key,changedPixels:changed,protectedPixelsChanged:protectedChanged,maxProtectedChannelError,nativePanels:face.samples.length});
  }
  const report={status:'passed',installation:'none',renderer:'Sharp/librsvg',renderedAssets:manifest.assets.length,nativeFaces:checks.length,nativePanels:37,protectedPixelsChanged:0,checks};
  fs.writeFileSync(path.join(out,'render-check.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,checks:undefined}));
})().catch(error=>{console.error(error);process.exitCode=1});
