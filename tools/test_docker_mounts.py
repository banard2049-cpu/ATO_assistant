"""Docker / NAS 部署的挂载不变量。

运行：python tools/test_docker_mounts.py

背景：公开镜像里只有程序，官方素材由使用者自备，所以 compose 必须挂一批宿主机目录。
挂载是"整棵盖住"的 —— 挂载点一旦落在镜像自带的程序文件上，那些文件在容器里就永远是
宿主机那份，`docker compose pull` 再也更新不到它们。第二屏就是这么坏过：整棵挂
`./app/ss` 把 ss/app.js 一起遮住，主控台更新了、第二屏还是旧前端。
aibp/ps 属于另一种情况：它必须整棵挂（那是使用者投放卡图的位置，图片和程序数据同级），
所以 ps/ 里的程序文件改由「镜像内另存原版 + 启动时还原」来保证，见检查 6。

这里不引用第三方 YAML 库，直接按缩进解析 compose.yaml 的 volumes 段，检查：
  1. 没有任何挂载点等于/覆盖镜像自带、又不带还原兜底的程序文件（ss/、assets/bgm/），
     且 aibp/ps 下的程序数据（.js/.json）全部登记在案；
  2. 第二屏素材、BGM 音频目录、整棵 aibp/ps 仍然挂进来了（图片与程序数据同级的
     ps 子目录必须一起带进容器），且 BGM 挂载点与 manifest.audioDir 一致；
  3. 单文件挂载带 bind.create_host_path: false，且安装脚本/导出脚本会先放占位文件；
  4. pull_policy 不是 missing（镜像标签 latest 会移动）；
  5. 安装脚本 mkdir 出来的目录与 compose 挂载点一一对应，且 compose.legacy.yaml 的挂载目标
      与 compose.yaml 完全一致（老 docker-compose v1 的用户走的是前者）；
  6. aibp/ps 被整棵挂载后，ps/ 下的程序文件必须靠「镜像里另存一份原版 + 启动时还原」
     兜底（代码里的 1c）：Dockerfile 把 app/aibp/ps/ 拷到 /opt/ato/aibp-ps-program，
     docker-entrypoint.sh 启动时把缺失或被旧宿主机副本盖住的程序文件写回
     /app/aibp/ps。少了任何一半，新装或升级后这些脚本就会缺版本；
  7. 仓库根目录的两份 compose（Apache/NAS 部署）只挂应用真正要访问的路径 + data 卷：
     整棵挂 ./ 等于把打包器判定为私有的东西（export/** 里的 *.atopack 资料包、tools/、
     asset-studio/、release*/、tests/、tmp/、logs/、.git/）全部发布到 11451 端口上供人
     下载。这里既要求「没有整棵挂载、没挂私有树」，也要求「应用需要的路径一条不少」——
     只查前者会有人把 Web 根挂空，只查后者会有人悄悄收回整棵挂载；7b 再从页面里
      实际引用的静态资源反推一遍必须挂载的根级条目 —— 手写清单漏登记一条不会报错，
      cycle-symbols.js 就是这样在五个页面里静默 404 的；
  8. 多架构发布：公开镜像必须同时覆盖 linux/amd64 与 linux/arm/v7（树莓派 4 上 32 位
     Raspberry Pi OS 的架构），且 CI 要注册 QEMU —— 少了 platforms 或少了 QEMU，
     arm/v7 要么根本不在清单里（使用者 pull 到 no matching manifest），要么构建直接失败。
     这两条只守 CI，不负责别的架构：arm64 之类没有预构建镜像，安装脚本会按源码在本机
     构建，这里同样守住那条兜底路径（缺了它，非 amd64/armv7 的机器只能看到一句
     no matching manifest 就结束）。
"""
from __future__ import annotations

import posixpath
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "tools/packaging/docker/compose.yaml"
LEGACY_COMPOSE = ROOT / "tools/packaging/docker/compose.legacy.yaml"
DOCKERFILE = ROOT / "tools/packaging/docker/Dockerfile"
ENTRYPOINT = ROOT / "tools/packaging/docker/docker-entrypoint.sh"
INSTALL_SCRIPT = ROOT / "tools/install-docker.sh"
EXPORTER = ROOT / "tools/export_portable.py"
MANIFEST = ROOT / "assets/bgm/manifest.js"
DOCKER_WORKFLOW = ROOT / ".github/workflows/docker-package.yml"

sys.path.insert(0, str(ROOT / "tools"))
from packaging import package_common as pc  # noqa: E402  （共用同一份私有目录清单）

# 仓库根目录的 compose：直接用仓库目录当 Apache 的 Web 根，没有 Dockerfile 兜底，
# 所以每一条应用路径都必须显式挂进去。
# 只剩这一份：docker-compose.nas.yml 曾与它逐行重复（唯一差异是服务名/容器名），
# 群晖、威联通与普通 Linux 用同一条 `docker compose up -d` 即可，重复副本已删除。
ROOT_COMPOSES = (ROOT / "docker-compose.yml",)
ROOT_WEB_ROOT = "/var/www/html"
# 应用真正要访问的路径（少一条对应页面/接口就 404）。data 单个列出来：它是可写的
# 持久化目录，不是页面资源。
ROOT_APP_PATHS = (
    "index.html",     # 主控台入口
    "router.php",     # 内置服务器的私有目录拦截脚本（发布包与便携版都靠它启动）
    ".htaccess",      # Apache/NAS 一边的私有目录拒绝规则
    "api",            # 存档 / 账号 API
    "assets",         # 主控台脚本样式、登录守卫、BGM 程序
    "aibp",           # AIBP（ps/ 里的程序数据与使用者卡图同级，必须整棵挂）
    "hero",
    "map",
    "record",
    "ss",             # 第二屏
    "story",
    "technology",
    "data",           # 账号/存档/session/备份（entrypoint 会建目录并 chown）
)
# 宿主机上可能还不存在、由 Docker/entrypoint 建出来的挂载源（别的都必须真在仓库里，
# 否则就是写错了名字 —— 单文件挂载写错时 Docker 还会建一个同名目录顶上）。
ROOT_CREATED_BY_DEPLOYMENT = {"data"}
# Apache 补充配置：让根目录的 .htaccess 在官方 php:apache 镜像里真正生效。
APACHE_CONF = ROOT / "tools/packaging/docker/apache-ato-lan.conf"
APACHE_CONF_TARGET = "/etc/apache2/conf-enabled/zz-ato-lan.conf"

# 镜像自带的程序文件：任何一个的容器路径被挂载点遮住，pull 就更新不到它。
# 这里只放宿主目录根本不挂的树 —— 覆盖到就是硬错误。
NEVER_SHADOWED_FILES = (
    "ss/index.html",
    "ss/app.js",
    "ss/styles.css",
    "ss/terrain-data.js",
    "assets/bgm/bgm.js",
    "assets/bgm/manifest.js",
    "assets/bgm/README.md",
)

# aibp/ps 不一样：整棵挂载是刻意的（宿主机目录既是使用者的卡图投放位置，图片又与程序
# 数据同级），所以 ps/ 里的程序文件必然被挂载点遮住。它们由 entrypoint 从镜像内另存的
# 原版（PRISTINE_PS_DIR）还原回 PS_PROGRAM_DIR —— 见检查 1c。
PS_PROGRAM_DIR = "/app/aibp/ps"
PRISTINE_PS_DIR = "/opt/ato/aibp-ps-program"
RESTORED_PROGRAM_FILES = (
    "aibp/ps/CHIMERA_METASTASIOS/bp_status_map.js",
    "aibp/ps/CHIMERA_METASTASIOS/bp_status_map.json",
    "aibp/ps/other/resouce/bp_resource_map.js",
    "aibp/ps/other/resouce/bp_resource_map_c1_c3.js",
    "aibp/ps/other/resouce/bp_resource_map_c4_c5.js",
    "aibp/ps/other/token/token_manifest.js",
)

# ps/ 下所有程序数据（.js/.json）都要登记在上面两张表里，1b 会按目录实际内容核对。
IMAGE_PROGRAM_FILES = NEVER_SHADOWED_FILES + RESTORED_PROGRAM_FILES

# 图片与程序数据混放的目录：整棵挂载必须把它们一起带进容器。上一版只挂「纯素材」子目录，
# 这几个目录里的卡图就静默消失了，所以这里逐个确认有挂载点覆盖。
MIXED_MEDIA_DIRS = (
    "/app/aibp/ps/CHIMERA_METASTASIOS",
    "/app/aibp/ps/other/token",
    "/app/aibp/ps/other/resouce",
    "/app/aibp/ps/other",
)

# 必须挂在宿主机上的本地素材（镜像里没有，不挂就永远是空的）
REQUIRED_TARGETS = (
    "/app/ss/battle-board.jpg",
    "/app/ss/terrain",
    "/app/ss/terrain-cards",
    "/app/assets/bgm/audio",
    # 五个循环的标记图标：版权素材，公开镜像里没有（CI 从 git 检出构建，这几张 PNG 被
    # .gitignore 挡在外面），只能由宿主机提供。漏掉它不会报错，只是五个页面的循环标题前
    # 少一个图标 —— cycle-symbols.js 会移除加载失败的 <img>，所以看不到裂图。
    "/app/assets/cycle-symbols",
    # ps/ 整棵挂进来：它既是使用者的卡图投放位置，又和程序数据同级，拆开挂会让图消失。
    "/app/aibp/ps",
)

ENTRY_RE = re.compile(r"^(\s*)-\s+(.*)$")
MKDIR_RE = re.compile(r"^\s*mkdir\s+-p\s+(.*)$", re.M)
COPY_RE = re.compile(r"^\s*COPY\s+(\S+)\s+(\S+)\s*$", re.M)
# entrypoint 的还原循环：遍历镜像里的原版程序数据（这句没了，新装就是空目录）
RESTORE_LOOP_RE = re.compile(r"^\s*find\s+" + re.escape(PRISTINE_PS_DIR) + r"\s+-type\s+f\s*\|", re.M)


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


# 页面运行所需的静态资源引用。只认 <script src> 与 <link href>：这两类少了页面就坏，
# 而 <a href> 指向的多半是页面自身或开发用链接（tools/ 不发布，见 map/app.js）。
PAGE_REFERENCE_RE = re.compile(r'<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"', re.I)
# 带协议的绝对 URL、协议相对 URL 与页内锚点都不是仓库内的路径。
EXTERNAL_REFERENCE_RE = re.compile(r"^(?:[a-zA-Z][a-zA-Z0-9+.\-]*:|//|#)")


def app_pages() -> list[Path]:
    """会被发布的页面：根 index.html，加上各应用目录里的 *.html。"""
    pages = [ROOT / "index.html"]
    for app_path in ROOT_APP_PATHS:
        directory = ROOT / app_path
        if directory.is_dir():
            pages.extend(sorted(directory.rglob("*.html")))
    return [page for page in pages if page.is_file()]


def web_root_references() -> dict[str, set[str]]:
    """页面引用的 Web 根一级条目 → 引用它的页面。

    仓库根的 compose 是逐条白名单挂载，而 ROOT_APP_PATHS 也是手写的：清单里少了
    一条，页面在容器里就 404，本地直接打开 index.html 却完全正常。cycle-symbols.js
    正是这样漏掉的 —— 便携版与镜像走打包器的全树复制，照样带着它，只有 compose 那条
    路径缺文件，五个页面的循环图标静默消失。所以这里从引用反推，而不是只信清单。
    """
    references: dict[str, set[str]] = {}
    for page in app_pages():
        relative = page.relative_to(ROOT).as_posix()
        text = page.read_text(encoding="utf-8", errors="replace")
        for match in PAGE_REFERENCE_RE.finditer(text):
            url = match.group(1)
            if EXTERNAL_REFERENCE_RE.match(url):
                continue
            path = url.split("?")[0].split("#")[0]
            if not path:
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(relative), path))
            # 走不出 Web 根的相对引用（../ 越界）与站内绝对路径都不是这次要管的东西。
            if target.startswith(("..", "/")):
                continue
            first = target.split("/")[0]
            if first:
                references.setdefault(first, set()).add(relative)
    return references


def parse_created_dirs(text: str) -> list[str]:
    """安装脚本 mkdir -p 在宿主机建出来的目录（含续行），用来和 compose 的挂载点对齐。"""
    joined = re.sub(r"\\\r?\n", " ", text)
    created: list[str] = []
    for match in MKDIR_RE.finditer(joined):
        for token in match.group(1).split():
            token = token.strip("\"'")
            if token.startswith("app/"):
                created.append(token)
    return created


def main() -> int:
    compose = COMPOSE.read_text(encoding="utf-8")
    dockerfile = DOCKERFILE.read_text(encoding="utf-8")
    entrypoint = ENTRYPOINT.read_text(encoding="utf-8")
    install_script = INSTALL_SCRIPT.read_text(encoding="utf-8")
    exporter = EXPORTER.read_text(encoding="utf-8")
    manifest = MANIFEST.read_text(encoding="utf-8")
    entries = parse_volumes(compose)
    targets = [str(entry["target"]) for entry in entries]
    sources = [str(entry["source"]) for entry in entries]
    failures: list[str] = []

    if not entries:
        failures.append("没能从 compose.yaml 解析出任何挂载点（解析器或文件结构变了？）")

    # 1. 程序文件不能被白遮住：宿主目录根本不挂的那些树，任何挂载点覆盖到都算失败。
    # aibp/ps 不在此列（整棵挂载是刻意的），它由 1c 的还原机制保证。
    for entry in entries:
        target = str(entry["target"])
        if not target.startswith("/app/"):
            continue
        for relative in NEVER_SHADOWED_FILES:
            if covers(target, "/app/" + relative):
                failures.append(
                    f"挂载点 {target} 遮住了镜像自带的程序文件 {relative}；"
                    "程序文件必须由镜像提供，否则 docker compose pull 更新不到它"
                )

    # 1b. ps/ 下所有程序数据（.js/.json）都要登记在上面那张表里：以后往 aibp/ps 新增程序
    # 文件时不用改测试也能守住（素材是图片，不算程序数据）。
    for path in sorted((ROOT / "aibp/ps").rglob("*")):
        if not path.is_file() or path.suffix.lower() not in (".js", ".json"):
            continue
        relative = path.relative_to(ROOT).as_posix()
        if relative not in IMAGE_PROGRAM_FILES:
            failures.append(f"aibp/ps 里的程序文件 {relative} 没有登记进 IMAGE_PROGRAM_FILES")

    # 1c. aibp/ps 整棵挂载：ps/ 里的程序文件必须靠「镜像另存原版 + 启动时还原」兜底。
    # Dockerfile 把 app/aibp/ps/ 拷到 PRISTINE_PS_DIR，entrypoint 再从那里写回
    # PS_PROGRAM_DIR 下缺失或与镜像不同的文件 —— 新装（宿主机是空目录）和旧宿主机留下
    # 旧副本两种情况都不会再遮住程序文件。这是负向兜底：删掉 COPY、删掉还原循环、
    # 还原时不比内容、或改成先删后拷，下面都会失败。
    copy_pairs = [
        (match.group(1).rstrip("/"), match.group(2).rstrip("/"))
        for match in COPY_RE.finditer(dockerfile)
    ]
    if ("app/aibp/ps", PRISTINE_PS_DIR) not in copy_pairs:
        failures.append(
            f"Dockerfile 没有把 aibp/ps 的程序数据拷到 {PRISTINE_PS_DIR}"
            f"（需要 COPY app/aibp/ps/ {PRISTINE_PS_DIR}/）；"
            "整棵挂载 aibp/ps 后，ps/ 下的程序文件只能由这份镜像内的原版还原"
        )
    if not RESTORE_LOOP_RE.search(entrypoint):
        failures.append(
            f"docker-entrypoint.sh 没有遍历 {PRISTINE_PS_DIR} 还原程序文件的循环；"
            "新装时宿主机 app/aibp/ps 是空目录，bp_status_map.js 等脚本在容器里就会缺失"
        )
    if PS_PROGRAM_DIR + "/" not in entrypoint:
        failures.append(
            f"docker-entrypoint.sh 的还原逻辑没有写回 {PS_PROGRAM_DIR}/；"
            "程序文件仍然被宿主机目录遮住，pull 更新不到"
        )
    if "cmp -s" not in entrypoint:
        failures.append(
            "docker-entrypoint.sh 还原前没有用 cmp -s 比较内容；"
            "旧宿主机留下的程序文件副本会一直遮住镜像的新版本"
        )
    if "cp -f" not in entrypoint:
        failures.append("docker-entrypoint.sh 没有用 cp -f 覆盖旧副本，旧宿主机上的程序文件仍然生效")
    # 本地自行 build 时 build context 里可能有使用者自己的图片（发布镜像用 git 检出，
    # 只有受跟踪的程序文件）。原版拷贝必须只剩程序文件，否则还原会把用户替换掉的图片
    # 一次次写回构建时的版本。
    if not re.search(r"find\s+" + re.escape(PRISTINE_PS_DIR) + r"\b[^\n]*-delete", dockerfile):
        failures.append(
            f"Dockerfile 没有清理 {PRISTINE_PS_DIR} 里的非程序文件；"
            "本地 build 会把使用者自己的图片也拷进原版拷贝，之后每次启动都会覆盖回去"
        )
    if re.search(r"\brm\b", entrypoint):
        failures.append("docker-entrypoint.sh 的还原逻辑里出现了 rm：还原只能补文件，绝不能删掉使用者的图片")

    # 2. 素材仍然挂进来；图片与程序数据混放的 ps 子目录必须被整棵挂载带到容器里
    # （只挂「纯素材」子目录的那一版会把使用者放在这些目录里的卡图静默丢掉）。
    for required in REQUIRED_TARGETS:
        if required not in targets:
            failures.append(f"缺少必需的素材挂载点：{required}")
    for mixed in MIXED_MEDIA_DIRS:
        if not any(covers(target, mixed) for target in targets):
            failures.append(
                f"素材目录 {mixed} 没有被任何挂载点覆盖："
                "这个目录里图片与程序数据同级，必须整棵挂载 + 由 entrypoint 还原程序文件，"
                "不挂就等于使用者的卡图不见了"
            )

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

    # 5b. 安装脚本建的目录和 compose 的挂载点必须一一对应：compose 挂的目录要在宿主机
    # 建出来（现在 aibp/ps 是整棵挂载，建的就是 app/aibp/ps 这一个），ps/ 下另外建出来的
    # 子目录也必须真的挂进去 —— 否则又会出现「建了目录却没挂上」的素材黑洞。
    created = parse_created_dirs(install_script)
    if not created:
        failures.append("没能从 tools/install-docker.sh 解析出任何 mkdir 目录（解析器或脚本结构变了？）")
    for entry in entries:
        source = str(entry["source"]).lstrip("./")
        if not source.startswith("app/") or Path(source).suffix:
            continue
        if source not in created:
            failures.append(f"tools/install-docker.sh 没有创建挂载点目录 {source}")
    for created_dir in created:
        if not created_dir.startswith("app/aibp/ps/"):
            continue
        if "./" + created_dir not in sources:
            failures.append(
                f"tools/install-docker.sh 创建了 {created_dir}，但 compose 没有挂载它；"
                "ps/ 的素材目录与挂载点必须一一对应（整棵挂 aibp/ps 时不该再建子目录）"
            )

    # 5c. compose.legacy.yaml（给老 docker-compose v1 用）与 compose.yaml 的挂载目标必须
    #     完全一致：用不了 v2 的那批人走的是前者，README 也承诺两者「artwork paths 相同」。
    #     只查 compose.yaml 的话，新素材目录在一份里加了、另一份漏了，没人会出声
    #     —— 循环图标正是这样漏的：两份 compose 都没有它的挂载点。
    if not LEGACY_COMPOSE.is_file():
        failures.append(f"缺少 {LEGACY_COMPOSE.name}（老 docker-compose v1 的部署文件）")
    else:
        legacy_targets = {
            str(entry["target"]).rstrip("/")
            for entry in parse_volumes(LEGACY_COMPOSE.read_text(encoding="utf-8"))
        }
        modern_targets = {str(entry["target"]).rstrip("/") for entry in entries}
        missing_in_legacy = sorted(modern_targets - legacy_targets)
        extra_in_legacy = sorted(legacy_targets - modern_targets)
        if missing_in_legacy:
            failures.append(
                f"{LEGACY_COMPOSE.name} 缺少这些挂载点：{'、'.join(missing_in_legacy)}"
                "（老 docker-compose v1 的部署里这些素材永远是空的）"
            )
        if extra_in_legacy:
            failures.append(
                f"{LEGACY_COMPOSE.name} 多出这些挂载点：{'、'.join(extra_in_legacy)}"
                "（两份 compose 应当同步）"
            )

    # 6. latest 是会移动的标签，pull_policy 必须是 always，pull 才是真的 pull
    policy = re.search(r"^\s*pull_policy:\s*(\S+)\s*$", compose, re.M)
    if not policy or policy.group(1) != "always":
        failures.append("compose.yaml 的 pull_policy 应为 always（镜像标签 latest 会移动）")
    if "latest" not in compose:
        failures.append("compose.yaml 里应保留 ${ATO_VERSION:-latest} 之类可变标签或说明固定版本的方式")

    # 7. 根目录的 docker-compose.yml（Apache、NAS 部署）：
    #    没有 Dockerfile 兜底，仓库目录就是 Web 根，所以「挂什么就发布什么」。
    #    私有目录清单直接复用 package_common 的那一份（BLOCKED_TOP + 打包器特判的
    #    tools/），以后新增一条私有顶层目录，两边的检查一起跟上。
    #    私有树里的文件挂到 Web 根之外（例如 tools/packaging/docker/ 里的 Apache 补充
    #    配置挂到 /etc/apache2/conf-enabled/）是允许的：那不是发布内容，是容器配置。
    private_top = pc.BLOCKED_TOP | {"tools"}
    # php:8.3-apache 用的是 Debian 默认 apache2.conf，/var/www/ 上是 AllowOverride None，
    # 也就是 .htaccess 会被整个忽略 —— 那样 data/（账号哈希、完整存档、session、备份）
    # 在这个端口上仍然是可下载的静态文件。compose 必须把补充配置挂进
    # conf-enabled，否则「挂了 .htaccess」只是摆设。
    if not APACHE_CONF.is_file():
        failures.append(f"缺少 Apache 补充配置 {APACHE_CONF.relative_to(ROOT)}（.htaccess 会被 AllowOverride None 忽略）")
    else:
        apache_conf = APACHE_CONF.read_text(encoding="utf-8")
        if "AllowOverride All" not in apache_conf or "<Directory " + ROOT_WEB_ROOT not in apache_conf:
            failures.append(
                f"{APACHE_CONF.name} 没有对 {ROOT_WEB_ROOT} 打开 AllowOverride All："
                ".htaccess 仍然不会生效，私有目录照样可下载"
            )
    # 页面实际引用的根级条目：与下面的挂载点核对共用同一份解析结果（见 7b）。
    referenced_entries = web_root_references()
    for compose_path in ROOT_COMPOSES:
        text = compose_path.read_text(encoding="utf-8")
        root_entries = parse_volumes(text)
        root_targets = [str(entry["target"]) for entry in root_entries]
        if not root_entries:
            failures.append(f"没能从 {compose_path.name} 解析出任何挂载点（解析器或文件结构变了？）")
        if APACHE_CONF_TARGET not in root_targets:
            failures.append(
                f"{compose_path.name}：没有把 {APACHE_CONF.name} 挂到 {APACHE_CONF_TARGET}；"
                "php:8.3-apache 的默认 AllowOverride None 会忽略 .htaccess，"
                "data/（账号哈希、完整存档、session、备份）在端口上可被直接下载"
            )
        for entry in root_entries:
            source = str(entry["source"]).replace("\\", "/")
            target = str(entry["target"]).rstrip("/") or "/"
            # 去掉开头的 "./" 与路径里的 "." 段：".", "./", "./." 全都是整棵仓库。
            parts = [part for part in source.split("/") if part not in ("", ".")]
            if not parts:
                failures.append(
                    f"{compose_path.name}：{entry['source']} → {target} 把整个仓库目录挂进了容器，"
                    "export/**、tools/、asset-studio/、release*/、tests/、tmp/、logs/、.git/ "
                    "都会跟着发布到这个端口上"
                )
                continue
            in_web_root = target == ROOT_WEB_ROOT or target.startswith(ROOT_WEB_ROOT + "/")
            if in_web_root and parts[0] in private_top:
                failures.append(
                    f"{compose_path.name}：挂载源 {entry['source']} 是打包器判定为私有的 {parts[0]}/，"
                    f"不能挂进 Web 根（{target}）"
                )
            if target == ROOT_WEB_ROOT:
                failures.append(
                    f"{compose_path.name}：挂载点就是 Web 根 {ROOT_WEB_ROOT}，"
                    "等于把整个仓库目录当网站发布（私有产物可直接下载）"
                )
            elif target.startswith(ROOT_WEB_ROOT + "/"):
                mounted = target[len(ROOT_WEB_ROOT) + 1:].split("/")[0].lower()
                if mounted in private_top:
                    failures.append(
                        f"{compose_path.name}：{entry['source']} 被挂到 {target}，"
                        f"把私有的 {mounted}/ 放进了 Web 根"
                    )
            # 挂载源必须真的在仓库里（data/ 例外：由 Docker/entrypoint 建）。单文件挂载
            # 写错名字时 Docker 会建一个同名目录顶上去，页面静默坏掉。
            leaf = parts[-1]
            if leaf not in ROOT_CREATED_BY_DEPLOYMENT and not (ROOT / Path(*parts)).exists():
                failures.append(
                    f"{compose_path.name}：挂载源 {entry['source']} 在仓库里不存在"
                    "（写错名字；单文件挂载还会被 Docker 建成同名目录顶掉原文件）"
                )
        # 反向检查：应用需要的路径一条都不能少（只查「不许整棵挂」会把 Web 根挂空）。
        for app_path in ROOT_APP_PATHS:
            container_path = f"{ROOT_WEB_ROOT}/{app_path}"
            if not any(covers(target, container_path) for target in root_targets):
                failures.append(
                    f"{compose_path.name}：缺少应用需要的挂载点 {container_path}；"
                    f"少挂 {app_path} 对应页面/接口就 404"
                )

        # 7b. 上面那条只核对清单本身：清单漏登记一条，就没有任何断言会出声。这里从
        #     页面真正引用的静态资源反推必须挂载的根级条目 —— 逐条白名单挂载下漏一条
        #     就是页面 404，而本地直接打开文件完全看不出问题（cycle-symbols.js 的先例：
        #     便携版与镜像走全树复制照样带着它，只有仓库根的 compose 缺这个文件）。
        for reference, pages in sorted(referenced_entries.items()):
            container_path = f"{ROOT_WEB_ROOT}/{reference}"
            if not any(covers(mount_target, container_path) for mount_target in root_targets):
                pages_hint = "、".join(sorted(pages)[:3])
                failures.append(
                    f"{compose_path.name}：页面引用了根级 {reference}（{pages_hint}），"
                    f"但没有挂载点覆盖 {container_path}，容器里这条请求会 404；"
                    "把它放进 assets/ 这类已挂载的目录，或同时补上 ROOT_APP_PATHS 与 volumes"
                )

    # 8. 多架构发布（见模块 docstring 第 8 条）。
    #    8a. CI 必须为 amd64 与 arm/v7 各构建一份：build-push-action 没有 platforms 时
    #        只产出 runner 自己的架构（amd64），arm/v7 使用者 pull 到的是
    #        no matching manifest —— 这正是树莓派 4（32 位 Raspberry Pi OS）遇到的现象。
    #        两个架构必须在同一条 platforms 里：拆成两个 tag 就破坏了「同名 tag 按架构自选」。
    workflow = DOCKER_WORKFLOW.read_text(encoding="utf-8")
    platforms = re.search(r"^\s*platforms:\s*(\S+)\s*$", workflow, re.M)
    if not platforms:
        failures.append(
            f"{DOCKER_WORKFLOW.name} 的 build-push-action 没有 platforms："
            "只会产出 linux/amd64，arm/v7 上 pull 会报 no matching manifest"
        )
    else:
        declared = {item.strip() for item in platforms.group(1).split(",")}
        for required_platform in ("linux/amd64", "linux/arm/v7"):
            if required_platform not in declared:
                failures.append(
                    f"{DOCKER_WORKFLOW.name} 的 platforms 里没有 {required_platform}"
                    f"（当前：{platforms.group(1)}）"
                )
    if "docker/setup-qemu-action" not in workflow:
        failures.append(
            f"{DOCKER_WORKFLOW.name} 没有注册 QEMU："
            "arm/v7 是在 x86 runner 上跨架构构建的，缺了它 RUN 步骤会直接失败"
        )
    # 光有 QEMU 不够：多平台输出需要 docker-container driver，而 runner 默认的
    # docker driver 只支持单平台，实测会报
    # "Multi-platform build is not supported for the docker driver"。
    # setup-buildx-action 必须在 build-push-action 之前（它创建的 builder 会被后者选用）。
    if "docker/setup-buildx-action" not in workflow:
        failures.append(
            f"{DOCKER_WORKFLOW.name} 没有 setup-buildx-action："
            "默认的 docker driver 不支持多平台构建，arm/v7 那一份永远出不来"
        )
    elif workflow.index("docker/setup-buildx-action") > workflow.index("docker/build-push-action"):
        failures.append(
            f"{DOCKER_WORKFLOW.name} 的 setup-buildx-action 排在 build-push-action 之后："
            "builder 必须在构建之前创建，否则多平台构建仍然走默认 driver"
        )
    # 8b. 拉不到预构建镜像时必须能退回本机构建，否则 arm64 之类的机器只得到
    #     no matching manifest。构建上下文就是发布镜像用的那份 Dockerfile。
    if "build_local_image()" not in install_script:
        failures.append(
            "tools/install-docker.sh 没有「没有匹配本机架构的镜像就按源码本机构建」的分支："
            "arm64 等架构上安装只会停在 no matching manifest"
        )
    if "[ ! -f \"$context/Dockerfile\" ]" not in install_script:
        failures.append("tools/install-docker.sh 的本地构建没有检查构建上下文里的 Dockerfile")
    if "tools/packaging/docker" not in install_script:
        failures.append("tools/install-docker.sh 的本地构建没有取 tools/packaging/docker 作为构建上下文")
    if "build_local_image \"$(fetch_version)\"" not in install_script:
        failures.append("tools/install-docker.sh 拉取失败后没有调用本地构建")
    # 本地构建的镜像不在任何 registry 里：compose 必须改成 never，image 必须能被覆盖，
    # 且改写后要自检 —— 两行里任何一行的格式一变，改写就会静默失效。
    if "pull_policy: never" not in install_script:
        failures.append("tools/install-docker.sh 没有把 compose 的 pull_policy 改成 never（本地镜像没有 registry）")
    if "${ATO_IMAGE:-" not in install_script:
        failures.append("tools/install-docker.sh 改写的 image 行没有走 ${ATO_IMAGE:-...} 覆盖")
    if "ATO_IMAGE" not in install_script.split("main \"$@\"")[0]:
        failures.append("tools/install-docker.sh 没有在 main 之前定义 ATO_IMAGE 的默认值")
    # 探针、版本兜底与 compose 改写后的自检：没有它们，「拉不到就构建」会变成「悄悄跑旧镜像」
    if "docker pull \"$image\" 2>/dev/null" not in install_script:
        failures.append("tools/install-docker.sh 没有安静的可用性探针（能拉到就不该去编译源码）")
    if "ATO_VERSION=1.3.2" not in install_script:
        failures.append("tools/install-docker.sh 的版本兜底提示里没有示例 ATO_VERSION（版本解析失败时给了空话）")

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
