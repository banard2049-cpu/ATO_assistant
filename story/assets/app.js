(function () {
  const data = window.STORYBOOK_DATA;
  const characterData = window.STORY_CHARACTER_DATA || { characters: [] };
  const entityData = buildEntityData(window.STORY_ENTITY_INDEX, characterData);
  const storageKey = "ato-story-memory-v1";

  const bookSelect = document.querySelector("#bookSelect");
  const chapterSelect = document.querySelector("#chapterSelect");
  const encounterSelect = document.querySelector("#encounterSelect");
  const searchInput = document.querySelector("#searchInput");
  const goButton = document.querySelector("#goButton");
  const backButton = document.querySelector("#backButton");
  const rememberButton = document.querySelector("#rememberButton");
  const resultList = document.querySelector("#resultList");
  const memoryList = document.querySelector("#memoryList");
  const chapterSummary = document.querySelector("#chapterSummary");
  const bookMeta = document.querySelector("#bookMeta");
  const sectionLabel = document.querySelector("#sectionLabel");
  const entryTitle = document.querySelector("#entryTitle");
  const entryBadge = document.querySelector("#entryBadge");
  const storyText = document.querySelector("#storyText");
  const linkPanel = document.querySelector("#linkPanel");
  const ttsButton = document.querySelector("#ttsButton");
  const ttsSpeed = document.querySelector("#ttsSpeed");
  const ttsVoice = document.querySelector("#ttsVoice");
  const battleShortcutPanel = document.createElement("div");
  battleShortcutPanel.id = "battleShortcutPanel";
  battleShortcutPanel.className = "battle-shortcuts";
  chapterSummary.after(battleShortcutPanel);

  let activeBook = null;
  let activeEntry = null;
  let historyStack = [];
  let memories = [];
  let voices = [];
  let currentUtterance = null;
  let activeSpeechToken = 0;
  let activeAudio = null;
  let activeAudioUrl = "";
  let isSpeaking = false;
  let statusEntries = [];
  let storyAudioManifest = null;
  let storyAudioManifestPromise = null;
  let storyAudioManifestPack = "";
  let entityOverlay = null;
  const entityLookup = new Map();
  let entityAliases = [];
  const externalAudioCache = new Map();
  const externalAudioCacheMax = 90;
  const ttsStorageKey = "ato-story-tts-config-v1";
  const legacyDefaultTtsPrompts = [
    "用沉稳、清晰、略带史诗感的中文旁白朗读。",
    "用沧桑、带有史诗感的沉稳男声朗读。",
  ];
  const defaultTtsPrompt = "用苍老、低沉、饱经沧桑，带有宏大史诗感的沉稳男声，以稍快语速朗读。";
  const legacyDefaultTtsVoices = ["mimo_default", "Dean"];
  const defaultTtsVoice = "白桦";
  const cloudPresetVoices = ["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"];
  const offlineAudioPacks = [
    { id: "audio", label: "默认离线音色", dir: "audio-packs/audio" },
    { id: "audio-baihua-nosplit-23451", label: "白桦（整段）", dir: "audio-packs/audio-baihua-nosplit-23451" },
  ];

  const defaultTtsConfig = {
    activeEngine: "browser",
    nativeVoice: "",
    rate: 1,
    volume: 1,
    statusCollapsed: false,
    offlineAudioPack: "audio",
    cloud: {
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "",
      builtInModel: "mimo-v2.5-tts",
      voiceCloneModel: "",
      voice: defaultTtsVoice,
      voiceCloneDataUrl: "",
      userMessage: defaultTtsPrompt,
      audioFormat: "mp3",
      timeout: 120000,
    },
    local: {
      baseUrl: "",
      apiKey: "",
      model: "",
      voice: "",
      userMessage: "",
      timeout: 60000,
    },
  };
  let ttsConfig = loadTtsConfig();
  const ttsUi = buildTtsUi();

  const moduleNames = [
    { test: /^main$/, label: "主线剧情" },
    { test: /^hub-/, label: "冒险中枢" },
    { test: /mnemos/, label: "回忆突破" },
    { test: /inward-odyssey/, label: "内蕴奥德赛" },
    { test: /dreams-of-pharos/, label: "法洛斯之梦" },
    { test: /special-event/, label: "特殊事件" },
    { test: /rr-adventures/, label: "R&R 冒险" },
    { test: /ten-thousand/, label: "一万个日夜" },
    { test: /battle/, label: "战斗模块" },
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildEntityData(indexData, fallbackCharacterData) {
    if (indexData && Array.isArray(indexData.entities)) return indexData;
    const characters = Array.isArray(fallbackCharacterData?.characters) ? fallbackCharacterData.characters : [];
    return {
      generatedAt: fallbackCharacterData?.generatedAt || "",
      generator: fallbackCharacterData?.generator || "",
      entityCount: characters.length,
      categoryCounts: { 人物: characters.length },
      entities: characters.map((character) => ({
        ...character,
        category: "人物",
        intro: character.bioNonSpoiler || character.bio || "",
        story: character.bioSpoiler || "",
        entries: character.storyEntries || character.storyPreview || [],
      })),
    };
  }

  function initEntities() {
    entityLookup.clear();
    const aliasRecords = [];
    (entityData.entities || []).forEach((entity) => {
      if (!entity || !entity.id) return;
      const aliases = entityMatchAliases(entity);
      aliases.forEach((alias) => {
        const key = alias.toLowerCase();
        if (!entityLookup.has(key)) entityLookup.set(key, entity);
        aliasRecords.push({ alias, entity });
      });
    });
    entityAliases = aliasRecords
      .filter((item, index, list) => {
        const key = item.alias.toLowerCase();
        return list.findIndex((other) => other.alias.toLowerCase() === key) === index;
      })
      .sort((a, b) => b.alias.length - a.alias.length);
  }

  function entityMatchAliases(entity) {
    const source = Array.isArray(entity.matchAliases)
      ? entity.matchAliases
      : [entity.name, entity.englishName, ...(entity.aliases || [])];
    return source
      .map((alias) => String(alias || "").trim())
      .filter(isMeaningfulEntityAlias);
  }

  function isMeaningfulEntityAlias(alias) {
    const value = String(alias || "").trim();
    if (!value) return false;
    if (/^[A-Z0-9]{1,4}$/.test(value)) return false;
    if (/^[A-Za-z]{1,2}$/.test(value)) return false;
    if (/^[\u3400-\u9fff]$/.test(value)) return false;
    if (value.length > 32) return false;
    return true;
  }

  function annotateEntitiesInEscapedHtml(html) {
    if (!entityAliases.length || !html) return html;
    const pattern = new RegExp(entityAliases.map((item) => escapeRegExp(escapeHtml(item.alias))).join("|"), "gi");
    return html.replace(pattern, (match, offset, source) => {
      const before = source.slice(Math.max(0, offset - 80), offset);
      const after = source.slice(offset, offset + match.length + 80);
      if (/<[^>]*$/.test(before) && !/^[^<]*>/.test(after.slice(match.length))) return match;
      if (/class="[^"]*$/.test(before) || /data-[a-z-]+="[^"]*$/i.test(before) || /href="[^"]*$/i.test(before)) return match;
      const prevChar = source[offset - 1] || "";
      const nextChar = source[offset + match.length] || "";
      if (/^[A-Za-z]/.test(match) && (/[A-Za-z]/.test(prevChar) || /[A-Za-z]/.test(nextChar))) return match;
      if (/[\u3400-\u9fff]/.test(match) && /[们的]/.test(nextChar)) return match;
      const entity = entityLookup.get(match.toLowerCase());
      if (!entity) return match;
      return `<button class="character-link entity-link" type="button" data-entity-id="${escapeAttribute(entity.id)}">${match}</button>`;
    });
  }

  function normalizeQuery(value) {
    return value.trim().toLowerCase();
  }

  function currentBook() {
    return data.books.find((book) => book.id === bookSelect.value) || data.books[0];
  }

  function selectedChapterKey() {
    return chapterSelect.value || "all";
  }

  function selectedEncounterKey() {
    return encounterSelect.value || "all";
  }

  function chapterDisplayName(chapter) {
    const found = moduleNames.find((item) => item.test.test(chapter.key));
    if (!found) return chapter.title;
    if (chapter.key.startsWith("hub-")) {
      return `${found.label} · ${chapter.title.replace(/^Hub\s+/i, "")}`;
    }
    return `${found.label} · ${chapter.title}`;
  }

  function currentChapterEntries(book = currentBook()) {
    const key = selectedChapterKey();
    if (key === "all") return book.entries;
    return book.entries.filter((entry) => entry.chapterKey === key);
  }

  function currentScopedEntries(book = currentBook()) {
    const encounterKey = selectedEncounterKey();
    const entries = currentChapterEntries(book);
    if (encounterKey === "all") return entries;
    return entries.filter((entry) => entry.encounterKey === encounterKey);
  }

  function normalizeDeepLinkValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[()?:!,.，。！？：；、]/g, "")
      .replace(/-+/g, "-");
  }

  function resolveBookId(value) {
    const normalized = normalizeDeepLinkValue(value);
    const found = data.books.find((book) => {
      return normalizeDeepLinkValue(book.id) === normalized || normalizeDeepLinkValue(book.title) === normalized;
    });
    return found ? found.id : "";
  }

  function resolveChapterKey(book, value) {
    const normalized = normalizeDeepLinkValue(value);
    if (!normalized || normalized === "all") return "";
    const aliases = {
      "main-story": "main",
      "main": "main",
      "story": "main",
      "主线": "main",
      "主线故事": "main",
      "hub": "hub-",
      "adventure-hub": "hub-",
      "adventure": "hub-",
      "冒险": "hub-",
      "冒险中枢": "hub-",
      "中枢": "hub-",
      "rr": "rr-adventures",
      "r-r": "rr-adventures",
      "r-and-r": "rr-adventures",
      "r&r": "rr-adventures",
      "休整": "rr-adventures",
      "rr冒险": "rr-adventures",
      "special": "special-events",
      "special-event": "special-events",
      "special-events": "special-events",
      "特殊": "special-events",
      "特殊事件": "special-events",
      "battle": "battle",
      "战斗": "battle",
    };
    const alias = aliases[normalized];
    if (alias) {
      const foundByAlias = book.chapters.find((chapter) => {
        return alias.endsWith("-") ? chapter.key.startsWith(alias) : chapter.key === alias;
      });
      if (foundByAlias) return foundByAlias.key;
    }
    const found = book.chapters.find((chapter) => {
      const key = normalizeDeepLinkValue(chapter.key);
      const title = normalizeDeepLinkValue(chapter.title);
      return key === normalized || title === normalized || key.includes(normalized) || title.includes(normalized);
    });
    return found ? found.key : "";
  }

  function resolveEncounterKey(book, value) {
    const normalized = normalizeDeepLinkValue(value);
    if (!normalized || normalized === "all") return "";
    const entries = currentChapterEntries(book);
    const found = entries.find((entry) => {
      const key = normalizeDeepLinkValue(entry.encounterKey);
      const title = normalizeDeepLinkValue(entry.encounter);
      const id = normalizeDeepLinkValue(entry.id);
      return key === normalized || title === normalized || id === normalized
        || key.includes(normalized) || title.includes(normalized) || id.includes(normalized);
    });
    return found ? found.encounterKey : "";
  }

  function readDeepLinkTarget(params) {
    return {
      bookId: resolveBookId(params.get("book") || window.location.hash.replace(/^#/, "")),
      chapterKey: params.get("chapter") || params.get("module") || "",
      encounterKey: params.get("encounter") || params.get("battle") || "",
      entryId: params.get("entry") || params.get("id") || "",
      entryKey: params.get("key") || "",
      query: params.get("q") || params.get("search") || "",
    };
  }

  function entryFromDeepLink(book, target) {
    if (target.entryKey) {
      const byKey = book.entries.find((entry) => entry.key === target.entryKey);
      if (byKey) return byKey;
    }

    if (target.entryId) {
      return preferredEntry(book, target.entryId, {
        bookId: book.id,
        chapterKey: selectedChapterKey(),
        encounterKey: selectedEncounterKey() === "all" ? "" : selectedEncounterKey(),
      });
    }

    const scoped = currentScopedEntries(book);
    return scoped[0] || null;
  }

  function entriesById(book, id) {
    const exact = book.entries.filter((entry) => entry.id === id);
    if (exact.length) return exact;
    if (/^M\d+$/i.test(id)) {
      const number = id.slice(1).replace(/^0+/, "") || "0";
      const normalized = `M${number.padStart(3, "0")}`;
      return book.entries.filter((entry) => entry.id === normalized);
    }
    return [];
  }

  function preferredEntry(book, id, options = {}) {
    const matches = entriesById(book, id);
    if (!matches.length) return null;

    if (options.bookId && options.bookId !== book.id) return null;

    if (options.chapterHint === "main") {
      const mainMatch = matches.find((entry) => entry.chapterKey === "main");
      if (mainMatch) return mainMatch;
    }

    if (options.entryKey) {
      const exact = matches.find((entry) => entry.key === options.entryKey);
      if (exact) return exact;
    }

    if (options.chapterKey) {
      const sameChapterAndEncounter = matches.find((entry) => {
        return entry.chapterKey === options.chapterKey && (!options.encounterKey || entry.encounterKey === options.encounterKey);
      });
      if (sameChapterAndEncounter) return sameChapterAndEncounter;
    }

    if (activeEntry) {
      const sameChapter = matches.find((entry) => entry.chapterKey === activeEntry.chapterKey);
      if (sameChapter) {
        if (activeEntry.encounterKey) {
          const sameEncounter = matches.find((entry) => {
            return entry.chapterKey === activeEntry.chapterKey && entry.encounterKey === activeEntry.encounterKey;
          });
          if (sameEncounter) return sameEncounter;
        }
        return sameChapter;
      }
    }

    const selectedChapter = selectedChapterKey();
    if (selectedChapter !== "all") {
      const inSelected = matches.find((entry) => entry.chapterKey === selectedChapter);
      if (inSelected) return inSelected;
    }

    return matches[0];
  }

  function sortForCurrentContext(entries) {
    const chapterKey = activeEntry ? activeEntry.chapterKey : selectedChapterKey();
    const encounterKey = activeEntry ? activeEntry.encounterKey : selectedEncounterKey();
    return entries.slice().sort((a, b) => {
      const aChapter = a.chapterKey === chapterKey ? 0 : 1;
      const bChapter = b.chapterKey === chapterKey ? 0 : 1;
      const aEncounter = encounterKey !== "all" && a.encounterKey === encounterKey ? 0 : 1;
      const bEncounter = encounterKey !== "all" && b.encounterKey === encounterKey ? 0 : 1;
      return aChapter - bChapter || aEncounter - bEncounter || a.order - b.order;
    });
  }

  function searchEntries(query) {
    const book = currentBook();
    const scopedEntries = currentScopedEntries(book);
    const q = normalizeQuery(query);

    if (!q) return scopedEntries.slice(0, 80);

    if (/^\d{1,4}$/.test(q)) {
      const id = q.padStart(4, "0");
      const exactInScope = scopedEntries.filter((entry) => entry.id === id);
      if (exactInScope.length) return sortForCurrentContext(exactInScope);
      return sortForCurrentContext(book.entries.filter((entry) => entry.id === id));
    }

    if (/^M\d+$/i.test(q)) {
      return sortForCurrentContext(entriesById(book, q.toUpperCase()));
    }

    return scopedEntries
      .filter((entry) => {
        const haystack = `${entry.id} ${entry.title} ${entry.chapter} ${entry.encounter || ""} ${entry.section || ""} ${entry.text}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 100);
  }

  function renderResults(entries) {
    resultList.innerHTML = "";
    if (!entries.length) {
      resultList.innerHTML = '<div class="empty">没有找到匹配段落</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `result-item${activeEntry && entry.key === activeEntry.key ? " active" : ""}`;
      button.innerHTML = `
        <span class="result-id">${escapeHtml(entry.id)} · ${escapeHtml(entry.title || "故事段落")}</span>
        <span class="result-section">${escapeHtml(entry.encounter ? `${entry.chapter} / ${entry.encounter}` : entry.chapter || "未命名模块")}</span>
        <span class="result-preview">${escapeHtml(entry.text.replace(/\s+/g, " ").slice(0, 72))}</span>
      `;
      button.addEventListener("click", () => showEntry(entry, true));
      fragment.appendChild(button);
    });
    resultList.appendChild(fragment);
  }

  function linkify(text, book) {
    const knownIds = new Set(book.entries.map((entry) => entry.id));
    const pattern = /((?:主线故事|Main Story)[^0-9A-Z]{0,20})?(M\d{3,4}|\d{4})/g;
    let html = "";
    let lastIndex = 0;
    let match;

    function resolveId(raw) {
      if (knownIds.has(raw)) return raw;
      if (/^M\d+$/i.test(raw)) {
        const number = raw.slice(1).replace(/^0+/, "") || "0";
        const normalized = `M${number.padStart(3, "0")}`;
        if (knownIds.has(normalized)) return normalized;
      }
      return null;
    }

    while ((match = pattern.exec(text)) !== null) {
      const prefix = match[1] || "";
      const rawId = match[2];
      const resolved = resolveId(rawId);
      const idStart = match.index + match[0].indexOf(rawId);

      html += annotateEntitiesInEscapedHtml(escapeHtml(text.slice(lastIndex, idStart)));
      if (resolved) {
        const hint = prefix ? ' data-chapter-hint="main"' : "";
        html += `<button class="jump-link" type="button" data-id="${resolved}"${hint}>${escapeHtml(rawId)}</button>`;
      } else {
        html += annotateEntitiesInEscapedHtml(escapeHtml(rawId));
      }
      lastIndex = pattern.lastIndex;
    }

    html += annotateEntitiesInEscapedHtml(escapeHtml(text.slice(lastIndex)));
    return html;
  }

  function populateChapters(book, preferredKey) {
    chapterSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = `全部模块 (${book.entryCount})`;
    chapterSelect.appendChild(allOption);

    book.chapters.forEach((chapter) => {
      const count = book.entries.filter((entry) => entry.chapterKey === chapter.key).length;
      if (!count) return;
      const option = document.createElement("option");
      option.value = chapter.key;
      option.textContent = `${chapterDisplayName(chapter)} (${count})`;
      chapterSelect.appendChild(option);
    });

    chapterSelect.value = preferredKey || (book.chapters.find((chapter) => chapter.key === "main") ? "main" : "all");
    populateEncounters(book);
    updateChapterSummary();
  }

  function populateEncounters(book, preferredKey) {
    encounterSelect.innerHTML = "";
    const chapterEntries = currentChapterEntries(book);
    const encounters = [];
    const seen = new Set();

    chapterEntries.forEach((entry) => {
      if (!entry.encounterKey || seen.has(entry.encounterKey)) return;
      seen.add(entry.encounterKey);
      encounters.push({
        key: entry.encounterKey,
        title: entry.encounter || entry.title,
        order: entry.order,
      });
    });

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "不按入口层筛选";
    encounterSelect.appendChild(allOption);

    encounters
      .sort((a, b) => a.order - b.order)
      .forEach((encounter) => {
        const count = chapterEntries.filter((entry) => entry.encounterKey === encounter.key).length;
        const option = document.createElement("option");
        option.value = encounter.key;
        option.textContent = `${encounter.title} (${count})`;
        encounterSelect.appendChild(option);
      });

    encounterSelect.disabled = encounters.length === 0;
    encounterSelect.value = preferredKey || "all";
  }

  function renderBattleShortcuts(book = currentBook()) {
    battleShortcutPanel.innerHTML = "";
    battleShortcutPanel.hidden = selectedChapterKey() !== "battle";
    if (battleShortcutPanel.hidden) return;

    const seen = new Set();
    const encounters = [];
    book.entries
      .filter((entry) => entry.chapterKey === "battle" && entry.encounterKey)
      .forEach((entry) => {
        if (seen.has(entry.encounterKey)) return;
        seen.add(entry.encounterKey);
        encounters.push({
          key: entry.encounterKey,
          title: entry.encounter || entry.title || entry.encounterKey,
          order: entry.order,
        });
      });

    if (!encounters.length) return;

    const title = document.createElement("div");
    title.className = "battle-shortcuts-title";
    title.textContent = "战斗入口";
    battleShortcutPanel.appendChild(title);

    encounters
      .sort((a, b) => a.order - b.order)
      .forEach((encounter) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `battle-shortcut${selectedEncounterKey() === encounter.key ? " active" : ""}`;
        button.textContent = encounter.title;
        button.addEventListener("click", () => {
          encounterSelect.value = encounter.key;
          searchInput.value = "";
          updateChapterSummary();
          showFirstInScope();
        });
        battleShortcutPanel.appendChild(button);
      });
  }

  function updateChapterSummary() {
    const book = currentBook();
    const count = currentScopedEntries(book).length;
    const chapterKey = selectedChapterKey();
    renderBattleShortcuts(book);
    if (chapterKey === "all") {
      chapterSummary.textContent = `全部模块 · ${count} 个段落`;
      return;
    }

    const chapter = book.chapters.find((item) => item.key === chapterKey);
    const encounterText = selectedEncounterKey() === "all"
      ? ""
      : ` / ${encounterSelect.options[encounterSelect.selectedIndex]?.textContent || selectedEncounterKey()}`;

    chapterSummary.textContent = `${chapter ? chapterDisplayName(chapter) : chapterKey}${encounterText} · ${count} 个段落`;
  }

  function renderLinkPanel(entry) {
    linkPanel.innerHTML = "";
    const links = Array.isArray(entry.links) ? entry.links : [];
    if (!links.length) return;

    links.forEach((id) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "link-chip";
      button.textContent = `跳转 ${id}`;
      ["pointerenter", "pointerdown", "focus"].forEach((eventName) => {
        button.addEventListener(eventName, () => prewarmJumpTarget(id, {
          chapterKey: entry.chapterKey,
          encounterKey: entry.encounterKey,
        }));
      });
      button.addEventListener("click", () => jumpToId(id));
      linkPanel.appendChild(button);
    });
  }

  function loadTtsConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(ttsStorageKey) || "{}");
      const config = {
        ...defaultTtsConfig,
        ...saved,
        cloud: { ...defaultTtsConfig.cloud, ...(saved.cloud || {}) },
        local: { ...defaultTtsConfig.local, ...(saved.local || {}) },
      };
      if (!config.cloud.baseUrl || /api\.mimo-v2\.com/i.test(config.cloud.baseUrl) || /127\.0\.0\.1:8788|localhost:8788/i.test(config.cloud.baseUrl)) {
        config.cloud.baseUrl = defaultTtsConfig.cloud.baseUrl;
      }
      if (!config.cloud.builtInModel) config.cloud.builtInModel = defaultTtsConfig.cloud.builtInModel;
      if (!config.cloud.voice || legacyDefaultTtsVoices.includes(config.cloud.voice)) {
        config.cloud.voice = defaultTtsConfig.cloud.voice;
      }
      if (!config.cloud.userMessage || legacyDefaultTtsPrompts.includes(config.cloud.userMessage)) {
        config.cloud.userMessage = defaultTtsConfig.cloud.userMessage;
      }
      if (!config.cloud.audioFormat || config.cloud.audioFormat === "wav") config.cloud.audioFormat = defaultTtsConfig.cloud.audioFormat;
      if (!offlineAudioPacks.some((pack) => pack.id === config.offlineAudioPack)) {
        config.offlineAudioPack = defaultTtsConfig.offlineAudioPack;
      }
      return config;
    } catch (error) {
      return JSON.parse(JSON.stringify(defaultTtsConfig));
    }
  }

  function saveTtsConfig() {
    localStorage.setItem(ttsStorageKey, JSON.stringify(ttsConfig));
  }

  function buildTtsUi() {
    const engineSelect = document.createElement("select");
    engineSelect.id = "ttsEngine";
    engineSelect.className = "tts-select";
    engineSelect.innerHTML = `
      <option value="browser">浏览器原生</option>
      <option value="offline">离线保存音频</option>
      <option value="local">本地部署</option>
      <option value="cloud">云端 API</option>
    `;

    const configButton = document.createElement("button");
    configButton.id = "ttsConfigButton";
    configButton.type = "button";
    configButton.className = "tts-config-btn";
    configButton.textContent = "引擎配置";

    const statusBox = document.createElement("section");
    statusBox.id = "ttsStatusBox";
    statusBox.className = "tts-status";
    statusBox.innerHTML = `
      <div class="tts-status-head">
        <strong id="ttsStatusTitle">TTS 状态</strong>
        <div class="tts-status-actions">
          <button id="ttsStatusToggle" type="button">收起</button>
        </div>
      </div>
      <div id="ttsStatusBody" class="tts-status-body"></div>
    `;
    statusBox.querySelector(".tts-status-actions").prepend(configButton);

    const overlay = document.createElement("div");
    overlay.id = "ttsConfigOverlay";
    overlay.className = "tts-overlay";
    overlay.hidden = true;

    const cloneInput = document.createElement("input");
    cloneInput.type = "file";
    cloneInput.accept = "audio/*";
    cloneInput.hidden = true;

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json,.json";
    importInput.hidden = true;

    ttsVoice.insertAdjacentElement("afterend", engineSelect);
    document.body.append(statusBox, overlay, cloneInput, importInput);

    return { engineSelect, configButton, statusBox, overlay, cloneInput, importInput };
  }

  function getEngineStatusLabel() {
    if (ttsConfig.activeEngine === "browser") return "浏览器原生";
    if (ttsConfig.activeEngine === "offline") {
      const pack = offlineAudioPacks.find((item) => item.id === ttsConfig.offlineAudioPack) || offlineAudioPacks[0];
      return `离线保存音频 [${pack.label}]`;
    }
    if (ttsConfig.activeEngine === "local") return `本地部署 [${ttsConfig.local.model || "未配置"}]`;
    if (ttsConfig.cloud.voiceCloneDataUrl) return "云端 API [已导入克隆音色]";
    return `云端 API [${ttsConfig.cloud.voice || "动态音色"}]`;
  }

  function renderTtsStatus() {
    const title = document.querySelector("#ttsStatusTitle");
    const toggle = document.querySelector("#ttsStatusToggle");
    const body = document.querySelector("#ttsStatusBody");
    if (!title || !toggle || !body) return;

    title.textContent = `TTS 状态 | ${getEngineStatusLabel()}`;
    toggle.textContent = ttsConfig.statusCollapsed ? "展开" : "收起";
    body.hidden = ttsConfig.statusCollapsed;
    if (ttsConfig.statusCollapsed) return;

    body.innerHTML = statusEntries.length
      ? statusEntries.map((item) => `
          <div class="tts-status-row ${item.level}">
            <span>${escapeHtml(item.time)}</span>
            <p>${escapeHtml(item.message)}</p>
          </div>
        `).join("")
      : '<div class="tts-status-empty">暂无状态。外部引擎请求、报错和回退会显示在这里。</div>';
  }

  function pushTtsStatus(message, level = "info") {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const prev = statusEntries[0];
    if (prev && prev.level === level && prev.message === message) {
      prev.time = time;
    } else {
      statusEntries.unshift({ time, level, message });
      if (statusEntries.length > 8) statusEntries.length = 8;
    }
    renderTtsStatus();
  }

  function normalizeBaseUrl(url) {
    const trimmed = (url || "").trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
  }

  function decodeBase64Audio(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function clearActiveAudio(audio = activeAudio, audioUrl = activeAudioUrl) {
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      if (activeAudio === audio) activeAudio = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      if (activeAudioUrl === audioUrl) activeAudioUrl = "";
    }
  }

  function manifestAudioBaseUrl() {
    const pack = offlineAudioPacks.find((item) => item.id === ttsConfig.offlineAudioPack) || offlineAudioPacks[0];
    return new URL(`./${pack.dir}/`, window.location.href);
  }

  function loadManifestScript(pack, force = false) {
    return new Promise((resolve) => {
      const previous = document.querySelector("#storyAudioManifestScript");
      if (previous) previous.remove();
      window.STORY_AUDIO_MANIFEST = null;

      const script = document.createElement("script");
      script.id = "storyAudioManifestScript";
      script.src = `./${pack.dir}/manifest.js${force ? `?t=${Date.now()}` : ""}`;
      script.onload = () => resolve(window.STORY_AUDIO_MANIFEST || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  async function ensureStoryAudioManifest(force = false) {
    const pack = offlineAudioPacks.find((item) => item.id === ttsConfig.offlineAudioPack) || offlineAudioPacks[0];
    const packId = pack.id;
    if (storyAudioManifestPack && storyAudioManifestPack !== packId) {
      storyAudioManifest = null;
      storyAudioManifestPromise = null;
    }
    if (force) {
      storyAudioManifest = null;
      storyAudioManifestPromise = null;
    }
    if (!force && packId === "audio" && window.STORY_AUDIO_MANIFEST && window.STORY_AUDIO_MANIFEST.entries) {
      storyAudioManifest = window.STORY_AUDIO_MANIFEST;
      storyAudioManifestPack = packId;
      return Promise.resolve(storyAudioManifest);
    }
    if (storyAudioManifest || storyAudioManifestPromise) return storyAudioManifestPromise;
    storyAudioManifestPromise = loadManifestScript(pack, force)
      .then((manifest) => {
        storyAudioManifest = manifest && manifest.entries ? manifest : null;
        storyAudioManifestPack = storyAudioManifest ? packId : "";
        if (storyAudioManifest) {
          pushTtsStatus(`Loaded offline audio [${pack.label}]: ${Object.keys(storyAudioManifest.entries).length} entries`, "success");
        }
        return storyAudioManifest;
      })
      .catch(() => {
        storyAudioManifestPromise = null;
        return null;
      });
    return storyAudioManifestPromise;
  }

  function cachedAudioForEntry(entry) {
    const entries = storyAudioManifest?.entries || {};
    let record = entries[entry?.key || ""];
    if (!record && entry) {
      const bookId = entryBookId(entry);
      const encounterKey = entry.encounterKey || "";
      record = Object.values(entries).find((item) => {
        return item.bookId === bookId
          && item.id === entry.id
          && item.chapterKey === entry.chapterKey
          && (item.encounterKey || "") === encounterKey;
      });
    }
    if (!record || !Array.isArray(record.chunks) || !record.chunks.length) return null;
    return record;
  }

  function hasCachedEntryAudio(entry) {
    return Boolean(cachedAudioForEntry(entry));
  }

  function currentTtsRate() {
    const rate = Number(ttsConfig.rate || ttsSpeed.value || 1);
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  }

  function applyAudioPlaybackRate(audio) {
    if (!audio || typeof audio.playbackRate !== "number") return;
    audio.playbackRate = currentTtsRate();
  }

  function playAudioFile(src, token, keepActive = false) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(src);
      applyAudioPlaybackRate(audio);
      activeAudio = audio;
      activeAudioUrl = "";
      currentUtterance = audio;

      audio.onended = () => {
        if (activeAudio === audio) activeAudio = null;
        finishSpeech(token, keepActive);
        resolve();
      };
      audio.onerror = () => {
        if (activeAudio === audio) activeAudio = null;
        reject(new Error("cached audio playback failed"));
      };
      audio.play().catch(reject);
    });
  }

  async function speakCachedEntryAudio(entry, token) {
    const record = cachedAudioForEntry(entry);
    if (!record) return false;
    const baseUrl = manifestAudioBaseUrl();
    const chunks = record.chunks
      .map((chunk) => chunk.path || chunk.src || "")
      .filter(Boolean);
    if (!chunks.length) return false;

    isSpeaking = true;
    ttsButton.textContent = "停止";
    pushTtsStatus(`Playing offline audio ${chunks.length} chunks`, "success");
    for (let index = 0; index < chunks.length; index += 1) {
      if (token !== activeSpeechToken) return true;
      const src = new URL(chunks[index], baseUrl).href;
      await playAudioFile(src, token, index < chunks.length - 1);
    }
    finishSpeech(token);
    return true;
  }

  function stopActiveAudio() {
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.removeAttribute("src");
        activeAudio.load();
      }
    } finally {
      clearActiveAudio();
    }
  }

  function stopSpeech() {
    activeSpeechToken += 1;
    stopActiveAudio();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    currentUtterance = null;
    isSpeaking = false;
    ttsButton.textContent = "朗读";
  }

  const localBattleImages = [
    {
      test: /hypertime-oracle-battle/i,
      images: ["./images/battles/c3/超时光先知战斗1.jpg", "./images/battles/c3/超时光先知战斗2.jpg"],
    },
    {
      test: /icarian-harpy-battle/i,
      images: ["./images/battles/c3/伊卡洛斯哈尔皮战斗.jpg"],
    },
    {
      test: /endure-the-sun-battle/i,
      images: ["./images/battles/c3/忍受烈日战斗.jpg"],
    },
    {
      test: /race-the-sun-battle/i,
      images: ["./images/battles/c3/与日竞赛战斗.jpg"],
    },
    {
      test: /burden-hardest-to-bear-battle/i,
      images: ["./images/battles/c3/最难承受的重担战斗.jpg"],
    },
  ];

  function localBattleImageList(entry) {
    const haystack = `${entry.id || ""} ${entry.key || ""}`.toLowerCase();
    const match = localBattleImages.find((item) => item.test.test(haystack));
    return match ? match.images : [];
  }

  function prepareSpeechText(text) {
    return text
      .replace(/（[^（）]*）/g, " ")
      .replace(/\([^()]*\)/g, " ")
      .replace(/【[^【】]*】/g, " ")
      .replace(/\[[^\[\]]*\]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
      .trim();
  }

  function renderBattleImages(entry) {
    const aibpLink = battleAibpLink(entry);
    const imageList = Array.isArray(entry.imageList) && entry.imageList.length
      ? entry.imageList
      : localBattleImageList(entry);
    if (imageList.length) {
      const images = imageList.map((src, index) => {
        return `<img class="battle-page" src="${escapeHtml(src)}" alt="${escapeHtml(entry.title)} ${index + 1}" onerror="this.remove()">`;
      }).join("");
      return `${images}${aibpLink}`;
    }

    const basePath = entry.images || entry.image;
    if (!basePath) return aibpLink;

    if (entry.image && !entry.images) {
      return `<img class="battle-image" src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)}">${aibpLink}`;
    }

    const pages = Array.from({ length: 12 }, (_, index) => {
      const page = index + 1;
      const src = `${basePath}-${page}.png`;
      return `<img class="battle-page" src="${escapeHtml(src)}" alt="${escapeHtml(entry.title)} ${page}" onerror="this.remove()">`;
    }).join("");

    return `${pages}${aibpLink}`;
  }

  function normalizeTableCell(text) {
    return String(text || "").trim().replace(/\s+/g, " ");
  }

  function isTableCellCandidate(text, maxLength = 180) {
    const value = normalizeTableCell(text);
    if (!value) return false;
    if (value.length > maxLength) return false;
    return true;
  }

  function parseBattleTable(blocks, startIndex) {
    const headerLeft = normalizeTableCell(blocks[startIndex]);
    const headerRight = normalizeTableCell(blocks[startIndex + 1]);
    let rowPattern = null;

    if (headerLeft === "框数" && headerRight === "内容") {
      rowPattern = (left) => /^(?:[1-4]|3\+|5\+)$/u.test(left);
    } else if (headerLeft === "损伤" && headerRight === "所需资源") {
      rowPattern = (left) => /^(?:[5-9]|1[01])$/u.test(left);
    } else {
      return null;
    }

    const rows = [];
    let index = startIndex + 2;
    while (index + 1 < blocks.length) {
      const left = normalizeTableCell(blocks[index]);
      const right = normalizeTableCell(blocks[index + 1]);
      if (!rowPattern(left) || !isTableCellCandidate(right, 180)) break;
      rows.push([left, right]);
      index += 2;
    }

    if (rows.length < 3) return null;
    return {
      headers: [headerLeft, headerRight],
      rows,
      nextIndex: index,
    };
  }

  function renderBattleTable(table) {
    const head = table.headers.map((cell) => `<th>${linkify(cell, currentBook())}</th>`).join("");
    const body = table.rows.map((row) => {
      return `<tr><td>${linkify(row[0], currentBook())}</td><td>${linkify(row[1], currentBook())}</td></tr>`;
    }).join("");

    return `<div class="battle-table-wrap"><table class="battle-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function isSectionSubheading(text, entry) {
    const value = text.trim();
    if (!value || value === entry.title || /^\d+\s*:\s*\S/.test(value)) return false;
    if (/^(所需板块|介绍|战斗设置|特殊设置|胜利条件|特殊奖励|后果|奖励和惩罚|奖励与惩罚|追猎者战斗)/.test(value)) return true;
    if (/^(胜利|失败|撤退)\s*(?:[（(].*[）)])?[：:]?$/.test(value)) return true;
    return value.length <= 48 && /[：:]$/.test(value);
  }

  function renderSectionedStory(entry, imagesHtml) {
    const blocks = entry.text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const rendered = [];
    let imagesInserted = false;
    let galleryPending = false;

    blocks.forEach((block) => {
      if (block === entry.title) return;
      if (isSectionSubheading(block, entry)) {
        const heading = `<h3 class="battle-subheading">${escapeHtml(block)}</h3>`;
        if (rendered[rendered.length - 1] !== heading) rendered.push(heading);
        galleryPending = /^介绍[：:]?$/.test(block);
      } else {
        rendered.push(`<div class="battle-block">${linkify(block, currentBook())}</div>`);
        if (!imagesInserted && imagesHtml && galleryPending) {
          rendered.push(`<div class="battle-gallery">${imagesHtml}</div>`);
          imagesInserted = true;
          galleryPending = false;
        }
      }
    });

    if (!imagesInserted && imagesHtml) {
      rendered.push(`<div class="battle-gallery">${imagesHtml}</div>`);
    }
    return rendered.join("");
  }

  function renderBattleSectionedStory(entry, imagesHtml) {
    const blocks = entry.text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const rendered = [];
    let imagesInserted = false;
    let galleryPending = false;

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (block === entry.title) continue;
      if (isSectionSubheading(block, entry)) {
        const heading = `<h3 class="battle-subheading">${escapeHtml(block)}</h3>`;
        if (rendered[rendered.length - 1] !== heading) rendered.push(heading);
        galleryPending = /^介绍[：:]?$/.test(block);
        continue;
      }
      const table = parseBattleTable(blocks, index);
      if (table) {
        rendered.push(renderBattleTable(table));
        index = table.nextIndex - 1;
        if (!imagesInserted && imagesHtml && galleryPending) {
          rendered.push(`<div class="battle-gallery">${imagesHtml}</div>`);
          imagesInserted = true;
          galleryPending = false;
        }
        continue;
      }
      rendered.push(`<div class="battle-block">${linkify(block, currentBook())}</div>`);
      if (!imagesInserted && imagesHtml && galleryPending) {
        rendered.push(`<div class="battle-gallery">${imagesHtml}</div>`);
        imagesInserted = true;
        galleryPending = false;
      }
    }

    if (!imagesInserted && imagesHtml) {
      rendered.push(`<div class="battle-gallery">${imagesHtml}</div>`);
    }
    return rendered.join("");
  }

  function renderHtmlStory(entry, imagesHtml) {
    const gallery = imagesHtml ? `<div class="battle-gallery">${imagesHtml}</div>` : "";
    return `<div class="story-html">${entry.html}</div>${gallery}`;
  }

  function renderEntityNotes(entity) {
    const notes = Array.isArray(entity.notes) ? entity.notes.filter(Boolean) : [];
    if (!notes.length) return "";
    return `<ul class="character-notes">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
  }

  function renderEntityStoryPreview(entity) {
    const entries = Array.isArray(entity.entries)
      ? entity.entries
      : Array.isArray(entity.storyEntries)
        ? entity.storyEntries
        : Array.isArray(entity.storyPreview)
        ? entity.storyPreview
        : [];
    if (!entries.length) return "";
    const groups = [];
    entries.forEach((entry) => {
      const book = String(entry.book || "").toLowerCase() || "unknown";
      let group = groups.find((item) => item.book === book);
      if (!group) {
        group = { book, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    });
    return `
      <section class="character-story-preview">
        <h4>相关段落（${entries.length}）</h4>
        <div class="character-story-groups">
          ${groups.map((group) => `
            <section class="character-story-group">
              <h5>${escapeHtml(group.book.toUpperCase())}（${group.entries.length}）</h5>
              <ol>
                ${group.entries.map((entry) => `
                  <li>
                    <strong>${escapeHtml(`${String(entry.book || "").toUpperCase()} ${entry.id || ""}`.trim())}</strong>
                    ${entry.title ? `<span>${escapeHtml(entry.title)}</span>` : ""}
                    ${entry.snippet ? `<p>${escapeHtml(entry.snippet)}</p>` : ""}
                  </li>
                `).join("")}
              </ol>
            </section>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderEntityWikiIntro(entity) {
    const intro = String(entity.wikiIntro || "").trim();
    if (!intro) return "";
    const title = String(entity.wikiTitle || "Wikipedia").trim();
    const url = String(entity.wikiUrl || "").trim();
    const source = url
      ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
      : escapeHtml(title);
    return `
      <section class="character-wiki">
        <h4>神话 / 来源介绍</h4>
        <p>${escapeHtml(intro)}</p>
        <div class="character-wiki-source">来源：${source}</div>
      </section>
    `;
  }

  function renderEntityAliases(aliases) {
    if (!aliases.length) return "";
    return `<div class="character-aliases"><strong>别名</strong>${aliases.map((alias) => `<span>${escapeHtml(alias)}</span>`).join("")}</div>`;
  }

  function ensureEntityOverlay() {
    if (entityOverlay) return entityOverlay;
    entityOverlay = document.createElement("div");
    entityOverlay.id = "entityOverlay";
    entityOverlay.className = "character-overlay entity-overlay";
    entityOverlay.hidden = true;
    document.body.appendChild(entityOverlay);
    entityOverlay.addEventListener("click", (event) => {
      if (event.target === entityOverlay || event.target.closest("[data-entity-close]")) {
        closeEntityBio();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && entityOverlay && !entityOverlay.hidden) closeEntityBio();
    });
    return entityOverlay;
  }

  function closeEntityBio() {
    if (!entityOverlay) return;
    entityOverlay.hidden = true;
    entityOverlay.innerHTML = "";
  }

  function openEntityBio(entityId) {
    const entity = (entityData.entities || []).find((item) => item.id === entityId);
    if (!entity) return;
    const overlay = ensureEntityOverlay();
    const english = entity.englishName ? ` (${escapeHtml(entity.englishName)})` : "";
    const meta = [
      entity.category ? `分类：${entity.category}` : "",
      entity.firstSeen ? `初见：${entity.firstSeen}` : "",
      entity.mentionCount ? `提及：${entity.mentionCount}` : "",
    ].filter(Boolean);
    const aliases = [entity.name, entity.englishName, ...(entity.aliases || [])]
      .map((alias) => String(alias || "").trim())
      .filter(isMeaningfulEntityAlias)
      .filter((alias, index, list) => list.indexOf(alias) === index);
    const introBio = entity.intro || entity.bioNonSpoiler || entity.bio || "还没有填写简介。";
    const storyBio = entity.detail || entity.story || entity.bioSpoiler || "";
    const detailHtml = [
      storyBio && storyBio !== introBio ? `<p class="character-bio">${escapeHtml(storyBio)}</p>` : "",
      renderEntityAliases(aliases),
      renderEntityNotes(entity),
      renderEntityStoryPreview(entity),
    ].filter(Boolean).join("");
    const hasDetail = Boolean(detailHtml);
    overlay.innerHTML = `
      <section class="character-card entity-card" role="dialog" aria-modal="true" aria-label="${escapeAttribute(entity.name)}实体档案">
        <header class="character-head">
          <div>
            <p class="character-kicker">实体档案</p>
            <h3>${escapeHtml(entity.name)}${english}</h3>
          </div>
          <button type="button" data-entity-close>关闭</button>
        </header>
        <div class="character-body">
          ${meta.length ? `<div class="character-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
          <div class="character-bio-tabs">
            <button class="active" type="button" data-character-bio-tab="intro">简介</button>
            ${hasDetail ? `<button type="button" data-character-bio-tab="story" title="包含后续剧情信息">详细介绍（含剧透）</button>` : ""}
          </div>
          <div class="character-tab-panel" data-character-panel="intro">
            <p class="character-bio">${escapeHtml(introBio)}</p>
            ${renderEntityWikiIntro(entity)}
          </div>
          ${hasDetail ? `<div class="character-tab-panel" data-character-panel="story" hidden>${detailHtml}</div>` : ""}
        </div>
      </section>
    `;
    overlay.hidden = false;
    overlay.querySelectorAll("[data-character-bio-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.characterBioTab;
        overlay.querySelectorAll("[data-character-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.characterPanel !== mode;
        });
        overlay.querySelectorAll("[data-character-bio-tab]").forEach((item) => item.classList.toggle("active", item === button));
      });
    });
    const closeButton = overlay.querySelector("[data-entity-close]");
    if (closeButton) closeButton.focus();
  }

  function battleAibpLink(entry) {
    const haystack = `${entry.id || ""} ${entry.title || ""} ${entry.encounter || ""}`.toLowerCase();
    const targets = [
      {
        test: /ambush|伏击/,
        links: [
          { apostle: "HEKATON", label: "百臂巨人 AIBP" },
          { apostle: "LABYRINTHAUROS", label: "迷宫机牛 AIBP" },
        ],
      },
      { test: /hekaton|百臂巨人/, apostle: "HEKATON", label: "百臂巨人 AIBP" },
      { test: /labyrinthauros|迷宫牛|迷宫机牛/, apostle: "LABYRINTHAUROS", label: "迷宫机牛 AIBP" },
      { test: /temenos|there-is-no-maze|没有迷宫|吞域兽/, apostle: "ALPHA_TEMENOS", label: "吞域兽 AIBP" },
      { test: /pursuer|pursuit|追踪|追猎|赫尔墨斯追踪者/, apostle: "HERMESIAN_PURSUER", label: "赫尔墨斯追踪者 AIBP" },
      { test: /chimera|奇美拉/, apostle: "CHIMERA_METASTASIOS", label: "蠕变奇美拉 AIBP" },
      { test: /cyclonus|独眼巨人/, apostle: "CYCLONUS", label: "独眼巨人 AIBP" },
      { test: /hypertime|oracle|超时光|先知|神谕/, apostle: "HYPERTIME_ORACLE", label: "超时光先知 AIBP" },
      { test: /icarian|harpy|伊卡洛斯|哈尔皮|鹰身/, apostle: "ICARIAN_HARPY", label: "伊卡洛斯哈尔皮 AIBP" },
      { test: /endure-the-sun|race-the-sun|sun-descendant|忍受烈日|与日竞赛|坠落太阳/, apostle: "SUN_DESCENDANT", label: "坠落太阳 AIBP" },
      { test: /burden|重担/, apostle: "THE_BURDEN", label: "重担 AIBP" },
      { test: /nietz|cruel|what-are-you|残酷说教|你是什么|这是什么/, apostle: "THE_NIETZSCJEAN", label: "尼采超人 AIBP" },
    ];
    const target = targets.find((item) => item.test.test(haystack));
    if (!target) return "";
    const links = target.links || [target];

    const buttons = links.map((link) => {
      const href = `../aibp/index.html#${encodeURIComponent(link.apostle)}`;
      return `
        <a class="battle-aibp-button" href="${href}" target="_blank" rel="noopener noreferrer">
          打开${escapeHtml(link.label)}
        </a>
      `;
    }).join("");
    return `
      <div class="battle-aibp-action">
        ${buttons}
      </div>
    `;
  }

  function configureUtterance(utterance) {
    const preferredVoice = voices.find((voice) => voice.name === ttsConfig.nativeVoice)
      || voices[Number(ttsVoice.value || 0)]
      || voices.find((voice) => voice.lang.toLowerCase().includes("zh-cn"))
      || null;

    utterance.lang = "zh-CN";
    utterance.rate = ttsConfig.rate || Number(ttsSpeed.value || 1);
    utterance.volume = ttsConfig.volume || 1;
    utterance.voice = preferredVoice;
    currentUtterance = utterance;
  }

  function finishSpeech(token, keepActive = false) {
    if (token !== activeSpeechToken) return;
    currentUtterance = null;
    if (keepActive) return;
    isSpeaking = false;
    ttsButton.textContent = "朗读";
  }

  function speakWithBrowser(text, token, options = {}) {
    if (!window.speechSynthesis) return Promise.reject(new Error("当前浏览器不支持原生语音"));
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    if (!cleanText) return Promise.resolve();

    return new Promise((resolve) => {
      pushTtsStatus("浏览器原生语音朗读中。", "info");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      configureUtterance(utterance);

      const timeoutMs = Math.max(10000, (cleanText.length * 400) / Math.max(ttsConfig.rate || 1, 0.1));
      const fallbackTimer = window.setTimeout(() => {
        window.speechSynthesis.cancel();
        pushTtsStatus("浏览器语音长时间无响应，已停止本次朗读。", "warn");
        finishSpeech(token, options.keepActive);
        resolve();
      }, timeoutMs);

      utterance.onend = () => {
        window.clearTimeout(fallbackTimer);
        finishSpeech(token, options.keepActive);
        resolve();
      };
      utterance.onerror = (event) => {
        window.clearTimeout(fallbackTimer);
        if (event.error !== "canceled") pushTtsStatus(`浏览器语音错误：${event.error || "未知错误"}`, "error");
        finishSpeech(token, options.keepActive);
        resolve();
      };

      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    });
  }

  function requestWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => window.clearTimeout(timeoutId));
  }

  function splitApiKeys(apiKey) {
    return String(apiKey || "")
      .split(/[\n,;]+/)
      .map((key) => key.trim())
      .filter(Boolean);
  }

  function getApiKeys(conf, fallbackKey = "sk-none") {
    const keys = splitApiKeys(conf.apiKey);
    return keys.length ? keys : [fallbackKey];
  }

  function rememberWorkingApiKey(conf, workingKey) {
    const keys = splitApiKeys(conf.apiKey);
    if (!workingKey || keys.length <= 1 || keys[0] === workingKey) return;
    conf.apiKey = [workingKey, ...keys.filter((key) => key !== workingKey)].join("\n");
    saveTtsConfig();
  }

  async function requestExternalTts(endpoint, payload, conf, isCloud, engineType) {
    const keys = getApiKeys(conf, isCloud ? "" : "sk-none");
    const failures = [];

    for (let index = 0; index < keys.length; index += 1) {
      const apiKey = keys[index];
      const headers = {
        "Content-Type": "application/json",
        "api-key": apiKey,
      };
      if (!isCloud) headers.Authorization = `Bearer ${apiKey || "sk-none"}`;

      try {
        if (keys.length > 1) {
          pushTtsStatus(`[${isCloud ? "云端" : "本地"}] 正在尝试 Key ${index + 1}/${keys.length}`, "pending");
        }

        const response = await requestWithTimeout(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }, Number(conf.timeout || (isCloud ? 120000 : 60000)));

        if (response.ok) {
          rememberWorkingApiKey(conf, apiKey);
          return response;
        }

        const errorText = await response.text();
        failures.push(`Key ${index + 1}: HTTP ${response.status}: ${errorText.slice(0, 220)}`);
      } catch (error) {
        const message = error.name === "AbortError" ? "请求超时" : String(error.message || error);
        failures.push(`Key ${index + 1}: ${message.slice(0, 220)}`);
      }
    }

    console.error("[Story TTS] all api keys failed", { endpoint, engineType, failures });
    throw new Error(failures.join(" | ") || "all api keys failed");
  }

  async function speakWithExternal(text, token, engineType, overrides = null, options = {}) {
    const isCloud = engineType === "cloud";
    const conf = overrides || (isCloud ? ttsConfig.cloud : ttsConfig.local);
    const baseUrl = normalizeBaseUrl(conf.baseUrl);
    if (!baseUrl) {
      pushTtsStatus(`${isCloud ? "云端" : "本地"}引擎未配置 Base URL，准备回退浏览器。`, "warn");
      return false;
    }

    const model = isCloud
      ? (conf.voiceCloneDataUrl && conf.voiceCloneModel ? conf.voiceCloneModel : conf.builtInModel)
      : conf.model;
    if (!model) {
      pushTtsStatus(`${isCloud ? "云端" : "本地"}引擎未配置模型，准备回退浏览器。`, "warn");
      return false;
    }

    const modeLabel = isCloud
      ? (conf.voiceCloneDataUrl ? "克隆音色" : `预设 ${conf.voice || "动态音色"}`)
      : `本地模型 ${model}`;
    const endpoint = isCloud ? `${baseUrl}/chat/completions` : `${baseUrl}/audio/speech`;

    try {
      pushTtsStatus(`[${isCloud ? "云端" : "本地"}] 请求中：${modeLabel}`, "pending");

      let payload;
      if (isCloud) {
        const audio = { format: conf.audioFormat || "wav" };
        const voice = conf.voiceCloneDataUrl || conf.voice;
        if (voice) audio.voice = voice;
        payload = {
          model,
          messages: [
            ...(conf.userMessage ? [{ role: "user", content: conf.userMessage }] : []),
            { role: "assistant", content: text },
          ],
          audio,
        };
      } else {
        payload = { model, input: text };
        if (conf.voice) payload.voice = conf.voice;
        if (conf.userMessage) payload.prompt = conf.userMessage;
      }

      const response = await requestExternalTts(endpoint, payload, conf, isCloud, engineType);

      if (token !== activeSpeechToken) return true;

      let audioBlob;
      if (isCloud) {
        const data = await response.json();
        const audioBase64 = data?.choices?.[0]?.message?.audio?.data;
        if (!audioBase64) throw new Error("响应中没有音频数据");
        const audioBytes = decodeBase64Audio(audioBase64);
        audioBlob = new Blob([audioBytes], { type: `audio/${conf.audioFormat || "wav"}` });
      } else {
        audioBlob = await response.blob();
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      applyAudioPlaybackRate(audio);
      activeAudio = audio;
      activeAudioUrl = audioUrl;
      currentUtterance = audio;

      await new Promise((resolve, reject) => {
        audio.onended = () => {
          clearActiveAudio(audio, audioUrl);
          pushTtsStatus(`播放完成：${modeLabel}`, "success");
          finishSpeech(token, options.keepActive);
          resolve();
        };
        audio.onerror = () => {
          clearActiveAudio(audio, audioUrl);
          reject(new Error("音频播放失败"));
        };
        audio.play().then(() => {
          pushTtsStatus(`连接成功：${modeLabel}`, "success");
        }).catch(reject);
      });
      return true;
    } catch (error) {
      clearActiveAudio();
      if (token === activeSpeechToken) currentUtterance = null;
      const message = error.name === "AbortError" ? "请求超时" : String(error.message || error);
      console.error("[Story TTS] external request failed", {
        endpoint,
        engineType,
        message,
        error,
      });
      pushTtsStatus(`${isCloud ? "云端" : "本地"}请求失败：${message.slice(0, 90)}`, /401|unauthorized|invalid token/i.test(message) ? "error" : "warn");
      return false;
    }
  }

  async function fetchExternalAudio(text, token, engineType, overrides = null) {
    const isCloud = engineType === "cloud";
    const conf = overrides || (isCloud ? ttsConfig.cloud : ttsConfig.local);
    const baseUrl = normalizeBaseUrl(conf.baseUrl);
    if (!baseUrl) throw new Error(`${isCloud ? "云端" : "本地"}引擎未配置 Base URL`);

    const model = isCloud
      ? (conf.voiceCloneDataUrl && conf.voiceCloneModel ? conf.voiceCloneModel : conf.builtInModel)
      : conf.model;
    if (!model) throw new Error(`${isCloud ? "云端" : "本地"}引擎未配置模型`);

    const endpoint = isCloud ? `${baseUrl}/chat/completions` : `${baseUrl}/audio/speech`;
    let payload;
    if (isCloud) {
      const audio = { format: conf.audioFormat || "wav" };
      const voice = conf.voiceCloneDataUrl || conf.voice;
      if (voice) audio.voice = voice;
      payload = {
        model,
        messages: [
          ...(conf.userMessage ? [{ role: "user", content: conf.userMessage }] : []),
          { role: "assistant", content: text },
        ],
        audio,
      };
    } else {
      payload = { model, input: text };
      if (conf.voice) payload.voice = conf.voice;
      if (conf.userMessage) payload.prompt = conf.userMessage;
    }

    const response = await requestExternalTts(endpoint, payload, conf, isCloud, engineType);

    if (token !== null && token !== activeSpeechToken) throw new Error("朗读已停止");

    if (!isCloud) return response.blob();

    const data = await response.json();
    const audioBase64 = data?.choices?.[0]?.message?.audio?.data;
    if (!audioBase64) throw new Error("响应中没有音频数据");
    const audioBytes = decodeBase64Audio(audioBase64);
    return new Blob([audioBytes], { type: `audio/${conf.audioFormat || "wav"}` });
  }

  function externalAudioCacheKey(text) {
    const isCloud = ttsConfig.activeEngine === "cloud";
    const conf = isCloud ? ttsConfig.cloud : ttsConfig.local;
    const model = isCloud
      ? (conf.voiceCloneDataUrl && conf.voiceCloneModel ? conf.voiceCloneModel : conf.builtInModel)
      : conf.model;
    const voice = isCloud ? (conf.voiceCloneDataUrl ? "clone" : conf.voice) : conf.voice;
    return [
      ttsConfig.activeEngine,
      normalizeBaseUrl(conf.baseUrl),
      model || "",
      voice || "",
      conf.audioFormat || "",
      conf.userMessage || "",
      text,
    ].join("\u001f");
  }

  function rememberExternalAudioCache(key, job) {
    if (!externalAudioCache.has(key) && externalAudioCache.size >= externalAudioCacheMax) {
      const oldestKey = externalAudioCache.keys().next().value;
      externalAudioCache.delete(oldestKey);
    }
    externalAudioCache.set(key, job);
  }

  function getExternalAudioJob(text, token = null) {
    const key = externalAudioCacheKey(text);
    if (externalAudioCache.has(key)) return externalAudioCache.get(key);

    const job = fetchExternalAudio(text, token, ttsConfig.activeEngine)
      .catch((error) => {
        externalAudioCache.delete(key);
        throw error;
      });
    rememberExternalAudioCache(key, job);
    return job;
  }

  function hasExternalAudioJob(text) {
    return externalAudioCache.has(externalAudioCacheKey(text));
  }

  function collectLikelyJumpIds(entry) {
    const ids = new Set(Array.isArray(entry.links) ? entry.links : []);
    const pattern = /(?:请参阅|参见|返回|前往|查看|See|Go to|Return to)[^0-9M]{0,16}(M\d{3,4}|\d{4})/gi;
    let match;
    while ((match = pattern.exec(entry.text || "")) !== null) {
      ids.add(match[1]);
    }
    return Array.from(ids);
  }

  function prewarmLinkedEntries(entry) {
    if (!(ttsConfig.activeEngine === "cloud" || ttsConfig.activeEngine === "local")) return;
    if (storyAudioManifest) return;
    const book = currentBook();
    const targets = collectLikelyJumpIds(entry)
      .map((id) => preferredEntry(book, id, {
        chapterKey: entry.chapterKey,
        encounterKey: entry.encounterKey,
      }))
      .filter(Boolean)
      .filter((target, index, array) => array.findIndex((item) => item.key === target.key) === index)
      .slice(0, 6);

    targets.forEach((target) => {
      const chunks = createSpeechChunks(prepareSpeechText(target.text)).slice(0, 5);
      chunks.forEach((chunk) => {
        getExternalAudioJob(chunk).catch(() => {});
      });
    });
    if (targets.length) pushTtsStatus(`已预读取 ${targets.length} 个可能跳转段落。`, "info");
  }

  function prewarmEntryStart(entry) {
    if (!(ttsConfig.activeEngine === "cloud" || ttsConfig.activeEngine === "local")) return;
    if (storyAudioManifest || hasCachedEntryAudio(entry)) return;
    const chunks = createSpeechChunks(prepareSpeechText(entry.text)).slice(0, 5);
    if (!chunks.length) return;

    let hits = 0;
    chunks.forEach((chunk) => {
      if (hasExternalAudioJob(chunk)) hits += 1;
      getExternalAudioJob(chunk).catch(() => {});
    });
    pushTtsStatus(`当前段落语音预热 ${hits}/${chunks.length} 已命中。`, hits ? "success" : "pending");
  }

  function prewarmJumpTarget(id, options = {}) {
    const entry = preferredEntry(currentBook(), id, options);
    if (!entry) return;
    prewarmEntryStart(entry);
  }

  async function previewCloudVoices() {
    const token = ++activeSpeechToken;
    stopActiveAudio();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    currentUtterance = null;
    isSpeaking = true;
    ttsButton.textContent = "停止";

    const originalVoice = ttsConfig.cloud.voice;
    const sampleText = "这是故事书语音试听。愿你的航程顺利，选择清晰。";

    try {
      for (const voice of cloudPresetVoices) {
        if (token !== activeSpeechToken) return;
        ttsConfig.cloud.voice = voice;
        pushTtsStatus(`试听音色：${voice}`, "info");
        const blob = await fetchExternalAudio(sampleText, token, "cloud");
        if (token !== activeSpeechToken) return;
        await playAudioBlob(blob, token, true);
      }
      pushTtsStatus("全部预设音色试听完成。", "success");
    } catch (error) {
      if (token === activeSpeechToken) {
        pushTtsStatus(`音色试听失败：${String(error.message || error).slice(0, 100)}`, "error");
      }
    } finally {
      ttsConfig.cloud.voice = originalVoice;
      if (token === activeSpeechToken) finishSpeech(token);
    }
  }

  function playAudioBlob(audioBlob, token, keepActive = false) {
    return new Promise((resolve, reject) => {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      applyAudioPlaybackRate(audio);
      activeAudio = audio;
      activeAudioUrl = audioUrl;
      currentUtterance = audio;

      audio.onended = () => {
        clearActiveAudio(audio, audioUrl);
        finishSpeech(token, keepActive);
        resolve();
      };
      audio.onerror = () => {
        clearActiveAudio(audio, audioUrl);
        reject(new Error("音频播放失败"));
      };
      audio.play().catch(reject);
    });
  }

  function splitLongSpeechPart(part, maxLength) {
    if (part.length <= maxLength) return [part];

    const chunks = [];
    let rest = part;
    while (rest.length > maxLength) {
      const windowText = rest.slice(0, maxLength + 1);
      const breakAt = Math.max(
        windowText.lastIndexOf("，"),
        windowText.lastIndexOf("、"),
        windowText.lastIndexOf("；"),
        windowText.lastIndexOf(";"),
        windowText.lastIndexOf(",")
      );
      const cut = breakAt > 40 ? breakAt + 1 : maxLength;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }

  function targetChunkLength(index) {
    if (index === 0) return 36;
    if (index === 1) return 64;
    if (index === 2) return 96;
    if (index < 6) return 140;
    return 220;
  }

  function createSpeechChunks(text) {
    const normalized = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!normalized) return [];

    const sentenceParts = normalized
      .match(/[^。！？!?]+[。！？!?]?/g) || [normalized];
    const units = sentenceParts
      .flatMap((part) => splitLongSpeechPart(part.trim(), 80))
      .map((part) => part.trim())
      .filter(Boolean);

    const chunks = [];
    let current = "";
    units.forEach((unit) => {
      const targetLength = targetChunkLength(chunks.length);
      const next = current ? `${current}${unit}` : unit;
      if (current && next.length > targetLength) {
        chunks.push(current);
        current = unit;
      } else {
        current = next;
      }
    });
    if (current) chunks.push(current);
    return chunks.flatMap((part, index) => splitLongSpeechPart(part, targetChunkLength(index) + 40));
  }

  async function speakText(text) {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    if (!cleanText) return;

    const token = ++activeSpeechToken;
    const chunks = createSpeechChunks(cleanText);
    if (!chunks.length) return;
    isSpeaking = true;
    ttsButton.textContent = "停止";

    try {
      let externalUsable = ttsConfig.activeEngine === "cloud" || ttsConfig.activeEngine === "local";
      let fallbackToBrowser = false;
      const audioJobs = new Map();
      const prefetchWindow = 5;

      const queueExternalFetch = (index) => {
        if (!externalUsable || fallbackToBrowser || index >= chunks.length || audioJobs.has(index)) return;
        audioJobs.set(index, getExternalAudioJob(chunks[index], token)
          .then((blob) => ({ ok: true, blob }))
          .catch((error) => ({ ok: false, error })));
      };

      if (externalUsable) {
        for (let index = 0; index < Math.min(prefetchWindow, chunks.length); index += 1) {
          queueExternalFetch(index);
        }
      }

      for (let index = 0; index < chunks.length; index += 1) {
        if (token !== activeSpeechToken) return;
        const chunk = chunks[index];
        const keepActive = index < chunks.length - 1;
        pushTtsStatus(`分句朗读 ${index + 1}/${chunks.length}`, "info");

        let usedExternal = false;
        if (externalUsable && !fallbackToBrowser) {
          queueExternalFetch(index);
          queueExternalFetch(index + prefetchWindow);
          const result = await audioJobs.get(index);
          audioJobs.delete(index);
          if (token !== activeSpeechToken) return;
          if (result.ok) {
            queueExternalFetch(index + prefetchWindow + 1);
            await playAudioBlob(result.blob, token, keepActive);
            usedExternal = true;
          } else {
            const message = String(result.error?.message || result.error || "未知错误");
            console.error("[Story TTS] prefetch request failed", result.error);
            pushTtsStatus(`云端预取失败：${message.slice(0, 90)}`, /401|unauthorized|invalid token/i.test(message) ? "error" : "warn");
            fallbackToBrowser = true;
          }
        }
        if (token !== activeSpeechToken) return;
        if (usedExternal) continue;

        if (ttsConfig.activeEngine !== "browser" && externalUsable) {
          pushTtsStatus("外部引擎不可用，后续已回退到浏览器原生语音。", "warn");
          externalUsable = false;
        }
        await speakWithBrowser(chunk, token, { keepActive });
      }
      finishSpeech(token);
    } catch (error) {
      if (token !== activeSpeechToken) return;
      pushTtsStatus(`朗读失败：${String(error.message || error)}`, "error");
      finishSpeech(token);
    }
  }

  function renderStory(entry) {
    const imagesHtml = renderBattleImages(entry);
    const html = entry.html
      ? renderHtmlStory(entry, imagesHtml)
      : entry.chapterKey === "battle"
      ? renderBattleSectionedStory(entry, imagesHtml)
      : entry.chapterKey === "special-aftermath"
        ? renderSectionedStory(entry, imagesHtml)
        : `${linkify(entry.text, currentBook())}${imagesHtml ? `<div class="battle-gallery">${imagesHtml}</div>` : ""}`;
    storyText.innerHTML = html;
  }

  function entryBookId(entry) {
    if (entry.bookId) return entry.bookId;
    const byKey = data.books.find((book) => String(entry.key || "").startsWith(`${book.id}-`));
    return byKey ? byKey.id : currentBook().id;
  }

  function syncSelectorsToEntry(entry) {
    const bookId = entryBookId(entry);
    if (bookSelect.value !== bookId) {
      bookSelect.value = bookId;
      activeBook = currentBook();
      populateChapters(activeBook, entry.chapterKey);
    }

    if (chapterSelect.value !== entry.chapterKey) {
      chapterSelect.value = entry.chapterKey;
      populateEncounters(currentBook(), entry.encounterKey || "all");
    } else if ((entry.encounterKey || "all") !== encounterSelect.value) {
      encounterSelect.value = entry.encounterKey || "all";
    }

    updateChapterSummary();
  }

  function syncUrlToEntry(entry) {
    if (!window.history || !entry) return;
    const params = new URLSearchParams();
    params.set("book", entryBookId(entry));
    params.set("chapter", entry.chapterKey || "all");
    if (entry.encounterKey) params.set("encounter", entry.encounterKey);
    params.set("entry", entry.id);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  function showEntry(entry, pushHistory) {
    if (pushHistory && activeEntry && activeEntry.key !== entry.key) {
      historyStack.push({
        bookId: entryBookId(activeEntry),
        chapterKey: activeEntry.chapterKey,
        encounterKey: activeEntry.encounterKey || "all",
        entryKey: activeEntry.key,
      });
    }

    activeBook = currentBook();
    activeEntry = entry;
    syncSelectorsToEntry(entry);

    sectionLabel.textContent = entry.encounter ? `${entry.chapter} / ${entry.encounter}` : entry.chapter || "未命名模块";
    entryTitle.textContent = entry.title || "故事段落";
    entryBadge.textContent = entry.id;

    renderStory(entry);
    renderLinkPanel(entry);
    renderResults(searchEntries(searchInput.value));
    syncUrlToEntry(entry);
    window.setTimeout(() => {
      ensureStoryAudioManifest().then(() => prewarmLinkedEntries(entry));
    }, 200);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function jumpToId(id, options = {}) {
    const entry = preferredEntry(currentBook(), id, options);
    if (!entry) {
      searchInput.value = id;
      renderResults(searchEntries(id));
      return;
    }
    searchInput.value = id;
    showEntry(entry, true);
  }

  function goBack() {
    const previous = historyStack.pop();
    if (!previous) return;
    bookSelect.value = previous.bookId;
    activeBook = currentBook();
    populateChapters(activeBook, previous.chapterKey);
    encounterSelect.value = previous.encounterKey || "all";
    updateChapterSummary();
    const entry = activeBook.entries.find((item) => item.key === previous.entryKey);
    if (entry) showEntry(entry, false);
  }

  function showFirstInScope() {
    const entries = currentScopedEntries();
    renderResults(searchEntries(searchInput.value));
    if (entries.length) showEntry(entries[0], false);
  }

  function saveMemories() {
    localStorage.setItem(storageKey, JSON.stringify(memories));
  }

  function loadMemories() {
    try {
      const raw = localStorage.getItem(storageKey);
      memories = raw ? JSON.parse(raw) : [];
    } catch (error) {
      memories = [];
    }
  }

  function memoryDisplayText(memory) {
    const chapterText = memory.encounter ? `${memory.chapter} / ${memory.encounter}` : memory.chapter;
    return `${memory.bookTitle} · ${chapterText} · ${memory.entryId}`;
  }

  function renderMemories() {
    memoryList.innerHTML = "";
    if (!memories.length) {
      memoryList.innerHTML = '<div class="empty">还没有记下任何段落</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    memories.forEach((memory) => {
      const item = document.createElement("div");
      item.className = "memory-item";

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "memory-jump";
      jump.innerHTML = `
        <span class="memory-id">${escapeHtml(memory.entryId)}</span>
        <span class="memory-meta">${escapeHtml(memoryDisplayText(memory))}</span>
      `;
      jump.addEventListener("click", () => {
        const targetBook = data.books.find((book) => book.id === memory.bookId);
        if (!targetBook) return;
        bookSelect.value = memory.bookId;
        activeBook = currentBook();
        const entry = preferredEntry(targetBook, memory.entryId, {
          bookId: memory.bookId,
          chapterKey: memory.chapterKey,
          encounterKey: memory.encounterKey,
          entryKey: memory.entryKey,
        });
        if (entry) showEntry(entry, true);
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "memory-remove";
      remove.textContent = "删除";
      remove.addEventListener("click", () => {
        memories = memories.filter((itemData) => itemData.memoryKey !== memory.memoryKey);
        saveMemories();
        renderMemories();
      });

      item.appendChild(jump);
      item.appendChild(remove);
      fragment.appendChild(item);
    });

    memoryList.appendChild(fragment);
  }

  function rememberParagraph() {
    const rawInput = window.prompt("输入要记下的段落号，例如 0001、M009、21");
    if (!rawInput) return;

    const input = rawInput.trim();
    if (!input) return;

    const book = currentBook();
    const entry = preferredEntry(book, input, {
      chapterKey: selectedChapterKey() === "all" ? null : selectedChapterKey(),
      encounterKey: selectedEncounterKey() === "all" ? null : selectedEncounterKey(),
    });

    if (!entry) {
      window.alert(`没有找到段落 ${input}`);
      return;
    }

    const memoryKey = [
      book.id,
      entry.chapterKey || "",
      entry.encounterKey || "",
      entry.id,
      entry.key,
    ].join("::");

    if (memories.some((item) => item.memoryKey === memoryKey)) {
      window.alert(`段落 ${entry.id} 已经记下了`);
      return;
    }

    memories.unshift({
      memoryKey,
      bookId: book.id,
      bookTitle: book.title,
      chapterKey: entry.chapterKey,
      chapter: entry.chapter,
      encounterKey: entry.encounterKey || "",
      encounter: entry.encounter || "",
      entryId: entry.id,
      entryKey: entry.key,
      title: entry.title || "",
      createdAt: Date.now(),
    });

    saveMemories();
    renderMemories();
  }

  function updateTtsControls() {
    ttsUi.engineSelect.value = ttsConfig.activeEngine;
    ttsSpeed.value = String(ttsConfig.rate || 1);
    syncVoiceSelect();
    renderTtsStatus();
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function modalField(id, label, value, type = "text", placeholder = "") {
    return `
      <label class="tts-modal-field">
        <span>${label}</span>
        <input id="${id}" type="${type}" value="${escapeAttribute(value || "")}" placeholder="${escapeAttribute(placeholder)}">
      </label>
    `;
  }

  function modalTextArea(id, label, value, placeholder = "", rows = 3) {
    return `
      <label class="tts-modal-field wide">
        <span>${label}</span>
        <textarea id="${id}" rows="${rows}" placeholder="${escapeAttribute(placeholder)}">${escapeHtml(value || "")}</textarea>
      </label>
    `;
  }

  function openTtsConfigModal() {
    const cloud = ttsConfig.cloud;
    const local = ttsConfig.local;
    ttsUi.overlay.hidden = false;
    ttsUi.overlay.innerHTML = `
      <div class="tts-modal" role="dialog" aria-modal="true" aria-label="配置外部 TTS 引擎">
        <header class="tts-modal-head">
          <div>
            <h3>配置外部 TTS 引擎</h3>
            <p>本地部署走 OpenAI audio/speech 风格接口；云端 API 走 Arkham 脚本里的 chat/completions 音频返回格式。</p>
          </div>
          <button id="ttsModalClose" type="button">关闭</button>
        </header>

        <section class="tts-modal-section">
          <div class="tts-modal-title">
            <strong>云端 API 配置</strong>
            <div>
              <button id="ttsPreviewVoices" type="button">试听所有音色</button>
              <button id="ttsCloneImport" type="button">导入克隆音色</button>
              <button id="ttsCloneClear" type="button">清除克隆音色</button>
            </div>
          </div>
          <div class="tts-modal-grid">
            ${modalField("ttsCloudBase", "Base URL", cloud.baseUrl, "text", "https://example.com/v1")}
            ${modalTextArea("ttsCloudKey", "API Keys", cloud.apiKey, "sk-xxx\\nsk-yyy")}
            ${modalField("ttsCloudModel", "内置模型", cloud.builtInModel, "text", "mimo-v2.5-tts")}
            ${modalField("ttsCloudCloneModel", "克隆模型", cloud.voiceCloneModel, "text", "mimo-v2.5-tts-voiceclone")}
            ${modalField("ttsCloudVoice", "预设音色", cloud.voice, "text", "voice name")}
            ${modalField("ttsCloudFormat", "音频格式", cloud.audioFormat || "wav", "text", "wav")}
            ${modalField("ttsCloudTimeout", "超时 ms", cloud.timeout, "number", "120000")}
            <label class="tts-modal-field wide">
              <span>风格提示词</span>
              <textarea id="ttsCloudPrompt" rows="2" placeholder="例如：冷静、中速、带一点故事感。">${escapeHtml(cloud.userMessage || "")}</textarea>
            </label>
          </div>
          <button id="ttsCloudTest" type="button" class="tts-test-btn">测试云端连接并试听</button>
        </section>

        <section class="tts-modal-section">
          <div class="tts-modal-title"><strong>本地部署配置</strong></div>
          <div class="tts-modal-grid">
            ${modalField("ttsLocalBase", "Base URL", local.baseUrl, "text", "http://127.0.0.1:8000/v1")}
            ${modalTextArea("ttsLocalKey", "API Keys", local.apiKey, "sk-none")}
            ${modalField("ttsLocalModel", "模型名称", local.model, "text", "tts-1")}
            ${modalField("ttsLocalVoice", "发音人", local.voice, "text", "alloy")}
            ${modalField("ttsLocalTimeout", "超时 ms", local.timeout, "number", "60000")}
            <label class="tts-modal-field wide">
              <span>风格提示词</span>
              <textarea id="ttsLocalPrompt" rows="2" placeholder="本地服务支持 prompt 时会生效。">${escapeHtml(local.userMessage || "")}</textarea>
            </label>
          </div>
          <button id="ttsLocalTest" type="button" class="tts-test-btn">测试本地连接并试听</button>
        </section>

        <footer class="tts-modal-foot">
          <div>
            <button id="ttsImportConfig" type="button">导入配置 JSON</button>
            <button id="ttsExportConfig" type="button">导出当前配置</button>
          </div>
          <button id="ttsSaveConfig" type="button">保存所有配置</button>
        </footer>
      </div>
    `;

    const close = () => {
      ttsUi.overlay.hidden = true;
      ttsUi.overlay.innerHTML = "";
    };
    const readModalConfig = () => ({
      cloud: {
        baseUrl: document.querySelector("#ttsCloudBase").value.trim(),
        apiKey: document.querySelector("#ttsCloudKey").value.trim(),
        builtInModel: document.querySelector("#ttsCloudModel").value.trim(),
        voiceCloneModel: document.querySelector("#ttsCloudCloneModel").value.trim(),
        voice: document.querySelector("#ttsCloudVoice").value.trim(),
        voiceCloneDataUrl: ttsConfig.cloud.voiceCloneDataUrl,
        userMessage: document.querySelector("#ttsCloudPrompt").value.trim(),
        audioFormat: document.querySelector("#ttsCloudFormat").value.trim() || "wav",
        timeout: Number(document.querySelector("#ttsCloudTimeout").value || 120000),
      },
      local: {
        baseUrl: document.querySelector("#ttsLocalBase").value.trim(),
        apiKey: document.querySelector("#ttsLocalKey").value.trim(),
        model: document.querySelector("#ttsLocalModel").value.trim(),
        voice: document.querySelector("#ttsLocalVoice").value.trim(),
        userMessage: document.querySelector("#ttsLocalPrompt").value.trim(),
        timeout: Number(document.querySelector("#ttsLocalTimeout").value || 60000),
      },
    });

    document.querySelector("#ttsModalClose").addEventListener("click", close);
    ttsUi.overlay.addEventListener("click", (event) => {
      if (event.target === ttsUi.overlay) close();
    }, { once: true });
    document.querySelector("#ttsCloneImport").addEventListener("click", () => ttsUi.cloneInput.click());
    document.querySelector("#ttsPreviewVoices").addEventListener("click", previewCloudVoices);
    document.querySelector("#ttsCloneClear").addEventListener("click", () => {
      ttsConfig.cloud.voiceCloneDataUrl = "";
      saveTtsConfig();
      pushTtsStatus("已清除云端克隆音色。", "info");
      renderTtsStatus();
    });
    document.querySelector("#ttsCloudTest").addEventListener("click", async () => {
      const snapshot = readModalConfig();
      await speakWithExternal("这是一段故事书语音测试。", ++activeSpeechToken, "cloud", snapshot.cloud);
    });
    document.querySelector("#ttsLocalTest").addEventListener("click", async () => {
      const snapshot = readModalConfig();
      await speakWithExternal("这是一段故事书语音测试。", ++activeSpeechToken, "local", snapshot.local);
    });
    document.querySelector("#ttsImportConfig").addEventListener("click", () => ttsUi.importInput.click());
    document.querySelector("#ttsExportConfig").addEventListener("click", () => exportTtsConfig(readModalConfig()));
    document.querySelector("#ttsSaveConfig").addEventListener("click", () => {
      const snapshot = readModalConfig();
      ttsConfig.cloud = snapshot.cloud;
      ttsConfig.local = snapshot.local;
      saveTtsConfig();
      updateTtsControls();
      pushTtsStatus(`配置已保存。当前引擎：${ttsConfig.activeEngine}`, "success");
      close();
    });
  }

  function exportTtsConfig(snapshot = null) {
    const dataToExport = { ...ttsConfig, ...(snapshot || {}) };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "story-tts-engine-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function syncVoiceSelect() {
    const engine = ttsConfig.activeEngine;
    ttsVoice.innerHTML = "";
    ttsVoice.disabled = false;

    if (engine === "browser") {
      if (!window.speechSynthesis) {
        ttsVoice.disabled = true;
        return;
      }
      const allVoices = window.speechSynthesis.getVoices();
      const preferred = allVoices.filter((v) => v.lang.toLowerCase().startsWith("zh"));
      voices = preferred.length ? preferred : allVoices;
      voices.forEach((voice, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = voice.name;
        if (voice.name === ttsConfig.nativeVoice) option.selected = true;
        ttsVoice.appendChild(option);
      });
    } else if (engine === "offline") {
      voices = [];
      offlineAudioPacks.forEach((pack) => {
        const option = document.createElement("option");
        option.value = pack.id;
        option.textContent = pack.label;
        if (pack.id === (ttsConfig.offlineAudioPack || offlineAudioPacks[0].id)) option.selected = true;
        ttsVoice.appendChild(option);
      });
    } else if (engine === "cloud") {
      voices = [];
      cloudPresetVoices.forEach((v) => {
        const option = document.createElement("option");
        option.value = v;
        option.textContent = v;
        if (v === ttsConfig.cloud.voice) option.selected = true;
        ttsVoice.appendChild(option);
      });
      if (ttsConfig.cloud.voiceCloneDataUrl) {
        const option = document.createElement("option");
        option.value = "__clone__";
        option.textContent = "克隆音色";
        option.selected = true;
        ttsVoice.appendChild(option);
      }
    } else {
      voices = [];
      const option = document.createElement("option");
      option.value = "";
      option.textContent = ttsConfig.local.voice || "本地部署音色";
      ttsVoice.appendChild(option);
    }
  }

  function loadVoices() {
    ttsButton.disabled = ttsConfig.activeEngine === "browser" && !window.speechSynthesis;
    syncVoiceSelect();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        if (ttsConfig.activeEngine === "browser") syncVoiceSelect();
      };
    }
  }

  function toggleSpeech() {
    if (!activeEntry) return;
    if (currentUtterance) {
      stopSpeech();
      return;
    }

    speakEntry(activeEntry);
  }

  async function speakEntry(entry) {
    const text = prepareSpeechText(entry.text);
    if (!text) return;
    await ensureStoryAudioManifest();
    const token = ++activeSpeechToken;
    try {
      if (await speakCachedEntryAudio(entry, token)) return;
    } catch (error) {
      if (token === activeSpeechToken) {
        pushTtsStatus(`Offline audio failed: ${String(error.message || error).slice(0, 100)}`, "warn");
      }
    }
    if (ttsConfig.activeEngine === "offline") {
      await ensureStoryAudioManifest(true);
      try {
        if (await speakCachedEntryAudio(entry, token)) return;
      } catch (error) {
        if (token === activeSpeechToken) {
          pushTtsStatus(`Offline audio failed after reload: ${String(error.message || error).slice(0, 100)}`, "warn");
        }
      }
      pushTtsStatus("No offline audio for this entry. Generate it first.", "warn");
      finishSpeech(token);
      return;
    }
    speakText(text);
  }

  function init() {
    if (!data || !data.books || !data.books.length) {
      storyText.textContent = "没有找到故事索引 data/storybook-data.js，请先运行数据生成脚本。";
      return;
    }

    data.books.forEach((book) => {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = `${book.title} (${book.entryCount})`;
      bookSelect.appendChild(option);
    });

    const params = new URLSearchParams(window.location.search);
    const deepLinkTarget = readDeepLinkTarget(params);
    if (deepLinkTarget.bookId) bookSelect.value = deepLinkTarget.bookId;

    loadMemories();
    initEntities();
    renderMemories();
    loadVoices();
    updateTtsControls();

    activeBook = currentBook();
    const requestedChapterKey = resolveChapterKey(activeBook, deepLinkTarget.chapterKey)
      || (deepLinkTarget.encounterKey ? resolveChapterKey(activeBook, "battle") : "");
    populateChapters(activeBook, requestedChapterKey);
    const requestedEncounterKey = resolveEncounterKey(activeBook, deepLinkTarget.encounterKey);
    if (requestedEncounterKey) populateEncounters(activeBook, requestedEncounterKey);
    if (deepLinkTarget.query) searchInput.value = deepLinkTarget.query;
    bookMeta.textContent = `${data.books.length} 本故事书 · ${data.generatedAt}`;
    const requestedEntry = entryFromDeepLink(activeBook, deepLinkTarget);
    if (requestedEntry) {
      showEntry(requestedEntry, false);
    } else {
      showFirstInScope();
    }
  }

  bookSelect.addEventListener("change", () => {
    activeBook = currentBook();
    activeEntry = null;
    historyStack = [];
    searchInput.value = "";
    populateChapters(activeBook);
    showFirstInScope();
  });

  chapterSelect.addEventListener("change", () => {
    activeEntry = null;
    historyStack = [];
    searchInput.value = "";
    populateEncounters(currentBook());
    updateChapterSummary();
    showFirstInScope();
  });

  encounterSelect.addEventListener("change", () => {
    activeEntry = null;
    historyStack = [];
    searchInput.value = "";
    updateChapterSummary();
    showFirstInScope();
  });

  searchInput.addEventListener("input", () => {
    renderResults(searchEntries(searchInput.value));
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const entries = searchEntries(searchInput.value);
      renderResults(entries);
      if (entries.length) showEntry(entries[0], true);
    }
  });

  goButton.addEventListener("click", () => {
    const entries = searchEntries(searchInput.value);
    renderResults(entries);
    if (entries.length) showEntry(entries[0], true);
  });

  backButton.addEventListener("click", goBack);
  rememberButton.addEventListener("click", rememberParagraph);
  ttsButton.addEventListener("click", toggleSpeech);
  ttsUi.configButton.addEventListener("click", openTtsConfigModal);
  ttsUi.engineSelect.addEventListener("change", (event) => {
    ttsConfig.activeEngine = event.target.value;
    ttsButton.disabled = ttsConfig.activeEngine === "browser" && !window.speechSynthesis;
    syncVoiceSelect();
    saveTtsConfig();
    renderTtsStatus();
    pushTtsStatus(`已切换至 ${getEngineStatusLabel()}。`, "info");
  });
  document.querySelector("#ttsStatusToggle").addEventListener("click", () => {
    ttsConfig.statusCollapsed = !ttsConfig.statusCollapsed;
    saveTtsConfig();
    renderTtsStatus();
  });
  ttsUi.cloneInput.addEventListener("change", () => {
    const file = ttsUi.cloneInput.files && ttsUi.cloneInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      ttsConfig.cloud.voiceCloneDataUrl = String(reader.result || "");
      saveTtsConfig();
      pushTtsStatus(`已导入克隆音色：${file.name}`, "success");
      renderTtsStatus();
    };
    reader.onerror = () => pushTtsStatus("克隆音色读取失败。", "error");
    reader.readAsDataURL(file);
    ttsUi.cloneInput.value = "";
  });
  ttsUi.importInput.addEventListener("change", () => {
    const file = ttsUi.importInput.files && ttsUi.importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result || "{}"));
        ttsConfig = {
          ...defaultTtsConfig,
          ...ttsConfig,
          ...imported,
          cloud: { ...defaultTtsConfig.cloud, ...ttsConfig.cloud, ...(imported.cloud || {}) },
          local: { ...defaultTtsConfig.local, ...ttsConfig.local, ...(imported.local || {}) },
        };
        saveTtsConfig();
        updateTtsControls();
        pushTtsStatus("已导入 TTS 配置。", "success");
      } catch (error) {
        pushTtsStatus("配置 JSON 解析失败。", "error");
      }
    };
    reader.readAsText(file);
    ttsUi.importInput.value = "";
  });

  ttsSpeed.addEventListener("change", () => {
    ttsConfig.rate = Number(ttsSpeed.value || 1);
    saveTtsConfig();
    if (activeAudio) {
      applyAudioPlaybackRate(activeAudio);
      return;
    }
    if (currentUtterance) {
      stopSpeech();
      toggleSpeech();
    }
  });

  ttsVoice.addEventListener("change", async () => {
    const engine = ttsConfig.activeEngine;
    if (engine === "browser") {
      const selectedVoice = voices[Number(ttsVoice.value || 0)];
      ttsConfig.nativeVoice = selectedVoice ? selectedVoice.name : "";
    } else if (engine === "offline") {
      ttsConfig.offlineAudioPack = ttsVoice.value || offlineAudioPacks[0].id;
      storyAudioManifest = null;
      storyAudioManifestPromise = null;
      storyAudioManifestPack = "";
      await ensureStoryAudioManifest(true);
    } else if (engine === "cloud") {
      const val = ttsVoice.value;
      if (val && val !== "__clone__") {
        ttsConfig.cloud.voice = val;
        ttsConfig.cloud.voiceCloneDataUrl = "";
      }
    }
    saveTtsConfig();
    renderTtsStatus();
    if (currentUtterance) {
      stopSpeech();
      toggleSpeech();
    }
  });

  storyText.addEventListener("click", (event) => {
    const entityTarget = event.target.closest("[data-entity-id]");
    if (entityTarget) {
      openEntityBio(entityTarget.dataset.entityId);
      return;
    }

    const target = event.target.closest("[data-id]");
    if (!target) return;
    jumpToId(target.dataset.id, { chapterHint: target.dataset.chapterHint });
  });

  ["pointerenter", "pointerdown", "focusin"].forEach((eventName) => {
    storyText.addEventListener(eventName, (event) => {
      const target = event.target.closest("[data-id]");
      if (!target) return;
      prewarmJumpTarget(target.dataset.id, { chapterHint: target.dataset.chapterHint });
    }, true);
  });

  init();
})();
