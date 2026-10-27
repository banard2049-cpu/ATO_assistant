"""Render every known map password from actual installed SVGs and originals."""
from pathlib import Path
import argparse,hashlib,html,json,math,os,subprocess
import xml.etree.ElementTree as ET
from PIL import Image,ImageDraw,ImageFont
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/password-audit'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text(encoding='utf8'))

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--staged',action='store_true');args=parser.parse_args()
 OUT.mkdir(exist_ok=True,parents=True)
 inventory=load(ROOT/'tools/map-marker-vector-source/inventory.json')
 hidden=load(ROOT/'tools/map-hidden-number-regions.json')['tiles']
 repairs=load(ROOT/'tools/map-mask-repairs.json')['tiles']
 rows=[]
 for face in inventory['faces']:
  banners=[m for m in face['markers']if m['type']=='secret_number_banner']
  numbers=face.get('hiddenNumberGroups',[])
  if not(banners or numbers):continue
  key=face['key'];directory=ROOT/'output/map-marker-hd-review-20261026/composition/staged'if args.staged else ROOT/'map/images/hd1024/overlay'
  runtime=directory/f'{key}-corners.svg'
  tree=ET.parse(runtime);root=tree.getroot()
  banner_text=[n.get('data-secret-number')for n in root.iter()if n.get('data-secret-number')]
  hidden_text=[n.get('data-hidden-number')for n in root.iter()if n.get('data-hidden-number')]
  assert len(banner_text)==len(banners)and hidden_text==[n['text']for n in numbers],key
  source=ROOT/face['source'];assert sha(source)==face['sourceSha256'],key
  group=next(n for n in root if n.get('data-map-markers')=='true')
  isolate=ET.Element(f'{{{NS}}}svg',{'width':'1024','height':'1024','viewBox':'0 0 1024 1024'})
  isolate.append(group);isolated=OUT/f'{key}-markers-only.svg';ET.ElementTree(isolate).write(isolated,encoding='utf-8')
  items=[{'type':'banner','text':text,'bounds':m['bbox']}for text,m in zip(banner_text,banners)]
  items +=[{'type':'hidden','text':n['text'],'bounds':n['bounds'],'angle':n.get('angle',0)}for n in numbers]
  for item in items:
   l,t,r,b=item['bounds'];cx,cy=(l+r)/2,(t+b)/2;a=math.radians(item.get('angle',0))
   width=abs((r-l)*math.cos(a))+abs((b-t)*math.sin(a));height=abs((r-l)*math.sin(a))+abs((b-t)*math.cos(a))
   crop=[max(0,math.floor(cx-width/2-22)),max(0,math.floor(cy-height/2-22)),min(1024,math.ceil(cx+width/2+22)),min(1024,math.ceil(cy+height/2+22))]
   rows.append({'key':key,**item,'crop':crop,'source':str(source),'sourceSha256':sha(source),'runtime':str(runtime),'runtimeSha256':sha(runtime),'isolated':str(isolated),'base':str(ROOT/'map/images/hd1024/base'/f'{key}.png')})
 assert len(rows)==25 and sum(r['type']=='banner'for r in rows)==14
 repair_banners={k for k,v in repairs.items()if any(p['label']=='password banner'for p in v.get('polygons',[]))}
 actual_banners={r['key']for r in rows if r['type']=='banner'}
 assert repair_banners==actual_banners,(repair_banners-actual_banners,actual_banners-repair_banners)
 assert set(hidden)=={r['key']for r in rows if r['type']=='hidden'}
 (OUT/'render-inputs.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
 js=r'''const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let sharp;try{sharp=require('sharp')}catch(_){sharp=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'))}
const out=__dirname,rows=JSON.parse(fs.readFileSync(path.join(out,'render-inputs.json'),'utf8'));
(async()=>{for(const r of rows){
 await sharp(r.isolated).png().toFile(path.join(out,r.key+'-isolated.png'));
 await sharp(r.runtime).png().toFile(path.join(out,r.key+'-overlay.png'));
 for(const [label,p]of[['original',r.source],['current',r.runtime]]){
  const composite=await sharp(r.base).resize(1024,1024).composite([{input:p}]).png().toBuffer();
  await sharp(composite).png().toFile(path.join(out,r.key+'-'+label+'.png'));
 }
}console.log(JSON.stringify({faces:rows.length,rendered:true}))})().catch(e=>{console.error(e);process.exit(1)});'''
 script=OUT/'render.cjs';script.write_text(js,encoding='utf8')
 subprocess.run(['node',str(script)],cwd=ROOT,check=True)
 font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
 small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
 boards=[]
 for start in range(0,len(rows),5):
  board=Image.new('RGB',(1240,5*285),'#203137');draw=ImageDraw.Draw(board)
  for i,row in enumerate(rows[start:start+5]):
   top=i*285;box=tuple(row['crop'])
   draw.text((12,top+4),f'{row["key"]}  {row["type"]} {row["text"]}',font=font,fill='white')
   for j,label in enumerate(('original','current')):
    image=Image.open(OUT/f'{row["key"]}-{label}.png').crop(box).convert('RGB');image.thumbnail((596,220))
    scale=min(596/image.width,220/image.height,3);image=image.resize((round(image.width*scale),round(image.height*scale)))
    board.paste(image,(12+j*620,top+50));draw.text((12+j*620,top+29),label.upper(),font=small,fill='#ffdb9c')
   alpha=np.asarray(Image.open(OUT/f'{row["key"]}-isolated.png').convert('RGBA'))[box[1]:box[3],box[0]:box[2],3]
   row['isolatedVisiblePixels']=int((alpha>16).sum());assert row['isolatedVisiblePixels']>100,row['key']
   if row['type']=='hidden':
    def metrics(path):
     rgba=np.asarray(Image.open(path).convert('RGBA'))[box[1]:box[3],box[0]:box[2]];a=rgba[:,:,3];yy,xx=np.indices(a.shape);ys,xs=np.where(a>16)
     opaque=rgba[a>250,:3];values,counts=np.unique(opaque,axis=0,return_counts=True);ink=values[counts.argmax()]
     return{'dominantOpaqueRgb':list(map(int,ink)),'visiblePixels':int((a>16).sum()),'equivalentOpaquePixels':round(float(a.sum()/255),3),'alphaWeightedCenter':[round(float((xx*a).sum()/a.sum()+box[0]),3),round(float((yy*a).sum()/a.sum()+box[1]),3)],'renderedBoundsAtAlpha16':[int(xs.min()+box[0]),int(ys.min()+box[1]),int(xs.max()+1+box[0]),int(ys.max()+1+box[1])]}
    row['originalGlyphMetrics']=metrics(Path(row['source']));row['currentGlyphMetrics']=metrics(OUT/f'{row["key"]}-isolated.png')
  target=OUT/f'passwords-original-current-{start//5+1}.jpg';board.save(target,quality=95);boards.append(str(target.relative_to(ROOT)))
 focus=[next(r for r in rows if r['key']==key)for key in('c1-tile-014-front','c1-tile-014-alt-front')]
 chinese=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22)
 combined=Image.new('RGB',(1200,800),'#203137');draw=ImageDraw.Draw(combined)
 for i,row in enumerate(focus):
  y=i*400;label='普通面'if i==0 else'替换面';draw.text((16,y+8),'C1·014 '+label+' · 密码 0240',font=chinese,fill='white')
  for j,tag in enumerate(('original','current')):
   crop=Image.open(OUT/f'{row["key"]}-{tag}.png').crop(tuple(row['crop'])).convert('RGB');factor=min(570/crop.width,327/crop.height)
   crop=crop.resize((round(crop.width*factor),round(crop.height*factor)),Image.Resampling.LANCZOS)
   combined.paste(crop,(j*600+15+(570-crop.width)//2,y+67+(327-crop.height)//2))
   draw.text((j*600+16,y+36),'原版'if tag=='original'else'修正后',font=chinese,fill='#ffdb9c')
  full=Image.new('RGB',(2048,1060),'#203137');fd=ImageDraw.Draw(full)
  for j,tag in enumerate(('original','current')):
   full.paste(Image.open(OUT/f'{row["key"]}-{tag}.png').convert('RGB'),(j*1024,36));fd.text((j*1024+12,5),row['key']+' '+tag.upper(),font=font,fill='white')
  full.save(OUT/f'{row["key"]}-full-original-current.jpg',quality=96)
 combined.save(OUT/'c1-014-both-faces-password-comparison.png')
 write_page(rows,focus,args.staged)
 colors_match=all(r['originalGlyphMetrics']['dominantOpaqueRgb']==r['currentGlyphMetrics']['dominantOpaqueRgb']for r in rows if r['type']=='hidden')
 report={'status':'passed-all-known-passwords-actually-rendered','currentMode':'staged'if args.staged else'installed','banners':14,'hiddenGroups':11,'total':25,'sourceSetsMatchIndependentRepairAndHiddenSpecs':True,'allHiddenInkColorsMatchSources':colors_match,'boards':boards,'records':rows}
 (OUT/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps({k:v for k,v in report.items()if k!='records'}))

def write_page(rows,focus,staged):
 ordered=focus+[r for r in rows if r not in focus];articles=[]
 for row in ordered:
  l,t,r,b=row['crop'];pictures=[]
  for label,tag in(('原版','original'),('当前','current')):
   mask=os.path.relpath(row['source'],OUT).replace('\\','/')if tag=='original'else row['key']+'-overlay.png'
   full=row['key']+'-'+tag+'.png'
   pictures.append(f'<figure><figcaption>{label}</figcaption><div class="picture"><img loading="lazy" src="{full}" data-complete="{full}" data-mask="{html.escape(mask)}"><span style="left:{l/10.24}%;top:{t/10.24}%;width:{(r-l)/10.24}%;height:{(b-t)/10.24}%"></span></div><a href="{full}">查看原尺寸</a></figure>')
  articles.append(f'<article id="{row["key"]}"><h2>{row["key"]} · {html.escape(row["text"])}</h2><div class="pair">'+''.join(pictures)+'</div></article>')
 page='''<!doctype html><meta charset="utf-8"><title>地图密码原版对比</title><style>body{margin:24px;background:#203137;color:#f5f1e6;font:16px system-ui,"Microsoft YaHei"}header{position:sticky;top:0;background:#203137;padding:12px;z-index:2}button,a{color:#ffda9c}button{background:#384b52;border:1px solid #83949a;border-radius:6px;padding:9px 15px;margin-right:8px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0}figcaption{padding:8px}.picture{position:relative;background:repeating-conic-gradient(#dfe3e1 0% 25%,#c0c6c3 0% 50%) 50%/32px 32px}.picture img{display:block;width:100%}.picture span{position:absolute;border:2px solid #ffb759;box-sizing:border-box;pointer-events:none}article{max-width:1800px;padding:20px 0;border-bottom:1px solid #566870}a{display:inline-block;margin:7px}p{line-height:1.6}</style><header><h1>地图密码：原版与当前版</h1><p>14 条密码横幅与 11 组四位编号全部逐处核对。橙框标出密码位置；默认合成地图底图，透明蒙版模式使用浅色棋盘背景。</p><button onclick="mode(false)">叠加底图</button><button onclick="mode(true)">透明蒙版</button><a href="c1-014-both-faces-password-comparison.png">C1·014 两面局部对比</a></header>'''+''.join(articles)+'''<script>function mode(mask){document.querySelectorAll('img[data-complete]').forEach(im=>im.src=mask?im.dataset.mask:im.dataset.complete)}</script>'''
 (OUT/'index.html').write_text(page,encoding='utf8')

if __name__=='__main__':main()
