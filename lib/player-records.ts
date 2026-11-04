import { emptyRecord, mergeRecord } from "./sim/engine";
import type { Player, RecordLine } from "./sim/types";

export type PlayerSeason = {
  year: number;
  grade: number;
  current: boolean;
  records: RecordLine;
};

export function playerSeasons(player: Player, currentYear: number): PlayerSeason[] {
  const seasons = new Map<number, PlayerSeason>();
  for (const season of player.career) {
    seasons.set(season.year, { year: season.year, grade: season.grade, current: false, records: season.records });
  }
  seasons.set(currentYear, { year: currentYear, grade: player.grade, current: true, records: player.seasonStats });
  return [...seasons.values()].sort((a, b) => a.year - b.year);
}

export function totalRecords(seasons: PlayerSeason[]): RecordLine {
  const total = emptyRecord();
  for (const season of seasons) mergeRecord(total, season.records);
  return total;
}

export function recordRates(records: RecordLine) {
  const b = records.batting, p = records.pitching;
  const average = b.AB ? b.H / b.AB : null;
  const obp = b.PA ? (b.H + b.BB) / b.PA : null;
  const slugging = b.AB ? (b.H + b["2B"] + 2 * b["3B"] + 3 * b.HR) / b.AB : null;
  return {
    average, obp, slugging,
    ops: obp !== null && slugging !== null ? obp + slugging : null,
    era: p.outs ? 27 * p.ER / p.outs : null,
    whip: p.outs ? 3 * (p.H + p.BB) / p.outs : null,
  };
}

export const formatInnings = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
