# 探索卡资源自动结算

主控台抽出探索卡后，卡面上「只加资源」的卡会多出一个结算区块：按一下按钮，卡面写的资源就按当前外交状态直接写进记录表的资源计数器。本文说明数据是怎么来的、判定规则、以及以后怎么重新扫描。

## 为什么需要扫描

卡面的规则文字只印在图片上，程序手里没有「这张卡给什么资源」的数据。`assets/exploration-card-tags.js` 只记录了移出/连抽标签，没有资源信息。所以自动结算分两步：

1. **打标**：把 222 张探索卡（c1–c5）的规则面板逐张读出来，得到标题、每一条规则原文、以及每条规则前面那枚外交状态徽章（`Friendly+`、`Denounced-`、`Allied`、`At War` 等）。
2. **判定与扫描**：按固定规则把「获得 N 个某某资源」翻译成结构化收益，判断哪些卡是纯资源卡，并算出每张卡的基础值与条件分支。

## 数据流水线

| 文件 | 作用 |
|---|---|
| `assets/exploration-cards/<cycle>/<id>.png` | 卡面原图（发布包自带） |
| 打标批次 JSON（视觉转录，按批存放） | **输入**：逐张卡的转录结果（标题、规则行、行首徽章） |
| `tools/merge_exploration_vision.py` | 把批次 JSON 合并成一份完整转录 |
| `tools/exploration-card-effects.json` | **输入**：合并后的逐张卡转录（已入库，扫描脚本的输入） |
| `record/index.html` | **输入**：记录表的资源表（每个循环有哪些资源、哪些资源跨循环共用） |
| `tools/scan_exploration_resource_cards.py` | 扫描脚本：判定 + 扫描 + 生成 |
| `tools/exploration-card-resources-review.csv` | 复核表：每张卡的判定、基础值、条件分支、待办效果、未识别项 |
| `assets/exploration-card-resources.js` | **运行时数据**：程序真正读取的卡数据（脚本生成，不要手改） |
| `assets/exploration-card-resource-rules.js` | 运行时逻辑：条件求值、结算计划、写记录表 / 撤销 |

重新扫描（改了卡面转录或记录表资源表之后）：

```bash
# 只有重新打标之后才需要这一步：把批次转录合并成一份
python tools/merge_exploration_vision.py --input tools/vision-batches

# 判定 + 扫描 + 生成运行时数据
python tools/scan_exploration_resource_cards.py
```

两个脚本都不做网络请求。视觉打标是人工复核过的步骤，脚本只处理它的结果，不重新识字。

## 判定规则

扫描脚本对每张卡逐句判断，句子来源是转录里的规则行（按句号切分，移出牌堆的说明句直接忽略，它有独立的标签系统管着）：

- **收益句**：匹配 `Gain <数量> <资源名> resources` 的句子记为该卡的资源收益，数量支持「Gain 9 Trireme, 6 Monument and 3 Armament resources」这种一行多资源。
- **条件分支**：句首带徽章就是条件收益；句子里出现 `instead` 的是「替换」分支（会顶掉它前面同资源的基础收益），没有 `instead` 的是「追加」收益。
- **其它效果**：剩下读得通的句子进 `manual`，带上它自己的徽章；`You may ...` 这类需要玩家选择的句子一定进 `manual`，不会自动加。

卡的种类（`kind`）：

| kind | 含义 | 界面行为 |
|---|---|---|
| `resource-only` | 整张卡的效果就是获得资源（可以带 `instead` 条件分支） | 显示「自动结算」 |
| `resource-plus` | 除资源外还有别的效果（选定的阿尔戈英雄 +1、失去泰坦、战斗、掷骰…） | 显示「结算资源部分」，并把其余效果列成待办 |
| `none` | 没有资源收益 | 不显示结算区块 |

### 条件徽章

资源卡上的条件就是外交状态徽章，判定用的是主控台工具栏已经在显示的那份数据（当前地图板块阵营的外交状态，`diplomacyStatus` 的 `bonus`）：

| 徽章 | 生效条件 |
|---|---|
| `Allied` | bonus ≥ +2（结盟或更好） |
| `Friendly+` | bonus ≥ +1（友善或更好） |
| `Friendly` / `Neutral` / `Unfriendly` / `Denounced` | 恰好等于该状态（只在多分支的外交卡上出现） |
| `Denounced-` | bonus ≤ −2（恶劣或更差） |
| `At War` | bonus ≤ −3（开战） |

拿不到当前板块的外交记录（板块没阵营、或记录表里还没填外交值）时，按钮会给出两个选项（基础值 / `instead` 值），让玩家按实际战况点一下，不会替玩家猜。

## 运行时行为

- 按钮只出现在本次抽出的牌上（下方「暂时移出牌堆」折叠区里的牌不带按钮，避免误结算）。
- 点「自动结算」后：算出资源变更 → 通过 `api/campaign-state.php` 的 `section=record` 写入当前活动档案的记录表（读改写 + `expectedRevision` 冲突重试），并往记录表的同步日志里写一行。
- 写入的字段跟记录表页面一致：跨循环共用资源用原 key（`fearEssence`），单循环资源带循环前缀（`c1-trireme`）；稀有资源写进记录表的文本框（第二件记为 `名称 ×2`）。这份映射由扫描脚本从 `record/index.html` 的 `cycleData` 里读出来，不要手写第二份。
- 结算过的卡会记住（存进主控台 `state.exploration.settledByCycle`，按循环 + 卡 + 天数），显示「已结算 + 资源清单」并提供「撤销结算」；撤销走同一条写入通道做减法，把记录表还原。
- 下一次「抽探索卡」会清掉上一轮的已结算标记，同一天重复抽到同一张卡仍可结算。
- 只读窗口（未接管编辑）里按钮被 CSS 禁用，不会写存档。

## 已知限制

- **图标条件**：少数卡的条件是纯图形徽章（时间线/毁灭计数一类，如 `ICON(...)/5+`），没有文字可读，扫描结果标成 `icon` 条件，结算时归到「让玩家点选分支」。
- **图标资源**：个别卡的资源也印成图形（祭司、稀有资源等），无法确定名称，脚本记为 `unresolved`，不会写成错误的资源；这类卡的资源部分需要手动处理。
- **转录误差**：数字与徽章来自视觉打标，`tools/exploration-card-resources-review.csv` 保留了每张卡的原始句子与备注，发现不一致时改转录文件再跑一次脚本即可。
- c3 的卡名在主控台牌库里仍是「Cycle III 探索卡 <id>」；扫描数据里有真实标题（`titleZh`/`titleEn`），牌库改名不在本次改动范围内。

## 测试

```bash
node tools/test-exploration-card-resources.js          # 判定/条件/写表/撤销 纯逻辑
node tests/exploration-resource-settlement.test.cjs   # 页面函数集成（含卡组覆盖率）
```

> 仓库里的 `node --test` 需要派生进程，在受限沙箱里会 `EPERM`；直接 `node <文件>` 会在同进程内跑完这些用例。
