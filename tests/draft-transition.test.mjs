import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const d=require('../.test-build/lib/sim/draft.js');
const outcome=require('../.test-build/lib/sim/draft-outcome.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const {eventTrainingReward}=require('../.test-build/lib/sim/event-system.js');
const Gate=require('../.test-build/app/components/draft-result-gate.js').default;
const Continuation=require('../.test-build/app/components/career-continuation.js').default;
const template=e.createGame('draft-transition','마지막시즌','SS');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function graduate(gap=2) {
  const s=structuredClone(template),p=e.getPlayer(s);s.phase='ended';s.date=s.calendar.draftDate;p.grade=3;
  for(const key of Object.keys(p.stats))p.stats[key]=40;p.reputation=50;p.talent={batting:5,pitching:5};
  const others=s.players.filter(q=>q.id!==p.id).slice(0,20);
  for(const q of others){q.grade=3;q.talent={batting:5,pitching:5};q.reputation=90;for(const key of Object.keys(q.stats))q.stats[key]=90;}
  const last=others[0];for(const key of Object.keys(last.stats))last.stats[key]=60;last.reputation=60;
  p.reputation+=(d.draftAssessment(last)-d.draftAssessment(p)-gap)/e.params['draft.reputation_weight'];
  s.players=[p,...others];s.draft=[{playerId:last.id,playerName:last.name,teamName:s.teams[last.teamId].name,club:e.draftClubs[0],overall:100,round:10,slot:1,role:last.primaryRole,score:d.draftAssessment(last),ability:120,abilityRank:1,reputation:60,talent:5,fit:50,components:{reputation:48,talent:5,fit:5}}];
  return s;
}
const shown=s=>outcome.revealDraftResult(s);
const render=s=>renderToStaticMarkup(createElement(Continuation,{state:s,onChange(){},onRetire(){}}));
function developmental(){return pc.acknowledgeCareer(pc.continueCareer(shown(graduate()),'developmental'));}

test('draft reveal is explicit, read-only and idempotent, and entry cannot bypass it',()=>{
  const s=graduate(),before=structuredClone(s),hidden=render(s);
  assert.equal(hidden,'');assert.throws(()=>pc.continueCareer(s,'developmental'),/결과를 먼저/);
  const html=renderToStaticMarkup(createElement(Gate,{state:s,onChange(){}}));
  assert.match(html,/결과 확인/);assert.ok(!html.includes('지명받지')&&!html.includes('신고선수'));
  const next=shown(s);assert.deepEqual(s,before);assert.deepEqual(next.rngStates,s.rngStates);assert.deepEqual(next.draft,s.draft);
  assert.equal(next.draftOutcome.revealed,true);assert.equal(outcome.revealDraftResult(next),next);
  assert.throws(()=>outcome.revealDraftResult({...s,phase:'weekStart'}));
});
test('near-cutoff offers use the same neutral 80:10:10 assessment, include the 2-point boundary and consume no RNG',()=>{
  const s=graduate(2),before=structuredClone(s),offer=outcome.developmentalOffer(s);
  assert.equal(offer.reason,'nearCutoff');close(offer.scoreGap,2);assert.deepEqual(s,before);
  assert.equal(outcome.developmentalOffer(graduate(2.0001)),null);
  assert.equal(outcome.developmentalOffer(graduate(-1)).reason,'nearCutoff');
});
test('an individual national top-5 skill earns an offer even far below the draft cutoff, but sixth does not',()=>{
  const s=graduate(20),p=e.getPlayer(s);p.stats.power=99;
  for(const q of s.players.slice(1,5)){q.grade=1;q.stats.power=100;}
  const offer=outcome.developmentalOffer(s);assert.equal(offer.reason,'topSkill');assert.equal(offer.stat,'power');assert.equal(offer.rank,5);
  s.players[5].stats.power=100;assert.equal(outcome.developmentalOffer(s),null);
  s.draft[0].playerId=p.id;assert.equal(outcome.developmentalOffer(s),null);
});
test('result summary exposes exactly drafted entry, developmental entry plus retirement, or retirement only',()=>{
  const near=render(shown(graduate()));assert.match(near,/신고선수 입단/);assert.match(near,/은퇴/);assert.match(near,/성장과 기회가 제한적/);
  assert.ok(!near.includes('대학 진학')&&!near.includes('입단 테스트'));
  const missed=render(shown(graduate(20)));assert.match(missed,/은퇴/);assert.ok(!missed.includes('신고선수 입단'));
  const s=graduate();s.draft[0].playerId=s.playerId;const picked=render(shown(s));assert.match(picked,/프로 입단/);assert.ok(!picked.includes('은퇴'));
});
test('developmental entry preserves the player and school records, starts in the correct farm team, and rejects ineligible entry',()=>{
  const old=shown(graduate()),p=e.getPlayer(old);p.seasonStats.batting.PA=123;
  const next=pc.continueCareer(old,'developmental'),q=e.getPlayer(next);
  assert.equal(q.id,p.id);assert.deepEqual(q.stats,p.stats);assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.equal(q.career[0].records.batting.PA,123);
  assert.equal(q.teamId,30);assert.equal(q.proContract.status,'developmental');assert.equal(next.postSchool.pro.level,'developmental');assert.equal(e.growthMultiplier(q),.9);assert.equal(next.postSchool.pro.entry,'developmental');
  assert.equal(next.careerNotice.kind,'entry');assert.match(next.careerNotice.message,/90%/);
  assert.equal(next.draft.some(row=>row.playerId===p.id),false);assert.throws(()=>pc.continueCareer(shown(graduate(20)),'developmental'),/제의가 없습니다/);
});
test('developmental training and event growth are 90%, with unmodified fatigue, negative effects and talent exposure',()=>{
  const s=developmental(),p=e.getPlayer(s),regular=structuredClone(p);delete regular.proContract;
  const before={...p.stats};e.train(p,1);e.train(regular,1);
  for(const key of Object.keys(p.stats))close(p.stats[key]-before[key],.9*(regular.stats[key]-before[key]));
  assert.equal(p.fatigue,regular.fatigue);assert.deepEqual(p.talentExposure,regular.talentExposure);
  for(const key of ['power','velocity','arm','bq']){p.stats[key]=40;regular.stats[key]=40;close(eventTrainingReward(p,key,4),.9*eventTrainingReward(regular,key,4));}
});
test('developmental status reduces selection score by six and prevents first-team registration until conversion',()=>{
  const s=developmental(),p=e.getPlayer(s),regular=structuredClone(p);delete regular.proContract;
  close(e.selectionScore(regular)-e.selectionScore(p),6);
  for(const key of Object.keys(p.stats))p.stats[key]=99;s.date='2028-03-15';pc.reviewProRoster(s);assert.ok(p.teamId>=10);assert.equal(p.proContract.status,'developmental');assert.notEqual(s.postSchool.pro.level,'first');
});
test('only qualified farm-game performance converts once, without stat gifts, and restores full growth and selection',()=>{
  const s=developmental(),p=e.getPlayer(s),stats={...p.stats};p.seasonStats.batting.PA=200;assert.equal(pc.reviewDevelopmentContract(s),false);
  const b=p.seasonByLevel.second.batting;Object.assign(b,{PA:80,AB:72,H:25,BB:8,HR:2,'2B':5});
  assert.equal(pc.reviewDevelopmentContract(s),true);assert.equal(p.proContract.status,'regular');assert.equal(s.careerNotice.kind,'registered');assert.deepEqual(p.stats,stats);
  assert.equal(pc.reviewDevelopmentContract(s),false);delete s.careerNotice;assert.equal(pc.reviewDevelopmentContract(s),false);
  assert.equal(e.growthMultiplier(p),1);const regular=structuredClone(p);delete regular.proContract;close(e.selectionScore(p),e.selectionScore(regular));
});
test('starter conversion requires 20 innings, ERA <=6 and two wins; two-way players can qualify in either field',()=>{
  const s=developmental(),p=e.getPlayer(s);e.assignRole(p,'선발');const r=p.seasonByLevel.second.pitching;
  p.seasonByLevel.second.games={wins:2};Object.assign(r,{outs:59,BF:90,ER:8,SO:0});assert.equal(pc.developmentProgress(p).qualified,false);
  r.outs=60;assert.equal(pc.developmentProgress(p).qualified,true);p.seasonByLevel.second.games.wins=1;assert.equal(pc.developmentProgress(p).qualified,false);p.seasonByLevel.second.games.wins=2;
  r.ER=14;assert.equal(pc.developmentProgress(p).qualified,false);
  p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};
  Object.assign(p.seasonByLevel.second.batting,{PA:80,AB:72,H:25,BB:8,HR:2,'2B':5});assert.equal(pc.developmentProgress(p).qualified,true);
});

test('relievers and closers can convert after eight one-inning appearances while quality thresholds still apply',()=>{
  for(const role of ['중간계투','마무리']){
    const s=developmental(),p=e.getPlayer(s);e.assignRole(p,role);
    const r=p.seasonByLevel.second.pitching;
    p.seasonByLevel.second.games={holds:5,saves:3};
    assert.equal(pc.developmentProgress(p).pitchingInningsRequired,8);
    // A successful short outing counts toward the same season, without needing
    // starter-sized workloads or credits for simulated innings not pitched.
    for(let game=0;game<8;game++){
      r.outs+=3;r.BF+=5;r.SO++;
      assert.equal(pc.developmentProgress(p).qualified,game===7);
    }
    r.outs=23;assert.equal(pc.developmentProgress(p).qualified,false);
    r.outs=24;r.ER=6;assert.equal(pc.developmentProgress(p).qualified,false);
    r.ER=5;r.SO=0;assert.equal(pc.developmentProgress(p).qualified,true);p.seasonByLevel.second.games[role==='마무리'?'saves':'holds']--;assert.equal(pc.developmentProgress(p).qualified,false);p.seasonByLevel.second.games[role==='마무리'?'saves':'holds']++;
    r.BF=50;r.SO=9;assert.equal(pc.developmentProgress(p).qualified,true);
    const stats={...p.stats};
    assert.equal(pc.reviewDevelopmentContract(s),true);assert.equal(p.proContract.status,'regular');
    assert.equal(s.careerNotice.kind,'registered');assert.deepEqual(p.stats,stats);
    assert.equal(pc.reviewDevelopmentContract(s),false);
  }
});

test('conversion uses the two-way pitching role and ignores first-team or previous-season relief innings',()=>{
  const s=developmental(),p=e.getPlayer(s);e.assignRole(p,'마무리');
  Object.assign(p.seasonByLevel.first.pitching,{outs:24,BF:40,SO:8});
  p.career.push({year:s.calendar.seasonYear-1,grade:0,records:e.emptyRecord(),stats:{...p.stats},schoolId:p.teamId,schoolName:'전 시즌',byLevel:structuredClone(p.seasonByLevel)});
  assert.equal(pc.developmentProgress(p).qualified,false);
  Object.assign(p.seasonByLevel.second.pitching,{outs:24,BF:40,SO:0});p.seasonByLevel.second.games={saves:3};
  p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};
  assert.equal(pc.developmentProgress(p).pitchingInningsRequired,20);assert.equal(pc.developmentProgress(p).qualified,false);
  p.twoWay.pitchingPosition='CP';assert.equal(pc.developmentProgress(p).qualified,true);
});
test('conversion pauses before the next game or training and acknowledgment resumes without repeating the event',()=>{
  let s=developmental(),p=e.getPlayer(s);Object.assign(p.seasonByLevel.second.batting,{PA:80,AB:72,H:25,BB:8,HR:2,'2B':5});
  const next=e.advanceWeek(s,p.trainingPolicy,p.stance);assert.equal(next.careerNotice.kind,'registered');assert.equal(next.date,s.date);assert.equal(next.week,s.week);assert.equal(next.report.fatigue.training,0);
  s=pc.acknowledgeCareer(next);s.rngStates.events=1;const resumed=e.advanceWeek(s,p.trainingPolicy,p.stance);
  assert.equal(e.getPlayer(resumed).proContract.status,'regular');assert.ok(!resumed.careerNotice);assert.equal(resumed.week,next.week+1);
});
