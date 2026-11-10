import type {Player,PlayerHands} from "./sim/types";

export const handednessLabel=(p:Pick<Player,"throws"|"bats">)=>`${p.throws==="L"?"좌":"우"}투${p.bats==="L"?"좌":"우"}타`;
export function choosePlayerHands(p:Player,hands:PlayerHands={throws:"R",bats:"R"}){
  if(!["R","L"].includes(hands.throws)||!["R","L"].includes(hands.bats))throw new Error("투구 손과 타격 손을 선택해 주세요.");
  p.throws=hands.throws;p.bats=hands.bats;
}
