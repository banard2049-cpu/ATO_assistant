/* Portrait APK composition of the complete map, apostle and story pages.
 * Existing nodes keep their IDs, original handlers, wording and artwork.
 * Every move and listener belongs to the reversible layout transaction. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const layout = window.ATO_MOBILE_LAYOUT;
  if (!layout) return;

  function chrome(ctx, page, title, parent, before) {
    const header = document.createElement('header');
    header.className = 'source-play-header source-' + page + '-header';
    ctx.add(header, parent, before || parent.firstChild);
    const line = document.createElement('div');
    line.className = 'source-play-header-line';
    ctx.add(line, header);
    ctx.move(title, line);
    return {header, line};
  }
  function tools(ctx, page, title, triggerParent, nodes) {
    const sheet = ctx.tools({title, triggerParent, nodes: nodes.filter(Boolean)});
    ctx.class(sheet.dialog, 'source-play-tools source-' + page + '-tools');
    ctx.class(sheet.body, 'source-play-tools-body');
    return sheet;
  }
  function closeBeforeOverlay(ctx, sheet, selector) {
    // Source overlays can be ordinary divs. Release the modal top layer before
    // their original handler runs, without replacing that handler.
    ctx.on(sheet.dialog, 'click', event => {
      if (sheet.dialog.open && event.target.closest(selector)) sheet.close();
    }, true);
  }

  layout.register('map', ctx => {
    const app = $('main.app'), title = $('#mapTitle'), oldHeader = $('.topbar');
    if (!app || !title || !oldHeader) return;
    ctx.class(document.body, 'source-map-layout');
    const {header, line} = chrome(ctx, 'map', title, app, oldHeader);
    const save = $('#campaignSaveStatus');
    ctx.class(save, 'source-map-save-state');
    const sheet = tools(ctx, 'map', 'ATO 地图模块 · 工具', line,
      [$('.topbar-tools'), $('.sticky-actions'), save]);
    const cycles = $('#cycleTabs');
    ctx.class(cycles, 'source-map-cycles');
    ctx.move(cycles, header);
    ctx.class(oldHeader, 'source-play-empty-header');
    ctx.class($('.tile-grid-viewport'), 'source-map-canvas-viewport');
    const controls = document.createElement('div');
    controls.className = 'source-map-canvas-controls';
    ctx.add(controls, app);
    ctx.move($('.zoom-control'), controls);
    const locate = document.createElement('button');
    locate.type = 'button'; locate.className = 'secondary';
    locate.textContent = '定位阿尔戈号';
    ctx.add(locate, controls);
    ctx.on(locate, 'click', () => window.centerMapViewportOnArgo?.());
    ctx.on($('#tokenPalette'), 'click', event => {
      if (event.target.closest('button')) sheet.close();
    });
    closeBeforeOverlay(ctx, sheet, '#headerSaveReturnButton, #saveReturnButton, #openTagEditorButton');
    // Preserve the player's current zoom. Only recalculate the available area.
    ctx.frame(() => window.dispatchEvent(new Event('resize')));
  });

  layout.register('aibp', ctx => {
    const app = $('body > .app'), sidebar = $('body > .app > aside'), main = $('body > .app > main');
    const title = $('#aibpTitle');
    if (!app || !sidebar || !main || !title) return;
    ctx.class(document.body, 'source-aibp-layout');
    const {header, line} = chrome(ctx, 'aibp', title, app, main);
    const toggle = $('#sidebarToggle');
    const sheet = tools(ctx, 'aibp', '始徒 · 工具', line, [toggle, sidebar, $('.title-actions')]);
    closeBeforeOverlay(ctx, sheet, '#traitButton, #tokenButton, #newCampaignButton');
    ctx.class(sidebar, 'source-aibp-sidebar');
    ctx.class(toggle, 'source-aibp-sidebar-toggle');
    ctx.class($('.title-row'), 'source-aibp-current');
    const bossTitle = $('#title');
    let previousBoss = bossTitle?.textContent;
    ctx.observe(bossTitle, {childList: true, subtree: true, characterData: true}, () => {
      const current = bossTitle.textContent;
      if (current !== previousBoss && sheet.dialog.open) sheet.close();
      previousBoss = current;
    });
    ctx.class(header, 'source-aibp-sticky');
    ctx.frame(() => window.dispatchEvent(new Event('resize')));
  });

  layout.register('story', ctx => {
    const sidebar = $('body > aside.sidebar'), brand = $('.sidebar > .brand'), reader = $('main.reader');
    if (!sidebar || !brand || !reader) return;
    ctx.class(document.body, 'source-story-layout');
    const {header, line} = chrome(ctx, 'story', brand, document.body, sidebar);
    const readerActions = $('.reader-actions');
    const options = document.createElement('section');
    options.className = 'source-story-reader-options';
    ctx.add(options);
    if (readerActions) {
      for (const node of [...readerActions.children]) {
        if (!['ttsButton', 'ttsPauseButton', 'entryBadge'].includes(node.id)) ctx.move(node, options);
      }
      ctx.class(readerActions, 'source-story-reader-transport');
      ctx.move(readerActions, header);
    }
    const sheet = tools(ctx, 'story', '故事书跳转器 · 工具', line,
      [sidebar, options, $('#ttsStatusBox')]);
    closeBeforeOverlay(ctx, sheet, '#ttsConfigButton');
    ctx.class(sidebar, 'source-story-sidebar');
    const text = $('#storyText');
    let previousText = text?.textContent;
    ctx.observe(text, {childList: true}, () => {
      const current = text.textContent;
      if (current === previousText) return;
      previousText = current;
      if (!sheet.dialog.open) return;
      sheet.close().then(() => {
        if (ctx.active) window.scrollTo({top: 0, behavior: 'auto'});
      });
    });
  });
})();
