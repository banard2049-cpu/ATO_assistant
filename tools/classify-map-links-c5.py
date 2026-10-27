"""Audit C5 link contents for the shared native template renderer."""
from collections import Counter
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from map_link_content import ROOT,SOURCE,extract_ink,_recognize,_normal,_score,templates,_tight
from map_corner_vectors import native

OUT=ROOT/'output/map-link-vector-install-20261025/schema-c5'

def raw_ink(rgba,cell):
    l,t,r,b=[int(round(v))for v in cell['inkBBox']]
    crop=rgba[t:b,l:r];lum=crop[:,:,:3].astype(float)@np.array([.299,.587,.114])
    return (lum>171)&(crop[:,:,3]>140)

def main():
    source=json.loads((SOURCE/'inventory.json').read_text(encoding='utf8'))
    inventory={r['key']:r for r in source['faces']}
    geometry=json.loads((ROOT/'output/map-link-vector-install-20261025/cells.json').read_text(encoding='utf8'))
    approved=json.loads((SOURCE/'approved37/report.json').read_text(encoding='utf8'))['records']
    known={(r['key'],r['panelId']):r for r in approved}
    _,symbols=templates()
    # Audited scan crops are recognition evidence only. The renderer never
    # reads these masks; final content is a native vector component by ID.
    raw_templates={ident:[]for ident in ('outcastvanguard','followersofarete','cycladeanprotectorate','alpha','beta','helmet_icon')}
    cells_lookup={row['key']:row for row in geometry['faces']}
    seeds=[('c5-tile-004-front','right-1',0,'outcastvanguard'),('c5-tile-014-front','up-1',1,'followersofarete'),
           ('c5-tile-005-front','right-1',0,'cycladeanprotectorate'),('c5-tile-015-front','up-1',2,'alpha'),
           ('c5-tile-015-front','right-2',0,'beta'),('c5-tile-027-front','right-1',0,'helmet_icon')]
    for sample in approved:
        if sample['cycle']=='c5':
            for index,cell in enumerate(sample['cells']):
                if cell['value']in raw_templates:seeds.append((sample['key'],sample['panelId'],index,cell['value']))
    for key,panel_id,index,ident in seeds:
        rgba=np.asarray(Image.open(ROOT/inventory[key]['source']).convert('RGBA'))
        panel=next(p for p in cells_lookup[key]['panels']if p['id']==panel_id)
        raw_templates[ident].append(_normal(raw_ink(rgba,panel['cells'][index])))
    faces={};checks=[];number_crops=[];symbol_crops=[]
    OUT.mkdir(parents=True,exist_ok=True)
    for row in geometry['faces']:
        if row['cycle']!='c5':continue
        source_row=inventory[row['key']]
        rgba=np.asarray(Image.open(ROOT/source_row['source']).convert('RGBA'))
        faces[row['key']]={'panels':{}}
        for panel in row['panels']:
            sample=known.get((row['key'],panel['id']))
            results=[]
            for cell in panel['cells']:
                if cell['shape']=='circle':
                    results.append({'type':'restricted','value':'lock','method':'source-circle'});continue
                mask,polarity,box=extract_ink(rgba,'c5',cell['inkBBox'],cell['kindHint'])
                match=_recognize(mask,'c5',cell['kindHint'],cell.get('expected'))
                normal,aspect=_normal(mask)
                hint=cell['kindHint']
                raw_normal,raw_aspect=_normal(raw_ink(rgba,cell))
                scores=sorted(((max(_score(raw_normal,t,raw_aspect,a)for t,a in raw_templates[name]),name)
                               for name in raw_templates),reverse=True)
                is_number=hint=='number'
                value=match['value'] if is_number else scores[0][1]
                kind='number'if is_number else'greek'if value in ('alpha','beta')else'icon'if value=='helmet_icon'else'faction'
                confidence=match['confidence'] if is_number else scores[0][0]
                method='source-template-classification'
                expected=None
                if sample and cell['index']<len(sample['cells']):
                    evidence=sample['cells'][cell['index']];kind=evidence['kind'];value=evidence['value'];method='approved37'
                elif is_number:
                    key={'up':'TOP_MIDDLE','down':'BOTTOM_MIDDLE','left':'LEFT_MIDDLE','right':'RIGHT_MIDDLE'}.get(panel['direction'])
                    expected=source_row['expectedExits'].get(key)
                bound=_tight(mask)
                result={'type':kind,'value':value,'confidence':confidence,'method':method,'sourceInkBBox':([box[0]+bound[0],box[1]+bound[1],box[0]+bound[2],box[1]+bound[3]]if bound else None)}
                if expected:result['metadataNumber']=expected
                result['candidates']=scores if not is_number else[]
                results.append(result)
                check={'key':row['key'],'panelId':panel['id'],'index':cell['index'],**result,'sourceCrop':box}
                checks.append(check)
                crop=Image.fromarray(rgba).crop((round(box[0]),round(box[1]),round(box[2]),round(box[3])))
                (number_crops if is_number else symbol_crops).append((check,crop))
            faces[row['key']]['panels'][panel['id']]={'cells':results}
    # C5 routes point to the destination's faction on the matching A/B face.
    # Keep source classifier evidence and flag disagreements for visual audit.
    for row in geometry['faces']:
        if row['cycle']!='c5':continue
        for panel in row['panels']:
            cells=faces[row['key']]['panels'][panel['id']]['cells']
            n=next(i for i,c in enumerate(cells)if c['type']=='number')
            number=cells[n]['value']
            hint=cells[n].get('metadataNumber')
            if hint and len(str(number))!=3 or hint and int(str(number).lstrip('0')or'0')>80:
                cells[n]['ocrCandidate']=number;cells[n]['value']=hint;number=hint
            f=n-1 if n==len(cells)-1 else n+1
            ids=native.faction_ids('c5',number,row['face'])
            assert len(ids)==1,(row['key'],panel['id'],number,ids)
            cells[f].update(type='faction',value=ids[0],method='destination-face-crosscheck-with-source')
            for i,c in enumerate(cells):
                if i in(n,f):continue
                if len(cells)==4 and((panel['direction']=='right'and i==0)or(panel['direction']!='right'and i==3)):
                    c.update(type='icon',value='helmet_icon',method='source-visual-helmet')
                else:
                    item=next(r for r in checks if r['key']==row['key']and r['panelId']==panel['id']and r['index']==i)
                    alpha_beta=[v for v in item['candidates']if v[1]in('alpha','beta')]
                    c.update(type='greek',value=alpha_beta[0][1]if alpha_beta else c['value'])
            for i,c in enumerate(cells):
                old=next(r for r in checks if r['key']==row['key']and r['panelId']==panel['id']and r['index']==i)
                old.update(c)
    audit=json.loads((SOURCE/'contents-c5-visual-audit.json').read_text(encoding='utf8'))
    for key,ident,index,kind,value in audit['greekAndHelmetOverrides']:
        faces[key]['panels'][ident]['cells'][index].update(type=kind,value=value,method='source-visual-enlarged-audit')
    for key,ident,index,value in audit['numbers']:
        faces[key]['panels'][ident]['cells'][index].update(type='number',value=value,method='source-visual-number-audit')
    for key,ident,index,value in audit.get('factions',[]):
        faces[key]['panels'][ident]['cells'][index].update(type='faction',value=value,method='source-visual-faction-audit')
    for item in checks:item.update(faces[item['key']]['panels'][item['panelId']]['cells'][item['index']])
    summary={'faces':len(faces),'panels':sum(len(r['panels'])for r in faces.values()),'cells':len(checks),
             'lowConfidence':sum(r['confidence']<.65 for r in checks),
             'numberMismatch':sum(bool(r['type']=='number'and r.get('metadataNumber')and r['value']!=r['metadataNumber'])for r in checks),
             'counts':dict(Counter(r['value']for r in checks if r['type']!='number'))}
    (SOURCE/'contents-c5.json').write_text(json.dumps({'version':'20261026-content-schema1','cycles':['c5'],'summary':summary,'faces':faces},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'checks.json').write_text(json.dumps({'summary':summary,'cells':checks},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    for kind,crops in [('number',number_crops),('symbol',symbol_crops)]:
        for start in range(0,len(crops),96):
            page=Image.new('RGB',(1600,1440),'#26383f');draw=ImageDraw.Draw(page)
            for i,(check,crop)in enumerate(crops[start:start+96]):
                x=i%8*200;y=i//8*120
                key=check['key'].replace('c5-tile-','').replace('front','A').replace('back','B')
                draw.text((x+2,y+1),key+' '+check['panelId']+' '+str(check['index']),font=font,fill='white')
                draw.text((x+2,y+18),str(check['value'])+' %.2f'%check['confidence'],font=font,fill='#fdc979'if check['confidence']<.65 else'#b6ebe1')
                crop.thumbnail((185,75),Image.Resampling.LANCZOS)
                page.paste(crop,(x+5,y+40),crop)
                if check.get('metadataNumber') and check['metadataNumber']!=check['value']:
                    draw.text((x+2,y+103),'meta '+check['metadataNumber'],font=font,fill='#ff8e8e')
            page.save(OUT/f'{kind}-{start//96+1:02}.jpg',quality=94)
    print(json.dumps(summary))

if __name__=='__main__':main()
