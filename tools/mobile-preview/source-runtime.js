/* Loaded before the original application. Business APIs and browser storage
 * operate on preview memory. CSP blocks direct network API connections.
 * The source origin is retained so Navigation API can cancel scripted loads. */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const seed=window.ATO_PREVIEW_SEED;let relayStorage=()=>{},relayChannel=()=>{};
  let applyingStorage=false;
  const root = new URL(document.baseURI);
  const pending = new Map(); let requestId=0;
  const memoryStorage = () => {
    const items=new Map();
    return {getItem:k=>items.get(String(k))??null,setItem(k,v){items.set(String(k),String(v));if(!applyingStorage)relayStorage('set',String(k),String(v));},removeItem(k){items.delete(String(k));if(!applyingStorage)relayStorage('remove',String(k),null);},clear(){items.clear();if(!applyingStorage)relayStorage('clear',null,null);},key:i=>[...items.keys()][i]??null,get length(){return items.size;}};
  };
  Object.defineProperty(window,'localStorage',{value:memoryStorage(),configurable:false});
  Object.defineProperty(window,'sessionStorage',{value:memoryStorage(),configurable:false});
  for(const [key,value]of seed?.storage||[])localStorage.setItem(key,value);
  // The original BGM importer uses IndexedDB. Preserve its full UI with a
  // document-local implementation rather than access any real browser database.
  const databases=new Map();
  const request=work=>{const result={};setTimeout(()=>{try{result.result=work();result.onsuccess?.({target:result});}catch(error){result.error=error;result.onerror?.({target:result});}},0);return result;};
  Object.defineProperty(window,'indexedDB',{value:{open(name){
    const result={};setTimeout(()=>{
      const fresh=!databases.has(name);const stores=databases.get(name)||new Map();databases.set(name,stores);
      result.result={objectStoreNames:{contains:key=>stores.has(key)},createObjectStore(key,options={}){stores.set(key,{keyPath:options.keyPath||'id',rows:new Map()});},transaction(key){const store=stores.get(key);if(!store)throw Error('Unknown preview store');return {objectStore(){return {getAll:()=>request(()=>[...store.rows.values()].map(v=>structuredClone(v))),get:id=>request(()=>structuredClone(store.rows.get(id))),put:value=>request(()=>{store.rows.set(value[store.keyPath],structuredClone(value));return value[store.keyPath];}),delete:id=>request(()=>store.rows.delete(id))};}};},close(){}};
      if(fresh)result.onupgradeneeded?.({target:result});result.onsuccess?.({target:result});
    },0);return result;
  }},configurable:false});
  const channels = new Map();
  class PreviewChannel extends EventTarget {
    constructor(name){super();this.name=name;const peers=channels.get(name)||new Set();peers.add(this);channels.set(name,peers);}
    postMessage(data){for(const peer of channels.get(this.name)||[])if(peer!==this)queueMicrotask(()=>peer.dispatchEvent(new MessageEvent('message',{data:clone(data)})));relayChannel(this.name,data);}
    close(){channels.get(this.name)?.delete(this);}
  }
  Object.defineProperty(window,'BroadcastChannel',{value:PreviewChannel});
  Object.defineProperty(window,'ATO_ANDROID_SINGLE_WINDOW',{value:true});
  function staticRequest(url,method){return new Promise((resolve,reject)=>{const id=++requestId;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('预览素材读取超时'));},15000);pending.set(id,{resolve,reject,timeout});parent.postMessage({type:'ato-preview:static',id,url:url.href,method},'*');});}
  window.addEventListener('message',event=>{
    if(event.source!==parent)return;const data=event.data||{};
    if(data.type==='ato-preview:static-result'){
      const item=pending.get(data.id);if(!item)return;pending.delete(data.id);clearTimeout(item.timeout);
      if(data.error)item.reject(new Error(data.error));else item.resolve(new Response(typeof data.body==='string'?data.body:data.body?.byteLength?data.body:null,{status:data.status,headers:data.headers}));
    }else if(data.type==='ato-preview:pause')window.ATO_BGM?.stop?.();
    else if(data.type==='ato-preview:resume'){window.dispatchEvent(new Event('focus'));window.ATO_BGM?.resume?.();}
    else if(data.type==='ato-preview:storage-event'){
      const oldValue=data.key?localStorage.getItem(data.key):null;applyingStorage=true;
      if(data.operation==='clear')localStorage.clear();else if(data.operation==='remove')localStorage.removeItem(data.key);else localStorage.setItem(data.key,data.value);
      applyingStorage=false;window.dispatchEvent(new StorageEvent('storage',{key:data.key,oldValue,newValue:data.value,url:document.baseURI}));
    }else if(data.type==='ato-preview:channel-event'){
      for(const peer of channels.get(data.channel)||[]){const e=new MessageEvent('message',{data:structuredClone(data.data)});peer.dispatchEvent(e);peer.onmessage?.(e);}
    }
    else if(data.type==='ato-preview:notice')window.alert(data.message);
  });
    relayStorage=(operation,key,value)=>parent.postMessage({type:'ato-preview:storage',operation,key,value},'*');
    relayChannel=(channel,data)=>parent.postMessage({type:'ato-preview:channel',channel,data:structuredClone(data)},'*');
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,root);
      const method=(init.method||input?.method||'GET').toUpperCase();
      if(url.pathname.endsWith('.php')||!url.href.startsWith(window.ATO_PREVIEW_CONFIG.root)){
        let body={};if(typeof init.body==='string')try{body=JSON.parse(init.body);}catch{body={text:init.body};}
        else if(init.body instanceof ArrayBuffer)body={bytes:init.body};
        else if(init.body instanceof Blob)body={bytes:await init.body.arrayBuffer()};
        else if(input instanceof Request&&method!=='GET')try{body=await input.clone().json();}catch{}
        if(init.signal?.aborted)throw new DOMException('The operation was aborted.','AbortError');
        const rawBody=init.body instanceof URLSearchParams?init.body.toString():init.body;
        const form=rawBody instanceof FormData?[...rawBody.entries()]:null;
        return new Promise((resolve,reject)=>{const id=++requestId;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('预览数据请求超时'));},120000);pending.set(id,{resolve,reject,timeout});init.signal?.addEventListener('abort',()=>{clearTimeout(timeout);pending.delete(id);parent.postMessage({type:'ato-preview:cancel-request',id},'*');reject(new DOMException('The operation was aborted.','AbortError'));},{once:true});parent.postMessage({type:'ato-preview:business',id,url:url.href,method,body,headers:[...new Headers(init.headers||input?.headers||{})],rawBody:form?undefined:rawBody,form},'*');});
      }
      return staticRequest(url,method);
    };
    if(window.navigation)window.navigation.addEventListener('navigate',event=>{
      const url=new URL(event.destination.url);
      // Original code must see its real module URL for deep links, images and
      // relative navigation. Reloads still return through the sandbox loader.
      if(url.pathname.endsWith('/tools/mobile-preview/source-frame.html'))return;
      if(event.destination.sameDocument)return;
      if(event.cancelable){event.preventDefault();parent.postMessage({type:event.navigationType==='reload'?'ato-preview:reload':'ato-preview:navigate',url:url.href},'*');}
    });
    if(!window.navigation)throw Error('完整隔离预览需要支持 Navigation API 的 Chromium 浏览器。');
    history.replaceState({previewSource:true},'',window.ATO_PREVIEW_CONFIG.sourceUrl);
  window.XMLHttpRequest=class {constructor(){throw new Error('预览仅支持隔离的 fetch 适配器。');}};
  const previewSockets=new Map();
  window.WebSocket=class extends EventTarget {
    static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
    constructor(url,protocols=[]){super();this.id=++requestId;this.url=String(url);this.readyState=0;this._binaryType='blob';previewSockets.set(this.id,this);parent.postMessage({type:'ato-preview:socket-open',id:this.id,url:this.url,protocols},'*');}
    get binaryType(){return this._binaryType;}set binaryType(value){this._binaryType=value;parent.postMessage({type:'ato-preview:socket-binary',id:this.id,value},'*');}
    send(data){if(this.readyState!==1)throw new DOMException('WebSocket is not open','InvalidStateError');parent.postMessage({type:'ato-preview:socket-send',id:this.id,data},'*');}
    close(code=1000,reason=''){this.readyState=2;parent.postMessage({type:'ato-preview:socket-close',id:this.id,code,reason},'*');}
  };
  window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='ato-preview:socket-event')return;const data=event.data,socket=previewSockets.get(data.id);if(!socket)return;let e;if(data.event==='message')e=new MessageEvent('message',{data:data.data});else if(data.event==='close'){socket.readyState=3;e=new CloseEvent('close',{code:data.code,reason:data.reason,wasClean:data.wasClean});previewSockets.delete(data.id);}else {if(data.event==='open')socket.readyState=1;e=new Event(data.event);}socket.dispatchEvent(e);socket['on'+data.event]?.(e);});
  navigator.sendBeacon=()=>false;
  document.addEventListener('click',event=>{
    const anchor=event.target.closest?.('a[href]');if(!anchor)return;
    const url=new URL(anchor.href,root);
    if(url.protocol==='blob:'||url.protocol==='data:')return;
    if(anchor.hasAttribute('download')){
      if(url.pathname.endsWith('.php')){
        event.preventDefault();event.stopImmediatePropagation();
        window.fetch(url.href).then(r=>{if(!r.ok)throw Error('下载失败');return r.blob();}).then(blob=>{const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=anchor.download;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}).catch(e=>window.alert(e.message));
      }
      return;
    }
    if(url.hash&&url.pathname===location.pathname)return;
    event.preventDefault();event.stopImmediatePropagation();parent.postMessage({type:'ato-preview:navigate',url:url.href},'*');
  },true);
  window.open=url=>{parent.postMessage({type:'ato-preview:navigate',url:new URL(url,root).href},'*');return null;};
})();
