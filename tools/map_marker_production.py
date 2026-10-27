"""Replay the complete fixed marker library when rebuilding map overlays."""
from copy import deepcopy
from pathlib import Path
import hashlib,json
import xml.etree.ElementTree as ET
from map_original_components import validate_artwork

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-marker-vector-source'
MANIFEST=SOURCE/'production.json'
NS='http://www.w3.org/2000/svg'

def read_production():
    return json.loads(MANIFEST.read_text(encoding='utf8'))if MANIFEST.exists()else None

def apply_marker_components(root,key,production=None):
    production=production or read_production()
    if not production:return root
    row=production['faces'][key]
    assert row.get('pending',0)==0,key
    path=SOURCE/row['vector'];assert path.resolve().is_relative_to(SOURCE.resolve()),key
    raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==row['sha256'],key
    elements=ET.fromstring(raw);validate_artwork(elements)
    mask=next(node for node in root.iter(f'{{{NS}}}mask')if node.get('id')=='keep')
    for cut in list(mask):
        if cut.get('data-remove')=='remaining-markers':mask.remove(cut)
    for group in list(root):
        if group.get('data-map-markers')=='true':root.remove(group)
    ET.SubElement(mask,f'{{{NS}}}path',{'data-remove':'remaining-markers','d':row['maskPath'],'fill':'black','fill-rule':'evenodd'})
    group=ET.SubElement(root,f'{{{NS}}}g',{'data-map-markers':'true','data-version':production['version'],'data-pending':'0'})
    group.extend(deepcopy(list(elements)))
    return root
