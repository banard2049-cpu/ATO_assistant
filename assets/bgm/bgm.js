/* ATO Assistant 背景音乐播放器
 *
 * 依赖 assets/bgm/manifest.js（阶段 → 曲目表）。本文件只做播放与界面，不含音频。
 * 用法：在页面里引入 manifest.js 与 bgm.js，并放一个 <div id="bgmControls"></div>
 * 作为控制条容器；没有容器时会在左下角自动生成一个浮动控制条。
 *
 * 设计要点：
 *   - Web Audio 增益节点做交叉淡入淡出，避免 <audio> 换 src 时的断口；
 *   - 音乐默认关闭，必须由用户手势开启（浏览器自动播放策略），偏好存 localStorage；
 *   - 找不到音频文件时只提示，不报错；.ogg 解码失败会自动尝试同名 .mp3；
 *   - 对外只暴露 window.ATO_BGM，主控台按「今日流程」步骤调用 setFlowStage()。
 */
(function () {
  "use strict";

  const manifest = window.ATO_BGM_MANIFEST;
  const PREFS_KEY = "ato-bgm-prefs-v1";
  const CONTAINER_ID = "bgmControls";
  const AUTO_LABEL = "自动（跟随今日流程）";
  // 改动本文件时同步更新：这里的 BUILD 与两个页面里的 ?v= 标签（测试会校验一致）
  const BUILD = "bgm15";

  if (!manifest || !manifest.stages || !Object.keys(manifest.stages).length) {
    window.ATO_BGM = createDisabledApi("缺少 assets/bgm/manifest.js");
    return;
  }

  const defaults = manifest.defaults || {};
  const baseDir = String(manifest.baseDir || "./");
  // 备用音频目录（manifest.audioDir）：Docker / NAS 只把 assets/bgm/audio 挂进容器，
  // 播放器代码由镜像提供，所以音频在那里；其它平台音频就在本目录。两处都会试。
  // 清单没写这个字段时按默认值走（老的自定义清单也能用上 Docker 部署）；
  // 想彻底关掉回退，在清单里写 audioDir: ""。
  const audioDir = normalizeAudioDir(manifest.audioDir === undefined ? "audio/" : manifest.audioDir);
  const scriptDir = resolveScriptDir();
  const assetBase = resolveAssetBase();

  function normalizeAudioDir(value) {
    const text = String(value == null ? "" : value).trim().replace(/^\.?\//, "").replace(/^\/+/, "");
    if (!text) return "";
    return text.endsWith("/") ? text : text + "/";
  }

  // 每个页面自己的角色（写在页面里，见 window.ATO_BGM_CONFIG）：
  //   play   本页是否出声（默认 true）
  //   ui     是否渲染控制条（默认 true）
  //   expect 期望的脚本版本，用来发现浏览器缓存了旧脚本
  const pageConfig = (function () {
    const raw = window.ATO_BGM_CONFIG || {};
    return {
      play: raw.play !== false,
      ui: raw.ui !== false,
      expect: typeof raw.expect === "string" ? raw.expect : "",
    };
  })();
  let staleBuild = false;
  const stageKeys = Object.keys(manifest.stages);

  const state = {
    stepId: "",
    sceneStage: "",
    forcedStage: "",
    currentKey: "",
    currentUrl: "",
    currentName: "",
    started: false,
    needGesture: false,
    missingStageKey: "",
    playToken: 0,
  };
  const missingUrls = new Set();
  let lastStingerAt = 0;

  let ctx = null;
  let master = null;
  let ducked = false;
  const pools = {
    main: createPool(2),
    bed: createPool(2),
    stinger: createPool(1),
  };

  const prefs = loadPrefs();

  /* ---------- 自选曲目 ----------
   * 使用者导入的音频存在浏览器 IndexedDB（Blob），指派表（阶段 → 曲目 id）存 localStorage。
   * 因此自选曲目只在本浏览器有效，不写战役存档、也不影响其它设备；
   * 想跨设备分发就用 asset-studio 的资料包（见 assets/bgm/README.md）。
   */
  const CUSTOM_DB_NAME = "ato-bgm-custom";
  const CUSTOM_DB_VERSION = 1;
  const CUSTOM_STORE = "tracks";
  const ASSIGN_KEY = "ato-bgm-assignments-v1";
  const CUSTOM_MAX_BYTES = 64 * 1024 * 1024;
  const CUSTOM_EXT = /\.(mp3|ogg|oga|m4a|aac|wav|flac|opus|weba)$/i;

  const customTracks = [];
  const customUrls = new Map();
  let assignments = loadAssignments();
  let dbPromise = null;
  let customReady = null;
  let extraStatus = "";
  let extraStatusError = false;
  let targetTouched = false;

  /* ---------- 偏好 ---------- */

  function loadPrefs() {
    const fallback = { enabled: false, volume: numberOr(defaults.volume, 0.5), stage: "" };
    try {
      const raw = window.localStorage && window.localStorage.getItem(PREFS_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled === true,
        volume: clamp(numberOr(parsed.volume, fallback.volume), 0, 1),
        stage: manifest.stages[parsed.stage] ? String(parsed.stage) : "",
      };
    } catch (error) {
      return fallback;
    }
  }

  function savePrefs() {
    try {
      if (window.localStorage) window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (error) {
      /* 隐私模式下忽略 */
    }
  }

  /* ---------- 音频图 ---------- */

  function ensureGraph() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = globalLevel();
      master.connect(ctx.destination);
    } catch (error) {
      ctx = null;
      master = null;
      return null;
    }
    eachSlot(attachSlot);
    return ctx;
  }

  function attachSlot(slot) {
    if (!ctx || slot.node) return;
    try {
      slot.node = ctx.createMediaElementSource(slot.el);
      slot.gain = ctx.createGain();
      slot.gain.gain.value = quiet;
      slot.node.connect(slot.gain);
      slot.gain.connect(master);
    } catch (error) {
      // 元素的 MediaElementSource 只能创建一次；失败时退化为直接改 volume。
      slot.node = null;
      slot.gain = null;
      slot.el.volume = 0;
    }
  }

  const quiet = 0.0001;

  function createPool(size) {
    return { slots: Array.from({ length: size }, createSlot), active: -1 };
  }

  function createSlot() {
    const el = new window.Audio();
    el.preload = "auto";
    el.loop = false;
    return { el: el, node: null, gain: null, level: 0, url: "", playing: false, timer: null };
  }

  function eachSlot(visit) {
    Object.keys(pools).forEach(function (name) {
      pools[name].slots.forEach(visit);
    });
  }

  function duckFactor() {
    const db = numberOr(defaults.duckDb, -14);
    return db >= 0 ? 1 : Math.pow(10, db / 20);
  }

  function globalLevel() {
    return clamp(numberOr(prefs.volume, 0.5), 0, 1) * (ducked ? duckFactor() : 1);
  }

  function applyGlobalLevel(ms) {
    const ramp = numberOr(ms, numberOr(defaults.fadeRampMs, 160));
    if (master && ctx) {
      rampParam(master.gain, globalLevel(), ramp);
      return;
    }
    eachSlot(function (slot) {
      if (!slot.playing) return;
      slot.el.volume = clamp(slot.level * globalLevel(), 0, 1);
    });
  }

  function rampParam(param, target, ms) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(quiet, param.value), now);
    param.linearRampToValueAtTime(Math.max(quiet, target), now + Math.max(0.01, ms / 1000));
  }

  function fadeSlot(slot, targetLevel, ms) {
    const level = Math.max(0, targetLevel);
    slot.level = level;
    if (slot.gain && ctx) {
      rampParam(slot.gain.gain, level, ms);
      return;
    }
    stepElementVolume(slot, level * globalLevel(), ms);
  }

  function stepElementVolume(slot, target, ms) {
    const start = numberOr(slot.el.volume, 0);
    const steps = Math.max(1, Math.round(Math.max(60, ms) / 60));
    let index = 0;
    if (slot.timer) window.clearInterval(slot.timer);
    if (Math.abs(target - start) < 0.01) {
      slot.el.volume = clamp(target, 0, 1);
      return;
    }
    slot.timer = window.setInterval(function () {
      index += 1;
      const progress = index / steps;
      slot.el.volume = clamp(start + (target - start) * progress, 0, 1);
      if (index >= steps) {
        window.clearInterval(slot.timer);
        slot.timer = null;
        slot.el.volume = clamp(target, 0, 1);
      }
    }, 60);
  }

  /* ---------- 自选曲目：存取 ---------- */

  function loadAssignments() {
    const result = {};
    try {
      const raw = window.localStorage && window.localStorage.getItem(ASSIGN_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      Object.keys(parsed || {}).forEach(function (key) {
        if (manifest.stages[key] && parsed[key]) result[key] = String(parsed[key]);
      });
    } catch (error) {
      /* 隐私模式或数据损坏时当作没有指派 */
    }
    return result;
  }

  function saveAssignments() {
    try {
      if (window.localStorage) window.localStorage.setItem(ASSIGN_KEY, JSON.stringify(assignments));
    } catch (error) {
      /* 忽略 */
    }
  }

  function customSupported() {
    return Boolean(window.indexedDB);
  }

  function openDb() {
    if (!customSupported()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      let request;
      try {
        request = window.indexedDB.open(CUSTOM_DB_NAME, CUSTOM_DB_VERSION);
      } catch (error) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = function () {
        const db = request.result;
        if (db && db.objectStoreNames && !db.objectStoreNames.contains(CUSTOM_STORE)) {
          db.createObjectStore(CUSTOM_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { resolve(null); };
    });
    return dbPromise;
  }

  function openStore(mode) {
    return openDb().then(function (db) {
      if (!db) return null;
      try {
        return db.transaction(CUSTOM_STORE, mode).objectStore(CUSTOM_STORE);
      } catch (error) {
        return null;
      }
    });
  }

  function requestDone(request) {
    return new Promise(function (resolve) {
      if (!request) {
        resolve(null);
        return;
      }
      request.onsuccess = function () { resolve(request.result === undefined ? true : request.result); };
      request.onerror = function () { resolve(null); };
    });
  }

  async function readStoredTracks() {
    const objectStore = await openStore("readonly");
    if (!objectStore) return [];
    const rows = await requestDone(objectStore.getAll());
    return Array.isArray(rows) ? rows : [];
  }

  // 自选曲目只加载一次；applyStage 在解析阶段前会等它，避免开局先放内置曲再切一次。
  function ensureCustomReady() {
    if (!customReady) {
      customReady = loadCustomTracks().catch(function () { return 0; });
    }
    return customReady;
  }

  async function loadCustomTracks() {
    const rows = await readStoredTracks();
    customTracks.length = 0;
    rows
      .slice()
      .sort(function (a, b) { return numberOr(b && b.addedAt, 0) - numberOr(a && a.addedAt, 0); })
      .forEach(function (row) { if (row && row.id) customTracks.push(row); });
    let changed = false;
    Object.keys(assignments).forEach(function (key) {
      if (!customTracks.some(function (track) { return track.id === assignments[key]; })) {
        delete assignments[key];
        changed = true;
      }
    });
    if (changed) saveAssignments();
    refreshCustomUi();
    return customTracks.length;
  }

  function assignedTrack(stageKey) {
    const id = assignments[stageKey];
    if (!id) return null;
    return customTracks.find(function (track) { return track.id === id; }) || null;
  }

  function trackUrl(track) {
    if (!track || !track.blob) return "";
    if (!customUrls.has(track.id)) {
      const factory = window.URL && window.URL.createObjectURL;
      if (typeof factory !== "function") return "";
      try {
        customUrls.set(track.id, factory.call(window.URL, track.blob));
      } catch (error) {
        return "";
      }
    }
    return customUrls.get(track.id) || "";
  }

  function releaseTrackUrl(id) {
    if (!customUrls.has(id)) return;
    const url = customUrls.get(id);
    customUrls.delete(id);
    try {
      if (window.URL && typeof window.URL.revokeObjectURL === "function") window.URL.revokeObjectURL(url);
    } catch (error) {
      /* 忽略 */
    }
  }

  async function importCustomTrack(file, stageKey) {
    if (!file) return { ok: false, error: "没有选择文件" };
    if (!customSupported()) return { ok: false, error: "当前环境不支持本地保存自选音频" };
    const fileName = String(file.name || "自选音频");
    const mime = String(file.type || "");
    if (!CUSTOM_EXT.test(fileName) && mime.indexOf("audio/") !== 0) {
      return { ok: false, error: "只支持音频文件" };
    }
    const size = numberOr(file.size, 0);
    if (size > CUSTOM_MAX_BYTES) {
      return { ok: false, error: "文件太大（上限 " + Math.round(CUSTOM_MAX_BYTES / (1024 * 1024)) + "MB）" };
    }
    const record = {
      id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: fileName.replace(/\.[^.]+$/, ""),
      fileName: fileName,
      size: size,
      mime: mime,
      addedAt: Date.now(),
      blob: file,
    };
    const objectStore = await openStore("readwrite");
    const saved = objectStore ? await requestDone(objectStore.put(record)) : null;
    if (!saved) return { ok: false, error: "保存失败：浏览器存储不可用或空间不足" };
    customTracks.unshift(record);
    if (stageKey && manifest.stages[stageKey]) {
      assignments[stageKey] = record.id;
      saveAssignments();
    }
    refreshCustomUi();
    if (prefs.enabled) applyStage({ stopWhenDisabled: false });
    return { ok: true, track: record, stage: stageKey && manifest.stages[stageKey] ? stageKey : "" };
  }

  async function assignCustomTrack(id, stageKey) {
    // 先把这首曲子从其它阶段解绑，保证一个阶段只有一首自选曲
    Object.keys(assignments).forEach(function (key) {
      if (assignments[key] === id) delete assignments[key];
    });
    const target = stageKey && manifest.stages[stageKey] ? String(stageKey) : "";
    if (target) assignments[target] = id;
    saveAssignments();
    refreshCustomUi();
    if (prefs.enabled) applyStage({ stopWhenDisabled: false });
    return target;
  }

  async function deleteCustomTrack(id) {
    const objectStore = await openStore("readwrite");
    if (objectStore) await requestDone(objectStore["delete"](id));
    const index = customTracks.findIndex(function (track) { return track.id === id; });
    if (index >= 0) customTracks.splice(index, 1);
    releaseTrackUrl(id);
    Object.keys(assignments).forEach(function (key) {
      if (assignments[key] === id) delete assignments[key];
    });
    saveAssignments();
    refreshCustomUi();
    if (prefs.enabled) applyStage({ stopWhenDisabled: false });
    return true;
  }

  function setExtraStatus(text, isError) {
    extraStatus = text || "";
    extraStatusError = isError === true;
    if (ui.extra) {
      ui.extra.textContent = extraStatus;
      ui.extra.classList.toggle("error", extraStatusError);
    }
  }

  /* ---------- 曲目解析 ---------- */

  // baseDir 相对 manifest.js 所在目录解析成绝对地址：这样 /index.html（主控台）和
  // /story/index.html 这类不同层级的页面都指向同一个音频目录，不必逐页配置。
  function resolveScriptDir() {
    if (window.ATO_BGM_SCRIPT_DIR) return String(window.ATO_BGM_SCRIPT_DIR);
    try {
      const nodes = document.querySelectorAll ? document.querySelectorAll("script[src]") : [];
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const src = nodes[index].src || "";
        if (/\/bgm\/(?:manifest|bgm)\.js(?:\?|$)/.test(src)) return new URL(".", src).href;
      }
    } catch (error) {
      /* 忽略 */
    }
    return "";
  }

  function resolveAssetBase() {
    const relative = baseDir.endsWith("/") ? baseDir : baseDir + "/";
    if (!scriptDir) return "";
    try {
      return new URL(relative, scriptDir).href;
    } catch (error) {
      return "";
    }
  }

  function joinUrl(file) {
    const name = String(file).replace(/^\/+/, "");
    if (assetBase) return assetBase + name;
    // 取不到脚本目录时退化为页面相对路径（旧行为）
    const base = baseDir.endsWith("/") ? baseDir : baseDir + "/";
    return base + name;
  }

  // 提示里显示的目录（去掉源站与开头的斜杠），例如 assets/bgm/
  function displayBase() {
    const flat = displayFlatBase();
    // 有备用目录时把两处都写出来，免得用户放着音乐在 audio/ 里却以为没生效
    return audioDir ? flat + " 或 " + flat + audioDir : flat;
  }

  function displayFlatBase() {
    if (assetBase) {
      try {
        return new URL(assetBase).pathname.replace(/^\//, "");
      } catch (error) {
        /* 落回下面的兜底 */
      }
    }
    const text = String(baseDir || "").replace(/^\.\//, "");
    return text || "assets/bgm/";
  }

  function fileList(stage, key) {
    const value = stage[key];
    const files = Array.isArray(value)
      ? value
      : (value && Array.isArray(value.files) ? value.files : []);
    // 本目录优先（便携版 / Android / 桌面），再来 audioDir（Docker 只挂载它）。
    const names = audioDir
      ? files.concat(files.map(function (file) { return audioDir + String(file).replace(/^\/+/, ""); }))
      : files;
    return names.map(joinUrl);
  }

  function baseName(url) {
    return String(url).split("/").pop() || "";
  }

  async function urlUsable(url) {
    if (missingUrls.has(url)) return false;
    // 自选曲目是内存里的 blob URL，不需要探测。
    if (/^(blob:|data:)/.test(url)) return true;
    if (typeof window.fetch !== "function") return true;
    try {
      const response = await window.fetch(url, { method: "HEAD", cache: "no-store" });
      if (!response) return true;
      if (response.ok) return true;
      if (response.status === 403 || response.status === 404 || response.status === 410) {
        missingUrls.add(url);
        return false;
      }
      return true;
    } catch (error) {
      // file:// 或平台桥接不支持 HEAD 时按“存在”处理，交给 audio 元素的 error 事件兜底。
      return true;
    }
  }

  function isBlockedError(error) {
    const name = error && error.name ? String(error.name) : "";
    return name === "NotAllowedError" || name === "SecurityError";
  }

  function playUrl(slot, url, loop) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timer = window.setTimeout(function () {
        finish(resolve, url);
      }, 9000);
      function finish(callback, value) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        slot.el.removeEventListener("playing", onPlaying);
        slot.el.removeEventListener("error", onError);
        callback(value);
      }
      function onPlaying() {
        finish(resolve, url);
      }
      function onError() {
        finish(reject, new Error("音频无法播放：" + url));
      }
      slot.el.addEventListener("playing", onPlaying);
      slot.el.addEventListener("error", onError);
      slot.el.loop = loop !== false;
      slot.el.src = url;
      try {
        slot.el.load();
      } catch (error) {
        /* 忽略 */
      }
      const started = slot.el.play();
      if (started && typeof started.catch === "function") started.catch(function (error) {
        finish(reject, error);
      });
    });
  }

  async function startSlot(slot, files, token, loop) {
    for (let index = 0; index < files.length; index += 1) {
      if (token !== state.playToken) return "";
      const url = files[index];
      if (!(await urlUsable(url))) continue;
      try {
        await playUrl(slot, url, loop);
        slot.url = url;
        slot.playing = true;
        state.needGesture = false;
        return url;
      } catch (error) {
        if (isBlockedError(error)) {
          state.needGesture = true;
          return "";
        }
        missingUrls.add(url);
      }
    }
    return "";
  }

  function idleSlot(pool) {
    for (let index = 0; index < pool.slots.length; index += 1) {
      if (index !== pool.active) return index;
    }
    return 0;
  }

  async function activatePool(pool, files, gain, token, options) {
    const opts = options || {};
    const previousIndex = pool.active;
    const previous = previousIndex >= 0 ? pool.slots[previousIndex] : null;
    if (!files.length) {
      if (previous) retireSlot(previous, opts.fadeMs);
      pool.active = -1;
      return "";
    }
    const index = idleSlot(pool);
    const slot = pool.slots[index];
    const url = await startSlot(slot, files, token, opts.loop !== false);
    if (url && token !== state.playToken) {
      // 这次激活已经被更新的阶段取代：刚开始的这个元素要收掉，
      // 否则会留下一个没人管的正在播放的元素（表现为两首曲子同时响）。
      retireSlot(slot, numberOr(defaults.fadeRampMs, 160));
      return "";
    }
    if (!url) {
      if (previous) retireSlot(previous, opts.fadeMs);
      pool.active = -1;
      return "";
    }
    pool.active = index;
    fadeSlot(slot, gain, opts.fadeMs);
    if (previous && previous !== slot) retireSlot(previous, opts.fadeMs);
    return url;
  }

  function retireSlot(slot, ms) {
    if (!slot.playing) {
      fadeSlot(slot, 0, 0);
      return;
    }
    const fade = numberOr(ms, numberOr(defaults.crossfadeMs, 2400));
    fadeSlot(slot, 0, fade);
    window.setTimeout(function () {
      if (slot.level > 0) return;
      slot.playing = false;
      slot.url = "";
      try {
        slot.el.pause();
        slot.el.removeAttribute("src");
        slot.el.load();
      } catch (error) {
        /* 忽略 */
      }
    }, fade + 120);
  }

  /* ---------- 阶段 ---------- */

  // 解析优先级：手动锁定 > 远端场景（story 广播） > 本页场景 > 今日流程步骤 > 默认阶段
  function resolveKey() {
    if (state.forcedStage && manifest.stages[state.forcedStage]) return state.forcedStage;
    if (state.sceneStage && manifest.stages[state.sceneStage]) return state.sceneStage;
    const mapped = (manifest.flowStageMap || {})[state.stepId];
    if (mapped && manifest.stages[mapped]) return mapped;
    const fallback = manifest.defaultStage;
    if (fallback && manifest.stages[fallback]) return fallback;
    return stageKeys[0];
  }

  function stageGain(stage) {
    return clamp(numberOr(stage.gain, numberOr(defaults.stageGain, 0.6)), 0, 1);
  }

  function setStatus() {
    if (!ui.panel) return;
    const stage = manifest.stages[state.currentKey];
    let text = "";
    if (staleBuild) {
      // 浏览器缓存了旧脚本（页面里写的 expect 与本文件 BUILD 不一致）
      text = "背景音乐脚本是旧版本，强刷页面（Ctrl+F5）后生效";
    } else if (!pageConfig.play) {
      text = state.sceneStage || state.currentKey
        ? "本页不播放（由主控台播放）"
        : "此页不播放背景音乐";
    } else if (!prefs.enabled) {
      text = "音乐已关闭";
    } else if (state.needGesture) {
      text = "浏览器拦截了自动播放，点击页面任意处开始";
    } else if (state.missingStageKey === state.currentKey) {
      const first = (manifest.stages[state.currentKey].files || [])[0] || "";
      text = "缺少音频文件：" + first + "（放进 " + displayBase() + " 目录）";
    } else if (state.currentUrl) {
      const trackName = state.currentName ? state.currentName : baseName(state.currentUrl);
      text = (stage ? stage.label : state.currentKey) + "｜" + trackName;
    } else {
      text = stage ? stage.label : "等待开始";
    }
    // 手动锁定时说明白：这时 story 的模块切换不会改变曲目
    if (state.forcedStage) text += "（手动锁定）";
    else if (state.sceneStage) text += "（临时切换）";
    ui.status.textContent = text;
    // 关闭音乐时把「阶段 / 音量 / 导入 / 曲目列表」收起来，只留开关；
    // 但脚本版本过期这类提醒仍然要能看到。
    if (ui.panel && ui.panel.classList) ui.panel.classList.toggle("off", prefs.enabled !== true);
    if (ui.status) ui.status.hidden = prefs.enabled !== true && !staleBuild;
    ui.toggle.textContent = prefs.enabled ? "音乐：开" : "音乐：关";
    ui.toggle.setAttribute("aria-pressed", prefs.enabled ? "true" : "false");
    ui.toggle.classList.toggle("on", prefs.enabled);
    if (ui.select.value !== (state.forcedStage || "")) ui.select.value = state.forcedStage || "";
    if (ui.target && !targetTouched && manifest.stages[state.currentKey]) ui.target.value = state.currentKey;
  }

  async function applyStage(options) {
    const opts = options || {};
    await ensureCustomReady();
    const key = resolveKey();
    const token = (state.playToken += 1);
    const changed = key !== state.currentKey;
    state.currentKey = key;
    state.missingStageKey = "";
    state.currentUrl = "";
    setStatus();
    if (!prefs.enabled || !pageConfig.play) {
      if (opts.stopWhenDisabled !== false) stopAll();
      return key;
    }
    const graph = ensureGraph();
    if (graph && graph.state === "suspended") {
      try {
        await graph.resume();
      } catch (error) {
        /* 等待用户手势 */
      }
    }
    const stage = manifest.stages[key];
    const fadeMs = numberOr(defaults.crossfadeMs, 2400);
    // 指派了自选曲目的阶段：先试自选音频，失败再退回内置曲目候选项
    const custom = assignedTrack(key);
    const customUrl = custom ? trackUrl(custom) : "";
    const sources = customUrl ? [customUrl].concat(fileList(stage, "files")) : fileList(stage, "files");
    const url = await activatePool(pools.main, sources, stageGain(stage), token, { fadeMs: fadeMs });
    if (token !== state.playToken) return key;
    state.currentUrl = url;
    state.currentName = url && customUrl && url === customUrl ? String(custom.name || "") : "";
    if (!url) state.missingStageKey = key;

    const bedFiles = stage.bed ? fileList(stage, "bed") : [];
    if (bedFiles.length) {
      await activatePool(pools.bed, bedFiles, clamp(numberOr(stage.bed.gain, 0.25), 0, 1), token, { fadeMs: fadeMs });
    } else {
      await activatePool(pools.bed, [], 0, token, { fadeMs: fadeMs });
    }

    if (stage.stinger && (changed || opts.force) && url) {
      const now = Date.now();
      if (now - lastStingerAt >= numberOr(defaults.stingerMinGapMs, 20000)) {
        const stingerUrl = await activatePool(pools.stinger, fileList(stage, "stinger"), clamp(numberOr(stage.stinger.gain, 0.5), 0, 1), token, {
          fadeMs: numberOr(defaults.fadeRampMs, 160),
          loop: false,
        });
        // 只有真的响过才占用间隔，否则被取代的那次会把机会吃掉。
        if (stingerUrl) lastStingerAt = Date.now();
      }
    }
    setStatus();
    return key;
  }

  function stopAll() {
    state.playToken += 1;
    state.currentUrl = "";
    Object.keys(pools).forEach(function (name) {
      const pool = pools[name];
      pool.slots.forEach(function (slot) {
        retireSlot(slot, numberOr(defaults.fadeRampMs, 160));
      });
      pool.active = -1;
    });
  }

  /* ---------- 控制条 ---------- */

  const ui = {};

  function stageOptions(withAuto) {
    const list = withAuto ? ['<option value="">' + AUTO_LABEL + "</option>"] : [];
    return list
      .concat(stageKeys.map(function (key) {
        const mark = assignedTrack(key) ? "（自选）" : "";
        return '<option value="' + key + '">' + escapeHtml((manifest.stages[key].label || key) + mark) + "</option>";
      }))
      .join("");
  }

  function buildUi() {
    const container = document.getElementById(CONTAINER_ID);
    const panel = document.createElement("div");
    panel.className = container ? "ato-bgm-bar" : "ato-bgm-bar ato-bgm-floating";
    panel.setAttribute("data-term-ignore", "");
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "背景音乐");
    const options = stageOptions(true);
    // data-dashboard-readonly-allowed：音乐只是本机偏好，不写战役存档，
    // 因此另一个主控台持有编辑权（页面只读）时依然可以开关。
    // ato-bgm-only-on：音乐关闭时这些元素会被隐藏，只留开关（见 injectStyles 的 .off 规则）。
    panel.innerHTML =
      '<div class="ato-bgm-row">' +
        '<button type="button" id="atoBgmToggle" aria-pressed="false" data-dashboard-readonly-allowed>音乐：关</button>' +
        '<label class="ato-bgm-field ato-bgm-only-on">阶段<select id="atoBgmStage" data-dashboard-readonly-allowed>' + options + "</select></label>" +
        '<label class="ato-bgm-field ato-bgm-volume ato-bgm-only-on">音量<input id="atoBgmVolume" type="range" min="0" max="100" step="5" data-dashboard-readonly-allowed></label>' +
      "</div>" +
      '<div class="ato-bgm-row ato-bgm-only-on">' +
        '<label class="ato-bgm-import" id="atoBgmImportLabel" title="选择一个本地音频文件，导入后指定它用在哪个阶段" data-dashboard-readonly-allowed>' +
          '导入自选 BGM<input type="file" id="atoBgmFile" accept="audio/*,.mp3,.ogg,.m4a,.wav,.flac,.opus" hidden data-dashboard-readonly-allowed>' +
        "</label>" +
        '<label class="ato-bgm-field">用在<select id="atoBgmTarget" data-dashboard-readonly-allowed>' + stageOptions(false) + "</select></label>" +
        '<span class="ato-bgm-note" id="atoBgmExtra" role="status" aria-live="polite"></span>' +
      "</div>" +
      // 状态文字单独一行：关闭音乐时只隐藏上面那些操作项，这行在需要提醒（例如脚本是旧版）时仍可见
      '<div class="ato-bgm-row"><span class="ato-bgm-status" id="atoBgmStatus" role="status" aria-live="polite"></span></div>' +
      '<ul class="ato-bgm-tracks ato-bgm-only-on" id="atoBgmTracks"></ul>';
    injectStyles();
    if (container) {
      container.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }
    ui.panel = panel;
    ui.toggle = panel.querySelector("#atoBgmToggle");
    ui.select = panel.querySelector("#atoBgmStage");
    ui.volume = panel.querySelector("#atoBgmVolume");
    ui.status = panel.querySelector("#atoBgmStatus");
    ui.file = panel.querySelector("#atoBgmFile");
    ui.target = panel.querySelector("#atoBgmTarget");
    ui.extra = panel.querySelector("#atoBgmExtra");
    ui.tracks = panel.querySelector("#atoBgmTracks");
    ui.volume.value = String(Math.round(clamp(numberOr(prefs.volume, 0.5), 0, 1) * 100));
    ui.select.value = prefs.stage || "";
    ui.target.value = state.currentKey && manifest.stages[state.currentKey] ? state.currentKey : stageKeys[0];
    ui.toggle.addEventListener("click", function () {
      setEnabled(!prefs.enabled);
    });
    ui.select.addEventListener("change", function () {
      if (ui.select.value) setStage(ui.select.value);
      else setAuto();
    });
    ui.volume.addEventListener("input", function () {
      setVolume(Number(ui.volume.value) / 100);
    });
    ui.target.addEventListener("change", function () {
      targetTouched = true;
    });
    ui.file.addEventListener("change", async function () {
      const file = ui.file.files && ui.file.files[0];
      if (!file) return;
      const result = await importCustomTrack(file, ui.target.value);
      if (!result.ok) setExtraStatus(result.error, true);
      else if (result.stage) setExtraStatus("已导入《" + result.track.name + "》→ " + (manifest.stages[result.stage].label || result.stage), false);
      else setExtraStatus("已导入《" + result.track.name + "》，还没有指定阶段", false);
      ui.file.value = "";
    });
    if (ui.tracks) {
      ui.tracks.addEventListener("click", function (event) {
        const button = event.target && event.target.closest ? event.target.closest("button[data-role='delete']") : null;
        if (!button) return;
        deleteCustomTrack(button.getAttribute("data-track") || "");
      });
      ui.tracks.addEventListener("change", function (event) {
        const select = event.target && event.target.dataset && event.target.dataset.role === "stage" ? event.target : null;
        if (!select) return;
        assignCustomTrack(select.getAttribute("data-track") || "", select.value);
      });
    }
    if (!customSupported()) {
      setExtraStatus("当前浏览器不支持本地保存自选音频", true);
      if (ui.file) ui.file.disabled = true;
    } else if (extraStatus) {
      setExtraStatus(extraStatus, extraStatusError);
    }
    refreshCustomUi();
    setStatus();
  }

  function formatSize(bytes) {
    const value = numberOr(bytes, 0);
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + "MB";
    return Math.max(1, Math.round(value / 1024)) + "KB";
  }

  // 重建曲目列表与阶段下拉里的「（自选）」标记
  function refreshCustomUi() {
    if (!ui.panel) return;
    if (ui.select) {
      const previous = ui.select.value;
      ui.select.innerHTML = stageOptions(true);
      ui.select.value = previous;
    }
    if (ui.target) {
      const previous = ui.target.value;
      ui.target.innerHTML = stageOptions(false);
      if (manifest.stages[previous]) ui.target.value = previous;
    }
    if (!ui.tracks) return;
    ui.tracks.innerHTML = customTracks.map(function (track) {
      const assignedTo = Object.keys(assignments).find(function (key) { return assignments[key] === track.id; }) || "";
      const rowOptions = ['<option value="">（不指定）</option>']
        .concat(stageKeys.map(function (key) {
          return '<option value="' + key + '"' + (key === assignedTo ? " selected" : "") + ">" +
            escapeHtml(manifest.stages[key].label || key) + "</option>";
        }))
        .join("");
      return '<li class="ato-bgm-track" data-track="' + escapeHtml(track.id) + '">' +
        '<span class="ato-bgm-track-name" title="' + escapeHtml(track.fileName || track.name) + '">' +
          escapeHtml(track.name || track.fileName || track.id) + "</span>" +
        '<span class="ato-bgm-size">' + formatSize(track.size) + "</span>" +
        '<label class="ato-bgm-field">用在<select data-role="stage" data-track="' + escapeHtml(track.id) + '" data-dashboard-readonly-allowed>' + rowOptions + "</select></label>" +
        '<button type="button" class="ato-bgm-icon" data-role="delete" data-track="' + escapeHtml(track.id) + '" data-dashboard-readonly-allowed>删除</button>' +
        "</li>";
    }).join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function injectStyles() {
    if (document.getElementById("atoBgmStyles")) return;
    const style = document.createElement("style");
    style.id = "atoBgmStyles";
    style.textContent = [
      ".ato-bgm-bar{display:block;font-size:12px;color:inherit}",
      ".bgm-controls:not(:first-child){margin-top:8px}",
      ".ato-bgm-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".ato-bgm-row+.ato-bgm-row{margin-top:6px}",
      // 音乐关闭时只留开关：隐藏其余操作项与曲目列表
      ".ato-bgm-bar.off .ato-bgm-only-on{display:none}",
      ".ato-bgm-bar button{font:inherit;padding:4px 10px;border-radius:6px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;cursor:pointer}",
      ".ato-bgm-bar button.on{border-color:#3f8f6f;color:#3f8f6f}",
      ".ato-bgm-field{display:flex;gap:4px;align-items:center;white-space:nowrap}",
      ".ato-bgm-bar select{font:inherit;padding:3px 6px;border-radius:6px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;max-width:190px}",
      ".ato-bgm-volume input{width:90px}",
      ".ato-bgm-status{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.75}",
      ".ato-bgm-import{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1px dashed rgba(127,127,127,.6);cursor:pointer}",
      ".ato-bgm-import:hover{border-color:#3f8f6f}",
      ".ato-bgm-note{white-space:nowrap;opacity:.75}",
      ".ato-bgm-note.error{color:#c0574f;opacity:1}",
      ".ato-bgm-tracks{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}",
      ".ato-bgm-tracks:empty{display:none}",
      ".ato-bgm-track{display:flex;flex-wrap:wrap;gap:6px;align-items:center}",
      ".ato-bgm-track-name{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".ato-bgm-size{opacity:.6}",
      ".ato-bgm-floating{position:fixed;left:10px;bottom:10px;z-index:60;max-width:min(460px,92vw);padding:8px 10px;border-radius:8px;background:rgba(20,20,20,.86);color:#eee;box-shadow:0 2px 10px rgba(0,0,0,.35)}",
    ].join("\n");
    (document.head || document.body).appendChild(style);
  }

  /* ---------- 对外接口 ---------- */

  function setEnabled(on) {
    prefs.enabled = on === true;
    savePrefs();
    if (!prefs.enabled) {
      stopAll();
      setStatus();
      return prefs.enabled;
    }
    ensureGraph();
    applyStage({ force: true, stopWhenDisabled: false });
    return prefs.enabled;
  }

  function setStage(key) {
    const next = manifest.stages[key] ? String(key) : "";
    state.forcedStage = next;
    prefs.stage = next;
    savePrefs();
    if (ui.select) ui.select.value = next;
    return applyStage({ force: true, stopWhenDisabled: false });
  }

  function setAuto() {
    state.forcedStage = "";
    prefs.stage = "";
    savePrefs();
    if (ui.select) ui.select.value = "";
    return applyStage({ force: true, stopWhenDisabled: false });
  }

  function setVolume(value) {
    prefs.volume = clamp(numberOr(value, prefs.volume), 0, 1);
    savePrefs();
    applyGlobalLevel(numberOr(defaults.fadeRampMs, 160));
    if (ui.volume) ui.volume.value = String(Math.round(prefs.volume * 100));
    return prefs.volume;
  }

  function duck(on) {
    ducked = on === true;
    applyGlobalLevel(numberOr(defaults.duckRampMs, 400));
    return ducked;
  }

  function setFlowStage(stepId) {
    const next = stepId ? String(stepId) : "";
    if (next === state.stepId) return state.currentKey;
    state.stepId = next;
    // 控制台自己的阶段变了（勾步骤 / 下一天 / 换 Cycle）：撤销按钮或入口带来的临时切换，
    // 音乐回到跟随今日流程；下拉锁定（forcedStage）不受影响。
    const hadScene = state.sceneStage !== "";
    if (hadScene) state.sceneStage = "";
    if (state.forcedStage) {
      if (hadScene) setStatus();
      return state.currentKey;
    }
    return applyStage({ stopWhenDisabled: false });
  }

  // 临时场景（控制条的阶段按钮、故事/考察入口链接都走这里）：
  // 立即切曲，但不写入偏好；控制台阶段一变就自动切回跟随流程。
  function setScene(key) {
    const next = manifest.stages[key] ? String(key) : "";
    if (next === state.sceneStage) return state.currentKey;
    state.sceneStage = next;
    if (state.forcedStage) {
      setStatus();
      return state.currentKey;
    }
    return applyStage({ stopWhenDisabled: false });
  }

  function resume() {
    const graph = ensureGraph();
    if (!graph) return Promise.resolve(false);
    const settling = graph.state === "suspended" ? graph.resume() : Promise.resolve();
    return settling.then(function () {
      state.needGesture = false;
      if (prefs.enabled && !state.currentUrl) return applyStage({ force: true, stopWhenDisabled: false });
      setStatus();
      return true;
    }).catch(function () {
      return false;
    });
  }

  window.ATO_BGM = {
    version: manifest.version || 1,
    setFlowStage: setFlowStage,
    setScene: setScene,
    setStage: setStage,
    setAuto: setAuto,
    setEnabled: setEnabled,
    toggle: function () { return setEnabled(!prefs.enabled); },
    setVolume: setVolume,
    duck: duck,
    resume: resume,
    stop: stopAll,
    stages: function () { return stageKeys.slice(); },
    importTrack: importCustomTrack,
    assignTrack: assignCustomTrack,
    deleteTrack: deleteCustomTrack,
    tracks: function () {
      return customTracks.map(function (track) {
        return { id: track.id, name: track.name, fileName: track.fileName, size: track.size, stage: Object.keys(assignments).find(function (key) { return assignments[key] === track.id; }) || "" };
      });
    },
    state: function () {
      return {
        enabled: prefs.enabled,
        volume: prefs.volume,
        ducking: ducked === true,
        stage: state.currentKey,
        url: state.currentUrl,
        name: state.currentName,
        stepId: state.stepId,
        sceneStage: state.sceneStage,
        forcedStage: state.forcedStage,
        needGesture: state.needGesture,
        missing: Array.from(missingUrls),
        customTracks: customTracks.length,
        assignments: Object.assign({}, assignments),
        customSupported: customSupported(),
        play: pageConfig.play,
        ui: pageConfig.ui,
      };
    },
  };

  // 页面写了 expect 时，比对脚本自身版本，发现浏览器缓存了旧脚本就直接说出来
  function checkBuild() {
    if (!pageConfig.expect || pageConfig.expect === BUILD) return;
    staleBuild = true;
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[ATO-BGM] 脚本版本 " + BUILD + " 与页面期望的 " + pageConfig.expect +
        " 不一致：浏览器缓存了旧脚本，强刷（Ctrl+F5）后才会生效。");
    }
    setStatus();
  }

  function init() {
    if (pageConfig.ui) buildUi();
    window.addEventListener("pointerdown", unlockListener, { capture: true });
    window.addEventListener("keydown", unlockListener, { capture: true });
    checkBuild();
    // 自选曲目要在解析阶段前就绪；applyStage 内部会等这个 promise，
    // 这里不再自己补一次播放，免得和页面里的调用抢同一个阶段。
    ensureCustomReady().then(function () {
      if (prefs.enabled && pageConfig.play && !state.currentKey) applyStage({ force: true, stopWhenDisabled: false });
      else setStatus();
    });
  }

  function unlockListener() {
    if (!state.needGesture) return;
    resume().then(function (ok) {
      if (!ok) return;
      window.removeEventListener("pointerdown", unlockListener, { capture: true });
      window.removeEventListener("keydown", unlockListener, { capture: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function numberOr(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function createDisabledApi(reason) {
    return {
      version: 0,
      disabled: true,
      reason: reason,
      setFlowStage: function () { return ""; },
      setScene: function () { return ""; },
      setStage: function () { return ""; },
      setAuto: function () { return ""; },
      setEnabled: function () { return false; },
      toggle: function () { return false; },
      setVolume: function () { return 0; },
      duck: function () { return false; },
      importTrack: function () { return Promise.resolve({ ok: false, error: reason }); },
      assignTrack: function () { return Promise.resolve(""); },
      deleteTrack: function () { return Promise.resolve(false); },
      tracks: function () { return []; },
      resume: function () { return Promise.resolve(false); },
      stop: function () {},
      stages: function () { return []; },
      state: function () { return { enabled: false, stage: "", reason: reason }; },
    };
  }
})();

