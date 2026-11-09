import { scoreText } from "../../lib/display";
import { useMemo, useState } from "react";
import { teamRankings, teamStrength } from "../../lib/team-strength";
import { positions, getPlayer } from "../../lib/sim/engine";
import type { GameState } from "../../lib/sim/types";

export function TeamPowerSummary({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const p = getPlayer(state);
  const team = teamStrength(state.players, p.teamId);
  return <button className="team-power-summary" onClick={onOpen}>
    <span><small>OUR TEAM</small><b>{state.teams[p.teamId].name} 전력</b></span>
    <strong>{scoreText(team.overall)}<small> / 100</small></strong>
    <span className="team-summary-parts">타격 {scoreText(team.batting)} · 수비 {scoreText(team.defense)} · 투수 {scoreText(team.pitching)}</span>
    <span className="small">팀 전력 보기 →</span>
  </button>;
}

export default function TeamStrengthView({ state, onRecords }: { state: GameState; onRecords: (id: string) => void }) {
  const mine = getPlayer(state).teamId;
  const [selected, setSelected] = useState(mine);
  const rankings = useMemo(() => teamRankings(state), [state]);
  const rank = rankings.findIndex(t => t.teamId === selected);
  const power = rankings[rank];
  return <>
    <div className="section-intro"><div><span className="eyebrow">TEAM STRENGTH</span><h1>선수들이 만드는 팀의 힘.</h1><p>주전 1 · 후보 0.5의 가중치로 소속 선수의 능력치를 합산합니다.</p></div><button className="secondary" onClick={() => setSelected(mine)}>우리 학교 보기</button></div>
    <section className="panel team-strength-panel">
      <div className="panel-heading"><div><span className="eyebrow">{selected === mine ? "OUR TEAM" : "SCOUTING REPORT"}</span><h2>{power.team.name}</h2></div><span className="position-tag">전국 {rank + 1}위 / {rankings.length}팀</span></div>
      <div className="team-power-metrics">{([
        ["종합 전력", power.overall], ["타격 전력", power.batting], ["수비 전력", power.defense], ["투수 전력", power.pitching],
      ] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{scoreText(value)}<small> / 100</small></strong><div className="stat-track"><i style={{ width: `${value}%` }} /></div></div>)}</div>
      {power.team.schoolPrestige !== undefined && <p className="training-note"><b>학교 명문도 {scoreText(power.team.schoolPrestige)} / 100</b> · 명문도가 높을수록 실력과 재능이 좋은 신입생이 모일 가능성이 높습니다. 매년 팀 성적과 프로 지명 실적에 따라 달라지며, 지명 여부는 선수 개인의 평가로 결정됩니다.</p>}
      <div className="team-formula"><p><b>종합 전력 = (주전 역할 능력 합 + 후보 역할 능력 합 × 0.5) ÷ ({power.starters}명 + {power.members.length - power.starters}명 × 0.5)</b></p><p>기본 능력 기준 예상 주전: 야수·지명타자 9자리 + 선발·중간계투·마무리 각 1명. 같은 선수를 중복 선발하지 않으며, 주전 선정은 포지션별 역할 능력을 따릅니다. 부상·피로·훈련 방침에 따른 당일 출전 명단과는 차이가 있습니다.</p><details><summary>세부 전력 계산 보기</summary><p>타격: 컨택 40% + 파워 35% + 스피드 25%. 수비: 수비 60% + 어깨 25% + 야구 지능 15%. 타격·수비는 야수, 투수 전력은 투수의 역할 능력을 각각 주전 1·후보 0.5로 가중 평균합니다. 종합 전력은 모든 선수의 역할 능력으로 계산합니다.</p></details></div>
    </section>
    <div className="team-strength-layout">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">NATIONAL RANKING</span><h2>전국 팀 전력</h2></div></div><div className="table-scroll team-ranking-table"><table><thead><tr><th>순위</th><th>학교</th><th>종합</th><th>타격</th><th>수비</th><th>투수</th></tr></thead><tbody>{rankings.map((t, i) => <tr className={t.teamId === selected ? "selected-row" : ""} key={t.teamId}><td>{i + 1}</td><td><button className="player-name-button" onClick={() => setSelected(t.teamId)}>{t.team.name}{t.teamId === mine && <small>MY</small>}</button></td><td><b>{scoreText(t.overall)}</b></td><td>{scoreText(t.batting)}</td><td>{scoreText(t.defense)}</td><td>{scoreText(t.pitching)}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">PLAYER CONTRIBUTIONS</span><h2>{power.team.name} 선수별 전력</h2></div><span className="small muted">{power.members.length}명 · 가중치 합 {power.totalWeight}</span></div><div className="table-scroll"><table><thead><tr><th>선수</th><th>역할</th><th>구분</th><th>가중치</th><th>역할 능력</th><th>가중 점수</th></tr></thead><tbody>{power.members.map(row => <tr key={row.player.id}><td><button className="player-name-button" onClick={() => onRecords(row.player.id)}>{row.player.name}{row.player.id === state.playerId && <small>MY</small>}</button></td><td>{positions[row.slot ?? row.player.position]}</td><td>{row.slot ? "주전" : "후보"}</td><td>{row.weight}</td><td>{scoreText(row.score)}</td><td><b>{scoreText(row.contribution)}</b></td></tr>)}</tbody></table></div><p className="micro muted training-note">선수를 선택하면 연도별 개인 기록을 확인할 수 있습니다.</p></section>
    </div>
  </>;
}
