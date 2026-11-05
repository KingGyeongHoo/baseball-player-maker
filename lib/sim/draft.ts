import { combinedOvr, isPitcher, params, random, reputationScore, roleFor, roleScore, roles } from "./engine";
import type { DraftPick, GameState, Player, Role } from "./types";

export const draftBoard = (players: Player[]) => players.filter(p => p.grade === 3)
  .sort((a, b) => combinedOvr(b) - combinedOvr(a) || roleScore(b) - roleScore(a) || a.id.localeCompare(b.id));
export const draftClubs = ["서울 파이오니어스", "부산 웨이브스", "인천 마리너스", "대구 레드윙스", "광주 타이탄스", "대전 스파크스", "수원 위저즈", "창원 다이노스", "청주 이글스", "전주 라이온스"];
// Compare prospects using identical neutral club demand, without consuming RNG.
export function draftAssessment(p: Player) {
  const talent = p.talent[isPitcher(p.primaryRole) ? "pitching" : "batting"];
  const fit = params["draft.fit_role_weight"] * roleScore(p) + params["draft.fit_need_weight"] * 50;
  return params["draft.reputation_weight"] * (p.reputation ?? reputationScore(p))
    + params["draft.talent_weight"] * (talent - 1) / 9 * 100 + params["draft.fit_weight"] * fit;
}
function draftSlots(s: GameState) {
  const total = params["draft.min_total"] + Math.floor(random(s, "draft") * (params["draft.max_total"] - params["draft.min_total"] + 1));
  const counts = draftClubs.map(() => params["draft.min_rounds"]);
  for (let extra = total - counts.reduce((sum, n) => sum + n, 0); extra > 0; extra--) {
    const active = counts.map((n, i) => n < params["draft.max_rounds"] ? i : -1).filter(i => i >= 0);
    counts[active[Math.floor(random(s, "draft") * active.length)]]++;
  }
  return Array.from({ length: Math.max(...counts) }, (_, index) => index + 1)
    .flatMap(round => draftClubs.flatMap((_, club) => counts[club] >= round ? [{ round, club }] : []));
}
function selectDraft(s: GameState, limit = Infinity): DraftPick[] {
  const candidates = draftBoard(s.players);
  const ranks = new Map(candidates.map((p, i) => [p.id, i + 1]));
  const selected = new Set<string>();
  const needs = draftClubs.map(() => Object.fromEntries(roles.map(role => [role, random(s, "draft")]))) as Record<Role, number>[];
  const slots = draftSlots(s).slice(0, Math.min(limit, candidates.length));
  const picks: DraftPick[] = [];
  for (const { round, club } of slots) {
    const remaining = candidates.filter(p => !selected.has(p.id));
    const best = remaining.map(p => {
      const qualified = [...new Set(p.eligiblePositions.map(roleFor))].filter(role => isPitcher(role) === isPitcher(p.primaryRole));
      return qualified.map(role => {
        const ability = combinedOvr(p);
        const talent = p.talent[isPitcher(role) ? "pitching" : "batting"];
        const reputation = p.reputation ?? reputationScore(p);
        const fit = params["draft.fit_role_weight"] * roleScore(p, role) + params["draft.fit_need_weight"] * needs[club][role] * 100;
        const components = {
          talent: params["draft.talent_weight"] * (talent - 1) / 9 * 100,
          reputation: params["draft.reputation_weight"] * reputation,
          fit: params["draft.fit_weight"] * fit,
        };
        const score = Object.values(components).reduce((sum, points) => sum + points, 0);
        return {
          p,
          role,
          ability,
          talent,
          reputation,
          fit,
          components,
          score
        };
      }).sort((a, b) => b.score - a.score || b.ability - a.ability || b.talent - a.talent || a.p.id.localeCompare(b.p.id))[0];
    }).sort((a, b) => b.score - a.score || b.ability - a.ability || b.talent - a.talent || a.p.id.localeCompare(b.p.id))[0];
    selected.add(best.p.id);
    needs[club][best.role] = Math.max(0, needs[club][best.role] - params["draft.need_decay"]);
    picks.push({
      playerId: best.p.id,
      playerName: best.p.name,
      teamName: s.teams[best.p.teamId].name,
      club: draftClubs[club],
      overall: picks.length + 1,
      round,
      slot: club + 1,
      role: best.role,
      score: best.score,
      ability: best.ability,
      abilityRank: ranks.get(best.p.id)!,
      reputation: best.reputation,
      talent: best.talent,
      fit: best.fit,
      components: best.components,
    });
  }
  return picks;
}
export const draftPlayers = (s: GameState) => selectDraft(s);
export const draftProjection = (s: GameState) => selectDraft({ ...s, rngStates: { ...s.rngStates } });
// The same selection model evaluated at today's abilities/reputation. Reading
// the forecast never consumes the live draft stream or writes future results.
export const draftForecast = (s: GameState) => selectDraft({ ...s, rngStates: { ...s.rngStates } }, 10);
