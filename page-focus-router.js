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
  const openModuleTtl = 15000;
  const heartbeatInterval = 4000;
  const focusAckTimeout = 300;
  let pageActive = true;

  function moduleFromUrl(value = window.location.href) {
    const url = new URL(value, window.location.href);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (path.endsWith("/map/index.html") || path.endsWith("/map")) return "map";
    if (path.endsWith("/record/index.html") || path.endsWith("/record")) return "record";
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

  // Backwards-compatible alias for callers that still reference the old name.
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
    if (!currentModule) return;
    const modules = readOpenModules();
    modules[currentModule] = { pageId, href: window.location.href, updatedAt: Date.now() };
    writeOpenModules(modules);
  }

  function markModuleClosed() {
    if (!currentModule) return;
    const modules = readOpenModules();
    if (modules[currentModule]?.pageId === pageId) {
      delete modules[currentModule];
      writeOpenModules(modules);
    }
  }

  // Is some tab (this one, a window.open'd one, OR a manually opened one) currently
  // showing this module? Driven purely by the localStorage heartbeat, which every
  // tab writes regardless of how it was opened — so manual tabs count too.
  function isModuleRecentlyOpen(module) {
    if (module === currentModule) return true;
    const modules = readOpenModules();
    const record = modules[module];
    const open = Boolean(record && Date.now() - Number(record.updatedAt || 0) < openModuleTtl);
    if (!open && record) {
      delete modules[module];
      writeOpenModules(modules);
    }
    return open;
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
  if (currentModule) {
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
    if (message.type !== "focus-request" || message.sourceId === pageId || message.module !== currentModule) return;

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
    if (!channel || !module || module === currentModule) {
      window.location.href = absolute;
      return false;
    }

    if (isModuleRecentlyOpen(module)) {
      // Also notify via BroadcastChannel so manually-opened tabs self-navigate.
      requestFocusFromExistingTab(absolute, module, options.timeout);
      // Synchronous window.open brings the tab to the foreground when it is in
      // our opener chain (the normal case: we opened it earlier via this router).
      // For manually-opened tabs window.open can't find them and opens a new one
      // — same as the old behavior the user is used to ("opens once, then works").
      if (options.insideGesture) {
        openModuleTab(absolute, module);
        return true;
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

  window.ATO_PAGE_ROUTER = {
    currentModule,
    focusNamedModule,
    openModuleTab,
    focusOrNavigate,
    isModuleRecentlyOpen,
    moduleWindowName,
    moduleFromUrl,
  };

  if (currentModule) {
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.dataset.pageRouterIgnore === "true") return;
      const target = (anchor.getAttribute("target") || "").trim().toLowerCase();
      if (target && target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const targetModule = moduleFromUrl(url.href);
      if (!targetModule || targetModule === currentModule) return;
      event.preventDefault();
      // Synchronous, inside user gesture — window.open won't be blocked.
      void focusOrNavigate(url.href, { insideGesture: true });
    });
  }
})();
