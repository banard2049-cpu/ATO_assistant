/* APK portrait layout only. Original tree, equipment and mutations are retained. */
(() => {
  'use strict';
  window.ATO_MOBILE_LAYOUT.register('technology', ctx => {
    const heading = document.querySelector('.page-heading');
    const mainView = document.getElementById('mainView');
    if (!heading || !mainView) return;
    ctx.class(document.documentElement, 'source-technology-mobile');
    const actions = document.createElement('div');
    actions.className = 'source-tech-heading-actions';
    ctx.add(actions, heading);
    ctx.move(document.getElementById('cycleBadge'), actions);
    ctx.move(document.getElementById('cycleMenu'), actions);
    const tools = ctx.tools({title: '科技 · 工具', triggerParent: actions,
      nodes: [document.querySelector('.tools'), document.getElementById('campaignSaveStatus'),
        document.getElementById('returnMain')].filter(Boolean)});
    ctx.class(tools.dialog, 'source-tech-tools');
    ctx.on(tools.dialog, 'click', event => {
      if (event.target.closest('#returnMain')) tools.close();
    }, true);
    ctx.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden']}, () => {
      if (tools.dialog.open && document.querySelector('.modal-backdrop.open')) tools.close();
    });
    const summarySlot = document.createElement('section');
    summarySlot.className = 'source-tech-summary-slot';
    ctx.add(summarySlot, tools.body);
    const resourceSlot = document.createElement('section');
    resourceSlot.className = 'source-tech-resource-slot';
    ctx.add(resourceSlot, tools.body);
    const retired = document.createDocumentFragment();
    function refresh() {
      const progress = mainView.querySelector('.tech-progress');
      if (progress) {
        for (const previous of [...summarySlot.children]) if (previous !== progress) ctx.move(previous, retired);
        ctx.move(progress, summarySlot);
      }
      summarySlot.hidden = !mainView.classList.contains('tech-tree-view');
      const resources = mainView.querySelector('.gear-resource-sidebar');
      if (resources) {
        for (const previous of [...resourceSlot.children]) if (previous !== resources) ctx.move(previous, retired);
        ctx.move(resources, resourceSlot);
      }
      resourceSlot.hidden = !mainView.querySelector('.gear-layout');
      // The source submit handler reads form fields inside mainView. Keep them there.
      for (const bar of mainView.querySelectorAll('.gear-filter-bar')) {
        if (bar.parentElement?.classList.contains('source-gear-controls')) continue;
        const details = document.createElement('details');
        details.className = 'source-gear-controls';
        ctx.add(details, bar.parentNode, bar);
        const summary = document.createElement('summary'); summary.textContent = '工具';
        ctx.add(summary, details);
        ctx.move(bar, details);
      }
    }
    let queued = false;
    ctx.observe(mainView, {childList: true, subtree: true}, () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (ctx.active) refresh(); });
    });
    refresh();
  });
})();
