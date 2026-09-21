# .atopack 打包（民间版 / 官方版）

两个命令行打包器，共用一份引擎（`asset-studio/tools/build_fan_pack.py` 里的写入、校验、
原子改名只有一份实现）：

| 脚本 | 版本口径 | 故事书 js | 官方资料 |
| --- | --- | --- | --- |
| `build_fan_pack.py` | **民间版** | 工程里的民间正文 `story/data/storybook-data.js` | 默认只带官方故事书正文数据，不带原书扫描图 |
| `build_official_pack.py` | **官方版** | 用官方数据生成，**只留官方正文** | 官方正文数据 + **原书扫描图默认一起打包** |

两个脚本都以 **ATO_assistant 工程目录（`--ato-root`）为素材真源**，口径照提交里的
`asset-studio/app/packages.py` 的 `export_package`（素材库界面导出、出
`ATO-Assistant-Resources-*.atopack` 的那条路径）。

## 为什么素材真源是工程目录，不是素材库

打包的目标路径本来就写着工程相对路径（`aibp/ps/HEKATON/HEKATON_BP_I_001.jpg` 这种），
工程目录里的图就是你平时维护、修正过的那一份。实测（2026-09-19）：

| 来源 | 4298 个清单面（去掉 19 个 BGM 目标 = 4279 张图） |
| --- | --- |
| 工程目录 | **4279 张全在** |
| 素材库 | 缺 6 张（5 个循环图标 + C1 探索卡 8201）；另有 **59 张与工程目录字节不同**（工程版是修正后的） |

素材库只在工程里缺图时兜底（`--library`）。

## 民间版

```bash
python asset-studio/tools/build_fan_pack.py \
  --ato-root D:\desktop\ATO_assistant \
  --output  export\ATO-Assistant-Resources-2026-09-19.atopack
```

从 `--ato-root` 读：

| 内容 | 工程里的位置 |
| --- | --- |
| 卡图等素材 | 按清单目标路径，例如 `aibp/ps/…`、`map/tokens/…`、`ss/terrain/…` |
| 故事正文 | `story/data/storybook-data.js`（`window.STORYBOOK_DATA`，7 本 / 4552 段） |
| 人物小传 | `story/data/entity-index.json`（或 `.js`，595 条） |
| 官方故事书正文数据 | `story/data/storybook-official-data.js` — **默认进包**（格式版本 3） |
| 官方版原书截图 | `story/data/ato-storybook-key-scans/*` — 只有 `--include-official-scans` 才进包 |
| 主控台背景音乐 | `assets/bgm/*.mp3|ogg`（19 首，走 `bgmFiles` 段） |
| 清单 | 源码里的固定清单 `app/fixed_catalog.py`（2776 个条目 / 4298 个面） |

常用参数：`--dry-run`（只统计）、`--library`（兜底）、`--official-assets`（图片优先取
官中覆盖图，默认不读）、`--include-official-scans`、`--no-official-story`、
`--no-story-data`、`--no-bgm`、`--cycle` / `--module` / `--complete-only`、
`--verify full`、`--json`。`--complete-only` 不看 BGM 条目。

## 官方版

```bash
python asset-studio/tools/build_official_pack.py \
  --ato-root D:\desktop\ATO_assistant \
  --output  export\ATOassets-官方版.atopack
```

三条口径，都是"官方优先、缺了保留原样"：

1. **图片**：`--ato-root/official-assets/` 里有的目标用官中覆盖图替换，没有的原样保留工程
   目录里那份（`official-assets/` 支持镜像完整项目路径、只留资源目录、后缀不一致，
   规则见 `app/official_assets.py`）。实测 4279 张里 **1708 张被官中图替换**、
   2571 张保留工程原图。加 `--no-official-assets` 可关掉替换。
   目录归属：官中目录名要与目标的一段目录同名（`HEKATON/` ← `aibp/ps/HEKATON/`），
   `terrain-cards/` 则显式归 `ss/terrain-cards/`——地形**卡**（提示卡）与同名的地形
   **板块** `ss/terrain/<name>.jpg` 是两种卡面，只按文件名兜底会把板块图换成卡图。
2. **故事书 js**：`story/data/storybook-data.js` 由 `story/data/storybook-official-data.js`
   生成——条目 `id`/`key` 与官方数据一致，标题与正文一律取 `officialTitle` /
   `officialText`，**没有官方正文的条目直接不要**（实测丢掉 53 条），官方数据里独有的
   条目补进来（3 条）；章节、order、links 等骨架元数据仍取民间版，保证故事页的章节树和
   排序正常。**民间正文一个字都不进包**。加 `--story-source project` 可以改回民间正文。
3. **官方故事书图**：`story/data/ato-storybook-key-scans/*` 原书扫描图**默认全部打包**
   （实测 2195 张，约 0.79 GiB），与官方正文数据一起写进 `resourceFiles` 段；缺一张就停下
   报错，不会打出一个坏包。加 `--no-official-scans` 只带正文数据。

官方版不加任何东西也是格式版本 3，因为 `resourceFiles` 非空（与
`app/official_resources.add_to_archive` 的规则一致）。

实测规模（2026-09-19，官方版）：6499 个成员 / 4279 张图 / 2195 段官方正文 /
2196 个官方资料（正文数据 + 2195 张原书图）/ 19 首 BGM，约 4.12 GiB。

## 唯一比原路径强的地方：不会留下打不开的包

原来的导出**直接往最终文件写 ZIP**：中途被打断（关掉工具、进程被杀、磁盘写满、下载被掐）
留下的就是一个没有中央目录的半成品——文件头是 `PK\x03\x04`，但谁都打不开，
`zipfile` 只会报 `BadZipFile: File is not a zip file`。
`export/ATO-Assistant-Resources-2026-09-19.atopack`（316 MB）就是这么来的。

两个打包器的规矩只有一条：**最终文件名上只可能出现完整、已校验的包**。

1. 先写 `<输出>.partial`；
2. 关文件 → 刷盘（`fsync`）；
3. **校验**（能打开、成员齐全、大小一致、声明的哈希抽样比对、官方资料与 BGM 齐备）；
4. 通过之后才原子改名成 `.atopack`（Windows 上被杀毒/索引器占用时自动重试）。

任何一步失败，最终路径上都不会出现文件，半成品留在 `.partial` 供排查。

## 包内结构

* `manifest.json`：`items`（2776）、`assets`、`stories`、`storyFiles`（人物小传）、
  `progress`、`bgmFiles`（19）、`resourceFiles`（官方资料）；`build.edition` 标着
  `fan` / `official`。
* 图片成员按清单目标保留工程相对路径，解压即可直接拖进项目。
* 额外多落一份 `story/data/storybook-data.js`、`story/data/entity-index.json`、
  `story/data/entity-index.js`，让"解压 → 拖入"这条流程也能拿到故事数据；
  读取方（素材库导入、Android 导入）只认清单里声明的成员，会忽略这几个额外的。
* 官方版会把 `story/data/storybook-official-data.js` 与原书扫描图也放进包内对应路径。

## 打完包怎么自查

1. 工具自己的校验：改名前的 `sample`/`full` 会在输出里写明比对了多少个哈希。
2. 用 `tools/check_pack.py` 再看一眼（也适用于别人给的、或旧路径留下的包）：

   ```bash
   python asset-studio/tools/check_pack.py export\ATOassets-官方版.atopack
   python asset-studio/tools/check_pack.py 包.atopack --crc --hash   # 逐个成员校验 CRC 与 SHA-256
   ```

   它会明确说出"包是完整的"还是"找不到中央目录（EOCD）：这是个半成品"。
3. 安卓端导入前先对一遍内置名单：安卓只认 APK 里 `assets/atopack-catalog.json` 声明的
   `itemId/face → 路径`，对不上就整包拒绝。`tmp/android_import_check.py` 可以对着任何 APK
   名单复核（见「安卓导入要求」）。
4. 用素材库界面的「分享与安装」选择它，先看导入预览（不改素材库）。

## 安卓导入要求

* **APK 必须是 1.4.1 或更新**（内置名单 4298 个目标 = 当前清单的全部分面）。1.4.0 不认
  「逆行动量」，更早的版本不认 C2 探索卡 13642，1.3.2 以前的 APK 连格式版本 3 都不支持
  （`PACKAGE_VERSION = 3` 从 1.3.2-rc.4 起）。
* 安卓导入是先把整个包拷进 App 缓存、再把每个 blob 落到内部存储，**需要约 2× 包大小的
  可用空间**（官方版 4.12 GiB → 准备 ~8.5 GiB；民间版 2.76 GiB → 准备 ~5.5 GiB）。
  空间紧可以用 `--compress deflate`（包体小一点，解压后大小不变）。
* 单文件上限：图片/官方资料 128 MB、BGM 32 MB、BGM 最多 128 个、资源最多 20000 条。
  打包器会在写盘前先卡这些上限。

## 常见情况

**报"某个面在工程目录里找不到文件"。** 工程里缺这张图。补齐即可；如果图在素材库里，
加 `--library` 让它兜底（工具会说明有几张走了兜底），或临时 `--skip-missing` 跳过。

**官方版报"官方截图缺失或路径无效"。** `storybook-official-data.js` 里声明的扫描图必须
齐全，缺一张就停下——这是提交里的校验规则（`app/official_resources.collect`），
不想打包扫描图就加 `--no-official-scans`。

**官方版的故事条目数比民间版少。** 正常：官方数据只覆盖 C1–C3，且只保留有官方正文的条目
（另有 3 条官方独有条目会补进来）。

**`export/` 目录写不进去。** 某些受限环境（沙箱）会拦这个目录；换个输出目录，或先写到
`tmp/` 再自己搬到 `export/`。

**`--force` 覆盖时提示文件被占用。** Windows 上杀毒/索引器会短暂占住刚写完的 ZIP，工具会
自动重试改名；真失败时会明确告诉你"包已经写好并校验通过，留在 `.partial`"。

## 和其它打包入口的关系

| 入口 | 用途 |
| --- | --- |
| `build_fan_pack.py` | **民间版分发包**：工程素材 + 民间正文 + 官方故事书正文数据 |
| `build_official_pack.py` | **官方版分发包**：官中图优先替换 + 只留官方正文 + 原书扫描图 |
| `check_pack.py` | 检查任意 `.atopack` 是否完整、是什么口径 |
| 素材库界面导出 / `app.packages` | 素材库自己的导出（含兼容 ZIP），可显式勾选官方版选项 |
| `build_full_pack.py` / `update_full_pack.py` | 旧版完整包构建，需要 APK 或旧包作基础，见 [官方故事书资料打包](OFFICIAL-STORY-PACKING.md) |
