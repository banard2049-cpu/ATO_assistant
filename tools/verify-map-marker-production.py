"""Independent full-coverage and fixed-component audit before installation."""
from collections import Counter
from copy import deepcopy
from pathlib import Path
import hashlib,json,re
import xml.etree.ElementTree as ET
from map_original_components import validate_artwork,verified_record
from map_marker_templates import _transform
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-marker-vector-source'
OUT=ROOT/'output/map-marker-hd-review-20261026/composition'

def load(path):return json.loads(path.read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def normalized(node):
    node=deepcopy(node)
    for el in node.iter():
        for attr in('fill','stroke'):
            if el.get(attr)not in(None,'none'):el.set(attr,'INK')
        if el.get('id'):el.set('id','shared-alpha-mask')
        if el.get('mask'):el.set('mask','url(#shared-alpha-mask)')
    return ET.canonicalize(ET.tostring(node,encoding='unicode'),strip_text=True)

def ink_bounds(group):
    if group.get('data-component-kind')=='original-raster-alpha':
        record,_=verified_record(group.get('data-emblem'))
        image=next(n for n in group.iter()if n.tag.rsplit('}',1)[-1]=='image')
        sx=float(image.get('width'))/record['width'];sy=float(image.get('height'))/record['height']
        x,y=float(image.get('x')),float(image.get('y'));l,t,r,b=record['inkBBox']
        return x+l*sx,y+t*sy,x+r*sx,y+b*sy
    pen=BoundsPen(None)
    def visit(node,parent):
        matrix=parent.transform(_transform(node.get('transform')))
        if node.tag.rsplit('}',1)[-1]=='path':parse_path(node.get('d',''),TransformPen(pen,matrix))
        for child in node:visit(child,matrix)
    visit(group,Transform());assert pen.bounds is not None
    return pen.bounds

def main():
    inventory=load(SOURCE/'inventory.json');production=load(SOURCE/'production.json')
    layout=load(OUT/'backing-layouts.json');report=load(OUT/'composition-report.json')
    assert len(production['faces'])==511
    assert report['summary']['pendingEmblems']==0 and report['summary']['facesPreviewed']==511
    assert production['method']=='shared-fixed-elements'
    expected={r['key']:r for r in inventory['faces']};by_key={r['key']:r for r in layout['faces']}
    assert set(expected)==set(by_key)==set(production['faces'])
    for name,digest in production['inputSha256'].items():assert sha(ROOT/name)==digest,name
    for name,digest in production.get('fontSha256',{}).items():assert sha(Path(name))==digest,name
    components={};backings={};types=Counter();totals=Counter();details=[];city_sizes=[];secret_sizes=[]
    for key,row in production['faces'].items():
        source=expected[key];meta=by_key[key]
        assert sha(ROOT/source['source'])==source['sourceSha256'],key
        path=SOURCE/row['vector'];assert sha(path)==row['sha256'],key
        raw=path.read_text(encoding='utf8');root=ET.fromstring(raw);validate_artwork(root)
        assert 'data-pending-emblem'not in raw and 'data-preview-only'not in raw,key
        assert 'redraw/'not in raw and 'source-ink'not in raw,key
        actual=[n.get('data-marker-instance')for n in root.iter()if n.get('data-marker-instance')]
        assert Counter(actual)==Counter(m['id']for m in meta['markers']),key
        assert len(actual)==len([m for m in source['markers']if m['type']!='hidden_number_digit']),key
        hidden=[n.get('data-hidden-number')for n in root.iter()if n.get('data-hidden-number')]
        assert Counter(hidden)==Counter(m['text']for m in meta['hiddenNumbers']),key
        expected_digits=[m['componentLabel']for m in source['markers']+source.get('smallComponents',[])if m['type']=='hidden_number_digit']
        assert sorted(expected_digits)==sorted(meta['hiddenSourceComponents']),key
        totals['hiddenDigitComponents']+=len(expected_digits);totals['hiddenGroups']+=len(hidden)
        totals['markers']+=len(actual)
        for mark in meta['markers']:types[mark.get('variantId',mark['type'])]+=1
        for group in root.iter():
            ident=group.get('data-emblem')
            if ident:
                value=normalized(group)
                # The Knossos city is placed in its own nameplate module;
                # every round city uses the ordinary shared component.
                if ident=='city':
                    l,t,r,b=ink_bounds(group);width=r-l;height=b-t
                    limits={'c1':43,'c2':52,'c3':52,'c4':49,'c5':52}
                    limit=46 if key=='c1-tile-027-front'else limits[source['cycle']]
                    assert width<=limit and height<=49,('Oversized city',key,width,height)
                    assert abs((l+r)/2-41)<.01,('City not centered horizontally',key,(l+r)/2)
                    city_sizes.append({'key':key,'width':width,'height':height})
                if ident=='rr_adventure'and source['cycle']=='c1':
                    l,t,r,b=ink_bounds(group)
                    assert r-l<=44.01 and b-t<=45.01,('C1 RR lost its smaller original size',key,r-l,b-t)
                if not(key=='c1-tile-027-front'and ident=='city'):
                    # Printed cycles use different canonical optical sizes;
                    # each declared cycle/face variant must still be identical
                    # across every placement of that component.
                    variant=(ident,source['cycle'],source['face'])
                    if variant in components:assert components[variant]==value,('Changed shared component',key,ident)
                    else:components[variant]=value
                if group.get('data-component-kind')=='original-raster-alpha':
                    record,_=verified_record(ident)
                    assert group.get('data-full-source-canvas')==f'{record["width"]} {record["height"]}',(key,ident)
                    totals['originalAlphaInstances']+=1
                else:totals['reusedVectorInstances']+=1
            ident=group.get('data-marker-template')
            if ident:
                # Compare analytic backing only, independent of emblem/type.
                backing=ET.Element('g')
                for child in group:
                    if any(k.startswith('data-backing-')for k in child.attrib):backing.append(deepcopy(child))
                value=normalized(backing)
                if ident in backings:assert backings[ident]==value,('Changed shared backing',key,ident)
                else:backings[ident]=value
            if group.get('data-secret-number'):
                for digit in group.iter():
                    if (digit.get('data-marker-text')or'').isdigit():
                        l,t,r,b=ink_bounds(digit)
                        assert b-t<=22.6,('Oversized secret digit',key,b-t)
                        secret_sizes.append({'key':key,'digit':digit.get('data-marker-text'),'width':r-l,'height':b-t})
        details.append({'key':key,'markers':len(actual),'hiddenGroups':len(hidden)})
    assert totals['markers']==595,totals
    assert totals['hiddenGroups']==11 and totals['hiddenDigitComponents']==44,totals
    assert types['wild_titan']==123 and types['wheel_icon']==2 and types['wheel_icon_winged']==2,types
    assert types['greek_alpha']==36 and types['greek_beta']==40 and types['secret_number_banner']==14,types
    result={'status':'passed','faces':511,'totals':dict(totals),'byType':dict(types),'sharedEmblems':len({key[0]for key in components}),
            'sharedEmblemVariants':len(components),'sharedBackings':len(backings),
            'completeOriginalCanvasesPreserved':True,'mapScreenshotComponentsAllowed':False,'rejectedSimplifiedTrialsUsed':0,
            'citySizes':city_sizes,'secretDigitSizes':secret_sizes,'facesChecked':details}
    (OUT/'component-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in result.items()if k not in('facesChecked','citySizes','secretDigitSizes')}))

if __name__=='__main__':main()
