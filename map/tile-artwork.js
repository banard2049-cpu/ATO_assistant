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
    const overlayVersion = data.overlayVersions?.[key.split('-')[0]];
    const overlaySuffix = overlayVersion ? `?v=${encodeURIComponent(overlayVersion)}` : '';
    return { key, base: `${prefix}/base/${key}.png`, overlay: `${prefix}/overlay/${key}.png${overlaySuffix}` };
  }

  function resolveBack(source) {
    const key = String(source || '').split(/[?#]/)[0].split('/').pop().replace(/\.(?:jpg|jpeg|png)$/i, '');
    const entry = backData.backs?.[key];
    if (!entry || !backData.bases?.[entry.cycle]) return null;
    return { key, base: backData.bases[entry.cycle], pieces: entry.pieces, image: entry.image };
  }

  function backPlaceholder(label) {
    return `<span class="tile-back-fallback" role="img" aria-label="未揭示地图 ${escape(label)}">${escape(label)}</span>`;
  }

  function backAssetUrl(source) {
    return backData.version ? `${source}?v=${encodeURIComponent(backData.version)}` : source;
  }

  function backMarkup(back, source, label) {
    if (missingBacks.has(back.key)) return backPlaceholder(label);
    const fallback = failed.has(back.key);
    const attributes = `data-artwork-key="${escape(back.key)}" data-card-back="true" data-legacy-src="${escape(source)}" data-artwork-label="${escape(label)}"`;
    // Back numbers and special instructions remain visible when front-map
    // icons are switched off.
    const content = fallback ? legacyImage(source, label)
      : back.image ? `<img src="${escape(backAssetUrl(back.image))}" alt="${escape(label)}" decoding="async">`
      : `<img src="${escape(backAssetUrl(back.base))}" alt="${escape(label)}" decoding="async">`
        + back.pieces.map((piece) => `<img class="tile-back-piece" src="${escape(backAssetUrl(piece.src))}" alt="" aria-hidden="true" decoding="async" style="left:${Number(piece.x)}%;top:${Number(piece.y)}%;width:${Number(piece.width)}%;height:${Number(piece.height)}%">`).join('');
    return `<span class="tile-artwork-stack" ${attributes}${fallback ? ' data-artwork-fallback="true"' : ''}>${content}</span>`;
  }

  function legacyImage(source, label) {
    const imageSource = /\/c4-tile-[^/?#]+-back\.png$/i.test(String(source)) ? backAssetUrl(source) : source;
    return `<img src="${escape(imageSource)}" alt="${escape(label)}" decoding="async">`;
  }

  function headingMarkup(source, label, location = 'front') {
    const artwork = resolve(source);
    const geometry = window.ATO_C5_HEADING_DATA?.[artwork?.key];
    if (!geometry) return escape(label);
    const [left, top, right, bottom] = geometry.header;
    const [fl, ft, fr, fb] = geometry.faction;
    const divider = Math.round((right - left) * 0.60);
    const filterId = `${artwork.key}-${location}-faction-ink`;
    const src = escape(artwork.overlay);
    // Reuse the printed numeral and this face's faction ink in its pentagonal frame.
    return `<svg class="tile-c5-heading" viewBox="0 0 280 112" aria-hidden="true" focusable="false">
      <defs><filter id="${filterId}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  4 4 4 0 -8.4"/></filter></defs>
      <svg x="0" y="0" width="170" height="112" viewBox="${left} ${top} ${divider} ${bottom - top}" preserveAspectRatio="none"><image href="${src}" width="1024" height="1024"/></svg>
      <path d="M168 3H249L277 56 249 109H168Z" fill="#526c77" stroke="#e3e5dc" stroke-width="3"/>
      <path d="M174 9H245L270 56 245 103H174Z" fill="none" stroke="#e3e5dc" stroke-width="2"/>
      <svg x="180" y="15" width="76" height="82" viewBox="${fl + 8} ${ft + 8} ${fr - fl - 16} ${fb - ft - 16}" preserveAspectRatio="xMidYMid meet"><image href="${src}" width="1024" height="1024" filter="url(#${filterId})"/></svg>
    </svg>`;
  }

  function coverMarkup(source, label) {
    const artwork = resolve(source);
    const base = backData.bases?.c3;
    const key = `${artwork?.key || label}-cover`;
    if (!base || missingBacks.has(key)) return backPlaceholder(label);
    return `<span class="tile-artwork-stack tile-c5-cover" data-artwork-key="${escape(key)}" data-card-cover="true" data-artwork-label="${escape(label)}" role="img" aria-label="未揭示地图 ${escape(label)}">
      <img class="tile-c5-cover-base" src="${escape(backAssetUrl(base))}" alt="" aria-hidden="true" decoding="async">
      <span class="tile-c5-cover-heading">${headingMarkup(source, label, 'cover')}</span>
    </span>`;
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
      if (stack.dataset.cardCover === 'true') {
        missingBacks.add(stack.dataset.artworkKey);
        stack.innerHTML = backPlaceholder(stack.dataset.artworkLabel);
        return;
      }
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

  window.ATO_MAP_ARTWORK = { resolve, resolveBack, markup, coverMarkup, headingMarkup, bind, attachControls };
})();
