import { tryTrainingFocus } from "./training-focus";
import { finishCompetitionDay, prepareCompetitions } from "./calendar";
import { addDays, available, clamp, overall, draftPlayers, emptyRecord, emptyStats, getPlayer, injuryRisk, mergeRecord, npcPolicy, params, promote, random, reputationScore, simulateGame, ticketsUsed, train, trainingFatigueDay, updateReputation, validPolicy } from "./engine";
import { openScheduledEvent, planEventWeek, tryNationalEvent } from "./event-system";
import { joinPendingTransfer, recordTwoWayWeek, tryCareerOpportunity, twoWayQualified } from "./career-opportunities";
import { statKeys, type GameState, type Player, type Policy, type Stance } from "./types";
import { finishDevelopmentSeason, reviewProRoster, reviewDevelopmentContract } from "./pro-career";
import { developmentalOffer } from "./draft-outcome";
import { tryDevelopmentEvent } from "./pro-events";
import {ensureProWorld,prepareEvaluationOpportunities,recordProfessionalDay,reviewProMilestones} from "./pro-world";
import {migrateActivePostseason,needsPostseasonUpgrade,preparePlayoffReplacements} from "./pro-season";
import {finishRoleTrial} from "./pro-market";
import {recordProTwoWayDay,reviewProTwoWay} from "./pro-two-way";
import {syncJerseyNumbers} from "../jersey-numbers";
import {capturePendingEvaluationChanges,capturePlayerEvaluations,recordEvaluationDay} from "./evaluation-lifecycle";
import {tickProEvents} from "./pro-event-ledger";
import {openProGeneralEvent,planProEventWeek,proMajorDueToday} from "./pro-event-runtime";
import {recordProRoleTraining,reviewProRoleTrial} from "./pro-role-evaluation";
import {packRecentRecord} from "./recent-records";
import {upgradeProSchedule} from "./pro-schedule";

export function refreshWeekReport(s: GameState) {
  const progress = s.weekProgress;
  if (!progress) return;
  const p = getPlayer(s), report = structuredClone(progress.report), day = progress.day;
  if (day) {
    const fatigue = { ...day.fatigue, end: p.fatigue };
    if (s.matchProgress && day.gameStartFatigue !== undefined) fatigue.game += p.fatigue - day.gameStartFatigue - ((fatigue.events ?? 0) - (day.gameStartEventFatigue ?? 0));
    fatigue.peak = Math.max(fatigue.peak, p.fatigue);
    report.fatigue.training += fatigue.training; report.fatigue.game += fatigue.game; report.fatigue.recovered += fatigue.recovered;
    report.fatigue.events = (report.fatigue.events ?? 0) + (fatigue.events ?? 0);
    report.fatigue.peak = Math.max(report.fatigue.peak, fatigue.peak); report.fatigue.days.push(fatigue);
  }
  for (const key of statKeys) report.growth[key] = p.stats[key] - progress.beforeStats[key];
  report.fatigueAfter = p.fatigue; report.reputationAfter = p.reputation; report.to = s.date;
  s.report = report;
}
export function advanceWeek(input: GameState, policy: Policy, stance: Stance): GameState {
  if(!needsPostseasonUpgrade(input))validateAdvance(input, policy);
  return advanceWeekInPlace(structuredClone(input), policy, stance);
}

function validateAdvance(s: GameState, policy: Policy) {
  if (s.phase === "ended") throw new Error("종료된 커리어입니다.");
  if (s.careerEvent) throw new Error("진행 중인 이벤트에서 선택을 먼저 완료해 주세요.");
  if (s.careerNotice) throw new Error("진로·등록 알림을 먼저 확인해 주세요.");
  if (!validPolicy(policy)) throw new Error("훈련 티켓 배분을 확인해 주세요.");
}

// Only the simulation worker owns a disposable state. Public callers keep the
// immutable wrapper above so a failed/paused request never changes their input.
export function advanceWeekInPlace(s: GameState, policy: Policy, stance: Stance): GameState {
  if(migrateActivePostseason(s))return s;
  validateAdvance(s, policy);
  const player = getPlayer(s);
  for (const p of s.players) {
    if (p.recentAppearances.some(record => !Array.isArray(record))) p.recentAppearances = p.recentAppearances.map(packRecentRecord);
  }
  ensureProWorld(s);
  upgradeProSchedule(s);
  tickProEvents(s);
  updateReputation(s);
  syncJerseyNumbers(s,true);
  if(!s.evaluationSystem)capturePlayerEvaluations(s,"introduced");
  if (!s.weekProgress) {
    player.trainingPolicy = structuredClone(policy); player.stance = { ...stance };
    prepareCompetitions(s.calendar, s.date, s.seed);
    s.weekProgress = { remainingDays: 7, beforeStats: { ...player.stats }, policy: structuredClone(policy), stance: { ...stance }, opportunity: null, twoWayQualified: twoWayQualified(player) && s.date.slice(5, 7) >= "03" && s.date.slice(5, 7) <= "09",
      report: { from: s.date, to: s.date, growth: emptyStats(), fatigueBefore: player.fatigue, fatigueAfter: player.fatigue,
        fatigue: { training: 0, game: 0, recovered: 0, peak: player.fatigue, days: [], events: 0 }, games: [], messages: [], records: emptyRecord(), reputationBefore: player.reputation, reputationAfter: player.reputation } };
    s.weekProgress.opportunity = planEventWeek(s);
    planProEventWeek(s);
  } else { player.trainingPolicy = structuredClone(s.weekProgress.policy); player.stance = { ...s.weekProgress.stance }; }
  const progress = s.weekProgress, report = progress.report;
  progress.fatigueRecoveryStats??=s.players.map(p=>[p.id,p.stats.recovery]);
  const fatigueRecoveryStats=new Map(progress.fatigueRecoveryStats);
  let rosters: Player[][] = s.teams.map(() => []);
  for (const p of s.players) if(p.teamId>=0)rosters[p.teamId].push(p);
  const pause = () => { refreshWeekReport(s); return syncJerseyNumbers(capturePendingEvaluationChanges(s)); };
  while (progress.remainingDays > 0) {
    const date = s.date;
    if (!twoWayQualified(player)) progress.twoWayQualified = false;
    if (!progress.day) {
      tickProEvents(s);
      for(const p of s.players)if(p.professional?.managedUntil&&s.date>p.professional.managedUntil)delete p.professional.managedUntil;
      if (!s.careerMode && date > s.calendar.seasonEnd) {
        promote(s); rosters = s.teams.map(() => []); for (const p of s.players) rosters[p.teamId].push(p);
        report.messages.push("새 학년이 시작되었습니다. 신입생이 입학했습니다.");
      }
      for (const p of s.players) p.reputation = reputationScore(p);
      for (const p of s.players) if (p.forcedRest && p.fatigue < params["fatigue.ready_return"]) p.forcedRest = false;
      prepareCompetitions(s.calendar, date, s.seed);
      const games = s.calendar.events.filter(g => g.date === date && g.status === "scheduled");
      const playingTeams = new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]));
      for (const p of s.players) if (p.id !== s.playerId) npcPolicy(p, date, playingTeams.has(p.teamId));
      progress.day = { phase: "beforeGames", fatigue: { date, start: player.fatigue, training: 0, game: 0, recovered: 0, peak: player.fatigue, end: player.fatigue, events: 0 },
        recovery: [], active: [], appearances: [], gameIds: games.map(g => g.id), gameIndex: 0, playerIndex: 0 };
      if (joinPendingTransfer(s)) {
        rosters = s.teams.map(() => []); for (const p of s.players) rosters[p.teamId].push(p);
        return pause();
      }
    }
    const day = progress.day;
    if(day.phase==="beforeGames"){
      finishRoleTrial(s);preparePlayoffReplacements(s);
    }
    if (day.phase === "beforeGames" && (reviewDevelopmentContract(s) || reviewProRoster(s))) {
      return pause();
    }
    if (tryNationalEvent(s)) return pause();
    if (day.phase === "beforeGames") {
      // Registration reviews can move NPCs without opening a user notice.
      rosters=s.teams.map(()=>[]);for(const p of s.players)if(p.teamId>=0)rosters[p.teamId].push(p);
      reviewProMilestones(s);if(s.careerNotice)return pause();
      if(reviewProTwoWay(s))return pause();
      prepareEvaluationOpportunities(s,day.gameIds);if(s.careerNotice)return pause();
      if(s.careerMode==="pro"&&(reviewProRoleTrial(s,proMajorDueToday(s))||s.careerNotice))return pause();
      if (tryDevelopmentEvent(s)) return pause();
      if (tryCareerOpportunity(s)) return pause();
      if (openScheduledEvent(s, "beforeGames")) return pause();
      day.phase = "games";
    }
    if (day.phase === "games") {
      while (day.gameIndex < day.gameIds.length) {
        const game = s.calendar.events.find(g => g.id === day.gameIds[day.gameIndex])!;
        if (day.gameStartFatigue === undefined) { day.gameStartFatigue = player.fatigue; day.gameStartEventFatigue = day.fatigue.events ?? 0; }
        if (!simulateGame(s, game, [rosters[game.homeTeamId], rosters[game.awayTeamId]])) return pause();
        day.fatigue.game += player.fatigue - day.gameStartFatigue - ((day.fatigue.events ?? 0) - (day.gameStartEventFatigue ?? 0));
        delete day.gameStartFatigue; delete day.gameStartEventFatigue;
        if (game.boxScore[s.playerId]) mergeRecord(report.records, game.boxScore[s.playerId]);
        for (const id of [...game.lineup.flat(), ...Object.keys(game.boxScore)]) { if (!day.appearances.includes(id)) day.appearances.push(id); if (!day.active.includes(id)) day.active.push(id); }
        if (s.calendar.competitions.find(c => c.id === game.competitionId)?.kind === "tournament") game.advancingTeamId = game.status === "forfeit" ? game.forfeitTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
          : game.score[0] === game.score[1] ? random(s, "match") < .5 ? game.homeTeamId : game.awayTeamId : game.score[0] > game.score[1] ? game.homeTeamId : game.awayTeamId;
        const home = s.teams[game.homeTeamId], away = s.teams[game.awayTeamId];
        const outcome = game.status === "forfeit" ? game.forfeitTeamId === home.id ? -1 : 1 : Math.sign(game.score[0] - game.score[1]);
        if(!game.competitionId.startsWith("pro-playoffs-")&&!game.tiebreaker){if (outcome > 0) { home.wins++; away.losses++; } else if (outcome < 0) { home.losses++; away.wins++; } else { home.draws++; away.draws++; }}
        if ([game.homeTeamId, game.awayTeamId].includes(player.teamId)) report.games.push(game.id);
        day.gameIndex++;
      }
      finishCompetitionDay(s.calendar, date);
      day.phase = "players";
      if (day.gameIds.length) updateReputation(s);
      if (tryNationalEvent(s)) return pause();
    }
    if (day.phase === "players") {
      const training = s.calendar.trainingDays.includes(date);
      const cycleEnd=addDays(report.from,6),trainingCycle=s.calendar.trainingDays.some(d=>d>=report.from&&d<=cycleEnd);
      const active = new Set(day.active), appearances = new Set(day.appearances);
      const playingTeams = new Set(day.gameIds.flatMap(id => { const g = s.calendar.events.find(game => game.id === id)!; return [g.homeTeamId, g.awayTeamId]; }));
      const evaluationPlayers=new Set(day.gameIds.flatMap(id=>s.calendar.events.find(game=>game.id===id)?.evaluationPlayers??[]));
      while (day.playerIndex < s.players.length) {
        const p = s.players[day.playerIndex];
        if (p.fatigue >= params["fatigue.force_rest"]) p.forcedRest = true;
        if (p.id === s.playerId && (openProGeneralEvent(s) || tryTrainingFocus(s) || openScheduledEvent(s, "training"))) { day.active = [...active]; return pause(); }
        const injured = !!p.injury && date < p.injury.unavailableUntil;
        let trained = false;
        if (p.id === s.playerId && injured) s.injuryDays++;
        if (training && available(p, date) && ticketsUsed(p.trainingPolicy) && !(p.id===s.playerId && day.skipPlayerTraining)) {
          const hasGame = playingTeams.has(p.teamId)||evaluationPlayers.has(p.id);
          const a = hasGame ? appearances.has(p.id) ? params["training.game_fraction"] : params["training.bench_fraction"] : 1;
          train(p, a);
          if (p.id === s.playerId && p.transferAdaptation?.weeksRemaining) progress.adaptationTrained = true;
          active.add(p.id);
          trained = true;
          if(s.careerMode==="pro")recordProRoleTraining(s,p);
        }
        const allocation=p.forcedRest||injured||p.trainingPolicy.mode==="rest"||!trainingCycle||p.id===s.playerId&&day.skipPlayerTraining?0:p.trainingPolicy;
        const beforeFatigue=p.fatigue,fatigueDay=trainingFatigueDay(p.fatigue,fatigueRecoveryStats.get(p.id)??p.stats.recovery,allocation);
        p.fatigue=fatigueDay.end;
        if(p.id===s.playerId){day.fatigue.training+=fatigueDay.training;day.fatigue.recovered+=fatigueDay.recovered;day.fatigue.peak=Math.max(day.fatigue.peak,beforeFatigue,p.fatigue);day.fatigue.end=p.fatigue;}
        if (p.fatigue >= params["fatigue.force_rest"]) p.forcedRest = true;
        else if(p.forcedRest&&p.fatigue<params["fatigue.ready_return"])p.forcedRest=false;
        if (active.has(p.id) && !injured && random(s, "injury") < injuryRisk(p.fatigue, trained)) {
          const roll = random(s, "injury"), severity = roll < params["injury.mild.weight"] ? "mild" : roll < params["injury.mild.weight"] + params["injury.moderate.weight"] ? "moderate" : "severe", prefix = `injury.${severity}`;
          const duration = params[`${prefix}.min_days`] + Math.floor(random(s, "injury") * (params[`${prefix}.max_days`] - params[`${prefix}.min_days`] + 1));
          p.injury = { severity, startDate: date, unavailableUntil: addDays(date, duration + 1), originalPenalty: Math.max(p.injury?.originalPenalty ?? 0, params[`${prefix}.penalty`]),
            penaltyRemaining: Math.max(p.injury?.penaltyRemaining ?? 0, params[`${prefix}.penalty`]), penaltyRecoverDays: Math.max(p.injury?.penaltyRecoverDays ?? 0, params[`${prefix}.recovery_days`]) };
          if (p.id === s.playerId) report.messages.push(`활동 후 ${severity === "mild" ? "경미한" : severity === "moderate" ? "보통" : "심각한"} 부상 발견 · ${duration}일 결장`);
        }
        if (p.injury && date >= p.injury.unavailableUntil) {
          p.injury.penaltyRemaining = Math.max(0, p.injury.penaltyRemaining - (p.injury.penaltyRecoverDays ? p.injury.originalPenalty / p.injury.penaltyRecoverDays : 0));
          if (!p.injury.penaltyRemaining) p.injury = null;
        }
        day.playerIndex++;
      }
      day.phase = "finish";
    }
    report.fatigue.training += day.fatigue.training; report.fatigue.game += day.fatigue.game; report.fatigue.recovered += day.fatigue.recovered;
    report.fatigue.events = (report.fatigue.events ?? 0) + (day.fatigue.events ?? 0);
    report.fatigue.peak = Math.max(report.fatigue.peak, day.fatigue.peak); report.fatigue.days.push(day.fatigue);
    report.to = date; delete progress.day; progress.remainingDays--;
    if (s.careerMode === "pro" && s.postSchool?.pro) {
      if(player.teamId>=0&&player.teamId<10)s.postSchool.pro.firstTeamWeeks+=1/7;else if(player.teamId>=10&&player.teamId<20)s.postSchool.pro.secondTeamWeeks+=1/7;
      recordProfessionalDay(s);recordProTwoWayDay(s);reviewDevelopmentContract(s);
    }
    recordEvaluationDay(s);capturePlayerEvaluations(s);
    if (finishDevelopmentSeason(s)) {if(s.phase==="ended")capturePlayerEvaluations(s,"season-end");break;}
    if (!s.careerMode && player.grade === 3 && date >= s.calendar.draftDate) {
      updateReputation(s);
      capturePlayerEvaluations(s,"draft",s.players.filter(p=>p.grade===3).map(p=>p.id));
      s.draft = draftPlayers(s); s.phase = "ended";
      s.draftOutcome = {revealed:false,offer:developmentalOffer(s)};
      s.pendingEvents = [{ type: "draft", date, playerId: s.playerId }]; report.messages.push("고교 3시즌의 여정이 끝났습니다. 드래프트 결과를 확인하세요.");
      break;
    }
    s.date = addDays(date, 1);
    if(s.careerNotice)return pause();
    if (progress.opportunity && progress.opportunity.date <= date) progress.opportunity = null;
  }
  if (progress.remainingDays === 0) {
    if(!s.careerMode)recordTwoWayWeek(s);
    if (progress.adaptationTrained && player.transferAdaptation) {
      player.transferAdaptation.weeksRemaining--;
      if (player.transferAdaptation.weeksRemaining <= 0) { delete player.transferAdaptation; report.messages.push("새 학교 적응을 마쳤습니다. 훈련 효율이 정상으로 돌아왔습니다."); }
    }
  }
  // Charge the extra two-way workload once, after both kinds of appearances
  // actually occurred. Checkpoint resumes and recovery/bench weeks add nothing.
  if (player.twoWay && progress.policy.mode !== "rest" && report.records.batting.PA > 0 && report.records.pitching.BF > 0) {
    const before = player.fatigue;
    player.fatigue = clamp(player.fatigue + Math.max(0, report.fatigue.game) * .2);
    const extra = player.fatigue - before, lastDay = report.fatigue.days.at(-1);
    report.fatigue.game += extra; report.fatigue.peak = Math.max(report.fatigue.peak, player.fatigue);
    if (lastDay) { lastDay.game += extra; lastDay.end = player.fatigue; lastDay.peak = Math.max(lastDay.peak, player.fatigue); }
    if (player.fatigue >= params["fatigue.force_rest"]) player.forcedRest = true;
    if (extra > 0) report.messages.push(`투타 양쪽 출전으로 추가 피로 ${extra.toFixed(2)}가 쌓였습니다.`);
  }
  updateReputation(s);
  for (const key of statKeys) report.growth[key] = player.stats[key] - progress.beforeStats[key];
  report.fatigueAfter = player.fatigue; report.reputationAfter = player.reputation;
  if (!Object.values(report.growth).some(n => n > 0)) report.messages.push(player.injury && s.date < player.injury.unavailableUntil ? "부상으로 훈련에 참가하지 못했습니다." : progress.policy.mode === "rest" ? "회복 방침으로 훈련과 출전을 쉬었습니다." : ticketsUsed(progress.policy) === 0 ? "사용한 티켓이 없어 성장하지 않았습니다." : "비시즌으로 정규 훈련이 없습니다.");
  if (player.offerCooldown > 0) player.offerCooldown--;
  s.week++; s.report = report; s.history.push({ week: s.week, ovr: overall(player), ovrScale:100, fatigue: player.fatigue });
  delete s.weekProgress;
  return syncJerseyNumbers(capturePendingEvaluationChanges(s));
}
