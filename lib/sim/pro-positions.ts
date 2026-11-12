import type { Player, Position,ProSquad } from "./types";
import type {FaTerms} from "./pro-types";
import {canPlayPosition} from './position-eligibility';
const squadOrder:ProSquad[]=["first","second","third","developmental"];

// Eligibility is a list of positions a player may request, not simultaneous
// competition for every one of those jobs. Two-way roles are explicit jobs.
export function currentProPosition(p: Player, position: Position) {
  return canPlayPosition(p,position)&&(p.position === position || p.twoWay?.battingPosition === position || p.twoWay?.pitchingPosition === position);
}
export function guaranteedProSquad(p:Player,date:string):ProSquad|undefined {
  const contract = p.professional?.contract, terms = contract?.faTerms, year = Number(date.slice(0, 4));
  // An accepted next-year contract already protects offseason registrations.
  // A mistaken demotion must not erase the promise itself.
  return contract&&terms?.starterGuaranteed&&p.professional?.employment==="active"&&p.teamId>=0&&p.teamId%10===contract.club
    &&year<=contract.endYear&&currentProPosition(p,terms.position)?terms.startingLevel:undefined;
}
export function guaranteedProStarter(p: Player, position: Position, date: string) {
  const squad=guaranteedProSquad(p,date);
  return !!squad&&p.professional?.contract?.faTerms?.position===position
    &&Math.floor(p.teamId/10)===squadOrder.indexOf(squad);
}
export function canAssignProSquad(p:Player,level:ProSquad,date:string){
  const promised=guaranteedProSquad(p,date);
  return !promised||squadOrder.indexOf(level)<=squadOrder.indexOf(promised)
    ||p.teamId>=0&&squadOrder.indexOf(level)<Math.floor(p.teamId/10);
}
export function positionRivals(players: Player[], player: Player) {
  return players.filter(p => p.teamId >= 0 && player.teamId >= 0 && p.teamId % 10 === player.teamId % 10
    && p.professional?.employment !== "retired" && currentProPosition(p, player.position));
}
export function validFaTerms(value:unknown):value is FaTerms{
  if(!value||typeof value!=="object")return false;const t=value as FaTerms;
  return ["starter","money","contender","security","rebuild","continuity"].includes(t.plan)
    &&typeof t.title==="string"&&typeof t.description==="string"&&["C","1B","2B","3B","SS","LF","CF","RF","DH","SP","RP","CP"].includes(t.position)
    &&["first","second","third","developmental"].includes(t.startingLevel)&&(t.starterGuaranteed===undefined||typeof t.starterGuaranteed==="boolean")
    &&(t.recentRecord===undefined||Number.isInteger(t.recentRecord.seasons)&&t.recentRecord.seasons>0&&t.recentRecord.seasons<=3
      &&Number.isFinite(t.recentRecord.rank)&&t.recentRecord.rank>=1&&t.recentRecord.rank<=10
      &&Number.isFinite(t.recentRecord.winPercentage)&&t.recentRecord.winPercentage>=0&&t.recentRecord.winPercentage<=1);
}
