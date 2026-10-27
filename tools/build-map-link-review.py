"""Build the full experimental gallery. Deliberately has no install/apply option.

Writes only output/map-link-vector-review-20261025. Run inspect-map-links.py first.
Source SVGs and runtime registries are read only; the library is real paths,
not raster data inside SVG wrappers. Requires Pillow, NumPy, SciPy, scikit-image.
"""
from __future__ import annotations

import json
import hashlib
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image
import numpy as np

from map_link_vectors import ROOT, OUT, build_face, read_inventory


def face_job(row):
    pure, composite, pieces, cleanup = build_face(row)
    key = row['key']
    (OUT/'links'/f'{key}.svg').write_text(pure, encoding='utf-8')
    (OUT/'overlays'/f'{key}.svg').write_text(composite, encoding='utf-8')
    # Independent source-space cleanup bitmap is only QA evidence, never SVG content.
    Image.fromarray(cleanup.astype(np.uint8)*255).save(OUT/'qa-masks'/f'{key}.png')
    return dict(key=key, cycle=row['cycle'], face=row.get('face'), pieces=pieces,
                sourceSha256=row['sourceSha256'], vectorBytes=len(pure.encode('utf-8')),
                panels=len(row['panels']), arrows=len(row['arrows']),
                extras=sum(len(p['attachedExtras']) for p in row['panels']))


def gallery(report):
    rows = [{k:v for k,v in row.items() if k != 'pieces'} for row in report['records']]
    html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>地图链接指示物 · 全量矢量实验</title><style>
*{box-sizing:border-box}body{margin:0;background:#10191e;color:#e9f1f3;font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:32px 24px}h1{font-size:28px;margin:0 0 12px}p{color:#b5c8cf;max-width:1000px}header{border-bottom:1px solid #34515d;padding-bottom:20px}button,input,select{font:inherit;border:1px solid #456775;border-radius:7px;background:#1d333e;color:inherit;padding:8px 13px}button{cursor:pointer}button[aria-pressed=true]{background:#a8e2ce;color:#122b27}nav{display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:#10191ef5;padding:18px 0;z-index:2}input{min-width:140px;flex:1}#count{color:#a8e2ce}#gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,325px),1fr));gap:22px}article{border:1px solid #2a4754;border-radius:12px;overflow:hidden;background:#17272f}article h2{font-size:16px;margin:12px 14px 4px}article p{font-size:13px;margin:4px 14px 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:2px}.art{position:relative;aspect-ratio:1;background:#536166}.art img{position:absolute;width:100%;height:100%;inset:0;object-fit:contain}.art .caption{position:absolute;bottom:3px;left:4px;z-index:1;background:#10212bd9;font-size:11px;padding:2px 6px;border-radius:4px}.zoom{margin:0 14px 14px}a{color:#a8e2ce}.status{padding:10px 15px;background:#1b393b;border-left:3px solid #a8e2ce;border-radius:5px}dialog{background:#10191e;color:#e9f1f3;border:1px solid #456775;border-radius:12px;max-width:1400px;width:96vw;max-height:95vh;padding:18px}dialog::backdrop{background:#000c}.detail-pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}.detail-pair .art{min-width:0}#close{float:right}.files{overflow-wrap:anywhere}.pure{background:repeating-conic-gradient(#536166 0% 25%,#445057 0% 50%) 0/32px 32px}#mode{flex:none}@media(max-width:600px){main{padding:20px 12px}h1{font-size:23px}nav{gap:6px}button,input,select{padding:6px 10px}.detail-pair{grid-template-columns:1fr}dialog{padding:10px}#gallery{gap:14px}}
</style><main><header><h1>地图链接指示物 · 全量矢量实验</h1>
<p class="status">仅供检查 · 未替换游戏素材或接入正式地图</p>
<p>对照目前使用的底图和角标，单独将四边链接牌、箭头和紧邻附格转成 SVG 路径，并包含 C2 内部航路及 C3 特殊航路。保留源图的号码、派系、锁、河流、希腊字母及特殊布局；不根据邻接数据补造标记。本页采用源色区轮廓描摹和减色，另有原生几何重建样例可供比较。</p>
<p>当前共 <strong>__FACES__ 面 / __EDGES__ 块边缘链接牌 + __INTERNAL__ 块内部或特殊航路牌 / __ARROWS__ 个独立箭头 / __EXTRAS__ 个附格</strong>。左侧为当前正式资源，右侧为本次预览。源轮廓方案仍保留扫描造成的轻微歪斜，需放大检查细线和小字。</p>
<p><a href="native-samples/index.html">查看清晰几何重建样例</a> · <a href="report.json">生成报告</a> · <a href="inventory.json">全量库存</a> · <a href="regression-report.json">地图回归测试</a> · <a href="glyphs/index.html">原生与描摹图标对照</a></p></header>
<nav id="cycle"><button data-cycle="all" aria-pressed="true">全部</button><button data-cycle="c1">C1</button><button data-cycle="c2">C2</button><button data-cycle="c3">C3</button><button data-cycle="c4">C4</button><button data-cycle="c5">C5 A/B</button><input id="search" placeholder="搜索：编号、alt、front、back" aria-label="搜索地图"><select id="mode" aria-label="预览模式"><option value="map">整图对照</option><option value="links">仅链接路径</option></select></nav><p id="count"></p><div id="gallery"></div></main>
<dialog id="detail"><button id="close">关闭</button><h2 id="detail-title"></h2><div id="detail-body"></div></dialog>
<script>const rows=__ROWS__;let cycle='all';const gallery=document.querySelector('#gallery'),search=document.querySelector('#search'),mode=document.querySelector('#mode');
function art(r,variant,detail=false){const original=variant==='original',only=mode.value==='links'&&!original;let images=only?'':`<img alt="${r.key} 底图" src="../../map/images/hd1024/base/${r.key}.png">`;images+=`<img alt="${original?'当前':'实验'} ${r.key}" src="${only?'links/'+r.key+'.svg':original?'../../map/images/hd1024/overlay/'+r.key+'-corners.svg':'overlays/'+r.key+'.svg'}">`;return `<div class="art ${only?'pure':''}">${images}<span class="caption">${original?'当前':only?'仅路径':'实验'}</span></div>`}
function openDetail(key){const r=rows.find(r=>r.key===key);document.querySelector('#detail-title').textContent=key;document.querySelector('#detail-body').innerHTML=`<div class="detail-pair">${art(r,'original',true)}${art(r,'vector',true)}</div><p class="files"><a href="links/${key}.svg" target="_blank">纯路径 SVG</a> · <a href="overlays/${key}.svg" target="_blank">合成蒙版 SVG</a></p>`;document.querySelector('#detail').showModal()}
function render(){const q=search.value.trim().toLowerCase();const shown=rows.filter(r=>(cycle==='all'||r.cycle===cycle)&&(!q||r.key.includes(q)));document.querySelector('#count').textContent=`显示 ${shown.length} / ${rows.length} 面`;gallery.innerHTML=shown.map(r=>`<article data-key="${r.key}"><h2>${r.key}</h2><p>${r.panels} 块链接牌 · ${r.arrows} 箭头 · ${r.extras} 附格</p><div class="pair">${art(r,'original')}${art(r,'vector')}</div><p><a href="links/${r.key}.svg">纯路径 SVG</a></p><button class="zoom" data-key="${r.key}">放大对照</button></article>`).join('')}
document.querySelector('#cycle').addEventListener('click',e=>{const b=e.target.closest('[data-cycle]');if(!b)return;cycle=b.dataset.cycle;document.querySelectorAll('[data-cycle]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});search.addEventListener('input',render);mode.addEventListener('change',render);gallery.addEventListener('click',e=>{const b=e.target.closest('.zoom');if(b)openDetail(b.dataset.key)});document.querySelector('#close').onclick=()=>document.querySelector('#detail').close();render();</script></html>'''
    edges = sum(p['kind']=='panel' and p['direction'] in ('up','down','left','right') for r in report['records'] for p in r['pieces'])
    for key, value in [('FACES',report['faces']), ('EDGES',edges), ('INTERNAL',report['counts']['panels']-edges), ('ARROWS',report['counts']['arrows']), ('EXTRAS',report['counts']['extras'])]:
        html = html.replace('__'+key+'__', str(value))
    (OUT/'index.html').write_text(html.replace('__ROWS__',json.dumps(rows,ensure_ascii=False)),encoding='utf-8')


def main():
    for dirname in ('links','overlays','qa-masks','preview'):
        (OUT/dirname).mkdir(parents=True,exist_ok=True)
    inventory = read_inventory()
    records = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(face_job,row) for row in inventory['faces']]
        for future in as_completed(futures):
            records.append(future.result())
            if len(records)%50 == 0:
                print(f'{len(records)} / {len(futures)} faces',flush=True)
    records.sort(key=lambda r:r['key'])
    report = dict(version='20261025-links-source-contours1', installation='none',
                  method='Source colour-region paths, simplified subpixel contours; no inferred or retyped numbers.',
                  limitations=['Source scan skew and fine line irregularity remain.',
                               'Independent native glyph library is reference material, not substituted into these source contours.',
                               'Non-link artwork, including passwords and city labels, remains in the current source overlay.'],
                  faces=len(records), counts={name:sum(r[name] for r in records) for name in ('panels','arrows','extras')},
                  facesByCycle=dict(Counter(r['cycle'] for r in records)),
                  vectorBytes=sum(r['vectorBytes'] for r in records), records=records)
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    gallery(report)
    print(json.dumps({k:v for k,v in report.items() if k!='records'},ensure_ascii=False))


if __name__=='__main__':
    main()
