import type {GameState,Player} from './sim/types';
import {migrateInjuryHistory} from './sim/injury-system';

function reportPlayer(player:Player,date:string){
  if(!player.injury||player.injury.episodeId)return player;
  // A running game can still contain an injury from before history/notifications existed.
  const copy={...player,injury:{...player.injury},injuryHistory:player.injuryHistory?.map(row=>({...row}))};
  migrateInjuryHistory(copy,date);
  return copy;
}

// Recover an unseen current injury, without replaying completed historical injuries.
export function pendingMedicalReport(state:GameState){
  const player=state.players.find(player=>player.id===state.playerId);
  if(!player)return;
  const current=reportPlayer(player,state.date),activeId=current.injury?.episodeId??current.injuryRetirement?.episodeId;
  return current.injuryHistory?.find(row=>row.medicalReportRead===false||row.medicalReportRead===undefined&&row.id===activeId);
}

export function acknowledgeMedicalReport(state:GameState,id:string):GameState{
  if(pendingMedicalReport(state)?.id!==id)return state;
  const current=reportPlayer(state.players.find(player=>player.id===state.playerId)!,state.date);
  return {...state,players:state.players.map(player=>player.id!==state.playerId?player:{...current,
    injuryHistory:current.injuryHistory!.map(row=>row.id===id?{...row,medicalReportRead:true}:row),
  })};
}
