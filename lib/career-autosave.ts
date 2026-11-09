import { LatestSaveQueue } from "./latest-save-queue";
import type { GameState } from "./sim/types";
import {StateTransferCache} from "./sim/state-transfer";

let worker: Worker | undefined;
let sequence = 0;
let transfer = new StateTransferCache();
const queue = new LatestSaveQueue<GameState>(state => new Promise<void>((resolve, reject) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const fail = (error: unknown) => {
    clearTimeout(timeout);
    worker?.terminate();
    worker = undefined;
    transfer = new StateTransferCache();
    reject(error);
  };
  try {
    worker ??= new Worker(new URL("./career-save-worker.ts", import.meta.url));
    const current = worker, id = ++sequence;
    current.onmessage = (event: MessageEvent<{ id: number; error?: string }>) => {
      if (event.data.id !== id) return;
      clearTimeout(timeout);
      if (event.data.error) fail(new Error(event.data.error)); else resolve();
    };
    current.onerror = () => fail(new Error("자동 저장에 실패했습니다. 현재 플레이는 유지됩니다."));
    current.onmessageerror = () => fail(new Error("자동 저장 데이터 전송에 실패했습니다."));
    timeout = setTimeout(() => fail(new Error("자동 저장 시간이 초과되었습니다. 현재 플레이는 유지됩니다.")), 30000);
    current.postMessage({ id, ...transfer.encode(state) });
  } catch (error) { fail(error); }
}));

export function saveCareerInBackground(state: GameState) {
  return queue.enqueue(`${state.seed}:${state.playerId}`, state);
}
