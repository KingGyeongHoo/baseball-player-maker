import {buildCareerHonorBonusIndex,careerHonorBonusYears} from './career-honor-bonus';
import type {GameState,Player,ProLevel} from './types';
import type {ProSeasonAssessment,ProSeasonRank} from './pro-types';
import {levelWarValue,proWarRules} from './pro-war';

export const isBullpenSeason=(row:{role:string;seasonRank?:{role:string}})=>['불펜','중간계투','마무리'].includes(row.role)||['bullpen','reliever','closer'].includes(row.seasonRank?.role??'');

export function seasonPercentile(rank:Pick<ProSeasonRank,'rank'|'total'>|undefined|null){
  return rank?100*(rank.total-rank.rank+1)/rank.total:null;
}

export function careerWarGrade(war:number|null){
  if(war===null)return '—';
  const bands=[[60,'S'],[50,'A'],[40,'B'],[30,'C'],[20,'D'],[10,'E']] as const;
  return bands.find(([minimum])=>war+1e-9>=minimum)?.[1]??'F';
}
export const careerRegistrationRatio=.9;
export const clubAwardNames={first:'1군 최우수 선수',second:'2군 최우수 선수'} as const;
export function clubAwardLevel(kind:string):ProLevel|undefined{
  if(kind===clubAwardNames.first)return 'first';
  if(kind===clubAwardNames.second||kind==='구단 육성 우수 선수')return 'second';
}
const clubAwardBonus={first:.1,second:.05} as const;
type CareerSeason=Pick<ProSeasonAssessment,'year'|'score'|'war'|'seasonRank'|'clubGamesShortage'|'role'|'honorRegistration'|'clubAwardCounts'>;

export function meetsCareerRegistration(registration:CareerSeason['honorRegistration'],club?:number){
  if(!registration)return false;
  const days=(counts:Record<string,number>={})=>club===undefined
    ?Object.values(counts).reduce((sum,count)=>sum+count,0)
    :counts[club]??0;
  const eligibleDays=registration.seasonDays-days(registration.injuryDaysByClub);
  return eligibleDays>0&&days(registration.firstDaysByClub)>=eligibleDays*careerRegistrationRatio;
}
export function evaluateCareer(rows:CareerSeason[],level:ProLevel,year=Infinity,honorBonus=0){
  const seasons=[...new Map(rows.filter(row=>row.year<=year).map(row=>[row.year,row])).values()];
  const valid=seasons.filter(row=>row.score!==null&&!row.clubGamesShortage);
  const ranked=valid.filter(row=>row.seasonRank?.level===level&&(level==='second'||meetsCareerRegistration(row.honorRegistration)));
  const values=ranked.map(row=>seasonPercentile(row.seasonRank)!);
  const mean=(values:number[])=>values.reduce((sum,n)=>sum+n,0)/values.length;
  const average=values.length?mean(values):null,peak=values.length?mean([...values].sort((a,b)=>b-a).slice(0,5)):null;
  const awardBonus=seasons.reduce((sum,row)=>sum+(row.clubAwardCounts?.[level]??0),0)*clubAwardBonus[level]+honorBonus;
  const score=average===null||peak===null?null:Math.min(100,.7*average+.3*peak+awardBonus);
  const seasonWar=(row:CareerSeason)=>{
    const line=row.war?.[level];
    if(line)return levelWarValue(line,isBullpenSeason(row));
  };
  const totalWar=(rows:CareerSeason[])=>{
    const values=rows.flatMap(row=>{const value=seasonWar(row);return value===undefined?[]:[value];});
    return values.length?values.reduce((sum,value)=>sum+value,0):null;
  };
  const rawCredit=totalWar(ranked),levelCredit=rawCredit===null?null:rawCredit*(level==='second'?proWarRules.farmWeight:1);
  const farmValues=level==='first'?valid.flatMap(row=>row.war?[levelWarValue(row.war.second,isBullpenSeason(row))*proWarRules.farmWeight]:[]):[];
  const farmCredit=farmValues.reduce((sum,n)=>sum+n,0);
  const creditedWar=levelCredit===null?(farmCredit!==0?farmCredit:null):levelCredit+farmCredit;
  const cumulativeWar=creditedWar===null?(awardBonus>0?awardBonus:null):creditedWar+awardBonus;
  return {level,score,creditedWar,awardBonus,grade:careerWarGrade(cumulativeWar),average,peak,seasons:ranked.length,war:totalWar(seasons),cumulativeWar,unranked:valid.filter(row=>!row.seasonRank).length,reconstructed:ranked.filter(row=>row.seasonRank?.basis==='retained-records').length};
}
export function playerCareerEvaluation(p:Player,year=Infinity,state?:GameState){
  const rows=p.professional?.assessments??[];
  const bonus=state?[...careerHonorBonusYears(buildCareerHonorBonusIndex(state),p.id,undefined,year).values()].reduce((sum,n)=>sum+n,0):(p.professional?.careerHonorBonuses??[]).filter(row=>row.year<=year).reduce((sum,row)=>sum+row.points,0);
  return {first:evaluateCareer(rows,'first',year,bonus),second:evaluateCareer(rows,'second',year)};
}
export function refreshCareerEvaluation(p:Player){
  const rows=p.professional?.assessments;
  if(!rows?.some(row=>row.seasonRank))return;
  for(const row of rows){
    const first=playerCareerEvaluation(p,row.year).first;
    // Preserve the percentile snapshot for older saves. Career grades use WAR.
    row.cumulative=first.score;row.cumulativeGrade=first.grade;
  }
}

export function syncClubAwardCounts(s:GameState){
  const byPlayer=new Map<string,Map<number,Set<string>>>();
  for(const season of s.proWorld?.seasons??[])for(const award of season.awards){
    const level=clubAwardLevel(award.kind);
    if(!level)continue;
    const years=byPlayer.get(award.playerId)??new Map<number,Set<string>>();
    const entries=years.get(season.year)??new Set<string>();
    entries.add(`${level}:${award.club}`);
    years.set(season.year,entries);byPlayer.set(award.playerId,years);
  }
  let changed=false;
  for(const player of s.players){
    let updated=false;
    for(const row of player.professional?.assessments??[]){
      const entries=[...(byPlayer.get(player.id)?.get(row.year)??[])];
      const first=entries.filter(entry=>entry.startsWith('first:')).length,second=entries.length-first;
      if(first===(row.clubAwardCounts?.first??0)&&second===(row.clubAwardCounts?.second??0))continue;
      if(entries.length)row.clubAwardCounts={first,second};else delete row.clubAwardCounts;
      updated=true;
    }
    if(updated){refreshCareerEvaluation(player);changed=true;}
  }
  return syncCareerHonorBonuses(s)||changed;
}

export function syncCareerHonorBonuses(s:GameState){
  const index=buildCareerHonorBonusIndex(s);let changed=false;
  for(const player of s.players){
    const pro=player.professional;if(!pro)continue;
    const bonuses=[...careerHonorBonusYears(index,player.id)].sort((a,b)=>a[0]-b[0]).map(([year,points])=>({year,points}));
    if(JSON.stringify(pro.careerHonorBonuses??[])===JSON.stringify(bonuses))continue;
    if(bonuses.length)pro.careerHonorBonuses=bonuses;else delete pro.careerHonorBonuses;
    refreshCareerEvaluation(player);changed=true;
  }
  return changed;
}
