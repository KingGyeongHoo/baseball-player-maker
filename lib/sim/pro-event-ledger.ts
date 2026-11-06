import {addDays,getPlayer,params} from "./engine";
import type {CareerEvent,GameState} from "./types";
import type {ProEventChannel,ProEventRecord,ProEventState} from "./pro-event-types";

const aliases:Record<string,string[]>={D01:["PE01","PE02","PE05","PE06","PE07"],D02:["PE04","PE08"],D03:["PE03","PE17"],D04:["PE19","PE30"],PRO02:["PE09","PE10","PE11"],PRO04:["PE12"],PRO06:["PE13"],PRO07:["PE17"],PRO08:["PE29"],PRO15:["PE29"],PRO09:["PE18"],PRO11:["PE25","PE26"]};
export const proEventsEnabled=(s:GameState)=>s.careerMode==="pro"&&params["pro_events.enabled"]!==0;
export function ensureProEvents(s:GameState):ProEventState {
  if(s.proEvents)return s.proEvents;
  const p=getPlayer(s),history:ProEventRecord[]=[];
  for(const event of s.careerEventHistory??[]){const equivalent=aliases[event.definitionId],general=!!equivalent||event.definitionId==="S03";
    history.push({id:event.id,catalogId:event.definitionId,date:event.date,season:Number(event.date.slice(0,4)),channel:general?"general":"external",teamId:p.teamId,level:p.teamId<10?"first":"second",budget:general&&Object.values(event.stats).some(n=>(n??0)>0)});
  }
  return s.proEvents={version:1,introducedAt:s.date,history,attemptedGames:[],cancellations:[],national:{}};
}
export const equivalentProId=(record:ProEventRecord,id:string)=>record.catalogId===id||!!aliases[record.catalogId]?.includes(id);
export function proDayFree(s:GameState,date=s.date){return !ensureProEvents(s).history.some(row=>row.date===date);}
export function proChannelFree(s:GameState,channel:"general"|"game",date=s.date){
  const rows=ensureProEvents(s).history.filter(row=>row.date<=date),year=s.calendar.seasonYear;
  const last=rows.at(-1),same=rows.filter(row=>row.channel===channel),previous=same.at(-1);
  return proDayFree(s,date)&&(!last||date>=addDays(last.date,3))&&(!previous||date>=addDays(previous.date,channel==="general"?14:7))
    &&rows.filter(row=>row.season===year&&row.channel===channel&&row.budget).length<(channel==="general"?12:6);
}
export function proIdFree(s:GameState,id:string,channel:ProEventChannel,date=s.date){
  const rows=ensureProEvents(s).history.filter(row=>row.date<=date&&equivalentProId(row,id)),last=rows.at(-1);
  return !last||date>=addDays(last.date,channel==="game"?28:56);
}
export function cancelProReservation(s:GameState,reason:string){const ledger=ensureProEvents(s),reservation=ledger.reservation;if(!reservation)return;ledger.cancellations.push({id:reservation.id,date:s.date,reason});delete ledger.reservation;}
export function recordProChoice(s:GameState,event:CareerEvent,grew?:boolean){
  if(s.careerMode!=="pro")return;const ledger=ensureProEvents(s);if(ledger.history.some(row=>row.id===event.id))return;
  const p=getPlayer(s),context=event.proEvent,general=!context&&(!!aliases[event.definitionId]||event.definitionId==="S03");
  ledger.history.push({id:event.id,catalogId:context?.catalogId??event.definitionId,date:event.date,season:context?.year??s.calendar.seasonYear,channel:context?.channel??(general?"general":"external"),teamId:context?.teamId??p.teamId,level:context?.level??(p.teamId<10?"first":"second"),budget:context?context.channel==="general"||context.channel==="game":general&&(grew??true),...(context?.injuryKey?{injuryKey:context.injuryKey}:{}),...(context?.seriesId?{seriesId:context.seriesId}:{}),...(context?.chainId?{chainId:context.chainId}:{})});
  if(ledger.reservation?.date===event.date)cancelProReservation(s,"같은 날 다른 선택 사건이 발생했습니다.");
}
export function tickProEvents(s:GameState){
  if(s.careerMode!=="pro")return;const ledger=ensureProEvents(s),p=getPlayer(s);
  if(ledger.reservation&&(ledger.reservation.week!==s.week||ledger.reservation.date<s.date))cancelProReservation(s,"예약 날짜 또는 주간이 지나 취소했습니다.");
  if(p.professional?.requestedEvaluationUntil&&p.professional.requestedEvaluationUntil<s.date){ledger.cancellations.push({id:"evaluation-request",date:s.date,reason:"21일 검토 기간이 끝났습니다. 출전 기록은 추가하지 않습니다."});delete p.professional.requestedEvaluationUntil;}
}
