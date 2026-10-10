// Runtime and optional material packs have independent versions.
function mixedMediaRuntime() {
  const api = window.ATO_MIXED_MEDIA;
  const required = ["renderHTML", "renderInto", "sectionRenderer", "enhanceHTML", "mount", "dispose", "close", "speechText"];
    return api && api.schema === 1 && required.every(name => typeof api[name] === "function") ? api : null;
}

// 第二屏的网址由 api/campaign-state.php 的 second_screen_urls() 生成，里面带着开启
// 第二屏时生成的随机 token（?token=…）。服务端只认这个 token：匿名直接请求接口不再
// 返回存档内容。这里从自己的网址里把它取出来，之后每次请求都附上（#hash 也接受一份，
// 便于复制粘贴时不被某些输入框截断）。
function secondScreenTokenFromLocation() {
  const read = (value) => {
    try {
      return new URLSearchParams(String(value || "")).get("token") || "";
    } catch {
      return "";
    }
  };
  return read(String(window.location?.search || "").replace(/^\?/, ""))
    || read(String(window.location?.hash || "").replace(/^#/, ""));
}

const secondScreenToken = secondScreenTokenFromLocation();
// 地图模式由内嵌的 map/index.html 渲染，那份前端自己直连 ?action=second-screen 且不归
// 本次改动管，所以顺手把 token 写进同源 Cookie，让它照旧读得到；token 本身仍然是必需的。
if (secondScreenToken) {
  document.cookie = `ato_second_screen_token=${encodeURIComponent(secondScreenToken)}; path=/; SameSite=Lax; max-age=15552000`;
}
const endpoint = "../api/campaign-state.php?action=second-screen"
  + (secondScreenToken ? `&token=${encodeURIComponent(secondScreenToken)}` : "");
const elements = {
  mapFrame: document.querySelector("#mapFrame"),
  mapStage: document.querySelector(".map-stage"),
  storyView: document.querySelector("#storyView"),
  storyBookTitle: document.querySelector("#storyBookTitle"),
  storySection: document.querySelector("#storySection"),
  storyTitle: document.querySelector("#storyTitle"),
  storyEntryId: document.querySelector("#storyEntryId"),
  storyBody: document.querySelector("#storyBody"),
  battleView: document.querySelector("#battleView"),
  battleSidebarContent: document.querySelector(".battle-sidebar-content"),
  battleBoardFrame: document.querySelector("#battleBoardFrame"),
  battleTerrainLayer: document.querySelector("#battleTerrainLayer"),
  battleLosLayer: document.querySelector("#battleLosLayer"),
  battleStartLayer: document.querySelector("#battleStartLayer"),
  battleCoordinateLayer: document.querySelector("#battleCoordinateLayer"),
  battleTerrainCards: document.querySelector("#battleTerrainCards"),
  battleTerrainCardList: document.querySelector("#battleTerrainCardList"),
  battleTerrainCardCount: document.querySelector("#battleTerrainCardCount"),
  bossPanel: document.querySelector("#bossPanel"),
  bossTokens: document.querySelector("#bossTokens"),
  bossLabyrinthTrack: document.querySelector("#bossLabyrinthTrack"),
  bossRoutine: document.querySelector("#bossRoutine"),
  bossSignature: document.querySelector("#bossSignature"),
  supportCards: document.querySelector(".support-cards"),
  traitCards: document.querySelector("#traitCards"),
  pendingCards: document.querySelector(".pending-cards"),
  currentPending: document.querySelector("#currentPending"),
  currentPendingLabel: document.querySelector("#currentPendingLabel"),
  aiBacks: document.querySelector("#aiBacks"),
  bpBacks: document.querySelector("#bpBacks"),
  discardCounts: document.querySelector("#discardCounts"),
  damageSummary: document.querySelector("#damageSummary"),
  damageCards: document.querySelector("#damageCards"),
  unavailableView: document.querySelector("#unavailableView"),
  unavailableMessage: document.querySelector("#unavailableMessage"),
};

let retryTimer = null;
let battleRenderKey = "";
let storyRenderKey = "";
let storyRendered = false;
let latestStoryScreen = null;
let activeMode = "map";
let latestBattleScale = 1;
let latestBattleRotation = 0;
let latestBattleBoardVisible = true;
let latestSupportCards = [];
let latestSupportTerrainCards = [];
const aibpBaseUrl = new URL("../aibp/", document.baseURI);
const battleBoardAspectRatio = 20 / 14;

function coordinateLabel(row, column) {
  return `${String.fromCharCode(64 + Number(row))}${Number(column)}`;
}

function layoutSupportCards(availableWidth, smallWidth, smallHeight, oneRow = false) {
  const cards = Array.from(elements.supportCards.querySelectorAll(":scope > .boss-small-card, .trait-cards > img"));
  if (oneRow) {
    elements.supportCards.style.gridTemplateColumns = Array.from({ length: Math.max(1, cards.length) }, () => `${smallWidth}px`).join(" ");
    cards.forEach((card, index) => {
      card.style.gridColumn = String(index + 1);
      card.style.gridRow = "1";
    });
    return 1;
  }
  const rowCapacity = Math.max(1, Math.floor((availableWidth + 0.01) / smallWidth));
  const secondRowCount = cards.length > rowCapacity ? Math.min(rowCapacity, cards.length - rowCapacity) : 0;
  const firstRowCount = cards.length - secondRowCount;
  const columns = Math.max(1, firstRowCount);

  elements.supportCards.style.gridTemplateColumns = Array.from({ length: columns }, () => `${smallWidth}px`).join(" ");
  cards.forEach((card, index) => {
    const secondRowIndex = index - firstRowCount;
    card.style.gridColumn = String(index < firstRowCount ? index + 1 : secondRowIndex + 1);
    card.style.gridRow = index < firstRowCount ? "1" : "2";
  });

  return secondRowCount > 0 ? 2 : 1;
}

// 侧栏卡牌尺寸全部由可用宽高推出来，不写死。返回值就是纵向排布的全部输入：
// 竖排（有版图、未旋转）时 Boss 卡 / 惯常·Trait / 结算区是三行叠着放的，前两行的高度
// 和 cardBlockHeight 随 fit 近乎线性变化，放不下时按溢出比例缩回去即可。
// fit = 1 是「按宽度铺满」的自然尺寸，< 1 表示纵向放不下时整体缩小。
function battleSidebarMetrics(context, fit = 1) {
  const {
    quarterTurn,
    aibpMirror,
    hasTerrainCards,
    availableSidebarWidth,
    availableSidebarHeight,
    terrainCardAreaHeight,
  } = context;
  const sectionGap = 10;
  const minimumPanelWidth = 96;
  // 结算区（AIBP 信息 + 正在结算的卡牌）要占的高度：既要装得下左侧信息列，
  // 又不能让「正在结算」的卡牌被挤到紧贴屏幕底边。按可用高度取比例，再夹住上下限。
  const minimumResolutionHeight = Math.max(
    150,
    Math.min(260, Math.round(availableSidebarHeight * 0.24))
  );
  const bossHeightRatio = 1650 / 2407;
  const smallHeightRatio = (1 / 5) * (1050 / 750);
  const minimumSplitAibpWidth = aibpMirror
    ? Math.max(160, availableSidebarWidth * 0.3)
    : Math.max(180, availableSidebarWidth * 0.28);
  const splitPanelWidth = Math.max(
    minimumPanelWidth,
    availableSidebarWidth - minimumSplitAibpWidth - sectionGap
  );
  // 旋转 90/270 或 AIBP 镜像：结算区和 Boss 卡左右并排，所以只受总高限制。
  const heightLimitedPanelWidth = Math.max(
    minimumPanelWidth,
    (
      availableSidebarHeight
      - terrainCardAreaHeight
      - sectionGap * (hasTerrainCards ? 2 : 1)
      - 3
    ) / (bossHeightRatio + smallHeightRatio)
  );
  // 竖排（有版图、未旋转）：Boss 卡按侧栏宽度铺满后，Boss 卡 + 惯常/Trait 两行会高过屏幕，
  // 把下面的结算区挤成 0 高 —— 「正在结算」的卡牌下半张就被切在屏幕外了。
  // 所以这里按高度预算反推 Boss 卡的最大宽度，先给结算区留出 minimumResolutionHeight。
  const stackedCardBlockRatio = bossHeightRatio + smallHeightRatio * 2;
  const stackedReservedHeight = minimumResolutionHeight + sectionGap * 2 + 10;
  const stackedPanelWidth = Math.min(
    availableSidebarWidth,
    (availableSidebarHeight - stackedReservedHeight) / stackedCardBlockRatio
  );
  const basePanelWidth = quarterTurn || aibpMirror
    ? Math.min(splitPanelWidth, heightLimitedPanelWidth)
    : stackedPanelWidth;
  const bossPanelWidth = Math.max(minimumPanelWidth, basePanelWidth) * fit;
  const bossPanelHeight = bossPanelWidth * bossHeightRatio;
  const smallWidth = bossPanelWidth / 5;
  const smallHeight = smallWidth * (1050 / 750);
  const traitAreaHeight = quarterTurn || aibpMirror ? smallHeight + 3 : smallHeight * 2 + 10;
  const resolutionHeight = Math.max(
    minimumResolutionHeight,
    availableSidebarHeight
      - bossPanelHeight
      - traitAreaHeight
      - terrainCardAreaHeight
      - sectionGap * (hasTerrainCards ? 3 : 2)
  );
  return {
    bossPanelWidth,
    bossPanelHeight,
    smallWidth,
    smallHeight,
    traitAreaHeight,
    resolutionHeight,
    cardBlockHeight: bossPanelHeight + traitAreaHeight,
  };
}

function applyBattleSidebarMetrics(context, metrics) {
  const oneRow = context.quarterTurn || context.aibpMirror;
  const columns = Math.max(1, Math.floor((context.availableSidebarWidth + 0.01) / metrics.smallWidth));
  // 惯常、标志和 Trait / 特殊卡优先，地形卡只补完整的空位。
  const supportCards = latestSupportCards.filter((card) => card.large !== true);
  const freeSlots = Math.max(0, columns * (oneRow ? 1 : 2) - 2 - supportCards.length);
  renderImageList(elements.traitCards, [
    ...supportCards,
    ...latestSupportTerrainCards.slice(0, freeSlots),
  ], "暂无 Trait / 特殊卡");
  layoutSupportCards(
    context.availableSidebarWidth,
    metrics.smallWidth,
    metrics.smallHeight,
    oneRow
  );
  elements.battleView.style.setProperty("--boss-small-card-width", `${metrics.smallWidth}px`);
  elements.battleView.style.setProperty("--boss-small-card-height", `${metrics.smallHeight}px`);
  elements.battleView.style.setProperty("--boss-panel-width", `${metrics.bossPanelWidth}px`);
  elements.battleView.style.setProperty("--boss-panel-height", `${metrics.bossPanelHeight}px`);
  elements.battleView.style.setProperty("--trait-area-height", `${metrics.traitAreaHeight}px`);
  elements.battleView.style.setProperty("--resolution-area-height", `${metrics.resolutionHeight}px`);
}

// 兜底量尺：结算卡牌的下缘在侧栏内容框里的位置（布局坐标，不受 rotate/transform 影响）。
// 竖排和旋转两种摆法都合用一套算法。
function measureBattleSidebarBottom() {
  const pending = elements.pendingCards;
  if (!pending) return 0;
  const bottom = Number(pending.offsetTop) + Number(pending.offsetHeight);
  return Number.isFinite(bottom) && bottom > 0 ? bottom : 0;
}

function measureBattleSidebarOverflow() {
  const content = elements.battleSidebarContent;
  if (!content) return 0;
  const available = Number(content.clientHeight);
  const bottom = measureBattleSidebarBottom();
  if (!Number.isFinite(available) || available <= 0 || bottom <= 0) return 0;
  return Math.max(0, bottom - available);
}

function applyBattleLayout(
  scale = latestBattleScale,
  rotation = latestBattleRotation,
  boardVisible = latestBattleBoardVisible
) {
  latestBattleScale = Math.max(0.6, Math.min(2, Number(scale) || 1));
  latestBattleRotation = [0, 90, 180, 270].includes(Number(rotation)) ? Number(rotation) : 0;
  latestBattleBoardVisible = boardVisible !== false;
  const effectiveRotation = latestBattleBoardVisible ? latestBattleRotation : 0;
  const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const safeWidth = Math.min(viewportWidth, viewportHeight * 16 / 9);
  const safeHeight = Math.min(viewportHeight, viewportWidth * 9 / 16);
  const boardPadding = Math.max(12, Math.min(24, Math.round(Math.min(safeWidth, safeHeight) * 0.022)));
  const minimumSidebarWidth = 260;
  const minimumBoardWidth = 260;
  const desiredBoardWidth = (safeHeight - boardPadding) * battleBoardAspectRatio * latestBattleScale;
  const availableBoardWidth = Math.max(minimumBoardWidth, safeWidth - minimumSidebarWidth);
  const boardColumn = latestBattleBoardVisible
    ? Math.max(minimumBoardWidth, Math.min(availableBoardWidth, desiredBoardWidth))
    : 0;
  const sidebarWidth = latestBattleBoardVisible
    ? Math.max(minimumSidebarWidth, safeWidth - boardColumn)
    : safeWidth;
  const quarterTurn = effectiveRotation === 90 || effectiveRotation === 270;
  const aibpMirror = !latestBattleBoardVisible;
  const hasTerrainCards = aibpMirror && elements.battleSidebarContent.classList.contains("has-terrain-cards");
  const logicalWidth = quarterTurn ? safeHeight : sidebarWidth;
  const logicalHeight = quarterTurn ? sidebarWidth : safeHeight;
  const sidebarPadding = 20;
  const availableSidebarWidth = Math.max(120, logicalWidth - sidebarPadding);
  const availableSidebarHeight = Math.max(160, logicalHeight - sidebarPadding);
  const terrainCardAreaHeight = hasTerrainCards
    ? Math.max(145, Math.min(280, availableSidebarHeight * 0.28))
    : 0;
  const context = {
    quarterTurn,
    aibpMirror,
    hasTerrainCards,
    availableSidebarWidth,
    availableSidebarHeight,
    terrainCardAreaHeight,
  };

  elements.battleView.style.setProperty("--battle-scale", String(latestBattleScale));
  elements.battleView.style.setProperty("--battle-safe-width", `${safeWidth}px`);
  elements.battleView.style.setProperty("--battle-safe-height", `${safeHeight}px`);
  elements.battleView.style.setProperty("--battle-board-column", `${boardColumn}px`);
  elements.battleView.style.setProperty("--battle-rotation", `${-effectiveRotation}deg`);
  elements.battleView.style.setProperty("--sidebar-content-width", `${logicalWidth}px`);
  elements.battleView.style.setProperty("--sidebar-content-height", `${logicalHeight}px`);
  elements.battleView.style.setProperty("--terrain-card-area-height", `${terrainCardAreaHeight}px`);
  // 类名要先切，卡片尺寸量的就是切换后的排布（竖排 vs 旋转/镜像横排）。
  elements.battleSidebarContent.classList.toggle("quarter-turn", quarterTurn);
  elements.battleSidebarContent.classList.toggle("aibp-mirror", aibpMirror);

  let metrics = battleSidebarMetrics(context, 1);
  applyBattleSidebarMetrics(context, metrics);
  // 上面是按尺寸推算出来的，这里再按真实布局量一遍：万一还有算不准的极端尺寸（屏幕特别矮、
  // 或是以后改了样式），就按溢出比例继续整体缩小，保证「正在结算」的卡牌整张落在屏幕内。
  let fit = 1;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const overflow = measureBattleSidebarOverflow();
    if (overflow <= 1) break;
    fit = Math.max(0.4, fit * (1 - overflow / Math.max(1, metrics.cardBlockHeight)));
    metrics = battleSidebarMetrics(context, fit);
    applyBattleSidebarMetrics(context, metrics);
  }
  // 最后一道兜底：卡牌还是越界就直接把整块侧栏内容等比缩到框内。缩放绕内容中心，
  // 所以位置不变、不会被裁掉；用布局坐标算比例，不会再触发第二轮测量。
  const boxHeight = Math.max(1, Number(elements.battleSidebarContent.clientHeight) || 0);
  const cardBottom = measureBattleSidebarBottom();
  const remaining = Math.max(0, cardBottom - boxHeight);
  const fitScale = remaining > 1 && cardBottom > boxHeight
    ? Math.max(0.5, (boxHeight - 2) / (2 * cardBottom - boxHeight))
    : 1;
  elements.battleView.style.setProperty("--sidebar-fit-scale", String(fitScale));
}

function showUnavailable(message = "") {
  mixedMediaRuntime()?.close?.();
  activeMode = "unavailable";
  elements.unavailableView.hidden = false;
  elements.unavailableMessage.textContent = message;
  elements.mapFrame.removeAttribute("src");
  elements.mapStage.hidden = true;
  elements.storyView.hidden = true;
  elements.battleView.hidden = true;
}

function openBlank() {
  mixedMediaRuntime()?.close?.();
  activeMode = "blank";
  elements.unavailableView.hidden = true;
  elements.mapStage.hidden = true;
  elements.storyView.hidden = true;
  elements.battleView.hidden = true;
  elements.mapFrame.removeAttribute("src");
}

function openMap() {
  mixedMediaRuntime()?.close?.();
  activeMode = "map";
  elements.unavailableView.hidden = true;
  elements.storyView.hidden = true;
  elements.battleView.hidden = true;
  elements.mapStage.hidden = false;
  if (!elements.mapFrame.getAttribute("src")) elements.mapFrame.src = "../map/index.html?second=1";
}

// 官方故事书扫描图只认本站 story 数据目录下的图片，其它来源一律忽略。
// 快照里存的是应用相对路径，但 Android 侧发出来的老快照可能还带着 APK 内部前缀
// （/android_asset/web/…）。这里先剥掉前缀，再按第二屏自己的 HTTP 根解析，
// 同一份快照在 file:// 和 http:// 两侧才指向同一张图。
function storyScanImages(story) {
  const scans = [];
  for (const src of Array.isArray(story.images) ? story.images : []) {
    let base = null;
    let url = null;
    try {
      base = new URL(window.location.href);
      url = new URL(String(src || ""), base);
    } catch {
      continue;
    }
    if (url.origin !== base.origin) continue;
    const relative = url.pathname.startsWith("/android_asset/web/")
      ? url.pathname.slice("/android_asset/web".length)
      : url.pathname;
    // 路径大小写不敏感：扫描图文件名的大小写由本地导出决定，别因此漏掉第二屏配图。
    if (!relative.toLowerCase().includes("/story/data/ato-storybook-key-scans/")) continue;
    scans.push(new URL(relative, base).href);
  }
  return scans;
}

// 存档里连快照都没有（故事页从没发过、发送失败，或第二屏跟故事页不是同一个账号）时，
// story 会是 PHP 兜底的空数组，这里必须把「没有快照」跟「这条目空着」分开处理。
function hasStorySnapshot(story) {
  return Boolean(story.id || story.title || story.text || story.imagesOnly);
}

// 正文里的管道表格（原书排版遗留，见 story/assets/story-tables.js）。
// 有表格时自己先建 HTML（字符保真：源文全部非空白字符一个不少），再让混排渲染器按字符
// 偏移插图——这正是主屏处理原生 HTML 条目的同一套路径（enhanceHTML + mount）。没有表格时
// 保持原来的 renderInto / textContent 路径不动。
function escapeStoryText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function storyTablesHtml(text) {
  const tables = window.ATO_STORY_TABLES;
  if (!tables || typeof tables.renderText !== "function" || typeof tables.hasTable !== "function") return null;
  if (!tables.hasTable(text)) return null;
  return tables.renderText(text, escapeStoryText, escapeStoryText);
}

function renderMixedStoryBody(story, text) {
  const runtime = mixedMediaRuntime();
  const tableHtml = storyTablesHtml(text);
  // 图片解码完成后才知道哪些块状媒体真挂上了：那时 ato-mm-layout 才出现，再按整屏重算字号。
  const onChange = () => { if (activeMode === "story") fitStoryTextToViewport(true); };
  if (runtime && tableHtml !== null) {
    runtime.dispose(elements.storyBody);
    elements.storyBody.innerHTML = tableHtml;
    runtime.mount(elements.storyBody, runtime.enhanceHTML(elements.storyBody, story.mixedMedia, text), { onChange });
  } else if (runtime) {
    runtime.renderInto(elements.storyBody, story.mixedMedia, text, { onChange });
  } else if (tableHtml !== null) {
    elements.storyBody.innerHTML = tableHtml;
  } else {
    elements.storyBody.textContent = text;
  }
  // C5 战斗标题（R3 审计过的显示层加粗）：与第一屏同一份标题区间，只加字重。
  const c5Headings = window.ATO_C5_BATTLE_HEADINGS;
  if (c5Headings?.schema === 1 && typeof c5Headings.enhanceHTML === "function") {
    c5Headings.enhanceHTML(elements.storyBody, story.mixedMedia, text);
  }
  elements.storyBody.scrollTop = 0;
  elements.storyBody.scrollLeft = 0;
}

let mixedStoryGeneration = 0;
function openStory(screen) {
  latestStoryScreen = screen;
  const previousMode = activeMode;
  activeMode = "story";
  const story = screen.story && typeof screen.story === "object" && !Array.isArray(screen.story)
    ? screen.story
    : {};
  elements.unavailableView.hidden = true;
  elements.mapStage.hidden = true;
  elements.battleView.hidden = true;
  elements.storyView.hidden = false;
  // 官方版是「只看扫描图」，但该条目没有对应扫描图时必须退回正文：
  // 只按 story.imagesOnly 走图，第二屏会只剩标题、正文一片空白。
  const scans = storyScanImages(story);
  const imagesOnly = Boolean(story.imagesOnly) && scans.length > 0;
  // Polls which only refresh revision/time must not close an open image.
  const renderKey = JSON.stringify([story.id, story.title, story.bookTitle, story.section,
    story.text, story.fallbackText, story.mixedMedia, imagesOnly, scans]);
  if (!hasStorySnapshot(story) && storyRendered) return;
  if (renderKey === storyRenderKey && previousMode === "story") return;
  storyRenderKey = renderKey;
  const mixedGeneration = ++mixedStoryGeneration;
  mixedMediaRuntime()?.dispose?.(elements.storyBody);
  if (!hasStorySnapshot(story)) {
    // 第二屏是跟随显示：快照迟到或没写进来时保留上一屏内容，不要用阅读器视角的
    // 「请先在故事书中选择一个段落。」把已经显示的正文顶掉。真的一份都没有时才提示。
    if (storyRendered) return;
    elements.storyView.classList.toggle("images-only", false);
    elements.storyBookTitle.textContent = "";
    elements.storySection.textContent = "";
    elements.storyTitle.textContent = "等待故事文本";
    elements.storyEntryId.textContent = "";
    elements.storyBody.textContent = "还没有收到故事书阅读文本。\n"
      + "请在故事页打开一个段落；若故事页已经打开，请确认它跟开启第二屏幕的是同一个账号。";
    fitStoryTextToViewport();
    return;
  }
  storyRendered = true;
  elements.storyView.classList.toggle("images-only", imagesOnly);
  if (imagesOnly) {
    elements.storyBody.replaceChildren();
    // 图仍然可能取不到：老快照里的 APK 内部路径、或者 APK 里根本没有这张图。
    // 一张都加载不出来时不能把屏幕留空——退回快照另存的正文。
    let failedImages = 0;
    for (const src of scans) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "官方故事书扫描图";
      image.addEventListener?.("error", () => {
        if (storyRenderKey !== renderKey || mixedGeneration !== mixedStoryGeneration || activeMode !== "story") return;
        failedImages += 1;
        if (failedImages < scans.length) return;
        elements.storyView.classList.toggle("images-only", false);
        elements.storyBookTitle.textContent = story.bookTitle || "ATO 故事书";
        elements.storySection.textContent = story.section || "";
        elements.storyTitle.textContent = story.title || "当前故事文本";
        elements.storyEntryId.textContent = story.id || "";
        elements.storyBody.replaceChildren();
        renderMixedStoryBody(story, story.fallbackText || "官方扫描图加载失败，请回到故事页重新选择该条目。");
        fitStoryTextToViewport();
      });
      elements.storyBody.append(image);
    }
    elements.storyBody.scrollTop = 0;
    return;
  }
  elements.storyBookTitle.textContent = story.bookTitle || "ATO 故事书";
  elements.storySection.textContent = story.section || "";
  elements.storyTitle.textContent = story.title || "当前故事文本";
  elements.storyEntryId.textContent = story.id || "";
  renderMixedStoryBody(story, story.text || story.fallbackText
    || (story.imagesOnly ? "该条目暂无对应的官方扫描图与正文。" : "该条目暂无正文文本。"));
  fitStoryTextToViewport();
}

// 正文里挂出块状媒体（版图、铭文图……）时第二屏的排法：
// 正文照旧双栏，图片按锚点留在正文里的原位、缩成随字号变化的小图（上限见 ss/styles.css 的
// em 规则），整屏改为纵向滚动。这样做的原因是 .story-body 一旦是「定高 + 多栏」容器，装不下的
// 内容会继续往右分栏，被挤到屏幕外（见 release-notes/c45-items4-5-report-20261005.md 的实测：
// 1180px 视口 scrollWidth 7949px、约 7 栏）：高度交给内容、滚动交给外面那层 .story-view
// （story-scroll 类），就只会纵向滚动，不会再把内容排到看不见的地方。
function mixedStoryLayout() {
  return Boolean(elements.storyBody?.classList?.contains?.("ato-mm-layout"));
}

// 战斗模块的条目 = 正文里挂出了「版图」（地形设置图 / 决战版图）。这类条目的版图不可拆，
// 两栏里排版很浪费，三栏能把字号做大，字号打平时也优先三栏；铭文、字形这类块状小图不算，
// 它们只在三栏确实能把字号做大时才换栏。
function isStoryBoardItem(element) {
  const kinds = ["terrain-diagram", "battle-map"];
  if (!element || !element.classList || typeof element.classList.contains !== "function") return false;
  return kinds.some(kind => element.classList.contains(`ato-mm-${kind}`));
}

function storyBoardLayout() {
  const body = elements.storyBody;
  if (!body || typeof body.querySelectorAll !== "function") return false;
  return Array.from(body.querySelectorAll(".ato-mm-item.ato-mm-block")).some(isStoryBoardItem);
}

// 栏数按「字号能给到多大」挑。三栏并不总是更好，但正文里分段空行多、又有不可拆的版图时，
// 三栏把同样的内容摊得更开，二分往往能选到更大的字号（实测 1920×1080：迈达狮之战两栏 13px、
// 三栏 17px；没有迷宫之战两栏 10px 都放不下、三栏 11px 放得下）。窄屏不试三栏：
// 手机竖屏里三栏每栏不到两百像素，字和图都没法看。
const storyThreeColumnMinWidth = 900;

function storyColumnChoices() {
  const width = Number(elements.storyBody?.clientWidth) || Number(elements.storyView?.clientWidth) || 0;
  return width >= storyThreeColumnMinWidth ? [2, 3] : [2];
}

function setStoryColumnCount(count) {
  elements.storyView.style.setProperty("--story-columns", String(count));
}

// 按某个栏数二分字号，返回「放得下」的最大字号；measure() 报当前字号放不放得下。
function searchStoryFontSize(count, measure) {
  const body = elements.storyBody;
  setStoryColumnCount(count);
  void body.offsetHeight;
  let low = 10;
  let high = 22;
  let best = low;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    body.style.setProperty("font-size", `${size}px`, "important");
    if (measure()) {
      best = size;
      low = size + 1;
    } else {
      high = size - 1;
    }
  }
  body.style.setProperty("font-size", `${best}px`, "important");
  return best;
}

function fitStoryTextToViewport(preserveScroll = false) {
  const mixedMedia = mixedStoryLayout();
  elements.storyView.classList.toggle("story-scroll", mixedMedia);
  if (activeMode !== "story" || elements.storyView.hidden) return;
  if (!mixedMedia && elements.storyView.classList.contains("images-only")) return;
  window.requestAnimationFrame(() => {
    const view = elements.storyView;
    const body = elements.storyBody;
    // 期间换了条目（含块状媒体与否变了）就作废，下一次渲染会重新排。
    if (activeMode !== "story" || mixedMedia !== mixedStoryLayout()) return;
    if (!mixedMedia && view.classList.contains("images-only")) return;
    const bodyTop = body.scrollTop, bodyLeft = body.scrollLeft, viewTop = view.scrollTop;
    // 含块状媒体：目标是整屏放得下；纯文字：容器内纵向横向都放得下（和原来一致）。
    const measure = mixedMedia
      ? () => view.scrollHeight <= view.clientHeight + 1
      : () => body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1;
    const results = storyColumnChoices().map(count => ({ count, size: searchStoryFontSize(count, measure) }));
    // 字号大的栏数胜出；一样大时：挂了版图的条目（战斗模块）用三栏，其余保持两栏，阅读节奏不变。
    const boardMedia = storyBoardLayout();
    const winner = results.reduce((best, item) => {
      if (item.size > best.size) return item;
      if (item.size === best.size && boardMedia && item.count > best.count) return item;
      return best;
    }, results[0]);
    setStoryColumnCount(winner.count);
    body.style.setProperty("font-size", `${winner.size}px`, "important");
    void body.offsetHeight;
    view.scrollTop = preserveScroll ? viewTop : 0;
    body.scrollTop = preserveScroll ? bodyTop : 0;
    body.scrollLeft = preserveScroll ? bodyLeft : 0;
  });
}

function aibpImageUrl(path) {
  return new URL(String(path || ""), aibpBaseUrl).href;
}

function setCardImage(target, card, emptyText = "未抽取") {
  target.replaceChildren();
  target.classList.toggle("empty-card", !card?.src);
  if (!card?.src) {
    target.textContent = emptyText;
    return;
  }
  const image = document.createElement("img");
  image.src = aibpImageUrl(card.src);
  image.alt = card.label || "AIBP 卡牌";
  target.appendChild(image);
}

function renderImageList(target, cards, emptyText) {
  target.replaceChildren();
  const visibleCards = (cards || []).filter((card) => card.large !== true);
  if (!visibleCards.length) {
    const empty = document.createElement("span");
    empty.className = "empty-list";
    empty.textContent = emptyText;
    target.appendChild(empty);
    return;
  }
  visibleCards.forEach((card) => {
    const image = document.createElement("img");
    image.src = card.customTrait && window.CustomTraits
      ? window.CustomTraits.src(card.customTrait) : aibpImageUrl(card.src);
    image.alt = card.label || "卡牌";
    image.title = card.label || "";
    target.appendChild(image);
  });
}

// 大迷宫轨道红圈（迷宫机牛 / 吞域兽）：控制台把当前那一格的百分比坐标随快照送来，
// 这里照同一份坐标画在大卡上；点击仍然只在控制台做，第二屏是只读的。
function renderLabyrinthTrack(track) {
  const layer = elements.bossLabyrinthTrack;
  if (!layer) return;
  layer.replaceChildren();
  const hasTrack = Boolean(track && track.left && track.top);
  layer.hidden = !hasTrack;
  if (!hasTrack) return;
  const ring = document.createElement("span");
  ring.style.setProperty("--track-left", track.left);
  ring.style.setProperty("--track-top", track.top);
  ring.style.setProperty("--track-width", track.width || "5.6%");
  ring.title = track.hint || track.label || "大迷宫指示物";
  layer.appendChild(ring);
}

function renderBossTokens(tokens) {
  elements.bossTokens.replaceChildren();
  (tokens || []).forEach((token) => {
    if (!token.file && !token.text) return;
    const hasCountBadge = Number(token.count || 1) > 1;
    const x = Number(token.x ?? 50);
    const y = Number(token.y ?? 50);
    const minX = 3.6;
    const minY = 5.3;
    const maxX = hasCountBadge ? 95.2 : 96.4;
    const maxY = hasCountBadge ? 93.2 : 94.7;
    const stack = document.createElement("div");
    stack.className = "boss-token";
    stack.classList.toggle("custom-token", Boolean(token.text));
    stack.title = token.text || token.file;
    stack.style.left = `${Math.max(minX, Math.min(maxX, Number.isFinite(x) ? x : 50))}%`;
    stack.style.top = `${Math.max(minY, Math.min(maxY, Number.isFinite(y) ? y : 50))}%`;
    const image = document.createElement("img");
    image.src = token.text ? token.src : aibpImageUrl(`ps/other/token/${token.file}`);
    image.alt = token.text || token.file;
    stack.appendChild(image);
    if (hasCountBadge) {
      const count = document.createElement("b");
      count.textContent = `×${token.count}`;
      stack.appendChild(count);
    }
    elements.bossTokens.appendChild(stack);
  });
}

function renderBattleTerrainCards(map, visible) {
  const cards = visible
    ? window.BattleTerrain.getTerrainCards(map, "./terrain-cards")
    : [];
  elements.battleTerrainCardList.replaceChildren();
  elements.battleTerrainCards.hidden = cards.length === 0;
  elements.battleSidebarContent.classList.toggle("has-terrain-cards", cards.length > 0);
  elements.battleTerrainCardCount.textContent = `${cards.length} 张`;
  cards.forEach((card) => {
    const item = document.createElement("figure");
    const image = document.createElement("img");
    const label = document.createElement("figcaption");
    item.className = "battle-terrain-card";
    image.src = card.src;
    image.alt = card.label;
    label.textContent = card.label;
    item.append(image, label);
    elements.battleTerrainCardList.appendChild(item);
  });
}

function renderBattleStarts(apostle, map) {
  elements.battleStartLayer.replaceChildren();
  elements.battleStartLayer.hidden = map.showStarts === false;
  if (map.showStarts === false) return;
  const starts = window.BattleTerrain.getInitialPositions(apostle, map.startLevel, map.setupId, map.startPositionId);
  (starts.apostles || (starts.apostle ? [starts.apostle] : [])).forEach((position) => {
    const marker = document.createElement("div");
    const arrow = document.createElement("span");
    const style = window.BattleTerrain.getTileStyle(position);
    const facing = window.BattleTerrain.getInitialFacing(
      apostle,
      map.apostleFacing,
      map.setupId,
      map.startLevel,
      map.startPositionId
    );
    marker.className = "battle-start-marker apostle";
    marker.textContent = position.label || "A";
    marker.title = `${apostle.replaceAll("_", " ")} (${window.BattleTerrain.getFacingLabel(facing)})`;
    marker.style.left = style.left;
    marker.style.top = style.top;
    marker.style.width = style.width;
    marker.style.height = style.height;
    arrow.className = "battle-start-facing";
    arrow.textContent = "\u25b2";
    arrow.style.transform = `translate(-50%, -50%) rotate(${facing}deg) translateY(-1.05em)`;
    marker.appendChild(arrow);
    elements.battleStartLayer.appendChild(marker);
  });
  starts.titans.forEach((titan) => {
    const marker = document.createElement("div");
    marker.className = "battle-start-marker titan";
    marker.textContent = titan.label;
    marker.style.left = `${(titan.column - 0.5) / 20 * 100}%`;
    marker.style.top = `${(14 - titan.row + 0.5) / 14 * 100}%`;
    marker.style.width = "5%";
    marker.style.height = `${100 / 14}%`;
    elements.battleStartLayer.appendChild(marker);
  });
}

function renderBattleCoordinates(map) {
  elements.battleCoordinateLayer.replaceChildren();
  elements.battleCoordinateLayer.hidden = map.showCoordinates !== true;
  if (elements.battleCoordinateLayer.hidden) return;
  for (let row = 14; row >= 1; row -= 1) {
    for (let column = 1; column <= 20; column += 1) {
      const cell = document.createElement("span");
      cell.className = "battle-coordinate";
      cell.textContent = coordinateLabel(row, column);
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      elements.battleCoordinateLayer.appendChild(cell);
    }
  }
}

// 视线 / 射程 / 距离标注。主控台只传参数（来源锚点、攻击距离、朝向、高地与开关），
// 这里用 aibp 那份同样的 battle_los.js 重算并绘制，所以两屏逐格一致。
function renderBattleLos(apostle, map, los) {
  if (!elements.battleLosLayer) return;
  if (!window.BattleLOS || !los?.active) {
    elements.battleLosLayer.replaceChildren();
    elements.battleLosLayer.hidden = true;
    return;
  }
  const overlay = window.BattleLOS.buildLosOverlay(map, los, window.BattleTerrain, apostle);
  window.BattleLOS.renderLosOverlay(elements.battleLosLayer, overlay);
}

function setStyleProperty(element, name, value) {
  if (typeof element.style.setProperty === "function") element.style.setProperty(name, value);
  else element.style[name] = value;
}

function renderBattleSpecialTerrain(placement) {
  const definition = window.BattleTerrain.catalog[placement.name] || {};
  const tile = document.createElement("div");
  const label = document.createElement("span");
  const style = window.BattleTerrain.getTileStyle(placement);
  tile.className = "battle-terrain-special";
  tile.title = placement.name;
  tile.style.left = style.left;
  tile.style.top = style.top;
  tile.style.width = style.width;
  tile.style.height = style.height;
  tile.style.transform = `translate(-50%, -50%) rotate(${style.rotation})`;
  setStyleProperty(tile, "--battle-special-color", definition.color || "#f0c15d");
  setStyleProperty(tile, "--battle-special-glow", definition.glow || "rgba(240, 193, 93, 0.5)");
  label.className = "battle-terrain-special-label";
  label.textContent = definition.label || placement.name.slice(0, 1);
  tile.appendChild(label);
  elements.battleTerrainLayer.appendChild(tile);
}

function renderBattleLightCoverage(map) {
  const coverage = window.BattleTerrain.getLightCoverage(map);
  coverage.cells.forEach(({ c, r, sources }) => {
    const light = document.createElement("div");
    light.className = "battle-terrain-light-range";
    light.title = `光照 1：${sources.join("、")}`;
    light.style.left = `${(c - 1) / 20 * 100}%`;
    light.style.top = `${(14 - r) / 14 * 100}%`;
    light.style.width = `${100 / 20}%`;
    light.style.height = `${100 / 14}%`;
    elements.battleTerrainLayer.appendChild(light);
  });
}

function renderBattleTerrain(apostle, level, battleMap, los) {
  elements.battleTerrainLayer.replaceChildren();
  const map = window.BattleTerrain.normalizeBattleMap(battleMap, apostle, level);
  elements.battleBoardFrame.classList.toggle("coordinates-visible", map.showCoordinates === true);
  const tiles = window.BattleTerrain.getMapTiles(map);
  tiles.forEach((placement) => {
    const definition = window.BattleTerrain.catalog[placement.name] || {};
    if (definition.special && !definition.file) {
      renderBattleSpecialTerrain(placement);
      return;
    }
    const image = document.createElement("img");
    const sources = window.BattleTerrain.getAssetSources(placement, "./terrain");
    const style = window.BattleTerrain.getTileStyle(placement);
    image.className = "battle-terrain-tile";
    image.src = sources[0] || "";
    if (sources[1]) {
      image.addEventListener("error", () => {
        if (image.src !== sources[1]) image.src = sources[1];
      });
    }
    image.alt = "";
    image.title = placement.name;
    image.style.left = style.left;
    image.style.top = style.top;
    image.style.width = style.width;
    image.style.height = style.height;
    image.style.transform = `translate(-50%, -50%) rotate(${style.rotation}) ${window.BattleTerrain.getTileFlipTransform(placement)}`;
    elements.battleTerrainLayer.appendChild(image);
  });
  renderBattleLightCoverage(map);
  renderBattleStarts(apostle, map);
  renderBattleCoordinates(map);
  renderBattleLos(apostle, map, los);
}

function openBattle(screen) {
  mixedMediaRuntime()?.close?.();
  activeMode = "aibp";
  const state = screen.aibp || {};
  elements.unavailableView.hidden = true;
  elements.mapStage.hidden = true;
  elements.storyView.hidden = true;
  elements.battleView.hidden = false;
  const scale = Math.max(60, Math.min(200, Number(screen.displayScales?.battleBoard || 100)));
  const rotation = [0, 90, 180, 270].includes(Number(screen.battleRotation)) ? Number(screen.battleRotation) : 0;
  const boardVisible = screen.battleBoardVisible !== false;
  const swapped = Boolean(screen.battleSwapped);
  const map = window.BattleTerrain.normalizeBattleMap(state.battleMap, state.apostle, state.level);
  elements.battleView.classList.toggle("board-hidden", !boardVisible);
  elements.battleView.classList.toggle("swapped", boardVisible && swapped);

  const renderKey = JSON.stringify([
    screen.aibpRevision,
    state.updatedAt,
    map.showCoordinates === true,
    scale,
    rotation,
    swapped,
    boardVisible,
    // 视线参数单列进 key：改锚点/攻击距离/朝向这类操作不动牌堆，光靠 updatedAt
    // 不一定变，漏掉会导致第二屏卡在旧标注上。
    state.los || null,
    // 大迷宫轨道的红圈只存在控制台的 localStorage 状态里，也单列进 key。
    state.labyrinthTrack || null,
  ]);
  if (renderKey === battleRenderKey) {
    applyBattleLayout(scale / 100, rotation, boardVisible);
    return;
  }
  battleRenderKey = renderKey;

  elements.battleView.dataset.apostle = state.apostle || "";
  if (boardVisible) renderBattleTerrain(state.apostle, state.level, map, state.los);
  else renderBattleLos(state.apostle, map, null);
  renderBattleTerrainCards(map, !boardVisible);
  [
    [elements.bossPanel, state.panelSrc],
    [elements.bossRoutine, state.routineSrc],
    [elements.bossSignature, state.signatureSrc],
  ].forEach(([image, src]) => {
    image.hidden = !src;
    if (src) image.src = aibpImageUrl(src);
  });
  latestSupportCards = state.extraCards?.length ? state.extraCards : (state.traits || []);
  // 隐藏版图时已有独立地形卡区；显示版图时使用 Trait 区的空位。
  latestSupportTerrainCards = boardVisible
    ? window.BattleTerrain.getTerrainCards(map, new URL("./terrain-cards", document.baseURI).href)
    : [];
  applyBattleLayout(scale / 100, rotation, boardVisible);
  renderLabyrinthTrack(state.labyrinthTrack);
  renderBossTokens(state.tokens || []);
  const pendingType = state.pendingType === "AI" || state.pendingType === "BP"
    ? state.pendingType
    : state.bpPending
      ? "BP"
      : state.aiPending
        ? "AI"
        : "";
  elements.currentPendingLabel.textContent = pendingType ? `当前 ${pendingType}` : "正在结算";
  setCardImage(elements.currentPending, state.pendingCard || (pendingType === "AI" ? state.aiPending : state.bpPending), pendingType ? `未抽取 ${pendingType}` : "未抽取");
  elements.aiBacks.textContent = `${state.aiBacks || "空"} · ${Number(state.aiDeckCount || 0)} 张`;
  elements.bpBacks.textContent = `${state.bpBacks || "空"} · ${Number(state.bpDeckCount || 0)} 张`;
  elements.discardCounts.textContent = `AI ${Number(state.aiDiscardCount || 0)} / BP ${Number(state.bpDiscardCount || 0)}`;
  const damage = state.damageSummary || {};
  elements.damageSummary.textContent = aibpDamageSummaryText(damage);
  renderImageList(elements.damageCards, state.damage || [], "暂无损伤");
}

function aibpDamageSummaryText(damage = {}) {
  const health = Number.isSafeInteger(damage.wounds) && damage.wounds > 0 ? ` / ${damage.wounds}` : "";
  const split = damage.damage1 == null ? "" : `（${Number(damage.damage1 || 0)} + ${Number(damage.damage2 || 0)}）`;
  return `${Number(damage.total || 0)}${health}${split}`;
}

// 外观跟着主控台走：主题偏好存在浏览器 localStorage 里，第二屏是另一台设备（手机/电视），
// 拿不到那份偏好，所以主控台把外观写进第二屏设置、每次轮询带回来（api/campaign-state.php 的
// normalize_theme_setting / public_second_screen_payload）。战役的活动循环本来就在 payload 里，
// auto 模式要靠它取色，不设的话 theme.js 会一直退回默认的 c1。
let appliedThemeKey = "";

function applySecondScreenTheme(screen) {
  const theme = screen?.theme;
  const cycleId = typeof screen?.cycleId === "string" && screen.cycleId
    ? screen.cycleId
    : (typeof theme?.cycleId === "string" ? theme.cycleId : "");
  if (cycleId && document.body.dataset.cycle !== cycleId) document.body.dataset.cycle = cycleId;
  if (!theme || typeof theme.mode !== "string") return;
  // theme.js 是 defer 加载的，第一次轮询可能赶在它前头（那时 ATO_THEME 还没有）；
  // 这种情况不能记成「已应用」，下一次轮询要接着试。
  const api = window.ATO_THEME;
  if (!api || typeof api.set !== "function") return;
  const key = JSON.stringify([theme.mode, theme.rgb]);
  if (key === appliedThemeKey) return;
  appliedThemeKey = key;
  api.set({ mode: theme.mode, rgb: theme.rgb });
}

async function checkConnection() {
  window.clearTimeout(retryTimer);
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      showUnavailable(response.status === 404 ? "" : (payload?.error || `HTTP ${response.status}`));
      return;
    }
    applySecondScreenTheme(payload.screen);
    if (payload.screen.displayMode === "aibp") openBattle(payload.screen);
    else if (payload.screen.displayMode === "story") openStory(payload.screen);
    else if (payload.screen.displayMode === "blank") openBlank();
    else openMap();
  } catch (error) {
    showUnavailable(String(error.message || error));
  } finally {
    retryTimer = window.setTimeout(checkConnection, 1500);
  }
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "ato-second-screen-auth-required") {
    showUnavailable("第二屏幕已关闭。");
    return;
  }
  if (event.data?.type === "ato-second-screen-updated" && activeMode === "map") openMap();
});

window.addEventListener("resize", () => {
  if (activeMode === "aibp") applyBattleLayout();
  if (activeMode === "story") fitStoryTextToViewport();
});

window.CustomTraits?.ready.then(() => {
  if (activeMode === "aibp") applyBattleLayout();
});

checkConnection();

// A material map arriving after startup is an optional enhancement of the latest
// snapshot. It must never restore an older snapshot or switch display modes.
window.addEventListener("ato-mixed-media-map-ready", () => {
  if (activeMode !== "story" || !latestStoryScreen) return;
  storyRenderKey = "";
  const top = elements.storyBody.scrollTop, left = elements.storyBody.scrollLeft;
  openStory(latestStoryScreen);
  elements.storyBody.scrollTop = top; elements.storyBody.scrollLeft = left;
});
