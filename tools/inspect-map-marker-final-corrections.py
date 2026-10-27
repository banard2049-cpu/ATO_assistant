"""Full native marker references for final fixed optical calibration."""
from pathlib import Path
import json,numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/final-corrections'
OUT.mkdir(exist_ok=True)
data=json.loads((ROOT/'tools/map-marker-vector-source/inventory.json').read_text(encoding='utf8'))
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
records=[]
for kind in('silver_ruin','oasis','daedalus_lighthouse','staff_icon','spartan_stronghold'):
    items=[(r,m)for r in data['faces']for m in r['markers']if m['type']==kind]
    board=Image.new('RGB',(5*240,260*((len(items)+4)//5)),'#697476');draw=ImageDraw.Draw(board)
    for i,(row,m)in enumerate(items):
        l,t,r,b=m['bbox'];image=Image.open(ROOT/row['source']).convert('RGBA');im=image.crop((l-5,t-5,r+5,b+5))
        bg=Image.new('RGBA',im.size,'#697476');bg.alpha_composite(im);bg=bg.resize((220,220))
        x=i%5*240;y=i//5*260;board.paste(bg.convert('RGB'),(x+10,y+28));draw.text((x+3,y+4),row['key'],font=font,fill='white')
        a=np.asarray(image)[t:b,l:r];rgb=a[:,:,:3].astype(float);lum=rgb@np.array([.299,.587,.114]);yy,xx=np.indices(lum.shape)
        radius=np.hypot(xx-(r-l-1)/2,yy-(b-t-1)/2)
        light=kind not in('staff_icon',)
        mask=(lum<110)if light else(lum>175)
        mask&=(radius<36)&(a[:,:,3]>220)
        labs,n=label(mask);keep=[]
        for k in range(1,n+1):
            if (labs==k).sum()>=5 and radius[labs==k].min()<27:keep.append(k)
        mask=np.isin(labs,keep);ys,xs=np.where(mask)
        bounds=[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1]
        records.append({'key':row['key'],'type':kind,'localInkBounds':bounds,'sourceBBox':m['bbox']})
    board.save(OUT/f'{kind}-full-references.jpg',quality=97)
(OUT/'measurements.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf8')
for kind in('silver_ruin','oasis','daedalus_lighthouse','staff_icon','spartan_stronghold'):
    bounds=np.median([r['localInkBounds']for r in records if r['type']==kind],axis=0)
    print(kind,bounds,bounds[2:]-bounds[:2])
for kind in('spartan_stronghold','staff_icon'):
    im=Image.open(ROOT/f'tools/map-marker-vector-source/original-components/{kind}.png').convert('RGBA')
    im.putdata([(255,255,255,a)for r,g,b,a in im.getdata()])
    bg=Image.new('RGBA',im.size,'#697476');bg.alpha_composite(im)
    bg.resize((720,720)).convert('RGB').save(OUT/f'{kind}-component-large.jpg')
