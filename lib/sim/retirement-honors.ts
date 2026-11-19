import {careerRegistrationRatio,meetsCareerRegistration,playerCareerEvaluation} from './pro-career-evaluation';
import {individualTitleFromKind,individualTitleName} from './pro-individual-awards';
import {levelWarValue} from './pro-war';
import {proTeamName} from './club-names';
import type {ProfessionalPlayer,ProSeasonAssessment} from './pro-types';
import type {GameState,Player} from './types';

export const retirementHonorRules={rookieSeasons:3,registrationRatio:careerRegistrationRatio,ceremonyTotal:10,ceremonyConsecutive:7,tourTotal:15,tourConsecutive:10,numberConsecutive:10,numberAfterTrade:13,numberWar:40,numberScore:50} as const;
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

function recordedClubWar(p:Player,row:ProSeasonAssessment,club:number){
  if(row.firstWarByClub)return row.firstWarByClub[club]??0;
  if(!row.war)return 0;
  const history=p.career.find(record=>record.careerMode==='pro'&&record.year===row.year);
  const registration=Object.entries(row.honorRegistration?.firstDaysByClub??{}).filter(([,days])=>days>0).map(([id])=>Number(id));
  const stints=p.professional!.service.filter(stint=>stint.from<=row.year&&row.year<=stint.to).map(stint=>stint.club);
  const recordedClub=registration.length===1?registration[0]:history?.schoolId!==undefined&&history.schoolId>=0?history.schoolId%10:undefined;
  const possibleClubs=new Set([...registration,...stints,...(recordedClub===undefined?[]:[recordedClub])]);
  // The season-level WAR in old saves cannot be split after a midseason trade.
  const inSeasonTrade=p.professional!.movements.some(move=>move.from!==null&&move.to!==null&&move.from!==move.to&&move.date.startsWith(`${row.year}-`)&&move.date.slice(5,7)>='03'&&move.date.slice(5,7)<='10');
  if(possibleClubs.size!==1||!possibleClubs.has(club)||inSeasonTrade)return 0;
  return levelWarValue(row.war.first,['불펜','중간계투','마무리'].includes(row.role)||['bullpen','reliever','closer'].includes(row.seasonRank?.role??''));
}

function meetsRetiredNumberService(pro:ProfessionalPlayer,club:number,years:number[]){
  const {numberConsecutive,numberAfterTrade}=retirementHonorRules;
  if(years.length<numberConsecutive)return false;
  const consecutive=pro.service.some(stint=>stint.club===club&&years.some((year,index)=>
    year>=stint.from&&year+numberConsecutive-1<=stint.to&&years[index+numberConsecutive-1]===year+numberConsecutive-1
  ));
  if(consecutive)return true;
  if(years.length<numberAfterTrade)return false;

  const departures=pro.movements.filter(move=>{
    const year=Number(move.date.slice(0,4));
    return move.from===club&&move.to!==club&&year>=years[0]&&year<years.at(-1)!;
  });
  // A departure can link separate stints only when the club traded the player away.
  return departures.length>0&&departures.every(move=>move.kind==='트레이드'&&move.to!==null&&!move.requestedTrade);
}

function retiredNumberCriteria(s:GameState,p:Player,rows:ProSeasonAssessment[],club:number,seasons:number){
  const clubWar=rows.reduce((sum,row)=>sum+recordedClubWar(p,row,club),0);
  const bonuses=new Map<number,number>();
  const add=(year:number,tenths:number)=>bonuses.set(year,(bonuses.get(year)??0)+tenths);
  for(const season of s.proWorld?.seasons??[]){
    if(season.year>s.calendar.seasonYear)continue;
    const awards=season.awards.filter(award=>award.club===club&&award.playerId===p.id&&award.level!=='second');
    if(awards.some(award=>award.category==='mvp'||!award.category&&award.kind==='시즌 MVP'))add(season.year,10);
    if(awards.some(award=>award.category==='goldGlove'||!award.category&&award.kind.startsWith('골든글러브')))add(season.year,5);
    const titles=new Set(awards.flatMap(award=>{const title=individualTitleFromKind(award.kind);return title?[title]:[];}));
    for(const award of season.individualAwards??[]){
      if(award.level!=='first'||!award.winners.some(winner=>winner.playerId===p.id&&winner.club===club))continue;
      const title=individualTitleName(award);
      if(title)titles.add(title);
    }
    add(season.year,5*titles.size);
  }
  const nationalKinds=new Set<string>();
  for(const entry of s.nationalTeams??[]){
    if(entry.kind==='youth'||entry.year>s.calendar.seasonYear)continue;
    const member=entry.roster.find(row=>row.id===p.id);
    const matchesClub=member&&(member.club!==undefined?member.club===club:member.team.replace(/ (?:1군|2군|잔류군\(3군\)|육성선수)$/,'')===proTeamName(club));
    const key=`${entry.year}:${entry.kind}`;
    if(matchesClub&&!nationalKinds.has(key)){nationalKinds.add(key);add(entry.year,2);}
  }
  const awardBonus=[...bonuses.values()].reduce((sum,tenths)=>sum+Math.min(30,tenths),0)/10;
  return {clubWar,awardBonus,seasons};
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
  const criteria=club===undefined||!pro||!meetsRetiredNumberService(pro,club,years)?undefined:retiredNumberCriteria(s,p,rows,club,seasons);
  return {club,score,grade,seasons,consecutive,oneClub,criteria,
    ceremony:club!==undefined&&atLeastB&&(seasons>=retirementHonorRules.ceremonyTotal||consecutive>=retirementHonorRules.ceremonyConsecutive),
    tour:club!==undefined&&atLeastA&&(seasons>=retirementHonorRules.tourTotal||consecutive>=retirementHonorRules.tourConsecutive),
    retiredNumber:!!criteria&&criteria.clubWar+1e-9>=retirementHonorRules.numberWar&&criteria.clubWar+criteria.awardBonus+1e-9>=retirementHonorRules.numberScore};
}
