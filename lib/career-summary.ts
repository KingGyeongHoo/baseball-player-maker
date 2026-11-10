import {emptyRecord,getPlayer,mergeRecord} from "./sim/engine";
import {assessmentValue} from "./sim/pro-assessment";
import {playerSeasons} from "./player-records";
import type {GameState,Player} from "./sim/types";

export function lifetimeRecords(player:Player,year:number){
  const total=emptyRecord();
  for(const season of playerSeasons(player,year)){
    if(season.byLevel){mergeRecord(total,season.byLevel.first);mergeRecord(total,season.byLevel.second);}
    else mergeRecord(total,season.records);
    if(season.postseason)mergeRecord(total,season.postseason);
  }
  return total;
}

export function careerContractSummary(state:GameState){
  const p=getPlayer(state),pro=p.professional,year=state.calendar.seasonYear;
  const rows=[...new Map((pro?.assessments??[]).filter(row=>row.year<=year).map(row=>[row.year,row])).values()];
  const scores=rows.flatMap(row=>row.score===null?[]:[row.score]);
  const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const cumulative=mean(scores),current=rows.find(row=>row.year===year);
  const estimate=pro?.employment==="active"&&p.teamId>=0?assessmentValue(p,year).current:null;
  const projected=current?cumulative:mean([...scores,...(estimate===null?[]:[estimate])]);
  const contract=pro?.contract,firstYear=Math.max(year+(state.proWorld?.seasonClosed?1:0),contract?.startYear??year);
  const seasons=contract&&pro?.employment==="active"?Math.max(0,contract.endYear-firstYear+1):0;
  return {cumulative,projected,seasons,salary:seasons?contract!.salary:null};
}

export type CareerHonorCategory="national"|"gold"|"allstar"|"individual";
export type CareerHonor={year:number;title:string;detail?:string};
export const careerHonorCategories=[{id:"national",label:"국가대표"},{id:"gold",label:"골든글러브"},{id:"allstar",label:"올스타"},{id:"individual",label:"개인 수상"}] as const;
export function careerHonors(state:GameState):Record<CareerHonorCategory,CareerHonor[]>{
  const player=getPlayer(state),result:Record<CareerHonorCategory,CareerHonor[]>={national:[],gold:[],allstar:[],individual:[]},seen=new Set<string>();
  const add=(category:CareerHonorCategory,year:number,title:string,detail?:string)=>{const key=`${category}:${year}:${title}`;if(seen.has(key))return;seen.add(key);result[category].push({year,title,...(detail?{detail}:{})});};
  for(const [year,entry] of Object.entries(state.proEvents?.wbc??{}))if(entry.roster.some(row=>row.id===player.id)){
    add("national",Number(year),"WBC 국가대표",entry.participated?"출전":entry.settled?"선발 · 불참":"선발");
    if(entry.participated&&entry.result==="WBC01:mvp")add("national",Number(year),"WBC MVP");
  }
  for(const event of state.careerEventHistory??[]){
    const year=Number(event.date.slice(0,4));
    if(event.definitionId==="P08"){
      const participated=event.choiceId?event.choiceId==="choice-1":event.choice.includes("소집에 응한다");
      add("national",year,"청소년 국가대표",participated?"출전":"선발 · 불참");
      if(participated&&event.message.includes("MVP"))add("national",year,"청소년 대표 MVP");
    }
    if(event.definitionId==="WBC01"){
      const participated=event.choiceId==="participate";
      add("national",year,"WBC 국가대표",participated?"출전":"선발 · 불참");
      if(participated&&event.proEvent?.branchId==="WBC01:mvp")add("national",year,"WBC MVP");
    }
    if(event.definitionId==="PE27")add("national",year,"성인 대표팀 합동훈련",event.choiceId==="choice-1"?"참가":"초청 · 불참");
  }
  const allstar=(year:number,level:"first"|"second",side:string,participated?:boolean,withdrawn?:boolean,mvp?:boolean)=>{
    const label=level==="first"?"1군":"2군";
    add("allstar",year,`${label} 올스타`,`${side==="blue"?"BLUE":"WHITE"} · ${withdrawn?"선발 · 불참":participated?"출전":"선발"}`);
    if(mvp)add("allstar",year,`${label} 미스터 올스타`);
  };
  for(const row of player.professional?.allstarHistory??[])allstar(row.year,row.level,row.side,row.participated,row.withdrawn,row.mvp);
  const seasons=state.proWorld?.seasons??[];
  const allstars=[...seasons.flatMap(season=>season.allstar?[season.allstar]:[]),...(state.proWorld?.allstar?[state.proWorld.allstar]:[])];
  for(const season of allstars)for(const level of ["first","second"] as const)for(const side of ["blue","white"] as const){
    const league=season.levels[level],team=league[side],selected=team.roster.some(row=>row.playerId===player.id),withdrawn=team.withdrawn.includes(player.id);
    if(!selected&&!withdrawn)continue;
    const line=league.game?.boxScore[player.id];allstar(season.year,level,side,!!line&&(line.batting.PA>0||line.pitching.BF>0),withdrawn,league.mvp?.playerId===player.id);
  }
  for(const season of seasons){
    const announced=!season.awardsCeremony||!!season.awardsCeremony.presentedAt;
    for(const row of season.individualAwards??[])if(row.winners.some(winner=>winner.playerId===player.id))add("individual",season.year,`${row.level==="first"?"1군":"2군"} ${row.label} 1위`,row.winners.length>1?"공동 1위":undefined);
    for(const award of season.awards){
      if(award.playerId!==player.id)continue;
      if(award.category==="goldGlove"||award.kind.startsWith("골든글러브")){if(announced)add("gold",season.year,award.kind.replace("골든글러브 · ",""));continue;}
      if(award.kind==="시즌 MVP"){if(announced)add("individual",season.year,award.kind);continue;}
      if(["타율","홈런","타점","안타","평균자책점","탈삼진"].includes(award.kind))add("individual",season.year,`1군 ${award.kind} 1위`);
      else add("individual",season.year,award.kind);
    }
  }
  for(const rows of Object.values(result))rows.sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title,"ko"));
  return result;
}
