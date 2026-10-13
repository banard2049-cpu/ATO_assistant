(function (global) {
  "use strict";

  const pixels = (value) => Number.parseFloat(value) || 0;

  function positionOffset(value, remaining, axis) {
    const keywords = axis === "x"
      ? { left: 0, center: 0.5, right: 1 }
      : { top: 0, center: 0.5, bottom: 1 };
    if (value in keywords) return remaining * keywords[value];
    if (value?.endsWith("%")) return remaining * pixels(value) / 100;
    if (value?.endsWith("px")) return pixels(value);
    return remaining / 2;
  }

  function imageBounds(image, host) {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return null;
    const style = global.getComputedStyle(image);
    const paddingLeft = pixels(style.paddingLeft);
    const paddingTop = pixels(style.paddingTop);
    const paddingWidth = paddingLeft + pixels(style.paddingRight);
    const paddingHeight = paddingTop + pixels(style.paddingBottom);
    if (image.clientWidth <= 0 || image.clientHeight <= 0) return null;
    const cssWidth = Number.parseFloat(style.width);
    const cssHeight = Number.parseFloat(style.height);
    const borderBox = style.boxSizing === "border-box";
    // Resolved CSS dimensions preserve subpixels that clientWidth rounds away.
    const contentWidth = Number.isFinite(cssWidth)
      ? cssWidth - (borderBox ? paddingWidth + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth) : 0)
      : image.clientWidth - paddingWidth;
    const contentHeight = Number.isFinite(cssHeight)
      ? cssHeight - (borderBox ? paddingHeight + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth) : 0)
      : image.clientHeight - paddingHeight;
    if (contentWidth <= 0 || contentHeight <= 0) return null;

    // Layout coordinates stay in the host's own coordinate system. Viewport
    // rectangles would include the second screen's rotation and scale twice.
    let left = image.offsetLeft + image.clientLeft + paddingLeft;
    let top = image.offsetTop + image.clientTop + paddingTop;
    let parent = image.offsetParent;
    while (parent && parent !== host) {
      left += parent.offsetLeft + parent.clientLeft - parent.scrollLeft;
      top += parent.offsetTop + parent.clientTop - parent.scrollTop;
      parent = parent.offsetParent;
    }
    if (parent !== host) return null;

    let width = contentWidth;
    let height = contentHeight;
    const containScale = Math.min(contentWidth / image.naturalWidth, contentHeight / image.naturalHeight);
    let scale = null;
    if (style.objectFit === "contain") scale = containScale;
    else if (style.objectFit === "scale-down") scale = Math.min(1, containScale);
    else if (style.objectFit === "cover") scale = Math.max(contentWidth / image.naturalWidth, contentHeight / image.naturalHeight);
    else if (style.objectFit === "none") scale = 1;
    if (scale !== null) {
      width = image.naturalWidth * scale;
      height = image.naturalHeight * scale;
    }
    const position = (style.objectPosition || "50% 50%").trim().split(/\s+/);
    left += positionOffset(position[0], contentWidth - width, "x");
    top += positionOffset(position[1] || "50%", contentHeight - height, "y");
    return { left, top, width, height };
  }

  function observe(image, host, layers, onChange) {
    if (!image || !host) return () => {};
    const targets = (layers || []).filter(Boolean);
    let frame = null;
    let disposed = false;
    let previous = "";

    const update = () => {
      frame = null;
      if (disposed) return;
      const bounds = imageBounds(image, host);
      host.style.setProperty("--panel-overlay-unit", `${bounds ? bounds.width / 1000 : 0}px`);
      for (const layer of targets) {
        // The application owns hidden; visibility only guards loading/zero size.
        layer.style.visibility = bounds ? "" : "hidden";
        if (!bounds) continue;
        Object.assign(layer.style, {
          position: "absolute", right: "auto", bottom: "auto",
          left: `${bounds.left}px`, top: `${bounds.top}px`,
          width: `${bounds.width}px`, height: `${bounds.height}px`,
        });
      }
      const key = bounds ? [bounds.left, bounds.top, bounds.width, bounds.height,
        image.naturalWidth, image.naturalHeight, image.currentSrc || image.src].join(",") : "unloaded";
      if (key !== previous) {
        previous = key;
        if (typeof onChange === "function") onChange(bounds);
      }
    };
    const schedule = () => {
      if (!disposed && frame === null) frame = global.requestAnimationFrame(update);
    };
    image.addEventListener("load", update);
    image.addEventListener("error", update);
    global.addEventListener("resize", schedule);
    const resizeObserver = typeof global.ResizeObserver === "function"
      ? new global.ResizeObserver(schedule) : null;
    resizeObserver?.observe(image);
    resizeObserver?.observe(host);
    const sourceObserver = typeof global.MutationObserver === "function"
      ? new global.MutationObserver(update) : null;
    sourceObserver?.observe(image, { attributes: true, attributeFilter: ["src", "srcset", "sizes"] });
    update();

    return () => {
      disposed = true;
      image.removeEventListener("load", update);
      image.removeEventListener("error", update);
      global.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
      sourceObserver?.disconnect();
      if (frame !== null) global.cancelAnimationFrame(frame);
    };
  }

  // The official Chinese panels have different print layouts from the fan
  // panels at the same URL. Recognize their original and generated preview
  // dimensions; screen size and DPR never determine the artwork edition.
  const officialArtwork = {
    LABYRINTHAUROS: {
      size: [2384, 1632], width: "5.6%",
      positions: {
        "Labyrinth O": [89.7, 7.2], "Labyrinth L": [94.8, 14.0],
        "Labyrinth Z": [89.8, 20.8], "Labyrinth I": [84.4, 13.5],
      },
    },
    ALPHA_TEMENOS: {
      size: [2372, 1628], width: "5.7%",
      positions: {
        "Labyrinth O": [86.1, 80.9], "Labyrinth L": [91.2, 87.6],
        "Labyrinth Z": [86.3, 94.4], "Labyrinth I": [80.8, 87.6],
      },
    },
    THE_NIETZSCJEAN: {
      size: [2384, 1604],
      positions: { Fire: [54.6, 55.4], Ambrosia: [59.3, 70.0], Sword: [49.8, 69.7] },
    },
    CYCLONUS: {
      size: [2372, 1628],
      positions: { Mauls: [86.7, 7.8], Chain: [82.1, 20.9], Body: [91.2, 21.5] },
    },
    CHIMERA_METASTASIOS: {
      size: [2368, 1636],
      positions: {
        "腐蚀液态": [91.2, 4.2, 6.4, 3.6],
        "凝胶态": [79.8, 29.2, 6.4, 3.6],
        "超固态": [94.7, 29.3, 6.4, 3.6],
      },
    },
  };

  function stateForArtwork(apostle, state, image) {
    if (!state) return state;
    const base = state.artworkBase || {
      left: state.left, top: state.top, width: state.width, height: state.height,
    };
    const original = state.artworkBase ? { ...state, ...base } : state;
    const artwork = officialArtwork[apostle];
    if (!artwork || !image?.naturalWidth || !image?.naturalHeight) return original;
    const [width, height] = artwork.size;
    const previewHeight = Math.round(height * 1600 / width);
    const isOfficial = (image.naturalWidth === width && image.naturalHeight === height)
      || (image.naturalWidth === 1600 && image.naturalHeight === previewHeight);
    if (!isOfficial) return original;
    const key = state.type || state.comboEnglish || state.label;
    const point = artwork.positions[key];
    if (!point) return original;
    return {
      ...original, artworkBase: base,
      left: `${point[0]}%`, top: `${point[1]}%`,
      ...(artwork.width ? { width: artwork.width } : {}),
      ...(point[2] ? { width: `${point[2]}%`, height: `${point[3]}%` } : {}),
    };
  }

  global.AibpPanelOverlay = { observe, stateForArtwork };
})(window);
