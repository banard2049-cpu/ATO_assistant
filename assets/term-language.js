(() => {
  const STORAGE_KEY = "ato-term-language-v1";
  const state = { official: false };
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("ato-term-language") : null;
  const originals = new WeakMap();
  const attrOriginals = new WeakMap();
  const pairs = (window.ATO_TERMS || []).slice();
  // A pair may carry a "scope" selector: it then applies only inside matching
  // elements, and it replaces the unscoped pair with the same key there. That is
  // how the console can label its flow steps with the full official step names
  // (探索步骤/剧情步骤/末日步骤) while prose elsewhere keeps the short forms.
  const globalPairs = pairs.filter((pair) => !pair.scope);
  const scopeSelectors = [...new Set(pairs.filter((pair) => pair.scope).map((pair) => pair.scope))];
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
      return value === "official" || value === "fan" ? value : null;
    } catch {
      return null;
    }
  };
  const writeStored = (official) => {
    try {
      localStorage.setItem(STORAGE_KEY, official ? "official" : "fan");
    } catch {}
  };
  // The version chosen in this browser always wins. The campaign profile on the
  // main console is only consulted the first time, so a second console or a
  // campaign reload can no longer drag the page back to the other version.
  const resolveInitial = () => {
    const stored = readStored();
    if (stored) return stored === "official";
    if (typeof window.ATOGetTermLanguage === "function") {
      try {
        return window.ATOGetTermLanguage() === "official";
      } catch {
        return false;
      }
    }
    return false;
  };
  const adopt = (official) => {
    const changed = state.official !== official;
    state.official = official;
    return changed;
  };
  const translate = (value, scopes = EMPTY_SCOPES) => {
    if (!state.official || !value) return value;
    let out = value;
    for (const pair of pairsFor(scopes)) out = out.split(pair.from).join(pair.to);
    return out;
  };
  // Regions that must keep their original wording: scripts/styles, the toggle
  // itself, the story reader, and anything explicitly marked data-term-ignore
  // (story summaries are prose, not UI labels).
  const SKIP_SELECTOR = "script,style,[data-term-toggle],#storyText,[data-term-ignore]";
  function apply(root = document) {
    const scope = root.nodeType ? root : document;
    const variants = [...(scope.querySelectorAll?.("[data-term-variant]") || [])];
    if (scope.matches?.("[data-term-variant]")) variants.unshift(scope);
    for (const element of variants) {
      element.hidden = element.dataset.termVariant !== (state.official ? "official" : "fan");
    }
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.parentElement || node.parentElement.closest(SKIP_SELECTOR)) continue;
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      node.nodeValue = translate(originals.get(node), activeScopes(node.parentElement));
    }
    scope.querySelectorAll?.("[title],[aria-label],input[placeholder],textarea[placeholder]").forEach((el) => {
      if (el.closest(SKIP_SELECTOR)) return;
      const scopes = activeScopes(el);
      const attrs = attrOriginals.get(el) || {};
      for (const name of ["title", "aria-label", "placeholder"]) {
        if (el.hasAttribute(name) && attrs[name] === undefined) attrs[name] = el.getAttribute(name);
        if (attrs[name] !== undefined) el.setAttribute(name, translate(attrs[name], scopes));
      }
      attrOriginals.set(el, attrs);
    });
  }
  function updateButton(button) {
    // The label names the version a click switches TO, so it always reads
    // "切换为…翻译" whichever version is active now.
    const label = state.official ? "切换为民间翻译" : "切换为官方翻译";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(state.official));
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  function refresh() {
    apply(document.body || document);
  }
  function init() {
    adopt(resolveInitial());
    // The console owns the toggle button, next to the archive export button in
    // the 用户与存档 panel. This fixed fallback only exists for a console build
    // that lost that markup; it sits bottom-right to match that spot.
    let button = document.querySelector("#termLanguageToggle, [data-term-toggle]");
    if (!button && isMainConsole()) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.termToggle = "true";
      button.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9999";
      button.setAttribute("aria-label", "切换术语版本");
      (document.body || document.documentElement).appendChild(button);
    }
    if (button) {
      updateButton(button);
      button.addEventListener("click", () => {
        adopt(!state.official);
        writeStored(state.official);
        if (typeof window.ATOSetTermLanguage === "function") {
          try {
            window.ATOSetTermLanguage(state.official ? "official" : "fan");
          } catch (error) {
            console.warn("无法同步术语版本：", error);
          }
        }
        channel?.postMessage({ official: state.official });
        updateButton(button);
        refresh();
      });
    }
    refresh();
    // These listeners stay active on every page, including the module pages that
    // have no toggle button of their own: a page already open must follow the
    // version chosen in another tab instead of keeping a stale one until reload.
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      adopt(event.newValue === "official");
      if (button) updateButton(button);
      refresh();
    });
    window.addEventListener("ato-term-language-changed", (event) => {
      if (!event.detail || typeof event.detail.official !== "boolean") return;
      adopt(event.detail.official);
      if (isMainConsole()) {
        writeStored(state.official);
        channel?.postMessage({ official: state.official });
      }
      if (button) updateButton(button);
      refresh();
    });
    channel?.addEventListener("message", (event) => {
      if (!event.data || typeof event.data.official !== "boolean") return;
      adopt(event.data.official);
      if (button) updateButton(button);
      refresh();
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
    const observer = new MutationObserver((mutations) => mutations.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.DOCUMENT_FRAGMENT_NODE) schedule(n);
    })));
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
