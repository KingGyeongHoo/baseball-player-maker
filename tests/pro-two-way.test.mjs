import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),dual=require('../.test-build/lib/sim/pro-two-way.js'),world=require('../.test-build/lib/sim/pro-world.js'),market=require('../.test-build/lib/sim/pro-market.js');
const save=require('../.test-build/lib/career-save.js');
const template=e.createGame('two-way-v071','겸업검증','SS');
const pitchKeys=['velocity','control','movement'],batKeys=['contact','power','speed','defense'];
function skills(p,pitch,bat){for(const key of pitchKeys)p.stats[key]=pitch;for(const key of batKeys)p.stats[key]=bat;}
function graduate(pitch=80,bat=60,twoWay=true){const s=structuredClone(template),p=e.getPlayer(s);skills(p,pitch,bat);if(twoWay){p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:2};p.eligiblePositions.push('SP','RP','CP');}p.grade=3;p.reputation=e.reputationScore(p);s.phase='ended';s.date=s.calendar.draftDate;s.draft=[{playerId:p.id,playerName:p.name,teamName:s.teams[p.teamId].name,club:e.draftClubs[0],overall:1,round:1,slot:1,role:p.primaryRole,score:80,ability:e.overall(p),abilityRank:1,reputation:p.reputation,talent:5,fit:60,components:{reputation:60,talent:10,fit:10}}];return pc.revealDraftResult?pc.revealDraftResult(s):require('../.test-build/lib/sim/draft-outcome.js').revealDraftResult(s);}
const entered=pc.acknowledgeCareer(pc.continueCareer(graduate(),'join'));
const fixture=()=>structuredClone(entered);
function days(s,n){for(let i=0;i<n;i++){dual.recordProTwoWayDay(s);s.date=e.addDays(s.date,1);}}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('representative OVR uses the active primary discipline or the mean for two-way players, preserving raw skills',()=>{
  const p=e.getPlayer(structuredClone(template));skills(p,80,60);assert.equal(e.overall(p),60);p.primaryRole='선발';assert.equal(e.overall(p),80);
  const before={...p.stats};p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};assert.equal(e.overall(p),70);assert.deepEqual(p.stats,before);assert.equal(e.combinedOvr(p),140);
  skills(p,100,100);assert.equal(e.overall(p),100);
});
test('pro entry requires both ratings at 75, preserves qualified high-school two-way roles and rejects 74.999',()=>{
  for(const [pitch,bat,kept] of [[75,75,true],[80,78,true],[74.999,80,false],[80,74.999,false]]){const old=graduate(pitch,bat),p=e.getPlayer(old),n=pc.continueCareer(old,'join'),q=e.getPlayer(n);assert.equal(!!q.twoWay,kept);assert.deepEqual(q.stats,p.stats);assert.deepEqual(q.talent,p.talent);assert.equal(q.id,p.id);assert.equal(q.career[0].year,2027);if(kept){assert.deepEqual(q.twoWay,p.twoWay);assert.equal(e.overall(q),(pitch+bat)/2);}else assert.equal(e.overall(q),Math.max(pitch,bat));}
});
test('single-role pro entry selects the stronger discipline, keeps tied primary roles, history, policy and fractional skills',()=>{
  for(const [pitch,bat,position] of [[80,60,'SP'],[60,80,'SS'],[60.125,60.125,'SS']]){const old=graduate(pitch,bat),p=e.getPlayer(old),q=e.getPlayer(pc.continueCareer(old,'join'));assert.equal(q.position,position);assert.deepEqual(q.stats,p.stats);assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.deepEqual(q.professional.twoWayReview.positions,{pitchingPosition:'SP',battingPosition:'SS'});assert.equal(q.professional.twoWayHistory.length,1);assert.ok(q.eligiblePositions.every(pos=>['SP','RP','CP'].includes(pos)===(position==='SP')));}
});
test('entry migration runs once on old pro saves and preserves stats, RNG and school records',()=>{
  const s=fixture(),p=e.getPlayer(s);delete p.professional.twoWayReview;delete p.professional.twoWayHistory;p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};skills(p,60,80);const stats={...p.stats},rng={...s.rngStates},career=structuredClone(p.career);world.ensureProWorld(s);assert.equal(p.position,'SS');assert.equal(p.twoWay,undefined);assert.equal(p.professional.twoWayHistory.length,1);world.ensureProWorld(s);assert.equal(p.professional.twoWayHistory.length,1);assert.deepEqual(p.stats,stats);assert.deepEqual(s.rngStates,rng);assert.deepEqual(p.career,career);
});
test('a pro proposal requires 28 continuous completed dates, resets on a dip, and counts checkpoint resumes once',()=>{
  const s=fixture(),p=e.getPlayer(s);skills(p,75,75);days(s,27);assert.equal(dual.reviewProTwoWay(s),false);dual.recordProTwoWayDay(s);dual.recordProTwoWayDay(s);assert.equal(p.professional.twoWayReview.qualifiedDays,28);assert.equal(dual.reviewProTwoWay(s),true);assert.equal(s.careerEvent.definitionId,'PRO16');assert.equal(s.careerEvent.choices.length,2);
  const reset=fixture(),q=e.getPlayer(reset);skills(q,80,80);days(reset,20);q.stats.contact=50;days(reset,1);assert.equal(q.professional.twoWayReview.qualifiedDays,0);q.stats.contact=80;days(reset,27);assert.equal(dual.reviewProTwoWay(reset),false);days(reset,1);assert.equal(dual.reviewProTwoWay(reset),true);
});
test('accepting the pro two-way proposal adds real eligibility and changes OVR without any free stat growth',()=>{
  const s=fixture(),p=e.getPlayer(s);skills(p,80,78);days(s,28);assert.ok(dual.reviewProTwoWay(s));const before=structuredClone(s),n=e.answerCareerEvent(s,'accept'),q=e.getPlayer(n);assert.deepEqual(s,before);assert.ok(q.twoWay);assert.equal(e.overall(q),79);assert.deepEqual(q.stats,p.stats);assert.deepEqual(q.talent,p.talent);assert.ok(q.eligiblePositions.includes('SS')&&q.eligiblePositions.includes('SP'));assert.ok(n.careerEventHistory.at(-1).twoWay);assert.equal(q.professional.twoWayReview.qualifiedDays,0);assert.equal(n.careerEvent,null);
});
test('declining a proposal has no skill penalty and prevents immediate repeated proposals',()=>{
  let s=fixture(),p=e.getPlayer(s);skills(p,80,80);days(s,28);dual.reviewProTwoWay(s);const stats={...p.stats};s=e.answerCareerEvent(s,'decline');p=e.getPlayer(s);assert.equal(p.twoWay,undefined);assert.deepEqual(p.stats,stats);days(s,28);assert.equal(dual.reviewProTwoWay(s),false);assert.equal(p.professional.twoWayHistory.at(-1).action,'겸업 제안 보류');
});
test('maintenance uses a lower 70 threshold, resets at 70 and does not churn at 74',()=>{
  const s=pc.acknowledgeCareer(pc.continueCareer(graduate(80,78),'join')),p=e.getPlayer(s);skills(p,74,74);days(s,35);assert.equal(dual.reviewProTwoWay(s),false);assert.ok(p.twoWay);skills(p,69.99,80);days(s,27);assert.equal(dual.reviewProTwoWay(s),false);skills(p,70,80);days(s,1);assert.equal(p.professional.twoWayReview.belowDays,0);skills(p,69.99,80);days(s,28);assert.equal(dual.reviewProTwoWay(s),true);assert.equal(s.careerEvent.definitionId,'PRO17');const n=e.answerCareerEvent(s,'focus'),q=e.getPlayer(n);assert.equal(q.twoWay,undefined);assert.equal(q.position,'SS');assert.deepEqual(q.stats,p.stats);assert.ok(!q.eligiblePositions.includes('SP'));
});
test('fatigue and injury penalties do not reduce basic qualification or cause an invalid maintenance proposal',()=>{
  const s=fixture(),p=e.getPlayer(s);skills(p,80,80);p.fatigue=95;p.forcedRest=true;p.injury={severity:'severe',startDate:s.date,unavailableUntil:e.addDays(s.date,40),originalPenalty:30,penaltyRemaining:30,penaltyRecoverDays:10};days(s,28);assert.equal(p.professional.twoWayReview.qualifiedDays,28);assert.equal(dual.reviewProTwoWay(s),false);p.injury=null;p.forcedRest=false;p.fatigue=0;assert.equal(dual.reviewProTwoWay(s),true);
});
test('offseason and unattached gaps do not count as a continuous four-week evaluation',()=>{
  const s=fixture(),p=e.getPlayer(s);skills(p,80,80);days(s,20);s.proWorld.stage='offseason';days(s,15);assert.equal(p.professional.twoWayReview.qualifiedDays,20);s.proWorld.stage='camp';assert.equal(dual.reviewProTwoWay(s),false);assert.equal(p.professional.twoWayReview.qualifiedDays,0);days(s,28);p.professional.employment='freeAgent';s.date=e.addDays(s.date,30);p.professional.employment='active';assert.equal(dual.reviewProTwoWay(s),false);assert.equal(p.professional.twoWayReview.qualifiedDays,0);
});
test('NPCs use the same thresholds and continuous evaluation without spawning a player modal',()=>{
  const s=fixture(),p=s.players.find(q=>q.id!==s.playerId);skills(p,80,80);days(s,28);assert.equal(dual.reviewProTwoWay(s),false);assert.ok(p.twoWay);assert.equal(s.careerEvent,null);assert.equal(e.overall(p),80);assert.ok(p.professional.twoWayHistory.some(row=>row.action==='프로 겸업 시작'));
});
test('a position trial changes the active field without bypassing the pro two-way threshold',()=>{
  const s=fixture(),p=e.getPlayer(s);skills(p,60,70);p.professional.roleTrial={position:'SS',until:s.date};market.finishRoleTrial(s);assert.equal(p.position,'SS');assert.equal(p.twoWay,undefined);assert.ok(p.eligiblePositions.every(pos=>!['SP','RP','CP'].includes(pos)));assert.deepEqual(p.stats.contact,70);
});
test('saved evaluation and pending pro proposals restore exactly and resolve identically',()=>{
  const s=fixture(),p=e.getPlayer(s);skills(p,80,78);days(s,28);dual.reviewProTwoWay(s);const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored,s);assert.deepEqual(e.answerCareerEvent(restored,'accept'),e.answerCareerEvent(s,'accept'));
});
test('new pro worlds center primary OVRs at 65/55 and secondary OVRs at 15 without manufacturing elite two-way NPCs',()=>{
  const s=fixture(),base=s.players.filter(p=>p.id.startsWith('pro-npc-'));for(const [first,target] of [[true,65],[false,55]]){const group=base.filter(p=>(p.teamId<10)===first),mean=(get)=>group.reduce((n,p)=>n+get(p),0)/group.length;assert.ok(Math.abs(mean(p=>e.ovr(p))-target)<1);assert.ok(Math.abs(mean(p=>e.ovr(p,!e.isPitcher(p.primaryRole)))-15)<1);assert.equal(group.filter(dual.proTwoWayQualified).length,0);}
});
test('being two-way itself never multiplies normal training growth',()=>{
  const p=e.getPlayer(fixture()),q=structuredClone(p);skills(p,76,76);skills(q,76,76);q.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};const before={...p.stats};e.train(p,1);e.train(q,1);for(const key of Object.keys(p.stats))close(p.stats[key]-before[key],q.stats[key]-before[key]);
});
test('an event on an old save preserves historical sum ratings and appends a new 100-point rating',()=>{
  const s=fixture(),p=e.getPlayer(s);skills(p,80,78);s.history=[{week:0,ovr:155,fatigue:0}];days(s,28);dual.reviewProTwoWay(s);const n=e.answerCareerEvent(s,'accept');assert.deepEqual(n.history[0],s.history[0]);assert.equal(n.history.at(-1).ovr,79);assert.equal(n.history.at(-1).ovrScale,100);
});
