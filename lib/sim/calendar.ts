import type { Calendar, Competition, Game } from "./types";

export const calendarSource = "https://g1.sports.or.kr/schedule/year.do";
export const resultsSource = "https://result.sports.or.kr/BA/";
// 2026 official date windows; future seasons reuse month/day windows as a game adaptation.
// Entry rules, 10 groups of 10 fictional schools and bracket dates are game rules.
const windows = [
  ["spring", "주말리그 전반기", "03-07", "04-26", "league", "10개 조별 풀리그 · 조별 순위로 전국대회 참가 결정"],
  ["emart", "신세계 이마트배", "03-25", "04-12", "tournament", "모든 학교 참가"],
  ["gold", "황금사자기", "05-02", "05-16", "tournament", "전반기 각 조 1위 및 짝수 순위 참가"],
  ["summer", "주말리그 후반기", "05-23", "06-21", "league", "10개 조별 풀리그 · 각 조 상위 4팀 대통령배 진출"],
  ["blue", "청룡기", "06-27", "07-11", "tournament", "전반기 각 조 1위 및 홀수 순위 참가"],
  ["president", "대통령배", "07-18", "07-30", "tournament", "후반기 각 조 상위 4팀 참가"],
  ["phoenix", "봉황대기", "08-07", "08-27", "tournament", "모든 학교 참가"],
] as const;

const add = (date: string, days: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const competitionName = (calendar: Calendar, id: string) => calendar.competitions.find(c => c.id === id)?.name ?? "경기";
export const roundName = (remaining: number) => remaining === 2 ? "결승" : remaining === 4 ? "준결승" : `${remaining}강`;
function fixture(id: string, date: string, competitionId: string, homeTeamId: number, awayTeamId: number, round = 0): Game {
  return { id, date, homeTeamId, awayTeamId, competitionId, round, rulesetId: "high-school-v0.4", status: "scheduled", score: [0, 0], innings: [[], []], lineup: [], boxScore: {} };
}

export function buildCalendar(year: number, teamCount = 100): Calendar {
  let monday = `${year}-03-01`;
  while (new Date(monday + "T00:00:00Z").getUTCDay() !== 1) monday = add(monday, 1);
  let draftDate = `${year}-09-01`;
  while (new Date(draftDate + "T00:00:00Z").getUTCDay() !== 1) draftDate = add(draftDate, 1);
  const teams = Array.from({ length: teamCount }, (_, i) => i);
  const competitions: Competition[] = windows.map(([id, name, from, to, kind, entryRule]) => ({
    id, name, kind, startDate: `${year}-${from}`, endDate: `${year}-${to}`, entryRule,
    participantTeamIds: kind === "league" ? [...teams] : [], initialized: kind === "league", round: 0,
    roundDates: [], byes: [], championTeamId: null,
  }));
  for (const competition of competitions.filter(c => c.kind === "league")) {
    while (new Date(competition.startDate + "T00:00:00Z").getUTCDay() !== 6) competition.startDate = add(competition.startDate, -1);
  }
  const events: Game[] = [];
  for (const competition of competitions.filter(c => c.kind === "league")) {
    const dates: string[] = [];
    for (let date = competition.startDate; date <= competition.endDate; date = add(date, 1)) {
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      if ((dow === 0 || dow === 6) && !competitions.some(c => c.kind === "tournament" && date >= c.startDate && date <= c.endDate)) dates.push(date);
    }
    // Spreading nine rounds across each window preserves weekends and prevents double headers.
    const roundDates = Array.from({ length: 9 }, (_, i) => dates[Math.round(i * (dates.length - 1) / 8)]);
    for (let group = 0; group < teamCount / 10; group++) {
      const ring = teams.slice(group * 10, group * 10 + 10);
      for (let round = 0; round < 9; round++) {
        for (let i = 0; i < 5; i++) {
          const pair = [ring[i], ring[9 - i]];
          if ((round + (competition.id === "summer" ? 1 : 0)) % 2) pair.reverse();
          events.push(fixture(`${year}-${competition.id}-${group}-${round}-${i}`, roundDates[round], competition.id, pair[0], pair[1], round + 1));
        }
        ring.splice(1, 0, ring.pop()!);
      }
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { seasonYear: year, referenceYear: 2026, sourceKind: "reference", sourceUrl: calendarSource, competitions,
    trainingDays: Array.from({ length: 40 }, (_, w) => Array.from({ length: 5 }, (_, d) => add(monday, w * 7 + d))).flat(),
    events, draftDate, seasonEnd: `${year}-12-31` };
}

export function leagueTable(calendar: Calendar, competitionId: string, group: number) {
  const teams = calendar.competitions.find(c => c.id === competitionId)?.participantTeamIds.filter(t => Math.floor(t / 10) === group) ?? [];
  return teams.map(teamId => {
    let wins = 0, losses = 0, draws = 0, difference = 0;
    for (const game of calendar.events.filter(g => g.competitionId === competitionId && g.status !== "scheduled" && (g.homeTeamId === teamId || g.awayTeamId === teamId))) {
      const side = game.homeTeamId === teamId ? 0 : 1;
      const diff = game.status === "forfeit" ? game.forfeitTeamId === teamId ? -1 : 1 : game.score[side] - game.score[1 - side];
      if (diff > 0) wins++; else if (diff < 0) losses++; else draws++;
      difference += diff;
    }
    return { teamId, wins, losses, draws, difference, points: wins * 2 + draws };
  }).sort((a, b) => b.points - a.points || b.difference - a.difference || a.teamId - b.teamId);
}

function entrants(calendar: Calendar, competition: Competition) {
  if (competition.id === "emart" || competition.id === "phoenix") return calendar.competitions[0].participantTeamIds;
  const source = competition.id === "president" ? "summer" : "spring";
  const groups = calendar.competitions[0].participantTeamIds.length / 10;
  return Array.from({ length: groups }, (_, group) => leagueTable(calendar, source, group).filter((_, rank) =>
    competition.id === "president" ? rank < 4 : rank === 0 || (competition.id === "gold" ? rank % 2 === 1 : rank % 2 === 0)
  ).map(t => t.teamId)).flat();
}

// Local hash leaves all simulation RNG streams untouched; equivalent weekly/worker runs use identical draws.
function drawOrder(teams: number[], seed: string) {
  const score = (team: number) => {
    let h = 2166136261;
    for (const char of `${seed}:${team}`) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
    return h >>> 0;
  };
  return [...teams].sort((a, b) => score(a) - score(b) || a - b);
}
function scheduleRound(calendar: Calendar, competition: Competition, remaining: number[]) {
  const size = 2 ** Math.ceil(Math.log2(remaining.length));
  const byeCount = size - remaining.length;
  competition.byes = remaining.slice(0, byeCount);
  const playing = remaining.slice(byeCount);
  const date = competition.roundDates[competition.round - 1];
  for (let i = 0; i < playing.length; i += 2) calendar.events.push(fixture(
    `${calendar.seasonYear}-${competition.id}-r${competition.round}-${i / 2}`, date, competition.id, playing[i], playing[i + 1], competition.round,
  ));
  calendar.events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function prepareCompetitions(calendar: Calendar, date: string, seed: string) {
  for (const competition of calendar.competitions) {
    if (competition.kind !== "tournament" || competition.initialized || date !== competition.startDate) continue;
    competition.participantTeamIds = [...entrants(calendar, competition)];
    competition.initialized = true;
    const rounds = Math.ceil(Math.log2(competition.participantTeamIds.length));
    const span = Math.round((Date.parse(competition.endDate) - Date.parse(competition.startDate)) / 86400000);
    competition.roundDates = Array.from({ length: rounds }, (_, i) => add(competition.startDate, Math.round(span * i / (rounds - 1))));
    competition.round = 1;
    scheduleRound(calendar, competition, drawOrder(competition.participantTeamIds, `${seed}:${calendar.seasonYear}:${competition.id}`));
  }
}
export function finishCompetitionDay(calendar: Calendar, date: string) {
  for (const competition of calendar.competitions.filter(c => c.kind === "tournament" && c.initialized && c.championTeamId === null)) {
    const games = calendar.events.filter(g => g.competitionId === competition.id && g.round === competition.round);
    if (!games.length || games.some(g => g.date > date || g.status === "scheduled")) continue;
    const remaining = [...competition.byes, ...games.map(g => g.advancingTeamId!)];
    if (remaining.some(t => t === undefined)) throw new Error("토너먼트 진출 팀이 결정되지 않았습니다.");
    if (remaining.length === 1) { competition.championTeamId = remaining[0]; competition.byes = []; }
    else { competition.round++; scheduleRound(calendar, competition, remaining); }
  }
}
