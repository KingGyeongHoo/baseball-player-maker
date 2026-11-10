import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const life=require('../.test-build/lib/sim/pro-season.js'),market=require('../.test-build/lib/sim/pro-market.js');
const calendar=require('../.test-build/lib/sim/pro-calendar.js'),storage=require('../.test-build/lib/career-save.js');
const {ProContractPanel}=require('../.test-build/app/components/pro-career-panels.js');
const ProgressControls=require('../.test-build/app/components/progress-controls.js').default;
let template;
function acknowledge(s){for(let i=0;i<40&&s.careerNotice;i++)s=pc.acknowledgeCareer(s);return s;}
function fixture(){
 if(!template){
  const s=acknowledge(pc.createProfessionalDemo('stove-fixture','스토브검증','SS')),p=e.getPlayer(s);
  s.date=s.proWorld.regularEnd;s.careerEvent=null;delete s.weekProgress;delete s.matchProgress;
  life.closeProfessionalSeason(s);template=acknowledge(s);
  p.professional.faEligible=true;p.professional.faDays=900;p.professional.contract.endYear=s.proWorld.year;
  delete template.proEvents;delete template.proWorld.allstar;
 }
 const s=structuredClone(template),p=e.getPlayer(s);p.professional.faEligible=true;p.professional.faDays=900;p.professional.contract.endYear=s.proWorld.year;return s;
}
function clear(s){s.careerNotice=undefined;s.noticeQueue=[];s.careerEvent=null;return s;}
test('FA offers can use a first-team vacancy when all 45 lower places are filled',()=>{
 const s=fixture(),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
 const make=(i,team)=>{const q=structuredClone(p);q.id='capacity-'+i;q.teamId=team;q.professional.contract.club=club;return q;};
 s.players=[p,...Array.from({length:29},(_,i)=>make(i,club)),...Array.from({length:45},(_,i)=>make(i+29,club+10))];
 s.proWorld.clubs[club].budget=1e12;
 const offer=market.offerFor(s,p,club,s.proWorld.year+1,'fa');assert.ok(offer);
 market.signContract(s,p,offer);assert.equal(p.teamId,club);assert.equal(market.clubRoster(s,club).length,75);assert.equal(s.players.filter(q=>q.teamId===club).length,30);
 const extra=make(100,-1);extra.professional.employment='freeAgent';s.players.push(extra);assert.equal(market.offerFor(s,extra,club,s.proWorld.year+1,'fa'),null);
});
test('a full lower squad still blocks developmental first-team entry and offer reads do not release players',()=>{
 const s=fixture(),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
 s.players=[p,...Array.from({length:45},(_,i)=>{const q=structuredClone(p);q.id='lower-'+i;q.teamId=club+10;q.professional.contract.club=club;return q;})];
 s.proWorld.clubs[club].budget=1e12;p.proContract.status='developmental';const before=JSON.stringify(s);
 assert.equal(market.offerFor(s,p,club,s.proWorld.year+1,'released'),null);assert.equal(JSON.stringify(s),before);
});
test('weekly stove flow retains accepted contracts and closes January 1 before the February camp',()=>{
 let s=fixture();const year=s.proWorld.year+1,stats={...e.getPlayer(s).stats},record=structuredClone(e.getPlayer(s).seasonStats);
 s=clear(life.actOnProCareer(clear(s),{type:'market'}));assert.equal(s.date,`${year-1}-11-01`);assert.equal(s.proWorld.stage,'offseason');
 const offer=s.proWorld.market.offers[0];assert.ok(offer);s=clear(life.actOnProCareer(s,{type:'accept',id:offer.id}));const contract=structuredClone(e.getPlayer(s).professional.contract);
 assert.equal(life.canEnterNextProCamp(s),true);
 const dates=[s.date];let guard=0;
 while(!s.proWorld.stove.closed){assert.ok(++guard<=10);s=clear(life.actOnProCareer(s,{type:'wait'}));dates.push(s.date);assert.deepEqual(e.getPlayer(s).professional.contract,contract);assert.deepEqual(e.getPlayer(s).seasonStats,record);assert.deepEqual(e.getPlayer(s).stats,stats);}
 assert.equal(dates.length,10);assert.equal(s.date,`${year}-01-01`);assert.throws(()=>life.actOnProCareer(s,{type:'wait'}),/마감/);
 for(const c of s.proWorld.clubs){assert.ok(market.clubRoster(s,c.id).length<=75);assert.ok(market.clubRoster(s,c.id).filter(p=>p.teamId>=10).length<=45);assert.ok(market.clubCost(s,c.id,year)<=c.budget);}
 s=life.actOnProCareer(s,{type:'nextSeason'});assert.equal(s.date,`${year}-02-01`);assert.equal(s.proWorld.stage,'camp');assert.equal(s.proWorld.stove,undefined);assert.ok(s.calendar.trainingDays.some(d=>d.slice(5,7)==='02'));
 assert.ok(s.calendar.competitions.find(c=>c.id==='pro-first').startDate>=`${year}-03-22`);
});
test('stove save/load and a repeated opening never replay the rookie class, market or transactions',()=>{
 const s=fixture();life.prepareOffseason(s);clear(s);const first=JSON.stringify(s);life.prepareOffseason(s);assert.equal(JSON.stringify(s),first);
 const loaded=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(s,true))).state;
 const a=life.actOnProCareer(s,{type:'wait'}),b=life.actOnProCareer(loaded,{type:'wait'});
 assert.equal(a.date,b.date);assert.deepEqual(a.proWorld.stove,b.proWorld.stove);assert.deepEqual(a.proWorld.market,b.proWorld.market);assert.deepEqual(a.proWorld.news,b.proWorld.news);
 assert.equal(new Set(a.players.map(p=>p.id)).size,a.players.length);
});
test('older pending and accepted markets migrate without rewriting their offers or contracts',()=>{
 for(const settled of [false,true]){
  const s=fixture();s.date=`${s.proWorld.year}-12-10`;market.openContractMarket(s);s.proWorld.market.settled=settled;
  const before=structuredClone(s.proWorld.market),contract=structuredClone(e.getPlayer(s).professional.contract),ids=s.players.map(p=>p.id);
  life.prepareOffseason(s);assert.equal(s.date,`${s.proWorld.year}-12-10`);assert.deepEqual(s.proWorld.market,before);assert.deepEqual(e.getPlayer(s).professional.contract,contract);assert.deepEqual(s.players.map(p=>p.id),ids);
  assert.equal(s.proWorld.stove.nextUpdate,`${s.proWorld.year}-12-17`);
 }
});
test('offseason roster reviews release only removable NPCs with expired contracts and remain reproducible',()=>{
 const s=fixture(),year=s.proWorld.year+1,original=new Map(s.players.map(p=>[p.id,{end:p.professional?.contract?.endYear,employment:p.professional?.employment}]));
 market.reviewStoveReleases(s,year);const released=s.players.filter(p=>original.get(p.id).employment==='active'&&p.professional?.employment==='freeAgent');
 assert.ok(released.length>0);assert.ok(released.every(p=>p.id!==s.playerId&&original.get(p.id).end<year));
 const t=fixture();market.reviewStoveReleases(t,year);assert.deepEqual(t.proWorld.news,s.proWorld.news);
});
test('stove UI offers immediate camp entry after signing and keeps unsigned decisions at closing',()=>{
 const s=fixture();life.prepareOffseason(s);const render=()=>renderToStaticMarkup(createElement(ProContractPanel,{state:s,disabled:false,onAction(){},onRetire(){}}));
 assert.ok(render().includes('다음 주 스토브리그'));assert.ok(!render().includes('무소속으로 다음 시즌 준비'));
 assert.ok(!render().includes('다음 캠프로 바로 가기'));
 s.proWorld.market.settled=true;e.getPlayer(s).professional.contract.endYear=s.proWorld.year+1;assert.ok(render().includes('내 계약은 확정됐습니다'));assert.ok(render().includes('다음 캠프로 바로 가기'));assert.ok(render().includes('다음 주 스토브리그'));
 s.proWorld.stove.closed=true;assert.ok(render().includes('다음 캠프로 바로 가기'));assert.ok(!render().includes('다음 주 스토브리그'));
});

test('immediate camp entry processes exactly the same remaining stove transactions as weekly progression',()=>{
 let s=fixture();s=clear(life.actOnProCareer(s,{type:'market'}));const offer=s.proWorld.market.offers[0];s=clear(life.actOnProCareer(s,{type:'accept',id:offer.id}));
 const p=e.getPlayer(s),contract=structuredClone(p.professional.contract),career=structuredClone(p.career),before=JSON.stringify(s),year=s.proWorld.year+1;
 const direct=life.actOnProCareer(s,{type:'nextSeason'});assert.equal(JSON.stringify(s),before);assert.equal(direct.date,`${year}-02-01`);assert.equal(direct.proWorld.stage,'camp');assert.equal(direct.proWorld.stove,undefined);assert.equal(direct.careerNotice.title,`${year} 캠프 시작`);assert.deepEqual(e.getPlayer(direct).professional.contract,contract);assert.deepEqual(e.getPlayer(direct).career,career);
 let weekly=structuredClone(s);while(!weekly.proWorld.stove.closed)weekly=clear(life.actOnProCareer(weekly,{type:'wait'}));weekly=life.actOnProCareer(weekly,{type:'nextSeason'});
 const players=state=>state.players.map(p=>({id:p.id,team:p.teamId,age:p.age,stats:p.stats,records:p.seasonStats,career:p.career,contract:p.professional.contract,employment:p.professional.employment,fa:p.professional.faDays,injury:p.injury,fatigue:p.fatigue}));
 assert.deepEqual(players(direct),players(weekly));assert.deepEqual(direct.proWorld.news,weekly.proWorld.news);assert.deepEqual(direct.rngStates,weekly.rngStates);assert.deepEqual(direct.calendar,weekly.calendar);
});

test('ongoing multi-year contracts can enter camp directly before opening the market and after restoring a partial winter',()=>{
 const s=fixture(),p=e.getPlayer(s),year=s.proWorld.year+1;p.professional.contract.endYear=year+1;const contract=structuredClone(p.professional.contract);
 const next=life.actOnProCareer(s,{type:'nextSeason'});assert.equal(next.date,`${year}-02-01`);assert.deepEqual(e.getPlayer(next).professional.contract,contract);assert.ok(next.proWorld.news.some(row=>row.id===`${year}:stove:9`));assert.equal(next.proWorld.draftedYears.filter(y=>y===year).length,1);
 let partial=clear(life.actOnProCareer(s,{type:'market'}));partial=clear(life.actOnProCareer(partial,{type:'wait'}));partial=clear(life.actOnProCareer(partial,{type:'wait'}));
 const restored=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(partial))).state;
 const resumed=life.actOnProCareer(restored,{type:'nextSeason'});assert.equal(resumed.date,next.date);assert.deepEqual(resumed.proWorld.news,next.proWorld.news);assert.deepEqual(e.getPlayer(resumed).professional.contract,contract);assert.equal(new Set(resumed.players.map(p=>p.id)).size,resumed.players.length);
});

test('immediate camp entry requires a signed next-season contract and the footer waits for pending decisions',()=>{
 const s=fixture();life.prepareOffseason(s);clear(s);const before=JSON.stringify(s);assert.equal(life.canEnterNextProCamp(s),false);assert.throws(()=>life.actOnProCareer(s,{type:'nextSeason'}),/계약/);assert.equal(JSON.stringify(s),before);
 const p=e.getPlayer(s),props={state:s,policy:p.trainingPolicy,busy:false,auto:false,autoStartWeek:s.week,onAdvance(){},onToggleAuto(){},onContinue(){},onNextCamp(){}};
 let html=renderToStaticMarkup(createElement(ProgressControls,props));assert.ok(html.includes('다음 캠프로 바로 가기'));assert.ok(html.includes('남은 스토브리그를 자동으로 진행'));
 html=renderToStaticMarkup(createElement(ProgressControls,{...props,pendingOutcome:true}));assert.match(html,/<button[^>]*disabled/);
 p.professional.contract.endYear=s.proWorld.year+1;p.professional.employment='freeAgent';assert.equal(life.canEnterNextProCamp(s),false);
});
test('new pro careers and leap-year calendars include February training and late-March games',()=>{
 const s=pc.createProfessionalDemo('february-camp','캠프검증','SP');assert.equal(s.date.slice(5),'02-01');
 for(const year of [2028,2029]){const c=calendar.developmentCalendar(year,true);assert.ok(c.trainingDays.some(d=>d.startsWith(`${year}-02-`)));assert.ok(c.events.every(g=>g.date>=`${year}-03-22`));}
});
