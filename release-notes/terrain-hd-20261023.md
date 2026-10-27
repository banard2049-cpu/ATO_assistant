# 八张地形高清图更新（2026-10-23）

用用户提供的八张 PNG 替换本地 `ss/terrain/` 同名资源：

- 迷宫 I/L/O/Z：`labyrinth-i.jpg`、`labyrinth-l.png`、`labyrinth-o.jpg`、`labyrinth-z.png`。
- 石柱：`column.jpg`。
- 城市及废墟城市：`city.jpg`、`ruined-city.jpg`。
- 安布罗西亚池：`ambrosia-pool.jpg`。

保留原始像素尺寸，不缩放。六张矩形图沿用 JPEG 格式，以质量 98、4:4:4 采样保存；L/Z 保留 PNG 透明缺口。L 形源图逆时针旋转 90°，匹配现有 3×2 占格（底行三格、右上单格）；Z 形及其他图保持方向。地形坐标、翻面和视线规则不变。

主屏和第二屏的地形资源与脚本缓存版本更新为 `20261023-hd1`。图片保持为本地素材，不进入公开源码；Android 需要重新导入包含新版图片的 `.atopack`。

验证：八张图的解码、替换哈希及原图备份校验通过；前后对比图已目视检查，L/Z 占格及透明缺口检查通过；`tools/test-ss-terrain-data.cjs`、`tools/test-aibp-battle-map-control.cjs` 与 `git diff --check` 通过。`tools/test-second-screen-map-display.cjs` 因无法启动 PHP 子进程（EPERM）跳过。

本地原图备份与替换回执位于 `tmp/terrain-before-20261023-hd/`，对比预览为 `tmp/terrain-hd-comparison.png`。
