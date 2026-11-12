import type {Player,PlayerHands} from "./sim/types";
import {assertPositionEligible,canPlayPosition} from './sim/position-eligibility';

export const handednessLabel=(p:Pick<Player,"throws"|"bats">)=>`${p.throws==="L"?"좌":"우"}투${p.bats==="B"?"양":p.bats==="L"?"좌":"우"}타`;
export function choosePlayerHands(p:Player,hands?:PlayerHands){
  if(!hands)return;
  if(!["R","L"].includes(hands.throws)||!["R","L","B"].includes(hands.bats))throw new Error("투구 손과 타격 손을 선택해 주세요.");
  assertPositionEligible(hands,p.position);
  if(p.bats!==hands.bats){
    const factor=(hands.bats==='B'?1.2:1)/(p.bats==='B'?1.2:1);
    p.stats.contact=Math.min(100,p.stats.contact*factor);
    p.initialStats.contact=Math.min(100,p.initialStats.contact*factor);
  }
  p.throws=hands.throws;p.bats=hands.bats;
  p.eligiblePositions=p.eligiblePositions.filter(position=>canPlayPosition(p,position));
}
