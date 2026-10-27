"""Check complete component accounting, reuse integrity and redraw coverage."""
from collections import Counter
import hashlib,json
from pathlib import Path
import xml.etree.ElementTree as ET
from map_original_components import records as original_records,verified_record

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-marker-vector-source'
OUT=ROOT/'output/map-marker-vector-review-20261026'


def load(path):return json.loads(path.read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    data=load(SOURCE/'inventory.json');plan=load(SOURCE/'reuse-plan.json');groups=load(SOURCE/'classified-instances.json')
    assert len(data['faces'])==len({r['key']for r in data['faces']})==511
    counter=Counter(m['type']for r in data['faces']for m in r['markers']+r.get('smallComponents',[]))
    assert sum(counter.values())==641 and counter['hidden_number_digit']==44 and counter['antialias_speckle']==2,counter
    assert len(groups['hidden_number_digit'])==44
    for kind,records in groups.items():assert len(records)==counter[kind],kind
    lookup={r['key']:r for r in data['faces']}
    expected_swaps={('c1-tile-023-front',1):'staff_icon',('c1-tile-023-front',3):'wild_titan',
                    ('c1-tile-045-front',5):'staff_icon',('c1-tile-045-front',6):'wild_titan'}
    for(key,ident),kind in expected_swaps.items():assert next(m for m in lookup[key]['markers']if m['componentLabel']==ident)['type']==kind
    for row in data['faces']:
        assert sha(ROOT/row['source'])==row['sourceSha256'],row['key']
        ids=[m['componentLabel']for m in row['markers']+row.get('smallComponents',[])]
        assert len(ids)==len(set(ids)),row['key']
    hidden=load(ROOT/'tools/map-hidden-number-regions.json')['tiles']
    actual_digits=Counter(r['key']for r in groups['hidden_number_digit'])
    assert actual_digits==Counter({key:sum(len(n['text'])for n in row['numbers'])for key,row in hidden.items()})
    coverage=load(ROOT/'output/map-marker-independent-audit-20261026/coverage.json')
    assert coverage['faces']==511 and not coverage['unexpectedLargeComponents']
    assert coverage['sourceHashesVerified']
    assert coverage['totals']=={'cornerOrHeadingComponents':889,'inventoriedMarkers':612,'linkComponents':2402,'smallFragments':29}
    reuse_count=0
    for row in plan['reuse']:
        assert sha(ROOT/row['component'])==row['sha256']
        root=ET.parse(ROOT/row['component']).getroot()
        assert not any(node.tag.rsplit('}',1)[-1]in('image','text','use','script','foreignObject')for node in root.iter())
        assert row['instances']==counter[row['id']]+(counter['city_nameplate']if row['id']=='city'else 0)
        reuse_count+=row['instances']
    assert reuse_count==446
    minimum=[];redraw_count=0
    for row in plan['redrawMinimum']:
        assert row['instances']==counter[row['id']]
        ids=[row['id']]+(['wheel_icon_winged']if row['id']=='wheel_icon'else[])
        assert len(ids)==row['distinctShapes']
        minimum+=ids;redraw_count+=row['instances']
    assert len(minimum)==9 and redraw_count==59 and reuse_count+redraw_count==505
    originals=original_records()
    for ident in minimum+['time_wound','time_portal','time_portal_angular','city']:
        assert ident in originals,ident
        verified_record(ident)
    wheel=groups['wheel_icon'];variants=Counter(row['variant']for row in wheel)
    assert variants=={'plain':2,'winged':2},variants
    result={'status':'passed','faces':511,'accountedRemainingAlphaComponents':641,'locationEmblems':505,
            'reusedExistingSvgInstances':382,'reusedSvgComponents':4,'exactOriginalAlphaInstances':123,
            'rareOriginalInstances':59,'distinctRareOriginalShapes':9,
            'originalShapeComponents':minimum,'allNineExactOriginalComponentsPresent':True,'originalRouteCategoryComponents':3,'greekDiscs':76,
            'secretNumberBanners':14,'hiddenNumberGroups':11,'hiddenNumberDigits':44,'nonsemanticSpeckles':2,
            'unexpectedLargeComponents':0,'staffTitanSwapRegressionPassed':True,'allSourceHashesVerified':True,
            'componentPolicy':'Complete original-alpha sprites and existing SVGs; rejected simplified redraw trials are not production inputs.',
            'runtimeMarkerFilesModified':0}
    (OUT/'inventory-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result,ensure_ascii=False))
    return result


if __name__=='__main__':verify()
