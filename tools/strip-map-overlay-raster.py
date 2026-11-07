"""Remove the fully masked legacy PNG from installed map overlay SVGs.

Usage:
    python tools/strip-map-overlay-raster.py            # rewrite 511 overlays
    python tools/strip-map-overlay-raster.py --check    # report only
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from map_overlay_cleanup import strip_hidden_raster

ROOT = Path(__file__).resolve().parents[1]
HD = ROOT / 'map/images/hd1024/overlay'


def main(argv=None) -> dict:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=HD)
    parser.add_argument('--check', action='store_true', help='只统计，不写文件')
    args = parser.parse_args(argv)

    files = sorted(args.directory.glob('*-corners.svg'))
    changed = 0
    removed = 0
    unchanged = 0
    for path in files:
        text = path.read_text(encoding='utf-8')
        cleaned, saved = strip_hidden_raster(text)
        if not saved:
            unchanged += 1
            continue
        if not args.check:
            temporary = path.with_suffix('.svg.cleaning')
            temporary.write_text(cleaned, encoding='utf-8')
            temporary.replace(path)
        changed += 1
        removed += saved
    result = {
        'status': 'checked' if args.check else 'cleaned',
        'directory': str(args.directory.relative_to(ROOT)).replace('\\', '/'),
        'files': len(files),
        'changed': changed,
        'unchanged': unchanged,
        'removedBytes': removed,
    }
    print(json.dumps(result, ensure_ascii=False))
    return result


if __name__ == '__main__':
    main()
