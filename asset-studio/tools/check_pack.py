#!/usr/bin/env python3
"""检查 .atopack 资料包是否完整、里面到底有什么。

打包器（``build_fan_pack.py``）会保证自己写出来的包是完整的；这个脚本用来检查
**手上任何一个** ``.atopack``——尤其是别人给的、或者旧导出路径留下的：

* 有没有 EOCD（中央目录）：没有就是写到一半被打断的半成品，谁都打不开；
* 每个成员是不是都读得出来（``--crc`` 会逐个校验 CRC，慢但最彻底）；
* 清单声明的图片是不是都在包里（``--hash`` 顺带核对每张图的 SHA-256）；
* 清单摘要：条目/图片数、故事、人物小传、背景音乐、官方资料，以及是民间版还是官方版。

用法::

    python check_pack.py E:\\ATO-Assistant-Resources-2026-09-19.atopack
    python check_pack.py 包.atopack --crc --hash
    python check_pack.py 目录/*.atopack

退出码：0 全部正常；1 有包不完整或清单有问题。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import zipfile
from pathlib import Path

EOCD = b"PK\x05\x06"
ZIP64_EOCD = b"PK\x06\x06"
CHUNK = 4 * 1024 * 1024


def human_bytes(size: int) -> str:
    if size >= 1024 ** 3:
        return f"{size / 1024 ** 3:.2f} GiB"
    if size >= 1024 ** 2:
        return f"{size / 1024 ** 2:.1f} MiB"
    return f"{size / 1024:.1f} KiB"


def scan_tail(path: Path, window: int = 1 << 22) -> dict:
    size = path.stat().st_size
    with path.open("rb") as handle:
        header = handle.read(4)
        handle.seek(max(0, size - window))
        tail = handle.read()
    eocd = tail.rfind(EOCD)
    result = {
        "size": size,
        "header": header,
        "size_is_plausible": header == b"PK\x03\x04",
        "eocd": size - len(tail) + eocd if eocd >= 0 else None,
        "zip64": tail.rfind(ZIP64_EOCD) >= 0,
    }
    if eocd >= 0 and len(tail) >= eocd + 22:
        fields = struct.unpack("<4s4H2LH", tail[eocd:eocd + 22])
        result["entries"] = fields[4]
    return result


def check(path: Path, crc: bool, hash_check: bool) -> bool:
    print(f"{path}")
    if not path.is_file():
        print("  ✗ 不是文件")
        return False
    tail = scan_tail(path)
    print(f"  大小      : {human_bytes(tail['size'])}（{tail['size']:,} 字节）")
    if not tail["size_is_plausible"]:
        print(f"  ✗ 文件头不是 ZIP（{tail['header']!r}），这不像 .atopack")
        return False
    if tail["eocd"] is None:
        print("  ✗ 找不到中央目录（EOCD）：这是个**半成品**，解压工具打不开 —— 重新打一次包")
        return False
    print(f"  中央目录  : 位置 {tail['eocd']:,}{'（ZIP64）' if tail['zip64'] else ''}")
    ok = True
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile as error:
        print(f"  ✗ 打不开：{error}")
        return False
    with archive:
        names = archive.namelist()
        print(f"  成员      : {len(names):,}")
        if "manifest.json" not in names:
            print("  ✗ 包里没有 manifest.json：半成品或不是资料包")
            return False
        try:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            print(f"  ✗ manifest.json 读不出来：{error}")
            return False
        print(f"  格式      : {manifest.get('format')} / 版本 {manifest.get('version')}")

        assets = manifest.get("assets") or []
        books = (manifest.get("stories") or {}).get("books") or []
        resource_files = manifest.get("resourceFiles") or []
        bgm = manifest.get("bgmFiles") or []
        print(f"  条目/图片 : {len(manifest.get('items') or [])} / {len(assets)}")
        print(f"  故事      : {len(books)} 本 / {sum(book.get('entryCount', 0) for book in books)} 段")
        story_files = manifest.get("storyFiles") or []
        entities = story_files[0].get("entityCount") if story_files else 0
        print(f"  人物小传  : {entities or 0} 条")
        print(f"  背景音乐  : {len(bgm)} 首")
        build = manifest.get("build") or {}
        edition = build.get("edition") or ("官方版（含官方资料）" if resource_files else "民间版")
        print(f"  版本口径  : {edition}")
        print(f"  官方资料  : {len(resource_files)} 个文件"
              + ("（官方正文 / 原书扫描图）" if resource_files else "（没有官方内容）"))

        name_set = set(names)
        missing = [str(asset.get("member")) for asset in assets if str(asset.get("member")) not in name_set]
        if missing:
            ok = False
            print(f"  ✗ 清单声明但包里没有的成员：{len(missing)} 个，例如 {missing[:3]}")
        else:
            print("  ✓ 清单声明的图片全部在包里")

        if hash_check and not missing:
            bad = []
            for asset in assets:
                digest = hashlib.sha256()
                with archive.open(str(asset["member"])) as source:
                    while chunk := source.read(CHUNK):
                        digest.update(chunk)
                if digest.hexdigest() != str(asset.get("sha256")):
                    bad.append(str(asset.get("member")))
            if bad:
                ok = False
                print(f"  ✗ 哈希不符的成员：{len(bad)} 个，例如 {bad[:3]}")
            else:
                print(f"  ✓ {len(assets)} 张图的 SHA-256 全部与清单一致")

        if crc:
            bad_member = archive.testzip()
            if bad_member:
                ok = False
                print(f"  ✗ CRC 校验失败：{bad_member}")
            else:
                print("  ✓ 每个成员的 CRC 都对得上")

    print("  => 包是完整的" if ok else "  => 这个包有问题，别拿去分发")
    return ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="检查 .atopack 是否完整、内容是什么")
    parser.add_argument("packs", nargs="+", type=Path, help="要检查的 .atopack（可给多个）")
    parser.add_argument("--crc", action="store_true", help="逐个成员校验 CRC（慢）")
    parser.add_argument("--hash", action="store_true", help="核对每张图的 SHA-256（慢）")
    args = parser.parse_args(argv)

    results = [check(path, args.crc, args.hash) for path in args.packs]
    print()
    print(f"检查完成：{sum(results)}/{len(results)} 个包正常")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
