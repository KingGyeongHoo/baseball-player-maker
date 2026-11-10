import {leaderMetrics,type LeaderField,type LeaderMetric} from "../league-leaders";
import type {GameState,ProLevel,RecordLine} from "./types";
import type {ProIndividualAward} from "./pro-types";

const battingIds=new Set(["avg","obp","slg","ops","HR","H","RBI","R","2B","3B","BB"]);
const pitchingIds=new Set(["era","whip","kRate","outs","SO"]);
export const individualAwardMetrics=():Record<LeaderField,LeaderMetric[]>=>({
  batting:leaderMetrics.batting.filter(metric=>battingIds.has(metric.id)),
  pitching:[...leaderMetrics.pitching.filter(metric=>pitchingIds.has(metric.id)),...([['wins','다승'],['holds','홀드'],['saves','세이브']] as const).map(([id,label])=>({id,label,value:(r:RecordLine)=>r.games?.[id]??0}))]
});
export function individualAwards(s:GameState):ProIndividualAward[]{
  const result:ProIndividualAward[]=[];
  const metrics=individualAwardMetrics();
  for(const level of ["first","second"] as ProLevel[])for(const field of ["batting","pitching"] as LeaderField[])for(const metric of metrics[field]){
    const games=level==="first"?144:72;
    const rows=s.players.flatMap(p=>{const r=p.seasonByLevel?.[level];if(!p.professional||!r)return [];
      const sample=field==="batting"?r.batting.PA:r.pitching.outs;
      if(sample<=0||metric.qualified&&sample<(field==="batting"?Math.ceil(games*3.1):games*3))return [];
      const value=metric.value(r);return value===null||!Number.isFinite(value)||!metric.ascending&&value===0?[]:[{p,value,sample}];
    }).sort((a,b)=>(metric.ascending?a.value-b.value:b.value-a.value)||b.sample-a.sample||a.p.id.localeCompare(b.p.id));
    const best=rows[0];if(!best)continue;
    result.push({level,field,metric:metric.id,label:metric.label,value:best.value,format:metric.format,winners:rows.filter(row=>Math.abs(row.value-best.value)<1e-10).map(({p})=>({playerId:p.id,playerName:p.name,club:p.teamId<0?p.professional!.contract?.club??p.professional!.firstClub:p.teamId%10}))});
  }
  return result;
}
