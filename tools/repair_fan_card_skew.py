"""Deskew explicitly reviewed fan scans, preserving verified originals.

Default stages corrected images for inspection; --apply installs them. Angles
are measured from printed horizontal rules, in image coordinates (y down).
Only listed source hashes may be processed. No official directory is written.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def deskew(image, angle):
    # Rotate once, then take the largest safe central rectangle. Cropping the
    # interpolation wedges prevents the correction from adding new white edges.
    assert math.isfinite(angle) and 0 < abs(angle) <= 1.5
    radians = abs(math.radians(angle))
    w, h = image.size
    c, s = math.cos(radians), math.sin(radians)
    width = math.floor((w * c - h * s) / (c * c - s * s)) - 2
    height = math.floor((h * c - w * s) / (c * c - s * s)) - 2
    rotated = image.rotate(angle, Image.Resampling.BICUBIC)
    x, y = (w - width) // 2, (h - height) // 2
    return rotated.crop((x, y, x + width, y + height))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', type=Path, default=ROOT / 'tools/fan-card-skew-repairs.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'output/fan-card-skew-repair')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    previous = args.output / 'report.json'
    old = json.loads(previous.read_text()) if previous.exists() else []
    installed = {r['path']: r['afterSha256'] for r in old}
    report = []
    for entry in json.loads(args.spec.read_text())['images']:
        target = entry['path']
        assert target.startswith('aibp/ps/') and '..' not in Path(target).parts
        source = ROOT / target
        backup = args.output / 'originals' / target
        original = backup if backup.exists() else source
        assert sha(original) == entry['sha256'], f'Source revision changed: {target}'
        assert sha(source) in (entry['sha256'], installed.get(target)), f'Installed scan changed: {target}'
        with Image.open(original) as opened:
            corrected = deskew(ImageOps.exif_transpose(opened).convert('RGB'), entry['angle'])
        staged = args.output / 'completed' / target
        staged.parent.mkdir(parents=True, exist_ok=True)
        corrected.save(staged, quality=97, subsampling=0)
        if args.apply:
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copy2(source, backup)
            assert sha(backup) == entry['sha256']
            temporary = source.with_name(source.name + '.partial')
            shutil.copyfile(staged, temporary)
            temporary.replace(source)
        report.append({**entry, 'size': list(corrected.size), 'afterSha256': sha(staged)})
    previous.parent.mkdir(parents=True, exist_ok=True)
    previous.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'reviewed': len(report), 'applied': args.apply}))


if __name__ == '__main__':
    main()
