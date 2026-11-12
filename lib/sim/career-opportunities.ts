import { available, clamp, getPlayer, hash, isPitcher, ovr, params, positions, random, reputationScore, roleFor, roleScore } from "./engine";
import { eventAwakeningReward, eventTrainingReward } from "./event-system";
import { teamStrength } from "../team-strength";
import type { CareerEvent, CareerEventBranch, CareerEventOutcome, GameState, Player, Position, Stat, TransferOffer } from "./types";

import {assertPositionEligible,canPlayPosition} from './position-eligibility';
import {meetsTwoWayRatio} from './two-way-qualification';
export const opportunityState = (s: GameState) => s.careerOpportunities ??= {
  rng: hash(`${s.seed}:career-opportunities`), qualifiedWeeks: 0, twoWayOfferedGrades: [], transferRollYears: [], transferOffered: false,
};
export const twoWayQualified = (p: Player) => meetsTwoWayRatio(ovr(p,true),ovr(p,false),params['school.two_way_ratio']);
const inSeason = (s: GameState) => s.date.slice(5, 7) >= "03" && s.date.slice(5, 7) <= "09" && (getPlayer(s).grade !== 3 || s.date < s.calendar.draftDate);
export function observeTwoWayQualification(s: GameState) {
  if (twoWayQualified(getPlayer(s)) && inSeason(s)) return;
  opportunityState(s).qualifiedWeeks = 0;
  if (s.weekProgress) s.weekProgress.twoWayQualified = false;
}
export function recordTwoWayWeek(s: GameState) {
  const ledger = opportunityState(s);
  if (ledger.lastCountedWeek === s.week) return;
  ledger.qualifiedWeeks = s.weekProgress?.twoWayQualified && inSeason(s) && twoWayQualified(getPlayer(s)) ? ledger.qualifiedWeeks + 1 : 0;
  ledger.lastCountedWeek = s.week;
}
export function twoWayPositions(p: Player) {
  const best = (list: Position[]) => list.filter(pos=>canPlayPosition(p,pos)).sort((a, b) => roleScore(p, roleFor(b)) - roleScore(p, roleFor(a)) || list.indexOf(a) - list.indexOf(b))[0];
  return { pitchingPosition: isPitcher(p.primaryRole) ? p.position : best(["SP", "RP", "CP"]),
    battingPosition: isPitcher(p.primaryRole) ? best(["2B", "CF", "1B", "3B", "SS", "LF", "RF", "C", "DH"]) : p.position };
}
function draw(s: GameState) {
  const ledger = opportunityState(s), source = { rngStates: { ...s.rngStates, events: ledger.rng } };
  const value = random(source, "events"); ledger.rng = source.rngStates.events; return value;
}
function open(s: GameState, event: CareerEvent) {
  s.careerEvent = event;
  if (s.weekProgress) s.weekProgress.opportunity = null;
  s.lastCareerEventWeek = s.week;
  return true;
}
function destinations(s: GameState): TransferOffer[] {
  const p = getPlayer(s), twoWay = twoWayQualified(p);
  const schools = s.teams.filter(t => t.id !== p.teamId).map(t => {
    const rivals = s.players.filter(other => other.teamId === t.id && other.grade < 3 && other.eligiblePositions.includes(p.position));
    return { teamId: t.id, name: t.name, strength: teamStrength(s.players, t.id).overall,
      competition: rivals.length ? Math.max(...rivals.map(other => roleScore(other, p.primaryRole))) : 0, twoWay };
  });
  const strong = [...schools].sort((a, b) => b.strength - a.strength || a.teamId - b.teamId)[0];
  const easier = schools.filter(t => t.teamId !== strong?.teamId).sort((a, b) => a.competition - b.competition || b.strength - a.strength || a.teamId - b.teamId)[0];
  return [...(strong ? [{ ...strong, kind: "strong" as const }] : []), ...(easier ? [{ ...easier, kind: "playingTime" as const }] : [])];
}
export function tryCareerOpportunity(s: GameState) {
  if(s.careerMode)return false;
  const p = getPlayer(s), ledger = opportunityState(s);
  observeTwoWayQualification(s);
  if (s.phase === "ended" || s.careerEvent || s.matchProgress || p.roleOffer || (p.grade === 3 && s.date >= s.calendar.draftDate)) return false;
  const base = { rewardVersion: 2, kind: "special" as const, date: s.date };
  if (!p.twoWay && inSeason(s) && twoWayQualified(p) && ledger.qualifiedWeeks >= 2 && available(p, s.date) && !ledger.twoWayOfferedGrades.includes(p.grade)) {
    ledger.twoWayOfferedGrades.push(p.grade);
    const pair = twoWayPositions(p);
    return open(s, { ...base, id: `${p.id}:${s.date}:S01`, definitionId: "S01", title: "감독의 투타 겸업 제안", twoWayProposal: pair,
      description: `감독이 ${positions[pair.pitchingPosition]}와 ${positions[pair.battingPosition]}를 함께 맡아보자고 제안했다. 지금 학교에서도 새로운 역할에 도전할 수 있다.`,
      choices: [{ id: "accept", label: "투타 겸업에 도전한다", outcomes: [{ weight: 100, message: "감독과 투타 겸업 계획을 세웠다. 팀 경기마다 투수·야수 출전일을 번갈아 배정하며, 실제 출전은 주전 경쟁과 컨디션에 따라 결정된다.", opportunity: { action: "twoWay" } }] },
        { id: "decline", label: "현재 역할에 집중한다", outcomes: [{ weight: 100, message: "지금은 현재 역할에 집중하기로 했다. 다음 학년에도 양쪽 능력이 충분하면 다시 제안받을 수 있다." }] }] });
  }
  const year = s.calendar.seasonYear;
  if (p.grade > 2 || s.date.slice(5, 7) !== "12" || ledger.transferOffered || ledger.pendingTransfer || ledger.transferRollYears.includes(year)) return false;
  ledger.transferRollYears.push(year);
  if (draw(s) >= .3) return false;
  const offers = destinations(s);
  if (!offers.length) return false;
  ledger.transferOffered = true;
  return open(s, { ...base, id: `${p.id}:${s.date}:S02`, definitionId: "S02", title: "겨울에 도착한 전학 제안", transferOffers: offers,
    description: "다른 학교에서 내년 합류를 제안했다. 학교의 전력과 포지션 경쟁 상황을 살펴보고 진로를 선택하자. 지금 학교에 남아도 괜찮다.",
    choices: [...offers.map(offer => ({ id: `transfer-${offer.teamId}`, label: `${offer.name} 전학을 수락한다`,
      outcomes: [{ weight: 100, message: `${offer.name} 전학을 결정했다. 이번 시즌은 현재 학교에서 마무리하고 다음 학년 1월 1일에 합류한다.`, opportunity: { action: "transfer" as const, teamId: offer.teamId } }] })),
      { id: "stay", label: "지금 학교에 남는다", outcomes: [{ weight: 100, message: "함께 뛰어온 동료들과 남은 고교 생활을 이어가기로 했다." }] }] });
}
export function applyOpportunityChoice(s: GameState, branch: CareerEventBranch): Pick<CareerEventOutcome, "twoWay" | "transfer"> {
  const event = s.careerEvent!, p = getPlayer(s);
  if (branch.opportunity?.action === "twoWay" && event.twoWayProposal) {
    const pair = event.twoWayProposal;
    assertPositionEligible(p,pair.battingPosition);
    p.twoWay = { ...pair, nextAssignment: isPitcher(p.primaryRole) ? "pitching" : "batting", reputationBonus: 0 };
    p.eligiblePositions = [...new Set([...p.eligiblePositions, pair.battingPosition, "SP", "RP", "CP"] as Position[])];
    return { twoWay: { ...pair } };
  }
  if (branch.opportunity?.action === "transfer") {
    const offer = event.transferOffers?.find(item => item.teamId === branch.opportunity?.teamId);
    if (!offer) throw new Error("전학 제안 학교를 찾을 수 없습니다.");
    const effectiveDate = `${s.calendar.seasonYear + 1}-01-01`;
    opportunityState(s).pendingTransfer = { offerId: event.id, fromTeamId: p.teamId, toTeamId: offer.teamId, effectiveDate, kind: offer.kind };
    return { transfer: { from: s.teams[p.teamId].name, to: offer.name, effectiveDate, status: "scheduled" } };
  }
  return {};
}
// Join after promotion has archived the previous season at the previous school.
// Moving one player never swaps an unrelated NPC or changes the world population.
export function joinPendingTransfer(s: GameState) {
  if(s.careerMode)return false;
  const ledger = opportunityState(s), transfer = ledger.pendingTransfer;
  if (!transfer || s.date < transfer.effectiveDate) return false;
  const p = getPlayer(s), oldFatigue = p.fatigue, oldReputation = p.reputation ?? reputationScore(p) ?? 0;
  const from = s.teams[transfer.fromTeamId].name, to = s.teams[transfer.toTeamId].name;
  for (const season of p.career) { season.schoolId ??= transfer.fromTeamId; season.schoolName ??= from; }
  p.teamId = transfer.toTeamId;
  p.transferAdaptation = { schoolId: p.teamId, weeksRemaining: 2 };
  const changes: Partial<Player["stats"]> = {}, awakened: Stat[] = [];
  if (transfer.kind === "strong") {
    const core: Stat[] = isPitcher(p.primaryRole) ? ["velocity", "control", "movement"] : ["contact", "power", "speed", "defense"];
    const key = core.sort((a, b) => p.stats[a] - p.stats[b])[0];
    if (draw(s) < .05) awakened.push(key);
    changes[key] = awakened.length ? eventAwakeningReward(p, key, 3) : eventTrainingReward(p, key, 3); p.stats[key] = clamp(p.stats[key] + changes[key]!, 1);
  }
  p.fatigue = clamp(p.fatigue + 3); p.reputation = reputationScore(p);
  const fatigue = p.fatigue - oldFatigue;
  if (s.weekProgress?.day) { const day = s.weekProgress.day.fatigue; day.events = (day.events ?? 0) + fatigue; day.peak = Math.max(day.peak, p.fatigue); }
  s.careerEventHistory ??= [];
  s.careerEventHistory.push({ id: `${transfer.offerId}:joined`, definitionId: "S02_JOIN", kind: "special", title: "새 학교에 합류했습니다", date: s.date, choice: `${from} → ${to}`,
    message: "이전 학교의 기록을 간직한 채 새 학년을 시작했다. 새로운 환경에 적응하는 첫 두 훈련 주간은 훈련 효율이 90%로 적용된다.",
    stats: changes, reputation: (p.reputation??0) - oldReputation, fatigue, awakened, transfer: { from, to, effectiveDate: transfer.effectiveDate, status: "joined" } });
  s.weekProgress?.report.messages.push(`${to}에 합류했습니다. 첫 두 훈련 주간은 적응 기간입니다.`);
  delete ledger.pendingTransfer;
  return true;
}
