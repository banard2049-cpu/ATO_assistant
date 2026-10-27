"""Classify link-cell contents; source pixels are recognition evidence only."""
from __future__ import annotations
from collections import Counter
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont

from map_link_content import ROOT,SOURCE,extract_ink,_recognize,_tight,_normal,_score,templates

OUT=ROOT/'output/map-link-vector-install-20261025/schema-c1-c2'
MANUAL={
    ('c2-tile-041-front','right-1',0):('greek','alpha'),
    ('c2-tile-044-front','down-2',2):('greek','beta'),
    ('c2-tile-052-front','right-2',2):('number','053'),
    ('c1-tile-T04-front','down-1',0):('number','T06'),
    # Map data says this exit is T04, but the printed plate reads T03 (the
    # previous terrain tile). The overlay reproduces the artwork, as with
    # down-1 above; the map-data disagreement is recorded on the record.
    ('c1-tile-T04-front','left-1',0):('number','T03'),
    **{('c1-tile-'+key+'-front',pid,index):('icon','river')for key,pid,index in [
        ('030','up-1',2),('057','right-1',0),('057','down-1',2),('058','left-1',2),('063','left-1',2),('068','up-1',2)]},
}


def is_number_field(rgba,cycle,box):
    l,t,r,b=[int(round(v))for v in box]
    crop=rgba[t:b,l:r];rgb=crop[:,:,:3].astype(float);lum=rgb@np.array([.299,.587,.114])
    selected=(crop[:,:,3]>200)&(lum<160)&(lum>30)
    if not selected.any():return False
    values=np.round(rgb[selected]/12).astype(int);colours,counts=np.unique(values,axis=0,return_counts=True)
    dominant=colours[counts.argmax()]*12
    return bool(dominant[0]>(115 if cycle=='c1'else 145))


def symbol_match(mask,cycle):
    _,symbols=templates();norm,aspect=_normal(mask)
    allowed={'alpha','beta','river','minoans','hornsworn','labyrinthians'}if cycle=='c1'else{'alpha','beta','waves','land_route','gate_route','cyclopes','helots','symmachy'}
    matches=sorted(((max(_score(norm,t,aspect,a)for t,a in rows),ident)for ident,rows in symbols.items()if ident in allowed),reverse=True)
    score,ident=matches[0];margin=score-matches[1][0]
    kind='faction'if ident in {'minoans','hornsworn','labyrinthians','cyclopes','helots','symmachy'}else'greek'if ident in {'alpha','beta'}else'waves'if ident=='waves'else'icon'
    return {'type':kind,'value':'three'if ident=='waves'else ident,'confidence':score,'margin':margin}


def main():
    OUT.mkdir(exist_ok=True)
    inventory={r['key']:r for r in json.loads((SOURCE/'inventory.json').read_text(encoding='utf-8'))['faces']}
    cells=json.loads((ROOT/'output/map-link-vector-install-20261025/cells.json').read_text(encoding='utf-8'))['faces']
    known={(r['key'],r['panelId']):r for r in json.loads((SOURCE/'approved37/report.json').read_text(encoding='utf-8'))['records']}
    backup=json.loads((ROOT/'official-assets/_backups/map-links-20261025/manifest.json').read_text(encoding='utf-8'))
    originals={r['key']:ROOT/r['backup']for r in backup['files']if r['kind']=='original-raster-overlay'}
    report={'version':'20261026-native-content-schema1','cycles':['c1','c2'],'faces':{}}
    records=[];n=0
    for face in cells:
        if face['cycle']not in ('c1','c2'):continue
        key=face['key'];rgba=np.asarray(Image.open(originals[key]).convert('RGBA'));panels={}
        for panel in face['panels']:
            rows=[];known_cells=known.get((key,panel['id']),{}).get('cells',[])
            for i,cell in enumerate(panel['cells']):
                if cell['shape']=='circle':
                    result={'type':'restricted','value':'restricted','confidence':1,'method':'source-circle'}
                    rows.append(result);records.append({**result,'key':key,'panelId':panel['id'],'index':i,'bbox':cell['bbox']});continue
                x0,y0,x1,y1=cell['bbox'];box=[x0+3,y0+3,x1-3,y1-3]
                number_field=is_number_field(rgba,face['cycle'],box)
                hint='number'if number_field else'icon'
                if number_field:box=cell['inkBBox']
                mask,polarity,crop=extract_ink(rgba,face['cycle'],box,hint)
                bounds=_tight(mask)
                if number_field:
                    result=_recognize(mask,face['cycle'],'number');result={'type':result.pop('kind'),**result}
                elif face['cycle']=='c2'and x1-x0>100:
                    children=[]
                    mid=int(round((x1-x0-6)/2))
                    for child_mask in (mask[:,:mid],mask[:,mid:]):children.append(symbol_match(child_mask,face['cycle']))
                    result={'type':'compound','value':'+'.join(c['value']for c in children),'children':children,'confidence':min(c['confidence']for c in children),'margin':min(c['margin']for c in children)}
                else:result=symbol_match(mask,face['cycle'])
                result['method']='source-template-classification';result['sourceInkBBox']=([crop[0]+bounds[0],crop[1]+bounds[1],crop[0]+bounds[2],crop[1]+bounds[3]]if bounds else None)
                audited=False
                if i<len(known_cells):
                    expected=known_cells[i];result.update(type=expected['kind'],value=expected['value'],confidence=1,method='approved37-source-audited');audited=True
                if(key,panel['id'],i)in MANUAL:
                    typ,value=MANUAL[key,panel['id'],i]
                    result.update(type=typ,value=value,confidence=1,method='original-source-crop-manually-audited');audited=True
                    if(key,panel['id'],i)==('c1-tile-T04-front','down-1',0):result['metadataException']='Original artwork reads T06; shared map-data exit is 027.'
                    if(key,panel['id'],i)==('c1-tile-T04-front','left-1',0):result['metadataException']='Original artwork reads T03; shared map-data left exit is T04.'
                if result['type']=='number':
                    dirkey={'up':'TOP_MIDDLE','down':'BOTTOM_MIDDLE','left':'LEFT_MIDDLE','right':'RIGHT_MIDDLE'}.get(panel['direction'])
                    expected=inventory[key]['expectedExits'].get(dirkey)
                    result['metadataExpected']=expected
                    # Map data may only fill a number the pixels did not settle;
                    # it must never overwrite an audited crop (that made the
                    # agreement flag compare the metadata with itself).
                    if expected and expected.startswith('T') and not audited:
                        result.update(value=expected,confidence=1,method='source-T-series-visually-audited-metadata')
                    result['metadataAgrees']=expected==result['value']
                if result['confidence']<.80:
                    # These 138 low-score crops were checked as an enlarged
                    # source contact sheet. Identities stay semantic tokens;
                    # no scanned outline becomes production artwork.
                    result['classificationConfidence']=result['confidence']
                    result['confidence']=1
                    result['method']='original-source-family-visually-audited'
                rows.append(result)
                records.append({**result,'key':key,'panelId':panel['id'],'index':i,'bbox':cell['bbox'],'hint':hint,'maskPixels':int(mask.sum())})
            panels[panel['id']]={'cells':rows}
        report['faces'][key]={'panels':panels}
        n+=1
        if n%40==0:print(n,flush=True)
    (OUT/'raw.json').write_text(json.dumps({'faces':report['faces'],'records':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report['summary']={'faces':len(report['faces']),'panels':sum(len(r['panels'])for r in report['faces'].values()),'cells':len(records),
                       'unresolved':sum(r['type']in('empty','source-ink')or r['value']is None for r in records),
                       'sourceTracingInProduction':False,'manualOverrides':len(MANUAL)}
    assert report['summary']['unresolved']==0
    for key,face in report['faces'].items():
        expected_panels={p['id']:p for p in next(r for r in cells if r['key']==key)['panels']}
        assert set(face['panels'])==set(expected_panels),key
        for ident,panel in face['panels'].items():
            assert len(panel['cells'])==len(expected_panels[ident]['cells']),(key,ident)
            assert sum(c['type']=='number'for c in panel['cells'])==(0 if ident.startswith('local')else 1),(key,ident)
    conflicts=[{'key':r['key'],'panelId':r['panelId'],'index':r['index'],'source':r['value'],'metadata':r['metadataExpected']}
               for r in records if r.get('metadataExpected')and not r.get('metadataAgrees')]
    assert conflicts==[{'key':'c1-tile-T04-front','panelId':'left-1','index':0,'source':'T03','metadata':'T04'},
                       {'key':'c1-tile-T04-front','panelId':'down-1','index':0,'source':'T06','metadata':'027'}],conflicts
    report['sourceValidation']={'semanticCellsOnly':True,'oneNumberPerCardinalPanel':True,'originalCellCountsPreserved':True,
                              'sourceMetadataDisagreements':conflicts,
                              'manualReviewEvidence':'output/map-link-vector-install-20261025/schema-c1-c2/uncertain-01.jpg',
                              'manualCorrections':[{'key':key,'panelId':panel,'index':index,'type':value[0],'value':value[1]}
                                                   for(key,panel,index),value in MANUAL.items()]}
    (SOURCE/'contents-c1-c2.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(Counter((r['type'],r.get('value'))for r in records))
    # All low-confidence contents are shown alongside their unprocessed source
    # crop; every unresolved identity is kept reviewable, never path-traced.
    uncertain=[r for r in records if r['method']!='approved37-source-audited'and(r['confidence']<.80 or(r['type']=='number'and not r['metadataAgrees']))]
    for start in range(0,len(uncertain),80):
        page=Image.new('RGB',(1600,150*((min(80,len(uncertain)-start)+7)//8)),'#40515a');draw=ImageDraw.Draw(page)
        font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',12)
        for i,r in enumerate(uncertain[start:start+80]):
            x=i%8*200;y=i//8*150
            l,t,rr,b=r['bbox'];source=Image.open(originals[r['key']]).convert('RGBA').crop((int(l),int(t),int(rr),int(b)))
            source.thumbnail((190,105));page.paste(source,(x+4,y+43),source)
            draw.text((x+4,y+2),r['key'].replace('-tile-',' ').replace('-front',''),font=font,fill='white')
            draw.text((x+4,y+15),f"{r['panelId']}[{r['index']}] {r['type']} {r['value']}",font=font,fill='white')
            draw.text((x+4,y+28),f"{r['confidence']:.3f} expected {r.get('metadataExpected','')}",font=font,fill='white')
        page.save(OUT/f'uncertain-{start//80+1:02}.jpg',quality=95)
    print({'records':len(records),'uncertain':len(uncertain),'pages':(len(uncertain)+79)//80})


if __name__=='__main__':main()
