在现有透明蒙版中直接排入地图隐藏数字，沿用“显示地图标志”开关。

- C1：066 正面右上角的隐藏数字，包含用户参考图圈出的完整四位。
- C2：002 正面桥下的小数字。

原扫描图、现有蒙版排除图和局部对比度增强图检查覆盖全部 511 个图面，确认上述两组；C3/C4/C5 未发现其他可确认的遗漏。原图仅用来核对内容和位置。根据用户要求，最终使用 Times New Roman 正体直接绘制数字，不使用斜体或扫描裁片。位置、整体大小和各处深浅分别配置，前导零与字形内部透明空洞保留。

`tools/map-hidden-number-regions.json` 保存文本、1024 像素蒙版中的位置和大小、颜色，以及数字加入前的原蒙版 SHA-256 和本机备份路径。`tools/complete-map-hidden-numbers.py` 在透明图层上用字体排字，以四倍尺寸绘制后抗锯齿采样，并合并至原蒙版。它从加入数字之前的备份重建，彻底移除上一版扫描裁片；全部原有图标像素及新数字之外的原 RGBA 保持不变。默认生成预览和校验备份，`--apply` 校验全部目标后原子替换。原蒙版应先完成既有的标注补充和轮廓修复：

```text
python tools/complete-map-hidden-numbers.py
python tools/complete-map-hidden-numbers.py --apply
```

默认字体为 `C:/Windows/Fonts/times.ttf`（Regular），其他路径可用 `--font` 指定。报告记录实际字体 SHA-256 及排字参数。

已安装至 `map/images/hd1024/overlay/`。本轮正体预览、独立透明数字层、1022 个图层的操作前哈希与替换前蒙版备份保存在 `output/reports/map-hidden-numbers-upright-20261020/`。此前斜体版本与数字裁片版本的证据分别保存在 `output/reports/map-hidden-numbers-typeset-20261020/` 与 `output/reports/map-hidden-numbers-20261020/`。素材及本机报告继续沿用现有 Git 忽略约定。

`export/ATOassets-map-hidden-numbers-20261020.atopack` 同步替换为直接排字版本，供已有完整分层地图素材的安装增量导入。包内包含两张修正蒙版及其两张配套底图，上一版增量包保留在本轮报告的 `superseded/` 中。

验证：九项排字、原图标像素保留、旧裁片替换、备份校验及幂等安装测试通过。两处合成放大目检通过，数字非透明像素的 RGB 均为配置的纯色；旧裁片范围中不属于新数字的像素已恢复为原蒙版。511 张底图及其余 509 张蒙版 SHA-256 不变，1022 张 PNG 解码正常。增量包约 912 KiB，ZIP CRC、清单依赖、四个文件的字节及 SHA-256 校验通过。详见本轮 `hidden-number-report.json` 及 `verification.json`。

2026-10-20 按用户要求重新构建两份完整 Q85 资源包，均包含最新正体数字蒙版：

- `export/ATOassets-民间版-分层地图-q85-2026-10-20-v3.8.9-r5.atopack`：1,617,446,949 字节（约 1.51 GiB），4898 个成员。
- `export/ATOassets-官方版-分层地图-q85-2026-10-20-v3.8.9-r5.atopack`：2,816,438,947 字节（约 2.62 GiB），7095 个成员，含 2196 个官方资料文件。

两包均经构建器 `--verify full` 及独立 `check_pack.py --crc --hash` 校验。逐一核对每包全部 1302 张地图 PNG，均与当前工程原字节一致，且两处隐藏数字蒙版 SHA-256 与正体验收报告一致。没有覆盖旧完整包；新包的摘要、构建日志、校验日志与 SHA-256 文件位于 `export/`，独立地图验收记录位于 `output/reports/atopack-r5-20261020/verification.json`。
