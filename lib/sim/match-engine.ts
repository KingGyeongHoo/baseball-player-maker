import { accumulation, advanceRunners, available, clamp, effective, emptyRecord, isPitcher, lineup, mergeRecord, params, pitchingRole, probabilities, random, roleFor, selectionScore } from "./engine";
import { applyMatchEffect, openScheduledEvent } from "./event-system";
import type { Game, GameState, Player, Position } from "./types";

// Every cursor and runner is serializable: returning at a choice never replays
// an inning, consumes a match draw early, or commits a partial game twice.
export function simulateGame(s: GameState, game: Game, rosters: Player[][]): boolean {
  const players = new Map(rosters.flat().map(p => [p.id, p]));
  const player = (id: string) => players.get(id)!;
  if (!s.matchProgress) {
    const sides = rosters.map(roster => lineup(roster, game.date));
    if (sides.some(side => side.field.length < 9 || !side.starter)) {
      game.status = "forfeit";
      game.forfeitTeamId = sides[0].field.length < 9 || !sides[0].starter ? game.homeTeamId : game.awayTeamId;
      return true;
    }
    game.status = "inProgress";
    game.lineup = sides.map(side => [...side.order.map(p => p.id), side.starter.id]);
    s.matchProgress = {
      gameId: game.id, sides: sides.map(side => ({ field: side.field.map(p => p.id), order: side.order.map(p => p.id), starter: side.starter.id, pitchers: side.pitchers.map(p => p.id) })),
      original: rosters.flat().map(p => ({ id: p.id, fatigue: p.fatigue, lastPitched: p.lastPitched })),
      pitchers: sides.map(side => side.starter.id), usedPitchers: sides.map(side => [side.starter.id]), battingIndex: [0, 0], pitchOuts: [0, 0], recentEvents: [],
      defense: sides.map(side => side.field.slice(0, 8).reduce((sum, p) => sum + effective(p).defense, 0) / 8),
      arm: sides.map(side => [side.field[2], side.field[6], side.field[7]].reduce((sum, p) => sum + effective(p).arm / 3, 0)),
      inning: 1, battingSide: 1, outs: 0, pa: 0, runs: 0, bases: [null, null, null], ready: false, eventFatigue: 0,
    };
  }
  const m = s.matchProgress;
  if (m.gameId !== game.id) throw new Error("다른 경기가 진행 중입니다.");
  const line = (p: Player) => game.boxScore[p.id] ??= emptyRecord();
  const forfeit = (side: number) => {
    game.status = "forfeit"; game.forfeitTeamId = side === 0 ? game.homeTeamId : game.awayTeamId;
    game.boxScore = {}; game.lineup = []; game.innings = [[], []]; game.score = [0, 0];
    for (const original of m.original) { const p = player(original.id); p.fatigue = clamp(original.fatigue + (p.id === s.playerId ? m.eventFatigue : 0)); p.lastPitched = original.lastPitched; }
    delete s.matchProgress; delete s.matchEffect;
    return true;
  };
  let ended = false;
  const finishHalf = () => {
    game.innings[m.battingSide].push(m.runs);
    if (m.battingSide === 0) {
      if (m.inning >= params["match.regular_innings"] && game.score[0] !== game.score[1]) ended = true;
      m.inning++; m.battingSide = 1;
    } else m.battingSide = 0;
    m.outs = 0; m.pa = 0; m.runs = 0; m.bases = [null, null, null]; m.ready = false;
  };
  while (m.inning <= params["match.max_innings"] && !ended) {
    const side = m.battingSide, pitchingSide = 1 - side;
    if (side === 0 && m.inning >= params["match.regular_innings"] && game.score[0] > game.score[1] && m.pa === 0) break;
    if (m.outs >= 3) { finishHalf(); continue; }
    if (m.ready && !available(player(m.pitchers[pitchingSide]), game.date)) { m.ready = false; m.pa--; }
    if (!m.ready) {
      if (++m.pa > params["match.max_pa"]) throw new Error(`타석 안전 한도 초과: seed=${s.seed}, game=${game.id}`);
      const current = player(m.pitchers[pitchingSide]);
      const limit = m.usedPitchers[pitchingSide].length === 1 ? params["coach.starter_outs"] : pitchingRole(current) === "마무리" ? params["coach.closer_outs"] : params["coach.relief_outs"];
      if (m.pitchOuts[pitchingSide] >= limit || current.fatigue >= params["coach.replace_fatigue"] || !available(current, game.date)) {
        const lead = game.score[pitchingSide] - game.score[side];
        const next = m.sides[pitchingSide].pitchers.map(player).filter(p => !m.usedPitchers[pitchingSide].includes(p.id) && !m.sides[pitchingSide].field.includes(p.id) && available(p, game.date) && p.fatigue < params["coach.replace_fatigue"])
          .sort((a, b) => (m.inning >= 9 && lead >= 1 && lead <= 3 ? Number(pitchingRole(b) === "마무리") - Number(pitchingRole(a) === "마무리") : 0) || selectionScore(b, pitchingRole(b)) - selectionScore(a, pitchingRole(a)) || a.id.localeCompare(b.id))[0];
        if (next) { m.pitchers[pitchingSide] = next.id; m.usedPitchers[pitchingSide].push(next.id); m.pitchOuts[pitchingSide] = 0; }
        else return forfeit(pitchingSide);
      }
      m.ready = true;
    }
    const orderIndex = m.battingIndex[side] % 9;
    let batter = player(m.sides[side].order[orderIndex]);
    const pitcher = player(m.pitchers[pitchingSide]);
    if (!available(batter, game.date)) {
      const fieldIndex = m.sides[side].field.indexOf(batter.id);
      const position = (["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH"] as Position[])[fieldIndex];
      const substitute = rosters[side].filter(p => available(p, game.date) && p.twoWay?.nextAssignment !== "pitching" && !m.sides[side].field.includes(p.id) && !m.usedPitchers[side].includes(p.id) && p.eligiblePositions.includes(position))
        .sort((a, b) => selectionScore(b, roleFor(position)) - selectionScore(a, roleFor(position)) || a.id.localeCompare(b.id))[0];
      if (!substitute) return forfeit(side);
      m.sides[side].field[fieldIndex] = substitute.id; m.sides[side].order[orderIndex] = substitute.id; game.lineup[side].push(substitute.id); batter = substitute;
    }
    if ((batter.id === s.playerId || pitcher.id === s.playerId) && openScheduledEvent(s, "game", {
      gameId: game.id, inning: m.inning, battingSide: side, outs: m.outs, score: [...game.score], batting: batter.id === s.playerId,
      bases: m.bases.map(runner => runner ? player(runner.playerId).name : null), batterName: batter.name, pitcherName: pitcher.name,
    })) return false;
    m.battingIndex[side]++;
    const bat = line(batter).batting, pit = line(pitcher).pitching, b = effective(batter), p = effective(pitcher);
    const effect = s.matchEffect?.gameId === game.id && s.matchEffect.batterId === batter.id && s.matchEffect.pitcherId === pitcher.id ? s.matchEffect : undefined;
    const probs = applyMatchEffect(probabilities(b, p, m.defense[pitchingSide], m.arm[pitchingSide]), effect);
    if (s.matchEffect?.gameId === game.id) delete s.matchEffect;
    const batBefore = { ...bat }, pitBefore = { ...pit };
    bat.PA++; pit.BF++; pitcher.lastPitched = game.date;
    let walkoff = false;
    const score = (runner: { playerId: string; pitcherId: string }, hr = false) => {
      if (walkoff && !hr) return;
      game.score[side]++; m.runs++; line(player(runner.playerId)).batting.R++;
      line(player(runner.pitcherId)).pitching.R++; line(player(runner.pitcherId)).pitching.ER++; bat.RBI++;
      if (side === 0 && m.inning >= 9 && game.score[0] > game.score[1]) walkoff = true;
    };
    if (random(s, "match") < probs.bb) {
      bat.BB++; pit.BB++;
      advanceRunners(m.bases, { playerId: batter.id, pitcherId: pitcher.id }, 0, () => false, score);
    } else {
      bat.AB++;
      if (random(s, "match") < probs.hit) {
        bat.H++; pit.H++;
        const kind = random(s, "match");
        const n = kind < probs.hr ? 4 : kind < probs.hr + probs.double ? 2 : kind < probs.hr + probs.double + probs.triple ? 3 : 1;
        if (n === 4) { bat.HR++; pit.HR++; } else if (n === 2) bat["2B"]++; else if (n === 3) bat["3B"]++;
        const extra = (runner: { playerId: string; pitcherId: string }) => random(s, "match") < clamp(params["running.extra_base"] + params["running.extra_slope"] * (effective(player(runner.playerId)).speed - m.arm[pitchingSide]), params["running.extra_min"], params["running.extra_max"]);
        advanceRunners(m.bases, { playerId: batter.id, pitcherId: pitcher.id }, n, extra, score);
      } else {
        m.outs++; pit.outs++; m.pitchOuts[pitchingSide]++;
        if (random(s, "match") < probs.k) { bat.SO++; pit.SO++; }
        else if (random(s, "match") < params[`match.gb_${batter.stance.batting}`]) bat.GB++; else bat.FB++;
        pitcher.fatigue = clamp(pitcher.fatigue + params["fatigue.pitch_out"] * params[`stance.${pitcher.stance.pitching}_cost`] * accumulation(pitcher.stats.stamina));
      }
    }
    if (pit.outs === pitBefore.outs) pitcher.fatigue = clamp(pitcher.fatigue + params["fatigue.no_out_cost"] * params[`stance.${pitcher.stance.pitching}_cost`] * accumulation(pitcher.stats.stamina));
    const batRecent = emptyRecord(), pitRecent = emptyRecord();
    for (const key of Object.keys(bat)) (batRecent.batting as Record<string, number>)[key] = (bat as Record<string, number>)[key] - (batBefore as Record<string, number>)[key];
    for (const key of Object.keys(pit)) (pitRecent.pitching as Record<string, number>)[key] = (pit as Record<string, number>)[key] - (pitBefore as Record<string, number>)[key];
    m.recentEvents.push({ playerId: batter.id, record: batRecent }, { playerId: pitcher.id, record: pitRecent });
    m.ready = false;
    if (walkoff) { game.innings[side].push(m.runs); ended = true; }
  }
  game.status = "completed";
  for (let side = 0; side < 2; side++) {
    const outs = m.sides[side].pitchers.reduce((sum, id) => sum + (game.boxScore[id]?.pitching.outs ?? 0), 0);
    for (const id of m.sides[side].field.slice(0, 8)) { const p = player(id); p.fatigue = clamp(p.fatigue + params["fatigue.field_game"] * outs / 27 * accumulation(p.stats.stamina)); }
  }
  for (const [id, record] of Object.entries(game.boxScore)) {
    const p=player(id);mergeRecord(p.seasonStats,record);
    if(s.careerMode==="pro") {
      p.seasonByLevel ??= {first:emptyRecord(),second:emptyRecord()};
      mergeRecord(p.seasonByLevel[game.competitionId==="pro-first"?"first":"second"],record);
      if(id===s.playerId && game.competitionId==="pro-first" && (record.batting.PA||record.pitching.BF) && s.postSchool?.pro && !s.postSchool.pro.debutDate)s.postSchool.pro.debutDate=game.date;
    }
  }
  for (const event of m.recentEvents) { const p = player(event.playerId); p.recentAppearances.push(event.record); if (p.recentAppearances.length > 350) p.recentAppearances.shift(); }
  for (const original of m.original) {
    const p = player(original.id);
    if (p.twoWay) p.twoWay.nextAssignment = p.twoWay.nextAssignment === "pitching" ? "batting" : "pitching";
    let batting = 0, outs = 0, keepFrom = p.recentAppearances.length;
    for (let i = p.recentAppearances.length - 1; i >= 0; i--) {
      batting += p.recentAppearances[i].batting.PA; outs += p.recentAppearances[i].pitching.outs; keepFrom = i;
      if (isPitcher(p.primaryRole) ? outs >= params["coach.recent_outs"] : batting >= params["coach.recent_pa"]) break;
    }
    p.recentAppearances = p.recentAppearances.slice(keepFrom);
  }
  delete s.matchProgress; delete s.matchEffect;
  return true;
}
