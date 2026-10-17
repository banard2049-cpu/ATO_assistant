/* Match rounded scan corners to the artwork, without changing the layout. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CardArt = api;
  if (root.document) api.observe(root.document, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const imageSelector = '.negotiation-card-back, .structure-tech-card-images img, .structure-tech-negotiation-card img, .exploration-pursuit details img, .unlocked-thumb-img, .card-preview-img, .modal-card-img, .gear-card-thumb > img, .gear-image-modal-content > img, .card-grid img, .draw-preview img, .extra-grid img, .trait-option img, .scry-card img, .custom-trait-preview img, .loot-card-thumb, .loot-image-zoom-img, .image-zoom-card-stage > img:not(.custom-token), .image-zoom-notice img, .image-wrap > .side-card-image, .panel-frame > .panel-image, .battle-map-card img, .card-slot > img, .current-card > img, .trait-cards > img, .damage-cards > img, .battle-terrain-card > img, .summon-card img';
  const backgroundSelector = '.exploration-drawn-face, .exploration-drawn-image, .exploration-library-preview, .unlocked-thumb, .unlocked-thumb-rotated, .card-preview, .card-preview-rotated, .modal-card-crop, .modal-card-rotated';
  const candidateSelector = imageSelector + ', ' + backgroundSelector + ', [data-card-art]';
  const number = (value, fallback = 0) => Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback;
  const ratio = value => Math.max(0, Math.min(.5, number(value, .06)));
  const px = value => (Math.round(value * 10000) / 10000) + 'px';

  // Computed CSS sizes use local coordinates, unlike a transformed client rect.
  function localBox(style, fallback = {}) {
    const left = number(style.borderLeftWidth) + number(style.paddingLeft);
    const right = number(style.borderRightWidth) + number(style.paddingRight);
    const top = number(style.borderTopWidth) + number(style.paddingTop);
    const bottom = number(style.borderBottomWidth) + number(style.paddingBottom);
    let width = number(style.width, NaN);
    let height = number(style.height, NaN);
    width = Number.isFinite(width) ? width - (style.boxSizing === 'border-box' ? left + right : 0) : number(fallback.width) - left - right;
    height = Number.isFinite(height) ? height - (style.boxSizing === 'border-box' ? top + bottom : 0) : number(fallback.height) - top - bottom;
    width = Math.max(0, width);
    height = Math.max(0, height);
    return { x: left, y: top, width, height, outerWidth: width + left + right, outerHeight: height + top + bottom };
  }

  function objectPosition(value) {
    let parts = String(value || '50% 50%').trim().split(/\s+/);
    if (parts.length === 1) parts = /^(top|bottom)$/.test(parts[0]) ? ['50%', parts[0]] : [parts[0], '50%'];
    if (/^(top|bottom)$/.test(parts[0]) || /^(left|right)$/.test(parts[1])) parts = [parts[1], parts[0]];
    const axis = token => {
      const keywords = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
      token = keywords[token] || token;
      return /%$/.test(token) ? { fraction: number(token, 50) / 100, offset: 0 } : { fraction: 0, offset: number(token) };
    };
    return parts.slice(0, 2).map(axis);
  }

  function imageGeometry(box, naturalWidth, naturalHeight, fit = 'fill', position = '50% 50%', cornerRatio = .06, trim = null, trimGuard = 0) {
    const cw = box.width, ch = box.height;
    if (!(cw > 0 && ch > 0)) return null;
    const nw = naturalWidth > 0 ? naturalWidth : cw;
    const nh = naturalHeight > 0 ? naturalHeight : ch;
    let width = cw, height = ch;
    if (fit !== 'fill') {
      let scale = fit === 'cover' ? Math.max(cw / nw, ch / nh) : Math.min(cw / nw, ch / nh);
      if (fit === 'none') scale = 1;
      if (fit === 'scale-down') scale = Math.min(1, scale);
      width = nw * scale;
      height = nh * scale;
    }
    const [horizontal, vertical] = objectPosition(position);
    const x = (cw - width) * horizontal.fraction + horizontal.offset;
    const y = (ch - height) * vertical.fraction + vertical.offset;
    // Replaced image content is clipped to the content box by the browser.
    const inset = side => Math.max(0, Math.min(.1, number(trim?.[side])));
    // A measured source pixel may occupy less than one screen pixel. Hide its
    // interpolation fringe too, and only on edges with an actual scan line.
    const edge = (side, length) => length * inset(side) + (inset(side) > 0 ? Math.max(0, trimGuard) : 0);
    const visibleLeft = Math.max(0, x + edge('left', width));
    const visibleTop = Math.max(0, y + edge('top', height));
    const left = box.x + visibleLeft, top = box.y + visibleTop;
    const visibleWidth = Math.max(0, Math.min(cw, x + width - edge('right', width)) - visibleLeft);
    const visibleHeight = Math.max(0, Math.min(ch, y + height - edge('bottom', height)) - visibleTop);
    const radius = Math.min(visibleWidth, visibleHeight) * ratio(cornerRatio);
    const insets = [top, box.outerWidth - left - visibleWidth, box.outerHeight - top - visibleHeight, left];
    return { left, top, width: visibleWidth, height: visibleHeight, radius, insets,
      clip: 'inset(' + insets.map(px).join(' ') + ' round ' + px(radius) + ')' };
  }

  function observe(document, view) {
    const tracked = new Set(), pending = new Set(), ownStyles = new WeakMap(), readyCallbacks = new WeakMap();
    let scheduled = false;
    const resizeObserver = view.ResizeObserver ? new view.ResizeObserver(entries => entries.forEach(entry => queue(entry.target))) : null;
    function write(element, name, value) {
      if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
      ownStyles.set(element, element.getAttribute('style'));
    }
    function release(element) {
      tracked.delete(element);
      pending.delete(element);
      if (resizeObserver) resizeObserver.unobserve(element);
      element.removeAttribute('data-card-art');
      element.removeAttribute('data-fan-card-trim');
      element.style.removeProperty('--card-art-clip');
      element.style.removeProperty('--card-art-radius');
      element.style.removeProperty('--card-art-background-clip');
      ownStyles.set(element, element.getAttribute('style'));
    }
    function update(element) {
      if (!element.isConnected) { release(element); return; }
      const style = view.getComputedStyle(element);
      const box = localBox(style, { width: element.offsetWidth, height: element.offsetHeight });
      const cornerRatio = style.getPropertyValue('--card-art-corner-ratio');
      if (!readyCallbacks.has(element)) readyCallbacks.set(element, () => queue(element));
      const trim = view.FanCardTrims?.lookup(element, style, readyCallbacks.get(element));
      if (trim) element.setAttribute('data-fan-card-trim', '');
      else element.removeAttribute('data-fan-card-trim');
      const trimGuard = trim ? 1 / Math.max(1, number(view.devicePixelRatio, 1)) : 0;
      if (element.getAttribute('data-card-art') === 'image') {
        const geometry = imageGeometry(box, element.naturalWidth, element.naturalHeight, style.objectFit, style.objectPosition, cornerRatio, trim, trimGuard);
        if (geometry) write(element, '--card-art-clip', geometry.clip);
      } else {
        write(element, '--card-art-radius', px(Math.min(box.outerWidth, box.outerHeight) * ratio(cornerRatio)));
        const fit = ['contain', 'cover'].includes(style.backgroundSize) ? style.backgroundSize : 'fill';
        const geometry = trim && imageGeometry(box, trim.naturalWidth, trim.naturalHeight, fit, style.backgroundPosition, cornerRatio, trim, trimGuard);
        write(element, '--card-art-background-clip', geometry ? geometry.clip : 'none');
      }
    }
    function queue(element) {
      if (!tracked.has(element)) return;
      pending.add(element);
      if (scheduled) return;
      scheduled = true;
      (view.requestAnimationFrame || view.setTimeout).call(view, () => {
        scheduled = false;
        const elements = Array.from(pending);
        pending.clear();
        elements.forEach(update);
      });
    }
    function reconcile(element) {
      const kind = element.matches(imageSelector) && !element.classList.contains('custom-token') ? 'image' : element.matches(backgroundSelector) ? 'background' : null;
      if (!kind) { if (tracked.has(element)) release(element); return; }
      element.setAttribute('data-card-art', kind);
      if (!tracked.has(element)) {
        tracked.add(element);
        if (resizeObserver) resizeObserver.observe(element);
      }
      queue(element);
    }
    function scan(node) {
      if (node.nodeType === 1) reconcile(node);
      if (node.querySelectorAll) node.querySelectorAll(candidateSelector).forEach(reconcile);
    }
    function remove(node) {
      if (node.isConnected) return;
      if (tracked.has(node)) release(node);
      if (node.querySelectorAll) node.querySelectorAll('[data-card-art]').forEach(element => {
        if (tracked.has(element)) release(element);
      });
    }
    const mutationObserver = new view.MutationObserver(records => {
      const roots = new Set();
      records.forEach(record => {
        if (record.type === 'childList') {
          record.removedNodes.forEach(remove);
          record.addedNodes.forEach(node => roots.add(node));
        } else if (record.attributeName !== 'style' || ownStyles.get(record.target) !== record.target.getAttribute('style')) {
          roots.add(record.target);
        }
      });
      roots.forEach(scan);
    });
    const load = event => { if (event.target.nodeType === 1) reconcile(event.target); };
    document.addEventListener('load', load, true);
    mutationObserver.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src', 'srcset', 'sizes', 'style'] });
    if (!resizeObserver) view.addEventListener('resize', () => tracked.forEach(queue));
    scan(document);
    return { disconnect() {
      mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      document.removeEventListener('load', load, true);
      Array.from(tracked).forEach(release);
    } };
  }

  return { imageSelector, backgroundSelector, localBox, objectPosition, imageGeometry, observe };
});
