import {careerRegistrationRatio,meetsCareerRegistration,playerCareerEvaluation} from './pro-career-evaluation';
import type {GameState,Player} from './types';

export const retirementHonorRules={rookieSeasons:3,registrationRatio:careerRegistrationRatio,ceremonyTotal:10,ceremonyConsecutive:7,tourTotal:15,tourConsecutive:10,numberA:18,numberS:15} as const;
export function validHonorDays(value:Record<string,number>,maximum:number){
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([club,days])=>/^[0-9]$/.test(club)&&Number.isInteger(days)&&days>=0&&days<=maximum)&&Object.values(value).reduce((sum,n)=>sum+n,0)<=maximum;
}
export function validHonorRegistration(value:{seasonDays:number;firstDaysByClub:Record<string,number>;injuryDaysByClub?:Record<string,number>}){
  return Number.isInteger(value.seasonDays)&&value.seasonDays>=0&&value.seasonDays<=366&&validHonorDays(value.firstDaysByClub,value.seasonDays)&&validHonorDays(value.injuryDaysByClub??{},value.seasonDays)
    &&[...Object.values(value.firstDaysByClub),...Object.values(value.injuryDaysByClub??{})].reduce((sum,n)=>sum+n,0)<=value.seasonDays;
}
export function regularSeasonDays(s:GameState){
  const season=s.calendar.competitions.find(row=>row.id==='pro-first');
  return season?Math.max(0,Math.round((Date.parse(season.endDate)-Date.parse(season.startDate))/86400000)+1):0;
}
export function markHonorInjuryLeave(s:GameState,p:Player,targetTeam:number){
  if(p.professional&&p.teamId>=0&&p.teamId<10&&targetTeam>=10&&targetTeam%10===p.teamId&&p.injury&&s.date<p.injury.unavailableUntil)p.professional.honorInjuryLeave={club:p.teamId,from:s.date};
}
export function recordHonorRegistration(s:GameState,p:Player){
  const pro=p.professional,season=s.calendar.competitions.find(row=>row.id==='pro-first');
  if(!pro||!season||s.date<season.startDate||s.date>season.endDate||pro.employment!=='active'||p.teamId<0)return;
  if(pro.honorUsage?.year!==s.calendar.seasonYear)pro.honorUsage={year:s.calendar.seasonYear,firstDaysByClub:{}};
  const usage=pro.honorUsage!;if(usage.lastDate===s.date)return;usage.lastDate=s.date;
  if(pro.honorInjuryLeave&&(!p.injury||s.date>=p.injury.unavailableUntil||p.teamId<10||p.teamId%10!==pro.honorInjuryLeave.club))delete pro.honorInjuryLeave;
  if(p.teamId<10)usage.firstDaysByClub[p.teamId]=(usage.firstDaysByClub[p.teamId]??0)+1;
  else if(pro.honorInjuryLeave){const days=usage.injuryDaysByClub??={};days[pro.honorInjuryLeave.club]=(days[pro.honorInjuryLeave.club]??0)+1;}
}
export function retirementEligibility(s:GameState,p:Player){
  const pro=p.professional,club=pro?.employment==='active'&&p.teamId>=0?(pro.contract?.club??p.teamId%10):undefined;
  const rows=(pro?.assessments??[]).filter(row=>row.year<=s.calendar.seasonYear);
  const evaluation=playerCareerEvaluation(p,s.calendar.seasonYear).first,score=evaluation.score,grade=evaluation.grade;
  const clubs=new Set<number>();if(pro){if(pro.firstClub>=0)clubs.add(pro.firstClub);for(const row of pro.service)clubs.add(row.club);if(pro.contract)clubs.add(pro.contract.club);for(const row of pro.movements){if(row.from!==null)clubs.add(row.from);if(row.to!==null)clubs.add(row.to);}}
  const years=club===undefined?[]:[...new Set(rows.filter(row=>
    row.year>=(pro?.rookieYear??Infinity)+retirementHonorRules.rookieSeasons&&meetsCareerRegistration(row.honorRegistration,club)
  ).map(row=>row.year))].sort((a,b)=>a-b);
  const stintStart=pro?.service.at(-1)?.from??-Infinity;
  let consecutive=0;for(let i=years.length-1,expected=s.calendar.seasonYear;i>=0&&years[i]===expected&&years[i]>=stintStart;i--,expected--)consecutive++;
  // During a final-season declaration, the most recent completed season ends the streak.
  if(!s.proWorld?.seasonClosed&&years.at(-1)===s.calendar.seasonYear-1){consecutive=0;for(let i=years.length-1,expected=s.calendar.seasonYear-1;i>=0&&years[i]===expected&&years[i]>=stintStart;i--,expected--)consecutive++;}
  const atLeastB=['S','A','B'].includes(grade),atLeastA=['S','A'].includes(grade),seasons=years.length,oneClub=club!==undefined&&clubs.size===1&&clubs.has(club);
  return {club,score,grade,seasons,consecutive,oneClub,
    ceremony:club!==undefined&&atLeastB&&(seasons>=retirementHonorRules.ceremonyTotal||consecutive>=retirementHonorRules.ceremonyConsecutive),
    tour:club!==undefined&&atLeastA&&(seasons>=retirementHonorRules.tourTotal||consecutive>=retirementHonorRules.tourConsecutive),
    retiredNumber:oneClub&&((grade==='S'&&seasons>=retirementHonorRules.numberS)||(atLeastA&&seasons>=retirementHonorRules.numberA))};
}
