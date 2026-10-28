(() => {
  'use strict';
  const pages = [
    ['dashboard','主控台','完整复用原主控台。探索抽牌、考察定数、科技能力及故事／灾祸进度全部保留，设置仅移入工具面板。'],
    ['record','阿尔戈号','循环和保存状态留在页头，资源就地编辑，管理操作与分区定位收进工具。'],
    ['hero','英雄','一行定位英雄，保留熟悉的记录结构；添加、排序与墓园按需打开。'],
    ['aibp','始徒','侧栏收起，先看始徒与卡牌；抽牌和结算留在内容旁，其余操作按需打开。'],
    ['technology','科技','科技与装备视图只占一行。树图直接展开，搜索、筛选和资源明细按需打开。'],
    ['map','地图','让地图占满剩余区域。搜索揭示、图层、标记与管理功能统一收进面板。'],
    ['story','故事书','正文不再排在整块侧栏之后。目录、搜索、书签和密语按需打开。'],
    ['briefing','战役简报','保留紧凑的日期与播放操作，把统计、导出和备份迁移收起来。']
  ];
  const nav=document.getElementById('pageNav'),frame=document.getElementById('phoneFrame');
  let current='',awaitedPage='',width=390,height=844;
  nav.innerHTML=pages.map(([id,label],i)=>`<button type="button" data-page="${id}"><span class="nav-number">0${i+1}</span><span class="nav-label">${window.MobilePreviewIdentity[id].heading}</span><span class="nav-arrow">↗</span></button>`).join('');
  function choose(id,fromFrame=false){
    const page=pages.find(p=>p[0]===id)||pages[0];
    current=page[0];
    nav.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.page===current);b.setAttribute('aria-current',b.dataset.page===current?'page':'false');});
    document.getElementById('currentTitle').textContent=window.MobilePreviewIdentity[page[0]].heading;
    document.getElementById('pageDescription').textContent=page[2];
    document.getElementById('openScreen').href=`screen.html?page=${current}`;
    history.replaceState(null,'',`#${current}`);
    if(!fromFrame){awaitedPage=current;frame.contentWindow.postMessage({type:'mobile-preview:navigate',page:current},location.origin==='null'?'*':location.origin);}
  }
  function size(){
    const stage=document.getElementById('previewStage');
    const narrow=innerWidth<=720||(innerWidth<=960&&innerHeight<=500);
    const availableWidth=stage.clientWidth-(innerWidth>1100?255:0)-24;
    const availableHeight=Math.max(280,innerHeight-stage.getBoundingClientRect().top-50);
    const scale=narrow?1:Math.min(1,availableWidth/(width+14),availableHeight/(height+14));
    const box=document.getElementById('deviceFrame'),wrap=document.getElementById('deviceWrap');
    box.style.width=`${width+14}px`;box.style.height=`${height+14}px`;box.style.transform=`scale(${scale})`;
    wrap.style.width=`${(width+14)*scale}px`;wrap.style.height=`${(height+14)*scale}px`;
  }
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)choose(b.dataset.page);});
  document.getElementById('deviceSize').addEventListener('change',e=>{[width,height]=e.target.value.split(',').map(Number);size();});
  document.getElementById('rotateDevice').addEventListener('click',()=>{[width,height]=[height,width];size();});
  document.getElementById('resetPreview').addEventListener('click',()=>frame.contentWindow.postMessage({type:'mobile-preview:reset'},location.origin==='null'?'*':location.origin));
  window.addEventListener('message',e=>{if(e.source!==frame.contentWindow)return;if(location.origin!=='null'&&e.origin!==location.origin)return;if(e.data?.type==='mobile-preview:page'){if(awaitedPage&&e.data.page!==awaitedPage)return;awaitedPage='';choose(e.data.page,true);}});
  window.addEventListener('resize',size);
  frame.addEventListener('load',()=>choose(current||location.hash.slice(1)||'dashboard'));
  choose(location.hash.slice(1)||'dashboard');size();
})();
