import argparse
import re
from pathlib import Path
import hashlib, html
from PIL import Image, ImageOps, ImageChops, ImageStat

# 项目根目录按脚本自身位置推导（tools/compare_image_assets.py -> 项目根），不受当前工作目录影响。
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGET = Path(r'D:\download\ATO---c1-3')
BASE_OUT = ROOT / 'image_asset_compare_report'
EXTS = {'.png','.jpg','.jpeg','.webp','.gif','.bmp','.svg'}

ap = argparse.ArgumentParser(description='比对当前项目与一个或多个目录的图片资产，依次生成带图片预览的 HTML 报告')
ap.add_argument('targets', nargs='*', default=[str(DEFAULT_TARGET)],
                help=f'对比目录，可给多个（依次各出一份报告）；默认 {DEFAULT_TARGET}')
ap.add_argument('--list-images', action='store_true',
                help='同时为“仅当前项目存在/仅对比目录存在”清单显示图片（数量多时页面较大）')
args = ap.parse_args()

def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()
def resolution(p):
    """实际像素分辨率 (w, h)，无法读取时返回 None。"""
    try:
        with Image.open(p) as im: return (im.width, im.height)
    except Exception: return None
def fmt_res(r):
    return '读取失败' if not r else f'{r[0]}×{r[1]}'
def visual_delta(a,b):
    try:
        with Image.open(a) as ia, Image.open(b) as ib:
            ia=ImageOps.fit(ia.convert('RGB'),(128,128),method=Image.Resampling.LANCZOS)
            ib=ImageOps.fit(ib.convert('RGB'),(128,128),method=Image.Resampling.LANCZOS)
            return sum(ImageStat.Stat(ImageChops.difference(ia,ib)).mean)/3
    except Exception:
        return 999.0

def abs_url(p):
    """Absolute file:/// URL of the original image (no copies, no thumbnails)."""
    return p.resolve().as_uri()

def skipped(part):
    # 扫描当前项目时忽略报告输出目录、打包缓存与外部提取的素材（缓存里是项目自身的拷贝，会造成自我比对）。
    return (part == '.packaging-cache' or part == 'token_icons'
            or part.startswith('image_asset_compare_report'))

def files(root, *, apply_skip):
    return [p for p in root.rglob('*')
            if p.is_file() and p.suffix.lower() in EXTS
            and not (apply_skip and any(skipped(part) for part in p.parts))]

def out_dir_for(target):
    """默认对比目录直接用报告目录，其它目录各用一个带后缀的目录。"""
    if target.resolve() == DEFAULT_TARGET.resolve():
        return BASE_OUT
    slug = re.sub(r'[^0-9A-Za-z._-]+', '-', target.name).strip('-') or 'target'
    return ROOT / f'image_asset_compare_report_{slug}'

def report(target, out):
    out.mkdir(parents=True, exist_ok=True)
    cur, oth = files(ROOT, apply_skip=True), files(target, apply_skip=False)
    cur_by_name={}; oth_by_name={}
    for p in cur: cur_by_name.setdefault(p.name.lower(), []).append(p)
    for p in oth: oth_by_name.setdefault(p.name.lower(), []).append(p)
    rows=[]; seen=set()
    for name, cps in cur_by_name.items():
        ops=oth_by_name.get(name,[])
        if not ops: continue
        for cp in cps:
            # Prefer matching relative path, otherwise first same-name source.
            rel=cp.relative_to(ROOT)
            op=next((x for x in ops if x.relative_to(target)==rel), ops[0])
            seen.add(op)
            cs, osz = cp.stat().st_size, op.stat().st_size
            diff_rate=abs(cs-osz)/max(cs,osz)
            if diff_rate <= 0.05:
                continue
            cres, ores = resolution(cp), resolution(op)
            # 分辨率不同（含无法读取）的排在最前，其余按文件大小差异率降序。
            res_differ = cres != ores
            rows.append((cp,op,fmt_res(cres),fmt_res(ores),digest(cp),digest(op),diff_rate,res_differ))
    missing_current=[p for p in oth if p not in seen and p.name.lower() not in cur_by_name]
    missing_source=[p for p in cur if p.name.lower() not in oth_by_name]
    rows.sort(key=lambda x:(0 if x[7] else 1, -x[6]))
    n_res=sum(1 for r in rows if r[7])
    parts=['<!doctype html><meta charset="utf-8"><title>图片资产比对报告</title>',
           '<style>body{font-family:Arial,"Microsoft YaHei",sans-serif;margin:24px;color:#222}'
           'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;vertical-align:top}'
           'th{background:#f3f3f3;position:sticky;top:0;z-index:1}'
           'img{width:240px;height:160px;object-fit:contain;background:#eee;border:1px solid #ddd;display:block}'
           'img.small{width:120px;height:84px}'
           'code{font-size:12px;word-break:break-all}.bad{color:#b00020}'
           '.path{margin-top:4px;max-width:340px}.cap{font-size:12px;color:#666;margin-bottom:2px}'
           'a{color:#0b57d0}li img{display:inline-block;vertical-align:middle;margin-right:6px}</style>']
    parts.append(f'<h1>图片资产比对报告</h1><p>当前项目：<code>{html.escape(str(ROOT))}</code><br>对比目录：<code>{html.escape(str(target))}</code></p>')
    parts.append(f'<p>当前图片 {len(cur)} 张；对比目录图片 {len(oth)} 张；同名且内容/尺寸不同 {len(rows)} 张（其中分辨率不同 {n_res} 张）；仅当前项目存在 {len(missing_source)} 张；仅对比目录存在 {len(missing_current)} 张。</p>')
    if rows:
        parts.append('<h2>差异文件</h2><p>排序：先分辨率不同的图片，再按文件大小差异率从大到小。左为当前项目、右为对比目录，图片直接引用原文件绝对路径，点击可打开原图。</p>')
        parts.append('<table><tr><th>文件名/路径</th><th>当前项目</th><th>对比目录</th><th>SHA-256</th></tr>')
        for cp,op,cd,od,ch,oh,diff_rate,res_differ in rows:
            tag = '<span class="bad">分辨率不同</span><br>' if res_differ else ''
            parts.append(
                f'<tr><td><b>{html.escape(cp.name)}</b><br>{tag}差异率：{diff_rate:.1%}'
                f'<br>尺寸：{html.escape(cd)} / {html.escape(od)}'
                f'<div class="path"><code>{html.escape(str(cp))}</code></div></td>'
                f'<td><a href="{abs_url(cp)}" target="_blank" title="{html.escape(str(cp))}">'
                f'<img loading="lazy" decoding="async" src="{abs_url(cp)}" alt="{html.escape(cp.name)}（当前项目）"></a></td>'
                f'<td><a href="{abs_url(op)}" target="_blank" title="{html.escape(str(op))}">'
                f'<img loading="lazy" decoding="async" src="{abs_url(op)}" alt="{html.escape(op.name)}（对比目录）"></a></td>'
                f'<td><code>{ch[:16]}…</code><br><code>{oh[:16]}…</code></td></tr>')
        parts.append('</table>')
    for title, arr in [('仅当前项目存在',missing_source),('仅对比目录存在',missing_current)]:
        parts.append(f'<h2>{title}（{len(arr)}）</h2><ul>')
        for p in sorted(arr,key=lambda x:str(x).lower()):
            rel = p.relative_to(ROOT) if p.is_relative_to(ROOT) else p.relative_to(target)
            if args.list_images:
                parts.append(f'<li><a href="{abs_url(p)}" target="_blank">'
                             f'<img class="small" loading="lazy" decoding="async" src="{abs_url(p)}" alt="{html.escape(p.name)}"></a>'
                             f'<code>{html.escape(str(rel))}</code></li>')
            else:
                parts.append(f'<li><code>{html.escape(str(rel))}</code></li>')
        parts.append('</ul>')
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')
    return dict(diff=len(rows), only_current=len(missing_source), only_source=len(missing_current),
                total_current=len(cur), total_source=len(oth), res_diff=n_res, out=out/'report.html')

for i, raw in enumerate(args.targets, 1):
    target = Path(raw).resolve()
    if not target.is_dir():
        print(f'[{i}/{len(args.targets)}] 跳过（目录不存在）：{target}')
        continue
    out = out_dir_for(target)
    stats = report(target, out)
    print(f"[{i}/{len(args.targets)}] 对比 {target} -> {stats['out']}")
    print(f"    diff={stats['diff']} (分辨率不同 {stats['res_diff']}) only_current={stats['only_current']} "
          f"only_source={stats['only_source']} total_current={stats['total_current']} total_source={stats['total_source']}")
