"""Audit production corner coverage and preservation of the original overlay."""
import base64
import json
import xml.etree.ElementTree as ET

from map_corner_vectors import ROOT, HD, NS, inventory, right_markers, c5_face_palettes, c5_headings, original_overlay
from map_original_components import validate_artwork


def verify():
    totals = {'faces': 0, 'panels': 0, 'left': 0, 'right': 0, 'river': 0, 'doubleLeft': 0}
    for row in inventory['faces']:
        key = row['key']
        root = ET.parse(HD / 'overlay' / f'{key}-corners.svg').getroot()
        retained = [g for g in root if g.get('mask')=='url(#keep)']
        assert len(retained)==1,key
        images = list(retained[0].iter(f'{{{NS}}}image'))
        assert len(images) == 1, key
        assert base64.b64decode(images[0].get('href').split(',', 1)[1]) == original_overlay(key).read_bytes(), key
        for group in root:
            if group.get('data-map-links')=='true'or group.get('data-map-markers')=='true':validate_artwork(group)
        # Retained markings come from the byte-identical source image.
        mask = root.find(f'.//{{{NS}}}mask')
        heading_cuts = [cut for cut in mask if cut.get('data-remove')=='heading']
        assert len(heading_cuts) == (1 if row['cycle']=='c5' else 0), key
        if heading_cuts:
            l,t,r,b=c5_headings[key]['header']
            assert [int(heading_cuts[0].get(a)) for a in ('x','y','width','height')] == [l-3,t-3,r-l+6,b-t+6], key
        cuts = [cut for cut in list(mask)[1:] if cut.get('data-remove') not in ('heading', 'links','remaining-markers')]
        groups = [g for g in root if g.get('data-corner')]
        assert len(cuts) == len(groups), key
        for group, cut in zip(groups, cuts):
            side = group.get('data-corner')
            l, t, r, b = row['corners'][side]['bbox']
            assert [int(cut.get(a)) for a in ('x', 'y', 'width', 'height')] == [l-3, t-3, r-l+6, b-t+6], key
            assert group.get('transform') == f'translate({l} {t})', key
            assert not list(group.iter(f'{{{NS}}}image')), key
            frames = [e.get('data-frame') for e in group.iter() if e.get('data-frame')]
            assert frames == ['outer', 'inner'], key
            if row['cycle'] == 'c5':
                bg, rim, _ = c5_face_palettes[row['face']]
                outer = next(e for e in group.iter() if e.get('data-frame') == 'outer')
                inner = next(e for e in group.iter() if e.get('data-frame') == 'inner')
                assert outer.get('fill') == bg, key
                assert outer.get('stroke') == inner.get('stroke') == rim, key
            if side == 'left':
                actual = [e.get('data-marker') for e in group.iter() if e.get('data-marker')]
                codes = 'DP' if row['cycle'] in ('c1', 'c3') and row['left'] == 'PD' else row['left']
                assert actual == ['progress' if code == 'P' else 'calamity' for code in codes], key
                totals['doubleLeft'] += len(codes) == 2
            else:
                actual = [e.get('data-marker') or e.get('data-faction') for e in group.iter() if e.get('data-marker') or e.get('data-faction')]
                assert actual == right_markers(row), key
                totals['river'] += 'river' in actual
            totals[side] += 1
            totals['panels'] += 1
        totals['faces'] += 1
    assert totals == {'faces': 511, 'panels': 729, 'left': 224, 'right': 505, 'river': 12, 'doubleLeft': 21}, totals
    report = ROOT / 'output/map-corner-vector-review-20261024/production-check.json'
    report.write_text(json.dumps({**totals, 'removedC5Headings': len(c5_headings), 'sourceImagesUnchanged': True, 'externalImageDependencies': 0}, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(totals))


if __name__ == '__main__':
    verify()
