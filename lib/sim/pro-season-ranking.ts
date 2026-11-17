import {createProWarContext,proWarAssessment,type ProWarContext} from './pro-war';
import type {GameState,Player} from './types';
import type {ProSeasonRank} from './pro-types';
import {refreshCareerEvaluation} from './pro-career-evaluation';

export const seasonRoleNames={batter:'야수',starter:'선발',reliever:'중계',closer:'마무리'} as const;
export function seasonRankGrade(rank:number,total:number){
  const fraction=(rank-1)/total;
  return fraction<.1?'S':fraction<.3?'A':fraction<.5?'B':fraction<.8?'C':fraction<.9?'D':'F';
}
function seasonRole(p:Player):ProSeasonRank['role']{
  const pitching=p.twoWay?.pitchingPosition??p.position;
  return pitching==='SP'?'starter':pitching==='RP'?'reliever':pitching==='CP'?'closer':'batter';
}
// All actual contributors compete within the same league level and role.
// Equal WAR shares a competition rank; player IDs never break a sporting tie.
export function createSeasonRankings(s:GameState,context:ProWarContext=createProWarContext(s)){
  const pools=new Map<string,{id:string;war:number;role:ProSeasonRank['role'];level:ProSeasonRank['level']}[]>();
  for(const p of s.players){
    if(!p.professional)continue;
    const first=p.seasonByLevel?.first,second=p.seasonByLevel?.second;
    const participated=(r:typeof first)=>!!r&&(r.batting.PA>0||r.pitching.BF>0||(r.fielding&&Object.values(r.fielding.outs).some(n=>n!>0)));
    const level=participated(first)?'first':participated(second)?'second':undefined;
    if(!level)continue;
    const frozen=s.proWorld?.seasonClosed?p.professional.assessments?.find(row=>row.year===s.calendar.seasonYear):undefined;
    const role=frozen?.seasonRank?.role??seasonRole(p),war=(frozen?.war??proWarAssessment(p,context)).equivalentWins,key=`${level}:${role}`;
    const pool=pools.get(key)??[];pool.push({id:p.id,war,role,level});pools.set(key,pool);
  }
  const result=new Map<string,ProSeasonRank>();
  for(const pool of pools.values()){
    pool.sort((a,b)=>b.war-a.war);
    let rank=1;
    pool.forEach((entry,index)=>{
      if(index&&Math.abs(entry.war-pool[index-1].war)>1e-7)rank=index+1;
      result.set(entry.id,{version:1,year:s.calendar.seasonYear,role:entry.role,level:entry.level,war:entry.war,rank,total:pool.length,grade:seasonRankGrade(rank,pool.length)});
    });
  }
  return result;
}
export function freezeSeasonRankings(s:GameState,context?:ProWarContext){
  const ranks=createSeasonRankings(s,context);
  for(const p of s.players){
    const row=p.professional?.assessments?.find(row=>row.year===s.calendar.seasonYear),rank=ranks.get(p.id);
    if(!row||row.score===null||row.seasonRank||!rank)continue;
    row.seasonRank=rank;row.grade=rank.grade;
    refreshCareerEvaluation(p);
  }
}
export function needsSeasonRankings(s:GameState){
  return !!s.proWorld?.seasonClosed&&s.players.some(p=>p.professional?.assessments?.some(row=>row.year===s.calendar.seasonYear&&row.score!==null&&row.war&&!row.seasonRank&&[row.war.first,row.war.second].some(r=>r.pa>0||r.outs>0||r.fieldingOuts>0)));
}
export function validSeasonRank(value:unknown):value is ProSeasonRank{
  if(!value||typeof value!=='object')return false;
  const r=value as ProSeasonRank;
  return r.version===1&&Number.isInteger(r.year)&&Object.hasOwn(seasonRoleNames,r.role)&&['first','second'].includes(r.level)
    &&Number.isFinite(r.war)&&Number.isInteger(r.rank)&&Number.isInteger(r.total)&&r.rank>=1&&r.total>=r.rank
    &&r.grade===seasonRankGrade(r.rank,r.total)&&(r.basis===undefined||r.basis==='retained-records');
}
