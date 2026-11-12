import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const h=require('../.test-build/lib/sim/handedness.js');
const eligibility=require('../.test-build/lib/sim/position-eligibility.js');
const {twoWayPositions}=require('../.test-build/lib/sim/career-opportunities.js');
const {proFieldTarget}=require('../.test-build/lib/sim/pro-event-evidence.js');
const {suggestedRole,eventTrainingReward}=require('../.test-build/lib/sim/event-system.js');
const {proSelectionScore}=require('../.test-build/lib/sim/pro-selection.js');
const {beginProRoleTrial}=require('../.test-build/lib/sim/pro-role-evaluation.js');
const blocked=['C','2B','3B','SS'];
test('hand draws give exact 70:30 pitchers and 45:45:10 batting intervals',()=>{
  const counts={R:0,L:0,B:0};let left=0;
  for(let i=0;i<1000;i++){let n=0;const p=h.randomPlayerHands('SP',()=>n++?(i+.5)/1000:(i+.5)/1000);left+=p.throws==='L';counts[p.bats]++;}
  assert.equal(left,300);assert.deepEqual(counts,{R:450,L:450,B:100});
  for(const pos of blocked)assert.equal(h.randomPlayerHands(pos,()=>0).throws,'R');
});
test('all new school players obey eligibility, and role changes and offers exclude left catchers',()=>{
  const s=e.createGame('hands-regression','선수','SP');
  for(const p of s.players){assert.ok(['R','L'].includes(p.throws));assert.ok(['R','L','B'].includes(p.bats));assert.ok(eligibility.canPlayPosition(p,p.position));assert.ok(p.eligiblePositions.every(pos=>eligibility.canPlayPosition(p,pos)));}
  const p=e.getPlayer(s);p.throws='L';p.bats='R';p.offerCooldown=0;
  for(const key of Object.keys(p.stats))p.stats[key]=60;
  assert.throws(()=>e.assignRole(p,'포수'),/좌투/);
  assert.notEqual(suggestedRole(p),'포수');
  assert.ok(!blocked.includes(twoWayPositions(p).battingPosition));
  e.assignRole(p,'센터라인');assert.equal(p.position,'CF');assert.ok(p.eligiblePositions.every(pos=>eligibility.canPlayPosition(p,pos)));
  p.position='1B';p.eligiblePositions=['1B','3B','C','SS'];assert.ok(!blocked.includes(proFieldTarget(s,p)));
  p.professional={employment:'active'};
  for(const pos of blocked)assert.throws(()=>beginProRoleTrial(s,pos,'test'),/좌투/);
});
test('left pitcher assessment bonus is 5%, while batting and OVR stay unchanged',()=>{
  const p=e.previewPlayer('hands-bonus','선수','SP');for(const k of Object.keys(p.stats))p.stats[k]=60;
  p.bats='R';p.throws='R';p.fatigue=0;p.recentZ=0;p.reputationBonus=0;delete p.reputationEvaluation;
  const right=e.selectionScore(p),rep=e.reputationScore(p);p.throws='L';
  assert.ok(Math.abs(e.selectionScore(p)-right*1.05)<1e-8);assert.ok(Math.abs(e.reputationScore(p)-rep*1.05)<1e-8);assert.equal(e.ovr(p,true),60);
  p.careerMode='pro';assert.equal(proSelectionScore(p),63);p.throws='R';assert.equal(proSelectionScore(p),60);
  assert.equal(h.leftPitcherMultiplier({throws:'L'},'코너 야수'),1);
});
test('switch contact starts at 1.2x and both training and event growth use 1.2x',()=>{
  const p=e.previewPlayer('switch','선수','1B');p.bats='B';p.stats.contact=50;h.applySwitchContact(p);assert.equal(p.stats.contact,60);
  const r=structuredClone(p);r.bats='R';p.stats.contact=r.stats.contact=50;
  const before=p.stats.contact;e.train(p,1);e.train(r,1);assert.ok(Math.abs((p.stats.contact-before)/(r.stats.contact-before)-1.2)<1e-8);
  p.stats.contact=r.stats.contact=50;assert.ok(eventTrainingReward(p,'contact',1)>eventTrainingReward(r,'contact',1));
});
test('professional NPC generation retains random hands and left-position restrictions',()=>{
  const {createCareerNPC}=require('../.test-build/lib/sim/pro-roster.js');
  const hands=new Set(),bats=new Set();
  for(let i=0;i<120;i++){
    const position=i%2?'SP':blocked[i%blocked.length];
    const p=createCareerNPC(`pro-hands:${i}`,0,i,'pro',true,position);
    assert.ok(eligibility.canPlayPosition(p,p.position));assert.ok(p.eligiblePositions.every(pos=>eligibility.canPlayPosition(p,pos)));
    if(position==='SP')hands.add(p.throws);bats.add(p.bats);
    assert.equal(p.stats.contact,p.initialStats.contact);
  }
  assert.equal(hands.size,2);assert.equal(bats.size,3);
});
