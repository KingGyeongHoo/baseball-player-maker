import { addDays } from "./engine";
import { leagueTable } from "./calendar";
import type { Calendar, Competition, Game } from "./types";
export function careerLeagueTable(calendar:Calendar,id:string) {
  const participants=calendar.competitions.find(c=>c.id===id)?.participantTeamIds??[];
  return [...new Set(participants.map(team=>Math.floor(team/10)))].flatMap(group=>leagueTable(calendar,id,group))
    .sort((a,b)=>b.points-a.points||b.difference-a.difference||a.teamId-b.teamId);
}

function schedule(year: number, ids: number[], cycles: number, weekdays: number[], start: string, id: string) {
  const games: Game[] = [], ring = [...ids];
  let date = `${year}-${start}`;
  for (let cycle = 0; cycle < cycles; cycle++) for (let round = 0; round < ids.length - 1; round++) {
    while (!weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) date = addDays(date, 1);
    for (let i = 0; i < ids.length / 2; i++) {
      const pair = [ring[i], ring[ids.length - 1 - i]];
      if ((cycle + round) % 2) pair.reverse();
      games.push({ id: `${year}-${id}-${cycle}-${round}-${i}`, date, homeTeamId: pair[0], awayTeamId: pair[1], competitionId: id,
        round: cycle * (ids.length - 1) + round + 1, rulesetId: "career-league-v0.6", status: "scheduled", score: [0, 0], innings: [[], []], lineup: [], boxScore: {} });
    }
    ring.splice(1, 0, ring.pop()!); date = addDays(date, 1);
  }
  return games;
}
export function developmentCalendar(year: number, pro: boolean): Calendar {
  const definitions = pro ? [{ id: "pro-first", name: "프로 1군 정규리그", ids: Array.from({ length: 10 }, (_, i) => i), cycles: 16, weekdays: [0,2,3,4,5,6] },
    { id: "pro-second", name: "프로 2군 육성리그", ids: Array.from({ length: 10 }, (_, i) => i + 10), cycles: 8, weekdays: [2,4,6] }]
    : [{ id: "college", name: "대학 육성리그", ids: Array.from({ length: 12 }, (_, i) => i), cycles: 4, weekdays: [2,4,6] }];
  const events = definitions.flatMap(c => schedule(year, c.ids, c.cycles, c.weekdays, "03-22", c.id)).sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const competitions: Competition[] = definitions.map(c => ({ id: c.id, name: c.name, kind: "league", startDate: events.find(g => g.competitionId === c.id)!.date,
    endDate: events.filter(g => g.competitionId === c.id).at(-1)!.date, entryRule: "가상 구단·게임용 라운드 로빈 일정", participantTeamIds: c.ids, initialized: true,
    round: 0, roundDates: [], byes: [], championTeamId: null }));
  const seasonEnd = events.at(-1)!.date, trainingDays: string[] = [];
  for (let day = `${year}-03-01`; day <= seasonEnd; day = addDays(day, 1)) {
    if (![0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) trainingDays.push(day);
  }
  return { seasonYear: year, sourceKind: "fictional", sourceUrl: "", referenceYear: year, competitions, events, trainingDays, draftDate: seasonEnd, seasonEnd };
}
