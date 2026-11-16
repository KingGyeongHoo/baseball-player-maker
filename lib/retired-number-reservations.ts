import {careerSaveId} from './career-save-key';
import {syncJerseyNumbers} from './jersey-numbers';
import type {GameState} from './sim/types';

export type SavedRetiredNumber=NonNullable<GameState['savedRetiredNumbers']>[number];
export function retiredNumberClaims(state:GameState):SavedRetiredNumber[]{
  if(state.proWorld?.stage!=='retired')return [];
  return (state.proWorld.retiredNumbers??[]).filter(row=>row.playerId===state.playerId).map(({club,number,playerId,playerName})=>({saveId:careerSaveId(state),club,number,playerId,playerName}));
}
export function applyRetiredNumberClaims(state:GameState,claims:SavedRetiredNumber[]){
  const next=structuredClone(state),own=careerSaveId(state);
  next.savedRetiredNumbers=claims.filter(row=>row.saveId!==own);
  return syncJerseyNumbers(next);
}
