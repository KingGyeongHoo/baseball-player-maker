"use client";
import {handednessLabel} from "../../lib/player-handedness";
import PlayerEvaluationButton from "./player-evaluation";
import { scoreText } from "../../lib/display";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AutoProgress, autoPauseReason, autoWaitingForDecision, cancelPendingSimulation } from "@/lib/auto-progress";
import {restoreWorkerState,workerStateInput} from "../../lib/sim/worker-state";
import SeasonRecords from "./season-records";
import DashboardRecords from "./dashboard-records";
import TeamStrengthView from "./team-strength";
import CareerEventDialog from "./career-event";
import CareerDashboard from "./career-dashboard";
import CompetitionSchedule from "./competition-schedule";
import { competitionName } from "@/lib/sim/calendar";
import DraftOvrTop10 from "./draft-ovr-top10";
import {ScoutingReportContent} from "./scouting-report";
import { DraftForecast, DraftRoundTable } from "./draft-board";
import PlayerRoster, {PlayerGrade} from "./player-roster";
import RoleOffer from "./role-offer";
import PlayerAbilities from "./player-abilities";
import PlayerSetup from "./player-setup";
import CareerContinuation from "./career-continuation";
import DraftResultGate from "./draft-result-gate";
import ProLife from "./pro-life";
import CareerStorage from "./career-storage";
import TrainingEditor from "./training-editor";
import TrainingCenter from "./training-center";
import ProgressControls from "./progress-controls";
import { answerCareerEvent, answerOffer, overall, dateLabel, defaultPolicy, getPlayer, ops, positionLabel, talentLabel, validPolicy, calendar } from "@/lib/sim/engine";
import { type CareerEventOutcome, type DraftPick, type GameState, type Game, type Player, type Policy, type RecordLine, type Stance } from "@/lib/sim/types";
type Tab = "home" | "training" | "team" | "roster" | "records" | "games" | "draft";
const tabs: {
  id: Tab;
  label: string;
  icon: string;
}[] = [{
  id: "home",
  label: "주간 대시보드",
  icon: "grid"
}, {
  id: "training",
  label: "훈련 센터",
  icon: "training"
}, {
  id: "team",
  label: "팀 전력",
  icon: "trend"
}, {
  id: "roster",
  label: "선수 · 로스터",
  icon: "users"
}, {
  id: "records",
  label: "개인 기록",
  icon: "ball"
}, {
  id: "games",
  label: "일정 · 경기",
  icon: "calendar"
}, {
  id: "draft",
  label: "드래프트",
  icon: "award"
}];
const fixed = (n: number | null, digits = 3) => n === null ? "—" : n.toFixed(digits).replace(/^0\./, ".");
const avg = (r: RecordLine) => r.batting.AB ? r.batting.H / r.batting.AB : null;
const era = (r: RecordLine) => r.pitching.outs ? 27 * r.pitching.ER / r.pitching.outs : null;
const innings = (n: number) => `${Math.floor(n / 3)}.${n % 3}`;
function Icon({
  name,
  size = 20
}: {
  name: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    training: <><path d="m4 4 16 16M4 20 20 4M2 6l4-4M18 22l4-4M2 18l4 4M18 2l4 4" /></>,
    users: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M7 3v4M17 3v4M7 14h3M14 14h3M7 18h3" /></>,
    award: <><circle cx="12" cy="8" r="5" /><path d="m8 12-2 9 6-3 6 3-2-9m-7-4 2 2 4-4" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    refresh: <path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6" />,
    close: <path d="m5 5 14 14M5 19 19 5" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    heart: <><path d="M20 4a5 5 0 0 0-8 2 5 5 0 0 0-8-2C-2 10 12 21 12 21S26 10 20 4Z" /><path d="M3 12h5l2-4 3 8 2-4h6" /></>,
    trend: <path d="m3 17 6-6 4 4 8-10M15 5h6v6" />,
    ball: <><circle cx="12" cy="12" r="9" /><path d="M6 5c7 4 7 10 0 14M18 5c-7 4-7 10 0 14" /></>,
    check: <path d="m5 12 4 4L19 6" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.ball}</svg>;
}
function Diamond({
  decorative = false
}: {
  decorative?: boolean;
}) {
  return <svg className={decorative ? "hero-diamond" : "field-diamond"} viewBox="0 0 440 360" fill="none" aria-hidden="true"><path d="M220 323 48 151Q220-62 392 151Z" fill="currentColor" fillOpacity=".035" stroke="currentColor" strokeOpacity=".17" /><path d="M220 323 90 193Q220 22 350 193Z" fill="currentColor" fillOpacity=".05" stroke="currentColor" strokeOpacity=".2" /><path d="m220 303-93-93 93-93 93 93Z" fill="currentColor" fillOpacity=".045" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".6" /><circle cx="220" cy="210" r="20" stroke="currentColor" strokeOpacity=".3" /><circle cx="220" cy="210" r="5" fill="currentColor" /><path d="m220 323-17 17m17-17 17 17M48 151 25 128m367 23 23-23" stroke="currentColor" strokeOpacity=".4" />{[[220, 117], [127, 210], [313, 210]].map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${x} ${y})`} fill="currentColor" />)}<path d="m214 297 12 0v8l-6 5-6-5Z" fill="currentColor" /><circle cx="220" cy="210" r="146" stroke="currentColor" strokeDasharray="3 8" strokeOpacity=".2" /><text x="220" y="61" textAnchor="middle" fill="currentColor" fontSize="10" letterSpacing="4" opacity=".5">THE NEXT CHAPTER</text></svg>;
}
function Panel({
  title,
  eyebrow,
  action,
  children,
  className = ""
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}
function PlayerCard({
  player, school, state
}: {
  player: Player; school: string; state:GameState;
}) {
  return <div className="player-card"><div className="player-card-top"><span className="eyebrow">PLAYER PROFILE</span><PlayerEvaluationButton state={state} player={player}/><span className="number-tag">NO. {player.jerseyNumber??"—"}</span></div><div className="player-identity"><div className="jersey"><svg viewBox="0 0 100 110" aria-hidden="true"><path d="m29 10 13-7q8 9 16 0l13 7 26 23-16 19-11-9v62H30V43L19 52 3 33Z" fill="currentColor" /><path d="M42 3q8 19 16 0M50 19v86" fill="none" stroke="white" strokeOpacity=".5" strokeWidth="2" /><text x="50" y="73" textAnchor="middle" fill="white" fontSize="34" fontWeight="800">{player.jerseyNumber??"—"}</text></svg></div><div><span className="small muted">{school} · {player.grade}학년</span><h2>{player.name || "나의 선수"}</h2><span className="position-tag">{positionLabel(player)}</span><span className="small muted"> {handednessLabel(player)}</span></div><div className="ovr"><span>평판 등급</span><PlayerGrade player={player} pro={state.careerMode==="pro"}/></div></div><PlayerAbilities player={player} /><div className="talent-row"><span>타자 재능 <b>{talentLabel(player, "batting")}</b></span><span>투수 재능 <b>{talentLabel(player, "pitching")}</b></span></div><p className="micro muted">재능은 훈련 경험에 따라 점차 공개됩니다.</p></div>;
}
function RecordStats({ records }: { records: RecordLine }) {
  return <div className="both-records"><section className="record-group"><h3>투수 기록</h3><SingleRecordStats records={records} pitching /></section><section className="record-group"><h3>타자 기록</h3><SingleRecordStats records={records} pitching={false} /></section></div>;
}
function SingleRecordStats({
  records,
  pitching
}: {
  records: RecordLine;
  pitching: boolean;
}) {
  const values = pitching ? [["ERA", era(records)?.toFixed(2) ?? "—"], ["이닝", innings(records.pitching.outs)], ["탈삼진", records.pitching.SO], ["WHIP", records.pitching.outs ? (3 * (records.pitching.H + records.pitching.BB) / records.pitching.outs).toFixed(2) : "—"]] : [["타율", fixed(avg(records))], ["홈런", records.batting.HR], ["타점", records.batting.RBI], ["OPS", fixed(ops(records))]];
  return <div className="record-stats">{values.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>;
}
function WeekSchedule({
  state
}: {
  state: GameState;
}) {
  const player = getPlayer(state);
  const dates = Array.from({
    length: 7
  }, (_, i) => {
    const d = new Date(state.date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return <div className="week-schedule">{dates.map((date, i) => {
      const game = state.calendar.events.find(g => g.date === date && (g.homeTeamId === player.teamId || g.awayTeamId === player.teamId));
      const train = state.calendar.trainingDays.includes(date);
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      return <div className={`schedule-day ${i === 0 ? "today" : ""} ${game ? "game-day" : ""}`} key={date}><span>{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][dow]}</span><b>{Number(date.slice(-2))}</b><small>{game ? competitionName(state.calendar, game.competitionId) : train ? "훈련" : "휴식"}</small><i /></div>;
    })}</div>;
}
function Dashboard({ state, onTab, onTraining }: { state: GameState; onTab: (t: Tab) => void; onTraining: () => void }) {
  return <CareerDashboard state={state} onTab={onTab} onTraining={onTraining} records={<DashboardRecords records={getPlayer(state).seasonStats} />} schedule={<WeekSchedule state={state} />} abilities={<PlayerAbilities player={getPlayer(state)} detailsOnly />} />;
}
function GameScore({
  game,
  state,
  compact = false
}: {
  game: Game;
  state: GameState;
  compact?: boolean;
}) {
  const p = getPlayer(state);
  const home = game.homeTeamId === p.teamId;
  const score = home ? game.score : [game.score[1], game.score[0]];
  const opponent = state.teams[home ? game.awayTeamId : game.homeTeamId];
  const won = game.status === "forfeit" ? game.forfeitTeamId !== p.teamId : score[0] > score[1];
  return <div className={`game-score ${compact ? "compact" : ""}`}><span className="game-date">{dateLabel(game.date).slice(5)}<small>{competitionName(state.calendar, game.competitionId)} · {game.status === "scheduled" ? "경기 예정" : game.status === "inProgress" ? "경기 진행 중" : game.status === "forfeit" ? "기권 경기" : "경기 종료"}</small></span><div className="team-match"><b>{state.teams[p.teamId].name}</b><span className="score">{game.status === "scheduled" ? "VS" : game.status === "forfeit" ? "—" : `${score[0]} : ${score[1]}`}</span><b>{opponent.name}</b></div><span className={`result-tag ${game.status === "scheduled" || game.status === "inProgress" ? "scheduled" : won ? "win" : score[0] === score[1] && game.status !== "forfeit" ? "draw" : "loss"}`}>{game.status === "scheduled" ? "예정" : game.status === "inProgress" ? "진행 중" : game.status === "forfeit" ? won ? "기권승" : "기권패" : score[0] === score[1] ? "무" : won ? "승" : "패"}</span></div>;
}
function GamesView({
  state
}: {
  state: GameState;
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const p = getPlayer(state);
  const games = state.calendar.events.filter(g => (g.homeTeamId === p.teamId || g.awayTeamId === p.teamId) && (filter === "all" || (filter === "played" ? g.status === "completed" || g.status === "forfeit" : g.status === "scheduled")));
  const detail = state.calendar.events.find(g => g.id === selected);
  return <><div className="section-intro"><div><span className="eyebrow">SCHEDULE & RECORDS</span><h1>그라운드 위의 기록</h1><p>경기는 자동으로 진행됩니다. 매 타석의 결과가 선수의 기록이 됩니다.</p></div><span className="notice-tag"><Icon name="info" size={14} />2026 대회 일정 참고</span></div><CompetitionSchedule state={state} /><Panel title={`${state.calendar.seasonYear} 시즌 일정`} action={<div className="segmented small-segment">{[["all", "전체"], ["played", "종료"], ["upcoming", "예정"]].map(([v, label]) => <button className={filter === v ? "selected" : ""} onClick={() => setFilter(v)} key={v}>{label}</button>)}</div>}><div className="game-list">{games.map(g => <button className="game-row-button" onClick={() => setSelected(g.id)} key={g.id}><GameScore game={g} state={state} /><Icon name="chevron" size={16} /></button>)}{!games.length && <div className="empty-state"><Icon name="calendar" size={30} /><p>현재 확정된 경기가 없습니다. 전국대회 대진은 개막일과 다음 라운드 진출 후 확정됩니다.</p></div>}</div></Panel>{detail && <Panel title={`${dateLabel(detail.date)} 경기 상세`} action={<button className="icon-button" aria-label="경기 상세 닫기" onClick={() => setSelected(null)}><Icon name="close" size={18} /></button>}><GameScore game={detail} state={state} />{detail.status === "scheduled" ? <p className="empty-note">주간 진행으로 경기 날짜에 도달하면 자동으로 계산됩니다.</p> : detail.status === "forfeit" ? <p className="empty-note">출전 가능한 선수 부족으로 기권 처리되었습니다. 개인 기록은 생성되지 않습니다.</p> : <><div className="table-scroll"><table className="scoreboard"><thead><tr><th>TEAM</th>{Array.from({
                  length: Math.max(...detail.innings.map(x => x.length))
                }, (_, i) => <th key={i}>{i + 1}</th>)}<th>R</th></tr></thead><tbody>{[1, 0].map(side => <tr key={side}><th>{state.teams[side === 0 ? detail.homeTeamId : detail.awayTeamId].name}</th>{Array.from({
                  length: Math.max(...detail.innings.map(x => x.length))
                }, (_, i) => <td key={i}>{detail.innings[side][i] ?? "X"}</td>)}<td><b>{detail.score[side]}</b></td></tr>)}</tbody></table></div><div className="box-score-personal"><b>나의 경기 기록</b>{detail.boxScore[p.id] ? <RecordStats records={detail.boxScore[p.id]} /> : <p className="muted small">이 경기에는 출전하지 않았습니다.</p>}</div></>}</Panel>}</>;
}
function RosterView({state,onRecords}:{state:GameState;onRecords:(id:string)=>void}) {
  const [selected,setSelected]=useState(state.playerId);
  const detail=state.players.find(p=>p.id===selected)??getPlayer(state);
  return <><div className="section-intro"><div><span className="eyebrow">PLAYERS & ROSTER</span><h1>함께 뛰고, 함께 경쟁하다.</h1><p>투수·타자별 시즌 기록을 비교하세요. 등급은 역할 능력과 경기 성적을 반영한 평판 기준입니다.</p></div></div>
    <PlayerRoster state={state} selectedId={selected} onSelect={setSelected}/>
    <Panel className="player-detail-panel" title={detail.name+" 상세"} action={<button className="text-button" onClick={()=>onRecords(detail.id)}>연도별 기록 <Icon name="chevron" size={14}/></button>}>
      <div className="detail-role"><span>{state.teams[detail.teamId].name} · {detail.grade}학년</span><div className="detail-position"><b>{positionLabel(detail)}</b><PlayerGrade player={detail}/></div><span>OVR {scoreText(overall(detail))} · 피지컬 {scoreText((detail.stats.stamina+detail.stats.recovery+detail.stats.arm)/3)}</span>
        {detail.injury&&<span className="error">{state.date<detail.injury.unavailableUntil?dateLabel(detail.injury.unavailableUntil)+" 복귀 예정":"복귀 후 능력 회복 중"} · 회복 예정 저하 −{scoreText(detail.injury.penaltyRemaining)}</span>}</div>
      <PlayerAbilities player={detail} showEffective/><div className="talent-row"><span>타자 <b>{talentLabel(detail,"batting")}</b></span><span>투수 <b>{talentLabel(detail,"pitching")}</b></span></div>
      <p className="micro muted training-note">기본 능력과 경기용 유효 능력은 별도로 관리됩니다. 스태미나·회복력·어깨의 평균이 피지컬입니다.</p>
    </Panel></>;
}
function DraftView({ state, onRecords, onChange, onRetire }: { state: GameState; onRecords: (playerId?: string) => void; onChange: (s: GameState) => void; onRetire: () => void }) {
  const [showOvr, setShowOvr] = useState(false);
  const [selectedPick, setSelectedPick] = useState<DraftPick | null>(null);
  const p = getPlayer(state), ended = state.phase === "ended";
  if (ended && !state.draftOutcome?.revealed) return <DraftResultGate state={state} onChange={onChange}/>;
  const career = [...p.career, { year: state.calendar.seasonYear, grade: p.grade, records: p.seasonStats, stats: p.stats, schoolName: state.teams[p.teamId].name }];
  const careerPanel = <Panel title="나의 고교 커리어" eyebrow="CAREER RECORD" action={<button className="text-button" onClick={() => onRecords()}>상세 기록 <Icon name="chevron" size={14} /></button>}>
    <div className="table-scroll"><table><thead><tr><th>시즌</th><th>학교</th><th>학년</th><th>타석</th><th>타율</th><th>HR</th><th>투구 이닝</th><th>ERA</th></tr></thead><tbody>{career.map(c => <tr key={c.year}><td>{c.year}</td><td>{c.schoolName ?? state.teams[p.teamId].name}</td><td>{c.grade}학년</td><td>{c.records.batting.PA}</td><td>{fixed(avg(c.records))}</td><td>{c.records.batting.HR}</td><td>{innings(c.records.pitching.outs)}</td><td>{era(c.records)?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></div>
    <details className="career-growth"><summary>입학 이후의 성장</summary><PlayerAbilities player={p} compare /></details>
  </Panel>;
  const boardPanel = <Panel title={ended ? "드래프트 결과" : `${state.calendar.seasonYear} 예상 드래프트 TOP10`} eyebrow="DRAFT BOARD" action={ended && <button className="text-button" onClick={() => setShowOvr(true)}>OVR TOP10</button>}>
    {ended ? <>
      <CareerContinuation state={state} onChange={onChange} onRetire={onRetire}/>
      <DraftRoundTable picks={state.draft} playerId={p.id} year={state.calendar.seasonYear} onSelect={setSelectedPick} />
    </> : <DraftForecast state={state} />}
  </Panel>;
  return <>
    {!ended && <section className="draft-hero"><span className="outline-tag">THE NEXT CHAPTER</span><h1>당신의 이름이 불리는 그날까지.</h1><p>고3 {calendar(state.calendar.seasonYear + 3 - p.grade).draftDate.slice(5).replace("-", "월 ")}일, 프로를 향한 도전의 결과가 결정됩니다.</p><div className="draft-steps">{[1, 2, 3].map(g => <span className={p.grade >= g ? "active" : ""} key={g}>고교 {g}학년{p.grade > g ? " ✓" : p.grade === g ? " · 진행 중" : ""}</span>)}</div><Diamond decorative /></section>}
    <div className={`draft-grid ${ended ? "draft-grid-ended" : ""}`}>{ended ? <>{boardPanel}{careerPanel}</> : <>{careerPanel}{boardPanel}</>}</div>
    {ended && showOvr && <Modal title="고3 OVR TOP10" onClose={() => setShowOvr(false)}><DraftOvrTop10 state={state} /></Modal>}
    {selectedPick && <Modal title={`${selectedPick.playerName} 지명 평가`} onClose={() => setSelectedPick(null)}><div className="guide-content">
      <p><b>{selectedPick.club} · 전체 {selectedPick.overall}순위</b></p><p>{selectedPick.round ?? Math.floor((selectedPick.overall - 1) / 10) + 1}라운드 · {selectedPick.slot ?? (selectedPick.overall - 1) % 10 + 1}순번 · {selectedPick.teamName} · {selectedPick.role}</p>
      <div className="event-changes"><span>평판 <b>{scoreText(selectedPick.reputation)}</b></span><span>재능 <b>{selectedPick.talent} / 10</b></span><span>적합도 <b>{scoreText(selectedPick.fit)}</b></span><span>지명 점수 <b>{scoreText(selectedPick.score)}</b></span></div>
      <ScoutingReportContent state={state} pick={selectedPick} year={state.calendar.seasonYear}/><p className="micro muted">평판 80% · 재능 10% · 적합도 10%</p><div className="modal-actions"><button className="secondary" onClick={() => { const id = selectedPick.playerId; setSelectedPick(null); onRecords(id); }}>선수 기록 보기</button><button className="primary" onClick={() => setSelectedPick(null)}>확인</button></div>
    </div></Modal>}
  </>;
}

function Modal({
  title,
  children,
  onClose,
  className = ""
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return <dialog ref={ref} onCancel={onClose} className={`modal ${className}`}><div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="close" /></button></div>{children}</dialog>;
}
export default function BaseballLife({initialState=null}:{initialState?:GameState|null}={}) {
  const [state, setState] = useState<GameState | null>(initialState);
  const [eventOutcome, setEventOutcome] = useState<CareerEventOutcome | null>(initialState?.pendingEventOutcome??null);
  const [recordPlayerId, setRecordPlayerId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialState?.phase==="ended"?"draft":"home");
  const [policy, setPolicy] = useState<Policy>(()=>initialState?structuredClone(getPlayer(initialState).trainingPolicy):defaultPolicy("센터라인"));
  const [trainingDraft, setTrainingDraft] = useState<Policy | null>(null);
  const [stance, setStance] = useState<Stance>(initialState?{...getPlayer(initialState).stance}:{
    batting: "level",
    pitching: "command"
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState(false);
  const [reset, setReset] = useState(false);
  const [toast, setToast] = useState("");
  const [auto, setAuto] = useState(false);
  const [autoStartWeek, setAutoStartWeek] = useState(0);
  const [autoProgress] = useState(() => new AutoProgress());
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const locked = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  }, []);
  const pauseAuto = useCallback((message?: string) => {
    const running = autoProgress.active;
    autoProgress.pause();
    setAuto(false);
    if (running && message) notify(message);
  }, [autoProgress, notify]);
  useEffect(() => () => {
    autoProgress.pause();
    cancelPendingSimulation({worker:workerRef,request:requestRef,locked,timer:timeoutRef});
    setBusy(false);setAuto(false);
  }, [autoProgress]);
  const start = (s: GameState, restored = false) => {
    pauseAuto();
    cancelPendingSimulation({worker:workerRef,request:requestRef,locked,timer:timeoutRef});
    setBusy(false);setError("");
    setTrainingDraft(null);
    setEventOutcome(s.pendingEventOutcome??null);
    setRecordPlayerId(null);
    setState(s);
    setPolicy(structuredClone(getPlayer(s).trainingPolicy));
    setStance({
      ...getPlayer(s).stance
    });
    setTab(s.phase === "ended" ? "draft" : "home");
    notify(restored ? "저장한 커리어를 불러왔습니다." : s.careerMode ? "프로 커리어를 시작합니다." : `${s.teams[getPlayer(s).teamId]?.name ?? "소속 팀"} 야구부에 입학했습니다. 첫 시즌을 시작하세요!`);
  };
  const advance = useCallback(() => {
    if (!state || autoWaitingForDecision(state,!!eventOutcome) || locked.current || !validPolicy(policy) || state.phase === "ended") return;
    locked.current = true;
    setBusy(true);
    setError("");
    const requestId = ++requestRef.current;
    const finish = () => {
      locked.current = false;
      setBusy(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current=null;
    };
    try {
      if (!workerRef.current) workerRef.current = new Worker(new URL("../../lib/sim/worker.ts", import.meta.url));
      workerRef.current.onmessage = (event: MessageEvent<{
        requestId: number;
        result?: GameState;
        reusedHistories?: string[];
        gameOrder?: string[];
        error?: string;
      }>) => {
        if (event.data.requestId !== requestRef.current || !locked.current) return;
        finish();
        if (event.data.error) {
          pauseAuto();
          setError(event.data.error + " 기존 상태는 유지됩니다. 다시 시도해 주세요.");
          return;
        }
        if (event.data.result) {
          try { restoreWorkerState(workerRef.current!, event.data.result, event.data.reusedHistories, event.data.gameOrder); }
          catch (error) {
            pauseAuto();workerRef.current?.terminate();workerRef.current=null;
            setError(`${error instanceof Error?error.message:"계산 결과를 받지 못했습니다."} 기존 상태는 유지됩니다.`);
            return;
          }
          const running = autoProgress.active;
          const reason = running ? autoPauseReason(state, event.data.result) : null;
          setState(event.data.result);
          setPolicy(structuredClone(getPlayer(event.data.result).trainingPolicy));
          if (getPlayer(state).teamId !== getPlayer(event.data.result).teamId) {
            const joined = event.data.result.careerEventHistory?.at(-1);
            if (joined?.transfer?.status === "joined") setEventOutcome(joined);
          }
          if (reason) pauseAuto(reason);
          if (event.data.result.phase === "ended") setTab("draft");
          else if (!running) notify(event.data.result.careerEvent ? "이벤트가 발생했습니다. 선택 후 남은 일정을 이어갈 수 있습니다." : "한 주를 마쳤습니다.");
        }
      };
      workerRef.current.onerror = () => {
        if (requestId !== requestRef.current || !locked.current) return;
        finish();
        pauseAuto();
        workerRef.current?.terminate();
        workerRef.current = null;
        setError("계산에 실패했습니다. 기존 상태는 유지됩니다. 다시 시도해 주세요.");
      };
      timeoutRef.current = setTimeout(() => {
        requestRef.current++;
        workerRef.current?.terminate();
        workerRef.current = null;
        finish();
        pauseAuto();
        setError("계산 시간이 초과되었습니다. 기존 상태를 유지했습니다. 다시 시도해 주세요.");
      }, 30000);
      workerRef.current.postMessage({
        requestId,
        state: workerStateInput(workerRef.current, state),
        policy,
        stance
      });
    } catch (e) {
      finish();
      pauseAuto();
      setError((e as Error).message);
    }
  }, [state, policy, stance, autoProgress, notify, pauseAuto, eventOutcome]);

  useEffect(() => {
    if(state&&autoWaitingForDecision(state,!!eventOutcome)){
      autoProgress.cancelScheduled();
      if(locked.current||busy)cancelPendingSimulation({worker:workerRef,request:requestRef,locked,timer:timeoutRef});
      if(busy){const settle=setTimeout(()=>setBusy(false),0);return ()=>clearTimeout(settle);}
      return;
    }
    if (!auto || busy || !state || state.phase === "ended") return;
    autoProgress.schedule(advance);
    return () => autoProgress.cancelScheduled();
  }, [auto, busy, state, autoProgress, advance, eventOutcome]);

  const player = state ? getPlayer(state) : null;
  const recordPlayer = state ? state.players.find(p => p.id === recordPlayerId) ?? player! : null;
  const openRecords = useCallback((playerId: string | null = null) => {
    setRecordPlayerId(playerId);
    setTab("records");
  },[]);
  const toggleAuto = () => {
    if (autoProgress.active) {
      pauseAuto(busy ? "자동 진행을 일시정지합니다. 계산 중인 한 주를 마친 뒤 멈춥니다." : "자동 진행을 일시정지했습니다.");
      return;
    }
    if (!state || locked.current || state.phase === "ended" || !validPolicy(policy) || player?.roleOffer || state.careerEvent || eventOutcome) return;
    setError("");
    setAutoStartWeek(state.week);
    autoProgress.start();
    setAuto(true);
  };
  const savePolicy = (nextPolicy: Policy = policy) => {
    if (!state || state.weekProgress || state.phase === "ended" || locked.current || autoProgress.active || !validPolicy(nextPolicy)) return;
    const s = structuredClone(state);
    getPlayer(s).trainingPolicy = structuredClone(nextPolicy);
    getPlayer(s).stance = {
      ...stance
    };
    setState(s);
    setPolicy(structuredClone(nextPolicy));
    setTrainingDraft(null);
    notify("이번 주 훈련과 경기 성향을 저장했습니다.");
  };
  const newGame = () => {
    pauseAuto();
    setTrainingDraft(null);
    setEventOutcome(null);
    setRecordPlayerId(null);
    workerRef.current?.terminate();
    workerRef.current = null;
    requestRef.current++;
    setState(null);
    setTab("home");
    setReset(false);
    setError("");
  };
  if (state?.careerMode) return <ProLife state={state} onChange={next=>{if(!next.careerMode)start(next,true);else setState(next);}} onReset={newGame}/>;
  return <><div className="utility-bar"><div><span>나만의 야구선수 만들기</span><span>HIGH SCHOOL CAREER SIMULATOR <i /> v0.7.4</span></div></div><header className="site-header"><div className="header-main"><button className="brand" onClick={() => setTab("home")} aria-label="베이스볼 라이프 홈"><span className="brand-symbol"><Icon name="ball" size={30} /></span><span>BASEBALL<b>LIFE<span className="brand-dot">.</span></b></span></button><span className="brand-description">첫 유니폼부터<br /><b>드래프트까지.</b></span><div className="header-actions"><button onClick={() => { pauseAuto("플레이 가이드를 열어 자동 진행을 일시정지했습니다."); setHelp(true); }}><Icon name="info" size={16} />플레이 가이드</button>{state && <button onClick={() => setReset(true)} disabled={busy || auto}><Icon name="refresh" size={15} />새 커리어</button>}<span className="live-badge"><i />{state ? `${state.calendar.seasonYear} SEASON` : "YOUR NEXT CHAPTER"}</span></div></div><nav className="main-nav" aria-label="주요 메뉴"><div>{tabs.map(t => <button key={t.id} disabled={!state} className={tab === t.id ? "active" : ""} onClick={() => { if (t.id === "records") openRecords(); else setTab(t.id); }}><Icon name={t.icon} size={17} />{t.label}{t.id === "draft" && <span className="nav-new">DRAFT</span>}</button>)}<span className="nav-note">{state ? `고교 ${player!.grade}학년 · WEEK ${String(state.week).padStart(2, "0")}` : "나의 첫 번째 시즌을 준비하세요"}</span></div></nav></header><main className="app-main"><CareerStorage state={state} onLoad={saved=>start(saved,true)} disabled={busy||auto}/>{!state ? <PlayerSetup onStart={start} /> : <><div className="page-kicker"><span>MY CAREER <Icon name="chevron" size={12} />{tabs.find(t => t.id === tab)?.label}</span><span><i className="status-dot" />2026 대회 일정 참고 · {dateLabel(state.date)}<b>{["일", "월", "화", "수", "목", "금", "토"][new Date(state.date + "T00:00:00Z").getUTCDay()]}요일</b></span></div>{error && <div role="alert" className="error-banner"><Icon name="info" />{error}<button aria-label="오류 메시지 닫기" onClick={() => setError("")}>×</button></div>}{(state.careerEvent || eventOutcome) && <CareerEventDialog event={state.careerEvent ?? null} outcome={eventOutcome} disabled={busy} onRecover={()=>{autoProgress.cancelScheduled();cancelPendingSimulation({worker:workerRef,request:requestRef,locked,timer:timeoutRef});setBusy(false);}} onDone={() => {setEventOutcome(null);if(state){const next={...state};delete next.pendingEventOutcome;setState(next);}}} onChoose={id => {
  if (locked.current || !state.careerEvent) return false;
  const next = answerCareerEvent(state, id);
  next.pendingEventOutcome=next.careerEventHistory!.at(-1)!;
  setState(next);
  setEventOutcome(next.pendingEventOutcome);
  return true;
}} />}{player?.roleOffer && state.phase !== "ended" && <RoleOffer player={player} disabled={busy} onAnswer={accept => {
  setState(answerOffer(state, accept));
  notify(accept ? "새 역할을 수락했습니다. 훈련 배분을 확인하세요." : "현재 역할을 유지합니다.");
}} />}<fieldset className="content-lock" disabled={(busy || auto) && tab === "training"}>{tab === "home" && <Dashboard state={state} onTraining={() => { if (!locked.current && !autoProgress.active && !state.weekProgress && state.phase !== "ended") setTrainingDraft(structuredClone(policy)); }} onTab={next => { if (next === "records") openRecords(); else setTab(next); }} />}{tab === "training" && <TrainingCenter state={state} policy={policy} setPolicy={setPolicy} stance={stance} setStance={setStance} onSave={()=>savePolicy()} disabled={busy||auto} profile={<PlayerCard state={state} player={player!} school={state.teams[player!.teamId].name}/>}/>} {tab === "team" && <TeamStrengthView state={state} onRecords={openRecords} />}{tab === "roster" && <RosterView state={state} onRecords={openRecords} />}{tab === "records" && <SeasonRecords key={recordPlayer!.id} player={recordPlayer!} year={state.calendar.seasonYear} school={state.teams[recordPlayer!.teamId].name} ended={state.phase === "ended"} mine={recordPlayer!.id === state.playerId} onMyRecords={() => openRecords()} />}{tab === "games" && <GamesView state={state} />}{tab === "draft" && <DraftView state={state} onRecords={openRecords} onChange={setState} onRetire={newGame} />}</fieldset></>}</main><footer className="site-footer"><div><span className="footer-brand">BASEBALL LIFE.</span><span>모든 선수에게는 자신만의 이야기가 있다.</span><span>실제 대회 일정 참고 · 학교·선수·대진은 가상</span></div></footer>{state && <ProgressControls state={state} policy={policy} busy={busy} auto={auto} autoStartWeek={autoStartWeek} onAdvance={advance} onToggleAuto={toggleAuto} pendingOutcome={!!eventOutcome} onContinue={()=>setTab("draft")} />}{toast && <div className="toast" role="status"><Icon name="check" size={17} />{toast}</div>}{busy && <div className="busy-indicator" role="status">훈련 · 경기 · 회복을 계산하고 있습니다.</div>}{state && trainingDraft && <Modal title="훈련 설정" className="training-settings-modal" onClose={() => setTrainingDraft(null)}><div className="training-settings-body"><p className="training-settings-intro">능력치마다 0~5를 투자하고 훈련·회복 균형을 확인하세요. 저장하면 다음 진행부터 적용됩니다.</p><TrainingEditor player={player!} policy={trainingDraft} setPolicy={setTrainingDraft} date={state?.date} context={state} /></div><div className="training-settings-actions"><button className="secondary" onClick={() => setTrainingDraft(null)}>취소</button><button className="primary" disabled={!validPolicy(trainingDraft)} onClick={() => savePolicy(trainingDraft)}>훈련 설정 저장</button></div></Modal>}{help && <Modal title="플레이 가이드" onClose={() => setHelp(false)}><div className="guide-content"><p>선수 한 명을 만들어 고교 3시즌을 보내고, 고3 가을 드래프트에 도전합니다.</p><ol><li><b>훈련 센터</b>에서 각 항목에 0~5를 자유롭게 배분하세요. 회복력과 배분량에 따른 주간 피로를 막대와 마커로 확인할 수 있습니다.</li><li><b>1주 진행하기</b>는 한 주만, <b>자동 진행</b>은 현재 훈련과 성향을 유지하며 계속 진행합니다. 일시정지는 계산 중인 한 주를 마친 뒤 적용됩니다. 이벤트·역할 제안은 선택과 결과 확인이 끝나면 자동으로 이어집니다. 직접 일시정지하거나 시즌·드래프트가 끝나거나 계산 오류가 발생하면 멈춥니다.</li><li><b>팀 전력</b>에서 주전 1·후보 0.5로 계산한 종합·타격·수비·투수 전력과 전국 순위를 확인하세요.</li><li><b>선수 · 로스터</b>에서 주전 경쟁을 확인하세요. 부상·피로·역할 능력·최근 성적에 따라 출전이 달라집니다. 역할이 바뀌어도 기존 출전 자격과 진급 전 평판은 유지됩니다.</li><li><b>개인 기록</b>에서 연도별 타격·투구 기록과 통산 합계를 확인하세요. 로스터에서 선수를 선택하면 다른 선수의 기록도 볼 수 있습니다.</li><li><b>고3 드래프트</b>에서 능력·재능·기록·구단 수요를 종합해 지명합니다.</li></ol><div className="info-box">커리어별 자동 저장과 수동 보관을 지원합니다. 저장함에서 불러오면 중단한 위치부터 이어갑니다. 2026 대회 개최 기간을 참고한 게임용 일정이며, 학교·선수·참가 규칙·대진은 가상입니다.</div><p className="micro muted">간소화 규칙: 최대 12이닝, 사구·실책·도루·병살·희생타·야수선택 및 경기별 투타 겸업 지원(같은 경기 동시 투타 출전 미지원).</p></div></Modal>}{reset && <Modal title="새로운 커리어를 시작할까요?" onClose={() => setReset(false)}><div className="guide-content"><p>현재 선수와 플레이 기록이 초기화됩니다.</p><div className="modal-actions"><button className="secondary" onClick={() => setReset(false)}>계속 플레이</button><button className="primary" onClick={newGame}>새 커리어 시작</button></div></div></Modal>}</>;
}
