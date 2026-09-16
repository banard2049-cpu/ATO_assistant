#!/bin/bash
# ATO 故事书语音工具包 —— macOS 启动脚本
set -e
cd "$(dirname "$0")/../.."

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js。请先安装 Node.js 18 或更高版本：https://nodejs.org/"
  read -r -p "按回车退出…"
  exit 1
fi

echo "使用 Node: $(command -v node)"
echo "正在启动故事书语音工具包，浏览器会自动打开。"
echo "关闭此窗口即可停止服务。"
echo
exec node "tools/tts-toolkit/server.mjs"
