"""Reuse complete original token ink as transparent fixed components.

This does not invent a silhouette or trace a scan into polygons. All original
pixels keep their original coordinates. Only the separate decorative backing
is excluded by a central-field and neutral-ink selector. Canvas size is kept;
no rectangular screenshot crop is used as visible replacement artwork.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label,binary_dilation

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'tools/map-marker-vector-source/original-components'
OUT=ROOT/'output/map-marker-hd-review-20261026/original-components'
SOURCES={'oasis':'map/tokens/last_visited_oasis.png','silver_ruin':'map/tokens/silver_remnant.png'}

def main():
    DEST.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);records=[]
    for ident,relative in SOURCES.items():
        path=ROOT/relative;im=Image.open(path).convert('RGBA');data=np.asarray(im);h,w=data.shape[:2]
        rgb=data[:,:,:3].astype(float);lum=rgb@np.array([.299,.587,.114]);chroma=rgb.max(2)-rgb.min(2)
        yy,xx=np.indices((h,w));field=(xx-w/2)**2+(yy-h/2)**2<(min(w,h)*.35)**2
        eligible=field&(chroma<28)&(data[:,:,3]>0)
        coverage=np.clip((244-lum)/216,0,1)*data[:,:,3]/255
        core=eligible&(coverage>.15);labs,n=label(core);counts=np.bincount(labs.ravel());counts[0]=0
        keep=counts>=4;keep[0]=False
        if ident=='silver_ruin':
            for index in range(1,n+1):
                if not keep[index]:continue
                py,px=np.where(labs==index)
                if (px.mean()-w/2)**2+(py.mean()-h/2)**2>(min(w,h)*.28)**2:keep[index]=False
        core=keep[labs]
        # Keep original antialias only beside proven ink; pale paper texture
        # outside a glyph does not become a field of stray opaque pixels.
        support=binary_dilation(core,iterations=1)&eligible
        alpha=np.round(np.where(support,coverage,0)*255).astype(np.uint8)
        rgba=np.zeros((h,w,4),np.uint8);rgba[:,:,3]=alpha
        assert alpha.max()>240 and (alpha>128).sum()>500,ident
        ys,xs=np.where(alpha>0);bounds=[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1]
        assert bounds[0]>4 and bounds[1]>4 and bounds[2]<w-4 and bounds[3]<h-4,ident
        out=DEST/f'{ident}.png';Image.fromarray(rgba).save(out)
        records.append({'id':ident,'kind':'original-raster-alpha','file':out.relative_to(ROOT).as_posix(),
                        'source':relative,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                        'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'width':w,'height':h,'inkBBox':bounds,
                        'method':'Original token neutral ink preserved at original pixel coordinates; separate backing omitted; complete canvas retained.',
                        'canvasCropped':False,'newSilhouetteInvented':False,'nativeVector':False,
                        'inkPixels':int((alpha>128).sum()),'transparentPadding':True})
        original=Image.new('RGBA',im.size,'#f4f1e7');original.alpha_composite(im)
        result=Image.new('RGBA',im.size,'#f4f1e7');result.alpha_composite(Image.fromarray(rgba))
        page=Image.new('RGB',(1100,620),'#596b70');draw=ImageDraw.Draw(page);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
        draw.text((18,10),f'{ident} | original complete token / complete transparent component',font=font,fill='white')
        page.paste(original.convert('RGB').resize((500,500)),(20,55));page.paste(result.convert('RGB').resize((500,500)),(575,55))
        draw.text((20,575),f'Original canvas preserved: {w} x {h}; ink bounds {bounds}; no visible rectangular crop',font=font,fill='white')
        page.save(OUT/f'{ident}-original-vs-component.jpg',quality=96)
    manifest={'version':'20261026-original-components1','policy':'User-requested original-image reuse. These are honest native-resolution raster components, not claimed to be original vectors. Full transparency and canvas retained.',
              'components':{r['id']:r for r in records}}
    (DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(records,ensure_ascii=False))

if __name__=='__main__':
    raise SystemExit('This two-component prototype is superseded. Use tools/extract-map-original-sprite-components.py for the complete audited original library.')
