import { available, getPlayer, hash, isPitcher, params, random, ticketsUsed } from "./engine";
import type { CareerEvent, CareerEventBranch, GameState, Player, Stat } from "./types";
import {proChannelFree,proEventsEnabled,recordProChoice} from "./pro-event-ledger";

export function createTrainingFocus(p: Player, date: string, week: number): CareerEvent {
  const pitching: [Stat,string][] = [["velocity","구속"],["control","제구"],["movement","변화구"]];
  const batting: [Stat,string][] = [["contact","컨택"],["power","파워"],["speed","주루"],["defense","수비"]];
  const skills=p.twoWay?[...pitching,...batting]:isPitcher(p.primaryRole)?pitching:batting;
  const result=(weeks:CareerEventBranch["weeks"],label:string):CareerEventBranch=>({weight:100,message:`${label}에 집중하며 새로운 훈련 성과를 쌓았다.`,weeks});
  return {id:`${p.id}:${week}:S03`,definitionId:"S03",rewardVersion:2,kind:"training",date,title:"오늘은 어떤 훈련을 집중적으로 해볼까?",
    description:"훈련 중 나에게 집중할 시간이 생겼다. 오늘의 시간을 어떻게 보낼까?",
    choices:[...skills.map(([key,label])=>({id:key,label:`${label} 훈련에 집중한다`,outcomes:[result({[key]:1},label)]})),
      {id:"physical",label:"피지컬 훈련에 집중한다",outcomes:[result({stamina:1,recovery:1,arm:1},"피지컬")]},
      {id:"rest",label:"오늘은 푹 쉰다",outcomes:[{weight:100,message:"훈련을 잠시 내려놓고 몸과 마음을 쉬게 했다.",recoveryPercent:{min:10,max:20},skipTraining:true}]}]};
}
export function tryTrainingFocus(s:GameState) {
  const progress=s.weekProgress,p=getPlayer(s);
  if(proEventsEnabled(s)&&(!proChannelFree(s,"general")||s.proEvents?.reservation?.date===s.date))return false;
  if(s.careerEventHistory?.at(-1)?.date && s.careerEventHistory.at(-1)!.date >= (progress?.report?.from ?? s.date))return false;
  if(s.phase==="ended"||!progress||progress.opportunity||s.careerEvent||("careerNotice" in s && s.careerNotice)||s.matchProgress||params["events.weekly_chance"]<=0||s.week-(s.lastCareerEventWeek??0)<params["events.gap_weeks"]
    ||!s.calendar.trainingDays.includes(s.date)||!available(p,s.date)||!ticketsUsed(p.trainingPolicy))return false;
  const ledger=s.trainingFocus??={rng:hash(`${s.seed}:training-focus`),rolledWeek:-1};
  if(ledger.rolledWeek===s.week)return false;
  ledger.rolledWeek=s.week;
  const source={rngStates:{...s.rngStates,events:ledger.rng}},roll=random(source,"events");ledger.rng=source.rngStates.events;
  if(roll>=(params["events.focus_chance"]??.2))return false;
  s.careerEvent=createTrainingFocus(p,s.date,s.week);s.lastCareerEventWeek=s.week;
  recordProChoice(s,s.careerEvent);
  const events=s.eventLedger??={recent:[],centerGrades:[],nationalGrades:[],competitions:[],games:[]};events.recent.push("S03");events.recent=events.recent.slice(-5);
  return true;
}
