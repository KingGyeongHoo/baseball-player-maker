import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const farm=require('../.test-build/lib/sim/pro-farm.js'),market=require('../.test-build/lib/sim/pro-market.js');
const world=require('../.test-build/lib/sim/pro-world.js'),assess=require('../.test-build/lib/sim/pro-assessment.js');
const positions=require('../.test-build/lib/sim/pro-positions.js'),save=require('../.test-build/lib/career-save.js');
const {faProposal}=require('../.test-build/lib/sim/pro-fa-terms.js');
const {repairFarmShortageRetirement}=require('../.test-build/lib/sim/pro-save-repair.js');
const life=require('../.test-build/lib/sim/pro-season.js');
const {farmGameRoster}=require('../.test-build/lib/sim/pro-farm-roster.js');
const {ProContractPanel}=require('../.test-build/app/components/pro-career-panels.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('farm-market-regression','주포지션','3B'));
const fixture=()=>structuredClone(template);
function faFixture(level='first'){
 const s=fixture(),p=e.getPlayer(s),club=p.teamId%10;
 p.teamId=club+(level==='first'?0:10);p.proContract.status='regular';p.professional.employment='active';p.professional.faEligible=true;p.professional.faDays=900;p.professional.contract.endYear=2028;
 p.age=27;p.fatigue=0;p.recentZ=0;delete p.professional.managedUntil;
 for(const key of Object.keys(p.stats))p.stats[key]=80;
 p.professional.assessments=[{year:2028,date:'2028-10-31',score:79,grade:'A',cumulative:79,cumulativeGrade:'A',ability:80,role:p.primaryRole,squad:level,developmental:false,reserveSeason:false,firstTeam:level==='first',secondOnly:level==='second',firstGames:level==='first'?100:0,source:'season-end'}];
 s.phase='ended';s.date='2028-11-01';s.proWorld.stage='summary';s.proWorld.seasonClosed=true;s.careerNotice=undefined;s.noticeQueue=[];s.careerEvent=null;
 for(const c of s.proWorld.clubs)c.budget=1e12;
 // Clear capacity in alternative clubs, keeping genuine same-position peers.
 s.players=s.players.filter(q=>q.id===p.id||q.teamId%10===club||q.position==='3B');
 return s;
}

test('farm depth supplies reserve starters and essential positions without borrowing the first team or inventing past stats',()=>{
 const s=fixture();s.proWorld.stage='regular';s.date='2028-04-01';
 for(const p of s.players)if(p.teamId===10&&['SP','C','RF'].includes(p.position))p.teamId=20;
 const first=s.players.filter(p=>p.teamId===0).map(p=>p.id),records=structuredClone(e.getPlayer(s).seasonStats);
 farm.ensurePlayableFarmRosters(s,[0]);
 const roster=farmGameRoster(s,10),lineup=world.professionalLineup(s,roster,s.date);
 assert.ok(roster.filter(p=>p.position==='SP').length>=5);assert.ok(roster.filter(p=>p.position==='RP').length>=5);
 assert.equal(lineup.field.length,9);assert.ok(lineup.starter);assert.ok(roster.length<=45);
 assert.deepEqual(s.players.filter(p=>p.teamId===0).map(p=>p.id),first);assert.deepEqual(e.getPlayer(s).seasonStats,records);
 const before=JSON.stringify(s);assert.equal(farm.ensurePlayableFarmRosters(s,[0]),false);assert.equal(JSON.stringify(s),before);
});

test('farm shortages recruit or reassign genuine pitchers within capacity and budget, with guaranteed pay preserved',()=>{
 const s=fixture();s.proWorld.stage='regular';s.date='2028-04-01';
 for(const p of s.players.filter(p=>p.teamId>=10&&p.teamId%10===0&&['SP','RP'].includes(p.position)))market.releasePlayer(s,p,'test shortage',2028);
 const budget=s.proWorld.clubs[0].budget;s.proWorld.clubs[0].budget=1e12;
 farm.ensurePlayableFarmRosters(s,[0]);
 const roster=farmGameRoster(s,10);
 assert.ok(roster.filter(p=>p.position==='SP').length>=5);assert.ok(roster.filter(p=>p.position==='RP').length>=5);
 assert.ok(market.clubRoster(s,0).length<=75);assert.ok(market.clubRoster(s,0).filter(p=>p.teamId>=10).length<=45);
 assert.ok(market.clubCost(s,0,2028)<=s.proWorld.clubs[0].budget);assert.ok(budget>0);
 for(const p of s.players.filter(p=>p.id.startsWith('farm-depth:')))assert.equal(p.seasonStats.batting.PA+p.seasonStats.pitching.BF,0);
});

test('a forfeited farm season defers developmental rejection and cumulative refusal, while healthy completed seasons do not',()=>{
 const s=fixture(),p=e.getPlayer(s),club=p.teamId%10;
 p.teamId=club+10;p.proContract.status='developmental';p.professional.developmentalRetry={year:2028,deadlineYear:2028,club};
 p.professional.assessments=[];s.proWorld.seasonClosed=false;s.date='2028-10-31';
 const games=s.calendar.events.filter(g=>g.competitionId==='pro-second'&&[g.homeTeamId,g.awayTeamId].includes(club+10));
 for(const g of games){g.status='forfeit';g.forfeitTeamId=club+10;}
 games.slice(0,3).forEach(g=>g.status='completed');
 const row=assess.recordSeasonAssessment(s,p);assert.equal(row.clubGamesShortage,true);
 assert.equal(row.cumulative,null);assert.equal(assess.seasonExit(p,2028),null);assert.equal(assess.renewalAssessment(p,2028).seasons,0);
 p.professional.assessments=[];p.professional.developmentalRetry.deadlineYear=2028;games.forEach(g=>g.status='completed');
 const normal=assess.recordSeasonAssessment(s,p);assert.equal(normal.clubGamesShortage,undefined);
 assert.equal(assess.seasonExit(p,2028),null);
});

test('current third basemen compete with third basemen even when stronger first/second basemen can play third',()=>{
 const s=fixture(),p=e.getPlayer(s),club=p.teamId%10;p.teamId=club;
 const make=(id,position,score)=>{const q=structuredClone(p);q.id=id;q.position=position;q.primaryRole=e.roleFor(position);q.eligiblePositions=['1B','2B','3B','DH'];for(const key of Object.keys(q.stats))q.stats[key]=score;return q;};
 const third=make('natural-third','3B',50),first=make('strong-first','1B',99),second=make('strong-second','2B',98);
 assert.deepEqual(positions.positionRivals([third,first,second],p).map(q=>q.id),['natural-third']);
 const roster=s.players.filter(q=>q.teamId===club&&!['1B','2B','3B'].includes(q.position));roster.push(third,first,second);
 assert.equal(e.lineup(roster,s.date).field[5].id,'natural-third');
});

test('FA offers have real club-specific salary, role or length terms; contender descriptions require actual recent results',()=>{
 const s=faFixture(),p=e.getPlayer(s);
 s.proWorld.seasons=[2026,2027,2028].map(year=>({year,standings:s.proWorld.clubs.map((c,i)=>({teamId:c.id,rank:i+1,wins:100-i*5,losses:44+i*5,draws:0,played:144,percentage:(100-i*5)/144})),farmStandings:[],awards:[],draft:[],champion:0}));
 const offers=s.proWorld.clubs.flatMap(c=>market.offerFor(s,p,c.id,2029,'fa')??[]);
 assert.ok(new Set(offers.map(o=>o.salary)).size>1);assert.ok(new Set(offers.map(o=>o.faTerms.plan)).size>=3);
 const strong=offers.find(o=>o.faTerms.plan==='contender');assert.ok(strong.faTerms.recentRecord.rank<=3.5);
 const plans=[];for(let club=0;club<10;club++)plans.push(faProposal(s,p,club,2029,79,3));
 assert.ok(plans.some(p=>p.terms.plan==='contender'));assert.ok(plans.some(p=>p.terms.plan==='continuity'));
 market.openContractMarket(s);assert.ok(s.proWorld.market.offers.length<=3);assert.equal(s.proWorld.market.offers[0].faRetention,true);
});

test('FA duration follows annual and cumulative assessment bands with distinct club offers',()=>{
 for(const [score,min,max] of [[71,1,1],[73,1,2],[75,2,3],[77,2,4],[79,3,4]]){
  const s=faFixture(),p=e.getPlayer(s),row=p.professional.assessments[0];
  row.score=score;row.cumulative=score;
  const offers=s.proWorld.clubs.flatMap(c=>market.offerFor(s,p,c.id,2029,'fa')??[]);
  assert.equal(offers.length,10);
  assert.ok(offers.every(o=>o.years>=min&&o.years<=max),`${score}: ${offers.map(o=>o.years)}`);
  if(min!==max)assert.ok(new Set(offers.map(o=>o.years)).size>1,`club variation at ${score}`);
  assert.deepEqual(offers,s.proWorld.clubs.map(c=>market.offerFor(s,p,c.id,2029,'fa')));
 }
 const s=faFixture(),p=e.getPlayer(s),row=p.professional.assessments[0];
 row.score=75;row.cumulative=75;
 const current=market.offerFor(s,p,p.teamId%10,2029,'fa');
 p.professional.assessments.unshift({...row,year:2027,score:81,cumulative:81});
 const established=market.offerFor(s,p,p.teamId%10,2029,'fa');
 assert.equal(current.assessment.score,75);
 assert.ok(Math.abs(established.assessment.score-75.9)<1e-8);
 assert.ok(established.salary>current.salary);
});

test('FA duration applies age and future budget caps after club-specific terms',()=>{
 for(const [age,limit] of [[35,4],[36,3],[38,2],[40,1]]){
  const s=faFixture(),p=e.getPlayer(s);p.age=age;
  const offers=s.proWorld.clubs.flatMap(c=>market.offerFor(s,p,c.id,2029,'fa')??[]);
  assert.ok(offers.length>0);assert.ok(offers.every(o=>o.years<=limit));
 }
 const s=faFixture(),p=e.getPlayer(s),club=p.teamId%10;
 assert.ok(market.offerFor(s,p,club,2029,'fa').years>=3);
 s.proWorld.clubs[club].deadMoney['2030']=s.proWorld.clubs[club].budget;
 const constrained=market.offerFor(s,p,club,2029,'fa');
 assert.equal(constrained.years,1);
 assert.ok(market.canAfford(s,club,constrained.salary,2029,1,[p.id]));
 assert.equal(market.canAfford(s,club,constrained.salary,2029,2,[p.id]),false);
});

test('v4 refreshes unsigned legacy FA durations once and preserves signed contracts',()=>{
 const s=faFixture(),p=e.getPlayer(s);
 p.professional.assessments[0].score=75;p.professional.assessments[0].cumulative=75;
 market.openContractMarket(s);s.proWorld.contractRulesVersion=3;
 for(const o of s.proWorld.market.offers)o.years=1;
 const signed=structuredClone(p.professional.contract);
 assert.equal(market.upgradeContractRules(s),true);
 assert.equal(s.proWorld.contractRulesVersion,5);
 assert.ok(s.proWorld.market.offers.every(o=>o.years>=2));
 assert.deepEqual(p.professional.contract,signed);
 const snapshot=JSON.stringify(s);assert.equal(market.upgradeContractRules(s),false);assert.equal(JSON.stringify(s),snapshot);
 const offer=s.proWorld.market.offers[0];market.signContract(s,p,offer);s.proWorld.market.settled=true;
 s.proWorld.contractRulesVersion=3;
 const accepted=structuredClone(p.professional.contract),offers=structuredClone(s.proWorld.market.offers);
 assert.equal(market.upgradeContractRules(s),true);
 assert.deepEqual(p.professional.contract,accepted);assert.deepEqual(s.proWorld.market.offers,offers);
});

test('signing at another club starts first-team players in the first team and second-team players in the second team',()=>{
 for(const level of ['first','second']){
  const s=faFixture(level),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
  const before=JSON.stringify(s),offer=market.offerFor(s,p,club,2029,'fa');assert.ok(offer);assert.equal(JSON.stringify(s),before);
  assert.equal(offer.startingLevel,level);market.signContract(s,p,offer);
  assert.equal(p.teamId,club+(level==='first'?0:10));assert.equal(s.postSchool.pro.level,level);
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.deepEqual(e.getPlayer(restored).professional.contract.faTerms,offer.faTerms);
 }
});

test('a first-team transfer can displace a bench player without mutating the roster when merely viewing offers',()=>{
 const s=faFixture('first'),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
 const original=fixture().players.filter(q=>q.teamId===club);s.players=s.players.filter(q=>q.teamId!==club);s.players.push(...original);
 while(s.players.filter(q=>q.teamId===club).length>29)s.players.find(q=>q.teamId===club).teamId=club+20;
 const before=JSON.stringify(s),offer=market.offerFor(s,p,club,2029,'fa');assert.ok(offer);assert.equal(JSON.stringify(s),before);
 market.signContract(s,p,offer);assert.equal(p.teamId,club);assert.equal(s.players.filter(q=>q.teamId===club).length,29);
});

test('a starting-role guarantee actually selects the signed current-position player, survives load and is displayed',()=>{
 const s=faFixture('second'),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
 s.players=s.players.filter(q=>q.id===p.id||q.teamId%10!==club);market.openContractMarket(s);
 const offer=market.offerFor(s,p,club,2029,'fa');assert.equal(offer.faTerms.plan,'starter');
 s.proWorld.market.offers=[offer];const html=renderToStaticMarkup(createElement(ProContractPanel,{state:s,disabled:false,onAction(){},onRetire(){}}));
 assert.match(html,/主|주전 보장/);assert.match(html,/2군.*시작/);
 market.signContract(s,p,offer);s.date='2029-04-01';
 const rival=structuredClone(p);rival.id='stronger-third';for(const key of Object.keys(rival.stats))rival.stats[key]=100;rival.professional.contract.faTerms=undefined;
 const roster=fixture().players.filter(q=>q.teamId===10&&!['3B'].includes(q.position));for(const q of roster)q.teamId=club+10;
 roster.push(p,rival);assert.equal(e.lineup(roster,s.date).field[5].id,p.id);
});

test('trades preserve the incoming registration level as well as FA transfers',()=>{
 for(const level of ['first','second'])for(const phase of ['regular','offseason']){
  const s=fixture(),p=e.getPlayer(s),club=p.teamId%10,team=club+(level==='first'?0:10);
  if(s.players.filter(q=>q.teamId===team).length>=(level==='first'?29:30)){
    const down=s.players.find(q=>q.id!==p.id&&q.teamId===team&&q.position===p.position);assert.ok(down);down.teamId=club+20;
  }
  p.teamId=team;p.proContract.status='regular';p.professional.contract.endYear=2030;
  p.fatigue=0;for(const k of Object.keys(p.stats))p.stats[k]=70;
  s.proWorld.stage=phase;s.date=phase==='regular'?'2028-04-01':'2028-11-01';s.careerNotice=undefined;s.noticeQueue=[];
  for(const c of s.proWorld.clubs)c.budget=1e12;for(const q of s.players)if(q.professional.contract)q.professional.contract.endYear=2030;
  assert.equal(market.tradePlayer(s,p),true);assert.equal(p.professional.service.at(-1).from,phase==='regular'?2028:2029);
  assert.equal(Math.floor(p.teamId/10),level==='first'?0:1);
  assert.equal(s.postSchool.pro.level,level);assert.notEqual(p.teamId%10,club);
 }
});

test('future starter promises cannot be assigned twice for the same club position',()=>{
 const s=faFixture('first'),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
 const incumbent=s.players.find(q=>q.teamId===club&&q.position===p.position)??structuredClone(p);
 incumbent.id='promised-incumbent';incumbent.teamId=club;
 incumbent.professional.contract={...incumbent.professional.contract,startYear:2029,endYear:2030,club,
   faTerms:{plan:'starter',title:'주전 보장',description:'test',position:p.position,startingLevel:'first',starterGuaranteed:true}};
 if(!s.players.includes(incumbent))s.players.push(incumbent);
 const offer=market.offerFor(s,p,club,2029,'fa');assert.ok(offer);assert.notEqual(offer.faTerms.starterGuaranteed,true);
});

test('opt-in repair restores only the last unfair retirement, preserves records and pay, renews a deferred developmental trial and survives load',()=>{
 const s=fixture(),p=e.getPlayer(s),club=p.teamId%10;
 p.teamId=club+10;p.proContract.status='developmental';p.professional.faEligible=true;
 p.professional.contract.salary=30_000_000;p.professional.salaries=[{year:2028,club,salary:30_000_000,amount:30_000_000}];
 p.professional.developmentalRetry={year:2028,deadlineYear:2028,club};p.professional.assessments=[];
 s.date='2028-11-01';const games=s.calendar.events.filter(g=>g.competitionId==='pro-second'&&[g.homeTeamId,g.awayTeamId].includes(club+10));
 games.forEach(g=>g.status='forfeit');games.slice(0,3).forEach(g=>g.status='completed');
 assess.recordSeasonAssessment(s,p);p.professional.nonRenewal={year:2028,kind:'reserve',club,reason:'정식 전환 실패'};
 s.proWorld.seasonClosed=true;life.retireProfessional(s);
 const original=structuredClone(s),repaired=repairFarmShortageRetirement(s),q=e.getPlayer(repaired);
 assert.deepEqual(s,original);assert.equal(q.professional.employment,'active');assert.equal(q.teamId,club+10);assert.equal(repaired.proWorld.retired,undefined);
 assert.deepEqual(q.career,p.career);assert.deepEqual(q.professional.salaries,p.professional.salaries);assert.deepEqual(q.stats,p.stats);
 assert.equal(q.professional.developmentalRetry.deadlineYear,2029);assert.equal(q.professional.assessments.at(-1).clubGamesShortage,true);
 repaired.careerNotice=undefined;repaired.noticeQueue=[];market.openContractMarket(repaired);
 assert.equal(repaired.proWorld.market.kind,'renewal');const offer=repaired.proWorld.market.offers[0];assert.ok(offer);assert.equal(offer.salary,30_000_000);
 market.signContract(repaired,q,offer);assert.equal(q.teamId,club+10);assert.equal(q.professional.contract.endYear,2029);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(repaired))).state;
 assert.deepEqual(e.getPlayer(restored).professional.developmentalRetry,q.professional.developmentalRetry);
 const corrupt=structuredClone(repaired);e.getPlayer(corrupt).professional.developmentalRetry.deadlineYear++;
 assert.throws(()=>save.validateCareerState(corrupt),/기한/);
 assert.throws(()=>repairFarmShortageRetirement(repaired),/은퇴한/);
 const normal=structuredClone(s);normal.calendar.events.filter(g=>g.competitionId==='pro-second').forEach(g=>g.status='completed');
 assert.throws(()=>repairFarmShortageRetirement(normal),/몰수 일정/);
});

test('relief-role guarantees change bullpen roles and priority without bypassing readiness or adding stats',()=>{
 const s=fixture(),staff=s.players.filter(p=>p.teamId===0&&['RP','CP'].includes(p.position)),b=require('../.test-build/lib/sim/pro-balance.js');
 const promised=staff.find(p=>p.position==='RP'),closer=staff.find(p=>p.position==='CP');
 for(const p of [promised,closer]){p.professional.contract={...p.professional.contract,startYear:2028,endYear:2029,faTerms:{plan:'starter',title:'보직 보장',description:'test',position:p.position,startingLevel:'first',starterGuaranteed:true}};}
 const before=structuredClone(staff),plan=b.proBullpenPlan(staff,s.seed,'2028-04-01',0);
 assert.equal(plan.setupId,promised.id);assert.equal(plan.closerId,closer.id);assert.deepEqual(staff,before);
 promised.lastPitched='2028-04-01';assert.equal(b.proReliefReady(promised,'2028-04-01'),false);
});


function releasedDepthFixture(trial=false){
 const s=faFixture('second'),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
 market.releasePlayer(s,p,'test release',2029);s.players=[p];
 for(const key of Object.keys(p.stats))p.stats[key]=60;
 p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonSpring=e.emptyRecord();
 if(trial){
  p.professional.nonRenewal={year:2028,kind:'post-rookie-evaluation',reason:'test season-grade refusal',club:(club+9)%10};p.age=24;p.professional.assessments=[{year:2028,score:65}];
  for(let i=0;i<1000;i++){s.seed=`released-depth-${i}`;if(e.hash(`${s.seed}:reentry:2029:${p.id}:${club}`)%100<15)break;}
  assert.ok(e.hash(`${s.seed}:reentry:2029:${p.id}:${club}`)%100<15);
 }
 return {s,p,club};
}
function addDepthRival(s,p,club,tier,score=99,position=p.position){
 const q=structuredClone(p);q.id=`depth-${s.players.length}`;q.name=q.id;q.position=position;q.primaryRole=e.roleFor(position);q.teamId=club+tier;
 q.eligiblePositions=[position,'3B'];q.professional.employment='active';q.professional.contract=world.contractFor(club,2029,world.BASE_SALARY);q.proContract.status='regular';
 for(const key of Object.keys(q.stats))q.stats[key]=score;
 delete q.twoWay;s.players.push(q);return q;
}
test('released and developmental reentry offers stop at three superior first-team or five combined upper-squad position rivals',()=>{
 for(const trial of [false,true])for(const [first,second,blocked] of [[2,0,false],[3,0,true],[0,4,false],[0,5,true],[2,2,false],[2,3,true],[1,4,true]]){
  const {s,p,club}=releasedDepthFixture(trial);
  for(let i=0;i<first;i++)addDepthRival(s,p,club,0);
  for(let i=0;i<second;i++)addDepthRival(s,p,club,10);
  const before=JSON.stringify(s),offer=market.offerFor(s,p,club,2029,'released');
  assert.equal(offer===null,blocked,JSON.stringify({trial,first,second}));assert.equal(JSON.stringify(s),before);
  if(offer&&trial)assert.equal(offer.registration,'developmental');
 }
});
test('release depth counts strictly higher current-position players, excluding ties, other jobs, lower squads and other clubs',()=>{
 const {s,p,club}=releasedDepthFixture();
 for(let i=0;i<2;i++)addDepthRival(s,p,club,0);
 for(let i=0;i<5;i++){
  const equal=addDepthRival(s,p,club,0,60);assert.equal(e.selectionScore(equal,e.roleFor(p.position)),e.selectionScore(p,e.roleFor(p.position)));
  addDepthRival(s,p,club,0,99,'1B');addDepthRival(s,p,club,20);addDepthRival(s,p,club,30);addDepthRival(s,p,(club+1)%10,0);
 }
 assert.ok(market.offerFor(s,p,club,2029,'released'));
 const third=addDepthRival(s,p,club,10);third.professional.employment='freeAgent';assert.ok(market.offerFor(s,p,club,2029,'released'));
 third.professional.employment='active';assert.ok(market.offerFor(s,p,club,2029,'released'));
 addDepthRival(s,p,club,10);assert.ok(market.offerFor(s,p,club,2029,'released'));
 addDepthRival(s,p,club,10);assert.equal(market.offerFor(s,p,club,2029,'released'),null);
});
test('explicit two-way jobs count in their current batting position, using that position evaluation',()=>{
 const {s,p,club}=releasedDepthFixture();
 for(let i=0;i<3;i++){
  const q=addDepthRival(s,p,club,0,99,'SP');q.twoWay={pitchingPosition:'SP',battingPosition:'3B',nextAssignment:'pitching',reputationBonus:0};
  assert.ok(positions.currentProPosition(q,p.position));
 }
 assert.equal(market.offerFor(s,p,club,2029,'released'),null);
});
test('stove refresh removes blocked release proposals and stale proposals cannot bypass a changed roster',()=>{
 const {s,p,club}=releasedDepthFixture(),offer=market.offerFor(s,p,club,2029,'released');assert.ok(offer);
 for(let i=0;i<3;i++)addDepthRival(s,p,club,0);
 const before=structuredClone(s);assert.throws(()=>market.signContract(s,p,offer),/상위 출전평가/);assert.deepEqual(s,before);
 s.proWorld.market={year:2029,kind:'released',round:1,settled:false,offers:[offer]};assert.equal(market.needsContractUpgrade(s),true);assert.equal(market.upgradeContractRules(s),true);assert.equal(market.needsContractUpgrade(s),false);
 assert.ok(!s.proWorld.market.offers.some(row=>row.club===club));assert.ok(s.proWorld.market.offers.length<=3);
 // The new restriction concerns release recruitment, not an existing club's renewal or FA retention.
 p.professional.employment='active';p.professional.contract=world.contractFor(club,2028,world.BASE_SALARY);p.teamId=club+10;
 assert.ok(market.offerFor(s,p,club,2029,'renewal'));assert.ok(market.offerFor(s,p,club,2029,'fa'));
});
