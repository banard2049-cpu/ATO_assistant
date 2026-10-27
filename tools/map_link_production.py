"""Replay installed link vectors when rebuilding the existing corner overlays.

Only validated local SVG path sources and their source-component cut masks are
read here. The runtime keeps its existing self-contained *-corners.svg URLs.
"""
from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from map_original_components import validate_artwork

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(__file__).with_name('map-link-vector-source')
MANIFEST=SOURCE/'production.json'
NS='http://www.w3.org/2000/svg'


def read_production():
    return json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else None


def apply_link_vectors(root,key,production=None):
    production=production or read_production()
    if not production:return root
    row=production['faces'][key]
    mask=next(node for node in root.iter(f'{{{NS}}}mask') if node.get('id')=='keep')
    for cut in list(mask):
        if cut.get('data-remove')=='links':mask.remove(cut)
    for group in list(root):
        if group.get('data-map-links')=='true':root.remove(group)
    path=SOURCE/row['vector']
    raw=path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==row['sha256'],key
    links=ET.fromstring(raw)
    validate_artwork(links)
    ET.SubElement(mask,f'{{{NS}}}path',{'data-remove':'links','d':row['maskPath'],'fill':'black','fill-rule':'evenodd'})
    group=ET.SubElement(root,f'{{{NS}}}g',{'data-map-links':'true','data-version':production['version']})
    group.extend(deepcopy(list(links)))
    return root
