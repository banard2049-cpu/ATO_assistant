const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const root = path.join(__dirname, '..');
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const noop = () => {};
const isPlainObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
const response = (status, payload) => ({ok: status === 200, status, json: async()=>clone(payload)});
function extract(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const match = source.match(new RegExp('^( *)(?:async )?function ' + name + '\\([^]*?^\\1}', 'm'));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
}
function session(owner = 'login-A') {
  const scope = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/campaign-session.js'), 'utf8'), scope);
  const guard = scope.window.ATO_CAMPAIGN_SESSION.create();
  if (owner) guard.accept({user:{id:owner}});
  return guard;
}
function context(file, names, vars) {
  const c = vm.createContext({console:{warn:noop}, ...vars});
  vm.runInContext(names.map(name=>extract(file,name)).join('\n'), c);
  return c;
}
function mapContext(extra={}) {
  return context('map/app.js', ['deepEqualValue','mergeValues','mergeMapStates','saveCampaignMapSection','applyServerMapState','pickServerMapState','loadCampaignMapSectionState'], {
    cloneValue:clone,isPlainObject,normalizeState:clone,setCampaignSaveStatus:noop,noteMapMergeConflict:noop,
    scheduleReconnectAttempt:noop,campaignSession:session(),campaignStorageAvailable:true,campaignSaveInFlight:false,
    campaignSavePending:false,campaignSaveQueuedBeforeReady:false,campaignReconnectDelay:2000,mapSaveConflict:false,
    campaignStorageUrl:'/api',mapStateProfileId:'A',mapStateLoadedFromServer:true,mapSectionRevision:1,
    mapStateBaseline:{position:0,hideUnknown:true},state:{position:1,hideUnknown:true},
    focusArgoAfterNextRender:noop,render:noop,...extra,
  });
}
test('session guard rejects a changed login on reads, errors and subsequent writes', ()=>{
  for (const payload of [{user:{id:'login-B'}},{code:'ACCOUNT_MISMATCH'}]) {
    const guard=session();
    assert.throws(()=>guard.accept(payload), e=>e.code==='ACCOUNT_MISMATCH');
    assert.equal(guard.changed,true);
    assert.throws(()=>guard.accountId, e=>e.code==='ACCOUNT_MISMATCH');
    assert.throws(()=>guard.accept({user:{id:'login-A'}}));
  }
});
test('session logout broadcast invalidates old page', ()=>{
  let onMessage;
  const scope={window:{},BroadcastChannel:class {addEventListener(name,fn){onMessage=fn;}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/campaign-session.js'),'utf8'),scope);
  const guard=scope.window.ATO_CAMPAIGN_SESSION.create();
  guard.accept({user:{id:'login-A'}});
  onMessage({data:{type:'session-logout'}});
  assert.throws(()=>guard.accountId);
});
test('map conflict stays blocked after an unrelated subsequent edit',async()=>{
  let server={position:2,hideUnknown:true}, revision=2, posts=0;
  const c=mapContext({fetch:async(u,o)=>{
    if(!o?.method) return response(200,{ok:true,state:{users:{A:server}},revision});
    const p=JSON.parse(o.body);posts++;
    assert.equal(p.expectedAccountId,'login-A');
    if(p.expectedRevision!==revision) return response(409,{revision,code:'SAVE_CONFLICT'});
    server=clone(p.state);return response(200,{ok:true,revision:++revision});
  }});
  assert.equal(await c.saveCampaignMapSection(),false);
  c.state.hideUnknown=false;
  assert.equal(await c.saveCampaignMapSection(),false);
  assert.equal(server.position,2);
  assert.equal(posts,1);
  assert.equal(c.mapSectionRevision,1);
});
test('map preserves edits made while an earlier request is pending',async()=>{
  let server,revision=1,posts=0;
  const c=mapContext({fetch:async(u,o)=>{
    if(!o?.method)return response(200,{ok:true,state:{users:{A:server}},revision});
    const p=JSON.parse(o.body);posts++;
    if(posts===1)c.state.position=3;
    if(p.expectedRevision!==revision)return response(409,{revision,code:'SAVE_CONFLICT'});
    server=clone(p.state);return response(200,{ok:true,revision:++revision});
  }});
  await c.saveCampaignMapSection();
  assert.equal(server.position,1);
  assert.equal(c.mapStateBaseline.position,1);
  server.hideUnknown=false;revision++;
  await c.saveCampaignMapSection();
  assert.equal(server.position,3);
  assert.equal(server.hideUnknown,false);
});
test('map reconnect detects conflicts without rebasing local edits onto them',()=>{
  const c=mapContext();
  const result=c.applyServerMapState({users:{A:{position:2,hideUnknown:true}}},'A',true);
  assert.equal(result.conflict,true);
  assert.equal(c.mapSaveConflict,true);
  assert.equal(c.mapStateBaseline.position,0);
  assert.equal(c.state.position,1);
});
test('map reconnect retains its original profile even without local edits',()=>{
  const c=mapContext();
  c.applyServerMapState({users:{A:{position:4},B:{position:9}}},'B',false);
  assert.equal(c.mapStateProfileId,'A');
  assert.equal(c.state.position,4);
});
test('map identity mismatch aborts before revision conflict retry',async()=>{
  let calls=0;
  const c=mapContext({fetch:async()=>{calls++;return response(409,{code:'ACCOUNT_MISMATCH',revision:8});}});
  assert.equal(await c.saveCampaignMapSection(),false);
  assert.equal(c.campaignSession.changed,true);
  assert.equal(await c.saveCampaignMapSection(),false);
  assert.equal(calls,1);
});
function techContext(extra={}) {
  const c=context('technology/index.html',['probeCampaignReconnect','saveCampaignTechnologySection','adoptTechnologyCampaign','mergeTechnologyAccountState','technologyStateValuesEqual'],{
    campaignSession:session(),campaignStorageAvailable:false,campaignReconnectInFlight:false,
    campaignSaveQueuedBeforeReady:true,campaignSaveInFlight:false,campaignSavePending:false,
    campaignTechRevision:1,campaignTechLoaded:true,campaignTechConflict:false,
    campaignTechBaseState:{unlocked:['base'],conditions:[]},campaignReconnectDelay:2000,
    CAMPAIGN_STORAGE_URL:'/api',CAMPAIGN_TECH_URL:'/api?section=technology',activeAccountId:'A',accounts:{A:{}},
    TECH_STATE_FIELD_LABELS:{unlocked:'科技',conditions:'条件'},isPlainObject,
    setCampaignSaveStatus:noop,scheduleCampaignReconnect:noop,queueCampaignTechnologySave:noop,
    local:{unlocked:['base'],conditions:['local']},...extra,
  });
  c.technologySectionState=()=>clone(c.local);
  c.applyTechnologyAccountState=x=>{c.local=clone(x);};
  return c;
}
test('technology reconnect merges remote unlocks with local condition edits',async()=>{
  let server={unlocked:['base','remote'],conditions:[]},revision=2,queued=false;
  const c=techContext({queueCampaignTechnologySave:()=>{queued=true;},fetch:async(u,o)=>{
    if(!o?.method)return response(200,{ok:true,exists:true,user:{id:'login-A'},campaign:{
      sectionRevisions:{technology:revision},
      sections:{dashboard:{activeProfileId:'B',profiles:{A:{},B:{}}},technology:{users:{A:server,B:{}}}},
    }});
    const p=JSON.parse(o.body);
    assert.equal(p.expectedRevision,revision);assert.equal(p.userId,'A');assert.equal(p.expectedAccountId,'login-A');
    server=p.state;return response(200,{ok:true,revision:++revision});
  }});
  await c.probeCampaignReconnect();assert.equal(queued,true);
  await c.saveCampaignTechnologySection();
  assert.deepEqual(server,{unlocked:['base','remote'],conditions:['local']});
});
test('technology reconnect blocks same-field conflicts without adopting latest revision',async()=>{
  let queued=false;
  const campaign={sectionRevisions:{technology:2},sections:{technology:{users:{A:{unlocked:['base','remote'],conditions:[]}}}}};
  const c=techContext({local:{unlocked:['base','local'],conditions:[]},queueCampaignTechnologySave:()=>{queued=true;},fetch:async()=>response(200,{ok:true,campaign})});
  await c.probeCampaignReconnect();
  assert.equal(c.campaignTechConflict,true);assert.equal(c.campaignTechRevision,1);assert.equal(queued,false);
  assert.equal(await c.saveCampaignTechnologySection(),false);
});
test('technology merges initial edits into the active server profile',()=>{
  const c=techContext({campaignTechLoaded:false,activeAccountId:'default',accounts:{chosen:{}},campaignTechBaseState:{unlocked:['base'],conditions:[]}});
  assert.equal(c.adoptTechnologyCampaign({sections:{dashboard:{activeProfileId:'chosen',profiles:{chosen:{}}},technology:{users:{chosen:{unlocked:['base','remote'],conditions:[]}}}},sectionRevisions:{technology:4}},true),true);
  assert.equal(c.activeAccountId,'chosen');assert.deepEqual(c.local.conditions,['local']);assert.deepEqual(c.local.unlocked,['base','remote']);
});
test('technology retry keeps edits made during the rejected request',async()=>{
  let calls=0,server={unlocked:['base','remote'],conditions:[]};
  const c=techContext({campaignStorageAvailable:true,readLatestTechnologySectionState:async()=>({state:clone(server),revision:2}),fetch:async(u,o)=>{
    calls++;const p=JSON.parse(o.body);
    if(calls===1){c.local.conditions.push('during-save');return response(409,{code:'SAVE_CONFLICT',revision:2});}
    server=p.state;return response(200,{ok:true,revision:3});
  }});
  assert.equal(await c.saveCampaignTechnologySection(),true);
  assert.deepEqual(server.conditions,['local','during-save']);assert.deepEqual(server.unlocked,['base','remote']);
});
test('technology snapshot goes to its own profile and refuses missing profiles',async()=>{
  let archive={activeProfileId:'B',profiles:{A:{cycles:{}},B:{cycles:{}}}};
  const c=context('technology/index.html',['writeSnapshotToMainArchive'],{requestedMainCycleId:()=> 'c2',isPlainObject,mutateCampaignDashboardArchive:async f=>{archive=f(archive);}});
  await c.writeSnapshotToMainArchive({accountId:'A',unlockedKeys:['A-only']});
  assert.equal(archive.profiles.A.cycles.c2.state.unlockedTech.accountId,'A');
  assert.equal(archive.profiles.B.cycles.c2,undefined);assert.equal(archive.activeProfileId,'B');
  await assert.rejects(c.writeSnapshotToMainArchive({accountId:'missing'}),/档案已不存在/);
});
test('record conflict retry reads and saves original profile A after dashboard switches to B',async()=>{
  const base={resources:{a:0,b:0}};
  const c=context('record/index.html',['recordStateFromCampaign','readLatestRecordState','mergeRecordChanges','saveStateToServer'],{
    campaignSession:session(),recordProfileLoaded:true,serverStorageAvailable:true,serverSaveInFlight:false,
    serverSavePending:false,serverConflictMerging:false,serverSaveNeedsRetry:false,serverSectionRevision:1,
    serverStateBaseline:clone(base),state:{resources:{a:5,b:0}},campaignUserId:'A',
    serverStorageUrl:'/api',serverStorageSection:'record',defaultState:base,cloneJson:clone,
    jsonEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),normalizeState:clone,isPlainObject,atomicMergePaths:new Set(),
    setSaveStatus:noop,renderAll:noop,recordSyncChannel:null,window:{confirm:()=>{throw Error('No overlapping edits');}},
    fetch:async(u,o)=>{
      if(!o?.method)return response(200,{ok:true,campaign:{
        sectionRevisions:{record:2},
        sections:{dashboard:{activeProfileId:'B',profiles:{A:{},B:{}}},record:{users:{A:{resources:{a:0,b:7}},B:{resources:{a:99,b:99}}}}},
      }});
      const p=JSON.parse(o.body);
      if(p.expectedRevision===1)return response(409,{code:'SAVE_CONFLICT',revision:2});
      c.saved=p;return response(200,{ok:true,revision:3});
    },
  });
  await c.saveStateToServer();await new Promise(r=>setImmediate(r));
  assert.equal(c.saved.userId,'A');assert.equal(c.saved.expectedAccountId,'login-A');
  assert.deepEqual(c.saved.state.resources,{a:5,b:7});
});
function heroContext(extra={}) {
  return context('hero/index.html',['heroSnapshot','mergeHeroStates','chooseHeroMerge','saveToServer','persistLocal','loadFromServer'],{
    state:{heroes:[],graveyard:[],_userId:'login-A'},heroServerBaseline:null,heroSaveInFlight:false,
    heroSavePending:false,heroLoading:false,heroSessionEpoch:0,serverSectionRevision:1,serverStorageAvailable:true,
    serverStorageUrl:'/api',serverStorageSection:'heroes',storageKey:'hero',localStorage:{setItem:noop},
    normalizeState:noop,renderAll:noop,setSaveStatus:noop,window:{confirm:()=>true},...extra,
  });
}
test('hero merge keeps independent edits to different heroes and fields',()=>{
  const c=heroContext();const base={heroes:[{id:'h1',xp:0,notes:''},{id:'h2',xp:0}],graveyard:[]};
  const local=clone(base),remote=clone(base);local.heroes[0].xp=2;remote.heroes[0].notes='remote';remote.heroes[1].xp=7;
  const merged=c.mergeHeroStates(base,local,remote);
  assert.equal(merged.conflicts.length,0);assert.deepEqual(clone(merged.state.heroes),[{id:'h1',xp:2,notes:'remote'},{id:'h2',xp:7}]);
});
test('hero merge preserves deletions and flags delete-versus-edit conflicts',()=>{
  const c=heroContext();const base={heroes:[{id:'h1',xp:0}],graveyard:[]};
  assert.equal(c.mergeHeroStates(base,{heroes:[]},base).state.heroes.length,0);
  const merged=c.mergeHeroStates(base,{heroes:[]},{heroes:[{id:'h1',xp:3}]});
  assert.equal(merged.conflicts.length,1);
});
test('hero retry saves remote edits to H2 alongside local edits to H1',async()=>{
  const base={heroes:[{id:'h1',xp:0},{id:'h2',xp:0}],graveyard:[]};
  const remote=clone(base);remote.heroes[1].xp=7;let calls=0,saved;
  const local=clone(base);local.heroes[0].xp=2;
  const c=heroContext({heroServerBaseline:clone(base),state:{...local,_userId:'login-A'},fetch:async(u,o)=>{
    if(!o?.method)return response(200,{ok:true,user:{id:'login-A'},state:remote,revision:2});
    const p=JSON.parse(o.body);assert.equal(p.expectedAccountId,'login-A');
    if(++calls===1)return response(409,{code:'SAVE_CONFLICT',revision:2});
    saved=p.state;return response(200,{ok:true,revision:3});
  }});
  await c.saveToServer();
  assert.deepEqual(saved.heroes,[{id:'h1',xp:2},{id:'h2',xp:7}]);assert.equal(c.state._dirty,false);
});
test('hero failed conflict read never retries a stale full state',async()=>{
  let posts=0;
  const c=heroContext({fetch:async(u,o)=>{
    if(!o?.method)return response(500,{ok:false});
    posts++;return response(409,{code:'SAVE_CONFLICT',revision:2});
  }});
  await c.saveToServer();assert.equal(posts,1);assert.equal(c.state._dirty,true);assert.equal(c.serverSectionRevision,1);
});
test('hero save serializes edits arriving during an earlier request',async()=>{
  let posts=0,saved;
  const c=heroContext({state:{heroes:[{id:'h1',xp:1}],_userId:'login-A'},fetch:async(u,o)=>{
    saved=JSON.parse(o.body).state;if(++posts===1)c.state.heroes[0].xp=2;
    return response(200,{ok:true,revision:1+posts});
  }});
  await c.saveToServer();assert.equal(posts,2);assert.equal(saved.heroes[0].xp,2);assert.equal(c.heroServerBaseline.heroes[0].xp,2);
});
test('hero persists a separate baseline for subsequent offline reloads',()=>{
  let stored;
  const c=heroContext({heroServerBaseline:{heroes:[{id:'h1',xp:1}]},state:{heroes:[{id:'h1',xp:2}],_dirty:true},localStorage:{setItem:(k,v)=>{stored=JSON.parse(v);}}});
  c.persistLocal();assert.equal(stored.heroes[0].xp,2);assert.equal(stored._syncBaseline.heroes[0].xp,1);
});
test('hero initial load merges offline edits using the persisted baseline',async()=>{
  const base={heroes:[{id:'h1',xp:0},{id:'h2',xp:0}],graveyard:[]};
  const local=clone(base),remote=clone(base);local.heroes[0].xp=2;remote.heroes[1].xp=7;let saved;
  const c=heroContext({heroServerBaseline:base,state:{...local,_userId:'login-A',_dirty:true},fetch:async(u,o)=>{
    if(!o?.method)return response(200,{ok:true,exists:true,user:{id:'login-A'},state:remote,revision:2});
    saved=JSON.parse(o.body);return response(200,{ok:true,revision:3});
  }});
  await c.loadFromServer();await new Promise(r=>setImmediate(r));
  assert.deepEqual(saved.state.heroes,[{id:'h1',xp:2},{id:'h2',xp:7}]);
  assert.equal(saved.expectedRevision,2);assert.equal(c.state._dirty,false);
});
test('hero page defers autosave until its initial server read completes',async()=>{
  let posts=0;
  const c=heroContext({heroLoading:true,fetch:async()=>{posts++;throw Error('Should not write yet');}});
  await c.saveToServer();assert.equal(posts,0);assert.equal(c.heroSavePending,true);
});
for(const keepLocal of [false,true]) test(`dashboard reconnect asks about overlapping edits (keep local=${keepLocal})`,async()=>{
  let queued=false,asked=0;
  const c=context('index.html',['mergeDashboardChanges','probeCampaignReconnect'],{
    campaignStorageAvailable:false,campaignReconnectInFlight:false,campaignSessionEpoch:1,
    campaignSaveQueuedBeforeReady:true,campaignSectionRevision:1,campaignSectionExists:true,
    archive:{day:2},campaignSectionBaseline:{day:1},defaultArchive:{day:1},campaignReconnectDelay:2000,
    cloneJson:clone,jsonEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),isPlainObject,
    readLatestDashboardSection:async()=>({archive:{day:3},revision:2,exists:true}),
    renderDashboardArchive:x=>{c.archive=x;},queueCampaignSave:()=>{queued=true;},
    setCampaignSaveStatus:noop,scheduleCampaignReconnect:noop,window:{confirm:()=>{asked++;return keepLocal;}},
  });
  await c.probeCampaignReconnect();assert.equal(asked,1);assert.equal(queued,keepLocal);assert.equal(c.archive.day,keepLocal?2:3);
});
test('late errors from an old story image cannot overwrite newer story content',()=>{
  const images=[],element=()=>({classList:{toggle:noop},replaceChildren(){this.textContent='';},append:noop});
  const elements=Object.fromEntries(['unavailableView','mapStage','battleView','storyView','storyBody','storyBookTitle','storySection','storyTitle','storyEntryId'].map(k=>[k,element()]));
  const c=context('ss/app.js',['hasStorySnapshot','openStory'],{
    elements,activeMode:'map',storyRenderKey:'',storyRendered:false,storyScanImages:s=>s.images||[],fitStoryTextToViewport:noop,
    document:{createElement:()=>{const img={addEventListener:(name,fn)=>{img[name]=fn;}};images.push(img);return img;}},
  });
  c.openStory({storyRevision:1,story:{id:'A',imagesOnly:true,images:['scan-A'],fallbackText:'Old A'}});
  c.openStory({storyRevision:2,story:{id:'B',text:'New B'}});
  images[0].error();assert.equal(elements.storyBody.textContent,'New B');
  c.openStory({storyRevision:3,story:{id:'C',title:'Title C',imagesOnly:true,images:['scan-C'],fallbackText:'Fallback C'}});
  images[1].error();assert.equal(elements.storyBody.textContent,'Fallback C');assert.equal(elements.storyTitle.textContent,'Title C');
});
