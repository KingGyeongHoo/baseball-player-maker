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
 sp.lastPitched='2028-04-01';assert.equal(b.proReliefReady(sp,'2028-04-03'),false);assert.equal(b.proReliefReady(sp,'2028-04-05'),false);
 assert.equal(b.proReliefReady(sp,'2028-04-04',sp.id),false);
 assert(b.proReliefPriority(cp,'2028-04-06',9,2,cp.id)>b.proReliefPriority(rp,'2028-04-06',9,2,cp.id));
 assert(b.proReliefPriority(cp,'2028-04-06',6,2,cp.id)<b.proReliefPriority(rp,'2028-04-06',6,2,cp.id));
 for(let day=0;day<100;day++){const outs=b.proPitcherOutLimit(sp,true,s.seed,e.addDays('2028-04-01',day));assert(outs>=12&&outs<=24);}
 assert.equal(b.proPitcherOutLimit(cp,false,s.seed,'2028-04-06',cp.id,undefined,1,2,5,1),1);
 assert.equal(b.proPitcherOutLimit(sp,true,s.seed,'2028-04-06',undefined,undefined,-4,4,12,4),4);
 rp.lastPitched='2028-04-05';assert.equal(b.proReliefReady(rp,'2028-04-06',undefined,[{date:'2028-04-04',boxScore:{[rp.id]:{pitching:{BF:4}}}}]),false);
});

test('bullpen plans keep one closer and assign setup and long relief to middle relievers',()=>{
 const s=pc.createProfessionalDemo('bullpen-plan-check','검증','SP'),roster=s.players.filter(p=>p.teamId===0),before=structuredClone(roster),rng={...s.rngStates};
 const closers=new Set(),reliefLengths=new Set();
 for(let day=0;day<60;day++){
   const date=e.addDays('2028-04-01',day),plan=b.proBullpenPlan(roster,s.seed,date,0);
   assert.deepEqual(plan,b.proBullpenPlan([...roster].reverse(),s.seed,date,0));
   assert.notEqual(plan.closerId,plan.setupId);assert.notEqual(plan.bridgeId,plan.closerId);closers.add(plan.closerId);
   const closer=roster.find(p=>p.id===plan.closerId),setup=roster.find(p=>p.id===plan.setupId);
   assert([3,6].includes(b.proPitcherOutLimit(closer,false,s.seed,date,plan.closerId,plan.bridgeId)));
   assert.equal(e.pitchingRole(setup),'중간계투');assert.equal(e.pitchingRole(roster.find(p=>p.id===plan.longReliefId)),'중간계투');
   reliefLengths.add(b.proPitcherOutLimit(setup,false,s.seed,date));
 }
 assert.equal(closers.size,1);assert(reliefLengths.has(3));assert(reliefLengths.size>1);assert.deepEqual(roster,before);assert.deepEqual(s.rngStates,rng);
});

test('short rest and accumulated workload lower priority, with inning-specific leverage roles',()=>{
 const s=pc.createProfessionalDemo('bullpen-rest-check','검증','SP'),rp=s.players.find(p=>p.position==='RP');
 rp.lastPitched='2028-04-01';const rested=b.proReliefPriority(rp,'2028-04-05',6,2,undefined,undefined,undefined,rp.id);
 assert(rested>b.proReliefPriority(rp,'2028-04-02',6,2,undefined,undefined,undefined,rp.id));
 rp.seasonByLevel.first.pitching.outs+=180;rp.seasonByLevel.second.pitching.outs+=180;
 assert(rested>b.proReliefPriority(rp,'2028-04-05',6,2,undefined,undefined,undefined,rp.id));
 assert(b.proReliefPriority(rp,'2028-04-05',8,2,undefined,undefined,rp.id)>b.proReliefPriority(rp,'2028-04-05',8,-3,undefined,undefined,rp.id));
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
 assert.equal(b.proRotationStarter(s,starters,'2028-04-08'),undefined);
 s.proWorld.stage='postseason';assert.equal(b.proRotationStarter(s,starters,'2028-04-08'),undefined);
 assert.equal(JSON.stringify(s.calendar.events),snapshot);
});

test('holidays and evaluation requests cannot reuse a starter before four other team games',()=>{
 const s=pc.createProfessionalDemo('rotation-gap-regression','검증','SP');s.proWorld.stage='regular';
 const roster=s.players.filter(p=>p.teamId===0),sp=roster.find(p=>p.position==='SP'),sample=s.calendar.events.find(g=>g.competitionId==='pro-first');
 for(const p of roster){p.fatigue=0;p.lastPitched=null;p.injury=null;p.forcedRest=false;}
 s.calendar.events=[{...structuredClone(sample),id:'last-start',date:'2028-04-01',status:'completed',homeTeamId:0,awayTeamId:1,lineup:[Array(9).fill('fielder').concat(sp.id),[]]}];
 assert.equal(b.proStarterReady(s,sp,'2028-04-20'),false);
 assert.notEqual(w.professionalLineup(s,roster,'2028-04-20',[sp.id]).starter?.id,sp.id);
 for(let n=0;n<4;n++)s.calendar.events.push({...structuredClone(sample),id:`other-game-${n}`,date:n===3?'2028-04-20':e.addDays('2028-04-10',n),status:'completed',homeTeamId:0,awayTeamId:1,lineup:[Array(9).fill('fielder').concat('other-'+n),[]]});
 assert.equal(b.proStarterReady(s,sp,'2028-04-20'),true);
});

test('every first-team roster has exactly 29 registrations and a legal 12-to-15 pitcher staff',()=>{
 const s=pc.createProfessionalDemo('registered-roster-29','검증','SS'),snapshot=structuredClone(s.players);
 for(let club=0;club<10;club++){
  const roster=s.players.filter(p=>p.teamId===club),count=pos=>roster.filter(p=>p.position===pos).length;
  assert.equal(roster.length,29);const arms=roster.filter(p=>e.isPitcher(p.primaryRole)).length;assert(arms>=12&&arms<=15);
  assert(count('SP')>=5&&count('SP')<=6);assert.equal(count('CP'),1);assert.equal(count('RP'),arms-count('SP')-1);
 }
 w.ensureProWorld(s);assert.deepEqual(s.players,snapshot);
});

test('a healthy five-man rotation never adds the sixth starter merely because he has fewer appearances',()=>{
 const s=pc.createProfessionalDemo('no-six-man-rotation','검증','SP');s.proWorld.stage='regular';
 const template=s.players.find(p=>p.position==='SP'),starters=Array.from({length:6},(_,i)=>({...structuredClone(template),id:`strict-rotation-${i}`,teamId:0,fatigue:0,lastPitched:null,stats:Object.fromEntries(Object.keys(template.stats).map(k=>[k,80-i]))}));
 for(let day=0;day<60;day++)assert.notEqual(b.proRotationStarter(s,starters,e.addDays('2028-04-01',day)).id,starters[5].id);
});

test('pro starter and relief pools stay disjoint in camp, regular season and postseason, including emergencies',()=>{
 const base=pc.createProfessionalDemo('strict-pitching-roles','검증','SS'),date='2028-04-09';
 for(const stage of ['camp','regular','postseason'])for(const missing of ['starter','relief']){
  const s=structuredClone(base);s.proWorld.stage=stage;s.date=date;s.careerNotice=null;s.careerEvent=null;
  const roster=s.players.filter(p=>p.teamId===0).filter(p=>!e.isPitcher(e.pitchingRole(p))||(missing==='starter'?e.pitchingRole(p)!=='선발':e.pitchingRole(p)==='선발'));
  const opponent=s.players.filter(p=>p.teamId===1),selected=w.professionalLineup(s,roster,date);
  assert.equal(selected.field.length,9);
  if(missing==='starter'){
   assert.equal(e.lineup(roster,date).starter,undefined);assert.equal(selected.starter,undefined);
   for(const p of roster.filter(p=>e.isPitcher(e.pitchingRole(p))))assert.equal(b.proStarterReady(s,p,date),false);
   assert.equal(b.proRotationStarter(s,roster.filter(p=>e.isPitcher(e.pitchingRole(p))),date),undefined);
  }else assert.equal(e.pitchingRole(selected.starter),'선발');
  const game={id:`roles-${stage}-${missing}`,date,homeTeamId:0,awayTeamId:1,competitionId:stage==='postseason'?'pro-playoffs-role-test':'pro-first',round:1,rulesetId:'test',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},...(stage==='camp'?{exhibition:true}:{})};
  assert.equal(e.simulateGame(s,game,[roster,opponent]),true);
  assert.equal(game.status,'forfeit',`${stage}: ${missing} cannot be replaced by the opposite role`);
 }
});

test('a cached pregame reliever start is rebuilt with a genuine starter',()=>{
 const s=pc.createProfessionalDemo('cached-role-regression','검증','SS');s.proWorld.stage='regular';s.careerNotice=null;s.date='2028-04-09';
 const rosters=[0,1].map(team=>s.players.filter(p=>p.teamId===team));
 const prepared=rosters.map(roster=>{const side=w.professionalLineup(s,roster,s.date);return{field:side.field.map(p=>p.id),order:side.order.map(p=>p.id),pitchers:side.pitchers.map(p=>p.id),starter:side.starter.id};});
 prepared[0].starter=rosters[0].find(p=>p.position==='RP').id;
 const game={id:'cached-role-regression',date:s.date,homeTeamId:0,awayTeamId:1,competitionId:'pro-first',round:1,rulesetId:'test',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},proPreparedLineup:prepared};
 assert(e.simulateGame(s,game,rosters));assert.equal(game.status,'completed');
 assert.equal(e.pitchingRole(s.players.find(p=>p.id===game.lineup[0][9])),'선발');
});
test('multi-seed regular seasons keep accounting identities and remove extreme pitching dominance',()=>{
 const results=[0,1,2].map(i=>runSeason(`pro-balance-${i}`));
 for(const s of results){assert.equal(s.games,720);assert.equal(s.forfeits,0);assert(s.K.max<300);assert(s.HR.max>=30&&s.HR.max<75);assert(s.AVG.mean>.24&&s.AVG.mean<.30);assert(s.roles.SP.IP.max<225);
  assert(s.workload.SP.games>=24&&s.workload.SP.games<=30);assert(s.workload.SP.perGame>5&&s.workload.SP.perGame<6);
  assert(s.workload.RP.games>=45&&s.workload.RP.games<=66);assert(s.workload.RP.perGame>.8&&s.workload.RP.perGame<1.15);
  assert(s.workload.CP.games>=48&&s.workload.CP.games<=72);assert(s.workload.CP.perGame>.85&&s.workload.CP.perGame<1.25);
 }
 assert(results.some(s=>s.rareOutings.starterEightInnings>0));assert(results.some(s=>s.rareOutings.reliefThreeInnings>0));assert(results.some(s=>s.rareOutings.closerOneOutThenRelief>0));
});
