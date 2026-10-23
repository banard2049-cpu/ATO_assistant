"""Split all 81 C4 map backs into one shared base and exact native cutouts.

All numbers, faction symbols, plaque borders and direction arrows are copied
from the source pixels. No lettering or symbols are redrawn. Default: stage
layers, contact sheets and a hash/coverage report. --install verifies backups
before updating the registry and runtime PNGs. Original scans remain available
for legacy fallback. Requires Pillow, NumPy and SciPy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from scipy.optimize import least_squares
from scipy.spatial import ConvexHull

from map_back_brightness import adjust_pixels, c4_label_mask

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'window.ATO_MAP_BACK_DATA = '
VERSION = '20261023-c4-shared-backs2'
SIZE = 825
# Reviewed outer plaque contours on 001 (west/south use 011). Each contour is
# registered independently: the physical scans have small local offsets.
PLAQUES = {
    'number': [(590, 55), (754, 55), (778, 94), (754, 132), (590, 132), (568, 94)],
    'north': [(344, 70), (472, 70), (472, 127), (344, 127)],
    'east': [(647, 389), (767, 389), (784, 417), (767, 445), (647, 445)],
    'south': [(343, 709), (472, 709), (472, 764), (343, 764)],
    'west': [(51, 389), (169, 389), (169, 441), (51, 441), (34, 415)],
}
ARROWS = {
    'north': [(385, 59), (407, 44), (429, 59)],
    'south': [(385, 775), (407, 791), (429, 775)],
}
ICON_WINDOWS = {'north': (410, 63, 489, 140), 'east': (635, 375, 721, 459),
                'south': (410, 695, 489, 774), 'west': (105, 375, 194, 459)}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def registry():
    return json.loads((ROOT / 'map/tile-back-data.js').read_text(encoding='utf-8')
                      .removeprefix(PREFIX).strip().removesuffix(';'))


def slots(number):
    return ['number', *(['north'] if number <= 72 else []),
            *(['east'] if number % 9 else []),
            *(['south'] if number > 9 else []),
            *(['west'] if (number - 1) % 9 else [])]


def polygon(points, size=(SIZE, SIZE)):
    mask = Image.new('L', size)
    ImageDraw.Draw(mask).polygon([tuple(point) for point in points], fill=255)
    return np.asarray(mask) > 0


def register_contour(rgb, points):
    """Locate the primary frame's outward gold edges, never its filled ink."""
    # The source is unadjusted, so thresholding does not depend on the current
    # display brightness. Sample each edge densely but omit its corners.
    samples, normals = [], []
    vertices = np.asarray(points, dtype=float)
    for first, last in zip(vertices, np.roll(vertices, -1, axis=0)):
        t = np.linspace(.08, .92, max(8, round(np.linalg.norm(last - first))))
        samples.extend(first[None, :] * (1 - t[:, None]) + last[None, :] * t[:, None])
        vector = last - first
        normals.extend(np.tile([vector[1], -vector[0]], (len(t), 1)) / np.linalg.norm(vector))
    samples = np.asarray(samples)
    normals = np.asarray(normals)
    colors = rgb.astype(float)
    gy, gx = np.gradient(ndi.gaussian_filter(colors[:, :, 0] - colors[:, :, 2], .7))
    # Search translations exhaustively to avoid a digit pulling the frame fit
    # into a nearby local optimum. All scanned frames are the same scale.
    best = None
    for dy in range(-11, 12):
        for dx in range(-11, 12):
            coords = [samples[:, 1] + dy, samples[:, 0] + dx]
            values = (ndi.map_coordinates(gx, coords, order=1) * normals[:, 0]
                      + ndi.map_coordinates(gy, coords, order=1) * normals[:, 1])
            cost = float(values.mean()) + .002 * (dx * dx + dy * dy)
            if best is None or cost < best[0]:
                best = (cost, dx, dy)
    _, dx, dy = best
    return [(x + dx, y + dy) for x, y in points], [dx, dy]


def adjacent_contour(rgb, kind):
    """Anchor each plaque to its own enclosed icon, in native coordinates.

    A shared translation can lock onto the surrounding meander instead of the
    plaque. The dark/white icon interior is enclosed by its gold frame and
    supplies a separate measured anchor for every scan and every direction.
    """
    x0, y0, x1, y1 = ICON_WINDOWS[kind]
    crop = rgb[y0:y1, x0:x1].astype(float)
    candidates = []
    for red, green, closing in [(20, 10, 3), (15, 8, 3), (20, 10, 5), (10, 6, 5)]:
        gold = (crop[:, :, 0] - crop[:, :, 2] > red) & (crop[:, :, 1] - crop[:, :, 2] > green)
        gold = ndi.binary_closing(gold, structure=np.ones((closing, closing)))
        labels, _ = ndi.label(~gold)
        for index, bounds in enumerate(ndi.find_objects(labels), 1):
            height = bounds[0].stop - bounds[0].start
            width = bounds[1].stop - bounds[1].start
            count = np.count_nonzero(labels[bounds] == index)
            if 34 <= width <= 59 and 34 <= height <= 60 and count > 900:
                candidates.append((count, (bounds[1].start + x0, bounds[0].start + y0,
                                           bounds[1].stop + x0, bounds[0].stop + y0)))
        if candidates:
            break
    if not candidates:
        raise ValueError(f'Cannot locate the enclosed {kind} faction icon')
    _, (left, top, right, bottom) = max(candidates)
    # Only the native frame thickness is added, with no surrounding fabric or
    # circle padding. Source frames are 3px outside their enclosed interiors.
    left, top, right, bottom = left - 3, top - 3, right + 3, bottom + 3
    height = bottom - top
    if kind in ('north', 'south'):
        colors = rgb.astype(float)
        gx = np.gradient(ndi.gaussian_filter(colors[:, :, 0] - colors[:, :, 2], .7), axis=1)
        guess = left - 1.53 * height
        scores = [(float(gx[top + 5:bottom - 5, x].mean()), x)
                  for x in range(round(guess) - 5, round(guess) + 6)]
        best = max(score for score, x in scores)
        # Prefer the outer gold edge to the parallel inner border.
        start = min(x for score, x in scores if score >= best - abs(best) * .35)
        return [(start, top), (right, top), (right, bottom), (start, bottom)]
    return pointed_contour(rgb, kind, left, top, right, bottom)


def pointed_contour(rgb, kind, left, top, right, bottom):
    """Measure both actual slants; their intersection supplies the real tip.

    The pointed portions lie outside the circle, so their exterior gold edge
    can be read directly. No nominal arrow angle or width ratio is used.
    """
    east = kind == 'east'
    x0, x1 = (right + 30, min(SIZE, right + 110)) if east else (max(0, left - 110), left - 30)
    crop = rgb[top:bottom + 1, x0:x1].astype(float)
    gold = (crop[:, :, 0] - crop[:, :, 2] > 25) & (crop[:, :, 1] - crop[:, :, 2] > 12)
    labels, _ = ndi.label(gold)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    component = labels == counts.argmax()
    rows, exterior = [], []
    for row in range(3, bottom - top - 2):
        xx = np.flatnonzero(component[row])
        if xx.size:
            rows.append(top + row)
            exterior.append(x0 + (xx.max() if east else xx.min()) + (.5 if east else -.5))
    rows, exterior = np.asarray(rows, dtype=float), np.asarray(exterior, dtype=float)
    midpoint = (top + bottom) / 2

    def line(selected):
        yy, xx = rows[selected], exterior[selected]
        if len(yy) < 10:
            raise ValueError(f'Cannot locate both {kind} diagonal edges')
        initial = np.polyfit(yy - midpoint, xx, 1)
        fit = least_squares(lambda values: values[0] * (yy - midpoint) + values[1] - xx,
                            initial, loss='soft_l1', f_scale=.6)
        return fit.x

    upper = line(rows < midpoint - 4)
    lower = line(rows > midpoint + 4)
    tip_y = midpoint + (lower[1] - upper[1]) / (upper[0] - lower[0])
    tip_x = upper[0] * (tip_y - midpoint) + upper[1]
    upper_x = upper[0] * (top - midpoint) + upper[1]
    lower_x = lower[0] * (bottom - midpoint) + lower[1]
    if not top + 15 < tip_y < bottom - 15:
        raise ValueError(f'Native {kind} edges do not form a valid pointed frame')
    if east:
        return [(left, top), (float(upper_x), top), (float(tip_x), float(tip_y)),
                (float(lower_x), bottom), (left, bottom)]
    return [(float(upper_x), top), (right, top), (right, bottom),
            (float(lower_x), bottom), (float(tip_x), float(tip_y))]


def arrow_contour(rgb, kind):
    """Extract the actual detached triangle; never translate a template."""
    left, top, right, bottom = (370, 34, 452, 66) if kind == 'north' else (370, 768, 457, 801)
    crop = rgb[top:bottom, left:right].astype(float)
    gold = (crop[:, :, 0] - crop[:, :, 2] > 35) & (crop[:, :, 1] - crop[:, :, 2] > 22)
    labels, _ = ndi.label(gold)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    yy, xx = np.where(labels == counts.argmax())
    if not 150 <= len(xx) <= 1000:
        raise ValueError(f'Unexpected {kind} arrow area: {len(xx)}')
    points = np.column_stack((xx + left, yy + top))
    return points[ConvexHull(points).vertices].tolist()


def cutout(rgb, number):
    scale = 4
    alpha_image = Image.new('L', (SIZE * scale, SIZE * scale))
    draw = ImageDraw.Draw(alpha_image)
    regions = []
    for name in slots(number):
        if name == 'number':
            points, offset = register_contour(rgb, PLAQUES[name])
        else:
            points, offset = adjacent_contour(rgb, name), None
        draw.polygon([(round(x * scale), round(y * scale)) for x, y in points], fill=255)
        if name in ARROWS:
            arrow = arrow_contour(rgb, name)
            draw.polygon([(round(x * scale), round(y * scale)) for x, y in arrow], fill=255)
        else:
            arrow = None
        regions.append({'kind': name, 'offset': offset, 'points': points,
                        'arrowPoints': arrow})
    alpha = np.asarray(alpha_image.resize((SIZE, SIZE), Image.Resampling.LANCZOS))
    pixels = np.dstack((rgb, alpha))
    pixels[alpha == 0] = 0
    image = Image.fromarray(pixels)
    box = image.getbbox()
    return image.crop(box), list(box), regions


def align_donor(reference, donor):
    """Register only shared scroll/ring pixels, excluding all printed labels."""
    yy, xx = np.mgrid[100:750:4, 75:750:4]
    valid = np.ones(xx.shape, bool)
    for points in PLAQUES.values():
        p = np.asarray(points)
        valid &= ~((xx >= p[:, 0].min() - 18) & (xx <= p[:, 0].max() + 18)
                   & (yy >= p[:, 1].min() - 18) & (yy <= p[:, 1].max() + 18))
    x, y = xx[valid], yy[valid]
    source = ndi.gaussian_filter(donor.mean(axis=2), 1.2)
    target = ndi.gaussian_filter(reference.mean(axis=2), 1.2)[y, x]

    def coordinates(parameters, x, y):
        dx, dy, angle, sx, sy = parameters
        a = np.deg2rad(angle)
        u, v = x - 412, y - 412
        return (412 + np.sin(a) * u + (1 + sy) * np.cos(a) * v + dy,
                412 + (1 + sx) * np.cos(a) * u - np.sin(a) * v + dx)

    def residual(parameters):
        return ndi.map_coordinates(source, coordinates(parameters, x, y), order=1) - target

    fit = least_squares(residual, np.zeros(5), diff_step=.003,
                        bounds=([-15, -15, -2, -.03, -.03], [15, 15, 2, .03, .03]), max_nfev=100)
    gy, gx = np.mgrid[:SIZE, :SIZE]
    coords = coordinates(fit.x, gx, gy)
    result = np.stack([ndi.map_coordinates(donor[:, :, c].astype(float), coords, order=3, mode='reflect')
                       for c in range(3)], axis=2)
    return np.clip(np.round(result), 0, 255).astype('uint8'), fit.x.tolist()


def shared_base(sources, masks):
    # 009 has clean east/south artwork; 079 has a clean north and 001 a clean
    # west. Restore those two locations from registered, unlabelled scans.
    base = sources[9].copy()
    restorations = []
    for kind, number in [('north', 79), ('west', 1)]:
        donor, affine = align_donor(sources[9], sources[number])
        entry = next(r for r in masks[9] if r['kind'] == kind)
        region = polygon(entry['points'])
        if entry['arrowPoints']:
            region |= polygon(entry['arrowPoints'])
        region = ndi.binary_dilation(region, iterations=6)
        weight = np.clip((7 - ndi.distance_transform_edt(~region)) / 6, 0, 1)[..., None]
        base = np.round(donor * weight + base * (1 - weight)).astype('uint8')
        restorations.append({'kind': kind, 'donor': number, 'registration': affine})
    # The primary plaque is outside the scroll. Its lower-left tip covers a
    # small piece of ring; restore the symmetric clean upper-left arc along
    # with the surrounding original black fabric. This changes only the
    # plaque footprint, never a full edge strip or the scroll illustration.
    main = next(r for r in masks[9] if r['kind'] == 'number')
    region = ndi.binary_dilation(polygon(main['points']), iterations=5)
    weight = np.clip((6 - ndi.distance_transform_edt(~region)) / 5, 0, 1)[..., None]
    yy, xx = np.mgrid[:SIZE, :SIZE]
    mirrored = sources[9][yy, np.clip(814 - xx, 0, SIZE - 1)]
    base = np.round(mirrored * weight + base * (1 - weight)).astype('uint8')
    restorations.append({'kind': 'number', 'donor': 9, 'mirrorCenterX': 407})
    return Image.fromarray(base), restorations


def save_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, compress_level=9)
    with Image.open(path) as check:
        if check.mode != image.mode or check.size != image.size or check.tobytes() != image.tobytes():
            raise ValueError(f'PNG pixel verification failed: {path}')


def generate(output):
    data = registry()
    brightness = data.get('pixelBrightness', 1)
    number_brightness = data.get('numberBrightness', brightness)
    brightness_report = ROOT / 'output/map-backs-brightness-20261023/installation.json'
    previous = json.loads(brightness_report.read_text(encoding='utf-8')) if brightness_report.exists() else None
    originals = Path(previous['originalBackup']) / 'map/images' if previous else ROOT / 'map/images'
    sources, masks, records, patches = {}, {}, [], {}
    for number in range(1, 82):
        key = f'c4-tile-{number:03d}-back'
        original = originals / (key + '.png')
        current = ROOT / 'map/images' / original.name
        with Image.open(original) as image:
            source = image.convert('RGB')
        if source.size != (SIZE, SIZE):
            raise ValueError(f'Unexpected native source dimensions: {original}')
        expected_current = adjust_pixels(source, brightness)
        if number_brightness == 1:
            expected_current.paste(source, (0, 0), c4_label_mask(source))
        with Image.open(current) as image:
            if image.convert('RGB').tobytes() != expected_current.tobytes():
                raise ValueError(f'Current source brightness/pixels changed: {current}')
        rgb = np.asarray(source)
        patch, box, regions = cutout(rgb, number)
        sources[number], masks[number], patches[number] = rgb, regions, (patch, box)
        target = Path('map/images/card-backs/numbers') / original.name
        raw_target = output / 'original-layers' / target
        runtime_target = output / target
        save_png(patch, raw_target)
        adjusted = adjust_pixels(patch, number_brightness)
        save_png(adjusted, runtime_target)
        # All opaque printed regions must remain bit-identical at the current
        # brightness. Native 825px coordinates are retained without resampling.
        a = np.asarray(adjusted)
        expected = np.asarray(adjust_pixels(source, number_brightness))[box[1]:box[3], box[0]:box[2]]
        if not np.array_equal(a[:, :, :3][a[:, :, 3] > 0], expected[a[:, :, 3] > 0]):
            raise ValueError(f'Cutout RGB differs from native source: {key}')
        records.append({'key': key, 'sourceSha256': sha(original), 'currentSha256': sha(current),
                        'regions': regions, 'bbox': box, 'opaquePixels': int((a[:, :, 3] == 255).sum()),
                        'target': target.as_posix(), 'originalLayerSha256': sha(raw_target),
                        'sha256': sha(runtime_target), 'sourceBytes': current.stat().st_size})
        if number % 18 == 0:
            print(f'Extracted and verified {number}/81 C4 backs', flush=True)
    base, restorations = shared_base(sources, masks)
    base_target = Path('map/images/card-backs/c4-base.png')
    save_png(base, output / 'original-layers' / base_target)
    save_png(adjust_pixels(base, brightness), output / base_target)
    data['version'] = f'{VERSION}-b{round(brightness * 100)}'
    data['bases']['c4'] = './images/card-backs/c4-base.png'
    for row in records:
        x0, y0, x1, y1 = row['bbox']
        data['backs'][row['key']] = {'cycle': 'c4', 'pieces': [{
            'src': './images/card-backs/numbers/' + row['key'] + '.png',
            'kind': 'markers', 'x': x0 / SIZE * 100, 'y': y0 / SIZE * 100,
            'width': (x1 - x0) / SIZE * 100, 'height': (y1 - y0) / SIZE * 100,
            'bbox': row['bbox']} ]}
    (output / 'registry.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {'version': data['version'], 'brightness': brightness, 'numberBrightness': number_brightness,
              'nativeSize': [SIZE, SIZE],
              'baseRestorations': restorations, 'backs': records,
              'cards': len(records), 'regions': sum(len(r['regions']) for r in records),
              'detachedArrows': sum(r['arrowPoints'] is not None for row in records for r in row['regions']),
              'sourceBytes': sum(r['sourceBytes'] for r in records),
              'layerBytes': sum(p.stat().st_size for p in (output / 'map').rglob('*.png')),
              'nativeCutoutRGBPreserved': True}
    (output / 'extraction.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    preview(output, data)
    print(json.dumps({k: report[k] for k in ('cards', 'regions', 'detachedArrows', 'sourceBytes', 'layerBytes')}), flush=True)
    return data, report


def preview(output, data):
    contact = Image.new('RGB', (9 * 220, 9 * 244), '#d6d9d2')
    draw = ImageDraw.Draw(contact)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    check = Image.new('RGBA', (SIZE, SIZE), '#666d76')
    cd = ImageDraw.Draw(check)
    for y in range(0, SIZE, 24):
        for x in range(0, SIZE, 24):
            if (x // 24 + y // 24) % 2:
                cd.rectangle((x, y, x + 23, y + 23), fill='#4c525b')
    detail = Image.new('RGB', (3 * SIZE, 2 * (SIZE + 32)), '#d6d9d2')
    dd = ImageDraw.Draw(detail)
    picks = [1, 9, 11, 41, 73, 81]
    for i in range(81):
        key = f'c4-tile-{i + 1:03d}-back'
        piece = data['backs'][key]['pieces'][0]
        with Image.open(output / 'map/images/card-backs/c4-base.png') as image:
            face = image.convert('RGBA')
        with Image.open(output / 'map' / piece['src'].removeprefix('./')) as patch:
            face.alpha_composite(patch, tuple(piece['bbox'][:2]))
            if i + 1 in picks:
                j = picks.index(i + 1)
                cut = check.copy()
                cut.alpha_composite(patch, tuple(piece['bbox'][:2]))
                cut.save(output / f'{key}-mask-preview.png')
                detail.paste(face.convert('RGB'), (j % 3 * SIZE, j // 3 * (SIZE + 32) + 32))
                dd.text((j % 3 * SIZE + 8, j // 3 * (SIZE + 32) + 5), key, fill='#202820', font=font)
        x, y = i % 9 * 220, i // 9 * 244
        contact.paste(face.convert('RGB').resize((215, 215), Image.Resampling.LANCZOS), (x, y + 23))
        draw.text((x + 5, y + 3), key, fill='#202820', font=font)
    contact.save(output / 'all-composed.jpg', quality=96, subsampling=0)
    detail.save(output / 'detail.jpg', quality=97, subsampling=0)


def install(output, data, report):
    current = registry()
    # Preserve unrelated updates made while extraction was running.
    current['version'] = data['version']
    current['bases']['c4'] = data['bases']['c4']
    current['backs'].update({key: entry for key, entry in data['backs'].items() if entry['cycle'] == 'c4'})
    if (current.get('pixelBrightness', 1) != report['brightness']
            or current.get('numberBrightness', report['brightness']) != report['numberBrightness']):
        raise ValueError('Brightness changed during extraction; regenerate before installing')
    for row in report['backs']:
        if sha(ROOT / 'map/images' / (row['key'] + '.png')) != row['currentSha256']:
            raise ValueError(f'Source changed during extraction: {row["key"]}')
    backup = ROOT / 'output/backups' / ('c4-backs-before-layers-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    for path in [ROOT / 'map/tile-back-data.js', *sorted((ROOT / 'map/images').glob('c4-tile-*-back.png')),
                 *sorted((ROOT / 'map/images/card-backs').rglob('c4-*.png'))]:
        saved = backup / path.relative_to(ROOT)
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, saved)
        if sha(saved) != sha(path):
            raise ValueError(f'Backup verification failed: {path}')
    for source in sorted((output / 'map').rglob('*.png')):
        target = ROOT / source.relative_to(output)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        if sha(source) != sha(target):
            raise ValueError(f'Installation hash mismatch: {target}')
    # Extend the existing brightness baseline with the new, unadjusted layers.
    # Keep previous contour baselines in this installation's verified backup;
    # future brightness adjustments use the newly registered native cutouts.
    brightness_report = ROOT / 'output/map-backs-brightness-20261023/installation.json'
    if brightness_report.exists():
        previous = json.loads(brightness_report.read_text(encoding='utf-8'))
        for original in sorted((output / 'original-layers/map').rglob('*.png')):
            relative = original.relative_to(output / 'original-layers')
            target = Path(previous['originalBackup']) / relative
            if target.exists() and sha(target) != sha(original):
                old = next((row for row in previous['files'] if row['file'] == relative.as_posix()), None)
                if old is None or sha(target) != old['originalSha256']:
                    raise ValueError(f'Brightness baseline changed outside its recorded history: {target}')
                saved = backup / 'brightness-originals' / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
                if sha(saved) != sha(target):
                    raise ValueError(f'Brightness baseline backup failed: {target}')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, target)
            record = {'file': relative.as_posix(), 'originalSha256': sha(original),
                      'sha256': sha(ROOT / relative)}
            with Image.open(original) as image:
                record.update(size=list(image.size), mode=image.mode)
            previous['files'] = [r for r in previous['files'] if r['file'] != relative.as_posix()] + [record]
        brightness_report.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'map/tile-back-data.js').write_text(PREFIX + json.dumps(current, ensure_ascii=False, indent=2) + ';\n',
                                               encoding='utf-8', newline='\n')
    (output / 'installation.json').write_text(json.dumps({'backup': str(backup), 'layers': 82,
        'version': current['version']}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Installed 82 C4 layers; verified original backup: {backup}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/c4-back-layers-20261023')
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    data, report = generate(args.output)
    if args.install:
        install(args.output, data, report)
