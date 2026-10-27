"""Independently audit the shared semantic templates, not scan-shaped paths.

Constructs every requested panel. Same structural layouts must yield identical
frame XML and geometry metadata even when their numbers and factions differ.
Real C4 path extrema, clean glyph provenance, Greeks, locks and arrows are also
checked. No installed artwork is modified.
"""
from __future__ import annotations
from collections import Counter
from copy import deepcopy
import ast
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

import map_link_templates as template
from map_original_components import validate_artwork,records as original_records,verified_record

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-link-vector-source'
NS='http://www.w3.org/2000/svg'
OUT=ROOT/'output/map-link-vector-install-20261025'


def local_transform(value):
    result=Transform()
    for operation,args in re.findall(r'(matrix|translate|scale)\s*\(([^)]*)\)',value or ''):
        values=[float(v)for v in re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',args)]
        if operation=='matrix':part=Transform(*values)
        elif operation=='translate':part=Transform().translate(values[0],values[1]if len(values)>1 else 0)
        else:part=Transform().scale(values[0],values[1]if len(values)>1 else values[0])
        result=result.transform(part)
    return result


def actual_path_bounds(node):
    pen=BoundsPen(None)
    def walk(element,parent):
        matrix=parent.transform(local_transform(element.get('transform')))
        if element.tag.rsplit('}',1)[-1]=='path':
            parse_path(element.get('d'),TransformPen(pen,matrix))
        for child in element:walk(child,matrix)
    walk(node,Transform())
    assert pen.bounds is not None
    return pen.bounds


def pure_artwork(body):
    root=ET.fromstring(f'<svg xmlns="{NS}">{body}</svg>')
    validate_artwork(root)
    return root


def frames_only(body):
    root=pure_artwork(body)
    for node in root.iter():
        for child in list(node):
            if child.get('data-cell-content')is not None:node.remove(child)
    return ET.tostring(root,encoding='unicode')


def verify_dependencies():
    """Only geometry/native path generation may enter the drawing path."""
    forbidden={'map_link_content','map_link_vectors','scipy','numpy','PIL','skimage'}
    renderer=ROOT/'tools/map_link_templates.py'
    tree=ast.parse(renderer.read_text(encoding='utf-8'))
    imports=[]
    for node in ast.walk(tree):
        if isinstance(node,ast.Import):imports.extend(alias.name for alias in node.names)
        elif isinstance(node,ast.ImportFrom):imports.append(node.module or '')
        elif isinstance(node,ast.Call)and isinstance(node.func,ast.Name):
            assert node.func.id not in('vectorize_content','contour','trace_piece','_paths'),node.func.id
    assert not(forbidden&{name.split('.')[0]for name in imports}),imports
    # The helper imports audited native-sample geometry, so inspect the actual
    # call surface rather than forbidding its harmless source-audit imports.
    calls={node.attr for node in ast.walk(tree)if isinstance(node,ast.Attribute)
           and isinstance(node.value,ast.Name)and node.value.id=='native_sample'}
    assert calls<={'PALETTES','native','polygon','rect','waves','inset_polygon','joined_outline'},calls
    return {'rendererImports':imports,'nativeSampleGeometryCalls':sorted(calls)}


def descendants(cells):
    for cell in cells:
        yield cell
        if cell['type']=='compound':yield from descendants(cell.get('children',cell.get('compound')))


def verify_glyph_provenance(cells):
    glyphs={r['id']:r for r in json.loads((SOURCE/'glyphs/manifest.json').read_text(encoding='utf-8'))['glyphs']}
    counts=Counter();provenance={}
    for cell in descendants(cells):
        kind=cell['type'];value=cell.get('value')
        if kind not in('icon','greek','faction'):continue
        counts[kind]+=1
        if kind=='faction':
            assert value in template.native.FACTIONS,value
            path=template.native.SOURCE/f'{value}.svg';method='original-native-vector'
        else:
            if value=='alpha':
                path=ROOT/'tools/map_marker_templates.py'
                provenance[value]={'file':path.relative_to(ROOT).as_posix(),'method':'shared-map-alpha-font-outline','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                continue
            originals=original_records()
            if value in originals and not(SOURCE/'components'/f'{value}.svg').exists():
                record,_=verified_record(value)
                path=ROOT/record['file'];method='complete-original-alpha-component'
                provenance[value]={'file':record['file'],'method':method,'sha256':record['sha256'],'nativeVector':False}
                continue
            candidates=[SOURCE/'components'/f'{value}.svg']
            path=next((p for p in candidates if p.exists()),None)
            if path is None:
                assert value in glyphs,value
                method=glyphs[value]['method'];assert method!='isolated-bitmap-contour',value
                path=SOURCE/'glyphs'/f'{value}.svg'
            else:method='shared-geometric-component'
        pure_artwork(path.read_text(encoding='utf-8')[path.read_text(encoding='utf-8').index('>')+1:path.read_text(encoding='utf-8').rindex('</svg>')])
        provenance[value]={'file':str(path.relative_to(ROOT)).replace('\\','/'),'method':method,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    return counts,provenance


def verify():
    dependency=verify_dependencies()
    inventory=json.loads((SOURCE/'inventory.json').read_text(encoding='utf-8'))
    lookup={row['key']:row for row in inventory['faces']}
    geometry_path=SOURCE/'cells.json'
    if not geometry_path.exists():geometry_path=OUT/'cells.json'
    geometry=json.loads(geometry_path.read_text(encoding='utf-8'))
    geometry={(row['key'],panel['id']):panel for row in geometry['faces']for panel in row['panels']}
    contents={}
    for filename in ('contents-c1-c2.json','contents-c3-c4.json','contents-c5.json'):
        contents.update(json.loads((SOURCE/filename).read_text(encoding='utf-8'))['faces'])
    assert set(contents)==set(lookup)and len(contents)==511
    groups={};instances=[];glyphs={};types=Counter();totals=Counter();maximum_center=maximum_size=0
    for key,row in contents.items():
        source=lookup[key];cycle=source['cycle'];face=source['face']
        assert set(row['panels'])=={p['id']for p in source['panels']},key
        for panel_id,panel in row['panels'].items():
            source_panel=next(p for p in source['panels']if p['id']==panel_id)
            geom=geometry[key,panel_id]
            # Restricted circular discs are separate modules with no square
            # compartment in the main frame.
            assert len(panel['cells'])==len(geom['cells']),(key,panel_id)
            cells=[cell for cell in panel['cells']if cell['type']!='restricted']
            roofs=[i for i,cell in enumerate(geom['cells'])if cell['shape']=='roofed']
            counts,provenance=verify_glyph_provenance(cells);types.update(counts);glyphs.update(provenance)
            direction=source_panel['direction']
            body,size,signature_hash,signature=template.plate(cycle,face,direction,cells,roofs)
            root=pure_artwork(body)
            actual_layout=frames_only(body)
            structure=(cycle,face,direction,tuple((cell['type'],len(cell.get('children',cell.get('compound',[]))))for cell in cells),tuple(roofs))
            if structure in groups:
                previous=groups[structure]
                assert previous['signature']==signature,(key,panel_id,'same layout signature differs')
                assert previous['hash']==signature_hash,(key,panel_id,'same layout hash differs')
                assert previous['frame']==actual_layout,(key,panel_id,'same layout frame differs')
                assert previous['size']==size,(key,panel_id,'same layout size differs')
                previous['instances']+=1
            else:groups[structure]={'signature':signature,'hash':signature_hash,'frame':actual_layout,'size':size,'instances':1}
            assert signature_hash==hashlib.sha256(json.dumps(signature,sort_keys=True).encode()).hexdigest()
            totals['panels']+=1;totals['connectedLocks']+=sum(cell['type']=='restricted'for cell in panel['cells'])
            if cycle=='c4':
                expected=sum(cell['type']=='faction'for cell in cells)
                placements=[node for node in root.iter()if node.get('data-faction-placement')]
                assert len(placements)==expected,(key,panel_id)
                assert not any(node.get('data-kind')=='greek'and any(child.get('data-faction-placement')for child in node.iter())for node in root.iter())
                for placement in placements:
                    l,t,r,b=actual_path_bounds(placement);cx,cy=map(float,placement.get('data-field-center').split())
                    center=max(abs((l+r)/2-cx),abs((t+b)/2-cy));extent=abs(max(r-l,b-t)-46)
                    assert center<.00001 and extent<.00001,(key,panel_id,(l,t,r,b),(cx,cy))
                    maximum_center=max(maximum_center,center);maximum_size=max(maximum_size,extent);totals['c4FactionPlacements']+=1
                for node in root.iter():
                    if node.get('data-cell-inner-frame')or node.get('data-frame-network'):
                        assert node.get('stroke')=='#171713'and float(node.get('stroke-width'))==2,(key,panel_id)
                    if node.get('data-cell-fill'):assert node.get('fill')=='#b89b5a',(key,panel_id)
            else:
                for node in root.iter():
                    if node.get('data-cell-inner-frame')or node.get('data-frame-network'):
                        assert node.get('stroke')==template.palette(cycle,face)[2],(key,panel_id)
            # Source-independent glyph changes must leave frame hash unchanged.
            instances.append({'key':key,'panelId':panel_id,'layout':signature_hash,'size':size})
    assert totals['panels']==1575,totals
    assert totals['c4FactionPlacements']==262,totals
    # Four cardinal directions share one 59x28 arrow rotated as needed, across
    # every palette and arbitrary source rectangles.
    for cycle,face in [('c1','A'),('c2','A'),('c3','A'),('c4','A'),('c5','A'),('c5','B')]:
        for direction in('up','down','left','right'):
            body=template.arrow([30,40,88,67],direction,cycle,face);root=pure_artwork(body)
            group=next(node for node in root.iter()if node.get('data-arrow'))
            l,t,r,b=map(float,group.get('data-template-bbox').split())
            assert abs((l+r)/2-59)<1e-8 and abs((t+b)/2-53.5)<1e-8
            assert (r-l,b-t)==((59,28)if direction in('up','down')else(28,59))
            polygons=[node for node in group if node.tag.rsplit('}',1)[-1]=='polygon']
            assert len(polygons)==2 and all(len(node.get('points').split())==5 for node in polygons)
            assert polygons[0].get('fill')==template.palette(cycle,face)[2]
            totals['arrowCases']+=1
    # A source dark cyclops inset is real artwork, not the surrounding field.
    cyclops=pure_artwork(template.content({'type':'faction','value':'cyclopes'},(0,0,46,46),'#f8f0e6','#653b34','c2'))
    assert any(node.get('fill')=='#191919'for node in cyclops.iter())
    result={'status':'passed','faces':len(contents),'panels':totals['panels'],'layoutTemplates':len(groups),
            'reusedLayoutInstances':sum(group['instances']-1 for group in groups.values()),'connectedLocks':totals['connectedLocks'],
            'c4FactionPlacements':totals['c4FactionPlacements'],'c4MaximumActualPathCenterError':maximum_center,
            'c4MaximumActualPathSizeError':maximum_size,'arrowCases':totals['arrowCases'],
            'sourceTraceGlyphsAllowed':False,'geometryAndFrameCopiesIdentical':True,'cyclopsBlackInsetPreserved':True,
            'dependencyAudit':dependency,'glyphs':glyphs,'instances':instances}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'template-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items()if k not in('instances','glyphs','dependencyAudit')}))
    return result


if __name__=='__main__':verify()
