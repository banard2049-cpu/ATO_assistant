/* Shared, in-memory campaign service used by the unmodified application clients. */
(() => {
  'use strict';
  const copy=value=>value==null?value:structuredClone(value),names=['dashboard','map','record','technology','heroes','aibp','story'];
  const user={id:'mobile-preview',username:'示例账号'};let authenticated=true;
  const cycles=Object.fromEntries([1,2,3,4,5].map(n=>[`c${n}`,{id:`c${n}`,state:{day:24,notes:'手机端独立示例战役。',completed:{},events:[],cardTracksVersion:2,cardTracks:{story:{position:1,progress:0},doom:{position:1,progress:0,doom:0},inwardOdyssey:{position:0,progress:0}},techAutomation:{version:1,events:{}}}}]));
  let campaign={version:1,updatedAt:new Date().toISOString(),sectionRevisions:Object.fromEntries(names.map(n=>[n,1])),sections:{
    dashboard:{activeProfileId:'default',profiles:{default:{id:'default',name:'示例战役',activeCycleId:'c1',termLanguage:'fan',cycles}}},
    record:{users:{default:{cycle:'c1',profileName:'示例战役',resources:{'c1-trireme':8,'c1-monument':4,'c1-armament':6},cycleStats:Object.fromEntries([1,2,3,4,5].map(n=>[`c${n}`,{fate:2,hull:6,crew:8}]))}}},
    map:{users:{default:{activeCycleId:'c1',mapZoom:300,cycles:Object.fromEntries([1,2,3,4,5].map(n=>[`c${n}`,{currentTile:'008',explored:{'007':true,'008':true,'009':true},previewRevealed:{},tokens:{markers:{},hsCount:1},tileNotes:{},tileSides:{}}]))}}},
    technology:{users:{default:{currentCycle:'cycle1',unlocked:['superior trading solutions','grand stoa','canal reconnaissance','mnestis thesis','titan training'],unimportant:[],conditions:[]}}},
    heroes:{heroes:['odys','circe','phenelope','telebac'].map((argonaut,i)=>({id:`preview-${argonaut}`,argonaut,customName:'',triskelion:{fury:1,fate:1,danger:i+1},skills:{},mnemos:[],fatedMnemos:[],notes:''})),activeHeroId:'preview-odys',graveyard:[]},aibp:null,story:null,
  }};
  const storage=new Map(),daily=new Map(),attachments=new Map(),audit=[];
  let second={enabled:false,mode:'map',displayScales:{map:100,battleBoard:100},battleRotation:0,battleSwapped:false,battleBoardVisible:true};
  const reply=(value,status=200)=>({status,body:JSON.stringify(value),headers:[['content-type','application/json']]}),ok=value=>reply({ok:true,user,...value});
  const error=(message,status=400,extra={})=>reply({ok:false,error:message,user,...extra},status);
  const dayOf=c=>{const p=c.sections.dashboard?.profiles?.[c.sections.dashboard.activeProfileId];return p?{profile:p.id,cycle:p.activeCycleId,day:p.cycles?.[p.activeCycleId]?.state?.day}:null;};
  function remember(c){const d=dayOf(c);if(d&&d.day!=null)daily.set(`${d.profile}:${d.cycle}:${d.day}`,copy(c));}
  remember(campaign);
  function write(name,value,profile){
    if(!names.includes(name))throw Error('Unknown section');
    if(name==='dashboard')remember(campaign);
    if(profile&&name!=='dashboard'){
      const old=campaign.sections[name];let bucket=old&&typeof old==='object'?old:{};
      if(bucket.users||bucket.accounts){bucket={...bucket,users:{...bucket.accounts,...bucket.users}};delete bucket.accounts;}
      else bucket={users:{[profile]:bucket}};
      bucket.users[profile]=copy(value);campaign.sections[name]=bucket;
    }else campaign.sections[name]=copy(value);
    campaign.sectionRevisions[name]++;campaign.updatedAt=new Date().toISOString();
    remember(campaign);
  }
  function revisionError(body){
    if(body.expectedAccountId&&body.expectedAccountId!==user.id)return error('登录账号已变更。',409,{code:'ACCOUNT_MISMATCH'});
    for(const [key,n]of Object.entries(body.expectedRevisions||{}))if(Number(n)!==campaign.sectionRevisions[key])return error('请重读当前示例存档。',409,{code:'SAVE_CONFLICT',section:key,revision:campaign.sectionRevisions[key]});
    const key=body.section;if(key&&body.expectedRevision!=null&&Number(body.expectedRevision)!==campaign.sectionRevisions[key])return error('请重读当前示例存档。',409,{code:'SAVE_CONFLICT',section:key,revision:campaign.sectionRevisions[key]});
    return null;
  }
  function appendNotes(payload){
    const notes=payload.campaignNotes;if(!notes?.entries?.length)return;
    const profile=campaign.sections.dashboard?.profiles?.[notes.profileId];if(!profile)return;
    for(const entry of notes.entries){
      const state=profile.cycles?.[entry.cycleId]?.state;if(!state||!entry.text)continue;
      const dayLabel=Number.isFinite(Number(state.day))?' 第'+state.day+'天':'';
      const line=`[${new Date().toISOString().replace(/\.\d{3}Z$/,'Z')} ${entry.cycleId.toUpperCase()}${dayLabel} · ${entry.source}] ${entry.text.replace(/[\r\n]+/g,' ')}`;
      state.notes=(typeof state.notes==='string'?state.notes:'')+(state.notes&&!state.notes.endsWith('\n')?'\n':'')+line;
    }
    campaign.sectionRevisions.dashboard++;
  }
  async function attachment(url,method,body){
    if(method==='GET'){const dataUrl=attachments.get(url.searchParams.get('id'));return dataUrl?ok({dataUrl}):error('图片附件不存在。',404);}
    const dataUrl=body.dataUrl;if(typeof dataUrl!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl))return error('图片格式无效。');
    const raw=Uint8Array.from(atob(dataUrl.split(',')[1]),x=>x.charCodeAt(0));
    const blobId=await window.ATO_PREVIEW_SHA256(raw);
    const image=await createImageBitmap(new Blob([raw],{type:dataUrl.slice(5,dataUrl.indexOf(';'))}));
    const info={blobId,bytes:raw.length,width:image.width,height:image.height,mime:dataUrl.slice(5,dataUrl.indexOf(';'))};image.close();attachments.set(blobId,dataUrl);return ok({attachment:info});
  }
  async function campaignApi(url,method,body){
    const action=url.searchParams.get('action')||'',section=body.section||url.searchParams.get('section');
    if(action==='me')return ok({authenticated});
    if(action==='login'||action==='register'){authenticated=true;if(body.username)user.username=body.username;return ok({authenticated:true});}
    if(action==='logout'){authenticated=false;return ok({});}
    if(!authenticated)return error('请先登录主控台。',401,{code:'AUTH_REQUIRED'});
    if(action==='record-attachment')return attachment(url,method,body);
    if(action==='second-screen-status'||action==='second-screen-mode'){
      if(method==='POST'){const scales={...second.displayScales,...body.displayScales};Object.assign(second,body);second.displayScales=scales;}
      return ok({...second,urls:second.enabled?[new URL('../../ss/?preview=1',document.baseURI).href]:[]});
    }
    if(action==='second-screen'){
      const d=dayOf(campaign),m=campaign.sections.map?.users?.[d?.profile]||{};
      return ok({screen:{...second,cycleId:d?.cycle,profileId:d?.profile,map:m,mapDisplay:m,mapRevision:campaign.sectionRevisions.map,dashboardRevision:campaign.sectionRevisions.dashboard,aibp:campaign.sections.aibp,story:campaign.sections.story},token:'preview'});
    }
    if(action==='restore-previous-day'){
      const saved=daily.get(`${body.profileId}:${body.cycleId}:${body.day}`);const revisions=copy(campaign.sectionRevisions);
      if(saved)campaign=copy(saved);else campaign.sections.dashboard.profiles[body.profileId].cycles[body.cycleId].state.day=body.day;
      for(const name of names)campaign.sectionRevisions[name]=revisions[name]+1;
      return ok({campaign:copy(campaign)});
    }
    if(method==='GET')return section?ok({exists:campaign.sections[section]!=null,section,state:copy(campaign.sections[section]),revision:campaign.sectionRevisions[section],updatedAt:campaign.updatedAt}):ok({exists:true,campaign:copy(campaign)});
    const conflict=revisionError({...body,section:action==='import-sections'?null:section});if(conflict)return conflict;
    if(action==='import-sections'){
      const applied={};for(const [name,value]of Object.entries(body.sections||{})){write(name,value,body.userId);applied[name]=campaign.sectionRevisions[name];}
      return ok({sections:applied,campaign:copy(campaign)});
    }
    if(section){appendNotes({...body,section});write(section,body.state,body.userId);return ok({section,revision:campaign.sectionRevisions[section],updatedAt:campaign.updatedAt});}
    return error('请求中缺少存档分区。');
  }
  async function handle(url,method='GET',body={}){
    audit.push({path:url.pathname,method,action:url.searchParams.get('action'),section:url.searchParams.get('section')||body.section});
    if(url.pathname.endsWith('/campaign-state.php'))return campaignApi(url,method,body);
    if(url.pathname.endsWith('/briefing/backups.php'))return window.ATO_PREVIEW_BACKUPS.handle(url,method,body,{daily,user:authenticated?user:null,copy});
    if(url.pathname.endsWith('/briefing/api.php')){
      if(!authenticated)return error('请先登录主控台。',401,{code:'AUTH_REQUIRED'});
      const profileId=url.searchParams.get('profile')||campaign.sections.dashboard.activeProfileId,cycleId=url.searchParams.get('cycle')||campaign.sections.dashboard.profiles[profileId]?.activeCycleId||'c1';
      remember(campaign);
      const snapshots=[...daily.values()].filter(c=>{const d=dayOf(c);return d?.profile===profileId&&d?.cycle===cycleId;});
      const label=id=>({c1:'循环 I',c2:'循环 II',c3:'循环 III',c4:'循环 IV',c5:'循环 V'}[id]||id);
      return ok({source:'daily-backups',profileId,cycleId,snapshotFormat:'campaign',snapshots,nextCursor:null,cycles:Object.values(campaign.sections.dashboard.profiles).flatMap(p=>Object.keys(p.cycles).map(c=>({profileId:p.id,profileName:p.name,cycleId:c,label:label(c),day:String(p.cycles[c].state?.day??'')}))),cycle:{profileId,cycleId,label:label(cycleId)}});
    }
    if(url.pathname.endsWith('/app-update.php'))return ok({supported:false,canRollback:false,reason:'手机预览不执行程序安装。'});
    if(url.hostname==='api.github.com')return reply({tag_name:'3.8.6-rc.1',draft:false,prerelease:false,body:'独立手机预览。'});
    return null;
  }
  window.ATO_PREVIEW_STORE={handle,storage,audit,get campaign(){return campaign;},get authenticated(){return authenticated;},get second(){return second;},snapshot:()=>({campaign:copy(campaign),authenticated,second:copy(second),storage:[...storage]}),reset(){location.reload();}};
})();
