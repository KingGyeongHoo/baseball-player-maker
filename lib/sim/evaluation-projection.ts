import {statKeys,type Stat,type Stats} from "./types";
import type {EvaluationProjection,EvaluationSnapshot} from "./player-evaluation-types";

const batter:Stat[]=["contact","power","speed","defense"],pitcher:Stat[]=["velocity","control","movement"];
const average=(stats:Stats,keys:Stat[])=>keys.reduce((n,k)=>n+stats[k],0)/keys.length;
export function evaluationProjections(report:EvaluationSnapshot,configuration:Record<string,number>):EvaluationProjection[] {
  const graduationStart=report.graduationYear?new Date(Date.UTC(report.graduationYear,8,1)):null;
  if(graduationStart)graduationStart.setUTCDate(1+(1-graduationStart.getUTCDay()+7)%7);
  const targets=report.mode==="school"?[{label:"고교 졸업 시점",target:graduationStart!.toISOString().slice(0,10)},{label:"프로 입단 후 3년차 가정",target:`${report.graduationYear!+3}-09-01`}]:[{label:"다음 시즌",target:`${report.season+1}-09-01`},{label:"3년 뒤",target:`${report.season+3}-09-01`}];
  const simulate=(target:string,scenario:0|1|2,registered=false)=>{
    const stats={...report.stats},start=Date.parse(report.date),end=Math.max(start,Date.parse(target)),step=365.25/40*86400000,c=configuration;
    const slowdown=(value:number)=>{for(let i=1;i<=5;i++)if(value<c[`growth.break${i}`])return c[`growth.factor${i-1}`];return c["growth.factor5"];};
    const focus=(n:number)=>n===0?0:c["training.focus_min"]+c["training.focus_span"]*Math.log(n)/Math.log(c["training.max_each"]);
    let agedYear=report.season,age=report.age??15+report.grade;
    for(let date=start;date<end;date+=step){
      const current=new Date(date),currentYear=current.getUTCFullYear()-(current.getUTCMonth()<2?1:0),pro=report.mode==="pro"||date>=Date.parse(`${report.graduationYear!+1}-03-01`);
      if(currentYear>agedYear){age+=currentYear-agedYear;agedYear=currentYear;if(pro){const agingAge=age+[2,0,-2][scenario],band=agingAge<30?0:agingAge<=32?1:agingAge<=35?2:agingAge<=38?3:4;for(const k of statKeys){const rates=k==="speed"||k==="velocity"?[0,.3,.7,1.2,1.8]:["power","arm","stamina","recovery"].includes(k)?[0,.15,.45,.9,1.4]:k==="bq"?[0,0,0,0,.1]:[0,0,.1,.35,.7];stats[k]=Math.max(1,stats[k]-rates[band]);}}}
      const efficiency=!pro?1:age<=22?1.2:age<=26?1.1:age<=29?1:age<=32?.8:age<=35?.6:age<=38?.4:.25;
      const injured=report.health.injuryUntil&&date<Date.parse(report.health.injuryUntil);
      const participation=injured?0:[.6,.85,1][scenario],fraction=Math.min(1,(end-date)/step);
      const developmental=pro&&report.health.developmental&&!registered?.9:1;
      const neutral=c["fatigue.plan_neutral_base"]+c["fatigue.plan_neutral_stat"]*stats.recovery;
      const physical=neutral<8/35?1:2;
      for(const k of statKeys){
        const field=pitcher.includes(k)?"pitching":"batting",known=report.publicTalent[field],talent=scenario===0?known.min:scenario===2?known.max:(known.min+known.max)/2;
        const mult=c["talent.min_mult"]+(talent-1)/9*(c["talent.max_mult"]-c["talent.min_mult"]);
        const allocation=report.twoWay?1:(report.role==="선발"||report.role==="중간계투"||report.role==="마무리"?pitcher:batter).includes(k)?2:0;
        const adaptation=date-start<report.health.transferWeeks*step?.9:1;
        const days=c["training.days"]*participation*efficiency*developmental*(report.health.unattached?.6:1)*adaptation*fraction;
        const increment=["stamina","recovery","arm"].includes(k)?focus(physical)/3:k==="bq"?c["training.bq"]:(c["training.base"]+focus(allocation))*mult;
        stats[k]=Math.min(100,stats[k]+increment*slowdown(stats[k])*days/c["training.days"]);
      }
    }
    return {batting:average(stats,batter),pitching:average(stats,pitcher)};
  };
  return targets.filter(t=>t.target>=report.date&&(!report.health.unattached||Number(t.target.slice(0,4))-report.season+report.health.unattachedYears<2)).map(({label,target})=>{const low=simulate(target,0),base=simulate(target,1),high=simulate(target,2);return {label,target,basis:"연 40훈련주 · 회복 균형을 고려한 표준 배분 · 참여율 60/85/100% · 공개 재능 범위 · 노화 범위 · 사건·신규 부상 미예측. 확률구간이나 입단·주전 보장이 아닙니다.",fields:{batting:{current:average(report.stats,batter),low:low.batting,base:base.batting,high:high.batting},pitching:{current:average(report.stats,pitcher),low:low.pitching,base:base.pitching,high:high.pitching}},...(report.health.developmental?{registeredBase:simulate(target,1,true)}:{})};});
}
