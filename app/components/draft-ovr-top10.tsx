import { scoreText } from "../../lib/display";
import { overall, draftBoard, positionLabel } from "../../lib/sim/engine";
import type { GameState } from "../../lib/sim/types";

export default function DraftOvrTop10({ state }: { state: GameState }) {
  const board = draftBoard(state.players);
  return <div className="draft-top10-content"><p>이번 시즌 지명 대상인 고3 {board.length.toLocaleString()}명 중 대표 OVR(최대 100) 상위 10명입니다. 일반 선수는 주력 분야, 겸업 선수는 투수·타자 평균으로 평가합니다.</p>
    <div className="table-scroll"><table><thead><tr><th>순위</th><th>선수</th><th>포지션</th><th>OVR</th><th>평판</th><th>지명 결과</th></tr></thead><tbody>{board.slice(0, 10).map((player, index) => {
      const pick = state.draft.find(p => p.playerId === player.id);
      return <tr key={player.id} className={player.id === state.playerId ? "selected-row" : ""}><td>{index + 1}</td><td><b>{player.name}</b>{player.id === state.playerId && <span className="position-tag">MY</span>}<span className="table-school">{state.teams[player.teamId].name}</span></td><td>{positionLabel(player)}</td><td><b>{scoreText(overall(player))}</b></td><td>{scoreText(player.reputation) ?? "—"}</td><td>{state.phase === "ended" ? pick ? <>{pick.overall}순위<span className="table-school">{pick.club}</span></> : "미지명" : "지명 전"}</td></tr>;
    })}</tbody></table></div>
  </div>;
}
