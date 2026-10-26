const state = {
  mapData: window.ATO_MAP_DATA || { cycles: [] },
  tagData: null,
  activeCycleId: "c1",
  selectedKey: "",
  search: "",
  onlyUnreviewed: false,
  onlyNoAdventure: false,
  dirty: false,
  saveTimer: null,
  loading: true,
  saving: false,
  error: "",
  // 服务端文件版本号：每次保存都要带上，用来发现「另一个页面/另一个用户已经改过」。
  revision: 0,
  // 非 null 表示上一次保存因为版本冲突被拒绝：本页改动仍在，等用户选载入还是覆盖。
  conflict: null,
};

const elements = {
  saveButton: document.querySelector("#saveButton"),
  saveNextButton: document.querySelector("#saveNextButton"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  cycleSelect: document.querySelector("#cycleSelect"),
  searchInput: document.querySelector("#searchInput"),
  onlyUnreviewedToggle: document.querySelector("#onlyUnreviewedToggle"),
  onlyNoAdventureToggle: document.querySelector("#onlyNoAdventureToggle"),
  statusText: document.querySelector("#statusText"),
  statusMeta: document.querySelector("#statusMeta"),
  tileCount: document.querySelector("#tileCount"),
  tileList: document.querySelector("#tileList"),
  tileTitle: document.querySelector("#tileTitle"),
  tileMeta: document.querySelector("#tileMeta"),
  tileImage: document.querySelector("#tileImage"),
  saveStatePill: document.querySelector("#saveStatePill"),
  tagSummary: document.querySelector("#tagSummary"),
  tagButtons: document.querySelector("#tagButtons"),
  notesInput: document.querySelector("#notesInput"),
  reviewedToggle: document.querySelector("#reviewedToggle"),
  rawPreview: document.querySelector("#rawPreview"),
  fileMeta: document.querySelector("#fileMeta"),
  conflictBar: document.querySelector("#conflictBar"),
  conflictText: document.querySelector("#conflictText"),
  conflictReload: document.querySelector("#conflictReload"),
  conflictOverwrite: document.querySelector("#conflictOverwrite"),
};

const tagDefinitionDefaults = [
  { id: "progress", label: "进展", shortcut: "1" },
  { id: "calamity", label: "灾祸", shortcut: "2" },
  { id: "central_adventure", label: "中枢冒险", shortcut: "3" },
  { id: "rr_adventure", label: "RR冒险", shortcut: "4" },
  { id: "city", label: "城市", shortcut: "5" },
  { id: "wild_titan", label: "野生泰坦", shortcut: "6" },
  { id: "oasis", label: "绿洲", shortcut: "7", cycles: ["c4"] },
  { id: "silver_ruin", label: "白银种遗迹", shortcut: "8", cycles: ["c5"] },
  { id: "river", label: "河流航道", cycles: ["c1"] },
  { id: "restricted", label: "限行（内部航路）", cycles: [], scope: "route" },
  { id: "resistance_hideout", label: "抵抗军据点", cycles: ["c2"] },
  { id: "spartan_stronghold", label: "斯巴达要塞", cycles: ["c2"] },
  { id: "frozen_time", label: "凝固时光", cycles: ["c3"] },
  { id: "time_wound", label: "时光裂痕", cycles: ["c3"] },
  { id: "time_portal", label: "时光传送门", cycles: ["c3"] },
  { id: "daedalus_lighthouse", label: "代达罗斯灯塔", cycles: ["c3"] },
  { id: "underwater_city", label: "水下城市", cycles: ["c5"] },
  { id: "hourglass_icon", label: "沙漏形图标（待释义）", cycles: ["c1"] },
  { id: "staff_icon", label: "杖形图标（待释义）", cycles: ["c1"] },
  { id: "wheel_icon", label: "车轮图标（待释义）", cycles: ["c3"] },
  { id: "smoking_bowl_icon", label: "烟雾碗图标（待释义）", cycles: ["c4"] },
  { id: "helmet_icon", label: "头盔形图标（待释义）", cycles: ["c5"], scope: "adjacent" },
];
const adventureTagIds = ["central_adventure", "rr_adventure", "adventure", "city"];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function tileKey(cycleId, tileId) {
  return `${cycleId}:${tileId}`;
}

function getCycle(cycleId) {
  return state.mapData.cycles.find((cycle) => cycle.id === cycleId) || state.mapData.cycles[0];
}

function getCurrentCycle() {
  return getCycle(state.activeCycleId);
}

function entryKeyParts(key) {
  const [cycleId = "", tileId = "", face = ""] = String(key || "").split(":");
  return { cycleId, tileId, face };
}

function getEntry(cycleId, tileId) {
  return state.tagData?.tiles?.[tileKey(cycleId, tileId)] || null;
}

function ensureEntry(cycleId, tileId) {
  state.tagData.tiles ||= {};
  const key = tileKey(cycleId, tileId);
  if (!state.tagData.tiles[key]) {
    state.tagData.tiles[key] = {
      cycleId,
      tileId,
      reviewed: false,
      tags: [],
      notes: "",
      updatedAt: new Date().toISOString(),
    };
  }
  return state.tagData.tiles[key];
}

function normalizeData(data) {
  // 从原对象出发再覆盖已知字段：这份文件里还有编辑器不认识的键（板块的 factions /
  // factionUpdatedAt、标签定义的 cycles 等），从零拼新对象会让它们在下一次保存时消失。
  const normalized = {
    ...(isPlainObject(data) ? data : {}),
    version: Number.isFinite(Number(data?.version)) ? Number(data.version) : 1,
    source: String(data?.source || "map/map-data.js"),
    updatedAt: String(data?.updatedAt || new Date().toISOString()),
    tagDefinitions: [],
    tiles: {},
  };
  delete normalized.revision; // 版本号单独放在 state.revision，不混进要提交的数据里

  const defs = Array.isArray(data?.tagDefinitions) ? data.tagDefinitions : tagDefinitionDefaults;
  normalized.tagDefinitions = defs
    .map((definition) => {
      if (!isPlainObject(definition) || !definition.id) return null;
      return {
        ...definition,
        id: String(definition.id),
        label: String(definition.label || definition.id),
        shortcut: definition.shortcut == null ? "" : String(definition.shortcut),
      };
    })
    .filter(Boolean);

  const tiles = isPlainObject(data?.tiles) ? data.tiles : {};
  Object.entries(tiles).forEach(([key, entry]) => {
    if (!isPlainObject(entry)) return;
    const parts = entryKeyParts(key);
    const cycleId = String(entry.cycleId || parts.cycleId || "").trim();
    const tileId = String(entry.tileId || parts.tileId || "").trim();
    if (!cycleId || !tileId) return;
    const face = String(entry.face || parts.face || "").trim();
    const hasFace = face === "A" || face === "B";
    const tags = Array.isArray(entry.tags) ? [...new Set(entry.tags.map((tag) => String(tag).trim()).filter(Boolean))] : [];
    // 双面记录必须保留独立的键，否则 A / B 会覆盖基础记录和彼此。
    const keyWithFace = tileKey(cycleId, tileId) + (hasFace ? `:${face}` : "");
    normalized.tiles[keyWithFace] = {
      ...entry,
      cycleId,
      tileId,
      ...(hasFace ? { face } : {}),
      reviewed: Boolean(entry.reviewed),
      tags,
      notes: String(entry.notes || ""),
      updatedAt: String(entry.updatedAt || new Date().toISOString()),
    };
  });

  return normalized;
}

async function loadTagData() {
  const response = await fetch("../api/map-tile-tags.php", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "读取失败");
  state.tagData = normalizeData(payload.data);
  state.revision = Number.isFinite(Number(payload.revision)) ? Number(payload.revision) : 0;
  state.conflict = null;
}

async function saveTagData(options = {}) {
  const force = Boolean(options.force);
  state.saving = true;
  renderStatus();
  const payload = { data: state.tagData };
  // 带上「我基于哪个版本改的」：服务器在写锁里比对，别人已经改过就回 409 而不是覆盖。
  // force 用于用户在冲突提示里明确选择「用本页覆盖」。
  if (!force) payload.expectedRevision = state.revision;
  const response = await fetch("../api/map-tile-tags.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);
  if (response.status === 409 && result?.code === "SAVE_CONFLICT") {
    // 不抛异常：调用方的 catch 会把它当成普通失败，而这里需要的是让用户选择。
    state.saving = false;
    state.dirty = true;
    state.conflict = {
      revision: Number.isFinite(Number(result.revision)) ? Number(result.revision) : state.revision,
      updatedAt: String(result.updatedAt || ""),
    };
    state.error = "";
    renderStatus();
    return false;
  }
  if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);
  if (!result?.ok) throw new Error(result.error || "保存失败");
  state.tagData = normalizeData(result.data);
  state.revision = Number.isFinite(Number(result.revision)) ? Number(result.revision) : state.revision;
  state.dirty = false;
  state.saving = false;
  state.conflict = null;
  state.error = "";
  renderStatus();
  return true;
}

async function resolveConflict(mode) {
  if (!state.conflict) return;
  if (mode === "reload") {
    // 放弃本页改动，载入服务器上的最新版本
    try {
      state.error = "";
      await loadTagData();
      state.dirty = false;
      render();
    } catch (error) {
      state.error = String(error.message || error);
      renderStatus();
    }
    return;
  }
  try {
    state.error = "";
    const saved = await saveTagData({ force: true });
    if (saved) render();
  } catch (error) {
    state.error = String(error.message || error);
    state.saving = false;
    state.dirty = true;
    renderStatus();
  }
}

function queueSave() {
  state.dirty = true;
  if (state.conflict) {
    // 版本冲突未解决前不再自动重试，否则每 260ms 就打一次服务器并被拒一次。
    renderStatus();
    return;
  }
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    saveTagData().catch((error) => {
      state.error = String(error.message || error);
      state.saving = false;
      state.dirty = true;
      renderStatus();
    });
  }, 260);
  renderStatus();
}

function currentTileList() {
  const cycle = getCurrentCycle();
  const query = state.search.trim().toLowerCase();
  const tiles = cycle?.tiles || [];
  return tiles.filter((tile) => {
    const entry = getEntry(cycle.id, tile.id);
    const haystack = [
      tile.id,
      tile.label,
      tile.source,
      tile.neighbors?.special,
      ...(entry ? [entry.notes, (entry.tags || []).join(" ")] : []),
    ].map((value) => String(value || "").toLowerCase());
    const matchesQuery = !query || haystack.some((value) => value.includes(query));
    const matchesUnreviewed = !state.onlyUnreviewed || !entry?.reviewed;
    const tags = entry?.tags || [];
    const matchesNoAdventure = !state.onlyNoAdventure || !tags.some((tagId) => adventureTagIds.includes(tagId));
    return matchesQuery && matchesUnreviewed && matchesNoAdventure;
  });
}

function currentTile() {
  const { cycleId, tileId } = entryKeyParts(state.selectedKey);
  const cycle = getCycle(cycleId) || getCurrentCycle();
  const tile = cycle?.tiles?.find((item) => item.id === tileId);
  return { cycle, tile, entry: tile ? getEntry(cycle.id, tile.id) : null };
}

function selectTile(cycleId, tileId) {
  state.activeCycleId = cycleId;
  state.selectedKey = tileKey(cycleId, tileId);
  render();
}

function selectNext(delta) {
  const tiles = currentTileList();
  if (!tiles.length) return;
  const current = state.selectedKey ? tiles.findIndex((tile) => tileKey(state.activeCycleId, tile.id) === state.selectedKey) : -1;
  const nextIndex = current < 0 ? 0 : Math.max(0, Math.min(tiles.length - 1, current + delta));
  const tile = tiles[nextIndex];
  if (tile) selectTile(state.activeCycleId, tile.id);
}

function updateEntryFromForm() {
  const { cycle, tile } = currentTile();
  if (!tile) return null;
  const entry = ensureEntry(cycle.id, tile.id);
  entry.reviewed = Boolean(elements.reviewedToggle.checked);
  entry.notes = elements.notesInput.value;
  entry.tags = collectSelectedTags();
  if (entry.tags.length || String(entry.notes || "").trim()) entry.reviewed = true;
  entry.updatedAt = new Date().toISOString();
  state.tagData.tiles[tileKey(cycle.id, tile.id)] = entry;
  state.dirty = true;
  queueSave();
  return entry;
}

function collectSelectedTags() {
  return [...elements.tagButtons.querySelectorAll("button[data-tag-id].active")].map((button) => button.dataset.tagId);
}

function setSelectedTags(tagIds) {
  const tagSet = new Set(tagIds || []);
  [...elements.tagButtons.querySelectorAll("button[data-tag-id]")].forEach((button) => {
    const active = tagSet.has(button.dataset.tagId);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function nextTileInVisibleList() {
  const tiles = currentTileList();
  if (!tiles.length) return null;
  const currentIndex = tiles.findIndex((tile) => tile.id === currentTile().tile?.id);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % tiles.length : 0;
  return tiles[nextIndex] || null;
}

function prevTileInVisibleList() {
  const tiles = currentTileList();
  if (!tiles.length) return null;
  const currentIndex = tiles.findIndex((tile) => tile.id === currentTile().tile?.id);
  const prevIndex = currentIndex >= 0 ? (currentIndex - 1 + tiles.length) % tiles.length : 0;
  return tiles[prevIndex] || null;
}

function updateSavePill() {
  const pill = elements.saveStatePill;
  pill.classList.remove("saved", "dirty");
  if (state.saving) {
    pill.textContent = "保存中";
    pill.classList.add("dirty");
  } else if (state.dirty) {
    pill.textContent = "未保存";
    pill.classList.add("dirty");
  } else {
    pill.textContent = "已保存";
    pill.classList.add("saved");
  }
}

function renderConflict() {
  if (!elements.conflictBar) return;
  const conflict = state.conflict;
  elements.conflictBar.hidden = !conflict;
  if (!conflict) return;
  const stamp = conflict.updatedAt ? `，服务器更新时间 ${conflict.updatedAt}` : "";
  elements.conflictText.textContent =
    `这份标签文件已被其他页面或用户改动（服务器版本 ${conflict.revision}${stamp}）。本次保存没有写入，本页改动还在。`;
}

function renderStatus() {
  const cycle = getCurrentCycle();
  const tiles = currentTileList();
  const { tile, entry } = currentTile();
  const done = cycle?.tiles?.filter((item) => getEntry(cycle.id, item.id)?.reviewed).length || 0;
  const tagged = cycle?.tiles?.filter((item) => (getEntry(cycle.id, item.id)?.tags || []).length > 0).length || 0;

  elements.statusText.textContent = state.loading
    ? "正在加载标签文件"
    : state.conflict
      ? "保存被拒绝：文件已被改动"
      : state.error
        ? "保存失败"
        : `Cycle ${cycle?.label || cycle?.id || "?"}`;
  elements.statusMeta.textContent = state.loading
    ? "请稍候。"
    : state.conflict
      ? "本页改动还在，请选择：载入服务器版本，或用本页覆盖。"
      : state.error
        ? state.error
        : `${cycle?.tiles?.length || 0} 块 / 已核对 ${done} / 已打标 ${tagged} / 当前筛选 ${tiles.length}`;
  elements.tileCount.textContent = `${tiles.length} 张`;
  elements.fileMeta.textContent = state.tagData
    ? `更新时间 ${state.tagData.updatedAt || "-"} · 版本 ${state.revision}`
    : "";
  updateSavePill();
  renderConflict();

  if (tile) {
    elements.tileTitle.textContent = `${tile.label} · ${cycle.label}`;
    elements.tileMeta.textContent = `来源 ${tile.source || "-"} · 坐标 ${tile.nx}, ${tile.ny}`;
    const artwork = window.ATO_MAP_ARTWORK?.resolve(tile.front);
    const paths = artwork ? [artwork.overlay, artwork.base] : [tile.front];
    elements.tileImage.style.backgroundImage = paths.map(path => `url("../map/${String(path).replace(/^\.\//, '').replace(/"/g, '%22')}")`).join(',');
    window.ATO_MAP_ARTWORK?.paintBackground(elements.tileImage, tile.front, path => `../map/${String(path).replace(/^\.\//, '')}`, document);
    elements.tileImage.setAttribute('aria-label', tile.label);
    elements.rawPreview.value = JSON.stringify(state.tagData, null, 2);
    elements.reviewedToggle.checked = Boolean(entry?.reviewed);
    elements.notesInput.value = entry?.notes || "";
    renderTagSummary(entry);
    renderTagButtons(entry);
    renderTileList();
  } else {
    elements.tileTitle.textContent = "未选择";
    elements.tileMeta.textContent = "点击左侧板块开始打标。";
    window.ATO_MAP_ARTWORK?.paintBackground(elements.tileImage, '');
    elements.tileImage.style.backgroundImage = '';
    elements.tileImage.setAttribute('aria-label', '板块预览');
    elements.rawPreview.value = JSON.stringify(state.tagData, null, 2);
    renderTagSummary(null);
    renderTagButtons(null);
    renderTileList();
  }
}

function renderTagSummary(entry) {
  const tags = entry?.tags || [];
  elements.tagSummary.innerHTML = "";
  const items = tags.length ? tags : ["暂无标签"];
  items.forEach((tagId) => {
    const def = state.tagData?.tagDefinitions?.find((item) => item.id === tagId) || { id: tagId, label: tagId };
    const chip = document.createElement("span");
    chip.className = `tag-chip${tags.includes(tagId) ? " active" : ""}`;
    chip.textContent = def.label;
    elements.tagSummary.appendChild(chip);
  });
}

function renderTagButtons(entry) {
  const selected = new Set(entry?.tags || []);
  elements.tagButtons.innerHTML = "";
  (state.tagData?.tagDefinitions || tagDefinitionDefaults).forEach((definition) => {
    if (definition.scope === "adjacent") return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `secondary tag-chip${selected.has(definition.id) ? " active" : ""}`;
    button.dataset.tagId = definition.id;
    button.setAttribute("aria-pressed", selected.has(definition.id) ? "true" : "false");
    button.innerHTML = `${escapeHtml(definition.label)}${definition.shortcut ? ` <small>${escapeHtml(definition.shortcut)}</small>` : ""}`;
    button.addEventListener("click", () => {
      const { cycle, tile } = currentTile();
      if (!tile) return;
      const working = ensureEntry(cycle.id, tile.id);
      const tagSet = new Set(working.tags || []);
      if (tagSet.has(definition.id)) tagSet.delete(definition.id);
      else tagSet.add(definition.id);
      working.tags = [...tagSet];
      if (working.tags.length || String(working.notes || "").trim()) working.reviewed = true;
      working.updatedAt = new Date().toISOString();
      state.tagData.tiles[tileKey(cycle.id, tile.id)] = working;
      setSelectedTags(working.tags);
      queueSave();
      renderStatus();
    });
    elements.tagButtons.appendChild(button);
  });
  setSelectedTags(entry?.tags || []);
}

function renderTileList() {
  const cycle = getCurrentCycle();
  const tiles = currentTileList();
  const selected = currentTile().tile?.id || "";
  elements.tileList.innerHTML = "";
  tiles.forEach((tile) => {
    const entry = getEntry(cycle.id, tile.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = tile.id === selected ? "active" : "";
    button.innerHTML = `
      <span>${escapeHtml(tile.label)}</span>
      <small>${entry?.reviewed ? "已核对" : (entry?.tags?.length ? "已打标" : "未打标")}</small>
    `;
    button.addEventListener("click", () => selectTile(cycle.id, tile.id));
    elements.tileList.appendChild(button);
  });
}

function renderCycleOptions() {
  elements.cycleSelect.innerHTML = "";
  state.mapData.cycles.forEach((cycle) => {
    const option = document.createElement("option");
    option.value = cycle.id;
    option.textContent = cycle.label;
    elements.cycleSelect.appendChild(option);
  });
  elements.cycleSelect.value = state.activeCycleId;
}

function getFirstTileId(cycleId) {
  return getCycle(cycleId)?.tiles?.[0]?.id || "";
}

function render() {
  renderStatus();
  renderCycleOptions();
  elements.searchInput.value = state.search;
  elements.onlyUnreviewedToggle.checked = state.onlyUnreviewed;
  if (elements.onlyNoAdventureToggle) elements.onlyNoAdventureToggle.checked = state.onlyNoAdventure;
  elements.cycleSelect.value = state.activeCycleId;
  const cycle = getCurrentCycle();
  if (!state.selectedKey || entryKeyParts(state.selectedKey).cycleId !== cycle.id) {
    const firstTile = getFirstTileId(cycle.id);
    state.selectedKey = firstTile ? tileKey(cycle.id, firstTile) : "";
  }
  renderStatus();
  renderTileList();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  const goPrev = () => {
    const prev = prevTileInVisibleList();
    if (prev) state.selectedKey = tileKey(state.activeCycleId, prev.id);
    render();
  };

  const goNext = () => {
    const next = nextTileInVisibleList();
    if (next) state.selectedKey = tileKey(state.activeCycleId, next.id);
    render();
  };

  elements.cycleSelect.addEventListener("change", () => {
    state.activeCycleId = elements.cycleSelect.value;
    const firstTile = getFirstTileId(state.activeCycleId);
    state.selectedKey = firstTile ? tileKey(state.activeCycleId, firstTile) : "";
    render();
  });

  elements.searchInput.addEventListener("input", () => {
    state.search = elements.searchInput.value;
    render();
  });

  elements.onlyUnreviewedToggle.addEventListener("change", () => {
    state.onlyUnreviewed = elements.onlyUnreviewedToggle.checked;
    const firstVisible = currentTileList()[0];
    if (firstVisible) state.selectedKey = tileKey(state.activeCycleId, firstVisible.id);
    render();
  });

  if (elements.onlyNoAdventureToggle) {
    elements.onlyNoAdventureToggle.addEventListener("change", () => {
      state.onlyNoAdventure = elements.onlyNoAdventureToggle.checked;
      const firstVisible = currentTileList()[0];
      if (firstVisible) state.selectedKey = tileKey(state.activeCycleId, firstVisible.id);
      render();
    });
  }

  elements.reviewedToggle.addEventListener("change", () => {
    updateEntryFromForm();
  });

  elements.notesInput.addEventListener("input", () => {
    updateEntryFromForm();
  });

  elements.saveButton.addEventListener("click", async () => {
    try {
      updateEntryFromForm();
      await saveTagData();
      render();
    } catch (error) {
      state.error = String(error.message || error);
      state.saving = false;
      state.dirty = true;
      renderStatus();
    }
  });

  elements.saveNextButton.addEventListener("click", async () => {
    try {
      updateEntryFromForm();
      await saveTagData();
      goNext();
      render();
    } catch (error) {
      state.error = String(error.message || error);
      state.saving = false;
      state.dirty = true;
      renderStatus();
    }
  });

  elements.prevButton.addEventListener("click", () => {
    goPrev();
  });

  elements.nextButton.addEventListener("click", () => {
    goNext();
  });

  if (elements.conflictReload) {
    elements.conflictReload.addEventListener("click", () => {
      void resolveConflict("reload");
    });
  }

  if (elements.conflictOverwrite) {
    elements.conflictOverwrite.addEventListener("click", () => {
      void resolveConflict("overwrite");
    });
  }

  window.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
    const key = event.key;
    if (key === "j" || key === "J" || key === "ArrowRight") {
      event.preventDefault();
      goNext();
      return;
    }
    if (key === "k" || key === "K" || key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
      return;
    }
    const definition = (state.tagData?.tagDefinitions || tagDefinitionDefaults).find((item) => String(item.shortcut || "") === key);
    if (!definition) return;
    event.preventDefault();
    const { cycle, tile } = currentTile();
    if (!tile) return;
    const entry = ensureEntry(cycle.id, tile.id);
    const tagSet = new Set(entry.tags || []);
    if (tagSet.has(definition.id)) tagSet.delete(definition.id);
    else tagSet.add(definition.id);
    entry.tags = [...tagSet];
    if (entry.tags.length || String(entry.notes || "").trim()) entry.reviewed = true;
    entry.updatedAt = new Date().toISOString();
    state.tagData.tiles[tileKey(cycle.id, tile.id)] = entry;
    renderTagButtons(entry);
    queueSave();
  });
}

async function main() {
  try {
    await loadTagData();
    state.loading = false;
    state.activeCycleId = state.mapData.cycles[0]?.id || "c1";
    state.selectedKey = getFirstTileId(state.activeCycleId) ? tileKey(state.activeCycleId, getFirstTileId(state.activeCycleId)) : "";
    bindEvents();
    render();
  } catch (error) {
    state.loading = false;
    state.error = String(error.message || error);
    bindEvents();
    render();
  }
}

main();
