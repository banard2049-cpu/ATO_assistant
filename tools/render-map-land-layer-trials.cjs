const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-marker-hd-review-20261026/land-layer-trials');
(async()=>{const inputs=JSON.parse(fs.readFileSync(path.join(out,'inputs.json'),'utf8'));for(const row of inputs.rows){
 await sharp(path.join(root,'map/images/hd1024/overlay',row.key+'-corners.svg')).png().toFile(path.join(out,row.key+'-v5.png'));
 for(const name of Object.keys(inputs.candidates))await sharp(path.join(out,row.key+'-'+name+'.svg')).png().toFile(path.join(out,row.key+'-'+name+'.png'));
}console.log('Rendered 3 original-position candidates on 3 current faces.');})().catch(e=>{console.error(e);process.exitCode=1});
