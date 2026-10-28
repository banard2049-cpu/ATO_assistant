/* Mobile composition for complete, original map/AIBP/story documents.
 * Move original nodes only; no business controls, names, icons or handlers are replaced.
 */
(() => {
  'use strict';
  const page = window.ATO_PREVIEW_PAGE;
  if (!['map', 'aibp', 'story'].includes(page)) return;
  const $ = selector => document.querySelector(selector);
  function chrome(title, parent, before) {
    const header = document.createElement('header');
    header.className = 'source-play-header source-' + page + '-header';
    const line = document.createElement('div');
    line.className = 'source-play-header-line';
    if (title) line.append(title);
    header.append(line);
    parent.insertBefore(header, before || parent.firstChild);
    return {header, line};
  }
  function tools(title, triggerParent, nodes) {
    const result = window.ATO_PREVIEW_LAYOUT.createTools({title, triggerParent, nodes: nodes.filter(Boolean)});
    result.dialog.classList.add('source-play-tools', 'source-' + page + '-tools');
    result.body.classList.add('source-play-tools-body');
    return result;
  }
  const close = result => {
    if (typeof result.close === 'function') result.close();
    else if (result.dialog.open) result.dialog.close();
  };
  function closeBeforeOverlay(sheet, selector) {
    // Native dialogs / ordinary overlay divs belong to the original renderer.
    // Release the sheet's top layer first, then let its original handler run.
    sheet.dialog.addEventListener('click', event => {
      if (sheet.dialog.open && event.target.closest(selector)) close(sheet);
    }, true);
  }
  function map() {
    const app = $('main.app'), title = $('#mapTitle'), oldHeader = $('.topbar');
    if (!app || !title || !oldHeader) return;
    document.body.classList.add('source-map-layout');
    const {header, line} = chrome(title, app, oldHeader);
    const save = $('#campaignSaveStatus');
    if (save) save.classList.add('source-map-save-state');
    const sheet = tools('ATO 地图模块 · 工具', line, [$('.topbar-tools'), $('.sticky-actions'), save]);
    // Keep the original cycle buttons and zoom input next to the map. Neither
    // changes map coordinates, tile dimensions relative to each other or rules.
    const cycles = $('#cycleTabs');
    if (cycles) { cycles.classList.add('source-map-cycles'); header.append(cycles); }
    // Keep the original empty wrappers and IDs in the document. They are only layout shells.
    oldHeader.classList.add('source-play-empty-header');
    const viewport = $('.tile-grid-viewport');
    if (viewport) viewport.classList.add('source-map-canvas-viewport');
    const controls = document.createElement('div');
    controls.className = 'source-map-canvas-controls';
    const zoom = $('.zoom-control');
    if (zoom) controls.append(zoom);
    const locate = document.createElement('button');
    locate.type = 'button'; locate.className = 'secondary';
    locate.textContent = '定位阿尔戈号';
    locate.addEventListener('click', () => window.centerMapViewportOnArgo?.());
    controls.append(locate); app.append(controls);
    $('#tokenPalette')?.addEventListener('click', event => {
      if (event.target.closest('button')) close(sheet);
    });
    // The original JS schedules map sizing while loading. Re-evaluate it after reparenting.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  function aibp() {
    const app = $('body > .app'), sidebar = $('body > .app > aside'), main = $('body > .app > main');
    const title = $('#aibpTitle');
    if (!app || !sidebar || !main || !title) return;
    document.body.classList.add('source-aibp-layout');
    const {header, line} = chrome(title, app, main);
    const toggle = $('#sidebarToggle');
    const sheet = tools('始徒 · 工具', line, [toggle, sidebar, $('.title-actions')]);
    closeBeforeOverlay(sheet, '#traitButton, #tokenButton, #newCampaignButton');
    sidebar.classList.add('source-aibp-sidebar');
    if (toggle) toggle.classList.add('source-aibp-sidebar-toggle');
    // Keep current name/level/faction in the actual title row. The original renderer owns it.
    $('.title-row')?.classList.add('source-aibp-current');
    const bossTitle = $('#title');
    let previousBoss = bossTitle?.textContent;
    if (bossTitle) new MutationObserver(() => {
      const current = bossTitle.textContent;
      if (current !== previousBoss && sheet.dialog.open) close(sheet);
      previousBoss = current;
    }).observe(bossTitle, {childList: true, subtree: true, characterData: true});
    header.classList.add('source-aibp-sticky');
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  function story() {
    const sidebar = $('body > aside.sidebar'), brand = $('.sidebar > .brand'), reader = $('main.reader');
    if (!sidebar || !brand || !reader) return;
    document.body.classList.add('source-story-layout');
    const {header, line} = chrome(brand, document.body, sidebar);
    const readerActions = $('.reader-actions');
    const options = document.createElement('section');
    options.className = 'source-story-reader-options';
    // Existing TTS transport buttons and entry badge stay in a single compact row.
    // All other original options remain intact inside the tools sheet.
    if (readerActions) {
      for (const node of [...readerActions.children]) {
        if (!['ttsButton', 'ttsPauseButton', 'entryBadge'].includes(node.id)) options.append(node);
      }
      readerActions.classList.add('source-story-reader-transport');
      header.append(readerActions);
    }
    const status = $('#ttsStatusBox');
    const sheet = tools('故事书跳转器 · 工具', line, [sidebar, options, status]);
    closeBeforeOverlay(sheet, '#ttsConfigButton');
    sidebar.classList.add('source-story-sidebar');
    const text = $('#storyText');
    let previousText = text?.textContent;
    if (text) new MutationObserver(() => {
      const current = text.textContent;
      if (current === previousText) return;
      previousText = current;
      if (!sheet.dialog.open) return;
      close(sheet);
      requestAnimationFrame(() => window.scrollTo({top: 0, behavior: 'auto'}));
    }).observe(text, {childList: true});
  }
  function install() {
    if (document.documentElement.dataset.sourcePlayLayout === page) return;
    if (!window.ATO_PREVIEW_LAYOUT?.createTools) return;
    ({map, aibp, story})[page]();
    document.documentElement.dataset.sourcePlayLayout = page;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once: true});
  else install();
})();
