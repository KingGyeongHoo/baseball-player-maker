import type {DraftPick,GameState} from './sim/types';
import {compactNationalTournament} from './sim/national-storage';

// Reports are optional presentation snapshots. Keep the user's observations,
// and leave every player's records, contracts, skills and RNG inputs intact.
export function compactCareerState(state:GameState):GameState{
  const playerId=state.playerId;
  const picks=(rows:DraftPick[])=>rows.map(pick=>{
    if(pick.playerId===playerId||!pick.scoutingReport)return pick;
    const copy={...pick};delete copy.scoutingReport;return copy;
  });
  const players=state.players.map(p=>{
    if(p.id===playerId)return p;
    const copy={...p};delete copy.evaluationHistory;
    copy.career=p.career.map(row=>{
      if(row.year>=state.calendar.seasonYear)return row;
      const final={...row};
      // Keep the final totals and level splits. A legacy professional season
      // still needs its tools until its annual assessment has been recovered.
      if(row.careerMode!=='pro'||p.professional?.assessments?.some(a=>a.year===row.year))delete final.stats;
      delete final.byClub;delete final.spring;
      return final;
    });
    return copy;
  });
  const contexts=new Set(players.find(p=>p.id===playerId)?.evaluationHistory?.map(row=>row.contextId)??[]);
  return {...state,players,draft:picks(state.draft),
    ...(state.nationalTeams?{nationalTeams:state.nationalTeams.map(entry=>entry.tournament?{...entry,tournament:compactNationalTournament(entry.tournament)}:entry)}:{}),
    ...(state.postSchool?.collegeDraft?{postSchool:{...state.postSchool,collegeDraft:picks(state.postSchool.collegeDraft)}}:{}),
    ...(state.proWorld?{proWorld:{...state.proWorld,seasons:state.proWorld.seasons.map(season=>({...season,draft:picks(season.draft)}))}}:{}),
    ...(state.evaluationSystem?{evaluationSystem:{...state.evaluationSystem,contexts:state.evaluationSystem.contexts.filter(row=>contexts.has(row.id))}}:{})};
}
