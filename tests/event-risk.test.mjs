import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const school=require('../.test-build/lib/sim/event-catalog.js');
const pro=require('../.test-build/lib/sim/pro-event-catalog.js');
const runtime=require('../.test-build/lib/sim/pro-event-runtime.js');
const system=require('../.test-build/lib/sim/event-system.js');
const storage=require('../.test-build/lib/career-save.js');
const {stolenBaseAttempt}=require('../.test-build/lib/sim/base-stealing.js');
const cache=new Map();
function fixture(mode){
 if(!cache.has(mode))cache.set(mode,mode==='pro'?pc.acknowledgeCareer(pc.createProfessionalDemo('event-risk','검증','SS')):e.createGame('event-risk','검증','SS'));
 const s=structuredClone(cache.get(mode)),p=e.getPlayer(s);
 s.date=`${s.calendar.seasonYear}-07-20`;s.week=20;s.phase='weekStart';s.calendar.events=[];s.calendar.competitions=[];s.calendar.trainingDays=[s.date];
 s.careerEvent=null;s.careerNotice=null;s.noticeQueue=[];s.careerEventHistory=[];delete s.proEvents;delete s.weekProgress;delete s.matchProgress;
 p.fatigue=40;p.injury=null;p.forcedRest=false;p.grade=2;p.roleOffer=null;p.eligiblePositions=['SS'];p.trainingPolicy=e.defaultPolicy(p.primaryRole);
 for(const k of Object.keys(p.stats))p.stats[k]=50;
 if(mode==='school')p.reputation=e.reputationScore(p);
 if(mode==='pro'){s.proWorld.stage='regular';p.professional.employment='active';p.professional.firsts.debut=s.date;}
 return s;
}
function open(s,id,scene){
 const p=e.getPlayer(s);
 s.careerEvent=s.careerMode==='pro'?pro.createProEvent(s,id,{version:1,catalogId:id,channel:scene?'game':'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:'first',field:'batting',openedAt:s.date}):school.createCareerEvent(id,p,s.date,s.week,{scene});
 if(scene)s.careerEvent.scene=scene;
 return s.careerEvent;
}
function seed(s,roll){
 for(let n=0;n<10000;n++){const q={rngStates:{...s.rngStates,events:n}},v=e.random(q,'events'),awake=e.random(q,'events');if(v>=roll&&v<roll+.02&&awake>=.05){s.rngStates.events=n;return;}}
 assert.fail('seed');
}
const scene={gameId:'event-game',inning:7,battingSide:1,outs:1,bases:['runner',null,null],score:[1,0],batting:true,batterName:'타자',pitcherName:'투수'};
test('all baseball catalog outcomes remove added fatigue while preserving recovery',()=>{
 for(const mode of ['school','pro']){
  const s=fixture(mode),rows=mode==='school'?school.schoolEventCatalog:pro.proEventCatalog;
  for(const d of rows.filter(d=>d.category==='baseball')){
   const outcomes=mode==='school'?open(s,d.id).choices.flatMap(c=>c.outcomes):d.choices.flatMap(c=>c.outcomes);
   for(const o of outcomes){assert((o.fatigue??0)<=0,d.id);assert((o.fatigueRange?.max??0)<=0,d.id);}
  }
 }
});
test('new training and outside events expose two different risk profiles with exact weights',()=>{
 for(const [mode,ids]of [['school',['T21','T22',...Array.from({length:6},(_,i)=>`X0${i+1}`)]],['pro',['PE76','PE77','PE78',...Array.from({length:6},(_,i)=>`PE${i+82}`)]]]){
  for(const id of ids){const s=fixture(mode),event=open(s,id);assert.deepEqual(event.choices.map(c=>c.outcomes.map(o=>o.weight)),[[35,65],[85,15]],id);assert.notDeepEqual(event.choices[0].outcomes,event.choices[1].outcomes,id);}
 }
});
test('training changes abilities with direct selection bonuses only for professional challenges',()=>{
 for(const [mode,id,key]of [['school','T21','power'],['pro','PE77','power']]){
  const s=fixture(mode);open(s,id);seed(s,.1);const before=structuredClone(e.getPlayer(s));const success=e.answerCareerEvent(s,'choice-1'),out=success.careerEventHistory.at(-1);
  assert(out.stats[key]>0);assert.equal(out.fatigue,0);assert.equal(out.selectionBonus,mode==='pro'?.6:undefined);assert.equal(e.getPlayer(success).professional?.eventSelectionBonus,mode==='pro'?.6:undefined);assert.deepEqual(e.getPlayer(success).seasonStats,before.seasonStats);
  seed(s,.9);const failure=e.answerCareerEvent(s,'choice-1').careerEventHistory.at(-1);assert(Math.abs(failure.stats.contact+.3)<1e-8);assert.equal(failure.fatigue,0);assert.equal(failure.selectionBonus,mode==='pro'?-.6:undefined);
  seed(s,.9);const small=e.answerCareerEvent(s,'choice-2').careerEventHistory.at(-1);assert(Math.abs(small.stats.contact+.3)<1e-8);assert.equal(small.selectionBonus,undefined);
 }
});
test('every external branch affects only body management or BQ and remains off game days',()=>{
 for(const mode of ['school','pro'])for(let i=0;i<6;i++){
  const id=mode==='school'?`X0${i+1}`:`PE${i+82}`,s=fixture(mode),p=e.getPlayer(s);
  if(mode==='school'&&school.schoolEventCatalog.find(row=>row.id===id).schoolPeriod==='term'){s.date=`${s.calendar.seasonYear}-05-20`;s.calendar.trainingDays=[s.date];}
  if(id==='PE84')s.date=`${s.calendar.seasonYear}-11-20`;
  const event=open(s,id);s.careerEvent=null;
  const candidates=()=>mode==='school'?system.eventCandidates(s,s.date).map(d=>d.definitionId):runtime.proGeneralCandidates(s).map(d=>d.id);
  assert(candidates().includes(id),id);
  s.calendar.events=[{id:'game',date:s.date,status:'scheduled',homeTeamId:p.teamId,awayTeamId:99}];assert(!candidates().includes(id),id);
  for(const c of event.choices)for(const branch of c.outcomes){
   assert.equal(branch.selectionBonus,undefined);assert.equal(branch.reputation,undefined);
   assert(Object.keys({...branch.stats,...branch.weeks}).every(k=>['bq','stamina','recovery','arm'].includes(k)),id);
  }
 }
});
test('school and pro match choices preserve abilities and records, changing encounter odds and the correct evaluation',()=>{
 for(const [mode,ids]of [['school',['G01','G02','G03','G04','G05','G06','G07','G08']],['pro',['PE20','PE21','PE22','PE23','PE24','PE79','PE80']]])for(const id of ids){
  const s=fixture(mode),p=e.getPlayer(s);open(s,id,scene);s.matchProgress={gameId:scene.gameId,battingSide:1,battingIndex:[0,0],sides:[{order:[]},{order:[p.id]}],pitchers:['pitcher',p.id],eventFatigue:0};
  for(const roll of [.1,.9]){seed(s,roll);const next=e.answerCareerEvent(s,'choice-1'),out=next.careerEventHistory.at(-1);assert.deepEqual(out.stats,{},id);assert.equal(out.fatigue,0);assert(next.matchEffect,id);assert.deepEqual(e.getPlayer(next).stats,p.stats);assert.deepEqual(e.getPlayer(next).seasonStats,p.seasonStats);assert.equal(next.rngStates.match,s.rngStates.match);
   if(mode==='pro'){assert.equal(out.reputation,0);assert.equal(out.selectionBonus,undefined);assert.equal(e.selectionScore(e.getPlayer(next)),e.selectionScore(p));}
   else assert((roll<.35?1:-1)*out.reputation>0);
  }
 }
});
test('pro evaluation bonus is bounded, saved and cannot be awarded by an external event',()=>{
 const s=fixture('pro'),p=e.getPlayer(s);p.professional.eventSelectionBonus=4.9;open(s,'PE77');seed(s,.1);
 const next=e.answerCareerEvent(s,'choice-1');assert.equal(e.getPlayer(next).professional.eventSelectionBonus,5);
 const loaded=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(next,false))).state;assert.equal(e.getPlayer(loaded).professional.eventSelectionBonus,5);
 open(s,'PE82');seed(s,.1);const external=e.answerCareerEvent(s,'choice-1');assert.equal(e.getPlayer(external).professional.eventSelectionBonus,4.9);assert.equal(external.careerEventHistory.at(-1).selectionBonus,undefined);
});
test('phone call learns BQ while resting recovers fatigue',()=>{
 const s=fixture('school');open(s,'L04');seed(s,.1);const call=e.answerCareerEvent(s,'choice-1').careerEventHistory.at(-1);assert(call.stats.bq>0);assert.equal(call.fatigue,0);
 const rest=e.answerCareerEvent(s,'choice-2').careerEventHistory.at(-1);assert.deepEqual(rest.stats,{});assert(rest.fatigue<0);
});
test('steal choices pause for the actual runner, survive saving and modify a real steal attempt',()=>{
 const s=fixture('pro'),p=e.getPlayer(s);s.weekProgress={remainingDays:1,beforeStats:{...p.stats},report:{growth:e.emptyStats(),fatigue:{training:0,game:0,recovered:0,peak:p.fatigue,days:[]}}};s.calendar.events=[{id:scene.gameId,date:s.date,status:'scheduled',homeTeamId:p.teamId,awayTeamId:99,boxScore:{},score:[1,0]}];s.matchProgress={gameId:scene.gameId,ready:true,stealPending:true,bases:[{playerId:p.id,pitcherId:'pitcher'},null,null],eventFatigue:0};
 const before=e.params['pro_events.game_chance'];e.params['pro_events.game_chance']=1;
 try{assert(!runtime.openProStealEvent(s,scene,'another-runner'));assert(runtime.openProStealEvent(s,scene,p.id));assert.equal(s.careerEvent.definitionId,'PE81');seed(s,.1);
  const loaded=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(s,false))).state,next=e.answerCareerEvent(loaded,'choice-1');assert.equal(next.stealEffect.adjustment,.18);assert(next.matchProgress.stealPending);assert.equal(next.careerEventHistory.at(-1).selectionBonus,undefined);assert(!runtime.openProStealEvent(next,scene,p.id));
  const stats=p.stats;assert.equal(stolenBaseAttempt(stats,stats,stats,0,.75,.18),'safe');assert.equal(stolenBaseAttempt(stats,stats,stats,0,.75,-.3),'out');assert.equal(stolenBaseAttempt(stats,stats,stats,1,0),'none');
 }finally{e.params['pro_events.game_chance']=before;}
});
