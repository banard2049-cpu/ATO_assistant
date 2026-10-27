"""Source-preserving route-marker vector experiments. No runtime writes.

Unlike the native back-label builder, this experiment follows the printed
colour regions. That retains unusual factions, locks, Greek suffixes and
face-specific routes without inventing content from incomplete neighbours.
"""
from __future__ import annotations

from pathlib import Path
import json
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image
from scipy.cluster.vq import kmeans2
from scipy.ndimage import gaussian_filter, label, binary_dilation
from skimage.measure import find_contours, approximate_polygon

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/map-link-vector-review-20261025'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)


def svg(body, width=1024, height=1024, view=None):
    return (f'<svg xmlns="{NS}" width="{width}" height="{height}" '
            f'viewBox="{view or f"0 0 {width} {height}"}">{body}</svg>\n')


def contour(binary, x=0, y=0, tolerance=.30, min_area=.7, smooth=0):
    """Closed subpixel polygons; even-odd fill retains islands and counters."""
    paths = []
    field = np.pad(binary.astype(float), 1)
    if smooth:
        field = gaussian_filter(field, smooth)
    for ring in find_contours(field, .5):
        if len(ring) < 4:
            continue
        xx, yy = ring[:, 1], ring[:, 0]
        area = abs(float(np.dot(xx, np.roll(yy, 1))-np.dot(yy, np.roll(xx, 1)))) / 2
        if area < min_area:
            continue
        ring = approximate_polygon(ring, tolerance)
        if len(ring) < 4:
            continue
        points = [(float(px)-.5+x, float(py)-.5+y) for py, px in ring[:-1]]
        paths.append('M'+'L'.join(f'{px:.2f},{py:.2f}' for px, py in points)+'Z')
    return ''.join(paths)


def palette(rgb, mask, count=5):
    """Deterministic farthest-point seeds followed by weighted colour fitting."""
    pixels = np.round(rgb[mask]).astype(np.uint8)
    unique, frequency = np.unique(pixels, axis=0, return_counts=True)
    first = unique[int(frequency.argmax())].astype(float)
    centers = [first]
    # Farthest seeds must occur more than once: isolated scan specks are not ink.
    candidates = unique[frequency >= max(2, len(pixels)//10000)].astype(float)
    for _ in range(count-1):
        distances = np.min(((candidates[:, None]-np.asarray(centers))**2).sum(2), axis=1)
        centers.append(candidates[int(distances.argmax())])
    # At most about 12,000 samples per panel, deterministically including bright ink.
    sample = pixels[::max(1, len(pixels)//12000)].astype(float)
    fitted, _ = kmeans2(sample, np.asarray(centers), iter=18, minit='matrix', missing='raise')
    return fitted


def trace_piece(rgba, labels, part, kind, direction, ident):
    """Return a true path group and its source/core masks, in full tile coordinates."""
    l, t, r, b = part['bbox']
    l, t, r, b = max(0, l-2), max(0, t-2), min(1024, r+2), min(1024, b+2)
    tile = rgba[t:b, l:r]
    core = labels[t:b, l:r] == part['componentLabel']
    rgb = gaussian_filter(tile[:, :, :3].astype(float), sigma=(.42, .42, 0))
    # Include opaque pixels only when fitting colours; transparent RGB is arbitrary.
    centers = palette(rgb, core & (tile[:, :, 3] > 230), 5 if kind == 'panel' else 4)
    # AA colours are transitions, not additional ink layers. Keeping them as
    # separate path regions makes tiny seams between adjacent shapes. Collapse
    # to the actual dark / field / light inks before tracing their outlines.
    luminance = centers @ np.asarray([.299,.587,.114])
    light_order = np.argsort(luminance)
    chosen = list(range(len(centers)))
    # The second lightest cluster is usually the pale AA fringe. Merge it with
    # white, retaining genuine red / blue compartment colours even when a wide
    # multi-icon panel has more dark background than number-field pixels.
    if len(centers)>3 and luminance[light_order[-2]]>165 and luminance[light_order[-1]]-luminance[light_order[-2]]<70:
        chosen.remove(int(light_order[-2]))
    centers = centers[chosen]
    assignments = np.argmin(((rgb[:, :, None]-centers)**2).sum(3), axis=2)
    counts = np.bincount(assignments[core], minlength=len(centers))
    dominant = int(counts.argmax())
    shapes = []
    silhouette = contour(core, l, t, tolerance=.35, min_area=0)
    def fill(index):
        return '#'+''.join(f'{int(round(c)):02x}' for c in np.clip(centers[index], 0, 255))
    shapes.append(f'<path data-layer="silhouette" fill="{fill(dominant)}" fill-rule="evenodd" d="{silhouette}"/>')
    for index in range(len(centers)):
        if index == dominant:
            continue
        field = (assignments == index) & core
        data = contour(field, l, t, tolerance=.3, min_area=.65, smooth=.42)
        if data:
            shapes.append(f'<path data-layer="colour-{index}" fill="{fill(index)}" fill-rule="evenodd" d="{data}"/>')
    attribute = {'panel':'data-panel', 'arrow':'data-arrow', 'extra':'data-extra'}[kind]
    group = (f'<g {attribute}="{ident}" data-direction="{direction}" '
             f'data-component="{part["componentLabel"]}" data-method="source-colour-contours">'
             + ''.join(shapes)+'</g>')
    result = dict(id=ident, kind=kind, direction=direction, bbox=part['bbox'],
                  componentLabel=part['componentLabel'], paths=len(shapes),
                  sourcePixels=int(core.sum()), palette=[fill(i) for i in range(len(centers))])
    return group, result


def selected_parts(row):
    for panel in row['panels']:
        yield panel, 'panel', panel['direction'], panel['id']
        for i, extra in enumerate(panel['attachedExtras'], 1):
            yield extra, 'extra', panel['direction'], panel['id']+f'-extra-{i}'
    for arrow in row['arrows']:
        yield arrow, 'arrow', arrow['direction'], arrow['id']


def build_face(row):
    rgba = np.asarray(Image.open(ROOT / row['source']).convert('RGBA'))
    labels, _ = label(rgba[:, :, 3] > 100)
    groups, pieces = [], []
    selected = np.zeros((1024, 1024), dtype=bool)
    for part, kind, direction, ident in selected_parts(row):
        body, record = trace_piece(rgba, labels, part, kind, direction, ident)
        groups.append(body)
        pieces.append(record)
        selected |= labels == part['componentLabel']
    # Clear old antialias fringes without touching unrelated opaque artwork.
    protected = (rgba[:, :, 3] > 100) & ~selected
    cleanup = binary_dilation(selected, iterations=3) & ~binary_dilation(protected, iterations=1)
    cuts = contour(cleanup, tolerance=0, min_area=0)
    pure = svg(''.join(groups))
    key = row['key']
    mask = ('<defs><mask id="keep-links" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
            '<rect width="1024" height="1024" fill="white"/>'
            f'<path fill="black" fill-rule="evenodd" d="{cuts}"/></mask></defs>')
    # SVG loaded as an <img> cannot fetch another local SVG. Inline the existing
    # XML body (including its unchanged embedded PNG), not a fragile external image.
    current = ROOT/'map/images/hd1024/overlay'/f'{key}-corners.svg'
    source_svg = current.read_text(encoding='utf-8')
    source_body = source_svg[source_svg.index('>')+1:source_svg.rindex('</svg>')]
    composite = svg(mask+f'<g data-source="current-overlay" mask="url(#keep-links)">{source_body}</g>'+''.join(groups))
    return pure, composite, pieces, cleanup


def read_inventory():
    return json.loads((OUT/'inventory.json').read_text(encoding='utf-8'))
