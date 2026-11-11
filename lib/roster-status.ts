import { roleFor, roleScore } from "./sim/engine";
import type { Player, Position } from "./sim/types";
import {currentProPosition} from "./sim/pro-positions";
import {farmSelectionTier,proGameTeam} from "./sim/pro-farm-roster";

export const starterSlots: Position[] = ["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH", "SP", "RP", "CP"];
export function startingAssignments(roster: Player[]) {
  const assigned = new Map<string, Position>();
  // Base-ability depth chart: rest/injury affects today's game, not squad status.
  for (const position of starterSlots) {
    const eligible = roster.filter(p => !p.freshmanReserve && !assigned.has(p.id) && (p.careerMode==="pro"||p.professional?currentProPosition(p,position):p.eligiblePositions.includes(position)));
    const natural = roster.some(p=>p.careerMode) ? [] : eligible.filter(p=>p.position===position);
    const best = (natural.length ? natural : eligible)
      .sort((a, b) => (a.careerMode==="pro"||a.professional?farmSelectionTier(a)-farmSelectionTier(b):0)||roleScore(b, roleFor(position)) - roleScore(a, roleFor(position)) || a.id.localeCompare(b.id))[0];
    if (best) assigned.set(best.id, position);
  }
  return assigned;
}
export function rosterAssignments(players: Player[]) {
  const schools = new Map<number, Player[]>();
  for (const p of players) { const team=p.careerMode==="pro"||p.professional?proGameTeam(p):p.teamId;const roster = schools.get(team) ?? []; roster.push(p); schools.set(team, roster); }
  return new Map([...schools.values()].flatMap(roster => [...startingAssignments(roster)]));
}
