"""Read-only audit of local TTS textures, tokens, card atlases and references."""
from collections import Counter,defaultdict
import hashlib,json,re
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
MODS=Path(r'D:\desktop\新建文件夹 (3)\Aeon Trespass_ Odyssey (3458296558)\Mods')
OUT=ROOT/'output/map-marker-hd-review-20261026/tokens'
DEST=ROOT/'tools/map-marker-vector-source/hd-sources'

def clean(url):return re.sub(r'[^a-zA-Z0-9]','',url).lower()

def main():
    OUT.mkdir(parents=True,exist_ok=True);DEST.mkdir(parents=True,exist_ok=True)
    save_path=MODS/'Workshop/3458296558.json';save=json.loads(save_path.read_text(encoding='utf8'))
    objects=[];references=defaultdict(list)
    def walk(obj,context):
        if not isinstance(obj,dict):return
        nickname=(obj.get('Nickname')or'').strip();here=context+([nickname]if nickname else[])
        base={k:obj.get(k)for k in('GUID','Name','Nickname','Description','Tags','CardID')if obj.get(k)is not None}
        base['context']=' / '.join(here)
        if obj.get('CustomImage'):base['CustomImage']=obj['CustomImage']
        if obj.get('CustomMesh'):base['CustomMesh']=obj['CustomMesh']
        if obj.get('CustomDeck'):base['CustomDeck']=obj['CustomDeck']
        objects.append(base)
        def urls(value,role):
            if isinstance(value,dict):
                for key,v in value.items():urls(v,role+'.'+str(key))
            elif isinstance(value,list):
                for index,v in enumerate(value):urls(v,role+'.'+str(index))
            elif isinstance(value,str)and value.startswith(('https://','http://')):
                references[clean(value)].append({**{k:v for k,v in base.items()if k not in('CustomDeck','CustomMesh','CustomImage')},'role':role,'url':value})
        for key in('CustomImage','CustomMesh','CustomDeck'):urls(obj.get(key),key)
        for key in('States','ContainedObjects','ChildObjects'):
            value=obj.get(key)
            for child in(value.values()if isinstance(value,dict)else value or[]):walk(child,here)
    for obj in save.get('ObjectStates',[]):walk(obj,[])
    images=[]
    for path in sorted((MODS/'Images').rglob('*')):
        if not path.is_file():continue
        try:
            with Image.open(path)as im:w,h=im.size;mode=im.mode
        except Exception:continue
        refs=references.get(clean(path.stem),[])
        images.append({'file':str(path),'width':w,'height':h,'mode':mode,'bytes':path.stat().st_size,'references':refs,
                       'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    token_images=[r for r in images if any(ref.get('Name')in('Custom_Token','Custom_Tile','Custom_Model')for ref in r['references'])]
    unreferenced=[r for r in images if not r['references']]
    report={'source':str(save_path),'sourceSha256':hashlib.sha256(save_path.read_bytes()).hexdigest(),
            'summary':{'objects':len(objects),'images':len(images),'tokenTileModelTextures':len(token_images),'unreferencedImages':len(unreferenced),
                       'objectTypes':dict(Counter(o.get('Name')for o in objects))},'images':images,'objects':objects}
    (OUT/'inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    def sheets(rows,prefix,limit=80):
        for start in range(0,len(rows),limit):
            page=Image.new('RGB',(1600,160*((min(limit,len(rows)-start)+7)//8)),'#607177');dr=ImageDraw.Draw(page)
            for i,row in enumerate(rows[start:start+limit]):
                x=i%8*200;y=i//8*160
                names=[]
                for ref in row['references']:
                    label=ref.get('Nickname')or ref.get('context')or ref.get('Name')
                    if label and label not in names:names.append(label)
                dr.text((x+3,y+2),f"{start+i} {row['width']}x{row['height']}",font=font,fill='white')
                dr.text((x+3,y+18),(' | '.join(names))[-28:],font=font,fill='#ffe6a5')
                im=Image.open(row['file']).convert('RGBA');im.thumbnail((188,118),Image.Resampling.LANCZOS)
                page.paste(im,(x+(200-im.width)//2,y+40),im)
            page.save(OUT/f'{prefix}-{start//limit+1:02}.jpg',quality=95)
    sheets(token_images,'tokens');sheets(images,'all-images')
    (OUT/'token-images.json').write_text(json.dumps(token_images,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (DEST/'tts-texture-inventory.json').write_text(json.dumps({'source':str(save_path),'summary':report['summary'],'inventory':str((OUT/'inventory.json').relative_to(ROOT)),'tokenImages':len(token_images)},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report['summary']))

if __name__=='__main__':main()
