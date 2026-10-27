"""Read-only search for genuine higher-quality ATO marker sources."""
from concurrent.futures import ThreadPoolExecutor
import hashlib,json
from pathlib import Path
import fitz
import requests

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/pdf-audit'
MODS=Path('D:/desktop/新建文件夹 (3)/Aeon Trespass_ Odyssey (3458296558)/Mods')

def inspect(path):
    doc=fitz.open(path)
    pages=[]
    for i,page in enumerate(doc):
        text=page.get_text()
        if i<3 or any(word in text.lower()for word in('map symbols','map tile','map icon','daedalus','lighthouse','spartan','oasis','silver','hourglass')):
            images=page.get_images(full=True)
            pages.append({'page':i+1,'width':page.rect.width,'height':page.rect.height,'text':text[:3500],
                          'drawings':len(page.get_drawings()),'images':[{'xref':im[0],'w':im[2],'h':im[3],'bpc':im[4]}for im in images]})
    return {'file':str(path),'bytes':path.stat().st_size,'pages':len(doc),'metadata':doc.metadata,'selectedPages':pages}

def download(item):
    name,ident=item;target=OUT/'official-downloads'/f'{name}.pdf';target.parent.mkdir(exist_ok=True)
    if target.exists()and target.read_bytes().startswith(b'%PDF'):return {'id':ident,'file':str(target),'cached':True}
    try:
        response=requests.get('https://drive.google.com/uc',params={'export':'download','id':ident},timeout=45)
        if response.content.startswith(b'%PDF'):
            target.write_bytes(response.content)
            return {'id':ident,'file':str(target),'bytes':len(response.content),'url':response.url,'sha256':hashlib.sha256(response.content).hexdigest()}
        return {'id':ident,'status':response.status_code,'type':response.headers.get('content-type'),'error':response.text[:300]}
    except Exception as error:return {'id':ident,'error':str(error)}

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    files=list((MODS/'PDF').glob('*'))+list(Path('D:/desktop').glob('*.pdf'))
    rows=[]
    for path in files:
        try:
            row=inspect(path);rows.append(row)
            print(path.name[:55],row['pages'],len(row['selectedPages']),flush=True)
        except Exception as e:rows.append({'file':str(path),'error':str(e)})
    (OUT/'local-pdfs.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    ids=[('stickers-transparent','1kewpHGpFgPb-12ry8jnQJpMK3eq94xi5'),('stickers-bw','1K8Bcgw-set7zTeRflwxHe1ofgJSnXvzS'),
         ('official-rulebook','1vPofVQlG_j_nA3v63YWnU9WsMovJ-uxb'),('c5-argo-front','1jiWwolBe0Id2SabKXZshurBnrg2etZTF')]
    with ThreadPoolExecutor(max_workers=4)as pool:downloads=list(pool.map(download,ids))
    (OUT/'downloads.json').write_text(json.dumps(downloads,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for row in downloads:
        if row.get('file'):
            try:
                record=inspect(Path(row['file']))
                (OUT/(Path(row['file']).stem+'-audit.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
            except Exception as error:print('inspect failed',error)
    print(json.dumps(downloads,ensure_ascii=False))

if __name__=='__main__':main()
