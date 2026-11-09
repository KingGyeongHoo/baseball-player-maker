import catalog from "./high-school-catalog.json";
import type { GameState, Team } from "./types";

export const highSchools = catalog.schools;
export function createSchool(id: number): Team {
  const school = highSchools[id];
  if (!school) throw new Error("학교 목록 범위를 벗어났습니다.");
  return { id, name: school.name, shortName: school.name.replace(/고$/, ""),
    schoolPrestige: 100 * (1 - id / (highSchools.length - 1)),
    wins: 0, losses: 0, draws: 0 };
}

// Recruitment changes the distribution, never guarantees an individual outcome.
// Symmetric school offsets preserve the national starting ability average.
export function recruitmentProfile(team?: Team) {
  const prestige = Math.max(0, Math.min(100, team?.schoolPrestige ?? 50));
  return { abilityOffset: (prestige - 50) * .18, talentBias: (prestige - 50) / 62.5 };
}
export function recruitedTalent(roll: number, bias: number) {
  return Math.max(1, Math.min(10, 1 + Math.floor(10 * (roll + bias * roll * (1 - roll)))));
}

// Called before resetting records and removing graduating seniors.
export function updateSchoolPrestige(s: GameState, draft: GameState["draft"] = s.draft) {
  if (s.careerMode) return;
  const picked = new Set(draft.map(p => p.playerId));
  for (const team of s.teams) {
    if (team.schoolPrestige === undefined) continue;
    const played = team.wins + team.losses + team.draws;
    if (!played) continue;
    const seniors = s.players.filter(p => p.teamId === team.id && p.grade === 3);
    const drafted = seniors.filter(p => picked.has(p.id)).length;
    const results = 100 * (team.wins + .5 * team.draws) / played;
    const draftRecord = Math.min(100, drafted * 25);
    team.schoolPrestige = Math.max(0, Math.min(100, team.schoolPrestige * .8 + results * .15 + draftRecord * .05));
  }
}
