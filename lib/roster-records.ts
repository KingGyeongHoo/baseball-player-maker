import {emptyRecord,isPitcher,ovr,proSelectionScore} from "./sim/engine";
import {recordRates} from "./player-records";
import type {Player,RecordLine} from "./sim/types";

export type RosterField="batting"|"pitching";
export type RosterLevel="total"|"first"|"second"|"third"|"developmental";
export {rosterGradeBands,proRosterGradeBands,rosterGrade} from "./roster-grades";
export const rosterGradeScore=(p:Player,pro=p.careerMode==="pro")=>pro?proSelectionScore(p):p.reputation;
const noRecords=emptyRecord();
export const rosterRecords=(p:Player,level:RosterLevel)=>level==="first"||level==="second"?p.seasonByLevel?.[level]??noRecords:p.seasonStats;
export function rosterFieldMember(p:Player,field:RosterField){return !!p.twoWay||isPitcher(p.primaryRole)===(field==="pitching");}
export function rosterLevelMember(p:Player,level:RosterLevel){
  if(level==="total")return true;
  if(level==="third")return p.teamId>=20&&p.teamId<30;
  if(level==="developmental")return p.teamId>=30&&p.teamId<40;
  const r=rosterRecords(p,level);
  return (level==="first"?p.teamId>=0&&p.teamId<10:p.teamId>=10&&p.teamId<20)||r.batting.PA>0||r.pitching.BF>0||!!r.games?.batting||!!r.games?.pitching;
}
type Metric={id:string;label:string;ascending?:boolean;value:(r:RecordLine)=>number|null};
const count=(r:RecordLine,key:keyof NonNullable<RecordLine["games"]>)=>r.games?.[key]??((key==="batting"?r.batting.PA:r.pitching.BF)>0?null:0);
export const rosterMetrics:Record<RosterField,Metric[]>={
  pitching:[{id:"games",label:"출전경기",value:r=>count(r,"pitching")},{id:"outs",label:"이닝",value:r=>r.pitching.outs},
    ...([['wins','승'],['losses','패'],['holds','홀드'],['saves','세이브']] as const).map(([id,label])=>({id,label,value:(r:RecordLine)=>count(r,id)})),
    {id:"era",label:"ERA",ascending:true,value:r=>recordRates(r).era}],
  batting:[{id:"games",label:"출전경기",value:r=>count(r,"batting")},...([['AB','타수'],['H','안타'],['HR','홈런'],['RBI','타점']] as const).map(([id,label])=>({id,label,value:(r:RecordLine)=>r.batting[id]})),
    {id:"avg",label:"타율",value:r=>recordRates(r).average},{id:"ops",label:"OPS",value:r=>recordRates(r).ops}],
};
export function compareRosterPlayers(a:Player,b:Player,field:RosterField,level:RosterLevel,sort:string,pro=a.careerMode==="pro"){
  const metric=rosterMetrics[field].find(m=>m.id===sort);
  const x=sort==="ovr"?ovr(a,field==="pitching"):metric?metric.value(rosterRecords(a,level)):rosterGradeScore(a,pro),y=sort==="ovr"?ovr(b,field==="pitching"):metric?metric.value(rosterRecords(b,level)):rosterGradeScore(b,pro);
  if(x==null&&y!=null)return 1;if(y==null&&x!=null)return -1;
  return (x==null||y==null?0:(metric?.ascending?x-y:y-x))||a.id.localeCompare(b.id);
}
