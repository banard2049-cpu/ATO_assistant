"""Export complete original APK map glyphs and atlases, with alpha intact."""
from pathlib import Path
import json,hashlib
import UnityPy
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
APK=ROOT/'output/apk-map-assets'
OUT=ROOT/'output/map-marker-hd-review-20261026/apk-originals'
OUT.mkdir(parents=True,exist_ok=True)
env=UnityPy.load(str(APK/'data.unity3d'))
rows=[]
for obj in env.objects:
    if obj.type.name!='Texture2D':continue
    tex=obj.read();name=tex.m_Name
    if not(name.startswith('map_ico_')or name.startswith('ato_text_icon')):continue
    try:
        image=tex.image.convert('RGBA');path=OUT/f'{name}.png';image.save(path)
        rows.append({'name':name,'pathId':obj.path_id,'assetFile':str(obj.assets_file.name),'size':list(image.size),'file':path.relative_to(ROOT).as_posix(),
                     'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'alphaBBox':image.getchannel('A').getbbox(),
                     'source':'output/apk-map-assets/data.unity3d','sourceKind':'original-APK-Texture2D-unmodified-alpha'})
    except Exception as error:rows.append({'name':name,'error':str(error)})
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
icons=[row for row in rows if row['name'].startswith('map_ico_')and row.get('file')]
board=Image.new('RGB',(1800,180*((len(icons)+8)//9)),'#697476');draw=ImageDraw.Draw(board)
for i,row in enumerate(icons):
    x=i%9*200;y=i//9*180;image=Image.open(ROOT/row['file']);image.thumbnail((160,135))
    draw.text((x+2,y+2),str(i)+' '+row['name'].removeprefix('map_ico_'),font=font,fill='white')
    board.paste(image,(x+15,y+30),image)
board.save(OUT/'map-icons-contact.jpg',quality=94)
for row in rows:
    if row['name'].startswith('ato_text_icon')and row.get('file'):
        im=Image.open(ROOT/row['file']);bg=Image.new('RGBA',im.size,'#697476');bg.alpha_composite(im);bg.convert('RGB').save(OUT/f'{row["name"]}-flat.jpg',quality=96)
(OUT/'manifest.json').write_text(json.dumps({'source':'output/apk-map-assets/data.unity3d','sources':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'textures':len(rows),'mapIcons':len(icons)}))
