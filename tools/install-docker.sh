#!/usr/bin/env bash
set -eu

install_dir="${ATO_DIR:-$PWD}"
image="${ATO_IMAGE:-ghcr.io/banard2049-cpu/ato_assistant:latest}"
compose_url="https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/packaging/docker/compose.yaml"

mkdir -p "$install_dir"
curl -fsSL "$compose_url" -o "$install_dir/compose.yaml"
cd "$install_dir"
docker pull "$image"

# compose 只把「本地素材」挂进容器，程序文件（含第二屏的 index.html / app.js）全部由镜像
# 提供 —— 这样 docker compose pull 才能完整更新。这里先把挂载点建好：目录 Docker 会自动
# 创建，单文件不行，见下面的占位底图。
# AIBP 卡图：ps/ 整棵挂进容器（宿主机目录就是使用者投放卡图的位置，图片和程序数据同级，
# 拆开挂会让图消失），程序数据由镜像里的 /opt/ato/aibp-ps-program 在启动时补回，所以这里
# 只要建出这一个目录。
mkdir -p app/aibp/ps \
  app/assets/exploration-cards app/assets/story-doom-cards \
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

docker compose up -d
echo "ATO Assistant 已启动：http://服务器IP:8793/"
echo "第二屏幕：http://服务器IP:8793/ss/（先在主控台的「用户与存档」里开启）"
