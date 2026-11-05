# Boss 卡牌关键词校对

2026-11-05 按要求进行第二轮**纯视觉复核**：直接阅读当前工作区 `aibp/ps/` 的全部 **1035 张卡图**，密集小字另行放大，未运行 OCR、读取 OCR 缓存或使用扫描文本补足判断。涵盖 AI/BP 正反面、大卡、等级背面、特性、Routine、Signature、Wish、Feint、Flare 及共享卡。824 张为 AI/BP 卡图（677 张正面、147 张背面），其余为面板和其他卡图；卡图数包含装饰牌背，不等于独立牌张数。

本轮在上一轮结果上再修正 **13 张卡图**，补回 **12 处关键词关联**、清除 **2 处误关联**。所有改动另经逐图交叉核对。同一词条的中英文和带 X 的别名合并计数；同一卡图可增加多个词条。上一轮的 316 张修正（增加 158 处、移除 292 处）另存为历史统计，不计入本轮数字。

- 百手巨魔 BP 二级 006 的 FAIL 段补顶推；大卡补大迷宫地形引用。
- 奇美拉 Routine 补位移、等级卡补拖拽；美杜克托斯大卡补位移；哈耳皮大卡补神浆池。
- 两版超时间神谕大卡补不可摧毁，仅印有 IV 规则的一版补冲撞；迷宫机牛大卡补冲撞；DEMIDJINN 大卡补可摧毁。
- TITAN_X 零级 AI 正文明确“不晋升”，补晋升规则引用。
- 迷宫机牛 Trap 卡的类型页脚不等于 Trap 地形，移除该关联；MIDASCORE 的 JUMP & ATTACK 为始徒动作，移除含义不同的通用 Jump 技能关联。

| 资料目录 | 已复核卡图 | 本轮修正卡图 |
| --- | ---: | ---: |
| ALPHA_TEMENOS | 50 | 0 |
| CHIMERA_METASTASIOS | 57 | 2 |
| CYCLONUS | 50 | 0 |
| DAHAKA | 30 | 0 |
| DEMIDJINN | 62 | 1 |
| DRAGON_OF_PHOBOS | 68 | 0 |
| HEKATON | 49 | 2 |
| HERMESIAN_PURSUER | 53 | 0 |
| HYPERTIME_ORACLE | 55 | 2 |
| ICARIAN_HARPY | 53 | 1 |
| LABYRINTHAUROS | 51 | 2 |
| MEDUKETOS | 53 | 1 |
| MIDASCORE | 53 | 1 |
| SUN_DESCENDANT | 51 | 0 |
| THE_BABELIAN_LUNACY | 52 | 0 |
| THE_BURDEN | 51 | 0 |
| THE_NIETZSCJEAN | 53 | 0 |
| TITAN_X | 74 | 1 |
| UR_FLEECE | 54 | 0 |
| other | 16 | 0 |
| **合计** | **1035** | **13** |

`tools/ato-keyword-review.json` 的 `verifiedCards` 保存每张卡图的 SHA-256、完整期望关键词、逐卡读图依据 `evidence` 和本轮编号；`visualReview` 保存范围、统计和全部 13 张改动的依据。上一轮统计保存在 `previousVisualReviews`。旧的 106 张无匹配规则区域复核记录保留作历史依据，以新的精确复核为准。上一轮补入的 `Kickback / 踢飞` 双语词条及其 21 张卡图关联经视觉复核保留。

运行 `python tools/scan_ato_keywords.py --reviewed-only` 可直接从视觉复核记录重新生成 `aibp/card-keywords.json`，不运行 OCR，也不读取 OCR 缓存。本轮索引通过此命令生成。脚本要求所有本地卡图都有记录，并检查每张图片 SHA-256；若卡图新增、删除或内容改变，必须先重新复核。原先不带参数的 OCR 候选模式仍保留。

本轮依据当前本地卡图和词典，其他版本或替换后的卡图需重新核对。仅有同名片段、含义不同的专属规则不会链接到不适用的通用词条。
