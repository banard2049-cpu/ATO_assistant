"""Strict provenance checks for fixed original-alpha components inside SVG.

Only complete, hash-pinned source sprites are allowed. A bitmap of a map region
cannot enter a rendered component through this interface.
"""
from functools import lru_cache
from io import BytesIO
from pathlib import Path
import base64,hashlib,json
import xml.etree.ElementTree as ET
from PIL import Image,ImageChops

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'tools/map-marker-vector-source/original-components/manifest.json'

def records():
    return json.loads(MANIFEST.read_text(encoding='utf8'))['components']

@lru_cache(maxsize=64)
def verified_record(ident):
    record=records()[ident];path=ROOT/record['file'];raw=path.read_bytes()
    assert record['kind']=='original-raster-alpha',ident
    assert hashlib.sha256(raw).hexdigest()==record['sha256'],ident
    assert record.get('canvasCropped')is False and record.get('newSilhouetteInvented')is False,ident
    assert not record.get('nativeVector'),ident
    assert '/original-components/'in path.as_posix(),ident
    im=Image.open(BytesIO(raw)).convert('RGBA')
    assert im.size==(record['width'],record['height']),ident
    assert list(im.getchannel('A').getbbox())==record['inkBBox'],ident
    assert im.getpixel((0,0))[3]==0,ident
    if record.get('source'):
        source=ROOT/record['source']
        assert hashlib.sha256(source.read_bytes()).hexdigest()==record['sourceSha256'],ident
    return record,im.getchannel('A')

def validate_artwork(root):
    """Reject external images, map crops, altered alpha, scripts and live fonts."""
    if isinstance(root,(str,bytes)):root=ET.fromstring(root)
    counts={'originalAlphaImages':0,'nativePaths':0};ids=set()
    def visit(node,component=None):
        kind=node.tag.rsplit('}',1)[-1]
        assert kind not in('text','use','script','foreignObject','style'),kind
        if node.get('id'):
            assert node.get('id')not in ids,('duplicate SVG id',node.get('id'))
            ids.add(node.get('id'))
        if node.get('data-component-kind')=='original-raster-alpha':
            ident=node.get('data-emblem');record,alpha=verified_record(ident)
            assert node.get('data-source-sha256')==record['sha256'],ident
            assert node.get('data-canvas-cropped')=='false',ident
            assert node.get('data-full-source-canvas')==f'{record["width"]} {record["height"]}',ident
            component=(record,alpha)
        hrefs=[v for k,v in node.attrib.items()if k.rsplit('}',1)[-1]=='href']
        if kind=='image':
            assert component is not None,'Unmanifested image in component artwork'
            assert len(hrefs)==1 and hrefs[0].startswith('data:image/png;base64,'),'Only embedded original PNG alpha is allowed'
            im=Image.open(BytesIO(base64.b64decode(hrefs[0].split(',',1)[1],validate=True))).convert('RGBA')
            record,alpha=component
            assert im.size==(record['width'],record['height']),record['id']
            assert ImageChops.difference(im.getchannel('A'),alpha).getbbox()is None,record['id']
            for channel in im.split()[:3]:assert channel.getextrema()==(255,255),record['id']
            counts['originalAlphaImages']+=1
        else:assert not hrefs,kind
        if kind=='path':counts['nativePaths']+=1
        for key,value in node.attrib.items():
            assert not key.lower().startswith('on'),key
            assert not any(s in value for s in('NaN','Infinity','@font-face')),key
        assert node.get('data-content-method')not in('source-ink','source-black-inset')
        for child in node:visit(child,component)
    visit(root)
    return counts
