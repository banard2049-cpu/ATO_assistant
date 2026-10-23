# C4/C5 科技卡深色面调色

已直接调整本地 `technology/images/split_cards/` 中的 134 张深色面：C4 65 张、C5 69 张。按科技卡字典的 `image.back` 选择素材，不能按文件名判断正反面；部分深色面的文件名以 `_face.jpg` 结尾。

按用户选择使用曲线和色阶批量调色。以 C1–C3 相同卡型的暗部、中间调为参考，分别校正 RGB 通道，降低扫描图的灰绿底色。125 张偏亮扫描按循环、类别及横竖版统一处理；9 张原本较暗的扫描单独轻调。曲线保持单调，编码前保留 RGB 各通道均达到 190 的亮色像素；JPEG 使用质量 98、无色度抽样。

核验结果：134 张图片尺寸、卡面内容和布局保持原样；504 个受保护文件的 SHA-256 未变，覆盖 C1–C3 卡图和 C4/C5 浅色面。C4/C5 竖版卡的中位亮度分别由 71.3、68.4 降至 22.6、22.7，与 C1–C3 接近。已检查整批缩略图和生产卡、能力卡、航行卡、横版卡的原尺寸样张。

- 原图备份：`output/tech-dark-tones-20261023/originals/`
- 每图校验值、曲线和安装记录：`output/tech-dark-tones-20261023/installation.json`
- 简要对照：`output/tech-dark-tones-20261023/preview.jpg`
- 完整样张对照：`output/tech-dark-tones-20261023/comparison.jpg`
- 工具：`tools/match-tech-card-dark-tones.py`；先暂存和检查，使用 `--apply` 安装。安装后拒绝重复压暗。

本次更新本地素材文件。图片不进入 Git；已有 `.atopack` 文件未改动，后续资源包应从更新后的素材目录打包。
