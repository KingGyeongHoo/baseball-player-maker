import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {seasonExit}=require('../.test-build/lib/sim/pro-assessment.js');
const {releasePlayer,careerRequest}=require('../.test-build/lib/sim/pro-market.js');
const {emptyProWarAssessment}=require('../.test-build/lib/sim/pro-war.js');
const engine=require('../.test-build/lib/sim/engine.js');
const career=require('../.test-build/lib/sim/pro-career.js');
const market=require('../.test-build/lib/sim/pro-market.js');
function player(wars){
  return {age:21,career:[],professional:{employment:'active',rookieYear:2027,assessments:wars.map((value,i)=>{
    const war=emptyProWarAssessment();war.equivalentWins=value;
    return {year:2027+i,war,grade:'C'};
  })}};
}

test('actual releases lower market-wide acceptance and salaries without rerolling by club',()=>{
 const s=career.acknowledgeCareer(career.createProfessionalDemo('repeat-release','재영입','SS')),p=engine.getPlayer(s),year=s.proWorld.year+1;
 s.players=[p];p.professional.contract=null;p.professional.employment='freeAgent';p.teamId=-1;p.age=24;p.proContract.status='regular';
 p.professional.assessments=[];delete p.professional.nonRenewal;
 for(const key of Object.keys(p.stats))p.stats[key]=80;
 for(const club of s.proWorld.clubs)club.budget=1e12;
 function history(count){p.professional.movements=Array.from({length:count},(_,i)=>({date:`${2020+i}-11-01`,from:0,to:null,kind:'방출',reason:'test'}));}
 let basis;
 for(const [count,chance,multiplier] of [[0,100,1],[1,50,.8],[2,20,.6],[3,5,.4],[5,5,.4]]){
  history(count);assert.deepEqual(market.releaseContractTerms(p),{count,chance,salaryMultiplier:multiplier});
  for(let i=0;i<1000;i++){s.seed=`repeat-release-${i}`;if(engine.hash(`${s.seed}:release-market:${year}:${p.id}`)%100<5)break;}
  const offer=market.offerFor(s,p,1,year,'released');assert.ok(offer,`count=${count}`);
  if(count===0)basis=offer.salary;
  else assert.equal(offer.salary,Math.max(33_000_000,Math.floor(basis*multiplier/100_000)*100_000));
  assert.equal(offer.years,1);
  if(count){
   for(let i=0;i<1000;i++){s.seed=`rejected-release-${i}`;if(engine.hash(`${s.seed}:release-market:${year}:${p.id}`)%100>=chance)break;}
   const before=JSON.stringify(s);
   for(const club of s.proWorld.clubs)assert.equal(market.offerFor(s,p,club.id,year,'released'),null);
   assert.equal(JSON.stringify(s),before);
  }
 }
 history(3);p.professional.movements.push({date:s.date,kind:'이적',from:0,to:1,reason:'test'});assert.equal(market.releaseContractTerms(p).count,3);
});
test('rookie negative WAR threshold requires 60 first-team PA or 30 innings',()=>{
  for(const [pa,outs,release] of [[59,89,false],[60,0,true],[0,90,true]]){
    const p=player([-1]);Object.assign(p.professional.assessments[0].war.first,{pa,outs});
    assert.equal(!!seasonExit(p,2027),release);
  }
  const p=player([-.999]);p.professional.assessments[0].war.first.pa=60;
  assert.equal(seasonExit(p,2027),null);
});
test('rookie total is checked at the end of season three with an inclusive boundary',()=>{
  assert.equal(seasonExit(player([0,0]),2028),null);
  assert.ok(seasonExit(player([0,0,1]),2029));
  assert.equal(seasonExit(player([0,0,1.001]),2029),null);
  const p=player([0,0,0]);p.professional.assessments[0].war=undefined;
  assert.equal(seasonExit(p,2029),null);
});
test('no appearances count as zero WAR in the rookie total',()=>{
  const p=player([4,4,4]);
  for(const row of p.professional.assessments)row.noAppearances=true;
  assert.ok(seasonExit(p,2029));
});
test('midseason release is blocked without changing player state',()=>{
  const p=player([0]),before=structuredClone(p);
  const s={proWorld:{seasonClosed:false},players:[p],playerId:'user'};p.id='user';before.id='user';
  releasePlayer(s,p,'test',2028);assert.deepEqual(p,before);
  assert.throws(()=>careerRequest(s,'release'),/시즌 종료 후/);
  assert.deepEqual(p,before);
});

function experienced(age,wars,grades=[]){
  const p=player(wars);p.age=age;p.professional.rookieYear=2020;
  p.professional.assessments.forEach((row,i)=>row.grade=grades[i]??'C');
  return p;
}
test('single severe seasons and two low WAR seasons release immediately for each age band',()=>{
  for(const age of [23,27,28,32,33,35]){
    const severe=age<=27?-2:-1,low=age<=27?0:1;
    assert.ok(seasonExit(experienced(age,[severe]),2027));
    assert.equal(seasonExit(experienced(age,[severe+.001]),2027),null);
    assert.ok(seasonExit(experienced(age,[low,low]),2028));
    assert.equal(seasonExit(experienced(age,[low,low+.001]),2028),null);
  }
});

test('ages 28 through 35 use inclusive one WAR for hitters and starters and half for bullpen',()=>{
 for(const age of [28,32,33,35])for(const [role,threshold]of [['센터라인',1],['중간계투',.5],['마무리',.5],['선발',1]]){
  const p=experienced(age,[threshold,threshold]);for(const row of p.professional.assessments)row.role=role;
  assert.ok(seasonExit(p,2028),`${age}/${role}`);
  p.professional.assessments[1].war.equivalentWins+=.001;
  assert.equal(seasonExit(p,2028),null,`${age}/${role}/above`);
 }
 const changed=experienced(30,[.6,.6]);changed.position='SP';
 for(const row of changed.professional.assessments){row.role='선발';row.seasonRank={role:'bullpen'};}
 assert.equal(seasonExit(changed,2028),null,'historical bullpen role overrides the current starter position');
 const young=experienced(26,[.2,.2]);assert.equal(seasonExit(young,2028),null);
});
test('grade counts use F for young players and E or worse for prime and twilight players',()=>{
  assert.ok(seasonExit(experienced(23,[3,3,3],['F','F','F']),2029));
  assert.equal(seasonExit(experienced(27,[3,3,3],['E','F','F']),2029),null);
  assert.ok(seasonExit(experienced(28,[3,3,3,3],['E','C','F','E']),2030));
  assert.ok(seasonExit(experienced(33,[3,3,3],['F','E','E']),2029));
  assert.equal(seasonExit(experienced(35,[3,3,3,3],['E','C','E','F']),2030),null);
});

test('bullpen positive WAR totals are halved but negative thresholds and rookie workload stay unchanged',()=>{
 for(const role of ['중간계투','마무리']){
  for(const age of [23,27,28,32,33,35]){
   const limit=age<=27?-2:-1,p=experienced(age,[limit]);p.professional.assessments[0].role=role;
   assert.ok(seasonExit(p,2027));p.professional.assessments[0].war.equivalentWins=limit+.001;
   assert.equal(seasonExit(p,2027),null);
  }
  for(const [age,wars]of [[23,[.375,.375,.375,.375]],[28,[.6,.6,.6,.6,.1]],[33,[.55,.55,.4]]]){
   const p=experienced(age,wars);for(const row of p.professional.assessments)row.role=role;
   const year=2026+wars.length;assert.match(seasonExit(p,year).reason,/총합/);
   p.professional.assessments.at(-1).war.equivalentWins+=.001;
   assert.equal(seasonExit(p,year),null);
  }
  const rookie=player([-.5]);rookie.professional.assessments[0].role=role;rookie.professional.assessments[0].war.first.outs=90;
  assert.equal(seasonExit(rookie,2027),null);rookie.professional.assessments[0].war.equivalentWins=-1;
  assert.ok(seasonExit(rookie,2027));
  const total=player([.2,.2,.1]);for(const row of total.professional.assessments)row.role=role;
  assert.match(seasonExit(total,2029).reason,/총합이 0.5/);
  total.professional.assessments.at(-1).war.equivalentWins+=.001;assert.equal(seasonExit(total,2029),null);
 }
});
test('WAR totals require full calendar windows and use inclusive thresholds',()=>{
  for(const [age,wars] of [[23,[.75,.75,.75,.75]],[28,[1.2,1.2,1.2,1.2,.2]],[33,[1.1,1.1,.8]]]){
    assert.equal(seasonExit(experienced(age,wars.slice(0,-1)),2025+wars.length),null);
    assert.match(seasonExit(experienced(age,wars),2026+wars.length).reason,/총합/);
    const above=[...wars];above[above.length-1]+=.001;
    assert.equal(seasonExit(experienced(age,above),2026+wars.length),null);
    const missing=experienced(age,wars);missing.professional.assessments.splice(1,1);
    assert.equal(seasonExit(missing,2026+wars.length),null);
  }
});
test('rolling windows exclude expired seasons and protected rookie years',()=>{
  assert.equal(seasonExit(experienced(23,[-2,2,2,2,2]),2031),null);
  const p=experienced(23,[-2,0,3,3]);p.professional.rookieYear=2027;
  assert.equal(seasonExit(p,2030),null);
});
test('unknown historical WAR cannot satisfy totals and a prior release is not counted again',()=>{
  const p=experienced(23,[.75,.75,.75,.75]);delete p.professional.assessments[0].war;
  assert.equal(seasonExit(p,2030),null);
  const retry=experienced(28,[-1,3]);retry.professional.nonRenewal={year:2027};
  assert.equal(seasonExit(retry,2028),null);
});

test('a rookie is released only after settlement, retains guaranteed pay, and is not released twice',()=>{
  const s=career.acknowledgeCareer(career.createProfessionalDemo('rookie-release','신인검증','SS'));
  const p=engine.getPlayer(s),year=s.proWorld.year,club=p.professional.contract.club;
  p.age=21;p.professional.rookieYear=year;p.professional.assessments=[];
  p.professional.contract.endYear=year+2;
  const war=emptyProWarAssessment();war.equivalentWins=-1;war.first.pa=60;
  p.professional.assessments.push({year,war,grade:'F'});
  market.applySeasonExitPolicies(s);assert.equal(p.professional.employment,'active');
  s.proWorld.seasonClosed=true;market.applySeasonExitPolicies(s);assert.equal(p.professional.employment,'active');
  s.proWorld.stove={year:year+1};market.applySeasonExitPolicies(s);
  assert.equal(p.professional.employment,'freeAgent');assert.equal(p.teamId,-1);
  assert.deepEqual(p.professional.guarantees.map(row=>row.year),[year+1,year+2]);
  const debt=structuredClone(s.proWorld.clubs[club].deadMoney);
  market.applySeasonExitPolicies(s);assert.deepEqual(s.proWorld.clubs[club].deadMoney,debt);
});
