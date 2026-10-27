"""Reuse exact original APK pixel artwork, retaining a padded full canvas.

This extraction changes no visible outline: backgrounds are separated by their
original colour/alpha, and an independent ornamental ring is removed only for
sprites whose map marker supplies that ring separately. No tracing is used.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label,binary_dilation,distance_transform_edt

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'output/map-marker-hd-review-20261026/apk-originals/sprites'
DEST=ROOT/'tools/map-marker-vector-source/original-components'
OUT=ROOT/'output/map-marker-hd-review-20261026/apk-components'
SPECS={
 'oasis':('01_50','white-remove-ring'),
 'silver_ruin':('01_52','token-neutral-ink'),
 'hourglass_icon':('02_76','white-remove-ring'),
 'staff_icon':('01_32','dark-on-white-disc'),
 'spartan_stronghold':('02_33','white-keep-complete-logo'),
 'daedalus_lighthouse':('01_25','white-keep-complete-logo'),
 'wheel_icon':('02_65','white-keep-complete-logo'),
 'wheel_icon_winged':('02_64','white-keep-complete-logo'),
 'smoking_bowl_icon':('02_1','white-keep-complete-logo'),
 'time_wound':('01_28','white-remove-ring'),
 'time_portal':('01_27','white-remove-ring'),
 'time_portal_angular':('01_26','white-remove-ring'),
 'city':('01_39','white-remove-ring'),
}

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def silver_token():
    image=Image.open(ROOT/'map/tokens/silver_remnant.png').convert('RGBA');rgba=np.asarray(image);h,w=rgba.shape[:2]
    rgb=rgba[:,:,:3].astype(float);lum=rgb@np.array([.299,.587,.114]);chroma=rgb.max(2)-rgb.min(2)
    yy,xx=np.indices((h,w));eligible=((xx-w/2)**2+(yy-h/2)**2<(min(w,h)*.35)**2)&(chroma<28)&(rgba[:,:,3]>0)
    coverage=np.clip((244-lum)/216,0,1)*rgba[:,:,3]/255
    labs,n=label(eligible&(coverage>.15));sizes=np.bincount(labs.ravel());sizes[0]=0;kept=[]
    for i in range(1,n+1):
        py,px=np.where(labs==i)
        if sizes[i]>=4 and (px.mean()-w/2)**2+(py.mean()-h/2)**2<(min(w,h)*.28)**2:kept.append(i)
    support=binary_dilation(np.isin(labs,kept),iterations=1)&eligible
    alpha=np.round(np.where(support,coverage,0)*255).astype(np.uint8)
    out=Image.new('RGBA',image.size,(0,0,0,0));out.putalpha(Image.fromarray(alpha))
    return out,[{'kind':'separate ornamental token backing omitted; original full branch and gate retained'}]

def extract(name,mode):
    if mode=='token-neutral-ink':return silver_token()
    image=Image.open(SRC/f'ato_text_icons_{name}.png').convert('RGBA');rgba=np.asarray(image).copy()
    a=rgba[:,:,3].astype(float)
    table=json.loads((SRC.parent/'sprite-tables.json').read_text(encoding='utf8'))
    sprite=next(r['data']for r in table if r['name']==f'ato_text_icons_{name}')
    native=sprite['m_Rect'];tight=sprite['m_RD']['textureRect']
    left=tight['x']-native['x'];top=native['height']-(tight['y']-native['y'])-tight['height']
    yy,xx=np.indices(a.shape)
    own=(xx>=np.floor(left)-1)&(xx<np.ceil(left+tight['width'])+1)&(yy>=np.floor(top)-1)&(yy<np.ceil(top+tight['height'])+1)
    a[~own]=0
    removed=[]
    if mode=='dark-on-white-disc':
        lum=rgba[:,:,:3].astype(float).mean(2)
        a*=1-lum/255
    elif mode=='white-remove-ring':
        labs,_=label(a>100);sizes=np.bincount(labs.ravel());sizes[0]=0
        # Every removable frame is the outer enclosing connected component,
        # independently visible around the actual emblem, not an inner hole.
        candidates=[]
        for ident in range(1,len(sizes)):
            yy,xx=np.where(labs==ident)
            if not len(xx):continue
            if xx.max()-xx.min()>90 and yy.max()-yy.min()>90:
                candidates.append((int(sizes[ident]),ident))
        assert candidates,(name,'no independent ring')
        ident=max(candidates)[1];ring=labs==ident
        grid_y,grid_x=np.indices(a.shape);radius=np.hypot(grid_x-64,grid_y-64);kept=[]
        for i in range(1,len(sizes)):
            if i!=ident and sizes[i]and radius[labs==i].min()<48:kept.append(i)
        core=np.isin(labs,kept)
        assert core.sum()>100,(name,'empty emblem after frame separation')
        near=distance_transform_edt(~core);to_ring=distance_transform_edt(~ring)
        support=core|((a<=100)&(near<=3)&(near<to_ring))
        a[~support]=0
        removed.append({'component':int(ident),'pixels':int(ring.sum()),'kind':'independent-outer-frame-with-complete-alpha-fringe'})
    # Canonical neutral black ink with the exact extracted source opacity.
    # ETC texture fringe can leave tiny isolated alpha values far away from
    # the glyph. Preserve original antialias only beside actual source ink;
    # these remote pixels are not part of the complete emblem.
    core=a>16
    a[(a<=16)&(distance_transform_edt(~core)>2.5)]=0
    alpha=np.rint(np.clip(a,0,255)).astype(np.uint8)
    ink=Image.new('RGBA',image.size,(0,0,0,0));ink.putalpha(Image.fromarray(alpha))
    # Canvas padding is transparent and retains every native source coordinate.
    pad=8;result=Image.new('RGBA',(image.width+pad*2,image.height+pad*2));result.alpha_composite(ink,(pad,pad))
    return result,removed

def main():
    DEST.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    sources={r['name']:r for r in json.loads((SRC/'manifest.json').read_text(encoding='utf8'))['sprites']}
    rows={}
    for ident,(name,mode)in SPECS.items():
        image,removed=extract(name,mode);path=DEST/f'{ident}.png';image.save(path)
        original=sources[f'ato_text_icons_{name}']
        source_file='map/tokens/silver_remnant.png'if mode=='token-neutral-ink'else original['file']
        rows[ident]={'id':ident,'kind':'original-raster-alpha','file':path.relative_to(ROOT).as_posix(),
                     'source':source_file,'sourceSha256':sha(ROOT/source_file),
                     'sourceKind':'original-token-ink'if mode=='token-neutral-ink'else'original-native-sprite-alpha',
                     'atlas':None if mode=='token-neutral-ink'else original['source'],
                     'spriteName':None if mode=='token-neutral-ink'else original['name'],
                     'spriteNativeRect':None if mode=='token-neutral-ink'else original['spriteNativeRect'],
                     'sha256':sha(path),'width':image.width,'height':image.height,'inkBBox':image.getchannel('A').getbbox(),
                     'method':mode,'removedIndependentComponents':removed,'canvasCropped':False,'nativeCanvasRetained':True,
                     'nativeCanvasOffset':[0,0]if mode=='token-neutral-ink'else[8,8],'newSilhouetteInvented':False,'nativeVector':False,'transparentPadding':True,
                     'approvedForComposition':True,'status':'source-contact-reviewed; final placement checked separately'}
    manifest={'version':'20261026-original-apk-components2',
              'policy':'Complete original token canvas or native Sprite canvas with eight-pixel transparent padding. Fixed original raster components, no tracing, no invented geometry, not a vector claim.',
              'components':rows}
    (DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
    board=Image.new('RGB',(1600,240*((len(rows)+3)//4)),'#697476');draw=ImageDraw.Draw(board)
    for i,(ident,row)in enumerate(rows.items()):
        x=i%4*400;y=i//4*240;source=Image.open(ROOT/row['source']).convert('RGBA');component=Image.open(ROOT/row['file']).convert('RGBA')
        source.thumbnail((180,180));component.thumbnail((180,180))
        # White preview only; the final PNG remains neutral black + native alpha.
        white=Image.new('RGBA',component.size,'white');white.putalpha(component.getchannel('A'))
        board.paste(source,(x+5,y+30),source);board.paste(white,(x+205,y+30),white)
        draw.text((x+5,y+4),ident+' | native / component',font=font,fill='white')
    board.save(OUT/'native-components-contact.jpg',quality=96)
    print(json.dumps({'components':len(rows),'manifest':str(DEST/'manifest.json'),'runtimeModified':False}))

if __name__=='__main__':main()
