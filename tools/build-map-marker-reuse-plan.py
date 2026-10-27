"""Consolidate source-verified non-link markers into the smallest reusable set."""
from __future__ import annotations
from collections import Counter
import hashlib,json,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/map-marker-vector-source'
OUT=ROOT/'output/map-marker-vector-review-20261026'
KIT=ROOT/'output/map-asset-kit-20261024'
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
LABELS={'central_adventure':'中枢冒险 / 帆船','wild_titan':'野生泰坦','rr_adventure':'R&R / 飞鸟与海浪','city':'城市柱廊（含据点、水下城市）','city_nameplate':'克诺索斯城市名牌',
        'frozen_time':'凝固时光','hourglass_icon':'牛头沙漏形（待释义）','staff_icon':'条纹杖形（待释义）','spartan_stronghold':'斯巴达要塞','daedalus_lighthouse':'代达罗斯灯塔',
        'wheel_icon':'车轮 / 有翼和无翼（待释义）','oasis':'绿洲','smoking_bowl_icon':'烟雾碗（待释义）','silver_ruin':'白银种遗迹','greek_alpha':'α 圆牌','greek_beta':'β 圆牌','secret_number_banner':'秘密数字条','hidden_number_digit':'隐藏编号字形'}


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    data=json.loads((SOURCE/'inventory.json').read_text(encoding='utf-8'))
    native=json.loads((KIT/'native-icons/marker-manifest.json').read_text(encoding='utf-8'))
    byid={r['id']:r for r in native}
    reuse=SOURCE/'reuse';reuse.mkdir(exist_ok=True)
    reusable=('central_adventure','wild_titan','rr_adventure','city','frozen_time')
    groups={}
    for row in data['faces']:
        for mark in row['markers']:
            if mark['type']=='wheel_icon':
                mark['variant']='winged'if row['key'].split('-')[2]in('062','071')else'plain'
            groups.setdefault(mark['type'],[]).append({'key':row['key'],'source':row['source'],**mark})
        for mark in row.get('smallComponents',[]):
            groups.setdefault(mark['type'],[]).append({'key':row['key'],'source':row['source'],**mark})
    records=[]
    for ident in reusable:
        original=KIT/byid[ident]['svg'];root=ET.parse(original).getroot()
        if ident=='city':
            # Only remove the separate known solid disc. The original nine
            # PDF drawing paths inside the child group remain byte-for-byte.
            for child in list(root):
                if child.tag.rsplit('}',1)[-1]=='path':root.remove(child)
        for el in root.iter():
            assert el.tag.rsplit('}',1)[-1]not in('image','text','use','foreignObject'),ident
        target=reuse/f'{ident}.svg';ET.ElementTree(root).write(target,encoding='unicode')
        count=len(groups.get(ident,[]))+(len(groups.get('city_nameplate',[]))if ident=='city'else 0)
        records.append({'id':ident,'label':LABELS[ident],'instances':count,'decision':'reuse-existing-vector-paths',
                        'original':original.relative_to(ROOT).as_posix(),'originalSha256':sha(original),'component':target.relative_to(ROOT).as_posix(),'sha256':sha(target),
                        'provenance':byid[ident]['source'],'notes':'The emblem is reused; colours and circle/tab/scallop backing are shared geometry. No scan tracing.'})
    missing=('hourglass_icon','staff_icon','spartan_stronghold','daedalus_lighthouse','wheel_icon','oasis','smoking_bowl_icon','silver_ruin')
    redraw=[]
    for ident in missing:
        exemplar=byid[ident];form_count=2 if ident=='wheel_icon'else 1
        redraw.append({'id':ident,'label':LABELS[ident],'instances':len(groups.get(ident,[])),'distinctShapes':form_count,
                       'decision':'author-clean-component-once-per-shape-for-full-vector-output',
                       'availableOriginalBitmap':exemplar['source'].get('alphaBitmap')or exemplar['png'],
                       'existingAsset':(KIT/exemplar['svg']).relative_to(ROOT).as_posix(),
                       'existingAssetKind':exemplar['sourceKind'],'sourceSize':exemplar.get('nativeSize'),
                       'notes':('The winged and plain chariot are distinct printed silhouettes; one wheel/axle subcomponent can be shared.'if ident=='wheel_icon'else
                                'An existing original bitmap can be reused unchanged when bitmap output is acceptable; its SVG wrapper is not an original vector.')})
    plan={'version':'20261026-map-marker-reuse-plan1','scope':'All 511 map faces, after excluding already handled corner panels, own C5 header, links/arrows and route-attached marks.',
          'installation':'none','evidenceInventory':'tools/map-marker-vector-source/inventory.json',
          'summary':{'faces':511,'remainingLargeComponents':612,'ownLocationEmblems':505,'reuseExistingPathInstances':sum(r['instances']for r in records),'reuseExistingPathComponents':len(records),
                     'bitmapOnlyEmblemInstances':sum(r['instances']for r in redraw),'bitmapOnlySemanticFamilies':len(redraw),'minimumNewCleanEmblemShapes':sum(r['distinctShapes']for r in redraw),
                     'greekDiscs':len(groups['greek_alpha'])+len(groups['greek_beta']),'greekAlpha':len(groups['greek_alpha']),'greekBeta':len(groups['greek_beta']),
                     'secretNumberBanners':len(groups['secret_number_banner']),'cityNameplates':len(groups['city_nameplate']),
                     'hiddenNumberGroups':data['summary']['hiddenNumberGroups'],'hiddenNumberDigitComponents':len(groups['hidden_number_digit']),
                     'hiddenNumberDigitsUnder150Pixels':data['summary']['smallHiddenNumberDigits'],'antialiasSpeckles':data['summary']['antialiasSpeckles']},
          'reuse':records,'redrawMinimum':redraw,
          'sharedGeometry':[{'id':'disc-tab','appliesTo':'round circle with optional square lower/upper tabs; palette variants reuse the same geometry'},
                            {'id':'underwater-city-scallop','appliesTo':'7 C5-A city backings; same city emblem, only the outside backing differs'},
                            {'id':'greek-disc','appliesTo':'76 alpha/beta circles; two existing font-outline glyphs, one common circle'},
                            {'id':'secret-number-banner','appliesTo':'14 instances; one flared strip plus existing digit/star paths'},
                            {'id':'city-nameplate','appliesTo':'1 Knossos nameplate; reuse city emblem and a separate clean banner/text outline'},
                            {'id':'hidden-number-text','appliesTo':'11 four-digit hidden labels / 44 source digit components; reuse existing font, bounds, colours and rotation from tools/map-hidden-number-regions.json and complete-map-hidden-numbers.py'}],
          'excludedFromNewEmblemCount':{'cornerAndRouteAssets':'River, locks, helmet and C3 category emblems belong to the link/corner inventory and are not counted twice.',
                                      'hiddenNumbers':'17 large + 27 small components are 44 real hidden-number digits in 11 complete labels, preserved and classified as reusable existing text.',
                                      'speckles':'Only 2 separate antialias speckles (1px and 3px), visually and independently audited, are nonsemantic noise.'},
          'routeCategoryTrials':{'components':3,'files':'tools/map-marker-vector-source/redraw/manifest.json','status':'authored geometry trials; not yet approved or installed',
                                 'actualNames':{'time_wound':'concentric diamonds','time_portal':'round spiral','time_portal_angular':'angular spiral'}},
          'coverageLimits':['Minimum 9 assumes retaining every printed emblem silhouette, including both wheel variants. It counts emblem drawings, not palette changes or repeated placements.',
                            'A full vector version still requires authoring and visually approving those missing silhouettes; inventory coverage does not prove redraw fidelity.',
                            'The 14 old bitmap-derived contour glyphs are recognition/reference material and are not accepted as clean native final components.']}
    assert plan['summary']['ownLocationEmblems']==plan['summary']['reuseExistingPathInstances']+plan['summary']['bitmapOnlyEmblemInstances']==505
    assert sum(len(groups[k])for k in groups if k not in('greek_alpha','greek_beta','secret_number_banner','hidden_number_digit','antialias_speckle'))==505
    assert len(groups['hidden_number_digit'])==44 and len(groups['antialias_speckle'])==2
    (SOURCE/'reuse-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (SOURCE/'classified-instances.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for ident,entries in groups.items():sheet(ident,entries)
    write_readme(plan)
    print(json.dumps(plan['summary']))


def sheet(ident,rows):
    dest=OUT/'classified';dest.mkdir(exist_ok=True)
    f=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    for start in range(0,len(rows),100):
        subset=rows[start:start+100];im=Image.new('RGB',(1500,35+120*((len(subset)+9)//10)),'#27383e');d=ImageDraw.Draw(im)
        d.text((8,8),f'{ident}: {len(rows)} instances | source-reference only',font=f,fill='white')
        for i,row in enumerate(subset):
            x=i%10*150;y=i//10*120+35
            crop=Image.open(ROOT/row['source']).convert('RGBA').crop(row['bbox']);crop.thumbnail((138,92),Image.Resampling.LANCZOS)
            im.paste(crop,(x+(150-crop.width)//2,y+18),crop)
            d.text((x+2,y+2),row['key'][0:2]+' '+row['key'][8:]+' #'+str(row['componentLabel']),font=f,fill='white')
        im.save(dest/f'{ident}-{start//100+1:02}.jpg',quality=95)


def write_readme(plan):
    text='''# 地图其余标记：最少重绘与复用盘点

本轮核对全部 **511 个地图面**。角标、C5 自身编号及链接牌由相应流程负责，此处统计其余印刷标记，未修改正式素材。

分离出的 612 个较大源组件，包含：**505 枚地点图案、76 枚 α/β 圆牌、14 个秘密编号条、17 个隐藏编号数字**。另外 29 个小组件里，**27 个也是完整隐藏数字，只有 2 个是 1px/3px 抗锯齿点**。44 个数字属于 **11 组四位隐藏编号**，必须保留，不能当噪点删除。全部 641 个剩余组件均已归类。

## 可以直接复用

| 图案 | 实例 | 复用来源 |
|---|---:|---|
| 帆船 | 190 | 已有 adventures.svg 路径 |
| 野生泰坦 | 123 | 已有 titans.svg 路径 |
| R&R | 51 | 规则书已提取原生路径 |
| 城市柱廊 | 64 | 规则书原生 9 路径；据点、水下城市复用同一柱廊 |
| 凝固时光 | 18 | 已有 frozen-time.svg 路径 |
| 合计 | **446** | **5 个共用图案** |

现有图案只需配规范圆底、方角连接片或水下城市齿形底。颜色属于模板参数，同一图案不按每张扫描图重新描摹。76 个 α/β 圆牌复用已有字体轮廓，编号条复用字体数字与统一边框。11 组隐藏编号直接复用 `tools/map-hidden-number-regions.json` 已核对的文字、颜色、角度及 `complete-map-hidden-numbers.py` 字体排版方案。

## 若要求全部为干净矢量，还需的最小图案集合

| 类别 | 实例 | 独立外形 |
|---|---:|---:|
| 牛头沙漏形 | 5 | 1 |
| 条纹杖形 | 4 | 1 |
| 斯巴达要塞 | 9 | 1 |
| 代达罗斯灯塔 | 12 | 1 |
| 车轮 | 4 | **2：有翼与无翼** |
| 绿洲 | 8 | 1 |
| 烟雾碗 | 4 | 1 |
| 白银种遗迹 | 13 | 1 |
| 合计 | **59** | **9** |

这 59 处已有独立原始位图，允许保留位图时可以直接复用；它们包在 SVG 中并不等于原生矢量。若要求放大仍平滑，按上表只需画一次每种外形，然后固定复用。9 是在保持有翼/无翼两种实际外形的前提下统计的图案数，不包括底座和文字模板。

链接中的河流、头盔和 C3 时光类别归链接流程统计，不在这里重复增加重绘数。9 个剩余图案与 C3 三种类别均已做规则几何/贝塞尔试稿；牛头沙漏复用原生派系牛头再加躯干，车轮两式共用一个车轮组件。试稿尚需视觉批准，不能把分类齐全当成重绘已完美。

## 文件

- `tools/map-marker-vector-source/inventory.json`：逐面原图 SHA-256、组件范围、分类与原有审计交叉结果。
- `tools/map-marker-vector-source/classified-instances.json`：逐类全部实例。
- `tools/map-marker-vector-source/reuse-plan.json`：复用来源、文件校验和、最小重绘集合与覆盖边界。
- `tools/map-marker-vector-source/reuse/`：5 个共用路径组件。
- `tools/map-marker-vector-source/redraw/`：12 个手工几何试稿（9 个剩余独立外形 + 3 个 C3 航路类别）。
- 本目录 `classified/`：按类逐个放大对照原图；`all-components/`：各循环完整原组件图册。

本轮没有使用逐像素描摹来生成试稿，没有替换运行时素材。旧 14 个 bitmap contour 只作识别参考，不纳入干净最终组件库。
'''
    (OUT/'README.md').write_text(text,encoding='utf-8')
    items=sorted((OUT/'classified').glob('*.jpg'))
    html='<!doctype html><meta charset="utf-8"><title>地图标记分类与复用盘点</title><style>body{font:16px/1.6 system-ui;background:#213039;color:#f5f2e5;margin:24px}img{max-width:100%;display:block}a{color:#a4d9eb}section{margin:24px auto;max-width:1500px}</style><h1>全部地图其余标记 · 分类与复用</h1><p>511 面，505 枚地点图案。5 个已有矢量图案覆盖446处；59处位图图案分为8类、9种独立外形。76枚α/β圆牌、14条秘密编号、11组隐藏编号单独共用模板。以下为原图分类参考和未批准试稿，正式素材未修改。</p><p><a href="README.md">详细复用清单与范围</a> · <a href="all-redraw-trials-comparison.jpg">全部12个几何试稿对比</a></p>'
    html+=''.join(f'<section><h2>{p.stem}</h2><a href="classified/{p.name}"><img loading="lazy" src="classified/{p.name}"></a></section>'for p in items)
    (OUT/'index.html').write_text(html,encoding='utf-8')


if __name__=='__main__':main()
