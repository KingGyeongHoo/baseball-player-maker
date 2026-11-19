import {rosterGrade} from '../roster-grades';
import type {GameState} from './types';
import type {ProSeasonEvaluation,ProWarAssessment} from './pro-types';
import {refreshCareerEvaluation} from './pro-career-evaluation';

const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const regularScore=(wins:number)=>71+(wins>=0?3:2)*wins;

export function seasonEvaluation(war:ProWarAssessment):ProSeasonEvaluation{
  const regular=regularScore(war.equivalentWins);
  return {version:1,regular,postseason:0,national:0,honors:0,score:clamp(regular,0,100)};
}

export function validSeasonEvaluation(v:unknown,war:ProWarAssessment,score:number|null):v is ProSeasonEvaluation{
  if(!v||typeof v!=='object')return false;
  const row=v as ProSeasonEvaluation;
  return row.version===1&&[row.regular,row.postseason,row.national,row.honors,row.score].every(Number.isFinite)
    &&Math.abs(row.regular-regularScore(war.equivalentWins))<1e-7
    &&row.postseason>=-3&&row.postseason<=3&&row.national>=-2&&row.national<=3&&row.honors>=0&&row.honors<=8
    &&Math.abs(row.score-clamp(row.regular+row.postseason+row.national+row.honors,0,100))<1e-7
    &&score!==null&&Math.abs(score-row.score)<1e-7;
}

// Recalculate the current snapshot when opening a save with the earlier scoring rules.
// Existing saves can still decode archived versions with award bonuses.
export function refreshSeasonEvaluations(s:GameState,year=s.calendar.seasonYear){
  if(year!==s.calendar.seasonYear)return;

  for(const p of s.players){
    const rows=p.professional?.assessments;
    const row=rows?.find(row=>row.year===year);
    if(!row?.war||row.score===null)continue;
    row.seasonEvaluation=seasonEvaluation(row.war);
    row.score=row.seasonEvaluation.score;row.grade=row.seasonRank?.grade??rosterGrade(row.score,true);
    let total=0,count=0;
    for(const assessment of [...rows!].sort((a,b)=>a.year-b.year)){
      if(assessment.score!==null&&!assessment.clubGamesShortage){total+=assessment.score;count++;}
      assessment.cumulative=count?total/count:null;
      assessment.cumulativeGrade=rosterGrade(assessment.cumulative,true);
    }
    refreshCareerEvaluation(p);
  }
}
