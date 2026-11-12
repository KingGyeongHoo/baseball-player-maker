import type {Player,PlayerHands,Position,Role,Stat} from './types';
import {canPlayPosition} from './position-eligibility';

export const handednessRules={leftThrowChance:.3,switchHitChance:.1,leftPitcherBonus:.05,switchContactMultiplier:1.2} as const;
export function randomPlayerHands(position:Position,random:()=>number):PlayerHands {
  const left=random()<handednessRules.leftThrowChance,batter=random();
  return {throws:left&&canPlayPosition({throws:'L'},position)?'L':'R',bats:batter<handednessRules.switchHitChance?'B':batter<(1+handednessRules.switchHitChance)/2?'L':'R'};
}
export const leftPitcherMultiplier=(p:Pick<Player,'throws'>,role:Role)=>p.throws==='L'&&['선발','중간계투','마무리'].includes(role)?1+handednessRules.leftPitcherBonus:1;
export const handednessGrowth=(p:Pick<Player,'bats'>,key?:Stat)=>p.bats==='B'&&key==='contact'?handednessRules.switchContactMultiplier:1;
export function applySwitchContact(p:Player){if(p.bats==='B')p.stats.contact=Math.min(100,p.stats.contact*handednessRules.switchContactMultiplier);}
