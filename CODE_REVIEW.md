# ATO_assistant 全项目代码审查报告

- 审查日期：2026-08-14
- 审查范围：仓库内除 `tools/` 外全部源码
  - `api/`（PHP 后端，6 个文件）
  - `index.html`（主控台）
  - `map/`、`record/`、`ss/`、`hero/`、`story/`、`technology/`、`aibp/`
  - `assets/`（共享 JS）
  - `asset-studio/`（Python WebUI，13 个文件）
  - 根目录启动脚本与 CI（`.github/`、`start-*.bat/.command`）
- 审查方法：逐文件精读 + 关键风险点亲自读码验证

---

## 一、总体评价

这是**工程质量相当高的个人本地工具**。几个突出的优点：

- **写入安全**：所有 PHP API 都用了临时文件 + `flock` + `rename` 的原子写入，写坏了不会留下半截文件；每次保存还带完整备份链（每日归档 + 10 份滚动备份），数据安全设计比很多正式产品都严谨。
- **XSS 防护**：各前端模块统一用 `escapeHtml`/`createElement`，故事正文先转义再 linkify，未发现可利用的 XSS。
- **auth 正确**：密码用 `password_hash`/`password_verify`、登录后 `session_regenerate_id`、cookie `HttpOnly` + `SameSite=Lax`，还有旧明文密码的自动升级逻辑。
- **asset-studio**：路径穿越防护（`safe_target`/`media` 前缀校验）、HMAC 令牌、WAL 数据库、安装回滚，测试覆盖不错。
- **有 CI**：`.github/workflows/public-release-audit.yml` 会在 push 时自动审计版权素材泄露。

**主要风险集中在三类**：
1. 数据持久化的单点故障（静默丢存档）
2. 多标签/多设备并发时的一致性策略不统一
3. 少量真实的功能性 bug

---

## 二、🔴 严重 —— 建议优先处理（可能导致真实数据丢失/损坏）

### S1. 主控台跨 Cycle 数据串写（`index.html`）

- **位置**：`createDefaultCycles`（约 3115 行）+ `normalizeState`（约 3428–3484 行）
- **问题**：`createDefaultCycles` 对 5 个 Cycle 都调用 `normalizeState(defaultState, ...)`。而 `normalizeState` 对 `dateNotes`/`events`/`completed`/`constantToolsOpen` 在 `value` 存在时**直接复用对象引用、不拷贝**。结果：新档案（或某个从未保存过的 Cycle）的这 4 个对象是**同一个引用**。
- **后果**：在 C1 添加日期笔记（`editDateNote` 原地写 `state.dateNotes[key]=...`）后切到 C2，C2 也会出现该笔记；流程勾选 `completed` 同理。保存时这些内容会**按相同内容写入全部 5 个 Cycle 并固化到服务器存档**，污染无法通过刷新消除。
- **建议**：`normalizeState` 中对这 4 个字段改为始终新建对象（对 `value` 里的值做一次 `cloneJson` 后再用），或在 `createDefaultCycles` 传入前深拷贝 `defaultState`。

### S2. hero 同步会静默丢数据（`hero/index.html`）

- **位置**：`loadFromServer`（约 1241 行）、`saveToServer`（约 1193–1224 行）
- **问题**：
  - ① 服务器 revision 高于本地时，`loadFromServer` **直接 `state = serverState` 覆盖本地**，无合并、无确认——若上次服务器宕机时本地离线编辑过，本次打开即静默丢失；
  - ② `saveToServer` 对 409 冲突的处理是注释明确写的 *"force overwrite with local"*，直接拿新 revision 把本地整份盖上去，**无三路合并**——多标签/多设备同时编辑时后保存者覆盖先保存者。
- **建议**：仿照 `record/index.html`（约 2999–3090 行）已做好的三路合并方案：409 → 读最新 → merge(base, local, remote) → 冲突弹窗；加载时若本地有未同步改动应合并或提示，而非直接覆盖。

### S3. 地图页初始加载失败后永久静默丢存档（`map/app.js`）

- **位置**：`loadCampaignMapSection`（约 500–540 行）、`queueCampaignSave`（约 503 行）
- **问题**：初始加载失败时 `campaignStorageAvailable = false` 且置 `campaignSaveQueuedBeforeReady = true`。此后每次保存都因 `!campaignStorageAvailable` 只设置标志、**永不重试**（该标志只在启动加载路径消费一次）。服务器短暂不可用（如 NAS 重启）期间的所有地图编辑**静默滞留内存，刷新即丢**，且无任何提示。
- **建议**：保存失败时做指数退避重试，或轮询探测服务器恢复后自动补存；至少在界面上提示"当前未连接到服务器，改动不会保存"。

---

## 三、🟠 高 —— 功能性错误 / 并发一致性 / 安全面

### H1. 战斗跳转丢失最后一步保存（`map/app.js` 1629–1643、2043）

进入战斗/打开标签编辑器时用 `window.location.href` 跳转，但保存是 260ms 防抖且**无 `pagehide` 冲刷**，跳转前最后一步修改（如移除宿敌 AD）极可能丢失，返回后重复触发战斗。

- **建议**：跳转前 `await flushCampaignMapSave()`，或注册 `pagehide` 同步冲刷。

### H2. 地图段没有乐观锁，且写 dashboard 绕过 revision（`map/app.js` 512、565–573）

- `saveCampaignMapSection` POST `section=map` 不带 `expectedRevision`；地图「保存返回」写 `section=dashboard` 也不带 revision。而主控台写 dashboard 带 revision。两条写入路径对同一数据约定不一致：地图写回会使主控台的下一次保存必然 409，且存在 260ms 窗口内的丢改风险。
- **建议**：地图段统一带上 `expectedRevision`，与主控台走同一冲突处理。

### H3. record 乐观锁粒度过粗（`record/index.html` 2611–2635）

`atomicMergePaths` 把整个 `cycleStats` 设为原子冲突单元，而它内含 fate/hull/crew/knowledge/**syncLog** 等所有身份数值，且 `syncLog` 每次 survey 导入都会 append。多标签并发时，只要一方改过 stats，对方所有字段级修改被**整块丢弃**，与"字段级三路合并"的设计意图不符。

- **建议**：把 `syncLog`/`notes` 等日志字段移出原子块单独合并。

### H4. record 的 `toggleCycleVisibility` 疑似功能失效（`record/index.html` 3534–3543）

该函数只对 航行时间表 / 地图板块 / Acclimation 三个面板 `classList.add("hidden")`，**从不恢复**、也无条件分支。若是 bug，则三个功能面板被永久隐藏；若是废弃代码，应删除调用以免误导。

- **建议**：按 `state.cycle` 成对 add/remove 或删除。

### H5. technology 重名生产科技永不显示（`technology/index.html` 1559–1565、1686–1692）

`getUnlockedProductions`/`findGearTechCard` 用纯小写名字去 `unlocked.has(...)`，但科技树解锁 key 对跨页面重名节点是 `name@@page` 形式（`DISAMBIGUATED_TECH_NAMES`）。一旦存在重名 production 科技，该制造项**永远不会显示为已解锁**。

- **建议**：生产项查找也走同一消歧逻辑。

### H6. asset-studio 上传先落盘后校验（`asset-studio/app/storage.py` 121 + `main.py` 283/341）

`store_image` 先 `os.replace` 把文件移入 `objects/`，之后才做 PIL 解码校验。非图片/损坏图片 → 500 且对象文件**永久残留成为孤儿**；chunked 路径下临时文件已被消费，重试报 `FileNotFoundError`，会话被污染。另外 `safe_extension` 允许 `.heic` 但 `requirements.txt` 没有 `pillow-heif`，**iPhone 照片导入必失败**（README 声称手机拍摄是核心场景）。

- **建议**：校验放到 `os.replace` 之前；HEIC 要么加依赖要么从白名单移除。

### H7. asset-studio 配对码过弱且无速率限制（`config.py` 64 + `main.py` 249–255）

配对码仅 6 位数字（≈20 bit 熵），`/api/pair` 无速率限制/锁定，局域网攻击者可暴力枚举拿到 30 天有效令牌，进而读写全部素材。这是 asset-studio **唯一的外部攻击面**。

- **建议**：≥10 位 + 失败次数锁定/指数退避。

### H8. story 跨模块跳转契约不一致（`story/assets/app.js` 2246–2280）

record 侧 `allMatrixSourceTargets` 传 `chapterHint`，但 story 的 `navigateToStoryTarget` **只读 `target.chapterKey || target.chapter`，忽略 `chapterHint`** → iframe/postMessage 跳转丢章节偏好，同 id 在多个 chapter 存在时可能选错条目。

- **建议**：story 端读取 `chapterHint`，或 record 统一改传 `chapter`。

---

## 四、🟡 中 —— 性能 / 健壮性 / 一致性

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| M1 | `index.html` 3081–3113 | 轮询（4s/聚焦）时若本地有改动且远端 revision 前进，直接弹 `window.confirm` 冲突框——打字/操作中被模态打断；**选"取消"会静默丢弃本地全部修改**。 | 改用非模态冲突面板；取消前再次确认。 |
| M2 | `index.html` 4455–4464、`map/app.js` 503–510 | 服务器不可用期间的编辑只置 `campaignSaveQueuedBeforeReady`，服务器恢复后**不自动重试**，刷新即丢。 | 与 S3 一并做失败重试/补存。 |
| M3 | `index.html` 7046–7053、5849–5948、6789–6860 | `dayInput` 的 `input` 事件无防抖，每键触发 `renderFlow()` 全量重建（含整卡库背景图）+ `renderDateTrack()`（c4 有 97 个日期格）——输入数字会明显卡顿。 | 输入防抖（如 200ms）；渲染差异更新。 |
| M4 | `api/campaign-state.php` `prepare_campaign_backups` | 每次 POST 保存都会全量复制存档文件至多 ~11 份（每日归档 1 + recent 滚动 10）+ 写 marker。存档越大写放大越明显，对低端 NAS 是持续负担。 | 这是"安全优先"的取舍，可接受；若担心负载可考虑近期备份用硬链接/增量。 |
| M5 | `api/campaign-state.php` `?action=second-screen`（GET，认证检查之前） | 免认证返回完整 map/aibp 状态。这是第二屏幕（不登录）功能的**设计使然**，但意味着局域网内知道 URL 的人可实时查看全部玩家的地图/AIBP 状态。 | 属设计权衡，知晓即可；如在意可给 URL 加短期随机 token。 |
| M6 | 各模块 revision/merge 策略不统一 | dashboard 带 revision+3 路合并 ✅；hero 强制覆盖 ⚠️；map 段完全不带 revision ❌；record 原子块过粗 ⚠️。同一数据层三套并存策略，多标签行为差异很大。 | 抽一套统一协议，至少 map 补上 revision。 |
| M7 | `asset-studio/app/fixed_catalog.py` 1043–1049 + `main.py` 52–58 | `ensure_fixed_catalog` 每个请求都重复 `base64.b85decode`+`gzip.decompress`+`json.loads` 整个 2595 项清单，纯重复计算。 | 模块级缓存 payload。 |
| M8 | `asset-studio/app/catalog.py` 553–555 | `apply_catalog` 清理会删除"不在固定清单内且无 asset_revisions 引用"的 catalog 行——通过 `.atopack` 导入、尚未拍到图的条目在下次清单版本变更时**被连带删除**。 | 清理时排除包导入来源的条目。 |
| M9 | `asset-studio/main.py` 320–338、283、544 | 分块上传"追加文件 + 更新 DB"非原子（崩溃/并发会长度与 received_size 不一致）；旧 `/api/assets/upload` 与 `/api/packages/inspect` 无文件大小上限（磁盘耗尽型 DoS）。 | 校验 Content-Length 上限；上传过程加互斥。 |
| M10 | `story/assets/app.js` 481–500、709–711 | ① `entry.text.replace` 未判空，缺 `text` 的条目可致结果列表渲染崩溃；② 克隆音色以完整 dataURL 存 localStorage（大概率超 ~5MB 配额），`saveTtsConfig` 无 try/catch 会中断保存。 | 判空 `String(entry.text||"")`；dataURL 异常降级提示或转存 IndexedDB。 |
| M11 | `aibp/bp_loot_calculator_addon.js` 1293、1345 | 冲突重试可能双计；merge 时服务器覆盖本地未同步增量。 | 与 hero 修复一并处理合并策略。 |
| M12 | `map/app.js` 1323 | `placeToken("AG")` 落 AD 板块不触发战斗，而 `setCurrentTile`（1319）会触发——行为不一致。 | 统一触发逻辑。 |

---

## 五、🟢 低 —— 维护性 / 小问题（可择机处理）

- **死代码**：
  - `map/app.js` 1–2 的 `storageKey`/`dashboardStorageKey` 声明未使用
  - `index.html` 2068–2074 的 5 个常量（`legacyStorageKey` 等）从未引用
  - `asset-studio/app/main.py` 62 的 `safe_error()` 未使用
  - `index.html` 中 `constantToolsOpen` 字段从未被写入（定数框展开状态跨刷新不保留）
- **asset-studio 死端点**：`/api/assets/upload`、`/api/assets/transform` 前端已不使用但仍对外可达，建议删除。
- **`asset-studio/main.py` 401–404**：ZIP 内不安全路径被 `continue` 静默跳过而非拒绝，掩盖问题。
- **`tag-editor.html` 129–263 / 303–321**：MNEMOS 卡片列表与 `hero/index.html` 双份硬编码（易漂移）；`renderCards` 用 `replace()` 标记选中，同卡片三个下拉选相同 tag 时只有第一个生效。
- **`story/assets/app.js` 2950**：`message` 监听未校验 origin（file:// 下风险低）。
- **`record/index.html` 3353–3360**：假定 `[data-bind="godformUsed"]` 必然存在，缺省会抛错中断整个 `renderAll`，建议判空。
- **`asset-studio/app/installer.py` 112–160**：失败时临时文件不在 `finally` 清理。
- **技术债**：主控台单个 `<script>` 超过 5500 行，巨型静态对象集中在 HTML 内，建议逐步拆分成独立 JS 模块（个人工具，优先级低）。

---

## 六、✅ 做得好的、不建议动的地方

- **备份链设计**（每日永久归档 + recent 10 份滚动）——非常可靠，不建议因"性能"简化。
- **PHP 原子写入 + 文件锁**——各 API 保持一致，不要改成裸 `file_put_contents`。
- **XSS 防护体系**——各模块转义策略统一，无需大改。
- **`map-tile-tags.php` / `exploration-card-tags.php`** 对 `.js` 文件的正则解析写入——虽非标准做法，但配合锁与备份是自洽的。
- **asset-studio 的路径穿越防护、安装回滚、HMAC 令牌**——设计正确。
- **`prepare_campaign_backups` 的旧格式迁移**（`migrate_legacy_campaign_backups`）——考虑到了历史版本兼容，写得很细。

---

## 七、建议处理优先级

1. **立即**（数据安全）：S1 跨 Cycle 串写 → S2 hero 覆盖 → S3 map 静默丢存档
2. **本周**：H1 跳转丢存、H2 map revision、H4 toggleCycleVisibility、H5 科技重名、H6/H7 asset-studio 上传与配对码、H8 story 跳转
3. **随后**：M1–M12 中按实际使用习惯取舍（多数是并发/性能优化项）
4. **可长期忽略**：🟢 低危项与"做得好的"部分
