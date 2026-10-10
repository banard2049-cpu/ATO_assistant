(() => {
  const STORAGE_KEY = "ato-term-language-v1";
  const state = { official: false, language: "fan", chinese: "fan" };
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("ato-term-language") : null;
  const originals = new WeakMap();
  const attrOriginals = new WeakMap();
  const sourceOriginals = new WeakMap();
  const normalizeLanguage = (value) => ["fan", "official", "en"].includes(value) ? value : null;
  const messageLanguage = (detail) => normalizeLanguage(detail?.language)
    || (typeof detail?.official === "boolean" ? (detail.official ? "official" : "fan") : null);
  const pairs = (window.ATO_TERMS || []).slice();
  // A pair may carry a "scope" selector: it then applies only inside matching
  // elements, and it replaces the unscoped pair with the same key there. That is
  // how the console can label its flow steps with the full official step names
  // (探索步骤/剧情步骤/末日步骤) while prose elsewhere keeps the short forms.
  const globalPairs = pairs.filter((pair) => !pair.scope);
  const scopeSelectors = [...new Set([...pairs.filter((pair) => pair.scope).map((pair) => pair.scope), ...(window.ATO_ENGLISH?.scopes || [])])];
  const scopedPairs = new Map(scopeSelectors.map((selector) => [
    selector,
    pairs.filter((pair) => pair.scope === selector),
  ]));
  const EMPTY_SCOPES = [];
  const byLength = (list) => list.slice().sort((a, b) => b.from.length - a.from.length);
  const pairLists = new Map();
  const pairsFor = (scopes) => {
    const key = scopes.join("\u0000");
    const cached = pairLists.get(key);
    if (cached) return cached;
    let list = globalPairs;
    if (scopes.length) {
      const overridden = new Set();
      const extra = [];
      for (const selector of scopes) {
        for (const pair of scopedPairs.get(selector) || []) {
          overridden.add(pair.from);
          extra.push(pair);
        }
      }
      list = [...globalPairs.filter((pair) => !overridden.has(pair.from)), ...extra];
    }
    const sorted = byLength(list);
    if (pairLists.size < 32) pairLists.set(key, sorted);
    return sorted;
  };
  // 按首字分桶，供逐字匹配查表用（同一首字内保持「长的先试」）。
  const pairIndexes = new Map();
  const indexFor = (scopes) => {
    const key = scopes.join("\u0000");
    const cached = pairIndexes.get(key);
    if (cached) return cached;
    const index = new Map();
    for (const pair of pairsFor(scopes)) {
      if (!pair.from) continue;
      const head = pair.from[0];
      const bucket = index.get(head);
      if (bucket) bucket.push(pair); else index.set(head, [pair]);
    }
    if (pairIndexes.size < 32) pairIndexes.set(key, index);
    return index;
  };
  const activeScopes = (element) => {
    if (!scopeSelectors.length || !element) return EMPTY_SCOPES;
    let found = null;
    for (const selector of scopeSelectors) {
      if (element.closest(selector)) (found ||= []).push(selector);
    }
    return found || EMPTY_SCOPES;
  };
  const isMainConsole = () => (location.pathname.endsWith("/") || /(^|\/)index\.html?$/.test(location.pathname))
    && !/\/(hero|aibp|technology|story|record|map|ss)(?:\/|$)/.test(location.pathname);
  const readStored = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return normalizeLanguage(value);
    } catch {
      return null;
    }
  };
  const writeStored = (language) => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
      localStorage.setItem("ato-term-chinese-language-v1", state.chinese);
    } catch {}
  };
  // The version chosen in this browser always wins. The campaign profile on the
  // main console is only consulted the first time, so a second console or a
  // campaign reload can no longer drag the page back to the other version.
  const resolveInitial = () => {
    const stored = readStored();
    if (stored) return stored;
    if (typeof window.ATOGetTermLanguage === "function") {
      try {
        return normalizeLanguage(window.ATOGetTermLanguage()) || "fan";
      } catch {
        return "fan";
      }
    }
    return "fan";
  };
  const adopt = (language) => {
    const changed = state.language !== language;
    state.language = language;
    state.official = language === "official";
    if (language !== "en") state.chinese = language;
    return changed;
  };
  // 术语只对「原文」套用一次：从左往右取最长命中，写进去的译文不会再被别的条目改写。
  // 之前是「按 from 长度倒序逐条 split/join」，短条目会连锁改写长条目刚写出来的官方名：
  // 「力量 => 狂怒」把 Market Forces 的官方名「市场力量」改成「市场狂怒」，
  // 「循环 => 故事集」把航行时间线的「循环纪」改成「剧情集纪」，
  // 「弩炮 => 弩炮枪」把「赫尔墨斯弩炮枪」改成「赫尔墨斯弩炮枪枪枪」。
  const translate = (value, scopes = EMPTY_SCOPES) => {
    if (state.language === "en") return window.ATO_ENGLISH?.translate(value, scopes) || value;
    if (!state.official || !value) return value;
    const index = indexFor(scopes);
    let out = "";
    let at = 0;
    while (at < value.length) {
      const bucket = index.get(value[at]);
      let matched = null;
      if (bucket) {
        for (const pair of bucket) {
          if (value.startsWith(pair.from, at)) { matched = pair; break; }
        }
      }
      if (matched) {
        out += matched.to;
        at += matched.from.length;
      } else {
        out += value[at];
        at += 1;
      }
    }
    return out;
  };
  // Regions that must keep their original wording: scripts/styles, the toggle
  // itself, the story reader, and anything explicitly marked data-term-ignore
  // (story summaries are prose, not UI labels).
  const SKIP_SELECTOR = "script,style,[data-term-toggle],[data-term-language],[data-term-language-option],#storyText,[data-term-ignore],[data-language-ignore],[data-user-content],textarea,[contenteditable=true]";
  const ENGLISH_SKIP_SELECTOR = "script,style,[data-term-toggle],[data-term-language],[data-term-language-option],#termLanguageToggle,#storyText,[data-language-ignore],[data-user-content],textarea,[contenteditable=true]";
  const shouldSkip = (element) => !element || element.closest(state.language === "en" ? ENGLISH_SKIP_SELECTOR : SKIP_SELECTOR);
  const rememberText = (node) => {
    const saved = originals.get(node);
    // Nodes and attributes can be reused by renderers. A newly written source
    // must replace the old source, but our own display writes must never do so.
    if (!saved || node.nodeValue !== saved.rendered) {
      const next = { source: node.nodeValue, rendered: node.nodeValue };
      originals.set(node, next);
      return next;
    }
    return saved;
  };
  function apply(root = document) {
    const scope = root.nodeType ? root : document;
    const variants = [...(scope.querySelectorAll?.("[data-term-variant]") || [])];
    if (scope.matches?.("[data-term-variant]")) variants.unshift(scope);
    for (const element of variants) {
      const variant = state.language === "en" && !element.parentElement?.querySelector('[data-term-variant="en"]')
        ? "fan" : state.language;
      element.hidden = element.dataset.termVariant !== variant;
    }
    const sourceElements = [...(scope.querySelectorAll?.("[data-english-source],[data-english-text]") || [])];
    if (scope.matches?.("[data-english-source],[data-english-text]")) sourceElements.unshift(scope);
    for (const element of sourceElements) {
      if (!sourceOriginals.has(element)) sourceOriginals.set(element, element.innerHTML);
      if (state.language === "en") {
        const source = element.dataset.englishText || window.ATO_ENGLISH?.source(element.dataset.englishSource);
        const next = source || "English source text is unavailable. Please refer to the printed rules.";
        if (element.textContent !== next) element.textContent = next;
      } else if (element.dataset.englishDisplayed === "true") {
        element.innerHTML = sourceOriginals.get(element);
      }
      element.dataset.englishDisplayed = String(state.language === "en");
    }
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    if (scope.nodeType === Node.TEXT_NODE) nodes.push(scope);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.parentElement || shouldSkip(node.parentElement) || node.parentElement.closest('[data-english-displayed="true"]')) continue;
      const saved = rememberText(node);
      const prose = state.language === "en" && node.parentElement.closest("[data-term-ignore]")
        && !node.parentElement.closest("[data-english-ui]");
      saved.rendered = prose ? (window.ATO_ENGLISH?.exact(saved.source) || saved.source) : translate(saved.source, activeScopes(node.parentElement));
      if (node.nodeValue !== saved.rendered) node.nodeValue = saved.rendered;
    }
    const elements = [...(scope.querySelectorAll?.("[title],[aria-label],[alt],input[placeholder],textarea[placeholder]") || [])];
    if (scope.matches?.("[title],[aria-label],[alt],[placeholder]")) elements.unshift(scope);
    elements.forEach((el) => {
      if (el.closest((state.language === "en" ? ENGLISH_SKIP_SELECTOR : SKIP_SELECTOR).replace(",textarea", ""))) return;
      const scopes = activeScopes(el);
      const attrs = attrOriginals.get(el) || {};
      for (const name of ["title", "aria-label", "placeholder", "alt"]) {
        if (name === "title" && el.hasAttribute("data-user-title")) continue;
        if (!el.hasAttribute(name)) { delete attrs[name]; continue; }
        const current = el.getAttribute(name);
        if (!attrs[name] || current !== attrs[name].rendered) attrs[name] = { source: current, rendered: current };
        attrs[name].rendered = translate(attrs[name].source, scopes);
        if (current !== attrs[name].rendered) el.setAttribute(name, attrs[name].rendered);
      }
      attrOriginals.set(el, attrs);
    });
  }
  function refresh() {
    apply(document.body || document);
    apply(document.head || document);
    document.documentElement.lang = state.language === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.atoLanguage = state.language;
  }
  function init() {
    const englishStyle = document.createElement("style");
    englishStyle.textContent = 'html[data-ato-language="en"] :is(.skill-name-en,.mnemos-title-en,[data-english-caption],.c45-wish-copy-column[lang="zh-CN"]){display:none}';
    document.head.appendChild(englishStyle);
    try { state.chinese = localStorage.getItem("ato-term-chinese-language-v1") === "official" ? "official" : "fan"; } catch {}
    adopt(resolveInitial());
    // The console owns the language picker in its 杂项设置 panel: one button
    // showing the active language, and a popup holding the other two choices.
    // The fixed fallback only exists for a console build that lost that markup.
    const LANGUAGE_ORDER = ["fan", "official", "en"];
    const languageNames = () => state.language === "en"
      ? { fan: "Fan Chinese", official: "Official Chinese", en: "English" }
      : { fan: "民间翻译", official: "官方翻译", en: "English" };
    const pickerLabel = () => state.language === "en" ? "Interface language" : "界面语言";
    let trigger = document.querySelector("#termLanguageToggle, [data-term-toggle]");
    let floating = false;
    if (!trigger && isMainConsole()) {
      trigger = document.createElement("button");
      trigger.type = "button";
      trigger.id = "termLanguageToggle";
      trigger.className = "secondary";
      trigger.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9999";
      (document.body || document.documentElement).appendChild(trigger);
      floating = true;
    }
    let menu = null;
    const options = [];
    if (trigger) {
      trigger.dataset.termToggle = "true";
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      menu = trigger.parentElement?.querySelector(".settings-language-menu")
        || document.getElementById("termLanguageMenu");
      if (!menu) {
        menu = document.createElement("div");
        menu.id = "termLanguageMenu";
        menu.className = "settings-language-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("data-language-ignore", "");
        if (floating) menu.style.cssText = "position:fixed;bottom:62px;right:16px;z-index:9999;display:grid;gap:4px;padding:6px";
        trigger.after(menu);
      }
      for (const language of LANGUAGE_ORDER) {
        let option = menu.querySelector(`[data-term-language-option="${language}"]`);
        if (!option) {
          option = document.createElement("button");
          option.type = "button";
          option.className = "secondary";
          option.setAttribute("role", "menuitemradio");
          option.dataset.termLanguageOption = language;
          if (trigger.hasAttribute("data-dashboard-readonly-allowed")) {
            option.setAttribute("data-dashboard-readonly-allowed", "");
          }
          menu.appendChild(option);
        }
        options.push(option);
      }
      menu.hidden = true;
    }
    const closeMenu = () => {
      if (!trigger || !menu) return;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    const openMenu = () => {
      if (!trigger || !menu) return;
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    };
    const updatePicker = () => {
      if (!trigger) return;
      const names = languageNames();
      const label = pickerLabel();
      trigger.textContent = names[state.language];
      trigger.setAttribute("aria-label", label + (state.language === "en" ? ": " : "：") + names[state.language]);
      trigger.title = trigger.getAttribute("aria-label");
      if (menu) menu.setAttribute("aria-label", label);
      for (const option of options) {
        const language = option.dataset.termLanguageOption;
        option.textContent = names[language];
        option.setAttribute("aria-checked", String(language === state.language));
      }
    };
    const setLanguage = (language, persist = true) => {
      if (!normalizeLanguage(language)) return;
      adopt(language);
      if (persist) {
        writeStored(state.language);
        if (typeof window.ATOSetTermLanguage === "function") {
          try {
            window.ATOSetTermLanguage(state.language);
          } catch (error) {
            console.warn("无法同步术语版本：", error);
          }
        }
        const detail = { language: state.language, official: state.official };
        channel?.postMessage(detail);
        window.dispatchEvent(new CustomEvent("ato-language-changed", { detail }));
      }
      updatePicker();
      refresh();
    };
    window.ATO_LANGUAGE = { get: () => state.language, set: setLanguage, translate, refresh };
    // Browser dialogs are outside the DOM, so display their UI messages through
    // the same adapter. A prompt's default is user data and is preserved.
    for (const name of ["alert", "confirm", "prompt"]) {
      if (typeof window[name] !== "function") continue;
      const native = window[name].bind(window);
      window[name] = (message, ...args) => native(translate(String(message)), ...args);
    }
    // The trigger shows the active language and opens the popup; choosing an
    // option applies it and closes the popup. Outside clicks and Escape close it.
    if (trigger) {
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        if (menu.hidden) openMenu(); else closeMenu();
      });
      for (const option of options) {
        option.addEventListener("click", () => {
          setLanguage(option.dataset.termLanguageOption);
          closeMenu();
          trigger.focus();
        });
      }
      document.addEventListener("click", (event) => {
        if (!menu || menu.hidden) return;
        if (trigger.contains(event.target) || menu.contains(event.target)) return;
        closeMenu();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !menu || menu.hidden) return;
        closeMenu();
        trigger.focus();
      });
    }
    updatePicker();
    refresh();
    // These listeners stay active on every page, including the module pages that
    // have no toggle button of their own: a page already open must follow the
    // version chosen in another tab instead of keeping a stale one until reload.
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY || !normalizeLanguage(event.newValue)) return;
      setLanguage(event.newValue, false);
    });
    window.addEventListener("ato-term-language-changed", (event) => {
      const language = messageLanguage(event.detail);
      if (language) setLanguage(language, false);
    });
    channel?.addEventListener("message", (event) => {
      const language = messageLanguage(event.data);
      if (language) setLanguage(language, false);
    });
    // Content rendered later (save round-trips, cycle switches, dialogs) must be
    // translated too. Coalesce a burst of insertions into one pass.
    let scheduled = false;
    const pending = new Set();
    const schedule = (node) => {
      pending.add(node);
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        const roots = [...pending];
        pending.clear();
        for (const root of roots) apply(root);
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else setTimeout(run, 16);
    };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") {
          if (originals.get(m.target)?.rendered !== m.target.nodeValue && !shouldSkip(m.target.parentElement)) schedule(m.target);
        } else if (m.type === "attributes") {
          const skip = m.target.closest((state.language === "en" ? ENGLISH_SKIP_SELECTOR : SKIP_SELECTOR).replace(",textarea", ""));
          if (attrOriginals.get(m.target)?.[m.attributeName]?.rendered !== m.target.getAttribute(m.attributeName) && !skip) schedule(m.target);
        } else {
          for (const n of m.addedNodes) {
            if ([Node.ELEMENT_NODE, Node.DOCUMENT_FRAGMENT_NODE, Node.TEXT_NODE].includes(n.nodeType)) schedule(n);
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder", "alt"],
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
