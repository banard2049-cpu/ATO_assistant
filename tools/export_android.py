#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
from pathlib import Path

from packaging.package_common import (
    CACHE_ROOT,
    EXPORT_ROOT,
    TOOLS_ROOT,
    audit_export_tree,
    copy_export_tree,
    download,
    extract_archive,
    find_file,
    host_key,
    make_executable,
    safe_version,
    version_text,
)


GRADLE_VERSION = "8.10.2"
ANDROID_TOOLS_REVISION = "15859902"
ANDROID_API = "35"


def ensure_java() -> Path:
    existing = shutil.which("java")
    if existing:
        try:
            result = subprocess.run([existing, "-version"], capture_output=True, text=True)
            match = re.search(r'version "(\d+)', result.stderr + result.stdout)
            if match and int(match.group(1)) >= 17:
                return Path(existing)
        except OSError:
            pass

    host, architecture = host_key()
    if host not in {"windows", "mac", "linux"}:
        raise RuntimeError(f"不支持自动下载 JDK 的平台：{host}")
    adoptium_os = {"windows": "windows", "mac": "mac", "linux": "linux"}[host]
    adoptium_arch = "aarch64" if architecture == "aarch64" else "x64"
    extension = "zip" if host == "windows" else "tar.gz"
    url = f"https://api.adoptium.net/v3/binary/latest/17/ga/{adoptium_os}/{adoptium_arch}/jdk/hotspot/normal/eclipse"
    archive = download(url, CACHE_ROOT / "android" / f"jdk17-{host}-{adoptium_arch}.{extension}")
    root = CACHE_ROOT / "android" / f"jdk17-{host}-{adoptium_arch}"
    if not root.exists():
        extract_archive(archive, root)
    java = find_file(root, ("java.exe", "java"))
    if not java:
        raise RuntimeError("自动下载的 JDK 中没有 java。")
    return java


def java_home(java: Path) -> Path:
    try:
        result = subprocess.run(
            [str(java), "-XshowSettings:properties", "-version"],
            capture_output=True,
            text=True,
            check=False,
        )
        match = re.search(r"^\s*java\.home\s*=\s*(.+?)\s*$", result.stderr + result.stdout, re.M)
        if match:
            return Path(match.group(1))
    except OSError:
        pass
    return java.parent.parent


def ensure_gradle() -> Path:
    existing = shutil.which("gradle")
    if existing:
        return Path(existing)
    filename = f"gradle-{GRADLE_VERSION}-bin.zip"
    archive = download(f"https://services.gradle.org/distributions/{filename}", CACHE_ROOT / "android" / filename)
    root = CACHE_ROOT / "android" / f"gradle-{GRADLE_VERSION}"
    executable = root / "bin" / ("gradle.bat" if os.name == "nt" else "gradle")
    if not executable.exists():
        extract_archive(archive, CACHE_ROOT / "android")
    if not executable.exists():
        raise RuntimeError("自动下载的 Gradle 中没有启动程序。")
    if os.name != "nt":
        make_executable(executable)
    return executable


def ensure_android_sdk(java: Path) -> Path:
    for variable in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
        candidate = os.environ.get(variable)
        if candidate:
            sdk = Path(candidate)
            if (
                (sdk / "platforms" / f"android-{ANDROID_API}").exists()
                and (sdk / "build-tools" / f"{ANDROID_API}.0.0").exists()
            ):
                return sdk

    host, architecture = host_key()
    sdk_host = "win" if host == "windows" else "mac" if host == "mac" else "linux"
    if host == "mac":
        sdk_host += "_arm64" if architecture == "aarch64" else "_x86_64"
    filename = f"commandlinetools-{sdk_host}-{ANDROID_TOOLS_REVISION}_latest.zip"
    url = f"https://dl.google.com/android/repository/{filename}"
    archive = download(url, CACHE_ROOT / "android" / filename)
    sdk_root = CACHE_ROOT / "android" / "sdk"
    sdkmanager_name = "sdkmanager.bat" if os.name == "nt" else "sdkmanager"
    sdkmanager = sdk_root / "cmdline-tools" / "latest" / "bin" / sdkmanager_name
    if not sdkmanager.exists():
        temp = CACHE_ROOT / "android" / "cmdline-tools-extract"
        extract_archive(archive, temp)
        source = temp / "cmdline-tools"
        sdkmanager.parent.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, sdk_root / "cmdline-tools" / "latest", dirs_exist_ok=True)
        shutil.rmtree(temp, ignore_errors=True)
    if os.name != "nt":
        make_executable(sdkmanager)

    detected_java_home = java_home(java)
    env = os.environ.copy()
    env["JAVA_HOME"] = str(detected_java_home)
    env["ANDROID_SDK_ROOT"] = str(sdk_root)
    env["ANDROID_HOME"] = str(sdk_root)
    yes_input = ("y\n" * 50).encode()
    subprocess.run([str(sdkmanager), "--licenses"], input=yes_input, env=env, check=True)
    subprocess.run(
        [str(sdkmanager), f"platforms;android-{ANDROID_API}", f"build-tools;{ANDROID_API}.0.0", "platform-tools"],
        env=env,
        check=True,
    )
    return sdk_root


def prepare_android_project() -> tuple[Path, Path]:
    stage = CACHE_ROOT / "android" / "project-build"
    if stage.exists():
        shutil.rmtree(stage)
    shutil.copytree(TOOLS_ROOT / "packaging/android", stage)
    web_root = stage / "app" / "src" / "main" / "assets" / "web"
    copy_export_tree(web_root, create_data=False)
    bridge = web_root / "assets" / "ato-android-fetch-bridge.js"
    bridge.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(TOOLS_ROOT / "packaging/android/fetch-bridge.js", bridge)

    for html in web_root.rglob("*.html"):
        source = html.read_text(encoding="utf-8", errors="replace")
        if "ato-android-fetch-bridge.js" in source or not re.search(r"<head[^>]*>", source, re.I):
            continue
        relative = os.path.relpath(bridge, html.parent).replace(os.sep, "/")
        source = re.sub(r"(<head[^>]*>)", rf'\1\n  <script src="{relative}"></script>', source, count=1, flags=re.I)
        html.write_text(source, encoding="utf-8")
    audit_export_tree(web_root)
    return stage, web_root


def main() -> int:
    parser = argparse.ArgumentParser(description="导出可安装 Android APK；缺少 JDK、Gradle 或 Android SDK 时自动下载（运行即表示接受相应许可）。")
    parser.add_argument("--version", default="local", help="APK 版本与文件名")
    args = parser.parse_args()
    version = safe_version(version_text(args.version))
    EXPORT_ROOT.mkdir(exist_ok=True)

    print("检查 Android 构建工具 …")
    java = ensure_java()
    gradle = ensure_gradle()
    sdk_root = ensure_android_sdk(java)
    stage, _ = prepare_android_project()

    digits = "".join(character for character in version if character.isdigit())
    version_code = min(int(digits or "1"), 2_100_000_000)
    detected_java_home = java_home(java)
    env = os.environ.copy()
    env.update({"JAVA_HOME": str(detected_java_home), "ANDROID_SDK_ROOT": str(sdk_root), "ANDROID_HOME": str(sdk_root)})
    print("构建 APK …")
    subprocess.run(
        [str(gradle), "--no-daemon", "assembleRelease", f"-PatoVersionName={version}", f"-PatoVersionCode={version_code}"],
        cwd=stage,
        env=env,
        check=True,
    )
    built = stage / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"
    if not built.exists():
        raise RuntimeError("Gradle 未生成 app-release.apk。")
    output = EXPORT_ROOT / f"ATO-Assistant-{version}.apk"
    shutil.copy2(built, output)
    shutil.rmtree(stage)
    print(f"导出完成：{output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
