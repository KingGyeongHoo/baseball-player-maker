import { draftBoard, ovr, positions } from "../../lib/sim/engine";
import type { GameState } from "../../lib/sim/types";

export default function DraftOvrTop10({ state }: { state: GameState }) {
  const board = draftBoard(state.players);
  return <div className="draft-top10-content"><p>이번 시즌 지명 대상인 고3 {board.length.toLocaleString()}명 중 현재 역할 OVR 상위 10명입니다.</p>
    <div className="table-scroll"><table><thead><tr><th>순위</th><th>선수</th><th>포지션</th><th>OVR</th><th>평판</th><th>지명 결과</th></tr></thead><tbody>{board.slice(0, 10).map((player, index) => {
      const pick = state.draft.find(p => p.playerId === player.id);
      return <tr key={player.id} className={player.id === state.playerId ? "selected-row" : ""}><td>{index + 1}</td><td><b>{player.name}</b>{player.id === state.playerId && <span className="position-tag">MY</span>}<span className="table-school">{state.teams[player.teamId].name}</span></td><td>{positions[player.position]}</td><td><b>{ovr(player).toFixed(1)}</b></td><td>{player.reputation?.toFixed(1) ?? "—"}</td><td>{state.phase === "ended" ? pick ? <>{pick.overall}순위<span className="table-school">{pick.club}</span></> : "미지명" : "지명 전"}</td></tr>;
    })}</tbody></table></div>
  </div>;
}
