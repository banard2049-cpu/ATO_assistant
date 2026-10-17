"""Extract C1–C3 printed back labels onto one shared background per cycle."""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
from skimage.restoration import denoise_bilateral

ROOT=Path(__file__).resolve().parents[1]
IMAGES=ROOT/'map/images'
DEST=IMAGES/'card-backs'
REPORT=ROOT/'output/map-card-backs-compact-20261017'
BACKUP=ROOT/'output/backups/map-before-hd-20261017-005523/map/images'
ARCHIVE=ROOT/'export/map-assets-archive-20261017'
if not REPORT.exists():REPORT=ARCHIVE/'output/map-card-backs-compact-20261017'
if not BACKUP.exists():BACKUP=ARCHIVE/'output/backups/map-before-hd-20261017-005523/map/images'

def digest(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def original_path(name):
    current=IMAGES/name
    return current if current.exists() else BACKUP/name

def choose_base(cycle,paths):
    candidates=[]
    for p in paths:
        if '-alt-' in p.name or '-T' in p.name:continue
        with Image.open(p) as im:rgb=np.asarray(im.convert('RGB'),dtype=float);size=im.size
        gray=rgb.mean(axis=2);residual=np.abs(gray-ndi.gaussian_filter(gray,1))
        samples=[residual[y:y+110,x:x+110].ravel() for y,x in [(35,35),(35,650),(650,35),(650,650)]]
        weave=float(np.median(np.concatenate(samples)))
        gy,gx=np.gradient(ndi.gaussian_filter(gray,2));sharp=float(np.percentile(np.hypot(gx,gy),97))
        candidates.append({'file':p.name,'size':list(size),'weave':weave,'inkEdge':sharp,'pixels':size[0]*size[1]})
    max_pixels=max(r['pixels'] for r in candidates)
    highest=[r for r in candidates if r['pixels']==max_pixels]
    cutoff=float(np.median([r['inkEdge'] for r in highest]))*.9
    chosen=min((r for r in highest if r['inkEdge']>=cutoff),key=lambda r:r['weave'])
    return original_path(chosen['file']),{'chosen':chosen,'candidates':candidates,'minimumInkEdge':cutoff}

def make_base(chosen):
    rgb=np.array(Image.open(chosen).convert('RGB'));h,w=rgb.shape[:2]
    label=cut_labels(rgb)[0][1];ys,xs=np.where(label>0)
    x0=max(0,int(xs.min())-8);x1=min(w,int(xs.max())+9);y0=max(0,int(ys.min())-8);y1=min(h,int(ys.max())+9)
    base=rgb.copy();hh=y1-y0;ww=x1-x0
    sample=rgb[y0:y1,20:20+ww].astype(float)
    yy,xx=np.mgrid[:hh,:ww]
    weight=np.clip(np.minimum.reduce([xx,yy,ww-1-xx,hh-1-yy])/4,0,1)[...,None]
    base[y0:y1,x0:x1]=np.round(sample*weight+rgb[y0:y1,x0:x1]*(1-weight)).astype('uint8')
    # Fill just the four rounded physical cutouts. No full-width/full-height
    # strips are cropped, reflected or replaced along any of the four edges.
    radius=40
    yy,xx=np.mgrid[:radius,:radius]
    corner=(radius-xx)**2+(radius-yy)**2>radius**2
    white=np.zeros((h,w),bool)
    white[:radius,:radius]=corner
    white[:radius,-radius:]=corner[:,::-1]
    white[-radius:,:radius]=corner[::-1,:]
    white[-radius:,-radius:]=corner[::-1,::-1]
    before_corners=base.copy()
    if white.any():
        _,indices=ndi.distance_transform_edt(white,return_indices=True)
        yy,xx=np.where(white);ny=indices[0,yy,xx];nx=indices[1,yy,xx]
        sy=np.clip(2*ny-yy,0,h-1);sx=np.clip(2*nx-xx,0,w-1)
        bad=white[sy,sx];sy[bad]=ny[bad];sx[bad]=nx[bad]
        base[yy,xx]=base[sy,sx]
    assert np.array_equal(base[~white],before_corners[~white])
    # Some bilateral implementations use image-wide range lookup tables.
    # Keep the unextended cleaning result everywhere outside a small corner
    # blend footprint, so corner repair cannot alter any straight edge.
    filtered=denoise_bilateral(before_corners,sigma_color=.09,sigma_spatial=1.4,win_size=7,mode='reflect',channel_axis=-1)
    corner_filtered=denoise_bilateral(base,sigma_color=.09,sigma_spatial=1.4,win_size=7,mode='reflect',channel_axis=-1)
    blend=ndi.binary_dilation(white,iterations=5)
    filtered[blend]=corner_filtered[blend]
    result=Image.fromarray(np.clip(np.round(filtered*255),0,255).astype('uint8')).resize((1024,1024),Image.Resampling.LANCZOS)
    result=result.filter(ImageFilter.UnsharpMask(radius=1,percent=65,threshold=8))
    ar=np.array(result)
    corner_max=[]
    for yy,xx in [(0,0),(0,992),(992,0),(992,992)]:
        part=ar[yy:yy+32,xx:xx+32];corner_max.append(int(np.min(part,axis=2).max()))
    assert max(corner_max)<165,('White corner remains',chosen.name,corner_max)
    return result,{'source':chosen.name,'sourceSize':[w,h],'whiteCornerPixelsExtended':int(white.sum()),
                   'borderExtendedSourcePixels':0,'cornerRadiusSourcePixels':radius,
                   'extensionOutsideCornerMaskChangedPixels':0,'cornerMaxNeutralChannel':corner_max,
                   'headerCleared':[x0,y0,x1,y1],'filter':'bilateral sigmaColor=.09 sigmaSpatial=1.4; mild edge sharpening; label crops untouched'}

def cut_labels(rgb, special=False):
    h,w=rgb.shape[:2]
    bright=(np.min(rgb,axis=2)>137)&((np.max(rgb,axis=2).astype(int)-np.min(rgb,axis=2))<95)
    bright[:12]=False;bright[150:]=False;bright[:,:200]=False;bright[:,680:]=False
    clean=ndi.binary_closing(bright,structure=np.ones((3,3),bool))
    labels,count=ndi.label(clean)
    alpha_im=Image.new('L',(w,h));draw=ImageDraw.Draw(alpha_im)
    accepted=[]
    for index,box in enumerate(ndi.find_objects(labels),1):
        if box is None:continue
        ys,xs=box;bw=xs.stop-xs.start;bh=ys.stop-ys.start
        points=np.argwhere(labels[box]==index)[:,::-1]+[xs.start,ys.start]
        if bw<24 or bh<20 or len(points)<80:continue
        hull=ConvexHull(points)
        if hull.volume<300:continue
        draw.polygon([tuple(p) for p in points[hull.vertices]],fill=255)
        accepted.append([xs.start,ys.start,bw,bh])
    assert accepted, 'No printed header plate found'
    # Keep its dark outer stroke and antialiasing rather than clipping the
    # white border. These pixels still come from the individual original.
    alpha=ndi.binary_dilation(np.array(alpha_im)>0).astype('uint8')*255
    pieces=[('number',alpha)]
    if special:
        paper=(np.min(rgb,axis=2)>115)&((np.max(rgb,axis=2).astype(int)-np.min(rgb,axis=2))<110)
        paper[:165]=0;paper[720:]=0;paper[:,:120]=0;paper[:,730:]=0
        paper=ndi.binary_closing(paper,structure=np.ones((5,5),bool))
        labeled,count=ndi.label(paper);sizes=np.bincount(labeled.ravel());sizes[0]=0
        component=labeled==int(np.argmax(sizes))
        assert component.sum()>20000,'Special back instruction missing'
        special_alpha=ndi.binary_dilation(ndi.binary_fill_holes(component)).astype('uint8')*255
        pieces.append(('instruction',special_alpha))
    return pieces

def generate():
    DEST.mkdir(exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True)
    (DEST/'numbers').mkdir(exist_ok=True)
    records={};bases={};report=[];base_quality={}
    for cycle in ['c1','c2','c3']:
        paths=sorted(IMAGES.glob(cycle+'-tile-*-back.*'))
        assert len(paths)=={'c1':94,'c2':84,'c3':92}[cycle]
        chosen,selection=choose_base(cycle,paths);base_im,processing=make_base(chosen)
        base_quality[cycle]={'selection':selection,'processing':processing}
        base_path=DEST/(cycle+'-base.png');base_im.save(base_path,compress_level=9)
        bases[cycle]='./images/card-backs/'+base_path.name
        for path in paths:
            rgb=np.array(Image.open(path).convert('RGB'));h,w=rgb.shape[:2]
            pieces=[]
            for kind,alpha in cut_labels(rgb,'-alt-' in path.stem):
                ys,xs=np.where(alpha>0);box=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
                x0,y0,x1,y1=box
                rgba=np.dstack((rgb,alpha));rgba[alpha==0]=0
                cropped=Image.fromarray(rgba).crop(tuple(box))
                target=DEST/'numbers'/(path.stem+('-instruction' if kind=='instruction' else '')+'.png')
                cropped.save(target,compress_level=9)
                with Image.open(target) as check:assert check.tobytes()==cropped.tobytes()
                pieces.append({'src':'./images/card-backs/numbers/'+target.name,'kind':kind,
                               'x':100*x0/w,'y':100*y0/h,'width':100*(x1-x0)/w,'height':100*(y1-y0)/h,
                               'bbox':box})
            records[path.stem]={'cycle':cycle,'pieces':pieces}
            report.append({'file':path.name,'sha256':digest(path),'bytes':path.stat().st_size,'size':[w,h],'pieces':pieces})
        print(cycle,'generated',len(paths),'card backs',flush=True)
    registry={'version':'20261017-shared-backs1','bases':bases,'backs':records}
    (REPORT/'registry.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (REPORT/'sources.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (REPORT/'base-quality.json').write_text(json.dumps(base_quality,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    make_preview(registry,report)
    print(json.dumps({'originalBytes':sum(r['bytes'] for r in report),'newBytes':sum(p.stat().st_size for p in DEST.rglob('*.png')),'faces':len(records)},ensure_ascii=False),flush=True)

def make_preview(registry,rows):
    font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',18)
    picks=['c1-tile-001-back.jpg','c1-tile-T00-back.jpg','c1-tile-009-alt-back.jpg',
           'c1-tile-022-alt-back.jpg','c2-tile-038-back.png','c3-tile-059-back.png']
    sheet=Image.new('RGB',(3*355,6*390),'#e5e8df');d=ImageDraw.Draw(sheet)
    for i,name in enumerate(picks):
        row=next(r for r in rows if r['file']==name);entry=registry['backs'][Path(name).stem]
        original=Image.open(original_path(name)).convert('RGBA').resize((1024,1024),Image.Resampling.LANCZOS)
        base=Image.open(ROOT/'map'/registry['bases'][entry['cycle']].removeprefix('./')).convert('RGBA')
        layers=Image.new('RGBA',(1024,1024))
        for piece in entry['pieces']:
            image=Image.open(ROOT/'map'/piece['src'].removeprefix('./')).convert('RGBA')
            size=tuple(round(piece[k]/100*1024) for k in ['width','height'])
            image=image.resize(size,Image.Resampling.LANCZOS)
            layers.alpha_composite(image,tuple(round(piece[k]/100*1024) for k in ['x','y']))
        result=Image.alpha_composite(base,layers)
        checker=Image.alpha_composite(Image.new('RGBA',layers.size,'#9ea99e'),layers)
        for j,im in enumerate([original,checker,result]):
            sheet.paste(im.convert('RGB').resize((340,340),Image.Resampling.LANCZOS),(j*355+7,i*390+30))
            d.text((j*355+7,i*390+7),['原卡背','独立编号及特殊说明层','共用底图合成'][j],font=font,fill='#263c2a')
        d.text((7,i*390+370),name,font=font,fill='#263c2a')
    sheet.save(REPORT/'对照.jpg',quality=96,subsampling=0)
    # Review every header at approximately native scale; no number is rebuilt.
    for cycle in ['c1','c2','c3']:
        items=[r for r in rows if r['file'].startswith(cycle+'-')]
        contact=Image.new('RGB',(6*265,((len(items)+5)//6)*140),'#a6ada2');dd=ImageDraw.Draw(contact)
        for i,row in enumerate(items):
            piece=registry['backs'][Path(row['file']).stem]['pieces'][0]
            im=Image.open(ROOT/'map'/piece['src'].removeprefix('./')).convert('RGBA')
            bg=Image.new('RGBA',im.size,'#a6ada2');bg.alpha_composite(im);bg.thumbnail((255,100))
            x=i%6*265;y=i//6*140;contact.paste(bg.convert('RGB'),(x,y));dd.text((x,y+103),row['file'].replace('-tile-',' / ').replace('-back',''),font=font,fill='#223321')
        contact.save(REPORT/(cycle+'-全部编号.jpg'),quality=96,subsampling=0)

def install():
    registry=json.loads((REPORT/'registry.json').read_text(encoding='utf-8'))
    rows=json.loads((REPORT/'sources.json').read_text(encoding='utf-8'))
    assert len(registry['backs'])==270
    quality=json.loads((REPORT/'base-quality.json').read_text(encoding='utf-8'))
    for cycle,base_path in registry['bases'].items():
        assert (ROOT/'map'/base_path.removeprefix('./')).is_file()
        assert max(quality[cycle]['processing']['cornerMaxNeutralChannel'])<165
    # Validate all exact source paths and the verified existing full backup
    # before retiring any duplicate runtime background image.
    for row in rows:
        p=(IMAGES/row['file']).resolve()
        assert p.parent==IMAGES.resolve() and p.name.startswith(('c1-tile-','c2-tile-','c3-tile-'))
        assert digest(p)==row['sha256']==digest(BACKUP/p.name)
        assert all((ROOT/'map'/piece['src'].removeprefix('./')).is_file() for piece in row['pieces'])
    for p in [ROOT/'map/tile-artwork.js',ROOT/'map/index.html']:
        saved=REPORT/(p.name+'.before-install');saved.write_bytes(p.read_bytes())
    (ROOT/'map/tile-back-data.js').write_text('window.ATO_MAP_BACK_DATA = '+json.dumps(registry,ensure_ascii=False,indent=2)+';\n',encoding='utf-8',newline='\n')
    for row in rows:(IMAGES/row['file']).unlink()
    report={'cycles':['c1','c2','c3'],'sharedBases':3,'cardBacks':270,'originalBytes':sum(r['bytes'] for r in rows),
            'installedBytes':sum(p.stat().st_size for p in DEST.rglob('*.png')),'backup':str(BACKUP),
            'originalPixelsPreservedInLabelPatches':True,'specialInstructions':7,'c4c5Untouched':True}
    report['savedBytes']=report['originalBytes']-report['installedBytes']
    report['baseQuality']={c:q['processing'] for c,q in quality.items()}
    (DEST/'installation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False),flush=True)

def refine_bases():
    quality={};font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',19)
    previous=json.loads((REPORT/'base-quality.json').read_text(encoding='utf-8')) if (REPORT/'base-quality.json').exists() else {}
    sheet=Image.new('RGB',(1536,560),'#e5e8df');d=ImageDraw.Draw(sheet)
    for i,cycle in enumerate(['c1','c2','c3']):
        paths=sorted(IMAGES.glob(cycle+'-tile-*-back.*')) or sorted(BACKUP.glob(cycle+'-tile-*-back.*'))
        if cycle in previous:
            selection=previous[cycle]['selection'];chosen=original_path(selection['chosen']['file'])
        else:chosen,selection=choose_base(cycle,paths)
        im,processing=make_base(chosen)
        im.save(DEST/(cycle+'-base.png'),compress_level=9)
        quality[cycle]={'selection':selection,'processing':processing}
        sheet.paste(im.resize((512,512),Image.Resampling.LANCZOS),(i*512,0))
        d.text((i*512+8,516),cycle.upper()+' · '+chosen.name,font=font,fill='#263c2a')
    (REPORT/'base-quality.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    sheet.save(REPORT/'底图预览.jpg',quality=97,subsampling=0)
    make_preview(json.loads((REPORT/'registry.json').read_text(encoding='utf-8')),json.loads((REPORT/'sources.json').read_text(encoding='utf-8')))
    print(json.dumps({c:q['processing'] for c,q in quality.items()},ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');parser.add_argument('--bases-only',action='store_true');args=parser.parse_args()
    install() if args.install else refine_bases() if args.bases_only else generate()
