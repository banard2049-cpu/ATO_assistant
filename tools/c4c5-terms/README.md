# C4/C5 已核术语替换补丁

将 2026-10-12 定版的逐处术语修订重放到本地故事资料，并同步配套混排文字锚点。公开仓库只提供脚本、短词差异、位置、校验值和合成测试，不包含完整正文、图片、原始证据节选、工作簿或私人资料下载链接。

本工具不接入运行时，不自动安装资料，不改存档、人物索引或人物小传。

## 范围与计数

- 历史已核阶段：10,180 处术语显示字段替换，另含 62 处中文重复后缀删除，涉及 3,411 个字段；其中正文术语 4,682 处。
- 10-12 扩充阶段：2,202 处显示字段编辑，涉及 1,295 个字段；正文 1,081 处术语（C4 270、C5 811，127 个英文词项），另有 5 处中文重复后缀清理。`text` 镜像不重复计入正文数量。
- 两阶段合计涉及 3,839 个不同显示字段。阶段中的字段有重叠，不能将两阶段字段数直接相加。
- 配套 mapping：更新 2,133 行的 6,992 个锚点、上下文、位置及文本指纹字段。图片标识、路径、哈希、裁框和其他元数据保持不变。

只处理指定 C4/C5 的 `title`、`encounter`、`section`、`text`、`officialTitle`、`officialText`、`html` 显示字段；C1-C3、ID、跳转、`originalText`、HTML 标签、链接、空白和英文括号保持原样。10-12 扩充仅改变汉字；历史阶段有且仅有一个已核例外：`乌尔-弗里斯 → 始源羊毛` 共 220 处，随中文音译名移除内部 ASCII 连字符。其余非汉字字符不变。

本补丁的指定译名包含 `The Virtuary → 至臻至贤`（包括已核同称谓变体）。`The Thousand Tales → 一万前一夜` 在此基线没有精确命中，不新增替换；不能将其套用到 `The Ten Thousand Nights and Days`。未核候选、多义词和有冲突的候选没有新增自动替换。全局词表替换不具备这些逐处语境限制，因此本工具不提供该模式。

## 使用

需要 Python 3.10+，仅使用标准库。先在本地备份两份资料和存档。

先检查，完全不写文件：

```sh
python tools/apply-c4c5-terms.py \
  --story /path/to/app/story/data/storybook-official-data.js \
  --mapping /path/to/app/story/assets/mixed-media/mapping.js \
  --check
```

生成到一个尚不存在的新目录（父目录须已存在）：

```sh
python tools/apply-c4c5-terms.py \
  --story /path/to/app/story/data/storybook-official-data.js \
  --mapping /path/to/app/story/assets/mixed-media/mapping.js \
  --output-dir /path/to/c4c5-patched
```

验证成功后，该目录下会同时生成：

```text
story/data/storybook-official-data.js
story/assets/mixed-media/mapping.js
```

核对输出后将两份资料成对安装，再刷新故事页和第二屏。保留现有图片和当前程序代码。只安装正文会使旧 mapping 的文字锚点失配。回退时也应成对恢复备份。不得将这些本地输出强制加入 Git。

## 基线与拒绝策略

代码基于上游 `bb5dcaf72e8d5695520347cd3dc04cc8cbdbdafc`（3.7.2）整理；这不代表已核对任何随 3.7.2 更新的私有资料。程序版本和本地资料版本分别校验。

完整实测过的资料文件 SHA-256：

- 原始故事输入：`d73357e130375c2674c3e6be5fad40372601d38fead28c3c1b932ef92ac208b3`
- 已应用历史阶段的故事输入：`3c63c8f2956ba9f5fab8c08427371193e0b34291e28f647f38a83a234759933c`
- 定版故事输出：`27423326f73d6aca51d06b4190a79f9965d9fa2998a1b303eb035214ecd54a65`
- 原始配套 mapping：`51cc4d5e3e97e0af48cddf83c8f634f154ecbca98673f4d57020a8f5815f279f`

脚本采用逐字段/行 SHA-256 校验，不因无关顶层元数据更新而覆盖或拒绝整份资料：

1. 每个目标故事字段必须匹配已核原文、历史阶段输出或最终输出；已应用的字段跳过。
2. 目标 book、entry key 和路径必须匹配。条目移动或目标字段被新修订时安全拒绝，不模糊匹配、不猜测新的替换位置。
3. 每个目标 mapping 行必须完整匹配已核原行或最终行；行里的图片或其他元数据若已有新修订，也会拒绝覆盖。
4. 803 处新的 mapping 文字值从本地最终正文按 Unicode codepoint 切片读取；正文哈希和重建后的整行哈希同时校验。公开清单没有这些故事文字。
5. 两份输入全部校验成功后才输出。输入永不覆盖；已有输出目录拒绝使用；重复对最终资料运行无改动。

失败时请保留新资料，重新逐处核对受影响内容，不要改校验值、强行套旧补丁或退回旧程序来绕过拒绝。更换未涉及的正文或元数据时会原样保留，但本工具不替代整份资料的质量检查。

故事文件的未改原始 token 保留，已改字符串的未替换片段保留原有转义形式。mapping 只重写变化的标量 token，保留输入的排版，所以输出 mapping 的文件哈希可能不同于旧压缩包的排版；在已核基线上，其完整数据对象与定版成品相同。

## 验证

公开合成测试：

```sh
python tools/test_c4c5_terms.py
node --test story/tests/c5-heading-compat.test.cjs story/tests/mixed-media.test.cjs story/tests/story-pipe-tables.test.cjs
python tools/test_story_code_in_git.py
python tools/test_packaging_exclusions.py
```

合成用例覆盖已应用/中间状态、文本和标识漂移、C1-C3 边界、英文及空白保护、唯一历史连字符例外、JSON 转义和 Unicode、mapping 配对校验、无脚本执行、失败不输出及清单内容边界。CI 不依赖私有资料或凭据。

本地授权资料验证：两种故事基线重建的完整输出字节均与定版 SHA-256 一致；mapping 完整对象一致；上游当前 renderer 在故事页和第二屏 URL 环境各检查全部 1,975 个 C4/C5 条目、2,424 个混排位置，均无定位错误且文本往返一致。此检查不加载真实图片，不代表浏览器、Android 或 Windows 真机验收。

## 清单格式

- `terms-manifest.json`：按阶段记录字段路径、条目 key、前后 decoded UTF-8 SHA-256，以及 `[start, end, old, new]` 短词编辑。偏移单位为解码后的 Unicode codepoint。
- `mapping-manifest.json`：按行记录前后 canonical JSON SHA-256、对应最终正文 SHA-256 和受限字段差异。文本字段为本地正文的 `[start, end]` 切片；其他字段为长度、计数或哈希。

哈希用于拒绝漂移，不证明原始资料授权或翻译权威性。两份清单只适用于已核的这些出现位置，不能当成任意版本的通用替换字典。
