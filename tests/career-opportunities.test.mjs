import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const o = require('../.test-build/lib/sim/career-opportunities.js');
const system = require('../.test-build/lib/sim/event-system.js');
const { autoPauseReason } = require('../.test-build/lib/auto-progress.js');
const { playerSeasons } = require('../.test-build/lib/player-records.js');
const Dialog = require('../.test-build/app/components/career-event.js').default;
e.params['events.weekly_chance'] = 0;
e.params['injury.training_base_risk'] = 0;
const base = e.createGame('opportunities-fixture', '겸업검증', 'SS');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
function fixture(grade=1) {
  const s=structuredClone(base),p=e.getPlayer(s);p.grade=grade;s.week=4;
  s.date=`${2026+grade}-03-01`;s.calendar=e.calendar(2026+grade);s.calendar.events=[];s.calendar.competitions=[];
  for(const key of Object.keys(p.stats))p.stats[key]=55;
  for(const key of Object.keys(p.trainingPolicy.tickets))p.trainingPolicy.tickets[key]=0;
  s.eventLedger={recent:[],centerGrades:[],nationalGrades:[2,3],competitions:[],games:[]};
  return s;
}
const step = s => e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);
function complete(s) {
  const target=s.week+1;
  for(let i=0;i<12&&s.week<target;i++) {
    if(s.careerEvent)s=e.answerCareerEvent(s,s.careerEvent.choices.at(-1).id);
    s=step(s);
  }
  assert.equal(s.week,target);return s;
}
function roll(s, success) {
  const ledger=o.opportunityState(s);
  for(let seed=1;seed<100000;seed++) {
    const probe={rngStates:{...s.rngStates,events:seed}};
    if((e.random(probe,'events')<.3)===success){ledger.rng=seed;return;}
  }
  assert.fail('missing roll');
}
function winter(s, success=true) {
  s.date=`${s.calendar.seasonYear}-12-01`;roll(s,success);return s;
}
function acceptTwoWay(s) { o.opportunityState(s).qualifiedWeeks=2;assert.equal(o.tryCareerOpportunity(s),true);return e.answerCareerEvent(s,'accept'); }

test('coach proposal requires both OVRs >=55 for two complete weeks and pauses before the next day',()=>{
  let s=fixture();s=step(s);assert.ok(!s.careerEvent);assert.equal(o.opportunityState(s).qualifiedWeeks,1);
  s=step(s);assert.equal(o.opportunityState(s).qualifiedWeeks,2);const p=e.getPlayer(s),before=structuredClone(p);
  const paused=step(s);assert.equal(paused.careerEvent.definitionId,'S01');assert.equal(paused.week,s.week);assert.equal(paused.date,s.date);
  assert.equal(paused.weekProgress.remainingDays,7);assert.deepEqual(e.getPlayer(paused),before);assert.equal(paused.report.fatigue.training,0);
  const accepted=e.answerCareerEvent(paused,'accept'),q=e.getPlayer(accepted);
  assert.equal(q.position,'SS');assert.equal(q.primaryRole,p.primaryRole);assert.deepEqual(q.trainingPolicy,p.trainingPolicy);
  assert.ok(q.twoWay);assert.equal(q.teamId,p.teamId);assert.equal(q.reputation, e.reputationScore(p));
  assert.match(e.positionLabel(q),/\/유격수$/);assert.ok(q.eligiblePositions.includes('SP')&&q.eligiblePositions.includes('SS'));
  const resumed=complete(accepted);assert.equal(resumed.careerEventHistory.length,1);assert.equal(resumed.weekProgress,undefined);
});

test('current-school proposals can arrive in every grade, but never after the senior draft',()=>{
  for(const grade of [1,2,3]) {
    let s=acceptTwoWay(fixture(grade));assert.equal(e.getPlayer(s).grade,grade);assert.equal(e.getPlayer(s).teamId,0);
    assert.equal(o.tryCareerOpportunity(s),false);
    s=fixture(grade);o.opportunityState(s).qualifiedWeeks=2;e.getPlayer(s).stats.velocity=54.99;assert.equal(o.tryCareerOpportunity(s),false);
    assert.equal(o.opportunityState(s).qualifiedWeeks,0);
  }
  const s=fixture(3);s.date=s.calendar.draftDate;o.opportunityState(s).qualifiedWeeks=2;assert.equal(o.tryCareerOpportunity(s),false);
});

test('falling below threshold resets the streak; declining blocks this grade but permits the next',()=>{
  let s=fixture();o.opportunityState(s).qualifiedWeeks=2;e.getPlayer(s).stats.power=54;o.observeTwoWayQualification(s);
  assert.equal(o.opportunityState(s).qualifiedWeeks,0);e.getPlayer(s).stats.power=55;assert.equal(o.tryCareerOpportunity(s),false);
  o.opportunityState(s).qualifiedWeeks=2;o.tryCareerOpportunity(s);s=e.answerCareerEvent(s,'decline');assert.equal(o.tryCareerOpportunity(s),false);
  e.getPlayer(s).grade=2;assert.equal(o.tryCareerOpportunity(s),true);
  assert.equal(system.suggestedRole(e.getPlayer(acceptTwoWay(fixture()))),undefined);
});

test('pitcher-origin acceptance preserves the pitcher role and proposes a field position',()=>{
  const s=fixture(),p=e.getPlayer(s);e.assignRole(p,'선발');const n=acceptTwoWay(s),q=e.getPlayer(n);
  assert.equal(q.position,'SP');assert.equal(q.twoWay.pitchingPosition,'SP');assert.equal(q.twoWay.nextAssignment,'pitching');
  assert.match(e.positionLabel(q),/^선발\//);assert.ok(q.eligiblePositions.includes(q.twoWay.battingPosition));
});

test('two-way reputation is earned by actual participation on both sides and retained at promotion',()=>{
  const s=acceptTwoWay(fixture()),p=e.getPlayer(s);const initial=e.reputationScore(p);
  p.seasonStats.batting.PA=20;close(e.reputationScore(p),initial);
  p.seasonStats.pitching.BF=5;close(e.reputationScore(p),initial+1);
  p.seasonStats.pitching.BF=15;close(e.reputationScore(p),initial+3);e.updateReputation(s);
  assert.equal(p.twoWay.reputationBonus,3);e.promote(s);assert.equal(e.getPlayer(s).twoWay.reputationBonus,3);
  const q=e.getPlayer(s),without=structuredClone(q);without.twoWay.reputationBonus=0;without.seasonStats=e.emptyRecord();close(e.reputationScore(q)-e.reputationScore(without),3);
});

test('two-way lineup alternates sides across completed games and adds workload only after both kinds of appearance',()=>{
  let s=acceptTwoWay(fixture()),p=e.getPlayer(s);
  for(const key of Object.keys(p.stats))p.stats[key]=80;
  p.twoWay.pitchingPosition='SP';p.twoWay.nextAssignment='pitching';
  const template=base.calendar.events[0];
  s.calendar.events=[0,1].map(i=>({...structuredClone(template),id:`two-way-${i}`,date:e.addDays(s.date,i),homeTeamId:0,awayTeamId:1,status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}}));
  s.calendar.trainingDays=[];
  const roster=s.players.filter(q=>q.teamId===0),pitching=e.lineup(roster,s.date);assert.ok(!pitching.field.includes(p));assert.ok(pitching.pitchers.includes(p));
  const n=step(s),q=e.getPlayer(n);assert.ok(!n.careerEvent);assert.equal(n.calendar.events[0].status,'completed');assert.equal(n.calendar.events[1].status,'completed');
  assert.ok(n.report.records.pitching.BF>0);assert.ok(n.report.records.batting.PA>0);assert.equal(q.twoWay.nextAssignment,'pitching');
  assert.ok(n.report.messages.some(text=>text.includes('추가 피로')));
  const f=n.report.fatigue;close(n.report.fatigueBefore+f.training+f.game-f.recovered+(f.events??0),n.report.fatigueAfter);
  close(f.game,f.days.reduce((sum,day)=>sum+day.game,0));
  const rest=e.policyForMode(q.trainingPolicy,'rest'),r=e.advanceWeek(n,rest,q.stance);
  assert.equal(r.report.fatigue.game,0);assert.ok(!r.report.messages.some(text=>text.includes('추가 피로')));
});

test('a failed winter roll happens once per winter, preserves existing RNG streams, and can succeed next winter',()=>{
  let s=winter(fixture(),false);const rng={...s.rngStates};assert.equal(o.tryCareerOpportunity(s),false);
  assert.deepEqual(s.rngStates,rng);const used=o.opportunityState(s).rng;
  s.date='2027-12-15';assert.equal(o.tryCareerOpportunity(s),false);assert.equal(o.opportunityState(s).rng,used);
  e.getPlayer(s).grade=2;s.calendar=e.calendar(2028);s.date='2028-12-01';roll(s,true);assert.equal(o.tryCareerOpportunity(s),true);
  assert.equal(s.careerEvent.definitionId,'S02');assert.deepEqual(o.opportunityState(s).transferRollYears,[2027,2028]);
});

test('pausing a two-way game never toggles assignments or charges the weekly fatigue twice',()=>{
  let s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=80;
  o.opportunityState(s).qualifiedWeeks=2;
  s.calendar.events=[0,1].map(i=>({...structuredClone(base.calendar.events[0]),id:`checkpoint-${i}`,date:e.addDays(s.date,i),homeTeamId:0,awayTeamId:1,status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}}));
  s=step(s);s=e.answerCareerEvent(s,'accept');p=e.getPlayer(s);p.twoWay.pitchingPosition='SP';p.twoWay.nextAssignment='pitching';
  const baseline=complete(structuredClone(s));
  s.weekProgress.opportunity={definitionId:'G04',date:s.date,gameId:s.calendar.events[0].id};
  const paused=step(s);assert.equal(paused.careerEvent.definitionId,'G04');assert.equal(e.getPlayer(paused).twoWay.nextAssignment,'pitching');assert.equal(paused.calendar.events[0].status,'inProgress');
  paused.careerEvent.choices[0].outcomes=[{weight:100,message:'neutral'}];
  const resumed=complete(e.answerCareerEvent(paused,paused.careerEvent.choices[0].id));
  const mismatch=resumed.players.findIndex((q,i)=>JSON.stringify(q)!==JSON.stringify(baseline.players[i]));
  if(mismatch>=0)assert.deepEqual(resumed.players[mismatch],baseline.players[mismatch]);
  assert.deepEqual(resumed.calendar.events,baseline.calendar.events);assert.deepEqual(resumed.report.fatigue,baseline.report.fatigue);
  assert.equal(e.getPlayer(resumed).twoWay.nextAssignment,'pitching');assert.equal(resumed.report.messages.filter(x=>x.includes('추가 피로')).length,1);
});

test('independent 30% winter rolls allow about 49% of careers to receive no transfer offer',()=>{
  let first=0,none=0;
  // Small worlds exercise the production selector without generating thousands of worlds.
  for(let i=0;i<2000;i++) {
    const s={...base,seed:`winter-distribution-${i}`,teams:base.teams.slice(0,3),players:base.players.filter(p=>p.teamId<3).map(p=>({...p})),careerOpportunities:undefined};
    s.calendar={...base.calendar,seasonYear:2027};s.date='2027-12-01';const p=e.getPlayer(s);p.grade=1;
    if(o.tryCareerOpportunity(s)){first++;continue;}
    p.grade=2;s.calendar={...s.calendar,seasonYear:2028};s.date='2028-12-01';
    if(!o.tryCareerOpportunity(s))none++;
  }
  assert.ok(Math.abs(first/2000-.3)<.035,`first ${first/2000}`);assert.ok(Math.abs(none/2000-.49)<.035,`none ${none/2000}`);
});

test('transfer offers are unrelated to two-way qualification; declining has no penalty or repeated offer',()=>{
  let s=winter(fixture());const p=e.getPlayer(s);p.stats.velocity=p.stats.control=p.stats.movement=15;
  assert.equal(o.tryCareerOpportunity(s),true);assert.equal(s.careerEvent.transferOffers.length,2);
  assert.ok(s.careerEvent.transferOffers.every(item=>!item.twoWay&&item.teamId!==p.teamId));
  const before=structuredClone(p);s=e.answerCareerEvent(s,'stay');assert.equal(e.getPlayer(s).teamId,before.teamId);assert.deepEqual(e.getPlayer(s).stats,before.stats);
  assert.equal(o.opportunityState(s).pendingTransfer,undefined);assert.equal(s.careerEventHistory.at(-1).fatigue,0);assert.equal(o.tryCareerOpportunity(s),false);
  s.date='2028-12-01';s.calendar=e.calendar(2028);e.getPlayer(s).grade=2;assert.equal(o.tryCareerOpportunity(s),false);
});

test('accepting transfer schedules January join; archives retain the old school and NPCs and world count stay intact',()=>{
  let s=winter(fixture());o.tryCareerOpportunity(s);const event=s.careerEvent,offer=event.transferOffers.find(x=>x.kind==='playingTime');
  const original=e.getPlayer(s),oldSchool=s.teams[original.teamId].name;original.seasonStats.batting.PA=20;original.seasonStats.batting.H=7;
  s=e.answerCareerEvent(s,`transfer-${offer.teamId}`);assert.equal(e.getPlayer(s).teamId,original.teamId);assert.equal(s.careerEventHistory.at(-1).transfer.status,'scheduled');
  s.date='2027-12-31';s=step(s);const p=e.getPlayer(s);
  assert.equal(s.date,'2028-01-01');assert.equal(s.weekProgress.remainingDays,6);assert.equal(p.grade,2);assert.equal(p.teamId,offer.teamId);
  assert.equal(p.career[0].schoolName,oldSchool);assert.equal(p.career[0].records.batting.H,7);assert.deepEqual(p.seasonStats,e.emptyRecord());
  assert.equal(s.players.length,3000);assert.equal(s.players.filter(q=>q.id!==p.id&&q.grade>1&&q.teamId===offer.teamId).length,20);
  assert.deepEqual(p.stats,original.stats);assert.equal(p.transferAdaptation.weeksRemaining,2);assert.equal(s.careerEventHistory.at(-1).fatigue,3);
  assert.ok(autoPauseReason(base,s));assert.equal(o.joinPendingTransfer(s),false);
  const beforeFatigue=p.fatigue;s=complete(s);assert.equal(s.careerEventHistory.filter(x=>x.definitionId==='S02_JOIN').length,1);assert.ok(e.getPlayer(s).fatigue<=beforeFatigue);
  assert.equal(e.getPlayer(s).transferAdaptation.weeksRemaining,2);assert.equal(playerSeasons(e.getPlayer(s),2028)[0].schoolName,oldSchool);
});

test('strong-school coaching respects training slowdown and 5% awakening instead of giving fixed stat points',()=>{
  for(const awakening of [false,true]) {
    let s=winter(fixture());o.tryCareerOpportunity(s);const offer=s.careerEvent.transferOffers.find(x=>x.kind==='strong');
    s=e.answerCareerEvent(s,`transfer-${offer.teamId}`);const p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=75;p.stats.contact=70;
    const expected=system.eventTrainingReward(p,'contact',awakening?6:3);
    const ledger=o.opportunityState(s);
    for(let seed=1;seed<100000;seed++){const probe={rngStates:{...s.rngStates,events:seed}};if((e.random(probe,'events')<.05)===awakening){ledger.rng=seed;break;}}
    s.date='2028-01-01';e.promote(s);assert.equal(o.joinPendingTransfer(s),true);
    close(e.getPlayer(s).stats.contact-70,expected);assert.ok(expected<1);assert.equal(s.careerEventHistory.at(-1).awakened.includes('contact'),awakening);
  }
});

test('adaptation reduces actual growth to 90% and expires after two training weeks, not resting or offseason weeks',()=>{
  let s=fixture(),p=e.getPlayer(s);p.trainingPolicy=e.defaultPolicy(p.primaryRole);p.transferAdaptation={schoolId:0,weeksRemaining:2};
  const control=structuredClone(p);delete control.transferAdaptation;const before={...p.stats};e.train(control,1);e.train(p,1);
  for(const key of Object.keys(p.stats))close(p.stats[key]-before[key],.9*(control.stats[key]-before[key]));
  assert.deepEqual(p.talentExposure,control.talentExposure);
  const rest=e.policyForMode(p.trainingPolicy,'rest');s=e.advanceWeek(s,rest,p.stance);assert.equal(e.getPlayer(s).transferAdaptation.weeksRemaining,2);
  e.getPlayer(s).trainingPolicy=e.defaultPolicy(p.primaryRole);s=complete(s);assert.equal(e.getPlayer(s).transferAdaptation.weeksRemaining,1);
  s=complete(s);assert.equal(e.getPlayer(s).transferAdaptation,undefined);
});

test('special offer UI keeps effects hidden until choice and shows school context and scheduled result clearly',()=>{
  let s=winter(fixture());o.tryCareerOpportunity(s);const event=s.careerEvent;
  const render=(event,outcome)=>renderToStaticMarkup(createElement(Dialog,{event,outcome,disabled:false,onChoose(){},onDone(){}}));
  const before=render(event,null);assert.match(before,/팀 전력/);assert.ok(!before.includes('90%')&&!before.includes('피로 +3')&&!before.includes('30%'));
  const offer=event.transferOffers[0];s=e.answerCareerEvent(s,`transfer-${offer.teamId}`);const after=render(null,s.careerEventHistory.at(-1));
  assert.match(after,/2028.01.01/);assert.match(after,/합류 예정/);
  const dual=acceptTwoWay(fixture());const outcome=render(null,dual.careerEventHistory.at(-1));assert.match(outcome,/투타 겸업 시작/);assert.ok(!outcome.includes("20%"));
});
