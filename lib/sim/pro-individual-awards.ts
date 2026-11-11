import {leaderMetrics,requiredLeaderSample,type LeaderField,type LeaderMetric} from "../league-leaders";
import type {GameState,ProLevel} from "./types";
import type {ProIndividualAward} from "./pro-types";

const titleNames:Record<LeaderField,Record<string,string>>={batting:{avg:'타격왕',H:'안타왕',SB:'도루왕',RBI:'타점왕'},pitching:{wins:'다승왕',holds:'홀드왕',saves:'세이브왕',era:'평균자책점왕'}};
export function individualTitleName(row:{field?:LeaderField;metric?:string;label?:string}){
  if(row.metric)return row.field?titleNames[row.field][row.metric]:titleNames.batting[row.metric]??titleNames.pitching[row.metric];
  return individualTitleFromKind(row.label??'');
}
export function individualTitleFromKind(kind:string){
  for(const field of ['batting','pitching'] as const)for(const [id,name] of Object.entries(titleNames[field])){
    if(kind===name||kind===leaderMetrics[field].find(metric=>metric.id===id)?.label||id==='wins'&&kind==='다승')return name;
  }
}
export const isRecordOnlyAward=(kind:string)=>!individualTitleFromKind(kind)&&Object.values(leaderMetrics).flat().some(metric=>metric.label===kind);
export const individualAwardMetrics=():Record<LeaderField,LeaderMetric[]>=>({
  batting:Object.entries(titleNames.batting).map(([id,label])=>({...leaderMetrics.batting.find(metric=>metric.id===id)!,label})),
  pitching:Object.entries(titleNames.pitching).map(([id,label])=>({...leaderMetrics.pitching.find(metric=>metric.id===id)!,label}))
});
export function individualAwards(s:GameState):ProIndividualAward[]{
  const result:ProIndividualAward[]=[];
  const metrics=individualAwardMetrics();
  for(const level of ["first","second"] as ProLevel[])for(const field of ["batting","pitching"] as LeaderField[])for(const metric of metrics[field]){
    const games=level==="first"?144:72;
    const rows=s.players.flatMap(p=>{const r=p.seasonByLevel?.[level];if(!p.professional||!r)return [];
      const sample=field==="batting"?r.batting.PA:r.pitching.outs;
      if(sample<=0||metric.qualified&&sample<requiredLeaderSample(p,field,games))return [];
      const value=metric.value(r);return value===null||!Number.isFinite(value)||!metric.ascending&&value===0?[]:[{p,value,sample}];
    }).sort((a,b)=>(metric.ascending?a.value-b.value:b.value-a.value)||b.sample-a.sample||a.p.id.localeCompare(b.p.id));
    const best=rows[0];if(!best)continue;
    result.push({level,field,metric:metric.id,label:metric.label,value:best.value,format:metric.format,winners:rows.filter(row=>Math.abs(row.value-best.value)<1e-10).map(({p})=>({playerId:p.id,playerName:p.name,club:p.teamId<0?p.professional!.contract?.club??p.professional!.firstClub:p.teamId%10}))});
  }
  return result;
}
