(function () {
  const fanData = window.STORYBOOK_DATA;
  let data = fanData;
  const officialData = window.STORYBOOK_OFFICIAL_DATA || { books: [] };
  const officialEntries = new Map();
  officialData.books.forEach((book) => (book.entries || []).forEach((entry) => officialEntries.set(`${book.id}:${entry.key}`, entry)));
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
  const storyMark = document.querySelector("#storyMark");
  const sectionLabel = document.querySelector("#sectionLabel");
  const entryTitle = document.querySelector("#entryTitle");
  const pharosTitleDecodeButton = document.querySelector("#pharosTitleDecodeButton");
  const entryBadge = document.querySelector("#entryBadge");
  const storyText = document.querySelector("#storyText");
  const linkPanel = document.querySelector("#linkPanel");
  const entityBioToggle = document.querySelector("#entityBioToggle");
  const ttsButton = document.querySelector("#ttsButton");
  const ttsPauseButton = document.querySelector("#ttsPauseButton");
  const ttsSpeed = document.querySelector("#ttsSpeed");
  const ttsVoice = document.querySelector("#ttsVoice") || Object.assign(document.createElement("select"), {
    id: "ttsVoice",
    className: "tts-select",
  });
  const secondScreenStoryModeLabel = document.querySelector("#secondScreenStoryModeLabel");
  const secondScreenStoryModeToggle = document.querySelector("#secondScreenStoryModeToggle");
  const secondScreenStoryContentLabel = document.querySelector("#secondScreenStoryContentLabel");
  const secondScreenStoryContentToggle = document.querySelector("#secondScreenStoryContentToggle");
  const battleShortcutPanel = document.createElement("div");
  battleShortcutPanel.id = "battleShortcutPanel";
  battleShortcutPanel.className = "battle-shortcuts";
  chapterSummary.after(battleShortcutPanel);

  let activeBook = null;
  let activeEntry = null;
  const decodedPharosTitleKeys = new Set();
  let storyVersion = localStorage.getItem("ato-term-language-v1") === "official" ? "官方版" : "民间版";
  data = buildVersionData(storyVersion === "官方版");
  const storyLanguageChannel = "BroadcastChannel" in window ? new BroadcastChannel("ato-term-language") : null;
  const secondScreenSnapshotUrl = "../api/campaign-state.php?section=story";
  const secondScreenModeUrl = "../api/campaign-state.php?action=second-screen-mode";
  const secondScreenStatusUrl = "../api/campaign-state.php?action=second-screen-status";
  const campaignSession = window.ATO_CAMPAIGN_SESSION?.create?.();
  let storySectionRevision = 0;
  const SECOND_SCREEN_SNAPSHOT_ATTEMPTS = 3;
  const SECOND_SCREEN_STORY_MODE_TITLE = "勾选后第二屏显示当前故事文本，取消勾选后显示地图";
  const SECOND_SCREEN_STORY_CONTENT_TITLE = "官方版有扫描图时，勾选后第二屏显示原书扫描图，取消勾选后显示官方正文";
  const MISSING_OFFICIAL_SCAN_HINT = "该条目暂无对应的官方扫描图（本地未提供原书页）。";
  // 官方数据声明了扫描图，不等于本机真有这张原书页（民间版资源包不带扫描图）。加载失败过
  // 的条目登记在这里：之后不再渲染会失败的 img，勾选框和第二屏快照也按「没有扫描图」处理。
  const missingOfficialScans = new Set();
  let secondScreenSnapshotTimer = null;
  let secondScreenSnapshotFailure = "";
  let secondScreenModeFailure = "";
  let secondScreenModeBusy = false;
  let secondScreenStoryImagesPreference = true;
  try {
    secondScreenStoryImagesPreference = localStorage.getItem("ato-second-screen-story-content-v1") !== "text";
  } catch {
    // 浏览器隐私模式可能禁止 localStorage；本页仍可正常使用本次切换。
  }
  let historyStack = [];
  let memories = [];
  let voices = [];
  let currentUtterance = null;
  let activeSpeechToken = 0;
  let activeAudio = null;
  let activeAudioUrl = "";
  let isSpeaking = false;
  let isSpeechPaused = false;
  let statusEntries = [];
  let storyAudioManifest = null;
  let storyAudioManifestPromise = null;
  let storyAudioManifestPack = "";
  let entityOverlay = null;
  let pageViewer = null;
  const pageViewerState = {
    images: [],
    index: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
    dragX: 0,
    dragY: 0,
    previousBodyOverflow: "",
  };
  const entityLookup = new Map();
  let entityAliases = [];
  let entityBiosEnabled = false;
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
  // 讯飞在线语音合成发音人（浏览器只能走 WebSocket 版，HTTP 版会被 CORS 拦下）。
  const xfyunPresetVoices = [
    { vcn: "x4_lingbosong_bad_talk", label: "聆伯松-反派老人" },
    { vcn: "x4_lingbosong", label: "聆伯松-老年男声" },
    { vcn: "x4_xiaoyan", label: "讯飞小燕" },
    { vcn: "x4_pengfei", label: "小鹏" },
    { vcn: "x4_yeting", label: "希涵" },
    { vcn: "x4_guanshan", label: "关山-专题" },
    { vcn: "x4_qianxue", label: "千雪" },
    { vcn: "x4_xiuying", label: "秀英-老年女声" },
    { vcn: "x4_mingge", label: "明哥" },
    { vcn: "x4_doudou", label: "豆豆" },
    { vcn: "x4_xiaoguo", label: "小果" },
    { vcn: "x4_xiaozhong", label: "小忠" },
    { vcn: "x4_yezi", label: "小露" },
    { vcn: "x4_chaoge", label: "超哥" },
    { vcn: "x4_feidie", label: "飞碟哥" },
    { vcn: "x4_lingfeihao_upbeatads", label: "聆飞皓-广告" },
    { vcn: "x4_wangqianqian", label: "嘉欣" },
    { vcn: "x4_lingxiaozhen_eclives", label: "聆小臻" },
  ];
  const cloudProviders = [
    { id: "mimo", label: "MIMO / OpenAI 兼容" },
    { id: "xfyun", label: "讯飞在线语音合成" },
  ];
  const offlineAudioPacks = [
    { id: "audio", label: "默认离线音色", dir: "audio-packs/audio" },
    { id: "audio-baihua-nosplit-23451", label: "白桦（整段）", dir: "audio-packs/audio-baihua-nosplit-23451" },
    { id: "audio-lingbosong", label: "聆伯松-反派老人（官方版）", dir: "audio-packs/audio-lingbosong", official: true },
  ];

  const defaultTtsConfig = {
    activeEngine: "browser",
    nativeVoice: "",
    rate: 1,
    volume: 1,
    statusCollapsed: false,
    offlineAudioPack: "audio",
    cloud: {
      provider: "mimo",
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "",
      builtInModel: "mimo-v2.5-tts",
      voiceCloneModel: "",
      voice: defaultTtsVoice,
      voiceCloneDataUrl: "",
      userMessage: defaultTtsPrompt,
      audioFormat: "mp3",
      timeout: 120000,
      xfyun: {
        appId: "",
        apiKey: "",
        apiSecret: "",
        vcn: "x4_lingbosong_bad_talk",
        voiceLabel: "聆伯松-反派老人",
        host: "tts-api.xfyun.cn",
        sampleRate: 16000,
        speed: 50,
        volume: 50,
        pitch: 50,
        timeout: 60000,
      },
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
    if (!entityBiosEnabled || !entityAliases.length || !html) return html;
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

  function annotateEntityTextNodes(root) {
    if (!entityBiosEnabled || !entityAliases.length || !root) return;
    const pattern = new RegExp(entityAliases.map((item) => escapeRegExp(item.alias)).join("|"), "gi");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        pattern.lastIndex = 0;
        if (!parent || !node.nodeValue || !pattern.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        pattern.lastIndex = 0;
        if (parent.closest("button, a, script, style, textarea, select, [data-entity-id], [data-id], [data-page-viewer]")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      const text = node.nodeValue || "";
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const label = match[0];
        const prevChar = text[match.index - 1] || "";
        const nextChar = text[match.index + label.length] || "";
        const entity = entityLookup.get(label.toLowerCase());
        if (!entity
          || (/^[A-Za-z]/.test(label) && (/[A-Za-z]/.test(prevChar) || /[A-Za-z]/.test(nextChar)))
          || (/[\u3400-\u9fff]/.test(label) && /[们的]/.test(nextChar))) {
          continue;
        }
        if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
        const button = document.createElement("button");
        button.className = "character-link entity-link";
        button.type = "button";
        button.dataset.entityId = entity.id;
        button.textContent = label;
        fragment.append(button);
        lastIndex = match.index + label.length;
      }
      if (lastIndex === 0) return;
      if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
      node.replaceWith(fragment);
    });
  }

  function updateEntityBioToggle() {
    if (!entityBioToggle) return;
    entityBioToggle.textContent = `人物小传：${entityBiosEnabled ? "开" : "关"}`;
    entityBioToggle.setAttribute("aria-pressed", entityBiosEnabled ? "true" : "false");
    entityBioToggle.classList.toggle("active", entityBiosEnabled);
  }

  function toggleEntityBios() {
    if (!entityBioToggle) return;
    if (!entityBiosEnabled) {
      const accepted = window.confirm(
        "人物小传为 AI 生成，仅用于提醒人物大致是谁，不保证正确；同时非剧透部分也可能包含剧透。\n\n请在明白上述风险后再打开人物小传。"
      );
      if (!accepted) {
        updateEntityBioToggle();
        return;
      }
    }
    entityBiosEnabled = !entityBiosEnabled;
    if (!entityBiosEnabled) closeEntityBio();
    updateEntityBioToggle();
    if (activeEntry) renderStory(activeEntry);
  }

  function normalizeQuery(value) {
    return value.trim().toLowerCase();
  }

  function buildVersionData(official) {
    if (!official || !fanData?.books) return fanData;
    // These source-transcribed paragraphs have no counterpart in the fan index.
    const chaptersByKey = {
      "c1-7-official-0002": "hub-05-uneasy-rests-the-head",
      "c2-3-official-0038": "hub-02-the-other-thermopylae",
      "c3-7-official-0027": "hub-05-cant-go-back",
    };
    return { ...fanData, books: fanData.books.map((book) => {
      const entries = book.entries.slice();
      const sourceBook = officialData.books.find((item) => item.id === book.id);
      for (const source of sourceBook?.entries || []) {
        if (entries.some((entry) => entry.key === source.key)) continue;
        const chapterKey = source.chapterKey || chaptersByKey[source.key];
        const chapter = book.chapters.find((item) => item.key === chapterKey);
        if (!chapter) continue;
        const text = source.officialText || "";
        const next = entries.find((entry) => entry.chapterKey === chapterKey && entry.id > source.id);
        const peers = entries.filter((entry) => entry.chapterKey === chapterKey);
        entries.push({
          key: source.key, id: source.id, chapterKey, chapter: chapter.title,
          title: source.officialTitle || source.id, text,
          officialOnly: true,
          order: next ? next.order - 0.5 : Math.max(0, ...peers.map((entry) => entry.order)) + 0.5,
          links: [...new Set(text.match(/\b\d{4}\b/g) || [])],
        });
      }
      entries.sort((a, b) => a.order - b.order);
      return { ...book, entries, entryCount: entries.length };
    }) };
  }

  function currentBook() {
    const book = data.books.find((item) => item.id === bookSelect.value) || data.books[0];
    const cycleId = String(book?.id || "").replace(/\.5$/, "");
    const themedCycle = ["c1", "c2", "c3", "c4", "c5"].includes(cycleId) ? cycleId : "";
    if (document.body.dataset.cycle !== themedCycle) document.body.dataset.cycle = themedCycle;
    window.ATO_CYCLE_SYMBOLS?.setBrandMark(storyMark, cycleId, "../");
    document.querySelectorAll("[data-cycle-link]").forEach((link) => {
      const url = new URL(link.getAttribute("href"), window.location.href);
      if (cycleId) url.searchParams.set("cycle", cycleId);
      link.href = url.href;
    });
    return book;
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
      // 回忆突破的章节键各循环不一致（c2 是单数 mnemos-breakthrough），
      // 主控台和地图提醒都按复数写：用前缀别名落到当前故事书自己的那章。
      "mnemos": "mnemos-",
      "mnemos-breakthrough": "mnemos-",
      "mnemos-breakthroughs": "mnemos-",
      "回忆突破": "mnemos-",
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
      return byKey || null;
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

  // 深链里的「短号」：主控台和地图提醒用箱号 / 编号跳转（12、1-2、α、Ω…），
  // 但多数循环的条目 id 是「编号 + slug」——c1 的内蕴奥德赛是 12-the-argonites、
  // c3 的冒险中枢是 1-2-turf-laws、c1 的 α 箱子更是只写在标题里。
  // 精确 id 查不到时按 id 前缀、再按标题前缀在指定章节内匹配；缺了这一层，
  // 深链会静默回落到该章第一条（表现就是「按钮不跟着进度跳」）。
  function normalizeShortIdValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[\s_]+/g, "-")
      .replace(/[|｜()（）?:!,.，。！？：；、]/g, "");
  }

  function normalizeShortIdTitle(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[|｜()（）?:!,.，。！？：；、]/g, " ")
      .replace(/\s+/g, " ");
  }

  function entriesByShortId(book, id, options = {}) {
    const value = normalizeShortIdValue(id);
    if (!value || /^m\d+$/.test(value)) return [];
    // 只在明确知道章节时兜底：否则「12」这类短号可能命中别的模块。
    const chapterKey = "chapterKey" in options
      ? options.chapterKey
      : (activeEntry?.chapterKey || (selectedChapterKey() === "all" ? "" : selectedChapterKey()));
    if (!chapterKey || chapterKey === "all") return [];
    const scoped = book.entries.filter((entry) => entry.chapterKey === chapterKey);

    const idMatches = scoped.filter((entry) => normalizeShortIdValue(entry.id).startsWith(`${value}-`));
    if (idMatches.length) {
      // c1 冒险中枢把编号写重复了（1-2 → 1-2-1-2-the-pilgrimage-family），
      // 优先取编号后面直接接 slug 的那个，避免命中最短却不相干的 id。
      const slugFirst = idMatches.filter((entry) => !/^\d/.test(normalizeShortIdValue(entry.id).slice(value.length + 1)));
      return (slugFirst.length ? slugFirst : idMatches)
        .slice()
        .sort((a, b) => String(a.id).length - String(b.id).length || a.order - b.order);
    }

    return scoped
      .filter((entry) => {
        const title = normalizeShortIdTitle(entry.title);
        return title === value || title.startsWith(`${value} `);
      })
      .sort((a, b) => String(a.title).length - String(b.title).length || a.order - b.order);
  }

  function hasEntryContent(entry) {
    return !!String(entry?.text || "").trim() || (Array.isArray(entry?.links) && entry.links.length > 0);
  }

  function preferEntriesWithContent(entries) {
    if (!entries.length) return entries;
    return entries.slice().sort((a, b) => {
      const aHasContent = hasEntryContent(a) ? 0 : 1;
      const bHasContent = hasEntryContent(b) ? 0 : 1;
      return aHasContent - bHasContent || a.order - b.order;
    });
  }

  function preferredEntry(book, id, options = {}) {
    let matches = preferEntriesWithContent(entriesById(book, id));
    if (!matches.length) matches = preferEntriesWithContent(entriesByShortId(book, id, options));
    if (!matches.length) return null;

    if (options.bookId && options.bookId !== book.id) return null;

    if (options.chapterHint === "main") {
      const mainMatch = matches.find((entry) => entry.chapterKey === "main");
      if (mainMatch) return mainMatch;
    }

    if (options.entryKey) {
      const exact = matches.find((entry) => entry.key === options.entryKey);
      return exact || null;
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
      const ids = [...new Set([q, q.padStart(4, "0")])];
      const exactInScope = scopedEntries.filter((entry) => ids.includes(entry.id));
      if (exactInScope.length) return preferEntriesWithContent(sortForCurrentContext(exactInScope));
      return preferEntriesWithContent(sortForCurrentContext(book.entries.filter((entry) => ids.includes(entry.id))));
    }

    if (/^M\d+$/i.test(q)) {
      return sortForCurrentContext(entriesById(book, q.toUpperCase()));
    }

    return scopedEntries
      .filter((entry) => {
        const correctedTitle = entry.chapterKey === "dreams-of-pharos" ? storyTitleText(entry) : "";
        const haystack = `${entry.id} ${entry.title} ${correctedTitle} ${entry.englishTitle || ""} ${entry.chapter} ${entry.encounter || ""} ${entry.section || ""} ${entry.text} ${entry.originalText || ""}`.toLowerCase();
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
      const title = entry.chapterKey === "dreams-of-pharos"
        ? storyTitleText(entry)
        : `${entry.id} · ${entry.title || "故事段落"}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `result-item${activeEntry && entry.key === activeEntry.key ? " active" : ""}`;
      button.innerHTML = `
        <span class="result-id">${escapeHtml(title)}</span>
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
        cloud: {
          ...defaultTtsConfig.cloud,
          ...(saved.cloud || {}),
          xfyun: { ...defaultTtsConfig.cloud.xfyun, ...((saved.cloud || {}).xfyun || {}) },
        },
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
      <div id="ttsQuickConfig" class="tts-quick-config" aria-label="朗读设置"></div>
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

    const quickConfig = statusBox.querySelector("#ttsQuickConfig");
    const engineField = document.createElement("label");
    engineField.className = "tts-quick-field";
    engineField.innerHTML = "<span>朗读方式</span>";
    engineField.append(engineSelect);
    const voiceField = document.createElement("label");
    voiceField.className = "tts-quick-field";
    voiceField.innerHTML = "<span>音色</span>";
    voiceField.append(ttsVoice);
    quickConfig.append(engineField, voiceField);
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
    if (cloudProvider() === "xfyun") {
      const xf = ttsConfig.cloud.xfyun || {};
      const name = xf.voiceLabel || xf.vcn || "动态音色";
      if (!isXfyunConfigured(xf)) return "云端 API·讯飞 [未配置账号]";
      return `云端 API·讯飞 [${name}]`;
    }
    if (ttsConfig.cloud.voiceCloneDataUrl) return "云端 API [已导入克隆音色]";
    return `云端 API [${ttsConfig.cloud.voice || "动态音色"}]`;
  }

  function renderTtsStatus() {
    const title = document.querySelector("#ttsStatusTitle");
    const toggle = document.querySelector("#ttsStatusToggle");
    const body = document.querySelector("#ttsStatusBody");
    const box = document.querySelector("#ttsStatusBox");
    if (!title || !toggle || !body) return;

    const collapsed = Boolean(ttsConfig.statusCollapsed);
    // 收起后整块缩到只剩这一个按钮：标题和「引擎配置」一起藏起来。
    if (box) box.classList.toggle("collapsed", collapsed);
    title.textContent = `TTS 状态 | ${getEngineStatusLabel()}`;
    toggle.textContent = collapsed ? "展开" : "收起";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    body.hidden = collapsed;
    if (collapsed) return;

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

  function updateSpeechControls() {
    ttsButton.textContent = isSpeaking ? "停止" : "朗读";
    if (!ttsPauseButton) return;
    ttsPauseButton.hidden = !isSpeaking;
    ttsPauseButton.textContent = isSpeechPaused ? "继续" : "暂停";
    ttsPauseButton.title = isSpeechPaused ? "继续朗读" : "暂停朗读";
    ttsPauseButton.setAttribute("aria-pressed", String(isSpeechPaused));
  }

  function beginSpeech() {
    isSpeaking = true;
    isSpeechPaused = false;
    updateSpeechControls();
  }

  function applyPendingSpeechPause() {
    if (!isSpeechPaused) return;
    if (activeAudio && !activeAudio.paused) activeAudio.pause();
    if (window.speechSynthesis && !window.speechSynthesis.paused) window.speechSynthesis.pause();
  }

  function toggleSpeechPause() {
    if (!isSpeaking) return;
    isSpeechPaused = !isSpeechPaused;
    if (activeAudio) {
      if (isSpeechPaused) activeAudio.pause();
      else activeAudio.play().catch((error) => {
        pushTtsStatus(`继续朗读失败：${String(error.message || error)}`, "error");
      });
    } else if (window.speechSynthesis) {
      if (isSpeechPaused) window.speechSynthesis.pause();
      else window.speechSynthesis.resume();
    }
    updateSpeechControls();
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
    // 民间离线包不能用于官方正文；讯飞聆伯松包按官方版生成，清单里带 official 标记，官方版可用。
    if (storyVersion === "官方版" && supportsOfficialVersion()) {
      const packs = typeof offlineAudioPacks === "undefined" ? [] : offlineAudioPacks;
      const pack = packs.find((item) => item.id === ttsConfig.offlineAudioPack) || packs[0];
      if (!(storyAudioManifest?.official || pack?.official)) return null;
    }
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
      audio.play().then(applyPendingSpeechPause).catch(reject);
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

    beginSpeech();
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
    isSpeechPaused = false;
    updateSpeechControls();
  }

  const localBattleImages = [
    {
      test: /midascore-battle/i,
      images: [
        "./images/battles/c4/midascore-battle-level-1.jpg",
        "./images/battles/c4/midascore-battle-level-2-plus.jpg",
      ],
    },
    {
      test: /demidjinn-battle/i,
      images: ["./images/battles/c4/demidjinn-battle.jpg"],
    },
    {
      test: /pandora-horizon-battle/i,
      images: ["./images/battles/c4/pandora-horizon-battle.jpg"],
    },
    {
      test: /the-crash-battle/i,
      images: ["./images/battles/c4/the-crash-battle.jpg"],
    },
    {
      test: /reap-the-whirlwind-battle/i,
      images: ["./images/battles/c4/reap-the-whirlwind-battle.jpg"],
    },
    {
      test: /the-winnowing-battle/i,
      images: ["./images/battles/c4/the-winnowing-battle.jpg"],
    },
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
      .replace(/【官方版待校核】\s*以下为官方版草稿，尚未完成\s*PDF\s*校核。/g, " ")
      .replace(/（[^（）]*）/g, " ")
      .replace(/\([^()]*\)/g, " ")
      .replace(/【[^【】]*】/g, " ")
      .replace(/\[[^\[\]]*\]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
      .trim();
  }

  function renderBattleImages(entry, options = {}) {
    const aibpLink = options.includeAibpLink === false ? "" : battleAibpLink(entry);
    const imageList = Array.isArray(entry.imageList) && entry.imageList.length
      ? entry.imageList
      : localBattleImageList(entry);
    if (imageList.length) {
      const isSourcePage = Boolean(entry.supplementSource || entry.originalText);
      const images = imageList.map((src, index) => {
        const viewerAttributes = isSourcePage
          ? ` data-page-viewer tabindex="0" role="button" title="点击放大查看原书页"`
          : "";
        const viewerClass = isSourcePage ? " zoomable-page" : "";
        return `<img class="battle-page${viewerClass}" src="${escapeHtml(src)}" alt="${escapeHtml(entry.title)} ${index + 1}"${viewerAttributes} onerror="this.remove()">`;
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

  function clampPageViewerScale(scale) {
    return Math.min(5, Math.max(0.5, scale));
  }

  function updatePageViewerTransform() {
    if (!pageViewer) return;
    const image = pageViewer.querySelector(".page-viewer-image");
    const zoomLabel = pageViewer.querySelector("[data-page-viewer-zoom]");
    image.style.transform = `translate3d(${pageViewerState.offsetX}px, ${pageViewerState.offsetY}px, 0) scale(${pageViewerState.scale})`;
    image.classList.toggle("is-pannable", pageViewerState.scale > 1);
    zoomLabel.textContent = `${Math.round(pageViewerState.scale * 100)}%`;
  }

  function resetPageViewerTransform() {
    pageViewerState.scale = 1;
    pageViewerState.offsetX = 0;
    pageViewerState.offsetY = 0;
    updatePageViewerTransform();
  }

  function setPageViewerImage(index) {
    if (!pageViewerState.images.length || !pageViewer) return;
    pageViewerState.index = (index + pageViewerState.images.length) % pageViewerState.images.length;
    const source = pageViewerState.images[pageViewerState.index];
    const image = pageViewer.querySelector(".page-viewer-image");
    const counter = pageViewer.querySelector("[data-page-viewer-counter]");
    image.src = source.src;
    image.alt = source.alt || "原书扫描页";
    counter.textContent = `${pageViewerState.index + 1} / ${pageViewerState.images.length}`;
    pageViewer.querySelectorAll("[data-page-viewer-nav]").forEach((button) => {
      button.hidden = pageViewerState.images.length < 2;
    });
    resetPageViewerTransform();
  }

  function closePageViewer() {
    if (!pageViewer || pageViewer.hidden) return;
    pageViewer.hidden = true;
    pageViewerState.pointerId = null;
    document.body.style.overflow = pageViewerState.previousBodyOverflow;
  }

  function ensurePageViewer() {
    if (pageViewer) return pageViewer;

    pageViewer = document.createElement("div");
    pageViewer.className = "page-viewer";
    pageViewer.hidden = true;
    pageViewer.innerHTML = `
      <div class="page-viewer-dialog" role="dialog" aria-modal="true" aria-label="原书扫描页放大查看">
        <div class="page-viewer-toolbar">
          <div class="page-viewer-title">原书扫描页 <span data-page-viewer-counter></span></div>
          <div class="page-viewer-controls">
            <button type="button" data-page-viewer-nav="previous" title="上一页" aria-label="上一页">‹</button>
            <button type="button" data-page-viewer-action="out" title="缩小" aria-label="缩小">−</button>
            <button type="button" data-page-viewer-action="reset" title="恢复适合窗口大小" aria-label="恢复适合窗口大小">
              <span data-page-viewer-zoom>100%</span>
            </button>
            <button type="button" data-page-viewer-action="in" title="放大" aria-label="放大">＋</button>
            <button type="button" data-page-viewer-nav="next" title="下一页" aria-label="下一页">›</button>
            <button class="page-viewer-close" type="button" data-page-viewer-action="close" title="关闭" aria-label="关闭">×</button>
          </div>
        </div>
        <div class="page-viewer-stage">
          <img class="page-viewer-image" alt="">
        </div>
        <div class="page-viewer-help">滚轮缩放 · 放大后拖动查看 · Esc 关闭</div>
      </div>
    `;
    document.body.appendChild(pageViewer);

    pageViewer.addEventListener("click", (event) => {
      if (event.target === pageViewer) {
        closePageViewer();
        return;
      }
      const actionButton = event.target.closest("[data-page-viewer-action]");
      if (actionButton) {
        const action = actionButton.dataset.pageViewerAction;
        if (action === "close") closePageViewer();
        if (action === "reset") resetPageViewerTransform();
        if (action === "in" || action === "out") {
          const direction = action === "in" ? 0.25 : -0.25;
          pageViewerState.scale = clampPageViewerScale(pageViewerState.scale + direction);
          if (pageViewerState.scale <= 1) {
            pageViewerState.offsetX = 0;
            pageViewerState.offsetY = 0;
          }
          updatePageViewerTransform();
        }
        return;
      }
      const navButton = event.target.closest("[data-page-viewer-nav]");
      if (navButton) {
        const direction = navButton.dataset.pageViewerNav === "next" ? 1 : -1;
        setPageViewerImage(pageViewerState.index + direction);
      }
    });

    const stage = pageViewer.querySelector(".page-viewer-stage");
    stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 0.2 : -0.2;
      pageViewerState.scale = clampPageViewerScale(pageViewerState.scale + direction);
      if (pageViewerState.scale <= 1) {
        pageViewerState.offsetX = 0;
        pageViewerState.offsetY = 0;
      }
      updatePageViewerTransform();
    }, { passive: false });

    stage.addEventListener("pointerdown", (event) => {
      if (pageViewerState.scale <= 1) return;
      pageViewerState.pointerId = event.pointerId;
      pageViewerState.dragX = event.clientX - pageViewerState.offsetX;
      pageViewerState.dragY = event.clientY - pageViewerState.offsetY;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add("is-dragging");
    });
    stage.addEventListener("pointermove", (event) => {
      if (pageViewerState.pointerId !== event.pointerId) return;
      pageViewerState.offsetX = event.clientX - pageViewerState.dragX;
      pageViewerState.offsetY = event.clientY - pageViewerState.dragY;
      updatePageViewerTransform();
    });
    const endPageDrag = (event) => {
      if (pageViewerState.pointerId !== event.pointerId) return;
      pageViewerState.pointerId = null;
      stage.classList.remove("is-dragging");
    };
    stage.addEventListener("pointerup", endPageDrag);
    stage.addEventListener("pointercancel", endPageDrag);

    document.addEventListener("keydown", (event) => {
      if (!pageViewer || pageViewer.hidden) return;
      if (event.key === "Escape") closePageViewer();
      if (event.key === "ArrowLeft" && pageViewerState.images.length > 1) {
        setPageViewerImage(pageViewerState.index - 1);
      }
      if (event.key === "ArrowRight" && pageViewerState.images.length > 1) {
        setPageViewerImage(pageViewerState.index + 1);
      }
    });

    return pageViewer;
  }

  function openPageViewer(target) {
    const gallery = target.closest(".supplement-gallery");
    const images = gallery
      ? Array.from(gallery.querySelectorAll("[data-page-viewer]"))
      : [target];
    if (!images.length) return;

    ensurePageViewer();
    pageViewerState.images = images.map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt,
    }));
    pageViewerState.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    pageViewer.hidden = false;
    setPageViewerImage(Math.max(0, images.indexOf(target)));
    pageViewer.querySelector(".page-viewer-close").focus();
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
    if (!entityBiosEnabled) return;
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
    const haystack = [
      entry.id,
      entry.key,
      entry.title,
      entry.encounterKey,
      entry.encounter,
      entry.section,
    ].filter(Boolean).join(" ").toLowerCase();
    const targets = [
      {
        test: /ambush|伏击/,
        links: [
          { apostle: "HEKATON", label: "百臂巨人 AIBP" },
          { apostle: "LABYRINTHAUROS", label: "迷宫机牛 AIBP" },
        ],
      },
      { test: /midascore|迈达狮|米达斯核/, apostle: "MIDASCORE", label: "米达斯核 AIBP" },
      { test: /demidjinn|半神迪精|半神灯/, apostle: "DEMIDJINN", label: "半神灯 AIBP" },
      { test: /pandora-horizon|pandora horizon|潘多拉视界|the-crash|the crash|撞击之战|babelian|巴比伦疯塔|巴别疯癫/, apostle: "THE_BABELIAN_LUNACY", label: "巴别疯癫 AIBP" },
      { test: /reap-the-whirlwind|reap the whirlwind|收割旋风|the-winnowing|the winnowing|扬谷之战|dahaka|达哈卡/, apostle: "DAHAKA", label: "达哈卡 AIBP" },
      { test: /dragon-of-phobos|dragon of phobos|深海惧龙|恐惧之龙/, apostle: "DRAGON_OF_PHOBOS", label: "恐惧之龙 AIBP" },
      { test: /meduketos|须目|梅杜克托斯/, apostle: "MEDUKETOS", label: "梅杜克托斯 AIBP" },
      { test: /harsh-truth|harsh truth|严酷真相|white-lie|white lie|白色谎言|ur-fleece|ur fleece|乌尔-?弗里斯|乌尔羊毛/, apostle: "UR_FLEECE", label: "乌尔羊毛 AIBP" },
      { test: /the-devil-himself|the devil himself|魔鬼本人|thicker-than-water|thicker than water|血浓于水|titan-x|titan x|泰坦 ?x/, apostle: "TITAN_X", label: "泰坦 X AIBP" },
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
      return `<a class="battle-aibp-button" href="${href}" target="_blank" rel="noopener noreferrer">打开${escapeHtml(link.label)}</a>`;
    }).join("");
    return `<div class="battle-aibp-action">${buttons}</div>`;
  }

  // 隐藏战斗的引入段落只提示 BOSS 搜索入口，不直接开启战斗。
  const ENVELOPE_AIBP_HINTS = {
    helios: {
      label: "赫利俄斯 AIBP",
      text: "在 AIBP 的 BOSS 搜索框里输入「赫利俄斯」，即可打开隐藏的赫利俄斯 AIBP。",
    },
    blackbeak: {
      label: "Black Beak（黑喙）AIBP",
      text: "在 AIBP 的 BOSS 搜索框里输入「Black Beak」或「黑喙」并提交搜索，按提示确认后即可开启隐藏的黑喙 AIBP。",
    },
    "titan-x-group": {
      label: "万事皆休 AIBP",
      text: "在 AIBP 的 BOSS 搜索框里输入「万事皆休」并提交搜索，即可开启三台泰坦 X 的隐藏战斗。",
    },
  };
  const ENVELOPE_AIBP_TARGETS = {
    "c5:0199": "helios",
    "c5:1099": "blackbeak",
    "c5:2803": "blackbeak",
    "c5:7539": "titan-x-group",
  };

  function envelopeAibpLink(entry, bookId = "") {
    const hintKey = ENVELOPE_AIBP_TARGETS[`${bookId}:${String(entry?.id || "")}`];
    const hint = ENVELOPE_AIBP_HINTS[hintKey];
    if (!hint) return "";
    return `<div class="battle-aibp-action envelope-aibp-action" data-envelope-aibp><button class="battle-aibp-button" type="button" data-aibp-hint="${hintKey}">${hint.label}</button></div>`;
  }

  function envelopeAibpHintLayer() {
    let layer = document.getElementById("envelopeAibpHint");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = "envelopeAibpHint";
    layer.className = "aibp-hint-layer";
    layer.hidden = true;
    layer.innerHTML = `
      <div class="aibp-hint-box" role="alertdialog" aria-modal="true" aria-labelledby="envelopeAibpHintText">
        <p id="envelopeAibpHintText"></p>
        <button type="button" class="aibp-hint-close">知道了</button>
      </div>
    `;
    layer.addEventListener("click", (event) => {
      if (event.target === layer || event.target.closest(".aibp-hint-close")) {
        layer.hidden = true;
      }
    });
    document.body.appendChild(layer);
    return layer;
  }

  function showEnvelopeAibpHint(hintKey) {
    const hint = ENVELOPE_AIBP_HINTS[hintKey];
    if (!hint) return;
    const layer = envelopeAibpHintLayer();
    const text = layer.querySelector("#envelopeAibpHintText");
    if (text) text.textContent = hint.text;
    layer.hidden = false;
    const close = layer.querySelector(".aibp-hint-close");
    if (close) close.focus();
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
    isSpeechPaused = false;
    updateSpeechControls();
  }

  function speakWithBrowser(text, token, options = {}) {
    if (!window.speechSynthesis) return Promise.reject(new Error("当前浏览器不支持原生语音"));
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    if (!cleanText) return Promise.resolve();

    return new Promise((resolve) => {
      pushTtsStatus("浏览器原生语音朗读中。", "info");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      configureUtterance(utterance);

      let remainingTimeoutMs = Math.max(10000, (cleanText.length * 400) / Math.max(ttsConfig.rate || 1, 0.1));
      let timeoutCheckedAt = Date.now();
      const fallbackTimer = window.setInterval(() => {
        const now = Date.now();
        if (!isSpeechPaused) remainingTimeoutMs -= now - timeoutCheckedAt;
        timeoutCheckedAt = now;
        if (remainingTimeoutMs > 0) return;
        window.clearInterval(fallbackTimer);
        window.speechSynthesis.cancel();
        pushTtsStatus("浏览器语音长时间无响应，已停止本次朗读。", "warn");
        finishSpeech(token, options.keepActive);
        resolve();
      }, 500);

      utterance.onend = () => {
        window.clearInterval(fallbackTimer);
        finishSpeech(token, options.keepActive);
        resolve();
      };
      utterance.onerror = (event) => {
        window.clearInterval(fallbackTimer);
        if (event.error !== "canceled") pushTtsStatus(`浏览器语音错误：${event.error || "未知错误"}`, "error");
        finishSpeech(token, options.keepActive);
        resolve();
      };

      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
      applyPendingSpeechPause();
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

  // ---------- 讯飞在线语音合成（WebSocket） ----------

  function cloudProvider(conf = ttsConfig.cloud) {
    return (conf && conf.provider) || "mimo";
  }

  // 注意：签名结果是任意二进制，必须按字节做 base64，
  // 不能先当 UTF-8 文本再编码，否则高位字节会被改写、签名失效。
  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function utf8ToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }

  // ---- 纯 JS 的 SHA-256 / HMAC-SHA256（无 crypto.subtle 时使用）----
  // crypto.subtle 只在“安全上下文”里存在：https、localhost、file:// 有，
  // 而本应用按设计跑在 http://<局域网IP>:8793/ 上 —— 那里 window.crypto.subtle
  // 是 undefined，所以只用 Web Crypto 会让讯飞合成在局域网地址上必然失败。
  // 下面这份实现让签名在任何上下文都能算出来；有 subtle 时仍优先用原生实现。
  const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function rotateRight32(value, bits) {
    return ((value >>> bits) | (value << (32 - bits))) >>> 0;
  }

  function sha256Bytes(bytes) {
    const length = bytes.length;
    const paddedLength = Math.ceil((length + 9) / 64) * 64;
    const buffer = new Uint8Array(paddedLength);
    buffer.set(bytes);
    buffer[length] = 0x80;
    const view = new DataView(buffer.buffer);
    // 位长度写成 64 位大端：高位用除法取，低位交给 >>> 0，避免 32 位移位丢位。
    view.setUint32(paddedLength - 8, Math.floor((length * 8) / 4294967296), false);
    view.setUint32(paddedLength - 4, (length * 8) >>> 0, false);

    const h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotateRight32(w[i - 15], 7) ^ rotateRight32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotateRight32(w[i - 2], 17) ^ rotateRight32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (let i = 0; i < 64; i += 1) {
        const sum1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
        const choose = (e & f) ^ (~e & g);
        const temp1 = (hh + sum1 + choose + SHA256_K[i] + w[i]) >>> 0;
        const sum0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sum0 + majority) >>> 0;
        hh = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, h[i], false);
    return out;
  }

  function hmacSha256Bytes(keyBytes, messageBytes) {
    const blockSize = 64;
    const key = keyBytes.length > blockSize ? sha256Bytes(keyBytes) : keyBytes;
    const innerPad = new Uint8Array(blockSize + messageBytes.length);
    const outerPad = new Uint8Array(blockSize + 32);
    for (let i = 0; i < blockSize; i += 1) {
      const byte = i < key.length ? key[i] : 0;
      innerPad[i] = byte ^ 0x36;
      outerPad[i] = byte ^ 0x5c;
    }
    innerPad.set(messageBytes, blockSize);
    outerPad.set(sha256Bytes(innerPad), blockSize);
    return sha256Bytes(outerPad);
  }

  async function hmacSha256Base64(secret, message) {
    const encoder = new TextEncoder();
    if (window.crypto?.subtle) {
      const key = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await window.crypto.subtle.sign("HMAC", key, encoder.encode(message));
      return bytesToBase64(new Uint8Array(signature));
    }
    // 明文 HTTP（局域网地址）下没有 crypto.subtle：用上面的纯 JS 实现，
    // 结果与 Web Crypto 逐字节一致（tools/test-story-tts-xfyun.cjs 会比对）。
    return bytesToBase64(hmacSha256Bytes(encoder.encode(secret), encoder.encode(message)));
  }

  async function buildXfyunAuthUrl(host, path, apiKey, apiSecret) {
    const date = new Date().toUTCString();
    // WebSocket 握手是 GET，签名里的请求行必须与之一致。
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const signature = await hmacSha256Base64(apiSecret, signatureOrigin);
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const query = new URLSearchParams({
      host,
      date,
      authorization: utf8ToBase64(authorizationOrigin),
    });
    return `wss://${host}${path}?${query.toString()}`;
  }

  function isXfyunConfigured(xf) {
    return Boolean(xf && xf.appId && xf.apiKey && xf.apiSecret);
  }

  function synthesizeXfyunOnline(text, conf) {
    const xf = conf.xfyun || {};
    if (!isXfyunConfigured(xf)) {
      return Promise.reject(new Error("讯飞未配置 AppID / APIKey / APISecret"));
    }
    const timeoutMs = Number(xf.timeout || conf.timeout || 60000);
    const path = "/v2/tts";

    return buildXfyunAuthUrl(xf.host || "tts-api.xfyun.cn", path, xf.apiKey, xf.apiSecret)
      .then((url) => new Promise((resolve, reject) => {
        let socket;
        try {
          socket = new WebSocket(url);
        } catch (error) {
          reject(new Error(`无法建立讯飞连接：${String(error.message || error)}`));
          return;
        }

        const pieces = [];
        let settled = false;
        const timer = window.setTimeout(() => {
          done(new Error("讯飞合成超时"));
        }, timeoutMs);

        function done(error, blob) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          try {
            socket.close();
          } catch {
            // 忽略关闭异常
          }
          if (error) reject(error);
          else resolve(blob);
        }

        socket.onopen = () => {
          socket.send(JSON.stringify({
            common: { app_id: xf.appId },
            business: {
              aue: "lame",
              sfl: 1,
              auf: `audio/L16;rate=${Number(xf.sampleRate) || 16000}`,
              vcn: xf.vcn || "x4_xiaoyan",
              tte: "UTF8",
              speed: Number(xf.speed ?? 50),
              volume: Number(xf.volume ?? 50),
              pitch: Number(xf.pitch ?? 50),
            },
            data: { status: 2, text: utf8ToBase64(text) },
          }));
        };

        socket.onmessage = (event) => {
          let frame;
          try {
            frame = JSON.parse(typeof event.data === "string" ? event.data : "");
          } catch {
            done(new Error("讯飞返回了无法解析的数据"));
            return;
          }
          if (Number(frame.code) !== 0) {
            const hint = String(frame.code) === "11200"
              ? "（服务或发音人未授权，请到讯飞控制台开通）"
              : "";
            done(new Error(`讯飞错误 ${frame.code}：${frame.message || ""}${hint}`));
            return;
          }
          const audio = frame?.data?.audio;
          if (typeof audio === "string" && audio.length) {
            pieces.push(decodeBase64Audio(audio));
          }
          if (Number(frame?.data?.status) === 2) {
            if (!pieces.length) {
              done(new Error("讯飞没有返回音频数据"));
              return;
            }
            done(null, new Blob(pieces, { type: "audio/mpeg" }));
          }
        };

        socket.onerror = () => {
          done(new Error("讯飞连接失败：请检查网络，或 AppID / APIKey / APISecret 是否正确"));
        };

        socket.onclose = (event) => {
          if (!settled) {
            done(new Error(`讯飞连接提前关闭（code=${event.code}）`));
          }
        };
      }));
  }

  async function speakWithXfyun(text, token, conf, options = {}) {
    const xf = conf.xfyun || {};
    const label = `${xf.voiceLabel || xf.vcn || "讯飞音色"}`;
    try {
      pushTtsStatus(`[云端·讯飞] 请求中：${label}`, "pending");
      const blob = await synthesizeXfyunOnline(text, conf);
      if (token !== activeSpeechToken) return true;
      pushTtsStatus(`[云端·讯飞] 连接成功：${label}`, "success");
      await playAudioBlob(blob, token, options.keepActive);
      return true;
    } catch (error) {
      clearActiveAudio();
      if (token === activeSpeechToken) currentUtterance = null;
      const message = String(error?.message || error);
      console.error("[Story TTS] xfyun request failed", error);
      pushTtsStatus(`云端·讯飞请求失败：${message.slice(0, 120)}`, /未授权|11200|鉴权|签名/i.test(message) ? "error" : "warn");
      return false;
    }
  }

  async function speakWithExternal(text, token, engineType, overrides = null, options = {}) {
    const isCloud = engineType === "cloud";
    const conf = overrides || (isCloud ? ttsConfig.cloud : ttsConfig.local);
    if (isCloud && cloudProvider(conf) === "xfyun") {
      return speakWithXfyun(text, token, conf, options);
    }
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
          applyPendingSpeechPause();
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
    if (isCloud && cloudProvider(conf) === "xfyun") {
      const blob = await synthesizeXfyunOnline(text, conf);
      if (token !== null && token !== activeSpeechToken) throw new Error("朗读已停止");
      return blob;
    }
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
    if (isCloud && cloudProvider(conf) === "xfyun") {
      const xf = conf.xfyun || {};
      return [
        ttsConfig.activeEngine,
        "xfyun",
        xf.host || "",
        xf.vcn || "",
        xf.speed ?? "",
        xf.volume ?? "",
        xf.pitch ?? "",
        text,
      ].join("\u001f");
    }
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
    const targets = collectLikelyJumpIds(getDisplayEntry(entry))
      .map((id) => preferredEntry(book, id, {
        chapterKey: entry.chapterKey,
        encounterKey: entry.encounterKey,
      }))
      .filter(Boolean)
      .filter((target, index, array) => array.findIndex((item) => item.key === target.key) === index)
      .slice(0, 6);

    targets.forEach((target) => {
      const chunks = createSpeechChunks(prepareSpeechText(getSpeechEntryText(target))).slice(0, 5);
      chunks.forEach((chunk) => {
        getExternalAudioJob(chunk).catch(() => {});
      });
    });
    if (targets.length) pushTtsStatus(`已预读取 ${targets.length} 个可能跳转段落。`, "info");
  }

  function prewarmEntryStart(entry) {
    if (!(ttsConfig.activeEngine === "cloud" || ttsConfig.activeEngine === "local")) return;
    if (storyAudioManifest || hasCachedEntryAudio(entry)) return;
    const chunks = createSpeechChunks(prepareSpeechText(getSpeechEntryText(entry))).slice(0, 5);
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
    beginSpeech();

    const isXfyun = cloudProvider() === "xfyun";
    const originalVoice = ttsConfig.cloud.voice;
    const originalXfyunVcn = ttsConfig.cloud.xfyun?.vcn;
    const sampleText = "这是故事书语音试听。愿你的航程顺利，选择清晰。";
    const voiceList = isXfyun ? xfyunPresetVoices.map((voice) => voice.vcn) : cloudPresetVoices;

    try {
      for (const voice of voiceList) {
        if (token !== activeSpeechToken) return;
        if (isXfyun) {
          ttsConfig.cloud.xfyun.vcn = voice;
          pushTtsStatus(`试听音色：${voice}`, "info");
        } else {
          ttsConfig.cloud.voice = voice;
          pushTtsStatus(`试听音色：${voice}`, "info");
        }
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
      if (isXfyun && ttsConfig.cloud.xfyun) ttsConfig.cloud.xfyun.vcn = originalXfyunVcn;
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
      audio.play().then(applyPendingSpeechPause).catch(reject);
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
    beginSpeech();

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
    const displayEntry = getDisplayEntry(entry);
    const isTranslatedSupplement = Boolean(displayEntry.originalText);
    const imagesHtml = renderBattleImages(displayEntry, {
      includeAibpLink: !isTranslatedSupplement,
    });
    const html = isTranslatedSupplement
      ? renderAiTranslatedSupplement(displayEntry, imagesHtml)
      : displayEntry.html
      ? renderHtmlStory(displayEntry, imagesHtml)
      : displayEntry.chapterKey === "battle"
      ? renderBattleSectionedStory(displayEntry, imagesHtml)
      : displayEntry.chapterKey === "special-aftermath"
        ? renderSectionedStory(displayEntry, imagesHtml)
        : `${linkify(displayEntry.text, currentBook())}${imagesHtml ? `<div class="battle-gallery">${imagesHtml}</div>` : ""}`;
    const envelopeLink = isTranslatedSupplement ? "" : envelopeAibpLink(displayEntry, entryBookId(displayEntry));
    storyText.innerHTML = html + envelopeLink + renderOfficialScan(entry);
    annotateEntityTextNodes(storyText);
    refreshSecondScreenStoryContentToggle(Boolean(secondScreenStoryModeToggle?.checked));
  }

  function activeOfficialScan(entry = activeEntry) {
    if (!entry || storyVersion !== "官方版" || !supportsOfficialVersion()) return null;
    return officialEntries.get(`${currentBook()?.id}:${entry.key}`)?.officialScan || null;
  }

  // 声明了扫描图不等于本机真有这张图：加载失败过的条目一律按「没有扫描图」处理。
  function officialScanMissingLocally(entry = activeEntry) {
    return missingOfficialScans.has(`${currentBook()?.id}:${entry?.key}`);
  }

  function refreshSecondScreenStoryContentToggle(storyMode = false) {
    if (!secondScreenStoryContentLabel || !secondScreenStoryContentToggle) return;
    const officialVersion = storyVersion === "官方版" && supportsOfficialVersion();
    secondScreenStoryContentLabel.hidden = !officialVersion;
    if (!officialVersion) {
      secondScreenStoryContentToggle.disabled = true;
      secondScreenStoryContentLabel.classList.remove("disabled");
      secondScreenStoryContentLabel.title = "";
      return;
    }

    const scan = activeOfficialScan();
    const missingLocally = officialScanMissingLocally();
    const hasScan = Boolean(scan?.src) && !missingLocally;
    secondScreenStoryContentToggle.checked = hasScan && secondScreenStoryImagesPreference;
    secondScreenStoryContentToggle.disabled = !storyMode || !hasScan;
    secondScreenStoryContentLabel.classList.toggle("disabled", !storyMode || !hasScan);
    secondScreenStoryContentLabel.title = !scan?.src
      ? "当前官方条目没有对应的扫描图，只能显示官方正文"
      : missingLocally
        ? "本机没有这张原书扫描图，第二屏会改为显示官方正文"
        : storyMode
          ? SECOND_SCREEN_STORY_CONTENT_TITLE
          : "请先开启第二屏故事文本模式，再切换图片或文字";
  }

  function toggleSecondScreenStoryContent() {
    if (!secondScreenStoryContentToggle || secondScreenStoryContentToggle.disabled) return;
    secondScreenStoryImagesPreference = secondScreenStoryContentToggle.checked;
    try {
      localStorage.setItem(
        "ato-second-screen-story-content-v1",
        secondScreenStoryImagesPreference ? "image" : "text"
      );
    } catch {
      // 浏览器隐私模式可能禁止 localStorage；本次切换仍需立即同步。
    }
    scheduleSecondScreenStorySnapshot();
  }

  function renderOfficialScan(entry) {
    if (storyVersion !== "官方版" || !supportsOfficialVersion()) return "";
    const scanKey = `${currentBook()?.id}:${entry.key}`;
    const scan = officialEntries.get(scanKey)?.officialScan;
    if (!scan?.src) return officialScanHintHtml("", "该条目暂无对应的官方扫描图。");
    // 已经知道本机没有这张图时不再渲染 img：反复发一个必然失败的请求没有意义。
    if (missingOfficialScans.has(scanKey)) return officialScanHintHtml(scanKey, MISSING_OFFICIAL_SCAN_HINT);
    const note = scan.status === "title-only" ? "（仅定位标题）"
      : scan.status === "page-context" ? "（含完整原页上下文）" : "";
    // 声明了扫描图不等于本地真有这张图：民间版资源包不带原书扫描图，图也可能没跟着
    // 项目走。这一块整体包在 data-supplement-scan 里，图加载失败时由
    // handleStoryImageError 换成同一句说明，而不是留一个破图。
    return `<div class="supplement-scan" data-supplement-scan="${escapeHtml(scanKey)}"><div class="supplement-gallery-hint" data-supplement-scan-hint>官方扫描图${note} · 点击放大查看</div><div class="battle-gallery supplement-gallery"><img class="battle-page zoomable-page" src="${escapeHtml(scan.src)}" alt="${escapeHtml(entry.title)} 官方扫描图" loading="lazy" data-page-viewer tabindex="0" role="button" title="点击放大查看原书页"></div></div>`;
  }

  // 扫描图那一块的提示语：有 data-supplement-scan 属性时就是「这块图加载失败过」的登记键。
  function officialScanHintHtml(scanKey, message) {
    const attribute = scanKey ? ` data-supplement-scan="${escapeHtml(scanKey)}"` : "";
    return `<div class="supplement-scan"${attribute}><div class="supplement-gallery-hint" data-supplement-scan-hint>${message}</div></div>`;
  }

  // 官方扫描图取不到（民间版资源包不带原书扫描图、原书页没跟项目走，或图被删了）时，
  // 把整块扫描图换成说法一致的提示：第二屏那边本来就会退回正文，阅读器这边也不能只剩
  // 一个加载失败的方框。这条还要记下来，否则「第二屏显示原书扫描图」勾选框会一直以为
  // 有图。图片的 error 事件不冒泡，所以监听要开捕获阶段。
  function handleStoryImageError(event) {
    const image = event?.target;
    const block = image?.closest?.("[data-supplement-scan]");
    if (!block) return false;
    const scanKey = block.getAttribute?.("data-supplement-scan") || "";
    if (scanKey) missingOfficialScans.add(scanKey);
    block.outerHTML = officialScanHintHtml(scanKey, MISSING_OFFICIAL_SCAN_HINT);
    refreshSecondScreenStoryContentToggle(Boolean(secondScreenStoryModeToggle?.checked));
    scheduleSecondScreenStorySnapshot();
    return true;
  }

  function supportsOfficialVersion(book = currentBook()) {
    return ["c1", "c2", "c3"].includes(book?.id);
  }

  function getDisplayEntry(entry) {
    if (storyVersion !== "官方版" || !supportsOfficialVersion()) return entry;
    const official = officialEntries.get(`${currentBook()?.id}:${entry.key}`) || {};
    if (!official.officialText?.trim()) {
      return {
        ...entry,
        text: `【官方版暂无正文】\n\n该条目的官方版正文尚未收录。\n来源：${official.officialSource?.pdf || "指定故事书 PDF"}${official.officialSource?.pages?.length ? `，第 ${official.officialSource.pages.join("、")} 页` : ""}`,
        title: official.officialTitle || entry.title,
      };
    }
    const notice = official.officialStatus === "ready" ? "" : "【官方版待校核】以下为官方版草稿，尚未完成 PDF 校核。\n\n";
    return { ...entry, title: official.officialTitle || entry.title, text: notice + official.officialText };
  }

  function buildSecondScreenStorySnapshot() {
    if (!activeEntry) return null;
    const displayEntry = getDisplayEntry(activeEntry);
    const scan = officialEntries.get(`${currentBook()?.id}:${activeEntry.key}`)?.officialScan;
    // 官方版优先让第二屏看官方扫描图，但扫描图不是每个条目都有（官方 PDF 未收录的
    // 条目就没有）。这时必须退回正文，否则第二屏只剩标题、正文一片空白。官方扫描图
    // 开关默认开启；测试或旧嵌入页没有这个控件时也保持原来的默认行为。
    const showOfficialScan = typeof secondScreenStoryContentToggle === "undefined"
      ? true
      : Boolean(secondScreenStoryContentToggle?.checked);
    const imagesOnly = storyVersion === "官方版"
      && supportsOfficialVersion()
      && showOfficialScan
      && Boolean(scan?.src)
      // 本机已经没有这张图（加载失败过）时改发官方正文：别再让第二屏去取一张取不到的图。
      && !officialScanMissingLocally();
    // 快照要给 file://（Android 的 APK 内）和 http://（第二屏）两侧用同一份资源路径，
    // 所以只存应用相对路径：Android 里故事页是 file:///android_asset/web/story/index.html，
    // 直接存 pathname 会带上 /android_asset/web 前缀，第二屏按 HTTP 根去找就变成
    // web/android_asset/web/story/…，而真正的资源键只有 story/data/…。
    let scanPath = "";
    if (imagesOnly) {
      try {
        scanPath = new URL(scan.src, window.location.href).pathname;
      } catch {
        scanPath = "";
      }
      if (scanPath.startsWith("/android_asset/web/")) scanPath = scanPath.slice("/android_asset/web".length);
    }
    const text = imagesOnly ? "" : displayEntry.text || storyText.textContent || "";
    return {
      imagesOnly,
      images: scanPath ? [scanPath] : [],
      // 「只看扫描图」时 text 故意留空（第二屏整屏看图），正文另存一份：扫描图仍然取不到
      // 时第二屏还能退回来显示内容，而不是只剩标题或白屏。其它情况 text 已经带了正文，
      // 不再重复存一遍。
      fallbackText: imagesOnly ? displayEntry.text || storyText.textContent || "" : "",
      bookTitle: currentBook()?.title || "故事书",
      section: sectionLabel.textContent || activeEntry.chapter || "",
      id: activeEntry.id || "",
      title: storyTitleText(activeEntry, displayEntry),
      text,
      updatedAt: new Date().toISOString(),
    };
  }

  // 第二屏的故事文本靠这条 POST 落到存档里，写失败时第二屏只能停在旧内容或空态，
  // 所以这里既重试也留痕。
  async function readStorySection() {
    const response = await fetch(secondScreenSnapshotUrl, { cache: "no-store" });
    const payload = campaignSession ? campaignSession.accept(await response.json().catch(() => null)) : await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    storySectionRevision = Math.max(0, Number(payload.revision || 0));
    return payload;
  }

  function currentCampaignAccountId() {
    if (!campaignSession || campaignSession.changed) return "";
    try {
      return campaignSession.accountId || "";
    } catch {
      return "";
    }
  }

  function postSecondScreenStorySnapshot(snapshot) {
    campaignSession?.assertCurrent();
    const body = {
      section: "story",
      state: snapshot,
      expectedRevision: storySectionRevision,
    };
    const accountId = currentCampaignAccountId();
    if (accountId) body.expectedAccountId = accountId;
    return fetch(secondScreenSnapshotUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (response) => {
      const payload = campaignSession ? campaignSession.accept(await response.json().catch(() => null)) : await response.json().catch(() => null);
      if (response.status === 409 && payload?.code === "SAVE_CONFLICT" && payload.revision != null) {
        storySectionRevision = Math.max(0, Number(payload.revision || 0));
        const error = new Error(payload.error || `HTTP ${response.status}`);
        error.code = "SAVE_CONFLICT";
        throw error;
      }
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      storySectionRevision = Math.max(0, Number(payload.revision || storySectionRevision));
      return payload;
    });
  }

  function reportSecondScreenSnapshotFailure(reason) {
    secondScreenSnapshotFailure = reason;
    console.warn("第二屏故事文本同步失败：", reason);
    if (!secondScreenStoryModeLabel) return;
    secondScreenStoryModeLabel.classList.add("sync-error");
    secondScreenStoryModeLabel.title = `故事文本同步失败：${reason}。第二屏会停在上一屏内容，请检查登录状态或稍后重试。`;
  }

  function clearSecondScreenSnapshotFailure() {
    if (!secondScreenSnapshotFailure) return;
    secondScreenSnapshotFailure = "";
    secondScreenStoryModeLabel?.classList.remove("sync-error");
    if (secondScreenStoryModeLabel && !secondScreenStoryModeToggle?.disabled) {
      secondScreenStoryModeLabel.title = SECOND_SCREEN_STORY_MODE_TITLE;
    }
  }

  // 状态刷新会重写这条提示，所以同步失败的原因要拼在里面，别被刷掉。
  // 切换模式失败（例如第二屏其实没为当前账号开启，PHP 会回 409）同样要留痕：
  // 那时勾选会自己弹回去，页面上却看不出为什么。
  function secondScreenStoryModeTitle(base) {
    const reasons = [];
    if (secondScreenSnapshotFailure) reasons.push(`上一次故事文本同步失败：${secondScreenSnapshotFailure}`);
    if (secondScreenModeFailure) reasons.push(secondScreenModeFailure);
    return reasons.length ? `${base}（${reasons.join("；")}）` : base;
  }

  function scheduleSecondScreenStorySnapshot() {
    window.clearTimeout(secondScreenSnapshotTimer);
    // 每次排任务都换一个定时器句柄，这个句柄同时充当「最新一代」的记号：clearTimeout 只能
    // 掐掉还没执行的定时器，掐不掉已经醒来、正在等 400ms 重试的那个循环；旧循环必须在每次
    // 重试前确认自己还是最新任务，否则它会拿旧条目把用户刚切到的条目覆盖回去。
    const generation = window.setTimeout(async () => {
      const snapshot = buildSecondScreenStorySnapshot();
      if (!snapshot) return;
      // 以前这里把失败整个吞掉：快照写不进存档时第二屏会一直停在旧内容或空态，
      // 看起来就像「官方版没图」。现在重试两次，并把原因留在第二屏开关的提示里。
      for (let attempt = 0; attempt < SECOND_SCREEN_SNAPSHOT_ATTEMPTS; attempt += 1) {
        if (secondScreenSnapshotTimer !== generation) return;
        try {
          await postSecondScreenStorySnapshot(snapshot);
          clearSecondScreenSnapshotFailure();
          return;
        } catch (error) {
          if (error?.code === "ACCOUNT_MISMATCH") {
            reportSecondScreenSnapshotFailure("登录账号已切换，请刷新故事页后再同步第二屏。");
            return;
          }
          if (error?.code === "SAVE_CONFLICT") {
            try { await readStorySection(); } catch { /* keep retrying with the revision from the 409 */ }
          }
          const reason = String(error?.message || error);
          if (attempt === SECOND_SCREEN_SNAPSHOT_ATTEMPTS - 1) reportSecondScreenSnapshotFailure(reason);
          else await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }, 120);
    secondScreenSnapshotTimer = generation;
  }

  // 第二屏没为当前账号开启时 PHP 会回 409：以前这里只看 response.ok，界面只会把勾选
  // 弹回去，看不出原因，所以把服务端的错误一起带出来。
  async function setSecondScreenMode(mode) {
    try {
      const response = await fetch(secondScreenModeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: mode === "story" ? "story" : "map" }),
      });
      if (response.ok) return { ok: true, error: "" };
      const payload = await response.json().catch(() => null);
      return { ok: false, error: String(payload?.error || `HTTP ${response.status}`) };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  async function refreshSecondScreenStoryModeToggle() {
    if (!secondScreenStoryModeToggle) return;
    try {
      const response = await fetch(secondScreenStatusUrl, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      const enabled = Boolean(payload.enabled);
      const storyMode = enabled && payload.displayMode === "story";
      secondScreenStoryModeToggle.checked = storyMode;
      secondScreenStoryModeToggle.disabled = !enabled;
      secondScreenStoryModeLabel?.classList.toggle("disabled", !enabled);
      secondScreenStoryModeLabel.title = enabled
        ? secondScreenStoryModeTitle(SECOND_SCREEN_STORY_MODE_TITLE)
        : "请先在主控制台开启第二屏幕";
      refreshSecondScreenStoryContentToggle(storyMode);
    } catch {
      secondScreenStoryModeToggle.checked = false;
      secondScreenStoryModeToggle.disabled = true;
      secondScreenStoryModeLabel?.classList.add("disabled");
      if (secondScreenStoryModeLabel) secondScreenStoryModeLabel.title = "请先在主控制台开启第二屏幕";
      refreshSecondScreenStoryContentToggle(false);
    }
  }

  async function toggleSecondScreenStoryMode() {
    if (!secondScreenStoryModeToggle || secondScreenModeBusy) return;
    secondScreenModeBusy = true;
    secondScreenStoryModeToggle.disabled = true;
    if (secondScreenStoryModeToggle.checked) scheduleSecondScreenStorySnapshot();
    const requestedMode = secondScreenStoryModeToggle.checked ? "story" : "map";
    const result = await setSecondScreenMode(requestedMode);
    if (result.ok) {
      secondScreenModeFailure = "";
    } else {
      secondScreenStoryModeToggle.checked = !secondScreenStoryModeToggle.checked;
      secondScreenModeFailure = `切换第二屏显示失败：${result.error}`;
      console.warn("第二屏显示模式切换失败：", result.error);
    }
    secondScreenModeBusy = false;
    await refreshSecondScreenStoryModeToggle();
  }

  function renderAiTranslatedSupplement(entry, imagesHtml) {
    const notice = entry.translationNotice
      || "AI 翻译（非官方），可能存在术语或 OCR 误差；请以英文原文和扫描页图为准。";
    const sourcePages = Array.isArray(entry.sourcePages) && entry.sourcePages.length
      ? `故事书第 ${entry.sourcePages.join("、")} 页`
      : "故事书补充页";
    const aibpLink = entry.chapterKey === "battle" ? battleAibpLink(entry) : "";
    const translation = linkify(entry.text || "", currentBook());
    const original = escapeHtml(entry.originalText || "");
    const gallery = imagesHtml
      ? `<div class="supplement-gallery-hint">点击扫描页可放大查看</div><div class="battle-gallery supplement-gallery">${imagesHtml}</div>`
      : "";

    // 正文容器保留换行，结构标签之间不要插入模板缩进形成的空行。
    return [
      `<section class="ai-translation" aria-label="AI 中文翻译">`,
      `<div class="ai-translation-label">AI 翻译</div>`,
      `<p class="ai-translation-notice">${escapeHtml(notice)}</p>`,
      `<div class="ai-translation-body">${translation}</div>`,
      `</section>`,
      aibpLink,
      `<details class="source-original">`,
      `<summary>查看英文原文（OCR）与扫描页 · ${escapeHtml(sourcePages)}</summary>`,
      `<p class="source-page-note">英文文字来自 PDF 自带 OCR；识别不清的页面经过本地 OCR 校正。规则图标、表格和版式请以扫描页为准。</p>`,
      `<div class="source-original-text">${original}</div>`,
      gallery,
      `</details>`,
    ].join("");
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

  function pharosTitleAnswer(entry) {
    if (entry?.chapterKey !== "dreams-of-pharos") return null;
    const answers = window.PHAROS_TITLE_ANSWERS;
    if (!answers?.solved?.[entry.key]) return null;
    return storyVersion === "官方版" && supportsOfficialVersion()
      ? answers.chinese?.[entry.key]
      : answers.solved[entry.key][1];
  }

  function storyTitleText(entry, displayEntry = getDisplayEntry(entry)) {
    const originalTitle = displayEntry.title || "故事段落";
    const answer = pharosTitleAnswer(entry);
    if (!answer) return originalTitle;
    const official = storyVersion === "官方版" && supportsOfficialVersion();
    const code = window.PHAROS_TITLE_ANSWERS.titleCode(entry, displayEntry, official);
    if (!code) return originalTitle;
    const numberedTitle = originalTitle.replace(/\s*\d{6,}\s*$/, "");
    return `${numberedTitle} · ${decodedPharosTitleKeys.has(entry.key) ? answer : code}`;
  }

  function renderEntryTitle(entry) {
    entryTitle.textContent = storyTitleText(entry);
    if (pharosTitleDecodeButton) {
      pharosTitleDecodeButton.hidden = !pharosTitleAnswer(entry) || decodedPharosTitleKeys.has(entry.key);
    }
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
    renderEntryTitle(entry);
    entryBadge.textContent = entry.id;

    renderStory(entry);
    scheduleSecondScreenStorySnapshot();
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

  function navigateToStoryTarget(target = {}) {
    const bookId = resolveBookId(target.bookId || target.book || "");
    if (bookId) bookSelect.value = bookId;
    activeBook = currentBook();

    const chapterKey = resolveChapterKey(activeBook, target.chapterKey || target.chapter || target.chapterHint || "");
    populateChapters(activeBook, chapterKey || undefined);
    const encounterKey = resolveEncounterKey(activeBook, target.encounterKey || target.encounter || "");
    if (encounterKey) populateEncounters(activeBook, encounterKey);

    const entry = target.entryKey
      ? activeBook.entries.find((item) => item.key === target.entryKey)
      : preferredEntry(activeBook, target.entryId || target.entry || target.id || "", {
        bookId: activeBook.id,
        chapterKey: chapterKey || "",
        encounterKey: encounterKey || "",
      });

    if (!entry) {
      const query = target.entryId || target.entry || target.id || target.q || "";
      if (query) {
        searchInput.value = query;
        renderResults(searchEntries(query));
      }
      return false;
    }

    searchInput.value = entry.id;
    showEntry(entry, true);
    return true;
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

  // span=2 用于在 3 列网格里让字段占两列
  function modalField(id, label, value, type = "text", placeholder = "", span = 1) {
    return `
      <label class="tts-modal-field${span === 2 ? " span-2" : ""}">
        <span>${label}</span>
        <input id="${id}" type="${type}" value="${escapeAttribute(value || "")}" placeholder="${escapeAttribute(placeholder)}">
      </label>
    `;
  }

  function modalTextArea(id, label, value, placeholder = "", rows = 3) {
    return `
      <label class="tts-modal-field">
        <span>${label}</span>
        <textarea id="${id}" rows="${rows}" placeholder="${escapeAttribute(placeholder)}">${escapeHtml(value || "")}</textarea>
      </label>
    `;
  }

  function modalSelect(id, label, options, current) {
    const items = options.map((item) => {
      const selected = item.id === current ? " selected" : "";
      return `<option value="${escapeAttribute(item.id)}"${selected}>${escapeHtml(item.label)}</option>`;
    }).join("");
    return `
      <label class="tts-modal-field">
        <span>${label}</span>
        <select id="${id}">${items}</select>
      </label>
    `;
  }

  function modalGroupTitle(text) {
    return `<div class="tts-group-title">${escapeHtml(text)}</div>`;
  }

  function modalGrid(columns, fields) {
    return `<div class="tts-field-grid cols-${columns}">${fields}</div>`;
  }

  function openTtsConfigModal() {
    const cloud = ttsConfig.cloud;
    const local = ttsConfig.local;
    const xf = cloud.xfyun || defaultTtsConfig.cloud.xfyun;
    const isXfyun = cloudProvider(cloud) === "xfyun";
    ttsUi.overlay.hidden = false;
    ttsUi.overlay.innerHTML = `
      <div class="tts-modal" role="dialog" aria-modal="true" aria-label="配置朗读引擎">
        <header class="tts-modal-head">
          <div>
            <h3>配置朗读引擎</h3>
            <p>云端 API 支持 MIMO 与讯飞在线语音合成；本地部署走 OpenAI audio/speech 风格接口。</p>
          </div>
          <button id="ttsModalClose" type="button" class="tts-btn-close" aria-label="关闭">✕</button>
        </header>

        <div class="tts-modal-body">
          <section class="tts-card">
            <div class="tts-card-head">
              <h4>云端 API</h4>
              <span class="tts-card-hint">走公网接口，可随时朗读任意段落</span>
            </div>
            <div class="tts-card-body">
              ${modalGrid(2, modalSelect("ttsCloudProvider", "服务商", cloudProviders, cloudProvider(cloud)))}

              <div id="ttsMimoFields" class="tts-group"${isXfyun ? " hidden" : ""}>
                ${modalGroupTitle("连接")}
                ${modalGrid(2, [
                  modalField("ttsCloudBase", "Base URL", cloud.baseUrl, "text", "https://example.com/v1"),
                  modalField("ttsCloudTimeout", "超时 ms", cloud.timeout, "number", "120000"),
                ].join(""))}
                ${modalGrid(1, modalTextArea("ttsCloudKey", "API Keys（每行一个）", cloud.apiKey, "sk-xxx\\nsk-yyy", 2))}

                ${modalGroupTitle("模型")}
                ${modalGrid(2, [
                  modalField("ttsCloudModel", "内置模型", cloud.builtInModel, "text", "mimo-v2.5-tts"),
                  modalField("ttsCloudCloneModel", "克隆模型", cloud.voiceCloneModel, "text", "mimo-v2.5-tts-voiceclone"),
                ].join(""))}

                ${modalGroupTitle("音色")}
                ${modalGrid(2, [
                  modalField("ttsCloudVoice", "预设音色", cloud.voice, "text", "voice name"),
                  modalField("ttsCloudFormat", "音频格式", cloud.audioFormat || "wav", "text", "wav"),
                ].join(""))}
                ${modalGrid(1, modalTextArea("ttsCloudPrompt", "风格提示词", cloud.userMessage, "例如：冷静、中速、带一点故事感。", 2))}
              </div>

              <div id="ttsXfyunFields" class="tts-group"${isXfyun ? "" : " hidden"}>
                ${modalGroupTitle("账号")}
                ${modalGrid(3, [
                  modalField("ttsXfyunAppId", "AppID", xf.appId, "text", "控制台 AppID"),
                  modalField("ttsXfyunKey", "APIKey", xf.apiKey, "text", "32 位字符串"),
                  modalField("ttsXfyunSecret", "APISecret", xf.apiSecret, "text", "32 位字符串"),
                ].join(""))}

                ${modalGroupTitle("音色与语调")}
                ${modalGrid(2, [
                  `<label class="tts-modal-field">
                     <span>发音人</span>
                     <input id="ttsXfyunVoice" type="text" list="ttsXfyunVoiceList" value="${escapeAttribute(xf.vcn || "")}" placeholder="x4_lingbosong_bad_talk">
                     <datalist id="ttsXfyunVoiceList">
                       ${xfyunPresetVoices.map((voice) => `<option value="${escapeAttribute(voice.vcn)}">${escapeHtml(voice.label)}</option>`).join("")}
                     </datalist>
                   </label>`,
                  modalField("ttsXfyunSampleRate", "采样率", xf.sampleRate || 16000, "number", "16000"),
                ].join(""))}
                ${modalGrid(3, [
                  modalField("ttsXfyunRate", "语速 0-100", xf.speed ?? 50, "number", "50"),
                  modalField("ttsXfyunVolume", "音量 0-100", xf.volume ?? 50, "number", "50"),
                  modalField("ttsXfyunPitch", "音调 0-100", xf.pitch ?? 50, "number", "50"),
                ].join(""))}
                ${modalGrid(2, modalField("ttsXfyunTimeout", "超时 ms", xf.timeout || 60000, "number", "60000"))}
                <p class="tts-note">浏览器只能走 WebSocket 版。发音人需先在讯飞控制台开通，未开通会返回 11200。</p>
              </div>
            </div>
            <div class="tts-card-actions">
              <button id="ttsPreviewVoices" type="button">试听所有音色</button>
              <button id="ttsCloneImport" type="button" class="mimo-only"${isXfyun ? " hidden" : ""}>导入克隆音色</button>
              <button id="ttsCloneClear" type="button" class="mimo-only"${isXfyun ? " hidden" : ""}>清除克隆音色</button>
              <span class="tts-spacer"></span>
              <button id="ttsCloudTest" type="button" class="tts-btn-primary">测试连接并试听</button>
            </div>
          </section>

          <section class="tts-card">
            <div class="tts-card-head">
              <h4>本地部署</h4>
              <span class="tts-card-hint">指向自建服务，使用 OpenAI audio/speech 风格接口</span>
            </div>
            <div class="tts-card-body">
              ${modalGroupTitle("连接")}
              ${modalGrid(2, [
                modalField("ttsLocalBase", "Base URL", local.baseUrl, "text", "http://127.0.0.1:8000/v1"),
                modalField("ttsLocalTimeout", "超时 ms", local.timeout, "number", "60000"),
              ].join(""))}
              ${modalGrid(1, modalTextArea("ttsLocalKey", "API Keys（每行一个）", local.apiKey, "sk-none", 2))}

              ${modalGroupTitle("模型与音色")}
              ${modalGrid(2, [
                modalField("ttsLocalModel", "模型名称", local.model, "text", "tts-1"),
                modalField("ttsLocalVoice", "发音人", local.voice, "text", "alloy"),
              ].join(""))}
              ${modalGrid(1, modalTextArea("ttsLocalPrompt", "风格提示词", local.userMessage, "本地服务支持 prompt 时会生效。", 2))}
            </div>
            <div class="tts-card-actions">
              <span class="tts-spacer"></span>
              <button id="ttsLocalTest" type="button" class="tts-btn-primary">测试连接并试听</button>
            </div>
          </section>
        </div>

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
        provider: document.querySelector("#ttsCloudProvider").value || "mimo",
        baseUrl: document.querySelector("#ttsCloudBase").value.trim(),
        apiKey: document.querySelector("#ttsCloudKey").value.trim(),
        builtInModel: document.querySelector("#ttsCloudModel").value.trim(),
        voiceCloneModel: document.querySelector("#ttsCloudCloneModel").value.trim(),
        voice: document.querySelector("#ttsCloudVoice").value.trim(),
        voiceCloneDataUrl: ttsConfig.cloud.voiceCloneDataUrl,
        userMessage: document.querySelector("#ttsCloudPrompt").value.trim(),
        audioFormat: document.querySelector("#ttsCloudFormat").value.trim() || "wav",
        timeout: Number(document.querySelector("#ttsCloudTimeout").value || 120000),
        xfyun: {
          appId: document.querySelector("#ttsXfyunAppId").value.trim(),
          apiKey: document.querySelector("#ttsXfyunKey").value.trim(),
          apiSecret: document.querySelector("#ttsXfyunSecret").value.trim(),
          vcn: document.querySelector("#ttsXfyunVoice").value.trim() || "x4_lingbosong_bad_talk",
          voiceLabel: xfyunPresetVoices.find((voice) => voice.vcn === document.querySelector("#ttsXfyunVoice").value.trim())?.label || "",
          host: ttsConfig.cloud.xfyun?.host || "tts-api.xfyun.cn",
          sampleRate: Number(document.querySelector("#ttsXfyunSampleRate").value || 16000),
          speed: Number(document.querySelector("#ttsXfyunRate").value || 50),
          volume: Number(document.querySelector("#ttsXfyunVolume").value || 50),
          pitch: Number(document.querySelector("#ttsXfyunPitch").value || 50),
          timeout: Number(document.querySelector("#ttsXfyunTimeout").value || 60000),
        },
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

    // 切换服务商时显示对应的配置区；克隆音色按钮只对 MIMO 有意义。
    document.querySelector("#ttsCloudProvider").addEventListener("change", (event) => {
      const xfyun = event.target.value === "xfyun";
      document.querySelector("#ttsMimoFields").hidden = xfyun;
      document.querySelector("#ttsXfyunFields").hidden = !xfyun;
      document.querySelectorAll(".mimo-only").forEach((element) => {
        element.hidden = xfyun;
      });
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
      if (cloudProvider() === "xfyun") {
        const current = ttsConfig.cloud.xfyun?.vcn || "";
        xfyunPresetVoices.forEach((voice) => {
          const option = document.createElement("option");
          option.value = voice.vcn;
          option.textContent = `${voice.label}（${voice.vcn}）`;
          if (voice.vcn === current) option.selected = true;
          ttsVoice.appendChild(option);
        });
        // 控制台里开通了别的发音人时也能直接填。
        if (current && !xfyunPresetVoices.some((voice) => voice.vcn === current)) {
          const option = document.createElement("option");
          option.value = current;
          option.textContent = current;
          option.selected = true;
          ttsVoice.appendChild(option);
        }
        return;
      }
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
    const text = prepareSpeechText(getSpeechEntryText(entry));
    if (!text) {
      pushTtsStatus("当前版本暂无可朗读正文。", "warn");
      return;
    }
    const token = ++activeSpeechToken;
    await ensureStoryAudioManifest();
    if (token !== activeSpeechToken) return;
    try {
      if (await speakCachedEntryAudio(entry, token)) return;
    } catch (error) {
      if (token === activeSpeechToken) {
        pushTtsStatus(`Offline audio failed: ${String(error.message || error).slice(0, 100)}`, "warn");
      }
    }
    if (token !== activeSpeechToken) return;
    if (ttsConfig.activeEngine === "offline") {
      await ensureStoryAudioManifest(true);
      if (token !== activeSpeechToken) return;
      try {
        if (await speakCachedEntryAudio(entry, token)) return;
      } catch (error) {
        if (token === activeSpeechToken) {
          pushTtsStatus(`Offline audio failed after reload: ${String(error.message || error).slice(0, 100)}`, "warn");
        }
      }
      if (token !== activeSpeechToken) return;
      pushTtsStatus("当前版本没有可用的离线音频，请切换到浏览器、本地或云端语音。", "warn");
      finishSpeech(token);
      return;
    }
    speakText(text);
  }

  function getSpeechEntryText(entry) {
    if (storyVersion === "官方版" && supportsOfficialVersion()) {
      return officialEntries.get(`${currentBook()?.id}:${entry.key}`)?.officialText || "";
    }
    return entry.text || "";
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
    updateEntityBioToggle();
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
  pharosTitleDecodeButton?.addEventListener("click", () => {
    if (!pharosTitleAnswer(activeEntry)) return;
    decodedPharosTitleKeys.add(activeEntry.key);
    renderEntryTitle(activeEntry);
    renderResults(searchEntries(searchInput.value));
    scheduleSecondScreenStorySnapshot();
  });
  secondScreenStoryModeToggle?.addEventListener("change", toggleSecondScreenStoryMode);
  secondScreenStoryContentToggle?.addEventListener("change", toggleSecondScreenStoryContent);
  rememberButton.addEventListener("click", rememberParagraph);
  ttsButton.addEventListener("click", toggleSpeech);
  ttsPauseButton?.addEventListener("click", toggleSpeechPause);
  function syncStoryLanguage(official) {
    const nextVersion = official ? "官方版" : "民间版";
    if (storyVersion === nextVersion) return;
    stopSpeech();
    storyVersion = nextVersion;
    refreshSecondScreenStoryContentToggle(Boolean(secondScreenStoryModeToggle?.checked));
    const chapterKey = selectedChapterKey();
    const encounterKey = selectedEncounterKey();
    data = buildVersionData(official);
    activeBook = currentBook();
    populateChapters(activeBook, chapterKey);
    populateEncounters(activeBook, encounterKey);
    for (const option of bookSelect.options) {
      const book = data.books.find((item) => item.id === option.value);
      if (book) option.textContent = `${book.title} (${book.entryCount})`;
    }
    if (activeEntry && !activeBook.entries.some((entry) => entry.key === activeEntry.key)) {
      activeEntry = null;
      entryTitle.textContent = "当前版本没有此条目";
      if (pharosTitleDecodeButton) pharosTitleDecodeButton.hidden = true;
      entryBadge.textContent = "----";
      storyText.textContent = "该条目为官方版独有，请切换至官方版后打开。";
      linkPanel.innerHTML = "";
    }
    if (activeEntry) {
      renderEntryTitle(activeEntry);
      renderStory(activeEntry);
      scheduleSecondScreenStorySnapshot();
    }
    renderResults(searchEntries(searchInput.value));
  }
  window.addEventListener("storage", (event) => {
    if (event.key === "ato-term-language-v1") syncStoryLanguage(event.newValue === "official");
  });
  window.addEventListener("ato-term-language-changed", (event) => {
    if (typeof event.detail?.official === "boolean") syncStoryLanguage(event.detail.official);
  });
  storyLanguageChannel?.addEventListener("message", (event) => {
    if (typeof event.data?.official === "boolean") syncStoryLanguage(event.data.official);
  });
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
      if (cloudProvider() === "xfyun") {
        if (val) ttsConfig.cloud.xfyun.vcn = val;
      } else if (val && val !== "__clone__") {
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

  if (entityBioToggle) {
    entityBioToggle.addEventListener("click", toggleEntityBios);
  }

  storyText.addEventListener("click", (event) => {
    const pageTarget = event.target.closest("[data-page-viewer]");
    if (pageTarget) {
      openPageViewer(pageTarget);
      return;
    }

    const entityTarget = event.target.closest("[data-entity-id]");
    if (entityTarget) {
      openEntityBio(entityTarget.dataset.entityId);
      return;
    }

    const target = event.target.closest("[data-id]");
    if (!target) return;
    jumpToId(target.dataset.id, { chapterHint: target.dataset.chapterHint });
  });

  storyText.addEventListener("keydown", (event) => {
    const pageTarget = event.target.closest("[data-page-viewer]");
    if (!pageTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openPageViewer(pageTarget);
  });

  // 扫描图加载失败要能兜底，error 不冒泡所以用捕获阶段（见 handleStoryImageError）。
  storyText.addEventListener("error", handleStoryImageError, true);

  ["pointerenter", "pointerdown", "focusin"].forEach((eventName) => {
    storyText.addEventListener(eventName, (event) => {
      const target = event.target.closest("[data-id]");
      if (!target) return;
      prewarmJumpTarget(target.dataset.id, { chapterHint: target.dataset.chapterHint });
    }, true);
  });

  window.atoStoryNavigate = navigateToStoryTarget;
  // 信封段落的按钮只弹提示，不跳转（隐藏 BOSS 的剧透保护）。
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-aibp-hint]");
    if (!button) return;
    event.preventDefault();
    showEnvelopeAibpHint(button.dataset.aibpHint);
  });
  window.addEventListener("focus", refreshSecondScreenStoryModeToggle);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshSecondScreenStoryModeToggle();
  });
  window.addEventListener("message", (event) => {
    if (window.location.protocol !== "file:" && event.origin !== window.location.origin) return;
    const message = event.data || {};
    if (message.type !== "ato-story-jump") return;
    navigateToStoryTarget(message.target || {});
  });

  init();
  refreshSecondScreenStoryModeToggle();
  void readStorySection().catch(() => {});
})();
