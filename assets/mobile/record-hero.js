/* Move original record/hero controls only; the transaction restores landscape. */
(() => {
  'use strict';
  for (const page of ['record', 'hero']) window.ATO_MOBILE_LAYOUT.register(page, ctx => {
    const app = document.querySelector('main.app');
    const header = app?.querySelector(':scope > .topbar');
    const title = document.getElementById(page === 'record' ? 'recordTitle' : 'heroTitle');
    if (!app || !header || !title) return;
    ctx.attr(document.documentElement, 'data-record-hero-mobile', 'true');
    ctx.attr(document.documentElement, 'data-record-hero-page', page);
    ctx.class(header, 'source-record-hero-header');
    ctx.class(app, 'source-record-hero-app');
    const line = document.createElement('div');
    line.className = 'source-rh-title-line';
    ctx.add(line, header, header.firstChild);
    ctx.move(title, line);
    const nodes = [];
    if (page === 'record') {
      const profile = document.getElementById('profileName')?.closest('label');
      if (profile) { ctx.class(profile, 'source-rh-profile'); nodes.push(profile); }
      const cycle = document.getElementById('cycleSelect')?.closest('label');
      if (cycle) { ctx.class(cycle, 'source-rh-cycle'); ctx.move(cycle, line); }
    }
    const toolbar = header.querySelector('.toolbar');
    if (toolbar) nodes.push(toolbar);
    const tools = ctx.tools({title: title.textContent.trim() + ' · 工具', triggerParent: line, nodes});
    ctx.class(tools.body, 'source-rh-tool-body');
    ctx.class(tools.dialog, 'source-rh-tool-dialog');
    ctx.on(tools.body, 'click', event => {
      const button = event.target.closest('button');
      if ((page === 'hero' && ['addHeroButton', 'graveyardButton'].includes(button?.id))
          || (page === 'record' && button?.id === 'printButton')) tools.close();
    }, true);
    const status = document.getElementById('saveStatus');
    if (status) {
      ctx.class(status, 'source-rh-save-status');
      ctx.move(status, page === 'hero' ? tools.body : header);
    }
    if (page === 'record') {
      const section = document.createElement('section');
      section.className = 'source-rh-section-locations';
      section.innerHTML = '<h3>分区定位</h3><nav aria-label="分区定位"></nav>';
      ctx.add(section, tools.body);
      const nav = section.querySelector('nav');
      let signature = '';
      const update = () => {
        const headings = [...app.querySelectorAll('.panel-heading h2')];
        const next = JSON.stringify(headings.map(h => h.textContent.trim()));
        if (next === signature) return;
        signature = next;
        nav.replaceChildren();
        for (const [index, heading] of headings.entries()) {
          const target = heading.closest('.panel');
          if (!target) continue;
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = heading.textContent.trim();
          button.dataset.recordSection = String(index);
          ctx.on(button, 'click', () => tools.close().then(() => {
            if (ctx.active && target.isConnected) target.scrollIntoView({block: 'start', behavior: 'auto'});
          }));
          ctx.add(button, nav);
        }
      };
      ctx.observe(app, {childList: true, subtree: true, characterData: true}, update);
      update();
    }
    if (page === 'hero') {
      const nav = document.createElement('nav');
      nav.className = 'source-hero-locations';
      nav.setAttribute('aria-label', '英雄定位');
      ctx.add(nav, header);
      const grid = document.querySelector('.heroes-grid');
      let signature = '';
      const update = () => {
        const columns = [...(grid?.querySelectorAll('.hero-column') || [])];
        const labels = columns.map(column => [column.dataset.heroId, column.querySelector('.hero-title-drag h2')?.textContent || '']);
        const next = JSON.stringify(labels);
        if (next === signature) return;
        signature = next;
        nav.replaceChildren();
        for (const [id, name] of labels) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = name; button.dataset.heroLocation = id;
          ctx.on(button, 'click', () => grid.querySelector(`[data-hero-id="${CSS.escape(id)}"]`)
            ?.scrollIntoView({block: 'start', behavior: 'auto'}));
          ctx.add(button, nav);
        }
      };
      if (grid) ctx.observe(grid, {childList: true, subtree: true, characterData: true}, update);
      update();
    }
    for (const wrapper of header.querySelectorAll(':scope > div:not(.source-rh-title-line)')) {
      if (!wrapper.querySelector('button,a,input,select,textarea') && !wrapper.textContent.trim()) {
        ctx.class(wrapper, 'source-rh-empty-wrapper');
      }
    }
  });
})();
