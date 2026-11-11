import type { Pitching, RecordLine } from "./types";

// Stable save order. Keep every statistic, but avoid two objects and twenty
// repeated property names for each of the thousands of recent plate appearances.
const battingKeys = ["PA", "AB", "H", "2B", "3B", "HR", "BB", "SO", "R", "RBI", "GB", "FB"] as const;
const pitchingKeys: (keyof Pitching)[] = ["BF", "outs", "H", "BB", "SO", "HR", "R", "ER"];
export type RecentRecord = RecordLine | number[];

export function packRecentRecord(record: RecentRecord): number[] {
  if (Array.isArray(record)) return record;
  const packed=[...battingKeys.map(key => record.batting[key]), ...pitchingKeys.map(key => record.pitching[key])];
  if(record.batting.SB!==undefined||record.batting.CS!==undefined)packed.push(record.batting.SB??0,record.batting.CS??0);
  return packed;
}

export function mergeRecentRecord(target: RecordLine, record: RecentRecord) {
  let index = 0;
  for (const key of battingKeys) target.batting[key] += Array.isArray(record) ? record[index++] : record.batting[key];
  for (const key of pitchingKeys) target.pitching[key] += Array.isArray(record) ? record[index++] : record.pitching[key];
  const sb=Array.isArray(record)?record[20]:record.batting.SB,cs=Array.isArray(record)?record[21]:record.batting.CS;
  if(sb!==undefined)target.batting.SB=(target.batting.SB??0)+sb;
  if(cs!==undefined)target.batting.CS=(target.batting.CS??0)+cs;
}

export function recentSample(record: RecentRecord, pitching: boolean) {
  return Array.isArray(record) ? record[pitching ? 13 : 0] : pitching ? record.pitching.outs : record.batting.PA;
}
