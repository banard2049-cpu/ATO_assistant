"""Register native TTS map faces to reviewed overlays, then extract their pixels.

BackURL is the revealed face in these decks. Staging never changes map assets.
The original 1024px coordinates and reviewed transparent contours are retained.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import time
from datetime import datetime

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion, gaussian_filter, map_coordinates, label, find_objects, distance_transform_edt
from scipy.optimize import differential_evolution, minimize

ROOT = Path(__file__).resolve().parents[1]
HD = ROOT / 'map/images/hd1024'
DEFAULT_OUTPUT = ROOT / 'output/reports/map-workshop-fronts-20261023'
EXPECTED = {'c1': 94, 'c2': 84, 'c3': 92}
VERSION = '20261023-workshop-fronts1'
PRESERVED_REGIONS = {
    # The workshop edition lacks the translated name. Keep the entire reviewed
    # bilingual ribbon rather than silently reverting it to English.
    'c1-tile-027-front': [350, 802, 675, 873],
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def helper(filename):
    spec = importlib.util.spec_from_file_location(filename.replace('-', '_'), ROOT / 'tools' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def extract(save, cache, out):
    backs = helper('import-map-workshop-backs.py')
    doc = json.loads(save.read_text(encoding='utf-8-sig'))
    decks = list(backs.find_maps(doc))
    source_dir = out / 'source'
    source_dir.mkdir(parents=True, exist_ok=True)
    rows, sheets = [], {}
    for cycle, count in EXPECTED.items():
        wanted = {p.stem for p in (HD / 'overlay').glob(cycle + '-*-front.png')}
        matches = []
        for deck in decks:
            cards = {}
            for card in deck.get('ContainedObjects', []):
                name = card.get('Nickname', '')
                alt = re.fullmatch(r'Alt(\d{3})', name)
                number = alt[1] if alt else name
                if not re.fullmatch(r'(?:\d{3}|T\d{2})', number):
                    break
                key = f'{cycle}-tile-{number}' + ('-alt' if alt else '') + '-front'
                if key in cards:
                    break
                cards[key] = card
            else:
                if set(cards) == wanted:
                    matches.append((deck, cards))
        if len(matches) != 1 or len(wanted) != count:
            raise ValueError(f'Cannot uniquely match {cycle} / {count} faces')
        deck, cards = matches[0]
        for key, card in sorted(cards.items()):
            deck_id, index = divmod(card['CardID'], 100)
            definition = deck['CustomDeck'][str(deck_id)]
            assert definition['UniqueBack'], key
            url = definition['BackURL']
            if url not in sheets:
                path = backs.cached_path(cache, url)
                sheets[url] = (Image.open(path).convert('RGB'), sha(path))
            sheet, digest = sheets[url]
            columns, rows_count = definition['NumWidth'], definition['NumHeight']
            assert sheet.width % columns == sheet.height % rows_count == 0
            w, h = sheet.width // columns, sheet.height // rows_count
            assert (w, h) == (825, 825) and index < columns * rows_count, key
            x, y = index % columns * w, index // columns * h
            box = [x, y, x + w, y + h]
            path = source_dir / (key + '.png')
            sheet.crop(tuple(box)).save(path)
            rows.append(dict(key=key, cardId=card['CardID'], guid=card['GUID'],
                             url=url, sheetSha256=digest, box=box, sourceSha256=sha(path)))
        print(f'Extracted {count} {cycle} faces', flush=True)
    manifest = dict(save=str(save), saveSha256=sha(save), side='BackURL', cards=rows)
    (out / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return rows


def registration_samples(source, overlay, count=6000):
    raw = np.asarray(source.convert('L'), dtype=float)
    gray = np.asarray(overlay.convert('RGB').convert('L'), dtype=float)
    mask = binary_erosion(np.asarray(overlay.getchannel('A')) > 250, iterations=5)
    yy, xx = np.where(mask)
    assert len(xx) > 200, 'Too few opaque symbol pixels'
    idx = np.random.default_rng(1).choice(len(xx), min(count, len(xx)), replace=False)
    yy, xx = yy[idx], xx[idx]
    raw = gaussian_filter(raw, 1) - gaussian_filter(raw, 5)
    gray = gaussian_filter(gray, 1.3) - gaussian_filter(gray, 6)
    target = gray[yy, xx]
    target -= target.mean()
    target /= np.linalg.norm(target)
    return raw, target, yy, xx


def register(source, overlay):
    raw, target, yy, xx = registration_samples(source, overlay)
    scale = source.width / overlay.width
    # Parameterize around the center so translations and shears are independent.
    cx, cy = (xx - 512) / 1024, (yy - 512) / 1024

    def loss(p):
        tx, ty, sx, sy, xy, yx = p
        sample = map_coordinates(raw, [yy * scale + ty + cy * sy + cx * yx,
                                       xx * scale + tx + cx * sx + cy * xy], order=1)
        sample -= sample.mean()
        sample /= max(np.linalg.norm(sample), 1e-9)
        return 1 - np.dot(target, sample)

    bounds = [(-22, 22), (-22, 22), (-30, 30), (-30, 30), (-26, 26), (-26, 26)]
    fit = differential_evolution(loss, bounds, seed=2, popsize=7, tol=.0003, maxiter=130)
    tx, ty, sx, sy, xy, yx = fit.x.tolist()
    affine = [scale + sx / 1024, xy / 1024, tx - (sx + xy) / 2,
              yx / 1024, scale + sy / 1024, ty - (sy + yx) / 2]
    return affine, float(1 - fit.fun)


def stage_one(row, out):
    key = row['key']
    started = time.monotonic()
    target = HD / 'overlay' / (key + '.png')
    original = Image.open(target).convert('RGBA')
    source = Image.open(out / 'source' / target.name).convert('RGB')
    affine, correlation = register(source, original)
    record = dict(key=key, beforeSha256=sha(target), sourceSha256=row['sourceSha256'],
                  affine=affine, correlation=correlation, seconds=time.monotonic()-started)
    (out / 'alignment' / (key + '.json')).write_text(json.dumps(record, indent=2), encoding='utf-8')
    print(f'{key}: {correlation:.5f} ({record["seconds"]:.1f}s)', flush=True)
    return record


def fit_component(raw, target_gray, mask, initial):
    yy, xx = np.where(binary_erosion(mask, iterations=5))
    if len(xx) > 3500:
        idx = np.random.default_rng(4).choice(len(xx), 3500, replace=False)
        yy, xx = yy[idx], xx[idx]
    assert len(xx) > 60
    center = [float(xx.mean()), float(yy.mean())]
    cx, cy = (xx-center[0])/100, (yy-center[1])/100
    target = target_gray[yy, xx].copy()
    target -= target.mean()
    target /= max(np.linalg.norm(target), 1e-9)
    a, b, c, d, e, f = initial
    ox, oy = a*xx+b*yy+c, d*xx+e*yy+f

    def loss(p):
        tx, ty, sx, sy, xy, yx = p
        sample = map_coordinates(raw, [oy+ty+cy*sy+cx*yx, ox+tx+cx*sx+cy*xy], order=1)
        sample -= sample.mean()
        sample /= max(np.linalg.norm(sample), 1e-9)
        return 1-float(np.dot(sample, target))

    trials = [(loss([x,y,0,0,0,0]), x, y) for x in range(-24,25,4) for y in range(-24,25,4)]
    best = sorted(trials)[0]
    fit = minimize(loss, [best[1],best[2],0,0,0,0], method='Powell',
                   bounds=[(best[1]-4,best[1]+4),(best[2]-4,best[2]+4),(-4,4),(-4,4),(-2,2),(-2,2)],
                   options={'maxiter':45, 'xtol':.005, 'ftol':.00001})
    tx,ty,sx,sy,xy,yx = fit.x.tolist()
    result = [a+sx/100,b+xy/100,c+tx-(center[0]*sx+center[1]*xy)/100,
              d+yx/100,e+sy/100,f+ty-(center[0]*yx+center[1]*sy)/100]
    return result, float(1-fit.fun), [tx,ty], center


def build_one(row, out):
    key = row['key']
    alignment = json.loads((out/'alignment'/(key+'.json')).read_text(encoding='utf-8'))
    target = HD/'overlay'/(key+'.png')
    assert sha(target) == alignment['beforeSha256'], f'Overlay changed: {key}'
    original = Image.open(target).convert('RGBA')
    before = np.asarray(original)
    source = Image.open(out/'source'/target.name).convert('RGB')
    raw = np.asarray(source.convert('L'), dtype=float)
    raw = gaussian_filter(raw,1)-gaussian_filter(raw,5)
    gray = np.asarray(original.convert('RGB').convert('L'), dtype=float)
    gray = gaussian_filter(gray,1.3)-gaussian_filter(gray,6)
    protected = np.zeros(before.shape[:2],dtype=bool)
    if key in PRESERVED_REGIONS:
        l,t,r,b = PRESERVED_REGIONS[key]
        protected[t:b,l:r] = True
    numbers = json.loads((ROOT/'tools/map-hidden-number-regions.json').read_text(encoding='utf-8'))['tiles'].get(key)
    if numbers:
        renderer = helper('complete-map-hidden-numbers.py')
        bbox = renderer.render_numbers(numbers['numbers'],renderer.FONT).getbbox()
        l,t,r,b = bbox
        protected[max(0,t-5):min(1024,b+5),max(0,l-5):min(1024,r+5)] = True
    labs, count = label((before[:,:,3] > 8) & ~protected)
    slices = find_objects(labs)
    initial = alignment['affine'] if alignment['correlation'] > .92 else [825/1024,0,0,0,825/1024,0]
    parts = []
    for index, bounds in enumerate(slices,1):
        if bounds is None:
            continue
        size = int((labs[bounds]==index).sum())
        if size < 2000:
            continue
        mask = (labs==index) & (before[:,:,3]>250)
        affine, correlation, delta, center = fit_component(raw,gray,mask,initial)
        parts.append(dict(label=index, pixels=size, bbox=[bounds[1].start,bounds[0].start,bounds[1].stop,bounds[0].stop],
                          affine=affine, correlation=correlation, shift=delta, center=center))
    if not parts:
        raise ValueError(f'No substantial components: {key}')
    # Tiny arrows inherit the nearest verified plaque transform. Their position
    # relative to that plaque is preserved rather than fitting uniform fill.
    for index,bounds in enumerate(slices,1):
        if bounds is None or any(r['label']==index for r in parts):
            continue
        size = int((labs[bounds]==index).sum())
        if size < 50:
            continue
        center = [(bounds[1].start+bounds[1].stop)/2,(bounds[0].start+bounds[0].stop)/2]
        parent = min(parts,key=lambda r:(r['center'][0]-center[0])**2+(r['center'][1]-center[1])**2)
        parts.append(dict(label=index, pixels=size, bbox=[bounds[1].start,bounds[0].start,bounds[1].stop,bounds[0].stop],
                          affine=parent['affine'],correlation=None,inheritedFrom=parent['label'],center=center))
    # Extend component labels only into existing AA fringes; alpha never grows.
    _,indices = distance_transform_edt(labs==0,return_indices=True)
    owner = labs[tuple(indices)]
    rgb = np.asarray(source.transform(original.size,Image.Transform.AFFINE,initial,Image.Resampling.BICUBIC)).copy()
    for part in parts:
        warped = np.asarray(source.transform(original.size,Image.Transform.AFFINE,part['affine'],Image.Resampling.BICUBIC))
        region = (owner==part['label']) & (before[:,:,3]>0) & ~protected
        rgb[region] = warped[region]
    after = np.dstack((rgb,before[:,:,3])).copy()
    after[before[:,:,3]==0] = before[before[:,:,3]==0]
    after[protected] = before[protected]
    assert np.array_equal(after[:,:,3],before[:,:,3])
    assert np.array_equal(after[protected],before[protected])
    result = Image.fromarray(after)
    destination = out/'completed'/target.name
    destination.parent.mkdir(exist_ok=True)
    result.save(destination,compress_level=9)
    record = dict(alignment,afterSha256=sha(destination),alphaPreserved=True,
                  hiddenNumberGroupsPreserved=len(numbers['numbers']) if numbers else 0,
                  preservedRegion=PRESERVED_REGIONS.get(key),parts=parts)
    (out/'components'/(key+'.json')).write_text(json.dumps(record,indent=2),encoding='utf-8')
    low = [p for p in parts if p['correlation'] is not None and p['correlation'] < .90]
    print(f'{key}: {len(parts)} components; {len(low)} need review',flush=True)
    return record


def verify_and_install(out):
    sources = json.loads((out/'sources.json').read_text(encoding='utf-8'))
    rows = [json.loads((out/'components'/(r['key']+'.json')).read_text(encoding='utf-8')) for r in sources['cards']]
    assert len(rows)==270
    all_before = {p.relative_to(HD).as_posix():sha(p) for p in HD.rglob('*.png')}
    for row in rows:
        key = row['key']
        old = HD/'overlay'/(key+'.png')
        new = out/'completed'/old.name
        assert sha(old)==row['beforeSha256'], f'Installed overlay changed: {key}'
        assert sha(new)==row['afterSha256'], f'Staged overlay changed: {key}'
        before,after = np.asarray(Image.open(old)),np.asarray(Image.open(new))
        assert before.shape==after.shape==(1024,1024,4)
        assert np.array_equal(before[:,:,3],after[:,:,3]), key
        assert np.array_equal(before[before[:,:,3]==0],after[before[:,:,3]==0]), key
        assert all(c['correlation'] is None or c['correlation']>=.90 for c in row['parts']), key
        if key in PRESERVED_REGIONS:
            l,t,r,b = PRESERVED_REGIONS[key]
            assert np.array_equal(before[t:b,l:r],after[t:b,l:r])
        if row['hiddenNumberGroupsPreserved']:
            spec = json.loads((ROOT/'tools/map-hidden-number-regions.json').read_text(encoding='utf-8'))['tiles'][key]
            renderer = helper('complete-map-hidden-numbers.py')
            mask = np.asarray(renderer.render_numbers(spec['numbers'],renderer.FONT))[:,:,3]>0
            assert np.array_equal(before[mask],after[mask]), key
    # All targets are validated before any overwrite; backups are byte verified.
    backup = ROOT/'output/backups'/('map-fronts-before-workshop-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True,exist_ok=False)
    registry_path = ROOT/'map/tile-artwork-data.js'
    shutil.copy2(registry_path,backup/registry_path.name)
    assert sha(registry_path)==sha(backup/registry_path.name)
    for row in rows:
        name = row['key']+'.png'
        shutil.copy2(HD/'overlay'/name,backup/name)
        assert sha(backup/name)==row['beforeSha256'],name
    for row in rows:
        name = row['key']+'.png'
        target = HD/'overlay'/name
        assert sha(target)==row['beforeSha256']
        temporary = target.with_suffix('.png.pending')
        shutil.copyfile(out/'completed'/name,temporary)
        assert sha(temporary)==row['afterSha256']
        os.replace(temporary,target)
    prefix = 'window.ATO_MAP_ARTWORK_DATA = '
    registry = json.loads(registry_path.read_text(encoding='utf-8').removeprefix(prefix).strip().removesuffix(';'))
    registry['overlayVersions'] = dict(registry.get('overlayVersions',{}),**{cycle:VERSION for cycle in EXPECTED})
    registry_path.write_text(prefix+json.dumps(registry,ensure_ascii=False,indent=2)+';\n',encoding='utf-8',newline='\n')
    changed = {'overlay/'+r['key']+'.png' for r in rows}
    for path,digest in all_before.items():
        if path not in changed:
            assert sha(HD/path)==digest,path
    scores = [c['correlation'] for r in rows for c in r['parts'] if c['correlation'] is not None]
    report = dict(version=VERSION,source=sources['save'],sourceSha256=sources['saveSha256'],
                  installedFaces=len(rows),cycles=EXPECTED,backup=str(backup),alphaPixelExact=True,
                  otherPngsUnchanged=len(all_before)-len(changed),hiddenNumberGroupsPreserved=7,
                  bilingualRibbonPreserved='c1-tile-027-front',registeredComponents=len(scores),
                  minimumComponentCorrelation=min(scores),medianComponentCorrelation=float(np.median(scores)),files=rows)
    (out/'installation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False),flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--save', type=Path, default=Path('D:/files/My Games/Tabletop Simulator/Mods/Workshop/3458296558.json'))
    parser.add_argument('--cache', type=Path, default=Path('D:/files/My Games/Tabletop Simulator/Mods/Images'))
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--keys', nargs='*')
    parser.add_argument('--extract-only', action='store_true')
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--rebuild', action='store_true')
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    (out / 'alignment').mkdir(exist_ok=True)
    if args.install:
        verify_and_install(out)
        return
    if (out / 'sources.json').exists():
        manifest = json.loads((out / 'sources.json').read_text(encoding='utf-8'))
        assert sha(args.save) == manifest['saveSha256']
        rows = manifest['cards']
    else:
        rows = extract(args.save, args.cache, out)
    if args.extract_only:
        return
    rows = [r for r in rows if not args.keys or r['key'] in args.keys]
    folder = 'components' if args.build else 'alignment'
    (out/folder).mkdir(exist_ok=True)
    rows = [r for r in rows if args.rebuild or not (out / folder / (r['key']+'.json')).exists()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda row: (build_one if args.build else stage_one)(row, out), rows))


if __name__ == '__main__':
    main()
