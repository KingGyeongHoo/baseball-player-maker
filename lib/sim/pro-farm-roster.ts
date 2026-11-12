import type {GameState,Player} from "./types";

// Registration and the competition played are separate. Third-team and
// developmental players can play farm games without second-team registration.
export const proGameTeam=(p:Player)=>p.teamId>=20&&p.teamId<40?p.teamId%10+10:p.teamId;
export const farmSelectionTier=(p:Player)=>p.teamId>=20&&p.teamId<30?1:p.teamId>=30?2:0;
export const farmAssignmentPosition=(p:Player)=>p.twoWay?(p.twoWay.nextAssignment==='pitching'?p.twoWay.pitchingPosition:p.twoWay.battingPosition):p.position;
export function farmGameRoster(s:GameState,team:number){
  const club=team%10;
  return s.players.filter(p=>p.professional?.employment!=="retired"&&p.professional?.employment!=="freeAgent"
    &&p.teamId>=10&&p.teamId<40&&p.teamId%10===club);
}
