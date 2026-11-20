import {eligibleLeaderSample,leaderMetrics,proRankingMetricIds,requiredLeaderSample,type LeaderField,type LeaderMetric} from "../league-leaders";
import type {GameState,ProLevel} from "./types";
import type {ProIndividualAward,ProSeasonArchive} from "./pro-types";
import {farmSeasonGames} from './pro-farm-schedule';

import {titleNames,individualTitleName,individualTitleFromKind} from './pro-individual-titles';
export {individualTitleName,individualTitleFromKind} from './pro-individual-titles';

export function individualAwardRows(awards:ProIndividualAward[]|undefined,level:ProLevel,field:LeaderField){
  return awards?.filter(row=>row.level===level&&row.field===field&&individualTitleName(row)).map(row=>({...row,label:individualTitleName(row)!}))??[];
}
export const isRecordOnlyAward=(kind:string)=>!individualTitleFromKind(kind)&&Object.values(leaderMetrics).flat().some(metric=>metric.label===kind);
export const individualAwardMetrics=():Record<LeaderField,LeaderMetric[]>=>({
  batting:proRankingMetricIds.batting.map(id=>({...leaderMetrics.batting.find(metric=>metric.id===id)!,label:titleNames.batting[id]})),
  pitching:proRankingMetricIds.pitching.map(id=>({...leaderMetrics.pitching.find(metric=>metric.id===id)!,label:titleNames.pitching[id]}))
});
export function individualAwards(s:GameState):ProIndividualAward[]{
  const result:ProIndividualAward[]=[];
  const metrics=individualAwardMetrics();
  for(const level of ["first","second"] as ProLevel[])for(const field of ["batting","pitching"] as LeaderField[])for(const metric of metrics[field]){
    const games=level==="first"?144:farmSeasonGames;
    const rows=s.players.flatMap(p=>{const r=p.seasonByLevel?.[level];if(!p.professional||!r)return [];
      const sample=eligibleLeaderSample(r,field,metric,metric.qualified?requiredLeaderSample(p,field,games,true,level):0);
      if(sample===null)return [];
      const value=metric.value(r);return value===null||!Number.isFinite(value)||!metric.ascending&&value===0?[]:[{p,value,sample}];
    }).sort((a,b)=>(metric.ascending?a.value-b.value:b.value-a.value)||b.sample-a.sample||a.p.id.localeCompare(b.p.id));
    const best=rows[0];if(!best)continue;
    result.push({level,field,metric:metric.id,label:metric.label,value:best.value,format:metric.format,winners:rows.filter(row=>Math.abs(row.value-best.value)<1e-10).map(({p})=>({playerId:p.id,playerName:p.name,club:p.teamId<0?p.professional!.contract?.club??p.professional!.firstClub:p.teamId%10}))});
  }
  return result;
}

export function hasRunsTitle(season:ProSeasonArchive,level:ProLevel){
  return season.individualAwards?.some(row=>row.level===level&&row.field==='batting'&&row.metric==='R'&&row.value>0&&(row.winners?.length??0)>0)??false;
}
export function recoverRunsTitle(s:GameState,season:ProSeasonArchive,level:ProLevel):ProIndividualAward|undefined{
  const legacy=season.awards.filter(row=>(row.level??'first')===level&&(row.kind==='득점왕'||row.kind==='득점')&&row.value>0);
  const recordedBest=Math.max(0,...legacy.map(row=>row.value));
  if(recordedBest>0)return {level,field:'batting',metric:'R',label:titleNames.batting.R,value:recordedBest,winners:legacy.filter(row=>row.value===recordedBest).map(({playerId,playerName,club})=>({playerId,playerName,club}))};
  const rows=s.players.flatMap(p=>{
    const history=p.career.find(row=>row.careerMode==='pro'&&row.year===season.year);
    const current=s.calendar.seasonYear===season.year&&s.proWorld?.seasonClosed?p.seasonByLevel:undefined;
    const records=history?.byLevel?.[level]??current?.[level];
    const runs=records?.batting.R??0;
    if(!p.professional||runs<=0)return [];
    const team=history?.schoolId??p.teamId;
    const club=team>=0?team%10:p.professional.contract?.club??p.professional.firstClub;
    return [{runs,playerId:p.id,playerName:p.name,club}];
  });
  const value=Math.max(0,...rows.map(row=>row.runs));
  if(value>0)return {level,field:'batting',metric:'R',label:titleNames.batting.R,value,winners:rows.filter(row=>row.runs===value).map(({playerId,playerName,club})=>({playerId,playerName,club}))};
}
