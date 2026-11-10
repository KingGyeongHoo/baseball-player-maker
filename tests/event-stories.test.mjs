import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const school=require('../.test-build/lib/sim/event-catalog.js');
const pro=require('../.test-build/lib/sim/pro-event-catalog.js');
const system=require('../.test-build/lib/sim/event-system.js');
const runtime=require('../.test-build/lib/sim/pro-event-runtime.js');
const {eligibleStory}=require('../.test-build/lib/sim/event-stories.js');
const storage=require('../.test-build/lib/career-save.js');
const cache=new Map();
function fixture(mode){
 if(!cache.has(mode)){
  const s=mode==='pro'?pc.acknowledgeCareer(pc.createProfessionalDemo('expanded-events','생활검증','SS')):e.createGame('expanded-events','생활검증','SS');
  const p=e.getPlayer(s);s.players=s.players.filter(q=>q.teamId===p.teamId);s.calendar.events=[];s.calendar.competitions=[];s.careerEventHistory=[];s.careerEvent=null;s.careerNotice=null;s.noticeQueue=[];
  delete s.weekProgress;delete s.matchProgress;delete s.proEvents;delete s.eventLedger;delete s.pendingEventOutcome;
  s.week=20;s.phase='weekStart';p.roleOffer=null;p.injury=null;p.forcedRest=false;p.fatigue=40;p.grade=2;p.age=25;p.recentZ=0;
  if(mode==='pro'){s.proWorld.stage='regular';p.professional.employment='active';p.professional.firsts.debut=s.date;}
  cache.set(mode,s);
 }
 return structuredClone(cache.get(mode));
}
function definitions(mode){return(mode==='pro'?pro.proEventCatalog:school.schoolEventCatalog).filter(d=>d.rule);}
function rawEvent(s,id,story){
 const p=e.getPlayer(s);
 return s.careerMode==='pro'?pro.createProEvent(s,id,{version:1,catalogId:id,channel:'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:p.teamId<10?'first':'second',field:e.isPitcher(p.primaryRole)?'pitching':'batting',openedAt:s.date,story}):school.createCareerEvent(id,p,s.date,s.week,{story});
}
function settleSource(s,mode,definition,choice='choice-1'){
 const p=e.getPlayer(s);s.careerEvent=rawEvent(s,definition.rule.after.id,{mode,teamId:p.teamId});
 return e.answerCareerEvent(s,choice);
}
function situation(mode,definition){
 let s=fixture(mode);const rule=definition.rule,p=e.getPlayer(s),year=s.calendar.seasonYear;
 s.date=`${year}-${String(rule.months?.[0]??7).padStart(2,'0')}-20`;
 if(rule.field==='pitching'){p.position='SP';p.primaryRole=e.roleFor('SP');p.eligiblePositions=['SP'];p.trainingPolicy=e.defaultPolicy(p.primaryRole);}
 if(rule.minAge)p.age=rule.minAge;if(rule.maxAge)p.age=rule.maxAge;
 if(rule.minGrade)p.grade=rule.minGrade;
 if(rule.form)p.recentZ=rule.form==='good'?.5:-.5;
 if(rule.minFatigue)p.fatigue=rule.minFatigue;
 if(rule.after){const end=s.date;s.date=e.addDays(end,-rule.after.minDays);s=settleSource(s,mode,definition);s.date=end;}
 e.getPlayer(s).fatigue=40;s.calendar.trainingDays=[s.date];
 if(rule.travel)s.calendar.events=[{id:'next-away',date:e.addDays(s.date,1),status:'scheduled',homeTeamId:99,awayTeamId:e.getPlayer(s).teamId}];
 return s;
}
test('all 75 added events reach their real scheduling channel with concrete eligible situations',()=>{
 assert.equal(definitions('school').length,30);assert.equal(definitions('pro').length,45);
 for(const mode of ['school','pro'])for(const definition of definitions(mode)){
  const s=situation(mode,definition),id=definition.id,p=e.getPlayer(s);
  assert.ok(eligibleStory(s,id,definition.rule),id);
  if(mode==='school'){
   const candidate=system.eventCandidates(s,s.date).find(c=>c.definitionId===id);assert.ok(candidate,id);
   s.weekProgress={opportunity:candidate};assert.equal(system.openScheduledEvent(s,school.eventKind(id)==='training'?'training':'beforeGames'),true,id);
  }else{
   const candidate=runtime.proGeneralCandidates(s).find(c=>c.id===id);assert.ok(candidate,id);
   s.proEvents.reservation={week:s.week,date:s.date,id,context:candidate.context};assert.equal(runtime.openProGeneralEvent(s),true,id);
  }
  assert.equal(s.careerEvent.definitionId,id);assert.equal(s.careerEvent.story.teamId,p.teamId);
 }
});
test('all new choices and outcome branches resolve without changing records, allocation or unrelated RNG',()=>{
 for(const mode of ['school','pro'])for(const definition of definitions(mode)){
  const base=situation(mode,definition);base.careerEvent=rawEvent(base,definition.id,eligibleStory(base,definition.id,definition.rule));
  for(const choice of base.careerEvent.choices){
   let lower=0;
   for(const branch of choice.outcomes){
    const s=structuredClone(base),upper=lower+branch.weight/100,p=e.getPlayer(s);
    for(let seed=0;seed<10000;seed++){const q={rngStates:{...s.rngStates,events:seed}},roll=e.random(q,'events');if(roll>=lower&&roll<upper){s.rngStates.events=seed;break;}}
    const next=e.answerCareerEvent(s,choice.id),out=next.careerEventHistory.at(-1),q=e.getPlayer(next);
    assert.equal(out.message,branch.message,definition.id);assert.equal(out.choiceId,choice.id);assert.deepEqual(out.story,s.careerEvent.story);
    assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.deepEqual(q.seasonStats,p.seasonStats);assert.equal(next.date,s.date);
    assert.ok(Object.values(q.stats).every(n=>Number.isFinite(n)&&n>=1&&n<=100));assert.ok(q.fatigue>=0&&q.fatigue<=100);
    for(const key of Object.keys(s.rngStates).filter(k=>k!=='events'))assert.equal(next.rngStates[key],s.rngStates[key]);
    assert.throws(()=>e.answerCareerEvent(next,choice.id),/선택할/);lower=upper;
   }
  }
 }
});
test('all 25 follow-ups require acceptance, elapsed time, same team and mode, and consume each source only once',()=>{
 let count=0;
 for(const mode of ['school','pro'])for(const definition of definitions(mode).filter(d=>d.rule.after)){
  count++;const s=situation(mode,definition),rule=definition.rule,source=s.careerEventHistory.at(-1);
  assert.equal(eligibleStory(s,definition.id,rule).sourceId,source.id);
  const rejected=structuredClone(s);rejected.careerEventHistory.at(-1).choiceId='choice-2';assert.equal(eligibleStory(rejected,definition.id,rule),undefined);
  const early=structuredClone(s);early.date=e.addDays(source.date,rule.after.minDays-1);early.calendar.trainingDays.push(early.date);assert.equal(eligibleStory(early,definition.id,rule),undefined);
  const expired=structuredClone(s);expired.date=e.addDays(source.date,rule.after.maxDays+1);expired.calendar.trainingDays.push(expired.date);assert.equal(eligibleStory(expired,definition.id,rule),undefined);
  const transfer=structuredClone(s);e.getPlayer(transfer).teamId+=1;assert.equal(eligibleStory(transfer,definition.id,rule),undefined);
  const changedMode=structuredClone(s);changedMode.careerEventHistory.at(-1).story.mode=mode==='pro'?'school':'pro';assert.equal(eligibleStory(changedMode,definition.id,rule),undefined);
  s.careerEvent=rawEvent(s,definition.id,eligibleStory(s,definition.id,rule));const done=e.answerCareerEvent(s,'choice-1');done.date=e.addDays(done.date,56);done.calendar.trainingDays.push(done.date);
  assert.equal(eligibleStory(done,definition.id,rule),undefined,'already followed '+definition.id);
 }
 assert.equal(count,25);
});
test('life stories respect free days and health; travel and field practice need matching context',()=>{
 const s=fixture('pro'),p=e.getPlayer(s);s.calendar.trainingDays=[s.date];
 const rule=id=>pro.proEventCatalog.find(d=>d.id===id).rule;
 assert.ok(eligibleStory(s,'PE31',rule('PE31')));
 s.calendar.events=[{id:'own-game',date:s.date,homeTeamId:p.teamId,awayTeamId:99,status:'scheduled'}];assert.equal(eligibleStory(s,'PE31',rule('PE31')),undefined);
 s.calendar.events=[];p.forcedRest=true;assert.equal(eligibleStory(s,'PE31',rule('PE31')),undefined);p.forcedRest=false;
 p.injury={unavailableUntil:e.addDays(s.date,7)};assert.equal(eligibleStory(s,'PE31',rule('PE31')),undefined);p.injury=null;
 assert.equal(eligibleStory(s,'PE43',rule('PE43')),undefined);s.calendar.events=[{date:e.addDays(s.date,1),homeTeamId:99,awayTeamId:p.teamId,status:'scheduled'}];assert.ok(eligibleStory(s,'PE43',rule('PE43')));
 p.eligiblePositions=['DH'];assert.equal(eligibleStory(s,'PE58',rule('PE58')),undefined);
});
test('fatigue varies within the authored range and save/load preserves a pending story and deterministic result',()=>{
 const s=fixture('school'),definition=definitions('school').find(d=>d.id==='L01');s.careerEvent=rawEvent(s,'L01',eligibleStory(s,'L01',definition.rule));
 const values=new Set();for(let seed=0;seed<40;seed++){const input=structuredClone(s);input.rngStates.events=seed;const next=e.answerCareerEvent(input,'choice-1'),out=next.careerEventHistory.at(-1);if(out.stats.bq){assert.ok(out.fatigue>=2&&out.fatigue<=5);values.add(out.fatigue);}else assert.ok(out.fatigue>=4&&out.fatigue<=8);}
 assert.ok(values.size>1);
 const saved=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(s,true))).state;
 assert.deepEqual(saved.careerEvent,s.careerEvent);
 const a=e.answerCareerEvent(s,'choice-1'),b=e.answerCareerEvent(saved,'choice-1');assert.deepEqual(a.careerEventHistory.at(-1),b.careerEventHistory.at(-1));assert.deepEqual(a.rngStates,b.rngStates);
});
test('legacy histories without story metadata never invent follow-ups and private invitations never penalize selection',()=>{
 const s=fixture('school'),d=definitions('school').find(d=>d.id==='L14');s.careerEventHistory=[{id:'legacy',definitionId:'L01',date:e.addDays(s.date,-14),choice:'동료와 경기를 보러 간다'}];
 assert.equal(eligibleStory(s,d.id,d.rule),undefined);
 for(const mode of ['school','pro'])for(const row of definitions(mode).filter(d=>mode==='school'?d.id.startsWith('L'):Number(d.id.slice(2))<=53)){
  const event=rawEvent(fixture(mode),row.id);for(const choice of event.choices)for(const branch of choice.outcomes){assert.equal(branch.reputation,undefined);assert.equal(branch.proChanceRequest,undefined);}
 }
});

test('selected life stories sometimes teach skills while preserving recovery-only and fatigue outcomes',()=>{
 const ids={school:['L03','L06','L07','L12','L13','L17'],pro:['PE32','PE33','PE36','PE38','PE45','PE47','PE49','PE51']};
 for(const mode of ['school','pro'])for(const id of ids[mode]){
  const s=fixture(mode),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=60;p.injury=null;if(p.professional)p.professional.agingProfile=undefined;
  s.careerEvent=rawEvent(s,id);const branches=s.careerEvent.choices[0].outcomes;
  assert.deepEqual(branches.map(b=>b.weight),[30,30,40],id);assert.ok(Object.keys(branches[0].weeks??{}).length>0,id);assert.equal(branches[1].weeks,undefined,id);assert.equal(branches[2].weeks,undefined,id);
  for(let seed=0;seed<10000;seed++){const q={rngStates:{...s.rngStates,events:seed}};if(e.random(q,'events')<.3){s.rngStates.events=seed;break;}}
  const done=e.answerCareerEvent(s,'choice-1'),out=done.careerEventHistory.at(-1);assert.ok(Object.values(out.stats).some(n=>n>0),id);assert.deepEqual(e.getPlayer(done).trainingPolicy,p.trainingPolicy);assert.deepEqual(e.getPlayer(done).seasonStats,p.seasonStats);
 }
});

test('technical exchanges resolve to batting and pitching skills using the selected player role',()=>{
 for(const [position,expected] of [['SS','contact'],['SP','control']])for(const [mode,id] of [['school','L12'],['pro','PE37']]){
  const s=fixture(mode),p=e.getPlayer(s);p.position=position;p.primaryRole=e.roleFor(position);for(const key of Object.keys(p.stats))p.stats[key]=60;
  const event=rawEvent(s,id);assert.equal(event.choices[0].outcomes[0].weeks[expected],3);
 }
});
