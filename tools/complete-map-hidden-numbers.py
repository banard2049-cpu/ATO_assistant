"""Typeset audited hidden numbers directly into transparent map overlays.

Requires Pillow and NumPy. Numerals are drawn from a font with 4x
supersampling; no scan artwork is sampled. Default: generate previews and
verified baseline/current backups. --apply validates all targets and backups
before atomically replacing overlays. Existing baseline pixels are preserved.
"""
from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import tempfile

import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
HD = ROOT / 'map/images/hd1024'
SPEC = Path(__file__).with_name('map-hidden-number-regions.json')
FONT = Path('C:/Windows/Fonts/times.ttf')
OUTPUT = ROOT / 'output/reports/map-hidden-numbers-20261023'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def png_bytes(image):
    stream = BytesIO()
    image.save(stream, format='PNG', compress_level=9)
    return stream.getvalue()


def checkerboard(size=(1024, 1024)):
    board = Image.new('RGBA', size, (223, 227, 225, 255))
    draw = ImageDraw.Draw(board)
    for y in range(0, size[1], 24):
        for x in range(0, size[0], 24):
            if (x // 24 + y // 24) % 2:
                draw.rectangle((x, y, x + 23, y + 23), fill=(192, 198, 195, 255))
    return board


def render_numbers(numbers, font_path, size=(1024, 1024)):
    """Fit tight glyph ink to each audited box, then downsample 4x with AA."""
    scale, fringe = 4, 3
    result = Image.new('RGBA', size)
    for number in numbers:
        left, top, right, bottom = number['bounds']
        width, height = right - left, bottom - top
        font = ImageFont.truetype(str(font_path), max(64, height * scale * 2))
        bbox = font.getbbox(number['text'])
        mask = Image.new('L', (bbox[2] - bbox[0], bbox[3] - bbox[1]))
        ImageDraw.Draw(mask).text((-bbox[0], -bbox[1]), number['text'], font=font, fill=255)
        ink = mask.getbbox()
        require(ink is not None, f'Font produced no visible numerals: {number["text"]}')
        mask = mask.crop(ink).resize((width * scale, height * scale), Image.Resampling.LANCZOS)
        high = Image.new('L', ((width + 2 * fringe) * scale, (height + 2 * fringe) * scale))
        high.paste(mask, (fringe * scale, fringe * scale))
        angle = number.get('angle', 0)
        if angle:
            high = high.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        alpha = high.resize((round(high.width / scale), round(high.height / scale)), Image.Resampling.LANCZOS)
        pixels = np.zeros((alpha.height, alpha.width, 4), dtype=np.uint8)
        pixels[:, :, :3] = ImageColor.getrgb(number['color'])
        pixels[:, :, 3] = np.asarray(alpha)
        pixels[pixels[:, :, 3] == 0] = 0
        glyphs = Image.fromarray(pixels, 'RGBA')
        position = (round((left + right - glyphs.width) / 2), round((top + bottom - glyphs.height) / 2))
        require(position[0] >= 0 and position[1] >= 0
                and position[0] + glyphs.width <= size[0] and position[1] + glyphs.height <= size[1],
                'Rotated numerals extend beyond the overlay')
        result.alpha_composite(glyphs, position)
    return result


def merge_additions(original, additions):
    """Fill baseline alpha==0; preserve old pixels, including faint AA overlaps."""
    before, added = np.asarray(original), np.asarray(additions)
    require(before.shape == added.shape and before.shape[2] == 4, 'RGBA sizes differ')
    old_alpha, add_alpha = before[:, :, 3], added[:, :, 3]
    overlaps = (old_alpha > 0) & (add_alpha > 0)
    overlap_count = int(overlaps.sum())
    substantial = overlaps & (old_alpha > 16) & (add_alpha > 16)
    require(not np.any(substantial) and overlap_count <= 32,
            f'New numerals overlap an existing mask: {overlap_count} pixels, '
            f'{int(substantial.sum())} beyond faint antialias fringes')
    fill = (old_alpha == 0) & (add_alpha > 0)
    require(np.any(fill), 'Numerals add no visible pixels')
    after = before.copy()
    after[fill] = added[fill]
    require(np.array_equal(before[old_alpha > 0], after[old_alpha > 0]), 'Existing pixels changed')
    require(np.array_equal(before[add_alpha == 0], after[add_alpha == 0]), 'Pixels outside numerals changed')
    effective = added.copy()
    effective[~fill] = 0
    return Image.fromarray(after, 'RGBA'), Image.fromarray(effective, 'RGBA'), {
        'addedPixels': int(fill.sum()), 'protectedAntialiasOverlapPixels': overlap_count,
        'existingNontransparentPixelsPreserved': True, 'outsideNumbersRgbaPreserved': True,
    }


def validate_entry(key, entry):
    require(isinstance(key, str) and bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', key)),
            f'Invalid overlay key: {key!r}')
    hashes = [entry.get('overlaySha256'), *entry.get('replaceableOverlaySha256', [])]
    require(all(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) for value in hashes),
            f'Invalid overlay hash: {key}')
    numbers = entry.get('numbers')
    require(isinstance(numbers, list) and bool(numbers), f'No reviewed numbers: {key}')
    for number in numbers:
        require(isinstance(number.get('text'), str) and re.fullmatch('[0-9]+', number['text']),
                f'Number must be a digit string (preserves leading zeroes): {key}')
        bounds = number.get('bounds')
        require(isinstance(bounds, list) and len(bounds) == 4 and all(type(v) is int for v in bounds)
                and 0 <= bounds[0] < bounds[2] <= 1024 and 0 <= bounds[1] < bounds[3] <= 1024,
                f'Invalid numeral bounds: {key}')
        require(isinstance(number.get('color'), str) and re.fullmatch('#[0-9a-fA-F]{6}', number['color']),
                f'Invalid numeral color: {key}')
        angle = number.get('angle', 0)
        require(type(angle) in (int, float) and math.isfinite(angle) and -180 <= angle <= 180,
                f'Invalid numeral angle: {key}')


def backup_verified(source, destination, expected_hash):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        with destination.open('xb') as stream:
            stream.write(Path(source).read_bytes())
    require(sha(destination) == expected_hash, f'Backup hash changed: {destination}')


def write_previews(out, key, base, current, result, additions, numbers, font=FONT):
    additions.save(out / 'additions' / (key + '.png'), compress_level=9)
    additions.save(out / 'numbers' / (key + '.png'), compress_level=9)
    board = checkerboard()
    before = Image.alpha_composite(board, current)
    after = Image.alpha_composite(board, result)
    preview = Image.new('RGB', (2048, 1024))
    preview.paste(before.convert('RGB'), (0, 0))
    preview.paste(after.convert('RGB'), (1024, 0))
    preview.save(out / (key + '-before-after.jpg'), quality=95)
    complete_before = Image.alpha_composite(base, current)
    complete_after = Image.alpha_composite(base, result)
    complete_after.convert('RGB').save(out / (key + '-complete.jpg'), quality=95)
    for index, number in enumerate(numbers):
        left, top, right, bottom = render_numbers([number], font).getbbox() if number.get('angle') else number['bounds']
        box = (max(0, left - 16), max(0, top - 16), min(1024, right + 16), min(1024, bottom + 16))
        a, b = complete_before.crop(box).convert('RGB'), complete_after.crop(box).convert('RGB')
        detail = Image.new('RGB', (a.width * 2, a.height))
        detail.paste(a, (0, 0))
        detail.paste(b, (a.width, 0))
        detail.resize((detail.width * 4, detail.height * 4), Image.Resampling.NEAREST).save(out / f'{key}-detail-{index}.png')


def run(spec_path, out=OUTPUT, apply=False, hd=HD, font=FONT):
    spec_path, out, hd, font = (Path(p).resolve() for p in (spec_path, out, hd, font))
    require(not out.is_relative_to(hd) and not hd.is_relative_to(out), 'Output must be separate from installed map assets')
    require(font.is_file(), f'Font does not exist: {font}')
    font_hash = sha(font)
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    require(isinstance(spec.get('tiles'), dict) and bool(spec['tiles']), 'Spec has no audited tiles')
    all_before = {p.relative_to(hd).as_posix(): sha(p) for p in hd.rglob('*.png')}
    prepared = []
    # Validate and render every target in memory before writing any output.
    for key, entry in sorted(spec['tiles'].items()):
        validate_entry(key, entry)
        target = hd / 'overlay' / (key + '.png')
        baseline_backup = out / 'base-overlays' / target.name
        baseline_file = Path(entry.get('baselineFile', target))
        if not baseline_file.is_absolute():
            baseline_file = ROOT / baseline_file
        # The new verified cache makes reruns independent of the old cutout report.
        baseline_path = baseline_backup if baseline_backup.exists() else baseline_file
        require(baseline_path.is_file() and sha(baseline_path) == entry['overlaySha256'], f'Baseline overlay hash changed: {key}')
        require(target.is_file(), f'Installed overlay missing: {key}')
        baseline = Image.open(baseline_path).convert('RGBA')
        current = Image.open(target).convert('RGBA')
        require(baseline.size == current.size == (1024, 1024), f'Overlay is not 1024x1024: {key}')
        base_path = hd / 'base' / target.name
        require(base_path.is_file(), f'Map base missing: {key}')
        base = Image.open(base_path).convert('RGBA').resize((1024, 1024), Image.Resampling.LANCZOS)
        additions = render_numbers(entry['numbers'], font)
        result, effective, stats = merge_additions(baseline, additions)
        content = png_bytes(result)
        after_hash = hashlib.sha256(content).hexdigest()
        allowed_hashes = {entry['overlaySha256'], *entry.get('replaceableOverlaySha256', []), after_hash}
        current_hash = sha(target)
        require(current_hash in allowed_hashes, f'Installed overlay changed: {key}')
        current_backup = out / 'existing-overlays' / target.name
        if current_backup.exists():
            require(sha(current_backup) in allowed_hashes, f'Existing overlay backup hash changed: {key}')
        prepared.append(dict(key=key, entry=entry, target=target, baselinePath=baseline_path,
                             baseline=baseline, base=base, current=current, result=result, additions=effective,
                             content=content, afterHash=after_hash, currentHash=current_hash,
                             currentBackupHash=sha(current_backup) if current_backup.exists() else current_hash,
                             allowedHashes=allowed_hashes, stats=stats))
    for folder in ('completed', 'additions', 'numbers', 'base-overlays', 'existing-overlays'):
        (out / folder).mkdir(parents=True, exist_ok=True)
    records = []
    for item in prepared:
        key, entry, target = item['key'], item['entry'], item['target']
        baseline_backup = out / 'base-overlays' / target.name
        current_backup = out / 'existing-overlays' / target.name
        backup_verified(item['baselinePath'], baseline_backup, entry['overlaySha256'])
        backup_verified(target, current_backup, item['currentBackupHash'])
        stage = out / 'completed' / target.name
        stage.write_bytes(item['content'])
        require(sha(stage) == item['afterHash'], f'Staging hash changed: {key}')
        write_previews(out, key, item['base'], item['current'], item['result'], item['additions'], entry['numbers'], font)
        records.append(dict(key=key, baseline=str(item['baselinePath']), beforeSha256=entry['overlaySha256'],
                            installedBeforeSha256=item['currentHash'], replaceableOverlaySha256=entry.get('replaceableOverlaySha256', []),
                            afterSha256=item['afterHash'], numbers=entry['numbers'], regions=entry['numbers'],
                            baselineBackup=str(baseline_backup), baselineBackupSha256=sha(baseline_backup),
                            existingOverlayBackup=str(current_backup), existingOverlayBackupSha256=sha(current_backup),
                            **item['stats']))
    if apply:
        pending = []
        try:
            # Verify all backups and staged replacements before the first rename.
            for item in prepared:
                key, target = item['key'], item['target']
                require(sha(out / 'base-overlays' / target.name) == item['entry']['overlaySha256'], f'Baseline backup changed: {key}')
                require(sha(out / 'existing-overlays' / target.name) == item['currentBackupHash'], f'Existing overlay backup changed: {key}')
                require(sha(out / 'completed' / target.name) == item['afterHash'], f'Staging hash changed: {key}')
                with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.' + target.stem + '-hidden-', suffix='.pending', delete=False) as stream:
                    temporary = Path(stream.name)
                    pending.append((temporary, item))
                    stream.write(item['content'])
                    stream.flush()
                    os.fsync(stream.fileno())
                require(sha(temporary) == item['afterHash'], f'Staging hash changed: {key}')
            for _, item in pending:
                require(sha(item['target']) == item['currentHash'], f'Installed overlay changed: {item["key"]}')
            for temporary, item in pending:
                if item['currentHash'] != item['afterHash']:
                    os.replace(temporary, item['target'])
                require(sha(item['target']) == item['afterHash'], f'Installed hash mismatch: {item["key"]}')
        finally:
            for temporary, _ in pending:
                temporary.unlink(missing_ok=True)
    changed = {f'overlay/{r["key"]}.png' for r in records} if apply else set()
    require(all(sha(hd / path) == digest for path, digest in all_before.items() if path not in changed), 'An unrelated map asset changed')
    report = dict(version=spec.get('version', 1), rendering='typeset-font-4x', applied=apply,
                  spec=str(spec_path), specSha256=sha(spec_path), font=str(font), fontSha256=font_hash,
                  reviewedFaces=spec.get('reviewedFaces'), changedFaces=len(records),
                  actualChangedFaces=sum(item['currentHash'] != item['afterHash'] for item in prepared) if apply else 0,
                  addedRegions=sum(len(r['numbers']) for r in records), otherLayersUnchanged=True,
                  originalNontransparentPixelsPreserved=True, outsideNumbersRgbaPreserved=True,
                  originalBackupsVerified=True, files=records)
    (out / 'hidden-number-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', type=Path, default=SPEC)
    parser.add_argument('--font', type=Path, default=FONT)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    report = run(args.spec, args.output, apply=args.apply, font=args.font)
    for row in report['files']:
        print(row['key'], row['addedPixels'], flush=True)
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
