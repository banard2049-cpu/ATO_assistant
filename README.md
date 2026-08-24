# ATO Assistant

ATO Assistant 是一个用于 ATO 战役流程的本地 Web 工具，包含战役主控台、AIBP、故事、地图、阿尔戈号记录表、科技/装备和第二屏幕。

仓库只发布程序和公开占位数据。图片、音频、完整故事文本以及个人存档需要自行准备，不会放进 Git 仓库。

## 从 GitHub Release 启动（推荐）

请从 [Releases](https://github.com/banard2049-cpu/ATO_assistant/releases) 下载对应版本，不要下载源码 ZIP。

### Windows

下载 ATO-Assistant-Portable-<版本>-windows-x64.zip，完整解压后双击 start-ato-portable.bat。

### macOS

- Apple Silicon：下载 ATO-Assistant-Portable-<版本>-macos-arm64.zip
- Intel：下载 ATO-Assistant-Portable-<版本>-macos-x64.zip

完整解压后双击 start-ato-portable.command。如果系统阻止脚本，右键选择“打开”。

### Android

下载 ATO-Assistant-<版本>.apk 并安装。若系统阻止安装，请允许当前浏览器或文件管理器安装未知来源应用。

### 存档和本地图片

Windows/macOS 首次启动会创建空的 data/ 目录，战役存档保存在这里。后来下载的图片请放回对应目录：

~~~text
aibp/ps/
assets/
hero/assets/
map/images/
map/tokens/
record/assets/
ss/terrain/
ss/terrain-cards/
story/images/
technology/images/
~~~

更新版本时，解压到新的目录并保留旧目录中的 data/ 和本地图片目录即可。第二屏幕在主控台开启后，通过当前地址的 /ss/ 访问。

如果需要拍摄或批量整理素材，运行 asset-studio/ 下的 start-windows.bat 或
start-macos.command。电脑端在“分享与安装”中选择 ATO_assistant 根目录，预览差异后即可把
新增图片安装到对应目录；也可以先导出 .atopack 再导入。

## Docker（服务器 / NAS）

GHCR 镜像公开可用。SSH 登录服务器后执行这一行即可：

~~~
curl -fsSL https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/install-docker.sh | bash
~~~

访问 http://服务器IP:8793/。更新：

~~~bash
cd ~/ato-assistant
docker compose pull
docker compose up -d
~~~

data/ 和 app/ 下的本地图片目录会挂载到容器，拉取新镜像不会删除它们。

## 素材库工具

asset-studio/ 是独立的素材拍摄、导入和分享工具。完整说明见 [asset-studio/README.md](asset-studio/README.md)。

## 许可与素材声明

本项目不包含官方游戏素材授权。使用者需要自行确保本地图片、故事文本和音频的来源与使用方式符合相关授权要求。
