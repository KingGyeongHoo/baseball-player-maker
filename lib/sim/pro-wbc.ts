import {available,getPlayer,isPitcher} from "./engine";
import {ensureProEvents,proDayFree,proEventsEnabled,recordProChoice} from "./pro-event-ledger";
import {selectProNationalRoster} from "./pro-national-events";
import {proSquad} from "./pro-squads";
import type {CareerEvent,GameState,Stat} from "./types";
import type {WbcEntry} from "./pro-event-types";

export const isWbcYear=(year:number)=>year>=2026&&(year-2026)%4===0;
export const wbcDates=(year:number)=>({start:`${year}-03-01`,end:`${year}-03-20`});

// March has no meaningful current-season sample yet. Keep last year's first-team
// records as the entry requirement, even after the season reset or a club move.
export function freezeWbcRoster(s:GameState):WbcEntry|undefined {
  const year=s.calendar.seasonYear,dates=wbcDates(year);
  if(!proEventsEnabled(s)||!isWbcYear(year)||s.date<dates.start||s.phase==="ended")return;
  const ledger=ensureProEvents(s),entries=ledger.wbc??={};
  if(entries[year])return entries[year];
  if(s.date>dates.end)return entries[year]={sourceYear:year-1,evaluatedAt:s.date,roster:[],offered:false,settled:true,skipped:true};
  const roster=selectProNationalRoster(s,p=>p.career.find(row=>row.careerMode==="pro"&&row.year===year-1)?.byLevel?.first);
  return entries[year]={sourceYear:year-1,evaluatedAt:s.date,roster,offered:false,settled:false};
}

function invitation(s:GameState):CareerEvent {
  const p=getPlayer(s),year=s.calendar.seasonYear,pitching=isPitcher(p.primaryRole);
  const keys:Stat[]=pitching?["velocity","control","movement"]:["contact","power","speed","defense"];
  const core=(weeks:4|6|8)=>Object.fromEntries(keys.map(key=>[key,weeks]));
  return {id:`${p.id}:${year}:WBC01`,definitionId:"WBC01",rewardVersion:3,kind:"special",date:s.date,
    title:`${year} WBC 국가대표 발탁`,description:`지난 시즌 1군 활약과 현재 평판·기량을 인정받아 3월 WBC 대표팀에 선발됐다. 국제무대에 도전할까?`,
    proEvent:{version:1,catalogId:"WBC01",channel:"major",year,playerId:p.id,teamId:p.teamId,level:proSquad(p.teamId)??"third",field:pitching?"pitching":"batting",openedAt:s.date,wbcYear:year,sourceStats:{...p.stats}},
    choices:[{id:"participate",label:"WBC 국가대표로 출전한다",outcomes:[
      {weight:5,message:"WBC MVP로 선정됐다! 세계 무대에서 보여준 활약이 큰 자신감과 성장으로 이어졌다.",weeks:core(8),reputation:10,fatigue:12,proResultId:"WBC01:mvp"},
      {weight:23.75,message:"WBC에서 인상적인 활약을 펼쳤다. 강한 상대와 겨룬 경험으로 한 단계 성장했다.",weeks:core(6),reputation:8,fatigue:10,proResultId:"WBC01:standout"},
      {weight:23.75,message:"WBC 도중 부상을 당해 남은 일정을 마쳤다. 소속팀에서 회복하며 복귀를 준비한다.",fatigue:5,injury:{severity:"moderate",days:14},proResultId:"WBC01:injury"},
      {weight:47.5,message:"큰 활약은 없었지만 WBC에서 세계적인 선수들과 겨룬 경험이 기술을 다듬는 계기가 됐다.",weeks:core(4),reputation:2,fatigue:8,proResultId:"WBC01:experience"}
    ]},{id:"decline",label:"이번에는 소속팀에서 시즌을 준비한다",outcomes:[
      {weight:50,message:"소속팀에 남아 기본기를 다듬고 시즌을 준비했다.",weeks:{[pitching?"control":"contact"]:3},fatigue:2,proResultId:"WBC01:club"},
      {weight:50,message:"WBC 참가를 사양하고 몸을 정비했다. 충분히 쉬며 시즌을 기다렸다.",fatigue:-12,proResultId:"WBC01:rest"}
    ]}]};
}

export function tryWbcInvitation(s:GameState){
  const entry=freezeWbcRoster(s);if(!entry||entry.offered||entry.settled)return false;
  const p=getPlayer(s);
  if(!entry.roster.some(row=>row.id===p.id)){entry.settled=true;return false;}
  if(s.date>wbcDates(s.calendar.seasonYear).end){entry.settled=true;entry.skipped=true;return false;}
  if(s.careerNotice||s.careerEvent||!proDayFree(s))return false;
  if(p.professional?.employment!=="active"||p.teamId<0||p.proContract?.status==="developmental"||!available(p,s.date)||p.fatigue>=80){entry.settled=true;entry.skipped=true;return false;}
  entry.offered=true;s.careerEvent=invitation(s);recordProChoice(s,s.careerEvent);return true;
}
