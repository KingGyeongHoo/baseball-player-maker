import { deleteCareerSave,queueCareerAutoSave } from "./career-save";
import {StateTransferCache, type StateTransfer} from "./sim/state-transfer";
const transfer = new StateTransferCache();
self.postMessage({type:"ready"});

self.onmessage = (event: MessageEvent<(StateTransfer & {id:number;manual?:boolean})|{id:number;deleteId:string}>) => {
  const { id } = event.data;
  const progress=()=>self.postMessage({id,type:"progress"});
  try{
    const operation="deleteId" in event.data?deleteCareerSave(event.data.deleteId,progress):queueCareerAutoSave(transfer.decode(event.data),event.data.manual,progress);
    void operation.then(
      () => self.postMessage({ id }),
      error => self.postMessage({ id, error: error instanceof Error ? error.message : "자동 저장에 실패했습니다." }),
    );
  }catch(error){self.postMessage({id,error:error instanceof Error?error.message:"자동 저장에 실패했습니다."});}
};
