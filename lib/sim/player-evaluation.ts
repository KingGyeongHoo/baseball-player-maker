import {available,clamp,emptyRecord,hash,isPitcher,labels,mergeRecord,params,roleFor,roleScore,selectionScore,talentLabel} from "./engine";
import {contractValue} from "./pro-evaluation";
import {draftAssessment} from "./draft";
import {evaluationReference,EVALUATION_MODEL,gradeTool,standardMatchup} from "./evaluation-reference";
import {performanceEvidence,weightedRecords} from "./evaluation-metrics";
import {reputationBreakdown} from "./evaluation-reputation";
import {statKeys,type GameState,type Player,type RecordLine,type Role,type Stat} from "./types";
import type {EvaluationField,EvaluationReason,EvaluationSnapshot,EvaluationObservation,EvaluationContextArchive,PerformanceEvidence} from "./player-evaluation-types";
import {gameCounterKeys} from "./game-records";

const battingKeys:Stat[]=["contact","power","speed","defense"],pitchingKeys:Stat[]=["velocity","control","movement"];
const count=(r:RecordLine,field:EvaluationField)=>field==="batting"?r.batting.PA:r.pitching.BF;
export function recordsForYear(s:GameState,p:Player,year:number,level:"first"|"second"|"school") {
  if(year===s.calendar.seasonYear)return level==="school"?!p.careerMode?p.seasonStats:emptyRecord():p.seasonByLevel?.[level]??emptyRecord();
  const row=p.career.find(r=>r.year===year);
  return level==="school"?row&&!row.careerMode?row.records:emptyRecord():row?.careerMode==="pro"?row.byLevel?.[level]??emptyRecord():emptyRecord();
}
export function evaluationLeague(s:GameState,year:number,level:"first"|"second"|"school") {
  const result=emptyRecord(),seen=new Set<string>();
  const retired=s.proWorld?.retiredRecords?.[`${year}:${level}`];if(retired)mergeRecord(result,retired);
  for(const p of [...s.players,...(s.proWorld?.archive??[])])if(!seen.has(p.id)){seen.add(p.id);mergeRecord(result,recordsForYear(s,p,year,level));}
  return result;
}
export function buildEvaluationContext(s:GameState) {
  const reference=evaluationReference(s),year=s.calendar.seasonYear;
  const history=new Map<string,RecordLine>();for(const y of [year,year-1,year-2])for(const level of ["school","first","second"] as const)history.set(`${y}:${level}`,evaluationLeague(s,y,level));
  const league={school:history.get(`${year}:school`)!,first:history.get(`${year}:first`)!,second:history.get(`${year}:second`)!};
  const previous={school:history.get(`${year-1}:school`)!,first:history.get(`${year-1}:first`)!,second:history.get(`${year-1}:second`)!};
  const leagueSeasons={school:year as number|null,first:year as number|null,second:year as number|null};
  for(const level of ["school","first","second"] as const)if(!league[level].batting.PA&&!league[level].pitching.BF){league[level]=previous[level];leagueSeasons[level]=previous[level].batting.PA||previous[level].pitching.BF?year-1:null;}
  const games=new Map<string,typeof s.calendar.events>();
  for(const game of s.calendar.events)if(game.status==="completed"&&game.date<=s.date)for(const [id,line] of Object.entries(game.boxScore))if(line.batting.PA||line.pitching.BF){const rows=games.get(id)??[];rows.push(game);games.set(id,rows);}
  for(const rows of games.values())rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const cohorts=new Map<string,Map<Stat,{values:number[];size:number}>>();
  if(!s.careerMode)for(const grade of [1,2,3])for(const field of ["batting","pitching"] as const){
    const players=s.players.filter(p=>!p.careerMode&&p.grade===grade&&(isPitcher(p.primaryRole)===(field==="pitching")||p.twoWay));
    cohorts.set(`${grade}:${field}`,new Map(statKeys.map(key=>[key,{values:players.map(p=>p.stats[key]).sort((a,b)=>b-a),size:players.length}])));
  }
  return {reference,league,games,cohorts,history,leagueSeasons};
}
type Context=ReturnType<typeof buildEvaluationContext>;
// Cohort values are already descending; tied values share the first rank.
function cohortRank(values:number[],value:number){
  let low=0,high=values.length;
  while(low<high){const middle=(low+high)>>>1;if(values[middle]>value)low=middle+1;else high=middle;}
  return low+1;
}
const referencePrior=(context:Context,school=false)=>{const stage=school?"school":"pro",config=context.reference.parameters;return {events:config[`evaluation.${stage}.events`]??(school?60:100),hits:config[`evaluation.${stage}.hits`]??(school?90:180),extraBases:config[`evaluation.${stage}.extraBases`]??(school?150:300)};};
const fields=(record:RecordLine,league:RecordLine,context:Context,school=false,first=false)=>{const prior=referencePrior(context,school),season=context.leagueSeasons[school?"school":first?"first":"second"];return {batting:{...performanceEvidence(record,league,"batting",school,first,prior),leagueSeason:season},pitching:{...performanceEvidence(record,league,"pitching",school,first,prior),leagueSeason:season}};};
export function multiyearEvidence(s:GameState,p:Player,level:"first"|"second"|"school",field:EvaluationField,history?:Map<string,RecordLine>,prior?:PerformanceEvidence["prior"]):PerformanceEvidence {
  const year=s.calendar.seasonYear;
  const rows=[0,1,2].map(ago=>({year:year-ago,weight:[.6,.3,.1][ago],records:recordsForYear(s,p,year-ago,level)})).filter(row=>count(row.records,field)>0);
  const total=rows.reduce((n,r)=>n+r.weight,0);
  const player=weightedRecords(rows.map(r=>({records:r.records,weight:r.weight/total}))),league=weightedRecords(rows.map(r=>({records:history?.get(`${r.year}:${level}`)??evaluationLeague(s,r.year,level),weight:r.weight/total})));
  return performanceEvidence(player,league,field,level==="school",level==="first",prior);
}
function publicTalent(p:Player,field:EvaluationField){
  const exposure=p.talentExposure[field],label=talentLabel(p,field);
  if(exposure<params["talent.hint"])return {label:"미상",min:1,max:10};
  if(exposure<params["talent.reveal"]){const n=p.talent[field];return {label,min:n<=3?1:n<=7?4:8,max:n<=3?3:n<=7?7:10};}
  return {label,min:p.talent[field],max:p.talent[field]};
}
function roleTools(role:Role):Stat[]{return role==="선발"?[...pitchingKeys,"stamina","recovery"]:isPitcher(role)?[...pitchingKeys,"recovery"]:role==="포수"?["defense","arm","bq","contact","power"]:role==="센터라인"?["defense","speed","arm","contact"]:["contact","power","defense","arm"];}
type EvaluationInputs=Omit<EvaluationSnapshot,"performance"|"multiyear"|"model"|"roles">;
function createEvaluationInputs(s:GameState,p:Player,context:Context,reason:EvaluationReason):EvaluationInputs {
  const pro=s.careerMode==="pro",reference=context.reference,school=!s.careerMode,records={school:school?structuredClone(p.seasonStats):null,first:pro?structuredClone(p.seasonByLevel?.first??emptyRecord()):null,second:pro?structuredClone(p.seasonByLevel?.second??emptyRecord()):null,postseason:pro?structuredClone(p.seasonPostseason??emptyRecord()):null};
  const prior=referencePrior(context);
  const games=context.games.get(p.id)??[],competitions=new Map<string,EvaluationSnapshot["evidence"]["competitions"][number]>(),opponents=new Set<number>();
  const recent={from:null as string|null,to:null as string|null,first:emptyRecord(),second:emptyRecord(),school:emptyRecord(),games:0};
  for(const game of games){const team=game.evaluationEnvironment?.playerTeams?.[p.id]??(game.lineup[0]?.includes(p.id)?game.homeTeamId:game.lineup[1]?.includes(p.id)?game.awayTeamId:undefined);if(team!==undefined)opponents.add(game.homeTeamId===team?game.awayTeamId:game.homeTeamId);
    const comp=competitions.get(game.competitionId)??{id:game.competitionId,name:s.calendar.competitions.find(c=>c.id===game.competitionId)?.name??game.competitionId,games:0,records:emptyRecord()};comp.games++;mergeRecord(comp.records,game.boxScore[p.id]);competitions.set(comp.id,comp);
  }
  const recentGames=games.filter(g=>!g.competitionId.startsWith("pro-playoffs-")&&Date.parse(s.date)-Date.parse(g.date)<=30*86400000).slice(-10);
  for(const game of recentGames){const level=school?"school":game.competitionId==="pro-first"?"first":"second";mergeRecord(recent[level],game.boxScore[p.id]);recent.from??=game.date;recent.to=game.date;recent.games++;}
  const tools=statKeys.map(stat=>{const ref=reference.tools[stat],field=pitchingKeys.includes(stat)?"pitching":battingKeys.includes(stat)?"batting":isPitcher(p.primaryRole)?"pitching":"batting",member=!!p.twoWay||isPitcher(p.primaryRole)===(field==="pitching"),cohort=member?context.cohorts.get(`${p.grade}:${field}`)?.get(stat):undefined;return {stat,value:p.stats[stat],...gradeTool(p.stats[stat],ref),mean:ref.mean,sd:ref.sd,population:ref.size,fallback:ref.fallback,...(cohort?.size?{cohortRank:cohortRank(cohort.values,p.stats[stat]),cohortSize:cohort.size}:{})};});
  const previous=p.evaluationHistory?.filter(r=>r.date<s.date).at(-1),changes=previous?Object.fromEntries(statKeys.filter(k=>Math.abs(p.stats[k]-previous.stats[k])>1e-8).map(k=>[k,p.stats[k]-previous.stats[k]])):null;
  const roleField=isPitcher(p.primaryRole)?"pitching":"batting",firstSample=records.first?count(records.first,roleField):0,recentFirst=performanceEvidence(recent.first,context.league.first,roleField,false,true,prior);
  const candidate=pro?roleScore(p)-params["coach.fatigue_penalty"]*p.fatigue-(p.proContract?.status==="developmental"?6:0)-(p.professional?.managedUntil?12:0)+(recentFirst.score===null?0:params["coach.recent_max"]*clamp((recentFirst.score-50)/20,-1,1)*recentFirst.reliability):null;
  return {id:`${EVALUATION_MODEL}:${p.id}:${s.calendar.seasonYear}:${s.date}:${reason}`,version:1,modelVersion:EVALUATION_MODEL,balanceVersion:s.balanceVersion,playerId:p.id,playerName:p.name,date:s.date,season:s.calendar.seasonYear,reason,mode:pro?"pro":"school",grade:p.grade,graduationYear:school?s.calendar.seasonYear+3-p.grade:null,age:p.age??null,teamId:p.teamId,teamName:s.teams[p.teamId]?.name??"무소속",position:p.position,role:p.primaryRole,eligiblePositions:[...p.eligiblePositions],twoWay:!!p.twoWay,
    referenceId:reference.id,referenceSource:reference.source,referenceCreatedAt:reference.createdAt,stats:{...p.stats},stance:{...p.stance},tools,publicTalent:{batting:publicTalent(p,"batting"),pitching:publicTalent(p,"pitching")},records,recent,
    evidence:{games:games.length,opponents:opponents.size,from:games[0]?.date??null,to:games.at(-1)?.date??null,competitions:[...competitions.values()],opponentSnapshotGames:games.filter(g=>g.evaluationEnvironment).length},growth:previous&&changes?{from:previous.date,to:s.date,changes}:null,
    health:{fatigue:p.fatigue,forcedRest:p.forcedRest,injuryUntil:p.injury?.unavailableUntil??null,penalty:p.injury?.penaltyRemaining??0,available:available(p,s.date),developmental:p.proContract?.status==="developmental",transferWeeks:p.transferAdaptation?.weeksRemaining??0,unattached:p.professional?.employment==="freeAgent",unattachedYears:p.professional?.unattachedYears??0},availability:p.evaluationAvailability?{...p.evaluationAvailability}:null,
    comparison:{draftScore:school&&reason==="draft"?draftAssessment(p):null,legacyContract:pro?contractValue(p,s.calendar.seasonYear):null,legacyRegistration:selectionScore(p),candidateRegistration:candidate},reputation:reputationBreakdown(p),
    missing:["수비·주루 실측 자료 없음","구종·타구 질·좌우 상대 자료 없음",...(games.some(g=>!g.evaluationEnvironment)?["일부 경기의 당시 상대 수준 자료 없음"]:[]),...(!previous?["날짜가 있는 이전 성장 관찰 없음"]:[]),...(pro&&!firstSample?["1군 실전 검증 전"]:[])]};
}
// Automatic snapshots need observation inputs, not the fixed-opponent and
// multiyear projections which are reconstructed when someone opens a report.
export function createPlayerObservation(s:GameState,p:Player,context:Context,reason:EvaluationReason,contextId:string){
  const report=createEvaluationInputs(s,p,context,reason);
  report.id+=`:${hash(JSON.stringify([report.stats,report.records,report.role,report.position,report.teamId,report.eligiblePositions,report.twoWay,report.health]))}`;
  return compactEvaluation(report,contextId);
}
export function createPlayerEvaluation(s:GameState,p:Player,context:Context=buildEvaluationContext(s),reason:EvaluationReason="introduced"):EvaluationSnapshot {
  const input=createEvaluationInputs(s,p,context,reason),{records}=input,reference=context.reference,prior=referencePrior(context);
  const performance={school:records.school?fields(records.school,context.league.school,context,true):null,first:records.first?fields(records.first,context.league.first,context,false,true):null,second:records.second?fields(records.second,context.league.second,context):null};
  const multiyear=s.careerMode==="pro"?{first:{batting:multiyearEvidence(s,p,"first","batting",context.history,prior),pitching:multiyearEvidence(s,p,"first","pitching",context.history,prior)},second:{batting:multiyearEvidence(s,p,"second","batting",context.history,prior),pitching:multiyearEvidence(s,p,"second","pitching",context.history,prior)}}:null;
  const eligibleRoles=[...new Set(p.eligiblePositions.map(roleFor))],roles=eligibleRoles.map(role=>{const keys=roleTools(role),sorted=[...keys].sort((a,b)=>p.stats[b]-p.stats[a]||a.localeCompare(b));const score=Object.entries(reference.roleWeights[role]).reduce((n,[key,weight])=>n+p.stats[key as Stat]*weight!,0);return {role,score,...gradeTool(score,reference.roles[role]),strengths:sorted.slice(0,2),needs:sorted.slice(-2).reverse()};}).sort((a,b)=>b.score-a.score||a.role.localeCompare(b.role));
  return {...input,performance,multiyear,model:{batting:standardMatchup(p,reference),pitching:standardMatchup(p,reference,true)},roles};
}
export function playerEvaluationFor(s:GameState,p:Player){const observation=p.evaluationHistory?.at(-1);return observation?restoreEvaluation(s,p,observation):createPlayerEvaluation(s,p);}
export function evaluationSummary(report:EvaluationSnapshot){
  const role=report.roles.find(r=>r.role===report.role)??report.roles[0],strong=role?.strengths.map(k=>labels[k]).join("·")??"현재 도구";
  const evidence=(report.mode==="pro"?report.performance.first:report.performance.school)?.[isPitcher(report.role)?"pitching":"batting"];
  return `${strong} 중심으로 검토하는 ${report.role} 자원입니다. ${evidence?.confidence??"경기 근거 없음"} 상태로, 현재 능력과 실전 검증은 따로 살펴봅니다.`;
}

// Keep shared baselines once and store only the inputs needed to recreate a report.
// Numeric record arrays avoid repeating 30+ JSON keys for every NPC every month.
export function packEvaluationRecord(record:RecordLine){const template=emptyRecord();return [...Object.keys(template.batting).map(k=>record.batting[k as keyof typeof record.batting]),...Object.keys(template.pitching).map(k=>record.pitching[k as keyof typeof record.pitching]),...gameCounterKeys.map(key=>record.games?.[key]??-1)];}
export function unpackEvaluationRecord(values:number[]|null|undefined){const record=emptyRecord();let index=0;for(const group of ["batting","pitching"] as const)for(const key of Object.keys(record[group]))(record[group] as Record<string,number>)[key]=values?.[index++]??0;for(const key of gameCounterKeys){const value=values?.[index++];if(value!==undefined&&value>=0)(record.games??={})[key]=value;}return record;}
export function archiveEvaluationContext(s:GameState,context:Context,reason:EvaluationReason):EvaluationContextArchive {
  const league=Object.fromEntries(Object.entries(context.league).map(([key,r])=>[key,packEvaluationRecord(r)])) as EvaluationContextArchive["league"];
  return {id:`${EVALUATION_MODEL}:${context.reference.mode}:${s.calendar.seasonYear}:${s.date}:${reason}`,date:s.date,year:s.calendar.seasonYear,mode:context.reference.mode,referenceId:context.reference.id,league,leagueSeasons:context.leagueSeasons,history:Object.fromEntries([...context.history].map(([key,r])=>[key,packEvaluationRecord(r)])),parameters:{...context.reference.parameters}};
}
export function compactEvaluation(report:EvaluationInputs,contextId:string):EvaluationObservation {
  const excluded=new Set(["records","recent","evidence","performance","multiyear","model","roles","tools"]);
  const base=Object.fromEntries(Object.entries(report).filter(([key])=>!excluded.has(key))) as Omit<EvaluationObservation,"contextId"|"records"|"recent"|"evidence"|"cohort">;
  return {...base,contextId,records:{school:report.records.school?packEvaluationRecord(report.records.school):null,first:report.records.first?packEvaluationRecord(report.records.first):null,second:report.records.second?packEvaluationRecord(report.records.second):null,postseason:report.records.postseason?packEvaluationRecord(report.records.postseason):null},
    cohort:report.tools.flatMap(t=>t.cohortRank!==undefined?[{stat:t.stat,rank:t.cohortRank,size:t.cohortSize!}]:[]),
    recent:{...report.recent,school:packEvaluationRecord(report.recent.school),first:packEvaluationRecord(report.recent.first),second:packEvaluationRecord(report.recent.second)},
    evidence:{...report.evidence,competitions:report.evidence.competitions.map(c=>({...c,records:packEvaluationRecord(c.records)}))}};
}
export function restoreEvaluation(s:GameState,p:Player,observation:EvaluationObservation):EvaluationSnapshot {
  const archive=s.evaluationSystem?.contexts.find(c=>c.id===observation.contextId),reference=s.evaluationSystem?.references.find(r=>r.id===observation.referenceId);
  if(!archive||!reference)throw new Error("이 평가의 당시 기준 자료를 찾을 수 없습니다.");
  const records={school:observation.records.school?unpackEvaluationRecord(observation.records.school):null,first:observation.records.first?unpackEvaluationRecord(observation.records.first):null,second:observation.records.second?unpackEvaluationRecord(observation.records.second):null,postseason:observation.records.postseason?unpackEvaluationRecord(observation.records.postseason):null};
  const total=emptyRecord();if(records.first)mergeRecord(total,records.first);if(records.second)mergeRecord(total,records.second);
  const virtual:Player={...p,name:observation.playerName,stats:{...observation.stats},stance:{...observation.stance},position:observation.position,primaryRole:observation.role,eligiblePositions:[...observation.eligiblePositions],grade:observation.grade,age:observation.age??undefined,teamId:observation.teamId,careerMode:observation.mode==="pro"?"pro":undefined,seasonStats:records.school??total,seasonByLevel:records.first&&records.second?{first:records.first,second:records.second}:undefined,seasonPostseason:records.postseason??undefined,career:p.career.filter(row=>row.year<observation.season),evaluationHistory:undefined};
  const world={...s,date:observation.date,careerMode:virtual.careerMode,players:[virtual],calendar:{...s.calendar,seasonYear:observation.season}};
  const context:Context={reference,league:{school:unpackEvaluationRecord(archive.league.school),first:unpackEvaluationRecord(archive.league.first),second:unpackEvaluationRecord(archive.league.second)},leagueSeasons:archive.leagueSeasons??{school:archive.year,first:archive.year,second:archive.year},history:new Map(Object.entries(archive.history).map(([key,r])=>[key,unpackEvaluationRecord(r)])),games:new Map(),cohorts:new Map()};
  const calculated=createPlayerEvaluation(world,virtual,context,observation.reason);
  return {...calculated,...observation,reputation:observation.reputation,records,tools:calculated.tools.map(t=>{const field=pitchingKeys.includes(t.stat)?"pitching":battingKeys.includes(t.stat)?"batting":isPitcher(observation.role)?"pitching":"batting",member=observation.twoWay||isPitcher(observation.role)===(field==="pitching"),rank=member?observation.cohort.find(c=>c.stat===t.stat&&c.rank<=c.size):undefined;return {...t,...(rank?{cohortRank:rank.rank,cohortSize:rank.size}:{})};}),recent:{...observation.recent,first:unpackEvaluationRecord(observation.recent.first),second:unpackEvaluationRecord(observation.recent.second),school:unpackEvaluationRecord(observation.recent.school)},evidence:{...observation.evidence,competitions:observation.evidence.competitions.map(c=>({...c,records:unpackEvaluationRecord(c.records)}))}};
}
