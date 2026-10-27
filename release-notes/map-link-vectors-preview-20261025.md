# 地图链接指示物矢量预览

仅生成独立实验资源和对照页，没有替换地图、原图、现有角标、卡背或运行时注册表。

## 覆盖与两种方案

全量源轮廓方案覆盖 C1–C5 共 511 面，包括 7 个 C1 特殊版本和 C5 的 160 个 A/B 面。库存按原图 alpha 组件检测，不凭邻接数据补造不存在的牌：1,538 块边缘链接牌、12 块 C2 内部航路牌、25 块 C3 特殊航路牌、756 个独立箭头和 71 个附格。另有两处箭头与牌相连，包含在牌本身的轮廓内。

`output/map-link-vector-review-20261025/index.html` 提供整图/仅链接路径、循环筛选、编号搜索和放大对照。`links/` 下的 511 个 SVG 只有路径，不含图片、字体或外部依赖。`overlays/` 是预览用合成蒙版，内联保留正式角标 SVG 的原始内容，仅遮去本次链接区域。

`native-samples/index.html` 另有 12 面的 37 块几何重建样例，每个循环都覆盖上下左右。数字和派系复用背面原生路径，外框、色格、锁及三层水波用几何绘制。白色外框、50 条共用分格正常边及内缩细框均保留，链接牌与箭头不再叠加细黑描边。C4 按原图用两条等粗的 2 像素黑线夹黄色带，编号格和派系格等高，仅派系内框内部填深棕灰；派系图案按真实路径极值统一适配 46 像素框，并居中在深色内框内，下方不再缩小或偏下。19 个上下箭头均为五条直线组成的对称五边形：保留源图宽高和位置，尖点居中，两侧肩部等高，边框按平行线向内等距 2 像素收缩，不再沿用扫描毛边；α/β 按原图墨迹范围适配。锁保留源图 29×30 的尺寸，将完整锁图形居中放在圆圈内。

`glyphs/index.html` 提供 24 个附加图标的来源和路径对照，其中 7 个沿用已有路径、14 个从孤立位图轮廓描摹、2 个希腊字母字体轮廓、1 个原生水波路径子集。该图库是参考素材，没有自动套入全量源轮廓方案。

## 验证及限制

- 87 项现有地图回归通过。
- 全量 511 个纯路径文件、511 个合成蒙版、2,402 个源组件结构检查通过；2,877 个源文件及正式资源 SHA-256 未变。
- Chromium 逐面解码和渲染通过；链接修改区以外的像素差异为 0。筛选、搜索、复杂面放大、390 像素宽移动布局通过，无页面错误或失败请求。
- 37 块几何样例和 24 个图标均用独立 librsvg 渲染；10 个 α/β 和 19 个上下箭头的尺寸及位置边界误差均为 0 像素，2 个锁的图形中心与圆心误差为 0 像素，锁的渲染尺寸相对源图至多差 1 像素（抗锯齿阈值）。见 `native-samples/size-check.json`。
- 全量描摹的最低外轮廓 IoU 为 98.95%。仍有 106 项细线/亮边质量警示；已目视最低分的 12 块牌，数字、派系和字母可辨，但部分边线变细或断续。源轮廓方案也保留扫描歪斜，不能视为全部达到原生几何样例的平滑度。未将其接入游戏。

## 重建与核验

```powershell
python tools/inspect-map-links.py
python tools/build-map-link-review.py
python tools/build-map-link-glyphs.py
python tools/build-map-link-native-samples.py
node tools/render-map-link-samples.cjs
python tools/verify-map-link-vectors.py
node tools/verify-map-link-vectors.cjs
node tools/verify-map-link-native-sizes.cjs
python tools/verify-map-link-native-frames.py
python tools/verify-map-link-native-arrows.py
```

生成器没有安装或 `--apply` 选项。以上工具读取本地已有资料，输出留在独立审核目录；Python 依赖 Pillow、NumPy、SciPy、scikit-image 和 fontTools，渲染使用已有 Sharp/librsvg 与 Playwright/Chrome。

## 放回地图的对比图

`placement-review/index.html` 提供 8 张高清对比图及 ZIP：五循环的 12 面完整地图、20 组四方向背景局部、8 组多格／锁／字母／邻近标记，以及 C2、C4、C5 A/B 的真实相邻地图网格。只把最新的 37 个已审定几何链接放回它们原来的坐标，其他链接、角标、内部航路和底图保留当前素材。

合成 SVG 使用原图连通组件遮罩清除对应旧标记，内联同一 1024 坐标系中的原生路径，避免再次平移或压缩。49 个合成及周边地图 SVG 均经独立 librsvg 渲染；12 个替换面在修改范围之外的像素变化为 0，123 个输入文件哈希保持一致。已目视检查城市横幅、地点圆标、C5 双出口及右下角标的邻近位置。

```powershell
python tools/build-map-link-placement-review.py --stage
node tools/render-map-link-placement-review.cjs
python tools/build-map-link-placement-review.py
```
