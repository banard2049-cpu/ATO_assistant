const endpoint = "../api/campaign-state.php?action=second-screen";
const elements = {
  mapFrame: document.querySelector("#mapFrame"),
  mapStage: document.querySelector(".map-stage"),
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
let activeMode = "map";
let latestBattleScale = 1;
let latestBattleRotation = 0;
let latestBattleBoardVisible = true;
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
  const secondRowCount = cards.length > 5 ? Math.min(2, cards.length - 5) : 0;
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
  const sectionGap = 10;
  const availableSidebarWidth = Math.max(120, logicalWidth - sidebarPadding);
  const availableSidebarHeight = Math.max(160, logicalHeight - sidebarPadding);
  const bossHeightRatio = 1650 / 2407;
  const smallHeightRatio = (1 / 5) * (1050 / 750);
  const minimumSplitAibpWidth = aibpMirror
    ? Math.max(160, availableSidebarWidth * 0.3)
    : Math.max(180, availableSidebarWidth * 0.28);
  const splitPanelWidth = Math.max(96, availableSidebarWidth - minimumSplitAibpWidth - sectionGap);
  const terrainCardAreaHeight = hasTerrainCards
    ? Math.max(145, Math.min(280, availableSidebarHeight * 0.28))
    : 0;
  const heightLimitedPanelWidth = Math.max(
    96,
    (
      availableSidebarHeight
      - terrainCardAreaHeight
      - sectionGap * (hasTerrainCards ? 2 : 1)
      - 3
    ) / (bossHeightRatio + smallHeightRatio)
  );
  const bossPanelWidth = quarterTurn || aibpMirror
    ? Math.min(splitPanelWidth, heightLimitedPanelWidth)
    : availableSidebarWidth;
  const bossPanelHeight = bossPanelWidth * bossHeightRatio;
  const minimumResolutionHeight = 110;
  const smallWidth = bossPanelWidth / 5;
  const smallHeight = smallWidth * 1050 / 750;
  layoutSupportCards(availableSidebarWidth, smallWidth, smallHeight, quarterTurn || aibpMirror);
  const traitAreaHeight = quarterTurn || aibpMirror ? smallHeight + 3 : smallHeight * 2 + 10;
  const resolutionHeight = Math.max(
    minimumResolutionHeight,
    availableSidebarHeight
      - bossPanelHeight
      - traitAreaHeight
      - terrainCardAreaHeight
      - sectionGap * (hasTerrainCards ? 3 : 2)
  );

  elements.battleView.style.setProperty("--battle-scale", String(latestBattleScale));
  elements.battleView.style.setProperty("--battle-safe-width", `${safeWidth}px`);
  elements.battleView.style.setProperty("--battle-safe-height", `${safeHeight}px`);
  elements.battleView.style.setProperty("--battle-board-column", `${boardColumn}px`);
  elements.battleView.style.setProperty("--battle-rotation", `${-effectiveRotation}deg`);
  elements.battleView.style.setProperty("--sidebar-content-width", `${logicalWidth}px`);
  elements.battleView.style.setProperty("--sidebar-content-height", `${logicalHeight}px`);
  elements.battleView.style.setProperty("--boss-small-card-width", `${smallWidth}px`);
  elements.battleView.style.setProperty("--boss-small-card-height", `${smallHeight}px`);
  elements.battleView.style.setProperty("--boss-panel-width", `${bossPanelWidth}px`);
  elements.battleView.style.setProperty("--boss-panel-height", `${bossPanelHeight}px`);
  elements.battleView.style.setProperty("--trait-area-height", `${traitAreaHeight}px`);
  elements.battleView.style.setProperty("--resolution-area-height", `${resolutionHeight}px`);
  elements.battleView.style.setProperty("--terrain-card-area-height", `${terrainCardAreaHeight}px`);
  elements.battleSidebarContent.classList.toggle("quarter-turn", quarterTurn);
  elements.battleSidebarContent.classList.toggle("aibp-mirror", aibpMirror);
}

function showUnavailable(message = "") {
  elements.unavailableView.hidden = false;
  elements.unavailableMessage.textContent = message;
  elements.mapFrame.removeAttribute("src");
  elements.mapStage.hidden = true;
  elements.battleView.hidden = true;
}

function openMap() {
  activeMode = "map";
  elements.unavailableView.hidden = true;
  elements.battleView.hidden = true;
  elements.mapStage.hidden = false;
  if (!elements.mapFrame.getAttribute("src")) elements.mapFrame.src = "../map/index.html?second=1";
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
  renderImageList(elements.traitCards, state.extraCards?.length ? state.extraCards : (state.traits || []), "暂无 Trait / 特殊卡");
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
});

checkConnection();
