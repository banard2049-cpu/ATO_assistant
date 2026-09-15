const endpoint = "../api/campaign-state.php?action=second-screen";
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
  activeMode = "unavailable";
  elements.unavailableView.hidden = false;
  elements.unavailableMessage.textContent = message;
  elements.mapFrame.removeAttribute("src");
  elements.mapStage.hidden = true;
  elements.storyView.hidden = true;
  elements.battleView.hidden = true;
}

function openBlank() {
  activeMode = "blank";
  elements.unavailableView.hidden = true;
  elements.mapStage.hidden = true;
  elements.storyView.hidden = true;
  elements.battleView.hidden = true;
  elements.mapFrame.removeAttribute("src");
}

function openMap() {
  activeMode = "map";
  elements.unavailableView.hidden = true;
  elements.storyView.hidden = true;
  elements.battleView.hidden = true;
  elements.mapStage.hidden = false;
  if (!elements.mapFrame.getAttribute("src")) elements.mapFrame.src = "../map/index.html?second=1";
}

// 官方故事书扫描图只认本站 story 数据目录下的图片，其它来源一律忽略。
function storyScanImages(story) {
  const scans = [];
  for (const src of Array.isArray(story.images) ? story.images : []) {
    let url = null;
    try {
      url = new URL(src, window.location.href);
    } catch {
      continue;
    }
    if (url.origin !== window.location.origin || !url.pathname.includes("/story/data/ato-storybook-key-scans/")) continue;
    scans.push(url.href);
  }
  return scans;
}

// 存档里连快照都没有（故事页从没发过、发送失败，或第二屏跟故事页不是同一个账号）时，
// story 会是 PHP 兜底的空数组，这里必须把「没有快照」跟「这条目空着」分开处理。
function hasStorySnapshot(story) {
  return Boolean(story.id || story.title || story.text || story.imagesOnly);
}

function openStory(screen) {
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
  const renderKey = JSON.stringify([screen.storyRevision, story.updatedAt, story.id, story.text, imagesOnly, scans]);
  if (renderKey === storyRenderKey && previousMode === "story") return;
  storyRenderKey = renderKey;
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
    for (const src of scans) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "官方故事书扫描图";
      elements.storyBody.append(image);
    }
    elements.storyBody.scrollTop = 0;
    return;
  }
  elements.storyBookTitle.textContent = story.bookTitle || "ATO 故事书";
  elements.storySection.textContent = story.section || "";
  elements.storyTitle.textContent = story.title || "当前故事文本";
  elements.storyEntryId.textContent = story.id || "";
  elements.storyBody.textContent = story.text
    || (story.imagesOnly ? "该条目暂无对应的官方扫描图与正文。" : "该条目暂无正文文本。");
  fitStoryTextToViewport();
}

function fitStoryTextToViewport() {
  if (activeMode !== "story" || elements.storyView.hidden || elements.storyView.classList.contains("images-only")) return;
  window.requestAnimationFrame(() => {
    if (elements.storyView.classList.contains("images-only")) return;
    const body = elements.storyBody;
    let low = 10;
    let high = 22;
    let best = low;
    while (low <= high) {
      const size = Math.floor((low + high) / 2);
      body.style.fontSize = `${size}px`;
      if (body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1) {
        best = size;
        low = size + 1;
      } else {
        high = size - 1;
      }
    }
    body.style.fontSize = `${best}px`;
    body.scrollTop = 0;
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
    image.src = aibpImageUrl(card.src);
    image.alt = card.label || "卡牌";
    image.title = card.label || "";
    target.appendChild(image);
  });
}

function renderBossTokens(tokens) {
  elements.bossTokens.replaceChildren();
  (tokens || []).forEach((token) => {
    if (!token.file) return;
    const hasCountBadge = Number(token.count || 1) > 1;
    const x = Number(token.x ?? 50);
    const y = Number(token.y ?? 50);
    const minX = 3.6;
    const minY = 5.3;
    const maxX = hasCountBadge ? 95.2 : 96.4;
    const maxY = hasCountBadge ? 93.2 : 94.7;
    const stack = document.createElement("div");
    stack.className = "boss-token";
    stack.style.left = `${Math.max(minX, Math.min(maxX, Number.isFinite(x) ? x : 50))}%`;
    stack.style.top = `${Math.max(minY, Math.min(maxY, Number.isFinite(y) ? y : 50))}%`;
    const image = document.createElement("img");
    image.src = aibpImageUrl(`ps/other/token/${token.file}`);
    image.alt = token.file;
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
  if (starts.apostle) {
    const marker = document.createElement("div");
    const arrow = document.createElement("span");
    const style = window.BattleTerrain.getTileStyle(starts.apostle);
    const facing = window.BattleTerrain.getInitialFacing(
      apostle,
      map.apostleFacing,
      map.setupId,
      map.startLevel,
      map.startPositionId
    );
    marker.className = "battle-start-marker apostle";
    marker.textContent = "A";
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
  }
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
  elements.damageSummary.textContent = damage.damage1 == null
    ? String(Number(damage.total || 0))
    : `${Number(damage.total || 0)}（${Number(damage.damage1 || 0)} + ${Number(damage.damage2 || 0)}）`;
  renderImageList(elements.damageCards, state.damage || [], "暂无损伤");
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

checkConnection();
