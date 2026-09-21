#!/usr/bin/env python3
"""官方版 .atopack 打包器：官方有图就用官方图，故事书 js 只留官方正文，原书图一起打包。

三件事都按"官方优先、缺了保留原样"来做：

1. **图片**：``--ato-root/official-assets/``（官中覆盖图）里有的目标就用它替换，没有的
   原样保留工程目录里那份（``official-assets/`` 支持镜像完整项目路径，也支持只留资源
   目录、后缀不一致，规则见 ``app/official_assets.py``）。工程里还缺的图才会退到
   ``--library`` 兜底。
2. **故事书 js**：包里的 ``story/data/storybook-data.js`` 用
   ``story/data/storybook-official-data.js`` 生成——条目 id/key 与官方数据一致、
   正文与标题一律取 ``officialText`` / ``officialTitle``，没有官方正文的条目直接不要，
   官方数据里独有的条目补进来。**民间正文一个字都不进包**（要民间版就用
   ``build_fan_pack.py``）。
3. **官方故事书图**：``story/data/ato-storybook-key-scans/*`` 原书扫描图默认全部打进
   ``resourceFiles`` 段（同时带着官方正文数据），格式版本因此是 3。缺一张就停下报错，
   不会打出一个坏包；确实要打不含截图的包加 ``--no-official-scans``。

引擎与民间版共用（``build_fan_pack.py`` 里的写入、校验、原子改名只有一份实现）：
先写 ``<输出>.partial`` → 刷盘 → 校验 → 原子改名成 ``.atopack``；失败时最终路径上
不会留下任何文件。

用法
----
::

    python build_official_pack.py --ato-root D:\\desktop\\ATO_assistant \\
        --output export\\ATO-Assistant-Resources-2026-09-19-official.atopack

常用加料::

    --dry-run                 只统计不写盘（先看体积、条目数、扫描图数量）
    --no-official-assets      不用官中覆盖图，图片全取工程目录
    --no-official-scans       不打包原书扫描图（只带官方正文数据）
    --story-source project    故事书 js 改回工程里的民间版（默认 official）
    --library D:\\delete       工程里缺图时用素材库兜底
    --verify full             改名之前把包内每个成员重新哈希一遍（慢，最稳）
    --json                    机器可读摘要（进度仍走 stderr）
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__:
    from .build_fan_pack import PackError, Reporter, as_list, build, report
    from .image_shrink import load_keep_patterns
else:  # 直接当脚本跑（python build_official_pack.py）
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_fan_pack import PackError, Reporter, as_list, build, report
    from image_shrink import load_keep_patterns

TOOL_NAME = "build_official_pack"
TOOL_VERSION = "1.0.0"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog=TOOL_NAME,
        description="从 ATO_assistant 工程目录打一个官方版 .atopack（官中图优先、只留官方正文、带原书扫描图）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例：\n"
            "  python build_official_pack.py --ato-root D:\\\\desktop\\\\ATO_assistant "
            "--output export\\\\ATO-Assistant-Resources-official.atopack\n"
            "  python build_official_pack.py --ato-root . --output out.atopack --dry-run\n"
        ),
    )
    parser.add_argument("--ato-root", type=Path, required=True, help="ATO_assistant 根目录（素材、故事、official-assets/ 的真源）")
    parser.add_argument("--output", type=Path, required=True, help="输出的 .atopack 路径")
    parser.add_argument("--library", type=Path, help="可选兜底：工程目录里缺图时用素材库的同一条目")
    parser.add_argument("--cycle", action="append", default=[], help="只打这些循环，可重复或逗号分隔")
    parser.add_argument("--module", action="append", default=[], help="只打这些模块，可重复或逗号分隔")
    parser.add_argument("--complete-only", action="store_true", help="只打正反面都齐了的条目")
    parser.add_argument(
        "--story-source", choices=("official", "project"), default="official",
        help="故事书 js 的来源：official=只留官方正文（默认）；project=用工程里的民间版",
    )
    parser.add_argument("--no-official-assets", action="store_true", help="不用 official-assets/ 官中覆盖图（默认使用）")
    parser.add_argument("--no-official-scans", action="store_true", help="不打包官方原书扫描图（默认打包）")
    parser.add_argument("--no-story-data", action="store_true", help="不带故事正文与人物小传")
    parser.add_argument("--no-bgm", action="store_true", help="不带主控台背景音乐")
    parser.add_argument("--no-story-files", action="store_true", help="不在包里额外落 story/data/*.js（默认落）")
    parser.add_argument("--skip-missing", action="store_true", help="找不到文件的面跳过而不是中断")
    parser.add_argument("--force", action="store_true", help="允许覆盖已存在的输出")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写盘")
    parser.add_argument(
        "--compress", choices=("store", "deflate"), default="store",
        help="store 最快（图片本来就压过了）；deflate 体积略小",
    )
    parser.add_argument(
        "--verify", choices=("none", "sample", "full"), default="sample",
        help="改名之前的包内校验强度（默认抽样）",
    )
    parser.add_argument("--verify-sample", type=int, default=32, help="抽样校验的成员数量（默认 32）")
    parser.add_argument(
        "--image-quality", type=int, default=None,
        help=(
            "打包时把图片重新编码到这个 JPEG 质量（40–95，常用 85）来缩小体积；"
            "不传就完全不重编（历史口径）。成员名不变，透明图走调色板 PNG，收益不够的保持原样"
        ),
    )
    parser.add_argument(
        "--image-quality-keep", action="append", default=[],
        help="重编码豁免通配（可重复/逗号分隔），命中的图原样进包，例如 ss/battle-board.jpg",
    )
    parser.add_argument(
        "--image-quality-keep-file", type=Path,
        help="豁免名单文件：一行一条通配，`#` 开头是注释",
    )
    parser.add_argument("--json", action="store_true", help="stdout 输出机器可读摘要")
    parser.add_argument("--quiet", action="store_true", help="不打印进度")
    parser.add_argument("--version", action="version", version=f"{TOOL_NAME} {TOOL_VERSION}")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    reporter = Reporter(quiet=args.quiet)
    try:
        result = build(
            ato_root=args.ato_root,
            output=args.output,
            library_path=args.library,
            cycles=as_list(args.cycle),
            modules=as_list(args.module),
            complete_only=args.complete_only,
            include_story_data=not args.no_story_data,
            include_bgm=not args.no_bgm,
            include_story_files=not args.no_story_files,
            # 官方版：官方正文数据必带（否则就不是官方版了），原书图默认一起打。
            official_story=True,
            official_scans=not args.no_official_scans,
            official_assets=not args.no_official_assets,
            skip_missing=args.skip_missing,
            force=args.force,
            dry_run=args.dry_run,
            compression_name=args.compress,
            verify_mode=args.verify,
            verify_sample=args.verify_sample,
            reporter=reporter,
            story_source=args.story_source,
            edition="official",
            image_quality=args.image_quality,
            image_quality_keep=as_list(args.image_quality_keep)
            + load_keep_patterns(args.image_quality_keep_file),
        )
    except PackError as error:
        print(f"打包失败：{error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("已中断：最终路径上没有生成任何文件", file=sys.stderr)
        return 130

    if args.json:
        print(json.dumps(result.__dict__, ensure_ascii=False, indent=2))
    else:
        report(result, reporter)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
