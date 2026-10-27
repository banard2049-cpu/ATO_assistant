const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
const root=path.resolve(__dirname,'..'),key=process.argv[2]||'c5-tile-001-front';
(async()=>{
 const files=['output/map-link-template-review-20261026/staged/','output/map-marker-hd-review-20261026/composition/staged/'].map(p=>path.join(root,p,key+'-corners.svg'));
 const data=await Promise.all(files.map(p=>sharp(p).ensureAlpha().raw().toBuffer()));
 let changed=0,transparent=0,visible=0,ext=[1024,1024,0,0];const grid={};
 for(let p=0;p<1024*1024;p++){let at=p*4;if(data[0].subarray(at,at+4).equals(data[1].subarray(at,at+4)))continue;changed++;if(!data[0][at+3]&&!data[1][at+3])transparent++;else{visible++;const x=p%1024,y=Math.floor(p/1024);ext=[Math.min(ext[0],x),Math.min(ext[1],y),Math.max(ext[2],x),Math.max(ext[3],y)];const k=Math.floor(x/128)+','+Math.floor(y/128);grid[k]=(grid[k]||0)+1}}
 console.log({key,changed,transparent,visible,ext,grid});
})();
