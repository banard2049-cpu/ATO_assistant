"""Download public original-art references linked by the publisher resource page."""
from pathlib import Path
import json,hashlib
import requests

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/official'
FILES={'sticker-transparent':'1kewpHGpFgPb-12ry8jnQJpMK3eq94xi5','sticker-black-white':'1K8Bcgw-set7zTeRflwxHe1ofgJSnXvzS',
       'rulebook':'1vPofVQlG_j_nA3v63YWnU9WsMovJ-uxb','c5-record-front':'1jiWwolBe0Id2SabKXZshurBnrg2etZTF'}

def main():
    OUT.mkdir(parents=True,exist_ok=True);records=[]
    session=requests.Session();session.trust_env=False
    for name,ident in FILES.items():
        target=OUT/f'{name}.pdf';url=f'https://drive.google.com/uc?export=download&id={ident}'
        if target.exists()and target.read_bytes().startswith(b'%PDF'):
            raw=target.read_bytes();records.append({'id':name,'status':'cached','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()});continue
        try:
            response=session.get(url,timeout=(15,90));response.raise_for_status();raw=response.content
            if not raw.startswith(b'%PDF'):raise ValueError(f'Not PDF: {response.headers.get("content-type")} {len(raw)} bytes')
            target.write_bytes(raw)
            records.append({'id':name,'status':'downloaded','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'url':url})
        except Exception as error:records.append({'id':name,'status':'unavailable','error':str(error),'url':url})
        print(name+': '+records[-1]['status'],flush=True)
    (OUT/'download-report.json').write_text(json.dumps({'publisher':'https://intotheunknownstudio.com/resources','files':records},indent=2)+'\n',encoding='utf8')
    print(json.dumps(records))

if __name__=='__main__':main()
