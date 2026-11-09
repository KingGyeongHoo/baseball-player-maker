import type { GameState } from "./types";
import {StateTransferCache} from "./state-transfer";

// A result already lives in its worker. Only edits, loads and new workers need
// another full snapshot. Consume the token before sending, so errors retry with
// the UI's last committed state rather than a partially computed worker state.
const snapshots = new WeakMap<object, GameState>();
const transfers = new WeakMap<object, StateTransferCache>();
export function workerStateInput(worker: object, state: GameState): GameState | undefined {
  const retained = snapshots.get(worker) === state;
  snapshots.delete(worker);
  return retained ? undefined : state;
}
export function rememberWorkerState(worker: object, state: GameState) {
  snapshots.set(worker, state);
}
export function restoreWorkerState(worker: object, state: GameState, reusedHistories: string[] = [], gameOrder?: string[]) {
  let transfer = transfers.get(worker);
  if (!transfer) { transfer = new StateTransferCache(); transfers.set(worker, transfer); }
  const restored = transfer.decode({state,reusedHistories,gameOrder});
  rememberWorkerState(worker, restored);
  return restored;
}
