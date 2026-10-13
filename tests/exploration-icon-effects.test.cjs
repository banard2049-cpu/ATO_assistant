const test=require('node:test'),assert=require('node:assert/strict');
const effects=require('../assets/exploration-card-effects.js');
const conditions=require('../assets/exploration-card-conditions.js');
const resources=require('../assets/exploration-card-resource-rules.js');
test('Shrine of Aristaeus loses Fate and preserves the Titans shown on the record',()=>{
  global.window={};require('../assets/exploration-card-resources.js');
  const card=window.ATO_EXPLORATION_CARD_RESOURCES.cards['c2:13617'];
  const rows=effects.describe(card,{cycleId:'c2',conditionRules:conditions,stats:{refugees:7,fate:8}},resources);
  const loss=rows.find(row=>row.effects.some(effect=>effect.amount<0));
  assert.equal(loss.conditionState,true);
  assert.deepEqual(loss.effects,[{type:'fate',amount:-3}]);
  const record={cycle:'c2',fate:'8',cycleStats:{c2:{fate:'8'}},titans:[{id:'keep',name:'Existing',count:1}]};
  const applied=effects.apply(record,'c2',loss.effects);
  assert.equal(applied.record.fate,'5');assert.deepEqual(applied.record.titans,record.titans);
});
test('verified icon identities include C2 Refugees, C3 Paradox and C5 Paranoia without guessing unknown glyphs',()=>{
  for(const [cycle,glyph,type] of [
    ['c1','disc-with-emblem glyph','titan'],['c2','dark crossed-blades glyph','crew'],
    ['c3','outlined slanted angular glyph with white bars','paradox'],['c4','dark round coin-like glyph with short rays','babelianDebt'],
    ['c5','small dark hand-like glyph','paranoia'],['c5','dark glyph with a white V-notch','fate'],
  ])assert.deepEqual(effects.parse(`Gain +1 ICON(${glyph}).`,cycle).effects,[{type,amount:1}]);
  assert.equal(conditions.conditionFromBadge('ICON(figure)/5+','c2').key,'refugees');
  assert.equal(conditions.conditionFromBadge('ICON(white Ψ-shaped glyph in dark pentagon) 6+','c2').key,'fate');
  assert.equal(conditions.conditionFromBadge('ICON(white hand-like glyph in dark lozenge) 3+','c5').key,'paranoia');
  assert.equal(effects.iconType('unverified dark triangle','c4'),null);
  assert.deepEqual(effects.parse('Gain +1 ICON(small dark resource glyph).','c4').effects,[],'the vague Waster label requires its actual card and row');
});
test('new counters preserve cycle fields, limits, negative Humanity and actual undo deltas',()=>{
  const original={cycle:'c2',humanity:'-2',fate:'4',resources:{priests:2,'priests-names':'Existing names'},cycleStats:{c2:{humanity:'-2'},c3:{paradox:'11'},c4:{babelianDebt:'3'},c5:{paranoia:'2'}}};
  const human=effects.apply(original,'c2',[{type:'humanity',amount:-1}]);
  assert.equal(human.record.humanity,'-3');
  assert.equal(conditions.contextForRecord(human.record,'c2').stats.humanity,-3);
  assert.equal(effects.revert(human.record,human.changes).humanity,'-2');
  const paradox=effects.apply(human.record,'c3',[{type:'paradox',amount:3}]);
  assert.equal(paradox.record.cycleStats.c3.paradox,'12');assert.equal(paradox.changes[0].amount,1);
  assert.equal(paradox.record.humanity,'-3');
  const debt=effects.apply(paradox.record,'c4',[{type:'babelianDebt',amount:2}]);assert.equal(debt.record.cycleStats.c4.babelianDebt,'5');
  const priests=effects.apply(debt.record,'c4',[{type:'priests',amount:1}]);assert.equal(priests.record.resources.priests,3);
  assert.equal(priests.record.resources['priests-names'],'Existing names');
  assert.equal(effects.revert(priests.record,priests.changes).resources.priests,2);
  const paranoia=effects.apply(priests.record,'c5',[{type:'paranoia',amount:-4}]);assert.equal(paranoia.changes[0].amount,-2);
  assert.equal(paranoia.record.cycleStats.c5.paranoia,'0');
});
test('Waster row-specific aliases separate Progress, Fate, Debt and Doom',()=>{
  for(const [badge,type,amount] of [['Allied','progress',1],['Neutral','fate',1],['Unfriendly','babelianDebt',1],['Denounced','babelianDebt',2],['At War','doom',1]]){
    assert.deepEqual(effects.parse(`Gain +${amount} ICON(small dark resource glyph).`,'c4','9341',badge).effects,[{type,amount}]);
  }
});
test('Doom instead branches are exclusive and a confirmed base stays chosen until undone',()=>{
  const card={cycleId:'c1',cardId:'6438',manual:[{text:'Gain +1 Doom Token.',badge:''},{text:'Gain +2 Doom Token instead.',badge:'ICON(black hexagon with triangle-hook glyph)/7+'}]};
  const base={cycleId:'c1',conditionRules:conditions,stats:{fate:7}};
  assert.deepEqual(effects.describe(card,base,resources).map(x=>x.id),['manual:1']);
  assert.deepEqual(effects.describe(card,{...base,stats:{fate:6}},resources).filter(x=>x.conditionState===true).map(x=>x.id),['manual:0']);
  assert.ok(effects.describe(card,{...base,stats:{fate:null}},resources).every(x=>x.conditionState===null));
  assert.deepEqual(effects.describe(card,{...base,appliedEffects:{'manual:0':{}}},resources).map(x=>x.id),['manual:0']);
});
test('gain bans also block priests, while debt and Fate increments remain active',()=>{
  const card={cycleId:'c4',manual:[{text:'Gain +1 Priests.'},{text:'Gain +1 Babelian Debt.'}]};
  const rows=effects.describe(card,{cycleId:'c4',blockGains:true},resources);
  assert.equal(rows[0].effects.length,0);assert.equal(rows[1].effects[0].type,'babelianDebt');
  const result=effects.apply({cycle:'c4',resources:{priests:1}},'c4',[{type:'priests',amount:2}],{blockGains:true});
  assert.equal(result.record.resources.priests,1);
});
test('newly completed mixed glyph rows expose old partial receipts but preserve manually finished remainders',()=>{
  const card={cycleId:'c5',cardId:'10302',manual:[{text:'Gain +1 Crew and +1 ICON(dark glyph with a white V-notch).'}]};
  const context={cycleId:'c5',appliedEffects:{'manual:0':{changes:[{type:'crew',amount:1}]}}};
  assert.equal(effects.describe(card,context,resources)[0].receiptMismatch,true);
  assert.equal(effects.describe(card,{...context,manualEffects:{'manual:0':true}},resources)[0].receiptMismatch,undefined);
});

test('paragraph grouping keeps the shared Allied condition and Resolve uses Nemesis without changing Titan gains',()=>{
  const dataContext={window:{}};
  require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../assets/exploration-card-resources.js'),'utf8'),dataContext);
  const cards=dataContext.window.ATO_EXPLORATION_CARD_RESOURCES.cards;
  for(const key of ['c1:6435','c2:13641','c3:13539','c4:9335']){
    const card=cards[key];
    for(const bonus of [0,2]){
      const context={cycleId:card.cycleId,conditionRules:conditions,diplomacy:[{id:'test',bonus}]};
      const rows=effects.combineManualReminders(card,effects.describe(card,context,resources),context);
      const paragraph=rows.find(row=>row.id==='manual-group:1-2');
      assert.ok(paragraph,key);assert.equal(paragraph.conditionState,bonus===2,key);
      assert.match(paragraph.text,/Roll a d10.*On 8\+/);
    }
  }
  for(const key of ['c2:13637','c3:13533','c4:9336','c4:9344','c4:9346','c5:10304','c5:10305','c5:10311','c5:10318']){
    const card=cards[key],text=card.manual.find(row=>/resolve.*ICON\(/i.test(row.text)).text;
    assert.match(effects.displayIcons(text,card.cycleId,card.cardId),/宿敌标记/,key);
  }
  assert.deepEqual(effects.parse('Gain +1 ICON(black disc with a white beast-head emblem).','c4','9344').effects,[{type:'titan',amount:1}]);
});
