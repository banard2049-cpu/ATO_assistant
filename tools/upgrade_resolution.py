#!/usr/bin/env python3
"""用更高分辨率的同名图片替换 assets\\ 与 aibp\\ps\\ 中的低分辨率图片。

默认只做分析（dry-run），不会改动任何文件；加 --apply 才真正替换。
替换前会把原文件备份到 image_asset_compare_report\\.backup-originals\\ 下（该目录被比对脚本忽略）。
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

# 项目根目录按脚本自身位置推导（tools/upgrade_resolution.py -> 项目根）。
ROOT = Path(__file__).resolve().parents[1]
BACKUP_ROOT = ROOT / 'image_asset_compare_report' / '.backup-originals'
TARGET_DIRS = ('assets', r'aibp\ps')
SOURCES = (Path(r'D:\download\ATO---c1-3'), Path(r'D:\download\ato2'))
EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}

ap = argparse.ArgumentParser(description='把两个目录里的图片换成更高分辨率的同名版本')
ap.add_argument('--apply', action='store_true', help='真正写入替换（默认仅分析）')
ap.add_argument('--allow-aspect-change', action='store_true', help='允许替换后宽高比变化（默认要求宽高比一致）')
ap.add_argument('--min-gain', type=float, default=1.0, help='候选图片像素需比当前至少多出该倍数才替换，默认 1.0（即只要更大就换）')
ap.add_argument('--plan', default=str(ROOT / 'image_asset_compare_report' / 'resolution_upgrade_plan.json'),
                help='分析结果写出的 JSON 路径')
args = ap.parse_args()


def pixels(path: Path):
    try:
        with Image.open(path) as im:
            return im.width * im.height, im.width, im.height, im.format
    except Exception:
        return None, None, None, None


def index_source(source: Path):
    by_rel: dict[str, Path] = {}
    by_name: dict[str, list[Path]] = defaultdict(list)
    if not source.is_dir():
        return by_rel, by_name
    for p in source.rglob('*'):
        if p.is_file() and p.suffix.lower() in EXTS:
            by_rel.setdefault(p.relative_to(source).as_posix().lower(), p)
            by_name[p.name.lower()].append(p)
    return by_rel, by_name


def collect_current():
    out = []
    for rel_dir in TARGET_DIRS:
        base = ROOT / rel_dir
        if not base.is_dir():
            print(f'跳过（目录不存在）：{base}', file=sys.stderr)
            continue
        for p in sorted(base.rglob('*')):
            if p.is_file() and p.suffix.lower() in EXTS:
                out.append(p)
    return out


def aspect(a, b, tol=0.01):
    if not a[1] or not a[2] or not b[1] or not b[2]:
        return False
    return abs(a[1] / a[2] - b[1] / b[2]) <= tol * max(a[1] / a[2], b[1] / b[2], 1e-9)


def main() -> int:
    indexes = {src: index_source(src) for src in SOURCES}
    current = collect_current()
    print(f'目标目录待检查图片：{len(current)} 张')
    for src, (by_rel, by_name) in indexes.items():
        print(f'  来源 {src}：{len(by_name)} 个文件名索引')

    plan = []
    counters = defaultdict(int)
    for cur in current:
        cur_px, cw, ch, cfmt = pixels(cur)
        rel = cur.relative_to(ROOT).as_posix().lower()
        name = cur.name.lower()
        # 收集所有候选来源
        candidates = []
        for src, (by_rel, by_name) in indexes.items():
            cand = by_rel.get(rel)
            if cand is None:
                pool = by_name.get(name, [])
                if pool:
                    cand = max(pool, key=lambda x: pixels(x)[0] or -1)
            if cand is not None and cand != cur:
                candidates.append((src, cand))
        if cur_px is None:
            counters['当前图片无法读取'] += 1
            continue
        best = None
        for src, cand in candidates:
            cpx, w, h, fmt = pixels(cand)
            if cpx is None:
                continue
            if cpx >= (best[2] if best else -1):
                best = (src, cand, cpx, w, h, fmt)
        if best is None:
            counters['来源中无同名文件'] += 1
            plan.append(dict(action='skip', reason='no-source', file=str(cur),
                             current=f'{cw}x{ch}', current_px=cur_px))
            continue
        src, cand, cpx, w, h, fmt = best
        same_aspect = aspect((None, cw, ch, None), (None, w, h, None))
        if cpx <= cur_px * args.min_gain:
            counters['来源分辨率不更高'] += 1
            plan.append(dict(action='skip', reason='not-higher', file=str(cur), current=f'{cw}x{ch}',
                             current_px=cur_px, source=str(cand), source_res=f'{w}x{h}', source_px=cpx))
            continue
        if not same_aspect and not args.allow_aspect_change:
            counters['分辨率更高但宽高比不同'] += 1
            plan.append(dict(action='skip', reason='aspect-mismatch', file=str(cur), current=f'{cw}x{ch}',
                             current_px=cur_px, source=str(cand), source_res=f'{w}x{h}', source_px=cpx))
            continue
        counters['将替换'] += 1
        plan.append(dict(action='replace', file=str(cur), current=f'{cw}x{ch}', current_px=cur_px,
                         source=str(cand), source_res=f'{w}x{h}', source_px=cpx,
                         gain=round(cpx / cur_px, 2), same_ext=cand.suffix.lower() == cur.suffix.lower()))

    print('\n=== 结论 ===')
    for k, v in sorted(counters.items(), key=lambda kv: -kv[1]):
        print(f'{k}: {v}')
    best_rows = [r for r in plan if r['action'] == 'replace']
    best_rows.sort(key=lambda r: -r['gain'])
    print('\n增益最大的 10 项：')
    for r in best_rows[:10]:
        print(f"  {Path(r['file']).relative_to(ROOT)}  {r['current']} -> {r['source_res']}  (x{r['gain']})")
    print('\n宽高比不同而跳过的样例：')
    for r in [r for r in plan if r.get('reason') == 'aspect-mismatch'][:10]:
        print(f"  {Path(r['file']).relative_to(ROOT)}  {r['current']} vs {r['source_res']}")

    out = Path(args.plan)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dict(counts=dict(counters), plan=plan), ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'\n计划已写入：{out}')

    if not args.apply:
        print('\n（dry-run，未修改任何文件；确认后加 --apply 执行）')
        return 0

    replaced = 0
    for r in plan:
        if r['action'] != 'replace':
            continue
        cur, src = Path(r['file']), Path(r['source'])
        backup = BACKUP_ROOT / cur.relative_to(ROOT)
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(cur, backup)
        if src.suffix.lower() == cur.suffix.lower():
            shutil.copy2(src, cur)
        else:  # 扩展名不同则按目标格式重新编码
            with Image.open(src) as im:
                im.convert('RGBA' if cur.suffix.lower() == '.png' else 'RGB').save(cur)
        replaced += 1
    print(f'已替换 {replaced} 个文件；原文件备份在 {BACKUP_ROOT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
