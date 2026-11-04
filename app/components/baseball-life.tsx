"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AutoProgress, autoPauseReason } from "@/lib/auto-progress";
import SeasonRecords from "./season-records";
import PlayerSetup from "./player-setup";
import { answerOffer, budget, dateLabel, defaultPolicy, effective, getPlayer, isPitcher, labels, ops, ovr, positions, roleScore, talentLabel, ticketsUsed, validPolicy, focusGrowth, slowdown, fatigueForecast, calendar } from "@/lib/sim/engine";
import { statKeys, ticketKeys, type GameState, type Game, type Mode, type Player, type Policy, type RecordLine, type Stance, type Stat, type Ticket, type Report } from "@/lib/sim/types";
type Tab = "home" | "training" | "roster" | "records" | "games" | "draft";
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
const modeNames: Record<Mode, string> = {
  light: "가벼운 훈련",
  normal: "보통 훈련",
  hard: "강한 훈련",
  rest: "회복 위주"
};
const trainingGroups: { id: string; label: string; keys: Ticket[] }[] = [
  { id: "pitching", label: "투수 능력치", keys: ["velocity", "control", "movement"] },
  { id: "batting", label: "타자 능력치", keys: ["contact", "power", "speed", "defense"] },
  { id: "physical", label: "공통 피지컬", keys: ["physical"] },
];
const trainingSymbols: Record<Ticket, string> = {
  velocity: "V", control: "K", movement: "M", contact: "C", power: "P", speed: "S", defense: "D", physical: "PH",
};
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
function StatBars({
  player,
  compare = false
}: {
  player: Player;
  compare?: boolean;
}) {
  const keys: Stat[] = isPitcher(player.primaryRole) ? ["velocity", "control", "movement", "stamina", "recovery", "arm"] : ["contact", "power", "speed", "defense", "stamina", "arm"];
  return <div className="stat-bars">{keys.map(key => <div className="stat-bar-row" key={key}><span>{labels[key]}</span><div className="stat-track"><i style={{
          width: `${player.stats[key]}%`
        }} /></div><strong>{player.stats[key].toFixed(2)}</strong>{compare && <small className="positive">+{(player.stats[key] - player.initialStats[key]).toFixed(1)}</small>}</div>)}</div>;
}
function PlayerCard({
  player, school
}: {
  player: Player; school: string;
}) {
  return <div className="player-card"><div className="player-card-top"><span className="eyebrow">PLAYER PROFILE</span><span className="number-tag">NO. 01</span></div><div className="player-identity"><div className="jersey"><svg viewBox="0 0 100 110" aria-hidden="true"><path d="m29 10 13-7q8 9 16 0l13 7 26 23-16 19-11-9v62H30V43L19 52 3 33Z" fill="currentColor" /><path d="M42 3q8 19 16 0M50 19v86" fill="none" stroke="white" strokeOpacity=".5" strokeWidth="2" /><text x="50" y="73" textAnchor="middle" fill="white" fontSize="34" fontWeight="800">01</text></svg></div><div><span className="small muted">{school} · {player.grade}학년</span><h2>{player.name || "나의 선수"}</h2><span className="position-tag">{positions[player.position]}</span><span className="small muted"> 우투우타</span></div><div className="ovr"><span>OVR</span><strong>{Math.round(ovr(player))}</strong></div></div><StatBars player={player} /><div className="talent-row"><span>타자 재능 <b>{talentLabel(player, "batting")}</b></span><span>투수 재능 <b>{talentLabel(player, "pitching")}</b></span></div><DualOvr player={player} /><p className="micro muted">재능은 훈련 경험에 따라 점차 공개됩니다.</p></div>;
}
function DualOvr({
  player
}: {
  player: Player;
}) {
  const both = player.eligiblePositions.includes("SP") && player.eligiblePositions.some(p => !["SP", "RP", "CP"].includes(p));
  return both ? <p className="dual-ovr">투타 겸업 <span>타자 OVR <b>{ovr(player, false).toFixed(1)}</b></span><span>투수 OVR <b>{ovr(player, true).toFixed(1)}</b></span></p> : null;
}
function TrainingEditor({
  player,
  policy,
  setPolicy
}: {
  player: Player;
  policy: Policy;
  setPolicy: (p: Policy) => void;
}) {
  const used = ticketsUsed(policy);
  const max = budget(policy.mode);
  return <><div className="training-modes">{(["light", "normal", "hard", "rest"] as Mode[]).map(m => <button key={m} className={policy.mode === m ? "selected" : ""} onClick={() => setPolicy({
        ...policy,
        mode: m
      })}><span>{modeNames[m]}</span><b>{budget(m)}<small>장</small></b></button>)}</div><div className="ticket-summary"><div><Icon name="training" size={18} /><b>훈련 티켓</b><span className={used > max ? "error" : ""}>{used} / {max}장 사용</span></div><button className="text-button" onClick={() => setPolicy({
        ...policy,
        tickets: Object.fromEntries(ticketKeys.map(k => [k, 0])) as Policy["tickets"]
      })}>배분 초기화</button></div><div className="training-rows">{trainingGroups.map(group => <section className={`training-group ${group.id}`} key={group.id} aria-label={group.label}><div className="training-group-heading"><h3>{group.label}</h3><span>{group.keys.reduce((sum, key) => sum + policy.tickets[key], 0)}장 배분</span></div>{group.keys.map(key => {
        const g = focusGrowth(policy.tickets[key]);
        const stat = key === "physical" ? (player.stats.stamina + player.stats.recovery + player.stats.arm) / 3 : player.stats[key];
        return <div className="training-row" key={key}><span className="training-symbol">{trainingSymbols[key]}</span><div className="training-label"><b>{labels[key]}</b><small>{stat.toFixed(2)} <span className="positive">+{(g * slowdown(stat)).toFixed(2)}</span></small></div><div className="ticket-dots" aria-hidden="true">{Array.from({
              length: 5
            }, (_, i) => <i className={i < policy.tickets[key] ? "filled" : ""} key={i} />)}</div><div className="stepper"><button aria-label={`${labels[key]} 티켓 감소`} disabled={!policy.tickets[key]} onClick={() => setPolicy({
              ...policy,
              tickets: {
                ...policy.tickets,
                [key]: policy.tickets[key] - 1
              }
            })}>−</button><output aria-label={`${labels[key]} 티켓`}>{policy.tickets[key]}</output><button aria-label={`${labels[key]} 티켓 증가`} disabled={policy.tickets[key] >= 5} onClick={() => setPolicy({
              ...policy,
              tickets: {
                ...policy.tickets,
                [key]: policy.tickets[key] + 1
              }
            })}>+</button></div></div>;
      })}</section>)}</div>{!validPolicy(policy) && <p className="error" role="alert">예산을 {used - max}장 초과했습니다. 배분을 줄여 주세요.</p>}<TrainingFatigueForecast player={player} policy={policy} /><p className="micro muted training-note">표시된 성장은 집중 훈련의 기본값입니다. 재능·실제 훈련일·능력 구간에 따라 달라집니다. 남은 티켓은 이월되지 않습니다.</p></>;
}
function TrainingFatigueForecast({ player, policy }: { player: Player; policy: Policy }) {
  const forecast = fatigueForecast(player, policy);
  return <div className="fatigue-forecast">
    <div className="training-forecast">
      <span>훈련 발생 <b>+{forecast.weeklyTraining.toFixed(1)} / 주</b></span>
      <span>회복 가능량 <b>−{forecast.recoveryCapacity.toFixed(1)} / 주</b></span>
    </div>
    <p className="forecast-result">회복 후 예상 피로 <b>{forecast.end.toFixed(1)}</b><span>주중 최고 {forecast.peak.toFixed(1)}</span></p>
    <p className="micro muted training-note">{forecast.weeklyTraining > 0 && forecast.end === 0 ? "훈련 중 피로는 발생하지만, 야간·주말 회복으로 다음 주에는 0이 될 수 있습니다. " : ""}정규 훈련 5일·휴식 2일 기준의 예상치이며, 경기·부상·비시즌 일정에 따라 달라집니다.</p>
  </div>;
}

function FatigueBreakdown({ report }: { report: Report }) {
  const fatigue = report.fatigue;
  if (!fatigue) return null;
  return <div className="fatigue-breakdown">
    <div className="fatigue-totals">
      <div><span>훈련 피로</span><b>+{fatigue.training.toFixed(1)}</b></div>
      <div><span>경기 피로</span><b>+{fatigue.game.toFixed(1)}</b></div>
      <div><span>실제 회복</span><b className="positive">−{fatigue.recovered.toFixed(1)}</b></div>
      <div><span>주중 최고</span><b>{fatigue.peak.toFixed(1)}</b></div>
    </div>
    {report.fatigueAfter === 0 && fatigue.training + fatigue.game > 0 && <p className="fatigue-explanation">피로가 발생했지만 야간·휴식 회복으로 모두 해소되었습니다.</p>}
    <details>
      <summary>일자별 피로 내역</summary>
      <div className="table-scroll"><table>
        <thead><tr><th>날짜</th><th>훈련</th><th>경기</th><th>회복</th><th>회복 전 최고</th><th>회복 후</th></tr></thead>
        <tbody>{fatigue.days.map(day => <tr key={day.date}>
          <td>{dateLabel(day.date).slice(5)}</td><td>+{day.training.toFixed(1)}</td><td>+{day.game.toFixed(1)}</td>
          <td className="positive">−{day.recovered.toFixed(1)}</td><td>{day.peak.toFixed(1)}</td><td>{day.end.toFixed(1)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="micro muted">회복은 실제 줄어든 피로만 집계하며, 발생량은 상한 100 안에서 반영된 값입니다.</p>
    </details>
  </div>;
}

function StanceEditor({
  stance,
  setStance
}: {
  stance: Stance;
  setStance: (s: Stance) => void;
}) {
  return <div className="stance-editor"><div><span className="small muted">타격 성향</span><div className="segmented">{(["down", "level", "up"] as const).map((v, i) => <button key={v} className={stance.batting === v ? "selected" : ""} onClick={() => setStance({
          ...stance,
          batting: v
        })}>{["다운스윙", "레벨스윙", "어퍼스윙"][i]}</button>)}</div><p className="micro muted">{stance.batting === "level" ? "기본 능력을 유지하는 균형 잡힌 스윙" : stance.batting === "down" ? "컨택 +15% · 파워 −15% · 땅볼 성향" : "파워 +15% · 컨택 −15% · 뜬공 성향"}</p></div><div><span className="small muted">투구 성향</span><div className="segmented">{(["full", "command"] as const).map((v, i) => <button key={v} className={stance.pitching === v ? "selected" : ""} onClick={() => setStance({
          ...stance,
          pitching: v
        })}>{["전력투구", "커맨드 투구"][i]}</button>)}</div><p className="micro muted">{stance.pitching === "full" ? "구속 +12% · 제구 −8% · 아웃당 피로 1.25" : "제구 +12% · 구속 −6% · 아웃당 피로 0.90"}</p></div></div>;
}
function RecordStats({
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
      return <div className={`schedule-day ${i === 0 ? "today" : ""} ${game ? "game-day" : ""}`} key={date}><span>{["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][dow]}</span><b>{Number(date.slice(-2))}</b><small>{game ? "연습경기" : train ? "훈련" : "휴식"}</small><i /></div>;
    })}</div>;
}
function GrowthChart({
  state
}: {
  state: GameState;
}) {
  const history = state.history;
  const values = history.map(h => h.ovr);
  const min = Math.floor(Math.min(...values)) - 1;
  const max = Math.ceil(Math.max(...values)) + 2;
  const points = history.map((h, i) => `${30 + i / Math.max(1, history.length - 1) * 490},${115 - (h.ovr - min) / (max - min) * 90}`).join(" ");
  return <div className="chart"><svg viewBox="0 0 550 150" role="img" aria-label={`종합 능력 ${values[0].toFixed(1)}에서 ${values[values.length - 1].toFixed(1)}로 성장`}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#0e2046" stopOpacity=".1" /><stop offset="1" stopColor="#0e2046" stopOpacity="0" /></linearGradient></defs>{[0, 1, 2].map(i => <g key={i}><line x1="30" y1={25 + i * 45} x2="525" y2={25 + i * 45} stroke="#e9ecf0" strokeDasharray="3 4" /><text x="0" y={29 + i * 45} fill="#8d95a3" fontSize="10">{(max - i * (max - min) / 2).toFixed(0)}</text></g>)}<polygon points={`30,120 ${points} ${history.length > 1 ? 520 : 30},120`} fill="url(#chartFill)" /><polyline points={points} fill="none" stroke="#0e2046" strokeWidth="2.5" strokeLinejoin="round" />{history.length < 2 && <circle cx="30" cy={115 - (values[0] - min) / (max - min) * 90} r="4" fill="#0e2046" />}<text x="30" y="145" fontSize="10" fill="#8d95a3">입학</text><text x="500" y="145" fontSize="10" fill="#8d95a3">현재</text></svg></div>;
}
function Dashboard({
  state,
  onTab,
  policy
}: {
  state: GameState;
  onTab: (t: Tab) => void;
  policy: Policy;
}) {
  const p = getPlayer(state);
  const injured = p.injury && state.date < p.injury.unavailableUntil;
  const nextGame = state.calendar.events.find(g => g.status === "scheduled" && g.date >= state.date && (g.homeTeamId === p.teamId || g.awayTeamId === p.teamId));
  const myGames = state.calendar.events.filter(g => g.status !== "scheduled" && (g.homeTeamId === p.teamId || g.awayTeamId === p.teamId));
  const last = myGames[myGames.length - 1];
  const team = state.teams[p.teamId];
  return <><div className="dashboard-banner"><div><span className="eyebrow">MY BASEBALL, MY STORY</span><h1>{p.grade === 1 && state.week === 1 ? "첫 번째 시즌, 첫 번째 발걸음." : `${p.name}, 오늘도 한 걸음 앞으로.`}</h1><p>{p.grade === 1 && state.week === 1 ? "큰 꿈은 작은 훈련에서 시작됩니다. 이번 주의 계획을 세워보세요." : "매주 쌓이는 선택과 기록이 당신의 다음 시즌을 만듭니다."}</p></div><div className="banner-season"><b>{state.calendar.seasonYear}</b><span>HIGH SCHOOL SEASON</span></div><Diamond decorative /></div><div className="metric-grid"><div className="metric-card"><span><Icon name="trend" />종합 능력</span><div><strong>{ovr(p).toFixed(1)}</strong><small className="positive">+{(ovr(p) - ovr({
              ...p,
              stats: p.initialStats
            })).toFixed(1)} <span className="muted">입학 대비</span></small></div><div className="metric-track"><i style={{
            width: `${ovr(p)}%`
          }} /></div></div><div className="metric-card"><span><Icon name="heart" />피로도 <small className="fatigue-timing">회복 후</small><i className={`status-dot ${p.fatigue >= 60 ? "warning" : ""}`} /></span><div><strong>{p.fatigue.toFixed(1)}<small>/ 100</small></strong><small>{p.forcedRest ? "강제 휴식" : p.fatigue >= 80 ? "휴식 필요" : p.fatigue >= 60 ? "주의" : "좋은 컨디션"}</small></div><div className="metric-track"><i className={p.fatigue >= 60 ? "warm" : "green"} style={{
            width: `${p.fatigue}%`
          }} /></div><p className="micro muted">{state.report?.fatigue ? `지난주 최고 ${state.report.fatigue.peak.toFixed(1)} · 야간·휴식 회복 후` : "야간·휴식 회복 후 현재 피로"}</p></div><div className="metric-card"><span><Icon name="award" />선수 평판</span><div><strong>{p.reputation === null ? "—" : Math.round(p.reputation)}<small>{p.reputation === null ? "" : "/ 100"}</small></strong><small>{p.reputation === null ? "아직 평가 전" : `상위 ${Math.max(1, 100 - Math.round(p.reputation))}%`}</small></div><p className="micro muted">{state.players.filter(x => x.reputation !== null).length.toLocaleString()} / {state.players.length.toLocaleString()}명 평가</p></div><div className="metric-card"><span><Icon name="ball" />팀 시즌 성적</span><div><strong>{team.wins}<small>승</small> {team.losses}<small>패</small></strong><small>{team.draws}무 · {myGames.length}경기</small></div><p className="micro muted">{team.name} 야구부</p></div></div><div className="dashboard-columns"><div className="main-column"><Panel title="이번 주 일정" eyebrow="WEEKLY SCHEDULE" action={<button className="text-button" onClick={() => onTab("games")}>전체 일정 <Icon name="chevron" size={14} /></button>}><WeekSchedule state={state} /><div className="next-match">{nextGame ? <><span className="outline-tag">NEXT GAME</span><span>{dateLabel(nextGame.date)} <b>vs {state.teams[nextGame.homeTeamId === p.teamId ? nextGame.awayTeamId : nextGame.homeTeamId].name}</b></span><small className="muted">개발 리그</small></> : <><Icon name="calendar" size={18} /><span>남은 시즌은 훈련과 회복에 집중하는 시간입니다.</span></>}</div></Panel><Panel title="시즌 기록" eyebrow="SEASON STATS" action={<div className="records-panel-action"><button className="text-button" onClick={() => onTab("records")}>연도별 기록 <Icon name="chevron" size={14} /></button><span className="small muted">{isPitcher(p.primaryRole) ? `${p.seasonStats.pitching.BF} 상대 타자` : `${p.seasonStats.batting.PA} 타석`}</span></div>}><RecordStats records={p.seasonStats} pitching={isPitcher(p.primaryRole)} />{!p.seasonStats.batting.PA && !p.seasonStats.pitching.outs && <p className="empty-note">아직 출전 기록이 없습니다. 훈련으로 출전 기회를 만들어보세요.</p>}</Panel><Panel title="성장의 발자취" eyebrow="GROWTH TRACKER" action={<span className="chart-legend"><i /> 종합 능력 OVR</span>}><GrowthChart state={state} /></Panel>{state.report && <WeeklyReport state={state} />}</div><aside className="side-column"><PlayerCard player={p} school={team.name} /><Panel title="이번 주 훈련" action={<button className="text-button" onClick={() => onTab("training")}>설정 <Icon name="chevron" size={14} /></button>}><div className="training-compact"><div><span className="mode-tag">{modeNames[policy.mode]}</span><b>{ticketsUsed(policy)}<small> / {budget(policy.mode)}장</small></b></div>{trainingGroups.filter(group => group.keys.some(key => policy.tickets[key] > 0)).map(group => <section className="compact-training-group" key={group.id}><h3>{group.label}</h3>{group.keys.filter(k => policy.tickets[k] > 0).map(k => <div className="compact-row" key={k}><span>{labels[k]}</span><div>{Array.from({
                  length: 5
                }, (_, i) => <i key={i} className={i < policy.tickets[k] ? "filled" : ""} />)}</div><b>{policy.tickets[k]}</b></div>)}</section>)}</div></Panel><div className={`condition-note ${injured ? "injured" : ""}`}><Icon name={injured ? "heart" : "info"} /><div><b>{injured ? "지금은 회복이 필요합니다." : "꾸준함이 실력이 됩니다."}</b><p>{injured ? `${dateLabel(p.injury!.unavailableUntil)}부터 복귀 예정입니다.` : "피로가 60 이상이면 부상 위험이 생깁니다. 훈련과 휴식의 균형을 찾아보세요."}</p></div></div>{last && <Panel title="최근 경기"><GameScore game={last} state={state} compact /></Panel>}</aside></div></>;
}
function WeeklyReport({
  state
}: {
  state: GameState;
}) {
  const r = state.report;
  if (!r) return null;
  return <Panel title="지난주 리포트" eyebrow="WEEK IN REVIEW" action={<span className="small muted">{dateLabel(r.from).slice(5)} – {dateLabel(r.to).slice(5)}</span>}><div className="report-summary"><div><span>능력 성장</span><b className="positive">+{Object.values(r.growth).reduce((a, b) => a + b, 0).toFixed(2)}</b></div><div><span>회복 후 피로 변화</span><b>{r.fatigueBefore.toFixed(1)} → {r.fatigueAfter.toFixed(1)}</b></div><div><span>타석 / 투구</span><b>{r.records.batting.PA} PA / {innings(r.records.pitching.outs)} IP</b></div></div><FatigueBreakdown report={r} /><div className="growth-chips">{statKeys.filter(k => r.growth[k] > .001).map(k => <span key={k}>{labels[k]} <b>+{r.growth[k].toFixed(2)}</b></span>)}</div>{r.messages.map((m, i) => <p key={i} className="report-message"><Icon name="info" size={15} />{m}</p>)}</Panel>;
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
  return <div className={`game-score ${compact ? "compact" : ""}`}><span className="game-date">{dateLabel(game.date).slice(5)}<small>{game.status === "scheduled" ? "경기 예정" : game.status === "forfeit" ? "기권 경기" : "경기 종료"}</small></span><div className="team-match"><b>{state.teams[p.teamId].name}</b><span className="score">{game.status === "scheduled" ? "VS" : game.status === "forfeit" ? "—" : `${score[0]} : ${score[1]}`}</span><b>{opponent.name}</b></div><span className={`result-tag ${game.status === "scheduled" ? "scheduled" : won ? "win" : score[0] === score[1] && game.status !== "forfeit" ? "draw" : "loss"}`}>{game.status === "scheduled" ? "예정" : game.status === "forfeit" ? won ? "기권승" : "기권패" : score[0] === score[1] ? "무" : won ? "승" : "패"}</span></div>;
}
function GamesView({
  state
}: {
  state: GameState;
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const p = getPlayer(state);
  const games = state.calendar.events.filter(g => (g.homeTeamId === p.teamId || g.awayTeamId === p.teamId) && (filter === "all" || (filter === "played" ? g.status !== "scheduled" : g.status === "scheduled")));
  const detail = state.calendar.events.find(g => g.id === selected);
  return <><div className="section-intro"><div><span className="eyebrow">SCHEDULE & RECORDS</span><h1>그라운드 위의 기록</h1><p>경기는 자동으로 진행됩니다. 매 타석의 결과가 선수의 기록이 됩니다.</p></div><span className="notice-tag"><Icon name="info" size={14} />개발용 가상 일정</span></div><Panel title={`${state.calendar.seasonYear} 시즌 일정`} action={<div className="segmented small-segment">{[["all", "전체"], ["played", "종료"], ["upcoming", "예정"]].map(([v, label]) => <button className={filter === v ? "selected" : ""} onClick={() => setFilter(v)} key={v}>{label}</button>)}</div>}><div className="game-list">{games.map(g => <button className="game-row-button" onClick={() => setSelected(g.id)} key={g.id}><GameScore game={g} state={state} /><Icon name="chevron" size={16} /></button>)}{!games.length && <div className="empty-state"><Icon name="calendar" size={30} /><p>해당하는 경기가 없습니다.</p></div>}</div></Panel>{detail && <Panel title={`${dateLabel(detail.date)} 경기 상세`} action={<button className="icon-button" aria-label="경기 상세 닫기" onClick={() => setSelected(null)}><Icon name="close" size={18} /></button>}><GameScore game={detail} state={state} />{detail.status === "scheduled" ? <p className="empty-note">주간 진행으로 경기 날짜에 도달하면 자동으로 계산됩니다.</p> : detail.status === "forfeit" ? <p className="empty-note">출전 가능한 선수 부족으로 기권 처리되었습니다. 개인 기록은 생성되지 않습니다.</p> : <><div className="table-scroll"><table className="scoreboard"><thead><tr><th>TEAM</th>{Array.from({
                  length: Math.max(...detail.innings.map(x => x.length))
                }, (_, i) => <th key={i}>{i + 1}</th>)}<th>R</th></tr></thead><tbody>{[1, 0].map(side => <tr key={side}><th>{state.teams[side === 0 ? detail.homeTeamId : detail.awayTeamId].name}</th>{Array.from({
                  length: Math.max(...detail.innings.map(x => x.length))
                }, (_, i) => <td key={i}>{detail.innings[side][i] ?? "X"}</td>)}<td><b>{detail.score[side]}</b></td></tr>)}</tbody></table></div><div className="box-score-personal"><b>나의 경기 기록</b>{detail.boxScore[p.id] ? <RecordStats records={detail.boxScore[p.id]} pitching={!!detail.boxScore[p.id].pitching.BF} /> : <p className="muted small">이 경기에는 출전하지 않았습니다.</p>}</div></>}</Panel>}</>;
}
function RosterView({
  state,
  onRecords
}: {
  state: GameState;
  onRecords: (playerId: string) => void;
}) {
  const [scope, setScope] = useState("team");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(state.playerId);
  const [sort, setSort] = useState("score");
  const player = getPlayer(state);
  const roster = state.players.filter(p => (scope === "all" || p.teamId === player.teamId) && (p.name.includes(query) || state.teams[p.teamId].name.includes(query))).sort((a, b) => sort === "grade" ? b.grade - a.grade || b.stats.contact - a.stats.contact : sort === "reputation" ? (b.reputation ?? -1) - (a.reputation ?? -1) : roleScore(b) - roleScore(a));
  const detail = state.players.find(p => p.id === selected) ?? player;
  return <><div className="section-intro"><div><span className="eyebrow">PLAYERS & ROSTER</span><h1>함께 뛰고, 함께 경쟁하다.</h1><p>감독은 역할 능력·최근 성적·피로를 보고 출전을 결정합니다.</p></div></div><div className="roster-layout"><Panel title={scope === "team" ? `${state.teams[player.teamId].name} 로스터` : "전국 고교 선수"} action={<span className="small muted">{roster.length.toLocaleString()}명</span>}><div className="roster-toolbar"><div className="segmented"><button onClick={() => setScope("team")} className={scope === "team" ? "selected" : ""}>우리 학교</button><button onClick={() => setScope("all")} className={scope === "all" ? "selected" : ""}>전국</button></div><input aria-label="선수 검색" placeholder="선수 · 학교 검색" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="로스터 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="score">역할 능력순</option><option value="grade">학년순</option><option value="reputation">평판순</option></select></div><div className="table-scroll roster-table"><table><thead><tr><th>선수</th><th>학년</th><th>포지션</th><th>OVR</th><th>역할 능력</th><th>평판</th><th>상태</th></tr></thead><tbody>{roster.slice(0, 100).map(p => <tr key={p.id} className={p.id === selected ? "selected-row" : ""}><td><button className="player-name-button" onClick={() => setSelected(p.id)}>{p.name}{p.id === state.playerId && <small>MY</small>}</button>{scope === "all" && <span className="table-school">{state.teams[p.teamId].name}</span>}</td><td>{p.grade}</td><td>{positions[p.position]}</td><td><b>{Math.round(ovr(p))}</b></td><td>{roleScore(p).toFixed(1)}</td><td>{p.reputation === null ? "—" : Math.round(p.reputation)}</td><td><span className={p.injury && state.date < p.injury.unavailableUntil ? "error" : "muted"}>{p.injury && state.date < p.injury.unavailableUntil ? "부상" : p.forcedRest ? "휴식" : `${p.fatigue.toFixed(0)} 피로`}</span></td></tr>)}</tbody></table>{!roster.length && <p className="empty-note">검색 결과가 없습니다.</p>}</div>{roster.length > 100 && <p className="micro muted training-note">상위 100명을 표시합니다. 이름이나 학교로 검색할 수 있습니다.</p>}</Panel><div><Panel title={`${detail.name} 상세`} action={<button className="text-button" onClick={() => onRecords(detail.id)}>연도별 기록 <Icon name="chevron" size={14} /></button>}><div className="detail-role"><span>{state.teams[detail.teamId].name} · {detail.grade}학년</span><b>{positions[detail.position]}</b><span>피지컬 {((detail.stats.stamina + detail.stats.recovery + detail.stats.arm) / 3).toFixed(2)} · 기본 능력 평균</span>{detail.injury && <span className="error">{state.date < detail.injury.unavailableUntil ? `${dateLabel(detail.injury.unavailableUntil)} 복귀 예정` : "복귀 후 능력 회복 중"} · 회복 예정 저하 −{detail.injury.penaltyRemaining.toFixed(2)}</span>}</div><div className="all-stats">{statKeys.map(k => <div key={k}><span>{labels[k]}</span><b>{detail.stats[k].toFixed(2)}</b><small className="muted">유효 {effective(detail)[k].toFixed(1)}</small></div>)}</div><div className="talent-row"><span>타자 <b>{talentLabel(detail, "batting")}</b></span><span>투수 <b>{talentLabel(detail, "pitching")}</b></span></div><p className="micro muted training-note">기본 능력과 경기용 유효 능력은 별도로 관리됩니다. 스태미나·회복력·어깨의 평균이 피지컬입니다.</p></Panel></div></div></>;
}
function DraftView({
  state,
  onNew,
  onRecords
}: {
  state: GameState;
  onNew: () => void;
  onRecords: () => void;
}) {
  const p = getPlayer(state);
  const pick = state.draft.find(d => d.playerId === p.id);
  const ended = state.phase === "ended";
  const career = [...p.career, {
    year: state.calendar.seasonYear,
    grade: p.grade,
    records: p.seasonStats,
    stats: p.stats
  }];
  return <><section className="draft-hero"><span className="outline-tag">THE NEXT CHAPTER</span><h1>{ended ? pick ? "꿈이, 다음 무대로 이어집니다." : "세 번의 시즌. 하나의 이야기." : "당신의 이름이 불리는 그날까지."}</h1><p>{ended ? pick ? `${pick.club} · 전체 ${pick.overall}순위 · ${pick.role} 지명` : "이번 드래프트에서는 지명받지 못했습니다. 그라운드에서 쌓은 시간과 성장은 당신의 기록으로 남습니다." : `고3 ${calendar(state.calendar.seasonYear + 3 - p.grade).draftDate.slice(5).replace("-", "월 ")}일, 프로를 향한 도전의 결과가 결정됩니다.`}</p>{ended ? <button className="primary white-button" onClick={onNew}>새로운 커리어 시작 <Icon name="arrow" size={18} /></button> : <div className="draft-steps">{[1, 2, 3].map(g => <span className={p.grade >= g ? "active" : ""} key={g}>고교 {g}학년{p.grade > g ? " ✓" : p.grade === g ? " · 진행 중" : ""}</span>)}</div>}<Diamond decorative /></section><div className="draft-grid"><Panel title="나의 고교 커리어" eyebrow="CAREER RECORD" action={<button className="text-button" onClick={onRecords}>상세 기록 <Icon name="chevron" size={14} /></button>}><div className="table-scroll"><table><thead><tr><th>시즌</th><th>학년</th><th>타석</th><th>타율</th><th>HR</th><th>투구 이닝</th><th>ERA</th></tr></thead><tbody>{career.map(c => <tr key={c.year}><td>{c.year}</td><td>{c.grade}학년</td><td>{c.records.batting.PA}</td><td>{fixed(avg(c.records))}</td><td>{c.records.batting.HR}</td><td>{innings(c.records.pitching.outs)}</td><td>{era(c.records)?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></div><div className="career-growth"><b>입학 이후의 성장</b><StatBars player={p} compare /></div></Panel><Panel title={ended ? "드래프트 결과" : "스카우팅 노트"} eyebrow="DRAFT BOARD">{ended ? <div className="draft-picks">{state.draft.map(d => <div className={d.playerId === p.id ? "my-pick" : ""} key={d.overall}><span>{String(d.overall).padStart(2, "0")}</span><div><b>{d.playerName} <small>{d.role}</small></b><p>{d.teamName} → {d.club}</p></div></div>)}</div> : <div className="scouting-notes"><Icon name="award" size={36} /><h3>가능성은 아직 열려 있습니다.</h3><p>현재 역할 능력 60%<br />성장 재능 25% · 기록 평판 15%<br />여기에 구단별 수요를 더해 지명합니다.</p><div className="info-box">높은 OVR이나 평판만으로 지명이 보장되지 않습니다. 고3 선수 약 10%가 10개 가상 구단의 선택을 받습니다.</div></div>}</Panel></div></>;
}
function Modal({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return <dialog ref={ref} onCancel={onClose} className="modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="close" /></button></div>{children}</dialog>;
}
function ProgressControls({ state, policy, busy, auto, autoStartWeek, onAdvance, onToggleAuto }: {
  state: GameState;
  policy: Policy;
  busy: boolean;
  auto: boolean;
  autoStartWeek: number;
  onAdvance: () => void;
  onToggleAuto: () => void;
}) {
  const pendingOffer = !!getPlayer(state).roleOffer;
  return <div className="week-control">
    <div>
      <div className="week-control-info">
        <span className="week-label">WEEK {String(state.week).padStart(2, "0")}</span>
        <div>
          <b>{dateLabel(state.date)}</b>
          <span>{modeNames[policy.mode]} · {ticketsUsed(policy)} / {budget(policy.mode)}장{!validPolicy(policy) ? " · 예산 초과" : ""}</span>
        </div>
        {auto && <span className="auto-running" role="status"><i className="status-dot" />자동 진행 · {state.week - autoStartWeek}주 완료</span>}
      </div>
      <p>{auto ? "설정 유지 중 · 부상·역할 제안·드래프트 때 멈춥니다." : "훈련 설정을 유지하며 자동으로 진행할 수 있습니다."}</p>
      <div className="progress-actions">
        <button className={`secondary auto-toggle ${auto ? "is-running" : ""}`} aria-pressed={auto}
          disabled={!auto && (busy || !validPolicy(policy) || pendingOffer)}
          title={pendingOffer ? "감독의 역할 제안에 먼저 답해 주세요." : auto ? "계산 중인 한 주를 마친 뒤 일시정지합니다." : "현재 설정으로 계속 진행합니다. 부상·역할 제안·드래프트 시 멈춥니다."}
          onClick={onToggleAuto}>
          <span aria-hidden="true">{auto ? "Ⅱ" : "▷"}</span>{auto ? "일시정지" : "자동 진행"}
        </button>
        <button className="primary" disabled={busy || auto || !validPolicy(policy)} onClick={onAdvance}>
          {busy ? <><span className="spinner" />한 주를 진행하는 중…</> : <>1주 진행하기<Icon name="arrow" size={19} /></>}
        </button>
      </div>
    </div>
  </div>;
}

export default function BaseballLife() {
  const [state, setState] = useState<GameState | null>(null);
  const [recordPlayerId, setRecordPlayerId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [policy, setPolicy] = useState<Policy>(defaultPolicy("센터라인"));
  const [stance, setStance] = useState<Stance>({
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
    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [autoProgress]);
  const start = (s: GameState) => {
    pauseAuto();
    setRecordPlayerId(null);
    setState(s);
    setPolicy(structuredClone(getPlayer(s).trainingPolicy));
    setStance({
      ...getPlayer(s).stance
    });
    setTab("home");
    notify(`${s.teams[getPlayer(s).teamId].name} 야구부에 입학했습니다. 첫 시즌을 시작하세요!`);
  };
  const advance = useCallback(() => {
    if (!state || locked.current || !validPolicy(policy) || state.phase === "ended") return;
    locked.current = true;
    setBusy(true);
    setError("");
    const requestId = ++requestRef.current;
    const finish = () => {
      locked.current = false;
      setBusy(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    try {
      if (!workerRef.current) workerRef.current = new Worker(new URL("../../lib/sim/worker.ts", import.meta.url));
      workerRef.current.onmessage = (event: MessageEvent<{
        requestId: number;
        result?: GameState;
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
          const running = autoProgress.active;
          const reason = running ? autoPauseReason(state, event.data.result) : null;
          setState(event.data.result);
          if (reason) pauseAuto(reason);
          if (event.data.result.phase === "ended") setTab("draft");
          else if (!running) notify("한 주가 지났습니다. 주간 리포트를 확인하세요.");
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
        state,
        policy,
        stance
      });
    } catch (e) {
      finish();
      pauseAuto();
      setError((e as Error).message);
    }
  }, [state, policy, stance, autoProgress, notify, pauseAuto]);

  useEffect(() => {
    if (!auto || busy || !state || state.phase === "ended") return;
    autoProgress.schedule(advance);
    return () => autoProgress.cancelScheduled();
  }, [auto, busy, state, autoProgress, advance]);

  const player = state ? getPlayer(state) : null;
  const recordPlayer = state ? state.players.find(p => p.id === recordPlayerId) ?? player! : null;
  const openRecords = (playerId: string | null = null) => {
    setRecordPlayerId(playerId);
    setTab("records");
  };
  const toggleAuto = () => {
    if (autoProgress.active) {
      pauseAuto(busy ? "자동 진행을 일시정지합니다. 계산 중인 한 주를 마친 뒤 멈춥니다." : "자동 진행을 일시정지했습니다.");
      return;
    }
    if (!state || locked.current || state.phase === "ended" || !validPolicy(policy) || player?.roleOffer) return;
    setError("");
    setAutoStartWeek(state.week);
    autoProgress.start();
    setAuto(true);
  };
  const savePolicy = () => {
    if (!state || locked.current || autoProgress.active || !validPolicy(policy)) return;
    const s = structuredClone(state);
    getPlayer(s).trainingPolicy = structuredClone(policy);
    getPlayer(s).stance = {
      ...stance
    };
    setState(s);
    notify("이번 주 훈련과 경기 성향을 저장했습니다.");
  };
  const newGame = () => {
    pauseAuto();
    setRecordPlayerId(null);
    workerRef.current?.terminate();
    workerRef.current = null;
    requestRef.current++;
    setState(null);
    setTab("home");
    setReset(false);
    setError("");
  };
  return <><div className="utility-bar"><div><span>나만의 야구선수 만들기</span><span>HIGH SCHOOL CAREER SIMULATOR <i /> v0.3</span></div></div><header className="site-header"><div className="header-main"><button className="brand" onClick={() => setTab("home")} aria-label="베이스볼 라이프 홈"><span className="brand-symbol"><Icon name="ball" size={30} /></span><span>BASEBALL<b>LIFE<span className="brand-dot">.</span></b></span></button><span className="brand-description">첫 유니폼부터<br /><b>드래프트까지.</b></span><div className="header-actions"><button onClick={() => { pauseAuto("플레이 가이드를 열어 자동 진행을 일시정지했습니다."); setHelp(true); }}><Icon name="info" size={16} />플레이 가이드</button>{state && <button onClick={() => setReset(true)} disabled={busy || auto}><Icon name="refresh" size={15} />새 커리어</button>}<span className="live-badge"><i />{state ? `${state.calendar.seasonYear} SEASON` : "YOUR NEXT CHAPTER"}</span></div></div><nav className="main-nav" aria-label="주요 메뉴"><div>{tabs.map(t => <button key={t.id} disabled={!state} className={tab === t.id ? "active" : ""} onClick={() => { if (t.id === "records") openRecords(); else setTab(t.id); }}><Icon name={t.icon} size={17} />{t.label}{t.id === "draft" && <span className="nav-new">DRAFT</span>}</button>)}<span className="nav-note">{state ? `고교 ${player!.grade}학년 · WEEK ${String(state.week).padStart(2, "0")}` : "나의 첫 번째 시즌을 준비하세요"}</span></div></nav></header><main className="app-main">{!state ? <PlayerSetup onStart={start} /> : <><div className="page-kicker"><span>MY CAREER <Icon name="chevron" size={12} />{tabs.find(t => t.id === tab)?.label}</span><span><i className="status-dot" />개발용 가상 일정 · {dateLabel(state.date)}<b>{["일", "월", "화", "수", "목", "금", "토"][new Date(state.date + "T00:00:00Z").getUTCDay()]}요일</b></span></div>{error && <div role="alert" className="error-banner"><Icon name="info" />{error}<button aria-label="오류 메시지 닫기" onClick={() => setError("")}>×</button></div>}{player?.roleOffer && state.phase !== "ended" && <div className="offer-banner"><Icon name="users" /><div><b>감독의 새로운 제안 · {player.roleOffer}</b><p>다른 역할에서 가능성을 발견했습니다. 수락하면 역할과 출전 자격이 추가됩니다.</p></div><button onClick={() => {
            setState(answerOffer(state, true));
            notify("새 역할을 수락했습니다. 훈련 배분을 확인하세요.");
          }} disabled={busy || auto}>수락</button><button onClick={() => setState(answerOffer(state, false))} disabled={busy || auto}>현재 역할 유지</button></div>}<fieldset className="content-lock" disabled={(busy || auto) && tab !== "records"}>{tab === "home" && <Dashboard state={state} onTab={next => { if (next === "records") openRecords(); else setTab(next); }} policy={policy} />}{tab === "training" && <><div className="section-intro"><div><span className="eyebrow">TRAINING CENTER</span><h1>오늘의 훈련이, 내일의 선수를.</h1><p>8개 능력에 티켓을 배분하세요. 선택은 다음 주에도 유지됩니다.</p></div><button className="primary" onClick={savePolicy} disabled={!validPolicy(policy) || state.phase === "ended"}><Icon name="check" size={17} />훈련 설정 저장</button></div><div className="training-layout"><Panel title="주간 훈련 배분" eyebrow="WEEKLY TRAINING"><fieldset className="content-lock" disabled={state.phase === "ended"}><TrainingEditor player={player!} policy={policy} setPolicy={setPolicy} /></fieldset></Panel><div className="side-column"><Panel title="경기 성향" eyebrow="PLAYING STYLE"><fieldset className="content-lock" disabled={state.phase === "ended"}><StanceEditor stance={stance} setStance={setStance} /></fieldset></Panel><PlayerCard player={player!} school={state.teams[player!.teamId].name} /><div className="condition-note"><Icon name="info" /><div><b>휴식도 훈련의 일부입니다.</b><p>회복 위주 방침은 티켓을 0장으로 배분해야 합니다. 회복 중에는 경기에도 출전하지 않습니다.</p></div></div></div></div></>}{tab === "roster" && <RosterView state={state} onRecords={openRecords} />}{tab === "records" && <SeasonRecords key={recordPlayer!.id} player={recordPlayer!} year={state.calendar.seasonYear} school={state.teams[recordPlayer!.teamId].name} ended={state.phase === "ended"} mine={recordPlayer!.id === state.playerId} onMyRecords={() => openRecords()} />}{tab === "games" && <GamesView state={state} />}{tab === "draft" && <DraftView state={state} onNew={() => setReset(true)} onRecords={() => openRecords()} />}</fieldset></>}</main><footer className="site-footer"><div><span className="footer-brand">BASEBALL LIFE.</span><span>모든 선수에게는 자신만의 이야기가 있다.</span><span>개발용 가상 리그 · 실제 구단·선수와 무관</span></div></footer>{state && state.phase !== "ended" && <ProgressControls state={state} policy={policy} busy={busy} auto={auto} autoStartWeek={autoStartWeek} onAdvance={advance} onToggleAuto={toggleAuto} />}{toast && <div className="toast" role="status"><Icon name="check" size={17} />{toast}</div>}{busy && <div className="busy-indicator" role="status">훈련 · 경기 · 회복을 계산하고 있습니다.</div>}{help && <Modal title="플레이 가이드" onClose={() => setHelp(false)}><div className="guide-content"><p>선수 한 명을 만들어 고교 3시즌을 보내고, 고3 가을 드래프트에 도전합니다.</p><ol><li><b>훈련 센터</b>에서 가벼움 7장 · 보통 10장 · 강함 13장을 배분하세요. 각 능력은 0~5장입니다.</li><li><b>1주 진행하기</b>는 한 주만, <b>자동 진행</b>은 현재 훈련과 성향을 유지하며 계속 진행합니다. 일시정지는 계산 중인 한 주를 마친 뒤 적용됩니다. 새 부상·강제 휴식·역할 제안·드래프트 또는 계산 오류가 발생하면 자동으로 멈춥니다.</li><li><b>선수 · 로스터</b>에서 주전 경쟁을 확인하세요. 부상·피로·역할 능력·최근 성적에 따라 출전이 달라집니다.</li><li><b>개인 기록</b>에서 연도별 타격·투구 기록과 통산 합계를 확인하세요. 로스터에서 선수를 선택하면 다른 선수의 기록도 볼 수 있습니다.</li><li><b>고3 드래프트</b>에서 능력·재능·기록·구단 수요를 종합해 지명합니다.</li></ol><div className="info-box">플레이는 메모리에만 유지됩니다. 새로고침하거나 새 커리어를 시작하면 초기화됩니다. 현재 일정과 구단은 개발용 가상 데이터입니다.</div><p className="micro muted">간소화 규칙: 최대 12이닝, 사구·실책·도루·병살·희생타·야수선택 및 같은 경기 투타겸업 미지원. 투수 개인 승·패·세이브는 집계하지 않습니다.</p></div></Modal>}{reset && <Modal title="새로운 커리어를 시작할까요?" onClose={() => setReset(false)}><div className="guide-content"><p>현재 선수와 플레이 기록이 초기화됩니다.</p><div className="modal-actions"><button className="secondary" onClick={() => setReset(false)}>계속 플레이</button><button className="primary" onClick={newGame}>새 커리어 시작</button></div></div></Modal>}</>;
}
