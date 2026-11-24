import type {GameState} from './types';
import type {ProSeasonArchive} from './pro-types';

export function seasonAwardsPublished(state:GameState,season:Pick<ProSeasonArchive,'year'|'awardsCeremony'>){
  if(season.awardsCeremony)return !!season.awardsCeremony.presentedAt;
  return season.year<state.calendar.seasonYear||state.proWorld?.stage==='retired';
}
