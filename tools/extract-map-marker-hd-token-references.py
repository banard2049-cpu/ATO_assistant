"""Copy unresampled original token textures and explicit pixel-reference crops."""
from pathlib import Path
import json,hashlib,shutil
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/tokens'
DEST=ROOT/'tools/map-marker-vector-source/hd-sources/token-originals'

def main():
    DEST.mkdir(parents=True,exist_ok=True)
    rows=json.loads((OUT/'token-images.json').read_text(encoding='utf8'))
    chosen=[('oasis',11,[65,100,350,345],'same printed silhouette: three palms, domed central shelter and crescent ground; full glyph plus margin'),
            ('silver_ruin',171,[95,95,325,325],'same printed silhouette: gate, branching figure and central person; full glyph plus margin'),
            ('daedalus_candidate',37,[145,125,335,350],'tall flame-topped tower; possible related Daedalus reference, not striped staff; exact-match not proven'),
            ('spartan_candidate',39,[165,180,1015,1020],'possible related fortress; source-map match not yet proven'),
            ('lighthouse_candidate',203,[146,135,1040,1030],'same-game lighthouse composition; includes dock and wave, map silhouette differs'),
            ('bull_head_reference',257,[155,170,324,330],'bull head is partial reference only, no hourglass torso')]
    manifest=[]
    board=Image.new('RGB',(1800,1100),'#697579');dr=ImageDraw.Draw(board);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)
    for i,(ident,index,box,note)in enumerate(chosen):
        row=rows[index];source=Path(row['file']);target=DEST/f'{ident}-token{source.suffix}'
        shutil.copyfile(source,target)
        assert target.read_bytes()==source.read_bytes()
        im=Image.open(source);crop=im.crop(box);crop_path=DEST/f'{ident}-reference-crop.png';crop.save(crop_path)
        x=i%3*600;y=i//3*550
        dr.text((x+5,y+5),ident+f' · {im.width}x{im.height} / crop {crop.width}x{crop.height}',font=font,fill='white')
        preview=im.convert('RGBA');preview.thumbnail((280,440),Image.Resampling.LANCZOS);board.paste(preview,(x+5,y+40),preview)
        preview=crop.convert('RGBA');preview.thumbnail((290,440),Image.Resampling.LANCZOS);board.paste(preview,(x+300,y+40),preview)
        manifest.append({'id':ident,'tokenContactIndex':index,'original':str(target.relative_to(ROOT)).replace('\\','/'),
                         'sourceFile':str(source),'sourceSha256':row['sha256'],'originalDimensions':[im.width,im.height],
                         'crop':str(crop_path.relative_to(ROOT)).replace('\\','/'),'cropPixels':box,'cropDimensions':[crop.width,crop.height],
                         'cropMethod':'exact rectangular crop from original pixels; no resize, denoise, threshold or tracing',
                         'references':row['references'],'finding':note,'runtimeModified':False})
    board.save(OUT/'best-token-source-references.jpg',quality=96)
    (DEST/'manifest.json').write_text(json.dumps({'method':'Byte-identical local TTS original copies, pixel-exact crop references only. No visible contour output.','sources':manifest},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps([{'id':r['id'],'file':r['original'],'dimensions':r['originalDimensions']}for r in manifest]))

if __name__=='__main__':main()
