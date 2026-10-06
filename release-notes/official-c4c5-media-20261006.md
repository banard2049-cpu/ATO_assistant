# 官方版 C4/C5 的行内图与战斗版图：把 fan 行重新锚定到官方正文

日期：2026年10月6日。工作目录：`D:\desktop\ATO_assistant`。

用户要求：「我需要加图标和图片啊」。上一轮把官方正文并到 C1–C5 后，官方版 C4/C5 只有纯正文——
混排映射（`story/assets/mixed-media/mapping.js`）当时只有 C4/C5 的 **fan** 变体（锚在民间译文上）。
本轮把同一批已审计的图像行重新锚定到官方正文上，官方版 C4/C5 现在和 C1–C3 一样有行内图与战斗版图。

## 结果

| 项 | 数量 |
| --- | --- |
| 新增 C4/C5 official 行 | **2424**（图标 2237、战斗版图/地形 63、叙事整图 104、特制图 20）|
| 覆盖条目 | **1134** 个条目版本（c4 全部 + c5 全部）|
| 没配上的位置 | **2**（官方译文没印该图标，保持纯文本）|

- `c4|official` 1125 行 = `c4|fan` 1125 行（C4 一条不缺）；`c5|official` 1299 行 / `c5|fan` 1301 行。
- 图像、裁框、`assetSha256`、页码与来源审计字段全部沿用原 fan 行：**没有新增或替换任何图片**，只换锚点。
- `mapping.js` 版本串追加 `-c45-official-anchor1`，新增 `officialAnchorRevision` 元数据块（口径、计数、未解析项、验证结论、两版正文的 SHA-256）。原文件其余字节未动，改动前备份在 `tmp/sb-diff/backups/`。

## 锚定方法

1. **图标**：官方正文里同一枚印刷图标有五种写法——`［末日］`/`[末日]`/`〔船体〕`、`（装备）`/`(图标)`、
   `末日 (DoomToken)`、`（末日 (DoomToken)）`、裸词（`额外的1张Towerclub装备卡牌`）。候选按「显式标记优先、
   裸词兜底」分两级，再按 (条目, 图标) 与 fan 行**按顺序**配对；官方标签由 fan 行的英文 tag +
   官方 C1–C3 行的官方标签 + 官方 C4/C5 正文里学到的 `标签 (Tag)` 对共同确定（末日/进度/凶险/猜忌/威力…）。
2. **图文行**：原文锚点 → 术语归一锚点（灾祸→末日、进展→进度、危险→凶险、亚特兰提斯→亚特兰蒂斯…）
   → 锚点尾部唯一子串 → `replaceText` 占位符序号，四级回退。`after`/`before` 行按插入点校验上下文。
3. **同名锚点**：同一段里出现多次的锚点（如 `（此处包含密文，请查阅故事书）`、`［末日］`）按 fan 侧顺序
   占用官方侧第 k 次出现；条目内再按渲染器的同一条重叠规则贪心去重。
4. **配不上的留纯文本**：`c5-supplement-99` 的官方正文只印出 1 处 `［阿尔戈号命运］`，
   `c5-supplement-大洪水` 的官方译文没有 `［移动行动］`。

## 程序改动

- `story/assets/mixed-media/mapping.js`（本地私有）：新增 2424 条 `variant: "official"` 行 + `officialAnchorRevision`。
- `story/assets/app.js`：`mixedMediaContext()` 的注释更新（C4/C5 现在两种变体都有）。
- `story/index.html`、`ss/index.html`：`mapping.js` 缓存参数提到 `?v=c4c5-20261006-official-c45-1`。
- `story/tests/mixed-media.test.cjs`：两处总量断言 8390 → **10814**；主屏/第二屏夹具的
  `supportsOfficialVersion` 由 `c1-c3` 改为 `c1-c5`（与 app.js 一致）。

## 验证

- **渲染器全量核对**（`tmp/sb-diff/verify-c45-official.cjs --disk`，读盘上的 `mapping.js`，用真实 `renderer.js`）：
  **1134 条目 / 2424 行全部解析，0 issues、0 重叠、0 计数差、round-trip 与官方正文逐字一致**。
- `node --test --test-isolation=none story/tests/mixed-media.test.cjs` → **7 项通过、0 失败**；其中
  「每条映射在主屏与第二屏各挂载一次」用例实测 `main 10814 / second 10814`，无回退、无丢图。
- 交付件与正文哈希：`storybook-official-data.js` = `d73357e130375c2674c3e6be5fad40372601d38fead28c3c1b932ef92ac208b3`；
  `mapping.js` 合并后 = `51cc4d5e3e97e0af48cddf83c8f634f154ecbca98673f4d57020a8f5815f279f`。

## 未完成 / 限制

- **C4/C5 仍没有原书扫描图**（本地一张都没有），第二屏在官方版下显示官方正文而不是原书页。
- C5 战斗标题加粗（`ATO_C5_BATTLE_HEADINGS`）只认 `variant=fan`，官方版 C5 的战斗标题不加粗；
  要补需把那 63 段标题范围按官方正文重新求锚。
- 2 处官方译文没印标记的位置保持纯文本（见上）。
- 浏览器验收脚本已按新预期改好（`tmp/sb-diff/official-browser.cjs`，期望数量直接读 mapping），
  本轮未再跑（用户要求少测试）；渲染器全量核对 + 主屏/第二屏全量夹具已覆盖同一批行的挂载路径。
