# 地图板块角标核对 · 2026-10-13

按 C5 → C4 → C3 → C2 → C1 的顺序，逐块目视核对本地 `map/images/` 的左下角进展／灾祸和右下角派系。C5 的 A 面对应 front，B 面对应 back；C1 另核对七块替代版。

| 循环 | 核对面数 | 左下角错误 | 右下角错误 | 修正面数 |
| --- | ---: | ---: | ---: | ---: |
| C5 | 160 | 29 | 27 | 41（均为 B 面） |
| C4 | 81 | 1 | 1 | 2 |
| C3 | 92 | 0 | 0 | 0 |
| C2 | 84 | 0 | 4 | 4 |
| C1 | 94（含七块替代版） | 0 | 0 | 0 |
| 合计 | 511 | 30 | 32 | 47 |

C5 的 A 面、C3、C1 的两类角标均正确。C4 的 009 原本已标注进展，不需要修改。

以下只列实际修正；“—”表示该角标原本正确。

| 板块面 | 左下角（修正前 → 修正后） | 右下角（修正前 → 修正后） |
| --- | --- | --- |
| c5:003:B | — | Outcast Vanguard → Followers of Areté |
| c5:006:B | 无 → 灾祸 | — |
| c5:008:B | 无 → 进展 | Cycladean Protectorate → Followers of Areté |
| c5:009:B | — | Cycladean Protectorate → Followers of Areté |
| c5:012:B | 无 → 灾祸 | Outcast Vanguard → Followers of Areté |
| c5:013:B | 无 → 进展 | Outcast Vanguard → Followers of Areté |
| c5:015:B | 无 → 灾祸 | — |
| c5:016:B | 无 → 进展 | — |
| c5:017:B | — | Followers of Areté → Outcast Vanguard |
| c5:018:B | — | Followers of Areté → Outcast Vanguard |
| c5:019:B | — | Cycladean Protectorate → Followers of Areté |
| c5:020:B | — | Followers of Areté → Outcast Vanguard |
| c5:024:B | 无 → 灾祸 | — |
| c5:026:B | 无 → 灾祸 | — |
| c5:028:B | 无 → 进展 | Followers of Areté → Outcast Vanguard |
| c5:029:B | 无 → 灾祸 | — |
| c5:030:B | 无 → 进展 | Followers of Areté → Outcast Vanguard |
| c5:041:B | 无 → 灾祸 | — |
| c5:042:B | 无 → 进展 | Outcast Vanguard → Followers of Areté |
| c5:046:B | 无 → 灾祸 | — |
| c5:048:B | — | Cycladean Protectorate → Outcast Vanguard |
| c5:049:B | 无 → 灾祸 | Cycladean Protectorate → Outcast Vanguard |
| c5:050:B | 无 → 进展 | — |
| c5:053:B | 无 → 进展 | Outcast Vanguard → Followers of Areté |
| c5:056:B | 无 → 进展 | Cycladean Protectorate → Outcast Vanguard |
| c5:057:B | 无 → 灾祸 | — |
| c5:060:B | 无 → 灾祸 | — |
| c5:061:B | 无 → 灾祸 | Cycladean Protectorate → Outcast Vanguard |
| c5:064:B | — | Outcast Vanguard → Followers of Areté |
| c5:065:B | 无 → 进展 | Outcast Vanguard → Followers of Areté |
| c5:067:B | — | Cycladean Protectorate → Outcast Vanguard |
| c5:068:B | 无 → 灾祸 | — |
| c5:069:B | 无 → 进展 | — |
| c5:071:B | 无 → 进展 | Cycladean Protectorate → Outcast Vanguard |
| c5:072:B | — | Cycladean Protectorate → Outcast Vanguard |
| c5:073:B | — | Cycladean Protectorate → Followers of Areté |
| c5:074:B | 无 → 灾祸 | Cycladean Protectorate → Followers of Areté |
| c5:075:B | 无 → 进展 | Outcast Vanguard → Followers of Areté |
| c5:076:B | — | Outcast Vanguard → Followers of Areté |
| c5:077:B | 无 → 灾祸 | Cycladean Protectorate → Followers of Areté |
| c5:078:B | 无 → 进展 | — |
| c4:001 | 灾祸 → 无 | — |
| c4:080 | — | Wasters → Cloud Thieves |
| c2:019 | — | 希洛人 → 希洛人、独眼巨人 |
| c2:020 | — | 独眼巨人 → 希洛人 |
| c2:021 | — | 独眼巨人 → 希洛人 |
| c2:022 | — | 希洛人 → 邦联同盟 |

修正保留了已有的冒险、城市等其他标签与备注，并递增标签文件版本号。地图和主控台的标签脚本缓存版本也已更新。

同时修复 `tools/tag-editor.js` 与 `api/map-tile-tags.php` 在归一化时丢掉 A／B 面键后缀的问题，防止标签保存时把 C5 双面记录覆盖到基础记录。

验证：逐块核对期望值保存在 `tests/fixtures/map-tile-corner-audit.json`；角标与切面读取、原有切面移动和最后到访城市检查共 18 项通过。标签编辑器的保存／冲突检查通过，PHP 接口的读取、反复保存与并发冲突检查通过。
