根据用户指定的 TTS 存档 `3458296558.json` 补齐五张地图正面的隐藏数字：

| 图面 | 数字 |
| --- | --- |
| C1-014 | 0240 |
| C1-045 | 0312 |
| C2-008 | 5735 |
| C2-037 | 3721 |
| C2-057 | 7214 |

C1-066 的 0223 已存在，本轮核对后保持原文件字节不变。此前加入的 C2-002 数字也未改变。

参考存档位于 `D:/files/My Games/Tabletop Simulator/Mods/Workshop/3458296558.json`。使用其 `CustomDeck` 图集、`CardID % 100` 和网格尺寸从本地 TTS 图片缓存提取卡牌；该存档的 `BackURL` 是地图图面，`FaceURL` 是卷轴卡背。六张提取的地图正面及图集 URL、裁切坐标、源文件哈希保存在 `output/reports/map-hidden-numbers-20261023/`。新参考图确认了先前暗色扫描复核未识别出的五组数字，补充了 2026-10-20 的检查结论。

沿用 Times New Roman 正体排字，新增可选的中心旋转参数，在四倍分辨率旋转后抗锯齿采样。位置通过 TTS 地图图面与现有图标蒙版配准，保留卡面数字的大小、方向及相近深浅。`tools/map-hidden-number-regions.json` 保存数字、位置、颜色、旋转角度、配准信息及原蒙版哈希。生成命令仍为：

```text
python tools/complete-map-hidden-numbers.py
python tools/complete-map-hidden-numbers.py --apply
```

已安装至 `map/images/hd1024/overlay/`，备份、局部对照及数字透明层保存在本轮报告目录。验证仅五张蒙版发生变化，其余 1017 个图层 SHA-256 不变；全部 1022 张 PNG 解码正常，所有原有非透明图标像素和新增数字之外的 RGBA 保持不变。11 项测试通过，包括旋转后的中心、方向、颜色及边界保护。六处数字均已放大目检。既有导出资源包未重新构建。
