(function () {
  'use strict';
  const base = document.currentScript.src;
  const summary = document.getElementById('cardKeywordsSummary');
  const panel = document.getElementById('panelWrap');
  const traits = document.getElementById('extraGrid');
  const keywordPane = document.getElementById('imageZoomKeywords');
  const overlay = document.getElementById('imageZoomOverlay');
  const zoomImage = document.getElementById('imageZoomImg');
  keywordPane.addEventListener('click', event => event.stopPropagation());
  let cards = null, dictionary = null;
  let drawActive = false;
  let drawLanguage = null;
  let moved = false;
  let userToggled = false;
  let collapsePane = null;

  function placePane() {
    if (keywordPane.hidden || !keywordPane.getBoundingClientRect) return;
    const card = zoomImage.getBoundingClientRect();
    let left, top;
    if (!moved) {
      const artwork = [zoomImage, ...overlay.querySelectorAll('.image-zoom-notice img')]
        .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height);
      const artworkLeft = Math.min(card.left, ...artwork.map(rect => rect.left));
      const artworkTop = Math.min(card.top, ...artwork.map(rect => rect.top));
      const sideWidth = artworkLeft - 24;
      const aboveHeight = artworkTop - 38;
      keywordPane.classList.remove('is-compact');
      if (sideWidth >= 180) {
        const width = Math.min(300, sideWidth);
        keywordPane.style.width = `${width}px`;
        keywordPane.style.maxHeight = `${Math.max(100, window.innerHeight - Math.max(12, card.top) - 26)}px`;
        if (!userToggled) collapsePane?.(false);
        left = artworkLeft - width - 12;
        top = card.top;
      } else if (aboveHeight >= 100) {
        keywordPane.style.width = `${Math.min(300, window.innerWidth - 24)}px`;
        keywordPane.style.maxHeight = `${aboveHeight}px`;
        if (!userToggled) collapsePane?.(false);
        left = 12;
        top = 26;
      } else {
        // The original card layout fills the viewport. Keep a small handle
        // until the user chooses to open the reminder over the cards.
        keywordPane.classList.add('is-compact');
        keywordPane.style.width = `${Math.min(280, window.innerWidth - 24)}px`;
        keywordPane.style.maxHeight = `${Math.min(420, window.innerHeight / 2)}px`;
        if (!userToggled) collapsePane?.(true);
        left = 12;
        top = window.innerHeight - keywordPane.getBoundingClientRect().height - 12;
      }
    }
    const bounds = keywordPane.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - bounds.width - 12);
    const maxTop = Math.max(12, window.innerHeight - Math.min(bounds.height, window.innerHeight - 24) - 12);
    keywordPane.style.left = `${Math.max(12, Math.min(moved ? bounds.left : left, maxLeft))}px`;
    keywordPane.style.top = `${Math.max(12, Math.min(moved ? bounds.top : top, maxTop))}px`;
  }
  function enableDrag(title) {
    title.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button,a,input')) return;
      const start = keywordPane.getBoundingClientRect();
      const x = event.clientX, y = event.clientY;
      title.setPointerCapture(event.pointerId);
      const move = current => {
        moved = true;
        keywordPane.style.left = `${start.left + current.clientX - x}px`;
        keywordPane.style.top = `${start.top + current.clientY - y}px`;
        placePane();
      };
      const finish = () => {
        title.removeEventListener('pointermove', move);
        title.removeEventListener('pointerup', finish);
        title.removeEventListener('pointercancel', finish);
      };
      title.addEventListener('pointermove', move);
      title.addEventListener('pointerup', finish);
      title.addEventListener('pointercancel', finish);
      event.preventDefault();
    });
  }

  function path(src) {
    try {
      const pathname = decodeURIComponent(new URL(src, base).pathname);
      const offset = pathname.toLowerCase().lastIndexOf('/ps/');
      return offset < 0 ? '' : pathname.slice(offset + 1).toLowerCase();
    } catch (_) { return ''; }
  }
  function words(src) { return cards?.[path(src)] || []; }
  function scanned(src) { return Object.prototype.hasOwnProperty.call(cards || {}, path(src)); }
  function currentLanguage() {
    return window.ATO_LANGUAGE?.get?.() || document.documentElement?.dataset.atoLanguage || 'fan';
  }
  function createWords(list, language) {
    const box = document.createElement('div');
    dictionary.unique(list).forEach(entry => box.append(window.AibpKeywords.renderEntry(entry, { language })));
    return box;
  }
  function refresh() {
    if (!cards) return;
    summary.replaceChildren();
    const images = [...panel.querySelectorAll('img.panel-image'), ...traits.querySelectorAll('img')];
    const found = new Set();
    let missing = 0;
    images.forEach(img => {
      const src = img.dataset.fullSrc || img.dataset.frontSrc || img.getAttribute('src');
      if (!scanned(src)) missing++;
      words(src).forEach(word => found.add(word));
    });
    if (!found.size) summary.textContent = images.length ? '已扫描的当前卡牌未识别到关键词。' : '没有可用的卡面。';
    else summary.append(createWords([...found].sort((a, b) => a.localeCompare(b))));
    if (missing) {
      const warning = document.createElement('div');
      warning.textContent = `${missing} 张当前卡面未扫描。`;
      summary.append(warning);
    }
    const hint = document.createElement('small');
    hint.textContent = ' 基于扫描时的卡图自动识别，可能漏识或误识，请以当前卡面为准。';
    summary.append(hint);
  }
  const index = fetch(new URL('card-keywords.json?v=4', base)).then(response => {
    if (!response.ok) throw new Error('card keyword index unavailable');
    return response.json();
  });
  const ready = Promise.all([index, window.AibpKeywords.load()]).then(([data, model]) => {
    if (!model) throw new Error('keyword dictionary unavailable');
    dictionary = model;
    cards = Object.fromEntries(Object.entries(data.cards || {}).map(([key, value]) => [path(key), Array.isArray(value) ? value : []]));
    refresh();
  }).catch(() => { summary.textContent = '卡牌关键词加载失败，请重新打开页面重试。'; });
  const observer = new MutationObserver(refresh);
  observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-full-src'] });
  observer.observe(traits, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-full-src'] });

  function showDraw(src, { preserveState = false } = {}) {
    drawActive = true;
    const key = path(src);
    void ready.then(() => {
      if (!cards || !overlay.classList.contains('show') || path(zoomImage.getAttribute('src')) !== key) return;
      const previous = keywordPane.querySelector('.card-keywords-draw');
      const preserve = preserveState && previous?.dataset.cardKeywordSrc === key;
      const expanded = new Set(preserve ? [...previous.querySelectorAll('.keyword-entry[open]')].map(node => node.dataset.keywordId) : []);
      const linked = preserve ? previous.querySelector('.keyword-linked-lookup .keyword-entry')?.dataset.keywordId : null;
      const scrollTop = keywordPane.scrollTop;
      const collapsed = preserve && previous.classList.contains('is-collapsed');
      if (!preserve) { moved = false; userToggled = false; }
      previous?.remove();
      const list = words(src);
      const language = currentLanguage();
      drawLanguage = language;
      const box = document.createElement('div');
      box.className = 'image-zoom-notice-text card-keywords-draw';
      box.dataset.cardKeywordSrc = key;
      const title = document.createElement('div');
      title.className = 'image-zoom-notice-text-title';
      title.textContent = language === 'en' ? 'Card keywords' : '卡牌关键词';
      title.title = language === 'en' ? 'Drag keyword reminder' : '拖动关键词提醒';
      enableDrag(title);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'keyword-pane-toggle';
      const setCollapsed = closed => {
        box.classList.toggle('is-collapsed', closed);
        toggle.textContent = closed ? '+' : '−';
        toggle.setAttribute('aria-expanded', String(!closed));
        toggle.setAttribute('aria-label', language === 'en' ? (closed ? 'Expand keywords' : 'Collapse keywords') : (closed ? '展开关键词' : '收起关键词'));
      };
      collapsePane = setCollapsed;
      setCollapsed(collapsed);
      toggle.addEventListener('click', () => { userToggled = true; setCollapsed(!box.classList.contains('is-collapsed')); placePane(); });
      title.append(toggle);
      const value = document.createElement('div');
      value.className = 'image-zoom-notice-text-value';
      if (list.length) value.append(createWords(list, language));
      else value.textContent = language === 'en'
        ? scanned(src) ? 'No keywords detected.' : 'This card has not been scanned.'
        : scanned(src) ? '未识别到关键词。' : '此卡面尚未扫描。';
      box.append(title, value);
      const linkedEntry = linked && dictionary.entryFor(linked);
      if (linkedEntry) {
        const lookup = document.createElement('div');
        lookup.className = 'keyword-linked-lookup';
        lookup.append(window.AibpKeywords.renderEntry(linkedEntry, { language }));
        box.append(lookup);
      }
      if (preserve) box.querySelectorAll('.keyword-entry').forEach(node => { node.open = expanded.has(node.dataset.keywordId); });
      keywordPane.append(box);
      keywordPane.hidden = false;
      placePane();
      if (preserve) keywordPane.scrollTop = scrollTop;
    });
  }
  new MutationObserver(() => {
    if (drawActive && zoomImage.getAttribute('src')) showDraw(zoomImage.getAttribute('src'));
  }).observe(zoomImage, { attributes: true, attributeFilter: ['src'] });
  zoomImage.addEventListener('load', placePane);
  overlay.addEventListener('load', placePane, true);
  keywordPane.addEventListener('toggle', placePane, true);
  window.addEventListener?.('resize', placePane);
  if (document.documentElement) {
    new MutationObserver(() => {
      // The language adapter may write the same root attribute while applying
      // UI translations. Rebuild only when the displayed language changes.
      refresh();
      if (drawActive && currentLanguage() !== drawLanguage && zoomImage.getAttribute('src')) {
        showDraw(zoomImage.getAttribute('src'), { preserveState: true });
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ato-language'] });
  }
  window.AibpCardKeywords = { showDraw, resetDraw() {
    drawActive = false;
    collapsePane = null;
    keywordPane.hidden = true;
    keywordPane.replaceChildren();
  } };
})();
