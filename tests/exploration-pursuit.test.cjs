const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pursuit = require('../assets/exploration-pursuit.js');
const rules = require('../technology/structure-tech-rules.js');
const { create } = require('../technology/structure-tech-client.js');
const dictionary = require('../technology/tech_card_dictionary.min.json');
const clone = value => JSON.parse(JSON.stringify(value));
const globals = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../map/nemesis-path.js'), 'utf8'), globals);
const pathRules = globals.window.ATO_NEMESIS_PATH;
const data = { cycles: ['c1', 'c2', 'c3', 'c4', 'c5'].map(id => ({ id, tiles: Array.from({ length: 7 }, (_, i) => ({
  id: String(i + 1).padStart(3, '0'), label: String(i + 1).padStart(3, '0'), nx: i, ny: 0,
  neighbors: { left: i ? String(i).padStart(3, '0') : '', right: i < 6 ? String(i + 2).padStart(3, '0') : '' },
})) })) };
function fixture(ids = ['6407', '6410'], { cycle = 'c1', adversary = '006', unlocked = true } = {}) {
  const ctx = { dictionary, cycle, cycleId: cycle, day: 8, mapData: data, pathRules,
    techKey: 'pursuer problem', actionId: 'exploration-pursuit', operationId: `pursuit-${cycle}-test`,
    technology: { unlocked: unlocked ? ['pursuer problem'] : [] },
    record: { cycle, cycleStats: { [cycle]: { fate: '3' } }, resources: {} },
    automation: { version: 1, events: {} },
    state: { day: 8, notes: '原有备注', exploration: { drawStateByCycle: { [cycle]: { pursuitRoundId: `pursuit-${cycle}-test`,
      activePiles: [ids.map((id, i) => ({ id, name: id, day: 8, drawnAt: 'same-draw', pile: i % 2 })), []] } } } },
    mapState: { cycles: { [cycle]: { currentTile: '001', explored: Object.fromEntries(data.cycles[0].tiles.map(tile => [tile.id, true])),
      tokens: { AD: adversary, markers: { '007': { hs: true } } }, titanXTrackPosition: cycle === 'c5' && adversary ? 7 : null } } },
  };
  ctx.selection = { roundId: ctx.operationId, waive: false, spawnTileId: '' };
  return ctx;
}
const apply = (ctx, selection = {}) => rules.prepareOperation({ ...ctx, selection: { ...ctx.selection, ...selection } });

test('marker inventory covers all 223 card faces, including all four double-marker cards', () => {
  const catalog = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/exploration-card-tags.js'), 'utf8'), catalog);
  const files = Object.keys(catalog.window.ATO_EXPLORATION_CARD_TAGS.cards);
  const cycles = ['c1','c2','c3','c4','c5'];
  if (cycles.every(cycle => fs.existsSync(`assets/exploration-cards/${cycle}`))) {
    const images = cycles.flatMap(cycle => fs.readdirSync(`assets/exploration-cards/${cycle}`).filter(name => name.endsWith('.png')).map(name => `${cycle}:${name.slice(0,-4)}`));
    assert.deepEqual(files.slice().sort(), images.sort(), 'local card images match the public runtime catalog');
  }
  assert.equal(files.length, 223);
  assert.deepEqual(Object.keys(pursuit.markers).sort(), files.sort());
  assert.deepEqual(Object.entries(pursuit.markers).filter(([, count]) => count === 2).map(([key]) => key).sort(), ['c1:6436','c2:13637','c3:13533','c4:9336']);
  assert.equal(pursuit.markers['c1:6428'], 1);
  assert.equal(pursuit.markers['c4:9331'], 1, 'the landscape card also has a standalone symbol at its lower left');
  assert.equal(pursuit.markers['c5:10348'], 0);
});

test('count both piles and every chained draw; merchant choices never activate pursuit a second time', () => {
  const ctx = fixture(['6407','6436','6401']);
  ctx.state.exploration.drawStateByCycle.c1.activePiles[1].push({id:'6410',drawnAt:'same-draw'});
  assert.equal(pursuit.countMarkers(ctx).total, 4);
  ctx.state.exploration.drawStateByCycle.c1.activePiles = [[{id:'6407',negotiationId:'merchant'}],[]];
  assert.equal(pursuit.roundId(ctx), '');
  assert.equal(pursuit.countMarkers(ctx).total, 0);
});

test('no enemy plus fewer than two symbols records no event movement or payment; two spawn after the introduction', () => {
  for (const ids of [['6401'], ['6407']]) {
    const ctx = fixture(ids, { adversary: '' }), before = clone(ctx), result = apply(ctx);
    assert.equal(result.ok, true);
    assert.equal(result.event.pursuit.mode, 'none');
    assert.equal(result.mapState, undefined);
    assert.equal(result.record.cycleStats.c1.fate, '3');
    assert.deepEqual(clone(ctx), before);
  }
  // 咯咯笑（两张追踪标记）也只有在特殊事件把宿敌放进地图之后才会生成。
  const ctx = fixture(['6436'], { adversary: '' }), result = apply(ctx);
  assert.equal(result.ok, true);
  assert.equal(result.event.pursuit.mode, 'none', '宿敌尚未登场时不生成');
  assert.equal(result.mapState, undefined);
  assert.equal(apply(ctx, {waive:true}).code,'CANNOT_WAIVE_SPAWN');
  ctx.mapState.cycles.c1.adversaryIntroduced = true;
  const spawned = apply(ctx);
  assert.equal(spawned.mapState.cycles.c1.tokens.AD, '005');
  assert.equal(spawned.mapState.cycles.c1.adversaryIntroduced, true, '生成后要留下已登场标记');
  assert.equal(spawned.event.pursuit.mode, 'spawn');
  assert.equal(spawned.event.pursuit.steps, 0);
});

test('markers are ignored until the cycle special event introduces the adversary', () => {
  const ctx = fixture(['6436'], { adversary: '' });
  const counted = pursuit.countMarkers(ctx);
  assert.equal(counted.total, 2, '抽到的标记照常展示，方便核对');
  const preview = pursuit.plan(ctx);
  assert.equal(preview.ok, true);
  assert.equal(preview.ignored, true);
  assert.equal(preview.total, 0);
  assert.equal(preview.rawTotal, 2);
  assert.equal(preview.mode, 'none');
  const settled = apply(ctx);
  assert.equal(settled.ok, true);
  assert.equal(settled.event.pursuit.total, 0);
  assert.equal(settled.event.rewardLabel, '宿敌未引入，追踪标记忽略。');
  assert.equal(settled.mapState, undefined, '未引入时不写地图');
  // 只有一个标记时同样忽略；没有标记则还是普通的一轮“无事发生”。
  const single = fixture(['6407'], { adversary: '' });
  assert.equal(pursuit.plan(single).ignored, true);
  assert.equal(pursuit.plan(single).rawTotal, 1);
  assert.equal(apply(single).event.rewardLabel, '宿敌未引入，追踪标记忽略。');
  const empty = fixture(['6401'], { adversary: '' });
  assert.equal(pursuit.plan(empty).ignored, undefined);
  assert.match(apply(empty).event.rewardLabel, /无事发生/);
  // 旧存档没有 adversaryIntroduced 字段，但地图上已经有模型，按已引入处理。
  assert.equal(pursuit.introduction(fixture()).introduced, true);
});

test('the introduction flag is per cycle and defaults to not introduced', () => {
  for (const cycle of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    assert.equal(pursuit.introduction({ cycleId: cycle, mapState: { cycles: {} } }).introduced, false, cycle);
  }
  assert.equal(pursuit.introduction({ cycleId: 'c1', mapState: { cycles: { c1: { tokens: { AD: '006' } }, c2: {} } } }).introduced, true);
  assert.equal(pursuit.introduction({ cycleId: 'c2', mapState: { cycles: { c1: { tokens: { AD: '006' } }, c2: {} } } }).introduced, false, '其他循环的仇敌不算本循环已引入');
  assert.equal(pursuit.introduction({ cycleId: 'c5', mapState: { cycles: { c5: { titanXTrackPosition: 7 } } } }).introduced, true);
});

test('dashboard map commands keep the cycle introduction flag', () => {
  const source = fs.readFileSync(require.resolve('../index.html'), 'utf8').replace(/\r\n/g, '\n');
  const match = source.match(/^ {4}function normalizeMapCommandState\([^]*?^ {4}}/m);
  assert.ok(match, 'normalizeMapCommandState');
  const sandbox = { window: { ATO_MAP_DATA: data }, isPlainObject: value => Boolean(value) && typeof value === 'object' && !Array.isArray(value) };
  vm.createContext(sandbox);
  vm.runInContext(`${match[0]}\nthis.normalize = normalizeMapCommandState;`, sandbox);
  const normalized = sandbox.normalize({ cycles: { c1: { currentTile: '001', tokens: { AD: '006' }, adversaryIntroduced: true } } }, 'c1');
  assert.equal(normalized.cycles.c1.adversaryIntroduced, true, '整体重写地图分区时不能丢掉已登场状态');
  assert.equal(normalized.cycles.c1.tokens.AD, '006');
  assert.equal(normalized.cycles.c1.adversaryIntroduced, pursuit.introduction({ cycleId: 'c1', mapState: normalized }).introduced);
});

test('Cycle V ignores markers until Titan X is placed on the track', () => {
  const ctx = fixture(['10311', '10318'], { cycle: 'c5', adversary: '' });
  ctx.mapState.cycles.c5.titanXTrackPosition = null;
  const ignored = apply(ctx);
  assert.equal(ignored.ok, true);
  assert.equal(ignored.event.pursuit.mode, 'none');
  assert.equal(ignored.mapState, undefined);
  ctx.mapState.cycles.c5.titanXTrackPosition = 7;
  const move = apply(ctx);
  assert.equal(move.event.pursuit.mode, 'move');
  assert.equal(move.mapState.cycles.c5.titanXTrackPosition, 5);
});

test('normal pursuit moves exactly the count along the shared path, preserving unrelated map markers', () => {
  const ctx = fixture(), result = apply(ctx);
  assert.equal(result.ok, true);
  assert.equal(result.mapState.cycles.c1.tokens.AD, '004');
  assert.equal(result.mapState.cycles.c1.tokens.markers['007'].hs, true);
  assert.equal(result.record.cycleStats.c1.fate, '3');
  assert.equal(result.event.pursuit.steps, 2);
});

test('Pursuer Problem pays fate +1 once and reduces total activation by one, down to zero', () => {
  const ctx = fixture(), result = apply(ctx, {waive:true});
  assert.equal(result.mapState.cycles.c1.tokens.AD, '005');
  assert.equal(result.record.cycleStats.c1.fate, '4');
  assert.equal(result.event.pursuit.waived, true);
  const zero = apply(fixture(['6407']), {waive:true});
  assert.equal(zero.mapState.cycles.c1.tokens.AD, '006');
  assert.equal(zero.event.pursuit.steps, 0);
  assert.equal(apply(fixture(['6401']), {waive:true}).code, 'CANNOT_WAIVE_SPAWN');
  const repeated = apply({...ctx, record: result.record, automation: result.automation}, {waive:true});
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.record.cycleStats.c1.fate, '4');
  assert.equal(apply({...ctx,record:result.record,automation:result.automation}).code,'OPERATION_CONFLICT');
});

test('locked, disabled or unaffordable avoidance changes neither the map nor record', () => {
  const ctx = fixture(undefined, { unlocked: false });
  assert.equal(apply(ctx).ok, true, 'normal pursuit needs no technology');
  assert.equal(apply(ctx,{waive:true}).code,'LOCKED_TECH');
  ctx.technology.unlocked.push('pursuer problem');
  ctx.record.explorationDelays={disabledTechs:{c1:{'pursuer problem':{untilDay:9}}}};
  assert.equal(apply(ctx,{waive:true}).code,'DISABLED_TECH');
  delete ctx.record.explorationDelays;
  ctx.record.cycleStats.c1.fate='12';
  const before=clone(ctx);
  assert.equal(apply(ctx,{waive:true}).code,'COST_LIMIT');
  assert.deepEqual(clone(ctx),before);
  assert.equal(apply(ctx).ok,true, 'fate at cap does not block default pursuit');
});

test('reaching Argo removes the enemy once and leaves a durable battle task without timed-battle cleanup', () => {
  const ctx=fixture(['6436'],{adversary:'002'}),result=apply(ctx);
  assert.equal(result.mapState.cycles.c1.tokens.AD,'');
  assert.equal(result.event.pursuit.battle,true);
  assert.equal(result.event.status,'pending');
  assert.equal(result.event.kind,'battle');
  assert.equal(result.state.exploration.drawStateByCycle.c1.activePiles[0].length,1);
  const completed=rules.completeOperation({...ctx,automation:result.automation,record:result.record});
  assert.equal(completed.ok,true);
  assert.equal(completed.event.status,'completed');
});

test('unreachable routes stay still; missing spawn routes and stale rounds fail without half a result', () => {
  const ctx=fixture();ctx.mapState.cycles.c1.explored={'001':true};ctx.mapState.cycles.c1.tokens.markers={};
  const result=apply(ctx);
  assert.equal(result.ok,true);
  assert.equal(result.mapState.cycles.c1.tokens.AD,'006');
  // 宿敌已被打掉但本循环已经登场过：2 个标记仍按原规则生成，只是没有合格位置。
  ctx.mapState.cycles.c1.tokens.AD='';ctx.mapState.cycles.c1.adversaryIntroduced=true;
  assert.equal(apply(ctx).code,'NO_SPAWN_LOCATION');
  assert.equal(apply(fixture(),{roundId:'old'}).code,'EXPLORATION_CHANGED');
  assert.equal(apply(fixture(['forged'])).code,'UNKNOWN_PURSUIT_CARD');
});

test('Cycle V advances once per marker along the Titan X track and respects avoidance', () => {
  const move=apply(fixture(['10311','10318'],{cycle:'c5'}));
  assert.equal(move.mapState.cycles.c5.titanXTrackPosition,5);
  const waive=apply(fixture(['10311','10318'],{cycle:'c5'}),{waive:true});
  assert.equal(waive.mapState.cycles.c5.titanXTrackPosition,6);
  assert.equal(waive.mapState.cycles.c5.tokens.AD,'002');
  // 泰坦 X 被击杀、追踪轨清空后，本循环仍算已登场，2 个标记会重新放到第 7 格。
  const cleared=fixture(['10311','10318'],{cycle:'c5',adversary:''});
  cleared.mapState.cycles.c5.titanXTrackPosition=null;
  cleared.mapState.cycles.c5.adversaryIntroduced=true;
  const respawn=apply(cleared);
  assert.equal(respawn.mapState.cycles.c5.titanXTrackPosition,7);
});

function clientFixture(options={}) {
  const ctx=fixture(), profileId='chosen', saved={ sections:{dashboard:{profiles:{chosen:{cycles:{c1:{state:{...ctx.state,techAutomation:ctx.automation}}}}}},
    record:{users:{chosen:ctx.record,other:{fate:'8'}}},map:{users:{chosen:ctx.mapState,other:{cycles:{}}}},technology:{users:{chosen:ctx.technology}},heroes:{}},
    sectionRevisions:{dashboard:1,record:1,map:1,technology:1,heroes:0}};
  const posts=[];
  const response=(status,payload)=>({status,ok:status===200,json:async()=>clone(payload)});
  const client=create({session:{accountId:'owner',assertCurrent(){},accept(){}},expectedAccountId:'owner',apiUrl:'/campaign',dictionaryUrl:'/dictionary',
    rules:{...rules,prepareOperation:input=>rules.prepareOperation({...input,mapData:data,pathRules})},
    fetch:async(url,init={})=>{
      if(url==='/dictionary')return response(200,dictionary);
      if(init.method!=='POST')return response(200,{ok:true,user:{id:'owner'},campaign:saved});
      const payload=JSON.parse(init.body);posts.push(payload);options.beforePost?.(saved,posts.length);
      if(Object.entries(payload.expectedRevisions).some(([key,value])=>saved.sectionRevisions[key]!==value))return response(409,{ok:false,code:'SAVE_CONFLICT'});
      const revisions={};for(const [key,value]of Object.entries(payload.sections)){
        saved.sections[key]=key==='dashboard'?value:{...(saved.sections[key]||{}),users:{...(saved.sections[key]?.users||{}),[profileId]:value}};
        revisions[key]=++saved.sectionRevisions[key];
      }
      if(options.loseResponse)throw new Error('lost after commit');
      return response(200,{ok:true,user:{id:'owner'},sections:revisions});
    }});
  const target={profileId,cycleId:'c1',techKey:'pursuer problem',actionId:'exploration-pursuit',operationId:ctx.operationId,selection:ctx.selection,expectedDay:8};
  return {client,target,saved,posts};
}
test('map movement and avoidance payment are one atomic revision-checked write, including lost responses',async()=>{
  const f=clientFixture({loseResponse:true});f.target.selection.waive=true;
  const result=await f.client.submit(f.target);
  assert.equal(result.duplicate,true);
  assert.equal(f.posts.length,1);
  assert.equal(f.posts[0].expectedRevisions.map,1);
  assert.equal(f.saved.sections.map.users.chosen.cycles.c1.tokens.AD,'005');
  assert.equal(f.saved.sections.record.users.chosen.cycleStats.c1.fate,'4');
  await f.client.submit(f.target);
  assert.equal(f.posts.length,1);
  assert.equal(f.saved.sections.record.users.other.fate,'8');
});
test('a concurrent map move rebases pursuit on the current enemy; a concurrent technology lock cancels avoidance',async()=>{
  const f=clientFixture({beforePost(saved,n){if(n===1){saved.sections.map.users.chosen.cycles.c1.tokens.AD='007';saved.sectionRevisions.map++;}}});
  await f.client.submit(f.target);
  assert.equal(f.saved.sections.map.users.chosen.cycles.c1.tokens.AD,'005');
  const locked=clientFixture({beforePost(saved,n){if(n===1){saved.sections.technology.users.chosen.unlocked=[];saved.sectionRevisions.technology++;}}});
  locked.target.selection.waive=true;
  await assert.rejects(locked.client.submit(locked.target),error=>error.code==='LOCKED_TECH');
  assert.equal(locked.saved.sections.map.users.chosen.cycles.c1.tokens.AD,'006');
  assert.equal(locked.saved.sections.record.users.chosen.cycleStats.c1.fate,'3');
});
test('two pages settling the same draw move and pay only once',async()=>{
  const f=clientFixture();f.target.selection.waive=true;
  await Promise.all([f.client.submit(f.target),f.client.submit(f.target)]);
  assert.equal(f.saved.sections.map.users.chosen.cycles.c1.tokens.AD,'005');
  assert.equal(f.saved.sections.record.users.chosen.cycleStats.c1.fate,'4');
  assert.equal(Object.keys(f.saved.sections.record.users.chosen.technologyActionReceipts).length,1);
});

test('all nine conditional pursuit rows count exactly one extra symbol at their printed threshold',()=>{
  assert.equal(Object.keys(pursuit.conditional).length,9);
  for(const [key,rule]of Object.entries(pursuit.conditional)){
    const [cycle,id]=key.split(':'),ctx=fixture([id],{cycle});
    ctx.record.cycleStats[cycle].fate=String(rule.fate-1);
    ctx.record.cycleStats[cycle].babelianDebt='0';
    const before=pursuit.countMarkers(ctx);
    assert.equal(before.total,pursuit.markers[key],key+' below threshold');
    ctx.record.cycleStats[cycle].fate=String(rule.fate);
    const triggered=pursuit.countMarkers(ctx);
    assert.equal(triggered.total,pursuit.markers[key]+1,key+' at threshold');
    assert.equal(triggered.cards[0].extra,1);
    assert.equal(pursuit.manualIndexes({key})[0],rule.index);
    if(rule.debt){ctx.record.cycleStats[cycle].fate='0';ctx.record.cycleStats[cycle].babelianDebt=String(rule.debt);
      assert.equal(pursuit.countMarkers(ctx).total,1,'debt OR fate, counted only once even if both meet the condition');}
  }
});
test('every pursuit instruction in the transcribed exploration dataset is managed by the pursuit module',()=>{
  const source={window:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/exploration-card-resources.js'),'utf8'),source);
  const rows=Object.values(source.window.ATO_EXPLORATION_CARD_RESOURCES.cards).flatMap(card=>(card.manual||[])
    .flatMap((row,index)=>/resolve.*(?:Cackle|beast.head)/i.test(row.text)?[{key:card.key,index}]:[]));
  assert.equal(rows.length,10);
  for(const row of rows)assert.ok(pursuit.manualIndexes({key:row.key}).includes(row.index),`${row.key}/${row.index}`);
});
test('missing condition values never silently count as zero, but an OR condition succeeds with one known true side',()=>{
  const ctx=fixture(['9344'],{cycle:'c4'});
  delete ctx.record.cycleStats.c4.fate;
  assert.equal(apply(ctx).code,'PURSUIT_CONDITION_REQUIRED');
  ctx.record.cycleStats.c4.babelianDebt='4';
  assert.equal(pursuit.countMarkers(ctx).total,1);
  assert.equal(pursuit.countMarkers(ctx).unresolved.length,0);
  ctx.record.cycleStats.c4.babelianDebt='3';
  assert.equal(apply(ctx).code,'PURSUIT_CONDITION_REQUIRED');
});
test('a fate-or-pursuit choice is explicit and durable, and the fate branch can activate another card condition',()=>{
  const ctx=fixture(['10304','10311'],{cycle:'c5'}),draw=ctx.state.exploration.drawStateByCycle.c5;
  ctx.record.cycleStats.c5.fate='7';
  assert.equal(apply(ctx).code,'PURSUIT_CONDITION_REQUIRED');
  draw.pursuitChoices={'10304':'fate'};
  const fate=apply(ctx);
  assert.equal(fate.ok,true);
  assert.equal(fate.record.cycleStats.c5.fate,'8');
  assert.equal(fate.event.pursuit.total,2,'the chosen fate gain enables the additional marker at 8');
  assert.equal(fate.mapState.cycles.c5.titanXTrackPosition,5);
  draw.pursuitChoices={'10304':'pursuit'};
  const tracking=apply(ctx);
  assert.equal(tracking.record.cycleStats.c5.fate,'7');
  assert.equal(tracking.event.pursuit.total,2,'one chosen marker plus one printed marker');
  assert.equal(tracking.event.pursuit.cards[1].extra,0);
});
test('avoidance fate is paid after counting and cannot retroactively add a conditional marker in that activation',()=>{
  const ctx=fixture(['6436']);ctx.record.cycleStats.c1.fate='7';
  const result=apply(ctx,{waive:true});
  assert.equal(result.record.cycleStats.c1.fate,'8');
  assert.equal(result.event.pursuit.total,2);
  assert.equal(result.event.pursuit.steps,1);
  const reloaded=pursuit.plan({...ctx,record:result.record,automation:result.automation});
  assert.equal(reloaded.total,2,'saved tally stays fixed after the cost changes fate');
});
