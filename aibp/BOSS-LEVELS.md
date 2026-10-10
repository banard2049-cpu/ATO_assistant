# Boss 等级数据

`boss-levels-data.json` 和 `boss-levels-data.js` 由 `tools/export_boss_levels.py` 从
`Boss等级属性汇总.xlsx` 的“等级属性”“说明与覆盖”表生成。Excel 是维护入口，修改后
重新运行转换器；两个生成文件使用相同内容。JS 可以通过普通 `<script>` 离线加载，
也可以用 CommonJS `require` 读取。

```powershell
python tools/export_boss_levels.py outputs/boss-attributes-20261010/Boss等级属性汇总.xlsx
```

```javascript
const row = window.AIBP_BOSS_LEVEL_DATA.bosses.HEKATON.levels["3"];
console.log(row.stats.wounds, row.stats.movement, row.stats.hitRequirement);
console.log(row.bonuses.promotions, row.bonuses.dangerPerAttack);
```

等级键使用数字字符串，`label` 保留罗马数字。生命值、移动、命中要求在 `stats`；
特质、条件效果原文及卡图和 Excel 行号分别在 `traitChanges`、`notes`、`source`。
无限移动、横杠和带星号的面板移动值保留为字符串。

| `bonuses` 字段 | 表中列 | 自动处理 |
| --- | --- | --- |
| `promotions` | 开战晋升 | 联动晋升，补足尚未执行的次数 |
| `at` | AT力场加成 | 正数用 AT+，负数用 AT− |
| `dangerPerAttack` | 危险／攻击 | 普通 DA+ Token |
| `dangerPerHit` | 危险／命中 | DA+ Token，保留下方“每命中”提示 |
| `fatePerAttack` | 命运／攻击 | 普通 Ψ+ Token |
| `fatePerHit` | 命运／命中 | Ψ+ Token，保留下方“每命中”提示 |
| `evasionDice` | 闪避骰加成 | ED+ Token，提示“额外闪避骰” |

各级均为该级总量，不跨级相加。自动标记记录自身贡献，切换等级时只替换这些贡献，
保留手动添加和 AI 牌库耗尽带来的标记。普通与每命中标记分堆存放；重复渲染保留
标记 ID、位置和晋升进度。旧存档中的首次晋升会迁移进统一进度，不再次执行。

表中没有的 Boss/等级不推算，停止晋升并撤掉旧等级的自动标记。
条件特质仍保留其原文和现有交互规则，不从备注猜测额外的固定加成。
UR「只是一段回忆」（TR I 2）在一级默认生效，并独立贡献 1 个 AT− 指示物；
二级及以上移除该卡与这部分指示物。一级手动取消／恢复特性也会同步指示物，
保留手动添加的 AT− 数量与位置。
其余 Boss 的添加、取消、替换与特性指示物核查见 [BOSS-TRAITS.md](BOSS-TRAITS.md)。
AI 区点击“查看等级特性”可查看当前生效及移除的特性与处理提醒。
降低等级会同步标记，但不会逆向重排已经晋升的牌堆；需要重置牌堆时使用“新战役”。

损伤区与第二屏显示当前损伤 / 总生命，总生命读取本表 `stats.wounds`。
“秒杀 Boss”用于已经手动结算致死一击后的资源补伤（用户提供的规则书第65页）：
从 BP 卡组顶部逐张补入损伤，BP III 用 DW 计2点；每张加入后检查生命值，达到或超过
就停止。未达到时仅执行 BP 晋升，再抽下一张。BP III 实体卡放回 BP 卡组底部。
整个补伤过程保存为一条 BP 撤销记录，不触发战斗中的疼痛、神浆、临界质量等效果。
特殊战斗按对应规则分支处理；不适用致死一击的阶段禁用此操作。
