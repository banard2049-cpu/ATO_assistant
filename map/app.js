const storageKey = "ato-map-state-v2";
const dashboardStorageKey = "ato-campaign-dashboard-profiles-v1";
const campaignStorageUrl = "../api/campaign-state.php";
const campaignDashboardUrl = `${campaignStorageUrl}?section=dashboard`;
const mapData = window.ATO_MAP_DATA || { cycles: [] };
const mapTagData = window.ATO_MAP_TILE_TAGS || { tagDefinitions: [], tiles: {} };
const cycleIds = mapData.cycles.map((cycle) => cycle.id);
const c1AlternateTileAssets = Object.fromEntries(
  ["009", "013", "014", "018", "022", "023", "035"].map((id) => [id, {
    front: `./images/c1-tile-${id}-alt-front.jpg`,
    back: `./images/c1-tile-${id}-alt-back.jpg`,
  }]),
);
const c1AlternateTileConnections = {
  "009": { up: "004", right: "010", down: "014", left: "008" },
  "013": { up: "008", right: "", down: "", left: "012" },
  "014": { up: "009", right: "015", down: "019", left: "" },
  "018": { up: "", right: "019", down: "", left: "017" },
  "022": { up: "017", right: "023", down: "027", left: "021" },
  "023": { up: "", right: "024", down: "", left: "022" },
  "035": { up: "030", right: "071", down: "040", left: "034" },
};
const tokenAssets = [
  { id: "reveal", label: "AG进入", path: "" },
  { id: "AG", label: "AG", path: "./tokens/AG.jpg", unique: true },
  { id: "AD", label: "AD", path: "./tokens/AD.jpg", unique: true },
  { id: "c11", label: "C11", path: "./tokens/c11.jpg" },
  { id: "c12", label: "C12", path: "./tokens/c12.jpg" },
  { id: "c13", label: "C13", path: "./tokens/c13.jpg" },
  { id: "ENGIN", label: "ENGIN", path: "./tokens/ENGIN.jpg" },
  { id: "hs", label: "HS", path: "./tokens/hs.jpg", unique: true },
  { id: "last_city", label: "Last City", path: "./tokens/last_city.jpg" },
  {
    id: "token_1",
    label: "Token 1",
    path: "./tokens/token-1.jpg",
  },
  {
    id: "token_2",
    label: "Token 2",
    path: "./tokens/token-2.png",
  },
];
const tokenAssetById = Object.fromEntries(tokenAssets.map((token) => [token.id, token]));
const adversaryBattleByCycle = {
  c2: {
    book: "c2",
    chapter: "battle",
    encounter: "重担之战-burden-battle",
    entry: "重担之战-burden-battle",
  },
};

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

const elements = {
  cycleTabs: document.querySelector("#cycleTabs"),
  currentTileSelect: document.querySelector("#currentTileSelect"),
  searchInput: document.querySelector("#searchInput"),
  mapZoomInput: document.querySelector("#mapZoomInput"),
  mapZoomValue: document.querySelector("#mapZoomValue"),
  showBackToggle: document.querySelector("#showBackToggle"),
  onlyExploredToggle: document.querySelector("#onlyExploredToggle"),
  showAdjacencyToggle: document.querySelector("#showAdjacencyToggle"),
  cycleTitle: document.querySelector("#cycleTitle"),
  cycleMeta: document.querySelector("#cycleMeta"),
  markCurrentButton: document.querySelector("#markCurrentButton"),
  clearCycleButton: document.querySelector("#clearCycleButton"),
  tokenPalette: document.querySelector("#tokenPalette"),
  scoutCount: document.querySelector("#scoutCount"),
  hsProduceButton: document.querySelector("#hsProduceButton"),
  hsRecallButton: document.querySelector("#hsRecallButton"),
  hsDestroyButton: document.querySelector("#hsDestroyButton"),
  adSpawnButton: document.querySelector("#adSpawnButton"),
  adMoveButton: document.querySelector("#adMoveButton"),
  undoButton: document.querySelector("#undoButton"),
  saveReturnButton: document.querySelector("#saveReturnButton"),
  openTagEditorButton: document.querySelector("#openTagEditorButton"),
  tileGridViewport: document.querySelector(".tile-grid-viewport"),
  tileGrid: document.querySelector("#tileGrid"),
  tileNoteDialog: document.querySelector("#tileNoteDialog"),
  tileNoteTitle: document.querySelector("#tileNoteTitle"),
  tileNoteInput: document.querySelector("#tileNoteInput"),
  saveNoteButton: document.querySelector("#saveNoteButton"),
  deleteNoteButton: document.querySelector("#deleteNoteButton"),
  closeNoteButton: document.querySelector("#closeNoteButton"),
};

let state = loadState();
let campaignStorageAvailable = false;
let campaignUserId = "default";
let campaignSaveTimer = null;
let campaignSaveInFlight = false;
let campaignSavePending = false;
let campaignSaveQueuedBeforeReady = false;
let pendingAdversarySpawnCandidates = new Set();
let editingNoteTileId = "";
let tileClickTimer = 0;
let undoStack = [];
const maxUndoSteps = 40;
let shouldFocusArgoAfterRender = true;
let focusArgoAttempts = 0;

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function pushUndo() {
  undoStack.push({
    state: cloneValue(state),
    pendingAdversarySpawnCandidates: [...pendingAdversarySpawnCandidates],
  });
  if (undoStack.length > maxUndoSteps) undoStack.shift();
  renderUndoControl();
}

function undoLastChange() {
  const snapshot = undoStack.pop();
  if (!snapshot) return;
  state = cloneValue(snapshot.state);
  pendingAdversarySpawnCandidates = new Set(snapshot.pendingAdversarySpawnCandidates || []);
  saveState();
  render();
}

function renderUndoControl() {
  if (elements.undoButton) elements.undoButton.disabled = undoStack.length === 0;
}

function defaultCycleState() {
  return {
    currentTile: "",
    latestRevealedTile: "",
    explored: {},
    tileNotes: {},
    tileVariants: {},
    tokens: {
      AG: "",
      AD: "",
      hsCount: 0,
      markers: {},
    },
  };
}

function createDefaultState() {
  const requestedCycle = new URLSearchParams(window.location.search).get("cycle");
  const activeCycleId = cycleIds.includes(requestedCycle) ? requestedCycle : cycleIds[0] || "c1";
  return {
    activeCycleId,
    showBack: false,
    onlyExplored: false,
    showAdjacency: false,
    mapZoom: 100,
    selectedToken: "reveal",
    query: "",
    cycles: Object.fromEntries(cycleIds.map((id) => [id, defaultCycleState()])),
  };
}

function loadState() {
  return createDefaultState();
}

function normalizeState(saved) {
  const defaults = createDefaultState();
  if (!isPlainObject(saved)) return defaults;
  const cycles = { ...defaults.cycles };
  cycleIds.forEach((id) => {
    cycles[id] = {
      ...defaultCycleState(),
      ...(saved.cycles?.[id] || {}),
      explored: isPlainObject(saved.cycles?.[id]?.explored)
        ? saved.cycles[id].explored
        : {},
      tileNotes: isPlainObject(saved.cycles?.[id]?.tileNotes)
        ? saved.cycles[id].tileNotes
        : {},
      tileVariants: isPlainObject(saved.cycles?.[id]?.tileVariants)
        ? saved.cycles[id].tileVariants
        : {},
      tokens: normalizeTokens(saved.cycles?.[id]),
    };
  });

  const requestedCycle = new URLSearchParams(window.location.search).get("cycle");
  const activeCycleId = cycleIds.includes(requestedCycle)
    ? requestedCycle
    : (cycleIds.includes(saved.activeCycleId) ? saved.activeCycleId : defaults.activeCycleId);

  return {
    ...defaults,
    ...saved,
    activeCycleId,
    cycles,
    showBack: Boolean(saved.showBack),
    onlyExplored: Boolean(saved.onlyExplored),
    showAdjacency: Boolean(saved.showAdjacency),
    mapZoom: normalizeMapZoom(saved.mapZoom),
    selectedToken: tokenAssetById[saved.selectedToken] ? saved.selectedToken : "reveal",
    query: saved.query || "",
  };
}

function normalizeTokens(cycleState = {}) {
  const tokens = cycleState.tokens || {};
  const markers = normalizeMarkers(tokens.markers);
  const scoutPlaced = Object.values(markers).some((tileMarkers) => tileMarkers?.hs);
  const hsCount = Math.max(0, Math.floor(Number(tokens.hsCount ?? cycleState.hsCount ?? (scoutPlaced ? 1 : 0))));
  return {
    AG: tokens.AG || cycleState.currentTile || "",
    AD: tokens.AD || "",
    hsCount: Math.max(hsCount, scoutPlaced ? 1 : 0),
    markers,
  };
}

function normalizeMarkers(markers = {}) {
  if (!isPlainObject(markers)) return {};
  const normalized = {};
  let scoutKept = false;
  Object.entries(markers).forEach(([tileId, tileMarkers]) => {
    if (!isPlainObject(tileMarkers)) return;
    Object.entries(tileMarkers).forEach(([tokenId, enabled]) => {
      if (!enabled || !tokenAssetById[tokenId]) return;
      if (tokenId === "hs") {
        if (scoutKept) return;
        scoutKept = true;
      }
      normalized[tileId] ||= {};
      normalized[tileId][tokenId] = true;
    });
  });
  return normalized;
}

function normalizeMapZoom(value) {
  const zoom = Math.round(Number(value) / 10) * 10;
  if (!Number.isFinite(zoom)) return 100;
  return Math.max(60, Math.min(400, zoom));
}

function tileTagEntry(cycleId, tileId) {
  return mapTagData.tiles?.[`${cycleId}:${tileId}`] || null;
}

function tileTagIds(cycleId, tileId) {
  const entry = tileTagEntry(cycleId, tileId);
  return Array.isArray(entry?.tags) ? entry.tags : [];
}

function tileTagLabels(cycleId, tileId) {
  const definitions = Object.fromEntries((mapTagData.tagDefinitions || []).map((tag) => [tag.id, tag.label || tag.id]));
  return tileTagIds(cycleId, tileId).map((tagId) => definitions[tagId] || tagId);
}

function tileHasTag(cycleId, tileId, tagId) {
  return tileTagIds(cycleId, tileId).includes(tagId);
}

function removeMarkerEverywhere(cycleState, tokenId) {
  Object.keys(cycleState.tokens.markers || {}).forEach((tileId) => {
    if (!cycleState.tokens.markers[tileId]) return;
    delete cycleState.tokens.markers[tileId][tokenId];
    if (!Object.keys(cycleState.tokens.markers[tileId]).length) delete cycleState.tokens.markers[tileId];
  });
}

function moveMarkerToTile(cycleState, tokenId, tileId) {
  if (!tileId || !tokenAssetById[tokenId]) return;
  cycleState.tokens.markers ||= {};
  removeMarkerEverywhere(cycleState, tokenId);
  cycleState.tokens.markers[tileId] ||= {};
  cycleState.tokens.markers[tileId][tokenId] = true;
}

function scoutPlacedTileId(cycleState = activeCycleState()) {
  return Object.keys(cycleState.tokens.markers || {}).find((tileId) => {
    return Boolean(cycleState.tokens.markers?.[tileId]?.hs);
  }) || "";
}

function recallScout() {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  if (!scoutPlacedTileId(cycleState)) return;
  pushUndo();
  removeMarkerEverywhere(cycleState, "hs");
  saveState();
  render();
}

function produceScout() {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  pushUndo();
  cycleState.tokens.hsCount = Math.max(0, Math.floor(Number(cycleState.tokens.hsCount || 0))) + 1;
  saveState();
  render();
}

function destroyScout() {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  if (cycleState.tokens.hsCount <= 0) return;
  pushUndo();
  removeMarkerEverywhere(cycleState, "hs");
  cycleState.tokens.hsCount = Math.max(0, cycleState.tokens.hsCount - 1);
  saveState();
  render();
}

function markTileExplored(cycleState, tileId) {
  if (!tileId) return false;
  const wasExplored = Boolean(cycleState.explored[tileId]);
  cycleState.explored[tileId] = true;
  if (!wasExplored) cycleState.latestRevealedTile = tileId;
  return !wasExplored;
}

function syncDepartedCityMarker(cycleState, nextTileId) {
  const departedTileId = cycleState.currentTile;
  if (
    departedTileId
    && departedTileId !== nextTileId
    && tileHasTag(state.activeCycleId, departedTileId, "city")
  ) {
    moveMarkerToTile(cycleState, "last_city", departedTileId);
  }
}

function saveState() {
  queueCampaignSave();
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadCampaignMapSection() {
  try {
    const response = await fetch(campaignStorageUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "读取失败");
    campaignStorageAvailable = true;
    const flushQueuedSave = campaignSaveQueuedBeforeReady;
    campaignSaveQueuedBeforeReady = false;
    const campaign = payload.campaign || {};
    const dashboard = campaign.sections?.dashboard;
    campaignUserId = dashboard?.activeProfileId || "default";
    const mapSection = campaign.sections?.map;
    const userState = mapSection?.users?.[campaignUserId] || (mapSection?.users ? null : mapSection);
    if (userState) {
      state = normalizeState(userState);
      focusArgoAfterNextRender();
      render();
    }
    if (flushQueuedSave) queueCampaignSave();
  } catch (error) {
    campaignStorageAvailable = false;
    console.warn(error);
  }
}

function queueCampaignSave() {
  if (!campaignStorageAvailable) {
    campaignSaveQueuedBeforeReady = true;
    return;
  }
  clearTimeout(campaignSaveTimer);
  campaignSaveTimer = setTimeout(saveCampaignMapSection, 260);
}

async function saveCampaignMapSection() {
  if (!campaignStorageAvailable) return;
  if (campaignSaveInFlight) {
    campaignSavePending = true;
    return;
  }
  campaignSaveInFlight = true;
  try {
    do {
      campaignSavePending = false;
      const stateBeingSaved = cloneValue(state);
      const response = await fetch(campaignStorageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "map", userId: campaignUserId, state: stateBeingSaved }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    } while (campaignSavePending);
  } catch (error) {
    console.warn(error);
  } finally {
    campaignSaveInFlight = false;
  }
}

async function flushCampaignMapSave() {
  if (!campaignStorageAvailable) {
    campaignSaveQueuedBeforeReady = true;
    return;
  }
  clearTimeout(campaignSaveTimer);
  campaignSaveTimer = null;
  if (campaignSaveInFlight) {
    campaignSavePending = true;
    while (campaignSaveInFlight) await delay(40);
    return;
  }
  await saveCampaignMapSection();
}

async function loadCampaignDashboardArchive() {
  try {
    const response = await fetch(campaignDashboardUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.ok && payload.exists && payload.state) return payload.state;
  } catch (error) {
    console.warn(error);
  }
  return null;
}

async function saveCampaignDashboardArchive(archive) {
  const response = await fetch(campaignDashboardUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section: "dashboard", state: archive }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
}

function activeCycle() {
  return mapData.cycles.find((cycle) => cycle.id === state.activeCycleId) || mapData.cycles[0];
}

function activeCycleState() {
  if (!state.cycles[state.activeCycleId]) state.cycles[state.activeCycleId] = defaultCycleState();
  state.cycles[state.activeCycleId].tokens = normalizeTokens(state.cycles[state.activeCycleId]);
  if (!isPlainObject(state.cycles[state.activeCycleId].tileNotes)) {
    state.cycles[state.activeCycleId].tileNotes = {};
  }
  if (!isPlainObject(state.cycles[state.activeCycleId].tileVariants)) {
    state.cycles[state.activeCycleId].tileVariants = {};
  }
  return state.cycles[state.activeCycleId];
}

function argoTileId(cycleState = activeCycleState()) {
  return cycleState.currentTile || cycleState.tokens?.AG || "";
}

function renderTokenPalette() {
  const fragment = document.createDocumentFragment();
  elements.tokenPalette.innerHTML = "";

  tokenAssets.forEach((token) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `token-tool${state.selectedToken === token.id ? " active" : ""}`;
    button.title = token.label;
    button.innerHTML = token.path
      ? `<img src="${escapeHtml(token.path)}" alt="${escapeHtml(token.label)}">`
      : `<span>${escapeHtml(token.label)}</span>`;
    button.addEventListener("click", () => {
      clearPendingAdversarySpawn();
      state.selectedToken = token.id;
      saveState();
      render();
    });
    fragment.appendChild(button);
  });

  elements.tokenPalette.appendChild(fragment);
}

function renderCycleTabs() {
  const fragment = document.createDocumentFragment();
  elements.cycleTabs.innerHTML = "";

  mapData.cycles.forEach((cycle) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = cycle.id === state.activeCycleId ? "active" : "";
    button.textContent = cycle.label;
    button.addEventListener("click", () => {
      clearPendingAdversarySpawn();
      state.activeCycleId = cycle.id;
      saveState();
      focusArgoAfterNextRender();
      render();
    });
    fragment.appendChild(button);
  });

  elements.cycleTabs.appendChild(fragment);
}

function renderControls() {
  const cycle = activeCycle();
  const cycleState = activeCycleState();
  const effectiveArgoTileId = argoTileId(cycleState);
  const currentTileExists = cycle.tiles.some((tile) => tile.id === effectiveArgoTileId);

  if (currentTileExists) {
    cycleState.currentTile = effectiveArgoTileId;
    cycleState.tokens.AG = effectiveArgoTileId;
  } else {
    cycleState.currentTile = "";
    cycleState.tokens.AG = "";
  }

  elements.currentTileSelect.innerHTML = '<option value="">未设置当前位置</option>';
  cycle.tiles.forEach((tile) => {
    const option = document.createElement("option");
    option.value = tile.id;
    option.textContent = tile.label;
    elements.currentTileSelect.appendChild(option);
  });

  elements.currentTileSelect.value = cycleState.currentTile;
  elements.searchInput.value = state.query;
  elements.mapZoomInput.value = String(state.mapZoom);
  elements.mapZoomValue.textContent = `${state.mapZoom}%`;
  elements.showBackToggle.checked = state.showBack;
  elements.onlyExploredToggle.checked = state.onlyExplored;
  elements.showAdjacencyToggle.checked = state.showAdjacency;
  if (elements.markCurrentButton) elements.markCurrentButton.disabled = !cycleState.currentTile;
  renderScoutControls(cycleState);
}

function renderScoutControls(cycleState = activeCycleState()) {
  const scoutTileId = scoutPlacedTileId(cycleState);
  elements.scoutCount.textContent = cycleState.tokens.hsCount;
  elements.hsRecallButton.disabled = !scoutTileId;
  elements.hsDestroyButton.disabled = cycleState.tokens.hsCount <= 0;
}

function renderSummary(filteredCount) {
  const cycle = activeCycle();
  const cycleState = activeCycleState();
  const exploredCount = cycle.tiles.filter((tile) => cycleState.explored[tile.id]).length;
  const current = cycle.tiles.find((tile) => tile.id === cycleState.currentTile);

  elements.cycleTitle.textContent = cycle.label;
  elements.cycleMeta.textContent = [
    `${cycle.tiles.length} 块地图`,
    `已探索 ${exploredCount}`,
    current ? `当前位置 ${current.label}` : "未设置当前位置",
    cycleState.tokens.AD ? `仇敌 ${cycleState.tokens.AD}` : "仇敌未在地图上",
    `侦察船 ${cycleState.tokens.hsCount}${scoutPlacedTileId(cycleState) ? " / 已派出" : ""}`,
    filteredCount !== cycle.tiles.length ? `当前显示 ${filteredCount}` : "",
  ].filter(Boolean).join(" / ");
}

function renderTiles() {
  const cycle = activeCycle();
  const cycleState = activeCycleState();
  const query = state.query.trim().toLowerCase();
  const effectiveArgoTileId = argoTileId(cycleState);
  const layout = displayLayout(cycle);
  const tileWidth = layout.tileWidth;
  const mapWidth = layout.width;
  const mapHeight = layout.height;
  elements.tileGrid.className = `tile-grid cycle-${cycle.id}`;
  elements.tileGrid.style.setProperty("--map-ratio", `${mapWidth} / ${mapHeight}`);
  elements.tileGrid.style.setProperty("--map-zoom", `${state.mapZoom}%`);

  const tiles = cycle.tiles.filter((tile) => {
    const explored = Boolean(cycleState.explored[tile.id]);
    const isSpawnCandidate = pendingAdversarySpawnCandidates.has(tile.id);
    const isArgoTile = tile.id === effectiveArgoTileId;
    const matchesQuery = !query || [tile.id, tile.label, tile.source].some((value) => {
      return String(value || "").toLowerCase().includes(query);
    });
    return (matchesQuery || isSpawnCandidate || isArgoTile) && (!state.onlyExplored || explored || isSpawnCandidate || isArgoTile);
  });

  elements.tileGrid.innerHTML = "";
  if (!tiles.length) {
    elements.tileGrid.innerHTML = '<div class="empty">没有符合条件的地图板块。</div>';
    renderSummary(0);
    return;
  }

  const fragment = document.createDocumentFragment();
  tiles.forEach((tile) => {
    const explored = Boolean(cycleState.explored[tile.id]);
    const scouted = Boolean(cycleState.tokens.markers?.[tile.id]?.hs);
    const current = effectiveArgoTileId === tile.id;
    const tileTokens = getTileTokens(tile.id, cycleState);
    const isSpawnCandidate = pendingAdversarySpawnCandidates.has(tile.id);
    const hasNote = Boolean((cycleState.tileNotes?.[tile.id] || "").trim());
    const article = document.createElement("article");
    article.className = `tile-card${current ? " current" : ""}${explored ? " explored" : ""}${hasNote ? " has-note" : ""}${isSpawnCandidate ? " ad-spawn-candidate" : ""}${state.showAdjacency ? " show-adjacency" : ""}`;
    article.dataset.id = tile.id;
    const position = layout.position(tile);
    article.style.left = `${((position.x || 0) / mapWidth) * 100}%`;
    article.style.top = `${((position.y || 0) / mapHeight) * 100}%`;
    article.style.width = `${(tileWidth / mapWidth) * 100}%`;
    article.title = tileTooltip(tile, current, explored, hasNote, scouted);

    const assets = tileAssets(tile, cycleState);
    const imageSrc = (!state.showBack && (explored || scouted)) || !assets.back ? assets.front : assets.back;
    article.innerHTML = `
      <div class="tile-image">
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(tile.label)}">
      </div>
      ${renderVariantToggle(tile, cycleState)}
      ${renderTileNoteMarker(hasNote)}
      ${renderTileTokens(tileTokens)}
      ${renderAdjacencyLabels(tile)}
    `;
    fragment.appendChild(article);
  });

  elements.tileGrid.appendChild(fragment);
  renderSummary(tiles.length);
}

function displayLayout(cycle) {
  const tileWidth = cycle.tileWidth || 1;
  if (cycle.id === "c1") {
    const positions = c1NeighborLayout(cycle);
    return {
      tileWidth,
      width: positions.width,
      height: positions.height,
      position: (tile) => positions.byId.get(tile.id) || { x: 0, y: 0 },
    };
  }

  if (cycle.id !== "c3") {
    return {
      tileWidth,
      width: cycle.width || tileWidth,
      height: cycle.height || tileWidth,
      position: (tile) => ({ x: tile.nx || 0, y: tile.ny || 0 }),
    };
  }

  const positions = cyclePhysicalLayout(cycle);
  return {
    tileWidth,
    width: positions.width,
    height: positions.height,
    position: (tile) => positions.byId.get(tile.id) || { x: 0, y: 0 },
  };
}

function c1NeighborLayout(cycle) {
  const numberedTiles = cycle.tiles.filter((tile) => /^\d{3}$/.test(tile.id));
  const terrainTiles = cycle.tiles.filter((tile) => /^T\d{2}$/.test(tile.id));
  const mainLayout = connectedTileLayout(numberedTiles);
  const terrainLayout = connectedTileLayout(terrainTiles);
  const byIdPosition = new Map();

  mainLayout.byId.forEach((position, id) => {
    byIdPosition.set(id, position);
  });
  terrainLayout.byId.forEach((position, id) => {
    byIdPosition.set(id, {
      x: position.x,
      y: mainLayout.height + 1 + position.y,
    });
  });

  return {
    byId: byIdPosition,
    width: Math.max(mainLayout.width, terrainLayout.width),
    height: mainLayout.height + 1 + terrainLayout.height,
  };
}

function connectedTileLayout(tiles) {
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const positions = new Map();
  const sortedIds = [...byId.keys()].sort((a, b) => a.localeCompare(b));
  const queue = sortedIds.length ? [sortedIds[0]] : [];
  const directions = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, 1],
    up: [0, -1],
  };

  if (queue.length) positions.set(queue[0], { x: 0, y: 0 });
  while (queue.length) {
    const id = queue.shift();
    const tile = byId.get(id);
    const position = positions.get(id);
    Object.entries(directions).forEach(([direction, [dx, dy]]) => {
      const targetId = tile?.neighbors?.[direction];
      if (!targetId || targetId === id || !byId.has(targetId) || positions.has(targetId)) return;
      positions.set(targetId, { x: position.x + dx, y: position.y + dy });
      queue.push(targetId);
    });
    byId.forEach((candidate) => {
      Object.entries(directions).forEach(([direction, [dx, dy]]) => {
        if (candidate.id === id || candidate.neighbors?.[direction] !== id || positions.has(candidate.id)) return;
        positions.set(candidate.id, { x: position.x - dx, y: position.y - dy });
        queue.push(candidate.id);
      });
    });
  }

  const points = [...positions.values()];
  const minX = Math.min(...points.map((point) => point.x), 0);
  const minY = Math.min(...points.map((point) => point.y), 0);
  const maxX = Math.max(...points.map((point) => point.x), 0);
  const maxY = Math.max(...points.map((point) => point.y), 0);
  const normalized = new Map();
  positions.forEach((position, id) => {
    normalized.set(id, { x: position.x - minX, y: position.y - minY });
  });

  return {
    byId: normalized,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function cyclePhysicalLayout(cycle) {
  const byId = new Map(cycle.tiles.map((tile) => [tile.id, tile]));
  const localPositions = new Map();
  const components = [];
  const directions = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, 1],
    up: [0, -1],
  };

  cycle.tiles.forEach((start) => {
    if (localPositions.has(start.id)) return;
    const component = [];
    const queue = [start.id];
    localPositions.set(start.id, { x: 0, y: 0 });

    while (queue.length) {
      const id = queue.shift();
      const tile = byId.get(id);
      const position = localPositions.get(id);
      component.push(id);

      Object.entries(directions).forEach(([direction, [dx, dy]]) => {
        const targetId = tile?.neighbors?.[direction];
        if (!targetId || !byId.has(targetId) || localPositions.has(targetId)) return;
        localPositions.set(targetId, { x: position.x + dx, y: position.y + dy });
        queue.push(targetId);
      });
    }

    components.push(component);
  });

  if (cycle.id === "c3") {
    const fixedPlacements = [
      { anchor: "034", x: 5, y: 7 },
      { anchor: "067", x: 7, y: 0 },
      { anchor: "008", x: 0, y: 1 },
      { anchor: "079", x: 0, y: 8 },
      { anchor: "065", x: 12, y: 0 },
      { anchor: "333", x: 7, y: 6 },
    ];
    const byIdPosition = new Map();
    components.forEach((component) => {
      const points = component.map((id) => localPositions.get(id));
      const minX = Math.min(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const placement = fixedPlacements.find((item) => component.includes(item.anchor)) || { x: 0, y: 0 };
      component.forEach((id) => {
        const point = localPositions.get(id);
        byIdPosition.set(id, {
          x: placement.x + point.x - minX,
          y: placement.y + point.y - minY,
        });
      });
    });
    return { byId: byIdPosition, width: 15, height: 13 };
  }

  const byIdPosition = new Map();
  const gap = 1;
  const maxRowWidth = 18;
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let width = 1;
  let height = 1;

  components.forEach((component) => {
    const points = component.map((id) => localPositions.get(id));
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;

    if (cursorX > 0 && cursorX + componentWidth > maxRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }

    component.forEach((id) => {
      const point = localPositions.get(id);
      const x = cursorX + point.x - minX;
      const y = cursorY + point.y - minY;
      byIdPosition.set(id, { x, y });
      width = Math.max(width, x + 1);
      height = Math.max(height, y + 1);
    });

    cursorX += componentWidth + gap;
    rowHeight = Math.max(rowHeight, componentHeight);
  });

  return { byId: byIdPosition, width, height };
}

function tileAssets(tile, cycleState = activeCycleState()) {
  const alternate = state.activeCycleId === "c1" && cycleState.tileVariants?.[tile.id] === "alternate"
    ? c1AlternateTileAssets[tile.id]
    : null;
  return alternate || tile;
}

function effectiveTile(tile, cycleState = activeCycleState()) {
  const alternateConnections = state.activeCycleId === "c1" && cycleState.tileVariants?.[tile.id] === "alternate"
    ? c1AlternateTileConnections[tile.id]
    : null;
  if (!alternateConnections) return tile;
  const exits = {};
  if (alternateConnections.up) exits.TOP_MIDDLE = alternateConnections.up;
  if (alternateConnections.right) exits.RIGHT_MIDDLE = alternateConnections.right;
  if (alternateConnections.down) exits.BOTTOM_MIDDLE = alternateConnections.down;
  if (alternateConnections.left) exits.LEFT_MIDDLE = alternateConnections.left;
  return {
    ...tile,
    neighbors: { ...alternateConnections, special: "" },
    exits,
  };
}

function isAlternateTile(tileId, cycleState = activeCycleState()) {
  return state.activeCycleId === "c1" && cycleState.tileVariants?.[tileId] === "alternate";
}

function tileConnectsTo(tile, targetId) {
  return ["left", "right", "up", "down"].some((direction) => tile.neighbors?.[direction] === targetId)
    || Object.values(tile.exits || {}).includes(targetId);
}

function tileConnectsBackForAdversary(tile, targetId) {
  return ["left", "right", "up", "down"].some((direction) => tile.neighbors?.[direction] === targetId)
    || Object.entries(tile.exits || {}).some(([exit, destination]) => (
      !String(exit).startsWith("SPECIAL_CYCLE_3") && destination === targetId
    ));
}

function renderVariantToggle(tile, cycleState = activeCycleState()) {
  if (state.activeCycleId !== "c1" || !c1AlternateTileAssets[tile.id]) return "";
  const alternate = cycleState.tileVariants?.[tile.id] === "alternate";
  return `<button class="tile-variant-toggle${alternate ? " active" : ""}" type="button" data-variant-tile="${escapeHtml(tile.id)}" title="${alternate ? "切换为标准版" : "切换为替代版"}" aria-label="${alternate ? "切换为标准版" : "切换为替代版"}">替</button>`;
}

function toggleTileVariant(tileId) {
  if (state.activeCycleId !== "c1" || !c1AlternateTileAssets[tileId]) return;
  const cycleState = activeCycleState();
  pushUndo();
  cycleState.tileVariants ||= {};
  if (cycleState.tileVariants[tileId] === "alternate") {
    delete cycleState.tileVariants[tileId];
  } else {
    cycleState.tileVariants[tileId] = "alternate";
  }
  saveState();
  renderTiles();
}

function tileTooltip(tile, current, explored, hasNote = false, scouted = false) {
  tile = effectiveTile(tile);
  const neighbors = tile.neighbors || {};
  const exitLabels = Object.entries(tile.exits || {}).map(([exit, target]) => `${exit} ${target}`);
  return [
    tile.label,
    current ? "当前位置" : "",
    explored ? "已探索" : "",
    scouted && !explored ? "侦察船侦察" : "",
    hasNote ? "有地图笔记" : "",
    `上 ${neighbors.up || "-"}`,
    `下 ${neighbors.down || "-"}`,
    `左 ${neighbors.left || "-"}`,
    `右 ${neighbors.right || "-"}`,
    ...exitLabels,
  ].filter(Boolean).join(" / ");
}

function renderAdjacencyLabels(tile) {
  if (!state.showAdjacency) return "";
  tile = effectiveTile(tile);
  const exits = tile.exits || {};
  const neighbors = tile.neighbors || {};
  const standard = [
    ["TOP_MIDDLE", "top", "T", neighbors.up],
    ["RIGHT_MIDDLE", "right", "R", neighbors.right],
    ["BOTTOM_MIDDLE", "bottom", "B", neighbors.down],
    ["LEFT_MIDDLE", "left", "L", neighbors.left],
  ];
  const badges = standard
    .map(([exit, position, shortLabel, neighborTarget]) => {
      const target = exits[exit] || neighborTarget || "";
      if (!target) return "";
      const mismatch = exits[exit] && neighborTarget && exits[exit] !== neighborTarget;
      return `<span class="adjacency-badge adjacency-${position}${mismatch ? " mismatch" : ""}">${escapeHtml(shortLabel)}:${escapeHtml(target)}</span>`;
    })
    .filter(Boolean);

  const special = Object.entries(exits)
    .filter(([exit]) => !["TOP_MIDDLE", "RIGHT_MIDDLE", "BOTTOM_MIDDLE", "LEFT_MIDDLE"].includes(exit))
    .map(([exit, target]) => `<span class="adjacency-badge adjacency-special">${escapeHtml(exit)}:${escapeHtml(target)}</span>`);

  if (!badges.length && !special.length) return "";
  return `<div class="adjacency-labels" aria-hidden="true">${badges.join("")}${special.join("")}</div>`;
}
function renderTileNoteMarker(hasNote) {
  return hasNote ? '<span class="tile-note-marker" aria-label="有地图笔记"></span>' : "";
}

function getTileTokens(tileId, cycleState) {
  const tokens = [];
  if (cycleState.tokens?.AG === tileId || cycleState.currentTile === tileId) tokens.push("AG");
  if (cycleState.tokens?.AD === tileId) tokens.push("AD");
  const markers = cycleState.tokens?.markers?.[tileId] || {};
  Object.keys(markers).forEach((tokenId) => {
    if (markers[tokenId] && tokenAssetById[tokenId]) tokens.push(tokenId);
  });
  return [...new Set(tokens)];
}

function renderTileTokens(tokenIds) {
  if (!tokenIds.length) return "";
  const icons = tokenIds.map((tokenId) => {
    const token = tokenAssetById[tokenId];
    if (!token?.path) return "";
    return `<img class="map-token token-${escapeHtml(tokenId.toLowerCase())}" src="${escapeHtml(token.path)}" alt="${escapeHtml(token.label)}">`;
  }).join("");
  return `<div class="tile-tokens">${icons}</div>`;
}

function render() {
  renderCycleTabs();
  renderTokenPalette();
  renderControls();
  renderUndoControl();
  renderTiles();
  focusArgoIfNeeded();
}

function focusArgoAfterNextRender(attempts = 8) {
  shouldFocusArgoAfterRender = true;
  focusArgoAttempts = Math.max(focusArgoAttempts, attempts);
}

function focusArgoIfNeeded() {
  if (!shouldFocusArgoAfterRender) return;
  shouldFocusArgoAfterRender = false;
  scheduleArgoFocus();
}

function scheduleArgoFocus() {
  window.requestAnimationFrame(() => scrollArgoIntoView());
  [80, 180, 360, 720, 1200].forEach((delay) => {
    window.setTimeout(scrollArgoIntoView, delay);
  });
}

function scrollArgoIntoView() {
  const targetTileId = argoTileId();
  const currentTile = elements.tileGrid.querySelector(".tile-card.current")
    || [...elements.tileGrid.querySelectorAll(".tile-card[data-id]")].find((tile) => tile.dataset.id === targetTileId);
  if (!currentTile) {
    retryFocusArgo();
    return;
  }
  centerMapViewportOnArgo(currentTile);

  const tileRect = currentTile.getBoundingClientRect();
  const stickyRect = document.querySelector(".sticky-actions")?.getBoundingClientRect();
  const stickyHeight = Math.max(0, stickyRect?.height || 0);
  const availableTop = stickyHeight;
  const availableHeight = Math.max(160, window.innerHeight - stickyHeight);
  const targetCenterY = availableTop + (availableHeight / 2);
  const tileCenterY = tileRect.top + (tileRect.height / 2);
  const scrollingElement = document.scrollingElement || document.documentElement;
  const nextScrollTop = scrollingElement.scrollTop + tileCenterY - targetCenterY;

  scrollingElement.scrollTo({
    top: Math.max(0, nextScrollTop),
    left: 0,
    behavior: "auto",
  });

  const settledRect = currentTile.getBoundingClientRect();
  if (settledRect.bottom <= stickyHeight || settledRect.top >= window.innerHeight) retryFocusArgo();
}

function centerMapViewportOnArgo(tile = null) {
  const viewport = elements.tileGridViewport;
  if (!viewport) return;
  const targetTileId = argoTileId();
  const currentTile = tile
    || elements.tileGrid.querySelector(".tile-card.current")
    || [...elements.tileGrid.querySelectorAll(".tile-card[data-id]")].find((item) => item.dataset.id === targetTileId);
  if (!currentTile) return;

  viewport.scrollTo({
    left: Math.max(0, currentTile.offsetLeft + (currentTile.offsetWidth / 2) - (viewport.clientWidth / 2)),
    top: Math.max(0, currentTile.offsetTop + (currentTile.offsetHeight / 2) - (viewport.clientHeight / 2)),
    behavior: "auto",
  });
}

function retryFocusArgo() {
  if (focusArgoAttempts <= 0) return;
  focusArgoAttempts -= 1;
  window.setTimeout(scrollArgoIntoView, 80);
}

function setCurrentTile(tileId, reveal = true, recordUndo = true) {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  if (recordUndo) pushUndo();
  syncDepartedCityMarker(cycleState, tileId);
  cycleState.currentTile = tileId;
  cycleState.tokens.AG = tileId;
  if (tileId && reveal) markTileExplored(cycleState, tileId);
  if (tileId && cycleState.tokens.AD === tileId) {
    triggerAdversaryBattle();
    return;
  }
  saveState();
  focusArgoAfterNextRender();
  render();
}

function placeToken(tileId) {
  clearPendingAdversarySpawn();
  const tokenId = state.selectedToken || "reveal";
  if (tokenId === "reveal") {
    setCurrentTile(tileId, true, true);
    return;
  }

  const cycleState = activeCycleState();

  if (tokenId === "AG") {
    pushUndo();
    syncDepartedCityMarker(cycleState, tileId);
    cycleState.currentTile = tileId;
    cycleState.tokens.AG = tileId;
    markTileExplored(cycleState, tileId);
  } else if (tokenId === "AD") {
    pushUndo();
    cycleState.tokens.AD = cycleState.tokens.AD === tileId ? "" : tileId;
    if (cycleState.tokens.AD && cycleState.tokens.AD === cycleState.currentTile) {
      triggerAdversaryBattle();
      return;
    }
  } else if (tokenId === "hs") {
    if (cycleState.tokens.hsCount <= 0) {
      window.alert("没有可用的侦察船。请先生产侦察船。");
      return;
    }
    pushUndo();
    if (scoutPlacedTileId(cycleState) === tileId) {
      removeMarkerEverywhere(cycleState, "hs");
    } else {
      moveMarkerToTile(cycleState, "hs", tileId);
    }
  } else {
    pushUndo();
    cycleState.tokens.markers[tileId] ||= {};
    cycleState.tokens.markers[tileId][tokenId] = !cycleState.tokens.markers[tileId][tokenId];
    if (!cycleState.tokens.markers[tileId][tokenId]) delete cycleState.tokens.markers[tileId][tokenId];
    if (!Object.keys(cycleState.tokens.markers[tileId]).length) delete cycleState.tokens.markers[tileId];
  }

  saveState();
  if (tokenId === "AG") focusArgoAfterNextRender();
  render();
}

function tileById(tileId) {
  return activeCycle().tiles.find((tile) => tile.id === tileId);
}

function openTileNote(tileId) {
  const tile = tileById(tileId);
  const cycleState = activeCycleState();
  editingNoteTileId = tileId;
  elements.tileNoteTitle.textContent = tile ? `地图笔记：${tile.label}` : `地图笔记：${tileId}`;
  elements.tileNoteInput.value = cycleState.tileNotes?.[tileId] || "";
  elements.deleteNoteButton.disabled = !elements.tileNoteInput.value.trim();

  if (typeof elements.tileNoteDialog.showModal === "function") {
    elements.tileNoteDialog.showModal();
  } else {
    elements.tileNoteDialog.setAttribute("open", "");
  }
  elements.tileNoteInput.focus();
}

function closeTileNote() {
  editingNoteTileId = "";
  elements.tileNoteDialog.close();
}

function saveTileNote() {
  if (!editingNoteTileId) return;
  const cycleState = activeCycleState();
  const note = elements.tileNoteInput.value.trim();
  const previousNote = (cycleState.tileNotes?.[editingNoteTileId] || "").trim();
  if (note === previousNote) {
    closeTileNote();
    return;
  }
  pushUndo();
  cycleState.tileNotes ||= {};
  if (note) {
    cycleState.tileNotes[editingNoteTileId] = note;
  } else {
    delete cycleState.tileNotes[editingNoteTileId];
  }
  saveState();
  closeTileNote();
  renderTiles();
}

function deleteTileNote() {
  if (!editingNoteTileId) return;
  const cycleState = activeCycleState();
  if (!cycleState.tileNotes?.[editingNoteTileId]) return;
  pushUndo();
  if (cycleState.tileNotes) delete cycleState.tileNotes[editingNoteTileId];
  saveState();
  closeTileNote();
  renderTiles();
}

function toggleExplored(tileId) {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  pushUndo();
  if (cycleState.explored[tileId]) {
    delete cycleState.explored[tileId];
    if (cycleState.latestRevealedTile === tileId) cycleState.latestRevealedTile = "";
  } else {
    markTileExplored(cycleState, tileId);
  }
  saveState();
  render();
}

function markCurrentExplored() {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  if (!cycleState.currentTile) return;
  pushUndo();
  markTileExplored(cycleState, cycleState.currentTile);
  saveState();
  render();
}

function clearCycleExplored() {
  clearPendingAdversarySpawn();
  const cycle = activeCycle();
  if (!window.confirm(`清空 ${cycle.label} 的已探索标记和当前位置吗？`)) return;
  pushUndo();
  state.cycles[state.activeCycleId] = defaultCycleState();
  saveState();
  render();
}

function moveAdversary() {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  const startId = cycleState.tokens.AD;
  const targetId = cycleState.currentTile;
  if (!startId || !targetId) return;

  if (startId === targetId) {
    triggerAdversaryBattle(true);
    return;
  }

  const path = shortestPlacedPath(startId, targetId);
  if (path.length >= 2) {
    pushUndo();
    cycleState.tokens.AD = path[1];
  }

  if (cycleState.tokens.AD === targetId) {
    triggerAdversaryBattle();
    return;
  }
  saveState();
  render();
}

function spawnAdversary() {
  clearPendingAdversarySpawn();
  const cycleState = activeCycleState();
  const targetId = cycleState.currentTile;
  if (!targetId) {
    window.alert("请先设置 AG/当前位置。");
    return;
  }
  const revealed = revealedTiles();
  const candidates = revealed.filter((tile) => tile.id !== targetId && cycleState.explored[tile.id]);
  const scored = candidates.map((tile) => ({
    tile,
    distance: shortestPlacedPath(targetId, tile.id, revealed).length - 1,
  })).filter((item) => item.distance >= 0);

  if (!scored.length) {
    window.alert("没有可放置仇敌的已翻开地图板块。");
    return;
  }

  const exact = scored.filter((item) => item.distance === 4);
  if (!exact.length) {
    window.alert("没有距离阿尔戈号正好 4 格的已揭示地图板块。");
    return;
  }

  if (exact.length === 1) {
    placeAdversary(exact[0].tile.id);
    return;
  }

  pendingAdversarySpawnCandidates = new Set(exact.map((item) => item.tile.id));
  saveState();
  renderTiles();
  window.alert("有多个符合条件的板块，请点击高亮板块生成仇敌。");
}

function placeAdversary(tileId) {
  const cycleState = activeCycleState();
  pushUndo();
  cycleState.tokens.AD = tileId;
  clearPendingAdversarySpawn();
  saveState();
  render();
}

function clearPendingAdversarySpawn() {
  if (pendingAdversarySpawnCandidates.size) {
    pendingAdversarySpawnCandidates = new Set();
  }
}

function triggerAdversaryBattle(recordUndo = false) {
  const cycleState = activeCycleState();
  if (recordUndo) pushUndo();
  cycleState.tokens.AD = "";
  saveState();

  const battleUrl = adversaryBattleUrl();
  if (battleUrl) {
    window.alert("仇敌与阿尔戈号同板块：移除仇敌，并打开对应战斗。");
    window.location.href = battleUrl;
    return;
  }
  render();
  window.alert("仇敌与阿尔戈号同板块：移除仇敌，并在当前步骤结束时结算仇敌战斗。");
}

function placedTiles() {
  const cycleState = activeCycleState();
  return activeCycle().tiles
    .filter((tile) => cycleState.explored[tile.id] || tile.id === cycleState.currentTile || tile.id === cycleState.tokens.AD)
    .map((tile) => effectiveTile(tile, cycleState));
}

function adversaryBattleUrl() {
  const target = adversaryBattleByCycle[state.activeCycleId];
  if (!target) return "";

  const params = new URLSearchParams();
  params.set("book", target.book);
  params.set("chapter", target.chapter);
  params.set("encounter", target.encounter);
  params.set("entry", target.entry);
  return `../story/index.html?${params.toString()}`;
}

function currentMapSnapshot() {
  const cycle = activeCycle();
  const cycleState = activeCycleState();
  const current = cycle.tiles.find((tile) => tile.id === cycleState.currentTile);
  const adversary = cycle.tiles.find((tile) => tile.id === cycleState.tokens.AD);
  const latestRevealed = cycle.tiles.find((tile) => tile.id === cycleState.latestRevealedTile);
  const lastCityTileId = Object.keys(cycleState.tokens.markers || {}).find((tileId) => {
    return Boolean(cycleState.tokens.markers?.[tileId]?.last_city);
  }) || "";
  const lastCity = cycle.tiles.find((tile) => tile.id === lastCityTileId);
  const scoutTileId = scoutPlacedTileId(cycleState);
  const scoutTile = cycle.tiles.find((tile) => tile.id === scoutTileId);
  const currentTileTags = tileTagIds(cycle.id, cycleState.currentTile);
  const currentTileTagLabels = tileTagLabels(cycle.id, cycleState.currentTile);
  const latestRevealedTileTags = tileTagIds(cycle.id, cycleState.latestRevealedTile);
  const latestRevealedTileTagLabels = tileTagLabels(cycle.id, cycleState.latestRevealedTile);
  const currentTileHasLastCityMarker = Boolean(
    cycleState.currentTile && cycleState.tokens.markers?.[cycleState.currentTile]?.last_city
  );
  const exploredIds = cycle.tiles
    .filter((tile) => cycleState.explored[tile.id])
    .map((tile) => tile.id);
  const tileNotes = Object.entries(cycleState.tileNotes || {})
    .filter(([, note]) => String(note || "").trim())
    .map(([tileId, note]) => {
      const tile = cycle.tiles.find((item) => item.id === tileId);
      return {
        tileId,
        tileLabel: tile?.label || tileId,
        note: String(note).trim(),
      };
    });
  const markerEntries = Object.entries(cycleState.tokens.markers || {})
    .filter(([, markers]) => Object.values(markers || {}).some(Boolean))
    .map(([tileId, markers]) => {
      const activeMarkers = Object.keys(markers).filter((tokenId) => markers[tokenId]);
      return `${tileId}:${activeMarkers.join(",")}`;
    });

  return {
    savedAt: new Date().toISOString(),
    cycleId: cycle.id,
    cycleLabel: cycle.label,
    currentTileId: cycleState.currentTile || "",
    currentTileLabel: current?.label || cycleState.currentTile || "",
    adversaryTileId: cycleState.tokens.AD || "",
    adversaryTileLabel: adversary?.label || cycleState.tokens.AD || "",
    latestRevealedTileId: cycleState.latestRevealedTile || "",
    latestRevealedTileLabel: latestRevealed?.label || cycleState.latestRevealedTile || "",
    lastCityTileId,
    lastCityTileLabel: lastCity?.label || lastCityTileId,
    scoutCount: cycleState.tokens.hsCount,
    scoutTileId,
    scoutTileLabel: scoutTile?.label || scoutTileId,
    currentTileTags,
    currentTileTagLabels,
    latestRevealedTileTags,
    latestRevealedTileTagLabels,
    currentTileHasLastCityMarker,
    currentTileIsLatestRevealed: Boolean(cycleState.currentTile && cycleState.currentTile === cycleState.latestRevealedTile),
    exploredCount: exploredIds.length,
    totalTiles: cycle.tiles.length,
    exploredIds,
    tileNotes,
    markers: markerEntries,
  };
}

function mapSnapshotNote(snapshot) {
  const noteSummaries = (snapshot.tileNotes || []).map((item) => `${item.tileLabel}：${item.note}`);
  return [
    `[地图同步 ${new Date(snapshot.savedAt).toLocaleString()}]`,
    `${snapshot.cycleLabel}`,
    `阿尔戈号：${snapshot.currentTileLabel || "未设置"}`,
    `仇敌：${snapshot.adversaryTileLabel || "未在地图中"}`,
    `侦察船：${snapshot.scoutCount}${snapshot.scoutTileLabel ? ` / ${snapshot.scoutTileLabel}` : ""}`,
    `已揭示：${snapshot.exploredCount}/${snapshot.totalTiles}`,
    snapshot.currentTileTagLabels.length ? `当前标签：${snapshot.currentTileTagLabels.join("、")}` : "当前标签：无",
    snapshot.latestRevealedTileTagLabels.length ? `最新揭示标签：${snapshot.latestRevealedTileTagLabels.join("、")}` : "最新揭示标签：无",
    `当前是否最新揭示：${snapshot.currentTileIsLatestRevealed ? "是" : "否"}`,
    snapshot.markers.length ? `标记：${snapshot.markers.join("；")}` : "",
    noteSummaries.length ? `地图笔记：${noteSummaries.join("；")}` : "",
  ].filter(Boolean).join(" / ");
}
async function saveAndReturnToDashboard() {
  clearPendingAdversarySpawn();
  saveState();
  const dashboardUrl = new URL("../index.html", window.location.href).href;
  const dashboardModule = window.ATO_PAGE_ROUTER?.moduleFromUrl?.(dashboardUrl) || "dashboard";
  const dashboardWindow = window.ATO_PAGE_ROUTER?.isModuleRecentlyOpen?.(dashboardModule)
    ? window.ATO_PAGE_ROUTER.focusNamedModule?.(dashboardUrl, dashboardModule)
    : null;
  await flushCampaignMapSave();

  const snapshot = currentMapSnapshot();
  try {
    let archive = await loadCampaignDashboardArchive();
    if (!isPlainObject(archive) || !isPlainObject(archive.profiles)) {
      archive = {
        activeProfileId: "default",
        profiles: {
          default: {
            id: "default",
            name: "默认用户",
            activeCycleId: snapshot.cycleId,
            cycles: {},
          },
        },
      };
    }
    const profile = archive.profiles?.[archive.activeProfileId] || Object.values(archive.profiles || {})[0];
    if (profile) {
      archive.activeProfileId ||= profile.id;
      profile.activeCycleId = snapshot.cycleId;
      if (!isPlainObject(profile.cycles)) profile.cycles = {};
      profile.cycles[snapshot.cycleId] ||= { id: snapshot.cycleId, state: {} };
      const dashboardState = isPlainObject(profile.cycles[snapshot.cycleId].state) ? profile.cycles[snapshot.cycleId].state : {};
      const note = mapSnapshotNote(snapshot);
      profile.cycles[snapshot.cycleId].state = {
        ...dashboardState,
        location: snapshot.currentTileLabel || dashboardState.location || "",
        mapSnapshot: snapshot,
        mapCurrentTileTags: snapshot.currentTileTags,
        mapCurrentTileTagLabels: snapshot.currentTileTagLabels,
        mapLatestRevealedTileTags: snapshot.latestRevealedTileTags,
        mapLatestRevealedTileTagLabels: snapshot.latestRevealedTileTagLabels,
        mapCurrentTileHasLastCityMarker: snapshot.currentTileHasLastCityMarker,
        mapCurrentTileIsLatestRevealed: snapshot.currentTileIsLatestRevealed,
        notes: dashboardState.notes ? `${dashboardState.notes}\n${note}` : note,
      };
      await saveCampaignDashboardArchive(archive);
    }
  } catch (error) {
    window.alert(`地图已保存，但写入主控台记录失败：${String(error.message || error)}`);
    return;
  }

  if (dashboardWindow) {
    try {
      dashboardWindow.location.href = dashboardUrl;
      dashboardWindow.focus?.();
    } catch {
      window.location.href = dashboardUrl;
    }
  } else if (window.ATO_PAGE_ROUTER?.focusOrNavigate) {
    await window.ATO_PAGE_ROUTER.focusOrNavigate(dashboardUrl);
  } else {
    window.location.href = dashboardUrl;
  }
}

function revealedTiles() {
  const cycleState = activeCycleState();
  return activeCycle().tiles
    .filter((tile) => cycleState.explored[tile.id] || tile.id === cycleState.currentTile)
    .map((tile) => effectiveTile(tile, cycleState));
}

function adjacentPlacedTiles(tileId, tiles = placedTiles()) {
  const tile = tiles.find((item) => item.id === tileId);
  if (!tile) return [];
  const cycleState = activeCycleState();
  const placedById = new Map(tiles.map((item) => [item.id, item]));
  const adjacentIds = new Set();
  const physicalDirections = ["left", "right", "up", "down"];
  physicalDirections.forEach((direction) => {
    const targetId = tile.neighbors?.[direction];
    if (targetId && placedById.has(targetId)) adjacentIds.add(targetId);
  });
  Object.values(tile.exits || {}).forEach((targetId) => {
    if (targetId && placedById.has(targetId)) adjacentIds.add(targetId);
  });
  tiles.forEach((candidate) => {
    if (candidate.id === tileId) return;
    const tileIsAlternate = isAlternateTile(tile.id, cycleState);
    const candidateIsAlternate = isAlternateTile(candidate.id, cycleState);
    const tileConnects = tileConnectsTo(tile, candidate.id);
    const candidateConnects = tileConnectsBackForAdversary(candidate, tile.id);
    const variantAllowsConnection = (!tileIsAlternate || tileConnects)
      && (!candidateIsAlternate || candidateConnects);
    const connectsBack = candidateConnects && variantAllowsConnection;
    const physicallyAdjacent = tilesPhysicallyConnected(tile, candidate);
    if ((tileConnects && variantAllowsConnection) || connectsBack || physicallyAdjacent) adjacentIds.add(candidate.id);
  });
  return [...adjacentIds].map((id) => placedById.get(id)).filter(Boolean);
}

function shortestPlacedPath(startId, targetId, tiles = placedTiles()) {
  if (startId === targetId) return [startId];

  const placedById = new Map(tiles.map((tile) => [tile.id, tile]));
  if (!placedById.has(startId) || !placedById.has(targetId)) return [];

  const previous = new Map([[startId, ""]]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    const options = sortAdversaryMoveOptions(current, targetId, adjacentPlacedTiles(current, tiles));
    for (const neighbor of options) {
      if (previous.has(neighbor.id)) continue;
      previous.set(neighbor.id, current);
      if (neighbor.id === targetId) {
        const path = [targetId];
        while (previous.get(path[0])) path.unshift(previous.get(path[0]));
        return path;
      }
      queue.push(neighbor.id);
    }
  }

  return [];
}

function sortAdversaryMoveOptions(fromId, targetId, options) {
  const from = activeCycle().tiles.find((tile) => tile.id === fromId);
  const target = activeCycle().tiles.find((tile) => tile.id === targetId);
  if (!from || !target) return options;

  return [...options].sort((a, b) => {
    const preferVertical = state.activeCycleId === "c2";
    const aPreferredDirection = preferVertical
      ? (Number(a.nx) === Number(from.nx) ? 0 : 1)
      : (Number(a.ny) === Number(from.ny) ? 0 : 1);
    const bPreferredDirection = preferVertical
      ? (Number(b.nx) === Number(from.nx) ? 0 : 1)
      : (Number(b.ny) === Number(from.ny) ? 0 : 1);
    if (aPreferredDirection !== bPreferredDirection) return aPreferredDirection - bPreferredDirection;

    const aDistance = manhattan(a, target);
    const bDistance = manhattan(b, target);
    if (aDistance !== bDistance) return aDistance - bDistance;

    return a.id.localeCompare(b.id);
  });
}

function manhattan(a, b) {
  return Math.abs(Number(a.nx) - Number(b.nx)) + Math.abs(Number(a.ny) - Number(b.ny));
}

function tilesPhysicallyConnected(a, b) {
  const layout = displayLayout(activeCycle());
  const aPosition = layout.position(a);
  const bPosition = layout.position(b);
  return Math.abs(Number(aPosition.x) - Number(bPosition.x))
    + Math.abs(Number(aPosition.y) - Number(bPosition.y)) === 1;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.currentTileSelect.addEventListener("change", () => setCurrentTile(elements.currentTileSelect.value));
elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  saveState();
  renderTiles();
});
elements.mapZoomInput.addEventListener("input", () => {
  state.mapZoom = normalizeMapZoom(elements.mapZoomInput.value);
  elements.mapZoomValue.textContent = `${state.mapZoom}%`;
  elements.tileGrid.style.setProperty("--map-zoom", `${state.mapZoom}%`);
  window.requestAnimationFrame(() => centerMapViewportOnArgo());
});
elements.mapZoomInput.addEventListener("change", () => {
  state.mapZoom = normalizeMapZoom(elements.mapZoomInput.value);
  saveState();
  renderTiles();
  renderControls();
  window.requestAnimationFrame(() => centerMapViewportOnArgo());
});
elements.showBackToggle.addEventListener("change", () => {
  state.showBack = elements.showBackToggle.checked;
  saveState();
  renderTiles();
});
elements.onlyExploredToggle.addEventListener("change", () => {
  state.onlyExplored = elements.onlyExploredToggle.checked;
  saveState();
  renderTiles();
});
elements.showAdjacencyToggle.addEventListener("change", () => {
  state.showAdjacency = elements.showAdjacencyToggle.checked;
  saveState();
  renderTiles();
});
if (elements.markCurrentButton) elements.markCurrentButton.addEventListener("click", markCurrentExplored);
elements.clearCycleButton.addEventListener("click", clearCycleExplored);
elements.hsProduceButton.addEventListener("click", produceScout);
elements.hsRecallButton.addEventListener("click", recallScout);
elements.hsDestroyButton.addEventListener("click", destroyScout);
elements.adSpawnButton.addEventListener("click", spawnAdversary);
elements.adMoveButton.addEventListener("click", moveAdversary);
elements.undoButton.addEventListener("click", undoLastChange);
elements.saveReturnButton.addEventListener("click", saveAndReturnToDashboard);
if (elements.openTagEditorButton) {
  elements.openTagEditorButton.addEventListener("click", () => {
    window.location.href = "./tag-editor.html";
  });
}
elements.saveNoteButton.addEventListener("click", saveTileNote);
elements.deleteNoteButton.addEventListener("click", deleteTileNote);
elements.closeNoteButton.addEventListener("click", closeTileNote);
elements.tileNoteDialog.addEventListener("cancel", () => {
  editingNoteTileId = "";
});
elements.tileGrid.addEventListener("click", (event) => {
  const variantToggle = event.target.closest("[data-variant-tile]");
  if (variantToggle) {
    window.clearTimeout(tileClickTimer);
    toggleTileVariant(variantToggle.dataset.variantTile);
    return;
  }
  const tile = event.target.closest(".tile-card[data-id]");
  if (!tile) return;
  if (pendingAdversarySpawnCandidates.size) {
    if (pendingAdversarySpawnCandidates.has(tile.dataset.id)) {
      placeAdversary(tile.dataset.id);
      return;
    }
    window.alert("请选择高亮的板块生成仇敌。");
    return;
  }
  window.clearTimeout(tileClickTimer);
  tileClickTimer = window.setTimeout(() => {
    openTileNote(tile.dataset.id);
  }, 220);
});
elements.tileGrid.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-variant-tile]")) return;
  const tile = event.target.closest(".tile-card[data-id]");
  if (!tile) return;
  window.clearTimeout(tileClickTimer);
  if (pendingAdversarySpawnCandidates.size) {
    if (pendingAdversarySpawnCandidates.has(tile.dataset.id)) {
      placeAdversary(tile.dataset.id);
      return;
    }
    window.alert("请选择高亮的板块生成仇敌。");
    return;
  }
  placeToken(tile.dataset.id);
});

window.addEventListener("load", () => {
  focusArgoAfterNextRender(12);
  scheduleArgoFocus();
});
window.addEventListener("pageshow", () => {
  focusArgoAfterNextRender(12);
  scheduleArgoFocus();
});

render();
loadCampaignMapSection();


