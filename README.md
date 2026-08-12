# ATO_assistant

ATO_assistant 是一个为ATO战役流程准备的本地 Web 工具。它把每日流程、故事查阅、地图标记、阿尔戈号记录表和科技/装备辅助功能放在同一个入口里，方便游玩时快速记录、同步和回看状态。

这个仓库只发布工具源码和少量允许公开的配置/辅助数据；图片、音频、完整故事文本、官方素材、个人存档和运行日志不会随仓库上传。

## 功能

- 战役主控台：按天推进战役流程，记录今日事项、日期轨和战役笔记。
- 故事模块：提供故事入口和阅读界面。
- 地图模块：管理地图格、标记和标签，支持本地编辑标签配置。
- 阿尔戈号记录表：集中记录战役资源、状态和相关表格信息。
- 科技模块：浏览科技内容，并提供装备部件、装备制造。
- 账号与存档：通过 PHP API 保存用户状态、地图标签和装备部件数据。

## 目录结构

```text
api/          PHP 后端接口
map/          地图与标签工具
record/       阿尔戈号记录表
story/        故事模块前端
technology/   科技与装备相关页面
tools/        数据整理、审计和辅助脚本
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
php -S 127.0.0.1:8793 -t .
```

然后打开：

```text
http://127.0.0.1:8793/
```

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


## 说明

本项目是个人战役管理工具，不包含官方游戏素材授权。源码可以公开协作，但使用者需要自行确保本地素材、故事文本和音频文件的来源与使用方式符合相关授权要求。
