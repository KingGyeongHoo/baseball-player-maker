import type { RecordLine } from "./types";
import {migratePackedRecord} from '../record-schema';

// The leading version marker keeps legacy array offsets unambiguous.
export type RecentRecord = RecordLine | number[];

export function packRecentRecord(record: RecentRecord): number[] {
  if (Array.isArray(record)) return migratePackedRecord(record);
  const b=record.batting,p=record.pitching;
  const packed=[-2,b.PA,b.AB,b.H,b['2B'],b['3B'],b.HR,b.BB,b.SO,b.R,b.RBI,p.BF,p.outs,p.H,p.BB,p.SO,p.HR,p.R,p.ER];
  if(record.batting.SB!==undefined||record.batting.CS!==undefined)packed.push(record.batting.SB??0,record.batting.CS??0);
  return packed;
}

export function mergeRecentRecord(target: RecordLine, record: RecentRecord) {
  const batting=target.batting,pitching=target.pitching;
  let sb:number|undefined,cs:number|undefined;
  if(Array.isArray(record)){
    // Read both saved layouts directly, avoiding callbacks and legacy copies
    // in the selection-score hot path. Legacy GB/FB occupy slots 10 and 11.
    const b=record[0]===-2?1:0,p=b?11:12;
    batting.PA+=record[b];batting.AB+=record[b+1];batting.H+=record[b+2];
    batting['2B']+=record[b+3];batting['3B']+=record[b+4];batting.HR+=record[b+5];
    batting.BB+=record[b+6];batting.SO+=record[b+7];batting.R+=record[b+8];batting.RBI+=record[b+9];
    pitching.BF+=record[p];pitching.outs+=record[p+1];pitching.H+=record[p+2];pitching.BB+=record[p+3];
    pitching.SO+=record[p+4];pitching.HR+=record[p+5];pitching.R+=record[p+6];pitching.ER+=record[p+7];
    sb=record[p+8];cs=record[p+9];
  }else{
    const b=record.batting,p=record.pitching;
    batting.PA+=b.PA;batting.AB+=b.AB;batting.H+=b.H;batting['2B']+=b['2B'];batting['3B']+=b['3B'];
    batting.HR+=b.HR;batting.BB+=b.BB;batting.SO+=b.SO;batting.R+=b.R;batting.RBI+=b.RBI;
    pitching.BF+=p.BF;pitching.outs+=p.outs;pitching.H+=p.H;pitching.BB+=p.BB;
    pitching.SO+=p.SO;pitching.HR+=p.HR;pitching.R+=p.R;pitching.ER+=p.ER;
    sb=record.batting.SB;cs=record.batting.CS;
  }
  if(sb!==undefined)batting.SB=(batting.SB??0)+sb;
  if(cs!==undefined)batting.CS=(batting.CS??0)+cs;
}

export function recentSample(record: RecentRecord, pitching: boolean) {
  return Array.isArray(record) ? record[record[0]===-2?(pitching?12:1):(pitching?13:0)] : pitching ? record.pitching.outs : record.batting.PA;
}
