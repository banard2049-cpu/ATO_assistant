# ATO Assistant

**中文** | [English](README.en.md)

ATO Assistant 是一个用于《Aeon Trespass: Odyssey》（简称 ATO）战役流程的本地 Web 工具，包含战役主控台、AIBP、故事、地图、阿尔戈号记录表、科技/装备、战役简报和第二屏幕。

仓库只发布程序和公开占位数据。图片、音频、完整故事文本以及个人存档需要自行准备，不会放进 Git 仓库。

## 界面语言

主控台的语言选择按钮只显示当前语言，点击后从弹出菜单里选民间翻译、官方中文或 English；选择会同步到其他模块，并在刷新后保留。英文游戏名称和定数框标题使用原版 App、TTS 或数据中已有的英文原名，工具自身的按钮和状态提示另行提供英文文案。

英文规则和故事正文需要本地原文数据。没有原文的内容会显示缺失提示或段落引用。个人笔记、自定义名称和卡牌图片保留原内容。

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

在主控台开启第二屏幕后，手机就同时是一个局域网服务器：同一网段的设备除了用专用网址看第二屏幕（`/ss/`），还可以打开**主控台地址**（第二屏地址去掉 `/ss/`，也就是根地址）使用主控台与其他模块。主控台里的第二屏幕卡片会直接给出这个地址和「复制网址」按钮。

- 局域网里**读和写都开放**：改的是手机上的那份存档，和便携版多设备编辑一样按 section 版本号检测冲突，版本对不上会回 409、页面自己重读重试。
- **登录、注册、退出只能在手机上操作**：这三个请求不在局域网转发，免得别的设备把手机上的登录态换掉或退出。局域网页面用的就是手机上的账号，所以也不需要登录。
- 便携版 / Docker 的局域网入口本来就是完整站点，别的设备打开根地址登录后可以正常使用（提示文案会相应写成「登录后使用」）。
- 局域网地址只在开启第二屏幕期间有效；关掉第二屏幕（或退出登录）会同时关闭这个入口。用不到时就关掉它，同一网段的其他设备也就访问不到了。

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

### 更新版本

便携版可以直接在程序里更新：主控台底部点「检查更新」，发现新版本后会出现「一键更新」按钮，只下载这次真正变动的程序文件（通常几十 KB 到几百 KB），不用重新下载整个安装包。

- 只更新**程序代码**。`data/` 存档、本地图片、`.atopack` 资源包和内置 PHP 运行时都不会动；PHP 运行时升级仍然需要下载完整安装包。
- 必须**在这台电脑上**打开的程序里操作（局域网设备上的第二屏不能触发更新），并且需要先登录。
- 更新完成后刷新页面即可生效。如果新版本有问题，同一个位置有「还原上一版」可以退回。
- 下载或校验失败可以重试；若提示程序文件写入中断，请先「还原上一版」再更新。即使 GitHub 暂时不可用，还原入口仍可使用。程序还原不会撤销你的战役存档修改。
- 2.1.9 及更早的便携版还没有这个功能，需要手动下载一次新版完整包，之后就能一键更新。
- 不想用它也可以照旧：解压到新的目录并保留旧目录中的 `data/` 和本地图片目录。

Android 无法增量更新，请在发布页下载新的 APK 覆盖安装。Docker 部署执行 `docker compose pull && docker compose up -d`。第二屏幕在主控台开启后，通过当前地址的 /ss/ 访问。

### 导入资源（.atopack）

图片资产不必一张张下载，也不必装素材库：拿到 `.atopack` 资料包后解压、拖进去就行。

1. 把 `.atopack` 改名成 `.zip`，或用 7-Zip 等归档工具直接解开（它本身就是 ZIP，只是换了扩展名）。
2. 打开解出来的文件夹，把里面的目录（`aibp/`、`map/`、`record/`、`ss/`、`story/`、`technology/`、`hero/`、`assets/` 等）整个拖进便携包根目录。
3. 系统提示合并 / 覆盖同名文件夹时选覆盖，然后重新启动。

包内保留项目相对路径，按上述方式复制后即可使用图片和故事数据。根目录的 `manifest.json` 是包清单，留着不影响运行。

Android 在界面里使用「从 .atopack 导入资源」。Docker / NAS 将解压后的这些目录复制到安装目录的 `app/` 下，然后刷新页面；容器里的只读素材目录需要在宿主机上填充，网页没有资料包导入入口。平铺的 `assets/bgm/*.mp3` 也会直接生效。

需要拍摄、整理或导出素材时，使用 [素材库工具](asset-studio/README.md)。

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

新增素材挂载还需要同步新版 `compose.yaml`（旧版工具同步 `compose.legacy.yaml`）：`pull` 只更新镜像，不会更新宿主机上的 Compose 文件。例如界面图标必须有 `./app/assets/icons:/app/assets/icons:ro` 这一条；更新配置后执行 `up -d` 重建容器，将图标放到 `app/assets/icons/`。

Compose 默认在启动时拉取镜像（`ATO_PULL_POLICY=always`）；本地构建使用 `never`。需要固定版本时，在 `.env` 写上 `ATO_VERSION=<发布页上的版本号>`，再运行安装脚本，它会同时取该版本的 Compose 配置与镜像。手动部署也必须使用同一版本标签下的 Compose 文件；旧镜像可能缺少新版素材挂载所需的启动还原逻辑，不能只改镜像版本号。

### 旧版 docker-compose（含 32 位系统）

使用 [compose.legacy.yaml](tools/packaging/docker/compose.legacy.yaml)，要求 `docker-compose` 1.21.0 或更新的 v1 版本（可用 `docker-compose version` 查看）。它使用 `version: "2.4"`，移除了 v1 不支持的 `pull_policy` / `bind.create_host_path`，保留相同的端口、存档和全部素材挂载。

把这份文件复制到安装目录，与 `data/`、`app/` 同级，然后在该目录执行。**首次启动前，`app/ss/battle-board.jpg` 必须是文件**；若之前失败的启动已把它建成目录，先将该目录移走再执行。`touch` 不会清空已有的底图。

~~~bash
mkdir -p data app/ss
touch app/ss/battle-board.jpg
docker-compose -f compose.legacy.yaml pull && docker-compose -f compose.legacy.yaml up -d
~~~

访问 `http://服务器IP:8793/`。更新仍执行上面的 `pull && up -d`，停止使用 `docker-compose -f compose.legacy.yaml down`。如需固定版本，在同目录的 `.env` 中写 `ATO_VERSION=<发布页上的版本号>`，并取该版本标签下的兼容配置。所有命令都带 `-f compose.legacy.yaml`，避免旧版工具读到仅供 Compose v2 使用的 `compose.yaml`。

### 镜像架构与树莓派

公开镜像按 `linux/amd64` 与 `linux/arm/v7` 两个架构发布，同一个标签同时指向两份，Docker 会按本机架构自动挑，不需要写 `--platform`。**32 位 Raspberry Pi OS 用的就是 `linux/arm/v7`**，树莓派 3/4/5 装 32 位系统时也可使用该镜像；只有 `docker-compose` 时按上面的兼容配置启动，有 Compose v2.17+ 时可使用一键安装命令。

其它架构没有预构建应用镜像时，一键安装脚本会取对应版本源码，先用发布导出器准备完整的 `app/` 构建目录，再在本机构建。`linux/arm64` 可使用这条路径；其它架构还需要 PHP 与 Python 基础镜像支持本机架构。脚本在 `.env` 保存准确的本地镜像标签及 `ATO_PULL_POLICY=never`，后续 `docker compose up -d` 可直接启动。以后升级重跑一次安装命令。

64-bit Raspberry Pi OS 属于 `linux/arm64`，走的就是上面这条本地构建路径；想省掉自己构建，装 32 位系统用现成的 `linux/arm/v7` 镜像更省事。

安装脚本默认从 GitHub 取最新 tag 的源码。固定源码版本时可在安装目录的 `.env` 里写 `ATO_VERSION=<发布页上的版本号>`；构建仍需能访问源码与基础镜像。使用自建镜像时同时设置 `ATO_IMAGE=ato-assistant:local` 和 `ATO_PULL_POLICY=never`；两份 Compose 配置都支持 `ATO_IMAGE`。

一键安装默认使用执行命令时的当前文件夹；也可以通过 `ATO_DIR=/path/to/dir` 指定安装目录。脚本会建好挂载点和决战版图底图占位文件 `app/ss/battle-board.jpg`（把真图覆盖上去，文件名不要改），并下载 [Docker 完整说明](tools/packaging/docker/README.txt) 到安装目录。BGM 可放在 `app/assets/bgm/audio/`，资料包平铺到 `app/assets/bgm/` 的音频同样实时可用，无需重跑安装脚本。

data/ 和 app/ 下的本地素材目录会挂载到容器，拉取新镜像不会删除它们。

**容器里只有素材是本地的，程序一律来自镜像**，所以 `docker compose pull` 能完整更新（包括第二屏前端和 BGM 播放器）。宿主机上的对应位置：

| 放什么 | 宿主机位置 |
| --- | --- |
| 决战版图底图 | `app/ss/battle-board.jpg`（单文件挂载；v2 配置缺文件会报错，v1 兼容配置需提前创建文件） |
| 第二屏地形图 / 地形卡 | `app/ss/terrain/`、`app/ss/terrain-cards/` |
| 主控台背景音乐 | `app/assets/bgm/`（资料包平铺音频）或 `app/assets/bgm/audio/`（同名时优先使用；文件名见 [bgm 说明](assets/bgm/README.md)） |
| 主控台界面图标 | `app/assets/icons/`（资料包提供的 SVG 图标；只读挂载） |
| 循环标记 / 探索卡 / 故事与厄运卡 | `app/assets/cycle-symbols/`、`app/assets/exploration-cards/`、`app/assets/story-doom-cards/` |
| 其它本地图片 | `app/map/images/`、`app/technology/images/`、`app/story/images/` 等（见 `compose.yaml`） |
| 私有故事书数据 | `app/story/data/`（只读挂载） |
| 巴别语 / 塞壬语密语字形 | `app/story/assets/cryptic/glyphs/`（资料包的 PNG 字形；只读挂载，缺少时密语键盘为空） |

`app/ss/` 下的 `index.html` / `app.js` / `styles.css` / `terrain-data.js` 是镜像提供的程序文件，宿主机上的同名旧副本不会生效，可以直接删掉。

## 素材库工具

asset-studio/ 是独立的素材拍摄、导入和分享工具。完整说明见 [asset-studio/README.md](asset-studio/README.md)。

## 记录表图片附件

阿尔戈号记录表的「计数标记」点击标题右侧「＋」添加名称和数量，直接修改数字或用「− / ＋」调整，数量最低为 0，各循环独立保存。旧存档中的计数标记文字会自动移到对应循环的「战役笔记」开头，保留原有笔记。

阿尔戈号记录表的「战役笔记」下方支持图片附件，点击标题右侧的「＋」展开相册、文件和拍照菜单，也可拖入图片、在战役笔记中粘贴截图。点击缩略图可放大，直接编辑图片下方的名称即可改名，点击「删除」移除当前循环的附件。

图片按当前登录账号和循环保存，自动转换为 JPG，最长边不超过 2048 像素，每张不超过 768 KB。便携版 / NAS 的图片保存在 `data/record-attachments/`，Android 保存在应用私有目录；日常存档只记录图片引用。主控台「导出存档」和记录表单独导出都会将图片一起放入 JSON 备份，导入时自动恢复。手动迁移 `data/` 时需复制整个目录。删除附件只移除当前记录中的引用，图片文件保留供历史备份恢复。

手机浏览器使用系统的相册、文件和相机入口，具体选择界面由设备决定；Android 应用使用系统相机拍摄，无需广泛访问相册的权限。浏览器无法读取的 HEIC 等格式请先转换为 JPG 或 PNG。

## 故事书密语记录

故事书左侧栏最下方可展开「密语记录」小模块，切换百臂巨人语、巴别语、塞壬语。百臂巨人语支持 16 个方块符号和手动数字对应；巴别语与塞壬语支持点选原始字形、编辑字符对应、键盘录入已记字符、添加空格与换行、选择连续字符记成词组，以及保存和载入记录。字符对应、词组笔记、输入和记录随当前战役的记录表保存，也包含在完整状态备份里；已保存记录保留当时的字符读法、词组含义和分词文本。

巴别语与塞壬语默认为空白字符对应，可主动用 [Babelian & Siren Translator 仓库](https://github.com/HUAHUOOo/Babelian-Siren-Translator) 的参考表补齐未知字符，已有手工对应保留。「连字成词」支持手工调整空格、标点和离线分词建议，不更改原文字母或未知标记。塞壬语按玩家确认的螺旋读序手工录入，键盘对照方向只辅助辨认字形，不推断螺旋几何。字形、词频与算法来源见 [素材说明](story/assets/cryptic/NOTICE.md)。

## 战役简报

briefing/ 是独立的战役简报工具，用同一条日期轴回放**地图翻开**与**科技树点亮**，并逐日列出当天发生的事。

- 数据只有一个来源：`data/backups/<账号>/daily/` 里的每日存档备份。进入下一天时保留的那份快照当作「那天的结束状态」，相邻两天相减就是当天的新增（翻开的板块、点亮的科技、故事/定数推进、英雄增减、地图流水）。
- 简报覆盖哪几天，取决于备份还在不在。系统保留策略之外没有备份的日期会显示「无记录」，差分跨过它直接对比前后两份。
- 备份里只有状态，所以这里只报**净变化**；装备库存与资源收支保存在存档的 `record` 模块里（科技页负责读写），简报目前还没有为它们做差分展示，所以这里看不到这两项。
- 入口在主控台右侧「用户与存档」面板的存档操作里（简报读的是每日备份，所以跟存档放在一起）。
- 「导出 GIF / PDF」把地图回放与科技树回放各导出一张 GIF，并把逐日记录排成 PDF，打成一个 zip 下载。逐帧渲染与 GIF 编码都在浏览器里做（内置 PHP 是精简构建，没有 GD/Imagick，服务器端画不了图；浏览器也不能自己编码 GIF，用的是随源码发布的 MIT 编码器 `assets/vendor/gifenc.js`），所以几十天的循环要跑几十秒，进度显示在标题下面。

## 许可与素材声明

本项目源代码自本次许可变更起以 [PolyForm Noncommercial License 1.0.0](LICENSE) 发布，SPDX 标识为 `PolyForm-Noncommercial-1.0.0`。允许个人、教育、研究、公益等非商业用途使用、修改和分发；商业用途不在该许可范围内，需要事先取得版权方的单独授权。分发时必须同时提供许可证文本或其官方 URL，并保留许可证中的 `Required Notice`。

许可证只覆盖本仓库的程序代码，不覆盖游戏素材。本项目不包含官方游戏素材授权。使用者需要自行确保本地图片、故事文本和音频的来源与使用方式符合相关授权要求。

便携版 ZIP、Android APK 与 Docker 镜像里包含的第三方运行时、库及依赖不适用本项目的 PolyForm Noncommercial 许可证，仍分别由其自身许可证（PHP License 3.01 等）管辖。
