# ATO App 界面图标 → SVG

## APK 原始轮廓重建（2026-10-19）

`rebuild_ui_icons_from_apk.py` 将 `assets/icons/` 的 28 个导航及记录图标改为 APK
命名 `Texture2D` 的透明度等值线，保留全部轮廓、尖角和镂空，不再使用截图样条拟合。
`story` 对应原有的 `nav_vo` 图案。`glossary` 和用户提供的 `oxygen` 在当前 APK 中没有
找到相同图案，保留现有文件。下文的截图流程供这类旧资源维护参考。

```powershell
# 提供 APK 静态解包后的 Unity 资源目录；不运行 APK 代码。
python tools/icon-extract/rebuild_ui_icons_from_apk.py --unity-dir tmp/apk-c7-analysis --apply
# 也可用上次保留的 PNG 与来源清单重建，无需重新解析 Unity 文件。
python tools/icon-extract/rebuild_ui_icons_from_apk.py --source-dir output/reports/ui-icons-apk-20261019/sources --apply
```

不带 `--apply` 时只生成预览、校验结果和备份。添加 `--apply` 后写回 SVG 与本地
`manifest.json`，同步主控台、记录表图标 URL 的内容版本及运行时图标尺寸；保持页面
其他字节不变。可使用 `--report-dir` 指定核对目录。报告包含 APK 原始像素、新旧对照、
16/24/32/64px 渲染检查、像素哈希及 `before/` 备份。依赖 Pillow、numpy、contourpy、
PyMuPDF，解析 Unity 文件另需 UnityPy。SVG 和来源素材仍只随 `.atopack` 分发，不进源码库。

从两张 App 截图中把 **23 个界面图标**提取成了矢量图（SVG）。

- 源图：`source/grid-menu.jpg`（图标网格页）、`source/main-menu.jpg`（主菜单页）
- 两者共有的字形（Story / Binder Audio / Settings）只保留一份，取自网格页
- 主菜单的 **Host Game** 按钮只有文字、没有图标，所以不在结果里

> **现状（2026-10）**：提取脚本与本文档搬到了 `tools/icon-extract/`，**随源码发布**；
> 截图、`png*/`、`raster*/`、`svg*/` 与各种 JSON 清单都是本地产物，已经不在仓库里。
> 页面实际用的字形放在 **`assets/icons/<名称>.svg`**，由 `.atopack` 的 `iconFiles` 段分发
> （见 `asset-studio/app/icon_resources.py` 与 `asset-studio/ATOPACK-PACKING.md`）。
> 页面现在直接按 CSS 遮罩引用这些文件（`--icon-src` + `currentColor`，字形缺席时留白），
> 所以早先三个「把字形内联进 HTML」的工具——`tools/embed_dashboard_nav_icons.py`、
> `tools/embed_record_item_icons.py`、`tools/embed_record_panel_icons.py`——**已经删除**，
> `record/item-icons.js` 也只剩名称与尺寸、不再存路径数据。
> 下文凡是讲「内联 / 嵌入」的段落，现在读作**取字来源、尺寸口径与踩坑记录**；
> 要整条重跑，先把截图放回 `tools/icon-extract/source*/`。

## 产出物

下面这些是**流水线的本地中间产物**（都在 `tools/icon-extract/` 下，不进版本库）。
其中 `svg/`、`svg-argo/`、`svg-extra/` 里的字形就是现在 `assets/icons/` 的前身。

| 文件 | 说明 |
| --- | --- |
| `svg/<name>.svg` | 每个图标一个独立文件，`fill="currentColor"`，可任意改色 |
| `ato-icon-sprite.svg` | `<symbol>` 雪碧图，用 `<use href="...#ato-icon-map">` 引用 |
| `ato-icon-sheet.svg` | 带标签的总览图（矢量） |
| `icons-preview.png` | 总览图（位图，方便快速查看） |
| `raster/<name>@2x.png`、`@4x.png` | 由矢量渲染出的透明 PNG，供不支持 SVG 的地方使用 |
| `preview.html` | 自包含预览页：不同尺寸、不同颜色 |
| `manifest.json` | 图标清单：名称、尺寸、在截图中的位置 |
| `verify-sheet.png` | 质量核对图：原图 / 二值掩膜 / 矢量渲染 / 差异 |

## 方法

1. **定位**：按亮度连通域自动框出网格页的 22 个圆角格子（243×243）和主菜单的 5 个按钮。
2. **分离字形**：每个格子里白色像素的行分布中，字形总在 y≤147 结束、标签文字从 y≥169 才开始，
   据此把图标和下方标题文字切开（两行标题如 “Godforms & Summons” 同样处理）。
3. **矢量化**：不直接对二值掩膜描边（那样会把像素锯齿一起复制下来），
   而是对**带抗锯齿的灰度图**求 0.5 等值线，得到亚像素精度的真实轮廓；
   再用 Douglas–Peucker 简化、按转角识别硬角，角之间用 Catmull-Rom 样条转成三次贝塞尔曲线。
4. **验证**：用独立的扫描线光栅化器（偶奇填充、3× 超采样）把生成的路径重新渲染，
   与原始像素比对。

## 质量

对 23 个图标，矢量渲染与源图二值掩膜的平均 IoU 为 **0.962**（最差 0.882，最好 0.992）。
IoU 对细笔画非常敏感，所以数值偏低不代表肉眼可见差异——`verify-sheet.png` 的最后一列显示
红/蓝像素只出现在轮廓边缘的一圈，即亚像素级的边缘偏移。

`zoom-compare.png` 是 5 倍放大的逐参数对比，可以看到轮廓与原始像素几乎重合。

## 局限（重要）

- 源字形只有约 **100×100 像素**，所以这是**对原图的拟合**，不是官方原始矢量文件。
  在等于或略大于原始尺寸（约 2–4 倍）下使用没有问题；
  继续放大时，细节（羽毛纹理、齿轮齿）会比真正的原始矢量更容易看出简化。
- 如果手上有 App 的安装包（APK/IPA），里面的原始资源（PNG/SVG/字体图标）会比矢量化截图质量高得多。
  有的话可以直接替换 `svg/` 下的文件。
- 图标是原游戏的界面资产，请注意使用范围。

## 重新生成

```bash
cd tools/icon-extract
python segment_icons.py    # 截图 -> png/*.src.png（灰度裁剪）+ *.mask.npy
python trace_icons.py      # 灰度 -> svg/*.svg
python verify_render.py    # 光栅化回读，计算 IoU，输出 verify-sheet.png
python build_outputs.py    # 雪碧图、总览图、raster PNG、preview.html、manifest
```

调参用 `sweep_params.py`（网格搜索）和 `zoom_compare.py`（放大目视对比）。
`trace_icons.py` 顶部的 `DP_TOLERANCE` / `CORNER_DEG` / `SIGMA` 控制平滑程度：
调大 `DP_TOLERANCE` 更平滑但更失真，调小则更贴近像素锯齿。

依赖：`numpy`、`Pillow`、`scikit-image`（均已随 DSH 运行时提供）。

## 记录表里的项目图标

`tools/embed_record_item_icons.py` 给面板**内部的项目**加图标（不只是面板标题）：

| 项目 | 图标 |
| --- | --- |
| 阿尔戈号命运 | `argo-fate` |
| 陌生人 | `strangers` |
| 人性 | `humanity` |
| 变节者 | `defectors` |
| 轮回长度 | `loop-length` |
| 凝固时光 | `frozen-time` |
| 悖论 | `paradox` |
| 巴比伦债务 | `babelian-debt` |
| 猜忌 | `paranoia` |
| 补给 | `cargo-hold` |
| 战役笔记 | `campaign-notes` |
| 氧气 | `oxygen`（见下） |
| 船体 / 船员（轨道标题，运行期生成） | `hull` / `crew` |
| 难民 / 俘虏（C2 船员计数） | `refugees` / `captives` |

只映射**确实有对应图标**的项目；`AA 上限`、`收割/播种计数标记`、`恩惠`、`苦痛`、
`计数标记`、`同步日志` 没有对应字形，就留空而不是硬套一个。

### 单独提供的图标（`source-extra/`）

氧气那个图标不是从截图里提取的，是你直接给的图片。它走一条单独的路径：

```bash
# 把图片放进 tools/icon-extract/source-extra/oxygen.png
python tools/icon-extract/extra_icons.py                          # 阈值化 -> png-extra/
python tools/icon-extract/trace_icons.py --png png-extra --svg svg-extra
python tools/icon-extract/check_extra.py oxygen                   # 回读比对，IoU + 对照图
```

`extra_icons.py` 处理的是**白底深色**的图（不透明、没有 alpha），所以它做的是取反：
`src.png` 里字形必须是亮的，因为 `trace_icons.py` 是在 0.5 透明度上取等值线、
默认亮的一侧是形状。氧气那个图形是"深色团 + 白色气泡"，气泡自然成为镂空的孔。
回读 IoU 0.9816。

`svg-extra/` 是第三个图标目录（另外两个是 `svg/`＝App 图标、`svg-argo/`＝阿尔戈号图标），
早先的 `embed_record_item_icons.py` 会依次在其中查找字形；现在这一步等价于把字形放进
`assets/icons/` 后由页面按文件名引用。

分两条完全不同的路径：

- **页面 HTML 里写死的字段**（身份格、战役笔记）：图标内联在标签文字前，并包一层
  `<span class="item-label">` —— 原来的标签是 `max-content max-content` 的两列网格
  （文字 / 输入框），直接塞一个 `<svg>` 会变成第三个网格项、把输入框挤到下一行。
- **运行期由 JS 生成的标题**（`makeTrackTitle` 生成的船体/船员，以及 C2 的船员计数）：
  这些 DOM 在页面跑起来之前不存在，所以加了两个小钩子，路径数据放在
  **`record/item-icons.js`**（受版本控制的独立文件，和 `matrix-summaries.js` 一样），
  不塞进 5800 行的内联脚本里。

  `makeTrackTitle` 里的钩子按**名字查表**（`RECORD_ITEM_ICONS[zh]`），不是靠调用点传参——
  `renderTrack` 里写的是 `makeTrackTitle(zh, en)`，**根本没把 options 传下去**，
  所以早先给调用点加的 `iconPath` 全是死参数，船体那格的图标一直没生效过
  （C2 的船员轨道因为直接调 `makeTrackTitle(..., {iconPath})` 才碰巧有效）。
  敌人、外交的轨道名不在表里，自然就不会被套上图标。

`record/item-icons.js` 只存 `viewBox` + 路径数据，像素尺寸由 `buildItemIcon` 按同样的
等面积规则现算，所以同一条数据既能给 24px 的轨道标题用，也能给 13px 的计数器用。

### 「解锁最大值」按钮移到行尾

船体/船员的「解锁最大值」按钮是在 `renderTrack` 里 `appendChild` 到 `.track-name`
里面的，而 `.track-name` 是名称列内部的一块——所以它只会掉到标题下面一行，怎么排都
到不了整行最右。脚本在 `container.append(title, chips)` 之后加了几行，把按钮节点挪进
`.track-row` 最右一列的一个 `.track-row-side` 竖排容器；`.track-row` 的网格原本只有
两列，第三个子元素又会落到下一行最左，所以再给该行加 `has-lock-slot` 类开第三列。

C2 的船员轨道走的是 `container.append(title, grid)` 这条独立路径，它把
`.crew-counter-total`（「合计 5 / 9」）作为 `grid-column: 1 / -1` 放进计数网格里，
所以合计显示在卡片下面一整行。同一个补丁会**把合计也一起拿进 `.track-row-side`**——
于是右侧那列是「合计在上、按钮在下」，正是想要的样子；普通轨道没有合计节点，
`querySelector` 返回 null，容器里就只有按钮。

> **这里踩过一个坑**：第一版补丁没有花括号，而剥离它用的正则要求结尾有个 `}`，
> 于是 `.*?` 一路吞掉了 `renderTrack` 自己的闭合花括号，整个内联脚本直接
> `Unexpected end of input`、页面动态内容全空。现在：
>
> 1. 剥离改成**精确字符串**匹配（新旧两种写法都列出来），不再用会越界的正则；
> 2. 写盘**之前**先调用项目自带的 `tools/check-inline-js.mjs` 编译一遍内联脚本，
>    不通过就拒绝写入。
>
> **这里踩过一个坑**：用正则删 `.identity-mark-row` 时写成
> `\n *<div class="identity-mark-row".*?\n *</div>(?=\n)`，惰性的 `.*?` 停在了
> **内部第一个** `</div>`（记录面板的收尾），结果只删掉了整行的开头和「收割」那一格，
> 「播种」整块留在了网格底部。删嵌套标记不能用这种"就近匹配闭合标签"的写法——
> 要么按精确整块文本删，要么先数括号。
>
> 顺带一提，`node tools/check-inline-js.mjs record/index.html` 就是发现这类问题最快的
> 手段——比截图和浏览器探针都直接，值得优先用。它只查 JS，查 HTML 结构要用
> `tools/icon-extract/check_identity_grid.py`（lxml 解析后逐个列出网格子元素）。

#### 排布与字色

身份网格是 flex-wrap，**源顺序就是显示顺序**，所以「把某字段挪到前面」= 把那一整行
`<label>` 在源码里上移。`move_babelian_debt.py` 做这件事；注意第一次写成了插在
`播种` 字段的收尾 `</div>` 之后，结果仍排在两者后面——要插在 `收割` 字段的**开标签之前**。

收割 / 播种的名字（`.identity-mark-name`）跟字段标签取齐：`font-weight: 600` +
`color: var(--muted)`（`#706a60`）。字体族本来就一样（都是 Microsoft YaHei），
差的是字重和颜色——`probe_mark_row_style.py` 会把两边的计算样式并排列出来。

```bash
python tools/embed_record_item_icons.py --dry-run
python tools/embed_record_item_icons.py
python tools/icon-extract/probe_record.py     # 渲染后用 Chrome 读回：JS 报错 + 图标数量 + 对齐
python tools/icon-extract/crop_items.py       # 裁出各区域放大看
```

`probe_record.py` 把错误监听器注入到 `</head>` **之前**——放在页面末尾的话，内联脚本的
语法错误会在监听器注册之前就发生，测不到。这一点是真的踩到过：钩子被重复注入，
两个 `const counterIcon` 落在同一作用域，整个内联脚本不执行、页面完全没反应，
而探针却报"无错误"。现在脚本里也加了"每个钩子必须恰好出现一次"的输出校验。
`--cycle c5` 可以把周期切过去再量，用来检查只在某个循环出现的字段（氧气是 c5）。

> 剥离旧插入时，`<svg class="item-icon">` 的函数体要用带负向断言
> `(?:(?!</span>).)*?` 匹配，不能直接 `.*?`：惰性星号会一路吞过 `</span>`，
> 把**下一个**标签的标记和文字一起吃掉（氧气后面接着猜忌时，整段"氧气"就这么没了）。
> 这类跨结构匹配在 `strip_page` 里是静默的——插入侧的数量校验会先报错，
> 但那时候已经是在错误的输入上操作了。

> 两个 embed 脚本各管一段 CSS，用显式 `/* ==== ... ==== */` 起止标记**原地替换**。
> 早先的做法是"删掉自己的块再追加到文件末尾"，结果两个脚本会互相把对方的块挤到后面，
> 导致谁都幂等不了。

## 阿尔戈号属性页的图标（第二批）

App 的 Argo 船只属性页共 **14 个新图标**（`Hull`、`Crew`、`Argo Fate`、`Argo Knowledge`、
`Strangers`、`Humanity`、`Refugees`、`Captives`、`Defectors`、`Paradox`、`Frozen Time`、
`Loop Length`、`Babelian Debt`、`Paranoia`），从 5 张截图里提取。

| 产出 | 说明 |
| --- | --- |
| `svg-argo/<name>.svg` | 14 个独立 SVG |
| `argo-icon-sprite.svg` | `<symbol id="argo-icon-hull">` 雪碧图 |
| `argo-icon-sheet.svg` · `argo-icons-preview.png` | 总览（矢量 / 位图） |
| `raster-argo/<name>@2x.png`、`@4x.png` | 由矢量渲染的透明 PNG |
| `argo-manifest.json` | 清单：名称、尺寸、来源截图 |
| `argo-icons-sheet.png` · `argo-verify-sheet.png` | 切割核对 / 矢量化核对 |
| `source-argo/` | 5 张原始截图 |

**版式与切割**：这些页面是浅色卡片上的居中竖排列表，每项是「小写标签 + 大图标 + 右侧数值」。
实测标签带高 29–31px、图标带高 80–111px，标签到图标只隔 15–31px，而项与项之间隔
114–133px，所以按行带就能可靠分开。图标列在 x≈400–570，数值文字在 x≈580–700，
两侧箭头更外，右下徽记和底部汇总条都排除在外。

图标带内部用**横向聚类**取最左边一簇作为字形：一个字形内部各部件只隔几像素，
而数值文字离字形约 78px，所以 40px 的阈值能干净切开。

**注意 Time Silo 那一项没有图标**（只有数值 `0`），所以 argo3 只有 5 个图标而不是 6 个。

### 两处切割修正（`argo_crop_check.py` 把关）

第一版切割有两处漏切，都是"只看局部、没和源图核对"造成的：

1. **Argo Fate 少了左右两翼。** 原规则用"高 ≥55px 的主部件"定横向范围，而这个字形由
   左右两翼（48×46）和中间坠形（45×71）组成——两翼不够高，被当成外人裁掉了，
   只剩中间那块（53×79）。改成横向聚类后是 117×104。
2. **Frozen Time 少了下方细尾。** 字形主体下方还有 4px/2px 的两段细长碎片，各自成了
   独立的行带，因为不够高而被当成标签丢掉。现在相邻 10px 内的行带会先合并
   （标签到字形至少隔 15px，不会误合），尺寸从 125×88 变成 125×103。

`argo_crop_check.py` 会为每个图标显示**放宽 40px 的源图窗口**并框出实际裁剪范围，
再统计紧贴框外一圈的墨迹像素——这类漏切在这个视图里一眼可见，而原来那种
「裁剪图 + 自己的掩膜」的对照表完全看不出来。现在这个检查报告 `none`。

```bash
python argo_segment.py     # 截图 -> png-argo/*.src.png + *.mask.npy
python trace_icons.py --png png-argo --svg svg-argo
python argo_verify.py      # 回读渲染 + IoU + 核对图
python argo_build.py       # 雪碧图、总览、raster PNG、manifest
python argo_sheet.py       # 切割核对图
```

质量与第一批相当：14 个图标回读渲染与源图掩膜的平均 IoU **0.962**，最差 0.935（Paradox，
细线结构）。

## 稀有资源图标改用 Glossary

`record/assets/resource-icons/rare.png` 原本是把「稀有」两个字渲染成位图。现在换成
Glossary 字形（书 + 问号）——64×64、透明底、墨色 `#1c1a19`，和 `core.png`、
`echoes.png` 等同类图标一致。

```bash
python tools/icon-extract/make_rare_icon.py            # 生成（会备份原图）
python tools/icon-extract/make_rare_icon.py --dry-run  # 只看参数
python tools/build_rare_resource_icon.py         # 现在的正规脚本：读 assets/icons/glossary.svg
python tools/icon-extract/rare_icon_compare.py         # 前后对比图
```

> `make_rare_icon.py` 里还留着当年那份 `TOOL_TEMPLATE`，它会**重新生成**（覆盖）
> `tools/build_rare_resource_icon.py`——那是把路径数据内嵌进去的旧版本。
> 现在正规脚本改成直接读 `assets/icons/glossary.svg`，所以别再用它去生成那个文件；
> 它需要 `tools/icon-extract/svg/glossary.svg`，只有跑完整条提取流水线才会有。

原图备份在 `tools/icon-extract/backup/rare-original.png`（该目录已随本地产物一起删掉）。

**注意 `/record/assets/` 在 `.gitignore` 里**（第 86 行），所以这个 PNG 是本地生成物，
改了不会进版本库。因此 `make_rare_icon.py` 会额外生成
`tools/build_rare_resource_icon.py`：字形直接从 `assets/icons/glossary.svg` 读，
只有一份路径数据（早先它把路径内嵌在脚本里，现已改成读那个文件），重跑输出与旧文件逐像素一致
（已验证：4096 个像素全等，只有 PNG 编码器写的块不同）。要长期生效，应当提交这个脚本，
或在构建流程里调用它。

**顺带影响**：`technology/index.html` 把这同一个文件当作「没有专属图标的资源」的兜底图，
所以那边的兜底图标也跟着变成了 Glossary 字形（原来是「稀有」二字）。兜底用书 + 问号
其实更贴切，但如果你希望兜底保持原样，我可以拆成两个文件、只让记录表的 rare 指向新的。

## 嵌入到主控制台跳转行

`tools/embed_dashboard_nav_icons.py` 把其中 6 个图标内联到 `index.html` 的
`nav.record-links` 里（每个链接前面），样式写在 `dashboard.css`：

| 链接 | 显示文字 | 图标 |
| --- | --- | --- |
| 阿尔戈号记录表 | 阿尔戈号 | `argo` |
| 英雄记录表 | 英雄 | `argonauts` |
| AIBP | 始徒 | `evolution` |
| 科技 | 科技 | `technology` |
| 地图 | 地图 | `map` |
| 故事书 | 故事书 | `story` |

链接文字统一由脚本顶部的 `LABEL_OVERRIDE` 决定（键是指向页面的 href），
所以改文案不用去动 `index.html`，改这里再重跑即可；不想覆盖某个链接就把那一条删掉。

链接之间的横向间距在 `dashboard.css` 的 `.record-links` 里：
桌面 `gap: 6px 30px`，窄屏（≤620px）`gap: 4px 20px`。

```bash
python tools/embed_dashboard_nav_icons.py --dry-run   # 只看会改什么
python tools/embed_dashboard_nav_icons.py             # 写入
python tools/icon-extract/verify_nav_embed.py               # 结构校验
```

脚本是幂等的（重跑会替换而不是叠加），并且会顺带把 `index.html` 里
`dashboard.css?v=` 的版本号往前推，避免浏览器用到旧缓存。

### 图标大小：等包围盒面积

每个字形都按自己的包围盒裁切过，如果统一"装进 16×16 的方框"，视觉重量会差很多：
`argo` 是 120×81 的扁长字形，只能渲染成 16×10.8，而 `story`（101×102）几乎占满 16×16 ——
前者的墨迹面积只有后者的约 2/3，看起来就"小一号"。

所以改成**让所有字形的包围盒面积相等**：按 `sqrt(w*h)` 的几何平均缩放，再限制
最长的边不超过 `16 × 1.25 = 20px`。实际尺寸由内联的 `--nav-icon-w/h` 给出：

| 图标 | 裁切尺寸 | 渲染尺寸 |
| --- | --- | --- |
| argo | 120×81 | 19×13 |
| argonauts | 86×97 | 15×17 |
| evolution | 94×98 | 16×16 |
| technology | 94×123 | 14×18 |
| map | 100×99 | 16×16 |
| story | 101×102 | 16×16 |

窄屏（≤620px）时按 `14/16` 等比缩小。规则在
`nav_icon_sizing.py`（`p=0.0`）里可以调：`p=1.0` 是旧的"装进方框"，
`p=0.5` 是折中，`nav-icon-sizing.png` 有三者的对照图。

**始徒（原 AIBP）**：App 的两张截图里没有叫「始徒 / Apostles」的图标——网格页 22 个标题
（`caption-check.png` 放大核对过）和主菜单 5 项都不是。所以这一格用的是 `evolution`
字形，链接文字则按页面自己的标题写成「始徒」。想换成别的字形，改脚本顶部
`ICON_BY_HREF` 里 `./aibp/index.html` 对应的名字再重跑一次即可
（`titans`、`godforms-summons` 都可以）；文字在 `LABEL_OVERRIDE` 里改，
删掉那条就恢复成原来的 `AIBP`。

`nav_icon_check.py` 会在 16px（窄屏 14px）的真实尺寸下渲染这几个字形，
并按 `dashboard.css` 的字号和配色拼出一行模拟图 `nav-icon-check.png`，
用来确认小尺寸下的可读性。

## 嵌入到阿尔戈号记录表的模块标题

`tools/embed_record_panel_icons.py` 给记录表的 **10 个面板**各加一个带图标的标题。
页面上原本只有 3 个面板有可见标题，其余 7 个只靠卡片内的字段名区分，所以这个脚本
会给它们补一行紧凑标题（图标 + 名称，15px）：

| 模块 | 标题来源 | 图标 |
| --- | --- | --- |
| 循环记录 | 原有 `<h2>` | `timeline` |
| 泰坦列表 | 原有 `<summary>` | `titans` |
| 神之形态与宁芙 | **新增** | `godforms-summons` |
| 船体与船员 | **新增** | `argo` |
| 敌人 | **新增** | `evolution` |
| 外交 | **新增** | `diplomacy` |
| 冒险 | **新增** | `adventures` |
| 抉择矩阵 | 原有 `<h2>` | `choice-matrix` |
| 资源 | **新增** | `cargo-hold` |
| 笔记 | **新增** | `campaign-notes` |

外敌轨道那格用 `evolution`（怪物脸）——敌人轨道本来就是按形态推进的，
视觉上也和 `titans` 区分得开。想换名字或图标，改脚本顶部的 `MODULES` 表再重跑。

新增的 7 个小标题用**黑体**（`Microsoft YaHei` 等），因为 `record.css` 给
`h2` 定的是宋体。**循环记录那格的标题（`#cycleTitle`，运行期被赋成「循环 II」这类文字）
也一并改成黑体**——它的文字是 JS 赋的，用 `#cycleTitle` 这个 id 选择器压住 record.css
里 `h2` 的宋体规则。**抉择矩阵**（`.matrix-head`）原来只有它是「宋体 + `accent-soft`
粉底 + 22px」，现在统一成**黑体、15px、去掉底色、内边距 `9px 16px 8px`**，
并补上其余标题都有的下边框——`padding` 要和 `.panel-heading.compact` 取齐，
否则标题栏会高出 8px。

> 循环记录的 `#cycleTitle` 是唯一一个保留 22px 的标题。
>
> 量标题栏高度别用 `heading_box_center.py`：它给抉择矩阵挑的元素不对，
> 会报出一个虚高的值。用 `probe_matrix_head.py`，它直接读 `.matrix-head` 的
> `getBoundingClientRect()` 和计算样式，给出的 43.6px 才是真的（另加一条
> `::before` 的箭头，比 `.panel-heading.compact` 的 42px 高 1.6px）。

### C4 两个 boss 的共用计数器

迈达狮 / 半神迪精原来各有 15 格，最后两格都是 `VI`。现在那两格换成一个
**共用计数器**：显示一个数字，点一下 +1，右键 -1，两行 boss 共享同一个值。

实现是复用敌人轨已有的阶段机制，不新增数据结构：阶段对象上加一个
`marker: "counter"`，`renderObjectTrack` 遇到它就渲染成计数器而不是普通格子。
共享靠的是原有的 `sharedWith` —— 两个 boss 的 `sharedWith` 数组和 `id` 相同，
`getEvolutionStageKey` 算出来是同一个键，所以点哪一行都加在同一个数上
（`probe_c4_counter.py` 实测：点第一行两次，两行都变 2）。
计数器存的是数字，`0` 为假值，所以没有任何进度时不会误判。

行尾统一用 CRLF（仓库约定），改完记得检查，`Add-Content` 之类会写成 LF。

标题栏是可见的（`.panel-heading` 自带 `#f8faf8` 背景和底边框），所以还要让内容在
**栏内上下居中**：原来写的是 `padding: 12px 16px 0`，下边距为 0，实测内容上方 14px、
下方只有 3px，贴着栏底。改成 `padding: 9px 16px 8px` 后，7 个标题栏都是**上下各 11px**。

图标与标题文字之间则用 `display: inline-flex; align-items: center` 对齐——原来靠
`vertical-align: -3px` 的固定偏移，图标一高一矮（`argo` 14px、`笔记` 21px）就对不齐。
另外黑体的中文墨迹在行盒里比几何中心略低，所以给黑体标题的图标补了
`transform: translateY(0.05em)`（随字号缩放，15px 时约 0.75px），把墨迹中心对齐——
用 `heading_align.py` 在 2x 截图下量，`船体与船员`、`外交` 都从 −0.75px 收到 0.00px。

另外 `#cycleTitle` 的文字是页面运行时赋值的（`elements.cycleTitle.textContent = cycle.label`），
内联在 `<h2>` 里的图标会被这句清掉，所以循环记录的图标放在 `<h2>` **外面**，
再用 `margin-right: auto` 让标题紧贴图标、状态文字留在右边。

```bash
python tools/embed_record_panel_icons.py --dry-run
python tools/embed_record_panel_icons.py
python tools/icon-extract/verify_record_icons.py      # 结构校验
python tools/icon-extract/probe_headings.py           # 用 Chrome 量标题几何 + 2x 截图
python tools/icon-extract/heading_box_center.py       # 标题栏内的上/下留白
python tools/icon-extract/heading_align.py            # 图标与文字的真实墨迹中心
python tools/icon-extract/heading_bars.py             # 按量到的矩形精确裁出标题栏
python tools/icon-extract/heading_zoom.py             # 标题放大对照
python tools/icon-extract/record_panel_preview.py     # 生成标题外观预览
```

`probe_headings.py` 需要 Chrome 或 Edge：它把记录表复制成 `record/_probe.html`、注入一段
量尺寸的脚本，用 `--dump-dom` 读回每个标题的盒子，再以 `--force-device-scale-factor=2`
截图（这样 0.25px 级的偏移才量得出来）。用完会删掉临时文件。

**深度较大的标题位置会和截图对不上**——两次渲染间隔里图片加载程度不同会导致累积
几十像素的偏移，所以靠后的行以 DOM 盒子为准（`heading_box_center.py` 只读 DOM，始终可靠），
`heading_align.py` 的墨迹测量只对靠前的标题可信。

图标同样按「等包围盒面积」缩放（17px 方框，最长边不超过 1.25 倍），所以
`argo`（120×81）渲染成 21×14 而不是 17×11.5，不会显得比别的模块小。
三个原有标题保持各自的字号（循环记录 / 抉择矩阵 22px、泰坦列表 14px），
新增的 7 个统一用 15px，不跟它们抢视觉层级。

> 注：这次写入 `record/` 时被 Windows 权限挡住过（该目录缺少当前账号的写入权限，
> 受限模式下无法写入，同批次新建的目录则正常）。用完全权限写入后即正常，
> 现在会话是 full access，`record/` 下可以直接改。
