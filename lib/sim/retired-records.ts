import {emptyRecord,mergeRecord} from "./engine";
import type {GameState,Player} from "./types";

// Keep small league totals for evaluation baselines, not retired NPC objects.
// Removing both legacy archive entries and retired roster entries is idempotent.
export function discardRetiredPlayers(s:GameState){
  const world=s.proWorld;if(!world)return false;
  const retired=new Map<string,Player>();
  for(const p of [...world.archive,...s.players])if(p.id!==s.playerId&&p.professional?.employment==="retired")retired.set(p.id,p);
  const changed=world.archive.length>0||retired.size>0;
  if(!changed)return false;
  const totals=world.retiredRecords??={};
  for(const p of retired.values())for(const year of [s.calendar.seasonYear,s.calendar.seasonYear-1,s.calendar.seasonYear-2]){
    const row=p.career.find(row=>row.year===year&&row.careerMode==="pro");
    const lastYear=p.professional?.agedYear??s.calendar.seasonYear;
    const levels=row?.byLevel??(year===lastYear?p.seasonByLevel:undefined);
    if(!levels)continue;
    for(const level of ["first","second"] as const)mergeRecord(totals[`${year}:${level}`]??=emptyRecord(),levels[level]);
  }
  for(const key of Object.keys(totals))if(Number(key.split(":")[0])<s.calendar.seasonYear-2)delete totals[key];
  world.archive=[];
  s.players=s.players.filter(p=>p.id===s.playerId||!retired.has(p.id));
  return true;
}
