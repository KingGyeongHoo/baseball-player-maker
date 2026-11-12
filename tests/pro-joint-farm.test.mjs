import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const world=require('../.test-build/lib/sim/pro-world.js'),life=require('../.test-build/lib/sim/pro-season.js');
const squads=require('../.test-build/lib/sim/pro-squads.js'),market=require('../.test-build/lib/sim/pro-market.js');
const b=require('../.test-build/lib/sim/pro-balance.js'),draft=require('../.test-build/lib/sim/draft.js');
const {farmGameRoster}=require('../.test-build/lib/sim/pro-farm-roster.js');
const {organizationMinimum}=require('../.test-build/lib/sim/pro-roster.js');
const save=require('../.test-build/lib/career-save.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('joint-farm','통합선수단','3B'));
const fixture=()=>structuredClone(template);
const positions=['C','SS','CF','2B','1B','3B','LF','RF','DH'];
function player(s,id,position,team,score=60){
 const p=e.previewPlayer(id,id,position);p.id=id;p.teamId=team;p.careerMode='pro';p.age=24;p.grade=0;
 for(const key of Object.keys(p.stats))p.stats[key]=score;
 p.professional=structuredClone(e.getPlayer(s).professional);p.professional.employment='active';p.professional.contract.club=team%10;p.professional.assessments=[];delete p.professional.lastRegistration;
 p.proContract={status:'regular',joinedDate:'2028-02-01'};p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.fatigue=0;p.forcedRest=false;p.injury=null;return p;
}
function roster(s,club){
 return [...positions,...Array(5).fill('SP'),...Array(5).fill('RP'),'CP'].map((pos,i)=>player(s,`club-${club}-${i}`,pos,club+10,55));
}
test('second, third and developmental squads share the farm pool without registration changes, while first-team players stay out',()=>{
 const s=fixture(),mine=e.getPlayer(s),club=mine.teamId%10;mine.teamId=club+20;
 const first=s.players.find(p=>p.teamId===club),dev=player(s,'developmental-in-farm','SP',club+30,90);s.players.push(dev);assert.ok(first);
 const before=new Map(s.players.map(p=>[p.id,p.teamId])),pool=farmGameRoster(s,club+10);
 assert.ok(pool.includes(mine));assert.ok(!pool.includes(first));assert.ok(pool.includes(dev));
 assert.equal(pool.length,s.players.filter(p=>[club+10,club+20,club+30].includes(p.teamId)).length);
 assert.deepEqual(new Map(s.players.map(p=>[p.id,p.teamId])),before);
});
test('second-team registration outranks a stronger third-team player at the same current position for hitters, rotation and relief',()=>{
 const s=fixture(),pool=roster(s,0),third=player(s,'elite-third','3B',20,99),sp=player(s,'elite-third-sp','SP',20,99),rp=player(s,'elite-third-rp','RP',20,99);
 s.date='2028-04-01';s.proWorld.stage='regular';pool.push(third,sp,rp);
 assert.notEqual(e.lineup(pool,s.date).field[5].id,third.id);
 assert.equal(b.proRotationStarter(s,pool.filter(p=>e.isPitcher(p.primaryRole)),s.date).teamId,10);
 const secondRP=pool.find(p=>p.position==='RP'&&p.teamId===10);
 assert.ok(b.proReliefPriority(secondRP,s.date,6,0)>b.proReliefPriority(rp,s.date,6,0));
 const secondThird=pool.find(p=>p.position==='3B'&&p.teamId===10);secondThird.trainingPolicy.mode='rest';
 assert.equal(e.lineup(pool,s.date).field[5].id,third.id);
});
test('a third-team player gets real second-league game records and pitcher rest without becoming second-team registered',()=>{
 const s=fixture(),home=roster(s,0),away=roster(s,1),third=player(s,'third-actual','3B',20,80);
 home.find(p=>p.position==='3B').trainingPolicy.mode='rest';
 s.players=[...home,...away,third];s.playerId=third.id;s.date='2028-04-01';s.proWorld.stage='regular';s.careerNotice=undefined;s.noticeQueue=[];
 const game={id:'joint-game',date:s.date,homeTeamId:10,awayTeamId:11,competitionId:'pro-second',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},rulesetId:'test'};
 s.calendar.events=[game];
 assert.equal(e.simulateGame(s,game,[home,away]),true);assert.equal(game.status,'completed');
 assert.equal(third.teamId,20);assert.ok(third.seasonByLevel.second.batting.PA>0);assert.equal(third.seasonByLevel.first.batting.PA,0);
 assert.equal(game.proAppearances[third.id].teamId,10);assert.equal(game.proAppearances[third.id].level,'second');
 const starter=home.find(p=>p.id===game.lineup[0][9]);starter.teamId=20;
 assert.equal(b.proStarterReady(s,starter,'2028-04-03'),false);
 assert.equal(save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state.players.find(p=>p.id===third.id).teamId,20);
});
test('normalization and registration cannot bypass the second team, including a same-day temporary second registration',()=>{
 const s=fixture(),p=e.getPlayer(s),club=p.teamId%10;s.date='2028-04-01';p.teamId=club+20;p.professional.lastRegistration='2028-03-01';
 for(const key of Object.keys(p.stats))p.stats[key]=99;
 for(const q of s.players)if(q.id!==p.id&&q.teamId%10===club&&q.position===p.position)q.teamId=club+20;
 assert.equal(squads.setProSquad(s,p,'first'),false);squads.normalizeFirstTeamRoster(s,club);assert.equal(p.teamId,club+20);
 world.reviewReserveRegistrations(s);assert.equal(p.teamId,club+10);squads.normalizeFirstTeamRoster(s,club);assert.equal(p.teamId,club+10);
 s.date='2028-04-02';squads.normalizeFirstTeamRoster(s,club);assert.equal(p.teamId,club);
});
test('postseason injury replacements also select a registered second-team player before an elite third-team player',()=>{
 const s=fixture(),old=player(s,'injured-first','3B',0,60),second=player(s,'registered-second','3B',10,65),third=player(s,'elite-third','3B',20,99);
 s.players=[old,second,third];s.playerId=third.id;s.date='2028-10-15';s.proWorld.stage='postseason';
 old.injury={severity:'severe',startDate:s.date,unavailableUntil:'2028-11-15',originalPenalty:5,penaltyRemaining:5,penaltyRecoverDays:5};
 s.proWorld.postseason={format:'kbo-v1',rosterVersion:1,seeds:[0,1],series:[{id:'test',stage:'final',clubs:[0,1],wins:[0,0],target:4,game:1,lastDate:s.date,rosters:{0:[old.id],1:[]},excluded:[]}]};
 life.preparePlayoffReplacements(s);assert.equal(second.teamId,0);assert.equal(third.teamId,20);
});
test('release and re-signing cannot turn a third-team player into a first-team player without the registered second-team step',()=>{
 const s=fixture(),p=e.getPlayer(s);p.teamId=p.teamId%10+20;const club=(p.teamId%10+1)%10;
 market.releasePlayer(s,p,'test',2029);assert.equal(p.professional.lastSquad,'third');
 assert.equal(market.contractPlacement(s,p,club,false,[],'first'),null);
});
test('professional draft demand comes from actual positions and decays as the missing positions are picked',()=>{
 const s=fixture(),base=e.getPlayer(s),rosterBefore=[];
 for(let club=0;club<10;club++)for(const pos of [...positions,'SP','RP','CP']){
  const count=club===0&&pos==='SP'?0:organizationMinimum(s.seed,club,pos);
  for(let i=0;i<count;i++)rosterBefore.push(player(s,`old-${club}-${pos}-${i}`,pos,club+20,60));
 }
 const prospects=Array.from({length:140},(_,i)=>{
  const p=player(s,`prospect-${i}`,i<25?'SP':'1B',0,i<25?60:85);p.grade=3;p.careerMode=undefined;delete p.professional;p.reputation=e.reputationScore(p);return p;
 });
 const state={...s,players:prospects,teams:[{id:0,name:'고교',shortName:'고교',wins:0,losses:0,draws:0}]},before=structuredClone(rosterBefore);
 const picks=draft.draftPlayers(state,{roster:rosterBefore,order:[0,1,2,3,4,5,6,7,8,9]}),mine=picks.filter(p=>p.club===e.draftClubs[0]);
 const minimum=organizationMinimum(s.seed,0,'SP');
 assert.ok(mine.length>=9);assert.ok(mine.slice(0,Math.min(minimum,mine.length)).every(p=>p.role==='선발'));
 assert.deepEqual(rosterBefore,before);assert.equal(base.id,e.getPlayer(s).id);
});
test('rookies are signed before surplus decisions, remain protected in the intake and count toward replacing an old position',()=>{
 const s=fixture(),year=s.proWorld.year+1,club=0,oldIds=new Set(s.players.map(p=>p.id));
 const arms=s.players.filter(p=>p.teamId>=10&&p.teamId%10===club&&p.position==='SP');
 assert.ok(arms.length);
 for(const p of arms){for(const key of Object.keys(p.stats))p.stats[key]=10;p.professional.contract.endYear=year-1;
  p.professional.assessments=[year-3,year-2,year-1].map(y=>({year:y,date:`${y}-10-31`,score:60,grade:'F',ability:10,role:'선발',squad:'third',developmental:false,reserveSeason:true,firstTeam:false,secondOnly:false,firstGames:0,source:'season-end',cumulative:60,cumulativeGrade:'F'}));}
 while(market.clubRoster(s,club).length<74){const q=player(s,`surplus-c-${market.clubRoster(s,club).length}`,'C',club+20,65);q.professional.rookieYear=2020;q.professional.contract.endYear=year-1;s.players.push(q);oldIds.add(q.id);}
 life.addRookieClass(s,year);
 const incoming=s.players.filter(p=>!oldIds.has(p.id));assert.ok(incoming.length>=90);
 assert.ok(incoming.every(p=>p.professional.employment==='active'&&p.professional.rookieYear===year));
 assert.ok(incoming.filter(p=>p.teamId%10===club).some(p=>p.position==='SP'));
 assert.ok(arms.some(p=>p.professional.employment==='freeAgent'));
 for(let c=0;c<10;c++){const members=market.clubRoster(s,c);assert.ok(members.length<=75);assert.ok(members.filter(p=>p.teamId>=10).length<=45);}
 const count=s.players.length;life.addRookieClass(s,year);assert.equal(s.players.length,count);
});
