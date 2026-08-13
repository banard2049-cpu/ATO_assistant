from __future__ import annotations

import os
import re
import shutil
import stat
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
TOOLS_ROOT = PROJECT_ROOT / "tools"
CACHE_ROOT = TOOLS_ROOT / ".packaging-cache"
EXPORT_ROOT = PROJECT_ROOT / "export"

BLOCKED_TOP = {
    ".git", ".github", ".agents", ".codex", ".idea", ".vscode",
    "asset-studio", "dist", "export", "release", "releases", "node_modules",
}
BLOCKED_LEAVES = {
    ".ds_store", ".gitattributes", ".gitignore", "dockerfile",
    "docker-compose.yml", "docker-compose.yaml",
}
BLOCKED_SUFFIXES = (
    ".backup", ".bak", ".tmp", ".log", ".lock", ".atoback",
    ".atoback.partial",
)


def version_text(value: str | None) -> str:
    if value:
        return value.removeprefix("v")
    return "local"


def safe_version(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z._-]", "-", value)


def excluded(relative: Path) -> bool:
    parts = [part.lower() for part in relative.parts]
    if not parts:
        return False
    if "tools" in parts or "data" in parts:
        return True
    if parts[0] in BLOCKED_TOP:
        return True
    leaf = parts[-1]
    if leaf in BLOCKED_LEAVES:
        return True
    if leaf.startswith(("start-windows", "start-macos", "php_errors", "error_log")):
        return True
    if any(leaf.endswith(suffix) for suffix in BLOCKED_SUFFIXES):
        return True
    if re.search(r"\.backup\.\d+$", leaf):
        return True
    return False


def copy_export_tree(destination: Path, *, create_data: bool = True) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for current, directories, filenames in os.walk(PROJECT_ROOT):
        current_path = Path(current)
        current_relative = current_path.relative_to(PROJECT_ROOT)
        directories[:] = [
            name for name in directories
            if not excluded(current_relative / name)
        ]
        for filename in filenames:
            source = current_path / filename
            relative = source.relative_to(PROJECT_ROOT)
            if excluded(relative):
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    if create_data:
        (destination / "data").mkdir(exist_ok=True)
    disable_developer_links(destination)


def disable_developer_links(root: Path) -> None:
    pattern = re.compile(r"(?:\.\./)+tools/")
    for extension in ("*.html", "*.js"):
        for path in root.rglob(extension):
            text = path.read_text(encoding="utf-8", errors="replace")
            updated = pattern.sub("#export-tools-unavailable/", text)
            if updated != text:
                path.write_text(updated, encoding="utf-8")


def audit_export_tree(root: Path) -> None:
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        parts = [part.lower() for part in relative.parts]
        if "tools" in parts:
            raise RuntimeError(f"导出内容包含 tools：{relative}")
        if "data" in parts and path.is_file():
            raise RuntimeError(f"导出内容的 data 不为空：{relative}")


def download(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 0:
        print(f"使用缓存：{destination.name}")
        return destination
    partial = destination.with_suffix(destination.suffix + ".partial")
    print(f"下载：{url}")
    request = urllib.request.Request(url, headers={"User-Agent": "ATO-Packager/1.0"})
    with urllib.request.urlopen(request) as response, partial.open("wb") as output:
        total = int(response.headers.get("Content-Length", "0"))
        copied = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
            copied += len(chunk)
            if total:
                print(f"\r  {copied * 100 // total:3d}%", end="", flush=True)
    if total:
        print()
    partial.replace(destination)
    return destination


def extract_archive(archive: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as source:
            source.extractall(destination)
        return
    with tarfile.open(archive, "r:*") as source:
        if sys.version_info >= (3, 12):
            source.extractall(destination, filter="data")
        else:
            source.extractall(destination)


def find_file(root: Path, names: tuple[str, ...]) -> Path | None:
    lowered = {name.lower() for name in names}
    for path in root.rglob("*"):
        if path.is_file() and path.name.lower() in lowered:
            return path
    return None


def make_executable(path: Path) -> None:
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def zip_directory(source: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for path in sorted(source.rglob("*")):
            relative = Path(source.name) / path.relative_to(source)
            if path.is_dir():
                if not any(path.iterdir()):
                    info = zipfile.ZipInfo(relative.as_posix().rstrip("/") + "/")
                    info.external_attr = (stat.S_IFDIR | 0o755) << 16
                    archive.writestr(info, b"")
                continue
            info = zipfile.ZipInfo.from_file(path, relative.as_posix())
            info.compress_type = zipfile.ZIP_DEFLATED
            with path.open("rb") as input_file, archive.open(info, "w", force_zip64=True) as output_file:
                shutil.copyfileobj(input_file, output_file, 1024 * 1024)
    return destination


def host_key() -> tuple[str, str]:
    platform_name = "windows" if os.name == "nt" else "mac" if sys.platform == "darwin" else "linux"
    machine = os.uname().machine.lower() if hasattr(os, "uname") else os.environ.get("PROCESSOR_ARCHITECTURE", "amd64").lower()
    architecture = "aarch64" if machine in {"arm64", "aarch64"} else "x64"
    return platform_name, architecture
