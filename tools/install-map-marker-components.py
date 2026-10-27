"""Install the complete reviewed link + remaining-marker composition set."""
from pathlib import Path
import base64,hashlib,json,re
import xml.etree.ElementTree as ET
from map_original_components import validate_artwork,records as original_records,verified_record

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-marker-vector-source'
LINK=ROOT/'tools/map-link-vector-source'
OUT=ROOT/'output/map-marker-hd-review-20261026/composition'
HD=ROOT/'map/images/hd1024/overlay'
BACKUP=ROOT/'official-assets/_backups/map-markers-20261026/manifest.json'
NS='http://www.w3.org/2000/svg'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path):return json.loads(path.read_text(encoding='utf8'))
def canonical(node):return ET.canonicalize(ET.tostring(node,encoding='unicode'),strip_text=True)
def singleton(nodes,label):
    assert len(nodes)==1,(label,len(nodes))
    return nodes[0]

def main():
    production=load(SOURCE/'production.json');links=load(LINK/'production.json')
    build=load(OUT/'composition-report.json');render=load(OUT/'render-check.json')
    link_render=load(ROOT/'output/map-link-template-review-20261026/render-check.json')
    assert production['method']=='shared-fixed-elements'
    assert len(production['faces'])==511 and set(production['faces'])==set(links['faces'])
    assert build['summary']['pendingEmblems']==0 and build['summary']['facesPreviewed']==511
    assert render['status']=='passed'and render['faces']==511 and render['changedOutsideMarkerAreas']==0
    assert render['visibleLegacyPixels']==0,'Old scan fragments remain visible'
    assert link_render['status']=='passed'and link_render['faces']==511 and link_render['changedOutsideLinkAreas']==0
    assert render['version']==production['version']and link_render['version']==links['version']
    for report in(production,links):
        assert report.get('inputSha256'),'Missing pinned component dependencies'
        for name,expected in report['inputSha256'].items():assert sha(ROOT/name)==expected,('Changed input',name)
        for name,expected in report.get('fontSha256',{}).items():assert sha(Path(name))==expected,('Changed font',name)
    for ident in original_records():verified_record(ident)
    revision_path=ROOT/'output/map-marker-hd-review-20261026/titan-alpha-review/revision-check.json'
    if production['version'].endswith('6-layered-land'):
        revision_path=ROOT/'output/map-marker-hd-review-20261026/land-layers/revision-check.json'
        revision=load(revision_path)
        assert revision['status']=='passed'and revision['version']==production['version']
        assert revision['faces']==511 and revision['landInstances']==12
        assert revision['allUnaffectedComponentsIdentical']and revision['allInkBoundsAndCentersUnchanged']
        for name,expected in revision['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed land revision',name)
        for key,expected in revision['stagedFaceSha256'].items():assert sha(OUT/'staged'/f'{key}-corners.svg')==expected,('Unreviewed stage',key)
        visual=load(revision_path.parent/'visual-check.json')
        assert visual['status']=='passed-for-layered-land'and visual['rootReviewed12']
        for name,expected in visual['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed land visuals',name)
        for name,expected in visual['reviewImageSha256'].items():assert sha(ROOT/name)==expected,('Changed land review image',name)
        baseline=load(ROOT/revision['previousInstallationBackup'])
        assert len(baseline['files'])==512
        for row in baseline['files']:assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
    elif production['version'].endswith('5-c2-route-variants'):
        revision_path=ROOT/'output/map-marker-hd-review-20261026/c2-route-variants/revision-check.json'
        revision=load(revision_path)
        assert revision['status']=='passed'and revision['version']==production['version']
        assert revision['faces']==511 and revision['allUnaffectedComponentsIdentical']
        assert revision['counts']=={'gate_route':5,'gate_route_double':3,'land_route':12,'waves':28,'totalChangedSpecials':48}
        for name,expected in revision['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed route revision',name)
        for key,expected in revision['stagedFaceSha256'].items():assert sha(OUT/'staged'/f'{key}-corners.svg')==expected,('Unreviewed stage',key)
        visual=load(revision_path.parent/'visual-check.json')
        assert visual['status']=='passed-for-c2-route-variants'and visual['rootReviewed48']
        for name,expected in visual['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed route visuals',name)
        for name,expected in visual['reviewImageSha256'].items():assert sha(ROOT/name)==expected,('Changed route review image',name)
        baseline=load(ROOT/revision['previousInstallationBackup'])
        assert len(baseline['files'])==512
        for row in baseline['files']:assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
    elif production['version'].endswith('4-c3-disc-tabs'):
        revision_path=ROOT/'output/map-marker-hd-review-20261026/c3-category-fix/revision-check.json'
        revision=load(revision_path)
        assert revision['status']=='passed'and revision['version']==production['version']
        assert revision['categoryInstances']==25 and revision['allUnaffectedComponentsIdentical']
        assert revision['counts']['time_portal']==6 and revision['counts']['time_wound']==11 and revision['counts']['time_portal_angular']==8
        assert revision['counts']['c4GreekWhite']==9 and revision['counts']['threePillarGates']==8
        assert revision['counts']['hiddenNumberGroups']==11 and revision['counts']['hiddenNumberInkCorrections']==7
        for name,expected in revision['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed revision change',name)
        for key,expected in revision['stagedFaceSha256'].items():assert sha(OUT/'staged'/f'{key}-corners.svg')==expected,('Unreviewed stage',key)
        visual=load(revision_path.parent/'visual-check.json')
        assert visual['status']=='passed-for-c3-disc-tab-composition'and visual['rootReviewed25']
        assert visual['rootReviewedWhiteGreekAndGate']and visual['rootReviewedPasswords']
        for name,expected in visual['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed visual change',name)
        for name,expected in visual['reviewImageSha256'].items():assert sha(ROOT/name)==expected,('Changed review image',name)
    elif production['version'].endswith('3-titan-alpha'):
        revision=load(revision_path)
        assert revision['status']=='passed'and revision['version']==production['version']
        assert revision['allUnaffectedComponentsIdentical']and revision['sameAlphaOutlineAsMapInterior']
        for name,expected in revision['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed revision change',name)
        visual=load(revision_path.parent/'visual-check.json')
        assert visual['status']=='passed-for-titan-alpha-composition'
        for name,expected in visual['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed visual change',name)
    else:
        visual=load(ROOT/'output/map-marker-hd-review-20261026/independent-composition-audit/latest-five-type-visual-check.json')
        assert visual['status']=='passed-for-current-five-type-composition'
        assert sum(visual['occurrences'].values())==46
        for name,expected in visual['dependencySha256'].items():assert sha(ROOT/name)==expected,('Unreviewed visual change',name)
    backup=load(BACKUP);snapshots={r['source']:r for r in backup['files']}
    assert len(snapshots)==512
    for row in backup['files']:assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
    rendered={r['key']:r for r in render['records']};files=[]
    previous_path=OUT/'installation.json'
    previous=load(previous_path)if previous_path.exists()else None
    previous_hashes={r['key']:r['sha256']for r in previous['records']}if previous else{}
    for key,row in production['faces'].items():
        staged=OUT/'staged'/f'{key}-corners.svg';target=HD/staged.name
        expected=rendered[key]['sha256'];assert sha(staged)==expected,('Unrendered change',key)
        snapshot=snapshots[target.relative_to(ROOT).as_posix()]
        assert sha(target)in(snapshot['sha256'],expected,previous_hashes.get(key)),('Unreviewed runtime edit',key)
        assert target.resolve().parent==HD.resolve()and staged.stat().st_size<8*1024*1024,key
        root=ET.parse(staged).getroot();before=ET.parse(ROOT/snapshot['backup']).getroot()
        assert root.get('viewBox')=='0 0 1024 1024',key
        assert not any(n.get('data-preview-only')=='true'or n.get('data-pending-emblem')for n in root.iter()),key
        ids=[n.get('id')for n in root.iter()if n.get('id')];assert len(ids)==len(set(ids)),('Duplicate ids',key)
        for flag,manifest,directory in(('data-map-links',links,LINK),('data-map-markers',production,SOURCE)):
            group=singleton([n for n in root if n.get(flag)=='true'],(key,flag))
            assert group.get('data-version')==manifest['version'],key
            pure=directory/manifest['faces'][key]['vector'];assert sha(pure)==manifest['faces'][key]['sha256'],key
            wanted=ET.parse(pure).getroot();validate_artwork(wanted)
            assert[canonical(n)for n in group]==[canonical(n)for n in wanted],(key,flag)
        old_corners=[n for n in before if n.get('data-corner')]
        new_corners=[n for n in root if n.get('data-corner')]
        assert[canonical(n)for n in old_corners]==[canonical(n)for n in new_corners],('Corner changed',key)
        retained=singleton([n for n in root if n.get('mask')=='url(#keep)'],key)
        images=list(retained.iter(f'{{{NS}}}image'));assert len(images)==1,key
        old_image=next(before.iter(f'{{{NS}}}image'))
        assert images[0].get('href')==old_image.get('href'),('Original PNG altered',key)
        mask=next(n for n in root.iter(f'{{{NS}}}mask')if n.get('id')=='keep')
        for cut_name,manifest in(('links',links),('remaining-markers',production)):
            cut=singleton([n for n in mask if n.get('data-remove')==cut_name],(key,cut_name))
            assert cut.get('d')==manifest['faces'][key]['maskPath'],key
        files.append({'key':key,'sha256':expected,'bytes':staged.stat().st_size})
    registry=ROOT/'map/tile-artwork-data.js';registry_before=sha(registry)
    text=registry.read_text(encoding='utf-8-sig');data=json.loads(text[text.index('{'):text.rindex('}')+1])
    assert set(data['cornerVectorFiles'])==set(production['faces'])
    # All 511 inputs, both render audits, provenance and backups passed before
    # the first runtime write. Each file is replaced through a sibling temp.
    for row in files:
        target=HD/f'{row["key"]}-corners.svg';temp=target.with_suffix('.svg.installing')
        temp.write_bytes((OUT/'staged'/target.name).read_bytes());temp.replace(target)
        assert sha(target)==row['sha256'],row['key']
    assert sha(registry)==registry_before,'Registry changed during installation'
    data['cornerVectorVersion']=production['version']
    registry.write_text('window.ATO_MAP_ARTWORK_DATA = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n',encoding='utf8')
    for relative in('map/index.html','briefing/index.html','tools/tag-editor.html'):
        page=ROOT/relative;text=page.read_text(encoding='utf8')
        text,count=re.subn(r'(tile-artwork-data\.js\?v=)[^"\s]+',lambda m:m.group(1)+production['version'],text)
        assert count==1,relative
        page.write_text(text,encoding='utf8')
    result={'status':'installed','version':production['version'],'faces':511,'backup':BACKUP.relative_to(ROOT).as_posix(),
            'previousVersion':previous['version']if previous else None,
            'components':'tools/map-marker-vector-source/original-components/manifest.json','records':files}
    (OUT/'installation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in result.items()if k!='records'}))

if __name__=='__main__':main()
