(function (root) {
  "use strict";

  const cacheKey = "aibp-image-inventory-v2";
  const publicImage = /^ps\/(?:[A-Z][A-Z0-9_]+|other|other\/trait)\/[^/]+\.(?:jpg|jpeg|png)$/i;
  const publicBosses = new Set([
    "HEKATON", "LABYRINTHAUROS", "HERMESIAN_PURSUER", "ALPHA_TEMENOS",
    "CHIMERA_METASTASIOS", "CYCLONUS", "THE_BURDEN", "THE_NIETZSCJEAN",
    "HYPERTIME_ORACLE", "ICARIAN_HARPY", "SUN_DESCENDANT", "MIDASCORE",
    "DEMIDJINN", "THE_BABELIAN_LUNACY", "DAHAKA", "DRAGON_OF_PHOBOS",
    "MEDUKETOS", "UR_FLEECE", "TITAN_X",
  ]);
  const listeners = new Set();
  const preloaded = new Set();
  let inventory;
  let pending;

  function normalize(payload) {
    if (payload?.ok !== true || !Array.isArray(payload.images)) throw new Error("Invalid image index");
    const images = [...new Set(payload.images.filter((src) => typeof src === "string"
      && publicImage.test(src) && !src.endsWith(".preview.jpg")))].sort();
    const present = new Set(images);
    const previews = {};
    for (const [src, preview] of Object.entries(payload.previews || {})) {
      if (present.has(src) && preview === `${src}.preview.jpg`) previews[src] = preview;
    }
    return { ok: true, images, previews };
  }

  try {
    const cached = JSON.parse(root.localStorage.getItem(cacheKey) || "null");
    // A stale inventory is still useful for the first paint; refresh it in the
    // background and let missing previews fall back to their originals.
    if (cached) inventory = normalize(cached.payload);
  } catch { /* Storage may be unavailable or contain an older format. */ }

  let releaseInventory;
  let startupReleased = false;
  let firstCardsPending = 0;
  const firstCardsPainted = new Promise((resolve) => { releaseInventory = resolve; });
  const startupFallback = root.setTimeout(releaseStartup, 1500);

  function releaseStartup() {
    if (startupReleased) return;
    startupReleased = true;
    root.clearTimeout(startupFallback);
    // PHP's development server handles one request at a time. Do not let a
    // full directory scan queue ahead of the first card images and scripts.
    const afterPaint = () => root.setTimeout(releaseInventory, 0);
    if (root.requestAnimationFrame) root.requestAnimationFrame(afterPaint);
    else afterPaint();
  }

  function load(force = false) {
    if (pending && !force) return pending;
    // A retry shares any still-running refresh instead of duplicating it.
    if (pending && force && refreshing) return pending;
    refreshing = true;
    pending = firstCardsPainted.then(() => {
      const controller = new AbortController();
      const timer = root.setTimeout(() => controller.abort(), 10000);
      return root.fetch("../api/aibp-image-index.php", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image index unavailable");
        const next = normalize(await response.json());
        const changed = JSON.stringify(next) !== JSON.stringify(inventory);
        inventory = next;
        try { root.localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), payload: next })); } catch {}
        if (changed) listeners.forEach((listener) => listener(next));
        return next;
      }).catch(() => {
        // A valid cached inventory still works when the device is offline.
        if (inventory === undefined) inventory = null;
        return inventory;
      }).finally(() => { root.clearTimeout(timer); });
    }).finally(() => { refreshing = false; });
    return pending;
  }

  let refreshing = false;
  function sourceFor(src) {
    if (inventory?.previews?.[src]) return inventory.previews[src];
    if (inventory === undefined || (inventory && !inventory.images.includes(src))) {
      const panel = /^ps\/([A-Z][A-Z0-9_]+)\/([^/]+)\.jpg$/.exec(src);
      if (panel && publicBosses.has(panel[1])
        && new RegExp(`^${panel[1]}(?:_\\d+)?$`).test(panel[2])) return `${src}.preview.jpg`;
    }
    return src;
  }

  const fullImageJobs = new Map();
  const fullImageQueue = [];
  let fullImagesLoading = 0;

  function pumpFullImages() {
    // Keep large originals from competing with the next card's preview.
    while (fullImagesLoading < 2 && fullImageQueue.length) {
      const job = fullImageQueue.shift();
      if (!job.waiters.some((waiter) => waiter.current())) {
        fullImageJobs.delete(job.src);
        job.waiters.forEach((waiter) => waiter.resolve(false));
        continue;
      }
      fullImagesLoading++;
      const full = new root.Image();
      full.fetchPriority = "low";
      full.decoding = "async";
      const finish = (ready) => {
        full.onload = full.onerror = null;
        fullImageJobs.delete(job.src);
        fullImagesLoading--;
        job.waiters.forEach((waiter) => waiter.resolve(ready));
        pumpFullImages();
      };
      full.onerror = () => finish(false);
      full.onload = async () => {
        try {
          if (full.decode) await full.decode();
          finish(true);
        } catch { finish(false); }
      };
      full.src = job.src;
    }
  }

  function loadFullImage(src, current) {
    return new Promise((resolve) => {
      let job = fullImageJobs.get(src);
      if (!job) {
        job = { src, waiters: [] };
        fullImageJobs.set(src, job);
        fullImageQueue.push(job);
      }
      job.waiters.push({ current, resolve });
      pumpFullImages();
    });
  }

  function setSource(img, src) {
    img._cardImageCleanup?.();
    const request = {};
    img._cardImageRequest = request;
    img.dataset ||= {};
    img.dataset.fullSrc = src;
    const previousError = img._cardImageError || img.onerror;
    img._cardImageError = previousError;
    let display;
    let frame;
    let timer;
    let previewLoaded;
    const current = () => img._cardImageRequest === request && img.dataset.fullSrc === src;
    const canUpgrade = () => current() && display !== src && img.isConnected !== false;
    const cleanup = () => {
      if (previewLoaded) img.removeEventListener?.("load", previewLoaded);
      if (frame !== undefined) root.cancelAnimationFrame?.(frame);
      if (timer !== undefined) root.clearTimeout(timer);
    };
    img._cardImageCleanup = cleanup;
    const assign = () => {
      if (!current()) return;
      display = sourceFor(src);
      img.onerror = () => {
        if (!current()) return;
        cleanup();
        if (display !== src) {
          // Old packs and removed previews fall back to the original once.
          if (inventory?.previews) delete inventory.previews[src];
          display = src;
          img.src = src;
        } else img._cardImageError?.call(img);
      };
      if (display !== src) {
        previewLoaded = () => {
          img.removeEventListener?.("load", previewLoaded);
          // Let the preview paint before starting any background transfers.
          const schedule = () => {
            timer = root.setTimeout(() => {
              if (!canUpgrade()) return;
              void loadFullImage(src, canUpgrade).then((ready) => {
                if (!ready || !canUpgrade()) return;
                display = src;
                img.src = src;
              });
            }, 0);
          };
          if (root.requestAnimationFrame) frame = root.requestAnimationFrame(schedule);
          else schedule();
        };
        img.addEventListener?.("load", previewLoaded, { once: true });
      }
      img.src = display;
    };
    assign();
  }

  function firstCards() {
    const params = new URLSearchParams(root.location.search);
    if (params.has("theatreBattle")) return [];
    let requested;
    try { requested = params.get("apostle") || decodeURIComponent(root.location.hash.slice(1)); } catch {}
    let name = String(requested || "HEKATON").trim().toUpperCase().replace(/[\s-]+/g, "_");
    // Hidden cards go through their existing access and decoding workflow.
    if (["HELIOS", "BLACKBEAK"].includes(name)) return [];
    if (!publicBosses.has(name)) name = "HEKATON";
    const listedBoss = inventory?.images.some((src) => src.startsWith(`ps/${name}/`));
    let panel = `ps/${name}/${name === "UR_FLEECE" ? "UR_FLEECE_2" : name}.jpg`;
    try {
      const saved = JSON.parse(root.localStorage.getItem("aibp-first-panel-v1") || "{}");
      if (saved.name === name && publicImage.test(saved.src) && saved.src.startsWith(`ps/${name}/${name}`)
        && (!inventory || inventory.images.includes(saved.src))) panel = saved.src;
    } catch {}
    return [
      { id: "panelWrap", src: panel, alt: `${name} panel`, className: "panel-image" },
      { id: "routineWrap", src: `ps/${name}/${name}_ROUTINE_X_001.jpg`, alt: `${name} routine`, className: "side-card-image" },
      { id: "signatureWrap", src: `ps/${name}/${name}_SIGNATURE_X_001.jpg`, alt: `${name} signature`, className: "side-card-image" },
    ].filter((card) => !listedBoss || inventory.images.includes(card.src));
  }

  function showFirstCards() {
    const ready = () => { if (--firstCardsPending === 0) releaseStartup(); };
    for (const card of firstCards()) {
      const wrap = document.getElementById(card.id);
      if (!wrap || wrap.childElementCount) continue;
      const img = document.createElement("img");
      img.alt = card.alt;
      img.className = card.className;
      img.decoding = "async";
      img.fetchPriority = "high";
      img.dataset.aibpFirstCard = "true";
      firstCardsPending++;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        ready();
      };
      img.addEventListener("load", settle, { once: true });
      img.addEventListener("error", settle, { once: true });
      setSource(img, card.src);
      wrap.appendChild(img);
    }
    if (!firstCardsPending) releaseStartup();
  }

  function takeFirstCard(src) {
    const img = Array.from(document.querySelectorAll("img[data-aibp-first-card]"))
      .find((image) => image.dataset.fullSrc === src);
    if (img) delete img.dataset.aibpFirstCard;
    return img;
  }

  function preloadFirstCards() {
    for (const { src } of firstCards()) {
      const display = sourceFor(src);
      if (preloaded.has(display)) continue;
      preloaded.add(display);
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.fetchPriority = "high";
      link.href = display;
      document.head.appendChild(link);
    }
  }

  root.AibpCardImages = {
    get inventory() { return inventory; },
    load, sourceFor, setSource, showFirstCards, takeFirstCard,
    unchanged(container, key) {
      const signature = JSON.stringify(key);
      if (container._aibpRenderSignature === signature) return true;
      container._aibpRenderSignature = signature;
      return false;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  preloadFirstCards();
  void load().then(preloadFirstCards);
})(window);
