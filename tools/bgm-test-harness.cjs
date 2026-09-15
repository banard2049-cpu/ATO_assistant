/* BGM 测试替身：最小的 DOM / Web Audio / fetch 实现，供 tools/test-bgm-player.cjs 使用。
 * 只做测试用，不参与打包（tools/ 不进发布包）。 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { URL: NodeURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const manifestSource = fs.readFileSync(path.join(ROOT, "assets/bgm/manifest.js"), "utf8");
const playerSource = fs.readFileSync(path.join(ROOT, "assets/bgm/bgm.js"), "utf8");

function fakeElement(tag) {
  const listeners = new Map();
  const queries = new Map();
  const element = {
    tagName: String(tag || "div").toUpperCase(),
    children: [],
    attributes: {},
    className: "",
    id: "",
    textContent: "",
    value: "",
    innerHTML: "",
    volume: 1,
    src: "",
    loop: false,
    preload: "",
    paused: true,
    classList: (() => {
      const names = new Set();
      return {
        toggle(name, force) {
          const on = force === undefined ? !names.has(name) : force === true;
          if (on) names.add(name); else names.delete(name);
          return on;
        },
        add(name) { names.add(name); },
        remove(name) { names.delete(name); },
        contains(name) { return names.has(name); },
      };
    })(),
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(handler);
    },
    removeEventListener(name, handler) {
      const list = listeners.get(name) || [];
      listeners.set(name, list.filter((item) => item !== handler));
    },
    dispatch(name) {
      (listeners.get(name) || []).slice().forEach((handler) => handler({ type: name }));
    },
    querySelector(selector) {
      if (!queries.has(selector)) queries.set(selector, fakeElement("span"));
      return queries.get(selector);
    },
    // 替身不解析 innerHTML，这里给个空列表即可（按钮列表本身由 innerHTML 断言覆盖）
    querySelectorAll() {
      return [];
    },
    play() {
      this.paused = false;
      if (this.failPlay) return Promise.reject(Object.assign(new Error("blocked"), { name: this.failPlay }));
      const element = this;
      setTimeout(() => element.dispatch("playing"), 0);
      return Promise.resolve();
    },
    pause() { this.paused = true; },
    load() {},
  };
  return element;
}

function createHarness(options = {}) {
  const exists = options.exists || (() => true);
  const audios = [];
  const gainOwners = new Map();
  const prefsStore = options.localStorage || new Map();
  const fakeIndexedDb = options.indexedDb === null ? null : (options.indexedDb || createFakeIndexedDb());
  const objectUrls = new Map();
  let objectUrlSeq = 0;
  // bgm.js / manifest.js 会用 new URL(...) 解析音频目录，替身必须真的能 new，
  // 否则解析一路抛错退化成页面相对路径（历史 bug 就是这条路径掩盖的）。
  const UrlClass = function Url(...args) { return new NodeURL(...args); };
  UrlClass.prototype = NodeURL.prototype;
  UrlClass.createObjectURL = (blob) => {
    objectUrlSeq += 1;
    const url = "blob:ato-bgm/" + objectUrlSeq;
    objectUrls.set(url, blob);
    return url;
  };
  UrlClass.revokeObjectURL = (url) => {
    objectUrls.delete(url);
  };

  function AudioClass() {
    const element = fakeElement("audio");
    element.failPlay = options.failPlay ? options.failPlay(element) : "";
    audios.push(element);
    return element;
  }

  function createGainNode() {
    const node = {
      value: 0,
      gain: {
        get value() { return node.value; },
        set value(next) { node.value = next; },
        cancelScheduledValues() {},
        setValueAtTime() {},
        linearRampToValueAtTime(target) { node.value = target; },
      },
      connect() {},
    };
    return node;
  }

  const master = createGainNode();
  let gainCalls = 0;
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: async () => { context.state = "running"; },
    createGain: () => (gainCalls++ === 0 ? master : createGainNode()),
    createMediaElementSource(element) {
      return { connect(node) { gainOwners.set(node, element); } };
    },
  };

  const controls = fakeElement("div");
  const body = fakeElement("body");
  const head = fakeElement("head");
  const documentStub = {
    readyState: "complete",
    head,
    body,
    getElementById: (id) => (id === "bgmControls" ? controls : null),
    createElement: (tag) => fakeElement(tag),
    addEventListener() {},
  };

  const timers = new Set();
  const sandbox = {
    console,
    document: documentStub,
    // 轮询/心跳计时器不能把测试进程钉住，统一 unref；并记录下来供 close() 清理
    setTimeout: (...args) => {
      const timer = setTimeout(...args);
      timers.add(timer);
      if (timer && typeof timer.unref === "function") timer.unref();
      return timer;
    },
    clearTimeout: (timer) => {
      timers.delete(timer);
      clearTimeout(timer);
    },
    setInterval: (...args) => {
      const timer = setInterval(...args);
      timers.add(timer);
      if (timer && typeof timer.unref === "function") timer.unref();
      return timer;
    },
    clearInterval: (timer) => {
      timers.delete(timer);
      clearInterval(timer);
    },
    fetch: async (url) => {
      const found = Boolean(exists(String(url)));
      return { ok: found, status: found ? 200 : 404 };
    },
    localStorage: {
      getItem: (key) => (prefsStore.has(key) ? prefsStore.get(key) : null),
      setItem: (key, value) => prefsStore.set(key, String(value)),
      removeItem: (key) => prefsStore.delete(key),
    },
    Audio: AudioClass,
    AudioContext: function () { return context; },
    Blob,
    indexedDB: fakeIndexedDb,
    URL: UrlClass,
    addEventListener() {},
    removeEventListener() {},
  };
  sandbox.window = sandbox;
  // 模拟 manifest.js 记录的脚本目录；传 "" 可测「取不到脚本目录」的退化路径
  const scriptDir = options.scriptDir === undefined ? "http://ato.local/assets/bgm/" : options.scriptDir;
  if (scriptDir) sandbox.ATO_BGM_SCRIPT_DIR = scriptDir;
  // 页面角色，对应页面里的 window.ATO_BGM_CONFIG
  if (options.config) sandbox.ATO_BGM_CONFIG = options.config;
  vm.createContext(sandbox);
  vm.runInContext(manifestSource, sandbox, { filename: "assets/bgm/manifest.js" });
  // 允许用例覆盖清单字段（例如 audioDir: "" 关掉备用音频目录），必须在加载播放器之前改
  if (options.manifest) Object.assign(sandbox.ATO_BGM_MANIFEST, options.manifest);
  // 测试里把淡入淡出与远端轮询压短，避免每个用例等好几秒。
  Object.assign(sandbox.ATO_BGM_MANIFEST.defaults, {
    crossfadeMs: 40,
    remotePollMs: 60,
    remoteHeartbeatMs: 60,
  }, options.defaults || {});
  vm.runInContext(playerSource, sandbox, { filename: "assets/bgm/bgm.js" });

  // blob URL 直接回整串，便于断言「现在放的是自选曲目」
  const label = (src) => (String(src).startsWith("blob:") ? src : String(src).split("/").pop());

  return {
    sandbox,
    api: sandbox.ATO_BGM,
    prefsStore,
    controls,
    audios,
    gainOwners,
    master,
    objectUrls,
    indexedDb: fakeIndexedDb,
    // 模拟关掉这个标签页：清掉它创建的轮询/心跳计时器
    close() {
      timers.forEach((timer) => {
        clearTimeout(timer);
        clearInterval(timer);
      });
      timers.clear();
    },
    panel: () => controls.children[controls.children.length - 1],
    playing() {
      return audios.filter((element) => element.src && !element.paused).map((element) => label(element.src));
    },
    loudest() {
      let best = "";
      let bestGain = 0.001;
      gainOwners.forEach((element, node) => {
        if (!element.src || element.paused) return;
        if (node.value > bestGain) {
          bestGain = node.value;
          best = label(element.src);
        }
      });
      return best;
    },
  };
}

/* 最小的 IndexedDB 替身：只实现 bgm.js 用到的那几个方法。
 * 回调必须异步触发——真实 IDB 也是异步的，而 bgm.js 先拿到 request 再挂 onsuccess。 */
function createFakeIndexedDb() {
  const data = new Map();
  function makeRequest(value) {
    const request = { result: undefined, onsuccess: null, onerror: null };
    setTimeout(() => {
      request.result = value;
      if (typeof request.onsuccess === "function") request.onsuccess({ target: request });
    }, 0);
    return request;
  }
  const objectStore = {
    getAll: () => makeRequest(Array.from(data.values())),
    put: (record) => {
      data.set(record.id, record);
      return makeRequest(record.id);
    },
    delete: (id) => {
      data.delete(id);
      return makeRequest(undefined);
    },
  };
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => objectStore,
    transaction: () => ({ objectStore: () => objectStore }),
  };
  return {
    open() {
      const request = { result: db, onsuccess: null, onupgradeneeded: null, onerror: null };
      setTimeout(() => {
        if (typeof request.onupgradeneeded === "function") request.onupgradeneeded({ target: request });
        if (typeof request.onsuccess === "function") request.onsuccess({ target: request });
      }, 0);
      return request;
    },
    __data: data,
  };
}

/* 造一个 File 样子的对象：Blob 本体 + name/type，importCustomTrack 会原样存进 IndexedDB。 */
function makeAudioFile(name, bytes = 16, type = "audio/mpeg") {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, "name", { value: name, enumerable: true });
  return blob;
}

async function waitFor(check, label) {
  // 机器忙时（多个测试/进程并行）800ms 会偶发超时，这里留足余量。
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("等待超时：" + label);
}

module.exports = { ROOT, manifestSource, playerSource, createHarness, createFakeIndexedDb, makeAudioFile, waitFor };
