# 官方故事书资料打包

导出 `.atopack` 时，开启原有的故事书导出选项，会从设置的 ATO 项目读取
`story/data/storybook-official-data.js`，并按其中的 `officialScan.src` 收集对应截图。
项目没有官方文件时，会使用此前导入素材库的官方资料。

官方文件作为独立的 `resourceFiles` 条目保存，保持项目相对路径和原始字节，逐文件记录 SHA-256。
不包含备份文件、扫描制作清单或 QA 图片。民间故事仍使用原有 `stories` 数据。

## 民间版资源包不带任何官方内容

民间版资源包默认不带官方故事书正文数据（`story/data/storybook-official-data.js`），
也不带官方版故事书截图（`story/data/ato-storybook-key-scans/*`，本地 2195 张原书页面；
后缀 `.jpg/.jpeg/.png/.webp` 都算，且不限大小写）：`manifest.resourceFiles` 为空，
格式版本保持 2。民间版只包含素材库里的民间正文、人物小传和自己的图片。

导入不含官方数据的包后，官方版模式读不到官方正文，对应条目会退回民间正文 / 提示没有
原书扫描图：故事页把扫描图那一块换成「该条目暂无对应的官方扫描图（本地未提供原书页）」的
提示（`handleStoryImageError`，`story/assets/app.js`），并把该条目记进 `missingOfficialScans`——
之后不再渲染必然失败的 `<img>`，「第二屏显示原书扫描图」勾选框弹回并禁用，提示改成
「本机没有这张原书扫描图，第二屏会改为显示官方正文」，第二屏快照也直接改发官方正文。

需要构建官方版资料包（含官方正文数据，可选带截图）时显式打开：

- 素材工具界面：导出面板勾「包含官方故事书正文数据」，要截图再勾「包含官方版故事书截图」
  （勾截图会顺带带上正文数据）。
- 完整包命令行工具 `asset-studio/tools/build_full_pack.py`、`update_full_pack.py` 加
  `--include-official-scans`。重建旧包时默认把旧包里的官方资料丢掉，加参数才保留。

打开后才会校验清单引用的截图是否齐备，缺失会停止导出并指出路径；不带截图的包不会因为
本地缺图而导不出来。`resourceFiles` 非空时资料包是格式版本 3。

完整包构建和更新工具通过 `--overlay-root` 加入本地官方资料；更新工具也能保留旧包已有的官方资料
（不带截图时只保留其中的官方正文数据）。
素材库导入、重新导出、兼容 ZIP 导出以及安装到原项目都支持这些文件。

官中图片放在 ATO_assistant 根目录的 `official-assets/`。**这些图默认不进包**：导出只带素材库里的素材，
要覆盖必须在导出面板勾「使用 official-assets 官中覆盖图」（`official_assets: true`）。打开后按清单目标
路径查找覆盖文件，再回退到素材库或项目原图；完整路径和省略前置目录的资源目录写法都支持，扩展名与清单
不一致（`.png` 配 `.jpg` 目标等）也能匹配，前提是唯一命中。

不含官方资料的包继续输出版本 2。修改配置不会自动重建已存在的资料包。

对外分发的**民间版**资料包用 `tools/build_fan_pack.py` 打：素材以 ATO_assistant 工程目录为
真源，官方故事书正文数据默认进包（版本 3），原书截图只有加 `--include-official-scans` 才进包；
见 [.atopack 打包（民间版 / 官方版）](ATOPACK-PACKING.md)。
