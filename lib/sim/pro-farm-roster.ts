import type {GameState,Player} from "./types";

// Registration and the competition played are separate. Third-team players
// can play farm games without being registered in the second team.
export const proGameTeam=(p:Player)=>p.teamId>=20&&p.teamId<30?p.teamId-10:p.teamId;
export const farmSelectionTier=(p:Player)=>p.teamId>=20&&p.teamId<30?1:p.teamId>=30?2:0;
export function farmGameRoster(s:GameState,team:number,developmentalIds:string[]=[]){
  const selected=new Set(developmentalIds),club=team%10;
  return s.players.filter(p=>p.professional?.employment!=="retired"&&p.professional?.employment!=="freeAgent"
    &&(p.teamId===club+10||p.teamId===club+20||p.teamId===club+30&&selected.has(p.id)));
}
