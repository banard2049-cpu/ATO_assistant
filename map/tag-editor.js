const state = {
  mapData: window.ATO_MAP_DATA || { cycles: [] },
  tagData: null,
  activeCycleId: "c1",
  selectedKey: "",
  search: "",
  onlyUnreviewed: false,
  dirty: false,
  saveTimer: null,
  loading: true,
  saving: false,
  error: "",
};

const elements = {
  saveButton: document.querySelector("#saveButton"),
  saveNextButton: document.querySelector("#saveNextButton"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  cycleSelect: document.querySelector("#cycleSelect"),
  searchInput: document.querySelector("#searchInput"),
  onlyUnreviewedToggle: document.querySelector("#onlyUnreviewedToggle"),
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
};

const tagDefinitionDefaults = [
  { id: "progress", label: "进展", shortcut: "1" },
  { id: "calamity", label: "灾祸", shortcut: "2" },
  { id: "central_adventure", label: "中枢冒险", shortcut: "3" },
  { id: "rr_adventure", label: "RR冒险", shortcut: "4" },
  { id: "city", label: "城市", shortcut: "5" },
];

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
  const [cycleId = "", tileId = ""] = String(key || "").split(":");
  return { cycleId, tileId };
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
  const normalized = {
    version: Number.isFinite(Number(data?.version)) ? Number(data.version) : 1,
    source: String(data?.source || "map/map-data.js"),
    updatedAt: String(data?.updatedAt || new Date().toISOString()),
    tagDefinitions: [],
    tiles: {},
  };

  const defs = Array.isArray(data?.tagDefinitions) ? data.tagDefinitions : tagDefinitionDefaults;
  normalized.tagDefinitions = defs
    .map((definition) => {
      if (!isPlainObject(definition) || !definition.id) return null;
      return {
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
    const tags = Array.isArray(entry.tags) ? [...new Set(entry.tags.map((tag) => String(tag).trim()).filter(Boolean))] : [];
    normalized.tiles[tileKey(cycleId, tileId)] = {
      cycleId,
      tileId,
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
}

async function saveTagData() {
  state.saving = true;
  renderStatus();
  const payload = { data: state.tagData };
  const response = await fetch("../api/map-tile-tags.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "保存失败");
  state.tagData = normalizeData(result.data);
  state.dirty = false;
  state.saving = false;
  renderStatus();
}

function queueSave() {
  state.dirty = true;
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
    return matchesQuery && matchesUnreviewed;
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

function renderStatus() {
  const cycle = getCurrentCycle();
  const tiles = currentTileList();
  const { tile, entry } = currentTile();
  const done = cycle?.tiles?.filter((item) => getEntry(cycle.id, item.id)?.reviewed).length || 0;
  const tagged = cycle?.tiles?.filter((item) => (getEntry(cycle.id, item.id)?.tags || []).length > 0).length || 0;

  elements.statusText.textContent = state.loading
    ? "正在加载标签文件"
    : state.error
      ? "保存失败"
      : `Cycle ${cycle?.label || cycle?.id || "?"}`;
  elements.statusMeta.textContent = state.loading
    ? "请稍候。"
    : state.error
      ? state.error
      : `${cycle?.tiles?.length || 0} 块 / 已核对 ${done} / 已打标 ${tagged} / 当前筛选 ${tiles.length}`;
  elements.tileCount.textContent = `${tiles.length} 张`;
  elements.fileMeta.textContent = state.tagData ? `更新时间 ${state.tagData.updatedAt || "-"}` : "";
  updateSavePill();

  if (tile) {
    elements.tileTitle.textContent = `${tile.label} · ${cycle.label}`;
    elements.tileMeta.textContent = `来源 ${tile.source || "-"} · 坐标 ${tile.nx}, ${tile.ny}`;
    elements.tileImage.src = tile.front;
    elements.tileImage.alt = tile.label;
    elements.rawPreview.value = JSON.stringify(state.tagData, null, 2);
    elements.reviewedToggle.checked = Boolean(entry?.reviewed);
    elements.notesInput.value = entry?.notes || "";
    renderTagSummary(entry);
    renderTagButtons(entry);
    renderTileList();
  } else {
    elements.tileTitle.textContent = "未选择";
    elements.tileMeta.textContent = "点击左侧板块开始打标。";
    elements.tileImage.src = "";
    elements.tileImage.alt = "板块预览";
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
