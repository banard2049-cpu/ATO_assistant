"""Verify the twelve layered land symbols and preserve all other artwork."""
from pathlib import Path
from copy import deepcopy
import hashlib,importlib.util,json,re
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/land-layers'
STAGE=ROOT/'output/map-marker-hd-review-20261026/composition/staged'
BACKUP=ROOT/'official-assets/_backups/map-markers-before-land-layers-20261027'
SOURCE=ROOT/'tools/map-link-vector-source'
spec=importlib.util.spec_from_file_location('route_checks',ROOT/'tools/verify-map-c2-route-variants.py')
helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)

def load(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(n):return ET.canonicalize(ET.tostring(n,encoding='unicode'),strip_text=True)
def prune(root,key):
    root=deepcopy(root)
    for parent in root.iter():
        if parent.get('data-version'):parent.set('data-version','VERSION')
        if key.startswith('c2-'):
            for child in list(parent):
                if child.get('data-glyph')=='land_route':parent.remove(child)
    return canonical(root)

def main():
    marker=load(ROOT/'tools/map-marker-vector-source/production.json')
    links=load(SOURCE/'production.json')
    assert marker['version'].endswith('6-layered-land')and links['version'].endswith('6-layered-land')
    manifest=load(BACKUP/'manifest.json');saved={r['source']:r for r in manifest['files']}
    assert len(saved)==512
    for row in saved.values():assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
    component=ET.parse(SOURCE/'components/land_route.svg').getroot()
    expected=[n for n in component if n.tag.rsplit('}',1)[-1]not in('title','desc')]
    records=[];hashes={}
    for key in marker['faces']:
        relative=f'map/images/hd1024/overlay/{key}-corners.svg'
        old=ET.parse(ROOT/saved[relative]['backup']).getroot();new_path=STAGE/f'{key}-corners.svg';new=ET.parse(new_path).getroot()
        assert prune(old,key)==prune(new,key),('Unrequested artwork changed',key)
        before=[n for n in old.iter()if n.get('data-glyph')=='land_route']
        after=[n for n in new.iter()if n.get('data-glyph')=='land_route']
        assert len(before)==len(after),(key,len(before),len(after))
        for a,b in zip(before,after):
            assert key.startswith('c2-'),('Unexpected non-C2 land change',key)
            assert a.get('transform')==b.get('transform'),('Placement changed',key)
            assert [canonical(n)for n in b]==[canonical(n)for n in expected],('Not the shared component',key)
            old_box=helpers.bounds(a);box=helpers.bounds(b)
            assert all(abs(v-w)<1e-7 for v,w in zip(old_box,box)),('Ink bounds changed',key,old_box,box)
            assert abs(box[2]-box[0]-45)<1e-7 and abs(box[3]-box[1]-46)<1e-7
            layers={kind:[n for n in b.iter()if n.get('data-land-layer')==kind]for kind in('face','recess','ledge')}
            assert all(len(nodes)==3 for nodes in layers.values()),('Missing layers',key)
            for kind,nodes in layers.items():
                for node in nodes:
                    assert node.get('fill')==('#b3a59f'if kind=='recess'else'#e6e6e6'),(key,kind,node.attrib)
            for node in b.iter():
                assert node.tag.rsplit('}',1)[-1]in('g','path'),('Not native vector geometry',key)
                assert not re.search(r'[CcQqAaSsTt]',node.get('d','')),('Non-analytic straight geometry',key)
            records.append({'key':key,'inkBounds':box,'layersPerBar':['face','recess','ledge'],'face':'#e6e6e6','recess':'#b3a59f'})
        hashes[key]=sha(new_path)
    assert len(hashes)==511 and len(records)==12
    metrics=load(SOURCE/'c2-route-source-metrics.json')
    for path,digest in metrics['evidenceSha256'].items():assert sha(ROOT/path)==digest,path
    dependencies=['tools/map_link_build.py','tools/map_marker_build.py','tools/map_link_templates.py',
                  'tools/map-link-vector-source/components/land_route.svg','tools/map-link-vector-source/components/manifest.json',
                  'tools/map-link-vector-source/c2-route-source-metrics.json','tools/verify-map-c2-route-variants.py',
                  'tools/verify-map-land-layers.py']
    dependencies+=list(metrics['evidenceSha256'])
    result={'status':'passed','version':marker['version'],'linkVersion':links['version'],'faces':511,'landInstances':12,
            'allUnaffectedComponentsIdentical':True,'allInkBoundsAndCentersUnchanged':True,
            'previousInstallationBackup':(BACKUP/'manifest.json').relative_to(ROOT).as_posix(),
            'dependencySha256':{p:sha(ROOT/p)for p in dependencies},'stagedFaceSha256':hashes,'records':records}
    OUT.mkdir(exist_ok=True);(OUT/'revision-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in result.items()if k not in('dependencySha256','stagedFaceSha256','records')}))

if __name__=='__main__':main()
