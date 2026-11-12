import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),TrainingEditor=require('../.test-build/app/components/training-editor.js').default;
const batting=['contact','power','speed','defense'],pitching=['velocity','control','movement'];
const plan=(keys=[],value=5)=>({mode:'normal',tickets:Object.fromEntries(Object.keys(e.defaultPolicy('센터라인').tickets).map(k=>[k,keys.includes(k)?value:0]))});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
e.params['events.weekly_chance']=0;e.params['events.focus_chance']=0;
for(const key of ['injury.training_base_risk','injury.risk_at60','injury.risk_slope60','injury.risk_at80','injury.risk_slope80'])e.params[key]=0;
const template=e.createGame('weighted-training','분야훈련','SS');

test('four batting fields and three pitching fields at equal levels have equal fatigue contribution',()=>{
  for(let level=0;level<=5;level++){const bat=plan(batting,level),pit=plan(pitching,level);close(e.trainingEffort(bat).weightedTickets,3*level);close(e.trainingEffort(pit).weightedTickets,3*level);for(const r of [0,50,100]){close(e.trainingLoad(r,bat).weeklyDelta,e.trainingLoad(r,pit).weeklyDelta);close(e.trainingLoad(r,bat).marker,e.trainingLoad(r,pit).marker);}}
  assert.equal(e.trainingEffort(plan(batting)).rawTickets,20);assert.equal(e.trainingEffort(plan(pitching)).rawTickets,15);
});
test('physical fatigue contribution stays at one, and mixed allocations use the same weights for everyone',()=>{
  const p=plan();Object.assign(p.tickets,{contact:4,power:2,speed:1,defense:3,velocity:2,control:1,movement:3,physical:2});const original=structuredClone(p),load=e.trainingEffort(p);close(load.rawTickets,18);close(load.weightedTickets,15.5);close(load.equivalentTickets,15.5/35*40);assert.deepEqual(p,original);close(e.trainingEffort(plan(['physical'])).weightedTickets,5);
});
test('normalizing the weighted capacity preserves both original full/zero endpoint anchors',()=>{
  const all=plan([...batting,...pitching,'physical']),zero=plan();const full=e.trainingEffort(all);assert.equal(full.rawTickets,40);assert.equal(full.maxWeightedTickets,35);close(full.equivalentTickets,40);close(e.trainingLoad(0,all).weeklyDelta,100);close(e.trainingLoad(100,zero).weeklyDelta,-100);close(e.trainingLoad(50,all).marker,100);close(e.trainingLoad(50,zero).marker,0);
});
test('an equal weighted mixed plan remains at the 25 percent neutral point with raw tickets unchanged',()=>{
  const mixed=plan();mixed.tickets.contact=5;mixed.tickets.velocity=5;const load=e.trainingLoad(50,mixed);close(load.used,10);close(load.weeklyDelta,0);close(load.marker,50);assert.equal(load.rawTickets,10);
});
test('actual weekly fatigue and forecasts match for equivalent full batting/pitching plans without a growth bonus',()=>{
  const results=[];
  for(const [role,position,keys] of [['센터라인','SS',batting],['선발','SP',pitching]]){const s=structuredClone(template),p=e.getPlayer(s),policy=plan(keys);p.position=position;p.primaryRole=role;for(const key of Object.keys(p.stats))p.stats[key]=40;p.stats.recovery=50;p.fatigue=30;p.talent={batting:0,pitching:0};s.calendar.events=[];s.calendar.competitions=[];const before=e.ovr(p),forecast=e.fatigueForecast(p,policy,s.date),next=e.advanceWeek(s,policy,p.stance),q=e.getPlayer(next);close(q.fatigue,30+125/7);close(q.fatigue,forecast.end);close(e.ovr(q)-before,.28);assert.deepEqual(q.trainingPolicy,policy);results.push(q.fatigue);}
  close(results[0],results[1]);
});
test('UI keeps the actual investment count but shows equal load and marker for equivalent disciplines',()=>{
  const p=e.getPlayer(structuredClone(template));p.stats.recovery=50;
  const render=policy=>renderToStaticMarkup(createElement(TrainingEditor,{player:p,policy,setPolicy(){}}));
  const bat=render(plan(batting)),pit=render(plan(pitching));assert.match(bat,/20<small>개/);assert.match(pit,/15<small>개/);assert.match(bat,/훈련 부하 42%/);assert.match(pit,/훈련 부하 42%/);assert.equal(bat.match(/data-load-marker="([^"]+)"/)[1],pit.match(/data-load-marker="([^"]+)"/)[1]);
});
test('NPC recovery allocations target weighted load rather than raw investment counts',()=>{
  for(const role of ['센터라인','선발','포수']){const p=e.getPlayer(structuredClone(template));p.primaryRole=role;p.stats.recovery=50;p.fatigue=45;e.npcPolicy(p,'2027-03-01',false);assert.ok(e.ticketsUsed(p.trainingPolicy)>0);assert.ok(e.trainingEffort(p.trainingPolicy).equivalentTickets<=5);assert.ok(e.validPolicy(p.trainingPolicy));}
});
