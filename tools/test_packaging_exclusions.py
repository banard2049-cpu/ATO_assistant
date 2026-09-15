"""打包排除规则：bgm 音频不进便携版 / Docker / APK，bgm 代码随包发布。

运行：python tools/test_packaging_exclusions.py

直接在临时目录里搭一棵迷你项目树，调用真实的 copy_export_tree，验证
「自备音频不打包、程序照常打包」这条规则不会被后续重构改坏。
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from packaging import package_common as pc  # noqa: E402


def build_project(root: Path) -> None:
    files = {
        "index.html": "<html></html>",
        "assets/bgm/bgm.js": "// player\n",
        "assets/bgm/manifest.js": "// manifest\n",
        "assets/bgm/README.md": "# bgm\n",
        "assets/bgm/LB_Armory.mp3": "audio",
        "assets/bgm/LB_Armory.ogg": "audio",
        "assets/bgm/LB_Armory.m4a": "audio",
        "bgm/LB_Armory.mp3": "legacy audio",
        "map/images/tile.png": "image",
        "story/data/storybook-data.js": "// local only\n",
        "tools/export_portable.py": "# tool\n",
        "data/ato-campaign-x.json": "{}",
    }
    for relative, content in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def main() -> int:
    # 用仓库内的临时目录（tools/.packaging-cache 已被 .gitignore 覆盖）。
    # 这里刻意不用 tempfile.mkdtemp：它以 0700 建目录，在部分受限沙箱里
    # 之后连自己都读不了，会让测试假失败。
    scratch = ROOT / "tools" / ".packaging-cache" / "packaging-test"
    source = scratch / "project"
    destination = scratch / "package"
    shutil.rmtree(scratch, ignore_errors=True)
    try:
        build_project(source)

        original_root = pc.PROJECT_ROOT
        pc.PROJECT_ROOT = source
        try:
            pc.copy_export_tree(destination, create_data=False)
        finally:
            pc.PROJECT_ROOT = original_root

        packaged = sorted(path.relative_to(destination).as_posix() for path in destination.rglob("*") if path.is_file())
    finally:
        shutil.rmtree(scratch, ignore_errors=True)

    failures: list[str] = []

    for expected in ("assets/bgm/bgm.js", "assets/bgm/manifest.js", "assets/bgm/README.md", "index.html"):
        if expected not in packaged:
            failures.append(f"应进包但缺失：{expected}")

    for forbidden in (
        "assets/bgm/LB_Armory.mp3", "assets/bgm/LB_Armory.ogg", "assets/bgm/LB_Armory.m4a",
        "bgm/LB_Armory.mp3",
    ):
        if forbidden in packaged:
            failures.append(f"不应进包：{forbidden}")

    for forbidden in ("tools/export_portable.py", "data/ato-campaign-x.json", "story/data/storybook-data.js"):
        if forbidden in packaged:
            failures.append(f"不应进包：{forbidden}")

    if failures:
        print("打包排除规则测试失败：")
        for item in failures:
            print("  " + item)
        return 1

    print(f"打包排除规则测试通过：包内文件 {packaged}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
