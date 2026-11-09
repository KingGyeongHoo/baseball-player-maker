import type { Batting, Pitching, RecordLine } from "./types";

// Stable save order. Keep every statistic, but avoid two objects and twenty
// repeated property names for each of the thousands of recent plate appearances.
const battingKeys: (keyof Batting)[] = ["PA", "AB", "H", "2B", "3B", "HR", "BB", "SO", "R", "RBI", "GB", "FB"];
const pitchingKeys: (keyof Pitching)[] = ["BF", "outs", "H", "BB", "SO", "HR", "R", "ER"];
export type RecentRecord = RecordLine | number[];

export function packRecentRecord(record: RecentRecord): number[] {
  if (Array.isArray(record)) return record;
  return [...battingKeys.map(key => record.batting[key]), ...pitchingKeys.map(key => record.pitching[key])];
}

export function mergeRecentRecord(target: RecordLine, record: RecentRecord) {
  let index = 0;
  for (const key of battingKeys) target.batting[key] += Array.isArray(record) ? record[index++] : record.batting[key];
  for (const key of pitchingKeys) target.pitching[key] += Array.isArray(record) ? record[index++] : record.pitching[key];
}

export function recentSample(record: RecentRecord, pitching: boolean) {
  return Array.isArray(record) ? record[pitching ? 13 : 0] : pitching ? record.pitching.outs : record.batting.PA;
}
