import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runSeason} from '../scripts/pro-balance.mjs';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const b=require('../.test-build/lib/sim/pro-balance.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const w=require('../.test-build/lib/sim/pro-world.js');
const r=require('../.test-build/lib/sim/evaluation-reference.js');

test('professional calibration is isolated and rewards contact, power and pitching skill',()=>{
 const original={...e.params},config=b.proMatchParameters(e.params),stats=Object.fromEntries(Object.keys(e.emptyStats()).map(k=>[k,65]));
 const base=e.probabilities(stats,stats,65,65,config);
 assert(e.probabilities({...stats,contact:90},stats,65,65,config).hit>base.hit);
 assert(e.probabilities({...stats,power:95},stats,65,65,config).hr>base.hr);
 assert(e.probabilities(stats,{...stats,velocity:95,control:95,movement:95},65,65,config).hit<base.hit);
 assert.deepEqual(e.params,original);assert(config['match.k_max']<original['match.k_max']);
});
test('lineup rest is deterministic, maintains legal unique players and never modifies abilities',()=>{
 const s=pc.createProfessionalDemo('pro-rest-check','검증','SS'),roster=s.players.filter(p=>p.teamId===0),before=structuredClone(roster);
 const used=new Set();
 for(let day=0;day<40;day++){
   const date=e.addDays('2028-04-01',day),a=w.professionalLineup(s,roster,date),b=w.professionalLineup(s,roster,date);
   assert.deepEqual(a,b);assert.equal(new Set(a.field).size,9);assert.equal(new Set(a.order).size,9);
   for(const p of a.field)used.add(p.id);
   ['C','SS','CF','2B','1B','3B','LF','RF','DH'].forEach((pos,i)=>assert(a.field[i].eligiblePositions.includes(pos)));
 }
 assert(used.size>9);assert.deepEqual(roster,before);
 const reference=r.evaluationReference(s);assert.equal(reference.parameters['pro.balance.version'],b.PRO_BALANCE_VERSION);
});
test('pitcher rest and outing limits preserve roles without manufacturing records',()=>{
 const s=pc.createProfessionalDemo('pro-pitch-check','검증','SP'),sp=s.players.find(p=>p.position==='SP'),rp=s.players.find(p=>p.position==='RP'),cp=s.players.find(p=>p.position==='CP');
 sp.lastPitched='2028-04-01';assert.equal(b.proReliefReady(sp,'2028-04-03'),false);assert.equal(b.proReliefReady(sp,'2028-04-05'),true);
 assert.equal(b.proReliefReady(sp,'2028-04-04'),false);assert.equal(b.proReliefReady(sp,'2028-04-04',sp.id),true);
 assert(b.proReliefPriority(cp,'2028-04-06',9,2,cp.id)>b.proReliefPriority(rp,'2028-04-06',9,2,cp.id));
 assert(b.proReliefPriority(cp,'2028-04-06',6,2,cp.id)<b.proReliefPriority(rp,'2028-04-06',6,2,cp.id));
 for(let day=0;day<30;day++){const outs=b.proPitcherOutLimit(sp,true,s.seed,e.addDays('2028-04-01',day));assert(outs>=15&&outs<=20);}
 sp.stats.stamina=80;
 assert.equal(b.proPitcherOutLimit(sp,true,s.seed,'2028-04-06',undefined,undefined,0),15);
 assert(b.proPitcherOutLimit(sp,true,s.seed,'2028-04-06',undefined,undefined,2)>b.proPitcherOutLimit(sp,true,s.seed,'2028-04-06',undefined,undefined,0));
});

test('bullpen plans reserve a closer and let the reserve closer bridge late innings',()=>{
 const s=pc.createProfessionalDemo('bullpen-plan-check','검증','SP'),roster=s.players.filter(p=>p.teamId===0),before=structuredClone(roster),rng={...s.rngStates};
 let reserveSetup=false;const closers=new Set();
 for(let day=0;day<60;day++){
   const date=e.addDays('2028-04-01',day),plan=b.proBullpenPlan(roster,s.seed,date,0);
   assert.deepEqual(plan,b.proBullpenPlan([...roster].reverse(),s.seed,date,0));
   assert.notEqual(plan.closerId,plan.setupId);assert.notEqual(plan.bridgeId,plan.closerId);closers.add(plan.closerId);
   const closer=roster.find(p=>p.id===plan.closerId),setup=roster.find(p=>p.id===plan.setupId);
   assert.equal(b.proPitcherOutLimit(closer,false,s.seed,date,plan.closerId,plan.bridgeId),3);
   if(e.pitchingRole(setup)==='마무리'){
     reserveSetup=true;assert.equal(b.proPitcherOutLimit(setup,false,s.seed,date,plan.closerId,plan.bridgeId),6);
   }
 }
 assert(reserveSetup);assert.equal(closers.size,2);assert.deepEqual(roster,before);assert.deepEqual(s.rngStates,rng);
});

test('short rest and accumulated workload lower priority, with inning-specific leverage roles',()=>{
 const s=pc.createProfessionalDemo('bullpen-rest-check','검증','SP'),rp=s.players.find(p=>p.position==='RP');
 rp.lastPitched='2028-04-01';const rested=b.proReliefPriority(rp,'2028-04-05',6,2,undefined,undefined,undefined,rp.id);
 assert(rested>b.proReliefPriority(rp,'2028-04-02',6,2,undefined,undefined,undefined,rp.id));
 rp.seasonStats.pitching.outs+=180;
 assert(rested>b.proReliefPriority(rp,'2028-04-05',6,2,undefined,undefined,undefined,rp.id));
 assert(b.proReliefPriority(rp,'2028-04-05',6,2,undefined,undefined,undefined,rp.id)>b.proReliefPriority(rp,'2028-04-05',6,-3,undefined,undefined,undefined,rp.id));
});

test('old calibration references remain archived while future projections use the current version',()=>{
 const s=pc.createProfessionalDemo('balance-reference-migration','검증','SS'),reference=r.makeEvaluationReference(s),old=structuredClone(reference);
 old.parameters['pro.balance.version']=b.PRO_BALANCE_VERSION-1;
 old.parameters['match.hit_base']=.5;s.evaluationSystem.references=[old];
 const current=r.evaluationReference(s);assert.equal(current.parameters['pro.balance.version'],b.PRO_BALANCE_VERSION);
 assert.notEqual(current.parameters['match.hit_base'],.5);assert.equal(s.evaluationSystem.references[0].parameters['match.hit_base'],.5);
});

test('five-man rotation uses rested pitchers with fewer actual starts instead of repeatedly skipping the fifth starter',()=>{
 const s=pc.createProfessionalDemo('five-man-rotation','검증','SS'),starters=s.players.filter(p=>p.teamId===0&&p.position==='SP').slice(0,5);
 starters.forEach((p,i)=>{for(const k of Object.keys(p.stats))p.stats[k]=75-i;p.fatigue=0;p.lastPitched=null;});
 const sample=s.calendar.events.find(g=>g.competitionId==='pro-first');
 s.calendar.events=starters.slice(0,4).map((p,i)=>({...structuredClone(sample),id:`rotation-${i}`,date:'2028-04-01',status:'completed',homeTeamId:0,awayTeamId:1,lineup:[Array(9).fill('fielder').concat(p.id),[]]}));
 s.proWorld.stage='regular';const snapshot=JSON.stringify(s.calendar.events);
 assert.equal(b.proRotationStarter(s,starters,'2028-04-08').id,starters[4].id);
 starters[4].lastPitched='2028-04-07';
 assert.equal(b.proRotationStarter(s,starters,'2028-04-08').id,starters[0].id);
 s.proWorld.stage='postseason';assert.equal(b.proRotationStarter(s,starters,'2028-04-08'),undefined);
 assert.equal(JSON.stringify(s.calendar.events),snapshot);
});
test('multi-seed regular seasons keep accounting identities and remove extreme pitching dominance',()=>{
 const results=[0,1,2].map(i=>runSeason(`pro-balance-${i}`));
 for(const s of results){assert.equal(s.games,720);assert.equal(s.forfeits,0);assert(s.K.max<300);assert(s.HR.max>=30&&s.HR.max<75);assert(s.AVG.mean>.24&&s.AVG.mean<.30);assert(s.roles.SP.IP.max<225);}
});
