(function () {
  "use strict";

  const manifest = window.AIBP_C45_BP_CARD_MANIFEST;
  if (!manifest) throw new Error("C4-C5 BP card manifest is missing.");

  const STORAGE_KEY = "ato.aibp.c45BpResourceLabels.v5";
  const LEGACY_STORAGE_KEYS = [
    "ato.aibp.c45BpResourceLabels.v4",
    "ato.aibp.c45BpResourceLabels.v3"
  ];
  const SAVE_API = "../../api/bp-resource-map-c45.php";
  const cards = manifest.cards;
  const resourceKeys = manifest.resourceKeys;
  const resourceDefinitions = Object.fromEntries(
    Object.values(manifest.resourcesByCycle).flat()
      .map((definition) => [definition[0], definition])
  );
  const apostleIds = new Set(manifest.apostles.map((apostle) => apostle.id));
  const elements = Object.fromEntries([
    "saveState", "cycleFilter", "apostleFilter", "statusFilter", "searchInput",
    "saveServerButton", "exportJsButton", "exportJsonButton", "importInput",
    "progressText", "progressFill", "cardList", "cardTitle", "cardMeta",
    "previousButton", "nextButton", "cardImage", "cropImage", "cropWindow", "reviewedInput",
    "resourceGrid", "resourceSummary", "clearButton", "confirmNextButton", "toast"
  ].map((id) => [id, document.getElementById(id)]));

  let labels = {};
  let reviewed = new Set();
  let selectedFileName = cards[0]?.fileName || "";
  let filteredCards = cards.slice();
  let toastTimer = 0;
  let dirty = false;

  function clampCount(value) {
    const count = Math.floor(Number(value) || 0);
    return Math.max(0, Math.min(99, count));
  }

  function normalizeResources(value) {
    const normalized = {};
    if (!value || typeof value !== "object") return normalized;
    resourceKeys.forEach((key) => {
      const count = clampCount(value[key]);
      if (count > 0) normalized[key] = count;
    });
    return normalized;
  }

  function currentCard() {
    return cards.find((card) => card.fileName === selectedFileName) || null;
  }

  function currentResources() {
    labels[selectedFileName] ||= {};
    return labels[selectedFileName];
  }

  function swapDragonBpLevel(fileName) {
    return String(fileName || "").replace(
      /^DRAGON_OF_PHOBOS_BP_(I|III)_/,
      (_, level) => `DRAGON_OF_PHOBOS_BP_${level === "I" ? "III" : "I"}_`
    );
  }

  function migrateLegacyState(saved, legacyKey) {
    if (!saved || typeof saved !== "object") return saved;
    if (!legacyKey.endsWith(".v3")) return saved;
    const migrated = { ...saved };
    if (saved.labels && typeof saved.labels === "object") {
      migrated.labels = Object.fromEntries(
        Object.entries(saved.labels).map(([fileName, resources]) => [
          swapDragonBpLevel(fileName),
          resources,
        ])
      );
    }
    if (Array.isArray(saved.reviewed)) {
      migrated.reviewed = saved.reviewed.map(swapDragonBpLevel);
    }
    migrated.selectedFileName = swapDragonBpLevel(saved.selectedFileName);
    return migrated;
  }

  function loadInitialState() {
    const map = window.AIBP_BP_RESOURCE_MAP || {};
    const projectIsPrefill = window.AIBP_C45_BP_RESOURCE_PREFILL === true;
    cards.forEach((card) => {
      const apostleMap = map[card.apostle];
      if (!apostleMap || !Object.prototype.hasOwnProperty.call(apostleMap, card.fileName)) return;
      labels[card.fileName] = normalizeResources(apostleMap[card.fileName]);
      if (!projectIsPrefill) reviewed.add(card.fileName);
    });

    try {
      const currentState = localStorage.getItem(STORAGE_KEY);
      const legacyKey = currentState
        ? ""
        : LEGACY_STORAGE_KEYS.find((key) => localStorage.getItem(key)) || "";
      const legacyState = legacyKey ? localStorage.getItem(legacyKey) : null;
      const saved = currentState
        ? JSON.parse(currentState)
        : migrateLegacyState(JSON.parse(legacyState || "null"), legacyKey);
      if (!saved || typeof saved !== "object") return;
      if (!currentState && legacyState) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      }
      if (saved.labels && typeof saved.labels === "object") {
        Object.entries(saved.labels).forEach(([fileName, resources]) => {
          if (cards.some((card) => card.fileName === fileName)) {
            labels[fileName] = normalizeResources(resources);
          }
        });
      }
      if (Array.isArray(saved.reviewed)) {
        reviewed = new Set(saved.reviewed.filter((fileName) =>
          cards.some((card) => card.fileName === fileName)
        ));
      }
      if (cards.some((card) => card.fileName === saved.selectedFileName)) {
        selectedFileName = saved.selectedFileName;
      }
    } catch {
      showToast("本地标注读取失败，已使用项目映射。", true);
    }
  }

  function persist() {
    const payload = {
      version: 1,
      selectedFileName,
      labels,
      reviewed: Array.from(reviewed)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    dirty = true;
    elements.saveState.textContent = "本地标注已同步，项目文件尚未保存";
  }

  function markProjectSaved() {
    dirty = false;
    elements.saveState.textContent = "项目资源映射已保存";
  }

  function resourcesForCycle(cycle) {
    return manifest.resourcesByCycle[cycle] || [];
  }

  function formatResources(resources, cycle = "") {
    const keys = cycle
      ? resourcesForCycle(cycle).map(([key]) => key)
      : resourceKeys;
    return keys
      .filter((key) => Number(resources?.[key] || 0) > 0)
      .map((key) => `${resourceDefinitions[key]?.[2] || key}×${resources[key]}`)
      .join(" + ");
  }

  function fillApostleFilter() {
    elements.apostleFilter.innerHTML = [
      '<option value="">全部使徒</option>',
      ...manifest.apostles.map((apostle) =>
        `<option value="${apostle.id}">${apostle.cycle} · ${apostle.label}</option>`
      )
    ].join("");
  }

  function applyFilters() {
    const cycle = elements.cycleFilter.value;
    const apostle = elements.apostleFilter.value;
    const status = elements.statusFilter.value;
    const query = elements.searchInput.value.trim().toLowerCase();

    filteredCards = cards.filter((card) => {
      if (cycle && card.cycle !== cycle) return false;
      if (apostle && card.apostle !== apostle) return false;
      if (status === "pending" && reviewed.has(card.fileName)) return false;
      if (status === "reviewed" && !reviewed.has(card.fileName)) return false;
      if (query) {
        const haystack = `${card.apostleLabel} ${card.apostle} ${card.fileName} ${card.level} ${card.index}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    if (!filteredCards.some((card) => card.fileName === selectedFileName)) {
      selectedFileName = filteredCards[0]?.fileName || "";
    }
    render();
  }

  function renderList() {
    if (filteredCards.length === 0) {
      elements.cardList.innerHTML = '<div class="empty-list">没有符合条件的卡牌</div>';
      return;
    }

    elements.cardList.innerHTML = filteredCards.map((card) => {
      const active = card.fileName === selectedFileName ? " active" : "";
      const done = reviewed.has(card.fileName) ? " reviewed" : "";
      const value = formatResources(labels[card.fileName], card.cycle);
      return `
        <button type="button" class="card-row${active}${done}" data-card="${card.fileName}">
          <span class="card-state" aria-hidden="true"></span>
          <span class="card-row-main">
            <span class="card-row-title">${card.apostleLabel}</span>
            <span class="card-row-subtitle">${card.level}-${String(card.index).padStart(3, "0")}${card.combined ? " · AI/BP" : ""}</span>
          </span>
          <span class="card-row-value">${value || "待标注"}</span>
        </button>
      `;
    }).join("");

    elements.cardList.querySelector(".card-row.active")
      ?.scrollIntoView({ block: "nearest" });
  }

  function renderProgress() {
    const done = cards.filter((card) => reviewed.has(card.fileName)).length;
    const percent = cards.length ? (done / cards.length) * 100 : 0;
    elements.progressText.textContent = `${done} / ${cards.length}`;
    elements.progressFill.style.width = `${percent}%`;
  }

  function renderPreview() {
    const card = currentCard();
    const disabled = !card;
    elements.previousButton.disabled = disabled || filteredCards.length < 2;
    elements.nextButton.disabled = disabled || filteredCards.length < 2;
    elements.reviewedInput.disabled = disabled;
    elements.clearButton.disabled = disabled;
    elements.confirmNextButton.disabled = disabled;

    if (!card) {
      elements.cardTitle.textContent = "未选择卡牌";
      elements.cardMeta.textContent = "";
      elements.cardImage.removeAttribute("src");
      elements.cropImage.removeAttribute("src");
      elements.cropWindow.classList.remove("combined");
      elements.cardImage.alt = "";
      elements.cropImage.alt = "";
      return;
    }

    elements.cardTitle.textContent = `${card.apostleLabel} · ${card.level}-${String(card.index).padStart(3, "0")}`;
    elements.cardMeta.textContent = card.fileName;
    elements.cardImage.src = card.image;
    elements.cropImage.src = card.image;
    elements.cropWindow.classList.toggle("combined", card.combined);
    elements.cardImage.alt = `${card.apostleLabel} BP ${card.level}-${card.index}`;
    elements.cropImage.alt = `${card.apostleLabel} BP 资源区域`;
    elements.reviewedInput.checked = reviewed.has(card.fileName);
  }

  function renderResources() {
    const card = currentCard();
    const values = card ? currentResources() : {};
    const definitions = card ? resourcesForCycle(card.cycle) : [];
    elements.resourceGrid.innerHTML = definitions.map(([key, code, zh, en]) => {
      const count = Number(values[key] || 0);
      return `
        <div class="resource-control${count ? " active" : ""}" data-resource="${key}">
          <button type="button" class="resource-button" data-resource-add="${key}"${card ? "" : " disabled"} title="${key} +1">
            <img class="resource-art" src="../../record/assets/resource-icons/${key}.png" alt="">
            <span class="resource-name">
              <strong>${zh}</strong>
              <small>${code} · ${en}</small>
            </span>
          </button>
          <button type="button" class="step-button" data-resource-step="${key}" data-delta="-1"${card && count ? "" : " disabled"} aria-label="${zh} 减少">−</button>
          <span class="resource-value">${count}</span>
          <button type="button" class="step-button" data-resource-step="${key}" data-delta="1"${card ? "" : " disabled"} aria-label="${zh} 增加">+</button>
        </div>
      `;
    }).join("");

    const text = formatResources(values, card?.cycle || "");
    elements.resourceSummary.innerHTML = text
      ? `<strong>${text}</strong>`
      : "尚未标注资源";
  }

  function render() {
    renderList();
    renderProgress();
    renderPreview();
    renderResources();
  }

  function saveLocalSelection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      selectedFileName,
      labels,
      reviewed: Array.from(reviewed)
    }));
  }

  function selectCard(fileName) {
    if (!cards.some((card) => card.fileName === fileName)) return;
    selectedFileName = fileName;
    saveLocalSelection();
    render();
  }

  function moveSelection(delta, preferPending = false) {
    if (filteredCards.length === 0) return;
    const currentIndex = filteredCards.findIndex((card) => card.fileName === selectedFileName);
    const startIndex = currentIndex < 0 ? 0 : currentIndex;

    if (preferPending) {
      for (let offset = 1; offset <= filteredCards.length; offset += 1) {
        const nextIndex = (startIndex + offset) % filteredCards.length;
        if (!reviewed.has(filteredCards[nextIndex].fileName)) {
          selectCard(filteredCards[nextIndex].fileName);
          return;
        }
      }
    }

    const nextIndex = (startIndex + delta + filteredCards.length) % filteredCards.length;
    selectCard(filteredCards[nextIndex].fileName);
  }

  function updateResource(key, delta) {
    if (!currentCard() || !resourceKeys.includes(key)) return;
    const resources = currentResources();
    const next = clampCount(Number(resources[key] || 0) + delta);
    if (next > 0) resources[key] = next;
    else delete resources[key];
    reviewed.add(selectedFileName);
    persist();
    render();
  }

  function setReviewed(value) {
    if (!currentCard()) return;
    if (value) reviewed.add(selectedFileName);
    else reviewed.delete(selectedFileName);
    persist();
    render();
  }

  function clearCurrent() {
    if (!currentCard()) return;
    labels[selectedFileName] = {};
    reviewed.delete(selectedFileName);
    persist();
    render();
  }

  function buildApostleData() {
    const data = Object.fromEntries(manifest.apostles.map((apostle) => [apostle.id, {}]));
    cards.forEach((card) => {
      if (!Object.prototype.hasOwnProperty.call(labels, card.fileName)) return;
      data[card.apostle][card.fileName] = normalizeResources(labels[card.fileName]);
    });
    return data;
  }

  function buildJs(data = buildApostleData()) {
    return `/* C4-C5 BP resource labels. Maintained by tools/bp-resource-labeler/. */
(function () {
  "use strict";

  const target = window.AIBP_BP_RESOURCE_MAP ||= {};
  const data = ${JSON.stringify(data, null, 2)};

  Object.entries(data).forEach(([apostle, cards]) => {
    Object.assign(target[apostle] ||= {}, cards);
  });
})();
`;
  }

  function download(content, fileName, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportJs() {
    download(buildJs(), "bp_resource_map_c4_c5.js", "text/javascript;charset=utf-8");
    showToast("已导出 C4-C5 资源映射 JS。");
  }

  function exportJson() {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      apostles: buildApostleData()
    };
    download(
      `${JSON.stringify(payload, null, 2)}\n`,
      "bp_resource_labels_c4_c5.json",
      "application/json;charset=utf-8"
    );
    showToast("已导出 C4-C5 标注 JSON。");
  }

  function extractJsonObject(source, markers) {
    for (const marker of markers) {
      const markerIndex = source.indexOf(marker);
      if (markerIndex < 0) continue;
      const start = source.indexOf("{", markerIndex + marker.length);
      if (start < 0) continue;
      let depth = 0;
      let quote = "";
      let escaped = false;
      for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === quote) quote = "";
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          continue;
        }
        if (character === "{") depth += 1;
        if (character === "}") {
          depth -= 1;
          if (depth === 0) return JSON.parse(source.slice(start, index + 1));
        }
      }
    }
    throw new Error("没有找到可导入的资源映射对象。");
  }

  function importedApostleData(text, fileName) {
    let parsed;
    if (fileName.toLowerCase().endsWith(".json")) {
      parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
    } else {
      parsed = extractJsonObject(text, [
        "const data =",
        "window.AIBP_BP_RESOURCE_MAP ="
      ]);
    }
    return parsed.apostles || parsed.data || parsed;
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const imported = importedApostleData(await file.text(), file.name);
      let importedCount = 0;
      cards.forEach((card) => {
        const apostleMap = imported?.[card.apostle];
        if (!apostleMap || !Object.prototype.hasOwnProperty.call(apostleMap, card.fileName)) return;
        labels[card.fileName] = normalizeResources(apostleMap[card.fileName]);
        reviewed.add(card.fileName);
        importedCount += 1;
      });
      persist();
      applyFilters();
      showToast(`已导入 ${importedCount} 张卡牌标注。`);
    } catch (error) {
      showToast(`导入失败：${error.message}`, true);
    } finally {
      elements.importInput.value = "";
    }
  }

  async function saveToServer() {
    const button = elements.saveServerButton;
    button.disabled = true;
    try {
      const response = await fetch(SAVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: buildApostleData() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new Error("请先登录后再保存到项目。");
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const map = window.AIBP_BP_RESOURCE_MAP ||= {};
      const data = payload.data || buildApostleData();
      Object.entries(data).forEach(([apostle, apostleCards]) => {
        if (!apostleIds.has(apostle)) return;
        map[apostle] = { ...apostleCards };
      });
      markProjectSaved();
      showToast(`已保存 ${payload.cardCount ?? reviewed.size} 张卡牌标注。`);
    } catch (error) {
      showToast(`保存失败：${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  function showToast(message, error = false) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", error);
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
  }

  function handleResourceClick(event) {
    const addButton = event.target.closest("[data-resource-add]");
    if (addButton) {
      updateResource(addButton.dataset.resourceAdd, 1);
      return;
    }
    const stepButton = event.target.closest("[data-resource-step]");
    if (stepButton) {
      updateResource(
        stepButton.dataset.resourceStep,
        Number(stepButton.dataset.delta || 0)
      );
    }
  }

  function bindEvents() {
    [elements.cycleFilter, elements.apostleFilter, elements.statusFilter]
      .forEach((element) => element.addEventListener("change", applyFilters));
    elements.searchInput.addEventListener("input", applyFilters);
    elements.cardList.addEventListener("click", (event) => {
      const row = event.target.closest("[data-card]");
      if (row) selectCard(row.dataset.card);
    });
    elements.resourceGrid.addEventListener("click", handleResourceClick);
    elements.previousButton.addEventListener("click", () => moveSelection(-1));
    elements.nextButton.addEventListener("click", () => moveSelection(1));
    elements.reviewedInput.addEventListener("change", () =>
      setReviewed(elements.reviewedInput.checked)
    );
    elements.clearButton.addEventListener("click", clearCurrent);
    elements.confirmNextButton.addEventListener("click", () => {
      setReviewed(true);
      moveSelection(1, true);
    });
    elements.saveServerButton.addEventListener("click", saveToServer);
    elements.exportJsButton.addEventListener("click", exportJs);
    elements.exportJsonButton.addEventListener("click", exportJson);
    elements.importInput.addEventListener("change", () =>
      importFile(elements.importInput.files?.[0])
    );
    window.addEventListener("beforeunload", (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  fillApostleFilter();
  loadInitialState();
  bindEvents();
  applyFilters();
})();
