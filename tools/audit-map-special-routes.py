"""Read-only source/current route review; no production geometry is edited."""
from pathlib import Path
from collections import Counter
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/special-route-audit'
KINDS=('gate_route','land_route','river','helmet_icon')
def load(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def prepare():
    geo={r['key']:r for r in load(ROOT/'tools/map-link-vector-source/cells.json')['faces']}
    markers={r['key']:r for r in load(ROOT/'tools/map-marker-vector-source/inventory.json')['faces']}
    rows=[]
    for filename in('contents-c1-c2.json','contents-c3-c4.json','contents-c5.json'):
        for key,face in load(ROOT/'tools/map-link-vector-source'/filename)['faces'].items():
            for pid,panel in face['panels'].items():
                source_panel=next(p for p in geo[key]['panels']if p['id']==pid)
                for i,cell in enumerate(panel['cells']):
                    if cell.get('value')not in KINDS:continue
                    rows.append({'key':key,'kind':cell['value'],'panelId':pid,'cellIndex':i,
                                 'bbox':source_panel['cells'][i]['bbox'],'panelBBox':source_panel['bbox'],
                                 'source':markers[key]['source'],'current':f'map/images/hd1024/overlay/{key}-corners.svg'})
    OUT.mkdir(exist_ok=True);(OUT/'inputs.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf8')
    print(json.dumps(dict(Counter(r['kind']for r in rows))))
    return rows
def fit(im,size,background='#677576'):
    a=im.convert('RGBA');bg=Image.new('RGBA',a.size,background);bg.alpha_composite(a)
    scale=min(size[0]/bg.width,size[1]/bg.height)
    bg=bg.resize((round(bg.width*scale),round(bg.height*scale)),Image.Resampling.LANCZOS);out=Image.new('RGB',size,background)
    out.paste(bg.convert('RGB'),((size[0]-bg.width)//2,(size[1]-bg.height)//2));return out
def glyph_mask(im):
    a=np.asarray(im.convert('RGBA'));rgb=a[:,:,:3].astype(float)
    white=(rgb.min(2)>165)&(rgb.max(2)-rgb.min(2)<65)&(a[:,:,3]>90)
    labs,n=label(white);keep=np.zeros(n+1,bool);h,w=white.shape
    for ident in range(1,n+1):
        yy,xx=np.where(labs==ident)
        if len(xx)<3:continue
        # Reject the cell's white double frame and adjacent cell fragments.
        if xx.min()<4 or yy.min()<4 or xx.max()>w-5 or yy.max()>h-5:continue
        if xx.max()-xx.min()>w*.8 and yy.max()-yy.min()>h*.8:continue
        keep[ident]=True
    mask=keep[labs];y,x=np.where(mask)
    return mask,None if not len(x)else[x.min(),y.min(),x.max()+1,y.max()+1]
def review():
    rows=prepare();font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
    small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
    for kind in KINDS:
        selected=[r for r in rows if r['kind']==kind];metrics=[]
        for page_start in range(0,len(selected),4):
            page_rows=selected[page_start:page_start+4];board=Image.new('RGB',(1420,50+len(page_rows)*300),'#22353b');d=ImageDraw.Draw(board)
            d.text((12,12),f'{kind} | original / installed v4 | complete cell with padding',font=font,fill='white')
            for row_index,row in enumerate(page_rows):
                l,t,r,b=map(int,row['bbox']);box=(max(0,l-8),max(0,t-8),min(1024,r+8),min(1024,b+8));y=50+300*row_index
                source=Image.open(ROOT/row['source']).convert('RGBA')
                current=Image.open(OUT/'current'/f'{row["key"]}.png').convert('RGBA')
                d.text((12,y),f'{row["key"]} {row["panelId"]} cell {row["cellIndex"]}',font=font,fill='white')
                board.paste(fit(source.crop(box),(680,245)),(12,y+32));board.paste(fit(current.crop(box),(680,245)),(726,y+32))
                sm,sb=glyph_mask(source.crop((l,t,r,b)));cm,cb=glyph_mask(current.crop((l,t,r,b)))
                measurement={'key':row['key'],'panelId':row['panelId'],'cellIndex':row['cellIndex'],'sourceCellBBox':row['bbox'],
                             'sourceGlyphInkBBoxWithinCell':None if sb is None else list(map(int,sb)),
                             'currentGlyphInkBBoxWithinCell':None if cb is None else list(map(int,cb)),
                             'measurementMethod':'White connected components inside source/current complete cell; reject double frame and tiny noise. Diagnostics only, not artwork paths.'}
                if sb and cb:
                    sw,sh=sb[2]-sb[0],sb[3]-sb[1];cw,ch=cb[2]-cb[0],cb[3]-cb[1]
                    measurement.update(sourceInkSize=[int(sw),int(sh)],currentInkSize=[int(cw),int(ch)],widthDelta=int(cw-sw),heightDelta=int(ch-sh),
                                       centerDelta=[float((cb[0]+cb[2]-sb[0]-sb[2])/2),float((cb[1]+cb[3]-sb[1]-sb[3])/2)])
                metrics.append(measurement)
                d.text((12,y+280),f'Ink bounds original={sb}, current={cb} (relative to source cell)',font=small,fill='#c8d0d0')
            board.save(OUT/f'{kind}-all-{page_start//4+1}.jpg',quality=97)
        (OUT/f'{kind}-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n',encoding='utf8')
    result={'status':'read-only-review','counts':dict(Counter(r['kind']for r in rows)),
            'runtimeSourceSha256':{r['current']:sha(ROOT/r['current'])for r in rows},
            'sourceSha256':{r['source']:sha(ROOT/r['source'])for r in rows}}
    (OUT/'review.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':
    import sys
    prepare()if'--prepare'in sys.argv else review()
