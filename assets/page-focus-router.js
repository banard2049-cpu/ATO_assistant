(function () {
  "use strict";

  function createChannel() {
    if (typeof BroadcastChannel !== "function") return null;
    try {
      return new BroadcastChannel("ato-page-focus-router-v2");
    } catch {
      return null;
    }
  }

  const channel = createChannel();
  const pageId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const openModulesKey = "ato-page-focus-open-modules-v1";
  const navigationModeKey = "ato-page-navigation-mode-v1";
  const openModuleTtl = 15000;
  // A hidden tab's heartbeat is throttled by Chromium (roughly one timer per
  // minute after ~5 minutes in the background) and may stop entirely while the
  // tab is frozen. Keep the record around longer so a live-but-throttled tab is
  // probed by name instead of being treated as closed.
  const openModuleGraceTtl = 30 * 60 * 1000;
  const heartbeatInterval = 4000;
  const focusAckTimeout = 300;
  const isTopLevelPage = window.top === window;
  const nativeSingleWindow = Boolean(window.ATO_ANDROID_SINGLE_WINDOW || window.ATOAndroid);
  let preferredNavigationMode = "multi";
  try {
    const savedMode = localStorage.getItem(navigationModeKey);
    if (savedMode === "single" || savedMode === "multi") preferredNavigationMode = savedMode;
  } catch {}
  let pageActive = true;

  function getNavigationMode() {
    if (nativeSingleWindow) return "single";
    try {
      const savedMode = localStorage.getItem(navigationModeKey);
      if (savedMode === "single" || savedMode === "multi") preferredNavigationMode = savedMode;
    } catch {}
    return preferredNavigationMode;
  }

  function setNavigationMode(mode) {
    if (nativeSingleWindow) return "single";
    preferredNavigationMode = mode === "single" ? "single" : "multi";
    try {
      localStorage.setItem(navigationModeKey, preferredNavigationMode);
    } catch {}
    return preferredNavigationMode;
  }

  function isSingleWindowMode() {
    return getNavigationMode() === "single";
  }

  function moduleFromUrl(value = window.location.href) {
    const url = new URL(value, window.location.href);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (path.endsWith("/map/index.html") || path.endsWith("/map")) return "map";
    if (path.endsWith("/record/index.html") || path.endsWith("/record")) return "record";
    if (path.endsWith("/hero/index.html") || path.endsWith("/hero")) return "hero";
    if (path.endsWith("/technology/index.html") || path.endsWith("/technology")) return "technology";
    if (path.endsWith("/story/index.html") || path.endsWith("/story")) return "story";
    if (path.endsWith("/aibp/index.html") || path.endsWith("/aibp")) return "aibp";
    if (path.endsWith("/index.html") || !path.split("/").pop()?.includes(".")) return "dashboard";
    return "";
  }

  const currentModule = moduleFromUrl();
  const pending = new Map();
  if (currentModule) window.name = `ato-module-${currentModule}`;

  function moduleWindowName(module) {
    return module ? `ato-module-${module}` : "";
  }

  // Open a brand-new tab for a module. Only used when no live tab for that module
  // exists. Must run synchronously inside a user gesture or the popup blocker eats
  // it. We never use this to "find" an existing tab: window.open(url, name) cannot
  // see tabs the user opened manually, which is what caused duplicate tabs before.
  function openModuleTab(url, module) {
    const targetWindowName = moduleWindowName(module);
    if (!targetWindowName) return false;
    try {
      const targetWindow = window.open(url, targetWindowName);
      targetWindow?.focus?.();
      return targetWindow || false;
    } catch {
      return false;
    }
  }

  // Bring an already-open module tab to the front without loading anything into
  // it. window.open(url, name) on an existing tab navigates it, i.e. a visible
  // reload; and a background tab cannot focus itself, because Chromium ignores
  // window.focus() coming from a BroadcastChannel task. Focusing therefore has
  // to happen inside the click gesture. Callers that will navigate the tab
  // themselves once their save finishes should use this and keep the URL out of
  // the early call.
  function focusModuleWindow(module) {
    const targetWindowName = moduleWindowName(module);
    if (!targetWindowName) return null;
    try {
      const targetWindow = window.open("", targetWindowName);
      if (!targetWindow) return null;
      // window.open("", name) creates a blank popup when no tab with that name
      // exists (closed tab, or one outside this browsing context group). Close it
      // so the caller can open the module normally instead of leaving it blank.
      let targetHref = "";
      try {
        targetHref = targetWindow.location.href;
      } catch {}
      if (targetHref === "about:blank") {
        try {
          targetWindow.close();
        } catch {}
        return null;
      }
      targetWindow.focus?.();
      return targetWindow;
    } catch {
      return null;
    }
  }

  // Backwards-compatible alias for callers that still reference the old name.
  // Prefer focusModuleWindow() for "bring the page back" buttons: this alias
  // loads the URL immediately, which reloads the tab, and a navigation after a
  // save would then reload it a second time.
  const focusNamedModule = openModuleTab;

  function readOpenModules() {
    try {
      return JSON.parse(localStorage.getItem(openModulesKey) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writeOpenModules(value) {
    try {
      localStorage.setItem(openModulesKey, JSON.stringify(value));
    } catch {}
  }

  function markModuleOpen() {
    if (!currentModule || !isTopLevelPage) return;
    const modules = readOpenModules();
    modules[currentModule] = { pageId, href: window.location.href, updatedAt: Date.now() };
    writeOpenModules(modules);
  }

  function markModuleClosed() {
    if (!currentModule || !isTopLevelPage) return;
    const modules = readOpenModules();
    if (modules[currentModule]?.pageId === pageId) {
      delete modules[currentModule];
      writeOpenModules(modules);
    }
  }

  // Is some tab (this one, a window.open'd one, OR a manually opened one) currently
  // showing this module? Driven by the localStorage heartbeat, which every tab
  // writes regardless of how it was opened — so manual tabs count too.
  // "fresh"  — a heartbeat within 15s; no liveness probe needed.
  // "stale"  — a record exists but its heartbeat is older (throttled or frozen
  //            background tab, or a tab that closed without pagehide). The tab may
  //            still be alive, so callers probe it with focusModuleWindow().
  // "absent" — no record at all.
  function moduleOpenState(module) {
    if (isSingleWindowMode()) return "absent";
    if (module === currentModule) return "fresh";
    const modules = readOpenModules();
    const record = modules[module];
    if (!record) return "absent";
    const age = Date.now() - Number(record.updatedAt || 0);
    if (age < openModuleTtl) return "fresh";
    if (age < openModuleGraceTtl) return "stale";
    delete modules[module];
    writeOpenModules(modules);
    return "absent";
  }

  function hasOpenModule(module) {
    const state = moduleOpenState(module);
    return state === "fresh" || state === "stale";
  }

  function isModuleRecentlyOpen(module) {
    return moduleOpenState(module) === "fresh";
  }

  window.addEventListener("pagehide", () => {
    pageActive = false;
    markModuleClosed();
  });
  window.addEventListener("pageshow", () => {
    pageActive = true;
    markModuleOpen();
  });
  window.addEventListener("focus", markModuleOpen);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) markModuleOpen();
  });
  if (currentModule && isTopLevelPage) {
    markModuleOpen();
    window.setInterval(markModuleOpen, heartbeatInterval);
  }

  // BroadcastChannel reaches every same-origin tab, including ones the user opened
  // manually. When another tab asks us to take over its navigation for our module,
  // WE navigate and focus ourselves; the requester never calls window.open, so no
  // duplicate tab is ever created.
  channel?.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "focus-ack" && message.requestId && pending.has(message.requestId)) {
      pending.get(message.requestId)(true);
      pending.delete(message.requestId);
      return;
    }
    if (message.type === "sync-request" && isTopLevelPage && message.module === currentModule) {
      // Another page already brought us to the front; reloading this tab just to
      // pick up its data is a full page load. Let the page refresh itself.
      window.dispatchEvent(new CustomEvent("ato-module-sync-request", { detail: { url: message.url || "" } }));
      return;
    }
    if (!isTopLevelPage || message.type !== "focus-request" || message.sourceId === pageId || message.module !== currentModule) return;

    channel.postMessage({ type: "focus-ack", requestId: message.requestId, sourceId: pageId });
    try {
      window.focus();
    } catch {}
    const target = new URL(message.url, window.location.href);
    if (target.href !== window.location.href) {
      window.location.href = target.href;
    }
  });

  // Try to hand navigation to an existing tab for `url`'s module. Resolves true if a
  // live tab acknowledged (it will navigate + focus itself), false if none did.
  function requestFocusFromExistingTab(url, module, timeout) {
    if (!channel) return Promise.resolve(false);
    const requestId = `${pageId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        resolve(false);
      }, Math.max(80, Number(timeout || focusAckTimeout)));
      pending.set(requestId, (value) => {
        window.clearTimeout(timer);
        resolve(value);
      });
      channel.postMessage({
        type: "focus-request",
        requestId,
        sourceId: pageId,
        module,
        url: new URL(url, window.location.href).href,
      });
    });
  }

  // Navigate to `url` while honoring "one tab per module":
  //  - same module as us, or no channel    -> navigate this tab
  //  - a live tab already shows that module -> ask it to take over (stay put)
  //  - otherwise                            -> open a new tab for that module
  // Called from the click handler (synchronous, inside gesture) or from JS
  // (async, outside gesture — cannot open new tabs).
  async function focusOrNavigate(url, options = {}) {
    const module = moduleFromUrl(url);
    const absolute = new URL(url, window.location.href).href;
    if (isSingleWindowMode()) {
      // Android hosts multiple WebViews even though browser window.open is
      // unavailable. Hand scripted navigation to its tab manager as well as
      // normal links; callers such as save-and-return reach here after saving.
      if (module && module !== currentModule
          && typeof window.ATOAndroid?.openModuleTab === "function"
          && window.ATOAndroid.openModuleTab(absolute)) return true;
      window.location.href = absolute;
      return false;
    }
    if (!channel || !module || module === currentModule) {
      window.location.href = absolute;
      return false;
    }

    // hasOpenModule() rather than isModuleRecentlyOpen(): a live tab whose
    // heartbeat is throttled should still get the BroadcastChannel handoff
    // instead of this tab navigating to a second copy of the module.
    if (hasOpenModule(module)) {
      // Also notify via BroadcastChannel so manually-opened tabs self-navigate.
      requestFocusFromExistingTab(absolute, module, options.timeout);
      // Synchronous window.open brings the tab to the foreground when it is in
      // our opener chain (the normal case: we opened it earlier via this router).
      // For manually-opened tabs window.open can't find them and opens a new one
      // — same as the old behavior the user is used to ("opens once, then works").
      if (options.insideGesture) {
        if (openModuleTab(absolute, module)) return true;
        // openModuleTab failed (popup blocked) — wait for BC ack as fallback.
        const handled = await requestFocusFromExistingTab(absolute, module, options.timeout);
        if (handled) return true;
        // Nobody responded — navigate this tab.
        window.location.href = absolute;
        return false;
      }
      // Outside a gesture (e.g. technology page's saveAndReturnMain): can't
      // window.open without the popup blocker eating it. Wait for BC ack; if
      // nobody answers, navigate this tab as a fallback.
      const handled = await requestFocusFromExistingTab(absolute, module, options.timeout);
      if (handled) return true;
    }

    if (options.insideGesture) {
      if (openModuleTab(absolute, module)) return true;
    }
    window.location.href = absolute;
    return false;
  }

  // `/map/` and `/map/index.html` are the same page; the query string is not
  // (that is where a module keeps its cycle or a story deep link).
  function normalizePagePath(pathname) {
    const trimmed = String(pathname || "").replace(/\/index\.html$/i, "/").replace(/\/+$/, "");
    return trimmed || "/";
  }

  function samePageUrl(left, right) {
    let a;
    let b;
    try {
      a = new URL(left, window.location.href);
      b = new URL(right, window.location.href);
    } catch {
      return false;
    }
    return a.origin === b.origin
      && normalizePagePath(a.pathname) === normalizePagePath(b.pathname)
      && a.search === b.search;
  }

  // Focus the tab that already shows `url`'s module and ask it to refresh its own
  // data, instead of navigating that tab (a full page load). Falls back to the old
  // open/navigate behavior when no live tab can be focused, when the URL carries
  // state the tab cannot adopt (another cycle or deep link), or when the browser
  // blocks the synchronous window.open.
  async function focusOrSync(url, options = {}) {
    if (!options.insideGesture) return focusOrNavigate(url, options);
    const module = moduleFromUrl(url);
    const absolute = new URL(url, window.location.href).href;
    if (isSingleWindowMode() || !channel || !module || module === currentModule) {
      window.location.href = absolute;
      return false;
    }
    // Fresh, or a live tab whose heartbeat is merely throttled: probe by name
    // first. focusModuleWindow() returns null for a closed tab (and closes the
    // blank popup it had to create for the probe), which falls through to opening
    // the module normally.
    if (hasOpenModule(module)) {
      const target = focusModuleWindow(module);
      if (target) {
        let targetUrl = "";
        try {
          targetUrl = target.location.href;
        } catch {}
        // The dashboard is a singleton and its query string is only a hint (it is
        // stripped on load); every other module must keep the cycle/deep link the
        // URL asks for, so a different URL still navigates.
        if (module === "dashboard" || (targetUrl && samePageUrl(absolute, targetUrl))) {
          channel.postMessage({ type: "sync-request", module, url: absolute, sourceId: pageId });
          return true;
        }
        target.location.href = absolute;
        return true;
      }
    }
    if (openModuleTab(absolute, module)) return true;
    window.location.href = absolute;
    return false;
  }

  window.ATO_PAGE_ROUTER = {
    currentModule,
    getNavigationMode,
    setNavigationMode,
    isSinglePageMode: isSingleWindowMode,
    canChangeNavigationMode: () => !nativeSingleWindow,
    focusNamedModule,
    focusModuleWindow,
    openModuleTab,
    focusOrNavigate,
    focusOrSync,
    isModuleRecentlyOpen,
    hasOpenModule,
    moduleOpenState,
    moduleWindowName,
    moduleFromUrl,
  };

  if (currentModule) {
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.dataset.pageRouterIgnore === "true") return;
      const target = (anchor.getAttribute("target") || "").trim().toLowerCase();
      // Module links must not opt into target="_blank": a noopener tab lives in
      // another browsing context group, so the module it opens can no longer
      // find the tab it came from by name and "back to dashboard" would open a
      // duplicate instead of returning. Let the router own module navigation.
      if (target && target !== "_self" && !isSingleWindowMode()) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const targetModule = moduleFromUrl(url.href);
      if (!targetModule || targetModule === currentModule) return;
      event.preventDefault();
      // Synchronous, inside user gesture — window.open won't be blocked.
      void focusOrSync(url.href, { insideGesture: true });
    });
  }
})();
