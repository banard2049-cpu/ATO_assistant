"""Audit C3/C4 link contents; outputs a content schema, never traced artwork."""
from __future__ import annotations
from collections import Counter
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont

from map_link_content import ROOT, extract_ink, _recognize, templates, _normal, _score, _tight

SOURCE=ROOT/'tools/map-link-vector-source'
OUT=ROOT/'output/map-link-vector-install-20261025/schema-c3-c4'
ALLOWED={'c3':['delphians','sunheirs','twilightwatch'],'c4':['aristotelians','cloudthieves','wasters']}
FIELDS={'up':'TOP_MIDDLE','right':'RIGHT_MIDDLE','down':'BOTTOM_MIDDLE','left':'LEFT_MIDDLE'}
GREEK={
 ('c4-tile-027-front','up-1',2):'beta',('c4-tile-027-front','left-1',2):'alpha',('c4-tile-027-front','down-1',2):'alpha',
 ('c4-tile-028-front','up-1',2):'beta',('c4-tile-028-front','right-1',0):'alpha',('c4-tile-028-front','down-1',2):'beta',
 ('c4-tile-079-front','left-1',2):'alpha',('c4-tile-079-front','right-1',0):'beta',('c4-tile-079-front','down-1',2):'beta',
 ('c3-tile-088-front','up-1',2):'beta',('c3-tile-088-front','left-1',2):'alpha',
 ('c3-tile-088-front','down-1',2):'alpha',('c3-tile-088-front','down-2',2):'beta',
}
VISUAL_FACTIONS={
 ('c3-tile-014-front','left-1',1):'twilightwatch',
 ('c3-tile-045-front','left-1',1):'sunheirs',
 ('c3-tile-043-front','special-1',1):'twilightwatch',
 ('c3-tile-072-front','special-1',1):'sunheirs',
 ('c3-tile-073-front','special-1',1):'sunheirs',
}
SPECIAL_NUMBERS={
 '003':['038'],'010':['043'],'012':['021','023'],'021':['012'],'023':['012'],'027':['057'],
 '034':['055'],'036':['069'],'038':['003'],'042':['072'],'043':['010'],'055':['034'],
 '056':['083','060'],'057':['027'],'058':['090'],'060':['056'],'068':['087'],'069':['036'],
 '072':['042'],'073':['085'],'083':['056'],'085':['073'],'087':['068'],'090':['058'],
}
SPECIAL_CATEGORIES={
 '003':['time_portal'],'010':['time_portal'],'012':['time_wound'],'021':['time_wound'],'023':['time_wound'],
 '027':['time_portal'],'034':['time_wound'],'036':['time_portal_angular'],'038':['time_portal'],
 '042':['time_portal_angular'],'043':['time_portal'],'055':['time_wound'],
 '056':['time_portal_angular','time_wound'],'057':['time_portal'],'058':['time_portal_angular'],
 '060':['time_wound'],'068':['time_wound'],'069':['time_portal_angular'],'072':['time_portal_angular'],
 '073':['time_wound'],'083':['time_portal_angular'],'085':['time_wound'],'087':['time_portal_angular'],'090':['time_portal_angular'],
}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    inv=json.loads((SOURCE/'inventory.json').read_text(encoding='utf-8'))
    lookup={r['key']:r for r in inv['faces']}
    corners=json.loads((ROOT/'tools/map-corner-vector-source/inventory.json').read_text(encoding='utf-8'))
    factions={r['key']:[v.lower()for v in r['factions']]for r in corners['faces']}
    geometry=json.loads((ROOT/'output/map-link-vector-install-20261025/cells.json').read_text(encoding='utf-8'))
    approved=json.loads((SOURCE/'approved37/report.json').read_text(encoding='utf-8'))
    exact={(r['key'],r['panelId']):r['cells']for r in approved['records']}
    _,symbols=templates()
    report={'version':'20261026-template-content-c3-c4-1','cycles':['c3','c4'],'faces':{}}
    queue=[];allcells=[]
    for row in geometry['faces']:
        if row['cycle']not in ALLOWED:continue
        key=row['key'];cycle=row['cycle'];meta=lookup[key]
        rgba=np.asarray(Image.open(ROOT/meta['source']).convert('RGBA'))
        panels={}
        for panel in row['panels']:
            cells=[];known=exact.get((key,panel['id']));j=0
            target=meta['expectedExits'].get(FIELDS.get(panel['direction']))
            destination=factions.get(f'{cycle}-tile-{target}-front',[])
            for cell in panel['cells']:
                l,t,r,b=cell['bbox'];box=[l+3,t+3,r-3,b-3]
                record={'cellIndex':cell['index'],'sourceCellBBox':cell['bbox'],'sourceInkBBox':None}
                if cell['shape']=='circle':
                    record.update(type='restricted',value='lock',confidence=1,method='source-circle-lock')
                else:
                    hint=cell['kindHint']
                    if hint=='number':box=cell['inkBBox']
                    forced_greek=GREEK.get((key,panel['id'],cell['index']))
                    if forced_greek:hint='greek';box=[l+8,t+8,r-8,b-8]
                    elif hint=='unknown':hint='faction'
                    mask,polarity,crop=extract_ink(rgba,cycle,box,hint)
                    norm,aspect=_normal(mask);bounds=_tight(mask)
                    if bounds:record['sourceInkBBox']=[crop[0]+bounds[0],crop[1]+bounds[1],crop[0]+bounds[2],crop[1]+bounds[3]]
                    recog=_recognize(mask,cycle,hint)
                    scores=sorted([(max(_score(norm,m,aspect,a)for m,a in symbols[v]),v)for v in ALLOWED[cycle]+['alpha','beta']],reverse=True)
                    record['recognition']={'top':recog,'symbolScores':[[v,round(s,4)]for s,v in scores],
                                           'expectedExit':target,'destinationFactions':destination}
                    if known and j<len(known):
                        orig=known[j];record.update(type=orig['kind'],value=orig['value'],confidence=1,method='approved-37-source-audit');j+=1
                    elif forced_greek:
                        record.update(type='greek',value=forced_greek,confidence=1,method='source-visual-audit')
                    elif key=='c3-tile-333-front':
                        record.update(type='number',value='???',confidence=1,method='source-visual-audit')
                    elif hint=='number':
                        value=recog.get('value');confidence=recog['confidence']
                        if panel['direction']in FIELDS and target and not '-alt-'in key:
                            # Metadata is corroboration; preserve recognition
                            # mismatch for visual review instead of overwriting it.
                            if value==target:record.update(type='number',value=target,confidence=confidence,method='source-recognition-and-exit-agree')
                            else:record.update(type='number',value=value,confidence=confidence,method='needs-source-number-audit',expected=target)
                        else:record.update(type='number',value=value,confidence=confidence,method='source-number-recognition')
                    else:
                        confidence,value=scores[0]
                        record.update(type='greek'if value in('alpha','beta')else'faction',value=value,confidence=confidence,method='source-template-recognition')
                        if value in destination:record['method']='source-template-and-destination-agree'
                        if len(destination)==1 and value not in destination and len(panel['cells'])==2:
                            record['review']='faction-destination-disagrees'
                    correction=VISUAL_FACTIONS.get((key,panel['id'],cell['index']))
                    if correction:
                        record.update(type='faction',value=correction,confidence=1,method='source-visual-audit-correction')
                        record.pop('review',None)
                    record['sourceInkPixels']=int(mask.sum())
                cells.append(record);allcells.append({'key':key,'panelId':panel['id'],**record})
                if record.get('confidence',1)<.72 or record.get('review') or 'needs-'in record.get('method','') or record.get('value')is None:
                    queue.append({'key':key,'panelId':panel['id'],'cell':record,'source':meta['source']})
            panels[panel['id']]={'direction':panel['direction'],'cells':cells}
        report['faces'][key]={'panels':panels}
    report['summary']={'faces':len(report['faces']),'panels':sum(len(r['panels'])for r in report['faces'].values()),
                       'cells':len(allcells),'reviewCells':len(queue),'types':dict(Counter(r['type']for r in allcells))}
    (OUT/'draft.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (OUT/'review-queue.json').write_text(json.dumps(queue,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
    for start in range(0,len(queue),80):
        board=Image.new('RGB',(1600,160*((min(80,len(queue)-start)+3)//4)),'#25363d');draw=ImageDraw.Draw(board)
        for n,item in enumerate(queue[start:start+80]):
            rec=item['cell'];x=n%4*400;y=n//4*160;l,t,r,b=rec['sourceCellBBox']
            im=Image.open(ROOT/item['source']).convert('RGBA').crop((int(l)-2,int(t)-2,int(r)+2,int(b)+2))
            im.thumbnail((140,100));board.paste(im,(x+10,y+35),im)
            draw.text((x+3,y+3),item['key']+' '+item['panelId']+' '+str(rec['cellIndex']),font=font,fill='white')
            draw.text((x+160,y+35),str(rec['value'])+' '+str(round(rec.get('confidence',1),3)),font=font,fill='#ffc485')
            scores=rec.get('recognition',{}).get('symbolScores',[])[:3]
            for q,line in enumerate(scores):draw.text((x+160,y+60+q*20),str(line),font=font,fill='#d2dbe0')
        board.save(OUT/f'review-{start//80+1:02}.jpg',quality=95)
    print(json.dumps(report['summary']))


def finalize():
    """Publish only after the independent metadata/visual audit has passed."""
    report=json.loads((OUT/'draft.json').read_text(encoding='utf-8'))
    inventory=json.loads((SOURCE/'inventory.json').read_text(encoding='utf-8'))
    inv={row['key']:row for row in inventory['faces']}
    reviewed=json.loads((OUT/'review-queue.json').read_text(encoding='utf-8'))
    # The 107 low-confidence cells remaining after five corrections were
    # visually read from the saved source-crop contact sheets. All six faction
    # motifs, the two weak digits (074/080), and all special-route glyphs agree.
    reviewed_ids={(r['key'],r['panelId'],r['cell']['cellIndex'])for r in reviewed}
    counts=Counter();destination_disagreements=[];number_disagreements=[]
    for key,face in report['faces'].items():
        row=inv[key];specials=[];specialcats=[]
        for panel_id,panel in face['panels'].items():
            source_panel=next(p for p in row['panels']if p['id']==panel_id)
            for cell in panel['cells']:
                ident=(key,panel_id,cell['cellIndex'])
                assert cell['type']in('number','faction','greek','restricted'),ident
                assert cell['value']is not None,ident
                if cell['type']=='number'and panel['direction']in FIELDS:
                    expected=row['expectedExits'].get(FIELDS[panel['direction']])
                    # Duplicated 087/088 branches have intentionally absent
                    # shared metadata, checked against the source separately.
                    if expected and cell['value']!=expected:number_disagreements.append([ident,cell['value'],expected])
                if cell['type']=='faction':
                    destinations=cell.get('recognition',{}).get('destinationFactions',[])
                    if panel['direction']in FIELDS and destinations and cell['value']not in destinations:
                        destination_disagreements.append([ident,cell['value'],destinations])
                if panel['direction']=='special'and cell['type']=='number':specials.append(cell['value'])
                if ident in reviewed_ids:cell['audit']='source-crop-contact-sheet-visual-confirmed'
                elif cell['method']=='source-recognition-and-exit-agree':cell['audit']='source-numeral-and-map-exit-independently-agree'
                elif cell['type']=='faction'and panel['direction']in FIELDS:
                    cell['audit']='source-faction-and-destination-corner-independently-agree'
                else:cell['audit']='source-template-or-explicit-visual-audit'
                assert not cell.get('review'),ident
                counts[cell['type']]+=1
            extras=[]
            for extra in source_panel['attachedExtras']:
                l,t,r,b=extra['bbox']
                if min(r-l,b-t)>=78:
                    values=SPECIAL_CATEGORIES[key.split('-')[2]]
                    source_index=int(panel_id.split('-')[-1])-1
                    value=values[source_index];specialcats.append(value)
                    extras.append({'type':'icon','value':value,'sourceBBox':extra['bbox'],'method':'source-category-visual-audit'})
                else:extras.append({'type':'restricted','value':'lock','sourceBBox':extra['bbox'],'method':'source-lock-visual-audit'})
            panel['attachedExtras']=extras
        if specials:assert specials==SPECIAL_NUMBERS[key.split('-')[2]],(key,specials)
        if specialcats:assert specialcats==SPECIAL_CATEGORIES[key.split('-')[2]],(key,specialcats)
    assert not number_disagreements,number_disagreements
    assert not destination_disagreements,destination_disagreements
    assert counts['greek']==13,counts
    report['version']='20261026-template-content-c3-c4-2'
    report['summary'].update(reviewCells=0,types=dict(counts),unresolved=0,
                              specialNumbersVisuallyChecked=sum(map(len,SPECIAL_NUMBERS.values())),
                              sourceNumberMetadataDisagreements=0,sourceFactionDestinationDisagreements=0)
    report['audit']={'sources':'Official original overlay pixels; map exits and destination corner factions provide independent corroboration.',
                     'sourceGeometryUsedForDrawing':False,'sourceTracesAllowed':False,
                     'specialNumbers':'All 26 numbers on 25 C3 special panels read visually and compared with the source recognition.',
                     'greekSuffixes':'All 13 C3/C4 suffixes read visually, retaining source order on split routes.',
                     'lowConfidenceCells':'Every crop in schema-c3-c4/review-01.jpg and review-02.jpg read visually; wrong identities explicitly corrected.',
                     'categories':'25 C3 category discs visually classified as time_portal, time_portal_angular or time_wound; use one shared glyph each.',
                     'remainingUnknowns':0}
    (SOURCE/'contents-c3-c4.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report['summary']))


if __name__=='__main__':
    import sys
    finalize()if '--finalize'in sys.argv else main()
