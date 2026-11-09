import { queueCareerAutoSave } from "./career-save";
import {StateTransferCache, type StateTransfer} from "./sim/state-transfer";
const transfer = new StateTransferCache();

self.onmessage = (event: MessageEvent<StateTransfer & { id: number }>) => {
  const { id } = event.data;
  const state = transfer.decode(event.data);
  void queueCareerAutoSave(state).then(
    () => self.postMessage({ id }),
    error => self.postMessage({ id, error: error instanceof Error ? error.message : "자동 저장에 실패했습니다." }),
  );
};
