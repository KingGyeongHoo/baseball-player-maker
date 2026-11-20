import {careerSaveId} from './career-save-key';
import type {GameState} from './sim/types';

export function careerSaveCheckpoint(state:GameState){
  return {id:careerSaveId(state),year:state.calendar.seasonYear,mode:state.careerMode,stage:state.proWorld?.stage};
}
export function shouldAutoSaveCareer(previous:ReturnType<typeof careerSaveCheckpoint>|null,state:GameState){
  const next=careerSaveCheckpoint(state);
  if(!previous||previous.id!==next.id||next.year<=previous.year)return false;
  return next.mode==='pro'?next.stage==='camp':previous.mode===next.mode;
}
