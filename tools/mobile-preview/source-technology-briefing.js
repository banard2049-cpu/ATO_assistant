/* Layout-only adapters: keep the source nodes, IDs, labels and handlers intact. */
(() => {
  'use strict';
  const page = window.ATO_PREVIEW_PAGE;
  const $ = selector => document.querySelector(selector);

  function technology() {
    const heading = $('.page-heading');
    const mainView = $('#mainView');
    if (!heading || !mainView || heading.dataset.sourceMobile) return;
    heading.dataset.sourceMobile = 'true';
    document.documentElement.classList.add('source-technology-mobile');
    const actions = document.createElement('div');
    actions.className = 'source-tech-heading-actions';
    const cycleBadge = $('#cycleBadge');
    const cycleMenu = $('#cycleMenu');
    if (cycleBadge) actions.append(cycleBadge);
    if (cycleMenu) actions.append(cycleMenu);
    heading.append(actions);
    const tools = window.ATO_PREVIEW_LAYOUT.createTools({
      title: '科技 · 工具',
      triggerParent: actions,
      nodes: [$('.tools'), $('#campaignSaveStatus'), $('#returnMain')].filter(Boolean),
    });
    tools.dialog.classList.add('source-tech-tools');
    // The original return handler performs an asynchronous save and then hands
    // navigation to the page router. Close the sheet before that handler runs,
    // so returning to this module does not restore a modal over its content.
    tools.dialog.addEventListener('click', event => {
      if (event.target.closest('#returnMain')) tools.close();
    }, true);

    // Original card previews use ordinary .modal-backdrop elements. A native
    // dialog sits above those regardless of z-index. If an original action opens
    // one while tools are open, reveal it without replacing its source handler.
    new MutationObserver(() => {
      if (tools.dialog.open && document.querySelector('.modal-backdrop.open')) tools.close();
    }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden']});
    const summarySlot = document.createElement('section');
    summarySlot.className = 'source-tech-summary-slot';
    const resourceSlot = document.createElement('section');
    resourceSlot.className = 'source-tech-resource-slot';
    tools.body.append(summarySlot, resourceSlot);

    const initialTreePages = new Set();
    function refreshDynamicLayout() {
      const firstNode = mainView.querySelector('.node[data-page-key]');
      const pageKey = firstNode?.dataset.pageKey;
      if (pageKey && !initialTreePages.has(pageKey)) {
        initialTreePages.add(pageKey);
        requestAnimationFrame(() => {
          mainView.querySelector('[data-tree-control="reset"]')?.click();
          mainView.querySelector('[data-tree-control="ready"]')?.click();
        });
      }
      // Progress is display-only. Move the original current element, rather than
      // re-rendering it or fabricating a second copy of the source values.
      const progress = mainView.querySelector('.tech-progress');
      if (progress) summarySlot.replaceChildren(progress);
      summarySlot.hidden = !mainView.classList.contains('tech-tree-view');

      const resources = mainView.querySelector('.gear-resource-sidebar');
      if (resources) resourceSlot.replaceChildren(resources);
      resourceSlot.hidden = !mainView.querySelector('.gear-layout');

      // Keep this bar within mainView: the original arsenal submit handler
      // deliberately queries mainView for its form fields at submit time.
      // Moving it into the global dialog would silently break that function.
      for (const bar of mainView.querySelectorAll('.gear-filter-bar')) {
        if (bar.parentElement?.classList.contains('source-gear-controls')) continue;
        const disclosure = document.createElement('details');
        disclosure.className = 'source-gear-controls';
        const summary = document.createElement('summary');
        summary.textContent = '工具';
        bar.before(disclosure);
        disclosure.append(summary, bar);
      }
    }
    refreshDynamicLayout();
    // The source replaces mainView on every tab/filter/save. Its handlers are
    // installed synchronously before this observer moves/wraps those nodes.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; refreshDynamicLayout(); });
    }).observe(mainView, {childList: true, subtree: true});
  }

  function briefing() {
    const heading = $('.briefing-head');
    const title = $('#briefingTitle');
    if (!heading || !title || heading.dataset.sourceMobile) return;
    heading.dataset.sourceMobile = 'true';
    document.documentElement.classList.add('source-briefing-mobile');
    const cycleField = $('#cycleSelect')?.closest('label');
    const actions = document.createElement('div');
    actions.className = 'source-briefing-heading-actions';
    if (cycleField) actions.append(cycleField);
    heading.append(actions);
    const speedField = $('#speedSelect')?.closest('label');
    const tools = window.ATO_PREVIEW_LAYOUT.createTools({
      title: '战役简报 · 工具',
      triggerParent: actions,
      nodes: [$('.head-eyebrow'), $('#headSub'), $('.head-side'), $('.briefing-toolbar'), $('.backup-toolbar'), speedField].filter(Boolean),
    });
    tools.dialog.classList.add('source-briefing-tools');

    const navigation = document.createElement('div');
    navigation.className = 'source-briefing-navigation';
    const replayControls = $('.replay-controls');
    const index = $('#dayIndex');
    if (replayControls) navigation.append(replayControls);
    if (index) navigation.append(index);
    heading.after(navigation);
    // Everything else stays in its original replay/panes/log containers:
    // story, doom, knowledge, all hubs, both canvases and the complete log.
  }

  function install() {
    if (!window.ATO_PREVIEW_LAYOUT?.createTools) return;
    if (page === 'technology') technology();
    else if (page === 'briefing') briefing();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once: true});
  else install();
})();
