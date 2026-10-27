"""Independently audit preview-only route vectors and protect runtime assets.

This command only reads source/runtime files and writes its QA report beside the
preview. It never invokes a production map builder or modifies a registry.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image
from scipy.ndimage import find_objects, label


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / 'output/map-link-vector-review-20261025'
NS = 'http://www.w3.org/2000/svg'
FORBIDDEN_TAGS = {'image', 'text', 'use', 'foreignObject', 'script', 'style',
                  'iframe', 'audio', 'video', 'font', 'font-face'}


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def runtime_hashes(before_file):
    before = json.loads(before_file.read_text(encoding='utf-8-sig'))
    require(isinstance(before, dict) and len(before) >= 511,
            'Missing comprehensive runtime hash snapshot')
    changed = [name for name, expected in before.items()
               if not (ROOT / name).is_file() or sha(ROOT / name) != expected]
    require(not changed, f'Protected runtime/source files changed: {changed[:8]}')
    require(any(name.startswith('map/images/hd1024/overlay/') for name in before),
            'Hash snapshot does not cover installed vector overlays')
    for name in ('map/map-data.js', 'map/tile-artwork.js',
                 'map/tile-artwork-data.js', 'map/tile-back-data.js',
                 'map/c5-heading-data.js'):
        require(name in before, f'Runtime hash snapshot is missing {name}')
    return len(before)


def pure_vector(path):
    text = path.read_text(encoding='utf-8')
    require(not re.search(r'NaN|Infinity|data:image|@font-face|<!ENTITY', text, re.I),
            f'Invalid or bitmap-bearing vector: {path.name}')
    root = ET.fromstring(text)
    require(root.tag == f'{{{NS}}}svg', f'Not an SVG: {path.name}')
    require(root.get('viewBox') == '0 0 1024 1024', f'Wrong coordinate system: {path.name}')
    for element in root.iter():
        tag = element.tag.rsplit('}', 1)[-1]
        require(tag not in FORBIDDEN_TAGS, f'{path.name}: forbidden {tag}')
        require(not any(attr.rsplit('}', 1)[-1] == 'href' for attr in element.attrib),
                f'{path.name}: vector depends on an external reference')
        for name, value in element.attrib.items():
            require(not name.lower().startswith('on'), f'{path.name}: event handler')
            require(not re.search(r'https?://|file:|javascript:', value, re.I),
                    f'{path.name}: external content')
    return root


def audit_group(root, item, attribute, key):
    groups = [e for e in root.iter() if e.get(attribute) == item['id']]
    require(len(groups) == 1, f'{key}: {attribute} {item["id"]} count {len(groups)}')
    group = groups[0]
    require(group.get('data-direction') == item['direction'],
            f'{key}: wrong direction for {item["id"]}')
    require(group.get('data-component') == str(item['componentLabel']),
            f'{key}: source component mismatch for {item["id"]}')
    require(any(e.tag.rsplit('}', 1)[-1] in ('path', 'polygon', 'rect', 'circle')
                for e in group.iter()), f'{key}: empty {item["id"]}')


def element_signature(element):
    """Ignore formatting whitespace; retain every SVG tag/attribute/content."""
    return (element.tag, tuple(sorted(element.attrib.items())),
            (element.text or '').strip(),
            tuple(element_signature(child) for child in element))


def verify(output):
    inventory = json.loads((output / 'inventory.json').read_text(encoding='utf-8-sig'))
    faces = inventory['faces']
    keys = [face['key'] for face in faces]
    require(len(keys) == len(set(keys)) == 511, 'Inventory must contain 511 unique faces')
    require(sum('-alt-' in key for key in keys) == 7, 'Missing C1 alternate fronts')
    require(sum(key.startswith('c5-') and key.endswith('-front') for key in keys) == 80,
            'Missing C5 A faces')
    require(sum(key.startswith('c5-') and key.endswith('-back') for key in keys) == 80,
            'Missing C5 B faces')
    require({p.stem for p in (output / 'links').glob('*.svg')} == set(keys),
            'Pure link-vector file inventory differs from the 511 source faces')
    require({p.stem for p in (output / 'overlays').glob('*.svg')} == set(keys),
            'Preview overlay file inventory differs from the 511 source faces')
    protected = runtime_hashes(output / 'before-source-hashes.json')
    counts = Counter()
    directions = Counter()
    cycles = Counter()
    source_components = 0
    overlays = 0
    for face in faces:
        key = face['key']
        source = ROOT / face['source']
        require(sha(source) == face['sourceSha256'], f'{key}: source pixels changed')
        rgba = np.asarray(Image.open(source).convert('RGBA'))
        require(rgba.shape == (1024, 1024, 4), f'{key}: source size')
        labels, _ = label(rgba[:, :, 3] > 100)
        slices = find_objects(labels)
        root = pure_vector(output / 'links' / f'{key}.svg')
        all_items = [('data-panel', panel) for panel in face['panels']]
        all_items += [('data-arrow', arrow) for arrow in face['arrows']]
        all_items += [('data-extra', {**extra,
                                     'id': f'{panel["id"]}-extra-{index + 1}',
                                     'direction': panel['direction']})
                      for panel in face['panels']
                      for index, extra in enumerate(panel.get('attachedExtras', []))]
        expected_components = []
        for attr, item in all_items:
            audit_group(root, item, attr, key)
            component = int(item['componentLabel'])
            require(1 <= component <= len(slices) and slices[component - 1] is not None,
                    f'{key}: missing source component {component}')
            ys, xs = slices[component - 1]
            bbox = [xs.start, ys.start, xs.stop, ys.stop]
            require(bbox == item['bbox'], f'{key}: source bbox mismatch {item["id"]}')
            require(int((labels[ys, xs] == component).sum()) == item['pixels'],
                    f'{key}: source component area mismatch {item["id"]}')
            expected_components.append(component)
            counts[attr.removeprefix('data-')] += 1
            source_components += 1
            if attr == 'data-panel':
                directions[item['direction']] += 1
                cycles[face['cycle']] += 1
        require(len(expected_components) == len(set(expected_components)),
                f'{key}: same source component vectorized more than once')
        for attr in ('data-panel', 'data-arrow', 'data-extra'):
            actual = [e.get(attr) for e in root.iter() if e.get(attr)]
            expected = [item['id'] for typ, item in all_items if typ == attr]
            require(Counter(actual) == Counter(expected), f'{key}: extra/missing {attr} groups')
        overlay_path = output / 'overlays' / f'{key}.svg'
        overlay = ET.parse(overlay_path).getroot()
        expected = (ROOT / 'map/images/hd1024/overlay' / f'{key}-corners.svg').resolve()
        installed = ET.parse(expected).getroot()
        retained = [group for group in overlay.iter(f'{{{NS}}}g')
                    if group.get('data-source') == 'current-overlay']
        require(len(retained) == 1, f'{key}: preview must retain one existing corner overlay')
        require(tuple(map(element_signature, retained[0])) ==
                tuple(map(element_signature, installed)),
                f'{key}: installed corner overlay contents changed inside preview')
        require(len(list(overlay.iter(f'{{{NS}}}image'))) ==
                len(list(installed.iter(f'{{{NS}}}image'))),
                f'{key}: preview added unexpected raster content')
        require(retained[0].get('mask') == 'url(#keep-links)',
                f'{key}: source overlay is not masked by isolated route edits')
        require(overlay.find(f'.//{{{NS}}}mask') is not None,
                f'{key}: missing isolated route-cut mask')
        overlays += 1
    summary = inventory['summary']
    require(counts['panel'] == summary['panels'], 'Panel count summary differs')
    require(counts['arrow'] == summary['arrows'], 'Arrow count summary differs')
    require(counts['extra'] == summary['attachedExtras'], 'Attached extras summary differs')
    require(dict(directions) == summary['panelsByDirection'], 'Direction coverage differs')
    require(dict(cycles) == summary['panelsByCycle'], 'Cycle coverage differs')
    # Check again after reading all source files, so writes concurrent with the
    # audit cannot be mistaken for successful source protection.
    require(runtime_hashes(output / 'before-source-hashes.json') == protected,
            'Protected hash snapshot changed during verification')
    result = {'status': 'passed', 'faces': len(faces), 'panels': counts['panel'],
              'arrows': counts['arrow'], 'attachedExtras': counts['extra'],
              'sourceComponentsChecked': source_components,
              'panelsByDirection': dict(directions), 'panelsByCycle': dict(cycles),
              'pureVectorFiles': len(faces), 'previewOverlays': overlays,
              'protectedRuntimeSourceFiles': protected, 'allSourceHashesUnchanged': True,
              'bitmapOrFontDependenciesInLinkVectors': 0,
              'installation': 'none'}
    (output / 'structure-check.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    verify(parser.parse_args().output.resolve())
