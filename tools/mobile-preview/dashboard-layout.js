/* Keep every original node and event handler. Move only outer layout containers. */
(() => {
  'use strict';
  function install() {
    const app=document.getElementById('appShell');
    if(!app||document.getElementById('dashboardTools'))return;
    const header=document.createElement('header');header.className='preview-dashboard-header';
    const line=document.createElement('div');line.className='preview-dashboard-title';
    line.append(document.getElementById('dashboardTitle'));
    const cycle=document.querySelector('.title-cycle-control');line.append(cycle);
    const trigger=document.createElement('button');trigger.type='button';trigger.textContent='工具';trigger.id='dashboardToolsTrigger';trigger.className='secondary';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','dashboardTools');trigger.setAttribute('aria-expanded','false');line.append(trigger);
    const nav=document.querySelector('.record-links');header.append(line,nav);app.prepend(header);
    const status=document.getElementById('campaignSaveStatus');document.querySelector('.day-card').append(status);
    const oldNav=document.querySelector('.dashboard-navigation');if(oldNav&&!oldNav.children.length)oldNav.remove();
    const dialog=document.createElement('dialog');dialog.id='dashboardTools';dialog.className='app preview-dashboard-tools';
    dialog.innerHTML='<div class="preview-sheet-handle" aria-hidden="true"></div><header class="preview-sheet-head"><h2>主控台 · 工具</h2><button type="button" class="secondary" id="dashboardToolsClose" aria-label="关闭工具">×</button></header><div class="preview-sheet-body"></div><footer class="preview-sheet-footer"><button type="button" class="secondary" id="dashboardPreviewReset">重置示例</button><button type="button" id="dashboardToolsReturn">返回内容</button></footer>';
    const body=dialog.querySelector('.preview-sheet-body');
    const session=document.querySelector('.session-card')?.closest('section.panel');
    if(session)body.append(session);
    const settings=document.querySelector('.misc-settings-panel');if(settings)body.append(settings);
    const updates=document.querySelector('.app-updates');if(updates)body.append(updates);
    const note=document.createElement('p');note.className='preview-isolation-note';note.textContent='独立示例战役；此处的保存、导入与结算只修改预览内存。';body.prepend(note);
    document.body.append(dialog);
    let contentScroll=0;
    trigger.addEventListener('click',()=>{contentScroll=scrollY;dialog.showModal();body.scrollTop=0;trigger.setAttribute('aria-expanded','true');const url=new URL(location.href);url.hash='tools';history.pushState({previewTools:true},'',url);});
    const close=()=>{if(dialog.open){dialog.close();if(history.state?.previewTools)history.back();}};
    document.getElementById('dashboardToolsClose').addEventListener('click',close);
    document.getElementById('dashboardToolsReturn').addEventListener('click',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    document.getElementById('logoutButton')?.addEventListener('click',close,true);
    dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientY<b.top||e.clientX<b.left||e.clientX>b.right)close();}});
    window.addEventListener('popstate',()=>{if(!history.state?.previewTools&&dialog.open)dialog.close();});
    dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');scrollTo(0,contentScroll);});
    document.getElementById('dashboardPreviewReset').addEventListener('click',()=>parent.postMessage({type:window.ATO_PREVIEW_CONFIG?.shared?'ato-preview:reset-all':'ato-preview:reset'},'*'));
    document.getElementById('cycleSelect').addEventListener('change',e=>parent.postMessage({type:'ato-preview:cycle',cycle:e.target.value},'*'));
    document.documentElement.dataset.fullDashboard='true';
    parent.postMessage({type:'ato-preview:ready'},'*');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
