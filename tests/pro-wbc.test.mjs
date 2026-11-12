import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const wbc=require('../.test-build/lib/sim/pro-wbc.js');
const calendar=require('../.test-build/lib/sim/pro-calendar.js');
const save=require('../.test-build/lib/career-save.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('wbc-regression','대표선수','SS'));
function fixture(year=2030,position='SS'){
 const s=structuredClone(template),base=e.getPlayer(s);s.date=`${year}-03-01`;s.calendar=calendar.developmentCalendar(year,true);s.calendar.events=[];s.proWorld.year=year;s.proWorld.stage='camp';s.proWorld.seasonClosed=false;
 s.careerNotice=null;s.noticeQueue=[];s.careerEvent=null;s.careerEventHistory=[];delete s.proEvents;delete s.weekProgress;delete s.matchProgress;delete s.pendingEventOutcome;
 s.players=[];
 for(const [position,count] of [['SP',8],['RP',10],['CP',3],['C',3],['1B',2],['2B',2],['3B',2],['SS',2],['LF',2],['CF',2],['RF',2],['DH',2]])for(let i=0;i<count;i++){
  const p=structuredClone(base);p.id=`wbc-${position}-${i}`;p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position,'DH'];p.teamId=0;p.careerMode='pro';p.reputation=95-i;p.age=24;p.fatigue=0;p.forcedRest=false;p.injury=null;p.proContract.status='regular';p.professional.employment='active';p.professional.proBonus=0;p.professional.roleTrial=undefined;p.trainingPolicy=e.defaultPolicy(p.primaryRole);delete p.twoWay;
  for(const key of Object.keys(p.stats))p.stats[key]=60;
  const first=e.emptyRecord();if(e.isPitcher(p.primaryRole))Object.assign(first.pitching,{outs:90,BF:130});else Object.assign(first.batting,{PA:100,AB:90,H:30});
  p.career=[{year:year-1,grade:0,careerMode:'pro',records:structuredClone(first),stats:{...p.stats},byLevel:{first,second:e.emptyRecord()}}];p.seasonStats=e.emptyRecord();p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonPostseason=e.emptyRecord();p.recentAppearances=[];s.players.push(p);
 }
 s.playerId=s.players.find(p=>p.position===position).id;s.proWorld.clubs.forEach(c=>c.nextReview='2099-01-01');s.lastCareerEventWeek=s.week;s.trainingFocus={rng:1,rolledWeek:s.week};return s;
}
function force(s,low,high){for(let seed=0;seed<100000;seed++){const q={rngStates:{...s.rngStates,events:seed}},roll=e.random(q,'events'),awakening=e.random(q,'events');if(roll>=low&&roll<high&&awakening>.5){s.rngStates.events=seed;return;}}assert.fail('event seed');}

test('WBC happens in March every four years beginning in 2030, with no late replay',()=>{
 for(const year of [2030,2034,2038]){const s=fixture(year);assert.equal(wbc.isWbcYear(year),true);assert.equal(wbc.tryWbcInvitation(s),true);assert.match(s.careerEvent.title,new RegExp(`${year} WBC`));}
 for(const year of [2022,2025,2026,2027,2028,2029,2031]){const s=fixture(year);assert.equal(wbc.tryWbcInvitation(s),false);assert.equal(s.proEvents,undefined);}
 const early=fixture();early.date='2030-02-28';assert.equal(wbc.tryWbcInvitation(early),false);
 const late=fixture();late.date='2030-03-21';assert.equal(wbc.tryWbcInvitation(late),false);assert.equal(late.proEvents.wbc[2030].skipped,true);assert.equal(late.careerEvent,null);
});

test('WBC freezes 30 players by selection and role using the previous first-team season',()=>{
 const s=fixture(),rng={...s.rngStates},entry=wbc.freezeWbcRoster(s);assert.equal(entry.sourceYear,2029);assert.equal(entry.roster.length,30);assert.equal(new Set(entry.roster.map(p=>p.id)).size,30);assert.equal(entry.roster.filter(p=>p.position==='SP').length,5);assert.equal(entry.roster.filter(p=>['RP','CP'].includes(p.position)).length,10);assert.ok(entry.roster.filter(p=>p.position==='C').length>=2);assert.deepEqual(s.rngStates,rng);
 const roster=structuredClone(entry.roster);for(const p of s.players){p.reputation=0;p.career=[];}assert.deepEqual(wbc.freezeWbcRoster(s).roster,roster);
 const second=fixture();for(const p of second.players){p.career[0].byLevel.second=p.career[0].byLevel.first;p.career[0].byLevel.first=e.emptyRecord();p.seasonByLevel.first=structuredClone(p.career[0].byLevel.second);}assert.equal(wbc.freezeWbcRoster(second).roster.length,0);
 const old=fixture();for(const p of old.players)p.career[0].year=2028;assert.equal(wbc.freezeWbcRoster(old).roster.length,0);
});

test('WBC excludes developmental, unsigned, injured and exhausted players without replacing their eligibility with OVR',()=>{
 const s=fixture();s.players.forEach((p,i)=>{if(i%4===0)p.proContract.status='developmental';if(i%4===1)p.professional.employment='freeAgent';if(i%4===2)p.injury={unavailableUntil:'2030-03-15'};if(i%4===3)p.fatigue=80;});assert.equal(wbc.freezeWbcRoster(s).roster.length,0);
 const missing=fixture();e.getPlayer(missing).career=[];assert.equal(wbc.tryWbcInvitation(missing),false);assert.equal(missing.proEvents.wbc[2030].settled,true);
});

test('WBC participation defers growth, injury and awards until actual tournament games',()=>{
 for(const position of ['SS','SP']){
  const s=fixture(2030,position),p=e.getPlayer(s);assert.equal(wbc.tryWbcInvitation(s),true);assert.deepEqual(s.careerEvent.choices[0].outcomes.map(o=>o.weight),[100]);
  const records=structuredClone({season:p.seasonStats,levels:p.seasonByLevel,career:p.career,fa:p.professional.faDays}),before={...p.stats};
  const next=e.answerCareerEvent(s,'participate'),q=e.getPlayer(next),entry=next.proEvents.wbc[2030];assert.equal(entry.settled,true);assert.equal(entry.participated,true);assert.equal(entry.result,undefined);assert.equal(next.date,s.date);assert.equal(next.careerEvent,null);assert.deepEqual(q.stats,before);assert.equal(q.injury,null);assert.deepEqual({season:q.seasonStats,levels:q.seasonByLevel,career:q.career,fa:q.professional.faDays},records);
  assert.equal(wbc.tryWbcInvitation(next),false);assert.throws(()=>e.answerCareerEvent(next,'participate'),/선택할/);
 }
});

test('WBC waits for existing choices and notices and saved pending choices resume identically',()=>{
 const s=fixture();s.careerNotice={id:'camp',kind:'pro',date:s.date,title:'캠프',message:'안내'};assert.equal(wbc.tryWbcInvitation(s),false);s.careerNotice=null;assert.equal(wbc.tryWbcInvitation(s),true);force(s,.1,.2);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
 const a=e.answerCareerEvent(s,'participate'),b=e.answerCareerEvent(restored,'participate');assert.deepEqual(b.proEvents.wbc,a.proEvents.wbc);assert.deepEqual(e.getPlayer(b).stats,e.getPlayer(a).stats);assert.equal(b.careerEventHistory.at(-1).message,a.careerEventHistory.at(-1).message);
 const damaged=structuredClone(s);damaged.proEvents.wbc[2030].roster.push(damaged.proEvents.wbc[2030].roster[0]);assert.throws(()=>save.encodeCareerSave(damaged),/WBC/);
 const declined=fixture();wbc.tryWbcInvitation(declined);const next=e.answerCareerEvent(declined,'decline');assert.equal(next.proEvents.wbc[2030].participated,false);assert.ok(e.getPlayer(next).professional.proBonus>=0);assert.equal(wbc.tryWbcInvitation(next),false);
});

test('a week crossing into March pauses at WBC once and continues from the same day after choosing',()=>{
 const s=fixture();s.date='2030-02-28';const p=e.getPlayer(s),chance=e.params['pro_events.general_chance'];e.params['pro_events.general_chance']=0;
 try{
  let paused=e.advanceWeek(s,p.trainingPolicy,p.stance);for(let i=0;i<12&&paused.careerNotice;i++)paused=pc.acknowledgeCareer(paused);
  // Resume any earlier registration checkpoint before reaching March.
  for(let i=0;i<12&&!paused.careerEvent;i++){paused=e.advanceWeek(paused,p.trainingPolicy,p.stance);while(paused.careerNotice)paused=pc.acknowledgeCareer(paused);}
  assert.equal(paused.careerEvent.definitionId,'WBC01');assert.equal(paused.date,'2030-03-01');assert.equal(paused.weekProgress.day.phase,'beforeGames');
  let next=e.answerCareerEvent(paused,'decline');for(let i=0;i<12&&next.weekProgress;i++){next=e.advanceWeek(next,p.trainingPolicy,p.stance);while(next.careerNotice)next=pc.acknowledgeCareer(next);if(next.careerEvent)next=e.answerCareerEvent(next,next.careerEvent.choices.at(-1).id);}
  assert.equal(next.proEvents.wbc[2030].settled,true);assert.equal(next.careerEventHistory.filter(row=>row.definitionId==='WBC01').length,1);assert.ok(next.date>'2030-03-01');
 }finally{e.params['pro_events.general_chance']=chance;}
});
