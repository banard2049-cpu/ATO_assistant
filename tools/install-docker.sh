#!/usr/bin/env bash
set -eu

install_dir="${ATO_DIR:-$PWD}"
image="${ATO_IMAGE:-ghcr.io/banard2049-cpu/ato_assistant:latest}"
compose_url="https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/packaging/docker/compose.yaml"
repo_url="${ATO_REPO_URL:-https://github.com/banard2049-cpu/ATO_assistant.git}"

# 公开镜像按 linux/amd64 与 linux/arm/v7 两个架构发布（见 .github/workflows/docker-package.yml）。
# 这两个架构都直接走 docker pull —— 多架构 manifest 会自己挑对的那一份，脚本不需要判断。
#
# 其余情况（arm64、riscv64 之类没有预构建镜像的架构，或者 GitHub 上恰好还没发布 arm/v7）
# 硬拉只会得到一句 no matching manifest，所以退回「在宿主机按本机架构自己 build」。
# 基础镜像 php:8.4-cli-alpine 有 arm32v7 清单，应用是纯静态文件 + PHP 内置服务器、
# 不需要编译任何东西，所以树莓派上本地构建是可行的。发布镜像的 Dockerfile 就在
# tools/packaging/docker/ 里，直接按 tag 取一份源码即可，不依赖仓库副本。
fetch_version() {
  # 解析成具体 tag：一次安装与之后的 compose pull 拿到的是同一个版本，
  # 不会出现「装的是这份源码、跑的是另一个 latest」。
  if [ -n "${ATO_VERSION:-}" ]; then
    printf '%s' "$ATO_VERSION"
    return 0
  fi
  if [ -f "$install_dir/.env" ]; then
    local pinned
    pinned="$(sed -n 's/^ATO_VERSION=//p' "$install_dir/.env" | head -n 1)"
    if [ -n "$pinned" ]; then
      printf '%s' "$pinned"
      return 0
    fi
  fi
  local latest
  latest="$(git ls-remote --tags --refs --sort=-v:refname "$repo_url" 'v*' 2>/dev/null \
    | head -n 1 | sed 's#.*refs/tags/v##')" || true
  if [ -n "$latest" ]; then
    printf '%s' "$latest"
    return 0
  fi
  echo "错误：无法确定 ATO Assistant 的版本号（GitHub 不可达，也没有设置 ATO_VERSION）。" >&2
  echo "请显式指定版本后重试，例如：ATO_VERSION=1.3.2 bash install-docker.sh" >&2
  return 1
}

# 按本机架构构建镜像。$1 = 已经解析好的版本号（不带 v）。
build_local_image() {
  local version="$1"
  local source_dir="$install_dir/.ato-src"
  local context="$source_dir/tools/packaging/docker"
  local server_arch
  server_arch="$(docker version --format '{{.Server.Arch}}' 2>/dev/null || echo 未知)"

  echo "本机架构 ${server_arch} 没有预构建镜像，改为本地构建 ato-assistant:${version} ……"
  if command -v git >/dev/null 2>&1; then
    if [ -d "$source_dir/.git" ]; then
      git -C "$source_dir" fetch --depth 1 origin "refs/tags/v${version}:refs/tags/v${version}"
      git -C "$source_dir" checkout -q "v${version}"
    else
      rm -rf "$source_dir"
      git clone --depth 1 --branch "v${version}" "$repo_url" "$source_dir"
    fi
  else
    # 没装 git：退回源码 tarball，里面同样带 tools/packaging/docker。
    rm -rf "$source_dir"
    mkdir -p "$source_dir"
    curl -fsSL "${repo_url%.git}/archive/refs/tags/v${version}.tar.gz" \
      | tar -xz --strip-components=1 -C "$source_dir"
  fi

  if [ ! -f "$context/Dockerfile" ]; then
    echo "错误：$context 里没有 Dockerfile（v${version} 这个 tag 存在吗？）" >&2
    return 1
  fi

  docker build -t "ato-assistant:${version}" "$context"

  # compose.yaml 里 image 用 ${ATO_IMAGE:-...} 覆盖，pull_policy 同时改成 never：
  # 本地构建的镜像不在任何 registry 里，留着 always 的话 compose 会去拉一个不存在的镜像。
  # 兜底值写成 ato-assistant:latest 而不是 ato-assistant：镜像名不带 tag 时默认是 :latest，
  # 两个写法必须指到同一个 tag，否则「构建出来的」和「compose 用的」会差一个标签。
  # 只改 image/pull_policy 两行，别的行一律不动（表达式写死在脚本里，不做通用编辑）。
  sed -i \
    -e "s|^\(\s*\)image: .*|\1image: \${ATO_IMAGE:-ato-assistant:latest}|" \
    -e "s|^\(\s*\)pull_policy: always|\1pull_policy: never|" \
    compose.yaml
  if ! grep -q 'pull_policy: never' compose.yaml || ! grep -q 'ATO_IMAGE' compose.yaml; then
    echo "错误：没能把 compose.yaml 指向本地镜像（image / pull_policy 两行的格式变了？）。" >&2
    exit 1
  fi
  echo "已把 compose.yaml 指向本地镜像（pull_policy: never）。"
}

main() {
  mkdir -p "$install_dir"
  cd "$install_dir"
  curl -fsSL "$compose_url" -o "$install_dir/compose.yaml"

  # compose 只把「本地素材」挂进容器，程序文件（含第二屏的 index.html / app.js）全部由镜像
  # 提供 —— 这样 docker compose pull 才能完整更新。这里先把挂载点建好：目录 Docker 会自动
  # 创建，单文件不行，见下面的占位底图。
  # AIBP 卡图：ps/ 整棵挂进容器（宿主机目录就是使用者投放卡图的位置，图片和程序数据同级，
  # 拆开挂会让图消失），程序数据由镜像里的 /opt/ato/aibp-ps-program 在启动时补回，所以这里
  # 只要建出这一个目录。
  mkdir -p app/aibp/ps \
    app/assets/exploration-cards app/assets/story-doom-cards app/assets/cycle-symbols \
    app/assets/bgm/audio app/hero/assets app/map/images app/map/tokens app/record/assets \
    app/ss/terrain app/ss/terrain-cards app/story/images app/story/data app/technology/images

  # 决战版图底图是单文件挂载：文件不存在时 Docker 会建一个同名目录顶上，版图背景就悄悄
  # 废了（compose 里用 bind.create_host_path: false 挡这个坑，缺文件时直接报错）。
  # 先放一个 0 字节占位文件，把真正的底图覆盖到同一路径即可（文件名不变）。
  if [ ! -e app/ss/battle-board.jpg ]; then
    : > app/ss/battle-board.jpg
    echo "已创建 app/ss/battle-board.jpg 占位文件：把决战版图底图复制过去（文件名不变）。"
  fi

  # BGM：镜像只带播放器代码，容器只挂 app/assets/bgm/audio/。早期版本把音频直接放在
  # app/assets/bgm/ 下，这里顺手搬进 audio/，免得升级后突然没声音。
  moved=0
  for file in app/assets/bgm/*.mp3 app/assets/bgm/*.ogg app/assets/bgm/*.m4a \
    app/assets/bgm/*.wav app/assets/bgm/*.flac app/assets/bgm/*.opus; do
    [ -f "$file" ] || continue
    if mv -n "$file" "app/assets/bgm/audio/"; then
      moved=$((moved + 1))
    fi
  done
  if [ "$moved" -gt 0 ]; then
    echo "已把 $moved 个 BGM 音频移到 app/assets/bgm/audio/（容器只挂载这个子目录）。"
  fi

  # 1) 预构建镜像覆盖 amd64 / armv7，先试直接拉。
  #    ATO_IMAGE 是使用者自己指定的镜像，由他自己负责，拉不到就让 docker 明确报错，
  #    不要悄悄换成「编译源码」——那不是他要的东西。
  if [ "${ATO_IMAGE:-}" != "" ]; then
    docker pull "$image"
  elif docker pull "$image" 2>/dev/null; then
    echo "已拉取预构建镜像 ${image}（本机架构）。"
  else
    # 2) 拉不到：这个架构没有预构建镜像（arm64、riscv64……），或者 GitHub 上还没发布
    #    对应架构。按源码在本机构建。真正的网络故障会在这里一起暴露出来
    #    —— 源码构建同样要联网取基础镜像，失败信息照样打出来，不会被吞掉。
    echo "预构建镜像 ${image} 在本机架构上不可用，改为本地构建。"
    build_local_image "$(fetch_version)"
  fi

  docker compose up -d
  echo "ATO Assistant 已启动：http://服务器IP:8793/"
  echo "第二屏幕：http://服务器IP:8793/ss/（先在主控台的「用户与存档」里开启）"
}

main "$@"
