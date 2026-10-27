"""Build all regular map-back markers from the approved native vector sources.

Only back annotation references change. C1 alternate instruction backs and all
revealed-face masks retain their existing assets. No external Python packages.
"""
from pathlib import Path
import copy
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(__file__).with_name('map-back-vector-source')
DEST = ROOT / 'map/images/card-backs/vectors'
OUT = ROOT / 'output/map-asset-kit-20261024'
VERSION = '20261024-vector-backs6-c5-split-colors'
C5_PALETTES = {'A': ('#7b8e99', '#29343a', '#f6f7ee'),
               'B': ('#3e484d', '#7a8a8e', '#f6f7ee')}
# The original top plates swap the two compartment colors between depths.
# These light-bordered plates have a separate palette from the lower corners.
C5_COVER_PALETTES = {'A': ('#40484e', '#7b8e99'),
                     'B': ('#7b8e99', '#40484e')}
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
GLYPHS = json.loads((SOURCE / 'numerals.json').read_text())['glyphs']
FACTIONS = json.loads((SOURCE / 'factions.json').read_text(encoding='utf-8'))
REGIONS = json.loads((SOURCE / 'c4-regions.json').read_text())


def read_js(path):
    text = path.read_text(encoding='utf-8-sig')
    return json.loads(re.sub(r',\s*([}\]])', r'\1', text[text.index('{'):text.rindex('}') + 1]))


TAGS = read_js(ROOT / 'map/map-tile-tags.js')['tiles']
MAP = read_js(ROOT / 'map/map-data.js')
C4 = {t['id']: t for c in MAP['cycles'] if c['id'] == 'c4' for t in c['tiles']}


def faction_ids(cycle, number, face=None):
    entry = TAGS.get(f'{cycle}:{number}:{face}', {}) if face else {}
    ids = entry.get('factions', TAGS[f'{cycle}:{number}']['factions'])
    return [('minoans' if f == 'minoians' else f.lower()) for f in ids if f != 'none']


def poly(points, fill, stroke=None, sw=1):
    points = ' '.join(f'{x:g},{y:g}' for x, y in points)
    return f'<polygon points="{points}" fill="{fill}"' + (f' stroke="{stroke}" stroke-width="{sw:g}" stroke-linejoin="round"' if stroke else '') + '/>'


def rect(x, y, w, h, fill, stroke=None, sw=1):
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" fill="{fill}"' + (f' stroke="{stroke}" stroke-width="{sw:g}"' if stroke else '') + '/>'


def numeral(text, box, color):
    """Fixed optical height; preserve each glyph's proportions and center it."""
    advance = 0
    bounds = []
    paths = []
    for ch in text:
        g = GLYPHS[ch]
        l, b, r, t = g['bounds']
        bounds.append((advance + l, b, advance + r, t))
        paths.append(f'<path d="{g["path"]}" transform="translate({advance:g} 0)"/>')
        advance += g['advance']
    xl, yb = min(b[0] for b in bounds), min(b[1] for b in bounds)
    xr, yt = max(b[2] for b in bounds), max(b[3] for b in bounds)
    l, t, r, b = box
    scale = min((b - t) / (yt - yb), (r - l) / (xr - xl))
    tx = (l + r) / 2 - (xl + xr) / 2 * scale
    ty = (t + b) / 2 + (yb + yt) / 2 * scale
    return f'<g data-number="{text}" fill="{color}" transform="matrix({scale:.9f} 0 0 {-scale:.9f} {tx:.9f} {ty:.9f})">' + ''.join(paths) + '</g>'


def faction(ident, box, ink, background, stretch_x=1):
    root = ET.parse(SOURCE / f'{ident}.svg').getroot()
    l, t, r, b = FACTIONS[ident]['bounds']
    x, y, x1, y1 = box
    scale = min((x1 - x) / (r - l), (y1 - y) / (b - t))
    sx = scale * stretch_x
    tx = (x + x1) / 2 - (l + r) / 2 * sx
    ty = (y + y1) / 2 - (t + b) / 2 * scale
    for el in root.iter():
        for attr in ('fill', 'stroke'):
            value = el.get(attr)
            if value and value != 'none':
                el.set(attr, background if value.lower() == '#191919' else ink)
    body = ''.join(ET.tostring(el, encoding='unicode') for el in root if el.tag.rsplit('}', 1)[-1] not in ('title', 'desc'))
    return f'<g data-faction="{ident}" transform="matrix({sx:.9f} 0 0 {scale:.9f} {tx:.9f} {ty:.9f})">{body}</g>'


def placed(body, box, view):
    x, y, w, h = box
    vw, vh = view
    return f'<svg x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" viewBox="0 0 {vw:g} {vh:g}" preserveAspectRatio="none" overflow="visible">{body}</svg>'


def standard(cycle, number, ids):
    palettes = {
        'c1': ('#ae8163', '#62574b', '#f7f2e5', '#fcf9f2'),
        'c2': ('#e85b4f', '#75423d', '#ffe9dc', '#fff9f5'),
        'c3': ('#7d7fb4', '#6e6d7d', '#faf7fd', '#fbfcfe'),
    }
    main, dark, rim, ink = palettes[cycle]
    if not ids:
        body = poly([(3,43),(27,3),(130,3),(153,43),(130,83),(27,83)],main,rim,3)
        body += poly([(10,43),(31,10),(126,10),(146,43),(126,76),(31,76)],main,rim,2.7)
        body += numeral(number,(30,24,126,62),ink)
        return body, (156,86)
    extra = 47 if len(ids) == 2 else 0
    body = poly([(2,43),(27,2),(191+extra,2),(217+extra,43),(192+extra,84),(27,84)],main,rim,3)
    body += poly([(8,43),(31,9),(127,9),(127,77),(31,77)],main,rim,3.1)
    body += poly([(135,9),(187+extra,9),(210+extra,43),(187+extra,77),(135,77)],dark,rim,3.1)
    body += numeral(number,(31,24,116,62),ink)
    for i, ident in enumerate(ids):
        if len(ids) == 2:
            box = (141+i*51,16,190+i*51,69)
        elif ident == 'hornsworn':
            box = (148,23,189,64)
        else:
            box = (144,15,202,71)
        if (cycle == 'c1' and ident in ('minoans','labyrinthians')) or (cycle in ('c2','c3') and len(ids) == 1):
            # User-requested optical correction: 90% size, 3 native pixels left.
            l,t,r,b=box
            cx,cy=(l+r)/2-3,(t+b)/2
            hw,hh=(r-l)*.45,(b-t)*.45
            box=(cx-hw,cy-hh,cx+hw,cy+hh)
        if len(ids) == 1:
            l,t,r,b=box
            if ident == 'helots':
                box=(l-4,t,r-4,b)
            elif ident == 'sunheirs':
                cx,cy=(l+r)/2,(t+b)/2
                hw,hh=(r-l)*.54,(b-t)*.54
                box=(cx-hw,cy-hh,cx+hw,cy+hh)
            elif ident == 'twilightwatch':
                box=(l,t-4,r,b-4)
        body += faction(ident,box,ink,dark,stretch_x=1.12 if ident=='twilightwatch' else 1)
    return body,(219+extra,86)


def c4_plate(kind, number, ident):
    gold,rim,dark,edge,ink = '#c6a669','#cbbb91','#3f3d39','#625332','#493b25'
    if kind == 'number':
        body=poly([(0,40),(25,0),(188,0),(214,40),(189,81),(25,81)],gold,rim,1.7)
        body+=poly([(6,40),(28,6),(126,6),(126,75),(28,75)],gold,edge,1.8)
        body+=poly([(132,6),(185,6),(208,40),(185,75),(132,75)],dark,rim,1.4)
        body+=numeral(number,(34,22,116,59),'#423727')
        body+=faction(ident,(138,13,193,69),'#f8f6ed',dark)
        return body,(214,81)
    if kind == 'west':
        w,h=139,54
        body=poly([(0,h/2),(16,0),(w,0),(w,h),(17,h)],gold,rim,1.4)
        body+=poly([(5,h/2),(20,5),(86,5),(86,h-5),(20,h-5)],gold,edge,1.5)
        body+=rect(91,4,44,h-8,dark,rim,1.3)
        nb,fb=(21,15,81,40),(95,7,132,47)
    elif kind == 'east':
        w,h=138,54
        body=poly([(0,0),(w-16,0),(w,h/2),(w-16,h),(0,h)],gold,rim,1.4)
        body+=rect(4,4,44,h-8,dark,rim,1.3)
        body+=poly([(55,5),(w-20,5),(w-5,h/2),(w-20,h-5),(55,h-5)],gold,edge,1.5)
        nb,fb=(61,15,121,40),(8,7,44,47)
    else:
        w,h=131,55
        body=rect(0,0,w,h,gold,rim,1.5)
        body+=rect(4,4,73.5,h-8,gold,edge,1.6)
        body+=rect(80.5,3,47.5,h-6,dark,rim,1.3)
        nb,fb=(10,14,71,40),(84,7,124,48)
    body+=numeral(number,nb,ink)+faction(ident,fb,'#f8f6ed',dark)
    return body,(w,h)


def c4_markers(key, number, piece):
    left,top,right,bottom = piece['bbox']
    body, labels = '', []
    dirs = {'north':'up','south':'down','west':'left','east':'right'}
    for region in REGIONS[key]:
        kind=region['kind']
        target=number if kind=='number' else C4[number]['neighbors'][dirs[kind]]
        assert target, (key,kind)
        ids=faction_ids('c4',target)
        assert len(ids)==1
        xs,ys=zip(*region['points'])
        x,y,x1,y1=min(xs),min(ys),max(xs),max(ys)
        graphic,view=c4_plate(kind,target,ids[0])
        body+=f'<g data-direction="{kind}">'+placed(graphic,(x-left,y-top,x1-x,y1-y),view)+'</g>'
        arrow=region.get('arrowPoints')
        if arrow:
            ax,ay=zip(*arrow);al,at,ar,ab=min(ax),min(ay),max(ax),max(ay)
            cy=at if kind=='north' else ab
            by=ab if kind=='north' else at
            body+=f'<g data-arrow="{kind}">'+poly([(al-left,by-top),((al+ar)/2-left,cy-top),(ar-left,by-top)],'#c6a669','#cbbb91',1.2)+'</g>'
        labels.append({'direction':kind,'number':target,'factions':ids,'arrow':bool(arrow)})
    return body,(right-left,bottom-top),labels


def cover(number, ident, face):
    number_bg,faction_bg=C5_COVER_PALETTES[face]
    rim,ink='#e3e5dc','#f6f7ee'
    body=poly([(3,56),(31,3),(168,3),(168,109),(31,109)],number_bg,rim,3)
    body+=poly([(10,56),(35,10),(160,10),(160,102),(35,102)],'none',rim,2)
    body+=numeral(number,(42,32,144,80),ink)
    body+=f'<path d="M168 3H249L277 56 249 109H168Z" fill="{faction_bg}" stroke="{rim}" stroke-width="3"/>'
    body+=f'<path d="M174 9H245L270 56 245 103H174Z" fill="none" stroke="{rim}" stroke-width="2"/>'
    # C5 keeps its approved size; shift all three faction marks 4 units left.
    body+=faction(ident,(186,20,250,92),ink,faction_bg)
    return body,(280,112)


def save(key,body,size):
    w,h=size
    svg=f'<svg xmlns="{NS}" width="{w:g}" height="{h:g}" viewBox="0 0 {w:g} {h:g}">{body}</svg>\n'
    root=ET.fromstring(svg)
    assert not list(root.iter(f'{{{NS}}}image'))
    assert not list(root.iter(f'{{{NS}}}text'))
    (DEST/f'{key}.svg').write_text(svg,encoding='utf-8')
    return f'./images/card-backs/vectors/{key}.svg'


def main():
    DEST.mkdir(parents=True,exist_ok=True)
    registry=read_js(ROOT/'map/tile-back-data.js')
    headings=read_js(ROOT/'map/c5-heading-data.js')
    special={k:copy.deepcopy(v) for k,v in registry['backs'].items() if '-alt-' in k}
    rows=[]
    for key,entry in registry['backs'].items():
        if key in special: continue
        cycle=entry['cycle'];number=key.split('-')[2]
        assert len(entry['pieces'])==1 and not entry.get('image'),key
        piece=entry['pieces'][0]
        if cycle=='c4':
            body,size,labels=c4_markers(key,number,piece)
        else:
            ids=faction_ids(cycle,number)
            body,view=standard(cycle,number,ids)
            l,t,r,b=piece['bbox'];size=(r-l,b-t)
            body=placed(body,(0,0,*size),view)
            labels=[{'direction':'number','number':number,'factions':ids,'arrow':False}]
        source=save(key,body,size)
        piece['src']=source
        rows.append({'key':key,'cycle':cycle,'source':source,'labels':labels})
    for key,entry in headings.items():
        number=key.split('-')[2];face='B' if key.endswith('-back') else 'A'
        ids=faction_ids('c5',number,face)
        assert len(ids)==1,(key,ids)
        body,size=cover(number,ids[0],face)
        entry['cover']=save(key+'-cover',body,size)
        rows.append({'key':key+'-cover','cycle':'c5','face':face,'source':entry['cover'],
                     'labels':[{'direction':'number','number':number,'factions':ids,'arrow':False}]})
    assert len(rows)==504
    assert special=={k:registry['backs'][k] for k in special}
    registry['version']=VERSION
    (ROOT/'map/tile-back-data.js').write_text('window.ATO_MAP_BACK_DATA = '+json.dumps(registry,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    lines=['/* Original front geometry and face-specific vector cover labels. */','window.ATO_C5_HEADING_DATA = {']
    lines += ['  '+json.dumps(k)+': '+json.dumps(v,separators=(',',':'))+(',' if i<len(headings)-1 else '') for i,(k,v) in enumerate(headings.items())]
    (ROOT/'map/c5-heading-data.js').write_text('\n'.join(lines)+'\n};\n',encoding='utf-8')
    report={'version':VERSION,'regularBacks':344,'c5Covers':160,'vectorFiles':504,
            'excludedSpecialBacks':list(special),'bitmapMarkers':0,'externalFontFiles':0,
            'labels':sum(len(r['labels']) for r in rows),'arrows':sum(l['arrow'] for r in rows for l in r['labels']),
            'cards':rows}
    OUT.mkdir(exist_ok=True,parents=True)
    (OUT/'full-back-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='cards'}))


if __name__=='__main__':
    main()
