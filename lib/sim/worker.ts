import { advanceWeek } from "./engine";
import type { GameState, Policy, Stance } from "./types";
import {advanceUnattachedMonth} from "./pro-season";
self.onmessage = (event: MessageEvent<{
  requestId: number;
  state: GameState;
  policy: Policy;
  stance: Stance;
  span?:"month";
}>) => {
  const {
    requestId,
    state,
    policy,
    stance
  } = event.data;
  const start = performance.now();
  try {
    const result = event.data.span==="month"&&state.players.find(p=>p.id===state.playerId)?.professional?.employment==="freeAgent"?advanceUnattachedMonth(state,s=>advanceWeek(s,policy,stance)):advanceWeek(state, policy, stance);
    if (result.report) result.report.processingMs = performance.now() - start;
    self.postMessage({
      requestId,
      result
    });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : "주간 계산에 실패했습니다."
    });
  }
};
