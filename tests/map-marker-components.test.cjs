const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=path.join(root,'tools/map-marker-vector-source'),out=path.join(root,'output/map-marker-hd-review-20261026/composition');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const attrs=(s,n)=>[...s.matchAll(new RegExp(` ${n}="([^"]*)"`,'g'))].map(m=>m[1]);
const canonical=s=>s.replace(/\s+xmlns(?::\w+)?="[^"]*"/g,'').replace(/\s*\/>/g,'/>').replace(/>\s+</g,'><').trim();
function group(s,flag,value='true'){
  const start=new RegExp(`<g\\b[^>]* ${flag}="${value}"[^>]*>`).exec(s);assert.ok(start,flag);
  const tags=/<\/?g\b[^>]*>/g;tags.lastIndex=start.index;let depth=0;
  for(let m;(m=tags.exec(s));){depth+=m[0].startsWith('</')?-1:m[0].endsWith('/>')?0:1;if(!depth)return s.slice(start.index,tags.lastIndex)}
  assert.fail('Unclosed '+flag);
}
const inner=s=>s.slice(s.indexOf('>')+1,s.lastIndexOf('</'));

test('Titan revision keeps all 123 centered and both alpha placements share the same font outline',()=>{
  const revision=json(path.join(root,'output/map-marker-hd-review-20261026/titan-alpha-review/revision-check.json'));
  assert.equal(revision.status,'passed');assert.equal(revision.titanInstances,123);
  assert.equal(revision.allUnaffectedComponentsIdentical,true);assert.equal(revision.alphaAspect,'25:22');
  const paths=new Set();let inside=0,links=0;
  for(const [directory,filename]of[[source,'production.json'],[path.join(root,'tools/map-link-vector-source'),'production.json']]){
    const production=json(path.join(directory,filename));
    for(const row of Object.values(production.faces)){
      const svg=fs.readFileSync(path.join(directory,row.vector),'utf8');
      for(const start of svg.matchAll(/<g\b[^>]* data-shared-alpha="map-alpha-25x22"[^>]*>/g)){
        const body=group(svg.slice(start.index),'data-shared-alpha','map-alpha-25x22');
        for(const path of attrs(body,'d'))paths.add(path);
        if(directory===source)inside++;else links++;
      }
    }
  }
  assert.equal(paths.size,1);assert.equal(inside,36);assert.ok(links>0);
});

test('every map consumer refreshes the artwork registry to the installed component version',()=>{
  const production=json(path.join(source,'production.json'));
  for(const relative of['map/index.html','briefing/index.html','tools/tag-editor.html']){
    const html=fs.readFileSync(path.join(root,relative),'utf8');
    assert.equal(html.match(/tile-artwork-data\.js\?v=([^"\s]+)/)[1],production.version,relative);
  }
});

test('all independent map markers and hidden numbers use complete fixed components',()=>{
  const p=json(path.join(source,'production.json')),layout=json(path.join(out,'backing-layouts.json'));
  assert.equal(p.method,'shared-fixed-elements');assert.equal(Object.keys(p.faces).length,511);
  for(const[file,expected]of Object.entries(p.inputSha256))assert.equal(sha(fs.readFileSync(path.join(root,file))),expected,file);
  const types=new Map();let markers=0,hidden=0;
  for(const row of layout.faces){
    const meta=p.faces[row.key],bytes=fs.readFileSync(path.join(source,meta.vector));assert.equal(sha(bytes),meta.sha256,row.key);
    const svg=bytes.toString('utf8');
    assert.doesNotMatch(svg,/data-pending-emblem|data-preview-only|source-ink|NaN|Infinity|redraw\//,row.key);
    assert.deepEqual(attrs(svg,'data-marker-instance').sort(),row.markers.map(m=>m.id).sort(),row.key);
    assert.deepEqual(attrs(svg,'data-hidden-number').sort(),row.hiddenNumbers.map(n=>n.text).sort(),row.key);
    for(const m of row.markers)types.set(m.variantId||m.type,(types.get(m.variantId||m.type)||0)+1);
    markers+=row.markers.length;hidden+=row.hiddenNumbers.length;
  }
  assert.equal(markers,595);assert.equal(hidden,11);
  assert.equal(types.get('wild_titan'),123);assert.equal(types.get('wheel_icon'),2);assert.equal(types.get('wheel_icon_winged'),2);
  assert.equal(types.get('greek_alpha'),36);assert.equal(types.get('greek_beta'),40);assert.equal(types.get('secret_number_banner'),14);
});

test('installed marker layers equal reviewed components and keep links, original source and backups',()=>{
  const p=json(path.join(source,'production.json')),installation=json(path.join(out,'installation.json'));
  const backup=json(path.join(root,installation.backup)),saved=new Map(backup.files.map(r=>[r.source,r]));
  const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(root,'map/tile-artwork-data.js'),'utf8'),context);
  assert.equal(context.window.ATO_MAP_ARTWORK_DATA.cornerVectorVersion,p.version);
  assert.equal(installation.records.length,511);
  for(const r of installation.records){
    const filename=`map/images/hd1024/overlay/${r.key}-corners.svg`,bytes=fs.readFileSync(path.join(root,filename));assert.equal(sha(bytes),r.sha256,r.key);
    const svg=bytes.toString('utf8'),layer=group(svg,'data-map-markers');
    const pure=fs.readFileSync(path.join(source,p.faces[r.key].vector),'utf8');
    assert.equal(canonical(inner(layer)),canonical(inner(pure)),r.key);
    assert.equal(attrs(svg,'data-map-markers').length,1,r.key);assert.equal(attrs(svg,'data-map-links').length,1,r.key);
    assert.equal(attrs(svg,'data-remove').filter(x=>x==='remaining-markers').length,1,r.key);
    const before=saved.get(filename);assert.ok(before,r.key);const old=fs.readFileSync(path.join(root,before.backup));assert.equal(sha(old),before.sha256,r.key);
    const retained=s=>s.match(/<g mask="url\(#keep\)">[\s\S]*?<\/g>/)[0];
    assert.equal(canonical(retained(svg)),canonical(retained(old.toString('utf8'))),r.key);
    const ids=attrs(svg,'id');assert.equal(new Set(ids).size,ids.length,`duplicate id ${r.key}`);
  }
});
