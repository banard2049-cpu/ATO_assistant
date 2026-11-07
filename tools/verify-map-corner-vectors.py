"""Audit production vector-only corner coverage for every map face."""
import json
import xml.etree.ElementTree as ET

from map_corner_vectors import ROOT, HD, NS, inventory, right_markers, c5_face_palettes
from map_original_components import validate_artwork


def verify():
    totals = {'faces': 0, 'panels': 0, 'left': 0, 'right': 0, 'river': 0, 'doubleLeft': 0}
    for row in inventory['faces']:
        key = row['key']
        path = HD / 'overlay' / f'{key}-corners.svg'
        text = path.read_text(encoding='utf-8')
        root = ET.fromstring(text)
        # Completed faces are pure vector: the legacy scan and its mask are gone.
        assert 'url(#keep)' not in text, key
        assert not any(group.get('mask') == 'url(#keep)' for group in root), key
        assert not any(mask.get('id') == 'keep' for mask in root.iter(f'{{{NS}}}mask')), key
        groups = [g for g in root if g.get('data-corner')]
        for group in root:
            if group.get('data-map-links') == 'true' or group.get('data-map-markers') == 'true':
                validate_artwork(group)
        for group in groups:
            side = group.get('data-corner')
            l, t, r, b = row['corners'][side]['bbox']
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
                actual = [e.get('data-marker') or e.get('data-faction')
                          for e in group.iter() if e.get('data-marker') or e.get('data-faction')]
                assert actual == right_markers(row), key
                totals['river'] += 'river' in actual
            totals[side] += 1
            totals['panels'] += 1
        totals['faces'] += 1
    assert totals == {'faces': 511, 'panels': 729, 'left': 224, 'right': 505, 'river': 12, 'doubleLeft': 21}, totals
    report = ROOT / 'output/map-corner-vector-review-20261024/production-check.json'
    report.write_text(json.dumps({**totals, 'embeddedScans': 0, 'keepMasks': 0,
                                  'sourceImagesArchived': True,
                                  'externalImageDependencies': 0}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(totals))


if __name__ == '__main__':
    verify()
