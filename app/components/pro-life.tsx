"use client";
import {isSuppressedAwardCelebration,pendingSeasonAwards} from '../../lib/sim/pro-awards-ceremony';
import {needsPendingEventUpgrade,upgradePendingCareerEvent} from '../../lib/sim/event-system';
import {needsCareerHonorUpgrade} from '../../lib/sim/career-honor-upgrade';
import {leaderQualification} from "../../lib/league-leaders";
import PlayerEvaluationButton from "./player-evaluation";
import { scoreText } from "../../lib/display";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { answerCareerEvent, dateLabel, getPlayer, isPitcher, validPolicy,draftRoleLabel } from "../../lib/sim/engine";
import { acknowledgeCareer,careerLabel, developmentProgress } from "../../lib/sim/pro-career";
import {createProWarContext} from '../../lib/sim/pro-war';
import { AutoProgress, acceptedNationalInvitation, autoPauseReason, autoWaitingForDecision, cancelPendingSimulation } from "../../lib/auto-progress";
import {restoreWorkerState,workerStateInput} from "../../lib/sim/worker-state";
import ProLeague from "./pro-league";
import InternationalHub from './international-hub';
import PlayerRoster, {PositionCompetition} from "./player-roster";
import { formatInnings } from "../../lib/player-records";
import DashboardRecords from "./dashboard-records";
import type { CareerEventOutcome, DraftPick, GameState, Player } from "../../lib/sim/types";
import CareerContinuation, { CareerNoticeDialog } from "./career-continuation";
import CareerEventDialog from "./career-event-dialog";
import TrainingCenter from "./training-center";
import ProgressControls from "./progress-controls";
import ProDashboard from "./pro-dashboard";
import {ScoutingReportContent} from "./scouting-report";
import SeasonRecords from "./season-records";
import NationalHonors from "./national-honors";
import HallOfFameButton from "./hall-of-fame";
import CareerStorage from "./career-storage";
import {deleteCareerInBackground,saveCareerInBackground} from "../../lib/career-autosave";
import CareerRegenerationDialog from "./career-regeneration-dialog";
import {careerSaveId} from "../../lib/career-save-key";
import {ProGoals,ProContractPanel,ProRetirement,salaryText} from "./pro-career-panels";
import OffseasonShop from "./offseason-shop";
import ProAwardsHub from "./pro-awards-hub";
import {CareerHonors,CareerLifetimeRecords} from "./pro-career-summary";
import {RetirementHonorsPanel} from './retirement-honors-panel';
import {actOnProCareer,canEnterNextProCamp,needsContractUpgrade,needsPostseasonUpgrade,resumeOffseasonProgress,tradeRequestProgressBlock,upgradeProfessionalState,type ProAction} from "../../lib/sim/pro-season";
import {needsProScheduleUpgrade} from "../../lib/sim/pro-schedule";
import {needsAllstarScheduleUpgrade} from "../../lib/sim/pro-allstar-calendar";
import {needsProSquadUpgrade,squadLabel} from "../../lib/sim/pro-squads";
import { DraftRoundTable } from "./draft-board";
import {nationalOffseasonActionLabel} from '../../lib/sim/national-tournament';
import {needsNationalInvitationUpgrade} from '../../lib/sim/national-teams';

export function DevelopmentContract({player,state}:{player:Player;state:GameState}) {
  if (player.proContract?.status!=="developmental") return null;
  const progress=developmentProgress(player,state.calendar.seasonYear,createProWarContext(state));
  const battingRule=progress.battingThresholds.find(rule=>progress.AB<=rule.atBats)??progress.battingThresholds[progress.battingThresholds.length-1];
  const pitchingRule=progress.pitchingThresholds.find(rule=>progress.outs<=rule.innings*3)??progress.pitchingThresholds[progress.pitchingThresholds.length-1];
  const conversionStatus=progress.minimumSample?" · 시즌 종료 시 전환 대상":" · 최소 출전 미달";
  return <section className="development-contract-note" aria-label="선수 등록 상태"><div><b>신고선수 · 성장 90%</b>
    <p>출전 경쟁에서 불리하며, 정식 전환 후 1군 승격이 가능합니다.</p></div>
    <div className="development-contract-progress"><p>{progress.war?`WAR ${progress.warWins.toFixed(2)}${conversionStatus}`:"WAR 1.5 이상"}</p><p>{progress.rating?`출전평가 ${progress.selectionGrade}${conversionStatus}`:"시즌 종료 시 심사 · 출전평가 C 이상"}</p><p>{progress.allstar?`2군 올스타${conversionStatus}`:"2군 올스타 공식 선정"}</p>{(player.twoWay||!["SP","RP","CP"].includes(player.position))&&<><p>타자 현재 {progress.AB}타수 · {progress.HR}홈런 · {progress.H}안타 · 타율 {progress.average===null?"—":progress.average.toFixed(3).replace(/^0/,"")}</p><p>{battingRule.atBats}타수 이상 + ({battingRule.homeRuns}홈런 또는 {battingRule.hits}안타 또는 타율 {battingRule.average.toFixed(3).replace(/^0/,"")} 이상)</p></>}
      {!progress.allstar&&(player.twoWay||["SP","RP","CP"].includes(player.position))&&<><p>{progress.pitchingMilestone.key==='wins'?"선발":progress.pitchingMilestone.key==='saves'?"마무리":"중간계투"} 현재 {formatInnings(progress.outs)}이닝 · {progress.pitchingMilestoneCount}{progress.pitchingMilestone.label} · 평균자책점 {progress.pitchingERA===null?"—":progress.pitchingERA.toFixed(2)}</p><p>{pitchingRule.innings}이닝 이상 + {pitchingRule.required}{progress.pitchingMilestone.label} 이상 + 평균자책점 {pitchingRule.era.toFixed(2)} 이하</p></>}
      {!progress.allstar&&player.twoWay&&<p>투수·타자 중 한 조건 달성 시 전환</p>}</div>
  </section>;
}
function Dialog({ title, children, onClose }: { title:string;children:ReactNode;onClose:()=>void }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();return ()=>el?.close();},[]);
  return <dialog className="modal" ref={ref} onCancel={onClose} aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="secondary" onClick={onClose}>닫기</button></div><div className="guide-content">{children}</div></dialog>;
}
export function ProSeasonStats({ player,state }: {player:Player;state:GameState}) {
  const id=player.teamId<10?"pro-first":"pro-second",label=id==="pro-first"?"1군":"2군";
  return <DashboardRecords field={player.twoWay?undefined:isPitcher(player.primaryRole)?"pitching":"batting"} qualification={state.careerMode==="pro"&&player.teamId>=0?[{label,batting:leaderQualification(state,player,id,"batting"),pitching:leaderQualification(state,player,id,"pitching")}]:undefined} records={player.seasonStats} levels={player.seasonByLevel?[{label:"1군",records:player.seasonByLevel.first},{label:"2군",records:player.seasonByLevel.second}]:undefined}/>;
}
export default function ProLife({state,onChange,onReset}:{state:GameState;onChange:(s:GameState)=>void;onReset:()=>void}) {
  const [tab,setTab]=useState(state.proWorld?.stage==="retired"?"home":state.phase==="ended"?"career":"home"),[policy,setPolicy]=useState(()=>structuredClone(getPlayer(state).trainingPolicy)),[stance,setStance]=useState(()=>({...getPlayer(state).stance}));
  const [busy,setBusy]=useState(false),[auto,setAuto]=useState(false),[error,setError]=useState(""),[outcome,setOutcome]=useState<CareerEventOutcome|null>(state.pendingEventOutcome??null),[recordId,setRecordId]=useState(state.playerId);
  const [trainingMessage,setTrainingMessage]=useState(""),[draftPick,setDraftPick]=useState<DraftPick|null>(null),[reset,setReset]=useState(false);
  const [retirementSaveMessage,setRetirementSaveMessage]=useState("");
  const worker=useRef<Worker|null>(null),locked=useRef(false),request=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const resetPending=useRef(false);
  const [autoProgress]=useState(()=>new AutoProgress());
  useEffect(()=>{
    if(needsPendingEventUpgrade(state)){const next=structuredClone(state);upgradePendingCareerEvent(next);onChange(next);return;}
    if(isSuppressedAwardCelebration(state.careerNotice)){onChange(acknowledgeCareer(state));return;}
    if(state.careerMode!=="pro"||state.proWorld&&state.proClubNamesVersion===2&&!needsPostseasonUpgrade(state)&&!needsProScheduleUpgrade(state)&&!needsProSquadUpgrade(state)&&!needsContractUpgrade(state)&&!needsAllstarScheduleUpgrade(state)&&!needsNationalInvitationUpgrade(state)&&!needsCareerHonorUpgrade(state))return;
    const scheduled=setTimeout(()=>{
      autoProgress.pause();cancelPendingSimulation({worker,request,locked,timer});setBusy(false);setAuto(false);setOutcome(null);
      const next=upgradeProfessionalState(state);onChange(next);setPolicy(structuredClone(getPlayer(next).trainingPolicy));setStance({...getPlayer(next).stance});
    },0);
    return ()=>clearTimeout(scheduled);
  },[state,onChange,autoProgress]);
  const [autoStartWeek,setAutoStartWeek]=useState(state.week);
  const stop=useCallback(()=>{autoProgress.pause();setAuto(false);},[autoProgress]);
  const resetCurrentCareer=async(save:boolean)=>{
    if(resetPending.current)return;
    resetPending.current=true;stop();cancelPendingSimulation({worker,request,locked,timer});setBusy(true);
    try{if(save)await saveCareerInBackground(state,true);else await deleteCareerInBackground(careerSaveId(state));onReset();}
    catch(error){setReset(false);setError(error instanceof Error?error.message:"선수 저장을 처리하지 못했습니다.");}
    finally{resetPending.current=false;setBusy(false);}
  };
  useEffect(()=>()=>{autoProgress.pause();cancelPendingSimulation({worker,request,locked,timer});setBusy(false);setAuto(false);},[autoProgress]);
  const p=getPlayer(state),pro=state.postSchool?.pro,ended=state.phase==="ended",editing=busy||auto||!!state.weekProgress||ended;
  const nationalAction=ended&&!state.proWorld?.pendingRetirement?nationalOffseasonActionLabel(state):undefined;
  const recordsPlayer=state.players.find(q=>q.id===recordId)??p;
  const [retireConfirm,setRetireConfirm]=useState(false);
  const careerDisabled=busy||auto||!!state.weekProgress||!!state.careerNotice||!!state.careerEvent||!!outcome;
  const tradeDisabledReason=busy?'진행 완료 후 요청 가능':auto?'일시정지 후 요청 가능':outcome?'선택 결과 확인 후 요청 가능':tradeRequestProgressBlock(state);
  const tradeDisabled=!!tradeDisabledReason;
  const onAction=(action:ProAction)=>{if(locked.current||(action.type==='request'&&action.kind==='trade'?tradeDisabled:careerDisabled))return;stop();try{const next=actOnProCareer(state,action);onChange(next);if(action.type!=="buyOffseasonItems"&&!(action.type==="request"&&action.kind==="position")&&(next.phase!=="ended"||next.proWorld?.stage==="retired"))setTab("home");}catch(error){setError(error instanceof Error?error.message:"커리어 선택에 실패했습니다.");}};
  const load=(next:GameState)=>{if(locked.current)return;stop();worker.current?.terminate();worker.current=null;request.current++;onChange(next);setOutcome(next.pendingEventOutcome??null);setPolicy(structuredClone(getPlayer(next).trainingPolicy));setStance({...getPlayer(next).stance});setTab(next.proWorld?.stage==="retired"?"home":next.phase==="ended"?"career":"home");};
  const finishEventOutcome=()=>{
    setOutcome(null);
    const next={...state};delete next.pendingEventOutcome;
    try{onChange(resumeOffseasonProgress(next));}
    catch(error){onChange(next);setError(error instanceof Error?error.message:'국가대표 대회 다음 일정을 진행하지 못했습니다.');}
  };
  const advance=useCallback(()=>{
    if(locked.current||state.phase==="ended"||state.careerEvent||state.careerNotice||outcome||!validPolicy(policy))return;
    locked.current=true;setBusy(true);setError("");const id=++request.current;
    const finish=()=>{locked.current=false;setBusy(false);if(timer.current)clearTimeout(timer.current);timer.current=null;};
    const fail=(message:string)=>{finish();stop();worker.current?.terminate();worker.current=null;setError(`${message} 기존 상태는 유지됩니다.`);};
    try {
      worker.current??=new Worker(new URL("../../lib/sim/worker.ts",import.meta.url));
      worker.current.onmessage=(event:MessageEvent<{requestId:number;result?:GameState;error?:string;reusedHistories?:string[];gameOrder?:string[]}>)=>{
        if(event.data.requestId!==request.current||!locked.current)return;
        if(event.data.error||!event.data.result){fail(event.data.error??"계산에 실패했습니다.");return;}
        let next:GameState;
        try {next=restoreWorkerState(worker.current!,event.data.result,event.data.reusedHistories,event.data.gameOrder);}
        catch(error){fail(error instanceof Error?error.message:"계산 결과를 받지 못했습니다.");return;}
        finish();onChange(next);setPolicy(structuredClone(getPlayer(next).trainingPolicy));
        if(autoPauseReason(state,next))stop();if(next.phase==="ended")setTab("career");
      };
      worker.current.onerror=()=>{if(id===request.current)fail("계산 중 오류가 발생했습니다.");};
      timer.current=setTimeout(()=>{if(id===request.current&&locked.current)fail("계산 시간이 초과되었습니다.");},30000);
      worker.current.postMessage({requestId:id,state:workerStateInput(worker.current,state),policy,stance,span:getPlayer(state).professional?.employment==="freeAgent"?"month":undefined});
    }catch(e){fail(e instanceof Error?e.message:"주간 계산에 실패했습니다.");}
  },[state,policy,stance,outcome,onChange,stop]);
  useEffect(()=>{
    if(autoWaitingForDecision(state,!!outcome)){autoProgress.cancelScheduled();if(locked.current||busy)cancelPendingSimulation({worker,request,locked,timer});if(busy){const settle=setTimeout(()=>setBusy(false),0);return ()=>clearTimeout(settle);}return;}
    if(!auto||busy||ended)return;
    autoProgress.schedule(advance);return ()=>autoProgress.cancelScheduled();
  },[auto,busy,ended,state,outcome,advance,autoProgress]);
  const openRecords=useCallback((id=state.playerId)=>{setRecordId(id);setTab("records");},[state.playerId]);
  const openTraining=()=>setTab("training");
  const saveTraining=()=>{if(editing||!validPolicy(policy))return;const next=structuredClone(state);getPlayer(next).trainingPolicy=structuredClone(policy);getPlayer(next).stance={...stance};onChange(next);setTrainingMessage("훈련 설정을 저장했습니다.");};
  const saveRetirement=async()=>{if(busy)return;setBusy(true);try{await saveCareerInBackground(state,true);setRetirementSaveMessage("은퇴 커리어를 저장했습니다.");}catch(error){setError(error instanceof Error?error.message:"은퇴 커리어를 저장하지 못했습니다.");}finally{setBusy(false);}};

  return <><div className="utility-bar"><div><span>나만의 야구선수 만들기</span><span>CAREER LIFE · v0.7.4</span></div></div>
    <header className="site-header"><div className="header-main pro-header"><button className="pro-brand" onClick={()=>setTab("home")}>BASEBALL <b>LIFE.</b></button><span className="live-badge">{state.calendar.seasonYear} · {state.careerMode==="pro"?"PRO CAREER":"COLLEGE DEVELOPMENT"}</span><HallOfFameButton onOpen={stop}/><button className="text-button" disabled={busy} onClick={()=>{stop();setReset(true);}}>선수 재생성</button></div>
      <nav className="main-nav" aria-label="프로 라이프 메뉴"><div>{[["home","주간 대시보드"],["training","훈련 센터"],["roster","선수·로스터"],["records","개인 기록"],["league","리그"],["international","국제대회"],...(state.careerMode==='pro'?[["awards","어워드"],...(state.proWorld?.stage!=="retired"?[["shop","상점"]]:[])]:[]),["career","커리어"]].map(([id,label])=><button className={tab===id?"active":""} key={id} onClick={()=>{if(id==="shop")stop();setTab(id);}}>{label}</button>)}</div></nav>
    </header><main className="app-main pro-main"><CareerStorage state={state} onLoad={load} disabled={busy||auto}/><div className="page-kicker"><span>{state.careerMode==="pro"?"PRO LIFE":"THE NEXT CHANCE"} · {careerLabel(p)}</span><span>{dateLabel(state.date)} · {p.teamId<0?(state.proWorld?.stage==="retired"?"은퇴":"무소속"):pro?squadLabel(p.teamId)+" 등록":"대학 육성 시즌"}</span></div>
      {error&&<div className="error-banner" role="alert">{error}<button onClick={()=>setError("")}>닫기</button></div>}
      {tab==="home"&&state.proWorld?.stage==="retired"&&<ProRetirement state={state} onRecords={()=>openRecords()} onNew={()=>setReset(true)} onSave={()=>void saveRetirement()} saving={busy} saveMessage={retirementSaveMessage}/>}
      {tab==="home"&&state.proWorld?.stage!=="retired"&&<ProDashboard state={state} onTab={tab=>tab==="records"?openRecords():setTab(tab)} onTraining={openTraining} trainingDisabled={editing} records={<ProSeasonStats player={p} state={state}/>} notice={<DevelopmentContract player={p} state={state}/>}/>}
      {tab==="training"&&<TrainingCenter state={state} policy={policy} setPolicy={next=>{setPolicy(next);setTrainingMessage("");}} stance={stance} setStance={next=>{setStance(next);setTrainingMessage("");}} onSave={saveTraining} disabled={editing} message={trainingMessage} onChange={onChange} onPositionRequest={state.careerMode==="pro"?position=>onAction({type:"request",kind:"position",position}):undefined} positionRequestDisabled={careerDisabled}/>}
      {tab==="international"&&<InternationalHub state={state} onRecords={openRecords}/>}
      {tab==="roster"&&<><PlayerRoster state={state} onSelect={openRecords}/><PositionCompetition state={state} player={p} onSelect={openRecords}/></>}
      {tab==="records"&&<><div className="records-evaluation-action"><PlayerEvaluationButton state={state} player={recordsPlayer}/></div><SeasonRecords state={state} key={recordsPlayer.id} player={recordsPlayer} year={state.calendar.seasonYear} school={(recordsPlayer.professional?.employment==="retired"?"은퇴 선수":state.teams[recordsPlayer.teamId]?.name??"무소속")} ended={ended} mine={recordsPlayer.id===p.id} onMyRecords={()=>openRecords()}/><NationalHonors state={state} playerId={recordsPlayer.id}/></>}
      {tab==="league"&&<ProLeague state={state} onRecords={openRecords}/>}
      {tab==="awards"&&<ProAwardsHub state={state} onRecords={openRecords}/>}
      {tab==="shop"&&state.careerMode==="pro"&&state.proWorld?.stage!=="retired"&&<OffseasonShop state={state} player={p} disabled={careerDisabled} onAction={onAction}/>}
      {tab==="career"&&<>
        <ProGoals state={state} onAction={onAction} disabled={careerDisabled}/>
        <CareerLifetimeRecords state={state}/>
        <CareerHonors state={state}/>
        {state.proWorld&&<ProContractPanel state={state} onAction={onAction} onRetire={()=>setRetireConfirm(true)} disabled={careerDisabled} tradeDisabled={tradeDisabled} tradeDisabledReason={tradeDisabledReason}/>}
        <DevelopmentContract player={p} state={state}/>
        {ended&&state.careerMode==="college"&&<CareerContinuation state={state} onChange={onChange}/>}
        {!!state.postSchool?.collegeDraft?.length&&<details className="panel pro-archive"><summary>최근 대학 재도전 드래프트</summary><DraftRoundTable players={state.players} picks={state.postSchool.collegeDraft} playerId={p.id} year={state.careerMode==="college"?state.calendar.seasonYear:state.calendar.seasonYear-1} onSelect={setDraftPick}/></details>}
        <RetirementHonorsPanel state={state}/>
        {!!state.draft.length&&<details className="panel pro-archive"><summary>{state.postSchool?.graduationYear} 고교 드래프트 기록</summary><DraftRoundTable players={state.players} picks={state.draft} playerId={p.id} year={state.postSchool?.graduationYear??state.calendar.seasonYear} onSelect={setDraftPick}/></details>}
      </>}
    </main><footer className="site-footer"><div><span className="footer-brand">BASEBALL LIFE.</span><span>고교에서 프로까지, 나의 야구 인생</span><span>가상 구단·게임용 일정</span></div></footer>
    {<ProgressControls state={state} policy={policy} busy={busy} auto={auto} autoStartWeek={autoStartWeek} pendingOutcome={!!outcome} onContinue={()=>setTab(state.proWorld?.stage==="retired"?"home":"career")} onStove={state.proWorld?.seasonClosed&&!state.proWorld.stove&&!nationalAction?()=>onAction({type:pendingSeasonAwards(state)?"awards":"market"}):undefined} nationalAction={nationalAction?{...nationalAction,onClick:()=>onAction({type:'national'})}:undefined} onNextCamp={canEnterNextProCamp(state)?()=>onAction({type:"nextSeason"}):undefined} onAdvance={advance} onToggleAuto={()=>{if(auto)stop();else{setAutoStartWeek(state.week);autoProgress.start();setAuto(true);}}}/>}
    {state.careerNotice&&!(tab==="career"&&state.careerMode==="college"&&ended)&&<CareerNoticeDialog state={state} onChange={onChange}/>}
    {(state.careerEvent||outcome)&&<CareerEventDialog state={state} event={state.careerEvent??null} outcome={outcome} disabled={busy} onRecover={()=>{autoProgress.cancelScheduled();cancelPendingSimulation({worker,request,locked,timer});setBusy(false);}} onDone={finishEventOutcome} onChoose={id=>{if(locked.current||!state.careerEvent)return false;const next=answerCareerEvent(state,id);if(state.careerEvent.definitionId.startsWith('AS-RESULT-')){delete next.pendingEventOutcome;onChange(next);setOutcome(null);return true;}next.pendingEventOutcome=next.careerEventHistory!.at(-1)!;if(next.phase!=='ended'&&acceptedNationalInvitation(state,next)){setAutoStartWeek(next.week);autoProgress.start();setAuto(true);}onChange(next);setOutcome(next.pendingEventOutcome);return true;}}/>}

    {draftPick&&<Dialog title={`${draftPick.playerName} 지명 평가`} onClose={()=>setDraftPick(null)}><p>{draftPick.club} · 전체 {draftPick.overall}순위</p><p>{draftPick.teamName} · {draftRoleLabel(draftPick.role)}</p><p>평판 {scoreText(draftPick.reputation)} · 재능 {draftPick.talent}/10 · 적합도 {scoreText(draftPick.fit)} · 평가 {scoreText(draftPick.score)}</p><ScoutingReportContent state={state} pick={draftPick}/></Dialog>}
    {reset&&<CareerRegenerationDialog busy={busy} onClose={()=>setReset(false)} onChoose={save=>void resetCurrentCareer(save)}/>}
    {retireConfirm&&<Dialog title="커리어를 마무리할까요?" onClose={()=>setRetireConfirm(false)}><p>기록과 주요 사건을 보관한 뒤 은퇴 결과를 보여줍니다.</p><p>남아 있는 미래 급여 {salaryText(Math.max(0,(p.professional?.contract?.endYear??state.calendar.seasonYear)-state.calendar.seasonYear)*(p.professional?.contract?.salary??0))}를 포기합니다.</p><div className="modal-actions"><button className="secondary" onClick={()=>setRetireConfirm(false)}>계속 선수 생활</button><button className="primary" onClick={()=>{setRetireConfirm(false);onAction({type:"retire"});setTab("home");}}>은퇴하고 기록 보관</button></div></Dialog>}{busy&&<div className="busy-indicator" role="status">훈련·경기·등록 일정을 계산하고 있습니다.</div>}
  </>;
}
