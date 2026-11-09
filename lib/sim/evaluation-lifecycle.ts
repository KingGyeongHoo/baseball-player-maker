import {available,hash,ovr} from "./engine";
import {archiveEvaluationContext,buildEvaluationContext,compactEvaluation,createPlayerEvaluation} from "./player-evaluation";
import type {EvaluationReason} from "./player-evaluation-types";
import type {Game,GameState,Player} from "./types";

export function capturePlayerEvaluations(s:GameState,reason?:EvaluationReason,ids?:string[]) {
  if(s.careerMode==="college")return s;
  const introduced=!s.evaluationSystem,month=s.date.slice(0,7);
  const actualReason=reason??(introduced?"introduced":"monthly");
  if(!reason&&!introduced&&s.evaluationSystem?.lastMonthly===month)return s;
  s.evaluationSystem??={version:1,introducedAt:s.date,references:[],contexts:[]};
  const system=s.evaluationSystem,context=buildEvaluationContext(s),selected=ids?new Set(ids):null;
  if(!system.references.some(r=>r.id===context.reference.id))system.references.push(context.reference);
  const archive=archiveEvaluationContext(s,context,actualReason);
  // A paused day may gain records before another event. Keep both contexts.
  archive.id+=`:${hash(JSON.stringify(archive.league))}`;
  if(!system.contexts.some(c=>c.id===archive.id))system.contexts.push(archive);
  const protectedReasons=new Set<EvaluationReason>(["entry","season-end","draft","contract","role-change","team-change"]);
  for(const p of s.players){if(selected&&!selected.has(p.id))continue;
    const report=createPlayerEvaluation(s,p,context,actualReason);
    report.id+=`:${hash(JSON.stringify([report.stats,report.records,report.role,report.position,report.teamId,report.eligiblePositions,report.twoWay,report.health]))}`;
    const history=p.evaluationHistory??=[];
    if(history.some(row=>row.id===report.id))continue;
    const updated=[...history,compactEvaluation(report,archive.id)];
    const recent=updated.filter(row=>!protectedReasons.has(row.reason)).slice(-2),keep=new Set(recent.map(r=>r.id));
    p.evaluationHistory=updated.filter(row=>protectedReasons.has(row.reason)||keep.has(row.id));
  }
  if(!ids)system.lastMonthly=month;
  const contexts=new Set([...s.players,...(s.proWorld?.archive??[])].flatMap(p=>p.evaluationHistory?.map(row=>row.contextId)??[]));
  system.contexts=system.contexts.filter(c=>contexts.has(c.id));
  return s;
}
export function captureEvaluationChange(s:GameState,before:Player) {
  const p=s.players.find(p=>p.id===before.id);if(!p)return s;
  if(p.teamId!==before.teamId)return capturePlayerEvaluations(s,"team-change",[p.id]);
  if(p.position!==before.position||p.primaryRole!==before.primaryRole||p.twoWay?.pitchingPosition!==before.twoWay?.pitchingPosition||p.twoWay?.battingPosition!==before.twoWay?.battingPosition)return capturePlayerEvaluations(s,"role-change",[p.id]);
  const latest=p.evaluationHistory?.at(-1);if(latest?.date===s.date&&Object.keys(p.stats).every(key=>p.stats[key as keyof Player["stats"]]===latest.stats[key as keyof Player["stats"]]))return s;
  if(Object.keys(p.stats).some(key=>Math.abs(p.stats[key as keyof Player["stats"]]-before.stats[key as keyof Player["stats"]])>=1))return capturePlayerEvaluations(s,"ability-change",[p.id]);
  return s;
}
export function capturePendingEvaluationChanges(s:GameState) {
  const teams:string[]=[],roles:string[]=[];
  for(const p of s.players){const previous=p.evaluationHistory?.at(-1);if(!previous)continue;if(previous.teamId!==p.teamId)teams.push(p.id);else if(previous.role!==p.primaryRole||previous.position!==p.position||previous.twoWay!==!!p.twoWay)roles.push(p.id);}
  if(teams.length)capturePlayerEvaluations(s,"team-change",teams);if(roles.length)capturePlayerEvaluations(s,"role-change",roles);return s;
}
export function recordEvaluationDay(s:GameState) {
  for(const p of s.players){if(p.professional?.employment==="retired")continue;
    if(!p.evaluationAvailability||p.evaluationAvailability.year!==s.calendar.seasonYear)p.evaluationAvailability={year:s.calendar.seasonYear,from:s.date,days:0,availableDays:0,injuredDays:0,firstDays:0,lastDate:""};
    const usage=p.evaluationAvailability;if(usage.lastDate===s.date)continue;
    usage.days++;usage.lastDate=s.date;if(available(p,s.date))usage.availableDays++;
    if(p.injury&&s.date<p.injury.unavailableUntil)usage.injuredDays++;
    if(s.careerMode==="pro"&&p.teamId>=0&&p.teamId<10)usage.firstDays++;
  }
}
export function recordEvaluationEnvironment(s:GameState,game:Game,rosters:Player[][]) {
  if(game.evaluationEnvironment)return;
  const teams=[game.homeTeamId,game.awayTeamId].map(teamId=>{const roster=rosters[teamId]??[],batters=roster.filter(p=>p.eligiblePositions.some(pos=>!["SP","RP","CP"].includes(pos))),pitchers=roster.filter(p=>p.eligiblePositions.some(pos=>["SP","RP","CP"].includes(pos)));
    const mean=(rows:Player[],value:(p:Player)=>number)=>rows.length?rows.reduce((n,p)=>n+value(p),0)/rows.length:0;
    return {teamId,batting:mean(batters,p=>ovr(p,false)),pitching:mean(pitchers,p=>ovr(p,true)),defense:mean(batters,p=>p.stats.defense),arm:mean(batters,p=>p.stats.arm)};
  });
  game.evaluationEnvironment={version:1,date:game.date,teams,playerTeams:{}};
}
