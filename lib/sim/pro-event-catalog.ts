import data from "./pro-event-catalog.json";
import {getPlayer,isPitcher,positions} from "./engine";
import type {CareerEvent,CareerEventBranch,EventRewardWeeks,GameState,Stat} from "./types";
import type {ProEventContext} from "./pro-event-types";

type Definition={id:string;title:string;description:string;choices:{id:string;label:string;outcomes:(Omit<CareerEventBranch,"weeks">&{weeks?:Record<string,number>;trial?:boolean;requestChance?:boolean})[]}[]};
export const proEventCatalog=data as Definition[];
export const proBattingStats:Stat[]=["contact","power","speed","defense"],proPitchingStats:Stat[]=["velocity","control","movement"];
export function createProEvent(s:GameState,id:string,context:ProEventContext):CareerEvent {
  const definition=proEventCatalog.find(row=>row.id===id);if(!definition)throw new Error("알 수 없는 프로 이벤트입니다.");
  const p=getPlayer(s),keys=context.field==="pitching"?proPitchingStats:proBattingStats;
  const weak=(keys:Stat[])=>[...keys].sort((a,b)=>p.stats[a]-p.stats[b])[0],strong=[...keys].sort((a,b)=>p.stats[b]-p.stats[a])[0];
  const resolve=(name:string):Stat[]=>name==="core"?keys:name==="weak"?[weak(keys)]:name==="strong"?[strong]:name==="pitchingWeak"?[weak(proPitchingStats)]:name==="battingWeak"?[weak(proBattingStats)]:name==="precision"?[context.field==="pitching"?"control":"contact"]:name==="force"?[context.field==="pitching"?"velocity":"power"]:[name as Stat];
  const frozen={...context,sourceStats:{...p.stats}},choices=definition.choices.map(choice=>({...choice,outcomes:choice.outcomes.map((branch,index)=>{
    const {trial,requestChance,weeks,...base}=branch,result:CareerEventBranch={...base,proResultId:`${id}:${choice.id}:${index+1}`};
    if(weeks){result.weeks={};for(const [name,n]of Object.entries(weeks))for(const key of resolve(name))result.weeks[key]=Math.max(result.weeks[key]??0,n) as EventRewardWeeks;}
    if(trial){if(!context.target)throw new Error("보직 평가의 목표가 없습니다.");result.proRoleTrial=context.target;}
    if(requestChance)result.proChanceRequest=true;
    return result;
  })}));
  const title=context.channel==="followup"?"보직 평가 후 결정":definition.title;
  let description=definition.description.replaceAll("{현재 포지션}",positions[p.position]).replaceAll("{목표 포지션}",positions[context.target??p.position]).replaceAll("{목표 역할}",positions[context.target??p.position]);
  if(context.partnerId){const partner=s.players.find(q=>q.id===context.partnerId);if(partner)description=`${partner.name} 선수와 함께합니다. ${description}`;}
  return {id:`${p.id}:${context.year}:${s.date}:${id}:${context.channel}`,rewardVersion:3,definitionId:id,kind:context.channel==="game"?"game":"special",date:s.date,title,description,choices,proEvent:frozen};
}
export const proMainField=(s:GameState)=>isPitcher(getPlayer(s).primaryRole)?"pitching" as const:"batting" as const;
