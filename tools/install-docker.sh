#!/usr/bin/env bash
set -eu

install_dir="${ATO_DIR:-$PWD}"
image="${ATO_IMAGE:-ghcr.io/banard2049-cpu/ato_assistant:latest}"
compose_url="https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/packaging/docker/compose.yaml"

mkdir -p "$install_dir"
curl -fsSL "$compose_url" -o "$install_dir/compose.yaml"
cd "$install_dir"
docker pull "$image"

if [ ! -f app/index.html ]; then
  container_id="$(docker create "$image")"
  mkdir -p app
  docker cp "$container_id:/app/." app/
  docker rm "$container_id" >/dev/null
fi

docker compose up -d
echo "ATO Assistant 已启动：http://服务器IP:8793/"
