import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {releaseTwoWay}=require('../.test-build/lib/two-way-release.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const dual=require('../.test-build/lib/sim/pro-two-way.js');
const storage=require('../.test-build/lib/career-save.js');
const Center=require('../.test-build/app/components/training-center.js').default;
const Release=require('../.test-build/app/components/two-way-release.js').default;
const template=e.createGame('release-two-way','겸업','SS');
function school(){const s=structuredClone(template),p=e.getPlayer(s);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:2};p.eligiblePositions.push('SP','RP','CP');return s;}
function pro(){const s=pc.acknowledgeCareer(pc.createProfessionalDemo('release-pro','겸업','SS')),p=e.getPlayer(s);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};p.eligiblePositions.push('SP','RP','CP');return s;}
function skills(p,pitch,bat){for(const k of ['velocity','control','movement'])p.stats[k]=pitch;for(const k of ['contact','power','speed','defense'])p.stats[k]=bat;}
test('school and pro players can choose either discipline, retaining skills, policy, records and input state',()=>{
  for(const factory of [school,pro])for(const focus of ['pitching','batting']){
    const s=factory(),p=e.getPlayer(s);skills(p,40,80);const before=structuredClone(s),n=releaseTwoWay(s,focus),q=e.getPlayer(n);
    assert.deepEqual(s,before);assert.equal(q.twoWay,undefined);assert.equal(q.position,focus==='pitching'?'SP':'SS');assert.deepEqual(q.stats,p.stats);assert.deepEqual(q.initialStats,p.initialStats);assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.deepEqual(q.stance,p.stance);assert.deepEqual(q.career,p.career);assert.deepEqual(q.seasonStats,p.seasonStats);assert.deepEqual(q.professional?.contract,p.professional?.contract);assert.deepEqual(n.rngStates,s.rngStates);
    assert.ok(q.eligiblePositions.every(pos=>['SP','RP','CP'].includes(pos)===(focus==='pitching')));assert.equal(n.careerEventHistory.at(-1).definitionId,'TWO_WAY_RELEASE');
    if(q.professional){assert.equal(q.professional.twoWayReview.qualifiedDays,0);assert.equal(q.professional.twoWayReview.nextProposalDate,e.addDays(s.date,91));}else assert.ok(n.careerOpportunities.twoWayOfferedGrades.includes(q.grade));
    const restored=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(n))).state;assert.equal(e.getPlayer(restored).twoWay,undefined);assert.equal(e.getPlayer(restored).position,q.position);
  }
});
test('release cannot bypass progress or unresolved decisions and cannot repeat',()=>{
  const s=school();assert.throws(()=>releaseTwoWay(releaseTwoWay(s,'pitching'),'batting'),/겸업 선수/);
  for(const field of ['weekProgress','matchProgress','careerEvent','careerNotice','pendingEventOutcome']){const blocked=structuredClone(s);blocked[field]={};assert.throws(()=>releaseTwoWay(blocked,'pitching'),/진행/);}
  assert.throws(()=>releaseTwoWay(s,'other'),/분야/);
});
test('automatic release chooses the stronger discipline after 28 days without a selection event',()=>{
  for(const [pitch,bat,position] of [[80,59,'SP'],[59,80,'SS']]){
    const s=pro(),p=e.getPlayer(s);skills(p,pitch,bat);const before=structuredClone(p);
    for(let day=0;day<27;day++){dual.recordProTwoWayDay(s);s.date=e.addDays(s.date,1);}assert.equal(dual.reviewProTwoWay(s),false);assert.ok(p.twoWay);
    dual.recordProTwoWayDay(s);assert.equal(dual.reviewProTwoWay(s),true);assert.equal(p.position,position);assert.equal(p.twoWay,undefined);assert.equal(s.careerEvent,null);assert.match(s.careerNotice.title,/자동 해제/);assert.deepEqual(p.stats,before.stats);assert.deepEqual(p.trainingPolicy,before.trainingPolicy);assert.deepEqual(p.career,before.career);assert.equal(p.professional.twoWayReview.belowDays,0);
  }
});
test('training card places release below talents, displays only for two-way players, and locks while busy',()=>{
  const s=school(),p=e.getPlayer(s),props={state:s,policy:p.trainingPolicy,setPolicy(){},stance:p.stance,setStance(){},onSave(){},onChange(){}};
  const html=renderToStaticMarkup(createElement(Center,props));assert.ok(html.indexOf('투수 재능')<html.indexOf('겸업 해제 신청'));assert.ok(html.includes('겸업 해제 신청'));
  assert.match(renderToStaticMarkup(createElement(Release,{state:s,onChange(){},disabled:true})),/disabled/);
  delete p.twoWay;assert.equal(renderToStaticMarkup(createElement(Release,{state:s,onChange(){}})),'');
});
test('an old forced-release choice cannot select the weaker discipline',()=>{
  const s=pro(),p=e.getPlayer(s);skills(p,80,50);
  s.careerEvent={definitionId:'PRO17'};
  dual.applyProTwoWayChoice(s,{proTwoWayAction:'batting'});
  assert.equal(p.twoWay,undefined);assert.equal(p.position,'SP');
});
