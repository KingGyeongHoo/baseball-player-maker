import data from "./pro-event-catalog.json";
import {getPlayer,isPitcher,positions} from "./engine";
import type {CareerEvent,CareerEventBranch,EventRewardWeeks,GameState,Stat} from "./types";
import type {ProEventContext} from "./pro-event-types";
import type {EventRule,EventCategory} from "./event-stories";
import type {EventFocusRule} from './event-selection';

type Definition={id:string;title:string;description:string;category?:EventCategory;focus?:EventFocusRule;pitchingFocus?:EventFocusRule;battingFocus?:EventFocusRule;rule?:EventRule;choices:{id:string;label:string;outcomes:(Omit<CareerEventBranch,"weeks">&{weeks?:Record<string,number>;trial?:boolean;requestChance?:boolean})[]}[]};
export const proEventCatalog=data as Definition[];
export const proBattingStats:Stat[]=["contact","power","speed","defense"],proPitchingStats:Stat[]=["velocity","control","movement"];
export function createProEvent(s:GameState,id:string,context:ProEventContext):CareerEvent {
  const definition=proEventCatalog.find(row=>row.id===id);if(!definition)throw new Error("알 수 없는 프로 이벤트입니다.");
  const p=getPlayer(s),keys=context.field==="pitching"?proPitchingStats:proBattingStats;
  const weak=(keys:Stat[])=>[...keys].sort((a,b)=>p.stats[a]-p.stats[b])[0],strong=[...keys].sort((a,b)=>p.stats[b]-p.stats[a])[0];
  // Shared requests and milestones retain their actions for both fields; freeze
  // their concrete motion text and field-specific rewards when the event opens.
  const pitching=context.field==='pitching';
  const resolve=(name:string):Stat[]=>name==="core"?keys:name==="weak"?[weak(keys)]:name==="strong"?[strong]:name==="pitchingWeak"?[weak(proPitchingStats)]:name==="battingWeak"?[weak(proBattingStats)]:name==="precision"?[pitching?"control":"contact"]:name==="force"?[pitching?"velocity":"power"]:name==='pitchShape'?[pitching?'movement':'contact']:name==='burst'?[pitching?'velocity':'speed']:name==='fielding'?[pitching?'control':'defense']:[name as Stat];
  const motions:Record<string,string>={'{정교 훈련}':pitching?'같은 미트에 반복해서 던지는 투구':'배트 중심에 반복해서 맞히는 타격','{힘 훈련}':pitching?'하체로 밀고 앞다리로 버티는 투구':'하체 회전을 끝까지 잇는 스윙','{구종 훈련}':pitching?'익숙한 팔 동작으로 변화구를 꺾는 투구':'변화구를 끝까지 보고 맞히는 타격','{첫발 훈련}':pitching?'투구판에서 디딤발로 힘을 옮기는 동작':'첫 세 걸음을 짧게 잇는 주루','{수비 훈련}':pitching?'주자가 있을 때도 코스를 유지하는 투구':'타구를 잡고 발을 정리해 던지는 수비'};
  const text=(value:string)=>Object.entries(motions).reduce((result,[token,replacement])=>result.replaceAll(token,replacement),value);
  const frozen={...context,sourceStats:{...p.stats}},choices=definition.choices.map(choice=>({...choice,label:text(choice.label),outcomes:choice.outcomes.map((branch,index)=>{
    const {trial,requestChance,weeks,...base}=branch,result:CareerEventBranch={...base,message:text(base.message),proResultId:`${id}:${choice.id}:${index+1}`};
    if(weeks){result.weeks={};for(const [name,n]of Object.entries(weeks))for(const key of resolve(name))result.weeks[key]=Math.max(result.weeks[key]??0,n) as EventRewardWeeks;}
    if(trial){if(!context.target)throw new Error("보직 평가의 목표가 없습니다.");result.proRoleTrial=context.target;}
    if(requestChance)result.proChanceRequest=true;
    return result;
  })}));
  const title=context.channel==="followup"?"보직 평가 후 결정":definition.title;
  const eventPosition=p.twoWay?(pitching?p.twoWay.pitchingPosition:p.twoWay.battingPosition):p.position;
  let description=text(definition.description).replaceAll("{현재 포지션}",positions[eventPosition]).replaceAll("{목표 포지션}",positions[context.target??eventPosition]).replaceAll("{목표 역할}",positions[context.target??eventPosition]);
  if(context.partnerId){const partner=s.players.find(q=>q.id===context.partnerId);if(partner)description=`${partner.name} 선수와 함께합니다. ${description}`;}
  return {id:`${p.id}:${context.year}:${s.date}:${id}:${context.channel}`,rewardVersion:3,definitionId:id,kind:context.channel==="game"?"game":"special",date:s.date,title,description,choices,proEvent:frozen,...(context.story?{story:context.story}:{})};
}
export const proMainField=(s:GameState)=>isPitcher(getPlayer(s).primaryRole)?"pitching" as const:"batting" as const;
