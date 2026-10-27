"""Verify straight, symmetric pointer geometry without importing its builder.

The source raster supplies dimensions only. Five polygon sides, bilateral
symmetry, point direction and the constant inward rim are checked directly
from each saved SVG, rather than accepting source-contour similarity.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/map-link-vector-review-20261025/native-samples'
BEFORE = OUT / 'arrows-before-geometric-fix'
NS = 'http://www.w3.org/2000/svg'
TOLERANCE = 1e-6


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close(a, b, tolerance=TOLERANCE):
    return abs(a-b) <= tolerance


def vertices(node):
    tag = node.tag.rsplit('}', 1)[-1]
    if tag == 'polygon':
        raw = node.get('points')
    else:
        require(tag == 'path', 'Arrow must use a polygon or straight closed path')
        raw = node.get('d')
        require(bool(re.fullmatch(r'M[-\d.,]+(?:L[-\d.,]+){4}Z', raw)),
                'Arrow path must contain exactly five straight sides')
    values = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', raw)]
    require(len(values) == 10, 'Arrow must have exactly five vertices')
    result = list(zip(values[::2], values[1::2]))
    require(len(set(result)) == 5, 'Arrow contains a repeated vertex')
    return result


def edges(points):
    return list(zip(points, points[1:]+points[:1]))


def check_symmetry(points, center, key):
    for x, y in points:
        require(any(close(2*center-x, xx) and close(y, yy) for xx, yy in points),
                f'{key}: arrow is not mirrored around its horizontal center')


def audit_arrow(arrow, key):
    require(arrow.get('data-arrow-geometry') == 'symmetric-five-straight-sides',
            f'{key}: missing geometric-arrow declaration')
    source = [float(v) for v in arrow.get('data-source-bbox').split()]
    require(len(source) == 4, f'{key}: source arrow bounds')
    l,t,r,b = source
    require(l<r and t<b, f'{key}: invalid source bounds')
    layers = {node.get('data-arrow-inset'):node for node in arrow}
    require(set(layers) == {'0','2'}, f'{key}: unexpected pointer layers')
    require(all(node.get('stroke') in (None,'none') and node.get('style') is None
                for node in layers.values()), f'{key}: expanding or hidden arrow stroke')
    outer, inner = vertices(layers['0']), vertices(layers['2'])
    actual = [min(x for x,y in outer),min(y for x,y in outer),
              max(x for x,y in outer),max(y for x,y in outer)]
    require(all(close(a,s) for a,s in zip(actual,source)), f'{key}: outer dimensions drifted')
    cx=(l+r)/2
    check_symmetry(outer,cx,key)
    check_symmetry(inner,cx,key)
    direction=arrow.get('data-arrow')
    require(direction in ('up','down'), f'{key}: unexpected pointer direction')
    tip_y=t if direction=='up' else b
    base_y=b if direction=='up' else t
    require(any(close(x,cx) and close(y,tip_y) for x,y in outer), f'{key}: tip is not centered')
    require(sum(close(y,tip_y) for x,y in outer)==1, f'{key}: tip is not a unique corner')
    shoulders=[(x,y) for x,y in outer if (close(x,l) or close(x,r)) and not close(y,base_y)]
    require(len(shoulders)==2 and close(shoulders[0][1],shoulders[1][1]), f'{key}: shoulders differ in height')
    require(t<shoulders[0][1]<b, f'{key}: missing vertical sidewalls')
    require(any(close(x,l) and close(y,base_y) for x,y in outer) and
            any(close(x,r) and close(y,base_y) for x,y in outer), f'{key}: base is not horizontal')
    # Check the true normal distance, rather than comparing raw vertex offsets:
    # oblique sides need a larger vertex displacement to retain a 2px rim.
    distances=[]
    outer_edges=edges(outer)
    for (a,z),(p,q) in zip(outer_edges,edges(inner)):
        dx,dy=z[0]-a[0],z[1]-a[1]
        ex,ey=q[0]-p[0],q[1]-p[1]
        length=math.hypot(dx,dy)
        require(length>0 and math.hypot(ex,ey)>0, f'{key}: zero-length side')
        require(abs(dx*ey-dy*ex)/(length*math.hypot(ex,ey))<TOLERANCE,
                f'{key}: inset side is not parallel')
        distance=abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/length
        require(close(distance,2), f'{key}: rim is not a constant 2px inward offset: {distance}')
        distances.append(distance)
    # All inner vertices must be on the interior side of every exterior edge.
    area=sum(x*y1-x1*y for (x,y),(x1,y1) in outer_edges)
    orientation=1 if area>0 else -1
    require(all(orientation*((z[0]-a[0])*(p[1]-a[1])-(z[1]-a[1])*(p[0]-a[0]))>0
                for a,z in outer_edges for p in inner), f'{key}: inner fill escapes the rim')
    return {'direction':direction,'sourceBBox':source,'outerBBox':actual,
            'verticesPerLayer':5,'straightSidesPerLayer':5,'bilateralSymmetry':True,
            'tipCentered':True,'shouldersLevel':True,'boundingBoxError':0,
            'minimumNormalInset':min(distances),'maximumNormalInset':max(distances)}


def contact(records, inventory):
    chosen_ids=['c1-tile-027-front--up-1','c2-tile-021-front--up-1',
                'c3-tile-050-front--down-1','c4-tile-011-front--up-1',
                'c5-tile-040-front--down-2']
    rows=[next(row for row in records if row['id']==ident) for ident in chosen_ids]
    sheet=Image.new('RGB',(1500,len(rows)*245),'#24343b')
    draw=ImageDraw.Draw(sheet)
    for row_index,row in enumerate(rows):
        source=inventory[row['key']]
        part=next(p for p in source['arrows'] if p['panelId']==row['panelId'])
        l,t,r,b=part['bbox'];box=[l-3,t-3,r+3,b+3]
        original=Image.open(ROOT/source['source']).convert('RGBA').crop(box)
        crops=[original]
        for directory in (BEFORE,OUT):
            render=Image.open(directory/row['render']).convert('RGBA')
            scale=render.width/(row['bbox'][2]-row['bbox'][0])
            local=[round((box[i]-row['bbox'][i%2])*scale) for i in range(4)]
            crops.append(render.crop(local))
        y=row_index*245
        draw.text((14,y+10),row['id'],fill='white')
        for column,(art,label) in enumerate(zip(crops,['SOURCE SCAN','BEFORE: traced scan edge','AFTER: five symmetric straight sides'])):
            art=ImageOps.contain(art,(455,175))
            board=Image.new('RGBA',(480,185),'#6c7577')
            board.alpha_composite(art,((480-art.width)//2,(185-art.height)//2))
            sheet.paste(board.convert('RGB'),(column*500+10,y+32))
            draw.text((column*500+14,y+222),label,fill='white')
    sheet.save(OUT/'arrow-straight-comparison.jpg',quality=96)


def main():
    report=json.loads((OUT/'report.json').read_text(encoding='utf-8'))
    inventory={row['key']:row for row in json.loads((OUT.parent/'inventory.json').read_text(encoding='utf-8'))['faces']}
    checks=[]
    for row in report['records']:
        root=ET.parse(OUT/row['vector']).getroot()
        source=inventory[row['key']]
        for arrow in (node for node in root.iter() if node.get('data-arrow')):
            check=audit_arrow(arrow,row['id'])
            expected=next(p for p in source['arrows'] if p['panelId']==row['panelId'] and p['direction']==check['direction'])
            require(check['sourceBBox']==expected['bbox'],f'{row["id"]}: source dimension declaration differs from inventory')
            checks.append({'id':row['id'],**check})
    require(len(checks)==19,'Expected all 19 native sample pointers')
    contact(report['records'],inventory)
    result={'status':'passed','installation':'none','arrows':len(checks),
            'method':'Independent SVG geometry: five straight sides, mirror symmetry, inventory bounds and parallel inward offsets.',
            'sourceBoundingBoxesPreserved':True,'maximumSymmetryError':0,'rimInset':2,
            'comparison':'arrow-straight-comparison.jpg','checks':checks}
    (OUT/'arrow-geometry-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='checks'}))


if __name__=='__main__':
    main()
