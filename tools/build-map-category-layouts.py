"""Classify attached C3 disc tabs; visible geometry stays a shared template."""
from pathlib import Path
from collections import Counter
import hashlib,json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-link-vector-source'
def main():
    inventory=json.loads((ROOT/'tools/map-marker-vector-source/inventory.json').read_text(encoding='utf8'))
    sources={r['key']:r for r in inventory['faces']}
    schema=json.loads((SOURCE/'contents-c3-c4.json').read_text(encoding='utf8'))['faces'];rows={}
    for key,row in schema.items():
        for pid,panel in row['panels'].items():
            for index,extra in enumerate(panel.get('attachedExtras')or[]):
                if extra['type']!='icon':continue
                source=ROOT/sources[key]['source'];assert hashlib.sha256(source.read_bytes()).hexdigest()==sources[key]['sourceSha256']
                l,t,r,b=extra['sourceBBox'];alpha=np.asarray(Image.open(source).convert('RGBA'))[t:b,l:r,3]>100
                n=16;corners=[alpha[:n,:n].mean(),alpha[:n,-n:].mean(),alpha[-n:,-n:].mean(),alpha[-n:,:n].mean()]
                tabs=[name for name,value in zip(('TL','TR','BR','BL'),corners)if value>.5];assert len(tabs)==1,(key,pid,tabs)
                rows[f'{key}:{pid}:{index}']={'key':key,'panelId':pid,'extraIndex':index,'kind':extra['value'],'tab':tabs[0],
                                           'sourceBBox':extra['sourceBBox'],'sourceSha256':sources[key]['sourceSha256']}
    assert len(rows)==25
    result={'version':'20261026-source-c3-disc-tabs1','method':'Original alpha determines only one of four fixed circle/tab backings, never a traced visible contour.',
            'palette':{'rim':'#585777','field':'#e6e6e6','ink':'#282826'},'outerDiameter':84,'innerDiameter':72.45,
            'glyphMetrics':{'time_portal':{'size':[71,70],'offset':[-1,-1.5]},'time_wound':{'size':[60,66],'offset':[2,0]},
                            'time_portal_angular':{'size':[51,52],'offset':[1,0]}},
            'byType':dict(Counter(r['kind']for r in rows.values())),'instances':rows}
    assert result['byType']=={'time_portal':6,'time_wound':11,'time_portal_angular':8}
    (SOURCE/'category-layouts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'instances':25,'byType':result['byType']}))
if __name__=='__main__':main()
