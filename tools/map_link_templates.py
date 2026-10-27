"""One clean, shared template for each link layout; source pixels are not drawn.

Only audited semantic contents enter this renderer. Repeated layouts use the
same local geometry, glyph sizes, frame widths and spacing on every map.
"""
from __future__ import annotations
from functools import lru_cache
import hashlib
import importlib.util
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.misc.transform import Transform
import re
from map_marker_templates import emblem as original_emblem,greek_alpha
from map_original_components import records as original_records

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(__file__).with_name('map-link-vector-source')
NS='http://www.w3.org/2000/svg'
spec=importlib.util.spec_from_file_location('link_template_native',ROOT/'tools/build-map-link-native-samples.py')
native_sample=importlib.util.module_from_spec(spec);spec.loader.exec_module(native_sample)
native=native_sample.native


def palette(cycle,face):return native_sample.PALETTES[f'c5:{face}'if cycle=='c5'else cycle]


def poly(points,fill,stroke=None,width=1.5,extra=''):
    return native_sample.polygon(points,fill,stroke,width,extra)


def transform(value):
    result=Transform()
    for name,args in re.findall(r'(matrix|translate|scale)\s*\(([^)]*)\)',value or ''):
        v=[float(x)for x in re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',args)]
        part=Transform(*v)if name=='matrix'else Transform().translate(v[0],v[1]if len(v)>1 else 0)if name=='translate'else Transform().scale(v[0],v[1]if len(v)>1 else v[0])
        result=result.transform(part)
    return result


@lru_cache(maxsize=None)
def path_bounds(path):
    root=ET.parse(path).getroot();pen=BoundsPen(None)
    def walk(node,parent):
        parent=parent.transform(transform(node.get('transform')))
        if node.tag.rsplit('}',1)[-1]=='path':parse_path(node.get('d'),TransformPen(pen,parent))
        for child in node:walk(child,parent)
    walk(root,Transform());assert pen.bounds is not None,path
    return pen.bounds


def placed_glyph(path,box,ink,bg,attribute):
    root=ET.parse(path).getroot()
    for node in root.iter():
        if attribute=='data-glyph="land_route"'and(node.get('data-land-layer')or node.get('data-land-axis')):
            # The land-route ledges have one audited opaque grey plane.
            # Both the source-white faces and the grey planes keep their
            # dedicated colours; other components use normal palette ink.
            continue
        for attr in ('fill','stroke'):
            value=node.get(attr)
            if value and value!='none':
                node.set(attr,bg if value.lower()in('#191919','#fff','#ffffff','white')else ink)
    gl,gt,gr,gb=path_bounds(str(path));l,t,r,b=box
    scale=min((r-l)/(gr-gl),(b-t)/(gb-gt))
    tx,ty=(l+r)/2-(gl+gr)/2*scale,(t+b)/2-(gt+gb)/2*scale
    body=''.join(ET.tostring(node,encoding='unicode')for node in root if node.tag.rsplit('}',1)[-1]not in('title','desc'))
    return f'<g {attribute} transform="matrix({scale:.12f} 0 0 {scale:.12f} {tx:.12f} {ty:.12f})">{body}</g>'


@lru_cache(maxsize=64)
def text_glyphs(text):
    font=TTFont('C:/Windows/Fonts/times.ttf');cmap=font.getBestCmap();glyphs=font.getGlyphSet();advance=0;paths=[];pen=BoundsPen(glyphs)
    for char in text:
        name=cmap[ord(char)];glyph=glyphs[name];outline=SVGPathPen(glyphs);glyph.draw(outline)
        glyph.draw(TransformPen(pen,Transform().translate(advance,0)))
        paths.append(f'<path transform="translate({advance} 0)" d="{outline.getCommands()}"/>')
        advance+=font['hmtx'][name][0]
    return ''.join(paths),pen.bounds


def letters(text,box,ink):
    if all(c in native.GLYPHS for c in text):return native.numeral(text,box,ink)
    body,(l,b,r,t)=text_glyphs(text);xl,yt,xr,yb=box
    scale=min((xr-xl)/(r-l),(yb-yt)/(t-b));tx=(xl+xr)/2-(l+r)/2*scale;ty=(yt+yb)/2+(b+t)/2*scale
    return f'<g data-number="{text}" fill="{ink}" transform="matrix({scale:.12f} 0 0 {-scale:.12f} {tx:.12f} {ty:.12f})">{body}</g>'


def content(meta,box,ink,bg,cycle):
    kind=meta.get('type',meta.get('kind'));value=meta.get('value');l,t,r,b=box
    if kind in('number','text'):return letters(value,box,ink)
    if kind=='faction':
        return placed_glyph(native.SOURCE/f'{value}.svg',box,ink,'#191919'if value=='cyclopes'else bg,f'data-faction="{value}"')
    if kind in('greek','icon'):
        if value=='alpha':
            return f'<g data-glyph="alpha">{greek_alpha(box,ink)}</g>'
        clean_component=SOURCE/'components'/f'{value}.svg'
        if clean_component.exists():
            if cycle=='c2'and value in('gate_route','gate_route_double'):
                # Both original map variants use the same complete 47x39 ink
                # box. Only the fixed pillar composition differs.
                cx,cy=(l+r)/2,(t+b)/2;box=(cx-23.5,cy-19.5,cx+23.5,cy+19.5)
            return placed_glyph(clean_component,box,ink,bg,f'data-glyph="{value}"')
        originals=original_records()
        if value in originals:
            graphic=original_emblem(ROOT/originals[value]['file'],box,ink,value,id_prefix='link')
            return f'<g data-glyph="{value}">{graphic}</g>'
        candidates=[SOURCE/'components'/f'{value}.svg']
        path=next((path for path in candidates if path.exists()),None)
        if path is None:
            manifest=json.loads((SOURCE/'glyphs/manifest.json').read_text(encoding='utf8'))
            record=next(r for r in manifest['glyphs']if r['id']==value)
            assert record['method']!='isolated-bitmap-contour',f'Pixel contours are forbidden in shared templates: {value}'
            path=SOURCE/'glyphs'/f'{value}.svg'
        assert path.exists(),(kind,value)
        return placed_glyph(path,box,ink,bg,f'data-glyph="{value}"')
    if kind=='waves':
        if cycle=='c2':
            cx=(l+r)/2;box=(cx-22.5,t,cx+22.5,b)
        return native_sample.waves(box,ink)
    if kind=='compound':
        children=meta.get('children',meta.get('compound'));assert children
        gap=8;w=(r-l-gap*(len(children)-1))/len(children)
        return ''.join(content(child,(l+i*(w+gap),t,l+i*(w+gap)+w,b),ink,bg,cycle)for i,child in enumerate(children))
    raise ValueError(f'Unsupported semantic link content: {meta}')


def lock_logo(cx,cy,ink,bg):
    # Full ink bbox 29x30, centered in the disc, shared by all occurrences.
    return (f'<g data-marker="restricted" data-disc-center="{cx:g} {cy:g}" data-centered-ink-bbox="{cx-14.5:g} {cy-15:g} {cx+14.5:g} {cy+15:g}" '
            f'transform="translate({cx-14.5:g} {cy-15:g}) scale({29/32:.12f} {30/32:.12f})">'
            f'<path d="M7 16V9Q7 2 16 2Q25 2 25 9V16" fill="none" stroke="{ink}" stroke-width="4"/>'
            +native_sample.rect(0,14,32,18,ink)+f'<circle cx="16" cy="21" r="3.7" fill="{bg}"/>'
            +native_sample.rect(14,21,4,9,bg)+'</g>')


def lock_disc(box,cycle,face):
    main,dark,rim,ink,_=palette(cycle,face);cx,cy=(box[0]+box[2])/2,(box[1]+box[3])/2
    bg='#40484e'if cycle=='c5'else dark
    body=f'<circle data-marker="restricted-disc" cx="{cx:g}" cy="{cy:g}" r="32.2" fill="{bg}" stroke="{rim}" stroke-width="5.6"/>'
    return body+lock_logo(cx,cy,ink,bg)


def dimensions(cells,direction,cycle,roof_indices):
    pointed=direction in('left','right')
    widths=[]
    for index,cell in enumerate(cells):
        kind=cell.get('type',cell.get('kind'))
        at_point=direction=='left'and index==0 or direction=='right'and index==len(cells)-1
        if kind in('number','text'):
            width=(104 if at_point else 97)if cycle=='c4'else(110 if at_point else 100)
        elif kind=='compound':width=64*len(cell.get('children',cell.get('compound')))
        else:width=(60 if pointed else 63)if cycle=='c4'else(74 if at_point else 64)
        widths.append(width)
    return widths,(66 if cycle=='c4'else 68),(17 if roof_indices else 0)


def plate(cycle,face,direction,cells,roof_indices=()):
    """Return local artwork, size and a hash of the shared layout geometry."""
    assert all(cell.get('type',cell.get('kind'))!='restricted'for cell in cells)
    main,dark,rim,ink,_=palette(cycle,face)
    widths,height,roof=dimensions(cells,direction,cycle,roof_indices)
    slant_pair=cycle=='c3'and direction=='special'and len(cells)==4 and [c.get('type',c.get('kind'))for c in cells]==['number','faction','number','faction']
    fills=[];inners=[];contents=[];shapes=[];shared=[];x=0;layout=[]
    for index,(meta,width)in enumerate(zip(cells,widths)):
        kind=meta.get('type',meta.get('kind'));is_left=direction=='left'and index==0;is_right=direction=='right'and index==len(cells)-1
        is_roof=index in roof_indices;base=roof
        if is_left:
            shape=[(x+20,base+1),(x+width,base+1),(x+width,base+height-1),(x+20,base+height-1),(x+1,base+height/2)]
        elif is_right:
            shape=[(x,base+1),(x+width-20,base+1),(x+width-1,base+height/2),(x+width-20,base+height-1),(x,base+height-1)]
        elif is_roof:
            shape=[(x,base+1),(x+width/2,1),(x+width,base+1),(x+width,base+height-1),(x,base+height-1)]
        else:shape=[(x,base+1),(x+width,base+1),(x+width,base+height-1),(x,base+height-1)]
        if slant_pair and index==1:
            shape[1]=(shape[1][0]+9,shape[1][1]);shape[2]=(shape[2][0]-9,shape[2][1])
        elif slant_pair and index==2:
            shape[0]=(shape[0][0]+9,shape[0][1]);shape[-1]=(shape[-1][0]-9,shape[-1][1])
        inside=native_sample.inset_polygon(shape,5.5 if cycle=='c4'else 5)
        shapes.append(shape)
        if index:shared.append((x+9,base+1,x-9,base+height-1)if slant_pair and index==2 else(x,base+1,x,base+height-1))
        field=main if kind in('number','text')else dark
        if cycle=='c5'and kind=='greek':field='#40484e'
        fills.append(poly(shape,main if cycle=='c4'else field,extra=f'data-cell-fill="true" data-compartment="{kind}"'))
        inners.append(poly(inside,field if cycle=='c4'else'none',rim,2 if cycle=='c4'else 1.55,extra='data-cell-inner-frame="true"'))
        # All content positions are template constants, never a source crop.
        cy=base+height/2;cx=x+width/2+(5 if is_left else -5 if is_right else 0)
        if kind in('number','text'):
            left=x+(27 if is_left else 12);right=x+width-(27 if is_right else 12)
            box=(left,cy-16,right,cy+16)
            colour='#393020'if cycle=='c4'else ink
        elif kind=='greek':box=(cx-14,cy-22,cx+14,cy+22);colour='#fdfaf4'if cycle=='c4'else ink
        elif kind=='waves':box=(x+11,cy-13,x+width-11,cy+13);colour=ink
        elif kind=='compound':box=(x+10,cy-23,x+width-10,cy+23);colour=ink
        else:
            size=46;box=(cx-size/2,cy-size/2,cx+size/2,cy+size/2);colour='#fdfaf4'if cycle=='c4'else ink
            if is_roof:box=(cx-size/2,cy-8-size/2,cx+size/2,cy-8+size/2)
        graphic=content(meta,box,colour,field,cycle)
        if cycle=='c4'and kind=='faction':
            graphic=f'<g data-faction-placement="centered" data-target-size="46" data-field-center="{cx:g} {cy:g}">{graphic}</g>'
        contents.append(f'<g data-cell-content="{index}" data-kind="{kind}">{graphic}</g>')
        layout.append({'kind':kind,'width':width,'shape':shape,'inner':inside,'contentBox':box})
        x+=width
    boundary=native_sample.joined_outline(shapes)
    seams=''.join(f'M{x0:g},{y0:g}L{x1:g},{y1:g}'for x0,y0,x1,y1 in shared)
    frame=f'<path data-frame-network="true" fill="none" stroke="{rim}" stroke-width="{2 if cycle=="c4"else 2.3}" stroke-linejoin="miter" d="{boundary+seams}"/>'
    signature={'cycle':cycle,'face':face,'direction':direction,'cells':[{'type':cell.get('type',cell.get('kind')),'children':len(cell.get('children',cell.get('compound',[])))}for cell in cells],
               'roofs':list(roof_indices),'geometry':layout}
    layout_hash=hashlib.sha256(json.dumps(signature,sort_keys=True).encode()).hexdigest()
    body=f'<g data-template-layout="{layout_hash}" data-frame-layout="{"c4-source-double-black"if cycle=="c4"else"rim-only"}">'+''.join(fills+inners+contents)+frame+'</g>'
    return body,(sum(widths),height+roof),layout_hash,signature


def arrow(box,direction,cycle,face):
    main,_,rim,_,_=palette(cycle,face)
    cx,cy=(box[0]+box[2])/2,(box[1]+box[3])/2
    if direction in('up','down'):l,t,r,b=cx-29.5,cy-14,cx+29.5,cy+14
    else:l,t,r,b=cx-14,cy-29.5,cx+14,cy+29.5
    points=([(l,b),(l,cy),(cx,t),(r,cy),(r,b)]if direction=='up'else[(l,t),(r,t),(r,cy),(cx,b),(l,cy)]if direction=='down'
            else[(r,t),(cx,t),(l,cy),(cx,b),(r,b)]if direction=='left'else[(l,t),(cx,t),(r,cy),(cx,b),(l,b)])
    body=f'<g data-arrow="{direction}" data-arrow-template="59x28" data-source-bbox="{" ".join(map(str,box))}" data-template-bbox="{l:g} {t:g} {r:g} {b:g}" data-rim-inset="2">'
    for inset,fill,vertices in((0,rim,points),(2,main,native_sample.inset_polygon(points,2))):body+=poly(vertices,fill,extra=f'data-arrow-inset="{inset}"')
    return body+'</g>'
