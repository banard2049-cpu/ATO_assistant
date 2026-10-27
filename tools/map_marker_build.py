"""Prepare non-link marker composition without installing runtime artwork.

Usage: python -B tools/map_marker_build.py
       python -B tools/map_marker_build.py --components path/to/approved.json

The default component set is the five existing reused SVGs plus explicitly
manifested original alpha PNGs. Rejected redraw trials are never searched.
"""
from __future__ import annotations
from collections import Counter,defaultdict
from copy import deepcopy
import argparse,hashlib,json
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label

from map_marker_templates import ROOT,NS,svg,round_marker,secret_banner,city_nameplate,hidden_numbers,pending
from map_link_vectors import contour

SOURCE=ROOT/'tools/map-marker-vector-source'
OUT=ROOT/'output/map-marker-hd-review-20261026/composition'
BANNERS={
 'c1-tile-019-front':'*1*6','c1-tile-030-front':'*4*7','c1-tile-053-front':'*3*8','c1-tile-068-front':'*9*0',
 'c2-tile-051-front':'*3*2','c2-tile-052-front':'*4*7','c2-tile-054-front':'*1*5','c2-tile-055-front':'*9*0',
 'c5-tile-002-front':'*4*7','c5-tile-023-front':'*1*7','c5-tile-039-front':'*3*0',
 'c5-tile-053-front':'*5*5','c5-tile-060-front':'*7*3','c5-tile-071-front':'*9*2',
}
REUSED=('central_adventure','wild_titan','rr_adventure','city','frozen_time')
VERSION='20261027-fixed-marker-components6-layered-land'
CITY_BOXES={'c1-A':[-20.5,-20,20.5,18],'c2-A':[-25,-25,25,21],
            'c3-A':[-25,-25,25,21.5],'c4-A':[-23.5,-23,23.5,21],
            'c5-A':[-23,-21.5,23,20.5],'c5-B':[-25,-21.5,25,24.5]}


def load(path):return json.loads(Path(path).read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def rgb_hex(rgb):return'#'+''.join(f'{int(round(v)):02x}'for v in rgb)


def dominant(pixels):
    if not len(pixels):raise ValueError('No pixels for palette measurement')
    bins=np.round(pixels/10).astype(int);unique,counts=np.unique(bins,axis=0,return_counts=True)
    chosen=unique[counts.argmax()];mask=(bins==chosen).all(1)
    return np.median(pixels[mask],axis=0)


def measure_stamp(rgba,labels,mark):
    l,t,r,b=mark['bbox'];crop=rgba[t:b,l:r];mask=labels[t:b,l:r]==mark['componentLabel'];h,w=mask.shape
    size=max(4,round(min(w,h)*.18))
    corners=[mask[:size,:size].mean(),mask[:size,-size:].mean(),mask[-size:,-size:].mean(),mask[-size:,:size].mean()]
    tabs=[name for name,rate in zip(('TL','TR','BR','BL'),corners)if rate>.5]
    assert len(tabs)<=1,(mark,tabs)
    yy,xx=np.indices((h,w));radius=min(w,h)/2;distance=np.hypot(xx-(w-1)/2,yy-(h-1)/2)
    rgb=crop[:,:,:3].astype(float);lum=rgb@np.array([.299,.587,.114]);opaque=crop[:,:,3]>220
    rim=dominant(rgb[(distance>radius*.87)&(distance<radius*.95)&opaque&mask])
    field_pixels=rgb[(distance>radius*.56)&(distance<radius*.77)&opaque&mask]
    kind=mark['type']
    dark=kind in('greek_alpha','greek_beta')or mark.get('cycle')=='c1'or mark.get('underwater',False)
    light=not dark
    field_lum=field_pixels@np.array([.299,.587,.114])
    compatible=field_pixels[(field_lum>160)if light else(field_lum<130)]
    field=np.median(compatible if len(compatible)else field_pixels,axis=0)
    core=(distance<radius*.84)&opaque&mask
    ink_mask=core&((lum<100)if light else(lum>170))
    labs,n=label(ink_mask);sizes=np.bincount(labs.ravel());sizes[0]=0
    keep=[]
    for ident in np.flatnonzero(sizes>=5):
        # Light rim fragments at the edge of a dark C1 disc are not part of
        # the emblem. Genuine emblem components reach the central field.
        if distance[labs==ident].min()<radius*.70:keep.append(ident)
    ink_mask=np.isin(labs,keep)
    ink=dominant(rgb[ink_mask])if ink_mask.any()else np.array([30,30,30]if light else[245,242,232])
    yy,xx=np.where(ink_mask)
    ink_bounds=None
    if len(xx):ink_bounds=[float(xx.min()-(w-1)/2),float(yy.min()-(h-1)/2),float(xx.max()+1-(w-1)/2),float(yy.max()+1-(h-1)/2)]
    return {'tab':tabs[0]if tabs else'none','tabEvidence':[round(float(v),5)for v in corners],
            'style':'light-field'if light else'dark-field','rim':rim.tolist(),'field':field.tolist(),'ink':ink.tolist(),'inkBoundsFromCenter':ink_bounds}


def approved_components(extra=None):
    """Resolve explicit sources only; no redraw/ directory fallback exists."""
    records={name:{'id':name,'kind':'reused-vector','file':str((SOURCE/'reuse'/f'{name}.svg').relative_to(ROOT)).replace('\\','/')}for name in REUSED}
    originals=SOURCE/'original-components/manifest.json'
    if originals.exists():records.update(load(originals)['components'])
    if extra:
        additions=load(extra).get('components')
        assert isinstance(additions,dict),'Approved component manifest must contain an ID-keyed components dictionary'
        for ident,record in additions.items():
            assert record.get('approvedForComposition')is True,ident
            assert record.get('kind')in('approved-vector','original-raster-alpha'),ident
            records[ident]=record
    for ident,record in records.items():
        path=ROOT/record['file'];assert path.is_file(),(ident,path)
        assert '/redraw/'not in str(path).replace('\\','/'),f'Rejected trial path is not approved input: {ident}'
        if record.get('sha256'):assert sha(path)==record['sha256'],ident
    return records


def build_layouts(inventory):
    faces=[];palette_samples=defaultdict(lambda:defaultdict(list));content_sizes=defaultdict(list);variant_sizes=defaultdict(list)
    hidden_inks=load(SOURCE/'hidden-number-colors.json')['records']
    hidden_inks={(r['key'],r['groupIndex']):r for r in hidden_inks}
    assert len(hidden_inks)==11
    for row in inventory['faces']:
        path=ROOT/row['source'];assert sha(path)==row['sourceSha256'];rgba=np.asarray(Image.open(path).convert('RGBA'));labels,_=label(rgba[:,:,3]>100)
        entries=[]
        for mark in row['markers']:
            kind=mark['type']
            if kind=='hidden_number_digit':continue
            l,t,r,b=mark['bbox'];center=[(l+r)/2,(t+b)/2]
            meta={'id':f'{row["key"]}--{mark["componentLabel"]}','type':kind,'sourceBBox':mark['bbox'],
                  'componentLabel':mark['componentLabel'],'center':center}
            if kind=='secret_number_banner':
                pid=f'{row["cycle"]}-secret-banner'
                meta.update(text=BANNERS[row['key']],layoutId='secret-banner-138x50',paletteId=pid)
                crop=rgba[t:b,l:r];yy,xx=np.indices(crop.shape[:2]);rgb=crop[:,:,:3].astype(float);lum=rgb@np.array([.299,.587,.114])
                eligible=(xx>18)&(xx<r-l-18)&(yy>9)&(yy<36)&(crop[:,:,3]>220)
                field=rgb[eligible&(lum<150)];ink=rgb[eligible&(lum>190)]
                palette_samples[pid]['field'].append(np.median(field,axis=0));palette_samples[pid]['rim'].append(np.median(ink,axis=0));palette_samples[pid]['ink'].append(np.median(ink,axis=0))
            elif kind=='city_nameplate':
                meta.update(text='克诺索斯KNOSSOS',layoutId='city-nameplate-311x136',paletteId='knossos-nameplate')
            else:
                scallop=row['cycle']=='c5'and row['face']=='A'and kind=='city'
                measured=measure_stamp(rgba,labels,{**mark,'cycle':row['cycle'],'underwater':scallop})
                suffix='-underwater'if scallop else'-greek'if kind.startswith('greek_')else'-silver'if kind=='silver_ruin'else''
                pid=f'{row["cycle"]}-{row["face"]}-{measured["style"]}'+suffix
                for key in('rim','field','ink'):palette_samples[pid][key].append(measured[key])
                meta.update(tab=measured['tab'],tabEvidence=measured['tabEvidence'],scalloped=scallop,paletteId=pid,
                            layoutId='round-82-'+measured['tab']+('-scallop11'if scallop else'-circle'))
                if kind=='wheel_icon':meta['variantId']='wheel_icon_winged'if row['key'].split('-')[2]in('062','071')else'wheel_icon'
                bound=measured['inkBoundsFromCenter']
                if bound:
                    content_sizes[meta.get('variantId',kind)].append(bound)
                    variant_sizes[(row['cycle'],row['face'],meta.get('variantId',kind))].append(bound)
            entries.append(meta)
        numbers=deepcopy(row.get('hiddenNumberGroups',[]))
        for index,number in enumerate(numbers):
            ink=hidden_inks[(row['key'],index)]
            assert ink['sourceSha256']==row['sourceSha256']and ink['text']==number['text'],row['key']
            assert ink['previousSpecColor']==number['color'],row['key']
            number['color']=ink['color']
        faces.append({'key':row['key'],'cycle':row['cycle'],'face':row['face'],'source':row['source'],'sourceSha256':row['sourceSha256'],
                      'markers':entries,'hiddenNumbers':numbers,
                      'hiddenSourceComponents':[m['componentLabel']for m in row['markers']+row.get('smallComponents',[])if m['type']=='hidden_number_digit'],
                      'speckles':[m for m in row.get('smallComponents',[])if m['type']=='antialias_speckle']})
    palettes={pid:{key:rgb_hex(np.median(values,axis=0))for key,values in sample.items()}for pid,sample in palette_samples.items()}
    palettes['knossos-nameplate']={'rim':'#eeeade','field':'#17252b','ink':'#f5f1e5'}
    optical={}
    for key,values in variant_sizes.items():
        bounds=np.median(values,axis=0)
        if key[2]=='city':bounds=np.array(CITY_BOXES[key[0]+'-'+key[1]])
        elif key[2]=='wild_titan':
            # Keep the printed cycle size differences, but enlarge each
            # canonical emblem 6% and center its actual ink in the disc.
            width,height=(bounds[2:]-bounds[:2])*1.06
            bounds=np.array([-width/2,-height/2,width/2,height/2])
        elif key[0]=='c1'and key[2]=='rr_adventure':bounds=np.array([-21,-18.5,23,26.5])
        elif key[2]=='silver_ruin':bounds=np.array([-23.5,-23,23.5,23])
        elif key[2]=='oasis':bounds=np.array([-28,-19,28,31])
        elif key[2]=='daedalus_lighthouse':bounds=np.array([-21.5,-32,21.5,32])
        elif key[2]=='staff_icon':bounds=np.array([-18.5,-22,23.5,16])
        elif key[2]=='spartan_stronghold':bounds=np.array([-32.5,-33,34.5,34])
        elif key[2]=='greek_alpha':bounds=np.array([-11.5,-9,13.5,13])
        elif key[2]=='greek_beta':bounds=np.array([-10.5,-21,12.5,24])
        optical[':'.join(key)]=[round(float(v+41)*2)/2 for v in bounds]
    for row in faces:
        for mark in row['markers']:
            ident=':'.join((row['cycle'],row['face'],mark.get('variantId',mark['type'])))
            if ident in optical:mark['contentBox']=optical[ident];mark['opticalVariant']=ident
    metrics={ident:{'medianSourceInkBoundsFromCenter':np.median(values,axis=0).tolist(),'instances':len(values),
                    'sourceRole':'measure original glyph bounds for later optical calibration only, never emitted as artwork'}for ident,values in content_sizes.items()}
    counts=Counter(meta['layoutId']for row in faces for meta in row['markers'])
    summary={'faces':len(faces),'roundMarkers':sum(len([m for m in row['markers']if m['layoutId'].startswith('round-')])for row in faces),
             'cityNameplates':sum(m['type']=='city_nameplate'for row in faces for m in row['markers']),
             'secretNumberBanners':sum(m['type']=='secret_number_banner'for row in faces for m in row['markers']),
             'hiddenNumberGroups':sum(len(row['hiddenNumbers'])for row in faces),'distinctBackingLayouts':len(counts),'byLayout':dict(counts)}
    assert summary['faces']==511 and summary['roundMarkers']==580 and summary['cityNameplates']==1 and summary['secretNumberBanners']==14 and summary['hiddenNumberGroups']==11
    return {'version':'20261026-marker-backings1','installation':'none','summary':summary,
            'policy':'Fixed analytic backings and explicit existing emblems. Source alpha is used for classification/erase masks only. Rejected trial emblems are never loaded.',
            'palettes':palettes,'contentMeasurements':metrics,'opticalVariants':optical,'scallopEvidence':'Seven C5-A city inner fields, regular 11-lobe fixed geometry.',
            'faces':faces}


def compose_face(row,layout,components):
    groups=[];drawn=[];waiting=[]
    for meta in row['markers']:
        palette=layout['palettes'][meta['paletteId']];kind=meta['type'];ident=meta.get('variantId',kind);record=components.get(ident)
        path=ROOT/record['file']if record else None
        if kind=='secret_number_banner':body=secret_banner(meta,palette)
        elif kind=='city_nameplate':body=city_nameplate(meta,palette,ROOT/components['city']['file'])
        else:body=round_marker(meta,palette,path)
        if body is None:
            waiting.append(meta);groups.append(pending(meta));continue
        drawn.append(meta);groups.append(f'<g data-marker-instance="{meta["id"]}">{body}</g>')
    if row['hiddenNumbers']:groups.append(hidden_numbers(row['hiddenNumbers']))
    return ''.join(groups),drawn,waiting


def stage_face(row,body,drawn,waiting,directory,base_overlays,complete=False):
    current=base_overlays/f'{row["key"]}-corners.svg';root=ET.parse(current).getroot()
    # Existing link/corner groups remain untouched. Replaying this stage simply
    # replaces its own independent cut and layer, never nesting/flattening them.
    keep=next(node for node in root.iter(f'{{{NS}}}mask')if node.get('id')=='keep')
    for node in list(keep):
        if node.get('data-remove')=='remaining-markers':keep.remove(node)
    for node in list(root):
        if node.get('data-map-markers')=='true':root.remove(node)
    if complete:
        assert not waiting
        # Every semantic item has its own generated group. Suppress the whole
        # old scan so no antialiased scan fragment can remain visible.
        d='M0 0H1024V1024H0Z'
    else:
        rgba=np.asarray(Image.open(ROOT/row['source']).convert('RGBA'));labels,_=label(rgba[:,:,3]>100)
        selected=np.isin(labels,[m['componentLabel']for m in drawn]+row['hiddenSourceComponents']+[m['componentLabel']for m in row['speckles']])
        from scipy.ndimage import binary_dilation
        protected=(rgba[:,:,3]>100)&~selected
        cleanup=binary_dilation(selected,iterations=3)&~binary_dilation(protected,iterations=1)
        d=contour(cleanup,tolerance=0,min_area=0)
    ET.SubElement(keep,f'{{{NS}}}path',{'data-remove':'remaining-markers','d':d,'fill':'black','fill-rule':'evenodd'})
    attributes={'data-map-markers':'true','data-version':VERSION,'data-pending':str(len(waiting))}
    if not complete:attributes['data-preview-only']='true'
    group=ET.SubElement(root,f'{{{NS}}}g',attributes)
    group.extend(list(ET.fromstring(svg(body))))
    target=directory/f'{row["key"]}-corners.svg';ET.ElementTree(root).write(target,encoding='unicode')
    return target,d


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--components',type=Path,help='Additional explicitly approved component manifest')
    parser.add_argument('--only',action='append',help='Preview only the named face(s), while still classifying all 511')
    parser.add_argument('--base-overlays',type=Path,default=ROOT/'map/images/hd1024/overlay')
    parser.add_argument('--require-complete',action='store_true',help='Stage final production only when every exact original component exists')
    args=parser.parse_args(argv);OUT.mkdir(parents=True,exist_ok=True)
    assert not(args.require_complete and args.only),'Final production must cover all 511 faces'
    inventory=load(SOURCE/'inventory.json');layout=build_layouts(inventory);components=approved_components(args.components)
    if args.require_complete:
        required={'hourglass_icon','staff_icon','spartan_stronghold','daedalus_lighthouse','wheel_icon','wheel_icon_winged','oasis','smoking_bowl_icon','silver_ruin','city',
                  'time_wound','time_portal','time_portal_angular'}
        assert required<=set(components),f'Missing exact originals: {required-set(components)}'
        assert all(components[k]['kind']=='original-raster-alpha'for k in required)
    (SOURCE/'backing-layouts.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'backing-layouts.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    pure=OUT/'elements';staged=OUT/'staged';pure.mkdir(exist_ok=True);staged.mkdir(exist_ok=True)
    reports=[];production={'version':VERSION,'method':'shared-fixed-elements','fullSemanticCoverage':bool(args.require_complete),'faces':{}}
    destination=SOURCE/'production'
    if args.require_complete:destination.mkdir(exist_ok=True)
    for row in layout['faces']:
        if args.only and row['key']not in args.only:continue
        body,drawn,waiting=compose_face(row,layout,components)
        if args.require_complete:assert not waiting,row['key']
        target=pure/f'{row["key"]}.svg';target.write_text(svg(body),encoding='utf8')
        composite,mask_path=stage_face(row,body,drawn,waiting,staged,args.base_overlays,args.require_complete)
        if args.require_complete:
            vector=destination/target.name;vector.write_bytes(target.read_bytes())
            production['faces'][row['key']]={'vector':'production/'+target.name,'sha256':sha(vector),'maskPath':mask_path,'sourceSha256':row['sourceSha256'],
                                           'markers':len(drawn),'hiddenNumbers':len(row['hiddenNumbers']),'pending':0}
        reports.append({'key':row['key'],'drawnMarkers':len(drawn),'pending':len(waiting),'pendingIds':[m.get('variantId',m['type'])for m in waiting],
                        'pure':str(target.relative_to(ROOT)).replace('\\','/'),'composite':str(composite.relative_to(ROOT)).replace('\\','/'),
                        'retainedPendingSource':bool(waiting),'bytes':composite.stat().st_size})
        if len(reports)%100==0:print(f'Prepared {len(reports)} preview faces',flush=True)
    summary={'facesClassified':511,'facesPreviewed':len(reports),'markersDrawn':sum(r['drawnMarkers']for r in reports),
             'pendingEmblems':sum(r['pending']for r in reports),'pendingTypes':dict(Counter(x for r in reports for x in r['pendingIds'])),
             'runtimeFilesModified':0,'rejectedTrialComponentsUsed':0,'defaultEmblems':list(components)}
    if args.require_complete:
        inputs=[SOURCE/n for n in('inventory.json','backing-layouts.json','hidden-number-colors.json','original-components/manifest.json')]
        inputs+=[ROOT/'tools'/n for n in('map_marker_templates.py','map_marker_build.py','map_original_components.py','map_marker_production.py')]
        inputs+=list({ROOT/r['file']for r in components.values()})
        production['inputSha256']={p.relative_to(ROOT).as_posix():sha(p)for p in inputs}
        production['fontSha256']={p:sha(Path(p))for p in('C:/Windows/Fonts/times.ttf','C:/Windows/Fonts/simsun.ttc')}
        assert len(production['faces'])==511
        (SOURCE/'production.json').write_text(json.dumps(production,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    report={'status':'complete-staged-awaiting-validation'if args.require_complete else'preview-with-explicit-pending'if summary['pendingEmblems']else'preview-complete-awaiting-validation',
            'baseOverlays':str(args.base_overlays.resolve().relative_to(ROOT)).replace('\\','/'),'fullSemanticCoverage':bool(args.require_complete),
            'summary':summary,'components':components,'faces':reports}
    (OUT/'composition-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>其余标记：元素组合预览</title><style>body{font:15px system-ui;background:#22353b;color:#eff2e9}img{width:100%}article{display:inline-block;width:480px;vertical-align:top;padding:12px}p{max-width:1100px}</style><h1>固定底座与原版图案组合</h1><p>预览未安装。粉色虚框表示缺少已批准高清原版图案；保留原图供识别，不使用被否决的简化稿充数。所有新组件均由固定底座、独立图案与字体组合。</p>'+''.join(f'<article><h2>{r["key"]}</h2><p>等待 {r["pending"]} 个：{" / ".join(r["pendingIds"])}</p><img loading="lazy" src="staged/{r["key"]}-corners.svg"></article>'for r in reports),encoding='utf8')
    print(json.dumps(summary,ensure_ascii=False))
    return report


if __name__=='__main__':main()
