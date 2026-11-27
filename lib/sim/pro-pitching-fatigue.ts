import type {Player} from './types';
import {equipmentStats} from './offseason-shop';

export const proPitchingFatigueRules={
  minimumStarterStamina:50,starterLimit:80,relieverLimit:20,
  fatigueAt50:1.6,fatigueAt100:.4,continuationRatio:.3,recoveryPerPoint:.4,
};
export const proStarterEligible=(p:Player)=>equipmentStats(p).stamina>=proPitchingFatigueRules.minimumStarterStamina;
export const proDailyRecovery=(recovery:number)=>Math.max(0,Math.min(100,recovery))*proPitchingFatigueRules.recoveryPerPoint;
export const proPitcherCollapsed=(starter:boolean,runs:number,batters:number)=>runs>=(starter?4:2)&&batters>=(starter?12:5);
export function proPitchFatigueRate(stamina:number,multiplier=1){
  const r=proPitchingFatigueRules,s=Math.max(0,Math.min(100,stamina));
  return (r.fatigueAt50+(s-50)*(r.fatigueAt100-r.fatigueAt50)/50)*multiplier;
}
// The game resolves plate appearances, not individual pitches. A separate
// seeded roll estimates pitch count without consuming the outcome RNG stream.
export function estimatedProPitches(result:'walk'|'strikeout'|'inPlay',control:number,roll:number){
  const minimum=result==='walk'?4:result==='strikeout'?3:1;
  const spread=result==='inPlay'?5:4;
  const extra=roll>.92?2:0,command=control<40?1:control>=80?-1:0;
  return Math.max(minimum,minimum+Math.floor(roll*spread)+extra+command);
}
export type ProPitchStint={rate:number;budget:number;inningPitches:number;mustExit:boolean};
export type ProPitchWorkload={version:1;stints:Record<string,ProPitchStint>};
export function proPitchStint(fatigue:number,rate:number,starter:boolean):ProPitchStint{
  const limit=starter?proPitchingFatigueRules.starterLimit:proPitchingFatigueRules.relieverLimit;
  return {rate,budget:Math.max(0,Math.floor((limit-fatigue)/rate+1e-9)),inningPitches:0,mustExit:false};
}
export function finishProPitchingInning(stint:ProPitchStint,starter:boolean){
  if(!starter)stint.mustExit=stint.inningPitches>stint.budget*proPitchingFatigueRules.continuationRatio+1e-9;
  stint.inningPitches=0;
}
export function validProPitchWorkload(value:unknown):value is ProPitchWorkload{
  if(!value||typeof value!=='object')return false;
  const w=value as ProPitchWorkload;
  return w.version===1&&!!w.stints&&typeof w.stints==='object'&&!Array.isArray(w.stints)&&Object.values(w.stints).every(row=>
    !!row&&Number.isFinite(row.rate)&&row.rate>0&&Number.isInteger(row.budget)&&row.budget>=0
    &&Number.isInteger(row.inningPitches)&&row.inningPitches>=0&&typeof row.mustExit==='boolean');
}
