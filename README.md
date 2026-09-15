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

主控台的背景音乐是可选功能：把音频放进 assets/bgm/ 目录，「用户与存档」下方的「背景音乐」面板默认跟随「今日流程」自动切曲；「故事」步骤里的 回忆突破 / 内蕴奥德赛 / 法洛斯之梦 / 主线 / 特殊事件 入口，以及「考察」里的 冒险中枢 / R&R，点一下也会连带切曲，另外还能导入自选 BGM。**只有主控台出声**，故事模块（story/）不再参与音乐。文件名与安装方式见 [bgm 说明](assets/bgm/README.md)；音频不进仓库，也不打进便携版 / Docker / APK，需要自己准备（可用 tools/install-bgm.bat 从本地音乐目录安装）。

如果需要拍摄或批量整理素材，运行 asset-studio/ 下的 start-windows.bat 或
start-macos.command。电脑端在“分享与安装”中选择 ATO_assistant 根目录，预览差异后即可把
新增图片安装到对应目录；也可以先导出 .atopack 再导入。导出时可勾选“包含主控台背景音乐”，
把 assets/bgm/ 里的音频带进资料包（音频不进程序包，Android 端导入资料包后会解包到 assets/bgm/）。

## Docker（服务器 / NAS）

GHCR 镜像公开可用。SSH 登录服务器后执行这一行即可：

~~~
curl -fsSL https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/install-docker.sh | bash
~~~

访问 http://服务器IP:8793/。更新：

~~~bash
docker compose pull
docker compose up -d
~~~

compose 里的 `pull_policy` 是 `always`：镜像标签 `latest` 会移动，用默认的 `missing` 时 `docker compose pull` 可能认为「本地已有同名镜像」而什么都不拉，更新看起来成功、实际还在跑旧版。代价是 GHCR 不可达时手动 `docker compose up -d` 会报错（已经在跑的容器不受影响）；想固定版本可以在安装目录建一个 `.env`，写上 `ATO_VERSION=1.3.1` 这样的具体版本号。

一键安装默认使用执行命令时的当前文件夹；也可以通过 `ATO_DIR=/path/to/dir` 指定安装目录。脚本会建好挂载点：决战版图底图的占位文件 `app/ss/battle-board.jpg`（把真图覆盖上去，文件名不要改）、BGM 目录 `app/assets/bgm/audio/`，并把旧版直接放在 `app/assets/bgm/` 下的音频移进 `audio/`。

data/ 和 app/ 下的本地素材目录会挂载到容器，拉取新镜像不会删除它们。

**容器里只有素材是本地的，程序一律来自镜像**，所以 `docker compose pull` 能完整更新（包括第二屏前端和 BGM 播放器）。宿主机上的对应位置：

| 放什么 | 宿主机位置 |
| --- | --- |
| 决战版图底图 | `app/ss/battle-board.jpg`（单文件挂载，缺文件会直接报错，不会静默失效） |
| 第二屏地形图 / 地形卡 | `app/ss/terrain/`、`app/ss/terrain-cards/` |
| 主控台背景音乐 | `app/assets/bgm/audio/`（`.mp3` / `.ogg`，文件名见 [bgm 说明](assets/bgm/README.md)） |
| 其它本地图片 | `app/map/images/`、`app/technology/images/`、`app/story/images/` 等（见 `compose.yaml`） |
| 私有故事书数据 | `app/story/data/`（只读挂载） |

`app/ss/` 下的 `index.html` / `app.js` / `styles.css` / `terrain-data.js` 是镜像提供的程序文件，宿主机上的同名旧副本不会生效，可以直接删掉。

## 素材库工具

asset-studio/ 是独立的素材拍摄、导入和分享工具。完整说明见 [asset-studio/README.md](asset-studio/README.md)。

## 许可与素材声明

本项目不包含官方游戏素材授权。使用者需要自行确保本地图片、故事文本和音频的来源与使用方式符合相关授权要求。
