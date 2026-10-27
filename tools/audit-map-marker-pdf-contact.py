from pathlib import Path
import json
import fitz
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/pdf-audit'
rows=json.loads((OUT/'local-pdfs.json').read_text(encoding='utf8'))
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
im=Image.new('RGB',(1800,350*((len(rows)+5)//6)),'#29373d');draw=ImageDraw.Draw(im)
records=[]
for i,row in enumerate(rows):
    doc=fitz.open(row['file']);page=doc[0];p=page.get_pixmap(matrix=fitz.Matrix(.5,.5),alpha=False)
    art=Image.frombytes('RGB',(p.width,p.height),p.samples);art.thumbnail((280,310))
    x=i%6*300;y=i//6*350
    im.paste(art,(x+5,y+30));draw.text((x+5,y+3),str(i)+' '+str(len(doc))+' pages '+Path(row['file']).name[:17],font=font,fill='white')
    records.append({'index':i,**row})
im.save(OUT/'all-first-pages.jpg',quality=93)
(OUT/'indexed-pdfs.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
