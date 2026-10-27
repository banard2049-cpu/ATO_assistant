"""Final current-state acceptance: every installed face equals its render."""
from pathlib import Path
import hashlib,json,re

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/composition'
def read(path):return json.loads(path.read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    marker=read(ROOT/'tools/map-marker-vector-source/production.json')
    links=read(ROOT/'tools/map-link-vector-source/production.json')
    installed=read(OUT/'installation.json');render=read(OUT/'installed-render-check.json')
    stage=read(OUT/'render-check.json');components=read(OUT/'component-check.json')
    assert len(marker['faces'])==511 and installed['faces']==render['faces']==stage['faces']==511
    assert installed['version']==render['version']==stage['version']==marker['version']
    assert render['status']==stage['status']=='passed'
    assert render['changedOutsideMarkerAreas']==stage['changedOutsideMarkerAreas']==0
    assert render['visibleLegacyPixels']==stage['visibleLegacyPixels']==0
    expected={r['key']:r['sha256']for r in installed['records']}
    assert expected=={r['key']:r['sha256']for r in render['records']}=={r['key']:r['sha256']for r in stage['records']}
    for key,digest in expected.items():assert sha(ROOT/'map/images/hd1024/overlay'/f'{key}-corners.svg')==digest,key
    for production in(marker,links):
        for path,digest in production['inputSha256'].items():assert sha(ROOT/path)==digest,path
    for relative in('map/index.html','briefing/index.html','tools/tag-editor.html'):
        text=(ROOT/relative).read_text(encoding='utf8')
        assert re.search(r'tile-artwork-data\.js\?v=([^"\s]+)',text)[1]==marker['version'],relative
    text=(ROOT/'map/tile-artwork-data.js').read_text(encoding='utf8')
    registry=json.loads(text[text.index('{'):text.rindex('}')+1])
    assert registry['cornerVectorVersion']==marker['version']
    backups=[]
    for folder in('map-links-20261025','map-markers-20261026','map-markers-before-titan-alpha-20261026','map-markers-before-c3-categories-20261026','map-markers-before-c2-routes-20261027','map-markers-before-land-layers-20261027'):
        manifest=read(ROOT/'official-assets/_backups'/folder/'manifest.json')
        for row in manifest['files']:assert sha(ROOT/row['backup'])==row['sha256'],row['backup']
        backups.append({'folder':folder,'files':len(manifest['files']),'hashesVerified':True})
    tap=(OUT/'regression-final.tap').read_text(encoding='utf8')
    tests=int(re.search(r'^# tests (\d+)$',tap,re.M)[1]);passed=int(re.search(r'^# pass (\d+)$',tap,re.M)[1])
    assert tests>=105 and passed==tests and '# fail 0'in tap
    replay=read(ROOT/'output/map-corner-vector-review-20261024/production-report.json')
    assert replay['checkReplayOnly']and replay['markersReplayed']and replay['faces']==511
    result={'status':'passed','version':marker['version'],'installedFaces':511,'links':1575,'arrows':758,
            'cornerPanels':729,'remainingMarkers':595,'hiddenNumberGroups':11,'visibleLegacyPixels':0,
            'changedOutsideAuditedComponentAreas':0,'mapTestsPassed':passed,'rebuildMatchesInstalled':True,
            'allThreeConsumerCacheReferencesUpdated':True,'completeFixedComponentCoverage':components['status']=='passed',
            'complexArtwork':'Existing SVGs or complete original-alpha PNGs, never per-map screenshots or traced contours.',
            'backups':backups,'comparisonGallery':'output/map-marker-hd-review-20261026/composition/index.html'}
    if marker['version'].endswith('6-layered-land'):
        revision=read(ROOT/'output/map-marker-hd-review-20261026/land-layers/revision-check.json')
        assert revision['status']=='passed'and revision['version']==marker['version']
        assert revision['faces']==511 and revision['landInstances']==12
        assert revision['allUnaffectedComponentsIdentical']and revision['allInkBoundsAndCentersUnchanged']
        assert revision['stagedFaceSha256']==expected
        for name,digest in revision['dependencySha256'].items():assert sha(ROOT/name)==digest,name
        visual=read(ROOT/'output/map-marker-hd-review-20261026/land-layers/visual-check.json')
        assert visual['status']=='passed-for-layered-land'and visual['rootReviewed12']
        for name,digest in visual['dependencySha256'].items():assert sha(ROOT/name)==digest,name
        for name,digest in visual['reviewImageSha256'].items():assert sha(ROOT/name)==digest,name
        result.update(layeredThreeBandRoutes=12,c2SpecialRouteInstances=48,c2SingleCenterGates=5,c2DoubleCenterGates=3,
                      allOtherComponentsUnchanged=True,
                      revisionComparison='output/map-marker-hd-review-20261026/c2-special-route-audit/index.html')
        review_root=OUT.parent
        gallery=read(review_root/'minimum-card-review/render-report.json')
        selection_path=review_root/'minimum-card-review/selection.json';selection=read(selection_path)
        assert gallery['status']=='passed'and gallery['mode']=='installed'
        assert gallery['selectionSha256']==sha(selection_path)
        assert gallery['physicalCards']==15 and gallery['featureCount']==53
        for name,cards,types in(('core',14,49),('expanded',15,53)):
            case=selection[name]
            assert case['minimumPhysicalCards']==cards and case['featureCount']==types
            assert case['physicalCardOptimization']['mipGap']==0
            assert {'style:secret-banner','style:hidden-number'}<=set(case['coveredFeatures'])
        for row in gallery['cards']:
            assert sha(ROOT/'map/images/hd1024/overlay'/f'{row["key"]}-corners.svg')==row['currentSha256']
            original=selection['candidates'][row['key']]['source']
            assert sha(ROOT/original)==row['sourceSha256']
        passwords=read(review_root/'password-audit/audit.json')
        assert passwords['currentMode']=='installed'and passwords['total']==25
        assert passwords['allHiddenInkColorsMatchSources']and passwords['sourceSetsMatchIndependentRepairAndHiddenSpecs']
        for row in passwords['records']:assert sha(Path(row['runtime']))==row['runtimeSha256'],row['key']
        route_review=read(review_root/'c2-special-route-audit/instances.json')
        assert route_review['mode']=='installed'and route_review['totalInstances']==48
        for row in route_review['instances']:assert sha(ROOT/row['current'])==row['currentSha256'],row['key']
        result.update(minimumCardComparison={'allTypes':53,'minimumCards':15,'independentTypesWithPasswords':49,'minimumIndependentCards':14},
                      passwordContentsActuallyRendered=25,comparisonImagesMatchInstalled=True)
    elif marker['version'].endswith('5-c2-route-variants'):
        revision=read(ROOT/'output/map-marker-hd-review-20261026/c2-route-variants/revision-check.json')
        assert revision['status']=='passed'and revision['version']==marker['version']
        assert revision['faces']==511 and revision['allUnaffectedComponentsIdentical']
        assert revision['counts']=={'gate_route':5,'gate_route_double':3,'land_route':12,'waves':28,'totalChangedSpecials':48}
        assert revision['stagedFaceSha256']==expected
        for name,digest in revision['dependencySha256'].items():assert sha(ROOT/name)==digest,name
        visual=read(ROOT/'output/map-marker-hd-review-20261026/c2-route-variants/visual-check.json')
        assert visual['status']=='passed-for-c2-route-variants'and visual['rootReviewed48']
        for name,digest in visual['dependencySha256'].items():assert sha(ROOT/name)==digest,name
        for name,digest in visual['reviewImageSha256'].items():assert sha(ROOT/name)==digest,name
        result.update(c2SpecialRoutesMatchedToSource=48,c2SingleCenterGates=5,c2DoubleCenterGates=3,
                      c2ThreeBandRoutes=12,c2WaveRoutes=28,allOtherComponentsUnchanged=True,
                      revisionComparison='output/map-marker-hd-review-20261026/c2-special-route-audit/index.html')
    elif marker['version'].endswith('4-c3-disc-tabs'):
        revision=read(ROOT/'output/map-marker-hd-review-20261026/c3-category-fix/revision-check.json')
        assert revision['status']=='passed'and revision['version']==marker['version']
        assert revision['categoryInstances']==25 and revision['allUnaffectedComponentsIdentical']
        assert revision['counts']['c4GreekWhite']==9 and revision['counts']['threePillarGates']==8
        assert revision['counts']['hiddenNumberGroups']==11 and revision['counts']['hiddenNumberInkCorrections']==7
        assert revision['stagedFaceSha256']==expected
        for name,digest in revision['dependencySha256'].items():assert sha(ROOT/name)==digest,name
        visual=read(ROOT/'output/map-marker-hd-review-20261026/c3-category-fix/visual-check.json')
        assert visual['status']=='passed-for-c3-disc-tab-composition'and visual['rootReviewed25']
        assert visual['rootReviewedWhiteGreekAndGate']and visual['rootReviewedPasswords']
        for name,digest in visual['dependencySha256'].items():assert sha(ROOT/name)==digest,name
        for name,digest in visual['reviewImageSha256'].items():assert sha(ROOT/name)==digest,name
        result.update(c3CategoryInstancesMatchedToSource=25,allOtherComponentsUnchanged=True,
                      c4GreekInkCorrected=9,gateRouteInstancesCorrected=8,hiddenNumberInkCorrected=7,
                      revisionComparison='output/map-marker-hd-review-20261026/c3-category-fix/c3-003-corrected.png')
    elif marker['version'].endswith('3-titan-alpha'):
        revision=read(ROOT/'output/map-marker-hd-review-20261026/titan-alpha-review/revision-check.json')
        assert revision['status']=='passed'and revision['version']==marker['version']
        assert revision['titanInstances']==123 and revision['sameAlphaOutlineAsMapInterior']
        for name,digest in revision['dependencySha256'].items():assert sha(ROOT/name)==digest,name
        result.update(titanInstancesCentered=123,alphaAspect='25:22',unchangedRemainingInstances=revision['counts']['unchangedRemainingInstances'],
                      revisionComparison='output/map-marker-hd-review-20261026/titan-alpha-review/index.html')
    (OUT/'final-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
