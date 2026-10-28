/* Reposition original record/hero nodes only. No business UI is recreated. */
(() => {
  'use strict';
  function install() {
    const page=window.ATO_PREVIEW_PAGE;
    if(!['record','hero'].includes(page)||document.documentElement.dataset.recordHeroMobile==='true')return;
    const app=document.querySelector('main.app'),header=app?.querySelector(':scope > .topbar');
    const title=document.getElementById(page==='record'?'recordTitle':'heroTitle');
    if(!app||!header||!title||!window.ATO_PREVIEW_LAYOUT?.createTools)return;
    document.documentElement.dataset.recordHeroMobile='true';
    document.documentElement.dataset.recordHeroPage=page;
    header.classList.add('source-record-hero-header');
    app.classList.add('source-record-hero-app');
    const line=document.createElement('div');line.className='source-rh-title-line';
    line.append(title);header.prepend(line);
    const toolbar=header.querySelector('.toolbar');
    const nodes=[];
    if(page==='record'){
      const profile=document.getElementById('profileName')?.closest('label');
      if(profile){profile.classList.add('source-rh-profile');nodes.push(profile);}
      const cycle=document.getElementById('cycleSelect')?.closest('label');
      if(cycle){cycle.classList.add('source-rh-cycle');line.append(cycle);}
    }
    if(toolbar)nodes.push(toolbar);
    const tools=window.ATO_PREVIEW_LAYOUT.createTools({title:title.textContent.trim()+' · 工具',triggerParent:line,nodes});
    tools.body?.classList.add('source-rh-tool-body');
    tools.dialog?.classList.add('source-rh-tool-dialog');
    // The original hero picker/graveyard are ordinary body overlays, rather
    // than native dialogs. Release the tool dialog's top layer before their
    // existing button handlers create those overlays. Printing likewise needs
    // to see the record sheet instead of the tool dialog.
    tools.body?.addEventListener('click',event=>{
      const button=event.target.closest?.('button');
      const opensBodyOverlay=page==='hero'&&['addHeroButton','graveyardButton'].includes(button?.id);
      const printsRecord=page==='record'&&button?.id==='printButton';
      if(opensBodyOverlay||printsRecord)tools.close();
    },true);
    const status=document.getElementById('saveStatus');
    if(status){status.classList.add('source-rh-save-status');(page==='hero'?tools.body:header).append(status);}
    if(page==='record'){
      const section=document.createElement('section');section.className='source-rh-section-locations';section.innerHTML='<h3>分区定位</h3><nav aria-label="分区定位"></nav>';tools.body.append(section);
      const nav=section.querySelector('nav');
      const update=()=>{
        const headings=[...app.querySelectorAll('.panel-heading h2')];
        const signature=JSON.stringify(headings.map(h=>h.textContent.trim()));if(nav.dataset.signature===signature)return;nav.dataset.signature=signature;nav.replaceChildren();
        for(const [index,heading]of headings.entries()){
          const target=heading.closest('.panel');if(!target)continue;
          const button=document.createElement('button');button.type='button';button.textContent=heading.textContent.trim();button.dataset.recordSection=String(index);
          button.addEventListener('click',()=>{tools.close().then(()=>target.scrollIntoView({block:'start',behavior:'auto'}));});nav.append(button);
        }
      };
      new MutationObserver(update).observe(app,{childList:true,subtree:true,characterData:true});update();
    }
    if(page==='hero'){
      const nav=document.createElement('nav');nav.className='source-hero-locations';nav.setAttribute('aria-label','英雄定位');header.append(nav);
      const grid=document.querySelector('.heroes-grid');
      const update=()=>{
        const columns=[...(grid?.querySelectorAll('.hero-column')||[])];
        const labels=columns.map(c=>[c.dataset.heroId,c.querySelector('.hero-title-drag h2')?.textContent||'']);
        const signature=JSON.stringify(labels);if(nav.dataset.signature===signature)return;nav.dataset.signature=signature;nav.replaceChildren();
        for(const [id,name]of labels){const button=document.createElement('button');button.type='button';button.textContent=name;button.dataset.heroLocation=id;button.addEventListener('click',()=>grid.querySelector(`[data-hero-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:'start',behavior:'auto'}));nav.append(button);}
      };
      if(grid)new MutationObserver(update).observe(grid,{childList:true,subtree:true,characterData:true});update();
    }
    // Empty wrappers carry no controls. Keep even these original elements in place.
    for(const wrapper of header.querySelectorAll(':scope > div:not(.source-rh-title-line)')){
      if(!wrapper.querySelector('button,a,input,select,textarea')&&!wrapper.textContent.trim())wrapper.classList.add('source-rh-empty-wrapper');
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
