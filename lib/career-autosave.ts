import { CareerSaveQueue } from "./latest-save-queue";
import type { GameState } from "./sim/types";
import {StateTransferCache} from "./sim/state-transfer";
import {SaveWorkerClient,SaveWorkerUnavailableError} from "./save-worker-client";

let transfer = new StateTransferCache();
let useDirectStorage=false;
const client=new SaveWorkerClient(()=>new Worker(new URL("./career-save-worker.ts",import.meta.url)));
const queue = new CareerSaveQueue(async job=>{
  if(!useDirectStorage){
    try{await client.request(()=>"deleteId" in job?{deleteId:job.deleteId}:{manual:job.manual,...transfer.encode(job.state)});return;}
    catch(error){transfer=new StateTransferCache();if(!(error instanceof SaveWorkerUnavailableError))throw error;useDirectStorage=true;}
  }
  // Keep the same serialized queue for saves and deletion. Fall back only after
  // a worker transport failure; storage errors still reach the user unchanged.
  const storage=await import("./career-save");
  if("deleteId" in job)await storage.deleteCareerSave(job.deleteId);
  else await storage.queueCareerAutoSave(job.state,job.manual);
});

export function saveCareerInBackground(state: GameState,manual=false) {
  return queue.save(state,manual);
}

// A deletion supersedes queued saves for this career and waits for an in-flight
// write, so an older autosave cannot recreate the deleted slot afterward.
export function deleteCareerInBackground(id:string){return queue.delete(id);}

