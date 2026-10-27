"""Audit pale shared rims without the unwanted fine dark support outline.

No production files are written. Polygon edge cancellation and frame path
segments are inspected directly; the generator's shared-edge labels are only
cross-checked, never used as the source of truth.
"""
from __future__ import annotations

from collections import Counter
import math
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import importlib.util
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/map-link-vector-review-20261025/native-samples'
BEFORE = OUT / 'frames-before-shared-edge-fix'
MISSING_WHITE = OUT / 'frames-with-missing-white-seams'
PALETTE_BEFORE = OUT / 'c4-before-palette-fix'
NS = 'http://www.w3.org/2000/svg'
arrow_spec=importlib.util.spec_from_file_location('arrow_geometry_check',ROOT/'tools/verify-map-link-native-arrows.py')
arrow_check=importlib.util.module_from_spec(arrow_spec)
arrow_spec.loader.exec_module(arrow_check)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def points(text):
    values = [float(value) for value in re.findall(r'-?\d+(?:\.\d+)?', text)]
    require(len(values) % 2 == 0, 'Odd polygon coordinate count')
    return list(zip(values[::2], values[1::2]))


def edges(vertices):
    return list(zip(vertices, vertices[1:] + vertices[:1]))


def path_vertices(text):
    require(bool(re.fullmatch(r'M[-\d.,]+(?:L[-\d.,]+)+Z', text)),
            'Joined frame must be one closed polygonal path')
    return points(text)


def path_edges(text):
    require(bool(re.fullmatch(r'M[-\d.,]+(?:L[-\d.,]+)+(?:Z)?', text)),
            'Frame must contain only straight polygon sides')
    vertices = points(text)
    return edges(vertices) if text.endswith('Z') else list(zip(vertices, vertices[1:]))


def canonical(edge):
    return tuple(sorted(edge))


def signature(element):
    return (element.tag, tuple(sorted(element.attrib.items())),
            (element.text or '').strip(), tuple(map(signature, element)))


def geometry_signature(element):
    return (element.tag, tuple(sorted((key,value) for key,value in element.attrib.items()
                                     if key != 'fill')),
            (element.text or '').strip(), tuple(map(geometry_signature, element)))


def identified(root, attribute):
    return {node.get(attribute): signature(node) for node in root.iter()
            if node.get(attribute)}


def compare_artwork(current, previous, key, rim):
    for attribute in ('data-number', 'data-faction', 'data-greek'):
        if key.startswith('c4-') and attribute == 'data-faction':
            one={node.get(attribute):geometry_signature(node) for node in current.iter() if node.get(attribute)}
            old={node.get(attribute):geometry_signature(node) for node in previous.iter() if node.get(attribute)}
        else:
            one,old=identified(current, attribute),identified(previous, attribute)
        require(one == old,
                f'{key}: existing {attribute} artwork changed with frame edit')
    for marker in ('restricted', 'restricted-disc', 'three-water-bands'):
        one = [signature(node) for node in current.iter() if node.get('data-marker') == marker]
        old = [signature(node) for node in previous.iter() if node.get('data-marker') == marker]
        require(one == old, f'{key}: {marker} changed with frame edit')
    arrows = {node.get('data-arrow'):node for node in current.iter() if node.get('data-arrow')}
    old_arrows = {node.get('data-arrow'):node for node in previous.iter() if node.get('data-arrow')}
    require(arrows.keys() == old_arrows.keys(), f'{key}: arrow inventory changed')
    for ident, arrow in arrows.items():
        old = old_arrows[ident]
        require(arrow.get('data-source-bbox') == old.get('data-source-bbox'), f'{key}: arrow dimensions/position changed')
        layers = {node.get('data-arrow-inset'):node for node in arrow}
        old_layers = {node.get('data-arrow-inset'):node for node in old}
        require(set(layers) == {'0','2'}, f'{key}: unwanted dark/intermediate pointer layer')
        require(layers['0'].get('fill') == rim, f'{key}: arrow still has fine dark support')
        require(layers['2'].get('fill') == old_layers['2'].get('fill'), f'{key}: arrow field colour changed')
        # The user explicitly replaced scanned contours with regular five-sided
        # geometry. Audit that geometry independently instead of retaining noise.
        arrow_check.audit_arrow(arrow,key)


def contact(records):
    keys = ['c1-tile-027-front--up-1', 'c5-tile-040-front--up-1',
            'c2-tile-021-front--up-1']
    chosen = [next(row for row in records if row['id'] == key) for key in keys]
    sheet = Image.new('RGB', (1500, 840), '#24343b')
    draw = ImageDraw.Draw(sheet)
    for row_index, row in enumerate(chosen):
        y = row_index * 280
        draw.text((14, y + 10), f'{row["id"]} / {len(row["cells"])} joined cells', fill='white')
        paths = [BEFORE / row['render'], MISSING_WHITE / row['render'], OUT / row['render']]
        labels = ['BEFORE: unwanted fine dark outlines', 'PREVIOUS MISTAKE: missing white seams', 'CORRECTED: pale seams, no dark support']
        for column, (path, label) in enumerate(zip(paths, labels)):
            artwork = ImageOps.contain(Image.open(path).convert('RGBA'), (466, 200))
            board = Image.new('RGBA', (480, 210), '#6c7577')
            board.alpha_composite(artwork, ((480-artwork.width)//2, (210-artwork.height)//2))
            sheet.paste(board.convert('RGB'), (column*500 + 10, y + 36))
            draw.text((column*500 + 14, y + 253), label, fill='white')
    sheet.save(OUT / 'white-seam-comparison.jpg', quality=96)
    # The previous filename is linked in the chat. Replace its misleading
    # deleted-white-line comparison with the current corrected comparison.
    sheet.save(OUT / 'shared-frame-comparison.jpg', quality=96)


def affine_product(parent,local):
    a,b,c,d,e,f=parent;g,h,i,j,k,l=local
    return (a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f)


def element_matrix(node):
    raw=node.get('transform')
    if not raw:return (1,0,0,1,0,0)
    if raw.startswith('translate('):
        values=[float(v) for v in re.findall(r'-?\d+(?:\.\d+)?',raw)]
        return (1,0,0,1,values[0],values[1] if len(values)>1 else 0)
    require(raw.startswith('matrix('),'Unexpected C4 native transform')
    values=[float(v) for v in re.findall(r'-?\d+(?:\.\d+)?',raw)]
    require(len(values)==6,'Invalid C4 native matrix')
    return tuple(values)


def actual_path_bounds(node):
    """Bezier extrema after every nested rotation/scale, not claimed metadata."""
    pen=BoundsPen(None)
    def walk(element,parent):
        matrix=affine_product(parent,element_matrix(element))
        if element.tag.rsplit('}',1)[-1]=='path':parse_path(element.get('d'),TransformPen(pen,matrix))
        for child in element:walk(child,matrix)
    walk(node,(1,0,0,1,0,0))
    return list(pen.bounds)


def faction_placement(cell,key):
    inner=next(node for node in cell if node.get('data-cell-inner-frame'))
    inner_points=points(inner.get('points'))
    bounds=[min(x for x,y in inner_points),min(y for x,y in inner_points),max(x for x,y in inner_points),max(y for x,y in inner_points)]
    field_center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]
    wrapper=next(node for node in cell if node.get('data-faction-placement'))
    glyph=next(node for node in wrapper.iter() if node.get('data-faction'))
    require(wrapper.get('data-faction-placement')=='centered' and float(wrapper.get('data-target-size'))==46,
            f'{key}: emblem must use the common 46px target')
    announced=list(map(float,wrapper.get('data-field-center').split()))
    require(announced==field_center,f'{key}: declared dark-field center incorrect')
    matrix=element_matrix(glyph)
    require(abs(matrix[0]-matrix[3])<1e-9 and abs(matrix[1])+abs(matrix[2])<1e-9,
            f'{key}: C4 emblem aspect ratio distorted')
    actual=actual_path_bounds(wrapper)
    center=[(actual[0]+actual[2])/2,(actual[1]+actual[3])/2]
    size=[actual[2]-actual[0],actual[3]-actual[1]]
    center_error=[center[i]-field_center[i] for i in (0,1)]
    gaps={'left':actual[0]-bounds[0],'right':bounds[2]-actual[2],
          'top':actual[1]-bounds[1],'bottom':bounds[3]-actual[3]}
    require(max(abs(value) for value in center_error)<1e-5,
            f'{key}: actual visible emblem is off-center: {center_error}')
    require(abs(max(size)-46)<1e-5,f'{key}: actual emblem does not use the common 46px target')
    require(abs(gaps['top']-gaps['bottom'])<2e-5 and abs(gaps['left']-gaps['right'])<2e-5,
            f'{key}: actual emblem clearances are not symmetric')
    require(min(gaps.values())>1,f'{key}: emblem touches the inner black frame')
    return {'fieldBBox':bounds,'fieldCenter':field_center,'nativeScale':matrix[0],
            'actualInkBBox':actual,'actualInkSize':size,'actualInkCenter':center,
            'centerError':center_error,'clearances':gaps,
            'verticalClearanceDifference':gaps['top']-gaps['bottom']}


def audit_source_c4(root,previous,record):
    """Check source-measured black/yellow/black construction independently."""
    key=record['id']
    plate=next(node for node in root.iter() if node.get('data-native-plate'))
    require(plate.get('data-frame-layout')=='c4-source-double-black',f'{key}: wrong C4 construction')
    require(plate.get('transform') is None,f'{key}: C4 source coordinates must not be rescaled')
    expected={
        'up-1':([430,81.5,590,147],527),
        'left-1':([45,478.5,209,539],149),
        'right-1':([811,479,974,543],872),
        'down-1':([431,876.5,591,942],528),
    }
    bounds,split=expected[record['panelId']]
    cells=[node for node in plate if node.get('data-compartment')]
    require([node.get('data-compartment') for node in cells]==[cell['kind'] for cell in record['cells']],f'{key}: cell order changed')
    union=Counter();outer_shapes=[];cell_heights=[]
    for cell in cells:
        kind=cell.get('data-compartment')
        fill=next(node for node in cell if node.get('data-cell-fill'))
        inner=next(node for node in cell if node.get('data-cell-inner-frame'))
        outer_points=points(fill.get('points'));inner_points=points(inner.get('points'))
        require(fill.get('fill')=='#b89b5a' and fill.get('stroke') in (None,'none'),f'{key}: yellow band backing missing')
        require(inner.get('stroke')=='#171713' and float(inner.get('stroke-width'))==2,f'{key}: inner black rule is not 2px')
        require(inner.get('fill')==('#b89b5a' if kind=='number' else '#3b3733'),f'{key}: wrong interior field')
        require(len(outer_points)==len(inner_points),f'{key}: frame side count changed')
        for (start,end),inside in zip(edges(outer_points),inner_points):
            dx,dy=end[0]-start[0],end[1]-start[1]
            distances=[abs(dx*(p[1]-start[1])-dy*(p[0]-start[0]))/math.hypot(dx,dy) for p in inner_points]
            require(abs(min(distances)-5.5)<1e-4,f'{key}: inset is not source 5.5px')
        ys=[p[1] for p in outer_points]
        require(min(ys)==bounds[1] and max(ys)==bounds[3],f'{key}: cells do not share source top/bottom')
        cell_heights.append(max(ys)-min(ys));outer_shapes.append(outer_points)
        union.update(map(canonical,edges(outer_points)))
    require(len(set(cell_heights))==1,f'{key}: faction is taller than number')
    faction_cell=next(cell for cell in cells if cell.get('data-compartment')=='faction')
    placement=faction_placement(faction_cell,key)
    outside={edge for edge,count in union.items() if count==1};shared={edge for edge,count in union.items() if count==2}
    require(shared=={canonical(((split,bounds[1]),(split,bounds[3])))},f'{key}: shared boundary differs from source')
    frames=[node for node in plate if node.get('data-joined-frame')]
    shared_frames=[node for node in plate if node.get('data-shared-rim')]
    require(len(frames)==len(shared_frames)==1,f'{key}: frame duplicated')
    frame=frames[0];shared_frame=shared_frames[0]
    require(set(map(canonical,path_edges(frame.get('d'))))==outside,f'{key}: outer black rim is not exact exterior')
    require(set(map(canonical,path_edges(shared_frame.get('d'))))==shared,f'{key}: shared black rim repeated or missing')
    for node in frames+shared_frames:
        require(node.get('fill')=='none' and node.get('stroke')=='#171713' and float(node.get('stroke-width'))==2,
                f'{key}: outer/inner rules must be equally 2px black')
    all_outer=[point for shape in outer_shapes for point in shape]
    actual=[min(p[0] for p in all_outer),min(p[1] for p in all_outer),max(p[0] for p in all_outer),max(p[1] for p in all_outer)]
    require(actual==bounds,f'{key}: printed black-line bounds changed')
    stroke_nodes=[node for node in plate if node.get('stroke') not in (None,'none')]
    require(stroke_nodes==frames+shared_frames,f'{key}: unwanted black support or extra border')
    underlay=next(node for node in plate if node.get('data-panel-underlay'))
    require(underlay.get('d')==frame.get('d') and underlay.get('fill')=='#b89b5a',f'{key}: wrong common field')
    for attribute in ('data-number','data-faction'):
        one={node.get(attribute):node for node in root.iter() if node.get(attribute)}
        old={node.get(attribute):node for node in previous.iter() if node.get(attribute)}
        require(one.keys()==old.keys(),f'{key}: glyph content changed')
        for ident,node in one.items():
            paths=[child.get('d') for child in node.iter() if child.tag.rsplit('}',1)[-1]=='path']
            old_paths=[child.get('d') for child in old[ident].iter() if child.tag.rsplit('}',1)[-1]=='path']
            require(paths==old_paths,f'{key}: native glyph path was redrawn')
    for attribute in ('data-greek','data-arrow'):
        require(identified(root,attribute)==identified(previous,attribute),f'{key}: unrelated artwork changed')
    return {'id':key,'cells':2,'normalSharedRimsPreserved':1,'outerFrameLoops':1,'fineDarkSupportLayers':0,
            'sourceFrameBounds':bounds,'sourceSplitX':split,'equalCellHeight':cell_heights[0],
            'outerBlackWidth':2,'innerBlackWidth':2,'normalInset':5.5,'yellowBandClearWidth':3.5,
            'factionInterior':'#3b3733','yellowBand':'#b89b5a','glyphPathsUnchanged':True,
            'arrowDimensionsPreserved':True,'arrowsUseSymmetricFiveStraightSides':True,
            'factionPlacement':placement}


def main():
    report = json.loads((OUT / 'report.json').read_text(encoding='utf-8'))
    records = report['records']
    require(len(records) == 37, 'Expected 37 native samples')
    checks = []
    source_c4_checks=[]
    for record in records:
        key = record['id']
        root = ET.parse(OUT / record['vector']).getroot()
        old = ET.parse(BEFORE / record['vector']).getroot()
        require(root.get('viewBox') == old.get('viewBox'), f'{key}: viewBox changed')
        require(root.get('width') == old.get('width') and root.get('height') == old.get('height'),
                f'{key}: canvas dimensions changed')
        if record['cycle']=='c4':
            palette_old=ET.parse(PALETTE_BEFORE/record['vector']).getroot()
            case=audit_source_c4(root,palette_old,record)
            checks.append(case);source_c4_checks.append(case)
            continue
        plates = [node for node in root.iter() if node.get('data-native-plate')]
        require(len(plates) == 1, f'{key}: plate count')
        plate = plates[0]
        require(plate.get('data-frame-layout') == 'rim-only', f'{key}: frame layout')
        compartments = [node for node in plate if node.get('data-compartment')]
        require(len(compartments) == len(record['cells']), f'{key}: cell count')
        union = Counter()
        fills = []
        inside_frames = []
        ranges = []
        for compartment in compartments:
            fill = [node for node in compartment if node.get('data-cell-fill') == 'true']
            inner = [node for node in compartment if node.get('data-cell-inner-frame') == 'true']
            require(len(fill) == len(inner) == 1, f'{key}: cell frame/fill ownership')
            require(fill[0].get('stroke') in (None, 'none') and fill[0].get('style') is None,
                    f'{key}: cell still strokes its boundary')
            vertices = points(fill[0].get('points'))
            fills.append(vertices)
            inside_frames.append(inner[0])
            ranges.append(tuple(map(float, compartment.get('data-cell-range').split())))
            union.update(map(canonical, edges(vertices)))
        require(all(count in (1, 2) for count in union.values()), f'{key}: overlapping fill edges')
        shared = {edge for edge, count in union.items() if count == 2}
        outside = {edge for edge, count in union.items() if count == 1}
        require(len(shared) == len(compartments)-1, f'{key}: connected cells did not share exact boundaries')
        frame = [node for node in plate if node.get('data-joined-frame')]
        is_c4=record['cycle']=='c4'
        require([node.get('data-joined-frame') for node in frame] == (['rim','rim'] if is_c4 else ['rim']),
                f'{key}: only the normal rim may outline the exterior; no dark support')
        require(all(float(node.get('stroke-width')) == 2.3 for node in frame), f'{key}: normal rim width changed')
        require(all(node.get('fill') == 'none' for node in frame), f'{key}: frame overlays fill')
        actual_edges = Counter(canonical(edge) for node in frame for edge in path_edges(node.get('d')))
        require(actual_edges == Counter({edge:1 for edge in outside}), f'{key}: frame is not the exact unique union exterior')
        require(not set(actual_edges).intersection(shared), f'{key}: exterior path repeats a shared edge')
        if is_c4:
            for node in frame:
                kind=node.get('data-frame-cell')
                require(kind in ('number','faction'), f'{key}: missing C4 frame cell ownership')
                index=next(i for i,cell in enumerate(compartments) if cell.get('data-compartment')==kind)
                owned={canonical(edge) for edge in edges(fills[index]) if canonical(edge) in outside}
                require(set(map(canonical,path_edges(node.get('d')))) == owned,
                        f'{key}: C4 colour run does not own exactly its cell exterior')
                require(node.get('stroke') == ('#171713' if kind=='number' else '#ae9d88'),
                        f'{key}: C4 exterior cell colour incorrect')
        shared_rims = [node for node in plate if node.get('data-shared-rim') == 'true']
        require(len(shared_rims) == 1, f'{key}: missing shared rim path')
        shared_rim = shared_rims[0]
        raw = shared_rim.get('d')
        require(bool(re.fullmatch(r'(?:M[-\d.,]+L[-\d.,]+)+', raw)), f'{key}: shared rim must use independent line segments')
        segments = [canonical(tuple(points(segment))) for segment in re.findall(r'M[-\d.,]+L[-\d.,]+', raw)]
        require(Counter(segments) == Counter({edge:1 for edge in shared}),
                f'{key}: white shared edges must each appear exactly once')
        rim = '#171713' if is_c4 else frame[0].get('stroke')
        require(shared_rim.get('stroke') == ('#ae9d88' if is_c4 else rim) and float(shared_rim.get('stroke-width')) == 2.3,
                f'{key}: shared normal rim colour or width changed')
        require(shared_rim.get('fill') == 'none', f'{key}: shared rim fill')
        require(not any(node.get('data-joined-frame') == 'support' for node in root.iter()),
                f'{key}: fine dark frame support remains')
        # Validate all direct panel strokes: no hidden support may be added
        # under the normal pale network. Inner frames stay inset and separate.
        stroke_nodes = [node for node in plate if node.get('stroke') not in (None,'none')]
        require(stroke_nodes == frame + shared_rims, f'{key}: unexpected direct panel outline')
        announced = {canonical(tuple(points(part))) for part in plate.get('data-shared-edges').split(';')}
        require(announced == shared, f'{key}: shared edge metadata does not match geometry')
        underlay = [node for node in plate if node.get('data-panel-underlay') == 'true']
        require(len(underlay) == 1 and Counter(map(canonical,path_edges(underlay[0].get('d')))) == actual_edges and
                underlay[0].get('stroke') in (None, 'none'), f'{key}: gap-free common underlay')
        for index, inner in enumerate(inside_frames):
            x0, x1 = ranges[index]
            vertices = points(inner.get('points'))
            if index:
                require(min(x for x, y in vertices) >= x0 + 5.9,
                        f'{key}: left inset frame touches common boundary')
            if index < len(inside_frames)-1:
                require(max(x for x, y in vertices) <= x1 - 5.9,
                        f'{key}: right inset frame touches common boundary')
        require(rim != '#171713' and rim not in ('#000000','#000'), f'{key}: normal rim must remain pale')
        compare_artwork(root, old, key, rim)
        checks.append({'id':key, 'cells':len(compartments), 'normalSharedRimsPreserved':len(shared),
                       'outerFrameLoops':1, 'fineDarkSupportLayers':0,
                       'insetFramesClearOfJoins':True, 'glyphArtworkAndSizingUnchanged':True,
                       'arrowDimensionsPreserved':True,'arrowsUseSymmetricFiveStraightSides':True})
    contact(records)
    palette_checks=[]
    for record in records:
        current_path=OUT/record['vector'];previous_path=PALETTE_BEFORE/record['vector']
        current=current_path.read_bytes();previous=previous_path.read_bytes()
        if record['cycle'] != 'c4':
            require(current==previous,f'{record["id"]}: non-C4 sample changed during palette fix')
            continue
        palette_checks.append(next(case for case in source_c4_checks if case['id']==record['id']))
    require(len(palette_checks)==4,'Expected four C4 colour corrections')
    placements=[case['factionPlacement'] for case in palette_checks]
    size_spread=[max(case['actualInkSize'][i] for case in placements)-min(case['actualInkSize'][i] for case in placements)for i in (0,1)]
    scale_spread=max(case['nativeScale'] for case in placements)-min(case['nativeScale'] for case in placements)
    require(max(size_spread)<1e-5 and scale_spread<1e-9,'C4 emblem size differs between directions')
    placement_report={'status':'passed','installation':'none','samples':4,
        'method':'Independent Bezier extrema after composing every nested SVG rotation and scale; field center derived from saved inner-frame polygon.',
        'commonActualTarget':46,'actualInkSize':placements[0]['actualInkSize'],
        'maximumDimensionSpread':max(size_spread),'maximumNativeScaleSpread':scale_spread,
        'maximumActualInkCenterError':max(abs(value) for case in placements for value in case['centerError']),
        'maximumVerticalClearanceDifference':max(abs(case['verticalClearanceDifference'])for case in placements),
        'minimumClearanceToInnerFrame':min(value for case in placements for value in case['clearances'].values()),
        'checks':[{'id':case['id'],**case['factionPlacement']}for case in palette_checks]}
    (OUT/'c4-faction-placement-check.json').write_text(json.dumps(placement_report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (OUT/'c4-palette-check.json').write_text(json.dumps({'status':'passed','installation':'none','c4Samples':4,
        'construction':'two equal black rules separated by yellow band on both cell types',
        'otherSamplesByteIdentical':33,'numberAndArrowBlackRimsPreserved':True,
        'factionGlyphPathsUnchanged':True,'glyphSizingPolicy':'All four actual native path bounds fit the same 46px target and center on their inner dark fields.',
        'checks':palette_checks},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    result = {'status':'passed','samples':len(records),
              'normalSharedRimsPreserved':sum(row['normalSharedRimsPreserved'] for row in checks),
              'method':'Independent polygon-edge comparison verifies exterior rims and unique shared rims, without dark support layers.',
              'fineDarkSupportLayers':0,'outerFrameLoopsPerPlate':1,
              'c4SourceDoubleBlackYellowBand':True,'nonC4SizingAndGlyphPathsPreserved':True,
              'arrowDimensionsPreserved':True,'arrowsUseSymmetricFiveStraightSides':True,
              'comparison':'white-seam-comparison.jpg','installation':'none','checks':checks}
    (OUT/'shared-frame-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({key:value for key,value in result.items() if key != 'checks'}))


if __name__ == '__main__':
    main()
