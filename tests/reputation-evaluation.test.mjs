import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const r=require('../.test-build/lib/sim/evaluation-reputation.js'),a=require('../.test-build/lib/sim/player-evaluation.js'),l=require('../.test-build/lib/sim/evaluation-lifecycle.js');
const creation=require('../.test-build/lib/player-creation.js'),world=require('../.test-build/lib/sim/pro-world.js'),save=require('../.test-build/lib/career-save.js');
const {ReputationDetails}=require('../.test-build/app/components/player-evaluation.js');
e.params['pro_events.enabled']=0;
const school=e.createGame('reputation-evaluation','평판선수','SS');
const pro=creation.createRandomProCareer('프로평판','SS',21,{randomUUID:()=> 'reputation-evaluation-pro',getRandomValues:a=>{a[0]=0;return a;}});
const close=(x,y)=>assert.ok(Math.abs(x-y)<1e-8,`${x} != ${y}`);
function batting(n,h,hr=0,bb=0){const q=e.emptyRecord();Object.assign(q.batting,{PA:n,AB:n-bb,H:h,HR:hr,BB:bb,SO:Math.floor(n*.2)});return q;}
function fixture(professional=false){const s=structuredClone(professional?pro:school),p=e.getPlayer(s);s.players=[p,...s.players.filter(q=>q.id!==p.id).slice(0,24)];s.calendar.events=[];for(const q of s.players){for(const k of Object.keys(q.stats))q.stats[k]=60;q.reputationBonus=0;q.career=[];q.seasonStats=batting(400,100,10,30);delete q.twoWay;if(professional){q.seasonByLevel={first:batting(400,100,10,30),second:batting(400,100,10,30)};q.professional.proBonus=0;}}return s;}

test('role-based reputation changes neither primary nor two-way OVR, and ignores hidden talent and temporary fatigue',()=>{
  const s=fixture(),p=e.getPlayer(s);p.seasonStats=e.emptyRecord();Object.assign(p.stats,{contact:40,power:90,speed:20,defense:80,arm:70});r.updateEvaluationReputations(s);
  const initial=e.overall(p),score=e.reputationScore(p);assert.notEqual(e.roleScore(p),initial);close(score,e.roleScore(p));
  p.talent={batting:10,pitching:1};p.fatigue=100;p.injury={penaltyRemaining:20};close(e.reputationScore(p),score);close(e.overall(p),initial);
  p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};close(e.overall(p),(e.ovr(p,true)+e.ovr(p,false))/2);
});
test('unmeasured legacy performance is not treated as actual fifty-point evidence',()=>{
  const s=fixture(),p=e.getPlayer(s);p.seasonStats=e.emptyRecord();delete p.reputationEvaluation;p.performanceReputation=99;r.updateEvaluationReputations(s);
  assert.equal(p.performanceReputation,null);assert.equal(r.reputationBreakdown(p).performanceWeight,0);close(p.reputation,e.roleScore(p));
});
test('a tiny hot streak has less influence than a well-evidenced season',()=>{
  const s=fixture(),p=e.getPlayer(s);p.seasonStats=batting(10,5,2,1);r.updateEvaluationReputations(s);const tiny=r.reputationBreakdown(p);
  p.seasonStats=batting(400,200,80,40);r.updateEvaluationReputations(s);const large=r.reputationBreakdown(p);
  assert.ok(tiny.performanceWeight<.06);assert.ok(large.performanceWeight>.3&&large.performanceWeight<.4);assert.ok(large.total>tiny.total);
});
test('pro reputation is removed and farm season evidence remains less influential than first-team evidence',()=>{
  const s=fixture(true),p=e.getPlayer(s);p.seasonByLevel.first=e.emptyRecord();p.seasonByLevel.second=batting(400,240,100,40);world.reviewProfessionalReputation(s);
  const farm=e.proSelectionScore(p);assert.equal(p.reputation,null);assert.equal(p.reputationEvaluation,undefined);
  p.seasonByLevel.first=structuredClone(p.seasonByLevel.second);p.seasonByLevel.second=e.emptyRecord();world.reviewProfessionalReputation(s);
  assert.ok(e.proSelectionScore(p)>farm);assert.equal(p.reputation,null);
});
test('first-team PA 100 and pitching 30 IP never discard farm evidence or cause a threshold jump',()=>{
  const s=fixture(true),p=e.getPlayer(s);p.seasonByLevel.first=batting(99,28,3,10);p.seasonByLevel.second=batting(200,80,15,20);r.updateEvaluationReputations(s);const before=e.proSelectionScore(p);
  p.seasonByLevel.first.batting.PA++;p.seasonByLevel.first.batting.AB++;r.updateEvaluationReputations(s);assert.ok(Math.abs(e.proSelectionScore(p)-before)<1);assert.equal(p.reputationEvaluation,undefined);
  p.position='SP';p.primaryRole='선발';for(const n of [89,90,91]){Object.assign(p.seasonByLevel.first.pitching,{BF:120,outs:n,SO:35,BB:10,HR:2});Object.assign(p.seasonByLevel.second.pitching,{BF:100,outs:70,SO:30,BB:10,HR:1});r.updateEvaluationReputations(s);if(n===89)p.previousSelection=e.proSelectionScore(p);else close(e.proSelectionScore(p),p.previousSelection);}
});
test('a pitcher with incidental batting appearances is assessed on pitching rather than their batting OPS',()=>{
  const s=fixture(true),p=e.getPlayer(s);p.position='SP';p.primaryRole='선발';p.seasonByLevel.first=batting(1,1,1);Object.assign(p.seasonByLevel.first.pitching,{BF:200,outs:150,SO:70,BB:10,HR:2});r.updateEvaluationReputations(s);const before=e.proSelectionScore(p);
  p.seasonByLevel.first.batting=batting(1,0).batting;r.updateEvaluationReputations(s);close(e.proSelectionScore(p),before);assert.equal(p.reputation,null);
});
test('two-way performance confidence is independent for each field and fields are averaged once',()=>{
  const s=fixture(),p=e.getPlayer(s);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};p.seasonStats=batting(400,140,20,30);Object.assign(p.seasonStats.pitching,{BF:5,outs:3,SO:2,BB:1});r.updateEvaluationReputations(s);
  const q=r.reputationBreakdown(p);assert.equal(q.fields.length,2);assert.ok(q.fields[0].performanceWeight<q.fields[1].performanceWeight);close(q.base,(q.fields[0].score+q.fields[1].score)/2);assert.ok(q.total<100);
});
test('promotion retains observed performance and events without inventing freshman evidence',()=>{
  const s=fixture(),p=e.getPlayer(s);p.seasonStats=batting(400,150,25,40);p.reputationBonus=4;s.date='2027-12-31';r.updateEvaluationReputations(s);const before=p.reputation,performance=p.performanceReputation;
  e.promote(s);s.date='2028-03-01';r.updateEvaluationReputations(s);close(p.reputation,before);close(p.performanceReputation,performance);assert.equal(p.reputationBonus,4);assert.ok(s.players.filter(q=>q.grade===1).every(q=>q.performanceReputation===null));
});
test('role changes never count old batting records as pitching evidence',()=>{
  const s=fixture(),p=e.getPlayer(s);p.seasonStats=batting(400,180,50,40);r.updateEvaluationReputations(s);const battingScore=p.performanceReputation;e.assignRole(p,'선발');r.updateEvaluationReputations(s);
  assert.ok(battingScore!==null);assert.equal(p.performanceReputation,null);assert.ok(p.reputationEvaluation.fields.batting.school);assert.equal(p.reputationEvaluation.fields.pitching.school,null);close(p.reputation,e.roleScore(p));
});
test('legacy professional reputation and bonuses do not affect selection or survive migration',()=>{
  const s=fixture(true),p=e.getPlayer(s),before=e.proSelectionScore(p);p.reputation=100;p.reputationBonus=99;p.professional.proBonus=10;p.professional.allstarBonus=8;
  r.updateEvaluationReputations(s);assert.equal(e.reputationScore(p),null);assert.equal(e.proSelectionScore(p),before);assert.equal(p.reputation,null);assert.equal(p.reputationBonus,undefined);assert.equal(p.professional.proBonus,0);assert.equal(p.professional.allstarBonus,undefined);
  p.reputation=99;p.reputationBonus=77;const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state,q=e.getPlayer(loaded);assert.equal(q.reputation,null);assert.equal(q.reputationBonus,undefined);assert.equal(loaded.players.length,s.players.length);
});
test('new reputation affects the existing 80:10:10 draft formula without changing OVR or random streams',()=>{
  const s=fixture(),p=e.getPlayer(s),other=s.players[1];for(const q of s.players){q.grade=3;q.primaryRole='센터라인';q.position='SS';q.talent={batting:5,pitching:5};}p.seasonStats=batting(400,180,45,40);other.seasonStats=batting(400,60,1,10);
  const stats=structuredClone(s.players.map(p=>p.stats)),rng=structuredClone(s.rngStates);e.updateReputation(s);assert.ok(p.reputation>other.reputation);assert.deepEqual(s.rngStates,rng);assert.deepEqual(s.players.map(p=>p.stats),stats);
  const forecast=e.draftForecast(s),best=forecast.find(q=>q.playerId===p.id),worst=forecast.find(q=>q.playerId===other.id);assert.ok(best&&(!worst||best.overall<worst.overall));close(best.components.reputation,.8*p.reputation);close(best.score,best.components.reputation+best.components.talent+best.components.fit);
});
test('saves and dated evaluation snapshots retain reputation inputs and prevent retroactive recalculation',()=>{
  const s=fixture(),p=e.getPlayer(s);r.updateEvaluationReputations(s);l.capturePlayerEvaluations(s,'contract',[p.id]);const obs=p.evaluationHistory.at(-1),before=a.restoreEvaluation(s,p,obs).reputation;
  p.reputationBonus=90;p.stats.contact=100;r.updateEvaluationReputations(s);assert.deepEqual(a.restoreEvaluation(s,p,obs).reputation,before);
  const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s,false)));assert.deepEqual(e.getPlayer(loaded.state).reputationEvaluation,p.reputationEvaluation);
  const legacy=structuredClone(obs);delete legacy.reputation;assert.equal(a.restoreEvaluation(s,p,legacy).reputation,undefined);
});
test('the report explains role-based reputation and the unchanged OVR calculation',()=>{
  const s=fixture();r.updateEvaluationReputations(s);const html=renderToStaticMarkup(createElement(ReputationDetails,{data:r.reputationBreakdown(e.getPlayer(s))}));assert.match(html,/평판 평가/);assert.match(html,/성적 반영/);assert.match(html,/OVR 계산은 그대로/);assert.doesNotMatch(html,/출전 전 성과는 중립 50점/);
});
