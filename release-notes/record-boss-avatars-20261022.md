# 记录表 Boss 头像与 2026-10-22 资源包重打

记录表「敌人」面板新增 Boss 头像，并同步把 19 张头像登记进素材清单、重打两版 `.atopack`
和 APK 导入名单。头像 PNG 是私有素材（不进版本库），所以清单按固定文件名登记，资料包与
APK 内置名单只认这份名单。

## 记录表

- 19 张 512×512 透明 PNG，直接从官方 AI 卡背提取，未重绘；来源与处理记录见
  `output/boss-avatars-from-cardbacks-20261022/`。
- 头像文件缺失时页面不显示破图：`record/index.html` 的 `makeBossAvatar` 在 `error`
  后摘掉 `<img>`、退回纯文字标题，并把 `bossKey` 记进 `missingBossAvatars`，重绘不再
  重复请求缺图；没有映射的 Boss 也完全不建图片元素。
- 头像加入 `record/assets/boss-avatars/`，显示尺寸 36px。

## 素材清单

- `asset-studio/app/catalog.py`：新增 `BOSS_AVATAR_FILES` / `BOSS_AVATAR_LABELS`，
  模块「记录表图标」、子组「Boss 头像」，`capture_required=False`（不是实体卡，
  素材库不提示拍摄）。
- `asset-studio/app/fixed_catalog.py`：登记 19 条，`catalog_version` 追加
  `+record-boss-avatars-20261022`，已有素材库会收到新条目。
- `asset-studio/pack-shrink-keep.txt`：`record/assets/boss-avatars/*` 原字节进包，
  避免调色板重编码改动透明边缘。
- 包内统计：3237 条目 / 4760 面 / 3525 张图 / 1302 张地图图层；民间版 4917 个成员，
  官方版 7114 个成员。

## 两版资源包

均按 r5 口径：分层地图、Q85、`--image-quality-keep-file asset-studio/pack-shrink-keep.txt`、
`--verify full`。

- `export/ATOassets-民间版-分层地图-q85-2026-10-22-v3.8.10-rc.1-r1.atopack`
  1,618,819,717 字节（约 1.51 GiB），4917 个成员。
  SHA-256 `c335b62ef7a891377326d81c88833bfe9967ca20882e59e664d5f6cae8c56682`。
- `export/ATOassets-官方版-分层地图-q85-2026-10-22-v3.8.10-rc.1-r1.atopack`
  2,817,796,696 字节（约 2.62 GiB），7114 个成员，含 2196 个官方资料。
  SHA-256 `4feb462db8e066d436b371cadc6ac4c195938c5ab613457f2e758f21ad70d514`。

两包都通过打包器 `full` 校验与 `check_pack.py --crc --hash`（3525 张图、密语字形、
混合媒体、1302 张地图 PNG 的哈希与 CRC 全部一致），并逐一核对 19 张头像与工程原字节
相同、1302 张地图 PNG 与工程原字节相同。

### 官方版修正：官中图不能再顶替头像

首轮官方版重打时发现：`official-assets/ps/<BOSS>/<BOSS>.jpg` 与头像同 stem，官中图的
文件名兜底把整张使徒大卡塞进了 `record/assets/boss-avatars/<BOSS>.png`（2 MB 的 JPEG
顶着 .png 名字）。`official_assets.find()` 现在对 `record/assets/boss-avatars/` 直接
返回无覆盖，使用项目自己的 512×512 PNG；普通 `aibp/ps/...` 卡图仍正常走官中覆盖。
回归见 `asset-studio/tests/test_official_assets.py`。

## APK

- `export/ATO-Assistant-3.8.10-rc.1-local.apk`（3,409,286 字节，含当前工作区最新的
  第二屏故事页面修正）。
- 内置 `assets/atopack-catalog.json` 已包含 19 条头像映射（共 6146 个 itemId/face），
  导入新包时不会再把头像静默跳过。
- 包含 `AtopackStore` 的大文件响应修正（显式 Content-Length + no-store），以及记录表
  「缺头像不显示破图」的页面代码。
- 本机没有发布签名，Gradle 用 Debug keystore 构建，**只能测试，不能发布**；发布 APK
  仍需用正式签名重新构建。参考：`tools/export_android.py --version 3.8.10-rc.1`。
- 验证：`tools/test_android_atopack_import.py`（149 + 32 + 47 项）、
  `tools/test_android_resource_catalog.py` 对该 APK 全量通过；两版包的每个资源都能
  对上 APK 的 itemId/face 与目标路径。

## Docker

- 镜像里不含 `record/assets`（私有图片不进镜像），发布包用
  `./app/record/assets:/app/record/assets` 整棵挂载；新增的
  `record/assets/boss-avatars/` 因此随资料包解压到宿主机后即时生效。
- 仓库根 `docker-compose.yml` 的 `./record:/var/www/html/record` 同样整棵覆盖。
- 两份 compose 加了说明；`tools/test_docker_mounts.py` 增加 Boss 头像子目录的显式
  覆盖断言，原来「从资料包清单反推挂载」的检查现在也会把 19 张头像算进去。
- 本机没有 `docker` 命令，无法构建镜像；镜像仍由发布流程构建。挂载、打包排除、
  许可证检查均通过。

## 复现命令

```text
asset-studio/.venv/Scripts/python.exe asset-studio/tools/build_fan_pack.py \
  --ato-root . --output export/ATOassets-民间版-分层地图-q85-2026-10-22-v3.8.10-rc.1-r1.atopack \
  --image-quality 85 --image-quality-keep-file asset-studio/pack-shrink-keep.txt --verify full

asset-studio/.venv/Scripts/python.exe asset-studio/tools/build_official_pack.py \
  --ato-root . --output export/ATOassets-官方版-分层地图-q85-2026-10-22-v3.8.10-rc.1-r1.atopack \
  --image-quality 85 --image-quality-keep-file asset-studio/pack-shrink-keep.txt --verify full

asset-studio/.venv/Scripts/python.exe tools/export_android.py --version 3.8.10-rc.1
```

报告与校验脚本：`output/reports/atopack-r6-20261022/`（`verification.json`、
`verify_r6.py`、`verify_apk_pack.py`、构建与测试日志）。
