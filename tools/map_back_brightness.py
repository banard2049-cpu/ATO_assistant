"""Adjust C1–C4 card-back RGB pixels, preserving size and transparency."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BRIGHTNESS = 0.65
REGISTRY_PREFIX = 'window.ATO_MAP_BACK_DATA = '
REPORT = ROOT / 'output/map-backs-brightness-20261023/installation.json'


def brightness_version(factor):
    return f'20261023-workshop-3458296558-b{round(factor * 100)}-labels1-original-alts1'


def adjust_pixels(image, factor=DEFAULT_BRIGHTNESS):
    if not 0 < factor <= 1 or image.mode not in ('RGB', 'RGBA'):
        raise ValueError('Expected RGB/RGBA image and brightness between 0 and 1')
    lookup = [int(value * factor + 0.5) for value in range(256)]
    # Preserve the original alpha channel byte for byte.
    return image.point(lookup * 3 + (list(range(256)) if image.mode == 'RGBA' else []))


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def c4_label_mask(image):
    """Keep printed plaques and their direction arrows at source brightness."""
    if image.size != (825, 825):
        raise ValueError('C4 plaque coordinates require the original 825px scan')
    # These five printed positions are shared by all C4 card backs. Empty
    # neighbor positions have no white faction icon and are left darkened.
    positions = [
        ((550, 35, 800, 145), [(568, 94), (590, 54), (756, 54), (781, 93), (758, 133), (589, 133)], None),
        ((330, 65, 490, 137), [(341, 68), (476, 68), (476, 130), (341, 130)], [(383, 61), (383, 54), (407, 40), (432, 54), (432, 61)]),
        ((630, 375, 805, 458), [(645, 386), (769, 386), (787, 415), (770, 447), (645, 447)], None),
        ((20, 375, 190, 458), [(34, 386), (171, 386), (171, 447), (34, 447), (19, 416)], None),
        ((325, 695, 490, 773), [(340, 707), (477, 707), (477, 766), (340, 766)], [(383, 772), (433, 772), (433, 780), (407, 794), (383, 780)]),
    ]
    rgb = np.asarray(image.convert('RGB')).astype(np.int16)
    neutral = (rgb.min(axis=2) > 165) & (rgb.max(axis=2) - rgb.min(axis=2) < 55)
    mask = Image.new('L', image.size)
    draw = ImageDraw.Draw(mask)
    for box, polygon, arrow in positions:
        x0, y0, x1, y1 = box
        if np.count_nonzero(neutral[y0:y1, x0:x1]) < 25:
            continue
        draw.polygon(polygon, fill=255)
        if arrow:
            draw.polygon(arrow, fill=255)
    return mask.filter(ImageFilter.MaxFilter(9))


def apply(factor):
    registry_path = ROOT / 'map/tile-back-data.js'
    registry = json.loads(registry_path.read_text(encoding='utf-8').removeprefix(REGISTRY_PREFIX).strip().removesuffix(';'))
    targets = {ROOT / 'map' / source.removeprefix('./') for source in registry['bases'].values()}
    targets.update(ROOT / 'map' / piece['src'].removeprefix('./')
                   for back in registry['backs'].values() for piece in back['pieces'])
    targets.update((ROOT / 'map/images').glob('c4-tile-*-back.png'))
    expected_layers = set(registry['bases'].values()) | {
        piece['src'] for back in registry['backs'].values() for piece in back['pieces']}
    expected_count = len(expected_layers) + len(list((ROOT / 'map/images').glob('c4-tile-*-back.png')))
    if len(targets) != expected_count or any(not path.is_file() for path in targets):
        raise ValueError('Registered card-back layers or C4 fallback scans are incomplete')

    # Subsequent adjustments always start from the saved originals, so a
    # repeat invocation cannot compound the darkening.
    previous = json.loads(REPORT.read_text(encoding='utf-8')) if REPORT.exists() else None
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = ROOT / 'output/backups' / f'map-backs-before-pixel-brightness-{stamp}'
    original_backup = Path(previous['originalBackup']) if previous else backup
    for path in sorted(targets | {registry_path}):
        saved = backup / path.relative_to(ROOT)
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, saved)
        if sha(path) != sha(saved):
            raise ValueError(f'Backup verification failed: {path}')
    original_registry_path = original_backup / 'map/tile-back-data.js'
    original_registry = json.loads(original_registry_path.read_text(encoding='utf-8').removeprefix(REGISTRY_PREFIX).strip().removesuffix(';'))
    original_specials = {}
    for key, back in original_registry['backs'].items():
        if '-alt-' not in key:
            continue
        # Recombine the original extracted pixels once, producing an opaque
        # original image rather than a transparency mask.
        face = Image.new('RGBA', (825, 825))
        for piece in back['pieces']:
            with Image.open(original_backup / 'map' / piece['src'].removeprefix('./')) as patch:
                face.alpha_composite(patch.convert('RGBA'), tuple(piece['bbox'][:2]))
        instruction = next(piece['src'] for piece in back['pieces'] if piece['kind'] == 'instruction')
        original_specials[(ROOT / 'map' / instruction.removeprefix('./')).resolve()] = face.convert('RGB')
        registry['backs'][key]['image'] = instruction
    records = []
    for index, target in enumerate(sorted(targets), 1):
        original = original_backup / target.relative_to(ROOT)
        if previous:
            record = next(row for row in previous['files'] if row['file'] == target.relative_to(ROOT).as_posix())
            if sha(original) != record['originalSha256']:
                raise ValueError(f'Original backup changed: {original}')
        with Image.open(original) as image:
            if target.resolve() in original_specials:
                adjusted = original_specials[target.resolve()]
                treatment = 'original-special-image'
            elif target.parent.name == 'numbers':
                adjusted = image.copy()
                treatment = 'unchanged-number-and-faction'
            else:
                adjusted = adjust_pixels(image, factor)
                treatment = 'darkened-background'
                if target.name.startswith('c4-tile-'):
                    adjusted.paste(image, (0, 0), c4_label_mask(image))
                    treatment = 'darkened-background-preserved-plaques'
        staged = target.with_name(target.name + '.partial')
        if treatment == 'unchanged-number-and-faction':
            shutil.copyfile(original, staged)
        else:
            adjusted.save(staged, format='PNG', compress_level=9)
        with Image.open(staged) as check:
            if check.mode != adjusted.mode or check.size != adjusted.size or check.tobytes() != adjusted.tobytes():
                raise ValueError(f'Pixel verification failed: {target}')
        staged.replace(target)
        records.append({'file': target.relative_to(ROOT).as_posix(), 'originalSha256': sha(original),
                        'sha256': sha(target), 'size': list(adjusted.size), 'mode': adjusted.mode, 'treatment': treatment})
        if index % 80 == 0:
            print(f'Adjusted and verified {index}/{len(targets)} images', flush=True)
    registry['version'] = brightness_version(factor)
    registry['pixelBrightness'] = factor
    registry['numberBrightness'] = 1
    registry['alternateBacks'] = 'original-images'
    registry_path.write_text(REGISTRY_PREFIX + json.dumps(registry, ensure_ascii=False, indent=2) + ';\n',
                             encoding='utf-8', newline='\n')
    report = {'brightness': factor, 'originalBackup': str(original_backup), 'backup': str(backup),
              'files': records, 'numberAndFactionLayersUnchanged': True,
              'alternateBacks': 'original-images', 'sizePreserved': True}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'images': len(records), 'brightness': factor, 'originalBackup': str(original_backup)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--brightness', type=float, default=DEFAULT_BRIGHTNESS)
    args = parser.parse_args()
    if not 0 < args.brightness <= 1:
        parser.error('--brightness must be between 0 and 1')
    apply(args.brightness)
