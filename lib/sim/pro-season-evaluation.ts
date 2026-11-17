import {emptyRecord} from './engine';
import {rosterGrade} from '../roster-grades';
import {individualTitleName} from './pro-individual-awards';
import {createProWarContext,proWarAssessment,type ProWarContext} from './pro-war';
import type {GameState,Player,RecordLine} from './types';
import type {ProSeasonEvaluation,ProWarAssessment} from './pro-types';
import {refreshCareerEvaluation} from './pro-career-evaluation';

const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const played=(r?:RecordLine)=>!!r&&(r.batting.PA>0||r.pitching.BF>0);
const regularScore=(wins:number)=>71+(wins>=0?3:2)*wins;
export const seasonEvaluationRules={scoreAtZero:71,scorePerWin:3,postseasonCap:3,nationalCap:3,honorsCap:8} as const;

// Keep the saved WAR v1 formula stable; the annual grade has its own scale
// and includes only this year's actual games and official achievements.
export function seasonEvaluation(s:GameState,p:Player,war:ProWarAssessment,context:ProWarContext,year=s.calendar.seasonYear):ProSeasonEvaluation{
  const history=p.career.find(row=>row.year===year&&row.careerMode==='pro');
  const current=year===s.calendar.seasonYear;
  const post=current?p.seasonPostseason:history?.postseason;
  const farm=current?p.seasonFarmPostseason:history?.farmPostseason;
  const extraWins=(first?:RecordLine,second?:RecordLine)=>proWarAssessment({...p,seasonByLevel:{first:first??emptyRecord(),second:second??emptyRecord()}},context).equivalentWins;
  const postseason=clamp(3*extraWins(post,farm),-3,3);
  let nationalWins=0,nationalEvents=0,nationalAwards=0;
  const tournaments=new Set<string>();
  for(const entry of s.nationalTeams??[]){
    const key=`${entry.year}:${entry.kind}`;
    if(entry.year!==year||entry.kind==='youth'||tournaments.has(key))continue;
    tournaments.add(key);
    const member=entry.tournament?.countries?.[0]?.players?.find(row=>row.sourceId===p.id||row.id===p.id);
    if(!member||p.id===s.playerId&&entry.participated===false)continue;
    // Completed roster participation is an achievement even in a legacy
    // tournament consisting of forfeits. Never invent missing playing stats.
    if(!played(member.records)&&!entry.tournament?.finished)continue;
    nationalEvents++;
    if(!played(member.records))continue;
    nationalWins+=proWarAssessment({...p,position:member.position,twoWay:undefined,seasonByLevel:{first:member.records,second:emptyRecord()}},context).equivalentWins;
    for(const award of entry.tournament?.awards??[])if(award.id===member.id)nationalAwards+=award.title==='MVP'?1:.5;
  }
  const national=clamp(3*nationalWins+Math.min(1,nationalEvents*.5),-2,3);
  const archive=s.proWorld?.seasons.find(row=>row.year===year);
  const announced=!!archive&&(!archive.awardsCeremony||!!archive.awardsCeremony.presentedAt);
  const seen=new Set<string>();
  let awards=0,titles=0,allstar=0;
  const addAward=(award:NonNullable<typeof archive>['awards'][number])=>{
    if(award.playerId!==p.id||award.year!==year||!award.category)return;
    if(award.category!=='seriesMvp'&&!announced)return;
    const key=`${award.level??'first'}:${award.category}:${award.category==='seriesMvp'?award.seriesId??award.series:''}:${award.position??''}`;
    if(seen.has(key))return;seen.add(key);
    awards+=({mvp:3,goldGlove:2,rookie:2,seriesMvp:1}[award.category])*(award.level==='second'?.5:1);
  };
  for(const award of archive?.awards??[])addAward(award);
  if(current)for(const series of [...s.proWorld?.postseason?.series??[],...s.proWorld?.farmPostseason?.series??[]])if(series.mvp)addAward(series.mvp);
  if(announced)for(const title of archive.individualAwards??[]){
    const key=`title:${title.level}:${title.field}:${title.metric}`;
    if(!individualTitleName(title)||seen.has(key)||!title.winners.some(row=>row.playerId===p.id))continue;
    seen.add(key);titles+=title.level==='second'?.5:1;
  }
  for(const selection of p.professional?.allstarHistory??[])if(selection.year===year){
    const key=`allstar:${selection.level}`;
    if(!seen.has(key)){seen.add(key);allstar+=selection.level==='second'?.5:1;}
    if(selection.mvp&&!seen.has(`${key}:mvp`)){seen.add(`${key}:mvp`);allstar+=selection.level==='second'?.5:1;}
  }
  const honors=clamp(awards+Math.min(3,titles)+allstar+Math.min(2,nationalAwards),0,8);
  const regular=regularScore(war.equivalentWins);
  return {version:1,regular,postseason,national,honors,score:clamp(regular+postseason+national+honors,0,100)};
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

// November internationals and December awards settle after the regular season.
// Refresh the same row rather than creating another season or career bonus.
export function refreshSeasonEvaluations(s:GameState,year=s.calendar.seasonYear){
  if(year!==s.calendar.seasonYear)return;
  const context=createProWarContext(s);
  for(const p of s.players){
    const rows=p.professional?.assessments;
    const row=rows?.find(row=>row.year===year);
    if(!row?.war||row.score===null)continue;
    row.seasonEvaluation=seasonEvaluation(s,p,row.war,context,year);
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
