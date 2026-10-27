"""Independent visual audit contact sheets from unmodified C5 source pixels."""
from __future__ import annotations
from collections import Counter
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-link-vector-source'
OUT=ROOT/'output/map-link-vector-install-20261025/c5-source-audit'


def main():
    OUT.mkdir(exist_ok=True)
    schema=json.loads((SOURCE/'contents-c5.json').read_text(encoding='utf-8'))
    geometry={r['key']:r for r in json.loads((SOURCE/'cells.json').read_text(encoding='utf-8'))['faces']}
    backup=json.loads((ROOT/'official-assets/_backups/map-links-20261025/manifest.json').read_text(encoding='utf-8'))
    paths={r['key']:ROOT/r['backup']for r in backup['files']if r['kind']=='original-raster-overlay'}
    records=[]
    for key,face in schema['faces'].items():
        by_panel={p['id']:p for p in geometry[key]['panels']}
        for ident,panel in face['panels'].items():
            assert len(panel['cells'])==len(by_panel[ident]['cells'])
            for index,cell in enumerate(panel['cells']):
                if cell['type']not in('faction','number'):continue
                records.append({'key':key,'panelId':ident,'index':index,'type':cell['type'],'value':cell['value'],
                                'bbox':by_panel[ident]['cells'][index]['bbox']})
    images={}
    def art(key):
        if key not in images:images[key]=Image.open(paths[key]).convert('RGBA')
        return images[key]
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    def sheets(rows,prefix):
        files=[]
        for start in range(0,len(rows),64):
            page_rows=rows[start:start+64];im=Image.new('RGB',(1600,150*((len(page_rows)+7)//8)),'#3a4a50');draw=ImageDraw.Draw(im)
            for i,row in enumerate(page_rows):
                x=i%8*200;y=i//8*150;l,t,r,b=row['bbox'];crop=art(row['key']).crop((int(l)-1,int(t)-1,int(r)+1,int(b)+1))
                crop.thumbnail((175,105));crop=crop.resize((min(175,crop.width*2),min(105,crop.height*2)),Image.Resampling.NEAREST)
                im.paste(crop,(x+4,y+43),crop)
                draw.text((x+4,y+2),row['key'].replace('c5-tile-','').replace('-front',' A').replace('-back',' B'),font=font,fill='white')
                draw.text((x+4,y+16),f"{row['panelId']}[{row['index']}]",font=font,fill='white')
                draw.text((x+4,y+30),row['value'],font=font,fill='#fff0a5')
            name=f'{prefix}-{start//64+1:02}.jpg';im.save(OUT/name,quality=96);files.append(name)
        return files
    factions=[r for r in records if r['type']=='faction'];numbers=[r for r in records if r['type']=='number']
    files=[]
    for value in ('outcastvanguard','followersofarete','cycladeanprotectorate'):
        files+=sheets([r for r in factions if r['value']==value],value)
    numeric_by_value={}
    for row in numbers:numeric_by_value.setdefault(row['value'],row)
    files+=sheets([numeric_by_value[k]for k in sorted(numeric_by_value)],'unique-numbers')
    audit=json.loads((SOURCE/'contents-c5-visual-audit.json').read_text(encoding='utf-8'))
    override_keys={(r[0],r[1],r[2])for r in audit['numbers']}
    files+=sheets([r for r in numbers if(r['key'],r['panelId'],r['index'])in override_keys],'number-overrides')
    report={'factionOccurrences':len(factions),'factionCounts':dict(Counter(r['value']for r in factions)),
            'numberOccurrences':len(numbers),'uniqueNumbers':len(numeric_by_value),'files':files,
            'sourcePixels':'Original official backup PNGs; no vector result is used as visual evidence.',
            'records':records}
    (OUT/'contact-manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items()if k!='records'}))


if __name__=='__main__':main()
