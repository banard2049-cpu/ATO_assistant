"""Extract C1–C3 card backs from a local TTS save and its image cache.

The map decks deliberately put the unrevealed side in FaceURL. BackURL is
the revealed map and must never be used for these assets. Nothing in the
save's scripts is executed. Source sheets and the save are read only.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from map_back_brightness import DEFAULT_BRIGHTNESS, adjust_pixels, brightness_version

ROOT = Path(__file__).resolve().parents[1]
VERSION = brightness_version(DEFAULT_BRIGHTNESS)
EXPECTED = {'c1': 94, 'c2': 84, 'c3': 92}
SPECIAL = {'009', '013', '014', '018', '022', '023', '035'}
PREFIX = 'window.ATO_MAP_BACK_DATA = '


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_registry(path):
    return json.loads(path.read_text(encoding='utf-8').removeprefix(PREFIX).strip().removesuffix(';'))


def find_maps(value):
    if isinstance(value, dict):
        if value.get('Nickname') == 'Map' and value.get('Name') == 'Deck':
            yield value
        for key, child in value.items():
            if key not in ('LuaScript', 'XmlUI'):
                yield from find_maps(child)
    elif isinstance(value, list):
        for child in value:
            yield from find_maps(child)


def cached_path(cache, url):
    stem = re.sub(r'[^a-zA-Z0-9]', '', url)
    matches = [p for p in cache.glob(stem + '.*') if p.suffix.lower() in ('.jpg', '.jpeg', '.png')]
    if len(matches) != 1:
        raise ValueError(f'Expected one cached image for {url}, found {len(matches)}')
    return matches[0]


def extract(save, cache, output):
    old = read_registry(ROOT / 'map/tile-back-data.js')
    spec = importlib.util.spec_from_file_location('compact_map_backs', ROOT / 'tools/compact-map-card-backs.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    document = json.loads(save.read_text(encoding='utf-8-sig'))
    decks = list(find_maps(document))
    source_sheets = {}
    registry = {'version': VERSION, 'tileSize': 825, 'pixelBrightness': DEFAULT_BRIGHTNESS,
                'numberBrightness': 1, 'alternateBacks': 'original-images',
                'source': {'workshopId': save.stem, 'side': 'FaceURL', 'saveSha256': sha(save)},
                'bases': {**old['bases'], **{cycle: f'./images/card-backs/{cycle}-base.png' for cycle in EXPECTED}},
                'backs': {key: entry for key, entry in old['backs'].items() if entry['cycle'] not in EXPECTED}}
    rows = []
    destination = output / 'card-backs'
    (destination / 'numbers').mkdir(parents=True, exist_ok=True)
    for cycle, expected in EXPECTED.items():
        # Card names, including tutorial and alternate tiles, disambiguate
        # the decks without relying on their order in ObjectStates.
        wanted = {key for key, entry in old['backs'].items() if entry['cycle'] == cycle}
        candidates = []
        for deck in decks:
            cards = {}
            for card in deck.get('ContainedObjects', []):
                name = card.get('Nickname', '')
                match = re.fullmatch(r'Alt(\d{3})', name)
                number = match[1] if match else name
                if not re.fullmatch(r'(?:\d{3}|T\d{2})', number):
                    break
                key = f'{cycle}-tile-{number}' + ('-alt' if match else '') + '-back'
                if key in cards:
                    break
                cards[key] = card
            else:
                if set(cards) == wanted:
                    candidates.append((deck, cards))
        if len(candidates) != 1 or len(wanted) != expected:
            raise ValueError(f'{cycle}: cannot uniquely match the {expected} registered card backs')
        deck, cards = candidates[0]
        sheets = {}
        for key in sorted(cards):
            card = cards[key]
            deck_id, index = divmod(card['CardID'], 100)
            definition = deck['CustomDeck'][str(deck_id)]
            if not definition['UniqueBack']:
                raise ValueError(f'{key}: map deck no longer has individual revealed sides')
            url = definition['FaceURL']
            if url not in sheets:
                path = cached_path(cache, url)
                with Image.open(path) as image:
                    sheets[url] = image.convert('RGB')
                source_sheets[url] = {'sha256': sha(path), 'size': list(sheets[url].size)}
            sheet = sheets[url]
            columns, height = definition['NumWidth'], definition['NumHeight']
            if sheet.width % columns or sheet.height % height or index >= columns * height:
                raise ValueError(f'{key}: invalid sheet dimensions or CardID')
            width, height = sheet.width // columns, sheet.height // height
            if (width, height) != (825, 825):
                raise ValueError(f'{key}: unexpected native size {(width, height)}')
            x, y = index % columns * width, index // columns * height
            face = sheet.crop((x, y, x + width, y + height))
            rgb = np.asarray(face)
            alpha = helper.cut_labels(rgb)[0][1]
            if key == f'{cycle}-tile-001-back':
                # Only clear the number plaque, sampling the same row's
                # texture. All other native pixels remain untouched; no
                # enlargement, denoising, sharpening or edge reconstruction.
                base = rgb.copy()
                yy, xx = np.where(alpha > 0)
                base[yy, xx] = rgb[yy, xx - 280]
                adjust_pixels(Image.fromarray(base)).save(destination / f'{cycle}-base.png', compress_level=9)
            masks = [('number', alpha)]
            if '-alt-' in key:
                if cycle != 'c1' or key.split('-')[2] not in SPECIAL:
                    raise ValueError(f'Unexpected special back: {key}')
                # Keep the old dependency names for existing asset packs;
                # current renderers display the original opaque image directly.
                masks.append(('instruction', 255 - alpha))
            pieces = []
            for kind, mask in masks:
                yy, xx = np.where(mask > 0)
                box = [int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1]
                rgba = np.dstack((rgb, mask)).copy()
                rgba[mask == 0] = 0
                patch = Image.fromarray(rgba).crop(tuple(box))
                if kind == 'instruction':
                    patch = face.copy()
                    box = [0, 0, width, height]
                name = key + ('-instruction' if kind == 'instruction' else '') + '.png'
                path = destination / 'numbers' / name
                patch.save(path, compress_level=9)
                with Image.open(path) as check:
                    if check.tobytes() != patch.tobytes():
                        raise ValueError(f'Lossless pixel verification failed: {name}')
                pieces.append({'src': './images/card-backs/numbers/' + name, 'kind': kind,
                               'x': 100 * box[0] / width, 'y': 100 * box[1] / height,
                               'width': 100 * (box[2] - box[0]) / width,
                               'height': 100 * (box[3] - box[1]) / height, 'bbox': box})
            registry['backs'][key] = {'cycle': cycle, 'pieces': pieces}
            if '-alt-' in key:
                registry['backs'][key]['image'] = pieces[1]['src']
            rows.append({'key': key, 'cardID': card['CardID'], 'nickname': card['Nickname'],
                         'sheet': url, 'sourceBox': [x, y, x + width, y + height],
                         'sourcePixelsSha256': hashlib.sha256(face.tobytes()).hexdigest()})
        print(f'{cycle}: extracted and pixel-verified {len(cards)} backs', flush=True)
    if set(registry['backs']) != set(old['backs']):
        raise ValueError('The registered card identities changed')
    (output / 'registry.json').write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {'source': str(save), 'sourceSheets': source_sheets, 'cards': rows,
              'nativeSize': [825, 825], 'pixelBrightness': DEFAULT_BRIGHTNESS,
              'numberPixelsPreserved': True, 'alternateBacks': 'original-images',
              'specialArtworkAndInstructionsPreserved': 7,
              'bytes': sum(p.stat().st_size for p in destination.rglob('*.png'))}
    (output / 'extraction.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    preview(registry, output)
    return registry


def preview(registry, output):
    picks = ['c1-tile-001-back', 'c2-tile-038-back', 'c3-tile-059-back',
             'c1-tile-T00-back', 'c1-tile-009-alt-back', 'c1-tile-035-alt-back']
    sheet = Image.new('RGB', (1260, 904), '#d9ddd6')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 19)
    for index, key in enumerate(picks):
        entry = registry['backs'][key]
        face = Image.open(output / 'card-backs' / f"{entry['cycle']}-base.png").convert('RGBA')
        for piece in entry['pieces']:
            path = output / 'card-backs/numbers' / Path(piece['src']).name
            with Image.open(path) as patch:
                face.alpha_composite(patch, tuple(piece['bbox'][:2]))
        x, y = index % 3 * 420, index // 3 * 452
        sheet.paste(face.convert('RGB').resize((410, 410), Image.Resampling.LANCZOS), (x + 5, y + 32))
        draw.text((x + 8, y + 7), key, font=font, fill='#243026')
    sheet.save(output / 'preview.jpg', quality=96, subsampling=0)


def install(registry, output):
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = ROOT / 'output/backups' / f'map-backs-before-workshop-{stamp}'
    originals = [ROOT / 'map/tile-back-data.js']
    replacements = sorted((output / 'card-backs').rglob('*.png'))
    if len(replacements) != 280:
        raise ValueError(f'Expected 3 bases, 270 numbers and 7 special faces; got {len(replacements)}')
    originals += [ROOT / 'map/images' / path.relative_to(output) for path in replacements]
    for original in originals:
        target = backup / original.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, target)
        if sha(original) != sha(target):
            raise ValueError(f'Backup verification failed: {original}')
    for source in replacements:
        target = ROOT / 'map/images' / source.relative_to(output)
        shutil.copyfile(source, target)
        if sha(source) != sha(target):
            raise ValueError(f'Installation verification failed: {target}')
    (ROOT / 'map/tile-back-data.js').write_text(
        PREFIX + json.dumps(registry, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8', newline='\n')
    (output / 'installation.json').write_text(json.dumps({'backup': str(backup), 'files': len(replacements),
        'registryVersion': VERSION}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Installed {len(replacements)} PNG files; verified backup: {backup}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('save', type=Path)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/map-backs-workshop-3458296558')
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    result = extract(args.save, args.cache, args.output)
    if args.install:
        install(result, args.output)
