import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const {revealDraftResult}=require('../.test-build/lib/sim/draft-outcome.js');
const {developmentCalendar,careerLeagueTable}=require('../.test-build/lib/sim/pro-calendar.js');
const {tryDevelopmentEvent}=require('../.test-build/lib/sim/pro-events.js');
const {tryNationalEvent}=require('../.test-build/lib/sim/event-system.js');
const {tryCareerOpportunity}=require('../.test-build/lib/sim/career-opportunities.js');
const {autoPauseReason}=require('../.test-build/lib/auto-progress.js');
const {playerSeasons,totalRecords}=require('../.test-build/lib/player-records.js');
const Continuation=require('../.test-build/app/components/career-continuation.js').default;
const SeasonRecords=require('../.test-build/app/components/season-records.js').default;
e.params['events.focus_chance']=0;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const original=e.createGame('pro-tests','프로검증','SS');
function graduate(drafted=true) {
  const s=structuredClone(original),p=e.getPlayer(s);p.grade=3;s.phase='ended';s.date=s.calendar.draftDate;
  p.seasonStats.batting.PA=100;p.seasonStats.batting.AB=90;p.seasonStats.batting.H=30;
  s.draft=drafted?[{playerId:p.id,playerName:p.name,teamName:s.teams[p.teamId].name,club:e.draftClubs[0],overall:1,round:1,slot:1,role:p.primaryRole,score:80,ability:e.combinedOvr(p),abilityRank:1,reputation:p.reputation,talent:5,fit:60,components:{reputation:60,talent:10,fit:10}}]:[];
  return revealDraftResult(s);
}
const entered=pc.continueCareer(graduate(),'join');
const fixture=()=>pc.acknowledgeCareer(entered);
const advance=s=>e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);
function forceTryout(s,success){for(let seed=0;seed<100000;seed++){const probe={rngStates:{...s.rngStates,draft:seed}};const roll=e.random(probe,'draft');if(success?roll<.1:roll>.9){s.rngStates.draft=seed;return;}}assert.fail('roll');}

test('joining the drafted club retains the same player, stats, talent, policy, reputation and school archive',()=>{
  const old=graduate(),p=e.getPlayer(old),copy=structuredClone(old),next=pc.continueCareer(old,'join'),q=e.getPlayer(next);
  assert.deepEqual(old,copy);assert.equal(next.careerMode,'pro');assert.equal(q.teamId,10);assert.equal(next.postSchool.pro.level,'second');
  assert.equal(q.id,p.id);assert.deepEqual(q.stats,p.stats);assert.deepEqual(q.initialStats,p.initialStats);assert.deepEqual(q.talent,p.talent);
  assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.equal(q.reputation,p.reputation);assert.deepEqual(q.seasonStats,e.emptyRecord());
  assert.equal(q.career[0].schoolName,old.teams[p.teamId].name);assert.equal(q.career[0].records.batting.H,30);assert.deepEqual(next.draft,old.draft);
  assert.equal(next.date,'2028-03-01');assert.equal(q.age,19);assert.equal(next.careerNotice.kind,'entry');
  assert.throws(()=>advance(next),/알림/);assert.throws(()=>pc.continueCareer(next,'join'),/결과와 알림/);
});

test('entry preserves two-way qualification and does not upgrade high school ability to pro ability',()=>{
  const s=graduate(),p=e.getPlayer(s);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:2};p.eligiblePositions.push('SP','RP','CP');
  const n=pc.continueCareer(s,'join'),q=e.getPlayer(n);assert.deepEqual(q.twoWay,p.twoWay);assert.deepEqual(q.eligiblePositions,p.eligiblePositions);
  const mean=rows=>rows.reduce((sum,p)=>sum+e.ovr(p),0)/rows.length;
  assert.ok(mean(n.players.filter(p=>p.teamId<10))>mean(n.players.filter(p=>p.teamId>=10))+10);
  assert.ok(mean(n.players.filter(p=>p.teamId<10))>e.ovr(q)+15);
});

test('pro calendar has 144 first-team and 72 second-team games per club, balanced home/away and no same-day conflicts',()=>{
  const c=developmentCalendar(2030,true);assert.equal(c.events.length,1080);assert.equal(c.sourceKind,'fictional');
  const dates=new Set();for(const g of c.events){for(const id of [g.homeTeamId,g.awayTeamId]){const key=`${g.date}:${id}`;assert.ok(!dates.has(key));dates.add(key);}assert.notEqual(g.homeTeamId,g.awayTeamId);}
  for(let id=0;id<20;id++){const games=c.events.filter(g=>[g.homeTeamId,g.awayTeamId].includes(id));assert.equal(games.length,id<10?144:72);assert.equal(games.filter(g=>g.homeTeamId===id).length,games.length/2);}
  assert.equal(c.seasonEnd,c.events.at(-1).date);assert.ok(c.trainingDays.every(date=>date<=c.seasonEnd));
});

test('unqualified prospects remain in the farm team; call-up exchanges roster members once and preserves all personal records',()=>{
  const s=fixture(),p=e.getPlayer(s);s.date='2028-03-15';assert.equal(pc.reviewProRoster(s),false);assert.equal(p.teamId,10);
  s.date='2028-03-29';for(const key of Object.keys(p.stats))p.stats[key]=95;
  const before=s.players.length,record=structuredClone(p.seasonStats),first=s.players.filter(p=>p.teamId===0).length,farm=s.players.filter(p=>p.teamId===10).length;
  assert.equal(pc.reviewProRoster(s),true);assert.equal(p.teamId,0);assert.equal(s.careerNotice.kind,'promoted');assert.equal(s.players.length,before);
  assert.equal(s.players.filter(p=>p.teamId===0).length,first);assert.equal(s.players.filter(p=>p.teamId===10).length,farm);assert.deepEqual(p.seasonStats,record);
  assert.equal(pc.reviewProRoster(s),false);assert.equal(s.postSchool.pro.transactions.length,1);
  delete s.careerNotice;s.date=s.postSchool.pro.nextReviewDate;p.injury={severity:'severe',startDate:s.date,unavailableUntil:e.addDays(s.date,20),originalPenalty:8,penaltyRemaining:8,penaltyRecoverDays:10};
  assert.equal(pc.reviewProRoster(s),true);assert.equal(p.teamId,10);assert.equal(s.careerNotice.kind,'demoted');assert.equal(s.postSchool.pro.transactions.length,2);
});

test('registration notice pauses before games/training and resumes the same seven days without duplicate swaps',()=>{
  let s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=95;s.date='2028-03-15';
  const paused=advance(s);assert.equal(paused.date,s.date);assert.equal(paused.week,s.week);assert.equal(paused.weekProgress.remainingDays,7);assert.equal(paused.weekProgress.day.phase,'beforeGames');
  assert.equal(paused.report.fatigue.training,0);assert.equal(paused.postSchool.pro.transactions.length,1);assert.ok(autoPauseReason(s,paused));
  s=advance(pc.acknowledgeCareer(paused));assert.equal(s.week,paused.week+1);assert.equal(s.postSchool.pro.transactions.length,1);assert.equal(s.weekProgress,undefined);
  close(s.postSchool.pro.firstTeamWeeks,1);assert.ok(!s.calendar.events.some(g=>g.status==='inProgress'));
});

test('tryout failure is once a year, has no stat/reputation penalty and still allows college; success joins a pro farm squad',()=>{
  let s=graduate(false),p=e.getPlayer(s);assert.throws(()=>pc.continueCareer(s,'join'),/지명받은/);
  forceTryout(s,false);const failed=pc.continueCareer(s,'tryout');assert.equal(failed.careerNotice.kind,'tryoutFailed');assert.deepEqual(e.getPlayer(failed).stats,p.stats);assert.equal(e.getPlayer(failed).reputation,p.reputation);
  const ack=pc.acknowledgeCareer(failed);assert.throws(()=>pc.continueCareer(ack,'tryout'),/이미 참가/);
  const college=pc.continueCareer(ack,'college');assert.equal(college.careerMode,'college');assert.equal(college.postSchool.collegeYears,1);assert.equal(e.getPlayer(college).age,19);
  assert.deepEqual(e.getPlayer(college).stats,p.stats);assert.equal(e.getPlayer(college).career[0].records.batting.PA,100);assert.equal(college.players.length,361);
  s=graduate(false);forceTryout(s,true);const success=pc.continueCareer(s,'tryout');assert.equal(success.postSchool.pro.entry,'tryout');assert.ok(e.getPlayer(success).teamId>=10);
});

test('college season records are archived separately and a college draft pick can enter the following pro rookie year',()=>{
  let s=pc.acknowledgeCareer(pc.continueCareer(graduate(false),'college')),p=e.getPlayer(s);
  assert.equal(careerLeagueTable(s.calendar,'college').length,12);
  for(const key of Object.keys(p.stats))p.stats[key]=95;p.reputationBonus=100;s.date=s.calendar.seasonEnd;
  s=advance(s);assert.equal(s.phase,'ended');assert.equal(s.careerNotice.kind,'seasonComplete');assert.ok(s.postSchool.collegeDraft.some(p=>p.playerId===s.playerId));
  s=pc.continueCareer(pc.acknowledgeCareer(s),'join');assert.equal(s.careerMode,'pro');assert.equal(s.postSchool.pro.entry,'collegeDraft');assert.equal(s.date,'2029-03-01');
  const q=e.getPlayer(s);assert.deepEqual(q.career.map(r=>[r.year,r.careerMode??'highSchool']),[[2027,'highSchool'],[2028,'college']]);assert.equal(q.age,20);assert.deepEqual(s.draft,[]);
});

test('pro games commit first/second records only when completed and sum to the season total',()=>{
  const s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=95;
  for(const level of ['first','second']) {
    const team=level==='first'?0:10;p.teamId=team;p.lastPitched=null;
    const g=s.calendar.events.find(g=>[g.homeTeamId,g.awayTeamId].includes(team));s.date=g.date;
    assert.equal(e.simulateGame(s,g,[g.homeTeamId,g.awayTeamId].map(id=>s.players.filter(p=>p.teamId===id))),true);assert.equal(g.status,'completed');assert.ok(p.seasonByLevel[level].batting.PA>0);
  }
  const sum=e.emptyRecord();e.mergeRecord(sum,p.seasonByLevel.first);e.mergeRecord(sum,p.seasonByLevel.second);assert.deepEqual(sum,p.seasonStats);
  assert.ok(s.postSchool.pro.debutDate);assert.equal(p.career[0].records.batting.PA,100);
});

test('career record filters distinguish high school, college and pro level totals without changing old rows',()=>{
  const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.first.batting.PA=20;p.seasonByLevel.second.batting.PA=40;p.seasonStats.batting.PA=60;
  const rows=playerSeasons(p,2028);assert.equal(rows[0].careerMode,undefined);assert.equal(rows[1].careerMode,'pro');assert.equal(rows[1].byLevel.second.batting.PA,40);assert.equal(totalRecords(rows).batting.PA,160);
  const html=renderToStaticMarkup(createElement(SeasonRecords,{player:p,year:2028,school:s.teams[p.teamId].name,ended:false,mine:true,onMyRecords(){}}));
  assert.ok(html.includes('프로 1군')&&html.includes('프로 2군'));assert.ok(html.includes('19세'));assert.ok(!html.includes('고교 0학년'));assert.ok(html.includes(p.career[0].schoolName));
});

test('pro/college choices display correct entry options and old high-school-only proposals cannot run in pro',()=>{
  const render=s=>renderToStaticMarkup(createElement(Continuation,{state:s,onChange(){}}));
  assert.match(render(graduate()),/프로 입단/);assert.ok(!render(graduate()).includes('입단 테스트 도전'));
  assert.match(render(graduate(false)),/은퇴/);assert.ok(!render(graduate(false)).includes('대학 진학'));
  const s=fixture();e.getPlayer(s).grade=2;e.getPlayer(s).reputation=100;assert.equal(tryNationalEvent(s),false);assert.equal(tryCareerOpportunity(s),false);
});

test('development events pause before future days, use normal training-week rewards and resume without replay',()=>{
  const s=fixture(),p=e.getPlayer(s);s.week=5;s.lastCareerEventWeek=0;
  let paused;
  for(let seed=0;seed<1000;seed++){s.rngStates.events=seed;const next=advance(s);if(next.careerEvent){paused=next;break;}}
  assert.ok(paused);assert.match(paused.careerEvent.definitionId,/^D0[1-4]$/);assert.equal(paused.week,s.week);assert.equal(paused.weekProgress.remainingDays,7);
  for(const choice of paused.careerEvent.choices)assert.equal(choice.outcomes.reduce((a,b)=>a+b.weight,0),100);
  const answered=e.answerCareerEvent(paused,paused.careerEvent.choices.at(-1).id);assert.equal(answered.date,paused.date);
  const resumed=advance(answered);assert.equal(resumed.week,s.week+1);assert.equal(resumed.careerEventHistory.length,s.careerEventHistory.length+1);
  assert.equal(tryDevelopmentEvent(resumed),false);assert.ok(e.getPlayer(resumed).stats.contact>=p.stats.contact);
});

test('full pro rookie season completes all 1080 games with stable population, level records and no extra draft/promotion years',{timeout:90000},()=>{
  let s=pc.acknowledgeCareer(pc.createProfessionalDemo('full-rookie-test','신인','SP'));const count=s.players.length,stats={...e.getPlayer(s).stats},school=s.postSchool.graduationSchool;
  let guard=0;
  while(s.phase!=='ended'&&guard++<100){if(s.careerNotice)s=pc.acknowledgeCareer(s);if(s.careerEvent)s=e.answerCareerEvent(s,s.careerEvent.choices.at(-1).id);s=advance(s);}
  assert.equal(s.phase,'ended');assert.equal(s.date,s.calendar.seasonEnd);assert.equal(s.players.length,count);assert.equal(s.calendar.events.filter(g=>['completed','forfeit'].includes(g.status)).length,1080);
  assert.ok(s.calendar.competitions.every(c=>c.championTeamId!==null));const p=e.getPlayer(s);assert.equal(p.career[0].schoolName,school);assert.ok(p.stats.velocity>=stats.velocity);
  const sum=e.emptyRecord();e.mergeRecord(sum,p.seasonByLevel.first);e.mergeRecord(sum,p.seasonByLevel.second);assert.deepEqual(p.seasonStats,sum);assert.ok(p.seasonStats.pitching.BF>0);
  assert.equal(s.careerNotice.kind,'seasonComplete');assert.throws(()=>advance(s),/종료/);assert.throws(()=>pc.continueCareer(pc.acknowledgeCareer(s),'join'),/신인 시즌/);
});
