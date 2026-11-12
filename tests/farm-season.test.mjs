import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js'),world=require('../.test-build/lib/sim/pro-world.js'),life=require('../.test-build/lib/sim/pro-season.js');
const {developmentCalendar}=require('../.test-build/lib/sim/pro-calendar.js');
const {upgradeFarmSchedule}=require('../.test-build/lib/sim/pro-farm-schedule.js');
const {threeGameSchedule}=require('../.test-build/lib/sim/pro-schedule.js');
const {allstarBreak}=require('../.test-build/lib/sim/pro-allstar-calendar.js');
const {reviewFarmPostseason,farmPlayoffRoster,isFarmPostseason}=require('../.test-build/lib/sim/pro-farm-postseason.js');
const {finishCompetitionDay}=require('../.test-build/lib/sim/calendar.js');
const {archiveProfessionalSeason}=require('../.test-build/lib/sim/pro-retirement.js');
const {playerSeasons}=require('../.test-build/lib/player-records.js');
const save=require('../.test-build/lib/career-save.js');
const {StateTransferCache}=require('../.test-build/lib/sim/state-transfer.js');
const {proGeneralCandidates}=require('../.test-build/lib/sim/pro-event-runtime.js');
const Bracket=require('../.test-build/app/components/farm-postseason-bracket.js').default;
const Records=require('../.test-build/app/components/season-records.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('farm-117-tests','검증','SS'));
const farm=calendar=>calendar.events.filter(g=>g.competitionId==='pro-second'&&!g.tiebreaker);
function verify(calendar){
  const games=farm(calendar);assert.equal(games.length,585);
  for(let team=10;team<20;team++){
    const mine=games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(team));assert.equal(mine.length,117);assert.equal(new Set(mine.map(g=>g.date)).size,117);
    assert.ok([58,59].includes(mine.filter(g=>g.homeTeamId===team).length));
    for(let opponent=10;opponent<20;opponent++)if(team!==opponent)assert.equal(mine.filter(g=>[g.homeTeamId,g.awayTeamId].includes(opponent)).length,13);
  }
  assert.ok(games.every(g=>new Date(g.date).getUTCDay()!==4&&!allstarBreak(g.date,calendar.seasonYear)));
}
function fixture(){const s=structuredClone(template);s.proWorld.stage='regular';s.careerNotice=null;s.noticeQueue=[];s.careerEvent=null;delete s.weekProgress;delete s.matchProgress;return s;}
function endRegular(s){const c=s.calendar.competitions.find(c=>c.id==='pro-second');s.date=c.endDate;for(const g of farm(s.calendar)){g.status='completed';g.score=[2,1];}reviewFarmPostseason(s);}
function completePlayoffs(s,ties=false){
  for(let guard=0;guard<20&&s.proWorld.farmPostseason?.champion===undefined;guard++){
    const pending=s.calendar.events.filter(g=>isFarmPostseason(g.competitionId)&&g.status==='scheduled');assert.ok(pending.length);
    const date=pending[0].date;s.date=date;
    for(const g of pending.filter(g=>g.date===date)){g.status='completed';g.score=ties?[1,1]:g.round%2?[1,0]:[0,1];}
    finishCompetitionDay(s.calendar,s.date);reviewFarmPostseason(s);
  }
  assert.ok(s.proWorld.farmPostseason.champion!==undefined);
}

test('117 games mean 13 against every opponent, 58/59 home dates, same opening and Thursday rest',()=>{
  for(let year=2027;year<=2040;year++){
    const c=developmentCalendar(year,true);verify(c);assert.equal(c.events.length,1350);
    const [first,second]=c.competitions;assert.equal(first.startDate,second.startDate);assert.ok(second.endDate<first.endDate);
    const s=fixture();s.calendar=c;s.proWorld.year=year;s.proWorld.regularEnd=first.endDate;endRegular(s);completePlayoffs(s,true);
    assert.ok(s.date<first.endDate,`${year}: farm playoffs must finish before first-team regular season`);
    assert.equal(s.calendar.events.filter(g=>isFarmPostseason(g.competitionId)).length,11);assert.ok(!c.events.some(g=>g.tiebreaker));
  }
});

test('72-game save upgrades preserve played games and records and fill every pair to thirteen',()=>{
  for(const midseason of [false,true]){
    const s=fixture(),year=s.calendar.seasonYear;
    const old=threeGameSchedule(year,Array.from({length:10},(_,i)=>i+10),8,'03-22','pro-second',true);
    s.calendar.events=s.calendar.events.filter(g=>g.competitionId!=='pro-second').concat(old).sort((a,b)=>a.date.localeCompare(b.date));delete s.calendar.proFarmScheduleVersion;
    s.date=midseason?`${year}-05-20`:`${year}-02-01`;
    for(const g of old)if(g.date<s.date){g.status='completed';g.score=[4,2];}
    const played=structuredClone(old.filter(g=>g.status==='completed')),players=structuredClone(s.players);
    assert.equal(upgradeFarmSchedule(s),true);verify(s.calendar);
    assert.deepEqual(s.calendar.events.filter(g=>g.competitionId==='pro-second'&&g.status==='completed').sort((a,b)=>a.id.localeCompare(b.id)),played.sort((a,b)=>a.id.localeCompare(b.id)));
    assert.deepEqual(s.players,players);assert.equal(upgradeFarmSchedule(s),false);
    const pending=farm(s.calendar).filter(g=>g.status==='scheduled');assert.ok(pending.every(g=>g.date>=s.date));
    assert.ok(pending[0].date>=s.calendar.competitions.find(c=>c.id==='pro-first').startDate);
  }
});

test('no game, off-date game, completed game and offseason never announce an evaluation appearance',()=>{
  for(const kind of ['absent','future','completed','offseason']){
    const s=fixture(),p=e.getPlayer(s);p.teamId=30;p.age=20;delete p.professional.lastAppearance;delete p.professional.lastEvaluation;
    s.date=`${s.calendar.seasonYear}-11-12`;if(kind==='offseason'){s.proWorld.stage='stove';s.proWorld.seasonClosed=true;}
    const g={id:'no-opportunity',date:kind==='future'?e.addDays(s.date,1):s.date,homeTeamId:10,awayTeamId:11,competitionId:'pro-second',status:kind==='completed'?'completed':'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}};
    s.calendar.events=kind==='absent'?[]:[g];world.prepareEvaluationOpportunities(s,[g.id]);
    assert.equal(g.evaluationPlayers,undefined);assert.equal(s.careerNotice,null);assert.ok(!proGeneralCandidates(s).some(c=>c.id==='PE12'));
  }
  const s=fixture(),p=e.getPlayer(s);p.teamId=30;p.age=20;s.date=`${s.calendar.seasonYear}-04-12`;p.professional.lastRegistration=`${s.calendar.seasonYear}-03-01`;
  require('../.test-build/lib/sim/pro-event-ledger.js').ensureProEvents(s).introducedAt=`${s.calendar.seasonYear}-03-01`;
  s.calendar.events=[{id:'today',date:s.date,homeTeamId:10,awayTeamId:11,competitionId:'pro-second',status:'scheduled'}];
  assert.ok(proGeneralCandidates(s).some(c=>c.id==='PE12'));
});

test('farm postseason entry includes all lower squads, excludes first team and preserves selection priority',()=>{
  const s=fixture();endRegular(s);const post=s.proWorld.farmPostseason;assert.equal(post.seeds.length,4);assert.equal(post.series.length,2);
  const g=s.calendar.events.find(g=>isFarmPostseason(g.competitionId));const club=g.homeTeamId%10;
  for(const tier of [10,20,30])assert.ok(s.players.some(p=>p.teamId===club+tier&&post.series[0].rosters[String(g.homeTeamId)]?.includes(p.id)));
  assert.ok(farmPlayoffRoster(s,g).flat().every(p=>p.teamId>=10));
  const second=farmPlayoffRoster(s,g)[0].find(p=>p.position==='SS');assert.ok(second);const third=structuredClone(second),dev=structuredClone(second);
  third.id='farm-third';third.teamId=club+20;dev.id='farm-dev';dev.teamId=club+30;for(const p of [second,third,dev]){p.fatigue=0;p.injury=null;p.forcedRest=false;p.throws='R';p.trainingPolicy.mode='train';delete p.twoWay;p.eligiblePositions=['SS'];}
  for(const p of [third,dev]){s.players.push(p);post.series.find(row=>row.clubs.includes(g.homeTeamId)).rosters[String(g.homeTeamId)].push(p.id);}
  const pool=()=>farmPlayoffRoster(s,g)[0];s.date=g.date;
  // Isolate the three candidates for this position while keeping other roles playable.
  for(const p of pool())if(p.id!==second.id&&p.id!==third.id&&p.id!==dev.id&&p.eligiblePositions?.includes('SS'))p.eligiblePositions=p.eligiblePositions.filter(x=>x!=='SS');
  assert.equal(e.lineup(pool(),s.date).field[1].id,second.id);
  second.trainingPolicy.mode='rest';assert.equal(e.lineup(pool(),s.date).field[1].id,third.id);
  third.trainingPolicy.mode='rest';assert.equal(e.lineup(pool(),s.date).field[1].id,dev.id);
  const html=renderToStaticMarkup(createElement(Bracket,{state:s}));assert.match(html,/2군 포스트시즌/);assert.match(html,/신고선수/);
});

test('actual farm playoff records stay separate and survive saves, worker transfer, career archive and rollover',()=>{
  const s=fixture();endRegular(s);const g=s.calendar.events.find(g=>isFarmPostseason(g.competitionId)),club=g.homeTeamId%10;
  // A full rested real roster, including third/developmental players, avoids fixture fatigue.
  for(const p of s.players){p.fatigue=0;p.forcedRest=false;p.injury=null;p.lastPitched=null;p.trainingPolicy.mode='train';}
  s.date=g.date;const before=new Map(s.players.map(p=>[p.id,structuredClone({season:p.seasonStats,levels:p.seasonByLevel,post:p.seasonPostseason})]));
  const enabled=e.params['pro_events.enabled'];try{e.params['pro_events.enabled']=0;assert.equal(e.simulateGame(s,g,[]),true);}finally{e.params['pro_events.enabled']=enabled;}
  assert.equal(g.status,'completed');let n=0;
  for(const [id,r] of Object.entries(g.boxScore)){
    const p=s.players.find(p=>p.id===id);assert.deepEqual(p.seasonStats,before.get(id).season);assert.deepEqual(p.seasonByLevel,before.get(id).levels);assert.deepEqual(p.seasonPostseason,before.get(id).post);
    if(r.batting.PA||r.pitching.BF){assert.deepEqual(p.seasonFarmPostseason,r);assert.deepEqual(p.seasonByClub[String(p.teamId%10)].farmPostseason,r);n++;}
  }
  assert.ok(n>18);const p=s.players.find(p=>p.teamId===club+10&&p.seasonFarmPostseason?.batting.PA);assert.ok(p);
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored.proWorld.farmPostseason,s.proWorld.farmPostseason);assert.deepEqual(restored.players.find(q=>q.id===p.id).seasonFarmPostseason,p.seasonFarmPostseason);
  const sender=new StateTransferCache(),receiver=new StateTransferCache();receiver.decode(structuredClone(sender.encode(s)));const transferred=receiver.decode(structuredClone(sender.encode(s)));assert.deepEqual(transferred.players.find(q=>q.id===p.id).seasonFarmPostseason,p.seasonFarmPostseason);
  archiveProfessionalSeason(s,p);assert.deepEqual(p.career.at(-1).farmPostseason,p.seasonFarmPostseason);assert.deepEqual(playerSeasons(p,s.calendar.seasonYear).at(-1).farmPostseason,p.seasonFarmPostseason);
  assert.match(renderToStaticMarkup(createElement(Records,{player:p,year:s.calendar.seasonYear,school:'검증',ended:false,mine:true,onMyRecords(){}})),/2군 포스트시즌/);
  reviewFarmPostseason(s);completePlayoffs(s);const champ=s.proWorld.farmPostseason.champion;
  s.date=s.proWorld.regularEnd;s.proWorld.postseason={format:'kbo-v1',seeds:[0,1,2,3,4],series:[],champion:0};life.closeProfessionalSeason(s);assert.equal(s.proWorld.seasons.at(-1).farmChampion,champ);
  // Start a fresh campaign with the already contracted demo player.
  s.careerNotice=null;s.noticeQueue=[];const mine=e.getPlayer(s);mine.professional.employment='active';mine.professional.contract={...mine.professional.contract,club:mine.teamId%10,startYear:s.calendar.seasonYear,endYear:s.calendar.seasonYear+2};life.startNextProSeason(s);assert.equal(s.proWorld.farmPostseason,undefined);assert.ok(s.players.every(p=>!p.seasonFarmPostseason?.batting.PA&&!p.seasonFarmPostseason?.pitching.BF));verify(s.calendar);
});

test('first-team playoffs wait until a late legacy farm postseason has actually finished',()=>{
  const s=fixture();endRegular(s);s.date=s.proWorld.regularEnd;life.finishProfessionalDay(s);assert.equal(s.proWorld.stage,'regular');assert.equal(s.proWorld.postseason,undefined);
  completePlayoffs(s);s.date=s.proWorld.regularEnd;life.finishProfessionalDay(s);assert.equal(s.proWorld.stage,'postseason');
});
