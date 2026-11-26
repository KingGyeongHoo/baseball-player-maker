import { draftAssessment, draftClubs } from "./draft";
import { getPlayer, hash } from "./engine";
import { statKeys, type DevelopmentalOffer, type GameState } from "./types";

export function rejectedDraftOffers(s: GameState): string[] {
  const p=getPlayer(s),pick=s.draft.find(row=>row.playerId===p.id);
  if(s.careerMode||s.phase!=="ended"||p.grade!==3||!s.draftOutcome?.revealed||!pick)return [];
  return draftClubs.filter(club=>club!==pick.club)
    .map(club=>({club,order:hash(`${s.seed}:rejected-draft:${s.calendar.seasonYear}:${p.id}:${club}`)}))
    .sort((a,b)=>a.order-b.order||a.club.localeCompare(b.club)).slice(0,3).map(row=>row.club);
}
export function rejectDraftPick(input: GameState): GameState {
  if(input.careerEvent||input.careerNotice||rejectedDraftOffers(input).length!==3)throw new Error("고3 드래프트 결과를 확인한 뒤 지명을 거부할 수 있습니다.");
  if(input.draftOutcome?.rejected)return input;
  const s=structuredClone(input);
  s.draftOutcome!.rejected=true;
  return s;
}

export function developmentalOffer(s: GameState): DevelopmentalOffer | null {
  const p = getPlayer(s);
  if (s.careerMode || s.phase !== "ended" || p.grade !== 3 || !s.draft.length || s.draft.some(d => d.playerId === p.id)) return null;
  const picked = s.draft.flatMap(pick => {
    const player = s.players.find(other => other.id === pick.playerId);
    return player ? [{pick, score: draftAssessment(player,s.date)}] : [];
  }).sort((a,b) => a.score - b.score || b.pick.overall - a.pick.overall);
  if (!picked.length) return null;
  const tail = picked[0], scoreGap = Math.max(0, tail.score - draftAssessment(p,s.date));
  if (scoreGap <= 2 + 1e-9) return {club:tail.pick.club, reason:"nearCutoff", scoreGap};
  for (const stat of statKeys) {
    const rank = 1 + s.players.filter(other => other.id !== p.id && !other.careerMode && other.stats[stat] > p.stats[stat]).length;
    if (rank <= 5) return {club:tail.pick.club, reason:"topSkill", scoreGap, stat, rank};
  }
  return null;
}
export function revealDraftResult(input: GameState): GameState {
  if (input.phase !== "ended" || input.careerMode) throw new Error("고교 드래프트가 끝난 뒤 결과를 확인할 수 있습니다.");
  if (input.draftOutcome?.revealed) return input;
  const s = structuredClone(input);
  s.draftOutcome = {revealed:true,offer:input.draftOutcome?.offer ?? developmentalOffer(input)};
  return s;
}
