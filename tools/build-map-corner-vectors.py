"""Replace map corner panels, preserving every other overlay pixel.

Original PNG layers are archived outside runtime assets. Corner-stage SVGs embed
the original layer and mask the audited corners and C5 top number plates before
drawing vector marks. Once every marker is complete, the full-canvas cut hides
that raster entirely; the completed file drops the unused image and mask.
C1 alternate fronts use their separately audited corner bounds.
"""
import hashlib
import json
import xml.etree.ElementTree as ET
import argparse

from map_corner_vectors import ROOT, HD, NS, inventory, image, svg, panel, right_markers, heading_mask, original_overlay
from map_link_production import apply_link_vectors, read_production
from map_marker_production import apply_marker_components, read_production as read_marker_production
from map_overlay_cleanup import strip_hidden_raster

VERSION = '20261024-vector-corners4-c1-alternates'
RASTERLESS_VERSION = '20261108-rasterless1'


def build(check_replay=False):
    rows = inventory['faces']
    assert len(rows) == 511 and len({r['key'] for r in rows}) == 511
    assert sum('-alt-' in r['key'] for r in rows) == 7
    links = read_production()
    markers = read_marker_production()
    if links:
        assert set(links['faces']) == {row['key'] for row in rows}, 'Link coverage differs from map inventory'
    if markers:
        assert set(markers['faces']) == {row['key'] for row in rows}, 'Marker coverage differs from map inventory'
    version = markers['version'] if markers else links['version'] if links else VERSION
    records = []
    for row in rows:
        key = row['key']
        mask = '<rect width="1024" height="1024" fill="white"/>'
        layer = ''
        corners = []
        for side in ('left', 'right'):
            if (side == 'left' and row['left'] == '-') or (side == 'right' and not row['factions']):
                continue
            l, t, r, b = row['corners'][side]['bbox']
            assert 0 <= l < r <= 1024 and 0 <= t < b <= 1024
            body, _, label = panel(row, side)
            assert not list(ET.fromstring(svg(body, r-l, b-t)).iter(f'{{{NS}}}image'))
            mask += f'<rect x="{l-3}" y="{t-3}" width="{r-l+6}" height="{b-t+6}" fill="black"/>'
            layer += f'<g data-corner="{side}" transform="translate({l} {t})">{body}</g>'
            corners.append({'side': side, 'bbox': [l, t, r, b], 'label': label})
        mask += heading_mask(row)
        original = original_overlay(key)
        result = svg('<defs><mask id="keep" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
                     + mask + '</mask></defs><g mask="url(#keep)">' + image(original) + '</g>' + layer, 1024, 1024)
        if links:
            root = apply_link_vectors(ET.fromstring(result), key, links)
            result = ET.tostring(root, encoding='unicode')
        if markers:
            root = apply_marker_components(ET.fromstring(result),key,markers)
            result = ET.tostring(root,encoding='unicode')
        # Complete faces hide the original scan behind a full-canvas cut; drop
        # that now-unused raster instead of storing it in every SVG.
        result, _ = strip_hidden_raster(result)
        target = HD / 'overlay' / f'{key}-corners.svg'
        if check_replay:
            assert ET.canonicalize(result,strip_text=True)==ET.canonicalize(target.read_text(encoding='utf8'),strip_text=True),f'Rebuild would change installed composition: {key}'
        else:target.write_text(result, encoding='utf-8')
        records.append({'key': key, 'corners': corners, 'sourceSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                        'rightMarkers': right_markers(row), 'bytes': target.stat().st_size})

    complete = bool(markers) and all(not row.get('pending', 0) for row in markers['faces'].values())
    installed_version = RASTERLESS_VERSION if complete else version
    registry = ROOT / 'map/tile-artwork-data.js'
    text = registry.read_text(encoding='utf-8-sig')
    data = json.loads(text[text.index('{'):text.rindex('}')+1])
    data['cornerVectorVersion'] = installed_version
    data['cornerVectorRasterless'] = complete
    data['cornerVectorFiles'] = sorted(r['key'] for r in rows)
    if not check_replay:registry.write_text('window.ATO_MAP_ARTWORK_DATA = '+json.dumps(data, ensure_ascii=False, indent=2)+';\n', encoding='utf-8')
    report = {'version': installed_version, 'faces': len(records), 'panels': sum(len(r['corners']) for r in records),
              'removedC5Headings': sum(row['cycle']=='c5' for row in rows), 'rasterless': complete,
              'markersReplayed':bool(markers),'checkReplayOnly':check_replay,
              'bytes': sum(r['bytes'] for r in records), 'records': records}
    destination = ROOT / 'output/map-corner-vector-review-20261024/production-report.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'records'}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check-replay',action='store_true')
    build(parser.parse_args().check_replay)
