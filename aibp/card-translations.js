(function () {
  "use strict";

  const base = new URL(".", document.currentScript.src);
  const overlay = document.getElementById("imageZoomOverlay");
  const image = document.getElementById("imageZoomImg");
  const toggle = document.getElementById("imageZoomTranslationToggle");
  const face = document.getElementById("imageZoomTranslationFace");
  const previewImageProperty = "--card-translation-image";
  const paintedClass = "card-translation-painted";
  const storageKey = "aibp-card-translation-v1";
  const cacheLimit = 60;
  // 翻译开关属于浏览偏好：大图、牌堆、第二屏都读同一份，刷新后还在。
  const hasPage = typeof document.querySelectorAll === "function" && Boolean(document.body);
  const fontFamily = '"Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif';
  const flavorFont = 'SimSun, "宋体", "Songti SC", "Noto Serif CJK SC", serif';
  const wordSegmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh-Hans", { granularity: "word" }) : null;
  const translatedBoss = /^ps\/(?:MIDASCORE|DEMIDJINN|THE_BABELIAN_LUNACY|DAHAKA|DRAGON_OF_PHOBOS|MEDUKETOS|UR_FLEECE|TITAN_X)\//i;
  const sealedImage = /^ps\/other\/3b6e9d20\/[a-f0-9]+\.bin$/i;
  let loading;
  let source = null;
  let sourcePatches = null;
  let localizedSource = null;
  let localizedLanguage;
  let patches = null;
  let paintedSource = null;
  let preferChinese = readPreference();
  const paintedImages = new WeakMap();
  const cardCache = new Map();
  const paintQueue = [];
  let paintedCount = 0;
  let paintFrame = null;
  let scanFrame = null;

  function readPreference() {
    try {
      return window.localStorage?.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  }

  function writePreference(value) {
    try {
      window.localStorage?.setItem(storageKey, value ? "1" : "0");
    } catch {
      // 隐私模式/配额满时只在本次会话里记住。
    }
  }

  function loadCards() {
    loading ??= fetch(new URL("card-translations.json?v=19", base)).then(response => {
      if (!response.ok) throw new Error("Card translations unavailable");
      return response.json();
    }).catch(() => {
      loading = null;
      return null;
    });
    return loading;
  }

  function translationKey(cardImage) {
    if (!cardImage.getAttribute("src")) return null;
    const url = new URL(cardImage.src);
    if (url.protocol === "blob:") return url.href;
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
    const path = url.pathname.slice(base.pathname.length).replace(/\.preview\.jpg$/i, "");
    return translatedBoss.test(path) || sealedImage.test(path) ? path : null;
  }

  function currentSource() {
    return overlay?.classList.contains("show") ? translationKey(image) : null;
  }

  function patchesFor(cards, key) {
    if (!key.startsWith("blob:")) return cards[key];
    const original = Object.keys(cards).find(path =>
      sealedImage.test(path) && window.HeliosAssets?.resolve(path) === key);
    return cards[original];
  }

  function localizeBossNames(cardPatches, language) {
    const translate = window.ATO_THEATRE_TERMS?.bossNameTranslator?.(language);
    if (language !== "official" || !translate || !cardPatches) return cardPatches;
    return cardPatches.map(patch => {
      if (!patch.text) return patch;
      const text = translate(patch.text);
      return text === patch.text ? patch : { ...patch, text };
    });
  }

  function translationLanguage() {
    const language = window.ATO_LANGUAGE?.get() || document.documentElement?.dataset?.atoLanguage;
    return language === "official" ? "official" : "fan";
  }

  function pixelRect(box, { width, height }) {
    // Positions are stored in ten-thousandths of the card width and height.
    const [x0, y0, x1, y1] = box;
    return {
      left: Math.round(x0 * width / 10000), top: Math.round(y0 * height / 10000),
      right: Math.round(x1 * width / 10000), bottom: Math.round(y1 * height / 10000)
    };
  }

  function paperSamples(original, row, left, right) {
    const colors = [];
    for (let x = left; x < right; x++) colors.push(original.data[(row * original.width + x) * 4]);
    return colors;
  }

  function paperTone(original, rect) {
    const { left, top, right, bottom } = rect;
    const pixels = [...paperSamples(original, Math.max(0, top - 4), left, right),
      ...paperSamples(original, Math.min(original.height - 1, bottom + 3), left, right)];
    pixels.sort((a, b) => a - b);
    return pixels[Math.floor(pixels.length / 2)];
  }

  function bannerRow(original, rect, y, tone) {
    let accent = 0, contrast = 0, samples = 0;
    for (let x = rect.left; x < rect.right; x += 3) {
      const i = (y * original.width + x) * 4;
      const r = original.data[i], g = original.data[i + 1], b = original.data[i + 2];
      const gold = r >= 125 && r <= 225 && r - g >= 9 && g - b >= 25;
      const blue = r >= 78 && r <= 177 && g - r >= 11 && b - g >= 4;
      const red = r >= 125 && r - g >= 38 && r - b >= 33;
      if (gold || blue || red) accent++;
      if (tone >= 155 ? r < 105 && g < 105 : tone <= 105 && r > 171 && g > 165) contrast++;
      samples++;
    }
    return accent / samples >= .39 || contrast / samples >= .82;
  }

  // OCR sometimes gives a printed ribbon and the rule below it a single box.
  // Keep the unprinted portion of that box for both erasing and typesetting.
  function clearOfBanners(original, rect) {
    const tone = paperTone(original, rect);
    const minimumBand = Math.max(3, Math.round(original.height * .004));
    const searchTop = Math.max(0, rect.top - minimumBand);
    const searchBottom = Math.min(original.height, rect.bottom + minimumBand);
    const clean = [];
    let start = searchTop;
    for (let y = searchTop; y < searchBottom;) {
      if (!bannerRow(original, rect, y, tone)) { y++; continue; }
      const bandStart = y;
      while (y < searchBottom && bannerRow(original, rect, y, tone)) y++;
      if (y - bandStart < minimumBand) continue;
      clean.push([start, bandStart - 1]);
      start = y + 1;
    }
    clean.push([start, searchBottom]);
    const available = clean.map(([top, bottom]) => ({ ...rect, top: Math.max(top, rect.top), bottom: Math.min(bottom, rect.bottom) }));
    available.sort((a, b) => (b.bottom - b.top) - (a.bottom - a.top));
    return available[0];
  }

  function area(rect) {
    return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
  }

  function clearOfGuards(rect, guards) {
    let slot = rect;
    for (const guard of guards) {
      const left = Math.max(slot.left, guard.left);
      const right = Math.min(slot.right, guard.right);
      const top = Math.max(slot.top, guard.top);
      const bottom = Math.min(slot.bottom, guard.bottom);
      if (right <= left || bottom <= top) continue;
      const regions = [{ ...slot, top: bottom }, { ...slot, bottom: top }];
      if (bottom - top > (slot.bottom - slot.top) * .55) {
        regions.push({ ...slot, left: right }, { ...slot, right: left });
      }
      slot = regions.reduce((best, region) => area(region) > area(best) ? region : best);
    }
    return slot;
  }

  function separateRows(rows) {
    // OCR boxes often meet at descenders. Reserve a separate baseline and a
    // small gap for each row even when their cleanup masks touch.
    rows.sort((a, b) => a.top + a.bottom - b.top - b.bottom);
    rows.forEach((row, index) => {
      for (const below of rows.slice(index + 1)) {
        if (below.top >= row.bottom) continue;
        if (below.left >= row.right || below.right <= row.left) continue;
        if (row.exact !== below.exact) {
          if (row.exact) below.top = row.bottom + 1;
          else row.bottom = below.top - 1;
          continue;
        }
        const middle = Math.round((row.top + row.bottom + below.top + below.bottom) / 4);
        row.bottom = Math.min(row.bottom, middle);
        below.top = Math.max(below.top, middle + 1);
      }
    });
  }

  function extendIntoBlankPaper(original, rect, rows) {
    const xLimit = rows.reduce((limit, other) => {
      const alongside = rect.top < other.bottom && other.top < rect.bottom;
      return alongside && other.left >= rect.right ? Math.min(limit, other.left - 2) : limit;
    }, Math.floor(original.width * .935));
    const tone = paperTone(original, rect);
    const step = Math.max(3, Math.round(original.width * .007));
    let right = rect.right;
    while (right + step <= xLimit) {
      let sameTone = 0, total = 0;
      for (let y = rect.top; y < rect.bottom; y += 2) {
        for (let x = right; x < right + step; x += 2) {
          const i = (y * original.width + x) * 4;
          if (Math.abs(original.data[i] - tone) < 27) sameTone++;
          total++;
        }
      }
      if (sameTone < total * .93) break;
      right += step;
    }
    return right;
  }

  // Preserve the existing texture. Replace the ink inside each calibrated
  // text strip using nearby pixels with the same paper tone.
  function coverText(context, original, rect, ink, calibrated = false) {
    const { left, top, right, bottom } = rect;
    const width = right - left;
    const height = bottom - top;
    if (width < 1 || height < 1) return false;
    const strip = context.createImageData(width, height);
    const { data } = strip;
    const pixels = original.data;
    const red = ink === "red";
    const paperOnly = ink === "paper";
    const dark = ink === "light" || (ink !== "dark" && !red && paperTone(original, rect) < 119);
    // The original red lettering blends into cream in the red channel.
    // On gold, the blue channel distinguishes pale text from the ribbon.
    const gold = calibrated && ink === "light";
    const channel = gold ? 2 : red ? 1 : 0;
    const tolerance = gold ? 8 : 15;
    const samples = [];
    for (let y = top; y < bottom; y += 2) {
      for (let x = left; x < right; x += 2) {
        samples.push((y * original.width + x) * 4);
      }
    }
    samples.sort((a, b) => pixels[a + channel] - pixels[b + channel]);
    const neutralSamples = red ? samples.filter(point => pixels[point] - pixels[point + 1] <= 13) : [];
    const referencePool = neutralSamples.length ? neutralSamples : samples;
    const reference = referencePool[Math.floor((referencePool.length - 1) * (dark ? .24 : red ? .50 : .80))];
    const tone = pixels[reference + channel];
    const warmth = pixels[reference] - pixels[reference + 1];
    for (let x = 0; x < width; x++) {
      const donors = [];
      for (const dy of [-4, -2, 1, 3]) {
        const row = Math.min(original.height - 1, Math.max(0, dy < 0 ? top + dy : bottom + dy));
        for (const dx of [-5, 0, 5]) {
          const column = Math.min(original.width - 1, Math.max(0, left + x + dx));
          const donor = (row * original.width + column) * 4;
          if (Math.abs(pixels[donor + channel] - tone) <= tolerance
            && Math.abs(pixels[donor] - pixels[reference]) <= 15
            && Math.abs(pixels[donor + 1] - pixels[reference + 1]) <= 16
            && Math.abs(pixels[donor + 2] - pixels[reference + 2]) <= 19
            && (!paperOnly || Math.abs(pixels[donor] - pixels[donor + 1] - warmth) <= 9)
            && (!red || pixels[donor] - pixels[donor + 1] <= 13)) donors.push(donor);
        }
      }
      donors.sort((a, b) => pixels[a + channel] - pixels[b + channel]);
      const paper = donors[Math.floor(donors.length / 2)] ?? reference;
      for (let y = 0; y < height; y++) {
        const point = (y * width + x) * 4;
        const source = ((top + y) * original.width + left + x) * 4;
        let contrast = (pixels[source + channel] - pixels[paper + channel]) * (dark ? 1 : -1);
        if (red) contrast = Math.max(contrast, pixels[source] - pixels[source + 1] - 8);
        const seed = (x * 451 ^ y * 733) >>> 0;
        // Replace the whole mask where the scan has a light halo around the ink.
        const texture = paperOnly && donors.length ? donors[seed % donors.length] : paper;
        const blend = paperOnly ? 1
          : Math.min(1, Math.max(0, gold ? (contrast - 4) / 12 : (contrast - 5) / 17));
        const grain = (seed & 7) - 3;
        for (let channel = 0; channel < 3; channel++) {
          data[point + channel] = pixels[source + channel] * (1 - blend)
            + (pixels[texture + channel] + grain) * blend;
        }
        data[point + 3] = 255;
      }
    }
    context.putImageData(strip, left, top);
    return dark;
  }

  function lineTokens(input, boundaries) {
    const tokens = [];
    const parts = input.matchAll(/(?:[A-Za-z0-9]+(?:[.+/-][A-Za-z0-9]+)*\+?|[^\s])(?:[，。！？、；：）」』】％]+)?|\s+/gu);
    for (const part of parts) {
      const text = part[0];
      const previous = tokens.at(-1);
      const followsOpening = /[（「『【《〈]$/.test(previous || "");
      const followsAmount = /\d\s*$/.test(previous || "") && /^(?:\s|[个枚张次格点名]|危|伤)/.test(text);
      if (previous && (followsOpening || followsAmount || (boundaries && !boundaries.has(part.index)))) {
        tokens[tokens.length - 1] += text;
      } else {
        tokens.push(text);
      }
    }
    return tokens;
  }

  function wrapTokens(context, words, strips, horizontalScale) {
    let index = 0;
    const result = [];
    for (const strip of strips) {
      let line = "";
      while (index < words.length) {
        const next = line + words[index];
        const metrics = context.measureText(next.trim());
        if (metrics.width * horizontalScale > strip.right - strip.left - 2
          || inkHeight(metrics) > strip.bottom - strip.top) break;
        line = next;
        index++;
      }
      result.push(line.trim());
      if (index === words.length) return result;
    }
    return null;
  }

  function wrapInStrips(context, input, strips, horizontalScale = 1) {
    if (wordSegmenter && strips.length > 1) {
      const boundaries = new Set(Array.from(wordSegmenter.segment(input), word => word.index));
      const wrapped = wrapTokens(context, lineTokens(input, boundaries), strips, horizontalScale);
      if (wrapped) return wrapped;
    }
    // Retain the complete translation even in a narrow slot for a long term.
    return wrapTokens(context, lineTokens(input), strips, horizontalScale);
  }

  function setFont(context, patch, size) {
    const flavor = patch.kind === "flavor";
    const weight = patch.bold ? 700 : patch.kind === "heading" ? 600 : 400;
    context.font = `${flavor ? "italic " : ""}${weight} ${size}px ${flavor ? flavorFont : fontFamily}`;
  }

  function inkHeight(metrics) {
    return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  }

  function bodySize(context, placements) {
    const body = placements.filter(({ patch }) => ["body", "flavor", "panel", "center"].includes(patch.kind));
    const panel = body.some(({ patch }) => patch.kind === "panel");
    const heights = body.flatMap(({ strips }) => strips.map(strip => strip.bottom - strip.top)).sort((a, b) => a - b);
    const width = context.canvas.width;
    const typical = heights[Math.floor(heights.length / 2)] || Math.round(width * .037);
    const preferred = Math.round(Math.min(width * .036, typical * .87));
    // A narrow badge or icon slot should only constrain its own text.
    const minimum = panel ? Math.min(preferred, Math.round(typical * .66)) : preferred - 2;
    for (let size = preferred; size > minimum; size--) {
      if (body.every(({ patch, strips }) => {
        setFont(context, patch, size);
        return wrapInStrips(context, patch.text, strips);
      })) return size;
    }
    return minimum;
  }

  function layoutText(context, patch, strips, bodyFontSize) {
    const title = patch.kind === "heading";
    const caption = patch.kind === "caption";
    const center = patch.kind === "center" || (title && strips[0].left > context.canvas.width * .17);
    const availableHeight = Math.max(...strips.map(strip => strip.bottom - strip.top));
    let size = title || caption ? Math.round(availableHeight * .89) : bodyFontSize;
    setFont(context, patch, size);
    let horizontalScale = 1;
    let lines = wrapInStrips(context, patch.text, strips);
    if (title || caption) {
      const minimum = caption ? Math.round(availableHeight * .55) : Math.round(bodyFontSize * .72);
      while (!lines && size > minimum) {
        setFont(context, patch, --size);
        lines = wrapInStrips(context, patch.text, strips);
      }
    } else if (!lines) {
      const minimum = Math.max(7, Math.round(size * .65));
      // A small reduction in one patch is more readable than heavily condensed text.
      for (const scales of [[1, .95, .9, .85], [.8, .75, .7, .65, .6, .55, .5]]) {
        for (let fittedSize = size; fittedSize >= minimum && !lines; fittedSize--) {
          setFont(context, patch, fittedSize);
          for (const scale of scales) {
            lines = wrapInStrips(context, patch.text, strips, scale);
            if (lines) { horizontalScale = scale; break; }
          }
        }
        if (lines) break;
      }
    }
    if (!lines) return null;
    context.textBaseline = "alphabetic";
    context.textAlign = center ? "center" : "left";
    return lines.map((line, index) => {
      if (!line) return;
      const strip = strips[index];
      const metrics = context.measureText(line);
      const width = strip.right - strip.left;
      const height = strip.bottom - strip.top;
      const y = (height - inkHeight(metrics)) / 2 + metrics.actualBoundingBoxAscent;
      const overhang = center ? 0 : Math.max(0, metrics.actualBoundingBoxLeft || 0);
      const paintedWidth = Math.max(metrics.width, center ? 2 * Math.max(metrics.actualBoundingBoxLeft || 0,
        metrics.actualBoundingBoxRight || 0) : overhang + (metrics.actualBoundingBoxRight || 0));
      const scale = Math.min(horizontalScale, (width - 2) / Math.max(1, paintedWidth));
      const x = center ? width / 2 : 1 + overhang * scale;
      return { line, strip, x, y, scale, font: context.font, center };
    }).filter(Boolean);
  }

  function layoutCardTitle(context, original, patch) {
    const shortSide = Math.min(original.width, original.height);
    const preferredSize = Math.round(shortSide * .041);
    let strip;
    if (patch.slots?.length) {
      strip = pixelRect(patch.slots[0], original);
    } else {
      const english = patch.lines.map(box => pixelRect(box, original));
      if (!english.length) return [];
      const left = Math.min(...english.map(rect => rect.left));
      const right = Math.max(...english.map(rect => rect.right));
      const center = (left + right) / 2;
      const halfWidth = Math.max((right - left) / 2, shortSide * .17);
      const margin = Math.max(2, Math.round(shortSide * .005));
      const bottom = Math.min(...english.map(rect => rect.top)) - margin;
      strip = {
        left: Math.max(margin, Math.round(center - halfWidth)),
        top: Math.max(margin, bottom - preferredSize - 4),
        right: Math.min(original.width - margin, Math.round(center + halfWidth)),
        bottom,
      };
    }
    const size = Math.min(preferredSize, strip.bottom - strip.top);
    if (size < 7 || strip.right - strip.left < 4) return [];
    strip.dark = patch.ink ? patch.ink === "light" : paperTone(original, strip) < 140;
    const style = { ...patch, kind: patch.role === "BP" ? "body" : "center", bold: true };
    const text = layoutText(context, style, [strip], size) ?? [];
    return text.map(line => ({ ...line, outline: Math.min(3, Math.max(1, size * .065)) }));
  }

  function drawText(context, { line, strip, x, y, scale, font, center, outline }) {
    context.save();
    context.beginPath();
    context.rect(strip.left, strip.top, strip.right - strip.left, strip.bottom - strip.top);
    context.clip();
    context.translate(strip.left + x, strip.top + y);
    context.scale(scale, 1);
    context.font = font;
    context.textBaseline = "alphabetic";
    context.textAlign = center ? "center" : "left";
    context.fillStyle = strip.dark ? "#fff7e6" : "#242421";
    if (outline) {
      context.lineJoin = "round";
      context.lineWidth = outline;
      context.strokeStyle = strip.dark ? "rgba(22, 22, 19, .8)" : "rgba(255, 248, 228, .8)";
      context.strokeText(line, 0, 0);
    }
    context.fillText(line, 0, 0);
    context.restore();
  }

  function readyToPaint(image) {
    return image.complete && image.naturalWidth && (!image.currentSrc || image.currentSrc === image.src);
  }

  function paintTranslation(image, face, patches, rotated = false) {
    if (!readyToPaint(image)) return false;
    const width = rotated ? image.naturalHeight : image.naturalWidth;
    const height = rotated ? image.naturalWidth : image.naturalHeight;
    const scale = Math.min(1, 1600 / width, 1900 / height);
    face.width = Math.round(width * scale);
    face.height = Math.round(height * scale);
    const context = face.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    try {
      if (rotated) {
        context.translate(0, face.height);
        context.rotate(-Math.PI / 2);
        context.drawImage(image, 0, 0, face.height, face.width);
        context.resetTransform();
      } else {
        context.drawImage(image, 0, 0, face.width, face.height);
      }
      const original = context.getImageData(0, 0, face.width, face.height);
      const rectFor = box => pixelRect(box, original);
      const guards = patches.filter(patch => patch.kind === "card-title" || patch.kind === "guard")
        .flatMap(patch => patch.lines.map(rectFor));
      const retainedGraphics = patches.filter(patch => patch.kind === "guard" && patch.preserve)
        .flatMap(patch => patch.lines.map((box, index) => {
          const source = rectFor(box);
          const [x = box[0], y = box[1]] = patch.moveTo?.[index] ?? [];
          const { left, top } = rectFor([x, y, x, y]);
          return { left, top, right: left + source.right - source.left,
            bottom: top + source.bottom - source.top, source };
        }));
      const placements = patches.filter(patch => patch.kind !== "card-title" && patch.kind !== "guard")
        .map(patch => ({ patch, strips: (patch.slots ?? patch.lines).map(box => {
          const rect = rectFor(box);
          if (patch.exact || patch.slots) return { ...clearOfGuards(rect, retainedGraphics), exact: true };
          const cleared = clearOfGuards(rect, guards);
          return area(cleared) && (patch.kind === "body" || patch.kind === "flavor")
            ? clearOfBanners(original, cleared) : cleared;
        }) }));
      separateRows(placements.flatMap(({ strips }) => strips));
      for (const placement of placements) {
        placement.strips = placement.strips.filter(strip => strip.bottom - strip.top >= 7 && strip.right - strip.left >= 4);
      }
      const active = placements.filter(({ strips }) => strips.length);
      const rows = active.flatMap(({ strips }) => strips).concat(guards);
      for (const { patch, strips } of active) {
        for (const strip of strips) {
          strip.eraseRight = strip.right;
          if (!strip.exact && (patch.kind === "body" || patch.kind === "flavor")) {
            strip.right = extendIntoBlankPaper(original, strip, rows);
          }
        }
      }
      const size = bodySize(context, active);
      const rendered = [];
      for (const { patch, strips } of active) {
        const text = layoutText(context, patch, strips, size);
        if (!text) continue;
        rendered.push({ patch, strips, text });
      }
      // Erase translated text before drawing any of the new glyphs. A rule
      // can consume fewer printed rows in Chinese, including around a badge.
      for (const { patch, strips } of rendered) {
        // With calibrated slots, lines only cover the source ink. The
        // translation can use blank paper without erasing that larger area.
        for (const box of patch.slots ? patch.lines : []) {
          coverText(context, original, rectFor(box), patch.ink, true);
        }
        for (const box of patch.erase ?? []) {
          let mask = rectFor(box);
          if (!patch.slots && !patch.exact && patch.ink !== "light"
            && (patch.kind === "body" || patch.kind === "flavor")) {
            mask = clearOfBanners(original, clearOfGuards(mask, guards));
          }
          coverText(context, original, mask, patch.eraseInk ?? patch.ink, Boolean(patch.slots));
        }
        for (const strip of strips) {
          strip.dark = patch.slots ? patch.ink === "light"
            : coverText(context, original, { ...strip, right: strip.eraseRight }, patch.ink);
        }
      }
      // Clear moved icons before restoring the original pixels at their translated positions.
      for (const { left, top, source } of retainedGraphics) {
        if (left !== source.left || top !== source.top) coverText(context, original, source, "dark", true);
      }
      for (const { left, top, source } of retainedGraphics) {
        context.putImageData(original, left - source.left, top - source.top,
          source.left, source.top, source.right - source.left, source.bottom - source.top);
      }
      rendered.forEach(({ text }) => text.forEach(line => drawText(context, line)));
      const titles = patches.filter(patch => patch.kind === "card-title")
        .flatMap(patch => layoutCardTitle(context, original, patch));
      titles.forEach(line => drawText(context, line));
      face.setAttribute("aria-label", [...titles.map(({ line }) => line),
        ...rendered.map(({ patch }) => patch.text)].join(" "));
      return Boolean(rendered.length || titles.length);
    } catch {
      return false;
    }
  }

  function updateView() {
    if (!overlay || !image || !toggle || !face) return;
    const available = Boolean(patches?.length && readyToPaint(image));
    if (available && preferChinese && paintedSource !== source
      && paintTranslation(image, face, patches, image.parentElement.classList.contains("rotated-card"))) {
      paintedSource = source;
    }
    const showChinese = available && preferChinese && paintedSource === source;
    face.hidden = !showChinese;
    toggle.hidden = !available;
    toggle.textContent = showChinese ? "原图" : "中文";
    toggle.setAttribute("aria-pressed", String(showChinese));
    if (showChinese) image.setAttribute("aria-hidden", "true");
    else image.removeAttribute("aria-hidden");
  }

  function refreshLocalizedPatches() {
    const language = translationLanguage();
    if (sourcePatches === localizedSource && language === localizedLanguage) return;
    localizedSource = sourcePatches;
    localizedLanguage = language;
    patches = localizeBossNames(sourcePatches, language);
    paintedSource = null;
    updateView();
  }

  async function synchronize() {
    const key = currentSource();
    if (key === source) return;
    source = key;
    sourcePatches = null;
    refreshLocalizedPatches();
    if (!key) return;
    const cards = await loadCards();
    if (!cards || source !== key || currentSource() !== key) return;
    sourcePatches = patchesFor(cards, key) || null;
    refreshLocalizedPatches();
  }

  function translatedPreviewImage(cardImage, cardPatches, rotated) {
    try {
      return renderTranslatedImage(cardImage, cardPatches, rotated);
    } catch {
      // 画布被跨域/本地文件污染时退回原图，不影响其它卡。
      return "";
    }
  }

  function renderTranslatedImage(cardImage, cardPatches, rotated) {
    const canvas = document.createElement("canvas");
    if (!paintTranslation(cardImage, canvas, cardPatches, rotated)) return "";
    if (!rotated) return canvas.toDataURL("image/webp", .95);
    // The trait thumbnail already rotates the displayed image in CSS.
    const stored = document.createElement("canvas");
    stored.width = canvas.height;
    stored.height = canvas.width;
    const context = stored.getContext("2d");
    if (!context) return "";
    context.translate(stored.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(canvas, 0, 0);
    return stored.toDataURL("image/webp", .95);
  }

  function rememberCard(cacheKey, url) {
    cardCache.delete(cacheKey);
    cardCache.set(cacheKey, url);
    while (cardCache.size > cacheLimit) cardCache.delete(cardCache.keys().next().value);
  }

  function translatedCardUrl(cardImage, key, language, rotated, cards) {
    const cacheKey = `${key}|${language}|${rotated ? "rotated" : "flat"}`;
    const stored = cardCache.get(cacheKey);
    if (stored !== undefined) return stored;
    const cardPatches = patchesFor(cards, key);
    if (!cardPatches?.length) return "";
    const url = translatedPreviewImage(cardImage, localizeBossNames(cardPatches, language), rotated);
    if (!url) return "";
    rememberCard(cacheKey, url);
    return url;
  }

  function unpaint(cardImage) {
    if (!cardImage.classList?.contains(paintedClass)
      && !cardImage.style?.getPropertyValue(previewImageProperty)) return;
    cardImage.classList.remove(paintedClass);
    cardImage.style.removeProperty(previewImageProperty);
    paintedImages.delete(cardImage);
    paintedCount = Math.max(0, paintedCount - 1);
  }

  // 卡牌出现在大图、Trait 区、当前/弃牌/损伤牌堆、第二屏……所有位置共用这一层：
  // 只要这张图在 card-translations.json 里有译文，就换成画好的中文图。
  function refreshPageTranslations() {
    if (!hasPage) return;
    if (!preferChinese) {
      // 关掉中文时不做整页扫描，只有确实换过图才需要擦回去。
      if (!paintedCount) return;
      for (const cardImage of document.querySelectorAll("img")) unpaint(cardImage);
      paintedCount = 0;
      return;
    }
    const language = translationLanguage();
    const candidates = [];
    for (const cardImage of document.querySelectorAll("img")) {
      // 放大浮层的主图自己用 canvas 叠一层中文，不在这里换图。
      const key = !cardImage.closest(".image-zoom-card-stage") ? translationKey(cardImage) : null;
      if (!key) {
        unpaint(cardImage);
        continue;
      }
      const painted = paintedImages.get(cardImage);
      if (painted && painted.src === cardImage.src && painted.language === language
        && cardImage.classList.contains(paintedClass)) continue;
      if (!readyToPaint(cardImage)) continue;
      candidates.push({ cardImage, key, src: cardImage.src });
    }
    if (!candidates.length) return;
    void loadCards().then(cards => {
      if (!cards || !preferChinese) return;
      for (const candidate of candidates) enqueuePaint(candidate, cards);
    });
  }

  function enqueuePaint(candidate, cards) {
    if (paintQueue.some(item => item.cardImage === candidate.cardImage && item.src === candidate.src)) return;
    paintQueue.push({ ...candidate, cards });
    schedulePaint();
  }

  function nextFrame() {
    // 后台标签页（比如第二屏挂在另一个窗口）会暂停 rAF，改用定时器也能画完。
    if (typeof window.requestAnimationFrame === "function" && !document.hidden) {
      return window.requestAnimationFrame.bind(window);
    }
    return window.setTimeout.bind(window);
  }

  // 一张卡要擦字、排版、再导出成 data URL，几十毫秒起；排队一帧画一张，
  // 牌堆一次铺开时也不会把主线程堵死。
  function schedulePaint() {
    if (paintFrame !== null || !paintQueue.length) return;
    paintFrame = nextFrame()(() => {
      paintFrame = null;
      paintNext();
    });
  }

  function paintNext() {
    const item = paintQueue.shift();
    if (!item) return;
    const { cardImage, key, src, cards } = item;
    if (preferChinese && cardImage.isConnected && cardImage.src === src) {
      const language = translationLanguage();
      const url = translatedCardUrl(cardImage, key, language, cardImage.dataset.rotate === "-90", cards);
      if (url) {
        // 只替换绘制内容：缩放、翻面、快照仍然读原图地址。
        if (!cardImage.classList.contains(paintedClass)) paintedCount += 1;
        cardImage.style.setProperty(previewImageProperty, `url("${url}")`);
        cardImage.classList.add(paintedClass);
        paintedImages.set(cardImage, { src, language });
      }
    }
    schedulePaint();
  }

  function scheduleRefresh() {
    if (scanFrame !== null) return;
    scanFrame = nextFrame()(() => {
      scanFrame = null;
      refreshPageTranslations();
    });
  }

  function setEnabled(value, { persist = true, announce = true } = {}) {
    const next = Boolean(value);
    if (persist) writePreference(next);
    if (preferChinese === next) return;
    preferChinese = next;
    paintedSource = null;
    if (!next) paintQueue.length = 0;
    updateView();
    refreshPageTranslations();
    if (announce && typeof CustomEvent === "function") {
      // 第二屏同步快照要用这个开关，主控台收到后再推一次。
      window.dispatchEvent(new CustomEvent("aibp-card-translation-change", { detail: { enabled: next } }));
    }
  }

  function watchPage() {
    // 牌堆、Trait 区、第二屏的卡都是脚本插入的，整套页面盯着 img 的 src 就够。
    new MutationObserver(scheduleRefresh).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["src"],
    });
    document.addEventListener("load", event => {
      if (event.target instanceof HTMLImageElement) scheduleRefresh();
    }, true);
    document.addEventListener("error", event => {
      if (event.target instanceof HTMLImageElement) scheduleRefresh();
    }, true);
    // 另一个标签页（同机第二屏）切换中文时跟着变。
    window.addEventListener("storage", event => {
      if (event.key !== storageKey) return;
      setEnabled(event.newValue === "1", { persist: false, announce: false });
    });
    // 从后台回到前台、或从往返缓存恢复时，补一遍漏掉的卡。
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleRefresh();
    });
    window.addEventListener("pageshow", event => {
      if (event.persisted) scheduleRefresh();
    });
  }

  toggle?.addEventListener("click", event => {
    event.stopPropagation();
    setEnabled(!preferChinese);
  });
  image?.addEventListener("load", () => {
    paintedSource = null;
    updateView();
  });
  if (overlay && image) {
    const observer = new MutationObserver(synchronize);
    observer.observe(image, { attributes: true, attributeFilter: ["src"] });
    observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.documentElement) {
    const languageObserver = new MutationObserver(() => {
      refreshLocalizedPatches();
      scheduleRefresh();
    });
    languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ato-language"] });
  }
  if (hasPage) {
    watchPage();
    refreshPageTranslations();
  }
  void synchronize();

  // 第二屏是独立页面：主控台把开关写进同步快照，那边据此调用（不写回本地偏好）。
  window.AibpCardTranslations = {
    enabled: () => preferChinese,
    setEnabled,
    refresh: refreshPageTranslations,
    keyFor: translationKey,
  };
})();
