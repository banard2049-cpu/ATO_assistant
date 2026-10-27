"""Fixed elements for non-link map markers, with externally supplied emblems.

No scanned contours are used for visible artwork. Known reused components and
font outlines are combined with circles, quarter tabs, shared banner geometry,
and one regular scalloped inner field. Missing approved emblems are explicit.
"""
from __future__ import annotations
from copy import deepcopy
from functools import lru_cache
from io import BytesIO
import base64,hashlib,itertools,json,math,re
from pathlib import Path
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.svgLib.path import parse_path
from fontTools.pens.recordingPen import RecordingPen
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
_MASK_IDS=itertools.count()


def svg(body,width=1024,height=1024,view=None):
    return f'<svg xmlns="{NS}" width="{width}" height="{height}" viewBox="{view or f"0 0 {width} {height}"}">{body}</svg>\n'


def _transform(value):
    result=Transform()
    for operation,args in re.findall(r'(matrix|translate|scale|rotate)\s*\(([^)]*)\)',value or ''):
        v=[float(n)for n in re.findall(r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?',args)]
        if operation=='matrix':part=Transform(*v)
        elif operation=='translate':part=Transform().translate(v[0],v[1]if len(v)>1 else 0)
        elif operation=='scale':part=Transform().scale(v[0],v[1]if len(v)>1 else v[0])
        else:
            part=Transform()
            if len(v)==3:part=part.translate(v[1],v[2])
            part=part.rotate(math.radians(v[0]))
            if len(v)==3:part=part.translate(-v[1],-v[2])
        result=result.transform(part)
    return result


@lru_cache(maxsize=128)
def _component(path_string):
    path=Path(path_string);root=ET.parse(path).getroot();pen=BoundsPen(None)
    def walk(node,parent,is_root=False):
        name=node.tag.rsplit('}',1)[-1]
        assert name not in('image','text','use','foreignObject','script'),f'Emblem must be an approved self-contained vector: {path}'
        assert not any(attr.rsplit('}',1)[-1]=='href'for attr in node.attrib),path
        matrix=parent.transform(_transform(node.get('transform')))
        if name=='svg'and not is_root:
            view=[float(v)for v in node.get('viewBox','0 0 100 100').split()]
            sx=float(node.get('width',view[2]))/view[2];sy=float(node.get('height',view[3]))/view[3]
            matrix=matrix.transform(Transform(sx,0,0,sy,float(node.get('x',0))-view[0]*sx,float(node.get('y',0))-view[1]*sy))
        if name=='path':parse_path(node.get('d',''),TransformPen(pen,matrix))
        elif name in('circle','ellipse'):
            cx,cy=float(node.get('cx',0)),float(node.get('cy',0));rx=float(node.get('rx',node.get('r',0)));ry=float(node.get('ry',node.get('r',0)))
            parse_path(f'M{cx-rx} {cy}A{rx} {ry} 0 1 0 {cx+rx} {cy}A{rx} {ry} 0 1 0 {cx-rx} {cy}Z',TransformPen(pen,matrix))
        elif name=='rect':
            x,y,w,h=[float(node.get(a,0))for a in('x','y','width','height')]
            parse_path(f'M{x} {y}H{x+w}V{y+h}H{x}Z',TransformPen(pen,matrix))
        elif name in('polygon','polyline'):
            nums=[float(n)for n in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',node.get('points',''))]
            if len(nums)>=4:parse_path('M'+'L'.join(f'{x} {y}'for x,y in zip(nums[::2],nums[1::2]))+('Z'if name=='polygon'else''),TransformPen(pen,matrix))
        for child in node:walk(child,matrix)
    walk(root,Transform(),True);assert pen.bounds is not None,path
    return root,pen.bounds


def _original_raster_record(path,ident):
    manifest=ROOT/'tools/map-marker-vector-source/original-components/manifest.json'
    assert manifest.exists(),'Original raster reuse requires its source manifest'
    records=json.loads(manifest.read_text(encoding='utf8'))['components']
    record=records[ident]
    assert record['kind']=='original-raster-alpha',ident
    expected=(ROOT/record['file']).resolve()
    assert Path(path).resolve()==expected,ident
    raw=expected.read_bytes();assert hashlib.sha256(raw).hexdigest()==record['sha256'],ident
    assert not record.get('canvasCropped',True)and not record.get('newSilhouetteInvented',True),ident
    image=Image.open(BytesIO(raw)).convert('RGBA')
    assert image.size==(record['width'],record['height']),ident
    # Preserve every original alpha pixel and the full source canvas. The
    # RGB is white only inside the invisible luminance mask so SVG 1.1 viewers
    # apply the original alpha faithfully; the visible colour is a parameter.
    alpha=image.getchannel('A');white=Image.new('RGBA',image.size,'white');white.putalpha(alpha)
    buf=BytesIO();white.save(buf,format='PNG')
    return record,'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()


def raster_emblem(path,box,ink,ident,*,id_prefix='marker'):
    record,uri=_original_raster_record(path,ident)
    gl,gt,gr,gb=record['inkBBox'];l,t,r,b=box
    # Fit actual alpha ink, while embedding the entire untouched canvas.
    # Transparent source padding supplies AA clearance without shrinking it.
    sx=sy=min((r-l)/(gr-gl),(b-t)/(gb-gt))
    tx,ty=(l+r)/2-(gl+gr)/2*sx,(t+b)/2-(gt+gb)/2*sy
    w,h=record['width']*sx,record['height']*sy
    assert re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*',id_prefix),id_prefix
    mask_id=f'{id_prefix}-original-emblem-alpha-{ident}-{next(_MASK_IDS)}'
    mask=(f'<defs><mask id="{mask_id}" maskUnits="userSpaceOnUse" x="{tx:.12f}" y="{ty:.12f}" width="{w:.12f}" height="{h:.12f}">'
          f'<image x="{tx:.12f}" y="{ty:.12f}" width="{w:.12f}" height="{h:.12f}" preserveAspectRatio="none" href="{uri}"/></mask></defs>')
    body=f'<rect x="{tx:.12f}" y="{ty:.12f}" width="{w:.12f}" height="{h:.12f}" fill="{ink}" mask="url(#{mask_id})"/>'
    orientation=''
    if ident=='staff_icon':
        # The printed map points toward the upper right. The original text
        # sprite points upper left; one fixed mirror serves all four maps.
        orientation=' data-orientation="mirror-x"'
        body=f'<g transform="translate({l+r:.12f} 0) scale(-1 1)">{body}</g>'
    return (f'<g data-emblem="{ident}" data-component-kind="original-raster-alpha" data-source-sha256="{record["sha256"]}" '
            f'data-full-source-canvas="{record["width"]} {record["height"]}" data-canvas-cropped="false"{orientation}>{mask}{body}</g>')


def emblem(path,box,ink,ident,*,preserve_colours=False,id_prefix='marker'):
    if Path(path).suffix.lower()=='.png':return raster_emblem(path,box,ink,ident,id_prefix=id_prefix)
    original,bounds=_component(str(Path(path).resolve()));root=deepcopy(original)
    if not preserve_colours:
        for node in root.iter():
            for attr in('fill','stroke'):
                if node.get(attr)not in(None,'none'):node.set(attr,ink)
    if ident=='rr_adventure':
        # The rulebook stores this artwork as adjacent native PDF polygons.
        # Draw their union in one fill operation to avoid antialias seams
        # between triangles. Vertices come exclusively from those SVG paths.
        for parent in root.iter():
            paths=[n for n in parent if n.tag.rsplit('}',1)[-1]=='path']
            if len(paths)<2:continue
            joined=[]
            for node in paths:
                pen=RecordingPen();parse_path(node.get('d'),pen);points=[]
                for operation,args in pen.value:
                    if operation in('moveTo','lineTo'):points.append(args[0])
                    else:assert operation in('closePath','endPath'),operation
                area=sum(x0*y1-x1*y0 for(x0,y0),(x1,y1)in zip(points,points[1:]+points[:1]))
                if area<0:points.reverse()
                joined.append('M'+'L'.join(f'{x:.7f} {y:.7f}'for x,y in points)+'Z')
            first=list(parent).index(paths[0])
            for node in paths:parent.remove(node)
            merged=ET.Element(f'{{{NS}}}path',{'data-native-pdf-union':'true','fill':ink,'fill-rule':'nonzero','d':''.join(joined)})
            parent.insert(first,merged)
    gl,gt,gr,gb=bounds;l,t,r,b=box;s=min((r-l)/(gr-gl),(b-t)/(gb-gt))
    tx,ty=(l+r)/2-(gl+gr)/2*s,(t+b)/2-(gt+gb)/2*s
    body=''.join(ET.tostring(node,encoding='unicode')for node in root if node.tag.rsplit('}',1)[-1]not in('title','desc','metadata'))
    return f'<g data-emblem="{ident}" transform="matrix({s:.12f} 0 0 {s:.12f} {tx:.12f} {ty:.12f})">{body}</g>'


@lru_cache(maxsize=128)
def _font_paths(text,font_path,font_number=0):
    font=TTFont(font_path,fontNumber=font_number);glyphs=font.getGlyphSet();cmap=font.getBestCmap();advance=0;body=[];bounds=BoundsPen(glyphs)
    for ch in text:
        name=cmap[ord(ch)];glyph=glyphs[name];pen=SVGPathPen(glyphs);glyph.draw(pen)
        glyph.draw(TransformPen(bounds,Transform().translate(advance,0)))
        body.append(f'<path transform="translate({advance} 0)" d="{pen.getCommands()}"/>')
        advance+=font['hmtx'][name][0]
    assert bounds.bounds is not None,text
    return ''.join(body),bounds.bounds


def text_outline(text,box,ink,*,font='C:/Windows/Fonts/times.ttf',stretch=False,attribute='data-marker-text'):
    body,(gl,gb,gr,gt)=_font_paths(text,font);l,t,r,b=box
    sx,sy=(r-l)/(gr-gl),(b-t)/(gt-gb)
    if not stretch:sx=sy=min(sx,sy)
    tx,ty=(l+r)/2-(gl+gr)/2*sx,(t+b)/2+(gb+gt)/2*sy
    return f'<g {attribute}="{text}" fill="{ink}" transform="matrix({sx:.12f} 0 0 {-sy:.12f} {tx:.12f} {ty:.12f})">{body}</g>'


def greek_alpha(box,ink):
    """One font outline and optical aspect for map discs and adjacent links."""
    l,t,r,b=box;ratio=25/22
    width=min(r-l,(b-t)*ratio);height=width/ratio
    cx,cy=(l+r)/2,(t+b)/2
    body=text_outline('α',(cx-width/2,cy-height/2,cx+width/2,cy+height/2),ink,stretch=True)
    return f'<g data-shared-alpha="map-alpha-25x22">{body}</g>'


def scallop_path(cx=41,cy=41,radius=34,depth=1.7,lobes=11):
    """One regular field from analytic cubics, not source-image points."""
    def point(a):
        r=radius+depth*math.cos(lobes*a)
        return cx+r*math.cos(a),cy+r*math.sin(a)
    def derivative(a):
        r=radius+depth*math.cos(lobes*a);dr=-depth*lobes*math.sin(lobes*a)
        return dr*math.cos(a)-r*math.sin(a),dr*math.sin(a)+r*math.cos(a)
    fmt=lambda p:f'{p[0]:.9f} {p[1]:.9f}'
    count=lobes*4;step=2*math.pi/count;d='M'+fmt(point(-math.pi/2))
    for i in range(count):
        a=-math.pi/2+i*step;b=a+step;p0,p1=point(a),point(b);v0,v1=derivative(a),derivative(b)
        c0=(p0[0]+v0[0]*step/3,p0[1]+v0[1]*step/3);c1=(p1[0]-v1[0]*step/3,p1[1]-v1[1]*step/3)
        d+='C'+fmt(c0)+' '+fmt(c1)+' '+fmt(p1)
    return d+'Z'


def backing(tab,palette,*,scalloped=False):
    outer,field=palette['rim'],palette['field'];body=''
    corners={'TL':(1,1),'TR':(41,1),'BR':(41,41),'BL':(1,41)}
    if tab in corners:
        x,y=corners[tab];body+=f'<rect data-backing-tab="{tab}" x="{x}" y="{y}" width="40" height="40" fill="{outer}"/>'
    else:assert tab=='none',tab
    body+=f'<circle data-backing-circle="true" cx="41" cy="41" r="40" fill="{outer}"/>'
    if scalloped:body+=f'<path data-backing-inner="scallop-11" d="{scallop_path()}" fill="{field}"/>'
    else:body+=f'<circle data-backing-inner="circle" cx="41" cy="41" r="34.5" fill="{field}"/>'
    return body


def round_marker(meta,palette,component_path=None):
    body=backing(meta['tab'],palette,scalloped=meta.get('scalloped',False));kind=meta['type']
    box=meta.get('contentBox',[13,13,69,69])
    if kind=='greek_alpha':body+=greek_alpha(box,palette['ink'])
    elif kind=='greek_beta':body+=text_outline('β',box,palette['ink'],stretch=True)
    elif component_path is None:return None
    else:body+=emblem(component_path,box,palette['ink'],meta.get('variantId',kind))
    x,y=meta['center'][0]-41,meta['center'][1]-41
    return f'<g data-marker-template="{meta["layoutId"]}" transform="translate({x:g} {y:g})">{body}</g>'


def banner_local(text,palette):
    assert re.fullmatch(r'\*[0-9]\*[0-9]',text),text
    rim,field,ink=palette['rim'],palette['field'],palette['ink']
    tails='M1 7H17V48H1L6 28Z M121 7H137L132 28L137 48H121Z'
    body=f'<path d="{tails}" fill="{field}" stroke="{rim}" stroke-width="1.4" stroke-linejoin="miter"/>'
    body+=f'<path d="M4 11H13V44H4 M125 11H134 M125 44H134" fill="none" stroke="{rim}" stroke-width=".8"/>'
    body+=f'<rect data-banner-frame="outer" x="10" y="2.5" width="118" height="40" fill="{field}" stroke="{rim}" stroke-width="1.4"/>'
    body+=f'<rect data-banner-frame="inner" x="14" y="6" width="110" height="32.5" fill="none" stroke="{rim}" stroke-width="1.1"/>'
    body+=text_outline('*',(32.5,18,43.5,29),ink)+text_outline(text[1],(48,12.5,66,34.5),ink)
    body+=text_outline('*',(71,18,82,29),ink)+text_outline(text[3],(87,12.5,105,34.5),ink)
    return f'<g data-secret-number="{text}" data-shared-banner="138x50">{body}</g>'


def secret_banner(meta,palette):
    cx,cy=meta['center'];return f'<g transform="translate({cx-69:g} {cy-25:g})">{banner_local(meta["text"],palette)}</g>'


def city_nameplate(meta,palette,city_component):
    rim,field,ink=palette['rim'],palette['field'],palette['ink']
    body=f'<g transform="translate(110 0)">{backing("TR",palette)}{emblem(city_component,(19.5,20,62.5,59.5),ink,"city")}</g>'
    tails='M1 85H30V135H1L13 110Z M281 85H310L298 110L310 135H281Z'
    body+=f'<path d="{tails}" fill="{field}" stroke="{rim}" stroke-width="1.2"/>'
    body+=f'<rect x="25" y="80" width="261" height="49" fill="{field}" stroke="{rim}" stroke-width="1.3"/>'
    body+=f'<rect x="29" y="84" width="253" height="41" fill="none" stroke="{rim}" stroke-width=".9"/>'
    body+=text_outline('克诺索斯',(32,89,128,115),ink,font='C:/Windows/Fonts/simsun.ttc')
    body+=text_outline('KNOSSOS',(129,89,279,115),ink)
    cx,cy=meta['center'];return f'<g data-city-name="克诺索斯KNOSSOS" transform="translate({cx-155.5:g} {cy-68:g})">{body}</g>'


def hidden_numbers(records):
    body=''
    for number in records:
        l,t,r,b=number['bounds'];glyph=text_outline(number['text'],number['bounds'],number['color'],stretch=True,attribute='data-hidden-number')
        angle=-float(number.get('angle',0));cx,cy=(l+r)/2,(t+b)/2
        body+=f'<g data-hidden-angle="{-angle:g}" transform="rotate({angle:g} {cx:g} {cy:g})">{glyph}</g>'
    return body


def pending(meta):
    l,t,r,b=meta['sourceBBox']
    return (f'<g data-pending-emblem="{meta.get("variantId",meta["type"])}"><rect x="{l:g}" y="{t:g}" width="{r-l:g}" height="{b-t:g}" '
            'fill="none" stroke="#f476c6" stroke-width="1.5" stroke-dasharray="4 3"/></g>')
