"""Install the validated all-map link overlay set with an original-state guard."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-link-template-review-20261026'
HD=ROOT/'map/images/hd1024/overlay'
NS='http://www.w3.org/2000/svg'


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    assert not(ROOT/'tools/map-marker-vector-source/production.json').exists(),'The complete marker composition is active; use install-map-marker-components.py to preserve every layer.'
    manifest=json.loads((ROOT/'tools/map-link-vector-source/production.json').read_text(encoding='utf-8'))
    assert manifest['method']=='shared-fixed-elements'
    for name,expected in manifest['inputSha256'].items():
        assert digest(ROOT/name)==expected,f'Changed component or schema: {name}'
    render=json.loads((OUT/'render-check.json').read_text(encoding='utf-8'))
    assert render['status']=='passed' and render['faces']==511 and render['changedOutsideLinkAreas']==0
    assert render['version']==manifest['version']
    rendered={r['key']:r for r in render['records']}
    backup=json.loads((ROOT/'official-assets/_backups/map-links-20261025/manifest.json').read_text(encoding='utf-8'))
    before={r['key']:r for r in backup['files']if r['kind']=='pre-install-vector-overlay'}
    records=[]
    # Validate the entire transaction before the first runtime write.
    for key,row in manifest['faces'].items():
        original=ROOT/before[key]['backup'];assert digest(original)==before[key]['sha256'],key
        staged=OUT/'staged'/f'{key}-corners.svg';target=HD/staged.name
        staged_hash=digest(staged)
        assert rendered[key]['sha256']==staged_hash,f'Unrendered staged change: {key}'
        assert digest(target)in(before[key]['sha256'],staged_hash),f'Unreviewed runtime change: {key}'
        assert staged.stat().st_size<8*1024*1024,key
        root=ET.parse(staged).getroot()
        layer=[child for child in root if child.get('data-map-links')=='true']
        assert len(layer)==1 and layer[0].get('data-version')==manifest['version'],key
        vector=ROOT/'tools/map-link-vector-source'/row['vector'];assert digest(vector)==row['sha256'],key
        assert ET.tostring(layer[0]) # parsing must succeed before installation
        assert target.resolve().parent==HD.resolve()
        records.append({'key':key,'sha256':staged_hash,'bytes':staged.stat().st_size})
    assert len(records)==511
    for row in records:
        filename=row['key']+'-corners.svg';target=HD/filename
        temporary=target.with_suffix('.svg.installing')
        temporary.write_bytes((OUT/'staged'/filename).read_bytes())
        temporary.replace(target)
        assert digest(target)==row['sha256']
    registry=ROOT/'map/tile-artwork-data.js'
    source=registry.read_text(encoding='utf-8-sig');data=json.loads(source[source.index('{'):source.rindex('}')+1])
    data['cornerVectorVersion']=manifest['version']
    assert set(data['cornerVectorFiles'])==set(manifest['faces'])
    registry.write_text('window.ATO_MAP_ARTWORK_DATA = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    report={'status':'installed','version':manifest['version'],'faces':511,'panels':sum(r['panels']for r in manifest['faces'].values()),
            'backup':'official-assets/_backups/map-links-20261025/manifest.json','records':records}
    (OUT/'installation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items()if k!='records'}))


if __name__=='__main__':main()
