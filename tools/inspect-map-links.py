"""Inventory edge route panels from the existing overlay alpha, without installing assets.

All bounds are half-open pixel bounds in the original 1024-square overlay.
Metadata is recorded as supporting evidence only: it never creates a missing panel.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import find_objects, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/map-link-vector-review-20261025'


def read_js(path):
    text = path.read_text(encoding='utf-8-sig')
    return json.loads(text[text.index('{'):text.rindex('}') + 1])


def source(key):
    relative = Path('map/images/hd1024/overlay') / (key + '.png')
    backup = ROOT / 'output/map-originals-backup-20261024' / relative
    return backup if backup.is_file() else ROOT / relative


def components(path):
    alpha = np.asarray(Image.open(path).getchannel('A'))
    labels, _ = label(alpha > 100)
    result = []
    for ident, slices in enumerate(find_objects(labels), 1):
        if slices is None:
            continue
        count = int(np.sum(labels[slices] == ident))
        if count < 150:
            continue
        ys, xs = slices
        result.append(dict(componentLabel=ident, bbox=[xs.start, ys.start, xs.stop, ys.stop], pixels=count))
    return result


def panel_direction(component):
    l, t, r, b = component['bbox']
    w, h = r-l, b-t
    cx, cy = (l+r)/2, (t+b)/2
    if w < 100 or h < 55 or h > 170 or w/h < 1.2:
        return None
    if cy < 205 and 270 < cx < 735:
        return 'up'
    if cy > 800 and 270 < cx < 735:
        return 'down'
    if l < 120 and 100 < cy < 900:
        return 'left'
    if r > 910 and 100 < cy < 900:
        return 'right'
    return None


def gap(a, b):
    al, at, ar, ab = a
    bl, bt, br, bb = b
    return max(0, al-br, bl-ar), max(0, at-bb, bt-ab)


def inspect():
    tags = read_js(ROOT / 'map/map-tile-tags.js')
    headings = read_js(ROOT / 'map/c5-heading-data.js')
    mapdata = read_js(ROOT / 'map/map-data.js')
    tiles = {(cycle['id'], tile['id']): tile for cycle in mapdata['cycles'] for tile in cycle['tiles']}
    inventory = json.loads((ROOT / 'tools/map-corner-vector-source/inventory.json').read_text(encoding='utf-8'))
    records = []
    for row in inventory['faces']:
        key, cycle = row['key'], row['cycle']
        number = key.split('-')[2]
        variant = ':alt' if '-alt-' in key else (':B' if key.endswith('-back') else ':A') if cycle == 'c5' else ''
        tagkey = f'{cycle}:{number}{variant}'
        hints = tags.get('neighborHints', {}).get(tagkey, [])
        routes = tags.get('localRoutes', {}).get(tagkey, [])
        path = source(key)
        parts = components(path)
        excluded = [c['bbox'] for side,c in row['corners'].items() if c.get('bbox') and
                    ((side == 'left' and row['left'] != '-') or (side == 'right' and row['factions']))]
        if cycle == 'c5':
            excluded.append(headings[key]['header'])
        panels = []
        assigned = set()
        for part in parts:
            l,t,r,b = part['bbox']
            w,h = r-l,b-t
            if any(max(0,min(r,er)-max(l,el))*max(0,min(b,eb)-max(t,et)) > .5*w*h
                   for el,et,er,eb in excluded):
                continue
            direction = panel_direction(part)
            # C3 special routes can sit anywhere; their plate is a real source
            # component, not a synthetic label inferred from the destination.
            if cycle == 'c3' and routes and 100 <= w <= 350 and 55 <= h <= 90 and w/h >= 1.2:
                cardinal = ((70 <= t <= 100 and b <= 165) or (865 <= t and b <= 960) or
                            (l < 100 and 450 <= t <= 500) or (r > 965 and 450 <= t <= 500))
                if not cardinal:
                    direction = 'special'
            # C2 local wave/lock boxes have no neighboring map number. Two of
            # these are square wave-only boxes, distinguishable by near-solid alpha.
            if cycle == 'c2' and routes and 60 <= w <= 160 and 55 <= h <= 125 and (w/h >= 1.2 or part['pixels']/(w*h)>.9):
                direction = 'local'
            if direction:
                panels.append(dict(id=f'{direction}-{sum(p["direction"] == direction for p in panels)+1}', direction=direction,
                                   **part, attachedExtras=[]))
                assigned.add(part['componentLabel'])
        arrows, unclassified = [], []
        for part in parts:
            ident = part['componentLabel']
            if ident in assigned:
                continue
            l, t, r, b = part['bbox']
            w, h = r-l, b-t
            cx, cy = (l+r)/2, (t+b)/2
            near = sorted(panels, key=lambda panel: sum(gap(part['bbox'], panel['bbox'])))
            nearest = near[0] if near else None
            dx, dy = gap(part['bbox'], nearest['bbox']) if nearest else (1024,1024)
            # Independent outward arrow, always tied to a nearby actual top/bottom panel.
            is_arrow = (nearest and nearest['direction'] in ('up','down','local') and
                        20 <= w <= 100 and 10 <= h <= 65 and w/h >= 1.3 and dx == 0 and dy < 55 and
                        ((nearest['direction'] == 'up' and (t+b)/2 <= nearest['bbox'][1]+18) or
                         (nearest['direction'] == 'down' and (t+b)/2 >= nearest['bbox'][3]-18) or
                         (nearest['direction'] == 'local' and ((t+b)/2 < nearest['bbox'][1]+18 or (t+b)/2 > nearest['bbox'][3]-18))))
            is_arrow = is_arrow or (nearest and nearest['direction']=='local' and
                                    10 <= w <= 65 and 20 <= h <= 100 and h/w >= 1.3 and dy==0 and dx<55)
            if is_arrow:
                arrows.append(dict(id=nearest['id']+'-arrow', direction=nearest['direction'], panelId=nearest['id'], **part))
                assigned.add(ident)
                continue
            # Nearby disconnected region circles / small icon cells: attach without guessing content.
            if (nearest and w <= 110 and h <= 110 and dx <= 14 and dy == 0 and
                    abs(cy-(nearest['bbox'][1]+nearest['bbox'][3])/2) <= 16):
                nearest['attachedExtras'].append(dict(kind='unread-symbol', **part))
                assigned.add(ident)
                continue
            unclassified.append(part)
        expected = tiles[(cycle, number)]['exits']
        reasons = []
        counts = Counter(p['direction'] for p in panels)
        if any(v > 1 for v in counts.values()):
            reasons.append('multiple-panels-on-one-edge')
        if any(p['attachedExtras'] for p in panels):
            reasons.append('detached-symbols-near-panel')
        if hints:
            reasons.append('neighbor-hints-need-symbol-audit')
        if routes:
            reasons.append('local-or-special-routes-detected-from-source-geometry')
        if '-alt-' in key:
            reasons.append('alternate-front-default-exits-are-reference-only')
        if cycle == 'c5':
            reasons.append('face-specific-route-artwork-may-differ-from-shared-exits')
        records.append(dict(key=key, cycle=cycle, face=row.get('face'),
                            source=path.relative_to(ROOT).as_posix(), sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                            panels=panels, arrows=arrows, unclassified=unclassified, expectedExits=expected,
                            neighborHints=hints, localRoutes=routes, reviewReasons=reasons))
    OUT.mkdir(parents=True, exist_ok=True)
    summary = dict(faces=len(records), panels=sum(len(r['panels']) for r in records),
                   arrows=sum(len(r['arrows']) for r in records),
                   attachedExtras=sum(len(p['attachedExtras']) for r in records for p in r['panels']),
                   panelsByCycle=dict(Counter(r['cycle'] for r in records for p in r['panels'])),
                   panelsByDirection=dict(Counter(p['direction'] for r in records for p in r['panels'])),
                   facesWithMultiplePanelsOnOneEdge=[r['key'] for r in records if 'multiple-panels-on-one-edge' in r['reviewReasons']])
    report = dict(version='20261025-source-alpha-inventory3', coordinateSystem='1024x1024; half-open bboxes',
                  detection='Source alpha > 100, connected components; geometry classifies candidates, metadata never adds panels.',
                  installation='none', summary=summary, faces=records)
    (OUT / 'inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    contact_sheets(records)
    print(json.dumps(summary, ensure_ascii=False))


def contact_sheets(records):
    dest = OUT / 'inventory-contact-sheets'
    dest.mkdir(exist_ok=True)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 11)
    colors = dict(up='#ffcd4d', down='#ff7d57', left='#50d8fc', right='#90ed8a', special='#e384ff', local='#91b5ff')
    for cycle in ('c1','c2','c3','c4','c5'):
        rows = [r for r in records if r['cycle'] == cycle]
        for start in range(0, len(rows), 16):
            page = Image.new('RGB', (1200, 1320), '#161b22')
            draw = ImageDraw.Draw(page)
            for i, row in enumerate(rows[start:start+16]):
                x, y = i%4*300, i//4*330
                art = Image.open(ROOT / row['source']).convert('RGBA')
                bg = Image.new('RGBA', art.size, '#454c54')
                bg.alpha_composite(art)
                mark = ImageDraw.Draw(bg)
                for panel in row['panels']:
                    mark.rectangle(panel['bbox'], outline=colors[panel['direction']], width=5)
                    for extra in panel['attachedExtras']:
                        mark.rectangle(extra['bbox'], outline='#e384ff', width=4)
                for arrow in row['arrows']:
                    mark.rectangle(arrow['bbox'], outline='#ffffff', width=4)
                page.paste(bg.convert('RGB').resize((296,296), Image.Resampling.LANCZOS), (x,y+25))
                draw.text((x+4,y+2), row['key'], fill='white', font=font)
                draw.text((x+4,y+318), f"panels {len(row['panels'])} / arrows {len(row['arrows'])}", fill='#b7c1cf', font=small)
            page.save(dest/f'{cycle}-{start//16+1:02}.jpg', quality=92)


if __name__ == '__main__':
    inspect()
