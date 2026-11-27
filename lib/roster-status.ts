import { battingAbilityScore, canBatAsDH, pitchingRole, positionLabel,roleFor, roleScore } from "./sim/engine";
import type { GameState,Player, Position } from "./sim/types";
import {currentProPosition,guaranteedProStarter} from "./sim/pro-positions";
import {farmSelectionTier,proGameTeam} from "./sim/pro-farm-roster";
import {proStarterEligible} from './sim/pro-pitching-fatigue';

export const starterSlots: Position[] = ["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH", "SP", "RP", "CP"];
export function startingAssignments(roster: Player[]) {
  const assigned = new Map<string, Position>();
  // Base-ability depth chart: rest/injury affects today's game, not squad status.
  for (const position of starterSlots) {
    if(position==='DH'){
      const best=roster.filter(p=>!p.freshmanReserve&&!assigned.has(p.id)&&canBatAsDH(p))
        .sort((a,b)=>battingAbilityScore(b.stats)-battingAbilityScore(a.stats)||a.id.localeCompare(b.id))[0];
      if(best)assigned.set(best.id,position);
      continue;
    }
    const eligible = roster.filter(p => !p.freshmanReserve && !assigned.has(p.id) && (p.careerMode==="pro"||p.professional?currentProPosition(p,position):p.eligiblePositions.includes(position)));
    const natural = roster.some(p=>p.careerMode) ? [] : eligible.filter(p=>p.position===position);
    const best = (natural.length ? natural : eligible)
      .sort((a, b) => (a.careerMode==="pro"||a.professional?farmSelectionTier(a)-farmSelectionTier(b):0)||roleScore(b, roleFor(position),position) - roleScore(a, roleFor(position),position) || a.id.localeCompare(b.id))[0];
    if (best) assigned.set(best.id, position);
  }
  return assigned;
}
export function rosterAssignments(players: Player[]) {
  const schools = new Map<number, Player[]>();
  for (const p of players) { const team=p.careerMode==="pro"||p.professional?proGameTeam(p):p.teamId;const roster = schools.get(team) ?? []; roster.push(p); schools.set(team, roster); }
  return new Map([...schools.values()].flatMap(roster => [...startingAssignments(roster)]));
}

export type RosterUsage={batting?:string;pitching?:string;pitchingPosition?:Position};
export function rosterPositionLabel(p:Player,usage?:RosterUsage){
  const position=usage?.pitchingPosition;
  if(!position)return positionLabel(p);
  return positionLabel(p.twoWay?{...p,twoWay:{...p.twoWay,pitchingPosition:position}}:{...p,position});
}
// Display-only depth labels. Keep startingAssignments unchanged: it also feeds
// school team strength and jersey assignments, not just the roster screen.
export function rosterUsageLabels(state:GameState,players:Player[]){
  const teams=new Map<number,Player[]>(),labels=new Map<string,RosterUsage>();
  for(const p of players){
    const team=p.careerMode==='pro'||p.professional?proGameTeam(p):p.teamId;
    const roster=teams.get(team)??[];roster.push(p);teams.set(team,roster);
  }
  const set=(id:string,field:'batting'|'pitching',label:string)=>labels.set(id,{...labels.get(id),[field]:label});
  for(const [team,roster] of teams){
    for(const [id,position] of startingAssignments(roster))if(!['SP','RP','CP'].includes(position))set(id,'batting','주전');
    const eligible=roster.filter(p=>!p.freshmanReserve);
    const professional=state.careerMode==='pro';
    const compare=(position:Position)=>(a:Player,b:Player)=>
      (professional?farmSelectionTier(a)-farmSelectionTier(b)||Number(guaranteedProStarter(b,position,state.date))-Number(guaranteedProStarter(a,position,state.date)):0)
      ||roleScore(b,roleFor(position),position)-roleScore(a,roleFor(position),position)||a.id.localeCompare(b.id);
    eligible.filter(p=>pitchingRole(p)==='선발'&&(!professional||proStarterEligible(p))).sort(compare('SP')).slice(0,5)
      .forEach((p,index)=>set(p.id,'pitching',`${index+1}선발`));
    const closers=eligible.filter(p=>pitchingRole(p)==='마무리'||professional&&pitchingRole(p)==='중간계투');
    const designated=professional&&team<10?state.proWorld?.clubs.find(club=>club.id===team)?.closerId:undefined;
    const closer=closers.find(p=>p.id===designated)??closers.sort(compare('CP'))[0];
    if(closer){set(closer.id,'pitching','주전');labels.set(closer.id,{...labels.get(closer.id),pitchingPosition:'CP'});}
  }
  return labels;
}
