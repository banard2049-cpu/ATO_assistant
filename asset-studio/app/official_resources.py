"""Official story data and scans carried verbatim in .atopack files.

官方故事书正文数据与原书查询图都属于官方内容，**默认都不进资料包**：民间版资源包
（素材库导出、`export_package`）只带素材库里的民间正文与人物小传。要打官方版资料包
才显式打开（导出面板的「包含官方版故事书截图」/「包含官方故事书正文数据」，
或 `build_full_pack.py` / `update_full_pack.py` 的 `--include-official-scans`）。

截图后缀不限定 ``.jpg``：``.jpg/.jpeg/.png/.webp`` 都算官方截图，打包、校验、
导入与 Android 端走同一套后缀，避免只因为扩展名不同就把原书页面判成非法路径。
大小写一律不敏感（``.JPG``、``C1-0-0.PNG`` 同样收）。
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

DATA = "story/data/storybook-official-data.js"
SCANS = "story/data/ato-storybook-key-scans/"
LIBRARY = Path("sources/official-resources")
# 截图格式不限定一种：同一批原书页面可能是 .jpg 导出，也可能是 .png 截图，
# 打包与导入都按同一套后缀放行（Android 端 AtopackStore 保持同一条规则）。
# 大小写同样不敏感：相机/导出工具常给出 `.JPG`、`.PNG`，路径里的大写也不该被判非法。
SCAN_SUFFIXES = ("jpg", "jpeg", "png", "webp")
_SCAN_NAME = r"c[123]-[A-Za-z0-9_-]+\.(?:" + "|".join(SCAN_SUFFIXES) + r")"


def allowed_target(target: str) -> bool:
    return target == DATA or bool(
        re.fullmatch(re.escape(SCANS) + _SCAN_NAME, target, re.IGNORECASE)
    )


def collect(root: Path | None, include_scans: bool = True) -> list[tuple[str, Path]]:
    """Collect the official files that exist under ``root``.

    ``include_scans=False`` keeps only the official story data and skips the
    page screenshots.  That is what a 民间版 resource pack needs: the screenshots
    are the official book's own pages (2195 files locally) and must not be
    redistributed, while the official text alone still lets the story page fall
    back to 官方正文.  A scan that is missing locally is only an export error
    when the scans are actually being packed.
    """
    if root is None or not (root / DATA).is_file():
        return []
    import json
    text = (root / DATA).read_text(encoding="utf-8-sig")
    prefix = "window.STORYBOOK_OFFICIAL_DATA = "
    if not text.startswith(prefix):
        raise ValueError("官方故事书数据格式无法识别")
    # 数据文件本身两种模式都要带，所以格式错误一律在此拦下，别把坏文件打进包里。
    payload = json.loads(text[len(prefix):].strip().removesuffix(";"))
    targets = {DATA}
    if include_scans:
        for book in payload["books"]:
            for entry in book["entries"]:
                src = (entry.get("officialScan") or {}).get("src")
                if src:
                    target = "story/" + src.removeprefix("./")
                    if not allowed_target(target) or not (root / target).is_file():
                        raise ValueError(f"官方截图缺失或路径无效：{target}")
                    targets.add(target)
    return [(target, root / target) for target in sorted(targets)]


def add_to_archive(
    archive, manifest: dict, root: Path | None, fallback=None, fallback_manifest=None,
    include_scans: bool = False,
) -> None:
    """Write the official story files into an ``.atopack``.

    ``include_scans`` 默认关闭：对外发布的民间版资源包不带官方版故事书截图。
    只有显式构建官方版资料包时才传 ``True``。关闭时旧包回退（``fallback``）里
    的截图也要一并丢掉，只留官方故事书数据文件。
    """
    files = collect(root, include_scans=include_scans)
    manifest["resourceFiles"] = []
    if files:
        for target, path in files:
            raw = path.read_bytes()
            archive.writestr(target, raw)
            manifest["resourceFiles"].append({"target": target, "member": target,
                "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
    elif fallback is not None:
        for item in (fallback_manifest or {}).get("resourceFiles", []):
            if not include_scans and item.get("target") != DATA:
                continue
            raw = checked_bytes(fallback, item)
            archive.writestr(item["target"], raw)
            manifest["resourceFiles"].append(item)
    if manifest["resourceFiles"]:
        manifest["version"] = max(3, manifest["version"])


def checked_bytes(archive, item: dict) -> bytes:
    target = item.get("target", "")
    if not allowed_target(target) or item.get("member") != target:
        raise ValueError(f"不支持的官方资料路径：{target}")
    if archive.getinfo(target).file_size > 128 * 1024 * 1024:
        raise ValueError(f"官方资料文件过大：{target}")
    raw = archive.read(target)
    if hashlib.sha256(raw).hexdigest() != item.get("sha256"):
        raise ValueError(f"官方资料校验失败：{target}")
    return raw


def import_resources(archive, manifest: dict, library: Path, replace: bool) -> None:
    for item in manifest.get("resourceFiles", []):
        raw = checked_bytes(archive, item)
        target = library / LIBRARY / item["target"]
        if target.exists() and not replace:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
