/* Layout transactions for the installed APK. Business clients and storage stay original. */
(() => {
  'use strict';
  const installers = new Map();
  const path = location.pathname.replace(/\/+$/, '');
  const moduleMatch = path.match(/\/(record|hero|aibp|technology|map|story|briefing)(?:\/index\.html)?$/);
  const page = moduleMatch?.[1] || (/\/index\.html$/.test(path) || !path ? 'dashboard' : '');
  let context = null, ready = document.readyState !== 'loading', environment = null, printing = false;

  function nativeEnvironment() {
    // Single-window mode and a mobile user agent are also used by browsers and
    // previews. Only the installed host provides this read-only native method.
    try {
      if (typeof window.ATOAndroid?.mobileLayoutEnvironment !== 'function') return null;
      const result = JSON.parse(window.ATOAndroid.mobileLayoutEnvironment());
      if (result?.apk !== true || !Number.isFinite(result.width) || !Number.isFinite(result.height)) return null;
      return result;
    } catch { return null; }
  }

  function transaction() {
    let active = true;
    const moves = [], moved = new WeakSet(), generated = new Set(), cleanup = [], frames = new Set(), sheets = [];
    const ctx = {
      page,
      get active() { return active; },
      move(node, parent, before = null) {
        if (!node || !parent || !active) return node;
        if (node.parentNode === parent && (before === node || before === node.nextSibling || !before && !node.nextSibling)) return node;
        if (!moved.has(node)) {
          const marker = document.createComment('apk-layout-position');
          node.parentNode?.insertBefore(marker, node);
          moves.push({node, marker}); moved.add(node);
        }
        parent.insertBefore(node, before); return node;
      },
      add(node, parent, before = null) {
        if (!node || !active) return node;
        generated.add(node); if (parent) parent.insertBefore(node, before); return node;
      },
      class(node, names) {
        if (!node) return;
        for (const name of names.split(/\s+/).filter(Boolean)) {
          if (node.classList.contains(name)) continue;
          node.classList.add(name); cleanup.push(() => node.classList.remove(name));
        }
      },
      attr(node, name, value) {
        if (!node) return;
        const previous = node.getAttribute(name);
        node.setAttribute(name, value);
        cleanup.push(() => previous === null ? node.removeAttribute(name) : node.setAttribute(name, previous));
      },
      on(target, type, listener, options) {
        if (!target) return;
        const guarded = (...args) => { if (active) return listener(...args); };
        target.addEventListener(type, guarded, options);
        cleanup.push(() => target.removeEventListener(type, guarded, options));
      },
      observe(target, options, callback) {
        if (!target) return null;
        const observer = new MutationObserver((...args) => { if (active) callback(...args); });
        observer.observe(target, options); cleanup.push(() => observer.disconnect()); return observer;
      },
      frame(callback) {
        const id = requestAnimationFrame(() => { frames.delete(id); if (active) callback(); });
        frames.add(id); return id;
      },
      cleanup(callback) { cleanup.push(callback); },
      tools({title, triggerParent, nodes = []}) {
        const dialog = ctx.add(document.createElement('dialog'), document.body);
        dialog.className = 'source-tools';
        dialog.innerHTML = '<div class="source-sheet-handle" aria-hidden="true"></div><header class="source-sheet-head"><h2></h2><button type="button" aria-label="关闭工具">×</button></header><div class="source-sheet-body"></div><footer class="source-sheet-foot"><button type="button">返回内容</button></footer>';
        dialog.querySelector('h2').textContent = title;
        const body = dialog.querySelector('.source-sheet-body');
        for (const node of nodes) if (node) ctx.move(node, body);
        const trigger = ctx.add(document.createElement('button'), triggerParent);
        trigger.type = 'button'; trigger.className = 'source-tools-trigger'; trigger.textContent = '工具';
        dialog.id = 'ato-apk-tools-' + sheets.length;
        trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', dialog.id);
        let scroll = {x: 0, y: 0};
        const close = () => {
          if (!dialog.open) return Promise.resolve();
          const settled = new Promise(resolve => dialog.addEventListener('close', () => requestAnimationFrame(() => requestAnimationFrame(resolve)), {once: true}));
          dialog.close(); return settled;
        };
        ctx.on(trigger, 'click', () => {
          scroll = {x: scrollX, y: scrollY}; dialog.showModal(); body.scrollTop = 0; trigger.setAttribute('aria-expanded', 'true');
        });
        ctx.on(dialog.querySelector('.source-sheet-head button'), 'click', close);
        ctx.on(dialog.querySelector('.source-sheet-foot button'), 'click', close);
        ctx.on(dialog, 'cancel', event => { event.preventDefault(); close(); });
        ctx.on(dialog, 'click', event => {
          const rect = dialog.getBoundingClientRect();
          if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
        });
        ctx.on(dialog, 'close', () => { trigger.setAttribute('aria-expanded', 'false'); scrollTo(scroll.x, scroll.y); });
        // Release the modal top layer for original dialogs; their source event
        // handlers, values and save operations are left intact.
        ctx.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open']}, () => {
          if (dialog.open && [...document.querySelectorAll('dialog[open]')].some(other => other !== dialog)) close();
        });
        const sheet = {dialog, body, trigger, close}; sheets.push(sheet); return sheet;
      },
      back() {
        const sheet = [...sheets].reverse().find(item => item.dialog.open);
        if (!sheet) return false;
        sheet.close(); return true;
      },
      destroy() {
        if (!active) return;
        active = false;
        for (const id of frames) cancelAnimationFrame(id);
        for (const fn of cleanup.reverse()) { try { fn(); } catch (error) { console.error(error); } }
        for (const {dialog} of sheets) if (dialog.open) dialog.close();
        for (const {node, marker} of moves.reverse()) {
          if (marker.isConnected) { marker.parentNode.insertBefore(node, marker); marker.remove(); }
          else if (node.isConnected && !generated.has(node)) node.remove();
        }
        for (const node of generated) node.remove();
      },
    };
    return ctx;
  }

  function refresh() {
    environment = nativeEnvironment();
    const mainPage = window.top === window && !new URLSearchParams(location.search).has('second');
    const eligible = ready && !printing && mainPage && environment?.apk === true && environment.portrait === true
      && environment.height > environment.width && environment.width > 0 && installers.has(page);
    if (eligible === Boolean(context)) return;
    const focused = document.activeElement, scroll = {x: scrollX, y: scrollY};
    if (!eligible) {
      context?.destroy(); context = null; document.documentElement.classList.remove('ato-apk-portrait');
    } else {
      const candidate = transaction(); document.documentElement.classList.add('ato-apk-portrait');
      try { installers.get(page)(candidate); context = candidate; }
      catch (error) { candidate.destroy(); document.documentElement.classList.remove('ato-apk-portrait'); console.error('APK 手机布局加载失败，已恢复原布局。', error); }
    }
    if (focused?.isConnected && !focused.closest('[hidden]')) {
      try { focused.focus({preventScroll: true}); } catch { }
    }
    scrollTo(scroll.x, scroll.y);
    // Map and technology keep their original viewport/zoom implementations.
    requestAnimationFrame(() => window.dispatchEvent(new Event('ato-mobile-layout-change')));
  }

  window.ATO_MOBILE_LAYOUT = {
    register(id, install) { installers.set(id, install); refresh(); },
    refresh,
    back() { return context?.back() || false; },
    get page() { return page; },
    get active() { return Boolean(context); },
    get environment() { return environment && {...environment}; },
  };
  window.addEventListener('ato-android-layout-change', refresh);
  window.addEventListener('resize', refresh);
  window.addEventListener('beforeprint', () => { printing = true; refresh(); });
  window.addEventListener('afterprint', () => { printing = false; refresh(); });
  document.addEventListener('DOMContentLoaded', () => { ready = true; refresh(); }, {once: true});
})();
