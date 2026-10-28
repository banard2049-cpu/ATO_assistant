/* Eight complete application pages, one shared isolated campaign, no display mocks. */
(() => {
  'use strict';
  const root=new URL('../../',document.baseURI),here=new URL('./',document.baseURI);
  const definitions=window.MobilePreviewIdentity,order=Object.keys(definitions),frames=new Map(),sources=new Map(),resources=new Map();
  let active='',closed=new Set(),resetCounter=0,mapTags=null;
  const sockets=new Map(),networkRequests=new Map();
  const store=window.ATO_PREVIEW_STORE;
  const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c');
  const send=(entry,data)=>entry.frame.contentWindow?.postMessage(data,'*');
  const publicPath=url=>{
    if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return false;
    const p=decodeURIComponent(url.pathname.slice(root.pathname.length));
    return !p.split('/').some(x=>x==='..'||x.startsWith('.'))&&!/\.config\./i.test(p)&&/^(assets|technology|map|record|hero|aibp|story|briefing|ss|tools)\//.test(p)&&/\.(?:js|json|css|svg|png|jpe?g|webp|mp3|ogg|wav|html|woff2?|ttf)$/i.test(p);
  };
  async function read(url,method='GET'){
    if(!publicPath(url))throw Error('预览只能读取应用素材和源码。');
    if(mapTags&&url.pathname===new URL('map/map-tile-tags.js',root).pathname)return {status:200,headers:[['content-type','application/javascript']],body:'window.ATO_MAP_TILE_TAGS='+safe(mapTags)+';'};
    const key=method+':'+url.href;
    if(!resources.has(key))resources.set(key,fetch(url,{method,credentials:'omit'}).then(async r=>({status:r.status,headers:[...r.headers],body:await r.arrayBuffer()})));
    return resources.get(key);
  }
  function paths(id){return id==='dashboard'?['dashboard-layout.js','dashboard-mobile.css']:['source-'+(id==='record'||id==='hero'?'record-hero':id==='technology'||id==='briefing'?'technology-briefing':'play')+'.js','source-'+(id==='record'||id==='hero'?'record-hero':id==='technology'||id==='briefing'?'technology-briefing':'play')+'.css'];}
  async function documentSource(entry){
    const sourceUrl=entry.url;
    if(!sources.has(sourceUrl.pathname))sources.set(sourceUrl.pathname,fetch(sourceUrl,{credentials:'omit',cache:'no-store'}).then(r=>{if(!r.ok)throw Error('无法读取原页面：'+sourceUrl.pathname);return r.text();}));
    const source=await sources.get(sourceUrl.pathname),base=new URL('./',sourceUrl),[script,style]=paths(entry.id);
    const policy=`default-src 'none'; script-src ${root.origin} 'unsafe-inline'; style-src ${root.origin} 'unsafe-inline'; img-src ${root.origin} data: blob:; media-src ${root.origin} data: blob:; font-src ${root.origin} data:; connect-src 'none'; frame-src ${root.origin} blob:; worker-src 'none'; form-action 'none'; base-uri ${root.origin}`;
    const config={shared:true,page:entry.id,root:root.href,sourceUrl:sourceUrl.href};
    const prelude=`<base href="${base.href}"><meta http-equiv="Content-Security-Policy" content="${policy}"><script>window.ATO_PREVIEW_CONFIG=${safe(config)};window.ATO_PREVIEW_PAGE=${safe(entry.id)};window.ATO_PREVIEW_SEED=${safe(store.snapshot())};<\/script><script src="${new URL('source-runtime.js',here)}"><\/script>`;
    return source.replace(/<head\b[^>]*>/i,m=>m+prelude).replace(/<\/head>/i,`<link rel="stylesheet" href="${new URL('source-common.css',here)}"><link rel="stylesheet" href="${new URL(style,here)}"></head>`).replace(/<\/body>/i,`<script src="${new URL('source-layout.js',here)}"><\/script><script src="${new URL(script,here)}"><\/script></body>`);
  }
  function renderTabs(){
    const nav=document.getElementById('nativeTabList');nav.replaceChildren();
    for(const id of order){if(closed.has(id))continue;const tab=document.createElement('div');tab.className='native-tab'+(active===id?' active':'');const label=document.createElement('button');label.type='button';label.className='tab-label';label.dataset.page=id;label.textContent=definitions[id].documentTitle;label.title=definitions[id].documentTitle;label.addEventListener('click',()=>navigate(id));const close=document.createElement('button');close.type='button';close.className='tab-close';close.textContent='×';close.setAttribute('aria-label','关闭'+definitions[id].documentTitle);close.addEventListener('click',()=>{closed.add(id);if(closed.size===order.length)closed.delete('dashboard');if(active===id)navigate(order.find(p=>!closed.has(p)));else renderTabs();});tab.append(label,close);nav.append(tab);}
    const tab=nav.querySelector('.active');if(tab)nav.scrollLeft=Math.max(0,tab.offsetLeft-4);
  }
  function navigate(id,url=null){
    if(!definitions[id])return;
    if(active&&active!==id)send(frames.get(active),{type:'ato-preview:pause'});
    active=id;closed.delete(id);
    let entry=frames.get(id);
    const nextUrl=url?new URL(url,root):new URL(definitions[id].source,root);
    if(!entry){const frame=document.createElement('iframe');frame.id=`sourceFrame-${id}`;frame.name='ato-source-'+id;frame.className='source-frame';frame.title=definitions[id].documentTitle;frame.setAttribute('sandbox','allow-same-origin allow-scripts allow-forms allow-modals allow-downloads allow-pointer-lock');frame.setAttribute('allow','fullscreen');entry={id,url:nextUrl,frame,ready:false};frames.set(id,entry);frame.src=new URL('source-frame.html?page='+id,here).href;document.getElementById('sourceFrames').append(frame);}
    else if(url&&entry.url.href!==nextUrl.href||!url&&entry.url.pathname!==nextUrl.pathname){entry.url=nextUrl;entry.ready=false;entry.frame.src=new URL('source-frame.html?page='+id+'&reload='+(++resetCounter),here).href;}
    for(const [key,value]of frames)value.frame.hidden=key!==id;
    if(entry.ready)send(entry,{type:'ato-preview:resume'});
    document.body.dataset.page=id;document.title=definitions[id].documentTitle;
    history.replaceState({page:id},'',`?page=${id}`);renderTabs();
    parent.postMessage({type:'mobile-preview:page',page:id},location.origin==='null'?'*':location.origin);
  }
  const findEntry=source=>[...frames.values()].find(entry=>entry.frame.contentWindow===source);
  window.addEventListener('message',async event=>{
    if(event.source===parent&&parent!==window&&event.origin===location.origin){if(event.data?.type==='mobile-preview:navigate')navigate(event.data.page);else if(event.data?.type==='mobile-preview:reset')location.reload();return;}
    const entry=findEntry(event.source);if(!entry||event.origin!==location.origin)return;const data=event.data||{};
    try{
      if(data.type==='ato-preview:boot'){for(const [key,s]of sockets)if(key.startsWith(entry.id+':')){s.close();sockets.delete(key);}send(entry,{type:'ato-preview:document',html:await documentSource(entry)});}
      else if(data.type==='ato-preview:reload'){entry.ready=false;entry.frame.src=new URL('source-frame.html?page='+entry.id+'&reload='+(++resetCounter),here).href;}
      else if(data.type==='ato-preview:static')send(entry,{type:'ato-preview:static-result',id:data.id,...await read(new URL(data.url,root),data.method==='HEAD'?'HEAD':'GET')});
      else if(data.type==='ato-preview:business'){
        const url=new URL(data.url,root);let response;
        // This endpoint only enumerates public image filenames. It does not
        // load a session or read/write campaign data (see the original source).
        if(url.origin===root.origin&&url.pathname===new URL('api/aibp-image-index.php',root).pathname&&data.method==='GET'){
          const r=await fetch(url,{credentials:'omit'});response={status:r.status,headers:[...r.headers],body:await r.text()};
        }else if(url.origin===root.origin&&url.pathname===new URL('api/map-tile-tags.php',root).pathname){
          if(!mapTags){const raw=await(await fetch(new URL('map/map-tile-tags.js',root),{credentials:'omit'})).text();const match=raw.match(/window\.ATO_MAP_TILE_TAGS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);if(!match)throw Error('地图标签数据格式无效');mapTags=JSON.parse(match[1]);}
          const revision=Number(mapTags.revision||0),body=data.body||{};
          if(data.method==='POST'&&body.expectedRevision!=null&&Number(body.expectedRevision)!==revision)response={status:409,body:JSON.stringify({ok:false,code:'SAVE_CONFLICT',revision}),headers:[['content-type','application/json']]};
          else {if(data.method==='POST')mapTags={...mapTags,...body.data,revision:revision+1,updatedAt:new Date().toISOString()};response={status:200,body:JSON.stringify({ok:true,data:mapTags,revision:mapTags.revision||0,updatedAt:mapTags.updatedAt}),headers:[['content-type','application/json']]};}
        }else if(url.origin!==root.origin&&url.hostname!=='api.github.com'){
          // Original TTS engines remain usable when the user supplies their
          // configuration. No credentials from the real app are inherited.
          const controller=new AbortController(),key=entry.id+':'+data.id;networkRequests.set(key,controller);
          try{let body=data.rawBody;if(data.form){body=new FormData();for(const [k,v]of data.form)body.append(k,v);}const r=await fetch(url,{method:data.method,headers:data.headers,body:['GET','HEAD'].includes(data.method)?undefined:body,credentials:'omit',signal:controller.signal});response={status:r.status,headers:[...r.headers],body:await r.arrayBuffer()};}finally{networkRequests.delete(key);}
        }else response=await store.handle(url,data.method,data.body);
        if(response===null)throw Error('预览数据适配尚不支持该服务：'+url.pathname);
        send(entry,{type:'ato-preview:static-result',id:data.id,...response});
      }else if(data.type==='ato-preview:storage'){
        if(data.operation==='clear')store.storage.clear();else if(data.operation==='remove')store.storage.delete(data.key);else store.storage.set(data.key,data.value);
        for(const peer of frames.values())if(peer!==entry)send(peer,{...data,type:'ato-preview:storage-event'});
      }else if(data.type==='ato-preview:channel'){
        for(const peer of frames.values())if(peer!==entry)send(peer,{...data,type:'ato-preview:channel-event'});
      }else if(data.type==='ato-preview:cancel-request')networkRequests.get(entry.id+':'+data.id)?.abort();
      else if(data.type==='ato-preview:socket-open'){
        const key=entry.id+':'+data.id,socket=new WebSocket(data.url,data.protocols||[]);sockets.set(key,socket);socket.binaryType=data.binaryType||'blob';
        for(const type of ['open','message','error','close'])socket.addEventListener(type,event=>{send(entry,{type:'ato-preview:socket-event',id:data.id,event:type,data:event.data,code:event.code,reason:event.reason,wasClean:event.wasClean});if(type==='close')sockets.delete(key);});
      }else if(data.type==='ato-preview:socket-send')sockets.get(entry.id+':'+data.id)?.send(data.data);
      else if(data.type==='ato-preview:socket-close')sockets.get(entry.id+':'+data.id)?.close(data.code||1000,data.reason||'');
      else if(data.type==='ato-preview:socket-binary'){
        const s=sockets.get(entry.id+':'+data.id);if(s)s.binaryType=data.value;
      }else if(data.type==='ato-preview:navigate'){
        const url=new URL(data.url,entry.url);if(url.origin!==root.origin)return;
        const path=url.pathname.slice(root.pathname.length),id=order.find(id=>path===definitions[id].source||path===definitions[id].source.replace(/index\.html$/,''));
        if(id)navigate(id,url.href);else if(path==='')navigate('dashboard');else showAuxiliary(url,entry);
      }else if(data.type==='ato-preview:reset'||data.type==='ato-preview:reset-all')location.reload();
      else if(data.type==='ato-preview:ready')entry.ready=true;
    }catch(error){if(data.id)send(entry,{type:'ato-preview:static-result',id:data.id,error:error.message});else console.error(error);}
  });
  function showAuxiliary(url,entry){
    // Internal linked tools retain their original source and are opened inside
    // the same sandbox, rather than escape to a real campaign session.
    if(!publicPath(url)||!url.pathname.endsWith('.html'))return;
    entry.url=url;entry.ready=false;entry.frame.src=new URL('source-frame.html?page='+entry.id+'&tool='+(++resetCounter),here).href;
  }
  document.getElementById('nativeAdd').addEventListener('click',()=>{const dlg=document.getElementById('moduleDialog'),list=dlg.querySelector('.module-choices');list.replaceChildren();for(const id of order){const b=document.createElement('button');b.type='button';b.className='button';b.textContent=definitions[id].heading;b.addEventListener('click',()=>{dlg.close();navigate(id);});list.append(b);}dlg.showModal();});
  document.getElementById('moduleClose').addEventListener('click',()=>document.getElementById('moduleDialog').close());
  window.ATO_PREVIEW_HOST={frames,navigate,store};
  const selected=new URLSearchParams(location.search).get('page');navigate(definitions[selected]?selected:'dashboard');
})();
