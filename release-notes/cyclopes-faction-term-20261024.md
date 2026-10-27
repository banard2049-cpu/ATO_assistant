# 官方版把派系「独眼巨人」改成了「无眼巨人」

日期：2026年10月24日。工作目录：`D:\desktop\ATO_assistant`。

用户反馈：「官方版翻译中的派系不应该是独眼巨人吗？为什么被无眼巨人覆盖了」。

## 原因

官方 App 1.1.22 的 EN/CN 表里这是两个词：

| 官方 key | 英文 | 官方中文 |
| --- | --- | --- |
| `app:1.1.22:f_cyclopes` | Cyclopes | **独眼巨人**（派系） |
| `app:1.1.22:core_cyclonus` | Cyclonus | **无眼巨人**（C2 宿敌） |

`assets/ato-terms.js` 里有一对从 1.2.0 术语表开始就存在的旧名替换「独眼巨人 → 无眼巨人」，本意是把民间版给 Cyclonus 起的名字换成官方名。它没带 `scope`，属于全局条目，而引擎会对页面上任何文本节点套用一次，于是连本来就写着官方名的派系标签也一起改了：

- 地图 / 记录表 / AIBP 的派系表（`mapFactionLabelsByCycle`、diplomacy 行）里是 `cyclopes: "独眼巨人"`；
- 探索面板的派系状态、记录表外交行、AIBP 的 `AG：…` 地图派系条都直接显示这串中文；
- 官方模式下这些文本节点原样进 `translate()`，`独眼巨人` 命中全局条目即变成 `无眼巨人`。

顺带被同一对条目改坏的还有本来就用官方名的「独眼巨人的…」形容词与装备名（许珀里翁神殿、独眼巨人的特性、独眼巨人装备等），以及记录表笔记里指派系的「独眼巨人」。

## 改动

- `assets/ato-terms.js`
  - 「独眼巨人 → 无眼巨人」加上 `scope`，只作用于宿敌区域 `#enemyTracks, .boss-search-results, #boss-title`；这组选择器与 `assets/english-terms.js` 里 `独眼巨人 => Cyclonus` 的 scoped 条目一致（英文方向本来就是靠作用域区分派系与宿敌的）。
  - 科技树条件文字与应用自己写的中文核心资源名不在宿敌区域里，逐条补官名：`独眼巨人 等级 2/3/4`、`等级 2/3/4 的独眼巨人战斗`、`核心 · 独眼巨人`。
  - 其余 `独眼巨人核心 / 活体研究 / 观察 / 解剖 / 甲胄 / 弯刀 …` 等专用条目不变。
- `tests/term-engine.test.cjs`：新增用例，钉住派系名、形容词、装备名保持原样，宿敌区域、科技树条件与核心资源名仍换成 `无眼巨人…`。
- 九个页面的 `ato-terms.js` 缓存参数提到 `?v=20261024-cyclopes-faction1`（含 `briefing` 的旧版本号）。

## 验证

- `node tests/term-engine.test.cjs`：9 项全过（新增用例在内）。
- 逐文件跑完 `tests/*.test.cjs` 共 156 个：154 通过。两个失败与本改动无关且可复现：
  - `record-boss-avatars`：记录表 boss 头像 URL 带 `?v=cardbacks-restored-20261023`，用例仍按无参数比对（上一版就已如此）。
  - `app-update-client`：在 `tmp/` 下建目录被 Windows 权限拒绝（`EPERM`），属于本机工作区权限问题，不是代码问题。
- 抽样翻译结果：`独眼巨人 → 独眼巨人`（全局）、`独眼巨人 → 无眼巨人`（`#enemyTracks` 内）、`独眼巨人的许珀里翁神殿 → 原样`、`独眼巨人核心 → 无眼巨人核心`、`独眼巨人 等级 2 → 无眼巨人 等级 2`、`核心 · 独眼巨人 → 核心 · 无眼巨人`、`Cyclops Trap（survey-record）→ 独眼巨人陷阱`。

## 说明

- 民间版不受影响：术语替换只在官方模式启用。
- 英文模式走 `assets/english-terms.js`，同一组选择器已能给出 `Cyclopes` / `Cyclonus`，本次未改。
- AIBP 的 `boss-levels-data` 本来就是 `无眼巨人`，所以宿敌面板两种模式都已经是官名。
