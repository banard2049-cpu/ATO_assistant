/* Keep the complete replay, export and backup clients; move layout nodes only. */
(() => {
  'use strict';
  window.ATO_MOBILE_LAYOUT?.register('briefing', ctx => {
    const $ = selector => document.querySelector(selector);
    const heading = $('.briefing-head'), title = $('#briefingTitle');
    if (!heading || !title) return;
    ctx.class(document.documentElement, 'source-briefing-mobile');
    const actions = document.createElement('div');
    actions.className = 'source-briefing-heading-actions';
    ctx.add(actions, heading);
    ctx.move($('#cycleSelect')?.closest('label'), actions);
    const sheet = ctx.tools({
      title: '战役简报 · 工具', triggerParent: actions,
      nodes: [$('.head-eyebrow'), $('#headSub'), $('.head-side'), $('.briefing-toolbar'),
        $('.backup-toolbar'), $('#speedSelect')?.closest('label')].filter(Boolean),
    });
    ctx.class(sheet.dialog, 'source-briefing-tools');
    const navigation = document.createElement('div');
    navigation.className = 'source-briefing-navigation';
    ctx.add(navigation, heading.parentNode, heading.nextSibling);
    ctx.move($('.replay-controls'), navigation);
    ctx.move($('#dayIndex'), navigation);
  });
})();
