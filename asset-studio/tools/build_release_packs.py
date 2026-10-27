#!/usr/bin/env python3
"""固定分发流程：民间旧蒙版、官方旧蒙版、民间新蒙版及其密码 ZIP。"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

if __package__:
    from .build_fan_pack import PackError, Reporter, build, commit_partial, verify_partial
    from .image_shrink import load_keep_patterns
else:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_fan_pack import PackError, Reporter, build, commit_partial, verify_partial
    from image_shrink import load_keep_patterns

PASSWORD = "20"
CHUNK_SIZE = 4 * 1024 * 1024
DEFAULT_ROOT = Path(__file__).resolve().parents[2]
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z.-]+)?")


@contextmanager
def staging_directory(parent: Path, prefix: str):
    # Windows 的受限执行环境会把 mkdir(0700) 生成的目录变成不可访问；
    # 直接用普通继承 ACL 的目录，不依赖 TemporaryDirectory/mkdtemp 的 0700。
    parent = parent.resolve()
    stage = parent / (prefix + uuid.uuid4().hex)
    os.mkdir(stage, mode=0o777)
    try:
        yield stage
    finally:
        shutil.rmtree(stage)


def output_paths(output_dir: Path, version: str, date: str,
                 current_name: str | None = None) -> dict[str, Path]:
    version = version.removeprefix("v")
    if not VERSION.fullmatch(version):
        raise PackError(f"版本号无效：{version}")
    try:
        if datetime.strptime(date, "%Y-%m-%d").strftime("%Y-%m-%d") != date:
            raise ValueError(date)
    except ValueError as error:
        raise PackError(f"日期必须为 YYYY-MM-DD：{date}") from error
    suffix = f"分层地图-q85-{date}-v{version}"
    if current_name is not None:
        if (not current_name or current_name in (".", "..")
                or re.search(r'[<>:"/\\|?*\x00-\x1f]', current_name)
                or current_name.endswith((" ", "."))
                or re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", current_name)):
            raise PackError("新版蒙版名称必须是不含路径或非法字符的文件名主体")
        current = output_dir / f"{current_name}.atopack"
    else:
        current = output_dir / f"ATOassets-民间版-新版蒙版-{suffix}.atopack"
    result = {
        "fan_legacy": output_dir / f"ATOassets-民间版-{suffix}.atopack",
        "official_legacy": output_dir / f"ATOassets-官方版-{suffix}.atopack",
        "fan_current": current,
        "encrypted": current.with_suffix(".zip"),
        "summary": output_dir / f"ATOassets-三包构建-{date}-v{version}.json",
    }
    if len({str(path).casefold() for path in result.values()}) != len(result):
        raise PackError("新版蒙版名称不能与其他输出文件重名")
    return result


def find_zip_tools(zip_tool: Path | None = None, unzip_tool: Path | None = None) -> tuple[Path, Path]:
    zip_path = str(zip_tool) if zip_tool is not None else shutil.which("zip")
    if not zip_path or not Path(zip_path).is_file():
        raise PackError("未找到 Info-ZIP zip；安装 zip/unzip，或传 --zip-tool 与 --unzip-tool")
    zip_path = Path(zip_path).resolve()
    sibling = zip_path.with_name("unzip" + zip_path.suffix)
    unzip_path = str(unzip_tool) if unzip_tool is not None else (
        str(sibling) if sibling.is_file() else shutil.which("unzip")
    )
    if not unzip_path or not Path(unzip_path).is_file():
        raise PackError("未找到 Info-ZIP unzip，无法校验加密层；请传 --unzip-tool")
    return zip_path, Path(unzip_path).resolve()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def verify_encrypted_zip(archive: Path, source: Path, member: str, unzip_tool: Path) -> dict:
    """原生解密后逐块比对 SHA，避免 Python ZipCrypto 对 GB 文件逐字节解密。"""
    try:
        with zipfile.ZipFile(archive) as package:
            entries = package.infolist()
            if (len(entries) != 1 or entries[0].filename != member
                    or not entries[0].flag_bits & 1 or entries[0].file_size != source.stat().st_size):
                raise PackError("加密 ZIP 必须只含一份启用密码保护的新版民间 .atopack")
            try:
                package.open(member).close()
            except RuntimeError:
                pass
            else:
                raise PackError("ZIP 未要求密码")
    except zipfile.BadZipFile as error:
        raise PackError(f"加密 ZIP 损坏：{archive}") from error
    digest = hashlib.sha256()
    size = 0
    # 传入的路径由 Python/Windows 解析；原生工具仅接收 ASCII 名称，避免旧版
    # Windows Info-ZIP 将中文命令行参数写成乱码。硬链接不占一份大包空间。
    with staging_directory(archive.parent, ".verify-atopack-") as stage:
        staged = stage / "package.zip"
        try:
            os.link(archive, staged)
        except OSError:
            shutil.copyfile(archive, staged)
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(
                [str(unzip_tool), "-p", "-P", PASSWORD, "package.zip"],
                cwd=stage, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=errors,
            )
            try:
                while chunk := process.stdout.read(CHUNK_SIZE):
                    digest.update(chunk)
                    size += len(chunk)
                code = process.wait()
            finally:
                process.stdout.close()
                if process.poll() is None:
                    process.kill()
                    process.wait()
            if code != 0:
                errors.seek(0)
                raise PackError("密码 ZIP 解密校验失败：" + errors.read(4096).decode(errors="replace"))
    expected = sha256_file(source)
    if size != source.stat().st_size or digest.hexdigest() != expected:
        raise PackError("加密 ZIP 解密后的内容与新版民间 .atopack 不一致")
    return {"output": str(archive), "bytes": archive.stat().st_size, "member": member,
            "password": PASSWORD, "encryption": "ZipCrypto", "decoded_bytes": size,
            "decoded_sha256": expected}


def encrypted_zip(source: Path, destination: Path, member: str, zip_tool: Path,
                  unzip_tool: Path, reporter: Reporter) -> dict:
    if not member.isascii() or Path(member).name != member or not member.endswith(".atopack"):
        raise PackError("加密 ZIP 内部文件名必须为 ASCII .atopack 文件名")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with staging_directory(destination.parent, ".encrypt-atopack-") as stage:
        alias = stage / member
        try:
            os.link(source, alias)
        except OSError:
            shutil.copyfile(source, alias)
        reporter.say("压缩新版民间包并设置密码 20……")
        result = subprocess.run(
            [str(zip_tool), "-q", "-j", "-1", "-P", PASSWORD, "package.zip", member],
            cwd=stage, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        if result.returncode:
            raise PackError("加密 ZIP 构建失败：" + result.stdout.decode(errors="replace")[-4096:])
        pending = stage / "package.zip"
        reporter.say("原生解密并校验新版民间包 SHA-256……")
        summary = verify_encrypted_zip(pending, source, member, unzip_tool)
        partial = Path(str(destination) + ".partial")
        os.replace(pending, partial)
        commit_partial(partial, destination, reporter)
    return {**summary, "output": str(destination)}


def resume_pack(path: Path, edition: str, mask: str, keep: list[str], reporter: Reporter) -> dict:
    try:
        with zipfile.ZipFile(path) as archive:
            manifest = json.loads(archive.read("manifest.json"))
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        raise PackError(f"不能复用现有包：{path}（{error}）") from error
    metadata = manifest.get("build", {})
    expected = {"edition": edition, "mapMaskVersion": mask, "imageQuality": 85,
                "imageQualityKeep": sorted(keep), "officialScans": edition == "official"}
    for key, value in expected.items():
        if metadata.get(key) != value:
            raise PackError(f"现有包的 {key} 与固定流程不一致：{path}；用 --force 重建")
    reporter.say(f"校验并复用现有包：{path.name}")
    verification = verify_partial(path, manifest, [], [], "full", 32, reporter)
    return {"output": str(path), "bytes": path.stat().st_size,
            "assets": len(manifest.get("assets", [])), "map_files": len(manifest.get("mapFiles", [])),
            "edition": edition, "map_mask_version": mask, "verification": verification, "resumed": True}


def build_release(*, ato_root: Path, version: str, date: str, output_dir: Path | None = None,
                  current_name: str | None = None,
                  library_path: Path | None = None, incremental_fan: Path | None = None,
                  incremental_official: Path | None = None, force: bool = False, resume: bool = False,
                  dry_run: bool = False, zip_tool: Path | None = None, unzip_tool: Path | None = None,
                  reporter: Reporter | None = None) -> dict:
    reporter = reporter or Reporter()
    ato_root = ato_root.expanduser().resolve()
    output_dir = (output_dir or ato_root / "export").expanduser().resolve()
    paths = output_paths(output_dir, version, date, current_name=current_name)
    if force and resume:
        raise PackError("--force 与 --resume 不能同时使用")
    if not dry_run and not force and not resume:
        existing = [path for path in paths.values() if path.exists()]
        if existing:
            raise PackError(f"输出已存在：{existing[0]}（--resume 校验后继续，或 --force 重建）")
    tools = find_zip_tools(zip_tool, unzip_tool) if not dry_run else None
    keep = load_keep_patterns(Path(__file__).resolve().parents[1] / "pack-shrink-keep.txt")
    if "map/*" not in keep:
        keep.append("map/*")
    summary = {"workflow": "three-atopacks-v1", "version": version.removeprefix("v"), "date": date,
               "dry_run": dry_run, "packs": []}
    for key, edition, mask in (("fan_legacy", "fan", "legacy"),
                               ("official_legacy", "official", "legacy"),
                               ("fan_current", "fan", "current")):
        path = paths[key]
        if resume and path.exists() and not dry_run:
            result = resume_pack(path, edition, mask, keep, reporter)
        else:
            previous = (paths["fan_legacy"] if mask == "current" and not dry_run
                        else incremental_official if edition == "official" else incremental_fan)
            result = vars(build(
                ato_root=ato_root, output=path, library_path=library_path, cycles=[], modules=[],
                complete_only=False, include_story_data=True, include_story_files=True,
                include_bgm=True, include_icons=True, include_cryptic=True, include_mixed_media=True,
                official_story=True, official_scans=edition == "official", official_assets=edition == "official",
                skip_missing=False, force=force, dry_run=dry_run, compression_name="store",
                verify_mode="full", verify_sample=32, reporter=reporter,
                story_source="official" if edition == "official" else "project", edition=edition,
                image_quality=85, image_quality_keep=keep, incremental_from=previous, map_mask_version=mask,
            ))
        summary["packs"].append({**result, "variant": key})
    member = f"ATOassets-fan-current-q85-{date}-v{version.removeprefix('v')}.atopack"
    if dry_run:
        summary["encrypted"] = {"output": str(paths["encrypted"]), "member": member, "password": PASSWORD}
        return summary
    if resume and paths["encrypted"].exists():
        summary["encrypted"] = verify_encrypted_zip(paths["encrypted"], paths["fan_current"], member, tools[1])
    else:
        summary["encrypted"] = encrypted_zip(paths["fan_current"], paths["encrypted"], member, *tools, reporter)
    summary["summary"] = str(paths["summary"])
    partial = Path(str(paths["summary"]) + ".partial")
    partial.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    commit_partial(partial, paths["summary"], reporter)
    reporter.say(f"三包与密码 ZIP 已完成；构建记录：{paths['summary']}")
    return summary


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ato-root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--version", required=True, help="分发版本号，例如 3.8.13")
    parser.add_argument("--date", default=datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d"))
    parser.add_argument("--output-dir", type=Path, help="默认 <ato-root>/export")
    parser.add_argument("--current-name", help="新版蒙版 .atopack 和密码 ZIP 的文件名主体；不含扩展名")
    parser.add_argument("--library", type=Path, dest="library_path")
    parser.add_argument("--incremental-fan", type=Path)
    parser.add_argument("--incremental-official", type=Path)
    parser.add_argument("--zip-tool", type=Path, help="Info-ZIP zip 可执行文件；默认从 PATH 查找")
    parser.add_argument("--unzip-tool", type=Path, help="Info-ZIP unzip；默认与 zip 同目录或从 PATH 查找")
    choice = parser.add_mutually_exclusive_group()
    choice.add_argument("--force", action="store_true", help="重建并原子替换现有输出")
    choice.add_argument("--resume", action="store_true", help="核对口径与完整哈希后复用现有包，继续未完成步骤")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--json", action="store_true", help="stdout 输出构建摘要")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    options = vars(parse_args(argv))
    json_output = options.pop("json")
    reporter = Reporter(quiet=options.pop("quiet"))
    try:
        summary = build_release(**options, reporter=reporter)
    except (PackError, OSError, ValueError) as error:
        print(f"三包构建失败：{error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("三包构建已中断；完整产物可通过 --resume 校验后继续。", file=sys.stderr)
        return 130
    if json_output:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
