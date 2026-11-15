# ATO Assistant

**中文** | [English](README.en.md)

《Aeon Trespass: Odyssey》的本地战役助手。玩家可以在主控台管理战役进度，打开战斗工具（AIBP）、故事书、地图、阿尔戈号记录表和军械库。

## 安装

从 [GitHub Releases](https://github.com/banard2049-cpu/ATO_assistant/releases) 下载适合你的安装包。

| 平台 | 安装方式 |
| --- | --- |
| Windows | 下载 `ATO-Assistant-Portable-<版本>-windows-x64.zip`，完整解压后双击 `start-ato-portable.bat`。 |
| macOS | Apple Silicon 下载 `macos-arm64.zip`，Intel 下载 `macos-x64.zip`。完整解压后双击 `start-ato-portable.command`。如果系统阻止打开，右键选择「打开」。 |
| Android | 下载并安装 `ATO-Assistant-<版本>.apk`。如系统提示，允许当前浏览器或文件管理器安装未知来源的应用。 |

### Docker / NAS

在安装目录运行以下命令。需要 Docker Compose v2.17 或更高版本。

```bash
curl -fsSL https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/install-docker.sh | bash
```

在浏览器打开 `http://服务器IP:8793/`。旧版 Compose 和其它部署方式见 [Docker 安装说明](tools/packaging/docker/README.txt)。

## 导入资料包

卡图、音乐和完整故事正文由 `.atopack` 资料包提供。

- **Android** 在主控台点「从 .atopack 导入资源」，选择对应文件。
- **Windows / macOS** 用解压工具打开 `.atopack`（也可以先改名为 `.zip`），把解出的资源目录合并到便携版根目录，然后刷新页面。
- **Docker / NAS** 同样解压后，把资源目录合并到宿主机安装目录的 `app/`，然后刷新页面。

## 开始游玩

1. 首次打开时注册一个本地账号，然后登录。可在主控台切换界面语言。
2. 选择战役和循环，按主控台上的流程游玩。接续已有战役时，使用「导入存档」载入 ATO 助手的 `.json` 备份或官方 App 的 `.jsave`。
3. 需要另一台设备显示战斗时，在主控台开启「第二屏幕」，再用同一局域网内的设备打开显示的网址。

## 更新与备份

更新或迁移前，在主控台点「导出存档」。便携版和 Docker 的本地存档位于安装目录的 `data/`。

- **便携版** 登录后，在本机主控台点「检查更新」，再点「一键更新」。
- **Android** 从发布页下载新版 APK 并覆盖安装。
- **Docker / NAS** 在安装目录执行 `docker compose pull && docker compose up -d`。

## 许可

程序代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE)。游戏素材和第三方组件适用各自的许可。
