// Rasterize installed SVGs for read-only source comparisons.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/map-marker-hd-review-20261026/special-route-audit');
(async()=>{const rows=JSON.parse(fs.readFileSync(path.join(out,'inputs.json'),'utf8'));fs.mkdirSync(path.join(out,'current'),{recursive:true});
const sources=new Map(rows.map(r=>[r.key,r.current]));for(const[key,file]of sources)await sharp(path.join(root,file)).png().toFile(path.join(out,'current',key+'.png'));
console.log(JSON.stringify({installedFacesRendered:sources.size}));})().catch(e=>{console.error(e);process.exitCode=1});
