"""Read printed link-cell contents without inventing text or faction identities.

Public API: vectorize_content(rgba, cycle, box, ink, background, *, expected=None,
kind_hint=None). Coordinates in ``box`` are global 1024-square pixels. It should
be the area *inside* the cell's inner frame. Low-confidence contents retain
their source ink as simplified SVG paths; no image/font dependency is emitted.
Only an unambiguous template match uses the existing native glyph artwork.
"""
from __future__ import annotations

from collections import defaultdict, OrderedDict
from functools import lru_cache
from pathlib import Path
import copy
import importlib.util
import json
import math
import re
import weakref
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, label, find_objects, binary_fill_holes, distance_transform_edt
from skimage.measure import find_contours, approximate_polygon
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.misc.transform import Transform

ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'output/map-link-vector-review-20261025'
OUT=ROOT/'output/map-link-vector-install-20261025/content-review'
GLYPHS=ROOT/'tools/map-link-vector-source/glyphs'
SOURCE=GLYPHS.parent
TEMPLATE_DIR=ROOT/'tools/map-link-vector-source/recognition'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
spec=importlib.util.spec_from_file_location('link_content_native',ROOT/'tools/build-map-back-vectors.py')
native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
_GLOBAL_INK=OrderedDict()


def _hex_rgb(value):
    if not isinstance(value,str):return tuple(value[:3])
    if value.startswith('#') and len(value)==7:return tuple(int(value[i:i+2],16)for i in (1,3,5))
    return (245,242,231)


def _clean(binary,min_area=2,remove_border=True):
    labs,n=label(binary)
    if not n:return binary.astype(bool)
    counts=np.bincount(labs.ravel());keep=counts>=min_area;keep[0]=False
    if remove_border:
        touching=np.unique(np.concatenate((labs[0],labs[-1],labs[:,0],labs[:,-1])))
        keep[touching]=False
    return keep[labs]


def _remove_frame_fragments(binary):
    """Discard only proven rim fragments, never an arbitrary edge glyph.

    Crops are already inside the inner frame. An emblem can still touch the
    crop boundary; rejecting its whole connected component loses the emblem.
    Thin components that span nearly the entire crop are residual frame ink.
    """
    labs,count=label(binary);sizes=np.bincount(labs.ravel());keep=sizes>=2;keep[0]=False
    h,w=binary.shape
    for ident in range(1,count+1):
        yy,xx=np.where(labs==ident)
        if not len(xx):continue
        bw,bh=int(xx.max()-xx.min()+1),int(yy.max()-yy.min()+1)
        thin_horizontal=(yy.min()==0 or yy.max()==h-1)and bw>=w*.82 and bh<=max(4,h*.13)
        thin_vertical=(xx.min()==0 or xx.max()==w-1)and bh>=h*.82 and bw<=max(4,w*.10)
        edge_pixels=int(((xx==0)|(xx==w-1)|(yy==0)|(yy==h-1)).sum())
        spans=bh>=h*.78 or bw>=w*.78
        # A diagonal chevron rim has a wider bbox than an upright rim. It
        # still has far more ink running along the crop edge than a glyph.
        # A real emblem merely touching the crop at its tip is retained.
        thin_edge_network=(edge_pixels>=max(7,len(xx)*.09)and spans and len(xx)/max(1,bw*bh)<.42)
        if thin_horizontal or thin_vertical or thin_edge_network:keep[ident]=False
    return keep[labs]


def _source_ink_without_frames(data,polarity):
    """Separate complete source glyphs from complete source frame networks.

    Classification uses the full 1024-square image before any cell cropping.
    A frame network spans the entire route plate; a glyph touching a small
    caller crop remains a separate intact component and is retained.
    """
    key=(id(data),polarity)
    cached=_GLOBAL_INK.get(key)
    if cached is not None and cached[0]()is data:
        _GLOBAL_INK.move_to_end(key);return cached[1]
    rgb=data[:,:,:3].astype(float);alpha=data[:,:,3]if data.shape[2]>3 else np.full(data.shape[:2],255)
    lum=rgb@np.asarray([.299,.587,.114])
    binary=((lum<112)if polarity=='dark'else(lum>171))&(alpha>140)
    labs,count=label(binary);sizes=np.bincount(labs.ravel());keep=sizes>=2;keep[0]=False
    for ident,slices in enumerate(find_objects(labs),1):
        if slices is None:continue
        ys,xs=slices;bw,bh=xs.stop-xs.start,ys.stop-ys.start
        fill=sizes[ident]/max(1,bw*bh)
        # Every route-frame network is much wider than a printed individual
        # digit or emblem. A detached 60px square/circle rim is sparse; solid
        # larger symbols are left for contextual crop/classification checks.
        if bw>=90 or bh>=85 or(min(bw,bh)>=53 and fill<.48):keep[ident]=False
    result=keep[labs]
    _GLOBAL_INK[key]=(weakref.ref(data),result)
    _GLOBAL_INK.move_to_end(key)
    while len(_GLOBAL_INK)>6:_GLOBAL_INK.popitem(last=False)
    return result


def _tight(mask):
    yy,xx=np.where(mask)
    if not len(xx):return None
    return [int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1]


def _normal(mask,size=64):
    bounds=_tight(mask)
    if bounds is None:return np.zeros((size,size),dtype=bool),1.0
    l,t,r,b=bounds;w,h=r-l,b-t
    target=(max(1,round((size-4)*w/max(w,h))),max(1,round((size-4)*h/max(w,h))))
    im=Image.fromarray(mask[t:b,l:r].astype(np.uint8)*255).resize(target,Image.Resampling.LANCZOS)
    board=Image.new('L',(size,size));board.paste(im,((size-target[0])//2,(size-target[1])//2))
    return np.asarray(board)>100,w/h


def _score(a,b,aspect_a=1,aspect_b=1):
    """Soft contour distance plus overlap; normalised masks retain aspect."""
    if not a.any() or not b.any():return 0.0
    intersection=np.count_nonzero(a&b);union=np.count_nonzero(a|b)
    iou=intersection/max(1,union)
    da=_distance(a.tobytes(),a.shape);db=_distance(b.tobytes(),b.shape)
    distance=(float(da[b].mean())+float(db[a].mean()))/2
    aspect=math.exp(-abs(math.log(max(.01,aspect_a)/max(.01,aspect_b))))
    return (.60*iou+.40*math.exp(-distance/2.2))*aspect**.25


@lru_cache(maxsize=512)
def _distance(binary,shape):
    return distance_transform_edt(~np.frombuffer(binary,dtype=np.bool_).reshape(shape))


@lru_cache(maxsize=32)
def _load_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'))


def _paths(mask,l,t,tolerance=.20):
    """Bicubic subpixel contours retain all holes and meaningful ink islands."""
    if not mask.any():return ''
    up=3
    field=gaussian_filter(mask.astype(float),.30)
    big=np.asarray(Image.fromarray(field.astype(np.float32),'F').resize((mask.shape[1]*up,mask.shape[0]*up),Image.Resampling.BICUBIC))
    parts=[]
    for ring in find_contours(np.pad(big,2),.48):
        ring=(ring-2+.5)/up
        xx,yy=ring[:,1],ring[:,0]
        area=abs(float(np.dot(xx,np.roll(yy,1))-np.dot(yy,np.roll(xx,1))))/2
        if area<.18:continue
        ring=approximate_polygon(ring,tolerance)
        if len(ring)<4:continue
        parts.append('M'+'L'.join(f'{x+l:.3f},{y+t:.3f}'for y,x in ring[:-1])+'Z')
    return ''.join(parts)


def extract_ink(rgba,cycle,box,kind_hint=None):
    """Return source ink and polarity. The caller owns the surrounding frame."""
    data=np.asarray(rgba)
    l,t,r,b=[int(round(x))for x in box]
    l,t,r,b=max(0,l),max(0,t),min(data.shape[1],r),min(data.shape[0],b)
    if r<=l or b<=t:return np.zeros((1,1),bool),'light',[l,t,r,b]
    crop=data[t:b,l:r];rgb=crop[:,:,:3].astype(float)
    alpha=crop[:,:,3]if crop.shape[2]>3 else np.full(crop.shape[:2],255)
    lum=rgb@np.asarray([.299,.587,.114])
    # C4 number fields are gold with dark numerals; every other route cell
    # uses light ink. A hint is strong evidence, otherwise compare visible ink.
    dark_number=cycle=='c4' and kind_hint in ('number','digits','numeral')
    if cycle=='c4' and kind_hint not in ('faction','symbol','greek','waves','icon'):
        gold=(rgb[:,:,0]-rgb[:,:,2]>24)&(lum>105)&(lum<210)&(alpha>150)
        dark_number=dark_number or float(gold.mean())>.35
    polarity='dark'if dark_number else'light'
    mask=_source_ink_without_frames(data,polarity)[t:b,l:r].copy()
    return mask,polarity,[l,t,r,b]


def _digit_groups(mask):
    if not mask.any():return []
    cols=mask.any(0);runs=[];start=None
    for x,value in enumerate(np.r_[cols,False]):
        if value and start is None:start=x
        elif not value and start is not None:
            runs.append([start,x]);start=None
    # Isolated detached serif pixels are incorporated into the nearest real
    # letter only if the gap is tiny. Genuine inter-letter gaps remain intact.
    substantial=[run for run in runs if np.count_nonzero(mask[:,run[0]:run[1]])>=8]
    return [mask[:,l:r]for l,r in substantial]


def _cell_training_box(sample,cell,plate):
    ranges=[float(v)for v in cell.get('data-cell-range').split()]
    fill=next((node for node in cell if node.get('data-cell-fill')),None)
    if fill is None:return None
    coords=[float(v)for v in re.findall(r'-?\d+(?:\.\d+)?',fill.get('points'))]
    xs,ys=coords[::2],coords[1::2]
    if plate.get('transform'):
        numbers=[float(v)for v in re.findall(r'-?\d+(?:\.\d+)?',plate.get('transform'))]
        if len(numbers)!=4:return None
        tx,ty,sx,sy=numbers
    else:tx=ty=0;sx=sy=1
    # Inner source frame is about 5px from the printed boundary. Another 3px
    # prevents that frame, including its scan AA, from becoming glyph content.
    return [round(tx+min(xs)*sx+9),round(ty+min(ys)*sy+9),round(tx+max(xs)*sx-9),round(ty+max(ys)*sy-9)]


@lru_cache(maxsize=1)
def _official_originals():
    manifest=ROOT/'official-assets/_backups/map-links-20261025/manifest.json'
    if not manifest.exists():return {}
    report=json.loads(manifest.read_text(encoding='utf-8'))
    return {row['key']:ROOT/row['backup']for row in report['files']if row['kind']=='original-raster-overlay'}


@lru_cache(maxsize=1)
def templates():
    digit=defaultdict(list);symbols=defaultdict(list)
    for ch in '0123456789':
        for filename in ('times.ttf','timesbd.ttf'):
            ft=ImageFont.truetype('C:/Windows/Fonts/'+filename,96)
            box=ft.getbbox(ch);im=Image.new('L',(box[2]-box[0]+8,box[3]-box[1]+8))
            ImageDraw.Draw(im).text((4-box[0],4-box[1]),ch,font=ft,fill=255)
            digit[ch].append(_normal(np.asarray(im)>100))
    report=SOURCE/'approved37/report.json'
    if report.exists():
        rows=json.loads(report.read_text(encoding='utf-8'))['records']
        for sample in rows:
            path=_official_originals().get(sample['key'])
            if path is None or not path.exists():path=ROOT/sample['source']
            if not path.exists():continue
            source=_load_rgba(path)
            root=ET.parse(SOURCE/'approved37'/sample['vector']).getroot()
            plate=next(node for node in root.iter()if node.get('data-native-plate'))
            cells=[node for node in plate if node.get('data-compartment')]
            for meta,cell in zip(sample['cells'],cells):
                box=_cell_training_box(sample,cell,plate)
                if box is None or box[2]<=box[0]or box[3]<=box[1]:continue
                mask,_,_=extract_ink(source,sample['cycle'],box,meta['kind'])
                if meta['kind']=='number':
                    groups=_digit_groups(mask)
                    bounds=_tight(mask)
                    complete=(bounds is not None and bounds[0]>0 and bounds[1]>0 and bounds[2]<mask.shape[1]and bounds[3]<mask.shape[0])
                    if complete and len(groups)==len(meta['value'])and all(int(group.sum())>=30 for group in groups):
                        for ch,group in zip(meta['value'],groups):digit[ch].append(_normal(group))
                # The native plate's geometry was optically corrected after
                # approval. Its compartment bbox is not a reliable crop of a
                # scanned source emblem, and must not train partial emblems.
                # Symbol templates below use complete native glyph paths.
    # Prepared native and rare glyph rasters are only recognition templates;
    # they never appear in generated SVG files.
    template_paths=list(TEMPLATE_DIR.glob('*.png'))if TEMPLATE_DIR.exists()else[]
    evidence_dir=SOURCE/'recognition-source'
    if evidence_dir.exists():template_paths+=list(evidence_dir.glob('*.png'))
    for path in template_paths:
        row=np.asarray(Image.open(path).convert('RGBA'))
        lum=row[:,:,:3].mean(2);mask=(lum>127)&(row[:,:,3]>127)
        ident=path.stem.split('--',1)[0]
        if ident.startswith('digit-'):digit[ident[-1]].append(_normal(mask))
        elif mask.any():symbols[ident].append(_normal(mask))
    return digit,symbols


def _recognize(mask,cycle,kind_hint=None,expected=None):
    digit,symbols=templates();normal,aspect=_normal(mask)
    if not mask.any():return {'kind':'empty','value':None,'confidence':1.0,'margin':1.0}
    number_candidates=[]
    groups=_digit_groups(mask)
    allow_number=kind_hint not in ('faction','symbol','greek','waves','icon','restricted')
    if allow_number and 2<=len(groups)<=4 and aspect>1.05:
        results=[]
        for group in groups:
            normalized,ratio=_normal(group)
            scores=sorted(((max(_score(normalized,t,ratio,a)for t,a in rows),ch)for ch,rows in digit.items()),reverse=True)
            results.append((scores[0][1],scores[0][0],scores[0][0]-scores[1][0]))
        confidence=min(v[1]for v in results);margin=min(v[2]for v in results)
        number_candidates.append({'kind':'number','value':''.join(v[0]for v in results),'confidence':confidence,'margin':margin})
    matches=sorted(((max(_score(normal,t,aspect,a)for t,a in rows),ident)for ident,rows in symbols.items()),reverse=True)
    symbol=None
    if matches and kind_hint not in ('number','digits','numeral'):
        confidence,ident=matches[0];margin=confidence-(matches[1][0]if len(matches)>1 else 0)
        kind='faction'if ident in native.FACTIONS else'greek'if ident in('alpha','beta')else'waves'if ident=='waves'else'icon'
        symbol={'kind':kind,'value':ident,'confidence':confidence,'margin':margin}
    candidates=number_candidates+([symbol]if symbol else[])
    if not candidates:return {'kind':'source-ink','value':None,'confidence':0.0,'margin':0.0}
    candidates.sort(key=lambda row:row['confidence'],reverse=True)
    result=candidates[0]
    # Explicit expected content is checked, not used to manufacture a result.
    if expected is not None and result['value']!=expected:result={**result,'expectedMismatch':True}
    return result


def _svg_transform(value):
    result=Transform()
    for name,args in re.findall(r'(matrix|translate|scale)\s*\(([^)]*)\)',value or ''):
        values=[float(v)for v in re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',args)]
        if name=='matrix':part=Transform(*values)
        elif name=='translate':part=Transform().translate(values[0],values[1]if len(values)>1 else 0)
        else:part=Transform().scale(values[0],values[1]if len(values)>1 else values[0])
        result=result.transform(part)
    return result


@lru_cache(maxsize=96)
def actual_bounds(path):
    """Visible path extrema including every nested source transform."""
    root=ET.parse(path).getroot();pen=BoundsPen(None)
    def walk(node,parent):
        parent=parent.transform(_svg_transform(node.get('transform')))
        if node.tag.rsplit('}',1)[-1]=='path':parse_path(node.get('d'),TransformPen(pen,parent))
        for child in node:walk(child,parent)
    walk(root,Transform())
    if pen.bounds is None:raise ValueError(f'No visible path bounds in {path}')
    return pen.bounds


def _native_faction(ident,box,ink,background):
    body=ET.fromstring(native.faction(ident,box,ink,background))
    gl,gt,gr,gb=actual_bounds(str(native.SOURCE/f'{ident}.svg'))
    l,t,r,b=box;scale=min((r-l)/(gr-gl),(b-t)/(gb-gt))
    tx,ty=(l+r)/2-(gl+gr)/2*scale,(t+b)/2-(gt+gb)/2*scale
    body.set('transform',f'matrix({scale:.12f} 0 0 {scale:.12f} {tx:.12f} {ty:.12f})')
    return ET.tostring(body,encoding='unicode')


def _library_glyph(ident,box,ink,background):
    root=ET.parse(GLYPHS/f'{ident}.svg').getroot()
    for node in root.iter():
        for attribute in ('fill','stroke'):
            value=node.get(attribute)
            if value not in(None,'none'):
                # White inlays are counters in the black source symbol.
                node.set(attribute,background if value.lower()in('#fff','#ffffff','white')else ink)
    l,t,r,b=box
    gl,gt,gr,gb=actual_bounds(str(GLYPHS/f'{ident}.svg'))
    root.set('viewBox',f'{gl:.9f} {gt:.9f} {gr-gl:.9f} {gb-gt:.9f}')
    root.set('x',str(l));root.set('y',str(t));root.set('width',str(r-l));root.set('height',str(b-t))
    root.set('preserveAspectRatio','none')
    root.set('data-glyph',ident)
    return ET.tostring(root,encoding='unicode')


def vectorize_content(rgba,cycle,box,ink,background,*,expected=None,kind_hint=None):
    """Return global-coordinate pure-vector contents, preserving uncertainty.

    ``kind_hint`` may be number/faction/greek/waves/icon. Unknown/uncertain glyphs
    remain source outlines, including compound paths and holes. This is safe
    for incomplete metadata, simultaneous faction+route symbols and rare marks.
    """
    mask,polarity,crop_box=extract_ink(rgba,cycle,box,kind_hint)
    l,t,_,_=crop_box;tight=_tight(mask)
    if tight is None:
        return {'body':'','inkBBox':None,'kind':'empty','value':None,'confidence':1.0,'method':'source-empty','reviewRequired':True,'polarity':polarity,'sourceInkPixels':0}
    il,it,ir,ib=tight;ink_box=[l+il,t+it,l+ir,t+ib]
    match=_recognize(mask,cycle,kind_hint,expected)
    clipped_boundary=bool(il==0 or it==0 or ir==mask.shape[1]or ib==mask.shape[0])
    complete_evidence=not clipped_boundary and int(mask.sum())>=24 and ir-il>=6 and ib-it>=8
    confident=(match['confidence']>=.88 and match['margin']>=.075 and not match.get('expectedMismatch'))
    if match['kind']=='number':confident=match['confidence']>=.84 and match['margin']>=.055 and not match.get('expectedMismatch')
    confident=confident and complete_evidence
    body=None;method='smoothed-source-ink-paths'
    if confident:
        if match['kind']=='number':body=native.numeral(match['value'],ink_box,ink)
        elif match['kind']=='faction':body=_native_faction(match['value'],ink_box,ink,'#191919'if match['value']=='cyclopes'else background)
        elif match['kind']in('greek','icon')and(GLYPHS/f'{match["value"]}.svg').exists():body=_library_glyph(match['value'],ink_box,ink,background)
        if body is not None:method='native-template-confirmed'
    if body is None:
        data=_paths(mask,l,t)
        body=f'<path data-content-method="source-ink" fill="{ink}" fill-rule="evenodd" d="{data}"/>'
        # Some scanned emblems have a truly black enclosed inset (not merely
        # a transparent counter revealing the brown/blue faction background).
        # Preserve that interior in a second real path when the source proves it.
        if polarity=='light':
            pixels=np.asarray(rgba)[crop_box[1]:crop_box[3],crop_box[0]:crop_box[2],:3].astype(float)
            lum=pixels@np.asarray([.299,.587,.114])
            bg_lum=float(np.asarray(_hex_rgb(background))@np.asarray([.299,.587,.114]))
            holes=binary_fill_holes(mask)&~mask
            dark=_clean(holes&(lum<min(42,bg_lum*.68)),min_area=3,remove_border=False)
            if dark.any():body=f'<path data-content-method="source-black-inset" fill="#191919" fill-rule="evenodd" d="{_paths(dark,l,t)}"/>'+body
    result={**match,'body':body,'inkBBox':ink_box,'method':method,'reviewRequired':not confident,
            'polarity':polarity,'sourceInkPixels':int(mask.sum()),'cropBox':crop_box,
            'clippedBoundary':clipped_boundary}
    # Check the caller receives no source image wrapper or runtime font.
    assert not re.search(r'<(?:\w+:)?(?:image|text|foreignObject)\b|data:image|@font-face',body,re.I)
    return result


def classify(*args,**kwargs):
    return vectorize_content(*args,**kwargs)
