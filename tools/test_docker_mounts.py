"""Docker / NAS 部署的挂载不变量。

运行：python tools/test_docker_mounts.py

背景：公开镜像里只有程序，官方素材由使用者自备，所以 compose 必须挂一批宿主机目录。
挂载是"整棵盖住"的 —— 挂载点一旦落在镜像自带的程序文件上，那些文件在容器里就永远是
宿主机那份，`docker compose pull` 再也更新不到它们。第二屏就是这么坏过：整棵挂
`./app/ss` 把 ss/app.js 一起遮住，主控台更新了、第二屏还是旧前端。

这里不引用第三方 YAML 库，直接按缩进解析 compose.yaml 的 volumes 段，检查：
  1. 没有任何挂载点等于/覆盖镜像自带的程序文件（ss/ 与 assets/bgm/）；
  2. 第二屏素材、BGM 音频目录仍然挂进来了，且 BGM 挂载点与 manifest.audioDir 一致；
  3. 单文件挂载带 bind.create_host_path: false，且安装脚本/导出脚本会先放占位文件；
  4. pull_policy 不是 missing（镜像标签 latest 会移动）。
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "tools/packaging/docker/compose.yaml"
INSTALL_SCRIPT = ROOT / "tools/install-docker.sh"
EXPORTER = ROOT / "tools/export_portable.py"
MANIFEST = ROOT / "assets/bgm/manifest.js"

# 镜像自带的程序文件：任何一个的容器路径被挂载点遮住，pull 就更新不到它。
# （只列会被挂载的树；其它目录根本没挂，不受影响。）
IMAGE_PROGRAM_FILES = (
    "ss/index.html",
    "ss/app.js",
    "ss/styles.css",
    "ss/terrain-data.js",
    "assets/bgm/bgm.js",
    "assets/bgm/manifest.js",
    "assets/bgm/README.md",
)

# 必须挂在宿主机上的本地素材（镜像里没有，不挂就永远是空的）
REQUIRED_TARGETS = (
    "/app/ss/battle-board.jpg",
    "/app/ss/terrain",
    "/app/ss/terrain-cards",
    "/app/assets/bgm/audio",
)

ENTRY_RE = re.compile(r"^(\s*)-\s+(.*)$")


def parse_volumes(text: str) -> list[dict[str, object]]:
    """把 compose.yaml 的 volumes 段解成 [{source, target, lines}]（短语法与长语法都认）。"""
    lines = text.splitlines()
    start = None
    indent = 0
    for index, line in enumerate(lines):
        match = re.match(r"^(\s*)volumes:\s*$", line)
        if match:
            indent = len(match.group(1))
            start = index
            break
    if start is None:
        return []

    entries: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    for line in lines[start + 1:]:
        # 缩进回到 volumes 同级或更浅 = 这段结束了
        if line.strip() and (len(line) - len(line.lstrip())) <= indent:
            break
        entry = ENTRY_RE.match(line)
        if entry:
            inline = entry.group(2).strip()
            current = {"source": "", "target": "", "lines": [line]}
            entries.append(current)
            if ":" in inline and not inline.startswith("type:"):
                parts = inline.split(":")
                current["source"] = parts[0].strip()
                current["target"] = parts[1].strip()
            continue
        if current is None:
            continue
        current["lines"].append(line)  # type: ignore[union-attr]
        key = line.strip()
        if key.startswith("source:"):
            current["source"] = key.split(":", 1)[1].strip()
        elif key.startswith("target:"):
            current["target"] = key.split(":", 1)[1].strip()
    return entries


def covers(target: str, container_path: str) -> bool:
    """挂载点是否等于或覆盖某个容器内路径（整目录挂载会覆盖里面的所有文件）。"""
    normalized = target.rstrip("/") or "/"
    return normalized == container_path or container_path.startswith(normalized + "/")


def main() -> int:
    compose = COMPOSE.read_text(encoding="utf-8")
    install_script = INSTALL_SCRIPT.read_text(encoding="utf-8")
    exporter = EXPORTER.read_text(encoding="utf-8")
    manifest = MANIFEST.read_text(encoding="utf-8")
    entries = parse_volumes(compose)
    targets = [str(entry["target"]) for entry in entries]
    failures: list[str] = []

    if not entries:
        failures.append("没能从 compose.yaml 解析出任何挂载点（解析器或文件结构变了？）")

    # 1. 程序文件不能被遮住
    for entry in entries:
        target = str(entry["target"])
        if not target.startswith("/app/"):
            continue
        for relative in IMAGE_PROGRAM_FILES:
            if covers(target, "/app/" + relative):
                failures.append(
                    f"挂载点 {target} 遮住了镜像自带的程序文件 {relative}；"
                    "程序文件必须由镜像提供，否则 docker compose pull 更新不到它"
                )

    # 2. 素材仍然挂进来
    for required in REQUIRED_TARGETS:
        if required not in targets:
            failures.append(f"缺少必需的素材挂载点：{required}")

    # 3. BGM 挂载点要和 manifest.audioDir 对上（两边不一致就永远找不到音频）
    audio_match = re.search(r'audioDir:\s*"([^"]*)"', manifest)
    if not audio_match:
        failures.append("assets/bgm/manifest.js 里没有 audioDir 字段")
    else:
        subdir = audio_match.group(1).strip().lstrip("./").rstrip("/")
        expected = f"/app/assets/bgm/{subdir}"
        if expected not in targets:
            failures.append(f"manifest.audioDir 指向 {subdir}/，但 compose 没有挂载 {expected}")

    # 4. 单文件挂载：必须挡掉「文件缺失时 Docker 建同名目录」，且两条安装路径都要先放占位文件
    file_entries = [
        entry for entry in entries
        if Path(str(entry["source"])).suffix  # 带后缀 = 单文件挂载
    ]
    if not file_entries:
        failures.append("compose 里没有单文件挂载？battle-board.jpg 应该在其中")
    for entry in file_entries:
        block = "\n".join(str(line) for line in entry["lines"])
        source = str(entry["source"])
        if "create_host_path: false" not in block:
            failures.append(
                f"{source} 是单文件挂载，需要 bind.create_host_path: false，"
                "否则文件缺失时 Docker 会建一个同名目录顶上去，功能静默失效"
            )
        leaf = Path(source).name
        if leaf not in install_script:
            failures.append(f"tools/install-docker.sh 没有为单文件挂载 {source} 准备占位文件")
        if leaf not in exporter:
            failures.append(f"tools/export_portable.py 的 Docker 包没有为 {source} 准备占位文件")

    # 5. 安装脚本要准备好素材目录，并迁移早期版本平铺在 assets/bgm/ 下的音频
    for required_dir in ("app/assets/bgm/audio", "app/ss/terrain", "app/ss/terrain-cards"):
        if required_dir not in install_script:
            failures.append(f"tools/install-docker.sh 没有创建 {required_dir}")
    if "app/assets/bgm/audio/" not in install_script:
        failures.append("tools/install-docker.sh 没有把平铺的 BGM 音频迁进 audio/")

    # 6. latest 是会移动的标签，pull_policy 必须是 always，pull 才是真的 pull
    policy = re.search(r"^\s*pull_policy:\s*(\S+)\s*$", compose, re.M)
    if not policy or policy.group(1) != "always":
        failures.append("compose.yaml 的 pull_policy 应为 always（镜像标签 latest 会移动）")
    if "latest" not in compose:
        failures.append("compose.yaml 里应保留 ${ATO_VERSION:-latest} 之类可变标签或说明固定版本的方式")

    if failures:
        print("Docker 挂载不变量测试失败：")
        for item in failures:
            print("  " + item)
        return 1

    print(f"Docker 挂载不变量测试通过：检查了 {len(entries)} 个挂载点")
    for entry in entries:
        print(f"  {entry['source']} → {entry['target']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
