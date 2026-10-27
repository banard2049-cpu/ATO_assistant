"""Independent coverage audit and source-context boards; no artwork edits."""
from collections import Counter
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label,find_objects

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-independent-audit-20261026'


def load(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    inventory=load('tools/map-marker-vector-source/inventory.json')
    links={r['key']:r for r in load('tools/map-link-vector-source/inventory.json')['faces']}
    corners={r['key']:r for r in load('tools/map-corner-vector-source/inventory.json')['faces']}
    text=(ROOT/'map/c5-heading-data.js').read_text(encoding='utf-8-sig');headings=json.loads(text[text.index('{'):text.rindex('}')+1])
    small=[];labels_only=[];unexpected=[];excluded=[];totals=Counter();contexts=[]
    for row in inventory['faces']:
        key=row['key'];source=ROOT/row['source'];assert hashlib.sha256(source.read_bytes()).hexdigest()==row['sourceSha256']
        rgba=np.asarray(Image.open(source).convert('RGBA'));labs,n=label(rgba[:,:,3]>100)
        link=links[key];corner=corners[key]
        link_ids={p['componentLabel']for p in link['panels']}|{a['componentLabel']for a in link['arrows']}|{e['componentLabel']for p in link['panels']for e in p['attachedExtras']}
        cuts=[]
        for side,record in corner['corners'].items():
            if record.get('bbox')and((side=='left'and corner['left']!='-')or(side=='right'and corner['factions'])):cuts.append((side,record['bbox']))
        if row['cycle']=='c5':cuts.append(('own-heading',headings[key]['header']))
        known={m['componentLabel']:m for m in row['markers']};seen=set()
        for ident,sl in enumerate(find_objects(labs),1):
            if sl is None:continue
            ys,xs=sl;count=int((labs[sl]==ident).sum());l,t,r,b=xs.start,ys.start,xs.stop,ys.stop
            piece={'key':key,'componentLabel':ident,'bbox':[l,t,r,b],'pixels':count,'source':row['source']}
            if ident in link_ids:totals['linkComponents']+=1;continue
            overlaps=[]
            for name,(xl,yt,xr,yb)in cuts:
                overlap=max(0,min(r,xr)-max(l,xl))*max(0,min(b,yb)-max(t,yt))/((r-l)*(b-t))
                if overlap>.5:overlaps.append([name,overlap])
            if overlaps:
                totals['cornerOrHeadingComponents']+=1
                if count>=150:excluded.append({**piece,'cuts':overlaps})
                assert ident not in known,(key,ident,'marker is actually a corner/heading')
                continue
            if ident in known:
                seen.add(ident);m=known[ident];assert m['bbox']==piece['bbox']and m['pixels']==count
                totals['inventoriedMarkers']+=1
                if m['type']in('secret_number_banner','legacy_number_fragment','city_nameplate'):
                    labels_only.append({**piece,'type':m['type']})
            elif count<150:
                totals['smallFragments']+=1;small.append(piece)
            else:unexpected.append(piece)
        assert seen==set(known),(key,set(known)-seen)
        if not row['markers']:contexts.append(row)
    assert len(inventory['faces'])==511
    report={'faces':511,'totals':dict(totals),'unexpectedLargeComponents':unexpected,
            'smallFragments':small,'labels':labels_only,'excludedLargeComponents':excluded,
            'markerFreeFaces':contexts,'sourceHashesVerified':True}
    (OUT/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    boards(small,'small-fragments',True)
    boards(labels_only,'labels',False)
    full_contexts([r for r in inventory['faces']if r['key']in{p['key']for p in small+labels_only}],'label-contexts')
    full_contexts(contexts,'marker-free-contexts')
    # Every large excluded component is also shown to independently establish
    # the area rule has removed the expected corner/header, not a true marker.
    boards(excluded,'excluded-corners-headings',False,limit=100)
    print(json.dumps({'faces':511,'totals':dict(totals),'unexpectedLargeComponents':len(unexpected),'labels':len(labels_only),'smallFragments':len(small),'markerFreeFaces':len(contexts)}))


def boards(rows,name,small,limit=80):
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
    for start in range(0,len(rows),limit):
        selected=rows[start:start+limit];board=Image.new('RGB',(1600,160*((len(selected)+7)//8)),'#33454d');draw=ImageDraw.Draw(board)
        for i,row in enumerate(selected):
            x=i%8*200;y=i//8*160;l,t,r,b=row['bbox'];pad=25 if small else 4
            im=Image.open(ROOT/row['source']).convert('RGBA').crop((l-pad,t-pad,r+pad,b+pad));im.thumbnail((185,110))
            background=Image.new('RGBA',im.size,'#788284');background.alpha_composite(im)
            board.paste(background.convert('RGB'),(x+4,y+23))
            if small:
                scale=min(185/(r-l+pad*2),110/(b-t+pad*2),1)
                draw.rectangle((x+4+pad*scale,y+23+pad*scale,x+4+(pad+r-l)*scale,y+23+(pad+b-t)*scale),outline='#ffb25b',width=1)
            draw.text((x+4,y+3),row['key'][3:]+f' #{row["componentLabel"]}',font=font,fill='white')
            draw.text((x+4,y+135),f'{r-l}x{b-t} / {row["pixels"]}px '+row.get('type',''),font=font,fill='#d1d9dc')
        board.save(OUT/f'{name}-{start//limit+1:02}.jpg',quality=95)


def full_contexts(rows,name):
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
    for start in range(0,len(rows),12):
        selected=rows[start:start+12];board=Image.new('RGB',(1536,400*((len(selected)+3)//4)),'#26363d');draw=ImageDraw.Draw(board)
        for i,row in enumerate(selected):
            x=i%4*384;y=i//4*400
            im=Image.open(ROOT/row['source']).convert('RGBA');background=Image.new('RGBA',im.size,'#6e7a7d');background.alpha_composite(im)
            board.paste(background.convert('RGB').resize((384,384)),(x,y+16));draw.text((x+3,y),row['key'],font=font,fill='white')
        board.save(OUT/f'{name}-{start//12+1:02}.jpg',quality=95)


if __name__=='__main__':main()
