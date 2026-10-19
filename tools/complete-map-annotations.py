"""Extract audited annotations from original scans into existing transparent layers.

Requires Pillow, NumPy and SciPy. Default stages previews only; --apply installs
the reviewed additions with byte-verified backups. No generative redraw is used.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_erosion, gaussian_filter, map_coordinates
from scipy.optimize import differential_evolution

ROOT = Path(__file__).resolve().parents[1]
HD = ROOT / 'map/images/hd1024'
REGIONS = Path(__file__).with_name('map-annotation-regions.json')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def register(source, overlay):
    """Fit scan -> existing mask alignment using already extracted printed marks."""
    raw = np.asarray(source.convert('L'), dtype=float)
    gray = np.asarray(overlay.convert('RGB').convert('L'), dtype=float)
    yy, xx = np.where(binary_erosion(np.asarray(overlay.getchannel('A')) > 250, iterations=4))
    idx = np.random.default_rng(1).choice(len(xx), min(18000, len(xx)), replace=False)
    yy, xx = yy[idx], xx[idx]
    raw = gaussian_filter(raw, 1) - gaussian_filter(raw, 5)
    gray = gaussian_filter(gray, 1.3) - gaussian_filter(gray, 6)
    target = gray[yy, xx]
    target -= target.mean()
    target /= np.linalg.norm(target)

    def loss(p):
        left, top, sx, sy, xy, yx = p
        sample = map_coordinates(raw, [top + yy*sy + xx*yx, left + xx*sx + yy*xy], order=1)
        sample -= sample.mean()
        sample /= max(np.linalg.norm(sample), 1e-9)
        return 1 - np.dot(target, sample)

    h, w = raw.shape
    fit = differential_evolution(loss, [(-20, 20), (-20, 20), (w/1024*.96, w/1024*1.04),
                                        (h/1024*.96, h/1024*1.04), (-.025, .025), (-.025, .025)],
                                 seed=2, popsize=8, tol=.0001)
    assert 1-fit.fun > .94, f'Alignment requires review: {1-fit.fun}'
    left, top, sx, sy, xy, yx = fit.x.tolist()
    return [sx, xy, left, yx, sy, top], float(1-fit.fun)


def region_mask(size, regions):
    # Draw at 4x for a clean, antialiased cutout around the printed outer border.
    scale = 4
    mask = Image.new('L', (size[0]*scale, size[1]*scale))
    draw = ImageDraw.Draw(mask)
    for _, shape, bounds in regions:
        if shape == 'polygon':
            draw.polygon([(round(x*scale), round(y*scale)) for x, y in bounds], fill=255)
            continue
        l, t, r, b = bounds
        if shape == 'ribbon':
            points = [(l,t+4),(l+7,t+4),(l+7,t),(r-7,t),(r-7,t+4),(r,t+4),
                      (r-5,(t+b)/2),(r,b-3),(r-7,b-3),(r-7,b),(l+7,b),
                      (l+7,b-3),(l,b-3),(l+5,(t+b)/2)]
            draw.polygon([(round(x*scale), round(y*scale)) for x,y in points], fill=255)
        else:
            getattr(draw, shape)(tuple(round(v*scale) for v in bounds), fill=255)
    return mask.resize(size, Image.Resampling.LANCZOS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'output/reports/map-annotations-20261020')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    spec = json.loads(REGIONS.read_text(encoding='utf-8'))
    previous = json.loads((out/'annotation-report.json').read_text(encoding='utf-8')) if (out/'annotation-report.json').exists() else {}
    cached = {row['key']: row for row in previous.get('files', [])}
    all_before = {p.relative_to(HD).as_posix(): sha(p) for p in HD.rglob('*.png')}
    rows = []
    for key, regions in spec['tiles'].items():
        source_path, = args.source.glob(key+'.*')
        target = HD/'overlay'/(key+'.png')
        backup = out/'originals'/(key+'.png')
        old_path = backup if backup.exists() else target
        old_hash = sha(old_path)
        source_hash = sha(source_path)
        old = Image.open(old_path).convert('RGBA')
        source = Image.open(source_path).convert('RGBA')
        assert old.size == (1024, 1024)
        record = cached.get(key, {})
        if record.get('sourceSha256') == source_hash and record.get('beforeSha256') == old_hash:
            affine, correlation = record['affine'], record['alignmentCorrelation']
        else:
            affine, correlation = register(source, old)
        mask = region_mask(source.size, regions)
        source.putalpha(mask)
        additions = source.transform(old.size, Image.Transform.AFFINE, affine, Image.Resampling.BICUBIC)
        result = Image.alpha_composite(additions, old)
        old_pixels, new_pixels = np.asarray(old), np.asarray(result).copy()
        outside = np.asarray(additions.getchannel('A')) == 0
        # Keep even hidden RGB bytes in pre-existing transparent pixels intact.
        new_pixels[outside] = old_pixels[outside]
        result = Image.fromarray(new_pixels, 'RGBA')
        opaque = old_pixels[:,:,3] == 255
        assert np.array_equal(old_pixels[opaque], new_pixels[opaque]), key
        assert np.array_equal(old_pixels[outside], new_pixels[outside]), key
        staged = out/'completed'/(key+'.png')
        staged.parent.mkdir(exist_ok=True)
        result.save(staged, compress_level=9)
        # Include both whole-face overlays and a composed map for visual inspection.
        additions.save(out/(key+'-additions.png'))
        base = Image.open(HD/'base'/(key+'.png')).convert('RGBA').resize(old.size, Image.Resampling.LANCZOS)
        Image.alpha_composite(base, result).convert('RGB').save(out/(key+'-complete.jpg'), quality=94)
        row = dict(key=key, source=str(source_path.resolve()), sourceSha256=source_hash,
                   beforeSha256=old_hash, afterSha256=sha(staged), affine=affine,
                   alignmentCorrelation=correlation, regions=len(regions),
                   addedPixels=int(np.sum((new_pixels[:,:,3]>0)&(old_pixels[:,:,3]==0))))
        assert row['addedPixels'] > 100, key
        rows.append(row)
        print(key, f"{correlation:.4f}", row['addedPixels'], flush=True)
    # Stage every file successfully before installing any of them.
    if args.apply:
        for row in rows:
            key = row['key']
            target = HD/'overlay'/(key+'.png')
            assert sha(target) in (row['beforeSha256'], row['afterSha256'], cached.get(key, {}).get('afterSha256')), key
            backup = out/'originals'/target.name
            backup.parent.mkdir(exist_ok=True)
            if not backup.exists():
                backup.write_bytes(target.read_bytes())
            assert sha(backup) == row['beforeSha256'], key
            target.write_bytes((out/'completed'/target.name).read_bytes())
            assert sha(target) == row['afterSha256'], key
    changed = {f"overlay/{row['key']}.png" for row in rows} if args.apply else set()
    assert all(sha(HD/path) == digest for path,digest in all_before.items() if path not in changed)
    report = dict(version=spec['version'], applied=args.apply, reviewedFaces=spec['reviewedFaces'],
                  changedFaces=len(rows), addedRegions=sum(r['regions'] for r in rows),
                  unchangedOtherLayers=True, originalOpaquePixelsPreserved=True, files=rows)
    (out/'annotation-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='files'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
