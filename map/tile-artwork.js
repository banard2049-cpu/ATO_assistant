/* Optional HD artwork. Legacy tile URLs and campaign state stay authoritative. */
(function () {
  'use strict';
  const preferenceKey = 'ato-map-artwork-v1';
  const data = window.ATO_MAP_ARTWORK_DATA || {};
  const backData = window.ATO_MAP_BACK_DATA || { backs: {}, bases: {} };
  const known = new Set(data.files || []);
  const failed = new Set();
  const missingBacks = new Set();
  let preferences = readPreferences();

  function readPreferences() {
    let value;
    try { value = JSON.parse(window.localStorage.getItem(preferenceKey)); } catch (_) {}
    value = value && typeof value === 'object' ? value : {};
    return { showIcons: typeof value.showIcons === 'boolean' ? value.showIcons : value.local !== false || value.neighbors !== false };
  }

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function resolve(source) {
    const key = String(source || '').split(/[?#]/)[0].split('/').pop().replace(/\.(?:jpg|jpeg|png)$/i, '');
    if (!known.has(key)) return null;
    const prefix = data.prefix || './images/hd1024';
    return { key, base: `${prefix}/base/${key}.png`, overlay: `${prefix}/overlay/${key}.png` };
  }

  function resolveBack(source) {
    const key = String(source || '').split(/[?#]/)[0].split('/').pop().replace(/\.(?:jpg|jpeg|png)$/i, '');
    const entry = backData.backs?.[key];
    if (!entry || !backData.bases?.[entry.cycle]) return null;
    return { key, base: backData.bases[entry.cycle], pieces: entry.pieces };
  }

  function backPlaceholder(label) {
    return `<span class="tile-back-fallback" role="img" aria-label="未揭示地图 ${escape(label)}">${escape(label)}</span>`;
  }

  function backMarkup(back, source, label) {
    if (missingBacks.has(back.key)) return backPlaceholder(label);
    const fallback = failed.has(back.key);
    const attributes = `data-artwork-key="${escape(back.key)}" data-card-back="true" data-legacy-src="${escape(source)}" data-artwork-label="${escape(label)}"`;
    // Back numbers and special instructions remain visible when front-map
    // icons are switched off.
    const content = fallback ? legacyImage(source, label)
      : `<img src="${escape(back.base)}" alt="${escape(label)}" decoding="async">`
        + back.pieces.map((piece) => `<img class="tile-back-piece" src="${escape(piece.src)}" alt="" aria-hidden="true" decoding="async" style="left:${Number(piece.x)}%;top:${Number(piece.y)}%;width:${Number(piece.width)}%;height:${Number(piece.height)}%">`).join('');
    return `<span class="tile-artwork-stack" ${attributes}${fallback ? ' data-artwork-fallback="true"' : ''}>${content}</span>`;
  }

  function legacyImage(source, label) {
    return `<img src="${escape(source)}" alt="${escape(label)}" decoding="async">`;
  }

  function markup(source, label) {
    const back = resolveBack(source);
    if (back) return backMarkup(back, source, label);
    const artwork = resolve(source);
    if (artwork && missingBacks.has(artwork.key)) return backPlaceholder(label);
    if (!artwork || failed.has(artwork.key)) return legacyImage(source, label);
    const layers = ['base', ...(preferences.showIcons ? ['overlay'] : [])];
    return `<span class="tile-artwork-stack" data-artwork-key="${escape(artwork.key)}" data-legacy-src="${escape(source)}" data-artwork-label="${escape(label)}">`
      + layers.map((layer) => `<img class="tile-artwork-${layer}" src="${escape(artwork[layer])}" alt="${layer === 'base' ? escape(label) : ''}"${layer === 'base' ? '' : ' aria-hidden="true"'} decoding="async">`).join('')
      + '</span>';
  }

  function bind(root) {
    if (!root) return;
    // Missing optional assets in an older installation fall back as one whole
    // face; no partial mask is left over the printed legacy face.
    root.addEventListener('error', (event) => {
      const stack = event.target.closest?.('.tile-artwork-stack');
      if (!stack) return;
      if (stack.dataset.artworkFallback === 'true') {
        missingBacks.add(stack.dataset.artworkKey);
        stack.innerHTML = backPlaceholder(stack.dataset.artworkLabel);
        return;
      }
      failed.add(stack.dataset.artworkKey);
      stack.dataset.artworkFallback = 'true';
      stack.innerHTML = legacyImage(stack.dataset.legacySrc, stack.dataset.artworkLabel);
    }, true);
  }

  function attachControls(options) {
    const { icons, onChange } = options;
    if (!icons) return;
    function sync() {
      icons.checked = preferences.showIcons;
    }
    function update() {
      preferences = { showIcons: icons.checked };
      try { window.localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch (_) {}
      sync();
      onChange();
    }
    icons.addEventListener('change', update);
    window.addEventListener('storage', (event) => {
      if (event.key !== preferenceKey && event.key !== null) return;
      preferences = readPreferences();
      sync();
      onChange();
    });
    sync();
  }

  window.ATO_MAP_ARTWORK = { resolve, resolveBack, markup, bind, attachControls };
})();
