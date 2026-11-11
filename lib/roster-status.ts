import { roleFor, roleScore } from "./sim/engine";
import type { Player, Position } from "./sim/types";

export const starterSlots: Position[] = ["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH", "SP", "RP", "CP"];
export function startingAssignments(roster: Player[]) {
  const assigned = new Map<string, Position>();
  // Base-ability depth chart: rest/injury affects today's game, not squad status.
  for (const position of starterSlots) {
    const eligible = roster.filter(p => !p.freshmanReserve && !assigned.has(p.id) && p.eligiblePositions.includes(position));
    const natural = roster.some(p=>p.careerMode) ? [] : eligible.filter(p=>position==="RP"||position==="CP"?p.position==="RP"||p.position==="CP":p.position===position);
    const best = (natural.length ? natural : eligible)
      .sort((a, b) => roleScore(b, roleFor(position)) - roleScore(a, roleFor(position)) || a.id.localeCompare(b.id))[0];
    if (best) assigned.set(best.id, position);
  }
  return assigned;
}
export function rosterAssignments(players: Player[]) {
  const schools = new Map<number, Player[]>();
  for (const p of players) { const roster = schools.get(p.teamId) ?? []; roster.push(p); schools.set(p.teamId, roster); }
  return new Map([...schools.values()].flatMap(roster => [...startingAssignments(roster)]));
}
