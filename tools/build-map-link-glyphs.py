"""Build review-only route glyph paths, without touching installed map artwork.

Existing real vector artwork is copied intact. Bitmap-only rare glyphs are
contoured from their isolated source alpha at native resolution, not wrapped in
SVG images. Greek route suffixes use Times New Roman outlines, with no runtime
font dependency. Every provenance claim is recorded in manifest.json.
"""
from __future__ import annotations

import base64
import copy
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.svgLib.path import parse_path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, label
from skimage.measure import approximate_polygon, find_contours

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/map-asset-kit-20261024/native-icons/markers'
DEST = ROOT / 'tools/map-link-vector-source/glyphs'
REVIEW = ROOT / 'output/map-link-vector-review-20261025/glyphs'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
FONT = Path('C:/Windows/Fonts/times.ttf')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def path_for(field, tolerance=.22, area=.65):
    """Subpixel contours with explicit even/odd holes; tolerance in source px."""
    field = gaussian_filter(field.astype(float), .22)
    labs, count = label(field >= .48)
    for ident in range(1, count + 1):
        if np.count_nonzero(labs == ident) < 1:
            field[labs == ident] = 0
    up = 4
    high = np.asarray(Image.fromarray(field.astype(np.float32), 'F').resize(
        (field.shape[1] * up, field.shape[0] * up), Image.Resampling.BICUBIC))
    parts = []
    vertices = 0
    loops = 0
    for contour in find_contours(np.pad(high, 2), .48):
        contour = (contour - 2) / up
        x, y = contour[:, 1], contour[:, 0]
        signed = abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))) / 2
        if signed < area:
            continue
        points = approximate_polygon(contour, tolerance=tolerance)
        if len(points) < 4:
            continue
        # Resampled array coordinates refer to high-resolution sample centers.
        # Convert those centers to SVG image-edge coordinates once (not by a
        # second native half-pixel offset, which would shift small glyphs).
        parts.append('M' + 'L'.join(f'{x+.5/up:.4f},{y+.5/up:.4f}' for y, x in points[:-1]) + 'Z')
        vertices += len(points) - 1
        loops += 1
    if not parts:
        raise ValueError('Empty glyph contour')
    return ' '.join(parts), vertices, loops


def traced(source):
    root = ET.parse(source).getroot()
    images = list(root.iter(f'{{{NS}}}image'))
    assert len(images) == 1, source
    node = images[0]
    src = node.get('href') or node.get('{http://www.w3.org/1999/xlink}href')
    assert src.startswith('data:image/png;base64,')
    im = Image.open(BytesIO(base64.b64decode(src.split(',', 1)[1]))).convert('RGBA')
    px = np.asarray(im)
    alpha = px[..., 3].astype(float) / 255
    lum = px[..., :3].astype(float).mean(2) / 255
    x, y = float(node.get('x', 0)), float(node.get('y', 0))
    sx, sy = float(node.get('width')) / im.width, float(node.get('height')) / im.height
    visible = alpha > .5
    # Black variants are isolated monochrome ink. Original two-tone symbols
    # (river disk, ruin, lighthouse, portal) retain their light inner details.
    monochrome = bool(np.std(lum[visible]) < .055)
    layers = [('ink', alpha, '#000000')]
    if not monochrome:
        light = alpha * np.clip((lum - .37) / .40, 0, 1)
        if np.count_nonzero(light > .48) > 2:
            layers.append(('light-inlay', light, '#ffffff'))
    out = ET.Element(f'{{{NS}}}svg', {
        'width': '1024', 'height': '1024', 'viewBox': '0 0 1024 1024',
        'data-vector-method': 'isolated-bitmap-contour',
    })
    title = ET.SubElement(out, f'{{{NS}}}title')
    title.text = source.stem.removesuffix('-black') + ' — bitmap-derived vector contours'
    group = ET.SubElement(out, f'{{{NS}}}g', {'transform': f'matrix({sx:.9f} 0 0 {sy:.9f} {x:.9f} {y:.9f})'})
    vertices, loops = 0, 0
    for name, field, fill in layers:
        d, n, rings = path_for(field)
        ET.SubElement(group, f'{{{NS}}}path', {
            'data-layer': name, 'd': d, 'fill': fill, 'fill-rule': 'evenodd',
        })
        vertices += n
        loops += rings
    return out, {'method': 'isolated-bitmap-contour', 'nativeVector': False,
                 'nativeBitmapSize': list(im.size), 'sourceImagePlacement': [x,y,sx,sy],
                 'contourTolerancePx': .22, 'threshold': .48,
                 'vertices': vertices, 'loops': loops, 'layers': len(layers)}


def greek(name, character, font):
    glyphset = font.getGlyphSet()
    glyphname = font.getBestCmap()[ord(character)]
    bounds = BoundsPen(glyphset)
    glyphset[glyphname].draw(bounds)
    l,b,r,t = bounds.bounds
    scale = min(900/(r-l),900/(t-b))
    tx,ty = 512-(l+r)*scale/2,512+(t+b)*scale/2
    pen = SVGPathPen(glyphset)
    glyphset[glyphname].draw(pen)
    root = ET.Element(f'{{{NS}}}svg', {'width':'1024','height':'1024','viewBox':'0 0 1024 1024',
                     'data-vector-method':'font-outline'})
    ET.SubElement(root,f'{{{NS}}}title').text = f'Greek {name}: Times New Roman outline'
    ET.SubElement(root,f'{{{NS}}}path',{'d':pen.getCommands(),'fill':'#000000',
                  'transform':f'matrix({scale:.9f} 0 0 {-scale:.9f} {tx:.9f} {ty:.9f})'})
    return root, {'method':'font-outline','nativeVector':True,'character':character,
                  'font':str(FONT),'fontSha256':sha(FONT),'glyphName':glyphname,
                  'originalBounds':[l,b,r,t]}


def sea_route():
    """The water bands, excluding the birds, from the native RR mark."""
    source = SOURCE/'rr_adventure.svg'
    rr = ET.parse(source).getroot()
    paths = [copy.deepcopy(p) for p in rr.iter(f'{{{NS}}}path')
             if 68 <= int(p.get('data-source-drawing',0)) <= 75]
    assert len(paths) == 8
    pen = BoundsPen(None)
    for path in paths:
        parse_path(path.get('d'),pen)
    l,t,r,b = pen.bounds
    scale = min(900/(r-l),900/(b-t))
    tx,ty = 512-(l+r)*scale/2,512-(t+b)*scale/2
    root = ET.Element(f'{{{NS}}}svg', {'width':'1024','height':'1024','viewBox':'0 0 1024 1024',
                      'data-vector-method':'native-vector-subset'})
    ET.SubElement(root,f'{{{NS}}}title').text = 'Sea route: native RR water bands, drawing 68–75'
    group = ET.SubElement(root,f'{{{NS}}}g',{'transform':f'matrix({scale:.9f} 0 0 {scale:.9f} {tx:.9f} {ty:.9f})'})
    group.extend(paths)
    return root, {'method':'native-vector-subset','nativeVector':True,
                  'source':source.relative_to(ROOT).as_posix(),'sourceSha256':sha(source),
                  'sourceDrawings':list(range(68,76)),'originalBounds':[l,t,r,b]}


def verify(root):
    forbidden = {'image','text','foreignObject','use','script'}
    for node in root.iter():
        assert node.tag.rsplit('}',1)[-1] not in forbidden
        assert not any(k.rsplit('}',1)[-1] == 'href' for k in node.attrib)
    text = ET.tostring(root, encoding='unicode')
    assert not re.search(r'NaN|Infinity|data:image|@font-face', text)
    assert list(root.iter(f'{{{NS}}}path'))


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    coverage = json.loads((SOURCE.parent.parent/'source-audit/map-icon-coverage.json').read_text(encoding='utf-8'))
    provenance = {entry['id']:entry.get('asset',{}) for entry in coverage['tags']}
    records = []
    for original in sorted(SOURCE.glob('*.svg')):
        name = original.stem
        if '-' in name:
            continue
        source = original
        root = ET.parse(original).getroot()
        if list(root.iter(f'{{{NS}}}image')):
            black = SOURCE/f'{name}-black.svg'
            if black.exists():
                source = black
            root, details = traced(source)
        else:
            root = copy.deepcopy(root)
            details = {'method':'existing-vector-paths','nativeVector':None,
                       'sourceClaim':provenance.get(name,{}).get('sourceKind'),
                       'sourceProvenance':provenance.get(name,{}).get('source')}
            root.set('data-vector-method','existing-vector-paths')
        verify(root)
        target = DEST/f'{name}.svg'
        target.write_text(ET.tostring(root,encoding='unicode')+'\n',encoding='utf-8')
        records.append({'id':name,'file':target.relative_to(ROOT).as_posix(),
                        'source':source.relative_to(ROOT).as_posix(), 'sourceSha256':sha(source),
                        'bytes':target.stat().st_size, **details})
    font = TTFont(FONT)
    for name, char in [('alpha','α'),('beta','β')]:
        root,details = greek(name,char,font)
        verify(root)
        target = DEST/f'{name}.svg'
        target.write_text(ET.tostring(root,encoding='unicode')+'\n',encoding='utf-8')
        records.append({'id':name,'file':target.relative_to(ROOT).as_posix(),'bytes':target.stat().st_size,**details})
    root,details = sea_route()
    verify(root)
    target = DEST/'sea_route.svg'
    target.write_text(ET.tostring(root,encoding='unicode')+'\n',encoding='utf-8')
    records.append({'id':'sea_route','file':target.relative_to(ROOT).as_posix(),'bytes':target.stat().st_size,**details})
    report = {'purpose':'Review-only route glyphs; no runtime assets or registry modified',
              'coordinateSystem':'1024 × 1024; preserve aspect ratio when fitting',
              'sourceImages':0,'runtimeFonts':0,'glyphs':records,
              'counts':{method:sum(r['method']==method for r in records) for method in sorted({r['method'] for r in records})}}
    (DEST/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (REVIEW/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    methods={'existing-vector-paths':'复用已有路径', 'isolated-bitmap-contour':'源图轮廓描摹',
             'font-outline':'字体轮廓', 'native-vector-subset':'原生路径子集'}
    cards=[]
    for row in records:
        cards.append(f'<article><h2>{row["id"]}</h2><img src="../../../{row["file"]}" alt="{row["id"]}">'
                     f'<p>{methods.get(row["method"],row["method"])}</p><a href="../../../{row["file"]}">SVG 路径文件</a></article>')
    page=('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>链接附加图标路径库</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#18262c;color:#edf1ed;font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1200px;margin:auto}h1{font-size:28px}a{color:#a8e2ce}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}article{background:#2b3b42;border:1px solid #54646c;border-radius:8px;padding:14px}h2{font-size:15px;overflow-wrap:anywhere}img{width:100%;height:150px;object-fit:contain;background:#b4bebc;border-radius:5px}p{color:#bccdce}</style><main><a href="../index.html">返回全量对照</a><h1>链接附加图标路径库</h1><p>24 个真正路径 SVG。逐项标注已有路径、位图轮廓描摹或字体轮廓；本页是独立参考库，未替换正式资源，也未将这些图标套进全量源轮廓方案。</p><p><a href="glyph-comparison.png">源图与路径渲染对照</a> · <a href="render-check.json">渲染保真检查</a> · <a href="../../../tools/map-link-vector-source/glyphs/manifest.json">来源清单</a></p><div class="grid">'''
          +''.join(cards)+'</div></main></html>')
    (REVIEW/'index.html').write_text(page,encoding='utf-8')
    print(json.dumps({'glyphs':len(records),**report['counts'],'imageElements':0,'fontElements':0}))


if __name__=='__main__':
    main()
