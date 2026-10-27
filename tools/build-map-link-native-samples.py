"""Review-only geometric route-plate samples, using audited source content.

These 37 hand-audited plates are an alternative to the comprehensive colour
contour experiment. Frames, compartments, locks and water bands use geometry;
numbers and factions reuse back-label paths. Pointer bounds and glyph sizes
follow the original; pointers use symmetric five-sided geometry, not scanned
contours. No installed asset is written.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import re
from math import ceil as math_ceil, floor as math_floor

from PIL import Image
import numpy as np
from scipy.ndimage import label
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.misc.transform import Transform
from functools import lru_cache

from map_corner_vectors import native

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'output/map-link-vector-review-20261025/native-samples'
GLYPHS = ROOT/'tools/map-link-vector-source/glyphs'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
PALETTES = {
    'c1': ('#997151','#4c3930','#eeeadd','#f5f1e5','#363c37'),
    'c2': ('#ca453c','#653b34','#f1e9dd','#f8f0e6','#3d3730'),
    'c3': ('#62617e','#383b48','#eeece3','#f6f4ea','#333a37'),
    # C4 number cells and pointers have black rims. Faction cells instead
    # use the separately sampled brown-grey field and pale warm rim below.
    'c4': ('#b89b5a','#3b3733','#171713','#393020','#171713'),
    'c5:A': ('#40484e','#7b8e99','#e3e5dc','#f6f7ee','#343b3e'),
    'c5:B': ('#7b8e99','#40484e','#e3e5dc','#f6f7ee','#343b3e'),
}
C4_FACTION={'background':'#3b3733','frame':'#171713','band':'#b89b5a','ink':'#fdfaf4'}
C4_FACTION_GLYPH_SIZE=46
# Black line centers measured from the source, not alpha/antialias bounds.
C4_SOURCE_FRAMES={
    'up-1':([430,81.5,590,147],527),
    'left-1':([45,478.5,209,539],149),
    'right-1':([811,479,974,543],872),
    'down-1':([431,876.5,591,942],528),
}

# The actual printed contents were checked against enlarged source crops.
# An F entry is a faction emblem; G is a Greek route suffix; W is THREE waves.
# The order here is the order on the source, including beta before alpha on
# the two separate downward routes of C5 040 A.
N = lambda value: ('number',value)
F = lambda value: ('faction',value)
G = lambda value: ('greek',value)
W = ('waves','three')
AUDITED = {
 'c1-tile-027-front': {
  'up-1':[N('022'),F('minoans')], 'left-1':[N('026'),F('minoans')],
  'down-1':[N('032'),F('minoans')]},
 'c1-tile-003-front': {
  'right-1':[F('hornsworn'),N('004')], 'left-1':[N('002'),F('hornsworn')],
  'down-1':[N('008'),F('minoans')]},
 'c2-tile-019-front': {
  'left-1':[N('018'),F('cyclopes'),W], 'right-1':[F('helots'),N('020')]},
 'c2-tile-003-front': {
  'right-1':[F('cyclopes'),N('004')], 'left-1':[N('002'),F('cyclopes')],
  'down-1':[N('011'),F('cyclopes')]},
 'c2-tile-021-front': {
  'up-1':[N('014'),F('symmachy'),W,G('alpha')],
  'right-1':[G('alpha'),F('symmachy'),N('022')],
  'left-1':[N('020'),F('helots'),G('alpha')],
  'down-1':[N('028'),F('symmachy'),W,G('beta')]},
 'c3-tile-050-front': {
  'up-1':[N('051'),F('delphians')], 'left-1':[N('045'),F('delphians')],
  'down-1':[N('049'),F('delphians')]},
 'c3-tile-005-front': {
  'up-1':[N('006'),F('delphians')], 'right-1':[F('twilightwatch'),N('012')],
  'left-1':[N('002'),F('sunheirs')], 'down-1':[N('004'),F('delphians')]},
 'c4-tile-011-front': {
  'up-1':[N('020'),F('aristotelians')], 'left-1':[N('010'),F('aristotelians')],
  'right-1':[F('aristotelians'),N('012')], 'down-1':[N('002'),F('aristotelians')]},
 'c5-tile-040-front': {
  'up-1':[N('030'),F('followersofarete'),G('alpha')],
  'left-1':[N('039'),F('followersofarete'),G('beta')],
  'down-1':[N('050'),F('outcastvanguard'),G('beta')],
  'down-2':[N('050'),F('outcastvanguard'),G('alpha')]},
 'c5-tile-040-back': {
  'left-1':[N('039'),F('followersofarete'),G('beta')],
  'down-1':[N('050'),F('outcastvanguard'),G('beta')]},
 'c5-tile-001-front': {
  'right-1':[F('outcastvanguard'),N('002')], 'down-1':[N('011'),F('outcastvanguard')]},
 'c5-tile-011-front': {
  'up-1':[N('001'),F('outcastvanguard')], 'right-1':[F('outcastvanguard'),N('012')],
  'down-1':[N('021'),F('followersofarete')]},
}
ROOF = {('c5-tile-040-back','left-1'),('c5-tile-011-front','down-1')}


def polygon(points,fill,stroke=None,width=1.5,extra=''):
    coords=' '.join(f'{x:g},{y:g}' for x,y in points)
    return f'<polygon points="{coords}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{width:g}" stroke-linejoin="miter"'if stroke else '')+f' {extra}/>'


def rect(x,y,w,h,fill,stroke=None,width=1.5,extra=''):
    return polygon([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],fill,stroke,width,extra)


def joined_outline(shapes):
    """One continuous contour; opposite copies of a shared edge cancel.

    All compartments meet edge-to-edge. This returns only the outer perimeter;
    shared pale rim segments are drawn separately, once each, without a dark
    support stroke. Pointer tips and raised C5 compartments remain intact.
    """
    edges=set()
    for points in shapes:
        for start,end in zip(points,points[1:]+points[:1]):
            opposite=(end,start)
            if opposite in edges:edges.remove(opposite)
            else:edges.add((start,end))
    boundary={start:end for start,end in edges}
    assert len(boundary)==len(edges), 'Joined frame has a branching boundary'
    start=min(boundary)
    current=start;points=[]
    while True:
        points.append(current)
        current=boundary.pop(current)
        if current==start:break
    assert not boundary, 'Joined frame must have one continuous outer contour'
    return 'M'+'L'.join(f'{x:g},{y:g}' for x,y in points)+'Z'


def greek(name,box,ink):
    root=ET.parse(GLYPHS/f'{name}.svg').getroot()
    for el in root.iter():
        if el.get('fill') not in (None,'none'):el.set('fill',ink)
    bounds=BoundsPen(None)
    for el in root.iter(f'{{{NS}}}path'):
        matrix=[float(x) for x in re.findall(r'-?\d+(?:\.\d+)?',el.get('transform',''))]
        parse_path(el.get('d'),TransformPen(bounds,matrix) if matrix else bounds)
    xl,yt,xr,yb=bounds.bounds
    l,t,r,b=box
    body=''.join(ET.tostring(el,encoding='unicode')for el in root if el.tag.rsplit('}',1)[-1]!='title')
    return (f'<svg data-greek="{name}" data-source-ink-bbox="{l:g} {t:g} {r:g} {b:g}" x="{l:g}" y="{t:g}" width="{r-l:g}" height="{b-t:g}" '
            f'viewBox="{xl:g} {yt:g} {xr-xl:g} {yb-yt:g}" preserveAspectRatio="none">{body}</svg>')


def source_ink_box(key,box):
    """Measure the actual printed glyph, excluding its compartment frame."""
    row=SOURCE_ROWS[key]
    rgba=np.asarray(Image.open(ROOT/row['source']).convert('RGBA'))
    l,t,r,b=[int(round(v)) for v in box]
    pixels=rgba[t:b,l:r]
    lum=pixels[:,:,:3].astype(float)@np.asarray([.299,.587,.114])
    labs,count=label((lum>180)&(pixels[:,:,3]>180))
    sizes=np.bincount(labs.ravel());sizes[0]=0
    index=int(sizes.argmax())
    assert sizes[index]>12,(key,box)
    yy,xx=np.where(labs==index)
    return [l+int(xx.min()),t+int(yy.min()),l+int(xx.max())+1,t+int(yy.max())+1]


def waves(box,ink):
    # The actual C2 source has three tightly spaced scalloped wave bands; the
    # native RR icon has a different number of bands and is not substituted.
    l,t,r,b=box;w=r-l;h=b-t
    d=''
    for i in range(3):
        y=t+i*h/3
        d+=(f'M{l:g} {y:g} Q{l+w/6:g} {y+h/5:g} {l+w/3:g} {y:g} '
            f'Q{l+w/2:g} {y+h/5:g} {l+2*w/3:g} {y:g} '
            f'Q{l+5*w/6:g} {y+h/5:g} {r:g} {y:g} '
            f'V{y+h/6:g} Q{l+5*w/6:g} {y+11*h/30:g} {l+2*w/3:g} {y+h/6:g} '
            f'Q{l+w/2:g} {y+11*h/30:g} {l+w/3:g} {y+h/6:g} '
            f'Q{l+w/6:g} {y+11*h/30:g} {l:g} {y+h/6:g}Z')
    return f'<path data-marker="three-water-bands" data-wave-count="3" d="{d}" fill="{ink}"/>'


def lock(box,dark,rim,ink,edge,key):
    l,t,r,b=box;cx,cy=(l+r)/2,(t+b)/2;rad=min(r-l,b-t)/2-2
    body=f'<circle data-marker="restricted-disc" cx="{cx:g}" cy="{cy:g}" r="{rad:g}" fill="{dark}" stroke="{rim}" stroke-width="5.6"/>'
    # The padlock's original total height is about its width. Fit one compact
    # geometric logo to the measured source ink, including the shackle stroke.
    target=source_ink_box(key,(cx-24,cy-24,cx+24,cy+24))
    sl,st,sr,sb=target
    il,it=cx-(sr-sl)/2,cy-(sb-st)/2
    ir,ib=il+(sr-sl),it+(sb-st)
    body+=(f'<g data-marker="restricted" data-source-ink-bbox="{sl} {st} {sr} {sb}" '
           f'data-centered-ink-bbox="{il:g} {it:g} {ir:g} {ib:g}" data-disc-center="{cx:g} {cy:g}" '
           f'transform="translate({il} {it}) scale({(ir-il)/32:.9f} {(ib-it)/32:.9f})">')
    body+=f'<path d="M7 16V9Q7 2 16 2Q25 2 25 9V16" fill="none" stroke="{ink}" stroke-width="4"/>'
    body+=rect(0,14,32,18,ink)
    body+=f'<circle cx="16" cy="21" r="3.7" fill="{dark}"/>'
    body+=rect(14,21,4,9,dark)+'</g>'
    return body


def plate(key,panel,cells):
    cycle=key[:2];face='B'if key.endswith('-back')else'A'
    if cycle=='c4':return c4_source_plate(key,panel,cells),None
    main,dark,rim,ink,edge=PALETTES[f'{cycle}:{face}'if cycle=='c5'else cycle]
    l,t,r,b=panel['bbox'];bodybox=[l,t,r,b]
    lockbox=None
    if (key,panel['id'])==('c2-tile-019-front','left-1'):
        bodybox=[43,477,280,546];lockbox=[283,476,353,548]
    elif (key,panel['id'])==('c2-tile-021-front','up-1'):
        lockbox=[621,79,693,152]
    l,t,r,b=bodybox
    pointed=panel['direction']in('left','right')
    widths=[(110 if pointed else 100)if kind=='number'else 64 for kind,value in cells]
    total=sum(widths);height=68;roof=(key,panel['id'])in ROOF
    roofheight=17 if roof else 0
    body='';x=0;greekmarks=[];shapes=[];shared_edges=[];cell_rims=[]
    for index,((kind,value),width)in enumerate(zip(cells,widths)):
        fill=main if kind=='number'else ('#40484e'if cycle=='c5'and kind=='greek'else dark)
        cell_rim=rim
        cell_rims.append(cell_rim)
        base=roofheight
        is_left=pointed and panel['direction']=='left'and index==0
        is_right=pointed and panel['direction']=='right'and index==len(cells)-1
        is_roof=roof and kind=='faction'
        if is_left:
            outer=[(x+20,base+1),(x+width,base+1),(x+width,base+height-1),(x+20,base+height-1),(x+1,base+height/2)]
            inner=[(x+23,base+6),(x+width-6,base+6),(x+width-6,base+height-6),(x+23,base+height-6),(x+7,base+height/2)]
        elif is_right:
            outer=[(x,base+1),(x+width-20,base+1),(x+width-1,base+height/2),(x+width-20,base+height-1),(x,base+height-1)]
            inner=[(x+6,base+6),(x+width-23,base+6),(x+width-7,base+height/2),(x+width-23,base+height-6),(x+6,base+height-6)]
        elif is_roof:
            outer=[(x,base+1),(x+width/2,1),(x+width,base+1),(x+width,base+height-1),(x,base+height-1)]
            inner=[(x+6,base+6),(x+width/2,7),(x+width-6,base+6),(x+width-6,base+height-6),(x+6,base+height-6)]
        else:
            outer=[(x,base+1),(x+width,base+1),(x+width,base+height-1),(x,base+height-1)]
            inner=[(x+6,base+6),(x+width-6,base+6),(x+width-6,base+height-6),(x+6,base+height-6)]
        shapes.append(outer)
        if index:
            shared_edges.append([x,base+1,x,base+height-1])
        # Fill every compartment before drawing the rim network. Pale shared
        # borders remain; the former dark support strokes are removed entirely.
        body+=(f'<g data-compartment="{kind}" data-cell-range="{x:g} {x+width:g}">'
               +polygon(outer,fill,extra='data-cell-fill="true"')
               +polygon(inner,'none',cell_rim,1.55,extra='data-cell-inner-frame="true"'))
        if kind=='number':
            x0=x+(27 if is_left else 12);x1=x+width-(27 if is_right else 12)
            body+=native.numeral(value,(x0,base+19,x1,base+height-18),ink)
        elif kind=='faction':
            # Roofed C5 eye glyphs extend into the apex in the printed design.
            iconbox=(x+11,(base-7)if is_roof else base+10,x+width-11,base+height-9)
            faction_ink=ink
            body+=native.faction(value,iconbox,faction_ink,dark,stretch_x=1.12 if value=='twilightwatch'else 1)
        elif kind=='greek':
            sx=(r-l)/total;sy=(b-t)/(height+roofheight)
            # Detect the printed ink inside this exact compartment, rather
            # than inflating alpha to fit the available cell height.
            target=source_ink_box(key,(l+x*sx+9,t+base*sy+9,l+(x+width)*sx-9,t+(base+height)*sy-9))
            greekmarks.append(greek(value,target,ink))
        elif kind=='waves':body+=waves((x+11,base+21,x+width-11,base+height-20),ink)
        body+='</g>';x+=width
    boundary=joined_outline(shapes)
    shared=';'.join(' '.join(f'{n:g}'for n in line)for line in shared_edges)
    seam_path=''.join(f'M{x0:g},{y0:g}L{x1:g},{y1:g}'for x0,y0,x1,y1 in shared_edges)
    frame=f'<path data-joined-frame="rim" d="{boundary}" fill="none" stroke="{rim}" stroke-width="2.3" stroke-linejoin="miter"/>'
    shared_rim=rim
    frame+=f'<path data-shared-rim="true" d="{seam_path}" fill="none" stroke="{shared_rim}" stroke-width="2.3" stroke-linecap="butt"/>'
    graphic=(f'<g data-native-plate="{panel["id"]}" data-frame-layout="rim-only" data-shared-edges="{shared}" '
             f'transform="translate({l:g} {t:g}) scale({(r-l)/total:.9f} {(b-t)/(height+roofheight):.9f})">'
             +f'<path data-panel-underlay="true" d="{boundary}" fill="{main}"/>'+body+frame+'</g>')
    graphic+=''.join(greekmarks)
    if lockbox:graphic+=lock(lockbox,dark,rim,ink,edge,key)
    return graphic,lockbox


def inset_polygon(points,distance):
    """Inset a convex polygon by intersecting parallel offset edge lines."""
    signed=sum(x0*y1-x1*y0 for (x0,y0),(x1,y1) in zip(points,points[1:]+points[:1]))
    orientation=1 if signed>0 else -1
    lines=[]
    for start,end in zip(points,points[1:]+points[:1]):
        delta=np.asarray(end,dtype=float)-start
        normal=orientation*np.asarray([-delta[1],delta[0]])/np.linalg.norm(delta)
        lines.append((normal,float(normal@start)+distance))
    result=[]
    for index,(normal,offset)in enumerate(lines):
        previous,previous_offset=lines[index-1]
        result.append(tuple(np.linalg.solve(np.asarray([previous,normal]),[previous_offset,offset])))
    return result


@lru_cache(maxsize=None)
def actual_faction_bounds(ident):
    """Use visible path extrema, including nested source transforms."""
    root=ET.parse(native.SOURCE/f'{ident}.svg').getroot();pen=BoundsPen(None)
    def walk(node,parent):
        transform=node.get('transform')
        if transform:
            assert transform.startswith('matrix('),transform
            values=[float(v)for v in re.findall(r'-?\d+(?:\.\d+)?',transform)]
            parent=parent.transform(Transform(*values))
        if node.tag.rsplit('}',1)[-1]=='path':parse_path(node.get('d'),TransformPen(pen,parent))
        for child in node:walk(child,parent)
    walk(root,Transform())
    return pen.bounds


def c4_source_plate(key,panel,cells):
    """C4 source construction: two equal black rules with gold between them.

    Number and faction cells share the very same top and bottom line centers.
    Only the area INSIDE the faction's inner black frame changes to dark grey.
    """
    assert key=='c4-tile-011-front'
    (l,t,r,b),split=C4_SOURCE_FRAMES[panel['id']]
    main,dark,rim,ink,_=PALETTES['c4']
    frame_width=2.0;inset=5.5
    x_ranges=[(l,split),(split,r)]
    shapes=[];body=''
    for index,((kind,value),(x0,x1))in enumerate(zip(cells,x_ranges)):
        cy=(t+b)/2
        if panel['direction']=='left'and index==0:
            shape=[(x0+17,t),(x1,t),(x1,b),(x0+17,b),(x0,cy)]
        elif panel['direction']=='right'and index==len(cells)-1:
            shape=[(x0,t),(x1-17,t),(x1,cy),(x1-17,b),(x0,b)]
        else:shape=[(x0,t),(x1,t),(x1,b),(x0,b)]
        shapes.append(shape);inside=inset_polygon(shape,inset)
        body+=(f'<g data-compartment="{kind}" data-cell-range="{x0:g} {x1:g}">'
               +polygon(shape,main,extra='data-cell-fill="true"')
               +polygon(inside,main if kind=='number'else dark,rim,frame_width,extra='data-cell-inner-frame="true"'))
        il,it,ir,ib=min(x for x,y in inside),min(y for x,y in inside),max(x for x,y in inside),max(y for x,y in inside)
        if kind=='number':
            body+=native.numeral(value,(il+9,it+11,ir-9,ib-11),ink)
        else:
            # The same emblem must have the same optical size on every edge.
            # Center on the dark field, not the source scan's uneven ink bbox.
            cx,cy=(il+ir)/2,(it+ib)/2;half=C4_FACTION_GLYPH_SIZE/2
            box=(cx-half,cy-half,cx+half,cy+half)
            glyph=ET.fromstring(native.faction(value,box,C4_FACTION['ink'],dark))
            gl,gt,gr,gb=actual_faction_bounds(value)
            scale=C4_FACTION_GLYPH_SIZE/max(gr-gl,gb-gt)
            tx,ty=cx-(gl+gr)/2*scale,cy-(gt+gb)/2*scale
            glyph.set('transform',f'matrix({scale:.12f} 0 0 {scale:.12f} {tx:.12f} {ty:.12f})')
            body+=(f'<g data-faction-placement="centered" data-target-size="{C4_FACTION_GLYPH_SIZE}" '
                   f'data-field-center="{cx:g} {cy:g}">'+ET.tostring(glyph,encoding='unicode')+'</g>')
        body+='</g>'
    boundary=joined_outline(shapes)
    frame=(f'<path data-joined-frame="rim" d="{boundary}" fill="none" stroke="{rim}" stroke-width="{frame_width:g}" stroke-linejoin="miter"/>'
           f'<path data-shared-rim="true" d="M{split:g},{t:g}L{split:g},{b:g}" fill="none" stroke="{rim}" stroke-width="{frame_width:g}" stroke-linecap="butt"/>')
    return (f'<g data-native-plate="{panel["id"]}" data-frame-layout="c4-source-double-black" '
            f'data-shared-edges="{split:g} {t:g} {split:g} {b:g}" data-frame-width="2" data-frame-inset="5.5">'
            f'<path data-panel-underlay="true" d="{boundary}" fill="{main}"/>'+body+frame+'</g>')


def arrow(part,cycle,face,key):
    main,dark,rim,ink,edge=PALETTES[f'{cycle}:{face}'if cycle=='c5'else cycle]
    l,t,r,b=part['bbox']
    cx,shoulder=(l+r)/2,(t+b)/2
    # Five exact straight sides. Symmetric shoulders and a centered tip replace
    # the scanned contour; the original overall bbox and position are retained.
    points=([(l,b),(l,shoulder),(cx,t),(r,shoulder),(r,b)] if part['direction']=='up'
            else [(l,t),(r,t),(r,shoulder),(cx,b),(l,shoulder)])
    result=(f'<g data-arrow="{part["direction"]}" data-source-bbox="{l} {t} {r} {b}" '
            'data-arrow-geometry="symmetric-five-straight-sides" data-rim-inset="2">')
    for inset,color,vertices in ((0,rim,points),(2,main,inset_polygon(points,2))):
        coords=' '.join(f'{x:.9f},{y:.9f}'for x,y in vertices)
        result+=f'<polygon data-arrow-inset="{inset}" points="{coords}" fill="{color}"/>'
    return result+'</g>'


def svg(body,box):
    l,t,r,b=box
    return (f'<svg xmlns="{NS}" width="{r-l}" height="{b-t}" viewBox="{l} {t} {r-l} {b-t}" '
            f'data-method="geometric-native-review-only">{body}</svg>\n')


def main():
    global SOURCE_ROWS
    OUT.mkdir(parents=True,exist_ok=True)
    for sub in ('vectors','sources','renders'):(OUT/sub).mkdir(exist_ok=True)
    inventory=json.loads((OUT.parent/'inventory.json').read_text(encoding='utf-8'))
    lookup={r['key']:r for r in inventory['faces']}
    SOURCE_ROWS=lookup
    rows=[]
    dirkeys={'up':'TOP_MIDDLE','right':'RIGHT_MIDDLE','down':'BOTTOM_MIDDLE','left':'LEFT_MIDDLE'}
    for key,panels in AUDITED.items():
        row=lookup[key];source=ROOT/row['source'];sourcehash=hashlib.sha256(source.read_bytes()).hexdigest()
        assert sourcehash==row['sourceSha256']
        im=Image.open(source).convert('RGBA')
        for ident,cells in panels.items():
            panel=next(p for p in row['panels']if p['id']==ident)
            target=next(value for kind,value in cells if kind=='number')
            assert target==row['expectedExits'][dirkeys[panel['direction']]],(key,ident,target)
            body,lockbox=plate(key,panel,cells)
            boxes=[panel['bbox']]
            for a in row['arrows']:
                if a['panelId']==ident:
                    body+=arrow(a,row['cycle'],row['face'],key);boxes.append(a['bbox'])
            if lockbox:boxes.append(lockbox)
            box=[max(0,min(b[0]for b in boxes)-7),max(0,min(b[1]for b in boxes)-7),
                 min(1024,max(b[2]for b in boxes)+7),min(1024,max(b[3]for b in boxes)+7)]
            sample=key+'--'+ident
            result=svg(body,box)
            root=ET.fromstring(result)
            assert not any(el.tag.rsplit('}',1)[-1]in('image','text','use','foreignObject')for el in root.iter())
            numbers=[el.get('data-number')for el in root.iter()if el.get('data-number')]
            factions=[el.get('data-faction')for el in root.iter()if el.get('data-faction')]
            greekmarks=[el.get('data-greek')for el in root.iter()if el.get('data-greek')]
            assert numbers==[target]
            assert factions==[value for kind,value in cells if kind=='faction']
            assert greekmarks==[value for kind,value in cells if kind=='greek']
            assert ('data-wave-count="3"'in result)==any(kind=='waves'for kind,value in cells)
            (OUT/'vectors'/f'{sample}.svg').write_text(result,encoding='utf-8')
            im.crop(box).save(OUT/'sources'/f'{sample}.png')
            rows.append({'id':sample,'key':key,'cycle':row['cycle'],'face':row['face'],
                         'direction':panel['direction'],'panelId':ident,'bbox':box,'bodyBBox':panel['bbox'],
                         'number':target,'cells':[{'kind':kind,'value':value}for kind,value in cells],
                         'arrows':sum(a['panelId']==ident for a in row['arrows']),
                         'lock':bool(lockbox),'roof':(key,ident)in ROOF,'source':row['source'],
                         'sourceSha256':sourcehash,'vector':f'vectors/{sample}.svg',
                         'original':f'sources/{sample}.png','render':f'renders/{sample}.png'})
        assert hashlib.sha256(source.read_bytes()).hexdigest()==sourcehash
    assert len(rows)==37
    report={'purpose':'Hand-audited geometric/native-path samples; not full installation',
            'installed':False,'samples':len(rows),'faces':len(AUDITED),
            'allFourDirectionsCoveredInEveryCycle':all({r['direction']for r in rows if r['cycle']==c}=={'up','down','left','right'}for c in ['c1','c2','c3','c4','c5']),
            'waveBandsPerWaveCell':3,'nativeDigitsAndFactions':True,'runtimeImagesInVectors':0,
            'c4FrameInk':'two equal 2px black rules, gold band between them; both cells aligned to source',
            'c4FactionPalette':C4_FACTION,
            'c4FactionGlyphPlacement':'uniform 46px fit; centered on each dark inner field',
            'arrowFootprints':'source bbox; symmetric five-straight-sided polygon with 2px inset rim',
            'lockAndGreekSizing':'tight source ink bounds; padlocks centered inside their discs',
            'sharedCompartmentEdges':'single pale rim retained; no dark support outlines',
            'thinDarkOutlines':'removed from all plate and arrow rims; original C4 primary black rims retained',
            'runtimeFontsInVectors':0,'sourceImageHashesPreserved':True,
            'notes':['数字及派系沿用背面原生路径；外框、色格、锁、三层水波为规则几何。箭头重建为五条直线组成的左右对称五边形。',
                     'C4 按原图用两条等粗黑线夹黄色带；编号格与派系格等高，派系格仅内圈里面填深棕灰。',
                     'C4 四方向派系图案按同一 46 像素框等比放置，居中在深色内框内，下方不再缩小或偏下。',
                     '箭头保留源图外接框宽高和位置，尖点居中、两侧肩部等高，边框向内等距收缩；锁和 α/β 按源图墨迹范围适配。',
                     '锁图形保留原版宽高，整体墨迹的中心对齐圆圈中心。',
                     '白色外框、分格白边和内框均保留；链接牌及箭头不再附加细黑描边，C4 主黑框沿用原版。',
                     'α/β 使用 Times New Roman 字体轮廓；无字体文件依赖。',
                     'C5 040 A 的左下 050 为 β、右下 050 为 α；B 面实际没有顶部 030 链接。',
                     '12 张面的 37 个样例均由放大的原图逐项核对，仅供审阅，不写入游戏。'],
            'records':rows}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>链接牌 · 几何与原生路径样例</title><style>
*{box-sizing:border-box}body{margin:0;background:#172125;color:#edf0ed;font:16px/1.55 system-ui,sans-serif}header,main{max-width:1420px;margin:auto;padding:24px}h1{font-size:28px;margin:8px 0}p{color:#bac9cb;max-width:1000px}a{color:#aad8e6}nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}button,input{font:inherit;border:1px solid #52676b;background:#24353b;color:inherit;border-radius:7px;padding:7px 12px}button{cursor:pointer}button.active{background:#647e84}input{max-width:100%;flex:1;min-width:180px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,470px),1fr));gap:18px}article{background:#26353a;border:1px solid #41575c;border-radius:10px;overflow:hidden}h2{font-size:16px;margin:14px 16px 7px}.meta{color:#b5c8c9;font-size:13px;margin:0 16px 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#455960}.art{background:#6c7577;min-width:0;padding:14px 8px;display:flex;align-items:center;justify-content:center;height:170px}.art img{max-width:100%;max-height:140px;image-rendering:auto}.labels{display:flex;justify-content:space-around;padding:8px;color:#c9d6d6;font-size:13px}.zoom{border-radius:0;width:100%;border:0;border-top:1px solid #41575c}dialog{max-width:min(1250px,96vw);width:1250px;background:#26353a;color:#edf0ed;border:1px solid #658089;border-radius:10px;padding:18px}dialog::backdrop{background:#000b}.large{height:300px}.large img{max-height:270px}.close{float:right}[hidden]{display:none!important}@media(max-width:600px){header,main{padding:16px}.art{height:135px}.art img{max-height:105px}.large{height:200px}.large img{max-height:165px}}
</style><header><a href="../index.html">← 全量色区描摹试验</a><h1>链接牌：几何与原生路径样例</h1><p>37 块链接牌 / 12 张地图面，五个循环各覆盖上下左右。数字和派系沿用背面路径；白色外框和分格白边均保留，链接牌及箭头不再附加细黑描边；C4 按原图采用两条等粗黑线夹黄色带，编号格与派系格等高；箭头按原版宽高重建为五条直线、左右对称，锁居中并保留原版尺寸，α/β 按原图墨迹宽高适配。保留原图的格子顺序、三层水波、锁、α/β 和 C5 双出口。所有结果仅供对照，尚未接入游戏。</p><nav id="filters"><button class="active" data-cycle="all">全部 37</button><button data-cycle="c1">C1</button><button data-cycle="c2">C2</button><button data-cycle="c3">C3</button><button data-cycle="c4">C4</button><button data-cycle="c5">C5</button><input id="search" placeholder="搜索 040 / up / left…" aria-label="搜索样例"></nav><p id="count"></p></header><main><div class="gallery" id="gallery"></div></main><dialog><button class="close">关闭</button><h2 id="title"></h2><div id="detail"></div></dialog><script>
const rows=RECORDS;let cycle='all';const dir={up:'上',down:'下',left:'左',right:'右'};const gallery=document.querySelector('#gallery');const search=document.querySelector('#search');const dialog=document.querySelector('dialog');function pair(r,large=false){return `<div class="pair"><div class="art ${large?'large':''}"><img src="${r.original}" alt="${r.id} 原图"></div><div class="art ${large?'large':''}"><img src="${r.vector}" alt="${r.id} 几何矢量"></div></div><div class="labels"><span>原图</span><span>规则几何 + 原生路径</span></div>`}function draw(){const q=search.value.trim().toLowerCase();const selected=rows.filter(r=>(cycle==='all'||r.cycle===cycle)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));document.querySelector('#count').textContent=`当前显示 ${selected.length} / 37 块`;gallery.innerHTML=selected.map(r=>`<article data-id="${r.id}"><h2>${r.key} · ${dir[r.direction]} ${r.number}</h2><p class="meta">${r.cells.map(c=>c.value).join(' · ')}${r.lock?' · 锁':''}${r.roof?' · 尖顶格':''}</p>${pair(r)}<button class="zoom" data-id="${r.id}">放大对照</button></article>`).join('')}document.querySelector('#filters').addEventListener('click',e=>{if(!e.target.dataset.cycle)return;cycle=e.target.dataset.cycle;document.querySelectorAll('[data-cycle]').forEach(b=>b.classList.toggle('active',b===e.target));draw()});search.addEventListener('input',draw);gallery.addEventListener('click',e=>{if(!e.target.classList.contains('zoom'))return;const r=rows.find(r=>r.id===e.target.dataset.id);document.querySelector('#title').textContent=r.id;document.querySelector('#detail').innerHTML=pair(r,true);dialog.showModal()});document.querySelector('.close').onclick=()=>dialog.close();draw();
</script></html>'''.replace('RECORDS',json.dumps(rows,ensure_ascii=False))
    (OUT/'index.html').write_text(html,encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items()if k not in('records','notes')}))


if __name__=='__main__':main()
