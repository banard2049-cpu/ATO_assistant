"""Approved corner geometry shared by production and visual review builders."""
from pathlib import Path
import base64
import copy
import importlib.util
import json
import re
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(__file__).with_name('map-corner-vector-source')
HD=ROOT/'map/images/hd1024'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
spec=importlib.util.spec_from_file_location('back_vectors',ROOT/'tools/build-map-back-vectors.py')
native=importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
inventory=json.loads((SOURCE/'inventory.json').read_text(encoding='utf-8'))
c1_outlines=json.loads((SOURCE/'c1-faction-outlines.json').read_text(encoding='utf-8'))
c5_headings=native.read_js(ROOT/'map/c5-heading-data.js')
names={'hornsworn':'誓角者','minoans':'牛头','labyrinthians':'迷宫','cyclopes':'独眼巨人','helots':'锁链','symmachy':'同盟',
       'sunheirs':'太阳','delphians':'德尔斐人','twilightwatch':'日暮守望者','aristotelians':'亚里士多德学派','cloudthieves':'窃云者','wasters':'废土者',
       'outcastvanguard':'放逐者先锋','followersofarete':'阿瑞忒追随者','cycladeanprotectorate':'基克拉泽斯保护国','river':'河流航道'}
palettes={'c1':('#eeeade','#66685b','#31352f'),'c2':('#71332f','#b94b43','#f4eee7'),
          'c3':('#46475d','#777ca0','#f6f5ed'),'c4':('#35372e','#a28b56','#f7f5e9'),
          'c5':('#7b8e99','#29343a','#f6f7ee')}
# C5 reverses the panel contrast on its B face: dark blue-grey with light lines.
# Backgrounds are the median sampled from the 80 original panels on each face.
c5_face_palettes=native.C5_PALETTES


def norm(f):return 'minoans' if f=='minoians' else f.lower()


def right_markers(row):
    ids=[norm(f) for f in row['factions']]
    number=row['key'].split('-')[2]
    tags=native.TAGS.get(f'{row["cycle"]}:{number}',{}).get('tags',[])
    if row['cycle']=='c1' and 'river' in tags:ids.insert(0,'river')
    return ids


def original_overlay(key):
    """Read archived raster sources without keeping duplicates in runtime assets."""
    relative=Path('map/images/hd1024/overlay')/f'{key}.png'
    official_backup=ROOT/'official-assets/_backups/map-links-20261025/originals'/relative
    if official_backup.is_file():return official_backup
    archived=ROOT/'output/map-originals-backup-20261024'/relative
    return archived if archived.is_file() else ROOT/relative


def uri(p):
    if p.parent==HD/'overlay' and p.suffix=='.png':p=original_overlay(p.stem)
    return 'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()


def image(p):return f'<image href="{uri(p)}" width="1024" height="1024"/>'


def svg(body,w,h,view=None):
    return f'<svg xmlns="{NS}" width="{w}" height="{h}" viewBox="{view or f"0 0 {w} {h}"}">{body}</svg>'


def heading_mask(row):
    """Remove only C5's own top number plate; retain nearby route labels."""
    if row['cycle']!='c5':return ''
    l,t,r,b=c5_headings[row['key']]['header']
    return f'<rect data-remove="heading" x="{l-3}" y="{t-3}" width="{r-l+6}" height="{b-t+6}" fill="black"/>'


def frame(w,h,cycle,side,face='A'):
    bg,rim,ink=c5_face_palettes[face] if cycle=='c5' else palettes[cycle]
    # One outer edge and one inner line, with a single square return at each corner.
    # The corner return is part of the inner line, not an extra border or spiral.
    # Square cut-ins remain visibly concave even with the heavier outer stroke.
    edge,notch=1.5,6
    points=[(notch,edge),(w-notch,edge),(w-notch,notch),(w-edge,notch),
            (w-edge,h-notch),(w-notch,h-notch),(w-notch,h-edge),(notch,h-edge),
            (notch,h-notch),(edge,h-notch),(edge,notch),(notch,notch)]
    points=' '.join(f'{x:g},{y:g}' for x,y in points)
    body=f'<polygon data-frame="outer" points="{points}" fill="{bg}" stroke="{rim}" stroke-width="2.6" stroke-linejoin="miter"/>'
    inner=(f'M9 5H{w-9}V14H{w-14}V9H{w-5}'
           f'V{h-9}H{w-14}V{h-14}H{w-9}V{h-5}'
           f'H9V{h-14}H14V{h-9}H5'
           'V9H14V14H9Z')
    body+=f'<path data-frame="inner" d="{inner}" fill="none" stroke="{rim}" stroke-width="1.8" stroke-linejoin="miter"/>'
    return body,bg,ink


def marker(kind,box):
    source=SOURCE/f'{kind}.svg'
    r=ET.parse(source).getroot()
    l,t,rr,b=box
    r.set('x',str(l));r.set('y',str(t));r.set('width',str(rr-l));r.set('height',str(b-t))
    r.set('preserveAspectRatio','xMidYMid meet')
    r.set('data-marker',kind)
    # Progress/calamity keep their earlier native black/white artwork and backing.
    return ET.tostring(r,encoding='unicode')


def faction_mark(ident,box,cycle,ink,bg):
    if cycle=='c1' and ident=='labyrinthians':
        l,t,r,b=box
        cx,cy=(l+r)/2,(t+b)/2
        box=(cx+(l-cx)*1.06,cy+(t-cy)*1.06,cx+(r-cx)*1.06,cy+(b-cy)*1.06)
    # The cyclops eye has an opaque black interior in the original artwork.
    icon_bg='#191919' if ident=='cyclopes' else bg
    icon=native.faction(ident,box,ink,icon_bg,stretch_x=1.12 if ident=='twilightwatch' else 1)
    if cycle!='c1':return icon
    # A continuous light backing goes under the native C1 artwork. It also
    # fills the spaces between the hornsworn bands and inside the labyrinth.
    transform=ET.fromstring(icon).get('transform')
    scale=float(re.findall(r'-?\d+(?:\.\d+)?',transform)[0])
    outline=c1_outlines[ident]
    if 'circle' in outline:
        shape='circle '+ ' '.join(f'{key}="{value:.8f}"' for key,value in outline['circle'].items())
    else:
        shape=f'path d="{outline["path"]}"'
    edge=f'<{shape} fill="#faf9f3" stroke="#b5b5a7" stroke-width="{7.2/scale:.8f}" stroke-linejoin="round"/>'
    backing=f'<{shape} fill="#faf9f3" stroke="#faf9f3" stroke-width="{6/scale:.8f}" stroke-linejoin="round"/>'
    return f'<g data-faction-outline="{ident}" transform="{transform}">{edge}{backing}</g>'+icon


def panel(row,side):
    l,t,r,b=row['corners'][side]['bbox'];w,h=r-l,b-t
    body,bg,ink=frame(w,h,row['cycle'],side,row['face'])
    if side=='right':
        ids=right_markers(row)
        slot=(w-24)/len(ids)
        for i,f in enumerate(ids):
            box=(13+i*slot,16,11+(i+1)*slot,h-15)
            if 'river' in ids:
                box=(13,16,w/2-3,h-15) if i==0 else (w/2+9,16,w-9,h-15)
            if f=='river':
                l,t,r,b=box;cx,cy=(l+r)/2,(t+b)/2
                box=(cx+(l-cx)*.94,cy+(t-cy)*.94,cx+(r-cx)*.94,cy+(b-cy)*.94)
                body+=marker(f,box)
            else:
                body+=faction_mark(f,box,row['cycle'],ink,bg)
        label=' + '.join(names[f] for f in ids)
    else:
        order=list(row['left'])
        if row['cycle'] in ('c1','c3') and row['left']=='PD':order=['D','P']
        slot=(w-24)/len(order)
        for i,code in enumerate(order):
            body+=marker('progress' if code=='P' else 'calamity',(13+i*slot,12,11+(i+1)*slot,h-12))
        label=' + '.join('进展／希望' if code=='P' else '灾祸' for code in order)
    return body,(w,h),label
