# .atopack 打包（民间版 / 官方版）

## 固定分发流程（2026-10-26 起）

以后统一运行三包入口；版本号显式传入，避免本地程序版本与资料包版本不同步：

```powershell
python asset-studio/tools/build_release_packs.py --ato-root . --version 3.8.13 --date 2026-10-26
```

按顺序输出到 `export/`（可用 `--output-dir` 指定）：

| 文件 | 地图正面蒙版 | 其他资源口径 |
| --- | --- | --- |
| `ATOassets-民间版-分层地图-q85-<日期>-v<版本>.atopack` | 旧版 PNG | 民间图片与正文、官方正文数据 |
| `ATOassets-官方版-分层地图-q85-<日期>-v<版本>.atopack` | 旧版 PNG | 官中图优先、官方正文及原书扫描图 |
| `ATOassets-民间版-新版蒙版-分层地图-q85-<日期>-v<版本>.atopack` | 当前新版 SVG | 与第一份相同的民间资源口径 |
| `ATOassets-民间版-新版蒙版-分层地图-q85-<日期>-v<版本>.zip` | 内含第三份 `.atopack` | 额外压缩层，密码固定为 **`20`** |

旧版正面蒙版固定取自工程内
`official-assets/_backups/map-links-20261025/originals/map/images/hd1024/overlay/`，
共 511 张 PNG。新版取当前地图索引注册的 SVG。**版本选择只影响正面 overlay**；
底图与卡背仍取当前注册资源，两种版本均保留当前卡背的 SVG 与特殊 PNG。
包内 `build.mapMaskVersion` 标记 `legacy` 或 `current`，`build.edition` 标记民间／官方。

三份统一使用 Q85 和 `pack-shrink-keep.txt`，`map/*` 始终豁免重编码；均先写 `.partial`，
逐项校验完整 SHA-256 后才原子改名。新版民间包使用本轮旧版民间包做增量基础，
其他素材仍取当前工程内容。可加 `--incremental-fan <上次民间包>` 和
`--incremental-official <上次官方包>` 加快前两份构建，编码口径不同会自动全量重建。
另保存 `ATOassets-三包构建-<日期>-v<版本>.json` 记录三包口径、体积、校验及加密层摘要。

加密层使用本机 **Info-ZIP `zip` / `unzip`**（从 PATH 或 `zip` 同目录查找；也可传
`--zip-tool` / `--unzip-tool`）。ZIP 写完后用密码 `20` 原生解密，逐块比对第三份
`.atopack` 的完整 SHA-256，确认一致后才发布到最终本地路径。为兼容旧 Windows
压缩工具，ZIP 内 `.atopack` 使用 ASCII 名称 `ATOassets-fan-current-q85-<日期>-v<版本>.atopack`；
内容与第三份包完全相同。

可用 `--current-name` 单独指定新版蒙版包与密码 ZIP 的文件名主体，旧版民间／官方包的命名不变。
例如 3.9.0 的测试分发：

```powershell
python asset-studio/tools/build_release_packs.py --ato-root . --version 3.9.0 --date 2026-10-27 --current-name "测试用请勿下载"
```

新版输出为 `测试用请勿下载.atopack` 和 `测试用请勿下载.zip`，ZIP 密码仍为 `20`。
未传此参数时继续使用上表默认名称；包内 ASCII 文件名仍包含日期与版本。

Android 需使用包含本次蒙版兼容改动重新构建的 APK，支持导入以上三种 **`.atopack`**。
新版民间 ZIP 先使用密码 `20` 解压，再在
安卓内选择解出的 `.atopack`。地图渲染同时接受旧 PNG 与新 SVG，并支持来回切换资源包。
外层 ZIP 作为分发压缩层，不直接交给安卓导入器。

中断后可加 `--resume`：核对已有包的版本口径与完整哈希后继续未完成步骤；它复用已有
完整文件，如需重新读取已变更的工程素材，请加 `--force` 重建。`--dry-run` 只做三包统计。

## 单包入口

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
| 主控台界面图标 | `assets/icons/*.svg`（字形，走 `iconFiles` 段） |
| 密语字形 | `story/assets/cryptic/glyphs/*.png`（巴别语 58 + 塞壬语 26，走 `crypticFiles` 段） |
| 清单 | 源码里的固定清单 `app/fixed_catalog.py`（2776 个条目 / 4298 个面，另加 BGM 与密语字形条目） |

常用参数：`--dry-run`（只统计）、`--library`（兜底）、`--official-assets`（图片优先取
官中覆盖图，默认不读）、`--include-official-scans`、`--no-official-story`、
`--no-story-data`、`--no-bgm`、`--no-icons`、`--no-cryptic`、`--cycle` / `--module` /
`--complete-only`、`--verify full`、`--json`。`--complete-only` 不看 BGM 条目。

密语字形只写入 `crypticFiles`，不进入普通 `assets`，每个字形在 ZIP 中只有一个成员，
且不受 `--image-quality` 重编码影响。`--no-cryptic` 完全排除字形，不要求本地存在 PNG；
素材库的“包含密语字形”勾选框和完整资料包构建／更新工具遵循同一规则。

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
   `officialText`，**没有官方正文的条目直接不要**（2026-10-06 实测丢掉 21 条：C1–C3 5 条、
   C4/C5 各 8 条只有标题的「回忆突破」条目），官方数据里独有的条目补进来（3 条）；
   章节、order、links 等骨架元数据仍取民间版，保证故事页的章节树和排序正常。
   **民间正文一个字都不进包**。加 `--story-source project` 可以改回民间正文。
3. **官方故事书图**：`story/data/ato-storybook-key-scans/*` 原书扫描图**默认全部打包**
   （实测 2195 张，约 0.79 GiB），与官方正文数据一起写进 `resourceFiles` 段；缺一张就停下
   报错，不会打出一个坏包。加 `--no-official-scans` 只带正文数据。

官方版不加任何东西也是格式版本 3，因为 `resourceFiles` 非空（与
`app/official_resources.add_to_archive` 的规则一致）。

实测规模（2026-09-19，官方版）：6499 个成员 / 4279 张图 / 2195 段官方正文 /
2196 个官方资料（正文数据 + 2195 张原书图）/ 19 首 BGM，约 4.12 GiB。
（2026-10-06 官方正文并入 C4/C5 后重跑 `--dry-run`：7059 个成员 / 4288 张图 /
**4202 段**官方正文 / 2196 个官方资料 / 4.50 GiB；差值还含这期间新加的素材与图标。）

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
  `progress`、`bgmFiles`（19）、`iconFiles`（界面图标）、`crypticFiles`（密语字形）、
  `resourceFiles`（官方资料）；`build.edition` 标着 `fan` / `official`。
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

### 2026-10-24 矢量地图资源

新版蒙版包按当前注册表读取 511 张正面 SVG 叠加图、344 张普通牌背 SVG 和 160 张 C5 卡背 SVG。
自 2026-10-26 起，普通民间／官方单包 CLI 默认 `--map-mask-version legacy`，使用指定备份
的 511 张正面 PNG；额外新版民间包显式使用 `--map-mask-version current`。
底图与 7 张特殊牌背的 PNG 仍原样保存，两种版本的完整包均包含
1535 个地图文件。SVG 的 MIME 为 `image/svg+xml`，不参与图片重编码。
素材库导入、安装、再次导出及 Android 导入同步支持新路径，并继续接受旧 PNG 包。
Android 必须先更新到 v3.8.13，再导入本次资源包；新 APK 的白名单同时包含两代路径。

### 2026-10-19 AI / BP 共享牌背

当前 `aibp/card-backs.json` 将 669 张 AI / BP 卡映射到 145 个牌背文件；普通 AI III 与
特殊 AI III 分开对应，Dragon of Phobos 的 18 张独立 BP 效果背面继续单独保留。
包内每个共享目标只写一次，`assets` 保留各卡的 `itemId/face` 关联。90 张已调色牌背
直接使用工程 JPG，Q85 豁免名单覆盖 AI / BP 的 `*_BACK.jpg`，不再重编码。

请先更新到包含这份 mapping 的 APK / 程序，再导入本次重打的资源包。mapping 与导入
逻辑随程序分发，单独导入 `.atopack` 不会更新旧 APK 的名单。新版 Android 会清理已退役
编号牌背及其预览索引；导入旧包时跳过这些背面，正面与其他有效资源仍可导入。旧包无法
补齐新的共享背面，需要导入新版包。已知调色前的共享背面也会跳过，避免覆盖修正图。

Android 与 Asset Studio 均拒绝同一个共享目标声明不同 SHA-256 的资料包。Asset Studio
安装共享背面时只写一个目标文件，并保留原 JPG 字节；缩略图按当前原图单独生成。

### 2026-10-17 分层地图

新包增加可选的 `mapFiles` 段，保留格式版本 3 和原有地图条目 ID。当前完整包包含
1384 张原样 PNG：511 张正面底图、511 张合并图标蒙版、4 张 C1–C4 共用卡背底图、
277 张 C1–C3 编号图和特殊原图、81 张 C4 编号／派系／方向合并蒙版。C5 上浮、下潜按钮也随包分发。
由图层替代的 862 张旧整面扫描图不再重复打入新包；旧资源包仍可导入新版程序。

C4 的 81 张完整牌背约 105.7 MB；共用底图与蒙版约 11.0 MB，资源包减少约 89.6%。
各方向缺失状态保留；上下箭头按原图实际轮廓提取，所有牌框按自身图标框定位，
左右尖角的两条斜边分别从原图测量，不使用固定斜角，不套用统一位移或扩大到周边圆环。
背景保持 65% 亮度，编号与派系标记保持原亮度。

这些 PNG 按原文件字节保存，不受 `--image-quality` 重编码影响。Asset Studio 支持
图层的预览计数、哈希校验、冲突选择、导入、安装和再次导出；命令行完整包与更新包
使用同一组图层规则。地图注册表与渲染脚本属于程序代码，随 APK / Docker 镜像更新，
不放进资源包。Docker 的 `map/images` 递归挂载已包含所有新图层目录。

Q85 打包时使用 `--image-quality 85 --image-quality-keep-file asset-studio/pack-shrink-keep.txt`。
该名单现已覆盖整个 `map/*`，包括仍走普通素材段的 C4 卡背和 C5 切换按钮；原有
决战板图、使徒大图与 AI / BP 牌背豁免规则继续保留。仅其他符合收益条件的图片进行重编码，不缩放分辨率。

**使用新分层资源包前，必须更新到包含 `mapFiles` 支持的 APK / 程序。** 旧 APK 会
忽略这一可选字段，无法显示新包里只用图层保存的地图。新版仍识别旧整图资源包，
地图条目 ID 和存档引用保持兼容。

### 其他导入要求

* 2026-10-11 的包统一使用 `ss/battle-board/battle-board.jpg`，并在 `cardPreviewFiles`
  中分发 AIBP 小图。新版 APK 导入器兼容旧版图路径，但旧 APK 不会自动获得预览图和新
  清单支持；请先安装同步构建的 APK。连招按钮、语言显示等程序改动也需要更新应用，
  `.atopack` 仅更新资源。
* Asset Studio 需使用同步更新的版本：约定目录下的 `.bin` 素材按哈希校验并原样安装，
  不走图片解码或缩略图生成。旧导入器会把二进制素材当图片，导致整包导入失败。
  安装时同步生成卡牌和版图预览；民间包只带官方正文时，不要求补齐未打包的原书扫描图。
* 2026-10-10 补录的 Boss 等级属性反面、PNG 特性卡底和
  18 个加密素材已加入打包清单、素材库目录与 APK 导入名单。APK 必须从更新后的清单
  重新构建，已有 APK 的内置名单不会随导入资料包自动更新。C4/C5 状态卡仍不分发；
  PSD 留作工程编辑源，不进入运行时资料包或 APK。
* **APK 必须是 1.4.1 或更新**（内置名单 = 当前清单的全部分面）。1.4.0 不认
  「逆行动量」，更早的版本不认 C2 探索卡 13642，1.3.2 以前的 APK 连格式版本 3 都不支持
  （`PACKAGE_VERSION = 3` 从 1.3.2-rc.4 起）。
* **清单外的补充素材**（约定目录下的二进制素材）：内置清单不含它们，所以
  1. **必须重新打 APK**才会带上——APK 名单由 `tools/export_android.py` 的
     `asset_studio_catalog()` 生成，它已并上 `collect_supplemental_resources()`；
     发布构建使用随代码提交的 `catalog.json` 路径名单，不需要上传 `.bin` 内容。
    旧 APK 的名单里没有这些目标，导入时整项被静默跳过。
  2. 打包侧与安装侧的类型白名单已同步放行（`INSTALL_DATA_PREFIX` 限制在约定目录下），
     但仍只认图片 / `assets/bgm/` 音频 / `assets/icons/` 下的 SVG / 该目录下的二进制素材，
     别的后缀一概拒绝。
* **`iconFiles` 段需要支持它的 APK**：主控台界面图标（`assets/icons/*.svg`）走的是
  Android 端 `AtopackStore` 里的同名分支，比它旧的 APK 读不到这一段（会当普通附加字段
  忽略），字形不会解包。桌面侧的素材库导入与安装不受影响。
* **`crypticFiles` 段同样需要支持它的 APK**：密语字形（`story/assets/cryptic/glyphs/*.png`）
  由 `AtopackStore` 的同名分支解包到 Web 根目录的 `story/assets/cryptic/glyphs/`
  （上限 256 张、单张 128KB、只认合规文件名的 `.png`）；旧 APK 会当附加字段忽略，
  故事侧栏的巴别语／塞壬语键盘就只剩碎图。APK 名单（`assets/atopack-catalog.json`）
  由 `asset_studio_catalog()` 生成时已包含这 84 张字形，无需重新上传素材。
* 安卓导入是先把整个包拷进 App 缓存、再把每个 blob 落到内部存储，**需要约 2× 包大小的
  可用空间**（官方版 4.12 GiB → 准备 ~8.5 GiB；民间版 2.76 GiB → 准备 ~5.5 GiB）。
  空间紧可以用 `--compress deflate`（包体小一点，解压后大小不变）。
* 单文件上限：图片/官方资料 128 MB、BGM 32 MB、图标 1 MB；BGM 最多 128 个、图标最多
  256 个、资源最多 20000 条。打包器会在写盘前先卡这些上限。

## 常见情况

**报"某个面在工程目录里找不到文件"。** 工程里缺这张图。补齐即可；如果图在素材库里，
加 `--library` 让它兜底（工具会说明有几张走了兜底），或临时 `--skip-missing` 跳过。

**官方版报"官方截图缺失或路径无效"。** `storybook-official-data.js` 里声明的扫描图必须
齐全，缺一张就停下——这是提交里的校验规则（`app/official_resources.collect`），
不想打包扫描图就加 `--no-official-scans`。

**官方版的故事条目数比民间版少。** 正常：官方数据里那些没有官方正文的条目在官方版里就是
不存在的（`build_official_story` 的 `dropped`）。官方正文自 2026-10-06 起覆盖 **C1–C5**，
所以现在只丢 21 条（C1–C3 5 条官方未覆盖/不在官方版，C4/C5 各 8 条只有标题的「回忆突破」
条目），另有 3 条官方独有条目会补进来。C4/C5 没有原书扫描图，官方版看这两个循环时第二屏会
提示没有原书页、只显示官方正文；包体里的 `resourceFiles` 仍只有 C1–C3 的 2195 张扫描图。

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
