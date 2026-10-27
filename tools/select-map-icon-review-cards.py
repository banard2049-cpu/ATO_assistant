"""Exact minimum physical-card and displayed-face covers for all map icons.

C5 front/back belong to one physical card; C1 alternate prints are separate
cards. Distinct numerals and colours are not icon types. All coordinates refer
to complete original 1024px overlays and are review bounds, never new artwork.
"""
from pathlib import Path
from collections import defaultdict,Counter
import argparse,hashlib,json,time
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from scipy.optimize import milp,Bounds,LinearConstraint
from scipy.sparse import coo_matrix,vstack

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'tools'
OUT=ROOT/'output/map-marker-hd-review-20261026/minimum-card-review'
FACTIONS={'hornsworn':'誓角者','minoans':'牛头','labyrinthians':'迷宫','cyclopes':'独眼巨人','helots':'锁链','symmachy':'同盟',
 'sunheirs':'太阳','delphians':'德尔斐人','twilightwatch':'日暮守望者','aristotelians':'亚里士多德学派','cloudthieves':'窃云者','wasters':'废土者',
 'outcastvanguard':'放逐者先锋','followersofarete':'阿瑞忒追随者','cycladeanprotectorate':'基克拉泽斯保护国'}
LOCATION={'central_adventure':'中枢冒险／帆船','wild_titan':'泰坦','rr_adventure':'R&R 冒险','city':'城市',
 'frozen_time':'冻结时间','hourglass_icon':'牛头沙漏','staff_icon':'条纹杖 staff','spartan_stronghold':'斯巴达要塞',
 'daedalus_lighthouse':'代达罗斯灯塔','wheel_icon':'无翼车轮','wheel_icon_winged':'有翼车轮','oasis':'绿洲',
 'smoking_bowl_icon':'烟雾碗','silver_ruin':'白银种遗迹'}
OTHER={'greek:alpha':'α','greek:beta':'β','land_route':'三横杠特殊路线','gate_route':'C2 单中柱通道','river':'河流路线',
 'gate_route_double':'C2 双中柱通道','helmet_icon':'头盔','waves':'三道水波','restricted':'锁','time_wound':'C3 同心菱形','time_portal':'C3 圆旋涡',
 'time_portal_angular':'C3 角旋涡','progress':'进展／希望','calamity':'灾祸',
 'arrow:up':'上箭头','arrow:down':'下箭头','arrow:left':'左箭头','arrow:right':'右箭头'}
EXTRAS={'role:alpha:internal':'地图内部 α 圆牌','role:alpha:link':'邻格链接 α','role:beta:internal':'地图内部 β 圆牌','role:beta:link':'邻格链接 β',
 'compound:cyclopes+helots':'独眼巨人＋锁链复合图','compound:helots+symmachy':'锁链＋同盟复合图',
 'style:underwater-city':'C5 水下城市波纹底座','style:secret-banner':'密码横幅','style:knossos':'克诺索斯城市名牌',
 'style:hidden-number':'地图内四位密码'}

def load(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def norm(s):return'minoans'if s.lower()=='minoians'else s.lower()
def source_arrow_direction(part,path):
 l,t,r,b=map(int,part['bbox']);alpha=np.asarray(Image.open(path).convert('RGBA'))[t:b,l:r,3]>100
 if r-l>=b-t:return'up'if alpha[:max(1,(b-t)//4)].sum()<alpha[-max(1,(b-t)//4):].sum()else'down'
 return'left'if alpha[:,:max(1,(r-l)//4)].sum()<alpha[:,-max(1,(r-l)//4):].sum()else'right'

def candidates():
 paths=[SRC/'map-marker-vector-source/inventory.json',SRC/'map-corner-vector-source/inventory.json',SRC/'map-link-vector-source/cells.json']
 paths += [SRC/'map-link-vector-source'/f for f in('contents-c1-c2.json','contents-c3-c4.json','contents-c5.json')]
 paths += [ROOT/'map/map-tile-tags.js']
 markers=load(paths[0]);corners={r['key']:r for r in load(paths[1])['faces']};geometry={r['key']:r for r in load(paths[2])['faces']}
 contents={}
 for p in paths[3:6]:contents.update(load(p)['faces'])
 text=paths[6].read_text(encoding='utf8');tags=json.loads(text[text.index('{'):text.rindex('}')+1])['tiles']
 rows={}
 for source in markers['faces']:
  key=source['key'];own=corners[key];geo=geometry[key];schema=contents[key];occ=[]
  def add(feature,bbox,role,**meta):
   assert bbox and len(bbox)==4,(key,feature,bbox)
   occ.append({'feature':feature,'bbox':bbox,'role':role,**meta})
  for mark in source['markers']:
   kind=mark['type'];box=mark['bbox']
   if kind in LOCATION:
    variant='wheel_icon_winged'if kind=='wheel_icon'and key.split('-')[2]in('062','071')else kind
    add(variant,box,'map-emblem',componentLabel=mark['componentLabel'])
    if kind=='city'and source['cycle']=='c5'and source['face']=='A':add('style:underwater-city',box,'backing')
   elif kind in('greek_alpha','greek_beta'):
    value=kind.split('_',1)[1];add('greek:'+value,box,'map-greek');add('role:'+value+':internal',box,'map-greek')
   elif kind=='secret_number_banner':add('style:secret-banner',box,'banner')
   elif kind=='city_nameplate':
    add('city',box,'city-nameplate');add('style:knossos',box,'nameplate')
   else:assert kind=='hidden_number_digit',kind
  for index,number in enumerate(source.get('hiddenNumberGroups',[])):
   add('style:hidden-number',number['bounds'],'hidden-number',text=number['text'],angle=number.get('angle',0),group=index)
  for side in('left','right'):
   box=own['corners'][side]['bbox']
   if not box:continue
   if side=='left':
    for code in set(own['left']):
     if code in'PD':add('progress'if code=='P'else'calamity',box,'corner-'+side)
   else:
    for faction in own['factions']:add('faction:'+norm(faction),box,'corner-'+side)
    number=key.split('-')[2];entry=tags.get(f'{source["cycle"]}:{number}:{source["face"]}',tags.get(f'{source["cycle"]}:{number}',{}))
    if source['cycle']=='c1'and'river'in entry.get('tags',[]):add('river',box,'corner-river')
  def cell(c,box,panel,index):
   kind=c.get('type',c.get('kind'));value=c.get('value')
   if kind=='faction':add('faction:'+norm(value),box,'link-cell',panelId=panel,cellIndex=index)
   elif kind=='greek':
    add('greek:'+value,box,'link-cell',panelId=panel,cellIndex=index);add('role:'+value+':link',box,'link-cell',panelId=panel,cellIndex=index)
   elif kind=='icon':add(value,box,'link-cell',panelId=panel,cellIndex=index)
   elif kind=='waves':add('waves',box,'link-cell',panelId=panel,cellIndex=index)
   elif kind=='restricted':add('restricted',box,'link-cell',panelId=panel,cellIndex=index)
   elif kind=='compound':
    children=c.get('children',c.get('compound'));ident='+'.join(sorted(norm(n['value'])for n in children))
    add('compound:'+ident,box,'link-compound',panelId=panel,cellIndex=index)
    for child in children:cell(child,box,panel,index)
   else:assert kind in('number','text'),c
  for panel in geo['panels']:
   semantic=schema['panels'][panel['id']]
   assert len(panel['cells'])==len(semantic['cells']),key
   for i,(entry,box)in enumerate(zip(semantic['cells'],panel['cells'])):cell(entry,box['bbox'],panel['id'],i)
   extras=semantic.get('attachedExtras')
   if extras is None:extras=[{'type':'restricted','value':'lock','bbox':p['bbox']}for p in panel['attachedExtras']]
   for e,g in zip(extras,panel['attachedExtras']):
    feature='restricted'if e['type']=='restricted'else e['value'];add(feature,e.get('sourceBBox',e.get('bbox',g['bbox'])),'link-attached',panelId=panel['id'])
   for a in panel.get('embeddedArrows',[]):
    direction=a.get('direction')
    if direction not in('up','down','left','right'):direction=source_arrow_direction(a,ROOT/source['source'])
    add('arrow:'+direction,a['bbox'],'arrow',panelId=panel['id'])
  for a in geo['arrows']:
   direction=a.get('direction')
   if direction not in('up','down','left','right'):direction=source_arrow_direction(a,ROOT/source['source'])
   add('arrow:'+direction,a['bbox'],'arrow',panelId=a.get('panelId'))
  rows[key]={'key':key,'cycle':source['cycle'],'face':source['face'],'physicalCard':key.rsplit('-',1)[0],
             'source':source['source'],'sourceSha256':source['sourceSha256'],
             'current':f'map/images/hd1024/overlay/{key}-corners.svg','base':f'map/images/hd1024/base/{key}.png',
             'features':sorted({r['feature']for r in occ}),'occurrences':occ}
 assert len(rows)==511
 return rows,paths

def solve(rows,universe,case):
 face_keys=sorted(rows);card_keys=sorted({r['physicalCard']for r in rows.values()});card_index={k:i for i,k in enumerate(card_keys)}
 nf,nc=len(face_keys),len(card_keys);nv=nc+nf;groups=defaultdict(list)
 for i,key in enumerate(face_keys):groups[card_index[rows[key]['physicalCard']]].append(nc+i)
 ri=[];ci=[];values=[];lower=[];upper=[]
 def equation(entries,lo,hi):
  row=len(lower);lower.append(lo);upper.append(hi)
  for i,v in entries:ri.append(row);ci.append(i);values.append(v)
 for feature in sorted(universe):equation([(nc+i,1)for i,key in enumerate(face_keys)if feature in rows[key]['features']],1,np.inf)
 for card,indices in groups.items():
  for face in indices:equation([(face,1),(card,-1)],-np.inf,0)
  equation([(card,1)]+[(face,-1)for face in indices],-np.inf,0)
 matrix=coo_matrix((values,(ri,ci)),shape=(len(lower),nv)).tocsc()
 constraints=LinearConstraint(matrix,np.array(lower),np.array(upper));integrality=np.ones(nv);bounds=Bounds(np.zeros(nv),np.ones(nv))
 objective=np.zeros(nv);objective[:nc]=1
 started=time.time();first=milp(objective,integrality=integrality,bounds=bounds,constraints=constraints,options={'mip_rel_gap':0,'time_limit':120})
 assert first.success and first.mip_gap==0,(case,'physical card optimum not proven',first.message)
 count=int(round(first.fun));row=coo_matrix((np.ones(nc),(np.zeros(nc),np.arange(nc))),shape=(1,nv)).tocsc()
 second_constraints=LinearConstraint(vstack([matrix,row]),np.r_[lower,count],np.r_[upper,count])
 objective=np.zeros(nv);objective[nc:]=1
 second=milp(objective,integrality=integrality,bounds=bounds,constraints=second_constraints,options={'mip_rel_gap':0,'time_limit':120})
 assert second.success and second.mip_gap==0,(case,'face optimum not proven',second.message)
 selected=[key for i,key in enumerate(face_keys)if second.x[nc+i]>.5]
 actual_cards=sorted({rows[k]['physicalCard']for k in selected})
 covered=set().union(*(set(rows[k]['features'])for k in selected));assert universe<=covered
 assert len(actual_cards)==count and len(selected)==round(second.fun)
 witness={feature:[key for key in selected if feature in rows[key]['features']]for feature in sorted(universe)}
 proof=lambda result:{'status':int(result.status),'message':result.message,'objective':float(result.fun),
                      'mipDualBound':float(result.mip_dual_bound),'mipGap':float(result.mip_gap),'mipNodeCount':int(result.mip_node_count)}
 return {'case':case,'featureCount':len(universe),'minimumPhysicalCards':count,'minimumDisplayedFaces':len(selected),
         'selectedPhysicalCards':actual_cards,'selectedFaceKeys':selected,'coveredFeatures':sorted(universe),'coverageWitness':witness,
         'physicalCardOptimization':proof(first),'faceOptimization':proof(second),'elapsedSeconds':round(time.time()-started,3)}

def verify_runtime_coverage(rows,result,staged=False):
 """Independently identify selected features from actual reviewed SVGs."""
 actual=set();snapshots={}
 for key in result['selectedFaceKeys']:
  path=(ROOT/'output/map-marker-hd-review-20261026/composition/staged'/f'{key}-corners.svg')if staged else ROOT/rows[key]['current']
  snapshots[key]=sha(path);root=ET.parse(path).getroot()
  assert sha(ROOT/rows[key]['source'])==rows[key]['sourceSha256'],key
  def walk(node,role=None):
   if node.get('data-map-links')=='true':role='link'
   if node.get('data-map-markers')=='true':role='internal'
   for attr,prefix in(('data-emblem',''),('data-faction','faction:'),('data-glyph',''),('data-arrow','arrow:')):
    value=node.get(attr)
    if value:actual.add(prefix+value)
   if node.get('data-glyph')in('alpha','beta'):
    value=node.get('data-glyph');actual.add('greek:'+value);actual.add('role:'+value+':link')
   if node.get('data-marker-text')in('α','β')and role=='internal':
    value={'α':'alpha','β':'beta'}[node.get('data-marker-text')];actual.add('greek:'+value);actual.add('role:'+value+':internal')
   if node.get('data-marker')in('progress','calamity'):actual.add(node.get('data-marker'))
   if node.get('data-marker')=='restricted':actual.add('restricted')
   if node.get('data-wave-count'):actual.add('waves')
   if node.get('data-backing-inner')=='scallop-11':actual.add('style:underwater-city')
   if node.get('data-secret-number'):actual.add('style:secret-banner')
   if node.get('data-city-name'):actual.add('style:knossos')
   if node.get('data-hidden-number'):actual.add('style:hidden-number')
   if node.get('data-kind')=='compound':
    ids=sorted({n.get('data-faction')for n in node.iter()if n.get('data-faction')});actual.add('compound:'+'+'.join(ids))
   for child in node:walk(child,role)
  walk(root)
 missing=set(result['coveredFeatures'])-actual;assert not missing,(result['case'],missing)
 return {'status':'passed','mode':'staged'if staged else'installed','expectedFeatureCount':len(result['coveredFeatures']),'missingFeatures':[],
         'method':'Read actual SVG semantic groups independently from source inventory and verify every required selected type exists.',
         'installedFaceSha256':snapshots}

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--staged',action='store_true',help='Verify the prepared SVGs before installation')
 args=parser.parse_args()
 OUT.mkdir(exist_ok=True);rows,paths=candidates()
 labels={**LOCATION,**OTHER,**{'faction:'+k:v for k,v in FACTIONS.items()},**EXTRAS}
 core=set(LOCATION)|set(OTHER)|{'faction:'+k for k in FACTIONS}|{'style:secret-banner','style:hidden-number'}
 expanded=core|{k for k in EXTRAS if not k.startswith('role:')}
 available=set().union(*(set(r['features'])for r in rows.values()))
 assert core<=available and expanded<=available,('Missing coverage inputs',expanded-available)
 assert available<=set(labels),('Unlabelled source icon',available-set(labels))
 print(f'Inputs ready: {len(rows)} faces, core {len(core)} features, expanded {len(expanded)} features',flush=True)
 core_result=solve(rows,core,'independent-icons-and-passwords');print(json.dumps({k:core_result[k]for k in('case','minimumPhysicalCards','minimumDisplayedFaces','elapsedSeconds')}),flush=True)
 expanded_result=solve(rows,expanded,'all-icons-and-component-styles');print(json.dumps({k:expanded_result[k]for k in('case','minimumPhysicalCards','minimumDisplayedFaces','elapsedSeconds')}),flush=True)
 core_result['runtimeCoverageCheck']=verify_runtime_coverage(rows,core_result,args.staged)
 expanded_result['runtimeCoverageCheck']=verify_runtime_coverage(rows,expanded_result,args.staged)
 assert all({'style:secret-banner','style:hidden-number'} <= set(r['coveredFeatures']) for r in (core_result,expanded_result))
 assert len(core)==49 and len(expanded)==53
 result={'version':'20261027-minimum-icon-cards4-two-gates','status':'proven-optimal','method':'SciPy milp / HiGHS, exact two-stage mixed-integer set cover, relative MIP gap 0',
         'countingRule':'C5 A/B share one physical card; each C1 alternate is a separate physical print. Primary: minimum physical cards. Secondary: minimum displayed faces at that card count.',
         'typeRule':'Core = 49 independent graphic types and both password forms, including four arrow orientations and the distinct single-middle-pillar / double-middle-pillar C2 gates. Expanded = 53 types, additionally requiring two compound factions, underwater city backing and Knossos nameplate. The same alpha/beta in internal and link roles is counted once; numeric values and colours are not separate types.',
         'sourceSha256':{p.relative_to(ROOT).as_posix():sha(p)for p in paths},'candidateFaces':len(rows),'candidatePhysicalCards':len({r['physicalCard']for r in rows.values()}),
         'featureLabels':labels,'core':core_result,'expanded':expanded_result,'recommendedCase':'expanded',
         'candidates':rows}
 (OUT/'selection.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print('Saved '+str(OUT/'selection.json'),flush=True)
if __name__=='__main__':main()
