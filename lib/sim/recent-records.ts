import type { Pitching, RecordLine } from "./types";
import {migratePackedRecord} from '../record-schema';

// The leading version marker keeps legacy array offsets unambiguous.
const battingKeys = ["PA", "AB", "H", "2B", "3B", "HR", "BB", "SO", "R", "RBI"] as const;
const pitchingKeys: (keyof Pitching)[] = ["BF", "outs", "H", "BB", "SO", "HR", "R", "ER"];
export type RecentRecord = RecordLine | number[];

export function packRecentRecord(record: RecentRecord): number[] {
  if (Array.isArray(record)) return migratePackedRecord(record);
  const packed=[-2,...battingKeys.map(key => record.batting[key]), ...pitchingKeys.map(key => record.pitching[key])];
  if(record.batting.SB!==undefined||record.batting.CS!==undefined)packed.push(record.batting.SB??0,record.batting.CS??0);
  return packed;
}

export function mergeRecentRecord(target: RecordLine, record: RecentRecord) {
  const batting=target.batting,pitching=target.pitching;
  let sb:number|undefined,cs:number|undefined;
  if(Array.isArray(record)){
    const values=packRecentRecord(record);
    battingKeys.forEach((key,i)=>batting[key]+=values[i+1]);
    pitchingKeys.forEach((key,i)=>pitching[key]+=values[i+11]);
    sb=values[19];cs=values[20];
  }else{
    for(const key of battingKeys)batting[key]+=record.batting[key];
    for(const key of pitchingKeys)pitching[key]+=record.pitching[key];
    sb=record.batting.SB;cs=record.batting.CS;
  }
  if(sb!==undefined)batting.SB=(batting.SB??0)+sb;
  if(cs!==undefined)batting.CS=(batting.CS??0)+cs;
}

export function recentSample(record: RecentRecord, pitching: boolean) {
  return Array.isArray(record) ? record[record[0]===-2?(pitching?12:1):(pitching?13:0)] : pitching ? record.pitching.outs : record.batting.PA;
}
