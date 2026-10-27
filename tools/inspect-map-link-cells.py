"""Write source-derived compartment geometry for all route-marker panels."""
from __future__ import annotations
from collections import Counter
import hashlib
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import label

from map_link_cells import ROOT, REVIEW, OUT, detect_panel


def main():
    inventory=json.loads((REVIEW/'inventory.json').read_text(encoding='utf-8'))
    native=json.loads((REVIEW/'native-samples/report.json').read_text(encoding='utf-8'))
    known={(row['key'],row['panelId']):row for row in native['records']}
    faces=[];reviews=[]
    for row in inventory['faces']:
        path=ROOT/row['source'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sourceSha256']
        rgba=np.asarray(Image.open(path).convert('RGBA'));labels,_=label(rgba[:,:,3]>100)
        panels=[]
        for panel in row['panels']:
            result=detect_panel(rgba,labels,panel,row['cycle'],known.get((row['key'],panel['id'])))
            panels.append(result)
            if result['reviewReasons']:reviews.append({'key':row['key'],'panelId':panel['id'],'reasons':result['reviewReasons']})
        faces.append({'key':row['key'],'cycle':row['cycle'],'face':row.get('face'),'source':row['source'],
                      'sourceSha256':row['sourceSha256'],'panels':panels,'arrows':row['arrows'],
                      'unclassified':row['unclassified'],'nativePanelIds':[p['id']for p in panels if p['nativeAudited']]})
        if len(faces)%100==0:print(f'Detected {len(faces)} / 511 faces',flush=True)
    OUT.mkdir(parents=True,exist_ok=True)
    counts=Counter(cell['shape']for row in faces for panel in row['panels']for cell in panel['cells'])
    summary={'faces':len(faces),'panels':sum(len(row['panels'])for row in faces),'cells':sum(counts.values()),
             'cellShapes':dict(counts),'reviewPanels':len(reviews),'nativeAuditedPanels':37}
    report={'version':'20261026-source-frame-cells2','installation':'none','coordinateSystem':'1024x1024 global coordinates; outer polygons still use alpha/frame envelope (painter must inset only external boundaries).',
            'method':'Source alpha body bands and actual three-line rim sequences; C4 source dark strokes use repeated measured-width search windows. Wider compartments are kept intact when they have no source divider. The sole diagonal C3 shared rim is fitted to a source straight ridge. Two arrow-attached scan components are separated into body and embeddedArrows.',
            'summary':summary,'faces':faces,'reviewQueue':reviews}
    (OUT/'cells.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    contact_sheets(faces)
    print(json.dumps(summary))


def contact_sheets(faces):
    dest=OUT/'cell-contact-sheets';dest.mkdir(exist_ok=True)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
    for cycle in ('c1','c2','c3','c4','c5'):
        samples=[(row,panel)for row in faces if row['cycle']==cycle for panel in row['panels']]
        for start in range(0,len(samples),60):
            page=Image.new('RGB',(1600,1500),'#22313b');draw=ImageDraw.Draw(page)
            for i,(row,panel)in enumerate(samples[start:start+60]):
                x=i%4*400;y=i//4*100
                im=Image.open(ROOT/row['source']).convert('RGBA')
                l,t,r,b=panel['bbox'];crop=im.crop((l-3,t-3,r+3,b+3));scale=min(380/crop.width,68/crop.height)
                image=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
                page.paste(image,(x+5,y+25),image)
                draw.text((x+5,y+3),row['key']+' '+panel['id'],font=font,fill='#ffffff')
                for boundary in panel['splitXs']:
                    xx=x+5+(boundary-l+3)*scale
                    draw.line((xx,y+25,xx,y+25+image.height),fill='#ff6d8b',width=2)
                if panel['reviewReasons']:draw.rectangle((x+2,y+1,x+397,y+98),outline='#ffbd54',width=2)
            page.save(dest/f'{cycle}-{start//60+1:02}.jpg',quality=93)


if __name__=='__main__':main()
