import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),life=require('../.test-build/lib/sim/pro-season.js');
const {encodeCareerSave,decodeCareerSave}=require('../.test-build/lib/career-save.js');
const {clubName}=require('../.test-build/lib/sim/pro-world.js');
const world=require('../.test-build/lib/sim/pro-world.js'),postRoster=require('../.test-build/lib/sim/pro-postseason-roster.js');
const {CareerNoticeDialog}=require('../.test-build/app/components/career-continuation.js');
const Bracket=require('../.test-build/app/components/postseason-bracket.js').default,Dashboard=require('../.test-build/app/components/pro-dashboard.js').default,League=require('../.test-build/app/components/pro-league.js').default;
e.params['pro_events.enabled']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('postseason-ladder','가을선수','SS'));
function fixture(){const s=structuredClone(template);s.date=s.proWorld.regularEnd;s.proWorld.stage='regular';life.finishProfessionalDay(s);return s;}
const round=(s,id)=>s.proWorld.postseason.series.find(v=>v.id===id);
const next=(s,id)=>{const r=round(s,id);return s.calendar.events.find(g=>g.id===`${s.proWorld.year}:${id}:${r.game-1}`);};
function play(s,id,winner,{tie=false,forfeit=false}={}){const g=next(s,id);s.date=g.date;g.status=forfeit?'forfeit':'completed';if(forfeit)g.forfeitTeamId=[g.homeTeamId,g.awayTeamId].find(id=>id!==winner);g.score=tie?[2,2]:g.homeTeamId===winner?[3,1]:[1,3];life.finishProfessionalDay(s);return g;}
function sweep(s,id,winner){while(round(s,id).winner===undefined)play(s,id,winner);}

test('top five enter the stepladder, only ranks four and five start, and the advantage schedules no fake game',()=>{
 const before=structuredClone(template),s=fixture(),p=s.proWorld.postseason;
 assert.equal(p.format,'kbo-v1');assert.deepEqual(p.seeds,[0,1,2,3,4]);assert.equal(p.series.length,1);assert.deepEqual(round(s,'wildcard').clubs,[3,4]);assert.deepEqual(round(s,'wildcard').wins,[1,0]);assert.equal(round(s,'wildcard').target,2);
 assert.equal(s.calendar.events.filter(g=>g.competitionId.startsWith('pro-playoffs-')).length,1);assert.equal(next(s,'wildcard').homeTeamId,3);assert.deepEqual(s.rngStates,before.rngStates);assert.deepEqual(template,before);
});

test('regular-season notices follow the parent club rank and put non-first-team registration last',()=>{
 for(let rank=1;rank<=10;rank++)for(const level of [0,10,20,30]){
  const s=structuredClone(template),p=e.getPlayer(s);p.teamId=rank-1+level;s.careerNotice=null;s.noticeQueue=[];
  s.date=s.proWorld.regularEnd;s.proWorld.stage='regular';life.finishProfessionalDay(s);
  const notice=s.careerNotice,team=clubName(s,rank-1);
  assert.equal(notice.code,`PRO10:postseason:${s.proWorld.year}`);
  assert.equal(notice.title,rank===1?`${team} 정규시즌 우승!`:rank<=5?`${team} 포스트시즌 진출 성공 !`:`${team}는 포스트 시즌 진출에 실패했습니다.`);
  const entry=rank===1?'1위로 한국시리즈에 진출합니다':rank===2?'2위로 플레이오프에 진출합니다.':rank===3?'3위로 준플레이오프에 직행합니다':rank<=5?`${rank}위로 와일드카드 결정전에 진출합니다`:'포스트시즌 종료 후 시즌이 종료됩니다.';
  const suffix='아쉽게도 포스트시즌 엔트리에는 등록되지 못했습니다';
  const first=e.getPlayer(s).teamId<10,calledUp=s.proWorld.postseasonExpansion.calledUp.includes(p.id);
  assert.equal(notice.message,[entry,...(first?[]:[suffix]),...(calledUp?['포스트시즌 특별 엔트리에 선발되어 1군으로 합류했습니다.']:[])].filter(Boolean).join('\n\n'));
  assert.doesNotMatch(notice.message,/다른 선수|리그 이력|고정 명단|기록과 분리/);
  if(rank===4&&level===10){s.careerNotice={...notice,title:'정규 시즌 종료·포스트시즌 개막',message:'이전 저장의 포스트시즌 안내'};const html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));assert.ok(html.includes(`<p>${entry}</p>`));assert.equal(html.includes(`<p>${suffix}</p>`),!first);assert.ok(html.includes(`${team} 포스트시즌 진출 성공 !`));assert.doesNotMatch(html,/다른 선수|리그 이력/);}
 }
});
test('rank four advances on one actual win or tie and cannot get credited twice',()=>{
 for(const tie of [false,true]){const s=fixture();play(s,'wildcard',3,{tie});assert.equal(round(s,'wildcard').winner,3);assert.deepEqual(round(s,'wildcard').wins,tie?[1,0]:[2,0]);assert.deepEqual(round(s,'semi').clubs,[2,3]);
  const before=structuredClone(s.proWorld.postseason),count=s.calendar.events.length;life.finishProfessionalDay(s);assert.deepEqual(s.proWorld.postseason,before);assert.equal(s.calendar.events.length,count);
  assert.equal(s.calendar.events.filter(g=>g.competitionId==='pro-playoffs-wildcard').length,1);
 }
});
test('rank five must win both road games, including forfeits, and a second-game loss eliminates it',()=>{
 for(const fifthWins of [false,true]){const s=fixture();play(s,'wildcard',4);assert.deepEqual(round(s,'wildcard').wins,[1,1]);assert.equal(round(s,'semi'),undefined);assert.equal(next(s,'wildcard').homeTeamId,3);assert.equal(next(s,'wildcard').round,2);
  play(s,'wildcard',fifthWins?4:3,{forfeit:true});assert.equal(round(s,'wildcard').winner,fifthWins?4:3);assert.deepEqual(round(s,'semi').clubs,[2,fifthWins?4:3]);
 }
});
test('a fifth-place run meets third, second and first in order and closes the season exactly once',()=>{
 const s=fixture();sweep(s,'wildcard',4);assert.equal(round(s,'playoff'),undefined);sweep(s,'semi',4);assert.deepEqual(round(s,'playoff').clubs,[1,4]);assert.equal(round(s,'playoff').target,3);assert.equal(round(s,'final'),undefined);
 sweep(s,'playoff',4);assert.deepEqual(round(s,'final').clubs,[0,4]);assert.equal(round(s,'final').target,4);sweep(s,'final',4);
 assert.equal(s.proWorld.postseason.champion,4);assert.equal(s.proWorld.stage,'summary');assert.equal(s.phase,'ended');assert.equal(s.proWorld.seasons.at(-1).champion,4);assert.equal(s.calendar.events.filter(g=>g.competitionId.startsWith('pro-playoffs-')).length,12);
 const archive=JSON.stringify(s.proWorld.seasons),careers=s.players.map(p=>p.career.length);life.finishProfessionalDay(s);assert.equal(JSON.stringify(s.proWorld.seasons),archive);assert.deepEqual(s.players.map(p=>p.career.length),careers);
});
test('five-game and seven-game rounds follow 2-2-1 and 2-3-2 home orders with travel days',()=>{
 const s=fixture();play(s,'wildcard',3);let homes=[];for(const winner of [2,3,2,3,2]){const g=next(s,'semi');homes.push(g.homeTeamId);const date=g.date;play(s,'semi',winner);if(round(s,'semi').winner===undefined){const n=next(s,'semi');assert.equal(n.date,e.addDays(date,n.homeTeamId===g.homeTeamId?1:2));}}
 assert.deepEqual(homes,[2,2,3,3,2]);sweep(s,'playoff',2);homes=[];for(const winner of [0,2,0,2,0,2,0]){homes.push(next(s,'final').homeTeamId);play(s,'final',winner);}assert.deepEqual(homes,[0,0,2,2,2,0,0]);
});
test('tied games remain recorded and replay after the normal last game at the original home park',()=>{
 const s=fixture();play(s,'wildcard',3);const rng={...s.rngStates};const tied=play(s,'semi',null,{tie:true});assert.deepEqual(round(s,'semi').wins,[0,0]);assert.deepEqual(round(s,'semi').drawHomes,[2]);
 for(const winner of [2,3,2,3])play(s,'semi',winner);assert.equal(next(s,'semi').round,6);assert.equal(next(s,'semi').homeTeamId,tied.homeTeamId);assert.equal(tied.status,'completed');assert.deepEqual(tied.score,[2,2]);
 play(s,'semi',null,{tie:true});assert.equal(next(s,'semi').homeTeamId,2);play(s,'semi',3);assert.equal(round(s,'semi').winner,3);assert.deepEqual(s.rngStates,rng);
});
test('each new round freezes its own roster and new players do not enter an existing series roster',()=>{
 const s=fixture(),r=round(s,'wildcard'),late=s.players.find(p=>p.teamId===13&&!r.rosters['3'].includes(p.id));assert.ok(late);const outgoing=s.players.find(p=>p.teamId===3&&p.position===late.position);outgoing.teamId=13;late.teamId=3;
 assert.equal(life.playoffRosterFor(s,next(s,'wildcard'),[late]).length,0);play(s,'wildcard',3);assert.ok(round(s,'semi').rosters['3'].includes(late.id));assert.ok(Object.values(round(s,'semi').rosters).every(ids=>ids.length<=32));
});

const skills=(p,n)=>{for(const key of Object.keys(p.stats))p.stats[key]=n;p.injury=null;p.forcedRest=false;p.recentZ=0;p.fatigue=0;};
test('all five qualifiers expand to 32 and a strong farm player replaces a weak first-team player before the notice',()=>{
 const s=structuredClone(template),p=e.getPlayer(s);p.teamId=13;p.proContract.status='regular';skills(p,99);
 const weak=s.players.find(q=>q.teamId===3&&q.position===p.position);skills(weak,1);
 const teams=new Map(s.players.map(q=>[q.id,q.teamId])),rng={...s.rngStates},records=s.players.map(q=>structuredClone(q.seasonStats));
 s.date=s.proWorld.regularEnd;s.proWorld.stage='regular';life.finishProfessionalDay(s);
 for(let club=0;club<10;club++)assert.equal(s.players.filter(q=>q.teamId===club).length,club<5?32:29);
 assert.equal(p.teamId,3);assert.equal(weak.teamId,13);assert.equal(s.postSchool.pro.level,'first');
 assert.ok(round(s,'wildcard').rosters['3'].includes(p.id));assert.match(s.careerNotice.message,/특별 엔트리/);assert.doesNotMatch(s.careerNotice.message,/등록되지 못/);
 for(const id of s.proWorld.postseasonExpansion.calledUp)assert.equal(teams.get(id),s.players.find(q=>q.id===id).teamId+10);
 assert.deepEqual(s.rngStates,rng);assert.deepEqual(s.players.map(q=>q.seasonStats),records);
 const registrations=s.players.map(q=>q.teamId);assert.equal(postRoster.expandPostseasonRosters(s),false);assert.deepEqual(s.players.map(q=>q.teamId),registrations);
 const game=next(s,'wildcard');s.date=game.date;e.simulateGame(s,game,[game.homeTeamId,game.awayTeamId].map(id=>s.players.filter(q=>q.teamId===id)));
 assert.equal(game.status,'completed');assert.ok(game.boxScore[p.id]?.batting.PA>0,'special registration participates in a real postseason game');
});

test('third-squad, developmental and unavailable farm stars cannot take special roster places',()=>{
 const s=structuredClone(template),third=e.getPlayer(s),dev=s.players.find(q=>q.teamId===13),injured=s.players.find(q=>q.teamId===13&&q.id!==dev.id);
 third.teamId=23;skills(third,100);dev.proContract.status='developmental';skills(dev,100);skills(injured,100);injured.injury={unavailableUntil:'2099-01-01'};
 s.date=s.proWorld.regularEnd;s.proWorld.stage='regular';life.finishProfessionalDay(s);
 assert.equal(third.teamId,23);assert.equal(dev.teamId,13);assert.equal(injured.teamId,13);
 for(const p of [third,dev,injured])assert.ok(!round(s,'wildcard').rosters['3'].includes(p.id));
});

test('expanded registrations survive saving and next camp, then the current three lowest ratings are cut at opening',()=>{
 let s=fixture();life.closeProfessionalSeason(s);for(const p of s.players)if(p.professional.contract)p.professional.contract.endYear=2035;
 s.careerNotice=null;s.noticeQueue=[];life.startNextProSeason(s);const club=3,first=s.players.filter(p=>p.teamId===club);
 assert.equal(first.length,32);world.ensureProWorld(s);assert.equal(s.players.filter(p=>p.teamId===club).length,32);
 const lowest=first.filter(p=>e.isPitcher(p.primaryRole)).slice(0,3);for(const [i,p] of lowest.entries())skills(p,1+i);
 s.playerId=lowest[0].id;s.postSchool.pro.club=club;s.postSchool.pro.level='first';s.careerNotice=null;s.noticeQueue=[];
 const opening=s.calendar.competitions.find(c=>c.id==='pro-first').startDate;s.date=e.addDays(opening,-1);
 assert.deepEqual(postRoster.trimPostseasonRostersForOpening(s),[]);
 s=decodeCareerSave(JSON.stringify(encodeCareerSave(s,false))).state;assert.ok(s.proWorld.postseasonExpansion);
 s.date=opening;const before=new Map(s.players.map(p=>[p.id,p.teamId]));world.reviewLeagueRegistrations(s);
 assert.equal(s.players.filter(p=>p.teamId===club).length,29);assert.equal(s.players.filter(p=>before.get(p.id)===club&&p.teamId===club+10).length,3);
 for(const p of lowest)assert.equal(s.players.find(q=>q.id===p.id).teamId,club+10);
 assert.equal(s.postSchool.pro.level,'second');assert.equal(s.careerNotice.kind,'demoted');assert.match(s.careerNotice.message,/출전평가 하위 3명/);
 assert.equal(s.proWorld.postseasonExpansion,undefined);const registrations=s.players.map(p=>p.teamId);
 assert.deepEqual(postRoster.trimPostseasonRostersForOpening(s),[]);assert.deepEqual(s.players.map(p=>p.teamId),registrations);
 world.ensureProWorld(s);world.reviewLeagueRegistrations(s);assert.deepEqual(s.players.map(p=>p.teamId),registrations,'loading or acknowledging the notice cannot undo the final opening roster');
});

test('an ongoing 29-player postseason save expands once while preserving played games and the bracket',()=>{
 const s=fixture();play(s,'wildcard',4);for(let club=0;club<5;club++)for(const p of s.players.filter(p=>p.teamId===club).slice(29))p.teamId=club+10;
 delete s.proWorld.postseason.rosterVersion;delete s.proWorld.postseasonExpansion;
 const games=structuredClone(s.calendar.events),series=s.proWorld.postseason.series.map(({rosters,...row})=>row),rng={...s.rngStates};
 const loaded=life.upgradeProfessionalState(s);assert.notEqual(loaded,s);assert.equal(s.players.filter(p=>p.teamId===3).length,29);
 assert.equal(loaded.players.filter(p=>p.teamId===3).length,32);assert.equal(round(loaded,'wildcard').rosters['3'].length,32);
 assert.deepEqual(loaded.calendar.events,games);assert.deepEqual(loaded.proWorld.postseason.series.map(({rosters,...row})=>row),series);assert.deepEqual(loaded.rngStates,rng);
 assert.equal(life.upgradeProfessionalState(loaded),loaded);
});
test('postseason games allow fifteen innings and keep regular records separate',()=>{
 const s=fixture(),game=next(s,'wildcard'),keys=['match.bb_base','match.bb_min','match.bb_max','match.hit_base','match.hit_min','match.hit_max'],old=Object.fromEntries(keys.map(k=>[k,e.params[k]]));
 try{for(const k of keys)e.params[k]=0;const before=structuredClone(s.players.map(p=>p.seasonStats));s.date=game.date;e.simulateGame(s,game,[game.homeTeamId,game.awayTeamId].map(id=>s.players.filter(p=>p.teamId===id)));
  assert.equal(game.status,'completed');assert.deepEqual(game.score,[0,0]);assert.deepEqual(game.innings.map(v=>v.length),[15,15]);assert.deepEqual(s.players.map(p=>p.seasonStats),before);assert.ok(s.players.some(p=>p.seasonPostseason?.pitching.outs>0));
 }finally{Object.assign(e.params,old);}
});
test('saving and resuming midway preserves advantage, match cursor, RNG and advancement',()=>{
 const s=fixture();play(s,'wildcard',4);const loaded=decodeCareerSave(JSON.stringify(encodeCareerSave(s,false))).state;
 assert.deepEqual(loaded.proWorld.postseason,s.proWorld.postseason);play(s,'wildcard',4);play(loaded,'wildcard',4);assert.deepEqual(loaded.proWorld.postseason,s.proWorld.postseason);assert.deepEqual(loaded.rngStates,s.rngStates);
});
test('the same four-round bracket appears on the home and league pages, including waiting seeds',()=>{
 const s=fixture(),before=structuredClone(s);const html=renderToStaticMarkup(createElement(Bracket,{state:s}));
 assert.equal((html.match(/class="postseason-round /g)??[]).length,4);for(const word of ['와일드카드','준플레이오프','플레이오프','한국시리즈','4위 1승 선취','실제 최대 2경기'])assert.ok(html.includes(word));
 for(const Component of [Dashboard,League]){const page=renderToStaticMarkup(createElement(Component,{state:s,onRecords(){},onTab(){},onTraining(){},trainingDisabled:false,records:null}));assert.ok(page.includes('포스트시즌 대진표'));}
 assert.deepEqual(s,before);s.proWorld.stage='regular';assert.equal(renderToStaticMarkup(createElement(Bracket,{state:s})), '');
});
test('an active old 1-v-4 bracket migrates immediately, backing up old postseason records and keeping regular data',()=>{
 const s=fixture(),post=s.proWorld.postseason,p=e.getPlayer(s);delete post.format;post.seeds=[0,1,2,3];post.series=[{...post.series[0],id:'semi-1',stage:'semi',clubs:[0,3],wins:[1,0],target:3},{...post.series[0],id:'semi-2',stage:'semi',clubs:[1,2],wins:[0,0],target:3}];
 const old=s.calendar.events.find(g=>g.competitionId==='pro-playoffs-wildcard');old.id=`${s.proWorld.year}:semi-1:0`;old.competitionId='pro-playoffs-semi-1';old.homeTeamId=0;old.awayTeamId=3;old.status='completed';old.score=[3,1];old.boxScore[p.id]=e.emptyRecord();old.boxScore[p.id].batting.PA=4;p.seasonPostseason=structuredClone(old.boxScore[p.id]);
 p.seasonStats.batting.PA=100;p.seasonByLevel.first.batting.PA=100;p.seasonByClub={'0':{first:structuredClone(p.seasonStats),second:e.emptyRecord(),postseason:structuredClone(p.seasonPostseason)}};
 const regular=structuredClone(p.seasonStats),stats={...p.stats},career=structuredClone(p.career),rng={...s.rngStates},before=structuredClone(s);
 const upgraded=life.upgradeProfessionalState(s),q=e.getPlayer(upgraded);
 assert.deepEqual(s,before);assert.equal(upgraded.proWorld.postseason.format,'kbo-v1');assert.deepEqual(round(upgraded,'wildcard').clubs,[3,4]);assert.deepEqual(round(upgraded,'wildcard').wins,[1,0]);assert.equal(upgraded.proWorld.postseason.series.length,1);
 assert.ok(!upgraded.calendar.events.some(g=>g.id===old.id));assert.ok(upgraded.proWorld.replacedPostseason.games.some(g=>g.id===old.id));assert.equal(upgraded.proWorld.replacedPostseason.records.find(r=>r.playerId===p.id).records.batting.PA,4);
 assert.equal(q.seasonPostseason.batting.PA,0);assert.equal(q.seasonByClub['0'].postseason.batting.PA,0);assert.deepEqual(q.seasonStats,regular);assert.deepEqual(q.stats,stats);assert.deepEqual(q.career,career);assert.deepEqual(upgraded.rngStates,rng);assert.equal(life.upgradeProfessionalState(upgraded),upgraded);
 const resumed=e.advanceWeek(s,p.trainingPolicy,p.stance);assert.equal(resumed.proWorld.postseason.format,'kbo-v1');assert.ok(resumed.careerNotice);assert.equal(resumed.weekProgress,undefined);
});
test('completed old seasons remain historical records rather than restarting a settled season',()=>{
 const s=fixture();delete s.proWorld.postseason.format;s.proWorld.stage='summary';s.proWorld.seasonClosed=true;s.phase='ended';assert.equal(life.needsPostseasonUpgrade(s),false);assert.equal(life.upgradeProfessionalState(s),s);
});
