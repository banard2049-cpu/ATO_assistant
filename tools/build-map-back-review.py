"""Build the browsable full replacement gallery from installed map assets."""
from pathlib import Path
import json
import shutil
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-asset-kit-20261024'
report=json.loads((OUT/'full-back-report.json').read_text(encoding='utf-8'))
report['cards'].sort(key=lambda r:(r['cycle'],r['key'].split('-')[2],r.get('face','')))
if not (OUT/'samples.html').exists():
    shutil.copy2(OUT/'index.html',OUT/'samples.html')
page='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="../../map/"><title>ATO 普通卡背 · 全量矢量替换</title><link rel="stylesheet" href="styles.css"><style>
:root{color-scheme:dark;font:15px/1.6 "Microsoft YaHei",sans-serif;background:#11191e;color:#edf2ed}body{margin:0;background:#11191e}main{max-width:1700px;margin:auto;padding:28px 24px 60px}h1{margin:0 0 8px;font-size:28px}p{color:#adbec1;margin:0 0 18px}.toolbar{position:sticky;top:0;z-index:10;background:#11191ef5;display:flex;flex-wrap:wrap;gap:10px;padding:14px 0;align-items:center}button,input{font:inherit;border:1px solid #42565c;background:#1c2b31;color:#e6efea;border-radius:6px;padding:8px 14px}button{cursor:pointer}button[aria-pressed="true"]{background:#b6c8a7;color:#152020}input{width:210px}#count{margin-left:auto;color:#afc0bd}.gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px 16px}article{min-width:0}h2{font-size:15px;margin:0 0 8px}a{color:#bfddcb;text-decoration:none}.tile-image{position:relative;aspect-ratio:1;width:100%;overflow:hidden;border-radius:4px}.tile-artwork-stack{display:block;width:100%;height:100%}.download{font-size:12px;display:block;margin-top:6px;color:#8ea99f}.empty{grid-column:1/-1;padding:40px;text-align:center}.links{display:flex;gap:20px;margin-bottom:8px}#dialog{width:min(90vw,900px);padding:15px;border:1px solid #64716a;border-radius:8px;background:#11191e}#dialog::backdrop{background:#000b}#dialog .tile-image{max-height:78vh;max-width:78vh;margin:auto}#close{float:right}.modal-title{margin:8px 0 12px}@media(max-width:1050px){.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){main{padding:20px 12px}.gallery{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 10px}h1{font-size:22px}.toolbar{gap:6px}button{padding:6px 10px}input{width:170px}#count{width:100%;margin:0}}
</style></head><body><main><h1>普通卡背 · 全量矢量替换</h1><p>已接入地图：C1–C4 共 344 张，C5 A/B 面覆盖牌背 160 个。7 张特殊版本保持原样。C1 牛头、迷宫标记已缩小并左移。</p><div class="links"><a href="../output/map-asset-kit-20261024/ATO-map-back-vectors-20261024.zip" download>下载全量标记包</a><a href="../output/map-asset-kit-20261024/full-back-report.json" target="_blank">查看替换清单</a></div><div class="toolbar"><button data-cycle="c1" aria-pressed="true">C1 · 87</button><button data-cycle="c2">C2 · 84</button><button data-cycle="c3">C3 · 92</button><button data-cycle="c4">C4 · 81</button><button data-cycle="c5">C5 · 160</button><button data-cycle="all">全部 · 504</button><input id="search" placeholder="搜索编号，如 027、T00" aria-label="搜索卡背编号"><span id="count"></span></div><div id="gallery" class="gallery"></div><dialog id="dialog"><button id="close">关闭</button><h2 class="modal-title"></h2><div class="modal-art"></div></dialog></main>
<script src="tile-artwork-data.js"></script><script src="tile-back-data.js?v=20261024-vector-backs1"></script><script src="c5-heading-data.js?v=20261024-vector-backs1"></script><script src="tile-artwork.js?v=20261024-vector-backs1"></script><script>
const rows=__ROWS__;
let cycle='c1';
const gallery=document.getElementById('gallery');
function label(r){return r.cycle.toUpperCase()+' · '+r.key.split('-')[2]+(r.face?' · '+r.face+' 面':'');}
function markup(r){return r.cycle==='c5'?ATO_MAP_ARTWORK.coverMarkup('./images/'+r.key.replace(/-cover$/,'')+'.png',r.key.split('-')[2]):ATO_MAP_ARTWORK.markup('./images/'+r.key+'.png',r.key.split('-')[2]);}
function render(){const q=document.getElementById('search').value.trim().toLowerCase();const visible=rows.filter(r=>(cycle==='all'||r.cycle===cycle)&&(!q||label(r).toLowerCase().includes(q)));document.getElementById('count').textContent='显示 '+visible.length+' / 504';gallery.innerHTML=visible.map(r=>'<article data-key="'+r.key+'"><h2>'+label(r)+'</h2><a href="#" class="zoom" aria-label="放大 '+label(r)+'"><div class="tile-image">'+markup(r)+'</div></a><a class="download" href="'+r.source+'" target="_blank">查看标记 SVG ↗</a></article>').join('')||'<p class="empty">没有匹配的编号</p>';}
document.querySelectorAll('[data-cycle]').forEach(b=>b.addEventListener('click',()=>{cycle=b.dataset.cycle;document.querySelectorAll('[data-cycle]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));document.getElementById('search').addEventListener('input',render);
gallery.addEventListener('click',e=>{if(!e.target.closest('.zoom'))return;e.preventDefault();const r=rows.find(r=>r.key===e.target.closest('article').dataset.key);document.querySelector('.modal-title').textContent=label(r);document.querySelector('.modal-art').innerHTML='<div class="tile-image">'+markup(r)+'</div>';document.getElementById('dialog').showModal();});document.getElementById('close').onclick=()=>document.getElementById('dialog').close();ATO_MAP_ARTWORK.bind(gallery);render();
</script></body></html>'''
page=page.replace('</style>','h1,h2,body{color:#edf2ed}</style>').replace('C1 牛头、迷宫标记已缩小并左移。','C1 牛头、迷宫及 C2/C3 单派系标记已缩小并左移。').replace('__ROWS__',json.dumps(report['cards'],ensure_ascii=False,separators=(',',':')))
page=page.replace('20261024-vector-backs1',report['version'])
page=page.replace('C1 牛头、迷宫及 C2/C3 单派系标记已缩小并左移。','C1 牛头、迷宫及 C2/C3 单派系标记已缩小并左移。C5 标记仅左移，大小保持。')
(OUT/'index.html').write_text(page,encoding='utf-8')
with zipfile.ZipFile(OUT/'ATO-map-back-vectors-20261024.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted((ROOT/'map/images/card-backs/vectors').glob('*.svg')):z.write(p,p.relative_to(ROOT))
    for p in sorted((ROOT/'tools/map-back-vector-source').glob('*')):z.write(p,p.relative_to(ROOT))
    for p in ['map/tile-back-data.js','map/c5-heading-data.js','map/tile-artwork.js','tools/build-map-back-vectors.py','output/map-asset-kit-20261024/full-back-report.json']:
        z.write(ROOT/p,p)
print('Built 504-card gallery and vector asset package.')
