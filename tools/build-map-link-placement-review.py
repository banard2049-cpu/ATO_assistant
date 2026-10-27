"""Place audited native route vectors on real maps and build comparison boards.

Preview only: writes output/map-link-vector-review-20261025/placement-review/.
Stage SVGs first (--stage), render them with render-map-link-placement-review.cjs,
then run without arguments to build the annotated image boards and local index.
"""
from __future__ import annotations

import argparse
import base64
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_STORED

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
from scipy.ndimage import label, binary_dilation

from map_link_vectors import contour

ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'output/map-link-vector-review-20261025'
NATIVE=REVIEW/'native-samples'
OUT=REVIEW/'placement-review'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
BG='#14242d';CARD='#223741';TEXT='#edf3f1';MUTED='#b8cbd0';ACCENT='#9ddbc5'
FONT='C:/Windows/Fonts/msyh.ttc'
BOLD='C:/Windows/Fonts/msyhbd.ttc'


def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def font(size,bold=False):return ImageFont.truetype(BOLD if bold else FONT,size)
def js_object(path):
    text=path.read_text(encoding='utf-8-sig')
    return json.loads(text[text.index('{'):text.rindex('}')+1])
def svg(body):return f'<svg xmlns="{NS}" width="1024" height="1024" viewBox="0 0 1024 1024">{body}</svg>\n'
def children(root):return ''.join(ET.tostring(node,encoding='unicode')for node in root)
def key_label(key):
    parts=key.split('-');label=f'{parts[0].upper()} · {parts[2]}'
    if parts[0]=='c5':label+=' A（水下）'if key.endswith('front')else' B（水上）'
    return label


def inputs():
    native=read(NATIVE/'report.json')['records']
    inventory={row['key']:row for row in read(REVIEW/'inventory.json')['faces']}
    cycles={cycle['id']:cycle for cycle in js_object(ROOT/'map/map-data.js')['cycles']}
    return native,inventory,cycles


GRID_SPECS=[
    {'id':'c2','title':'C2 连续地图：019／020／021 周边','cycle':'c2','rows':[2,3,4],'cols':[4,5,6],'face':'front'},
    {'id':'c4','title':'C4 浅色地貌与主黑框：011 周边','cycle':'c4','rows':[7,8,9],'cols':[1,2,3],'face':'front'},
    {'id':'c5-a','title':'C5 A 面：040 周边','cycle':'c5','rows':[3,4,5],'cols':[9,10],'face':'front'},
    {'id':'c5-b','title':'C5 B 面：040 周边','cycle':'c5','rows':[3,4,5],'cols':[9,10],'face':'back'},
]


def stage():
    native,inventory,cycles=inputs()
    by_key=defaultdict(list)
    for row in native:by_key[row['key']].append(row)
    grids=[];needed=set(by_key)
    for spec in GRID_SPECS:
        tiles={(tile['row'],tile['col']):tile for tile in cycles[spec['cycle']]['tiles']}
        slots=[]
        for iy,row in enumerate(spec['rows']):
            for ix,col in enumerate(spec['cols']):
                tile=tiles.get((row,col))
                key=f'{spec["cycle"]}-tile-{tile["id"]}-{spec["face"]}'if tile else None
                slots.append({'x':ix,'y':iy,'key':key,'row':row,'col':col})
                if key:needed.add(key)
        grids.append({**spec,'slots':slots})
    for directory in ('svg','renders','qa-masks','boards'):(OUT/directory).mkdir(parents=True,exist_ok=True)
    protected={};assets=[];faces=[]
    for key in sorted(needed):
        base=ROOT/'map/images/hd1024/base'/f'{key}.png'
        overlay=ROOT/'map/images/hd1024/overlay'/f'{key}-corners.svg'
        for path in (base,overlay):protected[path.relative_to(ROOT).as_posix()]=sha(path)
        original=ET.parse(overlay).getroot()
        original_body=children(original)
        base_uri='data:image/png;base64,'+base64.b64encode(base.read_bytes()).decode()
        base_tag=f'<image data-layer="map-base" href="{base_uri}" width="1024" height="1024"/>'
        current=svg(base_tag+f'<g data-layer="current-overlay">{original_body}</g>')
        (OUT/'svg'/f'{key}-current.svg').write_text(current,encoding='utf-8')
        assets.append({'key':key,'variant':'current','svg':f'svg/{key}-current.svg','png':f'renders/{key}-current.png','width':2048 if key in by_key else 1024})
        if key not in by_key:continue
        row=inventory[key]
        source=ROOT/row['source'];assert sha(source)==row['sourceSha256']
        protected[row['source']]=sha(source)
        rgba=np.asarray(Image.open(source).convert('RGBA'))
        labs,_=label(rgba[:,:,3]>100)
        selected=np.zeros((1024,1024),dtype=bool);groups=[];allowed=np.zeros_like(selected)
        selected_ids=[]
        for sample in by_key[key]:
            panel=next(panel for panel in row['panels']if panel['id']==sample['panelId'])
            parts=[panel]+[arrow for arrow in row['arrows']if arrow['panelId']==sample['panelId']]
            if sample['lock']:parts+=panel['attachedExtras']
            for part in parts:
                selected|=labs==part['componentLabel'];selected_ids.append(part['componentLabel'])
            path=NATIVE/sample['vector'];protected[path.relative_to(ROOT).as_posix()]=sha(path)
            native_svg=ET.parse(path).getroot()
            groups.append(f'<g data-native-sample="{sample["id"]}">{children(native_svg)}</g>')
            l,t,r,b=sample['bbox'];allowed[max(0,t-3):min(1024,b+3),max(0,l-3):min(1024,r+3)]=True
        other=(rgba[:,:,3]>100)&~selected
        cleanup=binary_dilation(selected,iterations=3)&~binary_dilation(other,iterations=1)
        allowed|=cleanup
        cuts=contour(cleanup,tolerance=0,min_area=0)
        mask=('<defs><mask id="keep-placement" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
              '<rect width="1024" height="1024" fill="white"/>'
              f'<path d="{cuts}" fill="black" fill-rule="evenodd"/></mask></defs>')
        result=svg(base_tag+mask+f'<g data-layer="current-overlay" mask="url(#keep-placement)">{original_body}</g>'+''.join(groups))
        (OUT/'svg'/f'{key}-preview.svg').write_text(result,encoding='utf-8')
        Image.fromarray(allowed.astype(np.uint8)*255).save(OUT/'qa-masks'/f'{key}.png')
        assets.append({'key':key,'variant':'preview','svg':f'svg/{key}-preview.svg','png':f'renders/{key}-preview.png','width':2048})
        faces.append({'key':key,'cycle':key[:2],'samples':[sample['id']for sample in by_key[key]],'replacedComponents':sorted(set(selected_ids))})
    assert len(faces)==12 and sum(len(face['samples'])for face in faces)==37
    assert all(sha(ROOT/path)==digest for path,digest in protected.items())
    report={'installation':'none','coordinateSystem':'1024x1024; native SVG children placed at their original global coordinates',
            'comparisonLabels':['当前地图','矢量链接预览'],'nativeFaces':12,'nativePanels':37,
            'note':'Only the 37 audited native samples are replaced in these preview composites. Other links, internal routes and all existing corner artwork are retained.',
            'faces':faces,'grids':grids,'assets':assets,'protectedHashes':protected}
    (OUT/'placement-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'nativeFaces':12,'nativePanels':37,'stagedSvgAssets':len(assets),'protectedFiles':len(protected),'installation':'none'}))


def image(key,variant):
    candidate=OUT/'renders'/f'{key}-{variant}.png'
    if not candidate.exists()and variant=='preview':candidate=OUT/'renders'/f'{key}-current.png'
    return Image.open(candidate).convert('RGB')


def canvas(width,height,title,subtitle):
    board=Image.new('RGB',(width,height),BG);draw=ImageDraw.Draw(board)
    draw.text((36,24),title,font=font(36,True),fill=TEXT)
    draw.text((36,80),subtitle,font=font(20),fill=MUTED)
    return board,draw


def paste_map(board,im,box):
    x,y,w,h=box
    art=ImageOps.contain(im,(w,h),Image.Resampling.LANCZOS)
    board.paste(art,(x+(w-art.width)//2,y+(h-art.height)//2))


def save(board,filename,title,description,outputs):
    target=OUT/'boards'/filename
    board.save(target,quality=96,subsampling=0)
    thumb=board.copy();thumb.thumbnail((1100,850),Image.Resampling.LANCZOS)
    thumb.save(OUT/'boards'/filename.replace('.jpg','-thumb.jpg'),quality=90)
    outputs.append({'file':f'boards/{filename}','thumbnail':f'boards/{filename.replace(".jpg","-thumb.jpg")}',
                    'title':title,'description':description,'width':board.width,'height':board.height})


def full_board(keys,filename,title,outputs,by_key):
    tile=520;gap=18;block_width=1080;row_height=615
    board,draw=canvas(2220,145+math.ceil(len(keys)/2)*row_height,title,'每组左：当前地图　｜　右：矢量链接预览。底图和既有角标保持一致。')
    for i,key in enumerate(keys):
        x=30+i%2*1100;y=130+i//2*row_height
        draw.rounded_rectangle((x,y,x+block_width,y+row_height-18),10,fill=CARD)
        draw.text((x+14,y+10),f'{key_label(key)}　·　{len(by_key[key])} 处链接',font=font(22,True),fill=TEXT)
        draw.text((x+14,y+45),'当前地图',font=font(17),fill=MUTED)
        draw.text((x+tile+gap+14,y+45),'矢量链接预览',font=font(17),fill=ACCENT)
        for j,variant in enumerate(('current','preview')):
            paste_map(board,image(key,variant),(x+10+j*(tile+gap),y+70,tile,tile))
    save(board,filename,title,'完整地图放回对比；只替换标题注明的已审定链接。',outputs)


def context_crop(sample,padding=38,minimum=(320,210)):
    l,t,r,b=sample['bbox'];w=min(1024,max(minimum[0],r-l+padding*2));h=min(1024,max(minimum[1],b-t+padding*2))
    x=max(0,min(1024-w,round((l+r-w)/2)));y=max(0,min(1024-h,round((t+b-h)/2)))
    return [x,y,x+w,y+h]


def crop(im,box):
    ratio=im.width/1024
    return im.crop(tuple(round(v*ratio)for v in box))


def directions_board(samples,outputs):
    picks=[
        ['c1-tile-027-front--up-1','c1-tile-003-front--right-1','c1-tile-027-front--down-1','c1-tile-003-front--left-1'],
        ['c2-tile-021-front--up-1','c2-tile-019-front--right-1','c2-tile-021-front--down-1','c2-tile-019-front--left-1'],
        ['c3-tile-050-front--up-1','c3-tile-005-front--right-1','c3-tile-050-front--down-1','c3-tile-005-front--left-1'],
        ['c4-tile-011-front--up-1','c4-tile-011-front--right-1','c4-tile-011-front--down-1','c4-tile-011-front--left-1'],
        ['c5-tile-040-front--up-1','c5-tile-001-front--right-1','c5-tile-040-front--down-1','c5-tile-040-back--left-1'],
    ]
    board,draw=canvas(2220,2430,'04 · 五个循环 × 四个方向 · 带地图背景放大','每格上：当前地图　｜　下：矢量链接预览。保留周围地貌，检查大小、位置和对比度。')
    names=['上方','右侧','下方','左侧']
    for iy,row in enumerate(picks):
        for ix,ident in enumerate(row):
            sample=samples[ident];x=30+ix*550;y=132+iy*455
            draw.rounded_rectangle((x,y,x+530,y+438),8,fill=CARD)
            draw.text((x+12,y+8),f'{key_label(sample["key"])} · {names[ix]}',font=font(20,True),fill=TEXT)
            box=context_crop(sample)
            for j,variant in enumerate(('current','preview')):
                paste_map(board,crop(image(sample['key'],variant),box),(x+10,y+43+j*195,510,180))
                draw.text((x+17,y+48+j*195),'当前'if j==0 else'预览',font=font(16),fill='#ffffff',stroke_width=2,stroke_fill='#17252c')
    save(board,'04-directions-context.jpg','四个方向与五循环背景','20 组放回原位置的四边局部对比。',outputs)


def complex_board(samples,outputs):
    picks=[('c2-tile-019-front--left-1','三格＋锁，紧邻地图边缘'),('c2-tile-021-front--up-1','四格＋锁，检查接缝与箭头'),
           ('c2-tile-021-front--right-1','α 在最前，派系与号码排列'),('c2-tile-021-front--down-1','四格＋β，保留内部航路'),
           ('c5-tile-040-front--up-1','A 面顶部 α 与浅色派系格'),('c5-tile-040-front--down-2','A 面双下出口之一：α'),
           ('c5-tile-040-back--left-1','B 面尖顶格与 β，深浅底交换'),('c1-tile-027-front--down-1','城市横幅附近的底部链接')]
    board,draw=canvas(2220,1570,'05 · 复杂组合与邻近标记','每组左：当前地图　｜　右：矢量链接预览。重点查看分格白边、锁居中、字母与周边留白。')
    for i,(ident,note)in enumerate(picks):
        sample=samples[ident];x=30+i%2*1100;y=130+i//2*350
        draw.rounded_rectangle((x,y,x+1080,y+332),9,fill=CARD)
        draw.text((x+12,y+10),key_label(sample['key']),font=font(22,True),fill=TEXT)
        draw.text((x+12,y+42),note,font=font(19),fill=MUTED)
        box=context_crop(sample,padding=50,minimum=(350,220))
        for j,variant in enumerate(('current','preview')):
            paste_map(board,crop(image(sample['key'],variant),box),(x+10+j*535,y+78,525,235))
    save(board,'05-complex-context.jpg','多格、锁、字母与城市横幅','8 组高风险组合的地图背景局部对比。',outputs)


def grid_image(spec,variant,tile_size=300):
    result=Image.new('RGB',(len(spec['cols'])*tile_size,len(spec['rows'])*tile_size),'#263941')
    for slot in spec['slots']:
        x,y=slot['x']*tile_size,slot['y']*tile_size
        if slot['key']:
            result.paste(image(slot['key'],variant).resize((tile_size,tile_size),Image.Resampling.LANCZOS),(x,y))
        else:
            draw=ImageDraw.Draw(result);draw.rectangle((x,y,x+tile_size-1,y+tile_size-1),outline='#41545b')
    return result


def grid_board(specs,filename,title,outputs,by_key):
    tile=300;maxw=max(len(s['cols'])*tile for s in specs);maxh=max(len(s['rows'])*tile for s in specs)
    width=max(1500,100+2*maxw+35);height=145+len(specs)*(maxh+110)
    board,draw=canvas(width,height,title,'按现有地图行列排列。左：当前地图　｜　右：矢量链接预览。未选中的地图链接保持当前资源。')
    for i,spec in enumerate(specs):
        y=135+i*(maxh+110)
        draw.text((36,y),spec['title'],font=font(25,True),fill=TEXT)
        changed=[s['key'].split('-')[2]for s in spec['slots']if s['key']in by_key]
        draw.text((36,y+36),'本次预览链接：'+('、'.join(changed)or'无'),font=font(19),fill=ACCENT)
        for j,variant in enumerate(('current','preview')):
            grid=grid_image(spec,variant,tile)
            board.paste(grid,(36+j*(maxw+35),y+74))
    save(board,filename,title,'实际地图网格中比较链接牌的整体观感与相邻位置。',outputs)


def index(outputs):
    cards=''.join(f'<article><a href="{r["file"]}"><img src="{r["thumbnail"]}" alt="{r["title"]}"></a><h2><a href="{r["file"]}">{r["title"]}</a></h2><p>{r["description"]}</p><p>{r["width"]} × {r["height"]} · <a href="{r["file"]}">打开完整分辨率</a></p></article>'for r in outputs)
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>链接矢量放回地图 · 对比图集</title><style>*{box-sizing:border-box}body{margin:0;background:#14242d;color:#edf3f1;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1440px;margin:auto;padding:28px}h1{font-size:30px;margin:0 0 10px}p{color:#b8cbd0}a{color:#9ddbc5}.note{padding:14px 18px;background:#223741;border-left:3px solid #9ddbc5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,410px),1fr));gap:22px}article{background:#223741;border-radius:10px;overflow:hidden;padding:14px}article img{width:100%;height:310px;object-fit:contain;background:#102029}h2{font-size:20px}article p{font-size:14px}</style><main><h1>链接矢量放回地图 · 对比图集</h1><p class="note">8 张对比图，覆盖五个循环、12 个已审定地图面、37 处最新几何链接。仅生成预览，没有替换正式素材。图中未替换的链接和其他标记保持当前资源。</p><p>完整地图与局部网格：每组左侧为当前地图，右侧为矢量链接预览；四方向图每格上方为当前，下方为预览。所有对比共用同一底图与既有角标，保持实际坐标、宽高和比例。</p><p><a href="placement-manifest.json">合成范围与来源</a> · <a href="render-check.json">渲染与保护区域检查</a> · <a href="../native-samples/index.html">逐块原生路径样例</a></p><div class="grid">'''+cards+'</div></main></html>'
    html=html.replace('<a href="placement-manifest.json">','<a href="comparison-images.zip">下载全部 8 张高清图（ZIP）</a> · <a href="placement-manifest.json">')
    (OUT/'index.html').write_text(html,encoding='utf-8')


def boards():
    native,_,_=inputs();manifest=read(OUT/'placement-manifest.json')
    assert all(sha(ROOT/path)==digest for path,digest in manifest['protectedHashes'].items())
    by_key=defaultdict(list)
    for row in native:by_key[row['key']].append(row)
    samples={row['id']:row for row in native};outputs=[]
    full_board([key for key in by_key if key[:2]in('c1','c2')],'01-c1-c2-full-maps.jpg','01 · C1／C2 完整地图 · 5 面',outputs,by_key)
    full_board([key for key in by_key if key[:2]in('c3','c4')],'02-c3-c4-full-maps.jpg','02 · C3／C4 完整地图 · 3 面',outputs,by_key)
    full_board([key for key in by_key if key[:2]=='c5'],'03-c5-full-maps.jpg','03 · C5 完整地图 · A／B 面与双出口',outputs,by_key)
    directions_board(samples,outputs);complex_board(samples,outputs)
    grids={spec['id']:spec for spec in manifest['grids']}
    grid_board([grids['c2']],'06-c2-map-grid.jpg','06 · C2 相邻地图中的效果',outputs,by_key)
    grid_board([grids['c4']],'07-c4-map-grid.jpg','07 · C4 相邻地图中的效果',outputs,by_key)
    grid_board([grids['c5-a'],grids['c5-b']],'08-c5-ab-map-grids.jpg','08 · C5 A／B 面相邻地图对比',outputs,by_key)
    assert len(outputs)==8
    index(outputs)
    with ZipFile(OUT/'comparison-images.zip','w',compression=ZIP_STORED)as archive:
        for row in outputs:archive.write(OUT/row['file'],Path(row['file']).name)
    (OUT/'boards-report.json').write_text(json.dumps({'installation':'none','boards':outputs,'archive':'comparison-images.zip','nativeFaces':12,'nativePanels':37,'allProtectedSourcesUnchanged':True},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'boards':len(outputs),'nativeFaces':12,'nativePanels':37,'installation':'none'}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--stage',action='store_true');args=parser.parse_args()
    stage()if args.stage else boards()
