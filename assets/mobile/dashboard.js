/* APK portrait composition. Existing controls retain their nodes and handlers. */
(() => {
  'use strict';
  window.ATO_MOBILE_LAYOUT.register('dashboard', ctx => {
    const app = document.getElementById('appShell');
    const title = document.getElementById('dashboardTitle');
    if (!app || !title) return;
    const header = document.createElement('header');
    header.className = 'mobile-dashboard-header';
    ctx.add(header, app, app.firstChild);
    const line = document.createElement('div');
    line.className = 'mobile-dashboard-title';
    ctx.add(line, header);
    ctx.move(title, line);
    ctx.move(document.querySelector('.title-cycle-control'), line);
    ctx.move(document.querySelector('.record-links'), header);
    ctx.move(document.getElementById('campaignSaveStatus'), document.querySelector('.day-card'));
    const tools = ctx.tools({
      title: title.textContent.trim() + ' · 工具',
      triggerParent: line,
      nodes: [document.querySelector('.session-card')?.closest('section.panel'),
        document.querySelector('.misc-settings-panel'), document.querySelector('.app-updates')].filter(Boolean),
    });
    ctx.class(tools.dialog, 'app mobile-dashboard-tools');
    ctx.class(tools.body, 'mobile-dashboard-sheet-body');
    ctx.class(tools.trigger, 'secondary');
    // Keep the original write-lease gate authoritative for every setting.
    // Top-layer dialogs can stay inside appShell without taking layout space.
    ctx.move(tools.dialog, app);
    for (const control of [tools.trigger, ...tools.dialog.querySelectorAll('.source-sheet-head button,.source-sheet-foot button')]) {
      ctx.attr(control, 'data-dashboard-readonly-allowed', '');
    }
    ctx.observe(app, {attributes: true, attributeFilter: ['hidden']}, () => {
      if (app.hidden && tools.dialog.open) tools.close();
    });
    const oldNavigation = document.querySelector('.dashboard-navigation');
    if (oldNavigation && !oldNavigation.textContent.trim()
        && !oldNavigation.querySelector('button,a,input,select,textarea')) {
      ctx.class(oldNavigation, 'mobile-dashboard-empty-navigation');
    }
    for (const wrapper of app.querySelectorAll(':scope > .topbar > div')) {
      if (!wrapper.textContent.trim() && !wrapper.querySelector('button,a,input,select,textarea')) {
        ctx.class(wrapper, 'mobile-dashboard-empty-wrapper');
      }
    }
    const logout = document.getElementById('logoutButton');
    if (logout) ctx.on(logout, 'click', () => tools.close(), true);
  });
})();
