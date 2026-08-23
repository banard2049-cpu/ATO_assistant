# ATO_assistant

ATO_assistant 是一个为ATO战役流程准备的本地 Web 工具。它把每日流程、故事查阅、地图标记、阿尔戈号记录表和科技/装备辅助功能放在同一个入口里，方便游玩时快速记录、同步和回看状态。

这个仓库只发布工具源码和少量允许公开的配置/辅助数据；图片、音频、完整故事文本、官方素材、个人存档和运行日志不会随仓库上传。

## 功能

- 战役主控台：按天推进战役流程，记录今日事项、日期轨和战役笔记。
- 故事模块：提供故事入口和阅读界面。
- 地图模块：管理地图格、标记和标签，支持本地编辑标签配置。
- 阿尔戈号记录表：集中记录战役资源、状态和相关表格信息。
- 科技模块：浏览科技内容，并提供装备部件、装备制造。
- 账号与存档：通过 PHP API 保存用户状态、地图标签和装备部件数据；按主控制台游戏日永久归档，并为当前游戏日保留最近 10 份滚动备份。

PHP / NAS / Portable 版本的存档仍保存在 `data/ato-campaign-<账号>.json`；备份统一放在 `data/backups/<账号>/` 下：

- `daily/<战役档案>/<Cycle>/day-<游戏日>/`：往日永久归档。
- `recent/<战役档案>/<Cycle>/day-<游戏日>/`：当前游戏日最近 10 份滚动备份。

## 目录结构

```text
api/          PHP 后端接口
map/          地图与标签工具
record/       阿尔戈号记录表
story/        故事模块前端
technology/   科技与装备相关页面
tools/        数据整理、审计和辅助脚本
asset-studio/ 独立的素材拍摄、导入、分享与安装 WebUI
```

`story/storybook-placeholder.js` 是可以随源码公开的占位故事书。它保留
ATO-Local 0.2.11 的书册、章节、条目和战斗导航结构，但所有正文均为
“请扫描故事书或看实体书”，不含故事原文、扫描图、音频或 OCR 数据；
战斗条目的 AIBP 跳转按键仍可使用。本地存在
`story/data/storybook-data.js` 时，页面会自动使用完整数据覆盖占位版。

## 本地运行

### 一键启动

- macOS：双击仓库根目录的 `start-macos.command`
- Windows：双击仓库根目录的 `start-windows.bat`

脚本优先使用本机 PHP 8.1 或更高版本。macOS 和 Windows 都会检查 `ATO_PHP_BIN`、PATH、当前 Conda 环境、Anaconda/Miniconda/Miniforge/Mambaforge 下任意名称的环境，以及平台常见 PHP 安装位置；每个候选都会实际验证版本。若未找到 PHP，才会使用已安装的 Docker Desktop 启动并打开浏览器。Docker 首次运行需要联网下载 PHP 镜像。本体脚本与 `asset-studio/` 里的素材库脚本互相独立。

如果 PHP 安装在非标准位置，可先设置环境变量 `ATO_PHP_BIN` 为 `php` 或 `php.exe` 的完整路径。该方法在两套系统上都适用。

### 使用 PHP 内置服务器

```powershell
php -S 0.0.0.0:8793 -t .
```

然后打开：

```text
http://127.0.0.1:8793/
```

需要使用第二屏幕时，在主控台“用户与存档”中开启第二屏幕。在同一局域网设备打开显示的短网址（路径为 `/ss/`）即可。第二屏幕直接复用地图模块的显示逻辑并自动同步；关闭开关后立即不可访问。NAS 与反向代理部署会沿用当前访问主控台的域名、端口和子路径。

第二屏幕的显示大小按模块独立保存。主控台可分别调整地图和决战版图的显示大小，互不覆盖。在 AIBP 点击并确认“开启新战役”后，第二屏幕切换到决战版图大图模式：右侧显示 80:100 的版图占位图，左侧同步 Boss 大卡、惯常、标志、Trait/特殊卡、当前 AI/BP、卡背顺序、弃牌数和损伤；在战利品计算中成功添加到记录表后，第二屏幕恢复地图。切换或聚焦页面不会改变第二屏幕。

### 使用 Docker Compose

```powershell
docker compose up -d
```

默认访问：

```text
http://127.0.0.1:11451/
```

## 本地数据

公开仓库不会包含以下内容：

- 图片、卡图、地图图像和其他素材文件
- 故事正文数据
- 音频文件和语音生成产物
- 私人战役存档、PHP 运行日志和临时文件

如果你在本地拥有这些文件，可以按原目录放回工作区；页面会在本地读取它们，但它们不会进入 Git 提交。

维护者需要从指定版本 APK 重新同步占位结构时，可运行：

```text
python3 tools/build_storybook_placeholder.py <APK 文件> story/storybook-placeholder.js
```

这只是维护时的生成命令，普通用户运行页面不需要 APK。

## 本地导出工具

本地导出工具不会自动上传成品。所有成品统一写入根目录的 `export/`；该目录已被 Git 完整忽略，不会提交 APK、ZIP 或中间文件。目录不存在时，工具会自动创建。推送 `v*` 标签时，GitHub Actions 会构建 Android APK，以及 Windows x64、macOS Apple Silicon、macOS Intel 三个 Portable ZIP，并附加到同一个 GitHub Release。

### 环境要求

- 本机需要 Python 3.9 或更高版本。
- 第一次构建需要联网；下载的构建组件会缓存在 `tools/.packaging-cache/`，后续构建会复用。
- Android 工具会优先使用本机已有的 Java 17+、Gradle 和 Android SDK，缺少时自动下载。
- Portable 工具不依赖本机 PHP，会自动下载并封装目标平台对应的自包含 PHP。
- Docker ZIP 的构建不要求本机安装 Docker，但运行该成品需要 Docker Desktop 或 Docker Engine + Compose。

### 生成 Android APK

```text
python3 tools/export_android.py --version 1.0.0
```

输出：`export/ATO-Assistant-1.0.0.apk`。

APK 内置站点程序和公开占位数据，但不打包图片、音频、视频、字体、PDF 或其他本地素材，通过 Android WebView 独立运行，不需要 PHP 或网络服务器。战役存档写入应用私有空间；每次连续处于某个主控制台游戏日时永久保留 1 份归档，当前游戏日滚动保留最近 10 份备份。游戏日发生跳转后再次回到同一天时会新建归档，不覆盖此前记录。APK 使用本地调试签名，适合直接安装；Android 若阻止安装，需要在系统设置中允许当前文件管理器或浏览器安装未知来源应用。

Android 版内置 `asset-studio` 固定实体名单的轻量索引（不含图片），可在“用户与存档”中选择 `.atopack` 导入名单内的卡图、校对后的故事和人物小传索引。导入内容经过名单映射、路径与 SHA-256 校验后保存在应用私有空间，并优先于 APK 内置占位内容加载；多次导入的故事册会按循环合并。卸载应用会同时删除这些已导入资源。

首次运行可能自动下载 JDK 17、Gradle、Android SDK 命令行工具及构建组件。运行该工具即表示接受这些组件各自的许可条款。

### 生成全部 Portable 包

```text
python3 tools/export_portable.py --version 1.0.0
```

默认生成：

- `ATO-Assistant-Portable-1.0.0-windows-x64.zip`
- `ATO-Assistant-Portable-1.0.0-macos-arm64.zip`（Apple Silicon）
- `ATO-Assistant-Portable-1.0.0-macos-x64.zip`（Intel）
- `ATO-Assistant-Docker-1.0.0.zip`

如只需部分目标，可重复指定 `--target`：

```text
python3 tools/export_portable.py --version 1.0.0 --target windows-x64
python3 tools/export_portable.py --version 1.0.0 --target macos-arm64
python3 tools/export_portable.py --version 1.0.0 --target macos-x64
python3 tools/export_portable.py --version 1.0.0 --target docker
python3 tools/export_portable.py --version 1.0.0 --target windows-x64 --target docker
```

### 运行导出成品

- Windows：完整解压 ZIP，双击 `start-ato-portable.bat`。
- macOS：完整解压 ZIP，双击 `start-ato-portable.command`。若系统阻止未签名脚本，可在 Finder 中右键选择“打开”。
- Docker：完整解压 ZIP，在目录中运行 `docker compose up -d --build`。

Windows 和 macOS 包已封装 PHP 及其运行依赖，不要求用户安装 PHP、Node.js、Python 或仓库中的开发工具。启动后浏览器会打开 `http://127.0.0.1:8793/`。

### 发布 Portable Release

推送 `v*` 标签后，`.github/workflows/portable-release.yml` 会自动生成并发布三个桌面 ZIP 及各自的 SHA-256 文件。也可以在 GitHub Actions 中手动运行该工作流并填写版本号。

本地可先构建校验；加入 `-Publish` 后会通过 GitHub CLI 创建或更新对应 Release：

```powershell
./tools/release_portable.ps1 -Version 1.2.0 -AllowDirty
./tools/release_portable.ps1 -Version 1.2.0 -Publish
```

### 导出内容规则

所有目标在打包前后都会执行内容审计：

- 不包含任意层级的 `tools` 目录、Git 元数据、开发配置或旧导出文件。
- 不复制任意层级现有的 `data` 内容，包括私人战役存档和本地完整故事数据。
- Windows、macOS 和 Docker 成品从空的 `data` 目录开始；之后产生的存档保留在成品目录内。
- Android 不包含 `data` 目录，存档保存在 Android 应用私有空间。
- 本地导出的 APK/ZIP 位于 `export/`，不会被 Git 追踪；只有 release 脚本的 `-Publish` 参数和 GitHub Release 工作流会上传成品。

## ATO 素材库 WebUI

仓库中的 `asset-studio/` 是一个独立工具，不会嵌入或改写 ATO_assistant
业务页面。它内置根据 ATO Local 0.2.11、修正版超时神谕 AI 卡及本地补充素材整理的 2738 项固定实体素材清单，
普通用户不需要提供或解析 APK。

素材库可以用电脑管理本地资料，也可以让同一局域网中的手机扫码后逐张拍照。
拍摄提示会显示循环、模块、实体名称、原始编号以及当前要拍的正反面；通用标记、
资源图标、地图标记、状态卡、英雄、盟友、神形和宁芙均使用可辨认的详细名称。
使徒 BP 卡还会提示击破部位后可获得的资源。

启动素材库：

- macOS：双击 `asset-studio/start-macos.command`
- Windows：双击 `asset-studio/start-windows.bat`

拍摄完成后，在电脑端打开“分享与安装”：

1. 在“原项目位置”中填写 ATO_assistant 根目录并保存。
2. 点击“预览自动安装”检查新增、相同和冲突文件。
3. 如需覆盖旧文件，勾选对应冲突项。
4. 点击“安装新增与已选替换”。被替换的文件会先备份，未勾选的同名文件默认保留。

也可以生成兼容 ZIP，或通过 `.atopack` 与朋友分享已拍卡图、校对后的故事和人物小传索引。
`.atopack`、本地资料库、预览图和用户素材均已排除在 Git 提交之外。资料包恢复时不会批量生成数千张预览图；预览会在首次查看对应图片时按需生成。

完整使用说明见 [`asset-studio/README.md`](asset-studio/README.md)。


## 说明

本项目是个人战役管理工具，不包含官方游戏素材授权。源码可以公开协作，但使用者需要自行确保本地素材、故事文本和音频文件的来源与使用方式符合相关授权要求。
