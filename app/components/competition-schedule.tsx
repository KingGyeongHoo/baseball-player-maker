import { useState } from "react";
import { leagueTable } from "../../lib/sim/calendar";
import { getPlayer } from "../../lib/sim/engine";
import {competitionRoundLabel,competitionRoundSize,schoolCompetitionStatus as status} from "../../lib/competition-progress";
import type { GameState } from "../../lib/sim/types";

export default function CompetitionSchedule({ state }: { state: GameState }) {
  const [selected, setSelected] = useState("spring");
  const p = getPlayer(state);
  const competition = state.calendar.competitions.find(c => c.id === selected)!;
  const games = state.calendar.events.filter(g => g.competitionId === competition.id);
  const table = leagueTable(state.calendar, competition.id, Math.floor(p.teamId / 10));
  const totalRounds=competition.roundDates.length||Math.ceil(Math.log2(Math.max(2,competition.participantTeamIds.length)));
  const rounds=Array.from({length:totalRounds},(_,i)=>i+1);
  const result=status(state,competition,p.teamId);
  return <section className="panel competition-panel">
    <div className="panel-heading"><div><span className="eyebrow">ROAD TO THE CHAMPIONSHIP</span><h2>시즌 대회와 출전 현황</h2></div><span className="small muted">{state.calendar.seasonYear} 시즌</span></div>
    <div className="competition-grid">{state.calendar.competitions.map(c => <button className={selected === c.id ? "selected" : ""} key={c.id} onClick={() => setSelected(c.id)}><span className="micro">{c.startDate.slice(5).replace("-", ".")} — {c.endDate.slice(5).replace("-", ".")}</span><b>{c.name}</b><span className={`competition-status ${status(state, c, p.teamId) === "우승" ? "positive" : ""}`}>{status(state, c, p.teamId)}</span></button>)}</div>
    <div className="competition-detail"><div className="competition-detail-heading"><div><span className="eyebrow">{competition.kind==='league'?'GROUP STAGE':'KNOCKOUT STAGE'}</span><h3>{competition.name}</h3></div><span className={`competition-result-badge ${result==='우승'?'champion':result.includes('탈락')?'eliminated':''}`}>{result}</span></div><p className="small muted competition-entry-rule">{competition.entryRule}</p>
      {competition.kind === "league" ? <section className="competition-standings"><header className="competition-group-heading"><div><span>GROUP {Math.floor(p.teamId/10)+1}</span><h4>{Math.floor(p.teamId/10)+1}조 순위</h4></div><small>우리 학교가 속한 조 · {table.length}팀</small></header><div className="table-scroll"><table><thead><tr><th>순위</th><th>학교</th><th>경기</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>게임차</th></tr></thead><tbody>{table.map(row => <tr key={row.teamId} className={row.teamId === p.teamId ? "selected-row" : ""}><td><span className={`group-rank${row.rank<=4?' group-promoted':''}`}>{row.rank}{row.tiePending?"T":""}</span></td><td>{state.teams[row.teamId].name}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.draws}</td><td><b>{row.wins+row.losses?row.percentage.toFixed(3):"—"}</b></td><td>{row.gamesBehind.toFixed(1)}</td></tr>)}</tbody></table></div></section> : <>
        {!competition.initialized ? <p className="empty-note">개막 전 · 대진 미정</p> : <>
          <p className="small">참가 {competition.participantTeamIds.length}팀 · {competition.championTeamId === null ? `${competition.round}라운드` : `우승: ${state.teams[competition.championTeamId].name}`}</p>
          {competition.byes.includes(p.teamId) && <p className="positive small">우리 학교는 이번 라운드 부전승입니다.</p>}
          <div className="national-bracket school-bracket" aria-label={`${competition.name} 토너먼트 대진표`}>{rounds.map(round=>{
            const matches=games.filter(game=>game.round===round).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),label=competitionRoundLabel(competition,round),final=competitionRoundSize(competition,round)===2;
            return <section className="national-bracket-round" key={round} aria-label={label}>
              <header className="national-bracket-round-heading"><span>ROUND {String(round).padStart(2,'0')}</span><h3>{label}</h3><small>{competition.roundDates[round-1]?.slice(5).replace('-','.')} · {matches.length?`${matches.length}경기`:'진출팀 대기'}</small></header>
              <div className="national-bracket-matches">{matches.length?matches.map(game=><article className={`national-match-card${final?' medal-gold':''}${[game.homeTeamId,game.awayTeamId].includes(p.teamId)?' my-game':''}`} key={game.id}>
                <header><div><span>{final?'CHAMPIONSHIP':'KNOCKOUT'}</span><h4>{final?'결승전':label}</h4></div><small>{game.status==='scheduled'?'경기 예정':game.status==='inProgress'?'진행 중':'경기 종료'}</small></header>
                <div className="national-match-teams">{[game.homeTeamId,game.awayTeamId].map((teamId,side)=><div className={game.advancingTeamId===teamId?'national-winner':''} key={teamId}><span>{state.teams[teamId].name}{teamId===p.teamId&&<small>우리 학교</small>}</span><b>{game.status==='scheduled'||game.status==='inProgress'?'—':game.status==='forfeit'?game.forfeitTeamId===teamId?'기권패':'기권승':game.score[side]}</b></div>)}</div>
                <footer><time dateTime={game.date}>{Number(game.date.slice(5,7))}월 {Number(game.date.slice(8))}일</time>{game.status==='completed'&&game.score[0]===game.score[1]&&' · 12이닝 무승부 · 추첨 진출'}</footer>
              </article>):<article className={`national-match-card${final?' medal-gold':''}`}><header><div><span>{final?'CHAMPIONSHIP':'KNOCKOUT'}</span><h4>{label}</h4></div></header><div className="national-match-teams"><div><span>진출 학교 미정</span><b>—</b></div><div><span>진출 학교 미정</span><b>—</b></div></div><footer>앞 라운드 종료 후 대진 확정</footer></article>}</div>
            </section>;
          })}</div>
        </>}
      </>}
    </div>
  </section>;
}
