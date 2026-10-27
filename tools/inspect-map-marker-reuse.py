"""Inventory non-corner/non-link map symbols and consolidate reusable artwork.

Scans are reference-only. This tool never traces them or modifies runtime maps.
"""
from __future__ import annotations
from collections import Counter
import hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label,find_objects
from scipy.ndimage import distance_transform_edt
from scipy.optimize import linear_sum_assignment

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-marker-vector-source'
OUT=ROOT/'output/map-marker-vector-review-20261026'

def load(p):return json.loads((ROOT/p).read_text(encoding='utf-8'))
def read_js(p):
    text=(ROOT/p).read_text(encoding='utf-8-sig');return json.loads(text[text.index('{'):text.rindex('}')+1])

def main():
    SOURCE.mkdir(exist_ok=True);OUT.mkdir(exist_ok=True)
    links=load('tools/map-link-vector-source/inventory.json')
    corner={r['key']:r for r in load('tools/map-corner-vector-source/inventory.json')['faces']}
    headings=read_js('map/c5-heading-data.js')
    rows=[];small=Counter()
    hidden=load('tools/map-hidden-number-regions.json')['tiles']
    for row in links['faces']:
        key=row['key'];record=corner[key]
        path=ROOT/'official-assets/_backups/map-links-20261025/originals/map/images/hd1024/overlay'/f'{key}.png'
        assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sourceSha256']
        rgba=np.asarray(Image.open(path).convert('RGBA'));labels,n=label(rgba[:,:,3]>100)
        assigned={p['componentLabel']for p in row['panels']}|{a['componentLabel']for a in row['arrows']}|{e['componentLabel']for p in row['panels']for e in p['attachedExtras']}
        excludes=[c['bbox']for side,c in record['corners'].items()if c.get('bbox')and((side=='left'and record['left']!='-')or(side=='right'and record['factions']))]
        if row['cycle']=='c5':excludes.append(headings[key]['header'])
        remaining=[];fragments=[]
        for ident,slices in enumerate(find_objects(labels),1):
            if slices is None or ident in assigned:continue
            ys,xs=slices;count=int(np.count_nonzero(labels[slices]==ident));l,t,r,b=xs.start,ys.start,xs.stop,ys.stop
            if any(max(0,min(r,er)-max(l,el))*max(0,min(b,eb)-max(t,et))>.5*(r-l)*(b-t)for el,et,er,eb in excludes):continue
            if count<150:
                small['components']+=1;small['pixels']+=count
                fragments.append({'componentLabel':ident,'bbox':[l,t,r,b],'pixels':count,
                                  'type':'antialias_speckle'if count<=3 else'hidden_number_digit'})
                continue
            remaining.append({'componentLabel':ident,'bbox':[l,t,r,b],'pixels':count})
        rows.append({'key':key,'cycle':row['cycle'],'face':row.get('face'),'source':path.relative_to(ROOT).as_posix(),'sourceSha256':row['sourceSha256'],'markers':remaining,'smallComponents':fragments,
                     'hiddenNumberGroups':hidden.get(key,{}).get('numbers',[])})
    classify(rows)
    report={'version':'20261026-map-remaining-markers1','purpose':'Inventory only; scans used as reference, no tracing and no runtime changes.',
            'summary':{'faces':len(rows),'largeComponents':sum(len(r['markers'])for r in rows),'allRemainingComponents':sum(len(r['markers'])+len(r['smallComponents'])for r in rows),
                       'byCycle':dict(Counter(r['cycle']for r in rows for m in r['markers'])),
                       'smallComponents':dict(small),'smallHiddenNumberDigits':sum(m['type']=='hidden_number_digit'for r in rows for m in r['smallComponents']),
                       'antialiasSpeckles':sum(m['type']=='antialias_speckle'for r in rows for m in r['smallComponents']),
                       'hiddenNumberGroups':sum(len(r['hiddenNumberGroups'])for r in rows)},'faces':rows}
    report['summary']['byClass']=dict(Counter(m['type']for r in rows for m in r['markers']))
    (SOURCE/'inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    atlas(rows)
    print(json.dumps(report['summary']))


EXEMPLARS={
 'rr_adventure':('c1-tile-001-front',1),
 'wild_titan':('c1-tile-002-front',1),
 'city':('c1-tile-003-front',3),
 'central_adventure':('c1-tile-004-front',1),
 'hourglass_icon':('c1-tile-007-front',1),
 'staff_icon':('c1-tile-067-front',3),
 'spartan_stronghold':('c2-tile-011-front',3),
 'frozen_time':('c3-tile-007-front',4),
 'daedalus_lighthouse':('c3-tile-005-front',3),
 'wheel_icon':('c3-tile-062-front',1),
 'oasis':('c4-tile-006-front',6),
 'smoking_bowl_icon':('c4-tile-003-front',6),
 'silver_ruin':('c5-tile-004-front',2),
 'greek_alpha':('c1-tile-010-front',3),
 'greek_beta':('c1-tile-010-front',10),
}

def marker_mask(im):
    rgb=np.asarray(im.convert('RGBA'));h,w=rgb.shape[:2]
    lum=rgb[:,:,:3].astype(float)@np.array([.299,.587,.114]);yy,xx=np.indices((h,w))
    radius=min(h,w)/2;dist=((xx-(w-1)/2)**2+(yy-(h-1)/2)**2)**.5
    annulus=(dist>radius*.67)&(dist<radius*.82)&(rgb[:,:,3]>140)
    background=float(np.median(lum[annulus]))if annulus.any()else 180
    mask=((lum<118)if background>130 else(lum>170))&(rgb[:,:,3]>140)&(dist<radius*.80)
    labs,_=label(mask);sizes=np.bincount(labs.ravel());sizes[0]=0
    mask=np.isin(labs,np.flatnonzero(sizes>=5))
    yy,xx=np.where(mask)
    if not len(xx):return np.zeros((64,64),bool)
    box=(int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1)
    im=Image.fromarray(mask.astype(np.uint8)*255).crop(box)
    im.thumbnail((58,58),Image.Resampling.LANCZOS)
    canvas=Image.new('L',(64,64));canvas.paste(im,((64-im.width)//2,(64-im.height)//2))
    return np.asarray(canvas)>100

def greek_mask(im):
    rgba=np.asarray(im.convert('RGBA'));h,w=rgba.shape[:2]
    lum=rgba[:,:,:3].astype(float)@np.array([.299,.587,.114])
    labs,n=label((lum>170)&(rgba[:,:,3]>140));candidates=[]
    for ident,sl in enumerate(find_objects(labs),1):
        if sl is None:continue
        ys,xs=sl;pixels=int(np.count_nonzero(labs[sl]==ident))
        if pixels<15 or xs.stop-xs.start>w*.82 or ys.stop-ys.start>h*.82:continue
        distance=abs((xs.start+xs.stop)/2-w/2)+abs((ys.start+ys.stop)/2-h/2)
        if distance>min(w,h)*.3:continue
        candidates.append((pixels,ident,xs,ys))
    if not candidates:return marker_mask(im)
    _,ident,xs,ys=max(candidates)
    mask=labs[ys,xs]==ident;im=Image.fromarray(mask.astype(np.uint8)*255)
    im.thumbnail((58,58),Image.Resampling.LANCZOS)
    canvas=Image.new('L',(64,64));canvas.paste(im,((64-im.width)//2,(64-im.height)//2))
    return np.asarray(canvas)>100

def similarity(a,b):
    union=np.count_nonzero(a|b)
    if not union:return 0
    iou=np.count_nonzero(a&b)/union
    da=distance_transform_edt(~a);db=distance_transform_edt(~b)
    d=(float(da[b].mean())+float(db[a].mean()))/2 if a.any()and b.any()else 30
    return float(.6*iou+.4*np.exp(-d/2.5))

def classify(rows):
    lookup={r['key']:r for r in rows};templates={}
    for kind,(key,ident)in EXEMPLARS.items():
        row=lookup[key];m=next(m for m in row['markers']if m['componentLabel']==ident)
        templates[kind]=[(greek_mask if kind.startswith('greek_')else marker_mask)(Image.open(ROOT/row['source']).crop(m['bbox']))]
    for kind,key,ident in [('wild_titan','c3-tile-001-front',5),('city','c2-tile-001-front',3),('central_adventure','c3-tile-001-front',3),('rr_adventure','c3-tile-002-front',3),('city','c5-tile-003-front',5)]:
        row=lookup[key];m=next(m for m in row['markers']if m['componentLabel']==ident)
        templates[kind].append(marker_mask(Image.open(ROOT/row['source']).crop(m['bbox'])))
    fixture=load('tests/fixtures/map-tile-icon-audit.json')['tagGroups']
    for row in rows:
        key=row['key'];number=key.split('-')[2]
        group='c1-alt'if'-alt-'in key else('c5-'+row['face']if row['cycle']=='c5'else row['cycle'])
        expected=[kind for kind,ids in fixture[group].items()if number in ids and kind not in('river','restricted','time_portal','time_wound','resistance_hideout','underwater_city')]
        row['expectedOwnMarkerTypes']=expected
        image=Image.open(ROOT/row['source']).convert('RGBA')
        candidates=[]
        for m in row['markers']:
            l,t,r,b=m['bbox'];w,h=r-l,b-t
            if w>250:
                m.update(type='city_nameplate',method='source-layout',confidence=1);continue
            if w/h>1.8 and w>100:
                m.update(type='secret_number_banner',method='source-layout',confidence=1);continue
            if min(w,h)<50:
                m.update(type='hidden_number_digit',method='existing-hidden-number-regions-and-source-layout',confidence=1);continue
            mask=marker_mask(image.crop(m['bbox']))
            gmask=greek_mask(image.crop(m['bbox']))
            scores=sorted(((max(similarity(gmask if kind.startswith('greek_')else mask,v)for v in vv),kind)for kind,vv in templates.items()),reverse=True)
            allowed=[(s,kind)for s,kind in scores if kind in expected or kind.startswith('greek_')]
            best=allowed[0]if allowed else scores[0]
            m.update(type=best[1],method='source-template-and-existing-audit',confidence=round(best[0],5),
                     sourceBestType=scores[0][1],sourceBestScore=round(scores[0][0],5),
                     sourceCandidates=[{'type':k,'score':round(s,5)}for s,k in scores[:3]])
            candidates.append((m,dict((k,s)for s,k in scores)))
        # Existing full-card visual audit supplies the set of own printed
        # categories; match them one-to-one to the actual remaining components.
        # Greek route discs are extra components, not current-tile attributes.
        assigned_types=[m['type']for m in row['markers']if m['type']=='city_nameplate']
        required=[kind for kind in expected if not(kind=='city'and assigned_types)]
        if candidates and required:
            scores=np.array([[score[kind]for kind in required]for m,score in candidates])
            ii,jj=linear_sum_assignment(-scores)
            assigned=set()
            for i,j in zip(ii,jj):
                m,score=candidates[i];kind=required[j]
                m.update(type=kind,confidence=round(score[kind],5),method='source-template-and-one-to-one-existing-audit')
                assigned.add(i)
            for i,(m,score)in enumerate(candidates):
                if i not in assigned:
                    kind=max(('greek_alpha','greek_beta'),key=score.get)
                    m.update(type=kind,confidence=round(score[kind],5),method='source-greek-disc-template')
        row['missingExpectedTypes']=[kind for kind in expected if kind not in[m['type']for m in row['markers']]and not(kind=='city'and any(m['type']=='city_nameplate'for m in row['markers']))]
        for m in row['markers']:
            m['sourceAndAuditDisagree']=m.get('sourceBestType',m['type'])!=m['type']

def atlas(rows):
    dest=OUT/'all-components';dest.mkdir(exist_ok=True)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    for cycle in('c1','c2','c3','c4','c5'):
        samples=[(row,m)for row in rows if row['cycle']==cycle for m in row['markers']]
        for start in range(0,len(samples),100):
            page=Image.new('RGB',(1500,1200),'#27383e');draw=ImageDraw.Draw(page)
            for i,(row,m)in enumerate(samples[start:start+100]):
                x=i%10*150;y=i//10*120;l,t,r,b=m['bbox'];im=Image.open(ROOT/row['source']).convert('RGBA').crop((l,t,r,b));im.thumbnail((135,90),Image.Resampling.LANCZOS)
                page.paste(im,(x+(150-im.width)//2,y+20),im)
                draw.text((x+3,y+2),row['key'][3:]+' #'+str(m['componentLabel']),font=font,fill='white')
                draw.text((x+3,y+106),' '.join(map(str,m['bbox'])),font=font,fill='#abb8bb')
            page.save(dest/f'{cycle}-{start//100+1:02}.jpg',quality=95)

if __name__=='__main__':main()
