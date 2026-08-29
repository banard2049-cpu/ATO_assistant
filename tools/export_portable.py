#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from packaging.package_common import (
    CACHE_ROOT,
    EXPORT_ROOT,
    TOOLS_ROOT,
    audit_export_tree,
    audit_zip_executables,
    copy_export_tree,
    download,
    extract_archive,
    find_file,
    make_executable,
    safe_version,
    version_text,
    zip_directory,
)


PHP_MAC_VERSION = "8.4.22"
PHP_WINDOWS_VERSION = "8.4.22"
PHP_STATIC_BASE = "https://dl.static-php.dev/static-php-cli"
PHP_WINDOWS_BASE = "https://windows.php.net/downloads/releases"
TARGETS = ("windows-x64", "macos-arm64", "macos-x64", "docker")


def prepare_site(stage: Path) -> None:
    copy_export_tree(stage)
    audit_export_tree(stage)


def finish_zip(stage: Path, filename: str) -> Path:
    output = zip_directory(stage, EXPORT_ROOT / filename)
    audit_zip_executables(output)
    shutil.rmtree(stage)
    return output


def build_windows(version: str) -> Path:
    package_name = f"ATO-Assistant-Portable-{version}-windows-x64"
    stage = CACHE_ROOT / "portable-build" / package_name
    prepare_site(stage)
    # Keep a distinct cache name so older static-php archives (which lack
    # session) are never reused after switching runtime sources.
    filename = f"php-{PHP_WINDOWS_VERSION}-Win32-vs17-x64.zip"
    # The static-php CLI builds omit the session extension used by
    # campaign-state.php. Use the official Windows distribution instead.
    archive = download(
        f"{PHP_WINDOWS_BASE}/php-{PHP_WINDOWS_VERSION}-Win32-vs17-x64.zip",
        CACHE_ROOT / "php" / filename,
    )
    runtime = stage / "runtime" / "php"
    extract_archive(archive, runtime)
    php = runtime / "php.exe"
    if not php.exists():
        found = find_file(runtime, ("php.exe",))
        if found:
            shutil.copy2(found, php)
    if not php.exists():
        raise RuntimeError("下载的 Windows PHP 中没有 php.exe。")
    # The official ZIP ships extensions as DLLs and does not include an active
    # php.ini. Enable the session extension required by the local auth API.
    php_ini = runtime / "php.ini"
    if not php_ini.exists():
        php_ini.write_text("[PHP]\nextension_dir=\"ext\"\nextension=session\n", encoding="ascii")
    shutil.copy2(TOOLS_ROOT / "packaging/portable/start-ato-portable.bat", stage / "start-ato-portable.bat")
    shutil.copy2(TOOLS_ROOT / "packaging/portable/README.txt", stage / "README-PORTABLE.txt")
    audit_export_tree(stage)
    return finish_zip(stage, f"{package_name}.zip")


def build_macos(version: str, architecture: str) -> Path:
    target = f"macos-{architecture}"
    package_name = f"ATO-Assistant-Portable-{version}-{target}"
    stage = CACHE_ROOT / "portable-build" / package_name
    prepare_site(stage)
    runtime_arch = "aarch64" if architecture == "arm64" else "x86_64"
    filename = f"php-{PHP_MAC_VERSION}-cli-macos-{runtime_arch}.tar.gz"
    archive = download(f"{PHP_STATIC_BASE}/common/{filename}", CACHE_ROOT / "php" / filename)
    runtime = stage / "runtime" / "php"
    extract_archive(archive, runtime)
    php = runtime / "bin" / "php"
    if not php.exists():
        found = find_file(runtime, ("php",))
        if not found:
            raise RuntimeError(f"下载的 {target} PHP 中没有 php。")
        php.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(found, php)
    make_executable(php)
    launcher = stage / "start-ato-portable.command"
    shutil.copy2(TOOLS_ROOT / "packaging/portable/start-ato-portable.command", launcher)
    make_executable(launcher)
    shutil.copy2(TOOLS_ROOT / "packaging/portable/README.txt", stage / "README-PORTABLE.txt")
    audit_export_tree(stage)
    return finish_zip(stage, f"{package_name}.zip")


def build_docker(version: str) -> Path:
    package_name = f"ATO-Assistant-Docker-{version}"
    stage = CACHE_ROOT / "portable-build" / package_name
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    app = stage / "app"
    prepare_site(app)
    (stage / "data").mkdir()
    docker_source = TOOLS_ROOT / "packaging/docker"
    shutil.copy2(docker_source / "Dockerfile", stage / "Dockerfile")
    shutil.copy2(docker_source / "docker-entrypoint.sh", stage / "docker-entrypoint.sh")
    shutil.copy2(docker_source / "compose.yaml", stage / "compose.yaml")
    shutil.copy2(docker_source / "README.txt", stage / "README-DOCKER.txt")
    audit_export_tree(stage)
    return finish_zip(stage, f"{package_name}.zip")


def main() -> int:
    parser = argparse.ArgumentParser(description="导出 Windows/macOS Portable 与 Docker 包；缺少 PHP 时自动下载。")
    parser.add_argument("--target", action="append", choices=("all",) + TARGETS, help="可重复；默认 all")
    parser.add_argument("--version", default="local", help="成品文件名版本")
    args = parser.parse_args()
    version = safe_version(version_text(args.version))
    requested = args.target or ["all"]
    targets = TARGETS if "all" in requested else tuple(dict.fromkeys(requested))
    EXPORT_ROOT.mkdir(exist_ok=True)

    outputs: list[Path] = []
    for target in targets:
        print(f"\n生成 {target} …")
        if target == "windows-x64":
            outputs.append(build_windows(version))
        elif target == "macos-arm64":
            outputs.append(build_macos(version, "arm64"))
        elif target == "macos-x64":
            outputs.append(build_macos(version, "x64"))
        elif target == "docker":
            outputs.append(build_docker(version))

    print("\n导出完成：")
    for output in outputs:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
