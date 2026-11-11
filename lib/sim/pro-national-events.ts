import {addDays,available,getPlayer,isPitcher,proSelectionScore,roleScore} from "./engine";
import {createProEvent} from "./pro-event-catalog";
import {ensureProEvents,proDayFree,proEventsEnabled,recordProChoice} from "./pro-event-ledger";
import type {GameState,Player,Position,RecordLine} from "./types";
import type {NationalRosterMember} from "./pro-event-types";

export function selectProNationalRoster(s:GameState,records:(p:Player)=>RecordLine|undefined):NationalRosterMember[]{
  const eligible=s.players.filter(p=>p.careerMode==="pro"&&p.professional?.employment==="active"&&p.teamId>=0&&p.proContract?.status!=="developmental"&&available(p,s.date)&&p.fatigue<80);
  const qualified=(p:Player)=>isPitcher(p.primaryRole)?(records(p)?.pitching.outs??0)>=90:(records(p)?.batting.PA??0)>=100;
  const scores=new Map(eligible.map(p=>[p.id,proSelectionScore(p,p.primaryRole,{first:records(p)},false)]));
  const ranked=eligible.filter(qualified).sort((a,b)=>scores.get(b.id)!-scores.get(a.id)!||roleScore(b)-roleScore(a)||a.id.localeCompare(b.id)),selected:Player[]=[],used=new Set<string>();
  const take=(positions:Position[],count:number)=>{for(const p of ranked.filter(p=>positions.includes(p.position)&&!used.has(p.id)).slice(0,count)){selected.push(p);used.add(p.id);}};
  take(["SP"],6);take(["RP","CP"],6);take(["C"],2);for(const pos of ["1B","2B","3B","SS"] as Position[])take([pos],1);take(["LF","CF","RF"],4);
  const extra=ranked.find(p=>!used.has(p.id)&&!isPitcher(p.primaryRole));if(extra)selected.push(extra);
  return selected.map(p=>({id:p.id,position:p.position,selectionScore:scores.get(p.id)!,roleScore:roleScore(p)}));
}

export function freezeProNational(s:GameState){
  if(!proEventsEnabled(s)||!s.proWorld?.seasonClosed||s.calendar.events.some(g=>(g.competitionId==="pro-first"||g.competitionId==="pro-second"||g.competitionId.startsWith("pro-playoffs-"))&&["scheduled","inProgress"].includes(g.status)))return;
  const ledger=ensureProEvents(s),year=String(s.calendar.seasonYear);if(ledger.national[year])return;
  ledger.national[year]={evaluatedAt:s.date,invitationDate:addDays(s.date,1),roster:selectProNationalRoster(s,p=>p.seasonByLevel?.first),offered:false,settled:false};
}
export function tryProNationalInvitation(s:GameState){
  if(!proEventsEnabled(s)||s.proWorld?.stage!=="summary"||s.careerNotice||s.careerEvent)return false;
  const p=getPlayer(s),entry=s.proEvents?.national[String(s.calendar.seasonYear)];if(!entry||entry.offered||entry.settled)return false;
  if(!entry.roster.some(row=>row.id===p.id)||p.professional?.employment!=="active"||p.teamId<0){entry.settled=true;return false;}
  if(!proDayFree(s,entry.invitationDate))return false;
  s.date=entry.invitationDate;entry.offered=true;
  s.careerEvent=createProEvent(s,"PE27",{version:1,catalogId:"PE27",channel:"major",year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:p.teamId<10?"first":"second",field:isPitcher(p.primaryRole)?"pitching":"batting",openedAt:s.date,nationalYear:s.calendar.seasonYear});
  recordProChoice(s,s.careerEvent);return true;
}
