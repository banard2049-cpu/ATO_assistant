# 背景音乐（BGM）

主控台里「用户与存档」下方的「背景音乐」面板由本目录的两个脚本提供：

- `manifest.js`：阶段 → 曲目清单（纯数据，可自由改）
- `bgm.js`：播放器（1 秒交叉淡入淡出、音量、跟随今日流程、手动锁定阶段）

面板只有三行：`音乐开关 / 阶段 / 音量`、`导入自选 BGM / 用在`、状态文字。**音乐关闭时只留那个开关**，阶段、音量、导入、曲目列表都会收起（状态行只在有重要提醒，例如脚本被浏览器缓存成旧版时，才会在关闭状态下露面）。

音频文件需要自行准备，直接放进本目录即可；仓库和发布包里都不含音频（`.ogg` / `.mp3` 已被 `.gitignore` 忽略）。

## 放文件

音频需要自行准备（仓库和发布包里都不含音频）。默认格式是 **`.mp3`**（各平台通用，含 Safari / iOS）；`.ogg` 也能用，两种后缀哪个在就用哪个。源码里的 19 首来自本地 `D:\desktop\mp3`，已用 ffmpeg 转成 `-q:a 2`（VBR ≈190 kbps）的 mp3。

### 一键安装（推荐）

音频已经放在本机某个目录时，用安装脚本按清单里的文件名复制（或转换后复制）进来：

```bat
tools\install-bgm.bat "D:\desktop\mp3"            :: 按清单文件名复制 .mp3/.ogg
tools\install-bgm.bat "D:\desktop\mp3" -Move      :: 移动而不是复制
tools\install-bgm.bat "D:\desktop\mp3" -DryRun    :: 只看会处理哪些文件
```

脚本会报告清单里有、源目录缺少的曲目（缺少的阶段会静默跳过）。等价的 PowerShell 写法：

```powershell
powershell -ExecutionPolicy Bypass -File tools\install-bgm.ps1 -Source D:\desktop\mp3
```

### 自己转换（需要 ffmpeg）

```bat
for %f in ("D:\desktop\mp3\*.ogg") do ffmpeg -y -i "%f" -map_metadata -1 -codec:a libmp3lame -q:a 2 "%~dpnf.mp3"
```

想压得更小可以把 `-q:a 2` 换成 `-b:a 128k`（全部 19 首约 32 MB，现在是约 53 MB）。

### 手动放文件

把音频按下面的文件名丢进 `assets/bgm/`，控制条就会自动识别；Docker / NAS 上请丢进 `assets/bgm/audio/`（见下面的「Docker / NAS 部署」）：

| 阶段 | 文件名 |
| --- | --- |
| 航行 · 时间表推进 / 休整 · 过场 | `LB_Bridge_Tholos_2.mp3` |
| 航行 · 紧迫（追猎、计时） | `LB_Argo_Rush_Theme.mp3` |
| 探索 | `LB_Exploration_Step.mp3` + 氛围 `XX_LB_Expedition_Step_Ambience.mp3` + 转场 `XX_LB_Expedition_Step_Anchor.mp3` |
| 考察 · 冒险出发 | `LB_Excursion_Propylon.mp3` |
| 冒险中枢 · 城邦 | `LB_Grand_Agora.mp3` |
| 遭遇 · 战斗 | `LB_Primordial_Encounter_Theme.mp3` |
| 战斗准备 · 军械库 | `LB_Armory.mp3` |
| 发展 · 打造与训练 | `LB_Crafting_and_Training.mp3` |
| 泰坦柱廊 | `LB_Titan_Stoa.mp3` |
| 故事 · 主线剧情 | `LB_Old_Priest_Theme.mp3` |
| 回忆突破 | `LB_Last_Academy_2.mp3` |
| 内蕴奥德赛 | `LB_Nymph_Addyton.mp3` |
| 法洛斯之梦 | `LB_Dreams_of_Pharos.mp3` |
| 灾祸 | `LB_Foreboding_Theme.mp3` |
| 低谷 · 失败剧情 | `LB_Forlorn_Naos.mp3` |
| 战斗结算 · 特殊后果 | `LB_Aftermath_2_nocrows.mp3` |
| 阿尔戈英雄寝园 · 终局 | `LB_Argonaut_Mausoleum.mp3` |

（同名的 `.ogg` 也可以，清单里每首都带 `.mp3` / `.ogg` 两个候选，先命中的生效。）

音频目录由 `manifest.js` 里的 `baseDir` 决定，**相对 `manifest.js` 自身所在的目录**解析（脚本加载时会记下自己的绝对路径），所以主控台 `/index.html`、story `/story/index.html`、第二屏幕等不同层级的页面都指向同一处；整个 `assets/bgm/` 目录搬家时不用改任何页面。

缺文件不会报错：控制条会提示缺少哪个文件，其它阶段照常播放。

### Docker / NAS 部署

容器里跑的是镜像自带的播放器（`bgm.js` + `manifest.js`），只有**音频**是从宿主机挂进去的，挂在 `app/assets/bgm/audio/`：

```text
<安装目录>/app/assets/bgm/audio/LB_Armory.mp3      ← 音频
<安装目录>/app/assets/bgm/bgm.js                   ← 镜像提供，宿主机上这份不生效
<安装目录>/app/assets/bgm/manifest.js              ← 同上
```

音频放这里的原因：`assets/bgm/` 一个目录里混着播放器代码和自备音频，如果整目录挂进容器，`docker compose pull` 就永远更新不到播放器（第二屏曾经就是这么坏掉的）。所以播放器留在镜像里，音频下沉一层。

- 播放器会先在 `assets/bgm/` 找，再去 `assets/bgm/audio/` 找，两处先命中的生效 —— 便携版 / Android / 桌面继续把音频放在 `assets/bgm/` 即可，不用改。
- 清单里 `audioDir` 控制这个回退目录（默认 `"./audio/"`，写 `""` 就只认本目录）。
- `tools/install-docker.sh` 每次执行都会把直接放在 `app/assets/bgm/` 下的音频搬进 `audio/`，不会丢文件。
- 想改阶段 / 文件名 / 淡入淡出，改的是容器里那份 `manifest.js`，所以要在宿主机覆盖它：在 `compose.yaml` 里加一行
  `- ./app/assets/bgm/manifest.js:/app/assets/bgm/manifest.js:ro`（默认不加，保持 `pull` 能更新它）。

**打包不带音频**：便携版 / Docker / APK 都会跳过 `assets/bgm/` 下的音频（规则见 `tools/packaging/package_common.py` 的 `is_bgm_media`，回归测试 `python tools/test_packaging_exclusions.py`），只带 `assets/bgm/*.js` 与本文档。音频通过素材库的资料包流程分发：

1. 素材库（`asset-studio/`）导出 `.atopack` 时勾选「包含主控台背景音乐」，音频写入包的 `bgmFiles` 段（`assets/bgm/` 里没有音频时用素材库里的副本）；
2. 导入资料包后由「分享与安装」落回 `assets/bgm/`；
3. Android 端在主控台「从 .atopack 导入资源」即可把音频解包到 `assets/bgm/` 并直接播放。

也可以在目标机器上直接运行 `tools/install-bgm.bat` 手动放置。详见 [asset-studio/README.md](../../asset-studio/README.md)。

## 切换规则

主控台的「背景音乐」面板里有几种切曲方式，优先级从高到低：

1. **故事 / 考察入口链接（临时切换）**——「故事」步骤里的 回忆突破 / 内蕴奥德赛 / 法洛斯之梦 / 主线 / 特殊事件，以及「考察」里的 冒险中枢 / R&R / 战斗模块，点一下就切成对应阶段；**下一次在主控台切换阶段**（勾选流程步骤、进入下一天、重置今日、切换 Cycle）**就会自动切回来跟随流程**。状态栏显示「（临时切换）」。这些链接会新开标签打开 Story，主控台留在原地继续放音乐。
2. **下拉框选阶段（锁定）**——钉住某个阶段直到选回「自动」，不会被流程变化撤销；状态栏显示「（手动锁定）」。
3. **跟随「今日流程」**（默认，未锁定也没点入口链接时）——从**最后一个已勾选的步骤**往后找，并且**跳过今天没事的「条件执行」步骤**（没战斗、没冒险、没灾祸就继续往后走），所以跳着点、少点几个按钮也不会卡住：

切曲的交叉淡入淡出时长是 **1 秒**（`manifest.js` 里的 `defaults.crossfadeMs`，想更慢改这个值即可）。

| 今日流程步骤 | 阶段 |
| --- | --- |
| 移动和时间表 | 航行 · 时间表推进 |
| 探索 | 探索 |
| 考察 | 考察 · 冒险出发 |
| 遭遇 | 遭遇 · 战斗 |
| 发展 | 发展 · 打造与训练 |
| 故事 | 故事 · 主线剧情 |
| 灾祸 | 灾祸 |

例：勾了「移动、探索」、今天既没冒险也没战斗 → 音乐直接进「发展」；今天有战斗（即使没点考察）→ 走到「遭遇」；跳着勾到「故事」→ 音乐走「灾祸」。

勾选步骤、进入下一天、重置今日、切换 Cycle 都会重新计算。开关、音量、锁定阶段存在浏览器 `localStorage`（键 `ato-bgm-prefs-v1`），不写入战役存档。**只有主控台出声**：故事模块（story/）不再引入播放器，也不参与切曲或压低音量。

## 手动调用

```js
ATO_BGM.setFlowStage("encounter"); // 主控台内部用：今日流程步骤 id
ATO_BGM.setStage("mnemos");        // 手动锁定（一直保持）
ATO_BGM.setScene("hub");          // 临时切换（阶段按钮/入口链接用；流程一变自动撤销）
ATO_BGM.setAuto();                 // 解除锁定，回到跟随今日流程
ATO_BGM.setEnabled(true);          // 开 / 关（默认关闭，必须由用户手势开启）
ATO_BGM.setVolume(0.4);            // 0–1
ATO_BGM.duck(true);                // 压低音乐（保留给朗读场景；story 页目前不调用）
ATO_BGM.state();                   // 当前状态，含 stepId / forcedStage / missing，便于排查

ATO_BGM.importTrack(file, "encounter");  // 导入自选音频并指派给某个阶段
ATO_BGM.assignTrack(id, "doom");         // 改派（传 "" 表示不指定）
ATO_BGM.deleteTrack(id);                 // 删除自选音频
ATO_BGM.tracks();                        // 已导入的自选曲目与各自指派的阶段
```

阶段解析优先级：**手动锁定 > 今日流程（setFlowStage）> 默认阶段**。

## 导入自选 BGM

控制条第二行可以导入任意本地音频，并指定它用在哪个阶段：

1. 点「导入自选 BGM」选一个音频文件（`.mp3` / `.ogg` / `.m4a` / `.wav` / `.flac` / `.opus`，单首上限 64MB）；
2. 右边的「用在」先选好阶段（默认是当前正在播的那个阶段），导入后立即生效，状态显示「已导入《曲名》→ 阶段」；
3. 曲目列表里每首后面都有「用在」下拉可随时改派，以及「删除」；被指派了自选曲目的阶段在主下拉里会带「（自选）」标记。

规则与限制：

- **自选曲目优先于内置曲目**；自选文件读不出来时自动退回该阶段的内置曲目，不会静音。
- 音频存在**当前浏览器**的 IndexedDB（库名 `ato-bgm-custom`），指派表存在 `localStorage`（键 `ato-bgm-assignments-v1`）。换浏览器、换设备、清站点数据都会丢；也不写战役存档。
- 主控台与故事模块同源，**共用同一份自选曲目**：任一页面导入或改派，另一页面刷新后即为同一状态。
- 浏览器不支持 IndexedDB（部分隐私模式）时会给出提示，内置曲目照常工作。
- 想跨设备分发：用素材库的资料包（见 [asset-studio/README.md](../../asset-studio/README.md)），或在目标机器上把文件放进 `assets/bgm/` 后由控制条识别。

## 平台注意

- 浏览器自动播放策略：音乐默认关闭，第一次开启或页面刷新后需要一次点击；控制条会提示「点击页面任意处开始播放」。
- 音频格式：默认用 `.mp3`，因此 Safari / iOS 也能播；`.ogg` 同样支持（两者并存时以清单顺序为准）。转换命令见上面的「自己转换」。
- Android APK 出于体积和版权原因不打包任何音频（`tools/export_android.py` 会剔除所有媒体后缀），需要用资源包或自行把文件放进设备上的 `assets/bgm/` 目录。
