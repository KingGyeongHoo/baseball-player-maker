import { tryTrainingFocus } from "./training-focus";
import { finishCompetitionDay, prepareCompetitions } from "./calendar";
import { accumulation, addDays, available, clamp, combinedOvr, draftPlayers, emptyRecord, emptyStats, getPlayer, injuryRisk, mergeRecord, npcPolicy, params, promote, random, recovery, recoveryAmount, reputationScore, simulateGame, ticketsUsed, train, updateReputation, validPolicy } from "./engine";
import { openScheduledEvent, planEventWeek, tryNationalEvent } from "./event-system";
import { joinPendingTransfer, recordTwoWayWeek, tryCareerOpportunity, twoWayQualified } from "./career-opportunities";
import { statKeys, type GameState, type Player, type Policy, type Stance } from "./types";
import { finishDevelopmentSeason, reviewProRoster, reviewDevelopmentContract } from "./pro-career";
import { developmentalOffer } from "./draft-outcome";
import { tryDevelopmentEvent } from "./pro-events";

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
  if (input.phase === "ended") throw new Error("종료된 커리어입니다.");
  if (input.careerEvent) throw new Error("진행 중인 이벤트에서 선택을 먼저 완료해 주세요.");
  if (input.careerNotice) throw new Error("진로·등록 알림을 먼저 확인해 주세요.");
  if (!validPolicy(policy)) throw new Error("훈련 티켓 배분을 확인해 주세요.");
  const s = structuredClone(input), player = getPlayer(s);
  if (!s.weekProgress) {
    player.trainingPolicy = structuredClone(policy); player.stance = { ...stance };
    prepareCompetitions(s.calendar, s.date, s.seed);
    s.weekProgress = { remainingDays: 7, beforeStats: { ...player.stats }, policy: structuredClone(policy), stance: { ...stance }, opportunity: null, twoWayQualified: twoWayQualified(player) && s.date.slice(5, 7) >= "03" && s.date.slice(5, 7) <= "09",
      report: { from: s.date, to: s.date, growth: emptyStats(), fatigueBefore: player.fatigue, fatigueAfter: player.fatigue,
        fatigue: { training: 0, game: 0, recovered: 0, peak: player.fatigue, days: [], events: 0 }, games: [], messages: [], records: emptyRecord(), reputationBefore: player.reputation, reputationAfter: player.reputation } };
    s.weekProgress.opportunity = planEventWeek(s);
  } else { player.trainingPolicy = structuredClone(s.weekProgress.policy); player.stance = { ...s.weekProgress.stance }; }
  const progress = s.weekProgress, report = progress.report;
  let rosters: Player[][] = s.teams.map(() => []);
  for (const p of s.players) rosters[p.teamId].push(p);
  const pause = () => { refreshWeekReport(s); return s; };
  while (progress.remainingDays > 0) {
    const date = s.date;
    if (!twoWayQualified(player)) progress.twoWayQualified = false;
    if (!progress.day) {
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
        recovery: s.players.map(p => [p.id, recovery(p.stats.recovery)]), active: [], appearances: [], gameIds: games.map(g => g.id), gameIndex: 0, playerIndex: 0 };
      if (joinPendingTransfer(s)) {
        rosters = s.teams.map(() => []); for (const p of s.players) rosters[p.teamId].push(p);
        return pause();
      }
    }
    const day = progress.day;
    if (day.phase === "beforeGames" && (reviewDevelopmentContract(s) || reviewProRoster(s))) {
      rosters=s.teams.map(()=>[]);for(const p of s.players)rosters[p.teamId].push(p);
      return pause();
    }
    if (tryNationalEvent(s)) return pause();
    if (day.phase === "beforeGames") {
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
        if (outcome > 0) { home.wins++; away.losses++; } else if (outcome < 0) { home.losses++; away.wins++; } else { home.draws++; away.draws++; }
        if ([game.homeTeamId, game.awayTeamId].includes(player.teamId)) report.games.push(game.id);
        day.gameIndex++;
      }
      finishCompetitionDay(s.calendar, date);
      day.phase = "players";
      if (day.gameIds.length) updateReputation(s);
      if (tryNationalEvent(s)) return pause();
    }
    if (day.phase === "players") {
      const dailyRecovery = new Map(day.recovery), training = s.calendar.trainingDays.includes(date);
      const active = new Set(day.active), appearances = new Set(day.appearances);
      const playingTeams = new Set(day.gameIds.flatMap(id => { const g = s.calendar.events.find(game => game.id === id)!; return [g.homeTeamId, g.awayTeamId]; }));
      while (day.playerIndex < s.players.length) {
        const p = s.players[day.playerIndex];
        if (p.fatigue >= params["fatigue.force_rest"]) p.forcedRest = true;
        if (p.id === s.playerId && (tryTrainingFocus(s) || openScheduledEvent(s, "training"))) { day.active = [...active]; return pause(); }
        const injured = !!p.injury && date < p.injury.unavailableUntil;
        let trained = false;
        if (p.id === s.playerId && injured) s.injuryDays++;
        if (training && available(p, date) && ticketsUsed(p.trainingPolicy) && !(p.id===s.playerId && day.skipPlayerTraining)) {
          const hasGame = playingTeams.has(p.teamId);
          const a = hasGame ? appearances.has(p.id) ? params["training.game_fraction"] : params["training.bench_fraction"] : 1;
          const accum = accumulation(p.stats.stamina);
          train(p, a);
          if (p.id === s.playerId && p.transferAdaptation?.weeksRemaining) progress.adaptationTrained = true;
          const before = p.fatigue;
          p.fatigue = clamp(p.fatigue + ticketsUsed(p.trainingPolicy) * params["fatigue.ticket_cost"] * params[`fatigue.mode_${p.trainingPolicy.mode}`] * a / params["training.days"] * accum);
          if (p.id === s.playerId) day.fatigue.training += p.fatigue - before;
          active.add(p.id);
          trained = true;
        }
        if (p.fatigue >= params["fatigue.force_rest"]) p.forcedRest = true;
        if (active.has(p.id) && !injured && random(s, "injury") < injuryRisk(p.fatigue, trained)) {
          const roll = random(s, "injury"), severity = roll < params["injury.mild.weight"] ? "mild" : roll < params["injury.mild.weight"] + params["injury.moderate.weight"] ? "moderate" : "severe", prefix = `injury.${severity}`;
          const duration = params[`${prefix}.min_days`] + Math.floor(random(s, "injury") * (params[`${prefix}.max_days`] - params[`${prefix}.min_days`] + 1));
          p.injury = { severity, startDate: date, unavailableUntil: addDays(date, duration + 1), originalPenalty: Math.max(p.injury?.originalPenalty ?? 0, params[`${prefix}.penalty`]),
            penaltyRemaining: Math.max(p.injury?.penaltyRemaining ?? 0, params[`${prefix}.penalty`]), penaltyRecoverDays: Math.max(p.injury?.penaltyRecoverDays ?? 0, params[`${prefix}.recovery_days`]) };
          if (p.id === s.playerId) report.messages.push(`활동 후 ${severity === "mild" ? "경미한" : severity === "moderate" ? "보통" : "심각한"} 부상 발견 · ${duration}일 결장`);
        }
        const before = p.fatigue, recoveryMode = p.forcedRest || injured ? "rest" : p.trainingPolicy.mode;
        p.fatigue = clamp(p.fatigue - recoveryAmount(recoveryMode, active.has(p.id), p.fatigue) * dailyRecovery.get(p.id)!);
        if (p.id === s.playerId) { day.fatigue.peak = Math.max(day.fatigue.peak, before); day.fatigue.recovered += before - p.fatigue; day.fatigue.end = p.fatigue; }
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
      if(player.teamId<10)s.postSchool.pro.firstTeamWeeks+=1/7;else s.postSchool.pro.secondTeamWeeks+=1/7;
    }
    if (finishDevelopmentSeason(s)) break;
    if (!s.careerMode && player.grade === 3 && date >= s.calendar.draftDate) {
      updateReputation(s); s.draft = draftPlayers(s); s.phase = "ended";
      s.draftOutcome = {revealed:false,offer:developmentalOffer(s)};
      s.pendingEvents = [{ type: "draft", date, playerId: s.playerId }]; report.messages.push("고교 3시즌의 여정이 끝났습니다. 드래프트 결과를 확인하세요.");
      break;
    }
    s.date = addDays(date, 1);
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
  s.week++; s.report = report; s.history.push({ week: s.week, ovr: combinedOvr(player), fatigue: player.fatigue });
  delete s.weekProgress;
  return s;
}
