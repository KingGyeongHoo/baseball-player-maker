import { hash, overall, isPitcher, params, random, reputationScore, roleFor, roleScore, roles } from "./engine";
import type { DraftPick, GameState, Player, Role,Position } from "./types";
import {organizationMinimum} from "./pro-roster";
import {createScoutingReport} from "./scouting-report";
import {buildEvaluationContext,createPlayerEvaluation} from "./player-evaluation";
import {proClubNames} from "./club-names";

export const draftBoard = (players: Player[]) => players.filter(p => p.grade === 3)
  .sort((a, b) => overall(b) - overall(a) || roleScore(b) - roleScore(a) || a.id.localeCompare(b.id));
export const draftClubs = proClubNames;
export function draftClubOrder(s:Pick<GameState,"seed"|"calendar"|"rngStates"|"careerMode">) {
  const order=draftClubs.map((_,index)=>index);
  // Pro rookie classes already map this base order to the previous standings.
  if(s.careerMode)return order;
  const source={rngStates:{...s.rngStates,draft:hash(`${s.seed}:draft-order:${s.calendar.seasonYear}`)}};
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random(source,"draft")*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  return order;
}
// Compare prospects using identical neutral club demand, without consuming RNG.
export function draftAssessment(p: Player) {
  const talent = p.talent[isPitcher(p.primaryRole) ? "pitching" : "batting"];
  const fit = params["draft.fit_role_weight"] * roleScore(p) + params["draft.fit_need_weight"] * 50;
  return params["draft.reputation_weight"] * (p.reputation ?? reputationScore(p) ?? 0)
    + params["draft.talent_weight"] * (talent - 1) / 9 * 100 + params["draft.fit_weight"] * fit;
}
export type DraftClubContext={roster:Player[];order?:number[]};
function draftSlots(s: GameState,clubOrder?:number[]) {
  const order=clubOrder??draftClubOrder(s);
  const total = params["draft.min_total"] + Math.floor(random(s, "draft") * (params["draft.max_total"] - params["draft.min_total"] + 1));
  const counts = draftClubs.map(() => params["draft.min_rounds"]);
  for (let extra = total - counts.reduce((sum, n) => sum + n, 0); extra > 0; extra--) {
    const active = counts.map((n, i) => n < params["draft.max_rounds"] ? i : -1).filter(i => i >= 0);
    counts[active[Math.floor(random(s, "draft") * active.length)]]++;
  }
  return Array.from({ length: Math.max(...counts) }, (_, index) => index + 1)
    .flatMap(round => order.flatMap((club,index) => counts[club] >= round ? [{ round, club,slot:index+1 }] : []));
}
function selectDraft(s: GameState, limit = Infinity,clubContext?:DraftClubContext): DraftPick[] {
  const evaluationState=s.careerMode?{...s,careerMode:undefined,calendar:{...s.calendar,seasonYear:Math.min(s.calendar.seasonYear,Number(s.date.slice(0,4)))}}:s;
  const evaluationContext=buildEvaluationContext(evaluationState);
  const candidates = draftBoard(s.players);
  const ranks = new Map(candidates.map((p, i) => [p.id, i + 1]));
  const selected = new Set<string>();
  const needs = draftClubs.map(() => Object.fromEntries(roles.map(role => [role, clubContext ? 0.5 : random(s, "draft")]))) as Record<Role, number>[];
  const counts=draftClubs.map((_,club)=>{
    const roster=clubContext?.roster.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==="active")??[];
    return Object.fromEntries((["C","1B","2B","3B","SS","LF","CF","RF","DH","SP","RP","CP"] as Position[]).map(pos=>[pos,roster.filter(p=>p.position===pos).length])) as Record<Position,number>;
  });
  const targets=draftClubs.map((_,club)=>Object.fromEntries(Object.keys(counts[club]).map(pos=>[pos,organizationMinimum(s.seed,club,pos as Position)])) as Record<Position,number>);
  const demand=(club:number,position:Position)=>Math.max(0,targets[club][position]-counts[club][position]);
  const slots = draftSlots(s,clubContext?.order).slice(0, Math.min(limit, candidates.length));
  const picks: DraftPick[] = [];
  for (const { round, club,slot } of slots) {
    const remaining = candidates.filter(p => !selected.has(p.id));
    const best = remaining.map(p => {
      const qualified = clubContext?[roleFor(p.position)]:[...new Set(p.eligiblePositions.map(roleFor))].filter(role => isPitcher(role) === isPitcher(p.primaryRole));
      return qualified.map(role => {
        const ability = overall(p);
        const talent = p.talent[isPitcher(role) ? "pitching" : "batting"];
        const reputation = p.reputation ?? reputationScore(p) ?? 0;
        const need=clubContext?Math.min(1,.35+demand(club,p.position)/Math.max(1,targets[club][p.position])):needs[club][role];
        const fit = params["draft.fit_role_weight"] * roleScore(p, role) + params["draft.fit_need_weight"] * need * 100;
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
          score,
          needTier:clubContext&&demand(club,p.position)>0?1:0
        };
      }).sort((a, b) => b.score - a.score || b.ability - a.ability || b.talent - a.talent || a.p.id.localeCompare(b.p.id))[0];
    }).sort((a, b) => b.needTier-a.needTier||b.score - a.score || b.ability - a.ability || b.talent - a.talent || a.p.id.localeCompare(b.p.id))[0];
    selected.add(best.p.id);
    const clubNeed=clubContext?Math.min(1,.35+demand(club,best.p.position)/Math.max(1,targets[club][best.p.position]))*100:needs[club][best.role]*100;
    if(clubContext)counts[club][best.p.position]++;
    else needs[club][best.role] = Math.max(0, needs[club][best.role] - params["draft.need_decay"]);
    const pick:DraftPick={
      playerId: best.p.id,
      playerName: best.p.name,
      teamName: s.teams[best.p.teamId].name,
      club: draftClubs[club],
      overall: picks.length + 1,
      round,
      slot,
      role: best.role,
      score: best.score,
      ability: best.ability,
      abilityRank: ranks.get(best.p.id)!,
      reputation: best.reputation,
      talent: best.talent,
      fit: best.fit,
      components: best.components,
    };
    pick.scoutingReport=createScoutingReport(pick,s.calendar.seasonYear,{stats:best.p.stats,records:best.p.seasonStats},candidates,clubNeed);
    if(!best.p.careerMode){pick.scoutingReport.evaluation=createPlayerEvaluation(evaluationState,best.p,evaluationContext,"draft");pick.scoutingReport.evaluationParameters=Object.fromEntries(Object.entries(evaluationContext.reference.parameters).filter(([key])=>/^(training\.|talent\.|growth\.|fatigue\.plan_neutral_)/.test(key)));}
    picks.push(pick);
  }
  return picks;
}
export const draftPlayers = (s: GameState,clubContext?:DraftClubContext) => selectDraft(s,Infinity,clubContext);
export const draftProjection = (s: GameState) => selectDraft({ ...s, rngStates: { ...s.rngStates } });
// The same selection model evaluated at today's abilities/reputation. Reading
// the forecast never consumes the live draft stream or writes future results.
export const draftForecast = (s: GameState) => selectDraft({ ...s, rngStates: { ...s.rngStates } }, 10);
