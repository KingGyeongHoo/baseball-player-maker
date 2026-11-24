import fs from 'node:fs';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const save=require('../.test-build/lib/career-save.js');
const squads=require('../.test-build/lib/sim/pro-squads.js');
const world=require('../.test-build/lib/sim/pro-world.js');
const assessment=require('../.test-build/lib/sim/pro-assessment.js');
const war=require('../.test-build/lib/sim/pro-war.js');
const ranks=require('../.test-build/lib/sim/pro-season-ranking.js');
const evaluation=require('../.test-build/lib/sim/pro-season-evaluation.js');
const awards=require('../.test-build/lib/sim/pro-evaluation.js');
const titles=require('../.test-build/lib/sim/pro-individual-awards.js');
const career=require('../.test-build/lib/sim/pro-career-evaluation.js');
const bonuses=require('../.test-build/lib/sim/pro-award-bonuses.js');
const leaders=require('../.test-build/lib/league-leaders.js');
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const [input,output]=process.argv.slice(2);
assert(input&&output,'Usage: node scripts/repair-forfeited-season.mjs input.json.gz new-output.json.gz');
assert(!fs.existsSync(output),'Output already exists; refusing to overwrite');
const originalBytes=fs.readFileSync(input),originalHash=hash(originalBytes);
const raw=(input.endsWith('.gz')?zlib.gunzipSync(originalBytes):originalBytes).toString('utf8');
const source=save.decodeCareerSave(raw).state,s=structuredClone(source),sim=structuredClone(source);
const year=s.calendar.seasonYear,season=s.proWorld.seasons.find(row=>row.year===year);
assert(s.proWorld.seasonClosed&&season,'Repair requires a closed current season');
assert(!s.proWorld.stove&&!s.proWorld.market,'Repair before opening the offseason contract market');
const missed=source.calendar.events.filter(g=>g.competitionId==='pro-first'&&g.status==='forfeit');
assert(missed.length,'No forfeited first-team games in this season');
const completed=source.calendar.events.filter(g=>g.status==='completed');
const originalCompleted=new Map(completed.map(g=>[g.id,hash(g)]));
const profiles=new Map(s.players.map(p=>[p.id,p]));
const replayed=[];
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;e.params['injury.base_risk']=0;
sim.proWorld.stage='regular';sim.proWorld.seasonClosed=false;
sim.rngStates.match=e.hash(`${s.seed}:forfeit-repair:${year}:v1`);
delete sim.careerNotice;sim.noticeQueue=[];sim.careerEvent=null;
delete sim.pendingEventOutcome;delete sim.weekProgress;delete sim.matchProgress;
for(const p of sim.players){
 const old=p.career.find(row=>row.year===year&&row.careerMode==='pro');
 if(old?.schoolId>=0){p.teamId=old.schoolId;p.professional.employment='active';}
 if(old?.stats)p.stats={...old.stats};
 p.seasonStats=e.emptyRecord();p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};
 p.seasonByClub={};p.recentAppearances=[];p.recentZ=0;p.fatigue=0;p.injury=null;p.forcedRest=false;p.lastPitched=null;
 p.trainingPolicy=e.defaultPolicy(p.primaryRole);
 delete p.professional.managedUntil;delete p.professional.lastRegistration;
 delete p.professional.farmVacancyPosition;
}
const timeline=sim.calendar.events.filter(g=>['pro-first','pro-second'].includes(g.competitionId)&&['completed','forfeit'].includes(g.status)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
// Completed matches retain their original participants, whose historical daily
// registrations are not recoverable. Use a separate healthy-condition rotation
// for reconstructed outings instead of assigning those old workloads to a
// different, reconstructed end-of-year roster.
sim.calendar.events=sim.calendar.events.filter(g=>g.status!=='completed');
let priorDate=timeline[0].date;
function ingest(g){
 for(const [id,r]of Object.entries(g.boxScore)){
  const p=sim.players.find(p=>p.id===id);if(!p)continue;
  const level=g.competitionId==='pro-first'?'first':'second';
  e.mergeRecord(p.seasonStats,r);e.mergeRecord(p.seasonByLevel[level],r);
 }
}
for(const g of timeline){
 for(let date=priorDate;date<g.date;date=e.addDays(date,1))for(const p of sim.players){
  e.npcPolicy(p,date,true);p.fatigue=e.trainingFatigueDay(p.fatigue,p.stats.recovery,p.trainingPolicy).end;
  if(p.forcedRest&&p.fatigue<e.params['fatigue.ready_return'])p.forcedRest=false;
 }
 priorDate=g.date;sim.date=g.date;
 if(g.status==='completed'){ingest(g);continue;}
 if(g.competitionId!=='pro-first')continue;
 for(const club of [g.homeTeamId,g.awayTeamId])squads.normalizeFirstTeamRoster(sim,club);
 Object.assign(g,{status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}});
 for(const key of ['forfeitTeamId','proPreparedLineup','proAppearances','proAppearanceComplete','evaluationEnvironment','proPreparationChecked'])delete g[key];
 // This is a reconstruction, not a user choice checkpoint.
 g.proPreparationChecked=true;
 const rosters=[g.homeTeamId,g.awayTeamId].map(team=>sim.players.filter(p=>p.teamId===team));
 assert(e.simulateGame(sim,g,rosters),`Unexpected decision in ${g.id}`);
 assert.equal(g.status,'completed',`Repair still forfeited: ${g.id} ${JSON.stringify(rosters.map(r=>({team:r[0]?.teamId,field:world.professionalLineup(sim,r,g.date).field.length,starter:world.professionalLineup(sim,r,g.date).starter?.id,arms:r.filter(p=>p.position==='SP').map(p=>({id:p.id,last:p.lastPitched,f:p.fatigue}))})))}`);
 replayed.push(structuredClone(g));
 if(replayed.length%50===0)console.log(`Replayed ${replayed.length}/${missed.length}`);
}
assert.equal(replayed.length,missed.length);
for(const g of replayed){
 const index=s.calendar.events.findIndex(old=>old.id===g.id);s.calendar.events[index]=g;
 for(const [id,record]of Object.entries(g.boxScore)){
  const p=profiles.get(id);assert(p,`Missing player ${id}`);
  e.mergeRecord(p.seasonStats,record);e.mergeRecord(p.seasonByLevel.first,record);
  const team=g.proAppearances?.[id]?.teamId??g.evaluationEnvironment?.playerTeams?.[id];assert(Number.isInteger(team));
  p.seasonByClub??={};p.seasonByClub[team]??={first:e.emptyRecord(),second:e.emptyRecord(),postseason:e.emptyRecord()};
  e.mergeRecord(p.seasonByClub[team].first,record);
 }
}
// Revoke only the prematurely executed current-year performance releases.
// Their corrected assessments will be reviewed when the stove button is used.
let deferred=0;const deferredIds=new Set();
for(const p of s.players){
 const pro=p.professional,denied=pro?.nonRenewal;
 if(denied?.year!==year||pro.employment!=='freeAgent')continue;
 const move=pro.movements.findLast(row=>row.kind==='방출'&&row.date.startsWith(`${year}-`)&&row.from===denied.club);
 if(!move)continue;
 const row=pro.assessments.find(row=>row.year===year),old=p.career.find(row=>row.year===year&&row.careerMode==='pro');
 assert(old?.schoolId>=0&&row?.salary>0,'Cannot reconstruct a deferred release contract');
 const guarantees=(pro.guarantees??[]).filter(g=>g.club===denied.club&&g.year>year);
 const end=Math.max(year,...guarantees.map(g=>g.year));
 for(const g of guarantees){const debt=s.proWorld.clubs[g.club].deadMoney;assert((debt[g.year]??0)>=g.amount);debt[g.year]-=g.amount;}
 pro.guarantees=(pro.guarantees??[]).filter(g=>!guarantees.includes(g));
 pro.contract=world.contractFor(denied.club,year,row.salary,end-year+1,'renewal');
 pro.employment='active';p.teamId=old.schoolId;
 const stint=pro.service.at(-1);if(stint?.club===denied.club)stint.to=end;
 move.kind='방출 보류';move.reason+=' · 기권 경기 재구성 후 스토브리그에서 재심사';
 delete pro.nonRenewal;deferred++;deferredIds.add(p.id);
}
s.proWorld.news=s.proWorld.news.filter(n=>![...deferredIds].some(id=>n.id.endsWith(`:release:${id}`)&&n.date.startsWith(`${year}-`)));
for(const p of s.players){
 const old=p.career.find(row=>row.year===year&&row.careerMode==='pro');
 if(old){old.records=structuredClone(p.seasonStats);old.byLevel=structuredClone(p.seasonByLevel);old.byClub=structuredClone(p.seasonByClub??{});}
}
const context=war.createProWarContext(s);
for(const p of s.players){
 const row=p.professional?.assessments?.find(row=>row.year===year);if(!row)continue;
 row.war=assessment.hasSeasonAppearance(p)?war.proWarAssessment(p,context):war.emptyProWarAssessment();
 row.seasonEvaluation=evaluation.seasonEvaluation(row.war);row.score=row.seasonEvaluation.score;
 delete row.seasonRank;delete row.clubGamesShortage;
 if(assessment.hasSeasonAppearance(p))delete row.noAppearances;else row.noAppearances=true;
 row.grade=row.noAppearances?'F':'C';row.firstWarByClub=war.firstTeamClubWar(p,context);
 const games=s.calendar.events.filter(g=>g.competitionId==='pro-first'&&g.status==='completed'&&((g.boxScore[p.id]?.batting.PA??0)>0||(g.boxScore[p.id]?.pitching.BF??0)>0));
 row.firstGames=games.length;row.firstTeam=games.length>0||row.firstTeam;
}
ranks.freezeSeasonRankings(s,context);
season.standings=require('../.test-build/lib/sim/pro-calendar.js').careerLeagueTable(s.calendar,'pro-first');
season.individualAwards=titles.individualAwards(s);
const seriesAwards=season.awards.filter(row=>row.category==='seriesMvp');
season.awards=[...awards.regularAwards(s,season.individualAwards,context),...seriesAwards];
career.syncClubAwardCounts(s);bonuses.syncAwardBonuses(s);career.syncCareerHonorBonuses(s);
evaluation.refreshSeasonEvaluations(s);
for(const p of s.players)career.refreshCareerEvaluation(p);
for(const team of s.teams.filter(t=>t.id<10)){
 const row=season.standings.find(r=>r.teamId===team.id);if(row)Object.assign(team,{wins:row.wins,losses:row.losses,draws:row.draws});
}
// Re-open the corrected presentations; all contract decisions stay behind them.
if(season.awardsCeremony){delete season.awardsCeremony.presentedAt;delete season.awardsCeremony.celebrationsQueued;delete season.awardsCeremony.individualTitlesQueued;}
delete s.careerNotice;s.noticeQueue=[];s.careerEvent=null;delete s.pendingEventOutcome;
delete s.proWorld.pendingRetirement;delete s.proWorld.resumeCampAfterAwards;delete s.proWorld.offseasonContinuation;
s.proWorld.stage='summary';s.phase='ended';
for(const g of completed)assert.equal(hash(s.calendar.events.find(row=>row.id===g.id)),originalCompleted.get(g.id));
for(const p of s.players){const old=source.players.find(row=>row.id===p.id);assert.deepEqual(p.stats,old.stats);assert.deepEqual(p.career.filter(row=>row.year!==year),old.career.filter(row=>row.year!==year));}
// The exported totals must be exactly original totals plus simulated box scores.
const expectedFirst=new Map(source.players.map(p=>[p.id,structuredClone(p.seasonByLevel.first)]));
for(const g of replayed)for(const[id,r]of Object.entries(g.boxScore))e.mergeRecord(expectedFirst.get(id),r);
for(const p of s.players){
 const old=source.players.find(row=>row.id===p.id);
 assert.deepEqual(p.seasonByLevel.first,expectedFirst.get(p.id));
 assert.deepEqual(p.seasonByLevel.second,old.seasonByLevel.second);
 assert.deepEqual(p.professional.salaries,old.professional.salaries);
}
assert.equal(hash(fs.readFileSync(input)),originalHash);
const encoded=save.serializeCareerSave(save.encodeCareerSave(s,false));
const verified=save.decodeCareerSave(encoded).state;
for(const id of ['pro-first','pro-second'])assert(leaders.leagueLeaders(verified,id,'batting').find(b=>b.metric.id==='avg').rows.length>0);
const report={input,output,year,replayed:replayed.length,deferredReleases:deferred,originalSha256:originalHash,
 reconstruction:'Only forfeited current-season first-team games replayed using archived end-of-season tools and available organizational rosters. Daily historical injuries/registrations unavailable; healthy-condition reconstruction with rotation workload among replayed games only, not an exact historical rollback.',
 preserved:'All previously completed games including postseason; earlier-year career records; current abilities and paid salaries. Existing postseason participants and champion are retained. Premature performance releases deferred; contracts reconstructed from archived squad, salary and remaining guarantee records.',
 leagues:['first','second'].map(level=>({level,completed:s.calendar.events.filter(g=>g.competitionId===`pro-${level}`&&g.status==='completed').length,forfeits:s.calendar.events.filter(g=>g.competitionId===`pro-${level}`&&g.status==='forfeit').length,qualified:s.players.filter(p=>(p.seasonByLevel?.[level]?.batting.PA??0)>=(level==='first'?446:315)).length})),
 repairedGameIds:replayed.map(g=>g.id)};
fs.writeFileSync(output,output.endsWith('.gz')?zlib.gzipSync(encoded):encoded,{flag:'wx'});
fs.writeFileSync(output+'.report.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({...report,repairedGameIds:undefined}));
