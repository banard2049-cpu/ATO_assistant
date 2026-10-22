"""Rebuild reviewed map-mask contours and align verified scan outliers.

This is pixel extraction, using the original scans and reviewed per-face affine
registrations; it never redraws artwork. Requires Pillow, NumPy and SciPy.
Default: stage PNGs, comparisons and a hash report. --apply verifies backups
before atomically installing the staged, combined transparent overlays.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, label

ROOT = Path(__file__).resolve().parents[1]
HD = ROOT / 'map/images/hd1024'
SPEC = Path(__file__).with_name('map-mask-repairs.json')


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def polygon_layer(source, points, affine):
    """Rasterize the reviewed *outer* ink border, then resample it once."""
    scale = 4
    mask = Image.new('L', (source.width * scale, source.height * scale))
    ImageDraw.Draw(mask).polygon([(round(x * scale), round(y * scale)) for x, y in points], fill=255)
    mask = mask.resize(source.size, Image.Resampling.LANCZOS)
    cutout = source.convert('RGBA')
    cutout.putalpha(mask)
    return cutout.transform((1024, 1024), Image.Transform.AFFINE, affine, Image.Resampling.BICUBIC)


def replace_contour(old, replacement):
    """Replace the old cut, including its wrong corners, rather than adding to it.

    Nearby direction triangles can lie inside the cleanup margin. Protect their
    components and antialiased fringes before clearing the old rectangular cut.
    """
    old_pixels = np.asarray(old)
    new_pixels = np.asarray(replacement)
    old_alpha = old_pixels[:, :, 3]
    new_alpha = new_pixels[:, :, 3]
    labs, count = label(old_alpha > 128)
    overlap = np.bincount(labs[new_alpha > 128], minlength=count + 1)
    overlap[0] = 0
    index = int(overlap.argmax())
    assert overlap[index] > 100, 'Replacement does not match an existing symbol'
    yy, xx = np.where((labs == index) | (new_alpha > 0))
    box = [max(0, int(xx.min()) - 4), max(0, int(yy.min()) - 4),
           min(1024, int(xx.max()) + 5), min(1024, int(yy.max()) + 5)]
    left, top, right, bottom = box
    other_symbols = (labs != 0) & (labs != index)
    protected = binary_dilation(other_symbols, iterations=4)
    assert not np.any((new_alpha > 128) & protected), 'Replacement would overlap another symbol'
    # An alpha box is not a matte: retaining the previous opaque pixels outside
    # the new contour would leave the old sea rectangles and filled-in notches.
    result = old_pixels.copy()
    cleanup = np.zeros(old_alpha.shape, dtype=bool)
    cleanup[top:bottom, left:right] = True
    cleanup &= ~protected
    result[cleanup] = new_pixels[cleanup]
    interior = (old_alpha == 255) & (new_alpha == 255)
    result[interior] = old_pixels[interior]
    assert np.array_equal(result[interior], old_pixels[interior])
    assert np.array_equal(result[protected], old_pixels[protected])
    outside = np.ones(old_alpha.shape, dtype=bool)
    outside[top:bottom, left:right] = False
    assert np.array_equal(result[outside], old_pixels[outside])
    return Image.fromarray(result), box


def checkerboard():
    board = Image.new('RGBA', (1024, 1024))
    draw = ImageDraw.Draw(board)
    for y in range(0, 1024, 32):
        for x in range(0, 1024, 32):
            draw.rectangle((x, y, x + 31, y + 31),
                           fill='#565e69' if (x // 32 + y // 32) % 2 else '#434a54')
    return board


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Directory with original c*-tile-* scans')
    parser.add_argument('--output', type=Path, default=ROOT / 'output/reports/map-mask-audit-20261020/repair')
    parser.add_argument('--spec', type=Path, default=SPEC)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text(encoding='utf-8'))
    out = args.output.resolve()
    (out / 'completed').mkdir(parents=True, exist_ok=True)
    previous_path = out / 'repair-report.json'
    previous = json.loads(previous_path.read_text(encoding='utf-8')) if previous_path.exists() else {}
    previous_hashes = {r['key']: r['afterSha256'] for r in previous.get('files', [])}
    all_before = {p.relative_to(HD).as_posix(): sha(p) for p in HD.rglob('*.png')}
    records = []
    for key, entry in sorted(spec['tiles'].items()):
        target = HD / 'overlay' / (key + '.png')
        backup = out / 'originals' / target.name
        original_path = backup if backup.exists() else target
        assert sha(original_path) == entry['overlaySha256'], f'Original overlay changed: {key}'
        assert sha(target) in (entry['overlaySha256'], previous_hashes.get(key)), f'Installed overlay changed: {key}'
        original = Image.open(original_path).convert('RGBA')
        assert original.size == (1024, 1024), key
        result = original.copy()
        cleanup_boxes = []
        polygons = entry.get('polygons', [])
        if polygons:
            source_path = args.source / entry['sourceFile']
            assert sha(source_path) == entry['sourceSha256'], f'Scan changed: {key}'
            source = Image.open(source_path).convert('RGB')
            for region in polygons:
                replacement = polygon_layer(source, region['points'], entry['overlayToSourceAffine'])
                result, bounds = replace_contour(result, replacement)
                cleanup_boxes.append(dict(label=region['label'], bounds=bounds))
        if entry.get('correctionAffine'):
            # PIL resamples RGBA through premultiplied alpha, avoiding dark halos.
            result = result.transform(original.size, Image.Transform.AFFINE,
                                      entry['correctionAffine'], Image.Resampling.BICUBIC)
        stage = out / 'completed' / target.name
        result.save(stage, compress_level=9)
        before, after = np.asarray(original), np.asarray(result)
        assert np.any(before != after), f'No correction: {key}'
        if not entry.get('correctionAffine'):
            outside = np.ones((1024, 1024), dtype=bool)
            for region in cleanup_boxes:
                left, top, right, bottom = region['bounds']
                outside[top:bottom, left:right] = False
            assert np.array_equal(before[outside], after[outside]), key
        row = dict(key=key, beforeSha256=entry['overlaySha256'], afterSha256=sha(stage),
                   contourRegions=len(polygons), correctionAffine=entry.get('correctionAffine'),
                   cleanupRegions=cleanup_boxes, changedPixels=int(np.sum(np.any(before != after, axis=2))),
                   removedOpaquePixels=int(np.sum((before[:, :, 3] > 128) & (after[:, :, 3] <= 128))),
                   addedOpaquePixels=int(np.sum((before[:, :, 3] <= 128) & (after[:, :, 3] > 128))))
        records.append(row)
        base = Image.open(HD / 'base' / target.name).convert('RGBA').resize((1024, 1024), Image.Resampling.LANCZOS)
        Image.alpha_composite(base, result).convert('RGB').save(out / (key + '-complete.jpg'), quality=94)
        board = checkerboard()
        preview = Image.new('RGB', (2048, 1024))
        preview.paste(Image.alpha_composite(board, original).convert('RGB'), (0, 0))
        preview.paste(Image.alpha_composite(board, result).convert('RGB'), (1024, 0))
        preview.save(out / (key + '-before-after.jpg'), quality=95)
        for i, region in enumerate(cleanup_boxes):
            left, top, right, bottom = region['bounds']
            box = (max(0, left - 5), max(0, top - 5), min(1024, right + 5), min(1024, bottom + 5))
            a = Image.alpha_composite(board, original).crop(box)
            b = Image.alpha_composite(board, result).crop(box)
            detail = Image.new('RGB', (a.width * 2, a.height))
            detail.paste(a, (0, 0)); detail.paste(b, (a.width, 0))
            detail.resize((detail.width * 3, detail.height * 3)).save(out / f'{key}-detail-{i}.png')
        print(key, row['changedPixels'], flush=True)
    # Complete and verify all staging before changing any installed asset.
    if args.apply:
        for row in records:
            name = row['key'] + '.png'
            target = HD / 'overlay' / name
            backup = out / 'originals' / name
            backup.parent.mkdir(exist_ok=True)
            if not backup.exists():
                backup.write_bytes(target.read_bytes())
            assert sha(backup) == row['beforeSha256'], row['key']
        for row in records:
            name = row['key'] + '.png'
            target = HD / 'overlay' / name
            assert sha(target) in (row['beforeSha256'], row['afterSha256']), row['key']
            temporary = target.with_suffix('.png.pending')
            temporary.write_bytes((out / 'completed' / name).read_bytes())
            assert sha(temporary) == row['afterSha256']
            os.replace(temporary, target)
    changed = {f"overlay/{r['key']}.png" for r in records} if args.apply else set()
    assert all(sha(HD / path) == digest for path, digest in all_before.items() if path not in changed)
    report = dict(version=spec['version'], applied=args.apply, reviewedFaces=spec['reviewedFaces'],
                  changedFaces=len(records), contourRegions=sum(r['contourRegions'] for r in records),
                  geometricallyAlignedFaces=sum(bool(r['correctionAffine']) for r in records),
                  otherLayersUnchanged=True, newWholeSymbolOmissions=[], files=records)
    previous_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
