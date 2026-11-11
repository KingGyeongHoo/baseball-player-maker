import {addDays,available,getPlayer,isPitcher,ticketsUsed} from "./engine";
import type {GameState,Position} from "./types";

export type EventStory = {mode:"school"|"pro";teamId:number;sourceId?:string;revision?:number};
export type EventCategory="baseball"|"daily";
export type EventRule = {
  activity:"training"|"free"|"any";
  revision?:number;
  field?:"batting"|"pitching";months?:number[];minAge?:number;maxAge?:number;minGrade?:number;
  minFatigue?:number;maxFatigue?:number;form?:"slump"|"good";
  travel?:boolean;fielding?:boolean;
  positions?:Position[];
};

// The exported legacy name is retained for callers and old save metadata.
// Eligibility is entirely situational; no earlier story or choice is required.
export function eligibleStory(s:GameState,id:string,rule:EventRule,date=s.date):EventStory|undefined {
  const p=getPlayer(s),mode=s.careerMode==="pro"?"pro":"school";
  if(s.careerMode&&s.careerMode!=="pro"||s.phase==="ended"||!available(p,date)||p.forcedRest)return;
  const game=s.calendar.events.some(g=>g.date===date&&[g.homeTeamId,g.awayTeamId].includes(p.teamId));
  if(rule.activity==="free"&&game)return;
  if(rule.activity==="training"&&(!s.calendar.trainingDays.includes(date)||!ticketsUsed(p.trainingPolicy)))return;
  if(rule.field&&!(p.twoWay||(rule.field==="pitching")===isPitcher(p.primaryRole)))return;
  if(rule.fielding&&!p.eligiblePositions.some(pos=>!["SP","RP","CP","DH"].includes(pos)))return;
  if(rule.positions&&!p.eligiblePositions.some(pos=>rule.positions!.includes(pos)))return;
  if(rule.travel&&!s.calendar.events.some(g=>g.status==="scheduled"&&g.awayTeamId===p.teamId&&g.date>=date&&g.date<=addDays(date,2)))return;
  if(rule.months&&!rule.months.includes(Number(date.slice(5,7))))return;
  if(rule.minAge!==undefined&&(p.age??19)<rule.minAge||rule.maxAge!==undefined&&(p.age??19)>rule.maxAge)return;
  if(rule.minGrade!==undefined&&p.grade<rule.minGrade)return;
  if(rule.minFatigue!==undefined&&p.fatigue<rule.minFatigue||rule.maxFatigue!==undefined&&p.fatigue>rule.maxFatigue)return;
  if(rule.form==="slump"&&p.recentZ>-.3||rule.form==="good"&&p.recentZ<.3)return;
  const history=(s.careerEventHistory??[]).filter(row=>row.date<=date);
  if(history.some(row=>row.definitionId===id&&date<addDays(row.date,56)))return;
  const revision=rule.revision===undefined?{}:{revision:rule.revision};
  return {mode,teamId:p.teamId,...revision};
}
