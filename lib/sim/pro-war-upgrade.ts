import {levelWarValue,proWarRules} from './pro-war';
import {isBullpenSeason,refreshCareerEvaluation} from './pro-career-evaluation';
import {seasonEvaluation} from './pro-season-evaluation';
import {seasonRankGrade} from './pro-season-ranking';
import {rosterGrade} from '../roster-grades';
import type {GameState} from './types';
import type {ProSeasonAssessment} from './pro-types';

// Saved component lines already contain raw league WAR. No game replay or
// invented historical record is necessary to remove the old farm discount.
export function upgradeRawSeasonWar(s:GameState){
  const changedYears=new Set<number>();
  for(const p of s.players)for(const row of p.professional?.assessments??[]){
    if(row.war?.version!==1)continue;
    const wins=row.noAppearances?0:levelWarValue(row.war.first,isBullpenSeason(row))+levelWarValue(row.war.second,isBullpenSeason(row));
    row.war={...row.war,version:2,equivalentWins:wins,score:Math.max(0,Math.min(100,proWarRules.scoreAtZero+proWarRules.scorePerWin*wins))};
    row.seasonEvaluation=seasonEvaluation(row.war);row.score=row.seasonEvaluation.score;
    row.grade=row.noAppearances?'F':row.seasonRank?.grade??rosterGrade(row.score,true);
    if(row.seasonRank)row.seasonRank.war=wins;
    changedYears.add(row.year);
  }
  if(!changedYears.size)return false;
  const pools=new Map<string,ProSeasonAssessment[]>();
  for(const p of s.players)for(const row of p.professional?.assessments??[]){
    if(!changedYears.has(row.year))continue;
    if(row.noAppearances){row.grade='F';delete row.seasonRank;continue;}
    const rank=row.seasonRank;if(!rank)continue;
    const role=['reliever','closer'].includes(rank.role)?'bullpen':rank.role;
    const key=`${row.year}:${rank.level}:${role}`,pool=pools.get(key)??[];
    pool.push(row);pools.set(key,pool);
  }
  for(const rows of pools.values()){
    const incomplete=rows.some(row=>row.seasonRank!.total>rows.length||row.seasonRank!.basis==='retained-records');
    rows.sort((a,b)=>b.seasonRank!.war-a.seasonRank!.war);let rank=1;
    rows.forEach((row,index)=>{
      if(index&&Math.abs(row.seasonRank!.war-rows[index-1].seasonRank!.war)>1e-7)rank=index+1;
      row.seasonRank={...row.seasonRank!,version:2,rank,total:rows.length,grade:seasonRankGrade(rank,rows.length),...(incomplete?{basis:'retained-records' as const}:{})};
      row.grade=row.seasonRank.grade;
    });
  }
  for(const p of s.players)refreshCareerEvaluation(p);
  return true;
}
