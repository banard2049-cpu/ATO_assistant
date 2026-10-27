"""Accept only the 48 C2 source-sized special-route component changes."""
from pathlib import Path
from copy import deepcopy
from collections import Counter
import hashlib,json,re
import xml.etree.ElementTree as ET
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from map_marker_templates import _transform
from map_link_templates import native_sample

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/c2-route-variants'
BACKUP=ROOT/'official-assets/_backups/map-markers-before-c2-routes-20261027'
STAGE=ROOT/'output/map-marker-hd-review-20261026/composition/staged'
SOURCE=ROOT/'tools/map-link-vector-source'
ROUTES={'gate_route','gate_route_double','land_route'}
DOUBLE={'c2-tile-023-front','c2-tile-024-front','c2-tile-027-front'}
def load(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(n):return ET.canonicalize(ET.tostring(n,encoding='unicode'),strip_text=True)
def close(a,b):assert abs(a-b)<1e-6,(a,b)
def one(nodes,label):
    assert len(nodes)==1,(label,len(nodes))
    return nodes[0]
def bounds(node):
    pen=BoundsPen(None)
    def walk(n,parent):
        transform=parent.transform(_transform(n.get('transform')))
        if n.tag.rsplit('}',1)[-1]=='path':parse_path(n.get('d',''),TransformPen(pen,transform))
        for child in n:walk(child,transform)
    walk(node,Transform());assert pen.bounds is not None
    return pen.bounds
def special(n):return n.get('data-glyph')in ROUTES or n.get('data-wave-count')=='3'
def pruned(root,key):
    root=deepcopy(root)
    for parent in root.iter():
        if parent.get('data-version'):parent.set('data-version','VERSION')
        if key.startswith('c2-'):
            for child in list(parent):
                if special(child):parent.remove(child)
    return canonical(root)
def route_model(glyph,kind,ink):
    original=ET.parse(SOURCE/'components'/f'{kind}.svg').getroot()
    expected=one([n for n in original if n.tag.rsplit('}',1)[-1]=='g'],kind)
    expected=deepcopy(expected)
    for n in expected.iter():
        assert n.tag.rsplit('}',1)[-1]in('g','path'),('Not a native fixed vector',kind,n.tag)
        if n.get('d'):assert not re.search(r'[CcQqAaSsTt]',n.get('d')),('Unexpected traced curves',kind)
        if n.get('fill')not in(None,'none'):n.set('fill',ink)
    actual=one(list(glyph),kind)
    assert canonical(actual)==canonical(expected),('Non-shared route geometry',kind)
    if kind.startswith('gate_route'):
        assert actual.get('data-gate-variant')==('double'if kind.endswith('_double')else'single')
        pillars=[n.get('data-gate-pillar')for n in actual]
        assert pillars==(['left','center-left','center-right','right']if kind.endswith('_double')else['left','center','right'])
    else:
        assert actual.get('data-land-bands')=='3'and actual.get('data-exposed-axis')=='3 4.5'
def main():
    marker=load(ROOT/'tools/map-marker-vector-source/production.json');links=load(SOURCE/'production.json')
    assert marker['version']=='20261027-fixed-marker-components5-c2-route-variants'
    assert links['version']=='20261027-original-element-links5-c2-route-variants'
    metrics=load(SOURCE/'c2-route-source-metrics.json')
    for name,digest in metrics['evidenceSha256'].items():assert sha(ROOT/name)==digest,name
    backup=load(BACKUP/'manifest.json');saved={r['source']:r for r in backup['files']}
    assert len(saved)==512
    for row in saved.values():assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
    schema=load(SOURCE/'contents-c1-c2.json')['faces'];counts=Counter();records=[];hashes={}
    for key in marker['faces']:
        relative=f'map/images/hd1024/overlay/{key}-corners.svg'
        old=ET.parse(ROOT/saved[relative]['backup']).getroot();new_path=STAGE/f'{key}-corners.svg';new=ET.parse(new_path).getroot()
        assert pruned(old,key)==pruned(new,key),('Unrequested artwork changed',key)
        if key.startswith('c2-'):
            before_panels={n.get('data-panel'):n for n in old.iter()if n.get('data-panel')}
            for panel in[n for n in new.iter()if n.get('data-panel')]:
                pid=panel.get('data-panel');before=before_panels[pid]
                old_nodes=[n for n in before.iter()if special(n)];new_nodes=[n for n in panel.iter()if special(n)]
                assert len(old_nodes)==len(new_nodes),(key,pid)
                for old_node,new_node in zip(old_nodes,new_nodes):
                    ol,ot,orr,ob=bounds(old_node);l,t,r,b=bounds(new_node)
                    close((l+r)/2,(ol+orr)/2);close((t+b)/2,(ot+ob)/2)
                    if new_node.get('data-glyph'):
                        kind=new_node.get('data-glyph');ink={n.get('fill')for n in old_node.iter()if n.get('fill')not in(None,'none')}
                        assert len(ink)==1;route_model(new_node,kind,next(iter(ink)))
                        w,h=(45,46)if kind=='land_route'else(47,39)
                        close(r-l,w);close(b-t,h)
                        close(_transform(new_node.get('transform')).xx,1);close(_transform(new_node.get('transform')).yy,1)
                        if old_node.get('data-glyph')=='gate_route':
                            assert kind==('gate_route_double'if key in DOUBLE else'gate_route'),(key,kind)
                        else:assert old_node.get('data-glyph')==kind=='land_route'
                        semantic=[c for c in schema[key]['panels'][pid]['cells']if c.get('value')==kind]
                        assert len(semantic)==1,(key,pid,kind)
                    else:
                        kind='waves';assert new_node.get('fill')==old_node.get('fill')
                        close(orr-ol,42);close(r-l,45);close(b-t,ob-ot)
                        expected=ET.fromstring(native_sample.waves(((ol+orr)/2-22.5,ot,(ol+orr)/2+22.5,ot+26),old_node.get('fill')))
                        assert dict(new_node.attrib)==dict(expected.attrib),('Wave curve changed beyond width',key,pid)
                    counts[kind]+=1;records.append({'key':key,'panelId':pid,'kind':kind,'oldInkBounds':[ol,ot,orr,ob],'newInkBounds':[l,t,r,b]})
        hashes[key]=sha(new_path);counts['faces']+=1
    for kind,count in metrics['expectedCounts'].items():assert counts[kind]==count,(kind,counts[kind],count)
    counts['totalChangedSpecials']=sum(counts[k]for k in('gate_route','gate_route_double','land_route','waves'))
    assert counts['faces']==511 and counts['totalChangedSpecials']==48
    del counts['faces']
    dependencies=['tools/map_link_build.py','tools/map_marker_build.py','tools/map_link_templates.py','tools/build-map-link-native-samples.py',
                  'tools/map-link-vector-source/contents-c1-c2.json','tools/map-link-vector-source/c2-route-source-metrics.json',
                  'tools/map-link-vector-source/components/manifest.json']
    dependencies+=[f'tools/map-link-vector-source/components/{kind}.svg'for kind in sorted(ROUTES)]
    dependencies+=list(metrics['evidenceSha256'])
    result={'status':'passed','version':marker['version'],'linkVersion':links['version'],'faces':511,
            'allUnaffectedComponentsIdentical':True,'allRouteCentersUnchanged':True,'counts':dict(counts),
            'previousInstallationBackup':(BACKUP/'manifest.json').relative_to(ROOT).as_posix(),
            'method':'Two fixed pillar variants, one fixed three-band geometry and unchanged analytic waves widened only for C2. Full source scalar measurements are hash-bound. No per-map traces or screenshots.',
            'dependencySha256':{name:sha(ROOT/name)for name in dependencies},'stagedFaceSha256':hashes,'records':records}
    OUT.mkdir(exist_ok=True);(OUT/'revision-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in result.items()if k not in('dependencySha256','stagedFaceSha256','records')}))
if __name__=='__main__':main()
