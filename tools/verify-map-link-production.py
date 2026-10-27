"""Independently measure installed-link source geometry, without runtime writes.

C4 checks use visible path extrema and all SVG ancestor transforms. Reported
glyph boxes are never used to establish those extrema. Lock placement is checked
against the full logo box and its associated circle center.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/map-link-vector-source'
OUT = ROOT / 'output/map-link-vector-install-20261025/geometry-check.json'
NUMBER = r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?'


def numbers(value):
    return [float(number) for number in re.findall(NUMBER, value or '')]


def transform(value):
    result = Transform()
    remaining = re.sub(r'(matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)', '', value or '')
    assert not remaining.strip(' ,\t\r\n'), value
    for operation, arguments in re.findall(r'(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)', value or ''):
        args = numbers(arguments)
        if operation == 'matrix':
            assert len(args) == 6, value
            local = Transform(*args)
        elif operation == 'translate':
            assert len(args) in (1, 2), value
            local = Transform().translate(args[0], args[1] if len(args) == 2 else 0)
        elif operation == 'scale':
            assert len(args) in (1, 2), value
            local = Transform().scale(args[0], args[1] if len(args) == 2 else args[0])
        elif operation == 'rotate':
            assert len(args) in (1, 3), value
            cx, cy = args[1:] if len(args) == 3 else (0, 0)
            local = Transform().translate(cx, cy).rotate(math.radians(args[0])).translate(-cx, -cy)
        else:
            assert len(args) == 1, value
            tangent = math.tan(math.radians(args[0]))
            local = Transform(1, 0, tangent, 1, 0, 0) if operation == 'skewX' else Transform(1, tangent, 0, 1, 0, 0)
        result = result.transform(local)
    return result


def viewport(node):
    if node.tag.rsplit('}', 1)[-1] != 'svg' or not node.get('viewBox'):
        return Transform()
    x, y = float(node.get('x', '0')), float(node.get('y', '0'))
    left, top, width, height = numbers(node.get('viewBox'))
    sx, sy = float(node.get('width', width)) / width, float(node.get('height', height)) / height
    preserve = node.get('preserveAspectRatio', 'xMidYMid meet').split()
    if preserve[0] != 'none':
        scale = max(sx, sy) if preserve[-1] == 'slice' else min(sx, sy)
        dx, dy = (sx - scale) * width, (sy - scale) * height
        alignment = preserve[0]
        x += dx / 2 if 'xMid' in alignment else dx if 'xMax' in alignment else 0
        y += dy / 2 if 'YMid' in alignment else dy if 'YMax' in alignment else 0
        sx = sy = scale
    return Transform(sx, 0, 0, sy, x - left * sx, y - top * sy)


def world_transform(node, parent):
    return parent.transform(transform(node.get('transform'))).transform(viewport(node))


def actual_bounds(node, parent):
    pen = BoundsPen(None)
    count = 0

    def visit(current, ancestor):
        nonlocal count
        matrix = world_transform(current, ancestor)
        kind = current.tag.rsplit('}', 1)[-1]
        if kind == 'path' and current.get('d'):
            # C4 faction sources use filled paths, so their true optical extent
            # follows curve extrema rather than approximate control points.
            assert current.get('stroke') in (None, 'none'), 'Unexpected stroked C4 glyph'
            parse_path(current.get('d'), TransformPen(pen, matrix))
            count += 1
        elif kind in ('polygon', 'polyline', 'circle', 'ellipse', 'rect', 'line', 'image', 'text', 'use'):
            raise AssertionError(f'Unexpected C4 glyph element: {kind}')
        for child in current:
            visit(child, matrix)

    visit(node, parent)
    assert count and pen.bounds is not None, 'C4 glyph has no visible paths'
    return pen.bounds, count


def verify():
    manifest = json.loads((SOURCE / 'production.json').read_text(encoding='utf-8'))
    c4, locks, errors = [], [], []
    for key, row in manifest['faces'].items():
        file = SOURCE / row['vector']
        raw = file.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == row['sha256'], key
        root = ET.fromstring(raw)

        def visit(node, parent):
            if node.get('data-faction-placement') == 'centered':
                assert key.startswith('c4-'), key
                bounds, paths = actual_bounds(node, parent)
                l, t, r, b = bounds
                center = ((l + r) / 2, (t + b) / 2)
                target = parent.transformPoint(numbers(node.get('data-field-center')))
                center_error = max(abs(a - z) for a, z in zip(center, target))
                dimension = max(r - l, b - t)
                size_error = abs(dimension - 46)
                check = {'key': key, 'pathBounds': list(bounds), 'pathsMeasured': paths,
                         'actualCenter': list(center), 'fieldCenter': list(target),
                         'maximumDimension': dimension, 'centerError': center_error, 'sizeError': size_error}
                c4.append(check)
                if center_error > .02 or size_error > .02:
                    errors.append({'kind': 'c4-faction', **check})
            if node.get('data-marker') == 'restricted':
                bbox = numbers(node.get('data-centered-ink-bbox'))
                center = numbers(node.get('data-disc-center'))
                assert len(bbox) == 4 and len(center) == 2, (key, node.attrib)
                actual = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
                error = max(abs(a - z) for a, z in zip(actual, center))
                check = {'key': key, 'centeredInkBBox': bbox, 'discCenter': center, 'centerError': error}
                locks.append(check)
                if error > .02:
                    errors.append({'kind': 'lock', **check})
            matrix = world_transform(node, parent)
            for child in node:
                visit(child, matrix)

        visit(root, Transform())
    assert len(manifest['faces']) == 511, len(manifest['faces'])
    assert len(c4) >= 262, len(c4)
    assert locks, 'No locks checked'
    result = {'status': 'passed' if not errors else 'failed', 'version': manifest['version'],
              'faces': len(manifest['faces']), 'c4FactionsMeasured': len(c4), 'locksChecked': len(locks),
              'maximumC4CenterError': max(row['centerError'] for row in c4),
              'maximumC4SizeError': max(row['sizeError'] for row in c4),
              'maximumLockCenterError': max(row['centerError'] for row in locks),
              'tolerancePixels': .02, 'c4Measurement': 'True filled-path curve extrema with all SVG transforms',
              'errors': errors, 'c4': c4, 'locks': locks, 'runtimeFilesModified': 0}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({name: value for name, value in result.items() if name not in ('c4', 'locks', 'errors')}, ensure_ascii=False))
    assert not errors, f'{len(errors)} geometry errors; see {OUT}'


if __name__ == '__main__':
    verify()
