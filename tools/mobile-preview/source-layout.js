/* Shared layout primitives. Existing business nodes are moved, never recreated. */
(() => {
  'use strict';
  const sheets=[];
  window.ATO_PREVIEW_LAYOUT={createTools({title,triggerParent,nodes=[]}){
    const dialog=document.createElement('dialog');dialog.className='source-tools';dialog.innerHTML='<div class="source-sheet-handle" aria-hidden="true"></div><header class="source-sheet-head"><h2></h2><button type="button" aria-label="关闭工具">×</button></header><div class="source-sheet-body"></div><footer class="source-sheet-foot"><button type="button" data-preview-reset>重置示例</button><button type="button" data-preview-return>返回内容</button></footer>';
    dialog.querySelector('h2').textContent=title;const body=dialog.querySelector('.source-sheet-body');nodes.filter(Boolean).forEach(n=>body.append(n));document.body.append(dialog);
    const trigger=document.createElement('button');trigger.type='button';trigger.className='source-tools-trigger';trigger.textContent='工具';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');triggerParent.append(trigger);
    const key='source-tools-'+sheets.length;dialog.id=key;trigger.setAttribute('aria-controls',key);sheets.push(dialog);let scroll=0;
    trigger.addEventListener('click',()=>{scroll=scrollY;dialog.showModal();body.scrollTop=0;trigger.setAttribute('aria-expanded','true');const u=new URL(location.href);u.hash=key;history.pushState({previewSheet:key},'',u);});
    const close=()=>{
      if(!dialog.open)return Promise.resolve();
      const ownsEntry=history.state?.previewSheet===key;
      const settled=new Promise(resolve=>{
        const finish=()=>requestAnimationFrame(()=>requestAnimationFrame(resolve));
        if(ownsEntry)window.addEventListener('popstate',finish,{once:true});else dialog.addEventListener('close',finish,{once:true});
      });
      dialog.close();if(ownsEntry)history.back();return settled;
    };dialog.querySelector('.source-sheet-head button').addEventListener('click',close);dialog.querySelector('[data-preview-return]').addEventListener('click',close);
    dialog.querySelector('[data-preview-reset]').addEventListener('click',()=>parent.postMessage({type:'ato-preview:reset-all'},'*'));
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right))close();});
    dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');scrollTo(0,scroll);});
    window.addEventListener('popstate',()=>{if(history.state?.previewSheet!==key&&dialog.open)dialog.close();});
    return {dialog,body,trigger,close};
  }};
  window.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.sourcePage=window.ATO_PREVIEW_PAGE;parent.postMessage({type:'ato-preview:ready',page:window.ATO_PREVIEW_PAGE},'*');},{once:true});
})();
