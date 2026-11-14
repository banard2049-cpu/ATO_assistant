(function () {
  const files = Object.freeze({
    c1: "c1-brown.png",
    c2: "c2-red.png",
    c3: "c3-purple.png",
    c4: "c4-yellow.png",
    c5: "c5-black-transparent.png",
  });

  const labels = Object.freeze({ c1: "循环 I", c2: "循环 II", c3: "循环 III", c4: "循环 IV", c5: "循环 V" });

  function fileFor(cycleId) {
    return files[String(cycleId || "").toLowerCase()] || "";
  }

  function src(cycleId, prefix = "./") {
    const file = fileFor(cycleId);
    return file ? `${prefix}assets/cycle-symbols/${file}` : "";
  }

  function prependTitleIcon(target, cycleId, prefix = "") {
    if (!target) return;
    target.querySelector("[data-cycle-symbol]")?.remove();
    const path = src(cycleId, prefix);
    if (!path) return;
    const next = document.createElement("img");
    next.dataset.cycleSymbol = "";
    next.className = "cycle-symbol";
    next.src = path;
    next.alt = `${labels[cycleId] || "当前循环"}图标`;
    next.title = next.alt;
    next.addEventListener("error", () => next.remove(), { once: true });
    target.prepend(next);
  }

  // Aspect ratios (w/h) of each module logo, so the mask box matches the glyph
  // instead of letterboxing it. Height is fixed at 42px to match `.cycle-symbol`.
  const logoRatios = Object.freeze({
    argo: 189 / 129,
    argonauts: 139 / 157,
    evolution: 149 / 156,
    technology: 152 / 195,
    map: 158 / 158,
    story: 161 / 162,
    "theatre-nav": 162 / 189,
  });

  // Module logos are single-colour SVGs (fill="currentColor"); render them with a
  // CSS mask so they inherit the title colour on any background, matching the
  // dashboard's `.nav-icon` treatment. `logo` is the bare icon file name (e.g.
  // "argo", "argonauts", "technology") resolved under assets/icons/.
  // Height is 1em so the logo matches the title text height; width follows the
  // glyph's aspect ratio.
  function prependModuleLogo(target, logo, prefix = "") {
    if (!target || !logo) return;
    target.querySelector("[data-module-logo]")?.remove();
    const next = document.createElement("span");
    next.dataset.moduleLogo = "";
    next.className = "module-logo";
    next.setAttribute("aria-hidden", "true");
    next.style.setProperty("--icon-src", `url(${prefix}assets/icons/${logo}.svg)`);
    const ratio = logoRatios[logo];
    if (ratio) next.style.setProperty("--logo-ratio", ratio.toFixed(3));
    target.prepend(next);
  }

  function setBrandMark(target, cycleId, prefix = "", fallback = "ATO") {
    if (!target) return;
    const path = src(cycleId, prefix);
    target.replaceChildren();
    if (!path) {
      target.textContent = fallback;
      return;
    }
    const image = document.createElement("img");
    image.dataset.cycleSymbol = "";
    image.className = "cycle-symbol";
    image.src = path;
    image.alt = `${labels[cycleId] || "当前循环"}图标`;
    image.title = image.alt;
    image.addEventListener("error", () => {
      target.replaceChildren(document.createTextNode(fallback));
    }, { once: true });
    target.appendChild(image);
  }

  // Replace the whole contents of a brand "mark" box with a module logo (mask),
  // used where a page shows a standalone badge instead of a title-prefix icon
  // (e.g. the story reader's sidebar mark).
  function setModuleLogo(target, logo, prefix = "") {
    if (!target || !logo) return;
    const next = document.createElement("span");
    next.dataset.moduleLogo = "";
    next.className = "module-logo";
    next.setAttribute("aria-hidden", "true");
    next.style.setProperty("--icon-src", `url(${prefix}assets/icons/${logo}.svg)`);
    const ratio = logoRatios[logo];
    if (ratio) next.style.setProperty("--logo-ratio", ratio.toFixed(3));
    target.replaceChildren(next);
  }

  window.ATO_CYCLE_SYMBOLS = Object.freeze({ files, labels, fileFor, src, prependTitleIcon, prependModuleLogo, setBrandMark, setModuleLogo });
})();
