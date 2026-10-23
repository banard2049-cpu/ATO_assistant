"""Match C4/C5 technology dark-side scans to C1-C3 using RGB tone curves.

Stage and inspect first; --apply installs the staged images after backing up
and verifying every original. Card-side selection follows the dictionary,
because several C4/C5 dark sides have filenames ending in _face.jpg.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output/tech-dark-tones-20261023'
PERCENTILES = [20, 50, 75]
WHITE_ANCHOR = 190


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sample(image):
    # Resample consistently so scan resolution and grain do not bias the fit.
    return np.asarray(image.convert('RGB').resize((256, 256)), dtype=float)


def metrics(image):
    pixels = sample(image)
    return {
        'rgbPercentiles': np.percentile(pixels.reshape(-1, 3), PERCENTILES, axis=0).tolist(),
        'luminancePercentiles': np.percentile(pixels @ [.2126, .7152, .0722], PERCENTILES).tolist(),
    }


def pchip(x, y):
    """Monotone cubic interpolation for smooth, non-clipping tone curves."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    h = np.diff(x)
    delta = np.diff(y) / h
    slopes = np.zeros(len(x))
    for i in range(1, len(x) - 1):
        if delta[i - 1] * delta[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            slopes[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    for endpoint, first, second, h0, h1 in [
        (0, delta[0], delta[1], h[0], h[1]),
        (-1, delta[-1], delta[-2], h[-1], h[-2]),
    ]:
        slope = ((2 * h0 + h1) * first - h0 * second) / (h0 + h1)
        if slope * first <= 0:
            slope = 0
        elif first * second < 0 and abs(slope) > 3 * abs(first):
            slope = 3 * first
        slopes[endpoint] = slope
    values = np.arange(256, dtype=float)
    bins = np.clip(np.searchsorted(x, values, side='right') - 1, 0, len(x) - 2)
    t = (values - x[bins]) / h[bins]
    curve = ((2 * t**3 - 3 * t**2 + 1) * y[bins]
             + (t**3 - 2 * t**2 + t) * h[bins] * slopes[bins]
             + (-2 * t**3 + 3 * t**2) * y[bins + 1]
             + (t**3 - t**2) * h[bins] * slopes[bins + 1])
    # This is a darkening correction. Keep bright print at its original level.
    curve = np.minimum(np.clip(curve, 0, 255), values)
    curve[WHITE_ANCHOR:] = values[WHITE_ANCHOR:]
    curve = np.rint(curve).astype(np.uint8)
    if np.any(np.diff(curve.astype(int)) < 0):
        raise ValueError('Tone curves must be monotone')
    return curve.tolist()


def curves(source, reference):
    lookup, anchors = [], []
    for channel in range(3):
        x = [0, *source[:, channel], WHITE_ANCHOR, 255]
        y = [0, *np.minimum(reference[:, channel], source[:, channel]), WHITE_ANCHOR, 255]
        if np.any(np.diff(x) <= 0) or np.any(np.diff(y) < 0):
            raise ValueError(f'Invalid curve anchors: {x}, {y}')
        lookup.extend(pchip(x, y))
        anchors.append({'input': x, 'output': y})
    return lookup, anchors


def contact_sheet(records, name, staged=False):
    width, height, columns = 190, 300, 8
    sheet = Image.new('RGB', (columns * width, ((len(records) + columns - 1) // columns) * height), '#ddd9d0')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
    for i, row in enumerate(records):
        x, y = i % columns * width, i // columns * height
        path = OUTPUT / row['staged'] if staged else ROOT / row['file']
        with Image.open(path) as original:
            image = original.convert('RGB')
        image.thumbnail((180, 258))
        sheet.paste(image, (x + (width - image.width) // 2, y))
        label = f"{row['index']} {row['key']}"
        draw.multiline_text((x + 4, y + 260), label[:26] + '\n' + label[26:52], fill='black', font=font, spacing=2)
    sheet.save(OUTPUT / name, quality=94)


def preview(records, cards):
    # Pair examples by card format and function; include the alternate scans.
    pairs = [(0, 187), (0, 252), (182, 213), (42, 291), (42, 243), (43, 185), (43, 250)]
    cell_width, row_height = 380, 540
    canvas = Image.new('RGB', (cell_width * 3, 50 + row_height * len(pairs)), '#e1ded6')
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 21)
    label_font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
    for col, label in enumerate(['C1-C3 参考', 'C4/C5 调整前', 'C4/C5 调整后']):
        draw.text((col * cell_width + 12, 10), label, font=title_font, fill='black')
    by_index = {row['index']: row for row in records}
    for row_index, (reference_index, target_index) in enumerate(pairs):
        record = by_index[target_index]
        paths = [ROOT / 'technology' / cards[reference_index]['image']['back'],
                 ROOT / record['file'], OUTPUT / record['staged']]
        for column, path in enumerate(paths):
            with Image.open(path) as original:
                image = original.convert('RGB')
            image.thumbnail((360, 500))
            x, y = column * cell_width, 50 + row_index * row_height
            canvas.paste(image, (x + (cell_width - image.width) // 2, y))
            label = cards[reference_index]['key'] if column == 0 else record['key']
            draw.text((x + 10, y + 505), label[:39], font=label_font, fill='black')
    canvas.save(OUTPUT / 'comparison.jpg', quality=96)
    # Smaller paired details remain readable when viewed individually.
    for i in range(len(pairs)):
        canvas.crop((0, 50 + i * row_height, cell_width * 3, 50 + (i + 1) * row_height)).save(
            OUTPUT / f'comparison-{i + 1}.jpg', quality=96)


def stage():
    if (OUTPUT / 'installation.json').exists():
        raise ValueError('Images already installed; use the existing backed-up originals to revise the correction')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    dictionary = ROOT / 'technology/tech_card_dictionary.min.json'
    cards = json.loads(dictionary.read_text(encoding='utf-8-sig'))['cards']
    reference_groups, source_groups = defaultdict(list), defaultdict(list)
    records, protected = [], {}
    for card in cards:
        cycle = max(int(node['page'].removeprefix('cycle')) for node in card['nodes'])
        path = ROOT / 'technology' / card['image']['back']
        with Image.open(path) as original:
            stats = metrics(original)
            orientation = 'landscape' if original.width > original.height else 'portrait'
            size, mode = list(original.size), original.mode
        group = f"{card['category']}-{orientation}"
        if cycle <= 3:
            reference_groups[group].append(stats['rgbPercentiles'])
            protected[path.relative_to(ROOT).as_posix()] = sha(path)
            protected[(ROOT / 'technology' / card['image']['face']).relative_to(ROOT).as_posix()] = sha(ROOT / 'technology' / card['image']['face'])
            continue
        if cycle not in (4, 5) or mode != 'RGB':
            raise ValueError(f'Unexpected target: {path}, cycle={cycle}, mode={mode}')
        source_group = f'c{cycle}-{group}'
        faded = stats['luminancePercentiles'][0] > 45
        if faded:
            source_groups[source_group].append(stats['rgbPercentiles'])
        protected[(ROOT / 'technology' / card['image']['face']).relative_to(ROOT).as_posix()] = sha(ROOT / 'technology' / card['image']['face'])
        records.append({'index': card['index'], 'key': card['key'], 'cycle': cycle,
                        'file': path.relative_to(ROOT).as_posix(), 'originalSha256': sha(path),
                        'size': size, 'mode': mode, 'referenceGroup': group, 'sourceGroup': source_group,
                        'treatment': 'remove-faded-scan-lift' if faded else 'gentle-alternate-scan-curve',
                        'before': stats})
    if len(records) != 134 or len({row['file'] for row in records}) != 134:
        raise ValueError('Expected 134 unique dark-side images')
    if protected.keys() & {row['file'] for row in records}:
        raise ValueError('A dark-side file is also used as a protected card side')
    references = {key: np.median(value, axis=0) for key, value in reference_groups.items()}
    sources = {key: np.median(value, axis=0) for key, value in source_groups.items()}
    for row in records:
        reference = references[row['referenceGroup']]
        source = sources[row['sourceGroup']] if row['treatment'] == 'remove-faded-scan-lift' else np.asarray(row['before']['rgbPercentiles'])
        lookup, row['curves'] = curves(source, reference)
        path = ROOT / row['file']
        target = OUTPUT / 'staged' / path.name
        target.parent.mkdir(exist_ok=True)
        with Image.open(path) as original:
            adjusted = original.point(lookup)
            if original.getexif().get(274, 1) != 1:
                raise ValueError(f'Unexpected EXIF orientation: {path}')
            adjusted.save(target, quality=98, subsampling=0, optimize=True)
            pixels = np.asarray(original)
            bright = np.min(pixels, axis=2) >= WHITE_ANCHOR
            if not np.array_equal(np.asarray(adjusted)[bright], pixels[bright]):
                raise ValueError('Bright neutral text changed before JPEG encoding')
            row['protectedBrightPixels'] = int(np.count_nonzero(bright))
        with Image.open(target) as check:
            if list(check.size) != row['size'] or check.mode != row['mode']:
                raise ValueError(f'Output dimensions or mode changed: {target}')
            row['after'] = metrics(check)
            if row['after']['luminancePercentiles'][1] >= row['before']['luminancePercentiles'][1]:
                raise ValueError(f'Image was not darkened: {path}')
        row['staged'] = target.relative_to(OUTPUT).as_posix()
        row['sha256'] = sha(target)
    for cycle in [4, 5]:
        selected = [row for row in records if row['cycle'] == cycle]
        contact_sheet(selected, f'c{cycle}-after.jpg', staged=True)
    preview(records, cards)
    report = {'method': 'Monotone RGB curves; C1-C3 reference percentiles; highlights >=190 unchanged before JPEG encoding',
              'dictionarySha256': sha(dictionary), 'jpegQuality': 98, 'subsampling': 0,
              'referenceGroups': {key: value.tolist() for key, value in references.items()},
              'sourceGroups': {key: value.tolist() for key, value in sources.items()},
              'protected': protected, 'files': records}
    (OUTPUT / 'staging.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'staged': len(records), 'fadedScans': sum(row['treatment'] == 'remove-faded-scan-lift' for row in records),
                      'protectedFiles': len(protected), 'preview': str(OUTPUT / 'comparison.jpg')}), flush=True)


def apply():
    if (OUTPUT / 'installation.json').exists():
        raise ValueError('Already installed; refusing to darken the images twice')
    report = json.loads((OUTPUT / 'staging.json').read_text(encoding='utf-8'))
    dictionary = ROOT / 'technology/tech_card_dictionary.min.json'
    if sha(dictionary) != report['dictionarySha256']:
        raise ValueError('Card dictionary changed since staging')
    for name, digest in report['protected'].items():
        if sha(ROOT / name) != digest:
            raise ValueError(f'Protected card side changed since staging: {name}')
    for row in report['files']:
        if sha(ROOT / row['file']) != row['originalSha256'] or sha(OUTPUT / row['staged']) != row['sha256']:
            raise ValueError(f'Source or staged file changed since staging: {row["file"]}')
    backup = OUTPUT / 'originals'
    # Back up the entire set before replacing the first target.
    for row in report['files']:
        saved = backup / row['file']
        saved.parent.mkdir(parents=True, exist_ok=True)
        if saved.exists() and sha(saved) != row['originalSha256']:
            raise ValueError(f'Existing backup differs: {saved}')
        shutil.copy2(ROOT / row['file'], saved)
        if sha(saved) != row['originalSha256']:
            raise ValueError(f'Backup verification failed: {saved}')
    for row in report['files']:
        target = ROOT / row['file']
        staged = target.with_name(target.name + '.tone-partial')
        shutil.copyfile(OUTPUT / row['staged'], staged)
        if sha(staged) != row['sha256']:
            raise ValueError(f'Copy verification failed: {target}')
        staged.replace(target)
    for name, digest in report['protected'].items():
        if sha(ROOT / name) != digest:
            raise ValueError(f'Protected card side changed during installation: {name}')
    for row in report['files']:
        if sha(ROOT / row['file']) != row['sha256']:
            raise ValueError(f'Installed image differs: {row["file"]}')
    report['originalBackup'] = str(backup)
    report['installed'] = True
    (OUTPUT / 'installation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'installed': len(report['files']), 'protectedUnchanged': len(report['protected']), 'backup': str(backup)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Install previously staged and reviewed images')
    args = parser.parse_args()
    apply() if args.apply else stage()
