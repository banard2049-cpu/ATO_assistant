/* Apply measured scan-edge trims only to a recognized fan artwork revision. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FanCardTrims = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const imageCache = new WeakMap(), observedDocuments = new WeakSet(), backgroundCache = new Map();
  const controlledPath = path => /^(?:assets\/exploration-cards\/c[1-5]\/[^/]+|aibp\/ps\/(?:[A-Z][A-Z0-9_]+|other|other\/trait)\/[^/]+)\.(?:png|jpe?g|webp)(?:\.preview\.jpg)?$/.test(path);
  const validData = data => data && data.version === 1 && data.sampleGrid === 6
    && Number.isFinite(data.tolerance) && data.tolerance >= 0 && data.tolerance <= 3 && data.images;

  function normalizePath(source, base) {
    try {
      if (typeof source !== 'string' || !source || /[\\\u0000-\u001f]/.test(source)) return null;
      const baseUrl = new URL(base || root.document?.baseURI || root.location?.href);
      const url = new URL(source, baseUrl);
      if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.origin !== baseUrl.origin) return null;
      const pathname = decodeURIComponent(url.pathname);
      if (/[\\\u0000-\u001f]/.test(pathname)) return null;
      const marker = pathname.match(/\/(?:assets\/exploration-cards|aibp\/ps)\//);
      if (!marker) return null;
      const path = pathname.slice(marker.index + 1);
      return controlledPath(path) ? path : null;
    } catch { return null; }
  }

  function coordinates(width, height, grid = 6) {
    const points = [];
    for (let row = 1; row <= grid; row++) {
      for (let column = 1; column <= grid; column++) {
        points.push([Math.round(column * (width - 1) / (grid + 1)), Math.round(row * (height - 1) / (grid + 1))]);
      }
    }
    return points;
  }

  function match(data, path, width, height, samples) {
    if (!validData(data) || !controlledPath(path || '') || !(width > 0 && height > 0)
      || !Array.isArray(samples) || samples.length !== 108) return null;
    const variants = Object.hasOwn(data.images, path) ? data.images[path] : null;
    if (!Array.isArray(variants)) return null;
    for (const entry of variants) {
      if (!entry || entry.size?.[0] !== width || entry.size?.[1] !== height
        || !Array.isArray(entry.samples) || entry.samples.length !== 108
        || !Array.isArray(entry.trim) || entry.trim.length !== 4) continue;
      if (!entry.samples.every((value, index) => Number.isInteger(value) && value >= 0 && value <= 255
        && Number.isInteger(samples[index]) && samples[index] >= 0 && samples[index] <= 255
        && Math.abs(value - samples[index]) <= data.tolerance)) continue;
      const [top, right, bottom, left] = entry.trim;
      if (![top, right, bottom, left].every(value => Number.isFinite(value) && value >= 0)
        || top + bottom >= height || left + right >= width) continue;
      return { top: top / height, right: right / width, bottom: bottom / height, left: left / width,
        naturalWidth: width, naturalHeight: height };
    }
    return null;
  }

  function sample(image, document) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 6;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.imageSmoothingEnabled = false;
      coordinates(image.naturalWidth, image.naturalHeight).forEach(([x, y], index) => {
        context.drawImage(image, x, y, 1, 1, index % 6, Math.floor(index / 6), 1, 1);
      });
      const pixels = context.getImageData(0, 0, 6, 6).data, values = [];
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] !== 255) return null;
        values.push(pixels[index], pixels[index + 1], pixels[index + 2]);
      }
      return values;
    } catch { return null; }
  }

  function inspect(image, path, data, document) {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return { confirmed: false, value: null };
    const variants = Object.hasOwn(data.images, path) ? data.images[path] : null;
    if (!Array.isArray(variants) || !variants.some(entry => entry?.size?.[0] === image.naturalWidth
      && entry?.size?.[1] === image.naturalHeight)) return { confirmed: true, value: null };
    const samples = sample(image, document);
    return { confirmed: samples !== null, value: samples && match(data, path, image.naturalWidth, image.naturalHeight, samples) };
  }

  function observeLoads(document) {
    if (!document?.addEventListener || observedDocuments.has(document)) return;
    observedDocuments.add(document);
    const clear = event => imageCache.delete(event.target);
    document.addEventListener('load', clear, true);
    document.addEventListener('error', clear, true);
  }
  observeLoads(root.document);

  function lookup(element, computedStyle, onReady) {
    try {
      const document = element?.ownerDocument || root.document, data = root.ATO_FAN_CARD_TRIMS;
      if (!document || !validData(data) || element?.classList?.contains('custom-token')) return null;
      observeLoads(document);
      const base = document.baseURI || root.location?.href;
      if (String(element.tagName || '').toLowerCase() === 'img') {
        const source = element.currentSrc || element.src, path = normalizePath(source, base);
        if (!path || !Object.hasOwn(data.images, path)) return null;
        const key = [source, element.naturalWidth, element.naturalHeight].join('|');
        const cached = imageCache.get(element);
        if (element.complete && cached?.key === key && cached.data === data) return cached.value;
        const result = inspect(element, path, data, document);
        if (result.confirmed) imageCache.set(element, { key, data, value: result.value });
        return result.value;
      }
      const css = String(computedStyle?.backgroundImage || '').trim();
      const source = css.match(/^url\(\s*(?:"([^"\\]*)"|'([^'\\]*)'|([^'"()\\]*))\s*\)$/);
      if (!source) return null;
      const url = new URL((source[1] || source[2] || source[3]).trim(), base).href;
      const path = normalizePath(url, base);
      if (!path || !Object.hasOwn(data.images, path)) return null;
      let cached = backgroundCache.get(url);
      if (cached?.data === data && cached.ready) return cached.value;
      if (!cached || cached.data !== data) {
        const view = document.defaultView || root;
        if (typeof view.Image !== 'function') return null;
        const image = new view.Image();
        cached = { data, ready: false, callbacks: new Set() };
        backgroundCache.set(url, cached);
        image.onload = () => {
          const result = inspect(image, path, data, document);
          if (!result.confirmed) { backgroundCache.delete(url); return; }
          cached.ready = true;
          cached.value = result.value;
          const callbacks = [...cached.callbacks];
          cached.callbacks.clear();
          callbacks.forEach(callback => callback());
        };
        image.onerror = () => backgroundCache.delete(url);
        if (typeof onReady === 'function') cached.callbacks.add(onReady);
        image.src = url;
      } else if (typeof onReady === 'function') cached.callbacks.add(onReady);
      return null;
    } catch { return null; }
  }

  return { lookup, normalizePath, coordinates, match };
});
