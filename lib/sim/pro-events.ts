import { addDays,available, getPlayer, isPitcher, params, random, ticketsUsed } from "./engine";
import type { CareerEvent, GameState, Stat } from "./types";

export function tryDevelopmentEvent(s: GameState) {
  if(s.careerMode==="pro")return false;
  if (!s.careerMode || s.careerEvent || s.careerNotice || s.weekProgress?.remainingDays !== 7 || s.weekProgress.day?.phase !== "beforeGames") return false;
  const p=getPlayer(s);
  // One roll at the opening date of this week. Ledger prevents duplicate
  // opportunities when a notice or another checkpoint resumes the same day.
  const ledger=s.eventLedger ??= {recent:[],centerGrades:[],nationalGrades:[],competitions:[],games:[]};
  const key=`development-week-${s.week}`;
  if(ledger.games.includes(key))return false;
  ledger.games.push(key);ledger.games=ledger.games.slice(-30);
  const rehabilitation=!!p.injury&&s.date<p.injury.unavailableUntil&&addDays(s.date,7)>=p.injury.unavailableUntil;
  if(s.week-(s.lastCareerEventWeek??0)<2 || !available(p,s.date)&&!rehabilitation || !ticketsUsed(p.trainingPolicy) || !s.calendar.trainingDays.includes(s.date) || random(s,"events")>=params["events.weekly_chance"])return false;
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
  if(s.proWorld){
    const year=s.calendar.seasonYear,once=(id:string)=>!ledger.competitions.includes(`${year}:${id}`),alternative=isPitcher(p.primaryRole)?"RP" as const:"DH" as const;
    if(rehabilitation){events.splice(0,events.length,{definitionId:"PRO09",title:"복귀 전 준비",description:"회복 예정일이 가까워졌다. 허용된 범위에서 복귀를 준비한다.",choices:[{id:"video",label:"영상으로 경기 감각을 정리한다",outcomes:[{weight:100,message:"출전하지 않고도 상황을 차분히 복기했다.",weeks:{bq:3}}]},{id:"body",label:"허용된 몸 관리에 집중한다",outcomes:[{weight:100,message:"회복을 서두르지 않고 몸의 상태를 살폈다.",fatigue:-4}]}]});}
    else {
      if(s.proWorld.stage==="camp"&&once("PRO02"))events.push({definitionId:"PRO02",title:"캠프의 새 보직 제안",description:"코치가 다른 역할도 평가해보자고 제안했다. 적응과 평가를 거친 뒤 결정한다.",choices:[{id:"try",label:"새 보직 평가에 도전한다",outcomes:[{weight:100,message:"2주간 새 역할의 적성을 평가하기로 했다.",proRoleTrial:alternative,weeks:{[skill]:3},fatigue:2}]},{id:"keep",label:"현재 역할을 다듬는다",outcomes:[{weight:100,message:"지금의 강점을 집중해서 연습했다.",weeks:{[other]:3}}]}]});
      if(s.weekProgress?.day?.gameIds.some(id=>s.calendar.events.find(g=>g.id===id)?.evaluationPlayers?.includes(p.id)))events.push({definitionId:"PRO04",title:"평가 출전 전 준비",description:"오랜만에 출전 기회가 잡혔다. 경기 전 준비 시간을 어떻게 쓸까?",choices:[{id:"fundamentals",label:"기본기를 다시 점검한다",outcomes:[{weight:75,message:"반복하던 동작이 자연스럽게 이어졌다.",weeks:{[skill]:3},fatigue:1},{weight:25,message:"기회를 의식한 탓에 준비가 길어졌다.",fatigue:2}]},{id:"body",label:"몸을 가볍게 풀고 마친다",outcomes:[{weight:100,message:"몸의 긴장을 풀고 경기를 기다렸다.",fatigue:-4}]}]});
      if(p.teamId>=0&&p.teamId<10&&!p.professional?.firsts.debut&&once("PRO06"))events.push({definitionId:"PRO06",title:"첫 1군 출전 전 취재",description:"처음으로 1군 무대를 준비하며 취재진의 짧은 질문을 받았다.",choices:[{id:"goal",label:"준비해온 목표를 말한다",outcomes:[{weight:70,message:"구체적인 준비와 목표를 전했다.",reputation:2},{weight:30,message:"말보다 경기에 집중하기로 했다.",weeks:{bq:3}}]},{id:"team",label:"팀의 준비를 이야기한다",outcomes:[{weight:100,message:"팀과 함께 준비해온 과정을 전했다.",reputation:1}]},{id:"brief",label:"짧게 마치고 준비한다",outcomes:[{weight:100,message:"익숙한 루틴으로 돌아갔다.",fatigue:-2}]}]});
      if(p.teamId>=0&&p.teamId<10&&p.recentZ<-.3)events.push({definitionId:"PRO07",title:"1군 부진 뒤 분석실",description:"최근 경기에서 같은 약점이 반복됐다. 분석 담당자가 함께 장면을 보자고 한다.",choices:[{id:"fix",label:"약점을 고치는 훈련을 해본다",outcomes:[{weight:70,message:"흔들리던 동작을 고칠 실마리를 찾았다.",weeks:{[isPitcher(p.primaryRole)?["velocity","control","movement"].sort((a,b)=>p.stats[a as Stat]-p.stats[b as Stat])[0]:["contact","power","speed","defense"].sort((a,b)=>p.stats[a as Stat]-p.stats[b as Stat])[0]]:4},fatigue:3},{weight:30,message:"당장 고치기는 어려웠지만 이유를 이해했다.",weeks:{bq:3},fatigue:1}]},{id:"routine",label:"익숙한 루틴을 유지한다",outcomes:[{weight:100,message:"기본 동작을 차분히 확인했다.",weeks:{[skill]:3},fatigue:1}]},{id:"body",label:"오늘은 몸 관리에 집중한다",outcomes:[{weight:100,message:"경기로 쌓인 피로를 풀었다.",fatigue:-6}]}]});
      if((p.age??19)>=33&&once("PRO08"))events.push({definitionId:"PRO08",title:"선배의 보직 전환 조언",description:"남아 있는 강점을 살려 다른 역할로 도전을 이어갈지 이야기했다.",choices:[{id:"try",label:"다른 보직을 평가해본다",outcomes:[{weight:100,message:"새 역할의 적응과 평가를 시작했다.",proRoleTrial:alternative,weeks:{bq:3}}]},{id:"keep",label:"현재 역할의 장점을 지킨다",outcomes:[{weight:100,message:"익숙한 역할의 기술을 다듬었다.",weeks:{[skill]:3}}]}]});
      if((p.age??19)>=33&&p.teamId>=0&&s.proWorld.stage==="camp"&&once("PRO15"))events.push({definitionId:"PRO15",title:"베테랑 역할 조정 면담",description:"구단이 현재 강점과 경쟁 구도를 함께 설명했다. 새로운 역할도 평가해볼 수 있다.",choices:[{id:"adapt",label:"역할 조정 평가를 받아들인다",outcomes:[{weight:100,message:"강점을 살리는 새 보직 평가를 시작했다.",proRoleTrial:alternative,weeks:{bq:3}}]},{id:"chance",label:"현재 역할의 강점을 더 다듬는다",outcomes:[{weight:100,message:"지금의 강점으로 다시 경쟁하기로 했다.",weeks:{[skill]:3},fatigue:1}]}]});
      if(s.proWorld.stage==="postseason")events.push({definitionId:"PRO11",title:"중요한 시리즈 전 준비",description:"동료들과 상대 팀을 준비한다. 오늘의 시간을 어떻게 쓸까?",choices:[{id:"analysis",label:"상대 영상을 분석한다",outcomes:[{weight:100,message:"상대의 습관을 함께 정리했다.",weeks:{bq:3}}]},{id:"routine",label:"개인 루틴에 집중한다",outcomes:[{weight:75,message:"흔들리지 않는 동작을 점검했다.",weeks:{[skill]:3},fatigue:1},{weight:25,message:"길어진 준비를 차분히 마쳤다.",fatigue:2}]},{id:"body",label:"몸을 관리한다",outcomes:[{weight:100,message:"시리즈를 위한 체력을 정비했다.",fatigue:-4}]}]});
    }
  }
  const choices=events.filter(event=>!ledger.recent.slice(-2).includes(event.definitionId));
  const event=choices[Math.floor(random(s,"events")*choices.length)];
  if(event.definitionId.startsWith("PRO"))ledger.competitions.push(`${s.calendar.seasonYear}:${event.definitionId}`);
  s.careerEvent={...event,id:`${p.id}:${s.date}:${event.definitionId}`,date:s.date,rewardVersion:2,kind:"special"};
  ledger.recent.push(event.definitionId);ledger.recent=ledger.recent.slice(-5);s.lastCareerEventWeek=s.week;return true;
}
