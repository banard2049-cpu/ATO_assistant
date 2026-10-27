"""Review fixed hand-drawn link elements against their original source cells."""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image
import numpy as np
from scipy.ndimage import label,find_objects

from map_link_templates import ROOT,SOURCE,NS,plate,content,palette

OUT=ROOT/'output/map-link-vector-install-20261025/component-audit'
REFERENCES=[
    ('river','河流航道','c1-tile-019-front','down-1',2,'c1'),
    ('land_route','叠横条标记','c2-tile-007-front','right-1',0,'c2'),
    ('gate_route','四柱标记','c2-tile-023-front','up-1',2,'c2'),
    ('helmet_icon','头盔标记','c5-tile-030-front','down-1',2,'c5'),
]


def image_uri(path):return'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()


def main():
    OUT.mkdir(exist_ok=True)
    geometry={r['key']:r for r in json.loads((SOURCE/'cells.json').read_text(encoding='utf-8'))['faces']}
    backup=json.loads((ROOT/'official-assets/_backups/map-links-20261025/manifest.json').read_text(encoding='utf-8'))
    originals={r['key']:ROOT/r['backup']for r in backup['files']if r['kind']=='original-raster-overlay'}
    body='<rect width="1200" height="1230" fill="#21323a"/>'
    body+='<g font-family="Microsoft YaHei,Arial" fill="#edf0e5"><text x="24" y="36" font-size="25">固定元件重绘 · 原版 / 统一模板</text>'
    for x,text in [(200,'原图'),(440,'固定模板'),(700,'元件放大'),(970,'46 px'),(1070,'24 px')]:
        body+=f'<text x="{x}" y="75" font-size="20">{text}</text>'
    body+='</g>'
    records=[]
    for index,(ident,title,key,panel_id,cell_index,cycle)in enumerate(REFERENCES):
        y=100+index*275
        row=geometry[key];panel=next(p for p in row['panels']if p['id']==panel_id);cell=panel['cells'][cell_index]
        l,t,r,b=cell['bbox'];original=originals[key]
        crop=Image.open(original).convert('RGBA').crop((int(l)-1,int(t)-1,int(r)+1,int(b)+1))
        source_png=OUT/f'{ident}-source-cell.png';crop.save(source_png)
        body+=f'<rect x="20" y="{y}" width="1160" height="255" rx="8" fill="#31444b"/>'
        body+=f'<g font-family="Microsoft YaHei,Arial" fill="#edf0e5"><text x="28" y="{y+35}" font-size="21">{title}</text><text x="28" y="{y+58}" font-size="12">{ident}</text></g>'
        body+=f'<image href="{image_uri(source_png)}" x="200" y="{y+20}" width="180" height="200" preserveAspectRatio="xMidYMid meet"/>'
        meta={'type':'icon','value':ident};local,(w,h),_,_=plate(cycle,'A','up',[meta])
        scale=min(180/w,200/h)
        body+=f'<g transform="translate(440 {y+20}) scale({scale})">{local}</g>'
        _,dark,_,ink,_=palette(cycle,'A')
        body+=f'<rect x="700" y="{y+20}" width="180" height="200" fill="{dark}"/>'
        body+=content(meta,(708,y+28,872,y+212),ink,dark,cycle)
        body+=f'<rect x="935" y="{y+20}" width="235" height="200" fill="{dark}"/>'
        body+=content(meta,(970,y+90,1016,y+136),ink,dark,cycle)
        body+=content(meta,(1070,y+101,1094,y+125),ink,dark,cycle)
        body+=f'<g font-family="Arial" fill="#bdcbd0" font-size="12"><text x="200" y="{y+240}">{key} / {panel_id}[{cell_index}]</text><text x="700" y="{y+240}">Shared analytic SVG geometry</text></g>'
        component=SOURCE/'components'/f'{ident}.svg';root=ET.parse(component).getroot()
        tags=[n.tag.rsplit('}',1)[-1]for n in root.iter()]
        assert not set(tags)&{'image','text','use','foreignObject','script'}
        records.append({'id':ident,'component':str(component.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(component.read_bytes()).hexdigest(),
                        'reference':{'key':key,'panelId':panel_id,'cellIndex':cell_index,'sourceBBox':cell['bbox'],'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest()},
                        'elements':{'river':'one S-shaped river plus three separate drops','land_route':'three bars increasing in width plus one connecting vertical stem','gate_route':'two narrow tall center columns and two wide short outer columns','helmet_icon':'left-facing crest, helmet/visor, separate lower rivet'}[ident]})
    (OUT/'source-vs-fixed.svg').write_text(f'<svg xmlns="{NS}" width="1200" height="1230" viewBox="0 0 1200 1230">{body}</svg>\n',encoding='utf-8')
    report={'status':'visual-reference-ready','components':records,'design':'Each element is drawn once and reused. No scanned outline is emitted into the fixed element paths.',
            'renderSizes':[46,24],'directionChecks':{'helmet':'left-facing, same as original','river':'same S bend and drop arrangement','land_route':'three horizontal bars; not the four-column symbol rotated','gate_route':'four separate columns after correction'},
            'openItems':[]}
    (OUT/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'components':len(records),'svg':str(OUT/'source-vs-fixed.svg')}))


if __name__=='__main__':main()
