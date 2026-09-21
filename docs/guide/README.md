# ATO Assistant 图文使用手册（交付目录）

本目录是「从下载安装到使用细节」的图文教程成品。

| 文件 | 说明 |
| --- | --- |
| `ATO-Assistant-图文使用手册.docx` | **主要交付物**：21 处内嵌截图（20 张，其中主控台底部图复用于两处）+ 20 张表格，可在 Word / WPS 编辑或导出 PDF |
| `ATO-Assistant-图文使用手册.html` | 浏览器直接看的图文版（打印优化，`Ctrl + P` 可另存为 PDF） |
| `ATO-Assistant-图文使用手册.md` | Markdown 母版，改文案后重新生成上两者 |
| `images/` | 20 张原始截图（19 张 1600×1000 桌面 + 1 张 430 宽窄屏），按章节编号命名 |

## 手册结构

1. 开始之前 — 这是什么、由哪些界面组成、需要准备什么
2. 下载与安装 — Windows / macOS / Docker-NAS / 源码四种方式
3. 第一次启动 — 登录、注册（含账号规则）、`data/` 目录说明
4. 主控台速览 — 布局、今日流程七步、右栏与底部面板、窄屏布局
5. 核心模块详解 — AIBP、地图、英雄、科技、记录表、故事、第二屏、素材库
6. 资源与素材 — `.atopack` 导入、图片目录对照表、BGM、导出备份
7. 进阶与常见问题 — 多设备写入锁、版本迁移、报错对照表、端口与安全、许可
8. 附录 — 截图索引、已知缺口、采集与生成方式（可复现）

## 重新生成

改完 `.md` 后：

```bash
node ../tools/guide-capture/build-docs.mjs          # 生成 docx + html
node ../tools/guide-capture/verify-docx.mjs "ATO-Assistant-图文使用手册.docx"   # 校验 docx
node ../tools/guide-capture/build-docs.mjs --pdf    # 需要浏览器权限，受限环境下会失败
```

PDF 推荐用 Word/WPS 从 `.docx` 导出，或用浏览器打开 `.html` 后 `Ctrl + P`（取消页眉页脚）。

## 截图来源

全部截图都是 ATO Assistant 2.0.0 真实运行界面的自动采集结果，采集脚本见 `tools/guide-capture/`：

- 演示账号 `atoguide26`，全新空存档 → 记录表资源为 0、地图未探索、英雄列表为空
- 无本地图片素材 → 地图画布深色、部分头像为灰色占位
- 首次运行界面（登录页、注册页）来自空账号环境

截图的取舍与缺口见手册「附录 B」。
