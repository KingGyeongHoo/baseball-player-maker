import { useState } from "react";
import { leagueTable, resultsSource } from "../../lib/sim/calendar";
import { getPlayer } from "../../lib/sim/engine";
import type { Competition, GameState } from "../../lib/sim/types";

function status(state: GameState, competition: Competition, teamId: number) {
  if (competition.kind === "league") return state.date < competition.startDate ? "개막 예정" : state.date > competition.endDate ? "리그 종료" : "리그 진행 중";
  if (!competition.initialized) return ["emart", "phoenix"].includes(competition.id) ? "참가 예정" : "출전권 결정 대기";
  if (!competition.participantTeamIds.includes(teamId)) return "미출전";
  if (competition.championTeamId === teamId) return "우승";
  const last = state.calendar.events.filter(g => g.competitionId === competition.id && (g.status === "completed" || g.status === "forfeit") && [g.homeTeamId, g.awayTeamId].includes(teamId)).at(-1);
  if (last && last.advancingTeamId !== teamId) return "탈락";
  return "대회 참가 중";
}

export default function CompetitionSchedule({ state }: { state: GameState }) {
  const [selected, setSelected] = useState("spring");
  const p = getPlayer(state);
  const competition = state.calendar.competitions.find(c => c.id === selected)!;
  const games = state.calendar.events.filter(g => g.competitionId === competition.id);
  const table = leagueTable(state.calendar, competition.id, Math.floor(p.teamId / 10));
  const rounds = [...new Set(games.map(g => g.round!))].sort((a, b) => a - b);
  return <section className="panel competition-panel">
    <div className="panel-heading"><div><span className="eyebrow">ROAD TO THE CHAMPIONSHIP</span><h2>시즌 대회와 출전 현황</h2></div><span className="small muted">{state.calendar.seasonYear} 시즌</span></div>
    <div className="competition-grid">{state.calendar.competitions.map(c => <button className={selected === c.id ? "selected" : ""} key={c.id} onClick={() => setSelected(c.id)}><span className="micro">{c.startDate.slice(5).replace("-", ".")} — {c.endDate.slice(5).replace("-", ".")}</span><b>{c.name}</b><span className={`competition-status ${status(state, c, p.teamId) === "우승" ? "positive" : ""}`}>{status(state, c, p.teamId)}</span></button>)}</div>
    <div className="competition-detail"><h3>{competition.name}</h3><p className="small muted">게임 참가 규칙: {competition.entryRule}</p>
      {competition.kind === "league" ? <div className="table-scroll"><table><caption>우리 학교 {Math.floor(p.teamId / 10) + 1}조 순위 · 승점 → 득실 차 → 학교 번호 순</caption><thead><tr><th>순위</th><th>학교</th><th>승</th><th>패</th><th>무</th><th>승점</th><th>득실 차</th></tr></thead><tbody>{table.map((row, i) => <tr key={row.teamId} className={row.teamId === p.teamId ? "selected-row" : ""}><td>{i + 1}</td><td>{state.teams[row.teamId].name}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.draws}</td><td><b>{row.points}</b></td><td>{row.difference}</td></tr>)}</tbody></table></div> : <>
        {!competition.initialized ? <p className="empty-note">개막일에 참가 학교와 첫 대진을 확정합니다. 이후 승리한 학교가 다음 라운드로 진출합니다.</p> : <>
          <p className="small">참가 {competition.participantTeamIds.length}팀 · {competition.championTeamId === null ? `${competition.round}라운드` : `우승: ${state.teams[competition.championTeamId].name}`}</p>
          {competition.byes.includes(p.teamId) && <p className="positive small">우리 학교는 이번 라운드 부전승입니다.</p>}
          <details className="bracket-details" open><summary>전체 대진표 · 승리 팀이 다음 대진에 반영됩니다</summary><div className="bracket-rounds">{rounds.map(round => <div className="bracket-round" key={round}><h4>{round === competition.roundDates.length ? "결승" : `${round}라운드`} <span>{competition.roundDates[round - 1]?.slice(5).replace("-", ".")}</span></h4>{games.filter(g => g.round === round).map(game => <div className={`bracket-game ${[game.homeTeamId, game.awayTeamId].includes(p.teamId) ? "my-game" : ""}`} key={game.id}>{[game.homeTeamId, game.awayTeamId].map((teamId, side) => <div className={game.advancingTeamId === teamId ? "bracket-winner" : ""} key={teamId}><span>{state.teams[teamId].name}</span><b>{game.status === "scheduled" ? "—" : game.status === "forfeit" ? game.forfeitTeamId === teamId ? "기권패" : "기권승" : game.score[side]}</b></div>)}{game.status === "completed" && game.score[0] === game.score[1] && <small>12이닝 무승부 · 추첨 진출</small>}</div>)}</div>)}</div></details>
        </>}
      </>}
    </div>
    <div className="calendar-reference"><b>2026 실제 대회 일정 참고 · 게임용 편성</b><p>전국대회 개최 기간을 참고하고, 주말리그는 해당 연도의 주말에 맞춰 배치합니다. 학교·참가 기준·조 편성·세부 대진은 게임 규칙입니다. 2027년 이후 공식 확정 일정이 아닙니다. 토너먼트는 최대 12이닝 무승부 시 추첨으로 진출 팀을 정합니다. 전국체전은 이 커리어 범위에서 제외합니다.</p><a href={state.calendar.sourceUrl} target="_blank" rel="noreferrer">대한체육회 체육일정 ↗</a><a href={resultsSource} target="_blank" rel="noreferrer">KBSA 대회 운영 정보 ↗</a></div>
  </section>;
}
