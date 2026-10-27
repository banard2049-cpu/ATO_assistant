"""Read Unity bundle texture metadata; do not modify the supplied Mods cache."""
from pathlib import Path
import json,gc
import UnityPy
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/pdf-audit'
MODS=Path('D:/desktop/新建文件夹 (3)/Aeon Trespass_ Odyssey (3458296558)/Mods')
rows=[]
for index,path in enumerate((MODS/'Assetbundles').glob('*')):
    if not path.is_file():continue
    record={'file':str(path),'bytes':path.stat().st_size,'textures':[],'objects':{}}
    try:
        env=UnityPy.load(str(path))
        for obj in env.objects:
            kind=obj.type.name;record['objects'][kind]=record['objects'].get(kind,0)+1
            if kind=='Texture2D':
                tex=obj.read()
                record['textures'].append({'pathId':obj.path_id,'name':tex.m_Name,'width':tex.m_Width,'height':tex.m_Height,'format':str(tex.m_TextureFormat)})
        del env;gc.collect()
    except Exception as error:record['error']=str(error)
    rows.append(record)
    if len(rows)%10==0:print('Bundles read',len(rows),flush=True)
(OUT/'assetbundle-textures.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'bundles':len(rows),'textures':sum(len(r['textures'])for r in rows),'errors':sum('error'in r for r in rows)}))
