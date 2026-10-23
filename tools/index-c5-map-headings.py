"""Index existing C5 mask geometry for the map UI; image files are read only."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def bounds(alpha, box):
    left, top, right, bottom = box
    yy, xx = np.where(alpha[top:bottom, left:right] > 16)
    if not len(xx):
        raise ValueError(f'Missing C5 mask in {box}')
    return [int(xx.min() + left), int(yy.min() + top),
            int(xx.max() + left + 1), int(yy.max() + top + 1)]


def main():
    faces = {}
    for path in sorted((ROOT / 'map/images/hd1024/overlay').glob('c5-tile-*.png')):
        with Image.open(path) as image:
            assert image.size == (1024, 1024)
            alpha = np.asarray(image.getchannel('A'))
        left_header = path.stem in {'c5-tile-040-front', 'c5-tile-050-front'}
        header = bounds(alpha, (20, 20, 330, 165) if left_header else (700, 20, 1000, 165))
        assert 260 <= header[2] - header[0] <= 280, path.stem
        assert 95 <= header[3] - header[1] <= 120, path.stem
        faction = bounds(alpha, (850, 850, 1000, 1000))
        faces[path.stem] = {'header': header, 'faction': faction}
    assert len(faces) == 160
    lines = ['/* Geometry of the existing C5 masks; no artwork is duplicated. */',
             'window.ATO_C5_HEADING_DATA = {']
    lines.extend(f'  {json.dumps(key)}: {json.dumps(value, separators=(",", ":"))},'
                 for key, value in faces.items())
    lines.append('};\n')
    (ROOT / 'map/c5-heading-data.js').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    main()
