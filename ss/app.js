const endpoint = "../api/campaign-state.php?action=second-screen";
const elements = {
  mapFrame: document.querySelector("#mapFrame"),
  mapStage: document.querySelector(".map-stage"),
  battleView: document.querySelector("#battleView"),
  battleSidebarContent: document.querySelector(".battle-sidebar-content"),
  battleBoardFrame: document.querySelector("#battleBoardFrame"),
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
const aibpBaseUrl = new URL("../aibp/", document.baseURI);

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

function applyBattleLayout(scale = latestBattleScale, rotation = latestBattleRotation) {
  latestBattleScale = Math.max(0.6, Math.min(2, Number(scale) || 1));
  latestBattleRotation = [0, 90, 180, 270].includes(Number(rotation)) ? Number(rotation) : 0;
  const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const safeWidth = Math.min(viewportWidth, viewportHeight * 16 / 9);
  const safeHeight = Math.min(viewportHeight, viewportWidth * 9 / 16);
  const boardPadding = Math.max(12, Math.min(24, Math.round(Math.min(safeWidth, safeHeight) * 0.022)));
  const boardColumn = Math.max(220, Math.min(safeWidth * 0.72, (safeHeight - boardPadding) * 1.25 * latestBattleScale));
  const sidebarWidth = Math.max(260, safeWidth - Math.max(260, boardColumn));
  const quarterTurn = latestBattleRotation === 90 || latestBattleRotation === 270;
  const logicalWidth = quarterTurn ? safeHeight : sidebarWidth;
  const logicalHeight = quarterTurn ? sidebarWidth : safeHeight;
  const sidebarPadding = 20;
  const sectionGap = 10;
  const availableSidebarWidth = Math.max(120, logicalWidth - sidebarPadding);
  const availableSidebarHeight = Math.max(160, logicalHeight - sidebarPadding);
  const bossHeightRatio = 1650 / 2407;
  const smallHeightRatio = (1 / 5) * (1050 / 750);
  const minimumQuarterTurnAibpWidth = Math.max(180, availableSidebarWidth * 0.28);
  const bossPanelWidth = quarterTurn
    ? Math.max(180, Math.min(
        availableSidebarWidth - minimumQuarterTurnAibpWidth - sectionGap,
        (availableSidebarHeight - sectionGap - 3) / (bossHeightRatio + smallHeightRatio)
      ))
    : availableSidebarWidth;
  const bossPanelHeight = bossPanelWidth * bossHeightRatio;
  const minimumResolutionHeight = 110;
  const smallWidth = bossPanelWidth / 5;
  const smallHeight = smallWidth * 1050 / 750;
  layoutSupportCards(availableSidebarWidth, smallWidth, smallHeight, quarterTurn);
  const traitAreaHeight = quarterTurn ? smallHeight + 3 : smallHeight * 2 + 10;
  const resolutionHeight = Math.max(minimumResolutionHeight, availableSidebarHeight - bossPanelHeight - traitAreaHeight - sectionGap * 2);

  elements.battleView.style.setProperty("--battle-scale", String(latestBattleScale));
  elements.battleView.style.setProperty("--battle-safe-width", `${safeWidth}px`);
  elements.battleView.style.setProperty("--battle-safe-height", `${safeHeight}px`);
  elements.battleView.style.setProperty("--battle-board-column", `${boardColumn}px`);
  elements.battleView.style.setProperty("--battle-rotation", `${-latestBattleRotation}deg`);
  elements.battleView.style.setProperty("--sidebar-content-width", `${logicalWidth}px`);
  elements.battleView.style.setProperty("--sidebar-content-height", `${logicalHeight}px`);
  elements.battleView.style.setProperty("--boss-small-card-width", `${smallWidth}px`);
  elements.battleView.style.setProperty("--boss-small-card-height", `${smallHeight}px`);
  elements.battleView.style.setProperty("--boss-panel-width", `${bossPanelWidth}px`);
  elements.battleView.style.setProperty("--boss-panel-height", `${bossPanelHeight}px`);
  elements.battleView.style.setProperty("--trait-area-height", `${traitAreaHeight}px`);
  elements.battleView.style.setProperty("--resolution-area-height", `${resolutionHeight}px`);
  elements.battleSidebarContent.classList.toggle("quarter-turn", quarterTurn);
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

function openBattle(screen) {
  activeMode = "aibp";
  const state = screen.aibp || {};
  elements.unavailableView.hidden = true;
  elements.mapStage.hidden = true;
  elements.battleView.hidden = false;
  const scale = Math.max(60, Math.min(200, Number(screen.displayScales?.battleBoard || 100)));
  const rotation = [0, 90, 180, 270].includes(Number(screen.battleRotation)) ? Number(screen.battleRotation) : 0;
  const swapped = Boolean(screen.battleSwapped);
  elements.battleView.classList.toggle("swapped", swapped);
  applyBattleLayout(scale / 100, rotation);

  const renderKey = JSON.stringify([screen.aibpRevision, state.updatedAt, scale, rotation, swapped]);
  if (renderKey === battleRenderKey) return;
  battleRenderKey = renderKey;

  elements.battleView.dataset.apostle = state.apostle || "";
  [
    [elements.bossPanel, state.panelSrc],
    [elements.bossRoutine, state.routineSrc],
    [elements.bossSignature, state.signatureSrc],
  ].forEach(([image, src]) => {
    image.hidden = !src;
    if (src) image.src = aibpImageUrl(src);
  });
  renderImageList(elements.traitCards, state.extraCards?.length ? state.extraCards : (state.traits || []), "暂无 Trait / 特殊卡");
  applyBattleLayout(scale / 100, rotation);
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
