import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const system = require('../.test-build/lib/sim/event-system.js');
const { createCareerEvent, eventIds } = require('../.test-build/lib/sim/career-events.js');
const { prepareCompetitions } = require('../.test-build/lib/sim/calendar.js');
const Dialog = require('../.test-build/app/components/career-event.js').default;
const { autoPauseReason } = require('../.test-build/lib/auto-progress.js');
const cache = new Map();
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
function samePlayers(actual, expected) { const index=actual.findIndex((p,i)=>JSON.stringify(p)!==JSON.stringify(expected[i]));if(index>=0)assert.deepEqual(actual[index],expected[index]);assert.equal(actual.length,expected.length); }
function fixture(position='SS', games=false) {
  if(!cache.has(position))cache.set(position,e.createGame('event-fixture-'+position,'이벤트검증',position));
  const s=structuredClone(cache.get(position)),p=e.getPlayer(s);s.week=6;
  for(const key of Object.keys(p.stats))p.stats[key]=50;
  p.talent={batting:5,pitching:5};p.reputation=e.reputationScore(p);
  if(!games){s.calendar.events=[];s.calendar.competitions=[];}
  return s;
}
function forceRolls(s, first=[0,1], awake=false) {
  for(let seed=0;seed<100000;seed++){
    const probe={rngStates:{...s.rngStates,events:seed}};
    const a=e.random(probe,'events'),b=e.random(probe,'events');
    if(a>=first[0]&&a<first[1]&&(awake?b<.05:b>=.05)){s.rngStates.events=seed;return;}
  }
  assert.fail('no deterministic event rolls');
}
function answer(s,id,index=0,range=[0,1],awake=false,context={}){
  s.careerEvent=createCareerEvent(id,e.getPlayer(s),s.date,s.week,context);forceRolls(s,range,awake);
  return e.answerCareerEvent(s,s.careerEvent.choices[index].id);
}
function schedule(s,id,date=s.date){
  for(let seed=0;seed<50000;seed++){
    const probe={...s,rngStates:{...s.rngStates,events:seed},eventLedger:s.eventLedger?structuredClone(s.eventLedger):undefined};
    const planned=system.planEventWeek(probe);
    if(planned?.definitionId===id&&planned.date===date){s.rngStates.events=seed;return s;}
  }
  assert.fail('no eligible schedule for '+id+' at '+date);
}
function fullWeek(s){
  const target=s.week+1;
  for(let guard=0;guard<6&&s.week<target;guard++){
    if(s.careerEvent)s=e.answerCareerEvent(s,s.careerEvent.choices[0].id);
    const p=e.getPlayer(s);s=e.advanceWeek(s,p.trainingPolicy,p.stance);
  }
  assert.equal(s.week,target);return s;
}
function withParams(changes,fn){const before={};for(const key of Object.keys(changes)){before[key]=e.params[key];e.params[key]=changes[key];}try{return fn();}finally{Object.assign(e.params,before);}}

test('document catalog contains exactly 60 events, 2-3 actions each, and branch sums of 100%',()=>{
  assert.equal(eventIds.length,60);assert.equal(new Set(eventIds).size,60);
  for(const role of ['SS','SP'])for(const id of eventIds){
    const s=fixture(role),event=createCareerEvent(id,e.getPlayer(s),s.date,s.week,{targetRole:'선발'});
    assert.ok([2,3].includes(event.choices.length));
    for(const c of event.choices){assert.equal(c.outcomes.reduce((n,o)=>n+o.weight,0),100);for(const o of c.outcomes){for(const n of Object.values(o.stats??{}))assert.ok(Number.isFinite(n)&&n<=0,'positive rewards must use training weeks');for(const n of Object.values(o.weeks??{}))assert.ok([3,4,6,8,12].includes(n));}}
  }
});
test('country and center preserve the exact user-specified conditional branches',()=>{
  const s=fixture(),p=e.getPlayer(s);
  const country=createCareerEvent('P08',p,s.date,s.week),center=createCareerEvent('T10',p,s.date,s.week);
  assert.deepEqual(country.choices[0].outcomes.map(o=>o.weight),[5,23.75,23.75,47.5]);
  assert.deepEqual(country.choices[1].outcomes.map(o=>o.weight),[25,25,50]);
  const rest=country.choices[0].outcomes.slice(1).map(o=>o.weight);close(rest.reduce((a,b)=>a+b,0),95);close(rest[0],rest[1]);close(rest[2],2*rest[0]);
  assert.deepEqual(center.choices.map(c=>c.outcomes.map(o=>o.weight)),[[5,95],[50,50]]);
  assert.equal(system.weightedOutcome(center.choices[0].outcomes,.049999).weeks.contact,8);
  assert.equal(system.weightedOutcome(center.choices[0].outcomes,.05).fatigue,10);
  assert.match(system.weightedOutcome(country.choices[0].outcomes,.049999).message,/MVP/);
  assert.equal(system.weightedOutcome(country.choices[0].outcomes,.05).reputation,8);
  assert.equal(system.weightedOutcome(country.choices[0].outcomes,.2875).injury.days,14);
  assert.equal(system.weightedOutcome(country.choices[0].outcomes,.525).reputation,2);
});
test('choice HTML and accessible metadata reveal neither effects nor outcome probabilities',()=>{
  const s=fixture();
  for(const id of eventIds){
    const event=createCareerEvent(id,e.getPlayer(s),s.date,s.week,{targetRole:'선발'});
    const html=renderToStaticMarkup(createElement(Dialog,{event,outcome:null,disabled:false,onChoose(){},onDone(){}}));
    assert.ok(html.includes(event.title));
    assert.ok(!html.includes('event-changes'));assert.ok(!html.includes('outcomes'));
    const readable=html.replace(/<[^>]*>/g,' ')+(html.match(/(?:aria-label|title)="[^"]*"/g)??[]).join(' ');
    assert.ok(!/[+-]\d|\d+%|주분|추천|성공 확률/.test(readable),id);
    for(const c of event.choices)assert.ok(html.includes(c.label));
  }
});
test('normal event rewards equal 15/20 real training days including boundaries, physical splitting and off-role talent',()=>{
  for(const position of ['SS','SP']) {
  const template=e.previewPlayer('reward-reference','검증',position);
  for(const ability of [40,49.9,55,59.9,65,69.9,75,79.9,85,89.9,95])for(const talent of [1,5,10])for(const key of Object.keys(template.stats))for(const weeks of [3,4,6,8,12]){
    const p=structuredClone(template);for(const k of Object.keys(p.stats))p.stats[k]=ability;p.talent={batting:talent,pitching:talent};
    const original=structuredClone(p),reference=structuredClone(p);
    reference.trainingPolicy=e.defaultPolicy(reference.primaryRole);for(const k of Object.keys(reference.trainingPolicy.tickets))reference.trainingPolicy.tickets[k]=0;
    reference.trainingPolicy.tickets[['stamina','recovery','arm'].includes(key)?'physical':key==='bq'?'contact':key]=5;
    for(let day=0;day<weeks*5;day++)e.train(reference,1);
    close(system.eventTrainingReward(p,key,weeks),reference.stats[key]-ability);assert.deepEqual(p,original);
  }}
});
test('multiple stat rewards use the same pre-choice basis and only modify declared targets',()=>{
  const s=fixture(),p=e.getPlayer(s);p.stats.contact=49.9;p.stats.power=49.9;p.stats.speed=49.9;p.stats.defense=49.9;
  const before=structuredClone(s),expected=Object.fromEntries(['contact','power','speed','defense'].map(k=>[k,system.eventTrainingReward(p,k,4)]));
  const n=answer(s,'T10',0,[.05,1]),after=e.getPlayer(n),out=n.careerEventHistory.at(-1);
  for(const [key,amount] of Object.entries(expected))close(after.stats[key]-p.stats[key],amount);
  assert.deepEqual(after.talent,p.talent);assert.deepEqual(after.talentExposure,p.talentExposure);assert.equal(n.date,s.date);assert.equal(n.week,s.week);close(out.fatigue,10);
  for(const key of ['stamina','recovery','arm','bq','velocity','control','movement'])assert.equal(after.stats[key],p.stats[key]);
  assert.deepEqual(before.players,s.players);
});
test('awakening is one result-level draw that replaces every positive effect and preserves other effects',()=>{
  const s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=40;
  const n=answer(s,'T10',0,[0,.05],true),after=e.getPlayer(n),out=n.careerEventHistory.at(-1);
  assert.equal(out.awakened.length,11);for(const key of Object.keys(p.stats)){const gain=system.eventAwakeningReward(p,key,8);close(after.stats[key],40+gain);close(out.stats[key],gain);assert.ok(gain>=4.5&&gain<=100-p.stats[key]);}
  assert.deepEqual(after.talent,p.talent);
  const ordinary=answer(fixture(),'T10',0,[.05,1],true).careerEventHistory.at(-1);
  assert.equal(ordinary.awakened.length,4);for(const key of Object.keys(ordinary.stats))close(ordinary.stats[key],system.eventAwakeningReward(e.getPlayer(fixture()),key,4));close(ordinary.fatigue,10);
});

test('awakening gives all abilities at least three points at 60 and tapers smoothly toward the cap',()=>{
  const s=fixture(),p=e.getPlayer(s);
  for(const [ability,gain] of [[40,4.5],[60,3],[80,1.5],[90,.75],[99,.075],[100,0]]){
    for(const key of Object.keys(p.stats))p.stats[key]=ability;
    const before=structuredClone(p);
    for(const key of Object.keys(p.stats)){
      close(system.eventAwakeningReward(p,key,3),gain);
      assert.ok(system.eventAwakeningReward(p,key,8)>=system.eventTrainingReward(p,key,12));
      assert.ok(system.eventAwakeningReward(p,key,8)<=100-ability);
    }
    assert.deepEqual(p,before);
  }
  for(const key of Object.keys(p.stats))p.stats[key]=60;
  const next=answer(s,'T10',0,[0,.05],true),out=next.careerEventHistory.at(-1);
  assert.equal(out.awakened.length,11);
  for(const key of Object.keys(p.stats)){close(e.getPlayer(next).stats[key],63);close(out.stats[key],3);}
  const capped=fixture();for(const key of Object.keys(e.getPlayer(capped).stats))e.getPlayer(capped).stats[key]=100;
  assert.deepEqual(answer(capped,'T10',0,[0,.05],true).careerEventHistory.at(-1).awakened,[]);
});
test('declines, injuries and fatigue-only outcomes never draw awakening; actual limits and one-time application are preserved',()=>{
  const s=fixture();e.getPlayer(s).stats.contact=1;
  s.careerEvent=createCareerEvent('T01',e.getPlayer(s),s.date,s.week);forceRolls(s,[0,.5],true);
  const expected={rngStates:{...s.rngStates}};e.random(expected,'events');
  const n=e.answerCareerEvent(s,s.careerEvent.choices[0].id),out=n.careerEventHistory.at(-1);
  assert.equal(n.rngStates.events,expected.rngStates.events);assert.equal(out.awakened.length,0);close(out.stats.contact,0);
  assert.throws(()=>e.answerCareerEvent(n,'choice-1'),/없습니다/);assert.throws(()=>e.answerCareerEvent(s,'invalid'),/유효하지/);
  const capped=fixture();for(const key of Object.keys(e.getPlayer(capped).stats))e.getPlayer(capped).stats[key]=98;
  const cap=answer(capped,'T10',0,[0,.05],true).careerEventHistory.at(-1);for(const [key,amount] of Object.entries(cap.stats)){close(amount,system.eventAwakeningReward(e.getPlayer(capped),key,8));assert.ok(amount>=0&&amount<.2);}
  const rest=fixture();e.getPlayer(rest).fatigue=1;close(answer(rest,'P07',1,[0,.5]).careerEventHistory.at(-1).fatigue,-1);
});
test('event effects and reward calculation use only the event RNG and preserve state inputs',()=>{
  const s=fixture(),before=structuredClone(s),n=answer(s,'T04',1);
  for(const key of ['generation','training','match','injury','draft'])assert.equal(n.rngStates[key],before.rngStates[key]);
  assert.deepEqual(s.players,before.players);assert.equal(n.careerEvent,null);assert.equal(n.careerEventHistory.length,1);
  assert.deepEqual(n,e.answerCareerEvent(s,s.careerEvent.choices[1].id));
});
test('youth selection ranks fifteen per field across all grades in September and freezes the announced roster',()=>{
  const s=fixture(),p=e.getPlayer(s);s.date='2027-09-01';p.grade=1;p.reputation=80.1;
  for(const other of s.players)if(other.id!==p.id)other.reputation=1;
  const others=s.players.filter(other=>other.id!==p.id&&!e.isPitcher(other.primaryRole));for(const other of others.slice(0,14))other.reputation=80.2;
  assert.ok(system.tryNationalEvent(s));assert.equal(s.careerEvent.definitionId,'P08');assert.equal(s.nationalTeams[0].roster.length,30);
  const excluded=fixture(),me=e.getPlayer(excluded);excluded.date='2027-09-01';for(const other of excluded.players)other.reputation=1;me.reputation=80.1;
  for(const other of excluded.players.filter(o=>o.id!==me.id&&!e.isPitcher(o.primaryRole)).slice(0,15))other.reputation=80.2;
  assert.equal(system.tryNationalEvent(excluded),false);me.reputation=100;assert.equal(system.tryNationalEvent(excluded),false);
});

test('youth offers ignore weekly chance, occur once per September and never after career end',()=>{
  const s=fixture(),p=e.getPlayer(s);p.reputationBonus=100;p.reputation=e.reputationScore(p);assert.equal(system.tryNationalEvent(s),false);s.date='2027-09-01';
  assert.ok(withParams({'events.weekly_chance':0},()=>system.tryNationalEvent(s)));forceRolls(s,[0,.25]);
  let n=e.answerCareerEvent(s,'choice-1');assert.equal(system.tryNationalEvent(n),false);n.date='2028-09-01';n.calendar.seasonYear=2028;e.getPlayer(n).grade=2;assert.ok(system.tryNationalEvent(n));
  n.careerEvent=null;n.phase='ended';assert.equal(system.tryNationalEvent(n),false);
});

test('national injury lasts 14 days, blocks training, and never shortens an existing worse injury',()=>{
  const s=fixture(),p=e.getPlayer(s);p.grade=2;s.eventLedger={recent:[],centerGrades:[],nationalGrades:[2],competitions:[],games:[]};
  const injured=answer(s,'P08',0,[.2875,.525]),q=e.getPlayer(injured);assert.equal(q.injury.unavailableUntil,e.addDays(s.date,14));assert.equal(q.injury.severity,'moderate');
  const next=withParams({'events.weekly_chance':0},()=>e.advanceWeek(injured,q.trainingPolicy,q.stance));assert.equal(next.report.fatigue.training,0);assert.deepEqual(e.getPlayer(next).stats,q.stats);
  p.injury={severity:'severe',startDate:s.date,unavailableUntil:e.addDays(s.date,30),penaltyRemaining:9,originalPenalty:9,penaltyRecoverDays:40};
  const worse=e.getPlayer(answer(s,'P08',0,[.2875,.525])).injury;assert.equal(worse.unavailableUntil,p.injury.unavailableUntil);assert.equal(worse.penaltyRemaining,9);assert.equal(worse.penaltyRecoverDays,40);
});
test('training conditions, rest-compatible conversations, recent five exclusion and center yearly limit are enforced',()=>{
  const s=fixture(),p=e.getPlayer(s);const ids=()=>system.eventCandidates(s,s.date).map(o=>o.definitionId);
  assert.ok(ids().includes('T01'));assert.ok(!ids().includes('T03'));assert.ok(!ids().includes('T09'));
  p.fatigue=40;assert.ok(ids().includes('T09'));system.eventLedger(s).centerGrades.push(p.grade);assert.ok(!ids().includes('T10'));
  system.eventLedger(s).recent=['T01','T02','T04','T08','P01'];assert.ok(!ids().includes('T01'));
  p.trainingPolicy=e.policyForMode(p.trainingPolicy,'rest');assert.ok(ids().includes('P02')&&ids().includes('P07'));assert.ok(!ids().some(id=>id.startsWith('T')));
  p.injury={severity:'moderate',startDate:s.date,unavailableUntil:e.addDays(s.date,14),penaltyRemaining:3,originalPenalty:3,penaltyRecoverDays:10};assert.ok(!ids().includes('P01'));assert.ok(ids().includes('P07'));
});
test('tournament candidates require actual entry, survival and an unused competition allowance',()=>{
  const s=fixture('SS',true),p=e.getPlayer(s),c=s.calendar.competitions.find(c=>c.kind==='tournament');s.date=c.startDate;prepareCompetitions(s.calendar,s.date,s.seed);
  const ids=()=>system.eventCandidates(s,s.date).filter(o=>o.competitionId===c.id);
  assert.ok(ids().length>0);system.eventLedger(s).competitions.push(c.id);assert.equal(ids().length,0);s.eventLedger.competitions=[];
  const opponents=c.participantTeamIds.filter(id=>id!==p.teamId),sample=s.calendar.events[0];s.calendar.events.push({...structuredClone(sample),id:'elimination-fixture',competitionId:c.id,homeTeamId:p.teamId,awayTeamId:opponents[0],date:s.date,status:'completed',advancingTeamId:opponents[0]});
  assert.equal(ids().length,0);s.calendar.events.pop();c.participantTeamIds=c.participantTeamIds.filter(id=>id!==p.teamId);assert.equal(ids().length,0);
});
test('role event changes position only on success, retains eligibility and replaces duplicate old offers',()=>{
  const s=fixture(),p=e.getPlayer(s);for(const key of ['velocity','control','movement'])p.stats[key]=90;
  const n=answer(s,'P06',0,[0,.7],false,{targetRole:'선발'}),q=e.getPlayer(n);assert.equal(q.primaryRole,'선발');assert.equal(q.position,'SP');assert.ok(q.eligiblePositions.includes('SS')&&q.eligiblePositions.includes('SP'));assert.equal(q.roleOffer,null);
  assert.deepEqual(n.careerEventHistory.at(-1).positionChange,{from:'SS',to:'SP'});
  assert.equal(e.getPlayer(answer(s,'P06',0,[.7,1],false,{targetRole:'선발'})).position,'SS');
});
test('weekly opportunity is one-shot and pauses before future training, without applying a reward until chosen',()=>{
  const s=fixture(),p=e.getPlayer(s),date=e.addDays(s.date,2);schedule(s,'T04',date);const original=structuredClone(s),n=e.advanceWeek(s,p.trainingPolicy,p.stance);
  assert.equal(n.date,date);assert.equal(n.week,s.week);assert.equal(n.careerEvent.definitionId,'T04');assert.equal(n.weekProgress.day.phase,'players');assert.equal(autoPauseReason(s,n),null);
  const reference=structuredClone(p);e.train(reference,1);e.train(reference,1);for(const key of Object.keys(p.stats))close(e.getPlayer(n).stats[key],reference.stats[key]);
  assert.throws(()=>e.advanceWeek(n,p.trainingPolicy,p.stance),/이벤트/);assert.deepEqual(s,original);
  const resumed=fullWeek(e.answerCareerEvent(n,n.careerEvent.choices[1].id));assert.equal(resumed.week,s.week+1);assert.equal(resumed.weekProgress,undefined);assert.equal(resumed.careerEventHistory.length,1);
});
test('resuming a neutral training checkpoint exactly matches an uninterrupted week with no repeated days or RNG draws',()=>{
  const s=fixture(),p=e.getPlayer(s);schedule(s,'T04',e.addDays(s.date,2));const baseline=withParams({'events.weekly_chance':0},()=>e.advanceWeek(s,p.trainingPolicy,p.stance));
  const paused=e.advanceWeek(s,p.trainingPolicy,p.stance);paused.careerEvent.choices[0].outcomes=[{weight:100,message:'중립 결과'}];
  const resumed=fullWeek(e.answerCareerEvent(paused,paused.careerEvent.choices[0].id));
  samePlayers(resumed.players,baseline.players);assert.deepEqual(resumed.calendar,baseline.calendar);assert.deepEqual(resumed.teams,baseline.teams);assert.deepEqual(resumed.history,baseline.history);assert.deepEqual(resumed.report,baseline.report);
  for(const key of ['generation','training','match','injury','draft'])assert.equal(resumed.rngStates[key],baseline.rngStates[key]);
});
function gameFixture(position){const s=fixture(position,true),p=e.getPlayer(s),g=s.calendar.events.find(g=>[g.homeTeamId,g.awayTeamId].includes(p.teamId));s.date=g.date;s.calendar.events=[g];s.calendar.competitions=[];for(const k of Object.keys(p.stats))p.stats[k]=90;p.reputation=e.reputationScore(p);return s;}
test('actual batter and pitcher scenes pause before the PA, retain context, consume one effect and resume without duplicated records',()=>{
  for(const [position,id] of [['SS','G01'],['SP','G04']]){
    const s=gameFixture(position),p=e.getPlayer(s);schedule(s,id);const baseline=withParams({'events.weekly_chance':0},()=>e.advanceWeek(s,p.trainingPolicy,p.stance));
    const paused=e.advanceWeek(s,p.trainingPolicy,p.stance);assert.equal(paused.careerEvent.definitionId,id);assert.ok(paused.careerEvent.scene);assert.equal(paused.matchProgress.ready,true);assert.equal(paused.calendar.events[0].status,'inProgress');
    const before=structuredClone(paused);paused.careerEvent.choices[0].outcomes=[{weight:100,message:'중립 결과',match:{hit:0}}];const answered=e.answerCareerEvent(paused,paused.careerEvent.choices[0].id);assert.ok(answered.matchEffect);assert.equal(answered.date,before.date);assert.deepEqual(answered.calendar.events[0].boxScore,before.calendar.events[0].boxScore);
    const resumed=fullWeek(answered);assert.equal(resumed.matchEffect,undefined);assert.equal(resumed.matchProgress,undefined);assert.equal(resumed.careerEventHistory.length,1);samePlayers(resumed.players,baseline.players);assert.deepEqual(resumed.teams,baseline.teams);assert.deepEqual(resumed.calendar,baseline.calendar);
    for(const key of ['training','match','injury','draft'])assert.equal(resumed.rngStates[key],baseline.rngStates[key]);
  }
});
test('a benched pitcher never sees a mound choice and a lost scheduled opportunity is not rerolled',()=>{
  const s=gameFixture('SP'),p=e.getPlayer(s);for(const other of s.players.filter(other=>other.teamId===p.teamId))for(const key of Object.keys(other.stats))other.stats[key]=100;for(const key of Object.keys(p.stats))p.stats[key]=1;
  schedule(s,'G04');const n=e.advanceWeek(s,p.trainingPolicy,p.stance);assert.equal(n.careerEvent,null);assert.equal(e.getPlayer(n).seasonStats.pitching.BF,0);assert.equal(n.week,s.week+1);
});
test('national call-up has priority over a club scene and participation reserves domestic appearances',()=>{
  const s=gameFixture('SP'),p=e.getPlayer(s);p.grade=2;p.reputationBonus=100;p.reputation=100;s.date='2027-09-01';s.calendar.events[0].date=s.date;s.calendar.trainingDays=Array.from({length:7},(_,i)=>e.addDays(s.date,i));schedule(s,'G04');
  const called=e.advanceWeek(s,p.trainingPolicy,p.stance);assert.equal(called.careerEvent.definitionId,'P08');assert.equal(called.matchProgress,undefined);
  forceRolls(called,[.2875,.525]);const injured=e.answerCareerEvent(called,'choice-1'),resumed=fullWeek(injured);
  assert.equal(e.getPlayer(resumed).seasonStats.pitching.BF,0);assert.equal(injured.careerEventHistory[0].definitionId,'P08');assert.equal(injured.careerEventHistory[0].injury,undefined);assert.ok(!resumed.careerEventHistory.some(o=>o.definitionId==='G04'));
});
test('reputation earned outside September cannot trigger an out-of-season youth invitation',()=>{
  const s=gameFixture('SP'),p=e.getPlayer(s);p.grade=2;p.reputationBonus=-50;p.reputation=e.reputationScore(p);schedule(s,'G04');
  const scene=e.advanceWeek(s,p.trainingPolicy,p.stance);assert.equal(scene.careerEvent.definitionId,'G04');
  scene.careerEvent.choices[0].outcomes=[{weight:100,message:'새로운 평가',reputation:100}];
  const resumed=fullWeek(e.answerCareerEvent(scene,'choice-1'));assert.equal(resumed.calendar.events[0].status,'completed');assert.equal(resumed.matchProgress,undefined);assert.ok(!resumed.careerEventHistory.some(row=>row.definitionId==='P08'));
});

test('match probability changes are percentage points with valid conditional hit-type intervals',()=>{
  const base={bb:.2,hit:.3,hr:.1,k:.4,double:.2,triple:.1};const changed=system.applyMatchEffect(base,{hit:.02,bb:-.025,hr:.04,k:-.02});close(changed.hit,.32);close(changed.bb,.175);close(changed.hr,.14);close(changed.k,.38);
  const bounded=system.applyMatchEffect(base,{hit:2,bb:-2,hr:2,k:2});assert.equal(bounded.hit,1);assert.equal(bounded.bb,0);assert.equal(bounded.k,1);close(bounded.hr+bounded.double+bounded.triple,1);assert.deepEqual(base,{bb:.2,hit:.3,hr:.1,k:.4,double:.2,triple:.1});
});
test('MVP gives eight weeks of growth while awakening applies its floor without changing the award',()=>{
  for(const position of ['SS','SP']) {
    const s=fixture(position),p=e.getPlayer(s);
    const n=answer(s,'P08',0,[0,.05]),out=n.careerEventHistory.at(-1);
    assert.match(out.message,/MVP/);assert.equal(e.getPlayer(n).reputationBonus,10);assert.equal(out.awakened.length,0);
    const html=renderToStaticMarkup(createElement(Dialog,{event:null,outcome:out,disabled:false,onChoose(){},onDone(){}}));assert.ok(html.includes('MVP'));assert.ok(html.includes('event-changes'));
    const core=position==='SP'?['velocity','control','movement']:['contact','power','speed','defense'];
    for(const key of core)close(out.stats[key],system.eventTrainingReward(p,key,8));
    const awake=answer(s,'P08',0,[0,.05],true).careerEventHistory.at(-1);
    assert.match(awake.message,/MVP/);assert.equal(awake.awakened.length,core.length);for(const key of core)close(awake.stats[key],system.eventAwakeningReward(p,key,8));
  }
});
test('MVP and center retain normal training rewards while awakening tapers at high skills',()=>{
  for(const ability of [40,60,70,80,90,100])for(const id of ['P08','T10'])for(const awake of [false,true]) {
    const s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=ability;
    const out=answer(s,id,0,[0,.05],awake).careerEventHistory.at(-1);
    for(const [key,gain] of Object.entries(out.stats)){
      close(gain,awake?system.eventAwakeningReward(p,key,8):system.eventTrainingReward(p,key,8));
      if(awake&&ability>=60)close(gain,3*(100-ability)/40);
      if(!awake&&ability>=80)assert.ok(gain<.3);if(!awake&&ability>=90)assert.ok(gain<.13);if(ability===100)close(gain,0);
    }
  }
});
test('an unchosen pre-upgrade event cannot retain its fixed +12 bonus and settled history is preserved',()=>{
  const s=fixture(),p=e.getPlayer(s);s.careerEvent=createCareerEvent('T10',p,s.date,s.week);delete s.careerEvent.rewardVersion;
  s.careerEvent.choices[0].outcomes=[{weight:100,message:'old fixed reward',stats:Object.fromEntries(Object.keys(p.stats).map(key=>[key,12]))}];
  const settled={id:'settled',definitionId:'T10',kind:'training',title:'과거',date:'2027-01-01',choice:'기록',message:'과거 결과',awakened:[],stats:{contact:12},reputation:0,fatigue:0};
  s.careerEventHistory=[settled];forceRolls(s,[0,.05]);const n=e.answerCareerEvent(s,'choice-1');
  assert.deepEqual(n.careerEventHistory[0],settled);for(const [key,gain] of Object.entries(n.careerEventHistory.at(-1).stats))close(gain,system.eventTrainingReward(p,key,8));
  assert.equal(s.careerEventHistory.length,1);
});
