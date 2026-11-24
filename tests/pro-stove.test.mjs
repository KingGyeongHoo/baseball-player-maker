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
function confirmReport(state){
 const report=state.careerNotice?.stoveReport;
 assert.ok(report);assert.equal(report.club,e.getPlayer(state).teamId%10);
 assert.ok(report.moves.some(row=>row.direction==='joined'&&row.id.startsWith('pro-rookie-')));
 assert.ok(report.moves.every(row=>row.club===report.club));
 return pc.acknowledgeCareer(state);
}
let template;

test('a released regular player signing elsewhere appears once as a new contract, including an old saved report',()=>{
 const report=require('../.test-build/lib/sim/stove-report.js'),View=require('../.test-build/app/components/stove-changes.js').default;
 const s=pc.acknowledgeCareer(pc.createProfessionalDemo('released-arrival','신규계약검증','SS')),p=e.getPlayer(s),year=s.proWorld.year;
 const old=p.teamId%10,club=(old+1)%10;s.players=[p];s.date=`${year}-12-10`;s.phase='ended';s.proWorld.seasonClosed=true;s.proWorld.stage='offseason';
 s.proWorld.seasons.push({year,endDate:`${year}-10-31`,standings:[],awards:[],draft:[],champion:null});
 for(const c of s.proWorld.clubs)c.budget=1e12;
 p.professional.movements.push({date:`${year}-11-01`,kind:'방출',reason:'시즌 평가',from:old,to:null,squad:'second'});
 p.teamId=-1;p.professional.employment='freeAgent';p.professional.contract=null;p.professional.lastSquad='second';delete p.professional.nonRenewal;p.proContract.status='regular';
 market.signContract(s,p,{id:'new-signing',club,year:year+1,years:1,salary:33_000_000,role:'1·2군 등록 경쟁',kind:'released',negotiated:false,final:false,competition:[],startingLevel:'second'});
 const moves=report.stovePlayerMoves(p,`${year}-10-31`,s.date);
 assert.ok(moves.some(row=>row.club===old&&row.direction==='released'));
 assert.ok(moves.some(row=>row.club===club&&row.direction==='joined'&&row.reason==='신규계약'));
 const legacy={club,moves:[]},recovered=report.reconcileStoveReport(s,legacy,s.date);
 assert.equal(recovered.moves.filter(row=>row.direction==='joined'&&row.id===p.id).length,1);
 assert.deepEqual(legacy.moves,[]);
 const again=report.reconcileStoveReport(s,recovered,s.date);assert.deepEqual(again,recovered);
 const html=renderToStaticMarkup(createElement(View,{report:recovered,playerId:p.id,players:s.players})).replaceAll('<!-- -->','');
 assert.ok(html.includes('신규 입단 1명'));assert.ok(html.includes('신규계약'));assert.ok(html.includes(p.name));
 assert.equal(report.reconcileStoveReport(s,legacy,`${year}-11-30`).moves.length,0);
});
test('released players retain their departure squad on the right even after joining a different squad',()=>{
 const {stovePlayerMoves,clubStoveMoves}=require('../.test-build/lib/sim/stove-report.js'),View=require('../.test-build/app/components/stove-changes.js').default;
 const players=Object.entries({first:'1군',second:'2군',third:'잔류군',developmental:'육성'}).map(([squad,name],i)=>({id:`released-${i}`,name:`방출${name}`,position:'SS',teamId:0,professional:{lastSquad:'first',movements:[{date:'2028-11-01',from:2,to:null,kind:'방출',reason:'계약 종료',squad}]}}));
 const moves=players.flatMap(p=>stovePlayerMoves(p,'2028-11-01','2029-01-01'));
 const html=renderToStaticMarkup(createElement(View,{report:{club:2,moves},playerId:'mine',players}));
 for(const name of ['1군','2군','잔류군','육성'])assert.ok(html.includes(`<small class="stove-move-type">${name}</small>`));
 const snapshot=structuredClone(moves);clubStoveMoves(moves,2,players);assert.deepEqual(moves,snapshot);
 const legacy={...moves[0]};delete legacy.squad;players[0].professional.lastSquad='third';assert.equal(clubStoveMoves([legacy],2,players)[0].squad,'third');
});
test('FA credits require eight full seasons and a missed FA season requires two full seasons after expiry',()=>{
 const {settleFaService}=require('../.test-build/lib/sim/fa-service.js');
 const pro={faEligible:false,faDays:1800};
 const finish=(year,days)=>{pro.registration={year,days};settleFaService(pro,year);settleFaService(pro,year);return pro.faEligible;};
 for(let y=2028;y<2035;y++)assert.equal(finish(y,150),false);
 assert.equal(finish(2035,149),false);assert.equal(finish(2036,150),true);
 pro.lastFaTerm={start:2037,end:2039};
 assert.equal(finish(2037,150),false);assert.equal(finish(2038,149),false);assert.equal(finish(2039,150),false);
 assert.equal(finish(2040,150),false);assert.equal(finish(2041,100),false);assert.equal(finish(2042,150),true);
 pro.lastFaTerm={start:2043,end:2044};
 assert.equal(finish(2043,150),false);assert.equal(finish(2044,150),true);
 const years=Array.from({length:50},(_,i)=>market.faContractYears({id:'top'+i,age:29},90,2045,0));
 assert.ok(years.includes(6));assert.ok(years.every(n=>n>=1&&n<=6));
});
test('a saved league-wide notice counts only unique moves for my club when reopened',()=>{
 const StoveChanges=require('../.test-build/app/components/stove-changes.js').default;
 const mine={id:'mine',club:2,position:'SS',name:'우리선수',direction:'joined',reason:'입단'};
 const others=Array.from({length:220},(_,i)=>({...mine,id:String(i),club:1,name:'타구단선수'}));
 const players=[{id:mine.id,professional:{movements:[{kind:'입단',to:2,reason:'draft'}]}}];
 const html=renderToStaticMarkup(createElement(StoveChanges,{report:{club:2,moves:[mine,...others,mine]},playerId:mine.id,players})).replaceAll('<!-- -->','');
 assert.ok(html.includes('입단 1명'));assert.ok(html.includes('재계약 불가 0명'));assert.ok(html.includes('우리선수'));assert.ok(!html.includes('타구단선수'));
});
function acknowledge(s){for(let i=0;i<40&&s.careerNotice;i++)s=pc.acknowledgeCareer(s);return s;}
test('my club shows draft and developmental arrivals, paired trades and retirements in separate sections',()=>{
 const {stovePlayerMoves}=require('../.test-build/lib/sim/stove-report.js');
 const StoveChanges=require('../.test-build/app/components/stove-changes.js').default;
 const make=(id,m)=>stovePlayerMoves({id,name:id,position:'SS',professional:{movements:[{date:'2028-12-11',from:null,to:2,...m}]}},'2028-11-01','2029-01-01');
 const moves=[
   ...make('지명신인',{kind:'입단',reason:'draft'}),...make('신고신인',{kind:'입단',reason:'developmental'}),
   ...make('영입FA',{kind:'FA 이적',from:1,to:2}),...make('이적FA',{kind:'FA 이적',from:2,to:1}),
   ...make('잔류FA',{kind:'FA 잔류',from:2,to:2}),...make('기타계약',{kind:'계약',reason:'정식 계약'}),
   ...make('거래선수',{kind:'트레이드',from:2,to:4,exchange:{id:'other',name:'상대선수',position:'SP'}}),
   ...make('은퇴선수',{kind:'은퇴',from:2,to:null}),...make('방출선수',{kind:'방출',from:2,to:null})];
 const html=renderToStaticMarkup(createElement(StoveChanges,{report:{club:2,moves},playerId:'mine'})).replaceAll('<!-- -->','');
 for(const label of ['FA 3명','신규 입단 2명','드래프트','신고','재계약 불가 1명','트레이드 1건','거래선수','상대선수','수원 위즈','은퇴 1명','은퇴선수'])assert.ok(html.includes(label),label);
 for(const kind of ['영입','이적','잔류'])assert.ok(html.includes(`aria-label="${kind}"`));assert.ok(html.includes('잔류FA'));assert.ok(html.indexOf('지명신인')<html.indexOf('신고신인'));assert.ok(!html.includes('기타계약'));
 assert.match(html,/>영입FA<\/th><td>유격수<\/td><td>고양 히어로즈<\/td><td>.*?←.*?영입<\/span><\/td><td>서울 트윈스<\/td>/);
 assert.match(html,/>이적FA<\/th><td>유격수<\/td><td>고양 히어로즈<\/td><td>.*?→.*?이적<\/span><\/td><td>서울 트윈스<\/td>/);
});
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
test('the shop buys items during the regular season and settles each kind once',()=>{
 const s=fixture(),p=e.getPlayer(s),year=s.proWorld.year;
 s.phase='weekStart';s.proWorld.stage='regular';s.proWorld.seasonClosed=false;
 s.proWorld.seasons=[];
 p.professional.earnings=200_000_000;
 assert.throws(()=>life.actOnProCareer(s,{type:'buyOffseasonItems',items:{agent:1}}),/자금/);
 const bought=life.actOnProCareer(s,{type:'buyOffseasonItems',items:{rosin:2,tee:1}});
 assert.equal(p.offseasonShop,undefined);
 const {trainingItemBonus}=require('../.test-build/lib/sim/offseason-shop.js');
 assert.equal(trainingItemBonus(e.getPlayer(bought),'velocity'),.3);
 assert.equal(trainingItemBonus(e.getPlayer(bought),'contact'),.3);
 const Abilities=require('../.test-build/app/components/player-abilities.js').default;
 const renderAbilities=state=>renderToStaticMarkup(createElement(Abilities,{player:e.getPlayer(state),detailsOnly:true}));
 assert.equal((renderAbilities(bought).match(/class="stat-boost-indicator"[^>]*>↑<\/span>/g)??[]).length,2);
 const Shop=require('../.test-build/app/components/offseason-shop.js').default;
 const html=renderToStaticMarkup(createElement(Shop,{state:bought,player:e.getPlayer(bought),onAction(){}}));
 for(const text of ['상점','3X3 표적','리바운드 체인','₩20,000만원','₩11,000만원','장바구니 구매'])assert.ok(html.includes(text),text);
 life.closeProfessionalSeason(bought);life.closeProfessionalSeason(bought);
 const restored=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(bought))).state;
 assert.deepEqual(e.getPlayer(restored).offseasonShop,{spent:90_000_000,items:{rosin:1},settlement:{year,agent:false,conditioning:false}});
 assert.equal((renderAbilities(restored).match(/class="stat-boost-indicator"[^>]*>↑<\/span>/g)??[]).length,1);
});
test('purchased training stays active until stock runs out and conditioning covers camp aging',()=>{
 const p=e.getPlayer(fixture()),year=p.professional.agedYear,base=structuredClone(p);
 const shop=require('../.test-build/lib/sim/offseason-shop.js');
 p.offseasonShop={spent:30_000_000,items:{rosin:1}};
 for(const key of Object.keys(p.stats))p.stats[key]=base.stats[key]=60;
 e.train(p,6);e.train(base,6);
 assert.ok(p.stats.velocity>base.stats.velocity);
 assert.equal(p.stats.control,base.stats.control);
 const next=structuredClone(p);shop.settleShopItems(next,year);next.professional.agedYear++;
 const without=structuredClone(next);delete without.offseasonShop;
 e.train(next,6);e.train(without,6);assert.deepEqual(next.stats,without.stats);
 const proGrowth=require('../.test-build/lib/sim/pro-growth.js');
 const ordinary=structuredClone(p);p.age=ordinary.age=40;
 p.offseasonShop.items.conditioning=1;
 assert.equal(shop.conditioningMultiplier(p),.5);
 shop.settleShopItems(p,year);
 assert.equal(p.offseasonShop.items.conditioning,undefined);
 const coached=proGrowth.applyAging(p,year+1),normal=proGrowth.applyAging(ordinary,year+1);
 assert.ok(normal.velocity<0);
 assert.ok(Math.abs(coached.velocity-.5*normal.velocity)<1e-9);
 for(const key of Object.keys(normal))assert.ok(Math.abs(coached[key]-.5*normal[key])<1e-9,key);
 const tickets={...p.trainingPolicy,mode:'normal',tickets:Object.fromEntries(Object.keys(p.trainingPolicy.tickets).map(k=>[k,5]))};
 const positive=e.trainingFatigueDay(20,60,tickets).training;
 assert.ok(positive>0);
 assert.ok(Math.abs(e.trainingFatigueDay(20,60,tickets,.5).training-.5*positive)<1e-9);
});
test('regular-season and stove trades share a league-wide limit and midseason notices show the exchange',()=>{
 const s=fixture(),world=s.proWorld,year=world.year;
 world.stage='regular';world.seasonClosed=false;s.phase='weekStart';
 const first=s.calendar.competitions.find(c=>c.id==='pro-first');
 let noticed=0,elsewhere=0;
 for(let i=0;i<85;i++){
  s.date=e.addDays(first.startDate,i);
  const before=world.tradeActivity?.regular??0,userClub=e.getPlayer(s).teamId%10;
  const newsBefore=new Set(world.news.map(row=>row.id));
  life.finishProfessionalDay(s);
  const shown=[s.careerNotice,...(s.noticeQueue??[])].find(row=>row?.stoveReport?.tradeOnly);
  if((world.tradeActivity?.regular??0)>before){
   const trades=s.players.flatMap(p=>p.professional?.movements??[]).filter(m=>m.kind==='트레이드'&&m.date===s.date);
   const involved=trades.some(m=>m.from===userClub||m.to===userClub);
   assert.equal(!!shown,involved);
   assert.equal(world.news.some(row=>!newsBefore.has(row.id)&&row.text.includes(' ↔ ')),involved);
   if(involved)noticed++;else elsewhere++;
  }
  if(shown){
   const trade=shown.stoveReport.moves[0],StoveChanges=require('../.test-build/app/components/stove-changes.js').default;
   const html=renderToStaticMarkup(createElement(StoveChanges,{report:shown.stoveReport,playerId:s.playerId}));
   assert.ok(trade.exchange);assert.ok(html.includes('↔'));assert.ok(!html.includes('신규 입단'));
  }
  clear(s);
 }
 assert.equal(world.tradeActivity.regular,2);
 assert.equal(noticed+elsewhere,2);assert.ok(elsewhere>0);
 world.stage='offseason';world.stove={openedAt:`${year}-11-01`,movedIds:[],closed:false};
 for(const p of s.players)if(p.professional.contract)p.professional.contract.endYear=year+1;
 for(let i=0;i<=60;i++){s.date=e.addDays(world.stove.openedAt,i);market.reviewNPCTrades(s);clear(s);}
 const total=world.tradeActivity.regular+world.tradeActivity.winter;
 assert.ok(total===3||total===4);
 const restored=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(s))).state;
 market.reviewNPCTrades(restored);
 assert.deepEqual(restored.proWorld.tradeActivity,world.tradeActivity);
});
test('stove news hides unrelated trade headlines from older saves',()=>{
 const s=fixture(),club=e.getPlayer(s).teamId%10;
 const {clubName}=require('../.test-build/lib/sim/pro-world.js');
 const {ProContractPanel}=require('../.test-build/app/components/pro-career-panels.js');
 const mine=clubName(s,club),other=clubName(s,(club+1)%10),third=clubName(s,(club+2)%10);
 s.proWorld.stove={openedAt:s.date,closesAt:s.date,movedIds:[],closed:true};
 s.proWorld.news=[
  {id:'own',date:s.date,text:`${other} ↔ ${mine} · 우리팀교환 / 상대선수 1대1 교환`},
  {id:'unrelated',date:s.date,text:`${other} ↔ ${third} · 타팀교환 / 상대선수 1대1 교환`},
  {id:'other-news',date:s.date,text:'다른 계약 소식'},
 ];
 const html=renderToStaticMarkup(createElement(ProContractPanel,{state:s,onAction(){},onRetire(){},disabled:false}));
 assert.ok(html.includes('우리팀교환'));
 assert.ok(!html.includes('타팀교환'));
 assert.ok(html.includes('다른 계약 소식'));
});
function retentionFixture(){
 const s=clear(fixture()),p=e.getPlayer(s),club=p.professional.contract.club;
 const peer=structuredClone(p);peer.id='strong-incumbent';peer.teamId=club;
 for(const key of Object.keys(peer.stats))peer.stats[key]=100;
 s.players=[p,peer];for(const c of s.proWorld.clubs)c.budget=1e12;
 for(const row of p.professional.assessments){delete row.war;delete row.seasonEvaluation;delete row.seasonRank;row.score=82;row.grade='S';row.cumulative=82;row.cumulativeGrade='S';}
 return s;
}
test('an agent consumed at season end still improves that winter’s FA counteroffer',()=>{
 let s=retentionFixture();
 e.getPlayer(s).professional.earnings=350_000_000;
 market.openContractMarket(s);
 const offer=s.proWorld.market.offers[0],ordinary=life.actOnProCareer(s,{type:'negotiate',id:offer.id});
 s=life.actOnProCareer(s,{type:'buyOffseasonItems',items:{agent:1}});
 require('../.test-build/lib/sim/offseason-shop.js').settleShopItems(e.getPlayer(s),s.proWorld.year);
 assert.equal(e.getPlayer(s).offseasonShop.items.agent,undefined);
 const improved=life.actOnProCareer(s,{type:'negotiate',id:offer.id});
 const result=improved.proWorld.market.offers.find(row=>row.id===offer.id);
 assert.equal(result.salary,Math.trunc(offer.salary*1.18/100_000)*100_000);
 assert.ok(result.salary>ordinary.proWorld.market.offers.find(row=>row.id===offer.id).salary);
 assert.ok(result.negotiated);
});
test('FA retains a valid home-team offer even when nine rival clubs rank ahead, without duplicates or more than three offers',()=>{
 const s=retentionFixture(),p=e.getPlayer(s),club=p.professional.contract.club,before=structuredClone(p.professional.contract);
 market.openContractMarket(s);const offers=s.proWorld.market.offers;
 assert.equal(s.proWorld.market.kind,'fa');assert.equal(offers.length,3);assert.equal(offers[0].club,club);assert.equal(offers[0].faRetention,true);
 assert.ok(offers.slice(1).every(o=>o.club!==club&&o.faRetention===false));assert.equal(new Set(offers.map(o=>o.club)).size,3);
 assert.deepEqual(p.professional.contract,before);
 s.proWorld.market.round++;market.refreshOffers(s);assert.equal(s.proWorld.market.offers[0].club,club);
});
test('the home-team FA proposal can be negotiated, saved and accepted without an invented transfer or reset service',()=>{
 const s=retentionFixture(),p=e.getPlayer(s),team=p.teamId,club=p.professional.contract.club,service=structuredClone(p.professional.service),career=structuredClone(p.career),salaries=structuredClone(p.professional.salaries);
 market.openContractMarket(s);const offer=s.proWorld.market.offers[0];assert.ok(offer.years>=2);
 market.negotiateOffer(s,offer.id);clear(s);
 const restored=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(s))).state;
 assert.equal(restored.proWorld.market.offers[0].faRetention,true);
 const next=life.actOnProCareer(restored,{type:'accept',id:offer.id}),q=e.getPlayer(next);
 assert.equal(next.proWorld.market.settled,true);assert.equal(q.teamId,team);assert.equal(q.professional.contract.club,club);assert.equal(q.professional.contract.source,'fa');
 assert.equal(q.professional.contract.salary,offer.salary);assert.equal(q.professional.contract.endYear,offer.year+offer.years-1);
 assert.deepEqual(q.professional.service,service);assert.deepEqual(q.career,career);assert.deepEqual(q.professional.salaries,salaries);
 assert.equal(q.professional.faDays,900);assert.equal(q.professional.movements.at(-1).kind,'FA 잔류');
 assert.equal(q.professional.movements.at(-1).from,club);assert.equal(q.professional.movements.at(-1).to,club);
});
test('an unaffordable home-team proposal does not bypass budget checks or prevent rival FA offers',()=>{
 const s=retentionFixture(),p=e.getPlayer(s),club=p.professional.contract.club;s.proWorld.clubs[club].budget=0;
 market.openContractMarket(s);assert.equal(s.proWorld.market.offers.length,3);assert.ok(s.proWorld.market.offers.every(o=>o.club!==club));
 assert.equal(p.professional.employment,'active');assert.equal(p.professional.contract.club,club);
});
test('the FA screen distinguishes staying from transferring, including older saved offers without a retention flag',()=>{
 const s=retentionFixture();market.openContractMarket(s);
 const render=()=>renderToStaticMarkup(createElement(ProContractPanel,{state:s,disabled:false,onAction(){},onRetire(){}}));
 let html=render();assert.match(html,/원소속팀 FA 잔류 제안/);assert.match(html,/원소속팀 잔류/);assert.match(html,/타 구단 FA 이적 제안/);assert.match(html,/이적 계약 수락/);
 for(const offer of s.proWorld.market.offers)delete offer.faRetention;
 html=render();assert.match(html,/원소속팀 FA 잔류 제안/);
});
test('FA offers can use a first-team vacancy when all 45 lower places are filled',()=>{
 const s=fixture(),p=e.getPlayer(s),club=(p.teamId%10+1)%10;
 p.teamId%=10; // A first-team FA preserves first-team registration on transfer.
 const make=(i,team)=>{const q=structuredClone(p);q.id='capacity-'+i;q.teamId=team;q.professional.contract.club=club;return q;};
 s.players=[p,...Array.from({length:28},(_,i)=>make(i,club)),...Array.from({length:45},(_,i)=>make(i+28,club+10))];
 s.proWorld.clubs[club].budget=1e12;
 const offer=market.offerFor(s,p,club,s.proWorld.year+1,'fa');assert.ok(offer);
 market.signContract(s,p,offer);assert.equal(p.teamId,club);assert.equal(market.clubRoster(s,club).length,74);assert.equal(s.players.filter(q=>q.teamId===club).length,29);
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
 const direct=confirmReport(life.actOnProCareer(s,{type:'nextSeason'}));assert.equal(JSON.stringify(s),before);assert.equal(direct.date,`${year}-02-01`);assert.equal(direct.proWorld.stage,'camp');assert.equal(direct.proWorld.stove,undefined);assert.equal(direct.careerNotice.title,`${year} 캠프 시작`);assert.deepEqual(e.getPlayer(direct).professional.contract,contract);assert.deepEqual(e.getPlayer(direct).career,career);
 let weekly=structuredClone(s);while(!weekly.proWorld.stove.closed)weekly=clear(life.actOnProCareer(weekly,{type:'wait'}));weekly=life.actOnProCareer(weekly,{type:'nextSeason'});
 const players=state=>state.players.map(p=>({id:p.id,team:p.teamId,age:p.age,stats:p.stats,records:p.seasonStats,career:p.career,contract:p.professional.contract,employment:p.professional.employment,fa:p.professional.faDays,injury:p.injury,fatigue:p.fatigue}));
 assert.deepEqual(players(direct),players(weekly));assert.deepEqual(direct.proWorld.news,weekly.proWorld.news);assert.deepEqual(direct.rngStates,weekly.rngStates);assert.deepEqual(direct.calendar,weekly.calendar);
});

test('ongoing multi-year contracts can enter camp directly before opening the market and after restoring a partial winter',()=>{
 const s=fixture(),p=e.getPlayer(s),year=s.proWorld.year+1;p.professional.contract.endYear=year+1;const contract=structuredClone(p.professional.contract);
 const next=confirmReport(life.actOnProCareer(s,{type:'nextSeason'}));assert.equal(next.date,`${year}-02-01`);assert.deepEqual(e.getPlayer(next).professional.contract,contract);assert.ok(!next.proWorld.news.some(row=>/^\d+:stove(?::\d+|-open)$/.test(row.id)));assert.equal(next.proWorld.draftedYears.filter(y=>y===year).length,1);
 let partial=clear(life.actOnProCareer(s,{type:'market'}));partial=clear(life.actOnProCareer(partial,{type:'wait'}));partial=clear(life.actOnProCareer(partial,{type:'wait'}));
 const restored=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(partial))).state;
 const resumed=confirmReport(life.actOnProCareer(restored,{type:'nextSeason'}));assert.equal(resumed.date,next.date);assert.deepEqual(resumed.proWorld.news,next.proWorld.news);assert.deepEqual(e.getPlayer(resumed).professional.contract,contract);assert.equal(new Set(resumed.players.map(p=>p.id)).size,resumed.players.length);
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
 for(const year of [2028,2029]){const c=calendar.developmentCalendar(year,true);assert.ok(c.trainingDays.some(d=>d.startsWith(`${year}-02-`)));assert.ok(c.events.filter(g=>!g.exhibition).every(g=>g.date>=`${year}-03-22`));}
});
for(const [kind,year,name] of [['premier12',2031,'프리미어12'],['apbc',2033,'APBC']])test(`${name} has its own participation button and blocks winter/camp controls until it finishes`,()=>{
 const s=fixture(),p=e.getPlayer(s),nt=require('../.test-build/lib/sim/national-tournament.js');s.date=`${year}-10-25`;s.calendar.seasonYear=year;s.proWorld.year=year;s.proWorld.stage='summary';delete s.proWorld.stove;p.professional.contract.endYear=year+2;
 const entry={kind,year,date:s.date,start:`${year}-11-01`,end:`${year}-11-30`,simulationVersion:1,roster:[{id:p.id}]};s.nationalTeams=[entry];
 const panel=()=>renderToStaticMarkup(createElement(ProContractPanel,{state:s,disabled:false,onAction(){},onRetire(){}}));
 assert.equal(life.canEnterNextProCamp(s),false);let html=panel();assert.ok(html.includes(`${name} 참가 →`));assert.doesNotMatch(html,/<button[^>]*>스토브리그 시작/);assert.doesNotMatch(html,/<button[^>]*>다음 캠프로/);
 const props={state:s,policy:p.trainingPolicy,busy:false,auto:false,autoStartWeek:s.week,onAdvance(){},onToggleAuto(){},onContinue(){},onNextCamp(){},nationalAction:{...nt.nationalOffseasonActionLabel(s),onClick(){}}};html=renderToStaticMarkup(createElement(ProgressControls,props));assert.ok(html.includes(`${name} 참가 →`));assert.ok(!html.includes('다음 캠프로 바로 가기'));assert.ok(html.includes('INTERNATIONAL'));
 entry.participated=true;assert.ok(panel().includes(`${name} 참가 →`));entry.participated=false;assert.ok(panel().includes(`${name} 결과 확인 →`));
 entry.tournament={finished:`${year}-11-18`};assert.equal(life.canEnterNextProCamp(s),true);html=panel();assert.match(html,/<button[^>]*>스토브리그 →/);assert.ok(!html.includes(`${name} 참가 →`));
});

test('initial veteran NPC FA service varies with ability and never exceeds their past career',()=>{
 const world=require('../.test-build/lib/sim/pro-world.js');
 const s=fixture(),year=s.calendar.seasonYear;
 const make=(id,ability,age=33,entry='veteran')=>{
  const p=e.previewPlayer('npc-fa-test',id,'SS');p.id=id;p.age=age;p.teamId=0;
  for(const key of Object.keys(p.stats))p.stats[key]=ability;
  world.initializeProfessional(s,p,0,entry);return p;
 };
 let strong=0,weak=0;const spread=new Set();
 for(let i=0;i<100;i++){
  const good=make(`fa-veteran-${i}`,90),poor=make(`fa-veteran-${i}`,45);
  const years=good.professional.faSeasons??[];
  strong+=years.length;weak+=(poor.professional.faSeasons??[]).length;spread.add(years.length);
  assert.ok(years.every(y=>y>=year-14&&y<year));assert.equal(new Set(years).size,years.length);
  assert.equal(good.professional.faEligible,years.length>=8);
 }
 assert.ok(strong>weak*3);assert.ok(spread.size>1);
 assert.equal(make('fa-new-draft',90,19,'draft').professional.faEligible,false);
 assert.equal(make('fa-old-draft',90,33,'draft').professional.faSeasons,undefined);
 const mine=e.getPlayer(s),before=structuredClone(mine.professional);
 world.initializeProfessional(s,mine,mine.teamId%10);assert.deepEqual(mine.professional.faSeasons,before.faSeasons);
});
test('legacy NPC FA history fills only pre-world years once and preserves current progress and FA terms',()=>{
 const {seedNpcFaHistory,needsNpcFaHistoryUpgrade}=require('../.test-build/lib/sim/npc-fa-history.js');
 const s=fixture(),p=s.players.find(p=>p.id!==s.playerId&&p.professional?.entry==='veteran'),pro=p.professional,year=s.calendar.seasonYear;
 for(const key of Object.keys(p.stats))p.stats[key]=95;
 delete pro.faHistorySeeded;pro.rookieYear=year-15;
 pro.movements=[{date:`${year-2}-03-01`,from:null,to:0,kind:'입단',reason:'veteran'}];
 pro.service=[{club:0,from:year-2,to:year}];pro.assessments=[];
 pro.faSeasons=[year-2];pro.registration={year,days:91};
 pro.lastFaTerm={start:year-2,end:year+1};
 const rng=structuredClone(s.rngStates),term=structuredClone(pro.lastFaTerm);
 assert.equal(needsNpcFaHistoryUpgrade(s),true);
 const upgraded=life.upgradeProfessionalState(s),upgradedPro=upgraded.players.find(row=>row.id===p.id).professional;
 assert.equal(upgradedPro.faHistorySeeded,true);assert.equal(pro.faHistorySeeded,undefined);
 seedNpcFaHistory(s,p);assert.deepEqual(upgradedPro.faSeasons,pro.faSeasons);
 assert.ok(pro.faSeasons.includes(year-2));assert.ok(!pro.faSeasons.includes(year-1));assert.ok(!pro.faSeasons.includes(year));
 assert.equal(pro.registration.days,91);assert.deepEqual(pro.lastFaTerm,term);assert.equal(pro.faEligible,false);assert.deepEqual(s.rngStates,rng);
 const seeded=structuredClone(pro);seedNpcFaHistory(s,p);assert.deepEqual(pro,seeded);
 const restored=storage.decodeCareerSave(storage.serializeCareerSave(storage.encodeCareerSave(s))).state;
 const q=restored.players.find(row=>row.id===p.id);assert.equal(q.professional.faHistorySeeded,true);
 assert.deepEqual(q.professional.faSeasons,pro.faSeasons);
});

test('stove trade requests have a saved seven-day cooldown independent of other requests',()=>{
 const s=fixture(),p=e.getPlayer(s),pro=p.professional,year=s.proWorld.year;
 s.date=`${year}-12-06`;s.proWorld.stage='offseason';s.proWorld.seasonClosed=true;
 s.proWorld.stove={version:1,year:year+1,openedAt:s.date,closesAt:`${year+1}-01-01`,nextUpdate:e.addDays(s.date,7),round:0,closed:false,movedIds:[]};
 // Expired contracts cannot be exchanged, so both rejected requests still consume the week.
 pro.contract.endYear=year;pro.requestAfter=e.addDays(s.date,28);delete pro.tradeRequestAfter;
 const generalCooldown=pro.requestAfter;
 market.careerRequest(s,'trade');assert.equal(pro.tradeRequestAfter,`${year}-12-13`);assert.equal(pro.requestAfter,generalCooldown);
 assert.equal(s.careerNotice?.title==='트레이드 요청 결과'||s.noticeQueue.some(row=>row.title==='트레이드 요청 결과'),true);
 assert.throws(()=>market.careerRequest(s,'trade'),/이후/);
 s.date=`${year}-12-12`;assert.throws(()=>market.careerRequest(s,'trade'),/이후/);
 const restored=storage.decodeCareerSave(storage.serializeCareerSave(storage.encodeCareerSave(s))).state;
 assert.equal(e.getPlayer(restored).professional.tradeRequestAfter,`${year}-12-13`);
 assert.throws(()=>market.careerRequest(restored,'trade'),/이후/);
 restored.date=`${year}-12-13`;market.careerRequest(restored,'trade');
 assert.equal(e.getPlayer(restored).professional.tradeRequestAfter,`${year}-12-20`);
});
test('stove trade button stays available after signing and disables only until its next eligible date',()=>{
 const s=fixture(),p=e.getPlayer(s),year=s.proWorld.year;
 s.date=`${year}-12-06`;s.proWorld.stage='offseason';s.proWorld.seasonClosed=true;
 s.proWorld.stove={version:1,year:year+1,openedAt:s.date,closesAt:`${year+1}-01-01`,nextUpdate:e.addDays(s.date,7),round:0,closed:false,movedIds:[]};
 s.proWorld.market={kind:'renewal',year:year+1,round:0,offers:[],settled:true};
 p.professional.contract.endYear=year+2;p.professional.requestAfter=e.addDays(s.date,28);delete p.professional.tradeRequestAfter;
 const render=()=>renderToStaticMarkup(createElement(ProContractPanel,{state:s,onAction(){},onRetire(){},disabled:false}));
 let html=render();assert.match(html,/<button class="secondary">트레이드 요청<\/button>/);assert.ok(!html.includes('이적 검토 요청'));
 p.professional.tradeRequestAfter=e.addDays(s.date,7);html=render();assert.match(html,/<button class="secondary" disabled=""[^>]*>트레이드 요청<\/button>/);
 s.date=p.professional.tradeRequestAfter;html=render();assert.match(html,/<button class="secondary">트레이드 요청<\/button>/);
});
