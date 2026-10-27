/* Independent native-size rendering audit, without runtime or source writes.
 * Glyph ROIs were measured in the original 1024px source scans. Bounding boxes
 * below are sampling windows, not expected vector bounds. Actual visible ink
 * is measured from source PNGs and independently rendered SVG pixels.
 * The padlock logo keeps source size, but is intentionally centered on its disc
 * per user correction; its old source offset is not an expected position.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const root=path.resolve(__dirname,'..');
const output=path.join(root,'output/map-link-vector-review-20261025/native-samples');
const report=JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(output,'..','inventory.json'),'utf8'));
const faces=new Map(inventory.faces.map(row=>[row.key,row]));
const windows=[
  ['c2-tile-019-front','left-1','lock',[294,488,342,536]],
  ['c2-tile-021-front','up-1','lock',[633,92,681,140]],
  ['c5-tile-040-front','up-1','alpha',[600,88,647,138]],
  ['c5-tile-040-front','left-1','beta',[215,486,269,535]],
  ['c5-tile-040-front','down-1','beta',[485,886,538,935]],
  ['c5-tile-040-front','down-2','alpha',[781,886,835,935]],
  ['c5-tile-040-back','left-1','beta',[224,477,277,536]],
  ['c5-tile-040-back','down-1','beta',[563,885,616,934]],
  ['c2-tile-021-front','up-1','alpha',[560,91,610,141]],
  ['c2-tile-021-front','right-1','alpha',[752,488,800,536]],
  ['c2-tile-021-front','left-1','alpha',[214,489,270,537]],
  ['c2-tile-021-front','down-1','beta',[584,884,635,934]],
];

async function rgba(file){
  const image=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(image.info.channels,4,file);
  return image;
}

function maskInWindow(image,origin,box,bright){
  const [l,t,r,b]=box,w=r-l,h=b-t;
  const result=new Uint8Array(w*h);
  for(let y=t;y<b;y++)for(let x=l;x<r;x++){
    const xx=x-origin[0],yy=y-origin[1];
    assert(xx>=0&&yy>=0&&xx<image.info.width&&yy<image.info.height,'ROI outside rendered SVG');
    const p=(yy*image.info.width+xx)*4;
    const lum=.299*image.data[p]+.587*image.data[p+1]+.114*image.data[p+2];
    result[(y-t)*w+x-l]=bright?(image.data[p+3]>180&&lum>180):(image.data[p+3]>100);
  }
  return {data:result,w,h,box};
}

function inkBounds(mask,largest){
  const {data,w,h,box}=mask;
  let selected=data;
  if(largest){
    const visited=new Uint8Array(data.length);let best=[];
    for(let seed=0;seed<data.length;seed++){
      if(!data[seed]||visited[seed])continue;
      const queue=[seed];visited[seed]=1;
      for(let head=0;head<queue.length;head++){
        const p=queue[head],x=p%w,y=Math.floor(p/w);
        for(const n of [x>0?p-1:-1,x+1<w?p+1:-1,y>0?p-w:-1,y+1<h?p+w:-1]){
          if(n>=0&&data[n]&&!visited[n]){visited[n]=1;queue.push(n)}
        }
      }
      if(queue.length>best.length)best=queue;
    }
    assert(best.length>12,'No substantial glyph ink inside sampling window');
    selected=new Uint8Array(data.length);for(const p of best)selected[p]=1;
  }
  let l=w,t=h,r=0,b=0,pixels=0;
  for(let p=0;p<selected.length;p++)if(selected[p]){
    const x=p%w,y=Math.floor(p/w);l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);pixels++;
  }
  assert(pixels>0,'Empty rendered ink');
  return {bbox:[l+box[0],t+box[1],r+box[0],b+box[1]],pixels};
}

function dims(box){return [box[2]-box[0],box[3]-box[1]]}
function center(box){return [(box[0]+box[2])/2,(box[1]+box[3])/2]}
function attrs(text){return Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]))}

(async()=>{
  const sources=new Map(),vectors=new Map(),svgs=new Map();
  for(const row of report.records){
    if(!sources.has(row.key))sources.set(row.key,await rgba(path.resolve(root,faces.get(row.key).source)));
    vectors.set(row.id,await rgba(path.join(output,row.vector)));
    svgs.set(row.id,fs.readFileSync(path.join(output,row.vector),'utf8'));
  }
  const glyphs=[];
  for(const [key,panelId,kind,window]of windows){
    const row=report.records.find(row=>row.key===key&&row.panelId===panelId);assert(row);
    const source=inkBounds(maskInWindow(sources.get(key),[0,0],window,true),true);
    const vector=inkBounds(maskInWindow(vectors.get(row.id),row.bbox,window,true),true);
    const sizeError=dims(vector.bbox).map((v,i)=>v-dims(source.bbox)[i]);
    assert(sizeError.every(e=>Math.abs(e)<=1),`${row.id} ${kind} size differs from source: ${sizeError}`);
    const record={id:row.id,kind,sourceInkBBox:source.bbox,renderedInkBBox:vector.bbox,
                  sourceSize:dims(source.bbox),renderedSize:dims(vector.bbox),sizeError};
    if(kind==='lock'){
      const discs=[...svgs.get(row.id).matchAll(/<circle\b([^>]+)>/g)].map(m=>attrs(m[1])).filter(a=>a['data-marker']==='restricted-disc');
      assert.equal(discs.length,1,'Expected exactly one backing disc');
      const discCenter=[Number(discs[0].cx),Number(discs[0].cy)];
      const actualCenter=center(vector.bbox),centerError=actualCenter.map((v,i)=>v-discCenter[i]);
      assert(centerError.every(e=>Math.abs(e)<=.5),`${row.id} padlock is off center: ${centerError}`);
      Object.assign(record,{positionPolicy:'Center logo ink on backing disc; keep source dimensions.',
                            discCenter,renderedInkCenter:actualCenter,centerError,
                            sourceOffsetFromDisc:center(source.bbox).map((v,i)=>v-discCenter[i])});
    }else{
      const edgeError=vector.bbox.map((v,i)=>v-source.bbox[i]);
      assert(edgeError.every(e=>Math.abs(e)<=1),`${row.id} ${kind} position differs from source: ${edgeError}`);
      Object.assign(record,{edgeError});
    }
    glyphs.push(record);
  }
  const arrows=[];
  for(const row of report.records)for(const part of faces.get(row.key).arrows){
    if(part.panelId!==row.panelId)continue;
    const [l,t,r,b]=part.bbox,window=[l-3,t-3,r+3,b+3];
    const sourceMask=maskInWindow(sources.get(row.key),[0,0],window,false);
    const vectorMask=maskInWindow(vectors.get(row.id),row.bbox,window,false);
    const source=inkBounds(sourceMask,false),vector=inkBounds(vectorMask,false);
    const edgeError=vector.bbox.map((v,i)=>v-source.bbox[i]);
    assert(edgeError.every(e=>Math.abs(e)<=1),`${row.id} arrow position or size differs: ${edgeError}`);
    let intersection=0,union=0;
    sourceMask.data.forEach((s,i)=>{intersection+=!!(s&&vectorMask.data[i]);union+=!!(s||vectorMask.data[i])});
    arrows.push({id:row.id,direction:part.direction,sourceBBox:source.bbox,renderedBBox:vector.bbox,
                 sourceSize:dims(source.bbox),renderedSize:dims(vector.bbox),edgeError,silhouetteIoU:intersection/union});
  }
  assert.equal(glyphs.filter(g=>g.kind==='lock').length,report.records.filter(r=>r.lock).length);
  assert.equal(glyphs.filter(g=>g.kind!=='lock').length,report.records.flatMap(r=>r.cells).filter(c=>c.kind==='greek').length);
  assert.equal(arrows.length,report.records.reduce((n,r)=>n+r.arrows,0));
  const result={status:'passed',method:'Independent sharp/librsvg rendering at original pixel size; source brightness components measured separately.',
    installation:'none',samples:report.records.length,lockLogos:2,greekGlyphs:10,arrows:arrows.length,
    maximumSizeError:Math.max(...glyphs.flatMap(g=>g.sizeError.map(Math.abs))),
    maximumLockCenterError:Math.max(...glyphs.filter(g=>g.kind==='lock').flatMap(g=>g.centerError.map(Math.abs))),
    maximumGreekOrArrowEdgeError:Math.max(...glyphs.filter(g=>g.kind!=='lock').flatMap(g=>g.edgeError.map(Math.abs)),...arrows.flatMap(a=>a.edgeError.map(Math.abs))),
    minimumArrowSilhouetteIoU:Math.min(...arrows.map(a=>a.silhouetteIoU)),glyphs,arrows};
  fs.writeFileSync(path.join(output,'size-check.json'),JSON.stringify(result,null,2)+'\n');
  const historical=path.join(output,'size-audit-source.json');
  if(fs.existsSync(historical)){
    const old=JSON.parse(fs.readFileSync(historical,'utf8'));
    old.status='historical-before-lock-centering';old.supersededBy='size-check.json';
    old.note='This earlier report measured source-positioned padlocks. The user subsequently requested centered lock logos; use size-check.json for the current result.';
    fs.writeFileSync(historical,JSON.stringify(old,null,2)+'\n');
  }
  console.log(JSON.stringify({...result,glyphs:undefined,arrows:arrows.length}));
})().catch(error=>{console.error(error);process.exitCode=1});
