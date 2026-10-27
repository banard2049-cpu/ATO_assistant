from pathlib import Path
import json,hashlib,gc
import UnityPy
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/pdf-audit'
data=json.loads((OUT/'assetbundle-textures.json').read_text(encoding='utf8'))
dest=OUT/'bundle-previews';dest.mkdir(exist_ok=True)
seen=set();rows=[]
for row in data:
    desired=[t for t in row['textures']if t['name']in ('Story','Doom','DoomSpecial','DoomSpecial2')]
    if not desired:continue
    env=UnityPy.load(row['file'])
    for tex in desired:
        # Same named source templates are repeated in most miniature bundles.
        ident=(tex['name'],tex['width'],tex['height'])
        if ident in seen:continue
        seen.add(ident)
        ob=next(ob for ob in env.objects if ob.path_id==tex['pathId'])
        image=ob.read().image.convert('RGBA');image.thumbnail((480,480))
        path=dest/(tex['name']+f'-{tex["width"]}.png');image.save(path)
        rows.append({**tex,'bundle':row['file'],'preview':str(path.relative_to(ROOT))})
    del env;gc.collect()
board=Image.new('RGB',(len(rows)*500,530),'#697476');draw=ImageDraw.Draw(board)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
for i,row in enumerate(rows):
    image=Image.open(ROOT/row['preview']);board.paste(image,(i*500+10,40),image)
    draw.text((i*500+10,8),row['name']+f' {row["width"]}x{row["height"]}',font=font,fill='white')
board.save(OUT/'bundle-flat-contact.jpg',quality=93)
(OUT/'bundle-flats.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(len(rows))
