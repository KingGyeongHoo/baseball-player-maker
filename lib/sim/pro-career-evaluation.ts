import type {Player,ProLevel} from './types';
import type {ProSeasonAssessment,ProSeasonRank} from './pro-types';

export function seasonPercentile(rank:Pick<ProSeasonRank,'rank'|'total'>|undefined|null){
  return rank?100*(rank.total-rank.rank+1)/rank.total:null;
}

export function careerPercentileGrade(score:number|null){
  if(score===null)return '—';
  return score>90+1e-9?'S':score>70+1e-9?'A':score>50+1e-9?'B':score>20+1e-9?'C':score>10+1e-9?'D':'F';
}
export const careerRegistrationRatio=.9;
type CareerSeason=Pick<ProSeasonAssessment,'year'|'score'|'war'|'seasonRank'|'clubGamesShortage'|'role'|'honorRegistration'>;

export function meetsCareerRegistration(registration:CareerSeason['honorRegistration'],club?:number){
  if(!registration)return false;
  const days=(counts:Record<string,number>={})=>club===undefined
    ?Object.values(counts).reduce((sum,count)=>sum+count,0)
    :counts[club]??0;
  const eligibleDays=registration.seasonDays-days(registration.injuryDaysByClub);
  return eligibleDays>0&&days(registration.firstDaysByClub)>=eligibleDays*careerRegistrationRatio;
}
export function evaluateCareer(rows:CareerSeason[],level:ProLevel,year=Infinity){
  const seasons=[...new Map(rows.filter(row=>row.year<=year).map(row=>[row.year,row])).values()];
  const valid=seasons.filter(row=>row.score!==null&&!row.clubGamesShortage);
  const ranked=valid.filter(row=>row.seasonRank?.level===level&&(level==='second'||meetsCareerRegistration(row.honorRegistration)));
  const values=ranked.map(row=>seasonPercentile(row.seasonRank)!);
  const mean=(values:number[])=>values.reduce((sum,n)=>sum+n,0)/values.length;
  const average=values.length?mean(values):null,peak=values.length?mean([...values].sort((a,b)=>b-a).slice(0,5)):null;
  const score=average===null||peak===null?null:.7*average+.3*peak;
  const lines=seasons.flatMap(row=>row.war?[row.war[level]]:[]);
  // Sum actual level WAR. Farm discounts used for first-team equivalence must
  // not make a farm season count as first-team career performance.
  const war=lines.length?seasons.reduce((sum,row)=>{
    const r=row.war?.[level];if(!r)return sum;
    const relief=['중간계투','마무리'].includes(row.role);
    return sum+r.batting+r.fielding+r.positional+r.pitching*(relief?3:1);
  },0):null;
  return {level,score,grade:careerPercentileGrade(score),average,peak,seasons:values.length,war,unranked:valid.filter(row=>!row.seasonRank).length,reconstructed:ranked.filter(row=>row.seasonRank?.basis==='retained-records').length};
}
export function playerCareerEvaluation(p:Player,year=Infinity){
  const rows=p.professional?.assessments??[];
  return {first:evaluateCareer(rows,'first',year),second:evaluateCareer(rows,'second',year)};
}
export function refreshCareerEvaluation(p:Player){
  const rows=p.professional?.assessments;
  if(!rows?.some(row=>row.seasonRank))return;
  for(const row of rows){
    const first=evaluateCareer(rows,'first',row.year);
    // Cumulative fields now represent first-team career quality on a 0–100
    // percentile scale. Second-team grades remain available separately.
    row.cumulative=first.score;row.cumulativeGrade=first.grade;
  }
}
