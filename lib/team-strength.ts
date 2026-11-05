import { isPitcher, roleFor, roleScore } from "./sim/engine";
import type { GameState, Player } from "./sim/types";
import { startingAssignments } from "./roster-status";

export function teamStrength(players: Player[], teamId: number) {
  const roster = players.filter(p => p.teamId === teamId);
  const assigned = startingAssignments(roster);
  const members = roster.map(player => {
    const slot = assigned.get(player.id);
    const weight = slot ? 1 : 0.5;
    const pitching = slot ? ["SP", "RP", "CP"].includes(slot) : isPitcher(player.primaryRole);
    const score = roleScore(player, slot ? roleFor(slot) : player.primaryRole);
    return { player, slot, weight, pitching, score, contribution: score * weight };
  }).sort((a, b) => b.weight - a.weight || b.score - a.score || a.player.id.localeCompare(b.player.id));
  const average = (rows: typeof members, score: (p: Player, roleValue: number) => number) => {
    const weights = rows.reduce((sum, row) => sum + row.weight, 0);
    return weights ? rows.reduce((sum, row) => sum + score(row.player, row.score) * row.weight, 0) / weights : 0;
  };
  const hitters = members.filter(p => !p.pitching), pitchers = members.filter(p => p.pitching);
  const totalWeight = members.reduce((sum, row) => sum + row.weight, 0);
  return { teamId, members, totalWeight, starters: members.filter(p => p.weight === 1).length,
    overall: average(members, (_, score) => score),
    batting: average(hitters, p => p.stats.contact * 0.4 + p.stats.power * 0.35 + p.stats.speed * 0.25),
    defense: average(hitters, p => p.stats.defense * 0.6 + p.stats.arm * 0.25 + p.stats.bq * 0.15),
    pitching: average(pitchers, (_, score) => score),
  };
}
export function teamRankings(state: Pick<GameState, "teams" | "players">) {
  return state.teams.map(t => ({ ...teamStrength(state.players, t.id), team: t }))
    .sort((a, b) => b.overall - a.overall || a.teamId - b.teamId);
}
