"""打包排除规则：bgm 音频不进便携版 / Docker / APK，bgm 代码随包发布。

运行：python tools/test_packaging_exclusions.py

直接在临时目录里搭一棵迷你项目树，调用真实的 copy_export_tree，验证
「自备音频不打包、程序照常打包」这条规则不会被后续重构改坏。
同时确认 aibp/ps 里与卡图同级的程序数据（.js/.json）照常进包：Dockerfile 要靠这份拷贝
在镜像里另存一份原版，供 docker-entrypoint.sh 还原被整棵挂载遮住的程序文件。

另外覆盖本地私有产物（CODE_REVIEW 07）：.gitignore 忽略的 .atopack 资料包、顶层 tmp/
草稿、logs/ 与编辑器/运行时残留既不进包，也必须被 audit_export_tree() 独立挡住；
最后一段是负向验证 —— 把规则临时摘掉，这些文件必须真的进包且被审计报错，否则说明
断言是假保护。

还有两条「受跟踪但一样不该发布」的规则：仓库根目录的 tests/ 开发测试与
docker-compose.nas.yml（.gitignore 不管它们，漏掉就会跟着便携版 ZIP / Docker 镜像 /
APK 一起发出去）；以及反向的启动入口检查 —— router.php 与 assets/campaign-session.js
必须始终进包，因为 Dockerfile 的 CMD 和两个便携启动器都靠它们启动（router.php 少一个，
容器/便携版的私有目录就会重新变成可下载的静态文件）。
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from packaging import package_common as pc  # noqa: E402

# 本地私有产物：被 .gitignore 留在工作目录里，打包必须独立排除（CODE_REVIEW 07）。
# 键名同时用作审计复核与负向验证的夹具清单。
LOCAL_ONLY_FILES = {
    "personal.atopack": "private asset pack",
    "personal.atopack.partial": "half-written private asset pack",
    "tmp/private-note.txt": "private scratch note",
    "logs/session.txt": "local runtime log",
    "Thumbs.db": "windows os scratch",
    "__pycache__/package_common.cpython-312.pyc": "python bytecode cache",
}

# 负向验证：摘掉一条规则后，对应的文件必须真的进包、并被审计报错。
NEGATIVE_RULES = (
    (".atopack", "suffix", "personal.atopack"),
    ("tmp", "top", "tmp/private-note.txt"),
)

# 启动入口：Dockerfile 的 CMD 与两个便携启动器都把 router.php 交给 php -S 当路由脚本，
# 页面又都要走 assets/campaign-session.js。这两个文件必须始终进包 —— 一旦有人把它们
# 加进 BLOCKED_LEAVES 之类的排除清单，容器/便携版会启动不起来，而且 data/、export/、
# logs/ 这些私有目录会重新变成可下载的静态文件（见 router.php 里的说明）。
REQUIRED_ENTRY_FILES = ("router.php", "assets/campaign-session.js")
LAUNCHER_FILES = (
    ROOT / "tools/packaging/docker/Dockerfile",
    ROOT / "tools/packaging/portable/start-ato-portable.bat",
    ROOT / "tools/packaging/portable/start-ato-portable.command",
)


def php_server_commands(text: str) -> list[tuple[str, str]]:
    """抓出每一处 ``php -S`` 的（文档根, 路由脚本）参数。

    Dockerfile 的 CMD 写成 ["php", "-S", ...] 这种 JSON 数组，启动器写成行内命令；
    先把引号/逗号/方括号归一成空格再切词，两种写法的 token 形状就是一样的。
    """
    commands: list[tuple[str, str]] = []
    for line in text.splitlines():
        if "php" not in line.lower():
            continue
        tokens = re.sub(r'["\[\],]', " ", line).split()
        for index, token in enumerate(tokens):
            if token == "-S":
                rest = tokens[index:]
                if "-t" in rest and len(rest) > rest.index("-t") + 2:
                    start = rest.index("-t")
                    commands.append((rest[start + 1], rest[start + 2]))
                break
    return commands


def packaged_relative(document_root: str, script: str) -> str:
    """把启动器里的「文档根 + 脚本」换算成产物树里的相对路径。"""
    root = document_root.replace("\\", "/").rstrip("/")
    target = script.replace("\\", "/")
    if not target.lower().startswith(root.lower() + "/"):
        return ""
    return target[len(root) + 1:]


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
        # aibp/ps 里程序数据（.js/.json）与自备卡图同级：程序数据必须进包，Dockerfile
        # 才有东西可以拷到 /opt/ato/aibp-ps-program 做还原（compose 整棵挂 aibp/ps，
        # 会遮住镜像里的原件）。
        "aibp/ps/CHIMERA_METASTASIOS/bp_status_map.js": "// status\n",
        "aibp/ps/CHIMERA_METASTASIOS/bp_status_map.json": "{}\n",
        "aibp/ps/other/token/token_manifest.js": "// token\n",
        "aibp/ps/other/resouce/bp_resource_map.js": "// resource\n",
        "story/data/storybook-data.js": "// local only\n",
        "tools/export_portable.py": "# tool\n",
        "data/ato-campaign-x.json": "{}",
        # 启动入口与登录守卫：必须随包发布（见 REQUIRED_ENTRY_FILES）。
        "router.php": "<?php\nreturn false;\n",
        "assets/campaign-session.js": "// session guard\n",
        # 受跟踪、但同样不该随包发布的开发/部署文件。
        "tests/test_lan_account_guard.py": "# dev test\n",
        "tests/test_previous_day_restore.py": "# dev test\n",
        "docker-compose.nas.yml": "services: {}\n",
    }
    for relative, content in (files | LOCAL_ONLY_FILES).items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def audit_error(root: Path) -> str | None:
    """返回 audit_export_tree 的报错信息；返回 None 表示审计放过了这棵树。"""
    try:
        pc.audit_export_tree(root)
    except RuntimeError as error:
        return str(error)
    return None


def force_into(package: Path, scratch: Path, relative: str, index: int) -> str | None:
    """复制一份产物树，把违禁文件硬塞进去，再看审计是否报错。"""
    forced = scratch / "forced" / str(index)
    shutil.copytree(package, forced)
    target = forced / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("forced\n", encoding="utf-8")
    return audit_error(forced)


def negative_control(source: Path, scratch: Path) -> list[str]:
    """摘掉排除规则重新打包：文件必须进包，且审计必须报错。

    这是对上面那些断言的负向验证 —— 如果夹具文件没建出来、或者断言看的不是这条规则，
    这里就会失败，测试不至于变成假保护。
    """
    failures: list[str] = []
    for index, (label, kind, forbidden) in enumerate(NEGATIVE_RULES):
        saved_suffixes, saved_top = pc.BLOCKED_SUFFIXES, pc.BLOCKED_TOP
        try:
            if kind == "suffix":
                pc.BLOCKED_SUFFIXES = tuple(item for item in saved_suffixes if item != label)
            else:
                pc.BLOCKED_TOP = saved_top - {label}
            original_root = pc.PROJECT_ROOT
            pc.PROJECT_ROOT = source
            destination = scratch / "negative" / str(index)
            try:
                pc.copy_export_tree(destination, create_data=False)
                leaked = (destination / forbidden).is_file()
                audit = audit_error(destination)
            finally:
                pc.PROJECT_ROOT = original_root
        finally:
            pc.BLOCKED_SUFFIXES, pc.BLOCKED_TOP = saved_suffixes, saved_top
        if not leaked:
            failures.append(f"负向验证失败：摘掉 {label} 规则后 {forbidden} 仍未进包，断言没有守住这条规则")
        if audit is None:
            failures.append(f"负向验证失败：{forbidden} 绕过排除规则进入产物后，audit_export_tree 没有报错")
    return failures


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

        # 干净产物必须过审计（防止把审计写成一律报错）。
        clean_audit = audit_error(destination)

        # 审计独立复核：违禁文件被强行塞进产物树时，审计必须报错。
        forced_audits = {
            relative: force_into(destination, scratch, relative, index)
            for index, relative in enumerate(LOCAL_ONLY_FILES)
        }

        negative_failures = negative_control(source, scratch)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)

    failures: list[str] = []

    for expected in ("assets/bgm/bgm.js", "assets/bgm/manifest.js", "assets/bgm/README.md", "index.html"):
        if expected not in packaged:
            failures.append(f"应进包但缺失：{expected}")

    # aibp/ps 的程序数据必须进包：compose 把整棵 ps 挂进容器遮住镜像原件，
    # 还原用的原版只可能来自打包进镜像的这份拷贝（少一个文件，容器里那个脚本就缺失）。
    for expected in (
        "aibp/ps/CHIMERA_METASTASIOS/bp_status_map.js",
        "aibp/ps/CHIMERA_METASTASIOS/bp_status_map.json",
        "aibp/ps/other/token/token_manifest.js",
        "aibp/ps/other/resouce/bp_resource_map.js",
    ):
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

    # 仓库根目录的开发测试与 NAS 部署脚本是受跟踪文件：.gitignore 管不到它们，
    # 只能靠 BLOCKED_TOP / BLOCKED_LEAVES 挡住，漏一条就跟着整包发布出去
    # （tests/ 里还有使用者的账号与存档回归用例）。同时直接问一遍规则本身，
    # 免得断言只看结果、规则被改坏却恰好因为别的原因没进包。
    for forbidden in ("tests/test_lan_account_guard.py", "tests/test_previous_day_restore.py",
                      "docker-compose.nas.yml"):
        if forbidden in packaged:
            failures.append(f"不应进包：{forbidden}")
        if not pc.excluded(Path(forbidden)):
            failures.append(f"排除规则没有挡住：{forbidden}")

    # 启动入口必须进包：漏掉 router.php，容器与便携版启动就没了私有目录拦截，
    # data/（账号哈希、完整存档、session）、export/、logs/ 全部变成可下载的静态文件。
    for expected in REQUIRED_ENTRY_FILES:
        if expected not in packaged:
            failures.append(f"应进包但缺失：{expected}（启动入口，少一个容器/便携版就起不来或私有目录外泄）")
        if pc.excluded(Path(expected)):
            failures.append(f"排除规则误伤了启动入口：{expected}")

    # 启动参数与产物对齐：Dockerfile 的 CMD 和两个便携启动器传给 php -S 的路由脚本
    # 必须真的在包里的同一位置，别的写法（换了路径、改名、被排除）都会在这里失败。
    launcher_commands: list[tuple[str, str]] = []
    for launcher in LAUNCHER_FILES:
        if not launcher.is_file():
            failures.append(f"启动器/构建文件缺失：{launcher}")
            continue
        found = php_server_commands(launcher.read_text(encoding="utf-8"))
        if not found:
            failures.append(f"没能从 {launcher.name} 解析出 php -S 的文档根与路由脚本（解析器或写法变了？）")
        launcher_commands.extend(found)
    if len(launcher_commands) != len(LAUNCHER_FILES):
        failures.append(
            f"php -S 启动点数量是 {len(launcher_commands)}，期望 {len(LAUNCHER_FILES)}："
            "启动器里少了一处、或多了一层包装，路由脚本就不能保证进包"
        )
    for document_root, script in launcher_commands:
        relative = packaged_relative(document_root, script)
        if not relative or relative not in packaged:
            failures.append(
                f"启动参数 {document_root} + {script} 在产物里找不到（换算成 {relative or '???'}）："
                "容器/便携版会启动失败，私有目录也会重新可下载"
            )

    # 本地私有产物：资料包、临时草稿一律不进包，并由审计独立复核。
    for forbidden in LOCAL_ONLY_FILES:
        if forbidden in packaged:
            failures.append(f"不应进包：{forbidden}")

    if clean_audit is not None:
        failures.append(f"干净产物被审计误判：{clean_audit}")
    for relative, error in forced_audits.items():
        if error is None:
            failures.append(f"审计没有挡住强行塞入产物的：{relative}")
    failures.extend(negative_failures)

    if failures:
        print("打包排除规则测试失败：")
        for item in failures:
            print("  " + item)
        return 1

    print(f"打包排除规则测试通过：包内文件 {packaged}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
