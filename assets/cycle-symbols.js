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

  window.ATO_CYCLE_SYMBOLS = Object.freeze({ files, labels, fileFor, src, prependTitleIcon, setBrandMark });
})();
