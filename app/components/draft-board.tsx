import { scoreText } from "../../lib/display";
import { useMemo } from "react";
import { draftClubs, draftForecast, positionLabel,draftRoleLabel } from "../../lib/sim/engine";
import type { DraftPick, GameState } from "../../lib/sim/types";

export function DraftForecast({ state }: { state: GameState }) {
  const forecast = useMemo(() => draftForecast(state), [state]);
  const players = new Map(state.players.map(p => [p.id, p]));
  return <div className="draft-forecast">
    <p className="draft-board-note">{state.calendar.seasonYear}년 고3 선수의 현재 평판·재능·구단 적합도를 반영한 예상입니다. 시즌 진행에 따라 달라집니다.</p>
    <div className="table-scroll"><table aria-label={`${state.calendar.seasonYear}년 예상 드래프트 TOP10`}>
      <thead><tr><th scope="col">예상 순위</th><th scope="col">선수</th><th scope="col">예상 구단</th><th scope="col">평판</th><th scope="col">평가</th></tr></thead>
      <tbody>{forecast.map(pick => <tr className={pick.playerId === state.playerId ? "my-player-row" : ""} key={pick.playerId}>
        <th scope="row">{pick.overall}</th><td><b>{pick.playerName}</b><span className="table-school">{pick.teamName} · {positionLabel(players.get(pick.playerId)!)}</span></td>
        <td>{pick.club}</td><td>{scoreText(pick.reputation)}</td><td><b>{scoreText(pick.score)}</b></td>
      </tr>)}</tbody>
    </table></div>
    {!forecast.length && <p className="empty-note">올해 지명 대상인 고3 선수가 없습니다.</p>}
    <p className="draft-board-note">평판 80% · 재능 10% · 적합도 10% · 예상 조회는 실제 지명 결과를 확정하지 않습니다.</p>
  </div>;
}

export function DraftRoundTable({ picks, playerId, year, onSelect }: { picks: DraftPick[]; playerId: string; year: number; onSelect: (pick: DraftPick) => void }) {
  // Older in-memory results lacked round/slot. Their full ten-pick rounds can
  // still be displayed after a development update without regenerating them.
  const entries = picks.map(pick => ({ ...pick, round: pick.round ?? Math.floor((pick.overall - 1) / 10) + 1, slot: pick.slot ?? (pick.overall - 1) % 10 + 1 }));
  // Read the draw from the saved picks, including archived pre-shuffle results.
  const assigned:(string|undefined)[]=Array(10).fill(undefined);
  for(const pick of entries)if(!assigned[pick.slot-1]&&!assigned.includes(pick.club))assigned[pick.slot-1]=pick.club;
  const unused=draftClubs.filter(club=>!assigned.includes(club));
  const clubs=assigned.map(club=>club??unused.shift()!);
  const cells = new Map(entries.map(pick => [`${pick.round}:${pick.slot}`, pick]));
  const counts = clubs.map((_, i) => entries.filter(pick => pick.slot === i + 1).length);
  const rounds = Math.max(10, ...entries.map(pick => pick.round));
  return <>
    <p className="draft-board-note">총 <b>{picks.length}명 지명</b> · {draftClubs.length}개 구단 · 선수 이름을 누르면 지명 평가를 확인할 수 있습니다.</p>
    <div className="table-scroll draft-round-scroll" role="region" aria-label={`${year}년 라운드별 드래프트 결과`} tabIndex={0}>
      <table className="draft-round-table">
        <thead><tr><th scope="col" className="draft-axis"><span>순번 →</span><b>라운드 ↓</b></th>{clubs.map((club, index) => <th key={club} scope="col"><strong>{index + 1}</strong><span>{club}</span><small>{counts[index]}명 지명</small></th>)}</tr></thead>
        <tbody>{Array.from({ length: rounds }, (_, index) => index + 1).map(round => <tr key={round}>
          <th scope="row">{round}라운드</th>{clubs.map((club, index) => {
            const pick = cells.get(`${round}:${index + 1}`);
            return <td key={club} className={pick ? pick.playerId === playerId ? "draft-cell-my" : "" : "draft-cell-ended"}>
              {pick ? <button onClick={() => onSelect(pick)} aria-label={`${club} ${round}라운드 ${index + 1}순번, 전체 ${pick.overall}순위 ${pick.playerName} 지명 평가 보기`}>
                <small>전체 {pick.overall}순위</small><b>{pick.playerName}</b><span>{pick.teamName}</span><em>{draftRoleLabel(pick.role)}</em>
              </button> : <span>지명 종료</span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="draft-board-note">구단별 9~13라운드까지 지명하며, 매년 전체 지명 인원은 90~110명 사이에서 결정됩니다.</p>
  </>;
}
