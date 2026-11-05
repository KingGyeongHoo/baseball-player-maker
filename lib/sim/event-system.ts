import { addDays, assignRole, available, clamp, overall, focusGrowth, getPlayer, growthMultiplier, isPitcher, lineup, params, random, refreshWeekReport, reputationScore, roleScore, roles, slowdown } from "./engine";
import {applyProTwoWayChoice} from "./pro-two-way";
import { teamStrength } from "../team-strength";
import { professionalGrowth } from "./pro-growth";
import { applyOpportunityChoice, observeTwoWayQualification } from "./career-opportunities";
import { createCareerEvent, eventKind } from "./career-events";
import { statKeys, type CareerEventBranch, type EventOpportunity, type EventScene, type GameState, type MatchEffect, type Player, type Stat } from "./types";

export const eventLedger = (s: GameState) => s.eventLedger ??= { recent: [], centerGrades: [], nationalGrades: [], competitions: [], games: [] };
export function suggestedRole(p: Player) {
  if (p.twoWay || p.roleOffer || p.offerCooldown > 0) return undefined;
  const best = [...roles].sort((a, b) => roleScore(p, b) - roleScore(p, a) || roles.indexOf(a) - roles.indexOf(b))[0];
  return best !== p.primaryRole && roleScore(p, best) > roleScore(p) ? best : undefined;
}
export function activeTournaments(s: GameState, date: string) {
  const teamId = getPlayer(s).teamId;
  return s.calendar.competitions.filter(c => c.kind === "tournament" && c.initialized && c.championTeamId === null
    && c.startDate <= date && date <= c.endDate && c.participantTeamIds.includes(teamId)
    && !s.calendar.events.some(g => g.competitionId === c.id && [g.homeTeamId, g.awayTeamId].includes(teamId)
      && (g.status === "completed" || g.status === "forfeit") && g.advancingTeamId !== teamId));
}
export function eventCandidates(s: GameState, date: string): EventOpportunity[] {
  const p = getPlayer(s), ledger = eventLedger(s);
  if (s.phase === "ended" || p.roleOffer || (p.grade === 3 && date >= s.calendar.draftDate)) return [];
  const trainDay = s.calendar.trainingDays.includes(date), canAct = available(p, date), pitching = isPitcher(p.primaryRole);
  const canTrain = canAct && trainDay && Object.values(p.trainingPolicy.tickets).some(n => n > 0);
  const game = s.calendar.events.find(g => g.date === date && [g.homeTeamId, g.awayTeamId].includes(p.teamId));
  const pool: EventOpportunity[] = [];
  const add = (id: string, context: Partial<EventOpportunity> = {}) => {
    if (!ledger.recent.slice(-5).includes(id)) pool.push({ definitionId: id, date, ...context });
  };
  if (canTrain) {
    for (const id of ["T04", "T08"]) add(id);
    if (!pitching) { add("T01"); if (p.position !== "DH") add("T02"); if (p.trainingPolicy.tickets.speed > 0) add("T07"); }
    else { add("T06"); if (p.trainingPolicy.tickets.movement > 0) add("T03"); }
    if (p.trainingPolicy.tickets.physical > 0) add("T05");
    if (p.fatigue >= 40) add("T09");
    if (!ledger.centerGrades.includes(p.grade)) add("T10");
    const targetRole = suggestedRole(p);
    if (targetRole) add("P06", { targetRole });
  }
  if (canAct && (!game || trainDay)) add("P01");
  if (!game) { add("P02"); add("P07"); }
  if (p.seasonStats.batting.PA || p.seasonStats.pitching.BF) add("P03");
  if (canAct && game) add("P04");
  if (pitching && canAct && (trainDay || game)) add("P05");
  for (const c of activeTournaments(s, date)) {
    if (ledger.competitions.includes(c.id)) continue;
    const next = s.calendar.events.find(g => g.competitionId === c.id && g.date >= date && g.status === "scheduled" && [g.homeTeamId, g.awayTeamId].includes(p.teamId));
    const context = { competitionId: c.id };
    if (next && canAct) {
      const opponent = next.homeTeamId === p.teamId ? next.awayTeamId : next.homeTeamId;
      if (teamStrength(s.players, opponent).overall > teamStrength(s.players, p.teamId).overall) add("C01", context);
      if (!s.calendar.events.some(g => g.competitionId === c.id && [g.homeTeamId, g.awayTeamId].includes(p.teamId) && (g.status === "completed" || g.status === "forfeit"))) add("C02", context);
      if (next.awayTeamId === p.teamId) add("C06", context);
    }
    if (canAct) add("C03", context);
    add("C04", context); add("C05", context);
  }
  if (canAct && game?.status === "scheduled" && !ledger.games.includes(game.id)) {
    const projected = lineup(s.players.filter(other => other.teamId === p.teamId), date);
    const ids = projected.order.some(other => other.id === p.id) ? ["G01", "G02", "G03"]
      : projected.pitchers.some(other => other.id === p.id) ? ["G04", "G05", "G06"] : [];
    for (const id of ids) add(id, { gameId: game.id });
  }
  return pool;
}
export function planEventWeek(s: GameState): EventOpportunity | null {
  if(s.careerMode)return null;
  if (s.week - (s.lastCareerEventWeek ?? 0) < params["events.gap_weeks"] || random(s, "events") >= params["events.weekly_chance"]) return null;
  const pool = Array.from({ length: 7 }, (_, i) => eventCandidates(s, addDays(s.date, i))).flat();
  const kinds = [...new Set(pool.map(item => eventKind(item.definitionId)))];
  if (!kinds.length) return null;
  const kind = kinds[Math.floor(random(s, "events") * kinds.length)];
  const ids = [...new Set(pool.filter(item => eventKind(item.definitionId) === kind).map(item => item.definitionId))];
  const id = ids[Math.floor(random(s, "events") * ids.length)];
  const times = pool.filter(item => item.definitionId === id);
  return times[Math.floor(random(s, "events") * times.length)];
}
function open(s: GameState, opportunity: EventOpportunity, scene?: EventScene) {
  const p = getPlayer(s), ledger = eventLedger(s), id = opportunity.definitionId;
  s.careerEvent = createCareerEvent(id, p, s.date, s.week, { ...opportunity, scene });
  ledger.recent.push(id);
  ledger.recent = ledger.recent.slice(-5);
  if (id === "P08") ledger.nationalGrades.push(p.grade);
  else { s.lastCareerEventWeek = s.week; if (s.weekProgress) s.weekProgress.opportunity = null; }
  if (id === "T10") ledger.centerGrades.push(p.grade);
  if (opportunity.competitionId) ledger.competitions.push(opportunity.competitionId);
  if (scene) ledger.games.push(scene.gameId);
  return true;
}
export function tryNationalEvent(s: GameState) {
  if(s.careerMode)return false;
  const p = getPlayer(s);
  if (s.phase === "ended" || s.careerEvent || p.roleOffer || ![2, 3].includes(p.grade) || p.reputation === null
    || (p.grade === 3 && s.date >= s.calendar.draftDate) || eventLedger(s).nationalGrades.includes(p.grade)) return false;
  const ranked = [...s.players].sort((a, b) => (b.reputation ?? -1) - (a.reputation ?? -1) || a.id.localeCompare(b.id));
  if (!ranked.slice(0, 23).some(other => other.id === p.id)) return false;
  return open(s, { definitionId: "P08", date: s.date });
}
export function openScheduledEvent(s: GameState, phase: "beforeGames" | "training" | "game", scene?: EventScene) {
  const planned = s.weekProgress?.opportunity;
  if (!planned || planned.date !== s.date || s.careerEvent || getPlayer(s).roleOffer) return false;
  const kind = eventKind(planned.definitionId);
  if (phase === "game") {
    if (kind !== "game" || !scene || planned.gameId !== scene.gameId || eventLedger(s).games.includes(scene.gameId)) return false;
    const hitterEvent = Number(planned.definitionId.slice(1)) <= 3;
    if (hitterEvent !== scene.batting) return false;
    return open(s, planned, scene);
  }
  if (phase === "training" ? kind !== "training" : kind === "training" || kind === "game") return false;
  const candidate = eventCandidates(s, s.date).find(item => item.definitionId === planned.definitionId && item.competitionId === planned.competitionId);
  s.weekProgress!.opportunity = null;
  return candidate ? open(s, candidate) : false;
}
export function eventTrainingReward(player: Player, key: Stat, weeks: number) {
  const days = params["training.days"], start = player.stats[key];
  let value = start;
  const physical = ["stamina", "recovery", "arm"].includes(key);
  const pitching = ["velocity", "control", "movement"].includes(key);
  const talent = player.talent[pitching ? "pitching" : "batting"];
  const multiplier = params["talent.min_mult"] + (talent - 1) / 9 * (params["talent.max_mult"] - params["talent.min_mult"]);
  const rate = key === "bq" ? params["training.bq"] : physical ? focusGrowth(5) / 3
    : (focusGrowth(5) + params["training.base"]) * multiplier;
  for (let i = 0; i < weeks * days; i++) value = clamp(value + rate * professionalGrowth(player) * growthMultiplier(player) * slowdown(value) / days, 1);
  return value - start;
}
export function weightedOutcome(outcomes: CareerEventBranch[], roll: number) {
  let threshold = 0;
  for (const outcome of outcomes) { threshold += outcome.weight / 100; if (roll < threshold) return outcome; }
  return outcomes[outcomes.length - 1];
}
export function applyMatchEffect<T extends { bb: number; hit: number; hr: number; k: number; double: number; triple: number }>(base: T, effect?: MatchEffect): T {
  return { ...base, bb: clamp(base.bb + (effect?.bb ?? 0), 0, 1), hit: clamp(base.hit + (effect?.hit ?? 0), 0, 1),
    k: clamp(base.k + (effect?.k ?? 0), 0, 1), hr: clamp(base.hr + (effect?.hr ?? 0), 0, Math.max(0, 1 - base.double - base.triple)) };
}
export function resolveCareerEvent(input: GameState, choiceId: string): GameState {
  if (input.phase === "ended" || !input.careerEvent) throw new Error("선택할 이벤트가 없습니다.");
  // An unchosen event from the previous fixed-point policy must not retain its
  // old +8/+12/+24 rewards after upgrading. Settled history is never rerolled.
  const pending = input.careerEvent;
  const choices = pending.rewardVersion === 2 ? pending.choices : createCareerEvent(pending.definitionId, getPlayer(input), pending.date, input.week, pending).choices;
  const selected = choices.find(choice => choice.id === choiceId);
  if (!selected) throw new Error("유효하지 않은 이벤트 선택입니다.");
  const s = structuredClone(input), p = getPlayer(s), event = s.careerEvent!;
  const outcome = weightedOutcome(selected.outcomes, random(s, "events"));
  const deltas = { ...outcome.stats };
  for (const key of statKeys) if ((deltas[key] ?? 0) > 0) deltas[key]! *= professionalGrowth(p)*growthMultiplier(p);
  for (const [key, weeks] of Object.entries(outcome.weeks ?? {}) as [Stat, number][]) deltas[key] = eventTrainingReward(p, key, weeks);
  const positive = statKeys.filter(key => (deltas[key] ?? 0) > 0 || (outcome.weeks?.[key] ?? 0) > 0);
  const awakened = positive.length && random(s, "events") < params["events.awakening_chance"] ? positive : [];
  for (const key of awakened) {
    const baseWeeks = outcome.weeks?.[key];
    const weeks = Math.min(params["events.awakening_max_weeks"], (baseWeeks ?? 4) * params["events.awakening_mult"]);
    deltas[key] = eventTrainingReward(p, key, weeks);
  }
  const changes: typeof deltas = {}, oldReputation = p.reputation ?? reputationScore(p), oldFatigue = p.fatigue;
  for (const [key, delta] of Object.entries(deltas) as [Stat, number][]) { const before = p.stats[key]; p.stats[key] = clamp(before + delta, 1); changes[key] = p.stats[key] - before; }
  const oldPosition = p.position;
  const opportunityChanges = applyOpportunityChoice(s, outcome);
  Object.assign(opportunityChanges,applyProTwoWayChoice(s,outcome));
  if (outcome.role) assignRole(p, outcome.role);
  if(outcome.proRoleTrial&&p.professional)p.professional.roleTrial={position:outcome.proRoleTrial,until:addDays(s.date,14)};
  if (event.definitionId === "P06") { p.roleOffer = null; p.offerWeeks = 0; p.offerCooldown = params["coach.offer_cooldown"]; }
  if(p.professional)p.professional.proBonus=clamp(p.professional.proBonus+(outcome.reputation??0),-10,10);
  else if (outcome.reputation !== undefined || p.reputationBonus !== undefined) p.reputationBonus = (p.reputationBonus ?? 0) + (outcome.reputation ?? 0);
  p.reputation = reputationScore(p);
  const recoveryPercent = outcome.recoveryPercent ? outcome.recoveryPercent.min + Math.floor(random(s, "events") * (outcome.recoveryPercent.max - outcome.recoveryPercent.min + 1)) : 0;
  p.fatigue = clamp((p.fatigue + (outcome.fatigue ?? 0)) * (1 - recoveryPercent / 100));
  if(outcome.skipTraining && s.weekProgress?.day)s.weekProgress.day.skipPlayerTraining=true;
  if (outcome.injury) {
    const previous = p.injury, prefix = `injury.${outcome.injury.severity}`;
    const penalty = params[`${prefix}.penalty`], until = addDays(s.date, outcome.injury.days);
    p.injury = { severity: previous && previous.penaltyRemaining > penalty ? previous.severity : outcome.injury.severity,
      startDate: s.date, unavailableUntil: previous && previous.unavailableUntil > until ? previous.unavailableUntil : until,
      originalPenalty: Math.max(previous?.originalPenalty ?? 0, penalty), penaltyRemaining: Math.max(previous?.penaltyRemaining ?? 0, penalty),
      penaltyRecoverDays: Math.max(previous?.penaltyRecoverDays ?? 0, params[`${prefix}.recovery_days`]) };
  }
  if (outcome.match && event.scene && s.matchProgress) {
    const match = s.matchProgress;
    s.matchEffect = { ...outcome.match, gameId: match.gameId, batterId: match.sides[match.battingSide].order[match.battingIndex[match.battingSide] % 9], pitcherId: match.pitchers[1 - match.battingSide] };
  }
  const fatigue = p.fatigue - oldFatigue;
  if (s.matchProgress) s.matchProgress.eventFatigue += fatigue;
  if (s.weekProgress?.day) { s.weekProgress.day.fatigue.events = (s.weekProgress.day.fatigue.events ?? 0) + fatigue; s.weekProgress.day.fatigue.peak = Math.max(s.weekProgress.day.fatigue.peak, p.fatigue); }
  s.careerEventHistory ??= [];
  s.careerEventHistory.push({ id: event.id, definitionId: event.definitionId, kind: event.kind, title: event.title, date: event.date,
    choice: selected.label, message: outcome.message, awakened, stats: changes, reputation: p.reputation - oldReputation, fatigue,
    ...(outcome.injury ? { injury: structuredClone(p.injury!) } : {}), ...(p.position !== oldPosition ? { positionChange: { from: oldPosition, to: p.position } } : {}),
    ...(outcome.match ? { match: { ...outcome.match } } : {}), ...(event.scene ? { scene: event.scene } : {}) });
  Object.assign(s.careerEventHistory.at(-1)!, opportunityChanges);
  observeTwoWayQualification(s);
  s.careerEvent = null;
  if (s.weekProgress) {
    refreshWeekReport(s);
  } else {
    const point = s.history.at(-1);
    if (point?.ovrScale===100) { point.ovr = overall(p); point.fatigue = p.fatigue; }
    else s.history.push({week:s.week,ovr:overall(p),ovrScale:100,fatigue:p.fatigue});
  }
  return s;
}
