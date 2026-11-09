import { advanceWeekInPlace } from "./week-engine";
import type { GameState, Policy, Stance } from "./types";
import {advanceUnattachedMonth} from "./pro-season";
import {StateTransferCache} from "./state-transfer";
let retainedState: GameState | undefined;
let transfer = new StateTransferCache();
self.onmessage = (event: MessageEvent<{
  requestId: number;
  state?: GameState;
  policy: Policy;
  stance: Stance;
  span?:"month";
}>) => {
  const {
    requestId,
    state: incomingState,
    policy,
    stance
  } = event.data;
  const start = performance.now();
  try {
    if (incomingState) transfer = new StateTransferCache();
    const state = incomingState ?? retainedState;
    retainedState = undefined;
    if (!state) throw new Error("진행할 커리어 상태를 찾을 수 없습니다. 다시 시도해 주세요.");
    const result = event.data.span==="month"&&state.players.find(p=>p.id===state.playerId)?.professional?.employment==="freeAgent"?advanceUnattachedMonth(state,s=>advanceWeekInPlace(s,policy,stance)):advanceWeekInPlace(state, policy, stance);
    if (result.report) result.report.processingMs = performance.now() - start;
    retainedState = result;
    const outgoing = transfer.encode(result);
    self.postMessage({
      requestId,
      result: outgoing.state,
      reusedHistories: outgoing.reusedHistories,
      gameOrder: outgoing.gameOrder,
    });
  } catch (error) {
    retainedState = undefined;
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : "주간 계산에 실패했습니다."
    });
  }
};
