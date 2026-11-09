import { scoreText } from "../../lib/display";
import {useMemo, type ReactNode} from "react";
import { competitionName } from "../../lib/sim/calendar";
import { addDays, dateLabel, getPlayer, isPitcher, ovr, positionLabel } from "../../lib/sim/engine";
import { teamStrength } from "../../lib/team-strength";
import type { GameState } from "../../lib/sim/types";
import PlayerEvaluationButton from "./player-evaluation";
import {PlayerGrade} from "./player-roster";

type DashboardTab = "team" | "records" | "games";
function Section({ title, eyebrow, className, action, children }: { title: ReactNode; eyebrow: string; className: string; action?: ReactNode; children: ReactNode }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>{children}</section>;
}

export default function CareerDashboard({ state, onTab, onTraining, records, schedule, abilities, profileMeta, profileBadge, summary, teamActionLabel = "팀 전력 ↗", scheduleActionLabel = "전체 일정 ↗", trainingDisabled = false }: {
  state: GameState; onTab: (tab: DashboardTab) => void; onTraining: () => void; records: ReactNode; schedule: ReactNode; abilities: ReactNode;
  profileMeta?: ReactNode; profileBadge?: ReactNode; summary?: ReactNode; teamActionLabel?: string; scheduleActionLabel?: string; trainingDisabled?: boolean;
}) {
  const player = getPlayer(state);
  const team = state.teams[player.teamId];
  const power = useMemo(() => team ? teamStrength(state.players, player.teamId) : undefined, [state.players, player.teamId, team]);
  const weekEnd = addDays(state.date, 6);
  const monthLabel = `${state.date.slice(0, 4)}년 ${Number(state.date.slice(5, 7))}월` + (weekEnd.slice(0, 7) === state.date.slice(0, 7) ? "" : `–${weekEnd.slice(0, 4) !== state.date.slice(0, 4) ? `${weekEnd.slice(0, 4)}년 ` : ""}${Number(weekEnd.slice(5, 7))}월`);
  const injured = player.injury && state.date < player.injury.unavailableUntil;
  const condition = injured ? "부상 회복 중" : player.forcedRest ? "강제 휴식" : player.fatigue >= 80 ? "휴식 필요" : player.fatigue >= 60 ? "주의" : "좋은 컨디션";
  const fatigue=state.report?.fatigue,amount=(value:number)=>value>0&&value<1?"1 미만":scoreText(value);
  const nextGame = state.calendar.events.find(game => game.status === "scheduled" && game.date >= state.date && [game.homeTeamId, game.awayTeamId].includes(player.teamId));
  return <div className="career-dashboard">
    <section className="dashboard-overview" aria-label="선수와 팀 요약">
      <div className="overview-profile">
        <div className="overview-profile-heading"><span className="overview-label">PLAYER PROFILE</span><PlayerEvaluationButton state={state}/></div>
        <div className="overview-identity"><div><p className="overview-school">{profileMeta ?? <>{team?.name ?? "무소속"} · {player.grade}학년</>}</p><h1>{player.name}{player.jerseyNumber!==undefined&&<small className="overview-jersey">NO. {player.jerseyNumber}</small>}{profileBadge}</h1><div className="overview-position"><span>{positionLabel(player)}</span><small>우투우타</small></div></div><div className="overview-ovr overview-grade"><span>{state.careerMode==="pro"?"출전 등급":"평판 등급"}</span><PlayerGrade player={player} pro={state.careerMode==="pro"}/></div></div>
        {player.transferAdaptation && <p className="overview-caption">전학 적응 · 훈련 효율 90% · {player.transferAdaptation.weeksRemaining}훈련 주 남음</p>}
        {state.careerOpportunities?.pendingTransfer && <p className="overview-caption">{state.teams[state.careerOpportunities.pendingTransfer.toTeamId].name} · {dateLabel(state.careerOpportunities.pendingTransfer.effectiveDate)} 합류 예정</p>}
      </div>
      <div className="overview-fatigue">
        <h2 className="overview-label">피로</h2><div className="overview-value">{scoreText(player.fatigue)}<small>/ 100</small></div>
        <span className={`overview-condition ${injured || player.fatigue >= 60 ? "caution" : ""}`}>{condition}</span>
        <div className="overview-track"><i className={player.fatigue >= 60 ? "warm" : ""} style={{ width: `${player.fatigue}%` }} /></div>
        <p className="overview-caption">{injured ? `${dateLabel(player.injury!.unavailableUntil)} 복귀 예정` : fatigue ? `훈련 +${amount(fatigue.training)} · 경기 +${amount(fatigue.game)} · 회복 −${amount(fatigue.recovered)}` : state.careerMode ? "훈련·출전·회복 반영" : "야간·휴식 회복 후"}</p>
      </div>
      <div className="overview-reputation">
        <h2 className="overview-label">OVR</h2><div className="overview-value">{scoreText(ovr(player))}<small>/ 100</small></div>
        <span className="overview-condition">{isPitcher(player.primaryRole)?"투수":"타자"} 오버롤</span>
        <p className="overview-caption overview-ovr-split"><span>투수 <b>{scoreText(ovr(player,true))}</b></span><span>타자 <b>{scoreText(ovr(player,false))}</b></span></p>
      </div>
      <div className="overview-team">
        <div className="overview-team-heading"><h2 className="overview-label">팀 정보</h2><button onClick={() => onTab("team")}>{teamActionLabel}</button></div><h3>{team?.name ?? "무소속"}</h3>
        <div className="overview-team-power"><span>전력</span><strong>{power ? scoreText(power.overall) : "—"}</strong>{power && <small>/ 100</small>}</div>
        <div className="overview-team-record"><span>시즌 성적</span>{team ? <b>{team.wins}<small>승</small> {team.losses}<small>패</small> {team.draws}<small>무</small></b> : <b>소속 팀 없음</b>}</div>
      </div>
    </section>
    {summary}
    <div className="career-dashboard-grid">
      <Section title="시즌 기록" eyebrow="SEASON STATS" className="dashboard-records" action={<button className="text-button" onClick={() => onTab("records")}>연도별 기록 ↗</button>}>
        {records}{!player.seasonStats.batting.PA && !player.seasonStats.pitching.BF && !player.seasonStats.games?.batting && !player.seasonStats.games?.pitching && <p className="empty-note">아직 출전 기록이 없습니다.</p>}
      </Section>
      <Section title="상세 능력치" eyebrow="PLAYER ATTRIBUTES" className="dashboard-abilities" action={<button className="text-button" disabled={trainingDisabled || state.phase === "ended" || !!state.weekProgress} title={state.weekProgress ? "진행 중인 주를 마친 뒤 훈련 설정을 변경할 수 있습니다." : undefined} onClick={onTraining}>훈련 설정</button>}>{abilities}</Section>
      <Section title={<>이번 주 일정 <span className="schedule-month-label">{monthLabel}</span></>} eyebrow="WEEKLY SCHEDULE" className="dashboard-schedule" action={<button className="text-button" onClick={() => onTab("games")}>{scheduleActionLabel}</button>}>
        {schedule}<div className="next-match">{nextGame ? <><span className="outline-tag">NEXT</span><span>{dateLabel(nextGame.date).slice(5)} <b>vs {state.teams[nextGame.homeTeamId === player.teamId ? nextGame.awayTeamId : nextGame.homeTeamId].name}</b></span><small className="muted">{competitionName(state.calendar, nextGame.competitionId)}</small></> : <span>{state.careerMode ? "예정된 경기가 없습니다." : "다음 대진은 대회 개막·진출 후 확정됩니다."}</span>}</div>
      </Section>
    </div>
  </div>;
}
