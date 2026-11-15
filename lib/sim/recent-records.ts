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
  const batting=target.batting,pitching=target.pitching;
  let sb:number|undefined,cs:number|undefined;
  if(Array.isArray(record)){
    batting.PA+=record[0];batting.AB+=record[1];batting.H+=record[2];batting['2B']+=record[3];batting['3B']+=record[4];batting.HR+=record[5];
    batting.BB+=record[6];batting.SO+=record[7];batting.R+=record[8];batting.RBI+=record[9];batting.GB+=record[10];batting.FB+=record[11];
    pitching.BF+=record[12];pitching.outs+=record[13];pitching.H+=record[14];pitching.BB+=record[15];pitching.SO+=record[16];pitching.HR+=record[17];pitching.R+=record[18];pitching.ER+=record[19];
    sb=record[20];cs=record[21];
  }else{
    for(const key of battingKeys)batting[key]+=record.batting[key];
    for(const key of pitchingKeys)pitching[key]+=record.pitching[key];
    sb=record.batting.SB;cs=record.batting.CS;
  }
  if(sb!==undefined)batting.SB=(batting.SB??0)+sb;
  if(cs!==undefined)batting.CS=(batting.CS??0)+cs;
}

export function recentSample(record: RecentRecord, pitching: boolean) {
  return Array.isArray(record) ? record[pitching ? 13 : 0] : pitching ? record.pitching.outs : record.batting.PA;
}
