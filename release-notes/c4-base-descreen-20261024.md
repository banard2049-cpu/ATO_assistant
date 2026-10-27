C4 共用牌背底图已替换为经确认的第五版降噪图，运行时文件为 `map/images/card-backs/c4-base.png`。81 张 C4 牌背共用新底图，现有编号、派系与邻接方向标记保持原样。

新底图为 1254×1254 PNG，与 `output/c4-base-descreen-20261024/c4-base-descreen-v5-fine-noise.png` 字节一致，SHA-256 为 `4ed951cefe5fa41c0249b9245c74171dd7e4723800b5bd1823ba04a97e2cbc05`。原底图和替换前源码已备份至 `output/c4-base-descreen-20261024/backup-before-install/`，安装清单位于同目录的 `installation.json`。

牌背缓存版本与地图入口的加载版本更新为 `20261024-vector-backs4-c4-descreen1`，生成工具保留相同版本。素材继续按现有规则留在本地，不加入公开源码。

验证：牌背与地图渲染的 16 项现有检查通过；浏览器加载 504 个牌背/覆盖面，C4 81 张均正常，无图片回退、页面错误或手机横向溢出。
