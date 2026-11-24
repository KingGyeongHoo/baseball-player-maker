import {emptyRecord,getPlayer,mergeRecord} from "./sim/engine";
import {currentSeasonAssessment,hasSeasonAppearance} from "./sim/pro-assessment";
import {emptyProWarAssessment} from './sim/pro-war';
import {playerSeasons} from "./player-records";
import {clubName} from "./sim/pro-world";
import type {GameState,Player} from "./sim/types";
import {individualTitleName,individualTitleFromKind,isRecordOnlyAward} from './sim/pro-individual-awards';
import type {NationalKind} from './sim/national-teams';
import {createSeasonRankings} from './sim/pro-season-ranking';
import {clubAwardLevel,clubAwardNames,evaluateCareer,playerCareerEvaluation,seasonPercentile} from './sim/pro-career-evaluation';
import {proLevelPrefix,mainLeagueName} from './sim/club-names';
import {regularSeasonDays} from './sim/retirement-honors';
import {allstarMvps} from './sim/pro-allstar-result';

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
  const career=playerCareerEvaluation(p,year,state),cumulative=career.first.score,current=rows.find(row=>row.year===year);
  const evaluation=!current&&pro?.employment==="active"&&p.teamId>=0?currentSeasonAssessment(state,p):undefined;
  const estimate=evaluation?.score??null;
  const noAppearances=current?.noAppearances||evaluation?.noAppearances||current?.score===null&&pro?.employment==='active'&&!hasSeasonAppearance(p);
  const contract=pro?.contract,firstYear=Math.max(year+(state.proWorld?.seasonClosed?1:0),contract?.startYear??year);
  const seasons=contract&&pro?.employment==="active"?Math.max(0,contract.endYear-firstYear+1):0;
  const seasonRank=current?current.seasonRank:evaluation?.score!==null&&evaluation?.score!==undefined?createSeasonRankings(state).get(p.id):undefined;
  const usage=pro?.honorUsage?.year===year?pro.honorUsage:undefined;
  const honorRegistration=usage&&{seasonDays:regularSeasonDays(state),firstDaysByClub:usage.firstDaysByClub,injuryDaysByClub:usage.injuryDaysByClub};
  const projected=current||!seasonRank?cumulative:evaluateCareer([...rows,{year,score:estimate,role:p.primaryRole,war:evaluation?.war,seasonRank,honorRegistration}],'first',year).score;
  return {cumulative,career,projected,seasons,salary:seasons?contract!.salary:null,seasonScore:noAppearances?0:seasonPercentile(seasonRank),seasonRank:noAppearances?undefined:seasonRank,seasonGrade:noAppearances?'F':seasonRank?.grade??current?.grade,noAppearances,war:noAppearances?emptyProWarAssessment():current?.war??evaluation?.war};
}

export type CareerHonorCategory="national"|"gold"|"allstar"|"individual";
export type CareerHonor={year:number;title:string;detail?:string};
export const careerHonorCategories=[{id:"national",label:"국가대표"},{id:"gold",label:"골든글러브"},{id:"allstar",label:"올스타"},{id:"individual",label:"개인 수상"}] as const;
export const nationalHonorTitles:Record<NationalKind,string>={youth:'청소년 국가대표',wbc:'WBC 국가대표',olympics:'올림픽 국가대표',premier12:'프리미어12 국가대표',apbc:'APBC 국가대표'};
export const isNationalSelection=(row:CareerHonor)=>Object.values(nationalHonorTitles).includes(row.title)||row.title==='성인 대표팀 합동훈련';
export function careerHonors(state:GameState):Record<CareerHonorCategory,CareerHonor[]>{
  const player=getPlayer(state),result:Record<CareerHonorCategory,CareerHonor[]>={national:[],gold:[],allstar:[],individual:[]},seen=new Set<string>();
  const add=(category:CareerHonorCategory,year:number,title:string,detail?:string,club?:number)=>{const key=`${category}:${year}:${title}:${club??''}`;if(seen.has(key))return;seen.add(key);result[category].push({year,title,...(detail?{detail}:{})});};
  const nationalEntries=(state.nationalTeams??[]).filter(entry=>entry.roster.some(row=>row.id===player.id));
  for(const entry of nationalEntries){
    const records=entry.tournament?.countries[0].players.find(row=>row.id===player.id)?.records,played=!!records&&(records.batting.PA>0||records.pitching.BF>0);
    const detail=entry.participated===false?'선발 · 불참':played?'출전':entry.participated?'참가':'선발';
    add('national',entry.year,nationalHonorTitles[entry.kind],detail);
    if(entry.tournament?.awards?.some(award=>award.id===player.id&&award.title==='MVP'))add('individual',entry.year,`${entry.kind==='youth'?'청소년 대표':nationalHonorTitles[entry.kind].replace(' 국가대표','')} MVP`);
  }
  for(const honor of state.proWorld?.retiredNumbers??[])if(honor.playerId===player.id)add("individual",Number(honor.date.slice(0,4)),"영구결번",`${clubName(state,honor.club)} · ${honor.number}번`);
  for(const [year,entry] of Object.entries(state.proEvents?.wbc??{}))if(entry.roster.some(row=>row.id===player.id)){
    add("national",Number(year),"WBC 국가대표",entry.participated?"출전":entry.settled?"선발 · 불참":"선발");
    if(entry.participated&&entry.result==="WBC01:mvp")add("individual",Number(year),"WBC MVP");
  }
  for(const event of state.careerEventHistory??[]){
    const year=Number(event.date.slice(0,4));
    if(event.definitionId==="P08"){
      const participated=event.choiceId?(event.choiceId==="choice-1"||event.choiceId.startsWith("participate-")):event.choice.includes("소집에 응한다");
      add("national",year,"청소년 국가대표",participated?"출전":"선발 · 불참");
      if(participated&&event.message.includes("MVP"))add("individual",year,"청소년 대표 MVP");
    }
    if(event.definitionId==="WBC01"){
      const participated=event.choiceId==="participate"||!!event.choiceId?.startsWith("participate-");
      add("national",year,"WBC 국가대표",participated?"출전":"선발 · 불참");
      if(participated&&event.proEvent?.branchId==="WBC01:mvp")add("individual",year,"WBC MVP");
    }
    if(event.definitionId==='PE27'){
      const matching=nationalEntries.filter(entry=>entry.year===year&&entry.kind!=='youth');
      const kind=event.proEvent?.nationalKind??(['olympics','premier12','apbc','wbc'] as const).find(kind=>event.title?.includes(kind==='olympics'?'올림픽':kind==='premier12'?'프리미어':kind==='apbc'?'APBC':'WBC'));
      if(!matching.length)add('national',year,kind?nationalHonorTitles[kind]:'성인 대표팀 합동훈련',event.choiceId==='choice-1'?'참가':'선발 · 불참');
    }
  }
  const allstar=(year:number,level:"first"|"second",side:string,participated?:boolean,withdrawn?:boolean,mvp?:boolean)=>{
    const prefix=proLevelPrefix(level);
    add("allstar",year,`${prefix}올스타`,`${side==="blue"?"BLUE":"WHITE"} · ${withdrawn?"선발 · 불참":participated?"출전":"선발"}`);
    if(mvp)add("individual",year,`${prefix}미스터 올스타`);
  };
  for(const row of player.professional?.allstarHistory??[])allstar(row.year,row.level,row.side,row.participated,row.withdrawn,row.mvp);
  const seasons=state.proWorld?.seasons??[];
  const allstars=[...seasons.flatMap(season=>season.allstar?[season.allstar]:[]),...(state.proWorld?.allstar?[state.proWorld.allstar]:[])];
  for(const season of allstars)for(const level of ["first","second"] as const){
    const league=season.levels[level];
    const mvp=allstarMvps(league).some(row=>row.playerId===player.id);
    if(mvp)add('individual',season.year,`${proLevelPrefix(level)}미스터 올스타`);
    for(const side of ['blue','white'] as const){
      const team=league[side],selected=team.roster.some(row=>row.playerId===player.id),withdrawn=team.withdrawn.includes(player.id);
      if(!selected&&!withdrawn)continue;
      const line=league.game?.boxScore[player.id];allstar(season.year,level,side,!!line&&(line.batting.PA>0||line.pitching.BF>0),withdrawn,mvp);
    }
  }
  for(const season of seasons){
    const announced=!season.awardsCeremony||!!season.awardsCeremony.presentedAt;
    for(const row of season.individualAwards??[]){const title=individualTitleName(row);if(title&&row.winners.some(winner=>winner.playerId===player.id))add("individual",season.year,`${proLevelPrefix(row.level)}${title}`,row.winners.length>1?"공동 1위":undefined);}
    for(const award of season.awards){
      if(award.playerId!==player.id)continue;
      const clubLevel=clubAwardLevel(award.kind);
      if(clubLevel){add('individual',season.year,clubAwardNames[clubLevel],clubName(state,award.club),award.club);continue;}
      if(award.category==="goldGlove"||award.kind.startsWith("골든글러브")){if(announced)add("gold",season.year,award.kind.replace("골든글러브 · ",""));continue;}
      if(award.category==='mvp'||award.kind==="시즌 MVP"||award.category==='rookie'){if(announced)add("individual",season.year,award.kind);continue;}
      const title=individualTitleFromKind(award.kind);
      if(title)add("individual",season.year,title);
      else if(!isRecordOnlyAward(award.kind))add("individual",season.year,mainLeagueName(award.kind));
    }
  }
  for(const series of [...(state.proWorld?.postseason?.series??[]),...(state.proWorld?.farmPostseason?.series??[])])if(series.winner!==undefined&&series.mvp?.playerId===player.id)add('individual',state.proWorld!.year,series.mvp.kind);
  for(const rows of Object.values(result))rows.sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title,"ko"));
  return result;
}
