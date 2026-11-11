import test from 'node:test';
import './pro-stove.test.mjs';
import './pro-retirement.test.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),life=require('../.test-build/lib/sim/pro-season.js'),world=require('../.test-build/lib/sim/pro-world.js'),market=require('../.test-build/lib/sim/pro-market.js'),growth=require('../.test-build/lib/sim/pro-growth.js'),evaluation=require('../.test-build/lib/sim/pro-evaluation.js');
const {eventTrainingReward}=require('../.test-build/lib/sim/event-system.js');
const {encodeCareerSave,decodeCareerSave,validateCareerState}=require('../.test-build/lib/career-save.js');
e.params['pro_events.enabled']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('lifecycle-tests','긴커리어','SS'));
const fixture=()=>{const s=structuredClone(template),p=e.getPlayer(s);p.teamId=p.teamId%10+10;s.postSchool.pro.level='second';return s;},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const acknowledge=s=>{while(s.careerNotice)s=pc.acknowledgeCareer(s);return s;};
function summary(){const s=fixture();s.date=s.proWorld.regularEnd;life.closeProfessionalSeason(s);return acknowledge(s);}

test('age growth factors and developmental/free-agent factors apply exactly once to normal and event growth',()=>{
  for(const [age,factor] of [[19,1.3],[22,1.3],[23,1.2],[26,1.2],[27,1.2],[29,1],[30,1],[33,.8],[36,.6],[39,.4]]){const p=e.getPlayer(fixture());p.age=age;assert.equal(growth.ageEfficiency(p),factor);}
  const p=e.getPlayer(fixture()),regular=structuredClone(p);for(const key of Object.keys(p.stats))p.stats[key]=regular.stats[key]=40;p.proContract.status='developmental';p.professional.employment='freeAgent';
  const before={...p.stats};e.train(p,1);e.train(regular,1);for(const key of Object.keys(p.stats))close(p.stats[key]-before[key],.9*.6*(regular.stats[key]-before[key]));
  p.stats.power=regular.stats.power=40;close(eventTrainingReward(p,'power',4),.9*.6*eventTrainingReward(regular,'power',4));
});
test('aging starts after the fixed physical prime and applies once per year with a minimum of one',()=>{
  const p=e.getPlayer(fixture());p.age=35;p.professional.agingOffset=0;p.professional.agingProfile={version:1,physical:50,peakStart:28,declineStart:32,loss:{}};p.proContract.status='developmental';const before={...p.stats};growth.applyAging(p,2029);
  close(before.speed-p.stats.speed,.45);close(before.power-p.stats.power,.325);close(before.control-p.stats.control,.05);const copy={...p.stats};assert.deepEqual(growth.applyAging(p,2029),{});assert.deepEqual(p.stats,copy);assert.equal(p.age,35);
  p.stats.speed=1;growth.applyAging(p,2030);assert.equal(p.stats.speed,1);assert.equal(p.professional.agingOffset,0);
});
test('season transition preserves IDs, skill fractions, contracts, pending long injuries, old records and registration where valid',()=>{
  const s=summary(),p=e.getPlayer(s),id=p.id;p.stats.contact=51.99;p.professional.contract.endYear=2030;p.injury={severity:'severe',startDate:s.date,unavailableUntil:'2029-05-01',originalPenalty:8,penaltyRemaining:8,penaltyRecoverDays:10};p.teamId=0;s.postSchool.pro.level='first';
  const ids=s.players.map(q=>q.id),rows=p.career.length,offset=p.professional.agingOffset;s.teams[0].wins=90;s.proWorld.monthly={month:'2028-08',text:'previous season'};life.startNextProSeason(s);assert.equal(s.teams[0].wins,0);assert.equal(s.proWorld.monthly,undefined);
  const q=e.getPlayer(s);assert.equal(q.id,id);assert.equal(q.age,20);assert.equal(q.stats.contact,51.99);assert.equal(q.career.length,rows);assert.deepEqual(s.players.map(p=>p.id),ids);assert.equal(q.teamId,0);assert.equal(q.injury.unavailableUntil,'2029-05-01');assert.equal(q.professional.agingOffset,offset);assert.equal(q.seasonStats.batting.PA,0);assert.equal(s.proWorld.stage,'camp');assert.throws(()=>life.startNextProSeason(s),/결산/);
});
test('salary conversion is effective from the conversion date; prior developmental wages are not rewritten',()=>{
  const s=fixture(),p=e.getPlayer(s);p.proContract.status='developmental';p.professional.contract.salary=.6*world.BASE_SALARY;p.professional.contract.segments=[{from:'2028-01-01',salary:.6*world.BASE_SALARY}];s.date='2028-07-01';Object.assign(p.seasonByLevel.second.batting,{PA:80,AB:72,H:25,BB:8,HR:2});
  assert.equal(pc.reviewDevelopmentContract(s),true);assert.equal(p.professional.contract.segments.length,2);assert.equal(p.professional.contract.segments[0].salary,.6*world.BASE_SALARY);assert.equal(p.professional.contract.salary,world.BASE_SALARY);assert.equal(p.proContract.convertedDate,s.date);
  life.closeProfessionalSeason(s);assert.ok(p.professional.earnings>.6*world.BASE_SALARY&&p.professional.earnings<world.BASE_SALARY);const amount=p.professional.earnings;life.closeProfessionalSeason(s);assert.equal(p.professional.earnings,amount);
});
test('FA service recognizes 899/900, counts a date once, caps at 150 and excludes camp, farm, developmental and postseason days',()=>{
  const s=fixture(),p=e.getPlayer(s);p.teamId=0;p.professional.faDays=899;p.professional.registration={year:2028,days:149};s.date=s.calendar.competitions.find(c=>c.id==='pro-first').startDate;
  world.recordProfessionalDay(s);assert.equal(p.professional.faDays,900);assert.equal(p.professional.faEligible,true);assert.equal(p.professional.registration.days,150);world.recordProfessionalDay(s);assert.equal(p.professional.faDays,900);s.date=e.addDays(s.date,1);world.recordProfessionalDay(s);assert.equal(p.professional.faDays,900);
  p.professional.registration={year:2028,days:0};s.date='2028-03-01';world.recordProfessionalDay(s);assert.equal(p.professional.registration.days,0);s.date=e.addDays(s.proWorld.regularEnd,1);world.recordProfessionalDay(s);assert.equal(p.professional.registration.days,0);
});
test('all clubs evaluate NPC registration; missing first-team positions are filled without exceeding 30/45',()=>{
  const s=fixture();s.date='2028-03-15';const p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=10;
  const first=s.players.filter(q=>q.teamId===1&&q.position==='C'),farm=s.players.find(q=>q.teamId===11&&q.position==='C');for(const q of first)q.teamId=11;
  world.reviewLeagueRegistrations(s);assert.ok(s.players.some(q=>q.teamId===1&&q.position==='C'));assert.ok([first.map(q=>q.id),farm.id].flat().some(id=>s.players.find(q=>q.id===id).teamId===1));
  for(let club=0;club<10;club++){assert.ok(s.players.filter(q=>q.teamId===club).length<=30);assert.ok(s.players.filter(q=>q.teamId===club+10).length<=45);}
});
test('evaluation opportunities honor eligibility, 14-day absence, two batters/one pitcher and unique participants',()=>{
  const s=fixture();s.date='2028-04-01';const game=s.calendar.events.find(g=>g.competitionId==='pro-second');game.date=s.date;
  for(const q of s.players.filter(q=>q.teamId>=10)){q.professional.lastAppearance='2028-03-01';q.age=22;q.fatigue=0;q.injury=null;q.professional.managedUntil=undefined;}
  world.prepareEvaluationOpportunities(s,[game.id]);for(const team of [game.homeTeamId,game.awayTeamId]){const selected=game.evaluationPlayers.map(id=>s.players.find(p=>p.id===id)).filter(p=>p.teamId===team);assert.ok(selected.filter(p=>e.isPitcher(p.primaryRole)).length<=1);assert.ok(selected.filter(p=>!e.isPitcher(p.primaryRole)).length<=2);}
  const original=[...game.evaluationPlayers];world.prepareEvaluationOpportunities(s,[game.id]);assert.deepEqual(game.evaluationPlayers,original);
});
test('postseason ties schedule a replay without random winners and preserve the recorded tied game',()=>{
  const s=fixture();s.proWorld.stage='regular';s.date=s.proWorld.regularEnd;const rng={...s.rngStates};life.finishProfessionalDay(s);assert.equal(s.proWorld.postseason.series.length,1);
  const wildcard=s.calendar.events.find(g=>g.competitionId==='pro-playoffs-wildcard');wildcard.status='completed';wildcard.score=[1,0];s.date=wildcard.date;life.finishProfessionalDay(s);
  const series=s.proWorld.postseason.series.find(v=>v.stage==='semi'),game=s.calendar.events.find(g=>g.competitionId===`pro-playoffs-${series.id}`);s.date=game.date;game.status='completed';game.score=[3,3];life.finishProfessionalDay(s);
  assert.deepEqual(series.wins,[0,0]);assert.equal(series.game,2);assert.equal(s.calendar.events.filter(g=>g.competitionId===game.competitionId).length,2);assert.deepEqual(s.rngStates,rng);assert.equal(game.status,'completed');assert.ok(s.calendar.events.at(-1).date>game.date);
});
test('postseason records commit separately, do not change regular stats and cannot commit twice',()=>{
  const s=fixture(),p=e.getPlayer(s);s.players.find(q=>q.teamId===3&&q.position===p.position).teamId=13;p.teamId=3;s.date=s.proWorld.regularEnd;s.proWorld.stage='regular';life.finishProfessionalDay(s);const game=s.calendar.events.find(g=>g.competitionId.startsWith('pro-playoffs-')&&[g.homeTeamId,g.awayTeamId].includes(3));
  p.injury=null;p.fatigue=0;for(const key of Object.keys(p.stats))p.stats[key]=99;const old=e.emptyRecord();assert.deepEqual(p.seasonStats,old);e.simulateGame(s,game,[game.homeTeamId,game.awayTeamId].map(id=>s.players.filter(p=>p.teamId===id)));assert.equal(game.status,'completed');assert.deepEqual(p.seasonStats,old);assert.ok(p.seasonPostseason.batting.PA>0);
  const record=structuredClone(p.seasonPostseason),rng={...s.rngStates};e.simulateGame(s,game,[game.homeTeamId,game.awayTeamId].map(id=>s.players.filter(p=>p.teamId===id)));assert.deepEqual(p.seasonPostseason,record);assert.deepEqual(s.rngStates,rng);
});
test('contract negotiation is once per offer, explicit and immutable until acceptance; pre-FA waiting does not grant freedom',()=>{
  const s=summary(),p=e.getPlayer(s);market.openContractMarket(s);const offer=s.proWorld.market.offers[0];assert.ok(offer);const contract=structuredClone(p.professional.contract);market.negotiateOffer(s,offer.id);assert.equal(offer.negotiated,true);assert.deepEqual(p.professional.contract,contract);assert.throws(()=>market.negotiateOffer(s,offer.id),/이미/);life.advanceStoveLeague(s);assert.equal(s.proWorld.market.kind,'renewal');assert.equal(p.professional.faEligible,false);
});
test('FA offers are at most three and the weekly stove market ends in January with affordable commitments',()=>{
  const s=summary(),p=e.getPlayer(s);p.professional.faEligible=true;market.openContractMarket(s);assert.equal(s.proWorld.market.kind,'fa');assert.ok(s.proWorld.market.offers.length<=3);life.advanceStoveLeague(s);life.advanceStoveLeague(s);assert.equal(s.proWorld.market.round,2);while(!s.proWorld.stove.closed)life.advanceStoveLeague(s);assert.equal(s.date,'2029-01-01');assert.throws(()=>life.advanceStoveLeague(s),/마감/);assert.equal(market.canAfford(s,0,1000*world.BASE_SALARY,2029,4),false);
});
test('release keeps identity and regular status, charges future guaranteed money once, and re-signing preserves records',()=>{
  const s=fixture(),p=e.getPlayer(s),id=p.id,club=p.professional.contract.club;p.professional.contract.endYear=2030;p.proContract.status='regular';p.seasonByLevel.second.batting.PA=80;
  market.releasePlayer(s,p,'test',2029);assert.equal(p.teamId,-1);assert.equal(p.professional.employment,'freeAgent');assert.equal(p.professional.guarantees.length,2);assert.equal(s.proWorld.clubs[club].deadMoney['2029'],world.BASE_SALARY);market.releasePlayer(s,p,'test',2029);assert.equal(p.professional.guarantees.length,2);
  market.signContract(s,p,{id:'new-contract',club:1,year:2029,years:1,salary:world.BASE_SALARY,role:'경쟁',kind:'released',negotiated:false,final:true,competition:[]});assert.equal(p.id,id);assert.equal(p.proContract.status,'regular');assert.equal(p.seasonByLevel.second.batting.PA,80);assert.equal(p.teamId,11);
});
test('a trade changes both memberships atomically, keeps contracts/records/status and closes after the first half',()=>{
  const s=fixture(),p=e.getPlayer(s),ids=new Set(s.players.map(p=>p.id));p.seasonByLevel.second.batting.PA=30;
  for(const q of s.players.filter(q=>q.teamId>=10&&q.teamId%10!==0))for(const key of ['contact','power','speed','defense'])q.stats[key]=76;
  const success=market.tradePlayer(s,p);assert.equal(success,true);assert.notEqual(p.teamId%10,0);assert.equal(p.seasonByLevel.second.batting.PA,30);assert.equal(p.professional.movements.at(-1).kind,'트레이드');assert.deepEqual(new Set(s.players.map(p=>p.id)),ids);assert.equal(p.professional.contract.club,p.teamId%10);
  s.proWorld.stage='regular';s.date=e.addDays(s.calendar.events.filter(g=>g.competitionId==='pro-first')[360].date,1);assert.equal(market.tradePlayer(s,p),false);
});
test('requests have a four-week cooldown; an accepted role request settles without another choice and retains eligibility',()=>{
  const s=fixture(),p=e.getPlayer(s),eligible=[...p.eligiblePositions],original=p.position;market.careerRequest(s,'position','3B');assert.ok(p.professional.roleTrial);assert.throws(()=>market.careerRequest(s,'manage'),/이후/);const trial=p.professional.roleTrial;trial.trainingDates=s.calendar.trainingDays.filter(date=>date>=trial.started&&date<trial.until).slice(0,5);s.date=trial.until;delete s.careerNotice;market.finishRoleTrial(s);assert.equal(p.position,original);assert.ok(require('../.test-build/lib/sim/pro-role-evaluation.js').reviewProRoleTrial(s));assert.equal(p.position,'3B');assert.ok(eligible.every(pos=>p.eligiblePositions.includes(pos)));assert.equal(s.careerEvent,null);assert.equal(s.careerNotice.title,'보직 평가 결과');
});
test('an older player can request an evaluation without falsifying their actual last appearance',()=>{
  const s=fixture(),p=e.getPlayer(s);p.age=32;p.professional.rookieYear=2020;p.professional.lastAppearance=s.date;
  assert.equal(world.evaluationCandidates(s,[p],s.date).length,0);market.careerRequest(s,'chance');assert.equal(p.professional.lastAppearance,s.date);assert.equal(world.evaluationCandidates(s,[p],s.date).length,1);
});
test('farm-only reputation performance is capped at 70, separate from first-team awards and ability evaluation',()=>{
  const s=fixture(),p=e.getPlayer(s);Object.assign(p.seasonByLevel.second.batting,{PA:200,AB:180,H:120,BB:20,HR:50});world.reviewProfessionalReputation(s);assert.ok(p.performanceReputation<=70);assert.equal(evaluation.regularAwards(s).some(a=>a.playerId===p.id&&a.kind==='홈런'),false);
});
test('regular awards enforce qualified rate titles, allow tied counting titles, and grant no skill bonuses',()=>{
  const s=fixture(),p=e.getPlayer(s),q=s.players.find(q=>q.id!==p.id),stats={...p.stats};Object.assign(p.seasonByLevel.first.batting,{PA:447,AB:400,H:140,HR:30});Object.assign(q.seasonByLevel.first.batting,{PA:446,AB:300,H:140,HR:30});
  const awards=evaluation.regularAwards(s);assert.equal(awards.find(a=>a.kind==='타격왕').playerId,p.id);assert.equal(awards.filter(a=>a.kind==='안타왕').length,2);assert.equal(awards.some(a=>a.kind==='홈런'),false);assert.deepEqual(p.stats,stats);assert.deepEqual(evaluation.regularAwards(s),awards);
});
test('retirement archives the actual career before displaying the result and forfeits only remaining voluntary salary',()=>{
  const s=summary(),p=e.getPlayer(s);p.professional.contract.endYear=2030;const before=structuredClone(s),retired=life.actOnProCareer(s,{type:'retire'});assert.deepEqual(s,before);assert.equal(retired.proWorld.stage,'retired');assert.equal(retired.proWorld.retired.forfeited,2*world.BASE_SALARY);assert.equal(e.getPlayer(retired).professional.employment,'retired');assert.ok(e.getPlayer(retired).career.some(row=>row.careerMode==='pro'));assert.throws(()=>life.actOnProCareer(acknowledge(retired),{type:'nextSeason'}),/은퇴/);
});
test('save round trips preserve RNG, pending choices, outcomes and raw fractional skills without rerolling',()=>{
  const s=fixture(),p=e.getPlayer(s);p.stats.contact=51.99;s.pendingEventOutcome={id:'outcome',kind:'special',title:'완료',date:s.date,choice:'선택',stats:{contact:.12},reputation:0,fatigue:0,definitionId:'D01',message:'성장',awakened:[]};
  const file=encodeCareerSave(s,false,'2026-11-05T00:00:00Z'),loaded=decodeCareerSave(JSON.stringify(file));assert.deepEqual(loaded.state,s);assert.equal(loaded.state.players.find(p=>p.id===s.playerId).stats.contact,51.99);assert.equal(encodeCareerSave(s,true).id,file.id);
});
test('corrupt and unsupported saves are rejected while the original save is unchanged',()=>{
  const s=fixture(),file=encodeCareerSave(s),original=JSON.stringify(file),corrupt=JSON.parse(original);corrupt.state.rngStates.match++;assert.throws(()=>decodeCareerSave(JSON.stringify(corrupt)),/무결성/);corrupt.version=99;assert.throws(()=>decodeCareerSave(JSON.stringify(corrupt)),/버전|형식/);assert.equal(JSON.stringify(file),original);const invalid=structuredClone(s);invalid.players[0].stats.contact=NaN;assert.throws(()=>validateCareerState(invalid),/손상/);
});
test('new rookie classes use stable IDs, 90-110 picks, 9-13 per club and never regenerate the same year',()=>{
  const s=summary();life.addRookieClass(s,2029);const picks=s.proWorld.seasons.at(-1).draft,ids=s.players.map(p=>p.id),rng={...s.rngStates};assert.ok(picks.length>=90&&picks.length<=110);for(const club of e.draftClubs){const n=picks.filter(p=>p.club===club).length;assert.ok(n>=9&&n<=13);}life.addRookieClass(s,2029);assert.deepEqual(s.players.map(p=>p.id),ids);assert.deepEqual(s.rngStates,rng);
});
test('qualification reached in the last completed farm game converts before postseason and settlement',()=>{
  let s=fixture(),p=e.getPlayer(s);p.proContract.status='developmental';for(const key of Object.keys(p.stats))p.stats[key]=99;s.date=s.proWorld.regularEnd;s.proWorld.stage='regular';
  for(const q of s.players)q.professional.lastAppearance=s.date;
  const game=s.calendar.events.find(g=>g.competitionId==='pro-second'&&[g.homeTeamId,g.awayTeamId].includes(p.teamId));game.date=s.date;s.calendar.events=[game];
  Object.assign(p.seasonByLevel.second.batting,{PA:79,AB:70,H:30,BB:9,HR:3});p.seasonStats=structuredClone(p.seasonByLevel.second);
  s=e.advanceWeek(s,p.trainingPolicy,p.stance);p=e.getPlayer(s);assert.ok(p.seasonByLevel.second.batting.PA>=80);assert.equal(p.proContract.status,'regular');assert.equal(s.careerNotice.kind,'registered');assert.equal(s.proWorld.stage,'postseason');assert.ok(s.noticeQueue.some(n=>n.code.startsWith('PRO10')));assert.equal(game.status,'scheduled','input is immutable');
});
test('an offseason reserves money for minimum positions and the player renewal; every active next-year player has a valid affordable contract',()=>{
  let s=summary();s=acknowledge(life.actOnProCareer(s,{type:'market'}));const offer=s.proWorld.market.offers[0];assert.ok(offer,'original club makes a concrete renewal offer');s=acknowledge(life.actOnProCareer(s,{type:'accept',id:offer.id}));while(!s.proWorld.stove.closed)s=acknowledge(life.actOnProCareer(s,{type:'wait'}));s=life.actOnProCareer(s,{type:'nextSeason'});
  assert.equal(s.calendar.seasonYear,2029);for(const p of s.players.filter(p=>p.teamId>=0)){assert.ok(p.professional.contract);assert.ok(p.professional.contract.startYear<=2029&&p.professional.contract.endYear>=2029,p.id);}
  for(const club of s.proWorld.clubs){assert.ok(market.clubCost(s,club.id,2029)<=club.budget);assert.ok(market.clubRoster(s,club.id).length<=75);}
});
