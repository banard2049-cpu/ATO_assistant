"""Accept source-audited discs, Greek ink, gate pillars and password ink."""
from pathlib import Path
from copy import deepcopy
from collections import Counter
import hashlib,json
import xml.etree.ElementTree as ET
from map_marker_templates import _transform
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/c3-category-fix'
BACKUP=ROOT/'official-assets/_backups/map-markers-before-c3-categories-20261026'
STAGED=ROOT/'output/map-marker-hd-review-20261026/composition/staged'
KINDS={'time_portal','time_wound','time_portal_angular'}
DEPENDENCIES=('tools/map_link_build.py','tools/map_marker_build.py','tools/map_marker_templates.py',
              'tools/map_link_templates.py','tools/map-link-vector-source/category-layouts.json',
              'tools/map-link-vector-source/contents-c3-c4.json',
              'tools/map-link-vector-source/components/gate_route.svg',
              'tools/map-link-vector-source/components/manifest.json',
              'tools/map-marker-vector-source/hidden-number-colors.json')
def load(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(n):return ET.canonicalize(ET.tostring(n,encoding='unicode'),strip_text=True)
def category_extra(n):return n.get('data-extra')and n.get('data-kind')=='icon'and n.get('data-value')in KINDS
def pruned(root,key,hidden):
    root=deepcopy(root)
    for parent in root.iter():
        if parent.get('data-version'):parent.set('data-version','VERSION')
        if key.startswith('c4-')and parent.get('data-cell-content')is not None and parent.get('data-kind')=='greek':
            for node in parent.iter():
                if node.get('fill')not in(None,'none'):node.set('fill','GREEK_INK')
        if key in hidden and parent.get('data-hidden-number'):parent.set('fill','HIDDEN_INK')
        for child in list(parent):
            if category_extra(child)or child.get('data-glyph')=='gate_route':parent.remove(child)
    return canonical(root)

def bounds(node):
    pen=BoundsPen(None)
    def walk(n,parent):
        matrix=parent.transform(_transform(n.get('transform')))
        if n.tag.rsplit('}',1)[-1]=='path':parse_path(n.get('d',''),TransformPen(pen,matrix))
        for child in n:walk(child,matrix)
    walk(node,Transform());assert pen.bounds is not None
    return pen.bounds
def one(nodes,label):
    assert len(nodes)==1,(label,len(nodes))
    return nodes[0]
def close(a,b):assert abs(a-b)<1e-7,(a,b)
def main():
    marker=load(ROOT/'tools/map-marker-vector-source/production.json')
    links=load(ROOT/'tools/map-link-vector-source/production.json')
    layout=load(ROOT/'tools/map-link-vector-source/category-layouts.json')
    hidden_rows=load(ROOT/'tools/map-marker-vector-source/hidden-number-colors.json')['records']
    hidden={row['key']:row for row in hidden_rows};assert len(hidden)==11
    gate_source=ET.parse(ROOT/'tools/map-link-vector-source/components/gate_route.svg').getroot()
    gate_paths={n.get('data-gate-pillar'):n.get('d')for n in gate_source.iter()if n.get('data-gate-pillar')}
    assert set(gate_paths)=={'left','center','right'}
    manifest=load(BACKUP/'manifest.json');saved={r['source']:r for r in manifest['files']}
    assert len(saved)==512
    for row in saved.values():assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
    counts=Counter();instances=[];expected=layout['instances'];seen=set();stage_hashes={}
    for key in marker['faces']:
        relative=f'map/images/hd1024/overlay/{key}-corners.svg'
        old=ET.parse(ROOT/saved[relative]['backup']).getroot()
        new_file=STAGED/f'{key}-corners.svg';new=ET.parse(new_file).getroot()
        assert pruned(old,key,hidden)==pruned(new,key,hidden),('Unrequested artwork changed',key)
        if key.startswith('c4-'):
            greek=[n for n in new.iter()if n.get('data-cell-content')is not None and n.get('data-kind')=='greek']
            for group in greek:
                inks={n.get('fill')for n in group.iter()if n.get('fill')not in(None,'none')}
                assert inks=={'#fdfaf4'},('Wrong C4 Greek ink',key,inks)
                counts['c4GreekWhite']+=1
        gates=[n for n in new.iter()if n.get('data-glyph')=='gate_route']
        old_gates=[n for n in old.iter()if n.get('data-glyph')=='gate_route']
        assert len(gates)==len(old_gates),('Gate count changed',key)
        for before,gate in zip(old_gates,gates):
            model=one([n for n in gate if n.get('data-gate-pillars')],key)
            assert model.get('data-gate-pillars')=='3'and model.get('data-gate-geometry')=='wide-side-single-center'
            actual_paths={n.get('data-gate-pillar'):n.get('d')for n in model if n.get('data-gate-pillar')}
            assert actual_paths==gate_paths and len(list(model))==3,('Wrong gate geometry',key)
            old_inks={n.get('fill')for n in before.iter()if n.get('fill')not in(None,'none')}
            new_inks={n.get('fill')for n in gate.iter()if n.get('fill')not in(None,'none')}
            assert old_inks==new_inks,('Gate ink changed',key)
            ol,ot,orr,ob=bounds(before);l,t,r,b=bounds(gate)
            close((l+r)/2,(ol+orr)/2);close((t+b)/2,(ot+ob)/2)
            close(r-l,46);close((r-l)/(b-t),90/73)
            counts['threePillarGates']+=1
        numbers=[n for n in new.iter()if n.get('data-hidden-number')]
        if key in hidden:
            number=one(numbers,key);record=hidden[key]
            assert number.get('data-hidden-number')==record['text']and number.get('fill')==record['color'],('Wrong hidden-number ink',key)
            assert sha(ROOT/record['source'])==record['sourceSha256'],key
            counts['hiddenNumberGroups']+=1
            if record['color']!=record['previousSpecColor']:counts['hiddenNumberInkCorrections']+=1
        else:assert not numbers,('Unexpected hidden number',key)
        before=[n for n in old.iter()if category_extra(n)]
        after=[n for n in new.iter()if category_extra(n)]
        assert len(before)==len(after),('Category count changed',key)
        for extra in after:
            panel,number=extra.get('data-extra').rsplit('-',1)
            ident=f'{key}:{panel}:{int(number)-1}';source=expected[ident];seen.add(ident)
            group=one([n for n in extra if n.get('data-category-template')],ident)
            assert group.get('data-category-template')=='source-disc-tab-84'
            assert group.get('data-category-kind')==extra.get('data-value')==source['kind']
            assert group.get('data-category-tab')==source['tab']
            assert list(map(float,group.get('data-category-source-bbox').split()))==source['sourceBBox']
            transform=_transform(group.get('transform'));close(transform.xx,1.05);close(transform.yy,1.05)
            l,t,r,b=source['sourceBBox'];cx,cy=transform.transformPoint((41,41))
            close(cx,(l+r)/2);close(cy,(t+b)/2)
            tabs=[n for n in group if n.get('data-backing-tab')]
            tab=one(tabs,ident);assert tab.get('data-backing-tab')==source['tab']
            corner={'TL':(1,1),'TR':(41,1),'BR':(41,41),'BL':(1,41)}[source['tab']]
            assert (float(tab.get('x')),float(tab.get('y')))==corner
            assert float(tab.get('width'))==float(tab.get('height'))==40
            assert tab.get('fill')==layout['palette']['rim']
            circle=one([n for n in group if n.get('data-backing-circle')],ident)
            field=one([n for n in group if n.get('data-backing-inner')],ident)
            for c,radius,colour in((circle,40,'rim'),(field,34.5,'field')):
                assert float(c.get('cx'))==float(c.get('cy'))==41
                assert float(c.get('r'))==radius and c.get('fill')==layout['palette'][colour]
            close(2*float(circle.get('r'))*transform.xx,layout['outerDiameter'])
            close(2*float(field.get('r'))*transform.xx,layout['innerDiameter'])
            emblem=one([n for n in group.iter()if n.get('data-emblem')],ident)
            assert emblem.get('data-emblem')==source['kind']
            assert emblem.get('data-canvas-cropped')=='false'
            paint=one([n for n in emblem if n.get('mask')],ident)
            assert paint.get('fill')==layout['palette']['ink']
            # Derive real ink bounds from the full-canvas image and its alpha
            # manifest, rather than accepting a visible bitmap crop as proof.
            component=load(ROOT/'tools/map-marker-vector-source/original-components/manifest.json')['components'][source['kind']]
            image=one([n for n in emblem.iter()if n.tag.rsplit('}',1)[-1]=='image'],ident)
            gl,gt,gr,gb=component['inkBBox'];scale=float(image.get('width'))/component['width']
            actual=[float(image.get('x'))+gl*scale,float(image.get('y'))+gt*scale,
                    float(image.get('x'))+gr*scale,float(image.get('y'))+gb*scale]
            actual=[v*1.05 for v in actual]
            metrics=layout['glyphMetrics'][source['kind']];w,h=metrics['size'];dx,dy=metrics['offset']
            # The fixed source glyph keeps its aspect inside the measured box.
            expected_scale=min(w/(gr-gl),h/(gb-gt))
            close(actual[2]-actual[0],(gr-gl)*expected_scale)
            close(actual[3]-actual[1],(gb-gt)*expected_scale)
            close((actual[0]+actual[2])/2,43.05+dx);close((actual[1]+actual[3])/2,43.05+dy)
            counts[source['kind']]+=1
            instances.append({'id':ident,'kind':source['kind'],'tab':source['tab'],'center':[cx,cy],
                              'outerDiameter':84,'glyphInkBoundsLocal':actual})
        counts['faces']+=1;stage_hashes[key]=sha(new_file)
    assert seen==set(expected)and len(seen)==25
    assert {k:counts[k]for k in KINDS}==layout['byType']
    assert expected['c3-tile-087-front:special-1:0']['kind']=='time_wound'
    assert counts['c4GreekWhite']==9 and counts['threePillarGates']==8
    assert counts['hiddenNumberGroups']==11 and counts['hiddenNumberInkCorrections']==7
    dependencies={p:sha(ROOT/p)for p in DEPENDENCIES}
    result={'status':'passed','version':marker['version'],'linkVersion':links['version'],'faces':511,
            'categoryInstances':25,'counts':dict(counts),'allUnaffectedComponentsIdentical':True,
            'method':'Fixed source-sized circle/tab templates, original-alpha glyphs, white C4 Greek ink, three straight-line gate pillars and original scalar password ink. All paths and positions outside the named components are unchanged.',
            'previousInstallationBackup':(BACKUP/'manifest.json').relative_to(ROOT).as_posix(),
            'dependencySha256':dependencies,'stagedFaceSha256':stage_hashes,'instances':instances}
    OUT.mkdir(exist_ok=True);(OUT/'revision-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in result.items()if k not in('dependencySha256','stagedFaceSha256','instances')}))
if __name__=='__main__':main()
