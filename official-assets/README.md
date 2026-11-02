# 官中图片资源

把自己有权使用的官方中文图片放在这里。这个目录是本地私有覆盖目录，不会被便携版、Docker 或 APK 的源码打包带走。

**默认不随资料包分发**：导出 `.atopack` / 兼容 ZIP 时**不会**使用这里的图，包里的图只来自素材库（你自己拍下/导入的素材）。只有显式打开才允许覆盖——素材库导出面板勾「使用 official-assets 官中覆盖图」，或调用导出时传 `{"official_assets": true}`。

需要用到这个目录时，程序按清单目标寻找对应图片：

- 推荐直接镜像项目路径，例如 `official-assets/aibp/ps/HEKATON/HEKATON_BP_I_001.jpg`；
- 也支持按资源目录缩短，例如 `official-assets/HEKATON/HEKATON_BP_I_001.jpg`；
- 找不到对应图片时，继续使用素材库或原始项目/APK 中的图片。

文件名应与项目清单一致（扩展名可以是 `.jpg`、`.jpeg`、`.png`、`.webp` 中任一种，**也不限大小写**：
清单目标写 `.jpg` 而这里放 `.png`（或 `.JPG`）同样算命中，前提是去掉后缀后的路径唯一——同名候选多于
一个时会回退到素材库或项目原图。资料包内的路径始终照清单目标，不会因为这里换了后缀或大小写而改变。
目录中的额外文件不会进入资料包。

**AIBP 固定牌背统一使用民间素材**：此目录不再保存固定的普通牌背；即使以后重新放入，
导出官方版、完整包或显式开启官中覆盖时也会跳过这些官方牌背，继续使用工程目录或素材库中的民间资源。
这也包括只有装饰图案的 AI III 特殊牌背。双面都有效果的卡保留官方背面，例如部分使徒的
Routine 背面、乌尔-弗里斯的 Routine 背面，以及火卫一之龙带部位信息的 BP 背面。
判定按已核对的卡面执行，不按 `_BACK` 后缀一概删除；未知卡面默认保留。

## 勘误打印稿高清素材

可用 `tools/import_official_errata_pdf.py` 导入已核对的 12 页 `ATO_errata.pdf`
（需要 PyMuPDF 和 Pillow；脚本校验源文件 SHA-256，拒绝未经核对的其他排版）：

```powershell
python tools/import_official_errata_pdf.py --pdf "完整路径/ATO_errata.pdf" --apply
```

不加 `--apply` 时只提取预览。脚本按打印稿的实际裁切框去掉出血和裁切线，
18 张完整位图按原生分辨率裁出，其余混合矢量文字的卡面以 600 DPI 合成。
安装只替换清单已匹配的 24 张官方覆盖图，并先将整批原图备份到
`official-assets/_backups/errata-20261031/`。逐图页码、裁切框、尺寸、前后哈希
和对照图保存在 `output/errata-20261031/`。

打印稿中的米诺斯血统（AG0143）和归来者完整面板（CK1279）暂无对应卡面目标，
提取到 `unmapped-reference/`。第 12 页的 7 张早期装备规则版及背面提取到
`optional-early-gear/`，供手动选择；它们不会自动覆盖现用平衡版装备。

本地已按用户选择，将 CJ1539–CJ1545 的 7 张正面切换为早期版；平衡版原图单独备份到
`official-assets/_backups/errata-20261031-early-gear/`。可用以下命令单独执行或重现该选择：

```powershell
python tools/import_official_errata_pdf.py --pdf "完整路径/ATO_errata.pdf" --early-gear --apply
```

这一步覆盖 7 个现有装备文件，包括 3 个同装备的编号副本；当前清单只直接引用其中
4 个装备条目。装备清单没有背面引用，打印稿的 7 张背面仍保存在备用目录。
