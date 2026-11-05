import { available, getPlayer, isPitcher, params, random, ticketsUsed } from "./engine";
import type { CareerEvent, GameState, Stat } from "./types";

export function tryDevelopmentEvent(s: GameState) {
  if (!s.careerMode || s.careerEvent || s.careerNotice || s.weekProgress?.remainingDays !== 7 || s.weekProgress.day?.phase !== "beforeGames") return false;
  const p=getPlayer(s);
  // One roll at the opening date of this week. Ledger prevents duplicate
  // opportunities when a notice or another checkpoint resumes the same day.
  const ledger=s.eventLedger ??= {recent:[],centerGrades:[],nationalGrades:[],competitions:[],games:[]};
  const key=`development-week-${s.week}`;
  if(ledger.games.includes(key))return false;
  ledger.games.push(key);ledger.games=ledger.games.slice(-30);
  if(s.week-(s.lastCareerEventWeek??0)<3 || !available(p,s.date) || !ticketsUsed(p.trainingPolicy) || !s.calendar.trainingDays.includes(s.date) || random(s,"events")>=params["events.weekly_chance"])return false;
  const skill:Stat=isPitcher(p.primaryRole)?"control":"contact",other:Stat=isPitcher(p.primaryRole)?"movement":"power";
  const events:Omit<CareerEvent,"id"|"date"|"rewardVersion"|"kind">[]=[
    {definitionId:"D01",title:"선배의 개인 레슨",description:"훈련을 지켜보던 선배가 자신이 터득한 요령을 알려주겠다고 했다.",choices:[
      {id:"learn",label:"선배에게 배우며 연습한다",outcomes:[{weight:75,message:"조언을 내 동작에 적용할 실마리를 찾았다.",weeks:{[skill]:3},fatigue:1},{weight:25,message:"당장 손에 익지는 않았지만 뜻깊은 대화였다.",reputation:1}]},
      {id:"own",label:"현재 훈련 계획에 집중한다",outcomes:[{weight:100,message:"익숙한 루틴으로 훈련을 이어갔다.",fatigue:-1}]}]},
    {definitionId:"D02",title:"코치의 추가 훈련 제안",description:"코치가 부족한 부분을 보완하는 추가 연습에 함께하자고 제안했다.",choices:[
      {id:"extra",label:"추가 연습에 참가한다",outcomes:[{weight:65,message:"집중 연습이 새로운 감각으로 이어졌다.",weeks:{[other]:4},fatigue:3},{weight:20,message:"무리한 동작 뒤 불편감이 생겨 회복이 필요해졌다.",injury:{severity:"mild",days:7}},{weight:15,message:"노력은 했지만 오늘은 몸이 무거웠다.",fatigue:2}]},
      {id:"manage",label:"현재 컨디션에 맞춰 마무리한다",outcomes:[{weight:100,message:"계획한 양만 소화하고 몸을 정비했다.",fatigue:-2}]}]},
    {definitionId:"D03",title:"전력 분석실의 영상",description:"분석 담당자가 최근 플레이 영상을 함께 보자고 한다. 반복되는 습관을 찾을 수 있을까.",choices:[
      {id:"review",label:"영상을 보며 개선점을 찾는다",outcomes:[{weight:70,message:"평소 놓쳤던 습관을 알아챘다.",weeks:{[skill]:3},reputation:1},{weight:30,message:"상황을 읽는 데 도움이 되는 장면을 발견했다.",weeks:{bq:3}}]},
      {id:"routine",label:"개인 루틴을 먼저 챙긴다",outcomes:[{weight:100,message:"내 몸의 리듬을 정돈했다.",fatigue:-1}]}]},
    {definitionId:"D04",title:"동료와의 약속",description:"함께 경쟁하는 동료가 서로 연습을 봐주자고 한다. 오늘의 마무리를 어떻게 보낼까.",choices:[
      {id:"together",label:"함께 연습하고 피드백을 나눈다",outcomes:[{weight:60,message:"서로 도우며 더 정확하게 연습했다.",weeks:{[skill]:3},fatigue:1},{weight:40,message:"팀 안에서 신뢰를 쌓았다.",reputation:2}]},
      {id:"recover",label:"몸을 풀며 동료와 대화한다",outcomes:[{weight:100,message:"가볍게 몸을 풀고 긴장을 덜었다.",fatigue:-2,reputation:1}]}]},
  ];
  const choices=events.filter(event=>!ledger.recent.slice(-2).includes(event.definitionId));
  const event=choices[Math.floor(random(s,"events")*choices.length)];
  s.careerEvent={...event,id:`${p.id}:${s.date}:${event.definitionId}`,date:s.date,rewardVersion:2,kind:"special"};
  ledger.recent.push(event.definitionId);ledger.recent=ledger.recent.slice(-5);s.lastCareerEventWeek=s.week;return true;
}
