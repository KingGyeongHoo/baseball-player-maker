import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),events=require('../.test-build/lib/sim/event-system.js');
const save=require('../.test-build/lib/career-save.js'),opportunities=require('../.test-build/lib/sim/career-opportunities.js');
const template=e.createGame('winter-training-center','겨울훈련','SS');
const fixture=()=>{const s=structuredClone(template);s.date='2027-01-05';s.calendar.trainingDays=[];s.calendar.events=[];s.calendar.competitions=[];s.lastCareerEventWeek=s.week;return s;};

test('every high-school grade receives the winter center offer in January or February, even while resting or injured',()=>{
 for(const grade of [1,2,3])for(const month of ['01','02']){
  const s=fixture(),p=e.getPlayer(s);s.date=`2027-${month}-05`;p.grade=grade;p.trainingPolicy=e.policyForMode(p.trainingPolicy,'rest');p.forcedRest=true;
  p.injury={severity:'mild',startDate:s.date,unavailableUntil:e.addDays(s.date,10),originalPenalty:1,penaltyRemaining:1,penaltyRecoverDays:7};
  const rng={...s.rngStates};assert.equal(events.tryWinterTrainingCenter(s),true);assert.equal(s.careerEvent.definitionId,'T10');assert.match(s.careerEvent.description,/프로 선수가 운영/);assert.deepEqual(s.eventLedger.centerGrades,[grade]);assert.deepEqual(s.rngStates,rng);
 }
});

test('winter invitations are not duplicated by pending choices, answers or reloading, and the next grade gets a fresh offer',()=>{
 let s=fixture();assert.equal(events.tryWinterTrainingCenter(s),true);assert.equal(events.tryWinterTrainingCenter(s),false);
 s=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.equal(events.tryWinterTrainingCenter(s),false);
 s=e.answerCareerEvent(s,s.careerEvent.choices[1].id);assert.equal(events.tryWinterTrainingCenter(s),false);
 s=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;s.date='2027-02-25';assert.equal(events.tryWinterTrainingCenter(s),false);
 e.getPlayer(s).grade=2;s.date='2028-01-05';assert.equal(events.tryWinterTrainingCenter(s),true);assert.deepEqual(s.eventLedger.centerGrades,[1,2]);
});

test('non-winter dates, non-school careers and unresolved decisions keep their current state',()=>{
 const cases=[s=>{s.date='2027-03-01';},s=>{s.date='2027-12-20';},s=>{s.careerMode='pro';},s=>{s.careerMode='college';},s=>{s.phase='ended';},s=>{s.careerNotice={id:'existing'};},s=>{s.careerEvent={id:'existing'};},s=>{s.pendingEventOutcome={id:'existing'};},s=>{e.getPlayer(s).roleOffer='선발';},s=>{s.matchProgress={gameId:'existing'};}];
 for(const configure of cases){const s=fixture();configure(s);const before=JSON.stringify(s);assert.equal(events.tryWinterTrainingCenter(s),false);assert.equal(JSON.stringify(s),before);}
});

test('a real week crossing New Year guarantees T10 despite zero event chance and continues once after loading',()=>{
 const old=e.params['events.weekly_chance'];e.params['events.weekly_chance']=0;
 try{
  let s=fixture();s.date='2027-12-31';s.calendar.seasonEnd='2027-12-31';opportunities.opportunityState(s).transferRollYears=[2027];
  const input=s,before=JSON.stringify(input),p=e.getPlayer(s);s=e.advanceWeek(input,p.trainingPolicy,p.stance);
  assert.equal(JSON.stringify(input),before);assert.equal(s.date,'2028-01-01');assert.equal(e.getPlayer(s).grade,2);assert.equal(s.careerEvent.definitionId,'T10');assert.ok(s.weekProgress);
  s=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;s=e.answerCareerEvent(s,s.careerEvent.choices[1].id);
  s=e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);assert.equal(s.careerEvent,null);assert.equal(s.weekProgress,undefined);assert.equal(s.careerEventHistory.filter(event=>event.definitionId==='T10').length,1);
  s=e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);assert.equal(s.careerEvent,null);assert.equal(s.careerEventHistory.filter(event=>event.definitionId==='T10').length,1);
 }finally{e.params['events.weekly_chance']=old;}
});
