/* One appearance preference for every module on this browser and origin. */
(function () {
  "use strict";
  const storageKey = "ato-theme-v1";
  const cycleStorageKey = "ato-theme-cycle-v1";
  const navigationModeKey = "ato-page-navigation-mode-v1";
  const cycles = {
    c1: ["#f6f0eb", "#fffdfb", "#e3d4c8", "#7f4b26", "#5f341b", "#f0e3d7", "#9a682c"],
    c2: ["#fbefed", "#fffdfc", "#ead1cc", "#a52206", "#7f1c08", "#f8ded8", "#9b6722"],
    c3: ["#f6f2fc", "#fbfdff", "#e0d7ee", "#752a7f", "#54205d", "#ede1f1", "#a26d25"],
    c4: ["#faf7ed", "#fffef9", "#e8dfc4", "#a0843d", "#765d24", "#f1e8ca", "#8e732f"],
    c5: ["#eef3f7", "#fbfdff", "#d3e0e8", "#06243d", "#041b2e", "#e0eaf1", "#95702b"],
  };
  const defaults = { mode: "auto", rgb: [127, 75, 38] };
  function normalize(value) {
    const mode = value?.mode === "custom" || Object.hasOwn(cycles, value?.mode) ? value.mode : "auto";
    const rgb = Array.isArray(value?.rgb) && value.rgb.length === 3 && value.rgb.every(v => typeof v === "number" && Number.isFinite(v))
      ? value.rgb.map(v => Math.max(0, Math.min(255, Math.round(v)))) : [...defaults.rgb];
    return { mode, rgb };
  }
  function hex(rgb) { return "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join(""); }
  function fromHex(value) { return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)); }
  function mix(rgb, target, amount) { return rgb.map((v, i) => Math.round(v * (1 - amount) + target[i] * amount)); }
  function luminance(rgb) {
    return rgb.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  }
  function readableAccent(rgb) {
    let result = [...rgb];
    while ((1.05 / (luminance(result) + .05)) < 4.5) result = mix(result, [0, 0, 0], .08);
    return result;
  }
  function palette(settings, cycleId = "c1") {
    const custom = settings.mode === "custom";
    const selected = cycles[settings.mode] || cycles[cycleId] || cycles.c1;
    const rgb = custom ? settings.rgb : fromHex(selected[3]);
    const accent = readableAccent(rgb);
    const white = [255, 255, 255], black = [0, 0, 0];
    const values = custom
      ? [hex(mix(rgb, white, .94)), hex(mix(rgb, white, .985)), hex(mix(accent, white, .8)), hex(accent), hex(mix(accent, black, .25)), hex(mix(rgb, white, .88)), hex(accent)]
      : selected;
    const result = Object.fromEntries(["bg", "panel", "line", "accent", "accent-strong", "accent-soft", "gold"].map((name, i) => ["--" + name, values[i]]));
    Object.assign(result, {
      "--ink": "#24211d", "--muted": "#706a60", "--surface": result["--bg"],
      "--paper": result["--panel"], "--accent-2": result["--gold"], "--line-strong": result["--accent"],
    });
    const sidebar = {
      "": .38, "-deep": .58, "-card": .24, "-card-active": .08, "-card-hover": 0,
      "-line": -.25, "-card-line": -.12, "-button": -.08,
      "-text": -.95, "-muted": -.7, "-label": -.8, "-accent": -.6,
      "-accent-line": -.3, "-hover-line": -.8,
    };
    for (const [suffix, amount] of Object.entries(sidebar)) {
      result["--cycle-sidebar" + suffix] = hex(mix(accent, amount < 0 ? white : black, Math.abs(amount)));
    }
    return result;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { normalize, palette, hex, luminance, readableAccent };
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function read(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch { /* In-memory and live tab synchronization still work. */ } }
  function parse(value) { try { return normalize(JSON.parse(value)); } catch { return normalize(null); } }
  let settings = parse(read(storageKey));
  let dashboardCycle = read(cycleStorageKey) || "c1";
  const dashboard = document.body.hasAttribute("data-theme-dashboard");
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("ato-theme-v1") : null;
  const cycleChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("ato-dashboard-cycle-v1") : null;
  const modeSelect = document.querySelector("#themeModeSelect");
  const navigationModeToggle = document.querySelector("#pageNavigationModeToggle");
  const customControls = document.querySelector("#themeCustomControls");
  const colorInput = document.querySelector("#themeColorInput");
  const rgbInputs = [...document.querySelectorAll("[data-theme-rgb]")];

  function currentCycle() {
    const own = document.body.dataset.cycle || new URLSearchParams(window.location.search).get("cycle");
    return Object.hasOwn(cycles, own) ? own : dashboardCycle;
  }
  function getNavigationMode() {
    const routerMode = window.ATO_PAGE_ROUTER?.getNavigationMode?.();
    if (routerMode === "single" || routerMode === "multi") return routerMode;
    try {
      return localStorage.getItem(navigationModeKey) === "single" ? "single" : "multi";
    } catch {
      return "multi";
    }
  }
  function renderNavigationMode() {
    if (!navigationModeToggle) return;
    const mode = getNavigationMode();
    navigationModeToggle.textContent = mode === "single" ? "单页跳转" : "多页跳转";
    navigationModeToggle.setAttribute("aria-pressed", String(mode === "single"));
    const canChange = window.ATO_PAGE_ROUTER?.canChangeNavigationMode?.() ?? true;
    navigationModeToggle.disabled = !canChange;
    navigationModeToggle.title = canChange ? "" : "Android 应用固定使用单页跳转";
  }
  navigationModeToggle?.addEventListener("click", () => {
    const nextMode = getNavigationMode() === "single" ? "multi" : "single";
    const routerMode = window.ATO_PAGE_ROUTER?.setNavigationMode?.(nextMode);
    if (routerMode !== "single" && routerMode !== "multi") {
      try { localStorage.setItem(navigationModeKey, nextMode); } catch {}
    }
    renderNavigationMode();
  });
  function apply() {
    const cycle = currentCycle();
    const colors = palette(settings, cycle);
    // Keep the second-screen presentation dark while applying the chosen hue.
    if (document.body.hasAttribute("data-theme-dark")) {
      const rgb = fromHex(colors["--accent"]);
      Object.assign(colors, {
        "--bg": hex(mix(rgb, [0, 0, 0], .9)), "--panel": hex(mix(rgb, [0, 0, 0], .8)),
        "--ink": "#f4f7fa", "--muted": "#bdc8d0", "--line": hex(mix(rgb, [255, 255, 255], .3)),
        "--accent": hex(mix(rgb, [255, 255, 255], .6)), "--gold": "#e4b55c",
      });
    }
    colors["--surface"] = colors["--bg"];
    colors["--paper"] = colors["--panel"];
    for (const [name, value] of Object.entries(colors)) {
      if (settings.mode === "auto" && name.startsWith("--cycle-sidebar")) document.body.style.removeProperty(name);
      else document.body.style.setProperty(name, value);
    }
    document.body.dataset.atoTheme = settings.mode;
    document.body.dataset.themeCycle = settings.mode === "auto" ? cycle : settings.mode;
    if (modeSelect) modeSelect.value = settings.mode;
    if (customControls) customControls.hidden = settings.mode !== "custom";
    if (colorInput) colorInput.value = hex(settings.rgb);
    rgbInputs.forEach((input, i) => { input.value = settings.rgb[i]; });
    window.dispatchEvent(new CustomEvent("ato-theme-changed", { detail: { ...settings, cycle } }));
  }
  function update(value) {
    settings = normalize(value);
    write(storageKey, JSON.stringify(settings));
    apply();
    channel?.postMessage({ type: "theme-changed", settings });
  }
  function setCycle(cycleId) {
    if (!Object.hasOwn(cycles, cycleId)) return;
    dashboardCycle = cycleId;
    if (dashboard) write(cycleStorageKey, cycleId);
    apply();
  }
  window.ATO_THEME = Object.freeze({ set: update, setCycle, get: () => normalize(settings) });
  modeSelect?.addEventListener("change", () => update({ ...settings, mode: modeSelect.value }));
  colorInput?.addEventListener("input", () => update({ mode: "custom", rgb: fromHex(colorInput.value) }));
  rgbInputs.forEach(input => input.addEventListener("input", () => {
    if (rgbInputs.every(field => field.value !== "" && field.validity.valid)) {
      update({ mode: "custom", rgb: rgbInputs.map(field => Number(field.value)) });
    }
  }));
  channel?.addEventListener("message", event => {
    if (event.data?.type !== "theme-changed") return;
    settings = normalize(event.data.settings);
    apply();
  });
  cycleChannel?.addEventListener("message", event => {
    if (event.data?.type === "active-cycle-changed") setCycle(event.data.cycleId);
  });
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) { settings = parse(read(storageKey)); apply(); }
    if (event.key === cycleStorageKey) setCycle(read(cycleStorageKey));
    if (event.key === navigationModeKey || event.key === null) renderNavigationMode();
  });
  new MutationObserver(() => {
    if (dashboard && Object.hasOwn(cycles, document.body.dataset.cycle)) dashboardCycle = document.body.dataset.cycle;
    if (dashboard) write(cycleStorageKey, dashboardCycle);
    apply();
  }).observe(document.body, { attributes: true, attributeFilter: ["data-cycle"] });
  if (dashboard && Object.hasOwn(cycles, document.body.dataset.cycle)) dashboardCycle = document.body.dataset.cycle;
  if (dashboard) write(cycleStorageKey, dashboardCycle);
  renderNavigationMode();
  apply();
})();
