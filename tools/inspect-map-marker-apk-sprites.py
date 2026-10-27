from pathlib import Path
import json
import UnityPy
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/map-marker-hd-review-20261026/apk-originals'
env=UnityPy.load(str(ROOT/'output/apk-map-assets/data.unity3d'))
rows=[]
for obj in env.objects:
    if obj.type.name not in('MonoBehaviour','Sprite'):continue
    try:
        tree=obj.read_typetree();name=tree.get('m_Name','')
        if name.startswith('ato_text_icon'):
            rows.append({'type':obj.type.name,'pathId':obj.path_id,'name':name,'assetFile':str(obj.assets_file.name),'data':tree})
    except Exception:pass
(OUT/'sprite-tables.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2,default=lambda value:{'bytes':len(value)})+'\n',encoding='utf8')
print([(r['type'],r['name'],list(r['data']))for r in rows])
