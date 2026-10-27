"""Compose the complete map-link set from shared semantic vector components."""
import hashlib
import json
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from scipy.ndimage import label,binary_dilation

from map_link_templates import ROOT,SOURCE,NS,plate,arrow,lock_disc,content,palette
from map_link_production import apply_link_vectors
from map_link_vectors import contour,selected_parts,svg
from map_marker_templates import backing

OUT=ROOT/'output/map-link-template-review-20261026'
VERSION='20261027-original-element-links6-layered-land'


def source_geometry():
    return json.loads((SOURCE/'cells.json').read_text(encoding='utf8'))


def load_contents():
    faces={}
    for name in('contents-c1-c2.json','contents-c3-c4.json','contents-c5.json'):
        report=json.loads((SOURCE/name).read_text(encoding='utf8'))
        assert not set(faces)&set(report['faces']),name
        faces.update(report['faces'])
    assert len(faces)==511
    return faces


def place_panel(panel,cells,cycle):
    regular=[(i,c)for i,c in enumerate(cells)if c['type']!='restricted']
    geometries=[c for c in panel['cells']if c['shape']!='circle']
    assert len(regular)==len(geometries),(panel['id'],regular,geometries)
    semantic=[c for i,c in regular]
    roofs=[index for index,c in enumerate(geometries)if c['shape']=='roofed']
    local,size,ident,signature=plate(cycle,panel.get('face','A'),panel['direction'],semantic,roofs)
    w,h=size;l,t,r,b=panel['bodyBox'];roof=17 if roofs else 0
    # No stretching: the fixed body's center aligns with the original body.
    x=(l+r)/2-w/2;y=(t+b)/2-(h-roof)/2-roof
    if panel['direction']=='left':x=l
    elif panel['direction']=='right':x=r-w
    x=round(x*2)/2;y=round(y*2)/2
    body=f'<g data-template-instance="{ident}" transform="translate({x:g} {y:g})">{local}</g>'
    return body,{'template':ident,'bbox':[x,y,x+w,y+h],'geometry':signature}


def category(box,kind,cycle,face,layout,definitions):
    assert cycle=='c3'and layout['kind']==kind
    cx,cy=(box[0]+box[2])/2,(box[1]+box[3])/2;style=definitions['palette']
    scale=1.05;unit_center=41;metric=definitions['glyphMetrics'][kind]
    w,h=metric['size'];dx,dy=metric['offset'];x,y=unit_center+dx/scale,unit_center+dy/scale
    body=backing(layout['tab'],style)
    body+=content({'type':'icon','value':kind},(x-w/scale/2,y-h/scale/2,x+w/scale/2,y+h/scale/2),style['ink'],style['field'],cycle)
    return (f'<g data-category-template="source-disc-tab-84" data-category-kind="{kind}" data-category-tab="{layout["tab"]}" '
            f'data-category-source-bbox="{" ".join(map(str,box))}" transform="translate({cx-unit_center*scale:g} {cy-unit_center*scale:g}) scale({scale:g})">{body}</g>')


def local_arrow_direction(part,rgba):
    l,t,r,b=[int(v)for v in part['bbox']];mask=rgba[t:b,l:r,3]>100
    if r-l>=b-t:return'up'if mask[:max(1,(b-t)//4)].sum()<mask[-max(1,(b-t)//4):].sum()else'down'
    return'left'if mask[:,:max(1,(r-l)//4)].sum()<mask[:,-max(1,(r-l)//4):].sum()else'right'


def build():
    inventory=json.loads((SOURCE/'inventory.json').read_text(encoding='utf8'))
    categories=json.loads((SOURCE/'category-layouts.json').read_text(encoding='utf8'))
    geometry={r['key']:r for r in source_geometry()['faces']};contents=load_contents()
    backup=json.loads((ROOT/'official-assets/_backups/map-links-20261025/manifest.json').read_text(encoding='utf8'))
    saved={(r['key'],r['kind']):r for r in backup['files']if r.get('key')}
    production={'version':VERSION,'method':'shared-fixed-elements','faces':{},'templates':{}}
    inputs=[SOURCE/name for name in('inventory.json','cells.json','contents-c1-c2.json','contents-c3-c4.json','contents-c5.json','category-layouts.json','c2-route-source-metrics.json')]
    inputs+=[ROOT/'tools'/name for name in('map_link_templates.py','map_link_build.py','map_marker_templates.py','map_original_components.py')]
    for directory in(SOURCE/'components',SOURCE/'glyphs',ROOT/'tools/map-back-vector-source'):
        inputs+=sorted(directory.glob('*.svg'))
    inputs+=[ROOT/'tools/map-marker-vector-source/original-components/manifest.json']
    inputs+=sorted((ROOT/'tools/map-marker-vector-source/original-components').glob('*.png'))
    production['inputSha256']={str(path.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(path.read_bytes()).hexdigest()for path in inputs}
    dest=SOURCE/'production';dest.mkdir(exist_ok=True)
    staged=OUT/'staged';staged.mkdir(parents=True,exist_ok=True);records=[]
    for source_row in inventory['faces']:
        key=source_row['key'];row=geometry[key];schema=contents[key]
        source=ROOT/saved[key,'original-raster-overlay']['backup']
        assert hashlib.sha256(source.read_bytes()).hexdigest()==source_row['sourceSha256'],key
        rgba=np.asarray(Image.open(source).convert('RGBA'));labels,_=label(rgba[:,:,3]>100)
        groups=[];panels=[];arrow_parts=list(source_row['arrows'])
        assert set(schema['panels'])=={p['id']for p in row['panels']},key
        for panel in row['panels']:
            panel={**panel,'face':row['face']};semantic=schema['panels'][panel['id']];cells=semantic['cells']
            assert len(cells)==len(panel['cells']),(key,panel['id'],len(cells),len(panel['cells']))
            body,record=place_panel(panel,cells,row['cycle'])
            production['templates'][record['template']]=record['geometry']
            for index,cell in enumerate(cells):
                if cell['type']=='restricted':
                    geom=panel['cells'][index];assert geom['shape']=='circle',(key,panel['id'],index,geom)
                    body+=lock_disc(geom['bbox'],row['cycle'],row['face'])
            extras=semantic.get('attachedExtras')
            if extras is None:
                assert row['cycle']!='c3' or not panel['attachedExtras'],(key,panel['id'])
                extras=[{'type':'restricted','value':'lock','sourceBBox':part['bbox']}for part in panel['attachedExtras']]
            assert len(extras)==len(panel['attachedExtras']),(key,panel['id'],extras,panel['attachedExtras'])
            for index,extra in enumerate(extras):
                bbox=extra.get('sourceBBox',extra.get('bbox',panel['attachedExtras'][index]['bbox']))
                graphic=lock_disc(bbox,row['cycle'],row['face'])if extra['type']=='restricted'else category(bbox,extra['value'],row['cycle'],row['face'],categories['instances'][f'{key}:{panel["id"]}:{index}'],categories)
                body+=f'<g data-extra="{panel["id"]}-{index+1}" data-kind="{extra["type"]}" data-value="{extra["value"]}">{graphic}</g>'
            groups.append(f'<g data-panel="{panel["id"]}" data-direction="{panel["direction"]}" data-source-bbox="{" ".join(map(str,panel["bbox"]))}">{body}</g>')
            panels.append({'id':panel['id'],'direction':panel['direction'],'cells':cells,'extras':extras,**record})
            arrow_parts.extend({**part,'id':panel['id']+'-embedded-arrow'}for part in panel.get('embeddedArrows',[]))
        for part in arrow_parts:
            direction=part['direction']if part['direction']in('up','down','left','right')else local_arrow_direction(part,rgba)
            groups.append(arrow(part['bbox'],direction,row['cycle'],row['face']))
        # Pixel contours are used only in the invisible erase mask. Visible
        # artwork comes exclusively from the fixed semantic component library.
        selected=np.zeros((1024,1024),bool)
        for part,kind,direction,ident in selected_parts(source_row):selected|=labels==part['componentLabel']
        protected=(rgba[:,:,3]>100)&~selected
        cleanup=binary_dilation(selected,iterations=3)&~binary_dilation(protected,iterations=1)
        mask=contour(cleanup,tolerance=0,min_area=0)
        path=dest/f'{key}.svg';path.write_text(svg(''.join(groups)),encoding='utf8');pure=ET.parse(path).getroot()
        assert not any(node.get('data-content-method')=='source-ink'for node in pure.iter()),key
        production['faces'][key]={'vector':f'production/{key}.svg','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                                  'maskPath':mask,'sourceSha256':source_row['sourceSha256'],'panels':len(panels),'arrows':len(arrow_parts),
                                  'templates':[p['template']for p in panels]}
        before=ROOT/saved[key,'pre-install-vector-overlay']['backup']
        assert hashlib.sha256(before.read_bytes()).hexdigest()==saved[key,'pre-install-vector-overlay']['sha256'],key
        root=ET.parse(before).getroot();apply_link_vectors(root,key,production)
        target=staged/f'{key}-corners.svg';ET.ElementTree(root).write(target,encoding='unicode')
        records.append({'key':key,'cycle':row['cycle'],'face':row['face'],'panels':panels,
                        'source':str(source.relative_to(ROOT)).replace('\\','/'),'before':str(before.relative_to(ROOT)).replace('\\','/'),
                        'stagedBytes':target.stat().st_size})
        if len(records)%100==0:print(f'Composed {len(records)} / 511',flush=True)
    summary={'faces':len(records),'panels':sum(r['panels']for r in production['faces'].values()),
             'arrows':sum(r['arrows']for r in production['faces'].values()),'sharedLayouts':len(production['templates']),
             'visibleSourceContours':0,'runtimeFilesModified':0,'maximumOverlayBytes':max(r['stagedBytes']for r in records)}
    assert summary['faces']==511 and summary['panels']==1575
    for name,expected in production['inputSha256'].items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,f'Component changed during build: {name}'
    (SOURCE/'production.json').write_text(json.dumps(production,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'build-report.json').write_text(json.dumps({'version':VERSION,'summary':summary,'faces':records},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(summary))
