"""发布规则：release 只挂安装包、不发布校验和文件，并且使用仓库里的更新公告。

运行：python tools/test_release_assets.py

Android release 曾经额外生成并上传 `ATO-Assistant-<版本>.apk.sha256`，同时
作为 workflow artifact 归档。这条规则要求以后任何一次发布都不再出现哈希
文件；同时要求两个发布脚本优先读取 `release-notes/<标签>.md` 作为更新公告
（应用内「检查更新」展示的就是 Release 正文），没有公告文件时才退回 GitHub
自动生成的提交列表。这里直接对发布脚本和 workflow 做静态断言。
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ANDROID_SCRIPT = ROOT / "tools" / "release_android.ps1"
PORTABLE_SCRIPT = ROOT / "tools" / "release_portable.ps1"
ANDROID_WORKFLOW = ROOT / ".github" / "workflows" / "android-release.yml"

HASH_PATTERN = re.compile(r"sha-?256|get-filehash|\$checksum|\$hash\b", re.IGNORECASE)
UPLOAD_CALL = re.compile(r"['\"]release['\"][,\s]+['\"]upload['\"]")
CREATE_CALL = re.compile(r"['\"]release['\"][,\s]+['\"]create['\"]")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check_no_hash_sidecar(failures: list[str], path: Path, text: str) -> None:
    for number, line in enumerate(text.splitlines(), start=1):
        if HASH_PATTERN.search(line):
            failures.append(f"{path.name}:{number} 仍然出现哈希/校验和：{line.strip()}")


def check_gh_asset_arguments(failures: list[str], text: str) -> None:
    """`gh release upload/create` 的资产参数只能是构建产物本身。"""
    upload_calls = 0
    create_calls = 0
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if UPLOAD_CALL.search(stripped):
            upload_calls += 1
            if "$apk" not in stripped:
                failures.append(f"release_android.ps1:{number} 上传行未包含 $apk：{stripped}")
            if "--clobber" not in stripped:
                failures.append(f"release_android.ps1:{number} 上传行缺少 --clobber：{stripped}")
        if CREATE_CALL.search(stripped):
            create_calls += 1
            if "$apk" not in stripped:
                failures.append(f"release_android.ps1:{number} 创建行未包含 $apk：{stripped}")
        if "release" in stripped and "$checksum" in stripped:
            failures.append(f"release_android.ps1:{number} 上传参数仍带 $checksum：{stripped}")
    if upload_calls < 2:
        failures.append(f"未能识别到两处 gh release upload 调用（实际 {upload_calls} 处），请同步更新本测试")
    if create_calls < 1:
        failures.append("未能识别到 gh release create 调用，请同步更新本测试")


def check_workflow_artifact_paths(failures: list[str], text: str) -> None:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if "upload-artifact" not in line:
            continue
        block = lines[index : index + 12]
        paths = [item.strip() for item in block if item.strip().startswith("export/")]
        if not paths:
            failures.append("android-release.yml: 未找到 upload-artifact 的 export/ 路径列表")
        for path in paths:
            if not path.endswith(".apk"):
                failures.append(f"android-release.yml: artifact 路径不是 APK：{path}")


def check_notes_wiring(failures: list[str]) -> None:
    """两个发布脚本都要优先使用仓库里的更新公告。"""
    for path, label in ((ANDROID_SCRIPT, "release_android.ps1"), (PORTABLE_SCRIPT, "release_portable.ps1")):
        text = read(path)
        if "release-notes" not in text or "$releaseTag.md" not in text:
            failures.append(f"{label} 未按 release-notes/<标签>.md 查找更新公告")
        if "--notes-file" not in text:
            failures.append(f"{label} 未使用 --notes-file 发布更新公告")
        if "--generate-notes" not in text:
            failures.append(f"{label} 缺少 --generate-notes 兜底路径")
        if "'release' 'edit'" not in text:
            failures.append(f"{label} 在 Release 已存在时不会刷新公告正文")


def check_release_notes_files(failures: list[str]) -> None:
    """每份公告都要按 v<版本>.md 命名，并保留 更新 / 下载 / 验证 三段。"""
    notes_dir = ROOT / "release-notes"
    if not notes_dir.is_dir():
        failures.append("缺少 release-notes/ 目录")
        return
    files = sorted(notes_dir.glob("*.md"))
    if not files:
        failures.append("release-notes/ 里没有任何更新公告")
        return
    for path in files:
        if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z.-]+)?\.md", path.name):
            failures.append(f"公告文件名不符合 v<版本>.md：{path.name}")
            continue
        text = read(path)
        for section in ("## 更新", "## 下载", "## 验证"):
            if section not in text:
                failures.append(f"{path.name} 缺少段落 {section}")


def main() -> int:
    failures: list[str] = []
    for path in (ANDROID_SCRIPT, PORTABLE_SCRIPT, ANDROID_WORKFLOW):
        if not path.is_file():
            failures.append(f"缺少文件：{path.relative_to(ROOT).as_posix()}")

    if failures:
        print("发布资产规则测试失败：")
        for item in failures:
            print("  " + item)
        return 1

    android = read(ANDROID_SCRIPT)
    portable = read(PORTABLE_SCRIPT)
    workflow = read(ANDROID_WORKFLOW)

    check_no_hash_sidecar(failures, ANDROID_SCRIPT, android)
    check_no_hash_sidecar(failures, PORTABLE_SCRIPT, portable)
    check_gh_asset_arguments(failures, android)
    check_workflow_artifact_paths(failures, workflow)
    check_notes_wiring(failures)
    check_release_notes_files(failures)

    # 文档层面也不应再把校验和文件描述成发布产物。
    for doc in (ROOT / "tools" / "packaging" / "README.md", ROOT / "README.md"):
        if doc.is_file() and "SHA-256 file" in read(doc):
            failures.append(f"{doc.name} 仍把 SHA-256 文件写成发布产物")

    if failures:
        print("发布资产规则测试失败：")
        for item in failures:
            print("  " + item)
        return 1

    print("发布资产规则测试通过：release 只发布安装包，更新公告取自 release-notes/<标签>.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
