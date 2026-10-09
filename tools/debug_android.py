"""Local Android emulator and debug APK commands (no Android Studio required)."""
from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import getproxies

from export_android import ensure_android_sdk, ensure_gradle, ensure_java, java_home, prepare_android_project
from packaging.package_common import CACHE_ROOT, PROJECT_ROOT
from android_debug_adb import LocalAdb

CACHE = CACHE_ROOT / "android"
SDK = CACHE / "sdk"
AVD = "ato-debug-api35"
IMAGE = "system-images;android-35;google_apis;x86_64"
APK = CACHE / "project-build/app/build/outputs/apk/debug/app-debug.apk"


def environment() -> tuple[list[str], list[str]]:
    os.environ["JAVA_HOME"] = str(java_home(ensure_java()))
    for name in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        os.environ[name] = str(SDK)
    os.environ["ANDROID_USER_HOME"] = str(CACHE / "debug-user")
    os.environ["ANDROID_AVD_HOME"] = str(CACHE / "avd")
    os.environ["GRADLE_USER_HOME"] = str(CACHE / "gradle-user")
    for name in ("ANDROID_USER_HOME", "ANDROID_AVD_HOME", "GRADLE_USER_HOME"):
        Path(os.environ[name]).mkdir(parents=True, exist_ok=True)
    proxy = urlsplit(getproxies().get("https", ""))
    if proxy.hostname and proxy.port:
        sdk_args = ["--proxy=http", f"--proxy_host={proxy.hostname}", f"--proxy_port={proxy.port}"]
        gradle_args = [f"-D{scheme}.proxy{key}={value}" for scheme in ("http", "https")
                       for key, value in (("Host", proxy.hostname), ("Port", proxy.port))]
        return sdk_args, gradle_args
    return [], []


def sdk_tool(name: str) -> str:
    return str(SDK / "cmdline-tools/latest/bin" / (name + (".bat" if os.name == "nt" else "")))


def adb() -> LocalAdb:
    executable = SDK / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb")
    # Always target this emulator, never a user's connected physical phone.
    client = LocalAdb(executable)
    if client.shell("getprop ro.boot.qemu.avd_name").strip() != AVD:
        raise RuntimeError("Port 5554 belongs to another emulator; refusing to modify it")
    return client


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["setup", "build", "start", "install", "status", "logs", "stop"])
    parser.add_argument("--headless", action="store_true", help="Run emulator without a window")
    options = parser.parse_args()
    sdk_args, gradle_args = environment()
    if options.action == "setup":
        ensure_android_sdk(Path(os.environ["JAVA_HOME"]) / "bin" / ("java.exe" if os.name == "nt" else "java"), tuple(sdk_args))
        subprocess.run([sdk_tool("sdkmanager"), f"--sdk_root={SDK}", *sdk_args, "emulator", IMAGE], check=True)
        if not (CACHE / "avd" / (AVD + ".ini")).exists():
            subprocess.run([sdk_tool("avdmanager"), "create", "avd", "-n", AVD, "-k", IMAGE,
                            "-d", "pixel_6"], input="no\n", text=True, check=True)
        subprocess.run([str(SDK / "emulator/emulator.exe"), "-accel-check"], check=False)
    elif options.action == "build":
        stage_path = (CACHE / "project-build").resolve()
        if not stage_path.is_relative_to(PROJECT_ROOT.resolve()):
            raise RuntimeError("Debug build staging must remain inside this workspace")
        stage, _ = prepare_android_project("android-debug")
        subprocess.run([str(ensure_gradle()), "--no-daemon", "--console=plain", *gradle_args,
                        "assembleDebug"], cwd=stage, check=True)
        print(APK)
    elif options.action == "start":
        args = [str(SDK / "emulator/emulator.exe"), "-avd", AVD, "-port", "5554",
                "-no-snapshot", "-no-boot-anim", "-gpu", "software", "-memory", "4096"]
        if options.headless:
            args += ["-no-window", "-no-audio"]
        with (CACHE / "emulator.log").open("ab") as log:
            process = subprocess.Popen(args, stdout=log, stderr=log,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        print(f"Emulator started (PID {process.pid}); log: {CACHE / 'emulator.log'}")
    elif options.action == "install":
        if not APK.is_file():
            raise RuntimeError("Run build first")
        client = adb()
        print(client.install(APK))
        print(client.shell("am start -n com.ato.assistant/.MainActivity"))
    elif options.action == "status":
        print(adb().shell("getprop sys.boot_completed").strip())
    elif options.action == "logs":
        print(adb().shell("logcat -d -s chromium AndroidRuntime"))
    elif options.action == "stop":
        print(adb().execute("emu:kill").decode("utf-8", errors="replace"))


if __name__ == "__main__":
    main()
