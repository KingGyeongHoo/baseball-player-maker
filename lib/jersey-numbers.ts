import {hash} from "./sim/engine";
import {startingAssignments} from "./roster-status";
import type {GameState,Position} from "./sim/types";

export const schoolStarterNumbers:Partial<Record<Position,number>>={SP:1,C:2,"1B":3,"2B":4,"3B":5,SS:6,LF:7,CF:8,RF:9,CP:10};
export function randomJerseyNumber(mode:"school"|"pro",previous?:number|null,random= Math.random) {
  const min=mode==="school"?11:1,max=mode==="school"?23:99;
  const pool=Array.from({length:max-min+1},(_,i)=>min+i).filter(n=>n!==previous);
  return pool[Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)))];
}
export function syncJerseyNumbers(state:GameState,releaseFreshmen=false) {
  const mode=state.careerMode?"pro":"school",groups=new Map<string,typeof state.players>();
  for(const p of state.players){
    if(releaseFreshmen||mode==="pro")delete p.freshmanReserve;
    const key=p.teamId<0?p.id:String(mode==="pro"&&state.careerMode==="pro"?p.teamId%10:p.teamId);
    const group=groups.get(key)??[];group.push(p);groups.set(key,group);
  }
  for(const roster of groups.values()){
    const slots=mode==="school"?startingAssignments(roster):new Map<string,Position>(),used=new Set<number>();
    for(const p of roster){
      if(p.jerseyKind!==mode)delete p.jerseyNumber;
      p.jerseyKind=mode;
      const slot=slots.get(p.id),fixed=slot?schoolStarterNumbers[slot]:undefined;
      if(fixed!==undefined){p.jerseyNumber=fixed;used.add(fixed);}
    }
    const reserves=roster.filter(p=>!schoolStarterNumbers[slots.get(p.id)!]).sort((a,b)=>Number(b.id===state.playerId)-Number(a.id===state.playerId)||a.id.localeCompare(b.id));
    for(const p of reserves){
      const min=mode==="school"?11:1,max=mode==="school"&&p.id===state.playerId?23:99;
      const n=p.jerseyNumber;
      if(!Number.isInteger(n)||n!<min||n!>max||used.has(n!)){
        const pool=Array.from({length:max-min+1},(_,i)=>min+i).filter(n=>!used.has(n));
        p.jerseyNumber=pool[hash(`${state.seed}:${p.id}:${mode}:jersey`)%pool.length];
      }
      used.add(p.jerseyNumber!);
    }
  }
  return state;
}
export function choosePlayerJersey(state:GameState,number?:number) {
  const p=state.players.find(p=>p.id===state.playerId)!;
  if(number!==undefined){
    const school=!state.careerMode,min=school?11:1,max=school?23:99;
    if(!Number.isInteger(number)||number<min||number>max)throw new Error("등번호 범위를 확인해 주세요.");
    p.jerseyNumber=number;p.jerseyKind=school?"school":"pro";
    for(const other of state.players)if(other.id!==p.id&&other.jerseyNumber===number&&(school?other.teamId===p.teamId:other.teamId>=0&&other.teamId%10===p.teamId%10))delete other.jerseyNumber;
  }
  return syncJerseyNumbers(state);
}
