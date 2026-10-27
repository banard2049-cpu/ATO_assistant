"""Compare existing original symbol rasters with embedded PDF image sources.

This is source discovery only, not an artwork or outline generator.
"""
from collections import defaultdict
import json,hashlib,io
from pathlib import Path
import fitz,numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/pdf-audit'

def normal(image,dark):
    rgba=np.asarray(image.convert('RGBA'));lum=rgba[:,:,:3].mean(2)
    alpha=rgba[:,:,3]>140
    mask=alpha&((lum<130)if dark else(lum>170))
    yy,xx=np.where(mask)
    if len(xx)<10:return None
    box=(xx.min(),yy.min(),xx.max()+1,yy.max()+1)
    im=Image.fromarray(mask.astype(np.uint8)*255).crop(box)
    w,h=im.size;im.thumbnail((60,60),Image.Resampling.LANCZOS)
    canvas=Image.new('L',(64,64));canvas.paste(im,((64-im.width)//2,(64-im.height)//2))
    return np.asarray(canvas)>100,w/h

def score(a,b):
    if a is None or b is None:return 0
    ma,aa=a;mb,ab=b
    return (ma&mb).sum()/max(1,(ma|mb).sum())*np.exp(-abs(np.log(aa/ab))*.2)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    audit=OUT/'image-search';audit.mkdir(exist_ok=True)
    files=list(Path('D:/desktop/大文档').glob('A[567]*.pdf'))
    local=json.loads((OUT/'local-pdfs.json').read_text(encoding='utf8'))
    files += [Path(r['file'])for r in local if '141811508' in r['file'] or '175390557' in r['file']]
    ids=('hourglass_icon','staff_icon','spartan_stronghold','daedalus_lighthouse','wheel_icon','oasis','smoking_bowl_icon','silver_ruin')
    manifest=json.loads((ROOT/'output/map-asset-kit-20261024/native-icons/marker-manifest.json').read_text(encoding='utf8'))
    templates={}
    for row in manifest:
        if row['id']not in ids:continue
        path=ROOT/'output/map-asset-kit-20261024'/row['source']['alphaBitmap']
        im=Image.open(path).convert('RGBA')
        templates[row['id']]=[normal(im,True),normal(im,False)]
    records=[];best=defaultdict(list)
    for fileindex,path in enumerate(files):
        doc=fitz.open(path);seen=set();page_refs=defaultdict(list)
        for pi,page in enumerate(doc):
            for record in page.get_images(full=True):page_refs[record[0]].append(pi+1)
        for xref,pages in page_refs.items():
            try:
                blob=doc.extract_image(xref);w,h=blob['width'],blob['height']
                if min(w,h)<15 or max(w,h)>1500:continue
                im=Image.open(io.BytesIO(blob['image'])).convert('RGBA')
                norms=[normal(im,True),normal(im,False)]
                row={'file':str(path),'xref':xref,'width':w,'height':h,'pages':pages,'scores':{}}
                for ident,tt in templates.items():
                    value=max(score(a,b)for a in norms for b in tt)
                    row['scores'][ident]=round(float(value),5)
                    best[ident].append((value,fileindex,xref,im.copy(),row))
                records.append(row)
            except Exception:pass
        print(path.name[:35],len(page_refs),'images',flush=True)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14);chosen={}
    for ident,rows in best.items():
        top=sorted(rows,key=lambda row:row[0],reverse=True)[:16]
        board=Image.new('RGB',(1600,880),'#697476');draw=ImageDraw.Draw(board);chosen[ident]=[]
        for i,(value,fi,xref,im,row)in enumerate(top):
            x=i%8*200;y=i//8*440
            draw.text((x+3,y+4),f'{ident} {value:.3f}',font=font,fill='white')
            draw.text((x+3,y+23),f'pdf{fi} xref{xref} {im.width}x{im.height}',font=font,fill='white')
            im.thumbnail((190,360),Image.Resampling.LANCZOS);board.paste(im,(x+3,y+50),im)
            chosen[ident].append(row)
        board.save(audit/f'{ident}-best.jpg',quality=95)
    (audit/'image-inventory.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (audit/'best-candidates.json').write_text(json.dumps(chosen,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('images',len(records))

if __name__=='__main__':main()
