"""Reuse complete APK sprites by their native metadata, never map screenshots."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'output/map-marker-hd-review-20261026/apk-originals'
OUT=SOURCE/'sprites'

def main():
    OUT.mkdir(exist_ok=True)
    textures={r['pathId']:r for r in json.loads((SOURCE/'manifest.json').read_text(encoding='utf8'))['sources']}
    rows=[]
    for sprite in json.loads((SOURCE/'sprite-tables.json').read_text(encoding='utf8')):
        if sprite['type']!='Sprite':continue
        data=sprite['data'];texture=textures.get(data['m_RD']['texture']['m_PathID'])
        if not texture:continue
        im=Image.open(ROOT/texture['file']).convert('RGBA');rect=data['m_Rect']
        x,y,w,h=[int(round(rect[k]))for k in('x','y','width','height')]
        assert 0<=x<x+w<=im.width and 0<=y<y+h<=im.height,sprite['name']
        box=[x,im.height-y-h,x+w,im.height-y]
        component=im.crop(box);target=OUT/(sprite['name']+'.png');component.save(target)
        rows.append({'name':sprite['name'],'file':target.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
                     'source':texture['file'],'sourceSha256':texture['sha256'],'spriteNativeRect':rect,'pillowRect':box,
                     'size':list(component.size),'alphaBBox':component.getchannel('A').getbbox(),'completeNativeSpriteCanvas':True})
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    for atlas in('01','02'):
        selected=sorted([r for r in rows if r['name'].startswith('ato_text_icons_'+atlas+'_')],key=lambda r:int(r['name'].rsplit('_',1)[1]))
        board=Image.new('RGB',(8*170,180*((len(selected)+7)//8)),'#697476');draw=ImageDraw.Draw(board)
        for i,row in enumerate(selected):
            x=i%8*170;y=i//8*180;im=Image.open(ROOT/row['file'])
            board.paste(im,(x+20,y+30),im);draw.text((x+8,y+5),row['name'],font=font,fill='white')
        board.save(OUT/f'atlas-{atlas}-named.jpg',quality=95)
    (OUT/'manifest.json').write_text(json.dumps({'method':'Complete original native Sprite rect from Unity metadata, alpha unchanged. Not a map screenshot or contour trace.','sprites':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'sprites':len(rows)}))

if __name__=='__main__':main()
