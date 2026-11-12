import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const system=require('../.test-build/lib/sim/event-system.js');
const TrainingEditor=require('../.test-build/app/components/training-editor.js').default;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
e.params['events.weekly_chance']=0;e.params['injury.training_base_risk']=0;
const technical=['velocity','control','movement','contact','power','speed','defense'];
function player(position='SS') {
  const p=e.previewPlayer('both-base-'+position,'양쪽성장',position);
  for(const key of Object.keys(p.stats))p.stats[key]=40;
  p.talent={batting:0,pitching:0};return p;
}

test('every pitching and batting skill grows at zero individual tickets while participating in training, independent of role',()=>{
  for(const position of ['SS','SP']) {
    const p=player(position);for(const key of Object.keys(p.trainingPolicy.tickets))p.trainingPolicy.tickets[key]=0;p.trainingPolicy.tickets.physical=1;
    e.train(p,5);
    for(const key of technical)close(p.stats[key]-40,.03);
    assert.ok(p.stats.stamina>40&&p.stats.recovery>40&&p.stats.arm>40);
    close(p.stats.bq-40,.025);
    const other=player(position==='SS'?'SP':'SS');other.trainingPolicy=structuredClone(p.trainingPolicy);e.train(other,5);
    assert.deepEqual(p.stats,other.stats);
  }
});

test('tickets accelerate the selected skill above both-field basic growth, with each discipline own talent',()=>{
  for(const position of ['SS','SP'])for(const key of ['contact','velocity']) {
    const values=[];
    for(const tickets of [0,1,5]) {
      const p=player(position);p.trainingPolicy.tickets=Object.fromEntries(Object.keys(p.trainingPolicy.tickets).map(k=>[k,0]));p.trainingPolicy.tickets.physical=1;p.trainingPolicy.tickets[key]=tickets;
      e.train(p,5);values.push(p.stats[key]);
    }
    close(values[0]-40,.03);close(values[1]-values[0],.1);close(values[2]-values[0],.25);
  }
  const p=player('SS');p.talent={batting:0,pitching:10};p.trainingPolicy.tickets.physical=1;e.train(p,5);
  close(p.stats.velocity-40,.06);close(p.stats.power-40,.03);
});

test('growth respects per-skill slowdown, partial days, adaptation, caps and no-training recovery policies',()=>{
  const p=player();p.stats.velocity=90;p.stats.contact=60;p.trainingPolicy.tickets.physical=1;
  p.transferAdaptation={schoolId:0,weeksRemaining:2};const before=structuredClone(p);e.train(p,.25);
  close(p.stats.velocity-90,.03*.025*.25/5*.9);
  assert.ok(p.stats.contact>60);assert.equal(p.transferAdaptation.weeksRemaining,2);
  const capped=player();for(const key of technical)capped.stats[key]=100;e.train(capped,5);assert.ok(technical.every(k=>capped.stats[k]===100));
  const zero=structuredClone(before);for(const key of Object.keys(zero.trainingPolicy.tickets))zero.trainingPolicy.tickets[key]=0;e.train(zero,5);assert.deepEqual(zero.stats,before.stats);
  const rest=structuredClone(before);rest.trainingPolicy=e.policyForMode(rest.trainingPolicy,'rest');e.train(rest,5);assert.deepEqual(rest.stats,before.stats);
});

test('players and NPCs train their opposite side even under their normal role-specific automatic policy',()=>{
  const s=e.createGame('npc-both-base','양쪽성장','SS');s.calendar.events=[];s.calendar.competitions=[];
  const npc=s.players.filter(p=>p.grade===1&&p.teamId===1),bat=npc.find(p=>!e.isPitcher(p.primaryRole)),pit=npc.find(p=>e.isPitcher(p.primaryRole));
  const next=e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);
  assert.ok(e.getPlayer(next).stats.velocity>e.getPlayer(s).stats.velocity);
  assert.ok(next.players.find(p=>p.id===bat.id).stats.velocity>bat.stats.velocity);
  assert.ok(next.players.find(p=>p.id===pit.id).stats.contact>pit.stats.contact);
});

test('off-role event rewards include the same base growth as real focused training',()=>{
  for(const position of ['SS','SP'])for(const key of technical) {
    const p=player(position),q=structuredClone(p);
    q.trainingPolicy.tickets=Object.fromEntries(Object.keys(q.trainingPolicy.tickets).map(k=>[k,0]));q.trainingPolicy.tickets[key]=5;
    for(let day=0;day<20;day++)e.train(q,1);
    close(system.eventTrainingReward(p,key,4),q.stats[key]-p.stats[key]);
    close(q.stats[key]-40,1.12);
  }
});

test('training UI offers independent 0-5 investments, a centered balance meter and both-field base growth',()=>{
  const p=player(),render=policy=>renderToStaticMarkup(createElement(TrainingEditor,{player:p,policy,setPolicy(){}}));
  const html=render(p.trainingPolicy);assert.ok(!html.includes('training-modes')&&!html.includes('남은 티켓'));
  assert.ok(html.includes('기본 성장'));assert.ok(html.includes('피로 회복')&&html.includes('피로 쌓임'));assert.ok(html.includes('투수·타자 능력 모두 기본 성장'));assert.match(html,/role="meter"/);
  const hard=structuredClone(p.trainingPolicy);hard.mode='hard';hard.tickets.power=3;
  const full=render(hard);assert.ok(!full.includes('aria-label="구속 티켓 증가" disabled'));
  hard.tickets.velocity=5;assert.match(render(hard),/aria-label="구속 티켓 증가" disabled/);
  const legacy=e.policyForMode(p.trainingPolicy,'rest');assert.match(render(legacy),/이전 휴식 설정/);
});

test('NPCs recover through light training at high fatigue; only injury or forced rest completely stops activity',()=>{
  const p=player();p.fatigue=45;e.npcPolicy(p,'2027-03-01',false);assert.equal(p.trainingPolicy.mode,'light');assert.ok(e.ticketsUsed(p.trainingPolicy)>0);assert.ok(e.validPolicy(p.trainingPolicy));
  p.fatigue=35;e.npcPolicy(p,'2027-03-02',false);assert.equal(p.trainingPolicy.mode,'light');
  p.fatigue=29;e.npcPolicy(p,'2027-03-03',false);assert.equal(p.trainingPolicy.mode,'normal');
  p.forcedRest=true;e.npcPolicy(p,'2027-03-04',false);assert.equal(p.trainingPolicy.mode,'rest');assert.equal(e.ticketsUsed(p.trainingPolicy),0);
});
