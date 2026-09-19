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

已有 `.atopack` 资料包时见下节「导入资源」：解压后把内容拖进便携包，图片就会落到上面这些目录。

更新版本时，解压到新的目录并保留旧目录中的 data/ 和本地图片目录即可。第二屏幕在主控台开启后，通过当前地址的 /ss/ 访问。

主控台的背景音乐是可选功能：把音频放进 assets/bgm/ 目录，「用户与存档」下方的「背景音乐」面板默认跟随「今日流程」自动切曲；「故事」步骤里的 回忆突破 / 内蕴奥德赛 / 法洛斯之梦 / 主线 / 特殊事件 入口，以及「考察」里的 冒险中枢 / R&R，点一下也会连带切曲，另外还能导入自选 BGM。**只有主控台出声**，故事模块（story/）不再参与音乐。文件名与安装方式见 [bgm 说明](assets/bgm/README.md)；音频不进仓库，也不打进便携版 / Docker / APK，需要自己准备（可用 tools/install-bgm.bat 从本地音乐目录安装）。

BGM 按流程勾选推进：探索 → 考察 → 遭遇 → 发展，不会因缺少提醒而提前跳到打造与训练。下拉选具体阶段会持续锁定；自动模式下点入口只临时切曲，点「跟随流程」立即恢复自动。流程全部完成后播放休整曲。

官中图片可以放在项目根目录的 `official-assets/`。导出 `.atopack`、完整资源包或兼容 ZIP 时，打包器会优先使用这里与清单目标对应的图片；没有对应文件时才回退到素材库或原来的项目/APK 资源。推荐按原路径保存，也支持按资源目录缩短一级，例如 `official-assets/HEKATON/HEKATON_BP_I_001.jpg` 对应 `aibp/ps/HEKATON/HEKATON_BP_I_001.jpg`；扩展名与清单不同也能匹配（`CARD.png` 配 `CARD.jpg` 目标），只要求去掉后缀后的路径唯一，资料包内路径始终照清单目标。该目录属于本地私有资源，不会进入便携版、Docker 或 APK。

### 导入资源（.atopack）

图片资产不必一张张下载，也不必装素材库：拿到 `.atopack` 资料包后解压、拖进去就行。

1. 把 `.atopack` 改名成 `.zip`，或用 7-Zip 等归档工具直接解开（它本身就是 ZIP，只是换了扩展名）。
2. 打开解出来的文件夹，把里面的目录（`aibp/`、`map/`、`record/`、`ss/`、`story/`、`technology/`、`hero/`、`assets/` 等）整个拖进便携包根目录。
3. 系统提示合并 / 覆盖同名文件夹时选覆盖，然后重新启动。

包内保留的是工程相对路径，落位与上面的目录清单一致，所以拖完立刻就有卡图、地形图 / 地形卡、装备与科技图、英雄和记录表插图、故事插图等图片资产；包里还带着故事数据，以及导出时勾选了“包含主控台背景音乐”的 `assets/bgm/` 音频。包内默认不含官方版故事书截图（原书扫描图），只带官方故事书正文数据；要构建官方版资料包需在素材工具导出面板勾选「包含官方版故事书截图」。根目录多出来的 `manifest.json` 只是包清单，留着不影响运行，也可以删掉。

不方便手动铺文件的环境（Android、Docker / NAS）改用界面里的「从 .atopack 导入资源」，它会顺带完成路径归属和背景音乐解包。

需要拍摄或批量整理素材时，再运行 asset-studio/ 下的 start-windows.bat 或
start-macos.command。电脑端在“分享与安装”中选择 ATO_assistant 根目录，预览差异后即可把
新增图片安装到对应目录；也可以导出 `.atopack` 分发给别人，对方按上面三步解压拖入即可。

## Docker（服务器 / NAS）

GHCR 镜像公开可用。已安装 `docker compose`（Compose v2.17+）时，SSH 登录服务器后执行这一行即可；只有 `docker-compose` 的系统请用下方兼容配置：

~~~
curl -fsSL https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/install-docker.sh | bash
~~~

访问 http://服务器IP:8793/。更新：

~~~bash
docker compose pull
docker compose up -d
~~~

compose 里的 `pull_policy` 是 `always`：镜像标签 `latest` 会移动，用默认的 `missing` 时 `docker compose pull` 可能认为「本地已有同名镜像」而什么都不拉，更新看起来成功、实际还在跑旧版。代价是 GHCR 不可达时手动 `docker compose up -d` 会报错（已经在跑的容器不受影响）；想固定版本可以在安装目录建一个 `.env`，写上 `ATO_VERSION=1.3.1` 这样的具体版本号。

### 旧版 docker-compose（含 32 位系统）

使用 [compose.legacy.yaml](tools/packaging/docker/compose.legacy.yaml)，要求 `docker-compose` 1.21.0 或更新的 v1 版本（可用 `docker-compose version` 查看）。它使用 `version: "2.4"`，移除了 v1 不支持的 `pull_policy` / `bind.create_host_path`，保留相同的端口、存档和全部素材挂载。

把这份文件复制到安装目录，与 `data/`、`app/` 同级，然后在该目录执行。**首次启动前，`app/ss/battle-board.jpg` 必须是文件**；若之前失败的启动已把它建成目录，先将该目录移走再执行。`touch` 不会清空已有的底图。

~~~bash
mkdir -p data app/ss
touch app/ss/battle-board.jpg
docker-compose -f compose.legacy.yaml pull && docker-compose -f compose.legacy.yaml up -d
~~~

访问 `http://服务器IP:8793/`。更新仍执行上面的 `pull && up -d`，停止使用 `docker-compose -f compose.legacy.yaml down`。如需固定版本，在同目录的 `.env` 中写 `ATO_VERSION=1.3.6`。所有命令都带 `-f compose.legacy.yaml`，避免旧版工具读到仅供 Compose v2 使用的 `compose.yaml`。

### 镜像架构与树莓派

公开镜像按 `linux/amd64` 与 `linux/arm/v7` 两个架构发布，同一个标签同时指向两份，Docker 会按本机架构自动挑，不需要写 `--platform`。**32 位 Raspberry Pi OS 用的就是 `linux/arm/v7`**，树莓派 3/4/5 装 32 位系统时也可使用该镜像；只有 `docker-compose` 时按上面的兼容配置启动，有 Compose v2.17+ 时可使用一键安装命令。

其它架构（`linux/arm64`、`riscv64` 等）没有预构建镜像。一键安装脚本在这种情况下**不会**停在 `no matching manifest`，而是自己取对应版本的源码、用发布镜像那份 Dockerfile 在本机构建（基础镜像 `php:8.4-cli-alpine` 有 arm32v7/arm64 清单，应用是纯静态文件加 PHP 内置服务器，不需要编译任何东西）。这时脚本会把安装目录里的 compose 改成指向本地镜像，并把 `pull_policy` 改成 `never`：镜像不在任何 registry 里，留着 `always` 会去拉一个不存在的东西。以后升级只要重跑一次安装命令。

64-bit Raspberry Pi OS 属于 `linux/arm64`，走的就是上面这条本地构建路径；想省掉自己构建，装 32 位系统用现成的 `linux/arm/v7` 镜像更省事。

安装脚本默认从 GitHub 取最新 tag 的源码。GitHub 不可达时可以在安装目录的 `.env` 里写明版本（`ATO_VERSION=1.3.2`），或直接 `ATO_VERSION=1.3.2 bash install-docker.sh`。

一键安装默认使用执行命令时的当前文件夹；也可以通过 `ATO_DIR=/path/to/dir` 指定安装目录。脚本会建好挂载点：决战版图底图的占位文件 `app/ss/battle-board.jpg`（把真图覆盖上去，文件名不要改）、BGM 目录 `app/assets/bgm/audio/`，并把旧版直接放在 `app/assets/bgm/` 下的音频移进 `audio/`。

data/ 和 app/ 下的本地素材目录会挂载到容器，拉取新镜像不会删除它们。

**容器里只有素材是本地的，程序一律来自镜像**，所以 `docker compose pull` 能完整更新（包括第二屏前端和 BGM 播放器）。宿主机上的对应位置：

| 放什么 | 宿主机位置 |
| --- | --- |
| 决战版图底图 | `app/ss/battle-board.jpg`（单文件挂载；v2 配置缺文件会报错，v1 兼容配置需提前创建文件） |
| 第二屏地形图 / 地形卡 | `app/ss/terrain/`、`app/ss/terrain-cards/` |
| 主控台背景音乐 | `app/assets/bgm/audio/`（`.mp3` / `.ogg`，文件名见 [bgm 说明](assets/bgm/README.md)） |
| 其它本地图片 | `app/map/images/`、`app/technology/images/`、`app/story/images/` 等（见 `compose.yaml`） |
| 私有故事书数据 | `app/story/data/`（只读挂载） |

`app/ss/` 下的 `index.html` / `app.js` / `styles.css` / `terrain-data.js` 是镜像提供的程序文件，宿主机上的同名旧副本不会生效，可以直接删掉。

## 素材库工具

asset-studio/ 是独立的素材拍摄、导入和分享工具。完整说明见 [asset-studio/README.md](asset-studio/README.md)。

## 许可与素材声明

本项目源代码自本次许可变更起以 [PolyForm Noncommercial License 1.0.0](LICENSE) 发布，SPDX 标识为 `PolyForm-Noncommercial-1.0.0`。允许个人、教育、研究、公益等非商业用途使用、修改和分发；商业用途不在该许可范围内，需要事先取得版权方的单独授权。分发时必须同时提供许可证文本或其官方 URL，并保留许可证中的 `Required Notice`。

许可证只覆盖本仓库的程序代码，不覆盖游戏素材。本项目不包含官方游戏素材授权。使用者需要自行确保本地图片、故事文本和音频的来源与使用方式符合相关授权要求。

便携版 ZIP、Android APK 与 Docker 镜像里包含的第三方运行时、库及依赖不适用本项目的 PolyForm Noncommercial 许可证，仍分别由其自身许可证（PHP License 3.01 等）管辖。
