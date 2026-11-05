"use client";
import { scoreText } from "../../lib/display";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { answerCareerEvent, overall, dateLabel, getPlayer, ovr, positionLabel, roleScore, ticketsUsed, validPolicy } from "../../lib/sim/engine";
import { careerLabel, developmentProgress } from "../../lib/sim/pro-career";
import { AutoProgress, autoPauseReason, cancelPendingSimulation } from "../../lib/auto-progress";
import { careerLeagueTable } from "../../lib/sim/pro-calendar";
import { rosterAssignments } from "../../lib/roster-status";
import { formatInnings, recordRates } from "../../lib/player-records";
import type { CareerEventOutcome, DraftPick, Game, GameState, Player, RecordLine } from "../../lib/sim/types";
import CareerContinuation, { CareerNoticeDialog } from "./career-continuation";
import CareerEventDialog from "./career-event-dialog";
import TrainingEditor, { trainingLabel } from "./training-editor";
import PlayerAbilities from "./player-abilities";
import ScoutingReportButton, {ScoutingReportContent} from "./scouting-report";
import SeasonRecords from "./season-records";
import CareerStorage from "./career-storage";
import {ProGoals,ProContractPanel,ProRequests,ProTwoWayStatus,ProSeasonReview,ProLeagueArchive,ProRetirement,salaryText} from "./pro-career-panels";
import {actOnProCareer,upgradeProfessionalState,type ProAction} from "../../lib/sim/pro-season";
import { DraftRoundTable } from "./draft-board";

function Panel({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function DevelopmentContract({player}:{player:Player}) {
  if (!player.proContract || player.proContract.status==="regular"&&!player.proContract.convertedDate) return null;
  const progress=developmentProgress(player),pending=player.proContract.status==="developmental";
  return <section className="development-contract-note" aria-label="선수 등록 상태"><div><b>{pending?"신고선수 · 성장 90%":"정식 선수 · 제한 해제"}</b>
    <p>{pending?"출전 경쟁에서 불리하며, 정식 전환 후 1군 승격이 가능합니다.":`${player.proContract.convertedDate} 경기 성과로 정식 선수 전환 · 성장 100% · 출전 불이익 해제`}</p></div>
    {pending&&<div className="development-contract-progress">{(player.twoWay||!["SP","RP","CP"].includes(player.position))&&<p>타자 {progress.PA}/80타석 · OPS .750 이상</p>}
      {(player.twoWay||["SP","RP","CP"].includes(player.position))&&<p>투수 {formatInnings(progress.outs)}/20.0이닝 · ERA 4.00 이하 · 탈삼진율 18% 이상</p>}
      {player.twoWay&&<p>투수·타자 중 한 조건 달성 시 전환</p>}</div>}
  </section>;
}
function Dialog({ title, children, onClose }: { title:string;children:ReactNode;onClose:()=>void }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();return ()=>el?.close();},[]);
  return <dialog className="modal" ref={ref} onCancel={onClose} aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="secondary" onClick={onClose}>닫기</button></div><div className="guide-content">{children}</div></dialog>;
}
const rate=(n:number|null,digits=3)=>n===null?"—":n.toFixed(digits).replace(/^0\./,".");
function StatsRow({ label, records }: {label:string;records:RecordLine}) {
  const rates=recordRates(records);
  return <tr><th scope="row">{label}</th><td>{records.batting.PA}</td><td>{rate(rates.average)}</td><td>{records.batting.HR}</td><td>{rate(rates.ops)}</td><td>{records.pitching.BF}</td><td>{formatInnings(records.pitching.outs)}</td><td>{rate(rates.era,2)}</td><td>{records.pitching.SO}</td></tr>;
}
export function ProSeasonStats({ player }: {player:Player}) {
  return <div className="table-scroll"><table className="pro-stats-table"><thead><tr>{["구분","PA","AVG","HR","OPS","BF","IP","ERA","SO"].map(s=><th scope="col" key={s}>{s}</th>)}</tr></thead><tbody>
    {player.seasonByLevel?<><StatsRow label="1군" records={player.seasonByLevel.first}/><StatsRow label="2군" records={player.seasonByLevel.second}/></>:<StatsRow label="대학" records={player.seasonStats}/>}
    <StatsRow label="시즌 합계" records={player.seasonStats}/></tbody></table></div>;
}
function ProRoster({ state, onRecords }: {state:GameState;onRecords:(id:string)=>void}) {
  const [scope,setScope]=useState("club"),[query,setQuery]=useState(""),[sort,setSort]=useState("overall");
  const mine=getPlayer(state),club=state.postSchool?.pro?.club,assignments=useMemo(()=>rosterAssignments(state.players.filter(p=>p.teamId>=0)),[state.players]);
  const rating=(p:Player)=>sort==="pitching"?ovr(p,true):sort==="batting"?ovr(p,false):sort==="reputation"?p.reputation??0:overall(p);
  const rows=(scope==="archive"?state.proWorld?.archive??[]:state.players).filter(p=>(scope==="all"||scope==="archive"||(state.careerMode==="pro"?p.teamId>=0&&p.teamId%10===club:p.teamId===mine.teamId))&&(p.name.includes(query)||(state.teams[p.teamId]?.name??"무소속").includes(query)))
    .sort((a,b)=>rating(b)-rating(a)||a.id.localeCompare(b.id));
  return <Panel title={scope==="all"?"리그 선수":"소속 선수·주전 경쟁"}><div className="roster-toolbar"><div className="segmented"><button className={scope==="club"?"selected":""} onClick={()=>setScope("club")}>소속 팀</button><button className={scope==="all"?"selected":""} onClick={()=>setScope("all")}>전체</button><button className={scope==="archive"?"selected":""} onClick={()=>setScope("archive")}>보관 선수</button></div>
    <input aria-label="프로 선수 검색" placeholder="선수·팀 검색" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="프로 로스터 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="overall">OVR순</option><option value="pitching">투수 OVR순</option><option value="batting">타자 OVR순</option><option value="reputation">평판순</option></select></div>
    <div className="table-scroll roster-table"><table><thead><tr>{["선수","소속","나이","포지션","OVR","투수 OVR","타자 OVR","평판","피로"].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.slice(0,120).map(p=><tr className={p.id===mine.id?"my-player-row":""} key={p.id}>
      <td><button className="player-name-button" onClick={()=>onRecords(p.id)}>{p.name}<small className={`roster-badge ${assignments.has(p.id)?"starter":"reserve"}`}>{p.professional?.employment==="retired"?"은퇴":p.teamId<0?"무소속":assignments.has(p.id)?"주전":"후보"}</small></button></td>
      <td>{(state.teams[p.teamId]?.name??"무소속")}</td><td>{p.age}</td><td>{positionLabel(p)}</td><td>{scoreText(overall(p))}</td><td>{scoreText(ovr(p,true))}</td><td>{scoreText(ovr(p,false))}</td><td>{scoreText(p.reputation)}</td><td>{p.injury&&state.date<p.injury.unavailableUntil?"부상":scoreText(p.fatigue)}</td>
    </tr>)}</tbody></table></div><p className="draft-board-note">{rows.length}명 중 최대 120명 표시 · 선수를 누르면 연도별 기록을 볼 수 있습니다. 주전은 기본 능력 기준이며 실제 출전 명단과 다를 수 있습니다.</p></Panel>;
}
function Competition({ state }: {state:GameState}) {
  const [league,setLeague]=useState(state.careerMode==="pro"?getPlayer(state).teamId<10?"pro-first":"pro-second":"college");
  const [selected,setSelected]=useState<Game|null>(null),p=getPlayer(state),club=state.postSchool?.pro?.club;
  const current=state.calendar.competitions.find(c=>c.id===league)??state.calendar.competitions[0];
  const table=careerLeagueTable(state.calendar,current.id);
  const games=state.calendar.events.filter(g=>g.competitionId===current.id&&(state.careerMode==="pro"?[g.homeTeamId,g.awayTeamId].some(id=>id%10===club):[g.homeTeamId,g.awayTeamId].includes(p.teamId)));
  const next=games.find(g=>g.status==="scheduled"&&g.date>=state.date);
  const players=new Map(state.players.map(p=>[p.id,p]));
  return <><Panel title="리그 순위·나의 구단 일정"><div className="pro-league-tabs segmented">{state.calendar.competitions.map(c=><button className={current.id===c.id?"selected":""} key={c.id} onClick={()=>setLeague(c.id)}>{c.name}</button>)}</div>
    <div className="table-scroll"><table><thead><tr><th>순위</th><th>팀</th><th>승</th><th>패</th><th>무</th><th>승점</th><th>득실</th></tr></thead><tbody>{table.map((row,i)=><tr className={row.teamId===p.teamId?"my-player-row":""} key={row.teamId}><td>{i+1}</td><td>{state.teams[row.teamId].name}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.draws}</td><td>{row.points}</td><td>{row.difference}</td></tr>)}</tbody></table></div>
    <p className="draft-board-note">{current.startDate}~{current.endDate} · {next?`다음 경기 ${next.date}`:"남은 대진이 없습니다."} · 가상 구단의 게임용 일정</p>
  </Panel><Panel title="구단 경기 기록"><div className="table-scroll pro-game-list"><table><thead><tr><th>날짜</th><th>홈</th><th>점수</th><th>원정</th><th>나의 출전</th></tr></thead><tbody>{games.map(g=><tr key={g.id}>
    <td><button className="text-button" disabled={g.status==="scheduled"} onClick={()=>setSelected(g)}>{g.date.slice(5)}</button></td><td>{state.teams[g.homeTeamId].shortName}</td><td>{g.status==="scheduled"?"예정":g.status==="forfeit"?"기권":`${g.score[0]} : ${g.score[1]}`}</td><td>{state.teams[g.awayTeamId].shortName}</td><td>{g.boxScore[p.id]?`${g.boxScore[p.id].batting.PA} PA · ${g.boxScore[p.id].pitching.BF} BF`:"—"}</td>
  </tr>)}</tbody></table></div></Panel>
  {selected&&<Dialog title={`${selected.date} 경기 기록`} onClose={()=>setSelected(null)}><p><b>{state.teams[selected.homeTeamId].name} {selected.score[0]} : {selected.score[1]} {state.teams[selected.awayTeamId].name}</b></p>
    <p className="micro muted">이닝별: 홈 {selected.innings[0].join(" · ")} / 원정 {selected.innings[1].join(" · ")}</p><div className="table-scroll"><table><thead><tr>{["선수","PA","H","HR","BF","IP","ER"].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{Object.entries(selected.boxScore).map(([id,r])=><tr className={id===p.id?"my-player-row":""} key={id}><td>{players.get(id)?.name??id}</td><td>{r.batting.PA}</td><td>{r.batting.H}</td><td>{r.batting.HR}</td><td>{r.pitching.BF}</td><td>{formatInnings(r.pitching.outs)}</td><td>{r.pitching.ER}</td></tr>)}</tbody></table></div>
  </Dialog>}</>;
}

export default function ProLife({state,onChange,onReset}:{state:GameState;onChange:(s:GameState)=>void;onReset:()=>void}) {
  const [tab,setTab]=useState("home"),[policy,setPolicy]=useState(()=>structuredClone(getPlayer(state).trainingPolicy)),[stance,setStance]=useState(()=>({...getPlayer(state).stance}));
  const [busy,setBusy]=useState(false),[auto,setAuto]=useState(false),[error,setError]=useState(""),[outcome,setOutcome]=useState<CareerEventOutcome|null>(state.pendingEventOutcome??null),[recordId,setRecordId]=useState(state.playerId);
  const [trainingOpen,setTrainingOpen]=useState(false),[draftPick,setDraftPick]=useState<DraftPick|null>(null),[reset,setReset]=useState(false);
  useEffect(()=>{if(state.careerMode==="pro"&&!state.proWorld)onChange(upgradeProfessionalState(state));},[state,onChange]);
  const worker=useRef<Worker|null>(null),locked=useRef(false),request=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [autoProgress]=useState(()=>new AutoProgress());
  const stop=useCallback(()=>{autoProgress.pause();setAuto(false);},[autoProgress]);
  useEffect(()=>()=>{autoProgress.pause();cancelPendingSimulation({worker,request,locked,timer});setBusy(false);setAuto(false);},[autoProgress]);
  const p=getPlayer(state),pro=state.postSchool?.pro,ended=state.phase==="ended",editing=busy||auto||!!state.weekProgress||ended;
  const careerPick=state.draft.find(row=>row.playerId===p.id)??state.postSchool?.collegeDraft?.find(row=>row.playerId===p.id);
  const recordsPlayer=state.players.find(q=>q.id===recordId)??state.proWorld?.archive.find(q=>q.id===recordId)??p;
  const [retireConfirm,setRetireConfirm]=useState(false);
  const careerDisabled=busy||auto||!!state.weekProgress||!!state.careerNotice||!!state.careerEvent||!!outcome;
  const onAction=(action:ProAction)=>{if(locked.current||careerDisabled)return;stop();try{const next=actOnProCareer(state,action);onChange(next);if(next.phase!=="ended")setTab("home");}catch(error){setError(error instanceof Error?error.message:"커리어 선택에 실패했습니다.");}};
  const load=(next:GameState)=>{if(locked.current)return;stop();worker.current?.terminate();worker.current=null;request.current++;onChange(next);setOutcome(next.pendingEventOutcome??null);setPolicy(structuredClone(getPlayer(next).trainingPolicy));setStance({...getPlayer(next).stance});setTab("home");};
  const advance=useCallback(()=>{
    if(locked.current||state.phase==="ended"||state.careerEvent||state.careerNotice||outcome||!validPolicy(policy))return;
    locked.current=true;setBusy(true);setError("");const id=++request.current;
    const finish=()=>{locked.current=false;setBusy(false);if(timer.current)clearTimeout(timer.current);timer.current=null;};
    const fail=(message:string)=>{finish();stop();worker.current?.terminate();worker.current=null;setError(`${message} 기존 상태는 유지됩니다.`);};
    try {
      worker.current??=new Worker(new URL("../../lib/sim/worker.ts",import.meta.url));
      worker.current.onmessage=(event:MessageEvent<{requestId:number;result?:GameState;error?:string}>)=>{
        if(event.data.requestId!==request.current||!locked.current)return;
        if(event.data.error||!event.data.result){fail(event.data.error??"계산에 실패했습니다.");return;}
        finish();const next=event.data.result;onChange(next);setPolicy(structuredClone(getPlayer(next).trainingPolicy));
        if(autoPauseReason(state,next))stop();if(next.phase==="ended")setTab("career");
      };
      worker.current.onerror=()=>{if(id===request.current)fail("계산 중 오류가 발생했습니다.");};
      timer.current=setTimeout(()=>{if(id===request.current&&locked.current)fail("계산 시간이 초과되었습니다.");},30000);
      worker.current.postMessage({requestId:id,state,policy,stance,span:getPlayer(state).professional?.employment==="freeAgent"?"month":undefined});
    }catch(e){fail(e instanceof Error?e.message:"주간 계산에 실패했습니다.");}
  },[state,policy,stance,outcome,onChange,stop]);
  useEffect(()=>{
    if(state.careerEvent||state.careerNotice||outcome){autoProgress.pause();if(locked.current||busy)cancelPendingSimulation({worker,request,locked,timer});if(auto||busy){const settle=setTimeout(()=>{setAuto(false);setBusy(false);},0);return ()=>clearTimeout(settle);}return;}
    if(!auto||busy||ended)return;
    autoProgress.schedule(advance);return ()=>autoProgress.cancelScheduled();
  },[auto,busy,ended,state,outcome,advance,autoProgress]);
  const openRecords=(id=state.playerId)=>{setRecordId(id);setTab("records");};
  const saveTraining=()=>{if(editing||!validPolicy(policy))return;const next=structuredClone(state);getPlayer(next).trainingPolicy=structuredClone(policy);getPlayer(next).stance={...stance};onChange(next);setTrainingOpen(false);};
  const rivals=state.players.filter(q=>q.eligiblePositions.includes(p.position)&&(pro?q.teamId%10===pro.club:q.teamId===p.teamId)).sort((a,b)=>roleScore(b,p.primaryRole)-roleScore(a,p.primaryRole)||a.id.localeCompare(b.id));
  const upcoming=state.calendar.events.filter(g=>g.status==="scheduled"&&g.date>=state.date&&[g.homeTeamId,g.awayTeamId].includes(p.teamId)).slice(0,4);
  const trainingEditor=<><fieldset className="content-lock" disabled={editing}><TrainingEditor player={p} policy={policy} setPolicy={setPolicy} date={state.date}/><div className="pro-stance-settings"><h3>경기 성향</h3><div className="segmented">{(["down","level","up"] as const).map((id,i)=><button key={id} className={stance.batting===id?"selected":""} onClick={()=>setStance({...stance,batting:id})}>{["다운스윙","레벨스윙","어퍼스윙"][i]}</button>)}</div><div className="segmented">{(["full","command"] as const).map((id,i)=><button key={id} className={stance.pitching===id?"selected":""} onClick={()=>setStance({...stance,pitching:id})}>{["전력투구","커맨드 투구"][i]}</button>)}</div></div></fieldset></>;
  return <><div className="utility-bar"><div><span>나만의 야구선수 만들기</span><span>CAREER LIFE · v0.7.4</span></div></div>
    <header className="site-header"><div className="header-main pro-header"><button className="pro-brand" onClick={()=>setTab("home")}>BASEBALL <b>LIFE.</b></button><span className="live-badge">{state.calendar.seasonYear} · {state.careerMode==="pro"?"PRO CAREER":"COLLEGE DEVELOPMENT"}</span><button className="text-button" onClick={()=>{stop();setReset(true);}}>새 선수 만들기</button></div>
      <nav className="main-nav" aria-label="프로 라이프 메뉴"><div>{[["home","주간 대시보드"],["training","훈련 센터"],["roster","선수·로스터"],["records","개인 기록"],["games","일정·순위"],["contract","계약"],["league","리그"],["career","커리어"]].map(([id,label])=><button className={tab===id?"active":""} key={id} onClick={()=>setTab(id)}>{label}</button>)}</div></nav>
    </header><main className="app-main pro-main"><CareerStorage state={state} onLoad={load} disabled={busy||auto}/><div className="page-kicker"><span>{state.careerMode==="pro"?"PRO LIFE":"THE NEXT CHANCE"} · {careerLabel(p)}</span><span>{dateLabel(state.date)} · {p.teamId<0?(state.proWorld?.stage==="retired"?"은퇴":"무소속"):pro?pro.level==="first"?"1군 등록":"2군 등록":"대학 육성 시즌"}</span></div>
      {error&&<div className="error-banner" role="alert">{error}<button onClick={()=>setError("")}>닫기</button></div>}
      {tab==="home"&&state.proWorld?.stage==="retired"&&<ProRetirement state={state} onRecords={()=>openRecords()} onNew={onReset}/>}
      {tab==="home"&&state.proWorld?.stage!=="retired"&&<>
        <section className="pro-overview"><div className="pro-profile"><span className="eyebrow">{(state.teams[p.teamId]?.name??"무소속")}</span><h1>{p.name}<span className={`pro-level-badge ${pro?.level==="first"?"first":""}`}>{p.teamId<0?"무소속":pro?pro.level==="first"?"1군":"2군":"대학"}</span></h1><p>{positionLabel(p)} · 우투우타 · {careerLabel(p)}</p><div className="pro-rating"><b>OVR {scoreText(overall(p))}</b><span>투수 {scoreText(ovr(p,true))} · 타자 {scoreText(ovr(p,false))}</span></div></div>
          <div><h2>피로</h2><strong>{scoreText(p.fatigue)}</strong><div className="overview-track"><i style={{width:`${p.fatigue}%`}}/></div><p>{p.injury&&state.date<p.injury.unavailableUntil?`${p.injury.unavailableUntil} 복귀 예정`:p.forcedRest?"강제 휴식":"훈련·출전·회복 반영"}</p></div>
          <div><h2>평판</h2><strong>{scoreText(p.reputation)??"—"}</strong><p>현재 능력과 실제 성과</p></div>
          <div><h2>팀 시즌 성적</h2><strong>{(state.teams[p.teamId]?.wins??0)}<small>승</small> {(state.teams[p.teamId]?.losses??0)}<small>패</small></strong><p>{(state.teams[p.teamId]?.draws??0)}무 · {pro?.debutDate?`1군 데뷔 ${pro.debutDate}`:pro?"1군 데뷔를 향해":"다음 진로를 준비하며"}</p></div>
        </section>
        <div className="pro-milestones">{[pro?"프로 입단":"대학 진학",pro?.debutDate?"1군 데뷔 완료":pro?"1군 경쟁":"재도전 준비",ended?"시즌 완주":"시즌 진행 중"].map((s,i)=><span className={i===0||i===1&&!!pro?.debutDate||i===2&&ended?"active":""} key={i}>{s}</span>)}</div>
        <ProGoals state={state} onAction={onAction} disabled={careerDisabled}/><DevelopmentContract player={p}/>{state.proWorld?.monthly&&<p className="pro-monthly-summary">{state.proWorld.monthly.month} 月 · {state.proWorld.monthly.text}</p>}<div className="pro-dashboard-grid"><Panel title="시즌 기록" action={<button className="text-button" onClick={()=>openRecords()}>연도별 기록 →</button>}><ProSeasonStats player={p}/></Panel><Panel title="상세 능력치" action={<button className="text-button" disabled={editing} onClick={()=>setTrainingOpen(true)}>훈련 설정</button>}><PlayerAbilities player={p} detailsOnly/></Panel>
          <Panel title={`다가오는 일정 · ${Number(state.date.slice(5,7))}월`}><div className="pro-upcoming">{upcoming.map(g=><div key={g.id}><time>{g.date.slice(5)}</time><b>{state.teams[g.homeTeamId===p.teamId?g.awayTeamId:g.homeTeamId].name}</b><span>{g.homeTeamId===p.teamId?"홈":"원정"}</span></div>)}{!upcoming.length&&<p>예정된 경기가 없습니다.</p>}</div></Panel>
          <Panel title="나의 포지션 경쟁"><div className="table-scroll"><table><thead><tr><th>선수</th><th>소속</th><th>역할 능력</th><th>피로</th></tr></thead><tbody>{rivals.slice(0,6).map(q=><tr className={q.id===p.id?"my-player-row":""} key={q.id}><td>{q.name}</td><td>{state.teams[q.teamId].shortName}</td><td>{scoreText(roleScore(q,p.primaryRole))}</td><td>{scoreText(q.fatigue)}</td></tr>)}</tbody></table></div><p className="draft-board-note">기본 능력 순이며, 등록 판단에는 최근 성적·컨디션도 반영됩니다. 승격과 주전 출전은 별도로 결정됩니다.</p></Panel>
        </div>
      </>}
      {tab==="training"&&<><div className="section-intro"><div><span className="eyebrow">DAILY ROUTINE</span><h1>다음 출전을 준비하는 시간.</h1><p>훈련·피로·부상 규칙은 고교 시절과 이어집니다. 입단 자체로 능력치가 오르지는 않습니다.</p></div><button className="primary" disabled={editing||!validPolicy(policy)} onClick={saveTraining}>훈련 설정 저장</button></div><div className="training-layout"><Panel title="주간 훈련 배분">{trainingEditor}</Panel><Panel title={`${p.name} 프로필`}><PlayerAbilities player={p}/></Panel></div></>}
      {tab==="roster"&&<ProRoster state={state} onRecords={openRecords}/>}
      {tab==="records"&&<SeasonRecords key={recordsPlayer.id} player={recordsPlayer} year={state.calendar.seasonYear} school={(state.teams[recordsPlayer.teamId]?.name??"보관 선수")} ended={ended} mine={recordsPlayer.id===p.id} onMyRecords={()=>openRecords()}/>}
      {tab==="games"&&<><ProSeasonReview state={state}/><Competition state={state}/></>}
      {tab==="contract"&&<ProContractPanel state={state} onAction={onAction} onRetire={()=>setRetireConfirm(true)} disabled={careerDisabled}/>}
      {tab==="league"&&<ProLeagueArchive state={state}/>}
      {tab==="career"&&<>
        <Panel title={ended?pro?"신인 시즌을 마쳤습니다.":"대학 육성 시즌 결과":"커리어의 다음 장"}><div className="continuation-body"><h3>{p.name} · {(state.teams[p.teamId]?.name??"무소속")}</h3><p>{state.postSchool?.graduationSchool} · {state.postSchool?.graduationYear} 고교 시즌 이후의 도전</p>
          {pro&&<p>입단 경로: {pro.entry==="draft"?"고교 드래프트":pro.entry==="collegeDraft"?"대학 재도전 드래프트":pro.entry==="developmental"?"신고선수 입단":"입단 테스트"} · 1군 등록 {scoreText(pro.firstTeamWeeks)}주 · 2군 등록 {scoreText(pro.secondTeamWeeks)}주 · {pro.debutDate?`${pro.debutDate} 1군 데뷔`:"1군 데뷔 전"}</p>}
        {careerPick&&<ScoutingReportButton state={state} pick={careerPick}/>}</div><ProSeasonStats player={p}/></Panel>
        {state.proWorld&&<><ProSeasonReview state={state}/><ProContractPanel state={state} onAction={onAction} onRetire={()=>setRetireConfirm(true)} disabled={careerDisabled}/><ProTwoWayStatus state={state}/><ProRequests state={state} onAction={onAction} disabled={careerDisabled}/></>}<DevelopmentContract player={p}/>{ended&&state.careerMode==="college"&&<CareerContinuation state={state} onChange={onChange}/>}
        {pro&&<Panel title="등록·이동 기록"><div className="pro-transactions">{pro.transactions.length?pro.transactions.map((t,i)=><div key={i}><time>{t.date}</time><b>{t.to==="first"?"1군 승격":"2군 조정"}</b><p>{t.reason}</p></div>):<p>입단 후 등록 이동이 없습니다.</p>}</div></Panel>}
        {state.postSchool?.collegeDraft&&<details className="panel pro-archive"><summary>최근 대학 재도전 드래프트</summary><DraftRoundTable picks={state.postSchool.collegeDraft} playerId={p.id} year={state.careerMode==="college"?state.calendar.seasonYear:state.calendar.seasonYear-1} onSelect={setDraftPick}/></details>}
        <details className="panel pro-archive"><summary>{state.postSchool?.graduationYear} 고교 드래프트 기록</summary><DraftRoundTable picks={state.draft} playerId={p.id} year={state.postSchool?.graduationYear??state.calendar.seasonYear} onSelect={setDraftPick}/></details>
      </>}
    </main><footer className="site-footer"><div><span className="footer-brand">BASEBALL LIFE.</span><span>고교에서 프로까지, 나의 야구 인생</span><span>가상 구단·게임용 일정</span></div></footer>
    {!ended&&<div className="week-control"><div><div className="week-control-info"><span className="week-label">WEEK {state.week}</span><div><b>{state.date}</b><span>{trainingLabel(policy)} · {ticketsUsed(policy)}개 투자{auto?" · 자동 진행 중":""}</span></div></div><div className="week-actions"><button className="secondary" disabled={!auto&&(busy||!!state.careerNotice||!!state.careerEvent||!!outcome||!validPolicy(policy))} onClick={()=>{if(auto)stop();else{autoProgress.start();setAuto(true);}}}>{auto?"일시정지":"자동 진행"}</button><button className="primary" disabled={busy||auto||!!state.careerNotice||!!state.careerEvent||!!outcome||!validPolicy(policy)} onClick={advance}>{busy?"진행 중…":state.weekProgress?"남은 일정 이어가기":p.professional?.employment==="freeAgent"?"한 달 개인 훈련":"1주 진행하기"}</button></div></div></div>}
    {state.careerNotice&&!(tab==="career"&&state.careerMode==="college"&&ended)&&<CareerNoticeDialog state={state} onChange={onChange}/>}
    {(state.careerEvent||outcome)&&<CareerEventDialog event={state.careerEvent??null} outcome={outcome} disabled={busy} onRecover={()=>{stop();cancelPendingSimulation({worker,request,locked,timer});setBusy(false);}} onDone={()=>{setOutcome(null);const next={...state};delete next.pendingEventOutcome;onChange(next);}} onChoose={id=>{stop();if(locked.current||!state.careerEvent)return false;const next=answerCareerEvent(state,id);next.pendingEventOutcome=next.careerEventHistory!.at(-1)!;onChange(next);setOutcome(next.pendingEventOutcome);return true;}}/>}
    {trainingOpen&&<Dialog title="훈련 설정" onClose={()=>{setPolicy(structuredClone(p.trainingPolicy));setStance({...p.stance});setTrainingOpen(false);}}>{trainingEditor}<div className="modal-actions"><button className="secondary" onClick={()=>{setPolicy(structuredClone(p.trainingPolicy));setStance({...p.stance});setTrainingOpen(false);}}>취소</button><button className="primary" disabled={editing||!validPolicy(policy)} onClick={saveTraining}>저장</button></div></Dialog>}
    {draftPick&&<Dialog title={`${draftPick.playerName} 지명 평가`} onClose={()=>setDraftPick(null)}><p>{draftPick.club} · 전체 {draftPick.overall}순위</p><p>{draftPick.teamName} · {draftPick.role}</p><p>평판 {scoreText(draftPick.reputation)} · 재능 {draftPick.talent}/10 · 적합도 {scoreText(draftPick.fit)} · 평가 {scoreText(draftPick.score)}</p><ScoutingReportContent state={state} pick={draftPick}/></Dialog>}
    {reset&&<Dialog title="새 선수로 시작할까요?" onClose={()=>setReset(false)}><p>현재 커리어와 기록이 초기화됩니다.</p><div className="modal-actions"><button className="secondary" onClick={()=>setReset(false)}>계속 플레이</button><button className="primary" onClick={onReset}>새 선수 만들기</button></div></Dialog>}
    {retireConfirm&&<Dialog title="커리어를 마무리할까요?" onClose={()=>setRetireConfirm(false)}><p>기록과 주요 사건을 보관한 뒤 은퇴 결과를 보여줍니다.</p><p>남아 있는 미래 급여 {salaryText(Math.max(0,(p.professional?.contract?.endYear??state.calendar.seasonYear)-state.calendar.seasonYear)*(p.professional?.contract?.salary??0))}를 포기합니다.</p><div className="modal-actions"><button className="secondary" onClick={()=>setRetireConfirm(false)}>계속 선수 생활</button><button className="primary" onClick={()=>{setRetireConfirm(false);onAction({type:"retire"});setTab("home");}}>은퇴하고 기록 보관</button></div></Dialog>}{busy&&<div className="busy-indicator" role="status">훈련·경기·등록 일정을 계산하고 있습니다.</div>}
  </>;
}
