import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const school=require('../.test-build/lib/sim/event-catalog.js'),pro=require('../.test-build/lib/sim/pro-event-catalog.js');
const system=require('../.test-build/lib/sim/event-system.js'),runtime=require('../.test-build/lib/sim/pro-event-runtime.js');
const ledger=require('../.test-build/lib/sim/pro-event-ledger.js'),save=require('../.test-build/lib/career-save.js');
let base;
function fixture(position='SS'){
 base??=pc.acknowledgeCareer(pc.createProfessionalDemo('selective-risk','캠프검증','SS'));
 const s=structuredClone(base),p=e.getPlayer(s);s.date='2028-02-10';s.phase='weekStart';s.proWorld.stage='camp';s.careerNotice=null;s.noticeQueue=[];s.careerEvent=null;s.careerEventHistory=[];s.calendar.events=[];s.calendar.trainingDays=[s.date];delete s.proEvents;delete s.pendingEventOutcome;delete s.weekProgress;delete s.matchProgress;
 p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position];p.age=22;p.fatigue=40;p.injury=null;p.forcedRest=false;delete p.twoWay;p.professional.employment='active';p.trainingPolicy=e.defaultPolicy(p.primaryRole);
 for(const key of Object.keys(p.stats))p.stats[key]=50;
 return s;
}
function open(s,id){const p=e.getPlayer(s);return s.careerEvent=pro.createProEvent(s,id,{version:1,catalogId:id,channel:'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:'first',field:e.isPitcher(p.primaryRole)?'pitching':'batting',openedAt:s.date});}
function roll(s,target){for(let value=0;value<100000;value++){const q={rngStates:{...s.rngStates,events:value}},first=e.random(q,'events'),second=e.random(q,'events');if(first>=target&&first<target+.01&&second>.5){s.rngStates.events=value;return;}}assert.fail('missing deterministic event roll');}
const weights=event=>event.choices.map(choice=>choice.outcomes.map(branch=>branch.weight));

test('only seven selected technical conversions use challenge and stable probabilities',()=>{
 const selected=[...school.schoolEventCatalog,...pro.proEventCatalog].filter(row=>row.riskChoice).map(row=>row.id).sort();
 assert.deepEqual(selected,['PE33','PE36','PE54','PE76','PE77','T21','T22'].sort());
 for(const rows of [school.schoolEventCatalog,pro.proEventCatalog])for(const event of rows.filter(row=>row.riskChoice))assert.deepEqual(weights(event),[[35,65],[85,15]],event.id);
 for(const id of ['T11','T12','T19','X03','PE32','PE40','PE78','PE79','PE80','PE81','PE82']){
  const event=[...school.schoolEventCatalog,...pro.proEventCatalog].find(row=>row.id===id);
  assert.deepEqual(weights(event),[[50,50],[50,50]],id);
 }
});

test('only professional challenge choices directly raise or lower selection evaluation',()=>{
 for(const definition of pro.proEventCatalog)for(const [choiceIndex,choice]of definition.choices.entries())for(const [branchIndex,branch]of choice.outcomes.entries()){
  assert.equal(branch.selectionBonus,definition.riskChoice&&choiceIndex===0?(branchIndex===0?.6:-.6):undefined,`${definition.id}:${choice.id}`);
 }
 for(const [id,position]of [['PE33','SP'],['PE36','SP'],['PE54','SS'],['PE76','SP'],['PE77','SS']]){
  for(const [choice,target,expected]of [['choice-1',.01,.6],['choice-1',.99,-.6],['choice-2',.01,undefined],['choice-2',.99,undefined]]){
   const s=fixture(position);open(s,id);roll(s,target);
   const next=e.answerCareerEvent(s,choice),p=e.getPlayer(next),out=next.careerEventHistory.at(-1);
   assert.equal(out.selectionBonus,expected,`${id}:${choice}:${target}`);assert.equal(p.professional.eventSelectionBonus??0,expected??0);
   assert.deepEqual(p.seasonByLevel,e.getPlayer(s).seasonByLevel);
  }
 }
});

test('old pending ordinary and stable choices cannot retain a direct evaluation bonus',()=>{
 for(const [id,choice]of [['PE20','choice-1'],['PE21','choice-2'],['PE22','choice-1'],['PE23','choice-2'],['PE24','choice-1'],['PE79','choice-1'],['PE80','choice-2'],['PE81','choice-1'],['PE77','choice-2']]){
  const s=fixture(),p=e.getPlayer(s);p.professional.eventSelectionBonus=1.2;
  const event=open(s,id);event.kind='game';event.proEvent.channel='game';
  event.scene={gameId:'pending-game',inning:7,battingSide:0,outs:1,bases:[null,null,null],score:[0,0],batting:true,batterName:p.name,pitcherName:'상대 투수'};
  for(const row of event.choices)for(const branch of row.outcomes)branch.selectionBonus=3;
  const loaded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;
  roll(loaded,.01);const next=e.answerCareerEvent(loaded,choice);
  assert.equal(e.getPlayer(next).professional.eventSelectionBonus,1.2,id);assert.equal(next.careerEventHistory.at(-1).selectionBonus,undefined,id);
 }
});

test('old pending challenges gain the current bonus once, bounded and preserved on reload',()=>{
 for(const [target,start,end]of [[.01,4.9,5],[.99,-4.9,-5]]){
  const s=fixture(),event=open(s,'PE77');for(const choice of event.choices)for(const branch of choice.outcomes)delete branch.selectionBonus;
  e.getPlayer(s).professional.eventSelectionBonus=start;roll(s,target);
  const next=e.answerCareerEvent(s,'choice-1');assert.equal(e.getPlayer(next).professional.eventSelectionBonus,end);
  assert.ok(Math.abs(next.careerEventHistory.at(-1).selectionBonus-(end-start))<1e-9);
  const restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(next))).state;
  assert.equal(e.getPlayer(restored).professional.eventSelectionBonus,end);assert.deepEqual(restored.careerEventHistory,next.careerEventHistory);
 }
});

test('professional offseason camp matches high-school center rewards for pitchers and hitters',()=>{
 for(const position of ['SP','SS']){
  const s=fixture(position),p=e.getPlayer(s),center=school.createCareerEvent('T10',p,s.date,s.week),camp=open(s,'PE84');
  const rewards=event=>event.choices.map(choice=>choice.outcomes.map(({weight,weeks,fatigue})=>({weight,weeks,fatigue})));
  assert.deepEqual(rewards(camp),rewards(center));assert.equal(pro.proEventCatalog.find(row=>row.id==='PE84').category,'baseball');
  for(const [target,choice] of [[0,'choice-1'],[.2,'choice-1'],[.1,'choice-2'],[.8,'choice-2']]){
   roll(s,target);const next=e.answerCareerEvent(s,choice),q=e.getPlayer(next),out=next.careerEventHistory.at(-1);
   if(choice==='choice-1'){
    const core=position==='SP'?['velocity','control','movement']:['contact','power','speed','defense'];
    const changed=Object.entries(out.stats).filter(([,amount])=>amount>0).map(([key])=>key).sort();
    assert.deepEqual(changed,(target===0?Object.keys(p.stats):core).sort());assert.equal(q.fatigue,p.fatigue);assert.equal(q.injury,null);
   }else if(target===.1){assert.ok(out.stats[position==='SP'?'control':'contact']>0);}else{assert.equal(q.fatigue,p.fatigue-10);assert.deepEqual(out.stats,{});}
   assert.deepEqual(q.seasonByLevel,p.seasonByLevel);
  }
 }
});

test('offseason camp is proposed once per season even after its ordinary repeat cooldown expires',()=>{
 const s=fixture();assert.ok(runtime.proGeneralCandidates(s).some(row=>row.id==='PE84'));
 const event=open(s,'PE84');ledger.recordProChoice(s,event);s.careerEvent=null;
 const history=s.proEvents.history[0];
 for(const [index,id]of ['PE01','PE04','PE07'].entries())s.proEvents.history.push({...history,id:`later-${index}`,catalogId:id,date:`2028-0${index+3}-20`});
 s.date='2028-11-20';s.calendar.trainingDays=[s.date];assert.ok(!runtime.proGeneralCandidates(s).some(row=>row.id==='PE84'));
 s.calendar.seasonYear=2029;s.proWorld.year=2029;s.date='2029-02-10';s.calendar.trainingDays=[s.date];assert.ok(runtime.proGeneralCandidates(s).some(row=>row.id==='PE84'));
});

test('unselected risk and camp saves upgrade once while ordinary choices and settled history stay frozen',()=>{
 for(const id of ['PE33','PE84']){
  const s=fixture(id==='PE33'?'SP':'SS'),event=open(s,id);event.rewardVersion=4;event.choices[0].outcomes=[{weight:100,message:'old choice',stats:{power:-9}}];
  const rng=structuredClone(s.rngStates),stats=structuredClone(e.getPlayer(s).stats);
  const loaded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;
  assert.equal(loaded.careerEvent.rewardVersion,5);assert.deepEqual(weights(loaded.careerEvent),id==='PE84'?[[5,95],[50,50]]:[[35,65],[85,15]]);
  assert.deepEqual(loaded.rngStates,rng);assert.deepEqual(e.getPlayer(loaded).stats,stats);assert.equal(system.upgradePendingCareerEvent(loaded),false);
 }
 const s=fixture(),event=open(s,'PE01');event.rewardVersion=4;event.choices[0].outcomes[0].message='keep ordinary choice';
 const choices=structuredClone(event.choices);assert.equal(system.upgradePendingCareerEvent(s),false);assert.deepEqual(s.careerEvent.choices,choices);
 open(s,'PE84');roll(s,.2);const settled=e.answerCareerEvent(s,'choice-1'),history=structuredClone(settled.careerEventHistory);
 const restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(settled))).state;
 assert.deepEqual(restored.careerEventHistory,history);assert.equal(restored.careerEvent,null);
});
