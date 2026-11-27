import {assignRole,isPitcher,roleFor,roleScore} from './engine';
import type {Player,Position} from './types';

export const schoolPitchingRoleRules={annualMinimumAdvantage:2};
const pitchingPositions=['SP','RP','CP'] as const;

// Entry has no ability floor: every school pitcher needs a role. Later reviews
// keep the current role unless another role is clearly better. No random draws.
export function assignSchoolPitchingRole(p:Player,entry=false){
  if(p.careerMode||p.professional)return;
  const previous=p.twoWay?.pitchingPosition??p.position;
  if(!pitchingPositions.some(position=>position===previous))return;
  const scores=pitchingPositions.map(position=>({position,score:roleScore(p,roleFor(position),position)}));
  const current=scores.find(row=>row.position===previous)!;
  const best=scores.reduce((best,row)=>row.score>best.score?row:best,current);
  const position:Position=entry||best.score>=current.score+schoolPitchingRoleRules.annualMinimumAdvantage?best.position:previous;
  if(position!==previous){
    if(p.twoWay&&!isPitcher(p.primaryRole)){
      p.twoWay.pitchingPosition=position;
      p.eligiblePositions=[...new Set([...p.eligiblePositions,position])];
    }else assignRole(p,roleFor(position));
  }
  if(p.roleOffer&&isPitcher(p.roleOffer)){p.roleOffer=null;p.offerCandidate=null;p.offerWeeks=0;}
  return {previous,position,changed:position!==previous};
}
