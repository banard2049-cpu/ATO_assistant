"""Accept only the requested Titan/alpha changes against the installed backup."""
from pathlib import Path
from copy import deepcopy
from collections import Counter
import hashlib,json
import xml.etree.ElementTree as ET
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from map_marker_templates import _transform

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/titan-alpha-review'
BACKUP=ROOT/'official-assets/_backups/map-markers-before-titan-alpha-20261026'
NS='http://www.w3.org/2000/svg'
def load(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(n):return ET.canonicalize(ET.tostring(n,encoding='unicode'),strip_text=True)
def bounds(node):
    pen=BoundsPen(None)
    def walk(n,parent):
        matrix=parent.transform(_transform(n.get('transform')))
        if n.tag.rsplit('}',1)[-1]=='path':parse_path(n.get('d',''),TransformPen(pen,matrix))
        for child in n:walk(child,matrix)
    walk(node,Transform());assert pen.bounds is not None
    return pen.bounds
def pruned(root):
    root=deepcopy(root)
    for n in root.iter():
        if n.get('data-version'):n.set('data-version','VERSION')
        for child in list(n):
            if child.get('data-emblem')=='wild_titan'or child.get('data-glyph')=='alpha':n.remove(child)
            elif child.get('data-marker-instance')and any(c.get('data-marker-text')=='α'for c in child.iter()):n.remove(child)
    return canonical(root)
def main():
    OUT.mkdir(exist_ok=True)
    marker=load(ROOT/'tools/map-marker-vector-source/production.json')
    links=load(ROOT/'tools/map-link-vector-source/production.json')
    snapshot=load(BACKUP/'manifest.json');saved={r['source']:r for r in snapshot['files']}
    counts=Counter();previous_alpha_paths=set();current_alpha_paths=set();titans=[]
    for key in marker['faces']:
        relative=f'map/images/hd1024/overlay/{key}-corners.svg'
        row=saved[relative];old_file=ROOT/row['backup'];assert sha(old_file)==row['sha256'],key
        new_file=ROOT/'output/map-marker-hd-review-20261026/composition/staged'/f'{key}-corners.svg'
        old=ET.parse(old_file).getroot();new=ET.parse(new_file).getroot()
        assert pruned(old)==pruned(new),('Unrequested artwork changed',key)
        before_titans=[n for n in old.iter()if n.get('data-emblem')=='wild_titan']
        after_titans=[n for n in new.iter()if n.get('data-emblem')=='wild_titan']
        assert len(before_titans)==len(after_titans),key
        for before,after in zip(before_titans,after_titans):
            l,t,r,b=bounds(after);ol,ot,orr,ob=bounds(before)
            assert max(abs((l+r)/2-41),abs((t+b)/2-41))<.001,(key,(l,t,r,b))
            ratio=max(r-l,b-t)/max(orr-ol,ob-ot)
            assert 1.04<ratio<1.08,('Titan did not enlarge slightly',key,ratio)
            assert [n.get('d')for n in before.iter()if n.get('d')]==[n.get('d')for n in after.iter()if n.get('d')],key
            titans.append({'key':key,'actualInkBounds':[l,t,r,b],'scaleComparedWithPrevious':ratio})
        for instance in new.iter():
            if instance.get('data-marker-instance'):
                # All remaining components, including the previously reviewed
                # five types, keep their exact local SVG except these two.
                old_instance=next(n for n in old.iter()if n.get('data-marker-instance')==instance.get('data-marker-instance'))
                if not any(n.get('data-emblem')=='wild_titan'or n.get('data-marker-text')=='α'for n in instance.iter()):
                    assert canonical(old_instance)==canonical(instance),key
                    counts['unchangedRemainingInstances']+=1
        for n in old.iter():
            if n.get('data-marker-text')=='α':previous_alpha_paths.update(c.get('d')for c in n.iter()if c.get('d'))
        for group in new.iter():
            if group.get('data-shared-alpha'):
                l,t,r,b=bounds(group);assert abs((r-l)/(b-t)-25/22)<.00001,key
                current_alpha_paths.update(n.get('d')for n in group.iter()if n.get('d'))
                counts['sharedAlphaOccurrences']+=1
        counts['faces']+=1
    assert len(titans)==123 and counts['faces']==511
    assert len(previous_alpha_paths)==len(current_alpha_paths)==1 and previous_alpha_paths==current_alpha_paths
    result={'status':'passed','version':marker['version'],'linkVersion':links['version'],'faces':511,
            'titanInstances':123,'allUnaffectedComponentsIdentical':True,'sameAlphaOutlineAsMapInterior':True,
            'alphaAspect':'25:22','counts':dict(counts),'titans':titans,
            'previousInstallationBackup':(BACKUP/'manifest.json').relative_to(ROOT).as_posix(),
            'dependencySha256':{p:sha(ROOT/p)for p in('tools/map_marker_templates.py','tools/map_marker_build.py','tools/map_link_templates.py','tools/map_link_build.py')}}
    (OUT/'revision-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in result.items()if k not in('titans','dependencySha256')}))
if __name__=='__main__':main()
